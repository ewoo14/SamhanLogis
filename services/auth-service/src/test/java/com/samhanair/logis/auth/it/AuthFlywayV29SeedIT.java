package com.samhanair.logis.auth.it;

import static org.assertj.core.api.Assertions.assertThat;

import com.samhanair.logis.auth.AuthServiceApplication;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;

/** V29 권한 seed 가 실제 Flyway 적용 DB에 적재되는지 검증한다. */
@SpringBootTest(
        classes = AuthServiceApplication.class,
        webEnvironment = SpringBootTest.WebEnvironment.NONE
)
class AuthFlywayV29SeedIT extends AbstractPostgresIT {

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Test
    @DisplayName("V29 Flyway 적용 후 MASTER system.permission-admin 은 view/edit 모두 true")
    void masterSystemPermissionAdminSeededWithViewAndEdit() {
        PermissionRow row = jdbcTemplate.queryForObject(
                """
                SELECT can_view, can_edit
                  FROM role_page_permissions
                 WHERE role_code = 'MASTER'
                   AND page_code = 'system.permission-admin'
                   AND is_deleted = FALSE
                """,
                (rs, rowNum) -> new PermissionRow(rs.getBoolean("can_view"), rs.getBoolean("can_edit")));

        assertThat(row).isNotNull();
        assertThat(row.canView()).isTrue();
        assertThat(row.canEdit()).isTrue();
    }

    private record PermissionRow(boolean canView, boolean canEdit) {
    }
}
