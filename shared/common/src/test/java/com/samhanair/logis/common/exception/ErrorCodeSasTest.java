package com.samhanair.logis.common.exception;

import static org.assertj.core.api.Assertions.assertThat;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;

class ErrorCodeSasTest {

    @Test
    void sas_errorCodes_정상등록() {
        assertThat(ErrorCode.SAS_SOURCE_SLIP_NOT_FOUND.getHttpStatus()).isEqualTo(HttpStatus.NOT_FOUND);
        assertThat(ErrorCode.SAS_SOURCE_SLIP_NOT_CONFIRMED.getHttpStatus()).isEqualTo(HttpStatus.UNPROCESSABLE_ENTITY);
        assertThat(ErrorCode.SAS_OVER_ALLOCATION.getHttpStatus()).isEqualTo(HttpStatus.UNPROCESSABLE_ENTITY);
        assertThat(ErrorCode.SAS_LINE_AMOUNT_MISMATCH.getHttpStatus()).isEqualTo(HttpStatus.UNPROCESSABLE_ENTITY);
        assertThat(ErrorCode.SAS_TAX_TYPE_MIXED.getHttpStatus()).isEqualTo(HttpStatus.UNPROCESSABLE_ENTITY);
        assertThat(ErrorCode.SAS_ALREADY_POSTED.getHttpStatus()).isEqualTo(HttpStatus.CONFLICT);
        assertThat(ErrorCode.SAS_DAILY_CLOSING_LOCKED.getHttpStatus()).isEqualTo(HttpStatus.CONFLICT);
        assertThat(ErrorCode.SAS_TAX_INVOICE_ALREADY_LINKED.getHttpStatus()).isEqualTo(HttpStatus.CONFLICT);
        assertThat(ErrorCode.SAS_PARTNER_MONTH_MISMATCH.getHttpStatus()).isEqualTo(HttpStatus.UNPROCESSABLE_ENTITY);
        assertThat(ErrorCode.SAS_SLIP_NO_CONFLICT.getHttpStatus()).isEqualTo(HttpStatus.CONFLICT);
    }
}
