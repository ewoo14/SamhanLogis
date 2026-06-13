package com.samhanair.logis.accounting.it.collab;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
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
import java.math.BigDecimal;
import java.time.LocalDate;
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
