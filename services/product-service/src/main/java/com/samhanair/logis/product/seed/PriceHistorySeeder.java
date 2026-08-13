package com.samhanair.logis.product.seed;

import com.samhanair.logis.product.domain.PriceHistory;
import com.samhanair.logis.product.domain.Product;
import com.samhanair.logis.product.domain.ProductCategory;
import com.samhanair.logis.product.repository.PriceHistoryRepository;
import com.samhanair.logis.product.repository.ProductRepository;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.nio.charset.StandardCharsets;
import java.sql.Timestamp;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.CommandLineRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Profile;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * #773 S1a — dev 환경용 price_history 결정적 시더.
 *
 * <p><b>이중 가드</b>: {@code @Profile("dev")} +
 * {@code app.seed-test-data=true} 둘 다 만족할 때만 실행한다. 운영/스테이징
 * price_history 는 Google Sheets sync 가 원천이며, 본 시더는 실 자격 없이도 dev
 * 재검증 기준 단가를 만들기 위한 결정적 fallback 이다.
 *
 * <p><b>시드 룰</b>:
 * <ul>
 *     <li>인상 후: {@code 2026-04-01}, Product.releasePrice / deliveryPrice 그대로</li>
 *     <li>인상 전: {@code 2000-01-01}, 인상 후 단가 × 0.9</li>
 *     <li>구형({@link ProductCategory#OLD})은 단가를 바꾸지 않고 현재가를 baseline에도 복제</li>
 * </ul>
 *
 * <p>인상 전 0.9 배수는 실제 정책이 아니라 dev fixture 의 결정적 델타다. 실 운영
 * 데이터는 {@code ProductSheetSyncService} 의 시트 기반 price_history sync 가 채운다.
 *
 * <p><b>결정적 UUID</b>: {@code samhan-seed:price-history:<productId>|<effectiveDate>}.
 * Hibernate {@code @UuidGenerator} 우회를 위해 {@link JdbcTemplate} native INSERT 를 사용한다.
 */
@Component
@Profile("dev")
@ConditionalOnProperty(value = "app.seed-test-data", havingValue = "true")
@Order(200)
public class PriceHistorySeeder implements CommandLineRunner {

    private static final Logger log = LoggerFactory.getLogger(PriceHistorySeeder.class);

    private static final LocalDate BEFORE_INCREASE_DATE = LocalDate.of(2000, 1, 1);
    private static final LocalDate AFTER_INCREASE_DATE = LocalDate.of(2026, 4, 1);
    private static final BigDecimal BEFORE_INCREASE_RATE = new BigDecimal("0.9");

    private final ProductRepository productRepository;
    private final PriceHistoryRepository priceHistoryRepository;
    private final JdbcTemplate jdbcTemplate;

    public PriceHistorySeeder(ProductRepository productRepository,
                              PriceHistoryRepository priceHistoryRepository,
                              JdbcTemplate jdbcTemplate) {
        this.productRepository = productRepository;
        this.priceHistoryRepository = priceHistoryRepository;
        this.jdbcTemplate = jdbcTemplate;
    }

    @Override
    public void run(String... args) {
        List<Product> products = productRepository.findAll();
        if (products.isEmpty()) {
            log.warn("PriceHistorySeeder skipped — no products found (HvacProductSeeder must run first)");
            return;
        }

        int created = 0;
        int skipped = 0;
        for (Product product : products) {
            try {
                SeedResult after = seedIfMissing(product, AFTER_INCREASE_DATE,
                        product.getReleasePrice(), product.getDeliveryPrice());
                created += after.created();
                skipped += after.skipped();

                BigDecimal beforeRelease = product.getProductCategory() == ProductCategory.OLD
                        ? product.getReleasePrice()
                        : devBeforeIncreasePrice(product.getReleasePrice());
                BigDecimal beforeDelivery = product.getProductCategory() == ProductCategory.OLD
                        ? product.getDeliveryPrice()
                        : devBeforeIncreasePrice(product.getDeliveryPrice());
                SeedResult before = seedIfMissing(product, BEFORE_INCREASE_DATE,
                        beforeRelease, beforeDelivery);
                created += before.created();
                skipped += before.skipped();
            } catch (RuntimeException ex) {
                log.error("Failed to seed price_history for product {}: {}",
                        product.getId(), ex.getMessage(), ex);
            }
        }

        log.info("PriceHistorySeeder created {} price_history rows (skipped {}, products {})",
                created, skipped, products.size());
    }

    private SeedResult seedIfMissing(Product product, LocalDate effectiveDate,
                                     BigDecimal releasePrice, BigDecimal deliveryPrice) {
        if (priceHistoryRepository.existsByProductIdAndEffectiveDate(product.getId(), effectiveDate)) {
            return SeedResult.ofSkipped();
        }
        PriceHistory history = PriceHistory.seed(product.getId(), effectiveDate,
                releasePrice, deliveryPrice, null);
        UUID id = deterministicId("price-history", product.getId() + "|" + effectiveDate);
        insertPriceHistoryNative(id, history);
        return SeedResult.ofCreated();
    }

    private static BigDecimal devBeforeIncreasePrice(BigDecimal currentPrice) {
        return currentPrice.multiply(BEFORE_INCREASE_RATE).setScale(2, RoundingMode.HALF_UP);
    }

    /**
     * {@code samhan-seed:<type>:<key>} 결정적 UUID 도출 — HvacProductSeeder 와 같은 namespace 규칙.
     */
    private static UUID deterministicId(String type, String key) {
        return UUID.nameUUIDFromBytes(
                ("samhan-seed:" + type + ":" + key).getBytes(StandardCharsets.UTF_8));
    }

    private void insertPriceHistoryNative(UUID id, PriceHistory history) {
        Timestamp now = Timestamp.valueOf(LocalDateTime.now());
        jdbcTemplate.update(
                "INSERT INTO price_history ("
                        + "  id, product_id, effective_date,"
                        + "  release_price, delivery_price, set_material_key,"
                        + "  created_at, created_by, is_deleted"
                        + ") VALUES ("
                        + "  ?, ?, ?,"
                        + "  ?, ?, ?,"
                        + "  ?, ?, ?"
                        + ")",
                id,
                history.getProductId(),
                history.getEffectiveDate(),
                history.getReleasePrice(),
                history.getDeliveryPrice(),
                history.getSetMaterialKey() == null ? null : history.getSetMaterialKey().name(),
                now,
                "system",
                false
        );
    }

    private record SeedResult(int created, int skipped) {
        static SeedResult ofCreated() {
            return new SeedResult(1, 0);
        }

        static SeedResult ofSkipped() {
            return new SeedResult(0, 1);
        }
    }
}
