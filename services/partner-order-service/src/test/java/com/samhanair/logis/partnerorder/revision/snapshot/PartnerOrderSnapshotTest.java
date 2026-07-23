package com.samhanair.logis.partnerorder.revision.snapshot;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import com.samhanair.logis.partnerorder.domain.PartnerOrder;
import com.samhanair.logis.partnerorder.domain.PartnerOrderLine;
import com.samhanair.logis.partnerorder.domain.PartnerOrderStatus;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

/**
 * {@link PartnerOrderSnapshot} round-trip 직렬화/역직렬화 단위 테스트 (Phase 2.4 Task 3).
 *
 * <p>검증 항목:
 * <ul>
 *   <li>PartnerOrder(라인 3개) → snapshot 조립 → JSON 직렬화 → 역직렬화 round-trip 필드 일치</li>
 *   <li>soft-deleted 라인(deletedAt != null) 은 스냅샷에 포함되지 않음</li>
 *   <li>Jackson record 역직렬화 호환 (JavaTimeModule)</li>
 * </ul>
 */
class PartnerOrderSnapshotTest {

    private ObjectMapper objectMapper;

    @BeforeEach
    void setUp() {
        objectMapper = new ObjectMapper();
        objectMapper.registerModule(new JavaTimeModule());
        objectMapper.disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS);
    }

    @Test
    @DisplayName("라인 3개인 주문 스냅샷 조립 후 JSON round-trip 시 필드 값 일치")
    void roundTrip_threeLines_fieldsMatch() throws Exception {
        // given
        PartnerOrder order = buildOrder("2026/05/30-1", "GS01", "1234567890");
        PartnerOrderLine line1 = buildLine(UUID.randomUUID(), "MODEL-A", "상품A", "homemulti",
                2, new BigDecimal("100000.00"), "비고1");
        PartnerOrderLine line2 = buildLine(UUID.randomUUID(), "MODEL-B", "상품B", "singleSets",
                1, new BigDecimal("200000.00"), null);
        PartnerOrderLine line3 = buildLine(UUID.randomUUID(), "MODEL-C", "상품C", "commercialMulti",
                3, new BigDecimal("150000.00"), "비고3");

        addLineToOrder(order, line1);
        addLineToOrder(order, line2);
        addLineToOrder(order, line3);

        // when
        PartnerOrderSnapshot snapshot = PartnerOrderSnapshot.from(order);
        String json = objectMapper.writeValueAsString(snapshot);
        PartnerOrderSnapshot restored = objectMapper.readValue(json, PartnerOrderSnapshot.class);

        // then — 헤더 필드 일치
        assertThat(restored.orderNo()).isEqualTo("2026/05/30-1");
        assertThat(json).contains("\"partnerId\"");
        assertThat(restored.partnerCode()).isEqualTo("GS01");
        assertThat(restored.bizCode()).isEqualTo("1234567890");
        assertThat(restored.status()).isEqualTo(PartnerOrderStatus.DRAFT);
        // 200000 (line1: 2×100000) + 200000 (line2: 1×200000) + 450000 (line3: 3×150000) = 850000
        assertThat(restored.totalAmount()).isEqualByComparingTo(new BigDecimal("850000.00"));

        // then — 라인 3개 포함
        assertThat(restored.lines()).hasSize(3);

        PartnerOrderSnapshot.LineSnapshot l1 = restored.lines().get(0);
        assertThat(l1.modelName()).isEqualTo("MODEL-A");
        assertThat(l1.productName()).isEqualTo("상품A");
        assertThat(l1.quantity()).isEqualTo(2);
        assertThat(l1.priceVat()).isEqualByComparingTo(new BigDecimal("100000.00"));
        assertThat(l1.subtotal()).isEqualByComparingTo(new BigDecimal("200000.00"));
        assertThat(l1.remark()).isEqualTo("비고1");

        PartnerOrderSnapshot.LineSnapshot l2 = restored.lines().get(1);
        assertThat(l2.remark()).isNull(); // NON_NULL 직렬화 시 null 허용

        PartnerOrderSnapshot.LineSnapshot l3 = restored.lines().get(2);
        assertThat(l3.quantity()).isEqualTo(3);
    }

    @Test
    @DisplayName("soft-deleted 라인은 스냅샷에 포함되지 않음")
    void softDeletedLine_excludedFromSnapshot() throws Exception {
        // given
        PartnerOrder order = buildOrder("2026/05/30-2", "GS02", "9876543210");
        PartnerOrderLine active1 = buildLine(UUID.randomUUID(), "MODEL-A", "상품A",
                "homemulti", 1, new BigDecimal("100000.00"), null);
        PartnerOrderLine active2 = buildLine(UUID.randomUUID(), "MODEL-B", "상품B",
                "singleSets", 2, new BigDecimal("50000.00"), null);
        PartnerOrderLine deleted = buildLine(UUID.randomUUID(), "MODEL-DEL", "삭제상품",
                "homemulti", 5, new BigDecimal("999999.00"), "삭제됨");

        addLineToOrder(order, active1);
        addLineToOrder(order, active2);

        // soft-delete 처리: deletedAt 을 세팅해 PartnerOrder.getLines() 필터에 걸리게 함
        addLineToOrderDeleted(order, deleted);

        // when
        PartnerOrderSnapshot snapshot = PartnerOrderSnapshot.from(order);
        String json = objectMapper.writeValueAsString(snapshot);
        PartnerOrderSnapshot restored = objectMapper.readValue(json, PartnerOrderSnapshot.class);

        // then — soft-deleted 라인 제외, active 2건만 포함
        assertThat(restored.lines()).hasSize(2);
        assertThat(restored.lines()).noneMatch(l -> "MODEL-DEL".equals(l.modelName()));
        assertThat(restored.lines())
                .extracting(PartnerOrderSnapshot.LineSnapshot::modelName)
                .containsExactly("MODEL-A", "MODEL-B");
    }

    @Test
    @DisplayName("dueDate / memo / sourceEstimateId 등 nullable 필드 round-trip")
    void nullableFields_roundTrip() throws Exception {
        // given — memo, dueDate, sourceEstimateId 모두 non-null
        PartnerOrder order = buildOrder("2026/05/30-3", "GS03", "1111111111");
        ReflectionTestUtils.setField(order, "dueDate", LocalDate.of(2026, 6, 30));
        ReflectionTestUtils.setField(order, "memo", "납기 준수 요망");
        UUID estimateId = UUID.randomUUID();
        ReflectionTestUtils.setField(order, "sourceEstimateId", estimateId);

        PartnerOrderLine line = buildLine(UUID.randomUUID(), "MODEL-X", "상품X",
                "homemulti", 1, new BigDecimal("50000.00"), null);
        addLineToOrder(order, line);

        // when
        PartnerOrderSnapshot snapshot = PartnerOrderSnapshot.from(order);
        String json = objectMapper.writeValueAsString(snapshot);
        PartnerOrderSnapshot restored = objectMapper.readValue(json, PartnerOrderSnapshot.class);

        // then
        assertThat(restored.dueDate()).isEqualTo(LocalDate.of(2026, 6, 30));
        assertThat(restored.memo()).isEqualTo("납기 준수 요망");
        assertThat(restored.sourceEstimateId()).isEqualTo(estimateId);
    }

    @Test
    @DisplayName("거래처 코드 수정 시 이전 partnerId를 그대로 보존하지 않음")
    void updateHeader_partnerIdentityCannotRemainStale() {
        UUID originalPartnerId = UUID.fromString("00000000-0000-0000-0000-000000000901");
        PartnerOrder order = PartnerOrder.createFromConfirm(
                originalPartnerId, "P-ORIGINAL", "1234567890", "2026/05/30-4",
                "idem-2026-05-30-4", BigDecimal.ZERO);

        order.updateHeader("P-CHANGED", "9999999999", null, null);

        assertThat(order.getPartnerId()).isNotEqualTo(originalPartnerId);
    }

    // ── 헬퍼 ─────────────────────────────────────────────────────────────────

    /**
     * ReflectionTestUtils 로 protected 생성자 우회 — 실제 entity 인스턴스를 만든다.
     * PartnerOrder.createFromEstimate 에서 DRAFT 주문을 얻는다.
     */
    private PartnerOrder buildOrder(String orderNo, String partnerCode, String bizCode) {
        PartnerOrder order = PartnerOrder.createFromEstimate(
                partnerCode, bizCode, orderNo,
                "idem-" + orderNo, BigDecimal.ZERO,
                UUID.randomUUID(), null, null);
        // id 세팅 (UUID)
        ReflectionTestUtils.setField(order, "id", UUID.randomUUID());
        ReflectionTestUtils.setField(order, "partnerId",
                UUID.fromString("00000000-0000-0000-0000-000000000901"));
        return order;
    }

    /** PartnerOrderLine 을 생성하고 주문에 추가한다. */
    private PartnerOrderLine buildLine(UUID productId, String modelName, String productName,
                                      String categoryKey, int quantity,
                                      BigDecimal priceVat, String remark) {
        return PartnerOrderLine.create(productId, modelName, productName,
                categoryKey, quantity, priceVat, remark);
    }

    /** order.addLine 을 통해 라인을 추가한다 (bidirectional 동기화). */
    private void addLineToOrder(PartnerOrder order, PartnerOrderLine line) {
        order.addLine(line);
    }

    /**
     * soft-deleted 라인을 주문에 추가한다.
     * lines 컬렉션에는 포함되지만 deletedAt 이 세팅되어 getLines() 필터에서 제외된다.
     * bind() 는 package-private 이므로 ReflectionTestUtils 로 호출한다.
     */
    private void addLineToOrderDeleted(PartnerOrder order, PartnerOrderLine line) {
        // bind 는 package-private — reflection 으로 호출
        ReflectionTestUtils.invokeMethod(line, "bind", order);
        // lines 필드에 직접 접근 (private List)
        @SuppressWarnings("unchecked")
        java.util.List<PartnerOrderLine> lines =
                (java.util.List<PartnerOrderLine>) ReflectionTestUtils.getField(order, "lines");
        if (lines != null) {
            lines.add(line);
        }
        // soft-delete 처리
        line.markDeleted("test-system");
    }
}
