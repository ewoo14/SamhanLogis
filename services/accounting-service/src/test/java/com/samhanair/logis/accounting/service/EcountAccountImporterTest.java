package com.samhanair.logis.accounting.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.verify;
import static org.junit.jupiter.api.Assumptions.assumeTrue;

import com.samhanair.logis.common.ecount.EcountCsvSupport;
import com.samhanair.logis.accounting.web.dto.EcountAccountImportResult;
import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
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
        lenient().when(jdbcTemplate.update(anyString(), any(SqlParameterSource.class))).thenReturn(1);
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

    @Test
    void importCsv_계정명_빈값은_REJECT_NAME_NULL로_거부한다() {
        EcountAccountImportResult result = importer.importCsv(stream(accountCsv("""
                "00010\t","\t","\t","차변\t","전표입력계정\t","자산\t","\t","2470\t","\t","1\t","계정명세서\t","\t","\t","없음\t","N\t","\t","\t","X\t","\t","0\t","N\t","Y\t","기타\t","1\t","N\t","N\t","Y\t","Other\t","1\t","N\t","N\t","N\t",""
                """)), "tester");

        assertThat(result.rejectedNullName()).isEqualTo(1);
        assertThat(result.rejectedSample()).extracting(EcountAccountImportResult.RejectedRow::reason)
                .containsExactly("REJECT_NAME_NULL");
    }

    @Test
    void importCsv_lookup_map_upsert는_2회_import에도_동일_key_ON_CONFLICT를_사용한다() {
        String csv = accountCsv("""
                "00010\t","출자금\t","\t","차변\t","전표입력계정\t","자산\t","\t","2470\t","\t","1\t","계정명세서\t","\t","\t","없음\t","N\t","\t","\t","X\t","\t","0\t","N\t","Y\t","기타\t","1\t","N\t","N\t","Y\t","Other\t","1\t","N\t","N\t","N\t",""
                """);

        importer.importCsv(stream(csv), "tester");
        importer.importCsv(stream(csv), "tester");

        ArgumentCaptor<String> sql = ArgumentCaptor.forClass(String.class);
        verify(jdbcTemplate, org.mockito.Mockito.atLeastOnce()).update(sql.capture(), any(SqlParameterSource.class));
        assertThat(sql.getAllValues())
                .anySatisfy(value -> assertThat(value)
                        .contains("staging.ecount_account_map")
                        .contains("ON CONFLICT (ecount_code) DO UPDATE"));
    }

    @Test
    void importCsv_source_row_no는_데이터행_기준_1부터_증가한다() {
        String csv = accountCsv("""
                "00010\t","출자금\t","\t","차변\t","전표입력계정\t","자산\t","\t","2470\t","\t","1\t","계정명세서\t","\t","\t","없음\t","N\t","\t","\t","X\t","\t","0\t","N\t","Y\t","기타\t","1\t","N\t","N\t","Y\t","Other\t","1\t","N\t","N\t","N\t",""
                "00020\t","예수금\t","\t","대변\t","전표입력계정\t","부채\t","\t","2470\t","\t","1\t","계정명세서\t","\t","\t","없음\t","N\t","\t","\t","X\t","\t","0\t","N\t","Y\t","기타\t","1\t","N\t","N\t","Y\t","Other\t","1\t","N\t","N\t","N\t",""
                "00030\t","자본금\t","\t","대변\t","전표입력계정\t","자본\t","\t","2470\t","\t","1\t","계정명세서\t","\t","\t","없음\t","N\t","\t","\t","X\t","\t","0\t","N\t","Y\t","기타\t","1\t","N\t","N\t","Y\t","Other\t","1\t","N\t","N\t","N\t",""
                """);
        ArgumentCaptor<SqlParameterSource> params = ArgumentCaptor.forClass(SqlParameterSource.class);

        importer.importCsv(stream(csv), "tester");

        verify(jdbcTemplate, org.mockito.Mockito.atLeastOnce()).update(anyString(), params.capture());
        List<Integer> sourceRows = params.getAllValues().stream()
                .filter(p -> p.hasValue("row"))
                .map(p -> (Integer) p.getValue("row"))
                .distinct()
                .toList();
        assertThat(sourceRows).contains(1, 2, 3);
    }

    @Test
    void rawHeaderCrossCheck() throws Exception {
        Path rawFile = Path.of("docs/migration/ecount-data/raw/계정상세내역-Excel다운로드.csv");
        assumeTrue(Files.exists(rawFile));

        EcountCsvSupport.ParsedCsv parsed = EcountCsvSupport.parse(Files.readAllBytes(rawFile));

        EcountCsvSupport.validateHeader(parsed.header(), EcountAccountImporter.HEADERS);
    }

    private static InputStream stream(String csv) {
        return new ByteArrayInputStream(csv.getBytes(StandardCharsets.UTF_8));
    }

    private static String accountCsv(String rows) {
        return """
                "계정코드\t","계정명\t","검색창내용\t","대차구분\t","계정속성\t","계정종류\t","수입지출구분\t","재무제표상위계정\t","수입지출상위계정\t","잔액집계구분\t","재무제표하이퍼링크대상\t","추가항목유형코드\t","추가항목유형명\t","관련업무\t","수표\t","적요1\t","적요2\t","평가계정구분\t","평가계정대상계정코드\t","평가순서\t","평가계정잔액\t","재무제표표시여부계정표시방법1\t","재무제표표시명1\t","재무제표인쇄위치계정표시방법1\t","재무제표금액굵기계정표시방법1\t","재무재표금액괄호계정표시방법1\t","재무제표표시여부(국외용)\t","재무제표표시명2\t","재무제표인쇄위치(국외용)\t","재무제표금액굵기(국외용)\t","재무제표금액괄호(국외용)\t","사용중단\t",""
                """ + rows;
    }
}
