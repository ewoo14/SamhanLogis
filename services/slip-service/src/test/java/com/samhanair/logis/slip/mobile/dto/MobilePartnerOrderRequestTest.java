package com.samhanair.logis.slip.mobile.dto;

import static org.assertj.core.api.Assertions.assertThat;

import jakarta.validation.Validation;
import jakarta.validation.Validator;
import jakarta.validation.ValidatorFactory;
import jakarta.validation.constraints.NotNull;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class MobilePartnerOrderRequestTest {

    private final Validator validator = validator();

    @Test
    void nullSourceWarehouseId_isRejectedAtApiBoundary() {
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
                .anySatisfy(violation -> {
                    assertThat(violation.getPropertyPath().toString()).isEqualTo("sourceWarehouseId");
                    assertThat(violation.getConstraintDescriptor().getAnnotation().annotationType())
                            .isEqualTo(NotNull.class);
                });
    }

    private static Validator validator() {
        ValidatorFactory factory = Validation.buildDefaultValidatorFactory();
        return factory.getValidator();
    }
}
