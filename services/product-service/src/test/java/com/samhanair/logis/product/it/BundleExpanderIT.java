package com.samhanair.logis.product.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.samhanair.logis.product.domain.BundleComponent;
import com.samhanair.logis.product.domain.BundleMode;
import com.samhanair.logis.product.domain.Category;
import com.samhanair.logis.product.domain.EstimateCategory;
import com.samhanair.logis.product.domain.Product;
import com.samhanair.logis.product.domain.ProductCategory;
import com.samhanair.logis.product.domain.ProductType;
import com.samhanair.logis.product.domain.UsageScope;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.product.repository.BundleComponentRepository;
import com.samhanair.logis.product.repository.CategoryRepository;
import com.samhanair.logis.product.repository.ProductRepository;
import com.samhanair.logis.product.service.BundleExpander;
import com.samhanair.logis.product.service.BundleComponentService;
import com.samhanair.logis.product.web.dto.BundleComponentRequest;
import java.math.BigDecimal;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.transaction.annotation.Transactional;

/**
 * BundleExpander EXPAND/KEEP 분기 IT (sample 5 BUNDLE).
 *
 * <p>출처: DOMAIN-EXTENSIONS §2 + partner-order Code.js SEND_AS_SET_IDS.
 */
@SpringBootTest
@DirtiesContext
@WithMockUser(username = "test-user")
@Transactional
class BundleExpanderIT extends AbstractPostgresIT {

    @Autowired
    private ProductRepository productRepository;

    @Autowired
    private BundleComponentRepository componentRepository;

    @Autowired
    private CategoryRepository categoryRepository;

    @Autowired
    private BundleExpander expander;

    @Autowired
    private BundleComponentService bundleComponentService;

    @Test
    void EXPAND_모드_component_펼침_FOLLOW_SET_qty_곱() {
        Category cat = categoryRepository.save(Category.create("BUNDLE-TEST-EXP", "test", null, 1));
        Product parent = Product.seedFromSheet("BUNDLE 부모", "BUND001", cat,
                BigDecimal.ZERO, BigDecimal.ZERO,
                ProductType.BUNDLE, ProductCategory.SINGLE_SET,
                UsageScope.BOTH, EstimateCategory.SINGLE_SET);
        parent.changeBundle(ProductType.BUNDLE, BundleMode.EXPAND);
        parent = productRepository.save(parent);

        comp(parent, "C001", new BigDecimal("1"), BundleComponent.QtyMode.FOLLOW_SET,
                BundleComponent.ComponentKind.INDOOR, "기본", true, 1);
        comp(parent, "C002", new BigDecimal("2"), BundleComponent.QtyMode.FIXED,
                BundleComponent.ComponentKind.PANEL, null, true, 2);
        productRepository.flush();
        componentRepository.flush();

        var lines = expander.expand("BUND001", new BigDecimal("3"));
        assertThat(lines).hasSize(2);
        // C001: FOLLOW_SET → setQty(3) * defaultQty(1) = 3
        assertThat(lines.get(0).modelCode()).isEqualTo("C001");
        assertThat(lines.get(0).quantity()).isEqualByComparingTo("3");
        // C002: FIXED → defaultQty(2) 그대로 (setQty 무관)
        assertThat(lines.get(1).modelCode()).isEqualTo("C002");
        assertThat(lines.get(1).quantity()).isEqualByComparingTo("2");
    }

    @Test
    void EXPAND_모드에서는_isDefault_구성품만_전개한다() {
        Category cat = categoryRepository.save(Category.create("BUNDLE-DEFAULT-ONLY", "test", null, 17));
        Product parent = Product.seedFromSheet("상업멀티 기본 구성 세트", "BUND_DEFAULT_ONLY", cat,
                BigDecimal.ZERO, BigDecimal.ZERO,
                ProductType.BUNDLE, ProductCategory.COMMERCIAL_MULTI,
                UsageScope.BOTH, EstimateCategory.COMMERCIAL_MULTI);
        parent.changeBundle(ProductType.BUNDLE, BundleMode.EXPAND);
        parent = productRepository.save(parent);

        product("DEFAULT_INDOOR", "기본 실내기", cat, ProductCategory.COMMERCIAL_PART, BigDecimal.ZERO);
        product("OPTIONAL_OUTDOOR", "비기본 실외기", cat, ProductCategory.COMMERCIAL_PART, BigDecimal.ZERO);
        comp(parent, "DEFAULT_INDOOR", BundleComponent.ComponentKind.INDOOR, null, true, 1);
        comp(parent, "OPTIONAL_OUTDOOR", BundleComponent.ComponentKind.OUTDOOR, null, false, 2);
        flush();

        var lines = expander.expand("BUND_DEFAULT_ONLY", BigDecimal.ONE);

        assertThat(lines).extracting(BundleExpander.ExpandedLine::modelCode)
                .containsExactly("DEFAULT_INDOOR");
    }

    @Test
    void GREEN_A_3_V37_지정_후_기본_구성품_전부가_전개된다() {
        Category cat = categoryRepository.save(Category.create("COMMERCIAL-RED-A3", "test", null, 21));
        Product parent = Product.seedFromSheet("기본 0건 상용멀티 세트", "RED_A3_NO_DEFAULT", cat,
                BigDecimal.ZERO, BigDecimal.ZERO,
                ProductType.BUNDLE, ProductCategory.COMMERCIAL_MULTI,
                UsageScope.BOTH, EstimateCategory.COMMERCIAL_MULTI);
        parent.changeBundle(ProductType.BUNDLE, BundleMode.EXPAND);
        parent.markBundleComponentsManual();
        parent = productRepository.save(parent);

        product("RED-A3-INDOOR", "RED-A3 실내기", cat, ProductCategory.COMMERCIAL_PART, new BigDecimal("100"));
        product("RED-A3-OUTDOOR", "RED-A3 실외기", cat, ProductCategory.COMMERCIAL_PART, new BigDecimal("200"));
        comp(parent, "RED-A3-INDOOR", BundleComponent.ComponentKind.INDOOR, null, true, 1);
        comp(parent, "RED-A3-OUTDOOR", BundleComponent.ComponentKind.OUTDOOR, null, true, 2);
        flush();

        var lines = expander.expand("RED_A3_NO_DEFAULT", BigDecimal.ONE);

        assertThat(lines).extracting(BundleExpander.ExpandedLine::modelCode)
                .containsExactly("RED-A3-INDOOR", "RED-A3-OUTDOOR");
    }

    @Test
    void R1_호환_예외_제거_기본구성품_0건이면_전개하지_않는다() {
        Category cat = categoryRepository.save(Category.create("COMMERCIAL-LEGACY-COMPAT", "test", null, 18));
        Product parent = Product.seedFromSheet("기존 상용멀티 세트", "AM220AXVHHR1SY", cat,
                BigDecimal.ZERO, BigDecimal.ZERO,
                ProductType.BUNDLE, ProductCategory.COMMERCIAL_MULTI,
                UsageScope.BOTH, EstimateCategory.COMMERCIAL_MULTI);
        parent.changeBundle(ProductType.BUNDLE, BundleMode.EXPAND);
        parent = productRepository.save(parent);

        product("AM220-INDOOR", "기존 실내기", cat, ProductCategory.COMMERCIAL_PART, new BigDecimal("100"));
        product("AM220-OUTDOOR", "기존 실외기", cat, ProductCategory.COMMERCIAL_PART, new BigDecimal("200"));
        comp(parent, "AM220-INDOOR", BundleComponent.ComponentKind.INDOOR, null, false, 1);
        comp(parent, "AM220-OUTDOOR", BundleComponent.ComponentKind.OUTDOOR, null, false, 2);
        flush();

        var lines = expander.expand("AM220AXVHHR1SY", BigDecimal.ONE);

        assertThat(lines).isEmpty();
    }

    @Test
    void RED_A_수기편집_기본구성품이_0건이면_활성구성품을_전개하지_않는다() {
        Category cat = categoryRepository.save(Category.create("COMMERCIAL-MANUAL-NO-DEFAULT", "test", null, 19));
        Product parent = Product.seedFromSheet("수기 편집 상용멀티 세트", "MANUAL_NO_DEFAULT", cat,
                BigDecimal.ZERO, BigDecimal.ZERO,
                ProductType.BUNDLE, ProductCategory.COMMERCIAL_MULTI,
                UsageScope.BOTH, EstimateCategory.COMMERCIAL_MULTI);
        parent.changeBundle(ProductType.BUNDLE, BundleMode.EXPAND);
        parent.markBundleComponentsManual();
        parent = productRepository.save(parent);

        product("MANUAL-INDOOR", "수기 필수 실내기", cat, ProductCategory.COMMERCIAL_PART, new BigDecimal("100"));
        product("MANUAL-OPTIONAL", "수기 선택 실외기", cat, ProductCategory.COMMERCIAL_PART, new BigDecimal("200"));
        comp(parent, "MANUAL-INDOOR", BundleComponent.ComponentKind.INDOOR, null, false, 1);
        comp(parent, "MANUAL-OPTIONAL", BundleComponent.ComponentKind.OUTDOOR, null, false, 2);
        flush();

        var lines = expander.expand("MANUAL_NO_DEFAULT", BigDecimal.ONE);

        assertThat(lines).isEmpty();
    }

    @Test
    void RED_A_뮤테이션_PUT_전부_비기본이면_수기표식_후_전개하지_않는다() {
        Category cat = categoryRepository.save(Category.create("COMMERCIAL-MUTATION-NO-DEFAULT", "test", null, 20));
        Product parent = Product.seedFromSheet("수기 mutation 상용멀티 세트", "MUTATION_NO_DEFAULT", cat,
                BigDecimal.ZERO, BigDecimal.ZERO,
                ProductType.BUNDLE, ProductCategory.COMMERCIAL_MULTI,
                UsageScope.BOTH, EstimateCategory.COMMERCIAL_MULTI);
        parent.changeBundle(ProductType.BUNDLE, BundleMode.EXPAND);
        parent = productRepository.save(parent);
        product("MUTATION-REQUIRED", "mutation 필수 실내기", cat, ProductCategory.COMMERCIAL_PART, new BigDecimal("100"));
        product("MUTATION-OPTIONAL", "mutation 선택 실외기", cat, ProductCategory.COMMERCIAL_PART, new BigDecimal("200"));
        flush();

        var saved = bundleComponentService.replaceComponents("MUTATION_NO_DEFAULT", List.of(
                new BundleComponentRequest("MUTATION-REQUIRED", BigDecimal.ONE,
                        BundleComponent.QtyMode.FOLLOW_SET, BundleComponent.ComponentKind.INDOOR,
                        null, false, null),
                new BundleComponentRequest("MUTATION-OPTIONAL", BigDecimal.ONE,
                        BundleComponent.QtyMode.FOLLOW_SET, BundleComponent.ComponentKind.OUTDOOR,
                        null, false, null)
        ), "test-user");
        flush();

        assertThat(saved).hasSize(2)
                .allSatisfy(component -> assertThat(component.isDefault()).isFalse());
        assertThat(productRepository.findByModelCodeAndIsDeletedFalse("MUTATION_NO_DEFAULT"))
                .get().extracting(Product::isBundleComponentsManual).isEqualTo(true);
        assertThat(expander.expand("MUTATION_NO_DEFAULT", BigDecimal.ONE)).isEmpty();
    }

    @Test
    void KEEP_모드_부모_단일_라인_유지() {
        Category cat = categoryRepository.save(Category.create("BUNDLE-TEST-KEEP", "test", null, 2));
        Product parent = Product.seedFromSheet("KEEP 부모", "BUND_KEEP", cat,
                BigDecimal.ZERO, BigDecimal.ZERO,
                ProductType.BUNDLE, ProductCategory.SINGLE_SET,
                UsageScope.BOTH, EstimateCategory.SINGLE_SET);
        parent.changeBundle(ProductType.BUNDLE, BundleMode.KEEP);
        parent = productRepository.save(parent);
        componentRepository.save(BundleComponent.seed(parent.getId(), "X001",
                new BigDecimal("1"), BundleComponent.QtyMode.FIXED,
                BundleComponent.ComponentKind.ACCESSORY, null, false, null));
        productRepository.flush();
        componentRepository.flush();

        var lines = expander.expand("BUND_KEEP", new BigDecimal("5"));
        assertThat(lines).hasSize(1);
        assertThat(lines.get(0).modelCode()).isEqualTo("BUND_KEEP");
        assertThat(lines.get(0).quantity()).isEqualByComparingTo("5");
    }

    @Test
    void SINGLE_제품_그대로_단일_라인() {
        Category cat = categoryRepository.save(Category.create("SINGLE-TEST", "test", null, 3));
        Product single = Product.seedFromSheet("단일", "SNG001", cat,
                BigDecimal.ZERO, BigDecimal.ZERO,
                ProductType.SINGLE, ProductCategory.HOME_MULTI,
                UsageScope.BOTH, EstimateCategory.HOME_MULTI);
        productRepository.save(single);
        productRepository.flush();

        var lines = expander.expand("SNG001", new BigDecimal("4"));
        assertThat(lines).hasSize(1);
        assertThat(lines.get(0).modelCode()).isEqualTo("SNG001");
        assertThat(lines.get(0).quantity()).isEqualByComparingTo("4");
    }

    @Test
    void 가정용_싱글세트_세트단가_실내6_실외4_재배분() {
        Category cat = categoryRepository.save(Category.create("GH-SET", "test", null, 10));
        Product parent = bundleSet("GH_SET", "가정용 에어컨 무풍", cat, new BigDecimal("1000000"));
        product("GH_IN", "실내기 4평", cat, ProductCategory.SINGLE_PART, new BigDecimal("300000"));
        product("GH_OUT", "실외기", cat, ProductCategory.SINGLE_PART, new BigDecimal("700000"));
        comp(parent, "GH_IN", BundleComponent.ComponentKind.INDOOR);
        comp(parent, "GH_OUT", BundleComponent.ComponentKind.OUTDOOR);
        flush();

        var lines = expander.expand("GH_SET", BigDecimal.ONE);
        assertThat(lines).hasSize(2);
        assertThat(unit(lines, "GH_IN")).isEqualByComparingTo("600000"); // 1,000,000 × 6/10
        assertThat(unit(lines, "GH_OUT")).isEqualByComparingTo("400000"); // 잔차 4/10
    }

    @Test
    void 비가정_4way_싱글세트_실내4_실외6_재배분() {
        Category cat = categoryRepository.save(Category.create("CW-SET", "test", null, 11));
        Product parent = bundleSet("CW_SET", "무풍 4way 냉난방 프리미엄", cat, new BigDecimal("1000000"));
        product("CW_IN", "실내기", cat, ProductCategory.SINGLE_PART, new BigDecimal("300000"));
        product("CW_OUT", "실외기", cat, ProductCategory.SINGLE_PART, new BigDecimal("700000"));
        comp(parent, "CW_IN", BundleComponent.ComponentKind.INDOOR);
        comp(parent, "CW_OUT", BundleComponent.ComponentKind.OUTDOOR);
        flush();

        var lines = expander.expand("CW_SET", BigDecimal.ONE);
        assertThat(unit(lines, "CW_IN")).isEqualByComparingTo("400000"); // 4way → 4:6
        assertThat(unit(lines, "CW_OUT")).isEqualByComparingTo("600000");
    }

    @Test
    void 옵션_패널1개선택_블랙_자재제외() {
        Category cat = categoryRepository.save(Category.create("OPT-SET", "test", null, 12));
        Product parent = bundleSet("OPT_SET", "1way 냉난방", cat, new BigDecimal("500000"));
        product("PNL_W", "기본 화이트 판넬", cat, ProductCategory.SINGLE_PART, new BigDecimal("50000"));
        product("PNL_B", "블랙 판넬", cat, ProductCategory.SINGLE_PART, new BigDecimal("60000"));
        product("MAT_1", "배관 자재", cat, ProductCategory.SINGLE_PART, new BigDecimal("30000"));
        componentRepository.save(BundleComponent.seed(parent.getId(), "PNL_W", BigDecimal.ONE,
                BundleComponent.QtyMode.FOLLOW_SET, BundleComponent.ComponentKind.PANEL, "기본", true, null));
        componentRepository.save(BundleComponent.seed(parent.getId(), "PNL_B", BigDecimal.ONE,
                BundleComponent.QtyMode.FOLLOW_SET, BundleComponent.ComponentKind.PANEL, null, false, null));
        componentRepository.save(BundleComponent.seed(parent.getId(), "MAT_1", BigDecimal.ONE,
                BundleComponent.QtyMode.FOLLOW_SET, BundleComponent.ComponentKind.MATERIAL, "자재", false, null));
        flush();

        var opts = new BundleExpander.ExpandOptions("", false, "블랙판넬", "원형", false, null);
        var defaultLines = expander.expand("OPT_SET", BigDecimal.ONE);
        var lines = expander.expand("OPT_SET", BigDecimal.ONE, opts);
        assertThat(unit(defaultLines, "PNL_W")).isEqualByComparingTo("50000");
        assertThat(lines).extracting(BundleExpander.ExpandedLine::modelCode)
                .containsExactly("PNL_W"); // 비기본 블랙 판넬은 제외되고 기본 화이트를 유지
        assertThat(unit(lines, "PNL_W")).isEqualByComparingTo("50000");
    }

    @Test
    void 기본옵션은_판넬과_리모컨을_포함한_4행이고_판넬제외는_나머지를_유지한다() {
        Category cat = categoryRepository.save(Category.create("OPT-DEFAULT-ROWS", "test", null, 130));
        Product parent = bundleSet("OPT_DEFAULT_ROWS", "가정용 에어컨 무풍", cat, new BigDecimal("500000"));
        product("ROW_IN", "실내기", cat, ProductCategory.SINGLE_PART, new BigDecimal("300000"));
        product("ROW_OUT", "실외기", cat, ProductCategory.SINGLE_PART, new BigDecimal("200000"));
        product("ROW_PANEL", "기본 판넬", cat, ProductCategory.SINGLE_PART, new BigDecimal("50000"));
        product("ROW_REMOTE", "기본 유선리모컨", cat, ProductCategory.SINGLE_PART, new BigDecimal("20000"));
        product("ROW_PANEL_OPTION", "비기본 판넬", cat, ProductCategory.SINGLE_PART, new BigDecimal("60000"));
        product("ROW_REMOTE_OPTION", "비기본 리모컨", cat, ProductCategory.SINGLE_PART, new BigDecimal("30000"));
        product("ROW_MATERIAL_OPTION", "비기본 자재", cat, ProductCategory.SINGLE_PART, new BigDecimal("10000"));
        comp(parent, "ROW_IN", BundleComponent.ComponentKind.INDOOR, null, true, 1);
        comp(parent, "ROW_OUT", BundleComponent.ComponentKind.OUTDOOR, null, true, 2);
        comp(parent, "ROW_PANEL", BundleComponent.ComponentKind.PANEL, "기본", true, 3);
        comp(parent, "ROW_REMOTE", BundleComponent.ComponentKind.REMOTE, "기본", true, 4);
        comp(parent, "ROW_PANEL_OPTION", BundleComponent.ComponentKind.PANEL, null, false, 5);
        comp(parent, "ROW_REMOTE_OPTION", BundleComponent.ComponentKind.REMOTE, null, false, 6);
        comp(parent, "ROW_MATERIAL_OPTION", BundleComponent.ComponentKind.MATERIAL, null, false, 7);
        flush();

        var defaults = expander.expand("OPT_DEFAULT_ROWS", BigDecimal.ONE);
        var withoutPanel = expander.expand("OPT_DEFAULT_ROWS", BigDecimal.ONE,
                new BundleExpander.ExpandOptions("", false, "판넬제외", "원형", false, null));

        assertThat(defaults).hasSize(4)
                .extracting(BundleExpander.ExpandedLine::modelCode)
                .containsExactly("ROW_IN", "ROW_OUT", "ROW_PANEL", "ROW_REMOTE");
        assertThat(defaults.stream().map(BundleExpander.ExpandedLine::unitPrice)
                .reduce(BigDecimal.ZERO, BigDecimal::add)).isEqualByComparingTo("500000");
        assertThat(withoutPanel).hasSize(3)
                .extracting(BundleExpander.ExpandedLine::modelCode)
                .containsExactly("ROW_IN", "ROW_OUT", "ROW_REMOTE");
    }

    @Test
    void 옵션_패널_attribute_기반으로_블랙_기본후보를_선택한다() {
        Category cat = categoryRepository.save(Category.create("OPT-ATTR-PANEL", "test", null, 121));
        Product parent = bundleSet("OPT_ATTR_PANEL", "1way 냉난방", cat, new BigDecimal("500000"));
        product("PNL_BASE_ATTR", "기본 판넬", cat, ProductCategory.SINGLE_PART, new BigDecimal("50000"));
        productWithAttributes("PNL_BLACK_NON_DEFAULT", "옵션 판넬 A", cat,
                ProductCategory.SINGLE_PART, new BigDecimal("60000"), "블랙", null);
        productWithAttributes("PNL_BLACK_DEFAULT", "옵션 판넬 B", cat,
                ProductCategory.SINGLE_PART, new BigDecimal("65000"), "블랙", null);
        comp(parent, "PNL_BASE_ATTR", BundleComponent.ComponentKind.PANEL, "기본", true, 1);
        comp(parent, "PNL_BLACK_NON_DEFAULT", BundleComponent.ComponentKind.PANEL, null, false, 2);
        comp(parent, "PNL_BLACK_DEFAULT", BundleComponent.ComponentKind.PANEL, null, true, 3);
        flush();

        var opts = new BundleExpander.ExpandOptions("", false, "블랙판넬", "원형", false, null);
        var lines = expander.expand("OPT_ATTR_PANEL", BigDecimal.ONE, opts);

        assertThat(lines).extracting(BundleExpander.ExpandedLine::modelCode)
                .containsExactly("PNL_BLACK_DEFAULT");
    }

    @Test
    void 옵션_패널_attribute_null이면_기존_정규식_fallback으로_선택한다() {
        Category cat = categoryRepository.save(Category.create("OPT-FALLBACK-PANEL", "test", null, 122));
        Product parent = bundleSet("OPT_FALLBACK_PANEL", "1way 냉난방", cat, new BigDecimal("500000"));
        product("PNL_BASE_FB", "기본 판넬", cat, ProductCategory.SINGLE_PART, new BigDecimal("50000"));
        product("PNL_BLACK_FB", "블랙 판넬", cat, ProductCategory.SINGLE_PART, new BigDecimal("60000"));
        comp(parent, "PNL_BASE_FB", BundleComponent.ComponentKind.PANEL, "기본", true, 1);
        comp(parent, "PNL_BLACK_FB", BundleComponent.ComponentKind.PANEL, null, false, 2);
        flush();

        var opts = new BundleExpander.ExpandOptions("", false, "블랙판넬", "원형", false, null);
        var lines = expander.expand("OPT_FALLBACK_PANEL", BigDecimal.ONE, opts);

        assertThat(lines).extracting(BundleExpander.ExpandedLine::modelCode)
                .containsExactly("PNL_BASE_FB");
    }

    @Test
    void 옵션_패널_attribute가_target과_달라도_정규식_fallback으로_복합명칭을_선택한다() {
        Category cat = categoryRepository.save(Category.create("OPT-MIXED-PANEL", "test", null, 125));
        Product parent = bundleSet("OPT_MIXED_PANEL", "1way 냉난방", cat, new BigDecimal("500000"));
        productWithAttributes("PNL_BASE_MIXED", "기본 판넬", cat,
                ProductCategory.SINGLE_PART, new BigDecimal("50000"), "일반", null);
        productWithAttributes("PNL_BLACK_AIR", "블랙 공기청정 판넬", cat,
                ProductCategory.SINGLE_PART, new BigDecimal("65000"), "공청", null);
        comp(parent, "PNL_BASE_MIXED", BundleComponent.ComponentKind.PANEL, "기본", true, 1);
        comp(parent, "PNL_BLACK_AIR", BundleComponent.ComponentKind.PANEL, null, false, 2);
        flush();

        var opts = new BundleExpander.ExpandOptions("", false, "블랙판넬", "원형", false, null);
        var lines = expander.expand("OPT_MIXED_PANEL", BigDecimal.ONE, opts);

        assertThat(lines).extracting(BundleExpander.ExpandedLine::modelCode)
                .containsExactly("PNL_BASE_MIXED");
    }

    @Test
    void 옵션_패널_attribute_null과_non_null_혼재에서도_정규식_fallback으로_null_target을_선택한다() {
        Category cat = categoryRepository.save(Category.create("OPT-PARTIAL-PANEL", "test", null, 126));
        Product parent = bundleSet("OPT_PARTIAL_PANEL", "1way 냉난방", cat, new BigDecimal("500000"));
        productWithAttributes("PNL_BASE_PARTIAL", "기본 판넬", cat,
                ProductCategory.SINGLE_PART, new BigDecimal("50000"), "일반", null);
        product("PNL_BLACK_PARTIAL", "블랙 판넬", cat, ProductCategory.SINGLE_PART, new BigDecimal("60000"));
        comp(parent, "PNL_BASE_PARTIAL", BundleComponent.ComponentKind.PANEL, "기본", true, 1);
        comp(parent, "PNL_BLACK_PARTIAL", BundleComponent.ComponentKind.PANEL, null, false, 2);
        flush();

        var opts = new BundleExpander.ExpandOptions("", false, "블랙판넬", "원형", false, null);
        var lines = expander.expand("OPT_PARTIAL_PANEL", BigDecimal.ONE, opts);

        assertThat(lines).extracting(BundleExpander.ExpandedLine::modelCode)
                .containsExactly("PNL_BASE_PARTIAL");
    }

    @Test
    void 옵션_패널_attribute_공청과_승강_arm으로_선택한다() {
        Category cat = categoryRepository.save(Category.create("OPT-PANEL-ARMS", "test", null, 127));
        Product parent = bundleSet("OPT_PANEL_ARMS", "1way 냉난방", cat, new BigDecimal("500000"));
        productWithAttributes("PNL_BASE_ARMS", "기본 판넬", cat,
                ProductCategory.SINGLE_PART, new BigDecimal("50000"), "일반", null);
        productWithAttributes("PNL_AIR_ATTR", "옵션 판넬 A", cat,
                ProductCategory.SINGLE_PART, new BigDecimal("60000"), "공청", null);
        productWithAttributes("PNL_LIFT_ATTR", "옵션 판넬 B", cat,
                ProductCategory.SINGLE_PART, new BigDecimal("65000"), "승강", null);
        comp(parent, "PNL_BASE_ARMS", BundleComponent.ComponentKind.PANEL, "기본", true, 1);
        comp(parent, "PNL_AIR_ATTR", BundleComponent.ComponentKind.PANEL, null, false, 2);
        comp(parent, "PNL_LIFT_ATTR", BundleComponent.ComponentKind.PANEL, null, false, 3);
        flush();

        var airOpts = new BundleExpander.ExpandOptions("", false, "공청판넬", "원형", false, null);
        var liftOpts = new BundleExpander.ExpandOptions("", false, "승강판넬", "원형", false, null);

        assertThat(expander.expand("OPT_PANEL_ARMS", BigDecimal.ONE, airOpts))
                .extracting(BundleExpander.ExpandedLine::modelCode)
                .containsExactly("PNL_BASE_ARMS");
        assertThat(expander.expand("OPT_PANEL_ARMS", BigDecimal.ONE, liftOpts))
                .extracting(BundleExpander.ExpandedLine::modelCode)
                .containsExactly("PNL_BASE_ARMS");
    }

    @Test
    void 옵션_360판넬은_panelType과_형상_variant가_맞는_기본후보를_선택한다() {
        Category cat = categoryRepository.save(Category.create("OPT-360-PANEL", "test", null, 123));
        Product parent = bundleSet("OPT_360_PANEL", "360 CST 냉난방", cat, new BigDecimal("500000"));
        productWithAttributes("PNL_360_ROUND_NON_DEFAULT", "360 판넬 A", cat,
                ProductCategory.SINGLE_PART, new BigDecimal("60000"), "360", null);
        productWithAttributes("PNL_360_ROUND_DEFAULT", "360 판넬 B", cat,
                ProductCategory.SINGLE_PART, new BigDecimal("65000"), "360", null);
        productWithAttributes("PNL_360_SQUARE_DEFAULT", "360 판넬 C", cat,
                ProductCategory.SINGLE_PART, new BigDecimal("70000"), "360", null);
        comp(parent, "PNL_360_ROUND_NON_DEFAULT", BundleComponent.ComponentKind.PANEL, "원형", false, 1);
        comp(parent, "PNL_360_SQUARE_DEFAULT", BundleComponent.ComponentKind.PANEL, "사각", true, 2);
        comp(parent, "PNL_360_ROUND_DEFAULT", BundleComponent.ComponentKind.PANEL, "원형", true, 3);
        flush();

        var opts = new BundleExpander.ExpandOptions("", false, "", "원형", false, null);
        var lines = expander.expand("OPT_360_PANEL", BigDecimal.ONE, opts);

        assertThat(lines).extracting(BundleExpander.ExpandedLine::modelCode)
                .containsExactly("PNL_360_ROUND_DEFAULT");
    }

    @Test
    void 옵션_리모컨_attribute_기반으로_유선_기본후보로_교체한다() {
        Category cat = categoryRepository.save(Category.create("OPT-ATTR-REMOTE", "test", null, 124));
        Product parent = bundleSet("OPT_ATTR_REMOTE", "1way 냉난방", cat, new BigDecimal("500000"));
        product("AR-EH05", "기본 유선리모컨", cat, ProductCategory.SINGLE_PART, new BigDecimal("20000"));
        productWithAttributes("RMT_WIRED_NON_DEFAULT", "옵션 리모컨 A", cat,
                ProductCategory.SINGLE_PART, new BigDecimal("30000"), null, "유선");
        productWithAttributes("RMT_WIRED_DEFAULT", "옵션 리모컨 B", cat,
                ProductCategory.SINGLE_PART, new BigDecimal("35000"), null, "유선");
        comp(parent, "AR-EH05", BundleComponent.ComponentKind.REMOTE, "기본", true, 1);
        comp(parent, "RMT_WIRED_NON_DEFAULT", BundleComponent.ComponentKind.REMOTE, null, false, 2);
        comp(parent, "RMT_WIRED_DEFAULT", BundleComponent.ComponentKind.REMOTE, null, true, 3);
        flush();

        var opts = new BundleExpander.ExpandOptions("유선리모컨", false, "", "원형", false, null);
        var lines = expander.expand("OPT_ATTR_REMOTE", BigDecimal.ONE, opts);

        assertThat(lines).extracting(BundleExpander.ExpandedLine::modelCode)
                .containsExactly("RMT_WIRED_DEFAULT");
    }

    @Test
    void 옵션_리모컨_유선_attribute_match는_컬러_텍스트를_제외한다() {
        Category cat = categoryRepository.save(Category.create("OPT-REMOTE-COLOR-LEAK", "test", null, 128));
        Product parent = bundleSet("OPT_REMOTE_COLOR_LEAK", "1way 냉난방", cat, new BigDecimal("500000"));
        product("AR-EH05", "기본 유선리모컨", cat, ProductCategory.SINGLE_PART, new BigDecimal("20000"));
        productWithAttributes("RMT_COLOR_AS_WIRED", "컬러 유선리모컨 옵션", cat,
                ProductCategory.SINGLE_PART, new BigDecimal("30000"), null, "유선");
        productWithAttributes("RMT_PLAIN_WIRED", "유선리모컨 옵션", cat,
                ProductCategory.SINGLE_PART, new BigDecimal("35000"), null, "유선");
        comp(parent, "AR-EH05", BundleComponent.ComponentKind.REMOTE, "기본", true, 1);
        comp(parent, "RMT_COLOR_AS_WIRED", BundleComponent.ComponentKind.REMOTE, null, false, 2);
        comp(parent, "RMT_PLAIN_WIRED", BundleComponent.ComponentKind.REMOTE, null, false, 3);
        flush();

        var opts = new BundleExpander.ExpandOptions("유선리모컨", false, "", "원형", false, null);
        var lines = expander.expand("OPT_REMOTE_COLOR_LEAK", BigDecimal.ONE, opts);

        assertThat(lines).extracting(BundleExpander.ExpandedLine::modelCode)
                .containsExactly("AR-EH05");
    }

    @Test
    void 옵션_리모컨_synced_기본유선이면_유선선택은_기본리모컨_noop이다() {
        Category cat = categoryRepository.save(Category.create("OPT-REMOTE-SYNCED-NOOP", "test", null, 129));
        Product parent = bundleSet("OPT_REMOTE_SYNCED_NOOP", "1way 냉난방", cat, new BigDecimal("500000"));
        productWithAttributes("AR-EH05", "기본 유선리모컨", cat,
                ProductCategory.SINGLE_PART, new BigDecimal("20000"), null, "유선");
        productWithAttributes("RMT_WIRED_OPTION", "옵션 유선리모컨", cat,
                ProductCategory.SINGLE_PART, new BigDecimal("35000"), null, "유선");
        comp(parent, "AR-EH05", BundleComponent.ComponentKind.REMOTE, "기본", true, 1);
        comp(parent, "RMT_WIRED_OPTION", BundleComponent.ComponentKind.REMOTE, null, false, 2);
        flush();

        var opts = new BundleExpander.ExpandOptions("유선리모컨", false, "", "원형", false, null);
        var lines = expander.expand("OPT_REMOTE_SYNCED_NOOP", BigDecimal.ONE, opts);

        assertThat(lines).extracting(BundleExpander.ExpandedLine::modelCode)
                .containsExactly("AR-EH05");
        assertThat(lines).filteredOn(line -> line.componentKind() == BundleComponent.ComponentKind.REMOTE)
                .hasSize(1);
    }

    @Test
    void 옵션_기본리모컨_없으면_리모컨_전부제외() {
        Category cat = categoryRepository.save(Category.create("RMT-SET", "test", null, 13));
        Product parent = bundleSet("RMT_SET", "1way 냉난방", cat, new BigDecimal("500000"));
        product("RMT_IN", "실내기", cat, ProductCategory.SINGLE_PART, new BigDecimal("300000"));
        product("RMT_R", "무선 리모컨", cat, ProductCategory.SINGLE_PART, new BigDecimal("20000"));
        comp(parent, "RMT_IN", BundleComponent.ComponentKind.INDOOR);
        // 리모컨이 isDefault=false (기본 미지정) → legacy: 기본 리모컨 0 → 리모컨 전부 제외
        componentRepository.save(BundleComponent.seed(parent.getId(), "RMT_R", BigDecimal.ONE,
                BundleComponent.QtyMode.FOLLOW_SET, BundleComponent.ComponentKind.REMOTE, null, false, null));
        flush();

        var lines = expander.expand("RMT_SET", BigDecimal.ONE);
        assertThat(lines).extracting(BundleExpander.ExpandedLine::modelCode).containsExactly("RMT_IN");
    }

    @Test
    void 상업멀티_구성품_개별단가_재배분없음_필터없음() {
        Category cat = categoryRepository.save(Category.create("COMM-SET", "test", null, 14));
        // 상업멀티 = SINGLE_SET 아님 → 옵션필터/재배분 미적용, 구성품 개별단가 유지
        Product parent = Product.seedFromSheet("DVM S2 8HP", "COMM_SET", cat,
                new BigDecimal("8000000"), new BigDecimal("8000000"),
                ProductType.BUNDLE, ProductCategory.COMMERCIAL_MULTI, UsageScope.BOTH, EstimateCategory.COMMERCIAL_MULTI);
        parent.changeBundle(ProductType.BUNDLE, BundleMode.EXPAND);
        parent = productRepository.save(parent);
        product("CM_A", "실외기 모듈", cat, ProductCategory.COMMERCIAL_PART, new BigDecimal("4000000"));
        product("CM_B", "실내기", cat, ProductCategory.COMMERCIAL_PART, new BigDecimal("1500000"));
        comp(parent, "CM_A", BundleComponent.ComponentKind.OUTDOOR);
        comp(parent, "CM_B", BundleComponent.ComponentKind.INDOOR);
        flush();

        var lines = expander.expand("COMM_SET", BigDecimal.ONE);
        assertThat(lines).hasSize(2);
        assertThat(unit(lines, "CM_A")).isEqualByComparingTo("4000000"); // 개별단가 유지(재배분 X)
        assertThat(unit(lines, "CM_B")).isEqualByComparingTo("1500000");
    }

    @Test
    void 싱글세트_실외기없는_구성은_원단가를_조용히_유지하지_않고_거부한다() {
        Category cat = categoryRepository.save(Category.create("MISSING-OUTDOOR", "test", null, 16));
        Product parent = bundleSet("MISSING_OUTDOOR_SET", "1way 냉난방", cat, new BigDecimal("500000"));
        product("MISSING_OUTDOOR_IN", "실내기", cat, ProductCategory.SINGLE_PART, new BigDecimal("300000"));
        comp(parent, "MISSING_OUTDOOR_IN", BundleComponent.ComponentKind.INDOOR);
        flush();

        assertThatThrownBy(() -> expander.expand("MISSING_OUTDOOR_SET", BigDecimal.ONE,
                new BundleExpander.ExpandOptions("", false, "", "원형", false,
                        new BigDecimal("450000"))))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("실내/실외 본체");
    }

    @Test
    void 다수_실내기_비례배분_마지막_잔차흡수() {
        Category cat = categoryRepository.save(Category.create("MULTI-IN", "test", null, 15));
        // 가정용 세트단가 1,000,000 → 실내 6/10=600,000(2 실내기 비례), 실외 4/10=400,000
        Product parent = bundleSet("MI_SET", "가정용 에어컨 무풍", cat, new BigDecimal("1000000"));
        product("MI_IN1", "실내기 대", cat, ProductCategory.SINGLE_PART, new BigDecimal("200000"));
        product("MI_IN2", "실내기 소", cat, ProductCategory.SINGLE_PART, new BigDecimal("100000"));
        product("MI_OUT", "실외기", cat, ProductCategory.SINGLE_PART, new BigDecimal("700000"));
        comp(parent, "MI_IN1", BundleComponent.ComponentKind.INDOOR);
        comp(parent, "MI_IN2", BundleComponent.ComponentKind.INDOOR);
        comp(parent, "MI_OUT", BundleComponent.ComponentKind.OUTDOOR);
        flush();

        var lines = expander.expand("MI_SET", BigDecimal.ONE);
        // 실내 600,000 비례: IN1 200/300→400,000(roundK), IN2 잔차=600,000-400,000=200,000
        assertThat(unit(lines, "MI_IN1")).isEqualByComparingTo("400000");
        assertThat(unit(lines, "MI_IN2")).isEqualByComparingTo("200000");
        assertThat(unit(lines, "MI_OUT")).isEqualByComparingTo("400000");
        // 합 = 세트단가 보존
        assertThat(unit(lines, "MI_IN1").add(unit(lines, "MI_IN2")).add(unit(lines, "MI_OUT")))
                .isEqualByComparingTo("1000000");
    }

    @Test
    void 관계_단가가_없으면_기존_전역_제품단가로_동작한다() {
        Category cat = categoryRepository.save(Category.create("GLOBAL-PRICE-FALLBACK", "test", null, 19));
        Product parent = bundleSet("FALLBACK_SET", "가정용 에어컨", cat, new BigDecimal("1000000"));
        product("FALLBACK_IN", "실내기", cat, ProductCategory.SINGLE_PART, new BigDecimal("300000"));
        product("FALLBACK_OUT", "실외기", cat, ProductCategory.SINGLE_PART, new BigDecimal("700000"));
        comp(parent, "FALLBACK_IN", BundleComponent.ComponentKind.INDOOR);
        comp(parent, "FALLBACK_OUT", BundleComponent.ComponentKind.OUTDOOR);
        flush();

        var lines = expander.expand("FALLBACK_SET", BigDecimal.ONE);

        assertThat(unit(lines, "FALLBACK_IN")).isEqualByComparingTo("600000");
        assertThat(unit(lines, "FALLBACK_OUT")).isEqualByComparingTo("400000");
    }

    @Test
    void 배분계약_데이터가_있으면_품명_휴리스틱이_아닌_비중과_고정금액을_쓴다() {
        Category cat = categoryRepository.save(Category.create("DATA-ALLOCATION", "test", null, 130));
        Product parent = bundleSet("DATA_ALLOCATION_SET", "1way 냉난방", cat, new BigDecimal("1000000"));
        product("DATA_IN", "실내기", cat, ProductCategory.SINGLE_PART, new BigDecimal("800000"));
        product("DATA_OUT", "실외기", cat, ProductCategory.SINGLE_PART, new BigDecimal("200000"));
        product("DATA_PANEL", "판넬", cat, ProductCategory.SINGLE_PART, new BigDecimal("999999"));
        BundleComponent indoor = BundleComponent.seed(parent.getId(), "DATA_IN", BigDecimal.ONE,
                BundleComponent.QtyMode.FOLLOW_SET, BundleComponent.ComponentKind.INDOOR, null, true, null);
        indoor.changeAllocation(BundleComponent.AllocationMode.AUTO, 2, null);
        BundleComponent outdoor = BundleComponent.seed(parent.getId(), "DATA_OUT", BigDecimal.ONE,
                BundleComponent.QtyMode.FOLLOW_SET, BundleComponent.ComponentKind.OUTDOOR, null, true, null);
        outdoor.changeAllocation(BundleComponent.AllocationMode.AUTO, 8, null);
        BundleComponent panel = BundleComponent.seed(parent.getId(), "DATA_PANEL", BigDecimal.ONE,
                BundleComponent.QtyMode.FOLLOW_SET, BundleComponent.ComponentKind.PANEL, null, true, null);
        panel.changeAllocation(BundleComponent.AllocationMode.FIXED, null, new BigDecimal("100000"));
        componentRepository.saveAll(List.of(indoor, outdoor, panel));
        flush();

        var lines = expander.expand("DATA_ALLOCATION_SET", BigDecimal.ONE);

        assertThat(unit(lines, "DATA_PANEL")).isEqualByComparingTo("100000");
        assertThat(unit(lines, "DATA_IN")).isEqualByComparingTo("180000");
        assertThat(unit(lines, "DATA_OUT")).isEqualByComparingTo("720000");
    }

    // ── helpers ─────────────────────────────────────────────
    @Test
    void RED_contract_rounding_matches_legacy_thousand_won_split() {
        Category cat = categoryRepository.save(Category.create("DATA-ROUNDING-RED", "test", null, 131));
        Product parent = bundleSet("DATA_ROUNDING_RED", "bundle", cat, new BigDecimal("999999"));
        product("ROUND_IN", "indoor", cat, ProductCategory.SINGLE_PART, new BigDecimal("800000"));
        product("ROUND_OUT", "outdoor", cat, ProductCategory.SINGLE_PART, new BigDecimal("200000"));

        BundleComponent indoor = BundleComponent.seed(parent.getId(), "ROUND_IN", BigDecimal.ONE,
                BundleComponent.QtyMode.FOLLOW_SET, BundleComponent.ComponentKind.INDOOR, null, true, null);
        indoor.changeAllocation(BundleComponent.AllocationMode.AUTO, 6, null);
        BundleComponent outdoor = BundleComponent.seed(parent.getId(), "ROUND_OUT", BigDecimal.ONE,
                BundleComponent.QtyMode.FOLLOW_SET, BundleComponent.ComponentKind.OUTDOOR, null, true, null);
        outdoor.changeAllocation(BundleComponent.AllocationMode.AUTO, 4, null);
        componentRepository.saveAll(List.of(indoor, outdoor));
        flush();

        var lines = expander.expand("DATA_ROUNDING_RED", BigDecimal.ONE);

        assertThat(unit(lines, "ROUND_IN")).isEqualByComparingTo("599001");
        assertThat(unit(lines, "ROUND_OUT")).isEqualByComparingTo("400998");
        assertThat(unit(lines, "ROUND_IN").add(unit(lines, "ROUND_OUT")))
                .isEqualByComparingTo("999999");
    }

    private Product bundleSet(String code, String name, Category cat, BigDecimal price) {
        Product p = Product.seedFromSheet(name, code, cat, price, price,
                ProductType.BUNDLE, ProductCategory.SINGLE_SET, UsageScope.BOTH, EstimateCategory.SINGLE_SET);
        p.changeBundle(ProductType.BUNDLE, BundleMode.EXPAND);
        return productRepository.save(p);
    }

    private Product product(String code, String name, Category cat, ProductCategory pc, BigDecimal price) {
        return productRepository.save(Product.seedFromSheet(name, code, cat, price, price,
                ProductType.SINGLE, pc, UsageScope.NONE, null));
    }

    private Product productWithAttributes(String code, String name, Category cat, ProductCategory pc,
                                          BigDecimal price, String panelType, String remoteType) {
        Product product = Product.seedFromSheet(name, code, cat, price, price,
                ProductType.SINGLE, pc, UsageScope.NONE, null);
        product.changeAttributes(panelType, remoteType);
        return productRepository.save(product);
    }

    private void comp(Product parent, String code, BundleComponent.ComponentKind kind) {
        componentRepository.save(BundleComponent.seed(parent.getId(), code, BigDecimal.ONE,
                BundleComponent.QtyMode.FOLLOW_SET, kind, null, true, null));
    }

    private void comp(Product parent, String code, BundleComponent.ComponentKind kind, String variant,
                      boolean isDefault, int displayOrder) {
        comp(parent, code, BigDecimal.ONE, BundleComponent.QtyMode.FOLLOW_SET, kind, variant, isDefault, displayOrder);
    }

    private void comp(Product parent, String code, BigDecimal defaultQty, BundleComponent.QtyMode qtyMode,
                      BundleComponent.ComponentKind kind, String variant, boolean isDefault, int displayOrder) {
        BundleComponent component = BundleComponent.seed(parent.getId(), code, defaultQty, qtyMode, kind, variant,
                isDefault, null);
        component.changeDisplayOrder(displayOrder);
        componentRepository.save(component);
    }

    private void flush() {
        productRepository.flush();
        componentRepository.flush();
    }

    private static BigDecimal unit(java.util.List<BundleExpander.ExpandedLine> lines, String code) {
        return lines.stream().filter(l -> l.modelCode().equals(code)).findFirst().orElseThrow().unitPrice();
    }
}
