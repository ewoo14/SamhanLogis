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
 * <p>slip 미발행 주문(DRAFT/ON_HOLD)의 선택 라인을 출고전표로 부분전환한다.
 * 전환 대상은 {@link PartnerOrder#requireConvertible()} 화이트리스트(DRAFT/ON_HOLD) 만 허용한다.
 *
 * <p><b>트랜잭션 경계 설계</b>:
 * <ol>
 *   <li>검증 단계 — requireConvertible + 라인 매핑 + 잔여수량 확인 (converted 누적 없이 검증만)</li>
 *   <li>slip 발행 — 외부 REST 호출 (성공/409-duplicate 만 정상)</li>
 *   <li>converted 누적 — 발행 성공 확인 후 {@link PartnerOrderLine#convert} 호출</li>
 *   <li>saveAndFlush — markConvertedIfComplete + DB 영속화</li>
 * </ol>
 * 발행 실패(5xx → BusinessException) 시 converted 미반영 + 트랜잭션 롤백 → 정합.
 * 발행 성공 후 saveAndFlush 실패는 드물지만 slipNo/lineId 로그로 수동 복구.
 *
 * <p><b>idempotencyKey</b>: {@code PO-CONV-{orderId}-{SHA-256(정렬된 "lineId:convertedBefore:qty")[:16]}} —
 * 발행 시점의 convertedQuantity 스냅샷을 포함하여 같은 라인 같은 수량 2회 요청에도 다른 키를 생성,
 * partner-order 레벨 이중 누적을 차단한다.
 *
 * <p>productCode 매핑: PartnerOrderLine 의 {@code modelName} 스냅샷이 기존 confirm 흐름과 동일하게
 * {@code productCode} 에 매핑된다 (slip-service {@code lookupByModel} 경로).
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
     * <p><b>처리 순서</b>:
     * <ol>
     *   <li>주문 조회 + 전환 가능 상태 가드 ({@link PartnerOrder#requireConvertible} — DRAFT/ON_HOLD 화이트리스트)</li>
     *   <li>라인 매핑 (UUID 기반) + 잔여수량 사전 검증 (converted 누적 없이 검증만)</li>
     *   <li>결정적 idempotencyKey 생성 (SHA-256: orderId + lineId:convertedBefore:qty 스냅샷)</li>
     *   <li>slip-service 발행 페이로드 구성 + REST 호출 (200 or 409-duplicate)</li>
     *   <li><b>발행 성공 후</b> converted_quantity 누적 ({@link PartnerOrderLine#convert}) — 트랜잭션 정합 핵심</li>
     *   <li>전량 전환 시 주문 CONVERTED 표시 ({@link PartnerOrder#markConvertedIfComplete})</li>
     *   <li>주문 saveAndFlush</li>
     * </ol>
     *
     * <p><b>트랜잭션 안전성</b>: converted 누적은 slip 발행 성공(200/409-dup) 확인 후 수행.
     * slip 5xx 시 BusinessException 으로 트랜잭션 롤백 → DB 변경 없음 → 재시도 가능.
     * slip 성공 후 saveAndFlush 실패는 드물지만 발생 시 슬립은 발행된 상태이므로
     * 운영자가 slipNo 로 수동 converted_quantity 보정 필요 (로그에 orderId 기록).
     *
     * @param id 주문번호 또는 내부 UUID 문자열
     * @param req 부분전환 요청 (선택 라인 + 수량 + 창고코드 — warehouseCode 필수)
     * @param actorId 처리자 UUID (X-User-Id 헤더, null 허용)
     * @param actorName 처리자명 (X-User-Name 헤더, null 허용)
     * @return 전환 결과 (slipNo + 주문 status + fullyConverted)
     * @throws BusinessException(PARTNER_ORDER_NOT_FOUND) 주문 미존재
     * @throws BusinessException(PARTNER_ORDER_UPDATE_INVALID_LINE) 주문 라인 UUID 불일치
     * @throws org.springframework.web.server.ResponseStatusException(409)
     *         전환 불가 상태(DRAFT/ON_HOLD 이외), 잔여 초과, warehouseCode 미제공 시
     */
    @Transactional
    public ConvertResultResponse convert(String id, ConvertToSlipRequest req,
                                         UUID actorId, String actorName) {
        // 1. 주문 조회 + 전환 가능 검증 (DRAFT/ON_HOLD 화이트리스트)
        PartnerOrder order = PartnerOrderIdResolver.findByIdentifier(orderRepository, id)
                .orElseThrow(() -> new BusinessException(ErrorCode.PARTNER_ORDER_NOT_FOUND,
                        ErrorCode.PARTNER_ORDER_NOT_FOUND.getDefaultMessage()));
        order.requireConvertible();

        // 2a. warehouseCode 검증 — "DEFAULT" 폴백 금지: slip-service WarehouseCodeMapper 미보장
        if (req.warehouseCode() == null || req.warehouseCode().isBlank()) {
            throw new org.springframework.web.server.ResponseStatusException(
                    org.springframework.http.HttpStatus.CONFLICT,
                    "warehouseCode 는 필수입니다. 창고 코드를 명시적으로 지정하세요.");
        }

        // 2b. 라인 매핑 (UUID 기반) + 잔여수량 사전 검증 (발행 전 — 잘못된 요청 조기 차단)
        //     이 단계에서 convert() 는 호출하지 않는다 (converted 누적은 발행 성공 후에만).
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
            // 잔여수량 사전 검증 (convert() 호출 없이 직접 비교)
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

        // 3. 결정적 idempotencyKey — SHA-256(orderId + 정렬된 "lineId:convertedBefore:qty")
        //    convertedQuantity 스냅샷 포함 → 같은 라인 같은 수량 2회 요청도 다른 키 생성
        //    → slip-service 이중발행 차단 + partner-order converted 이중 누적 차단
        String idempotencyKey = buildIdempotencyKey(order.getId(), validatedItems, lineMap);

        // 4. slip-service 발행 페이로드 구성 + REST 호출
        String ioDate = LocalDate.now().format(IO_DATE_FMT);
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("partnerOrderId", order.getId().toString());
        payload.put("partnerCode", order.getPartnerCode());
        payload.put("bizCode", order.getBizCode());
        payload.put("orderNo", order.getOrderNo());
        payload.put("ioDate", ioDate);
        payload.put("warehouseCode", req.warehouseCode());
        payload.put("lines", payloadLines);

        // 발행 성공 또는 409-duplicate(멱등) 모두 PublishResult 반환. 5xx → BusinessException → 롤백.
        PublishResult result = slipServiceClient.publishFromPartnerOrder(payload, idempotencyKey);

        // 5. 발행 성공 후 converted_quantity 누적 (트랜잭션 정합 핵심 — 발행 전 호출 금지)
        for (ConvertToSlipRequest.Item item : validatedItems) {
            PartnerOrderLine line = lineMap.get(item.orderLineId());
            line.convert(item.quantity()); // 발행 성공 후이므로 잔여 검증은 이미 통과
        }

        // 6. 전량 전환 시 주문 CONVERTED 표시 + DB 영속화
        order.markConvertedIfComplete();
        orderRepository.saveAndFlush(order);

        return new ConvertResultResponse(
                result.slipNo(),
                order.getStatus().name(),
                order.getLines().stream().allMatch(PartnerOrderLine::isFullyConverted));
    }

    /**
     * 요청 내용 기반 결정적 idempotencyKey — SHA-256(orderId + 정렬된 "lineId:convertedBefore:qty").
     *
     * <p>키에 {@code convertedBefore} (발행 직전 convertedQuantity 스냅샷) 를 포함한다.
     * 같은 라인을 같은 수량으로 2회 요청할 때 1차 발행 후 convertedBefore 가 달라지므로
     * 2차 요청은 다른 키 → slip-service 에 새 발행 → 정상 2회 부분전환.
     * 반대로 동일 트랜잭션 재시도(아직 converted 미반영 상태)는 동일 키 → slip-service 409-dup → 정합.
     *
     * <p>identityHashCode 사용 금지 (JVM 재시작 시 다른 값).
     *
     * @param orderId 주문 UUID
     * @param items 검증 완료된 전환 요청 아이템 목록
     * @param lineMap 라인 UUID → 도메인 객체 (convertedQuantity 스냅샷 획득용)
     * @return "PO-CONV-{orderId}-{SHA-256 hex 앞 16자}" 형식 키 (총 ~61자, length=80 이내)
     */
    private String buildIdempotencyKey(UUID orderId,
                                        List<ConvertToSlipRequest.Item> items,
                                        Map<UUID, PartnerOrderLine> lineMap) {
        String contentHash = items.stream()
                .sorted(java.util.Comparator.comparing(item -> item.orderLineId().toString()))
                .map(item -> {
                    PartnerOrderLine line = lineMap.get(item.orderLineId());
                    int convertedBefore = line.getConvertedQuantity(); // 발행 직전 스냅샷
                    return item.orderLineId() + ":" + convertedBefore + ":" + item.quantity();
                })
                .collect(Collectors.joining(","));
        String raw = orderId + "-" + contentHash;
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            byte[] digest = md.digest(raw.getBytes(java.nio.charset.StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder();
            for (byte b : digest) {
                sb.append(String.format("%02x", b));
            }
            // PO-CONV- prefix(8) + orderId(36) + -(1) + hash(16) = 61자 ≤ length=80
            return "PO-CONV-" + orderId + "-" + sb.substring(0, 16);
        } catch (NoSuchAlgorithmException ex) {
            throw new IllegalStateException("SHA-256 unavailable", ex);
        }
    }
}
