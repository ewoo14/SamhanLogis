package com.samhanair.logis.product.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.when;

import com.samhanair.logis.product.web.dto.EcountProductImportResult;
import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.ArgumentCaptor;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.jdbc.core.namedparam.SqlParameterSource;

/** PR #984 HIGH-1 RED: 순번코드 동명 raw 그룹이 후보 판정 실패로 누락되는 경로. */
@ExtendWith(MockitoExtension.class)
class EcountProductImporterSameNameMergeTest {

    private static final UUID PRODUCT_ID = UUID.fromString("00000000-0000-0000-0000-000000000984");

    @Mock
    private NamedParameterJdbcTemplate jdbcTemplate;

    @InjectMocks
    private EcountProductImporter importer;

    @BeforeEach
    void setUp() {
        lenient().when(jdbcTemplate.queryForObject(anyString(), any(SqlParameterSource.class), eq(Integer.class)))
                .thenReturn(0);
        lenient().when(jdbcTemplate.queryForObject(anyString(), any(SqlParameterSource.class), eq(UUID.class)))
                .thenReturn(PRODUCT_ID);
        lenient().when(jdbcTemplate.queryForList(anyString(), any(SqlParameterSource.class), eq(String.class)))
                .thenReturn(List.of());
        lenient().when(jdbcTemplate.queryForList(anyString(), any(SqlParameterSource.class), eq(UUID.class)))
                .thenAnswer(invocation -> {
                    String sql = invocation.getArgument(0);
                    if (sql.contains("is_deleted = TRUE")) {
                        return List.of();
                    }
                    return sql.contains("SELECT id") ? List.of(PRODUCT_ID) : List.of();
                });
        lenient().when(jdbcTemplate.update(anyString(), any(SqlParameterSource.class))).thenReturn(1);
    }

    @Test
    void 같은_품목명_순번코드_그룹은_대표후보_실패로_누락되지_않고_한_품목과_alias로_병합된다() {
        EcountProductImportResult result = importer.importCsv(
                itemCsv(
                        row("AAAA-00004", "삼성추가배관(벽걸이)", "0", "12,277", "10평이하"),
                        row("AAAA-00005", "삼성추가배관(벽걸이)", "0", "13,914", "30평이하")),
                null, null, "high-1-red");

        assertThat(result.imported()).isEqualTo(1);
        assertThat(result.aliasImported()).isEqualTo(2);
        assertThat(result.skippedGroupCount()).isZero();
    }

    @Test
    void modelName_merge_update는_두_유니크_충돌을_조건부로_피하고_중복_assignment를_만들지_않는다() {
        when(jdbcTemplate.queryForList(argThat(sql -> sql.contains("UPDATE products p")),
                any(SqlParameterSource.class), eq(UUID.class)))
                .thenReturn(List.of(PRODUCT_ID));
        ArgumentCaptor<String> sqlCaptor = ArgumentCaptor.forClass(String.class);

        importer.importCsv(
                itemCsv(row("MERGE-984", "기존 시트 품목", "100,000", "70,000", "규격")),
                null, null, "high-1-sql");

        org.mockito.Mockito.verify(jdbcTemplate, org.mockito.Mockito.atLeastOnce()).queryForList(
                sqlCaptor.capture(), any(SqlParameterSource.class), eq(UUID.class));
        String updateSql = sqlCaptor.getAllValues().stream()
                .filter(sql -> sql.contains("UPDATE products p"))
                .findFirst()
                .orElseThrow();
        assertThat(updateSql.split("outdoor_price =", -1).length - 1).isOne();
        assertThat(updateSql).contains("NOT EXISTS")
                .contains("product_code = :code")
                .contains("model_code = :code")
                .contains("p.lineage = 'SHEET'");
    }

    private static InputStream itemCsv(String... rows) {
        String header = Arrays.stream(EcountProductImporter.ITEM_HEADERS)
                .map(value -> "\"" + value + "\"")
                .collect(Collectors.joining(","));
        return stream("\"데이터관리>품목-Excel다운로드\"\n"
                + header + "\n"
                + String.join("\n", rows) + "\n");
    }

    private static String row(String code, String name, String outbound, String inbound, String specification) {
        String[] cells = {code, name, outbound, inbound, "", "", "0", "0", "0", "0", "[상품]", specification, "YES"};
        return Arrays.stream(cells)
                .map(value -> "\"" + value.replace("\"", "\"\"") + "\"")
                .collect(Collectors.joining(","));
    }

    private static InputStream stream(String csv) {
        return new ByteArrayInputStream(csv.getBytes(StandardCharsets.UTF_8));
    }
}
