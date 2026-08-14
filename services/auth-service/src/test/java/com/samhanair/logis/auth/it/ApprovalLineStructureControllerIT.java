package com.samhanair.logis.auth.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;

import com.samhanair.logis.auth.AuthServiceApplication;
import java.nio.charset.StandardCharsets;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

/** 결재라인 구조 read API — 인증 사용자용, approver 신원 제외 계약 IT. */
@SpringBootTest(
        classes = AuthServiceApplication.class,
        webEnvironment = SpringBootTest.WebEnvironment.MOCK
)
@AutoConfigureMockMvc
@TestPropertySource(properties = {
        "eureka.client.enabled=false",
        "eureka.client.register-with-eureka=false",
        "eureka.client.fetch-registry=false",
        "app.security.jwt.secret=test-secret-key-32-chars-min-aaaaaa",
        "app.security.internal.token=test-internal-token"
})
class ApprovalLineStructureControllerIT extends AbstractPostgresIT {

    private static final UUID SALES_ACCOUNT_ID =
            UUID.fromString("a0000000-0000-0000-0000-000000000004");
    private static final UUID WAREHOUSE_GROUP_ID =
            UUID.fromString("00000000-0000-0000-0000-000000000103");
    private static final String DOCUMENT_TYPE = "SLIP_OUTBOUND";
    private static final String GROUPWARE_DOCUMENT_TYPE = "GROUPWARE_STRUCTURE_IT";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @AfterEach
    void tearDown() {
        jdbcTemplate.update("""
                DELETE FROM approval_line_approver
                WHERE config_role_id IN (
                    SELECT id FROM approval_line_config WHERE document_type = ?
                )
                """, GROUPWARE_DOCUMENT_TYPE);
        jdbcTemplate.update("""
                DELETE FROM approval_line_config
                WHERE document_type = ?
                """, GROUPWARE_DOCUMENT_TYPE);
    }

    @Test
    @DisplayName("GET structure — 인증 사용자는 admin 권한 없이 출고전표 구조만 sequence 순 조회")
    void getStructure_authenticatedUser_returnsStructureOnly() throws Exception {
        UUID dispatcherRoleId = jdbcTemplate.queryForObject("""
                SELECT id
                  FROM approval_line_config
                 WHERE document_type = ?
                   AND action_key = 'OUTBOUND_DISPATCH'
                   AND is_deleted = FALSE
                 ORDER BY sequence
                 LIMIT 1
                """, UUID.class, DOCUMENT_TYPE);
        jdbcTemplate.update("""
                INSERT INTO approval_line_approver
                    (id, config_role_id, approver_type, approver_ref_id, created_at, created_by, is_deleted)
                VALUES (?, ?, 'GROUP', ?, NOW(), 'structure-it', FALSE)
                """, UUID.randomUUID(), dispatcherRoleId, WAREHOUSE_GROUP_ID);

        MvcResult result = mockMvc.perform(get("/auth/approval-line-configs/{documentType}/structure", DOCUMENT_TYPE)
                        .header("X-User-Id", SALES_ACCOUNT_ID.toString())
                        .header("X-User-Role", "SALES")
                        .header("X-Is-System-Master", "false"))
                .andReturn();

        assertThat(result.getResponse().getStatus()).isEqualTo(200);
        String body = result.getResponse().getContentAsString(StandardCharsets.UTF_8);
        assertThat(body)
                .contains("\"sequence\":0")
                .contains("\"label\":\"작성자\"")
                .contains("\"stepType\":\"CREATOR\"")
                .contains("\"sequence\":1")
                .contains("\"label\":\"출고자\"")
                .contains("\"actionKey\":\"OUTBOUND_DISPATCH\"")
                .contains("\"sequence\":2")
                .contains("\"label\":\"검수자\"")
                .contains("\"actionKey\":\"OUTBOUND_INSPECT\"")
                .doesNotContain("approver")
                .doesNotContain("approverRefId")
                .doesNotContain(WAREHOUSE_GROUP_ID.toString());
        assertThat(body.indexOf("\"sequence\":0")).isLessThan(body.indexOf("\"sequence\":1"));
        assertThat(body.indexOf("\"sequence\":1")).isLessThan(body.indexOf("\"sequence\":2"));
    }

    @Test
    @DisplayName("GET structure — 비인증(X-User-Id 미주입) 직접 호출은 403 (게이트웨이 JwtAuthentication 단계는 401)")
    void getStructure_anonymous_returns403() throws Exception {
        // auth-service 직접(MockMvc·게이트웨이 미경유): X-User-Id 없으면 SecurityConfig
        // .anyRequest().authenticated() 거부 → 403(기존 admin 엔드포인트 IT 컨벤션 동일).
        // 게이트웨이 경유 시에는 JwtAuthentication 필터가 토큰 없는 요청을 401 로 선차단.
        MvcResult result = mockMvc.perform(get("/auth/approval-line-configs/{documentType}/structure", DOCUMENT_TYPE))
                .andReturn();

        assertThat(result.getResponse().getStatus()).isEqualTo(403);
    }

    @Test
    @DisplayName("GET default-approvers — GROUPWARE 문서의 USER 결재자를 sequence 순으로 표시명과 함께 조회")
    void getDefaultApprovers_groupwareDocument_returnsUserApproversOnlyInSequenceOrder() throws Exception {
        UUID reviewRoleId = insertGroupwareRole("검토자", 1);
        UUID approveRoleId = insertGroupwareRole("승인자", 2);
        jdbcTemplate.update("""
                INSERT INTO approval_line_approver
                    (id, config_role_id, approver_type, approver_ref_id, created_at, created_by, is_deleted)
                VALUES (?, ?, 'GROUP', ?, NOW(), 'default-approvers-it', FALSE)
                """, UUID.randomUUID(), reviewRoleId, WAREHOUSE_GROUP_ID);
        jdbcTemplate.update("""
                INSERT INTO approval_line_approver
                    (id, config_role_id, approver_type, approver_ref_id, created_at, created_by, is_deleted)
                VALUES (?, ?, 'USER', ?, NOW(), 'default-approvers-it', FALSE)
                """, UUID.randomUUID(), approveRoleId, SALES_ACCOUNT_ID);

        MvcResult result = mockMvc.perform(get(
                        "/auth/approval-line-configs/{documentType}/default-approvers",
                        GROUPWARE_DOCUMENT_TYPE)
                        .header("X-User-Id", SALES_ACCOUNT_ID.toString())
                        .header("X-User-Role", "SALES")
                        .header("X-Is-System-Master", "false"))
                .andReturn();

        assertThat(result.getResponse().getStatus()).isEqualTo(200);
        String body = result.getResponse().getContentAsString(StandardCharsets.UTF_8);
        assertThat(body)
                .contains("\"sequence\":2")
                .contains("\"label\":\"승인자\"")
                .contains("\"userId\":\"" + SALES_ACCOUNT_ID + "\"")
                .contains("\"displayName\":\"[DEV-SEED] 개발영업\"")
                .doesNotContain("검토자")
                .doesNotContain(WAREHOUSE_GROUP_ID.toString())
                .doesNotContain("approverRefId");
    }

    @Test
    @DisplayName("GET default-approvers — 미설정 documentType 은 빈 목록")
    void getDefaultApprovers_unconfiguredDocument_returnsEmptyList() throws Exception {
        MvcResult result = mockMvc.perform(get(
                        "/auth/approval-line-configs/{documentType}/default-approvers",
                        "GROUPWARE_NOT_CONFIGURED")
                        .header("X-User-Id", SALES_ACCOUNT_ID.toString())
                        .header("X-User-Role", "SALES")
                        .header("X-Is-System-Master", "false"))
                .andReturn();

        assertThat(result.getResponse().getStatus()).isEqualTo(200);
        assertThat(result.getResponse().getContentAsString(StandardCharsets.UTF_8))
                .contains("\"data\":[]");
    }

    @Test
    @DisplayName("GET default-approvers — 비인증 직접 호출은 403 (게이트웨이는 401)")
    void getDefaultApprovers_anonymous_returns403() throws Exception {
        MvcResult result = mockMvc.perform(get(
                        "/auth/approval-line-configs/{documentType}/default-approvers",
                        GROUPWARE_DOCUMENT_TYPE))
                .andReturn();

        assertThat(result.getResponse().getStatus()).isEqualTo(403);
    }

    private UUID insertGroupwareRole(String label, int sequence) {
        UUID roleId = UUID.randomUUID();
        jdbcTemplate.update("""
                INSERT INTO approval_line_config
                    (id, document_type, sequence, label, step_type, action_key, required, created_at, created_by, is_deleted)
                VALUES (?, ?, ?, ?, 'GROUP', NULL, TRUE, NOW(), 'default-approvers-it', FALSE)
                """, roleId, GROUPWARE_DOCUMENT_TYPE, sequence, label);
        return roleId;
    }
}
