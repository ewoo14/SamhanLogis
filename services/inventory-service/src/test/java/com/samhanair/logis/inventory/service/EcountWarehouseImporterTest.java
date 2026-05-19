package com.samhanair.logis.inventory.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.verify;

import com.samhanair.logis.common.ecount.EcountCsvSupport;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.inventory.web.dto.EcountWarehouseImportResult;
import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
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

/** MIG-2 창고 importer RED 가드. */
@ExtendWith(MockitoExtension.class)
class EcountWarehouseImporterTest {

    @Mock
    private NamedParameterJdbcTemplate jdbcTemplate;

    @InjectMocks
    private EcountWarehouseImporter importer;

    @BeforeEach
    void setUp() {
        lenient().when(jdbcTemplate.queryForObject(anyString(), any(SqlParameterSource.class), eq(Integer.class)))
                .thenReturn(0);
        lenient().when(jdbcTemplate.queryForObject(anyString(), any(SqlParameterSource.class), eq(UUID.class)))
                .thenReturn(UUID.fromString("00000000-0000-0000-0000-000000000401"));
        lenient().when(jdbcTemplate.update(anyString(), any(SqlParameterSource.class))).thenReturn(1);
    }

    @Test
    void importCsv_창고코드_정상과_placeholder를_분류한다() {
        String csv = """
                "데이터관리>창고-Excel다운로드"
                "창고코드\t","창고명\t","구분\t","생산공정명\t","외주거래처명\t","사용\t","추가사업장명\t"
                "00001\t","위니아-일산서부\t","창고\t","\t","\t","Yes\t","(주)삼한공조시스템\t"
                "0000\t","placeholder\t","창고\t","\t","\t","Yes\t","(주)삼한공조시스템\t"
                """;

        EcountWarehouseImportResult result = importer.importCsv(stream(csv), "tester");

        assertThat(result.imported()).isEqualTo(1);
        assertThat(result.skippedPlaceholder()).isEqualTo(1);
    }

    @Test
    void importCsv_창고명_빈값은_REJECT_NAME_NULL로_거부한다() {
        EcountWarehouseImportResult result = importer.importCsv(stream(warehouseCsv("""
                "00001\t","\t","창고\t","\t","\t","Yes\t","(주)삼한공조시스템\t"
                """)), "tester");

        assertThat(result.rejectedNullName()).isEqualTo(1);
        assertThat(result.rejectedSample()).extracting(EcountWarehouseImportResult.RejectedRow::reason)
                .containsExactly("REJECT_NAME_NULL");
    }

    @Test
    void importCsv_lookup_map_upsert는_2회_import에도_동일_key_ON_CONFLICT를_사용한다() {
        String csv = warehouseCsv("""
                "00001\t","위니아-일산서부\t","창고\t","\t","\t","Yes\t","(주)삼한공조시스템\t"
                """);

        importer.importCsv(stream(csv), "tester");
        importer.importCsv(stream(csv), "tester");

        ArgumentCaptor<String> sql = ArgumentCaptor.forClass(String.class);
        verify(jdbcTemplate, org.mockito.Mockito.atLeastOnce()).update(sql.capture(), any(SqlParameterSource.class));
        assertThat(sql.getAllValues())
                .anySatisfy(value -> assertThat(value)
                        .contains("staging.ecount_warehouse_map")
                        .contains("ON CONFLICT (ecount_code) DO UPDATE"));
    }

    @Test
    void importCsv_source_row_no는_데이터행_기준_1부터_증가한다() {
        String csv = warehouseCsv("""
                "00001\t","위니아-일산서부\t","창고\t","\t","\t","Yes\t","(주)삼한공조시스템\t"
                "00002\t","위니아-일산동부\t","창고\t","\t","\t","Yes\t","(주)삼한공조시스템\t"
                "00003\t","위니아-파주\t","창고\t","\t","\t","Yes\t","(주)삼한공조시스템\t"
                """);
        ArgumentCaptor<SqlParameterSource> params = ArgumentCaptor.forClass(SqlParameterSource.class);

        importer.importCsv(stream(csv), "tester");

        verify(jdbcTemplate, org.mockito.Mockito.atLeastOnce()).update(anyString(), params.capture());
        List<Integer> sourceRows = params.getAllValues().stream()
                .filter(p -> p.hasValue("row"))
                .map(p -> (Integer) p.getValue("row"))
                .distinct()
                .toList();
        assertThat(sourceRows).containsExactly(1, 2, 3);
    }

    @Test
    void importCsv_창고코드가_50자를_초과하면_MIG2_CODE_OUT_OF_RANGE로_거부한다() {
        String longCode = "W".repeat(51);

        assertThatThrownBy(() -> importer.importCsv(stream(warehouseCsv("""
                "%s\t","위니아-일산서부\t","창고\t","\t","\t","Yes\t","(주)삼한공조시스템\t"
                """.formatted(longCode))), "tester"))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.MIG2_CODE_OUT_OF_RANGE))
                .hasMessageContaining("length=51");
    }

    @Test
    void rawHeaderCrossCheck() throws Exception {
        try (InputStream fixture = EcountWarehouseImporterTest.class
                .getResourceAsStream("/ecount-raw-fixtures/warehouse.csv")) {
            assertThat(fixture).isNotNull();

            EcountCsvSupport.ParsedCsv parsed = EcountCsvSupport.parse(fixture.readAllBytes());

            EcountCsvSupport.validateHeader(parsed.header(), EcountWarehouseImporter.HEADERS);
        }
    }

    private static InputStream stream(String csv) {
        return new ByteArrayInputStream(csv.getBytes(StandardCharsets.UTF_8));
    }

    private static String warehouseCsv(String rows) {
        return """
                "데이터관리>창고-Excel다운로드"
                "창고코드\t","창고명\t","구분\t","생산공정명\t","외주거래처명\t","사용\t","추가사업장명\t"
                """ + rows;
    }
}
