# Phase 2.6c 재고 예약(reserve) 모델 — QA 리뷰 Cycle 1

- 검토자: QA agent (claude-sonnet-4-6)
- 브랜치: feat/phase-2-6c-inventory-deduction (HEAD c4f517e1)
- 검토일: 2026-05-31
- 대상 IT: Phase26cReserveIT / Phase26cConvertReserveIT / Phase26cSlipImmutableIT / PartnerOrderConvertIT
- 대상 E2E: clients/desktop/playwright/phase-2-6c-inventory-deduction/phase-2-6c-inventory-deduction.spec.ts

---

## 1. 시나리오 완전성 점검

### 1.1 커버된 시나리오

| # | 시나리오 | 커버 IT | 판정 |
|---|---------|--------|------|
| ① | 정상 예약 (reserve normal) | Phase26cReserveIT T2-1, Phase26cConvertReserveIT R1 | PASS |
| ② | 가용부족 409 + slip 미발행 + 재고불변 (사전차단) | Phase26cReserveIT T2-3, Phase26cConvertReserveIT R2 | PASS |
| ③ | slip 발행실패 → release 보상 | Phase26cConvertReserveIT R3 | PASS |
| ④ | 동일 convertKey 재시도 멱등 (이중예약 0) | Phase26cReserveIT T2-2, Phase26cConvertReserveIT R4 | PARTIAL — 결함 있음 (P1) |
| ⑤ | 부분전환 선택라인만 reserve | Phase26cConvertReserveIT R5, PartnerOrderConvertIT 케이스6 | PASS |
| ⑥ | 전환전표 수정/삭제 409 (불변) | Phase26cSlipImmutableIT S2/S3 | PASS |
| ⑦ | confirm reserve 미호출 회귀 | Phase26cConvertReserveIT R6, PartnerOrderConfirmService 코드 | PASS |
| ⑧ | 가용/실/예약 조회 | Phase26cReserveIT T2-5 | PASS |

---

## 2. 결함 목록

### P0 — 차단 결함

없음.

---

### P1 — 고우선 결함

#### P1-1: 멱등 재시도 케이스(R4) 테스트 논리 부정확 — slip 이중발행 위험 미검증

**위치**: `Phase26cConvertReserveIT.java` L255-303 (R4)

**현상**:
R4는 "동일 요청 2회 → 2회차 reserve 호출" 을 검증하는 케이스로 명세되어 있으나 실제 구현은 2회 전환이 모두 성공하면 `convertedQuantity=6` 이 되는 "정상 2차 부분전환" 시나리오이다. 진짜 멱등 검증 시나리오(1차 성공 후 네트워크 오류로 클라이언트가 동일 body로 재시도 → 서버 측에서 이중 전환 차단)가 빠져 있다.

**실제 체크포인트 누락**:
- `idempotencyKey`(SHA-256 기반 결정적 키)가 동일한 재시도 요청이 들어올 때 slip-service 의 멱등 보호를 통과해 이미 발행된 slipNo 를 반환하는지 단언 없음.
- 2차 요청에서 `slipServiceClient` 를 reset하여 새 stub 을 설정하므로 실제 멱등 흐름(동일 key → 기존 slipNo 반환)이 전혀 검증되지 않음.

**영향**: 네트워크 timeout 후 클라이언트 재시도 시 slip 이중 발행 위험(converted_quantity 이중 증가) 이 실제로 차단되는지 IT 수준에서 증명되지 않음.

**권고**: 동일 `idempotencyKey`(동일 convertedBefore snapshot → 동일 SHA-256)로 2회 호출 시 slip 발행은 1회만 발생하고 converted_quantity 가 단순 누적되지 않음을 단언하는 케이스 추가 필요.

---

#### P1-2: Phase26cConvertReserveIT @Transactional 누락 — DB 상태 격리 위험

**위치**: `Phase26cConvertReserveIT.java` 클래스 레벨 어노테이션

**현상**:
`Phase26cReserveIT` 에는 `@Transactional` 이 선언되어 테스트 종료 시 롤백이 자동으로 되나, `Phase26cConvertReserveIT` 에는 `@Transactional` 어노테이션이 없다. 대신 `@BeforeEach` 에서 `outboxRepository.deleteAll()` + `jdbcTemplate.update("DELETE FROM partner_order_lines")` + `orderRepository.deleteAll()` 로 수동 정리를 하고 있다.

**영향**:
- 수동 DELETE 순서가 FK 제약(partner_order_lines.partner_order_id → partner_orders.id) 에 맞게 선행 DELETE 가 먼저 실행되므로 현재 케이스에서 오류는 없다.
- 그러나 R4 케이스 내부에서 `Mockito.reset(slipServiceClient)` 후 상태를 조작하는 구간에 중간 DB 커밋이 발생하므로, 이후 테스트가 이전 케이스의 잔여 상태를 참조하는 경우 false-positive 가 발생할 수 있다.
- Singleton 컨테이너 패턴에서 여러 케이스가 동일 DB를 공유하므로 격리 부재는 케이스 순서 의존성을 생성한다.

**권고**: 클래스 레벨에 `@Transactional` 추가 또는 `@BeforeEach` + `@AfterEach` 양방향 정리 보강.

---

#### P1-3: R2 가용부족 409 → converted_quantity 불변 단언 시 balance row 부재 가능성

**위치**: `Phase26cConvertReserveIT.java` L168-203 (R2)

**현상**:
R2 에서 `inventoryClient.reserve` 를 `BusinessException(CONFLICT)` 로 stub 한 뒤 `converted_quantity` 가 0 임을 단언하나, `partner-order-service` 측 IT 는 `@MockBean InventoryClient` 를 사용하므로 실제 inventory DB 에는 reserve 호출이 전달되지 않는다. 이 단언은 `PartnerOrderConvertService` 내 로직이 reserve 실패 시 `line.convert()` 를 호출하지 않음을 검증하는 것이지, inventory DB 의 실제 불변을 검증하는 것이 아니다.

**영향**: 도메인 모델 요구사항 "가용부족 409 + 재고불변"의 inventory DB 측 단언은 `Phase26cReserveIT` T2-3 에서 별도 커버되므로 누락은 아니나, 두 IT 간 cross-service 단언 연결이 명시적 주석으로 표현되지 않아 리뷰어가 잘못 이해할 여지가 있다.

**권고**: R2 테스트 `@DisplayName` 또는 주석에 "실 inventory DB 불변 검증은 Phase26cReserveIT T2-3 에서 별도 수행" 문구 명시 (코드 수정이므로 BE agent 권고로 전달).

---

### P2 — 저우선 결함

#### P2-1: Phase26cSlipImmutableIT S3 삭제 차단 단언이 너무 광범위

**위치**: `Phase26cSlipImmutableIT.java` L134-144 (S3)

**현상**:
삭제 엔드포인트 응답 코드를 `assertThat(...).isIn(409, 422, 400)` 으로 넓게 허용하고 있다. 설계상 SENT 전표 삭제는 409 CONFLICT 가 반환되어야 하는데 400/422 도 허용한다.

**영향**: 만약 삭제 API 가 잘못된 이유(예: ID 형식 오류)로 400 을 반환하더라도 테스트가 통과하는 false-positive 가능성.

**권고**: `isEqualTo(409)` 로 narrowing. 아울러 응답 body 에서 에러 메시지 포함 단언 추가 권고.

#### P2-2: Phase26cReserveIT setUp() — 창고가 없을 경우 전체 테스트 묵시 통과

**위치**: `Phase26cReserveIT.java` L69-87 (`setUp`) 및 각 테스트 메서드 L97, L122, L145 등

**현상**:
`setUp()` 에서 `warehouses.isEmpty()` 이면 `warehouseId` 가 `null` 로 남고, 각 테스트 시작 시 `if (warehouseId == null) return;` 로 조기 종료한다. 이 경우 테스트가 skipped 도 아닌 **passed** 로 처리되어 CI 에서 "0 assertions, 0 failures" 라는 빈 통과가 발생한다.

**영향**: Flyway 마이그레이션이나 시드 데이터 누락으로 창고가 없는 경우 IT 전체가 조용히 통과 — 진짜 버그를 놓칠 수 있다.

**권고**: `warehouseId` 가 null이면 `org.junit.jupiter.api.Assumptions.assumeTrue(warehouseId != null, "창고 미존재 — 시드 확인 필요")` 로 변경하여 skipped 처리. 또는 `@BeforeEach` 에서 창고 없음 시 명시적으로 `fail()`.

#### P2-3: Playwright spec — 실 QA 스크린샷 경로 미정의

**위치**: `phase-2-6c-inventory-deduction.spec.ts` 전체

**현상**:
spec 주석에 "QA 증빙 스크린샷은 실서버 Docker 환경에서 PM 이 별도 수행" 으로 명시되어 있으나, Playwright 내 `page.screenshot()` 호출이 없고 `docs/qa/phase-2-6c-inventory-deduction/` 하위에 `.png` 파일이 없다. `feedback_pr_qa_screenshots` 가드에 따르면 PR 본문에 QA 결과 스크린샷 1장 이상 인라인 첨부가 의무이다.

**영향**: PR 머지 요건인 QA 스크린샷 의무 미충족 → PR 본문 첨부 전까지 머지 보류 필요.

**권고**: Docker 환경 실 QA 시 `page.screenshot({ path: 'docs/qa/phase-2-6c-inventory-deduction/qa-stock-balance.png' })` 추가 또는 PM이 별도 실 캡처 후 PR 본문 첨부 필요.

---

## 3. 누락 시나리오 분석

### 3.1 누락 — 중요도 높음

#### M1: convertKey 완전 재시도 멱등 (동일 idempotencyKey → slip 1회 발행 단언)

요구사항 ④ "동일 convertKey 재시도 멱등(이중예약 0)"은 두 레이어로 분리된다.
- inventory 레이어: `Phase26cReserveIT T2-2` 에서 커버 (동일 referenceId 2회 reserve → reservedQty 단일 효과).
- partner-order 레이어: `Phase26cConvertReserveIT R4` 가 실제 멱등 흐름(동일 body 재전송 → 동일 idempotencyKey → slip 1회 발행 → convertedQuantity 단일 증가)을 검증하지 않음.

진짜 재시도 멱등 검증이 IT 에 없다. P1-1에서 이미 언급했으나 별도 시나리오 항목으로도 등록.

#### M2: slip 발행 성공 후 SlipPublishedEvent → 회계 자동 분개 체인 단언 누락

도메인 모델에 "회계는 SlipPublishedEvent 자동"이 명시되어 있으나 Phase26cSlipImmutableIT 에는 `SlipPublishedEvent` 발행 여부나 회계 분개(Journal) 생성 여부를 단언하는 테스트가 없다. SAS-1(SP-SAS-1) 에서 커버한다면 그 IT 와의 연계 주석이 필요하다.

#### M3: release 멱등성 — 이중 release 시 reservedQty 음수 방지 단언 누락

`Phase26cReserveIT` 에 release 후 가용 복원(T2-4)은 있으나 동일 referenceId 로 release 2회 시도 시 reservedQty 가 음수로 가지 않음을 단언하는 케이스가 없다. 보상 트랜잭션이 retry 될 때 double-release 위험을 커버하지 않는다.

### 3.2 누락 — 중요도 보통

#### M4: warehouseCode 역조회 → 내부 토큰 누락 시 401 단언

`InternalWarehouseController` 는 `X-Internal-Token` 이 필요하나, `Phase26cReserveIT T1-1/T1-2` 에서 정상 토큰으로만 검증한다. 토큰 누락 시 401/403 반환을 단언하는 negative case 없음.

#### M5: 멀티라인 부분전환 중 1라인 가용부족 → 이미 예약 완료된 앞 라인 release 보상 검증

`PartnerOrderConvertService.convert()` 의 보상 로직은 "예약 성공 라인들"을 release 하도록 구현되어 있으나, IT 에서 실제로 2라인 주문에서 1번 라인 reserve 성공 → 2번 라인 reserve 409 → 1번 라인 release 보상이 호출되는지 검증하는 케이스가 없다. R3 는 "slip 5xx 실패 → release"이고, R2 는 reserve 자체가 1라인 요청이므로 이 경로를 커버하지 않는다.

---

## 4. Cross-Service 정합성 SQL 단언 점검

### 4.1 현황

IT 코드 전체에 걸쳐 cross-service SQL 단언(inventory_db ↔ partner_order_db ↔ slip_db 연계 row 검증)이 없다. 각 IT 는 서비스 단위 독립 Testcontainers PostgreSQL 을 사용하므로 설계상 cross-DB 쿼리는 IT 에서 직접 실행 불가하다.

### 4.2 누락 — 도메인 정합성 SQL 체크리스트 미작성

도메인 정합성 SQL(`docs/qa/<slice>/domain-integrity-check.md`)이 Phase 2.6c 슬라이스에 작성되지 않았다. 기존 슬라이스(`sp-08-fu2-test-safety-bulk/domain-integrity-check.md` 등)에서 확인된 패턴인 cross-DB SQL 단언이 없다.

**필요 SQL 단언 항목**:

```sql
-- 1. reserve movement ↔ converted_quantity 정합
--    inventory_db의 RESERVE movement row 수 = partner_order_db의 converted_quantity 변경 이력 수
SELECT sm.reference_id, sm.product_id, sm.quantity_delta
FROM inventory_db.stock_movements sm
WHERE sm.reference_type = 'PARTNER_ORDER_CONVERT'
  AND sm.movement_type = 'RESERVE';
-- 대응 단언: partner_order_db.partner_order_lines.converted_quantity 누적합 일치

-- 2. slip lines source_order_line_id ↔ partner_order_lines.id 참조 정합
SELECT sl.source_order_line_id, pol.id
FROM slip_db.slip_lines sl
LEFT JOIN partner_order_db.partner_order_lines pol
  ON sl.source_order_line_id = pol.id
WHERE sl.source_order_line_id IS NOT NULL
  AND pol.id IS NULL;
-- 결과 0건 이어야 함 (dangling reference 없음)

-- 3. PARTNER_ORDER 전환 전표 status = SENT 불변
SELECT id, status, source_type
FROM slip_db.slips
WHERE source_type = 'PARTNER_ORDER'
  AND status NOT IN ('SENT')
  AND is_deleted = false;
-- 결과 0건 이어야 함

-- 4. reserve 멱등 uniqueness — (reference_type, reference_id, product_id, RESERVE) 중복 없음
SELECT reference_type, reference_id, product_id, COUNT(*) as cnt
FROM inventory_db.stock_movements
WHERE movement_type = 'RESERVE'
  AND reference_type IS NOT NULL
  AND reference_id IS NOT NULL
GROUP BY reference_type, reference_id, product_id
HAVING COUNT(*) > 1;
-- 결과 0건 이어야 함 (V14 partial unique index 가 DB 레벨 보장)

-- 5. availableQty 음수 없음
SELECT id, product_id, warehouse_id, available_qty
FROM inventory_db.stock_balances
WHERE available_qty < 0 AND is_deleted = false;
-- 결과 0건 이어야 함
```

---

## 5. 회계 금액 정합 단언 점검

### 5.1 현황

`Phase26cSlipImmutableIT` 에서 `SlipPublishedEvent` 기반 회계 금액 단언이 없다. `publishPartnerOrderSlip` 헬퍼에서 `buildLine()` 은 단가 10,000원 × 1건 = subtotal 10,000원이지만, slip 발행 후 `accounting-service` 의 `Journal` 에서 `sum(debit) == sum(credit)` 복식부기 불변을 검증하는 단언이 없다.

부분전환 시 slip `SlipPublishedEvent` 금액 = 선택라인 subtotal 합 단언이 누락되어 있다 (P2-4 수준).

---

## 6. Mock/Fake-data 정책 점검 (no-fake-data-ever)

### 6.1 IT (@MockBean 격리)

모든 IT에서 외부 RestClient 는 `@MockBean` 으로 격리되어 있다. 확인된 목록:

| IT | MockBean 목록 | 판정 |
|----|--------------|------|
| Phase26cReserveIT | ProductClient | 충족 |
| Phase26cConvertReserveIT | EstimateClient, DcConfigClient, ProductClient, InventoryClient, SlipServiceClient, PartnerAuthClient, PartnerLookupClient, ProductCatalogLookupClient, DynamicPermissionClient | 충족 |
| Phase26cSlipImmutableIT | ProductClient, InventoryClient, PartnerInternalClient, UserInternalClient, WarehouseInternalClient | 충족 |
| PartnerOrderConvertIT | 동일 Phase26cConvertReserveIT 목록 | 충족 |

`feedback_it_mockbean_external_clients` 가드 완전 충족.

### 6.2 Playwright E2E (mock.ts)

Playwright spec 은 `VITE_MOCK_MODE=1` 환경에서만 실행되며, 주석으로 "QA 증빙 스크린샷은 실서버 Docker 환경에서 PM 이 별도 수행. mock 캡처 금지" 를 명시하고 있다. `feedback_no_fake_data_ever` 원칙에 따르면 Playwright mock 캡처를 QA 증빙으로 제출하면 안 된다.

현재 `docs/qa/phase-2-6c-inventory-deduction/` 에 `.png` 파일이 없으므로 PR 본문에 QA 스크린샷이 첨부되지 않았다 — P2-3 결함.

---

## 7. Testcontainers / AbstractPostgresIT 점검

| 항목 | 확인 결과 |
|------|----------|
| PostgreSQL 버전 | `postgres:16-alpine` — 표준 준수 |
| 싱글턴 컨테이너 | 3개 서비스 모두 static POSTGRES 필드 방식 — 올바름 |
| Docker 미가용 시 skip | DockerAvailableCondition 으로 skip (fail 아님) — 올바름 |
| HikariCP 풀 축소 (max=3) | 3개 서비스 모두 설정 — 올바름 |
| Eureka 비활성 | 3개 서비스 모두 `eureka.client.enabled=false` — 올바름 |
| Flyway 활성 | 3개 서비스 모두 `spring.flyway.enabled=true` — 올바름 |
| partner-order AbstractPostgresIT HikariCP 풀 size | max=3, min-idle=1 — 올바름 |
| inventory AbstractPostgresIT DynamicPermissionClient | `@MockBean` + lenient stub 공통 제공 — 올바름 |

**주의**: `Phase26cConvertReserveIT` 의 `@Transactional` 누락 (P1-2 참조).

---

## 8. Docker 실 QA 시나리오 체크리스트 (Task 8)

Docker compose 환경(`docker-compose up inventory-service partner-order-service slip-service`)에서 아래 순서로 실 QA 수행 권고:

```
[ ] 1. 준비: inventory_db 에 WH-MAIN 창고 + productId P-TEST-001 + availableQty=5 seed
    psql -c "SELECT id, code, available_qty, reserved_qty, total_qty FROM stock_balances WHERE product_id = '<P-TEST-001>';"
    증빙: psql 출력 캡처 (docs/qa/phase-2-6c-inventory-deduction/qa-01-initial-balance.png)

[ ] 2. 정상 reserve — POST /inventory/reserve (qty=3, refType=PARTNER_ORDER_CONVERT)
    기대: HTTP 200, availableQty=2, reservedQty=3
    증빙: curl 출력 캡처 (qa-02-reserve-success.png)

[ ] 3. inventory_db stock_movements 예약 row 확인
    psql -c "SELECT id, movement_type, quantity_delta, reference_type, reference_id FROM stock_movements WHERE reference_type='PARTNER_ORDER_CONVERT';"
    증빙: psql 출력 캡처 (qa-03-reserve-movement-row.png)

[ ] 4. 가용부족 409 사전차단
    POST /inventory/reserve (qty=5, 가용=2) → HTTP 409 확인
    psql -c "SELECT available_qty, reserved_qty FROM stock_balances WHERE ...;" → 불변(2, 3) 확인
    증빙: curl + psql 캡처 (qa-04-insufficient-409.png)

[ ] 5. convert-to-slip 정상 전환 (partner-order-service)
    POST /api/v1/partner-orders/{draftOrderId}/convert-to-slip (warehouseCode=WH-MAIN, qty=2)
    기대: HTTP 200, slipNo 반환
    psql partner_order_db -c "SELECT converted_quantity FROM partner_order_lines WHERE id='<lineId>';"
    psql inventory_db -c "SELECT available_qty, reserved_qty FROM stock_balances WHERE ...;"
    psql slip_db -c "SELECT slip_no, status, source_type FROM slips WHERE source_type='PARTNER_ORDER';"
    증빙: curl + psql 3개 DB 동시 캡처 (qa-05-convert-cross-db.png) -- cross-service 정합 핵심

[ ] 6. 전환 전표 불변 확인
    PUT /api/v1/slips/sales/{slipId} → HTTP 409 확인
    DELETE /api/v1/slips/sales/{slipId} → HTTP 409 확인
    증빙: curl 캡처 (qa-06-immutable-409.png)

[ ] 7. slip 발행 실패 release 보상 시뮬레이션
    slip-service 를 임시 중단 후 convert-to-slip 재시도
    inventory_db 에 reserve row 추가 없음 (release 보상 발생) 확인
    증빙: psql stock_movements 쿼리 캡처 (qa-07-release-compensation.png)

[ ] 8. 재고 현황 화면 실 QA (데스크톱 앱)
    Docker 실서버 연결 후 /inventory/stock-balance 화면 오픈
    가용재고/예약재고/실재고 3구분 컬럼 표시 확인
    증빙: 화면 스크린샷 (qa-08-stock-balance-screen.png) — PR 본문 첨부 필수

[ ] 9. domain-integrity-check SQL 실행 (섹션 4.2의 5개 쿼리)
    psql inventory_db -c "..." 각 쿼리 실행, 결과 0건 확인
    증빙: psql 출력 캡처 (qa-09-integrity-check.png)
```

---

## 9. 종합 판정

| 영역 | 결함 | 판정 |
|------|------|------|
| IT @MockBean 격리 | 없음 | PASS |
| Testcontainers 설정 | 없음 | PASS |
| 시나리오 커버리지 | P1-1 멱등 재시도, M2 SlipPublishedEvent, M3 이중release, M5 멀티라인 보상 누락 | CONDITIONAL |
| cross-service SQL 단언 | domain-integrity-check.md 미작성 | MISSING |
| no-fake-data 가드 | Playwright mock캡처 금지 명시됨, 실 스크린샷 미첨부 | BLOCKING (P2-3) |
| 회계 금액 정합 | SlipPublishedEvent 금액 단언 없음 | MISSING |

**최종 판정: CONDITIONAL APPROVE**

P0 차단 결함 없음. P1-1(멱등 재시도 IT 미검증), P1-2(@Transactional 누락)을 수정하고, PR 본문에 실 QA 스크린샷 1장 이상 첨부 후 머지 가능. domain-integrity-check.md 및 M2-M5 시나리오는 차기 슬라이스에서 보완 가능하나 현 슬라이스 merge 전 BE agent 에게 P1-1/P1-2 수정 요청 필수.
