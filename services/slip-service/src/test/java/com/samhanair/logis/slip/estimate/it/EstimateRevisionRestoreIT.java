package com.samhanair.logis.slip.estimate.it;

import static org.hamcrest.Matchers.greaterThanOrEqualTo;
import static org.hamcrest.Matchers.notNullValue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.security.permission.PermissionAction;
import com.samhanair.logis.slip.SlipServiceApplication;
import com.samhanair.logis.slip.client.ArologisDispatchClient;
import com.samhanair.logis.slip.client.InventoryClient;
import com.samhanair.logis.slip.client.NotificationChatRoomClient;
import com.samhanair.logis.slip.client.NotificationClient;
import com.samhanair.logis.slip.client.PartnerBlockClient;
import com.samhanair.logis.slip.client.PartnerInternalClient;
import com.samhanair.logis.slip.client.ProductClient;
import com.samhanair.logis.slip.client.ProductSummary;
import com.samhanair.logis.slip.client.UserInternalClient;
import com.samhanair.logis.slip.client.WarehouseInternalClient;
import com.samhanair.logis.slip.estimate.web.EstimatePermissionGuard;
import com.samhanair.logis.slip.estimate.web.dto.OpaqueUuidCodec;
import com.samhanair.logis.slip.it.AbstractPostgresIT;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentMatchers;
import org.mockito.Mockito;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.transaction.annotation.Transactional;

/**
 * 견적 버전이력/복원 Testcontainers 통합 테스트 — 권한 재편 Phase 2.2 Task 5.
 *
 * <p>실 DB (Flyway {@code estimate_revisions} + JSONB 스냅샷) 기준으로 Task 2~4 산출
 * (자동 캡처 / 타임라인 changeSummary / point-in-time 복원 / REST 권한 게이트) 을 종단 검증한다.
 * {@link AbstractPostgresIT} 의 싱글턴 postgres:16-alpine 컨테이너 + Docker 미가용 시 skip 패턴을 상속한다.
 *
 * <p>대상 endpoint (Task 4 — {@code EstimateRevisionController}):
 * <ul>
 *   <li>{@code GET  /slips/estimates/{estimateId}/revisions} — {@code estimates.list} VIEW. 최신 우선
 *       타임라인 + changeSummary. {@code actorId} JSON 미노출 (UUID 비공개 가드).</li>
 *   <li>{@code POST /slips/estimates/{estimateId}/revisions/{revisionNo}/restore} —
 *       {@code estimates.list} RESTORE. 헤더 X-User-Id/X-User-Name. 편집 불가 단계
 *       (QUOTE_ACCEPTED 이상) 복원 차단 (409 CONFLICT).</li>
 * </ul>
 *
 * <p>견적 seed 방식: 캡처가 일어나는 실 서비스 경로(MockMvc)를 그대로 사용한다 — {@code POST /slips/estimates}
 * (CREATE 캡처 rev1), {@code PUT /slips/estimates/{id}} (헤더+라인 replace → EDIT 캡처 rev2). 견적은
 * 라인 add/remove 개별 endpoint 가 없고 update 가 라인 전량 replace 이므로, "update 의 lines 배열 크기"로
 * 라인 추가/삭제를 모사한다 (1라인 생성 → 2라인 update = 라인 추가, 2라인 생성 → 1라인 update = 라인 제거).
 * 잠금 케이스는 send→accept 실 전이 endpoint 로 QUOTE_ACCEPTED 를 만들어 {@code requireEditable} 가드를
 * 발동시킨다 (EstimateControllerIT 의 라이프사이클 패턴 재사용).
 *
 * <p>모든 인증 요청에 유효 {@code X-User-Id}(UUID) + 적절 {@code X-User-Role} 헤더를 부여한다
 * (권한 경로 정합 — account 모드 {@link PermissionAction} 게이트 + role MASTER bypass 검증). 복원/수정에는
 * {@code X-User-Name} 도 부여한다 (actorName fallback).
 *
 * <p>외부 client 전체 {@code @MockBean} 격리 (메모리 가드 {@code feedback_it_mockbean_external_clients} —
 * 누락 시 Eureka 비활성 → 500). {@code DynamicPermissionClient} 는 {@link AbstractPostgresIT} 공통
 * {@code @MockBean} 으로 기본 allow, 403/bypass 케이스는 요청 직전 명시 stub.
 *
 * <p>{@link com.samhanair.logis.slip.it.SlipRevisionRestoreIT} 미러 (slip→estimate).
 */
@SpringBootTest(classes = SlipServiceApplication.class)
@AutoConfigureMockMvc
@Transactional
class EstimateRevisionRestoreIT extends AbstractPostgresIT {

    private static final String USER_ID_HEADER = "X-User-Id";
    private static final String USER_NAME_HEADER = "X-User-Name";
    private static final String ROLE_HEADER = "X-User-Role";
    private static final String ESTIMATES_PAGE = EstimatePermissionGuard.PAGE_CODE; // "estimates.list"

    @Autowired private MockMvc mockMvc;
    @Autowired private ObjectMapper objectMapper;
    @Autowired private JdbcTemplate jdbcTemplate;

    /** 외부 RestClient — 모두 MockBean 격리 (Eureka 비활성 시 500 방지). */
    @MockBean private ProductClient productClient;
    @MockBean private InventoryClient inventoryClient;
    @MockBean private NotificationClient notificationClient;
    @MockBean private NotificationChatRoomClient notificationChatRoomClient;
    @MockBean private PartnerBlockClient partnerBlockClient;
    @MockBean private PartnerInternalClient partnerInternalClient;
    @MockBean private UserInternalClient userInternalClient;
    @MockBean private WarehouseInternalClient warehouseInternalClient;
    @MockBean private ArologisDispatchClient arologisDispatchClient;

    @BeforeEach
    void mockExternalClients() {
        Mockito.lenient().when(userInternalClient.resolveFullName(ArgumentMatchers.any()))
                .thenReturn(Optional.of("담당자"));
        Mockito.lenient().when(partnerBlockClient.isBlocked(ArgumentMatchers.any()))
                .thenReturn(false);
        // 견적 라인 productId 검증 — 요청한 productId 를 그대로 ProductSummary 로 echo
        Mockito.lenient().when(productClient.lookup(ArgumentMatchers.anyList()))
                .thenAnswer(inv -> {
                    List<UUID> ids = inv.getArgument(0);
                    return ids.stream()
                            .map(id -> new ProductSummary(id, "테스트 제품", "MOD-001",
                                    null, new BigDecimal("100000.00"), "ACTIVE"))
                            .toList();
                });
    }

    // =========================================================================
    // 시나리오 1 — 캡처 + 타임라인 (CREATE/EDIT, 최신 우선, changeSummary, actorId 미노출)
    // =========================================================================

    @Test
    @DisplayName("타임라인: 생성(CREATE rev1) + 라인 추가 수정(EDIT rev2) → 최신 우선 2건, EDIT lineAdded>=1, actorId 미노출")
    void timeline_afterCreateAndUpdate_listsRevisionsLatestFirstWithoutActorId() throws Exception {
        // 1라인 견적 생성 → CREATE revision 1 자동 캡처
        UUID estimateId = createEstimateAsSales(1);

        // 라인 2건으로 update → EDIT revision 2 (직전 rev1=1라인 대비 라인 1건 추가)
        updateEstimate(estimateId, 2, "타임라인 검증 프로젝트");

        MvcResult result = mockMvc.perform(get("/slips/estimates/{id}/revisions", estimateId)
                        .header(USER_ID_HEADER, UUID.randomUUID().toString())
                        .header(USER_NAME_HEADER, "감사자")
                        .header(ROLE_HEADER, "MANAGER"))
                .andExpect(status().isOk())
                // 최신 우선 — [0]=rev2 EDIT, [1]=rev1 CREATE
                .andExpect(jsonPath("$.data[0].revisionNo").value(2))
                .andExpect(jsonPath("$.data[0].revisionType").value("EDIT"))
                .andExpect(jsonPath("$.data[1].revisionNo").value(1))
                .andExpect(jsonPath("$.data[1].revisionType").value("CREATE"))
                // rev2(2라인) 는 직전(rev1, 1라인) 대비 라인 1건 추가
                .andExpect(jsonPath("$.data[0].changeSummary.lineAdded")
                        .value(greaterThanOrEqualTo(1)))
                .andExpect(jsonPath("$.data[0].actorName").value(notNullValue()))
                .andReturn();

        // UUID 비공개 가드 — 응답 본문 어디에도 actorId 키가 없어야 함
        String body = result.getResponse().getContentAsString();
        org.assertj.core.api.Assertions.assertThat(body).doesNotContain("actorId");
        JsonNode data = objectMapper.readTree(body).get("data");
        org.assertj.core.api.Assertions.assertThat(data).hasSizeGreaterThanOrEqualTo(2);
        org.assertj.core.api.Assertions.assertThat(data.get(0).has("actorId")).isFalse();
    }

    @Test
    @DisplayName("타임라인: JSONB null/필수키 누락 snapshot row 가 있어도 500 없이 안전 처리한다")
    void timeline_withNullAndIncompleteSnapshots_doesNotReturn500() throws Exception {
        UUID estimateId = createEstimateAsSales(1);
        insertCorruptRevision(estimateId, 2, "null");
        insertCorruptRevision(estimateId, 3, "{}");

        mockMvc.perform(get("/slips/estimates/{id}/revisions", estimateId)
                        .header(USER_ID_HEADER, UUID.randomUUID().toString())
                        .header(USER_NAME_HEADER, "감사자")
                        .header(ROLE_HEADER, "MANAGER"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.length()").value(2))
                .andExpect(jsonPath("$.data[0].revisionNo").value(3))
                .andExpect(jsonPath("$.data[0].changeSummary.headerChanged")
                        .value(greaterThanOrEqualTo(1)))
                .andExpect(jsonPath("$.data[0].changeSummary.lineAdded").value(0))
                .andExpect(jsonPath("$.data[1].revisionNo").value(1));
    }

    @Test
    @DisplayName("타임라인: 타입불일치 snapshot row 는 fetch 500 없이 제외하고 직전 정상 snapshot 기준을 유지한다")
    void timeline_withTypeMismatchedSnapshot_skipsCorruptRevision() throws Exception {
        UUID estimateId = createEstimateAsSales(1);
        insertCorruptRevision(estimateId, 2, """
                {
                  "estimateNo":"BROKEN-2",
                  "estimateDate":"not-a-date",
                  "lines":[]
                }
                """);

        mockMvc.perform(get("/slips/estimates/{id}/revisions", estimateId)
                        .header(USER_ID_HEADER, UUID.randomUUID().toString())
                        .header(USER_NAME_HEADER, "감사자")
                        .header(ROLE_HEADER, "MANAGER"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.length()").value(1))
                .andExpect(jsonPath("$.data[0].revisionNo").value(1));
    }

    @Test
    @DisplayName("복원: 타입불일치 snapshot revision 은 명확한 내부오류로 거부한다")
    void restore_withTypeMismatchedSnapshot_returnsExplicitError() throws Exception {
        UUID estimateId = createEstimateAsSales(1);
        insertCorruptRevision(estimateId, 2, """
                {
                  "estimateNo":"BROKEN-2",
                  "estimateDate":"not-a-date",
                  "lines":[]
                }
                """);

        mockMvc.perform(post("/slips/estimates/{id}/revisions/{rev}/restore", estimateId, 2)
                        .header(USER_ID_HEADER, UUID.randomUUID().toString())
                        .header(USER_NAME_HEADER, "복원자")
                        .header(ROLE_HEADER, "MANAGER"))
                .andExpect(status().isInternalServerError())
                .andExpect(jsonPath("$.code").value("INTERNAL_ERROR"))
                .andExpect(jsonPath("$.message").value(org.hamcrest.Matchers.containsString("손상된 버전 스냅샷입니다")))
                .andExpect(jsonPath("$.message").value(org.hamcrest.Matchers.containsString("버전 2")));
    }

    // =========================================================================
    // 시나리오 2 — 복원 (라인 집합이 대상 revision 시점으로 회귀 + 신규 RESTORE revision)
    // =========================================================================

    @Test
    @DisplayName("복원: rev1(1라인) 시점으로 복원 → 라인 회귀 + 신규 RESTORE rev3(source=1)")
    void restore_toRevision1_revertsLinesAndCreatesRestoreRevision() throws Exception {
        // rev1 = 1라인
        UUID estimateId = createEstimateAsSales(1);
        int linesAtRev1 = lineCount(getDetail(estimateId));
        org.assertj.core.api.Assertions.assertThat(linesAtRev1).isEqualTo(1);

        // 라인 2건으로 update → rev2 (2라인 스냅샷)
        updateEstimate(estimateId, 2, "복원 전 프로젝트");
        org.assertj.core.api.Assertions.assertThat(lineCount(getDetail(estimateId)))
                .isEqualTo(linesAtRev1 + 1);

        // revision 1 시점으로 복원 → 200, 라인 집합이 rev1 (= 1건) 로 회귀하고
        // 복원 자체가 신규 RESTORE rev3 (sourceRevisionNo=1) 로 누적된다.
        mockMvc.perform(post("/slips/estimates/{id}/revisions/{rev}/restore", estimateId, 1)
                        .header(USER_ID_HEADER, UUID.randomUUID().toString())
                        .header(USER_NAME_HEADER, "복원자")
                        .header(ROLE_HEADER, "MANAGER"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.id").value(OpaqueUuidCodec.encode(estimateId)))
                .andExpect(jsonPath("$.data.lines.length()").value(linesAtRev1));

        // 복원도 신규 RESTORE revision (sourceRevisionNo=1) 으로 추적 — 타임라인 최신 항목이 RESTORE.
        mockMvc.perform(get("/slips/estimates/{id}/revisions", estimateId)
                        .header(USER_ID_HEADER, UUID.randomUUID().toString())
                        .header(ROLE_HEADER, "MANAGER"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data[0].revisionNo").value(3))
                .andExpect(jsonPath("$.data[0].revisionType").value("RESTORE"))
                .andExpect(jsonPath("$.data[0].sourceRevisionNo").value(1));
    }

    // =========================================================================
    // 시나리오 3 — 라인 제거 후 이전 revision 복원 시 라인 복구
    // =========================================================================

    @Test
    @DisplayName("복원: 라인 제거(2→1) 후 rev1 복원 → 제거 라인 복구(2라인)")
    void restore_afterLineRemoval_recoversRemovedLine() throws Exception {
        // rev1 = 2라인
        UUID estimateId = createEstimateAsSales(2);
        int linesAtRev1 = lineCount(getDetail(estimateId));
        org.assertj.core.api.Assertions.assertThat(linesAtRev1).isEqualTo(2);

        // 라인 1건으로 update → rev2 (1라인 스냅샷 — 라인 1건 제거 모사)
        updateEstimate(estimateId, 1, "라인 제거 후 프로젝트");
        org.assertj.core.api.Assertions.assertThat(lineCount(getDetail(estimateId))).isEqualTo(1);

        // revision 1 복원 → 제거된 라인 복구 (2라인)
        mockMvc.perform(post("/slips/estimates/{id}/revisions/{rev}/restore", estimateId, 1)
                        .header(USER_ID_HEADER, UUID.randomUUID().toString())
                        .header(USER_NAME_HEADER, "복원자")
                        .header(ROLE_HEADER, "MANAGER"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.lines.length()").value(2));
    }

    // =========================================================================
    // 시나리오 4 — 편집 불가 단계(QUOTE_ACCEPTED) 복원 차단 (409 CONFLICT)
    // =========================================================================

    @Test
    @DisplayName("복원 차단: QUOTE_ACCEPTED 견적 복원 시도 → 409 CONFLICT (requireEditable 가드)")
    void restore_whenEstimateAccepted_returnsConflict() throws Exception {
        UUID estimateId = createEstimateAsSales(1);

        // 실 전이 endpoint 로 QUOTE_ACCEPTED 도달 — DRAFT → SENT → ACCEPTED
        // (ACCEPTED 는 EDITABLE_STATUSES 미포함 → restoreFromSnapshot.requireEditable() 발동 경로)
        sendEstimate(estimateId);
        acceptEstimate(estimateId);

        mockMvc.perform(post("/slips/estimates/{id}/revisions/{rev}/restore", estimateId, 1)
                        .header(USER_ID_HEADER, UUID.randomUUID().toString())
                        .header(USER_NAME_HEADER, "복원자")
                        .header(ROLE_HEADER, "MANAGER"))
                .andExpect(status().isConflict());
    }

    // =========================================================================
    // 시나리오 5 — RESTORE 권한 (deny → 403, MASTER bypass → 200)
    // =========================================================================

    @Test
    @DisplayName("권한: RESTORE deny + 비-MASTER → 403")
    void restore_whenPermissionDenied_nonMaster_returns403() throws Exception {
        UUID estimateId = createEstimateAsSales(1);

        // account 모드 RESTORE 권한 명시 deny + 비-MASTER 역할 → PermissionAspect 가 403
        Mockito.when(dynamicPermissionClient.check(
                        any(UUID.class),
                        eq(ESTIMATES_PAGE),
                        eq(PermissionAction.RESTORE)))
                .thenReturn(false);

        mockMvc.perform(post("/slips/estimates/{id}/revisions/{rev}/restore", estimateId, 1)
                        .header(USER_ID_HEADER, UUID.randomUUID().toString())
                        .header(USER_NAME_HEADER, "권한없음")
                        .header(ROLE_HEADER, "STAFF"))
                .andExpect(status().isForbidden());
    }

    @Test
    @DisplayName("권한: RESTORE deny 이어도 MASTER 역할 → aspect bypass 200")
    void restore_whenPermissionDenied_masterRole_bypassesAndReturns200() throws Exception {
        UUID estimateId = createEstimateAsSales(1);

        // RESTORE deny stub 이어도 MASTER 역할은 aspect bypass → 200
        Mockito.when(dynamicPermissionClient.check(
                        any(UUID.class),
                        eq(ESTIMATES_PAGE),
                        eq(PermissionAction.RESTORE)))
                .thenReturn(false);

        // C5-4(C4-3): bypass 키 = X-Is-System-Master 단독 (role 폴백 제거)
        mockMvc.perform(post("/slips/estimates/{id}/revisions/{rev}/restore", estimateId, 1)
                        .header(USER_ID_HEADER, UUID.randomUUID().toString())
                        .header(USER_NAME_HEADER, "마스터")
                        .header("X-Is-System-Master", "true"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.id").value(OpaqueUuidCodec.encode(estimateId)));
    }

    // =========================================================================
    // 헬퍼 — 견적 seed (MockMvc 실 경로) + 상세/라인 조회 + 상태 전이
    // =========================================================================

    /**
     * SALES 권한으로 {@code lineCount} 개 라인을 가진 견적 1건 생성 후 estimate UUID 반환.
     * 생성 직후 CREATE revision 1 이 자동 캡처된다.
     */
    private UUID createEstimateAsSales(int lineCount) throws Exception {
        Map<String, Object> body = new HashMap<>();
        body.put("estimateDate", "2026-05-29");
        body.put("partnerName", "테스트거래처");
        body.put("partnerBusinessNo", "123-45-67890");
        body.put("validUntil", "2026-06-29");
        body.put("memo", "견적 복원 IT");
        body.put("lines", buildLines(lineCount));

        MvcResult result = mockMvc.perform(post("/slips/estimates")
                        .header(USER_ID_HEADER, UUID.randomUUID().toString())
                        .header(ROLE_HEADER, "SALES")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isCreated())
                .andReturn();
        return OpaqueUuidCodec.decode(objectMapper.readTree(result.getResponse().getContentAsString())
                .get("data").get("id").asText());
    }

    /**
     * 견적 헤더+라인 update — lines 전량 replace 로 {@code lineCount} 개 라인을 만든다 (EDIT 캡처).
     * 견적은 라인 add/remove 개별 endpoint 가 없어 update 의 lines 크기로 추가/삭제를 모사한다.
     */
    private void updateEstimate(UUID estimateId, int lineCount, String memo) throws Exception {
        Map<String, Object> body = new HashMap<>();
        body.put("memo", memo);
        body.put("lines", buildLines(lineCount));
        body.put("lineIdContract", true); // [D-R8-9] 정상 최신 클라이언트 재현

        mockMvc.perform(put("/slips/estimates/{id}", estimateId)
                        .header(USER_ID_HEADER, UUID.randomUUID().toString())
                        .header(USER_NAME_HEADER, "수정자")
                        .header(ROLE_HEADER, "SALES")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isOk());
    }

    /** DRAFT → SENT 전이. */
    private void sendEstimate(UUID estimateId) throws Exception {
        mockMvc.perform(post("/slips/estimates/{id}/send", estimateId)
                        .header(USER_ID_HEADER, UUID.randomUUID().toString())
                        .header(ROLE_HEADER, "SALES"))
                .andExpect(status().isOk());
    }

    /** SENT → ACCEPTED 전이. */
    private void acceptEstimate(UUID estimateId) throws Exception {
        mockMvc.perform(post("/slips/estimates/{id}/accept", estimateId)
                        .header(USER_ID_HEADER, UUID.randomUUID().toString())
                        .header(ROLE_HEADER, "SALES"))
                .andExpect(status().isOk());
    }

    private void insertCorruptRevision(UUID estimateId, int revisionNo, String snapshotJson) {
        LocalDateTime now = LocalDateTime.now();
        jdbcTemplate.update("""
                INSERT INTO estimate_revisions
                    (id, estimate_id, revision_no, revision_type, source_revision_no,
                     estimate_no, estimate_date, snapshot, actor_id, actor_name, actor_color,
                     created_at, created_by, modified_at, modified_by, deleted_at, deleted_by, is_deleted)
                VALUES (?, ?, ?, 'EDIT', NULL,
                        ?, DATE '2026-05-29', ?::jsonb, NULL, ?, NULL,
                        ?, 'test', NULL, NULL, NULL, NULL, FALSE)
                """,
                UUID.randomUUID(), estimateId, revisionNo, "CORRUPT-" + revisionNo,
                snapshotJson, "손상데이터", now);
    }

    /** {@code count} 개 견적 라인 JSON 맵 리스트 — 각 라인은 고유 productId (productId 기준 changeSummary 매칭). */
    private List<Map<String, Object>> buildLines(int count) {
        List<Map<String, Object>> lines = new ArrayList<>();
        for (int i = 0; i < count; i++) {
            Map<String, Object> line = new HashMap<>();
            line.put("productId", UUID.randomUUID().toString());
            line.put("productName", "테스트 제품 " + i);
            line.put("modelName", "MOD-00" + i);
            line.put("quantity", i + 1);
            line.put("unitPrice", "100000.00");
            line.put("note", "라인 메모 " + i);
            lines.add(line);
        }
        return lines;
    }

    /** 견적 상세 JSON 의 {@code $.data} 노드 반환. */
    private JsonNode getDetail(UUID estimateId) throws Exception {
        MvcResult result = mockMvc.perform(get("/slips/estimates/{id}", estimateId)
                        .header(USER_ID_HEADER, UUID.randomUUID().toString())
                        .header(ROLE_HEADER, "MANAGER"))
                .andExpect(status().isOk())
                .andReturn();
        return objectMapper.readTree(result.getResponse().getContentAsString()).get("data");
    }

    private int lineCount(JsonNode detail) {
        return detail.get("lines").size();
    }
}
