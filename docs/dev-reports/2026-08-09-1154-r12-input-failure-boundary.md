# PR #1154 R12 fix — 입력 실패 경계·partner import 응답 중계

- 일자: 2026-08-09 KST
- 워크트리: `C:\dev\Samhan-Public\.claude\worktrees\tpartner`
- 브랜치: `feat/896-partner-master-load`
- 시작 HEAD: `c158144ee`
- commit / push: 수행하지 않음

## 1. 변경 결론

1. 기존 거래처의 `replaceCreditLimitFromImport(-1)`만 전용 하위 타입 `Partner.InvalidImportedCreditLimitException`으로 식별한다. 이 예외는 `INPUT_VALIDATION` 데이터 축의 held 행으로 기록하고 뒤 정상 행을 계속 처리한다.
2. 일반 `RuntimeException`이나 전용 타입 밖의 `IllegalArgumentException`은 catch하지 않는다. RED-C 단위 회귀 테스트에서 실제 `Partner` 하위 객체가 예기치 않은 `IllegalArgumentException`을 던지도록 mutation하여 전파를 확인했다.
3. CSV와 XLSX 양쪽 행별 upsert 경계에 같은 전용 타입 처리를 적용했다. 신규 행의 `Partner.register(..., -1)`에는 이번 라운드에서 가드를 추가하지 않았다.
4. `EcountRemoteImportClient → EcountReimportService.CountSummary → EcountReimportResult.SliceResult` 중계선에 `heldParseFailureRows`, `infrastructureFailureRows`, `infrastructureFailure`를 보존했다. 인프라 실패 상세는 `PROCESSED_WITH_INFRASTRUCTURE_FAILURE`로 표시하고 관리자 상세 응답에서 건수를 확인할 수 있다.

## 2. 경계 정의와 근거

데이터 축으로 흡수하는 범위는 “partner import의 기존 거래처 갱신 중, 원천 필드 값에 대한 도메인 검증이 실패했음이 전용 예외 타입으로 확정된 경우”이다. 현재 도달 표본은 음수 여신한도뿐이다.

- 허용: `Partner.InvalidImportedCreditLimitException` — `replaceCreditLimitFromImport`가 `newLimit.signum() < 0`을 검증하다 던지는 `IllegalArgumentException`의 전용 하위 타입.
- 허용하지 않음: 전용 타입 밖의 `IllegalArgumentException`, `IllegalStateException`, `NullPointerException`, 기타 `RuntimeException`.
- 기존 축 유지: `DataIntegrityViolationException`은 `DB_CONSTRAINT`, 나머지 `DataAccessException`은 `DB_INFRASTRUCTURE`.
- catch 이후 staging 상태 갱신에서 발생하는 예외도 catch 범위 밖이므로 전파된다.

따라서 `catch (RuntimeException)`으로 넓히지 않아 진짜 버그를 held로 숨기지 않는다. 타입 경계를 코드로 만들었기 때문에 메시지 문자열 매칭도 하지 않는다.

## 3. R11 현재 RED 원문 제출

R11 실 관리자 API 원문은 다음과 같았다.

```json
{
  "http": 400,
  "response": {
    "success": false,
    "code": "INVALID_INPUT",
    "message": "creditLimit 은 음수 불가",
    "data": null
  },
  "staging": "SOL1154R11-NEGATIVE|PENDING||true",
  "storedAfterRejectedUpdate": "1|1.00",
  "beforeAndAfterActive": "1|0"
}
```

해석: 앞 정상행은 커밋됐고, 기존 거래처 음수 행은 staging에 남았으며, 뒤 정상행은 실행되지 않았다. `IllegalArgumentException`이어서 `DataAccessException` 두 bucket 어디에도 없었다.

## 4. 같은 값의 비대칭 — 양쪽 동작 원문

R11 예비 실측 원문:

```text
기존 행: replaceCreditLimitFromImport(-1)
  -> IllegalArgumentException("creditLimit 은 음수 불가")
  -> HTTP 400, 앞 행 커밋, 뒤 행 미처리

신규 행: Partner.register(..., -1)
  -> 가드 없음
  -> 예외 없음, HTTP 200, imported=1
```

이번 라운드의 업무 판단은 신규 가드 추가가 아니라 “기존 행의 입력 실패를 중단시키지 않는다”로 한정했다. 신규 행 음수 허용 여부는 판단 대기이며 이번 수정에서 바꾸지 않았다.

## 5. partner 응답 필드 중계 sweep

축을 “partner import 응답 필드를 중계하는 지점”으로 잡고 `services`, `shared`, `clients`를 전수 검색했다.

| 지점 | R11 상태 | R12 조치 |
|---|---|---|
| `EcountPartnerImportResult` | partner 직접 응답 원본 필드 보유 | 변경 없음 |
| `EcountRemoteImportClient.parse()` | `imported`, `rejected`, `sourceFileHash`만 파싱 | 세 필드 파싱 추가 |
| `EcountRemoteImportClient.RemoteImportResult` | 세 필드 없음 | 호환 3-인자 생성자 유지 + 세 필드 추가 |
| `EcountReimportService.summarize(RemoteImportResult)` | `imported/rejected`만 CountSummary로 전달 | 세 필드 전달 |
| `EcountReimportService.processFile/processCommand` | SliceResult에 세 필드 없음 | 관리자 상세 응답으로 전달; infra 상태 명시 |
| `EcountReimportResult.SliceResult` | 세 필드 없음 | 세 필드 추가 + 구 생성자 호환 |
| desktop/API 소비자 | partner 원본 필드 중계 소비자 0개 | 추가 중계 지점 없음 |

검색 결과 `EcountRemoteImportClient` 외에 같은 partner 응답을 파싱하는 production 중계 지점은 없었다.

## 6. RED-A~D 원문

### RED-A — 통과

실 관리자 API + 실 PostgreSQL 결과:

```text
HTTP=200
response.totalRows=3
response.imported=2
response.heldParseFailureRows=1
response.infrastructureFailureRows=0
response.infrastructureFailure=false
response.heldSample[0].reason=INPUT_VALIDATION
database=앞 정상 1 | 기존 음수 행 기존 row 1 | 뒤 정상 1
staging=PENDING|INPUT_VALIDATION
```

캡처: `docs/qa/2026-08-09-1154-r12-input-failure-boundary/_local/00-red-a-input-boundary.png`

### RED-B — 중계 계약 단위/서비스 테스트 통과

실 partner JSON shape를 `EcountRemoteImportClient.parse()`에 넣어 다음 원문을 확인했고, `EcountReimportService` 관리자 상세 결과까지 전달했다.

```text
heldParseFailureRows=1
infrastructureFailureRows=2
infrastructureFailure=true
SliceResult.status=PROCESSED_WITH_INFRASTRUCTURE_FAILURE
SliceResult.heldParseFailureRows=1
SliceResult.infrastructureFailureRows=2
SliceResult.infrastructureFailure=true
```

상주 중인 accounting 컨테이너는 다른 워크트리 jar를 bind mount하고 있어 그 컨테이너를 덮어쓰거나 다른 워크트리를 조작하지 않았다. 따라서 실 관리자 accounting HTTP 화면 경로 자체는 이번 라운드에서 실행하지 못했고, 중계 계약은 현재 워크트리의 실제 parse/service 코드 테스트로 증명했다.

### RED-C — 통과

전용 타입이 아닌 예외를 실제 `Partner` 하위 객체 mutation으로 발생시켰다.

```text
BuggyPartner.updateProfile(...) -> IllegalArgumentException("예상치 못한 버그")
importCsv -> IllegalArgumentException 그대로 전파
heldParseFailureRows로 흡수되지 않음
```

### RED-D — 통과

실 PostgreSQL 정본 분포 조회:

```text
7253|7253|0|7253|0
```

순서: active rows | ACTIVE | SUSPENDED | credit_limit NULL | 등록일/created_at 교정 불일치.

캡처: `docs/qa/2026-08-09-1154-r12-input-failure-boundary/_local/01-red-d-invariants.png`

R11의 201자 격리, 삭제행 UUID, 수정 파일 재적재 코드는 변경하지 않았다. 신규 R12 표본은 실 관리자 DELETE로 정리했고 active rows는 0으로 확인했다.

## 7. 검증 원문

```text
partner EcountPartnerImporterTest: BUILD SUCCESSFUL, 17 tests completed
accounting EcountRemoteImportClientTest + EcountReimportServiceTest: BUILD SUCCESSFUL
  21 tests completed
real Playwright API/PostgreSQL R12: 1 passed (4.0s)
partner-service bootJar: BUILD SUCCESSFUL
```

QA 규약 준수:

- 캡처 경로는 `resolveQaShotsDir()`를 경유했다.
- `resolveQaCredential`은 테스트 본문의 `try/catch`에서 처리하고 credential 부재 시 `test.skip`한다.
- fixture 쓰기는 실 관리자 API만 사용했다. SQL은 조회와 lock/검증 용도로만 사용하며 표본 INSERT/UPDATE는 하지 않았다.
- `partner_code=1068689215`는 조회·쓰기·잠금·삭제 모두 접촉하지 않았다.

## 8. 신규 파일 목록

- `docs/dev-reports/2026-08-09-1154-r12-input-failure-boundary.md`
- `services/accounting-service/src/test/java/com/samhanair/logis/accounting/client/EcountRemoteImportClientTest.java`
- `clients/desktop/playwright/1154-r12-input-failure-boundary-real-qa/1154-r12-live-api.spec.ts`
- `docs/qa/2026-08-09-1154-r12-input-failure-boundary/_local/00-red-a-input-boundary.png`
- `docs/qa/2026-08-09-1154-r12-input-failure-boundary/_local/01-red-d-invariants.png`
- `docs/qa/2026-08-09-1154-r12-input-failure-boundary/_local/cleanup-verify.txt`

수정 파일:

- `services/partner-service/src/main/java/com/samhanair/logis/partner/domain/Partner.java`
- `services/partner-service/src/main/java/com/samhanair/logis/partner/service/EcountPartnerImporter.java`
- `services/partner-service/src/test/java/com/samhanair/logis/partner/service/EcountPartnerImporterTest.java`
- `services/accounting-service/src/main/java/com/samhanair/logis/accounting/client/EcountRemoteImportClient.java`
- `services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/EcountReimportService.java`
- `services/accounting-service/src/test/java/com/samhanair/logis/accounting/service/EcountReimportServiceTest.java`
- `shared/common/src/main/java/com/samhanair/logis/common/ecount/EcountReimportResult.java`

## 9. 못 한 것

- accounting-service의 실 관리자 HTTP 경로/화면을 실행하지 못했다. 실행 중 컨테이너가 다른 워크트리 jar를 사용하므로 금지된 다른 워크트리 접촉을 피했다. 현재 워크트리의 응답 parse와 관리자 service 중계 테스트는 통과했다.
- 신규 행 `Partner.register(..., -1)`의 업무 정책은 판단 대기라 가드 추가를 하지 않았다.
- commit / push는 수행하지 않았다.
