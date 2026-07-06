package com.samhanair.logis.auth.it;

import static org.assertj.core.api.Assertions.assertThat;

import com.samhanair.logis.auth.AuthServiceApplication;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * V85 estimates.list RESTORE 시드 검증 — E2 견적 목록 취소선 복원.
 */
@SpringBootTest(
        classes = AuthServiceApplication.class,
        webEnvironment = SpringBootTest.WebEnvironment.NONE
)
class AuthFlywayV85SeedIT extends AbstractPostgresIT {

    private static final String PAGE_CODE = "estimates.list";

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Test
    @DisplayName("V85는 MASTER 역할/그룹의 estimates.list can_restore를 켜고 기존 권한을 보존한다")
    void masterTemplateAndGroupHaveEstimateListRestore() {
        Integer templateCount = jdbcTemplate.queryForObject(
                """
                SELECT COUNT(*)
                  FROM role_page_permission_templates
                 WHERE page_code = ?
                   AND role_code = 'MASTER'
                   AND is_deleted = FALSE
                   AND can_view = TRUE
                   AND can_create = TRUE
                   AND can_update = TRUE
                   AND can_delete = TRUE
                   AND can_restore = TRUE
                """,
                Integer.class,
                PAGE_CODE);
        assertThat(templateCount).isEqualTo(1);

        Integer groupCount = jdbcTemplate.queryForObject(
                """
                SELECT COUNT(*)
                  FROM group_page_permissions
                 WHERE page_code = ?
                   AND group_id = '00000000-0000-0000-0000-000000000100'::uuid
                   AND is_deleted = FALSE
                   AND can_view = TRUE
                   AND can_create = TRUE
                   AND can_update = TRUE
                   AND can_delete = TRUE
                   AND can_restore = TRUE
                """,
                Integer.class,
                PAGE_CODE);
        assertThat(groupCount).isEqualTo(1);
    }

    @Test
    @DisplayName("V85는 estimates.list RESTORE 계정 캐시를 materialize하고 시스템 마스터는 bypass로 제외한다")
    void accountPagePermissionsHaveEstimateListRestoreForNonSystemMasterAccounts() {
        Integer expected = jdbcTemplate.queryForObject(
                """
                SELECT COUNT(DISTINCT ag.account_id)
                  FROM account_groups ag
                  JOIN accounts a
                    ON a.id = ag.account_id
                   AND a.is_deleted = FALSE
                   AND a.enabled = TRUE
                  JOIN group_page_permissions gpp
                    ON gpp.group_id = ag.group_id
                   AND gpp.is_deleted = FALSE
                   AND gpp.page_code = ?
                   AND gpp.can_restore = TRUE
                 WHERE ag.is_deleted = FALSE
                   AND NOT EXISTS (
                       SELECT 1
                         FROM account_groups sg
                         JOIN permission_groups pg
                           ON pg.id = sg.group_id
                          AND pg.is_deleted = FALSE
                          AND pg.is_system_master = TRUE
                        WHERE sg.account_id = ag.account_id
                          AND sg.is_deleted = FALSE
                   )
                """,
                Integer.class,
                PAGE_CODE);
        Integer actual = jdbcTemplate.queryForObject(
                """
                SELECT COUNT(DISTINCT app.account_id)
                  FROM account_page_permissions app
                 WHERE app.page_code = ?
                   AND app.is_deleted = FALSE
                   AND app.can_restore = TRUE
                """,
                Integer.class,
                PAGE_CODE);

        assertThat(actual).isEqualTo(expected);

        Integer systemMasterCacheRows = jdbcTemplate.queryForObject(
                """
                SELECT COUNT(*)
                  FROM account_page_permissions app
                  JOIN account_groups ag
                    ON ag.account_id = app.account_id
                   AND ag.is_deleted = FALSE
                  JOIN permission_groups pg
                    ON pg.id = ag.group_id
                   AND pg.is_deleted = FALSE
                   AND pg.is_system_master = TRUE
                 WHERE app.page_code = ?
                   AND app.is_deleted = FALSE
                """,
                Integer.class,
                PAGE_CODE);
        assertThat(systemMasterCacheRows).isZero();
    }
}
