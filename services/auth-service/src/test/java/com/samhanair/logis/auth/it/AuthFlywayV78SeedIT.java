package com.samhanair.logis.auth.it;

import static org.assertj.core.api.Assertions.assertThat;

import com.samhanair.logis.auth.AuthServiceApplication;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * V78 dispatch.board RESTORE 시드 검증 — E2 기둥2 배차 취소선 복원.
 *
 * <p>account_page_permissions 재구체화는 공유 Testcontainers DB 오염으로 IT 검증이 불안정해
 * (V61 선례) fresh Postgres probe + slip-service RESTORE enforcement IT 로 보완 검증한다.
 */
@SpringBootTest(
        classes = AuthServiceApplication.class,
        webEnvironment = SpringBootTest.WebEnvironment.NONE
)
class AuthFlywayV78SeedIT extends AbstractPostgresIT {

    private static final String PAGE_CODE = "dispatch.board";

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Test
    @DisplayName("V78은 MASTER/MANAGER/DISPATCH 역할 템플릿에 dispatch.board can_restore를 seed한다")
    void roleTemplatesHaveRestore() {
        Integer count = jdbcTemplate.queryForObject(
                """
                SELECT COUNT(*)
                  FROM role_page_permission_templates
                 WHERE page_code = ?
                   AND is_deleted = FALSE
                   AND can_restore = TRUE
                   AND role_code IN ('MASTER', 'MANAGER', 'DISPATCH')
                """,
                Integer.class,
                PAGE_CODE);

        assertThat(count).isEqualTo(3);
    }

    @Test
    @DisplayName("V78은 마스터/매니저/배차담당자 그룹에 dispatch.board can_restore를 seed하고 기존 view/update는 보존한다")
    void permissionGroupsHaveRestore() {
        Integer restoreCount = jdbcTemplate.queryForObject(
                """
                SELECT COUNT(*)
                  FROM group_page_permissions
                 WHERE page_code = ?
                   AND is_deleted = FALSE
                   AND can_restore = TRUE
                   AND group_id IN (
                       '00000000-0000-0000-0000-000000000100'::uuid,
                       '00000000-0000-0000-0000-000000000101'::uuid,
                       '00000000-0000-0000-0000-000000000106'::uuid
                   )
                """,
                Integer.class,
                PAGE_CODE);
        assertThat(restoreCount).isEqualTo(3);

        // ON CONFLICT DO UPDATE 가 can_restore 만 갱신하고 기존 view/update grant 를 비파괴해야 한다.
        Integer viewUpdateCount = jdbcTemplate.queryForObject(
                """
                SELECT COUNT(*)
                  FROM group_page_permissions
                 WHERE page_code = ?
                   AND is_deleted = FALSE
                   AND can_view = TRUE
                   AND can_update = TRUE
                   AND group_id IN (
                       '00000000-0000-0000-0000-000000000100'::uuid,
                       '00000000-0000-0000-0000-000000000101'::uuid,
                       '00000000-0000-0000-0000-000000000106'::uuid
                   )
                """,
                Integer.class,
                PAGE_CODE);
        assertThat(viewUpdateCount).isEqualTo(3);
    }
}
