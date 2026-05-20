package com.samhanair.logis.user.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.verify;

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
