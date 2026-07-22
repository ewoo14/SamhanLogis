package com.samhanair.logis.slip.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import java.math.BigDecimal;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

@DisplayName("권위 금액 요청 all-or-nothing 검증")
class AuthoritativeAmountValidatorTest {

    @Test
    @DisplayName("세 값이 모두 없거나 모두 있으면 통과한다")
    void acceptsOnlyCompleteOrAbsentAmounts() {
        assertThat(AuthoritativeAmountValidator.isComplete(null, null, null)).isFalse();
        assertThat(AuthoritativeAmountValidator.isComplete(
                new BigDecimal("100"), new BigDecimal("10"), new BigDecimal("110"))).isTrue();
    }

    @Test
    @DisplayName("일부 값만 오면 INVALID_INPUT으로 차단한다")
    void rejectsPartialAmounts() {
        assertThatThrownBy(() -> AuthoritativeAmountValidator.isComplete(
                new BigDecimal("100"), null, new BigDecimal("110")))
                .isInstanceOf(BusinessException.class)
                .satisfies(error -> {
                    BusinessException exception = (BusinessException) error;
                    assertThat(exception.getErrorCode()).isEqualTo(ErrorCode.INVALID_INPUT);
                    assertThat(exception.getMessage()).contains("함께 전송");
                });
    }
}
