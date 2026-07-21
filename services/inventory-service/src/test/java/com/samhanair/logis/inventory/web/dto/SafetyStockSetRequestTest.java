package com.samhanair.logis.inventory.web.dto;

import static org.assertj.core.api.Assertions.assertThat;

import jakarta.validation.ConstraintViolation;
import jakarta.validation.Validation;
import jakarta.validation.Validator;
import jakarta.validation.ValidatorFactory;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * {@link SafetyStockSetRequest} jakarta Bean Validation 단위 테스트 (#825 슬5 R1 — anti-false-green).
 *
 * <p>accounting-service {@code CodefImportScopeRequestTest}/{@code CreateDailyClosingRequestTest} 와
 * 동일 취지 — {@code SafetyStockService.validateScope} 서비스층 중복 가드와 독립적으로 DTO 자체의
 * @NotNull/@Pattern/@AssertTrue 를 {@link Validator} 직접 호출로 증명한다.
 */
class SafetyStockSetRequestTest {

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

    private static final UUID WAREHOUSE_ID = UUID.randomUUID();

    @Test
    @DisplayName("scopeMode 누락(null) — @NotNull 위반")
    void scopeModeNull_violatesNotNull() {
        Set<ConstraintViolation<SafetyStockSetRequest>> violations = validator.validate(
                new SafetyStockSetRequest(null, 50, null, null));

        assertThat(violations)
                .extracting(v -> v.getMessage())
                .anyMatch(msg -> msg.contains("scopeMode") && msg.contains("필수"));
    }

    @Test
    @DisplayName("scopeMode 유효하지 않은 값 — @Pattern 위반")
    void scopeModeInvalid_violatesPattern() {
        Set<ConstraintViolation<SafetyStockSetRequest>> violations = validator.validate(
                new SafetyStockSetRequest(null, 50, null, "EVERYTHING"));

        assertThat(violations)
                .extracting(v -> v.getMessage())
                .anyMatch(msg -> msg.contains("ALL") && msg.contains("SELECTED"));
    }

    @Test
    @DisplayName("ALL + warehouseId 존재 — @AssertTrue(isScopeSelectionConsistent) 위반")
    void allWithWarehouse_violatesConsistency() {
        Set<ConstraintViolation<SafetyStockSetRequest>> violations = validator.validate(
                new SafetyStockSetRequest(WAREHOUSE_ID, 50, null, "ALL"));

        assertThat(violations)
                .extracting(v -> v.getMessage())
                .anyMatch(msg -> msg.contains("일치하지 않습니다"));
    }

    @Test
    @DisplayName("SELECTED + warehouseId 없음 — @AssertTrue(isScopeSelectionConsistent) 위반")
    void selectedWithoutWarehouse_violatesConsistency() {
        Set<ConstraintViolation<SafetyStockSetRequest>> violations = validator.validate(
                new SafetyStockSetRequest(null, 50, null, "SELECTED"));

        assertThat(violations)
                .extracting(v -> v.getMessage())
                .anyMatch(msg -> msg.contains("일치하지 않습니다"));
    }

    @Test
    @DisplayName("ALL + warehouseId 없음 — 위반 없음")
    void allWithoutWarehouse_valid() {
        Set<ConstraintViolation<SafetyStockSetRequest>> violations = validator.validate(
                new SafetyStockSetRequest(null, 50, null, "ALL"));

        assertThat(violations).isEmpty();
    }

    @Test
    @DisplayName("SELECTED + warehouseId 존재 — 위반 없음")
    void selectedWithWarehouse_valid() {
        Set<ConstraintViolation<SafetyStockSetRequest>> violations = validator.validate(
                new SafetyStockSetRequest(WAREHOUSE_ID, 50, null, "SELECTED"));

        assertThat(violations).isEmpty();
    }

    @Test
    @DisplayName("threshold 음수 — @Min(0) 위반")
    void negativeThreshold_violatesMin() {
        Set<ConstraintViolation<SafetyStockSetRequest>> violations = validator.validate(
                new SafetyStockSetRequest(null, -1, null, "ALL"));

        assertThat(violations).isNotEmpty();
    }

    @Test
    @DisplayName("threshold 누락(null) — @NotNull 위반")
    void thresholdNull_violatesNotNull() {
        Set<ConstraintViolation<SafetyStockSetRequest>> violations = validator.validate(
                new SafetyStockSetRequest(null, null, null, "ALL"));

        assertThat(violations).isNotEmpty();
    }
}
