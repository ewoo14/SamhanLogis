# PR #1154 R10 — 실패 분류 축 분리

- 일자: 2026-08-09 KST
- 워크트리: `C:\dev\Samhan-Public\.claude\worktrees\tpartner`
- 브랜치: `feat/896-partner-master-load`
- 구현 기준 HEAD: `c9a94b81d`
- 실 QA JAR SHA-256: `943515FB30453D582B0A3F13BCE499F024D1C45C6812FB4FB8DD9080A85D8A18`
- 금지 준수: commit/push 없음, `partner_code=1068689215` 미접촉

## 1. R9 RED 원문

R9가 실 관리자 CSV 경로에서 PostgreSQL 정본 `01` 행을 잠근 뒤, 잠금 대기 중인 **요청 JDBC PID만** `pg_terminate_backend`로 종료해 얻은 원문이다.

```text
blockedPid=119
terminated=true

MIG-1 import 행 DB 적재 실패 — row=3 partnerCode=01 status=HELD
org.springframework.orm.jpa.JpaSystemException: Unable to rollback against JDBC Connection
  at ...EcountPartnerImporter.upsertPartnerInRowTransaction(EcountPartnerImporter.java:566)
```

```json
{
  "totalRows": 1,
  "imported": 0,
  "updated": 0,
  "activeCount": 0,
  "heldParseFailureRows": 1,
  "heldSample": [{
    "rowNumber": 3,
    "reason": "DB_CONSTRAINT",
    "rawPartnerCode": "01",
    "rawName": "R9 transient infrastructure probe"
  }]
}
```

```text
HTTP=200
01|PENDING|DB_CONSTRAINT|true
```

이는 데이터 제약이 아닌 `JpaSystemException`을 `DB_CONSTRAINT`로 붙여 2xx 성공처럼 보이게 한 결함이었다. 사용자가 지적한 “전체 장애”가 아니라, 행 트랜잭션의 연결만 끊기고 다음 staging 연결은 정상인 부분·일시 장애 경로가 실제 도달 경로였다.

## 2. 두 축과 근거

구현은 예외 메시지 문자열을 검사하지 않는다.

| 축 | Spring 타입 | staging 사유 | 응답 보고 |
|---|---|---|---|
| 데이터 | `DataIntegrityViolationException` | `PENDING + DB_CONSTRAINT` | 기존 `heldParseFailureRows` / `heldSample` |
| 인프라 | 그 외 `DataAccessException` | `PENDING + DB_INFRASTRUCTURE` | `infrastructureFailureRows` / `infrastructureFailureSample` / `infrastructureFailure=true` |

`DataIntegrityViolationException`은 Spring이 무결성·제약 위반을 명시적으로 표현하는 `NonTransientDataAccessException` 계열이다. 반면 실 RED의 `JpaSystemException`은 제약 위반 타입이 아닌 `UncategorizedDataAccessException`이다. 그러므로 후자를 값의 오류라고 단정하지 않고 인프라 축으로 보냈다. 향후 재시도는 별도 라운드의 책임이며 R10에서는 새 재시도 로직을 만들지 않았다.

## 3. C 선택 — 응답 필드 방식

HTTP 200 계약은 유지하고 다음 필드를 추가했다.

```json
{
  "infrastructureFailureRows": 1,
  "infrastructureFailureSample": [{
    "rowNumber": 3,
    "reason": "DB_INFRASTRUCTURE",
    "rawPartnerCode": "01"
  }],
  "infrastructureFailure": true
}
```

선택 이유는 행 단위 성공·실패 격리와 기존 2xx 소비자 계약을 보존하면서도, 인프라 실패 요청을 `infrastructureFailure=true`로 기계적으로 재시도 대상으로 판단할 수 있게 하기 때문이다. HTTP 200만 남기고 held bucket에 섞는 방식은 R9 결함을 재현하므로 채택하지 않았다.

## 4. RED-A~D 실 GREEN 원문

### RED-A — 데이터 실패만

실 관리자 API + PostgreSQL에서 앞 정상 / 201자 이름 / 뒤 정상 3행을 적재했다.

```json
{
  "totalRows": 3,
  "imported": 0,
  "updated": 2,
  "heldParseFailureRows": 1,
  "heldSample": [{"rowNumber":4,"reason":"DB_CONSTRAINT","rawPartnerCode":"SOL1154R10B-BAD"}],
  "infrastructureFailureRows": 0,
  "infrastructureFailure": false
}
```

HTTP 200. 앞/뒤 정상행은 적재되고 실패행은 `PENDING + DB_CONSTRAINT`, `partners`에는 생성되지 않았다.

### RED-B — 인프라 실패만

R9와 동일하게 `SELECT ... FOR UPDATE` 후 잠금 대기 중인 요청 JDBC PID만 종료했다.

```json
{
  "totalRows": 1,
  "updated": 0,
  "heldParseFailureRows": 0,
  "heldSample": [],
  "infrastructureFailureRows": 1,
  "infrastructureFailureSample": [{"rowNumber":3,"reason":"DB_INFRASTRUCTURE","rawPartnerCode":"01"}],
  "infrastructureFailure": true
}
```

HTTP 200이지만 전부 성공으로 보이지 않는다. staging은 `01|PENDING|DB_INFRASTRUCTURE|true`였다.

### RED-C — 삭제행 UUID 유지

금지 코드가 아닌 `0004`로 배송지 생성 → 실 관리자 DELETE → 정본 XLSX 재적재 → 배송지 실 API DELETE를 수행했다.

```text
uuidCodeActive=1
uuidQaAddressActive=0
txActive=0
forbiddenSharedCodeTouchedByFixture=false
```

UUID는 기존 값으로 유지됐고, 고아 하위 참조는 0건이었다.

### RED-D — 정본 분포

```json
{"totalRows":7253,"imported":0,"updated":7253,"activeCount":7253,
 "suspendedCount":0,"heldParseFailureRows":0,"infrastructureFailureRows":0,
 "registrationDateParsedCount":2423,"createdAtLoadTimeCount":4830}
```

```text
7253|7253|0|7253|0
```

순서: active rows | ACTIVE | SUSPENDED | credit_limit NULL | registration/created_at mismatch.

## 5. 새 조합 실측

| 조합 | HTTP | 데이터 held | 인프라 | 정상 적재 | 판정 |
|---|---:|---:|---:|---:|---|
| 데이터 실패만 | 200 | 1 | 0 | 2 | PASS |
| 인프라 실패만 | 200 | 0 | 1 | 0 | PASS |
| 인프라 실패가 첫 행 + 뒤 정상 | 200 | 0 | 1 | 1 | PASS |
| 인프라 + 데이터 실패 동시 | 200 | 1 | 1 | 1 | PASS |

모든 인프라 표본은 `DB_INFRASTRUCTURE`, 모든 201자 데이터 표본은 `DB_CONSTRAINT`로 분리됐다. 네 조합 모두 실 PostgreSQL과 실 관리자 API를 사용했으며 Mockito 대체는 사용하지 않았다. 인프라 발화에는 재시도 로직을 추가하지 않았다.

## 6. 검증 원문과 산출물

```text
EcountPartnerImporterTest.failureTaxonomy_... — BUILD SUCCESSFUL
EcountPartnerImporterTest — BUILD SUCCESSFUL
PartnerMasterLoadIT.R8_한행의_DB실패는_뒤의정상행을_계속적재하고_실패행만보류한다 — BUILD SUCCESSFUL
Playwright 실 관리자 API + PostgreSQL — 1 passed (1.7m)
```

QA 원문·캡처는 `resolveQaShotsDir()`의 보호 경로에 생성됐다.

- `docs/qa/2026-08-09-1154-r10-failure-taxonomy/_local/00-environment-trigger-counts.png`
- `docs/qa/2026-08-09-1154-r10-failure-taxonomy/_local/01-transient-db-failure.png`
- `docs/qa/2026-08-09-1154-r10-failure-taxonomy/_local/02-row-failure-isolation.png`
- `docs/qa/2026-08-09-1154-r10-failure-taxonomy/_local/03-r6-r7-invariants.png`
- `docs/qa/2026-08-09-1154-r10-failure-taxonomy/_local/04-pending-row-retry.png`
- `docs/qa/2026-08-09-1154-r10-failure-taxonomy/_local/network-api-calls.json`
- `docs/qa/2026-08-09-1154-r10-failure-taxonomy/_local/cleanup-verify.txt`

## 7. 변경 파일·신규 파일·못 한 것

변경 파일:

- `services/partner-service/src/main/java/com/samhanair/logis/partner/service/EcountPartnerImporter.java`
- `services/partner-service/src/main/java/com/samhanair/logis/partner/dto/EcountPartnerImportResult.java`
- `services/partner-service/src/test/java/com/samhanair/logis/partner/service/EcountPartnerImporterTest.java`
- `clients/desktop/playwright/1154-r9-sol-reconv-real-qa/1154-r9-live-api.spec.ts`

신규 생성 파일:

- `docs/dev-reports/2026-08-09-1154-r10-failure-taxonomy.md`

QA `_local` 캡처·원문은 저장소의 `_local` ignore 규칙상 신규 추적 파일이 아니다. 커밋·푸시는 하지 않았다. R10 범위에서 못 한 것은 없다.
