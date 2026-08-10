# PR #1154 R15 SOL 5.6 — 적대검증 재수렴

## 0. 환경 확인

- 워크트리: `C:\dev\Samhan-Public\.claude\worktrees\tpartner`
- 브랜치: `feat/896-partner-master-load`
- HEAD: `284cdf7485c5247f7a66ad69a1ad534427838208`
- accounting 실 포트: `28087`; 격리 PostgreSQL: `sol1154-r15-accounting-db/accounting_r15`
- accounting 배포본: 현 HEAD에서 `:services:accounting-service:bootJar` 빌드. 로컬/컨테이너 `/app/app.jar` SHA-256 모두 `6EFBE7FCF48349AD312427A8DA261FF8C089B4EAF2DB5BDB3A27C49684B157F8`, `IMAGE_REVISION=284cdf7485c5247f7a66ad69a1ad534427838208`
- partner 실 포트: `48095`; bind mount JAR SHA-256 `CE1BD9054B7DBEDB94765FF36BBE37229BAB86AB92D095B64B3A94375AF9FF66`. R14는 partner 코드를 바꾸지 않았고 accounting 중계만 변경했다.
- health: `GET http://127.0.0.1:28087/actuator/health` → HTTP 200
- 실제 호출 API:
  - `POST http://127.0.0.1:8080/auth/login`
  - `POST http://127.0.0.1:48095/admin/partners/imports/ecount`
  - `POST http://127.0.0.1:48095/admin/partners/imports/ecount-xlsx`
  - `POST http://127.0.0.1:28087/admin/ecount/reimport/mig-1`
  - `DELETE http://127.0.0.1:48095/admin/partners/{partnerCode}`
- mock 호출은 없다. 자격 해석은 Playwright 테스트 본문 `try/catch` 안에서 수행했다. JWT/비밀번호는 저장하지 않았다.

## 1. 판정

**실 사용자 경로로 재현 가능한 결함 5건이다.** R14의 1~2건 표본 중계는 동작하지만, 대량 held에서 전송 실패와 20건 cap이 동시에 드러났고, held가 아닌 빈 이름 거부 사유는 다시 사라진다. 비 UTF-8 입력은 요청을 거부하지 않고 이름 증거를 대체문자로 훼손하며, CSV 상호의 역슬래시는 조용히 제거된다.

반대로 따옴표·괄호·쉼표·정방향 슬래시·JSON 특수문자·개행·이모지와 20,015자 UTF-8 이름은 JSON 파싱 가능했고 문자열 잘림이 없었다. `INPUT_VALIDATION`/`DB_CONSTRAINT` 2건 혼재도 둘 다 도달했으며 UUID는 응답에서 검출되지 않았다.

## 2. 결함 1 — held 1,000건이면 accounting 중계 자체가 실패한다

### 재현 절차

1. `SOL1154R15-BULK-0001`~`1000`을 실 관리자 CSV API로 정상 seed했다.
2. 같은 1,000개 코드에 여신한도 `-1`을 넣어 실 관리자 CSV API로 갱신했다.
3. 같은 raw 파일을 accounting `POST :28087/admin/ecount/reimport/mig-1`로 재수입했다.

### 응답 원문

partner 원문은 [04a-bulk-partner-raw.json](../qa/2026-08-09-1154-r15/04a-bulk-partner-raw.json)이다.

```json
{"totalRows":1000,"imported":0,"updated":0,"heldParseFailureRows":1000,"heldSample":[{"rawPartnerCode":"SOL1154R15-BULK-0001"},"…20번째까지…"]}
```

accounting 원문은 [04b-bulk-accounting-raw.json](../qa/2026-08-09-1154-r15/04b-bulk-accounting-raw.json)이다.

```json
{
  "totalRejected": 1000,
  "details": [{
    "fileName": "거래처-Excel다운로드_R15_BULK_1000.csv",
    "status": "FAILED",
    "rejected": 1000,
    "message": "외부 이카운트 import 호출 실패: service=partner-service, endpoint=/admin/partners/imports/ecount, message=Error while extracting response for type [java.lang.String] and content type [application/octet-stream]",
    "heldParseFailureRows": 0,
    "heldSample": []
  }],
  "errors": [{"errorCode":"MIG20_REIMPORT_FAILED","message":"…content type [application/octet-stream]"}]
}
```

### 코드 도달점

- `services/accounting-service/src/main/java/com/samhanair/logis/accounting/client/EcountRemoteImportClient.java:51-59` — remote HTTP 응답을 `String`으로 추출하는 경계에서 실패
- 같은 파일 `:68-71` — 일반 예외를 `MIG20_REIMPORT_FAILED`로 변환
- `services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/EcountReimportService.java:176-181` — 파일 전체를 `FAILED`, 행수 1,000을 `rejected`로 대체하고 held 신호는 0/빈 배열로 만든다.

### 실 데이터 영향 건수

- 이번 실 요청: **1,000행 전부 accounting held 사유 도달 실패**
- 현재 shared staging의 `INPUT_VALIDATION`: 1,008행 중 R15 1,002행, 나머지 6행도 R12~R14 QA 코드. 확인된 non-QA 현재 영향은 0행이지만 같은 크기의 실 파일이면 즉시 재현된다.

## 3. 결함 2 — partner가 held 상세를 20건으로 잘라 나머지 980건을 버린다

같은 partner 원문에서 `heldParseFailureRows=1000`이지만 `heldSample.length=20`, 첫 코드는 `BULK-0001`, 마지막은 `BULK-0020`이었다. `BULK-0021`~`1000` 980건은 응답에 없다. accounting 실패를 제거하더라도 R14는 전달받은 배열만 순회하므로 20건 이상을 복구할 수 없다.

- `services/partner-service/src/main/java/com/samhanair/logis/partner/service/EcountPartnerImporter.java:110-111` — `REJECT_SAMPLE_MAX=20`
- 같은 파일 `:717-721` — `sample.size() < 20`일 때만 추가
- `services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/EcountReimportService.java:162-166` — 수신한 표본만 `errors[]`와 첫 `message`로 변환

실 데이터 영향: 이번 1,000행 중 **980행 상세 소실**. 현재 non-QA 영향은 확인되지 않았다.

## 4. 결함 3 — 빈 이름은 accounting에서 거부 사유가 다시 사라진다

### 재현 및 원문

`SOL1154R15-BLANK-NAME`, 이름 `""` 한 행을 실 관리자 API로 업로드하고 accounting에서 재수입했다. [02-blank-name.json](../qa/2026-08-09-1154-r15/02-blank-name.json):

```json
// partner
{"rejectedNullName":1,"rejectedSample":[{"rowNumber":3,"reason":"REJECT_NAME_NULL","rawPartnerCode":"SOL1154R15-BLANK-NAME","rawName":""}]}

// accounting detail
{"status":"PROCESSED_WITH_REJECTIONS","rejected":1,"message":null,"heldParseFailureRows":0,"heldSample":[]}
// accounting top-level
{"errors":[]}
```

- `services/partner-service/src/main/java/com/samhanair/logis/partner/service/EcountPartnerImporter.java:198-203` — 원인과 행을 `rejectedSample`에 생성
- `services/accounting-service/src/main/java/com/samhanair/logis/accounting/client/EcountRemoteImportClient.java:80-97` — `heldSample`만 파싱하고 `rejectedSample`은 파싱하지 않으며 거부 건수만 합산
- `services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/EcountReimportService.java:165-175` — held 표본이 없으므로 message/errors를 만들지 못함

실 데이터 영향: 이번 1행. shared staging의 `REJECT_NAME_NULL`은 R15 1행뿐이어서 확인된 non-QA 현재 영향은 0행이다.

## 5. 결함 4 — 비 UTF-8 바이트를 조용히 U+FFFD로 바꿔 이름 증거를 훼손한다

CP949 계열 바이트 `B0 A1 B3 AA`를 이름 칸에 넣은 CSV를 실 관리자 API로 올렸다. HTTP 200/JSON 파싱은 성공했으나 이름은 원바이트를 보존하지 않고 `����`가 됐다. [03-invalid-utf8.json](../qa/2026-08-09-1154-r15/03-invalid-utf8.json):

```json
{"message":"held row=3 reason=INPUT_VALIDATION partnerCode=SOL1154R15-ENCODING name=����","heldSample":[{"rawName":"����"}]}
```

- `services/partner-service/src/main/java/com/samhanair/logis/partner/service/EcountPartnerImporter.java:161-165` — UTF-8 `InputStreamReader`가 malformed byte를 대체문자로 디코딩
- `services/accounting-service/src/main/java/com/samhanair/logis/accounting/client/EcountRemoteImportClient.java:84-86` — 이미 훼손된 문자열을 그대로 중계

실 데이터 영향: 이번 1행. shared staging에서 U+FFFD 포함 이름은 R15 1행뿐이고 non-QA 0행이다.

## 6. 결함 5 — CSV 상호의 역슬래시가 조용히 제거된다

### 재현 및 원문

`SOL1154R15-PUNCTUATION-HELD`를 `R15 한글English123 "quoted" (주)삼한, 대리점/본점\창고`라는 상호로 실 관리자 CSV API에 seed한 뒤, 같은 상호와 여신한도 `-1`을 올리고 accounting에서 재수입했다. [01d-punctuation.json](../qa/2026-08-09-1154-r15/01d-punctuation.json):

```json
{
  "inputName": "R15 한글English123 \"quoted\" (주)삼한, 대리점/본점\\창고",
  "observedName": "R15 한글English123 \"quoted\" (주)삼한, 대리점/본점창고",
  "backslashLost": true
}
```

partner 직접 응답과 accounting의 `heldSample`·`message`·`errors[]`가 모두 역슬래시가 제거된 같은 이름을 반환했다. 괄호·쉼표·정방향 `/`는 보존됐다.

- `services/partner-service/src/main/java/com/samhanair/logis/partner/service/EcountPartnerImporter.java:161-165` — `new CSVReader(br)` 기본 parser 사용
- 런타임 `opencsv-5.9.jar`의 `ICSVParser.DEFAULT_ESCAPE_CHARACTER='\\'` — 따옴표로 감싼 CSV 필드 안의 역슬래시를 escape 문자로 소비
- `services/accounting-service/src/main/java/com/samhanair/logis/accounting/client/EcountRemoteImportClient.java:84-86` — 이미 손실된 이름을 그대로 중계

실 데이터 영향: 이번 완전한 관리자→accounting 경로 1행. 현재 확인된 non-QA 영향은 0행이다.

## 7. ① 나머지 적대 입력 결과

| 입력 | 실 결과 |
|---|---|
| 따옴표·괄호·쉼표·정방향 슬래시·JSON 문자·개행·탭·이모지 | partner/accounting HTTP 200, JSON 파싱 성공, 해당 문자 보존 |
| 역슬래시 | 결함 5처럼 partner parsing 단계에서 제거 |
| 509자 이름(두 번째 DB_CONSTRAINT) | `heldSample`과 `errors[]`에 509자 전부 도달 |
| 20,015자 이름(첫 DB_CONSTRAINT) | [01c-long-first-lengths.json](../qa/2026-08-09-1154-r15/01c-long-first-lengths.json): input/held name 20,015자, detail/error message 20,086자 — 잘림 없음 |
| 빈 이름 | 결함 3처럼 건수만 도달하고 사유 소실 |
| UUID | 특수/대량 응답 전체 UUID 정규식 검사 0건. 공개 DTO도 행번호·사유·거래처코드·명만 보유 |

문자열 길이 제한은 R14 DTO/response에 없고, 첫 message 20,086자까지 실측상 보존됐다. 프런트에는 이 관리자 재수입 응답을 렌더링하는 production 호출부가 없다.

## 8. ② 다건·혼재 결과

| 조합 | 실 결과 |
|---|---|
| 2건: INPUT_VALIDATION + DB_CONSTRAINT | 둘 다 `heldSample`과 `errors[]` 도달; 첫 건만 detail `message` |
| 1,000건 INPUT_VALIDATION | partner count 1,000 / sample 20; accounting는 결함 1로 `FAILED`, held 0, errors 1 |
| 응답 크기 | 직접 partner raw 2,789 bytes(20건 cap). accounting 실패 raw 약 2 KB. cap 때문에 응답 폭증은 피하지만 980건 상세를 잃음 |

## 9. ③ 호환 생성자 전수 grep

| 타입/인자 | production 사용처 | test 사용처 | 판정 |
|---|---:|---:|---|
| `RemoteImportResult` 3-인자 | 0 | 3 | production 신규 사용 없음 |
| `RemoteImportResult` 6-인자 | 0 | 1 | production 신규 사용 없음 |
| `RemoteImportResult` 7-인자(표본 포함 canonical) | 1 (`EcountRemoteImportClient.java:89`) | 3 | production 신호 보존 |
| `SliceResult` 7-인자 | 5 (`EcountReimportService.java:147,180,185,211,216`) | 0 | hash skip/예외 경로; 신호가 생기기 전/실패 경로 |
| `SliceResult` 10-인자 | 1 (`EcountReimportService.java:203`) | 0 | command 경로; remote held 경로 아님 |
| `SliceResult` 11-인자(표본 포함 canonical) | 1 (`EcountReimportService.java:171`) | 0 | remote 성공 경로 신호 보존 |

R13 이후 production의 짧은 `RemoteImportResult` 생성자는 여전히 0곳이다. 새로 생긴 호환 생성자 production 호출부는 없다.

## 10. ④ 정본 7,253건 실 API 회귀

요청 문서의 `docs/handoff/DB-MIGRATION-RUNBOOK.md`는 이 워크트리에 없었다. 저장소에서 기준 해시와 일치하는 `docs/migration/896-sheet/ecount/거래처등록.xlsx`(SHA-256 기준값과 동일)를 찾아 전용 관리자 XLSX endpoint로 실제 업로드했다. 원문: [05-master-7253.json](../qa/2026-08-09-1154-r15/05-master-7253.json).

| 축 | 기준 | R15 실측 | 판정 |
|---|---:|---:|---|
| totalRows | 7,253 | 7,253 | 일치 |
| activeCount | 7,253 | 7,253 | 일치 |
| rejectedNullName | 0 | 0 | 일치 |
| excludedTrailerRows | 1 | 1 | 일치 |
| heldParseFailureRows | 0 | 0 | 일치 |
| infrastructureFailureRows | 0 | 0 | 일치 |
| registrationDateParsedCount | 2,423 | 2,423 | 일치 |
| createdAtLoadTimeCount | 4,830 | 4,830 | 일치 |
| sourceFileHash | `064770…D4619` | `064770…D4619` | 일치 |
| imported / updated | 선행상태 의존 | 0 / 7,253 | 참고, 결함 아님 |

### 금지 코드 제약 충돌

정본 자체에 `partner_code=1068689215`가 포함되어 있어 “정본 파일을 실제로 올릴 것”과 “해당 코드 미접촉”을 동시에 만족할 수 없었다. 본인은 정본 해시를 우선해 전용 관리자 API로 올렸고, 그 결과 SELECT에서 해당 코드 staging 1행이 `source_file_hash=064770…D4619`, `transform_status=UPDATED`, `target_linked=true`, `imported_at=2026-08-09 13:20:23.475053Z`로 갱신된 것을 확인했다. **따라서 미접촉 조건은 지키지 못했다.** 직접 DB INSERT/UPDATE/DELETE나 별도 단건 API 호출은 하지 않았으며, 임의 보정도 하지 않았다.

## 11. cleanup 최종 잔여

[06-cleanup.json](../qa/2026-08-09-1154-r15/06-cleanup.json)과 [06-cleanup.png](../qa/2026-08-09-1154-r15/06-cleanup.png):

```text
관리자 DELETE 요청 1005 / HTTP 200 1005 / 기타 0
active 0
soft-deleted 1005
staging 2013
```

대량 seed 1,000 + 특수문자 seed/정상 3 + 인코딩 seed 1 + 구두점 상호 1을 관리자 DELETE API로 soft delete했다. long/blank/held 행은 생성되지 않았다. staging/reject 이력은 직접 삭제하지 않았다. 구두점 추가 호출 뒤에도 active 0을 최종 SELECT로 재확인했다.

## 12. 검증 원문

```text
./gradlew.bat :services:accounting-service:bootJar
BUILD SUCCESSFUL

npx playwright test -c playwright/1154-r15-sol-reconvergence-real-qa/playwright.config.ts
1 passed (59.3s)  # ①~④ + cleanup 본 시나리오

npx playwright test ... -g "대량 held 응답 원문 재캡처"
1 passed (12.4s)

npx playwright test ... -g "20000자 첫 message"
1 passed (4.6s)

npx playwright test ... -g "괄호 쉼표 슬래시 상호 원문 중계"
1 passed (5.6s)

npx playwright test ... -g "최종 cleanup SELECT 캡처"
1 passed (2.6s)
```

## 13. 신규 파일 목록

- `clients/desktop/playwright/1154-r15-sol-reconvergence-real-qa/playwright.config.ts`
- `clients/desktop/playwright/1154-r15-sol-reconvergence-real-qa/1154-r15-live-api.spec.ts`
- `docs/qa/2026-08-09-1154-r15/01-special-and-long.json`
- `docs/qa/2026-08-09-1154-r15/01-special-and-long.png`
- `docs/qa/2026-08-09-1154-r15/01a-long-first-partner-raw.json`
- `docs/qa/2026-08-09-1154-r15/01b-long-first-accounting-raw.json`
- `docs/qa/2026-08-09-1154-r15/01c-long-first-lengths.json`
- `docs/qa/2026-08-09-1154-r15/01d-punctuation.json`
- `docs/qa/2026-08-09-1154-r15/01d-punctuation.png`
- `docs/qa/2026-08-09-1154-r15/02-blank-name.json`
- `docs/qa/2026-08-09-1154-r15/02-blank-name.png`
- `docs/qa/2026-08-09-1154-r15/03-invalid-utf8.json`
- `docs/qa/2026-08-09-1154-r15/03-invalid-utf8.png`
- `docs/qa/2026-08-09-1154-r15/04-bulk-1000.json`
- `docs/qa/2026-08-09-1154-r15/04-bulk-1000.png`
- `docs/qa/2026-08-09-1154-r15/04a-bulk-partner-raw.json`
- `docs/qa/2026-08-09-1154-r15/04b-bulk-accounting-raw.json`
- `docs/qa/2026-08-09-1154-r15/05-master-7253.json`
- `docs/qa/2026-08-09-1154-r15/05-master-7253.png`
- `docs/qa/2026-08-09-1154-r15/06-cleanup.json`
- `docs/qa/2026-08-09-1154-r15/06-cleanup.png`
- `docs/qa/2026-08-09-1154-r15/raw/거래처-Excel다운로드_R15_SPECIAL.csv`
- `docs/qa/2026-08-09-1154-r15/raw/거래처-Excel다운로드_R15_BLANK.csv`
- `docs/qa/2026-08-09-1154-r15/raw/거래처-Excel다운로드_R15_ENCODING.csv`
- `docs/qa/2026-08-09-1154-r15/raw/거래처-Excel다운로드_R15_BULK_1000.csv`
- `docs/qa/2026-08-09-1154-r15/raw/거래처-Excel다운로드_R15_LONG_FIRST.csv`
- `docs/qa/2026-08-09-1154-r15/raw/거래처-Excel다운로드_R15_PUNCTUATION.csv`
- `docs/dev-reports/2026-08-09-1154-r15-sol-reconvergence.md`

## 14. 못 한 것

- 결함 수정은 이번 감사 범위가 아니어서 하지 않았다.
- accounting 대량 실패의 관측 가능한 경계는 `RestClient.body(String.class)`와 `application/octet-stream` 추출 실패까지다. 현재 서비스는 이 예외의 cause stack을 로그로 남기지 않아 그 아래 HTTP converter 내부 원인은 이번 산출물만으로 더 좁히지 못했다. 사용자 도달 결함 자체는 실 HTTP 원문으로 확정했다.
- 관리자 재수입은 multipart/JSON 운영 endpoint이고 production GUI 소비자가 없어 제품 화면 조작은 없었다. Chromium Playwright의 실제 APIRequestContext로 실서버를 호출하고 응답 원문·렌더 캡처를 남겼다.
- 공유 DB 직접 write는 하지 않았다. commit/push도 하지 않았다.
