package com.samhanair.logis.auth.it;

import static org.assertj.core.api.Assertions.assertThat;

import com.samhanair.logis.auth.AuthServiceApplication;
import java.util.List;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;

/** #1013 R12: 삭제한 발송 감사 화면의 5개 권한 정본을 모두 회수하는 RED 계약. */
@SpringBootTest(classes = AuthServiceApplication.class, webEnvironment = SpringBootTest.WebEnvironment.NONE)
class AuthFlywayV92DispatchSmsPermissionRetirementIT extends AbstractPostgresIT {

    private static final String PAGE_CODE = "notification.dispatch-sms.send-audit";
    private static final List<String> SOURCE_TABLES = List.of(
            "role_page_permissions",
            "role_page_permission_templates",
            "group_page_permissions",
            "account_page_permissions",
            "account_permission_overrides");

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Test
    @DisplayName("삭제된 SEND_AUDIT 화면은 5개 권한 정본에 활성 grant를 남기지 않는다")
    void allPermissionSourcesAreRetired() {
        for (String table : SOURCE_TABLES) {
            Integer activeRows = jdbcTemplate.queryForObject(
                    "SELECT COUNT(*) FROM " + table
                            + " WHERE page_code = ? AND is_deleted = FALSE",
                    Integer.class, PAGE_CODE);
            assertThat(activeRows).as(table + " active grant").isZero();
        }
    }

    @Test
    @DisplayName("V92 회수 권한과 별도로 표시 전용 배차안내 SMS 권한을 유지한다")
    void displayPermissionIsSeededSeparately() {
        Integer activeRows = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM role_page_permissions "
                        + "WHERE page_code = 'notification.dispatch-sms.display' AND is_deleted = FALSE",
                Integer.class);
        assertThat(activeRows).as("display permission role grants").isGreaterThanOrEqualTo(2);

        Integer activeAccounts = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM account_page_permissions "
                        + "WHERE page_code = 'notification.dispatch-sms.display' AND is_deleted = FALSE",
                Integer.class);
        assertThat(activeAccounts).as("display permission active non-MASTER accounts").isGreaterThanOrEqualTo(2);
    }
}
