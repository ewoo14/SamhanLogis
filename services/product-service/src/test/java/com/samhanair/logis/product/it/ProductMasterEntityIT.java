package com.samhanair.logis.product.it;

import static org.assertj.core.api.Assertions.assertThat;

import com.samhanair.logis.product.domain.BundleMode;
import com.samhanair.logis.product.domain.Category;
import com.samhanair.logis.product.domain.EstimateCategory;
import com.samhanair.logis.product.domain.MaterialKey;
import com.samhanair.logis.product.domain.Product;
import com.samhanair.logis.product.domain.ProductCategory;
import com.samhanair.logis.product.domain.ProductType;
import com.samhanair.logis.product.domain.UsageScope;
import com.samhanair.logis.product.repository.CategoryRepository;
import com.samhanair.logis.product.repository.ProductRepository;
import java.math.BigDecimal;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.transaction.annotation.Transactional;

/**
 * V3 마이그 신규 10 컬럼 + Hibernate 매핑 정합성 IT.
 *
 * <p>Layer 5 (schema validation): {@code ddl-auto=validate} 가 entity ↔ V3 SQL 1:1 매칭
 * 강제. 본 IT 는 신규 컬럼 round-trip + enum CHECK 제약 + composite index 사용 검증.
 */
@SpringBootTest
@DirtiesContext
@WithMockUser(username = "test-user")
@Transactional
class ProductMasterEntityIT extends AbstractPostgresIT {

    @Autowired
    private ProductRepository productRepository;

    @Autowired
    private CategoryRepository categoryRepository;

    private Category cat;

    @BeforeEach
    void setupCategory() {
        cat = categoryRepository.save(Category.create("HVAC-TEST", "테스트 카테고리", null, 99));
    }

    @Test
    void 신규_10컬럼_저장_조회_round_trip() {
        Product p = Product.seedFromSheet(
                "DVM_HOME 테스트", "AJ060MXHNBC1", cat,
                new BigDecimal("2763200.00"), new BigDecimal("1519760.00"),
                ProductType.SINGLE, ProductCategory.HOME_MULTI,
                UsageScope.BOTH, EstimateCategory.HOME_MULTI);
        p.applyDiscountRules(true, MaterialKey.D4, false, new BigDecimal("0.4500"));
        p.changeBundle(ProductType.BUNDLE, BundleMode.EXPAND);
        p.changeDiscountFlags("100010");
        p.changeRemark("테스트 비고");

        Product saved = productRepository.saveAndFlush(p);

        Product fetched = productRepository.findById(saved.getId()).orElseThrow();
        assertThat(fetched.getModelCode()).isEqualTo("AJ060MXHNBC1");
        assertThat(fetched.getProductType()).isEqualTo(ProductType.BUNDLE);
        assertThat(fetched.getBundleMode()).isEqualTo(BundleMode.EXPAND);
        assertThat(fetched.getHasVariableDiscount()).isTrue();
        assertThat(fetched.getSetMaterialKey()).isEqualTo(MaterialKey.D4);
        assertThat(fetched.getLegacyDiscountFlag()).isFalse();
        assertThat(fetched.getDiscountFlags()).isEqualTo("100010");
        assertThat(fetched.getReleasePrice()).isEqualByComparingTo("2763200.00");
        assertThat(fetched.getDeliveryPrice()).isEqualByComparingTo("1519760.00");
        assertThat(fetched.getUsageScope()).isEqualTo(UsageScope.BOTH);
        assertThat(fetched.getEstimateCategory()).isEqualTo(EstimateCategory.HOME_MULTI);
        assertThat(fetched.getProductCategory()).isEqualTo(ProductCategory.HOME_MULTI);
        assertThat(fetched.getRemark()).isEqualTo("테스트 비고");
    }

    @Test
    void modelCode_unique_active_index_정합() {
        Product p1 = Product.seedFromSheet("싱글 세트 7HP", "AC070JCTPCH", cat,
                new BigDecimal("3000000"), new BigDecimal("1800000"),
                ProductType.BUNDLE, ProductCategory.SINGLE_SET,
                UsageScope.BOTH, EstimateCategory.SINGLE_SET);
        productRepository.saveAndFlush(p1);

        // 동일 modelCode 다시 저장 → unique index 위반
        Product p2 = Product.seedFromSheet("싱글 세트 7HP dup", "AC070JCTPCH", cat,
                new BigDecimal("3000000"), new BigDecimal("1800000"),
                ProductType.BUNDLE, ProductCategory.SINGLE_SET,
                UsageScope.BOTH, EstimateCategory.SINGLE_SET);

        org.junit.jupiter.api.Assertions.assertThrows(
                org.springframework.dao.DataIntegrityViolationException.class,
                () -> productRepository.saveAndFlush(p2));
    }

    @Test
    void searchByUsageScope_필터_정상() {
        Product home = Product.seedFromSheet("Home", "MC001", cat,
                BigDecimal.ZERO, BigDecimal.ZERO, ProductType.SINGLE,
                ProductCategory.HOME_MULTI, UsageScope.BOTH, EstimateCategory.HOME_MULTI);
        Product part = Product.seedFromSheet("Part", "MC002", cat,
                BigDecimal.ZERO, BigDecimal.ZERO, ProductType.SINGLE,
                ProductCategory.SINGLE_PART, UsageScope.NONE, null);
        productRepository.saveAll(java.util.List.of(home, part));
        productRepository.flush();

        var page = productRepository.searchByUsageScope("BOTH", "HOME_MULTI", null,
                org.springframework.data.domain.PageRequest.of(0, 10));
        assertThat(page.getContent()).extracting(Product::getModelCode).contains("MC001").doesNotContain("MC002");
    }
}
