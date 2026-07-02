package com.samhanair.logis.auth.it;

import static org.assertj.core.api.Assertions.assertThat;

import com.samhanair.logis.auth.AuthServiceApplication;
import com.samhanair.logis.auth.domain.PageCode;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;

/** V80 accounting.cash-receipts PageCode/권한 seed 검증. */
@SpringBootTest(
        classes = AuthServiceApplication.class,
        webEnvironment = SpringBootTest.WebEnvironment.NONE
)
class AuthFlywayV80SeedIT extends AbstractPostgresIT {

    private static final String PAGE_CODE = "accounting.cash-receipts";
    private static final String ACCOUNTANT_GROUP_ID = "00000000-0000-0000-0000-000000000104";
    private static final String ACCOUNTANT_ACCOUNT_ID = "a0000000-0000-0000-0000-000000000005";

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Test
    @DisplayName("V80은 accounting.cash-receipts를 PageCode enum과 역할 템플릿에 등록한다")
    void pageCodeAndRoleTemplates() {
        assertThat(PageCode.isValid(PAGE_CODE)).isTrue();
        assertThat(PageCode.ACCOUNTING_CASH_RECEIPTS.getDisplayName()).isEqualTo("입금보고서");

        Integer roleCount = jdbcTemplate.queryForObject(
                """
                SELECT COUNT(*)
                  FROM role_page_permission_templates
                 WHERE page_code = ?
                   AND is_deleted = FALSE
                   AND role_code IN ('MASTER', 'MANAGER', 'ACCOUNTANT')
                   AND can_view = TRUE
                   AND can_create = TRUE
                   AND can_update = TRUE
                   AND can_delete = TRUE
                """,
                Integer.class,
                PAGE_CODE);

        assertThat(roleCount).isEqualTo(3);
    }

    @Test
    @DisplayName("V80은 MASTER/MANAGER/ACCOUNTANT 그룹과 회계 계정 캐시에만 입금보고서 권한을 materialize한다")
    void groupAndAccountCacheMaterialization() {
        Integer groupCount = jdbcTemplate.queryForObject(
                """
                SELECT COUNT(*)
                  FROM group_page_permissions
                 WHERE page_code = ?
                   AND is_deleted = FALSE
                   AND group_id IN (
                       '00000000-0000-0000-0000-000000000100'::uuid,
                       '00000000-0000-0000-0000-000000000101'::uuid,
                       '00000000-0000-0000-0000-000000000104'::uuid
                   )
                   AND can_view = TRUE
                   AND can_create = TRUE
                   AND can_update = TRUE
                   AND can_delete = TRUE
                """,
                Integer.class,
                PAGE_CODE);
        assertThat(groupCount).isEqualTo(3);

        PermissionFlags accountantFlags = jdbcTemplate.queryForObject(
                """
                SELECT can_view, can_create, can_update, can_delete, can_restore, can_download, can_print
                  FROM account_page_permissions
                 WHERE account_id = ?::uuid
                   AND page_code = ?
                   AND is_deleted = FALSE
                """,
                (rs, rowNum) -> new PermissionFlags(
                        rs.getBoolean("can_view"),
                        rs.getBoolean("can_create"),
                        rs.getBoolean("can_update"),
                        rs.getBoolean("can_delete"),
                        rs.getBoolean("can_restore"),
                        rs.getBoolean("can_download"),
                        rs.getBoolean("can_print")),
                ACCOUNTANT_ACCOUNT_ID,
                PAGE_CODE);

        assertThat(accountantFlags.canView()).isTrue();
        assertThat(accountantFlags.canCreate()).isTrue();
        assertThat(accountantFlags.canUpdate()).isTrue();
        assertThat(accountantFlags.canDelete()).isTrue();
        assertThat(accountantFlags.canRestore()).isFalse();
        assertThat(accountantFlags.canDownload()).isFalse();
        assertThat(accountantFlags.canPrint()).isFalse();

        Integer outOfScopeTouched = jdbcTemplate.queryForObject(
                """
                SELECT COUNT(*)
                  FROM account_page_permissions app
                 WHERE app.page_code = ?
                   AND app.is_deleted = FALSE
                   AND app.modified_by = 'v80-accounting-cash-receipts'
                   AND NOT EXISTS (
                       SELECT 1
                         FROM account_groups ag
                        WHERE ag.account_id = app.account_id
                          AND ag.group_id IN (
                              '00000000-0000-0000-0000-000000000100'::uuid,
                              '00000000-0000-0000-0000-000000000101'::uuid,
                              ?::uuid
                          )
                          AND ag.is_deleted = FALSE
                   )
                """,
                Integer.class,
                PAGE_CODE,
                ACCOUNTANT_GROUP_ID);

        assertThat(outOfScopeTouched).isZero();
    }

    private record PermissionFlags(
            boolean canView,
            boolean canCreate,
            boolean canUpdate,
            boolean canDelete,
            boolean canRestore,
            boolean canDownload,
            boolean canPrint) {
    }
}
