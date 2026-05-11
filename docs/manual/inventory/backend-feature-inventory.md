# Backend 17 Service 기능 Inventory (W10-7 / Step 7 — Operator Manual Stage 1)

> **branch**: `feature/integrated-phase-10-step-7-operator-manual`
> **작업일**: 2026-05-09
> **목적**: 개발책임자가 누락 기능을 한눈에 확인할 수 있는 종합 카탈로그. 운영 매뉴얼 작성의 기반.
> **범위**: 17 서비스 (eureka + gateway + 14 backend + arologis + logging) 의 REST endpoint × 권한 × 비즈니스 로직 × 시드 row × 구현 상태 × 누락 후보.
> **인용 출처**: `services/<X>/src/main/java/.../web` + `services/<X>/src/main/resources/db/migration/*.sql` + `docs/dev-reports/local-test-seed-stage{1,2,3,4}.md` + `docs/migration/ecount-reference/` 16 캡처.

---

## 0. 종합 통계

| 항목 | 값 | 비고 |
|---|---|---|
| Service 수 | **17** | eureka(8761) + gateway(8080) + 14 backend + arologis + logging |
| 활성 REST endpoint | **약 145건** | controller 메서드 기준 (internal + admin + public 합산) |
| 구현 상태 분포 | ✅ 완료 122 / ⏳ 부분 18 / ❌ 누락 5 | 누락은 endpoint 자체 미구현, 부분은 stub/skeleton |
| 시드 row 합계 | **약 1,750 row** | Stage 1+2+3+4 + V1 migration 65 row(account) + 16 employee + 5 dept + 2 warehouse |
| 권한 매트릭스 distinct ROLE | 9개 | MASTER / MANAGER / SALES / WAREHOUSE / INVENTORY / ACCOUNTANT / PARTNER / DRIVER / DEVELOPER (+ INTEGRATION / PARTNER_ADMIN 시스템 내부) |
| 누락 기능 후보 (이카운트 reference 기반) | **42건** | 회계 17 보고서 중 14건 미구현 + 거래처 4탭 일부 + 품목 매트릭스 추가 + UI 없음 등 |

### 0.1 Role 표기 규약 (memory `feedback_role_naming_full.md`)

| Full | 약어 | 설명 |
|---|---|---|
| MASTER | — | 회사 대표(김미선) + 슈퍼 관리자 |
| MANAGER | — | 부서장 / 영업총괄 |
| SALES | — | 영업직원 |
| WAREHOUSE | — | 창고 작업자 (출고 패킹) |
| INVENTORY | — | 재고 관리자 (이동/조정) |
| ACCOUNTANT | — | 회계 담당 |
| PARTNER | — | 외부 거래처 (주문서) |
| DRIVER | — | 배송 기사 (모바일 서명) |
| DEVELOPER | — | 개발팀 (read-only 전체) |
| INTEGRATION | — | 시스템 간 (X-Internal-Token 후 가상) |
| PARTNER_ADMIN | — | 거래처 결재자 (PARTNER 의 상위) |

---

## 1. eureka-server (port 8761) — Discovery

### 1.1 REST Endpoint
| Method | Path | 권한 | 설명 | 구현 상태 |
|---|---|---|---|---|
| GET | `/eureka/apps` | open(LAN) | 등록된 service 목록 | ✅ |
| POST | `/eureka/apps/{name}` | open(LAN) | service self-register | ✅ |
| GET | `/eureka/dashboard` | open(LAN) | Web UI | ✅ |

> Spring Cloud Netflix Eureka 표준 endpoint 만 사용. 자체 controller 없음.

### 1.2 비즈니스 로직
- 14 backend service 의 self-registration 수신
- gateway 의 service discovery 응답
- 30초 heartbeat / 90초 eviction (default)

### 1.3 시드 데이터
- 없음 (런타임 등록만)

### 1.4 누락 기능
- ❌ Eureka Security (basic auth) — 운영 환경 LAN 격리 가정. Phase 11 AWS 시 보완 필요.

---

## 2. api-gateway (port 8080) — Routing + JWT

### 2.1 Filter / Config
| 구성 | 위치 | 역할 |
|---|---|---|
| `JwtAuthenticationGatewayFilterFactory` | `filter/` | JWT 검증 → X-User-Id / X-User-Role / X-User-Login 헤더 주입 |
| `CorsConfig` | `config/` | 클라이언트 origin 화이트리스트 |
| `JwtProperties` | `config/` | 비밀키 + TTL |

### 2.2 라우팅
- `application.yml` 의 `spring.cloud.gateway.routes` 로 14 backend 매핑
- `/api/auth/**` → auth-service, `/api/users/**` → user-service, ... 등

### 2.3 누락 기능
- ❌ Rate limiting (Redis bucket) — 모바일 폭주 대비 미구현
- ❌ Circuit breaker (Resilience4j) — service 장애 시 cascading failure 차단 없음
- ❌ 요청/응답 audit logging — logging-service 와 미연계

---

## 3. auth-service (port 8081) — 로그인 + JWT + 계정

### 3.1 REST Endpoint
| Method | Path | 권한 | 설명 | 구현 상태 |
|---|---|---|---|---|
| POST | `/auth/login` | 모두 | 로그인 + JWT 발급 (8h TTL) | ✅ |
| POST | `/auth/register` | MASTER | 신규 계정 등록 | ✅ |
| GET | `/auth/me` | 인증된 모두 | 자기 자신 정보 | ✅ |
| POST | `/auth/internal/accounts` | INTERNAL_TOKEN | 시스템 계정 생성 (user-service → auth-service) | ✅ |
| PATCH | `/auth/internal/accounts/{id}/role` | INTERNAL_TOKEN | role 변경 | ✅ |
| PATCH | `/auth/internal/accounts/{id}/display-name` | INTERNAL_TOKEN | 표시명 변경 | ✅ |
| PATCH | `/auth/internal/accounts/{id}/disable` | INTERNAL_TOKEN | 비활성화 | ✅ |
| DELETE | `/auth/internal/accounts/{id}` | INTERNAL_TOKEN | 소프트 삭제 | ✅ |

### 3.2 비즈니스 로직
- BCrypt 패스워드 해싱
- JWT issuance (HS256) — claims: userId / loginId / role / displayName
- soft-delete (BaseEntity)
- `last_login_at` 갱신

### 3.3 시드 데이터
- V1__init_account.sql: schema only (row 0)
- 16 account = `OrgChartSeeder` (user-service) → `/auth/internal/accounts` 호출로 생성
  - `kimmiseon` (MASTER, CEO 김미선) / `parkjisung` (MANAGER) / `leeseongmi` (ACCOUNTANT) / `heoyujin` (ACCOUNTANT) 등

### 3.4 누락 기능
- ❌ **비밀번호 재설정** (PASSWORD_RESET) — 이메일 기반 reset link 미구현
- ❌ **다중 device 로그인 관리** — 동시 로그인 device 추적/revoke 없음
- ❌ **2FA / OTP** — 보안 강화 옵션
- ❌ **로그인 이력 조회 endpoint** — `last_login_at` 컬럼만 존재, history table 없음
- ⏳ JWT refresh token — 현재 access token 만 발급. 8h 만료 후 재로그인 필요

---

## 4. user-service (port 8083) — 사원 + 부서

### 4.1 REST Endpoint
| Method | Path | 권한 | 설명 | 구현 상태 |
|---|---|---|---|---|
| GET | `/users/departments` | 인증 모두 | 부서 list (5건) | ✅ |
| GET | `/users/employees` | 인증 모두 | 직원 list + filter | ✅ |
| GET | `/users/employees/{id}` | 인증 모두 | 직원 단건 | ✅ |
| POST | `/users/employees` | MASTER, MANAGER | 직원 신규 (auth account 자동 생성) | ✅ |
| PATCH | `/users/employees/{id}` | MASTER, MANAGER | 직원 수정 | ✅ |
| PATCH | `/users/employees/{id}/role` | MASTER | role 변경 | ✅ |
| POST | `/users/employees/{id}/terminate` | MASTER | 퇴사 처리 (soft) | ✅ |
| POST | `/users/employees/lookup` | 인증 모두 | 다건 lookup (loginId list) | ✅ |
| GET | `/users/org-chart` | 인증 모두 | 조직도 트리 | ✅ |
| GET | `/internal/users/{userId}` | INTERNAL_TOKEN | 다른 service 가 직원 조회 | ✅ |
| POST | `/internal/users/verify-bulk` | INTERNAL_TOKEN | userId list 검증 (slip 발행 시) | ✅ |

### 4.2 비즈니스 로직
- 직원 신규 → auth-service 의 `/auth/internal/accounts` 호출 (분산 트랜잭션 — 실패 시 보상)
- 부서 5개 fixed (영업부 / 회계부 / 창고부 / 재고부 / 경영지원)
- 조직도 트리 = 부서 → 직원 (계층 1단)
- soft-delete + terminate_date 별도 컬럼

### 4.3 시드 데이터 (`OrgChartSeeder`)
- **5 departments**: 영업부 / 회계부 / 창고부 / 재고부 / 경영지원
- **16 employees**: kimmiseon(MASTER) + parkjisung(MANAGER) + leeseongmi/heoyujin/rahaeram/kimeunji/parkjisu(ACCOUNTANT 5명) + 기타 SALES/WAREHOUSE/INVENTORY/DRIVER 9명
- toggle: `USER_SEED_ORG=true`

### 4.4 누락 기능
- ❌ **부서 CRUD endpoint** — V1 fixed 5개. 부서 신규/이름변경 UI/API 미제공
- ❌ **계층 부서** (사업부 → 팀 → 파트) — 현재 단일 계층
- ❌ **권한 그룹 / 역할 (Role) CRUD** — ROLE 9개 enum 고정
- ❌ **사진 / 프로필** — 직원 사진 컬럼 없음
- ⏳ 직원 정보 변경 이력 (audit log) — BaseEntity audit columns 만 있음, 변경 history table 없음

---

## 5. product-service (port 8084) — 제품 + HVAC 단가

### 5.1 REST Endpoint
| Method | Path | 권한 | 설명 | 구현 상태 |
|---|---|---|---|---|
| GET | `/products` | 인증 모두 | 제품 list + filter | ✅ |
| GET | `/products/{id}` | 인증 모두 | 단건 | ✅ |
| POST | `/products` | MASTER/MANAGER/DEVELOPER | 신규 등록 | ✅ |
| PATCH | `/products/{id}` | MASTER/MANAGER/DEVELOPER | 수정 | ✅ |
| PATCH | `/products/{id}/price` | MASTER/MANAGER/DEVELOPER/ACCOUNTANT | 단가 변경 (HVAC 6종) | ✅ |
| PUT | `/products/{id}/tags` | MASTER/MANAGER/DEVELOPER | 태그 일괄 | ✅ |
| POST | `/products/{id}/discontinue` | MASTER/MANAGER/DEVELOPER | 단종 | ✅ |
| POST | `/products/{id}/reactivate` | MASTER/MANAGER/DEVELOPER | 단종 해제 | ✅ |
| DELETE | `/products/{id}` | MASTER/MANAGER/DEVELOPER | soft-delete | ✅ |
| GET | `/products/by-model/{modelName}` | 7-tier | 모델명으로 조회 | ✅ |
| POST | `/products/lookup` | INTERNAL | 다건 ID lookup | ✅ |
| POST | `/products/internal/lookup` | INTERNAL | service 간 lookup | ✅ |
| POST | `/products/internal/lookup-by-model` | INTERNAL | 모델명 lookup | ✅ |
| GET | `/api/products/by-code/{code}` | 7-tier | 5자리 productCode 조회 | ✅ |
| POST | `/api/v1/products/admin/sync` | MASTER | Google Sheets sync | ✅ |
| GET | `/products/categories` | 인증 모두 | 카테고리 list | ✅ |
| POST | `/products/categories` | MASTER/MANAGER/DEVELOPER | 카테고리 신규 | ✅ |
| PATCH | `/products/categories/{id}` | MASTER/MANAGER/DEVELOPER | 카테고리 수정 | ✅ |
| DELETE | `/products/categories/{id}` | MASTER/MANAGER/DEVELOPER | 카테고리 삭제 | ✅ |
| GET | `/api/v1/products` | — | 카탈로그 search (modelCode/specs) | ✅ |
| PATCH | `/api/v1/products/{modelCode}/usage` | — | 사용 통계 | ✅ |
| GET | `/api/v1/products/{modelCode}/specs` | — | 사양 list | ✅ |
| POST | `/api/v1/products/{modelCode}/specs` | — | 사양 추가 | ✅ |
| PATCH | `/api/v1/products/{modelCode}/specs/{specId}` | — | 사양 수정 | ✅ |
| DELETE | `/api/v1/products/{modelCode}/specs/{specId}` | — | 사양 삭제 | ✅ |
| PATCH | `/api/v1/products/{modelCode}/specs/reorder` | — | 사양 순서 | ✅ |
| GET | `/api/v1/spec-key-templates` | — | 키 템플릿 list | ✅ |
| POST | `/api/v1/spec-key-templates/{templateId}/apply-to-existing` | — | 기존 제품에 일괄 적용 | ✅ |

### 5.2 비즈니스 로직
- HVAC 단가 6종: inbound / outbound / single / outdoor / multi_50 / multi_48 / multi_45 / item_35 (multiplier 매트릭스)
- 5자리 productCode (이카운트 호환 — V5 migration `add_ecount_product_fields`)
- spec 동적 키 템플릿 (templates → existing 일괄 apply)
- soft-delete + discontinue (단종 vs 삭제 구분)
- Google Sheets dry-run sync (`ProductSeedRunner`, `@Profile("seed")`)

### 5.3 시드 데이터
- V2 카테고리: 약 8 row (Samsung HVAC 분류)
- V4 spec_key_templates: 약 10 row
- Stage 1 (`HvacProductSeeder`): **100 Samsung 실모델** (PIPE-CU-15A, AVNS, HEX 등 — modelCode P-2026-XXXX)
  - toggle: `PRODUCT_SEED_TEST_DATA=true`

### 5.4 누락 기능 (이카운트 reference 기반)
- ❌ **회계 매핑** (품목 → 매출/매입 계정) — 092007 캡처에 있으나 미구현
- ❌ **위치/Bin 코드** — 창고 내 세부 위치 관리
- ❌ **유효기간** — HVAC 부속 (필터 등) 의 expiry tracking
- ❌ **이미지 / 카탈로그 PDF** — 제품 사진 컬럼 없음
- ⏳ **단가 이력** (price history) — 변경 시점/사유/승인자 audit 미구현
- ⏳ **bom (자재명세서)** — 멀티 시스템 묶음 구성 정의 없음

---

## 6. inventory-service (port 8085) — 재고 + 창고

### 6.1 REST Endpoint
| Method | Path | 권한 | 설명 | 구현 상태 |
|---|---|---|---|---|
| GET | `/inventory/balances` | 7-tier (SALES 제외) | 재고 list | ✅ |
| POST | `/inventory/balances/batch` | 7-tier 풀 | 다건 balance lookup | ✅ |
| GET | `/inventory/lots` | 7-tier (SALES 제외) | lot list | ✅ |
| GET | `/inventory/movements` | 7-tier (SALES 제외) | 이동 history | ✅ |
| POST | `/inventory/lots/inbound` | MASTER/MANAGER/WAREHOUSE/INVENTORY | 입고 lot 등록 | ✅ |
| POST | `/inventory/reserve` | 6-tier | 재고 예약 (slip SAVED 시) | ✅ |
| POST | `/inventory/release` | 6-tier | 예약 해제 (slip CANCEL 시) | ✅ |
| POST | `/inventory/deduct` | 6-tier | 출고 차감 (slip CONFIRMED 시) | ✅ |
| POST | `/inventory/adjust` | MASTER/MANAGER/INVENTORY | 재고 조정 (실사) | ✅ |
| GET | `/inventory/warehouses` | 인증 모두 | 창고 list | ✅ |
| GET | `/inventory/warehouses/{id}` | 인증 모두 | 단건 | ✅ |
| POST | `/inventory/warehouses` | MASTER/MANAGER/DEVELOPER | 신규 | ✅ |
| PATCH | `/inventory/warehouses/{id}` | MASTER/MANAGER/DEVELOPER | 수정 | ✅ |
| DELETE | `/inventory/warehouses/{id}` | MASTER/MANAGER/DEVELOPER | 삭제 | ✅ |
| GET | `/inventory/transfers` | 7-tier 풀 | 창고 이동 list | ✅ |
| GET | `/inventory/transfers/{id}` | 7-tier 풀 | 단건 | ✅ |
| POST | `/inventory/transfers` | MASTER/MANAGER/WAREHOUSE/INVENTORY | 신규 | ✅ |
| POST | `/inventory/transfers/{id}/approve` | MASTER/MANAGER/INVENTORY | 승인 | ✅ |
| POST | `/inventory/transfers/{id}/reject` | MASTER/MANAGER/INVENTORY | 반려 | ✅ |
| POST | `/inventory/transfers/{id}/ship` | MASTER/MANAGER/WAREHOUSE/INVENTORY | 출하 | ✅ |
| POST | `/inventory/transfers/{id}/receive` | MASTER/MANAGER/WAREHOUSE/INVENTORY | 입고 | ✅ |
| POST | `/inventory/transfers/{id}/confirm` | MASTER/MANAGER/INVENTORY | 확정 | ✅ |
| POST | `/inventory/transfers/{id}/cancel` | MASTER/MANAGER/INVENTORY | 취소 | ✅ |

### 6.2 비즈니스 로직
- StockBalance = (warehouse, product) 의 보유 수량 + 예약 수량 + 가용 수량
- 예약/해제/차감 = slip lifecycle 과 동기 (saga 없이 best-effort)
- StockTransfer 8-status workflow (DRAFT → APPROVED → SHIPPED → RECEIVED → CONFIRMED + 보조 REJECT/CANCEL)
- Lot 추적 (FIFO 우선)

### 6.3 시드 데이터
- V2 창고 2개: HQ-001 (본사 창고) / VH-001 (지사 창고)
- Stage 2 (`StockBalanceSeeder`): **200 row** (100 product × 2 warehouse)
  - toggle: `INVENTORY_SEED_TEST_DATA=true`

### 6.4 누락 기능
- ❌ **재고 실사** (physical count) — adjust endpoint 만 있음, 실사 sheet/세션 관리 없음
- ❌ **재고 가치 평가** (FIFO/이동평균/총평균) — 현재 단가 가산 없음
- ❌ **안전 재고 알림** — `safetyStockQty` 컬럼만 추가, 알림 트리거 없음
- ❌ **유통기한 관리** (FEFO) — Lot 에 expiry 컬럼 없음
- ⏳ Bin/Location — 창고 내 세부 위치 미관리

---

## 7. slip-service (port 8186) — 전표 11 status + 모바일 서명

### 7.1 REST Endpoint
| Method | Path | 권한 | 설명 | 구현 상태 |
|---|---|---|---|---|
| GET | `/slips` | SALES/MANAGER/MASTER 등 | list | ✅ |
| GET | `/slips/{id}` | 인증 | 단건 | ✅ |
| POST | `/slips` | SALES/MANAGER/MASTER | 신규 (DRAFT) | ✅ |
| PATCH | `/slips/{id}/header` | SALES/MANAGER/MASTER | 헤더 수정 | ✅ |
| POST | `/slips/{id}/lines` | SALES/MANAGER/MASTER | 라인 추가 | ✅ |
| DELETE | `/slips/{id}/lines/{lineId}` | SALES/MANAGER/MASTER | 라인 삭제 | ✅ |
| POST | `/slips/{id}/save` | SALES/MANAGER/MASTER | DRAFT → SAVED | ✅ |
| POST | `/slips/{id}/send` | SALES/MANAGER/MASTER | SAVED → SENT | ✅ |
| POST | `/slips/{id}/accept` | WAREHOUSE/INVENTORY/MANAGER/MASTER | SENT → ACCEPTED | ✅ |
| POST | `/slips/{id}/process` | WAREHOUSE/INVENTORY/MANAGER/MASTER | ACCEPTED → PROCESSING | ✅ |
| POST | `/slips/{id}/inspect` | WAREHOUSE/INVENTORY/MANAGER/MASTER | PROCESSING → INSPECTING | ✅ |
| POST | `/slips/{id}/complete` | WAREHOUSE/INVENTORY/MANAGER/MASTER | INSPECTING → COMPLETED | ✅ |
| POST | `/slips/{id}/ship` | WAREHOUSE/INVENTORY/MANAGER/MASTER | COMPLETED → SHIPPING | ✅ |
| POST | `/slips/{id}/deliver` | WAREHOUSE/INVENTORY/MANAGER/MASTER | SHIPPING → DELIVERED | ✅ |
| POST | `/slips/{id}/confirm` | ACCOUNTANT/MANAGER/MASTER | DELIVERED → CONFIRMED + 자동 분개 | ✅ |
| POST | `/slips/{id}/reject` | MANAGER/MASTER | 거부 | ✅ |
| POST | `/slips/{id}/cancel` | SALES/MANAGER/MASTER | DRAFT/SAVED/SENT 취소 | ✅ |
| GET | `/slips/{id}/signature` | MANAGER/MASTER | 서명 조회 | ✅ |
| DELETE | `/slips/{id}/signature` | MASTER | 서명 삭제 | ✅ |
| GET | `/slips/lookup-product` | 6-tier | product 조회 (slip 작성 시) | ✅ |
| POST | `/api/v1/slips/from-estimate` | SALES/MANAGER/MASTER/INTEGRATION | 견적 → 전표 자동 발행 | ✅ |
| POST | `/api/v1/slips/from-partner-order` | MANAGER/MASTER/INTEGRATION/PARTNER_ADMIN | 거래처 주문 → 전표 자동 발행 | ✅ |
| GET | `/api/v1/slips/by-source` | 인증 | source 별 조회 | ✅ |
| POST | `/internal/slips/{slipId}/signatures` | INTERNAL | 외부 서명 입력 | ✅ |
| GET | `/internal/slips/by-partner/{partnerId}/recent` | INTERNAL | 거래처별 최근 전표 | ✅ |
| GET | `/internal/slips/by-partner-code/{partnerCode}/recent` | INTERNAL | partnerCode 검색 | ✅ |
| POST | `/delivery-batches/auto-group` | MANAGER/MASTER | driverPhone 별 자동 grouping | ✅ |
| GET | `/delivery-batches` | MANAGER/MASTER | list | ✅ |
| GET | `/delivery-batches/{id}` | MANAGER/MASTER | 단건 | ✅ |
| POST | `/delivery-batches/{id}/send-sms` | MANAGER/MASTER | 기사에게 SMS 발송 | ✅ |
| POST | `/delivery-batches/{id}/slips` | MANAGER/MASTER | 전표 추가 | ✅ |
| DELETE | `/delivery-batches/{id}/slips/{slipId}` | MANAGER/MASTER | 전표 제거 | ✅ |
| POST | `/delivery-batches/{id}/regenerate-token` | MANAGER/MASTER | shareToken 재발급 | ✅ |
| GET | `/public/batches/{token}` | open(token) | 모바일 batch 조회 | ✅ |
| POST | `/public/batches/{token}/slips/{slipNo}/signature` | open(token) | 거래처 서명 | ✅ |
| POST | `/public/batches/{token}/slips/{slipNo}/driver-signature` | open(token) | 기사 서명 | ✅ |
| GET | `/public/signatures/{shareToken}` | open(token) | 서명 이미지 조회 | ✅ |

### 7.2 비즈니스 로직 (11 status workflow)
```
DRAFT → SAVED → SENT → ACCEPTED → PROCESSING → INSPECTING → COMPLETED
      → SHIPPING → DELIVERED → CONFIRMED (+ 자동 분개)
       (보조: REJECTED / CANCELLED)
```
- 견적/주문 → 전표 자동 발행 (`from-estimate` / `from-partner-order`) + idempotency (V8/V9 audit + fingerprint)
- DeliveryBatch — driverPhone 별 grouping → SMS 발송 → 모바일 서명 (token 기반 무인증)
- Signature: WEB / MOBILE / DRIVER 3 source (V10 추가)

### 7.3 시드 데이터
- Stage 2 (`SlipSeeder`): **100 slips** (11 status 분포) + 약 300 SlipLine + 30 DeliveryBatch
  - toggle: `SLIP_SEED_TEST_DATA=true`
- 12 migration version (V12 가 이카운트 라인 필드)

### 7.4 누락 기능
- ❌ **반품 전표** (Return) — V1 schema 에 status 만, return endpoint 미구현
- ❌ **부분 출고** (partial shipment) — 한 전표 일부 라인만 출고 분할 미지원
- ❌ **묶음 발행** (multi-slip 일괄) — UI/API 모두 단건만
- ⏳ 인쇄 양식 — print-spec 진행중 (PR #21 회고)

---

## 8. accounting-service (port 8087) — 분개 + 한국 계정과목 + 보고서

### 8.1 REST Endpoint
| Method | Path | 권한 | 설명 | 구현 상태 |
|---|---|---|---|---|
| GET | `/accounting/accounts` | 인증 모두 | ChartOfAccount tree (65 row) | ✅ |
| POST | `/accounting/journals` | ACCOUNTANT/MASTER | 분개 생성 (DRAFT) | ✅ |
| GET | `/accounting/journals?from=&to=&status=` | ACCOUNTANT/MASTER | 페이지 조회 | ✅ |
| GET | `/accounting/journals/{id}` | ACCOUNTANT/MASTER | 단건 + lines | ✅ |
| POST | `/accounting/journals/{id}/post` | ACCOUNTANT/MASTER | DRAFT → POSTED | ✅ |
| POST | `/accounting/journals/{id}/reverse` | ACCOUNTANT/MASTER | POSTED → REVERSED + 역분개 자동 | ✅ |
| GET | `/accounting/balances?period=YYYYMM` | ACCOUNTANT/MASTER | **시산표** | ✅ |

### 8.2 비즈니스 로직
- 한국 일반기업회계기준 표준 계정과목 (100/200/300/400/500/800/900) **65 row** seed (V1 migration)
- 복식부기 invariant — sum(debit) == sum(credit) (Service layer 강제)
- 분개 자동 생성 — slip CONFIRMED 시 SLIP_ISSUE 분개 (110 외상매출금 / 401 상품매출 / 220 부가세예수금 3 라인)
- 분개 패턴: SLIP_ISSUE / PAYMENT / SGA / ADJUSTMENT 4종

### 8.3 시드 데이터
- V1: **65 chart_of_accounts** (한국 표준)
- Stage 4 (`JournalSeeder`): **50 journals** (POSTED 40 / DRAFT 5 / REVERSED 5) + 약 110 lines
  - toggle: `ACCOUNTING_SEED_TEST_DATA=true`

### 8.4 누락 기능 — **이카운트 17 보고서 매핑**

본 서비스는 **3 endpoint** 만 활성 (분개장 / 단건 / 시산표). 이카운트 ERP 의 17 보고서 중 **14건이 미구현**. PM/회계 Owner 와 우선순위 협의 필요.

| # | 보고서 | endpoint 후보 | 우선순위 | 구현 상태 |
|---|---|---|---|---|
| 1 | 분개장 (Journal book) | `GET /accounting/journals` | P0 | ✅ 활성 |
| 2 | 시산표 (Trial balance) | `GET /accounting/balances?period=` | P0 | ✅ 활성 |
| 3 | 계정과목 트리 (Chart of accounts) | `GET /accounting/accounts` | P0 | ✅ 활성 |
| 4 | **자금일보** (Daily cash) | `GET /accounting/cash-daily?date=` | P1 | ❌ |
| 5 | **현금흐름표** (Cash flow) | `GET /accounting/reports/cash-flow?period=` | P1 | ❌ |
| 6 | **손익계산서** (Income statement) | `GET /accounting/reports/income-statement?period=` | P1 | ❌ |
| 7 | **재무상태표** (Balance sheet) | `GET /accounting/reports/balance-sheet?asOf=` | P1 | ❌ |
| 8 | **총계정원장** (General ledger) | `GET /accounting/ledgers/{accountCode}?period=` | P1 | ❌ |
| 9 | 매출장 (Sales book) | `GET /accounting/reports/sales-book?period=` | P1 | ❌ |
| 10 | 매입장 (Purchase book) | `GET /accounting/reports/purchase-book?period=` | P1 | ❌ |
| 11 | 거래처별 외상매출금 잔액 | `GET /accounting/reports/ar-by-partner` | P1 | ❌ |
| 12 | 거래처별 외상매입금 잔액 | `GET /accounting/reports/ap-by-partner` | P1 | ❌ |
| 13 | 부가세 신고 자료 | `GET /accounting/reports/vat?period=` | P2 | ❌ |
| 14 | 월별 손익 | `GET /accounting/reports/monthly-pnl?year=` | P2 | ❌ |
| 15 | 부서별 손익 | `GET /accounting/reports/dept-pnl?period=` | P2 | ❌ |
| 16 | 일계표 (Daily summary) | `GET /accounting/reports/daily-summary?date=` | P2 | ❌ |
| 17 | 결산 보고서 (Closing) | `POST /accounting/reports/closing?year=` | P3 | ❌ |

> **추가 누락**:
> - ❌ 회계연도 마감 (period close) lock 메커니즘 — 마감 후 분개 차단
> - ❌ 분개 templates (자주 쓰는 분개 1-click)
> - ❌ 부서/프로젝트 segment 별 분개 — `JournalLine` 에 dept/project 컬럼 없음
> - ❌ 외화 분개 — currency 컬럼 없음 (단가는 partner-service 에 있음)
> - ⏳ ChartOfAccount 확장 — 감가상각누계액 등 표준 코드 추가 (Stage 4 회고)

---

## 9. partner-service (port 8095) — 거래처 + 첨부파일

### 9.1 REST Endpoint
| Method | Path | 권한 | 설명 | 구현 상태 |
|---|---|---|---|---|
| POST | `/admin/partners` | MASTER/MANAGER | 신규 | ✅ |
| GET | `/admin/partners` | MASTER/MANAGER | list + filter | ✅ |
| GET | `/admin/partners/{partnerCode}` | MASTER/MANAGER/SALES/ACCOUNTANT | 단건 (4 탭) | ✅ |
| PUT | `/admin/partners/{partnerCode}` | MASTER/MANAGER | 수정 | ✅ |
| DELETE | `/admin/partners/{partnerCode}` | MASTER | soft-delete | ✅ |
| GET | `/admin/partners/{partnerCode}/credit-history` | MASTER/MANAGER/ACCOUNTANT | 여신 history | ✅ |
| GET | `/internal/partners/{partnerCode}` | INTERNAL | service 간 lookup | ✅ |
| POST | `/internal/partners/find-by-codes` | INTERNAL | 다건 lookup | ✅ |
| POST | `/api/v1/partners/{partnerId}/attachments` (multipart) | SALES/MANAGER/MASTER | 첨부파일 업로드 | ✅ |
| GET | `/api/v1/partners/{partnerId}/attachments` | 인증 | 첨부 list | ✅ |
| GET | `/api/v1/partners/attachments/{attachmentId}` | 인증 | 첨부 download | ✅ |
| DELETE | `/api/v1/partners/attachments/{attachmentId}` | SALES/MANAGER/MASTER | 첨부 삭제 | ✅ |

### 9.2 비즈니스 로직
- 4 탭 = 기본 / 거래처정보 / 여신단가 / 부가정보 (이카운트 매핑)
- partnerCode 5자리 (P-2026-NNNN format) — 이카운트 호환
- soft-delete + 신용 이력 audit
- V2 migration `add_ecount_partner_fields` (V1 → 이카운트 호환 확장)
- V3 첨부파일 (`partner_attachments`)

### 9.3 시드 데이터
- Stage 1 (`PartnerSeeder`): **50 partners**
  - 업태 분포: 제조업 / 도소매 / 건설업
  - 거래상태: 활성 45 / soft-delete 5
  - toggle: `PARTNER_SEED_TEST_DATA=true`

### 9.4 누락 기능 (이카운트 reference 4 탭 분석)
- ❌ **계층그룹** (이카운트 091540 — 상위 거래처 / 본사-지점) — V2 에 미반영
- ❌ **적요** (memo/notes — 091604 캡처) — 단순 textarea 컬럼 없음
- ⏳ **검색키워드** — 컬럼 추가됨 (V2), GIN index 미설정 → 한글 검색 느림 가능
- ❌ **거래처 별 단가표** — 거래처 + 제품 매트릭스 단가 (특별가) 테이블 없음 (dc-config-service 에 일부)
- ❌ **거래처 등록 신청 / 승인 워크플로** — 영업 신청 → 회계 승인 flow 없음
- ❌ **여신 한도 자동 차단** — `creditPeriod` / `paymentDue` 컬럼만 있음, 전표 발행 시 한도 검증 트리거 없음

---

## 10. partner-auth-service (port 8091) — 거래처 로그인

### 10.1 REST Endpoint
| Method | Path | 권한 | 설명 | 구현 상태 |
|---|---|---|---|---|
| GET | `/api/v1/auth/partner-status` | open | 거래처 상태 조회 | ✅ |
| POST | `/api/v1/auth/partner-register` | open | 거래처 자가 등록 | ✅ |
| PATCH | `/api/v1/auth/partner-password` | PARTNER | 비밀번호 변경 | ✅ |
| POST | `/api/v1/auth/partner-login` | open | 로그인 | ✅ |
| POST | `/api/v1/auth/partner-temp-password` | open | 임시 비밀번호 발급 | ✅ |
| GET | `/api/v1/auth/partner-expiration` | PARTNER | 만료 정보 | ✅ |
| PATCH | `/api/v1/auth/partner-tutorial` | PARTNER | tutorial 진행 상태 | ✅ |

### 10.2 비즈니스 로직
- 거래처 자가 등록 + bizNo 중복 검증
- 임시 비밀번호 (SMS/이메일 발송) → 로그인 후 강제 변경
- 90일 만료 정책

### 10.3 시드 데이터
- V1 only (schema). Stage 1 partner 와 cross-link 미설정 (별도 backlog)

### 10.4 누락 기능
- ❌ **2FA / OTP** — SMS OTP 미구현
- ❌ **거래처 사용자 다중 계정** — 한 partnerCode = 한 계정만
- ❌ **권한 위임** (PARTNER_ADMIN → PARTNER) — role 매트릭스만 정의, UI 없음

---

## 11. partner-order-service (port 8188) — 거래처 주문

### 11.1 REST Endpoint
| Method | Path | 권한 | 설명 | 구현 상태 |
|---|---|---|---|---|
| GET | `/api/v1/partner-orders/bootstrap` | 인증 | 초기 데이터 (제품 캐시 등) | ✅ |
| POST | `/api/v1/partner-orders/drafts` | MASTER/MANAGER/PARTNER | 신규 draft | ✅ |
| GET | `/api/v1/partner-orders/drafts` | MASTER/MANAGER/PARTNER | list | ✅ |
| GET | `/api/v1/partner-orders/drafts/{draftId}` | MASTER/MANAGER/PARTNER | 단건 | ✅ |
| POST | `/api/v1/partner-orders/{draftId}/confirm` | MASTER/MANAGER/PARTNER | confirm + slip 자동 발행 | ✅ |
| GET | `/api/v1/partner-orders/history` | MASTER/MANAGER/PARTNER | 히스토리 | ✅ |
| GET | `/api/v1/partner-orders/gate-images` | 인증 | 게이트 이미지 (마케팅) | ✅ |
| POST | `/api/v1/partner-orders/log` | 인증 | 프론트 이벤트 로그 | ✅ |
| PATCH | `/api/v1/auth/partner-tutorial` | MASTER/MANAGER/PARTNER | tutorial 상태 | ✅ |

### 11.2 비즈니스 로직
- Draft → Confirm → Slip 자동 발행 (idempotency token)
- bootstrap cache (V2 — partner 별 자주 사용 제품 hint)
- 프론트 이벤트 로그 (퍼널 분석)

### 11.3 시드 데이터
- Stage 3 (`PartnerOrderSeeder`): **30 orders + 약 60 lines**
  - 분포: DRAFT 5 / CONFIRMED+PENDING_RETRY 10 / CONFIRMED+PUBLISHED 15
  - toggle: `PARTNER_ORDER_SEED_TEST_DATA=true`
- V2 bootstrap cache seed

### 11.4 누락 기능
- ❌ **장바구니 (cart) 저장** — draft 가 cart 역할이지만 UI 명시 없음
- ❌ **즐겨찾기 제품** (favorites) — 거래처별 자주 쓰는 제품 ★
- ❌ **주문 취소 / 변경 요청** — confirm 후 취소 endpoint 없음 (slip cancel 만)
- ❌ **결제 연동** (PG) — 거래처 = 외상거래 가정. 카드/계좌 결제 없음
- ⏳ 게이트 이미지 — UI 마케팅 배너 표시 가능하나 admin CRUD endpoint 없음

---

## 12. dc-config-service (port 8089) — DC 설정 + 가격 계산

### 12.1 REST Endpoint
| Method | Path | 권한 | 설명 | 구현 상태 |
|---|---|---|---|---|
| GET | `/partners/{partnerCode}` | open | public 거래처 조회 (DC 코드) | ✅ |
| GET | `/internal/partners/{partnerCode}` | INTERNAL | service 간 거래처 조회 | ✅ |
| GET | `/internal/partner-dc-configs/{partnerCode}` | INTERNAL | DC 설정 조회 | ✅ |
| POST | `/internal/price-calculations` | INTERNAL | 가격 계산 (DC + 단가 매트릭스) | ✅ |

### 12.2 비즈니스 로직
- DC = Distribution Channel (도매상 분류)
- 거래처별 DC 설정 + 적용 단가 매트릭스 결정
- 가격 계산 = (제품 baseline) × (DC multiplier) × (할인 단계)

### 12.3 시드 데이터
- V1 only — schema. Stage 1 partner 와 별도 매핑 (M3 별도 PR 에서 처리)

### 12.4 누락 기능
- ❌ **DC 설정 admin UI** — admin endpoint 없음, 직접 SQL 만
- ❌ **DC 별 통계** — 매출 비중, 회전율 등
- ⏳ 가격 계산 audit — 계산 결과 history table 없음

---

## 13. groupware-service (port 8092) — 결재 + 메시지 + 일정

### 13.1 REST Endpoint
| Method | Path | 권한 | 설명 | 구현 상태 |
|---|---|---|---|---|
| POST | `/admin/groupware/approvals` | MASTER/MANAGER | 결재 신청 | ✅ |
| PUT | `/admin/groupware/approvals/{approvalId}/approve` | MASTER/MANAGER | 승인 | ✅ |
| PUT | `/admin/groupware/approvals/{approvalId}/reject` | MASTER/MANAGER | 반려 | ✅ |
| POST | `/admin/groupware/messages` | 7-tier 풀 | 메시지 발송 | ✅ |
| GET | `/admin/groupware/messages/inbox` | 7-tier 풀 | 받은 함 | ✅ |
| POST | `/admin/groupware/schedules` | 7-tier 풀 | 일정 생성 | ✅ |
| GET | `/admin/groupware/schedules` | 7-tier 풀 | 일정 list | ✅ |
| PUT | `/admin/groupware/schedules/{scheduleId}` | 7-tier 풀 | 수정 | ✅ |
| DELETE | `/admin/groupware/schedules/{scheduleId}` | MASTER/MANAGER | 삭제 | ✅ |
| GET | `/internal/groupware/approvals/{approvalId}` | INTERNAL | service 간 결재 조회 | ✅ |
| GET | `/internal/groupware/messages/unread-count` | INTERNAL | 읽지 않은 메시지 수 | ✅ |

### 13.2 비즈니스 로직
- 결재선 (ApprovalLine) + 단계 (ApprovalStep) — 다단계 결재
- 메시지 inbox/outbox + 첨부 (파일은 별도)
- 일정 (Schedule) + 참가자 (Participant)

### 13.3 시드 데이터
- Stage 4 (`GroupwareSeeder`): ApprovalLine 8 + Step 16 + Message 20 + Schedule 5 + Participant 9
  - 결재 분포: PENDING 3 / APPROVED 4 / REJECTED 1
  - toggle: `GROUPWARE_SEED_TEST_DATA=true`

### 13.4 누락 기능
- ❌ **결재 양식 (Form)** — 휴가/품의/지출 등 양식별 필드 정의 없음
- ❌ **위임 결재** (대리 결재) — 부재 시 위임자 지정
- ❌ **메시지 그룹 채팅** — 1:1 만 지원
- ❌ **일정 반복** (RRULE) — 단발성만
- ❌ **외부 캘린더 sync** (Google/Outlook)
- ⏳ 첨부파일 — 메시지/결재에 partner-service 패턴 적용 필요

---

## 14. notification-service (port 8093) — 알림 (SMS/EMAIL/PUSH)

### 14.1 REST Endpoint
| Method | Path | 권한 | 설명 | 구현 상태 |
|---|---|---|---|---|
| POST | `/admin/notifications/send` | MASTER/MANAGER | 직접 발송 | ✅ |
| GET | `/admin/notifications` | MASTER/MANAGER | 발송 history list | ✅ |
| GET | `/admin/notifications/{requestId}` | MASTER/MANAGER | 단건 + log | ✅ |
| POST | `/admin/notifications/{requestId}/retry` | MASTER/MANAGER | 재발송 | ✅ |
| POST | `/internal/notifications/send` | INTERNAL | service 간 알림 trigger | ✅ |
| GET | `/internal/notifications/{requestId}/status` | INTERNAL | 상태 polling | ✅ |

### 14.2 비즈니스 로직
- 채널 3종 — SMS (Aligo) / EMAIL (SES) / PUSH (FCM)
- NotificationRequest → NotificationLog (시도 history)
- 재시도 (retry) — 5번 backoff

### 14.3 시드 데이터
- Stage 4 (`NotificationHistorySeeder`): NotificationRequest 50 + Log 약 45
  - 분포: PENDING 5 / SENT 35 / FAILED 5 / RETRYING 5
  - toggle: `NOTIFICATION_SEED_TEST_DATA=true`

### 14.4 누락 기능
- ❌ **카카오톡 알림톡** — Aligo 외 카카오 비즈메시지 (저비용) 미연동
- ❌ **수신 동의 관리** — 마케팅성 발송 거부 (KISA 필수)
- ❌ **template 관리 admin** — 현재 코드 hardcoded
- ❌ **발송 통계** (월별/채널별 비용)
- ⏳ 사용자별 채널 선호 (preference) — 컬럼 없음

---

## 15. dashboard-service (port 8094) — KPI + 재고 + 매출

### 15.1 REST Endpoint
| Method | Path | 권한 | 설명 | 구현 상태 |
|---|---|---|---|---|
| GET | `/admin/dashboard/kpi` | MASTER/MANAGER | KPI snapshot | ✅ |
| GET | `/admin/dashboard/realtime-stock` | MASTER/MANAGER | 실시간 재고 | ✅ |
| GET | `/admin/dashboard/sales-aggregate` | MASTER/MANAGER | 매출 집계 | ✅ |
| POST | `/admin/dashboard/refresh` | MASTER/MANAGER | MV 강제 갱신 | ✅ |
| GET | `/internal/dashboard/kpi/{category}` | INTERNAL | service 간 KPI lookup | ✅ |

### 15.2 비즈니스 로직
- KPI snapshot = 일/월/카테고리별 집계 (MV refresh 주기 = ShedLock)
- realtime_stock = inventory-service event 기반 (현재 polling)
- sales_aggregate = slip CONFIRMED 기반

### 15.3 시드 데이터
- V2 ShedLock table
- Stage 4 (`DashboardSnapshotSeeder`): KpiSnapshot 135 + RealtimeStock 200 + SalesAggregate 150 + MV refresh
  - 분포: DAILY_SALES 100 / MONTHLY_SALES 5 / ORDER_COUNT 30
  - toggle: `DASHBOARD_SEED_TEST_DATA=true`

### 15.4 누락 기능
- ❌ **사용자 정의 dashboard** — 위젯 자유 배치 / 저장
- ❌ **export to Excel/PDF** — 화면 캡처만 가능
- ❌ **알림 (threshold)** — KPI 이상치 자동 알림 trigger
- ❌ **drill-down** — KPI 클릭 → 상세 내역 navigate
- ⏳ 실시간 push (WebSocket) — 현재 polling

---

## 16. arologis-service (port 8097) — 카카오톡 배차 + 기사

### 16.1 REST Endpoint
| Method | Path | 권한 | 설명 | 구현 상태 |
|---|---|---|---|---|
| POST | `/admin/arologis/dispatches/parse-kakao` | MASTER/MANAGER | 카톡 메시지 → dispatch 자동 파싱 | ✅ |
| POST | `/admin/arologis/dispatches` | MASTER/MANAGER | 신규 dispatch 등록 | ✅ |
| GET | `/admin/arologis/dispatches` | MASTER/MANAGER | list | ✅ |
| GET | `/admin/arologis/dispatches/{id}` | MASTER/MANAGER | 단건 (vehicle + stop) | ✅ |
| POST | `/admin/arologis/dispatches/{id}/auto-match` | MASTER/MANAGER | 자동 매칭 (인성데이타 quick API) | ✅ |
| POST | `/admin/arologis/dispatches/{id}/vehicles/{seq}/match-external` | MASTER/MANAGER | vehicle 외부 매칭 | ✅ |
| POST | `/admin/arologis/dispatches/{id}/vehicles/{seq}/assign-driver` | MASTER/MANAGER | 기사 할당 | ✅ |
| PUT | `/admin/arologis/dispatches/{id}/vehicles/{seq}/stops/{stopSeq}/status` | MASTER/MANAGER | stop 상태 변경 | ✅ |
| GET | `/admin/arologis/drivers` | MASTER/MANAGER | 기사 list | ✅ |
| PUT | `/admin/arologis/dispatches/{id}/delete` | MASTER/MANAGER | dispatch 삭제 (soft) | ✅ |
| GET | `/driver-app/arologis/dispatches/today` | DRIVER/MASTER/MANAGER | 기사 모바일 — 오늘 배차 | ✅ |
| POST | `/driver-app/arologis/locations` | DRIVER/MASTER/MANAGER | 기사 GPS 위치 보고 | ✅ |
| POST | `/driver-app/arologis/dispatches/{id}/vehicles/{seq}/stops/{stopSeq}/sign` | DRIVER/MASTER/MANAGER | stop 도착 서명 | ✅ |
| POST | `/internal/arologis/dispatches/sync` | INTERNAL | 외부 vendor sync | ✅ |

### 16.2 비즈니스 로직
- 카카오톡 메시지 파싱 → vehicle / stop entity 자동 생성 (NLP rule-based)
- 외부 vendor = 인성데이타 퀵프로그램 (Phase 11 통합)
- driver type = INTERNAL (소속 기사) / INSUNG (외부 인성) / KAKAO (카카오 모빌리티)
- GPS 위치 history (V2 partial unique index)
- stop 도착 서명 → slip-service 와 cross-link

### 16.3 시드 데이터
- Stage 3 (`DriverSeeder` + `DispatchSeeder`): Driver 10 + Dispatch 20 + Vehicle 약 50 + Stop 약 150
  - dispatch 분포: DAY 14 / NIGHT 4 / EXPRESS 2
  - driver 분포: INTERNAL 5 / INSUNG 3 / KAKAO 2 (활성 9 / soft-delete 1)
  - toggle: `AROLOGIS_SEED_TEST_DATA=true`

### 16.4 누락 기능
- ❌ **인성데이타 quick API 실제 연동** — auto-match endpoint 만 stub, mock 응답
- ❌ **카카오 모빌리티 API 연동** — KAKAO driver type 만 정의, 실제 API 호출 없음
- ❌ **운임 정산** (driver 별 일/월 정산서)
- ❌ **routing 최적화** (TSP) — 현재 stop 순서는 사용자 입력
- ⏳ GPS 실시간 push (WebSocket) — polling

---

## 17. logging-service (port 8082) — 로그 수집

### 17.1 REST Endpoint
| Method | Path | 권한 | 설명 | 구현 상태 |
|---|---|---|---|---|
| GET | `/logs/by-service/{serviceName}` | MASTER (가정) | service 별 audit log | ✅ |
| GET | `/logs/by-user/{userId}` | MASTER (가정) | 사용자별 log | ✅ |
| GET | `/logs/search` | MASTER (가정) | search (키워드) | ✅ |

> @PreAuthorize 명시 X — gateway 에서 차단 가정 (점검 필요).

### 17.2 비즈니스 로직
- audit_log table — service / user / action / payload
- Elasticsearch 색인 (option)

### 17.3 시드 데이터
- 별도 seeder 없음 (런타임 누적)

### 17.4 누락 기능
- ❌ **PII 마스킹** — payload 에 비밀번호/주민번호 raw 저장 위험
- ❌ **보존 정책** (retention) — 365일 자동 삭제 등 미구현
- ❌ **alert** — 의심 패턴 자동 알림 (예: 1분 100회 로그인 시도)
- ❌ **export** — CSV / SIEM 연동
- ⏳ Elasticsearch — V1 만 PostgreSQL, ES sync job 없음

---

## 18. 전사 누락 기능 종합 (우선순위)

### 18.1 P0 (즉시) — 운영 매뉴얼 작성 시 발견 / 사용자 즉시 영향
- accounting 17 보고서 중 P1 9건 (자금일보 / 손익계산서 / 재무상태표 / 총계정원장 / 매출장 / 매입장 / 외상매출/매입금 거래처별 잔액)
- auth 비밀번호 재설정 flow

### 18.2 P1 (단기) — 사용자 요청 빈도 높음 예상
- 부서 CRUD endpoint
- 거래처 등록 신청 / 승인 워크플로
- 거래처별 단가표 (특별가)
- 전표 반품 / 부분출고 / 묶음 발행
- 재고 실사 (physical count)
- KPI threshold 알림 + drill-down

### 18.3 P2 (중기) — 영업 확장 / 외부 integration
- 카카오톡 알림톡
- 인성데이타 quick API 실제 연동
- 카카오 모빌리티 API 연동
- 결재 양식 (Form) + 위임 결재
- routing 최적화 (TSP)
- 마이그레이션 백업 / restore tool

### 18.4 P3 (장기) — 보안 / 컴플라이언스
- 2FA / OTP
- audit log PII 마스킹 + 보존 정책
- gateway rate limit + circuit breaker
- 회계연도 마감 (period close) lock

---

## 19. 검증 방법 (재현)

```powershell
# 1. 모든 endpoint 카운트
Get-ChildItem -Recurse -Filter "*Controller.java" services\*\src\main\java | `
  Select-String -Pattern '@(Get|Post|Put|Delete|Patch)Mapping' | Measure-Object

# 2. 권한 매트릭스
Get-ChildItem -Recurse -Filter "*.java" services\*\src\main\java | `
  Select-String -Pattern '@PreAuthorize' | Out-File backend-auth-matrix.txt

# 3. 시드 row 카운트 (start-local-full.ps1 step 5 와 동일)
psql -U postgres -d auth_db   -c "SELECT COUNT(*) FROM accounts;"
psql -U postgres -d user_db   -c "SELECT COUNT(*) FROM employees;"
psql -U postgres -d product_db -c "SELECT COUNT(*) FROM products;"
psql -U postgres -d partner_db -c "SELECT COUNT(*) FROM partners;"
psql -U postgres -d slip_db   -c "SELECT COUNT(*) FROM slips;"
psql -U postgres -d accounting_db -c "SELECT COUNT(*) FROM chart_of_accounts;"  # 65 expected
psql -U postgres -d accounting_db -c "SELECT COUNT(*) FROM journals;"           # 50 expected
```

---

## 20. 인용 / 출처

| 파일 | 역할 |
|---|---|
| `services/<X>/src/main/java/.../web/*Controller.java` | endpoint × 권한 |
| `services/<X>/src/main/resources/db/migration/V*.sql` | schema + V1 seed |
| `services/<X>/src/main/java/.../seed/*Seeder.java` | Stage 1-4 seed 구현 |
| `infrastructure/env-templates/.env.dev-seed` | toggle 일람 |
| `docs/dev-reports/local-test-seed-stage1.md` ~ `stage4.md` | seed 명세 |
| `docs/qa/local-test-seed-data/scenarios/05-accounting-reports.md` | 회계 17 보고서 매핑 출처 |
| `docs/migration/ecount-reference/` (16 PNG) | 거래처 4 탭 + 품목 3 탭 추출 출처 |
| `memory/project_korean_accounting.md` | 한국 표준 계정과목 코드 |
| `memory/feedback_role_naming_full.md` | role 표기 풀네임 규약 |

---

## 21. 후속 작업 (parallel agents)

본 backend inventory 와 병렬로 다음 산출물이 동일 branch (`feature/integrated-phase-10-step-7-operator-manual`) 에서 작성 중:

| 산출물 | 담당 | 위치 |
|---|---|---|
| Frontend 5 client 기능 inventory | Frontend Inventory agent | `docs/manual/inventory/frontend-feature-inventory.md` |
| 매뉴얼 목차 + 디자인 톤 | Designer/PM agent | `docs/manual/00-시작하기/README.md` (기존 보강) |
| Playwright 자동 캡처 | DevOps agent | `infrastructure/scripts/manual-screenshots/` |
| QA 검증 시나리오 | QA agent | `docs/qa/operator-manual-stage1/` |

본 backend inventory 는 모든 후속 산출물의 **기반 reference** 역할 — 매뉴얼 각 챕터의 endpoint/권한/누락 표시는 본 문서를 단일 source of truth 로 인용한다.
