package com.samhanair.logis.product.it;

import static org.assertj.core.api.Assertions.assertThat;

import com.samhanair.logis.product.ProductServiceApplication;
import com.samhanair.logis.product.domain.Category;
import com.samhanair.logis.product.domain.Product;
import com.samhanair.logis.product.domain.ProductCategory;
import com.samhanair.logis.product.domain.ProductType;
import com.samhanair.logis.product.domain.EstimateCategory;
import com.samhanair.logis.product.domain.UsageScope;
import com.samhanair.logis.product.repository.CategoryRepository;
import com.samhanair.logis.product.repository.ProductRepository;
import com.samhanair.logis.product.service.EcountProductImporter;
import com.samhanair.logis.product.web.dto.EcountProductImportResult;
import com.samhanair.logis.security.permission.DynamicPermissionClient;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.annotation.DirtiesContext;

/** Google Sheets sync가 만든 model_name-only 활성 품목과 MIG-2 병합 회귀 IT. */
@SpringBootTest(classes = ProductServiceApplication.class, properties = "app.scheduling.enabled=false")
@DirtiesContext
class EcountProductImporterIT extends AbstractPostgresIT {

    private static final String MODEL_CODE = "AJ050MXHNBC1";

    @Autowired
    private EcountProductImporter importer;

    @Autowired
    private CategoryRepository categoryRepository;

    @Autowired
    private ProductRepository productRepository;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @MockBean
    private DynamicPermissionClient dynamicPermissionClient;

    @Test
    void importCsv_시트가_만든_modelNameOnly_활성행을_이카운트_품목코드로_병합한다() {
        Category category = categoryRepository.findByCode("OUTDOOR").orElseThrow();
        Product sheetProduct = productRepository.saveAndFlush(Product.seedFromSheet(
                "실외기_5HP 단배관", MODEL_CODE, category,
                new BigDecimal("100000"), new BigDecimal("70000"),
                ProductType.SINGLE, ProductCategory.HOME_MULTI, UsageScope.BOTH,
                EstimateCategory.HOME_MULTI));

        String itemCsv = """
                        "데이터관리>품목-Excel다운로드"
                        "품목코드\t","품목명\t","출하가\t","입고단가\t","싱글\t","실외기(원형,스탠드)\t","멀티(50%)\t","멀티(48%)\t","멀티(45%)\t","단품(35%)\t","품목구분\t","규격명\t","사용구분\t"
                        "AJ050MXHNBC1\t","AJ050MXHNBC1 (MX단배관)\t","250,000","180,000","","250,000","0","0","0","0","[상품]\t","5HP\t","YES\t"
                        """;
        String groupCsv = """
                "데이터관리>품목계층그룹-Excel다운로드"
                "그룹단계\t","[그룹코드]그룹명\t","품목코드\t","품목명\t"
                "1단계\t","[HVAC] 실외기\t","AJ050MXHNBC1\t","AJ050MXHNBC1 (MX단배관)\t"
                """;
        EcountProductImportResult result = importer.importCsv(
                stream(itemCsv), null, stream(groupCsv), "t7-test");

        EcountProductImportResult repeated = importer.importCsv(
                stream(itemCsv), null, stream(groupCsv), "t7-test");

        Product merged = productRepository.findById(sheetProduct.getId()).orElseThrow();
        assertThat(result.imported()).isZero();
        assertThat(result.updated()).isEqualTo(1);
        assertThat(repeated.imported()).isZero();
        assertThat(repeated.updated()).isEqualTo(1);
        assertThat(merged.getName()).isEqualTo("실외기_5HP 단배관");
        assertThat(merged.getCategory().getId()).isEqualTo(category.getId());
        assertThat(merged.getModelName()).isEqualTo(MODEL_CODE);
        assertThat(merged.getProductCode()).isEqualTo(MODEL_CODE);
        assertThat(merged.getOutboundPrice()).isEqualByComparingTo("250000");
        assertThat(merged.getInboundPrice()).isEqualByComparingTo("180000");
        assertThat(merged.getCategoryGroup()).isEqualTo("[HVAC] 실외기");
        assertThat(jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM products WHERE model_name = ? AND is_deleted = FALSE",
                Integer.class, MODEL_CODE)).isEqualTo(1);
    }

    @Test
    void importCsv_이카운트_직접생성행은_재임포트_품목명변경을_따라간다() {
        EcountProductImportResult first = importer.importCsv(
                itemCsv("EC-REIMPORT-01", "처음 품목", "100,000", "70,000"), null, null, "t7-test");
        assertThat(first.imported()).isEqualTo(1);

        EcountProductImportResult second = importer.importCsv(
                itemCsv("EC-REIMPORT-01", "변경 품목", "120,000", "80,000"), null, null, "t7-test");

        Product reimported = productRepository.findByProductCodeAndIsDeletedFalse("EC-REIMPORT-01")
                .orElseThrow();
        assertThat(second.updated()).isEqualTo(1);
        assertThat(reimported.getName()).isEqualTo("변경 품목");
        assertThat(reimported.getOutboundPrice()).isEqualByComparingTo("120000");
    }

    @Test
    void importCsv_시트_병합은_기존_category_id를_보존한다() {
        Category sheetCategory = categoryRepository.findByCode("OUTDOOR").orElseThrow();
        Product sheetProduct = productRepository.saveAndFlush(Product.seedFromSheet(
                "시트 분류 품목", "EC-CATEGORY-01", sheetCategory,
                new BigDecimal("100000"), new BigDecimal("70000"),
                ProductType.SINGLE, ProductCategory.HOME_MULTI, UsageScope.BOTH,
                EstimateCategory.HOME_MULTI));

        importer.importCsv(
                itemCsv("EC-CATEGORY-01", "EC-CATEGORY-01 (이카운트)", "250,000", "180,000"), null, null,
                "t7-test");

        Product merged = productRepository.findById(sheetProduct.getId()).orElseThrow();
        assertThat(merged.getCategory().getId()).isEqualTo(sheetCategory.getId());
    }

    private static java.io.InputStream stream(String csv) {
        return new java.io.ByteArrayInputStream(csv.getBytes(StandardCharsets.UTF_8));
    }

    private static java.io.InputStream itemCsv(String code, String name, String outbound, String inbound) {
        return stream("""
                "데이터관리>품목-Excel다운로드"
                "품목코드\t","품목명\t","출하가\t","입고단가\t","싱글\t","실외기(원형,스탠드)\t","멀티(50%)\t","멀티(48%)\t","멀티(45%)\t","단품(35%)\t","품목구분\t","규격명\t","사용구분\t"
                "__CODE__\t","__NAME__\t","__OUTBOUND__","__INBOUND__","","","0","0","","","[상품]\t","\t","YES\t"
                """.replace("__CODE__", code)
                .replace("__NAME__", name)
                .replace("__OUTBOUND__", outbound)
                .replace("__INBOUND__", inbound));
    }
}
