package com.samhanair.logis.auth.it;

import static org.assertj.core.api.Assertions.assertThat;

import com.samhanair.logis.auth.AuthServiceApplication;
import java.util.List;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;

/** V87 입금자명 매핑 권한 seed의 role/group/action 정합성 통합 테스트. */
@SpringBootTest(classes = AuthServiceApplication.class, webEnvironment = SpringBootTest.WebEnvironment.NONE)
class AuthFlywayV87SeedIT extends AbstractPostgresIT {

    private static final String PAGE_CODE = "accounting.deposit-mapping";
    private static final List<String> ROLES = List.of("MASTER", "MANAGER", "ACCOUNTANT");
    private static final List<String> GROUPS = List.of(
            "00000000-0000-0000-0000-000000000100",
            "00000000-0000-0000-0000-000000000101",
            "00000000-0000-0000-0000-000000000104");

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Test
    @DisplayName("V87은 MASTER/MANAGER/ACCOUNTANT에 deposit-mapping 네 action을 seed한다")
    void depositMappingSeededForBuiltinRolesAndGroups() {
        Integer roleCount = jdbcTemplate.queryForObject(
                """
                SELECT COUNT(*) FROM role_page_permissions
                 WHERE page_code = ? AND role_code IN ('MASTER', 'MANAGER', 'ACCOUNTANT')
                   AND can_view = TRUE AND can_edit = TRUE AND is_deleted = FALSE
                """,
                Integer.class, PAGE_CODE);
        assertThat(roleCount).isEqualTo(3);

        Integer templateCount = jdbcTemplate.queryForObject(
                """
                SELECT COUNT(*) FROM role_page_permission_templates
                 WHERE page_code = ? AND role_code IN ('MASTER', 'MANAGER', 'ACCOUNTANT')
                   AND can_view = TRUE AND can_create = TRUE AND can_update = TRUE
                   AND can_delete = TRUE AND is_deleted = FALSE
                """,
                Integer.class, PAGE_CODE);
        assertThat(templateCount).isEqualTo(3);

        Integer groupCount = jdbcTemplate.queryForObject(
                """
                SELECT COUNT(*) FROM group_page_permissions
                 WHERE page_code = ? AND group_id IN (?::uuid, ?::uuid, ?::uuid)
                   AND can_view = TRUE AND can_create = TRUE AND can_update = TRUE
                   AND can_delete = TRUE AND is_deleted = FALSE
                """,
                Integer.class, PAGE_CODE, GROUPS.get(0), GROUPS.get(1), GROUPS.get(2));
        assertThat(groupCount).isEqualTo(3);
    }
}
