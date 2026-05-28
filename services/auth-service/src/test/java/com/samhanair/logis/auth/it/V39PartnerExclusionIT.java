package com.samhanair.logis.auth.it;

import static org.assertj.core.api.Assertions.assertThat;

import com.samhanair.logis.auth.AuthServiceApplication;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.TestPropertySource;

/** V39 account materialize 단계의 PARTNER 제외 검증. */
@SpringBootTest(classes = AuthServiceApplication.class)
@TestPropertySource(properties = "spring.profiles.active=local")
class V39PartnerExclusionIT extends AbstractPostgresIT {

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Test
    @DisplayName("PARTNER role 계정에는 account_page_permissions 행을 만들지 않는다")
    void partnerAccountsExcludedFromAccountPermissions() {
        Integer count = jdbcTemplate.queryForObject("""
                SELECT COUNT(*)
                FROM account_page_permissions app
                JOIN accounts a ON a.id = app.account_id
                WHERE a.role = 'PARTNER'
                  AND app.is_deleted = FALSE
                """, Integer.class);

        assertThat(count).isZero();
    }
}
