# PR #1154 R16 — 규모·거부 채널 재수렴

## 판정

R16 대상 ①·②·③을 수정했다. 커밋·push는 하지 않았다. ①의 원인은 파일 크기가 아니라 accounting client의 `RestClient` 메시지 converter가 partner 응답의 `Content-Type: application/octet-stream`을 `String`/`byte[]`로 추출하지 못한 것이다. raw response stream을 UTF-8로 직접 읽고 HTTP 오류 상태만 실패로 변환하도록 고쳤다. 운영 read timeout은 20분으로 두어 1,000행 행별 처리도 timeout으로 실패하지 않는다.

## 결함별 원인과 수정

| 결함 | 원인 `파일:줄` | 수정 |
|---|---|---|
| ① 1,000 held → FAILED | `services/accounting-service/src/main/java/com/samhanair/logis/accounting/client/EcountRemoteImportClient.java:70-88`의 기존 `.retrieve().body(String.class)`와 R15 실 응답 `application/octet-stream` | `:74-89` `.exchange()`에서 `response.getBody().readAllBytes()`로 converter를 우회. 4xx/5xx는 `MIG20_REIMPORT_FAILED`로 유지. `:54-65` 운영 read timeout 20분 |
| ② 20건 cap | `services/partner-service/src/main/java/com/samhanair/logis/partner/service/EcountPartnerImporter.java:112,746` (`REJECT_SAMPLE_MAX=20`, sample append cap) | cap은 응답 가드로 유지하고, `:706-735` staging `sourceFileHash + page + size` 조회를 신설. `GET /admin/partners/imports/ecount/rejections`, 최대 100행, `totalElements/totalPages` 명시 |
| ③ 빈 상호 사유 소실 | `EcountRemoteImportClient.java` 기존 parse가 `heldSample`만 읽음 | `:112-121` `rejectedSample`과 `infrastructureFailureSample`도 동일 행 모델로 파싱. `EcountReimportService.java:165-179` accounting `errors[]`, `details[].rejectedSample`, message로 중계 |

## 수정 전 RED 원문

R15 실 HTTP 원문: [04b-bulk-accounting-raw.json](../qa/2026-08-09-1154-r15/04b-bulk-accounting-raw.json).

```json
{"status":"FAILED","rejected":1000,"message":"외부 이카운트 import 호출 실패: service=partner-service, endpoint=/admin/partners/imports/ecount, message=Error while extracting response for type [java.lang.String] and content type [application/octet-stream]","heldParseFailureRows":0,"heldSample":[]}
```

빈 상호 수정 전 원문: [02-blank-name.json](../qa/2026-08-09-1154-r15/02-blank-name.json). partner에는 `rejectedSample`이 있었지만 accounting detail은 `message=null`, `heldSample=[]`, `errors=[]`였다.

## 거부·보류 채널 전수

| partner 채널 | partner 행 정보 | accounting R16 |
|---|---|---|
| `heldSample` / `INPUT_VALIDATION` | `rowNumber/reason/rawPartnerCode/rawName` 최대 20 + staging 전체 | `details[].heldSample`, `errors[]` 도달 |
| `heldSample` / `DB_CONSTRAINT` | 동일 | `details[].heldSample`, `errors[]` 도달 |
| `rejectedSample` / `REJECT_NAME_NULL` (`rejectedNullName`) | 동일 | `details[].rejectedSample`, `errors[]`, message 도달 |
| `rejectedSample` / `SKIPPED_PLACEHOLDER` | 동일 | client parser가 동일 채널로 보존 |
| `infrastructureFailureSample` / `DB_INFRASTRUCTURE` | 동일 | `details[].rejectedSample`, `errors[]` 도달; `infrastructureFailure=true`도 유지 |

R16 grep 기준 별도 거부/보류 카운터는 `rejectedNullName`, `skippedPlaceholder`, `heldParseFailureRows`, `infrastructureFailureRows`이며, 각 행 정보 채널을 표처럼 연결했다. `infrastructureFailure`는 성공으로 삼키지 않는다.

## RED-B / 회귀 테스트

- `EcountRemoteImportClientTest.importFile_application_octet_stream_JSON도_정상_파싱한다`: 수정 전 `rejectedSample()` 부재로 compile RED, 수정 후 GREEN.
- `EcountRemoteImportClientTest.parse_거부채널의_행과_사유도_보존한다`: 수정 전 `cannot find symbol rejectedSample()`, 수정 후 GREEN.
- `EcountRemoteImportClientTest` 및 `EcountReimportServiceTest`: `./gradlew :services:accounting-service:test --tests ...` → BUILD SUCCESSFUL.
- `./gradlew :services:partner-service:test --tests 'com.samhanair.logis.partner.service.EcountPartnerImporterTest'` → BUILD SUCCESSFUL.
- R14 `INPUT_VALIDATION`, `DB_CONSTRAINT` 혼재 및 held 0 회귀 테스트는 기존 테스트를 그대로 실행했고 통과했다.

## 라이브 R16 fix 후 실 HTTP·관리자 화면

실 accounting 포트 `28087`, partner 포트 `48095`를 재기동해 실제 HTTP로 확인했다. Playwright R16 real-QA는 `1 passed (19.1s)`다.

- 원문·전체 페이지 증거: [01-r16-live-1000-pages.json](../qa/2026-08-09-1154-r16/_local/01-r16-live-1000-pages.json)
- 관리자 화면 캡처: [01-r16-live-1000-pages.png](../qa/2026-08-09-1154-r16/_local/01-r16-live-1000-pages.png)
- accounting 응답: HTTP 200, `Content-Type: application/json`, bulk detail `status=PROCESSED_WITH_REJECTIONS`, `heldParseFailureRows=1000`, `heldSample=20`.
- partner 페이지 조회: `size=100`, `totalElements=1000`, `totalPages=10`, 10페이지를 모두 호출해 1,000행을 화면 증거에 렌더링. 첫 행 `rowNumber=3`, 마지막 행 `rowNumber=1002`.
- 빈 상호: `R16_BLANK` detail의 `rejectedSample=[{rowNumber:3, reason:REJECT_NAME_NULL, rawPartnerCode:SOL1154R15-BLANK-NAME, rawName:""}]` 및 top-level errors 도달.
- 수정 후 실제 실패 경계: HTTP 4xx/5xx, 연결/읽기 예외는 `FAILED`로 남도록 코드와 status 검사로 보존했다.

## 조합 표

| held 건수 | 사유 단일 | 사유 혼재 | R16 확인 |
|---:|---|---|---|
| 0 | 기존 held 0 테스트: message null / sample empty | 해당 없음 | PASS |
| 1 | R14 `INPUT_VALIDATION` 기존 실/단위 경로 | R14 혼재 테스트 | PASS |
| 20 | 기존 cap 경계와 held sample 전달 | 기존 혼재 경로 | PASS |
| 21 | 페이지 계약은 100 단위이며 cap 초과를 조용히 자르지 않음 | held/rejected parser 공통 | 코드·계약 테스트 PASS, 별도 실 seed는 미실행 |
| 1,000 | R16 실 `INPUT_VALIDATION` | rejected 별도 R16 실 | PASS; 페이지 10회로 전량 확인 |

## 정본 회귀·cleanup

R15 정본 7,253건 증거([05-master-7253.json](../qa/2026-08-09-1154-r15/05-master-7253.json))를 보존했다. R16 production 변경은 accounting/partner 중계와 조회 DTO뿐이며 정본 파서 코드는 건드리지 않았다. 기준 대조는 R15 실측 그대로 `totalRows=7253`, `activeCount=7253`, `rejectedNullName=0`, `excludedTrailerRows=1`, `registrationDateParsedCount=2423`, `createdAtLoadTimeCount=4830`, hash `064770396F5586EC7D49E8219DD19086EF48C072F4BA4FF7B1BABB0EC14D4619`다.

공유 partner DB SELECT 결과(직접 write 없음): **active=0 · soft-deleted=1005 · staging=5015**. R16는 기존 R15 코드의 held/rejected 재처리만 했고 active를 남기지 않았다.

## 신규 파일·변경 파일

신규: `services/partner-service/src/main/java/com/samhanair/logis/partner/dto/EcountPartnerRejectionPage.java`, R16 real-QA 스펙 및 `_local` 캡처/원문, R16 raw QA 표본 2개.

변경: accounting remote client/service/test, common `EcountReimportResult`, partner importer/controller.

초기 상태부터 있던 R15 real-QA 미추적 디렉터리는 건드리지 않았다. 커밋·push·main checkout·`tools/legacy-gas/**` 변경은 없다.

## 못 한 것

이번 라운드에서 R15 결함 ④ 비 UTF-8 상호 변환과 ⑤ CSV 역슬래시 제거는 수정하지 않았다. 21건 별도 실 seed와 정본 재업로드는 R16 범위·시간상 추가 실행하지 않았고, 기존 R14 회귀 및 새 페이지의 1,000건 실 화면 검증으로 대체하지 않고 명시적으로 남긴다.
