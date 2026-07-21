package com.samhanair.logis.accounting.web.dto;

import static org.assertj.core.api.Assertions.assertThat;

import jakarta.validation.ConstraintViolation;
import jakarta.validation.Validation;
import jakarta.validation.Validator;
import jakarta.validation.ValidatorFactory;
import java.time.LocalDate;
import java.util.Set;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * {@link CreateDailyClosingRequest} jakarta Bean Validation 단위 테스트 (#825 슬5 R1 — anti-false-green).
 *
 * <p>{@link CodefImportScopeRequestTest} 와 동일 취지 — 서비스층 {@code DailyClosingService.validateScope}
 * 중복 가드와 독립적으로 DTO 자체의 @NotNull/@Pattern/@AssertTrue 를 직접 증명한다.
 */
class CreateDailyClosingRequestTest {

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

    private static final LocalDate DATE = LocalDate.of(2026, 5, 19);

    @Test
    @DisplayName("closingDate 누락(null) — @NotNull 위반")
    void closingDateNull_violatesNotNull() {
        Set<ConstraintViolation<CreateDailyClosingRequest>> violations = validator.validate(
                new CreateDailyClosingRequest(null, null, "ALL", null, null));

        assertThat(violations)
                .extracting(v -> v.getMessage())
                .anyMatch(msg -> msg.contains("필수"));
    }

    @Test
    @DisplayName("scopeMode 누락(null) — @NotNull 위반")
    void scopeModeNull_violatesNotNull() {
        Set<ConstraintViolation<CreateDailyClosingRequest>> violations = validator.validate(
                new CreateDailyClosingRequest(DATE, null, null, null, null));

        assertThat(violations)
                .extracting(v -> v.getMessage())
                .anyMatch(msg -> msg.contains("scopeMode") && msg.contains("필수"));
    }

    @Test
    @DisplayName("scopeMode 유효하지 않은 값 — @Pattern 위반")
    void scopeModeInvalid_violatesPattern() {
        Set<ConstraintViolation<CreateDailyClosingRequest>> violations = validator.validate(
                new CreateDailyClosingRequest(DATE, null, "EVERYTHING", null, null));

        assertThat(violations)
                .extracting(v -> v.getMessage())
                .anyMatch(msg -> msg.contains("ALL") && msg.contains("SELECTED"));
    }

    @Test
    @DisplayName("ALL + 거래처코드 존재 — @AssertTrue(isScopeSelectionConsistent) 위반")
    void allWithPartner_violatesConsistency() {
        Set<ConstraintViolation<CreateDailyClosingRequest>> violations = validator.validate(
                new CreateDailyClosingRequest(DATE, "PC001", "ALL", null, null));

        assertThat(violations)
                .extracting(v -> v.getMessage())
                .anyMatch(msg -> msg.contains("일치하지 않습니다"));
    }

    @Test
    @DisplayName("SELECTED + 거래처코드 없음 — @AssertTrue(isScopeSelectionConsistent) 위반")
    void selectedWithoutPartner_violatesConsistency() {
        Set<ConstraintViolation<CreateDailyClosingRequest>> violations = validator.validate(
                new CreateDailyClosingRequest(DATE, null, "SELECTED", null, null));

        assertThat(violations)
                .extracting(v -> v.getMessage())
                .anyMatch(msg -> msg.contains("일치하지 않습니다"));
    }

    @Test
    @DisplayName("ALL + 거래처코드 없음 — 위반 없음")
    void allWithoutPartner_valid() {
        Set<ConstraintViolation<CreateDailyClosingRequest>> violations = validator.validate(
                new CreateDailyClosingRequest(DATE, null, "ALL", null, null));

        assertThat(violations).isEmpty();
    }

    @Test
    @DisplayName("SELECTED + 거래처코드 존재 — 위반 없음")
    void selectedWithPartner_valid() {
        Set<ConstraintViolation<CreateDailyClosingRequest>> violations = validator.validate(
                new CreateDailyClosingRequest(DATE, "PC001", "SELECTED", null, null));

        assertThat(violations).isEmpty();
    }
}
