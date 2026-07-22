package com.samhanair.logis.slip.estimate.domain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
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

    @Test
    @DisplayName("MED-4(#824 R1): 정수 자릿수 15자리 초과(1E+17 류 압축표기)는 precision 우회를 저장 전에 거부한다")
    void rejectsIntegerDigitOverflowViaCompactScale() {
        Estimate estimate = Estimate.create("Q-20260722-3", LocalDate.of(2026, 7, 22), 1,
                UUID.randomUUID(), "거래처", null, null, null, null, "test-user");

        assertThatThrownBy(() -> EstimateLine.createFromAuthoritativeAmounts(
                estimate, 1, UUID.randomUUID(), "품목", "모델", null, 1,
                new BigDecimal("1E+17"), BigDecimal.ZERO, new BigDecimal("1E+17"), null))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode")
                .isEqualTo(ErrorCode.INVALID_INPUT);
    }
}
