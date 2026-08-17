package com.samhanair.logis.accounting.web.dto;

import static org.assertj.core.api.Assertions.assertThat;

import com.samhanair.logis.accounting.domain.SalesCommissionPaymentMethod;
import jakarta.validation.ConstraintViolation;
import jakarta.validation.Validation;
import jakarta.validation.Validator;
import java.util.Set;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;

/** 영업수수료 금액 문자열 경계와 레거시 빈값 의미를 검증한다. */
class CalculateSalesCommissionSettlementRequestTest {

    private static Validator validator;

    @BeforeAll
    static void setUp() {
        validator = Validation.buildDefaultValidatorFactory().getValidator();
    }

    @AfterAll
    static void tearDown() {
        Validation.buildDefaultValidatorFactory().close();
    }

    @Test
    void blank_amounts_are_zero_in_legacy_input() {
        var request = request("", "", "", "", "", null);

        var input = request.toInput();

        assertThat(input.total()).isZero();
        assertThat(input.equipment()).isZero();
        assertThat(input.prepaid()).isZero();
        assertThat(input.install()).isZero();
        assertThat(input.safety()).isZero();
    }

    @Test
    void malformed_and_nineteen_digit_amounts_are_rejected_but_eighteen_digits_are_valid() {
        assertThat(validator.validate(request("문자", "0", "0", "0", "0", null))).isNotEmpty();
        assertThat(validator.validate(request("9999999999999999999", "0", "0", "0", "0", null))).isNotEmpty();
        assertThat(validator.validate(request("999999999999999999", "0", "0", "0", "0", null))).isEmpty();
    }

    private static CalculateSalesCommissionSettlementRequest request(
            String total, String equipment, String prepaid, String install, String safety,
            String manualExpenseRate) {
        return new CalculateSalesCommissionSettlementRequest(
                total, equipment, prepaid, install, safety,
                SalesCommissionPaymentMethod.CASH, false, manualExpenseRate, 1, 1L);
    }
}
