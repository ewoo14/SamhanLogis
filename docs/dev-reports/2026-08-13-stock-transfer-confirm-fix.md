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

## 수불부 전표 링크 단계

### 현황 실측

- 정본 문서: `git show origin/main:docs/decisions/2026-08-14-stock-ledger-modal-spec.md`로 확인했다.
- 참조자료: `.claude/uploads/재고수불부_AP145BNPPHH1.xlsx`가 존재하며 크기는 37,448 bytes다.
- 현재 `StockLedgerModal`은 엑셀본과 같은 9개 기본 열(일자·품목명·품목코드·창고명·거래처명·적요·입고수량·출고수량·재고수량)을 렌더링하지만, 전표번호가 있으면 적요 셀 자체를 버튼으로 바꾸고 있었다. 배송주소 행은 전표번호가 없어 링크가 아니었다.
- 기존 전표 경로는 `getSlipByNumber(slipNo, slipType)`였다. 전표번호로 목록 검색 후 내부 UUID로 상세를 조회하는 기존 경로이므로 새 전표 조회 API를 만들지 않았다.
- 기존 상세 화면 라우트(`/sales/:id`, `/purchases/:id`)는 UUID path를 사용한다. 이번 단계는 이를 URL에 재사용하지 않고 `/sales/by-number?slipNo=...` 또는 `/purchases/by-number?slipNo=...`에서 내부적으로만 상세 UUID를 해석하도록 보완했다.
- 수불부 API `StockLedgerRow.slipType`의 코드 계약은 `INBOUND | OUTBOUND`뿐이다. 이동전표·재고실사 전용 종류는 이 화면 응답에서 확인되지 않았으므로 목적지를 지어내지 않았다.
- 참조 엑셀본은 9열·전표번호 전용 열 없음·금액 열 없음·합계/누계 없음으로 확인했다. 현재 화면의 전일재고 행·합계 행·월초 기본 기간은 기존 표시 보존을 위해 유지했으며, 정본의 미결정 항목으로 남겼다.

### RED 원문 (양방향)

새 계약 테스트를 먼저 추가한 뒤 실행한 원문:

```text
Error: Failed to resolve import "./stockLedgerNavigation"
from "src/renderer/routes/warehouse/StockLedgerModal.test.tsx"
```

이는 전표번호별 opaque 목적지 함수가 아직 없다는 RED였다. 실행 환경에는 처음 `vitest`도 없어 첫 시도는 다음 환경 오류로 막혔다.

```text
Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'vitest'
```

`clients/desktop` 의존성을 `npm ci --ignore-scripts`로 복구한 뒤 위 기능 RED를 확인했다.

양방향 기준은 다음과 같이 잡았다.

- ①~④ RED: 9열+전표번호 열, XL 모달, 전표번호별 판매/입고 목적지 계약이 없었다.
- ⑤ 기존 표시 RED 보호: 기존 테스트의 전일재고·누적잔량·지방 태그·배송주소 비링크 검증을 유지하고, 전표번호가 있어도 적요가 별도 셀에 계속 보이는 회귀 기준을 추가했다.
- ⑥ 오류 표시 기준: opaque 경로의 빈 번호와 조회 실패/권한 실패를 `role="alert"`로 표시하는 경로를 추가했다.

### 고른 수단과 이유

- `Modal size="xl"`과 표의 수평 overflow/minimum width를 적용해 9개 엑셀 열과 추가 전표번호 열을 좁은 기본 모달에서 분리했다.
- 엑셀본 9열은 유지하고, 전표번호만 10번째 전용 열로 추가했다. 적요의 배송주소·지방/야적·할인·계산서 표기를 추측해 분리하지 않았다.
- `stockLedgerSlipDestination()`으로 `OUTBOUND → /sales/by-number`, `INBOUND → /purchases/by-number`를 매핑했다. URL에는 `encodeURIComponent(slipNo)`만 사용한다.
- 클릭 handler는 `setLedgerProductCode(null)`을 먼저 실행한 뒤 `navigate()`한다. 수불부를 닫고 같은 창의 기존 상세 화면으로 이동하며, 모달 위 모달/새 창을 만들지 않는다.
- `StockSlipByNumberPage`가 slipNo로 기존 `getSlipByNumber()`를 호출하고, 성공한 경우에만 기존 `SlipDetailPage`에 내부 `slipId`를 전달한다. UUID는 API path 내부에서만 사용되고 URL에는 없다.
- 조회 실패·권한 실패·전표번호 누락은 사용자에게 한국어 alert를 표시한다.

### GREEN 원문

변경 모듈 테스트:

```powershell
npx vitest run src/renderer/routes/warehouse/StockLedgerModal.test.tsx --config vitest.config.ts
```

```text
✓ src/renderer/routes/warehouse/StockLedgerModal.test.tsx (6 tests)
Test Files  1 passed (1)
Tests       6 passed (6)
```

필수 데스크톱 typecheck:

```powershell
npm run typecheck
```

```text
Exit code: 0
tsc -p tsconfig.node.json --noEmit        PASS
tsc -p tsconfig.web.json --noEmit         PASS
npm run typecheck:real-qa                 51 passed, 0 failed
```

### 불변식 보증 방법

| 불변식 | 보증 방법 |
|---|---|
| ① 엑셀본 9열이 잘리지 않음 | 9개 기본 열을 그대로 유지하고 `size="xl"`, 표 `minWidth: 1180`, 수평 overflow를 적용했다. 테스트가 기본 9열+전표번호 총 10개 header를 확인한다. |
| ② 전표번호 클릭 → 전표 화면, 수불부 닫힘 | 전표번호를 적요와 분리해 전용 버튼으로 렌더링하고 handler에서 ledger state를 null로 만든 뒤 `/sales/by-number` 또는 `/purchases/by-number`로 navigate한다. |
| ③ 전표 종류별 올바른 화면 | 코드로 확인된 종류는 OUTBOUND/INBOUND뿐이며 각각 판매/입고 경로로 매핑했다. 이동/실사는 현재 StockLedgerRow 계약에 없어 만들지 않고 보고한다. |
| ④ URL UUID 금지 | 목적지 함수 테스트가 전표번호 query만 생성하고 UUID 정규식 불일치를 확인한다. 내부 UUID는 `getSlipByNumber` 응답에서 기존 상세 API로 전달될 뿐 URL에 넣지 않는다. |
| ⑤ 기존 표시 무파손 | 기존 전일재고·잔량·지방 태그·배송주소 비링크 테스트를 유지하고, 전표번호가 있어도 적요가 별도 셀에 남는 구조로 변경했다. 금액 열은 추가하지 않았다. |
| ⑥ 이동 대상 없음/권한 없음 표시 | 빈 slipNo는 alert, `getSlipByNumber` 실패는 “전표를 찾을 수 없거나 열람 권한이 없습니다.” alert로 표시한다. |

### typecheck

`clients/desktop`에서 `npm run typecheck`를 실행해 종료 코드 0을 확인했다. 최초에는 design-system `dist/index.d.ts`가 없어 중단됐으나, 해당 저장소가 안내하는 `clients/web/design-system` 의존성 설치 및 build 후 재실행하여 통과했다.

### 남긴 것

- 전일재고 행 포함 여부, 적요를 성격별로 분리할지, 기본 기간을 약 3개월로 바꿀지, 합계/누계 행을 추가할지는 정본 미결정 그대로 남겼다. 현재 동작은 기존 표시 보존을 위해 유지했다.
- 코드에서 확인되지 않은 이동전표·재고실사 링크 목적지는 만들지 않았다. 해당 응답 계약이 정해지면 별도 단계에서 종류별 경로를 추가해야 한다.
- 이카운트 엑셀본에 없는 금액 열은 추가하지 않았다.
- 기존 `StockSlipDetailModal.tsx` 파일은 이번 라운드에서 삭제하지 않았으며, 수불부에서 더 이상 import/render하지 않는다. 삭제 여부는 PM 정리 단계로 남겼다.
## 모달 폭 fix

### RED — 1600px 실제 폭 수치

재수렴 라운드의 실제 Chromium 원문:

```text
viewport=1600x1100
dialogLeft=264, dialogRight=1336
tableScrollWidth=1180, tableClientWidth=1040
firstHeaderLeft=283, lastHeaderRight=1456
```

`scrollWidth > clientWidth`이고 마지막 열 우측이 모달 우측보다 120px 밖이었다. 원인은 디자인 시스템 `size-xl`의 `max-width: 1080px`와 수불부 표의 `minWidth: 1180px` 불일치다. 열 구성은 이카운트 정본 9열에 전표번호를 더한 10열 그대로 보존했다.

### 고른 수단과 이유

공용 `xl`을 전역 확대하지 않고 디자인 시스템에 `xxl`을 추가해 수불부만 `size="xxl"`을 사용하게 했다. `xxl`은 `max-width: 1320px`, `min-width: min(1180px, calc(100vw - 32px))`로 정의했고, 표의 10열·`minWidth: 1180px`·전표번호 링크 동작은 변경하지 않았다. 1440px에서도 모달 내부 콘텐츠 폭이 표 최소 폭을 수용하도록 한 선택이다.

### GREEN — 실제 Chromium 렌더 폭 수치

수정 후 실제 `StockLedgerModal`을 Chromium 1217에 렌더하고 `getBoundingClientRect()` 및 `scrollWidth/clientWidth`를 읽었다. 디자인 시스템 `style.css`와 `tokens.css`를 적용한 원문이다.

```text
viewport=1600x1100
dialogLeft=151.12554931640625, dialogRight=1448.8745727539062
dialogWidth=1297.7490234375
modalBodyClientWidth=1320, modalBodyContentWidth=1280
tableScrollWidth=1280, tableClientWidth=1280
tableRectWidth=1258.4232177734375
lastHeaderRight=1429.211669921875
overflow=false

viewport=1440x1100
dialogLeft=71.1484375, dialogRight=1368.8515625
dialogWidth=1297.703125
modalBodyClientWidth=1320, modalBodyContentWidth=1280
tableScrollWidth=1280, tableClientWidth=1280
tableRectWidth=1258.37890625
lastHeaderRight=1349.189453125
overflow=false
```

1440px에서 10개 헤더 폭은 다음과 같았고 최소는 품목명 `103.28280639648438px`이었다(참고: #1197의 18px 붕괴와 다름).

```text
일자 162.12875366210938
품목명 103.28280639648438
품목코드 126.51187133789062
창고명 103.2828369140625
거래처명 126.5118408203125
적요 126.51190185546875
전표번호 126.51190185546875
입고수량 126.51177978515625
출고수량 126.511962890625
재고수량 126.63427734375
```

### 불변식 보증 및 검증

- ① 1600px: `tableScrollWidth=tableClientWidth=1280`, `overflow=false`, 10열 전체 표시.
- ② 1440px: 동일하게 overflow가 없고 품목명 최소 103.28px로 붕괴하지 않음.
- ③ 열 구성 유지: 일자·품목명·품목코드·창고명·거래처명·적요·전표번호·입고수량·출고수량·재고수량 10열 유지.
- ④ 재수렴 통과 항목은 코드상 건드리지 않음: 캐시 무효화, 이동 -1/+1, 총량 불변, 양쪽 수불부, 금액 없음, 전표번호 클릭 후 모달 닫힘·전표 화면 이동 유지.

```text
npx vitest run src/renderer/routes/warehouse/StockLedgerModal.test.tsx --config vitest.config.ts
1 file passed, 6 tests passed

npm run typecheck
Exit code: 0
typecheck:real-qa 2/2 passed
real-qa-scope 51/51 passed

npm run build (clients/web/design-system)
BUILD SUCCESSFUL
```

### 남긴 것

- 공용 Modal에 `xxl` 크기만 추가하고 수불부 소비처만 적용했다.
- 기존 10열, 표 최소 폭, 링크·캐시·재고 이동 로직은 남겼다.
- 라이브 로그인 재현은 작업트리에 `QA_DEV_DEFAULT_PASSWORD`가 없어 로그인 단계에서 중단되었지만, 실제 컴포넌트·실제 디자인 시스템 CSS를 Chromium에 렌더한 폭 probe로 1600px·1440px 수치를 확보했다.

## 결정 5·6·7 반영

### RED 원문 (양방향)

프런트 합계행 계약을 먼저 추가하고 실행한 원문이다. 새 합계행 test id가 없어 기능 결함으로 실패했고, 기존 7개 테스트는 통과했다.

```text
StockLedgerModal.test.tsx (8 tests | 1 failed)
× 전일재고를 제외한 기간 내 입고·출고 합계만 맨 아래 구분된 합계행에 표시한다
  Unable to find an element by: [data-testid="stock-ledger-total-row"]
✓ 기존 7 tests
```

백엔드 기간 기본값도 테스트를 먼저 고정한 뒤, 기존 월초 기본값으로 되돌려 양방향 RED를 확인했다.

```text
StockLedgerControllerS2bTest > defaultsMissingRangeToRecentThreeMonths() FAILED
java.lang.AssertionError at StockLedgerControllerS2bTest.java:35
2 tests completed, 1 failed
BUILD FAILED
```

### 고른 수단과 이유

- `StockLedgerModal`은 기존 데이터 행 앞에 전일재고 행을 유지하고, 기존 중복 `계` 행은 제거했다. 맨 아래에는 `합계 / 누계` 한 행만 둔다.
- 합계행의 입고·출고 셀은 `openingBalance`가 아니라 API가 기간 거래만 누적한 `totalInbound`·`totalOutbound`를 사용한다. 잔량 셀은 기간 말 누계인 `closingBalance`를 사용한다.
- 합계행은 `data-summary-row="true"`, 연한 청색 배경, 2px 상단 테두리, 굵은 글꼴로 거래 행과 구분했다.
- 결정 6대로 적요는 한 열 그대로 두고 전표번호 전용 열·클릭 동작은 보존했다.
- 기간 기본값은 화면과 API 양쪽에서 종료일 기준 `minusMonths(3)`으로 통일했다. 화면은 수불부를 새로 열 때 최근 3개월을 명시적으로 요청한다.

### GREEN 원문

```text
npm exec vitest run src/renderer/routes/warehouse/StockLedgerModal.test.tsx --config vitest.config.ts
✓ StockLedgerModal.test.tsx (9 tests)
Test Files  1 passed (1)
Tests       9 passed (9)

.\gradlew.bat :services:inventory-service:test --tests com.samhanair.logis.inventory.web.StockLedgerControllerS2bTest --tests com.samhanair.logis.inventory.service.StockLedgerServiceTest --no-daemon
BUILD SUCCESSFUL
```

### 합계 계산이 맞다는 근거

백엔드 `StockLedgerService`는 기간 밖 물리 변동으로 `opening`을 계산한 뒤, 기간 안의 각 delta만 순회하며 양수 delta를 `totalInbound`, 음수 delta의 절댓값을 `totalOutbound`에 더한다. 따라서 전일재고 81은 합계에 들어가지 않고, 표본의 기간 거래 `+5/-3`은 합계 `입고 5 · 출고 3`, 기말 누계 `83`으로 표시된다. 프런트 회귀 테스트도 합계행에 `5`, `3`, `83`이 있고 `81`은 없음을 확인한다.

### 1600px·1440px 실측 폭

결정 5 반영 후 현재 `xxl` Modal 폭 정의와 수불부 표 최소폭을 실제 Chromium DOM에 다시 렌더하여 `getBoundingClientRect()` 및 `scrollWidth/clientWidth`를 읽었다. 합계행은 폭을 변경하지 않지만, 폭을 재측정한 fresh 원문은 다음과 같다.

```text
viewport=1600
dialogLeft=140, dialogRight=1460, dialogWidth=1320
bodyClientWidth=1320, bodyScrollWidth=1320
tableClientWidth=1280, tableScrollWidth=1280
lastHeaderRight=1440, overflow=false

viewport=1440
dialogLeft=60, dialogRight=1380, dialogWidth=1320
bodyClientWidth=1320, bodyScrollWidth=1320
tableClientWidth=1280, tableScrollWidth=1280
lastHeaderRight=1360, overflow=false
```

### 불변식 ①~⑥ 보증

| 불변식 | 보증 근거 |
|---|---|
| ① 전일재고 맨 위 · 합계 맨 아래 | 모달 행 구성과 회귀 테스트가 전일재고 선행 및 `stock-ledger-total-row`의 `tbody` 마지막 자식임을 확인한다. |
| ② 기간 내 입고 합 · 출고 합 | 서비스의 `totalInbound/totalOutbound` 기간 필터 계산과 `openingBalance` 제외 테스트를 보존한다. |
| ③ 합계행 시각 구분 | 합계행 전용 배경·2px 상단 테두리·굵은 글꼴 및 `data-summary-row`를 적용했다. |
| ④ 최근 3개월 기본값 | 화면 `recentThreeMonthsRange`와 API `endDate.minusMonths(3)` 및 양쪽 테스트가 보증한다. |
| ⑤ 모달 폭 | fresh Chromium 실측에서 1600px·1440px 모두 `tableScrollWidth=tableClientWidth=1280`, `overflow=false`다. |
| ⑥ 직전 단계 회귀 보존 | 9열+전표번호 10열, 전표번호 클릭 이동, 캐시 무효화 계열, 이동 -1/+1, 총량 불변·양쪽 수불·금액 없음은 이번 코드에서 변경하지 않았고 기존 테스트/서비스 테스트를 다시 통과했다. |

### typecheck

```text
npm run typecheck
Exit code: 0
real-QA cleanup scope: 2 passed
real-QA scope: 51 passed, 0 failed
```

### 남긴 것

- 이 단계에서도 이동전표·재고실사 전용 전표 목적지는 `StockLedgerRow` 계약에 없어 지어내지 않았다.
- 공유 스택, PR, 커밋, git 상태는 변경하지 않았다. 커밋은 PM이 대행한다.
- 인앱 Browser 런타임은 이번 세션에 연결되지 않아 로컬 Playwright Chromium 폭 probe로 실측했다. 로그인 기반 라이브 업무 흐름은 새로 수행하지 않았다.
- 월말 날짜가 3개월 전 월의 유효하지 않은 날짜로 넘치지 않도록 `2026-05-31 → 2026-02-28` 경계 테스트도 추가했다.
