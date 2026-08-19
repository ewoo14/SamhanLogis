package com.samhanair.logis.auth.it;

import static org.assertj.core.api.Assertions.assertThat;

import com.samhanair.logis.auth.AuthServiceApplication;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;

/** V39 이 guard-gated page 의 기존 권한 효과를 확대하지 않는지 검증한다. */
@SpringBootTest(classes = AuthServiceApplication.class)
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

    @Test
    @DisplayName("DOWNLOAD/PRINT/RESTORE 전용 action 은 기존 효과 role 집합만 보존한다")
    void specialActionsPreserveEffectiveRoleSetsOnly() {
        assertRoleSet("can_restore", "inventory.warehouse.admin", "MASTER", "MANAGER");
        assertRoleSet("can_restore", "slip.audit-revert", "MASTER", "MANAGER");

        assertRoleSet("can_download", "accounting.journals", "MASTER", "MANAGER", "ACCOUNTANT");
        assertRoleSet("can_download", "accounting.hometax-export", "MASTER", "MANAGER", "ACCOUNTANT");
        assertRoleSet("can_download", "inventory.dps", "MASTER", "MANAGER", "WAREHOUSE", "INVENTORY");
        assertRoleSet("can_download", "inventory.stock-balance", "MASTER", "MANAGER", "WAREHOUSE", "INVENTORY");
        assertRoleSet("can_download", "partners.edit", "MASTER", "MANAGER");
        assertRoleSet("can_download", "slip.print.export", "MASTER", "MANAGER");

        assertRoleSet("can_print", "accounting.partner-ledger", "MASTER", "MANAGER", "ACCOUNTANT");
        assertRoleSet("can_print", "accounting.reports", "MASTER", "MANAGER", "ACCOUNTANT");
        assertRoleSet("can_print", "accounting.statement-batch", "MASTER", "MANAGER", "ACCOUNTANT");
        assertRoleSet("can_print", "accounting.tax-invoice.list", "MASTER", "MANAGER", "ACCOUNTANT");
        assertRoleSet("can_print", "sales.partner-order.print", "MASTER", "MANAGER", "SALES", "WAREHOUSE");
        assertRoleSet("can_print", "slip.print.next-day", "MASTER", "MANAGER", "SALES");
    }

    @Test
    @DisplayName("MANAGER는 DPS 비교 결과 저장 CREATE 권한을 가진다")
    void managerCanCreateDpsHistory() {
        assertThat(flag("MANAGER", "inventory.dps", "can_create")).isTrue();
        assertThat(jdbcTemplate.queryForObject("""
                SELECT can_create FROM group_page_permissions
                WHERE group_id = '00000000-0000-0000-0000-000000000101'::uuid
                  AND page_code = 'inventory.dps' AND is_deleted = FALSE
                """, Boolean.class)).isTrue();
    }

    private Boolean flag(String roleCode, String pageCode, String column) {
        return jdbcTemplate.queryForObject("""
                SELECT %s
                FROM role_page_permission_templates
                WHERE role_code = ? AND page_code = ? AND is_deleted = FALSE
                """.formatted(column), Boolean.class, roleCode, pageCode);
    }

    private void assertRoleSet(String column, String pageCode, String... expectedRoles) {
        var roles = jdbcTemplate.queryForList("""
                SELECT role_code
                FROM role_page_permission_templates
                WHERE page_code = ?
                  AND %s = TRUE
                  AND is_deleted = FALSE
                ORDER BY role_code
                """.formatted(column), String.class, pageCode);

        assertThat(roles).containsExactlyInAnyOrder(expectedRoles);
    }
}
