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
import com.samhanair.logis.product.service.ProductService;
import com.samhanair.logis.product.web.dto.EcountProductImportResult;
import com.samhanair.logis.security.permission.DynamicPermissionClient;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
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
    private static final String DETERMINISTIC_MERGE_CODE_PREFIX = "DET984MERGE";
    private static final String DETERMINISTIC_MERGE_ACTOR = "deterministic-merge-984";

    @Autowired
    private EcountProductImporter importer;

    @Autowired
    private CategoryRepository categoryRepository;

    @Autowired
    private ProductRepository productRepository;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private ProductService productService;

    @MockBean
    private DynamicPermissionClient dynamicPermissionClient;

    @BeforeEach
    void cleanupDeterministicMergeFixtureBeforeTest() {
        cleanupDeterministicMergeFixture();
    }

    @AfterEach
    void cleanupDeterministicMergeFixtureAfterTest() {
        cleanupDeterministicMergeFixture();
    }

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

    @Test
    void sameNameSequenceCodes_are_all_aliases_and_lookupable() {
        String[][] groups = {
                {"AR-EH03", "00131", "SAR-00006"},
                {"삼성추가배관(벽걸이)", "AAAA-00004", "AAAA-00005"},
                {"삼성추가배관(스탠드)", "AAAA-00006", "AAAA-00007"},
                {"바람막이", "AAAA-00008", "ZENG-00009"},
                {"배수펌프", "AAAA-00009", "ZENG-00011"},
                {"천공", "AAAA-00010", "ZENG-00010"},
                {"유니온", "AAAA-00011", "ZENG-00008"},
                {"사다리차", "AAAA-00021", "ZENG-00016"},
                {"고소작업차(스카이)", "AAAA-00022", "AAAA-00023"},
                {"실외기받침대", "AAAA-00034", "ZENG-00017"},
                {"삼성 추가배관", "AAAA-00037", "AAAA-00038"},
                {"추가배관(벽걸이)", "ZENG-00012", "ZENG-00019"}
        };

        EcountProductImportResult result = importer.importCsv(
                stream(sequenceCodeFixture(groups)), null, null, "high-1-it");
        EcountProductImportResult repeated = importer.importCsv(
                stream(sequenceCodeFixture(groups)), null, null, "high-1-it");

        assertThat(result.imported()).isEqualTo(12);
        assertThat(result.aliasImported()).isEqualTo(24);
        assertThat(result.skippedGroupCount()).isZero();
        assertThat(repeated.imported()).isZero();
        assertThat(repeated.updated()).isEqualTo(12);
        assertThat(repeated.aliasImported()).isEqualTo(24);
        assertThat(repeated.skippedGroupCount()).isZero();

        Map<String, UUID> productIdsByName = new HashMap<>();
        for (String[] group : groups) {
            UUID firstId = null;
            for (int i = 1; i < group.length; i++) {
                var summary = productService.lookupSummaryByProductCode(group[i]);
                assertThat(summary.name()).isEqualTo(group[0]);
                if (firstId == null) {
                    firstId = summary.id();
                } else {
                    assertThat(summary.id()).isEqualTo(firstId);
                }
                assertThat(jdbcTemplate.queryForObject(
                        "SELECT COUNT(*) FROM product_aliases WHERE alias_code = ? AND is_deleted = FALSE",
                        Integer.class, group[i])).isEqualTo(1);
            }
            productIdsByName.put(group[0], firstId);
        }
        assertThat(productIdsByName.values()).doesNotHaveDuplicates();

        String discardedReason = jdbcTemplate.queryForObject(
                "SELECT reject_reason FROM staging.ecount_item_raw WHERE raw_item_code = ?",
                String.class, "AAAA-00005");
        assertThat(discardedReason)
                .contains("MERGED_SAME_NAME")
                .contains("specification=10평이하")
                .contains("inboundPrice=12277")
                .contains("specification=30평이하")
                .contains("inboundPrice=13914");
    }

    @Test
    void sameNameMerge_행순서가_달라도_정본코드_규격_입고단가가_같고_raw는_보존된다() {
        String name = "DET984MERGE 동명 품목";
        String smallestCode = DETERMINISTIC_MERGE_CODE_PREFIX + "A";
        String otherCode = DETERMINISTIC_MERGE_CODE_PREFIX + "B";

        EcountProductImportResult forward = importer.importCsv(
                stream(sameNameFixture(
                        itemRow(otherCode, name, "규격-B", "200,000"),
                        itemRow(smallestCode, name, "규격-A", "100,000"))),
                null, null, DETERMINISTIC_MERGE_ACTOR);
        List<Product> forwardProducts = productRepository.findByNameAndIsDeletedFalse(name);
        assertThat(forwardProducts).hasSize(1);
        Product forwardProduct = forwardProducts.get(0);
        assertThat(forward.imported()).isOne();
        assertThat(forward.aliasImported()).isEqualTo(2);
        assertThat(countDeterministicMergeRawRows()).isEqualTo(2);

        cleanupDeterministicMergeFixture();

        EcountProductImportResult reverse = importer.importCsv(
                stream(sameNameFixture(
                        itemRow(smallestCode, name, "규격-A", "100,000"),
                        itemRow(otherCode, name, "규격-B", "200,000"))),
                null, null, DETERMINISTIC_MERGE_ACTOR);
        List<Product> reverseProducts = productRepository.findByNameAndIsDeletedFalse(name);
        assertThat(reverseProducts).hasSize(1);
        Product reverseProduct = reverseProducts.get(0);

        assertThat(reverse.imported()).isOne();
        assertThat(reverse.aliasImported()).isEqualTo(2);
        assertThat(forwardProduct.getProductCode()).isEqualTo(reverseProduct.getProductCode())
                .isEqualTo(smallestCode);
        assertThat(forwardProduct.getSpecification()).isEqualTo(reverseProduct.getSpecification())
                .isEqualTo("규격-A");
        assertThat(forwardProduct.getInboundPrice()).isEqualByComparingTo(reverseProduct.getInboundPrice())
                .isEqualByComparingTo("100000");
        assertThat(countDeterministicMergeRawRows()).isEqualTo(2);
        assertThat(jdbcTemplate.queryForObject(
                "SELECT reject_reason FROM staging.ecount_item_raw WHERE raw_item_code = ?"
                        + " AND imported_by = ?",
                String.class, otherCode, DETERMINISTIC_MERGE_ACTOR))
                .contains("MERGED_SAME_NAME")
                .contains("specification=규격-A")
                .contains("inboundPrice=100000")
                .contains("specification=규격-B")
                .contains("inboundPrice=200000");
    }

    private int countDeterministicMergeRawRows() {
        return jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM staging.ecount_item_raw WHERE imported_by = ?"
                        + " AND raw_item_code LIKE ?",
                Integer.class, DETERMINISTIC_MERGE_ACTOR, DETERMINISTIC_MERGE_CODE_PREFIX + "%");
    }

    private void cleanupDeterministicMergeFixture() {
        String codePattern = DETERMINISTIC_MERGE_CODE_PREFIX + "%";
        jdbcTemplate.update("""
                DELETE FROM product_aliases
                 WHERE main_product_id IN (SELECT id FROM products WHERE model_code LIKE ?)
                """, codePattern);
        jdbcTemplate.update("""
                DELETE FROM staging.ecount_item_alias
                 WHERE main_product_uuid IN (SELECT id FROM products WHERE model_code LIKE ?)
                """, codePattern);
        jdbcTemplate.update("""
                DELETE FROM staging.ecount_item_raw
                 WHERE imported_by = ? OR raw_item_code LIKE ?
                """, DETERMINISTIC_MERGE_ACTOR, codePattern);
        jdbcTemplate.update("DELETE FROM staging.ecount_item_relation_raw WHERE imported_by = ?",
                DETERMINISTIC_MERGE_ACTOR);
        jdbcTemplate.update("DELETE FROM staging.ecount_item_group_raw WHERE imported_by = ?",
                DETERMINISTIC_MERGE_ACTOR);
        jdbcTemplate.update("""
                DELETE FROM product_estimate_exposure
                 WHERE product_id IN (SELECT id FROM products WHERE model_code LIKE ?)
                """, codePattern);
        jdbcTemplate.update("""
                DELETE FROM price_history
                 WHERE product_id IN (SELECT id FROM products WHERE model_code LIKE ?)
                """, codePattern);
        jdbcTemplate.update("DELETE FROM products WHERE model_code LIKE ?", codePattern);
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

    private static String sequenceCodeFixture(String[][] groups) {
        String header = "\"품목코드\t\",\"품목명\t\",\"출하가\t\",\"입고단가\t\",\"싱글\t\",\"실외기(원형,스탠드)\t\",\"멀티(50%)\t\",\"멀티(48%)\t\",\"멀티(45%)\t\",\"단품(35%)\t\",\"품목구분\t\",\"규격명\t\",\"사용구분\t\"";
        String rows = Arrays.stream(groups)
                .flatMap(group -> Arrays.stream(new String[]{
                        itemRow(group[1], group[0], group[0].equals("삼성추가배관(벽걸이)") ? "10평이하" : "규격A", "12277"),
                        itemRow(group[2], group[0], group[0].equals("삼성추가배관(벽걸이)") ? "30평이하" : "규격B", "13914")
                }))
                .collect(Collectors.joining("\n"));
        return "\"데이터관리>품목-Excel다운로드\"\n" + header + "\n" + rows + "\n";
    }

    private static String sameNameFixture(String... rows) {
        String header = "\"품목코드\t\",\"품목명\t\",\"출하가\t\",\"입고단가\t\",\"싱글\t\",\"실외기(원형,스탠드)\t\",\"멀티(50%)\t\",\"멀티(48%)\t\",\"멀티(45%)\t\",\"단품(35%)\t\",\"품목구분\t\",\"규격명\t\",\"사용구분\t\"";
        return "\"데이터관리>품목-Excel다운로드\"\n" + header + "\n"
                + String.join("\n", rows) + "\n";
    }

    private static String itemRow(String code, String name, String specification, String inbound) {
        String[] cells = {code, name, "0", inbound, "", "", "0", "0", "0", "0", "[상품]", specification, "YES"};
        return Arrays.stream(cells)
                .map(value -> "\"" + value.replace("\"", "\"\"") + "\"")
                .collect(Collectors.joining(","));
    }
}
