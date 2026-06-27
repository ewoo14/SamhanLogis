package com.samhanair.logis.accounting.web;

import static org.assertj.core.api.Assertions.assertThat;

import com.samhanair.logis.common.exception.ErrorCode;
import java.time.LocalDate;
import java.util.Arrays;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;

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

    @Test
    void methodArgumentTypeMismatch_usesNeutralKoreanMessage() {
        GlobalExceptionHandler handler = new GlobalExceptionHandler();
        MethodArgumentTypeMismatchException exception = new MethodArgumentTypeMismatchException(
                "not-a-date", LocalDate.class, "from", null,
                new IllegalArgumentException("java.time.LocalDate parse failed"));

        ResponseEntity<?> response = handler.handleRequestParameter(exception);

        assertThat(response.getStatusCode()).isEqualTo(ErrorCode.INVALID_INPUT.getHttpStatus());
        assertThat(response.getBody()).extracting("message")
                .isEqualTo("요청 파라미터 형식이 올바르지 않습니다");
    }
}
