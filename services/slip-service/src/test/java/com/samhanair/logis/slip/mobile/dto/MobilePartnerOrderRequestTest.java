package com.samhanair.logis.slip.mobile.dto;

import static org.assertj.core.api.Assertions.assertThat;

import jakarta.validation.Validation;
import jakarta.validation.Validator;
import jakarta.validation.ValidatorFactory;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class MobilePartnerOrderRequestTest {

    private final Validator validator = validator();

    @Test
    void nullSourceWarehouseId_isAcceptedByDtoValidation() {
        MobilePartnerOrderRequest request = new MobilePartnerOrderRequest(
                "P-001",
                LocalDate.of(2026, 7, 11),
                null,
                "서울시 중구",
                "010-0000-0000",
                "현장 주문",
                List.of(new MobilePartnerOrderRequest.MobileOrderLineRequest(
                        UUID.randomUUID(),
                        "에어컨",
                        "AC-1",
                        "EA",
                        1,
                        BigDecimal.ZERO,
                        null)));

        assertThat(validator.validate(request))
                .noneSatisfy(violation ->
                        assertThat(violation.getPropertyPath().toString()).isEqualTo("sourceWarehouseId"));
    }

    @Test
    void lineRequiredFields_areRejectedAtDtoValidation() {
        MobilePartnerOrderRequest request = new MobilePartnerOrderRequest(
                "P-001",
                LocalDate.of(2026, 7, 11),
                UUID.randomUUID(),
                "서울시 중구",
                "010-0000-0000",
                "현장 주문",
                List.of(new MobilePartnerOrderRequest.MobileOrderLineRequest(
                        null,
                        "에어컨",
                        "AC-1",
                        "EA",
                        0,
                        new BigDecimal("-1.00"),
                        null)));

        assertThat(validator.validate(request))
                .extracting(violation -> violation.getPropertyPath().toString())
                .contains(
                        "lines[0].productId",
                        "lines[0].quantity",
                        "lines[0].unitPrice");
    }

    private static Validator validator() {
        ValidatorFactory factory = Validation.buildDefaultValidatorFactory();
        return factory.getValidator();
    }
}
