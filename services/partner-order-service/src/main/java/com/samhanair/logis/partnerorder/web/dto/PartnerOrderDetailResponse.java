package com.samhanair.logis.partnerorder.web.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.samhanair.logis.partnerorder.domain.PartnerOrder;
import com.samhanair.logis.partnerorder.domain.PartnerOrderLine;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;

/**
 * 주문 상세 응답.
 *
 * <p>헤더와 라인 모두 화면 표시값만 포함한다. 라인의 {@code lineId} 와 {@code productId} 는
 * 사용자 화면에 노출하지 않는다(UUID 비공개 원칙). {@code productId} 는 재고 batch 조회 키로서
 * payload 에 포함되나 FE 에서 API 내부 파라미터로만 사용하며 DOM 에 렌더링하지 않는다.
 *
 * <p>{@code partnerName} 같은 entity 컬럼 부재 필드는 {@code null} 반환되며, {@link JsonInclude#NON_NULL}
 * 정책으로 JSON 직렬화 시 제외된다. IT 의 {@code doesNotExist()} 단언 정합 + FE 의 fallback 처리 일관.
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record PartnerOrderDetailResponse(
        String orderNumber,
        String partnerCode,
        String bizCode,
        String partnerName,
        LocalDateTime submittedAt,
        String status,
        String slipPublishStatus,
        BigDecimal totalAmount,
        String linkedSlipNo,
        LocalDateTime updatedAt,
        String deliveryAddress,
        String siteAddress,
        String contactPhone,
        String dueDate,
        String memo,
        List<LineResponse> lines,
        boolean isDeleted,
        LocalDateTime deletedAt,
        String deletedByName
) {

    private static final Pattern UUID_PATTERN = Pattern.compile(
            "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$");

    /**
     * Entity 를 상세 DTO 로 변환한다 (productType enrich 없음 — 모든 라인 {@code productType=null}).
     *
     * <p>{@code partnerName} 은 현재 partner-order-service entity 에 컬럼이 없어 {@code null} 로
     * 반환한다. 후속 sub-task (SP-08-4-2 이후) 에서 partner-service lookup 으로 채운다.
     */
    public static PartnerOrderDetailResponse from(PartnerOrder order) {
        return from(order, Map.of());
    }

    /**
     * Entity 를 상세 DTO 로 변환하되, 라인의 {@code productType} 을 product-service 조회 결과 맵으로
     * enrich 한다 (Round C #23 세트 재고 가드).
     *
     * <p>{@code productTypeByModelCode} 는 {@code modelCode → "SINGLE"/"BUNDLE"} 매핑이며,
     * product-service 조회 실패(fail-soft) 시 빈 맵이 전달되어 모든 라인 {@code productType=null} 로
     * 둔다(기존 동작 동일). productId 와 무관하게 modelCode snapshot 을 기준으로 매칭한다.
     * FE 재고조회 모달(2.6d)은 {@code productType="BUNDLE"} 라인을
     * 재고조회 대상에서 제외한다.
     *
     * @param order 주문 엔티티
     * @param productTypeByModelCode modelCode 문자열 → productType 매핑 (빈 맵이면 enrich 없음)
     * @return 상세 DTO
     */
    public static PartnerOrderDetailResponse from(
            PartnerOrder order, Map<String, String> productTypeByModelCode) {
        return new PartnerOrderDetailResponse(
                order.getOrderNo(),
                order.getPartnerCode(),
                order.getBizCode(),
                null,
                order.getConfirmedAt(),
                order.getStatus().name(),
                order.getSlipPublishStatus().name(),
                order.getTotalAmount(),
                order.getSlipNo(),
                order.getModifiedAt(),
                order.getDeliveryAddress(),
                null,
                null,
                order.getDueDate() == null ? null : order.getDueDate().toString(),
                order.getMemo(),
                order.getLines().stream()
                        .map(line -> LineResponse.from(
                                line, productTypeByModelCode.get(trimToNull(line.getModelName()))))
                        .toList(),
                Boolean.TRUE.equals(order.getIsDeleted()),
                order.getDeletedAt(),
                resolveActorName(order.getDeletedByName()));
    }

    private static String trimToNull(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        return value.trim();
    }

    /** 삭제자 표시명 — UUID 형태(actorId 폴백)면 노출하지 않고, 100자 초과는 truncate. */
    private static String resolveActorName(String actorName) {
        if (actorName == null || actorName.isBlank()) {
            return null;
        }
        String trimmed = actorName.trim();
        if (UUID_PATTERN.matcher(trimmed).matches()) {
            return null;
        }
        return trimmed.length() > 100 ? trimmed.substring(0, 100) : trimmed;
    }

    /**
     * 주문 상세 라인.
     *
     * @param productId 재고 batch 조회 키. 사용자 화면 미노출(UUID 비공개).
     * @param lineId 라인 UUID — FE 부분전환 요청(orderLineId) 에 사용. 사용자 화면 미노출.
     * @param modelCode 사용자 표시 모델명.
     * @param productName 품목명.
     * @param categoryKey legacy 품목 카테고리 key.
     * @param quantity 수량.
     * @param deliveryPrice 납품 단가.
     * @param subtotal 라인 소계(VAT 포함 합계 T, 기존 계약 유지).
     * @param supplyAmount 공급가액 S. legacy 주문은 null.
     * @param vatAmount 부가세 V. legacy 주문은 null.
     * @param lineTotal VAT 포함 라인 합계 T (=subtotal).
     * @param authority 저장된 금액 권위. GET에서 S/V 존재만으로 권위를 추측하지 않는다.
     * @param remark 라인 비고.
     * @param convertedQuantity 출고전표로 전환된 누적 수량 (Phase 2.6a). 기본 0.
     * @param bundleMode 번들 처리 방식. 현재 저장 컬럼이 없어 {@code null}.
     * @param productType 품목 유형("SINGLE"/"BUNDLE") — product-service 조회 enrich (Round C #23).
     *        조회 실패(fail-soft) 또는 enrich 미수행 시 {@code null}. FE 재고조회 모달(2.6d)이
     *        "BUNDLE" 라인을 재고조회 대상에서 제외하는 데 사용한다. {@link JsonInclude#NON_NULL}
     *        로 null 이면 직렬화에서 제외(기존 IT 정합).
     * @param expandedComponents 번들 펼침 구성품. 현재 저장 컬럼이 없어 빈 배열.
     */
    public record LineResponse(
            String productId,
            String lineId,
            String modelCode,
            String productName,
            String categoryKey,
            int quantity,
            BigDecimal deliveryPrice,
            BigDecimal subtotal,
            BigDecimal supplyAmount,
            BigDecimal vatAmount,
            BigDecimal lineTotal,
            String authority,
            String remark,
            int convertedQuantity,
            String bundleMode,
            String productType,
            List<ComponentResponse> expandedComponents
    ) {
        /**
         * productType enrich 없이 변환한다(productType=null). 하위 호환 진입점.
         */
        static LineResponse from(PartnerOrderLine line) {
            return from(line, null);
        }

        /**
         * productType 을 enrich 하여 변환한다 (Round C #23 세트 재고 가드).
         *
         * @param line 주문 라인 엔티티
         * @param productType product-service 조회 결과("SINGLE"/"BUNDLE") 또는 {@code null}
         * @return 라인 응답
         */
        static LineResponse from(PartnerOrderLine line, String productType) {
            return new LineResponse(
                    line.getProductId() == null ? null : line.getProductId().toString(),
                    line.getId().toString(),
                    line.getModelName(),
                    line.getProductName(),
                    line.getCategoryKey(),
                    line.getQuantity(),
                    line.getPriceVat(),
                    line.getSubtotal(),
                    line.getSupplyAmount(),
                    line.getVatAmount(),
                    line.getLineTotal(),
                    line.getAmountAuthority() == null ? null : line.getAmountAuthority().name(),
                    line.getRemark(),
                    line.getConvertedQuantity(),
                    null,
                    productType,
                    List.of());
        }
    }

    /**
     * 번들 펼침 구성품 응답. 현재 주문 entity 에는 구성품 snapshot 이 없어 빈 배열로만 사용된다.
     */
    public record ComponentResponse(
            String modelCode,
            String productName,
            int quantity
    ) {
    }
}
