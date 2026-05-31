# Phase 2.6c 재고 예약(reserve) 모델 — QA 리뷰 Cycle 2

- 검토자: QA agent (claude-sonnet-4-6)
- 브랜치: feat/phase-2-6c-inventory-deduction (HEAD a292ac40)
- 검토일: 2026-05-31
- 기준: claude-qa-cycle1.md (HEAD c4f517e1 기준)
- 수정 커밋: 7fe9bb1c (cycle1 5팀 결함 수정) + a292ac40 (CI 잔여 IT 3종 수정)

---

## 1. CI 결과 검증

### 1.1 전체 check 집계

| 항목 | 결과 |
|------|------|
| 전체 checks | 23 |
| SUCCESS | 23 |
| FAILURE | 0 |
| NEUTRAL/SKIPPED | 0 |

모든 23개 check SUCCEEDED. CI green 확인.

### 1.2 관련 빌드 그룹 개별 확인

| CI 잡 | 결과 |
|--------|------|
| 빌드 + 테스트 (user+product+inventory+logging) | pass |
| 빌드 + 테스트 (accounting+partner) | pass |
| 빌드 + 테스트 (slip-it-core) | pass |
| 빌드 + 테스트 (slip-it-public) | pass |
| JUnit 테스트 결과 (user+product+inventory+logging) | pass |
| JUnit 테스트 결과 (accounting+partner) | pass |
| JUnit 테스트 결과 (slip-it-core) | pass |
| JUnit 테스트 결과 (slip-it-public) | pass |

### 1.3 skipped 단계 확인

`Tesseract OCR 설치 (PR-F2 전용 accounting+partner 그룹)` step 이 6개 빌드 그룹에서 skipped — 이 step 은 accounting+partner 전용 OCR 의존성이며 Phase 2.6c 와 무관한 조건부 skip. IT skipped=0 (Testcontainers Postgres 기반 IT 모두 정상 실행) 확인.

---

## 2. Cycle1 결함별 해소 확인

### P1-1: 멱등 재시도 케이스(R4) 테스트 논리 부정확

**해소 여부: 부분 해소 (잔여 기록 필요)**

cycle1 에서 지적한 핵심 결함: "동일 idempotencyKey 재시도 → slip 1회만 발행 + converted_quantity 단일 증가"를 검증하지 않음.

수정된 R4 (7fe9bb1c) 상태 분석:

- 1차 요청 성공 후 `convertedAfterFirst = 3` 단언: 올바름.
- `Mockito.reset(inventoryClient, slipServiceClient)` 호출 후 재stub: 여전히 존재(L316).
- 2차 요청에서 `inventoryClient.reserve` → `ReservationResult.noop()` 반환 stub: 구현됨.
- `verify(inventoryClient, never()).release(...)`: 2차 성공 시 release 미호출 단언 추가됨 — 올바름.
- 2차 이후 `convertedAfterSecond = 6` 단언(L355).

**잔여 한계 (비차단)**:

R4는 `Mockito.reset` 으로 slipServiceClient 를 초기화한 뒤 동일 `STUB_SLIP_NO` 를 반환하는 stub 을 재설정한다. 이 구조에서:

1. `convertedAfterSecond = 6` 단언은 2차 요청이 "별도 전환(3개 추가)"으로 성공했음을 검증한다. 이것은 cycle1 이 지적한 "진짜 멱등 시나리오(동일 body 재시도 → 동일 idempotencyKey → DB에서 기존 slip 반환)"와 다르다. 실제로 1차에서 `convertedQuantity=3`이 됐으므로 2차 `buildIdempotencyKey`는 `convertedBefore=3`을 포함해 다른 SHA-256을 생성 → 실제로 새 전환이다.
2. `Mockito.reset` 이후 lenient stub 으로 `slipServiceClient.publishFromPartnerOrder` 를 재설정하므로 slip-service 의 실제 멱등 응답(기존 idempotencyKey → 기존 slipNo 그대로 반환)이 모킹되지 않는다. R4 댓글(L312-315)이 이를 인지하고 "IT 환경의 한계"로 명시했다.
3. 핵심 단언: `verify(inventoryClient, never()).release(...)` (L348-350) — 2차 요청 시 `ReservationResult.noop()` 반환 라인이 `reservedLines` 에 추가되지 않아 compensate 미발동을 검증. 이 단언은 P1-1이 요구한 "no-op 라인에 대한 double-release 방지" 핵심을 커버한다.

**결론**: P1-1 의 핵심(no-op 라인 double-release 방지)은 R4 L348-350 단언으로 IT 수준에서 입증됨. 진짜 동일 idempotencyKey 재전송 시나리오(네트워크 timeout 후 DB 미변경 상태 재시도)는 여전히 미커버 — 비차단 잔여로 기록.

---

### P1-2: @Transactional 누락

**해소 여부: 완전 해소**

`Phase26cConvertReserveIT` 클래스 레벨에 `@Transactional` 이 추가됨(L78).

```java
@Transactional
class Phase26cConvertReserveIT extends AbstractPostgresIT {
```

Javadoc 주석(L71-75)에 MockMvc + @Transactional 조합 동작 설명 포함. 케이스 순서 의존성 제거 확인.

---

### M5: 멀티라인 후행 가용부족 → 선행 release 보상

**해소 여부: 완전 해소**

`m5_multiLine_firstReserveSuccess_secondInsufficient_compensatesFirst` 케이스 신규 추가됨(L509-600).

- 2라인(productIdA, productIdB) INSERT
- productIdA: `reserve` → `ReservationResult.reserved()` stub
- productIdB: `reserve` → `BusinessException(CONFLICT)` stub
- 단언:
  - `verify(inventoryClient).release(eq(productIdA), ...)` — 선행 라인 보상 호출됨
  - `verify(inventoryClient, never()).release(eq(productIdB), ...)` — 후행 라인 미호출
  - `verify(slipServiceClient, never()).publishFromPartnerOrder(...)` — slip 미발행
  - `convertedA = 0`, `convertedB = 0` — 양 라인 불변
- HTTP 응답 `status().isConflict()` 단언

구현체(`PartnerOrderConvertService.convert()` L171-175)의 보상 로직(`compensateReserved`)이 정확히 M5 시나리오를 처리하는지 IT 단언 완전 일치 확인.

---

### P2-1: SlipImmutableIT S3 삭제 단언이 광범위

**해소 여부: 미반영 (잔여 기록)**

`Phase26cSlipImmutableIT` S3 (L143-162) 의 삭제 단언:

```java
.andExpect(result ->
        assertThat(result.getResponse().getStatus()).isIn(409, 422, 400));
```

cycle1 권고(`isEqualTo(409)` narrowing)가 적용되지 않았다. a292ac40 커밋에서 S3 관련 변경은 "S2 수정 lineItem productId 추가" 및 "S5 cancel 경로 수정"이고 S3 assertion 변경은 없다.

**영향 재평가**: 실제 DELETE `/slips/{id}/sales` 엔드포인트에서 SENT 상태 전표 삭제 시 도메인 설계상 409가 반환되어야 한다. 그러나 `Slip.requireEditable()` 경로가 아닌 다른 경로(예: validation 오류)로 400이 반환되도 현재 단언이 통과한다. 설계 결함은 아니나 false-positive 가능성 잔존. CI green이므로 비차단.

---

### P2-2: Phase26cReserveIT setUp 창고 미존재 시 return → assumeTrue 교체

**해소 여부: 미반영 (잔여 기록)**

`Phase26cReserveIT.setUp()` (L73-76) 및 각 테스트 메서드(L100, L126, L148, L187, L205, L241):

```java
if (warehouses.isEmpty()) {
    return;
}
// ...
if (warehouseId == null) return;
```

`assumeTrue` 교체가 적용되지 않았다. 창고 미존재 시 테스트가 passed(empty pass)로 처리되는 문제 잔존.

**영향 재평가**: CI 환경에서는 Testcontainers Flyway + 시드가 정상 실행되어 창고가 존재하므로 현재 CI에서는 발현 안 됨. 단, 시드 미존재 환경에서 조용한 empty pass 위험 유지. 비차단.

---

### M2: SlipPublishedEvent → 회계 자동 분개 체인

**해소 여부: 미반영 (잔여 비차단)**

`Phase26cSlipImmutableIT` 에 `SlipPublishedEvent` 발행 + 회계 Journal 분개 단언 없음. SAS-1 슬라이스와의 연계 주석도 없다. cycle1 권고대로 비차단 잔여.

---

### M3: 이중 release 시 reservedQty 음수 방지

**해소 여부: 구현 레벨 해소 (IT 직접 단언 미추가)**

`StockService.release()` (L149-164)에 멱등 가드 추가됨:

```java
// 멱등 no-op 예약 라인(alreadyReserved=true)이 compensateReserved 에서 잘못
// release 되는 경우 또는 보상 release 가 중복 호출되는 경우 reservedQty 음수 방지.
if (req.referenceType() != null && req.referenceId() != null) {
    boolean hasReserveMovement = stockMovementRepository
            .findByReferenceTypeAndReferenceIdAndProductIdAndMovementType(...)
            .isPresent();
    if (!hasReserveMovement) {
        return new ReservationResponse(...); // no-op
    }
}
```

동일 referenceId로 release 2회 시도 시 RESERVE movement 없음 → no-op 반환으로 reservedQty 음수 방지 구현됨. IT에서 "이중 release" 직접 시나리오 단언은 추가되지 않았으나 구현 가드로 위험 제거됨. 비차단.

---

### M4: 내부 토큰 누락 시 401 단언

**해소 여부: 미반영 (잔여 비차단)**

`Phase26cReserveIT` 에 `X-Internal-Token` 누락 시 401 negative case 단언 없음. cycle1 M4 비차단 잔여 유지.

---

## 3. Cross-Service 정합성 IT/SQL 단언 점검

### 3.1 IT 단언 현황 (MockBean 격리 구조)

각 IT는 서비스 단위 독립 Testcontainers를 사용하므로 cross-DB 직접 쿼리 불가. 서비스간 정합은 Mock 통해 아래 경로로 간접 검증:

| 정합 항목 | 검증 방법 | 커버 |
|-----------|----------|------|
| reserve movement ↔ converted_quantity | R1: reserve 호출 + converted_quantity DB 단언, R4: release 미호출 + converted 누적 단언 | 간접 커버 |
| slip_lines.source_order_line_id 참조 | R1: slipNo 반환 확인, M5: slip 미발행 단언 | 간접 커버 (실 DB 단언 없음) |
| SENT 전표 불변 | S1~S3, S5: status SENT 직접 단언, PUT/DELETE/cancel 409 | 커버 |
| reserve 멱등 uniqueness | T2-2: 동일 referenceId 2회 → reservedQty 단일 증가 | 커버 |
| availableQty 음수 없음 | T2-3: 가용부족 409 사전차단, T2-4: release 후 복원 | 커버 |

### 3.2 domain-integrity-check.md 미작성 상태 유지

cycle1 에서 요구한 `docs/qa/phase-2-6c-inventory-deduction/domain-integrity-check.md` 미작성. cycle1 결함 섹션 4.2의 5개 SQL 단언(reserve movement, dangling reference, SENT 불변, 멱등 uniqueness, availableQty 음수 없음)은 PM Docker 실 QA 시 수동 실행 권고.

---

## 4. 회계 금액 정합 단언 점검

`Phase26cSlipImmutableIT` 에 `SlipPublishedEvent` 기반 회계 금액 단언 없음 — cycle1 M2와 동일. slip 발행 성공 자체는 S1 단언으로 확인됨. SAS-1 (SP-SAS-1) 에서 복식부기 불변 `sum(debit)==sum(credit)` 커버 예상 — 차기 슬라이스 연계 주석 비차단.

---

## 5. Mock/Fake-data 정책 점검 (no-fake-data-ever)

### 5.1 IT @MockBean 격리 재확인

cycle1 대비 신규 추가 케이스(M5) 포함 전체 MockBean 목록 이상 없음:

| IT | 추가/변경 MockBean | 판정 |
|----|-------------------|------|
| Phase26cConvertReserveIT | M5 케이스 내부 Mockito.when 직접 — 클래스 레벨 @MockBean 재사용 | 충족 |

`feedback_it_mockbean_external_clients` 가드 완전 충족 유지.

### 5.2 실 QA 스크린샷 (P2-3 잔여)

`docs/qa/phase-2-6c-inventory-deduction/` 디렉토리에 `.png` 파일 여전히 없음. `feedback_pr_qa_screenshots` 가드(PR 본문 QA 스크린샷 1장 이상 인라인 첨부 의무) 미충족 상태. PR #327 본문(`pr-body.md`) 에도 스크린샷 첨부 항목이 체크리스트로만 존재.

---

## 6. Testcontainers / AbstractPostgresIT 재확인

| 항목 | cycle1 | cycle2 | 변경 |
|------|--------|--------|------|
| PostgreSQL 버전 | 16-alpine | 16-alpine | 없음 |
| 싱글턴 컨테이너 | 3서비스 | 3서비스 | 없음 |
| Docker 미가용 skip | 유 | 유 | 없음 |
| IT skipped count | 0 | 0 (CI 23/23 SUCCESS) | 없음 |
| inbound receivedAt 형식 | LocalDateTime 파싱 실패 (버그) | "2026-01-01T00:00:00" 수정됨 | a292ac40 해소 |
| Phase26cConvertReserveIT @Transactional | 없음 (P1-2) | @Transactional 추가됨 | 해소 |

---

## 7. Docker 실 QA 체크리스트 (PM 수행용)

실 inventory_db / partner_order_db / slip_db 연동 Docker compose 환경에서 아래 순서 수행. 모든 캡처는 실 psql/curl 출력만 허용(`feedback_no_fake_data_ever`).

```
[ ] 1. 초기 재고 확인
    psql inventory_db -c "SELECT id, code FROM warehouses WHERE is_deleted=false LIMIT 3;"
    psql inventory_db -c "SELECT available_qty, reserved_qty, total_qty FROM stock_balances WHERE product_id='<UUID>' AND is_deleted=false;"
    증빙: docs/qa/phase-2-6c-inventory-deduction/qa-01-initial-balance.png

[ ] 2. reserve 정상 POST
    curl -X POST http://localhost:8084/inventory/reserve \
      -H "X-User-Id: <UUID>" -H "X-User-Role: MASTER" \
      -d '{"productId":"<UUID>","warehouseId":"<UUID>","quantity":3,"referenceType":"PARTNER_ORDER_CONVERT","referenceId":"<UUID>"}'
    기대: HTTP 200, reservedQty=3, availableQty 감소
    증빙: qa-02-reserve-success.png

[ ] 3. stock_movements reserve row 확인
    psql inventory_db -c "SELECT movement_type, quantity_delta, reference_type, reference_id FROM stock_movements WHERE reference_type='PARTNER_ORDER_CONVERT' ORDER BY created_at DESC LIMIT 5;"
    기대: RESERVE row 1건, quantity_delta=3
    증빙: qa-03-reserve-movement-row.png

[ ] 4. 가용부족 409 차단
    (가용재고 < 요청수량으로 reserve 재요청)
    기대: HTTP 409
    psql → available_qty/reserved_qty 불변 확인
    증빙: qa-04-insufficient-409.png

[ ] 5. convert-to-slip 정상 전환 (cross-DB 정합 핵심)
    curl -X POST http://localhost:8087/api/v1/partner-orders/<orderId>/convert-to-slip \
      -H "X-User-Id: <SALES_UUID>" -H "X-User-Role: SALES" \
      -d '{"items":[{"orderLineId":"<UUID>","quantity":2}],"warehouseCode":"<WH-CODE>"}'
    기대: HTTP 200, slipNo 반환
    3-DB 동시 확인:
      psql partner_order_db -c "SELECT converted_quantity FROM partner_order_lines WHERE id='<UUID>';"
      psql inventory_db -c "SELECT available_qty, reserved_qty FROM stock_balances WHERE product_id='<UUID>';"
      psql slip_db -c "SELECT slip_no, status, source_type FROM slips WHERE source_type='PARTNER_ORDER';"
    증빙: qa-05-convert-cross-db.png (3-DB 동시 캡처 — PR 본문 필수)

[ ] 6. 전환 전표 불변 확인
    curl -X PUT http://localhost:8086/slips/<slipId>/sales → HTTP 409 확인
    curl -X DELETE http://localhost:8086/slips/<slipId>/sales → HTTP 409 확인
    증빙: qa-06-immutable-409.png

[ ] 7. cancel 불변 확인 (S5 검증)
    curl -X POST http://localhost:8086/slips/<slipId>/cancel → HTTP 409 확인
    psql slip_db → status=SENT 유지 확인
    증빙: qa-07-cancel-409.png

[ ] 8. domain-integrity-check SQL 실행 (5쿼리)
    -- Q1: RESERVE movement 중복 없음
    psql inventory_db -c "SELECT reference_type, reference_id, product_id, COUNT(*) cnt FROM stock_movements WHERE movement_type='RESERVE' AND reference_type IS NOT NULL GROUP BY 1,2,3 HAVING COUNT(*) > 1;"
    -- 기대: 0건

    -- Q2: dangling source_order_line_id
    -- (cross-DB이므로 각 DB 별도 실행 후 수동 대조)
    psql slip_db -c "SELECT source_order_line_id FROM slip_lines WHERE source_order_line_id IS NOT NULL;"
    psql partner_order_db -c "SELECT id FROM partner_order_lines WHERE id IN (<위 결과>);"

    -- Q3: availableQty 음수 없음
    psql inventory_db -c "SELECT id, available_qty FROM stock_balances WHERE available_qty < 0 AND is_deleted=false;"
    -- 기대: 0건

    -- Q4: PARTNER_ORDER 전표 status=SENT 불변
    psql slip_db -c "SELECT id, status, source_type FROM slips WHERE source_type='PARTNER_ORDER' AND status NOT IN ('SENT') AND is_deleted=false;"
    -- 기대: 0건

    -- Q5: converted_quantity 정합 (partner_order_db 내)
    psql partner_order_db -c "SELECT id, quantity, converted_quantity FROM partner_order_lines WHERE converted_quantity > quantity;"
    -- 기대: 0건 (전환수량이 주문수량 초과 불가)

    증빙: qa-08-integrity-check.png

[ ] 9. 재고현황 화면 실 QA (데스크톱 앱)
    Docker 실서버 연결 후 재고현황 페이지 오픈
    가용재고/예약재고/실재고 3구분 컬럼 확인
    페이지네이션 동작 확인
    증빙: qa-09-stock-balance-screen.png (PR 본문 인라인 첨부 필수)
```

---

## 8. 잔여 결함 집계

| ID | 내용 | 우선도 | 차단 여부 | cycle2 판정 |
|----|------|--------|-----------|-------------|
| P1-1 잔여 | R4: 진짜 동일 idempotencyKey(DB 미변경 상태 재전송) 시나리오 미커버. no-op double-release 방지는 단언됨. | P1 → P2 격하 | 비차단 | 잔여 기록 |
| P2-1 | S3 삭제 단언 `isIn(409,422,400)` — narrowing 미적용 | P2 | 비차단 | 잔여 기록 |
| P2-2 | Phase26cReserveIT setUp `return` → `assumeTrue` 교체 미적용 | P2 | 비차단 | 잔여 기록 |
| P2-3 | QA 스크린샷 미첨부 — `feedback_pr_qa_screenshots` 가드 위반 | P2 | PM Docker 실 QA 후 첨부로 해소 가능 | PM 진행 필요 |
| M2 | SlipPublishedEvent → 회계 분개 단언 | M(중요도 중) | 비차단 (SAS-1 연계) | 잔여 기록 |
| M4 | 내부 토큰 누락 401 negative case | M(중요도 보통) | 비차단 | 잔여 기록 |

**P0 차단 결함 없음. P1 차단 결함 없음.**

---

## 9. 종합 판정

### cycle1 해소 요약

| cycle1 결함 | 해소 여부 |
|-------------|----------|
| P1-1 멱등 재시도 핵심(no-op double-release) | 부분 해소 → P2 격하 |
| P1-2 @Transactional 누락 | 완전 해소 |
| M5 멀티라인 보상 케이스 | 완전 해소 |
| P2-1 S3 삭제 단언 narrowing | 미반영 (비차단) |
| P2-2 assumeTrue 교체 | 미반영 (비차단) |
| M2/M3/M4 누락 시나리오 | M3 구현 가드 추가, M2/M4 미반영 (비차단) |

### 최종 판정: **APPROVE (cycle2)**

- P0 차단 결함: 없음
- P1 차단 결함: 없음 (P1-1 핵심 해소됨)
- CI: 23/23 SUCCESS (Testcontainers Postgres IT 포함)
- @MockBean 격리: 완전 충족
- @Transactional: 추가됨
- M5 멀티라인 보상: 완전 구현 + IT 커버

**머지 선결 조건**:
1. PM Docker 실 QA 수행 후 `docs/qa/phase-2-6c-inventory-deduction/` 에 실 캡처 PNG 1장 이상 첨부 (`feedback_pr_qa_screenshots` 가드 필수).
2. PR #327 본문에 실 캡처 인라인 첨부.

잔여 비차단 결함(P2-1, P2-2, M2, M4, P1-1 잔여)은 차기 슬라이스에서 보완.
