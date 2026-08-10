# PR #1154 R13 SOL 5.6 적대검증 재수렴

## 0. 환경 확인

- 워크트리: `C:\dev\Samhan-Public\.claude\worktrees\tpartner`
- 요청문 브랜치: `feat/896-ecount-partner-import`
- **실제 브랜치: `feat/896-partner-master-load`**. 전제가 달랐지만 checkout/수정하지 않았다.
- HEAD: `29e3c20d6e59b53fab2cfe95f3249e74b1544875`
- accounting 라이브 포트: **`28087`** (기존 `8087`, `18087`은 미접촉)
- partner 라이브 포트: `48095`; auth: `8080`
- accounting 배포본: 현재 워크트리에서 `:services:accounting-service:bootJar` 빌드, JAR SHA-256 `E12DFB8CD1EBEEE80C11B0F855A6D96A14EF2ABEB10C34EE701A36F6B94B43BA`, `IMAGE_REVISION=29e3c20d6e59b53fab2cfe95f3249e74b1544875`
- partner 배포본: 컨테이너 `/app/app.jar` SHA-256 `CE1BD9054B7DBEDB94765FF36BBE37229BAB86AB92D095B64B3A94375AF9FF66`이 현 워크트리 JAR와 일치했다. `IMAGE_REVISION` 환경값은 예전 `4dd3848...`로 stale이었지만, 실행 JAR에 `Partner$InvalidImportedCreditLimitException` 클래스와 CSV/XLSX catch table이 모두 존재했다. 즉 R12 fix 없는 배포본은 아니다.
- health: `GET http://127.0.0.1:28087/actuator/health` -> `200 {"status":"UP"}`
- accounting DB: R13에서 새로 만든 격리 PostgreSQL `accounting_r13`; 공유 partner DB 쓰기는 실 관리자 API로만 수행했다.
- 검증 후 R13에서 새로 만든 `sol1154-r13-accounting`, `sol1154-r13-accounting-db`, `sol1154-r13-net`만 삭제했다. 기존/다른 워크트리 컨테이너는 건드리지 않았다.
- 실제 호출 API:
  - `POST http://127.0.0.1:8080/auth/login`
  - `POST http://127.0.0.1:48095/admin/partners/imports/ecount`
  - `DELETE http://127.0.0.1:48095/admin/partners/{partnerCode}`
  - `POST http://127.0.0.1:28087/admin/ecount/reimport/mig-1`
- 금지 코드 `partner_code=1068689215`는 SELECT·fixture·API URL·잠금 모두에서 사용하지 않았다.
- 인증 정보/JWT 원문은 산출물에 저장하지 않았다: `<redacted>`.

## 1. 판정

**실 사용자 경로 도달 결함 1건 + 증거 무결성 차이 1건이다.**

1. **도달 결함:** partner가 준 `INPUT_VALIDATION`을 accounting 실 관리자 응답이 원인/표본 없이 `heldParseFailureRows` 계수에만 합산한다. 실 HTTP에서 `status=PROCESSED_WITH_REJECTIONS`, `heldParseFailureRows=1`, `message=null`, `errors=[]`로 보였다. 사용자는 입력 검증 실패를 파싱 실패라는 필드명으로 보고, `INPUT_VALIDATION`이었다는 정보는 받지 못한다.
2. **증거 무결성:** R12 보고서의 고정 fixture 원문 `imported=2`는 같은 DB에서 재실행했을 때 `imported=0`, staging `UPDATED/UPDATED`로 달랐다. R12 cleanup이 soft delete를 남겨, 재실행이 새 생성이 아닌 복원/갱신으로 계상되는 **셋째 가능성**이 실제 원인이었다. 새 R13 고유 코드에서는 `imported=2`가 재현됐다.

의심한 3-인자 `RemoteImportResult` 생성자를 쓰는 production 경로는 0곳이었고, accounting 실 HTTP에서 인프라 실패 신호는 보존됐다.

## 2. 도달 결함 1 — accounting이 `INPUT_VALIDATION` 원인을 잃고 파싱-실패-명 계수만 노출

### 재현 절차

1. 실 관리자 API로 `SOL1154R13-ACC-NEG`의 여신한도를 `1`로 생성했다.
2. accounting의 raw directory에 앞 정상 / 기존 행 `-1` / 뒤 정상 3행 CSV를 두었다.
3. 로그인 JWT와 사용자 헤더로 `POST :28087/admin/ecount/reimport/mig-1`을 호출했다.
4. partner 직접 응답과 accounting 상위 응답을 비교했다.
5. fixture 3건은 실 관리자 DELETE API로 정리했고 active 0건을 SELECT로 확인했다.

### 응답 원문

partner 직접 응답은 원인을 알려준다.

```json
{
  "totalRows": 3,
  "imported": 2,
  "updated": 0,
  "heldParseFailureRows": 1,
  "heldSample": [{
    "rowNumber": 4,
    "reason": "INPUT_VALIDATION",
    "rawPartnerCode": "SOL1154R13-NEGATIVE",
    "rawName": "R13 음수 검증 기존행"
  }],
  "infrastructureFailureRows": 0,
  "infrastructureFailure": false
}
```

accounting 실 관리자 HTTP에서는 같은 원인이 사라졌다.

```json
{
  "http": 200,
  "heldDetail": {
    "target": "partner",
    "fileName": "거래처-Excel다운로드_R13_HELD.csv",
    "status": "PROCESSED_WITH_REJECTIONS",
    "imported": 2,
    "rejected": 0,
    "message": null,
    "heldParseFailureRows": 1,
    "infrastructureFailureRows": 0,
    "infrastructureFailure": false
  },
  "errors": []
}
```

캡처: `docs/qa/2026-08-09-1154-r13/03-accounting-live-input-validation-label.png`

### 코드 도달선

- `services/partner-service/src/main/java/com/samhanair/logis/partner/service/EcountPartnerImporter.java:216` — 전용 예외를 `INPUT_VALIDATION` held로 계상
- `services/partner-service/src/main/java/com/samhanair/logis/partner/service/EcountPartnerImporter.java:272` — `heldParseFailureRows` + `heldSample`을 partner 응답에 포함
- `services/accounting-service/src/main/java/com/samhanair/logis/accounting/client/EcountRemoteImportClient.java:77` — 건수만 파싱하고 `heldSample.reason`은 파싱하지 않음
- `services/accounting-service/src/main/java/com/samhanair/logis/accounting/client/EcountRemoteImportClient.java:110` — `RemoteImportResult`에 원인/표본 필드가 없음
- `services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/EcountReimportService.java:162` — held가 1이면 `PROCESSED_WITH_REJECTIONS`로만 표시
- `services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/EcountReimportService.java:166` — `message` null과 계수만 `SliceResult`로 전달
- `shared/common/src/main/java/com/samhanair/logis/common/ecount/EcountReimportResult.java:16` — 공개 응답에 `heldParseFailureRows`는 있지만 held 원인/표본은 없음

### 실 데이터 영향 건수

```text
partner_r9 staging INPUT_VALIDATION = 4 rows / 4 partner codes
QA code rows                         = 4
non-QA rows                          = 0
R13 accounting live detail          = 1 row
```

현 DB의 4건은 모두 R12/R13 QA 표본이다. 운영 non-QA 현재 영향은 0건이지만, 앞으로 실 `INPUT_VALIDATION` held가 하나라도 발생하면 같은 관리자 응답에 즉시 도달한다.

## 3. 최우선 ③ — accounting 라이브 인프라 신호 중계

### 재현 절차

1. 현 HEAD accounting JAR를 격리 DB와 빈 포트 `28087`에 기동했다.
2. 기존 정본 `partner_code=01`을 `SELECT ... FOR UPDATE`로 잠귀었다.
3. accounting 실 관리자 `POST /admin/ecount/reimport/mig-1`을 호출했다.
4. 실 partner JDBC가 잠금 대기에 들어간 후 해당 요청 PID만 `pg_terminate_backend`했다. 데이터 INSERT/UPDATE/DELETE SQL은 사용하지 않았다.

### 실 HTTP/로그 원문

```text
LOCKER_PID=9028 BLOCKED_PID=8323 TERMINATED=true
HTTP=200
partner staging=01|PENDING|DB_INFRASTRUCTURE
partner log=MIG-1 import 행 DB 적재 실패 — row=3 partnerCode=01 reason=DB_INFRASTRUCTURE
```

```json
{
  "slice": "mig-1",
  "filesScanned": 1,
  "filesProcessed": 1,
  "filesSkipped": 0,
  "totalImported": 0,
  "totalRejected": 0,
  "details": [{
    "target": "partner",
    "fileName": "거래처-Excel다운로드_R13_INFRA.csv",
    "status": "PROCESSED_WITH_INFRASTRUCTURE_FAILURE",
    "imported": 0,
    "rejected": 0,
    "message": null,
    "heldParseFailureRows": 0,
    "infrastructureFailureRows": 1,
    "infrastructureFailure": true
  }],
  "errors": [{
    "target": "partner",
    "fileName": "거래처-Excel다운로드_R13_INFRA.csv",
    "errorCode": "DB_INFRASTRUCTURE",
    "message": "원격 import 인프라 실패 1건"
  }]
}
```

캡처: `docs/qa/2026-08-09-1154-r13/02-accounting-live-infrastructure-relay.png`

파일/줄:

- `services/accounting-service/src/main/java/com/samhanair/logis/accounting/client/EcountRemoteImportClient.java:77` — 6 필드 parser
- `services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/EcountReimportService.java:153` — 실 원격 import 호출 결과 수신
- `services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/EcountReimportService.java:158` — `DB_INFRASTRUCTURE` error 생성
- `services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/EcountReimportService.java:162` — `PROCESSED_WITH_INFRASTRUCTURE_FAILURE`

영향 건수: 이번 실 요청 1행. `partner_r9` staging에 현재 `DB_INFRASTRUCTURE` 9행/1 partner code가 있으며 모두 반복 QA 잠금 표본이다. R11의 인프라 신호 소실은 실 관리자 accounting HTTP 경로에서 재현되지 않았다.

## 4. ② 생성자 전수 sweep

### `RemoteImportResult`

`new (EcountRemoteImportClient.)?RemoteImportResult(` 전수 결과:

- production 6-인자: 1곳 — `EcountRemoteImportClient.java:77`; 실 partner JSON에서 인프라 3 필드를 읽는 유일 production 생성점
- production 3-인자: **0곳**
- test 3-인자: 3곳 — `EcountReimportServiceTest.java:67`, `:94`, `:121`
- test 6-인자: 1곳 — `EcountReimportServiceTest.java:142`

따라서 호환 3-인자 생성자가 실 사용자 경로에서 신호를 0/false로 만드는 호출부는 없다.

### `SliceResult`

production `new EcountReimportResult.SliceResult(` 7곳:

- 10-인자(신호 보존): 2곳 — `EcountReimportService.java:166`, `:198`
- 7-인자(호환): 5곳 — `:147` hash skip, `:175`/`:180` file exception, `:206`/`:211` command exception

5곳은 실 경로에 도달하지만, 구조화된 `RemoteImportResult`가 반환되기 전의 skip/throw 분기이므로 버릴 인프라 신호 값 자체가 없다. 실 200 partner 응답은 `:166` 10-인자 경로로 갔고, ③에서 1/true를 보존했다.

## 5. ① 전용 예외 경계 라이브

### 음수 여신한도 held + 뒤 행 계속

R13 새 고유 코드로 실 관리자 CSV API를 호출했다.

```text
before active|deleted=0|0
HTTP=200
response.totalRows=3
response.imported=2
response.updated=0
response.heldParseFailureRows=1
response.heldSample[0].reason=INPUT_VALIDATION
database=앞 1|기존 1|뒤 1
staging=PENDING|INPUT_VALIDATION
cleanup HTTP=200 x 3
after active|deleted=0|3
```

캡처: `docs/qa/2026-08-09-1154-r13/00-red-a-input-boundary.png`

파일/줄:

- `services/partner-service/src/main/java/com/samhanair/logis/partner/domain/Partner.java:40` — 전용 예외 타입
- `services/partner-service/src/main/java/com/samhanair/logis/partner/domain/Partner.java:300` — 음수 검증 발생
- `services/partner-service/src/main/java/com/samhanair/logis/partner/service/EcountPartnerImporter.java:216` — CSV 전용 catch
- `services/partner-service/src/main/java/com/samhanair/logis/partner/service/EcountPartnerImporter.java:219` — staging `PENDING/INPUT_VALIDATION`
- `services/partner-service/src/main/java/com/samhanair/logis/partner/service/EcountPartnerImporter.java:334` — XLSX 동일 전용 catch

### 경계 밖 예외 상위 catch

- importer 행 처리 상위에 `catch (Exception)`/`catch (RuntimeException)`으로 행을 held 처리하는 코드는 없다.
- `EcountPartnerImporter.java:476`, `:497`의 `catch (RuntimeException)`은 등록일/최초작성일 파서 내부이며, `:497`은 새 `IllegalArgumentException`을 재던진다.
- controller는 `EcountPartnerImportController.java:61`, `:79`에서 importer 결과를 그대로 반환하며 catch가 없다.
- 경계 밖 `IllegalArgumentException`은 `PartnerExceptionHandler.java:48`에서 held 200이 아닌 HTTP 400 `INVALID_INPUT`으로 변환된다. 기타 `Exception`은 `PartnerExceptionHandler.java:120`에서 HTTP 500이다.

다만 현 정상 입력으로 전용 타입 밖의 예상 불가 `IllegalArgumentException`을 자연 발화시키는 필드는 확인하지 못했다. R12 unit mutation은 있지만 실 사용자 발화가 아니므로, **이 반대급부 라이브는 `관측 불가`**로 남긴다. 결함 0으로 계산하지 않았다.

## 6. 증거 무결성 차이 — R12 `imported=2` 고정 표본

R12 보고서는 `SOL1154R12-*` 고정 코드 실측을 `imported=2`라고 제시했다. 같은 스펙을 R13에서 재실행한 결과:

```text
expected imported=2
received imported=0

source_file_hash=E304B21D...
SOL1154R12-BEFORE|UPDATED|
SOL1154R12-NEGATIVE|PENDING|INPUT_VALIDATION
SOL1154R12-AFTER|UPDATED|
```

실 DB 영향 건수:

```text
SOL1154R12-BEFORE   deleted=true 1 row
SOL1154R12-NEGATIVE deleted=true 1 row
SOL1154R12-AFTER    deleted=true 1 row
active 0 / deleted 3
```

셋째 가능성은 코드로도 확정된다.

- `EcountPartnerImporter.java:644` — active 조회
- `EcountPartnerImporter.java:646` — deleted 포함 조회
- `EcountPartnerImporter.java:653` — deleted이면 restore
- 그러나 `isNew=false`라 응답은 imported가 아니라 updated로 계산

이는 음수 held/뒤 행 진행 기능 결함이 아니다. 실제로 앞/뒤가 모두 `UPDATED`되고 held는 1이었다. 다만 R12가 제시한 고정 fixture 수치는 정리 후 동일 DB 재실행에서 재현되지 않으므로 증거 무결성 예외로 보고한다. R13 초최 고유 코드 `active|deleted=0|0`에서는 `imported=2`가 다시 실측됐다.

## 7. GUI·스크린샷

- 실 서버/API와 Chromium Playwright는 직접 실행했고, 응답 원문을 `docs/qa/2026-08-09-1154-r13/` 스크린샷 4장으로 캡처했다.
- in-app/외부 브라우저 runtime 목록은 `[]`이어서 제품 GUI 육안 조작은 **관측 불가**였다.
- desktop source에 `heldParseFailureRows`/`infrastructureFailure` 소비자는 0곳이었다. 현재 확인된 사용자 표면은 관리자 HTTP 응답이다.
- 제품 GUI를 못 봤으므로 GUI 결함 0이라고 판정하지 않았다.

## 8. 검증 원문

```text
accounting-service bootJar: BUILD SUCCESSFUL in 15s
targeted Gradle tests (--rerun-tasks): BUILD SUCCESSFUL, 28 actionable tasks / 28 executed
R13 partner 음수 held 실 API Playwright: 1 passed (3.2s)
R13 accounting 인프라 실 HTTP Playwright: 1 passed (2.5s)
R13 accounting INPUT_VALIDATION 표시 Playwright: 1 passed (2.4s)
R12 고정 fixture 최초 재실행: FAIL, expected imported=2 / received imported=0
R13 신규 고유 fixture: PASS, imported=2 / held=1 / staging PENDING|INPUT_VALIDATION
cleanup: R13 active rows=0
```

## 9. 신규 파일 목록

- `docs/dev-reports/2026-08-09-1154-r13-sol-reconvergence.md`
- `clients/desktop/playwright/1154-r12-input-failure-boundary-real-qa/playwright.config.ts`
- `docs/qa/2026-08-09-1154-r13/00-red-a-input-boundary.png`
- `docs/qa/2026-08-09-1154-r13/01-red-d-invariants.png`
- `docs/qa/2026-08-09-1154-r13/02-accounting-live-infrastructure-relay.png`
- `docs/qa/2026-08-09-1154-r13/03-accounting-live-input-validation-label.png`
- `docs/qa/2026-08-09-1154-r13/cleanup-verify.txt`
- `docs/qa/2026-08-09-1154-r13/r13-negative-seed.csv`
- `docs/qa/2026-08-09-1154-r13/r13-negative-batch.csv`
- `docs/qa/2026-08-09-1154-r13/r13-accounting-held-seed.csv`
- `docs/qa/2026-08-09-1154-r13/거래처-Excel다운로드_R13_INFRA.csv`
- `docs/qa/2026-08-09-1154-r13/거래처-Excel다운로드_R13_HELD.csv`

수정 파일(신규 아님):

- `clients/desktop/playwright/1154-r12-input-failure-boundary-real-qa/1154-r12-live-api.spec.ts` — R13 고유 코드, accounting 실 HTTP 2 시나리오, 지정 캡처 추가

## 10. 못 한 것

- 사용 가능한 브라우저가 0개여서 제품 GUI 자체는 조작/육안 확인하지 못했다.
- 전용 타입 밖 `IllegalArgumentException`을 정상 사용자 입력만으로 자연 발화시킬 현재 필드가 없어, 상위 catch 반대급부는 라이브로 밟지 못했다. 코드 스택은 held로 삼키지 않음을 확인했지만 라이브 판정은 `관측 불가`다.
- commit / push는 수행하지 않았다.
