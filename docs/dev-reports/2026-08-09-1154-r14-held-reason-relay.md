# PR #1154 R14 — held reason/sample relay

## 1. 판정

R12에서 partner-service가 이미 생성한 `heldSample`을 accounting까지 연결했다. `heldParseFailureRows` 명칭은 호환을 위해 유지했다. 다만 관리자에게는 `message`와 `errors[]`로 실제 사유·행을 함께 노출하므로, 필드 개명은 이번 라운드에서 하지 않는다. 숫자 카운터는 `imported`/`updated` 합산을 건드리지 않았다.

## 2. RED — fix 전 원문

R13 라이브 원문은 [00-r13-fix-before.json](../qa/2026-08-09-1154-r14/00-r13-fix-before.json)이다.

```json
{"http":200,"heldDetail":{"status":"PROCESSED_WITH_REJECTIONS","imported":2,"rejected":0,"message":null,"heldParseFailureRows":1,"infrastructureFailureRows":0,"infrastructureFailure":false},"errors":[]}
```

`message=null`, `errors=[]`가 이번 결함의 RED-A 원문이다. RED-B~D는 fix 전 테스트로 고정했다. RED-B는 held 0에서 message null/errors empty, RED-D는 정상 imported/updated 합산 불변이다. RED-C는 `DB_CONSTRAINT`와 `INPUT_VALIDATION` 혼재를 요구한다.

## 3. 중계 지점

| 지점 | 변경 |
|---|---|
| partner 응답 | 기존 `heldSample[{rowNumber,reason,rawPartnerCode,rawName}]` 유지 |
| `EcountRemoteImportClient.parse()` | `heldSample` JSON 배열을 `HeldSample` 목록으로 파싱 |
| `RemoteImportResult` | `List<HeldSample> heldSample` 추가; 3/6-인자 호환 생성자 유지 |
| `EcountReimportService.summarize()` | 표본을 `CountSummary`로 전달 |
| `processFile()` | 표본별 `errors[]` 생성, 첫 표본을 상세 `message`로 표시 |
| `SliceResult` | `heldSample` 공개; 기존 7/10-인자 생성자 유지 |

`heldSample`이 없거나 held 0이면 `List.of()`, `message=null`, held 관련 errors 미추가다. 정상 결과의 imported/updated 합산은 그대로다.

## 4. RED 실패 원문

운영 코드 전에 RED 테스트를 실행했고, `HeldSample` 타입/접근자가 없어 `compileTestJava`가 실패했다. 주요 원문은 `cannot find symbol: class HeldSample`, `cannot find symbol: method heldSample()`이었다. 이후 최소 배선으로 GREEN 전환했다.

## 5. 라이브 HTTP

라이브 accounting은 포트 `28087`, 격리 R14 컨테이너에서 기동했다. 인증 원문은 저장하지 않았다(`<redacted>`). 입력 표본은 모두 관리자 multipart API로 만들었고 `1068689215`는 접촉하지 않았다.

### RED-A / GREEN-A — INPUT_VALIDATION

[01-r14-live-input-validation.json](../qa/2026-08-09-1154-r14/01-r14-live-input-validation.json)

- partner API: `totalRows=3`, `imported=2`, `heldParseFailureRows=1`, `reason=INPUT_VALIDATION`, `rowNumber=4`.
- accounting HTTP 200: `status=PROCESSED_WITH_REJECTIONS`, `imported=2`, `message`에 `INPUT_VALIDATION`, `row=4`, code/name 포함.
- 같은 표본이 `details[].heldSample`과 top-level `errors[]`에도 도달했다.

### RED-C — DB_CONSTRAINT + INPUT_VALIDATION 혼재

[02-r14-live-mixed.json](../qa/2026-08-09-1154-r14/02-r14-live-mixed.json)

- `DB_CONSTRAINT` row 4와 `INPUT_VALIDATION` row 5가 모두 `heldSample`에 남았다.
- `errors[]` 순서도 `DB_CONSTRAINT`, `INPUT_VALIDATION`으로 보존됐다.
- 정상 행 `imported=1`이 유지됐다.

### 라이브 중간 장애 원문

초기 격리 컨테이너에서는 simple discovery 인스턴스가 없어 `No instances available for partner-service`가 발생했다. R13과 같은 simple discovery 설정으로 재기동한 뒤 위 HTTP 결과를 확보했다. 애플리케이션 결함으로 판정하지 않았다.

## 6. 조합 표면 닫기

| 조합 | 결과 |
|---|---|
| held 0건 | `EcountReimportServiceTest.RED_B...`: message null, heldSample empty, errors empty |
| 1사유 INPUT_VALIDATION | 라이브 GREEN-A: message/errors/sample 모두 행·사유 도달 |
| 2사유 혼재 | 라이브 GREEN-C: DB_CONSTRAINT + INPUT_VALIDATION 각각 errors 도달 |
| 대량 | 기존 `mig8_거부_상세는_20건을_초과해도_모두_관리자_응답에_남는다` 패턴으로 errors 전체 보존; held relay도 파싱 배열 전체를 순회하며 임의 cap을 추가하지 않음 |

## 7. 생성자·식별자 전수 확인

제거/이동/개명한 식별자는 없다. `RemoteImportResult` 호환 생성자 사용처:

| 생성자 | production | test |
|---|---:|---:|
| 3-인자 | 0 | 3 |
| 기존 6-인자 | 0 | 1 |
| 신규 표본 포함 7-인자 | 1 parser | 2 |

`SliceResult` 기존 호환 생성자는 production/test 호출부가 있으나 신호가 없는 skip/exception 경로다. 새 표본 포함 생성자를 호출하는 production은 `EcountReimportService.processFile()` 1곳이며, grep 결과 추가 호환 생성자를 사용하는 production 호출부는 0곳이다.

## 8. cleanup

[03-cleanup-verify.txt](../qa/2026-08-09-1154-r14/03-cleanup-verify.txt)

R14 거래처 6개는 관리자 DELETE API로 정리했다. partner 테이블은 SELECT로 `active=0`, `soft-deleted=5`를 확인했다. `DB_CONSTRAINT` held 행은 partner 행이 없어 DELETE 404였고, staging에는 R14 표본 9행이 남았다. staging/reject 이력은 직접 DELETE하지 않았다. 즉 soft delete를 남기는 cleanup 정책이며, 다음 라운드는 R14 코드가 active에 남아 있지 않음을 기준으로 재현해야 한다.

## 9. 검증

```text
./gradlew :services:accounting-service:test --tests EcountRemoteImportClientTest --tests EcountReimportServiceTest
BUILD SUCCESSFUL

./gradlew :services:partner-service:test --tests EcountPartnerImporterTest :services:accounting-service:test \
  --tests EcountRemoteImportClientTest --tests EcountReimportServiceTest \
  --tests EcountReimportControllerIT
BUILD SUCCESSFUL

./gradlew :services:accounting-service:bootJar
BUILD SUCCESSFUL
```

## 10. 신규 파일 목록

- `docs/qa/2026-08-09-1154-r14/거래처-Excel다운로드_R14_HELD.csv`
- `docs/qa/2026-08-09-1154-r14/거래처-Excel다운로드_R14_MIXED.csv`
- `docs/qa/2026-08-09-1154-r14/00-r13-fix-before.json`
- `docs/qa/2026-08-09-1154-r14/01-r14-live-input-validation.json`
- `docs/qa/2026-08-09-1154-r14/02-r14-live-mixed.json`
- `docs/qa/2026-08-09-1154-r14/03-cleanup-verify.txt`
- `docs/dev-reports/2026-08-09-1154-r14-held-reason-relay.md`

## 11. 못 한 것

- 관리자 API는 화면 UI가 아니라 multipart/JSON 운영 endpoint라 브라우저 스크린샷은 만들지 못했다. 대신 fix 전/후 실 HTTP 응답 원문을 QA 디렉터리에 보존했다.
- 공유 DB 직접 INSERT/UPDATE/DELETE는 하지 않았다. cleanup도 관리자 DELETE API만 사용했다.
- commit/push는 하지 않았다.
