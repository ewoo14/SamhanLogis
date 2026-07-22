package com.samhanair.logis.slip.domain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.UUID;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

@DisplayName("전표 라인 권위 금액 팩토리")
class SlipLineAuthoritativeAmountsTest {

    @Test
    @DisplayName("끝수 공급가액을 보존하고 부가세·VAT 포함 합계를 그대로 저장한다")
    void createsFromAuthoritativeAmountsWithoutRecalculation() {
        Slip slip = newOutbound();

        SlipLine line = SlipLine.createFromAuthoritativeAmounts(
                slip, UUID.randomUUID(), "품목", "모델", null, 3,
                new BigDecimal("100005"), new BigDecimal("10001"), new BigDecimal("110006"),
                null, null);

        assertThat(line.getSupplyAmount()).isEqualByComparingTo("100005");
        assertThat(line.getVatAmount()).isEqualByComparingTo("10001");
        assertThat(line.getLineTotal()).isEqualByComparingTo("100005");
        assertThat(line.getUnitPriceWithVat()).isEqualByComparingTo("36668.67");
    }

    @Test
    @DisplayName("공급가액+부가세와 VAT 포함 합계가 다르면 INVALID_INPUT으로 거부한다")
    void rejectsMismatchedTotal() {
        assertThatThrownBy(() -> SlipLine.createFromAuthoritativeAmounts(
                newOutbound(), UUID.randomUUID(), "품목", null, null, 1,
                new BigDecimal("100005"), new BigDecimal("10000"), new BigDecimal("110006"),
                null, null))
                .isInstanceOf(BusinessException.class)
                .satisfies(error -> {
                    BusinessException exception = (BusinessException) error;
                    assertThat(exception.getErrorCode()).isEqualTo(ErrorCode.INVALID_INPUT);
                    assertThat(exception.getMessage()).contains("공급가액").contains("합");
                });
    }

    @Test
    @DisplayName("금액 소수와 음수는 저장 전에 거부한다")
    void rejectsNegativeOrFractionalAmount() {
        assertThatThrownBy(() -> SlipLine.createFromAuthoritativeAmounts(
                newOutbound(), UUID.randomUUID(), "품목", null, null, 1,
                new BigDecimal("1000.50"), new BigDecimal("100"), new BigDecimal("1100.50"),
                null, null))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode")
                .isEqualTo(ErrorCode.INVALID_INPUT);

        assertThatThrownBy(() -> SlipLine.createFromAuthoritativeAmounts(
                newOutbound(), UUID.randomUUID(), "품목", null, null, 1,
                new BigDecimal("1000"), new BigDecimal("-1"), new BigDecimal("999"),
                null, null))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode")
                .isEqualTo(ErrorCode.INVALID_INPUT);
    }

    @Test
    @DisplayName("소수점 표기 형식이 달라도 항등식 값이 같으면 보존한다")
    void acceptsEquivalentBigDecimalScales() {
        SlipLine line = SlipLine.createFromAuthoritativeAmounts(
                newOutbound(), UUID.randomUUID(), "품목", null, null, 1,
                new BigDecimal("1000.00"), new BigDecimal("100.0"), new BigDecimal("1100.000"),
                null, null);

        assertThat(line.getLineTotal()).isEqualByComparingTo("1000.00");
        assertThat(line.getVatAmount()).isEqualByComparingTo("100.0");
    }

    @Test
    @DisplayName("기존 공급단가 팩토리는 기존 전표 lineTotal 의미를 유지한다")
    void keepsLegacySlipLineMeaning() {
        SlipLine line = SlipLine.create(newOutbound(), UUID.randomUUID(), "품목", null, null,
                2, new BigDecimal("1000"), null);

        assertThat(line.getLineTotal()).isEqualByComparingTo("2000");
        assertThat(line.getSupplyAmount()).isEqualByComparingTo("2000");
    }

    private Slip newOutbound() {
        return Slip.createOutbound("2026/07/22-1", LocalDate.of(2026, 7, 22), 1,
                UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(), "거래처",
                DeliveryTag.DAY, null, "test-user");
    }
}
