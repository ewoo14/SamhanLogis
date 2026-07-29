package com.samhanair.logis.groupware.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.clearInvocations;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.approval.ApprovalStatus;
import com.samhanair.logis.groupware.GroupwareServiceApplication;
import com.samhanair.logis.groupware.client.GroupwareApprovalLineConfigClient;
import com.samhanair.logis.groupware.client.UserClient;
import com.samhanair.logis.groupware.domain.ApprovalLine;
import com.samhanair.logis.groupware.domain.DocumentPayload;
import com.samhanair.logis.groupware.domain.DocumentTemplate;
import com.samhanair.logis.groupware.domain.Message;
import com.samhanair.logis.groupware.domain.Schedule;
import com.samhanair.logis.groupware.dto.ApprovalDecisionRequest;
import com.samhanair.logis.groupware.dto.ApprovalLineCreateRequest;
import com.samhanair.logis.groupware.dto.MessageSendRequest;
import com.samhanair.logis.groupware.dto.ScheduleRequest;
import com.samhanair.logis.groupware.repository.ApprovalLineRepository;
import com.samhanair.logis.groupware.repository.DocumentTemplateRevisionRepository;
import com.samhanair.logis.groupware.repository.DocumentTemplateRepository;
import com.samhanair.logis.groupware.repository.MessageRepository;
import com.samhanair.logis.groupware.repository.ScheduleRepository;
import com.samhanair.logis.groupware.service.DocumentTemplateService;
import com.samhanair.logis.groupware.dto.DocumentTemplateCreateRequest;
import com.samhanair.logis.groupware.dto.DocumentTemplateUpdateRequest;
import com.samhanair.logis.security.permission.DynamicPermissionClient;
import com.samhanair.logis.security.permission.PermissionAction;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders;
import org.springframework.test.web.servlet.result.MockMvcResultMatchers;

/**
 * Admin endpoint 권한 / 흐름 시나리오 (6 case).
 *
 * <ol>
 *   <li>결재선 생성 (POST /admin/groupware/approvals) → 201</li>
 *   <li>결재 승인 (PUT /admin/groupware/approvals/{id}/approve) → 200</li>
 *   <li>결재 반려 (PUT /admin/groupware/approvals/{id}/reject) → 200</li>
 *   <li>메신저 발송 (POST /admin/groupware/messages) → 201</li>
 *   <li>일정 등록 (POST /admin/groupware/schedules) → 201</li>
 *   <li>일정 조회 (GET /admin/groupware/schedules?ownerId&from&to) → 200</li>
 * </ol>
 *
 * <p>UserClient = {@code @MockBean} 격리 (memory feedback_it_mockbean_external_clients).
 */
@SpringBootTest(classes = GroupwareServiceApplication.class)
@AutoConfigureMockMvc
class GroupwareAdminControllerIT extends AbstractPostgresIT {

    private static final String MANAGER_ACCOUNT_ID = "10000000-0000-0000-0000-000000000301";
    private static final String SALES_ACCOUNT_ID = "10000000-0000-0000-0000-000000000302";

    @Autowired
    private MockMvc mockMvc;
    @Autowired
    private ObjectMapper objectMapper;
    @Autowired
    private ApprovalLineRepository approvalLineRepository;
    @Autowired
    private DocumentTemplateRepository documentTemplateRepository;
    @Autowired
    private DocumentTemplateRevisionRepository documentTemplateRevisionRepository;
    @Autowired
    private DocumentTemplateService documentTemplateService;
    @Autowired
    private org.springframework.jdbc.core.JdbcTemplate jdbcTemplate;
    @Autowired
    private MessageRepository messageRepository;
    @Autowired
    private ScheduleRepository scheduleRepository;

    @MockBean
    private UserClient userClient;
    @MockBean
    private DynamicPermissionClient dynamicPermissionClient;
    /**
     * Eureka 미가용 환경에서 실 RestClient 호출을 차단한다
     * ({@code feedback_it_mockbean_external_clients}).
     */
    @MockBean
    private GroupwareApprovalLineConfigClient configClient;

    @BeforeEach
    void cleanup() {
        lenient().when(dynamicPermissionClient.canView(any(), any())).thenReturn(true);
        lenient().when(dynamicPermissionClient.canEdit(any(), any())).thenReturn(true);
        lenient().when(dynamicPermissionClient.check(
                        org.mockito.ArgumentMatchers.any(UUID.class), org.mockito.ArgumentMatchers.anyString(),
                        org.mockito.ArgumentMatchers.any(PermissionAction.class)))
                .thenReturn(true);
        lenient().when(userClient.exists(any())).thenReturn(true);
        // Eureka 미가용 환경 — 실 auth-service RestClient 호출을 차단하고 미설정 상태로 반환한다.
        lenient().when(configClient.fetchRoles(any()))
                .thenReturn(GroupwareApprovalLineConfigClient.ConfigLine.unconfigured());
        // Phase 9 W3 — bulk verify 채택. 모든 입력 ID 를 true 매핑하여 통과시킨다.
        lenient().when(userClient.verifyBulk(anyList())).thenAnswer(inv -> {
            java.util.List<java.util.UUID> ids = inv.getArgument(0);
            java.util.Map<java.util.UUID, Boolean> result = new java.util.HashMap<>();
            for (java.util.UUID id : ids) {
                result.put(id, true);
            }
            return result;
        });
        lenient().when(userClient.resolveDisplayNames(anyList())).thenReturn(java.util.Map.of());
        approvalLineRepository.deleteAll();
        // FABLE5 R1 PM disposition: document_template_revisions의 BEFORE UPDATE OR DELETE trigger는
        // append-only를 강제하지만 TRUNCATE에는 발화하지 않는다 — 이 TRUNCATE는 그 append-only 보장을
        // 우회해 IT 픽스처를 리셋한다(앱 경로에는 TRUNCATE가 없어 위협모델 밖). TRUNCATE 가드 자체는
        // 이 IT 리셋과 충돌해 PM이 별건으로 이월했다.
        jdbcTemplate.execute("TRUNCATE TABLE document_template_revisions, document_templates RESTART IDENTITY CASCADE");
        messageRepository.deleteAll();
        scheduleRepository.deleteAll();
    }

    @Test
    void create_approval_returns_201() throws Exception {
        // P1-2 fix: requesterId 는 헤더 X-User-Id(MANAGER_ACCOUNT_ID) 에서 읽음.
        // 본문 requester UUID 는 무시되므로 이름 조회 mock 을 헤더 UUID 기준으로 구성한다.
        UUID managerActorUuid = UUID.fromString(MANAGER_ACCOUNT_ID);
        UUID forgedRequesterId = differentUuid(managerActorUuid);
        UUID approver1 = UUID.randomUUID();
        UUID approver2 = UUID.randomUUID();
        lenient().when(userClient.resolveDisplayNames(anyList())).thenReturn(java.util.Map.of(
                managerActorUuid, "요청자",
                approver1, "1차결재자",
                approver2, "2차결재자"));
        ApprovalLineCreateRequest req = new ApprovalLineCreateRequest(
                forgedRequesterId, "휴가 신청", "연차 1일",
                List.of(approver1, approver2));
        MvcResult created = mockMvc.perform(MockMvcRequestBuilders.post("/admin/groupware/approvals")
                        .header("X-User-Id", MANAGER_ACCOUNT_ID)
                        .header("X-User-Role", "MANAGER")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(req)))
                .andExpect(MockMvcResultMatchers.status().isCreated())
                .andExpect(MockMvcResultMatchers.jsonPath("$.data.status").value("PENDING"))
                .andExpect(MockMvcResultMatchers.jsonPath("$.data.requesterId").value(MANAGER_ACCOUNT_ID))
                .andExpect(MockMvcResultMatchers.jsonPath("$.data.requesterName").value("요청자"))
                .andExpect(MockMvcResultMatchers.jsonPath("$.data.steps.length()").value(2))
                .andExpect(MockMvcResultMatchers.jsonPath("$.data.steps[0].approverName").value("1차결재자"))
                .andExpect(MockMvcResultMatchers.jsonPath("$.data.steps[1].approverName").value("2차결재자"))
                .andReturn();
        String approvalId = objectMapper.readTree(
                        created.getResponse().getContentAsString(java.nio.charset.StandardCharsets.UTF_8))
                .path("data").path("approvalId").asText();
        ApprovalLine persisted = approvalLineRepository.findById(UUID.fromString(approvalId)).orElseThrow();
        assertThat(persisted.getRequesterId()).isEqualTo(managerActorUuid);
        assertThat(persisted.getRequesterId()).isNotEqualTo(forgedRequesterId);
    }

    @Test
    void approver_search_proxy_returns_user_client_results() throws Exception {
        UUID userId = UUID.randomUUID();
        lenient().when(userClient.search(eq("김"), eq(10)))
                .thenReturn(List.of(new UserClient.ApproverSummary(userId, "김결재", "대표실")));

        mockMvc.perform(MockMvcRequestBuilders.get("/admin/groupware/approvals/approver-search")
                        .header("X-User-Id", MANAGER_ACCOUNT_ID)
                        .header("X-User-Role", "MANAGER")
                        .header("X-User-Department", "대표실")
                        .param("q", "김")
                        .param("limit", "10"))
                .andExpect(MockMvcResultMatchers.status().isOk())
                .andExpect(MockMvcResultMatchers.jsonPath("$.data", org.hamcrest.Matchers.hasSize(1)))
                .andExpect(MockMvcResultMatchers.jsonPath("$.data[0].userId").value(userId.toString()))
                .andExpect(MockMvcResultMatchers.jsonPath("$.data[0].name").value("김결재"))
                .andExpect(MockMvcResultMatchers.jsonPath("$.data[0].department").value("대표실"));
    }

    @Test
    void create_approval_rejects_duplicate_approver_ids() throws Exception {
        // P1-2 fix: requesterId 는 헤더 MANAGER_ACCOUNT_ID. approver 는 별도 UUID(자기 자신 아님).
        UUID managerActorUuid = UUID.fromString(MANAGER_ACCOUNT_ID);
        UUID approver = UUID.randomUUID();
        ApprovalLineCreateRequest req = new ApprovalLineCreateRequest(
                managerActorUuid, "중복 결재자 case", null, List.of(approver, approver));

        mockMvc.perform(MockMvcRequestBuilders.post("/admin/groupware/approvals")
                        .header("X-User-Id", MANAGER_ACCOUNT_ID)
                        .header("X-User-Role", "MANAGER")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(req)))
                .andExpect(MockMvcResultMatchers.status().isBadRequest());
    }

    @Test
    void list_approvals_resolves_display_names_with_single_bulk_call() throws Exception {
        UUID requester1 = UUID.randomUUID();
        UUID approver1 = UUID.randomUUID();
        UUID requester2 = UUID.randomUUID();
        UUID approver2 = UUID.randomUUID();
        ApprovalLine first = ApprovalLine.open("2099/01/01-1", requester1, "목록 결재 1", null);
        first.appendStep(approver1);
        ApprovalLine second = ApprovalLine.open("2099/01/01-2", requester2, "목록 결재 2", null);
        second.appendStep(approver2);
        approvalLineRepository.saveAll(List.of(first, second));
        lenient().when(userClient.resolveDisplayNames(anyList())).thenReturn(Map.of(
                requester1, "요청자1",
                approver1, "결재자1",
                requester2, "요청자2",
                approver2, "결재자2"));
        clearInvocations(userClient);

        mockMvc.perform(MockMvcRequestBuilders.get("/admin/groupware/approvals")
                        .header("X-User-Id", MANAGER_ACCOUNT_ID)
                        .header("X-User-Role", "MANAGER"))
                .andExpect(MockMvcResultMatchers.status().isOk())
                .andExpect(MockMvcResultMatchers.jsonPath("$.data.length()").value(2));

        @SuppressWarnings("unchecked")
        ArgumentCaptor<List<UUID>> idsCaptor = ArgumentCaptor.forClass(List.class);
        verify(userClient, times(1)).resolveDisplayNames(idsCaptor.capture());
        assertThat(idsCaptor.getValue()).contains(requester1, approver1, requester2, approver2);
    }

    @Test
    void approve_first_step_returns_200_in_progress() throws Exception {
        // P1-2 fix: requesterId 는 create 헤더 X-User-Id 에서 읽고, actorId 는 approve 헤더에서 읽는다.
        // create: X-User-Id=MANAGER_ACCOUNT_ID → requesterId. approver1 은 다른 랜덤 UUID.
        // approve: X-User-Id=approver1.toString() → actorId. 본문 approverId 는 무시.
        UUID managerActorUuid = UUID.fromString(MANAGER_ACCOUNT_ID);
        UUID approver1 = UUID.randomUUID();
        UUID approver2 = UUID.randomUUID();
        ApprovalLineCreateRequest createReq = new ApprovalLineCreateRequest(
                managerActorUuid, "결재 진행 case", null, List.of(approver1, approver2));
        MvcResult created = mockMvc.perform(MockMvcRequestBuilders.post("/admin/groupware/approvals")
                        .header("X-User-Id", MANAGER_ACCOUNT_ID)
                        .header("X-User-Role", "MANAGER")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(createReq)))
                .andExpect(MockMvcResultMatchers.status().isCreated())
                .andReturn();
        String approvalId = objectMapper.readTree(
                        created.getResponse().getContentAsString(java.nio.charset.StandardCharsets.UTF_8))
                .path("data").path("approvalId").asText();

        // approver1 이 approve — X-User-Id 헤더에 approver1 UUID 를 직접 전달
        UUID forgedApproverId = differentUuid(approver1);
        ApprovalDecisionRequest decision = new ApprovalDecisionRequest(forgedApproverId, null);
        mockMvc.perform(MockMvcRequestBuilders.put("/admin/groupware/approvals/" + approvalId + "/approve")
                        .header("X-User-Id", approver1.toString())
                        .header("X-User-Role", "MANAGER")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(decision)))
                .andExpect(MockMvcResultMatchers.status().isOk())
                .andExpect(MockMvcResultMatchers.jsonPath("$.data.status").value("IN_PROGRESS"));
        ApprovalLine persisted = approvalLineRepository.findById(UUID.fromString(approvalId)).orElseThrow();
        assertThat(persisted.getStepsView().get(0).getApprovedByUserId()).isEqualTo(approver1);
        assertThat(persisted.getStepsView().get(0).getApprovedByUserId()).isNotEqualTo(forgedApproverId);
    }

    @Test
    void reject_first_step_returns_200_rejected() throws Exception {
        // P1-2 fix: requesterId 는 create 헤더, actorId 는 reject 헤더에서 읽는다.
        UUID managerActorUuid = UUID.fromString(MANAGER_ACCOUNT_ID);
        UUID approver1 = UUID.randomUUID();
        ApprovalLineCreateRequest createReq = new ApprovalLineCreateRequest(
                managerActorUuid, "반려 case", null, List.of(approver1));
        MvcResult created = mockMvc.perform(MockMvcRequestBuilders.post("/admin/groupware/approvals")
                        .header("X-User-Id", MANAGER_ACCOUNT_ID)
                        .header("X-User-Role", "MANAGER")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(createReq)))
                .andReturn();
        String approvalId = objectMapper.readTree(
                        created.getResponse().getContentAsString(java.nio.charset.StandardCharsets.UTF_8))
                .path("data").path("approvalId").asText();

        // approver1 이 reject — X-User-Id 헤더에 approver1 UUID 를 직접 전달
        UUID forgedApproverId = differentUuid(approver1);
        ApprovalDecisionRequest decision = new ApprovalDecisionRequest(forgedApproverId, "사유 부족");
        mockMvc.perform(MockMvcRequestBuilders.put("/admin/groupware/approvals/" + approvalId + "/reject")
                        .header("X-User-Id", approver1.toString())
                        .header("X-User-Role", "MANAGER")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(decision)))
                .andExpect(MockMvcResultMatchers.status().isOk())
                .andExpect(MockMvcResultMatchers.jsonPath("$.data.status").value("REJECTED"));
        ApprovalLine persisted = approvalLineRepository.findById(UUID.fromString(approvalId)).orElseThrow();
        assertThat(persisted.getStatus()).isEqualTo(ApprovalStatus.REJECTED);
        assertThat(persisted.getStepsView().get(0).getApprovedByUserId()).isEqualTo(approver1);
        assertThat(persisted.getStepsView().get(0).getApprovedByUserId()).isNotEqualTo(forgedApproverId);
    }

    @Test
    @org.springframework.security.test.context.support.WithMockUser(username = "ds3a-reprint-it",
            authorities = {"ROLE_MANAGER"})
    void httpApproval_pinsApprovedRevision_andReprintKeepsOldDistinctLayout() throws Exception {
        UUID approver = UUID.randomUUID();
        DocumentTemplateCreateRequest oldRequest = new DocumentTemplateCreateRequest(
                "GROUPWARE_PIN_HTTP", "승인 당시 레이아웃", (short) 1, payloadJson("old-layout"));
        DocumentTemplate oldTemplate = documentTemplateRepository.findById(
                documentTemplateService.create(oldRequest).id()).orElseThrow();
        documentTemplateService.activate(oldTemplate.getId(), "ds3a-http-it");

        ApprovalLine line = ApprovalLine.open("2099/01/01-845", UUID.randomUUID(), "pin HTTP 결재", "old");
        line.linkGroupwareDocument("GROUPWARE_PIN_HTTP", null).appendStep(approver);
        UUID approvalId = approvalLineRepository.saveAndFlush(line).getId();

        mvcApprovalApprove(approvalId, approver)
                .andExpect(MockMvcResultMatchers.status().isOk())
                .andExpect(MockMvcResultMatchers.jsonPath("$.data.status").value("APPROVED"))
                .andExpect(MockMvcResultMatchers.jsonPath("$.data.documentTemplateId").value(oldTemplate.getId().toString()))
                .andExpect(MockMvcResultMatchers.jsonPath("$.data.documentTemplateRevision").value(1));
        assertThat(documentTemplateRevisionRepository
                .findByTemplateIdAndRevisionAndIsDeletedFalse(oldTemplate.getId(), 1))
                .isPresent();

        // 승인 후 같은 양식을 DRAFT로 돌려 revision 2로 수정하고 다시 활성화한다.
        documentTemplateService.deactivate(oldTemplate.getId());
        documentTemplateService.update(oldTemplate.getId(),
                new DocumentTemplateUpdateRequest("GROUPWARE_PIN_HTTP", "수정된 현재 레이아웃", (short) 1,
                        payloadJson("new-layout")));
        documentTemplateService.activate(oldTemplate.getId(), "ds3a-http-it");

        mockMvc.perform(MockMvcRequestBuilders.get(
                        "/groupware/document-templates/{templateId}/revisions/{revision}",
                        oldTemplate.getId(), 1))
                .andExpect(MockMvcResultMatchers.status().isOk())
                .andExpect(MockMvcResultMatchers.jsonPath("$.data.revision").value(1))
                .andExpect(MockMvcResultMatchers.jsonPath("$.data.document.bands[0].key").value("old-layout"));
        mockMvc.perform(MockMvcRequestBuilders.get("/groupware/document-templates/active")
                        .param("docType", "GROUPWARE_PIN_HTTP"))
                .andExpect(MockMvcResultMatchers.status().isOk())
                .andExpect(MockMvcResultMatchers.jsonPath("$.data.revision").value(2))
                .andExpect(MockMvcResultMatchers.jsonPath("$.data.document.bands[0].key").value("new-layout"));
    }

    @Test
    @org.springframework.security.test.context.support.WithMockUser(username = "r2-missing-revision-it",
            authorities = {"ROLE_MANAGER"})
    void httpApproval_whenActiveTemplateRevisionIsMissing_selfHealsBeforePin() throws Exception {
        UUID templateId = UUID.randomUUID();
        String docType = "GROUPWARE_R2_MISSING_REVISION";
        insertRawTemplate(templateId, docType, "revision 없는 ACTIVE 양식", "ACTIVE",
                "{\"paper\":\"A4_PORTRAIT\",\"bands\":[]}");
        UUID approver = UUID.randomUUID();
        ApprovalLine line = ApprovalLine.open("2099/01/01-851", UUID.randomUUID(), "R2 self-heal 결재", "본문");
        line.linkGroupwareDocument(docType, null).appendStep(approver);
        UUID approvalId = approvalLineRepository.saveAndFlush(line).getId();

        assertThat(jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM document_template_revisions WHERE template_id = ?", Integer.class,
                templateId)).isZero();

        mvcApprovalApprove(approvalId, approver)
                .andExpect(MockMvcResultMatchers.status().isOk())
                .andExpect(MockMvcResultMatchers.jsonPath("$.data.status").value("APPROVED"))
                .andExpect(MockMvcResultMatchers.jsonPath("$.data.documentTemplateId")
                        .value(templateId.toString()))
                .andExpect(MockMvcResultMatchers.jsonPath("$.data.documentTemplateRevision").value(1));

        Map<String, Object> row = jdbcTemplate.queryForMap(
                "SELECT status, version, document_template_id, document_template_revision, "
                        + "document_template_default_pinned FROM approval_lines WHERE id = ?", approvalId);
        assertThat(row.get("status")).isEqualTo("APPROVED");
        assertThat(row.get("version")).isEqualTo(1L);
        assertThat(row.get("document_template_id")).isEqualTo(templateId);
        assertThat(row.get("document_template_revision")).isEqualTo(1);
        assertThat(row.get("document_template_default_pinned")).isEqualTo(false);
        assertThat(jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM document_template_revisions WHERE template_id = ? AND revision = 1",
                Integer.class, templateId)).isEqualTo(1);

        assertThatThrownBy(() -> jdbcTemplate.update(
                "UPDATE approval_lines SET document_template_id = NULL, "
                        + "document_template_revision = NULL, document_template_default_pinned = FALSE "
                        + "WHERE id = ?", approvalId))
                .isInstanceOf(org.springframework.dao.DataAccessException.class);
        Map<String, Object> immutableRow = jdbcTemplate.queryForMap(
                "SELECT status, document_template_id, document_template_revision, "
                        + "document_template_default_pinned FROM approval_lines WHERE id = ?", approvalId);
        assertThat(immutableRow.get("status")).isEqualTo("APPROVED");
        assertThat(immutableRow.get("document_template_id")).isEqualTo(templateId);
        assertThat(immutableRow.get("document_template_revision")).isEqualTo(1);
        assertThat(immutableRow.get("document_template_default_pinned")).isEqualTo(false);
    }

    /**
     * R3 B-1 fix — V12이 신설한 CHECK {@code ck_approval_lines_document_template_default_pin}에
     * 대한 직접 테스트가 0건이었다. 형제 제약(append-only 트리거는 {@code DocumentTemplateIT},
     * {@code document_templates}의 status CHECK+부분 인덱스는
     * {@code directStatusConstraintAndActivePartialIndex_areEnforced})은 전부 직접 테스트하는
     * 것이 이 레포 컨벤션인데 이 CHECK만 누락돼 있었다.
     *
     * <p>승인 전(미pin, 세 컬럼 모두 초기값) 행에 직접 SQL로 "default_pinned=true이면서 실
     * revision도 동시에 갖는" 상태를 시도한다. OLD가 미pin 상태라 V13 append-once 트리거는
     * 이 UPDATE를 통과시키므로(가드조건 불성립), 거절된다면 그 원인은 오직 이 CHECK 자체다.
     */
    @Test
    @org.springframework.security.test.context.support.WithMockUser(username = "ds3a-check-constraint-it",
            authorities = {"ROLE_MANAGER"})
    void directCheckConstraint_defaultPinnedAndRevisionPin_areMutuallyExclusive() throws Exception {
        DocumentTemplateCreateRequest request = new DocumentTemplateCreateRequest(
                "GROUPWARE_PIN_CHECK_DIRECT", "CHECK 직접 검증용", (short) 1, payloadJson("check-direct-layout"));
        DocumentTemplate template = documentTemplateRepository.findById(
                documentTemplateService.create(request).id()).orElseThrow();
        documentTemplateService.activate(template.getId(), "ds3a-check-constraint-it");

        ApprovalLine line = ApprovalLine.open("2099/01/01-849", UUID.randomUUID(), "CHECK 직접 검증", "미승인");
        line.linkGroupwareDocument("GROUPWARE_PIN_CHECK_DIRECT", null).appendStep(UUID.randomUUID());
        UUID approvalId = approvalLineRepository.saveAndFlush(line).getId();

        assertThatThrownBy(() -> jdbcTemplate.update(
                "UPDATE approval_lines SET document_template_default_pinned = TRUE, "
                        + "document_template_id = ?, document_template_revision = ? WHERE id = ?",
                template.getId(), 1, approvalId))
                .isInstanceOf(org.springframework.dao.DataAccessException.class);
    }

    /**
     * R3 MED fix — 감사 무결성: 승인 시점에 각인된 pin(document_template_id/revision/
     * default_pinned)은 애플리케이션 계층 뿐 아니라 그 계층을 우회한 직접 SQL UPDATE로도
     * 다시 쓸 수 없어야 한다(V13 append-once 트리거).
     *
     * <p>R3 통합/보안 차원 격리 probe(TEST-A/TEST-A2)를 이 IT의 실 Postgres에서 재현한다 —
     * 두 가지 위조 형태를 모두 시도한다: (a) 각인을 다른 template/revision으로 바꿔치기,
     * (b) 각인 통째 NULL화(원 BLOCKING — 무pin 복귀). 둘 다 거절되고 행 상태는 승인 당시
     * 값 그대로 남아야 한다. 대조군으로 pin과 무관한 컬럼(content) UPDATE는 여전히
     * 허용됨을 함께 확인해 트리거가 과잉 차단하지 않음을 증명한다.
     */
    @Test
    @org.springframework.security.test.context.support.WithMockUser(username = "ds3a-pin-immutable-it",
            authorities = {"ROLE_MANAGER"})
    void httpApproval_pinnedLayout_cannotBeRewrittenByDirectSqlUpdate() throws Exception {
        UUID approver = UUID.randomUUID();
        DocumentTemplateCreateRequest oldRequest = new DocumentTemplateCreateRequest(
                "GROUPWARE_PIN_IMMUTABLE_HTTP", "승인 당시 레이아웃", (short) 1, payloadJson("immutable-old-layout"));
        DocumentTemplate oldTemplate = documentTemplateRepository.findById(
                documentTemplateService.create(oldRequest).id()).orElseThrow();
        documentTemplateService.activate(oldTemplate.getId(), "ds3a-pin-immutable-it");

        ApprovalLine line = ApprovalLine.open("2099/01/01-848", UUID.randomUUID(), "pin 불변성 결재", "old");
        line.linkGroupwareDocument("GROUPWARE_PIN_IMMUTABLE_HTTP", null).appendStep(approver);
        UUID approvalId = approvalLineRepository.saveAndFlush(line).getId();

        mvcApprovalApprove(approvalId, approver)
                .andExpect(MockMvcResultMatchers.status().isOk())
                .andExpect(MockMvcResultMatchers.jsonPath("$.data.documentTemplateId").value(oldTemplate.getId().toString()))
                .andExpect(MockMvcResultMatchers.jsonPath("$.data.documentTemplateRevision").value(1));

        // 위조 대상으로 쓸 서로 다른 (template_id, revision) 이력 한 건을 더 만든다.
        DocumentTemplateCreateRequest otherRequest = new DocumentTemplateCreateRequest(
                "GROUPWARE_PIN_IMMUTABLE_HTTP_OTHER", "위조용 다른 양식", (short) 1, payloadJson("forged-layout"));
        DocumentTemplate otherTemplate = documentTemplateRepository.findById(
                documentTemplateService.create(otherRequest).id()).orElseThrow();
        documentTemplateService.activate(otherTemplate.getId(), "ds3a-pin-immutable-it");

        // TEST-A: 각인을 다른 template/revision으로 바꿔치기 — CHECK는 통과하지만 V13 트리거가 거절해야 한다.
        assertThatThrownBy(() -> jdbcTemplate.update(
                "UPDATE approval_lines SET document_template_default_pinned = FALSE, "
                        + "document_template_id = ?, document_template_revision = ? WHERE id = ?",
                otherTemplate.getId(), 1, approvalId))
                .isInstanceOf(org.springframework.dao.DataAccessException.class);

        // TEST-A2: 각인 통째 NULL화(원 BLOCKING — 무pin 복귀) — 이 역시 거절되어야 한다.
        assertThatThrownBy(() -> jdbcTemplate.update(
                "UPDATE approval_lines SET document_template_id = NULL, "
                        + "document_template_revision = NULL, document_template_default_pinned = FALSE WHERE id = ?",
                approvalId))
                .isInstanceOf(org.springframework.dao.DataAccessException.class);

        // 두 위조 시도 모두 실패했으니 각인은 승인 당시 값 그대로 남아 있어야 한다.
        Map<String, Object> row = jdbcTemplate.queryForMap(
                "SELECT document_template_id, document_template_revision, document_template_default_pinned "
                        + "FROM approval_lines WHERE id = ?", approvalId);
        assertThat(row.get("document_template_id")).isEqualTo(oldTemplate.getId());
        assertThat(row.get("document_template_revision")).isEqualTo(1);
        assertThat(row.get("document_template_default_pinned")).isEqualTo(false);

        // 대조군 — pin과 무관한 컬럼(content) UPDATE는 여전히 허용된다(과잉 차단 아님).
        jdbcTemplate.update("UPDATE approval_lines SET content = ? WHERE id = ?", "content-after-pin", approvalId);
        assertThat(jdbcTemplate.queryForObject(
                "SELECT content FROM approval_lines WHERE id = ?", String.class, approvalId))
                .isEqualTo("content-after-pin");
    }

    @Test
    @org.springframework.security.test.context.support.WithMockUser(username = "ds3a-active-zero-it",
            authorities = {"ROLE_MANAGER"})
    void httpApproval_whenNoActiveTemplate_pinsDefaultFact_andReprintStaysDefaultAfterNewActivation() throws Exception {
        UUID approver = UUID.randomUUID();
        String docType = "GROUPWARE_ACTIVE_ZERO_HTTP";
        DocumentTemplateCreateRequest draftRequest = new DocumentTemplateCreateRequest(
                docType, "승인 당시 기본 양식", (short) 1, payloadJson("default-at-approval"));
        UUID draftId = documentTemplateService.create(draftRequest).id();

        ApprovalLine line = ApprovalLine.open("2099/01/01-846", UUID.randomUUID(), "ACTIVE-0 결재", "default");
        line.linkGroupwareDocument(docType, null).appendStep(approver);
        UUID approvalId = approvalLineRepository.saveAndFlush(line).getId();

        mvcApprovalApprove(approvalId, approver)
                .andExpect(MockMvcResultMatchers.status().isOk())
                .andExpect(MockMvcResultMatchers.jsonPath("$.data.status").value("APPROVED"))
                .andExpect(MockMvcResultMatchers.jsonPath("$.data.documentTemplateId").doesNotExist())
                .andExpect(MockMvcResultMatchers.jsonPath("$.data.documentTemplateRevision").doesNotExist())
                .andExpect(MockMvcResultMatchers.jsonPath("$.data.documentTemplateDefaultPinned").value(true));

        // ACTIVE-0 각인은 default=true 자체가 감사 사실이므로 직접 철회할 수 없어야 한다.
        assertThatThrownBy(() -> jdbcTemplate.update(
                "UPDATE approval_lines SET document_template_default_pinned = FALSE WHERE id = ?",
                approvalId))
                .isInstanceOf(org.springframework.dao.DataAccessException.class);
        Map<String, Object> defaultPinRow = jdbcTemplate.queryForMap(
                "SELECT document_template_id, document_template_revision, document_template_default_pinned "
                        + "FROM approval_lines WHERE id = ?", approvalId);
        assertThat(defaultPinRow.get("document_template_id")).isNull();
        assertThat(defaultPinRow.get("document_template_revision")).isNull();
        assertThat(defaultPinRow.get("document_template_default_pinned")).isEqualTo(true);

        DocumentTemplateCreateRequest newRequest = new DocumentTemplateCreateRequest(
                docType, "승인 이후 새 양식", (short) 1, payloadJson("new-active-after-approval"));
        UUID newTemplateId = documentTemplateService.create(newRequest).id();
        documentTemplateService.activate(newTemplateId, "ds3a-active-zero-it");

        mockMvc.perform(MockMvcRequestBuilders.get("/admin/groupware/approvals/{id}", approvalId)
                        .header("X-User-Id", "10000000-0000-0000-0000-000000000301")
                        .header("X-User-Role", "MANAGER"))
                .andExpect(MockMvcResultMatchers.status().isOk())
                .andExpect(MockMvcResultMatchers.jsonPath("$.data.documentTemplateId").doesNotExist())
                .andExpect(MockMvcResultMatchers.jsonPath("$.data.documentTemplateRevision").doesNotExist())
                .andExpect(MockMvcResultMatchers.jsonPath("$.data.documentTemplateDefaultPinned").value(true));

        assertThat(documentTemplateRepository.findById(draftId)).isPresent();
        assertThat(documentTemplateRepository.findById(newTemplateId).orElseThrow().getStatus())
                .isEqualTo(com.samhanair.logis.groupware.domain.DocumentTemplateStatus.ACTIVE);
    }

    @Test
    @org.springframework.security.test.context.support.WithMockUser(username = "ds3a-default-pin-trigger-it",
            authorities = {"ROLE_MANAGER"})
    void directSql_defaultPinFactCannotBeWithdrawnAfterItsFirstWrite() {
        ApprovalLine line = ApprovalLine.open("2099/01/01-850", UUID.randomUUID(), "기본 양식 pin 불변성", "pending");
        line.appendStep(UUID.randomUUID());
        UUID approvalId = approvalLineRepository.saveAndFlush(line).getId();

        // V13의 OLD.document_template_default_pinned disjunct만 독립적으로 검증한다.
        jdbcTemplate.update("UPDATE approval_lines SET document_template_default_pinned = TRUE WHERE id = ?",
                approvalId);
        assertThatThrownBy(() -> jdbcTemplate.update(
                "UPDATE approval_lines SET document_template_default_pinned = FALSE WHERE id = ?",
                approvalId))
                .isInstanceOf(org.springframework.dao.DataAccessException.class);
        assertThat(jdbcTemplate.queryForObject(
                "SELECT document_template_default_pinned FROM approval_lines WHERE id = ?", Boolean.class,
                approvalId)).isTrue();
    }

    @Test
    @org.springframework.security.test.context.support.WithMockUser(username = "ds3a-approved-legacy-it",
            authorities = {"ROLE_MANAGER"})
    void directSql_approvedLegacyUnpinnedCannotReceiveFirstDocumentTemplatePin() throws Exception {
        String docType = "GROUPWARE_APPROVED_LEGACY_PIN";
        DocumentTemplate template = documentTemplateRepository.findById(documentTemplateService.create(
                new DocumentTemplateCreateRequest(docType, "legacy 승인 행 검증용", (short) 1,
                        payloadJson("legacy-pin-layout"))).id()).orElseThrow();
        documentTemplateService.activate(template.getId(), "ds3a-approved-legacy-it");

        ApprovalLine line = ApprovalLine.open("2099/01/01-847", UUID.randomUUID(), "legacy 승인 행", "legacy");
        line.appendStep(UUID.randomUUID());
        UUID approvalId = approvalLineRepository.saveAndFlush(line).getId();

        // 과거 데이터에 있을 수 있는 APPROVED + 미pin 행을 직접 재현한다.
        jdbcTemplate.update("UPDATE approval_lines SET status = 'APPROVED' WHERE id = ?", approvalId);

        assertThatThrownBy(() -> jdbcTemplate.update(
                "UPDATE approval_lines SET document_template_id = ?, document_template_revision = ?, "
                        + "document_template_default_pinned = FALSE WHERE id = ?",
                template.getId(), 1, approvalId))
                .isInstanceOf(org.springframework.dao.DataAccessException.class);

        Map<String, Object> row = jdbcTemplate.queryForMap(
                "SELECT status, document_template_id, document_template_revision, "
                        + "document_template_default_pinned FROM approval_lines WHERE id = ?", approvalId);
        assertThat(row.get("status")).isEqualTo("APPROVED");
        assertThat(row.get("document_template_id")).isNull();
        assertThat(row.get("document_template_revision")).isNull();
        assertThat(row.get("document_template_default_pinned")).isEqualTo(false);
    }

    private org.springframework.test.web.servlet.ResultActions mvcApprovalApprove(UUID approvalId, UUID approver)
            throws Exception {
        return mockMvc.perform(MockMvcRequestBuilders.put("/admin/groupware/approvals/{id}/approve", approvalId)
                .header("X-User-Id", approver.toString())
                .header("X-User-Role", "MANAGER")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(new ApprovalDecisionRequest(UUID.randomUUID(), null))));
    }

    private DocumentPayload payload(String bandKey) {
        return new DocumentPayload("A4_PORTRAIT", List.of(
                new DocumentPayload.Band(bandKey, "HEADER", List.of(
                        new DocumentPayload.Element("title", "TITLE"),
                        new DocumentPayload.Element("approval", "APPROVAL_GRID"))),
                new DocumentPayload.Band("body", "BODY", List.of(
                        new DocumentPayload.Element("content", "CONTENT_PARAGRAPHS"))),
                new DocumentPayload.Band("footer", "FOOTER", List.of(
                        new DocumentPayload.Element("closing", "CLOSING")))));
    }

    private void insertRawTemplate(UUID id, String docType, String name, String status, String document) {
        jdbcTemplate.update("INSERT INTO document_templates (id,doc_type,name,revision,status,schema_version,"
                        + "lock_version,document,created_at,created_by,is_deleted) "
                        + "VALUES (?,?,?,?,?,?,?,?::jsonb,?,?,false)",
                id, docType, name, 1, status, (short) 1, 0L, document,
                java.sql.Timestamp.valueOf(LocalDateTime.now()), "r2-missing-revision-it");
    }

    private JsonNode payloadJson(String bandKey) {
        return objectMapper.valueToTree(payload(bandKey));
    }

    /**
     * templateId 없음 + approverIds 빈 리스트 → config 미설정 + 수동 결재자 0 → 400 INVALID_INPUT.
     *
     * <p>HTTP 레이어를 통해 {@link ApprovalLineService#createWithActor} 경로가
     * 결재자 부재를 올바르게 거부하는지 계약 단언한다.
     */
    @Test
    void create_approval_with_no_template_and_empty_approvers_returns_400() throws Exception {
        // configClient 는 unconfigured 반환 (setUp stub). approverIds = 빈 리스트.
        ApprovalLineCreateRequest req = new ApprovalLineCreateRequest(
                UUID.fromString(MANAGER_ACCOUNT_ID), "결재자 없음 테스트", null, List.of());
        mockMvc.perform(MockMvcRequestBuilders.post("/admin/groupware/approvals")
                        .header("X-User-Id", MANAGER_ACCOUNT_ID)
                        .header("X-User-Role", "MANAGER")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(req)))
                .andExpect(MockMvcResultMatchers.status().isBadRequest());
    }

    /** 신원 위조 회귀 테스트용으로 기준 actor 와 다른 UUID 를 만든다. */
    private static UUID differentUuid(UUID baseline) {
        UUID candidate = UUID.randomUUID();
        while (candidate.equals(baseline)) {
            candidate = UUID.randomUUID();
        }
        return candidate;
    }

    @Test
    void send_message_returns_201() throws Exception {
        MessageSendRequest req = new MessageSendRequest(UUID.randomUUID(), UUID.randomUUID(), "안녕하세요");
        mockMvc.perform(MockMvcRequestBuilders.post("/admin/groupware/messages")
                        .header("X-User-Id", SALES_ACCOUNT_ID)
                        .header("X-User-Role", "SALES")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(req)))
                .andExpect(MockMvcResultMatchers.status().isCreated())
                .andExpect(MockMvcResultMatchers.jsonPath("$.data.status").value("UNREAD"))
                .andExpect(MockMvcResultMatchers.jsonPath("$.data.body").value("안녕하세요"));
    }

    @Test
    void send_message_uses_header_sender_and_ignores_body_sender() throws Exception {
        UUID actor = UUID.fromString(SALES_ACCOUNT_ID);
        UUID forgedSender = differentUuid(actor);
        UUID recipient = UUID.fromString(MANAGER_ACCOUNT_ID);
        MessageSendRequest req = new MessageSendRequest(forgedSender, recipient, "발신자 위조 차단");

        MvcResult created = mockMvc.perform(MockMvcRequestBuilders.post("/admin/groupware/messages")
                        .header("X-User-Id", SALES_ACCOUNT_ID)
                        .header("X-User-Role", "SALES")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(req)))
                .andExpect(MockMvcResultMatchers.status().isCreated())
                .andExpect(MockMvcResultMatchers.jsonPath("$.data.senderId").value(SALES_ACCOUNT_ID))
                .andExpect(MockMvcResultMatchers.jsonPath("$.data.recipientId").value(MANAGER_ACCOUNT_ID))
                .andReturn();

        UUID messageId = UUID.fromString(objectMapper.readTree(
                        created.getResponse().getContentAsString(java.nio.charset.StandardCharsets.UTF_8))
                .path("data").path("messageId").asText());
        Message persisted = messageRepository.findById(messageId).orElseThrow();
        assertThat(persisted.getSenderId()).isEqualTo(actor);
        assertThat(persisted.getSenderId()).isNotEqualTo(forgedSender);
    }

    @Test
    void inbox_uses_header_recipient_and_ignores_user_id_param() throws Exception {
        UUID actor = UUID.fromString(SALES_ACCOUNT_ID);
        UUID other = UUID.fromString(MANAGER_ACCOUNT_ID);
        UUID sender = UUID.randomUUID();
        messageRepository.save(Message.send(sender, actor, "내 수신함"));
        messageRepository.save(Message.send(sender, other, "타인 수신함"));

        mockMvc.perform(MockMvcRequestBuilders.get("/admin/groupware/messages/inbox")
                        .param("userId", other.toString())
                        .header("X-User-Id", SALES_ACCOUNT_ID)
                        .header("X-User-Role", "SALES"))
                .andExpect(MockMvcResultMatchers.status().isOk())
                .andExpect(MockMvcResultMatchers.jsonPath("$.data.length()").value(1))
                .andExpect(MockMvcResultMatchers.jsonPath("$.data[0].recipientId").value(SALES_ACCOUNT_ID))
                .andExpect(MockMvcResultMatchers.jsonPath("$.data[0].body").value("내 수신함"));
    }

    @Test
    void inbox_exposesWhetherAnActualNextPageExists() throws Exception {
        UUID actor = UUID.fromString(SALES_ACCOUNT_ID);
        UUID sender = UUID.randomUUID();
        for (int i = 0; i < 50; i++) {
            messageRepository.save(Message.send(sender, actor, "마지막 페이지 " + i));
        }

        mockMvc.perform(MockMvcRequestBuilders.get("/admin/groupware/messages/inbox")
                        .header("X-User-Id", SALES_ACCOUNT_ID)
                        .header("X-User-Role", "SALES"))
                .andExpect(MockMvcResultMatchers.status().isOk())
                .andExpect(MockMvcResultMatchers.header().string("X-Has-Next-Page", "false"));

        messageRepository.save(Message.send(sender, actor, "다음 페이지 첫 행"));
        mockMvc.perform(MockMvcRequestBuilders.get("/admin/groupware/messages/inbox")
                        .header("X-User-Id", SALES_ACCOUNT_ID)
                        .header("X-User-Role", "SALES"))
                .andExpect(MockMvcResultMatchers.status().isOk())
                .andExpect(MockMvcResultMatchers.header().string("X-Has-Next-Page", "true"));
    }

    @Test
    void create_schedule_returns_201() throws Exception {
        ScheduleRequest req = new ScheduleRequest(
                UUID.randomUUID(), "주간 회의", "주간 정기",
                LocalDateTime.now().plusDays(1),
                LocalDateTime.now().plusDays(1).plusHours(1),
                null,
                List.of(UUID.randomUUID()));
        mockMvc.perform(MockMvcRequestBuilders.post("/admin/groupware/schedules")
                        .header("X-User-Id", SALES_ACCOUNT_ID)
                        .header("X-User-Role", "SALES")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(req)))
                .andExpect(MockMvcResultMatchers.status().isCreated())
                .andExpect(MockMvcResultMatchers.jsonPath("$.data.status").value("DRAFT"));
    }

    @Test
    void create_schedule_uses_header_owner_and_keeps_participants() throws Exception {
        UUID actor = UUID.fromString(SALES_ACCOUNT_ID);
        UUID forgedOwner = differentUuid(actor);
        UUID participant = UUID.fromString(MANAGER_ACCOUNT_ID);
        ScheduleRequest req = new ScheduleRequest(
                forgedOwner, "헤더 소유자 일정", "참여자 보존",
                LocalDateTime.now().plusDays(1),
                LocalDateTime.now().plusDays(1).plusHours(1),
                null,
                List.of(actor, participant));

        MvcResult created = mockMvc.perform(MockMvcRequestBuilders.post("/admin/groupware/schedules")
                        .header("X-User-Id", SALES_ACCOUNT_ID)
                        .header("X-User-Role", "SALES")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(req)))
                .andExpect(MockMvcResultMatchers.status().isCreated())
                .andExpect(MockMvcResultMatchers.jsonPath("$.data.ownerId").value(SALES_ACCOUNT_ID))
                .andExpect(MockMvcResultMatchers.jsonPath("$.data.participantIds.length()").value(2))
                .andReturn();

        UUID scheduleId = UUID.fromString(objectMapper.readTree(
                        created.getResponse().getContentAsString(java.nio.charset.StandardCharsets.UTF_8))
                .path("data").path("scheduleId").asText());
        Schedule persisted = scheduleRepository.findById(scheduleId).orElseThrow();
        assertThat(persisted.getOwnerId()).isEqualTo(actor);
        assertThat(persisted.getOwnerId()).isNotEqualTo(forgedOwner);
        assertThat(persisted.getParticipantsView())
                .extracting(p -> p.getParticipantId())
                .containsExactlyInAnyOrder(actor, participant);
    }

    /** Testcontainers PostgreSQL + ubuntu-latest에서 messenger.admin 보유 비소유자 삭제도 403인지 검증한다. */
    @Test
    void non_owner_cannot_delete_schedule_even_when_messenger_admin_permission_is_granted() throws Exception {
        UUID owner = UUID.fromString(SALES_ACCOUNT_ID);
        UUID manager = UUID.fromString(MANAGER_ACCOUNT_ID);
        LocalDateTime base = LocalDateTime.now().withNano(0);
        ScheduleRequest req = new ScheduleRequest(
                UUID.randomUUID(), "소유자 일정", "삭제 보호",
                base.plusDays(1), base.plusDays(1).plusHours(1), null, null);

        MvcResult created = mockMvc.perform(MockMvcRequestBuilders.post("/admin/groupware/schedules")
                        .header("X-User-Id", owner.toString())
                        .header("X-User-Role", "SALES")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(req)))
                .andExpect(MockMvcResultMatchers.status().isCreated())
                .andReturn();
        UUID scheduleId = UUID.fromString(objectMapper.readTree(
                        created.getResponse().getContentAsString(java.nio.charset.StandardCharsets.UTF_8))
                .path("data").path("scheduleId").asText());

        // 기존 messenger.admin 권한을 가진 MANAGER가 새 일정 권한도 통과해도 객체 소유자 검사는 남아야 한다.
        lenient().when(dynamicPermissionClient.check(eq(manager), eq("messenger.admin"),
                        eq(PermissionAction.DELETE)))
                .thenReturn(true);
        lenient().when(dynamicPermissionClient.check(eq(manager), eq("groupware.schedules"),
                        eq(PermissionAction.DELETE)))
                .thenReturn(true);

        mockMvc.perform(MockMvcRequestBuilders.delete("/admin/groupware/schedules/{id}", scheduleId)
                        .header("X-User-Id", manager.toString())
                        .header("X-User-Role", "MANAGER"))
                .andExpect(MockMvcResultMatchers.status().isForbidden());

        Schedule persisted = scheduleRepository.findById(scheduleId).orElseThrow();
        assertThat(persisted.getOwnerId()).isEqualTo(owner);
        assertThat(persisted.getTitle()).isEqualTo("소유자 일정");
    }

    /** Testcontainers PostgreSQL + ubuntu-latest에서 messenger.send가 없는 내부 사용자도 일정 등록 가능함을 검증한다. */
    @Test
    void internal_user_without_messenger_send_permission_can_create_schedule() throws Exception {
        UUID actor = UUID.randomUUID();
        LocalDateTime base = LocalDateTime.now().withNano(0);
        ScheduleRequest req = new ScheduleRequest(
                UUID.randomUUID(), "메신저 무권한 일정", "일정 권한 분리",
                base.plusDays(1), base.plusDays(1).plusHours(1), null, null);

        when(dynamicPermissionClient.check(eq(actor), eq("messenger.send"), any(PermissionAction.class)))
                .thenReturn(false);
        when(dynamicPermissionClient.check(eq(actor), eq("groupware.schedules"),
                        eq(PermissionAction.CREATE)))
                .thenReturn(true);

        MvcResult created = mockMvc.perform(MockMvcRequestBuilders.post("/admin/groupware/schedules")
                        .header("X-User-Id", actor.toString())
                        .header("X-User-Role", "STAFF")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(req)))
                .andExpect(MockMvcResultMatchers.status().isCreated())
                .andReturn();

        UUID scheduleId = UUID.fromString(objectMapper.readTree(
                        created.getResponse().getContentAsString(java.nio.charset.StandardCharsets.UTF_8))
                .path("data").path("scheduleId").asText());
        Schedule persisted = scheduleRepository.findById(scheduleId).orElseThrow();
        assertThat(persisted.getOwnerId()).isEqualTo(actor);
    }

    @Test
    void find_schedules_in_range_returns_200() throws Exception {
        UUID owner = UUID.randomUUID();
        // 시간을 분 단위로 잘라 nanos 직렬화 차이를 회피 — @DateTimeFormat ISO.DATE_TIME 호환 보장.
        LocalDateTime base = LocalDateTime.now().withNano(0);
        ScheduleRequest req = new ScheduleRequest(
                owner, "조회 fixture", null,
                base.plusDays(1),
                base.plusDays(1).plusHours(2),
                null, null);
        mockMvc.perform(MockMvcRequestBuilders.post("/admin/groupware/schedules")
                        .header("X-User-Id", MANAGER_ACCOUNT_ID)
                        .header("X-User-Role", "MANAGER")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(req)))
                .andExpect(MockMvcResultMatchers.status().isCreated());

        // window [base-1h, base+3d] — 본 fixture (base+1d ~ base+1d+2h) 가 반드시 포함.
        String from = base.minusHours(1).format(DateTimeFormatter.ISO_LOCAL_DATE_TIME);
        String to = base.plusDays(3).format(DateTimeFormatter.ISO_LOCAL_DATE_TIME);
        mockMvc.perform(MockMvcRequestBuilders.get("/admin/groupware/schedules")
                        .param("ownerId", owner.toString())
                        .param("from", from)
                        .param("to", to)
                        .header("X-User-Id", MANAGER_ACCOUNT_ID)
                        .header("X-User-Role", "MANAGER"))
                .andExpect(MockMvcResultMatchers.status().isOk())
                .andExpect(MockMvcResultMatchers.jsonPath("$.data.length()").value(1))
                .andExpect(MockMvcResultMatchers.jsonPath("$.data[0].title").value("조회 fixture"));
    }

    @Test
    void find_schedules_uses_header_owner_and_ignores_owner_id_param() throws Exception {
        UUID actor = UUID.fromString(SALES_ACCOUNT_ID);
        UUID other = UUID.fromString(MANAGER_ACCOUNT_ID);
        LocalDateTime base = LocalDateTime.now().withNano(0);
        scheduleRepository.save(Schedule.create(actor, "내 일정", null,
                base.plusDays(1), base.plusDays(1).plusHours(1), null));
        scheduleRepository.save(Schedule.create(other, "타인 일정", null,
                base.plusDays(1), base.plusDays(1).plusHours(1), null));

        mockMvc.perform(MockMvcRequestBuilders.get("/admin/groupware/schedules")
                        .param("ownerId", other.toString())
                        .param("from", base.format(DateTimeFormatter.ISO_LOCAL_DATE_TIME))
                        .param("to", base.plusDays(2).format(DateTimeFormatter.ISO_LOCAL_DATE_TIME))
                        .header("X-User-Id", SALES_ACCOUNT_ID)
                        .header("X-User-Role", "SALES"))
                .andExpect(MockMvcResultMatchers.status().isOk())
                .andExpect(MockMvcResultMatchers.jsonPath("$.data.length()").value(1))
                .andExpect(MockMvcResultMatchers.jsonPath("$.data[0].ownerId").value(SALES_ACCOUNT_ID))
                .andExpect(MockMvcResultMatchers.jsonPath("$.data[0].title").value("내 일정"));
    }

    /** Testcontainers PostgreSQL 기반으로 실행되며 ubuntu-latest에서도 같은 권한 계약을 검증한다. */
    @Test
    void find_schedules_includes_invited_participant_schedule_once() throws Exception {
        UUID owner = UUID.fromString(SALES_ACCOUNT_ID);
        UUID invitedParticipant = UUID.fromString(MANAGER_ACCOUNT_ID);
        UUID anotherParticipant = UUID.randomUUID();
        LocalDateTime base = LocalDateTime.now().withNano(0);
        ScheduleRequest req = new ScheduleRequest(
                UUID.randomUUID(), "초대받은 일정", "참여자 일정 조회",
                base.plusDays(1), base.plusDays(1).plusHours(2), null,
                List.of(invitedParticipant, anotherParticipant));

        mockMvc.perform(MockMvcRequestBuilders.post("/admin/groupware/schedules")
                        .header("X-User-Id", SALES_ACCOUNT_ID)
                        .header("X-User-Role", "SALES")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(req)))
                .andExpect(MockMvcResultMatchers.status().isCreated())
                .andExpect(MockMvcResultMatchers.jsonPath("$.data.participantIds.length()").value(2));

        mockMvc.perform(MockMvcRequestBuilders.get("/admin/groupware/schedules")
                        .param("from", base.format(DateTimeFormatter.ISO_LOCAL_DATE_TIME))
                        .param("to", base.plusDays(2).format(DateTimeFormatter.ISO_LOCAL_DATE_TIME))
                        .header("X-User-Id", MANAGER_ACCOUNT_ID)
                        .header("X-User-Role", "MANAGER"))
                .andExpect(MockMvcResultMatchers.status().isOk())
                .andExpect(MockMvcResultMatchers.jsonPath("$.data.length()").value(1))
                .andExpect(MockMvcResultMatchers.jsonPath("$.data[0].title").value("초대받은 일정"))
                .andExpect(MockMvcResultMatchers.jsonPath("$.data[0].participantIds.length()").value(2));
    }

    /** Testcontainers PostgreSQL 기반으로 실행되며 ubuntu-latest에서도 무권한 일정 비노출을 검증한다. */
    @Test
    void find_schedules_does_not_expose_schedule_to_non_owner_or_participant() throws Exception {
        UUID outsider = UUID.randomUUID();
        LocalDateTime base = LocalDateTime.now().withNano(0);
        ScheduleRequest req = new ScheduleRequest(
                UUID.randomUUID(), "비공개 일정", null,
                base.plusDays(1), base.plusDays(1).plusHours(1), null,
                List.of(UUID.fromString(MANAGER_ACCOUNT_ID)));

        mockMvc.perform(MockMvcRequestBuilders.post("/admin/groupware/schedules")
                        .header("X-User-Id", SALES_ACCOUNT_ID)
                        .header("X-User-Role", "SALES")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(req)))
                .andExpect(MockMvcResultMatchers.status().isCreated());

        mockMvc.perform(MockMvcRequestBuilders.get("/admin/groupware/schedules")
                        .param("from", base.format(DateTimeFormatter.ISO_LOCAL_DATE_TIME))
                        .param("to", base.plusDays(2).format(DateTimeFormatter.ISO_LOCAL_DATE_TIME))
                        .header("X-User-Id", outsider.toString())
                        .header("X-User-Role", "SALES"))
                .andExpect(MockMvcResultMatchers.status().isOk())
                .andExpect(MockMvcResultMatchers.jsonPath("$.data.length()").value(0));
    }

    @Test
    void update_schedule_for_other_owner_returns_403_and_does_not_mutate() throws Exception {
        UUID actor = UUID.fromString(SALES_ACCOUNT_ID);
        UUID other = UUID.fromString(MANAGER_ACCOUNT_ID);
        LocalDateTime base = LocalDateTime.now().withNano(0);
        Schedule otherSchedule = scheduleRepository.save(Schedule.create(other, "타인 원본", null,
                base.plusDays(1), base.plusDays(1).plusHours(1), null));
        ScheduleRequest req = new ScheduleRequest(actor, "침해 수정", "변조",
                base.plusDays(2), base.plusDays(2).plusHours(1), null, List.of(actor));

        mockMvc.perform(MockMvcRequestBuilders.put("/admin/groupware/schedules/" + otherSchedule.getId())
                        .header("X-User-Id", SALES_ACCOUNT_ID)
                        .header("X-User-Role", "SALES")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(req)))
                .andExpect(MockMvcResultMatchers.status().isForbidden());

        Schedule persisted = scheduleRepository.findById(otherSchedule.getId()).orElseThrow();
        assertThat(persisted.getOwnerId()).isEqualTo(other);
        assertThat(persisted.getTitle()).isEqualTo("타인 원본");
        assertThat(persisted.getParticipantsView()).isEmpty();
    }

    @Test
    void update_schedule_for_owner_returns_200() throws Exception {
        UUID actor = UUID.fromString(SALES_ACCOUNT_ID);
        UUID participant = UUID.fromString(MANAGER_ACCOUNT_ID);
        LocalDateTime base = LocalDateTime.now().withNano(0);
        Schedule ownSchedule = scheduleRepository.save(Schedule.create(actor, "내 원본", null,
                base.plusDays(1), base.plusDays(1).plusHours(1), null));
        ScheduleRequest req = new ScheduleRequest(UUID.randomUUID(), "내 수정", "정상 변경",
                base.plusDays(2), base.plusDays(2).plusHours(1), null, List.of(actor, participant));

        mockMvc.perform(MockMvcRequestBuilders.put("/admin/groupware/schedules/" + ownSchedule.getId())
                        .header("X-User-Id", SALES_ACCOUNT_ID)
                        .header("X-User-Role", "SALES")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(req)))
                .andExpect(MockMvcResultMatchers.status().isOk())
                .andExpect(MockMvcResultMatchers.jsonPath("$.data.ownerId").value(SALES_ACCOUNT_ID))
                .andExpect(MockMvcResultMatchers.jsonPath("$.data.title").value("내 수정"))
                .andExpect(MockMvcResultMatchers.jsonPath("$.data.participantIds.length()").value(2));
    }
}
