package com.samhanair.logis.partnerorder.web.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.samhanair.logis.partnerorder.domain.PartnerOrder;
import com.samhanair.logis.partnerorder.domain.PartnerOrderLine;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;

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
        BigDecimal totalAmount,
        String linkedSlipNo,
        LocalDateTime updatedAt,
        String deliveryAddress,
        String siteAddress,
        String contactPhone,
        String dueDate,
        String memo,
        List<LineResponse> lines
) {

    /**
     * Entity 를 상세 DTO 로 변환한다.
     *
     * <p>{@code partnerName} 은 현재 partner-order-service entity 에 컬럼이 없어 {@code null} 로
     * 반환한다. 후속 sub-task (SP-08-4-2 이후) 에서 partner-service lookup 으로 채운다.
     */
    public static PartnerOrderDetailResponse from(PartnerOrder order) {
        return new PartnerOrderDetailResponse(
                order.getOrderNo(),
                order.getPartnerCode(),
                order.getBizCode(),
                null,
                order.getConfirmedAt(),
                order.getStatus().name(),
                order.getTotalAmount(),
                order.getSlipNo(),
                order.getModifiedAt(),
                null,
                null,
                null,
                order.getDueDate() == null ? null : order.getDueDate().toString(),
                order.getMemo(),
                order.getLines().stream().map(LineResponse::from).toList());
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
     * @param subtotal 라인 소계.
     * @param convertedQuantity 출고전표로 전환된 누적 수량 (Phase 2.6a). 기본 0.
     * @param bundleMode 번들 처리 방식. 현재 저장 컬럼이 없어 {@code null}.
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
            int convertedQuantity,
            String bundleMode,
            List<ComponentResponse> expandedComponents
    ) {
        static LineResponse from(PartnerOrderLine line) {
            return new LineResponse(
                    line.getProductId().toString(),
                    line.getId().toString(),
                    line.getModelName(),
                    line.getProductName(),
                    line.getCategoryKey(),
                    line.getQuantity(),
                    line.getPriceVat(),
                    line.getSubtotal(),
                    line.getConvertedQuantity(),
                    null,
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
