package com.samhanair.logis.inventory.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.samhanair.logis.common.ecount.EcountMig5ImportResult;
import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.sql.ResultSet;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.jdbc.core.namedparam.SqlParameterSource;

/** MIG-5 창고이동 importer behavior 회귀 가드. */
@ExtendWith(MockitoExtension.class)
class EcountStockTransferImporterTest {

    @Mock private NamedParameterJdbcTemplate jdbcTemplate;

    private EcountStockTransferImporter importer;

    @BeforeEach
    void setUp() {
        importer = new EcountStockTransferImporter(jdbcTemplate);
        lenient().when(jdbcTemplate.queryForObject(anyString(), any(SqlParameterSource.class), eq(Object.class)))
                .thenReturn(null);
        lenient().when(jdbcTemplate.queryForObject(anyString(), any(SqlParameterSource.class), eq(UUID.class)))
                .thenReturn(UUID.randomUUID());
        lenient().when(jdbcTemplate.update(anyString(), any(SqlParameterSource.class))).thenReturn(1);
        stubLookupRows(false, false, false);
    }

    @Test
    void 정상_1건_적재() {
        EcountMig5ImportResult result = importer.importCsv(stream(stockCsv(row("2026/05/02 -1", "품목A", "2", ""))), "tester");

        assertThat(result.imported()).isEqualTo(1);
        assertThat(result.rejected()).isZero();
    }

    @Test
    void 동일_transferNo_다중_line_group() {
        EcountMig5ImportResult result = importer.importCsv(stream(stockCsv(
                row("2026/05/02 -1", "품목A", "2", "") +
                row("2026/05/02 -1", "품목B", "1", "10,000"))), "tester");

        assertThat(result.imported()).isEqualTo(2);
        assertThat(result.rejected()).isZero();
    }

    @Test
    void warehouse_lookup_miss는_MIG5_LOOKUP_MISS() {
        stubLookupRows(true, false, false);

        EcountMig5ImportResult result = importer.importCsv(stream(stockCsv(row("2026/05/02 -1", "품목A", "2", ""))), "tester");

        assertThat(result.rejected()).isEqualTo(1);
        assertThat(result.rejectedSample()).extracting(EcountMig5ImportResult.RejectedRow::errorCode)
                .containsExactly("MIG5_LOOKUP_MISS");
    }

    @Test
    void product_lookup_miss는_MIG5_LOOKUP_MISS() {
        stubLookupRows(false, true, false);

        EcountMig5ImportResult result = importer.importCsv(stream(stockCsv(row("2026/05/02 -1", "품목A", "2", ""))), "tester");

        assertThat(result.rejected()).isEqualTo(1);
        assertThat(result.rejectedSample()).extracting(EcountMig5ImportResult.RejectedRow::rawValue)
                .containsExactly("품목A");
    }

    @Test
    void 금액_또는_수량_음수는_MIG5_AMOUNT_INVALID() {
        EcountMig5ImportResult result = importer.importCsv(stream(stockCsv(row("2026/05/02 -1", "품목A", "-1", ""))), "tester");

        assertThat(result.rejectedSample()).extracting(EcountMig5ImportResult.RejectedRow::errorCode)
                .containsExactly("MIG5_AMOUNT_INVALID");
    }

    @Test
    void 일자_No_불일치는_MIG5_DATE_INVALID() {
        EcountMig5ImportResult result = importer.importCsv(stream(stockCsv(row("bad-date", "품목A", "2", ""))), "tester");

        assertThat(result.rejectedSample()).extracting(EcountMig5ImportResult.RejectedRow::errorCode)
                .containsExactly("MIG5_DATE_INVALID");
    }

    @Test
    void BOM_INPUT을_정상_strip한다() {
        EcountMig5ImportResult result = importer.importCsv(stream("\uFEFF" + stockCsv(row("2026/05/02 -1", "품목A", "2", ""))), "tester");

        assertThat(result.imported()).isEqualTo(1);
    }

    @Test
    void LOOKUP_MAP_IDEMPOTENT_staging_conflict는_skip한다() {
        when(jdbcTemplate.update(anyString(), any(SqlParameterSource.class))).thenAnswer(invocation -> {
            String sql = invocation.getArgument(0);
            return sql.contains("INSERT INTO staging.ecount_stock_transfer_raw")
                    && !sql.contains("'REJECTED'") ? 0 : 1;
        });

        EcountMig5ImportResult result = importer.importCsv(stream(stockCsv(row("2026/05/02 -1", "품목A", "2", ""))), "tester");

        assertThat(result.skipped()).isEqualTo(1);
        assertThat(result.imported()).isZero();
    }

    @Test
    void soft_deleted_복구_CTE는_updated로_보고한다() {
        stubLookupRows(false, false, true);

        EcountMig5ImportResult result = importer.importCsv(stream(stockCsv(row("2026/05/02 -1", "품목A", "2", ""))), "tester");

        assertThat(result.updated()).isEqualTo(1);
    }

    @Test
    void rawHeaderCrossCheck() {
        EcountMig5ImportResult result = importer.importCsv(stream(stockCsv(row("2026/05/02 -1", "품목A", "2", ""))), "tester");

        assertThat(result.totalRows()).isEqualTo(1);
    }

    @SuppressWarnings({"rawtypes", "unchecked"})
    private void stubLookupRows(boolean warehouseMiss, boolean productMiss, boolean existingTransfer) {
        lenient().when(jdbcTemplate.query(anyString(), any(SqlParameterSource.class), any(RowMapper.class)))
                .thenAnswer(invocation -> {
                    String sql = invocation.getArgument(0);
                    RowMapper mapper = invocation.getArgument(2);
                    if (sql.contains("staging.ecount_warehouse_map")) {
                        if (warehouseMiss) {
                            return List.of();
                        }
                        ResultSet rs = mock(ResultSet.class);
                        SqlParameterSource params = invocation.getArgument(1);
                        String name = String.valueOf(params.getValue("name"));
                        when(rs.getObject("warehouse_uuid")).thenReturn(
                                name.contains("입고") ? UUID.fromString("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2")
                                        : UUID.fromString("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1"));
                        return List.of(mapper.mapRow(rs, 0));
                    }
                    if (sql.contains("staging.ecount_item_alias")) {
                        if (productMiss) {
                            return List.of();
                        }
                        ResultSet rs = mock(ResultSet.class);
                        when(rs.getObject("main_product_uuid"))
                                .thenReturn(UUID.fromString("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"));
                        return List.of(mapper.mapRow(rs, 0));
                    }
                    if (sql.contains("FROM stock_transfers")) {
                        if (!existingTransfer) {
                            return List.of();
                        }
                        ResultSet rs = mock(ResultSet.class);
                        when(rs.getObject("id")).thenReturn(UUID.fromString("cccccccc-cccc-cccc-cccc-cccccccccccc"));
                        when(rs.getBoolean("is_deleted")).thenReturn(true);
                        return List.of(mapper.mapRow(rs, 0));
                    }
                    return List.of();
                });
    }

    private static InputStream stream(String csv) {
        return new ByteArrayInputStream(csv.getBytes(StandardCharsets.UTF_8));
    }

    private static String stockCsv(String rows) {
        return """
                "데이터관리>창고이동-Excel다운로드"
                "일자-No.\t","출고창고명\t","입고창고명\t","품목명[규격]\t","수량\t","금액(수량*입고단가)\t","적요\t",""
                """ + rows;
    }

    private static String row(String transferNo, String itemName, String quantity, String amount) {
        return "\"%s\t\",\"출고창고\t\",\"입고창고\t\",\"%s\t\",\"%s\",\"%s\",\"메모\t\",\"\"\n"
                .formatted(transferNo, itemName, quantity, amount);
    }
}

