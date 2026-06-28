package com.samhanair.logis.auth.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.samhanair.logis.auth.AuthServiceApplication;
import java.util.UUID;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

/** 결재라인 내부 인가 endpoint X-Internal-Token 계약 IT. */
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
class ApprovalLineAuthorizeControllerIT extends AbstractPostgresIT {

    private static final String INTERNAL_TOKEN_HEADER = "X-Internal-Token";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    /**
     * cross-service 계약 가드 — 결재자(USER) 1건 seed 후 그 userId 로 allowed=true 와 ApiResponse envelope
     * 중첩($.data.configured/allowed)을 실 컨트롤러 응답으로 단언한다. slip 측 client 가 root.get("data") 로
     * 파싱하므로, 컨트롤러가 envelope 을 깨거나 키를 바꾸면 이 IT 가 CI 에서 차단한다(restclient false-green 방지).
     */
    @Test
    @DisplayName("authorize — USER 결재자 seed 시 allowed=true + envelope($.data.*) 계약")
    void authorize_withSeededUserApprover_returnsAllowedTrue_andEnvelope() throws Exception {
        UUID userId = UUID.randomUUID();
        UUID roleId = roleId("SLIP_OUTBOUND", "OUTBOUND_DISPATCH");
        jdbcTemplate.update("""
                INSERT INTO approval_line_approver
                    (id, config_role_id, approver_type, approver_ref_id, created_at, created_by, is_deleted)
                VALUES (?, ?, 'USER', ?, now(), 'it-seed', false)
                """, UUID.randomUUID(), roleId, userId);
        try {
            mockMvc.perform(post("/auth/internal/approval-line/authorize")
                            .header(INTERNAL_TOKEN_HEADER, "test-internal-token")
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("""
                                    {"documentType":"SLIP_OUTBOUND","actionKey":"OUTBOUND_DISPATCH","userId":"%s"}
                                    """.formatted(userId)))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.success").value(true))
                    .andExpect(jsonPath("$.data.configured").value(true))
                    .andExpect(jsonPath("$.data.allowed").value(true));
        } finally {
            jdbcTemplate.update(
                    "DELETE FROM approval_line_approver WHERE config_role_id = ? AND approver_ref_id = ?",
                    roleId, userId);
        }
    }

    @Test
    @DisplayName("POST /auth/internal/approval-line/authorize — X-Internal-Token 일치 시 200")
    void authorize_withInternalToken_returns200() throws Exception {
        MvcResult result = mockMvc.perform(post("/auth/internal/approval-line/authorize")
                        .header(INTERNAL_TOKEN_HEADER, "test-internal-token")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"documentType":"SLIP_OUTBOUND","actionKey":"OUTBOUND_DISPATCH","userId":"%s"}
                                """.formatted(UUID.randomUUID())))
                .andReturn();

        assertThat(result.getResponse().getStatus()).isEqualTo(200);
        assertThat(result.getResponse().getContentAsString(java.nio.charset.StandardCharsets.UTF_8))
                .contains("\"configured\"")
                .contains("\"allowed\"");
    }

    @Test
    @DisplayName("authorize — action_key NULL 추가 단계는 어떤 actionKey 와도 매칭되지 않는다")
    void authorize_displayOnlyAddedStep_doesNotGateAction() throws Exception {
        UUID roleId = UUID.randomUUID();
        UUID userId = UUID.randomUUID();
        jdbcTemplate.update("""
                INSERT INTO approval_line_config
                    (id, document_type, sequence, label, step_type, action_key, required, created_at, created_by, is_deleted)
                VALUES (?, 'SLIP_OUTBOUND', 99, '확인자', 'GROUP', NULL, TRUE, NOW(), 'it-seed', FALSE)
                """, roleId);
        jdbcTemplate.update("""
                INSERT INTO approval_line_approver
                    (id, config_role_id, approver_type, approver_ref_id, created_at, created_by, is_deleted)
                VALUES (?, ?, 'USER', ?, NOW(), 'it-seed', FALSE)
                """, UUID.randomUUID(), roleId, userId);
        try {
            mockMvc.perform(post("/auth/internal/approval-line/authorize")
                            .header(INTERNAL_TOKEN_HEADER, "test-internal-token")
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("""
                                    {"documentType":"SLIP_OUTBOUND","actionKey":"EXTRA_APPROVAL","userId":"%s"}
                                    """.formatted(userId)))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.data.configured").value(false))
                    .andExpect(jsonPath("$.data.allowed").value(false));
        } finally {
            jdbcTemplate.update("DELETE FROM approval_line_approver WHERE config_role_id = ?", roleId);
            jdbcTemplate.update("DELETE FROM approval_line_config WHERE id = ?", roleId);
        }
    }

    @Test
    @DisplayName("authorize — enforced 단계 soft-delete 후 configured=false 로 opt-in 통과")
    void authorize_softDeletedEnforcedStep_returnsConfiguredFalse() throws Exception {
        UUID userId = UUID.randomUUID();
        UUID roleId = roleId("SLIP_OUTBOUND", "OUTBOUND_DISPATCH");
        jdbcTemplate.update("""
                INSERT INTO approval_line_approver
                    (id, config_role_id, approver_type, approver_ref_id, created_at, created_by, is_deleted)
                VALUES (?, ?, 'USER', ?, NOW(), 'it-seed', FALSE)
                """, UUID.randomUUID(), roleId, userId);
        try {
            jdbcTemplate.update("""
                    UPDATE approval_line_config
                       SET is_deleted = TRUE,
                           deleted_at = NOW(),
                           deleted_by = 'it-seed'
                     WHERE id = ?
                    """, roleId);

            mockMvc.perform(post("/auth/internal/approval-line/authorize")
                            .header(INTERNAL_TOKEN_HEADER, "test-internal-token")
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("""
                                    {"documentType":"SLIP_OUTBOUND","actionKey":"OUTBOUND_DISPATCH","userId":"%s"}
                                    """.formatted(userId)))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.data.configured").value(false))
                    .andExpect(jsonPath("$.data.allowed").value(false));
        } finally {
            jdbcTemplate.update("""
                    UPDATE approval_line_config
                       SET is_deleted = FALSE,
                           deleted_at = NULL,
                           deleted_by = NULL
                     WHERE id = ?
                    """, roleId);
            jdbcTemplate.update(
                    "DELETE FROM approval_line_approver WHERE config_role_id = ? AND approver_ref_id = ?",
                    roleId, userId);
        }
    }

    @Test
    @DisplayName("authorize — 입고/주문 enforced actionKey 는 기존대로 allowed=true")
    void authorize_inboundAndPartnerOrderRegression_returnsAllowedTrue() throws Exception {
        UUID inboundUserId = UUID.randomUUID();
        UUID partnerOrderUserId = UUID.randomUUID();
        UUID inboundRoleId = roleId("SLIP_INBOUND", "INBOUND_RECEIVE");
        UUID partnerOrderRoleId = roleId("PARTNER_ORDER", "PARTNER_ORDER_CONVERT");
        jdbcTemplate.update("""
                INSERT INTO approval_line_approver
                    (id, config_role_id, approver_type, approver_ref_id, created_at, created_by, is_deleted)
                VALUES (?, ?, 'USER', ?, NOW(), 'it-seed', FALSE)
                """, UUID.randomUUID(), inboundRoleId, inboundUserId);
        jdbcTemplate.update("""
                INSERT INTO approval_line_approver
                    (id, config_role_id, approver_type, approver_ref_id, created_at, created_by, is_deleted)
                VALUES (?, ?, 'USER', ?, NOW(), 'it-seed', FALSE)
                """, UUID.randomUUID(), partnerOrderRoleId, partnerOrderUserId);
        try {
            mockMvc.perform(post("/auth/internal/approval-line/authorize")
                            .header(INTERNAL_TOKEN_HEADER, "test-internal-token")
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("""
                                    {"documentType":"SLIP_INBOUND","actionKey":"INBOUND_RECEIVE","userId":"%s"}
                                    """.formatted(inboundUserId)))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.data.configured").value(true))
                    .andExpect(jsonPath("$.data.allowed").value(true));

            mockMvc.perform(post("/auth/internal/approval-line/authorize")
                            .header(INTERNAL_TOKEN_HEADER, "test-internal-token")
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("""
                                    {"documentType":"PARTNER_ORDER","actionKey":"PARTNER_ORDER_CONVERT","userId":"%s"}
                                    """.formatted(partnerOrderUserId)))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.data.configured").value(true))
                    .andExpect(jsonPath("$.data.allowed").value(true));
        } finally {
            jdbcTemplate.update("""
                    DELETE FROM approval_line_approver
                     WHERE created_by = 'it-seed'
                       AND config_role_id IN (?, ?)
                    """, inboundRoleId, partnerOrderRoleId);
        }
    }

    @Test
    @DisplayName("POST /auth/internal/approval-line/authorize — X-Internal-Token 없으면 4xx")
    void authorize_withoutInternalToken_returns4xx() throws Exception {
        MvcResult result = mockMvc.perform(post("/auth/internal/approval-line/authorize")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"documentType":"SLIP_OUTBOUND","actionKey":"OUTBOUND_DISPATCH","userId":"%s"}
                                """.formatted(UUID.randomUUID())))
                .andReturn();

        assertThat(result.getResponse().getStatus()).isBetween(400, 499);
    }

    @Test
    @DisplayName("GET roles — GROUPWARE 문서 결재선을 sequence 순으로 내부 조회한다")
    void roles_groupwareDocument_returnsConfiguredRoles() throws Exception {
        UUID groupId = UUID.fromString("00000000-0000-0000-0000-000000000101");
        UUID userId = UUID.fromString("a0000000-0000-0000-0000-000000000001");
        MvcResult result = mockMvc.perform(get("/auth/internal/approval-line/roles")
                        .header(INTERNAL_TOKEN_HEADER, "test-internal-token")
                        .param("documentType", "GROUPWARE_EXPENSE_REPORT"))
                .andReturn();

        assertThat(result.getResponse().getStatus()).isEqualTo(200);
        String body = result.getResponse().getContentAsString(java.nio.charset.StandardCharsets.UTF_8);
        assertThat(body)
                .contains("\"configured\":true")
                .contains("\"sequence\":0")
                .contains("\"stepType\":\"CREATOR\"")
                .contains("\"sequence\":1")
                .contains("\"stepType\":\"GROUP\"")
                .contains("\"approverGroupId\":\"" + groupId + "\"")
                .contains("\"requiredPageCode\":\"groupware.approvals\"")
                .contains("\"sequence\":2")
                .contains("\"stepType\":\"USER\"")
                .contains(userId.toString());
    }

    @Test
    @DisplayName("GET roles — 미설정 documentType 은 configured=false")
    void roles_unconfiguredDocument_returnsConfiguredFalse() throws Exception {
        MvcResult result = mockMvc.perform(get("/auth/internal/approval-line/roles")
                        .header(INTERNAL_TOKEN_HEADER, "test-internal-token")
                        .param("documentType", "GROUPWARE_NOT_CONFIGURED"))
                .andReturn();

        assertThat(result.getResponse().getStatus()).isEqualTo(200);
        assertThat(result.getResponse().getContentAsString(java.nio.charset.StandardCharsets.UTF_8))
                .contains("\"configured\":false")
                .contains("\"roles\":[]");
    }

    @Test
    @DisplayName("V75 seed — GROUPWARE 예시 결재선은 역할/결재자 중복 없이 멱등 형태")
    void groupwareApprovalLineSeed_hasExpectedIdempotentShape() {
        Integer roleCount = jdbcTemplate.queryForObject("""
                SELECT COUNT(*)
                  FROM approval_line_config
                 WHERE document_type = 'GROUPWARE_EXPENSE_REPORT'
                   AND is_deleted = FALSE
                """, Integer.class);
        Integer approverCount = jdbcTemplate.queryForObject("""
                SELECT COUNT(*)
                  FROM approval_line_approver a
                  JOIN approval_line_config c
                    ON c.id = a.config_role_id
                   AND c.document_type = 'GROUPWARE_EXPENSE_REPORT'
                   AND c.is_deleted = FALSE
                 WHERE a.is_deleted = FALSE
                """, Integer.class);

        assertThat(roleCount).isEqualTo(3);
        assertThat(approverCount).isEqualTo(2);
    }

    /**
     * GROUP 결재자 seed 후 그룹 멤버는 allowed=true, 비멤버는 allowed=false 를 반환한다.
     *
     * <p>auth-service {@link com.samhanair.logis.auth.service.ApprovalLineAuthorizationService}
     * 가 {@code approval_line_approver(approver_type=GROUP)} + {@code account_groups} 멤버십을
     * 실 DB 에서 조회하여 판정하는 계약을 검증한다.
     *
     * <p>FK 제약 준수: {@code account_groups}에 임의 UUID 를 삽입하는 대신
     * V43/V44/V5 에서 시드된 MANAGER 권한그룹 + 기존 계정을 재사용한다.
     * <ul>
     *   <li>그룹 UUID = {@code 00000000-0000-0000-0000-000000000101} (V43 MANAGER 그룹)</li>
     *   <li>멤버 계정 = {@code a0000000-0000-0000-0000-000000000003} (V5 dev_manager,
     *       V44 에서 MANAGER 그룹 배속)</li>
     *   <li>비멤버 계정 = {@code a0000000-0000-0000-0000-000000000002} (V5 dev_developer,
     *       V44 에서 DEVELOPER 그룹 배속 — MANAGER 그룹 비멤버)</li>
     * </ul>
     */
    @Test
    @DisplayName("authorize — GROUP 결재자 seed 시 그룹 멤버 allowed=true, 비멤버 allowed=false (실DB 계약)")
    void authorize_groupApprover_memberAllowedTrue_nonMemberFalse() throws Exception {
        // V43 seed — MANAGER 권한그룹 고정 UUID
        UUID groupId = UUID.fromString("00000000-0000-0000-0000-000000000101");
        // V5+V44 seed: dev_manager 는 MANAGER 그룹 멤버
        UUID memberUserId = UUID.fromString("a0000000-0000-0000-0000-000000000003");
        // V5+V44 seed: dev_developer 는 DEVELOPER 그룹 멤버 (MANAGER 그룹 비멤버)
        UUID nonMemberUserId = UUID.fromString("a0000000-0000-0000-0000-000000000002");

        // SLIP_OUTBOUND / OUTBOUND_DISPATCH 역할에 GROUP(= MANAGER 그룹) 결재자 seed
        // account_groups FK 위반 없이 기존 permission_groups UUID 를 approver_ref_id 에 사용한다.
        UUID roleId = roleId("SLIP_OUTBOUND", "OUTBOUND_DISPATCH");
        UUID approverId = UUID.randomUUID();
        jdbcTemplate.update("""
                INSERT INTO approval_line_approver
                    (id, config_role_id, approver_type, approver_ref_id,
                     created_at, created_by, modified_at, modified_by, is_deleted)
                VALUES (?, ?, 'GROUP', ?, now(), 'it-seed-group', now(), 'it-seed-group', false)
                """, approverId, roleId, groupId);

        try {
            // MANAGER 그룹 멤버(dev_manager) → configured=true, allowed=true
            mockMvc.perform(post("/auth/internal/approval-line/authorize")
                            .header(INTERNAL_TOKEN_HEADER, "test-internal-token")
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("""
                                    {"documentType":"SLIP_OUTBOUND","actionKey":"OUTBOUND_DISPATCH","userId":"%s"}
                                    """.formatted(memberUserId)))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.success").value(true))
                    .andExpect(jsonPath("$.data.configured").value(true))
                    .andExpect(jsonPath("$.data.allowed").value(true));

            // MANAGER 그룹 비멤버(dev_developer) → configured=true, allowed=false
            mockMvc.perform(post("/auth/internal/approval-line/authorize")
                            .header(INTERNAL_TOKEN_HEADER, "test-internal-token")
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("""
                                    {"documentType":"SLIP_OUTBOUND","actionKey":"OUTBOUND_DISPATCH","userId":"%s"}
                                    """.formatted(nonMemberUserId)))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.success").value(true))
                    .andExpect(jsonPath("$.data.configured").value(true))
                    .andExpect(jsonPath("$.data.allowed").value(false));
        } finally {
            jdbcTemplate.update("DELETE FROM approval_line_approver WHERE id = ?", approverId);
        }
    }

    private UUID roleId(String documentType, String actionKey) {
        return jdbcTemplate.queryForObject("""
                SELECT id
                  FROM approval_line_config
                 WHERE document_type = ?
                   AND action_key = ?
                   AND is_deleted = FALSE
                 ORDER BY sequence
                 LIMIT 1
                """, UUID.class, documentType, actionKey);
    }
}
