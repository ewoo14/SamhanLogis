package com.samhanair.logis.product.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.samhanair.logis.product.ProductServiceApplication;
import com.samhanair.logis.product.domain.Category;
import com.samhanair.logis.product.domain.Product;
import com.samhanair.logis.product.repository.CategoryRepository;
import com.samhanair.logis.product.repository.ProductRepository;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.transaction.annotation.Transactional;

/**
 * V1__init_product_service.sql 의 partial unique index / GIN 인덱스 / FK 제약 / SQLRestriction 을
 * 실제 PostgreSQL 컨테이너에 대해 검증한다. user-service EmployeeRepositoryIT 패턴을 따른다.
 *
 * <p>전제 (PM Plan §3.4):
 * <ul>
 *   <li>{@code Product.create(name, modelName, category, sellingPrice, purchasePrice, currency, tags, description)}
 *       — currency null 이면 KRW</li>
 *   <li>{@code Category.create(code, name, parent, displayOrder)}</li>
 *   <li>{@code ProductRepository.findByTagsContaining(jsonFilter)} — native query, jsonb @&gt; 연산</li>
 *   <li>{@code @SQLRestriction("is_deleted = false")} on Product</li>
 * </ul>
 */
@SpringBootTest(classes = ProductServiceApplication.class)
@Transactional
class ProductRepositoryIT extends AbstractPostgresIT {

    @Autowired
    private ProductRepository productRepository;

    @Autowired
    private CategoryRepository categoryRepository;

    @PersistenceContext
    private EntityManager entityManager;

    private Category indoorWall;

    @BeforeEach
    void setUp() {
        // V2__seed_product_categories.sql 시드를 우선 사용. 시드가 없거나 격리 위해 신규 생성.
        indoorWall = categoryRepository.findAll().stream()
                .filter(c -> "INDOOR_WALL".equals(c.getCode()))
                .findFirst()
                .orElseGet(() -> categoryRepository.save(
                        Category.create("INDOOR_WALL", "벽걸이형 실내기", null, 1)));
    }

    @Test
    void partialUniqueIndex_modelName_allowsReuseAfterSoftDelete() {
        Product first = productRepository.save(Product.create(
                "무풍에어컨 18평", "AR18T9170WCN", indoorWall,
                new BigDecimal("1500000"), new BigDecimal("1100000"),
                "KRW", Map.of("전압", "220V"), "원본"));
        productRepository.flush();

        first.markDeleted("test");
        productRepository.save(first);
        productRepository.flush();

        // 동일 modelName 으로 재등록 — partial unique index (WHERE is_deleted = FALSE) 덕분에 통과해야 한다.
        Product reborn = productRepository.save(Product.create(
                "무풍에어컨 18평 (재등록)", "AR18T9170WCN", indoorWall,
                new BigDecimal("1600000"), new BigDecimal("1150000"),
                "KRW", Map.of("전압", "220V"), "재등록 본"));
        productRepository.flush();

        assertThat(reborn.getId()).isNotNull();
        assertThat(reborn.getId()).isNotEqualTo(first.getId());
    }

    @Test
    void gin_tags_contains_returnsMatchingProducts() {
        productRepository.save(Product.create(
                "벽걸이 220V", "WALL-220", indoorWall,
                new BigDecimal("900000"), new BigDecimal("700000"),
                "KRW", Map.of("전압", "220V", "냉방평수", "7"), null));
        productRepository.save(Product.create(
                "벽걸이 380V", "WALL-380", indoorWall,
                new BigDecimal("1200000"), new BigDecimal("950000"),
                "KRW", Map.of("전압", "380V", "냉방평수", "12"), null));
        productRepository.save(Product.create(
                "벽걸이 220V 대형", "WALL-220-BIG", indoorWall,
                new BigDecimal("1400000"), new BigDecimal("1050000"),
                "KRW", Map.of("냉방평수", "18"), null)); // 전압 키 자체가 없음
        productRepository.flush();
        entityManager.clear(); // native 쿼리 결과가 1차 캐시와 충돌하지 않도록.

        // BE 의 통합 search() 메서드를 사용 (Plan 의 findByTagsContaining 단일메서드는 BE 의도적 변경으로 search 로 합쳐짐).
        // tagFilter 만 사용, 다른 필터는 null. PageRequest 는 충분히 큰 size.
        Page<Product> matched = productRepository.search(null, null, null, "{\"전압\":\"220V\"}", PageRequest.of(0, 100));

        assertThat(matched.getContent()).extracting(Product::getModelName)
                .containsExactlyInAnyOrder("WALL-220");
    }

    @Test
    void sqlRestrictionFilter_hidesDeletedRowsFromFindAll() {
        productRepository.save(Product.create(
                "활성 모델", "ALIVE-001", indoorWall,
                new BigDecimal("500000"), new BigDecimal("400000"),
                "KRW", Map.of(), null));
        Product gone = productRepository.save(Product.create(
                "단종 후 삭제 모델", "GONE-001", indoorWall,
                new BigDecimal("600000"), new BigDecimal("450000"),
                "KRW", Map.of(), null));
        gone.markDeleted("test");
        productRepository.save(gone);
        productRepository.flush();
        entityManager.clear();

        List<Product> all = productRepository.findAll();
        assertThat(all).extracting(Product::getModelName)
                .contains("ALIVE-001")
                .doesNotContain("GONE-001");
    }

    @Test
    void categoryFkConstraint_blocksOrphanProductInsert() {
        // 존재하지 않는 category id 로 강제 매핑 — JPA cascade 가 우회되도록 detached Category 사용.
        Category orphan = Category.create("DUMMY", "더미", null, 999);
        // 영속화하지 않은 Category — JPA 가 "TransientPropertyValueException" 또는 FK 위반을 던져야 한다.
        Product bad = Product.create(
                "고아 제품", "ORPHAN-001", orphan,
                new BigDecimal("100000"), new BigDecimal("80000"),
                "KRW", Map.of(), null);

        assertThatThrownBy(() -> {
            productRepository.save(bad);
            productRepository.flush();
        }).isInstanceOfAny(
                DataIntegrityViolationException.class,
                org.springframework.dao.InvalidDataAccessApiUsageException.class,
                IllegalStateException.class
        );
    }

    /**
     * #노출구분 — findExposedCatalog: 카테고리 + 노출범위(usageScope) 필터 + 시트순서(display_order)
     * 정렬(NULLS LAST). 개발책임자 결정(2026-06-10): 견적/주문엔 designated 품목만, 시트 순서 유지.
     */
    @Test
    void findExposedCatalog_filtersByUsageScope_ordersByDisplayOrder() {
        // SINGLE_SET 4종: BOTH(노출, order 2,1), NONE(미노출), ESTIMATE(노출, order null)
        Product b2 = seedSingle("노출2", "S-EXP-2",
                com.samhanair.logis.product.domain.UsageScope.BOTH, 2);
        Product b1 = seedSingle("노출1", "S-EXP-1",
                com.samhanair.logis.product.domain.UsageScope.BOTH, 1);
        Product none = seedSingle("미노출", "S-NONE",
                com.samhanair.logis.product.domain.UsageScope.NONE, 3);
        Product estNull = seedSingle("노출순번없음", "S-EST-NULL",
                com.samhanair.logis.product.domain.UsageScope.ESTIMATE, null);
        productRepository.flush();
        entityManager.clear();

        List<Product> exposed = productRepository.findExposedCatalog(
                com.samhanair.logis.product.domain.ProductCategory.SINGLE_SET,
                List.of(com.samhanair.logis.product.domain.UsageScope.ESTIMATE,
                        com.samhanair.logis.product.domain.UsageScope.BOTH));

        // NONE 제외 + display_order ASC(1,2) 후 NULL 후순위
        assertThat(exposed).extracting(Product::getModelCode)
                .containsExactly("S-EXP-1", "S-EXP-2", "S-EST-NULL");
    }

    private Product seedSingle(String name, String modelCode,
            com.samhanair.logis.product.domain.UsageScope scope, Integer displayOrder) {
        Product p = Product.seedFromSheet(name, modelCode, indoorWall,
                new BigDecimal("1000000"), new BigDecimal("800000"),
                com.samhanair.logis.product.domain.ProductType.SINGLE,
                com.samhanair.logis.product.domain.ProductCategory.SINGLE_SET,
                scope,
                scope == com.samhanair.logis.product.domain.UsageScope.NONE
                        ? null : com.samhanair.logis.product.domain.EstimateCategory.SINGLE_SET);
        p.changeDisplayOrder(displayOrder);
        return productRepository.save(p);
    }

    @SuppressWarnings("unused")
    private static UUID anyId() {
        return UUID.randomUUID();
    }
}
