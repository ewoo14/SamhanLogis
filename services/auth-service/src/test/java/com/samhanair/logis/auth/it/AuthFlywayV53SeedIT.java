package com.samhanair.logis.auth.it;

import static org.assertj.core.api.Assertions.assertThat;

import com.samhanair.logis.auth.AuthServiceApplication;
import java.util.List;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * V53 아로로지스 6-롤 모델 시드 검증 (2026-06-08, 개발책임자).
 *
 * <p>arologis.* page-code 권한 롤 = 마스터/매니저/개발자/영업사원/회계사원/배송기사 6롤만.
 * (1) 무관 5롤(DISPATCH/INVENTORY/PARTNER/STAFF/WAREHOUSE) 의 arologis.* grant 가 전부 제거되고,
 * (2) 유지 4롤(DEVELOPER/SALES/ACCOUNTANT/DRIVER) 의 grant 가 결정적으로 재적재되며,
 * (3) MASTER/MANAGER 행은 불변임을 단언한다.
 */
@SpringBootTest(
        classes = AuthServiceApplication.class,
        webEnvironment = SpringBootTest.WebEnvironment.NONE
)
class AuthFlywayV53SeedIT extends AbstractPostgresIT {

    private static final List<String> REMOVED_ROLES = List.of(
            "DISPATCH", "INVENTORY", "PARTNER", "STAFF", "WAREHOUSE");
    private static final List<String> SURVIVING_ROLES = List.of(
            "MASTER", "MANAGER", "DEVELOPER", "SALES", "ACCOUNTANT", "DRIVER");

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Test
    @DisplayName("V53은 무관 5롤(DISPATCH/INVENTORY/PARTNER/STAFF/WAREHOUSE)의 arologis.* grant를 전부 제거한다")
    void removedRolesHaveNoArologisGrants() {
        for (String roleCode : REMOVED_ROLES) {
            assertThat(countArologisRows(roleCode))
                    .as("제거 롤 %s 의 arologis.* 행", roleCode)
                    .isZero();
        }
    }

    @Test
    @DisplayName("V53 후 arologis.* 매트릭스 롤 집합은 정확히 6롤이다")
    void arologisMatrixRolesAreExactlySix() {
        List<String> roles = jdbcTemplate.queryForList(
                """
                SELECT DISTINCT role_code
                  FROM role_page_permissions
                 WHERE page_code LIKE 'arologis.%'
                   AND is_deleted = FALSE
                 ORDER BY role_code
                """,
                String.class);
        assertThat(roles).containsExactlyInAnyOrderElementsOf(SURVIVING_ROLES);
    }

    @Test
    @DisplayName("V53은 개발자(DEVELOPER)에 인사(HR)·권한관리 제외 전권(V/E)을 부여한다")
    void developerHasFullAccessExceptHrAndPermissions() {
        assertGrant("DEVELOPER", "arologis.admin", true, true);
        assertGrant("DEVELOPER", "arologis.dispatch.ops", true, true);
        assertGrant("DEVELOPER", "arologis.accounting.cashbook", true, true);
        assertGrant("DEVELOPER", "arologis.driver", true, true);
        // 인사(직원/부서)·권한관리는 개발자 제외 — 직원 생성/롤변경 권한 전파 차단(개발책임자).
        assertGrant("DEVELOPER", "arologis.hr.employees", false, false);
        assertGrant("DEVELOPER", "arologis.hr.departments", false, false);
        assertGrant("DEVELOPER", "arologis.admin.permissions", false, false);
    }

    @Test
    @DisplayName("V53은 회계사원(ACCOUNTANT)에 회계 page만 V/E, 배차는 차단한다")
    void accountantHasAccountingOnly() {
        assertGrant("ACCOUNTANT", "arologis.accounting.cashbook", true, true);
        assertGrant("ACCOUNTANT", "arologis.accounting.summary", true, true);
        assertGrant("ACCOUNTANT", "arologis.dispatch.ops", false, false);
        assertGrant("ACCOUNTANT", "arologis.hr.employees", false, false);
    }

    @Test
    @DisplayName("V53은 영업사원(SALES)에 배차/지역 조회(view only)를 부여한다")
    void salesHasDispatchViewOnly() {
        assertGrant("SALES", "arologis.admin", true, false);
        assertGrant("SALES", "arologis.dispatch.ops", true, false);
        assertGrant("SALES", "arologis.accounting.cashbook", false, false);
    }

    @Test
    @DisplayName("V53은 배송기사(DRIVER)에 기사앱(arologis.driver)만 V/E를 부여한다")
    void driverHasDriverAppOnly() {
        assertGrant("DRIVER", "arologis.driver", true, true);
        assertGrant("DRIVER", "arologis.admin", false, false);
        assertGrant("DRIVER", "arologis.accounting.cashbook", false, false);
    }

    @Test
    @DisplayName("V53은 MASTER/MANAGER의 운영 page 전권을 보존한다")
    void masterManagerGrantsPreserved() {
        assertGrant("MASTER", "arologis.admin", true, true);
        assertGrant("MASTER", "arologis.accounting.cashbook", true, true);
        assertGrant("MANAGER", "arologis.admin", true, true);
        assertGrant("MANAGER", "arologis.hr.employees", true, true);
        // 권한관리는 MASTER 전용 — MANAGER false 유지.
        assertGrant("MANAGER", "arologis.admin.permissions", false, false);
    }

    private void assertGrant(
            String roleCode, String pageCode, boolean expectedView, boolean expectedEdit) {
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
        assertThat(row).as("%s / %s 행", roleCode, pageCode).isNotNull();
        assertThat(row.canView()).as("%s / %s can_view", roleCode, pageCode).isEqualTo(expectedView);
        assertThat(row.canEdit()).as("%s / %s can_edit", roleCode, pageCode).isEqualTo(expectedEdit);
    }

    private Long countArologisRows(String roleCode) {
        return jdbcTemplate.queryForObject(
                """
                SELECT COUNT(*)
                  FROM role_page_permissions
                 WHERE role_code = ?
                   AND page_code LIKE 'arologis.%'
                   AND is_deleted = FALSE
                """,
                Long.class,
                roleCode);
    }

    private record RolePermissionRow(boolean canView, boolean canEdit) {
    }
}
