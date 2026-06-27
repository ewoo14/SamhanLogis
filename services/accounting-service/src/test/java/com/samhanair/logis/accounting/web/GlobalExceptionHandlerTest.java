package com.samhanair.logis.accounting.web;

import static org.assertj.core.api.Assertions.assertThat;

import com.samhanair.logis.common.dto.ApiResponse;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

/** accounting-service 공통 예외 응답 계약 테스트. */
class GlobalExceptionHandlerTest {

    private final GlobalExceptionHandler handler = new GlobalExceptionHandler();

    @Test
    void dataIntegrityViolation_returnsConflictWithKoreanMessage() {
        ResponseEntity<ApiResponse<Void>> response = handler.handleDataIntegrityViolation(
                new DataIntegrityViolationException("duplicate key"));

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.CONFLICT);
        assertThat(response.getBody()).isNotNull();
        assertThat(response.getBody().getCode()).isEqualTo("CONFLICT");
        assertThat(response.getBody().getMessage())
                .isEqualTo("이미 처리된 요청이거나 데이터가 충돌했습니다. 최신 상태를 확인한 뒤 다시 시도하세요.");
    }
}
