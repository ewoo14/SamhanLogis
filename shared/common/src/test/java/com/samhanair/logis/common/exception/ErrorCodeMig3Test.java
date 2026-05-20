package com.samhanair.logis.common.exception;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;

class ErrorCodeMig3Test {

    @Test
    void mig3_errorCodes_정상등록() {
        assertThat(ErrorCode.MIG3_VOUCHER_NO_DUPLICATE.getHttpStatus()).isEqualTo(HttpStatus.CONFLICT);
        assertThat(ErrorCode.MIG3_LOOKUP_MISS.getHttpStatus()).isEqualTo(HttpStatus.UNPROCESSABLE_ENTITY);
        assertThat(ErrorCode.MIG3_SLIP_AMOUNT_INVALID.getHttpStatus()).isEqualTo(HttpStatus.UNPROCESSABLE_ENTITY);
        assertThat(ErrorCode.MIG3_JOURNAL_BALANCE_MISMATCH.getHttpStatus()).isEqualTo(HttpStatus.UNPROCESSABLE_ENTITY);
        assertThat(ErrorCode.MIG3_CSV_HEADER_MISMATCH.getHttpStatus()).isEqualTo(HttpStatus.BAD_REQUEST);
    }
}
