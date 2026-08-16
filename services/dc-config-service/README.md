# dc-config-service

Phase 6 M3 — DC (Discount Config) 정책 + 거래처 마스터 + 가격 계산 로그 서비스.

- 포트: **8089**
- DB: PostgreSQL `dc_config_db` (service-per-DB), Flyway 자동 마이그레이션
- 인증: gateway HeaderAuthenticationFilter + Internal-Token (M2 / estimate / partner-order 가 호출)
- Owner 분담: **Partner 마스터 owner = M3** (옵션 A) — M2 partner-auth-service 는 internal RPC 호출

## 4 Entity (V1 마이그)

| Entity | 테이블 | 비고 |
|---|---|---|
| `Partner` | `partners` | partner_code UK active, biz_no 정규화 (10자리), 14 PartnerGroup enum, credit_limit |
| `DcConfig` | `dc_configs` | legacy 16 CFG_RAW 1:1, source enum (LEGACY_CSV / NOTION_DB / ADMIN_EDIT / INTERNAL_RPC) |
| `DcRule` | `dc_rules` | GLOBAL_RATE / FIXED_AMOUNT / MODEL_PREFIX / CATEGORY, priority + effective range |
| `PriceCalculationLog` | `price_calculation_logs` | request/response/snapshot jsonb, callerService 라벨 |

## 5겹 DC 노출 가드

DC 데이터의 외부 노출은 다음 5겹 가드로 격리된다.

1. Internal-Token Filter — RPC caller 검증 (M2 / estimate / partner-order 만 허용)
2. PartnerPublicResponse vs PartnerInternalResponse — 외부에는 partner_code / name / partner_group 만 노출
3. DcConfig 응답은 internal RPC 만 — 거래처 본인 화면 노출 X
4. PriceCalculationLog 의 snapshot jsonb 는 응답 직렬화 제외
5. Phase 7 2차 추가: `dc-snapshot-strict.spec.ts` — config 변경 후 snapshot immutable 검증

## REST endpoints

| Method | Path | 권한 |
|---|---|---|
| GET | `/api/v1/partners/{partnerCode}` | 인증 (PartnerPublicResponse) |
| GET | `/api/v1/internal/partners/{bizNo}` | Internal-Token (PartnerInternalResponse — DcConfig 포함) |
| POST | `/api/v1/internal/price-calculations` | Internal-Token (calculate + log) |
| GET | `/api/v1/dc-configs/{partnerCode}` | Internal-Token (16 CFG_RAW) |
| PATCH | `/api/v1/dc-configs/{partnerCode}` | MASTER / MANAGER / DEVELOPER (admin edit, source = ADMIN_EDIT) |
| GET / POST / PATCH / DELETE | `/api/v1/dc-rules` | MASTER / MANAGER / DEVELOPER |

## Environment variables

| 변수 | 기본값 | 비고 |
|---|---|---|
| `DB_HOST` / `DB_PORT` / `DB_NAME` / `DB_USER` / `DB_PASSWORD` | localhost / 5432 / `dc_config_db` / 필수 / 필수 | DB 자격은 환경변수 필수 |
| `EUREKA_URL` | `http://localhost:8761/eureka/` | |
| `INTERNAL_TOKEN` | `CHANGE_ME_LOCAL_ONLY` (placeholder) | prod 프로파일에서 placeholder 사용 시 부팅 거부 (`InternalTokenGuard`) |

## Profiles

- `default` — PostgreSQL + Flyway + Eureka 등록
- `local` — H2 in-memory + Flyway 비활성화 + Eureka 비활성화

## Local run

```bash
./gradlew :services:dc-config-service:bootRun --args='--spring.profiles.active=local'
```

## Tests

```bash
./gradlew :services:dc-config-service:test
```

- 단위 테스트 — DC 계산 로직 + DcRule priority 매칭
- IT — Testcontainers PostgreSQL + Internal-Token caller 검증

## 후속 작업

- Phase 7 — `qa/playwright/dc/dc-rule-priority.spec.ts` 가 본 서비스의 priority 매칭을 e2e 검증.
- 자세한 매트릭스는 `docs/dev-reports/migration-be-m3-dc-config-service.md` 참조.
