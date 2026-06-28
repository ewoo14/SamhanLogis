package com.samhanair.logis.auth.it;

import static org.assertj.core.api.Assertions.assertThat;

import com.samhanair.logis.auth.AuthServiceApplication;
import com.samhanair.logis.auth.domain.PageCode;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;

/** V73 dev.popup-notice page-code seed 검증. */
@SpringBootTest(classes = AuthServiceApplication.class, webEnvironment = SpringBootTest.WebEnvironment.NONE)
class AuthFlywayV73SeedIT extends AbstractPostgresIT {

    private static final String PAGE_CODE = "dev.popup-notice";
    private static final List<String> WRITE_ROLES = List.of("MASTER", "DEVELOPER");
    private static final UUID MASTER_GROUP = UUID.fromString("00000000-0000-0000-0000-000000000100");
    private static final UUID DEVELOPER_GROUP = UUID.fromString("00000000-0000-0000-0000-000000000109");

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Test
    @DisplayName("dev.popup-notice는 PageCode enum과 MASTER/DEVELOPER 4-action seed에 등록된다")
    void v73SeedsPopupNoticePermissions() {
        assertThat(PageCode.isValid(PAGE_CODE)).isTrue();
        for (String role : WRITE_ROLES) {
            assertThat(countRolePageRows(role)).isEqualTo(1);
            assertThat(countTemplateRows(role)).isEqualTo(1);
        }
        assertThat(countGroupRows(MASTER_GROUP)).isEqualTo(1);
        assertThat(countGroupRows(DEVELOPER_GROUP)).isEqualTo(1);
        assertThat(countAccountPermissionRows(DEVELOPER_GROUP)).isGreaterThanOrEqualTo(1);
    }

    private Integer countRolePageRows(String roleCode) {
        return jdbcTemplate.queryForObject("""
                SELECT COUNT(*)
                  FROM role_page_permissions
                 WHERE role_code = ?
                   AND page_code = ?
                   AND can_view = TRUE
                   AND can_edit = TRUE
                   AND is_deleted = FALSE
                """, Integer.class, roleCode, PAGE_CODE);
    }

    private Integer countTemplateRows(String roleCode) {
        return jdbcTemplate.queryForObject("""
                SELECT COUNT(*)
                  FROM role_page_permission_templates
                 WHERE role_code = ?
                   AND page_code = ?
                   AND can_view = TRUE
                   AND can_create = TRUE
                   AND can_update = TRUE
                   AND can_delete = TRUE
                   AND is_deleted = FALSE
                """, Integer.class, roleCode, PAGE_CODE);
    }

    private Integer countGroupRows(UUID groupId) {
        return jdbcTemplate.queryForObject("""
                SELECT COUNT(*)
                  FROM group_page_permissions
                 WHERE group_id = ?
                   AND page_code = ?
                   AND can_view = TRUE
                   AND can_create = TRUE
                   AND can_update = TRUE
                   AND can_delete = TRUE
                   AND is_deleted = FALSE
                """, Integer.class, groupId, PAGE_CODE);
    }

    private Integer countAccountPermissionRows(UUID groupId) {
        return jdbcTemplate.queryForObject("""
                SELECT COUNT(*)
                  FROM account_page_permissions app
                  JOIN account_groups ag
                    ON ag.account_id = app.account_id
                   AND ag.group_id = ?
                   AND ag.is_deleted = FALSE
                 WHERE app.page_code = ?
                   AND app.can_view = TRUE
                   AND app.can_create = TRUE
                   AND app.can_update = TRUE
                   AND app.can_delete = TRUE
                   AND app.is_deleted = FALSE
                """, Integer.class, groupId, PAGE_CODE);
    }
}
