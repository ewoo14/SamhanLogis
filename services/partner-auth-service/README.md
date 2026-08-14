# partner-auth-service

거래처(파트너) 자체 인증·세션 관리 서비스 (Phase 6 M2).

## Ports

| Port | Purpose                              |
| ---- | ------------------------------------ |
| 8091 | REST API + actuator + swagger-ui     |

## Database

PostgreSQL `partner_auth_db` — 3 entity:
- `partner_auth` (bizNo UNIQUE, status, password_history jsonb, failed_attempts, tutorial flags)
- `partner_login_attempt` (auth_id + bizNo + result + IP/UA + mobile)
- `partner_session` (jti UNIQUE + 만료/취소)

## Endpoints (7)

| Method | Path                                       | 설명                                       |
| ------ | ------------------------------------------ | ------------------------------------------ |
| GET    | `/api/v1/auth/partner-status?bizNo=`       | 8 status enum 응답 (NOT_FOUND_SYSTEM ...) |
| POST   | `/api/v1/auth/partner-register`            | 가입 신청 — 201 PENDING / 409             |
| PATCH  | `/api/v1/auth/partner-password`            | 비밀번호 설정/변경 — OK / USED_PW          |
| POST   | `/api/v1/auth/partner-login`               | status + token + config (M3 RPC nested)    |
| POST   | `/api/v1/auth/partner-temp-password`       | 임시 비밀번호 — 202 + sms 큐잉            |
| GET    | `/api/v1/auth/partner-expiration?bizNo=`   | 30일 슬라이딩 만료 일시                    |
| PATCH  | `/api/v1/auth/partner-tutorial`            | PC/MOBILE 튜토리얼 완료 표시               |

응답은 `ApiResponse<T>` envelope, 에러는 `PartnerAuthExceptionHandler` 가 처리.

## 핵심 비즈니스 규칙 (legacy 100% 보존)

- **3회 연속 실패 → LOCKED** (Code.js:2847)
- **30일 미사용 → LONG_UNUSED** (Code.js:2957, sliding expiration)
- **password_history 5건 FIFO** (직전 5회 비밀번호 재사용 차단)
- **DelegatingPasswordEncoder** = `{bcrypt}` 신규 + `{sha256}` legacy 호환

## Environment variables

| Variable          | Default                                                    | Description                            |
| ----------------- | ---------------------------------------------------------- | -------------------------------------- |
| `DB_HOST`         | `localhost`                                                | PostgreSQL host                        |
| `DB_PORT`         | `5432`                                                     | PostgreSQL port                        |
| `DB_NAME`         | `partner_auth_db`                                          | Database name                          |
| `DB_USER`         | 필수 환경변수                                             | Database user                          |
| `DB_PASSWORD`     | 필수 환경변수                                             | Database password                      |
| `EUREKA_URL`      | `http://localhost:8761/eureka/`                            | Eureka registry URL                    |
| `JWT_SECRET`      | 필수 환경변수                                             | HS256 signing key (>=32 byte)          |
| `DC_CONFIG_URL`   | `http://dc-config-service:8089`                            | M3 dc-config-service base URL          |

## Profiles

- `default` — PostgreSQL + Flyway 활성화 + Hibernate `ddl-auto=validate`
- `local` — H2 in-memory + Flyway 비활성화 + Eureka 비활성화 (offline dev)

## Local run

```bash
./gradlew :services:partner-auth-service:bootRun --args='--spring.profiles.active=local'
```

## Build & image

```bash
./gradlew :services:partner-auth-service:bootJar
docker build -t samhanlogis/partner-auth-service:0.1.0 services/partner-auth-service
```

## Tests

```bash
./gradlew :services:partner-auth-service:test  # unit + IT (Docker 가용 시)
```

- 단위 테스트 13건 (PartnerAuthServiceTest) — legacy 비즈니스 보존 검증
- IT 10건 (PartnerAuthControllerIT) — Testcontainers PostgreSQL + `@MockBean` (DcConfigClient + SmsClient)
- Docker 미가용 시 IT 자동 skip (`AbstractPostgresIT.DockerAvailableCondition`)

## 후속 작업

- Phase 7 — `qa/playwright/auth/` 3 spec (BizGate / 비밀번호 / 임시 PW) 가 본 서비스에 대해 happy + edge 시나리오 자동 검증
- 자세한 매트릭스는 `docs/dev-reports/migration-be-m2-partner-auth-service.md` §7 참조
