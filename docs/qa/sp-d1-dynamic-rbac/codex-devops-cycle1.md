# SP-D1 동적 RBAC — Codex DevOps Cycle 1 Review

대상: PR #241, commit `1904b65e`  
범위: Section E + migration/test isolation cross-check  
결론: **merge blocker 있음. cycle 2 진입 권고.**

## Findings

### BLOCKER 1 — V7 migration이 `gen_random_uuid()` 확장 의존성을 명시하지 않음

- 위치:
  - `services/auth-service/src/main/resources/db/migration/V7__add_role_page_permissions.sql:12-26`

`id UUID NOT NULL DEFAULT gen_random_uuid()` 를 사용하지만 migration 안에 `CREATE EXTENSION IF NOT EXISTS pgcrypto;` 가 없다. auth-service DB에 기존 migration이 확장을 이미 켠다는 보장이 없으면 신규 환경/CI/Testcontainers에서 Flyway가 실패할 수 있다.

권고: 같은 migration 또는 선행 migration에서 pgcrypto extension을 명시해야 한다.

### BLOCKER 2 — 84 row seed와 검증 문서가 서로 다른 스키마/역할 체계를 사용함

- 위치:
  - `services/auth-service/src/main/resources/db/migration/V7__add_role_page_permissions.sql:40-157`
  - `docs/qa/sp-d1-dynamic-rbac/domain-integrity-check.md:8-16`
  - `docs/dev-reports/sp-d1-dynamic-rbac.md:102-121`

실제 seed는 `role_page_permissions` 에 `MASTER/MANAGER/ACCOUNTANT/SALES/WAREHOUSE/DISPATCH/INVENTORY` 7역할과 dot pageCode 12개를 넣는다. QA/dev-report는 `page_permission`, `DEVELOPER` 포함, MASTER row 없음, 대문자 page code를 전제로 한다. 운영 검증 SQL이 실제 migration을 검증하지 못한다.

권고: migration 기준으로 QA SQL과 dev-report를 재작성하고, seed count 84 및 역할별 12개를 실제 테이블명/컬럼명으로 검증해야 한다.

### MAJOR 1 — MASTER seed row가 존재해 "MASTER는 항상 전권 + 편집 불가" 운영 정책과 충돌함

- 위치:
  - `services/auth-service/src/main/resources/db/migration/V7__add_role_page_permissions.sql:61-73`
  - `docs/qa/sp-d1-dynamic-rbac/domain-integrity-check.md:73-83`

domain-integrity-check는 MASTER row 기대값을 0으로 적었지만 migration은 MASTER 12행을 넣는다. 운영 정책상 MASTER를 DB override 대상으로 둘지 하드코딩 full access로 둘지 불명확하다.

권고: MASTER를 seed에서 제외하고 service에서 full access로 hardcode하거나, seed 유지 시 API에서 MASTER update/delete를 차단하고 검증 SQL도 그 정책에 맞춰야 한다.

### MAJOR 2 — accounting-service IT 격리는 되어 있으나, fallback 정책 회귀를 숨길 수 있음

- 위치:
  - `services/accounting-service/src/test/java/com/samhanair/logis/accounting/it/TaxInvoiceEmitNtsIT.java:80-93`
  - `services/accounting-service/src/test/java/com/samhanair/logis/accounting/it/TaxInvoiceEmitNtsIT.java:120-121`

`@MockBean DynamicPermissionClient` 격리 자체는 좋다. 하지만 모든 기존 IT가 `canView/canEdit=true` 로 stub 되어 있어, 실제 RestClient 파싱 실패나 auth-service 4xx fallback이 드러나지 않는다.

권고: 별도 IT/단위 테스트로 `canView=true, canEdit=false -> 403`, `canView=false, canEdit=false -> 정책상 403 또는 통과`를 명시 검증해야 한다.

### MAJOR 3 — service-to-service auth header/internal token 전달이 불명확함

- 위치:
  - `services/accounting-service/src/main/java/com/samhanair/logis/accounting/client/DynamicPermissionClientImpl.java:29-70`
  - `services/auth-service/src/main/java/com/samhanair/logis/auth/config/SecurityConfig.java:45`

auth-service는 `/auth/admin/permissions/**` 를 authenticated로 요구한다. accounting `RestClient` 호출에는 `X-User-Id`, `X-User-Role`, internal token 전파가 보이지 않는다. 실제 운영에서는 401/403 후 fallback=false가 될 수 있고, 현재 POC 로직은 이를 row 없음과 구분하지 못한다.

권고: load-balanced RestClient 공통 interceptor가 internal auth를 주입하는지 확인하고, 없다면 client에 명시해야 한다. 또한 401/403 fallback 정책을 보안 요구와 맞춰야 한다.

## DevOps Decision

**APPROVE 불가.**  
migration 자체는 84 row 형태를 만들지만, extension 의존성, 검증 문서 drift, MASTER 정책 불명확, service-to-service auth/fallback 검증 부재가 남아 있다. cycle 2에서 migration/QA SQL/IT를 같은 계약으로 정렬해야 한다.
