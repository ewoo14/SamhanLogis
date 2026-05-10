# P0-6 거래처 4탭 UI — dev-report

작성: 2026-05-11 | 브랜치: feature/p0-6-partner-4tab-ui

---

## 1. 범위

P0-6 거래처 4탭 UI 검증용 seed + 통합 테스트(IT). 기존 4탭 도메인/서비스/컨트롤러 구현 위에
결정적 seed 데이터 및 P06ValidationIT를 추가하는 작업.

---

## 2. 변경 파일 목록

| 파일 | 구분 | 설명 |
|---|---|---|
| `services/partner-service/src/main/resources/db/migration/V6__seed_p0_6_partners_full.sql` | 신규 | 4탭 스키마(3 테이블) + DEV-SEED 5개 거래처 |
| `services/partner-service/src/test/java/.../it/P06ValidationIT.java` | 신규 | 4탭 일괄 등록/수정/조회 IT 6 시나리오 |

---

## 3. V6 Flyway seed 상세

### 3.1 신규 스키마 (3 테이블)

| 테이블 | 역할 | 탭 |
|---|---|---|
| `partner_price_discounts` | 단가/할인 정책 (거래처당 1행 UNIQUE) | 탭2 |
| `partner_shipping_addresses` | 배송지 목록 (기본 배송지 1건 partial unique) | 탭3 |
| `partner_contacts` | 담당자 목록 (주 담당자 1건 partial unique) | 탭4 |

### 3.2 seed 거래처 5건 (ON CONFLICT DO NOTHING — 멱등)

| partnerCode | 상호 | 유형 |
|---|---|---|
| P0-6-C001 | (주)한국냉동물류 | CUSTOMER / VIP거래처 |
| P0-6-C002 | (주)서울택배 | CUSTOMER / 일반거래처 |
| P0-6-C003 | 대한화물서비스(주) | CUSTOMER / 신규거래처 |
| P0-6-S001 | (주)신영포장자재 | SUPPLIER |
| P0-6-B001 | 한일물류파트너스(주) | BOTH / 매출+매입 |

### 3.3 seed 하위 데이터 (거래처당)

- `partner_price_discounts`: 1건 (할인율 0~5%, paymentTermDays 30~60일)
- `partner_shipping_addresses`: 2건 (is_default TRUE 1건)
- `partner_contacts`: 2건 (is_primary TRUE 1건)

---

## 4. P06ValidationIT

### 4.1 테스트 아키텍처

- 상속: `AbstractPostgresIT` (싱글턴 PostgreSQLContainer + Docker 미가용 자동 skip)
- 격리: `@Transactional` + `@Rollback` (각 테스트 후 자동 롤백)
- 인증: X-User-Role 헤더 (HeaderAuthenticationFilter — gateway 경유 패턴)
- 외부 client: 없음 (partner-service = self-contained)
- Eureka: `eureka.client.enabled=false` (AbstractPostgresIT 에서 비활성화)

### 4.2 테스트 시나리오 6건

| # | 시나리오 | 검증 포인트 |
|---|---|---|
| 1 | POST /api/v1/partners/full 정상 등록 | 201 + 4탭 응답 구조 검증 |
| 2 | POST 중복 partnerCode | 409 CONFLICT |
| 3 | GET /api/v1/partners/{code}/full | 기본정보/단가/배송지/담당자 전체 구조 |
| 4 | PATCH /api/v1/partners/{code}/full | 수정 후 변경 값 검증 + GET 재확인 |
| 5 | SALES 역할 POST | 403 FORBIDDEN |
| 6 | 미존재 partnerCode GET | 404 NOT_FOUND |

---

## 5. 기존 도메인 현황 (신규 구현 없음)

P0-6 분기 시점에 이미 구현 완료된 파일:

- `domain/PartnerPriceDiscount.java` — 단가/할인 엔티티 (낙관적 잠금 version)
- `domain/PartnerShippingAddress.java` — 배송지 엔티티
- `domain/PartnerContact.java` — 담당자 엔티티
- `tab/repository/PartnerPriceDiscountRepository.java`
- `tab/repository/PartnerShippingAddressRepository.java`
- `tab/repository/PartnerContactRepository.java`
- `tab/service/Partner4TabService.java` — 4탭 통합 서비스 (registerFull/updateFull/getFull)
- `tab/web/Partner4TabController.java` — REST endpoint (/api/v1/partners/*)
- `tab/dto/*.java` — PartnerFullRequest/Response + 탭별 Request/Response

---

## 6. 주의 사항

- V6 SQL의 `ON CONFLICT DO NOTHING`은 partnerCode/bizNo partial unique index 기준.
  biz_no 컬럼의 활성 행 unique index (`ux_partners_biz_no_active`)에 의해 동일 biz_no
  재실행 시 skip 처리.
- IT 테스트에서 사용하는 partnerCode `IT-P06-001`, bizNo `888-88-11001`은 seed 데이터와
  겹치지 않도록 의도적으로 구분.
- Windows 로컬에서 Docker Desktop 미가용 시 Testcontainers skip — CI Linux runner 에서 실 IT 진행.
