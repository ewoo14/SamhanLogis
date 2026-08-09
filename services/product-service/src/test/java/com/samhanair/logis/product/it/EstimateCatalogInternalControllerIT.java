package com.samhanair.logis.product.it;

import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.nullValue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.samhanair.logis.product.ProductServiceApplication;
import com.samhanair.logis.product.domain.BundleComponent;
import com.samhanair.logis.product.domain.BundleMode;
import com.samhanair.logis.product.domain.Category;
import com.samhanair.logis.product.domain.EstimateCategory;
import com.samhanair.logis.product.domain.Product;
import com.samhanair.logis.product.domain.ProductCategory;
import com.samhanair.logis.product.domain.ProductEstimateExposure;
import com.samhanair.logis.product.domain.ProductSpec;
import com.samhanair.logis.product.domain.ProductType;
import com.samhanair.logis.product.domain.PriceHistory;
import com.samhanair.logis.product.domain.UsageScope;
import com.samhanair.logis.product.repository.BundleComponentRepository;
import com.samhanair.logis.product.repository.CategoryRepository;
import com.samhanair.logis.product.repository.PriceHistoryRepository;
import com.samhanair.logis.product.repository.ProductEstimateExposureRepository;
import com.samhanair.logis.product.repository.ProductRepository;
import com.samhanair.logis.product.repository.ProductSpecRepository;
import java.math.BigDecimal;
import java.time.LocalDate;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

/** estimate-app 내부 카탈로그 endpoint 통합 테스트. */
@SpringBootTest(classes = ProductServiceApplication.class)
@AutoConfigureMockMvc
@Transactional
class EstimateCatalogInternalControllerIT extends AbstractPostgresIT {

    private static final String INTERNAL_TOKEN = "test-internal-token";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private CategoryRepository categoryRepository;

    @Autowired
    private ProductRepository productRepository;

    @Autowired
    private ProductSpecRepository productSpecRepository;

    @Autowired
    private PriceHistoryRepository priceHistoryRepository;

    @Autowired
    private ProductEstimateExposureRepository exposureRepository;

    @Autowired
    private BundleComponentRepository bundleComponentRepository;

    /** estimate-app 의 실제 BASE 경로에 규칙 endpoint 가 존재하고 내부 토큰 필터를 통과한다. */
    @Test
    void quantitySyncRules_estimateCatalogPath_returns200() throws Exception {
        mockMvc.perform(get("/products/internal/estimate-catalog/quantity-sync-rules")
                        .param("estimateCategory", "HOME_MULTI")
                        .header("X-Internal-Token", INTERNAL_TOKEN))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data").isArray());
    }

    /** products endpoint 는 default ESTIMATE, 주문서 호출은 PARTNER_ORDER + BOTH scope 로 노출 필터를 바꾼다. */
    @Test
    void products_scopeParam_filtersEstimateVsPartnerOrderCatalog() throws Exception {
        Product estimateOnly = seedCatalogProduct("IT_SCOPE_EST", UsageScope.ESTIMATE);
        Product partnerOrderOnly = seedCatalogProduct("IT_SCOPE_PO", UsageScope.PARTNER_ORDER);
        Product both = seedCatalogProduct("IT_SCOPE_BOTH", UsageScope.BOTH);
        exposureRepository.save(ProductEstimateExposure.create(
                estimateOnly.getId(), EstimateCategory.HOME_MULTI, 1));
        exposureRepository.save(ProductEstimateExposure.create(
                partnerOrderOnly.getId(), EstimateCategory.HOME_MULTI, 2));
        exposureRepository.save(ProductEstimateExposure.create(
                both.getId(), EstimateCategory.HOME_MULTI, 3));
        productRepository.flush();
        exposureRepository.flush();

        mockMvc.perform(get("/products/internal/estimate-catalog/products?category=HOME_MULTI")
                        .header("X-Internal-Token", INTERNAL_TOKEN))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data[*].modelCode", hasItem("IT_SCOPE_EST")))
                .andExpect(jsonPath("$.data[*].modelCode", hasItem("IT_SCOPE_BOTH")))
                .andExpect(jsonPath("$.data[?(@.modelCode == 'IT_SCOPE_PO')]").doesNotExist());

        mockMvc.perform(get("/products/internal/estimate-catalog/products"
                        + "?category=HOME_MULTI&scope=PARTNER_ORDER")
                        .header("X-Internal-Token", INTERNAL_TOKEN))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data[*].modelCode", hasItem("IT_SCOPE_PO")))
                .andExpect(jsonPath("$.data[*].modelCode", hasItem("IT_SCOPE_BOTH")))
                .andExpect(jsonPath("$.data[?(@.modelCode == 'IT_SCOPE_EST')]").doesNotExist());
    }

    /** 상업멀티 구성품 조회 시 구성품 ProductSpec 목록을 additive specs 필드로 반환한다. */
    @Test
    void components_commercialMulti_returns_componentSpecs() throws Exception {
        Product parent = seedBundleParent("IT_COMM_SET_01",
                ProductCategory.COMMERCIAL_MULTI, EstimateCategory.COMMERCIAL_MULTI);
        Product component = seedComponentProduct("IT_COMM_IDU_01", "상업 실내기 IT",
                ProductCategory.COMMERCIAL_MULTI, EstimateCategory.COMMERCIAL_MULTI);
        productSpecRepository.save(ProductSpec.create(component.getId(), "냉방능력", "5.6", "kW", 1));
        bundleComponentRepository.save(BundleComponent.seed(parent.getId(), "IT_COMM_IDU_01",
                BigDecimal.ONE, BundleComponent.QtyMode.FOLLOW_SET,
                BundleComponent.ComponentKind.INDOOR, null, true, null));
        productRepository.flush();
        productSpecRepository.flush();
        bundleComponentRepository.flush();

        mockMvc.perform(get("/products/internal/estimate-catalog/components?category=COMMERCIAL_MULTI")
                        .header("X-Internal-Token", INTERNAL_TOKEN))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data[?(@.componentModelCode == 'IT_COMM_IDU_01')]"
                        + ".specs[*].specKey", hasItem("냉방능력")));
    }

    /** 싱글 실내기 구성품에 ProductSpec 이 없으면 specs 필드는 존재하되 빈 배열로 반환한다. */
    @Test
    void components_singleSet_withoutComponentSpec_returns_emptySpecs() throws Exception {
        Product parent = seedBundleParent("IT_SINGLE_SET_01",
                ProductCategory.SINGLE_SET, EstimateCategory.SINGLE_SET);
        seedComponentProduct("IT_SINGLE_IDU_01", "싱글 실내기 IT",
                ProductCategory.SINGLE_SET, EstimateCategory.SINGLE_SET);
        bundleComponentRepository.save(BundleComponent.seed(parent.getId(), "IT_SINGLE_IDU_01",
                BigDecimal.ONE, BundleComponent.QtyMode.FOLLOW_SET,
                BundleComponent.ComponentKind.INDOOR, null, true, null));
        productRepository.flush();
        bundleComponentRepository.flush();

        mockMvc.perform(get("/products/internal/estimate-catalog/components?category=SINGLE_SET")
                        .header("X-Internal-Token", INTERNAL_TOKEN))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data[?(@.componentModelCode == 'IT_SINGLE_IDU_01')].specs",
                        hasItem(hasSize(0))));
    }

    /** price-baseline 은 exposure 없는 구성품도 modelCode + null category 로 포함한다. */
    @Test
    void priceBaseline_includesComponentWithoutExposureAsNullCategory() throws Exception {
        Product component = seedComponentProduct("IT_BASE_COMPONENT", "baseline 구성품",
                ProductCategory.SINGLE_PART, EstimateCategory.SINGLE_SET);
        priceHistoryRepository.save(PriceHistory.seed(component.getId(), LocalDate.of(2000, 1, 1),
                new BigDecimal("65000"), new BigDecimal("50000"), null));
        productRepository.flush();
        priceHistoryRepository.flush();

        mockMvc.perform(get("/products/internal/estimate-catalog/price-baseline")
                        .header("X-Internal-Token", INTERNAL_TOKEN))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data[?(@.modelCode == 'IT_BASE_COMPONENT')]", hasSize(1)))
                .andExpect(jsonPath("$.data[?(@.modelCode == 'IT_BASE_COMPONENT')].estimateCategory",
                        hasItem(nullValue())))
                .andExpect(jsonPath("$.data[?(@.modelCode == 'IT_BASE_COMPONENT')].releasePrice",
                        hasItem(65000)))
                .andExpect(jsonPath("$.data[?(@.modelCode == 'IT_BASE_COMPONENT')].deliveryPrice",
                        hasItem(50000)));
    }

    /** price-baseline 은 다중노출 품목을 기존처럼 카테고리별 1행씩 유지한다. */
    @Test
    void priceBaseline_keepsOneRowPerExposureForMultiExposureProduct() throws Exception {
        Product product = seedCatalogProduct("IT_BASE_MULTI", UsageScope.BOTH);
        priceHistoryRepository.save(PriceHistory.seed(product.getId(), LocalDate.of(2000, 1, 1),
                new BigDecimal("440000"), new BigDecimal("330000"), null));
        exposureRepository.save(ProductEstimateExposure.create(
                product.getId(), EstimateCategory.HOME_MULTI, 1));
        exposureRepository.save(ProductEstimateExposure.create(
                product.getId(), EstimateCategory.SINGLE_SET, 2));
        productRepository.flush();
        priceHistoryRepository.flush();
        exposureRepository.flush();

        mockMvc.perform(get("/products/internal/estimate-catalog/price-baseline")
                        .header("X-Internal-Token", INTERNAL_TOKEN))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data[?(@.modelCode == 'IT_BASE_MULTI')]", hasSize(2)))
                .andExpect(jsonPath("$.data[?(@.modelCode == 'IT_BASE_MULTI')].estimateCategory",
                        hasItem("HOME_MULTI")))
                .andExpect(jsonPath("$.data[?(@.modelCode == 'IT_BASE_MULTI')].estimateCategory",
                        hasItem("SINGLE_SET")));
    }

    /** spec-detail-map 도 products/components 와 동일하게 X-Internal-Token 없이는 401 이다. */
    @Test
    void specDetailMap_withoutInternalToken_returns401() throws Exception {
        mockMvc.perform(get("/products/internal/estimate-catalog/spec-detail-map"))
                .andExpect(status().isUnauthorized());
    }

    /** spec-detail-map 은 ProductSpec 을 legacy getSpecDetailMap_ shape 로 reshape 한다. */
    @Test
    void specDetailMap_returnsLegacyShapeByModelCode() throws Exception {
        Product home = seedSpecProduct("G1_HOME_01", "홈멀티 실외기",
                ProductCategory.HOME_MULTI, EstimateCategory.HOME_MULTI);
        seedSpec(home, "배관경", "Φ6.35", null, 1);
        seedSpec(home, "냉방능력, kcal/h", "1892", "kcal/h", 2);
        seedSpec(home, "냉방능력, kW", "2.2", "kW", 3);
        seedSpec(home, "냉방소비전력, kW", "0.65", "kW", 4);
        seedSpec(home, "냉매가스", "R32", null, 5);
        seedSpec(home, "에너지소비효율등급", "1등급", null, 6);
        seedSpec(home, "전원선, mm²", "2.5", "mm²", 7);
        seedSpec(home, "차단기, A", "15", "A", 8);
        seedSpec(home, "제품크기, mm", "820x300x250", "mm", 9);
        seedSpec(home, "제품중량, kg", "10", "kg", 10);
        seedSpec(home, "포장치수, mm", "900x350x300", "mm", 11);
        seedSpec(home, "포장중량, kg", "12", "kg", 12);
        seedSpec(home, "배관길이, m", "30", "m", 13);
        seedSpec(home, "고낙차, m", "15", "m", 14);

        Product single = seedSpecProduct("G1_SINGLE_01", "싱글 세트",
                ProductCategory.SINGLE_SET, EstimateCategory.SINGLE_SET);
        seedSpec(single, "배관경", "Φ9.52", null, 1);
        seedSpec(single, "냉방능력, kcal/h", "1720/5160/6020", "kcal/h", 2);
        seedSpec(single, "난방능력, kcal/h", "1548/4730/5590", "kcal/h", 3);
        seedSpec(single, "냉방능력, kW", "2.0/6.0/7.0", "kW", 4);
        seedSpec(single, "난방능력, kW", "1.8/5.5/6.5", "kW", 5);
        seedSpec(single, "냉방소비전력, kW", "0.5/1.8/2.5", "kW", 6);
        seedSpec(single, "난방소비전력, kW", "0.4/1.6/2.2", "kW", 7);
        seedSpec(single, "냉매가스", "R32", null, 8);
        seedSpec(single, "에너지소비효율등급", "1등급/2등급", null, 9);
        seedSpec(single, "전원선, mm²", "2.5", "mm²", 10);
        seedSpec(single, "차단기, A", "20", "A", 11);
        seedSpec(single, "실내기크기, mm", "1100x300x200", "mm", 12);
        seedSpec(single, "실외기중량, kg", "45", "kg", 15);
        seedSpec(single, "배관길이, m", "30", "m", 20);
        seedSpec(single, "고낙차, m", "15", "m", 21);

        Product comm = seedSpecProduct("G1_COMM_01", "상업멀티 실외기",
                ProductCategory.COMMERCIAL_MULTI, EstimateCategory.COMMERCIAL_MULTI);
        seedSpec(comm, "배관경", "Φ19.05", null, 1);
        seedSpec(comm, "냉방능력, kcal/h", "24080", "kcal/h", 2);
        seedSpec(comm, "난방능력, kcal/h", "27520", "kcal/h", 3);
        seedSpec(comm, "냉방능력, kW", "28.0", "kW", 4);
        seedSpec(comm, "난방능력, kW", "32.0", "kW", 5);
        seedSpec(comm, "냉방소비전력, kW", "7.5", "kW", 6);
        seedSpec(comm, "난방소비전력, kW", "8.2", "kW", 7);
        seedSpec(comm, "냉매가스", "R410A", null, 8);
        seedSpec(comm, "소비효율등급", "3등급", null, 9);
        seedSpec(comm, "제품크기, mm", "1295x1805x765", "mm", 12);
        seedSpec(comm, "배관길이, m", "200", "m", 16);
        seedSpec(comm, "고낙차, m", "110", "m", 17);

        Product erv = seedSpecProduct("G1_ERV_01", "상업용 전열교환기",
                ProductCategory.COMMERCIAL_MULTI, EstimateCategory.COMMERCIAL_MULTI);
        seedSpec(erv, "냉방능력, kcal/h", "688 / 0.8", "kcal/h", 2);
        seedSpec(erv, "난방능력, kcal/h", "602 / 0.7", "kcal/h", 3);
        seedSpec(erv, "냉방소비전력, kW", "0.25", "kW", 6);
        seedSpec(erv, "난방소비전력, kW", "0.22", "kW", 7);
        seedSpec(erv, "냉매가스", "Φ250", null, 8);
        seedSpec(erv, "차단기, A", "15", "A", 11);
        seedSpec(erv, "전원선, mm²", "2.5", "mm²", 10);

        Product homePanel = seedSpecProduct("PC1HOME", "홈 공청판넬",
                ProductCategory.HOME_MULTI, EstimateCategory.HOME_MULTI);
        seedSpec(homePanel, "타공사이즈, mm", "1380", "mm", 16);
        seedSpec(homePanel, "전산볼트간격, mm", "1260", "mm", 17);
        seedSpec(homePanel, "제품크기, mm", "1020x40x1020", "mm", 9);

        Product singlePanel = seedSpecProduct("PC1SINGLE", "싱글 패널",
                ProductCategory.SINGLE_SET, EstimateCategory.SINGLE_SET);
        seedSpec(singlePanel, "타공사이즈, mm", "950", "mm", 22);
        seedSpec(singlePanel, "전산볼트간격, mm", "860", "mm", 23);

        Product commPanel = seedSpecProduct("PC1COMM", "상업 판넬",
                ProductCategory.COMMERCIAL_MULTI, EstimateCategory.COMMERCIAL_MULTI);
        seedSpec(commPanel, "타공사이즈, mm", "1180", "mm", 19);
        seedSpec(commPanel, "전산볼트간격, mm", "1060", "mm", 20);
        productRepository.flush();
        productSpecRepository.flush();

        mockMvc.perform(get("/products/internal/estimate-catalog/spec-detail-map")
                        .header("X-Internal-Token", INTERNAL_TOKEN))
                .andExpect(status().isOk())
                .andExpect(content().contentTypeCompatibleWith("application/json"))
                .andExpect(jsonPath("$.data.G1_HOME_01.home.pipeDia").value("Φ6.35"))
                .andExpect(jsonPath("$.data.G1_HOME_01.home.cool_kcal").value("1892"))
                .andExpect(jsonPath("$.data.G1_HOME_01.home.cool_cap_kcal").value("1892"))
                .andExpect(jsonPath("$.data.G1_HOME_01.home.cool_power").value("0.65"))
                .andExpect(jsonPath("$.data.G1_HOME_01.home.cool_pow_kw").value("0.65"))
                .andExpect(jsonPath("$.data.G1_HOME_01.home.effGrade").value("1등급"))
                .andExpect(jsonPath("$.data.G1_HOME_01.home.grade").value("1등급"))
                .andExpect(jsonPath("$.data.G1_SINGLE_01.single.cool_pow_kw").value("0.5/1.8/2.5"))
                .andExpect(jsonPath("$.data.G1_SINGLE_01.single.heat_cap_kcal").value("1548/4730/5590"))
                .andExpect(jsonPath("$.data.G1_SINGLE_01.single.powerLine").value("2.5"))
                .andExpect(jsonPath("$.data.G1_SINGLE_01.single.breaker").value("20"))
                .andExpect(jsonPath("$.data.G1_SINGLE_01.single.outSize").value(""))
                .andExpect(jsonPath("$.data.G1_SINGLE_01.single.drop").value("15"))
                .andExpect(jsonPath("$.data.G1_COMM_01.comm.cool_cap_kcal").value("24080"))
                .andExpect(jsonPath("$.data.G1_COMM_01.comm.heat_pow_kw").value("8.2"))
                .andExpect(jsonPath("$.data.G1_COMM_01.comm.grade").value("3등급"))
                .andExpect(jsonPath("$.data.G1_COMM_01.comm.maxPipe").value("200"))
                .andExpect(jsonPath("$.data.G1_ERV_01.comm.gas").value("Φ250"))
                .andExpect(jsonPath("$.data.G1_ERV_01.comm.cool_kcal").value("688 / 0.8"))
                .andExpect(jsonPath("$.data.G1_ERV_01.comm.cool_power").value("0.25"))
                .andExpect(jsonPath("$.data.G1_ERV_01.comm.cool_cap_kcal").value(""))
                .andExpect(jsonPath("$.data.G1_ERV_01.comm.pipeDia").value(""))
                .andExpect(jsonPath("$.data.PC1HOME.home.cool_kw").value("1380"))
                .andExpect(jsonPath("$.data.PC1HOME.home.cool_cap_kw").value("1380"))
                .andExpect(jsonPath("$.data.PC1HOME.home.cool_power").value("1260"))
                .andExpect(jsonPath("$.data.PC1HOME.home.cool_pow_kw").value("1260"))
                .andExpect(jsonPath("$.data.PC1HOME.home.size").value("1020x40x1020"))
                .andExpect(jsonPath("$.data.PC1SINGLE.single.cool_cap_kcal").value("950"))
                .andExpect(jsonPath("$.data.PC1SINGLE.single.cool_pow_kw").value("860"))
                .andExpect(jsonPath("$.data.PC1COMM.comm.cool_cap_kcal").value("1180"))
                .andExpect(jsonPath("$.data.PC1COMM.comm.cool_pow_kw").value("1060"));
    }

    /** 부모 BUNDLE(EXPAND) 품목 1건 저장. */
    private Product seedBundleParent(String modelCode, ProductCategory productCategory,
                                     EstimateCategory estimateCategory) {
        Category cat = categoryRepository.save(Category.create("CAT-" + modelCode, "estimate bundle", null, 40));
        Product parent = Product.seedFromSheet("세트 " + modelCode, modelCode, cat,
                BigDecimal.valueOf(1_000_000), BigDecimal.valueOf(800_000), ProductType.BUNDLE,
                productCategory, UsageScope.BOTH, estimateCategory);
        parent.changeBundle(ProductType.BUNDLE, BundleMode.EXPAND);
        return productRepository.save(parent);
    }

    /** products endpoint scope 필터 검증용 카탈로그 품목 1건 저장. */
    private Product seedCatalogProduct(String modelCode, UsageScope usageScope) {
        Category cat = categoryRepository.save(Category.create("CAT-" + modelCode, "estimate catalog", null, 39));
        return productRepository.save(Product.seedFromSheet("품목 " + modelCode, modelCode, cat,
                BigDecimal.valueOf(500_000), BigDecimal.valueOf(400_000), ProductType.SINGLE,
                ProductCategory.HOME_MULTI, usageScope, EstimateCategory.HOME_MULTI));
    }

    /** 구성 후보 품목(SINGLE) 1건 저장 — modelCode 로 BundleComponent 와 join 된다. */
    private Product seedComponentProduct(String modelCode, String name, ProductCategory productCategory,
                                         EstimateCategory estimateCategory) {
        Category cat = categoryRepository.save(Category.create("CAT-" + modelCode, "estimate component", null, 41));
        Product component = Product.seedFromSheet(name, modelCode, cat,
                BigDecimal.valueOf(300_000), BigDecimal.valueOf(250_000), ProductType.SINGLE,
                productCategory, UsageScope.BOTH, estimateCategory);
        return productRepository.save(component);
    }

    /** spec-detail-map 검증용 사양 보유 품목 1건 저장. */
    private Product seedSpecProduct(String modelCode, String name, ProductCategory productCategory,
                                    EstimateCategory estimateCategory) {
        Category cat = categoryRepository.save(Category.create("CAT-" + modelCode, "estimate spec", null, 42));
        Product product = Product.seedFromSheet(name, modelCode, cat,
                BigDecimal.valueOf(100_000), BigDecimal.valueOf(80_000), ProductType.SINGLE,
                productCategory, UsageScope.BOTH, estimateCategory);
        return productRepository.save(product);
    }

    private void seedSpec(Product product, String key, String value, String unit, int order) {
        productSpecRepository.save(ProductSpec.create(product.getId(), key, value, unit, order));
    }
}
