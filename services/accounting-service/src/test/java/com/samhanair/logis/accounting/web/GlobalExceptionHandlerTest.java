package com.samhanair.logis.accounting.web;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Arrays;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.web.bind.annotation.ExceptionHandler;

/** accounting-service 공통 예외 응답 계약 테스트. */
class GlobalExceptionHandlerTest {

    @Test
    void dataIntegrityViolation_isNotMappedToGlobalConflict() {
        boolean hasDataIntegrityHandler = Arrays.stream(GlobalExceptionHandler.class.getDeclaredMethods())
                .map(method -> method.getAnnotation(ExceptionHandler.class))
                .filter(annotation -> annotation != null)
                .flatMap(annotation -> Arrays.stream(annotation.value()))
                .anyMatch(DataIntegrityViolationException.class::equals);

        assertThat(hasDataIntegrityHandler).isFalse();
    }
}
