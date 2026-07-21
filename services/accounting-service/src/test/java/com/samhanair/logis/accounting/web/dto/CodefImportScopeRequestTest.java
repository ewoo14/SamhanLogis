package com.samhanair.logis.accounting.web.dto;

import static org.assertj.core.api.Assertions.assertThat;

import jakarta.validation.ConstraintViolation;
import jakarta.validation.Validation;
import jakarta.validation.Validator;
import jakarta.validation.ValidatorFactory;
import java.util.List;
import java.util.Set;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * {@link CodefImportScopeRequest} jakarta Bean Validation 단위 테스트 (#825 슬5 R1 — anti-false-green).
 *
 * <p>Spring MVC/서비스층을 전혀 거치지 않고 {@link Validator} 를 직접 호출한다 — 컨트롤러
 * {@code @Valid} 나 서비스 이중 가드(둘 다 있으면 서로를 가려 뮤테이션이 "결정적 RED"가
 * 안 되는 문제)와 독립적으로, DTO 애노테이션 자체(@NotNull/@Pattern/@AssertTrue)가 실제로
 * 살아있는지 증명한다. spec §3 "각 400 가드를 제거하는 뮤테이션이 결정적 RED 여야 한다" 충족용
 * — DTO 애노테이션 전체를 지워도 서비스층 중복 가드가 있으면 IT/서비스 유닛 테스트는 계속
 * green 이었던 FABLE5 R1 발견 대응.
 */
class CodefImportScopeRequestTest {

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

    private static CodefImportScopeRequest request(List<String> accountRefs, List<String> cardRefs,
                                                    List<String> loanRefs, String scopeMode) {
        return new CodefImportScopeRequest("connected-main", accountRefs, cardRefs, loanRefs,
                CodefImportType.ALL, scopeMode);
    }

    @Test
    @DisplayName("scopeMode 누락(null) — @NotNull 위반")
    void scopeModeNull_violatesNotNull() {
        Set<ConstraintViolation<CodefImportScopeRequest>> violations =
                validator.validate(request(List.of(), List.of(), List.of(), null));

        assertThat(violations)
                .extracting(v -> v.getMessage())
                .anyMatch(msg -> msg.contains("필수"));
    }

    @Test
    @DisplayName("scopeMode 유효하지 않은 값 — @Pattern 위반")
    void scopeModeInvalid_violatesPattern() {
        Set<ConstraintViolation<CodefImportScopeRequest>> violations =
                validator.validate(request(List.of(), List.of(), List.of(), "EVERYTHING"));

        assertThat(violations)
                .extracting(v -> v.getMessage())
                .anyMatch(msg -> msg.contains("ALL") && msg.contains("SELECTED"));
    }

    @Test
    @DisplayName("ALL + 선택 목록 존재 — @AssertTrue(isScopeSelectionConsistent) 위반")
    void allWithSelection_violatesConsistency() {
        Set<ConstraintViolation<CodefImportScopeRequest>> violations =
                validator.validate(request(List.of("국민 123-456"), List.of(), List.of(), "ALL"));

        assertThat(violations)
                .extracting(v -> v.getMessage())
                .anyMatch(msg -> msg.contains("일치하지 않습니다"));
    }

    @Test
    @DisplayName("SELECTED + 선택 목록 비어있음 — @AssertTrue(isScopeSelectionConsistent) 위반")
    void selectedWithoutSelection_violatesConsistency() {
        Set<ConstraintViolation<CodefImportScopeRequest>> violations =
                validator.validate(request(List.of(), List.of(), List.of(), "SELECTED"));

        assertThat(violations)
                .extracting(v -> v.getMessage())
                .anyMatch(msg -> msg.contains("일치하지 않습니다"));
    }

    @Test
    @DisplayName("ALL + 빈 선택 목록 — 위반 없음")
    void allWithoutSelection_valid() {
        Set<ConstraintViolation<CodefImportScopeRequest>> violations =
                validator.validate(request(List.of(), List.of(), List.of(), "ALL"));

        assertThat(violations).isEmpty();
    }

    @Test
    @DisplayName("SELECTED + 선택 목록 존재 — 위반 없음")
    void selectedWithSelection_valid() {
        Set<ConstraintViolation<CodefImportScopeRequest>> violations =
                validator.validate(request(List.of("국민 123-456"), List.of(), List.of(), "SELECTED"));

        assertThat(violations).isEmpty();
    }
}
