package com.samhanair.logis.auth.it;

import static org.assertj.core.api.Assertions.assertThat;

import com.samhanair.logis.auth.AuthServiceApplication;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * V52 아로로지스 권한 관리 page-code 시드 검증.
 *
 * <p>V50(HR)/V51(회계) 와 달리 {@code arologis.admin.permissions} 는 <b>아로로지스 MASTER 전용</b>
 * 기능이므로 MANAGER 도 false 로 시드한다. 즉 MASTER 만 (view,edit) TRUE 이고, MANAGER 를 포함한
 * 나머지 모든 중앙 롤은 (false,false) 명시 시드된다. AROLOGIS_MASTER/AROLOGIS_MANAGER 및
 * template/group/account 는 미시드(중앙 fallback 채움 없음)임을 단언한다.
 */
@SpringBootTest(
        classes = AuthServiceApplication.class,
        webEnvironment = SpringBootTest.WebEnvironment.NONE
)
class AuthFlywayV52SeedIT extends AbstractPostgresIT {

    private static final String PERMISSIONS_PAGE = "arologis.admin.permissions";

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Test
    @DisplayName("V52는 arologis.admin.permissions에 MASTER 전권(view,edit)을 seed한다")
    void masterSeededAsFullRolePagePermission() {
        assertRolePagePermission("MASTER", PERMISSIONS_PAGE, true, true);
    }

    @Test
    @DisplayName("V52는 권한 관리 page를 MANAGER에 명시 false로 seed한다(MASTER 전용)")
    void managerSeededAsDeniedRolePagePermission() {
        // MANAGER 는 V52/V53 모두 권한관리 false 유지(MASTER 전용). 그 외 비-MASTER 롤의 최종
        // 상태(신규 4롤 false / 제거 5롤 행 삭제)는 AuthFlywayV53SeedIT 가 단언.
        assertRolePagePermission("MANAGER", PERMISSIONS_PAGE, false, false);
    }

    @Test
    @DisplayName("V52는 AROLOGIS_* role 또는 template/group/account 권한 관리 seed를 만들지 않는다")
    void noCentralFallbackOrArologisSpecificRoleSeed() {
        assertThat(countRolePagePermission("AROLOGIS_MASTER", PERMISSIONS_PAGE)).isZero();
        assertThat(countRolePagePermission("AROLOGIS_MANAGER", PERMISSIONS_PAGE)).isZero();
        assertThat(countRows("role_page_permission_templates", PERMISSIONS_PAGE)).isZero();
        assertThat(countRows("group_page_permissions", PERMISSIONS_PAGE)).isZero();
        assertThat(countRows("account_page_permissions", PERMISSIONS_PAGE)).isZero();
    }

    private void assertRolePagePermission(
            String roleCode,
            String pageCode,
            boolean expectedCanView,
            boolean expectedCanEdit) {
        RolePermissionRow row = jdbcTemplate.queryForObject(
                """
                SELECT can_view, can_edit
                  FROM role_page_permissions
                 WHERE role_code = ?
                   AND page_code = ?
                   AND is_deleted = FALSE
                """,
                (rs, rowNum) -> new RolePermissionRow(rs.getBoolean("can_view"), rs.getBoolean("can_edit")),
                roleCode,
                pageCode);

        assertThat(row).isNotNull();
        assertThat(row.canView()).isEqualTo(expectedCanView);
        assertThat(row.canEdit()).isEqualTo(expectedCanEdit);
    }

    private Long countRolePagePermission(String roleCode, String pageCode) {
        return jdbcTemplate.queryForObject(
                """
                SELECT COUNT(*)
                  FROM role_page_permissions
                 WHERE role_code = ?
                   AND page_code = ?
                   AND is_deleted = FALSE
                """,
                Long.class,
                roleCode,
                pageCode);
    }

    private Long countRows(String tableName, String pageCode) {
        return jdbcTemplate.queryForObject(
                """
                SELECT COUNT(*)
                  FROM %s
                 WHERE page_code = ?
                   AND is_deleted = FALSE
                """.formatted(tableName),
                Long.class,
                pageCode);
    }

    private record RolePermissionRow(boolean canView, boolean canEdit) {
    }
}
