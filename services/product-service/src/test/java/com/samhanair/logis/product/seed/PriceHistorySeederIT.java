package com.samhanair.logis.product.seed;

import static org.assertj.core.api.Assertions.assertThat;

import com.samhanair.logis.product.ProductServiceApplication;
import com.samhanair.logis.product.domain.Category;
import com.samhanair.logis.product.domain.EstimateCategory;
import com.samhanair.logis.product.domain.PriceHistory;
import com.samhanair.logis.product.domain.Product;
import com.samhanair.logis.product.domain.ProductCategory;
import com.samhanair.logis.product.domain.ProductType;
import com.samhanair.logis.product.domain.UsageScope;
import com.samhanair.logis.product.it.AbstractPostgresIT;
import com.samhanair.logis.product.repository.CategoryRepository;
import com.samhanair.logis.product.repository.PriceHistoryRepository;
import com.samhanair.logis.product.repository.ProductRepository;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;

/** PriceHistorySeeder seeding logic integration tests. */
@SpringBootTest(classes = ProductServiceApplication.class)
@Transactional
class PriceHistorySeederIT extends AbstractPostgresIT {

    private static final LocalDate BEFORE_INCREASE_DATE = LocalDate.of(2000, 1, 1);
    private static final LocalDate AFTER_INCREASE_DATE = LocalDate.of(2026, 4, 1);

    @Autowired
    private CategoryRepository categoryRepository;

    @Autowired
    private ProductRepository productRepository;

    @Autowired
    private PriceHistoryRepository priceHistoryRepository;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Test
    void run_seedsCurrentAndBaselinePriceHistoryForRegularProduct() {
        Product product = seedProduct("IT_SEED_REGULAR", ProductCategory.HOME_MULTI,
                new BigDecimal("100000"), new BigDecimal("80000"));

        runSeeder();

        Map<LocalDate, PriceHistory> rows = priceHistoryByDate(product);
        assertThat(rows).hasSize(2);
        assertThat(rows.get(AFTER_INCREASE_DATE).getReleasePrice()).isEqualByComparingTo("100000");
        assertThat(rows.get(AFTER_INCREASE_DATE).getDeliveryPrice()).isEqualByComparingTo("80000");
        assertThat(rows.get(BEFORE_INCREASE_DATE).getReleasePrice()).isEqualByComparingTo("90000.00");
        assertThat(rows.get(BEFORE_INCREASE_DATE).getDeliveryPrice()).isEqualByComparingTo("72000.00");
    }

    @Test
    void run_seedsCurrentAndBaselinePriceHistoryForOldProductWithoutChangingPrices() {
        Product product = seedProduct("IT_SEED_OLD", ProductCategory.OLD,
                new BigDecimal("100000"), new BigDecimal("80000"));

        runSeeder();

        Map<LocalDate, PriceHistory> rows = priceHistoryByDate(product);
        assertThat(rows).hasSize(2);
        assertThat(rows).containsKey(AFTER_INCREASE_DATE);
        assertThat(rows).containsKey(BEFORE_INCREASE_DATE);
        assertThat(rows.get(BEFORE_INCREASE_DATE).getReleasePrice())
                .isEqualByComparingTo(product.getReleasePrice());
        assertThat(rows.get(BEFORE_INCREASE_DATE).getDeliveryPrice())
                .isEqualByComparingTo(product.getDeliveryPrice());
    }

    @Test
    void run_isIdempotentForAlreadySeededPriceHistory() {
        Product product = seedProduct("IT_SEED_IDEMPOTENT", ProductCategory.HOME_MULTI,
                new BigDecimal("100000"), new BigDecimal("80000"));
        runSeeder();
        List<UUID> firstRunIds = priceHistoryRepository.findByProductIdOrderByEffectiveDateDesc(product.getId())
                .stream()
                .map(PriceHistory::getId)
                .toList();

        runSeeder();

        List<PriceHistory> rows = priceHistoryRepository.findByProductIdOrderByEffectiveDateDesc(product.getId());
        assertThat(rows).hasSize(2);
        assertThat(rows.stream().map(PriceHistory::getId).toList()).containsExactlyElementsOf(firstRunIds);
    }

    @Test
    void run_usesDeterministicUuidForSameProductIdAndEffectiveDate() {
        Product product = seedProduct("IT_SEED_UUID", ProductCategory.HOME_MULTI,
                new BigDecimal("100000"), new BigDecimal("80000"));

        runSeeder();

        PriceHistory afterIncrease = priceHistoryRepository
                .findByProductIdAndEffectiveDate(product.getId(), AFTER_INCREASE_DATE)
                .orElseThrow();
        UUID expected = deterministicId("price-history", product.getId() + "|" + AFTER_INCREASE_DATE);
        UUID recalculated = deterministicId("price-history", product.getId() + "|" + AFTER_INCREASE_DATE);
        assertThat(afterIncrease.getId()).isEqualTo(expected);
        assertThat(recalculated).isEqualTo(expected);
    }

    private Product seedProduct(String modelCode, ProductCategory productCategory,
                                BigDecimal releasePrice, BigDecimal deliveryPrice) {
        Category category = categoryRepository.save(Category.create("CAT-" + modelCode,
                "price history seeder IT", null, 60));
        Product product = Product.seedFromSheet("Seeder Price " + modelCode, modelCode, category,
                releasePrice, deliveryPrice, ProductType.SINGLE,
                productCategory, UsageScope.BOTH, EstimateCategory.HOME_MULTI);
        Product saved = productRepository.save(product);
        productRepository.flush();
        return saved;
    }

    private void runSeeder() {
        new PriceHistorySeeder(productRepository, priceHistoryRepository, jdbcTemplate).run((String[]) null);
    }

    private Map<LocalDate, PriceHistory> priceHistoryByDate(Product product) {
        return priceHistoryRepository.findByProductIdOrderByEffectiveDateDesc(product.getId())
                .stream()
                .collect(Collectors.toMap(PriceHistory::getEffectiveDate, Function.identity()));
    }

    private static UUID deterministicId(String type, String key) {
        return UUID.nameUUIDFromBytes(
                ("samhan-seed:" + type + ":" + key).getBytes(StandardCharsets.UTF_8));
    }
}
