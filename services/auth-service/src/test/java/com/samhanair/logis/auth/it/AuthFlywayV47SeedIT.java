package com.samhanair.logis.auth.it;

import static org.assertj.core.api.Assertions.assertThat;

import com.samhanair.logis.auth.AuthServiceApplication;
import java.util.List;
import java.util.UUID;
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
        // (사이클1 BE Nit-1) 잔여 4 action FALSE 단언 — seed 오타 false-green 방지.
        assertRemainingActionsFalse(MANAGER_GROUP_ID, "products.sync");
        assertNoGroupRow(MASTER_GROUP_ID, "products.sync");
        assertNoLegacyRoleRow("products.sync");
    }

    @Test
    @DisplayName("V47은 MANAGER 그룹 배속 계정의 account_page_permissions 까지 동기화한다 (QA DEF-1 가드)")
    void productsSyncMaterializedIntoAccountPagePermissions() {
        // V5 dev 계정 + V44 그룹 배속이 선행되므로, MANAGER 그룹 배속 활성 계정이 1개 이상이면
        // enforcement 캐시(account_page_permissions)에도 products.sync row 가 있어야 한다.
        List<UUID> expectedAccountIds = jdbcTemplate.queryForList(
                """
                SELECT ag.account_id
                  FROM account_groups ag
                  JOIN accounts a ON a.id = ag.account_id AND a.is_deleted = FALSE AND a.enabled = TRUE
                 WHERE ag.group_id = ?::uuid
                   AND ag.is_deleted = FALSE
                   AND NOT EXISTS (
                       SELECT 1
                         FROM account_groups sag
                         JOIN permission_groups spg
                           ON spg.id = sag.group_id
                          AND spg.is_deleted = FALSE
                          AND spg.is_system_master = TRUE
                        WHERE sag.account_id = ag.account_id
                          AND sag.is_deleted = FALSE
                   )
                 ORDER BY ag.account_id
                """,
                UUID.class,
                MANAGER_GROUP_ID);

        List<UUID> actualAccountIds = jdbcTemplate.queryForList(
                """
                SELECT app.account_id
                  FROM account_page_permissions app
                  JOIN account_groups ag
                    ON ag.account_id = app.account_id AND ag.group_id = ?::uuid AND ag.is_deleted = FALSE
                 WHERE app.page_code = 'products.sync'
                   AND app.can_view = TRUE
                   AND app.can_create = TRUE
                   AND app.can_update = FALSE
                   AND app.can_delete = FALSE
                   AND app.can_restore = FALSE
                   AND app.can_download = FALSE
                   AND app.can_print = FALSE
                   AND app.is_deleted = FALSE
                 ORDER BY app.account_id
                """,
                UUID.class,
                MANAGER_GROUP_ID);

        // 시스템 마스터 그룹 동시 배속 계정을 제외한 MANAGER 배속 활성 계정 exact-set 을 단언한다.
        assertThat(actualAccountIds).containsExactlyElementsOf(expectedAccountIds);
        assertThat(expectedAccountIds).isNotEmpty();
        assertDevManagerProductsSyncActions();
        assertNoSystemMasterMaterializedRow();
    }

    private void assertDevManagerProductsSyncActions() {
        assertThat(devManagerAction("can_view")).isTrue();
        assertThat(devManagerAction("can_create")).isTrue();
        assertThat(devManagerAction("can_update")).isFalse();
        assertThat(devManagerAction("can_delete")).isFalse();
        assertThat(devManagerAction("can_restore")).isFalse();
        assertThat(devManagerAction("can_download")).isFalse();
        assertThat(devManagerAction("can_print")).isFalse();
    }

    private Boolean devManagerAction(String columnName) {
        return jdbcTemplate.queryForObject(
                """
                SELECT %s
                  FROM account_page_permissions app
                  JOIN accounts a ON a.id = app.account_id
                 WHERE a.login_id = 'dev_manager'
                   AND a.is_deleted = FALSE
                   AND a.enabled = TRUE
                   AND app.page_code = 'products.sync'
                   AND app.is_deleted = FALSE
                """.formatted(columnName),
                Boolean.class);
    }

    private void assertNoSystemMasterMaterializedRow() {
        Integer count = jdbcTemplate.queryForObject(
                """
                SELECT COUNT(*)
                  FROM account_page_permissions app
                  JOIN account_groups ag
                    ON ag.account_id = app.account_id
                   AND ag.is_deleted = FALSE
                  JOIN permission_groups pg
                    ON pg.id = ag.group_id
                   AND pg.is_deleted = FALSE
                   AND pg.is_system_master = TRUE
                 WHERE app.page_code = 'products.sync'
                   AND app.is_deleted = FALSE
                """,
                Integer.class);

        assertThat(count).isZero();
    }

    private void assertRemainingActionsFalse(String groupId, String pageCode) {
        Boolean anyTrue = jdbcTemplate.queryForObject(
                """
                SELECT (can_delete OR can_restore OR can_download OR can_print)
                  FROM group_page_permissions
                 WHERE group_id = ?::uuid
                   AND page_code = ?
                   AND is_deleted = FALSE
                """,
                Boolean.class,
                groupId,
                pageCode);

        assertThat(anyTrue).isFalse();
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
