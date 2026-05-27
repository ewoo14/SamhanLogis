package com.samhanair.logis.auth.it;

import static org.assertj.core.api.Assertions.assertThat;

import com.samhanair.logis.auth.AuthServiceApplication;
import com.samhanair.logis.auth.service.DynamicPermissionService;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;

/** V38 SP-D7 seed 가 실제 Flyway 적용 DB에서 behavior-preserving grant 를 만드는지 검증한다. */
@SpringBootTest(
        classes = AuthServiceApplication.class,
        webEnvironment = SpringBootTest.WebEnvironment.NONE
)
class AuthFlywayV38SeedIT extends AbstractPostgresIT {

    @Autowired
    private DynamicPermissionService permissionService;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Test
    @DisplayName("V38은 재사용/전용 SP-D7 VIEW page를 내부 role에만 열고 PARTNER row를 만들지 않는다")
    void spD7ViewPagesSeededForInternalRolesOnly() {
        assertThat(permissionService.canView("STAFF", "slip.comments")).isTrue();
        assertThat(permissionService.canView("DEVELOPER", "slip.audit-overlay")).isTrue();
        assertThat(permissionService.canView("DRIVER", "slip.delivery-attachments.upload")).isTrue();
        assertThat(permissionService.canView("ACCOUNTANT", "sales.partner-order.edit-requests")).isTrue();
        assertThat(permissionService.canView("STAFF", "products.edit-requests")).isTrue();
        assertThat(permissionService.canView("STAFF", "notifications.center")).isTrue();

        assertThat(permissionService.canView("STAFF", "sales.partner-order.history.view")).isTrue();
        assertThat(permissionService.canView("STAFF", "products.list.view")).isTrue();
        assertThat(permissionService.canView("STAFF", "partners.detail.view")).isTrue();
        assertThat(permissionService.canView("STAFF", "inventory.stock-balance.view")).isTrue();

        assertThat(permissionService.canView("PARTNER", "notifications.center")).isFalse();
        assertThat(permissionService.canView("PARTNER", "products.list.view")).isFalse();
        assertNoActiveRow("PARTNER", "notifications.center");
        assertNoActiveRow("PARTNER", "products.list.view");
    }

    private void assertNoActiveRow(String roleCode, String pageCode) {
        Integer count = jdbcTemplate.queryForObject(
                """
                SELECT COUNT(*)
                  FROM role_page_permissions
                 WHERE role_code = ?
                   AND page_code = ?
                   AND is_deleted = FALSE
                """,
                Integer.class,
                roleCode,
                pageCode);

        assertThat(count).isZero();
    }
}
