package com.samhanair.logis.inventory.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;

import com.samhanair.logis.inventory.web.dto.EcountWarehouseImportResult;
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
    }

    @Test
    void importCsv_창고코드_정상과_placeholder를_분류한다() {
        String csv = """
                "데이터관리>창고-Excel다운로드"
                "창고코드\t","창고명\t","구분\t","생산공정명\t","외주거래처명\t","사용\t","추가사업장명\t",""
                "00001\t","위니아-일산서부\t","창고\t","\t","\t","Yes\t","(주)삼한공조시스템\t",""
                "0000\t","placeholder\t","창고\t","\t","\t","Yes\t","(주)삼한공조시스템\t",""
                """;

        EcountWarehouseImportResult result = importer.importCsv(stream(csv), "tester");

        assertThat(result.imported()).isEqualTo(1);
        assertThat(result.skippedPlaceholder()).isEqualTo(1);
    }

    private static InputStream stream(String csv) {
        return new ByteArrayInputStream(csv.getBytes(StandardCharsets.UTF_8));
    }
}
