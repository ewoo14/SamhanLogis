package com.samhanair.logis.common.exception;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;

class ErrorCodeMig10Test {

    @Test
    void mig10_error_codes_http_status_정합() {
        assertThat(ErrorCode.MIG10_ORDER_NOT_FOUND.getHttpStatus()).isEqualTo(HttpStatus.UNPROCESSABLE_ENTITY);
        assertThat(ErrorCode.MIG10_EMPLOYEE_LOOKUP_MISS.getHttpStatus()).isEqualTo(HttpStatus.UNPROCESSABLE_ENTITY);
        assertThat(ErrorCode.MIG10_EMPLOYEE_AMBIGUOUS.getHttpStatus()).isEqualTo(HttpStatus.UNPROCESSABLE_ENTITY);
        assertThat(ErrorCode.MIG10_AGING_VIEW_VERSION_MISMATCH.getHttpStatus()).isEqualTo(HttpStatus.UNPROCESSABLE_ENTITY);
    }
}
