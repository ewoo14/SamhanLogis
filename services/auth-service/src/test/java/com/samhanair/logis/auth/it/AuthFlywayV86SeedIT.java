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

/**
 * V86 products.price-schedule seed 가 V47(products.sync)과 동일한 group_page_permissions
 * 패턴으로 적재되는지 검증한다 (S4a, #17 단가변동 관리).
 *
 * <p>dev-lead 확정 스코프(리뷰 fix): MANAGER + ACCOUNTANT 양쪽 빌트인 그룹에 view/update —
 * V80(accounting.cash-receipts) 다중 그룹 grant 패턴 mirror.
 */
@SpringBootTest(
        classes = AuthServiceApplication.class,
        webEnvironment = SpringBootTest.WebEnvironment.NONE
)
class AuthFlywayV86SeedIT extends AbstractPostgresIT {

    private static final String MANAGER_GROUP_ID = "00000000-0000-0000-0000-000000000101";
    private static final String ACCOUNTANT_GROUP_ID = "00000000-0000-0000-0000-000000000104";
    private static final String MASTER_GROUP_ID = "00000000-0000-0000-0000-000000000100";
    private static final String PAGE_CODE = "products.price-schedule";

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Test
    @DisplayName("V86은 products.price-schedule을 MANAGER+ACCOUNTANT group_page_permissions에 view/update로만 seed한다")
    void productsPriceScheduleSeededAsGroupPermissionOnly() {
        assertGroupHasViewUpdateOnly(MANAGER_GROUP_ID);
        assertGroupHasViewUpdateOnly(ACCOUNTANT_GROUP_ID);
        assertNoGroupRow(MASTER_GROUP_ID, PAGE_CODE);
        assertNoLegacyRoleRow(PAGE_CODE);
    }

    @Test
    @DisplayName("V86은 MANAGER+ACCOUNTANT 그룹 배속 계정의 account_page_permissions 까지 동기화한다 (V47 DEF-1 fix 관례 mirror)")
    void productsPriceScheduleMaterializedIntoAccountPagePermissions() {
        // V5 dev 계정 + V44 그룹 배속이 선행되므로, MANAGER/ACCOUNTANT 그룹 배속 활성 계정이
        // 1개 이상이면 enforcement 캐시(account_page_permissions)에도 products.price-schedule
        // row 가 있어야 한다.
        assertGroupMaterializedExactSet(MANAGER_GROUP_ID);
        assertGroupMaterializedExactSet(ACCOUNTANT_GROUP_ID);
        assertDevManagerProductsPriceScheduleActions();
        assertDevAccountantProductsPriceScheduleActions();
        assertNoSystemMasterMaterializedRow();
    }

    private void assertGroupHasViewUpdateOnly(String groupId) {
        Boolean canView = jdbcTemplate.queryForObject(
                """
                SELECT can_view
                  FROM group_page_permissions
                 WHERE group_id = ?::uuid
                   AND page_code = ?
                   AND is_deleted = FALSE
                """,
                Boolean.class,
                groupId, PAGE_CODE);
        Boolean canCreate = jdbcTemplate.queryForObject(
                """
                SELECT can_create
                  FROM group_page_permissions
                 WHERE group_id = ?::uuid
                   AND page_code = ?
                   AND is_deleted = FALSE
                """,
                Boolean.class,
                groupId, PAGE_CODE);
        Boolean canUpdate = jdbcTemplate.queryForObject(
                """
                SELECT can_update
                  FROM group_page_permissions
                 WHERE group_id = ?::uuid
                   AND page_code = ?
                   AND is_deleted = FALSE
                """,
                Boolean.class,
                groupId, PAGE_CODE);

        assertThat(canView).as("group %s can_view", groupId).isTrue();
        assertThat(canCreate).as("group %s can_create", groupId).isFalse();
        assertThat(canUpdate).as("group %s can_update", groupId).isTrue();
        // 잔여 4 action FALSE 단언 — seed 오타 false-green 방지 (V47 Nit-1 관례 mirror).
        assertRemainingActionsFalse(groupId, PAGE_CODE);
    }

    private void assertGroupMaterializedExactSet(String groupId) {
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
                groupId);

        List<UUID> actualAccountIds = jdbcTemplate.queryForList(
                """
                SELECT app.account_id
                  FROM account_page_permissions app
                  JOIN account_groups ag
                    ON ag.account_id = app.account_id AND ag.group_id = ?::uuid AND ag.is_deleted = FALSE
                 WHERE app.page_code = ?
                   AND app.can_view = TRUE
                   AND app.can_create = FALSE
                   AND app.can_update = TRUE
                   AND app.can_delete = FALSE
                   AND app.can_restore = FALSE
                   AND app.can_download = FALSE
                   AND app.can_print = FALSE
                   AND app.is_deleted = FALSE
                 ORDER BY app.account_id
                """,
                UUID.class,
                groupId, PAGE_CODE);

        // 시스템 마스터 그룹 동시 배속 계정을 제외한 그룹 배속 활성 계정 exact-set 을 단언한다.
        assertThat(actualAccountIds)
                .as("group %s materialized exact-set", groupId)
                .containsExactlyElementsOf(expectedAccountIds);
        assertThat(expectedAccountIds).as("group %s expected accounts non-empty", groupId).isNotEmpty();
    }

    private void assertDevManagerProductsPriceScheduleActions() {
        assertThat(devAccountAction("dev_manager", "can_view")).isTrue();
        assertThat(devAccountAction("dev_manager", "can_create")).isFalse();
        assertThat(devAccountAction("dev_manager", "can_update")).isTrue();
        assertThat(devAccountAction("dev_manager", "can_delete")).isFalse();
        assertThat(devAccountAction("dev_manager", "can_restore")).isFalse();
        assertThat(devAccountAction("dev_manager", "can_download")).isFalse();
        assertThat(devAccountAction("dev_manager", "can_print")).isFalse();
    }

    private void assertDevAccountantProductsPriceScheduleActions() {
        assertThat(devAccountAction("dev_accountant", "can_view")).isTrue();
        assertThat(devAccountAction("dev_accountant", "can_create")).isFalse();
        assertThat(devAccountAction("dev_accountant", "can_update")).isTrue();
        assertThat(devAccountAction("dev_accountant", "can_delete")).isFalse();
        assertThat(devAccountAction("dev_accountant", "can_restore")).isFalse();
        assertThat(devAccountAction("dev_accountant", "can_download")).isFalse();
        assertThat(devAccountAction("dev_accountant", "can_print")).isFalse();
    }

    private Boolean devAccountAction(String loginId, String columnName) {
        return jdbcTemplate.queryForObject(
                """
                SELECT %s
                  FROM account_page_permissions app
                  JOIN accounts a ON a.id = app.account_id
                 WHERE a.login_id = ?
                   AND a.is_deleted = FALSE
                   AND a.enabled = TRUE
                   AND app.page_code = ?
                   AND app.is_deleted = FALSE
                """.formatted(columnName),
                Boolean.class,
                loginId,
                PAGE_CODE);
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
                 WHERE app.page_code = ?
                   AND app.is_deleted = FALSE
                """,
                Integer.class,
                PAGE_CODE);

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
