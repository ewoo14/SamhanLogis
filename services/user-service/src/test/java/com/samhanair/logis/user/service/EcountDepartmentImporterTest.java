package com.samhanair.logis.user.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.verify;
import static org.junit.jupiter.api.Assumptions.assumeTrue;

import com.samhanair.logis.common.ecount.EcountCsvSupport;
import com.samhanair.logis.user.web.dto.EcountDepartmentImportResult;
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

/** MIG-2 부서 importer RED 가드. */
@ExtendWith(MockitoExtension.class)
class EcountDepartmentImporterTest {

    @Mock
    private NamedParameterJdbcTemplate jdbcTemplate;

    @InjectMocks
    private EcountDepartmentImporter importer;

    @BeforeEach
    void setUp() {
        lenient().when(jdbcTemplate.queryForObject(anyString(), any(SqlParameterSource.class), eq(Integer.class)))
                .thenReturn(0);
        lenient().when(jdbcTemplate.queryForObject(anyString(), any(SqlParameterSource.class), eq(UUID.class)))
                .thenReturn(UUID.fromString("00000000-0000-0000-0000-000000000301"));
        lenient().when(jdbcTemplate.update(anyString(), any(SqlParameterSource.class))).thenReturn(1);
    }

    @Test
    void importCsv_부서코드_정상과_placeholder를_분류한다() {
        String csv = """
                "데이터관리>부서코드-Excel다운로드"
                "부서코드\t","부서명\t","사용\t","추가사업장\t",""
                "00001\t","관리부\t","Yes\t","\t",""
                "0000\t","placeholder\t","Yes\t","\t",""
                """;

        EcountDepartmentImportResult result = importer.importCsv(stream(csv), "tester");

        assertThat(result.imported()).isEqualTo(1);
        assertThat(result.skippedPlaceholder()).isEqualTo(1);
    }

    @Test
    void importCsv_부서명_빈값은_REJECT_NAME_NULL로_거부한다() {
        EcountDepartmentImportResult result = importer.importCsv(stream(departmentCsv("""
                "00001\t","\t","Yes\t","\t",""
                """)), "tester");

        assertThat(result.rejectedNullName()).isEqualTo(1);
        assertThat(result.rejectedSample()).extracting(EcountDepartmentImportResult.RejectedRow::reason)
                .containsExactly("REJECT_NAME_NULL");
    }

    @Test
    void importCsv_lookup_map_upsert는_2회_import에도_동일_key_ON_CONFLICT를_사용한다() {
        String csv = departmentCsv("""
                "00001\t","관리부\t","Yes\t","\t",""
                """);

        importer.importCsv(stream(csv), "tester");
        importer.importCsv(stream(csv), "tester");

        ArgumentCaptor<String> sql = ArgumentCaptor.forClass(String.class);
        verify(jdbcTemplate, org.mockito.Mockito.atLeastOnce()).update(sql.capture(), any(SqlParameterSource.class));
        assertThat(sql.getAllValues())
                .anySatisfy(value -> assertThat(value)
                        .contains("staging.ecount_department_map")
                        .contains("ON CONFLICT (ecount_code) DO UPDATE"));
    }

    @Test
    void importCsv_source_row_no는_데이터행_기준_1부터_증가한다() {
        String csv = departmentCsv("""
                "00001\t","관리부\t","Yes\t","\t",""
                "00002\t","영업부\t","Yes\t","\t",""
                "00003\t","물류부\t","Yes\t","\t",""
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
        Path rawFile = Path.of("docs/migration/ecount-data/raw/부서코드-Excel다운로드.csv");
        assumeTrue(Files.exists(rawFile));

        EcountCsvSupport.ParsedCsv parsed = EcountCsvSupport.parse(Files.readAllBytes(rawFile));

        EcountCsvSupport.validateHeader(parsed.header(), EcountDepartmentImporter.HEADERS);
    }

    private static InputStream stream(String csv) {
        return new ByteArrayInputStream(csv.getBytes(StandardCharsets.UTF_8));
    }

    private static String departmentCsv(String rows) {
        return """
                "데이터관리>부서코드-Excel다운로드"
                "부서코드\t","부서명\t","사용\t","추가사업장\t",""
                """ + rows;
    }
}
