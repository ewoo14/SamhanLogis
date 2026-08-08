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
import com.samhanair.logis.slip.editrequest.service.SlipEditRequestService;
import com.samhanair.logis.slip.domain.DeliveryTag;
import com.samhanair.logis.slip.domain.Slip;
import com.samhanair.logis.slip.domain.SlipLine;
import com.samhanair.logis.slip.domain.SlipStatus;
import com.samhanair.logis.slip.domain.SlipType;
import com.samhanair.logis.slip.price.service.PartnerProductPriceMemoryCommand;
import com.samhanair.logis.slip.repository.SlipRepository;
import com.samhanair.logis.slip.web.dto.CreateSlipRequest;
import com.samhanair.logis.slip.web.dto.EditHeaderRequest;
import com.samhanair.logis.slip.web.dto.SlipDetailResponse;
import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.ArgumentCaptor;
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
    @Mock private WarehouseCodeSnapshotService warehouseCodeSnapshotService;
    /** 권한 재편 Phase 2.1 Task 2 — mutation 스냅샷 캡처. 본 테스트에서는 mock 격리. */
    @Mock private com.samhanair.logis.slip.revision.service.SlipRevisionService slipRevisionService;
    /** S2d-1 — 임계 전이 anchor max revision 조회. 본 테스트에서는 mock 격리. */
    @Mock private com.samhanair.logis.slip.revision.repository.SlipRevisionRepository slipRevisionRepository;
    /**
     * 출고 마감 게이트 — SlipService 가 slipDate 기본값 계산 시 LocalDate.now(clock) 사용.
     * Clock @Mock 미등록 시 @InjectMocks 가 null 주입 → NPE.
     */
    @Mock private Clock clock;
    /**
     * 출고전표 마감 게이트 — create() 의 cutoffGuard.assertWithinCutoff() 호출 경로.
     * 단위 테스트에서는 mock 격리(lenient, 기본 통과).
     */
    @Mock private com.samhanair.logis.slip.service.cutoff.OutboundCutoffGuard cutoffGuard;
    @Mock private com.samhanair.logis.slip.service.closing.SlipClosedDateGuard closedDateGuard;
    /** 결재선 결재자 게이트 — 단위 테스트 격리. */
    @Mock private com.samhanair.logis.slip.client.ApprovalLineAuthorizeClient approvalLineAuthorizeClient;
    /** user-service 내부 클라이언트 — 단위 테스트 격리 (ownerFullName resolve). */
    @Mock private com.samhanair.logis.slip.client.UserInternalClient userInternalClient;
    /** SSE 브로커 — 단위 테스트 격리 (restore broadcast). */
    @Mock private com.samhanair.logis.slip.realtime.SlipRealtimeBroker broker;
    /** 보상 감사 로그 — 단위 테스트 격리. */
    @Mock private com.samhanair.logis.slip.service.CompensationAuditWriter compensationAuditWriter;
    /** #809 가격기억 — 단위 테스트 격리. */
    @Mock private com.samhanair.logis.slip.price.service.PartnerProductPriceMemoryService priceMemoryService;

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

        // Clock stub — slipDate=null 경로에서 LocalDate.now(clock) 호출 시 NPE 방지.
        // 채번(slipNumberService)은 mock 이라 날짜 값 자체는 무관.
        lenient().when(clock.instant()).thenReturn(Instant.parse("2026-05-04T00:00:00Z"));
        lenient().when(clock.getZone()).thenReturn(ZoneId.of("Asia/Seoul"));

        lenient().when(productClient.lookup(any())).thenReturn(List.of(
                new ProductSummary(productId, "에어컨", "M-1", "AC-001", UUID.randomUUID(),
                        new BigDecimal("1000.00"), "ACTIVE")));
        lenient().when(productClient.requireExists(productId)).thenReturn(
                new ProductSummary(productId, "에어컨", "M-1", "AC-001", UUID.randomUUID(),
                        new BigDecimal("1000.00"), "ACTIVE"));
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
                // V52 하차일 override (null = 규칙 자동 계산)
                null,
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
    void create_checksClosedDateGuardForOutbound() {
        when(slipNumberService.next(any(LocalDate.class), eq(SlipType.OUTBOUND))).thenReturn("2026/05/04-3");
        when(slipNumberService.extractSeqNo("2026/05/04-3")).thenReturn(3);
        when(slipRepository.save(any(Slip.class))).thenAnswer(inv -> inv.getArgument(0));

        CreateSlipRequest req = new CreateSlipRequest(
                SlipType.OUTBOUND, LocalDate.of(2026, 5, 4), sourceWh, destWh, partnerId, "삼한공조",
                DeliveryTag.DAY, "마감 게이트", null, null,
                null, null, null, null, null, null, null, null, null, null, null, null,
                null, null, null, null, null,
                null,
                List.of(new CreateSlipRequest.SlipLineRequest(productId, "에어컨", "M-1", null,
                        1, new BigDecimal("100.00"), null)));

        service.create(req, "user-1", "홍길동");

        verify(closedDateGuard).assertCreatable(SlipType.OUTBOUND, LocalDate.of(2026, 5, 4), "user-1");
    }

    @Test
    void process_checksClosedDateGuardBeforeStatusMutation() {
        Slip slip = org.mockito.Mockito.mock(Slip.class);
        when(slipRepository.findById(slipId)).thenReturn(Optional.of(slip));
        when(slip.getSlipType()).thenReturn(SlipType.OUTBOUND);
        when(slip.getSlipDate()).thenReturn(LocalDate.of(2026, 5, 4));
        org.mockito.Mockito.doThrow(new BusinessException(ErrorCode.CONFLICT, "마감된 날짜입니다"))
                .when(closedDateGuard).assertAllowed(SlipType.OUTBOUND, LocalDate.of(2026, 5, 4), "user-1");

        assertThatThrownBy(() -> service.process(slipId, "user-1"))
                .isInstanceOf(BusinessException.class)
                .hasMessage("마감된 날짜입니다");
        verify(slip, never()).process();
    }

    @Test
    void create_bundleWithoutModelCode_isRejectedBeforeParentLinePersistence() {
        when(productClient.lookup(any())).thenReturn(List.of(new ProductSummary(
                productId, "세트", "세트", "BUNDLE-001", UUID.randomUUID(),
                new BigDecimal("1000.00"), "ACTIVE", false, null, "BUNDLE", null)));

        CreateSlipRequest req = new CreateSlipRequest(
                SlipType.OUTBOUND, LocalDate.of(2026, 5, 4),
                sourceWh, destWh, partnerId, "삼한공조", DeliveryTag.DAY, "세트 부모 차단",
                null, null,
                null, null, null, null, null, null, null, null, null, null, null, null,
                null, null, null, null, null,
                null,
                List.of(new CreateSlipRequest.SlipLineRequest(productId, "세트", "세트", null,
                        1, new BigDecimal("100.00"), null)));

        assertThatThrownBy(() -> service.create(req, "user-1", "홍길동"))
                .isInstanceOf(BusinessException.class)
                .hasMessage("세트 구성품 전개에 필요한 모델코드가 없습니다.");
    }

    @Test
    void create_authoritativeAmounts_preservesRequestedUnitPriceInResponse() {
        when(slipNumberService.next(any(LocalDate.class), eq(SlipType.OUTBOUND))).thenReturn("2026/05/04-2");
        when(slipNumberService.extractSeqNo("2026/05/04-2")).thenReturn(2);
        when(slipRepository.save(any(Slip.class))).thenAnswer(inv -> {
            Slip s = inv.getArgument(0);
            ReflectionTestUtils.setField(s, "id", slipId);
            return s;
        });

        CreateSlipRequest req = new CreateSlipRequest(
                SlipType.OUTBOUND, LocalDate.of(2026, 5, 4),
                sourceWh, destWh, partnerId, "삼한공조", DeliveryTag.DAY, "권위 금액 QA",
                null, null,
                null, null, null, null, null, null, null, null, null, null, null, null,
                null, null, null, null, null,
                null,
                List.of(new CreateSlipRequest.SlipLineRequest(productId, "에어컨", "M-1", null,
                        2, new BigDecimal("11000"), null, null, true,
                        new BigDecimal("50000"), new BigDecimal("2000"), new BigDecimal("52000"))));

        SlipDetailResponse res = service.create(req, "user-1", "홍길동");

        assertThat(res.lines()).hasSize(1);
        // 재수렴 4차(#937): 요청 단가(VAT 포함)는 unitPriceWithVat 에 그대로 보존하고,
        // VAT 제외 컬럼은 권위 공급가액에서 유도한다(50,000 / 2 = 25,000) — 인쇄 항등식
        // "단가 x 수량 = 공급가액" 을 정의상 만족시키기 위해서다.
        assertThat(res.lines().get(0).unitPrice()).isEqualByComparingTo("25000");
        assertThat(res.lines().get(0).unitPriceWithVat()).isEqualByComparingTo("11000");
        assertThat(res.lines().get(0).supplyAmount()).isEqualByComparingTo("50000");
        assertThat(res.lines().get(0).vatAmount()).isEqualByComparingTo("2000");
        assertThat(res.lines().get(0).lineTotal()).isEqualByComparingTo("50000");
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
                // V52 하차일 override (null = 규칙 자동 계산)
                null,
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
    void accept_outbound_mixedSerialAndBatch_routesSerialInstancesAndBatchReserve() {
        UUID batchProductId = UUID.randomUUID();
        Slip slip = preparedOutboundMixed(SlipStatus.SENT, batchProductId);
        when(slipRepository.findById(slipId)).thenReturn(Optional.of(slip));
        when(productClient.requireExists(productId)).thenReturn(
                new ProductSummary(productId, "에어컨", "MODEL-SERIAL", "AC-SERIAL-001", UUID.randomUUID(),
                        new BigDecimal("500000.00"), "ACTIVE", true));
        when(productClient.requireExists(batchProductId)).thenReturn(
                new ProductSummary(batchProductId, "배관", "PIPE-BATCH", "PIPE-001", UUID.randomUUID(),
                        new BigDecimal("10000.00"), "ACTIVE", false));

        service.accept(slipId, "warehouse-1");

        verify(inventoryClient, times(1))
                .reserveInstances(eq("AC-SERIAL-001"), eq(sourceWh), eq(5), eq("2026/05/04-1"));
        verify(inventoryClient, times(1))
                .reserve(eq(batchProductId), eq(sourceWh), eq(4), anyString(), eq(slipId));
        verify(inventoryClient, never())
                .reserve(eq(productId), any(), anyInt(), anyString(), any());
    }

    @Test
    void accept_outbound_serialReservedThenBatchFails_compensatesSerialRelease() {
        UUID batchProductId = UUID.randomUUID();
        Slip slip = preparedOutboundMixed(SlipStatus.SENT, batchProductId);
        when(slipRepository.findById(slipId)).thenReturn(Optional.of(slip));
        when(productClient.requireExists(productId)).thenReturn(
                new ProductSummary(productId, "에어컨", "MODEL-SERIAL", "AC-SERIAL-001", UUID.randomUUID(),
                        new BigDecimal("500000.00"), "ACTIVE", true));
        when(productClient.requireExists(batchProductId)).thenReturn(
                new ProductSummary(batchProductId, "배관", "PIPE-BATCH", "PIPE-001", UUID.randomUUID(),
                        new BigDecimal("10000.00"), "ACTIVE", false));
        // serial 인스턴스 예약 성공 후 batch 예약이 재고부족으로 실패하는 순서
        org.mockito.Mockito.doThrow(new BusinessException(ErrorCode.CONFLICT, "재고 부족"))
                .when(inventoryClient).reserve(eq(batchProductId), eq(sourceWh), eq(4), anyString(), eq(slipId));

        assertThatThrownBy(() -> service.accept(slipId, "warehouse-1"))
                .isInstanceOf(BusinessException.class);

        // 이미 성공한 serial 예약을 역순 보상(release)하여 고아 RESERVED 가 남지 않는다
        verify(inventoryClient, times(1))
                .releaseInstances(eq("2026/05/04-1"), eq("AC-SERIAL-001"));
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
    void complete_outbound_mixedSerialAndBatch_routesSerialShipAndBatchDeduct() {
        UUID batchProductId = UUID.randomUUID();
        Slip slip = preparedOutboundMixed(SlipStatus.PROCESSING, batchProductId);
        slip.setPartnerCode("P-2026-0001");
        when(slipRepository.findById(slipId)).thenReturn(Optional.of(slip));
        when(productClient.requireExists(productId)).thenReturn(
                new ProductSummary(productId, "에어컨", "MODEL-SERIAL", "AC-SERIAL-001", UUID.randomUUID(),
                        new BigDecimal("500000.00"), "ACTIVE", true));
        when(productClient.requireExists(batchProductId)).thenReturn(
                new ProductSummary(batchProductId, "배관", "PIPE-BATCH", "PIPE-001", UUID.randomUUID(),
                        new BigDecimal("10000.00"), "ACTIVE", false));

        service.complete(slipId);

        verify(inventoryClient, times(1))
                .shipInstances(eq("2026/05/04-1"), eq("AC-SERIAL-001"), eq("P-2026-0001"), eq(null));
        verify(inventoryClient, times(1))
                .deduct(eq(batchProductId), eq(sourceWh), eq(4), eq(true), anyString(), eq(slipId));
        verify(inventoryClient, never())
                .deduct(eq(productId), any(), anyInt(), anyBoolean(), anyString(), any());
    }

    @Test
    void complete_inbound_callsInventoryInbound() {
        // Slice A hotfix: 입고 PROCESSING → INSPECTING + inbound.
        Slip slip = preparedInbound(SlipStatus.PROCESSING);
        when(slipRepository.findById(slipId)).thenReturn(Optional.of(slip));

        service.complete(slipId);

        assertThat(slip.getStatus()).isEqualTo(SlipStatus.INSPECTING);
        verify(inventoryClient, times(1))
                .inbound(eq(productId), eq(destWh), eq(1), eq("2026/05/04-1"), eq(new BigDecimal("10.00")));
    }

    @Test
    void complete_inbound_authoritativeBatch_usesSupplyUnitCostWithoutVat() {
        Slip slip = Slip.createInbound("2026/05/04-1", LocalDate.of(2026, 5, 4), 1,
                destWh, partnerId, "삼한", null, null, "u");
        ReflectionTestUtils.setField(slip, "id", slipId);
        slip.addLine(SlipLine.createFromAuthoritativeAmounts(
                slip, productId, "배관", "PIPE-BATCH", null, 2,
                new BigDecimal("11000"), new BigDecimal("20000"), new BigDecimal("2000"),
                new BigDecimal("22000"), null, null));
        forceStatus(slip, SlipStatus.PROCESSING);
        when(slipRepository.findById(slipId)).thenReturn(Optional.of(slip));
        when(productClient.requireExists(productId)).thenReturn(
                new ProductSummary(productId, "배관", "PIPE-BATCH", "PIPE-001", UUID.randomUUID(),
                        new BigDecimal("10000.00"), "ACTIVE", false));

        service.complete(slipId);

        verify(inventoryClient).inbound(eq(productId), eq(destWh), eq(2),
                eq("2026/05/04-1"), eq(new BigDecimal("10000.00")));
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
    void complete_inbound_authoritativeSerial_usesSupplyUnitCostWithoutVat() {
        Slip slip = Slip.createInbound("2026/05/04-1", LocalDate.of(2026, 5, 4), 1,
                destWh, partnerId, "삼한", null, null, "u");
        ReflectionTestUtils.setField(slip, "id", slipId);
        slip.addLine(SlipLine.createFromAuthoritativeAmounts(
                slip, productId, "에어컨", "MODEL-SERIAL", null, 2,
                new BigDecimal("11000"), new BigDecimal("20000"), new BigDecimal("2000"),
                new BigDecimal("22000"), null, null));
        forceStatus(slip, SlipStatus.PROCESSING);
        when(slipRepository.findById(slipId)).thenReturn(Optional.of(slip));
        when(productClient.requireExists(productId)).thenReturn(
                new ProductSummary(productId, "에어컨", "MODEL-SERIAL", "AC-SERIAL-001", UUID.randomUUID(),
                        new BigDecimal("10000.00"), "ACTIVE", true));

        service.complete(slipId);

        verify(inventoryClient).inboundInstances(eq(productId), eq("AC-SERIAL-001"), eq(destWh),
                eq(2), eq("구매"), eq("2026/05/04-1"), eq(new BigDecimal("10000.00")));
    }

    @Test
    void complete_inbound_duplicateSerialProductLines_aggregatesQuantityForIdempotentBatch() {
        Slip slip = Slip.createInbound("2026/05/04-1", LocalDate.of(2026, 5, 4), 1,
                destWh, partnerId, "삼한", null, null, "u");
        ReflectionTestUtils.setField(slip, "id", slipId);
        slip.addLine(SlipLine.create(slip, productId, "에어컨", "MODEL-SERIAL", null,
                2, new BigDecimal("500000.00"), null));
        slip.addLine(SlipLine.create(slip, productId, "에어컨", "MODEL-SERIAL", null,
                3, new BigDecimal("500000.00"), null));
        forceStatus(slip, SlipStatus.PROCESSING);
        when(slipRepository.findById(slipId)).thenReturn(Optional.of(slip));
        when(productClient.requireExists(productId)).thenReturn(
                new ProductSummary(productId, "에어컨", "MODEL-SERIAL", "AC-SERIAL-001", UUID.randomUUID(),
                        new BigDecimal("500000.00"), "ACTIVE", true));

        service.complete(slipId);

        verify(inventoryClient, times(1))
                .inboundInstances(eq(productId), eq("AC-SERIAL-001"), eq(destWh), eq(5),
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
    void complete_inbound_returnTag_serialProduct_callsRecallInstances() {
        Slip slip = preparedInbound(SlipStatus.PROCESSING, DeliveryTag.RETURN, productId,
                "에어컨", "MODEL-RETURN", 1, new BigDecimal("500000.00"));
        slip.setPartnerCode("P-RETURN-001");
        when(slipRepository.findById(slipId)).thenReturn(Optional.of(slip));
        when(productClient.requireExists(productId)).thenReturn(
                new ProductSummary(productId, "에어컨", "MODEL-RETURN", "AC-RETURN-001", UUID.randomUUID(),
                        new BigDecimal("500000.00"), "ACTIVE", true));

        service.complete(slipId);

        verify(inventoryClient).recallInstances(eq("P-RETURN-001"), eq("AC-RETURN-001"),
                eq(1), eq("2026/05/04-1"));
        verify(inventoryClient, never()).inboundInstances(any(), anyString(), any(), anyInt(),
                anyString(), anyString(), any(BigDecimal.class));
        verify(inventoryClient, never()).inbound(any(), any(), anyInt(), anyString(), any(BigDecimal.class));
    }

    @Test
    void complete_inbound_returnTripTag_serialProduct_callsRecallInstances() {
        Slip slip = preparedInbound(SlipStatus.PROCESSING, DeliveryTag.RETURN_TRIP, productId,
                "에어컨", "MODEL-RETURN-TRIP", 1, new BigDecimal("500000.00"));
        slip.setPartnerCode("P-RETURN-TRIP-001");
        when(slipRepository.findById(slipId)).thenReturn(Optional.of(slip));
        when(productClient.requireExists(productId)).thenReturn(
                new ProductSummary(productId, "에어컨", "MODEL-RETURN-TRIP", "AC-RETURN-TRIP-001",
                        UUID.randomUUID(), new BigDecimal("500000.00"), "ACTIVE", true));

        service.complete(slipId);

        verify(inventoryClient).recallInstances(eq("P-RETURN-TRIP-001"), eq("AC-RETURN-TRIP-001"),
                eq(1), eq("2026/05/04-1"));
        verify(inventoryClient, never()).inboundInstances(any(), anyString(), any(), anyInt(),
                anyString(), anyString(), any(BigDecimal.class));
        verify(inventoryClient, never()).inbound(any(), any(), anyInt(), anyString(), any(BigDecimal.class));
    }

    @Test
    void complete_inbound_returnTag_serialProduct_withoutPartnerCode_throwsConflict() {
        Slip slip = preparedInbound(SlipStatus.PROCESSING, DeliveryTag.RETURN, productId,
                "에어컨", "MODEL-RETURN", 1, new BigDecimal("500000.00"));
        when(slipRepository.findById(slipId)).thenReturn(Optional.of(slip));
        when(productClient.requireExists(productId)).thenReturn(
                new ProductSummary(productId, "에어컨", "MODEL-RETURN", "AC-RETURN-001", UUID.randomUUID(),
                        new BigDecimal("500000.00"), "ACTIVE", true));

        assertThatThrownBy(() -> service.complete(slipId))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.CONFLICT))
                .hasMessageContaining("출고 거래처 코드");

        verify(inventoryClient, never()).recallInstances(anyString(), anyString(), anyInt(), anyString());
        verify(inventoryClient, never()).inbound(any(), any(), anyInt(), anyString(), any(BigDecimal.class));
    }

    @Test
    void complete_inbound_returnTag_batchProduct_keepsLotInboundPath() {
        Slip slip = preparedInbound(SlipStatus.PROCESSING, DeliveryTag.RETURN, productId,
                "배관", "PIPE-BATCH", 3, new BigDecimal("10000.00"));
        slip.setPartnerCode("P-RETURN-BATCH-001");
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

    @Test
    void complete_inbound_returnTag_batchDuplicateLines_passesEachLineToInventory() {
        Slip slip = Slip.createInbound("2026/05/04-1", LocalDate.of(2026, 5, 4), 1,
                destWh, partnerId, "삼한", DeliveryTag.RETURN, null, "u");
        slip.setPartnerCode("P-RETURN-BATCH-MULTI-001");
        ReflectionTestUtils.setField(slip, "id", slipId);
        SlipLine first = SlipLine.create(slip, productId, "배관", "PIPE-BATCH", null,
                2, new BigDecimal("10000.00"), null);
        SlipLine second = SlipLine.create(slip, productId, "배관", "PIPE-BATCH", null,
                3, new BigDecimal("10000.00"), null);
        ReflectionTestUtils.setField(first, "id", UUID.randomUUID());
        ReflectionTestUtils.setField(second, "id", UUID.randomUUID());
        slip.addLine(first);
        slip.addLine(second);
        forceStatus(slip, SlipStatus.PROCESSING);
        when(slipRepository.findById(slipId)).thenReturn(Optional.of(slip));
        when(productClient.requireExists(productId)).thenReturn(
                new ProductSummary(productId, "배관", "PIPE-BATCH", "PIPE-001", UUID.randomUUID(),
                        new BigDecimal("10000.00"), "ACTIVE", false));

        service.complete(slipId);

        verify(inventoryClient).inbound(eq(productId), eq(destWh), eq(2),
                eq("2026/05/04-1"), eq(first.getId()), eq(new BigDecimal("10000.00")));
        verify(inventoryClient).inbound(eq(productId), eq(destWh), eq(3),
                eq("2026/05/04-1"), eq(second.getId()), eq(new BigDecimal("10000.00")));
        System.out.println("C: batch 반품 복수 라인 2+3 = 5 (각 라인 1회)");
    }

    @Test
    void complete_inbound_returnTag_mixedSerialAndBatch_recallsSerialThenInboundBatch() {
        UUID batchProductId = UUID.randomUUID();
        Slip slip = Slip.createInbound("2026/05/04-1", LocalDate.of(2026, 5, 4), 1,
                destWh, partnerId, "삼한", DeliveryTag.RETURN, null, "u");
        slip.setPartnerCode("P-RETURN-MIX-001");
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

        org.mockito.InOrder inOrder = org.mockito.Mockito.inOrder(inventoryClient);
        inOrder.verify(inventoryClient).recallInstances(eq("P-RETURN-MIX-001"), eq("AC-SERIAL-001"),
                eq(2), eq("2026/05/04-1"));
        inOrder.verify(inventoryClient).inbound(eq(batchProductId), eq(destWh), eq(5),
                eq("2026/05/04-1"), eq(new BigDecimal("10000.00")));
        verify(inventoryClient, never()).inboundInstances(any(), anyString(), any(), anyInt(),
                anyString(), anyString(), any(BigDecimal.class));
    }

    @Test
    void complete_inbound_returnTag_mixedSerialAndBatch_batchFailureUnrecallsSerial() {
        UUID batchProductId = UUID.randomUUID();
        Slip slip = Slip.createInbound("2026/05/04-1", LocalDate.of(2026, 5, 4), 1,
                destWh, partnerId, "삼한", DeliveryTag.RETURN, null, "u");
        slip.setPartnerCode("P-RETURN-MIX-002");
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
        org.mockito.Mockito.doThrow(new BusinessException(ErrorCode.CONFLICT, "batch inbound 실패"))
                .when(inventoryClient).inbound(eq(batchProductId), eq(destWh), eq(5),
                        eq("2026/05/04-1"), eq(new BigDecimal("10000.00")));

        assertThatThrownBy(() -> service.complete(slipId))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("batch inbound 실패");

        org.mockito.InOrder inOrder = org.mockito.Mockito.inOrder(inventoryClient);
        inOrder.verify(inventoryClient).recallInstances(eq("P-RETURN-MIX-002"), eq("AC-SERIAL-001"),
                eq(2), eq("2026/05/04-1"));
        inOrder.verify(inventoryClient).inbound(eq(batchProductId), eq(destWh), eq(5),
                eq("2026/05/04-1"), eq(new BigDecimal("10000.00")));
        inOrder.verify(inventoryClient).unrecallInstances(eq("2026/05/04-1"), eq("AC-SERIAL-001"));
    }

    // -------- Slice A hotfix — inspect (검수 완료) endpoint --------

    @Test
    void inspect_fromInspecting_movesToCompleted_setsInspectorUserId() {
        // Slice A hotfix: inspect (검수 완료) = INSPECTING → COMPLETED + inspector.
        Slip slip = preparedOutbound(SlipStatus.INSPECTING, 1, new BigDecimal("10.00"));
        when(slipRepository.findById(slipId)).thenReturn(Optional.of(slip));
        when(slipRevisionRepository.maxRevisionNo(slipId)).thenReturn(5);

        SlipDetailResponse res = service.inspect(slipId, "inspector-1");

        assertThat(res.status()).isEqualTo(SlipStatus.COMPLETED);
        assertThat(res.inspectorUserId()).isEqualTo("inspector-1");
        assertThat(res.inspectorSignedAt()).isNotNull();
        assertThat(slip.getRedlineAnchorRevisionNo()).isEqualTo(5);
        // 검수 완료는 inventory mutation 없음 (deduct 는 complete 시점에 이미).
        verify(inventoryClient, never())
                .deduct(any(), any(), anyInt(), anyBoolean(), anyString(), any());
    }

    @Test
    void send_inbound_capturesRedlineAnchorFromMaxStoredRevision() {
        Slip slip = preparedInbound(SlipStatus.SAVED);
        when(slipRepository.findById(slipId)).thenReturn(Optional.of(slip));
        when(slipRevisionRepository.maxRevisionNo(slipId)).thenReturn(3);

        SlipDetailResponse res = service.send(slipId);

        assertThat(res.status()).isEqualTo(SlipStatus.SENT);
        assertThat(slip.getRevisionCountBaseline()).isEqualTo(slip.getRevisionCount());
        assertThat(slip.getRedlineAnchorRevisionNo()).isEqualTo(3);
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
    void reject_fromAccepted_outbound_mixedSerialAndBatch_routesSerialReleaseAndBatchRelease() {
        UUID batchProductId = UUID.randomUUID();
        Slip slip = preparedOutboundMixed(SlipStatus.ACCEPTED, batchProductId);
        when(slipRepository.findById(slipId)).thenReturn(Optional.of(slip));
        when(productClient.requireExists(productId)).thenReturn(
                new ProductSummary(productId, "에어컨", "MODEL-SERIAL", "AC-SERIAL-001", UUID.randomUUID(),
                        new BigDecimal("500000.00"), "ACTIVE", true));
        when(productClient.requireExists(batchProductId)).thenReturn(
                new ProductSummary(batchProductId, "배관", "PIPE-BATCH", "PIPE-001", UUID.randomUUID(),
                        new BigDecimal("10000.00"), "ACTIVE", false));

        service.reject(slipId, "manager-1", "김매니저", "재고 없음");

        verify(inventoryClient, times(1))
                .releaseInstances(eq("2026/05/04-1"), eq("AC-SERIAL-001"));
        verify(inventoryClient, times(1))
                .release(eq(batchProductId), eq(sourceWh), eq(4), anyString(), eq(slipId));
        verify(inventoryClient, never())
                .release(eq(productId), any(), anyInt(), anyString(), any());
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
                new EditHeaderRequest(null, "새거래처", null, "새메모", null, null, null), "u", "홍길동");

        assertThat(slip.getPartnerName()).isEqualTo("새거래처");
        assertThat(slip.getMemo()).isEqualTo("새메모");
    }

    @Test
    void editHeader_inSent_throwsConflict() {
        Slip slip = preparedOutbound(SlipStatus.SENT, 1, new BigDecimal("10.00"));
        when(slipRepository.findById(slipId)).thenReturn(Optional.of(slip));

        assertThatThrownBy(() -> service.editHeader(slipId,
                new EditHeaderRequest(null, "x", null, null, null, null, null), "u", "홍길동"))
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
                new EditHeaderRequest(null, "새거래처", null, "새메모", null, null, null), "user-1", "홍길동");

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
                new EditHeaderRequest(null, "새거래처", null, "새메모", null, null, null),
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
                new EditHeaderRequest(null, "새거래처", null, "새메모", null, null, null),
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
    void addLine_remembersVatInclusiveInputPriceExactly() {
        Slip slip = preparedOutbound(SlipStatus.DRAFT, 1, new BigDecimal("10.00"));
        when(slipRepository.findById(slipId)).thenReturn(Optional.of(slip));

        service.addLine(slipId,
                new com.samhanair.logis.slip.web.dto.AddLineRequest(
                        productId, "에어컨", "M-1", null, 2,
                        new BigDecimal("123456.00"), null, null, true),
                "user-1", "홍길동");

        ArgumentCaptor<List<PartnerProductPriceMemoryCommand>> captor = ArgumentCaptor.forClass(List.class);
        verify(priceMemoryService).rememberBatchAfterCommit(captor.capture(), eq("slip.addLine"));
        assertThat(captor.getValue()).hasSize(1);
        assertThat(captor.getValue().get(0).partnerId()).isEqualTo(partnerId);
        assertThat(captor.getValue().get(0).productId()).isEqualTo(productId);
        assertThat(captor.getValue().get(0).unitPrice()).isEqualByComparingTo("123456.00");
        assertThat(captor.getValue().get(0).source()).isEqualTo("LINE_SAVE");
    }

    @Test
    void addLine_withoutPartnerId_skipsPriceMemory() {
        Slip slip = Slip.createOutbound("2026/05/04-1", LocalDate.of(2026, 5, 4), 1,
                sourceWh, destWh, null, "거래처 없음", DeliveryTag.DAY, null, "user-1");
        ReflectionTestUtils.setField(slip, "id", slipId);
        when(slipRepository.findById(slipId)).thenReturn(Optional.of(slip));

        service.addLine(slipId,
                new com.samhanair.logis.slip.web.dto.AddLineRequest(
                        productId, "에어컨", "M-1", null, 2,
                        new BigDecimal("123456.00"), null, null, true),
                "user-1", "홍길동");

        ArgumentCaptor<List<PartnerProductPriceMemoryCommand>> captor = ArgumentCaptor.forClass(List.class);
        verify(priceMemoryService).rememberBatchAfterCommit(captor.capture(), eq("slip.addLine"));
        assertThat(captor.getValue()).isEmpty();
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

    // ---------- restore revision ----------

    @Test
    void restoreToRevision_afterOutboundCompleted_incrementsEditHistoryCount() {
        // OUTBOUND 임계(COMPLETED) 이후 버전 복원은 사용자 관점의 수정으로 카운트한다.
        Slip slip = preparedOutbound(SlipStatus.DRAFT, 1, new BigDecimal("10.00"));
        slip.save();
        slip.send();
        slip.accept("warehouse-1");
        slip.process();
        slip.complete();
        slip.inspect("inspector-1");
        when(slipRepository.findById(slipId)).thenReturn(Optional.of(slip));

        assertThat(slip.getRevisionCountBaseline()).isEqualTo(0);
        assertThat(slip.editHistoryCount()).isZero();

        service.restoreToRevision(slipId, 1, UUID.randomUUID().toString(), "관리자");

        assertThat(slip.getRevisionCount()).isEqualTo(1);
        assertThat(slip.editHistoryCount()).isEqualTo(1);
        verify(slipRevisionService, times(1)).restore(
                eq(slip), eq(1), any(UUID.class), eq("관리자"), eq(null));
        verify(slipRepository, times(1)).save(slip);
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

    private Slip preparedOutboundMixed(SlipStatus status, UUID batchProductId) {
        Slip slip = Slip.createOutbound("2026/05/04-1", LocalDate.of(2026, 5, 4), 1,
                sourceWh, destWh, partnerId, "삼한공조", DeliveryTag.DAY, null, "u");
        ReflectionTestUtils.setField(slip, "id", slipId);
        slip.addLine(SlipLine.create(slip, productId, "에어컨", "MODEL-SERIAL", null,
                2, new BigDecimal("500000.00"), null));
        slip.addLine(SlipLine.create(slip, productId, "에어컨", "MODEL-SERIAL", null,
                3, new BigDecimal("500000.00"), null));
        slip.addLine(SlipLine.create(slip, batchProductId, "배관", "PIPE-BATCH", null,
                4, new BigDecimal("10000.00"), null));
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
