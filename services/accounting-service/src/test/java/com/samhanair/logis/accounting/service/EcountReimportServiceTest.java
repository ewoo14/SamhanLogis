package com.samhanair.logis.accounting.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;

import com.samhanair.logis.accounting.client.EcountRemoteImportClient;
import com.samhanair.logis.common.ecount.EcountMig8TransformResult;
import com.samhanair.logis.common.ecount.EcountReimportResult;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;

@ExtendWith(MockitoExtension.class)
class EcountReimportServiceTest {

    @TempDir Path rawDir;

    @Mock private NamedParameterJdbcTemplate jdbcTemplate;
    @Mock private EcountRemoteImportClient remoteImportClient;
    @Mock private EcountAccountImporter accountImporter;
    @Mock private EcountCardImporter cardImporter;
    @Mock private EcountPurchaseSlipImporter purchaseSlipImporter;
    @Mock private EcountSalesSlipImporter salesSlipImporter;
    @Mock private EcountGeneralVoucherImporter generalVoucherImporter;
    @Mock private EcountJournalEntryImporter journalEntryImporter;
    @Mock private EcountTaxInvoiceImporter taxInvoiceImporter;
    @Mock private EcountSalesSlipLineImporter salesSlipLineImporter;
    @Mock private EcountSalesPurchaseSummaryImporter salesPurchaseSummaryImporter;
    @Mock private EcountOrderImporter orderImporter;
    @Mock private EcountExpenseVoucherImporter expenseVoucherImporter;
    @Mock private EcountDepositReportImporter depositReportImporter;
    @Mock private EcountBankAccountImporter bankAccountImporter;
    @Mock private EcountFixedAssetTypeImporter fixedAssetTypeImporter;
    @Mock private EcountSalesLedgerImporter salesLedgerImporter;
    @Mock private EcountPurchaseLedgerImporter purchaseLedgerImporter;
    @Mock private Mig7CashDisbursementTransformService cashDisbursementTransformService;
    @Mock private Mig7CashReceiptTransformService cashReceiptTransformService;
    @Mock private Mig8OrderTransformService orderTransformService;
    @Mock private Mig9CashJournalService cashJournalService;
    @Mock private Mig9AgingSnapshotRefreshService agingSnapshotRefreshService;
    @Mock private Mig10OrderEmployeeBackfillService orderEmployeeBackfillService;

    @Test
    void productReimport_동일Timestamp의_relation_group만_multipart에_묶는다() throws Exception {
        Path item = write("품목-Excel다운로드_202605.csv", "item");
        Path staleRelation = write("품목관계-Excel다운로드_202604.csv", "stale-relation");
        Path relation = write("품목관계-Excel다운로드_202605.csv", "relation");
        Path group = write("품목계층그룹-Excel다운로드_202605.csv", "group");

        when(jdbcTemplate.queryForObject(anyString(), any(MapSqlParameterSource.class), eq(Integer.class)))
                .thenReturn(0);
        when(jdbcTemplate.update(anyString(), any(MapSqlParameterSource.class))).thenReturn(1);
        when(remoteImportClient.importFile(eq("product-service"), eq("/admin/products/imports/ecount"),
                any(), eq("tester"))).thenReturn(new EcountRemoteImportClient.RemoteImportResult(3, 0, null));

        EcountReimportResult result = service().reimportSlice("mig-2", "tester");

        @SuppressWarnings("unchecked")
        ArgumentCaptor<Map<String, Path>> partsCaptor = ArgumentCaptor.forClass(Map.class);
        org.mockito.Mockito.verify(remoteImportClient).importFile(eq("product-service"),
                eq("/admin/products/imports/ecount"), partsCaptor.capture(), eq("tester"));

        Map<String, Path> parts = partsCaptor.getValue();
        assertThat(parts.get("itemFile")).isEqualTo(item);
        assertThat(parts.get("relationFile")).isEqualTo(relation);
        assertThat(parts.get("relationFile")).isNotEqualTo(staleRelation);
        assertThat(parts.get("groupFile")).isEqualTo(group);
        assertThat(result.filesProcessed()).isEqualTo(1);
    }

    @Test
    void productReimport_relation만_변경되어도_합산Hash가_달라진다() throws Exception {
        write("품목-Excel다운로드_202605.csv", "item");
        Path relation = write("품목관계-Excel다운로드_202605.csv", "relation-v1");
        write("품목계층그룹-Excel다운로드_202605.csv", "group");

        when(jdbcTemplate.queryForObject(anyString(), any(MapSqlParameterSource.class), eq(Integer.class)))
                .thenReturn(0);
        when(jdbcTemplate.update(anyString(), any(MapSqlParameterSource.class))).thenReturn(1);
        when(remoteImportClient.importFile(eq("product-service"), eq("/admin/products/imports/ecount"),
                any(), eq("tester"))).thenReturn(new EcountRemoteImportClient.RemoteImportResult(3, 0, null));

        EcountReimportService service = service();
        service.reimportSlice("mig-2", "tester");
        Files.writeString(relation, "relation-v2");
        service.reimportSlice("mig-2", "tester");

        ArgumentCaptor<MapSqlParameterSource> paramsCaptor = ArgumentCaptor.forClass(MapSqlParameterSource.class);
        org.mockito.Mockito.verify(jdbcTemplate, org.mockito.Mockito.times(2))
                .update(anyString(), paramsCaptor.capture());

        String firstHash = (String) paramsCaptor.getAllValues().get(0).getValue("hash");
        String secondHash = (String) paramsCaptor.getAllValues().get(1).getValue("hash");
        assertThat(secondHash).isNotEqualTo(firstHash);
    }

    @Test
    void reimport_records_only_reimport_metrics_not_delegated_import_totals() throws Exception {
        write("품목-Excel다운로드_202605.csv", "item");
        write("품목관계-Excel다운로드_202605.csv", "relation");
        write("품목계층그룹-Excel다운로드_202605.csv", "group");
        SimpleMeterRegistry registry = new SimpleMeterRegistry();

        when(jdbcTemplate.queryForObject(anyString(), any(MapSqlParameterSource.class), eq(Integer.class)))
                .thenReturn(0);
        when(jdbcTemplate.update(anyString(), any(MapSqlParameterSource.class))).thenReturn(1);
        when(remoteImportClient.importFile(eq("product-service"), eq("/admin/products/imports/ecount"),
                any(), eq("tester"))).thenReturn(new EcountRemoteImportClient.RemoteImportResult(3, 2, null));

        service(registry).reimportSlice("mig-2", "tester");

        assertThat(registry.counter("ecount_reimport_files_scanned", "slice", "mig-2").count()).isEqualTo(1);
        assertThat(registry.counter("ecount_reimport_runs", "slice", "mig-2", "status", "SUCCESS").count())
                .isEqualTo(1);
        assertThat(registry.find("ecount_mig_imported").counter()).isNull();
        assertThat(registry.find("ecount_mig_transform_status").counter()).isNull();
        assertThat(registry.find("ecount_mig_rejected").counter()).isNull();
    }

    @Test
    void mig8_거부_sample이_관리자_응답의_errors로_전달되고_상세상태가_남는다() {
        SimpleMeterRegistry registry = new SimpleMeterRegistry();
        EcountMig8TransformResult transform = new EcountMig8TransformResult(
                2, 1, 0, 0, 1, 0,
                List.of(new EcountMig8TransformResult.Sample(
                        17, "ERROR", "MIG8_LOOKUP_MISS",
                        "품목 alias lookup miss: sourceRowNo=17, itemName='없는품목 [규격]'",
                        "2026-05-20-001", "없는품목")));
        when(orderTransformService.transformFromStaging(any(Integer.class), eq("tester")))
                .thenReturn(transform);

        EcountReimportResult result = service(registry).reimportSlice("mig-8", "tester");

        assertThat(result.details()).singleElement()
                .extracting(EcountReimportResult.SliceResult::status)
                .isEqualTo("PROCESSED_WITH_REJECTIONS");
        assertThat(result.errors()).singleElement()
                .extracting(EcountReimportResult.ErrorSample::message)
                .asString()
                .contains("sourceRowNo=17", "없는품목 [규격]");
        assertThat(registry.counter("ecount_reimport_runs", "slice", "mig-8", "status", "FAIL").count())
                .isEqualTo(1);
        assertThat(registry.counter("ecount_reimport_runs", "slice", "mig-8", "status", "SUCCESS").count())
                .isZero();
    }

    @Test
    void mig8_거부_상세는_20건을_초과해도_모두_관리자_응답에_남는다() {
        EcountMig8TransformResult.Builder builder = EcountMig8TransformResult.builder(21);
        for (int rowNumber = 1; rowNumber <= 21; rowNumber++) {
            builder.reject(rowNumber, "MIG8_LOOKUP_MISS", "lookup miss",
                    "ORDER-" + rowNumber, "품목-" + rowNumber);
        }
        when(orderTransformService.transformFromStaging(any(Integer.class), eq("tester")))
                .thenReturn(builder.build());

        EcountReimportResult result = service().reimportSlice("mig-8", "tester");

        assertThat(result.errors()).hasSize(21);
        assertThat(result.errors().get(20).message()).contains("sourceRowNo=21", "품목-21");
    }

    private Path write(String fileName, String content) throws Exception {
        Path file = rawDir.resolve(fileName);
        Files.writeString(file, content);
        return file;
    }

    private EcountReimportService service() {
        return service(new SimpleMeterRegistry());
    }

    private EcountReimportService service(SimpleMeterRegistry registry) {
        return new EcountReimportService(rawDir.toString(), jdbcTemplate, remoteImportClient,
                accountImporter, cardImporter, purchaseSlipImporter, salesSlipImporter,
                generalVoucherImporter, journalEntryImporter, taxInvoiceImporter, salesSlipLineImporter,
                salesPurchaseSummaryImporter, orderImporter, expenseVoucherImporter, depositReportImporter,
                bankAccountImporter, fixedAssetTypeImporter, salesLedgerImporter, purchaseLedgerImporter,
                cashDisbursementTransformService, cashReceiptTransformService, orderTransformService,
                cashJournalService, agingSnapshotRefreshService, orderEmployeeBackfillService,
                new MigOpsMetricsRecorder(registry));
    }
}
