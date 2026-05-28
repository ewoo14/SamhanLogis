package com.samhanair.logis.auth.it;

import static org.assertj.core.api.Assertions.assertThat;

import com.samhanair.logis.auth.AuthServiceApplication;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.TestPropertySource;

/** V39 이 guard-gated page 의 기존 권한 효과를 확대하지 않는지 검증한다. */
@SpringBootTest(classes = AuthServiceApplication.class)
@TestPropertySource(properties = "spring.profiles.active=local")
class V39GuardGatedPageIT extends AbstractPostgresIT {

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Test
    @DisplayName("estimates.list 는 기존 V10 VIEW/EDIT 효과 이상으로 확대되지 않는다")
    void estimatesListPreservesExistingEffect() {
        assertThat(flag("ACCOUNTANT", "estimates.list", "can_view")).isTrue();
        assertThat(flag("ACCOUNTANT", "estimates.list", "can_create")).isFalse();
        assertThat(flag("SALES", "estimates.list", "can_create")).isTrue();
        assertThat(flag("WAREHOUSE", "estimates.list", "can_view")).isFalse();
    }

    @Test
    @DisplayName("products/sales.partner-order 전용 view page 는 mutation 으로 확대되지 않는다")
    void dedicatedViewPagesDoNotGainMutations() {
        assertThat(flag("SALES", "products.list.view", "can_view")).isTrue();
        assertThat(flag("SALES", "products.list.view", "can_create")).isFalse();
        assertThat(flag("SALES", "sales.partner-order.history.view", "can_view")).isTrue();
        assertThat(flag("SALES", "sales.partner-order.history.view", "can_update")).isFalse();
    }

    private Boolean flag(String roleCode, String pageCode, String column) {
        return jdbcTemplate.queryForObject("""
                SELECT %s
                FROM role_page_permission_templates
                WHERE role_code = ? AND page_code = ? AND is_deleted = FALSE
                """.formatted(column), Boolean.class, roleCode, pageCode);
    }
}
