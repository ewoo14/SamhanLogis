# 재고이동 확정 수불 반영 수정 보고서

## 1. 표본 직접 실측

실행한 SQL:

```sql
select status, count(*) from stock_transfers group by 1 order by 1;
```

출력 원문:

```text
  status   | count
-----------+-------
 REQUESTED |     3
(1 row)
```

보조 확인:

```text
 stock_transfers | confirmed_transfers | requested_transfers
-----------------+--------------------+-------------------
               3 |                   0 |                  3

 movement_rows | transfer_out_rows | transfer_in_rows
---------------+-------------------+----------------
            47 |                 0 |                0
```

확정 표본은 0건이므로 실데이터 확정 동작은 판정할 수 없었다. 소스에서는
`StockTransferService.confirm()`이 기존에 `t.confirm()`만 호출하고 재고 서비스를 호출하지 않는 것을 확인했다.

## 2. 필터·제약 실측

수불부 물리 변동 필터 원문(`StockLedgerService.isPhysicalMovement()`):

```java
case INBOUND, DEDUCT, TRANSFER_IN, TRANSFER_OUT, ADJUST -> true;
case RESERVE, RELEASE -> false;
```

따라서 `TRANSFER_OUT`/`TRANSFER_IN`은 수불부 API 계산 대상이다.

DB 제약 조회:

```sql
SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid='stock_movements'::regclass
ORDER BY conname;
```

출력 원문:

```text
       conname        | pg_get_constraintdef
----------------------+----------------------
 stock_movements_pkey | PRIMARY KEY (id)
(1 row)
```

`movement_type`은 V1에서 `VARCHAR(20)`이며 CHECK/DB enum 제약은 없었다. 현재와 `main`의 inventory migration 최고 번호는 `V27`이고, 열린 PR `#1198 #1199 #1201 #1202 #1162 #1188 #1180`의 변경 파일에는 inventory migration이 없었다. 새 migration은 만들지 않았다.

## 3. RED 원문

추가한 통합 RED는 실제 권한을 통과한 뒤 다음 상태에서 실패했다.

```text
StockTransferControllerIT > confirm_createsOutboundAndInboundInventoryTogether_andKeepsTotalQuantity() FAILED
    java.util.NoSuchElementException at StockTransferControllerIT.java:220
```

실패 지점은 확정 후 destination balance 조회이며, 기존 `confirm()`이 destination balance/lot/movement를 만들지 않아 발생했다. 첫 실행의 403은 테스트 사용자 ID를 UUID로 보내지 않은 테스트 오류였고, UUID로 보정 후 위 결함 RED를 얻었다.

양방향 기준:

- ①② RED: CONFIRMED 처리 뒤 destination balance가 없어 출고·입고 양쪽 반영과 총량 검증에 도달하지 못했다.
- ④ 보존 기준: 기존 `StockServiceTest.inbound_createsLotAndAddsBalance_andLogsMovement`는 기존 입고 경로가 lot/balance/INBOUND movement를 계속 만드는지 검증한다. 이 테스트는 기존 결함이 아니므로 RED가 아니라 회귀 보호 PASS 기준이다.

## 4. 고른 수단과 이유

`StockService`에 이동 전용 `transfer()`를 추가하고 `StockTransferService.confirm()`에서 호출했다.

- 기존 재고 mutation의 lot/balance/movement 트랜잭션 경계를 재사용한다.
- 한 라인에서 출발 FIFO lot을 차감하고 `TRANSFER_OUT`을 기록한다.
- 같은 트랜잭션에서 도착 lot을 만들고 balance를 가산하며 `TRANSFER_IN`을 기록한다.
- 재고 반영 뒤 상태를 CONFIRMED로 전이한다. 어느 단계라도 예외가 나면 동일 트랜잭션이 롤백되어 상태와 재고가 어긋나지 않는다.
- 이동전표에는 단가·금액을 추가하지 않았다. 도착 lot의 `unit_cost`도 null로 둔다.
- 시리얼 instance, QR, 소급 반영, 이카운트 import 경로는 수정하지 않았다.

## 5. GREEN 원문

핵심 통합 테스트 실행:

```text
.\gradlew.bat :services:inventory-service:test --tests com.samhanair.logis.inventory.it.StockTransferControllerIT.confirm_createsOutboundAndInboundInventoryTogether_andKeepsTotalQuantity --no-daemon

BUILD SUCCESSFUL
1 test completed, 0 failed
```

검증한 결과:

- 출발 balance 10 → 6
- 도착 balance 0 → 4
- 총 balance 10 유지
- `TRANSFER_OUT(-4)`와 `TRANSFER_IN(+4)` 모두 생성
- transfer line에 출고·입고 수량 4와 양쪽 lot ID 기록
- 수불부 계산 테스트에서 이동 출고 4, 이동 입고 4가 각각 행으로 계산됨

## 6. 불변식 보증

| 불변식 | 보증 방법 |
|---|---|
| ① 출고+입고 함께 반영 | `StockService.transfer()`가 각 라인에서 `TRANSFER_OUT`과 `TRANSFER_IN`을 같은 `@Transactional` 흐름에서 생성하고 통합 테스트가 두 유형을 함께 확인한다. |
| ② 총량 불변 | 출발 balance를 차감한 동일 수량을 도착 balance에 가산하며, 통합 테스트가 전후 합계 10을 확인한다. |
| ③ 금액 없음 | 새 금액 필드·계산·전표 금액을 추가하지 않았고 destination lot의 `unit_cost`를 null로 저장한다. |
| ④ 기존 판매·입고 무변화 | 판매 경로는 수정하지 않았고, 기존 inbound 단위 테스트 및 변경 모듈 전량 테스트를 통과시킨다. |
| ⑤ 상태·재고·이력 정합 | 재고 반영과 `t.confirm()`이 동일 트랜잭션 안에 있으며 실패 시 롤백된다. 통합 테스트는 CONFIRMED와 양쪽 재고·movement를 함께 확인한다. |
| ⑥ 수불부 노출 | `StockLedgerService`의 기존 물리 변동 필터가 두 유형을 이미 포함했고, `StockLedgerServiceTest.includesTransferMovementsAsPhysicalRows`가 두 행과 누적 잔량을 확인한다. |

## 7. 전량 테스트 결과

변경 모듈 전체 테스트를 단일 순차 실행했다.

```text
.\gradlew.bat :services:inventory-service:test --no-daemon
```

결과:

```text
BUILD SUCCESSFUL
74 test result XML files; 644 tests, 0 failures, 0 errors, 1 skipped.
```

Testcontainers 기반 IT는 저장소의 `AbstractPostgresIT.DockerAvailableCondition` Linux/비-Docker 스킵 가드를 그대로 사용한다. 병렬 실행하지 않았다.

## 8. 판단이 필요해 남긴 것 / 못 한 것

- 확정 표본이 0건이므로 운영 DB의 기존 CONFIRMED 이동전표에 대한 소급 반영은 하지 않았다.
- 이카운트 이동 import는 요청 범위 밖이므로 그대로 두었다. import 경로는 여전히 실제 재고/movement를 만들지 않는다.
- 한 제품의 가용 lot이 여러 개로 분할된 경우 movement는 FIFO lot별로 기록하지만, 기존 transfer line의 단일 `sourceLotId` 계약에는 첫 FIFO lot만 기록된다. 다중 lot을 한 라인에서 사용자에게 어떻게 표시·추적할지는 별도 업무 결정이 필요하다.
- 시리얼 품목 수불은 PR #1199 범위로 판단하지 않았다.

## 라운드 2

### 계열 sweep 전수표

판정 축은 화면명이 아니라 `확정·저장 후에도 전역 5분 캐시가 남아 즉시 결과를 가리는 mutation 성공 지점`으로 잡았다. 조회 명령과 원문은 다음과 같다.

```powershell
(rg -n "onSuccess" clients/desktop/src/renderer --glob '*.{ts,tsx}' | Measure-Object).Count
```

```text
305
```

```powershell
rg -n "staleTime: 5 \* 60 \* 1000|queryKey: \['inventory-balances'|queryKey: \['inventory-ledger'" clients/desktop/src/renderer
```

```text
clients/desktop/src/renderer\App.tsx:25:      staleTime: 5 * 60 * 1000,
clients/desktop/src/renderer\routes\warehouse\InventoryStockBalancePage.tsx:235:    queryKey: ['inventory-balances', queryWarehouseId, currentPage],
clients/desktop/src/renderer\routes\warehouse\InventoryStockBalancePage.tsx:256:    queryKey: ['inventory-ledger', ledgerProductCode, ledgerRange?.start, ledgerRange?.end],
```

| sweep 대상 | 성공 mutation 원문 | 재고현황/수불부 무효화 | 판정 |
|---|---|---|---|
| 재고이동 상세 | `TransferDetailPage.tsx:156` `transitionTransfer`, `vars.action === 'confirm'` | `inventory-balances`, `inventory-ledger` | 수정 |
| 판매·입고전표 상세 | `SlipDetailPage.tsx:2039` `transitionSlip`, `vars.action === 'ship' || vars.action === 'confirm'` | `inventory-balances`, `inventory-ledger` | 수정 |
| 재고실사 상세 | `InventoryAuditDetailPage.tsx:154` `completeAudit` → 공통 `invalidate()` | `inventory-balances`, `inventory-ledger` | 수정 |
| 실사 신규 등록 | `InventoryAuditFormPage.tsx:54` `createAudit` | `inventory.audits`만 | 제외: snapshot 생성 전 PLANNED 등록 |
| 판매·입고전표 신규 저장 | `SlipFormPage.tsx:2012` `createSlip` | `slips.query`만 | 제외: DRAFT 생성 |
| 매출·매입 회계전표 신규 저장 | 각 form `:62` `create*SlipDraft` | 각 목록만 | 제외: 재고 mutation 아님 |
| 창고 관리 삭제·복구 | `admin/WarehousesPage.tsx:103,115` | warehouse 목록만 | 제외: 창고 메타데이터 mutation |
| 재고 instance 품질 수정 | `InventoryStockBalancePage.tsx:250` | `inventory-instances`만 | 제외: 수량/수불 변동 아님 |

따라서 305건 전체를 무차별 invalidate하지 않고, 실제 물리 재고를 바꾸는 3개 역할 계열만 닫았다. 캐시 정책 자체(`App.tsx`의 5분)는 유지했다.

### RED 원문 — 양방향

라이브 QA의 사용자 경로 RED는 다음이었다.

```text
확정 직후 같은 세션 재고현황:
page.waitForResponse: Timeout 30000ms exceeded while waiting for /inventory/balances
```

동일 결함을 코드 계약으로 고정한 RED 원문은 다음이다.

```text
❯ inventory-mutation-cache.contract.test.ts (3 tests | 1 failed)
× invalidates stock balances and ledger after every physical stock mutation
AssertionError: expected TransferDetailPage.tsx to contain
  queryClient.invalidateQueries({ queryKey: ['inventory-balances'] })
```

양방향 회귀 기준도 재현했다. 기존 라이브 QA 원문은 다음과 같이 핵심 재고 처리와 기존 전표 경로가 PASS였다.

```text
본사창고 5 → 4 · 초월창고 0 → 1 · 총량 5 → 5
TRANSFER_OUT -1 · TRANSFER_IN +1
금액 없음 · 판매·입고전표 경로 정상
```

### 고른 수단과 이유

물리 재고를 실제로 바꾸는 성공 callback에서만 두 query family를 `invalidateQueries`했다.

- 재고이동은 `confirm`일 때만 무효화한다.
- 판매전표는 `ship`, 입고전표와 판매전표 최종 전이는 `confirm`에서 무효화한다.
- 재고실사는 `complete`를 포함한 기존 공통 성공 callback에서 무효화한다.
- query key prefix 무효화이므로 창고·페이지·품목·기간별 세부 key를 모두 포함한다.
- `staleTime`을 0으로 바꾸거나 refetch interval을 추가하지 않았다.

### GREEN 원문

```powershell
npx vitest run --root C:/dev/Samhan-Public/.claude/worktrees/wtransfer/clients/desktop --config C:/dev/Samhan-Public/clients/desktop/vitest.config.ts src/renderer/routes/inventory-mutation-cache.contract.test.ts
```

```text
✓ inventory-mutation-cache.contract.test.ts (3 tests)
Test Files  1 passed (1)
Tests       3 passed (3)
```

### 불변식 ①~⑤ 보증 방법

| 불변식 | 보증 방법 |
|---|---|
| ① 확정 직후 같은 세션 재고현황 갱신 | 재고이동 `confirm` 성공 callback이 `inventory-balances`와 `inventory-ledger` prefix를 즉시 invalidate한다. 활성 query는 재조회된다. |
| ② 같은 형태 전수 종료 | 305개 `onSuccess`를 sweep하고 물리 수량 변이 3계열을 식별했다. 비재고 DRAFT/메타데이터 mutation은 제외 근거를 표에 남겼다. |
| ③ 출발 차감·도착 증가·총량 불변·양쪽 수불·금액 없음 | 라운드 1의 inventory-service 통합 테스트와 라이브 QA PASS 원문을 보존하고, 이번 변경은 프런트 캐시 무효화만 수행한다. |
| ④ 판매·입고전표 경로 보존 | 전표 lifecycle 성공 callback에 조건부 invalidate만 추가했으며, 라운드 1 라이브 QA의 판매·입고 생성 PASS와 기존 inventory-service 전량 결과를 회귀 기준으로 유지한다. |
| ⑤ 캐시 성능 보존 | 전역 5분 `staleTime`과 query key를 유지하고, 성공한 물리 mutation에만 prefix invalidate를 적용했다. |

### 전량 테스트 원문

변경 모듈 전체 desktop 테스트를 1회 실행했다.

```powershell
npx vitest run --root C:/dev/Samhan-Public/.claude/worktrees/wtransfer/clients/desktop --config C:/dev/Samhan-Public/clients/desktop/vitest.config.ts
```

```text
Exit code: 1
기존 환경 결함으로 전체 결과는 실패.
다수 파일: (0 test) import 실패
대표 원문: Error: Cannot find package 'jsdom' imported from ... vitest ...
기존 실패 예: build-output-cjs-interop, EstimatePricingConfigPage, session, inbound-permission-contract
```

변경 계약 테스트는 위 GREEN 원문처럼 3/3 PASS했다. 타입 검증은 worktree에 의존성이 없어 다음 원문으로 중단됐다.

```text
error TS2688: Cannot find type definition file for 'electron'.
error TS2688: Cannot find type definition file for 'node'.
```

### 남긴 것

- 공유 스택은 건드리지 않았다. 브랜치 빌드 재배포도 하지 않았다.
- 이카운트 이동 import, 시리얼, 소급 반영, 다중 lot 단일 `sourceLotId` 정책은 라운드 1과 동일하게 남겼다.
- 판매 상세의 기존 `/accounting/journals/sales-slip-ledger` 400 관측은 이번 변경 범위가 아니므로 유지했다.
- 전체 desktop 테스트의 기존 import/jsdom 및 기존 계약 테스트 실패는 환경/기존 결함으로 남겼고, 변경 계약 테스트의 GREEN과 구분했다.
