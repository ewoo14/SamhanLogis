# PR #1203 재수렴 4차 머지 직전 적대 검증 보고서 (SOL)

- 검증 일자: 2026-08-14 (KST)
- 대상: `fix/stock-transfer-confirm-noop`, 요청 HEAD `6b68bef75`
- PR: #1203
- 판정: **머지 차단(MERGE BLOCKED)**
- 실 사용자 경로 도달 결함: **1건** (`SOL-1203-R4-01`)
- 관측 불가: **0건** — 요청 ①~④를 모두 라이브로 실행했다.
- 제품 코드 수정: 없음. 검증 스펙·실캡처·본 보고서만 생성했다.

## 1. 환경 실측 원문

### 1.1 PR·검증 입력

`gh pr view 1203`으로 PR 본문과 11개 코멘트를 먼저 읽었으며, review thread/review는 비어 있었다. API가 반환한 PR head는 다음과 같았다.

```text
6b68bef75bb7ff7cda4b91a18095167942fedd8e
OPEN
```

직전 보고서 `docs/qa/2026-08-14-1203-reconv3/REPORT.md`와 정본 결정 `docs/decisions/2026-08-14-stock-ledger-modal-spec.md`를 읽고 기대값을 고정했다. 금지된 git 명령은 실행하지 않았다.

### 1.2 RAM

시작/재배포 직후/종료 직전 모두 1.0GB 이상이었다. 종료 직전 원문:

```text
RAM_TOTAL_GB=61.613
RAM_FREE_GB=6.910
```

### 1.3 컨테이너 존재·부재

compose 선언 24개와 실제 running service를 대조했다. 단순히 존재하는 것만 나열하지 않고 없는 것을 계산했다.

```text
DECLARED_COUNT=24
RUNNING_SERVICE_COUNT=23
MISSING=prometheus,nginx
EXTRA=logging-service
accounting-service=running|healthy
api-gateway=running|healthy
arologis-service=running|healthy
auth-service=running|healthy
dashboard-service=running|healthy
dc-config-service=running|healthy
elasticsearch=running|healthy
eureka-server=running|healthy
grafana=running|healthy
groupware-service=running|healthy
inventory-service=running|healthy
logging-service=running|healthy
minio=running|healthy
notification-service=running|healthy
partner-auth-service=running|healthy
partner-order-service=running|healthy
partner-service=running|healthy
postgres=running|healthy
product-service=running|healthy
rabbitmq=running|healthy
redis=running|healthy
slip-service=running|healthy
user-service=running|healthy
```

다른 트랙이 사용하는 `logging-service`, `api-gateway`, `dc-config-service` 등은 재배포하지 않았다.

### 1.4 Gradle 선행 빌드와 제한 재배포

먼저 다음 Gradle 명령을 실행했다.

```text
.\gradlew.bat :services:inventory-service:bootJar :services:accounting-service:bootJar --no-daemon
BUILD SUCCESSFUL in 11s
24 actionable tasks: 24 up-to-date
```

그 다음 `.env.local`을 적용해 `--no-deps`로 두 서비스만 build/recreate했다.

```text
docker compose -f infrastructure/docker-compose.yml -f infrastructure/docker-compose.local-all.yml -f C:\dev\Samhan-Public\infrastructure\docker-compose.local-portfix.yml --env-file infrastructure/.env.local up -d --build --no-deps inventory-service accounting-service
```

재배포된 두 컨테이너 모두 healthy였다. 이미지 생성시각과 컨테이너 내부 jar의 시각·크기·SHA-256 원문:

```text
inventory-service|STATUS=running|HEALTH=healthy|CONTAINER_CREATED=2026-08-14T02:33:13.84293957Z|IMAGE=sha256:50bda663d57364a08226039cb7f1255f92e3833c4910783015a995beb7ec85f8|IMAGE_CREATED=2026-08-14T02:15:15.325604841Z|JAR=114277716|2026-08-14 11:15:06.000000000 +0900;83618a62a668809cf2d1486fe4f5d6d8c38b33fe4d6b8700f0d083461423eeb4 /app/app.jar
accounting-service|STATUS=running|HEALTH=healthy|CONTAINER_CREATED=2026-08-14T02:33:13.842010226Z|IMAGE=sha256:2eed5dbb60e2cd8ee1649757f9149b6a8f5590905512bd89b13316d370367261|IMAGE_CREATED=2026-08-14T02:23:26.353348779Z|JAR=109643406|2026-08-14 11:23:15.000000000 +0900;3d65fe89ba108c62feccca80348e83a786476fe8c5fb374a00634e16ba8b31f7 /app/app.jar
```

호스트 bootJar와 컨테이너 `/app/app.jar`의 크기와 SHA-256이 각각 정확히 일치했다.

### 1.5 브라우저·실행기

인앱 Browser는 사용하지 않았다. `clients/desktop` 패키지 안에서 로컬 Playwright가 아래 chromium을 직접 launch했고, HashRouter URL(`/#/...`)만 사용했다.

```text
C:\Users\user\AppData\Local\ms-playwright\chromium-1217\chrome-win64\chrome.exe
BASE_URL=http://127.0.0.1:5294
VITE_APP_VERSION=2026/08/14-120304
Running 5 tests using 1 worker
5 passed (11.9s)
```

화면별 고유 제목·상태·전표번호를 먼저 assert한 뒤 캡처했다. 종료 후 Vite PID 53748을 중지했고 다음을 확인했다.

```text
PORT_5294_LISTENERS=0
QA_PROCESS_LEFT=0
```

## 2. ① 회계 코드 정리 정상 경로 및 레거시 호환

### 2.1 회계 화면

로그인 후 각 실제 메뉴 URL에 진입하여 고유 제목과 해당 API HTTP 200을 동시에 확인했다.

| 화면 | URL | API | 결과 |
|---|---|---:|---|
| 현금흐름표 | `/#/accounting/reports/cash-flow` | 200 | 렌더 성공 |
| 자금현황 | `/#/accounting/funds/status` | 200 | 렌더 성공 |
| 수금계획 | `/#/accounting/reports/collection-plans` | 200 | 렌더 성공 |
| 계정별원장 | `/#/accounting/ledgers` | 200 | 렌더 성공 |

실캡처: [현금흐름표](screenshots/12-accounting-cash-flow-real-qa.png), [자금현황](screenshots/12-accounting-funds-status-real-qa.png), [수금계획](screenshots/12-accounting-collection-plan-real-qa.png), [계정별원장](screenshots/12-accounting-general-ledger-real-qa.png)

### 2.2 매출·매입 전표 → 회계 분개

라이브 API로 새 매출·매입 회계전표를 만들고 UI에서 각각 `반영완료(전기)`까지 확인했다.

```json
{"tag":"PR1203-RECONV4-ACCOUNTING-1786675620624","salesNo":"2026/08/14-851","purchaseNo":"2026/08/14-970","salesJournalNo":"2026/08/14-4","purchaseJournalNo":"2026/08/14-5"}
```

- 매출 분개: `1089 / 4019`, POSTED
- 매입 분개: `4511 / 2519`, POSTED
- 결과: 정상 경로 통과
- 실캡처: [매출](screenshots/13-accounting-sales-slip-posted-real-qa.png), [매입](screenshots/13-accounting-purchase-slip-posted-real-qa.png)

### 2.3 레거시 3자리 입력 호환 — 실패

호환 경계를 실제로 밟기 위해 수동 분개 생성 경로에 3자리 `110` 차변과 `401` 대변을 입력했다. 서버는 4자리로 정규화하지 않고 원문 `110`을 곧바로 계정 조회해 404를 반환했다.

```json
{"status":404,"converted":false,"body":{"success":false,"code":"NOT_FOUND","message":"존재하지 않는 계정 코드입니다: 110"}}
```

`AccountEcountMapping`에 3자리 값을 남겨 둔 것만으로 쓰기 호환 경계가 유지되지 않는다. 라이브 분개 쓰기 경로는 변환 전에 입력 코드를 leaf account로 검증한다. 이는 아래 `SOL-1203-R4-01`이다.

## 3. ② 재고실사 완료 재현과 조정행 착지

직전 라운드의 `2026/08/14-8`을 재사용하지 않고 독립적인 신규 실사 `2026/08/14-10`을 만들었다. 실제 품목코드 `0000098`로 수량 차이 +1, 금액 10,000원을 만든 뒤 UI의 완료 버튼을 눌렀다.

```json
{"auditNo":"2026/08/14-10","status":"COMPLETED","totalDiffAmount":10000,"movements":[{"description":"재고 실사 조정 (2026/08/14-10)","inboundQuantity":1,"slipType":"AUDIT"}],"journal":[{"code":"1462","debit":10000,"credit":0},{"code":"9399","debit":0,"credit":10000}],"url":"http://127.0.0.1:5294/#/warehouse/audit/by-number?auditNo=2026%2F08%2F14-10"}
```

DB에서도 다음을 교차 확인했다.

```text
auditNo=2026/08/14-10 | status=COMPLETED | total_diff_amount=10000.00
movement_type=ADJUST | quantity_delta=1 | reference_type=AUDIT
1462 debit=10000 credit=0
9399 debit=0 credit=10000
```

수불부에서 이 `AUDIT` 조정행을 실제 클릭했고 `/#/warehouse/audit/by-number?auditNo=2026%2F08%2F14-10`의 해당 실사 상세로 착지했다. URL·화면 UUID 노출은 0이었다.

실캡처: [완료 상태](screenshots/11-audit-complete-refetched-real-qa.png), [조정행 클릭 후 상세](screenshots/14-audit-adjustment-row-detail-real-qa.png)

## 4. ③ PR 원래 범위 재검증

### 4.1 다섯 계열 상세 착지와 UUID 비공개

수불부 행을 클릭해 목록이 아닌 해당 전표 상세의 고유 번호/상태를 assert했다.

| 계열 | 착지 전표 | 결과 |
|---|---|---|
| 판매 | `2026/08/14-9` | 해당 판매 상세, UUID 0 |
| 입고 | `2026/08/14-2` | 해당 입고 상세, UUID 0 |
| 입고검수 | `2026/08/14-3` | 해당 검수 상세, UUID 0 |
| 이동 | `2026/08/14-15` | 해당 이동 상세, UUID 0 |
| 실사 | `2026/08/14-3` | 해당 실사 상세, UUID 0 |

존재하지 않는 이동·실사 번호도 by-number URL을 유지하며 명시적 오류 화면을 보였다. 캡처 `01-*`, `02-*`가 각 상태의 실캡처다.

### 4.2 이동·판매·입고 mutation 및 수불

공유 DB 재고가 0이어서 첫 이동 확정은 409였고, 정상 입고전표 `2026/08/14-14`로 5개를 보충한 다음 새 이동 `2026/08/14-24`를 확정했다.

```json
{"created":{"transferNo":"2026/08/14-24","salesNo":"2026/08/14-17","inboundNo":"2026/08/14-15","auditNo":"2026/08/14-10"},"inventory":{"beforeSource":8,"afterSource":7,"beforeDestination":7,"afterDestination":8,"totalDelta":0},"transferLedger":[{"slipType":"STOCK_TRANSFER","inbound":0,"outbound":1,"warehouseName":"초월창고 S18"},{"slipType":"STOCK_TRANSFER","inbound":1,"outbound":0,"warehouseName":"본사창고"}]}
```

- 출발 -1, 도착 +1, 총량 변화 0
- 양쪽 `STOCK_TRANSFER` 수불행 존재
- 이동 확정·판매 출고·판매 확정·입고 확정은 mutation 200 뒤 refetch 200이며 최신 상태가 즉시 반영됨
- 실캡처: [이동](screenshots/04-transfer-confirm-refetched-real-qa.png), [판매 출고](screenshots/05-sales-ship-refetched-real-qa.png), [판매 확정](screenshots/06-sales-confirm-refetched-real-qa.png), [입고](screenshots/07-inbound-confirm-refetched-real-qa.png)

### 4.3 수불부 모달·기간·실사 입력 세 경로

- 10열, 전일재고 첫 행, 합계 마지막 행, 합계에서 전일재고 제외, 적요 단일 열 확인
- 기간: `2026-05-14 ~ 2026-08-14`(3개월)
- 1366/1440/1600px 모두 dialog 1320px, table/scroller 1280/1280, 수평 overflow 0
- 실사 입력: 실제 품목코드 `0000098` 200, 기존 UUID 200, 없는 코드 400
- 캡처: [1366](screenshots/03-ledger-1366px-measured-real-qa.png), [1440](screenshots/03-ledger-1440px-measured-real-qa.png), [1600](screenshots/03-ledger-1600px-measured-real-qa.png), [품목코드](screenshots/08-audit-product-code-0000098-real-qa.png), [UUID 호환](screenshots/09-audit-existing-uuid-path-real-qa.png), [없는 코드 거부](screenshots/10-audit-missing-product-code-rejected-real-qa.png)

원래 범위는 위 항목 모두 통과했다.

## 5. ④ 회계 연동 실패 시 원자적 롤백

서비스를 중단하거나 다른 트랙을 방해하지 않고, CLOSED 상태인 2026-04 회계기간을 사용해 실제 accounting-service가 분개를 거부하도록 만들었다. 새 실사 `2026/08/14-14` 완료를 UI에서 실행했고 HTTP 500 및 요구 문구를 직접 확인했다.

```text
회계 연동에 실패했습니다. 실사 완료와 재고 조정이 취소되었습니다. 잠시 후 다시 시도해 주세요.
```

전후 상태를 API와 DB로 비교한 원문:

```json
{"auditNo":"2026/08/14-14","httpStatus":500,"statusBefore":"IN_PROGRESS","statusAfter":"IN_PROGRESS","balanceBefore":8,"balanceAfter":8,"movementRowsBefore":0,"movementRowsAfter":0}
```

- 실사: `IN_PROGRESS` 유지
- 재고: 8 → 8
- 해당 실사 수불행: 0 → 0
- 결론: “취소되었습니다”는 사실이며 부분 커밋 없음
- 실캡처: [회계 실패·롤백](screenshots/15-accounting-failure-atomic-rollback-real-qa.png)

## 6. 도달 가능한 결함 목록

### SOL-1203-R4-01 — 레거시 3자리 회계코드 입력이 4자리로 변환되지 않고 404

- 심각도: **머지 차단**
- 사용자/연동 경로: 수동 분개 생성 입력 경계
- 절차: 차변 `110`, 대변 `401`로 분개 생성 요청
- 기대: V101 매핑에 따라 4자리 정본 코드로 변환 후 정상 처리
- 실제: HTTP 404, `존재하지 않는 계정 코드입니다: 110`
- 영향: 기존 3자리 입력을 보내는 레거시 호출자는 회계 분개를 만들 수 없다. `AccountEcountMapping`의 3자리 유지가 실제 쓰기 호환을 보장한다는 전제가 성립하지 않는다.

그 외 요청 범위에서 실 사용자 경로로 재현 가능한 결함은 발견하지 못했다.

## 7. CI 상태 — 별도 머지 차단 근거

종료 직전 `gh pr checks 1203`은 다음 두 check가 red였다.

```text
JUnit 테스트 결과 (accounting+partner)  fail
빌드 + 테스트 (accounting+partner)       fail (5m52s)
```

실패 로그 원문 요약은 `1929 tests, 4 failed, 10 skipped`이며 실패 항목은 다음이다.

```text
AccountStatementControllerIT > accountCode 지정 시 해당 계정만 반환
AccountStatementControllerIT > 기준일 계정×거래처 잔액과 채권/채무 방향
CollectionPlanControllerIT > 자동 제안: 외상매출금 잔액 + 받을어음 만기 후보 생성
AccountEcountMappingContractTest > undecided_codes_have_no_ecount_value...
```

화면 렌더 200과 CI의 데이터 계약 실패는 서로 대체되지 않는다. 라이브 결함 1건과 별개로 CI red 자체도 머지 불가 사유다.

## 8. 관측 불가·실패 원문 및 판정 제외 사항

관측 불가 항목은 없다. 실행 중 발생했으나 제품 결함으로 세지 않은 원문은 다음과 같다.

```text
POST .../transfers/82f.../confirm
HTTP 409
{"message":"이동 재고 부족: 요청 1, 가용 0"}
```

공유 DB의 해당 창고 가용재고가 0인 환경 상태였다. 정상 입고 경로로 보충 후 신규 이동에서 -1/+1/총량 0을 재현했으므로 결함으로 세지 않았다. 전역 상단에 로컬 업데이트 확인 실패 배너가 있었지만 각 대상 화면의 고유 요소와 API 200을 별도로 단정했으며 이번 PR 범위 결함으로 세지 않았다.

## 9. 공유 DB에 이번 라운드가 만든 것

다른 라운드 데이터와 번호가 충돌할 수 있어 번호뿐 아니라 memo/tag/type으로 식별했다. 삭제하지 않았다.

- 이동전표 `2026/08/14-23`: 첫 시도, RECEIVED 유지(재고 부족 409)
- 이동전표 `2026/08/14-24`: CONFIRMED, 출발/도착 수불 생성
- 입고전표 `2026/08/14-14`: `PR1203-RECONV4-REPLENISH`, CONFIRMED, 5개 보충
- 입고전표 `2026/08/14-15`: 이번 mutation 검증, CONFIRMED
- 판매전표 `2026/08/14-17`: 이번 mutation 검증, CONFIRMED
- 재고실사 `2026/08/14-9`: 첫 mutation 실행 중 이동 409 전에 생성, IN_PROGRESS
- 재고실사 `2026/08/14-10`: 성공 표본, COMPLETED, +1/10,000원
- 재고실사 `2026/08/14-11`~`14`: CLOSED 기간 롤백 반복 표본, 모두 IN_PROGRESS·수불 0 (`-14`가 최종 증거)
- 회계 매출전표 `2026/08/14-851`: POSTED, marker `PR1203-RECONV4-ACCOUNTING-1786675620624`
- 회계 매입전표 `2026/08/14-970`: POSTED, 동일 marker
- 회계 분개 `2026/08/14-3`: 실사 `-10` 연동, DRAFT, 1462/9399
- 회계 분개 `2026/08/14-4`: 매출 정상 경로, POSTED
- 회계 분개 `2026/08/14-5`: 매입 정상 경로, POSTED
- 실패한 3자리 레거시 요청은 분개를 생성하지 않았다.

## 10. 캡처 SHA-256

제출 직전 26개 파일을 직접 다시 해시했다. `COUNT=26`, `DUPLICATE_GROUPS=0`이다. 모두 서로 다른 라이브 상태의 Playwright 원본 캡처이며 합성·복제 PNG는 없다.

```text
95e72b28b2c20c213c9d56a6ea36ba463513e28e6859c27db1b23738f07a5764  01-audit-ledger-row-detail-real-qa.png
bc6d85559e578e07ee83c5717caddd369d883671f5de005594950dba96495aea  01-inbound-ledger-row-detail-real-qa.png
99526a98f934d427646216f93286bd9b4a97eede522e588e54842216ef10fc0c  01-inspection-ledger-row-detail-real-qa.png
7bc133ff42dfcc9641526ddce713d855fa79e6c0341d9f15ca81cd29ab4b3f5e  01-sales-ledger-row-detail-real-qa.png
7da960ea1e4a2757ee19f80dfa7af9a72d18a905c49ae5c982bfc2aa6f3f2887  01-transfer-ledger-row-detail-real-qa.png
27170edd6d9c8460f2e44f823b463e1548f0318005c1755c0bcd0a5265aed452  02-missing-audit-real-qa.png
bc6df9ce8c891a2a127d9d5ca86e9fb42f2af31a598a6014d1a013c99eb919d1  02-missing-transfer-real-qa.png
7720cab4bd4911a74718b91aa4d33bbac723fe7b582aecc537709859e95034bc  03-ledger-1366px-measured-real-qa.png
8e0ba76b1fa9e2d74caa223c7a00c528cb68f957ed8a1671771ffe924525dd91  03-ledger-1440px-measured-real-qa.png
0ffe9c262559aa2609570fadae7cd93a5617a762b897a12c9b564e26b5f65b20  03-ledger-1600px-measured-real-qa.png
059909f0819ce79997dbd03e78ef8f755bf19c39d528e0aa29b0c70772c4366b  04-transfer-confirm-refetched-real-qa.png
adeb70c396bf795f0f825e6b3f285f1244ee5e20ba2f1462fe4de1e338544e0e  05-sales-ship-refetched-real-qa.png
8c561b0bcdb1c417a75a26a98f71de6ffe00a3b3fd405eb181511def3b1a23ff  06-sales-confirm-refetched-real-qa.png
64e02f1e94b42e14acc32bfc8fbb389aac3a98801129155a9ca34259cd88af30  07-inbound-confirm-refetched-real-qa.png
06dd56cde726eb3f7d76721d49bf3d2fd53a3353547cfab7ee4c7fef0c6c0a52  08-audit-product-code-0000098-real-qa.png
185d777a91b6f74677afd6e1e5f1210c41e5ebe2827cfc5622f8e940cba80ce6  09-audit-existing-uuid-path-real-qa.png
ecc9ab0d631cf9a77f72ac9fe3a345121339b81b4495acf75e6b1f599906ce52  10-audit-missing-product-code-rejected-real-qa.png
32d7a8f15c94e3d59abb76a9ce6a3fa6351ac1854793293e11f672c6153ea4a2  11-audit-complete-refetched-real-qa.png
a741f02d5f0c4a862f8d1cf76f913830cff627dde6e0644f3b88a7ce291ffbf7  12-accounting-cash-flow-real-qa.png
6577a6ba4201373b95d077fc5363b0252590f7594aba04e6c8b8773bdb123eee  12-accounting-collection-plan-real-qa.png
b06bf4d9680efdc3cbc957792b6bc613c13dc6d7602b9418ddb18f12841a7982  12-accounting-funds-status-real-qa.png
287a5fccb25466614ff0ddd332513b84a0ad4199598553f51b57dd779db10c29  12-accounting-general-ledger-real-qa.png
1c874f318d0c9342b4dde51032a31327fb61e451eeb897644d5af8c61ad4190f  13-accounting-purchase-slip-posted-real-qa.png
ed0c53c8f86d828ddd837226e3a24c0f79374c85122129bf4a708e7267bc7691  13-accounting-sales-slip-posted-real-qa.png
ebc0362196eae2c7555dae9d6952ca910b289396a42b9edfcacfec10877e1db0  14-audit-adjustment-row-detail-real-qa.png
b25d5a044ce03204184e18ff02f0b3794d50955fafc085547465a754341eb904  15-accounting-failure-atomic-rollback-real-qa.png
```

## 최종 결론

재고실사 성공·회계 실패 원자적 롤백·원래 PR 범위는 라이브로 통과했다. 그러나 레거시 3자리 회계코드 실제 입력이 변환되지 않는 도달 가능 결함 1건이 있고 accounting CI도 red다. **PR #1203은 현재 머지하면 안 된다.**
