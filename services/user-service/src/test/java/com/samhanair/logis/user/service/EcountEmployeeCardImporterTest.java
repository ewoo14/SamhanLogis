package com.samhanair.logis.user.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.samhanair.logis.common.ecount.EcountMig6ImportResult;
import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.dao.EmptyResultDataAccessException;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.jdbc.core.namedparam.SqlParameterSource;

@ExtendWith(MockitoExtension.class)
class EcountEmployeeCardImporterTest {

    @Mock private NamedParameterJdbcTemplate jdbcTemplate;
    private EcountEmployeeCardImporter importer;

    @BeforeEach
    void setUp() {
        importer = new EcountEmployeeCardImporter(jdbcTemplate);
        lenient().when(jdbcTemplate.queryForObject(anyString(), any(SqlParameterSource.class), eq(Object.class)))
                .thenReturn(null);
        lenient().when(jdbcTemplate.queryForObject(anyString(), any(SqlParameterSource.class), eq(Integer.class)))
                .thenReturn(0);
        lenient().when(jdbcTemplate.queryForObject(anyString(), any(SqlParameterSource.class), eq(Long.class)))
                .thenReturn(1L);
        lenient().when(jdbcTemplate.queryForObject(anyString(), any(SqlParameterSource.class), eq(UUID.class)))
                .thenReturn(UUID.fromString("00000000-0000-0000-0000-000000006301"));
        lenient().when(jdbcTemplate.update(anyString(), any(SqlParameterSource.class))).thenReturn(1);
    }

    @Test
    void 주민등록번호는_적재_시점에_마스킹한다() {
        EcountMig6ImportResult result = importer.importCsv(stream(csv(row("00009", "사원A", "740114-1030932", "영업부", "2024/07/23"))), "tester");

        assertThat(result.imported()).isEqualTo(1);
        ArgumentCaptor<SqlParameterSource> params = ArgumentCaptor.forClass(SqlParameterSource.class);
        verify(jdbcTemplate, org.mockito.Mockito.atLeastOnce()).update(anyString(), params.capture());
        List<Object> residentNumbers = params.getAllValues().stream()
                .filter(p -> p.hasValue("residentNumberMasked"))
                .map(p -> p.getValue("residentNumberMasked"))
                .distinct()
                .toList();
        assertThat(residentNumbers).containsExactly("740114-1******");
    }

    @Test
    void raw_payload_컬럼은_주민등록번호_마스킹된_값만_포함한다() {
        importer.importCsv(stream(csv(row("00009", "사원A", "740114-1030932", "영업부", "2024/07/23"))), "tester");

        ArgumentCaptor<SqlParameterSource> params = ArgumentCaptor.forClass(SqlParameterSource.class);
        verify(jdbcTemplate, org.mockito.Mockito.atLeastOnce()).update(anyString(), params.capture());
        List<String> payloads = params.getAllValues().stream()
                .filter(p -> p.hasValue("payload"))
                .map(p -> (String) p.getValue("payload"))
                .toList();
        assertThat(payloads).isNotEmpty();
        assertThat(payloads).allSatisfy(payload -> {
            assertThat(payload).doesNotContain("740114-1030932");
            assertThat(payload).contains("740114-1******");
        });
    }

    @Test
    void insertRejectedStaging도_마스킹_적용() {
        importer.importCsv(stream(csv(row("00009", "사원A", "740114-1030932", "영업부", "2024-07-23"))), "tester");

        ArgumentCaptor<SqlParameterSource> params = ArgumentCaptor.forClass(SqlParameterSource.class);
        verify(jdbcTemplate, org.mockito.Mockito.atLeastOnce()).update(anyString(), params.capture());
        List<String> payloads = params.getAllValues().stream()
                .filter(p -> p.hasValue("payload"))
                .map(p -> (String) p.getValue("payload"))
                .toList();
        assertThat(payloads).isNotEmpty();
        assertThat(payloads).allSatisfy(payload -> {
            assertThat(payload).doesNotContain("740114-1030932");
            assertThat(payload).contains("740114-1******");
        });
    }

    @Test
    void 주민등록번호_placeholder도_평문이_아닌_placeholder_마스킹으로_보존한다() {
        EcountMig6ImportResult result = importer.importCsv(stream(csv(row("00009", "사원A", "XXXXXX-XXXXXXX", "영업부", "2024/07/23"))), "tester");

        assertThat(result.imported()).isEqualTo(1);
    }

    @Test
    void 입사일자_invalid는_MIG6_DATE_INVALID로_reject한다() {
        EcountMig6ImportResult result = importer.importCsv(stream(csv(row("00009", "사원A", "740114-1030932", "영업부", "2024-07-23"))), "tester");

        assertThat(result.rejectedSample()).extracting(EcountMig6ImportResult.RejectedRow::errorCode)
                .containsExactly("MIG6_DATE_INVALID");
    }

    @Test
    void maskResidentNumber_필수_예시() {
        assertThat(EcountEmployeeCardImporter.maskResidentNumber("740114-1030932"))
                .isEqualTo("740114-1******");
    }

    @Test
    void BOM_INPUT() {
        EcountMig6ImportResult result = importer.importCsv(stream("\uFEFF" + csv(row("00009", "사원A", "XXXXXX-XXXXXXX", "영업부", "2024/07/23"))), "tester");

        assertThat(result.imported()).isEqualTo(1);
    }

    @Test
    void multi_row_source_row_no는_데이터행_기준_1부터_증가한다() {
        importer.importCsv(stream(csv(
                row("00009", "사원A", "XXXXXX-XXXXXXX", "영업부", "2024/07/23")
                        + row("00010", "사원B", "XXXXXX-XXXXXXX", "영업부", "2024/07/24"))), "tester");

        ArgumentCaptor<SqlParameterSource> params = ArgumentCaptor.forClass(SqlParameterSource.class);
        verify(jdbcTemplate, org.mockito.Mockito.atLeastOnce()).update(anyString(), params.capture());
        List<Integer> rows = params.getAllValues().stream()
                .filter(p -> p.hasValue("row"))
                .map(p -> (Integer) p.getValue("row"))
                .distinct()
                .toList();
        assertThat(rows).containsExactly(1, 2);
    }

    @Test
    void 멱등_재import는_skip으로_처리한다() {
        when(jdbcTemplate.update(anyString(), any(SqlParameterSource.class))).thenReturn(0);

        EcountMig6ImportResult result = importer.importCsv(stream(csv(row("00009", "사원A", "XXXXXX-XXXXXXX", "영업부", "2024/07/23"))), "tester");

        assertThat(result.skipped()).isEqualTo(1);
    }

    @Test
    void 사원_lookup_miss는_MIG6_LOOKUP_MISS로_reject한다() {
        when(jdbcTemplate.queryForObject(contains("SELECT id FROM employees"), any(SqlParameterSource.class), eq(UUID.class)))
                .thenThrow(new EmptyResultDataAccessException(1));

        EcountMig6ImportResult result = importer.importCsv(stream(csv(row("00009", "사원A", "XXXXXX-XXXXXXX", "영업부", "2024/07/23"))), "tester");

        assertThat(result.rejectedSample()).extracting(EcountMig6ImportResult.RejectedRow::errorCode)
                .containsExactly("MIG6_LOOKUP_MISS");
    }

    @Test
    void employee_card_duplicate는_CONFLICT로_reject한다() {
        when(jdbcTemplate.queryForObject(contains("INSERT INTO employee_cards"), any(SqlParameterSource.class), eq(UUID.class)))
                .thenThrow(new DuplicateKeyException("dup"));

        EcountMig6ImportResult result = importer.importCsv(stream(csv(row("00009", "사원A", "XXXXXX-XXXXXXX", "영업부", "2024/07/23"))), "tester");

        assertThat(result.rejectedSample()).extracting(EcountMig6ImportResult.RejectedRow::errorCode)
                .containsExactly("CONFLICT");
    }

    @Test
    void 부서명_lookup_miss는_MIG6_LOOKUP_MISS_reject() {
        when(jdbcTemplate.queryForObject(contains("SELECT COUNT(*)"), any(SqlParameterSource.class), eq(Long.class)))
                .thenReturn(0L);

        EcountMig6ImportResult result = importer.importCsv(stream(csv(row("00009", "사원A", "XXXXXX-XXXXXXX", "영업부", "2024/07/23"))), "tester");

        assertThat(result.rejectedSample()).extracting(EcountMig6ImportResult.RejectedRow::errorCode)
                .containsExactly("MIG6_LOOKUP_MISS");
    }

    @Test
    void 부서명_중복은_MIG6_LOOKUP_AMBIGUOUS_reject() {
        when(jdbcTemplate.queryForObject(contains("SELECT COUNT(*)"), any(SqlParameterSource.class), eq(Long.class)))
                .thenReturn(2L);

        EcountMig6ImportResult result = importer.importCsv(stream(csv(row("00009", "사원A", "XXXXXX-XXXXXXX", "영업부", "2024/07/23"))), "tester");

        assertThat(result.rejectedSample()).extracting(EcountMig6ImportResult.RejectedRow::errorCode)
                .containsExactly("MIG6_LOOKUP_AMBIGUOUS");
    }

    @Test
    void 동일_source_file_안_business_key_중복은_DUPLICATE_reject() {
        EcountMig6ImportResult result = importer.importCsv(stream(csv(
                row("00009", "사원A", "XXXXXX-XXXXXXX", "영업부", "2024/07/23")
                        + row("00009", "사원A-중복", "XXXXXX-XXXXXXX", "영업부", "2024/07/24"))), "tester");

        assertThat(result.imported()).isEqualTo(1);
        assertThat(result.rejectedSample()).extracting(EcountMig6ImportResult.RejectedRow::errorCode)
                .containsExactly("MIG6_EMPLOYEE_CODE_DUPLICATE");
    }

    static InputStream stream(String csv) {
        return new ByteArrayInputStream(csv.getBytes(StandardCharsets.UTF_8));
    }

    static String csv(String rows) {
        return """
                "회사명 : (주)삼한공조시스템"
                "사원번호\t","성명\t","주민등록번호\t","부서명\t","직위/직급명\t","입사일자\t","계좌번호\t","Email\t",""
                """ + rows;
    }

    static String row(String code, String name, String resident, String department, String hireDate) {
        return "\"%s\t\",\"%s\t\",\"%s\t\",\"%s\t\",\"사원\t\",\"%s\t\",\"\",\"\",\"\"\n"
                .formatted(code, name, resident, department, hireDate);
    }
}
