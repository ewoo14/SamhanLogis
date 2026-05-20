package com.samhanair.logis.common.exception;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;

class ErrorCodeMig4Test {

    @Test
    void mig4_errorCodes_정상등록() {
        assertThat(ErrorCode.MIG4_TAX_INVOICE_DUPLICATE.getHttpStatus()).isEqualTo(HttpStatus.CONFLICT);
        assertThat(ErrorCode.MIG4_LOOKUP_MISS.getHttpStatus()).isEqualTo(HttpStatus.UNPROCESSABLE_ENTITY);
        assertThat(ErrorCode.MIG4_LOOKUP_AMBIGUOUS.getHttpStatus()).isEqualTo(HttpStatus.UNPROCESSABLE_ENTITY);
        assertThat(ErrorCode.MIG4_AMOUNT_INVALID.getHttpStatus()).isEqualTo(HttpStatus.UNPROCESSABLE_ENTITY);
        assertThat(ErrorCode.MIG4_DATE_INVALID.getHttpStatus()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(ErrorCode.MIG4_SLIP_NO_INVALID.getHttpStatus()).isEqualTo(HttpStatus.UNPROCESSABLE_ENTITY);
        assertThat(ErrorCode.MIG4_SUMMARY_BALANCE_MISMATCH.getHttpStatus()).isEqualTo(HttpStatus.UNPROCESSABLE_ENTITY);
        assertThat(ErrorCode.MIG4_ORDER_STATUS_INVALID.getHttpStatus()).isEqualTo(HttpStatus.UNPROCESSABLE_ENTITY);
        assertThat(ErrorCode.MIG4_CSV_HEADER_MISMATCH.getHttpStatus()).isEqualTo(HttpStatus.UNPROCESSABLE_ENTITY);
    }
}
