# Codex DevOps Review — SP-D2 cycle 1

대상: PR #242 `feat/sp-d2-accounting-permission-migration` @ `8090c109`  
범위: Flyway V8, Testcontainers/IT 격리, CI 위험

## TM 판정

**cycle 2 진입 권고 — migration/QA 문서 불일치와 IT 격리 근거 보강 필요.**

## Findings

### Blocker 1 — dev-report 의 migration 설명이 실제 변경과 다르다

- dev-report 는 "SP-D2 는 신규 Flyway 없음"이라고 적고 있다.
  - `docs/dev-reports/sp-d2-accounting-permission-migration.md:155`
- 실제 PR 변경에는 `V8__sp_d2_accounting_page_permissions.sql` 이 포함되어 있고 신규 7개 PageCode seed 를 추가한다.
  - `services/auth-service/src/main/resources/db/migration/V8__sp_d2_accounting_page_permissions.sql:1`
  - `services/auth-service/src/main/resources/db/migration/V8__sp_d2_accounting_page_permissions.sql:25`

영향: 운영 배포/DB migration 리뷰에서 잘못된 전제("DB 변경 없음")로 승인될 수 있다.

권고: dev-report Section 6을 V8 추가 기준으로 수정한다. V7 pgcrypto 선행 적용으로 V8 중복 extension 불필요하다는 내용은 유지 가능하다.

### Major 1 — domain integrity SQL 은 CI/운영 DB에서 실행 불가한 이름을 쓴다

- 문서 SQL 은 `page_permission`/`deleted_at` 을 참조한다.
  - `docs/qa/sp-d2-accounting-permission-migration/domain-integrity-check.md:17`
  - `docs/qa/sp-d2-accounting-permission-migration/domain-integrity-check.md:25`
- 실제 migration 은 `role_page_permissions`/`is_deleted` 를 쓴다.
  - `services/auth-service/src/main/resources/db/migration/V7__add_role_page_permissions.sql:16`
  - `services/auth-service/src/main/resources/db/migration/V7__add_role_page_permissions.sql:26`

영향: 검증 SQL 이 실행되면 실패한다. PR QA evidence 로 신뢰할 수 없다.

권고: SQL 문서와 기대 결과를 `role_page_permissions` 기준으로 수정하고, 12개 회계 route가 아니라 12개 route -> 12 PageCode가 아닌 "V7 5 + V8 7 PageCode" 구조를 명확히 적는다.

### Major 2 — 일부 IT 는 `DynamicPermissionClient` @MockBean 은 있으나 기본 true stub 이 없다

- `AccountingDynamicPermissionIT` 는 기본 lenient true stub 을 가진다.
  - `services/accounting-service/src/test/java/com/samhanair/logis/accounting/it/AccountingDynamicPermissionIT.java:86`
  - `services/accounting-service/src/test/java/com/samhanair/logis/accounting/it/AccountingDynamicPermissionIT.java:88`
- 하지만 여러 기존 IT 는 `@MockBean DynamicPermissionClient` 만 있고 `canView/canEdit` true stub 이 없다. Mockito 기본 false 가 fallback 통과 정책 때문에 대개 통과하지만, "기본 true stub 으로 회귀 보호"라는 dev-report 설명과 다르다.
  - `services/accounting-service/src/test/java/com/samhanair/logis/accounting/it/JournalControllerIT.java:60`
  - `services/accounting-service/src/test/java/com/samhanair/logis/accounting/it/MonthEndCloseControllerIT.java:58`
  - `services/accounting-service/src/test/java/com/samhanair/logis/accounting/it/TrialBalanceControllerIT.java:47`
  - `services/accounting-service/src/test/java/com/samhanair/logis/accounting/it/SupplierProfileControllerIT.java:78`
  - `services/accounting-service/src/test/java/com/samhanair/logis/accounting/it/TaxInvoiceControllerIT.java:63`

영향: 현재 fallback 허용 정책에서는 깨지지 않을 수 있지만, cycle 2에서 view=false 차단 또는 row-exists 구분을 강화하면 기존 IT가 대량 실패할 수 있다.

권고: 공통 test config/helper 로 `DynamicPermissionClient` lenient default true 를 표준화하거나, 각 IT에서 의도적으로 false fallback 을 검증한다고 명시한다.

### Pass Notes

- V8 이 `CREATE EXTENSION pgcrypto` 를 반복하지 않는 것은 문제 없음. V7 에 `CREATE EXTENSION IF NOT EXISTS "pgcrypto"` 가 있다.
  - `services/auth-service/src/main/resources/db/migration/V7__add_role_page_permissions.sql:14`
- V8 은 고정 UUID seed 를 사용하므로 `gen_random_uuid()` 의존이 없다.
- 신규 ENV 는 없어 보인다. 기존 `DynamicPermissionClient` auth-service 호출 경로 재사용이다.
