package com.samhanair.logis.auth.it;

import static org.assertj.core.api.Assertions.assertThat;

import com.samhanair.logis.auth.AuthServiceApplication;
import java.util.UUID;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;

/** V95 마감 전표일 예외 권한이 실 계정 enforcement cache까지 materialize되는지 검증한다. */
@SpringBootTest(
        classes = AuthServiceApplication.class,
        webEnvironment = SpringBootTest.WebEnvironment.NONE
)
class AuthFlywayV95SeedIT extends AbstractPostgresIT {

    private static final String PAGE_CODE = "slip.closed-date-exception";
    private static final String MANAGER_GROUP_ID = "00000000-0000-0000-0000-000000000101";

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Test
    @DisplayName("V95 MANAGER 계정은 마감 전표일 예외 CREATE 권한을 실 auth 조회에서 허용한다")
    void managerAccount_hasCreatePermissionInEnforcementCache() {
        UUID accountId = jdbcTemplate.queryForObject(
                """
                SELECT ag.account_id
                  FROM account_groups ag
                  JOIN accounts a ON a.id = ag.account_id
                 WHERE ag.group_id = ?::uuid
                   AND ag.is_deleted = FALSE
                   AND a.is_deleted = FALSE
                   AND a.enabled = TRUE
                 ORDER BY ag.account_id
                 LIMIT 1
                """,
                UUID.class,
                MANAGER_GROUP_ID);

        Boolean allowed = jdbcTemplate.queryForObject(
                """
                SELECT can_create
                  FROM account_page_permissions
                 WHERE account_id = ?
                   AND page_code = ?
                   AND is_deleted = FALSE
                """,
                Boolean.class,
                accountId,
                PAGE_CODE);

        assertThat(allowed)
                .as("V95 권한을 가진 실 MANAGER 계정의 auth check 결과")
                .isTrue();
    }

    @Test
    @DisplayName("V95 권한 seed는 PageCode와 그룹 권한을 함께 등록한다")
    void seed_hasRegisteredPageCodeAndManagerGroupGrant() {
        Integer pageCodeCount = jdbcTemplate.queryForObject(
                """
                SELECT COUNT(*)
                  FROM role_page_permission_templates
                 WHERE page_code = ? AND is_deleted = FALSE
                """,
                Integer.class,
                PAGE_CODE);
        Boolean managerCanCreate = jdbcTemplate.queryForObject(
                """
                SELECT can_create
                  FROM group_page_permissions
                 WHERE group_id = ?::uuid
                   AND page_code = ?
                   AND is_deleted = FALSE
                """,
                Boolean.class,
                MANAGER_GROUP_ID,
                PAGE_CODE);

        assertThat(pageCodeCount).isGreaterThanOrEqualTo(2);
        assertThat(managerCanCreate).isTrue();
    }
}
