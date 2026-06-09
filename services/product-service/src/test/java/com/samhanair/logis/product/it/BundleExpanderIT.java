package com.samhanair.logis.product.it;

import static org.assertj.core.api.Assertions.assertThat;

import com.samhanair.logis.product.domain.BundleComponent;
import com.samhanair.logis.product.domain.BundleMode;
import com.samhanair.logis.product.domain.Category;
import com.samhanair.logis.product.domain.EstimateCategory;
import com.samhanair.logis.product.domain.Product;
import com.samhanair.logis.product.domain.ProductCategory;
import com.samhanair.logis.product.domain.ProductType;
import com.samhanair.logis.product.domain.UsageScope;
import com.samhanair.logis.product.repository.BundleComponentRepository;
import com.samhanair.logis.product.repository.CategoryRepository;
import com.samhanair.logis.product.repository.ProductRepository;
import com.samhanair.logis.product.service.BundleExpander;
import java.math.BigDecimal;
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

    @Test
    void EXPAND_모드_component_펼침_FOLLOW_SET_qty_곱() {
        Category cat = categoryRepository.save(Category.create("BUNDLE-TEST-EXP", "test", null, 1));
        Product parent = Product.seedFromSheet("BUNDLE 부모", "BUND001", cat,
                BigDecimal.ZERO, BigDecimal.ZERO,
                ProductType.BUNDLE, ProductCategory.SINGLE_SET,
                UsageScope.BOTH, EstimateCategory.SINGLE_SET);
        parent.changeBundle(ProductType.BUNDLE, BundleMode.EXPAND);
        parent = productRepository.save(parent);

        componentRepository.save(BundleComponent.seed(parent.getId(), "C001",
                new BigDecimal("1"), BundleComponent.QtyMode.FOLLOW_SET,
                BundleComponent.ComponentKind.INDOOR, "기본", true, null));
        componentRepository.save(BundleComponent.seed(parent.getId(), "C002",
                new BigDecimal("2"), BundleComponent.QtyMode.FIXED,
                BundleComponent.ComponentKind.PANEL, null, false, null));
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
        var lines = expander.expand("OPT_SET", BigDecimal.ONE, opts);
        assertThat(lines).extracting(BundleExpander.ExpandedLine::modelCode)
                .containsExactly("PNL_B"); // 블랙 판넬만(화이트 제외, 자재 제외)
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

    // ── helpers ─────────────────────────────────────────────
    private Product bundleSet(String code, String name, Category cat, BigDecimal price) {
        Product p = Product.seedFromSheet(name, code, cat, price, price,
                ProductType.BUNDLE, ProductCategory.SINGLE_SET, UsageScope.BOTH, EstimateCategory.SINGLE_SET);
        p.changeBundle(ProductType.BUNDLE, BundleMode.EXPAND);
        return productRepository.save(p);
    }

    private void product(String code, String name, Category cat, ProductCategory pc, BigDecimal price) {
        productRepository.save(Product.seedFromSheet(name, code, cat, price, price,
                ProductType.SINGLE, pc, UsageScope.NONE, null));
    }

    private void comp(Product parent, String code, BundleComponent.ComponentKind kind) {
        componentRepository.save(BundleComponent.seed(parent.getId(), code, BigDecimal.ONE,
                BundleComponent.QtyMode.FOLLOW_SET, kind, null, false, null));
    }

    private void flush() {
        productRepository.flush();
        componentRepository.flush();
    }

    private static BigDecimal unit(java.util.List<BundleExpander.ExpandedLine> lines, String code) {
        return lines.stream().filter(l -> l.modelCode().equals(code)).findFirst().orElseThrow().unitPrice();
    }
}
