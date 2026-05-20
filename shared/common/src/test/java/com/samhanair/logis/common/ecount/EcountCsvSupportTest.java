package com.samhanair.logis.common.ecount;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import org.junit.jupiter.api.Test;

class EcountCsvSupportTest {

    @Test
    void validateHeader_expected보다_컬럼이_많으면_MIG2_CSV_HEADER_MISMATCH로_거부한다() {
        String[] expected = {"코드", "명칭"};
        String[] header = {"코드", "명칭", "신규컬럼"};

        assertThatThrownBy(() -> EcountCsvSupport.validateHeader(header, expected))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.MIG2_CSV_HEADER_MISMATCH))
                .hasMessageContaining("신규컬럼");
    }

    @Test
    void validateHeader_실raw_trailing_empty_컬럼_1개는_허용한다() {
        String[] expected = {"전표번호", "거래유형", "금액", "거래처명", "적요명"};
        String[] header = {"전표번호\t", "거래유형\t", "금액\t", "거래처명\t", "적요명\t", ""};

        EcountCsvSupport.validateHeader(header, expected);
    }
}
