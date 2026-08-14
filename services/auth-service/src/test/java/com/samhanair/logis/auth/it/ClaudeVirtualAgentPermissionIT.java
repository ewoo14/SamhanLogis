package com.samhanair.logis.auth.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.samhanair.logis.auth.AuthServiceApplication;
import com.samhanair.logis.common.security.JwtTokenProvider;
import java.util.UUID;
import java.nio.charset.StandardCharsets;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;

/** 가상 에이전트도 동일한 축 0 권한·토큰·감사 경계를 통과하는지 실 HTTP로 검증한다. */
@SpringBootTest(classes = AuthServiceApplication.class, webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@AutoConfigureMockMvc
@TestPropertySource(properties = {
        "eureka.client.enabled=false", "eureka.client.register-with-eureka=false", "eureka.client.fetch-registry=false",
        "app.security.jwt.secret=test-secret-key-32-chars-min-aaaaaa", "app.security.internal.token=test-internal-token",
        "claude.virtual-agent.enabled=true"
})
class ClaudeVirtualAgentPermissionIT extends AbstractPostgresIT {

    private static final UUID ACCOUNT_ID = UUID.fromString("a9010000-0000-0000-0000-000000000002");
    private static final byte[] SECRET = "test-secret-key-32-chars-min-aaaaaa".getBytes();

    @Autowired MockMvc mockMvc;
    @Autowired JdbcTemplate jdbc;

    @BeforeEach
    void setUp() {
        jdbc.update("DELETE FROM account_page_permissions WHERE account_id = ?", ACCOUNT_ID);
        jdbc.update("DELETE FROM claude_conversation_audits WHERE account_id = ?", ACCOUNT_ID);
        jdbc.update("DELETE FROM accounts WHERE id = ?", ACCOUNT_ID);
        jdbc.update("""
                INSERT INTO accounts (id, login_id, password_hash, display_name, enabled,
                    failed_login_attempts, locked_at, password_changed_at, password_history,
                    password_change_required, created_at, created_by, modified_at, modified_by, is_deleted)
                VALUES (?, 'claude-virtual', 'not-used', 'Claude Virtual', TRUE, 0, NULL, NOW(), '[]'::jsonb,
                    FALSE, NOW(), 'it-901', NOW(), 'it-901', FALSE)
                """, ACCOUNT_ID);
    }

    @AfterEach
    void tearDown() {
        jdbc.update("DELETE FROM claude_conversation_sessions WHERE session_code = 'CLD-OTHER-000001'");
        jdbc.update("DELETE FROM account_page_permissions WHERE account_id = ?", ACCOUNT_ID);
        jdbc.update("DELETE FROM claude_conversation_audits WHERE account_id = ?", ACCOUNT_ID);
        jdbc.update("DELETE FROM accounts WHERE id = ?", ACCOUNT_ID);
    }

    @Test
    void virtualAgentWithoutClaudePermissionIsStillForbidden() throws Exception {
        mockMvc.perform(post("/auth/claude/conversations")
                        .header("X-User-Id", ACCOUNT_ID)
                        .header("Authorization", bearer())
                        .contentType("application/json")
                        .content("{\"question\":\"QA\"}"))
                .andExpect(status().isForbidden());
    }

    @Test
    void virtualAgentResponseAndAuditAreExplicitlyMarked() throws Exception {
        jdbc.update("""
                INSERT INTO account_page_permissions
                    (id, account_id, page_code, can_view, can_create, can_update, can_delete,
                     can_restore, can_download, can_print, created_at, created_by, modified_at, modified_by, is_deleted)
                VALUES (gen_random_uuid(), ?, 'system.claude', TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE,
                    NOW(), 'it-901', NOW(), 'it-901', FALSE)
                """, ACCOUNT_ID);

        String body = mockMvc.perform(post("/auth/claude/conversations")
                        .header("X-User-Id", ACCOUNT_ID)
                        .header("Authorization", bearer())
                        .contentType("application/json")
                        .content("{\"question\":\"QA\"}"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8);

        assertThat(body).contains("[가상 에이전트]").contains("\"virtualAgent\":true");
        assertThat(jdbc.queryForObject("SELECT outbound_status FROM claude_conversation_audits WHERE account_id = ?",
                String.class, ACCOUNT_ID)).isEqualTo("VIRTUAL_SENT");
    }

    @Test
    void virtualAgentCannotCrossSessionOwnershipBoundary() throws Exception {
        jdbc.update("""
                INSERT INTO claude_conversation_sessions
                    (id, account_id, session_code, title, created_at, created_by, is_deleted)
                VALUES (gen_random_uuid(), ?, 'CLD-OTHER-000001', '다른 사용자 세션', NOW(), 'it-901', FALSE)
                """, UUID.fromString("a9010000-0000-0000-0000-000000000099"));
        jdbc.update("""
                INSERT INTO account_page_permissions
                    (id, account_id, page_code, can_view, can_create, can_update, can_delete,
                     can_restore, can_download, can_print, created_at, created_by, modified_at, modified_by, is_deleted)
                VALUES (gen_random_uuid(), ?, 'system.claude', TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE,
                    NOW(), 'it-901', NOW(), 'it-901', FALSE)
                """, ACCOUNT_ID);

        mockMvc.perform(post("/auth/claude/sessions/CLD-OTHER-000001/messages")
                        .header("X-User-Id", ACCOUNT_ID)
                        .header("Authorization", bearer())
                        .contentType("application/json")
                        .content("{\"question\":\"QA\"}"))
                .andExpect(status().isNotFound());
        assertThat(jdbc.queryForObject("SELECT outbound_status FROM claude_conversation_audits WHERE account_id = ?",
                String.class, ACCOUNT_ID)).isEqualTo("DENIED_SESSION_OWNER");
    }

    private String bearer() {
        return "Bearer " + JwtTokenProvider.generate(ACCOUNT_ID.toString(), null, 3600, SECRET);
    }
}
