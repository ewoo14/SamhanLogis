package com.samhanair.logis.accounting.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.verify;
import static org.junit.jupiter.api.Assumptions.assumeTrue;

import com.samhanair.logis.accounting.web.dto.EcountCardImportResult;
import com.samhanair.logis.common.ecount.EcountCsvSupport;
import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.jdbc.core.namedparam.SqlParameterSource;

/** MIG-2 카드/계좌 importer RED 가드. */
@ExtendWith(MockitoExtension.class)
class EcountCardImporterTest {

    @Mock
    private NamedParameterJdbcTemplate jdbcTemplate;

    @InjectMocks
    private EcountCardImporter importer;

    @BeforeEach
    void setUp() {
        lenient().when(jdbcTemplate.queryForObject(anyString(), any(SqlParameterSource.class), eq(Integer.class)))
                .thenReturn(0);
        lenient().when(jdbcTemplate.queryForObject(anyString(), any(SqlParameterSource.class), eq(UUID.class)))
                .thenReturn(UUID.fromString("00000000-0000-0000-0000-000000000501"));
        lenient().when(jdbcTemplate.update(anyString(), any(SqlParameterSource.class))).thenReturn(1);
    }

    @Test
    void importCsv_통장계좌를_cardMaster로_분류한다() {
        String csv = """
                "데이터관리>통장계좌-Excel다운로드"
                "계좌코드\t","계좌명\t","계정명(계정코드)\t\t","검색창내용\t","적요\t","외화통장\t","사용\t",""
                "079815326474401\t","국민예금\t","정기예.적금(1059)\t","\t","\t","미사용\t","YES\t",""
                "0000\t","placeholder\t","현금(1019)\t","\t","\t","미사용\t","YES\t",""
                """;

        EcountCardImportResult result = importer.importCsv(stream(csv), "tester");

        assertThat(result.imported()).isEqualTo(1);
        assertThat(result.skippedPlaceholder()).isEqualTo(1);
    }

    @Test
    void importCsv_계좌명_빈값은_REJECT_NAME_NULL로_거부한다() {
        EcountCardImportResult result = importer.importCsv(stream(cardCsv("""
                "079815326474401\t","\t","정기예.적금(1059)\t","\t","\t","미사용\t","YES\t",""
                """)), "tester");

        assertThat(result.rejectedNullName()).isEqualTo(1);
        assertThat(result.rejectedSample()).extracting(EcountCardImportResult.RejectedRow::reason)
                .containsExactly("REJECT_NAME_NULL");
    }

    @Test
    void importCsv_card_code_upsert는_2회_import에도_ON_CONFLICT로_idempotent하다() {
        String csv = cardCsv("""
                "079815326474401\t","국민예금\t","정기예.적금(1059)\t","\t","\t","미사용\t","YES\t",""
                """);

        importer.importCsv(stream(csv), "tester");
        importer.importCsv(stream(csv), "tester");

        ArgumentCaptor<String> sql = ArgumentCaptor.forClass(String.class);
        verify(jdbcTemplate, org.mockito.Mockito.atLeastOnce()).queryForObject(
                sql.capture(), any(SqlParameterSource.class), eq(UUID.class));
        assertThat(sql.getAllValues())
                .anySatisfy(value -> assertThat(value)
                        .contains("card_master")
                        .contains("ON CONFLICT (card_code)"));
    }

    @Test
    void importCsv_source_row_no는_데이터행_기준_1부터_증가한다() {
        String csv = cardCsv("""
                "079815326474401\t","국민예금\t","정기예.적금(1059)\t","\t","\t","미사용\t","YES\t",""
                "079815326474402\t","신한예금\t","정기예.적금(1059)\t","\t","\t","미사용\t","YES\t",""
                "079815326474403\t","하나예금\t","정기예.적금(1059)\t","\t","\t","미사용\t","YES\t",""
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
        Path rawFile = Path.of("docs/migration/ecount-data/raw/통장계좌-Excel다운로드.csv");
        assumeTrue(Files.exists(rawFile));

        EcountCsvSupport.ParsedCsv parsed = EcountCsvSupport.parse(Files.readAllBytes(rawFile));

        EcountCsvSupport.validateHeader(parsed.header(), EcountCardImporter.HEADERS);
    }

    private static InputStream stream(String csv) {
        return new ByteArrayInputStream(csv.getBytes(StandardCharsets.UTF_8));
    }

    private static String cardCsv(String rows) {
        return """
                "데이터관리>통장계좌-Excel다운로드"
                "계좌코드\t","계좌명\t","계정명(계정코드)\t\t","검색창내용\t","적요\t","외화통장\t","사용\t",""
                """ + rows;
    }
}
