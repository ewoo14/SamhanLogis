package com.samhanair.logis.auth.it;

import static org.assertj.core.api.Assertions.assertThat;

import com.samhanair.logis.auth.AuthServiceApplication;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;

/** V39 role_page_permissions → 7-action template 분해 parity 검증. */
@SpringBootTest(classes = AuthServiceApplication.class)
class V39MigrationParityIT extends AbstractPostgresIT {

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Test
    @DisplayName("VIEW/EDIT 는 VIEW 및 CREATE/UPDATE/DELETE 로 분해된다")
    void viewAndEditMapToSevenActionBase() {
        assertThat(flag("ACCOUNTANT", "accounting.journals", "can_view")).isTrue();
        assertThat(flag("ACCOUNTANT", "accounting.journals", "can_create")).isTrue();
        assertThat(flag("ACCOUNTANT", "accounting.journals", "can_update")).isTrue();
        assertThat(flag("MANAGER", "accounting.journals", "can_view")).isTrue();
        assertThat(flag("MANAGER", "accounting.journals", "can_create")).isFalse();
    }

    @Test
    @DisplayName("RESTORE/DOWNLOAD/PRINT 보존 매핑이 템플릿에 반영된다")
    void restoreDownloadPrintPreserved() {
        assertThat(flag("MANAGER", "inventory.warehouse.admin", "can_restore")).isTrue();
        assertThat(flag("ACCOUNTANT", "inventory.warehouse.admin", "can_restore")).isFalse();
        assertThat(flag("ACCOUNTANT", "accounting.journals", "can_download")).isTrue();
        assertThat(flag("MANAGER", "inventory.dps", "can_download")).isTrue();
        assertThat(flag("WAREHOUSE", "inventory.dps", "can_download")).isTrue();
        assertThat(flag("INVENTORY", "inventory.stock-balance", "can_download")).isTrue();
        assertThat(flag("SALES", "accounting.journals", "can_download")).isFalse();
        assertThat(flag("WAREHOUSE", "sales.partner-order.print", "can_print")).isTrue();
        assertThat(flag("ACCOUNTANT", "sales.partner-order.print", "can_print")).isFalse();
        assertThat(flag("SALES", "accounting.tax-invoice.list", "can_print")).isFalse();
    }

    private Boolean flag(String roleCode, String pageCode, String column) {
        return jdbcTemplate.queryForObject("""
                SELECT %s
                FROM role_page_permission_templates
                WHERE role_code = ? AND page_code = ? AND is_deleted = FALSE
                """.formatted(column), Boolean.class, roleCode, pageCode);
    }
}
