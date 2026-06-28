package com.samhanair.logis.groupware.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.clearInvocations;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.approval.ApprovalStatus;
import com.samhanair.logis.groupware.GroupwareServiceApplication;
import com.samhanair.logis.groupware.client.GroupwareApprovalLineConfigClient;
import com.samhanair.logis.groupware.client.UserClient;
import com.samhanair.logis.groupware.domain.ApprovalLine;
import com.samhanair.logis.groupware.dto.ApprovalDecisionRequest;
import com.samhanair.logis.groupware.dto.ApprovalLineCreateRequest;
import com.samhanair.logis.groupware.dto.MessageSendRequest;
import com.samhanair.logis.groupware.dto.ScheduleRequest;
import com.samhanair.logis.groupware.repository.ApprovalLineRepository;
import com.samhanair.logis.groupware.repository.MessageRepository;
import com.samhanair.logis.groupware.repository.ScheduleRepository;
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
}
