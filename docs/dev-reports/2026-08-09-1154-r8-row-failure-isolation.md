# PR #1154 R8 — 행 단위 DB 실패 격리

## 결론

`EcountPartnerImporter`의 행별 `upsertPartnerInRowTransaction`만 `DataAccessException`으로 흡수했다. 실패행은 기존 `heldParseFailureRows/heldSample`로 보고하고 staging은 `PENDING + reject_reason=DB_CONSTRAINT`로 남긴다. 성공행은 커밋되고 다음 행은 계속 처리된다.

`HELD`는 응답상의 held bucket이고 staging `transform_status`에는 사용할 수 없었다. Testcontainers에서 `HELD` 갱신을 시도했을 때 CHECK 제약이 즉시 거부되어 확인했다. migration은 만들지 않았다.

## RED-A/B — 수정 전 실 관리자 API 원문

대상은 `sol1154-r4-partner:28095`와 MASTER 실 관리자 헤더다. `SOL1154R8BEFORE`, 201자 거래처명 `SOL1154R8BAD`, `SOL1154R8AFTER`를 사용했다.

```text
HTTP=500
{"success":false,"code":"INTERNAL_ERROR","message":"서버 내부 오류가 발생했습니다.","data":null,"timestamp":"2026-08-09T10:13:23.202969299Z"}
```

```sql
SELECT partner_code,is_deleted FROM partners
 WHERE partner_code IN ('SOL1154R8BEFORE','SOL1154R8BAD','SOL1154R8AFTER');
SELECT raw_partner_code,transform_status,coalesce(reject_reason,'')
 FROM staging.ecount_partner_raw
 WHERE raw_partner_code IN ('SOL1154R8BEFORE','SOL1154R8BAD','SOL1154R8AFTER')
 ORDER BY source_row_no;
```

```text
partners: SOL1154R8BEFORE | false
staging:  SOL1154R8BEFORE | IMPORTED |
          SOL1154R8BAD    | PENDING  |
          SOL1154R8AFTER   | 없음
실행 직후: before=1, bad=0, after=0, stagingRows=2, HTTP=500
```

실패행은 `partners`에 0행이었고 staging만 PENDING이었다. 즉 전체 rollback은 아니었지만 실패 뒤 행이 끊겼다.

## GREEN-A/B — 수정 후 실 관리자 API 원문

```json
{"totalRows":3,"imported":2,"updated":0,"rejectedNullName":0,"skippedPlaceholder":0,"activeCount":2,"suspendedCount":0,"sourceFileHash":"3828FB314C8CCF97F893187B7DD96EEC7B4E99BEBB5656AA0CB7E1164FEC5CCE","rejectedSample":[],"excludedTrailerRows":0,"heldParseFailureRows":1,"heldSample":[{"rowNumber":4,"reason":"DB_CONSTRAINT","rawPartnerCode":"SOL1154R8H-BAD","rawName":"가…가 (201자)"}],"registrationDateParsedCount":0,"createdAtLoadTimeCount":0}
```

```sql
SELECT partner_code,is_deleted FROM partners
 WHERE partner_code IN ('SOL1154R8H-BEFORE','SOL1154R8H-BAD','SOL1154R8H-AFTER');
SELECT raw_partner_code,transform_status,coalesce(reject_reason,'')
 FROM staging.ecount_partner_raw
 WHERE raw_partner_code IN ('SOL1154R8H-BEFORE','SOL1154R8H-BAD','SOL1154R8H-AFTER')
 ORDER BY source_row_no;
```

```text
partners: BEFORE | false, AFTER | false, BAD | 없음
staging:  BEFORE | IMPORTED |, BAD | PENDING | DB_CONSTRAINT, AFTER | IMPORTED |
```

## GREEN 조합

모두 실 관리자 API + PostgreSQL SELECT 확인이다.

| 조합 | HTTP | imported | held | 결과 |
|---|---:|---:|---:|---|
| 실패 1행 + 정상 2행 | 200 | 2 | 1 | 앞/뒤 정상 적재 |
| 실패가 첫 행 | 200 | 1 | 1 | 뒤 정상 적재 |
| 실패가 마지막 행 | 200 | 1 | 1 | 앞 정상 커밋 |
| 연속 실패 2행 | 200 | 2 | 2 | 양쪽 정상 적재 |
| 전부 실패 2행 | 200 | 0 | 2 | held 건수/표본과 WARN 로그 반환 |

실 로그:

```text
WARN MIG-1 import 행 DB 적재 실패 — row=4 partnerCode=SOL1154R8H-BAD status=HELD
INFO MIG-1 import 완료 — total=3 imported=2 ... heldParseFailureRows=1 ACTIVE=2
```

## GREEN-C — 정본 7,253건

```json
{"totalRows":7253,"imported":0,"updated":7253,"rejectedNullName":0,"skippedPlaceholder":0,"activeCount":7253,"suspendedCount":0,"sourceFileHash":"064770396F5586EC7D49E8219DD19086EF48C072F4BA4FF7B1BABB0EC14D4619","excludedTrailerRows":1,"heldParseFailureRows":0,"registrationDateParsedCount":2423,"createdAtLoadTimeCount":4830}
```

```text
source hash IMPORTED/UPDATED=7253
source partner credit_limit IS NULL=7253
API updated=7253, activeCount=7253
```

전체 DB active는 7308이었다. 차집합 55건은 기존 `P-*`/`P0-*` QA 정본이며 R8이 삭제·덮어쓰지 않았다. D의 정본 판정은 API 7,253건 분포다.

## GREEN-D — 삭제행 UUID 복원

공유 금지 코드가 아닌 `SOL1154R8UUID`를 사용했다. 실 관리자 API로 적재 → shipping address 생성 → 관리자 DELETE → 재적재했다.

```text
초기 업로드 HTTP=200, imported=1
before_uuid=dcc25f64-a05e-4003-af91-e6a66f730380
관리자 DELETE HTTP=200
재적재 HTTP=200, updated=1
```

```sql
SELECT p.id::text,p.is_deleted,count(sa.id),
       count(sa.id) FILTER (WHERE sa.partner_id <> p.id)
 FROM partners p LEFT JOIN partner_shipping_addresses sa ON sa.partner_id=p.id
 WHERE p.partner_code='SOL1154R8UUID'
 GROUP BY p.id,p.is_deleted ORDER BY p.is_deleted;
```

```text
dcc25f64-a05e-4003-af91-e6a66f730380 | false | shipping_rows=1 | orphan_rows=0
```

## 테스트 및 산출물

```text
수정 전 R8 IT: 1 failed — DataIntegrityViolationException (의도한 RED)
수정 후 단일 R8 IT: BUILD SUCCESSFUL
EcountPartnerImporterTest + PartnerMasterLoadIT: BUILD SUCCESSFUL
partner-service 범위, git diff --check 통과
```

수정 파일:

- `services/partner-service/src/main/java/com/samhanair/logis/partner/service/EcountPartnerImporter.java`
- `services/partner-service/src/main/java/com/samhanair/logis/partner/dto/EcountPartnerImportResult.java`
- `services/partner-service/src/test/java/com/samhanair/logis/partner/seed/PartnerMasterLoadIT.java`

신규 파일:

- `docs/dev-reports/2026-08-09-1154-r8-row-failure-isolation.md`

못 한 것/주의:

- commit/push 금지 지시를 지켰다.
- `partner_code=1068689215`는 손대지 않았다.
- 표본은 DB 직접 INSERT/UPDATE 없이 관리자 API로 만들고 SQL은 SELECT만 사용했다.
- PowerShell 배열 평탄화 오류로 무효 실행 2회(HTTP 400/REJECT_NAME_NULL)가 있었고 최종 판정에서 제외했다.
- 보고서의 201자 `rawName`만 가독성을 위해 축약했으며 실제 API 응답·로그에는 201자 원문이 있었다.
