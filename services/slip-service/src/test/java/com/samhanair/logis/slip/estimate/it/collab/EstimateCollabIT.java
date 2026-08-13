package com.samhanair.logis.slip.estimate.it.collab;

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
import com.samhanair.logis.slip.client.AuthAccountLookupClient;
import com.samhanair.logis.slip.client.InventoryClient;
import com.samhanair.logis.slip.client.NotificationChatRoomClient;
import com.samhanair.logis.slip.client.NotificationClient;
import com.samhanair.logis.slip.client.PartnerBlockClient;
import com.samhanair.logis.slip.client.PartnerInternalClient;
import com.samhanair.logis.slip.client.ProductClient;
import com.samhanair.logis.slip.client.UserInternalClient;
import com.samhanair.logis.slip.client.WarehouseInternalClient;
import com.samhanair.logis.slip.estimate.collab.EstimateCollabComment;
import com.samhanair.logis.slip.estimate.collab.EstimateCollabCommentRepository;
import com.samhanair.logis.slip.estimate.collab.EstimateCollabSuggestion;
import com.samhanair.logis.slip.estimate.web.dto.OpaqueUuidCodec;
import com.samhanair.logis.slip.estimate.collab.EstimateCollabSuggestionRepository;
import com.samhanair.logis.slip.estimate.web.EstimatePermissionGuard;
import com.samhanair.logis.slip.estimate.domain.Estimate;
import com.samhanair.logis.slip.estimate.domain.EstimateLine;
import com.samhanair.logis.slip.estimate.repository.EstimateRepository;
import com.samhanair.logis.slip.estimate.revision.domain.EstimateRevision;
import com.samhanair.logis.slip.estimate.revision.domain.EstimateRevisionType;
import com.samhanair.logis.slip.estimate.revision.repository.EstimateRevisionRepository;
import com.samhanair.logis.slip.it.AbstractPostgresIT;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
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
 * 견적 협업 실 Postgres IT.
 *
 * <p>견적 수정완료는 1-인 즉시 커밋 모델이다. memo/validUntil/라인 note 만 변경하며,
 * QUOTE_REJECTED/QUOTE_CONVERTED 는 물리 종결로 409 차단한다.
 */
@SpringBootTest(classes = SlipServiceApplication.class)
@AutoConfigureMockMvc
@Transactional
@WithMockUser(username = "estimate-user", authorities = {"ROLE_SALES"})
class EstimateCollabIT extends AbstractPostgresIT {

    private static final String USER_ID_HEADER = "X-User-Id";
    private static final String USER_NAME_HEADER = "X-User-Name";
    private static final String SYSTEM_MASTER_HEADER = "X-Is-System-Master";
    private static final String ACTOR_ID = "20000000-0000-0000-0000-000000000301";
    private static final AtomicInteger SEQ = new AtomicInteger(300);

    @Autowired private MockMvc mvc;
    @Autowired private ObjectMapper objectMapper;
    @Autowired private EstimateRepository estimateRepository;
    @Autowired private EstimateRevisionRepository revisionRepository;
    @Autowired private EstimateCollabSuggestionRepository suggestionRepository;
    @Autowired private EstimateCollabCommentRepository commentRepository;
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
        revisionRepository.deleteAll();
        jdbcTemplate.update("DELETE FROM estimate_lines");
        estimateRepository.deleteAll();
        lenient().when(dynamicPermissionClient.canView(anyString(), anyString())).thenReturn(true);
        lenient().when(dynamicPermissionClient.canEdit(anyString(), anyString())).thenReturn(true);
        lenient().when(dynamicPermissionClient.check(any(UUID.class), anyString(), any(PermissionAction.class)))
                .thenReturn(true);
    }

    /** 댓글 등록, 조회, 해결, 삭제가 실 DB 에 반영되는지 검증한다. */
    @Test
    void comment_roundtrip_add_list_resolve_softDelete() throws Exception {
        UUID estimateId = seedEstimate("CMRT").getId();

        String createResp = mvc.perform(post("/slips/estimates/{estimateId}/collab/comments", estimateId)
                        .header(USER_ID_HEADER, ACTOR_ID)
                        .header(USER_NAME_HEADER, "견적담당자")
                        .header(SYSTEM_MASTER_HEADER, "true")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "body", "유효기간 확인 댓글",
                                "anchor", "validUntil"))))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.data.body").value("유효기간 확인 댓글"))
                .andExpect(jsonPath("$.data.authorName").value("견적담당자"))
                .andExpect(jsonPath("$.data.anchor").value("validUntil"))
                .andExpect(jsonPath("$.data.status").value("OPEN"))
                .andReturn().getResponse().getContentAsString();
        UUID commentId = OpaqueUuidCodec.decode((String) dataMap(createResp).get("id"));

        mvc.perform(get("/slips/estimates/{estimateId}/collab/comments", estimateId)
                        .header(USER_ID_HEADER, ACTOR_ID)
                        .header(SYSTEM_MASTER_HEADER, "true")
                        .param("limit", "20"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.length()").value(1));

        mvc.perform(post("/slips/estimates/{estimateId}/collab/comments/{commentId}/resolve",
                        estimateId, commentId)
                        .header(USER_ID_HEADER, ACTOR_ID)
                        .header(SYSTEM_MASTER_HEADER, "true"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("RESOLVED"));

        mvc.perform(delete("/slips/estimates/{estimateId}/collab/comments/{commentId}",
                        estimateId, commentId)
                        .header(USER_ID_HEADER, ACTOR_ID)
                        .header(SYSTEM_MASTER_HEADER, "true"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true));

        mvc.perform(get("/slips/estimates/{estimateId}/collab/comments", estimateId)
                        .header(USER_ID_HEADER, ACTOR_ID)
                        .header(SYSTEM_MASTER_HEADER, "true")
                        .param("limit", "20"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.length()").value(0));
    }

    /** ACCEPTED 견적의 memo/validUntil/라인 note 수정완료가 실 적용되고 ACCEPTED 이력이 남는지 검증한다. */
    @Test
    void commitEdit_onAcceptedEstimate_appliesMemoValidUntilAndLineNoteAndRecordsHistory()
            throws Exception {
        Estimate estimate = seedAcceptedEstimate("EDIT");

        String response = mvc.perform(post("/slips/estimates/{estimateId}/collab/edits", estimate.getId())
                        .header(USER_ID_HEADER, ACTOR_ID)
                        .header(USER_NAME_HEADER, "수정자박과장")
                        .header(SYSTEM_MASTER_HEADER, "true")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "changeSet",
                                "{\"memo\":{\"after\":\"새 견적 비고\"},\"validUntil\":{\"after\":\"2099-07-10\"},"
                                        + "\"line.1.note\":{\"after\":\"새 1번 라인 메모\"}}",
                                "reason", "확정 견적 정정"))))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.edit.status").value("ACCEPTED"))
                .andExpect(jsonPath("$.data.edit.proposerName").value("수정자박과장"))
                .andExpect(jsonPath("$.data.edit.decidedByName").value("수정자박과장"))
                .andExpect(jsonPath("$.data.estimate.memo").value("새 견적 비고"))
                .andExpect(jsonPath("$.data.estimate.validUntil").value("2099-07-10"))
                .andExpect(jsonPath("$.data.estimate.lines[0].note").value("새 1번 라인 메모"))
                .andExpect(jsonPath("$.data.estimate.lines[1].note").value("초기 2번 메모"))
                .andReturn().getResponse().getContentAsString();

        @SuppressWarnings("unchecked")
        Map<String, Object> edit = (Map<String, Object>) dataMap(response).get("edit");
        UUID editId = OpaqueUuidCodec.decode((String) edit.get("id"));

        estimateRepository.flush();
        Estimate reloaded = estimateRepository.findById(estimate.getId()).orElseThrow();
        assertThat(reloaded.getMemo()).isEqualTo("새 견적 비고");
        assertThat(reloaded.getValidUntil()).isEqualTo(LocalDate.of(2099, 7, 10));
        assertThat(reloaded.getLines().get(0).getNote()).isEqualTo("새 1번 라인 메모");
        assertThat(reloaded.getLines().get(0).getQuantity()).isEqualTo(2);
        assertThat(reloaded.getLines().get(0).getUnitPrice()).isEqualByComparingTo("120000");
        assertThat(reloaded.getLines().get(1).getNote()).isEqualTo("초기 2번 메모");

        EstimateCollabSuggestion saved = suggestionRepository.findById(editId).orElseThrow();
        assertThat(saved.getStatus().name()).isEqualTo("ACCEPTED");
        assertThat(saved.getChangeSet()).contains("\"before\":\"초기 견적 비고\"");
        assertThat(revisionRepository.findByEstimateIdOrderByRevisionNoDesc(estimate.getId()))
                .extracting("revisionType")
                .contains(EstimateRevisionType.EDIT);
    }

    /**
     * 1-차 영속성 캐시가 비워진 fresh 세션에서도 라인 메모 수정완료가 동작해야 한다.
     *
     * <p>협업 overlay lock 쿼리({@code findByIdForCollabOverlay})가 비-버전 {@code EstimateLine}
     * 까지 fetch+lock 하면 {@code OPTIMISTIC_FORCE_INCREMENT not supported for non-versioned entities}
     * 가 fresh 세션에서만 발생한다(동일 트랜잭션 1-차 캐시가 가리는 false-green — 실서버 QA 가 적발).
     * flush+clear 로 lock 쿼리가 라인을 fresh fetch 하는 경로를 강제해 회귀를 잡는다.
     */
    @Test
    void commitEdit_afterPersistenceContextClear_succeeds() throws Exception {
        Estimate estimate = seedAcceptedEstimate("FRESH");
        estimateRepository.flush();
        entityManager.clear();

        mvc.perform(post("/slips/estimates/{estimateId}/collab/edits", estimate.getId())
                        .header(USER_ID_HEADER, ACTOR_ID)
                        .header(USER_NAME_HEADER, "신선세션사원")
                        .header(SYSTEM_MASTER_HEADER, "true")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "changeSet", "{\"line.1.note\":{\"after\":\"fresh 세션 라인 메모\"}}",
                                "reason", "fresh 세션 force-increment 회귀 가드"))))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.estimate.lines[0].note").value("fresh 세션 라인 메모"));
    }

    /**
     * 권한 없는(비-MASTER) 계정의 수정완료 요청은 403 으로 거부되고 이력이 저장되지 않아야 한다.
     *
     * <p>{@code @RequirePermission}(PermissionAspect) 단일 가드의 deny 경로를 실 HTTP 로
     * 회귀 검증한다([enforcement-real-http-test]). MASTER bypass 헤더 없이 동적 권한이 거부되면
     * 403 을 반환한다.
     */
    @Test
    void commitEdit_withoutPermission_returns403AndPersistsNothing() throws Exception {
        Estimate estimate = seedAcceptedEstimate("DENY");
        UUID deniedAccount = UUID.fromString("20000000-0000-0000-0000-0000000003ff");
        when(dynamicPermissionClient.check(any(UUID.class), anyString(), any(PermissionAction.class)))
                .thenReturn(false);
        when(dynamicPermissionClient.canEdit(anyString(), anyString())).thenReturn(false);
        when(dynamicPermissionClient.canView(anyString(), anyString())).thenReturn(false);

        mvc.perform(post("/slips/estimates/{estimateId}/collab/edits", estimate.getId())
                        .header(USER_ID_HEADER, deniedAccount.toString())
                        .header(USER_NAME_HEADER, "권한없는사원")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "changeSet", "{\"memo\":{\"after\":\"무단 수정\"}}",
                                "reason", "권한 거부 회귀"))))
                .andExpect(status().isForbidden());

        assertThat(suggestionRepository.count()).isZero();
        Estimate reloaded = estimateRepository.findById(estimate.getId()).orElseThrow();
        assertThat(reloaded.getMemo()).isEqualTo("초기 견적 비고");
        assertThat(reloaded.getValidUntil()).isEqualTo(LocalDate.of(2099, 6, 30));
        assertThat(revisionRepository.findByEstimateIdOrderByRevisionNoDesc(estimate.getId())).isEmpty();
    }

    /** VIEW 권한 없는 계정은 협업 조회/stream endpoint 에도 접근할 수 없어야 한다. */
    @Test
    void readEndpoints_withoutPermission_return403() throws Exception {
        UUID estimateId = seedAcceptedEstimate("VIEW-DENY").getId();
        UUID deniedAccount = UUID.fromString("20000000-0000-0000-0000-0000000003fe");
        when(dynamicPermissionClient.check(any(UUID.class), anyString(), any(PermissionAction.class)))
                .thenReturn(false);
        when(dynamicPermissionClient.canView(anyString(), anyString())).thenReturn(false);

        mvc.perform(get("/slips/estimates/{estimateId}/collab/comments", estimateId)
                        .header(USER_ID_HEADER, deniedAccount.toString()))
                .andExpect(status().isForbidden());

        mvc.perform(get("/slips/estimates/{estimateId}/collab/edits", estimateId)
                        .header(USER_ID_HEADER, deniedAccount.toString()))
                .andExpect(status().isForbidden());

        mvc.perform(get("/slips/estimates/{estimateId}/collab/stream", estimateId)
                        .header(USER_ID_HEADER, deniedAccount.toString())
                        .accept(MediaType.TEXT_EVENT_STREAM))
                .andExpect(status().isForbidden());
    }

    /** 협업 조회 endpoint 는 @RequirePermission 단일 가드만 사용하고 본문에서 권한을 재검사하지 않는다. */
    @Test
    void readEndpoints_useSingleRequirePermissionGuard() throws Exception {
        UUID estimateId = seedAcceptedEstimate("SGV").getId();
        UUID accountId = UUID.fromString(ACTOR_ID);
        when(dynamicPermissionClient.check(
                eq(accountId), eq(EstimatePermissionGuard.PAGE_CODE), eq(PermissionAction.VIEW)))
                .thenReturn(true, false);

        mvc.perform(get("/slips/estimates/{estimateId}/collab/comments", estimateId)
                        .header(USER_ID_HEADER, accountId.toString())
                        .param("limit", "20"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.length()").value(0));

        verify(dynamicPermissionClient, times(1))
                .check(eq(accountId), eq(EstimatePermissionGuard.PAGE_CODE), eq(PermissionAction.VIEW));
    }

    /** 협업 작성 endpoint 도 @RequirePermission 단일 가드만 사용하고 본문에서 권한을 재검사하지 않는다. */
    @Test
    void writeEndpoints_useSingleRequirePermissionGuard() throws Exception {
        UUID estimateId = seedAcceptedEstimate("SGW").getId();
        UUID accountId = UUID.fromString(ACTOR_ID);
        when(dynamicPermissionClient.check(
                eq(accountId), eq(EstimatePermissionGuard.PAGE_CODE), eq(PermissionAction.UPDATE)))
                .thenReturn(true, false);

        mvc.perform(post("/slips/estimates/{estimateId}/collab/comments", estimateId)
                        .header(USER_ID_HEADER, accountId.toString())
                        .header(USER_NAME_HEADER, "단일가드작성자")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "body", "단일 가드 댓글",
                                "anchor", "memo"))))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.body").value("단일 가드 댓글"));

        verify(dynamicPermissionClient, times(1))
                .check(eq(accountId), eq(EstimatePermissionGuard.PAGE_CODE), eq(PermissionAction.UPDATE));
    }

    /** REJECTED / CONVERTED 견적은 협업 수정완료가 409 로 거부되고 이력이 저장되지 않아야 한다. */
    @Test
    void commitEdit_onLockedStatuses_returns409AndPersistsNothing() throws Exception {
        for (Estimate estimate : java.util.List.of(
                seedRejectedEstimate("REJ"),
                seedConvertedEstimate("CNV"))) {
            mvc.perform(post("/slips/estimates/{estimateId}/collab/edits", estimate.getId())
                            .header(USER_ID_HEADER, ACTOR_ID)
                            .header(USER_NAME_HEADER, "잠금수정자")
                            .header(SYSTEM_MASTER_HEADER, "true")
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(objectMapper.writeValueAsString(Map.of(
                                    "changeSet", "{\"memo\":{\"after\":\"변경 시도\"}}"))))
                    .andExpect(status().isConflict());

            assertThat(suggestionRepository.findByDocumentTypeAndDocumentIdOrderByCreatedAtDesc(
                    CollabDocumentType.ESTIMATE, estimate.getId())).isEmpty();
        }
    }

    /** 금액/상태/거래처/라인 수량·단가 등 핵심 필드는 400 으로 조기 거부한다. */
    @Test
    void commitEdit_withCoreFields_returns400AndPersistsNothing() throws Exception {
        UUID estimateId = seedAcceptedEstimate("CORE").getId();

        for (String changeSet : java.util.List.of(
                "{\"estimateNo\":{\"after\":\"Q-OTHER\"}}",
                "{\"status\":{\"after\":\"QUOTE_DRAFT\"}}",
                "{\"partnerName\":{\"after\":\"다른거래처\"}}",
                "{\"totalAmount\":{\"after\":\"1\"}}",
                "{\"line.1.quantity\":{\"after\":\"99\"}}",
                "{\"line.2.unitPrice\":{\"after\":\"1\"}}",
                "{\"line.2.productName\":{\"after\":\"다른품목\"}}")) {
            mvc.perform(post("/slips/estimates/{estimateId}/collab/edits", estimateId)
                            .header(USER_ID_HEADER, ACTOR_ID)
                            .header(USER_NAME_HEADER, "핵심수정자")
                            .header(SYSTEM_MASTER_HEADER, "true")
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(objectMapper.writeValueAsString(Map.of("changeSet", changeSet))))
                    .andExpect(status().isBadRequest());
        }

        mvc.perform(post("/slips/estimates/{estimateId}/collab/edits", estimateId)
                        .header(USER_ID_HEADER, ACTOR_ID)
                        .header(USER_NAME_HEADER, "빈변경")
                        .header(SYSTEM_MASTER_HEADER, "true")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("changeSet", "{}"))))
                .andExpect(status().isBadRequest());

        assertThat(suggestionRepository.findByDocumentTypeAndDocumentIdOrderByCreatedAtDesc(
                CollabDocumentType.ESTIMATE, estimateId)).isEmpty();
    }

    /** changeSet JSON 형식/구조/라인키/날짜 오류는 400 으로 거부하고 이력을 남기지 않는다. */
    @Test
    void commitEdit_withMalformedChangeSet_returns400AndPersistsNothing() throws Exception {
        UUID estimateId = seedAcceptedEstimate("BAD-CS").getId();

        for (String changeSet : java.util.List.of(
                "not-json",
                "[]",
                "{\"memo\":{\"before\":\"x\"}}",
                "{\"validUntil\":{\"after\":\"2099-99-99\"}}",
                "{\"line.0.note\":{\"after\":\"0번 라인\"}}",
                "{\"line.3.note\":{\"after\":\"없는 라인\"}}",
                "{\"memo\":{\"after\":\"" + "가".repeat(1001) + "\"}}",
                "{\"line.1.note\":{\"after\":\"" + "나".repeat(201) + "\"}}")) {
            mvc.perform(post("/slips/estimates/{estimateId}/collab/edits", estimateId)
                            .header(USER_ID_HEADER, ACTOR_ID)
                            .header(USER_NAME_HEADER, "형식검증자")
                            .header(SYSTEM_MASTER_HEADER, "true")
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(objectMapper.writeValueAsString(Map.of("changeSet", changeSet))))
                    .andExpect(status().isBadRequest());
        }

        mvc.perform(post("/slips/estimates/{estimateId}/collab/edits", estimateId)
                        .header(USER_ID_HEADER, ACTOR_ID)
                        .header(USER_NAME_HEADER, "공백검증자")
                        .header(SYSTEM_MASTER_HEADER, "true")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("changeSet", " "))))
                .andExpect(status().isBadRequest());

        assertThat(suggestionRepository.findByDocumentTypeAndDocumentIdOrderByCreatedAtDesc(
                CollabDocumentType.ESTIMATE, estimateId)).isEmpty();
        Estimate reloaded = estimateRepository.findById(estimateId).orElseThrow();
        assertThat(reloaded.getMemo()).isEqualTo("초기 견적 비고");
        assertThat(reloaded.getValidUntil()).isEqualTo(LocalDate.of(2099, 6, 30));
    }

    /** 기여자 수신자와 username->UUID resolve 후 현재 수정자를 제외하고 push 를 보낸다. */
    @Test
    void commitEdit_notifiesContributorsAndResolvesUsernameRecipients() throws Exception {
        UUID requesterAccountId = UUID.randomUUID();
        UUID createdByAccountId = UUID.randomUUID();
        UUID previousEditorId = UUID.randomUUID();
        UUID commentAuthorId = UUID.randomUUID();
        UUID revisionActorId = UUID.randomUUID();
        UUID editorId = UUID.fromString(ACTOR_ID);
        Estimate estimate = seedAcceptedEstimate("NOTI");
        EstimateCollabSuggestion previousEdit = EstimateCollabSuggestion.create(
                CollabDocumentType.ESTIMATE, estimate.getId(),
                previousEditorId, "이전수정자", "{\"memo\":{\"after\":\"이전\"}}", null);
        previousEdit.accept(previousEditorId, "이전수정자");
        suggestionRepository.save(previousEdit);
        commentRepository.save(EstimateCollabComment.create(
                CollabDocumentType.ESTIMATE, estimate.getId(),
                "memo", commentAuthorId, "댓글작성자", "확인했습니다", null));
        revisionRepository.save(EstimateRevision.of(
                estimate.getId(), 90, EstimateRevisionType.EDIT, null,
                estimate.getEstimateNo(), estimate.getEstimateDate(), estimate.toSnapshot(),
                revisionActorId, "리비전수정자", null));
        when(authAccountLookupClient.findAccountIdByLoginId("estimate-requester"))
                .thenReturn(Optional.of(requesterAccountId));
        when(authAccountLookupClient.findAccountIdByLoginId("estimate-user"))
                .thenReturn(Optional.of(createdByAccountId));

        mvc.perform(post("/slips/estimates/{estimateId}/collab/edits", estimate.getId())
                        .header(USER_ID_HEADER, ACTOR_ID)
                        .header(USER_NAME_HEADER, "수정자박과장")
                        .header(SYSTEM_MASTER_HEADER, "true")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "changeSet", "{\"memo\":{\"after\":\"알림 견적 비고\"}}"))))
                .andExpect(status().isCreated());

        verify(notificationClient).sendUserPush(eq(requesterAccountId),
                eq("[견적 수정] " + estimate.getEstimateNo()), org.mockito.ArgumentMatchers.anyString());
        verify(notificationClient).sendUserPush(eq(createdByAccountId),
                eq("[견적 수정] " + estimate.getEstimateNo()), org.mockito.ArgumentMatchers.anyString());
        verify(notificationClient).sendUserPush(eq(previousEditorId),
                eq("[견적 수정] " + estimate.getEstimateNo()), org.mockito.ArgumentMatchers.anyString());
        verify(notificationClient).sendUserPush(eq(commentAuthorId),
                eq("[견적 수정] " + estimate.getEstimateNo()), org.mockito.ArgumentMatchers.anyString());
        verify(notificationClient).sendUserPush(eq(revisionActorId),
                eq("[견적 수정] " + estimate.getEstimateNo()), org.mockito.ArgumentMatchers.anyString());
        verify(notificationClient, never())
                .sendUserPush(eq(editorId), org.mockito.ArgumentMatchers.anyString(),
                        org.mockito.ArgumentMatchers.anyString());
        ArgumentCaptor<UUID> recipientCaptor = ArgumentCaptor.forClass(UUID.class);
        verify(notificationClient, times(5)).sendUserPush(
                recipientCaptor.capture(), eq("[견적 수정] " + estimate.getEstimateNo()), anyString());
        assertThat(recipientCaptor.getAllValues()).containsExactlyInAnyOrder(
                requesterAccountId, createdByAccountId, previousEditorId, commentAuthorId, revisionActorId);

        ArgumentCaptor<String> bodyCaptor = ArgumentCaptor.forClass(String.class);
        verify(notificationClient).sendUserPush(eq(requesterAccountId),
                eq("[견적 수정] " + estimate.getEstimateNo()), bodyCaptor.capture());
        assertThat(bodyCaptor.getValue()).contains("수정자박과장").contains("알림 견적 비고");
        assertThat(bodyCaptor.getValue()).doesNotContain(estimate.getId().toString());
    }

    /**
     * estimate_collab_comments 에 유효하지 않은 document_type 을 네이티브 INSERT 하면
     * DB CHECK 제약이 {@link DataIntegrityViolationException} 을 던져야 한다.
     *
     * <p>위반 INSERT 는 PG 트랜잭션을 abort 시키므로([enum-expansion-check-constraint]),
     * 같은 {@code @Transactional} 안에서 위반 INSERT 를 2건 연속 실행하면 두 번째는
     * 자신의 CHECK(23514) 가 아니라 "current transaction is aborted"(25P02) 로 실패한다.
     * 따라서 comments / suggestions CHECK 는 형제 {@code SlipCollabIT} 처럼
     * 각각 독립 트랜잭션(@Test)에서 검증한다.
     */
    @Test
    void checkConstraintRejectsInvalidDocumentTypeInComments() {
        UUID estimateId = seedEstimate("CHK-CMT").getId();
        UUID authorId = UUID.fromString(ACTOR_ID);

        assertThatThrownBy(() -> jdbcTemplate.update(
                "INSERT INTO estimate_collab_comments " +
                        "(id, document_type, document_id, anchor, author_id, author_name, body, status, " +
                        "created_at, created_by, is_deleted) VALUES " +
                        "(?, 'INVALID_TYPE', ?, NULL, ?, 'tester', '본문', 'OPEN', NOW(), 'system', false)",
                UUID.randomUUID(), estimateId, authorId))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    /**
     * presence join/list 엔드포인트가 헤더 인증, 입력 검증, UUID 비노출 wire 계약,
     * {@code @RequirePermission} 단일 가드를 지킨다.
     *
     * <p>검증 시나리오:
     * <ol>
     *   <li>X-User-Id 없는 join → 401 (MissingRequestHeaderException 매핑)</li>
     *   <li>sessionId 빈값 → 400 (INVALID_INPUT)</li>
     *   <li>정상 join → 200 + data {sessionId, displayName, color} 만 포함</li>
     *   <li>GET presence → 1건 반환</li>
     *   <li>estimates.list VIEW 동적권한 거부 → 403 (@RequirePermission PermissionAspect 단일 가드)</li>
     * </ol>
     */
    @Test
    void presence_join_list_validates_header_input_payload_and_permission_guard() throws Exception {
        // (a) X-User-Id 없는 join → 401
        UUID estimateId401 = seedEstimate("PRS-401").getId();
        mvc.perform(post("/slips/estimates/{estimateId}/collab/presence/join", estimateId401)
                        .header(SYSTEM_MASTER_HEADER, "true")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "sessionId", "presence-session-401",
                                "displayName", "presence tester"))))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("UNAUTHORIZED"));

        // (b) sessionId 빈값 → 400
        UUID estimateId400 = seedEstimate("PRS-400").getId();
        mvc.perform(post("/slips/estimates/{estimateId}/collab/presence/join", estimateId400)
                        .header(USER_ID_HEADER, ACTOR_ID)
                        .header(SYSTEM_MASTER_HEADER, "true")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("sessionId", ""))))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_INPUT"));

        // (c) 정상 join → 200 + data {sessionId, displayName, color} 만
        UUID estimateIdOk = seedEstimate("PRS-OK").getId();
        String presenceResponse = mvc.perform(
                        post("/slips/estimates/{estimateId}/collab/presence/join", estimateIdOk)
                                .header(USER_ID_HEADER, ACTOR_ID)
                                .header(USER_NAME_HEADER, "presence 테스터")
                                .header(SYSTEM_MASTER_HEADER, "true")
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(objectMapper.writeValueAsString(Map.of(
                                        "sessionId", "estimate-presence-session-1",
                                        "displayName", "ignored body name"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.sessionId").value("estimate-presence-session-1"))
                .andExpect(jsonPath("$.data.displayName").value("presence 테스터"))
                .andExpect(jsonPath("$.data.color").exists())
                .andExpect(jsonPath("$.data.userId").doesNotExist())
                .andExpect(jsonPath("$.data.accountId").doesNotExist())
                .andExpect(jsonPath("$.data.lastSeenAt").doesNotExist())
                .andReturn().getResponse().getContentAsString();
        assertThat(dataMap(presenceResponse)).containsOnlyKeys("sessionId", "displayName", "color");

        // (d) GET presence → 1건
        mvc.perform(get("/slips/estimates/{estimateId}/collab/presence", estimateIdOk)
                        .header(USER_ID_HEADER, ACTOR_ID)
                        .header(SYSTEM_MASTER_HEADER, "true"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.length()").value(1))
                .andExpect(jsonPath("$.data[0].sessionId").value("estimate-presence-session-1"))
                .andExpect(jsonPath("$.data[0].userId").doesNotExist());

        // (e) estimates.list VIEW 동적권한 거부 → 403 (@RequirePermission PermissionAspect 단일 가드, MASTER bypass 헤더 없음)
        UUID estimateId403 = seedEstimate("PRS-403").getId();
        when(dynamicPermissionClient.check(
                any(UUID.class), eq(EstimatePermissionGuard.PAGE_CODE), eq(PermissionAction.VIEW)))
                .thenReturn(false);
        when(dynamicPermissionClient.canView(any(), eq(EstimatePermissionGuard.PAGE_CODE)))
                .thenReturn(false);

        mvc.perform(post("/slips/estimates/{estimateId}/collab/presence/join", estimateId403)
                        .header(USER_ID_HEADER, ACTOR_ID)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "sessionId", "estimate-presence-denied"))))
                .andExpect(status().isForbidden());
    }

    /** coedit update relay 가 누적되고 GET snapshot 으로 재구성되며 awareness 는 저장하지 않는다. */
    @Test
    void coedit_update_accumulates_andListSnapshot_andAwarenessIsNotPersisted() throws Exception {
        UUID estimateId = seedEstimate("COED").getId();

        mvc.perform(get("/slips/estimates/{estimateId}/collab/coedit", estimateId)
                        .header(USER_ID_HEADER, ACTOR_ID)
                        .header(SYSTEM_MASTER_HEADER, "true"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.updates.length()").value(0));

        mvc.perform(post("/slips/estimates/{estimateId}/collab/coedit/update", estimateId)
                        .header(USER_ID_HEADER, ACTOR_ID)
                        .header(SYSTEM_MASTER_HEADER, "true")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("update", "dXBkYXRl"))))
                .andExpect(status().isOk());

        mvc.perform(post("/slips/estimates/{estimateId}/collab/coedit/update", estimateId)
                        .header(USER_ID_HEADER, ACTOR_ID)
                        .header(SYSTEM_MASTER_HEADER, "true")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("update", "YXdhcmU="))))
                .andExpect(status().isOk());

        mvc.perform(post("/slips/estimates/{estimateId}/collab/coedit/awareness", estimateId)
                        .header(USER_ID_HEADER, ACTOR_ID)
                        .header(SYSTEM_MASTER_HEADER, "true")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("awareness", "Y3Vyc29y"))))
                .andExpect(status().isOk());

        mvc.perform(get("/slips/estimates/{estimateId}/collab/coedit", estimateId)
                        .header(USER_ID_HEADER, ACTOR_ID)
                        .header(SYSTEM_MASTER_HEADER, "true"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.updates.length()").value(2))
                .andExpect(jsonPath("$.data.updates[0]").value("dXBkYXRl"))
                .andExpect(jsonPath("$.data.updates[1]").value("YXdhcmU="));
    }

    /** coedit 읽기 계열(GET snapshot / awareness relay)은 VIEW(estimates.list) 권한 deny 시 403. */
    @Test
    void coedit_readEndpoints_deniedWithoutViewPermission_returns403() throws Exception {
        UUID estimateId = seedEstimate("CVD").getId();
        // account-mode 가드는 check(UUID, page, action) 경로만 사용 → check stub 단독으로 deny 박제(canView 중복 불요).
        when(dynamicPermissionClient.check(
                any(UUID.class), eq(EstimatePermissionGuard.PAGE_CODE), eq(PermissionAction.VIEW)))
                .thenReturn(false);

        mvc.perform(get("/slips/estimates/{estimateId}/collab/coedit", estimateId)
                        .header(USER_ID_HEADER, ACTOR_ID))
                .andExpect(status().isForbidden());

        mvc.perform(post("/slips/estimates/{estimateId}/collab/coedit/awareness", estimateId)
                        .header(USER_ID_HEADER, ACTOR_ID)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("awareness", "Y3Vyc29y"))))
                .andExpect(status().isForbidden());
    }

    /** coedit update 의 body 누락/빈 update 필드는 400 으로 거부되고 snapshot 에 누적되지 않는다. */
    @Test
    void coedit_update_nullOrEmptyBody_returns400_andNotPersisted() throws Exception {
        UUID estimateId = seedEstimate("COED-NULL").getId();

        mvc.perform(post("/slips/estimates/{estimateId}/collab/coedit/update", estimateId)
                        .header(USER_ID_HEADER, ACTOR_ID)
                        .header(SYSTEM_MASTER_HEADER, "true")
                        .contentType(MediaType.APPLICATION_JSON))
                .andExpect(status().isBadRequest());

        mvc.perform(post("/slips/estimates/{estimateId}/collab/coedit/update", estimateId)
                        .header(USER_ID_HEADER, ACTOR_ID)
                        .header(SYSTEM_MASTER_HEADER, "true")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isBadRequest());

        mvc.perform(get("/slips/estimates/{estimateId}/collab/coedit", estimateId)
                        .header(USER_ID_HEADER, ACTOR_ID)
                        .header(SYSTEM_MASTER_HEADER, "true"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.updates.length()").value(0));
    }

    /** coedit update 는 UPDATE(estimates.list) 권한 deny 시 403 으로 거부된다. */
    @Test
    void coedit_update_deniedWithoutUpdatePermission_returns403() throws Exception {
        UUID estimateId = seedEstimate("CUD").getId();
        // account-mode 가드는 check(UUID, page, action) 경로만 사용 → check stub 단독으로 deny 박제(canEdit 중복 불요).
        when(dynamicPermissionClient.check(
                any(UUID.class), eq(EstimatePermissionGuard.PAGE_CODE), eq(PermissionAction.UPDATE)))
                .thenReturn(false);

        mvc.perform(post("/slips/estimates/{estimateId}/collab/coedit/update", estimateId)
                        .header(USER_ID_HEADER, ACTOR_ID)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("update", "dXBkYXRl"))))
                .andExpect(status().isForbidden());
    }

    /** coedit awareness 의 body 누락/빈 awareness 필드는 400 으로 거부된다(update 와 대칭). */
    @Test
    void coedit_awareness_nullOrEmptyBody_returns400() throws Exception {
        UUID estimateId = seedEstimate("CAWN").getId();

        mvc.perform(post("/slips/estimates/{estimateId}/collab/coedit/awareness", estimateId)
                        .header(USER_ID_HEADER, ACTOR_ID)
                        .header(SYSTEM_MASTER_HEADER, "true")
                        .contentType(MediaType.APPLICATION_JSON))
                .andExpect(status().isBadRequest());

        mvc.perform(post("/slips/estimates/{estimateId}/collab/coedit/awareness", estimateId)
                        .header(USER_ID_HEADER, ACTOR_ID)
                        .header(SYSTEM_MASTER_HEADER, "true")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isBadRequest());
    }

    /**
     * estimate_collab_suggestions 에 유효하지 않은 status 를 네이티브 INSERT 하면
     * DB CHECK 제약이 {@link DataIntegrityViolationException} 을 던져야 한다.
     */
    @Test
    void checkConstraintRejectsInvalidStatusInSuggestions() {
        UUID estimateId = seedEstimate("CHK-SUG").getId();
        UUID proposerId = UUID.fromString(ACTOR_ID);

        assertThatThrownBy(() -> jdbcTemplate.update(
                "INSERT INTO estimate_collab_suggestions " +
                        "(id, document_type, document_id, proposer_id, proposer_name, change_set, status, " +
                        "version, created_at, created_by, is_deleted) VALUES " +
                        "(?, 'ESTIMATE', ?, ?, '테스터', '{\"f\":{\"after\":\"v\"}}', 'BAD', " +
                        "0, NOW(), 'system', false)",
                UUID.randomUUID(), estimateId, proposerId))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    private Estimate seedAcceptedEstimate(String suffix) {
        Estimate estimate = seedEstimate(suffix);
        estimate.send();
        estimate.accept();
        return estimateRepository.saveAndFlush(estimate);
    }

    private Estimate seedRejectedEstimate(String suffix) {
        Estimate estimate = seedEstimate(suffix);
        estimate.send();
        estimate.reject();
        return estimateRepository.saveAndFlush(estimate);
    }

    private Estimate seedConvertedEstimate(String suffix) {
        Estimate estimate = seedEstimate(suffix);
        estimate.markConverted(UUID.randomUUID());
        return estimateRepository.saveAndFlush(estimate);
    }

    private Estimate seedEstimate(String suffix) {
        int seq = SEQ.getAndIncrement();
        Estimate estimate = Estimate.create(
                "2099/06/13-EST-" + suffix + "-" + seq,
                LocalDate.of(2099, 6, 13),
                seq,
                UUID.randomUUID(),
                "테스트거래처",
                "101-01-01010",
                "서울시 테스트구",
                LocalDate.of(2099, 6, 30),
                "초기 견적 비고",
                "estimate-requester");
        estimate.addLine(EstimateLine.create(
                estimate,
                1,
                UUID.randomUUID(),
                "실외기",
                "AJ040RXH4BC1",
                "EA",
                2,
                BigDecimal.valueOf(120000),
                "초기 1번 메모"));
        estimate.addLine(EstimateLine.create(
                estimate,
                2,
                UUID.randomUUID(),
                "벽걸이 실내기",
                "AR09B9150HZ",
                "EA",
                1,
                BigDecimal.valueOf(310000),
                "초기 2번 메모"));
        return estimateRepository.saveAndFlush(estimate);
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> dataMap(String responseBody) throws Exception {
        return (Map<String, Object>) objectMapper.readValue(responseBody, Map.class).get("data");
    }
}
