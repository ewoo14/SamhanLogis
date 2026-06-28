package com.samhanair.logis.auth.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;

import com.samhanair.logis.auth.AuthServiceApplication;
import java.nio.charset.StandardCharsets;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
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

/** 결재라인 설정 admin API 실 HTTP + 실 권한 enforcement IT. */
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
class ApprovalLineConfigControllerIT extends AbstractPostgresIT {

    private static final UUID MANAGER_ACCOUNT_ID =
            UUID.fromString("a0000000-0000-0000-0000-000000000003");
    private static final UUID MASTER_ACCOUNT_ID =
            UUID.fromString("a0000000-0000-0000-0000-000000000001");
    private static final UUID SALES_ACCOUNT_ID =
            UUID.fromString("a0000000-0000-0000-0000-000000000004");
    private static final UUID WAREHOUSE_GROUP_ID =
            UUID.fromString("00000000-0000-0000-0000-000000000103");
    private static final String PAGE = "admin.approval-line-config";
    private static final String DOCUMENT_TYPE = "SLIP_OUTBOUND";
    private static final String GROUPWARE_DOCUMENT_TYPE = "GROUPWARE_CONFIG_IT";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @BeforeEach
    void setUp() {
        cleanPermissionRowsWithoutTouchingManagerSeed();
        cleanApprovalLineApprovers();
        cleanDynamicApprovalLineRoles();
        cleanGroupwareApprovalLineConfig();
        resetOutboundDispatcherRole();
        resetApprovalLineConfigToSeedState();
    }

    @AfterEach
    void tearDown() {
        resetApprovalLineConfigToSeedState();
        resetOutboundDispatcherRole();
        cleanGroupwareApprovalLineConfig();
        cleanApprovalLineApprovers();
        cleanDynamicApprovalLineRoles();
        cleanPermissionRowsWithoutTouchingManagerSeed();
    }

    @Test
    @DisplayName("GET 역할목록 — V61 seed MANAGER 그룹 권한으로 200 + 출고 3역할")
    void listRoles_managerWithSeedGrant_returns200AndThreeRoles() throws Exception {
        MvcResult result = mockMvc.perform(get("/auth/admin/approval-line-configs")
                        .param("documentType", DOCUMENT_TYPE)
                        .header("X-User-Id", MANAGER_ACCOUNT_ID.toString())
                        .header("X-User-Role", "MANAGER")
                        .header("X-Is-System-Master", "false"))
                .andReturn();

        assertThat(result.getResponse().getStatus()).isEqualTo(200);
        assertThat(result.getResponse().getContentAsString(StandardCharsets.UTF_8))
                .contains("작성자")
                .contains("출고자")
                .contains("검수자")
                .contains("\"enforced\":true")
                .contains("\"seedManaged\":true");
    }

    @Test
    @DisplayName("GET 그룹목록 — system.permission-admin 없이 admin.approval-line-config VIEW 로 200")
    void listGroups_managerWithApprovalLineGrant_returns200() throws Exception {
        MvcResult result = mockMvc.perform(get("/auth/admin/approval-line-configs/groups")
                        .header("X-User-Id", MANAGER_ACCOUNT_ID.toString())
                        .header("X-User-Role", "MANAGER")
                        .header("X-Is-System-Master", "false"))
                .andReturn();

        assertThat(result.getResponse().getStatus()).isEqualTo(200);
        assertThat(result.getResponse().getContentAsString(StandardCharsets.UTF_8))
                .contains(WAREHOUSE_GROUP_ID.toString())
                .contains("창고원")
                .doesNotContain("마스터");
    }

    @Test
    @DisplayName("PUT 출고자 역할 — V61 seed MANAGER UPDATE 권한으로 필수여부 변경 200")
    void updateDispatcherRole_managerWithSeedGrant_returns200() throws Exception {
        UUID roleId = outboundRoleId("출고자");

        MvcResult result = mockMvc.perform(put("/auth/admin/approval-line-configs/{id}", roleId)
                        .header("X-User-Id", MANAGER_ACCOUNT_ID.toString())
                        .header("X-User-Role", "MANAGER")
                        .header("X-Is-System-Master", "false")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"required":false}
                                """))
                .andReturn();

        assertThat(result.getResponse().getStatus()).isEqualTo(200);
        assertThat(result.getResponse().getContentAsString(StandardCharsets.UTF_8))
                .contains("\"required\":false");
        assertThat(jdbcTemplate.queryForObject("""
                SELECT required
                FROM approval_line_config
                WHERE id = ?
                  AND is_deleted = FALSE
                """, Boolean.class, roleId)).isFalse();
    }

    @Test
    @DisplayName("POST 출고자 결재자 — 미존재 권한그룹 지정은 4xx")
    void updateDispatcherRole_unknownGroup_returns4xx() throws Exception {
        UUID roleId = outboundRoleId("출고자");
        UUID unknownGroupId = UUID.randomUUID();

        MvcResult result = mockMvc.perform(post("/auth/admin/approval-line-configs/{roleId}/approvers", roleId)
                        .header("X-User-Id", MANAGER_ACCOUNT_ID.toString())
                        .header("X-User-Role", "MANAGER")
                        .header("X-Is-System-Master", "false")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"type":"GROUP","refId":"%s"}
                                """.formatted(unknownGroupId)))
                .andReturn();

        assertThat(result.getResponse().getStatus()).isBetween(400, 499);
        assertThat(result.getResponse().getContentAsString(StandardCharsets.UTF_8))
                .contains("존재하지 않는 권한 그룹");
    }

    @Test
    @DisplayName("POST/DELETE 결재자 — 비MASTER MANAGER 가 GROUP+USER 추가 후 제거 200")
    void addAndRemoveApprovers_managerWithSeedGrant_returns200() throws Exception {
        UUID roleId = outboundRoleId("출고자");

        MvcResult groupResult = mockMvc.perform(post("/auth/admin/approval-line-configs/{roleId}/approvers", roleId)
                        .header("X-User-Id", MANAGER_ACCOUNT_ID.toString())
                        .header("X-User-Role", "MANAGER")
                        .header("X-Is-System-Master", "false")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"type":"GROUP","refId":"%s"}
                                """.formatted(WAREHOUSE_GROUP_ID)))
                .andReturn();

        assertThat(groupResult.getResponse().getStatus()).isEqualTo(200);
        assertThat(groupResult.getResponse().getContentAsString(StandardCharsets.UTF_8))
                .contains("\"type\":\"GROUP\"")
                .contains("창고원");

        MvcResult userResult = mockMvc.perform(post("/auth/admin/approval-line-configs/{roleId}/approvers", roleId)
                        .header("X-User-Id", MANAGER_ACCOUNT_ID.toString())
                        .header("X-User-Role", "MANAGER")
                        .header("X-Is-System-Master", "false")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"type":"USER","refId":"%s"}
                                """.formatted(SALES_ACCOUNT_ID)))
                .andReturn();

        assertThat(userResult.getResponse().getStatus()).isEqualTo(200);
        assertThat(userResult.getResponse().getContentAsString(StandardCharsets.UTF_8))
                .contains("\"type\":\"USER\"")
                .contains("[DEV-SEED] 개발영업");

        UUID approverId = jdbcTemplate.queryForObject("""
                SELECT id
                  FROM approval_line_approver
                 WHERE config_role_id = ?
                   AND approver_type = 'GROUP'
                   AND approver_ref_id = ?
                   AND is_deleted = FALSE
                 LIMIT 1
                """, UUID.class, roleId, WAREHOUSE_GROUP_ID);

        MvcResult deleteResult = mockMvc.perform(delete(
                        "/auth/admin/approval-line-configs/{roleId}/approvers/{approverId}",
                        roleId, approverId)
                        .header("X-User-Id", MANAGER_ACCOUNT_ID.toString())
                        .header("X-User-Role", "MANAGER")
                        .header("X-Is-System-Master", "false"))
                .andReturn();

        assertThat(deleteResult.getResponse().getStatus()).isEqualTo(200);
        assertThat(jdbcTemplate.queryForObject("""
                SELECT is_deleted
                  FROM approval_line_approver
                 WHERE id = ?
                """, Boolean.class, approverId)).isTrue();
    }

    @Test
    @DisplayName("POST 결재자 — 동일 그룹 2회는 4xx(이미 지정된 결재자)")
    void addApprover_duplicateGroup_returns4xx() throws Exception {
        UUID roleId = outboundRoleId("출고자");
        String body = "{\"type\":\"GROUP\",\"refId\":\"%s\"}".formatted(WAREHOUSE_GROUP_ID);

        MvcResult first = mockMvc.perform(post("/auth/admin/approval-line-configs/{roleId}/approvers", roleId)
                        .header("X-User-Id", MANAGER_ACCOUNT_ID.toString())
                        .header("X-User-Role", "MANAGER")
                        .header("X-Is-System-Master", "false")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andReturn();
        assertThat(first.getResponse().getStatus()).isEqualTo(200);

        MvcResult dup = mockMvc.perform(post("/auth/admin/approval-line-configs/{roleId}/approvers", roleId)
                        .header("X-User-Id", MANAGER_ACCOUNT_ID.toString())
                        .header("X-User-Role", "MANAGER")
                        .header("X-Is-System-Master", "false")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andReturn();
        assertThat(dup.getResponse().getStatus()).isBetween(400, 499);
        assertThat(dup.getResponse().getContentAsString(StandardCharsets.UTF_8))
                .contains("이미 지정된 결재자");
    }

    @Test
    @DisplayName("POST 결재자 — 작성자(CREATOR) 역할은 4xx")
    void addApprover_creatorRole_returns4xx() throws Exception {
        UUID creatorId = outboundRoleId("작성자");

        MvcResult result = mockMvc.perform(post("/auth/admin/approval-line-configs/{roleId}/approvers", creatorId)
                        .header("X-User-Id", MANAGER_ACCOUNT_ID.toString())
                        .header("X-User-Role", "MANAGER")
                        .header("X-Is-System-Master", "false")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"type":"USER","refId":"%s"}
                                """.formatted(SALES_ACCOUNT_ID)))
                .andReturn();

        assertThat(result.getResponse().getStatus()).isBetween(400, 499);
        assertThat(result.getResponse().getContentAsString(StandardCharsets.UTF_8))
                .contains("작성자 역할은 변경할 수 없습니다");
    }

    @Test
    @DisplayName("POST 결재자 — 시스템 마스터 계정 USER 지정은 4xx")
    void addApprover_systemMasterUser_returns4xx() throws Exception {
        UUID roleId = outboundRoleId("출고자");

        MvcResult result = mockMvc.perform(post("/auth/admin/approval-line-configs/{roleId}/approvers", roleId)
                        .header("X-User-Id", MANAGER_ACCOUNT_ID.toString())
                        .header("X-User-Role", "MANAGER")
                        .header("X-Is-System-Master", "false")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"type":"USER","refId":"%s"}
                                """.formatted(MASTER_ACCOUNT_ID)))
                .andReturn();

        assertThat(result.getResponse().getStatus()).isBetween(400, 499);
        assertThat(result.getResponse().getContentAsString(StandardCharsets.UTF_8))
                .contains("시스템 마스터 계정");
    }

    @Test
    @DisplayName("GET 사원검색 — admin.approval-line-config VIEW 권한으로 200")
    void searchUsers_managerWithSeedGrant_returns200() throws Exception {
        MvcResult result = mockMvc.perform(get("/auth/admin/approval-line-configs/users")
                        .param("q", "개발")
                        .param("limit", "5")
                        .header("X-User-Id", MANAGER_ACCOUNT_ID.toString())
                        .header("X-User-Role", "MANAGER")
                        .header("X-Is-System-Master", "false"))
                .andReturn();

        assertThat(result.getResponse().getStatus()).isEqualTo(200);
        assertThat(result.getResponse().getContentAsString(StandardCharsets.UTF_8))
                .contains("[DEV-SEED] 개발");
    }

    @Test
    @DisplayName("GET 사원검색 — 시스템 마스터 계정은 결과에서 제외")
    void searchUsers_excludesSystemMasterAccount() throws Exception {
        MvcResult result = mockMvc.perform(get("/auth/admin/approval-line-configs/users")
                        .param("q", "개발마스터")
                        .param("limit", "5")
                        .header("X-User-Id", MANAGER_ACCOUNT_ID.toString())
                        .header("X-User-Role", "MANAGER")
                        .header("X-Is-System-Master", "false"))
                .andReturn();

        assertThat(result.getResponse().getStatus()).isEqualTo(200);
        assertThat(result.getResponse().getContentAsString(StandardCharsets.UTF_8))
                .doesNotContain(MASTER_ACCOUNT_ID.toString())
                .doesNotContain("[DEV-SEED] 개발마스터");
    }

    @Test
    @DisplayName("GET 역할목록 — admin.approval-line-config 미보유 계정은 403")
    void listRoles_salesWithoutGrant_returns403() throws Exception {
        MvcResult result = mockMvc.perform(get("/auth/admin/approval-line-configs")
                        .param("documentType", DOCUMENT_TYPE)
                        .header("X-User-Id", SALES_ACCOUNT_ID.toString())
                        .header("X-User-Role", "SALES")
                        .header("X-Is-System-Master", "false"))
                .andReturn();

        assertThat(result.getResponse().getStatus()).isEqualTo(403);
    }

    @Test
    @DisplayName("PUT 라벨변경 — 출고자 라벨을 '출고담당'으로 변경 200")
    void renameRole_outboundRole_returns200AndUpdatedLabel() throws Exception {
        UUID roleId = outboundRoleId("출고자");

        MvcResult result = mockMvc.perform(put("/auth/admin/approval-line-configs/{id}/label", roleId)
                        .header("X-User-Id", MANAGER_ACCOUNT_ID.toString())
                        .header("X-User-Role", "MANAGER")
                        .header("X-Is-System-Master", "false")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"label":"출고담당"}
                                """))
                .andReturn();

        assertThat(result.getResponse().getStatus()).isEqualTo(200);
        assertThat(result.getResponse().getContentAsString(java.nio.charset.StandardCharsets.UTF_8))
                .contains("출고담당");

        // DB에도 실제 반영되었는지 확인
        String dbLabel = jdbcTemplate.queryForObject("""
                SELECT label
                FROM approval_line_config
                WHERE id = ? AND is_deleted = FALSE
                """, String.class, roleId);
        assertThat(dbLabel).isEqualTo("출고담당");
    }

    @Test
    @DisplayName("PUT label rename rejects labels longer than column")
    void renameRole_labelLongerThanColumn_returns4xx() throws Exception {
        UUID roleId = jdbcTemplate.queryForObject("""
                SELECT id
                  FROM approval_line_config
                 WHERE document_type = ?
                   AND action_key = 'OUTBOUND_DISPATCH'
                   AND is_deleted = FALSE
                 ORDER BY sequence
                 LIMIT 1
                """, UUID.class, DOCUMENT_TYPE);
        String longLabel = "A".repeat(51);

        MvcResult result = mockMvc.perform(put("/auth/admin/approval-line-configs/{id}/label", roleId)
                        .header("X-User-Id", MANAGER_ACCOUNT_ID.toString())
                        .header("X-User-Role", "MANAGER")
                        .header("X-Is-System-Master", "false")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"label\":\"%s\"}".formatted(longLabel)))
                .andReturn();

        assertThat(result.getResponse().getStatus()).isBetween(400, 499);
    }

    @Test
    @DisplayName("PUT 라벨변경 — CREATOR 라벨 변경은 4xx")
    void renameRole_creatorRole_returns4xx() throws Exception {
        UUID creatorId = outboundRoleId("작성자");

        MvcResult result = mockMvc.perform(put("/auth/admin/approval-line-configs/{id}/label", creatorId)
                        .header("X-User-Id", MANAGER_ACCOUNT_ID.toString())
                        .header("X-User-Role", "MANAGER")
                        .header("X-Is-System-Master", "false")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"label":"새작성자"}
                                """))
                .andReturn();

        assertThat(result.getResponse().getStatus()).isBetween(400, 499);
        assertThat(result.getResponse().getContentAsString(java.nio.charset.StandardCharsets.UTF_8))
                .contains("작성자 역할은 변경할 수 없습니다");
    }

    @Test
    @DisplayName("PUT 순서변경 — 출고자↔검수자 swap 후 순서 반영 200")
    void reorderRoles_swapOutboundAndInspector_returns200AndCorrectOrder() throws Exception {
        UUID creatorId = outboundRoleId("작성자");
        UUID outboundId = outboundRoleId("출고자");
        UUID inspectorId = outboundRoleId("검수자");

        // 검수자를 2번째, 출고자를 3번째로 변경
        MvcResult result = mockMvc.perform(
                        put("/auth/admin/approval-line-configs/reorder")
                                .param("documentType", DOCUMENT_TYPE)
                                .header("X-User-Id", MANAGER_ACCOUNT_ID.toString())
                                .header("X-User-Role", "MANAGER")
                                .header("X-Is-System-Master", "false")
                                .contentType(MediaType.APPLICATION_JSON)
                                .content("""
                                        {"orderedIds":["%s","%s","%s"]}
                                        """.formatted(creatorId, inspectorId, outboundId)))
                .andReturn();

        assertThat(result.getResponse().getStatus()).isEqualTo(200);
        String body = result.getResponse().getContentAsString(java.nio.charset.StandardCharsets.UTF_8);
        // 응답이 배열 형태이며 검수자가 출고자보다 앞에 위치
        int inspectorPos = body.indexOf("검수자");
        int outboundPos = body.indexOf("출고자");
        assertThat(inspectorPos).isLessThan(outboundPos);

        // DB sequence 확인
        Integer inspectorSeq = jdbcTemplate.queryForObject("""
                SELECT sequence FROM approval_line_config
                WHERE id = ? AND is_deleted = FALSE
                """, Integer.class, inspectorId);
        Integer outboundSeq = jdbcTemplate.queryForObject("""
                SELECT sequence FROM approval_line_config
                WHERE id = ? AND is_deleted = FALSE
                """, Integer.class, outboundId);
        assertThat(inspectorSeq).isLessThan(outboundSeq);
    }

    @Test
    @DisplayName("POST 역할추가 — 표시·서명용 GROUP 단계를 max sequence+1/action_key null 로 생성")
    void addStep_managerWithSeedGrant_returnsDisplayOnlyRole() throws Exception {
        MvcResult result = mockMvc.perform(post("/auth/admin/approval-line-configs")
                        .header("X-User-Id", MANAGER_ACCOUNT_ID.toString())
                        .header("X-User-Role", "MANAGER")
                        .header("X-Is-System-Master", "false")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"documentType":"SLIP_OUTBOUND","label":"확인자"}
                                """))
                .andReturn();

        assertThat(result.getResponse().getStatus()).isEqualTo(200);
        String body = result.getResponse().getContentAsString(StandardCharsets.UTF_8);
        assertThat(body)
                .contains("확인자")
                .contains("\"stepType\":\"GROUP\"")
                .contains("\"sequence\":3")
                .contains("\"required\":true")
                .contains("\"enforced\":false")
                .contains("\"seedManaged\":false");

        UUID roleId = outboundRoleId("확인자");
        assertThat(jdbcTemplate.queryForObject("""
                SELECT action_key IS NULL
                  FROM approval_line_config
                 WHERE id = ?
                   AND is_deleted = FALSE
                """, Boolean.class, roleId)).isTrue();
        assertThat(jdbcTemplate.queryForObject("""
                SELECT created_by
                  FROM approval_line_config
                 WHERE id = ?
                   AND is_deleted = FALSE
                """, String.class, roleId)).isEqualTo(MANAGER_ACCOUNT_ID.toString());
    }

    @Test
    @DisplayName("GROUPWARE documentType — 단계 추가, USER 결재자 조회, 삭제를 허용")
    void groupwareDocumentType_addUserApproverAndDelete_returns200() throws Exception {
        MvcResult addResult = mockMvc.perform(post("/auth/admin/approval-line-configs")
                        .header("X-User-Id", MANAGER_ACCOUNT_ID.toString())
                        .header("X-User-Role", "MANAGER")
                        .header("X-Is-System-Master", "false")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"documentType":"GROUPWARE_CONFIG_IT","label":"검토자"}
                                """))
                .andReturn();

        assertThat(addResult.getResponse().getStatus()).isEqualTo(200);
        String addBody = addResult.getResponse().getContentAsString(StandardCharsets.UTF_8);
        assertThat(addBody)
                .contains("검토자")
                .contains("\"sequence\":0")
                .doesNotContain("SLIP_OUTBOUND");

        UUID roleId = groupwareRoleId("검토자");

        MvcResult userResult = mockMvc.perform(post("/auth/admin/approval-line-configs/{roleId}/approvers", roleId)
                        .header("X-User-Id", MANAGER_ACCOUNT_ID.toString())
                        .header("X-User-Role", "MANAGER")
                        .header("X-Is-System-Master", "false")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"type":"USER","refId":"%s"}
                                """.formatted(SALES_ACCOUNT_ID)))
                .andReturn();

        assertThat(userResult.getResponse().getStatus()).isEqualTo(200);
        assertThat(userResult.getResponse().getContentAsString(StandardCharsets.UTF_8))
                .contains("\"type\":\"USER\"")
                .contains(SALES_ACCOUNT_ID.toString())
                .contains("[DEV-SEED] 개발영업");

        MvcResult list = mockMvc.perform(get("/auth/admin/approval-line-configs")
                        .param("documentType", GROUPWARE_DOCUMENT_TYPE)
                        .header("X-User-Id", MANAGER_ACCOUNT_ID.toString())
                        .header("X-User-Role", "MANAGER")
                        .header("X-Is-System-Master", "false"))
                .andReturn();
        assertThat(list.getResponse().getStatus()).isEqualTo(200);
        assertThat(list.getResponse().getContentAsString(StandardCharsets.UTF_8))
                .contains("검토자")
                .contains("[DEV-SEED] 개발영업");

        MvcResult deleteResult = mockMvc.perform(delete("/auth/admin/approval-line-configs/{id}", roleId)
                        .header("X-User-Id", MANAGER_ACCOUNT_ID.toString())
                        .header("X-User-Role", "MANAGER")
                        .header("X-Is-System-Master", "false"))
                .andReturn();

        assertThat(deleteResult.getResponse().getStatus()).isEqualTo(200);
        assertThat(jdbcTemplate.queryForObject("""
                SELECT is_deleted
                  FROM approval_line_config
                 WHERE id = ?
                """, Boolean.class, roleId)).isTrue();
        assertThat(jdbcTemplate.queryForObject("""
                SELECT COUNT(*)
                  FROM approval_line_approver
                 WHERE config_role_id = ?
                   AND is_deleted = FALSE
                """, Integer.class, roleId)).isZero();
    }

    @Test
    @DisplayName("DELETE 역할삭제 — soft-delete + 자식 결재자 cascade soft-delete 후 목록에서 제외")
    void deleteStep_softDeletesRoleAndApprovers() throws Exception {
        UUID roleId = insertDisplayOnlyRole("확인자", 3);
        UUID approverId = UUID.randomUUID();
        jdbcTemplate.update("""
                INSERT INTO approval_line_approver
                    (id, config_role_id, approver_type, approver_ref_id, created_at, created_by, is_deleted)
                VALUES (?, ?, 'GROUP', ?, NOW(), 'it-seed', FALSE)
                """, approverId, roleId, WAREHOUSE_GROUP_ID);

        MvcResult result = mockMvc.perform(delete("/auth/admin/approval-line-configs/{id}", roleId)
                        .header("X-User-Id", MANAGER_ACCOUNT_ID.toString())
                        .header("X-User-Role", "MANAGER")
                        .header("X-Is-System-Master", "false"))
                .andReturn();

        assertThat(result.getResponse().getStatus()).isEqualTo(200);
        assertThat(jdbcTemplate.queryForObject("""
                SELECT is_deleted
                  FROM approval_line_config
                 WHERE id = ?
                """, Boolean.class, roleId)).isTrue();
        assertThat(jdbcTemplate.queryForObject("""
                SELECT is_deleted
                  FROM approval_line_approver
                 WHERE id = ?
                """, Boolean.class, approverId)).isTrue();

        MvcResult list = mockMvc.perform(get("/auth/admin/approval-line-configs")
                        .param("documentType", DOCUMENT_TYPE)
                        .header("X-User-Id", MANAGER_ACCOUNT_ID.toString())
                        .header("X-User-Role", "MANAGER")
                        .header("X-Is-System-Master", "false"))
                .andReturn();
        assertThat(list.getResponse().getContentAsString(StandardCharsets.UTF_8))
                .doesNotContain("확인자");
    }

    @Test
    @DisplayName("DELETE 역할삭제 — CREATOR(sequence 0)는 거부")
    void deleteStep_creatorRole_returns4xx() throws Exception {
        UUID creatorId = outboundRoleId("작성자");

        MvcResult result = mockMvc.perform(delete("/auth/admin/approval-line-configs/{id}", creatorId)
                        .header("X-User-Id", MANAGER_ACCOUNT_ID.toString())
                        .header("X-User-Role", "MANAGER")
                        .header("X-Is-System-Master", "false"))
                .andReturn();

        assertThat(result.getResponse().getStatus()).isBetween(400, 499);
        assertThat(result.getResponse().getContentAsString(StandardCharsets.UTF_8))
                .contains("작성자 역할은 삭제할 수 없습니다");
    }

    @Test
    @DisplayName("PUT 순서변경 — 작성자가 첫 번째가 아니면 4xx")
    void reorderRoles_creatorNotFirst_returns4xx() throws Exception {
        UUID creatorId = outboundRoleId("작성자");
        UUID outboundId = outboundRoleId("출고자");
        UUID inspectorId = outboundRoleId("검수자");

        MvcResult result = mockMvc.perform(
                        put("/auth/admin/approval-line-configs/reorder")
                                .param("documentType", DOCUMENT_TYPE)
                                .header("X-User-Id", MANAGER_ACCOUNT_ID.toString())
                                .header("X-User-Role", "MANAGER")
                                .header("X-Is-System-Master", "false")
                                .contentType(MediaType.APPLICATION_JSON)
                                .content("""
                                        {"orderedIds":["%s","%s","%s"]}
                                        """.formatted(outboundId, creatorId, inspectorId)))
                .andReturn();

        assertThat(result.getResponse().getStatus()).isBetween(400, 499);
        assertThat(result.getResponse().getContentAsString(java.nio.charset.StandardCharsets.UTF_8))
                .contains("작성자는 항상 첫 순서여야 합니다");
    }

    @Test
    @DisplayName("PUT 순서변경 — 중복 역할 ID 전달은 4xx")
    void reorderRoles_duplicateRoleId_returns4xx() throws Exception {
        UUID creatorId = outboundRoleId("작성자");
        UUID outboundId = outboundRoleId("출고자");

        MvcResult result = mockMvc.perform(
                        put("/auth/admin/approval-line-configs/reorder")
                                .param("documentType", DOCUMENT_TYPE)
                                .header("X-User-Id", MANAGER_ACCOUNT_ID.toString())
                                .header("X-User-Role", "MANAGER")
                                .header("X-Is-System-Master", "false")
                                .contentType(MediaType.APPLICATION_JSON)
                                .content("""
                                        {"orderedIds":["%s","%s","%s"]}
                                        """.formatted(creatorId, outboundId, outboundId)))
                .andReturn();

        assertThat(result.getResponse().getStatus()).isBetween(400, 499);
        assertThat(result.getResponse().getContentAsString(java.nio.charset.StandardCharsets.UTF_8))
                .contains("역할이 중복 전달되었습니다");
    }

    @Test
    @DisplayName("PUT 순서변경 — documentType blank 는 4xx")
    void reorderRoles_blankDocumentType_returns4xx() throws Exception {
        UUID creatorId = outboundRoleId("작성자");
        UUID outboundId = outboundRoleId("출고자");
        UUID inspectorId = outboundRoleId("검수자");

        MvcResult result = mockMvc.perform(
                        put("/auth/admin/approval-line-configs/reorder")
                                .param("documentType", " ")
                                .header("X-User-Id", MANAGER_ACCOUNT_ID.toString())
                                .header("X-User-Role", "MANAGER")
                                .header("X-Is-System-Master", "false")
                                .contentType(MediaType.APPLICATION_JSON)
                                .content("""
                                        {"orderedIds":["%s","%s","%s"]}
                                        """.formatted(creatorId, outboundId, inspectorId)))
                .andReturn();

        assertThat(result.getResponse().getStatus()).isBetween(400, 499);
        assertThat(result.getResponse().getContentAsString(java.nio.charset.StandardCharsets.UTF_8))
                .contains("전표 종류(documentType)를 입력해야 합니다");
    }

    private UUID outboundRoleId(String label) {
        return jdbcTemplate.queryForObject("""
                SELECT id
                FROM approval_line_config
                WHERE document_type = ?
                  AND label = ?
                  AND is_deleted = FALSE
                ORDER BY sequence
                LIMIT 1
                """, UUID.class, DOCUMENT_TYPE, label);
    }

    private UUID groupwareRoleId(String label) {
        return jdbcTemplate.queryForObject("""
                SELECT id
                FROM approval_line_config
                WHERE document_type = ?
                  AND label = ?
                  AND is_deleted = FALSE
                ORDER BY sequence
                LIMIT 1
                """, UUID.class, GROUPWARE_DOCUMENT_TYPE, label);
    }

    private UUID insertDisplayOnlyRole(String label, int sequence) {
        UUID roleId = UUID.randomUUID();
        jdbcTemplate.update("""
                INSERT INTO approval_line_config
                    (id, document_type, sequence, label, step_type, action_key, required, created_at, created_by, is_deleted)
                VALUES (?, ?, ?, ?, 'GROUP', NULL, TRUE, NOW(), 'it-seed', FALSE)
                """, roleId, DOCUMENT_TYPE, sequence, label);
        return roleId;
    }

    private void resetOutboundDispatcherRole() {
        jdbcTemplate.update("""
                UPDATE approval_line_config
                SET approver_group_id = NULL,
                    required = TRUE,
                    modified_at = NOW(),
                    modified_by = 'approval-line-config-it'
                WHERE document_type = ?
                  AND label IN ('출고인', '출고자', '출고담당')
                  AND is_deleted = FALSE
                """, DOCUMENT_TYPE);
    }

    /**
     * 테스트 전후 approval_line_config 의 label/sequence 를 V61 seed 초기값으로 원복.
     * rename/reorder 테스트 간 DB 공유 오염을 방지한다.
     *
     * <p>reorder 후에도 역할 라벨을 stable key 로 삼아 seed sequence 를 복원한다.
     * sequence 재랭킹에 의존하지 않아 출고자/검수자 row identity 가 섞이지 않는다.
     */
    private void resetApprovalLineConfigToSeedState() {
        // Phase 1: seed 역할을 고정 음수 슬롯으로 이동(unique 충돌 회피)
        jdbcTemplate.update("""
                UPDATE approval_line_config
                SET sequence = CASE
                        WHEN step_type = 'CREATOR' THEN -1
                        WHEN step_type = 'GROUP' AND label IN ('출고인', '출고자', '출고담당') THEN -2
                        WHEN step_type = 'GROUP' AND label IN ('검수인', '검수자') THEN -3
                        ELSE sequence
                    END,
                    modified_at = NOW(),
                    modified_by = 'approval-line-config-it'
                WHERE document_type = ?
                  AND is_deleted = FALSE
                  AND (
                      step_type = 'CREATOR'
                      OR label IN ('출고인', '출고자', '출고담당', '검수인', '검수자')
                  )
                """, DOCUMENT_TYPE);

        // Phase 2: seed label map 으로 원래 label/sequence 복원
        jdbcTemplate.update("""
                UPDATE approval_line_config
                SET label = CASE
                        WHEN step_type = 'CREATOR' THEN '작성자'
                        WHEN step_type = 'GROUP' AND label IN ('출고인', '출고자', '출고담당') THEN '출고자'
                        WHEN step_type = 'GROUP' AND label IN ('검수인', '검수자') THEN '검수자'
                        ELSE label
                    END,
                    sequence = CASE
                        WHEN step_type = 'CREATOR' THEN 0
                        WHEN step_type = 'GROUP' AND label IN ('출고인', '출고자', '출고담당') THEN 1
                        WHEN step_type = 'GROUP' AND label IN ('검수인', '검수자') THEN 2
                        ELSE sequence
                    END,
                    modified_at = NOW(),
                    modified_by = 'approval-line-config-it'
                WHERE document_type = ?
                  AND is_deleted = FALSE
                  AND (
                      step_type = 'CREATOR'
                      OR label IN ('출고인', '출고자', '출고담당', '검수인', '검수자')
                  )
                """, DOCUMENT_TYPE);
    }

    private void cleanPermissionRowsWithoutTouchingManagerSeed() {
        jdbcTemplate.update("""
                DELETE FROM account_permission_overrides
                WHERE account_id IN (?, ?)
                  AND page_code = ?
                """, MANAGER_ACCOUNT_ID, SALES_ACCOUNT_ID, PAGE);
        jdbcTemplate.update("""
                DELETE FROM account_page_permissions
                WHERE account_id = ?
                  AND page_code = ?
                """, SALES_ACCOUNT_ID, PAGE);
    }

    private void cleanApprovalLineApprovers() {
        jdbcTemplate.update("""
                DELETE FROM approval_line_approver
                WHERE created_by NOT IN ('v62-seed', 'v75-seed')
                   OR created_by IS NULL
                   OR config_role_id IN (
                       SELECT id FROM approval_line_config WHERE document_type = ?
                   )
                """, DOCUMENT_TYPE);
    }

    private void cleanDynamicApprovalLineRoles() {
        jdbcTemplate.update("""
                DELETE FROM approval_line_config
                WHERE document_type = ?
                  AND created_by NOT IN ('v61-seed', 'v63-seed', 'v64-seed', 'v75-seed')
                """, DOCUMENT_TYPE);
    }

    private void cleanGroupwareApprovalLineConfig() {
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
}
