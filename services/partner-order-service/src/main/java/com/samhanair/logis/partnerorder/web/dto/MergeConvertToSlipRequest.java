package com.samhanair.logis.partnerorder.web.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import java.util.List;
import java.util.UUID;

/**
 * 다중 주문 병합 전환 요청 — Phase 2.6b D2.
 *
 * <p>{@code POST /api/v1/partner-orders/convert-to-slip-merge} 본문.
 * 여러 주문의 선택 라인을 단일 출고전표로 병합 발행한다. 모든 주문은 같은 거래처여야 한다.
 *
 * <p>shippingInfo 는 FE 가 충돌 헤더를 '/' 병기/선택 확정한 최종값.
 * BE 는 partnerCode 동일성만 검증하며, 헤더 내용은 그대로 저장한다(D-MRG-03).
 */
public record MergeConvertToSlipRequest(
        @NotNull @NotEmpty @Valid List<OrderItems> orders,
        @NotBlank(message = "창고 코드는 필수입니다. warehouseCode 를 명시적으로 지정하세요.")
        String warehouseCode,
        @Valid ShippingInfo shippingInfo) {

    /**
     * 주문 1건 + 선택 라인들.
     *
     * @param partnerOrderId 주문번호 또는 UUID 식별자.
     *                       FE 는 UUID 비공개 원칙({@code feedback_uuid_no_user_visibility})에 따라
     *                       주문번호({@code orderNo}, 예: {@code 2026/05/31-1}) 를 전송한다.
     *                       서버 내부에서 {@link com.samhanair.logis.partnerorder.util.PartnerOrderIdResolver}
     *                       를 통해 주문번호 또는 UUID 모두 허용하므로 기존 UUID 전달도 유효하다.
     * @param items 선택 라인 목록 (1개 이상)
     */
    public record OrderItems(
            @NotNull String partnerOrderId,
            @NotNull @NotEmpty @Valid List<Item> items) {}

    /**
     * 라인별 전환 항목.
     *
     * @param orderLineId 주문 라인 UUID
     * @param quantity 전환 수량 (1 이상)
     */
    public record Item(
            @NotNull UUID orderLineId,
            @NotNull @Min(1) Integer quantity) {}

    /**
     * FE 확정 병합 헤더 — 모두 optional.
     * FE 가 주문별 충돌 헤더를 라디오 선택 또는 '/' 병기로 최종 확정하여 전송한다.
     *
     * @param partnerName 거래처명
     * @param shippingAddress 배송지 (여러 주문 충돌 시 '/' 병기 허용)
     * @param deliveryAddress 구조화된 실제 배송주소. 없으면 주문 snapshot에서 단일 값만 자동 전달
     * @param receiverPhone 수령인 전화
     * @param paymentDueLabel 납기/결제조건 라벨
     * @param discountInfo 할인 정보
     * @param memo 메모
     */
    public record ShippingInfo(
            String partnerName,
            String shippingAddress,
            String deliveryAddress,
            String receiverPhone,
            String paymentDueLabel,
            String discountInfo,
            String memo) {

        /** 기존 shippingInfo 6개 인자 계약 호환. */
        public ShippingInfo(String partnerName, String shippingAddress, String receiverPhone,
                            String paymentDueLabel, String discountInfo, String memo) {
            this(partnerName, shippingAddress, null, receiverPhone, paymentDueLabel,
                    discountInfo, memo);
        }
    }
}
