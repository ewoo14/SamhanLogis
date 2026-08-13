package com.samhanair.logis.product.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;

import com.samhanair.logis.product.domain.Category;
import com.samhanair.logis.product.domain.Product;
import com.samhanair.logis.product.domain.ProductSpec;
import com.samhanair.logis.product.repository.CategoryRepository;
import com.samhanair.logis.product.repository.ProductRepository;
import com.samhanair.logis.product.repository.ProductSpecRepository;
import com.samhanair.logis.product.service.ProductService;
import com.samhanair.logis.product.web.dto.ProductSpecRequest;
import com.samhanair.logis.product.web.dto.UpdateProductRequest;
import java.math.BigDecimal;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.annotation.Rollback;
import org.springframework.transaction.annotation.Transactional;

/** 제품 상세 무변경 저장의 ProductSpec unique 충돌을 재현하는 RED 통합 테스트. */
@SpringBootTest
@Transactional
@Rollback
class ProductSpecNoChangeUpdateIT extends AbstractPostgresIT {

    @Autowired
    private CategoryRepository categoryRepository;

    @Autowired
    private ProductRepository productRepository;

    @Autowired
    private ProductSpecRepository productSpecRepository;

    @Autowired
    private ProductService productService;

    @Autowired
    private jakarta.persistence.EntityManager entityManager;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Test
    void 무변경_제품저장은_기존_spec을_그대로_보존하고_200_경로여야_한다_RED() {
        Category category = categoryRepository.findAll().stream().findFirst()
                .orElseGet(() -> categoryRepository.save(Category.create("QA_NOOP_SPEC", "QA 무변경 사양", null, 1)));
        Product product = productRepository.save(Product.create(
                "QA 무변경 제품", "QA-NOOP-SPEC-001", category,
                BigDecimal.valueOf(100_000), BigDecimal.valueOf(80_000), "KRW", null, null));
        ProductSpec spec = productSpecRepository.save(
                ProductSpec.create(product.getId(), "냉방능력, kW", "5.2", "kW", 1));
        entityManager.flush();
        var duplicateRows = jdbcTemplate.queryForList("""
                SELECT product_id, spec_key, COUNT(*) AS active_count
                  FROM product_spec
                 WHERE is_deleted = FALSE
                 GROUP BY product_id, spec_key
                HAVING COUNT(*) > 1
                """);
        System.out.println("SPEC_ACTIVE_DUPLICATES|" + duplicateRows);
        assertThat(duplicateRows).isEmpty();

        UpdateProductRequest request = new UpdateProductRequest(
                null, null, null, null, null, null, null, null, null, null, null, null, null,
                List.of(new ProductSpecRequest(spec.getSpecKey(), spec.getSpecValue(), spec.getUnit())));

        assertThatCode(() -> {
            productService.update(product.getId(), request);
            entityManager.flush();
        })
                .doesNotThrowAnyException();

        assertThat(productSpecRepository.findByProductIdOrderByDisplayOrderAsc(product.getId()))
                .extracting(ProductSpec::getSpecValue)
                .containsExactly("5.2");
    }

    @Test
    void 값이_바뀐_제품저장도_기존_spec을_교체한다() {
        Category category = categoryRepository.findAll().stream().findFirst()
                .orElseGet(() -> categoryRepository.save(Category.create("QA_CHANGED_SPEC", "QA 변경 사양", null, 1)));
        Product product = productRepository.save(Product.create(
                "QA 변경 제품", "QA-CHANGED-SPEC-001", category,
                BigDecimal.valueOf(100_000), BigDecimal.valueOf(80_000), "KRW", null, null));
        productSpecRepository.save(ProductSpec.create(product.getId(), "냉방능력, kW", "5.2", "kW", 1));
        entityManager.flush();

        assertThatCode(() -> {
            productService.update(product.getId(), new UpdateProductRequest(
                    null, null, null, null, null, null, null, null, null, null, null, null, null,
                    List.of(new ProductSpecRequest("냉방능력, kW", "6.0", "kW"))));
            entityManager.flush();
        }).doesNotThrowAnyException();

        assertThat(productSpecRepository.findByProductIdOrderByDisplayOrderAsc(product.getId()))
                .extracting(ProductSpec::getSpecValue)
                .containsExactly("6.0");
    }
}
