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

## Environment variables

| Variable               | Default                                                   | Description                                       |
| ---------------------- | --------------------------------------------------------- | ------------------------------------------------- |
| `DB_HOST`              | `localhost`                                               | PostgreSQL host                                   |
| `DB_PORT`              | `5432`                                                    | PostgreSQL port                                   |
| `DB_NAME`              | `auth_db`                                                 | Database name                                     |
| `DB_USER`              | `samhan`                                                  | Database user                                     |
| `DB_PASSWORD`          | `samhan_dev_pw`                                           | Database password                                 |
| `EUREKA_URL`           | `http://localhost:8761/eureka/`                           | Eureka registry URL                               |
| `JWT_SECRET`           | `dev-secret-change-me-in-production-32bytes-min!`         | HS256 signing key (>=32 byte)                     |
| `INTERNAL_AUTH_TOKEN`  | `dev-internal-token-change-me`                            | service-to-service shared secret (X-Internal-Token). prod 프로파일에서 dev 기본값이면 부팅 실패 (`InternalTokenGuard`) |

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
