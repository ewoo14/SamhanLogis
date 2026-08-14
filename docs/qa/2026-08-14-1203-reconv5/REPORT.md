# PR #1203 재수렴 5차 머지 직전 최종 적대 검증 보고서 (SOL)

- 검증 일자: 2026-08-14 (KST)
- 대상: `fix/stock-transfer-confirm-noop`, HEAD `c1178a1c2885bce897e7bc83bb46024cc8ed11f1`
- PR: #1203
- 판정: **머지 가능(PASS)**
- 실 사용자 경로 도달 결함: **0건**
- 관측 불가: **0건**
- 제품 코드 수정: 없음. 본 보고서와 실캡처만 생성했다.
- 금지된 git 명령: 실행하지 않았다.

## 1. 환경 실측 원문

### 1.1 PR·정본·직전 보고서

`gh pr view 1203`과 GitHub API로 PR 본문, issue comment 12개, review 0개, inline review comment 0개를 먼저 전부 읽었다. 정본 `docs/decisions/2026-08-14-stock-ledger-modal-spec.md`와 직전 `docs/qa/2026-08-14-1203-reconv4/REPORT.md`를 읽고 기대값을 고정했다.

```text
headRefOid=c1178a1c2885bce897e7bc83bb46024cc8ed11f1
state=OPEN
mergeable=MERGEABLE
CHECK_COUNT=53
NON_SUCCESS=0
```

### 1.2 RAM

시작, 전체 accounting suite 실행 중, 종료 직전 모두 1.0GB 이상이었다.

```text
시작       RAM_TOTAL_GB=61.613  RAM_FREE_GB=4.138
실행 중    RAM_FREE_GB=4.215
종료 직전 RAM_TOTAL_GB=61.613  RAM_FREE_GB=4.110
```

### 1.3 컨테이너 존재·부재

compose 선언과 실제 running 컨테이너의 compose service label을 대조했다. 존재하는 것만 나열하지 않고 부재를 계산했다.

```text
DECLARED_COUNT=24
RUNNING_SERVICE_COUNT=24
MISSING=nginx,prometheus
EXTRA=logging-service,logging-service
```

실행 중 compose service label은 `postgres`, `rabbitmq`, `redis`, `eureka-server`, `api-gateway`, `accounting-service`, `arologis-service`, `inventory-service`, `auth-service`, `dc-config-service`, `elasticsearch`, `groupware-service`, `notification-service`, `partner-order-service`, `partner-service`, `product-service`, `slip-service`, `dashboard-service`, `grafana`, `partner-auth-service`, `user-service`, `minio`, `logging-service` 2개였다. 다른 트랙 서비스는 재배포하지 않았다.

### 1.4 브랜치 bootJar와 제한 재배포

요청한 `scripts/redeploy-service.ps1`은 이 워크트리에 없었다. git 명령 금지 때문에 main 병합은 하지 않고 지시된 fallback을 사용했다.

```text
.\gradlew.bat :services:inventory-service:bootJar :services:accounting-service:bootJar --no-daemon
BUILD SUCCESSFUL in 15s
24 actionable tasks: 2 executed, 22 up-to-date

docker compose -f infrastructure/docker-compose.yml \
  -f infrastructure/docker-compose.local-all.yml \
  -f C:\dev\Samhan-Public\infrastructure\docker-compose.local-portfix.yml \
  --env-file infrastructure/.env.local \
  up -d --build --no-deps inventory-service accounting-service
```

재배포 대상은 정확히 두 서비스였고 둘 다 healthy였다. 이미지 시각, 컨테이너 내부 jar 시각·크기·SHA-256과 호스트 bootJar 일치 원문:

```text
inventory-service
  STATUS=running|HEALTH=healthy
  CONTAINER_CREATED=2026-08-14T03:20:44.827817184Z
  IMAGE=sha256:062918c6152a19d53a3625a1ffc45c02a48ffe5789748b2a7772937d54c5ff59
  IMAGE_CREATED=2026-08-14T02:15:15.325604841Z
  HOST_JAR=114277716|83618a62a668809cf2d1486fe4f5d6d8c38b33fe4d6b8700f0d083461423eeb4
  CONTAINER_JAR=114277716|2026-08-14 11:15:06 +0900|83618a62a668809cf2d1486fe4f5d6d8c38b33fe4d6b8700f0d083461423eeb4

accounting-service
  STATUS=running|HEALTH=healthy
  CONTAINER_CREATED=2026-08-14T03:20:44.827888974Z
  IMAGE=sha256:58430a597df09e9063c88333173a7cb9b15ed825d3f6ffc886083b8936b27d37
  IMAGE_CREATED=2026-08-14T03:20:42.066762966Z
  HOST_JAR=109644480|5a54671954d1e27f80980c27a538e1685a47f3387eb056ddba221837a53fe3cd
  CONTAINER_JAR=109644480|2026-08-14 12:20:20 +0900|5a54671954d1e27f80980c27a538e1685a47f3387eb056ddba221837a53fe3cd
```

### 1.5 브라우저·프로세스

인앱 Browser는 사용하지 않았다. `clients/desktop` 패키지 안의 Playwright가 지정된 로컬 Chromium을 직접 launch했다. 실제 QA는 `vite.config.ts`의 HashRouter 런타임과 `/#/...` URL만 사용했다.

```text
C:\Users\user\AppData\Local\ms-playwright\chromium-1217\chrome-win64\chrome.exe
BASE_URL=http://127.0.0.1:5294
VITE_APP_VERSION=2026/08/14-120305
accounting/rollback 실경로  5 passed (15.8s)
원래 범위 실경로          4 passed (31.5s)
```

각 캡처 전에 해당 화면의 고유 heading/test id, 전표번호 또는 상태를 assert했다. 종료 후 직접 띄운 Vite와 Playwright 브라우저를 정리했다.

```text
PORT_5294_BEFORE=1
STOPPING=56268|node.exe|...vite.js src/renderer --config vite.config.ts --host 127.0.0.1 --port 5294
PORT_5294_LISTENERS=0
QA_PROCESS_LEFT=0
inventory-service=running|healthy
accounting-service=running|healthy
```

## 2. ① 레거시 3자리 입력 전수

### 2.1 변환 선언 24건

수동 분개 생성의 실제 입력 경계 `POST /accounting/journals`에 각 코드를 차변으로 넣고, 생성된 분개 상세의 첫 라인 코드를 다시 조회했다. 24/24가 HTTP 201이고 오변환 0건이었다.

```text
101→1019  102→1039  110→1089  142→2024  146→2054  201→2519
210→2539  220→2559  221→2549  255→2559  260→2954  301→3329
343→3779  401→4019  404→4049  501→4511  801→8029  814→8139
818→8239  819→8249  831→8319  901→9019  919→9399  991→9719
converted=24  mismatches=0
```

생성된 분개는 회계 분개번호 `2026/08/14-9`~`-32`이며 marker는 `PR1203-RECONV5-LEGACY-1786678097563`이다. 마지막 `991→9719`은 UI 상세에서도 `2026/08/14-32`, `9719 법인세등`으로 확인했다. 캡처: [16-legacy-991-to-9719-detail-real-qa.png](screenshots/16-legacy-991-to-9719-detail-real-qa.png)

### 2.2 `221→2549` 정본 근거

주장을 믿지 않고 V101 원문을 직접 확인했다.

```text
V101__unify_legacy_account_codes.sql:126
('2549', '예수금', 'LIABILITY', '2511', TRUE, 2549, ...)

V101__unify_legacy_account_codes.sql:340
('221', '2549', 'MAPPED')
```

라이브 입력 결과도 `2026/08/14-17`, 첫 라인 `2549`로 일치했다.

### 2.3 변환하지 않는 선언 10건

같은 실제 입력 경계에 10개를 모두 넣었다. 10/10 생성되지 않았고, 오류 문구에 사용자가 넣은 코드가 들어 있어 원인을 이해할 수 있었다.

| 입력 | HTTP / code | 사용자 메시지 |
|---|---|---|
| `103` | 404 `NOT_FOUND` | `존재하지 않는 계정 코드입니다: 103` |
| `104` | 404 `NOT_FOUND` | `존재하지 않는 계정 코드입니다: 104` |
| `105` | 404 `NOT_FOUND` | `존재하지 않는 계정 코드입니다: 105` |
| `900` | 400 `INVALID_INPUT` | `통제 계정(parent)에는 분개할 수 없습니다: 900` |
| `114` | 404 `NOT_FOUND` | `존재하지 않는 계정 코드입니다: 114` |
| `120` | 404 `NOT_FOUND` | `존재하지 않는 계정 코드입니다: 120` |
| `141` | 404 `NOT_FOUND` | `존재하지 않는 계정 코드입니다: 141` |
| `148` | 404 `NOT_FOUND` | `존재하지 않는 계정 코드입니다: 148` |
| `163` | 404 `NOT_FOUND` | `존재하지 않는 계정 코드입니다: 163` |
| `230` | 404 `NOT_FOUND` | `존재하지 않는 계정 코드입니다: 230` |

`900`은 V101 변환 대상은 아니지만 현재 DB에서 통제계정으로 식별되므로 404가 아니라 400이다. 변환되지 않고 분개가 생성되지 않으며, 사용자 메시지가 더 구체적이므로 결함으로 세지 않았다.

## 3. ② accounting 테스트 4건과 단언 범위

### 3.1 단언 약화 여부

PR patch와 현재 테스트를 직접 대조했다. 기존 `undecided_codes...`가 잘못 `UNDETERMINED`로 묶었던 `201`, `919`, `142`, `210`, `220`, `255` 여섯 코드는 단순 삭제된 것이 아니다. 새 `every_confirmed_v101_legacy_input_is_normalized_to_its_target`에서 각각 정확한 목표 코드와 함께 다시 단언되며, 이 테스트는 확정 매핑 24개 전부를 exact match한다.

```text
기존 음성 단언: 10코드 × status/null/label
  103 104 105 [201 919 142 210 220 255] 900

현재 음성 단언: 실제 미정 4코드 × status/null/label
  103 104 105 900

현재 양성 단언: 확정 매핑 24코드 × 정확한 정본 코드
  101 ... 221→2549 ... 991→9719
```

따라서 제거된 여섯 값의 보호 범위는 좁아지지 않고 잘못된 음성 단언에서 정확한 양성 단언으로 이동했다. 확정 매핑 보호는 대표 2건(`110/401`)에서 24건 전수로 넓어졌다. V101 매핑표에 없는 `114/120/141/148/163/230`은 `UNDETERMINED`가 아니라 `UNMAPPED`라 이 테스트의 네 코드와 의미가 다르며, 라이브 입력에서 전부 별도로 거부됨을 확인했다.

### 3.2 직전 red 4건

전체 suite XML에서 관련 클래스가 모두 green이었다.

```text
AccountStatementControllerIT       tests=3  failures=0 errors=0 skipped=0
CollectionPlanControllerIT         tests=10 failures=0 errors=0 skipped=0
AccountEcountMappingContractTest   tests=4  failures=0 errors=0 skipped=0
```

직전 실패였던 계정명세서 2건, 수금계획 1건, 매핑 계약 1건은 모두 이 세 클래스에 포함되어 통과했다.

## 4. ③ 전체 accounting suite

구현자가 5분 뒤 중단했던 명령을 timeout으로 끊지 않고 끝까지 실행했다.

```text
.\gradlew.bat :services:accounting-service:test --no-daemon
BUILD SUCCESSFUL in 7m 16s
21 actionable tasks: 1 executed, 20 up-to-date

XML_FILES=238
PARSED=238
TESTS=1931
FAILURES=0
ERRORS=0
SKIPPED=10
```

전체 suite GREEN을 직접 확인했다.

## 5. ④ 회계 정상 경로 회귀

### 5.1 매출·매입 전표 → 회계 분개

직전 라운드가 만든 정상 표본을 실제 API와 UI에서 다시 조회했다.

```text
매출전표 2026/08/14-851  POSTED(반영완료)  분개 2026/08/14-4  1089/4019
매입전표 2026/08/14-970  POSTED(반영완료)  분개 2026/08/14-5  4511/2519
```

캡처: [매출](screenshots/13-accounting-sales-slip-posted-real-qa.png), [매입](screenshots/13-accounting-purchase-slip-posted-real-qa.png)

### 5.2 네 회계 화면

각 화면 고유 요소와 실제 GET 200을 함께 단언했다.

| 화면 | HashRouter URL | API | 결과 |
|---|---|---:|---|
| 현금흐름표 | `/#/accounting/reports/cash-flow` | 200 | PASS |
| 자금현황 | `/#/accounting/funds/status` | 200 | PASS |
| 수금계획 | `/#/accounting/reports/collection-plans` | 200 | PASS |
| 계정별원장 | `/#/accounting/ledgers` | 200 | PASS |

캡처: [현금흐름표](screenshots/12-accounting-cash-flow-real-qa.png), [자금현황](screenshots/12-accounting-funds-status-real-qa.png), [수금계획](screenshots/12-accounting-collection-plan-real-qa.png), [계정별원장](screenshots/12-accounting-general-ledger-real-qa.png)

### 5.3 재고실사 완료·1462/9399·조정행 상세

완료 표본 `2026/08/14-10`을 다시 조회하고 수불부 조정행을 클릭했다.

```text
audit status=COMPLETED  totalDiffAmount=10000
movement slipType=AUDIT  inboundQuantity=1
journal 1462 debit=10000 / 9399 credit=10000
착지 /#/warehouse/audit/by-number?auditNo=2026%2F08%2F14-10
URL·화면 UUID 노출=0
```

캡처: [완료 조정행 상세](screenshots/14-audit-adjustment-row-detail-real-qa.png)

### 5.4 회계 실패 시 원자적 롤백

CLOSED 회계기간 `2026-04-15` 표본 `2026/08/14-16`을 UI에서 완료했다. 실제 accounting-service 거부 뒤 다음을 비교했다.

```text
HTTP=500
message=회계 연동에 실패했습니다. 실사 완료와 재고 조정이 취소되었습니다. 잠시 후 다시 시도해 주세요.
statusBefore=IN_PROGRESS  statusAfter=IN_PROGRESS
balanceBefore=8          balanceAfter=8
movementRowsBefore=0     movementRowsAfter=0
```

실사·재고·수불 부분 커밋은 없었다. 캡처: [회계 실패 원자적 롤백](screenshots/15-accounting-failure-atomic-rollback-real-qa.png)

## 6. ⑤ PR 원래 범위

### 6.1 다섯 계열 상세 착지·UUID 비공개

수불부 행을 실제 클릭하고 각 화면의 고유 heading, 업무번호, 상태/품목 marker를 단언했다.

| 계열 | 착지 | 결과 |
|---|---|---|
| 판매 | `2026/08/14-9` 판매 상세 | PASS |
| 입고 | `2026/08/14-2` 입고 상세 | PASS |
| 입고검수 | `2026/08/14-3` 원 입고 상세 | PASS |
| 이동 | `2026/08/14-15` 이동 상세 | PASS |
| 실사 | `2026/08/14-3` 실사 상세 | PASS |

목록 오착지 0/5, URL·화면 UUID 노출 0/5였다. 없는 이동/실사 번호도 by-number URL을 유지하고 `해당 이동전표를 찾을 수 없습니다.` / `해당 재고 실사를 찾을 수 없습니다.`를 표시했다. 캡처 `01-*`, `02-*`가 각기 다른 실 상태다.

### 6.2 이동 확정·총량·캐시 재GET

새 표본을 생성해 확인했다.

```json
{"created":{"transferNo":"2026/08/14-25","salesNo":"2026/08/14-18","inboundNo":"2026/08/14-16","auditNo":"2026/08/14-17"},"inventory":{"beforeSource":8,"afterSource":7,"beforeDestination":8,"afterDestination":9,"totalDelta":0}}
```

- 이동 확정: 출발 -1, 도착 +1, 총량 변화 0
- 양쪽 `STOCK_TRANSFER` 수불행: 출고 1행, 입고 1행
- 이동 확정, 판매 ship/confirm, 입고 confirm, 실사 complete: mutation 200 뒤 재고 GET 200 및 즉시 반영
- 이동 UI/도메인에 금액 없음 유지

캡처: [이동](screenshots/04-transfer-confirm-refetched-real-qa.png), [판매 ship](screenshots/05-sales-ship-refetched-real-qa.png), [판매 confirm](screenshots/06-sales-confirm-refetched-real-qa.png), [입고 confirm](screenshots/07-inbound-confirm-refetched-real-qa.png), [실사 complete](screenshots/11-audit-complete-refetched-real-qa.png)

### 6.3 수불부 정본·폭

```text
열=10
첫 행=전일재고
마지막 행=합계 / 누계
합계=기간 내 입고·출고만(전일재고 제외)
적요=단일 열
기간=2026-05-14 ~ 2026-08-14 (3개월)

1366px dialog=1320 table=1280/1280 scroller=1280/1280 overflow=0
1440px dialog=1320 table=1280/1280 scroller=1280/1280 overflow=0
1600px dialog=1320 table=1280/1280 scroller=1280/1280 overflow=0
```

캡처: [1366](screenshots/03-ledger-1366px-measured-real-qa.png), [1440](screenshots/03-ledger-1440px-measured-real-qa.png), [1600](screenshots/03-ledger-1600px-measured-real-qa.png)

### 6.4 실사 입력 세 경로

```text
실제 품목코드 0000098  HTTP 200
기존 UUID productId     HTTP 200
없는 품목코드           HTTP 400 + 존재하지 않는 품목코드 명시
```

캡처: [실제 코드](screenshots/08-audit-product-code-0000098-real-qa.png), [UUID 호환](screenshots/09-audit-existing-uuid-path-real-qa.png), [없는 코드 거부](screenshots/10-audit-missing-product-code-rejected-real-qa.png)

## 7. 도달 가능한 결함 목록

**0건.** 요청 ①~⑤의 실 사용자/연동 경로에서 재현 가능한 제품 결함을 찾지 못했다.

## 8. 관측 불가·실행 실패 원문

관측 불가 항목은 **0건**이다. 아래는 실행 중 발생했지만 원인을 고쳐 재실행 완료했으며 제품 결함으로 세지 않은 검증 하네스 실패 원문이다.

### 8.1 잘못 호출한 Electron dev CLI

```text
npm run dev -- --host 127.0.0.1 --port 5294
CACError: Unknown option `--host`
```

프로세스는 즉시 종료됐다. 이후 패키지의 Vite CLI를 직접 사용했다.

### 8.2 첫 Vite 설정 선택 오류

처음 `vite.web.config.ts`를 사용해 BrowserRouter가 활성화됐고, 요청이 금지한 현상대로 `/#/...` 해시가 무시되어 대시보드로 낙착했다.

```text
Running 5 tests using 1 worker
4 failed, 1 passed (2.1m)
Expected: 재고 현황
Received: 대시보드
```

이 실행에서도 라이브 API의 `110/401→1089/4019` 201은 확인됐다. 잘못된 런타임을 종료하고 `vite.config.ts` HashRouter로 다시 실행해 5/5 통과했다. 실패 실행은 캡처 산출물로 채택하지 않았다.

### 8.3 미변환 상태코드 가정 오류

첫 전수 하네스가 미변환 10건을 모두 404로 가정해 `900`에서 중단됐다.

```text
UNMAPPED_BEHAVIOR_MISMATCH
{"input":"900","status":400,"code":"INVALID_INPUT","message":"통제 계정(parent)에는 분개할 수 없습니다: 900"}
```

제품 동작은 이해 가능한 정상 거부였다. 상태를 가정하지 않고 10건을 다시 전수해 10/10 거부와 메시지를 확인했다.

### 8.4 SSE 정리 순서 오류

레거시 상세 캡처 후 첫 inline 실행에서 context를 닫는 동안 SSE `route.fetch`가 남아 `TargetClosedError`가 발생했다. 캡처는 실제 화면이었지만 그 실행을 성공 근거로 쓰지 않고, SSE continue 및 `unrouteAll({ behavior: 'ignoreErrors' })`를 적용해 같은 화면을 다시 캡처하고 exit 0을 받았다.

## 9. 공유 DB에 이번 라운드가 만든 것

삭제하지 않았다. 다른 라운드가 업무 데이터로 오인하지 않도록 번호와 marker를 남긴다.

- 이동전표 `2026/08/14-25`: CONFIRMED, `PR1203-RECONV3-*`, 출발/도착 수불 생성
- 판매전표 `2026/08/14-18`: CONFIRMED, 같은 marker
- 입고전표 `2026/08/14-16`: CONFIRMED, 같은 marker
- 재고실사 `2026/08/14-15`: 첫 BrowserRouter 실패 실행이 생성, IN_PROGRESS
- 재고실사 `2026/08/14-16`: CLOSED 기간 롤백 표본, IN_PROGRESS·수불 0
- 재고실사 `2026/08/14-17`: 정상 표본, COMPLETED
- 회계 분개 `2026/08/14-6`, `-7`: 각각 실제 `110/401→1089/4019` 확인, DRAFT
- 회계 분개 `2026/08/14-8`: 실사 `2026/08/14-17` 연동, `1462/9399`
- 회계 분개 `2026/08/14-9`~`-32`: 레거시 24코드 전수, DRAFT, marker `PR1203-RECONV5-LEGACY-1786678097563`
- 미변환 10코드 요청: 전부 거부되어 분개 생성 없음, marker `PR1203-RECONV5-UNMAPPED-1786678121217`
- 매출·매입 회계전표와 분개는 직전 표본(`-851`, `-970`, 분개 `-4`, `-5`)을 재조회했으므로 신규 생성 없음

## 10. 캡처 SHA-256

제출 직전 27개 파일을 직접 다시 해시했다. `COUNT=27`, `DUPLICATE_GROUPS=0`이다. 합성·복제 PNG는 없고 모두 로컬 Playwright가 실제 화면에서 만든 캡처다.

```text
74e866dc4dd0109826174271ae79c88f0e8ce1ebea32169284e75aabc1d6ba9a  01-audit-ledger-row-detail-real-qa.png
a5c92a15a5d158d5b07763e01e4f87a7b264a8e5464acb371547512c792530c5  01-inbound-ledger-row-detail-real-qa.png
b298c525a1dd2c6926a3416be2238c35256d01e09e5fbe40502b05248de351fd  01-inspection-ledger-row-detail-real-qa.png
b0d6d831f44ae6154b99f4cbdea6efc1bed7637bf2faf9fcd003508dd57dc05a  01-sales-ledger-row-detail-real-qa.png
11862821513647c43d9288b0cff1fe72b5a5bf15f579a99ef6fc9a78866c1176  01-transfer-ledger-row-detail-real-qa.png
3fead4c6897defd2ae55d7b373272a7103426f137360f5213a286b6e957aa32f  02-missing-audit-real-qa.png
3f56f9dc2e52ff42cfed180e378a301167406958c5ce92a1096a2299d68bfa45  02-missing-transfer-real-qa.png
2ca534ab82ee46c9352811349a0112b4d0f6284bd12e3613d56999011027345a  03-ledger-1366px-measured-real-qa.png
500e5c33f2aca8005b84505558f01cbec99a95b2c87a1291dc60e280db343f7d  03-ledger-1440px-measured-real-qa.png
64d232eeaedff86ac62608437b191a7ecdabfa4e66686e8975cacab5ac5c99a7  03-ledger-1600px-measured-real-qa.png
1684fcf2e28c3e93c3a3a30ca2c4a23055026d54904a3a0371a591b03161db7f  04-transfer-confirm-refetched-real-qa.png
4a6526e2696aa1b233c8fc2f3e2af0c01ffed54b45f22dfc6319b65bccc317d4  05-sales-ship-refetched-real-qa.png
2ff15e658787844ee4ac9255f345f873a1074e2aa3ac611a0962da8fae51d469  06-sales-confirm-refetched-real-qa.png
903767e5f40f1bb27208cd249161dcbe83be5f94cf327f356296ca18d6abd6cf  07-inbound-confirm-refetched-real-qa.png
53b9f69c59c04f45c3d62a8e340438b9a657fa197dfa37dde213ba4ecf92f0a1  08-audit-product-code-0000098-real-qa.png
c851d5576330a687fc005d6aac738c0809aba9f8b0dba70fc61c9b7644dc7266  09-audit-existing-uuid-path-real-qa.png
bd7270b6c822d357c71edf2649d4b4e85ba33e45083d513735ccbcb261644dde  10-audit-missing-product-code-rejected-real-qa.png
9efdc60c8f53df8e57da7aac0b62a9121ab48b9f153242e3d34513e194eab8ba  11-audit-complete-refetched-real-qa.png
5e21157e2ba3c52fbb95d7463969e4b892a507b4371116692c3f17ecce7d9820  12-accounting-cash-flow-real-qa.png
901dd5df99534911900ffe7c3a2680ce69fe08f5b8908b79a031bd69f6eae250  12-accounting-collection-plan-real-qa.png
7b99d1efc376bb1db3f8039f1a610e145a7ae6f2e2e93f0d1cca59f52182a10d  12-accounting-funds-status-real-qa.png
d220fd2da03b20451d7d6148292785bb181eb09b634397dac9b3fb21518ff143  12-accounting-general-ledger-real-qa.png
fcf91bf7297ab34ba13efb13bd17cc52baf541f010bfc35f8c0871b6631b741d  13-accounting-purchase-slip-posted-real-qa.png
b11c995c9944e679fb2d4ee6a5134e383c1cebee0cf3e346acbc4ba946281bd1  13-accounting-sales-slip-posted-real-qa.png
fc33e4588e5ce09d4961a895a8c02066b95683af1bb41e028c21fa94ec59ff20  14-audit-adjustment-row-detail-real-qa.png
92a33e9089ebb0f1d321b31dd5db3741f94351db89dd2802c89a0b26a72321e7  15-accounting-failure-atomic-rollback-real-qa.png
77e5eb6fa7138bf6c803c162c598fa4155c745fccd4cb83e7cbcc514a3236056  16-legacy-991-to-9719-detail-real-qa.png
```

## 최종 결론

레거시 24개 변환, 미변환 10개 거부 메시지, 단언 범위, accounting 전체 1,931 tests, 회계 정상·실패 롤백, PR 원래 범위를 모두 실제 입력/API/UI로 확인했다. 도달 가능한 결함과 관측 불가는 각각 0건이고 exact HEAD의 GitHub checks 53개도 전부 SUCCESS다. **PR #1203은 머지 가능하다.**
