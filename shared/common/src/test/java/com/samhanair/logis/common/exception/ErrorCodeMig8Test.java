package com.samhanair.logis.common.exception;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;

class ErrorCodeMig8Test {

    @Test
    void mig8_errorCodes_정상등록() {
        assertThat(ErrorCode.MIG8_STAGING_ROW_NOT_FOUND.getHttpStatus()).isEqualTo(HttpStatus.UNPROCESSABLE_ENTITY);
        assertThat(ErrorCode.MIG8_LOOKUP_MISS.getHttpStatus()).isEqualTo(HttpStatus.UNPROCESSABLE_ENTITY);
        assertThat(ErrorCode.MIG8_AMOUNT_INVALID.getHttpStatus()).isEqualTo(HttpStatus.UNPROCESSABLE_ENTITY);
        assertThat(ErrorCode.MIG8_DATE_INVALID.getHttpStatus()).isEqualTo(HttpStatus.UNPROCESSABLE_ENTITY);
        assertThat(ErrorCode.MIG8_PROGRESS_STATUS_INVALID.getHttpStatus()).isEqualTo(HttpStatus.UNPROCESSABLE_ENTITY);
        assertThat(ErrorCode.MIG8_SLIP_LINK_MISS.getHttpStatus()).isEqualTo(HttpStatus.UNPROCESSABLE_ENTITY);
        assertThat(ErrorCode.MIG8_DUPLICATE_EXTERNAL_REF.getHttpStatus()).isEqualTo(HttpStatus.UNPROCESSABLE_ENTITY);
    }
}
