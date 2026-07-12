package com.samhanair.logis.product.seed;

import static org.assertj.core.api.Assertions.assertThat;

import com.samhanair.logis.product.ProductServiceApplication;
import com.samhanair.logis.product.it.AbstractPostgresIT;
import com.samhanair.logis.product.repository.CategoryRepository;
import com.samhanair.logis.product.repository.ProductRepository;
import java.math.BigDecimal;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;

/** HvacProductSeeder dev fixture 고정DC율 native INSERT 통합 테스트. */
@SpringBootTest(classes = ProductServiceApplication.class)
@Transactional
class HvacProductSeederIT extends AbstractPostgresIT {

    @Autowired
    private ProductRepository productRepository;

    @Autowired
    private CategoryRepository categoryRepository;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Test
    void run_seedsFixedDiscountRateAsPercentForMultiProducts() {
        runSeeder();

        BigDecimal standRate = fixedDiscountRate("AF15BX1NWAEAH-31");
        BigDecimal systemRate = fixedDiscountRate("AM030BNNDEH-51");

        assertThat(standRate).isEqualByComparingTo("45.00");
        assertThat(systemRate).isEqualByComparingTo("45.00");
        assertThat(standRate).isBetween(new BigDecimal("0.00"), new BigDecimal("100.00"));
        assertThat(systemRate).isBetween(new BigDecimal("0.00"), new BigDecimal("100.00"));
    }

    @Test
    void run_keepsSingleProductsWithoutFixedDiscountRate() {
        runSeeder();

        BigDecimal singleRate = fixedDiscountRate("AR05TXEAAWKNEU-01");

        assertThat(singleRate).isNull();
    }

    @Test
    void run_seedsItemFixedDiscountRateAsPercent() {
        runSeeder();

        BigDecimal itemRate = fixedDiscountRate("PIPE-CU-15A");

        assertThat(itemRate).isEqualByComparingTo("35.00");
        assertThat(itemRate).isBetween(new BigDecimal("0.00"), new BigDecimal("100.00"));
    }

    private void runSeeder() {
        new HvacProductSeeder(productRepository, categoryRepository, jdbcTemplate).run((String[]) null);
    }

    private BigDecimal fixedDiscountRate(String modelName) {
        return jdbcTemplate.queryForObject("""
                SELECT fixed_discount_rate
                  FROM products
                 WHERE model_name = ?
                   AND is_deleted = false
                """, BigDecimal.class, modelName);
    }
}
