package com.samhanair.logis.partnerorder.service;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.partnerorder.client.SlipServiceClient;
import com.samhanair.logis.partnerorder.client.SlipServiceClient.PublishResult;
import com.samhanair.logis.partnerorder.domain.PartnerOrder;
import com.samhanair.logis.partnerorder.domain.PartnerOrderLine;
import com.samhanair.logis.partnerorder.repository.PartnerOrderRepository;
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
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 주문→출고전표 부분전환 서비스 — Phase 2.6a.
 *
 * <p>slip 미발행 주문(slipNo=null)의 선택 라인을 출고전표로 부분전환한다.
 * 각 라인의 converted_quantity 를 누적하고, 전량 전환 시 주문 status 를 CONVERTED 로 표시한다.
 *
 * <p>idempotencyKey: {@code PO-CONV-{orderId}-{SHA-256(정렬된 orderLineId:qty 조합)}} — 요청 내용
 * 기반 결정적 키로 동일 요청의 재시도를 안전하게 처리한다 (identityHashCode 사용 금지).
 *
 * <p>productCode 매핑: slip-service 의 {@code PublishLineRequest.productCode} 는 product-service
 * {@code lookupByModel} 을 통해 productId 로 변환된다. PartnerOrderLine 의 {@code modelName} 스냅샷이
 * 기존 confirm 흐름({@link PartnerOrderConfirmService#buildSlipPayload}) 과 동일하게
 * {@code productCode} 에 매핑된다.
 */
@Service
@RequiredArgsConstructor
public class PartnerOrderConvertService {

    private static final DateTimeFormatter IO_DATE_FMT = DateTimeFormatter.ofPattern("yyyyMMdd");

    private final PartnerOrderRepository orderRepository;
    private final SlipServiceClient slipServiceClient;

    /**
     * 주문의 선택 라인을 출고전표로 부분전환한다 (Phase 2.6a).
     *
     * <p>처리 순서:
     * <ol>
     *   <li>주문 조회 + 전환 가능 상태 가드 ({@link PartnerOrder#requireConvertible})</li>
     *   <li>선택 라인 매핑 + 잔여수량 검증 (도메인 {@link PartnerOrderLine#convert} — 409 가드)</li>
     *   <li>결정적 idempotencyKey 생성 (SHA-256 기반)</li>
     *   <li>slip-service 발행 (선택 라인만, sourceOrderLineId 포함)</li>
     *   <li>전량 전환 시 주문 CONVERTED 표시 ({@link PartnerOrder#markConvertedIfComplete})</li>
     *   <li>주문 saveAndFlush</li>
     * </ol>
     *
     * @param id 주문번호 또는 내부 UUID 문자열
     * @param req 부분전환 요청 (선택 라인 + 수량 + 창고코드)
     * @param actorId 처리자 UUID (X-User-Id 헤더, null 허용)
     * @param actorName 처리자명 (X-User-Name 헤더, null 허용)
     * @return 전환 결과 (slipNo + 주문 status + fullyConverted)
     * @throws BusinessException(NOT_FOUND) 주문 미존재
     * @throws BusinessException(PARTNER_ORDER_UPDATE_INVALID_LINE) 주문 라인 UUID 불일치
     * @throws org.springframework.web.server.ResponseStatusException(409) 전환 불가 상태 또는 잔여 초과
     */
    @Transactional
    public ConvertResultResponse convert(String id, ConvertToSlipRequest req,
                                         UUID actorId, String actorName) {
        // 1. 주문 조회 + 전환 가능 검증
        PartnerOrder order = PartnerOrderIdResolver.findByIdentifier(orderRepository, id)
                .orElseThrow(() -> new BusinessException(ErrorCode.PARTNER_ORDER_NOT_FOUND,
                        ErrorCode.PARTNER_ORDER_NOT_FOUND.getDefaultMessage()));
        order.requireConvertible();

        // 2. 라인 매핑 (UUID 기반) + 잔여수량 누적 (도메인 메서드 — 409 가드)
        Map<UUID, PartnerOrderLine> lineMap = order.getLines().stream()
                .collect(Collectors.toMap(PartnerOrderLine::getId, l -> l));

        List<Map<String, Object>> payloadLines = new ArrayList<>();
        for (ConvertToSlipRequest.Item item : req.items()) {
            PartnerOrderLine line = lineMap.get(item.orderLineId());
            if (line == null) {
                throw new BusinessException(ErrorCode.PARTNER_ORDER_UPDATE_INVALID_LINE,
                        "주문 라인을 찾을 수 없습니다: " + item.orderLineId());
            }
            line.convert(item.quantity()); // 잔여 초과 시 ResponseStatusException(409)

            // slip-service PublishLineRequest 형식:
            // - productCode = modelName (기존 buildSlipPayload 와 동일, lookupByModel 경로)
            // - qty = String (slip-service 내부에서 int parse)
            // - unitPriceVat = priceVat
            // - sourceOrderLineId = 주문 라인 UUID (Phase 2.6a 역추적)
            Map<String, Object> linePayload = new LinkedHashMap<>();
            linePayload.put("productCode", line.getModelName());
            linePayload.put("productName", line.getProductName());
            linePayload.put("qty", String.valueOf(item.quantity()));
            linePayload.put("unitPriceVat", line.getPriceVat());
            linePayload.put("remarks", line.getRemark());
            linePayload.put("sourceOrderLineId", line.getId().toString());
            payloadLines.add(linePayload);
        }

        // 3. 결정적 idempotencyKey — SHA-256(orderId + 정렬된 orderLineId:qty)
        String idempotencyKey = buildIdempotencyKey(order.getId(), req);

        // 4. slip-service 발행 페이로드 구성
        // ioDate: LocalDate.now() (yyyyMMdd) — slip-service parseIoDate 포맷
        String ioDate = LocalDate.now().format(IO_DATE_FMT);
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("partnerOrderId", order.getId().toString());
        payload.put("partnerCode", order.getPartnerCode());
        payload.put("bizCode", order.getBizCode());
        payload.put("orderNo", order.getOrderNo());
        payload.put("ioDate", ioDate);
        if (req.warehouseCode() != null && !req.warehouseCode().isBlank()) {
            payload.put("warehouseCode", req.warehouseCode());
        } else {
            // slip-service 의 WarehouseCodeMapper 기본값 사용 위해 "DEFAULT" 전달
            payload.put("warehouseCode", "DEFAULT");
        }
        payload.put("lines", payloadLines);

        // 5. slip-service 발행 (200 or 409-duplicate)
        PublishResult result = slipServiceClient.publishFromPartnerOrder(payload, idempotencyKey);

        // 6. 전량 전환 시 주문 CONVERTED 표시
        order.markConvertedIfComplete();
        orderRepository.saveAndFlush(order);

        return new ConvertResultResponse(
                result.slipNo(),
                order.getStatus().name(),
                order.getLines().stream().allMatch(PartnerOrderLine::isFullyConverted));
    }

    /**
     * 요청 내용 기반 결정적 idempotencyKey — SHA-256(orderId + 정렬된 "lineId:qty" 조합).
     *
     * <p>동일 요청의 재시도는 동일 키를 반환하므로 slip-service idempotency 가드가 중복 발행을 차단한다.
     * identityHashCode 사용 금지 (JVM 재시작 시 다른 값).
     *
     * @param orderId 주문 UUID
     * @param req 전환 요청
     * @return "PO-CONV-{orderId}-{SHA-256 hex 앞 16자}" 형식 키
     */
    private String buildIdempotencyKey(UUID orderId, ConvertToSlipRequest req) {
        String contentHash = req.items().stream()
                .sorted(java.util.Comparator.comparing(item -> item.orderLineId().toString()))
                .map(item -> item.orderLineId() + ":" + item.quantity())
                .collect(Collectors.joining(","));
        String raw = orderId + "-" + contentHash;
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            byte[] digest = md.digest(raw.getBytes(java.nio.charset.StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder();
            for (byte b : digest) {
                sb.append(String.format("%02x", b));
            }
            // PO-CONV- prefix + orderId + 해시 앞 16자 → 총 길이 ~ 80자 이내
            return "PO-CONV-" + orderId + "-" + sb.substring(0, 16);
        } catch (NoSuchAlgorithmException ex) {
            throw new IllegalStateException("SHA-256 unavailable", ex);
        }
    }
}
