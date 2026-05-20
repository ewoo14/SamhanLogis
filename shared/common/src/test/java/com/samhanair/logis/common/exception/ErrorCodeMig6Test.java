package com.samhanair.logis.common.exception;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;

class ErrorCodeMig6Test {

    @Test
    void mig6_errorCodes_정상등록() {
        assertThat(ErrorCode.MIG6_LOOKUP_MISS.getHttpStatus()).isEqualTo(HttpStatus.UNPROCESSABLE_ENTITY);
        assertThat(ErrorCode.MIG6_LOOKUP_AMBIGUOUS.getHttpStatus()).isEqualTo(HttpStatus.UNPROCESSABLE_ENTITY);
        assertThat(ErrorCode.MIG6_EMPLOYEE_CODE_DUPLICATE.getHttpStatus()).isEqualTo(HttpStatus.CONFLICT);
        assertThat(ErrorCode.MIG6_BANK_ACCOUNT_CODE_DUPLICATE.getHttpStatus()).isEqualTo(HttpStatus.CONFLICT);
        assertThat(ErrorCode.MIG6_DATE_INVALID.getHttpStatus()).isEqualTo(HttpStatus.UNPROCESSABLE_ENTITY);
        assertThat(ErrorCode.MIG6_RESIDENT_NUMBER_INVALID.getHttpStatus()).isEqualTo(HttpStatus.UNPROCESSABLE_ENTITY);
        assertThat(ErrorCode.MIG6_BOOLEAN_FLAG_INVALID.getHttpStatus()).isEqualTo(HttpStatus.UNPROCESSABLE_ENTITY);
        assertThat(ErrorCode.MIG6_CSV_HEADER_MISMATCH.getHttpStatus()).isEqualTo(HttpStatus.UNPROCESSABLE_ENTITY);
    }
}
