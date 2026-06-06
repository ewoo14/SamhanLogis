package com.samhanair.logis.auth.it;

import static org.assertj.core.api.Assertions.assertThat;

import com.samhanair.logis.auth.AuthServiceApplication;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;

/** V47 products.sync seed 가 C5 group_page_permissions 기준으로 적재되는지 검증한다. */
@SpringBootTest(
        classes = AuthServiceApplication.class,
        webEnvironment = SpringBootTest.WebEnvironment.NONE
)
class AuthFlywayV47SeedIT extends AbstractPostgresIT {

    private static final String MANAGER_GROUP_ID = "00000000-0000-0000-0000-000000000101";
    private static final String MASTER_GROUP_ID = "00000000-0000-0000-0000-000000000100";

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Test
    @DisplayName("V47은 products.sync를 MANAGER group_page_permissions에 view/create로만 seed한다")
    void productsSyncSeededAsGroupPermissionOnly() {
        Boolean canView = jdbcTemplate.queryForObject(
                """
                SELECT can_view
                  FROM group_page_permissions
                 WHERE group_id = ?::uuid
                   AND page_code = 'products.sync'
                   AND is_deleted = FALSE
                """,
                Boolean.class,
                MANAGER_GROUP_ID);
        Boolean canCreate = jdbcTemplate.queryForObject(
                """
                SELECT can_create
                  FROM group_page_permissions
                 WHERE group_id = ?::uuid
                   AND page_code = 'products.sync'
                   AND is_deleted = FALSE
                """,
                Boolean.class,
                MANAGER_GROUP_ID);
        Boolean canUpdate = jdbcTemplate.queryForObject(
                """
                SELECT can_update
                  FROM group_page_permissions
                 WHERE group_id = ?::uuid
                   AND page_code = 'products.sync'
                   AND is_deleted = FALSE
                """,
                Boolean.class,
                MANAGER_GROUP_ID);

        assertThat(canView).isTrue();
        assertThat(canCreate).isTrue();
        assertThat(canUpdate).isFalse();
        assertNoGroupRow(MASTER_GROUP_ID, "products.sync");
        assertNoLegacyRoleRow("products.sync");
    }

    private void assertNoGroupRow(String groupId, String pageCode) {
        Integer count = jdbcTemplate.queryForObject(
                """
                SELECT COUNT(*)
                  FROM group_page_permissions
                 WHERE group_id = ?::uuid
                   AND page_code = ?
                   AND is_deleted = FALSE
                """,
                Integer.class,
                groupId,
                pageCode);

        assertThat(count).isZero();
    }

    private void assertNoLegacyRoleRow(String pageCode) {
        Integer count = jdbcTemplate.queryForObject(
                """
                SELECT COUNT(*)
                  FROM role_page_permissions
                 WHERE page_code = ?
                   AND is_deleted = FALSE
                """,
                Integer.class,
                pageCode);

        assertThat(count).isZero();
    }
}
