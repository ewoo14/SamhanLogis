# PR #1154 R1 SOL 5.6 적대검증 보고서

- 검증일: 2026-08-09 KST
- PR: `#1154 [FEAT] #896 기초거래처 적재 — 이카운트 정본 7,253건 (멱등)`
- 검증 대상: `feat/896-partner-master-load` / `168b2b8e06839d39503fb16b58c440bcc3a58f1c`
- 질문: **실 사용자 경로로 재현 가능한 결함이 있는가**

## 1. 환경 확인

### 1.1 워크트리·HEAD·배포본

```text
worktree=C:\dev\Samhan-Public\.claude\worktrees\tpartner
branch=feat/896-partner-master-load
HEAD=168b2b8e06839d39503fb16b58c440bcc3a58f1c
```

기존 `samhan-partner-service:8095`의 JAR은 2026-07-23 산출물이었다. PR HEAD를 검증하기 위해 `bootJar`를 빌드하고 공유 서비스는 교체하지 않은 채 별도 컨테이너를 `127.0.0.1:28095`에 기동했다.

```text
HEAD JAR SHA-256(local)     = 6B7DE8BF8B87E3A52627498982968097348490FEFB7925A6C49A55A6C61287F2
HEAD JAR SHA-256(container) = 6b7de8bf8b87e3a52627498982968097348490fefb7925a6c49a55a6c61287f2
HEAD API                    = http://127.0.0.1:28095
gateway                     = http://localhost:8080
partner DB                  = samhan-postgres / partner_db
health                      = 200 {"status":"UP"}
```

기동 로그 원문:

```text
Database: jdbc:postgresql://postgres:5432/partner_db (PostgreSQL 16.14)
Current version of schema "public": 13
Migrating schema "public" to version "14 - allow unset partner credit limit"
Successfully applied 1 migration to schema "public", now at version v14
Tomcat started on port 8095
```

### 1.2 실제 호출 API

mock 없이 다음 네트워크 경로를 호출했다.

```text
POST http://127.0.0.1:28095/admin/partners/imports/ecount-xlsx  -> 200 (HEAD JAR, 3회)
POST http://localhost:8080/api/auth/login                       -> 200
GET  http://localhost:8080/admin/partners/search?page=0&size=20 -> 200
GET  http://localhost:8080/admin/partners/-                     -> 200
```

게이트웨이 목록 실측:

```text
data_properties=items,total,page,size
total=7308
returnedItems=20
firstCode=-
firstName=이상덕기사님(경기퀵)
firstCodeBlank=False
```

상세 실측:

```text
partnerCode=-
name=이상덕기사님(경기퀵)
creditLimit_is_null=True
response_has_id_property=False
```

응답 원문:

- `docs/qa/pr1154-r1-list-response.json`
- `docs/qa/pr1154-r1-detail-response.json`
- `docs/qa/pr1154-r1-import1-response.json`
- `docs/qa/pr1154-r1-import2-response.json`
- `docs/qa/pr1154-r1-cleanup-import-response.json`

### 1.3 GUI·스크린샷 관측 한계

브라우저 런타임의 사용 가능 브라우저 조회 원문은 `[]`이었다. 따라서 거래처 목록·상세의 **GUI 눈검사와 스크린샷은 관측 불가**이며, 스크린샷 경로는 없다. 이를 결함 0의 근거로 사용하지 않았다. 목록·상세 데이터 노출은 위 실 게이트웨이 네트워크 응답과 SQL로만 판정했다.

## 2. 판정

## 도달 가능한 결함: 2건

1. `overrideCreatedAtForImport()`가 실제 INSERT에서 무효화되어 등록일자 2,423건 전부의 `created_at`이 적재 시각으로 저장된다.
2. UUID가 바뀐 거래처를 재적재해도 `partner_code` 행만 갱신할 뿐 기존 UUID 참조를 복구하지 않아 실제 주문 참조가 고아로 남는다.

GUI 관측은 불가했지만 두 결함 모두 HEAD JAR의 관리자 적재 API, 공유 DB 실데이터, 실제 타 서비스 참조로 재현했다.

## 3. 결함 1 — 등록일자 `created_at` 보존이 실제로 동작하지 않음

### 3.1 발화조건 카운트

1차 공식 적재 응답 원문:

```json
{"totalRows":7253,"imported":49,"updated":7204,"rejectedNullName":0,"skippedPlaceholder":0,"activeCount":7253,"suspendedCount":0,"sourceFileHash":"064770396F5586EC7D49E8219DD19086EF48C072F4BA4FF7B1BABB0EC14D4619","rejectedSample":[{"rowNumber":7256,"reason":"EXCLUDED_TRAILER","rawPartnerCode":"2026/08/09  오후 12:59:06","rawName":""}],"excludedTrailerRows":1,"heldParseFailureRows":0,"heldSample":[],"registrationDateParsedCount":2423,"createdAtLoadTimeCount":4830}
```

발화 대상은 등록일자 파싱 성공 2,423건이다. 이번 라운드에서 실제 신규 생성된 49건 중에도 등록일자가 있는 행이 45건이므로 표본은 0이 아니다.

### 3.2 호출 가능 경로 전수 grep 원문

```text
shared\common\src\main\java\com\samhanair\logis\common\entity\BaseEntity.java:46:    public void overrideCreatedAtForImport(LocalDateTime createdAt) {
services\partner-service\src\main\java\com\samhanair\logis\partner\service\EcountPartnerImporter.java:592:            partner.overrideCreatedAtForImport(createdAt);
```

`BaseEntity` 직접 상속 파일은 전 repo 191개이며 메서드는 `public`이라 모든 상속 엔티티에 노출된다. 다만 현재 HEAD에서 실행 호출점은 위 importer 1곳뿐이고, 적재 코드 밖의 현재 도달 호출 경로는 발견되지 않았다. 따라서 공개 범위 자체를 별도 결함으로 세지 않았다.

실 사용자 도달 경로:

```text
POST /admin/partners/imports/ecount-xlsx
 -> EcountPartnerImportController.uploadEcountPartnerXlsx()
 -> EcountPartnerImporter.importXlsx()
 -> upsertPartner()
 -> Partner.register()
 -> partner.overrideCreatedAtForImport(createdAt)
 -> partnerRepository.save(partner)
```

코드상 정책 원문:

```java
LocalDate registrationDate = parseRegistrationDate(cells[1]);
LocalDateTime createdAt = registrationDate == null
        ? LocalDateTime.now() : registrationDate.atStartOfDay();
...
Optional<Partner> existing = partnerRepository.findByPartnerCode(effectiveCode);
...
partner = Partner.register(effectiveCode, effectiveCode, name, address1, phone, creditLimit);
partner.overrideCreatedAtForImport(createdAt);
...
partner = partnerRepository.save(partner);
```

### 3.3 SQL 원문과 결과

```sql
SELECT COUNT(*) AS source_rows,
       COUNT(*) FILTER(WHERE p.registration_date IS NOT NULL) AS registration_present,
       COUNT(*) FILTER(WHERE p.registration_date IS NOT NULL
                        AND p.created_at=p.registration_date::timestamp)
           AS created_at_matches_registration,
       COUNT(*) FILTER(WHERE p.registration_date IS NULL) AS registration_absent
FROM staging.ecount_partner_raw s
JOIN partners p ON p.id=s.target_partner_id
WHERE s.source_file_hash=
 '064770396F5586EC7D49E8219DD19086EF48C072F4BA4FF7B1BABB0EC14D4619';
```

```text
 source_rows | registration_present | created_at_matches_registration | registration_absent
-------------+----------------------+---------------------------------+--------------------
        7253 |                 2423 |                               0 |               4830
```

이번 라운드 신규행 표본 원문:

```sql
SELECT source_row_no, raw_partner_code, raw_registration,
       p.registration_date, p.created_at
FROM staging.ecount_partner_raw s
JOIN partners p ON p.id=s.target_partner_id
WHERE s.source_file_hash='064770396F5586EC7D49E8219DD19086EF48C072F4BA4FF7B1BABB0EC14D4619'
  AND p.created_by='sol-pr1154-r1'
  AND p.registration_date IS NOT NULL
ORDER BY source_row_no LIMIT 5;
```

```text
source_row_no raw_partner_code raw_registration registration_date created_at
3             -                20230814         2023-08-14        2026-08-09 07:00:14.189139
38            01027569314      26.08.05         2026-08-05        2026-08-09 07:00:14.832888
80            01042234465      26.08.06         2026-08-06        2026-08-09 07:00:15.276450
117           01063917988      26.07.27         2026-07-27        2026-08-09 07:00:15.580778
415           1067800423       26.08.04         2026-08-04        2026-08-09 07:00:18.045302
```

신규 49건 중 `registration_date IS NOT NULL`은 45건이고 `created_at=registration_date 00:00:00`은 0건이었다. 호출은 실행되지만 Spring Data JPA의 `@CreatedDate` 생성 감사가 저장 시 값을 다시 적재 시각으로 지정하는 것이 관측된 원인이다.

### 3.4 증거 무결성 정정

기존 `docs/dev-reports/2026-08-09-896-partner-master-load-2.md`의 다음 주장은 실 DB에서 재현되지 않는다.

```text
등록일자 파싱 성공 2,423건은 created_at에 해당 날짜 00:00:00을 기록
```

실측은 **2,423건 중 0건 일치**다. 따라서 이번 라운드에서 위 주장을 정정한다.

## 4. 결함 2 — UUID 변경 후 재적재가 기존 참조를 복구하지 않음

### 4.1 매칭 키 코드 확정

`EcountPartnerImporter.java:565` 원문:

```java
Optional<Partner> existing = partnerRepository.findByPartnerCode(effectiveCode);
```

즉 매칭 키는 개발책임자 결정대로 **거래처코드 `partner_code`**다. UUID는 검색 키가 아니며 신규 생성 때만 서버 키로 발급된다.

### 4.2 발화조건 카운트

정본에 포함되고 실제 `partner_order_db.partner_orders`가 참조하며 partner-service 내부 FK 자식이 없는 거래처를 선택했다.

```text
candidate_partner_code=000011111111
partner_order_reference_count=3
local_fk_children=0
source_member=true
```

DB 직접 INSERT는 하지 않았다. 요구된 선행상태를 만들기 위해 `partner_db.partners.id`만 새 UUID로 UPDATE한 후 공식 적재 API를 다시 호출했다.

UUID 변경 직후:

```text
AFTER_UUID_MUTATION
partner_code=000011111111
active_code_rows=1
old_server_key_rows=0
new_server_key_rows=1
reference_rows=3
references_matching_new_key=0
orphan_reference_rows=3
```

### 4.3 2차 공식 적재 응답 원문

```json
{"totalRows":7253,"imported":0,"updated":7253,"rejectedNullName":0,"skippedPlaceholder":0,"activeCount":7253,"suspendedCount":0,"sourceFileHash":"064770396F5586EC7D49E8219DD19086EF48C072F4BA4FF7B1BABB0EC14D4619","rejectedSample":[{"rowNumber":7256,"reason":"EXCLUDED_TRAILER","rawPartnerCode":"2026/08/09  오후 12:59:06","rawName":""}],"excludedTrailerRows":1,"heldParseFailureRows":0,"heldSample":[],"registrationDateParsedCount":2423,"createdAtLoadTimeCount":4830}
```

재적재 직후:

```text
AFTER_REIMPORT
partner_code=000011111111
active_code_rows=1
old_server_key_rows=0
new_server_key_rows=1
staging_points_new_key=1
reference_rows=3
references_matching_new_key=0
orphan_reference_rows=3
```

중복 행은 생기지 않았다(`active_code_rows=1`). 그러나 importer는 현재 행의 새 UUID를 유지하고 staging만 새 UUID로 바꿨다. 기존 주문 참조 3건은 이전 UUID에 남아 **3/3 고아**, 복구 0건이다. 따라서 “같은 조건 2회”에서 보이지 않던 서버 키 교체 회귀가 실제 참조에서 재현된다.

검증 후 원 UUID로 복구하고 공식 적재를 한 번 더 실행했다.

```text
CLEANUP_VERIFY
partner_code=000011111111
active_code_rows=1
reference_rows=3
references_matching_current_key=3
orphan_reference_rows=0
staging_points_current_key=1
```

## 5. V14·여신한도·조회 키 실측

### 5.1 V14 원문

```sql
ALTER TABLE partners ALTER COLUMN credit_limit DROP NOT NULL;
ALTER TABLE partners ALTER COLUMN credit_limit DROP DEFAULT;
...
COMMENT ON COLUMN partners.credit_limit IS
    '여신한도. NULL=미설정(한도 제한 없음), 0=명시적 한도 0원';
```

V14는 빈 여신한도를 `NULL`로 저장할 수 있게 한다. 1차 적재 후 정본 대상 SQL:

```sql
SELECT COUNT(*) FILTER (WHERE p.credit_limit IS NULL) AS target_credit_null,
       COUNT(*) FILTER (WHERE p.credit_limit=0) AS target_credit_zero,
       COUNT(*) FILTER (WHERE p.partner_code IS NULL OR btrim(p.partner_code)='')
         AS target_code_blank,
       COUNT(*) AS target_rows
FROM staging.ecount_partner_raw s
JOIN partners p ON p.id=s.target_partner_id
WHERE s.source_file_hash=
 '064770396F5586EC7D49E8219DD19086EF48C072F4BA4FF7B1BABB0EC14D4619';
```

```text
target_credit_null=7253
target_credit_zero=0
target_code_blank=0
target_rows=7253
```

전체 DB에는 정본 대상 밖의 명시적 `credit_limit=0` 행이 2건 있으나, 이번 정본 7,253건의 0원 행은 **0건**이다.

### 5.2 조회 키 채움률

```sql
SELECT COUNT(*) FILTER (WHERE NOT is_deleted) AS active_rows,
       COUNT(*) FILTER (WHERE NOT is_deleted
                         AND partner_code IS NOT NULL
                         AND btrim(partner_code)<>'') AS active_code_filled,
       ROUND(100.0 * COUNT(*) FILTER (WHERE NOT is_deleted
                                      AND partner_code IS NOT NULL
                                      AND btrim(partner_code)<>'')
             / COUNT(*) FILTER (WHERE NOT is_deleted), 4) AS active_code_pct
FROM partners;
```

```text
active_rows=7308
active_code_filled=7308
active_code_pct=100.0000
```

정본 대상만 보면 `7,253/7,253 = 100%`이며, gateway 목록·상세 API에서도 `partnerCode`가 비어 있지 않았다.

## 6. 신규 생성 파일

- `docs/dev-reports/2026-08-09-1154-r1-sol-adversarial.md`
- `docs/qa/pr1154-r1-import1-headers.txt`
- `docs/qa/pr1154-r1-import1-response.json`
- `docs/qa/pr1154-r1-import2-headers.txt`
- `docs/qa/pr1154-r1-import2-response.json`
- `docs/qa/pr1154-r1-cleanup-import-response.json`
- `docs/qa/pr1154-r1-list-response.json`
- `docs/qa/pr1154-r1-detail-response.json`

git commit / push는 수행하지 않았다.
