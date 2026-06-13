package com.samhanair.logis.slip.it.dispatch;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
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
import com.samhanair.logis.security.permission.PermissionAction;
import com.samhanair.logis.slip.SlipServiceApplication;
import com.samhanair.logis.slip.client.ArologisDispatchClient;
import com.samhanair.logis.slip.client.AuthAccountLookupClient;
import com.samhanair.logis.slip.client.InventoryClient;
import com.samhanair.logis.slip.client.NotificationChatRoomClient;
import com.samhanair.logis.slip.client.NotificationClient;
import com.samhanair.logis.slip.client.PartnerBlockClient;
import com.samhanair.logis.slip.client.PartnerInternalClient;
import com.samhanair.logis.slip.client.ProductClient;
import com.samhanair.logis.slip.client.UserInternalClient;
import com.samhanair.logis.slip.client.WarehouseInternalClient;
import com.samhanair.logis.slip.dispatch.collab.DispatchCollabComment;
import com.samhanair.logis.slip.dispatch.collab.DispatchCollabCommentRepository;
import com.samhanair.logis.slip.dispatch.collab.DispatchCollabSuggestion;
import com.samhanair.logis.slip.dispatch.collab.DispatchCollabSuggestionRepository;
import com.samhanair.logis.slip.domain.dispatch.DispatchTask;
import com.samhanair.logis.slip.it.AbstractPostgresIT;
import com.samhanair.logis.slip.repository.dispatch.DispatchTaskRepository;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import java.time.LocalDate;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;
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
 * 배차 협업 수정완료 실 Postgres IT.
 *
 * <p>배차는 기존 코멘트 collab 에 memo 단일 필드 수정완료만 더한다. 기존 Phase C 수정요청
 * 상태 머신은 건드리지 않고, 물리 종결(CANCEL_ACCEPTED/CANCELLED)만 409 로 차단한다.
 */
@SpringBootTest(classes = SlipServiceApplication.class)
@AutoConfigureMockMvc
@Transactional
@WithMockUser(username = "dispatch-user", authorities = {"ROLE_DISPATCH"})
class DispatchCollabIT extends AbstractPostgresIT {

    private static final String USER_ID_HEADER = "X-User-Id";
    private static final String USER_NAME_HEADER = "X-User-Name";
    private static final String ACTOR_ID = "30000000-0000-0000-0000-000000000401";
    private static final String DISPATCH_BOARD_PAGE_CODE = "dispatch.board";
    private static final AtomicInteger SEQ = new AtomicInteger(400);

    @Autowired private MockMvc mvc;
    @Autowired private ObjectMapper objectMapper;
    @Autowired private DispatchTaskRepository taskRepository;
    @Autowired private DispatchCollabSuggestionRepository suggestionRepository;
    @Autowired private DispatchCollabCommentRepository commentRepository;
    @Autowired private JdbcTemplate jdbcTemplate;
    @PersistenceContext private EntityManager entityManager;

    @MockBean private ArologisDispatchClient arologisDispatchClient;
    @MockBean private AuthAccountLookupClient authAccountLookupClient;
    @MockBean private InventoryClient inventoryClient;
    @MockBean private NotificationClient notificationClient;
    @MockBean private NotificationChatRoomClient notificationChatRoomClient;
    @MockBean private PartnerBlockClient partnerBlockClient;
    @MockBean private PartnerInternalClient partnerInternalClient;
    @MockBean private ProductClient productClient;
    @MockBean private UserInternalClient userInternalClient;
    @MockBean private WarehouseInternalClient warehouseInternalClient;

    @BeforeEach
    void setUp() {
        suggestionRepository.deleteAll();
        commentRepository.deleteAll();
        taskRepository.deleteAll();
        lenient().when(dynamicPermissionClient.canView(anyString(), anyString())).thenReturn(true);
        lenient().when(dynamicPermissionClient.canEdit(anyString(), anyString())).thenReturn(true);
        lenient().when(dynamicPermissionClient.check(any(UUID.class), anyString(), any(PermissionAction.class)))
                .thenReturn(true);
    }

    /** DISPATCHED 배차 task 의 memo 수정완료가 실 적용되고 ACCEPTED diff 이력이 남는지 검증한다. */
    @Test
    void commitEdit_onDispatchedTask_appliesMemoAndRecordsAcceptedHistory() throws Exception {
        DispatchTask task = seedDispatchedTask("EDIT");
        task.overlayMemo("초기 배차 비고");
        taskRepository.saveAndFlush(task);

        String response = mvc.perform(post("/admin/dispatch-tasks/{taskId}/edits", task.getId())
                        .header(USER_ID_HEADER, ACTOR_ID)
                        .header(USER_NAME_HEADER, "배차수정자")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "changeSet", "{\"memo\":{\"after\":\"상차지 도착 후 연락\"}}",
                                "reason", "기사 안내 보강"))))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.edit.status").value("ACCEPTED"))
                .andExpect(jsonPath("$.data.edit.proposerName").value("배차수정자"))
                .andExpect(jsonPath("$.data.edit.decidedByName").value("배차수정자"))
                .andExpect(jsonPath("$.data.task.memo").value("상차지 도착 후 연락"))
                .andReturn().getResponse().getContentAsString();

        @SuppressWarnings("unchecked")
        Map<String, Object> edit = (Map<String, Object>) dataMap(response).get("edit");
        UUID editId = UUID.fromString((String) edit.get("id"));

        taskRepository.flush();
        DispatchTask reloaded = taskRepository.findById(task.getId()).orElseThrow();
        assertThat(reloaded.getMemo()).isEqualTo("상차지 도착 후 연락");
        DispatchCollabSuggestion saved = suggestionRepository.findById(editId).orElseThrow();
        assertThat(saved.getStatus().name()).isEqualTo("ACCEPTED");
        assertThat(saved.getChangeSet()).contains("\"before\":\"초기 배차 비고\"");
        assertThat(saved.getChangeSet()).contains("\"after\":\"상차지 도착 후 연락\"");

        mvc.perform(get("/admin/dispatch-tasks/{taskId}/edits", task.getId())
                        .header(USER_ID_HEADER, ACTOR_ID))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.length()").value(1))
                .andExpect(jsonPath("$.data[0].id").value(editId.toString()));
    }

    /** 1차 캐시를 비운 fresh session 에서도 부모 @Version 기반 memo overlay 가 동작해야 한다. */
    @Test
    void commitEdit_afterPersistenceContextClear_succeeds() throws Exception {
        DispatchTask task = seedDispatchedTask("FRESH");
        taskRepository.flush();
        entityManager.clear();

        mvc.perform(post("/admin/dispatch-tasks/{taskId}/edits", task.getId())
                        .header(USER_ID_HEADER, ACTOR_ID)
                        .header(USER_NAME_HEADER, "신선세션")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "changeSet", "{\"memo\":{\"after\":\"fresh 세션 비고\"}}"))))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.task.memo").value("fresh 세션 비고"));
    }

    /** CANCELLED task 는 COLLAB_LOCKED 409 로 거부되고 이력이 저장되지 않아야 한다. */
    @Test
    void commitEdit_onCancelledTask_returns409AndPersistsNothing() throws Exception {
        DispatchTask task = seedCancelledTask("LOCK");

        mvc.perform(post("/admin/dispatch-tasks/{taskId}/edits", task.getId())
                        .header(USER_ID_HEADER, ACTOR_ID)
                        .header(USER_NAME_HEADER, "잠금수정자")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "changeSet", "{\"memo\":{\"after\":\"변경 시도\"}}"))))
                .andExpect(status().isConflict());

        assertThat(suggestionRepository.findByDocumentTypeAndDocumentIdOrderByCreatedAtDesc(
                CollabDocumentType.DISPATCH_TASK, task.getId())).isEmpty();
    }

    /** memo 외 핵심 필드는 400 으로 조기 거부한다. */
    @Test
    void commitEdit_withCoreFields_returns400AndPersistsNothing() throws Exception {
        UUID taskId = seedDispatchedTask("CORE").getId();

        for (String changeSet : java.util.List.of(
                "{\"taskCode\":{\"after\":\"2099/OTHER\"}}",
                "{\"status\":{\"after\":\"DRAFT\"}}",
                "{\"dispatchDate\":{\"after\":\"2099-01-01\"}}",
                "{\"driverName\":{\"after\":\"다른기사\"}}",
                "{\"vehiclePlateNumber\":{\"after\":\"12가9999\"}}",
                "{\"line.1.note\":{\"after\":\"라인 없음\"}}")) {
            mvc.perform(post("/admin/dispatch-tasks/{taskId}/edits", taskId)
                            .header(USER_ID_HEADER, ACTOR_ID)
                            .header(USER_NAME_HEADER, "핵심수정자")
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(objectMapper.writeValueAsString(Map.of("changeSet", changeSet))))
                    .andExpect(status().isBadRequest());
        }

        assertThat(suggestionRepository.findByDocumentTypeAndDocumentIdOrderByCreatedAtDesc(
                CollabDocumentType.DISPATCH_TASK, taskId)).isEmpty();
    }

    /** changeSet JSON 형식/구조/과길이는 400 으로 거부하고 이력을 남기지 않는다. */
    @Test
    void commitEdit_withMalformedOrTooLongChangeSet_returns400AndPersistsNothing() throws Exception {
        UUID taskId = seedDispatchedTask("BAD-CS").getId();

        for (String changeSet : java.util.List.of(
                "not-json",
                "[]",
                "{}",
                "{\"memo\":{\"before\":\"x\"}}",
                "{\"memo\":{\"after\":\"" + "가".repeat(1001) + "\"}}")) {
            mvc.perform(post("/admin/dispatch-tasks/{taskId}/edits", taskId)
                            .header(USER_ID_HEADER, ACTOR_ID)
                            .header(USER_NAME_HEADER, "형식검증자")
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(objectMapper.writeValueAsString(Map.of("changeSet", changeSet))))
                    .andExpect(status().isBadRequest());
        }

        assertThat(suggestionRepository.findByDocumentTypeAndDocumentIdOrderByCreatedAtDesc(
                CollabDocumentType.DISPATCH_TASK, taskId)).isEmpty();
    }

    /** 기여자 수신자와 username->UUID resolve 후 현재 수정자를 제외하고 push 를 보낸다. */
    @Test
    void commitEdit_notifiesContributorsAndResolvesUsernameRecipients() throws Exception {
        UUID createdByAccountId = UUID.randomUUID();
        UUID previousEditorId = UUID.randomUUID();
        UUID commentAuthorId = UUID.randomUUID();
        UUID editorId = UUID.fromString(ACTOR_ID);
        DispatchTask task = seedDispatchedTask("NOTI");
        DispatchCollabSuggestion previousEdit = DispatchCollabSuggestion.create(
                CollabDocumentType.DISPATCH_TASK, task.getId(),
                previousEditorId, "이전수정자", "{\"memo\":{\"after\":\"이전\"}}", null);
        previousEdit.accept(previousEditorId, "이전수정자");
        suggestionRepository.save(previousEdit);
        commentRepository.save(DispatchCollabComment.create(
                CollabDocumentType.DISPATCH_TASK, task.getId(),
                "memo", commentAuthorId, "댓글작성자", "확인했습니다", null));
        when(authAccountLookupClient.findAccountIdByLoginId("dispatch-user"))
                .thenReturn(Optional.of(createdByAccountId));

        mvc.perform(post("/admin/dispatch-tasks/{taskId}/edits", task.getId())
                        .header(USER_ID_HEADER, ACTOR_ID)
                        .header(USER_NAME_HEADER, "배차수정자")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "changeSet", "{\"memo\":{\"after\":\"알림 배차 비고\"}}"))))
                .andExpect(status().isCreated());

        verify(notificationClient).sendUserPush(eq(createdByAccountId),
                eq("[배차 수정] " + task.getTaskCode()), anyString());
        verify(notificationClient).sendUserPush(eq(previousEditorId),
                eq("[배차 수정] " + task.getTaskCode()), anyString());
        verify(notificationClient).sendUserPush(eq(commentAuthorId),
                eq("[배차 수정] " + task.getTaskCode()), anyString());
        verify(notificationClient, never()).sendUserPush(
                eq(editorId), anyString(), anyString());
        ArgumentCaptor<UUID> recipientCaptor = ArgumentCaptor.forClass(UUID.class);
        verify(notificationClient, times(3)).sendUserPush(
                recipientCaptor.capture(), eq("[배차 수정] " + task.getTaskCode()), anyString());
        assertThat(recipientCaptor.getAllValues()).containsExactlyInAnyOrder(
                createdByAccountId, previousEditorId, commentAuthorId);
    }

    /** 비-MASTER 계정이 UPDATE 권한을 거부당하면 수정완료는 403 이다. */
    @Test
    void commitEdit_withoutPermission_returns403() throws Exception {
        UUID taskId = seedDispatchedTask("DENY").getId();
        when(dynamicPermissionClient.check(any(UUID.class), eq(DISPATCH_BOARD_PAGE_CODE), eq(PermissionAction.UPDATE)))
                .thenReturn(false);
        when(dynamicPermissionClient.canEdit(anyString(), eq(DISPATCH_BOARD_PAGE_CODE))).thenReturn(false);

        mvc.perform(post("/admin/dispatch-tasks/{taskId}/edits", taskId)
                        .header(USER_ID_HEADER, ACTOR_ID)
                        .header(USER_NAME_HEADER, "권한없는사원")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "changeSet", "{\"memo\":{\"after\":\"무단 수정\"}}"))))
                .andExpect(status().isForbidden());
    }

    /** VIEW 권한 없는 계정은 수정 이력 조회도 403 으로 거부된다. */
    @Test
    void readEndpoints_withoutPermission_return403() throws Exception {
        UUID taskId = seedDispatchedTask("VIEW-DENY").getId();
        when(dynamicPermissionClient.check(any(UUID.class), eq(DISPATCH_BOARD_PAGE_CODE), eq(PermissionAction.VIEW)))
                .thenReturn(false);
        when(dynamicPermissionClient.canView(anyString(), eq(DISPATCH_BOARD_PAGE_CODE))).thenReturn(false);

        mvc.perform(get("/admin/dispatch-tasks/{taskId}/edits", taskId)
                        .header(USER_ID_HEADER, ACTOR_ID))
                .andExpect(status().isForbidden());
    }

    /** dispatch_collab_suggestions document_type CHECK 는 잘못된 enum 을 거부한다. */
    @Test
    void checkConstraintRejectsInvalidDocumentTypeInSuggestions() {
        UUID taskId = seedDispatchedTask("CHK-DOC").getId();
        UUID proposerId = UUID.fromString(ACTOR_ID);

        assertThatThrownBy(() -> jdbcTemplate.update(
                "INSERT INTO dispatch_collab_suggestions " +
                        "(id, document_type, document_id, proposer_id, proposer_name, change_set, status, " +
                        "version, created_at, created_by, is_deleted) VALUES " +
                        "(?, 'INVALID_TYPE', ?, ?, '테스터', '{\"memo\":{\"after\":\"v\"}}', 'ACCEPTED', " +
                        "0, NOW(), 'system', false)",
                UUID.randomUUID(), taskId, proposerId))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    /** dispatch_collab_suggestions status CHECK 는 잘못된 상태를 거부한다. */
    @Test
    void checkConstraintRejectsInvalidStatusInSuggestions() {
        UUID taskId = seedDispatchedTask("CHK-STATUS").getId();
        UUID proposerId = UUID.fromString(ACTOR_ID);

        assertThatThrownBy(() -> jdbcTemplate.update(
                "INSERT INTO dispatch_collab_suggestions " +
                        "(id, document_type, document_id, proposer_id, proposer_name, change_set, status, " +
                        "version, created_at, created_by, is_deleted) VALUES " +
                        "(?, 'DISPATCH_TASK', ?, ?, '테스터', '{\"memo\":{\"after\":\"v\"}}', 'BAD', " +
                        "0, NOW(), 'system', false)",
                UUID.randomUUID(), taskId, proposerId))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    private DispatchTask seedDispatchedTask(String suffix) {
        int seq = SEQ.getAndIncrement();
        // task_code 는 VARCHAR(32) — 실제 형식(yyyy/MM/dd-N)에 맞춰 짧게(seq 로 유일성 보장, suffix 는 arologisId 구분용).
        DispatchTask task = DispatchTask.create(
                "2099/06/13-" + seq,
                LocalDate.of(2099, 6, 13));
        task.markDispatching();
        task.markDispatched(UUID.nameUUIDFromBytes(("arologis-" + suffix + "-" + seq).getBytes()));
        return taskRepository.saveAndFlush(task);
    }

    private DispatchTask seedCancelledTask(String suffix) {
        DispatchTask task = seedDispatchedTask(suffix);
        task.markCancelRequested("취소 요청");
        task.markCancelAccepted();
        task.markCancelled();
        return taskRepository.saveAndFlush(task);
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> dataMap(String responseBody) throws Exception {
        return (Map<String, Object>) objectMapper.readValue(responseBody, Map.class).get("data");
    }
}
