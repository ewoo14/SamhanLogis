package com.samhanair.logis.slip.estimate.domain;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.UUID;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

@DisplayName("견적 라인 권위 금액 팩토리")
class EstimateLineAuthoritativeAmountsTest {

    @Test
    @DisplayName("견적은 lineTotal에 공급가액+부가세를 저장한다")
    void keepsEstimateLineTotalVatInclusive() {
        Estimate estimate = Estimate.create("Q-20260722-1", LocalDate.of(2026, 7, 22), 1,
                UUID.randomUUID(), "거래처", null, null, null, null, "test-user");

        EstimateLine line = EstimateLine.createFromAuthoritativeAmounts(
                estimate, 1, UUID.randomUUID(), "품목", "모델", null, 3,
                new BigDecimal("100005"), new BigDecimal("10001"), new BigDecimal("110006"), null);

        assertThat(line.getSupplyAmount()).isEqualByComparingTo("100005");
        assertThat(line.getVatAmount()).isEqualByComparingTo("10001");
        assertThat(line.getLineTotal()).isEqualByComparingTo("110006");
        assertThat(line.getUnitPriceWithVat()).isEqualByComparingTo("36668.67");
    }

    @Test
    @DisplayName("공급가액 100005의 부가세는 세금계산서와 같은 원 단위 절사 10000이다")
    void usesCommonVatRounding() {
        Estimate estimate = Estimate.create("Q-20260722-2", LocalDate.of(2026, 7, 22), 1,
                UUID.randomUUID(), "거래처", null, null, null, null, "test-user");

        EstimateLine line = EstimateLine.create(estimate, 1, UUID.randomUUID(), "품목",
                "모델", null, 1, new BigDecimal("100005"), null);

        assertThat(line.getVatAmount()).isEqualByComparingTo("10000");
    }
}
