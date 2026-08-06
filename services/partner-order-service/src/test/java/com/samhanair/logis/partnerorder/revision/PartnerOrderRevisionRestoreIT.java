package com.samhanair.logis.partnerorder.revision;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.samhanair.logis.common.http.HttpHeaderConstants;
import com.samhanair.logis.partnerorder.PartnerOrderServiceApplication;
import com.samhanair.logis.partnerorder.audit.repository.PartnerOrderAuditLogRepository;
import com.samhanair.logis.partnerorder.client.DcConfigClient;
import com.samhanair.logis.partnerorder.client.EstimateClient;
import com.samhanair.logis.partnerorder.client.InventoryClient;
import com.samhanair.logis.partnerorder.client.PartnerAuthClient;
import com.samhanair.logis.partnerorder.client.ProductClient;
import com.samhanair.logis.partnerorder.client.SlipServiceClient;
import com.samhanair.logis.partnerorder.domain.PartnerOrder;
import com.samhanair.logis.partnerorder.it.AbstractPostgresIT;
import com.samhanair.logis.partnerorder.repository.PartnerOrderRepository;
import com.samhanair.logis.partnerorder.repository.SlipPublishOutboxRepository;
import com.samhanair.logis.partnerorder.revision.repository.PartnerOrderRevisionRepository;
import com.samhanair.logis.partnerorder.vendor.client.PartnerLookupClient;
import com.samhanair.logis.partnerorder.vendor.client.ProductCatalogLookupClient;
import com.samhanair.logis.security.permission.DynamicPermissionClient;
import com.samhanair.logis.security.permission.PermissionAction;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

/**
 * Phase 2.4 거래처 주문 버전이력 + point-in-time 복원 통합 테스트 (Task 10).
 *
 * <p>실 Postgres(Testcontainers) + 실 Flyway V7 기반. {@link AbstractPostgresIT} 상속으로
 * Docker 미가용 시 자동 skip ({@code DockerAvailableCondition}) 처리된다.
 *
 * <p><b>검증 케이스:</b>
 * <ol>
 *   <li>캡처 타임라인 — from-estimate 로 DRAFT 주문 생성 → rev1(CREATE) / update → rev2(EDIT).
 *       GET /revisions 목록이 내림차순 + changeSummary 정확. actorName 에 UUID 노출 안 됨.</li>
 *   <li>DRAFT 복원 — rev1 로 복원 → 헤더+라인이 rev1 시점과 일치 + 새 RESTORE revision(sourceRevisionNo=1) 생성.
 *       slipResyncRequired=false.</li>
 *   <li>CONFIRMED 복원 — confirm 으로 CONFIRMED 만든 뒤 update → 복원 → 성공 + slipResyncRequired=true.
 *       slip 연동 필드(slipNo 등) 보존(역적용 안 됨) 확인.</li>
 *   <li>CANCELED/CONFIRMING 복원 → 409.</li>
 *   <li>권한 — RESTORE deny(권한 없는 role) → 403 / MASTER bypass → 200.
 *       (DynamicPermissionClient @MockBean 7-action stub + X-User-Id 헤더)</li>
 *   <li>채번 단조증가 — rev1→2→3... 검증.</li>
 * </ol>
 *
 * <p><b>외부 client @MockBean 격리</b> ({@code feedback_it_mockbean_external_clients}):
 * EstimateClient, DcConfigClient, ProductClient, InventoryClient, SlipServiceClient,
 * PartnerAuthClient, PartnerLookupClient, ProductCatalogLookupClient,
 * DynamicPermissionClient 전부 @MockBean + lenient stub. Eureka 비활성 환경에서도
 * Spring Context 부팅 통과.
 *
 * <p>UUID 비공개 가드 ({@code feedback_uuid_no_user_visibility}): actorName 에 UUID 패턴
 * 문자열이 노출되지 않음을 직접 단언한다.
 */
@SpringBootTest(classes = PartnerOrderServiceApplication.class)
@AutoConfigureMockMvc
class PartnerOrderRevisionRestoreIT extends AbstractPostgresIT {

    // ── 테스트 상수 ─────────────────────────────────────────────────────────────

    /** MASTER 역할 계정 UUID — RESTORE 권한 우회 검증용. */
    private static final String MASTER_ACCOUNT_ID = "20000000-0000-0000-0000-000000000001";
    /** SALES 역할 계정 UUID — 정상 RESTORE 실행 주체. */
    private static final String SALES_ACCOUNT_ID  = "20000000-0000-0000-0000-000000000002";
    /** PARTNER 역할 계정 UUID — RESTORE 권한 없는 역할 403 검증용. */
    private static final String PARTNER_ACCOUNT_ID = "20000000-0000-0000-0000-000000000003";

    /** UUID 패턴 — actorName 비공개 가드 검증용 정규표현식. */
    private static final String UUID_REGEX =
            "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}";

    // ── 의존성 ─────────────────────────────────────────────────────────────────

    @Autowired private MockMvc mockMvc;
    @Autowired private PartnerOrderRepository orderRepository;
    @Autowired private PartnerOrderRevisionRepository revisionRepository;
    @Autowired private PartnerOrderAuditLogRepository auditLogRepository;
    @Autowired private SlipPublishOutboxRepository outboxRepository;
    @Autowired private JdbcTemplate jdbcTemplate;

    // ── 외부 client MockBean ────────────────────────────────────────────────────

    /**
     * estimate-service 조회 포트. from-estimate 흐름에서 견적 스냅샷 반환용.
     * {@code feedback_it_mockbean_external_clients} 기준 격리 필수.
     */
    @MockBean private EstimateClient estimateClient;

    /** DC 할인 설정 조회. confirm 흐름 내부 호출용. */
    @MockBean private DcConfigClient dcConfigClient;

    /** 상품 카탈로그 조회. confirm 흐름 내부 호출용. */
    @MockBean private ProductClient productClient;

    /** 재고 예약. confirm 흐름 내부 호출용. */
    @MockBean private InventoryClient inventoryClient;

    /** 출고전표 발행. confirm 흐름 내부 호출용. */
    @MockBean private SlipServiceClient slipServiceClient;

    /** 거래처 인증 조회. */
    @MockBean private PartnerAuthClient partnerAuthClient;

    /** 거래처 목록 조회 (vendor). */
    @MockBean private PartnerLookupClient partnerLookupClient;

    /** 상품 카탈로그 룩업 (vendor). */
    @MockBean private ProductCatalogLookupClient catalogLookupClient;

    /**
     * 동적 권한 검증 클라이언트.
     * 7-action stub + X-User-Id 헤더 패턴 ({@code feedback_enforcement_real_http_test}).
     */
    @MockBean private DynamicPermissionClient dynamicPermissionClient;

    // ── 테스트 셋업 ─────────────────────────────────────────────────────────────

    @BeforeEach
    void setUp() {
        // FK 순서 준수 cleanup: outbox → audit → revisions → lines → orders
        outboxRepository.deleteAll();
        auditLogRepository.deleteAll();
        jdbcTemplate.update("DELETE FROM partner_order_revisions");
        jdbcTemplate.update("DELETE FROM partner_order_lines");
        orderRepository.deleteAll();

        // DynamicPermissionClient 7-action lenient stub (기본=허용)
        lenient().when(dynamicPermissionClient.canView(anyString(), anyString())).thenReturn(true);
        lenient().when(dynamicPermissionClient.canEdit(anyString(), anyString())).thenReturn(true);
        lenient().when(dynamicPermissionClient.check(
                any(UUID.class), anyString(), any(PermissionAction.class))).thenReturn(true);

        // 외부 client 기본 lenient stub
        lenient().when(dcConfigClient.calculatePrices(anyString(), anyList())).thenReturn(java.util.Map.of());
        lenient().when(productClient.lookup(anyList())).thenReturn(List.of());
        lenient().when(partnerLookupClient.findByPartnerCodeForIdentity(anyString()))
                .thenAnswer(invocation -> Optional.of(new com.samhanair.logis.partnerorder.vendor.client.PartnerSummary(
                        UUID.nameUUIDFromBytes(invocation.getArgument(0, String.class)
                                .getBytes(StandardCharsets.UTF_8)),
                        invocation.getArgument(0, String.class), null,
                        businessNoFor(invocation.getArgument(0, String.class)) )));
        // InventoryClient.reserve(UUID, UUID, int) 는 concrete class — 직접 stub 하지 않음.
        // confirm 흐름 IT 에서만 필요하므로 각 케이스에서 개별 stub (본 IT 는 confirm 경로 미사용).
    }

    private String businessNoFor(String partnerCode) {
        return switch (partnerCode) {
            case "P-EDITED" -> "0987654321";
            case "P-AFTER-EDIT", "P-EDIT-CASE8" -> "1111111111";
            case "P-CASE9-EDITED" -> "9999999999";
            case "P-MONO-TEST" -> "1122334455";
            default -> "1234567890";
        };
    }

    // ══════════════════════════════════════════════════════════════════════════
    // 케이스 1 — 캡처 타임라인: rev1(CREATE) + rev2(EDIT) + 목록 내림차순 + changeSummary + actorName 비공개
    // ══════════════════════════════════════════════════════════════════════════

    /**
     * from-estimate 로 DRAFT 주문 생성(rev1=CREATE), update 로 편집(rev2=EDIT).
     * GET /revisions 목록이 rev2→rev1 내림차순으로 반환되고, changeSummary 가 정확하며,
     * actorName 에 UUID 패턴 문자열이 노출되지 않는다.
     */
    @Test
    @WithMockUser(roles = {"SALES"})
    @DisplayName("케이스1: 캡처 타임라인 — CREATE→EDIT 목록 내림차순 + changeSummary + actorName UUID 비공개")
    void case1_captureTimeline_listDescAndChangeSummaryAndActorNameHidesUuid() throws Exception {
        UUID estimateId = UUID.randomUUID();
        when(estimateClient.findById(estimateId)).thenReturn(Optional.of(estimateSnapshot(estimateId)));

        // (1) from-estimate → DRAFT 주문 생성 (rev1=CREATE)
        MvcResult createResult = mockMvc.perform(
                        post("/api/v1/partner-orders/from-estimate/{id}", estimateId)
                                .header("X-User-Id", SALES_ACCOUNT_ID)
                                .header(HttpHeaderConstants.CALLER_ROLE_HEADER, "SALES")
                                .header("X-User-Name", "영업담당자"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.status").value("DRAFT"))
                .andReturn();

        String orderIdStr = extractOrderId(createResult);
        UUID orderId = UUID.fromString(orderIdStr);

        // rev1 생성 직후 revision 1건 확인
        assertThat(revisionRepository.findByPartnerOrderIdOrderByRevisionNoDesc(orderId)).hasSize(1);

        // (2) update → 편집 (rev2=EDIT)
        String modifiedAt = currentVersionTimestamp(orderId);

        mockMvc.perform(
                        put("/api/v1/partner-orders/{id}", orderId)
                                .header("X-User-Id", SALES_ACCOUNT_ID)
                                .header(HttpHeaderConstants.CALLER_ROLE_HEADER, "SALES")
                                .header("X-User-Name", "영업편집자")
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(updateJson(modifiedAt, "P-EDITED", "0987654321", 3)))
                .andExpect(status().isOk());

        // rev2 추가 후 2건
        assertThat(revisionRepository.findByPartnerOrderIdOrderByRevisionNoDesc(orderId)).hasSize(2);

        // (3) GET /revisions 목록 — 내림차순(rev2 먼저) 반환 확인
        mockMvc.perform(
                        get("/api/v1/partner-orders/{id}/revisions", orderId)
                                .header("X-User-Id", SALES_ACCOUNT_ID)
                                .header(HttpHeaderConstants.CALLER_ROLE_HEADER, "SALES"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data").isArray())
                .andExpect(jsonPath("$.data.length()").value(2))
                // 내림차순: 첫 번째가 최신(rev2=EDIT)
                .andExpect(jsonPath("$.data[0].revisionNo").value(2))
                .andExpect(jsonPath("$.data[0].revisionType").value("EDIT"))
                // rev1 = CREATE
                .andExpect(jsonPath("$.data[1].revisionNo").value(1))
                .andExpect(jsonPath("$.data[1].revisionType").value("CREATE"))
                // changeSummary — rev1(CREATE) 은 lineAdded=2 (최초 생성), headerChanged=0
                .andExpect(jsonPath("$.data[1].changeSummary.lineAdded").value(2))
                .andExpect(jsonPath("$.data[1].changeSummary.headerChanged").value(0))
                // actorName 에 UUID 패턴이 노출되지 않는다
                .andExpect(jsonPath("$.data[0].actorName").value("영업편집자"))
                .andExpect(jsonPath("$.data[1].actorName").value("영업담당자"));

        // (4) actorName UUID 비공개 — X-User-Name 헤더를 UUID 로 전달한 경우 null 저장 확인
        //     별도 주문으로 UUID actorName 검증 (컨트롤러 경로 통해 확인)
        UUID est2 = UUID.randomUUID();
        when(estimateClient.findById(est2)).thenReturn(Optional.of(estimateSnapshot(est2)));
        MvcResult createResult2 = mockMvc.perform(
                        post("/api/v1/partner-orders/from-estimate/{id}", est2)
                                .header("X-User-Id", SALES_ACCOUNT_ID)
                                .header(HttpHeaderConstants.CALLER_ROLE_HEADER, "SALES")
                                .header("X-User-Name", SALES_ACCOUNT_ID)) // UUID 를 이름으로 전달
                .andExpect(status().isCreated())
                .andReturn();

        UUID orderId2 = UUID.fromString(extractOrderId(createResult2));
        // GET /revisions 에서 actorName 은 null (UUID 노출 금지)
        mockMvc.perform(
                        get("/api/v1/partner-orders/{id}/revisions", orderId2)
                                .header("X-User-Id", SALES_ACCOUNT_ID)
                                .header(HttpHeaderConstants.CALLER_ROLE_HEADER, "SALES"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data[0].actorName").doesNotExist());
    }

    // ══════════════════════════════════════════════════════════════════════════
    // 케이스 2 — DRAFT 복원: rev1 복원 → 헤더+라인 rev1 시점과 일치 + RESTORE revision(sourceRevisionNo=1) 생성
    // ══════════════════════════════════════════════════════════════════════════

    /**
     * DRAFT 상태 주문을 rev1 스냅샷으로 복원한다.
     * 복원 후 헤더+라인이 rev1 시점과 일치하고, 새 RESTORE revision(sourceRevisionNo=1) 이 생성되며,
     * slipResyncRequired=false 를 반환한다.
     */
    @Test
    @WithMockUser(roles = {"SALES"})
    @DisplayName("케이스2: DRAFT 복원 — rev1 복원 후 헤더+라인 일치 + RESTORE revision 생성 + slipResyncRequired=false")
    void case2_draftRestore_headerAndLinesMatchRev1AndRestoreRevisionCreated() throws Exception {
        // (1) DRAFT 주문 생성 (rev1=CREATE)
        UUID estimateId = UUID.randomUUID();
        when(estimateClient.findById(estimateId)).thenReturn(Optional.of(estimateSnapshot(estimateId)));

        MvcResult createResult = mockMvc.perform(
                        post("/api/v1/partner-orders/from-estimate/{id}", estimateId)
                                .header("X-User-Id", SALES_ACCOUNT_ID)
                                .header(HttpHeaderConstants.CALLER_ROLE_HEADER, "SALES")
                                .header("X-User-Name", "영업담당자"))
                .andExpect(status().isCreated())
                .andReturn();

        UUID orderId = UUID.fromString(extractOrderId(createResult));

        // rev1 이 실제로 생성되었는지 확인 (1건)
        // [P1-5 수정] rev1LineCount 가 revisionNo(=1) 를 가져오는 무의미 단언이었음.
        // 실제 revision 존재 여부를 hasSize(1) 로 검증하고, rev1 의 revisionNo=1 을 직접 단언한다.
        var rev1List = revisionRepository.findByPartnerOrderIdOrderByRevisionNoDesc(orderId);
        assertThat(rev1List).hasSize(1);
        assertThat(rev1List.get(0).getRevisionNo()).isEqualTo(1);

        // (2) update → 헤더+라인 변경 (rev2=EDIT)
        String modifiedAt = currentVersionTimestamp(orderId);

        mockMvc.perform(
                        put("/api/v1/partner-orders/{id}", orderId)
                                .header("X-User-Id", SALES_ACCOUNT_ID)
                                .header(HttpHeaderConstants.CALLER_ROLE_HEADER, "SALES")
                                .header("X-User-Name", "영업편집자")
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(updateJson(modifiedAt, "P-AFTER-EDIT", "1111111111", 5)))
                .andExpect(status().isOk());

        // 편집 후 partnerCode 확인
        PartnerOrder afterEdit = orderRepository.findById(orderId).orElseThrow();
        assertThat(afterEdit.getPartnerCode()).isEqualTo("P-AFTER-EDIT");

        // (3) rev1 로 복원
        mockMvc.perform(
                        post("/api/v1/partner-orders/{id}/revisions/{no}/restore", orderId, 1)
                                .header("X-User-Id", SALES_ACCOUNT_ID)
                                .header(HttpHeaderConstants.CALLER_ROLE_HEADER, "SALES")
                                .header("X-User-Name", "복원담당자"))
                .andExpect(status().isOk())
                // 복원 후 헤더가 rev1 시점으로 복구 (estimate 의 partnerCode = "P-RST-IT-001")
                .andExpect(jsonPath("$.data.order.partnerCode").value("P-RST-IT-001"))
                .andExpect(jsonPath("$.data.order.bizCode").value("1234567890"))
                // DRAFT 복원 → slipResyncRequired=false
                .andExpect(jsonPath("$.data.slipResyncRequired").value(false))
                // 라인 2개 복구 (estimateSnapshot 기준)
                .andExpect(jsonPath("$.data.order.lines.length()").value(2));

        // (4) 복원 후 RESTORE revision(rev3) 생성 확인 + sourceRevisionNo=1
        var revisions = revisionRepository.findByPartnerOrderIdOrderByRevisionNoDesc(orderId);
        assertThat(revisions).hasSize(3);
        var restoreRev = revisions.stream()
                .filter(r -> "RESTORE".equals(r.getRevisionType().name()))
                .findFirst().orElseThrow();
        assertThat(restoreRev.getRevisionNo()).isEqualTo(3);
        assertThat(restoreRev.getSourceRevisionNo()).isEqualTo(1);
    }

    // ══════════════════════════════════════════════════════════════════════════
    // 케이스 3 — CONFIRMED 복원: slipResyncRequired=true + slip 연동 필드 보존
    // ══════════════════════════════════════════════════════════════════════════

    /**
     * CONFIRMED 상태 주문(slipNo 보유)을 복원하면 성공하되 slipResyncRequired=true 를 반환한다.
     * slip 연동 필드(slipNo, slipPublishStatus) 는 역적용되지 않고 보존된다.
     */
    @Test
    @WithMockUser(roles = {"SALES"})
    @DisplayName("케이스3: CONFIRMED 복원 — slipResyncRequired=true + slipNo 보존(역적용 안 됨)")
    void case3_confirmedRestore_slipResyncRequiredTrueAndSlipFieldsPreserved() throws Exception {
        // CONFIRMED 상태 주문을 직접 DB 삽입으로 생성
        PartnerOrder confirmedOrder = buildConfirmedOrder("P-CONF-IT-001", "9876543210",
                "2026/05/30-CONF-IT");
        orderRepository.saveAndFlush(confirmedOrder);
        UUID orderId = confirmedOrder.getId();

        // rev1 (CREATE) 수동 캡처 (DB 직접 INSERT: 서비스 계층 없이, snapshot JSONB 캐스팅 필수)
        jdbcTemplate.update("""
                INSERT INTO partner_order_revisions
                  (id, partner_order_id, revision_no, revision_type, source_revision_no,
                   order_no, snapshot, actor_id, actor_name, actor_color,
                   created_at, created_by, modified_at, modified_by,
                   is_deleted)
                VALUES
                  (gen_random_uuid(), ?, 1, 'CREATE', NULL,
                   ?, ?::jsonb, NULL, '초기저장', NULL,
                   NOW(), 'test', NOW(), 'test',
                   FALSE)
                """,
                orderId,
                "2026/05/30-CONF-IT",
                buildSnapshotJson(confirmedOrder, "P-ORIG-PARTNER", "0000000000"));

        // update → 헤더 변경 (rev2=EDIT) — 직접 DB 삽입
        jdbcTemplate.update("""
                INSERT INTO partner_order_revisions
                  (id, partner_order_id, revision_no, revision_type, source_revision_no,
                   order_no, snapshot, actor_id, actor_name, actor_color,
                   created_at, created_by, modified_at, modified_by,
                   is_deleted)
                VALUES
                  (gen_random_uuid(), ?, 2, 'EDIT', NULL,
                   ?, ?::jsonb, NULL, '편집자', NULL,
                   NOW(), 'test', NOW(), 'test',
                   FALSE)
                """,
                orderId,
                "2026/05/30-CONF-IT",
                buildSnapshotJson(confirmedOrder, "P-CONF-IT-001", "9876543210"));

        // CONFIRMED 주문에 추가 라인 삽입 (partner_order_lines 에는 lock_version 컬럼 없음 — V5 는 partner_orders 전용)
        jdbcTemplate.update("""
                INSERT INTO partner_order_lines
                  (id, partner_order_id, product_id, model_name, product_name,
                   category_key, quantity, price_vat, subtotal, remark,
                   created_at, created_by, modified_at, modified_by,
                   is_deleted, deleted_at, deleted_by)
                VALUES
                  (gen_random_uuid(), ?, gen_random_uuid(), 'MODEL-CONF', '완료상품',
                   'homemulti', 1, 100000, 100000, NULL,
                   NOW(), 'test', NOW(), 'test',
                   FALSE, NULL, NULL)
                """, orderId);

        String slipNoBeforeRestore = confirmedOrder.getSlipNo();

        // rev1 로 복원
        mockMvc.perform(
                        post("/api/v1/partner-orders/{id}/revisions/{no}/restore", orderId, 1)
                                .header("X-User-Id", SALES_ACCOUNT_ID)
                                .header(HttpHeaderConstants.CALLER_ROLE_HEADER, "SALES")
                                .header("X-User-Name", "복원담당자"))
                .andExpect(status().isOk())
                // CONFIRMED 복원 → slipResyncRequired=true
                .andExpect(jsonPath("$.data.slipResyncRequired").value(true));

        // slipNo 는 역적용되지 않고 보존 (DB 직접 조회)
        Integer slipNoCount = jdbcTemplate.queryForObject("""
                SELECT COUNT(*) FROM partner_orders
                WHERE id = ? AND slip_no = ? AND is_deleted = FALSE
                """, Integer.class, orderId, slipNoBeforeRestore);
        assertThat(slipNoCount).isEqualTo(1);

        // [P1-6] 복원 후 status=CONFIRMED 보존 확인 — restoreHeader 는 status 를 변경하지 않으므로
        // CONFIRMED 상태가 그대로 유지되어야 한다. DB 레벨에서 직접 단언한다.
        String statusAfterRestore = jdbcTemplate.queryForObject(
                "SELECT status FROM partner_orders WHERE id = ?", String.class, orderId);
        assertThat(statusAfterRestore).isEqualTo("CONFIRMED");

        // RESTORE revision 이 추가 생성됨 (rev3)
        var revisions = revisionRepository.findByPartnerOrderIdOrderByRevisionNoDesc(orderId);
        assertThat(revisions).hasSize(3);
        var restoreRev = revisions.stream()
                .filter(r -> "RESTORE".equals(r.getRevisionType().name()))
                .findFirst().orElseThrow();
        assertThat(restoreRev.getSourceRevisionNo()).isEqualTo(1);
    }

    // ══════════════════════════════════════════════════════════════════════════
    // 케이스 4 — CANCELED / CONFIRMING 복원 → 409
    // ══════════════════════════════════════════════════════════════════════════

    /**
     * CANCELED 상태 주문에 복원을 시도하면 409 CONFLICT 를 반환한다.
     */
    @Test
    @WithMockUser(roles = {"SALES"})
    @DisplayName("케이스4a: CANCELED 상태 복원 → 409 CONFLICT")
    void case4a_canceledRestore_returns409() throws Exception {
        // CANCELED 주문 직접 DB 삽입
        UUID orderId = buildOrderWithStatusViaDb("P-CANCEL-IT", "5555555555",
                "2026/05/30-CNCL-IT", "CANCELED");

        // rev1 삽입 (파라미터 순서: orderId, revisionType, orderNo, snapshotJson)
        jdbcTemplate.update(revisionInsertSql(), orderId, "CREATE", "2026/05/30-CNCL-IT",
                minimalSnapshotJson("P-CANCEL-IT"));

        mockMvc.perform(
                        post("/api/v1/partner-orders/{id}/revisions/{no}/restore", orderId, 1)
                                .header("X-User-Id", SALES_ACCOUNT_ID)
                                .header(HttpHeaderConstants.CALLER_ROLE_HEADER, "SALES")
                                .header("X-User-Name", "복원담당자"))
                .andExpect(status().isConflict());
    }

    /**
     * CONFIRMING 상태 주문에 복원을 시도하면 409 CONFLICT 를 반환한다.
     */
    @Test
    @WithMockUser(roles = {"SALES"})
    @DisplayName("케이스4b: CONFIRMING 상태 복원 → 409 CONFLICT")
    void case4b_confirmingRestore_returns409() throws Exception {
        UUID orderId = buildOrderWithStatusViaDb("P-CNFRMING-IT", "6666666666",
                "2026/05/30-CFMG-IT", "CONFIRMING");

        jdbcTemplate.update(revisionInsertSql(), orderId, "CREATE", "2026/05/30-CFMG-IT",
                minimalSnapshotJson("P-CNFRMING-IT"));

        mockMvc.perform(
                        post("/api/v1/partner-orders/{id}/revisions/{no}/restore", orderId, 1)
                                .header("X-User-Id", SALES_ACCOUNT_ID)
                                .header(HttpHeaderConstants.CALLER_ROLE_HEADER, "SALES")
                                .header("X-User-Name", "복원담당자"))
                .andExpect(status().isConflict());
    }

    // ══════════════════════════════════════════════════════════════════════════
    // 케이스 5 — 권한: RESTORE deny(PARTNER) → 403 / MASTER bypass → 200
    // ══════════════════════════════════════════════════════════════════════════

    /**
     * PARTNER 역할은 DynamicPermissionClient 에서 RESTORE 권한이 거부되면 403 을 반환한다.
     */
    @Test
    @WithMockUser(roles = {"PARTNER"})
    @DisplayName("케이스5a: PARTNER 역할 RESTORE → 403 FORBIDDEN")
    void case5a_partnerRoleRestore_returns403() throws Exception {
        // RESTORE 권한 거부 stub
        when(dynamicPermissionClient.check(
                any(UUID.class),
                eq("sales.partner-order.revisions"),
                eq(PermissionAction.RESTORE)))
                .thenReturn(false);

        UUID orderId = buildDraftOrderViaDb("P-PERM-TEST", "7777777777", "2026/05/30-PERM-IT");
        jdbcTemplate.update(revisionInsertSql(), orderId, "CREATE", "2026/05/30-PERM-IT",
                minimalSnapshotJson("P-PERM-TEST"));

        mockMvc.perform(
                        post("/api/v1/partner-orders/{id}/revisions/{no}/restore", orderId, 1)
                                .header("X-User-Id", PARTNER_ACCOUNT_ID)
                                .header(HttpHeaderConstants.CALLER_ROLE_HEADER, "PARTNER")
                                // Phase C5-4: PARTNER 식별은 X-Is-Partner 헤더 기반
                                .header(HttpHeaderConstants.IS_PARTNER_HEADER, "true")
                                .header("X-User-Name", "거래처사용자"))
                .andExpect(status().isForbidden());
    }

    /**
     * MASTER 역할은 DynamicPermissionClient 검사를 우회해 RESTORE 에 성공한다.
     * (MASTER bypass — DynamicPermissionClient 는 MASTER 에 모든 권한 자동 허용)
     */
    @Test
    @WithMockUser(roles = {"MASTER"})
    @DisplayName("케이스5b: MASTER 역할 RESTORE → 200 OK (bypass)")
    void case5b_masterRoleRestore_returns200() throws Exception {
        // MASTER 에도 RESTORE=true (lenient default 유지)
        lenient().when(dynamicPermissionClient.check(
                any(UUID.class),
                eq("sales.partner-order.revisions"),
                eq(PermissionAction.RESTORE)))
                .thenReturn(true);

        UUID orderId = buildDraftOrderViaDb("P-MASTER-TEST", "8888888888", "2026/05/30-MSTR-IT");
        jdbcTemplate.update(revisionInsertSql(), orderId, "CREATE", "2026/05/30-MSTR-IT",
                minimalSnapshotJson("P-MASTER-TEST"));
        // 라인 1개 삽입 (restore 에 lines 필수, partner_order_lines 에는 lock_version 없음)
        jdbcTemplate.update("""
                INSERT INTO partner_order_lines
                  (id, partner_order_id, product_id, model_name, product_name,
                   category_key, quantity, price_vat, subtotal, remark,
                   created_at, created_by, modified_at, modified_by,
                   is_deleted, deleted_at, deleted_by)
                VALUES
                  (gen_random_uuid(), ?, gen_random_uuid(), 'MODEL-MST', '마스터상품',
                   'homemulti', 1, 50000, 50000, NULL,
                   NOW(), 'test', NOW(), 'test',
                   FALSE, NULL, NULL)
                """, orderId);

        // 복원 스냅샷이 라인을 포함하도록 rev1 을 라인 포함 스냅샷으로 교체
        jdbcTemplate.update("DELETE FROM partner_order_revisions WHERE partner_order_id = ?", orderId);
        jdbcTemplate.update("""
                INSERT INTO partner_order_revisions
                  (id, partner_order_id, revision_no, revision_type, source_revision_no,
                   order_no, snapshot, actor_id, actor_name, actor_color,
                   created_at, created_by, modified_at, modified_by,
                   is_deleted)
                VALUES
                  (gen_random_uuid(), ?, 1, 'CREATE', NULL,
                   ?, ?::jsonb, NULL, '관리자', NULL,
                   NOW(), 'test', NOW(), 'test',
                   FALSE)
                """,
                orderId,
                "2026/05/30-MSTR-IT",
                snapshotWithOneLine("P-MASTER-TEST", "8888888888"));

        mockMvc.perform(
                        post("/api/v1/partner-orders/{id}/revisions/{no}/restore", orderId, 1)
                                .header("X-User-Id", MASTER_ACCOUNT_ID)
                                .header(HttpHeaderConstants.CALLER_ROLE_HEADER, "MASTER")
                                .header("X-User-Name", "관리자"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.slipResyncRequired").value(false));
    }

    // ══════════════════════════════════════════════════════════════════════════
    // 케이스 6 — 채번 단조증가: rev1→2→3 검증
    // ══════════════════════════════════════════════════════════════════════════

    /**
     * CREATE→EDIT→RESTORE 순서로 3회 캡처 시 revision_no 가 1, 2, 3 으로 단조 증가한다.
     */
    @Test
    @WithMockUser(roles = {"SALES"})
    @DisplayName("케이스6: 채번 단조증가 — rev1→2→3 revisionNo 일관")
    void case6_revisionNoMonotonicallyIncreases() throws Exception {
        UUID estimateId = UUID.randomUUID();
        when(estimateClient.findById(estimateId)).thenReturn(Optional.of(estimateSnapshot(estimateId)));

        // rev1 생성 (CREATE)
        MvcResult createResult = mockMvc.perform(
                        post("/api/v1/partner-orders/from-estimate/{id}", estimateId)
                                .header("X-User-Id", SALES_ACCOUNT_ID)
                                .header(HttpHeaderConstants.CALLER_ROLE_HEADER, "SALES")
                                .header("X-User-Name", "영업담당자"))
                .andExpect(status().isCreated())
                .andReturn();

        UUID orderId = UUID.fromString(extractOrderId(createResult));

        // rev2 생성 (EDIT)
        mockMvc.perform(
                        put("/api/v1/partner-orders/{id}", orderId)
                                .header("X-User-Id", SALES_ACCOUNT_ID)
                                .header(HttpHeaderConstants.CALLER_ROLE_HEADER, "SALES")
                                .header("X-User-Name", "편집자")
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(updateJson(currentVersionTimestamp(orderId),
                                        "P-MONO-TEST", "1122334455", 2)))
                .andExpect(status().isOk());

        // rev3 생성 (RESTORE rev1)
        mockMvc.perform(
                        post("/api/v1/partner-orders/{id}/revisions/{no}/restore", orderId, 1)
                                .header("X-User-Id", SALES_ACCOUNT_ID)
                                .header(HttpHeaderConstants.CALLER_ROLE_HEADER, "SALES")
                                .header("X-User-Name", "복원담당자"))
                .andExpect(status().isOk());

        // 채번 단조증가 확인 (1, 2, 3)
        var revisions = revisionRepository.findByPartnerOrderIdOrderByRevisionNoDesc(orderId);
        assertThat(revisions).hasSize(3);
        List<Integer> revNos = revisions.stream()
                .map(r -> r.getRevisionNo())
                .sorted()
                .toList();
        assertThat(revNos).containsExactly(1, 2, 3);

        // 타입 순서 확인 (오름차순 정렬: CREATE, EDIT, RESTORE)
        var sorted = revisions.stream()
                .sorted(java.util.Comparator.comparingInt(r -> r.getRevisionNo()))
                .toList();
        assertThat(sorted.get(0).getRevisionType().name()).isEqualTo("CREATE");
        assertThat(sorted.get(1).getRevisionType().name()).isEqualTo("EDIT");
        assertThat(sorted.get(2).getRevisionType().name()).isEqualTo("RESTORE");
    }

    // ══════════════════════════════════════════════════════════════════════════
    // 케이스 7 — 삭제 후 복원: DELETE revision 캡처 + soft-deleted 주문 복원(undelete)
    // ══════════════════════════════════════════════════════════════════════════

    /**
     * DRAFT 주문 → delete (DELETE revision 캡처 확인) → 삭제된 주문을 과거 rev 로 복원
     * → is_deleted=false + 내용 복구 + RESTORE revision 생성.
     *
     * <p>검증 사항:
     * <ul>
     *   <li>delete 호출 후 revision_type=DELETE 인 revision 1건 생성</li>
     *   <li>delete 후 주문이 soft-deleted (is_deleted=true) 상태</li>
     *   <li>삭제된 주문에 대해 restore(rev1) 호출 → 200 OK</li>
     *   <li>복원 후 is_deleted=false (undelete)</li>
     *   <li>복원 후 헤더 + 라인이 rev1 시점으로 복구</li>
     *   <li>RESTORE revision 생성 (DELETE revision 포함 총 3건: CREATE→DELETE→RESTORE)</li>
     * </ul>
     */
    @Test
    @WithMockUser(roles = {"SALES"})
    @DisplayName("케이스7: DRAFT 삭제 → DELETE revision 캡처 → 삭제된 주문 복원(undelete + 내용 복구) → RESTORE revision 생성")
    void case7_deleteAndRestore_undeleteAndContentRestored() throws Exception {
        // (1) DRAFT 주문 생성 (rev1=CREATE) — from-estimate 경로
        UUID estimateId = UUID.randomUUID();
        when(estimateClient.findById(estimateId)).thenReturn(Optional.of(estimateSnapshot(estimateId)));

        MvcResult createResult = mockMvc.perform(
                        post("/api/v1/partner-orders/from-estimate/{id}", estimateId)
                                .header("X-User-Id", SALES_ACCOUNT_ID)
                                .header(HttpHeaderConstants.CALLER_ROLE_HEADER, "SALES")
                                .header("X-User-Name", "영업담당자"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.status").value("DRAFT"))
                .andReturn();

        UUID orderId = UUID.fromString(extractOrderId(createResult));

        // rev1 CREATE 생성 확인
        assertThat(revisionRepository.findByPartnerOrderIdOrderByRevisionNoDesc(orderId)).hasSize(1);

        // (2) delete 호출 — DELETE revision 캡처 + soft-delete
        mockMvc.perform(
                        org.springframework.test.web.servlet.request.MockMvcRequestBuilders
                                .delete("/api/v1/partner-orders/{id}", orderId)
                                .header("X-User-Id", SALES_ACCOUNT_ID)
                                .header(HttpHeaderConstants.CALLER_ROLE_HEADER, "SALES")
                                .header("X-User-Name", "삭제담당자"))
                .andExpect(status().isNoContent());

        // delete 후 revision 2건 (CREATE + DELETE)
        var revisionsAfterDelete = revisionRepository.findByPartnerOrderIdOrderByRevisionNoDesc(orderId);
        assertThat(revisionsAfterDelete).hasSize(2);
        var deleteRev = revisionsAfterDelete.stream()
                .filter(r -> "DELETE".equals(r.getRevisionType().name()))
                .findFirst();
        assertThat(deleteRev).isPresent();
        assertThat(deleteRev.get().getRevisionNo()).isEqualTo(2);

        // delete 후 DB 에서 주문이 soft-deleted 상태인지 확인
        Integer deletedCount = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM partner_orders WHERE id = ? AND is_deleted = TRUE",
                Integer.class, orderId);
        assertThat(deletedCount).isEqualTo(1);

        // (3) 삭제된 주문을 rev1 로 복원 → undelete + 내용 복구
        mockMvc.perform(
                        post("/api/v1/partner-orders/{id}/revisions/{no}/restore", orderId, 1)
                                .header("X-User-Id", SALES_ACCOUNT_ID)
                                .header(HttpHeaderConstants.CALLER_ROLE_HEADER, "SALES")
                                .header("X-User-Name", "복원담당자"))
                .andExpect(status().isOk())
                // 복원 후 rev1 시점의 partnerCode 복구 (estimateSnapshot 기준 "P-RST-IT-001")
                .andExpect(jsonPath("$.data.order.partnerCode").value("P-RST-IT-001"))
                .andExpect(jsonPath("$.data.order.bizCode").value("1234567890"))
                // DRAFT 복원 → slipResyncRequired=false
                .andExpect(jsonPath("$.data.slipResyncRequired").value(false))
                // 라인 2개 복구
                .andExpect(jsonPath("$.data.order.lines.length()").value(2));

        // (4) 복원 후 is_deleted=false (undelete 확인)
        Integer activateCount = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM partner_orders WHERE id = ? AND is_deleted = FALSE",
                Integer.class, orderId);
        assertThat(activateCount).isEqualTo(1);

        // (5) 복원 후 revision 3건 (CREATE→DELETE→RESTORE), 단조증가 확인
        var revisionsAfterRestore = revisionRepository.findByPartnerOrderIdOrderByRevisionNoDesc(orderId);
        assertThat(revisionsAfterRestore).hasSize(3);

        var sorted = revisionsAfterRestore.stream()
                .sorted(java.util.Comparator.comparingInt(r -> r.getRevisionNo()))
                .toList();
        assertThat(sorted.get(0).getRevisionType().name()).isEqualTo("CREATE");
        assertThat(sorted.get(1).getRevisionType().name()).isEqualTo("DELETE");
        assertThat(sorted.get(2).getRevisionType().name()).isEqualTo("RESTORE");

        // RESTORE revision 의 sourceRevisionNo=1 확인
        var restoreRev = sorted.get(2);
        assertThat(restoreRev.getSourceRevisionNo()).isEqualTo(1);
    }

    // ══════════════════════════════════════════════════════════════════════════
    // 케이스 8 — create→edit(라인 변경)→delete→restore(rev1) 라인 정합 (P1-1)
    // ══════════════════════════════════════════════════════════════════════════

    /**
     * create→edit(라인 변경)→delete→restore(rev1) 흐름에서 라인 정합을 검증한다.
     *
     * <p>[P1-1 lines 정합 보장] PartnerOrder.lines 는 @SQLRestriction("is_deleted = false") 가
     * 걸린 컬렉션이다. soft-deleted 주문을 undelete 한 후 replaceLines() 를 호출할 때
     * 기존 soft-deleted 라인이 컬렉션에 포함되지 않아 markDeleted 루프를 통과하지 못하고
     * DB 에 중복 잔존할 수 있다. 수정된 서비스는 lineRepository.findAllIncludingDeletedByPartnerOrderId()
     * 로 soft-deleted 라인까지 포함해 명시적으로 전처리한 후 replaceLines() 를 호출한다.
     *
     * <p>검증 사항:
     * <ul>
     *   <li>restore(rev1) 후 활성 라인이 rev1 시점과 정확히 일치 (2개, 편집 라인 반영 안 됨)</li>
     *   <li>DB partner_order_lines 에서 해당 주문의 is_deleted=true 라인이 중복 없이 잔존
     *       (active=2, total 라인 수 = active + soft-deleted 이전 라인)</li>
     * </ul>
     */
    @Test
    @WithMockUser(roles = {"SALES"})
    @DisplayName("케이스8: create→edit(라인 변경)→delete→restore(rev1) 라인 정합 — 활성 라인 rev1 일치 + soft-deleted 중복 없음")
    void case8_createEditDeleteRestore_linesMatchRev1AndNoDuplicateSoftDeletedLines() throws Exception {
        // (1) DRAFT 주문 생성 (rev1=CREATE, 라인 2개)
        UUID estimateId = UUID.randomUUID();
        when(estimateClient.findById(estimateId)).thenReturn(Optional.of(estimateSnapshot(estimateId)));

        MvcResult createResult = mockMvc.perform(
                        post("/api/v1/partner-orders/from-estimate/{id}", estimateId)
                                .header("X-User-Id", SALES_ACCOUNT_ID)
                                .header(HttpHeaderConstants.CALLER_ROLE_HEADER, "SALES")
                                .header("X-User-Name", "영업담당자"))
                .andExpect(status().isCreated())
                .andReturn();

        UUID orderId = UUID.fromString(extractOrderId(createResult));

        // rev1 생성 확인 (라인 2개 — estimateSnapshot 기준)
        assertThat(revisionRepository.findByPartnerOrderIdOrderByRevisionNoDesc(orderId)).hasSize(1);
        Integer activeAfterCreate = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM partner_order_lines WHERE partner_order_id = ? AND is_deleted = FALSE",
                Integer.class, orderId);
        assertThat(activeAfterCreate).isEqualTo(2);

        // (2) edit — 라인 변경 (rev2=EDIT): 라인 수량 변경으로 기존 2개 soft-delete + 새 2개 INSERT
        String modifiedAt = currentVersionTimestamp(orderId);
        mockMvc.perform(
                        put("/api/v1/partner-orders/{id}", orderId)
                                .header("X-User-Id", SALES_ACCOUNT_ID)
                                .header(HttpHeaderConstants.CALLER_ROLE_HEADER, "SALES")
                                .header("X-User-Name", "영업편집자")
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(updateJson(modifiedAt, "P-EDIT-CASE8", "1111111111", 5)))
                .andExpect(status().isOk());

        // edit 후: 활성 라인 2개, soft-deleted 라인 2개 (이전 rev1 라인)
        Integer activeAfterEdit = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM partner_order_lines WHERE partner_order_id = ? AND is_deleted = FALSE",
                Integer.class, orderId);
        assertThat(activeAfterEdit).isEqualTo(2);
        Integer deletedAfterEdit = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM partner_order_lines WHERE partner_order_id = ? AND is_deleted = TRUE",
                Integer.class, orderId);
        assertThat(deletedAfterEdit).isEqualTo(2);

        // (3) delete — soft-delete 주문 + 라인 (rev2=DELETE)
        mockMvc.perform(
                        org.springframework.test.web.servlet.request.MockMvcRequestBuilders
                                .delete("/api/v1/partner-orders/{id}", orderId)
                                .header("X-User-Id", SALES_ACCOUNT_ID)
                                .header(HttpHeaderConstants.CALLER_ROLE_HEADER, "SALES")
                                .header("X-User-Name", "삭제담당자"))
                .andExpect(status().isNoContent());

        // delete 후: 주문 soft-deleted, 활성 라인 0개, soft-deleted 라인 4개(edit 2 + delete 2)
        Integer activeAfterDelete = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM partner_order_lines WHERE partner_order_id = ? AND is_deleted = FALSE",
                Integer.class, orderId);
        assertThat(activeAfterDelete).isEqualTo(0);
        Integer totalAfterDelete = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM partner_order_lines WHERE partner_order_id = ?",
                Integer.class, orderId);
        assertThat(totalAfterDelete).isEqualTo(4); // edit 2(soft-del) + delete 2(soft-del)

        // (4) restore(rev1) — rev1 스냅샷(2개 라인)으로 복원
        mockMvc.perform(
                        post("/api/v1/partner-orders/{id}/revisions/{no}/restore", orderId, 1)
                                .header("X-User-Id", SALES_ACCOUNT_ID)
                                .header(HttpHeaderConstants.CALLER_ROLE_HEADER, "SALES")
                                .header("X-User-Name", "복원담당자"))
                .andExpect(status().isOk())
                // 활성 라인 2개 — rev1 시점 그대로
                .andExpect(jsonPath("$.data.order.lines.length()").value(2))
                // rev1 헤더 복구
                .andExpect(jsonPath("$.data.order.partnerCode").value("P-RST-IT-001"))
                .andExpect(jsonPath("$.data.slipResyncRequired").value(false));

        // (5) 복원 후 라인 정합 DB 단언
        // 활성 라인 2개 (rev1 스냅샷 기준 신규 INSERT 된 라인)
        Integer activeAfterRestore = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM partner_order_lines WHERE partner_order_id = ? AND is_deleted = FALSE",
                Integer.class, orderId);
        assertThat(activeAfterRestore).isEqualTo(2);

        // soft-deleted 라인은 복원 전 4개 + 복원 시 0개 추가 soft-delete(이미 모두 soft-deleted) = 4개
        // 새로 INSERT 된 라인 2개(rev1 스냅샷 기준) 는 active 이므로 총 라인 = 4 + 2 = 6개
        Integer totalAfterRestore = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM partner_order_lines WHERE partner_order_id = ?",
                Integer.class, orderId);
        assertThat(totalAfterRestore).isEqualTo(6); // 4(soft-deleted) + 2(active, rev1 복원)

        // soft-deleted 라인 중복 잔존 없음 확인 — 동일 productId 의 is_deleted=FALSE 라인이 2건을 초과하지 않음
        // (같은 productId 라인이 active 1건만 존재해야 함)
        Integer duplicateActiveCheck = jdbcTemplate.queryForObject("""
                SELECT COUNT(*) FROM (
                    SELECT product_id, COUNT(*) as cnt
                    FROM partner_order_lines
                    WHERE partner_order_id = ? AND is_deleted = FALSE
                    GROUP BY product_id
                    HAVING COUNT(*) > 1
                ) dup
                """, Integer.class, orderId);
        assertThat(duplicateActiveCheck).isEqualTo(0); // productId 별 중복 활성 라인 없음

        // (6) RESTORE revision 생성 확인 (rev3 — CREATE→EDIT→DELETE 이후 rev4)
        // 주문 생성(rev1=CREATE) + edit(rev2=EDIT) + delete(rev3=DELETE) + restore(rev4=RESTORE)
        var revisionsAfterRestore = revisionRepository.findByPartnerOrderIdOrderByRevisionNoDesc(orderId);
        assertThat(revisionsAfterRestore).hasSize(4);
        var sorted = revisionsAfterRestore.stream()
                .sorted(java.util.Comparator.comparingInt(r -> r.getRevisionNo()))
                .toList();
        assertThat(sorted.get(0).getRevisionType().name()).isEqualTo("CREATE");
        assertThat(sorted.get(1).getRevisionType().name()).isEqualTo("EDIT");
        assertThat(sorted.get(2).getRevisionType().name()).isEqualTo("DELETE");
        assertThat(sorted.get(3).getRevisionType().name()).isEqualTo("RESTORE");
        assertThat(sorted.get(3).getSourceRevisionNo()).isEqualTo(1);
    }

    // ══════════════════════════════════════════════════════════════════════════
    // 케이스 9 — create→edit→restore(rev1) 비삭제 일반 복원 라인 정합 (cycle2c 비차단-1)
    // ══════════════════════════════════════════════════════════════════════════

    /**
     * 삭제 없이 create→edit→restore(rev1) 흐름에서 일반 복원(비삭제 경로)의 라인 정합을 검증한다.
     *
     * <p>[cycle2c 비차단-1] soft-deleted 주문이 아닌 일반 복원(DRAFT/CONFIRMED) 은
     * {@code wasDeleted=false} 분기로 진입해 native 선조회 전처리 없이
     * {@link PartnerOrder#replaceLines(List)} 단독 경로로 처리된다.
     * 이 경로에서도 활성 라인이 정확히 rev1 시점으로 복구되고,
     * soft-deleted 라인의 중복 활성화가 없음을 검증한다.
     *
     * <p>검증 사항:
     * <ul>
     *   <li>restore(rev1) 후 활성 라인이 rev1 시점과 정확히 일치 (2개)</li>
     *   <li>DB partner_order_lines 에서 is_deleted=true 라인이 edit 시 soft-delete 된 2개만 존재
     *       (복원 시 추가 soft-delete 되지 않음)</li>
     *   <li>같은 productId 로 is_deleted=false 중복 활성 라인 없음</li>
     *   <li>revision 타입 순서: CREATE→EDIT→RESTORE (DELETE 없음)</li>
     * </ul>
     */
    @Test
    @WithMockUser(roles = {"SALES"})
    @DisplayName("케이스9: create→edit→restore(rev1) 비삭제 일반 복원 — 활성 라인 rev1 일치 + soft-deleted 중복 0 (cycle2c)")
    void case9_createEditRestore_nonDeletedPath_linesMatchRev1AndNoDuplicateActive() throws Exception {
        // (1) DRAFT 주문 생성 (rev1=CREATE, 라인 2개)
        UUID estimateId = UUID.randomUUID();
        when(estimateClient.findById(estimateId)).thenReturn(Optional.of(estimateSnapshot(estimateId)));

        MvcResult createResult = mockMvc.perform(
                        post("/api/v1/partner-orders/from-estimate/{id}", estimateId)
                                .header("X-User-Id", SALES_ACCOUNT_ID)
                                .header(HttpHeaderConstants.CALLER_ROLE_HEADER, "SALES")
                                .header("X-User-Name", "영업담당자"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.status").value("DRAFT"))
                .andReturn();

        UUID orderId = UUID.fromString(extractOrderId(createResult));

        // rev1 생성 확인 (활성 라인 2개)
        assertThat(revisionRepository.findByPartnerOrderIdOrderByRevisionNoDesc(orderId)).hasSize(1);
        Integer activeAfterCreate = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM partner_order_lines WHERE partner_order_id = ? AND is_deleted = FALSE",
                Integer.class, orderId);
        assertThat(activeAfterCreate).isEqualTo(2);

        // (2) edit — 라인 변경 (rev2=EDIT): 기존 2개 soft-delete + 새 2개 INSERT
        String modifiedAt = currentVersionTimestamp(orderId);
        mockMvc.perform(
                        put("/api/v1/partner-orders/{id}", orderId)
                                .header("X-User-Id", SALES_ACCOUNT_ID)
                                .header(HttpHeaderConstants.CALLER_ROLE_HEADER, "SALES")
                                .header("X-User-Name", "영업편집자")
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(updateJson(modifiedAt, "P-CASE9-EDITED", "9999999999", 7)))
                .andExpect(status().isOk());

        // edit 후: 활성 2, soft-deleted 2
        Integer activeAfterEdit = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM partner_order_lines WHERE partner_order_id = ? AND is_deleted = FALSE",
                Integer.class, orderId);
        assertThat(activeAfterEdit).isEqualTo(2);
        Integer deletedAfterEdit = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM partner_order_lines WHERE partner_order_id = ? AND is_deleted = TRUE",
                Integer.class, orderId);
        assertThat(deletedAfterEdit).isEqualTo(2);

        // 주문이 소프트 삭제되지 않은 상태인지 확인 (비삭제 일반 복원 경로 조건)
        Integer notDeletedCount = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM partner_orders WHERE id = ? AND is_deleted = FALSE",
                Integer.class, orderId);
        assertThat(notDeletedCount).isEqualTo(1);

        // (3) restore(rev1) — 삭제 없이 일반 복원 (비삭제 경로: wasDeleted=false)
        mockMvc.perform(
                        post("/api/v1/partner-orders/{id}/revisions/{no}/restore", orderId, 1)
                                .header("X-User-Id", SALES_ACCOUNT_ID)
                                .header(HttpHeaderConstants.CALLER_ROLE_HEADER, "SALES")
                                .header("X-User-Name", "복원담당자"))
                .andExpect(status().isOk())
                // rev1 시점 헤더 복구 (estimateSnapshot 기준 "P-RST-IT-001")
                .andExpect(jsonPath("$.data.order.partnerCode").value("P-RST-IT-001"))
                .andExpect(jsonPath("$.data.order.bizCode").value("1234567890"))
                // DRAFT 복원 → slipResyncRequired=false
                .andExpect(jsonPath("$.data.slipResyncRequired").value(false))
                // 활성 라인 2개 — rev1 시점 그대로
                .andExpect(jsonPath("$.data.order.lines.length()").value(2));

        // (4) 복원 후 라인 정합 DB 단언
        // 활성 라인 2개 (rev1 스냅샷 기준 신규 INSERT)
        Integer activeAfterRestore = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM partner_order_lines WHERE partner_order_id = ? AND is_deleted = FALSE",
                Integer.class, orderId);
        assertThat(activeAfterRestore).isEqualTo(2);

        // soft-deleted 라인: edit 시 2개 + restore 시 replaceLines 내부 2개(edit 라인) = 4개
        //   rev1 라인(edit 전 soft-del 2개) + edit 라인(restore 전처리 soft-del 2개) = 총 4 soft-del
        //   신규 INSERT 2개(rev1 복원) = 총 6개
        Integer totalAfterRestore = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM partner_order_lines WHERE partner_order_id = ?",
                Integer.class, orderId);
        assertThat(totalAfterRestore).isEqualTo(6); // 4(soft-deleted) + 2(active, rev1 복원)

        // 같은 productId 로 is_deleted=false 중복 활성 라인 없음
        Integer duplicateActiveCheck = jdbcTemplate.queryForObject("""
                SELECT COUNT(*) FROM (
                    SELECT product_id, COUNT(*) as cnt
                    FROM partner_order_lines
                    WHERE partner_order_id = ? AND is_deleted = FALSE
                    GROUP BY product_id
                    HAVING COUNT(*) > 1
                ) dup
                """, Integer.class, orderId);
        assertThat(duplicateActiveCheck).isEqualTo(0);

        // (5) revision 타입 순서: CREATE→EDIT→RESTORE (DELETE 없음)
        var revisions = revisionRepository.findByPartnerOrderIdOrderByRevisionNoDesc(orderId);
        assertThat(revisions).hasSize(3);
        var sorted = revisions.stream()
                .sorted(java.util.Comparator.comparingInt(r -> r.getRevisionNo()))
                .toList();
        assertThat(sorted.get(0).getRevisionType().name()).isEqualTo("CREATE");
        assertThat(sorted.get(1).getRevisionType().name()).isEqualTo("EDIT");
        assertThat(sorted.get(2).getRevisionType().name()).isEqualTo("RESTORE");
        assertThat(sorted.get(2).getSourceRevisionNo()).isEqualTo(1);
    }

    // ══════════════════════════════════════════════════════════════════════════
    // 헬퍼 메서드
    // ══════════════════════════════════════════════════════════════════════════

    /**
     * IT 에서 사용할 견적 스냅샷 픽스처를 생성한다 (from-estimate 흐름용).
     *
     * @param estimateId 견적 UUID
     * @return 2-line 견적 스냅샷 (실외기 + 벽걸이)
     */
    private EstimateClient.EstimateSnapshot estimateSnapshot(UUID estimateId) {
        return new EstimateClient.EstimateSnapshot(
                estimateId,
                "견적-IT-0001",
                "P-RST-IT-001",
                "1234567890",
                "2026-05-30",
                "통합테스트 견적",
                List.of(
                        new EstimateClient.EstimateLineSnapshot(
                                fixtureProductId("AJ040RXH4BC1"),
                                "AJ040RXH4BC1",
                                "실외기",
                                "homemulti",
                                2,
                                new BigDecimal("120000"),
                                "현장 납품"),
                        new EstimateClient.EstimateLineSnapshot(
                                fixtureProductId("AR09B9150HZ"),
                                "AR09B9150HZ",
                                "벽걸이 실내기",
                                "singleSets",
                                1,
                                new BigDecimal("310000"),
                                "추가")));
    }

    /**
     * MockMvc 결과에서 주문 UUID (data.id 또는 data.orderId) 를 추출한다.
     *
     * <p>응답 JSON {@code $.data.id} 가 없으면 {@code $.data.partnerCode} 로 DB 조회해
     * 부가적으로 추출한다 (UUID 직접 노출 금지 가드 우회).
     */
    private String extractOrderId(MvcResult result) throws Exception {
        String body = result.getResponse().getContentAsString(StandardCharsets.UTF_8);
        // data.id 가 응답에 있으면 사용
        com.jayway.jsonpath.DocumentContext ctx = com.jayway.jsonpath.JsonPath.parse(body);
        try {
            Object idVal = ctx.read("$.data.id");
            if (idVal != null) {
                return idVal.toString();
            }
        } catch (Exception ignored) {
            // data.id 없는 경우 아래 fallback
        }
        // fallback: DB 에서 최신 orderId 조회
        return jdbcTemplate.queryForObject(
                "SELECT id::text FROM partner_orders ORDER BY created_at DESC LIMIT 1",
                String.class);
    }

    /**
     * PUT /api/v1/partner-orders/{id} 요청 본문 JSON.
     *
     * @param modifiedAt optimistic lock 용 updatedAt
     * @param partnerCode 수정할 거래처 코드
     * @param bizCode 수정할 사업자번호
     * @param quantity 첫 번째 라인 수량
     */
    private String updateJson(String modifiedAt, String partnerCode, String bizCode, int quantity) {
        return """
                {
                  "updatedAt": "%s",
                  "partnerCode": "%s",
                  "bizCode": "%s",
                  "dueDate": "2026-05-30",
                  "memo": "IT 복원 테스트 수정",
                  "lines": [
                    {
                      "modelCode": "AJ040RXH4BC1",
                      "productName": "실외기",
                      "categoryKey": "homemulti",
                      "quantity": %d,
                      "deliveryPrice": 120000,
                      "remark": "수정됨"
                    },
                    {
                      "modelCode": "AR09B9150HZ",
                      "productName": "벽걸이 실내기",
                      "categoryKey": "singleSets",
                      "quantity": 1,
                      "deliveryPrice": 310000,
                      "remark": "추가"
                    }
                  ]
                }
                """.formatted(modifiedAt, partnerCode, bizCode, quantity);
    }

    /**
     * 모델 코드로부터 안정적인 UUID 를 생성한다 (PartnerOrderUpdateIT 패턴 미러).
     *
     * @param modelCode 모델명
     * @return 모델명 기반 결정적 UUID
     */
    private UUID fixtureProductId(String modelCode) {
        return UUID.nameUUIDFromBytes(("phase-2-4-it:" + modelCode).getBytes(StandardCharsets.UTF_8));
    }

    /**
     * CONFIRMED 상태 주문 엔티티를 도메인 메서드로 생성하고 영속화한다.
     *
     * <p>{@code markSlipPublished()} 로 status=CONFIRMED + slipNo 설정 후 save.
     */
    private PartnerOrder buildConfirmedOrder(String partnerCode, String bizCode, String orderNo) {
        PartnerOrder order = PartnerOrder.createFromEstimate(
                partnerCode, bizCode, orderNo,
                "idem-conf-it-" + orderNo, BigDecimal.ZERO,
                UUID.randomUUID(), null, null);
        order.markSlipPublished("S-CONF-IT-0001");
        return orderRepository.saveAndFlush(order);
    }

    /**
     * 지정 status 를 가진 주문을 JDBC 직접 INSERT 로 생성하고 UUID 를 반환한다.
     *
     * <p>도메인 메서드로 CONFIRMING/CANCELED 를 직접 생성하기 어려운 경우 사용한다.
     *
     * @param partnerCode 거래처 코드
     * @param bizCode     사업자번호
     * @param orderNo     주문번호
     * @param status      CONFIRMING / CANCELED / CONFIRMED / DRAFT
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
                "idem-" + orderNo);
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

    /**
     * partner_order_revisions INSERT SQL 템플릿.
     *
     * <p>파라미터 순서: partnerOrderId, revisionType, orderNo, snapshotJson
     * (V7 DDL: id UUID PK, partner_order_id, revision_no, revision_type, source_revision_no,
     *  order_no, snapshot, actor_id, actor_name, actor_color, BaseEntity 7 audit — lock_version 없음)
     */
    private String revisionInsertSql() {
        // snapshot 컬럼은 JSONB — ?::jsonb 캐스팅 필요 (PostgreSQL PreparedStatement 직접 캐스팅)
        // 파라미터 순서: orderId, revisionType, orderNo, snapshotJson
        return """
                INSERT INTO partner_order_revisions
                  (id, partner_order_id, revision_no, revision_type, source_revision_no,
                   order_no, snapshot, actor_id, actor_name, actor_color,
                   created_at, created_by, modified_at, modified_by,
                   is_deleted)
                VALUES
                  (gen_random_uuid(), ?, 1, ?, NULL,
                   ?, ?::jsonb, NULL, 'test', NULL,
                   NOW(), 'test', NOW(), 'test',
                   FALSE)
                """;
    }

    /**
     * 최소한의 유효한 스냅샷 JSON 을 생성한다 (라인 1개 포함, restore 에 lines 필수).
     *
     * @param partnerCode 거래처 코드
     * @return 단순 스냅샷 JSON 문자열
     */
    private String minimalSnapshotJson(String partnerCode) {
        return """
                {
                  "orderNo": "2026/05/30-TEST",
                  "partnerCode": "%s",
                  "bizCode": "1111111111",
                  "status": "DRAFT",
                  "totalAmount": 100000,
                  "revisionCount": 0,
                  "lines": [
                    {
                      "productId": "00000000-0000-0000-0000-000000000001",
                      "modelName": "TEST-MODEL",
                      "productName": "테스트상품",
                      "categoryKey": "homemulti",
                      "quantity": 1,
                      "priceVat": 100000,
                      "subtotal": 100000
                    }
                  ]
                }
                """.formatted(partnerCode);
    }

    /**
     * CONFIRMED 주문의 스냅샷 JSON 을 생성한다 (특정 partnerCode/bizCode 기준).
     *
     * @param order        기준 주문 (slipNo 등 사용)
     * @param partnerCode  스냅샷에 기록할 거래처 코드
     * @param bizCode      스냅샷에 기록할 사업자번호
     * @return 스냅샷 JSON 문자열
     */
    private String buildSnapshotJson(PartnerOrder order, String partnerCode, String bizCode) {
        // replaceLines() 는 빈 라인 리스트를 허용하지 않으므로 라인 1개를 반드시 포함한다
        return """
                {
                  "orderNo": "%s",
                  "partnerCode": "%s",
                  "bizCode": "%s",
                  "status": "CONFIRMED",
                  "slipNo": "%s",
                  "slipPublishStatus": "PUBLISHED",
                  "totalAmount": 100000,
                  "revisionCount": 0,
                  "lines": [
                    {
                      "productId": "00000000-0000-0000-0000-000000000010",
                      "modelName": "CONF-MODEL",
                      "productName": "완료상품",
                      "categoryKey": "homemulti",
                      "quantity": 1,
                      "priceVat": 100000,
                      "subtotal": 100000
                    }
                  ]
                }
                """.formatted(
                order.getOrderNo(),
                partnerCode,
                bizCode,
                order.getSlipNo() != null ? order.getSlipNo() : "S-CONF-IT-0001");
    }

    /**
     * 라인 1개 포함 스냅샷 JSON (DRAFT 상태, MASTER bypass 케이스용).
     *
     * @param partnerCode 거래처 코드
     * @param bizCode     사업자번호
     * @return 라인 1개 포함 스냅샷 JSON 문자열
     */
    private String snapshotWithOneLine(String partnerCode, String bizCode) {
        return """
                {
                  "orderNo": "2026/05/30-MSTR-IT",
                  "partnerCode": "%s",
                  "bizCode": "%s",
                  "status": "DRAFT",
                  "totalAmount": 50000,
                  "revisionCount": 0,
                  "lines": [
                    {
                      "productId": "00000000-0000-0000-0000-000000000002",
                      "modelName": "MODEL-MST",
                      "productName": "마스터상품",
                      "categoryKey": "homemulti",
                      "quantity": 1,
                      "priceVat": 50000,
                      "subtotal": 50000
                    }
                  ]
                }
                """.formatted(partnerCode, bizCode);
    }

    /**
     * PartnerOrderUpdateIT.currentModifiedAt() 패턴 미러 — optimistic lock 검증용 타임스탬프.
     *
     * <p>modifiedAt 이 있으면 modifiedAt, 없으면 createdAt 을 반환한다.
     * from-estimate 로 생성된 직후에는 modifiedAt 이 채워져 있을 수 있다.
     *
     * @param orderId 대상 주문 UUID
     * @return PUT updatedAt 파라미터로 사용할 타임스탬프 문자열
     */
    private String currentVersionTimestamp(UUID orderId) {
        return orderRepository.findById(orderId)
                .map(o -> o.getModifiedAt() != null
                        ? o.getModifiedAt().toString()
                        : o.getCreatedAt().toString())
                .orElseThrow();
    }
}
