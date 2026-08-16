package com.samhanair.logis.accounting.it.collab;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.accounting.AccountingServiceApplication;
import com.samhanair.logis.accounting.client.AuthAccountLookupClient;
import com.samhanair.logis.accounting.client.NotificationClient;
import com.samhanair.logis.accounting.collab.JournalCollabComment;
import com.samhanair.logis.accounting.collab.JournalCollabCommentRepository;
import com.samhanair.logis.accounting.collab.JournalCollabSuggestion;
import com.samhanair.logis.accounting.collab.JournalCollabSuggestionRepository;
import com.samhanair.logis.accounting.domain.Journal;
import com.samhanair.logis.accounting.domain.JournalLine;
import com.samhanair.logis.accounting.domain.JournalSourceType;
import com.samhanair.logis.accounting.it.AbstractPostgresIT;
import com.samhanair.logis.accounting.repository.JournalRepository;
import com.samhanair.logis.collab.CollabDocumentType;
import com.samhanair.logis.security.permission.PermissionAction;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.nio.ByteBuffer;
import java.util.Base64;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;
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
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.transaction.annotation.Transactional;

/**
 * 회계전표 협업 실 Postgres IT.
 *
 * <p>journal_collab_comments / journal_collab_suggestions 테이블의 INSERT/SELECT/soft-delete 경로와
 * 수정완료 시 적요/라인메모 실 적용, REVERSED 잠금, 원장 필드 400 거부, 알림 수신자 resolve 를
 * MockMvc + Testcontainers PostgreSQL 로 검증한다.
 */
@SpringBootTest(classes = AccountingServiceApplication.class)
@AutoConfigureMockMvc
@Transactional
@WithMockUser(username = "accounting-user", authorities = {"ROLE_ACCOUNTANT"})
class JournalCollabIT extends AbstractPostgresIT {

    private static final String USER_ID_HEADER = "X-User-Id";
    private static final String USER_NAME_HEADER = "X-User-Name";
    private static final String ACTOR_ID = "20000000-0000-0000-0000-000000000001";
    private static final LocalDate TEST_DATE = LocalDate.of(2099, 6, 13);
    private static final AtomicInteger SEQ = new AtomicInteger(100);

    @Autowired private MockMvc mvc;
    @Autowired private ObjectMapper objectMapper;
    @Autowired private JournalRepository journalRepository;
    @Autowired private JournalCollabSuggestionRepository suggestionRepository;
    @Autowired private JournalCollabCommentRepository commentRepository;
    @Autowired private JdbcTemplate jdbcTemplate;

    @MockBean private AuthAccountLookupClient authAccountLookupClient;
    @MockBean private NotificationClient notificationClient;
    // AbstractPostgresIT 는 dynamicPermissionClient 를 @Autowired 실 빈으로 두고 @BeforeEach 에서
    // 스텁한다 — 동일 패턴의 형제 IT(AccountingDynamicPermissionIT 등)처럼 서브클래스가 @MockBean 으로
    // 치환해야 base @BeforeEach 의 when() 스텁이 성립한다(누락 시 실 빈 호출 → InvalidUseOfMatchers).
    @MockBean(classes = com.samhanair.logis.security.permission.DynamicPermissionClient.class)
    private com.samhanair.logis.security.permission.DynamicPermissionClient dynamicPermissionClient;

    @Test
    void malformedOpaqueJournalCollabIdentifier_returns400ApiResponse() throws Exception {
        mvc.perform(get("/accounting/journals/{journalId}/collab/comments", "not-a-valid-opaque-id")
                        .header(USER_ID_HEADER, ACTOR_ID)
                        .param("limit", "20"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.success").value(false))
                .andExpect(jsonPath("$.code").value("INVALID_INPUT"))
                .andExpect(jsonPath("$.message").value("유효하지 않은 분개 식별자입니다."))
                .andExpect(jsonPath("$.message").value(org.hamcrest.Matchers.not(
                        org.hamcrest.Matchers.containsString("not-a-valid-opaque-id"))));
    }

    @Test
    void malformedOpaqueJournalCollabIdentifiers_allReturn400() throws Exception {
        String bad = "not-a-valid-opaque-id";
        String actor = ACTOR_ID;
        assertMalformedCollab("POST /comments", post("/accounting/journals/" + bad + "/collab/comments")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"body\":\"probe\",\"anchor\":\"description\"}"));
        assertMalformedCollab("DELETE /comments/{commentId}", delete("/accounting/journals/" + bad
                + "/collab/comments/00000000-0000-0000-0000-000000000001"));
        assertMalformedCollab("POST /comments/{commentId}/resolve", post("/accounting/journals/" + bad
                + "/collab/comments/00000000-0000-0000-0000-000000000001/resolve"));
        assertMalformedCollab("POST /edits", post("/accounting/journals/" + bad + "/collab/edits")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"changeSet\":\"{\\\"description\\\":{\\\"after\\\":\\\"probe\\\"}}\"}"));
        assertMalformedCollab("GET /edits", get("/accounting/journals/" + bad + "/collab/edits"));
        assertMalformedCollab("GET /coedit", get("/accounting/journals/" + bad + "/collab/coedit"));
        assertMalformedCollab("POST /coedit/update", post("/accounting/journals/" + bad + "/collab/coedit/update")
                .contentType(MediaType.APPLICATION_JSON).content("{\"update\":\"probe\"}"));
        assertMalformedCollab("POST /coedit/awareness", post("/accounting/journals/" + bad + "/collab/coedit/awareness")
                .contentType(MediaType.APPLICATION_JSON).content("{\"awareness\":\"probe\"}"));
        assertMalformedCollab("GET /stream", get("/accounting/journals/" + bad + "/collab/stream"));
        assertMalformedCollab("POST /presence/join", post("/accounting/journals/" + bad + "/collab/presence/join")
                .header(USER_ID_HEADER, actor).contentType(MediaType.APPLICATION_JSON)
                .content("{\"sessionId\":\"probe\",\"displayName\":\"probe\"}"));
        assertMalformedCollab("POST /presence/leave", post("/accounting/journals/" + bad + "/collab/presence/leave")
                .header(USER_ID_HEADER, actor).contentType(MediaType.APPLICATION_JSON)
                .content("{\"sessionId\":\"probe\"}"));
        assertMalformedCollab("GET /presence", get("/accounting/journals/" + bad + "/collab/presence"));
    }

    private void assertMalformedCollab(String route,
            org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder request) throws Exception {
            MvcResult result = mvc.perform(request
                    .header(USER_ID_HEADER, ACTOR_ID)
                    .header(USER_NAME_HEADER, "회계담당자")
                    .header("X-User-Role", "MASTER")
                    .header("X-Is-System-Master", "true"))
                .andReturn();
        String body = result.getResponse().getContentAsString();
        System.out.println("[ACCOUNTING-RAW] " + route + " status=" + result.getResponse().getStatus()
                + " body=" + body);
        assertThat(result.getResponse().getStatus()).isEqualTo(400);
        assertThat(body).contains("\"code\":\"INVALID_INPUT\"")
                .doesNotContain("not-a-valid-opaque-id");
    }

    /** 댓글 등록, 조회, 해결, 삭제가 실 DB 에 반영되는지 검증한다. */
    @Test
    void comment_roundtrip_add_list_resolve_softDelete() throws Exception {
        UUID journalId = seedPostedJournal("20990613-CMRT-" + SEQ.getAndIncrement()).getId();

        String createResp = mvc.perform(post("/accounting/journals/{journalId}/collab/comments", journalId)
                        .header(USER_ID_HEADER, ACTOR_ID)
                        .header(USER_NAME_HEADER, "회계담당자")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "body", "적요 확인 댓글",
                                "anchor", "description"))))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.data.body").value("적요 확인 댓글"))
                .andExpect(jsonPath("$.data.authorName").value("회계담당자"))
                .andExpect(jsonPath("$.data.anchor").value("description"))
                .andExpect(jsonPath("$.data.status").value("OPEN"))
                .andReturn().getResponse().getContentAsString();
        UUID commentId = UUID.fromString((String) dataMap(createResp).get("id"));

        mvc.perform(get("/accounting/journals/{journalId}/collab/comments", journalId)
                        .header(USER_ID_HEADER, ACTOR_ID)
                        .param("limit", "20"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.length()").value(1));

        mvc.perform(post("/accounting/journals/{journalId}/collab/comments/{commentId}/resolve",
                        journalId, commentId)
                        .header(USER_ID_HEADER, ACTOR_ID))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("RESOLVED"));

        mvc.perform(delete("/accounting/journals/{journalId}/collab/comments/{commentId}",
                        journalId, commentId)
                        .header(USER_ID_HEADER, ACTOR_ID))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true));

        mvc.perform(get("/accounting/journals/{journalId}/collab/comments", journalId)
                        .header(USER_ID_HEADER, ACTOR_ID)
                        .param("limit", "20"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.length()").value(0));
    }

    /**
     * 분개 상세 진입 시 자동 호출되는 협업 조회 경로 전체가 목록 응답의 opaque token을 받는지 검증한다.
     * comments/presence/edits 조회와 동일 채널 SSE 구독을 한 번에 훑어 누락을 방지한다.
     */
    @Test
    void detailCollaborationRequests_acceptOpaqueJournalTokenAcrossAllEndpoints() throws Exception {
        UUID journalId = seedPostedJournal("20990613-OPAQ-COLLAB-" + SEQ.getAndIncrement()).getId();
        String opaqueToken = opaqueToken(journalId);

        mvc.perform(get("/accounting/journals/{journalId}/collab/comments", opaqueToken)
                        .header(USER_ID_HEADER, ACTOR_ID)
                        .param("limit", "20"))
                .andExpect(status().isOk());

        mvc.perform(get("/accounting/journals/{journalId}/collab/presence", opaqueToken)
                        .header(USER_ID_HEADER, ACTOR_ID))
                .andExpect(status().isOk());

        mvc.perform(get("/accounting/journals/{journalId}/collab/edits", opaqueToken)
                        .header(USER_ID_HEADER, ACTOR_ID))
                .andExpect(status().isOk());

        mvc.perform(get("/accounting/journals/{journalId}/collab/stream", opaqueToken)
                        .header(USER_ID_HEADER, ACTOR_ID))
                .andExpect(status().isOk());
    }

    /** POSTED 회계전표의 적요/라인메모 수정완료가 실 적용되고 ACCEPTED 이력이 남는지 검증한다. */
    @Test
    void commitEdit_onPostedJournal_appliesDescriptionAndLineMemoAndRecordsAcceptedHistory()
            throws Exception {
        Journal journal = seedPostedJournal("20990613-EDIT-" + SEQ.getAndIncrement());

        String response = mvc.perform(post("/accounting/journals/{journalId}/collab/edits", journal.getId())
                        .header(USER_ID_HEADER, ACTOR_ID)
                        .header(USER_NAME_HEADER, "수정자박과장")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "changeSet",
                                "{\"description\":{\"after\":\"새 적요\"},\"line.1.memo\":{\"after\":\"새 차변 메모\"}}",
                                "reason", "적요 정정"))))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.edit.status").value("ACCEPTED"))
                .andExpect(jsonPath("$.data.edit.proposerName").value("수정자박과장"))
                .andExpect(jsonPath("$.data.edit.decidedByName").value("수정자박과장"))
                .andExpect(jsonPath("$.data.journal.description").value("새 적요"))
                .andExpect(jsonPath("$.data.journal.lines[0].memo").value("새 차변 메모"))
                .andReturn().getResponse().getContentAsString();

        @SuppressWarnings("unchecked")
        Map<String, Object> edit = (Map<String, Object>) dataMap(response).get("edit");
        UUID editId = UUID.fromString((String) edit.get("id"));

        journalRepository.flush();
        Journal reloaded = journalRepository.findById(journal.getId()).orElseThrow();
        assertThat(reloaded.getDescription()).isEqualTo("새 적요");
        assertThat(reloaded.requireLineByLineNo(1).getMemo()).isEqualTo("새 차변 메모");
        assertThat(reloaded.requireLineByLineNo(1).getDebitAmount()).isEqualByComparingTo("1000");
        assertThat(reloaded.requireLineByLineNo(1).getAccountCode()).isEqualTo("101000");
        // 다중 라인 불변: 변경 대상이 아닌 2번 라인 메모/금액/계정은 그대로 유지된다.
        assertThat(reloaded.requireLineByLineNo(2).getMemo()).isEqualTo("대변 메모");
        assertThat(reloaded.requireLineByLineNo(2).getCreditAmount()).isEqualByComparingTo("1000");
        assertThat(reloaded.requireLineByLineNo(2).getAccountCode()).isEqualTo("201000");

        JournalCollabSuggestion saved = suggestionRepository.findById(editId).orElseThrow();
        assertThat(saved.getStatus().name()).isEqualTo("ACCEPTED");
        assertThat(saved.getChangeSet()).contains("\"before\":\"초기 적요\"");
    }

    /** REVERSED 회계전표는 협업 수정완료가 409 로 거부되고 이력이 저장되지 않아야 한다. */
    @Test
    void commitEdit_onReversedJournal_returns409AndPersistsNothing() throws Exception {
        Journal journal = seedReversedJournal("20990613-REV-" + SEQ.getAndIncrement());

        mvc.perform(post("/accounting/journals/{journalId}/collab/edits", journal.getId())
                        .header(USER_ID_HEADER, ACTOR_ID)
                        .header(USER_NAME_HEADER, "역분개수정자")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "changeSet", "{\"description\":{\"after\":\"변경 시도\"}}"))))
                .andExpect(status().isConflict());

        assertThat(suggestionRepository.findByDocumentTypeAndDocumentIdOrderByCreatedAtDesc(
                CollabDocumentType.ACCOUNTING_VOUCHER, journal.getId())).isEmpty();
    }

    /** 금액/계정 등 원장 필드가 changeSet 에 포함되면 400 으로 조기 거부한다. */
    @Test
    void commitEdit_withLedgerField_returns400AndPersistsNothing() throws Exception {
        UUID journalId = seedPostedJournal("20990613-LEDGER-" + SEQ.getAndIncrement()).getId();

        mvc.perform(post("/accounting/journals/{journalId}/collab/edits", journalId)
                        .header(USER_ID_HEADER, ACTOR_ID)
                        .header(USER_NAME_HEADER, "원장수정자")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "changeSet", "{\"line.1.debitAmount\":{\"after\":\"9999\"}}"))))
                .andExpect(status().isBadRequest());

        mvc.perform(post("/accounting/journals/{journalId}/collab/edits", journalId)
                        .header(USER_ID_HEADER, ACTOR_ID)
                        .header(USER_NAME_HEADER, "원장수정자")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "changeSet", "{\"line.1.accountCode\":{\"after\":\"999999\"}}"))))
                .andExpect(status().isBadRequest());

        assertThat(suggestionRepository.findByDocumentTypeAndDocumentIdOrderByCreatedAtDesc(
                CollabDocumentType.ACCOUNTING_VOUCHER, journalId)).isEmpty();
    }

    /** 기여자 수신자와 username→UUID resolve 후 현재 수정자를 제외하고 push 를 보낸다. */
    @Test
    void commitEdit_notifiesContributorsAndResolvesUsernameRecipients() throws Exception {
        UUID createdByAccountId = UUID.randomUUID();
        UUID postedByAccountId = UUID.randomUUID();
        UUID previousEditorId = UUID.randomUUID();
        UUID commentAuthorId = UUID.randomUUID();
        UUID editorId = UUID.fromString(ACTOR_ID);
        Journal journal = seedPostedJournal("20990613-NOTI-" + SEQ.getAndIncrement());
        JournalCollabSuggestion previousEdit = JournalCollabSuggestion.create(
                CollabDocumentType.ACCOUNTING_VOUCHER, journal.getId(),
                previousEditorId, "이전수정자", "{\"description\":{\"after\":\"이전\"}}", null);
        previousEdit.accept(previousEditorId, "이전수정자");
        suggestionRepository.save(previousEdit);
        commentRepository.save(JournalCollabComment.create(
                CollabDocumentType.ACCOUNTING_VOUCHER, journal.getId(),
                "description", commentAuthorId, "댓글작성자", "확인했습니다", null));
        when(authAccountLookupClient.findAccountIdByLoginId("accounting-user"))
                .thenReturn(Optional.of(createdByAccountId));
        when(authAccountLookupClient.findAccountIdByLoginId("posted_login"))
                .thenReturn(Optional.of(postedByAccountId));

        mvc.perform(post("/accounting/journals/{journalId}/collab/edits", journal.getId())
                        .header(USER_ID_HEADER, ACTOR_ID)
                        .header(USER_NAME_HEADER, "수정자박과장")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "changeSet", "{\"description\":{\"after\":\"알림 적요\"}}"))))
                .andExpect(status().isCreated());

        verify(notificationClient).sendUserPush(eq(createdByAccountId),
                eq("[회계전표 수정] " + journal.getJournalNo()), org.mockito.ArgumentMatchers.anyString());
        verify(notificationClient).sendUserPush(eq(postedByAccountId),
                eq("[회계전표 수정] " + journal.getJournalNo()), org.mockito.ArgumentMatchers.anyString());
        verify(notificationClient).sendUserPush(eq(previousEditorId),
                eq("[회계전표 수정] " + journal.getJournalNo()), org.mockito.ArgumentMatchers.anyString());
        verify(notificationClient).sendUserPush(eq(commentAuthorId),
                eq("[회계전표 수정] " + journal.getJournalNo()), org.mockito.ArgumentMatchers.anyString());
        org.mockito.Mockito.verify(notificationClient, org.mockito.Mockito.never())
                .sendUserPush(eq(editorId), org.mockito.ArgumentMatchers.anyString(),
                        org.mockito.ArgumentMatchers.anyString());

        ArgumentCaptor<String> bodyCaptor = ArgumentCaptor.forClass(String.class);
        verify(notificationClient).sendUserPush(eq(createdByAccountId),
                eq("[회계전표 수정] " + journal.getJournalNo()), bodyCaptor.capture());
        assertThat(bodyCaptor.getValue()).contains("수정자박과장").contains("알림 적요");
        assertThat(bodyCaptor.getValue()).doesNotContain(journal.getId().toString());
    }

    /** DB CHECK 제약이 유효하지 않은 document_type 을 거부하는지 검증한다. */
    @Test
    void checkConstraintRejectsInvalidDocumentTypeInComments() {
        UUID journalId = seedPostedJournal("20990613-CHK-" + SEQ.getAndIncrement()).getId();
        UUID authorId = UUID.fromString(ACTOR_ID);

        assertThatThrownBy(() -> jdbcTemplate.update(
                "INSERT INTO journal_collab_comments " +
                        "(id, document_type, document_id, anchor, author_id, author_name, body, status, " +
                        "created_at, created_by, is_deleted) VALUES " +
                        "(?, 'INVALID_TYPE', ?, NULL, ?, 'tester', '본문', 'OPEN', NOW(), 'system', false)",
                UUID.randomUUID(), journalId, authorId))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    /** DB CHECK 제약이 유효하지 않은 suggestion status 를 거부하는지 검증한다. */
    @Test
    void checkConstraintRejectsInvalidStatusInSuggestions() {
        UUID journalId = seedPostedJournal("20990613-CHK-" + SEQ.getAndIncrement()).getId();
        UUID authorId = UUID.fromString(ACTOR_ID);

        assertThatThrownBy(() -> jdbcTemplate.update(
                "INSERT INTO journal_collab_suggestions " +
                        "(id, document_type, document_id, proposer_id, proposer_name, change_set, status, " +
                        "version, created_at, created_by, is_deleted) VALUES " +
                        "(?, 'ACCOUNTING_VOUCHER', ?, ?, '테스터', '{\"f\":{\"after\":\"v\"}}', 'BAD', " +
                        "0, NOW(), 'system', false)",
                UUID.randomUUID(), journalId, authorId))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    /**
     * presence join/list endpoint 는 헤더 인증, 입력 검증, UUID 비노출 wire 계약, 조회 권한 가드를 지킨다.
     *
     * <p>단언:
     * <ol>
     *   <li>X-User-Id 없는 join → 401 UNAUTHORIZED</li>
     *   <li>sessionId 빈값 → 400 INVALID_INPUT</li>
     *   <li>정상 join → 200 + data 키 정확히 {sessionId, displayName, color} 만 (userId/accountId/lastSeenAt 부재)</li>
     *   <li>displayName 은 X-User-Name 헤더 우선 (body name 무시)</li>
     *   <li>GET presence → 1건 + userId 부재</li>
     *   <li>accounting.journals VIEW 권한 deny stub → 403</li>
     * </ol>
     */
    @Test
    void presence_join_list_validates_header_input_payload_and_permission_guard() throws Exception {
        UUID unauthorizedJournalId = seedPostedJournal("20990613-PRS-401-" + SEQ.getAndIncrement()).getId();
        mvc.perform(post("/accounting/journals/{journalId}/collab/presence/join", unauthorizedJournalId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "sessionId", "presence-session-401",
                                "displayName", "presence tester"))))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("UNAUTHORIZED"));

        UUID invalidJournalId = seedPostedJournal("20990613-PRS-400-" + SEQ.getAndIncrement()).getId();
        mvc.perform(post("/accounting/journals/{journalId}/collab/presence/join", invalidJournalId)
                        .header(USER_ID_HEADER, ACTOR_ID)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("sessionId", ""))))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_INPUT"));

        UUID journalId = seedPostedJournal("20990613-PRS-OK-" + SEQ.getAndIncrement()).getId();
        String response = mvc.perform(post("/accounting/journals/{journalId}/collab/presence/join", journalId)
                        .header(USER_ID_HEADER, ACTOR_ID)
                        .header(USER_NAME_HEADER, "presence tester")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "sessionId", "presence-session-1",
                                "displayName", "ignored body name"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.sessionId").value("presence-session-1"))
                .andExpect(jsonPath("$.data.displayName").value("presence tester"))
                .andExpect(jsonPath("$.data.color").exists())
                .andExpect(jsonPath("$.data.userId").doesNotExist())
                .andExpect(jsonPath("$.data.accountId").doesNotExist())
                .andExpect(jsonPath("$.data.lastSeenAt").doesNotExist())
                .andReturn().getResponse().getContentAsString();
        assertThat(dataMap(response)).containsOnlyKeys("sessionId", "displayName", "color");

        mvc.perform(get("/accounting/journals/{journalId}/collab/presence", journalId)
                        .header(USER_ID_HEADER, ACTOR_ID))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.length()").value(1))
                .andExpect(jsonPath("$.data[0].sessionId").value("presence-session-1"))
                .andExpect(jsonPath("$.data[0].userId").doesNotExist());

        UUID deniedJournalId = seedPostedJournal("20990613-PRS-403-" + SEQ.getAndIncrement()).getId();
        when(dynamicPermissionClient.check(
                any(UUID.class), eq("accounting.journals"), eq(PermissionAction.VIEW)))
                .thenReturn(false);
        when(dynamicPermissionClient.canView(any(), eq("accounting.journals")))
                .thenReturn(false);

        mvc.perform(post("/accounting/journals/{journalId}/collab/presence/join", deniedJournalId)
                        .header(USER_ID_HEADER, ACTOR_ID)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("sessionId", "presence-session-denied"))))
                .andExpect(status().isForbidden());
    }

    /** 정책: COLLAB_LOCKED 은 REVERSED 만 — DRAFT 회계전표도 적요/라인메모 수정완료가 허용된다. */
    @Test
    void commitEdit_onDraftJournal_succeeds() throws Exception {
        Journal journal = seedDraftJournal("20990613-DRAFT-" + SEQ.getAndIncrement());

        mvc.perform(post("/accounting/journals/{journalId}/collab/edits", journal.getId())
                        .header(USER_ID_HEADER, ACTOR_ID)
                        .header(USER_NAME_HEADER, "작성자")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "changeSet", "{\"description\":{\"after\":\"초안 적요 정정\"}}"))))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.journal.description").value("초안 적요 정정"));

        journalRepository.flush();
        assertThat(journalRepository.findById(journal.getId()).orElseThrow().getDescription())
                .isEqualTo("초안 적요 정정");
    }

    /** 수정완료 후 GET /edits 가 ACCEPTED 이력을 반환하고, 빈 changeSet 은 400 으로 거부한다. */
    @Test
    void listEdits_returnsAcceptedHistory_andEmptyChangeSetRejected() throws Exception {
        Journal journal = seedPostedJournal("20990613-LIST-" + SEQ.getAndIncrement());

        mvc.perform(post("/accounting/journals/{journalId}/collab/edits", journal.getId())
                        .header(USER_ID_HEADER, ACTOR_ID)
                        .header(USER_NAME_HEADER, "수정자")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("changeSet", "{}"))))
                .andExpect(status().isBadRequest());

        mvc.perform(post("/accounting/journals/{journalId}/collab/edits", journal.getId())
                        .header(USER_ID_HEADER, ACTOR_ID)
                        .header(USER_NAME_HEADER, "수정자")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "changeSet", "{\"description\":{\"after\":\"목록용 적요\"}}"))))
                .andExpect(status().isCreated());

        mvc.perform(get("/accounting/journals/{journalId}/collab/edits", journal.getId())
                        .header(USER_ID_HEADER, ACTOR_ID))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.length()").value(1))
                .andExpect(jsonPath("$.data[0].status").value("ACCEPTED"))
                .andExpect(jsonPath("$.data[0].changeSet",
                        org.hamcrest.Matchers.containsString("목록용 적요")));
    }

    /** coedit update relay 가 누적되고 GET snapshot 으로 재구성되며 awareness 는 저장하지 않는다. */
    @Test
    void coedit_update_accumulates_andListSnapshot_andAwarenessIsNotPersisted() throws Exception {
        UUID journalId = seedPostedJournal("20990613-CED-" + SEQ.getAndIncrement()).getId();

        mvc.perform(get("/accounting/journals/{journalId}/collab/coedit", journalId)
                        .header(USER_ID_HEADER, ACTOR_ID))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.updates.length()").value(0));

        mvc.perform(post("/accounting/journals/{journalId}/collab/coedit/update", journalId)
                        .header(USER_ID_HEADER, ACTOR_ID)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("update", "dXBkYXRl"))))
                .andExpect(status().isOk());

        mvc.perform(post("/accounting/journals/{journalId}/collab/coedit/update", journalId)
                        .header(USER_ID_HEADER, ACTOR_ID)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("update", "YXdhcmU="))))
                .andExpect(status().isOk());

        mvc.perform(post("/accounting/journals/{journalId}/collab/coedit/awareness", journalId)
                        .header(USER_ID_HEADER, ACTOR_ID)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("awareness", "Y3Vyc29y"))))
                .andExpect(status().isOk());

        mvc.perform(get("/accounting/journals/{journalId}/collab/coedit", journalId)
                        .header(USER_ID_HEADER, ACTOR_ID))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.updates.length()").value(2))
                .andExpect(jsonPath("$.data.updates[0]").value("dXBkYXRl"))
                .andExpect(jsonPath("$.data.updates[1]").value("YXdhcmU="));
    }

    /** coedit 읽기 계열(GET snapshot / awareness relay)은 VIEW(accounting.journals) 권한 deny 시 403. */
    @Test
    void coedit_readEndpoints_deniedWithoutViewPermission_returns403() throws Exception {
        UUID journalId = seedPostedJournal("20990613-CVR-" + SEQ.getAndIncrement()).getId();
        when(dynamicPermissionClient.check(
                any(UUID.class), eq("accounting.journals"), eq(PermissionAction.VIEW)))
                .thenReturn(false);
        when(dynamicPermissionClient.canView(any(), eq("accounting.journals")))
                .thenReturn(false);

        mvc.perform(get("/accounting/journals/{journalId}/collab/coedit", journalId)
                        .header(USER_ID_HEADER, ACTOR_ID))
                .andExpect(status().isForbidden());

        mvc.perform(post("/accounting/journals/{journalId}/collab/coedit/awareness", journalId)
                        .header(USER_ID_HEADER, ACTOR_ID)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("awareness", "YXdhcmU="))))
                .andExpect(status().isForbidden());
    }

    /** coedit update 는 UPDATE(accounting.journals) 권한 deny 시 403 으로 거부된다. */
    @Test
    void coedit_update_deniedWithoutUpdatePermission_returns403() throws Exception {
        UUID journalId = seedPostedJournal("20990613-CUW-" + SEQ.getAndIncrement()).getId();
        when(dynamicPermissionClient.check(
                any(UUID.class), eq("accounting.journals"), eq(PermissionAction.UPDATE)))
                .thenReturn(false);
        when(dynamicPermissionClient.canEdit(any(), eq("accounting.journals")))
                .thenReturn(false);

        mvc.perform(post("/accounting/journals/{journalId}/collab/coedit/update", journalId)
                        .header(USER_ID_HEADER, ACTOR_ID)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("update", "dXBkYXRl"))))
                .andExpect(status().isForbidden());
    }

    /** coedit update 의 body 누락/빈 update 필드는 400 으로 거부되고 snapshot 에 누적되지 않는다. */
    @Test
    void coedit_update_nullOrEmptyBody_returns400_andNotPersisted() throws Exception {
        UUID journalId = seedPostedJournal("20990613-CUN-" + SEQ.getAndIncrement()).getId();

        mvc.perform(post("/accounting/journals/{journalId}/collab/coedit/update", journalId)
                        .header(USER_ID_HEADER, ACTOR_ID)
                        .contentType(MediaType.APPLICATION_JSON))
                .andExpect(status().isBadRequest());

        mvc.perform(post("/accounting/journals/{journalId}/collab/coedit/update", journalId)
                        .header(USER_ID_HEADER, ACTOR_ID)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isBadRequest());

        mvc.perform(get("/accounting/journals/{journalId}/collab/coedit", journalId)
                        .header(USER_ID_HEADER, ACTOR_ID))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.updates.length()").value(0));
    }

    /** coedit awareness 의 body 누락/빈 awareness 필드는 400 으로 거부된다(update 와 대칭). */
    @Test
    void coedit_awareness_nullOrEmptyBody_returns400() throws Exception {
        UUID journalId = seedPostedJournal("20990613-CAN-" + SEQ.getAndIncrement()).getId();

        mvc.perform(post("/accounting/journals/{journalId}/collab/coedit/awareness", journalId)
                        .header(USER_ID_HEADER, ACTOR_ID)
                        .contentType(MediaType.APPLICATION_JSON))
                .andExpect(status().isBadRequest());

        mvc.perform(post("/accounting/journals/{journalId}/collab/coedit/awareness", journalId)
                        .header(USER_ID_HEADER, ACTOR_ID)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isBadRequest());
    }

    private Journal seedDraftJournal(String journalNo) {
        Journal journal = Journal.create(journalNo, TEST_DATE, "초기 적요",
                JournalSourceType.MANUAL, null);
        journal.addLine(JournalLine.create(journal, 1, "101000",
                BigDecimal.valueOf(1000), BigDecimal.ZERO, null, "차변 메모"));
        journal.addLine(JournalLine.create(journal, 2, "201000",
                BigDecimal.ZERO, BigDecimal.valueOf(1000), null, "대변 메모"));
        return journalRepository.saveAndFlush(journal);
    }

    private Journal seedPostedJournal(String journalNo) {
        Journal journal = Journal.create(journalNo, TEST_DATE, "초기 적요",
                JournalSourceType.MANUAL, null);
        journal.addLine(JournalLine.create(journal, 1, "101000",
                BigDecimal.valueOf(1000), BigDecimal.ZERO, null, "차변 메모"));
        journal.addLine(JournalLine.create(journal, 2, "201000",
                BigDecimal.ZERO, BigDecimal.valueOf(1000), null, "대변 메모"));
        journal.post("posted_login");
        return journalRepository.saveAndFlush(journal);
    }

    private static String opaqueToken(UUID id) {
        ByteBuffer buffer = ByteBuffer.allocate(16);
        buffer.putLong(id.getMostSignificantBits()).putLong(id.getLeastSignificantBits());
        return Base64.getUrlEncoder().withoutPadding().encodeToString(buffer.array());
    }

    private Journal seedReversedJournal(String journalNo) {
        Journal journal = seedPostedJournal(journalNo);
        journal.markReversed();
        return journalRepository.saveAndFlush(journal);
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> dataMap(String responseBody) throws Exception {
        return (Map<String, Object>) objectMapper.readValue(responseBody, Map.class).get("data");
    }
}
