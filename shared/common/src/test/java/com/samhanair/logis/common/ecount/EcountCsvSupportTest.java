package com.samhanair.logis.common.ecount;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import java.nio.charset.StandardCharsets;
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

    @Test
    void parse_데이터관리_meta_row는_skip한다() {
        byte[] csv = """
                "데이터관리>통장계좌-Excel다운로드"
                "계좌코드\t","계좌명\t",""
                "001\t","국민예금\t",""
                """.getBytes(StandardCharsets.UTF_8);

        EcountCsvSupport.ParsedCsv parsed = EcountCsvSupport.parse(csv);

        assertThat(parsed.headerIndex()).isEqualTo(1);
        assertThat(EcountCsvSupport.stripCell(parsed.header()[0])).isEqualTo("계좌코드");
    }

    @Test
    void parse_회사명_meta_row는_skip한다() {
        byte[] csv = """
                "회사명 : (주)삼한공조시스템"
                "사원(담당)코드\t","사원(담당)명\t",""
                "00001\t","사원A\t",""
                """.getBytes(StandardCharsets.UTF_8);

        EcountCsvSupport.ParsedCsv parsed = EcountCsvSupport.parse(csv);

        assertThat(parsed.headerIndex()).isEqualTo(1);
        assertThat(EcountCsvSupport.stripCell(parsed.header()[0])).isEqualTo("사원(담당)코드");
    }

    @Test
    void parse_데이터행은_meta_row로_skip하지_않는다() {
        byte[] csv = """
                "사원(담당)코드\t","사원(담당)명\t",""
                "00001\t","회사명 : 값이 들어간 사원\t",""
                """.getBytes(StandardCharsets.UTF_8);

        EcountCsvSupport.ParsedCsv parsed = EcountCsvSupport.parse(csv);

        assertThat(parsed.headerIndex()).isZero();
        assertThat(EcountCsvSupport.stripCell(parsed.header()[0])).isEqualTo("사원(담당)코드");
    }
}
