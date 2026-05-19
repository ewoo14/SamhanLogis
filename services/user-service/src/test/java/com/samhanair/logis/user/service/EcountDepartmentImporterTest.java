package com.samhanair.logis.user.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;

import com.samhanair.logis.user.web.dto.EcountDepartmentImportResult;
import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
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

    private static InputStream stream(String csv) {
        return new ByteArrayInputStream(csv.getBytes(StandardCharsets.UTF_8));
    }
}
