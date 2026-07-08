package com.samhanair.logis.auth.it;

import static org.assertj.core.api.Assertions.assertThat;

import com.samhanair.logis.auth.AuthServiceApplication;
import com.samhanair.logis.auth.service.AccountPermissionService;
import com.samhanair.logis.security.permission.PermissionAction;
import java.util.UUID;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;

/** V39 account_page_permissions 실 DB materialize 및 enforcement 소스 검증. */
@SpringBootTest(classes = AuthServiceApplication.class)
class V39AccountPermissionMaterializeIT extends AbstractPostgresIT {

    private static final UUID MASTER_ACCOUNT_ID =
            UUID.fromString("a0000000-0000-0000-0000-000000000001");
    private static final UUID MANAGER_ACCOUNT_ID =
            UUID.fromString("a0000000-0000-0000-0000-000000000003");
    private static final UUID ACCOUNTANT_ACCOUNT_ID =
            UUID.fromString("a0000000-0000-0000-0000-000000000005");

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private AccountPermissionService accountPermissionService;

    @Test
    @DisplayName("V39 는 비MASTER/비PARTNER 계정 권한 행을 role template 이상으로 materialize 한다")
    void nonMasterNonPartnerAccountsMaterializedFromTemplates() {
        Integer accountantRows = countAccountRows(ACCOUNTANT_ACCOUNT_ID);
        Integer accountantTemplates = countTemplateRows("ACCOUNTANT");

        // V86(products.price-schedule, 리뷰 fix)이 ACCOUNTANT 그룹에 group_page_permissions-only
        // 권한을 추가로 부여한다 — 레거시 role_page_permission_templates 는 갱신하지 않는다
        // (V47/V86 결정, AuthFlywayV86SeedIT#assertNoLegacyRoleRow 로 별도 가드). 따라서 더 이상
        // 엄격한 == parity 가 아니라 template 이 하한(baseline)임을 단언한다 — MANAGER 단언과 동일 취지
        // (MANAGER 도 V47 이후 이미 template 초과, isPositive() 로만 검증).
        assertThat(accountantRows).isGreaterThanOrEqualTo(accountantTemplates).isPositive();
        assertThat(countAccountRows(MANAGER_ACCOUNT_ID)).isPositive();
        assertThat(countAccountRows(MASTER_ACCOUNT_ID)).isZero();
    }

    @Test
    @DisplayName("AccountPermissionService.check 는 V39 materialize 된 7-action grant 를 enforcement 소스로 읽는다")
    void accountPermissionServiceChecksMaterializedGrants() {
        assertThat(accountPermissionService.check(
                ACCOUNTANT_ACCOUNT_ID, "accounting.journals", PermissionAction.VIEW))
                .isTrue();
        assertThat(accountPermissionService.check(
                ACCOUNTANT_ACCOUNT_ID, "accounting.journals", PermissionAction.CREATE))
                .isTrue();
        assertThat(accountPermissionService.check(
                ACCOUNTANT_ACCOUNT_ID, "accounting.journals", PermissionAction.UPDATE))
                .isTrue();
        assertThat(accountPermissionService.check(
                ACCOUNTANT_ACCOUNT_ID, "accounting.journals", PermissionAction.DOWNLOAD))
                .isTrue();

        assertThat(accountPermissionService.check(
                MANAGER_ACCOUNT_ID, "accounting.journals", PermissionAction.CREATE))
                .isFalse();
        assertThat(accountPermissionService.check(
                ACCOUNTANT_ACCOUNT_ID, "inventory.warehouse.admin", PermissionAction.RESTORE))
                .isFalse();
        assertThat(accountPermissionService.check(
                ACCOUNTANT_ACCOUNT_ID, "sales.partner-order.print", PermissionAction.PRINT))
                .isFalse();
    }

    private Integer countAccountRows(UUID accountId) {
        return jdbcTemplate.queryForObject("""
                SELECT COUNT(*)
                FROM account_page_permissions
                WHERE account_id = ?
                  AND is_deleted = FALSE
                """, Integer.class, accountId);
    }

    private Integer countTemplateRows(String roleCode) {
        return jdbcTemplate.queryForObject("""
                SELECT COUNT(*)
                FROM role_page_permission_templates
                WHERE role_code = ?
                  AND is_deleted = FALSE
                """, Integer.class, roleCode);
    }
}
