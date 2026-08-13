# PR #1203 라이브QA 보고서

- 대상: PR `#1203` / `fix/stock-transfer-confirm-noop`
- HEAD: `73e451ff9ab6f8bc432117e1b5819f0357872719`
- 수행일: 2026-08-13 (Asia/Seoul)
- 판정 축: 실 사용자 경로 도달성
- 결론: **핵심 재고 반영 PASS, 도달 결함 1건, 머지 비권고**

## 1. 환경 원문

### 1.1 대상과 migration 확인

git 명령은 일절 사용하지 않았다. PR과 파일 목록은 읽기 전용 명령 및 작업트리 ref 파일 직접 읽기로 확인했다.

```text
gh pr view 1203 --json headRefOid,files

headRefOid: 73e451ff9ab6f8bc432117e1b5819f0357872719
files:
docs/dev-reports/2026-08-13-stock-transfer-confirm-fix.md
services/inventory-service/src/main/java/com/samhanair/logis/inventory/service/StockService.java
services/inventory-service/src/main/java/com/samhanair/logis/inventory/service/StockTransferService.java
services/inventory-service/src/test/java/com/samhanair/logis/inventory/it/StockTransferControllerIT.java
services/inventory-service/src/test/java/com/samhanair/logis/inventory/service/StockLedgerServiceTest.java
services/inventory-service/src/test/java/com/samhanair/logis/inventory/service/StockTransferServiceTest.java
```

PR 파일 6개 중 migration 파일은 0개다. 공유 스택의 Flyway 제약을 바꾸는 변경이 없음을 직접 확인했다.

### 1.2 빌드·배포 원문

```powershell
.\gradlew.bat :services:inventory-service:bootJar --no-daemon
```

```text
BUILD SUCCESSFUL in 15s
```

```text
services/inventory-service/build/libs/inventory-service.jar
size: 114276407 bytes
SHA-256: 9DBBBED9A5C7C656CC2B17F4620913A0911A50C4493C5277676E317AD3697380
```

worktree에는 `infrastructure/docker-compose.local-portfix.yml`가 없어서 루트 작업트리의 동일 파일을 읽어 다음과 같이 배포했다. `--no-deps`를 유지했다.

```powershell
docker compose -f infrastructure/docker-compose.yml `
  -f infrastructure/docker-compose.local-all.yml `
  -f C:\dev\Samhan-Public\infrastructure\docker-compose.local-portfix.yml `
  up -d --build --no-deps inventory-service
```

기존 container label 결손으로 교체 단계에서 이름 충돌이 발생했다. 정확히 확인한 기존 inventory 컨테이너 1개만 제거한 뒤 같은 이미지로 inventory-service만 재생성했다. postgres·eureka·gateway 등 의존 서비스는 재생성하지 않았다.

```text
STATUS=running
HEALTH=healthy
CREATED=2026-08-13T14:02:35.398846253Z
IMAGE=sha256:89a1fce094d8df1c875aa6a4f619b4f7b0bbab53e1b8011d0c273e63b452813f
IMAGE_CREATED=2026-08-13T14:01:55.066297903Z
IMAGE_SIZE=171386985
```

컨테이너 JAR와 이 브랜치에서 만든 JAR의 해시를 각각 다시 읽었다.

```text
container /app/app.jar:
9dbbbed9a5c7c656cc2b17f4620913a0911a50c4493c5277676e317ad3697380

host branch jar:
9DBBBED9A5C7C656CC2B17F4620913A0911A50C4493C5277676E317AD3697380
```

### 1.3 `confirm()` 바이트코드 재확인

컨테이너 JAR에서 추출한 클래스와 동일 해시의 호스트 클래스에 `javap -c -p`를 적용했다.

```text
public ...TransferDetailResponse confirm(java.util.UUID, java.lang.String);
   6: aload_0
   7: getfield      #174 // Field stockService:.../StockService;
  10: aload_3
  11: aload_2
  12: invokevirtual #178 // Method .../StockService.transfer:(...StockTransfer;Ljava/lang/String;)V
  15: aload_3
  16: aload_2
  17: invokevirtual #184 // Method .../StockTransfer.confirm:(Ljava/lang/String;)V
  24: areturn
```

PR 핵심 호출 `StockService.transfer()`가 실행 JAR에 들어 있음을 확인한 뒤에만 라이브QA를 시작했다.

### 1.4 스택·RAM·브라우저

- compose 기대 서비스: 24개
- 실행 중 `samhan-*`: 22개
- 없는 서비스: `nginx`, `prometheus`
- 실행 서비스는 확인 시 모두 `Up`; inventory-service는 `healthy`
- RAM: 최초 24.682GB, 최종 자동화 성공 직전 25.496GB, 성공 직후 25.003GB, 최종 점검 24.884GB
- 1.0GB 중단 기준에 도달한 적 없음
- 화면: `http://127.0.0.1:5293/#...` 해시 라우터
- 브라우저: 지정된 로컬 Chromium `chromium-1217/chrome-win64/chrome.exe`
- 인증: 로컬 `dev_master`; 토큰·비밀번호는 산출물에 기록하지 않음
- 캡처: 브라우저의 실제 screenshot API만 사용. `docs/qa` 캡처 스크립트는 사용하지 않음

화면 상단의 “업데이트 실패” 배너는 로컬 Vite에서 Electron updater가 없는 환경 관측이며, 재고 API 실패가 아니다. 캡처를 편집하거나 숨기지 않았다.

## 2. 시나리오 1 — 출발 감소·도착 증가

### 절차

1. 재고현황에서 `0000098 한경희 선풍기`의 본사창고와 초월창고 S18 수량을 조회했다.
2. 실제 UI `/#/inventory/transfers/new`에서 본사창고 → 초월창고 S18, 수량 1의 이동전표를 저장했다.
3. 실제 상세 화면에서 승인 → 출고 → 입고 → 확정을 순차 실행했다.
4. 새 브라우저 컨텍스트의 재고현황 화면과 READ ONLY DB 쿼리로 양쪽 수량을 다시 확인했다.

생성 전 화면: [출발 재고 5](screenshots/00-source-balance-before.png), [도착 조회 결과 없음](screenshots/01-destination-balance-before.png)

확정 화면: [이동전표 2026/08/13-1 확정](screenshots/05-transfer-confirmed-detail.png)

확정 후 화면: [출발 재고 4](screenshots/06-source-balance-after.png), [도착 재고 1](screenshots/08-destination-balance-after.png)

### 쿼리 원문과 결과

전체 전 쿼리·원문은 [BEFORE-QUERY.txt](BEFORE-QUERY.txt), 후 쿼리·원문은 [AFTER-QUERY.txt](AFTER-QUERY.txt)에 보존했다.

```text
transfer_no  | status    | source_code | destination_code | requested | shipped | received
2026/08/13-1 | CONFIRMED | HQ-001      | 00003            | 1         | 1       | 1

code   | available_qty | reserved_qty | total_qty
00003  | 1             | 0            | 1
HQ-001 | 3             | 1            | 4
```

결과: **PASS.** 출발 실제재고가 5→4, 도착 실제재고가 0→1로 양쪽 모두 움직였다.

## 3. 시나리오 2 — 총량 불변

### 이동 전후 창고별 재고 + 총량 대조표

| 구분 | 본사창고 가용 | 본사창고 예약 | 본사창고 실제 | 초월창고 S18 실제 | 전체 창고 총량 |
|---|---:|---:|---:|---:|---:|
| 이동 전 | 4 | 1 | 5 | 0 | 5 |
| 이동 후 | 3 | 1 | 4 | 1 | 5 |
| 증감 | -1 | 0 | -1 | +1 | 0 |

```sql
SELECT COALESCE(SUM(b.total_qty),0) AS all_warehouse_total
FROM stock_balances b
JOIN target_product p ON p.product_id=b.product_id
WHERE b.is_deleted=false;
```

```text
이동 전 all_warehouse_total = 5
이동 후 all_warehouse_total = 5
```

결과: **PASS.** 창고 간 이동 전후 총량이 5로 같다.

## 4. 시나리오 3 — 양쪽 재고수불부 출고행·입고행

재고현황에서 품목코드 `0000098`의 수불부를 양쪽 창고에서 실제로 열었다.

- 출발 창고 화면: [본사창고 수불부 출고행](screenshots/07-source-ledger-transfer-out.png)
- 도착 창고 화면: [초월창고 S18 수불부 입고행](screenshots/09-destination-ledger-transfer-in.png)

```sql
SELECT w.code,m.movement_type,m.quantity_delta,m.note
FROM stock_movements m
JOIN warehouses w ON w.id=m.warehouse_id
JOIN stock_transfers t ON t.id=m.reference_id
WHERE t.transfer_no='2026/08/13-1'
ORDER BY m.occurred_at;
```

```text
code   | movement_type | quantity_delta | note
HQ-001 | TRANSFER_OUT  | -1             | 2026/08/13-1
00003  | TRANSFER_IN   |  1             | 2026/08/13-1
```

결과: **PASS.** DB movement 생성에 그치지 않고 양쪽 수불부 화면에 전표번호 `2026/08/13-1`의 출고·입고행이 보였다.

## 5. 시나리오 4 — 이동에 금액 개념 없음

- 생성 화면: [금액 필드·열이 없는 이동전표 폼](screenshots/02-transfer-form-no-amount.png)
- 확정 상세: [수량만 있는 이동전표 상세](screenshots/05-transfer-confirmed-detail.png)
- 브라우저 본문에서 `금액`, `단가`, `원가`, `공급가`, `부가세`, `합계` 부재를 자동 단언했다.
- destination lot의 `unit_cost`도 NULL이었다.

```text
destination_lot_created | destination_lot_qty | destination_unit_cost
t                       | 1                   | NULL
```

결과: **PASS.** 재고실사 메뉴가 아니라 재고이동 생성·상세·수불부만 확인했으며 금액은 나타나지 않았다.

## 6. 시나리오 5 — 기존 판매·입고전표 경로

동일 브라우저·실 API를 통해 판매전표와 입고전표를 각각 1건 저장했다. 두 POST는 201이었고 DRAFT 상세 화면까지 도달했다.

- 판매: [2026/08/13-5 상세](screenshots/10-sales-slip-created.png)
- 입고: [2026/08/13-3 상세](screenshots/11-inbound-slip-created.png)

```text
slip_no       | slip_type | status | memo
2026/08/13-3  | INBOUND   | DRAFT  | PR1203-LIVEQA-1786630806380-INBOUND
2026/08/13-5  | OUTBOUND  | DRAFT  | PR1203-LIVEQA-1786630806380-SALES
```

결과: **생성 경로 PASS.** 판매 상세의 부가 조회 `/accounting/journals/sales-slip-ledger`는 400이었고 화면에 “전잔·후잔을 불러오지 못했습니다”가 표시됐다. 전표 저장·상세 도달은 성공했고, PR 변경 파일에 slip/accounting 코드가 없어 #1203 도달 결함에는 합산하지 않았다. 별도 기존 관측으로 남긴다.

## 7. 도달 결함

### DEFECT-1 — 확정 직후 같은 세션의 재고현황이 5분간 확정 전 캐시를 재사용함

- 심각도: **머지 차단**
- 재현: 확정 전 양쪽 재고현황 조회 → 같은 브라우저에서 이동전표 확정 → 재고현황으로 이동 → 같은 창고 조회
- 실측: 조회 버튼을 눌러도 `/inventory/balances` 요청이 새로 발생하지 않아 응답 대기가 30초 후 timeout. 새 컨텍스트에서는 출발 4·도착 1이 즉시 보임.
- 원인 증거:
  - `App.tsx`: 전역 `staleTime: 5 * 60 * 1000`
  - `InventoryStockBalancePage.tsx`: query key `['inventory-balances', queryWarehouseId, currentPage]`
  - `TransferDetailPage.tsx` 확정 성공 처리: `['transfer', id]`, `['transfers']`만 invalidate하고 `['inventory-balances']`와 `['inventory-ledger']`는 invalidate하지 않음
- 영향: 백엔드 재고와 수불행은 정확해도, 사용자가 확정 직후 핵심 결과 화면에서 변경을 즉시 확인하지 못한다. 새로고침/캐시 만료에 의존하므로 요청된 도달성 기준을 만족하지 않는다.

**도달 결함 합계: 1건.**

## 8. 증거 무결성

- 실제 UI에서 새 이동전표를 생성하고 모든 lifecycle 버튼을 눌렀다. DB 직접 쓰기는 하지 않았다.
- 전·후 수량은 화면과 READ ONLY SQL을 교차 확인했다.
- 확정 후 증거 재수집을 위해 자동화를 다시 실행했으므로 `RUN-RESULTS.json`의 `beforeRaw`는 이미 확정 후 값이다. 전후 판정에는 최초 실행 원문을 보존한 `BEFORE-QUERY.txt`와 00/01 화면만 사용했다.
- `RUN-RESULTS.json`의 API 경로에 포함된 내부 UUID는 `<internal-id>`로 치환했다. 화면 본문 UUID 부재도 단언했다.
- 스크린샷은 원본 PNG이며 편집·합성하지 않았다. 진단용 실패 캡처는 최종 증거 폴더에서 제거했다.
- 실행 JAR과 호스트 branch JAR SHA-256이 일치한다.
- 브랜치 빌드를 공유 inventory-service에 올린 상태다. 지시대로 git을 사용해 main으로 되돌리지 않았으며 **PM이 main 기준 빌드로 복구해야 한다.**

## 9. 관측 불가·표본 변경·실패 명령 원문

### 9.1 관측 불가 및 결함 제외

- 최초 후보 `AJ030RXH4BC1`은 DB lot/balance가 있지만 재고현황 API에서 `참조 끊김 / 제품 마스터 없음`으로 나타났다. 제품 마스터와 연결되어 화면에 정상 노출되는 `0000098`로 표본을 변경했다. 이동 결함으로 세지 않았다.
- 이카운트 이동 import, 시리얼 축, 소급 반영, 다중 lot 단일 `sourceLotId` 정책은 지시된 범위 밖이므로 실행·결함 집계하지 않았다.
- 다른 라운드가 만든 `2026/08/13-*` 전표·창고·거래처·채팅방은 QA 태그로 식별한 아래 3건 외에는 변경하지 않았다.

### 9.2 주요 실패 명령

컨테이너 JAR 복사 실패:

```text
docker cp samhan-inventory-service:/app/app.jar <temp>\app.jar
Error response from daemon: error while creating mount source path
'/run/desktop/mnt/host/c/dev/Samhan-Public/.claude/worktrees/wledger/logs/local-stack':
mkdir .../logs: file exists
java.nio.file.NoSuchFileException: <temp>\app.jar
Error: class not found: com.samhanair.logis.inventory.service.StockTransferService
```

대체: 컨테이너 내부 `unzip -p | base64`로 클래스만 읽고 `javap`했다.

첫 compose 교체 실패:

```text
Error response from daemon: Conflict. The container name "/samhan-inventory-service"
is already in use by container "cc16265...".
```

대체 전 읽기 확인 결과 해당 컨테이너에는 compose `config-hash`와 `container-number` label이 없었다. 정확한 ID 한 개만 제거하고 inventory-service만 `--no-deps`로 재생성했다.

worktree Vite 시작 실패:

```text
clients/desktop/node_modules/.bin/vite.cmd: 파일을 찾을 수 없습니다.
```

PR에 frontend 변경이 없음을 확인하고 의존성이 설치된 루트 frontend를 포트 5293에서 읽기 실행했다.

초기 SQL 열명 실패:

```text
ERROR: column b.total_quantity does not exist
```

스키마를 읽어 `total_qty`, `reserved_qty`, lot `quantity`로 수정했다.

가짜 인증 시도 실패:

```text
actual URL: http://127.0.0.1:5293/#/login
HTTP 401
```

대체: 저장소의 로컬 QA credential resolver로 `dev_master` 실제 로그인을 사용했다.

확정 직후 같은 세션 재고현황:

```text
page.waitForResponse: Timeout 30000ms exceeded while waiting for /inventory/balances
```

이는 DEFECT-1의 실측이다. 새 컨텍스트에서는 GET 200 및 변경 수량을 확인했다.

SSE 캡처 하네스 종료 실패:

```text
route.fetch: Target page, context or browser has been closed
GET /api/v1/slips/<internal-id>/collab/stream
HTTP 200 text/event-stream
```

데이터 쓰기 실패가 아니라 열린 스트림 종료 문제였다. SSE를 일반 fetch와 분리하고 `unrouteAll({behavior:'ignoreErrors'})` 후 재실행해 exit 0을 확인했다. 원 출력에 포함됐던 인증 토큰은 보고서에서 제거했다.

최종 자동화 원문:

```text
Exit code: 0
assertions:
  transferFormNoAmount: true
  transferDetailNoAmount: true
  databaseTransferOutIn: true
  ledgerSourceAndDestinationRows: true
  salesCreatePath: true
  inboundCreatePath: true
finalRamGB: 25.003
```

## 10. 만든 데이터

| 종류 | 식별자 | 상태 | 상세 |
|---|---|---|---|
| 이동전표 | `2026/08/13-1` | CONFIRMED | `PR1203-LIVEQA-1786630806380`, HQ-001→00003, 품목 0000098, 수량 1 |
| 판매전표 | `2026/08/13-5` | DRAFT | `PR1203-LIVEQA-1786630806380-SALES` |
| 입고전표 | `2026/08/13-3` | DRAFT | `PR1203-LIVEQA-1786630806380-INBOUND` |

- 새 창고·제품·거래처·회계전표·채팅방: 0건
- DB 직접 쓰기: 0건
- 중복 재실행 시 위 전표를 조회해 재사용했으며 추가 전표를 만들지 않았다.

## 11. 머지 권고

**머지 비권고.** `confirm()`의 재고 차감·증가, 총량 보존, 양쪽 movement 및 수불부 표시는 모두 실측 통과했다. 그러나 확정 직후 같은 세션의 재고현황이 확정 전 5분 캐시를 재사용하는 도달 결함 1건이 남아 있다. 확정 성공 시 `inventory-balances`와 `inventory-ledger`를 무효화하고, 동일 사용자 흐름에서 새 GET과 양쪽 변경값이 즉시 보이는지 재검증한 뒤 머지하는 것을 권고한다.

라운드 종료 후 공유 스택은 아직 PR 브랜치 inventory-service 빌드다. git 사용 금지 지시로 되돌리지 않았으며 PM 복구가 필요하다.
