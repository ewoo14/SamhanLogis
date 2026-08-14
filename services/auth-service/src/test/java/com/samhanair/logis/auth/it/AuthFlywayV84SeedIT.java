package com.samhanair.logis.auth.it;

import static org.assertj.core.api.Assertions.assertThat;

import com.samhanair.logis.auth.AuthServiceApplication;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;

/** V84 sales.slip.list RESTORE 시드 검증 — E2 출고전표 목록 삭제행 복원. */
@SpringBootTest(
        classes = AuthServiceApplication.class,
        webEnvironment = SpringBootTest.WebEnvironment.NONE
)
class AuthFlywayV84SeedIT extends AbstractPostgresIT {

    private static final String PAGE_CODE = "sales.slip.list";

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Test
    @DisplayName("V84는 MASTER/MANAGER/SALES 역할 템플릿에 sales.slip.list can_restore를 seed한다")
    void roleTemplatesHaveRestore() {
        Integer count = jdbcTemplate.queryForObject(
                """
                SELECT COUNT(*)
                  FROM role_page_permission_templates
                 WHERE page_code = ?
                   AND role_code IN ('MASTER', 'MANAGER', 'SALES')
                   AND is_deleted = FALSE
                   AND can_view = TRUE
                   AND can_restore = TRUE
                """,
                Integer.class,
                PAGE_CODE);

        assertThat(count).isEqualTo(3);
    }

    @Test
    @DisplayName("V84는 마스터/매니저/영업 그룹에 sales.slip.list can_restore를 seed한다")
    void groupsHaveRestore() {
        Integer count = jdbcTemplate.queryForObject(
                """
                SELECT COUNT(*)
                  FROM group_page_permissions
                 WHERE page_code = ?
                   AND group_id IN (
                       '00000000-0000-0000-0000-000000000100'::uuid,
                       '00000000-0000-0000-0000-000000000101'::uuid,
                       '00000000-0000-0000-0000-000000000102'::uuid
                   )
                   AND is_deleted = FALSE
                   AND can_view = TRUE
                   AND can_restore = TRUE
                """,
                Integer.class,
                PAGE_CODE);

        assertThat(count).isEqualTo(3);
    }

    @Test
    @DisplayName("V84는 sales.slip.list RESTORE 계정 캐시를 materialize하고 시스템 마스터는 bypass로 제외한다")
    void accountPagePermissionsHaveRestoreForNonSystemMasterAccounts() {
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
