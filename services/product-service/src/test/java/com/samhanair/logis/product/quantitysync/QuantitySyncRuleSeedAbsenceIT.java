package com.samhanair.logis.product.quantitysync;

import static org.assertj.core.api.Assertions.assertThat;

import com.samhanair.logis.product.ProductServiceApplication;
import com.samhanair.logis.product.it.AbstractPostgresIT;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * 실 snapshot 미확보 정책을 잠그는 통합 테스트.
 *
 * <p>향후 누군가 H-07/C-09 설정을 무심코 추가하면 이 테스트가 RED가 되어 legacy evaluator
 * 소유권 경계를 알린다.
 */
@SpringBootTest(classes = ProductServiceApplication.class)
class QuantitySyncRuleSeedAbsenceIT extends AbstractPostgresIT {

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Test
    void H07과_C09는_수량동기화_설정레코드가_없어야_한다() {
        Integer forbiddenRules = jdbcTemplate.queryForObject("""
                SELECT count(*)
                  FROM quantity_sync_rule
                 WHERE is_deleted = false
                   AND (rule_key ILIKE '%H-07%'
                        OR rule_key ILIKE '%C-09%'
                        OR legacy_ref ILIKE '%H-07%'
                        OR legacy_ref ILIKE '%C-09%')
                """, Integer.class);

        assertThat(forbiddenRules).isZero();
    }
}
