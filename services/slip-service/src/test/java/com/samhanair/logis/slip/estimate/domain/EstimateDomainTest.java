package com.samhanair.logis.slip.estimate.domain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.UUID;
import org.junit.jupiter.api.Test;

/**
 * 견적서 도메인 단위 테스트 — P2-1 (Stage 4) 시나리오 3종:
 * <ol>
 *   <li>convert (변환 라이프사이클: DRAFT → SENT → ACCEPTED → CONVERTED)</li>
 *   <li>status 전이 가드 (잘못된 단계에서 호출 시 CONFLICT)</li>
 *   <li>line snapshot (recalculateTotals 자동 재계산)</li>
 * </ol>
 */
class EstimateDomainTest {

    private static final UUID PARTNER = UUID.randomUUID();
    private static final UUID PRODUCT = UUID.randomUUID();
    private static final UUID SLIP = UUID.randomUUID();

    @Test
    void convert_lifecycle_draftToSentToAcceptedToConverted() {
        Estimate estimate = newEstimate();
        estimate.addLine(EstimateLine.create(estimate, 1, PRODUCT, "에어컨 220V", "AC-220",
                "220V", 2, new BigDecimal("100000.00"), null));

        // DRAFT → SENT
        estimate.send();
        assertThat(estimate.getStatus()).isEqualTo(EstimateStatus.QUOTE_SENT);
        assertThat(estimate.getSentAt()).isNotNull();

        // SENT → ACCEPTED
        estimate.accept();
        assertThat(estimate.getStatus()).isEqualTo(EstimateStatus.QUOTE_ACCEPTED);
        assertThat(estimate.getAcceptedAt()).isNotNull();

        // ACCEPTED → CONVERTED (slipId 기록)
        estimate.markConverted(SLIP);
        assertThat(estimate.getStatus()).isEqualTo(EstimateStatus.QUOTE_CONVERTED);
        assertThat(estimate.getConvertedSlipId()).isEqualTo(SLIP);
        assertThat(estimate.getConvertedAt()).isNotNull();
    }

    @Test
    void statusTransition_invalidStage_throwsConflict() {
        Estimate estimate = newEstimate();
        estimate.addLine(EstimateLine.create(estimate, 1, PRODUCT, "에어컨", null,
                null, 1, new BigDecimal("100000"), null));

        // DRAFT 상태에서 accept 호출 → CONFLICT
        assertThatThrownBy(estimate::accept)
                .isInstanceOf(BusinessException.class)
                .hasFieldOrPropertyWithValue("errorCode", ErrorCode.CONFLICT);

        // DRAFT 상태에서 reject 호출 → CONFLICT (SENT 만 가능)
        assertThatThrownBy(estimate::reject)
                .isInstanceOf(BusinessException.class)
                .hasFieldOrPropertyWithValue("errorCode", ErrorCode.CONFLICT);

        // DRAFT 상태에서 markConverted 호출 → CONFLICT (ACCEPTED 만 가능)
        assertThatThrownBy(() -> estimate.markConverted(SLIP))
                .isInstanceOf(BusinessException.class);
    }

    @Test
    void lineSnapshot_recalculateTotals_supplyVatAndTotal() {
        Estimate estimate = newEstimate();
        // 1차 라인: 100000 × 2 = 200000 supply, 20000 vat, 220000 line total
        estimate.addLine(EstimateLine.create(estimate, 1, PRODUCT, "에어컨", "AC-220",
                "220V", 2, new BigDecimal("100000.00"), null));
        // 2차 라인: 50000 × 3 = 150000 supply, 15000 vat, 165000 line total
        estimate.addLine(EstimateLine.create(estimate, 2, UUID.randomUUID(), "필터", null,
                null, 3, new BigDecimal("50000.00"), null));

        assertThat(estimate.getTotalSupply()).isEqualByComparingTo("350000.00");
        assertThat(estimate.getTotalVat()).isEqualByComparingTo("35000.00");
        assertThat(estimate.getTotalAmount()).isEqualByComparingTo("385000.00");

        // 라인 1건 제거 후 재계산 검증
        EstimateLine first = estimate.getLines().get(0);
        estimate.removeLine(first);
        assertThat(estimate.getTotalSupply()).isEqualByComparingTo("150000.00");
        assertThat(estimate.getTotalVat()).isEqualByComparingTo("15000.00");
        assertThat(estimate.getTotalAmount()).isEqualByComparingTo("165000.00");
    }

    @Test
    void send_emptyLines_throwsConflict() {
        Estimate estimate = newEstimate();
        assertThatThrownBy(estimate::send)
                .isInstanceOf(BusinessException.class)
                .hasFieldOrPropertyWithValue("errorCode", ErrorCode.CONFLICT);
    }

    @Test
    void editHeader_acceptedStage_throwsConflict() {
        Estimate estimate = newEstimate();
        estimate.addLine(EstimateLine.create(estimate, 1, PRODUCT, "에어컨", null,
                null, 1, new BigDecimal("100000"), null));
        estimate.send();
        estimate.accept();

        // ACCEPTED 단계에서 editHeader 호출 → CONFLICT
        assertThatThrownBy(() ->
                estimate.editHeader(PARTNER, "신거래처", null, null, null, null))
                .isInstanceOf(BusinessException.class)
                .hasFieldOrPropertyWithValue("errorCode", ErrorCode.CONFLICT);
    }

    private Estimate newEstimate() {
        return Estimate.create("2026/05/09-1", LocalDate.of(2026, 5, 9), 1,
                PARTNER, "삼한공조", "123-45-67890", "서울시 강남구",
                LocalDate.of(2026, 6, 9), "테스트 견적", "user-1");
    }
}
