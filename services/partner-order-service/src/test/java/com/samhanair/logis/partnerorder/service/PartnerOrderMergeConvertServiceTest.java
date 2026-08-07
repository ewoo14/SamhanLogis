package com.samhanair.logis.partnerorder.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.partnerorder.client.InventoryClient;
import com.samhanair.logis.partnerorder.client.InventoryClient.ReservationResult;
import com.samhanair.logis.partnerorder.client.SlipServiceClient;
import com.samhanair.logis.partnerorder.client.SlipServiceClient.PublishResult;
import com.samhanair.logis.partnerorder.domain.PartnerOrder;
import com.samhanair.logis.partnerorder.domain.PartnerOrderLine;
import com.samhanair.logis.partnerorder.repository.PartnerOrderRepository;
import com.samhanair.logis.partnerorder.realtime.PartnerOrderAuthorityEventPublisher;
import com.samhanair.logis.partnerorder.web.dto.MergeConvertResultResponse;
import com.samhanair.logis.partnerorder.web.dto.MergeConvertToSlipRequest;
import java.lang.reflect.Field;
import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.web.server.ResponseStatusException;

/**
 * {@link PartnerOrderMergeConvertService} 단위 테스트 — Phase 2.6b D2.
 *
 * <p>Mockito 기반. 실 DB 없이 도메인 검증 중심.
 *
 * <p>검증 케이스:
 * <ol>
 *   <li>서로 다른 거래처 주문 병합 → 409 CONFLICT, reserve/publish 미호출</li>
 *   <li>존재하지 않는 주문 식별자 → PARTNER_ORDER_NOT_FOUND</li>
 *   <li>warehouseCode 미전송 → 409 CONFLICT</li>
 *   <li>잔여 초과 수량 → 409 CONFLICT</li>
 *   <li>같은 거래처 2주문 정상 병합 (UUID 식별자 전달) → slipNo 반환 + publishFromOrdersMerge 호출 1회</li>
 *   <li>payload sourceOrders 키 + lines 키 정합 단언</li>
 *   <li>orderNo(주문번호) 식별자로 병합 정상 동작 → slipNo + 응답 orderNo 필드 단언</li>
 *   <li>응답 convertedOrders 필드 — orderNo/orderStatus/fullyConverted 단언 (UUID 미포함)</li>
 * </ol>
 */
@ExtendWith(MockitoExtension.class)
class PartnerOrderMergeConvertServiceTest {

    @Mock private PartnerOrderRepository orderRepository;
    @Mock private SlipServiceClient slipServiceClient;
    @Mock private InventoryClient inventoryClient;
    @Mock private PartnerOrderPartnerIdentityResolver partnerIdentityResolver;
    @Mock private PartnerOrderAuthorityEventPublisher authorityEventPublisher;

    @InjectMocks private PartnerOrderMergeConvertService service;

    private static final String STUB_SLIP_NO = "2026/05/31-MRG-1";
    private static final UUID WAREHOUSE_ID = UUID.fromString("00000000-0000-0000-0000-000000000001");
    private static final UUID DEFAULT_PARTNER_ID = UUID.fromString("00000000-0000-0000-0000-000000000101");
    private static final UUID DIFFERENT_PARTNER_ID = UUID.fromString("00000000-0000-0000-0000-000000000102");

    @BeforeEach
    void setUp() {
        // inventoryClient 기본 lenient stub
        lenient().when(inventoryClient.resolveWarehouseIdByCode(anyString()))
                .thenReturn(WAREHOUSE_ID);
        lenient().when(inventoryClient.reserve(
                any(UUID.class), any(UUID.class), anyInt(),
                anyString(), any(UUID.class)))
                .thenReturn(ReservationResult.reserved());
        lenient().doNothing().when(inventoryClient)
                .release(any(UUID.class), any(UUID.class), anyInt(),
                        anyString(), any(UUID.class));

        // slipServiceClient 기본 lenient stub
        lenient().when(slipServiceClient.publishFromOrdersMerge(any(), anyString()))
                .thenReturn(PublishResult.published(STUB_SLIP_NO));
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // 케이스 1 — 서로 다른 거래처 주문 병합 → 409 CONFLICT
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * 거래처 A 주문 + 거래처 B 주문을 병합 시도 → 409 CONFLICT.
     * reserve / publishFromOrdersMerge 미호출 단언.
     * 식별자는 UUID 문자열로 전달 (resolver fallback 경로 검증).
     */
    @Test
    @DisplayName("케이스1: 서로 다른 거래처 주문 병합 → 409 CONFLICT + reserve/publish 미호출")
    void case1_differentPartnerCodes_throws409_andNoExternalCalls() throws Exception {
        UUID orderAId = UUID.randomUUID();
        UUID orderBId = UUID.randomUUID();
        UUID lineAId = UUID.randomUUID();
        UUID lineBId = UUID.randomUUID();

        PartnerOrder orderA = buildOrder(orderAId, "P001", lineAId, 5,
                "2026/05/31-" + orderAId.toString().substring(0, 8));
        PartnerOrder orderB = buildOrder(orderBId, "P002", lineBId, 5,
                "2026/05/31-" + orderBId.toString().substring(0, 8));
        setField(orderB, "partnerId", DIFFERENT_PARTNER_ID);

        // resolver: UUID fallback 경로 (findByOrderNo miss → findById 성공)
        when(orderRepository.findByOrderNo(anyString())).thenReturn(Optional.empty());
        when(orderRepository.findById(orderAId)).thenReturn(Optional.of(orderA));
        when(orderRepository.findById(orderBId)).thenReturn(Optional.of(orderB));

        MergeConvertToSlipRequest req = new MergeConvertToSlipRequest(
                List.of(
                        new MergeConvertToSlipRequest.OrderItems(orderAId.toString(),
                                List.of(new MergeConvertToSlipRequest.Item(lineAId, 2))),
                        new MergeConvertToSlipRequest.OrderItems(orderBId.toString(),
                                List.of(new MergeConvertToSlipRequest.Item(lineBId, 2)))
                ),
                "WH-001",
                null);

        assertThatThrownBy(() -> service.convertMerge(req, null, null))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(e -> {
                    ResponseStatusException rse = (ResponseStatusException) e;
                    assertThat(rse.getStatusCode().value()).isEqualTo(409);
                    assertThat(rse.getReason()).contains("거래처");
                });

        // reserve / publishFromOrdersMerge 미호출
        verifyNoInteractions(slipServiceClient);
        verify(inventoryClient, never()).reserve(
                any(), any(), anyInt(), anyString(), any());
    }

    @Test
    @DisplayName("케이스1b: legacy 주문은 현재 스냅샷 일치만으로 병합하지 않는다")
    void legacyOrderWithExactPartnerSnapshot_isExcludedFromMerge() throws Exception {
        UUID orderId = UUID.randomUUID();
        UUID lineId = UUID.randomUUID();
        String partnerCode = "P-LEGACY-EXACT";
        String bizCode = "1234567890";
        String orderNo = "2026/07/23-LEGACY-EXACT";
        PartnerOrder legacyOrder = buildOrder(orderId, partnerCode, lineId, 5, orderNo);
        setField(legacyOrder, "partnerId", null);

        when(orderRepository.findByOrderNo(orderNo)).thenReturn(Optional.of(legacyOrder));

        MergeConvertToSlipRequest req = new MergeConvertToSlipRequest(
                List.of(new MergeConvertToSlipRequest.OrderItems(orderNo,
                        List.of(new MergeConvertToSlipRequest.Item(lineId, 2)))),
                "WH-001", null);

        assertThatThrownBy(() -> service.convertMerge(req, null, null))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(e -> {
                    ResponseStatusException rse = (ResponseStatusException) e;
                    assertThat(rse.getStatusCode().value()).isEqualTo(409);
                    assertThat(rse.getReason()).contains("기존 주문");
                });
        verifyNoInteractions(partnerIdentityResolver);
        verifyNoInteractions(slipServiceClient);
        verify(inventoryClient, never()).reserve(any(), any(), anyInt(), anyString(), any());
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // 케이스 2 — 존재하지 않는 주문 식별자
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * 존재하지 않는 주문번호/UUID 요청 → PARTNER_ORDER_NOT_FOUND BusinessException.
     * resolver 가 orderNo/UUID 모두 miss 시 예외 발생.
     */
    @Test
    @DisplayName("케이스2: 존재하지 않는 주문번호 → PARTNER_ORDER_NOT_FOUND")
    void case2_nonExistentOrder_throwsNotFound() {
        String missingOrderNo = "2026/05/31-NONE-9999";
        UUID lineId = UUID.randomUUID();

        // findByOrderNo, findByOrderNo(slashVariant), findById(UUID parse 실패) 모두 empty
        when(orderRepository.findByOrderNo(anyString())).thenReturn(Optional.empty());

        MergeConvertToSlipRequest req = new MergeConvertToSlipRequest(
                List.of(new MergeConvertToSlipRequest.OrderItems(missingOrderNo,
                        List.of(new MergeConvertToSlipRequest.Item(lineId, 1)))),
                "WH-001",
                null);

        assertThatThrownBy(() -> service.convertMerge(req, null, null))
                .isInstanceOf(BusinessException.class)
                .satisfies(e -> {
                    BusinessException be = (BusinessException) e;
                    assertThat(be.getErrorCode()).isEqualTo(ErrorCode.PARTNER_ORDER_NOT_FOUND);
                });
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // 케이스 3 — warehouseCode 미전송 → 409
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * warehouseCode 미전송(null) → 409 CONFLICT.
     * warehouseCode 체크는 주문 조회 전에 발생하므로 repository stub 불필요.
     */
    @Test
    @DisplayName("케이스3: warehouseCode null → 409 CONFLICT")
    void case3_warehouseCodeNull_throws409() {
        MergeConvertToSlipRequest req = new MergeConvertToSlipRequest(
                List.of(new MergeConvertToSlipRequest.OrderItems("2026/05/31-TEST-1",
                        List.of(new MergeConvertToSlipRequest.Item(UUID.randomUUID(), 1)))),
                null,  // warehouseCode 미전송
                null);

        assertThatThrownBy(() -> service.convertMerge(req, null, null))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(e -> assertThat(
                        ((ResponseStatusException) e).getStatusCode().value()).isEqualTo(409));
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // 케이스 4 — 잔여 초과 수량 → 409
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * 잔여 수량(5) 초과하는 전환 요청(6) → 409 CONFLICT.
     */
    @Test
    @DisplayName("케이스4: 잔여 초과 수량 → 409 CONFLICT")
    void case4_overRemainingQuantity_throws409() {
        UUID orderId = UUID.randomUUID();
        UUID lineId = UUID.randomUUID();
        String orderNo = "2026/05/31-CASE4-1";
        PartnerOrder order = buildOrder(orderId, "P001", lineId, 5, orderNo);
        when(orderRepository.findByOrderNo(orderNo)).thenReturn(Optional.of(order));

        MergeConvertToSlipRequest req = new MergeConvertToSlipRequest(
                List.of(new MergeConvertToSlipRequest.OrderItems(orderNo,
                        List.of(new MergeConvertToSlipRequest.Item(lineId, 6)))), // 초과
                "WH-001",
                null);

        assertThatThrownBy(() -> service.convertMerge(req, null, null))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(e -> assertThat(
                        ((ResponseStatusException) e).getStatusCode().value()).isEqualTo(409));

        verifyNoInteractions(slipServiceClient);
        verify(inventoryClient, never()).reserve(any(), any(), anyInt(), anyString(), any());
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // 케이스 5 — 같은 거래처 2주문 정상 병합 (UUID 문자열 전달)
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * 같은 거래처(P001) 2주문 정상 병합.
     * 식별자로 UUID 문자열 전달 → resolver UUID fallback 경로.
     * slipNo 반환 + publishFromOrdersMerge 1회 호출.
     */
    @Test
    @DisplayName("케이스5: 같은 거래처 2주문 정상 병합(UUID 식별자) → slipNo + publishFromOrdersMerge 1회")
    void case5_samePartner_twoOrders_uuidIdentifier_successfulMerge() {
        UUID orderAId = UUID.randomUUID();
        UUID orderBId = UUID.randomUUID();
        UUID lineAId = UUID.randomUUID();
        UUID lineBId = UUID.randomUUID();

        PartnerOrder orderA = buildOrder(orderAId, "P001", lineAId, 5,
                "2026/05/31-" + orderAId.toString().substring(0, 8));
        PartnerOrder orderB = buildOrder(orderBId, "P001", lineBId, 3,
                "2026/05/31-" + orderBId.toString().substring(0, 8));

        // findByOrderNo → empty (UUID 형태 문자열은 orderNo 에 없음), findById → 성공
        when(orderRepository.findByOrderNo(anyString())).thenReturn(Optional.empty());
        when(orderRepository.findById(orderAId)).thenReturn(Optional.of(orderA));
        when(orderRepository.findById(orderBId)).thenReturn(Optional.of(orderB));

        MergeConvertToSlipRequest req = new MergeConvertToSlipRequest(
                List.of(
                        new MergeConvertToSlipRequest.OrderItems(orderAId.toString(),
                                List.of(new MergeConvertToSlipRequest.Item(lineAId, 3))),
                        new MergeConvertToSlipRequest.OrderItems(orderBId.toString(),
                                List.of(new MergeConvertToSlipRequest.Item(lineBId, 2)))
                ),
                "WH-001",
                new MergeConvertToSlipRequest.ShippingInfo("거래처A", "서울시", null, null, null, null));

        MergeConvertResultResponse result = service.convertMerge(req, null, null);

        assertThat(result.slipNo()).isEqualTo(STUB_SLIP_NO);
        assertThat(result.convertedOrders()).hasSize(2);

        // publishFromOrdersMerge 1회 호출 단언
        verify(slipServiceClient, times(1)).publishFromOrdersMerge(any(), anyString());
        verify(authorityEventPublisher, times(1)).publish(eq(orderAId), eq("CONVERT"), eq(null));
        verify(authorityEventPublisher, times(1)).publish(eq(orderBId), eq("CONVERT"), eq(null));
        // reserve 2회 (각 라인 1번씩)
        verify(inventoryClient, times(2)).reserve(any(), any(), anyInt(), anyString(), any());
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // 케이스 6 — payload sourceOrders + lines 키 정합 단언
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * publishFromOrdersMerge 에 전달된 payload 의 {@code sourceOrders} / {@code lines} 키 정합 단언.
     *
     * <p>slip-service {@code PublishFromOrdersMergeRequest} 계약:
     * sourceOrders = [{partnerOrderId, orderNo}], lines = [{productCode, qty, sourceOrderLineId, ...}]
     */
    @Test
    @DisplayName("케이스6: payload sourceOrders + lines 키 정합")
    @SuppressWarnings("unchecked")
    void case6_payloadKeyContract() {
        UUID orderId = UUID.randomUUID();
        UUID lineId = UUID.randomUUID();
        String orderNo = "2026/05/31-CASE6-1";
        PartnerOrder order = buildOrder(orderId, "P001", lineId, 5, orderNo);

        when(orderRepository.findByOrderNo(orderNo)).thenReturn(Optional.of(order));

        MergeConvertToSlipRequest req = new MergeConvertToSlipRequest(
                List.of(new MergeConvertToSlipRequest.OrderItems(orderNo,
                        List.of(new MergeConvertToSlipRequest.Item(lineId, 2)))),
                "WH-001",
                null);

        service.convertMerge(req, null, null);

        ArgumentCaptor<java.util.Map<String, Object>> payloadCaptor =
                ArgumentCaptor.forClass(java.util.Map.class);
        ArgumentCaptor<String> keyCaptor = ArgumentCaptor.forClass(String.class);
        verify(slipServiceClient).publishFromOrdersMerge(payloadCaptor.capture(), keyCaptor.capture());

        java.util.Map<String, Object> payload = payloadCaptor.getValue();

        assertThat(payload.get("partnerId")).isEqualTo(DEFAULT_PARTNER_ID);

        // sourceOrders 키 존재 + partnerOrderId/orderNo 포함
        assertThat(payload).containsKey("sourceOrders");
        List<java.util.Map<String, Object>> sourceOrders =
                (List<java.util.Map<String, Object>>) payload.get("sourceOrders");
        assertThat(sourceOrders).hasSize(1);
        assertThat(sourceOrders.get(0)).containsKeys("partnerOrderId", "orderNo");

        // lines 키 존재 + sourceOrderLineId / productCode / qty 포함
        assertThat(payload).containsKey("lines");
        List<java.util.Map<String, Object>> lines =
                (List<java.util.Map<String, Object>>) payload.get("lines");
        assertThat(lines).hasSize(1);
        assertThat(lines.get(0)).containsKeys("sourceOrderLineId", "productCode", "qty");
        assertThat(lines.get(0).get("sourceOrderLineId").toString())
                .isEqualTo(lineId.toString());

        // idempotencyKey PO-MRG- prefix
        assertThat(keyCaptor.getValue()).startsWith("PO-MRG-");
    }

    @Test
    @DisplayName("주소 보강: 병합 전환은 주문 snapshot의 단일 구조화 배송주소를 전달")
    @SuppressWarnings("unchecked")
    void structuredDeliveryAddress_fromSingleSourceOrder_isCopiedToPayload() throws Exception {
        UUID orderId = UUID.randomUUID();
        UUID lineId = UUID.randomUUID();
        String orderNo = "2026/05/31-ADDRESS-1";
        PartnerOrder order = buildOrder(orderId, "P001", lineId, 5, orderNo);
        setField(order, "deliveryAddress", "서울시 금천구 병합로 3");
        when(orderRepository.findByOrderNo(orderNo)).thenReturn(Optional.of(order));

        MergeConvertToSlipRequest req = new MergeConvertToSlipRequest(
                List.of(new MergeConvertToSlipRequest.OrderItems(orderNo,
                        List.of(new MergeConvertToSlipRequest.Item(lineId, 2)))),
                "WH-001", null);

        service.convertMerge(req, null, null);

        ArgumentCaptor<java.util.Map<String, Object>> payloadCaptor =
                ArgumentCaptor.forClass(java.util.Map.class);
        verify(slipServiceClient).publishFromOrdersMerge(payloadCaptor.capture(), anyString());
        assertThat(payloadCaptor.getValue().get("deliveryAddress"))
                .isEqualTo("서울시 금천구 병합로 3");
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // 케이스 7 — orderNo(주문번호) 식별자로 병합 → slipNo + 응답 orderNo 단언
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * FE 실제 전송 패턴: orderNo(주문번호 문자열) 를 식별자로 전달.
     * resolver 의 {@code findByOrderNo} 경로가 hit 하여 주문을 찾고
     * 응답 {@code convertedOrders[].orderNo} 가 주문번호를 반환하는지 단언.
     * UUID 는 응답에 포함되지 않는다.
     */
    @Test
    @DisplayName("케이스7: orderNo 식별자 전달 → resolver findByOrderNo 경로 + 응답 orderNo 단언")
    void case7_orderNoIdentifier_resolverHit_responseOrderNoAsserted() {
        UUID orderId = UUID.randomUUID();
        UUID lineId = UUID.randomUUID();
        String orderNo = "2026/05/31-7";
        PartnerOrder order = buildOrder(orderId, "P001", lineId, 5, orderNo);

        // findByOrderNo 가 직접 hit
        when(orderRepository.findByOrderNo(orderNo)).thenReturn(Optional.of(order));

        MergeConvertToSlipRequest req = new MergeConvertToSlipRequest(
                List.of(new MergeConvertToSlipRequest.OrderItems(orderNo,
                        List.of(new MergeConvertToSlipRequest.Item(lineId, 3)))),
                "WH-001",
                null);

        MergeConvertResultResponse result = service.convertMerge(req, null, null);

        assertThat(result.slipNo()).isEqualTo(STUB_SLIP_NO);
        assertThat(result.convertedOrders()).hasSize(1);

        MergeConvertResultResponse.OrderResult orderResult = result.convertedOrders().get(0);
        // UUID 비공개: 응답 orderNo 필드는 주문번호
        assertThat(orderResult.orderNo()).isEqualTo(orderNo);
        assertThat(orderResult.orderStatus()).isNotBlank();
        // fullyConverted: 3/5 → false
        assertThat(orderResult.fullyConverted()).isFalse();
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // 케이스 8 — 응답 convertedOrders UUID 비포함 + 전량 전환 시 fullyConverted=true
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * 전량 전환(5/5) 시 응답 {@code fullyConverted=true} + {@code orderStatus=CONVERTED}.
     * 응답 필드에 UUID 가 포함되지 않는지 단언.
     */
    @Test
    @DisplayName("케이스8: 전량 전환 시 fullyConverted=true + orderStatus=CONVERTED + UUID 미포함")
    void case8_fullConvert_fullyConvertedTrue_statusConverted_noUuid() {
        UUID orderId = UUID.randomUUID();
        UUID lineId = UUID.randomUUID();
        String orderNo = "2026/05/31-8";
        PartnerOrder order = buildOrder(orderId, "P001", lineId, 5, orderNo);

        when(orderRepository.findByOrderNo(orderNo)).thenReturn(Optional.of(order));

        MergeConvertToSlipRequest req = new MergeConvertToSlipRequest(
                List.of(new MergeConvertToSlipRequest.OrderItems(orderNo,
                        List.of(new MergeConvertToSlipRequest.Item(lineId, 5)))),
                "WH-001",
                null);

        MergeConvertResultResponse result = service.convertMerge(req, null, null);

        assertThat(result.convertedOrders()).hasSize(1);
        MergeConvertResultResponse.OrderResult orderResult = result.convertedOrders().get(0);

        // 전량 전환 → fullyConverted=true, status=CONVERTED
        assertThat(orderResult.fullyConverted()).isTrue();
        assertThat(orderResult.orderStatus()).isEqualTo("CONVERTED");

        // orderNo 필드 = 주문번호, UUID 형식이 아님
        assertThat(orderResult.orderNo()).isEqualTo(orderNo);
        // UUID 형식 패턴이 아닌지 확인 (hhhhhhhh-hhhh-hhhh-hhhh-hhhhhhhhhhhh 아님)
        assertThat(orderResult.orderNo())
                .doesNotMatch("[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}");
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // 헬퍼
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * 테스트용 DRAFT 주문 생성 (reflection 으로 id/status/lines 설정).
     *
     * <p>도메인 생성자 제약상 필드 직접 주입. 테스트 전용 유틸.
     */
    @SuppressWarnings("unchecked")
    private PartnerOrder buildOrder(UUID orderId, String partnerCode,
                                    UUID lineId, int lineQuantity,
                                    String orderNo) {
        try {
            // PartnerOrder 생성 (createFromConfirm 사용 — DRAFT + NOT_REQUIRED)
            PartnerOrder order = PartnerOrder.createFromConfirm(
                    partnerCode, "1234567890",
                    orderNo,
                    "idem-test-" + orderId,
                    BigDecimal.ZERO);

            // id 필드 주입 (BaseEntity 상속)
            setField(order, "id", orderId);

            // orderNo 를 고정값으로 설정
            setField(order, "orderNo", orderNo);
            // 병합 정체성은 표시 코드와 분리된 내부 UUID로 고정
            setField(order, "partnerId", DEFAULT_PARTNER_ID);

            // 라인 생성 + 주입
            PartnerOrderLine line = PartnerOrderLine.create(
                    UUID.randomUUID(), "MODEL-X", "상품X", "homemulti",
                    lineQuantity, BigDecimal.valueOf(10000), null);
            setField(line, "id", lineId);
            setField(line, "partnerOrder", order);

            // lines 필드 직접 주입 (getLines() 는 filter 없이 내부 필드를 반환)
            Field linesField = PartnerOrder.class.getDeclaredField("lines");
            linesField.setAccessible(true);
            ((java.util.List<PartnerOrderLine>) linesField.get(order)).add(line);

            return order;
        } catch (Exception ex) {
            throw new RuntimeException("테스트 픽스처 생성 실패", ex);
        }
    }

    private void setField(Object target, String fieldName, Object value) throws Exception {
        Class<?> clazz = target.getClass();
        while (clazz != null) {
            try {
                Field f = clazz.getDeclaredField(fieldName);
                f.setAccessible(true);
                f.set(target, value);
                return;
            } catch (NoSuchFieldException e) {
                clazz = clazz.getSuperclass();
            }
        }
        throw new NoSuchFieldException(fieldName + " not found in " + target.getClass());
    }
}
