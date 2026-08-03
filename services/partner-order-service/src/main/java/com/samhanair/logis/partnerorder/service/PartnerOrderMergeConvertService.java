package com.samhanair.logis.partnerorder.service;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.partnerorder.client.ApprovalLineAuthorizeClient;
import com.samhanair.logis.partnerorder.client.ApprovalLineAuthorizeResult;
import com.samhanair.logis.partnerorder.client.InventoryClient;
import com.samhanair.logis.partnerorder.client.InventoryClient.ReservationResult;
import com.samhanair.logis.partnerorder.client.SlipServiceClient;
import com.samhanair.logis.partnerorder.client.SlipServiceClient.PublishResult;
import com.samhanair.logis.partnerorder.domain.PartnerOrder;
import com.samhanair.logis.partnerorder.domain.PartnerOrderLine;
import com.samhanair.logis.partnerorder.repository.PartnerOrderRepository;
import com.samhanair.logis.partnerorder.realtime.PartnerOrderBoardChangePublisher;
import com.samhanair.logis.partnerorder.util.PartnerOrderIdResolver;
import com.samhanair.logis.partnerorder.web.dto.MergeConvertResultResponse;
import com.samhanair.logis.partnerorder.web.dto.MergeConvertToSlipRequest;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

/**
 * 다중 주문 → 단일 출고전표 병합 전환 서비스 — Phase 2.6b D2.
 *
 * <p>{@link PartnerOrderConvertService}(단일주문) 의 reserve→발행→보상 패턴을 N-주문으로
 * 일반화한다. 기존 단일주문 전환 경로는 무변경(회귀 0).
 *
 * <p><b>처리 순서</b>:
 * <ol>
 *   <li>주문 N건 조회 + 전환 가능 상태 가드({@code requireConvertible}) + 같은 거래처 검증</li>
 *   <li>warehouseCode 검증 + 라인 매핑 + 잔여수량 사전 검증 + payload 라인 빌드</li>
 *   <li>결정적 convertKey(SHA-256) + idempotencyKey({@code PO-MRG-...}) 생성</li>
 *   <li>warehouseCode → warehouseId 역조회 (inventory DB 단일 출처)</li>
 *   <li>전 라인 reserve — 가용 부족 409 → 예약 성공분 release 보상 후 전파(slip 미발행)</li>
 *   <li>slip-service 병합 발행({@code /from-orders-merge}) 호출</li>
 *   <li>slip 발행 실패 → release 보상 → 예외 전파</li>
 *   <li>성공 → 각 주문 라인 {@code line.convert(qty)} 누적 +
 *       {@code markConvertedIfComplete} + {@code saveAll}</li>
 * </ol>
 *
 * <p><b>원자성</b>: partner_order_db 단일 DB 이므로 N개 주문 saveAll 이 단일 {@code @Transactional} 내에서
 * 안전하게 처리된다.
 *
 * <p><b>멱등 no-op 라인</b>: {@code alreadyReserved=true} 라인은 보상 대상에서 제외하여
 * double-release(reservedQty 음수) 를 방지한다.
 */
@Service
@RequiredArgsConstructor
public class PartnerOrderMergeConvertService {

    private static final Logger log = LoggerFactory.getLogger(PartnerOrderMergeConvertService.class);
    private static final DateTimeFormatter IO_DATE_FMT = DateTimeFormatter.ofPattern("yyyyMMdd");
    private static final String APPROVAL_DOCUMENT_TYPE = "PARTNER_ORDER";
    private static final String APPROVAL_ACTION_KEY = "PARTNER_ORDER_CONVERT";
    private static final String APPROVAL_FORBIDDEN_MESSAGE =
            "주문 출고전환 권한이 없습니다 — 승인자 결재자(그룹/개인)만 전환할 수 있습니다";
    /** inventory reserve 참조 유형 — 단일주문({@code PARTNER_ORDER_CONVERT}) 과 구분. */
    private static final String RESERVE_REF_TYPE = "PARTNER_ORDER_MERGE_CONVERT";

    private final PartnerOrderRepository orderRepository;
    private final SlipServiceClient slipServiceClient;
    private final InventoryClient inventoryClient;
    private final ApprovalLineAuthorizeClient approvalLineAuthorizeClient;
    private final PartnerOrderBoardChangePublisher boardChangePublisher;

    /**
     * 여러 주문의 선택 라인을 단일 출고전표로 병합 발행한다 (Phase 2.6b D2).
     *
     * <p>같은 거래처 UUID({@code partnerId}) 주문만 병합 가능. legacy의 NULL UUID는
     * 과거 거래처 정체성을 확인할 수 없으므로 현재 snapshot과 일치하더라도 병합 후보에서 제외한다.
     * 단건 전환 경로는 별도 서비스에서 계속 사용할 수 있다.
     *
     * <p>한 라인이라도 가용 부족(reserve 409) 또는 slip 발행 실패 시 전체 409 + 예약 성공분 release 보상.
     * 성공 시 각 주문 라인 convertedQuantity 누적 + 전량 전환 주문 CONVERTED 상태 갱신.
     *
     * @param req       병합 전환 요청 (주문×라인 목록 + 창고코드 + 병합 헤더).
     *                  각 주문 식별자({@code partnerOrderId})는 주문번호 또는 UUID 모두 허용한다.
     *                  FE 는 UUID 비공개 원칙에 따라 주문번호를 전송한다.
     * @param actorId   처리자 UUID (X-User-Id 헤더, null 허용)
     * @param actorName 처리자명 (X-User-Name 헤더, null 허용)
     * @return 전환 결과 (slipNo + 주문별 orderNo/status/fullyConverted, UUID 미포함)
     * @throws BusinessException(PARTNER_ORDER_NOT_FOUND)           주문 미존재 (주문번호/UUID 모두 불일치)
     * @throws BusinessException(PARTNER_ORDER_UPDATE_INVALID_LINE) 주문 라인 UUID 불일치
     * @throws ResponseStatusException(409)                         거래처 불일치 / 잔여 초과 / 가용 부족 등
     */
    @Transactional
    public MergeConvertResultResponse convertMerge(MergeConvertToSlipRequest req,
                                                    UUID actorId, String actorName) {
        enforceApprovalLine(actorId);

        // 1. warehouseCode 사전 검증 (blank → 즉시 409)
        if (req.warehouseCode() == null || req.warehouseCode().isBlank()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "warehouseCode 는 필수입니다. 창고 코드를 명시적으로 지정하세요.");
        }

        // 2. 주문 N건 조회 + requireConvertible + 같은 거래처 검증
        // PartnerOrderIdResolver 를 통해 주문번호(orderNo) 또는 UUID 모두 허용
        // (UUID 비공개 원칙: FE 는 주문번호를 전송하지만 UUID fallback 도 유지)
        List<PartnerOrder> orders = new ArrayList<>();
        UUID partnerId = null;
        for (MergeConvertToSlipRequest.OrderItems oi : req.orders()) {
            PartnerOrder order = PartnerOrderIdResolver
                    .findByIdentifier(orderRepository, oi.partnerOrderId())
                    .orElseThrow(() -> new BusinessException(ErrorCode.PARTNER_ORDER_NOT_FOUND,
                            ErrorCode.PARTNER_ORDER_NOT_FOUND.getDefaultMessage()));
            order.requireConvertible();
            UUID orderPartnerId = order.getPartnerId();
            if (orderPartnerId == null) {
                throw unresolvedLegacyPartnerConflict();
            }
            if (partnerId == null) {
                partnerId = orderPartnerId;
            } else if (!partnerId.equals(orderPartnerId)) {
                throw new ResponseStatusException(HttpStatus.CONFLICT,
                        "병합은 동일 거래처 정체성의 주문만 가능합니다.");
            }
            orders.add(order);
        }

        // 3. 라인 매핑 + 잔여수량 사전 검증 + payload 라인 빌드
        // 요청 식별자(orderNo 또는 UUID 문자열) → resolve 된 order 인덱스 매핑
        // req.orders() 순서와 orders 리스트 순서가 동일하므로 인덱스로 참조한다.
        List<ReserveTarget> reserveTargets = new ArrayList<>();
        List<Map<String, Object>> payloadLines = new ArrayList<>();

        for (int i = 0; i < req.orders().size(); i++) {
            MergeConvertToSlipRequest.OrderItems oi = req.orders().get(i);
            PartnerOrder order = orders.get(i);
            Map<UUID, PartnerOrderLine> lineMap = order.getLines().stream()
                    .collect(Collectors.toMap(PartnerOrderLine::getId, l -> l));
            for (MergeConvertToSlipRequest.Item item : oi.items()) {
                PartnerOrderLine line = lineMap.get(item.orderLineId());
                if (line == null) {
                    throw new BusinessException(ErrorCode.PARTNER_ORDER_UPDATE_INVALID_LINE,
                            "주문 라인을 찾을 수 없습니다: " + item.orderLineId());
                }
                if (item.quantity() <= 0) {
                    throw new ResponseStatusException(HttpStatus.CONFLICT,
                            "전환 수량은 1 이상이어야 합니다.");
                }
                if (item.quantity() > line.remainingQuantity()) {
                    throw new ResponseStatusException(HttpStatus.CONFLICT,
                            "전환 수량이 잔여 수량을 초과합니다. 잔여="
                                    + line.remainingQuantity() + ", 요청=" + item.quantity());
                }
                reserveTargets.add(new ReserveTarget(order, line, item.quantity()));

                Map<String, Object> lp = new LinkedHashMap<>();
                lp.put("productCode", line.getModelName());
                lp.put("productName", line.getProductName());
                lp.put("qty", String.valueOf(item.quantity()));
                lp.put("unitPriceVat", line.getPriceVat());
                lp.put("remarks", line.getRemark());
                lp.put("sourceOrderLineId", line.getId().toString());
                lp.put("categoryKey", line.getCategoryKey());
                payloadLines.add(lp);
            }
        }

        MergeConvertToSlipRequest.ShippingInfo shippingInfo = req.shippingInfo();
        String deliveryAddress = resolveDeliveryAddress(orders, shippingInfo);

        // 4. 결정적 idempotencyKey / convertKey (SHA-256 기반)
        String idempotencyKey = buildIdempotencyKey(reserveTargets);
        UUID convertKeyUuid = buildConvertKeyUuid(reserveTargets);

        // 5. warehouseCode → warehouseId 역조회
        UUID warehouseId = inventoryClient.resolveWarehouseIdByCode(req.warehouseCode());

        // 6. 전 라인 reserve (가용 부족 409 → 보상 후 중단)
        // 멱등 no-op(alreadyReserved=true) 라인은 reservedActual 에 추가하지 않는다
        // → double-release(reservedQty 음수) 방지.
        List<ReserveTarget> reservedActual = new ArrayList<>();
        try {
            for (ReserveTarget t : reserveTargets) {
                ReservationResult r = inventoryClient.reserve(
                        t.line().getProductId(), warehouseId, t.quantity(),
                        RESERVE_REF_TYPE, convertKeyUuid);
                if (!r.alreadyReserved()) {
                    reservedActual.add(t);
                }
            }
        } catch (BusinessException ex) {
            compensate(reservedActual, warehouseId, convertKeyUuid);
            throw ex;
        }

        // 7. slip-service 병합 발행
        Map<String, Object> payload = new LinkedHashMap<>();
        String partnerCode = orders.isEmpty() ? null : orders.get(0).getPartnerCode();
        String bizCode = orders.isEmpty() ? null : orders.get(0).getBizCode();
        payload.put("sourceOrders", orders.stream()
                .map(o -> Map.of("partnerOrderId", o.getId().toString(),
                        "orderNo", o.getOrderNo()))
                .toList());
        payload.put("partnerId", partnerId);
        payload.put("partnerCode", partnerCode);
        payload.put("bizCode", bizCode);
        payload.put("partnerName", shippingInfo != null ? shippingInfo.partnerName() : null);
        payload.put("warehouseCode", req.warehouseCode());
        payload.put("warehouseId", warehouseId.toString());
        payload.put("ioDate", LocalDate.now().format(IO_DATE_FMT));
        payload.put("shippingAddress", shippingInfo != null ? shippingInfo.shippingAddress() : null);
        payload.put("deliveryAddress", deliveryAddress);
        payload.put("receiverPhone", shippingInfo != null ? shippingInfo.receiverPhone() : null);
        payload.put("paymentDueLabel", shippingInfo != null ? shippingInfo.paymentDueLabel() : null);
        payload.put("discountInfo", shippingInfo != null ? shippingInfo.discountInfo() : null);
        payload.put("memo", shippingInfo != null ? shippingInfo.memo() : null);
        payload.put("lines", payloadLines);

        PublishResult result;
        try {
            result = slipServiceClient.publishFromOrdersMerge(payload, idempotencyKey);
        } catch (BusinessException ex) {
            log.warn("slip 병합 발행 실패 → 재고 예약 release 보상 (idemKey={}): {}",
                    idempotencyKey, ex.getMessage());
            compensate(reservedActual, warehouseId, convertKeyUuid);
            throw ex;
        }

        // 8. converted 누적 + status 갱신 + saveAll
        //
        // [멱등 설계 의도] 성공 PublishResult 수신 후에는 line.convert() + saveAll 을 무조건 수행한다.
        // 근거:
        //   - convertKey(SHA-256)에는 각 라인의 convertedBefore(스냅샷) 이 포함된다.
        //   - slip-service 200 replay 는 같은 convertKey + 같은 본문으로
        //     직전 요청이 실제로 slip 을 발행했으나, 그 직후 partner-order-service 트랜잭션이
        //     커밋되지 못한(네트워크/프로세스 장애) 상황이다.
        //   - 따라서 성공 응답은 "직전 미커밋 전환을 재적용해야 한다"는 신호이다.
        //   - PartnerOrder 에 낙관적 락(lock_version, @Version)이 적용되어 있으므로
        //     동시성 이중 누적은 별도 트랜잭션에서 감지·차단된다.
        for (ReserveTarget t : reserveTargets) {
            t.line().convert(t.quantity());
        }
        List<MergeConvertResultResponse.OrderResult> results = new ArrayList<>();
        for (PartnerOrder order : orders) {
            order.markConvertedIfComplete();
            // UUID 비공개 원칙: 응답에는 사용자 표시용 주문번호(orderNo)만 반환한다.
            results.add(new MergeConvertResultResponse.OrderResult(
                    order.getOrderNo(),
                    order.getStatus().name(),
                    order.getLines().stream().allMatch(PartnerOrderLine::isFullyConverted)));
        }
        orderRepository.saveAll(orders);
        publishListChanged();

        log.info("[D2] 병합 전환 완료 — {}개 주문 → slip {} (idemKey={})",
                orders.size(), result.slipNo(), idempotencyKey);
        return new MergeConvertResultResponse(result.slipNo(), results);
    }

    /** 병합 대상의 구조화 배송주소를 단일 정본으로 해소한다. */
    private String resolveDeliveryAddress(List<PartnerOrder> orders,
                                          MergeConvertToSlipRequest.ShippingInfo shippingInfo) {
        String explicit = trimToNull(shippingInfo == null ? null : shippingInfo.deliveryAddress());
        if (explicit != null) {
            return explicit;
        }
        List<String> addresses = orders.stream()
                .map(PartnerOrder::getDeliveryAddress)
                .map(this::trimToNull)
                .filter(java.util.Objects::nonNull)
                .distinct()
                .toList();
        if (addresses.size() <= 1) {
            return addresses.isEmpty() ? null : addresses.get(0);
        }
        throw new BusinessException(ErrorCode.INVALID_INPUT,
                "병합 대상 주문의 배송주소가 서로 다릅니다. 구조화된 deliveryAddress를 선택해 주세요.");
    }

    private String trimToNull(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        return value.trim();
    }

    private ResponseStatusException unresolvedLegacyPartnerConflict() {
        return new ResponseStatusException(HttpStatus.CONFLICT,
                "거래처 정체성이 확인되지 않은 기존 주문은 병합할 수 없습니다. "
                        + "거래처 재조정 후 다시 시도해 주세요.");
    }

    private void publishListChanged() {
        if (boardChangePublisher != null) {
            boardChangePublisher.publishListChanged("UPDATED");
        }
    }

    private void enforceApprovalLine(UUID actorId) {
        if (!isRealUser(actorId)) {
            return;
        }
        ApprovalLineAuthorizeResult result = approvalLineAuthorizeClient.authorize(
                APPROVAL_DOCUMENT_TYPE, APPROVAL_ACTION_KEY, actorId);
        if (result.configured() && !result.allowed()) {
            throw new BusinessException(ErrorCode.FORBIDDEN, APPROVAL_FORBIDDEN_MESSAGE);
        }
    }

    private boolean isRealUser(UUID actorId) {
        return actorId != null;
    }

    /**
     * 예약 성공 라인들의 release 보상 — slip 발행 실패 또는 reserve 가용 부족 전체 중단 시 호출.
     *
     * <p>release 실패는 alert 로그만 처리하며, 운영자 수동 복구 대상이다.
     * 멱등 no-op 라인({@code alreadyReserved=true}) 은 입력 {@code reserved} 에서 제외되어 있으므로
     * double-release 발생하지 않는다.
     *
     * @param reserved        예약 성공 라인 목록 (no-op 제외)
     * @param warehouseId     창고 UUID
     * @param convertKeyUuid  convert 키 UUID (release referenceId)
     */
    private void compensate(List<ReserveTarget> reserved, UUID warehouseId, UUID convertKeyUuid) {
        for (ReserveTarget t : reserved) {
            try {
                inventoryClient.release(t.line().getProductId(), warehouseId, t.quantity(),
                        RESERVE_REF_TYPE, convertKeyUuid);
            } catch (Exception ex) {
                log.error("재고 release 보상 실패 (수동 복구 필요) — productId={}, qty={}: {}",
                        t.line().getProductId(), t.quantity(), ex.getMessage());
            }
        }
    }

    /**
     * 결정적 idempotencyKey 생성 — {@code PO-MRG-{SHA-256[:16]}}.
     *
     * <p>전 주문 라인의 orderId:lineId:convertedBefore:qty 를 lineId 기준 정렬하여 SHA-256 계산.
     * convertedBefore 스냅샷 포함 → 부분 전환 후 재요청 시 다른 키 생성(이중 누적 차단).
     *
     * @param targets reserve 대상 라인 목록
     * @return "PO-MRG-{hash 앞 16자}" 형식 키
     */
    private String buildIdempotencyKey(List<ReserveTarget> targets) {
        return "PO-MRG-" + sha256hex(contentHash(targets)).substring(0, 16);
    }

    /**
     * convertKey → UUID 변환 — inventory reserve referenceId 로 사용.
     *
     * <p>idempotencyKey 의 SHA-256 해시 앞 32자를 UUID 형식으로 변환한다.
     *
     * @param targets reserve 대상 라인 목록
     * @return 결정적 UUID
     */
    private UUID buildConvertKeyUuid(List<ReserveTarget> targets) {
        String h = sha256hex(contentHash(targets));
        String uuidStr = h.substring(0, 8) + "-"
                + h.substring(8, 12) + "-"
                + h.substring(12, 16) + "-"
                + h.substring(16, 20) + "-"
                + h.substring(20, 32);
        return UUID.fromString(uuidStr);
    }

    /**
     * SHA-256 입력용 정렬된 콘텐츠 해시 문자열.
     *
     * <p>lineId 기준 정렬하여 요청 순서와 무관하게 동일한 병합이면 동일한 해시를 생성한다.
     */
    private String contentHash(List<ReserveTarget> targets) {
        return targets.stream()
                .sorted(Comparator.comparing(t -> t.line().getId().toString()))
                .map(t -> t.order().getId() + ":" + t.line().getId() + ":"
                        + t.line().getConvertedQuantity() + ":" + t.quantity())
                .collect(Collectors.joining(","));
    }

    private static String sha256hex(String raw) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            byte[] digest = md.digest(raw.getBytes(java.nio.charset.StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder();
            for (byte b : digest) {
                sb.append(String.format("%02x", b));
            }
            return sb.toString();
        } catch (NoSuchAlgorithmException ex) {
            throw new IllegalStateException("SHA-256 unavailable", ex);
        }
    }

    /** reserve 대상 라인 추적 레코드 (보상 트랜잭션용). */
    private record ReserveTarget(PartnerOrder order, PartnerOrderLine line, int quantity) {}
}
