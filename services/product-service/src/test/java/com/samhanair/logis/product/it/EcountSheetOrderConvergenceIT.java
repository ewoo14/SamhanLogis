package com.samhanair.logis.product.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.when;

import com.samhanair.logis.product.ProductServiceApplication;
import com.samhanair.logis.product.client.GoogleSheetsClient;
import com.samhanair.logis.product.domain.EstimateCategory;
import com.samhanair.logis.product.domain.Product;
import com.samhanair.logis.product.domain.ProductCategory;
import com.samhanair.logis.product.domain.ProductLineage;
import com.samhanair.logis.product.domain.UsageScope;
import com.samhanair.logis.product.repository.ProductEstimateExposureRepository;
import com.samhanair.logis.product.repository.ProductRepository;
import com.samhanair.logis.product.service.EcountProductImporter;
import com.samhanair.logis.product.service.ProductSheetSyncService;
import com.samhanair.logis.product.web.dto.EcountProductImportResult;
import com.samhanair.logis.security.permission.DynamicPermissionClient;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.test.annotation.DirtiesContext;

/** ECOUNT 임포트와 시트 sync 순서가 품목 정본 상태를 바꾸지 않는지 검증한다. */
@SpringBootTest(classes = ProductServiceApplication.class, properties = {
        "app.scheduling.enabled=false",
        "google.sheets.sheet-id=test-sheet-id",
        "google.sheets.endpoint-override=http://localhost:0"
})
@DirtiesContext
class EcountSheetOrderConvergenceIT extends AbstractPostgresIT {

    @Autowired
    private EcountProductImporter importer;

    @Autowired
    private ProductSheetSyncService syncService;

    @Autowired
    private ProductRepository productRepository;

    @Autowired
    private ProductEstimateExposureRepository exposureRepository;

    @MockBean
    private GoogleSheetsClient sheetsClient;

    @MockBean
    private DynamicPermissionClient dynamicPermissionClient;

    @BeforeEach
    void resetState() throws Exception {
        syncService.clearHashCacheForTest();
        lenient().doNothing().when(sheetsClient).invalidateCache();
        lenient().when(sheetsClient.readSheetFormulas(anyString(), anyString())).thenReturn(List.of());
        lenient().when(sheetsClient.readSheetDisplay(anyString(), anyString())).thenReturn(List.of());
    }

    @Test
    void import_then_sync_then_reimport_converges_to_sheet_canonical_state() throws Exception {
        String modelCode = "ORDER_CONVERGENCE_IMPORT_SYNC_IMPORT";
        stubHomeMultiSheet(modelCode, "시트 정본명");

        importEcount(modelCode, "이카운트 최초명", "100,000", "70,000");
        syncService.syncAll();
        importEcount(modelCode, "이카운트 재임포트명", "120,000", "80,000");

        assertSheetCanonicalState(modelCode, "시트 정본명");
    }

    @Test
    void sync_then_import_converges_to_sheet_canonical_state() throws Exception {
        String modelCode = "ORDER_CONVERGENCE_SYNC_IMPORT";
        stubHomeMultiSheet(modelCode, "시트 정본명");

        syncService.syncAll();
        importEcount(modelCode, "이카운트 임포트명", "120,000", "80,000");

        assertSheetCanonicalState(modelCode, "시트 정본명");
    }

    @Test
    void import_then_sync_converges_to_sheet_canonical_state() throws Exception {
        String modelCode = "ORDER_CONVERGENCE_IMPORT_SYNC";
        stubHomeMultiSheet(modelCode, "시트 정본명");

        importEcount(modelCode, "이카운트 최초명", "100,000", "70,000");
        syncService.syncAll();

        assertSheetCanonicalState(modelCode, "시트 정본명");
    }

    private void importEcount(String modelCode, String ecountName, String outbound, String inbound) {
        EcountProductImportResult result = importer.importCsv(
                stream(itemCsv(modelCode, ecountName, outbound, inbound)), null, null, "t984-order-test");
        assertThat(result.skippedGroupCount()).isZero();
        assertThat(result.rejectedNullName()).isZero();
    }

    private void stubHomeMultiSheet(String modelCode, String sheetName) throws Exception {
        when(sheetsClient.readSheetDisplay("test-sheet-id", "홈멀티_단가인상!A1:Z"))
                .thenReturn(homeMultiRows(row(sheetName, modelCode, "", "150,000", "", "100,000")));
    }

    private void assertSheetCanonicalState(String modelCode, String expectedName) {
        Product product = productRepository.findByModelCodeAndIsDeletedFalse(modelCode).orElseThrow();
        assertThat(product.getName()).isEqualTo(expectedName);
        assertThat(product.getLineage()).isEqualTo(ProductLineage.SHEET);
        assertThat(product.getProductCategory()).isEqualTo(ProductCategory.HOME_MULTI);
        assertThat(product.getUsageScope()).isEqualTo(UsageScope.BOTH);
        assertThat(exposureRepository.findByProductIdAndEstimateCategoryAndIsDeletedFalse(
                product.getId(), EstimateCategory.HOME_MULTI)).isPresent();
    }

    private static java.io.InputStream stream(String csv) {
        return new java.io.ByteArrayInputStream(csv.getBytes(StandardCharsets.UTF_8));
    }

    private static String itemCsv(String code, String name, String outbound, String inbound) {
        return """
                "데이터관리>품목-Excel다운로드"
                "품목코드\t","품목명\t","출하가\t","입고단가\t","싱글\t","실외기(원형,스탠드)\t","멀티(50%)\t","멀티(48%)\t","멀티(45%)\t","단품(35%)\t","품목구분\t","규격명\t","사용구분\t"
                "__CODE__\t","__NAME__\t","__OUTBOUND__","__INBOUND__","","","0","0","","","[상품]\t","\t","YES\t"
                """.replace("__CODE__", code)
                .replace("__NAME__", name)
                .replace("__OUTBOUND__", outbound)
                .replace("__INBOUND__", inbound);
    }

    @SafeVarargs
    private static List<List<Object>> homeMultiRows(List<Object>... dataRows) {
        List<List<Object>> all = new ArrayList<>();
        all.add(List.of("품 명", "모델명", "비고", "출고가", "비고", "납품가"));
        for (List<Object> row : dataRows) {
            all.add(row);
        }
        return all;
    }

    private static List<Object> row(Object... values) {
        return List.of(values);
    }
}
