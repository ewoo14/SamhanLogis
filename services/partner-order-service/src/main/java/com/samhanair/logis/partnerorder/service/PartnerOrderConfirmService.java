package com.samhanair.logis.partnerorder.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.partnerorder.client.DcConfigClient;
import com.samhanair.logis.partnerorder.client.InventoryClient;
import com.samhanair.logis.partnerorder.client.ProductClient;
import com.samhanair.logis.partnerorder.client.ProductSummary;
import com.samhanair.logis.partnerorder.client.SlipServiceClient;
import com.samhanair.logis.partnerorder.client.SlipServiceClient.PublishResult;
import com.samhanair.logis.partnerorder.domain.HistoryEventType;
import com.samhanair.logis.partnerorder.domain.PartnerOrder;
import com.samhanair.logis.partnerorder.domain.PartnerOrderDraft;
import com.samhanair.logis.partnerorder.domain.PartnerOrderHistory;
import com.samhanair.logis.partnerorder.domain.PartnerOrderLine;
import com.samhanair.logis.partnerorder.outbox.SlipPublishOutbox;
import com.samhanair.logis.partnerorder.repository.PartnerOrderDraftRepository;
import com.samhanair.logis.partnerorder.repository.PartnerOrderHistoryRepository;
import com.samhanair.logis.partnerorder.repository.PartnerOrderRepository;
import com.samhanair.logis.partnerorder.repository.SlipPublishOutboxRepository;
import com.samhanair.logis.partnerorder.web.dto.ConfirmLineRequest;
import com.samhanair.logis.partnerorder.web.dto.ConfirmRequest;
import com.samhanair.logis.partnerorder.web.dto.ConfirmResponse;
import jakarta.persistence.EntityManager;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 주문 확정 서비스 (legacy sendOrderFromUi 6074 → 본 서비스). 설계서 §3.6 + §6 의 흐름:
 *
 * <pre>
 *   DRAFT → POST /confirm → CONFIRMING (advisory lock)
 *     → M3 dc-config Feign (server-side priceVat 적용)
 *     → M1b inventory reserve
 *     → partner_order INSERT (status=CONFIRMING)
 *     → SlipServiceClient.publishFromPartnerOrder(req, "PO-CONF-{draftSeq}")
 *       ├ 200 → CONFIRMED + slipNo 채움
 *       ├ 409 (idempotency duplicate) → 기존 slipNo 채움
 *       └ 5xx → outbox row INSERT (PENDING) + status=CONFIRMED + slipPublishStatus=PENDING_RETRY
 *          └ Scheduler 5분 retry (max 24시간 → FAILED_PERMANENT + alert)
 * </pre>
 *
 * <p>Idempotency-Key {@code PO-CONF-{partnerCode}-{draftSeq}} — 재시도 시 동일 키 재사용으로
 * slip-service 중복 차단. partnerCode 를 포함시켜 거래처별 draftSeq 시퀀스 격리를 보존.
 *
 * <p>UUID 비공개 가드 — 응답 ConfirmResponse 는 orderNo / slipNo 만 노출.
 */
@Service
@RequiredArgsConstructor
public class PartnerOrderConfirmService {

    private static final Logger log = LoggerFactory.getLogger(PartnerOrderConfirmService.class);
    private static final DateTimeFormatter ORDER_NO_DATE = DateTimeFormatter.ofPattern("yyyy/MM/dd");
    /** legacy 동작 — 향후 슬라이스에서 partner-warehouse 분기. */
    private static final UUID DEFAULT_WAREHOUSE_ID =
            UUID.fromString("00000000-0000-0000-0000-000000000001");

    private final PartnerOrderRepository orderRepository;
    private final PartnerOrderDraftRepository draftRepository;
    private final PartnerOrderHistoryRepository historyRepository;
    private final SlipPublishOutboxRepository outboxRepository;

    private final DcConfigClient dcConfigClient;
    private final ProductClient productClient;
    private final InventoryClient inventoryClient;
    private final SlipServiceClient slipServiceClient;

    private final ObjectMapper objectMapper;
    private final EntityManager entityManager;

    /**
     * 임시저장 → 확정 흐름. draftId 가 있으면 draft 의 draftSeq 를 idempotencyKey 시드로 사용.
     *
     * @param partnerCode 거래처 코드 (JWT)
     * @param bizCode 사업자번호
     * @param actorUserId X-User-Id
     * @param draftId 임시저장 UUID (legacy 흐름 — saveOrderSnapshot 후 sendOrderFromUi)
     * @param request 라인 (가격은 무시 — server-side DC 적용)
     * @return ConfirmResponse — slipNo 또는 PENDING_RETRY 상태
     */
    @Transactional
    public ConfirmResponse confirm(String partnerCode, String bizCode, String actorUserId,
                                   UUID draftId, ConfirmRequest request) {
        if (partnerCode == null || partnerCode.isBlank()) {
            throw new BusinessException(ErrorCode.UNAUTHORIZED, "partnerCode 필수");
        }
        if (bizCode == null || bizCode.isBlank()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "bizCode 필수");
        }

        // 1) draft 검증 + draftSeq 추출 (idempotencyKey 시드)
        // partnerCode 별 draftSeq 시퀀스가 독립이므로 idempotencyKey 도 partnerCode 로 격리
        // (PR #76 회고 — 다른 partner 의 동일 draftSeq 가 동일 idemKey 로 collide 되어 IT
        // race condition 발생).
        long draftSeq = resolveDraftSeq(partnerCode, draftId);
        String idempotencyKey = "PO-CONF-" + partnerCode + "-" + draftSeq;

        // Idempotency 검사 — 이미 확정된 키면 기존 결과 반환 (재호출 가드)
        var existing = orderRepository.findByIdempotencyKey(idempotencyKey);
        if (existing.isPresent()) {
            log.info("Idempotency hit: idemKey={} → 기존 주문 반환", idempotencyKey);
            return ConfirmResponse.from(existing.get());
        }

        // 2) M3 dc-config — server-side priceVat
        Map<String, Object> dcConfig = dcConfigClient.fetchDcConfig(partnerCode);

        // 3) M1a product — 카탈로그 조회 (라인 스냅샷 + 가격 산출)
        List<UUID> productIds = request.lines().stream()
                .map(ConfirmLineRequest::productId)
                .distinct()
                .toList();
        List<ProductSummary> products = productClient.lookup(productIds);
        Map<UUID, ProductSummary> productMap = new HashMap<>();
        for (ProductSummary p : products) {
            productMap.put(p.id(), p);
        }

        // 4) M1b inventory reserve (라인별)
        for (ConfirmLineRequest line : request.lines()) {
            inventoryClient.reserve(line.productId(), DEFAULT_WAREHOUSE_ID, line.quantity());
        }

        // 5) partner_order INSERT (CONFIRMING)
        String orderNo = nextOrderNo();

        PartnerOrder order = PartnerOrder.create(
                partnerCode, bizCode, orderNo, idempotencyKey, BigDecimal.ZERO);

        for (ConfirmLineRequest line : request.lines()) {
            ProductSummary p = productMap.get(line.productId());
            if (p == null) {
                throw new BusinessException(ErrorCode.NOT_FOUND,
                        "제품 카탈로그 없음: " + line.productId());
            }
            BigDecimal priceVat = applyDc(p.sellingPrice(), line.categoryKey(), dcConfig);
            PartnerOrderLine entity = PartnerOrderLine.create(
                    p.id(), p.modelName(), p.name(), line.categoryKey(),
                    line.quantity(), priceVat, line.remark());
            order.addLine(entity); // totalAmount 자동 누적
        }
        order.recomputeTotal();
        order = orderRepository.save(order);
        historyRepository.save(PartnerOrderHistory.ofOrder(
                order.getId(), partnerCode, HistoryEventType.CONFIRMED,
                actorUserId, "{\"orderNo\":\"" + orderNo + "\"}"));

        // 6) slip-service 발행 — Sync REST (Idempotency-Key)
        Map<String, Object> slipPayload = buildSlipPayload(order);
        try {
            PublishResult result = slipServiceClient.publishFromPartnerOrder(
                    slipPayload, idempotencyKey);
            order.markSlipPublished(result.slipNo());
            historyRepository.save(PartnerOrderHistory.ofOrder(
                    order.getId(), partnerCode, HistoryEventType.SLIP_PUBLISHED,
                    actorUserId,
                    "{\"slipNo\":\"" + result.slipNo() + "\",\"duplicate\":" + result.duplicate() + "}"));
        } catch (BusinessException ex) {
            if (ex.getErrorCode() == ErrorCode.INTERNAL_ERROR) {
                // 5xx → outbox 큐
                order.markSlipPendingRetry();
                outboxRepository.save(SlipPublishOutbox.queue(
                        order.getId(), idempotencyKey, serialize(slipPayload)));
                historyRepository.save(PartnerOrderHistory.ofOrder(
                        order.getId(), partnerCode, HistoryEventType.SLIP_RETRY_QUEUED,
                        actorUserId, "{\"reason\":\"" + ex.getMessage() + "\"}"));
                log.warn("slip-service 5xx → outbox queued (orderNo={}, idemKey={})", orderNo, idempotencyKey);
            } else {
                // 4xx 또는 기타 — 보상 (release) + propagate
                throw ex;
            }
        }

        return ConfirmResponse.from(order);
    }

    /**
     * draft 가 있으면 draftSeq 반환, 없으면 partner 별 MAX+1.
     */
    private long resolveDraftSeq(String partnerCode, UUID draftId) {
        if (draftId != null) {
            PartnerOrderDraft draft = draftRepository.findById(draftId)
                    .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "임시저장을 찾을 수 없습니다"));
            if (!draft.getPartnerCode().equals(partnerCode)) {
                throw new BusinessException(ErrorCode.FORBIDDEN, "본인 거래처 임시저장만 확정 가능");
            }
            return draft.getDraftSeq();
        }
        return draftRepository.findMaxDraftSeqByPartnerCode(partnerCode) + 1L;
    }

    /** 사용자 표시 주문번호 — 날짜별 마지막 순번 + 1, 공개 업무번호 표준({@code yyyy/MM/dd-N}). */
    private String nextOrderNo() {
        String datePrefix = LocalDate.now().format(ORDER_NO_DATE);
        entityManager.createNativeQuery("SELECT pg_advisory_xact_lock(hashtext(?1))")
                .setParameter(1, "partner_order_seq_" + datePrefix)
                .getSingleResult();
        int maxSeq = 0;
        for (PartnerOrder order : orderRepository.findAllByOrderNoStartingWith(datePrefix)) {
            maxSeq = Math.max(maxSeq, extractOrderSeq(datePrefix, order.getOrderNo()));
        }
        return datePrefix + "-" + (maxSeq + 1);
    }

    private int extractOrderSeq(String datePrefix, String orderNo) {
        if (orderNo == null || !orderNo.startsWith(datePrefix)) {
            return 0;
        }
        String suffix = orderNo.substring(datePrefix.length()).trim();
        if (suffix.startsWith("-")) {
            suffix = suffix.substring(1).trim();
        }
        if (suffix.startsWith("V")) {
            suffix = suffix.substring(1).trim();
        }
        try {
            return Integer.parseInt(suffix);
        } catch (NumberFormatException ignored) {
            return 0;
        }
    }

    /**
     * server-side DC 적용 — categoryKey 기반 할인율 매트릭스 (M3 가드 일관, client 가격 무시).
     * dc-config-service 응답이 비어있으면 sellingPrice 그대로.
     */
    private BigDecimal applyDc(BigDecimal sellingPrice, String categoryKey, Map<String, Object> dcConfig) {
        if (sellingPrice == null) {
            return BigDecimal.ZERO;
        }
        if (dcConfig == null || dcConfig.isEmpty()) {
            return sellingPrice;
        }
        String dcKey = mapCategoryToDcKey(categoryKey);
        Object raw = dcConfig.get(dcKey);
        if (!(raw instanceof Number num)) {
            return sellingPrice;
        }
        BigDecimal rate = BigDecimal.valueOf(num.doubleValue());
        BigDecimal multiplier = BigDecimal.ONE.subtract(rate);
        if (multiplier.signum() <= 0) {
            return BigDecimal.ZERO;
        }
        return sellingPrice.multiply(multiplier);
    }

    private String mapCategoryToDcKey(String categoryKey) {
        return switch (categoryKey) {
            case "homemulti", "homeDefaults" -> "homeDiscount";
            case "commercialMulti" -> "commDiscount";
            case "singleSets", "singleDefaults", "singleMatPrices" -> "singleDiscount";
            case "singleParts" -> "singlePartsDiscount";
            case "commercialParts" -> "commPartsDiscount";
            case "oldProducts" -> "oldDiscount";
            case "homeInc", "commInc", "singleInc", "singlePartsInc" -> "incDiscount";
            case "specDetailMap" -> "specDiscount";
            default -> "homeDiscount";
        };
    }

    /**
     * slip-service POST /from-partner-order 본문 — partnerCode/bizCode/orderNo + 라인 배열.
     * slip-service 의 정확한 schema 는 M5 결정에 따름. M4 skeleton 은 합리적 wire-format 가정.
     */
    private Map<String, Object> buildSlipPayload(PartnerOrder order) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("partnerCode", order.getPartnerCode());
        body.put("bizCode", order.getBizCode());
        body.put("orderNo", order.getOrderNo());
        List<Map<String, Object>> lines = new ArrayList<>();
        for (PartnerOrderLine l : order.getLines()) {
            Map<String, Object> lineMap = new LinkedHashMap<>();
            lineMap.put("productId", l.getProductId().toString());
            lineMap.put("modelName", l.getModelName());
            lineMap.put("productName", l.getProductName());
            lineMap.put("categoryKey", l.getCategoryKey());
            lineMap.put("quantity", l.getQuantity());
            lineMap.put("priceVat", l.getPriceVat());
            lineMap.put("subtotal", l.getSubtotal());
            lineMap.put("remark", l.getRemark());
            lines.add(lineMap);
        }
        body.put("lines", lines);
        return body;
    }

    private String serialize(Object payload) {
        try {
            return objectMapper.writeValueAsString(payload);
        } catch (JsonProcessingException ex) {
            throw new BusinessException(ErrorCode.INTERNAL_ERROR,
                    "outbox payload 직렬화 실패", ex);
        }
    }
}
