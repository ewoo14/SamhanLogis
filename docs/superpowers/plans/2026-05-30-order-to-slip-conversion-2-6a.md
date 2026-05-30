# 주문→출고전표 부분전환 (Phase 2.6a) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development (Codex 6/1 12:00 복구 전 Claude 에이전트 대체). Steps use checkbox.

**Goal:** slip 미발행 주문(견적전환 DRAFT 등)을 라인별·수량별로 골라 출고전표로 전환하고, 전환된 수량을 주문 라인에 추적한다(부분전환).

**Architecture:** PartnerOrderLine 에 `converted_quantity` 추가(잔여=quantity-converted) + 단일주문 `POST /{id}/convert-to-slip`(선택 라인+수량) → slip-service 발행(선택 라인만, SlipLine.sourceOrderLineId 기록) → 성공 시 converted_quantity 갱신 + 전량전환 시 주문 CONVERTED. **confirm 자동발행/병합은 본 PR 제외(2.6b).** 대상=slipNo null 주문만.

**Tech Stack:** Spring Boot 3 / JPA / PostgreSQL / Testcontainers / React. 브랜치 `feat/phase-2-6-order-to-slip-conversion`. spec: `docs/superpowers/specs/2026-05-30-order-to-slip-conversion-design.md`.

**Grounding 확정:**
- `PartnerOrderLine`(partner-order-service): id/productId/modelName/productName/categoryKey/quantity(int)/priceVat/subtotal/remark. **converted_quantity 없음** → 추가.
- `PartnerOrder.slipNo` UNIQUE(partial, null 허용). status DRAFT(견적전환,slipNo=null)/ON_HOLD/CONFIRMING/CONFIRMED/CANCELED + Phase2.5 ON_HOLD.
- 견적→주문(`PartnerOrderFromEstimateService.createFromEstimate`): DRAFT, slipNo=null, slipPublishStatus=NOT_REQUIRED → **부분전환 주 대상**.
- slip-service: `SlipPublishController POST /api/v1/slips/from-partner-order` → `SlipPublishService.publishFromPartnerOrder` → `publishInternal`(전 라인 → Slip.createOutbound + addLine + assignPublishSource(PARTNER_ORDER, sourceId) + fingerprint). idempotencyKey = `idemKeyFromHeader(partnerOrderId)`.
- `PublishFromPartnerOrderRequest`(partnerOrderId/ioDate/partnerCode/warehouseCode/memo/lines[PublishLineRequest]). `PublishLineRequest`(productCode/specification/quantity/unitPriceVat/remarks).
- `SlipLine`: id/slipId/lineNo/productId/productCode/productName/specification/quantity/unitPriceVat/supply/vat/line_amount/remarks. **sourceOrderLineId 없음** → 추가.
- Flyway: partner-order V7 / slip V9.
- 권한: 발행 `slip.publish.from-partner-order` CREATE. 전환 신규 page `sales.partner-order.convert` 또는 재사용(Task 4 결정).

**범위 한정(중요):** 본 PR 은 **단일 주문 부분전환**만. 다중주문 병합·confirm 자동발행 폐지·헤더 '/'병기·재고/회계 정합은 2.6b/2.6c.

---

## Task 1: slip-service — SlipLine.sourceOrderLineId 추적 컬럼

**Files:**
- Create: `services/slip-service/src/main/resources/db/migration/V10__add_slip_line_source_order_line.sql`
- Modify: `services/slip-service/src/main/java/com/samhanair/logis/slip/domain/SlipLine.java`

- [ ] **Step 1: V10 마이그레이션**
```sql
-- 부분전환 추적: slip_line 이 어느 주문 라인에서 왔는지 (Phase 2.6a)
ALTER TABLE slip_lines ADD COLUMN source_order_line_id UUID;
COMMENT ON COLUMN slip_lines.source_order_line_id IS '출처 주문 라인 ID (partner-order 부분전환 추적, nullable)';
```
> slip-service 최신이 V9 인지 먼저 확인(grounding: V9). 더 높으면 그 다음 번호.

- [ ] **Step 2: SlipLine 컬럼 + create 시그니처 확장**
`SlipLine` 에 필드 추가 + create 마지막 인자로 `UUID sourceOrderLineId` 추가:
```java
    @Column(name = "source_order_line_id")
    private UUID sourceOrderLineId;
```
private 생성자 + `static SlipLine create(...)` 에 `UUID sourceOrderLineId` 파라미터 추가(마지막), 필드 대입. **호출처(Slip.addLine) 전부 갱신 필요** — Step 3.

- [ ] **Step 3: Slip.addLine 시그니처에 sourceOrderLineId 전달**
`Slip.java` 의 `addLine(...)` 메서드(SlipLine.create 호출처)에 `UUID sourceOrderLineId` 파라미터 추가하고 create 에 전달. 기존 호출처(SlipPublishService.publishInternal 등)는 일단 `null` 전달(Task 3에서 실제 값 연결). **컴파일 깨지지 않게 모든 addLine 호출처에 null 추가.**

- [ ] **Step 4: 컴파일**
Run: `./gradlew :services:slip-service:compileJava`
Expected: BUILD SUCCESSFUL

- [ ] **Step 5: Commit**
```
feat(order-convert): slip_line.source_order_line_id 추적 컬럼 (V10)
```

## Task 2: slip-service — 부분전환 발행 요청에 sourceOrderLineId 수용

**Files:**
- Modify: `services/slip-service/.../publish/PublishLineRequest.java`
- Modify: `services/slip-service/.../publish/SlipPublishService.java` (publishInternal + resolveLines)

- [ ] **Step 1: PublishLineRequest 에 sourceOrderLineId(nullable) 추가**
```java
public record PublishLineRequest(
        @NotBlank String productCode,
        String specification,
        @NotNull @Min(1) Integer quantity,
        BigDecimal unitPriceVat,
        String remarks,
        java.util.UUID sourceOrderLineId
) {
}
```
> record 필드 추가 → 생성자 호출처(테스트/partner-order client payload) 영향. 기존 호출은 마지막 인자 null. partner-order-service 의 payload Map 방식이면 키만 추가.

- [ ] **Step 2: resolveLines/SlipLineDraft 에 sourceOrderLineId 전파**
`SlipLineDraft` record(내부)에 `UUID sourceOrderLineId` 추가, `resolveLines` 가 `PublishLineRequest.sourceOrderLineId()` 를 담고, `publishInternal` 의 `slip.addLine(...)` 호출에 `d.sourceOrderLineId()` 전달(Task1 Step3 의 null 자리 대체).

- [ ] **Step 3: 컴파일 + 기존 발행 IT 회귀**
Run: `./gradlew :services:slip-service:compileJava :services:slip-service:compileTestJava`
Expected: BUILD SUCCESSFUL (기존 SlipPublish IT 가 sourceOrderLineId null 로 통과)

- [ ] **Step 4: Commit**
```
feat(order-convert): 발행 요청 라인에 sourceOrderLineId 전파
```

## Task 3: partner-order-service — PartnerOrderLine.convertedQuantity

**Files:**
- Create: `services/partner-order-service/src/main/resources/db/migration/V8__add_partner_order_line_converted_quantity.sql`
- Modify: `services/partner-order-service/.../domain/PartnerOrderLine.java`
- Test: `services/partner-order-service/src/test/java/.../domain/PartnerOrderLineConvertTest.java`

- [ ] **Step 1: V8 마이그레이션**
```sql
-- 부분전환 추적: 라인별 전환된 수량 (Phase 2.6a). 잔여 = quantity - converted_quantity
ALTER TABLE partner_order_lines ADD COLUMN converted_quantity INT NOT NULL DEFAULT 0;
COMMENT ON COLUMN partner_order_lines.converted_quantity IS '출고전표로 전환된 누적 수량 (부분전환)';
```
> partner-order-service 최신 V7 확인.

- [ ] **Step 2: 실패 테스트**
`PartnerOrderLineConvertTest`:
```java
package com.samhanair.logis.partnerorder.domain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.math.BigDecimal;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;

class PartnerOrderLineConvertTest {

    private PartnerOrderLine line(int qty) {
        return PartnerOrderLine.create(UUID.randomUUID(), "M", "P", "CAT",
                qty, BigDecimal.valueOf(1000), null);
    }

    @Test
    void remainingQuantity_default_isFull() {
        PartnerOrderLine l = line(10);
        assertThat(l.getConvertedQuantity()).isZero();
        assertThat(l.remainingQuantity()).isEqualTo(10);
    }

    @Test
    void convert_partial_accumulates() {
        PartnerOrderLine l = line(10);
        l.convert(3);
        assertThat(l.getConvertedQuantity()).isEqualTo(3);
        assertThat(l.remainingQuantity()).isEqualTo(7);
        l.convert(7);
        assertThat(l.remainingQuantity()).isZero();
        assertThat(l.isFullyConverted()).isTrue();
    }

    @Test
    void convert_overRemaining_throws409() {
        PartnerOrderLine l = line(5);
        assertThatThrownBy(() -> l.convert(6))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("409");
    }

    @Test
    void convert_nonPositive_throws() {
        PartnerOrderLine l = line(5);
        assertThatThrownBy(() -> l.convert(0))
                .isInstanceOf(ResponseStatusException.class);
    }
}
```

- [ ] **Step 3: 테스트 실패 확인**
Run: `./gradlew :services:partner-order-service:test --tests '*PartnerOrderLineConvertTest'`
Expected: FAIL (convertedQuantity/convert/remainingQuantity 미정의)

- [ ] **Step 4: PartnerOrderLine 구현**
필드 + 도메인 메서드 추가:
```java
    @Column(name = "converted_quantity", nullable = false)
    private int convertedQuantity;

    /** 미전환 잔여 수량. */
    public int remainingQuantity() {
        return this.quantity - this.convertedQuantity;
    }

    /** 전량 전환 여부. */
    public boolean isFullyConverted() {
        return this.convertedQuantity >= this.quantity;
    }

    /**
     * 부분전환 — 전환 수량을 누적한다 (Phase 2.6a).
     *
     * @param qty 이번에 전환할 수량 (1 이상, 잔여 이하)
     * @throws ResponseStatusException(409) 잔여 초과 또는 비양수
     */
    public void convert(int qty) {
        if (qty <= 0) {
            throw new org.springframework.web.server.ResponseStatusException(
                    org.springframework.http.HttpStatus.CONFLICT,
                    "전환 수량은 1 이상이어야 합니다.");
        }
        if (qty > remainingQuantity()) {
            throw new org.springframework.web.server.ResponseStatusException(
                    org.springframework.http.HttpStatus.CONFLICT,
                    "전환 수량이 잔여 수량을 초과합니다. 잔여=" + remainingQuantity() + ", 요청=" + qty);
        }
        this.convertedQuantity += qty;
    }
```
(생성자에서 convertedQuantity 는 기본 0 — 명시 초기화 불필요, int 기본값.)

- [ ] **Step 5: 테스트 통과**
Run: `./gradlew :services:partner-order-service:test --tests '*PartnerOrderLineConvertTest'`
Expected: PASS (4)

- [ ] **Step 6: Commit**
```
feat(order-convert): PartnerOrderLine.convertedQuantity + convert/remaining 도메인 메서드 (V8)
```

## Task 4: partner-order-service — 부분전환 서비스 + API

**Files:**
- Create: `services/partner-order-service/.../service/PartnerOrderConvertService.java`
- Create: `services/partner-order-service/.../web/PartnerOrderConvertController.java`
- Create: `services/partner-order-service/.../web/dto/ConvertToSlipRequest.java`
- Modify: `services/partner-order-service/.../client/SlipServiceClient.java` (부분전환 payload 라인에 sourceOrderLineId)
- Modify: `services/partner-order-service/.../domain/PartnerOrder.java` (전환 가드 + 전환완료 판정)

- [ ] **Step 1: 전환 가능 가드 + 전환완료 도메인 메서드**
`PartnerOrder` 에:
```java
    /**
     * 출고전표 전환 가능 상태인지 검사한다 (Phase 2.6a).
     * 이미 출고전표가 발행된 주문(slipNo != null)은 전환 불가.
     * CANCELED/CONFIRMING 도 불가.
     *
     * @throws ResponseStatusException(409)
     */
    public void requireConvertible() {
        if (this.slipNo != null) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "이미 출고전표가 발행된 주문은 전환할 수 없습니다. slipNo=" + this.slipNo);
        }
        if (this.status == PartnerOrderStatus.CANCELED
                || this.status == PartnerOrderStatus.CONFIRMING) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "전환할 수 없는 상태입니다: " + this.status);
        }
    }

    /** 모든 라인이 전량 전환되면 status 를 CONVERTED 로 표시한다. */
    public void markConvertedIfComplete() {
        boolean all = getLines().stream().allMatch(PartnerOrderLine::isFullyConverted);
        if (all && !getLines().isEmpty()) {
            this.status = PartnerOrderStatus.CONVERTED;
        }
    }
```
`PartnerOrderStatus` 에 `CONVERTED` enum 추가(전환완료). (Phase2.5 에서 ON_HOLD 추가했던 위치 패턴.)

- [ ] **Step 2: ConvertToSlipRequest DTO**
```java
package com.samhanair.logis.partnerorder.web.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import java.util.List;
import java.util.UUID;

/** 단일 주문 부분전환 요청 (Phase 2.6a). */
public record ConvertToSlipRequest(
        @NotNull @NotEmpty @Valid List<Item> items,
        String warehouseCode
) {
    public record Item(
            @NotNull UUID orderLineId,
            @NotNull @Min(1) Integer quantity
    ) {}
}
```

- [ ] **Step 3: PartnerOrderConvertService**
```java
@Service
@RequiredArgsConstructor
public class PartnerOrderConvertService {

    private final PartnerOrderRepository orderRepository;
    private final SlipServiceClient slipServiceClient;

    /**
     * 주문의 선택 라인을 출고전표로 부분전환한다 (Phase 2.6a).
     * slip 미발행 주문(slipNo=null)만 대상. 선택 라인의 전환수량을 누적하고,
     * 전량 전환 시 주문을 CONVERTED 로 표시한다.
     */
    @Transactional
    public ConvertResultResponse convert(String id, ConvertToSlipRequest req,
                                         UUID actorId, String actorName) {
        PartnerOrder order = PartnerOrderIdResolver.findByIdentifier(orderRepository, id)
                .orElseThrow(() -> new BusinessException(ErrorCode.PARTNER_ORDER_NOT_FOUND,
                        ErrorCode.PARTNER_ORDER_NOT_FOUND.getDefaultMessage()));
        order.requireConvertible();

        // 라인 매핑 + 잔여수량 검증(도메인 convert 가 409)
        Map<UUID, PartnerOrderLine> lineMap = order.getLines().stream()
                .collect(java.util.stream.Collectors.toMap(PartnerOrderLine::getId, l -> l));
        List<Map<String,Object>> payloadLines = new ArrayList<>();
        for (ConvertToSlipRequest.Item item : req.items()) {
            PartnerOrderLine line = lineMap.get(item.orderLineId());
            if (line == null) {
                throw new BusinessException(ErrorCode.PARTNER_ORDER_UPDATE_INVALID_LINE,
                        "주문 라인 없음: " + item.orderLineId());
            }
            line.convert(item.quantity()); // 잔여 초과 시 409
            Map<String,Object> pl = new LinkedHashMap<>();
            pl.put("productCode", line.getModelName()); // slip 은 productCode 기준 — 실제 매핑 확인
            pl.put("quantity", item.quantity());
            pl.put("unitPriceVat", line.getPriceVat());
            pl.put("remarks", line.getRemark());
            pl.put("sourceOrderLineId", line.getId().toString());
            payloadLines.add(pl);
        }

        // slip 발행 (부분전환 = 선택 라인만)
        String idempotencyKey = "PO-CONV-" + order.getId() + "-" + System.identityHashCode(req);
        Map<String,Object> payload = new LinkedHashMap<>();
        payload.put("partnerOrderId", order.getId().toString());
        payload.put("partnerCode", order.getPartnerCode());
        payload.put("warehouseCode", req.warehouseCode());
        payload.put("lines", payloadLines);
        PublishResult result = slipServiceClient.publishFromPartnerOrder(payload, idempotencyKey);

        order.markConvertedIfComplete();
        orderRepository.saveAndFlush(order);
        return new ConvertResultResponse(result.slipNo(), order.getStatus().name(),
                order.getLines().stream().allMatch(PartnerOrderLine::isFullyConverted));
    }
}
```
> **주의(구현 시 확정)**: ① slip payload 의 productCode 가 PartnerOrderLine 의 무엇과 매핑되는지(modelName? productId→code 조회?) — 기존 `buildSlipPayload`(PartnerOrderConfirmService:295) 가 어떻게 productCode 를 넣는지 read 하여 동일하게. ② idempotencyKey 는 identityHashCode 부적절 → 요청 내용 기반 결정적 키 또는 클라이언트 제공 키로 교체. ③ ioDate 누락 — payload 에 ioDate(LocalDate.now() 또는 요청) 추가. ④ `ConvertResultResponse` record 신규.

- [ ] **Step 4: PartnerOrderConvertController**
```java
@RestController
@RequestMapping("/api/v1/partner-orders")
@RequiredArgsConstructor
public class PartnerOrderConvertController {

    private final PartnerOrderConvertService convertService;

    @PostMapping("/{id}/convert-to-slip")
    @RequirePermission(page = "sales.partner-order.convert", action = PermissionAction.CREATE)
    public ApiResponse<ConvertResultResponse> convert(
            @PathVariable String id,
            @RequestBody @jakarta.validation.Valid ConvertToSlipRequest request,
            @RequestHeader(value = "X-User-Id", required = false) String actorId,
            @RequestHeader(value = "X-User-Name", required = false) String actorName) {
        return ApiResponse.ok(convertService.convert(id, request,
                actorId == null ? null : java.util.UUID.fromString(actorId), actorName));
    }
}
```
> page code `sales.partner-order.convert` 신규 → auth seed(Task 5) 필요. 또는 기존 `sales.partner-order.edit` 재사용 결정. ApiResponse/PermissionAction/RequirePermission import 는 기존 컨트롤러(ConfirmController) 미러.

- [ ] **Step 5: 컴파일**
Run: `./gradlew :services:partner-order-service:compileJava`
Expected: BUILD SUCCESSFUL (productCode 매핑/idempotencyKey/ioDate 확정 후)

- [ ] **Step 6: Commit**
```
feat(order-convert): 단일 주문 부분전환 서비스 + API + 전환완료 status
```

## Task 5: 권한 seed (page code)

**Files:** `services/auth-service/src/main/resources/db/migration/V41__seed_partner_order_convert_page.sql` (신규 page code 선택 시)

- [ ] **Step 1: 결정 + seed**
`sales.partner-order.convert` 신규 page 면 V41 seed(V40 패턴 — role_page_permission_templates + account_page_permissions, MASTER bypass, MANAGER/SALES grant). 기존 `sales.partner-order.edit` 재사용이면 본 Task skip + Task4 page code 변경. **권한 매트릭스 일관성 기준 결정**(전환은 출고전표 생성 행위 → 신규 page 권장).

- [ ] **Step 2: 컴파일/적용 확인**
Run: `./gradlew :services:auth-service:compileJava`
Expected: BUILD SUCCESSFUL

- [ ] **Step 3: Commit**
```
feat(order-convert): sales.partner-order.convert 권한 seed (V41)
```

## Task 6: BE 통합 테스트 (Testcontainers)

**Files:** `services/partner-order-service/src/test/java/.../it/PartnerOrderConvertIT.java`

- [ ] **Step 1: IT 작성**
Phase 2.5 `HoldStatusFilterIT` 의 @MockBean 목록(DynamicPermissionClient 7-action + 외부 client 전부, SlipServiceClient 포함) + AbstractPostgresIT. 케이스:
- 견적전환 DRAFT 주문(slipNo=null) 생성 → 라인 1개 일부수량 전환 → 200, slip 발행 호출(@MockBean SlipServiceClient stub slipNo 반환), converted_quantity 갱신(DB 단언), 주문 status DRAFT 유지(잔여 있음)
- 전량 전환 → status CONVERTED (DB 단언)
- 잔여 초과 전환 → 409
- slipNo 있는 주문(CONFIRMED+slipNo) 전환 시도 → 409 (requireConvertible)
- 권한 deny → 403 / MASTER bypass 200
- SlipServiceClient @MockBean 이 받은 payload 에 sourceOrderLineId + 선택 라인만 포함 확인(verify/captor)

- [ ] **Step 2: compileTestJava + 실행**
Run: `./gradlew :services:partner-order-service:compileTestJava` → SUCCESS. Docker 가용 시 `:test --tests '*PartnerOrderConvertIT'` (skipped=0). 한글경로 트랩 시 compileTestJava 보장.

- [ ] **Step 3: Commit**
```
test(order-convert): 부분전환 Testcontainers IT
```

## Task 7: FE — 주문 상세 부분전환

**Files:**
- Modify: `clients/desktop/src/renderer/api/sales.ts` (convertToSlip API + 타입 + remainingQuantity/convertedQuantity 필드)
- Modify: `clients/desktop/src/renderer/routes/SalesPartnerOrderDetailPage.tsx` (전환 버튼 + 라인별 수량 입력 모달)

- [ ] **Step 1: API 래퍼 + 타입**
`convertPartnerOrderToSlip(orderId, { items:[{orderLineId, quantity}], warehouseCode? })` → POST `/api/v1/partner-orders/{id}/convert-to-slip`. PartnerOrderDetail 라인 타입에 `convertedQuantity`/`remainingQuantity` 추가(BE 응답 확인). PartnerOrderStatus 에 `CONVERTED` 추가 + 라벨 '전환완료'.

- [ ] **Step 2: 전환 모달 + 버튼**
주문 상세에 **"출고전표 전환" 버튼** (slipNo==null && status 전환가능 && canConvert 권한). 클릭 시 DS Modal: 라인 목록 + 라인별 전환수량 입력(기본 잔여 전량, 0~잔여), 전환 실행 → convert API → 성공 시 invalidate(['partner-orders'], ['partner-order', id]) + 토스트. 잔여 0 라인 비활성. design-system 컴포넌트.

- [ ] **Step 3: typecheck**
Run: `npm --prefix clients/desktop run typecheck`
Expected: 0 error

- [ ] **Step 4: Commit**
```
feat(order-convert): FE 주문 부분전환 모달 + convert API
```

## Task 8: Playwright + 문서 + Docker 실 QA

**Files:** `clients/desktop/playwright/phase-2-6a-order-convert/*.spec.ts`, `docs/dev-reports/phase-2-6a-order-to-slip-conversion.md`, `migration/decisions/DECISIONS.md`, `docs/samhan-public-overview.html`, `services/partner-order-service/README.md`, `docs/qa/phase-2-6a-order-convert/screenshots/`

- [ ] **Step 1: Playwright**
route() mock: GET 주문 상세(slipNo null + 라인 convertedQuantity) / POST convert-to-slip(slipNo 반환). 시나리오: 전환 버튼 표시(slipNo null) → 모달 라인수량 입력 → 전환 → 성공 토스트 / slipNo 있는 주문 전환버튼 미표시 / 잔여 0 라인 비활성.

- [ ] **Step 2: dev-report + DECISIONS + overview + README**
dev-report(부분전환 범위/converted_quantity/convert API/전환완료 status/2.6b·c 분리). DECISIONS(부분전환 = slip 미발행 주문 대상, 라인별 수량추적, confirm 폐지·병합은 2.6b). overview + README 동기화.

- [ ] **Step 3: Docker 실 QA**
실 서버 + 실 DB + 실 desktop renderer(실 JWT dev_master, [[no-fake-data-ever]] — 합성 금지) 부분전환 실 화면 + 실 적중(converted_quantity + slip_line.source_order_line_id psql). influxd 포트 우회.

- [ ] **Step 4: Commit**
```
docs(order-convert): dev-report + DECISIONS + overview + Playwright + Docker 실 QA
```

---

## Self-Review (spec 대조)
- spec §7a 대상판정(slipNo null) → T4 requireConvertible / converted_quantity → T3 / convert API → T4 / slip-service sourceOrderLineId → T1·T2 / 전환완료 → T4 markConvertedIfComplete / FE → T7 / 테스트 → T6·T8.
- placeholder: productCode 매핑/idempotencyKey/ioDate 는 T4 Step3 에서 기존 buildSlipPayload read 후 확정 명시.
- type 일관: convert/remainingQuantity/isFullyConverted/convertedQuantity/sourceOrderLineId/requireConvertible/markConvertedIfComplete 일치.
- **2.6b/c 제외 명확**(병합/confirm폐지/정합성).

## 실행 메모
- 구현 = Claude 에이전트(Codex 6/1 복구 전). 리뷰 = Claude 5-team 사이클 N=2([[cycle-n2-mandatory]]). CI green(skipped=0) → Docker 실 QA(실화면 [[no-fake-data-ever]]) → 머지.
- 선택 필요 시 [[always-mouse-choices]].
- ⚠️ T4 idempotencyKey 결정적 키 필수(identityHashCode 금지) + ioDate + productCode 매핑은 기존 confirm payload 와 동일하게.
