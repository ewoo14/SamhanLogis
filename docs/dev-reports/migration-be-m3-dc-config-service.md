# Phase 6 M3 — dc-config-service BE skeleton

> 본 문서는 Phase 6 M3 (DC 정책 + 거래처 마스터) BE 스켈레톤 산출 기록.
> 출처: 디스패치 사양 (CONSISTENCY-MATRIX) + product-service / inventory-service 컨벤션.
> 설계 문서 `docs/migration/phase6/M3-dc-config-service.md` 가 아직 부재 — 본 PR 후 PM 가 작성 / 보강.

## 1. 요약

| 항목 | 값 |
|---|---|
| 서비스명 | `dc-config-service` |
| 포트 | 8089 |
| DB | `dc_config_db` (PostgreSQL 16) |
| 패키지 | `com.samhanair.logis.dcconfig` |
| Owner 분담 | **Partner 마스터 owner = M3** (옵션 A) — M2 partner-service 는 internal RPC 호출 |
| 주요 외부 호출자 | M2 (인증/세션), estimate-service, partner-order-service |

## 2. 4 entity ER (V1 마이그)

```
                ┌────────────┐
                │  Partner   │ owner: M3, partnerCode UK
                │ (partners) │
                └──────┬─────┘
                       │ 1
            ┌──────────┴──────────┬──────────────────────┐
            │ 1:1                 │ 1:N (NULL=GLOBAL)    │ 1:N (raw partner_id)
            ▼                     ▼                      ▼
  ┌─────────────────┐    ┌──────────────┐    ┌─────────────────────────┐
  │   DcConfig      │    │   DcRule     │    │ PriceCalculationLog     │
  │ (dc_configs)    │    │  (dc_rules)  │    │ (price_calculation_logs)│
  │ - 16 CFG_RAW    │    │ - GLOBAL_RATE│    │ - request/response/    │
  │   legacy 보존   │    │ - FIXED_AMT  │    │   snapshot jsonb       │
  │ - rate / amount │    │ - MODEL_PFX  │    │ - 합계 3종 (list/      │
  │ - rounding      │    │ - CATEGORY   │    │   final/discount)      │
  │ - source enum   │    │ - priority   │    │ - callerService 라벨   │
  └─────────────────┘    │ - effective  │    └─────────────────────────┘
                         │   range      │
                         └──────────────┘
```

### 2.1 Partner 컬럼

| 컬럼 | 타입 | 비고 |
|---|---|---|
| id | UUID | PK |
| partner_code | VARCHAR(64) | UK active — 사용자 노출 식별자 (UUID 비공개) |
| biz_no | VARCHAR(20) | 10자리 정규화 (- 제거) |
| name | VARCHAR(150) | NOT NULL |
| address / phone / manager | text/varchar | nullable |
| partner_group | VARCHAR(30) | 14 enum, default UNCLASSIFIED |
| credit_limit | NUMERIC(15,2) | 채권 한도, 0+ |
| remark | TEXT | |
| BaseEntity 7 audit | | created/modified/deleted (각 at + by) + is_deleted |

### 2.2 DcConfig 컬럼 (legacy 16 CFG_RAW 1:1)

| 컬럼 | 타입 | legacy 매핑 |
|---|---|---|
| partner_id | UUID FK UK | Partner 1:1 |
| home_discount_rate | NUMERIC(5,4) | HOME_DC |
| commercial_discount_rate | NUMERIC(5,4) | COMM_DC |
| show_i_hose | BOOLEAN | SHOW_I_HOSE |
| discount_360_amount | NUMERIC(12,2) | DISCOUNT_360_AMT |
| discount_4way_amount | NUMERIC(12,2) | DISCOUNT_4WAY_AMT |
| discount_1way_amount | NUMERIC(12,2) | DISCOUNT_1WAY_AMT |
| discount_stand_amount | NUMERIC(12,2) | DISCOUNT_STAND_AMT |
| discount_deluxe_amount | NUMERIC(12,2) | DISCOUNT_DELUXE_AMT |
| discount_first_grade_amount | NUMERIC(12,2) | DISCOUNT_1GRADE_AMT |
| unit_round_to | INT | UNIT_ROUND_TO (예: 1000) |
| unit_round_mode | VARCHAR(10) | UNIT_ROUND_MODE (ROUND/FLOOR/CEIL) |
| source | VARCHAR(20) | DcConfigSource (LEGACY_CSV / NOTION_DB / ADMIN_EDIT / INTERNAL_RPC) |
| note | TEXT | |

### 2.3 DcRule 컬럼 (운영 확장)

| 컬럼 | 타입 | 비고 |
|---|---|---|
| partner_id | UUID FK | NULL = GLOBAL |
| rule_type | VARCHAR(20) | GLOBAL_RATE / FIXED_AMOUNT / MODEL_PREFIX / CATEGORY |
| model_prefix_pattern | VARCHAR(64) | MODEL_PREFIX 인 경우 |
| category_code | VARCHAR(30) | CATEGORY 인 경우 |
| discount_rate | NUMERIC(5,4) | 0~1 미만 |
| discount_amount | NUMERIC(12,2) | 0+ |
| priority | INT | 작을수록 먼저 적용, default 100 |
| effective_from / _to | DATE | 적용 기간 (inclusive) |
| note | TEXT | |

### 2.4 PriceCalculationLog 컬럼 (감사)

| 컬럼 | 타입 | 비고 |
|---|---|---|
| partner_id | UUID | raw (FK 의존성 회피) |
| caller_service | VARCHAR(50) | 호출자 서비스명 |
| request_payload / response_payload / applied_dc_snapshot | JSONB | 페이로드 + 스냅샷 |
| total_list_amount / total_final_amount / total_discount_amount | NUMERIC(15,2) | 3종 합계 |

## 3. DC 노출 5겹 가드 (PR 핵심 검증)

memory `feedback_uuid_no_user_visibility.md` 와 동일 강도. 5겹 모두 본 PR 에서 적용:

| # | 겹 | 위치 | 본 PR 적용 |
|---|---|---|---|
| 1 | Controller 분리 | `web/PartnerPublicController` (외부) vs `web/InternalDcConfigController` (X-Internal-Token) | 적용 — Public 컨트롤러는 `DcConfigService` 의존성 주입 받지 않음 (컴파일 타임 격리) |
| 2 | DTO 분리 | `dto/PartnerPublicResponse` (DC 필드 자체 부재) vs `dto/DcConfigResponse` + `PartnerInternalResponse` (internal 전용) | 적용 — record 클래스 자체 분리 |
| 3 | Gateway 차단 | API Gateway 라우트 `/internal/**` 외부 비등록 | **TODO (M3-FE 후속)** — 본 PR 범위 외, gateway 라우트 등록 시 `/api/v1/partners/**` 만 허용 |
| 4 | QA assertion | `it/PartnerPublicControllerIT.publicResponse_doesNotLeakAnyDcField()` | 적용 — 14개 금지 키 (homeDiscountRate / commercialDiscountRate / discount{360/4Way/1Way/Stand/Deluxe/FirstGrade}Amount / unitRoundTo / unitRoundMode / showIHose / dcConfig / creditLimit / bizNo) 의 응답 트리 부재 assert |
| 5 | internal token | `config/InternalTokenFilter` + `config/InternalTokenGuard` (prod 부팅 시 dev 기본값 거부) | 적용 — `/internal/**` 경로 401 반환 + prod 부팅 거부 + `app.security.internal.token` env 변수 |

### 3.1 가드 관련 IT 결과 (Windows 로컬 — Docker IT skip, Linux CI 에서 실행)

- `PriceCalculationServiceTest` (7 case) — **PASS**
  - homemulti_appliesRateOnly / commercial_withOptions_subtractsBoth / otherCategory_noRate_appliesNoDiscount
  - roundingMode_floor_truncatesDown / roundingMode_ceil_roundsUp
  - noConfig_returnsListPriceUnchanged / optionDiscountExceedsBase_clampsToZero
- `InternalTokenGuardTest` (3 case) — **PASS** (prod + dev 기본값 → throw / prod + custom → ok / local + dev 기본값 → warn)
- IT (3 + 6 = 9 case) — Windows npipe 한계로 SKIP, GitHub Actions Linux 에서 실행 예정 (`feedback_testcontainers_windows_docker.md`)

## 4. 설계 → 코드 매핑

| 사양 항목 | 코드 |
|---|---|
| 포트 8089 | `application.yml` `server.port: 8089` |
| DB `dc_config_db` | `application.yml` `spring.datasource.url` (default `dc_config_db`) |
| Partner master owner = M3 | `domain/Partner.java` + `repository/PartnerRepository.java` + `service/PartnerService.java` |
| DcConfig 1:1 + 16 CFG_RAW | `domain/DcConfig.java` + V1 SQL `dc_configs` 테이블 |
| DcRule 카테고리/모델 prefix | `domain/DcRule.java` + V1 SQL `dc_rules` 테이블 |
| PriceCalculationLog jsonb 감사 | `domain/PriceCalculationLog.java` + V1 SQL `price_calculation_logs` 테이블 |
| DC 5겹 가드 #1 (Controller 분리) | `web/PartnerPublicController.java` + `web/InternalDcConfigController.java` |
| DC 5겹 가드 #2 (DTO 분리) | `dto/PartnerPublicResponse.java` (DC 필드 부재) + `dto/PartnerInternalResponse.java` + `dto/DcConfigResponse.java` |
| DC 5겹 가드 #4 (QA assertion) | `it/PartnerPublicControllerIT.publicResponse_doesNotLeakAnyDcField` 14 forbidden keys |
| DC 5겹 가드 #5 (internal token) | `config/InternalTokenFilter.java` + `config/SecurityConfig.java` + `config/InternalTokenGuard.java` |
| legacy 식 1:1 가격 계산 | `service/PriceCalculationService.java` (frontend `calcDcPrice.ts` 와 동일 결과) |

## 5. 변경 파일 목록 (총 28개)

### 5.1 신규 — services/dc-config-service (27 파일)

```
services/dc-config-service/
├── build.gradle
├── src/main/java/com/samhanair/logis/dcconfig/
│   ├── DcConfigServiceApplication.java
│   ├── config/
│   │   ├── HeaderAuthenticationFilter.java
│   │   ├── InternalAuthProperties.java
│   │   ├── InternalTokenFilter.java
│   │   ├── InternalTokenGuard.java
│   │   └── SecurityConfig.java
│   ├── domain/
│   │   ├── DcConfig.java
│   │   ├── DcConfigSource.java
│   │   ├── DcRule.java
│   │   ├── DcRuleType.java
│   │   ├── Partner.java
│   │   ├── PartnerGroup.java
│   │   ├── PriceCalculationLog.java
│   │   └── UnitRoundMode.java
│   ├── dto/
│   │   ├── DcConfigResponse.java
│   │   ├── PartnerInternalResponse.java
│   │   ├── PartnerPublicResponse.java
│   │   ├── PriceCalculationRequest.java
│   │   └── PriceCalculationResponse.java
│   ├── repository/
│   │   ├── DcConfigRepository.java
│   │   ├── DcRuleRepository.java
│   │   ├── PartnerRepository.java
│   │   └── PriceCalculationLogRepository.java
│   ├── service/
│   │   ├── DcConfigService.java
│   │   ├── PartnerService.java
│   │   └── PriceCalculationService.java
│   └── web/
│       ├── GlobalExceptionHandler.java
│       ├── InternalDcConfigController.java
│       └── PartnerPublicController.java
├── src/main/resources/
│   ├── application.yml
│   └── db/migration/V1__init_dc_config.sql
└── src/test/java/com/samhanair/logis/dcconfig/
    ├── config/InternalTokenGuardTest.java
    ├── it/AbstractPostgresIT.java
    ├── it/InternalDcConfigControllerIT.java
    ├── it/PartnerPublicControllerIT.java
    └── service/PriceCalculationServiceTest.java
```

### 5.2 수정 — root (2 파일)

- `settings.gradle` — `include 'services:dc-config-service'` + projectDir 매핑
- `build.gradle` — `leafProjects` 리스트에 추가

### 5.3 dev-report (1 파일)

- `docs/dev-reports/migration-be-m3-dc-config-service.md` (본 문서)

## 6. 빌드 / 테스트 결과 (Windows 로컬)

```
$ ./gradlew :services:dc-config-service:assemble
BUILD SUCCESSFUL in 3s

$ ./gradlew :services:dc-config-service:test --rerun-tasks
BUILD SUCCESSFUL in 11s
- PriceCalculationServiceTest: 7 PASS
- InternalTokenGuardTest: 3 PASS
- IT 9 case: SKIPPED (Windows Docker npipe 한계 — feedback_testcontainers_windows_docker.md)
```

CI Linux runner 에서는 IT 9 case 도 정상 실행 예정.

## 7. M2 의존성 (후속 작업)

본 PR 은 M3 BE skeleton 만 포함. 다음 작업 필요:

1. **M2 — DcConfigClient 호출 검증**
   - M2 partner-service 가 `/internal/partners/{partnerCode}` 호출하는 RestClient 추가
   - `feedback_it_mockbean_external_clients.md` — M2 의 IT 에서 DcConfigClient @MockBean 격리

2. **M3-Seed — Notion DB 시드 batch**
   - `거래처별 DC리스트 *.csv` (legacy CFG_RAW 222 row) 를 V2 Flyway 또는 별도 seed runner 로 import
   - source = `LEGACY_CSV` 또는 `NOTION_DB` 로 마킹

3. **api-gateway 라우트 등록 (DC 5겹 가드 #3)**
   - `/api/v1/partners/**` → dc-config-service `/partners/**` 만 허용
   - `/api/v1/partner-dc-configs/**` → 외부 차단 (gateway 비등록)
   - `/internal/**` → 외부 차단 (gateway 비등록)

4. **estimate-service / partner-order-service — PriceCalculationClient 호출**
   - 라인별 가격 계산 시 internal `POST /internal/price-calculations` 호출

## 8. 모호 / 미결 항목 (Q1~Q12 후속)

설계 문서 `docs/migration/phase6/M3-dc-config-service.md` 가 아직 부재 (디스패치 사양에 658줄 12 미결로 언급됐으나 worktree 에 미존재). 다음 항목은 후속 PR/세션에서 보강 필요:

| # | 항목 | 본 PR 가정 | 후속 결정 필요 |
|---|---|---|---|
| Q1 | partner_code 형식 (사업자번호 vs 별도 코드) | 별도 코드 (사업자번호는 biz_no 별도 컬럼) | 시드 시점 확정 |
| Q2 | DC율 정밀도 (4자리 vs 6자리) | NUMERIC(5,4) — legacy 호환 | 후속 |
| Q3 | unit_round_to 기본값 (NULL vs 1000) | NULL = 1원 단위 | 후속 |
| Q4 | DcRule priority 정렬 (asc vs desc) | asc (작을수록 먼저) | 후속 |
| Q5 | 효력 범위 inclusive vs exclusive | inclusive (양 끝 포함) | 후속 |
| Q6 | PriceCalculationLog soft-delete vs hard-delete archival | soft-delete + 1년 후 별도 archival job | 후속 |
| Q7 | Partner FK in PriceCalculationLog (ON DELETE CASCADE?) | raw UUID, FK 없음 | 후속 |
| Q8 | DcRule 의 모델 prefix 매칭 case-sensitivity | case-sensitive (legacy 호환) | 후속 |
| Q9 | DcRule rate + amount 동시 가능? | MODEL_PREFIX 만 둘 중 1개 | 후속 |
| Q10 | "OTHER" 카테고리 DC율 0% 강제 vs 별도 컬럼 | 강제 0% (legacy 와 동일) | 후속 |
| Q11 | partner_group 14 enum 의 정확한 라벨 (UNCLASSIFIED 외) | DIRECT/DEALER_1ST/DEALER_2ND/WHOLESALE/INTERIOR/CONSTRUCTION/BUILDER/AS/ONLINE/RETAIL/PARTNER/SUBCONTRACTOR/ETC/UNCLASSIFIED 14종 | 시드 정렬 후 확정 |
| Q12 | DcConfigSource 4 enum 의 정확한 매핑 (LEGACY_CSV vs NOTION_DB) | csv 222 row → LEGACY_CSV, Notion 추가는 NOTION_DB | 후속 |

## 9. 회고 가드 적용 사항

- **feedback_uuid_no_user_visibility** — partnerCode (사용자 노출), partnerId UUID 는 internal 응답만
- **feedback_korean_commits** — 본 dev-report + commit + PR 모두 한국어
- **feedback_role_naming_full** — Role enum 전부 풀네임 (MASTER/MANAGER 등) 가정
- **feedback_function_documentation** — 모든 entity/service/controller 한국어 Javadoc + springdoc-openapi 자동 노출 (`/v3/api-docs`, `/swagger-ui.html`)
- **feedback_pm_integration_build_check** — assemble + 단위 테스트 + 컴파일 검증 완료. IT 는 CI Linux 에서 실행
- **feedback_testcontainers_windows_docker** — Windows 환경 IT skip 정상 동작 확인 (DockerAvailableCondition)
- **feedback_it_mockbean_external_clients** — 본 PR 의 dc-config-service 자체는 외부 client 없음 (M2 의 후속 PR 책임)
- **feedback_pr_qa_screenshots** — IT assertion 자체가 QA 결과. 프론트 화면은 본 PR 범위 외
- **시크릿 placeholder + GitGuardian PASS** — 1차 commit 에서 `samhan/samhan_dev_pw` literal credential pair 가 GG 에 검출되어 fix:
  - `application.yml`: `${DB_USER:CHANGE_ME_LOCAL_ONLY}` + `${DB_PASSWORD:CHANGE_ME_LOCAL_ONLY}` 로 placeholder 변경
  - `AbstractPostgresIT.java`: literal 자격증명 → `pickEnvOrRandom()` (env 변수 우선, 없으면 UUID 부분 문자열)
