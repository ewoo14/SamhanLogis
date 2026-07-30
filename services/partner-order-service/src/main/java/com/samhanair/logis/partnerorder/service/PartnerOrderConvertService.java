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
import com.samhanair.logis.partnerorder.web.dto.ConvertResultResponse;
import com.samhanair.logis.partnerorder.web.dto.ConvertToSlipRequest;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 주문→출고전표 부분전환 서비스 — Phase 2.6c (reserve 예약 모델).
 *
 * <p><b>도메인 모델 (2026-05-31 개발책임자 확정)</b>:
 * <ul>
 *   <li>주문서 = 재고 무영향 (confirm 포함)</li>
 *   <li>출고전표로 전환(convert) = 재고 예약(reserve). 실재고 차감(deduct) 아님.</li>
 *   <li>가용 부족 시 전환 409 사전차단 (slip 미발행)</li>
 *   <li>slip 발행 실패 시 예약 release 보상 후 예외 전파</li>
 * </ul>
 *
 * <p><b>트랜잭션 경계 설계</b>:
 * <ol>
 *   <li>검증 단계 — requireConvertible + warehouseCode + 라인 잔여수량 사전검증</li>
 *   <li>warehouseCode → warehouseId 변환 (InventoryClient.resolveWarehouseIdByCode)</li>
 *   <li>라인별 재고 예약 — referenceType=PARTNER_ORDER_CONVERT, referenceId=convertKey(UUID).<br>
 *       가용 부족 409 → 전체 중단(slip 미발행 = 사전차단). 예약 성공 라인 추적.</li>
 *   <li>slip-service 발행 — publishFromPartnerOrder(payload, idempotencyKey)</li>
 *   <li>slip 발행 실패 시 예약 release 보상 → 예외 전파</li>
 *   <li>발행 성공 → line.convert 누적 + markConvertedIfComplete + saveAndFlush</li>
 * </ol>
 *
 * <p><b>idempotencyKey</b>: {@code PO-CONV-{orderId}-{SHA-256[:16]}} — convertKey 를
 * inventory reserve referenceId + slip Idempotency-Key 양쪽에 사용하여 재시도 시
 * reserve no-op + slip 멱등 동작이 동시에 보장된다.
 */
@Service
@RequiredArgsConstructor
public class PartnerOrderConvertService {

    private static final Logger log = LoggerFactory.getLogger(PartnerOrderConvertService.class);
    private static final DateTimeFormatter IO_DATE_FMT = DateTimeFormatter.ofPattern("yyyyMMdd");
    private static final String APPROVAL_DOCUMENT_TYPE = "PARTNER_ORDER";
    private static final String APPROVAL_ACTION_KEY = "PARTNER_ORDER_CONVERT";
    private static final String APPROVAL_FORBIDDEN_MESSAGE =
            "주문 출고전환 권한이 없습니다 — 승인자 결재자(그룹/개인)만 전환할 수 있습니다";
    private static final String RESERVE_REF_TYPE = "PARTNER_ORDER_CONVERT";

    private final PartnerOrderRepository orderRepository;
    private final SlipServiceClient slipServiceClient;
    private final InventoryClient inventoryClient;
    private final ApprovalLineAuthorizeClient approvalLineAuthorizeClient;
    private final PartnerOrderBoardChangePublisher boardChangePublisher;

    /**
     * 주문의 선택 라인을 출고전표로 부분전환한다 (Phase 2.6c — reserve 예약 모델).
     *
     * <p><b>처리 순서</b>:
     * <ol>
     *   <li>주문 조회 + 전환 가능 상태 가드 (DRAFT/ON_HOLD)</li>
     *   <li>warehouseCode 검증 + 라인 매핑 + 잔여수량 사전 검증</li>
     *   <li>결정적 idempotencyKey / convertKey 생성 (SHA-256)</li>
     *   <li>warehouseCode → warehouseId 역조회 (inventory DB 단일 출처)</li>
     *   <li>라인별 재고 예약 — 가용 부족 409 → 전체 중단 (slip 미발행)</li>
     *   <li>slip-service 발행</li>
     *   <li>slip 발행 실패 → 예약 release 보상 → 예외 전파</li>
     *   <li>발행 성공 → converted 누적 + DB 영속화</li>
     * </ol>
     *
     * @param id        주문번호 또는 내부 UUID 문자열
     * @param req       부분전환 요청 (선택 라인 + 수량 + 창고코드)
     * @param actorId   처리자 UUID (X-User-Id 헤더, null 허용)
     * @param actorName 처리자명 (X-User-Name 헤더, null 허용)
     * @return 전환 결과 (slipNo + 주문 status + fullyConverted)
     * @throws BusinessException(PARTNER_ORDER_NOT_FOUND)         주문 미존재
     * @throws BusinessException(PARTNER_ORDER_UPDATE_INVALID_LINE) 주문 라인 UUID 불일치
     * @throws BusinessException(CONFLICT)                        가용 재고 부족 / 전환 불가 상태 / 잔여 초과
     * @throws BusinessException(NOT_FOUND)                       warehouseCode 미존재
     */
    @Transactional
    public ConvertResultResponse convert(String id, ConvertToSlipRequest req,
                                         UUID actorId, String actorName) {
        enforceApprovalLine(actorId);

        // 1. 주문 조회 + 전환 가능 검증 (DRAFT/ON_HOLD 화이트리스트)
        PartnerOrder order = PartnerOrderIdResolver.findByIdentifier(orderRepository, id)
                .orElseThrow(() -> new BusinessException(ErrorCode.PARTNER_ORDER_NOT_FOUND,
                        ErrorCode.PARTNER_ORDER_NOT_FOUND.getDefaultMessage()));
        order.requireConvertible();

        // 2a. warehouseCode 검증
        if (req.warehouseCode() == null || req.warehouseCode().isBlank()) {
            throw new org.springframework.web.server.ResponseStatusException(
                    org.springframework.http.HttpStatus.CONFLICT,
                    "warehouseCode 는 필수입니다. 창고 코드를 명시적으로 지정하세요.");
        }

        // 2b. 라인 매핑 + 잔여수량 사전 검증
        Map<UUID, PartnerOrderLine> lineMap = order.getLines().stream()
                .collect(Collectors.toMap(PartnerOrderLine::getId, l -> l));

        List<ConvertToSlipRequest.Item> validatedItems = new ArrayList<>();
        List<Map<String, Object>> payloadLines = new ArrayList<>();

        for (ConvertToSlipRequest.Item item : req.items()) {
            PartnerOrderLine line = lineMap.get(item.orderLineId());
            if (line == null) {
                throw new BusinessException(ErrorCode.PARTNER_ORDER_UPDATE_INVALID_LINE,
                        "주문 라인을 찾을 수 없습니다: " + item.orderLineId());
            }
            if (item.quantity() <= 0) {
                throw new org.springframework.web.server.ResponseStatusException(
                        org.springframework.http.HttpStatus.CONFLICT,
                        "전환 수량은 1 이상이어야 합니다.");
            }
            if (item.quantity() > line.remainingQuantity()) {
                throw new org.springframework.web.server.ResponseStatusException(
                        org.springframework.http.HttpStatus.CONFLICT,
                        "전환 수량이 잔여 수량을 초과합니다. 잔여=" + line.remainingQuantity()
                                + ", 요청=" + item.quantity());
            }
            validatedItems.add(item);

            Map<String, Object> linePayload = new LinkedHashMap<>();
            linePayload.put("productCode", line.getModelName());
            linePayload.put("productName", line.getProductName());
            linePayload.put("qty", String.valueOf(item.quantity()));
            linePayload.put("unitPriceVat", line.getPriceVat());
            linePayload.put("remarks", line.getRemark());
            linePayload.put("sourceOrderLineId", line.getId().toString());
            linePayload.put("categoryKey", line.getCategoryKey());
            payloadLines.add(linePayload);
        }

        // 3. 결정적 idempotencyKey / convertKey 생성
        String idempotencyKey = buildIdempotencyKey(order.getId(), validatedItems, lineMap);
        // convertKey 를 UUID 형식으로 변환 (inventory referenceId 는 UUID 타입)
        UUID convertKeyUuid = buildConvertKeyUuid(order.getId(), validatedItems, lineMap);

        // 4. warehouseCode → warehouseId 역조회
        UUID warehouseId = inventoryClient.resolveWarehouseIdByCode(req.warehouseCode());

        // 5. 라인별 재고 예약 — 가용 부족 409 시 전체 중단(slip 미발행 = 사전차단)
        // 멱등 no-op(alreadyReserved=true) 라인은 reservedLines 에 추가하지 않는다.
        // → 이후 다른 라인 409 시 compensateReserved 가 no-op 라인에 대해
        //   release 를 호출하지 않아 double-release(reservedQty 음수) 를 방지한다.
        List<ReservedLine> reservedLines = new ArrayList<>();
        try {
            for (ConvertToSlipRequest.Item item : validatedItems) {
                PartnerOrderLine line = lineMap.get(item.orderLineId());
                UUID productId = line.getProductId();
                ReservationResult result = inventoryClient.reserve(
                        productId, warehouseId, item.quantity(),
                        RESERVE_REF_TYPE, convertKeyUuid);
                if (!result.alreadyReserved()) {
                    // 실제 예약 발생 라인만 보상 대상에 추가
                    reservedLines.add(new ReservedLine(productId, warehouseId, item.quantity()));
                }
            }
        } catch (BusinessException ex) {
            // 가용 부족(CONFLICT) → 실제 예약 성공 라인만 release 보상 후 예외 전파
            compensateReserved(reservedLines, convertKeyUuid);
            throw ex;
        }

        // 6. slip-service 발행
        String ioDate = LocalDate.now().format(IO_DATE_FMT);
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("partnerOrderId", order.getId().toString());
        payload.put("partnerCode", order.getPartnerCode());
        payload.put("bizCode", order.getBizCode());
        payload.put("orderNo", order.getOrderNo());
        payload.put("ioDate", ioDate);
        payload.put("warehouseCode", req.warehouseCode());
        payload.put("warehouseId", warehouseId.toString());
        payload.put("lines", payloadLines);

        PublishResult result;
        try {
            result = slipServiceClient.publishFromPartnerOrder(payload, idempotencyKey);
        } catch (BusinessException ex) {
            // 7. slip 발행 실패 → 예약 release 보상 → 예외 전파
            log.warn("slip 발행 실패 → 재고 예약 release 보상 (orderId={}, convertKey={})",
                    order.getId(), idempotencyKey);
            compensateReserved(reservedLines, convertKeyUuid);
            throw ex;
        }

        // 8. 발행 성공 → converted 누적 + DB 영속화
        for (ConvertToSlipRequest.Item item : validatedItems) {
            PartnerOrderLine line = lineMap.get(item.orderLineId());
            line.convert(item.quantity());
        }

        order.markConvertedIfComplete();
        orderRepository.saveAndFlush(order);
        publishListChanged();

        return new ConvertResultResponse(
                result.slipNo(),
                order.getStatus().name(),
                order.getLines().stream().allMatch(PartnerOrderLine::isFullyConverted));
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
     * 예약 성공 라인들의 release 보상 — slip 발행 실패 또는 가용 부족 전체 중단 시 호출.
     *
     * <p>release 실패는 InventoryClient 내부에서 alert 로그만 처리.
     * release 자체 실패는 운영자 수동 복구 대상.
     *
     * @param reservedLines 예약 성공 라인 목록
     * @param convertKeyUuid convert 키 UUID (release referenceId)
     */
    private void compensateReserved(List<ReservedLine> reservedLines, UUID convertKeyUuid) {
        for (ReservedLine reserved : reservedLines) {
            try {
                inventoryClient.release(reserved.productId(), reserved.warehouseId(),
                        reserved.quantity(), RESERVE_REF_TYPE, convertKeyUuid);
            } catch (Exception ex) {
                log.error("재고 예약 release 보상 실패 (수동 복구 필요) — productId={}, qty={}: {}",
                        reserved.productId(), reserved.quantity(), ex.getMessage());
            }
        }
    }

    /**
     * 결정적 idempotencyKey — SHA-256(orderId + 정렬된 "lineId:convertedBefore:qty").
     *
     * <p>convertedQuantity 스냅샷 포함 → 같은 라인 같은 수량 2회 요청도 다른 키 생성
     * → slip-service 이중발행 차단 + partner-order converted 이중 누적 차단.
     *
     * @param orderId 주문 UUID
     * @param items   검증 완료된 전환 요청 아이템 목록
     * @param lineMap 라인 UUID → 도메인 객체
     * @return "PO-CONV-{orderId}-{SHA-256 hex 앞 16자}" 형식 키
     */
    private String buildIdempotencyKey(UUID orderId,
                                        List<ConvertToSlipRequest.Item> items,
                                        Map<UUID, PartnerOrderLine> lineMap) {
        String contentHash = items.stream()
                .sorted(java.util.Comparator.comparing(item -> item.orderLineId().toString()))
                .map(item -> {
                    PartnerOrderLine line = lineMap.get(item.orderLineId());
                    int convertedBefore = line.getConvertedQuantity();
                    return item.orderLineId() + ":" + convertedBefore + ":" + item.quantity();
                })
                .collect(Collectors.joining(","));
        String raw = orderId + "-" + contentHash;
        String hexHash = sha256hex(raw);
        return "PO-CONV-" + orderId + "-" + hexHash.substring(0, 16);
    }

    /**
     * convertKey → UUID 변환 — inventory reserve referenceId 로 사용.
     *
     * <p>idempotencyKey 의 SHA-256 해시 앞 32자를 UUID 형식으로 변환한다.
     * inventory referenceId 는 UUID 타입이므로 deterministic UUID 를 사용한다.
     *
     * @param orderId 주문 UUID
     * @param items   검증 완료된 전환 요청 아이템 목록
     * @param lineMap 라인 UUID → 도메인 객체
     * @return 결정적 UUID (SHA-256 해시 기반)
     */
    private UUID buildConvertKeyUuid(UUID orderId,
                                      List<ConvertToSlipRequest.Item> items,
                                      Map<UUID, PartnerOrderLine> lineMap) {
        String contentHash = items.stream()
                .sorted(java.util.Comparator.comparing(item -> item.orderLineId().toString()))
                .map(item -> {
                    PartnerOrderLine line = lineMap.get(item.orderLineId());
                    int convertedBefore = line.getConvertedQuantity();
                    return item.orderLineId() + ":" + convertedBefore + ":" + item.quantity();
                })
                .collect(Collectors.joining(","));
        String raw = orderId + "-" + contentHash;
        String hexHash = sha256hex(raw);
        // SHA-256 hex 64자 중 앞 32자를 UUID 형식(8-4-4-4-12)으로 포맷
        String uuidStr = hexHash.substring(0, 8) + "-"
                + hexHash.substring(8, 12) + "-"
                + hexHash.substring(12, 16) + "-"
                + hexHash.substring(16, 20) + "-"
                + hexHash.substring(20, 32);
        return UUID.fromString(uuidStr);
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

    /** 예약 성공 라인 추적 레코드 (보상 트랜잭션용). */
    private record ReservedLine(UUID productId, UUID warehouseId, int quantity) {}
}
