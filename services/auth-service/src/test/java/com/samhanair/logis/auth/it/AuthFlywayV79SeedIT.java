package com.samhanair.logis.auth.it;

import static org.assertj.core.api.Assertions.assertThat;

import com.samhanair.logis.auth.AuthServiceApplication;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * V79 inventory.warehouse VIEW 시드 검증 — 배차 출고전표 미리보기 출고창고 조회 권한.
 *
 * <p>inventory-service WarehouseController.listWarehouses 는 {@code inventory.warehouse}
 * VIEW 를 요구하므로, DISPATCH 계정/그룹 enforcement 캐시까지 함께 잠근다.
 */
@SpringBootTest(
        classes = AuthServiceApplication.class,
        webEnvironment = SpringBootTest.WebEnvironment.NONE
)
class AuthFlywayV79SeedIT extends AbstractPostgresIT {

    private static final String PAGE_CODE = "inventory.warehouse";
    private static final String DISPATCH_GROUP_ID = "00000000-0000-0000-0000-000000000106";
    private static final String DEV_DISPATCH_ACCOUNT_ID = "b0000000-0000-0000-0000-00000000000c";

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Test
    @DisplayName("V79는 DISPATCH 역할 템플릿에 inventory.warehouse VIEW를 seed한다")
    void dispatchRoleTemplateHasWarehouseView() {
        Boolean canView = jdbcTemplate.queryForObject(
                """
                SELECT can_view
                  FROM role_page_permission_templates
                 WHERE role_code = 'DISPATCH'
                   AND page_code = ?
                   AND is_deleted = FALSE
                """,
                Boolean.class,
                PAGE_CODE);

        assertThat(canView).isTrue();
    }

    @Test
    @DisplayName("V79는 배차담당자 그룹에 inventory.warehouse VIEW를 seed하고 관리 권한은 부여하지 않는다")
    void dispatchGroupHasWarehouseViewOnly() {
        PermissionFlags flags = jdbcTemplate.queryForObject(
                """
                SELECT can_view, can_create, can_update, can_delete, can_restore, can_download, can_print
                  FROM group_page_permissions
                 WHERE group_id = ?::uuid
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
                DISPATCH_GROUP_ID,
                PAGE_CODE);

        assertThat(flags.canView()).isTrue();
        assertThat(flags.canCreate()).isFalse();
        assertThat(flags.canUpdate()).isFalse();
        assertThat(flags.canDelete()).isFalse();
        assertThat(flags.canRestore()).isFalse();
        assertThat(flags.canDownload()).isFalse();
        assertThat(flags.canPrint()).isFalse();
    }

    @Test
    @DisplayName("V79는 DISPATCH 계정 enforcement 캐시에 inventory.warehouse VIEW만 materialize한다")
    void dispatchAccountCacheHasWarehouseViewOnly() {
        PermissionFlags flags = jdbcTemplate.queryForObject(
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
                DEV_DISPATCH_ACCOUNT_ID,
                PAGE_CODE);

        assertThat(flags.canView()).isTrue();
        assertThat(flags.canCreate()).isFalse();
        assertThat(flags.canUpdate()).isFalse();
        assertThat(flags.canDelete()).isFalse();
        assertThat(flags.canRestore()).isFalse();
        assertThat(flags.canDownload()).isFalse();
        assertThat(flags.canPrint()).isFalse();
    }

    @Test
    @DisplayName("V79는 DISPATCH 그룹 소속이 아닌 계정 캐시를 재구체화하지 않는다")
    void accountCacheMaterializationTouchesOnlyDispatchGroupAccounts() {
        Integer nonDispatchTouched = jdbcTemplate.queryForObject(
                """
                SELECT COUNT(*)
                  FROM account_page_permissions app
                 WHERE app.page_code = ?
                   AND app.is_deleted = FALSE
                   AND app.modified_by = 'v79-dispatch-warehouse-view'
                   AND NOT EXISTS (
                       SELECT 1
                         FROM account_groups ag
                        WHERE ag.account_id = app.account_id
                          AND ag.group_id = ?::uuid
                          AND ag.is_deleted = FALSE
                   )
                """,
                Integer.class,
                PAGE_CODE,
                DISPATCH_GROUP_ID);

        assertThat(nonDispatchTouched).isZero();
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
