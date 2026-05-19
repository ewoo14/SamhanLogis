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
}
