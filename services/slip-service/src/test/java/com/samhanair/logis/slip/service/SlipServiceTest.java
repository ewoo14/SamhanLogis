package com.samhanair.logis.slip.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.slip.audit.service.SlipAuditLogService;
import com.samhanair.logis.slip.client.InventoryClient;
import com.samhanair.logis.slip.client.PartnerInternalClient;
import com.samhanair.logis.slip.client.ProductClient;
import com.samhanair.logis.slip.client.ProductSummary;
import com.samhanair.logis.slip.client.WarehouseInternalClient;
import com.samhanair.logis.slip.editrequest.service.SlipEditRequestService;
import com.samhanair.logis.slip.domain.DeliveryTag;
import com.samhanair.logis.slip.domain.Slip;
import com.samhanair.logis.slip.domain.SlipLine;
import com.samhanair.logis.slip.domain.SlipStatus;
import com.samhanair.logis.slip.domain.SlipType;
import com.samhanair.logis.slip.repository.SlipRepository;
import com.samhanair.logis.slip.web.dto.CreateSlipRequest;
import com.samhanair.logis.slip.web.dto.EditHeaderRequest;
import com.samhanair.logis.slip.web.dto.SlipDetailResponse;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

/** SlipService — lifecycle + Inventory mock 호출 검증. */
@ExtendWith(MockitoExtension.class)
class SlipServiceTest {

    @Mock private SlipRepository slipRepository;
    @Mock private SlipNumberService slipNumberService;
    @Mock private ProductClient productClient;
    @Mock private InventoryClient inventoryClient;
    /** PR-H2 — editHeader 가 audit overlay 호출. 본 테스트에서는 mock 격리 (audit 자체는 별도 단위 테스트). */
    @Mock private SlipAuditLogService auditLogService;
    /** PR-H3 — 잠금 정책 가드. 본 테스트에서는 mock 격리. */
    @Mock private SlipEditRequestService editRequestService;
    /** V20 — partner-service businessNumber resolve. 본 테스트에서는 mock 격리 (empty 반환). */
    @Mock private PartnerInternalClient partnerInternalClient;
    /**
     * SP-08-FU2 P2-2 — inventory-service 창고명 lookup client.
     * 단위 테스트에서는 mock 격리 (empty 반환) — IT 에서만 실제 연결 검증.
     */
    @Mock private WarehouseInternalClient warehouseInternalClient;
    /** 권한 재편 Phase 2.1 Task 2 — mutation 스냅샷 캡처. 본 테스트에서는 mock 격리. */
    @Mock private com.samhanair.logis.slip.revision.service.SlipRevisionService slipRevisionService;

    @InjectMocks private SlipService service;

    private UUID productId;
    private UUID sourceWh;
    private UUID destWh;
    private UUID partnerId;
    private UUID slipId;

    @BeforeEach
    void setUp() {
        productId = UUID.randomUUID();
        sourceWh = UUID.randomUUID();
        destWh = UUID.randomUUID();
        partnerId = UUID.randomUUID();
        slipId = UUID.randomUUID();

        lenient().when(productClient.lookup(any())).thenReturn(List.of(
                new ProductSummary(productId, "에어컨", "M-1", "AC-001", UUID.randomUUID(),
                        new BigDecimal("1000.00"), "ACTIVE")));
        lenient().when(productClient.requireExists(productId)).thenReturn(
                new ProductSummary(productId, "에어컨", "M-1", "AC-001", UUID.randomUUID(),
                        new BigDecimal("1000.00"), "ACTIVE"));
        // SP-08-FU2 P2-2 — WarehouseInternalClient fail-soft mock (inventory-service 미연결 환경)
        lenient().when(warehouseInternalClient.findWarehouseName(any())).thenReturn(Optional.empty());
    }

    // ---------- create ----------

    @Test
    void create_outbound_returnsDraft_andCallsProductLookup() {
        when(slipNumberService.next(any(LocalDate.class), eq(SlipType.OUTBOUND))).thenReturn("2026/05/04-1");
        when(slipNumberService.extractSeqNo("2026/05/04-1")).thenReturn(1);
        when(slipRepository.save(any(Slip.class))).thenAnswer(inv -> {
            Slip s = inv.getArgument(0);
            ReflectionTestUtils.setField(s, "id", slipId);
            return s;
        });

        CreateSlipRequest req = new CreateSlipRequest(
                SlipType.OUTBOUND, LocalDate.of(2026, 5, 4),
                sourceWh, destWh, partnerId, "삼한공조", DeliveryTag.DAY, "메모",
                null, null,
                // PR-G1 backlog #2 — V16 e-Count 12 컬럼 (모두 null 시 기본 분기)
                null, null, null, null, null, null, null, null, null, null, null, null,
                // V20 신규 5 필드 (모두 null)
                null, null, null, null, null,
                List.of(new CreateSlipRequest.SlipLineRequest(productId, "에어컨", "M-1", null,
                        2, new BigDecimal("100.00"), null)));

        SlipDetailResponse res = service.create(req, "user-1", "홍길동");

        assertThat(res.status()).isEqualTo(SlipStatus.DRAFT);
        assertThat(res.slipNo()).isEqualTo("2026/05/04-1");
        assertThat(res.lines()).hasSize(1);
        assertThat(res.lines().get(0).lineTotal()).isEqualByComparingTo(new BigDecimal("200.00"));
        verify(productClient).lookup(any());
    }

    @Test
    void create_inbound_setsSourceNull() {
        when(slipNumberService.next(any(LocalDate.class), eq(SlipType.INBOUND))).thenReturn("2026/05/04-1");
        when(slipNumberService.extractSeqNo("2026/05/04-1")).thenReturn(1);
        when(slipRepository.save(any(Slip.class))).thenAnswer(inv -> inv.getArgument(0));

        CreateSlipRequest req = new CreateSlipRequest(
                SlipType.INBOUND, LocalDate.of(2026, 5, 4),
                null, destWh, partnerId, "삼한", DeliveryTag.RETURN, null,
                null, null,
                // PR-G1 backlog #2 — V16 e-Count 12 컬럼 (null 기본 분기)
                null, null, null, null, null, null, null, null, null, null, null, null,
                // V20 신규 5 필드 (모두 null)
                null, null, null, null, null,
                List.of(new CreateSlipRequest.SlipLineRequest(productId, "p", null, null,
                        1, new BigDecimal("10.00"), null)));

        SlipDetailResponse res = service.create(req, "user-1", "홍길동");

        assertThat(res.slipType()).isEqualTo(SlipType.INBOUND);
        assertThat(res.partnerName()).isEqualTo("삼한");
    }

    // ---------- accept (OUTBOUND inventory reserve) ----------

    @Test
    void accept_outbound_callsInventoryReserve_perLine() {
        Slip slip = preparedOutbound(SlipStatus.SENT, 2, new BigDecimal("100.00"));
        when(slipRepository.findById(slipId)).thenReturn(Optional.of(slip));

        service.accept(slipId, "warehouse-1");

        assertThat(slip.getStatus()).isEqualTo(SlipStatus.ACCEPTED);
        verify(inventoryClient, times(1))
                .reserve(eq(productId), eq(sourceWh), eq(2), anyString(), eq(slipId));
    }

    @Test
    void accept_inbound_doesNotCallInventoryReserve() {
        Slip slip = preparedInbound(SlipStatus.SENT);
        when(slipRepository.findById(slipId)).thenReturn(Optional.of(slip));

        service.accept(slipId, "warehouse-1");

        verify(inventoryClient, never())
                .reserve(any(), any(), anyInt(), anyString(), any());
    }

    @Test
    void accept_fromDraft_throwsConflict_andDoesNotCallInventory() {
        Slip slip = preparedOutbound(SlipStatus.DRAFT, 1, new BigDecimal("10.00"));
        when(slipRepository.findById(slipId)).thenReturn(Optional.of(slip));

        assertThatThrownBy(() -> service.accept(slipId, "u"))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.CONFLICT));

        verify(inventoryClient, never()).reserve(any(), any(), anyInt(), anyString(), any());
    }

    // ---------- complete ----------

    @Test
    void complete_outbound_callsInventoryDeduct_fromReservationTrue() {
        // Slice A hotfix: complete (출고 완료) = PROCESSING → INSPECTING + deduct.
        Slip slip = preparedOutbound(SlipStatus.PROCESSING, 3, new BigDecimal("50.00"));
        when(slipRepository.findById(slipId)).thenReturn(Optional.of(slip));

        service.complete(slipId);

        assertThat(slip.getStatus()).isEqualTo(SlipStatus.INSPECTING);
        verify(inventoryClient, times(1))
                .deduct(eq(productId), eq(sourceWh), eq(3), eq(true), anyString(), eq(slipId));
    }

    @Test
    void complete_inbound_callsInventoryInbound() {
        // Slice A hotfix: 입고 PROCESSING → INSPECTING + inbound.
        Slip slip = preparedInbound(SlipStatus.PROCESSING);
        when(slipRepository.findById(slipId)).thenReturn(Optional.of(slip));

        service.complete(slipId);

        assertThat(slip.getStatus()).isEqualTo(SlipStatus.INSPECTING);
        verify(inventoryClient, times(1))
                .inbound(eq(productId), eq(destWh), anyInt(), anyString(), any(BigDecimal.class));
    }

    @Test
    void complete_inbound_serialProduct_callsInventoryInboundInstances() {
        Slip slip = preparedInbound(SlipStatus.PROCESSING, null, productId,
                "에어컨", "MODEL-SERIAL", 2, new BigDecimal("500000.00"));
        when(slipRepository.findById(slipId)).thenReturn(Optional.of(slip));
        when(productClient.requireExists(productId)).thenReturn(
                new ProductSummary(productId, "에어컨", "MODEL-SERIAL", "AC-SERIAL-001", UUID.randomUUID(),
                        new BigDecimal("500000.00"), "ACTIVE", true));

        service.complete(slipId);

        verify(inventoryClient, times(1))
                .inboundInstances(eq(productId), eq("AC-SERIAL-001"), eq(destWh), eq(2),
                        eq("구매"), eq("2026/05/04-1"), eq(new BigDecimal("500000.00")));
        verify(inventoryClient, never())
                .inbound(any(), any(), anyInt(), anyString(), any(BigDecimal.class));
    }

    @Test
    void complete_inbound_mixedSerialAndBatch_routesEachLine() {
        UUID batchProductId = UUID.randomUUID();
        Slip slip = Slip.createInbound("2026/05/04-1", LocalDate.of(2026, 5, 4), 1,
                destWh, partnerId, "삼한", null, null, "u");
        ReflectionTestUtils.setField(slip, "id", slipId);
        slip.addLine(SlipLine.create(slip, productId, "에어컨", "MODEL-SERIAL", null,
                2, new BigDecimal("500000.00"), null));
        slip.addLine(SlipLine.create(slip, batchProductId, "배관", "PIPE-BATCH", null,
                5, new BigDecimal("10000.00"), null));
        forceStatus(slip, SlipStatus.PROCESSING);
        when(slipRepository.findById(slipId)).thenReturn(Optional.of(slip));
        when(productClient.requireExists(productId)).thenReturn(
                new ProductSummary(productId, "에어컨", "MODEL-SERIAL", "AC-SERIAL-001", UUID.randomUUID(),
                        new BigDecimal("500000.00"), "ACTIVE", true));
        when(productClient.requireExists(batchProductId)).thenReturn(
                new ProductSummary(batchProductId, "배관", "PIPE-BATCH", "PIPE-001", UUID.randomUUID(),
                        new BigDecimal("10000.00"), "ACTIVE", false));

        service.complete(slipId);

        verify(inventoryClient, times(1))
                .inboundInstances(eq(productId), eq("AC-SERIAL-001"), eq(destWh), eq(2),
                        eq("구매"), eq("2026/05/04-1"), eq(new BigDecimal("500000.00")));
        verify(inventoryClient, times(1))
                .inbound(eq(batchProductId), eq(destWh), eq(5),
                        eq("2026/05/04-1"), eq(new BigDecimal("10000.00")));
    }

    @Test
    void complete_inbound_borrowSerialProduct_usesBorrowInboundType() {
        Slip slip = preparedInbound(SlipStatus.PROCESSING, DeliveryTag.BORROW, productId,
                "에어컨", "MODEL-BORROW", 1, new BigDecimal("500000.00"));
        when(slipRepository.findById(slipId)).thenReturn(Optional.of(slip));
        when(productClient.requireExists(productId)).thenReturn(
                new ProductSummary(productId, "에어컨", "MODEL-BORROW", "AC-BORROW-001", UUID.randomUUID(),
                        new BigDecimal("500000.00"), "ACTIVE", true));

        service.complete(slipId);

        verify(inventoryClient).inboundInstances(eq(productId), eq("AC-BORROW-001"), eq(destWh),
                eq(1), eq("차용"), eq("2026/05/04-1"), eq(new BigDecimal("500000.00")));
    }

    @Test
    void complete_inbound_returnTag_serialProduct_throwsConflictBeforeInventoryInbound() {
        Slip slip = preparedInbound(SlipStatus.PROCESSING, DeliveryTag.RETURN, productId,
                "에어컨", "MODEL-RETURN", 1, new BigDecimal("500000.00"));
        when(slipRepository.findById(slipId)).thenReturn(Optional.of(slip));
        when(productClient.requireExists(productId)).thenReturn(
                new ProductSummary(productId, "에어컨", "MODEL-RETURN", "AC-RETURN-001", UUID.randomUUID(),
                        new BigDecimal("500000.00"), "ACTIVE", true));

        assertThatThrownBy(() -> service.complete(slipId))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.CONFLICT));

        verify(inventoryClient, never()).inboundInstances(any(), anyString(), any(), anyInt(),
                anyString(), anyString(), any(BigDecimal.class));
        verify(inventoryClient, never()).inbound(any(), any(), anyInt(), anyString(), any(BigDecimal.class));
    }

    @Test
    void complete_inbound_returnTripTag_serialProduct_throwsConflictBeforeInventoryInbound() {
        Slip slip = preparedInbound(SlipStatus.PROCESSING, DeliveryTag.RETURN_TRIP, productId,
                "에어컨", "MODEL-RETURN-TRIP", 1, new BigDecimal("500000.00"));
        when(slipRepository.findById(slipId)).thenReturn(Optional.of(slip));
        when(productClient.requireExists(productId)).thenReturn(
                new ProductSummary(productId, "에어컨", "MODEL-RETURN-TRIP", "AC-RETURN-TRIP-001",
                        UUID.randomUUID(), new BigDecimal("500000.00"), "ACTIVE", true));

        assertThatThrownBy(() -> service.complete(slipId))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.CONFLICT));

        verify(inventoryClient, never()).inboundInstances(any(), anyString(), any(), anyInt(),
                anyString(), anyString(), any(BigDecimal.class));
        verify(inventoryClient, never()).inbound(any(), any(), anyInt(), anyString(), any(BigDecimal.class));
    }

    @Test
    void complete_inbound_returnTag_batchProduct_keepsLotInboundPath() {
        Slip slip = preparedInbound(SlipStatus.PROCESSING, DeliveryTag.RETURN, productId,
                "배관", "PIPE-BATCH", 3, new BigDecimal("10000.00"));
        when(slipRepository.findById(slipId)).thenReturn(Optional.of(slip));
        when(productClient.requireExists(productId)).thenReturn(
                new ProductSummary(productId, "배관", "PIPE-BATCH", "PIPE-001", UUID.randomUUID(),
                        new BigDecimal("10000.00"), "ACTIVE", false));

        service.complete(slipId);

        verify(inventoryClient).inbound(eq(productId), eq(destWh), eq(3),
                eq("2026/05/04-1"), eq(new BigDecimal("10000.00")));
        verify(inventoryClient, never()).inboundInstances(any(), anyString(), any(), anyInt(),
                anyString(), anyString(), any(BigDecimal.class));
    }

    // -------- Slice A hotfix — inspect (검수 완료) endpoint --------

    @Test
    void inspect_fromInspecting_movesToCompleted_setsInspectorUserId() {
        // Slice A hotfix: inspect (검수 완료) = INSPECTING → COMPLETED + inspector.
        Slip slip = preparedOutbound(SlipStatus.INSPECTING, 1, new BigDecimal("10.00"));
        when(slipRepository.findById(slipId)).thenReturn(Optional.of(slip));

        SlipDetailResponse res = service.inspect(slipId, "inspector-1");

        assertThat(res.status()).isEqualTo(SlipStatus.COMPLETED);
        assertThat(res.inspectorUserId()).isEqualTo("inspector-1");
        assertThat(res.inspectorSignedAt()).isNotNull();
        // 검수 완료는 inventory mutation 없음 (deduct 는 complete 시점에 이미).
        verify(inventoryClient, never())
                .deduct(any(), any(), anyInt(), anyBoolean(), anyString(), any());
    }

    @Test
    void inspect_fromProcessing_throwsConflict() {
        // PROCESSING 에서 inspect 시도 → 409 (PROCESSING → INSPECTING 은 complete 가, INSPECTING → COMPLETED 만 inspect)
        Slip slip = preparedOutbound(SlipStatus.PROCESSING, 1, new BigDecimal("10.00"));
        when(slipRepository.findById(slipId)).thenReturn(Optional.of(slip));

        assertThatThrownBy(() -> service.inspect(slipId, "i"))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.CONFLICT));
    }

    @Test
    void accept_setsDispatcherUserIdAndSignedAt_inResponse() {
        Slip slip = preparedOutbound(SlipStatus.SENT, 1, new BigDecimal("10.00"));
        when(slipRepository.findById(slipId)).thenReturn(Optional.of(slip));

        SlipDetailResponse res = service.accept(slipId, "warehouse-1");

        assertThat(res.dispatcherUserId()).isEqualTo("warehouse-1");
        assertThat(res.dispatcherSignedAt()).isNotNull();
    }

    // ---------- reject ----------

    @Test
    void reject_fromAccepted_outbound_callsRelease() {
        Slip slip = preparedOutbound(SlipStatus.ACCEPTED, 4, new BigDecimal("20.00"));
        when(slipRepository.findById(slipId)).thenReturn(Optional.of(slip));

        service.reject(slipId, "manager-1", "김매니저", "재고 없음");

        assertThat(slip.getStatus()).isEqualTo(SlipStatus.REJECTED);
        verify(inventoryClient, times(1))
                .release(eq(productId), eq(sourceWh), eq(4), anyString(), eq(slipId));
    }

    @Test
    void reject_fromSent_doesNotCallRelease() {
        Slip slip = preparedOutbound(SlipStatus.SENT, 1, new BigDecimal("10.00"));
        when(slipRepository.findById(slipId)).thenReturn(Optional.of(slip));

        service.reject(slipId, "manager-1", "김매니저", "잘못된 신청");

        verify(inventoryClient, never())
                .release(any(), any(), anyInt(), anyString(), any());
    }

    @Test
    void reject_fromDraft_throwsConflict() {
        Slip slip = preparedOutbound(SlipStatus.DRAFT, 1, new BigDecimal("10.00"));
        when(slipRepository.findById(slipId)).thenReturn(Optional.of(slip));

        assertThatThrownBy(() -> service.reject(slipId, "m", "김매니저", "x"))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.CONFLICT));
    }

    // ---------- cancel ----------

    @Test
    void cancel_fromSaved_succeeds_noInventoryCall() {
        Slip slip = preparedOutbound(SlipStatus.SAVED, 1, new BigDecimal("10.00"));
        when(slipRepository.findById(slipId)).thenReturn(Optional.of(slip));

        service.cancel(slipId, "u");

        assertThat(slip.getStatus()).isEqualTo(SlipStatus.CANCELED);
        verify(inventoryClient, never()).release(any(), any(), anyInt(), anyString(), any());
    }

    @Test
    void cancel_fromAccepted_throwsConflict_perDomainGuard() {
        Slip slip = preparedOutbound(SlipStatus.ACCEPTED, 1, new BigDecimal("10.00"));
        when(slipRepository.findById(slipId)).thenReturn(Optional.of(slip));

        assertThatThrownBy(() -> service.cancel(slipId, "u"))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.CONFLICT));
    }

    // ---------- editHeader ----------

    @Test
    void editHeader_inDraft_appliesPartial() {
        Slip slip = preparedOutbound(SlipStatus.DRAFT, 1, new BigDecimal("10.00"));
        when(slipRepository.findById(slipId)).thenReturn(Optional.of(slip));

        service.editHeader(slipId,
                new EditHeaderRequest(null, "새거래처", null, "새메모", null, null), "u", "홍길동");

        assertThat(slip.getPartnerName()).isEqualTo("새거래처");
        assertThat(slip.getMemo()).isEqualTo("새메모");
    }

    @Test
    void editHeader_inSent_throwsConflict() {
        Slip slip = preparedOutbound(SlipStatus.SENT, 1, new BigDecimal("10.00"));
        when(slipRepository.findById(slipId)).thenReturn(Optional.of(slip));

        assertThatThrownBy(() -> service.editHeader(slipId,
                new EditHeaderRequest(null, "x", null, null, null, null), "u", "홍길동"))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.CONFLICT));
    }

    @Test
    void editHeader_capturesEditRevision() {
        // 헤더 batch 수정(partnerName/memo 등 toSnapshot 필드)도 버전이력에 잡혀야 한다 (캡처 완전성).
        Slip slip = preparedOutbound(SlipStatus.DRAFT, 1, new BigDecimal("10.00"));
        when(slipRepository.findById(slipId)).thenReturn(Optional.of(slip));

        // [UUID 비공개 가드] X-User-Name(="홍길동") 이 actorName 으로 캡처되고, callerId(="user-1")
        // 는 actorId 로만 쓰여 버전이력 actorName 에는 노출되지 않는다.
        service.editHeader(slipId,
                new EditHeaderRequest(null, "새거래처", null, "새메모", null, null), "user-1", "홍길동");

        verify(slipRevisionService, times(1)).capture(
                eq(slip),
                eq(com.samhanair.logis.slip.revision.domain.SlipRevisionType.EDIT),
                eq(null), any(UUID.class), eq("홍길동"), eq(null));
    }

    @Test
    void editHeader_withUuidCallerName_capturesNullActorName() {
        // [UUID 비공개 가드] X-User-Name 이 UUID 형태이면 actorName=null 로 캡처되어
        // 버전이력에 계정 UUID 가 노출되지 않는다 ([[uuid-no-user-visibility]]).
        Slip slip = preparedOutbound(SlipStatus.DRAFT, 1, new BigDecimal("10.00"));
        when(slipRepository.findById(slipId)).thenReturn(Optional.of(slip));
        String uuidName = UUID.randomUUID().toString();

        service.editHeader(slipId,
                new EditHeaderRequest(null, "새거래처", null, "새메모", null, null),
                UUID.randomUUID().toString(), uuidName);

        verify(slipRevisionService, times(1)).capture(
                eq(slip),
                eq(com.samhanair.logis.slip.revision.domain.SlipRevisionType.EDIT),
                eq(null), any(UUID.class), eq(null), eq(null));
    }

    @Test
    void editHeader_withoutCallerName_capturesNullActorName() {
        // [UUID 비공개 가드] X-User-Name 부재 시 callerId(UUID) 폴백 금지 → actorName=null.
        Slip slip = preparedOutbound(SlipStatus.DRAFT, 1, new BigDecimal("10.00"));
        when(slipRepository.findById(slipId)).thenReturn(Optional.of(slip));

        service.editHeader(slipId,
                new EditHeaderRequest(null, "새거래처", null, "새메모", null, null),
                UUID.randomUUID().toString(), null);

        verify(slipRevisionService, times(1)).capture(
                eq(slip),
                eq(com.samhanair.logis.slip.revision.domain.SlipRevisionType.EDIT),
                eq(null), any(UUID.class), eq(null), eq(null));
    }

    // ---------- reject memo 변경 revision 캡처 (Phase 2.1) ----------

    @Test
    void reject_withReason_capturesEditRevision() {
        // 반려 사유가 memo 앞에 prepend 되어 toSnapshot 필드(memo)가 실제 변경 → EDIT 캡처.
        Slip slip = preparedOutbound(SlipStatus.SENT, 1, new BigDecimal("10.00"));
        when(slipRepository.findById(slipId)).thenReturn(Optional.of(slip));

        service.reject(slipId, "user-1", "김매니저", "재고 없음");

        verify(slipRevisionService, times(1)).capture(
                eq(slip),
                eq(com.samhanair.logis.slip.revision.domain.SlipRevisionType.EDIT),
                eq(null), any(UUID.class), eq("김매니저"), eq(null));
    }

    @Test
    void reject_withoutReason_doesNotCaptureRevision() {
        // reasonText 가 null 이면 memo 변경 없음 → 상태전이만 → 캡처 안 함.
        Slip slip = preparedOutbound(SlipStatus.SENT, 1, new BigDecimal("10.00"));
        when(slipRepository.findById(slipId)).thenReturn(Optional.of(slip));

        service.reject(slipId, "user-1", "김매니저", null);

        verify(slipRevisionService, never()).capture(
                any(), any(), any(), any(), any(), any());
    }

    // ---------- 라인 mutation revision 캡처 (Phase 2.1 — addLine/removeLine) ----------

    @Test
    void addLine_capturesEditRevision() {
        // 라인 추가도 헤더+라인 전체 버전이력 스냅샷에 잡혀야 한다 (Q3 요구).
        Slip slip = preparedOutbound(SlipStatus.DRAFT, 1, new BigDecimal("10.00"));
        when(slipRepository.findById(slipId)).thenReturn(Optional.of(slip));

        service.addLine(slipId,
                new com.samhanair.logis.slip.web.dto.AddLineRequest(
                        productId, "에어컨", "M-1", null, 2, new BigDecimal("100.00"), null),
                "user-1", "홍길동");

        verify(slipRevisionService, times(1)).capture(
                eq(slip),
                eq(com.samhanair.logis.slip.revision.domain.SlipRevisionType.EDIT),
                eq(null), any(UUID.class), eq("홍길동"), eq(null));
    }

    @Test
    void removeLine_capturesEditRevision() {
        // 라인 삭제도 롤백 가능해야 하므로 revision 으로 캡처되어야 한다.
        Slip slip = preparedOutbound(SlipStatus.DRAFT, 1, new BigDecimal("10.00"));
        UUID lineId = UUID.randomUUID();
        ReflectionTestUtils.setField(slip.getLines().get(0), "id", lineId);
        when(slipRepository.findById(slipId)).thenReturn(Optional.of(slip));

        service.removeLine(slipId, lineId, "user-1", "홍길동");

        verify(slipRevisionService, times(1)).capture(
                eq(slip),
                eq(com.samhanair.logis.slip.revision.domain.SlipRevisionType.EDIT),
                eq(null), any(UUID.class), eq("홍길동"), eq(null));
    }

    // ---------- read ----------

    @Test
    void getOne_notFound_throwsNotFound() {
        when(slipRepository.findById(slipId)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.getOne(slipId))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.NOT_FOUND));
    }

    // ---------- helpers ----------

    private Slip preparedOutbound(SlipStatus status, int qty, BigDecimal unitPrice) {
        Slip slip = Slip.createOutbound("2026/05/04-1", LocalDate.of(2026, 5, 4), 1,
                sourceWh, destWh, partnerId, "삼한공조", DeliveryTag.DAY, null, "u");
        ReflectionTestUtils.setField(slip, "id", slipId);
        slip.addLine(SlipLine.create(slip, productId, "에어컨", "M-1", null, qty, unitPrice, null));
        forceStatus(slip, status);
        return slip;
    }

    private Slip preparedInbound(SlipStatus status) {
        return preparedInbound(status, null, productId, "p", null,
                1, new BigDecimal("10.00"));
    }

    private Slip preparedInbound(SlipStatus status, DeliveryTag deliveryTag, UUID lineProductId,
                                 String productName, String modelName, int qty, BigDecimal unitPrice) {
        Slip slip = Slip.createInbound("2026/05/04-1", LocalDate.of(2026, 5, 4), 1,
                destWh, partnerId, "삼한", deliveryTag, null, "u");
        ReflectionTestUtils.setField(slip, "id", slipId);
        slip.addLine(SlipLine.create(slip, lineProductId, productName, modelName, null,
                qty, unitPrice, null));
        forceStatus(slip, status);
        return slip;
    }

    private void forceStatus(Slip slip, SlipStatus status) {
        ReflectionTestUtils.setField(slip, "status", status);
    }
}
