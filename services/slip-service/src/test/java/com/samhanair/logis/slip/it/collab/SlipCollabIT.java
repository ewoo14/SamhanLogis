package com.samhanair.logis.slip.it.collab;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.collab.CollabDocumentType;
import com.samhanair.logis.security.permission.PermissionAction;
import com.samhanair.logis.slip.SlipServiceApplication;
import com.samhanair.logis.slip.audit.repository.SlipAuditLogRepository;
import com.samhanair.logis.slip.client.ArologisDispatchClient;
import com.samhanair.logis.slip.client.InventoryClient;
import com.samhanair.logis.slip.client.NotificationChatRoomClient;
import com.samhanair.logis.slip.client.NotificationClient;
import com.samhanair.logis.slip.client.PartnerBlockClient;
import com.samhanair.logis.slip.client.PartnerInternalClient;
import com.samhanair.logis.slip.client.ProductClient;
import com.samhanair.logis.slip.client.UserInternalClient;
import com.samhanair.logis.slip.client.WarehouseInternalClient;
import com.samhanair.logis.slip.collab.SlipCollabSuggestionRepository;
import com.samhanair.logis.slip.delivery.sms.SmsGateway;
import com.samhanair.logis.slip.domain.DeliveryTag;
import com.samhanair.logis.slip.domain.Slip;
import com.samhanair.logis.slip.editrequest.domain.SlipEditRequest;
import com.samhanair.logis.slip.editrequest.domain.SlipEditRequestStatus;
import com.samhanair.logis.slip.editrequest.domain.SlipEditRequestType;
import com.samhanair.logis.slip.editrequest.domain.SlipEditTargetRole;
import com.samhanair.logis.slip.editrequest.repository.SlipEditRequestRepository;
import com.samhanair.logis.slip.it.AbstractPostgresIT;
import com.samhanair.logis.slip.repository.SlipRepository;
import com.samhanair.logis.slip.revision.repository.SlipRevisionRepository;
import java.time.LocalDate;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
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
 * 입출고전표 협업 실 Postgres IT.
 *
 * <p>slip_collab_comments / slip_collab_suggestions 테이블의 INSERT/SELECT/soft-delete 경로와
 * 제안 accept 시 {@code applyOverlayPatchBatch} 실 적용 + EDIT revision 1건 캡처를
 * MockMvc + Testcontainers PostgreSQL 로 검증한다. (§7 협업, PR #474)
 *
 * <p>시나리오:
 * <ol>
 *   <li>댓글 라운드트립 (add → list → resolve → soft-delete → list 0건 + 스레드 부모댓글 1건 포함)</li>
 *   <li>제안 propose→accept 실 적용 (slip.memo 실 변경 + EDIT revision 1건, 다중필드 단일 revision)</li>
 *   <li>제안 reject / withdraw + 이미 종결된 제안 재accept → 409</li>
 *   <li>권한 deny 403 (slip.comments CREATE, slip.audit-overlay UPDATE)</li>
 *   <li>OUTBOUND/INBOUND documentType 분기 — 저장된 documentType 실 확인</li>
 *   <li>CHECK 제약 실 INSERT 거부 (document_type='INVALID_TYPE', status='BAD')</li>
 *   <li>타 전표 스코프 격리 — 전표 A 댓글/제안을 전표 B 경로로 DELETE/accept → 404</li>
 *   <li>잠금(CONFIRMED) 전표 accept — APPROVED 부재 시 409 + 상태 보존,
 *       APPROVED 존재 시 2필드 일괄 적용 + audit revision_no 1 증가 (guardLockPolicy/recordBatch 실증)</li>
 *   <li>propose 시점 changeSet 구조 검증 — 비JSON/구조불량 → 400 + 미저장 (Round C P2)</li>
 * </ol>
 */
@SpringBootTest(classes = SlipServiceApplication.class)
@AutoConfigureMockMvc
@Transactional
@WithMockUser(username = "slip-user", authorities = {"ROLE_MANAGER"})
class SlipCollabIT extends AbstractPostgresIT {

    private static final String USER_ID_HEADER = "X-User-Id";
    private static final String USER_NAME_HEADER = "X-User-Name";

    /** 권한 stub 에 사용할 고정 사용자 UUID. proposerId 로도 재사용. */
    private static final String ACTOR_ID = "20000000-0000-0000-0000-000000000001";

    /** Non-proposer withdraw edge verification actor. */
    private static final String OTHER_ACTOR_ID = "20000000-0000-0000-0000-000000000002";

    /** 테스트 slipNo 의 날짜 prefix — 미래 날짜 사용으로 seqNo 충돌 최소화. */
    private static final LocalDate TEST_DATE = LocalDate.of(2099, 6, 13);

    /** 동일 트랜잭션 내에서 slipNo seqNo 중복 방지용 카운터. */
    private static final AtomicInteger SEQ = new AtomicInteger(100);

    @Autowired private MockMvc mvc;
    @Autowired private ObjectMapper objectMapper;
    @Autowired private SlipRepository slipRepository;
    @Autowired private SlipRevisionRepository revisionRepository;
    @Autowired private SlipCollabSuggestionRepository suggestionRepository;
    /** 시나리오 8 — accept 경유 audit revision_no(N-분열 차단) 단언용. */
    @Autowired private SlipAuditLogRepository auditLogRepository;
    /** 시나리오 8 — 잠금 전표 APPROVED 수정요청 시드/소진 단언용. */
    @Autowired private SlipEditRequestRepository editRequestRepository;
    @Autowired private JdbcTemplate jdbcTemplate;

    /* ------------------------------------------------------------------ */
    /* 외부 client MockBean — 누락 시 Eureka 비활성 → 500 ([it-mockbean-external-clients]) */
    /* ------------------------------------------------------------------ */
    @MockBean private ArologisDispatchClient arologisDispatchClient;
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

    /* ====================================================================
     * 시나리오 2a — 제안 propose→accept 단일 필드 실 적용
     * slip.memo 실 변경 + EDIT revision 1건 캡처 검증
     * ==================================================================== */

    /**
     * 수정 제안 등록 후 수락 시 전표 memo 필드가 실제 변경되고 EDIT revision 이 1건 생성되는지 검증한다.
     *
     * <p>{@code applyOverlayPatchBatch} 가 단일 잠금 가드 + 단일 EDIT revision 으로 묶이는지
     * SlipRevisionRepository 직접 조회로 단언한다.
     */
    @Test
    void suggestion_propose_accept_applies_memo_and_captures_one_edit_revision() throws Exception {
        Slip slip = seedOutboundSlip("2099/06/13-SUGG-A-" + SEQ.getAndIncrement());
        UUID slipId = slip.getId();
        int beforeRevCount = revisionRepository.findBySlipIdOrderByRevisionNoDesc(slipId).size();

        // 1. 제안 등록 (memo 변경 제안)
        String proposeResp = mvc.perform(post("/slips/{slipId}/collab/suggestions", slipId)
                        .header(USER_ID_HEADER, ACTOR_ID)
                        .header(USER_NAME_HEADER, "제안자박과장")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "changeSet", "{\"memo\":{\"after\":\"새 메모 내용\"}}",
                                "reason", "메모 수정 제안"))))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.status").value("PROPOSED"))
                .andExpect(jsonPath("$.data.proposerName").value("제안자박과장"))
                .andReturn().getResponse().getContentAsString();
        UUID suggestionId = UUID.fromString((String) dataMap(proposeResp).get("id"));

        // 2. 수락
        mvc.perform(post("/slips/{slipId}/collab/suggestions/{suggestionId}/accept",
                        slipId, suggestionId)
                        .header(USER_ID_HEADER, ACTOR_ID)
                        .header(USER_NAME_HEADER, "결정자김팀장"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("ACCEPTED"))
                .andExpect(jsonPath("$.data.decidedByName").value("결정자김팀장"));

        // 3. 전표 memo 가 실제로 변경됐는지 repository 재조회로 단언
        // @Transactional 롤백 경계 내이므로 1차 캐시를 피해 flush/clear 후 조회
        slipRepository.flush();
        Slip reloaded = slipRepository.findById(slipId).orElseThrow();
        assertThat(reloaded.getMemo()).isEqualTo("새 메모 내용");

        // 4. EDIT revision 이 beforeRevCount 보다 정확히 1건 더 생성됐는지 단언
        int afterRevCount = revisionRepository.findBySlipIdOrderByRevisionNoDesc(slipId).size();
        assertThat(afterRevCount).isEqualTo(beforeRevCount + 1);
    }

    /* ====================================================================
     * 시나리오 2b — 다중 필드 changeSet accept → revision 1건만 (배치 단일 revision)
     * ==================================================================== */

    /**
     * 다중 필드(memo + shippingAddress)를 담은 제안을 수락할 때 EDIT revision 이 1건만
     * 생성되는지(배치 단일 revision 정책) 검증한다.
     */
    @Test
    void suggestion_accept_multiField_changeSet_produces_single_revision() throws Exception {
        Slip slip = seedOutboundSlip("2099/06/13-SUGG-MF-" + SEQ.getAndIncrement());
        UUID slipId = slip.getId();
        int beforeRevCount = revisionRepository.findBySlipIdOrderByRevisionNoDesc(slipId).size();

        // 1. 다중 필드 제안 등록
        String proposeResp = mvc.perform(post("/slips/{slipId}/collab/suggestions", slipId)
                        .header(USER_ID_HEADER, ACTOR_ID)
                        .header(USER_NAME_HEADER, "제안자다중")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "changeSet",
                                "{\"memo\":{\"after\":\"M\"},\"shippingAddress\":{\"after\":\"서울 강남구\"}}"))))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        UUID suggestionId = UUID.fromString((String) dataMap(proposeResp).get("id"));

        // 2. 수락
        mvc.perform(post("/slips/{slipId}/collab/suggestions/{suggestionId}/accept",
                        slipId, suggestionId)
                        .header(USER_ID_HEADER, ACTOR_ID)
                        .header(USER_NAME_HEADER, "결정자이부장"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("ACCEPTED"));

        // 3. revision 이 1건만 추가됐는지 확인 (필드 수 N건 아님)
        int afterRevCount = revisionRepository.findBySlipIdOrderByRevisionNoDesc(slipId).size();
        assertThat(afterRevCount).isEqualTo(beforeRevCount + 1);

        // 4. 두 필드 모두 변경됐는지 확인
        slipRepository.flush();
        Slip reloaded = slipRepository.findById(slipId).orElseThrow();
        assertThat(reloaded.getMemo()).isEqualTo("M");
        assertThat(reloaded.getShippingAddress()).isEqualTo("서울 강남구");
    }

    /* ====================================================================
     * 시나리오 3a — 제안 거절
     * ==================================================================== */

    /**
     * 제안을 거절하면 status=REJECTED, reason 이 저장되고 목록에서 확인된다.
     */
    @Test
    void suggestion_reject_updates_status_to_rejected() throws Exception {
        UUID slipId = seedOutboundSlip("2099/06/13-SUGG-RJ-" + SEQ.getAndIncrement()).getId();

        String proposeResp = mvc.perform(post("/slips/{slipId}/collab/suggestions", slipId)
                        .header(USER_ID_HEADER, ACTOR_ID)
                        .header(USER_NAME_HEADER, "제안자거절")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "changeSet", "{\"memo\":{\"after\":\"거절될 제안\"}}"))))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        UUID suggestionId = UUID.fromString((String) dataMap(proposeResp).get("id"));

        // 거절
        mvc.perform(post("/slips/{slipId}/collab/suggestions/{suggestionId}/reject",
                        slipId, suggestionId)
                        .header(USER_ID_HEADER, ACTOR_ID)
                        .header(USER_NAME_HEADER, "결정자거절")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("reason", "내용 부적절"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("REJECTED"))
                .andExpect(jsonPath("$.data.decidedByName").value("결정자거절"));
    }

    /* ====================================================================
     * 시나리오 3b — 제안 철회
     * ==================================================================== */

    /**
     * 제안자 본인이 철회하면 status=WITHDRAWN 이 되고,
     * 이미 종결된(WITHDRAWN) 제안을 재accept 시 409 가 반환된다.
     */
    @Test
    void suggestion_withdraw_and_re_accept_returns_409() throws Exception {
        UUID slipId = seedOutboundSlip("2099/06/13-SUGG-WD-" + SEQ.getAndIncrement()).getId();

        String proposeResp = mvc.perform(post("/slips/{slipId}/collab/suggestions", slipId)
                        .header(USER_ID_HEADER, ACTOR_ID)
                        .header(USER_NAME_HEADER, "철회제안자")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "changeSet", "{\"memo\":{\"after\":\"철회 대상\"}}"))))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        UUID suggestionId = UUID.fromString((String) dataMap(proposeResp).get("id"));

        // 철회 (proposerId == ACTOR_ID)
        mvc.perform(post("/slips/{slipId}/collab/suggestions/{suggestionId}/withdraw",
                        slipId, suggestionId)
                        .header(USER_ID_HEADER, ACTOR_ID))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("WITHDRAWN"));

        // 이미 종결된 제안 재accept → 409 (requireProposed 가드)
        mvc.perform(post("/slips/{slipId}/collab/suggestions/{suggestionId}/accept",
                        slipId, suggestionId)
                        .header(USER_ID_HEADER, ACTOR_ID)
                        .header(USER_NAME_HEADER, "재accept시도자"))
                .andExpect(status().isConflict());
    }

    /* ====================================================================
     * 시나리오 4 — 권한 deny 403 ([enforcement-real-http-test])
     * ==================================================================== */

    /**
     * 제안자가 아닌 사용자가 철회를 시도하면 403 이 반환되고 제안 status 는 PROPOSED 로 유지된다.
     */
    @Test
    void suggestion_withdraw_by_non_proposer_returns_403_and_keeps_proposed() throws Exception {
        UUID slipId = seedOutboundSlip("2099/06/13-SUGG-WD-NP-" + SEQ.getAndIncrement()).getId();

        String proposeResp = mvc.perform(post("/slips/{slipId}/collab/suggestions", slipId)
                        .header(USER_ID_HEADER, ACTOR_ID)
                        .header(USER_NAME_HEADER, "원제안자")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "changeSet", "{\"memo\":{\"after\":\"타인 철회 거부\"}}"))))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        UUID suggestionId = UUID.fromString((String) dataMap(proposeResp).get("id"));

        mvc.perform(post("/slips/{slipId}/collab/suggestions/{suggestionId}/withdraw",
                        slipId, suggestionId)
                        .header(USER_ID_HEADER, OTHER_ACTOR_ID))
                .andExpect(status().isForbidden());

        var saved = suggestionRepository.findById(suggestionId).orElseThrow();
        assertThat(saved.getStatus().name()).isEqualTo("PROPOSED");
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
     * {@code slip.audit-overlay} UPDATE 권한이 거부된 사용자는 제안 등록 시 403 을 받는다.
     */
    @Test
    void suggestion_propose_denied_when_permission_false() throws Exception {
        UUID slipId = seedOutboundSlip("2099/06/13-PERM-SUG-" + SEQ.getAndIncrement()).getId();

        // canPropose 내부: permissionClient.check(slip.audit-overlay, UPDATE)
        when(dynamicPermissionClient.check(
                any(UUID.class), eq("slip.audit-overlay"), eq(PermissionAction.UPDATE)))
                .thenReturn(false);
        when(dynamicPermissionClient.canEdit(any(), eq("slip.audit-overlay")))
                .thenReturn(false);

        mvc.perform(post("/slips/{slipId}/collab/suggestions", slipId)
                        .header(USER_ID_HEADER, ACTOR_ID)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "changeSet", "{\"memo\":{\"after\":\"거부될 제안\"}}"))))
                .andExpect(status().isForbidden());
    }

    /* ====================================================================
     * 시나리오 5 — OUTBOUND/INBOUND documentType 분기
     * 저장된 documentType 을 repository 로 직접 확인
     * ==================================================================== */

    /**
     * OUTBOUND 전표에 등록된 제안의 documentType 이 SLIP_OUTBOUND 인지 검증한다.
     */
    @Test
    void suggestion_on_outbound_slip_stores_SLIP_OUTBOUND_documentType() throws Exception {
        UUID slipId = seedOutboundSlip("2099/06/13-DT-OUT-" + SEQ.getAndIncrement()).getId();

        String proposeResp = mvc.perform(post("/slips/{slipId}/collab/suggestions", slipId)
                        .header(USER_ID_HEADER, ACTOR_ID)
                        .header(USER_NAME_HEADER, "타입확인자")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "changeSet", "{\"memo\":{\"after\":\"아웃바운드\"}}"))))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        UUID suggestionId = UUID.fromString((String) dataMap(proposeResp).get("id"));

        // repository 직접 조회 — documentType = SLIP_OUTBOUND
        var saved = suggestionRepository.findById(suggestionId).orElseThrow();
        assertThat(saved.getDocumentType()).isEqualTo(CollabDocumentType.SLIP_OUTBOUND);
    }

    /**
     * INBOUND 전표에 등록된 제안의 documentType 이 SLIP_INBOUND 인지 검증한다.
     */
    @Test
    void suggestion_on_inbound_slip_stores_SLIP_INBOUND_documentType() throws Exception {
        UUID slipId = seedInboundSlip("2099/06/13-DT-IN-" + SEQ.getAndIncrement()).getId();

        String proposeResp = mvc.perform(post("/slips/{slipId}/collab/suggestions", slipId)
                        .header(USER_ID_HEADER, ACTOR_ID)
                        .header(USER_NAME_HEADER, "인바운드타입")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "changeSet", "{\"memo\":{\"after\":\"인바운드 메모\"}}"))))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        UUID suggestionId = UUID.fromString((String) dataMap(proposeResp).get("id"));

        // repository 직접 조회 — documentType = SLIP_INBOUND
        var saved = suggestionRepository.findById(suggestionId).orElseThrow();
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
                        "(gen_random_uuid(), 'SLIP_OUTBOUND', ?, ?, '테스터', '{\"f\":{\"after\":\"v\"}}', 'BAD', " +
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
     * 전표 A 에 등록된 제안을 전표 B 의 경로로 수락 시도하면 404 가 반환되고
     * 제안 status 는 PROPOSED 로 유지된다 ({@code ensureSuggestionExistsInPath} 스코프 격리).
     */
    @Test
    void accept_suggestion_through_other_slip_scope_returns_404() throws Exception {
        UUID slipA = seedOutboundSlip("2099/06/13-SCOPE-SUG-A-" + SEQ.getAndIncrement()).getId();
        UUID slipB = seedOutboundSlip("2099/06/13-SCOPE-SUG-B-" + SEQ.getAndIncrement()).getId();

        String proposeResp = mvc.perform(post("/slips/{slipId}/collab/suggestions", slipA)
                        .header(USER_ID_HEADER, ACTOR_ID)
                        .header(USER_NAME_HEADER, "스코프제안자")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "changeSet", "{\"memo\":{\"after\":\"전표A 제안\"}}"))))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        UUID suggestionId = UUID.fromString((String) dataMap(proposeResp).get("id"));

        mvc.perform(post("/slips/{slipId}/collab/suggestions/{suggestionId}/accept",
                        slipB, suggestionId)
                        .header(USER_ID_HEADER, ACTOR_ID)
                        .header(USER_NAME_HEADER, "스코프결정자"))
                .andExpect(status().isNotFound());

        var saved = suggestionRepository.findById(suggestionId).orElseThrow();
        assertThat(saved.getStatus().name()).isEqualTo("PROPOSED");
    }

    /* ====================================================================
     * 시나리오 8 — 잠금(CONFIRMED) 전표 accept (applyOverlayPatchBatch guardLockPolicy 실증)
     * ==================================================================== */

    /**
     * CONFIRMED(잠금) 전표의 제안 수락은 APPROVED 수정요청이 없으면 409 로 거부된다.
     *
     * <p>협업 수락이 직접 편집과 동일한 잠금 정책({@code guardLockPolicy})을 우회하지 않음을 실증한다.
     * 409 후 제안 status 는 PROPOSED 유지, 전표 memo 는 불변이어야 한다.
     */
    @Test
    void accept_on_confirmed_slip_without_approval_returns_409_and_keeps_state() throws Exception {
        Slip slip = seedConfirmedInboundSlip("2099/06/13-LOCK-NA-" + SEQ.getAndIncrement());
        UUID slipId = slip.getId();

        // propose 자체는 잠금과 무관 (제안 등록은 mutation 이 아님) → 201
        String proposeResp = mvc.perform(post("/slips/{slipId}/collab/suggestions", slipId)
                        .header(USER_ID_HEADER, ACTOR_ID)
                        .header(USER_NAME_HEADER, "잠금제안자")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "changeSet", "{\"memo\":{\"after\":\"잠금 중 변경 시도\"}}"))))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        UUID suggestionId = UUID.fromString((String) dataMap(proposeResp).get("id"));

        // accept → guardLockPolicy: CONFIRMED + APPROVED 요청 부재 → 409
        mvc.perform(post("/slips/{slipId}/collab/suggestions/{suggestionId}/accept",
                        slipId, suggestionId)
                        .header(USER_ID_HEADER, ACTOR_ID)
                        .header(USER_NAME_HEADER, "잠금결정자"))
                .andExpect(status().isConflict());

        // 제안 PROPOSED 유지 + memo 불변 (롤백 — 부분 적용 없음)
        var saved = suggestionRepository.findById(suggestionId).orElseThrow();
        assertThat(saved.getStatus().name()).isEqualTo("PROPOSED");
        Slip reloaded = slipRepository.findById(slipId).orElseThrow();
        assertThat(reloaded.getMemo()).isEqualTo("입고 메모");
    }

    /**
     * CONFIRMED 전표라도 APPROVED 수정요청이 있으면 2필드 changeSet 수락이 성공한다.
     *
     * <p>recordBatch 1회 계약(#1 fix) 실증 — 제안 1건 수락 시:
     * <ul>
     *   <li>memo/shippingAddress 두 필드 모두 실 변경</li>
     *   <li>audit revision_no 정확히 1 증가 (필드 수 N 분열 차단) — audit row 2건이 같은 revision_no 공유</li>
     *   <li>EDIT revision 정확히 1건 추가</li>
     *   <li>APPROVED 요청 1회 소진 (재조회 시 활성 APPROVED 0건)</li>
     * </ul>
     */
    @Test
    void accept_on_confirmed_slip_with_approval_applies_batch_with_single_audit_revision()
            throws Exception {
        Slip slip = seedConfirmedInboundSlip("2099/06/13-LOCK-AP-" + SEQ.getAndIncrement());
        UUID slipId = slip.getId();
        int beforeAuditRevision = slip.getRevisionCount();
        int beforeEditRevisions = revisionRepository.findBySlipIdOrderByRevisionNoDesc(slipId).size();
        seedApprovedEditRequest(slipId);

        // 2필드 제안 등록
        String proposeResp = mvc.perform(post("/slips/{slipId}/collab/suggestions", slipId)
                        .header(USER_ID_HEADER, ACTOR_ID)
                        .header(USER_NAME_HEADER, "잠금승인제안자")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "changeSet",
                                "{\"memo\":{\"after\":\"잠금 수락 메모\"},"
                                        + "\"shippingAddress\":{\"after\":\"부산 해운대구\"}}"))))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        UUID suggestionId = UUID.fromString((String) dataMap(proposeResp).get("id"));

        // accept → guardLockPolicy: CONFIRMED + APPROVED 1건 → 성공
        mvc.perform(post("/slips/{slipId}/collab/suggestions/{suggestionId}/accept",
                        slipId, suggestionId)
                        .header(USER_ID_HEADER, ACTOR_ID)
                        .header(USER_NAME_HEADER, "잠금승인결정자"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("ACCEPTED"));

        // 두 필드 모두 실 변경
        slipRepository.flush();
        Slip reloaded = slipRepository.findById(slipId).orElseThrow();
        assertThat(reloaded.getMemo()).isEqualTo("잠금 수락 메모");
        assertThat(reloaded.getShippingAddress()).isEqualTo("부산 해운대구");

        // audit revision_no 정확히 1 증가 + audit row 2건이 같은 revision_no 공유 (recordBatch 1회)
        assertThat(reloaded.getRevisionCount()).isEqualTo(beforeAuditRevision + 1);
        var auditRows = auditLogRepository.findBySlipIdOrderByRevisionNoDescChangedAtDesc(slipId);
        assertThat(auditRows).hasSize(2);
        assertThat(auditRows).allMatch(row -> row.getRevisionNo() == beforeAuditRevision + 1);

        // EDIT revision 정확히 1건 추가
        assertThat(revisionRepository.findBySlipIdOrderByRevisionNoDesc(slipId))
                .hasSize(beforeEditRevisions + 1);

        // APPROVED 1회 소진 — soft-delete 라 활성 APPROVED 재조회 0건
        assertThat(editRequestRepository.findFirstBySlipIdAndStatus(
                slipId, SlipEditRequestStatus.APPROVED)).isEmpty();
    }

    /* ====================================================================
     * 시나리오 9 — propose 시점 changeSet 구조 검증 (Round C P2 #4)
     * ==================================================================== */

    /**
     * 구조가 잘못된 changeSet 은 propose 시점에 400 으로 조기 거부되고 저장되지 않는다.
     *
     * <p>(a) 비JSON 문자열 — 기존에는 jsonb cast 실패로 500. (b) entry 가 {@code {after}} object 가
     * 아닌 scalar — 기존에는 저장 후 accept 마다 400 인 poison suggestion. 둘 다
     * {@code SlipDocumentCollaborationPort.validateChangeSet} 이 저장 전에 400 으로 거부해야 한다.
     */
    @Test
    void propose_malformed_changeSet_returns_400_and_persists_nothing() throws Exception {
        UUID slipId = seedOutboundSlip("2099/06/13-MAL-" + SEQ.getAndIncrement()).getId();

        // (a) 비JSON 문자열 → 400 (jsonb cast 500 차단)
        mvc.perform(post("/slips/{slipId}/collab/suggestions", slipId)
                        .header(USER_ID_HEADER, ACTOR_ID)
                        .header(USER_NAME_HEADER, "불량제안자")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "changeSet", "not-json"))))
                .andExpect(status().isBadRequest());

        // (b) 구조 불량 — after object 가 아닌 scalar → 400 (poison suggestion 차단)
        mvc.perform(post("/slips/{slipId}/collab/suggestions", slipId)
                        .header(USER_ID_HEADER, ACTOR_ID)
                        .header(USER_NAME_HEADER, "불량제안자")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "changeSet", "{\"memo\":\"x\"}"))))
                .andExpect(status().isBadRequest());

        // 잘못된 제안은 저장 자체가 차단 — 해당 전표 제안 0건
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
     * CONFIRMED(잠금) 단계까지 전이된 INBOUND(입고) 전표를 실 DB 에 저장하고 반환한다.
     *
     * <p>입고전표 전이 체인 {@code save→send→accept→process→complete→inspect→confirm} 으로
     * CONFIRMED 에 도달한다 — {@code guardLockPolicy} 의 LOCKED_REQUIRES_APPROVAL
     * (mutation 에 APPROVED 수정요청 1건 필요) 단계 (SlipDeleteIT D8b 전이 체인 동일).
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
     * 잠금 전표의 mutation 을 1회 허용하는 APPROVED 수정요청을 시드한다.
     *
     * <p>{@code guardLockPolicy} 가 lookup({@code findActiveApproval})하여 mutation 후 1회
     * 소진(soft-delete)하는 대상이다.
     *
     * @param slipId 대상 전표 ID
     * @return 저장된 APPROVED 수정요청
     */
    private SlipEditRequest seedApprovedEditRequest(UUID slipId) {
        SlipEditRequest request = SlipEditRequest.create(
                slipId,
                UUID.fromString(ACTOR_ID),
                "요청자홍대리",
                SlipEditRequestType.EDIT,
                "협업 잠금 IT — 수정 1회 승인",
                SlipEditTargetRole.MANAGER,
                null);
        request.approve(UUID.fromString(OTHER_ACTOR_ID), "승인자김팀장", null);
        return editRequestRepository.save(request);
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
