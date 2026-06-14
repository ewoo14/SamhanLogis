package com.samhanair.logis.groupware.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.collab.CollabDocumentType;
import com.samhanair.logis.groupware.GroupwareServiceApplication;
import com.samhanair.logis.groupware.client.UserClient;
import com.samhanair.logis.groupware.collab.ApprovalCollabComment;
import com.samhanair.logis.groupware.collab.ApprovalCollabCommentRepository;
import com.samhanair.logis.groupware.collab.ApprovalCollabSuggestion;
import com.samhanair.logis.groupware.collab.ApprovalCollabSuggestionRepository;
import com.samhanair.logis.groupware.domain.ApprovalLine;
import com.samhanair.logis.groupware.dto.ApprovalLineCreateRequest;
import com.samhanair.logis.groupware.repository.ApprovalLineRepository;
import com.samhanair.logis.groupware.repository.ApprovalNumberSequenceRepository;
import com.samhanair.logis.groupware.service.ApprovalLineService;
import com.samhanair.logis.notification.publisher.NotificationPublishRequest;
import com.samhanair.logis.notification.publisher.NotificationPublisher;
import com.samhanair.logis.security.permission.DynamicPermissionClient;
import com.samhanair.logis.security.permission.PermissionAction;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
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
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

/**
 * 그룹웨어 결재 협업 수정완료 실 Postgres IT.
 *
 * <p>결재 문서는 title/content 만 1-인 수정완료로 즉시 커밋한다. 최종 결재 완료/반려/회수는
 * 물리 종결 상태로 보고 409 로 차단한다.
 */
@SpringBootTest(classes = GroupwareServiceApplication.class)
@AutoConfigureMockMvc
@Transactional
@WithMockUser(username = "groupware-user", authorities = {"ROLE_MANAGER"})
class ApprovalCollabIT extends AbstractPostgresIT {

    private static final String USER_ID_HEADER = "X-User-Id";
    private static final String USER_NAME_HEADER = "X-User-Name";
    private static final String ACTOR_ID = "40000000-0000-0000-0000-000000000501";
    private static final String PAGE_CODE = "groupware.approvals";

    @Autowired private MockMvc mvc;
    @Autowired private ObjectMapper objectMapper;
    @Autowired private ApprovalLineService approvalLineService;
    @Autowired private ApprovalLineRepository approvalLineRepository;
    @Autowired private ApprovalNumberSequenceRepository numberSequenceRepository;
    @Autowired private ApprovalCollabSuggestionRepository suggestionRepository;
    @Autowired private ApprovalCollabCommentRepository commentRepository;
    @Autowired private NotificationPublisher notificationPublisher;
    @Autowired private JdbcTemplate jdbcTemplate;
    @PersistenceContext private EntityManager entityManager;

    @MockBean private UserClient userClient;
    @MockBean private DynamicPermissionClient dynamicPermissionClient;

    @BeforeEach
    void setUp() {
        suggestionRepository.deleteAll();
        commentRepository.deleteAll();
        approvalLineRepository.deleteAll();
        numberSequenceRepository.deleteAll();
        lenient().when(dynamicPermissionClient.canView(anyString(), anyString())).thenReturn(true);
        lenient().when(dynamicPermissionClient.canEdit(anyString(), anyString())).thenReturn(true);
        lenient().when(dynamicPermissionClient.check(any(UUID.class), anyString(), any(PermissionAction.class)))
                .thenReturn(true);
        lenient().when(userClient.exists(any())).thenReturn(true);
        lenient().when(userClient.verifyBulk(any())).thenAnswer(inv -> {
            List<UUID> ids = inv.getArgument(0);
            java.util.Map<UUID, Boolean> result = new java.util.HashMap<>();
            ids.forEach(id -> result.put(id, true));
            return result;
        });
        lenient().when(userClient.resolveDisplayNames(anyList())).thenReturn(java.util.Map.of());
    }

    /** PENDING 결재의 title/content 수정완료가 실 적용되고 ACCEPTED diff 이력이 남는지 검증한다. */
    @Test
    void commitEdit_appliesTitleContentAndRecordsAcceptedHistory() throws Exception {
        ApprovalLine approval = seedApproval("초기 결재 제목", "초기 결재 본문", 2);

        String response = mvc.perform(post("/admin/groupware/approvals/{approvalId}/collab/edits", approval.getId())
                        .header(USER_ID_HEADER, ACTOR_ID)
                        .header(USER_NAME_HEADER, "결재수정자")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "changeSet", "{\"title\":{\"after\":\"수정 결재 제목\"},"
                                        + "\"content\":{\"after\":\"수정 결재 본문\"}}",
                                "reason", "결재 본문 보강"))))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.edit.status").value("ACCEPTED"))
                .andExpect(jsonPath("$.data.edit.proposerName").value("결재수정자"))
                .andExpect(jsonPath("$.data.edit.decidedByName").value("결재수정자"))
                .andExpect(jsonPath("$.data.approval.title").value("수정 결재 제목"))
                .andExpect(jsonPath("$.data.approval.content").value("수정 결재 본문"))
                .andExpect(jsonPath("$.data.approval.approvalNo").value(approval.getApprovalNo()))
                .andReturn().getResponse().getContentAsString();

        @SuppressWarnings("unchecked")
        Map<String, Object> edit = (Map<String, Object>) dataMap(response).get("edit");
        UUID editId = UUID.fromString((String) edit.get("id"));

        approvalLineRepository.flush();
        ApprovalLine reloaded = approvalLineRepository.findById(approval.getId()).orElseThrow();
        assertThat(reloaded.getTitle()).isEqualTo("수정 결재 제목");
        assertThat(reloaded.getContent()).isEqualTo("수정 결재 본문");
        assertThat(reloaded.getApprovalNo()).matches("\\d{4}/\\d{2}/\\d{2}-\\d+");

        ApprovalCollabSuggestion saved = suggestionRepository.findById(editId).orElseThrow();
        assertThat(saved.getStatus().name()).isEqualTo("ACCEPTED");
        assertThat(saved.getChangeSet()).contains("\"before\":\"초기 결재 제목\"");
        assertThat(saved.getChangeSet()).contains("\"after\":\"수정 결재 본문\"");
    }

    /** 1차 영속성 캐시를 비운 fresh session 에서도 부모 @Version 기반 overlay 가 동작해야 한다. */
    @Test
    void commitEdit_afterPersistenceContextClear_succeeds() throws Exception {
        ApprovalLine approval = seedApproval("fresh 제목", "fresh 본문", 1);
        approvalLineRepository.flush();
        entityManager.clear();

        mvc.perform(post("/admin/groupware/approvals/{approvalId}/collab/edits", approval.getId())
                        .header(USER_ID_HEADER, ACTOR_ID)
                        .header(USER_NAME_HEADER, "신선세션")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "changeSet", "{\"content\":{\"after\":\"fresh 세션 본문\"}}"))))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.approval.content").value("fresh 세션 본문"));
    }

    /** APPROVED 결재는 COLLAB_LOCKED 409 로 거부되고 이력이 저장되지 않아야 한다. */
    @Test
    void commitEdit_onApprovedApproval_returns409AndPersistsNothing() throws Exception {
        ApprovalLine approval = seedApprovedApproval();

        mvc.perform(post("/admin/groupware/approvals/{approvalId}/collab/edits", approval.getId())
                        .header(USER_ID_HEADER, ACTOR_ID)
                        .header(USER_NAME_HEADER, "잠금수정자")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "changeSet", "{\"title\":{\"after\":\"잠금 변경\"}}"))))
                .andExpect(status().isConflict());

        assertThat(suggestionRepository.findByDocumentTypeAndDocumentIdOrderByCreatedAtDesc(
                CollabDocumentType.APPROVAL_LINE, approval.getId())).isEmpty();
    }

    /** REJECTED/WITHDRAWN(물리 종결) 결재도 APPROVED 와 동일하게 COLLAB_LOCKED 409 로 거부된다. */
    @Test
    void commitEdit_onRejectedOrWithdrawnApproval_returns409AndPersistsNothing() throws Exception {
        for (ApprovalLine approval : List.of(seedRejectedApproval(), seedWithdrawnApproval())) {
            mvc.perform(post("/admin/groupware/approvals/{approvalId}/collab/edits", approval.getId())
                            .header(USER_ID_HEADER, ACTOR_ID)
                            .header(USER_NAME_HEADER, "잠금수정자")
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(objectMapper.writeValueAsString(Map.of(
                                    "changeSet", "{\"title\":{\"after\":\"종결 변경\"}}"))))
                    .andExpect(status().isConflict());

            assertThat(suggestionRepository.findByDocumentTypeAndDocumentIdOrderByCreatedAtDesc(
                    CollabDocumentType.APPROVAL_LINE, approval.getId())).isEmpty();
        }
        verify(notificationPublisher, never()).publish(any());
    }

    /** 결재번호/status/requester/steps 같은 핵심 필드는 400 으로 조기 거부한다. */
    @Test
    void commitEdit_withCoreFields_returns400AndPersistsNothing() throws Exception {
        UUID approvalId = seedApproval("핵심 제목", "핵심 본문", 2).getId();

        for (String changeSet : List.of(
                "{\"approvalNo\":{\"after\":\"2099/01/01-99\"}}",
                "{\"status\":{\"after\":\"APPROVED\"}}",
                "{\"requesterId\":{\"after\":\"00000000-0000-0000-0000-000000000001\"}}",
                "{\"steps\":{\"after\":\"[]\"}}",
                "{\"decidedAt\":{\"after\":\"2099-01-01T00:00:00\"}}",
                "{\"reason\":{\"after\":\"반려 사유\"}}")) {
            mvc.perform(post("/admin/groupware/approvals/{approvalId}/collab/edits", approvalId)
                            .header(USER_ID_HEADER, ACTOR_ID)
                            .header(USER_NAME_HEADER, "핵심수정자")
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(objectMapper.writeValueAsString(Map.of("changeSet", changeSet))))
                    .andExpect(status().isBadRequest());
        }

        assertThat(suggestionRepository.findByDocumentTypeAndDocumentIdOrderByCreatedAtDesc(
                CollabDocumentType.APPROVAL_LINE, approvalId)).isEmpty();
    }

    /** changeSet JSON 형식/구조/과길이는 400 으로 거부하고 이력을 남기지 않는다. */
    @Test
    void commitEdit_withMalformedOrTooLongChangeSet_returns400AndPersistsNothing() throws Exception {
        UUID approvalId = seedApproval("검증 제목", "검증 본문", 1).getId();

        for (String changeSet : List.of(
                "not-json",
                "[]",
                "{}",
                "{\"title\":{\"before\":\"x\"}}",
                "{\"title\":{\"after\":\"" + "가".repeat(201) + "\"}}",
                "{\"content\":{\"after\":\"" + "나".repeat(2001) + "\"}}")) {
            mvc.perform(post("/admin/groupware/approvals/{approvalId}/collab/edits", approvalId)
                            .header(USER_ID_HEADER, ACTOR_ID)
                            .header(USER_NAME_HEADER, "형식검증자")
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(objectMapper.writeValueAsString(Map.of("changeSet", changeSet))))
                    .andExpect(status().isBadRequest());
        }

        assertThat(suggestionRepository.findByDocumentTypeAndDocumentIdOrderByCreatedAtDesc(
                CollabDocumentType.APPROVAL_LINE, approvalId)).isEmpty();
    }

    /** 기여자 수신자(requester + steps approver + comment author)에서 현재 수정자를 제외하고 알림을 보낸다. */
    @Test
    void commitEdit_notifiesRequesterApproversAndCommentAuthorsExceptEditor() throws Exception {
        UUID requesterId = UUID.randomUUID();
        UUID approver1 = UUID.randomUUID();
        UUID approver2 = UUID.randomUUID();
        UUID commentAuthorId = UUID.randomUUID();
        UUID editorId = UUID.fromString(ACTOR_ID);
        ApprovalLine approval = approvalLineService.create(new ApprovalLineCreateRequest(
                requesterId, "알림 결재", "알림 본문", List.of(approver1, approver2, editorId)));
        commentRepository.save(ApprovalCollabComment.create(
                CollabDocumentType.APPROVAL_LINE, approval.getId(),
                "content", commentAuthorId, "댓글작성자", "확인했습니다", null));

        mvc.perform(post("/admin/groupware/approvals/{approvalId}/collab/edits", approval.getId())
                        .header(USER_ID_HEADER, ACTOR_ID)
                        .header(USER_NAME_HEADER, "결재수정자")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "changeSet", "{\"content\":{\"after\":\"알림 결재 본문\"}}"))))
                .andExpect(status().isCreated());

        ArgumentCaptor<NotificationPublishRequest> captor =
                ArgumentCaptor.forClass(NotificationPublishRequest.class);
        verify(notificationPublisher, times(4)).publish(captor.capture());
        assertThat(captor.getAllValues())
                .extracting(NotificationPublishRequest::targetUserId)
                .containsExactlyInAnyOrder(requesterId, approver1, approver2, commentAuthorId);
        assertThat(captor.getAllValues())
                .noneMatch(req -> editorId.equals(req.targetUserId()))
                .allMatch(req -> req.title().contains(approval.getApprovalNo()))
                .allMatch(req -> !req.body().contains(approval.getId().toString()));
    }

    /** 비-MASTER 계정이 UPDATE 권한을 거부당하면 수정완료는 403 이고 DB 변경이 없다. */
    @Test
    void commitEdit_withoutPermission_returns403AndPersistsNothing() throws Exception {
        ApprovalLine approval = seedApproval("권한 제목", "권한 본문", 1);
        when(dynamicPermissionClient.check(any(UUID.class), eq(PAGE_CODE), eq(PermissionAction.UPDATE)))
                .thenReturn(false);
        when(dynamicPermissionClient.canEdit(anyString(), eq(PAGE_CODE))).thenReturn(false);

        mvc.perform(post("/admin/groupware/approvals/{approvalId}/collab/edits", approval.getId())
                        .header(USER_ID_HEADER, ACTOR_ID)
                        .header(USER_NAME_HEADER, "권한없는사원")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "changeSet", "{\"title\":{\"after\":\"무단 수정\"}}"))))
                .andExpect(status().isForbidden());

        assertThat(suggestionRepository.count()).isZero();
        ApprovalLine reloaded = approvalLineRepository.findById(approval.getId()).orElseThrow();
        assertThat(reloaded.getTitle()).isEqualTo("권한 제목");
        // 403 거부 시 알림도 발송되지 않아야 한다(트랜잭션 내 동기 best-effort 가 권한 가드 이후이므로).
        verify(notificationPublisher, never()).publish(any());
    }

    /** VIEW 권한 없는 계정은 댓글/이력/stream 조회도 403 으로 거부된다. */
    @Test
    void readEndpoints_withoutPermission_return403() throws Exception {
        UUID approvalId = seedApproval("조회권한 제목", "조회권한 본문", 1).getId();
        when(dynamicPermissionClient.check(any(UUID.class), eq(PAGE_CODE), eq(PermissionAction.VIEW)))
                .thenReturn(false);
        when(dynamicPermissionClient.canView(anyString(), eq(PAGE_CODE))).thenReturn(false);

        mvc.perform(get("/admin/groupware/approvals/{approvalId}/collab/comments", approvalId)
                        .header(USER_ID_HEADER, ACTOR_ID))
                .andExpect(status().isForbidden());
        mvc.perform(get("/admin/groupware/approvals/{approvalId}/collab/edits", approvalId)
                        .header(USER_ID_HEADER, ACTOR_ID))
                .andExpect(status().isForbidden());
        mvc.perform(get("/admin/groupware/approvals/{approvalId}/collab/stream", approvalId)
                        .header(USER_ID_HEADER, ACTOR_ID)
                        .accept(MediaType.TEXT_EVENT_STREAM))
                .andExpect(status().isForbidden());
    }

    /** approval_collab_comments document_type CHECK 는 잘못된 enum 을 거부한다. */
    @Test
    void checkConstraintRejectsInvalidDocumentTypeInComments() {
        UUID approvalId = seedApproval("체크 제목", "체크 본문", 1).getId();
        UUID authorId = UUID.fromString(ACTOR_ID);

        assertThatThrownBy(() -> jdbcTemplate.update(
                "INSERT INTO approval_collab_comments " +
                        "(id, document_type, document_id, anchor, author_id, author_name, body, status, " +
                        "created_at, created_by, is_deleted) VALUES " +
                        "(?, 'INVALID_TYPE', ?, NULL, ?, 'tester', '본문', 'OPEN', NOW(), 'system', false)",
                UUID.randomUUID(), approvalId, authorId))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    /** approval_collab_suggestions status CHECK 는 잘못된 상태를 거부한다. */
    @Test
    void checkConstraintRejectsInvalidStatusInSuggestions() {
        UUID approvalId = seedApproval("상태체크 제목", "상태체크 본문", 1).getId();
        UUID proposerId = UUID.fromString(ACTOR_ID);

        assertThatThrownBy(() -> jdbcTemplate.update(
                "INSERT INTO approval_collab_suggestions " +
                        "(id, document_type, document_id, proposer_id, proposer_name, change_set, status, " +
                        "version, created_at, created_by, is_deleted) VALUES " +
                        "(?, 'APPROVAL_LINE', ?, ?, '테스터', '{\"title\":{\"after\":\"v\"}}', 'BAD', " +
                        "0, NOW(), 'system', false)",
                UUID.randomUUID(), approvalId, proposerId))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    private ApprovalLine seedApproval(String title, String content, int approverCount) {
        List<UUID> approvers = java.util.stream.IntStream.range(0, approverCount)
                .mapToObj(i -> UUID.randomUUID())
                .toList();
        ApprovalLine saved = approvalLineService.create(new ApprovalLineCreateRequest(
                UUID.randomUUID(), title, content, approvers));
        return approvalLineRepository.saveAndFlush(saved);
    }

    private ApprovalLine seedApprovedApproval() {
        UUID approver = UUID.randomUUID();
        ApprovalLine approval = approvalLineService.create(new ApprovalLineCreateRequest(
                UUID.randomUUID(), "승인완료 결재", "승인완료 본문", List.of(approver)));
        approval.approve(approver);
        return approvalLineRepository.saveAndFlush(approval);
    }

    private ApprovalLine seedRejectedApproval() {
        UUID approver = UUID.randomUUID();
        ApprovalLine approval = approvalLineService.create(new ApprovalLineCreateRequest(
                UUID.randomUUID(), "반려 결재", "반려 본문", List.of(approver)));
        approval.reject(approver, "반려 사유");
        return approvalLineRepository.saveAndFlush(approval);
    }

    private ApprovalLine seedWithdrawnApproval() {
        UUID requester = UUID.randomUUID();
        UUID approver = UUID.randomUUID();
        ApprovalLine approval = approvalLineService.create(new ApprovalLineCreateRequest(
                requester, "회수 결재", "회수 본문", List.of(approver)));
        approval.withdraw(requester);
        return approvalLineRepository.saveAndFlush(approval);
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> dataMap(String responseBody) throws Exception {
        return (Map<String, Object>) objectMapper.readValue(responseBody, Map.class).get("data");
    }
}
