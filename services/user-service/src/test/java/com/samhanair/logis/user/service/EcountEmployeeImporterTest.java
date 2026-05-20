package com.samhanair.logis.user.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;

import com.samhanair.logis.common.ecount.EcountMig6ImportResult;
import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.jdbc.core.namedparam.SqlParameterSource;

@ExtendWith(MockitoExtension.class)
class EcountEmployeeImporterTest {

    @Mock private NamedParameterJdbcTemplate jdbcTemplate;
    private EcountEmployeeImporter importer;

    @BeforeEach
    void setUp() {
        importer = new EcountEmployeeImporter(jdbcTemplate);
        lenient().when(jdbcTemplate.queryForObject(anyString(), any(SqlParameterSource.class), eq(Object.class)))
                .thenReturn(null);
        lenient().when(jdbcTemplate.queryForObject(anyString(), any(SqlParameterSource.class), eq(Integer.class)))
                .thenReturn(0);
        lenient().when(jdbcTemplate.queryForObject(anyString(), any(SqlParameterSource.class), eq(UUID.class)))
                .thenReturn(UUID.fromString("00000000-0000-0000-0000-000000006201"));
        lenient().when(jdbcTemplate.update(anyString(), any(SqlParameterSource.class))).thenReturn(1);
    }

    @Test
    void 회사명_meta_row_사원_정상_import() {
        EcountMig6ImportResult result = importer.importCsv(stream(csv(row("00001", "사원A", "010-1111-2222", "a@example.com", "Yes"))), "tester");

        assertThat(result.imported()).isEqualTo(1);
        assertThat(result.rejected()).isZero();
    }

    @Test
    void 사용값_unknown은_MIG6_BOOLEAN_FLAG_INVALID로_reject한다() {
        EcountMig6ImportResult result = importer.importCsv(stream(csv(row("00001", "사원A", "", "", "maybe"))), "tester");

        assertThat(result.rejectedSample()).extracting(EcountMig6ImportResult.RejectedRow::errorCode)
                .containsExactly("MIG6_BOOLEAN_FLAG_INVALID");
    }

    @Test
    void BOM_INPUT() {
        EcountMig6ImportResult result = importer.importCsv(stream("\uFEFF" + csv(row("00001", "사원A", "", "", "Yes"))), "tester");

        assertThat(result.imported()).isEqualTo(1);
    }

    static InputStream stream(String csv) {
        return new ByteArrayInputStream(csv.getBytes(StandardCharsets.UTF_8));
    }

    static String csv(String rows) {
        return """
                "회사명 : (주)삼한공조시스템"
                "사원(담당)코드\t","사원(담당)명\t","검색창내용\t","담당자연락처\t","담당자Email\t","사용\t",""
                """ + rows;
    }

    static String row(String code, String name, String phone, String email, String active) {
        return "\"%s\t\",\"%s\t\",\"\",\"%s\t\",\"%s\t\",\"%s\t\",\"\"\n"
                .formatted(code, name, phone, email, active);
    }
}
