# partner-service

Phase 9 W1 — 거래처 마스터 도메인.

- 포트: **8095**
- DB: PostgreSQL `partner_db` (service-per-DB), Flyway 자동 마이그레이션
- 외부 의존: 없음 (self-contained, M-PHASE-9-readiness §6 의존성 매트릭스 일관)

## 도입 배경

slip-service M5 (`/from-*` endpoint) 가 현재 partnerCode 만 받고 partnerId 정규화를 자체 보유한 lookup 없이 처리하고 있다. partner-service 가 `GET /internal/partners/{partnerCode}` endpoint 를 제공함으로써 형제 service 가 partnerCode → partnerId / 마스터 / 신용 정보를 단일 호출로 획득할 수 있도록 한다.

slip-service 측 client (PartnerClient) 구현 시점은 Phase 9 W5 또는 Phase 11 cutover 시점에 별도 PR 로 진행 (본 PR scope 외).

## Domain (2 entity + 2 enum)

| Entity | 비고 |
|---|---|
| `Partner` | 거래처 마스터 (partnerCode UK + bizNo + name + address + phone + creditLimit + outstandingBalance + status) |
| `PartnerCreditHistory` | 신용 거래 이력 (append-only, balance / creditLimit 스냅샷) |

| Enum | 값 |
|---|---|
| `PartnerStatus` | `ACTIVE` / `SUSPENDED` / `TERMINATED` |
| `CreditEventType` | `SLIP_ISSUED` / `PAYMENT` / `CREDIT_LIMIT_CHANGE` |

## REST endpoints

### Internal (X-Internal-Token 필수)

| Method | Path | 권한 | 설명 |
|---|---|---|---|
| GET | `/internal/partners/{partnerCode}` | ROLE_MASTER (token) | partnerCode → 마스터 + partnerId UUID lookup. M5 의존성 해소 |
| POST | `/internal/partners/find-by-codes` | ROLE_MASTER (token) | partnerCode N건 동시 조회 batch endpoint (W5 신규, D-P9-16 — fan-out 직렬 RPC 회피용) |
| POST | `/internal/partners/lookup-by-ids` | ROLE_MASTER (token) | partnerId N건 → `partners[].id/name` batch endpoint (MIG-16 — accounting admin partnerName N+1 회피용) |

#### bulk endpoint (W5 신규, D-P9-16)

`POST /internal/partners/find-by-codes` 입력 = JSON 배열 (`["P-2026-0001","P-2026-0002"]`).

- 빈 배열 → 200 + 빈 리스트 (DB 조회 회피)
- 미존재 코드는 응답에서 누락 (호출 측이 응답 partnerCode 매칭으로 분기)
- distinct 정규화 + blank/null 항목 제거 (service 계층)
- 토큰 누락 → 403, 토큰 불일치 → 401 (단건 lookup 패턴 일관)

dashboard-service `PartnerCodeResolver.resolveAll(List<String>)` 가 본 endpoint 의 첫 소비자 — cache hit / miss 분리 + miss 만 1회 bulk RPC.

#### partnerId name lookup (MIG-16)

`POST /internal/partners/lookup-by-ids` 입력 = JSON object (`{"ids":["uuid-1","uuid-2"]}`).

- 응답 = `ApiResponse<{partners:[{id,name}]}>`
- 빈 배열 → 200 + `partners: []`
- 일부 미존재 UUID는 응답에서 누락
- accounting-service `PartnerLookupClient.findByPartnerIdsBatch()`가 첫 소비자

### Admin (X-User-* 헤더, gateway 경유)

| Method | Path | 권한 | 설명 |
|---|---|---|---|
| POST | `/admin/partners` | MASTER / MANAGER | 신규 거래처 등록 |
| GET | `/admin/partners/{partnerCode}` | MASTER / MANAGER / SALES / ACCOUNTANT | 단건 조회 |
| PUT | `/admin/partners/{partnerCode}` | MASTER / MANAGER | 프로필 수정 (name / address / phone) |
| DELETE | `/admin/partners/{partnerCode}` | MASTER | soft-delete |
| GET | `/admin/partners/{partnerCode}/credit-history` | MASTER / MANAGER / ACCOUNTANT | 신용 거래 이력 페이지 조회 |

응답 = `ApiResponse<T>` 봉투 (success / code / message / data / timestamp). UUID 비공개 가드 일관 — admin 응답에 partner UUID 미포함, partnerCode 만 노출.

### SP-D7 첨부 조회 권한 전환 (2026-05-27)

거래처 첨부와 방문 첨부 조회 endpoint 4건은 SP-D7 전용 `partners.detail.view` VIEW 동적 권한으로 전환했다.
`partners.detail` 기존 VIEW endpoint widening을 피하기 위해 auth-service V38은 전용 page에만 내부 role VIEW grant를 insert한다.

## 환경변수

`infrastructure/env-templates/partner-service.env` 참조.

| 변수 | 표준 / legacy fallback | 용도 |
|---|---|---|
| `SAMHAN_PARTNER_DB_HOST` / `PORT` / `NAME` / `USER` / `PASSWORD` | LEGACY_DB_* | DataSource (chained-default) |
| `SAMHAN_INTERNAL_TOKEN` | `INTERNAL_AUTH_TOKEN` | X-Internal-Token expected 값 |
| `SAMHAN_PARTNER_SERVICE_URL` | (신규 표준만) | 형제 service 가 본 service 호출 시 base URL |
| `SAMHAN_DISCOVERY_PROVIDER` | `eureka` default | Phase 11 cutover 시점 `aws-cloud-map` 으로 전환 |
| `EUREKA_URL` | (legacy) | service discovery |

`InternalTokenGuard` 가 부팅 시 prod 프로파일 + dev 기본값 조합을 거부.

## 테스트

```bash
# 단위 (JDK 17 한글 path 환경에서도 PASS)
./gradlew :services:partner-service:test --tests *Test

# IT (Docker 가용 환경, Linux runner 권장)
./gradlew :services:partner-service:test --tests *IT
```

| 테스트 | 비고 |
|---|---|
| `PartnerServiceTest` | Partner 도메인 단위 (8 case) — register / changeCreditLimit / increase·decreaseBalance / canIssueSlip / 상태 전이 |
| `PartnerInternalControllerIT` | Internal endpoint (8 case) — 토큰 누락(403)/불일치(401)/단건 lookup(200)/단건 미존재(404) + W5 bulk endpoint 정상/빈/일부 미존재 누락/토큰 누락 403 |
| `PartnerAdminControllerIT` | Admin CRUD (5 case) — 403 익명 / 403 SALES / 200 MANAGER 등록 / 409 중복 / DELETE soft |

IT 베이스 = `AbstractPostgresIT` (Testcontainers PostgreSQL 16 + Docker 미가용 환경 skip).

## Phase 11 cutover 영향

- `SAMHAN_DISCOVERY_PROVIDER=aws-cloud-map` 으로 토글 시 `shared:discovery-abstraction` 의 `AwsCloudMapServiceDiscoveryClient` 활성. 본 service 코드 변경 없음 (build.gradle / yml 한 줄 수준).
- DataSource 는 chained-default 패턴이므로 RDS 호환. AWS Secrets Manager 마이그레이션 시 `spring.config.import: aws-secretsmanager:samhan/<env>/...` 추가만 (코드 변경 없음).
- Flyway V1 = PostgreSQL standard SQL 만 사용 (RDS 미지원 extension 부재).

## 관련 문서

- `docs/migration/phase9/M-PHASE-9-readiness.md` — Phase 9 진입 plan
- `docs/dev-reports/phase9-step-1-partner-service.md` — W1 dev report
- `docs/dev-reports/phase9-step-5-retrospective.md` — W5 dev report (findByCodes bulk endpoint 채택)
- `docs/dev-reports/phase9-retrospective.md` — Phase 9 종합 회고
- `migration/decisions/DECISIONS.md` D-P9-03 / D-P9-04 / D-P9-05 / D-P9-16
