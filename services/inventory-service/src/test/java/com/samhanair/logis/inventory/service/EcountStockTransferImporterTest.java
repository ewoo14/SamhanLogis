package com.samhanair.logis.inventory.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.atLeast;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.samhanair.logis.common.ecount.EcountMig5ImportResult;
import com.samhanair.logis.inventory.client.ProductLookupClient;
import com.samhanair.logis.inventory.client.ProductSummary;
import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.sql.ResultSet;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.jdbc.core.namedparam.SqlParameterSource;

/** MIG-5 창고이동 importer behavior 회귀 가드. */
@ExtendWith(MockitoExtension.class)
class EcountStockTransferImporterTest {

    @Mock private NamedParameterJdbcTemplate jdbcTemplate;
    @Mock private ProductLookupClient productLookupClient;

    private EcountStockTransferImporter importer;

    @BeforeEach
    void setUp() {
        importer = new EcountStockTransferImporter(jdbcTemplate, productLookupClient);
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
    void 동일_transferNo_두번째_active는_lineAdded로_집계한다() {
        stubLookupRowsWithTransferLookupSequence(false, false, false, true);

        EcountMig5ImportResult result = importer.importCsv(stream(stockCsv(
                row("2026/05/02 -1", "품목A", "2", "") +
                row("2026/05/02 -1", "품목B", "1", "10,000"))), "tester");

        assertThat(result.imported()).isEqualTo(1);
        assertThat(result.lineAdded()).isEqualTo(1);
        assertThat(result.updated()).isZero();
    }

    @Test
    void 창고_lookup_miss는_MIG5_WAREHOUSE_LOOKUP_MISS_와_창고명_sample_반환() {
        stubLookupRows(true, false, false);

        EcountMig5ImportResult result = importer.importCsv(stream(stockCsv(row("2026/05/02 -1", "품목A", "2", ""))), "tester");

        assertThat(result.rejected()).isEqualTo(1);
        assertThat(result.rejectedSample()).extracting(EcountMig5ImportResult.RejectedRow::errorCode)
                .containsExactly("MIG5_WAREHOUSE_LOOKUP_MISS");
        assertThat(result.rejectedSample()).extracting(EcountMig5ImportResult.RejectedRow::rawValue)
                .containsExactly("출고창고");
    }

    @Test
    void 품목_lookup_miss는_MIG5_PRODUCT_LOOKUP_MISS_와_품목명_sample_반환() {
        stubLookupRows(false, true, false);

        EcountMig5ImportResult result = importer.importCsv(stream(stockCsv(row("2026/05/02 -1", "품목A", "2", ""))), "tester");

        assertThat(result.rejected()).isEqualTo(1);
        assertThat(result.rejectedSample()).extracting(EcountMig5ImportResult.RejectedRow::errorCode)
                .containsExactly("MIG5_PRODUCT_LOOKUP_MISS");
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
    void amount_컬럼_파싱오류는_amount_raw_값을_sample_반환() {
        EcountMig5ImportResult result = importer.importCsv(stream(stockCsv(row("2026/05/02 -1", "품목A", "2", "BAD-AMOUNT"))), "tester");

        assertThat(result.rejectedSample()).extracting(EcountMig5ImportResult.RejectedRow::rawValue)
                .containsExactly("BAD-AMOUNT");
    }

    @Test
    void quantity_컬럼_파싱오류는_quantity_raw_값을_sample_반환() {
        EcountMig5ImportResult result = importer.importCsv(stream(stockCsv(row("2026/05/02 -1", "품목A", "BAD-QTY", ""))), "tester");

        assertThat(result.rejectedSample()).extracting(EcountMig5ImportResult.RejectedRow::rawValue)
                .containsExactly("BAD-QTY");
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
    void multi_row_source_row_no_는_1부터_증가한다() {
        importer.importCsv(stream(stockCsv(
                row("2026/05/02 -1", "품목A", "2", "") +
                row("2026/05/02 -2", "품목B", "1", "10,000") +
                row("2026/05/02 -3", "품목C", "3", ""))), "tester");

        ArgumentCaptor<String> sqlCaptor = ArgumentCaptor.forClass(String.class);
        ArgumentCaptor<SqlParameterSource> paramsCaptor = ArgumentCaptor.forClass(SqlParameterSource.class);
        verify(jdbcTemplate, atLeast(3)).update(sqlCaptor.capture(), paramsCaptor.capture());

        List<Integer> sourceRows = new java.util.ArrayList<>();
        for (int i = 0; i < sqlCaptor.getAllValues().size(); i++) {
            String sql = sqlCaptor.getAllValues().get(i);
            if (sql.contains("INSERT INTO staging.ecount_stock_transfer_raw")
                    && !sql.contains("'REJECTED'")) {
                sourceRows.add((Integer) paramsCaptor.getAllValues().get(i).getValue("row"));
            }
        }
        assertThat(sourceRows).containsExactly(1, 2, 3);
    }

    @SuppressWarnings({"rawtypes", "unchecked"})
    private void stubLookupRows(boolean warehouseMiss, boolean productMiss, boolean existingTransfer) {
        stubLookupRowsWithTransferLookupSequence(warehouseMiss, productMiss,
                existingTransfer ? TransferLookup.SOFT_DELETED : TransferLookup.MISSING);
    }

    private void stubLookupRowsWithTransferLookupSequence(boolean warehouseMiss, boolean productMiss,
                                                          boolean firstExists, boolean secondExists) {
        stubLookupRowsWithTransferLookupSequence(warehouseMiss, productMiss,
                firstExists ? TransferLookup.ACTIVE : TransferLookup.MISSING,
                secondExists ? TransferLookup.ACTIVE : TransferLookup.MISSING);
    }

    private void stubLookupRowsWithTransferLookupSequence(boolean warehouseMiss, boolean productMiss,
                                                          TransferLookup... transferLookupSequence) {
        transferLookupCallIndex = 0;
        lenient().when(productLookupClient.findByProductNameStrict(anyString()))
                .thenReturn(productMiss ? Optional.empty() : Optional.of(productSummary()));
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
                    if (sql.contains("FROM stock_transfers")) {
                        int callIndex = transferLookupCallIndex++;
                        TransferLookup lookup = transferLookupSequence.length == 0
                                ? TransferLookup.MISSING
                                : transferLookupSequence[Math.min(callIndex, transferLookupSequence.length - 1)];
                        if (lookup == TransferLookup.MISSING) {
                            return List.of();
                        }
                        ResultSet rs = mock(ResultSet.class);
                        when(rs.getObject("id")).thenReturn(UUID.fromString("cccccccc-cccc-cccc-cccc-cccccccccccc"));
                        when(rs.getBoolean("is_deleted")).thenReturn(lookup == TransferLookup.SOFT_DELETED);
                        return List.of(mapper.mapRow(rs, 0));
                    }
                    return List.of();
                });
    }

    private int transferLookupCallIndex;

    private enum TransferLookup {
        MISSING,
        ACTIVE,
        SOFT_DELETED
    }

    private static ProductSummary productSummary() {
        return new ProductSummary(UUID.fromString("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"),
                "품목A", "MODEL-A", UUID.fromString("dddddddd-dddd-dddd-dddd-dddddddddddd"),
                new BigDecimal("1000.00"), "ACTIVE");
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
