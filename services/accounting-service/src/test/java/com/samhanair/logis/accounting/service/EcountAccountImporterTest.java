package com.samhanair.logis.accounting.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;

import com.samhanair.logis.accounting.web.dto.EcountAccountImportResult;
import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.jdbc.core.namedparam.SqlParameterSource;

/** MIG-2 계정 importer RED 가드: 헤더 없는 meta-less CSV + placeholder narrow. */
@ExtendWith(MockitoExtension.class)
class EcountAccountImporterTest {

    @Mock
    private NamedParameterJdbcTemplate jdbcTemplate;

    @InjectMocks
    private EcountAccountImporter importer;

    @BeforeEach
    void setUp() {
        lenient().when(jdbcTemplate.queryForObject(anyString(), any(SqlParameterSource.class), eq(Integer.class)))
                .thenReturn(0);
    }

    @Test
    void importCsv_계정코드_정상과_placeholder를_분류한다() {
        String csv = """
                "계정코드\t","계정명\t","검색창내용\t","대차구분\t","계정속성\t","계정종류\t","수입지출구분\t","재무제표상위계정\t","수입지출상위계정\t","잔액집계구분\t","재무제표하이퍼링크대상\t","추가항목유형코드\t","추가항목유형명\t","관련업무\t","수표\t","적요1\t","적요2\t","평가계정구분\t","평가계정대상계정코드\t","평가순서\t","평가계정잔액\t","재무제표표시여부계정표시방법1\t","재무제표표시명1\t","재무제표인쇄위치계정표시방법1\t","재무제표금액굵기계정표시방법1\t","재무재표금액괄호계정표시방법1\t","재무제표표시여부(국외용)\t","재무제표표시명2\t","재무제표인쇄위치(국외용)\t","재무제표금액굵기(국외용)\t","재무제표금액괄호(국외용)\t","사용중단\t",""
                "00010\t","출자금\t","\t","차변\t","전표입력계정\t","자산\t","\t","2470\t","\t","1\t","계정명세서\t","\t","\t","없음\t","N\t","\t","\t","X\t","\t","0\t","N\t","Y\t","기타\t","1\t","N\t","N\t","Y\t","Other\t","1\t","N\t","N\t","N\t",""
                "0000\t","placeholder\t","\t","차변\t","전표입력계정\t","자산\t","\t","2470\t","\t","1\t","계정명세서\t","\t","\t","없음\t","N\t","\t","\t","X\t","\t","0\t","N\t","Y\t","기타\t","1\t","N\t","N\t","Y\t","Other\t","1\t","N\t","N\t","N\t",""
                """;

        EcountAccountImportResult result = importer.importCsv(stream(csv), "tester");

        assertThat(result.totalRows()).isEqualTo(2);
        assertThat(result.imported()).isEqualTo(1);
        assertThat(result.skippedPlaceholder()).isEqualTo(1);
    }

    private static InputStream stream(String csv) {
        return new ByteArrayInputStream(csv.getBytes(StandardCharsets.UTF_8));
    }
}
