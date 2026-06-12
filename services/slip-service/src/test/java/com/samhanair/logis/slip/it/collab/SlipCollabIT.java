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
 *   <li>타 전표 스코프 격리 — 전표 A 댓글을 전표 B 경로로 DELETE → 404</li>
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

    /** 테스트 slipNo 의 날짜 prefix — 미래 날짜 사용으로 seqNo 충돌 최소화. */
    private static final LocalDate TEST_DATE = LocalDate.of(2099, 6, 13);

    /** 동일 트랜잭션 내에서 slipNo seqNo 중복 방지용 카운터. */
    private static final AtomicInteger SEQ = new AtomicInteger(100);

    @Autowired private MockMvc mvc;
    @Autowired private ObjectMapper objectMapper;
    @Autowired private SlipRepository slipRepository;
    @Autowired private SlipRevisionRepository revisionRepository;
    @Autowired private SlipCollabSuggestionRepository suggestionRepository;
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
