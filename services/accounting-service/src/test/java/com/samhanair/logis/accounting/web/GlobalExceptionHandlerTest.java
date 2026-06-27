package com.samhanair.logis.accounting.web;

import static org.assertj.core.api.Assertions.assertThat;

import com.samhanair.logis.common.exception.ErrorCode;
import java.time.LocalDate;
import java.util.Arrays;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.MissingServletRequestParameterException;
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
                .isEqualTo("요청 파라미터 형식이 올바르지 않습니다.");
        assertThat(response.getBody()).extracting("message")
                .asString()
                .doesNotContain("from")
                .doesNotContain("not-a-date")
                .doesNotContain("LocalDate");
    }

    @Test
    void missingRequestParameter_usesNeutralKoreanMessage() {
        GlobalExceptionHandler handler = new GlobalExceptionHandler();

        ResponseEntity<?> response = handler.handleMissingRequestParameter(
                new MissingServletRequestParameterException("connectedId", "String"));

        assertThat(response.getStatusCode()).isEqualTo(ErrorCode.INVALID_INPUT.getHttpStatus());
        assertThat(response.getBody()).extracting("message")
                .isEqualTo("필수 요청 파라미터가 누락되었습니다.");
        assertThat(response.getBody()).extracting("message")
                .asString()
                .doesNotContain("connectedId")
                .doesNotContain("연결 식별자")
                .doesNotContain("String");
    }

    @Test
    void notReadable_usesNeutralKoreanMessageWithoutRawExceptionMessage() {
        GlobalExceptionHandler handler = new GlobalExceptionHandler();

        ResponseEntity<?> response = handler.handleNotReadable(
                new HttpMessageNotReadableException("raw JSON parse failure: com.fasterxml.jackson.databind"));

        assertThat(response.getStatusCode()).isEqualTo(ErrorCode.INVALID_INPUT.getHttpStatus());
        assertThat(response.getBody()).extracting("message")
                .isEqualTo("요청 본문이 비어 있거나 형식이 올바르지 않습니다.");
        assertThat(response.getBody()).extracting("message")
                .asString()
                .doesNotContain("raw JSON")
                .doesNotContain("com.fasterxml");
    }

    @Test
    void unknownException_usesNeutralKoreanMessageWithoutRawExceptionMessage() {
        GlobalExceptionHandler handler = new GlobalExceptionHandler();

        ResponseEntity<?> response = handler.handleUnknown(
                new IllegalStateException("raw SQL detail: select * from account"));

        assertThat(response.getStatusCode()).isEqualTo(ErrorCode.INTERNAL_ERROR.getHttpStatus());
        assertThat(response.getBody()).extracting("message")
                .isEqualTo("서버 내부 오류가 발생했습니다.");
        assertThat(response.getBody()).extracting("message")
                .asString()
                .doesNotContain("raw SQL")
                .doesNotContain("select *");
    }
}
