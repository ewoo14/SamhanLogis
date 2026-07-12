package com.samhanair.logis.notification.exception;

import static org.assertj.core.api.Assertions.assertThat;

import com.samhanair.logis.common.dto.ApiResponse;
import com.samhanair.logis.common.exception.ErrorCode;
import java.time.LocalDate;
import org.junit.jupiter.api.Test;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.MissingRequestHeaderException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;

/** notification-service 공통 예외 응답 계약 테스트. */
class NotificationExceptionHandlerTest {

    private final NotificationExceptionHandler handler = new NotificationExceptionHandler();

    @Test
    void missingRequestParameter_returnsNeutralKoreanMessage() {
        ResponseEntity<ApiResponse<Void>> response = handler.handleMissingRequestParameter(
                new MissingServletRequestParameterException("programType", "DispatchSmsProgramType"));

        assertThat(response.getStatusCode()).isEqualTo(ErrorCode.INVALID_INPUT.getHttpStatus());
        assertThat(response.getBody()).isNotNull();
        assertThat(response.getBody().getMessage())
                .isEqualTo("필수 요청 파라미터가 누락되었습니다.")
                .doesNotContain("programType")
                .doesNotContain("DispatchSmsProgramType");
    }

    @Test
    void typeMismatchParameter_returnsNeutralKoreanMessage() {
        MethodArgumentTypeMismatchException exception = new MethodArgumentTypeMismatchException(
                "NOT_A_DATE", LocalDate.class, "from", null,
                new IllegalArgumentException("java.time.LocalDate parse failed"));

        ResponseEntity<ApiResponse<Void>> response = handler.handleTypeMismatch(exception);

        assertThat(response.getStatusCode()).isEqualTo(ErrorCode.INVALID_INPUT.getHttpStatus());
        assertThat(response.getBody()).isNotNull();
        assertThat(response.getBody().getMessage())
                .isEqualTo("요청 파라미터 형식이 올바르지 않습니다.")
                .doesNotContain("from")
                .doesNotContain("NOT_A_DATE")
                .doesNotContain("LocalDate");
    }

    @Test
    void missingRequestHeader_returnsNeutralKoreanMessage() {
        ResponseEntity<ApiResponse<Void>> response = handler.handleMissingRequestHeader(
                new MissingRequestHeaderException("X-User-Id", null));

        assertThat(response.getStatusCode()).isEqualTo(ErrorCode.INVALID_INPUT.getHttpStatus());
        assertThat(response.getBody()).isNotNull();
        assertThat(response.getBody().getMessage())
                .isEqualTo("필수 요청 헤더가 누락되었습니다")
                .doesNotContain("X-User-Id");
    }
}
