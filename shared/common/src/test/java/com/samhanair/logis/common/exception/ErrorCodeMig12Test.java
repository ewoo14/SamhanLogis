package com.samhanair.logis.common.exception;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;

class ErrorCodeMig12Test {

    @Test
    void mig12_internal_auth_miss는_503() {
        assertThat(ErrorCode.MIG12_INTERNAL_AUTH_MISS.getHttpStatus())
                .isEqualTo(HttpStatus.SERVICE_UNAVAILABLE);
    }
}
