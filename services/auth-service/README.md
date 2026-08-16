# auth-service

JWT issuer + account management for SamhanLogis MSA (Phase 1, plan §3.4).

## Ports

| Port | Purpose                                |
| ---- | -------------------------------------- |
| 8081 | REST API + actuator                    |

## Database

PostgreSQL `auth_db` — owns the `accounts` table (UUID PK, soft-deleted).

## Endpoints

| Method | Path             | Auth                            | Description                          |
| ------ | ---------------- | ------------------------------- | ------------------------------------ |
| POST   | `/auth/login`    | public                          | Issue JWT for login_id + password    |
| POST   | `/auth/register` | `ROLE_MASTER` (gateway header)  | Create new account (BCrypt hash)     |
| GET    | `/auth/me`       | gateway-set `X-User-Id`         | Echo current user profile            |

All responses are wrapped in `ApiResponse<T>`; errors surface as
`BusinessException` with Korean messages.

## Ecount migration page codes

| Slice | Flyway | PageCode |
|---|---|---|
| MIG-5 | V18 | `ecount.mig5.stock-transfer`, `ecount.mig5.expense-voucher`, `ecount.mig5.deposit-report` |
| MIG-6 | V19 | `ecount.mig6.bank-account`, `ecount.mig6.employee`, `ecount.mig6.employee-card`, `ecount.mig6.payroll-employee`, `ecount.mig6.fixed-asset-type` |

MIG-5/6 seed는 MASTER/MANAGER edit 허용을 role_page_permissions에 추가한다.

## SP-D7 permission seed

Flyway `V38__seed_sp_d7_remaining_preauthorize_page_codes.sql`은 신규
`notifications.center` PageCode, SP-D7 전용 `.view` PageCode 4건, write-only-before 재사용
page 9건의 `VIEW` grant를 `PARTNER`를 제외한 내부 role에 보강한다.
재사용 page의 기존 active row는 `can_view IS DISTINCT FROM TRUE`일 때만 `TRUE`로 갱신하고,
전용 page는 신규 insert만 수행해 기존 VIEW endpoint widening을 피한다.

## Phase 1 권한 재편 — 계정 × page × 7-action (V39)

role 기반 2-action(`role_page_permissions`)을 **계정 단위 × page × 7-action**으로 재편했다.

- 신규 테이블: `role_page_permission_templates`(role별 7-action 템플릿, 비강제), `account_page_permissions`(계정 UUID × page × 7 boolean, enforcement source).
- 7-action: VIEW / CREATE / UPDATE / DELETE / RESTORE / DOWNLOAD / PRINT.
- internal: `GET /auth/internal/permissions/check?accountId&pageCode&action`, `GET /auth/internal/permissions/account/{accountId}`(map).
- admin(MASTER 매트릭스): `GET /auth/admin/permissions/accounts`, `GET|PUT /auth/admin/permissions/account/{accountId}`, `POST .../apply-template`, `POST .../copy-from`, `GET|PUT /auth/admin/permissions/templates`, `POST /auth/admin/permissions/bulk`.
- 자기-권한: `GET /auth/admin/permissions/my`는 `X-User-Id` 기준 account 7-action map을 반환한다(MASTER 전 page all-true / PARTNER deny / 누락·parse 실패 fail-closed).
- `V39__account_page_permissions_overhaul.sql`이 기존 `role_page_permissions`를 templates로 분해(VIEW→VIEW, EDIT→CREATE+UPDATE+DELETE, RESTORE/DOWNLOAD/PRINT 보존 매핑)한 뒤, `accounts JOIN templates`(role NOT IN MASTER/PARTNER)로 계정별 행을 materialize한다. 행동보존(회귀 0). `role_page_permissions`는 deprecated 코멘트만 남기고 drop하지 않는다.

## Environment variables

| Variable               | Default                                                   | Description                                       |
| ---------------------- | --------------------------------------------------------- | ------------------------------------------------- |
| `DB_HOST`              | `localhost`                                               | PostgreSQL host                                   |
| `DB_PORT`              | `5432`                                                    | PostgreSQL port                                   |
| `DB_NAME`              | `auth_db`                                                 | Database name                                     |
| `DB_USER`              | `samhan`                                                  | Database user                                     |
| `DB_PASSWORD`          | `infrastructure/.env`                                    | Database password                                 |
| `EUREKA_URL`           | `http://localhost:8761/eureka/`                           | Eureka registry URL                               |
| `JWT_SECRET`           | `dev-secret-change-me-in-production-32bytes-min!`         | HS256 signing key (>=32 byte)                     |
| `INTERNAL_AUTH_TOKEN`  | `CHANGE_ME_LOCAL_ONLY`                                    | service-to-service shared secret (X-Internal-Token). prod 프로파일에서 placeholder면 부팅 실패 (`InternalTokenGuard`) |

## Profiles

- `default` — PostgreSQL + **Flyway 활성화** (`db/migration/V*.sql` 자동 적용) + Hibernate `ddl-auto=validate`
- `local` — H2 in-memory + Flyway 비활성화 + Hibernate `ddl-auto=create-drop` (offline dev)
- `prod` — `default` 와 동일하되 `InternalTokenGuard` 가 dev 기본 토큰 사용 시 부팅 거부

## Local run

```bash
./gradlew :services:auth-service:bootRun --args='--spring.profiles.active=local'
```

## Build & image

```bash
./gradlew :services:auth-service:bootJar
docker build -t samhanlogis/auth-service:0.1.0 services/auth-service
```

## Phase 8 호환성 가드 (PR #88 / #89 / #90)

- **chained-default 환경변수** — `SAMHAN_<KEY>:${LEGACY_KEY:default}` 패턴 적용 (legacy 호환 100%, 무중단 cutover 가능)
- **12-factor 12/12 OK** + RDS 호환 (standard SQL 만, RDS 미지원 extension 부재)
- **AWS 서비스 매핑** — `docs/migration/phase8/M-AWS-COMPATIBILITY-guards.md` 본 service 항목 참조
- **env-template** — `infrastructure/env-templates/auth-service.env` 보유
- **ServiceDiscoveryClient (Phase 11 활성 대비)** — `shared:discovery-abstraction` 의존성 도입은 Phase 11 cutover 시점 (현재 Eureka 자체 EC2 운영 채택 — D-P8-07 보강)

## Phase 9 신규 service 매트릭스 (참조)

본 service 와 향후 연동될 Phase 9 신규 4 service:

| Service                | Port | DB                | 도메인                              |
| ---------------------- | ---- | ----------------- | ----------------------------------- |
| partner-service        | 8095 | partner_db        | 거래처 마스터 + 신용한도 + 거래내역 |
| groupware-service      | 8092 | groupware_db      | 결재선 + 메신저 + 일정              |
| notification-service   | 8093 | notification_db   | 푸시/이메일/SMS 통합 라우터         |
| dashboard-service      | 8094 | dashboard_db      | KPI + 실시간 재고 + 매출            |

상세는 `docs/migration/phase9/M-PHASE-9-readiness.md` 참조.
