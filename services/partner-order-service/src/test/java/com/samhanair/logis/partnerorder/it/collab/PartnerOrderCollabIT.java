package com.samhanair.logis.partnerorder.it.collab;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.collab.CollabDocumentType;
import com.samhanair.logis.partnerorder.PartnerOrderServiceApplication;
import com.samhanair.logis.partnerorder.audit.repository.PartnerOrderAuditLogRepository;
import com.samhanair.logis.partnerorder.client.AuthAccountLookupClient;
import com.samhanair.logis.partnerorder.client.DcConfigClient;
import com.samhanair.logis.partnerorder.client.InventoryClient;
import com.samhanair.logis.partnerorder.client.NotificationClient;
import com.samhanair.logis.partnerorder.client.PartnerAuthClient;
import com.samhanair.logis.partnerorder.client.ProductClient;
import com.samhanair.logis.partnerorder.client.SlipServiceClient;
import com.samhanair.logis.partnerorder.collab.PartnerOrderCollabComment;
import com.samhanair.logis.partnerorder.collab.PartnerOrderCollabCommentRepository;
import com.samhanair.logis.partnerorder.collab.PartnerOrderCollabSuggestion;
import com.samhanair.logis.partnerorder.collab.PartnerOrderCollabSuggestionRepository;
import com.samhanair.logis.partnerorder.domain.PartnerOrder;
import com.samhanair.logis.partnerorder.domain.PartnerOrderLine;
import com.samhanair.logis.partnerorder.it.AbstractPostgresIT;
import com.samhanair.logis.partnerorder.repository.PartnerOrderLineRepository;
import com.samhanair.logis.partnerorder.repository.PartnerOrderRepository;
import com.samhanair.logis.partnerorder.repository.SlipPublishOutboxRepository;
import com.samhanair.logis.partnerorder.vendor.client.PartnerLookupClient;
import com.samhanair.logis.partnerorder.vendor.client.ProductCatalogLookupClient;
import com.samhanair.logis.security.permission.DynamicPermissionClient;
import com.samhanair.logis.security.permission.PermissionAction;
import java.math.BigDecimal;
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
 * 주문 협업 실 Postgres IT.
 *
 * <p>partner_order_collab_comments / partner_order_collab_suggestions 테이블의
 * INSERT/SELECT/soft-delete 경로와 수정완료 시 memo/dueDate/line remark 실 적용, 잠금 상태,
 * 핵심 필드 400 거부, 알림 수신자 resolve 를 MockMvc + Testcontainers PostgreSQL 로 검증한다.
 */
@SpringBootTest(classes = PartnerOrderServiceApplication.class)
@AutoConfigureMockMvc
@Transactional
@WithMockUser(username = "collab-user", authorities = {"ROLE_SALES"})
class PartnerOrderCollabIT extends AbstractPostgresIT {

    private static final String USER_ID_HEADER = "X-User-Id";
    private static final String USER_NAME_HEADER = "X-User-Name";
    private static final String ACTOR_ID = "20000000-0000-0000-0000-000000000101";
    private static final AtomicInteger SEQ = new AtomicInteger(100);

    @Autowired private MockMvc mvc;
    @Autowired private ObjectMapper objectMapper;
    @Autowired private PartnerOrderRepository orderRepository;
    @Autowired private PartnerOrderLineRepository lineRepository;
    @Autowired private PartnerOrderCollabSuggestionRepository suggestionRepository;
    @Autowired private PartnerOrderCollabCommentRepository commentRepository;
    @Autowired private PartnerOrderAuditLogRepository auditLogRepository;
    @Autowired private SlipPublishOutboxRepository outboxRepository;
    @Autowired private JdbcTemplate jdbcTemplate;

    @MockBean private DcConfigClient dcConfigClient;
    @MockBean private ProductClient productClient;
    @MockBean private InventoryClient inventoryClient;
    @MockBean private SlipServiceClient slipServiceClient;
    @MockBean private PartnerAuthClient partnerAuthClient;
    @MockBean private PartnerLookupClient partnerLookupClient;
    @MockBean private ProductCatalogLookupClient catalogLookupClient;
    @MockBean private AuthAccountLookupClient authAccountLookupClient;
    @MockBean private NotificationClient notificationClient;
    @MockBean private DynamicPermissionClient dynamicPermissionClient;

    @BeforeEach
    void setUp() {
        outboxRepository.deleteAll();
        suggestionRepository.deleteAll();
        commentRepository.deleteAll();
        auditLogRepository.deleteAll();
        jdbcTemplate.update("DELETE FROM partner_order_revisions");
        jdbcTemplate.update("DELETE FROM partner_order_lines");
        orderRepository.deleteAll();
        lenient().when(dynamicPermissionClient.canView(anyString(), anyString())).thenReturn(true);
        lenient().when(dynamicPermissionClient.canEdit(anyString(), anyString())).thenReturn(true);
        lenient().when(dynamicPermissionClient.check(any(UUID.class), anyString(), any(PermissionAction.class)))
                .thenReturn(true);
    }

    /** 댓글 등록, 조회, 해결, 삭제가 실 DB 에 반영되는지 검증한다. */
    @Test
    void comment_roundtrip_add_list_resolve_softDelete() throws Exception {
        UUID orderId = seedConfirmedOrder("2099/06/13-CMRT-" + SEQ.getAndIncrement()).getId();

        String createResp = mvc.perform(post("/api/v1/partner-orders/{orderId}/collab/comments", orderId)
                        .header(USER_ID_HEADER, ACTOR_ID)
                        .header(USER_NAME_HEADER, "영업담당자")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "body", "납기 확인 댓글",
                                "anchor", "dueDate"))))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.data.body").value("납기 확인 댓글"))
                .andExpect(jsonPath("$.data.authorName").value("영업담당자"))
                .andExpect(jsonPath("$.data.anchor").value("dueDate"))
                .andExpect(jsonPath("$.data.status").value("OPEN"))
                .andReturn().getResponse().getContentAsString();
        UUID commentId = UUID.fromString((String) dataMap(createResp).get("id"));

        mvc.perform(get("/api/v1/partner-orders/{orderId}/collab/comments", orderId)
                        .header(USER_ID_HEADER, ACTOR_ID)
                        .param("limit", "20"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.length()").value(1));

        mvc.perform(post("/api/v1/partner-orders/{orderId}/collab/comments/{commentId}/resolve",
                        orderId, commentId)
                        .header(USER_ID_HEADER, ACTOR_ID))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("RESOLVED"));

        mvc.perform(delete("/api/v1/partner-orders/{orderId}/collab/comments/{commentId}",
                        orderId, commentId)
                        .header(USER_ID_HEADER, ACTOR_ID))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true));

        mvc.perform(get("/api/v1/partner-orders/{orderId}/collab/comments", orderId)
                        .header(USER_ID_HEADER, ACTOR_ID)
                        .param("limit", "20"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.length()").value(0));
    }

    /** CONFIRMED 주문의 memo/dueDate/라인 remark 수정완료가 실 적용되고 ACCEPTED 이력이 남는지 검증한다. */
    @Test
    void commitEdit_onConfirmedOrder_appliesMemoDueDateAndLineRemarkAndRecordsAcceptedHistory()
            throws Exception {
        PartnerOrder order = seedConfirmedOrder("2099/06/13-EDIT-" + SEQ.getAndIncrement());

        String response = mvc.perform(post("/api/v1/partner-orders/{orderId}/collab/edits", order.getId())
                        .header(USER_ID_HEADER, ACTOR_ID)
                        .header(USER_NAME_HEADER, "수정자박과장")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "changeSet",
                                "{\"memo\":{\"after\":\"새 요청사항\"},\"dueDate\":{\"after\":\"2099-06-25\"},"
                                        + "\"line.1.remark\":{\"after\":\"새 1번 비고\"}}",
                                "reason", "요청사항 정정"))))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.edit.status").value("ACCEPTED"))
                .andExpect(jsonPath("$.data.edit.proposerName").value("수정자박과장"))
                .andExpect(jsonPath("$.data.edit.decidedByName").value("수정자박과장"))
                .andExpect(jsonPath("$.data.order.memo").value("새 요청사항"))
                .andExpect(jsonPath("$.data.order.dueDate").value("2099-06-25"))
                // HTTP 응답 본문(DTO 직렬화)에도 라인 remark 가 정확히 반영되는지 — 1번 변경/2번 불변.
                .andExpect(jsonPath("$.data.order.lines[0].remark").value("새 1번 비고"))
                .andExpect(jsonPath("$.data.order.lines[1].remark").value("초기 2번 비고"))
                .andReturn().getResponse().getContentAsString();

        @SuppressWarnings("unchecked")
        Map<String, Object> edit = (Map<String, Object>) dataMap(response).get("edit");
        UUID editId = UUID.fromString((String) edit.get("id"));

        orderRepository.flush();
        PartnerOrder reloaded = orderRepository.findById(order.getId()).orElseThrow();
        assertThat(reloaded.getMemo()).isEqualTo("새 요청사항");
        assertThat(reloaded.getDueDate()).isEqualTo(LocalDate.of(2099, 6, 25));
        assertThat(reloaded.getLines().get(0).getRemark()).isEqualTo("새 1번 비고");
        assertThat(reloaded.getLines().get(0).getQuantity()).isEqualTo(2);
        assertThat(reloaded.getLines().get(0).getPriceVat()).isEqualByComparingTo("120000");
        assertThat(reloaded.getLines().get(1).getRemark()).isEqualTo("초기 2번 비고");
        assertThat(reloaded.getLines().get(1).getQuantity()).isEqualTo(1);

        PartnerOrderCollabSuggestion saved = suggestionRepository.findById(editId).orElseThrow();
        assertThat(saved.getStatus().name()).isEqualTo("ACCEPTED");
        assertThat(saved.getChangeSet()).contains("\"before\":\"초기 요청사항\"");
        assertThat(auditLogRepository.findByEntityIdOrderByRevisionNoDescChangedAtDesc(order.getId()))
                .extracting("fieldName")
                .contains("요청사항", "납기", "라인 1 비고");
    }

    /** FE 상세 라우트의 하이픈형 orderNumber path-id 로도 협업 수정완료가 동작해야 한다. */
    @Test
    void commitEdit_acceptsHyphenOrderNumberPathId() throws Exception {
        PartnerOrder order = seedConfirmedOrder("2099/06/13-PATH-" + SEQ.getAndIncrement());
        String pathId = order.getOrderNo().replace("/", "-");

        mvc.perform(post("/api/v1/partner-orders/{orderId}/collab/edits", pathId)
                        .header(USER_ID_HEADER, ACTOR_ID)
                        .header(USER_NAME_HEADER, "수정자박과장")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "changeSet", "{\"memo\":{\"after\":\"path-id 수정\"}}"))))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.order.orderNumber").value(order.getOrderNo()))
                .andExpect(jsonPath("$.data.order.memo").value("path-id 수정"));

        orderRepository.flush();
        assertThat(orderRepository.findById(order.getId()).orElseThrow().getMemo())
                .isEqualTo("path-id 수정");
    }

    /** CANCELED / CONVERTED / CONFIRMING 주문은 협업 수정완료가 409 로 거부되고 이력이 저장되지 않아야 한다. */
    @Test
    void commitEdit_onLockedStatuses_returns409AndPersistsNothing() throws Exception {
        for (PartnerOrder order : java.util.List.of(
                seedCanceledOrder("2099/06/13-CAN-" + SEQ.getAndIncrement()),
                seedConvertedOrder("2099/06/13-CONV-" + SEQ.getAndIncrement()),
                seedConfirmingOrder("2099/06/13-CFM-" + SEQ.getAndIncrement()))) {
            mvc.perform(post("/api/v1/partner-orders/{orderId}/collab/edits", order.getId())
                            .header(USER_ID_HEADER, ACTOR_ID)
                            .header(USER_NAME_HEADER, "잠금수정자")
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(objectMapper.writeValueAsString(Map.of(
                                    "changeSet", "{\"memo\":{\"after\":\"변경 시도\"}}"))))
                    .andExpect(status().isConflict());

            assertThat(suggestionRepository.findByDocumentTypeAndDocumentIdOrderByCreatedAtDesc(
                    CollabDocumentType.PARTNER_ORDER, order.getId())).isEmpty();
        }
    }

    /** 품목/수량/단가/금액/전환수량/주문번호/거래처코드 등 핵심 필드는 400 으로 조기 거부한다. */
    @Test
    void commitEdit_withCoreFields_returns400AndPersistsNothing() throws Exception {
        UUID orderId = seedConfirmedOrder("2099/06/13-CORE-" + SEQ.getAndIncrement()).getId();

        for (String changeSet : java.util.List.of(
                "{\"partnerCode\":{\"after\":\"P-OTHER\"}}",
                "{\"orderNo\":{\"after\":\"2099/06/13-X\"}}",
                "{\"line.1.quantity\":{\"after\":\"99\"}}",
                "{\"line.2.priceVat\":{\"after\":\"1\"}}",
                "{\"line.2.convertedQuantity\":{\"after\":\"1\"}}")) {
            mvc.perform(post("/api/v1/partner-orders/{orderId}/collab/edits", orderId)
                            .header(USER_ID_HEADER, ACTOR_ID)
                            .header(USER_NAME_HEADER, "핵심수정자")
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(objectMapper.writeValueAsString(Map.of("changeSet", changeSet))))
                    .andExpect(status().isBadRequest());
        }

        assertThat(suggestionRepository.findByDocumentTypeAndDocumentIdOrderByCreatedAtDesc(
                CollabDocumentType.PARTNER_ORDER, orderId)).isEmpty();
    }

    /** 기여자 수신자와 username→UUID resolve 후 현재 수정자를 제외하고 push 를 보낸다. */
    @Test
    void commitEdit_notifiesContributorsAndResolvesUsernameRecipients() throws Exception {
        UUID createdByAccountId = UUID.randomUUID();
        UUID previousEditorId = UUID.randomUUID();
        UUID commentAuthorId = UUID.randomUUID();
        UUID revisionActorId = UUID.randomUUID();
        UUID editorId = UUID.fromString(ACTOR_ID);
        PartnerOrder order = seedConfirmedOrder("2099/06/13-NOTI-" + SEQ.getAndIncrement());
        PartnerOrderCollabSuggestion previousEdit = PartnerOrderCollabSuggestion.create(
                CollabDocumentType.PARTNER_ORDER, order.getId(),
                previousEditorId, "이전수정자", "{\"memo\":{\"after\":\"이전\"}}", null);
        previousEdit.accept(previousEditorId, "이전수정자");
        suggestionRepository.save(previousEdit);
        commentRepository.save(PartnerOrderCollabComment.create(
                CollabDocumentType.PARTNER_ORDER, order.getId(),
                "memo", commentAuthorId, "댓글작성자", "확인했습니다", null));
        // PartnerOrderRevision actor 도 기여자 알림 수신자 — 실 DB revision row 를 seed 해
        // resolveNotificationRecipients 의 revision 경로를 end-to-end 로 검증(단위테스트 외 실증).
        jdbcTemplate.update(
                "INSERT INTO partner_order_revisions "
                        + "(id, partner_order_id, revision_no, revision_type, snapshot, actor_id, actor_name, "
                        + "created_at, created_by, is_deleted) "
                        + "VALUES (?, ?, 1, 'EDIT', '{}'::jsonb, ?, '리비전수정자', NOW(), 'system', false)",
                UUID.randomUUID(), order.getId(), revisionActorId);
        when(authAccountLookupClient.findAccountIdByLoginId("collab-user"))
                .thenReturn(Optional.of(createdByAccountId));

        mvc.perform(post("/api/v1/partner-orders/{orderId}/collab/edits", order.getId())
                        .header(USER_ID_HEADER, ACTOR_ID)
                        .header(USER_NAME_HEADER, "수정자박과장")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "changeSet", "{\"memo\":{\"after\":\"알림 요청사항\"}}"))))
                .andExpect(status().isCreated());

        verify(notificationClient).sendUserPush(eq(createdByAccountId),
                eq("[주문 수정] " + order.getOrderNo()), org.mockito.ArgumentMatchers.anyString());
        verify(notificationClient).sendUserPush(eq(previousEditorId),
                eq("[주문 수정] " + order.getOrderNo()), org.mockito.ArgumentMatchers.anyString());
        verify(notificationClient).sendUserPush(eq(commentAuthorId),
                eq("[주문 수정] " + order.getOrderNo()), org.mockito.ArgumentMatchers.anyString());
        verify(notificationClient).sendUserPush(eq(revisionActorId),
                eq("[주문 수정] " + order.getOrderNo()), org.mockito.ArgumentMatchers.anyString());
        org.mockito.Mockito.verify(notificationClient, org.mockito.Mockito.never())
                .sendUserPush(eq(editorId), org.mockito.ArgumentMatchers.anyString(),
                        org.mockito.ArgumentMatchers.anyString());

        ArgumentCaptor<String> bodyCaptor = ArgumentCaptor.forClass(String.class);
        verify(notificationClient).sendUserPush(eq(createdByAccountId),
                eq("[주문 수정] " + order.getOrderNo()), bodyCaptor.capture());
        assertThat(bodyCaptor.getValue()).contains("수정자박과장").contains("알림 요청사항");
        assertThat(bodyCaptor.getValue()).doesNotContain(order.getId().toString());
    }

    /** 수정완료 후 GET /edits 가 ACCEPTED 이력을 반환하고, 빈 changeSet 은 400 으로 거부한다. */
    @Test
    void listEdits_returnsAcceptedHistory_andEmptyChangeSetRejected() throws Exception {
        PartnerOrder order = seedConfirmedOrder("2099/06/13-LIST-" + SEQ.getAndIncrement());

        mvc.perform(post("/api/v1/partner-orders/{orderId}/collab/edits", order.getId())
                        .header(USER_ID_HEADER, ACTOR_ID)
                        .header(USER_NAME_HEADER, "수정자")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("changeSet", "{}"))))
                .andExpect(status().isBadRequest());

        mvc.perform(post("/api/v1/partner-orders/{orderId}/collab/edits", order.getId())
                        .header(USER_ID_HEADER, ACTOR_ID)
                        .header(USER_NAME_HEADER, "수정자")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "changeSet", "{\"memo\":{\"after\":\"목록용 요청사항\"}}"))))
                .andExpect(status().isCreated());

        mvc.perform(get("/api/v1/partner-orders/{orderId}/collab/edits", order.getId())
                        .header(USER_ID_HEADER, ACTOR_ID))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.length()").value(1))
                .andExpect(jsonPath("$.data[0].status").value("ACCEPTED"))
                .andExpect(jsonPath("$.data[0].changeSet",
                        org.hamcrest.Matchers.containsString("목록용 요청사항")));
    }

    /** DB CHECK 제약이 유효하지 않은 document_type 을 거부하는지 검증한다. */
    @Test
    void checkConstraintRejectsInvalidDocumentTypeInComments() {
        UUID orderId = seedConfirmedOrder("2099/06/13-CHK-" + SEQ.getAndIncrement()).getId();
        UUID authorId = UUID.fromString(ACTOR_ID);

        assertThatThrownBy(() -> jdbcTemplate.update(
                "INSERT INTO partner_order_collab_comments " +
                        "(id, document_type, document_id, anchor, author_id, author_name, body, status, " +
                        "created_at, created_by, is_deleted) VALUES " +
                        "(?, 'INVALID_TYPE', ?, NULL, ?, 'tester', '본문', 'OPEN', NOW(), 'system', false)",
                UUID.randomUUID(), orderId, authorId))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    /** DB CHECK 제약이 유효하지 않은 suggestion status 를 거부하는지 검증한다. */
    @Test
    void checkConstraintRejectsInvalidStatusInSuggestions() {
        UUID orderId = seedConfirmedOrder("2099/06/13-CHK-" + SEQ.getAndIncrement()).getId();
        UUID authorId = UUID.fromString(ACTOR_ID);

        assertThatThrownBy(() -> jdbcTemplate.update(
                "INSERT INTO partner_order_collab_suggestions " +
                        "(id, document_type, document_id, proposer_id, proposer_name, change_set, status, " +
                        "version, created_at, created_by, is_deleted) VALUES " +
                        "(?, 'PARTNER_ORDER', ?, ?, '테스터', '{\"f\":{\"after\":\"v\"}}', 'BAD', " +
                        "0, NOW(), 'system', false)",
                UUID.randomUUID(), orderId, authorId))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    private PartnerOrder seedConfirmedOrder(String orderNo) {
        PartnerOrder order = PartnerOrder.createFromEstimate(
                "P-COLLAB",
                "1010101010",
                orderNo,
                "IT-COLLAB-" + orderNo,
                BigDecimal.ZERO,
                UUID.randomUUID(),
                LocalDate.of(2099, 6, 20),
                "초기 요청사항");
        addTwoLines(order);
        order.markSlipPublished("S-" + orderNo.replace("/", "").replace("-", ""));
        return orderRepository.saveAndFlush(order);
    }

    private PartnerOrder seedCanceledOrder(String orderNo) {
        PartnerOrder order = seedConfirmedOrder(orderNo);
        order.cancel();
        return orderRepository.saveAndFlush(order);
    }

    private PartnerOrder seedConvertedOrder(String orderNo) {
        PartnerOrder order = PartnerOrder.createFromConfirm(
                "P-COLLAB",
                "1010101010",
                orderNo,
                "IT-COLLAB-" + orderNo,
                BigDecimal.ZERO);
        PartnerOrderLine line = PartnerOrderLine.create(
                UUID.randomUUID(), "AJ040RXH4BC1", "실외기", "homemulti",
                2, BigDecimal.valueOf(120000), "전환 비고");
        order.addLine(line);
        line.convert(2);
        order.markConvertedIfComplete();
        return orderRepository.saveAndFlush(order);
    }

    private PartnerOrder seedConfirmingOrder(String orderNo) {
        PartnerOrder order = PartnerOrder.create(
                "P-COLLAB",
                "1010101010",
                orderNo,
                "IT-COLLAB-" + orderNo,
                BigDecimal.ZERO);
        addTwoLines(order);
        return orderRepository.saveAndFlush(order);
    }

    private void addTwoLines(PartnerOrder order) {
        order.addLine(PartnerOrderLine.create(
                UUID.randomUUID(),
                "AJ040RXH4BC1",
                "실외기",
                "homemulti",
                2,
                BigDecimal.valueOf(120000),
                "초기 1번 비고"));
        order.addLine(PartnerOrderLine.create(
                UUID.randomUUID(),
                "AR09B9150HZ",
                "벽걸이 실내기",
                "singleSets",
                1,
                BigDecimal.valueOf(310000),
                "초기 2번 비고"));
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> dataMap(String responseBody) throws Exception {
        return (Map<String, Object>) objectMapper.readValue(responseBody, Map.class).get("data");
    }
}
