package com.samhanair.logis.auth.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.samhanair.logis.auth.AuthServiceApplication;
import com.samhanair.logis.security.permission.PermissionAction;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;

/**
 * #901 S1 축 0 — Claude 대화 정문의 실 HTTP 권한 경계 통합 테스트.
 *
 * <p>권한 조회/저장 서비스와 HTTP 서버를 mock 하지 않는다. 테스트 DB의
 * account_page_permissions 및 permission_groups를 실제로 읽어 403/501 경계를 검증한다.
 */
@SpringBootTest(
        classes = AuthServiceApplication.class,
        webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@AutoConfigureMockMvc
@TestPropertySource(properties = {
        "eureka.client.enabled=false",
        "eureka.client.register-with-eureka=false",
        "eureka.client.fetch-registry=false",
        "app.security.jwt.secret=test-secret-key-32-chars-min-aaaaaa",
        "app.security.internal.token=test-internal-token"
})
class ClaudeConversationPermissionIT extends AbstractPostgresIT {

    private static final String PAGE = "system.claude";
    private static final UUID ACCOUNT_ID =
            UUID.fromString("a9010000-0000-0000-0000-000000000001");
    private static final UUID GROUP_ID =
            UUID.fromString("a9010000-0000-0000-0000-000000000101");
    private static final List<UUID> BUILTIN_GROUP_IDS = List.of(
            UUID.fromString("00000000-0000-0000-0000-000000000100"),
            UUID.fromString("00000000-0000-0000-0000-000000000101"),
            UUID.fromString("00000000-0000-0000-0000-000000000102"),
            UUID.fromString("00000000-0000-0000-0000-000000000103"),
            UUID.fromString("00000000-0000-0000-0000-000000000104"),
            UUID.fromString("00000000-0000-0000-0000-000000000105"),
            UUID.fromString("00000000-0000-0000-0000-000000000106"),
            UUID.fromString("00000000-0000-0000-0000-000000000107"),
            UUID.fromString("00000000-0000-0000-0000-000000000108"),
            UUID.fromString("00000000-0000-0000-0000-000000000109"));

    @Autowired private MockMvc mockMvc;
    @Autowired private JdbcTemplate jdbc;

    @BeforeEach
    void setUp() {
        jdbc.update("DELETE FROM account_groups WHERE account_id = ?", ACCOUNT_ID);
        jdbc.update("DELETE FROM account_page_permissions WHERE account_id = ?", ACCOUNT_ID);
        jdbc.update("DELETE FROM accounts WHERE id = ?", ACCOUNT_ID);
        jdbc.update("DELETE FROM group_page_permissions WHERE group_id = ? AND page_code = ?", GROUP_ID, PAGE);
        jdbc.update("DELETE FROM permission_groups WHERE id = ?", GROUP_ID);
        jdbc.update("""
                INSERT INTO accounts (
                    id, login_id, password_hash, display_name, enabled,
                    failed_login_attempts, locked_at, password_changed_at, password_history,
                    password_change_required, created_at, created_by, modified_at, modified_by, is_deleted
                ) VALUES (?, 'claude-s1', 'not-used', 'Claude S1', TRUE,
                          0, NULL, NOW(), '[]'::jsonb, FALSE,
                          NOW(), 'it-901', NOW(), 'it-901', FALSE)
                """, ACCOUNT_ID);
        jdbc.update("""
                INSERT INTO permission_groups
                    (id, name, description, is_builtin, is_system_master,
                     created_at, created_by, modified_at, modified_by, is_deleted)
                VALUES (?, 'Claude S1 그룹', 'it-901', FALSE, FALSE,
                        NOW(), 'it-901', NOW(), 'it-901', FALSE)
                """, GROUP_ID);
        jdbc.update("""
                INSERT INTO account_groups
                    (id, account_id, group_id, created_at, created_by, modified_at, modified_by, is_deleted)
                VALUES (gen_random_uuid(), ?, ?, NOW(), 'it-901', NOW(), 'it-901', FALSE)
                """, ACCOUNT_ID, GROUP_ID);
    }

    @AfterEach
    void tearDown() {
        jdbc.update("DELETE FROM account_groups WHERE account_id = ?", ACCOUNT_ID);
        jdbc.update("DELETE FROM account_page_permissions WHERE account_id = ?", ACCOUNT_ID);
        jdbc.update("DELETE FROM accounts WHERE id = ?", ACCOUNT_ID);
        jdbc.update("DELETE FROM group_page_permissions WHERE group_id = ? AND page_code = ?", GROUP_ID, PAGE);
        jdbc.update("DELETE FROM permission_groups WHERE id = ?", GROUP_ID);
    }

    @Test
    @DisplayName("축 0 off 계정은 Claude 대화 정문에서 실 HTTP 403으로 거부된다")
    void offAccount_isRejectedByServer() throws Exception {
        mockMvc.perform(post("/auth/claude/conversations")
                        .header("X-User-Id", ACCOUNT_ID))
                .andExpect(status().isForbidden());
    }

    @Test
    @DisplayName("축 0 view 계정은 정문 가드를 통과하고 아직 미구현 501을 받는다")
    void viewAccount_passesGateAndReturnsNotImplemented() throws Exception {
        grantViewToAccount();

        String body = mockMvc.perform(post("/auth/claude/conversations")
                        .header("X-User-Id", ACCOUNT_ID))
                .andExpect(status().isNotImplemented())
                .andReturn()
                .getResponse()
                .getContentAsString();

        assertThat(body).doesNotContain(ACCOUNT_ID.toString());
    }

    @Test
    @DisplayName("기존 7비트 권한 계약을 정확히 보존하며 Claude 축은 VIEW 한 비트만 사용한다")
    void claudeGateUsesViewOnly() {
        grantViewToAccount();

        List<Boolean> bits = jdbc.queryForObject("""
                SELECT can_view, can_create, can_update, can_delete,
                       can_restore, can_download, can_print
                FROM account_page_permissions
                WHERE account_id = ? AND page_code = ? AND is_deleted = FALSE
                """, (rs, rowNum) -> List.of(
                        rs.getBoolean(1), rs.getBoolean(2), rs.getBoolean(3), rs.getBoolean(4),
                        rs.getBoolean(5), rs.getBoolean(6), rs.getBoolean(7)), ACCOUNT_ID, PAGE);

        assertThat(bits).containsExactly(true, false, false, false, false, false, false);
        assertThat(PermissionAction.VIEW).isEqualTo(PermissionAction.valueOf("VIEW"));
    }

    @Test
    @DisplayName("빌트인 역할그룹 10개가 Claude 7비트 row를 정확히 가진다")
    void builtinRoleGroupMatrix_isExact() {
        assertThat(jdbc.queryForObject("""
                SELECT COUNT(*) FROM group_page_permissions
                WHERE page_code = ? AND is_deleted = FALSE
                """, Integer.class, PAGE)).isEqualTo(10);

        for (int index = 0; index < BUILTIN_GROUP_IDS.size(); index++) {
            UUID groupId = BUILTIN_GROUP_IDS.get(index);
            List<Boolean> bits = jdbc.queryForObject("""
                    SELECT can_view, can_create, can_update, can_delete,
                           can_restore, can_download, can_print
                    FROM group_page_permissions
                    WHERE group_id = ? AND page_code = ? AND is_deleted = FALSE
                    """, (rs, rowNum) -> List.of(
                            rs.getBoolean(1), rs.getBoolean(2), rs.getBoolean(3), rs.getBoolean(4),
                            rs.getBoolean(5), rs.getBoolean(6), rs.getBoolean(7)), groupId, PAGE);
            assertThat(bits).containsExactly(index == 0, false, false, false, false, false, false);
        }
    }

    private void grantViewToAccount() {
        jdbc.update("""
                INSERT INTO account_page_permissions
                    (id, account_id, page_code, can_view, can_create, can_update, can_delete,
                     can_restore, can_download, can_print, created_at, created_by,
                     modified_at, modified_by, is_deleted)
                VALUES (gen_random_uuid(), ?, ?, TRUE, FALSE, FALSE, FALSE,
                        FALSE, FALSE, FALSE, NOW(), 'it-901', NOW(), 'it-901', FALSE)
                """, ACCOUNT_ID, PAGE);
    }
}
