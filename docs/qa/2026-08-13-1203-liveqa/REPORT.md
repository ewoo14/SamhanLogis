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

## 재수렴 라운드

### R0. 판정 요약

- 대상: PR `#1203`, `fix/stock-transfer-confirm-noop`, HEAD `509706df2460f5cb7eca022a69b849e3725cd6b8`
- 질문 1·2·3·5·6: **PASS**
- 질문 4: **FAIL** — 이카운트 정본 9열에 전표번호를 더한 10열 표가 모달 안에 한 화면으로 들어오지 않는다.
- 도달 결함: **1건**
- 머지 권고: **비권고**

### R1. 환경 원문

`origin/main`의 live-QA preamble을 읽고, 지정된 로컬 Chromium `chromium-1217`과 실제 Vite/게이트웨이/공유 DB를 사용했다. API interception·mock·DB 직접 쓰기는 사용하지 않았다.

```text
git rev-parse HEAD
509706df2460f5cb7eca022a69b849e3725cd6b8

git branch --show-current
fix/stock-transfer-confirm-noop

git diff --name-only origin/main...HEAD -- services/inventory-service/src/main/resources/db/migration
<출력 없음 — 새 migration 0건>

브라우저: C:\Users\user\AppData\Local\ms-playwright\chromium-1217\chrome-win64\chrome.exe
viewport: 1600x1100
Vite: http://127.0.0.1:5293 → HTTP 200
login: 실제 /api/auth/login HTTP 200, role=MASTER
초기 가용 RAM: 15.929 GB
배포 직후 가용 RAM: 15.774 GB
최종 가용 RAM: 16.642 GB
```

공유 스택의 inventory-service가 처음에는 main JAR였으므로 아래 순서로 브랜치 JAR을 직접 빌드·배포했다. `docker compose --build`가 Gradle을 실행한다고 간주하지 않았다.

```text
.\gradlew.bat :services:inventory-service:bootJar --no-daemon
BUILD SUCCESSFUL in 11s

branch JAR SHA-256
9DBBBED9A5C7C656CC2B17F4620913A0911A50C4493C5277676E317AD3697380

docker compose -f infrastructure/docker-compose.yml \
  -f infrastructure/docker-compose.local-all.yml \
  -f C:\dev\Samhan-Public\infrastructure\docker-compose.local-portfix.yml \
  up -d --build --no-deps inventory-service

docker inspect samhan-inventory-service
created=2026-08-13T20:42:37.38669935Z
image=infrastructure-inventory-service
health=healthy

docker exec samhan-inventory-service sha256sum /app/app.jar
9dbbbed9a5c7c656cc2b17f4620913a0911a50c4493c5277676e317ad3697380  /app/app.jar
```

`samhan-*` 컨테이너 22개가 실행 중이었고 모두 healthy였다. compose 기준 미실행은 `nginx`, `prometheus` 2개였다. **라운드 종료 시점에도 공유 스택 inventory-service에는 브랜치 빌드가 올라가 있다. PM이 main으로 복구해야 한다.**

### R2. 질문 1 — 확정 직후 같은 세션 재고현황

절차:

1. 실제 UI에서 품목 `0000098`, `HQ-001 → 00003`, 수량 1 이동전표 `2026/08/14-4`를 생성했다.
2. 승인·출고·입고를 각각 실제 버튼으로 실행했고 모두 HTTP 200을 확인했다.
3. 확정 전에 같은 브라우저 세션에서 출발·도착 재고현황을 각각 열어 5분 캐시를 채웠다.
4. 같은 세션에서 확정 HTTP 200 후 두 창고 재고현황으로 이동했다.

원문:

```text
approve POST 200
ship POST 200
receive POST 200
confirm POST 200
same-session source GET /inventory/balances 200
same-session destination GET /inventory/balances 200
```

- [확정 완료 화면](screenshots/12-reconv-transfer-confirmed.png)
- [같은 세션 출발 창고 재조회](screenshots/13-reconv-transfer-source-same-session.png)
- [같은 세션 도착 창고 재조회](screenshots/14-reconv-transfer-destination-same-session.png)

결과: **PASS.** 직전 라운드의 “확정 전 캐시가 남아 새 GET이 발생하지 않음”은 재현되지 않았다.

### R3. 질문 2 — 물리 변이 계열 전체

각 경로에서 변이 직전에 재고현황 캐시를 채우고, 변이 성공 직후 같은 브라우저 세션에서 다시 재고현황을 열었다.

| 경로 | 실제 데이터 | 변이 | 변이 응답 | 직후 같은 세션 재고 GET | 증거 |
|---|---|---|---:|---:|---|
| 재고이동 | `2026/08/14-4` | confirm | 200 | 출발 200·도착 200 | [12](screenshots/12-reconv-transfer-confirmed.png), [13](screenshots/13-reconv-transfer-source-same-session.png), [14](screenshots/14-reconv-transfer-destination-same-session.png) |
| 판매전표 | `2026/08/14-2` | ship | 200 | 200 | [15](screenshots/15-reconv-sales-ship-same-session.png) |
| 판매전표 | `2026/08/14-2` | confirm | 200 | 200 | [16](screenshots/16-reconv-sales-confirmed.png) |
| 입고전표 | `2026/08/13-3` INBOUND | confirm | 200 | 200 | [17](screenshots/17-reconv-inbound-confirmed.png) |
| 재고실사 | `2026/08/14-1` | complete | 200 | 200 | [18](screenshots/18-reconv-audit-completed.png) |

재고실사는 `00003`, 품목 `0000098`의 스냅샷 수량 3에 실물수량 4를 입력해 실제 조정 `+1`이 발생하도록 했다.

```text
audit_no     status     warehouse  expected_qty  actual_qty  diff_qty  diff_amount
2026/08/14-1 COMPLETED  00003      3             4           1         0.00
```

계약 테스트도 세 경로(이동·전표·실사)의 `inventory-balances`와 `inventory-ledger` 무효화를 고정한다.

```text
✓ src/renderer/routes/inventory-mutation-cache.contract.test.ts (3 tests)
Test Files  1 passed (1)
Tests       3 passed (3)
```

전역 정책은 그대로다.

```text
clients/desktop/src/renderer/App.tsx:25
staleTime: 5 * 60 * 1000
```

결과: **PASS.** 한 경로만 고친 형태가 아니며, 요청된 물리 변이 계열을 모두 실제 실행했다.

### R4. 질문 3 — 라운드 1 불변식

새 확정건 `2026/08/14-4`의 DB 원문:

```text
transfer_no   status     source  destination  requested  shipped  received
2026/08/14-4  CONFIRMED  HQ-001  00003        1          1        1

warehouse  movement_type  quantity_delta  reference_type  lot_unit_cost
HQ-001     TRANSFER_OUT   -1              STOCK_TRANSFER  11000.00
00003      TRANSFER_IN     1              STOCK_TRANSFER  NULL

movement_count  total_delta  outbound_rows  inbound_rows
2               0            1              1
```

- 출발 차감: **PASS** (`-1`)
- 도착 증가: **PASS** (`+1`)
- 총량 불변: **PASS** (`sum(quantity_delta)=0`)
- 양쪽 수불부 표시: **PASS** — 최신 모달에서 `2026/08/14-4`의 본사창고 출고 1과 초월창고 S18 입고 1을 함께 확인했다.
- 금액 없음: **PASS** — 이동 폼·상세·수불부에 금액/단가/원가/공급가/부가세/합계 열이 없다. 위 `lot_unit_cost`는 기존 lot의 내부 원가 속성이고 이동전표 금액이 아니며, `stock_movements`에는 금액 열 자체가 없다.

- [최신 수불부의 이동 양쪽 행](screenshots/23-reconv-transfer-ledger-both-sides.png)
- [오른쪽 수량 열](screenshots/23-reconv-transfer-ledger-both-sides-right.png)
- 라운드 1 보존 증거: [이동 폼 금액 없음](screenshots/02-transfer-form-no-amount.png), [출발 수불행](screenshots/07-source-ledger-transfer-out.png), [도착 수불행](screenshots/09-destination-ledger-transfer-in.png)

결과: **PASS.** 라운드 1의 다섯 불변식이 계속 성립한다.

### R5. 질문 4 — 이카운트 9열 + 전표번호 열의 한 화면 표시

모달 헤더 원문은 정본과 일치한다.

```text
일자|품목명|품목코드|창고명|거래처명|적요|전표번호|입고수량|출고수량|재고수량
```

그러나 1600×1100에서 실제 기하가 다음과 같았다.

```text
dialogLeft=264, dialogRight=1336
tableScrollWidth=1180, tableClientWidth=1040
firstHeaderLeft=283, lastHeaderRight=1456
```

마지막 열 우측이 모달 우측보다 120px 밖에 있고 `scrollWidth > clientWidth`이므로, 오른쪽 수량 열을 보려면 가로 스크롤해야 한다.

- [모달 최초 표시 — 오른쪽 열 잘림](screenshots/19-reconv-stock-ledger-9-columns.png)
- [가로 스크롤 후 오른쪽 열](screenshots/19-reconv-stock-ledger-9-columns-right.png)

결과: **FAIL, DEFECT-R1.** 열 구성은 맞지만 “엑셀본 9열이 잘리지 않고 들어가는 폭”이라는 정본을 충족하지 않는다.

### R6. 질문 5 — 전표번호 클릭 이동

실제 수불부에 함께 나타난 판매·입고 전표번호를 각각 클릭했다.

```text
2026/08/13-5: modal=closed, hash contains /sales/by-number, 판매전표 상세 heading 확인
2026/08/13-3: modal=closed, hash contains /purchases/by-number, 입고전표 상세 heading 확인
```

- [판매전표 목적지](screenshots/20-reconv-ledger-sales-destination.png)
- [입고 수불부와 전표번호](screenshots/21-reconv-stock-ledger-9-columns-inbound.png)
- [입고전표 목적지](screenshots/22-reconv-ledger-inbound-destination.png)

결과: **PASS.** 두 경우 모두 수불부가 먼저 닫힌 뒤 맞는 전표 화면으로 이동했다. 지시대로 코드 계약이 없는 이동전표·재고실사 링크는 결함으로 세지 않았다. URL과 캡처에 내부 UUID가 노출되지 않았다.

### R7. 질문 6 — 기존 판매·입고전표 경로 회귀

판매 `2026/08/14-2`는 실제 UI에서 저장·전송·접수·처리·출고완료·검수·배송·확정을 순서대로 수행했고 최종 `CONFIRMED`다. 입고 `2026/08/13-3` INBOUND도 저장·전송·접수·처리·출고완료·검수·확정을 수행했고 최종 `CONFIRMED`다. 기존 판매 `2026/08/13-5`도 최종 `CONFIRMED`이며 수불부 OUTBOUND 행과 전표 이동을 확인했다.

```text
slip_no      slip_type  status
2026/08/13-3 INBOUND    CONFIRMED
2026/08/13-5 OUTBOUND   CONFIRMED
2026/08/14-2 OUTBOUND   CONFIRMED

ledger API rows for AJ060MXHNBC1
2026-08-14 | 2026/08/13-5 | OUTBOUND
2026-08-14 | 2026/08/13-3 | INBOUND
```

결과: **PASS.** 판매·입고의 기존 상태 전이, 재고 반영, 수불행, 상세 이동까지 실측했다.

### R8. 자동 검증 원문

```text
npx vitest run src/renderer/routes/inventory-mutation-cache.contract.test.ts --config vitest.config.ts
1 file passed, 3 tests passed

npx vitest run src/renderer/routes/warehouse/StockLedgerModal.test.tsx --config vitest.config.ts
1 file passed, 6 tests passed

npm run typecheck
Exit code: 0
typecheck:real-qa 2/2 passed
real-qa-scope 51/51 passed

.\gradlew.bat :services:inventory-service:test \
  --tests "com.samhanair.logis.inventory.service.StockTransferServiceTest" \
  --tests "com.samhanair.logis.inventory.service.StockLedgerServiceTest" --no-daemon
BUILD SUCCESSFUL in 30s
```

단위 테스트 6건이 통과해도 R5의 실제 1600px 기하 결함은 잡지 못했다. 따라서 자동 테스트 green을 모달 폭 PASS 근거로 사용하지 않았다.

### R9. 도달 결함

#### DEFECT-R1 — 수불부 10열이 모달 한 화면에 들어오지 않음

- 심각도: 사용자 정본 직접 위반
- 재현율: 3/3
- 조건: 1600×1100, Chromium 1217, 실제 데이터가 있는 품목의 수불부 열기
- 실제: 표 가로폭 1180px, 가용폭 1040px, 마지막 열이 모달 밖으로 120px 넘침
- 기대: 엑셀본 9열과 새 전표번호 열 전체가 가로 스크롤 없이 보여야 함

**도달 결함 합계: 1건.** 캐시 재수렴 도달 결함은 0건이며, 새 도달 결함은 모달 폭 1건이다.

### R10. 증거 무결성

- 모든 신규 캡처는 HEAD `509706df2` frontend와 SHA-256 `9dbbbed9...` inventory-service JAR을 대상으로 생성했다.
- 실제 `/api/auth/login`, 실제 API Gateway, 실제 PostgreSQL을 사용했다.
- route interception·응답 조작·mock server·DB INSERT/UPDATE/DELETE: 0건.
- DB 조회에는 UUID를 출력하지 않았고 보고서에도 내부 UUID를 남기지 않았다.
- 캡처 12~23은 원본 PNG다. 제품 코드 수정 없이 검증 하네스만 사용했고, 하네스는 보고서 작성 전에 제거했다.
- 상단의 “업데이트 실패” 배너는 Electron updater가 없는 브라우저 실행 환경의 기존 부가 관측이며, 재고·전표 API 응답을 대체하거나 가리지 않았다.

### R11. 관측 불가 및 실패 명령 원문

최종 질문 1~6 중 관측 불가 항목은 **0건**이다. 다음은 재시도 과정의 실패 원문이며, 성공 근거로 세지 않았다.

저장소 안내 스크립트 부재:

```text
.\scripts\redeploy-service.ps1
The term '.\scripts\redeploy-service.ps1' is not recognized...
```

worktree credential resolver 부재:

```text
QA credential is missing: QA_DEV_DEFAULT_PASSWORD
```

대체: 저장소 루트의 동일 QA resolver를 사용했고 credential 값은 출력하지 않았다.

초기 PostgreSQL 사용자 가정 오류:

```text
psql -U postgres
FATAL: role "postgres" does not exist
```

대체: 스키마 설정의 `samhan` 사용자로 읽기 쿼리만 실행했다.

첫 테스트 경로 오타:

```text
filter: src/renderer/shared/api/inventory-mutation-cache.contract.test.ts
No test files found, exiting with code 1
```

대체: 실제 추적 경로 `src/renderer/routes/inventory-mutation-cache.contract.test.ts`로 실행해 3/3 통과했다.

전표번호 locator의 역할 가정 오류:

```text
locator.click: Timeout 30000ms exceeded.
waiting for getByRole('dialog').getByRole('button', { name: '2026/08/13-5', exact: true })
```

실제 접근성 이름 `전표 2026/08/13-5 열기`를 사용해 판매·입고 이동 모두 재실행했고 exit 0을 얻었다.

판매 복제본의 시리얼 재고 부족:

```text
POST /slips/<internal-id>/accept → HTTP 409
재고 부족 — 가용 인스턴스 0 < 필요 1 (productCode=AJ060MXHNBC1)
```

이는 이미 예약된 시리얼 품목을 복제한 테스트 데이터 문제다. 가용 시리얼 품목 `PC1BWCK3NW`로 새 판매전표 `2026/08/14-2`를 만들고 전체 경로를 통과시켰다. 범위 밖 시리얼 축 결함으로 세지 않았다.

### R12. 만든 데이터

| 종류 | 식별자 | 최종 상태 | 상세 |
|---|---|---|---|
| 이동전표 | `2026/08/14-1` | REQUESTED | `PR1203-RECONV-1786654372176`, 중간 하네스 재시도 |
| 이동전표 | `2026/08/14-2` | REQUESTED | `PR1203-RECONV-1786654439464`, 중간 하네스 재시도 |
| 이동전표 | `2026/08/14-3` | CONFIRMED | `PR1203-RECONV-1786654495787`, HQ-001→00003, 0000098, 수량 1 |
| 이동전표 | `2026/08/14-4` | CONFIRMED | `PR1203-RECONV-1786654576002`, 최종 불변식·같은 세션 검증 |
| 판매전표 | `2026/08/14-1` OUTBOUND | SENT | 기존 전표 복제, AJ060 시리얼 부족으로 accept 409 |
| 판매전표 | `2026/08/14-2` OUTBOUND | CONFIRMED | `PR1203-RECONV-1786655368304-SALES`, PC1BWCK3NW 수량 1 |
| 판매전표 | `2026/08/14-3` OUTBOUND | SENT | `PR1203-RECONV-1786655417810-SALES`, 중간 재시도 |
| 재고실사 | `2026/08/14-1` | COMPLETED | 00003, 0000098, 3→4, 차이 +1 |

기존 데이터 상태 변경:

- `2026/08/13-5` OUTBOUND: DRAFT → CONFIRMED
- `2026/08/13-3` INBOUND: DRAFT → CONFIRMED

새 창고·제품·거래처·마이그레이션: 0건. DB 직접 쓰기: 0건.

### R13. 머지 권고

**머지 비권고.** 직전 라운드의 캐시 결함은 이동 confirm, 판매 ship·confirm, 입고 confirm, 실사 complete 전 경로에서 닫혔고 라운드 1 불변식도 유지된다. 판매·입고 전표번호 이동 역시 통과했다. 그러나 정본이 요구한 “9열 + 전표번호 열을 자르지 않는 XL 모달”이 실제 1600px 화면에서 실패한다. DEFECT-R1을 수정하고 동일 기하·캡처를 재검증한 뒤 머지하는 것을 권고한다.

다시 명시한다: **공유 스택 inventory-service에는 이 라운드에서 만든 브랜치 JAR이 배포되어 있으며, PM의 main 복구가 필요하다.**
