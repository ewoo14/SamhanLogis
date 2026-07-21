package com.samhanair.logis.accounting.web.dto;

import static org.assertj.core.api.Assertions.assertThat;

import jakarta.validation.ConstraintViolation;
import jakarta.validation.Validation;
import jakarta.validation.Validator;
import jakarta.validation.ValidatorFactory;
import java.time.LocalDate;
import java.util.List;
import java.util.Set;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/** 실행 POST도 scopeMode를 필수로 받는지 고정하는 DTO 계약 테스트. */
class CodefImportScopedRequestTest {

    private static ValidatorFactory factory;
    private static Validator validator;

    @BeforeAll
    static void setUpValidator() {
        factory = Validation.buildDefaultValidatorFactory();
        validator = factory.getValidator();
    }

    @AfterAll
    static void closeValidator() {
        factory.close();
    }

    private static CodefImportScopedRequest request(String scopeMode) {
        return new CodefImportScopedRequest(
                "connected-main",
                LocalDate.of(2026, 6, 1),
                LocalDate.of(2026, 6, 3),
                CodefImportType.ALL,
                scopeMode,
                List.of(),
                List.of(),
                List.of(),
                "DRY_RUN");
    }

    @Test
    @DisplayName("실행 scopeMode 누락(null)은 @NotNull 위반")
    void scopeModeNull_violatesNotNull() {
        Set<ConstraintViolation<CodefImportScopedRequest>> violations = validator.validate(request(null));
        assertThat(violations).extracting(ConstraintViolation::getMessage)
                .anyMatch(message -> message.contains("scopeMode") && message.contains("필수"));
    }

    @Test
    @DisplayName("실행 scopeMode 미지 값은 @Pattern 위반")
    void scopeModeInvalid_violatesPattern() {
        Set<ConstraintViolation<CodefImportScopedRequest>> violations = validator.validate(request("EVERYTHING"));
        assertThat(violations).extracting(ConstraintViolation::getMessage)
                .anyMatch(message -> message.contains("ALL") && message.contains("SELECTED"));
    }
}
