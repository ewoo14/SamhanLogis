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
 *
 * <p>V82(partners.delete, MASTER 단일)와 달리 견적 목록 복원은 목록 운영 액션이라
 * MASTER/MANAGER/SALES 3역할에 부여한다(V83 거래처주문·V84 출고전표와 정합).
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
    @DisplayName("V85는 MASTER/MANAGER/SALES 역할 템플릿에 estimates.list can_restore를 seed한다")
    void threeRoleTemplatesHaveRestore() {
        // V85 ON CONFLICT DO UPDATE 는 can_restore 만 보장한다 — 선행 시드(V10/V39 계열)가
        // 만든 기존 행의 view/create/update/delete 값은 V85 관할 밖이라 단언하지 않는다
        // (false-RED 방지, V83과 동일 원칙).
        Integer templateCount = jdbcTemplate.queryForObject(
                """
                SELECT COUNT(*)
                  FROM role_page_permission_templates
                 WHERE page_code = ?
                   AND role_code IN ('MASTER', 'MANAGER', 'SALES')
                   AND is_deleted = FALSE
                   AND can_restore = TRUE
                """,
                Integer.class,
                PAGE_CODE);
        assertThat(templateCount).isEqualTo(3);
    }

    @Test
    @DisplayName("V85는 빌트인 그룹 100/101/102에 estimates.list can_restore를 seed한다")
    void builtinGroupsHaveRestore() {
        Integer groupCount = jdbcTemplate.queryForObject(
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
                   AND can_restore = TRUE
                """,
                Integer.class,
                PAGE_CODE);
        assertThat(groupCount).isEqualTo(3);
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
