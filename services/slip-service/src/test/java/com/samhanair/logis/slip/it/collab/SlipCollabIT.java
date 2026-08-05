package com.samhanair.logis.slip.it.collab;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.samhanair.logis.collab.CollabDocumentType;
import com.samhanair.logis.security.permission.PermissionAction;
import com.samhanair.logis.slip.SlipServiceApplication;
import com.samhanair.logis.slip.audit.repository.SlipAuditLogRepository;
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
import com.samhanair.logis.slip.collab.SlipCollabComment;
import com.samhanair.logis.slip.collab.SlipCollabCommentRepository;
import com.samhanair.logis.slip.collab.SlipCollabSuggestion;
import com.samhanair.logis.slip.collab.SlipCollabSuggestionRepository;
import com.samhanair.logis.slip.collab.SlipDocumentCollaborationPort;
import com.samhanair.logis.slip.delivery.sms.SmsGateway;
import com.samhanair.logis.slip.domain.DeliveryTag;
import com.samhanair.logis.slip.domain.Slip;
import com.samhanair.logis.slip.domain.SlipStatus;
import com.samhanair.logis.slip.it.AbstractPostgresIT;
import com.samhanair.logis.slip.repository.SlipRepository;
import com.samhanair.logis.slip.revision.domain.SlipRevision;
import com.samhanair.logis.slip.revision.domain.SlipRevisionType;
import com.samhanair.logis.slip.revision.repository.SlipRevisionRepository;
import java.time.LocalDate;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.Future;
import org.mockito.ArgumentCaptor;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * 입출고전표 협업 실 Postgres IT.
 *
 * <p>slip_collab_comments / slip_collab_suggestions 테이블의 INSERT/SELECT/soft-delete 경로와
 * 수정완료 시 {@code applyOverlayPatchBatch} 실 적용 + EDIT revision 1건 캡처를
 * MockMvc + Testcontainers PostgreSQL 로 검증한다. (§7 협업, PR #474)
 *
 * <p>시나리오:
 * <ol>
 *   <li>댓글 라운드트립 (add → list → resolve → soft-delete → list 0건 + 스레드 부모댓글 1건 포함)</li>
 *   <li>수정완료 실 적용 (slip.memo 실 변경 + ACCEPTED 이력 + audit old→new + EDIT revision 1건)</li>
 *   <li>권한 deny 403 (slip.comments CREATE, slip.audit-overlay UPDATE)</li>
 *   <li>OUTBOUND/INBOUND documentType 분기 — 저장된 documentType 실 확인</li>
 *   <li>CHECK 제약 실 INSERT 거부 (document_type='INVALID_TYPE', status='BAD')</li>
 *   <li>협업 수정완료 잠금 정책 — CONFIRMED 성공, 물리 종결(DELIVERED) 409</li>
 *   <li>수정완료 changeSet 구조 검증 — 비JSON/구조불량 → 400 + 미저장</li>
 * </ol>
 */
@SpringBootTest(classes = SlipServiceApplication.class)
@AutoConfigureMockMvc
@Transactional
@WithMockUser(username = "slip-user", authorities = {"ROLE_MANAGER"})
class SlipCollabIT extends AbstractPostgresIT {

    private static final String USER_ID_HEADER = "X-User-Id";
    private static final String USER_NAME_HEADER = "X-User-Name";

    /** 권한 stub 에 사용할 고정 사용자 UUID. 수정자 ID 로도 재사용. */
    private static final String ACTOR_ID = "20000000-0000-0000-0000-000000000001";
    /** 서로 다른 협업 편집자 저장 순서를 실증할 두 번째 actor. */
    private static final String SECOND_ACTOR_ID = "20000000-0000-0000-0000-000000000002";

    /** 테스트 slipNo 의 날짜 prefix — 미래 날짜 사용으로 seqNo 충돌 최소화. */
    private static final LocalDate TEST_DATE = LocalDate.of(2099, 6, 13);

    /** 동일 트랜잭션 내에서 slipNo seqNo 중복 방지용 카운터. */
    private static final AtomicInteger SEQ = new AtomicInteger(100);

    @Autowired private MockMvc mvc;
    @Autowired private ObjectMapper objectMapper;
    @Autowired private SlipRepository slipRepository;
    @Autowired
    @Qualifier("slipOutboundCollaborationPort")
    private SlipDocumentCollaborationPort collaborationPort;
    @Autowired private SlipRevisionRepository revisionRepository;
    @Autowired private SlipCollabSuggestionRepository suggestionRepository;
    @Autowired private SlipCollabCommentRepository commentRepository;
    /** 시나리오 8(a) — accept 경유 audit revision_no(N-분열 차단) 단언용. */
    @Autowired private SlipAuditLogRepository auditLogRepository;
    @Autowired private JdbcTemplate jdbcTemplate;

    /* ------------------------------------------------------------------ */
    /* 외부 client MockBean — 누락 시 Eureka 비활성 → 500 ([it-mockbean-external-clients]) */
    /* ------------------------------------------------------------------ */
    @MockBean private ArologisDispatchClient arologisDispatchClient;
    @MockBean private AuthAccountLookupClient authAccountLookupClient;
    @MockBean private InventoryClient inventoryClient;
    @MockBean private NotificationClient notificationClient;
    @MockBean private NotificationChatRoomClient notificationChatRoomClient;
    @MockBean private PartnerBlockClient partnerBlockClient;
    @MockBean private PartnerInternalClient partnerInternalClient;
    @MockBean private ProductClient productClient;
    @MockBean private SmsGateway smsGateway;
    @MockBean private UserInternalClient userInternalClient;
    @MockBean private WarehouseInternalClient warehouseInternalClient;

    /**
     * {@link AbstractPostgresIT} 의 dynamicPermissionClient 는 기본 lenient allow-all.
     * 각 테스트에서 deny stub 은 필요한 시점에만 추가.
     */
    @BeforeEach
    void stubDefaults() {
        // UserInternalClient 는 기본 stub 불필요 (collab 경로에서 호출 없음)
        // 기본 allow-all 은 AbstractPostgresIT.setUpDynamicPermissionClient 가 처리
    }

    /* ====================================================================
     * 시나리오 1 — 댓글 라운드트립
     * (add 201 → list 1건 → resolve RESOLVED → soft-delete → list 0건)
     * 부모-자식 스레드 1건 포함
     * ==================================================================== */

    /**
     * 출고전표에 댓글을 등록하고 조회·해결·삭제가 실 DB 에 반영되는지 검증한다.
     *
     * <p>parentId 가 있는 스레드 댓글도 함께 등록하여 parent_id 컬럼 영속을 확인한다.
     */
    @Test
    void comment_roundtrip_add_list_resolve_softDelete() throws Exception {
        UUID slipId = seedOutboundSlip("2099/06/13-CMRT-" + SEQ.getAndIncrement()).getId();

        // 1. 댓글 등록 → 201
        String createResp = mvc.perform(post("/slips/{slipId}/collab/comments", slipId)
                        .header(USER_ID_HEADER, ACTOR_ID)
                        .header(USER_NAME_HEADER, "담당자홍길동")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "body", "출고 전표 확인 댓글",
                                "anchor", "memo"))))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.data.body").value("출고 전표 확인 댓글"))
                .andExpect(jsonPath("$.data.authorName").value("담당자홍길동"))
                .andExpect(jsonPath("$.data.anchor").value("memo"))
                .andExpect(jsonPath("$.data.status").value("OPEN"))
                .andReturn().getResponse().getContentAsString();
        UUID commentId = UUID.fromString((String) dataMap(createResp).get("id"));

        // 2. 스레드 자식 댓글 등록 (parentId 포함)
        mvc.perform(post("/slips/{slipId}/collab/comments", slipId)
                        .header(USER_ID_HEADER, ACTOR_ID)
                        .header(USER_NAME_HEADER, "담당자홍길동")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "body", "스레드 답글",
                                "parentId", commentId.toString()))))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.parentId").value(commentId.toString()))
                .andExpect(jsonPath("$.data.status").value("OPEN"));

        // 3. list → 2건 (부모 + 자식)
        mvc.perform(get("/slips/{slipId}/collab/comments", slipId)
                        .header(USER_ID_HEADER, ACTOR_ID)
                        .param("limit", "20"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.length()").value(2));

        // 4. resolve → RESOLVED
        mvc.perform(post("/slips/{slipId}/collab/comments/{commentId}/resolve", slipId, commentId)
                        .header(USER_ID_HEADER, ACTOR_ID))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("RESOLVED"));

        // 5. soft-delete 부모 댓글
        mvc.perform(delete("/slips/{slipId}/collab/comments/{commentId}", slipId, commentId)
                        .header(USER_ID_HEADER, ACTOR_ID))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true));

        // 6. list → 1건만 남음 (자식만 — 부모 soft-delete 됨)
        mvc.perform(get("/slips/{slipId}/collab/comments", slipId)
                        .header(USER_ID_HEADER, ACTOR_ID)
                        .param("limit", "20"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.length()").value(1));
    }

    /**
     * presence join/list endpoint 는 헤더 인증, 입력 검증, UUID 비노출 wire 계약, 조회 권한 가드를 지킨다.
     */
    @Test
    void presence_join_list_validates_header_input_payload_and_permission_guard() throws Exception {
        UUID unauthorizedSlipId = seedOutboundSlip("2099/06/13-PRS-401-" + SEQ.getAndIncrement()).getId();
        mvc.perform(post("/slips/{slipId}/collab/presence/join", unauthorizedSlipId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "sessionId", "presence-session-401",
                                "displayName", "presence tester"))))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("UNAUTHORIZED"));

        UUID invalidSlipId = seedOutboundSlip("2099/06/13-PRS-400-" + SEQ.getAndIncrement()).getId();
        mvc.perform(post("/slips/{slipId}/collab/presence/join", invalidSlipId)
                        .header(USER_ID_HEADER, ACTOR_ID)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("sessionId", ""))))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_INPUT"));

        UUID slipId = seedOutboundSlip("2099/06/13-PRS-OK-" + SEQ.getAndIncrement()).getId();
        String response = mvc.perform(post("/slips/{slipId}/collab/presence/join", slipId)
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

        mvc.perform(get("/slips/{slipId}/collab/presence", slipId)
                        .header(USER_ID_HEADER, ACTOR_ID))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.length()").value(1))
                .andExpect(jsonPath("$.data[0].sessionId").value("presence-session-1"))
                .andExpect(jsonPath("$.data[0].userId").doesNotExist());

        UUID deniedSlipId = seedOutboundSlip("2099/06/13-PRS-403-" + SEQ.getAndIncrement()).getId();
        when(dynamicPermissionClient.check(
                any(UUID.class), eq("slip.comments"), eq(PermissionAction.VIEW)))
                .thenReturn(false);
        when(dynamicPermissionClient.canView(any(), eq("slip.comments")))
                .thenReturn(false);

        mvc.perform(post("/slips/{slipId}/collab/presence/join", deniedSlipId)
                        .header(USER_ID_HEADER, ACTOR_ID)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("sessionId", "presence-session-denied"))))
                .andExpect(status().isForbidden());
    }

    @ParameterizedTest(name = "협업 {0} 상태의 거래처 없는 snapshot 복원은 거부")
    @EnumSource(value = SlipStatus.class, names = {
            "SENT", "ACCEPTED", "PROCESSING", "INSPECTING", "COMPLETED", "SHIPPING",
            "DELIVERED", "CONFIRMED", "REJECTED"
    })
    void collaborationRestoreCommittedSlipWithPartnerlessSnapshot_isRejected(SlipStatus status)
            throws Exception {
        Slip slip = seedOutboundSlip("2099/06/13-RESTORE-PARTNER-" + SEQ.getAndIncrement());
        slip.save();
        slip.send();
        ReflectionTestUtils.setField(slip, "status", status);
        slip = slipRepository.saveAndFlush(slip);
        UUID slipId = slip.getId();

        ObjectNode snapshot = (ObjectNode) objectMapper.readTree(collaborationPort.loadSnapshot(slipId));
        snapshot.putNull("partnerId");

        assertThatThrownBy(() -> collaborationPort.restoreSnapshot(
                        slipId, objectMapper.writeValueAsString(snapshot)))
                .isInstanceOf(com.samhanair.logis.common.exception.BusinessException.class)
                .hasMessage("거래처 없는 이력으로 커밋 전표를 복원할 수 없습니다");
        assertThat(slipRepository.findById(slipId).orElseThrow().getPartnerId()).isNotNull();
        assertThat(slipRepository.findById(slipId).orElseThrow().getStatus()).isEqualTo(status);
    }

    /**
     * coedit endpoint 는 Yjs update 를 opaque base64 로만 누적·중계하고 awareness 는 저장하지 않는다.
     *
     * <p>S1 snapshot 조회·awareness 는 VIEW, content update 는 CREATE 권한을 요구한다.
     */
    @Test
    void coedit_update_uses_create_guard_and_snapshot_awareness_use_view_guard() throws Exception {
        UUID slipId = seedOutboundSlip("2099/06/13-COEDIT-" + SEQ.getAndIncrement()).getId();

        mvc.perform(get("/slips/{slipId}/collab/coedit", slipId)
                        .header(USER_ID_HEADER, ACTOR_ID))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.updates.length()").value(0));

        mvc.perform(post("/slips/{slipId}/collab/coedit/update", slipId)
                        .header(USER_ID_HEADER, ACTOR_ID)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("update", "AQIDBA=="))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true));

        mvc.perform(get("/slips/{slipId}/collab/coedit", slipId)
                        .header(USER_ID_HEADER, ACTOR_ID))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.updates.length()").value(1))
                .andExpect(jsonPath("$.data.updates[0]").value("AQIDBA=="));

        mvc.perform(post("/slips/{slipId}/collab/coedit/awareness", slipId)
                        .header(USER_ID_HEADER, ACTOR_ID)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("awareness", "BQYH"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true));

        mvc.perform(get("/slips/{slipId}/collab/coedit", slipId)
                        .header(USER_ID_HEADER, ACTOR_ID))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.updates.length()").value(1));

        when(dynamicPermissionClient.check(
                any(UUID.class), eq("slip.comments"), eq(PermissionAction.CREATE)))
                .thenReturn(false);

        mvc.perform(post("/slips/{slipId}/collab/coedit/update", slipId)
                        .header(USER_ID_HEADER, ACTOR_ID)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("update", "AQIDBA=="))))
                .andExpect(status().isForbidden());
    }

    /* ====================================================================
     * 시나리오 2a — 수정완료 단일 필드 실 적용
     * slip.memo 실 변경 + EDIT revision 1건 캡처 검증
     * ==================================================================== */

    /**
     * 수정완료 1회 호출로 전표 memo 필드가 실제 변경되고 ACCEPTED 이력/audit/EDIT revision 이 생성되는지 검증한다.
     *
     * <p>{@code applyOverlayPatchBatch} 가 단일 잠금 가드 + 단일 EDIT revision 으로 묶이는지
     * SlipRevisionRepository 직접 조회로 단언한다.
     */
    @Test
    void commitEdit_applies_memo_and_records_accepted_history_audit_and_revision() throws Exception {
        Slip slip = seedOutboundSlip("2099/06/13-SUGG-A-" + SEQ.getAndIncrement());
        UUID slipId = slip.getId();
        int beforeRevCount = revisionRepository.findBySlipIdOrderByRevisionNoDesc(slipId).size();

        String response = mvc.perform(post("/slips/{slipId}/collab/edits", slipId)
                        .header(USER_ID_HEADER, ACTOR_ID)
                        .header(USER_NAME_HEADER, "수정자박과장")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "changeSet", "{\"memo\":{\"before\":\"초기 메모\",\"after\":\"새 메모 내용\"}}",
                                "reason", "메모 수정"))))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.edit.status").value("ACCEPTED"))
                .andExpect(jsonPath("$.data.edit.proposerName").value("수정자박과장"))
                .andExpect(jsonPath("$.data.edit.decidedByName").value("수정자박과장"))
                .andExpect(jsonPath("$.data.slip.memo").value("새 메모 내용"))
                .andReturn().getResponse().getContentAsString();
        @SuppressWarnings("unchecked")
        Map<String, Object> edit = (Map<String, Object>) ((Map<String, Object>) dataMap(response).get("edit"));
        UUID editId = UUID.fromString((String) edit.get("id"));

        slipRepository.flush();
        Slip reloaded = slipRepository.findById(slipId).orElseThrow();
        assertThat(reloaded.getMemo()).isEqualTo("새 메모 내용");

        var saved = suggestionRepository.findById(editId).orElseThrow();
        assertThat(saved.getStatus().name()).isEqualTo("ACCEPTED");
        assertThat(saved.getProposerName()).isEqualTo("수정자박과장");
        assertThat(saved.getDecidedByName()).isEqualTo("수정자박과장");

        var auditRows = auditLogRepository.findBySlipIdOrderByRevisionNoDescChangedAtDesc(slipId);
        assertThat(auditRows).anySatisfy(row -> {
            assertThat(row.getFieldName()).isEqualTo("memo");
            assertThat(row.getOldValue()).isEqualTo("초기 메모");
            assertThat(row.getNewValue()).isEqualTo("새 메모 내용");
            assertThat(row.getActorName()).isEqualTo("수정자박과장");
        });
        int afterRevCount = revisionRepository.findBySlipIdOrderByRevisionNoDesc(slipId).size();
        assertThat(afterRevCount).isEqualTo(beforeRevCount + 1);
    }

    /* ====================================================================
     * 시나리오 2b — 다중 필드 수정완료 → revision 1건만 (배치 단일 revision)
     * ==================================================================== */

    /**
     * 다중 필드(memo + shippingAddress)를 담은 수정완료가 EDIT revision 을 1건만 생성하는지 검증한다.
     */
    @Test
    void commitEdit_multiField_changeSet_produces_single_revision() throws Exception {
        Slip slip = seedOutboundSlip("2099/06/13-SUGG-MF-" + SEQ.getAndIncrement());
        UUID slipId = slip.getId();
        int beforeRevCount = revisionRepository.findBySlipIdOrderByRevisionNoDesc(slipId).size();

        mvc.perform(post("/slips/{slipId}/collab/edits", slipId)
                        .header(USER_ID_HEADER, ACTOR_ID)
                        .header(USER_NAME_HEADER, "수정자다중")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "changeSet",
                                "{\"memo\":{\"before\":\"초기 메모\",\"after\":\"M\"},\"shippingAddress\":{\"before\":null,\"after\":\"서울 강남구\"}}"))))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.edit.status").value("ACCEPTED"));

        int afterRevCount = revisionRepository.findBySlipIdOrderByRevisionNoDesc(slipId).size();
        assertThat(afterRevCount).isEqualTo(beforeRevCount + 1);

        slipRepository.flush();
        Slip reloaded = slipRepository.findById(slipId).orElseThrow();
        assertThat(reloaded.getMemo()).isEqualTo("M");
        assertThat(reloaded.getShippingAddress()).isEqualTo("서울 강남구");
        assertThat(auditLogRepository.findBySlipIdOrderByRevisionNoDescChangedAtDesc(slipId))
                .filteredOn(row -> row.getRevisionNo() == reloaded.getRevisionCount())
                .hasSize(2);
    }

    /**
     * 외부 알림은 저장 transaction 이 아직 끝나지 않은 시점에는 발화하지 않는다.
     * 테스트 transaction 이 롤백되므로 커밋되지 않은 변경의 phantom 알림도 없어야 한다.
     */
    @Test
    void commitEdit_doesNotNotifyBeforeTransactionCommit() throws Exception {
        UUID recipientId = UUID.randomUUID();
        Slip slip = seedCompletedOutboundSlip(
                "2099/06/13-NOTI-PRECOMMIT-" + SEQ.getAndIncrement(),
                recipientId.toString(), recipientId.toString());

        mvc.perform(post("/slips/{slipId}/collab/edits", slip.getId())
                        .header(USER_ID_HEADER, ACTOR_ID)
                        .header(USER_NAME_HEADER, "커밋전알림검증")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "changeSet", "{\"memo\":{\"before\":\"출고 메모\",\"after\":\"커밋전 메모\"}}"))))
                .andExpect(status().isCreated());

        verify(notificationClient, never()).sendUserPush(
                any(UUID.class), any(String.class), any(String.class));
    }

    /**
     * 같은 필드의 오래된 협업 초안은 최신 값을 되돌리지 않고 409 로 거부한다.
     *
     * <p>첫 번째 editor 가 저장한 뒤 두 번째 editor 가 같은 baseline 을 가진 초안을 저장하는
     * 순서를 고정한다. baseline 비교가 저장 전에 실행되므로 두 번째 제안/감사 이력도 생기지 않는다.
     */
    @Test
    void commitEdit_rejects_stale_same_field_without_lost_update() throws Exception {
        Slip slip = seedOutboundSlip("2099/06/13-COLLISION-SAME-" + SEQ.getAndIncrement());
        UUID slipId = slip.getId();
        String baseline = "초기 메모";

        mvc.perform(post("/slips/{slipId}/collab/edits", slipId)
                        .header(USER_ID_HEADER, ACTOR_ID)
                        .header(USER_NAME_HEADER, "첫번째편집자")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "changeSet", "{\"memo\":{\"before\":\"" + baseline
                                        + "\",\"after\":\"최신 메모\"}}"))))
                .andExpect(status().isCreated());

        mvc.perform(post("/slips/{slipId}/collab/edits", slipId)
                        .header(USER_ID_HEADER, SECOND_ACTOR_ID)
                        .header(USER_NAME_HEADER, "두번째편집자")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "changeSet", "{\"memo\":{\"before\":\"" + baseline
                                        + "\",\"after\":\"오래된 메모\"}}"))))
                .andExpect(status().isConflict());

        slipRepository.flush();
        assertThat(slipRepository.findById(slipId).orElseThrow().getMemo()).isEqualTo("최신 메모");
        assertThat(suggestionRepository.findByDocumentTypeAndDocumentIdOrderByCreatedAtDesc(
                CollabDocumentType.SLIP_OUTBOUND, slipId)).hasSize(1);
    }

    /**
     * 두 editor 가 같은 시점의 전표에서 서로 다른 필드를 저장하면 둘 다 병합된다.
     *
     * <p>전역 revision 잠금이 아니라 필드별 baseline 을 사용해야 하는 A4 회귀 방지 테스트다.
     */
    @Test
    void commitEdit_merges_concurrent_different_fields() throws Exception {
        Slip slip = seedOutboundSlip("2099/06/13-COL-DIF-" + SEQ.getAndIncrement());
        UUID slipId = slip.getId();

        mvc.perform(post("/slips/{slipId}/collab/edits", slipId)
                        .header(USER_ID_HEADER, ACTOR_ID)
                        .header(USER_NAME_HEADER, "메모편집자")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "changeSet", "{\"memo\":{\"before\":\"초기 메모\",\"after\":\"병합 메모\"}}"))))
                .andExpect(status().isCreated());

        mvc.perform(post("/slips/{slipId}/collab/edits", slipId)
                        .header(USER_ID_HEADER, SECOND_ACTOR_ID)
                        .header(USER_NAME_HEADER, "배송지편집자")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "changeSet", "{\"shippingAddress\":{\"before\":null,\"after\":\"서울 강남구\"}}"))))
                .andExpect(status().isCreated());

        slipRepository.flush();
        Slip reloaded = slipRepository.findById(slipId).orElseThrow();
        assertThat(reloaded.getMemo()).isEqualTo("병합 메모");
        assertThat(reloaded.getShippingAddress()).isEqualTo("서울 강남구");
        assertThat(suggestionRepository.findByDocumentTypeAndDocumentIdOrderByCreatedAtDesc(
                CollabDocumentType.SLIP_OUTBOUND, slipId)).hasSize(2);
    }

    /**
     * 같은 전표의 실제 병렬 저장은 첫 저장의 느린 notification 외부 호출 때문에 행 잠금을 기다리면 안 된다.
     *
     * <p>첫 요청의 notification 을 의도적으로 붙잡은 상태에서 둘째 요청을 별도 요청 스레드로 시작한다.
     * 둘째 요청이 3초 잠금 timeout 전에 다른 필드를 저장하지 못하면, R39 결함인 500/잠금 대기가 재현된다.
     */
    @Test
    @Transactional(propagation = Propagation.NOT_SUPPORTED)
    void commitEdit_parallelDifferentFields_doesNotWaitForSlowNotification() throws Exception {
        UUID recipientId = UUID.randomUUID();
        Slip slip = seedCompletedOutboundSlip(
                "2099/06/13-COL-PARALLEL-" + SEQ.getAndIncrement(),
                recipientId.toString(), recipientId.toString());
        CountDownLatch authStarted = new CountDownLatch(1);
        CountDownLatch releaseAuth = new CountDownLatch(1);
        CountDownLatch notificationStarted = new CountDownLatch(1);
        CountDownLatch releaseNotification = new CountDownLatch(1);
        when(authAccountLookupClient.findAccountIdByLoginId("collab-it-seeder"))
                .thenAnswer(invocation -> {
                    authStarted.countDown();
                    releaseAuth.await(10, TimeUnit.SECONDS);
                    return Optional.of(recipientId);
                });
        org.mockito.Mockito.doAnswer(invocation -> {
            notificationStarted.countDown();
            releaseNotification.await(10, TimeUnit.SECONDS);
            return null;
        }).when(notificationClient).sendUserPush(
                any(UUID.class), any(String.class), any(String.class));

        ExecutorService requests = Executors.newFixedThreadPool(2);
        try {
            Future<Integer> first = requests.submit(() -> mvc.perform(
                    post("/slips/{slipId}/collab/edits", slip.getId())
                            .with(user("slip-user").roles("MANAGER"))
                            .header(USER_ID_HEADER, ACTOR_ID)
                            .header(USER_NAME_HEADER, "병렬메모편집자")
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(objectMapper.writeValueAsString(Map.of(
                                    "changeSet", "{\"memo\":{\"before\":\"출고 메모\",\"after\":\"병렬 메모\"}}"))))
                    .andReturn().getResponse().getStatus());

            assertThat(authStarted.await(5, TimeUnit.SECONDS)).isTrue();
            releaseAuth.countDown();
            assertThat(notificationStarted.await(5, TimeUnit.SECONDS)).isTrue();

            Future<Integer> second = requests.submit(() -> mvc.perform(
                    post("/slips/{slipId}/collab/edits", slip.getId())
                            .with(user("slip-user").roles("MANAGER"))
                            .header(USER_ID_HEADER, SECOND_ACTOR_ID)
                            .header(USER_NAME_HEADER, "병렬배송지편집자")
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(objectMapper.writeValueAsString(Map.of(
                                    "changeSet", "{\"shippingAddress\":{\"before\":null,\"after\":\"서울 강남구\"}}"))))
                    .andReturn().getResponse().getStatus());

            assertThat(second.get(2, TimeUnit.SECONDS)).isEqualTo(201);
            releaseNotification.countDown();
            assertThat(first.get(5, TimeUnit.SECONDS)).isEqualTo(201);
        } finally {
            releaseAuth.countDown();
            releaseNotification.countDown();
            requests.shutdownNow();
        }

        Slip reloaded = slipRepository.findById(slip.getId()).orElseThrow();
        assertThat(reloaded.getMemo()).isEqualTo("병렬 메모");
        assertThat(reloaded.getShippingAddress()).isEqualTo("서울 강남구");
    }

    /**
     * 수정완료가 성공하면 해당 전표의 기여자와 다음 결재자에게 변경 요약 푸시를 보낸다.
     *
     * <p>수신자 소스는 작성자(createdBy/requesterId), 버전 이력 actor, 수정 이력 proposer/decider,
     * 댓글 author, 출고자/검수자다. username 식별자는 auth-service by-login 내부 조회로 UUID 를
     * 변환하고, 현재 수정자는 self skip 된다. 본문에는 수정자 실명과 before→after 변경 요약만 포함하고
     * 내부 UUID 는 노출하지 않는다.
     */
    @Test
    @Transactional(propagation = Propagation.NOT_SUPPORTED)
    void commitEdit_notifies_contributors_and_next_approvers_after_successful_history_save()
            throws Exception {
        UUID requesterAccountId = UUID.randomUUID();
        UUID createdByAccountId = UUID.randomUUID();
        UUID revisionActorId = UUID.randomUUID();
        UUID suggestionActorId = UUID.randomUUID();
        UUID commentAuthorId = UUID.randomUUID();
        UUID editorId = UUID.fromString(ACTOR_ID);
        UUID inspectorId = UUID.randomUUID();
        Slip slip = seedCompletedOutboundSlip(
                "2099/06/13-NOTI-A-" + SEQ.getAndIncrement(),
                ACTOR_ID,
                inspectorId.toString());
        revisionRepository.save(SlipRevision.of(
                slip.getId(), 77, SlipRevisionType.EDIT, null,
                slip.getSlipNo(), TEST_DATE, slip.toSnapshot(),
                revisionActorId, "이전수정자", null));
        SlipCollabSuggestion previousEdit = SlipCollabSuggestion.create(
                CollabDocumentType.SLIP_OUTBOUND, slip.getId(),
                suggestionActorId, "이전제안자", "{\"memo\":{\"after\":\"이전\"}}", null);
        previousEdit.accept(suggestionActorId, "이전제안자");
        suggestionRepository.save(previousEdit);
        commentRepository.save(SlipCollabComment.create(
                CollabDocumentType.SLIP_OUTBOUND, slip.getId(),
                "memo", commentAuthorId, "댓글작성자", "확인했습니다", null));
        when(authAccountLookupClient.findAccountIdByLoginId("collab-it-seeder"))
                .thenReturn(Optional.of(requesterAccountId));
        when(authAccountLookupClient.findAccountIdByLoginId("slip-user"))
                .thenReturn(Optional.of(createdByAccountId));

        mvc.perform(post("/slips/{slipId}/collab/edits", slip.getId())
                        .header(USER_ID_HEADER, ACTOR_ID)
                        .header(USER_NAME_HEADER, "수정자박과장")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "changeSet", "{\"memo\":{\"before\":\"출고 메모\",\"after\":\"알림 메모\"}}"))))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.edit.status").value("ACCEPTED"));

        verify(notificationClient, org.mockito.Mockito.timeout(5000)).sendUserPush(eq(requesterAccountId),
                eq("[전표 수정] " + slip.getSlipNo()), org.mockito.ArgumentMatchers.anyString());
        verify(notificationClient, org.mockito.Mockito.timeout(5000)).sendUserPush(eq(createdByAccountId),
                eq("[전표 수정] " + slip.getSlipNo()), org.mockito.ArgumentMatchers.anyString());
        verify(notificationClient, org.mockito.Mockito.timeout(5000)).sendUserPush(eq(revisionActorId),
                eq("[전표 수정] " + slip.getSlipNo()), org.mockito.ArgumentMatchers.anyString());
        verify(notificationClient, org.mockito.Mockito.timeout(5000)).sendUserPush(eq(suggestionActorId),
                eq("[전표 수정] " + slip.getSlipNo()), org.mockito.ArgumentMatchers.anyString());
        verify(notificationClient, org.mockito.Mockito.timeout(5000)).sendUserPush(eq(commentAuthorId),
                eq("[전표 수정] " + slip.getSlipNo()), org.mockito.ArgumentMatchers.anyString());
        verify(notificationClient, org.mockito.Mockito.timeout(5000)).sendUserPush(eq(inspectorId),
                eq("[전표 수정] " + slip.getSlipNo()), org.mockito.ArgumentMatchers.anyString());
        verify(notificationClient, never()).sendUserPush(eq(editorId),
                org.mockito.ArgumentMatchers.anyString(), org.mockito.ArgumentMatchers.anyString());
        verify(authAccountLookupClient, org.mockito.Mockito.timeout(5000))
                .findAccountIdByLoginId("collab-it-seeder");
        verify(authAccountLookupClient, org.mockito.Mockito.timeout(5000))
                .findAccountIdByLoginId("slip-user");

        ArgumentCaptor<String> bodyCaptor = ArgumentCaptor.forClass(String.class);
        verify(notificationClient, org.mockito.Mockito.timeout(5000).times(6)).sendUserPush(
                org.mockito.ArgumentMatchers.any(UUID.class),
                eq("[전표 수정] " + slip.getSlipNo()),
                bodyCaptor.capture());
        assertThat(bodyCaptor.getAllValues()).allSatisfy(body -> {
            assertThat(body).contains("수정자박과장");
            assertThat(body).contains("memo");
            assertThat(body).contains("출고 메모");
            assertThat(body).contains("알림 메모");
            assertThat(body).doesNotContain(ACTOR_ID);
            assertThat(body.length()).isLessThanOrEqualTo(2000);
        });
    }

    /**
     * 전표에 출고자와 검수자가 아직 기록되지 않았다면 수정완료 알림을 보내지 않는다.
     *
     * <p>명시적 의도 박제:
     * <ul>
     *   <li>{@code dispatcherUserId}/{@code inspectorUserId} = null (DRAFT 전표)</li>
     *   <li>기여자 username({@code "collab-it-seeder"}, {@code "slip-user"})도
     *       by-login 조회가 empty 를 반환하도록 stub → resolve 실패 → 알림 없음</li>
     * </ul>
     * 이로써 테스트가 "stub 누락으로 silent-empty" 가 아닌 "의도된 no-notification 경로"임을
     * 명시적으로 검증한다 (vacuous pass 방지 — §7 협업 Round C P2 fix).
     */
    @Test
    @Transactional(propagation = Propagation.NOT_SUPPORTED)
    void commitEdit_skips_notification_when_dispatcher_and_inspector_are_null() throws Exception {
        // by-login 조회 결과를 명시적으로 empty 로 고정 — stub 누락 vacuous pass 방지
        when(authAccountLookupClient.findAccountIdByLoginId("collab-it-seeder"))
                .thenReturn(Optional.empty());
        when(authAccountLookupClient.findAccountIdByLoginId("slip-user"))
                .thenReturn(Optional.empty());

        Slip slip = seedOutboundSlip("2099/06/13-NOTI-N-" + SEQ.getAndIncrement());

        mvc.perform(post("/slips/{slipId}/collab/edits", slip.getId())
                        .header(USER_ID_HEADER, ACTOR_ID)
                        .header(USER_NAME_HEADER, "수정자무알림")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "changeSet", "{\"memo\":{\"before\":\"초기 메모\",\"after\":\"미출고 수정\"}}"))))
                .andExpect(status().isCreated());

        // 알림 수신자 없음: dispatcher/inspector null + 기여자 by-login empty
        verify(notificationClient, never()).sendUserPush(
                org.mockito.ArgumentMatchers.any(UUID.class),
                org.mockito.ArgumentMatchers.anyString(),
                org.mockito.ArgumentMatchers.anyString());
        // by-login 조회가 실제로 시도됐는지 검증 (stub 경로 실증)
        verify(authAccountLookupClient, org.mockito.Mockito.timeout(5000))
                .findAccountIdByLoginId("collab-it-seeder");
        verify(authAccountLookupClient, org.mockito.Mockito.timeout(5000))
                .findAccountIdByLoginId("slip-user");
    }

    /**
     * 출고자와 검수자가 같은 user-id 이면 같은 전표 수정 알림을 1회만 보낸다.
     */
    @Test
    @Transactional(propagation = Propagation.NOT_SUPPORTED)
    void commitEdit_deduplicates_notification_when_dispatcher_equals_inspector() throws Exception {
        UUID workerId = UUID.randomUUID();
        Slip slip = seedCompletedOutboundSlip(
                "2099/06/13-NOTI-D-" + SEQ.getAndIncrement(),
                workerId.toString(),
                workerId.toString());

        mvc.perform(post("/slips/{slipId}/collab/edits", slip.getId())
                        .header(USER_ID_HEADER, ACTOR_ID)
                        .header(USER_NAME_HEADER, "수정자중복")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "changeSet", "{\"memo\":{\"before\":\"출고 메모\",\"after\":\"중복 제거\"}}"))))
                .andExpect(status().isCreated());

        verify(notificationClient, org.mockito.Mockito.timeout(5000).times(1)).sendUserPush(eq(workerId),
                eq("[전표 수정] " + slip.getSlipNo()),
                org.mockito.ArgumentMatchers.anyString());
    }

    /* ====================================================================
     * 시나리오 4 — 권한 deny 403 ([enforcement-real-http-test])
     * ==================================================================== */

    /**
     * 무효 actor 로 수정완료를 시도하면 403 이 반환되고 수정 이력은 저장되지 않는다.
     */
    @Test
    void commitEdit_with_invalid_actor_returns_403_and_persists_nothing() throws Exception {
        UUID slipId = seedOutboundSlip("2099/06/13-EDIT-NA-" + SEQ.getAndIncrement()).getId();

        mvc.perform(post("/slips/{slipId}/collab/edits", slipId)
                        .header(USER_ID_HEADER, "not-a-uuid")
                        .header(USER_NAME_HEADER, "무효수정자")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "changeSet", "{\"memo\":{\"before\":\"초기 메모\",\"after\":\"거부\"}}"))))
                .andExpect(status().isForbidden());

        assertThat(suggestionRepository.findByDocumentTypeAndDocumentIdOrderByCreatedAtDesc(
                CollabDocumentType.SLIP_OUTBOUND, slipId)).isEmpty();
    }

    /**
     * {@code slip.comments} CREATE 권한이 거부된 사용자는 댓글 등록 시 403 을 받는다.
     */
    @Test
    void comment_add_denied_when_permission_false() throws Exception {
        UUID slipId = seedOutboundSlip("2099/06/13-PERM-CMT-" + SEQ.getAndIncrement()).getId();

        // dynamicPermissionClient.check(slip.comments, CREATE) = false
        when(dynamicPermissionClient.check(
                any(UUID.class), eq("slip.comments"), eq(PermissionAction.CREATE)))
                .thenReturn(false);
        when(dynamicPermissionClient.canEdit(any(), eq("slip.comments")))
                .thenReturn(false);

        mvc.perform(post("/slips/{slipId}/collab/comments", slipId)
                        .header(USER_ID_HEADER, ACTOR_ID)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("body", "권한 없음"))))
                .andExpect(status().isForbidden());
    }

    /**
     * {@code slip.audit-overlay} UPDATE 권한이 거부된 사용자는 수정완료 시 403 을 받는다.
     *
     * <p>403 은 컨트롤러 {@code @RequirePermission(slip.audit-overlay, UPDATE)} Aspect 에서 발생한다.
     * 포트의 {@code canPropose} 는 권한 client 를 호출하지 않으며(무효 actor 가드만 수행),
     * Aspect 가 먼저 403 으로 요청을 차단하므로 포트까지 진입하지 않는다.
     * (실서버 QA 회귀 락인 — 2026-06-13 permissionClient 이중 체크 제거 fix)
     */
    @Test
    void commitEdit_denied_when_permission_false() throws Exception {
        UUID slipId = seedOutboundSlip("2099/06/13-PERM-SUG-" + SEQ.getAndIncrement()).getId();

        // @RequirePermission Aspect 가 check/canEdit 를 참조하여 403 을 반환한다
        when(dynamicPermissionClient.check(
                any(UUID.class), eq("slip.audit-overlay"), eq(PermissionAction.UPDATE)))
                .thenReturn(false);
        when(dynamicPermissionClient.canEdit(any(), eq("slip.audit-overlay")))
                .thenReturn(false);

        mvc.perform(post("/slips/{slipId}/collab/edits", slipId)
                        .header(USER_ID_HEADER, ACTOR_ID)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "changeSet", "{\"memo\":{\"before\":\"초기 메모\",\"after\":\"거부될 제안\"}}"))))
                .andExpect(status().isForbidden());
    }

    /* ====================================================================
     * 시나리오 5 — OUTBOUND/INBOUND documentType 분기
     * 저장된 documentType 을 repository 로 직접 확인
     * ==================================================================== */

    /**
     * OUTBOUND 전표에 등록된 수정 이력의 documentType 이 SLIP_OUTBOUND 인지 검증한다.
     */
    @Test
    void commitEdit_on_outbound_slip_stores_SLIP_OUTBOUND_documentType() throws Exception {
        UUID slipId = seedOutboundSlip("2099/06/13-DT-OUT-" + SEQ.getAndIncrement()).getId();

        String response = mvc.perform(post("/slips/{slipId}/collab/edits", slipId)
                        .header(USER_ID_HEADER, ACTOR_ID)
                        .header(USER_NAME_HEADER, "타입확인자")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "changeSet", "{\"memo\":{\"before\":\"초기 메모\",\"after\":\"아웃바운드\"}}"))))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        @SuppressWarnings("unchecked")
        UUID editId = UUID.fromString((String) ((Map<String, Object>) dataMap(response).get("edit")).get("id"));

        var saved = suggestionRepository.findById(editId).orElseThrow();
        assertThat(saved.getDocumentType()).isEqualTo(CollabDocumentType.SLIP_OUTBOUND);
    }

    /**
     * INBOUND 전표에 등록된 수정 이력의 documentType 이 SLIP_INBOUND 인지 검증한다.
     */
    @Test
    void commitEdit_on_inbound_slip_stores_SLIP_INBOUND_documentType() throws Exception {
        UUID slipId = seedInboundSlip("2099/06/13-DT-IN-" + SEQ.getAndIncrement()).getId();

        String response = mvc.perform(post("/slips/{slipId}/collab/edits", slipId)
                        .header(USER_ID_HEADER, ACTOR_ID)
                        .header(USER_NAME_HEADER, "인바운드타입")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "changeSet", "{\"memo\":{\"before\":\"입고 메모\",\"after\":\"인바운드 메모\"}}"))))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        @SuppressWarnings("unchecked")
        UUID editId = UUID.fromString((String) ((Map<String, Object>) dataMap(response).get("edit")).get("id"));

        var saved = suggestionRepository.findById(editId).orElseThrow();
        assertThat(saved.getDocumentType()).isEqualTo(CollabDocumentType.SLIP_INBOUND);
    }

    /* ====================================================================
     * 시나리오 6 — CHECK 제약 실 INSERT 거부 ([enum-expansion-check-constraint])
     * ==================================================================== */

    /**
     * slip_collab_comments 에 유효하지 않은 document_type 을 네이티브 INSERT 하면
     * DB CHECK 제약이 DataIntegrityViolationException 을 던져야 한다.
     */
    @Test
    void check_constraint_rejects_invalid_document_type_in_comments() {
        UUID invalidTypeId = UUID.randomUUID();
        UUID authorId = UUID.fromString(ACTOR_ID);

        assertThatThrownBy(() -> jdbcTemplate.update(
                "INSERT INTO slip_collab_comments " +
                        "(id, document_type, document_id, anchor, author_id, author_name, body, status, " +
                        "created_at, created_by, is_deleted) VALUES " +
                        "(gen_random_uuid(), 'INVALID_TYPE', ?, NULL, ?, 'tester', '본문', 'OPEN', " +
                        "NOW(), 'system', false)",
                invalidTypeId, authorId))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    /**
     * slip_collab_comments 에 유효하지 않은 status 를 네이티브 INSERT 하면
     * DB CHECK 제약이 DataIntegrityViolationException 을 던져야 한다.
     */
    @Test
    void check_constraint_rejects_invalid_status_in_comments() {
        UUID slipId = seedOutboundSlip("2099/06/13-CHK-CMT-" + SEQ.getAndIncrement()).getId();
        UUID authorId = UUID.fromString(ACTOR_ID);

        assertThatThrownBy(() -> jdbcTemplate.update(
                "INSERT INTO slip_collab_comments " +
                        "(id, document_type, document_id, anchor, author_id, author_name, body, status, " +
                        "created_at, created_by, is_deleted) VALUES " +
                        "(gen_random_uuid(), 'SLIP_OUTBOUND', ?, NULL, ?, 'tester', '본문', 'BAD', " +
                        "NOW(), 'system', false)",
                slipId, authorId))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    /**
     * slip_collab_suggestions 에 유효하지 않은 status 를 네이티브 INSERT 하면
     * DB CHECK 제약이 DataIntegrityViolationException 을 던져야 한다.
     */
    @Test
    void check_constraint_rejects_invalid_status_in_suggestions() {
        UUID slipId = seedOutboundSlip("2099/06/13-CHK-SUG-" + SEQ.getAndIncrement()).getId();
        UUID proposerId = UUID.fromString(ACTOR_ID);

        assertThatThrownBy(() -> jdbcTemplate.update(
                "INSERT INTO slip_collab_suggestions " +
                        "(id, document_type, document_id, proposer_id, proposer_name, change_set, status, " +
                        "version, created_at, created_by, is_deleted) VALUES " +
                        "(gen_random_uuid(), 'SLIP_OUTBOUND', ?, ?, '테스터', '{\"f\":{\"before\":null,\"after\":\"v\"}}', 'BAD', " +
                        "0, NOW(), 'system', false)",
                slipId, proposerId))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    /* ====================================================================
     * 시나리오 7 — 타 전표 스코프 격리
     * 전표 A 의 댓글을 전표 B 경로로 DELETE → 404
     * ==================================================================== */

    /**
     * 전표 A 에 등록된 댓글을 전표 B 의 경로로 삭제 시도하면 404 가 반환된다.
     *
     * <p>SlipCollabController 의 documentType/documentId 일치 검사({@code ensureSuggestionExistsInPath} 유사)가
     * 댓글 삭제 경로에서도 스코프를 격리하는지 검증한다.
     */
    @Test
    void delete_comment_through_other_slip_scope_returns_404() throws Exception {
        UUID slipA = seedOutboundSlip("2099/06/13-SCOPE-A-" + SEQ.getAndIncrement()).getId();
        UUID slipB = seedOutboundSlip("2099/06/13-SCOPE-B-" + SEQ.getAndIncrement()).getId();

        // 전표 A 에 댓글 등록
        String createResp = mvc.perform(post("/slips/{slipId}/collab/comments", slipA)
                        .header(USER_ID_HEADER, ACTOR_ID)
                        .header(USER_NAME_HEADER, "작성자")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("body", "전표A 댓글"))))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        UUID commentId = UUID.fromString((String) dataMap(createResp).get("id"));

        // 전표 B 경로로 삭제 시도 → 404
        mvc.perform(delete("/slips/{slipId}/collab/comments/{commentId}", slipB, commentId)
                        .header(USER_ID_HEADER, ACTOR_ID))
                .andExpect(status().isNotFound());
    }

    /**
     * 전표 A 의 수정 이력은 전표 B 의 {@code /collab/edits} 목록에 섞이지 않는다.
     */
    @Test
    void list_edits_isolated_by_slip_scope() throws Exception {
        UUID slipA = seedOutboundSlip("2099/06/13-SCOPE-SUG-A-" + SEQ.getAndIncrement()).getId();
        UUID slipB = seedOutboundSlip("2099/06/13-SCOPE-SUG-B-" + SEQ.getAndIncrement()).getId();

        mvc.perform(post("/slips/{slipId}/collab/edits", slipA)
                        .header(USER_ID_HEADER, ACTOR_ID)
                        .header(USER_NAME_HEADER, "스코프수정자")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "changeSet", "{\"memo\":{\"before\":\"초기 메모\",\"after\":\"전표A 수정\"}}"))))
                .andExpect(status().isCreated());

        mvc.perform(get("/slips/{slipId}/collab/edits", slipB)
                        .header(USER_ID_HEADER, ACTOR_ID))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.length()").value(0));
    }

    /* ====================================================================
     * 시나리오 8 — 협업 수정완료 잠금 정책 (개발책임자 2026-06-13 정책 정정)
     * ==================================================================== */

    /**
     * 시나리오 8(a) — CONFIRMED 전표 수정완료는 APPROVED 수정요청 없이 즉시 성공한다.
     *
     * <p>개발책임자 2026-06-13 정책 정정: 수정완료는 확정/완료 전표의 공인(authorized) 수정 경로.
     * 편집자(권한자)가 곧 승인자이므로 별도 APPROVED 수정요청 없이 즉시 적용된다({@code guardCollabModifiable}).
     * 직접 편집({@code guardLockPolicy} — CONFIRMED = APPROVED 요청 필요)과의 차이를 실증한다.
     *
     * <p>실증 계약:
     * <ul>
     *   <li>CONFIRMED 슬립 + APPROVED 수정요청 없음 → 수정완료 → 201 성공</li>
     *   <li>memo 실 변경 반영 확인</li>
     *   <li>audit revision_no 정확히 1 증가 + EDIT revision 정확히 1건 추가 (recordBatch 단일 계약 유지)</li>
     * </ul>
     */
    @Test
    void commitEdit_on_confirmed_slip_without_approval_succeeds_collab_is_authorized_path()
            throws Exception {
        Slip slip = seedConfirmedInboundSlip("2099/06/13-COLLAB-A-" + SEQ.getAndIncrement());
        UUID slipId = slip.getId();
        int beforeAuditRevision = slip.getRevisionCount();
        int beforeEditRevisions = revisionRepository.findBySlipIdOrderByRevisionNoDesc(slipId).size();
        // APPROVED 수정요청 생성 없음 — 새 정책에서는 불필요

        mvc.perform(post("/slips/{slipId}/collab/edits", slipId)
                        .header(USER_ID_HEADER, ACTOR_ID)
                        .header(USER_NAME_HEADER, "확정수정자")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "changeSet", "{\"memo\":{\"before\":\"입고 메모\",\"after\":\"확정 전표 공인 수정\"}}"))))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.edit.status").value("ACCEPTED"));

        // memo 실 변경 확인
        slipRepository.flush();
        Slip reloaded = slipRepository.findById(slipId).orElseThrow();
        assertThat(reloaded.getMemo()).isEqualTo("확정 전표 공인 수정");

        // audit revision_no 정확히 1 증가 + EDIT revision 1건 추가 (recordBatch 단일 계약 유지)
        assertThat(reloaded.getRevisionCount()).isEqualTo(beforeAuditRevision + 1);
        assertThat(revisionRepository.findBySlipIdOrderByRevisionNoDesc(slipId))
                .hasSize(beforeEditRevisions + 1);
    }

    /**
     * 시나리오 8(b) — 물리 종결(DELIVERED) 전표 수정완료는 409 로 거부된다.
     *
     * <p>개발책임자 2026-06-13 정책 정정: SHIPPING/DELIVERED/CANCELED/REJECTED 만 물리 종결 차단
     * ({@code guardCollabModifiable} / {@code COLLAB_LOCKED}).
     * 409 후 수정 이력은 저장되지 않고 전표 memo 는 불변이어야 한다.
     *
     * <p>출고전표 전이 체인: DRAFT→save→send→accept→process→complete(INSPECTING)
     * →inspect(COMPLETED)→ship(SHIPPING)→deliver(DELIVERED).
     */
    @Test
    void commitEdit_on_delivered_slip_returns_409_physical_terminal_guard() throws Exception {
        Slip slip = seedDeliveredOutboundSlip("2099/06/13-COLLAB-B-" + SEQ.getAndIncrement());
        UUID slipId = slip.getId();

        mvc.perform(post("/slips/{slipId}/collab/edits", slipId)
                        .header(USER_ID_HEADER, ACTOR_ID)
                        .header(USER_NAME_HEADER, "배송완료수정자")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "changeSet", "{\"memo\":{\"before\":\"출고 메모\",\"after\":\"배송완료 변경 시도\"}}"))))
                .andExpect(status().isConflict());

        assertThat(suggestionRepository.findByDocumentTypeAndDocumentIdOrderByCreatedAtDesc(
                CollabDocumentType.SLIP_OUTBOUND, slipId)).isEmpty();
        Slip reloaded = slipRepository.findById(slipId).orElseThrow();
        assertThat(reloaded.getMemo()).isEqualTo("출고 메모");
    }

    /* ====================================================================
     * 시나리오 9 — 수정완료 changeSet 구조 검증
     * ==================================================================== */

    /**
     * 구조가 잘못된 changeSet 은 수정완료 시점에 400 으로 조기 거부되고 저장되지 않는다.
     *
     * <p>(a) 비JSON 문자열 — 기존에는 jsonb cast 실패로 500. (b) entry 가 before/after object 가
     * 아닌 scalar — 둘 다 {@code SlipDocumentCollaborationPort.validateChangeSet} 이 저장 전에
     * 400 으로 거부해야 한다.
     */
    @Test
    void commitEdit_malformed_changeSet_returns_400_and_persists_nothing() throws Exception {
        UUID slipId = seedOutboundSlip("2099/06/13-MAL-" + SEQ.getAndIncrement()).getId();

        // (a) 비JSON 문자열 → 400 (jsonb cast 500 차단)
        mvc.perform(post("/slips/{slipId}/collab/edits", slipId)
                        .header(USER_ID_HEADER, ACTOR_ID)
                        .header(USER_NAME_HEADER, "불량수정자")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "changeSet", "not-json"))))
                .andExpect(status().isBadRequest());

        // (b) 구조 불량 — after object 가 아닌 scalar → 400 (poison suggestion 차단)
        mvc.perform(post("/slips/{slipId}/collab/edits", slipId)
                        .header(USER_ID_HEADER, ACTOR_ID)
                        .header(USER_NAME_HEADER, "불량수정자")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "changeSet", "{\"memo\":\"x\"}"))))
                .andExpect(status().isBadRequest());

        // 잘못된 수정은 저장 자체가 차단 — 해당 전표 수정 이력 0건
        assertThat(suggestionRepository.findByDocumentTypeAndDocumentIdOrderByCreatedAtDesc(
                CollabDocumentType.SLIP_OUTBOUND, slipId)).isEmpty();
    }

    /* ====================================================================
     * 내부 유틸리티
     * ==================================================================== */

    /**
     * OUTBOUND(출고) 전표를 실 DB 에 저장하고 반환한다.
     *
     * <p>DRAFT 상태 — 자유 단계로 잠금 없이 accept/patch 가 가능하다.
     *
     * @param slipNo 전표번호 (유니크, 미래일자 권장)
     * @return 저장된 전표
     */
    private Slip seedOutboundSlip(String slipNo) {
        Slip slip = Slip.createOutbound(
                slipNo,
                TEST_DATE,
                SEQ.getAndIncrement(),
                UUID.randomUUID(),   // sourceWarehouseId
                UUID.randomUUID(),   // destinationWarehouseId
                UUID.randomUUID(),   // partnerId
                "테스트거래처",
                DeliveryTag.DAY,
                "초기 메모",
                "collab-it-seeder");
        return slipRepository.save(slip);
    }

    /**
     * INBOUND(입고) 전표를 실 DB 에 저장하고 반환한다.
     *
     * <p>DRAFT 상태 — SLIP_INBOUND documentType 분기 검증용.
     *
     * @param slipNo 전표번호 (유니크, 미래일자 권장)
     * @return 저장된 전표
     */
    private Slip seedInboundSlip(String slipNo) {
        Slip slip = Slip.createInbound(
                slipNo,
                TEST_DATE,
                SEQ.getAndIncrement(),
                UUID.randomUUID(),   // destinationWarehouseId
                UUID.randomUUID(),   // partnerId
                "테스트입고거래처",
                DeliveryTag.RETURN,
                "입고 메모",
                "collab-it-seeder");
        return slipRepository.save(slip);
    }

    /**
     * DELIVERED(배송완료, 물리 종결) 단계까지 전이된 OUTBOUND(출고) 전표를 실 DB 에 저장하고 반환한다.
     *
     * <p>출고전표 전이 체인: {@code save→send→accept→process→complete(→INSPECTING)
     * →inspect(→COMPLETED)→ship(→SHIPPING)→deliver(→DELIVERED)}.
     * {@code COLLAB_LOCKED} 포함 상태 — 협업 수정완료가 {@code guardCollabModifiable} 에 의해 차단됨을
     * 시나리오 8(b) 에서 실증한다.
     *
     * @param slipNo 전표번호 (유니크, 미래일자 권장)
     * @return DELIVERED 상태로 저장된 전표
     */
    private Slip seedDeliveredOutboundSlip(String slipNo) {
        Slip slip = Slip.createOutbound(
                slipNo,
                TEST_DATE,
                SEQ.getAndIncrement(),
                UUID.randomUUID(),   // sourceWarehouseId
                UUID.randomUUID(),   // destinationWarehouseId
                UUID.randomUUID(),   // partnerId
                "테스트출고거래처",
                DeliveryTag.DAY,
                "출고 메모",
                "collab-it-seeder");
        slip.save();
        slip.send();
        slip.accept("수락자시스템");
        slip.process();
        slip.complete();           // PROCESSING → INSPECTING
        slip.inspect("검수자시스템"); // INSPECTING → COMPLETED
        slip.ship();               // COMPLETED → SHIPPING
        slip.deliver();            // SHIPPING → DELIVERED
        return slipRepository.save(slip);
    }

    /**
     * COMPLETED(검수완료) 단계까지 전이된 OUTBOUND 전표를 저장하고 반환한다.
     *
     * <p>{@code accept(dispatcherUserId)} 로 출고자, {@code inspect(inspectorUserId)} 로 검수자를
     * 도메인 필드에 기록한다. 수정완료 알림 대상 resolve 테스트에서 사용한다.
     *
     * @param slipNo 전표번호
     * @param dispatcherUserId 출고자 user-id 문자열
     * @param inspectorUserId 검수자 user-id 문자열
     * @return COMPLETED 상태로 저장된 전표
     */
    private Slip seedCompletedOutboundSlip(String slipNo, String dispatcherUserId,
                                           String inspectorUserId) {
        Slip slip = Slip.createOutbound(
                slipNo,
                TEST_DATE,
                SEQ.getAndIncrement(),
                UUID.randomUUID(),
                UUID.randomUUID(),
                UUID.randomUUID(),
                "테스트출고거래처",
                DeliveryTag.DAY,
                "출고 메모",
                "collab-it-seeder");
        slip.save();
        slip.send();
        slip.accept(dispatcherUserId);
        slip.process();
        slip.complete();
        slip.inspect(inspectorUserId);
        return slipRepository.save(slip);
    }

    /**
     * CONFIRMED(잠금) 단계까지 전이된 INBOUND(입고) 전표를 실 DB 에 저장하고 반환한다.
     *
     * <p>입고전표 전이 체인 {@code save→send→accept→process→complete→inspect→confirm} 으로
     * CONFIRMED 에 도달한다. 시나리오 8(a) 에서 APPROVED 수정요청 없이도 협업 수락이 성공함을 실증한다
     * (개발책임자 2026-06-13 정책 정정 — {@code guardCollabModifiable} 적용).
     *
     * @param slipNo 전표번호 (유니크, 미래일자 권장)
     * @return CONFIRMED 상태로 저장된 전표
     */
    private Slip seedConfirmedInboundSlip(String slipNo) {
        Slip slip = seedInboundSlip(slipNo);
        slip.save();
        slip.send();
        slip.accept("수락자시스템");
        slip.process();
        slip.complete();            // PROCESSING → INSPECTING
        slip.inspect("검수자시스템");  // INSPECTING → COMPLETED
        slip.confirm();             // COMPLETED → CONFIRMED (입고전표)
        return slipRepository.save(slip);
    }

    /**
     * ApiResponse JSON 에서 {@code data} 오브젝트를 Map 으로 추출한다.
     *
     * @param responseBody MockMvc 응답 본문 (JSON 문자열)
     * @return data 필드의 Map
     */
    @SuppressWarnings("unchecked")
    private Map<String, Object> dataMap(String responseBody) throws Exception {
        return (Map<String, Object>) objectMapper.readValue(responseBody, Map.class).get("data");
    }
}
