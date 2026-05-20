package com.samhanair.logis.accounting.service;

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
class EcountFixedAssetTypeImporterTest {

    @Mock private NamedParameterJdbcTemplate jdbcTemplate;
    private EcountFixedAssetTypeImporter importer;

    @BeforeEach
    void setUp() {
        importer = new EcountFixedAssetTypeImporter(jdbcTemplate);
        lenient().when(jdbcTemplate.queryForObject(anyString(), any(SqlParameterSource.class), eq(Object.class)))
                .thenReturn(null);
        lenient().when(jdbcTemplate.queryForObject(anyString(), any(SqlParameterSource.class), eq(Integer.class)))
                .thenReturn(0);
        lenient().when(jdbcTemplate.queryForObject(anyString(), any(SqlParameterSource.class), eq(UUID.class)))
                .thenReturn(UUID.fromString("00000000-0000-0000-0000-000000006501"));
        lenient().when(jdbcTemplate.update(anyString(), any(SqlParameterSource.class))).thenReturn(1);
    }

    @Test
    void 고정자산유형_정상_import() {
        EcountMig6ImportResult result = importer.importCsv(stream(csv(row("00001", "토지 806-14", "Yes"))), "tester");

        assertThat(result.imported()).isEqualTo(1);
        assertThat(result.rejected()).isZero();
    }

    @Test
    void 사용여부_unknown은_MIG6_BOOLEAN_FLAG_INVALID로_reject한다() {
        EcountMig6ImportResult result = importer.importCsv(stream(csv(row("00001", "토지", "unknown"))), "tester");

        assertThat(result.rejectedSample()).extracting(EcountMig6ImportResult.RejectedRow::errorCode)
                .containsExactly("MIG6_BOOLEAN_FLAG_INVALID");
    }

    @Test
    void BOM_INPUT() {
        EcountMig6ImportResult result = importer.importCsv(stream("\uFEFF" + csv(row("00001", "토지", "Yes"))), "tester");

        assertThat(result.imported()).isEqualTo(1);
    }

    static InputStream stream(String csv) {
        return new ByteArrayInputStream(csv.getBytes(StandardCharsets.UTF_8));
    }

    static String csv(String rows) {
        return """
                "데이터관리>고정자산유형-Excel다운로드"
                "고정자산유형코드\t","고정자산유형명\t","사용여부\t",""
                """ + rows;
    }

    static String row(String code, String name, String active) {
        return "\"%s\t\",\"%s\t\",\"%s\t\",\"\"\n".formatted(code, name, active);
    }
}
