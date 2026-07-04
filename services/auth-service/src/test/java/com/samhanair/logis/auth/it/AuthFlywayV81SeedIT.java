package com.samhanair.logis.auth.it;

import static org.assertj.core.api.Assertions.assertThat;

import com.samhanair.logis.auth.AuthServiceApplication;
import com.samhanair.logis.auth.domain.PageCode;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;

/** V81 accounting.bank-card-admin PageCode/권한 seed 검증. */
@SpringBootTest(
        classes = AuthServiceApplication.class,
        webEnvironment = SpringBootTest.WebEnvironment.NONE
)
class AuthFlywayV81SeedIT extends AbstractPostgresIT {

    private static final String PAGE_CODE = "accounting.bank-card-admin";
    private static final String ACCOUNTANT_ACCOUNT_ID = "a0000000-0000-0000-0000-000000000005";

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Test
    @DisplayName("V81은 accounting.bank-card-admin을 PageCode enum과 역할 템플릿에 등록한다")
    void pageCodeAndRoleTemplates() {
        assertThat(PageCode.isValid(PAGE_CODE)).isTrue();
        assertThat(PageCode.ACCOUNTING_BANK_CARD_ADMIN.getDisplayName()).isEqualTo("계좌/카드 관리");

        Integer managerWriteCount = jdbcTemplate.queryForObject(
                """
                SELECT COUNT(*)
                  FROM role_page_permission_templates
                 WHERE page_code = ?
                   AND is_deleted = FALSE
                   AND role_code IN ('MASTER', 'MANAGER')
                   AND can_view = TRUE
                   AND can_create = TRUE
                   AND can_update = TRUE
                   AND can_delete = TRUE
                """,
                Integer.class,
                PAGE_CODE);
        assertThat(managerWriteCount).isEqualTo(2);

        PermissionFlags accountantTemplate = jdbcTemplate.queryForObject(
                """
                SELECT can_view, can_create, can_update, can_delete, can_restore, can_download, can_print
                  FROM role_page_permission_templates
                 WHERE role_code = 'ACCOUNTANT'
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
                PAGE_CODE);

        assertThat(accountantTemplate).isEqualTo(new PermissionFlags(true, false, false, false, false, false, false));
    }

    @Test
    @DisplayName("V81은 ACCOUNTANT 계정 캐시에 계좌/카드 관리 VIEW만 materialize한다")
    void accountantCacheIsViewOnly() {
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

        assertThat(accountantFlags).isEqualTo(new PermissionFlags(true, false, false, false, false, false, false));
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
