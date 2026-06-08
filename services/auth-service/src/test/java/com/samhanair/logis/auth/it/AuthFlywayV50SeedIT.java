package com.samhanair.logis.auth.it;

import static org.assertj.core.api.Assertions.assertThat;

import com.samhanair.logis.auth.AuthServiceApplication;
import java.util.List;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;

/** V50 아로로지스 HR page-code 권한 시드 검증. */
@SpringBootTest(
        classes = AuthServiceApplication.class,
        webEnvironment = SpringBootTest.WebEnvironment.NONE
)
class AuthFlywayV50SeedIT extends AbstractPostgresIT {

    private static final List<String> HR_PAGES = List.of(
            "arologis.hr.employees",
            "arologis.hr.departments");

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Test
    @DisplayName("V50은 arologis.admin(V10)처럼 role_page_permissions에 MASTER/MANAGER HR 전권을 seed한다")
    void masterAndManagerSeededAsFullRolePagePermissions() {
        for (String pageCode : HR_PAGES) {
            assertRolePagePermission("MASTER", pageCode, true, true);
            assertRolePagePermission("MANAGER", pageCode, true, true);
        }
    }

    // 비-MASTER/MANAGER 롤의 HR page 최종 상태는 V53(아로로지스 6-롤)가 재정의하므로
    // AuthFlywayV53SeedIT 가 단언한다(V50 의 임시 false 시드는 V53 가 삭제/재적재).

    @Test
    @DisplayName("V50은 AROLOGIS_* role 또는 template/group/account HR seed를 만들지 않는다")
    void noCentralFallbackOrArologisSpecificRoleSeed() {
        for (String pageCode : HR_PAGES) {
            assertThat(countRolePagePermission("AROLOGIS_MASTER", pageCode)).isZero();
            assertThat(countRolePagePermission("AROLOGIS_MANAGER", pageCode)).isZero();
            assertThat(countRows("role_page_permission_templates", pageCode)).isZero();
            assertThat(countRows("group_page_permissions", pageCode)).isZero();
            assertThat(countRows("account_page_permissions", pageCode)).isZero();
        }
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
