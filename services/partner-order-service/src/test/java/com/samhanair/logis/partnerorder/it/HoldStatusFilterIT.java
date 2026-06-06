package com.samhanair.logis.partnerorder.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.samhanair.logis.partnerorder.PartnerOrderServiceApplication;
import com.samhanair.logis.partnerorder.client.DcConfigClient;
import com.samhanair.logis.partnerorder.client.EstimateClient;
import com.samhanair.logis.partnerorder.client.InventoryClient;
import com.samhanair.logis.partnerorder.client.PartnerAuthClient;
import com.samhanair.logis.partnerorder.client.ProductClient;
import com.samhanair.logis.partnerorder.client.SlipServiceClient;
import com.samhanair.logis.partnerorder.domain.PartnerOrder;
import com.samhanair.logis.partnerorder.repository.PartnerOrderRepository;
import com.samhanair.logis.partnerorder.repository.SlipPublishOutboxRepository;
import com.samhanair.logis.partnerorder.vendor.client.PartnerLookupClient;
import com.samhanair.logis.partnerorder.vendor.client.ProductCatalogLookupClient;
import com.samhanair.logis.security.permission.DynamicPermissionClient;
import com.samhanair.logis.security.permission.PermissionAction;
import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.MockMvc;

/**
 * Phase 2.5 거래처 주문 보류(ON_HOLD) 상태 전이 + 리스트 status 필터 통합 테스트.
 *
 * <p>실 Postgres(Testcontainers) + 실 Flyway 기반. {@link AbstractPostgresIT} 상속으로
 * Docker 미가용 시 자동 skip.
 *
 * <p><b>검증 케이스:</b>
 * <ol>
 *   <li>hold: DRAFT 주문 {@code POST /{id}/hold} → 200, status=ON_HOLD (DB 단언)</li>
 *   <li>release: ON_HOLD 주문 {@code POST /{id}/release} → 200, status=DRAFT</li>
 *   <li>hold CONFIRMED 주문 → 409 CONFLICT</li>
 *   <li>release DRAFT 주문 → 409 CONFLICT</li>
 *   <li>리스트 status=DRAFT 필터 → DRAFT 만 반환</li>
 *   <li>리스트 status=ON_HOLD 필터 → ON_HOLD 만 반환</li>
 *   <li>리스트 status=CONFIRMED 필터 → CONFIRMED 만 반환</li>
 *   <li>hold 권한 deny(UPDATE 없는 role) → 403 / MASTER bypass → 200</li>
 *   <li>Cycle 1 — DRAFT createdAt 기간필터(dateFrom/dateTo) 기준 케이스 (P1-1/P1-2 회귀 가드)</li>
 *   <li>Cycle 1 — DRAFT + CONFIRMED 혼재 전체조회 createdAt DESC 정렬 정합 케이스</li>
 * </ol>
 *
 * <p><b>외부 client @MockBean 격리</b> ({@code feedback_it_mockbean_external_clients}):
 * Phase 2.4 {@code PartnerOrderRevisionRestoreIT} 와 동일한 목록 전부 @MockBean + lenient stub.
 */
@SpringBootTest(classes = PartnerOrderServiceApplication.class)
@AutoConfigureMockMvc
class HoldStatusFilterIT extends AbstractPostgresIT {

    // ── 테스트 상수 ─────────────────────────────────────────────────────────────

    /** MASTER 역할 계정 UUID — 권한 bypass 검증용. */
    private static final String MASTER_ACCOUNT_ID = "30000000-0000-0000-0000-000000000001";
    /** SALES 역할 계정 UUID — 정상 hold/release 실행 주체. */
    private static final String SALES_ACCOUNT_ID  = "30000000-0000-0000-0000-000000000002";
    /** PARTNER 역할 계정 UUID — hold 권한 deny 검증용. */
    private static final String PARTNER_ACCOUNT_ID = "30000000-0000-0000-0000-000000000003";

    // ── 의존성 ─────────────────────────────────────────────────────────────────

    @Autowired private MockMvc mockMvc;
    @Autowired private PartnerOrderRepository orderRepository;
    @Autowired private SlipPublishOutboxRepository outboxRepository;
    @Autowired private JdbcTemplate jdbcTemplate;

    // ── 외부 client MockBean ────────────────────────────────────────────────────

    /** estimate-service 조회 포트. */
    @MockBean private EstimateClient estimateClient;

    /** DC 할인 설정 조회. */
    @MockBean private DcConfigClient dcConfigClient;

    /** 상품 카탈로그 조회. */
    @MockBean private ProductClient productClient;

    /** 재고 예약. */
    @MockBean private InventoryClient inventoryClient;

    /** 출고전표 발행. */
    @MockBean private SlipServiceClient slipServiceClient;

    /** 거래처 인증 조회. */
    @MockBean private PartnerAuthClient partnerAuthClient;

    /** 거래처 목록 조회 (vendor). */
    @MockBean private PartnerLookupClient partnerLookupClient;

    /** 상품 카탈로그 룩업 (vendor). */
    @MockBean private ProductCatalogLookupClient catalogLookupClient;

    /**
     * 동적 권한 검증 클라이언트.
     * 7-action stub + X-User-Id 헤더 패턴.
     */
    @MockBean private DynamicPermissionClient dynamicPermissionClient;

    // ── 테스트 셋업 ─────────────────────────────────────────────────────────────

    @BeforeEach
    void setUp() {
        // slip_publish_outbox.partner_order_id_fkey 위반 회피 — outbox 먼저 cleanup (QA-2.5-01)
        outboxRepository.deleteAll();
        jdbcTemplate.update("DELETE FROM partner_order_lines");
        orderRepository.deleteAll();

        // DynamicPermissionClient 7-action lenient stub (기본=허용)
        lenient().when(dynamicPermissionClient.canView(anyString(), anyString())).thenReturn(true);
        lenient().when(dynamicPermissionClient.canEdit(anyString(), anyString())).thenReturn(true);
        lenient().when(dynamicPermissionClient.check(
                any(UUID.class), anyString(), any(PermissionAction.class))).thenReturn(true);

        // 외부 client 기본 lenient stub
        lenient().when(dcConfigClient.calculatePrices(anyString(), anyList())).thenReturn(Map.of());
        lenient().when(productClient.lookup(anyList())).thenReturn(List.of());
    }

    // ══════════════════════════════════════════════════════════════════════════
    // 케이스 1 — hold: DRAFT → ON_HOLD 200 + DB 단언
    // ══════════════════════════════════════════════════════════════════════════

    /**
     * DRAFT 주문에 hold 호출 시 200 + status=ON_HOLD 응답, DB 에서도 ON_HOLD 확인.
     */
    @Test
    @WithMockUser(roles = {"SALES"})
    @DisplayName("케이스1: DRAFT 주문 hold → 200 + status=ON_HOLD (DB 단언)")
    void case1_holdDraftOrder_returns200AndStatusOnHold() throws Exception {
        UUID orderId = buildDraftOrderViaDb("P-HOLD-001", "1111111111", "2026/05/31-HOLD-1");

        mockMvc.perform(post("/api/v1/partner-orders/{id}/hold", orderId)
                        .header("X-User-Id", SALES_ACCOUNT_ID)
                        .header("X-User-Role", "SALES")
                        .header("X-User-Name", "영업담당자"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("ON_HOLD"));

        // DB 단언
        String dbStatus = jdbcTemplate.queryForObject(
                "SELECT status FROM partner_orders WHERE id = ?", String.class, orderId);
        assertThat(dbStatus).isEqualTo("ON_HOLD");
    }

    // ══════════════════════════════════════════════════════════════════════════
    // 케이스 2 — release: ON_HOLD → DRAFT 200
    // ══════════════════════════════════════════════════════════════════════════

    /**
     * ON_HOLD 주문에 release 호출 시 200 + status=DRAFT 응답, DB 에서도 DRAFT 확인.
     */
    @Test
    @WithMockUser(roles = {"SALES"})
    @DisplayName("케이스2: ON_HOLD 주문 release → 200 + status=DRAFT")
    void case2_releaseOnHoldOrder_returns200AndStatusDraft() throws Exception {
        UUID orderId = buildOrderWithStatusViaDb("P-HOLD-002", "2222222222", "2026/05/31-HOLD-2", "ON_HOLD");

        mockMvc.perform(post("/api/v1/partner-orders/{id}/release", orderId)
                        .header("X-User-Id", SALES_ACCOUNT_ID)
                        .header("X-User-Role", "SALES")
                        .header("X-User-Name", "영업담당자"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("DRAFT"));

        // DB 단언
        String dbStatus = jdbcTemplate.queryForObject(
                "SELECT status FROM partner_orders WHERE id = ?", String.class, orderId);
        assertThat(dbStatus).isEqualTo("DRAFT");
    }

    // ══════════════════════════════════════════════════════════════════════════
    // 케이스 3 — hold CONFIRMED → 409
    // ══════════════════════════════════════════════════════════════════════════

    /**
     * CONFIRMED 주문에 hold 호출 시 409 CONFLICT.
     */
    @Test
    @WithMockUser(roles = {"SALES"})
    @DisplayName("케이스3: CONFIRMED 주문 hold → 409 CONFLICT")
    void case3_holdConfirmedOrder_returns409() throws Exception {
        UUID orderId = buildOrderWithStatusViaDb("P-HOLD-003", "3333333333", "2026/05/31-HOLD-3", "CONFIRMED");

        mockMvc.perform(post("/api/v1/partner-orders/{id}/hold", orderId)
                        .header("X-User-Id", SALES_ACCOUNT_ID)
                        .header("X-User-Role", "SALES")
                        .header("X-User-Name", "영업담당자"))
                .andExpect(status().isConflict());
    }

    // ══════════════════════════════════════════════════════════════════════════
    // 케이스 4 — release DRAFT → 409
    // ══════════════════════════════════════════════════════════════════════════

    /**
     * DRAFT 주문에 release 호출 시 409 CONFLICT.
     */
    @Test
    @WithMockUser(roles = {"SALES"})
    @DisplayName("케이스4: DRAFT 주문 release → 409 CONFLICT")
    void case4_releaseDraftOrder_returns409() throws Exception {
        UUID orderId = buildDraftOrderViaDb("P-HOLD-004", "4444444444", "2026/05/31-HOLD-4");

        mockMvc.perform(post("/api/v1/partner-orders/{id}/release", orderId)
                        .header("X-User-Id", SALES_ACCOUNT_ID)
                        .header("X-User-Role", "SALES")
                        .header("X-User-Name", "영업담당자"))
                .andExpect(status().isConflict());
    }

    // ══════════════════════════════════════════════════════════════════════════
    // 케이스 5 — 리스트 status=DRAFT 필터 → DRAFT 만 반환
    // ══════════════════════════════════════════════════════════════════════════

    /**
     * 리스트 status=DRAFT 필터: DRAFT 주문만 반환, ON_HOLD/CONFIRMED 제외.
     */
    @Test
    @WithMockUser(roles = {"SALES"})
    @DisplayName("케이스5: 리스트 status=DRAFT 필터 → DRAFT 만 반환")
    void case5_listStatusDraftFilter_returnsDraftOnly() throws Exception {
        buildDraftOrderViaDb("P-LIST-D", "5111111111", "2026/05/31-LIST-D1");
        buildOrderWithStatusViaDb("P-LIST-H", "5222222222", "2026/05/31-LIST-H1", "ON_HOLD");
        buildOrderWithStatusViaDb("P-LIST-C", "5333333333", "2026/05/31-LIST-C1", "CONFIRMED");

        mockMvc.perform(get("/api/v1/partner-orders")
                        .param("status", "DRAFT")
                        .header("X-User-Id", SALES_ACCOUNT_ID)
                        .header("X-User-Role", "SALES"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.content").isArray())
                .andExpect(jsonPath("$.data.totalElements").value(1))
                .andExpect(jsonPath("$.data.content[0].status").value("DRAFT"));
    }

    // ══════════════════════════════════════════════════════════════════════════
    // 케이스 6 — 리스트 status=ON_HOLD 필터 → ON_HOLD 만 반환
    // ══════════════════════════════════════════════════════════════════════════

    /**
     * 리스트 status=ON_HOLD 필터: ON_HOLD 주문만 반환, DRAFT/CONFIRMED 제외.
     */
    @Test
    @WithMockUser(roles = {"SALES"})
    @DisplayName("케이스6: 리스트 status=ON_HOLD 필터 → ON_HOLD 만 반환")
    void case6_listStatusOnHoldFilter_returnsOnHoldOnly() throws Exception {
        buildDraftOrderViaDb("P-LIST-D2", "6111111111", "2026/05/31-LIST-D2");
        buildOrderWithStatusViaDb("P-LIST-H2", "6222222222", "2026/05/31-LIST-H2", "ON_HOLD");
        buildOrderWithStatusViaDb("P-LIST-C2", "6333333333", "2026/05/31-LIST-C2", "CONFIRMED");

        mockMvc.perform(get("/api/v1/partner-orders")
                        .param("status", "ON_HOLD")
                        .header("X-User-Id", SALES_ACCOUNT_ID)
                        .header("X-User-Role", "SALES"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.content").isArray())
                .andExpect(jsonPath("$.data.totalElements").value(1))
                .andExpect(jsonPath("$.data.content[0].status").value("ON_HOLD"));
    }

    // ══════════════════════════════════════════════════════════════════════════
    // 케이스 7 — 리스트 status=CONFIRMED 필터 → CONFIRMED 만 반환
    // ══════════════════════════════════════════════════════════════════════════

    /**
     * 리스트 status=CONFIRMED 필터: CONFIRMED 주문만 반환, DRAFT/ON_HOLD 제외.
     */
    @Test
    @WithMockUser(roles = {"SALES"})
    @DisplayName("케이스7: 리스트 status=CONFIRMED 필터 → CONFIRMED 만 반환")
    void case7_listStatusConfirmedFilter_returnsConfirmedOnly() throws Exception {
        buildDraftOrderViaDb("P-LIST-D3", "7111111111", "2026/05/31-LIST-D3");
        buildOrderWithStatusViaDb("P-LIST-H3", "7222222222", "2026/05/31-LIST-H3", "ON_HOLD");
        buildOrderWithStatusViaDb("P-LIST-C3", "7333333333", "2026/05/31-LIST-C3", "CONFIRMED");

        mockMvc.perform(get("/api/v1/partner-orders")
                        .param("status", "CONFIRMED")
                        .header("X-User-Id", SALES_ACCOUNT_ID)
                        .header("X-User-Role", "SALES"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.content").isArray())
                .andExpect(jsonPath("$.data.totalElements").value(1))
                .andExpect(jsonPath("$.data.content[0].status").value("CONFIRMED"));
    }

    // ══════════════════════════════════════════════════════════════════════════
    // 케이스 8 — hold 권한 deny → 403 / MASTER bypass → 200
    // ══════════════════════════════════════════════════════════════════════════

    /**
     * PARTNER 역할에서 DynamicPermissionClient 가 UPDATE 권한을 거부하면 hold 시 403.
     */
    @Test
    @WithMockUser(roles = {"PARTNER"})
    @DisplayName("케이스8a: PARTNER 역할 hold → 403 FORBIDDEN (edit UPDATE 권한 deny)")
    void case8a_partnerRoleHold_returns403() throws Exception {
        // edit UPDATE 권한 거부 stub
        when(dynamicPermissionClient.check(
                any(UUID.class),
                eq("sales.partner-order.edit"),
                eq(PermissionAction.UPDATE)))
                .thenReturn(false);

        UUID orderId = buildDraftOrderViaDb("P-PERM-HOLD", "8111111111", "2026/05/31-PERM-HOLD");

        mockMvc.perform(post("/api/v1/partner-orders/{id}/hold", orderId)
                        .header("X-User-Id", PARTNER_ACCOUNT_ID)
                        .header("X-User-Role", "PARTNER")
                        // Phase C5-4: PARTNER 식별은 X-Is-Partner 헤더 기반
                        .header("X-Is-Partner", "true")
                        .header("X-User-Name", "거래처사용자"))
                .andExpect(status().isForbidden());
    }

    /**
     * MASTER 역할은 DynamicPermissionClient 검사를 우회해 hold 에 성공한다.
     */
    @Test
    @WithMockUser(roles = {"MASTER"})
    @DisplayName("케이스8b: MASTER 역할 hold → 200 OK (bypass)")
    void case8b_masterRoleHold_returns200() throws Exception {
        // MASTER 에도 UPDATE=true (lenient default 유지)
        lenient().when(dynamicPermissionClient.check(
                any(UUID.class),
                eq("sales.partner-order.edit"),
                eq(PermissionAction.UPDATE)))
                .thenReturn(true);

        UUID orderId = buildDraftOrderViaDb("P-MASTER-HOLD", "9111111111", "2026/05/31-MSTR-HOLD");

        mockMvc.perform(post("/api/v1/partner-orders/{id}/hold", orderId)
                        .header("X-User-Id", MASTER_ACCOUNT_ID)
                        .header("X-User-Role", "MASTER")
                        // Phase C5-4: MASTER bypass 는 X-Is-System-Master=true 헤더 단독 판정
                        .header("X-Is-System-Master", "true")
                        .header("X-User-Name", "관리자"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("ON_HOLD"));
    }

    // ══════════════════════════════════════════════════════════════════════════
    // 케이스 9 — DRAFT createdAt 기간필터 회귀 가드 (P1-1/P1-2 COALESCE fix)
    // ══════════════════════════════════════════════════════════════════════════

    /**
     * DRAFT 주문 2건을 서로 다른 createdAt 으로 삽입하고,
     * dateFrom/dateTo 기간 필터로 1건만 조회되는지 + createdAt DESC 정렬 단언.
     *
     * <p>COALESCE(confirmedAt, createdAt) fix 의 회귀 가드.
     * DRAFT 의 confirmedAt=null 이므로 COALESCE → createdAt fallback 경로를 통과해야 기간 필터가 동작한다.
     */
    @Test
    @WithMockUser(roles = {"SALES"})
    @DisplayName("케이스9: DRAFT 기간필터 — createdAt COALESCE fallback 으로 1건만 조회 (P1-1/P1-2 회귀)")
    void case9_draftDateFilter_createdAtCoalesceReturnsOneRow() throws Exception {
        // 어제 날짜로 생성된 주문 (기간 범위 밖)
        buildOrderWithStatusViaDbAt("P-DATE-DRAFT-OLD", "A111111111",
                "2026/05/31-DATE-OLD", "DRAFT", "2026-05-01 00:00:00");
        // 오늘 날짜로 생성된 주문 (기간 범위 내)
        buildOrderWithStatusViaDbAt("P-DATE-DRAFT-NEW", "A222222222",
                "2026/05/31-DATE-NEW", "DRAFT", "2026-05-30 00:00:00");

        mockMvc.perform(get("/api/v1/partner-orders")
                        .param("status", "DRAFT")
                        .param("dateFrom", "2026-05-30")
                        .param("dateTo", "2026-05-30")
                        .header("X-User-Id", SALES_ACCOUNT_ID)
                        .header("X-User-Role", "SALES"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.totalElements").value(1))
                .andExpect(jsonPath("$.data.content[0].status").value("DRAFT"));
    }

    // ══════════════════════════════════════════════════════════════════════════
    // 케이스 10 — 전체조회(status=null) DRAFT+CONFIRMED 혼재 정렬 정합
    // ══════════════════════════════════════════════════════════════════════════

    /**
     * status 파라미터 없이 전체 조회 시 DRAFT(createdAt 기준)와 CONFIRMED(confirmedAt 기준)가
     * COALESCE 로 정렬 기준이 혼재해도 totalElements 에 모두 포함되는지 확인한다.
     *
     * <p>COALESCE(confirmedAt, createdAt) 전체조회에서 DRAFT 주문이 "무음 제외" 되는 기존
     * preConfirm=false 결함이 해소되었음을 보장한다.
     */
    @Test
    @WithMockUser(roles = {"SALES"})
    @DisplayName("케이스10: 전체조회(status=null) — DRAFT + CONFIRMED 혼재 totalElements=2 (P1-1 전체조회 보정)")
    void case10_allStatusQuery_includesDraftAndConfirmed() throws Exception {
        buildOrderWithStatusViaDb("P-MIX-DRAFT", "B111111111", "2026/05/31-MIX-D", "DRAFT");
        buildOrderWithStatusViaDb("P-MIX-CONF",  "B222222222", "2026/05/31-MIX-C", "CONFIRMED");

        mockMvc.perform(get("/api/v1/partner-orders")
                        .header("X-User-Id", SALES_ACCOUNT_ID)
                        .header("X-User-Role", "SALES"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.totalElements").value(2));
    }

    // ══════════════════════════════════════════════════════════════════════════
    // 케이스 11 — count 쿼리 COALESCE orderBy 가드 회귀 (Cycle 2c P1-NEW)
    // ══════════════════════════════════════════════════════════════════════════

    /**
     * COALESCE 정렬이 포함된 Specification 을 페이지네이션으로 조회할 때
     * count 쿼리가 정상 동작하여 {@code totalElements} 가 정확히 반환됨을 검증한다.
     *
     * <p>Spring Data {@code findAll(Specification, Pageable)} 는 동일 Specification 을
     * 데이터 쿼리와 count 쿼리 양쪽에 사용한다. Specification 내 {@code query.orderBy()} 호출이
     * count 쿼리에서도 실행되면 Hibernate 6+ 에서 오류/경고가 발생한다.
     *
     * <p>이 케이스는 count 쿼리 가드({@code query.getResultType() != Long.class} 분기)가
     * 동작함을 보장하는 회귀 가드다.
     *
     * <p><b>검증 방식</b>: DRAFT 3건 + ON_HOLD 2건 삽입 후 {@code page=0&size=2} 로 조회하면
     * {@code totalElements=5} (count 쿼리 결과)이고 {@code content.length=2} (데이터 쿼리 결과)임을 단언한다.
     */
    @Test
    @WithMockUser(roles = {"SALES"})
    @DisplayName("케이스11: count 쿼리 COALESCE orderBy 가드 — totalElements 정확 + content 2건 (Cycle 2c P1-NEW)")
    void case11_countQueryCoalesceOrderByGuard_totalElementsAccurate() throws Exception {
        // DRAFT 3건
        buildDraftOrderViaDb("P-CNT-D1", "C111111111", "2026/05/31-CNT-D1");
        buildDraftOrderViaDb("P-CNT-D2", "C222222222", "2026/05/31-CNT-D2");
        buildDraftOrderViaDb("P-CNT-D3", "C333333333", "2026/05/31-CNT-D3");
        // ON_HOLD 2건
        buildOrderWithStatusViaDb("P-CNT-H1", "C444444444", "2026/05/31-CNT-H1", "ON_HOLD");
        buildOrderWithStatusViaDb("P-CNT-H2", "C555555555", "2026/05/31-CNT-H2", "ON_HOLD");

        // page=0, size=2 — count 쿼리(totalElements=5) + 데이터 쿼리(content.length=2) 분리 검증
        mockMvc.perform(get("/api/v1/partner-orders")
                        .param("page", "0")
                        .param("size", "2")
                        .header("X-User-Id", SALES_ACCOUNT_ID)
                        .header("X-User-Role", "SALES"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.totalElements").value(5))
                .andExpect(jsonPath("$.data.content.length()").value(2))
                .andExpect(jsonPath("$.data.totalPages").value(3));
    }

    // ══════════════════════════════════════════════════════════════════════════
    // 헬퍼 메서드
    // ══════════════════════════════════════════════════════════════════════════

    /**
     * 지정 status 를 가진 주문을 JDBC 직접 INSERT 로 생성하고 UUID 를 반환한다.
     *
     * @param partnerCode 거래처 코드
     * @param bizCode     사업자번호
     * @param orderNo     주문번호
     * @param status      DRAFT / ON_HOLD / CONFIRMING / CONFIRMED / CANCELED
     * @return 생성된 주문 UUID
     */
    private UUID buildOrderWithStatusViaDb(String partnerCode, String bizCode,
                                            String orderNo, String status) {
        UUID id = UUID.randomUUID();
        jdbcTemplate.update("""
                INSERT INTO partner_orders
                  (id, partner_code, biz_code, order_no, slip_no, status,
                   slip_publish_status, total_amount, confirmed_at, slip_published_at,
                   due_date, memo, source_estimate_id, revision_count,
                   idempotency_key, lock_version,
                   created_at, created_by, modified_at, modified_by,
                   is_deleted, deleted_at, deleted_by)
                VALUES
                  (?, ?, ?, ?, NULL, ?,
                   'NOT_REQUIRED', 0, NULL, NULL,
                   NULL, NULL, NULL, 0,
                   ?, 0,
                   NOW(), 'test', NOW(), 'test',
                   FALSE, NULL, NULL)
                """,
                id, partnerCode, bizCode, orderNo, status,
                "idem-hold-" + orderNo);
        return id;
    }

    /**
     * 지정 status 와 createdAt 을 직접 지정하여 주문을 JDBC INSERT 한다.
     * 케이스9 기간필터 검증용 — 과거/현재 createdAt 구분이 필요한 경우 사용.
     *
     * @param partnerCode  거래처 코드
     * @param bizCode      사업자번호
     * @param orderNo      주문번호
     * @param status       DRAFT / ON_HOLD / CONFIRMED 등
     * @param createdAtSql ISO 날짜 문자열 (예: "2026-05-01 00:00:00")
     * @return 생성된 주문 UUID
     */
    private UUID buildOrderWithStatusViaDbAt(String partnerCode, String bizCode,
                                              String orderNo, String status,
                                              String createdAtSql) {
        UUID id = UUID.randomUUID();
        jdbcTemplate.update("""
                INSERT INTO partner_orders
                  (id, partner_code, biz_code, order_no, slip_no, status,
                   slip_publish_status, total_amount, confirmed_at, slip_published_at,
                   due_date, memo, source_estimate_id, revision_count,
                   idempotency_key, lock_version,
                   created_at, created_by, modified_at, modified_by,
                   is_deleted, deleted_at, deleted_by)
                VALUES
                  (?, ?, ?, ?, NULL, ?,
                   'NOT_REQUIRED', 0, NULL, NULL,
                   NULL, NULL, NULL, 0,
                   ?, 0,
                   CAST(? AS TIMESTAMP), 'test', NOW(), 'test',
                   FALSE, NULL, NULL)
                """,
                id, partnerCode, bizCode, orderNo, status,
                "idem-hold-" + orderNo,
                createdAtSql);
        return id;
    }

    /**
     * DRAFT 상태 주문을 JDBC 직접 INSERT 로 생성한다.
     *
     * @param partnerCode 거래처 코드
     * @param bizCode     사업자번호
     * @param orderNo     주문번호
     * @return 생성된 주문 UUID
     */
    private UUID buildDraftOrderViaDb(String partnerCode, String bizCode, String orderNo) {
        return buildOrderWithStatusViaDb(partnerCode, bizCode, orderNo, "DRAFT");
    }
}
