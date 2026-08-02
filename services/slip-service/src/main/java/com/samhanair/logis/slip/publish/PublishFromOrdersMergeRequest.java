package com.samhanair.logis.slip.publish;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.List;
import java.util.UUID;

/**
 * 다중 주문 → 단일 출고전표 병합 발행 요청 — Phase 2.6b D2.
 *
 * <p>endpoint: {@code POST /api/v1/slips/from-orders-merge}
 *
 * <p>{@link PublishFromPartnerOrderRequest} 와 헤더 매핑은 동일하나 차이점:
 * <ul>
 *   <li>단일 {@code partnerOrderId} 대신 {@code sourceOrders} 목록(N:1) —
 *       {@code slip_source_orders} 테이블(V30) 에 기록</li>
 *   <li>{@code partnerId} 는 병합 판정이 끝난 거래처 내부 UUID이며 전표 정체성으로 저장한다</li>
 *   <li>{@code partnerCode} 는 표시용 snapshot이며 UUID 해석/대체키로 사용하지 않는다</li>
 *   <li>헤더(shippingAddress/receiverPhone/paymentDueLabel/discountInfo/memo)는
 *       호출자가 '/' 병기 확정한 최종값을 그대로 저장 (D-MRG-03)</li>
 * </ul>
 *
 * @param sourceOrders    출처 주문 목록 — 최소 1건 이상, slip_source_orders N행 기록용
 * @param ioDate          출고일 (yyyyMMdd, null 이면 서버 today)
 * @param partnerId       병합 판정이 확정한 거래처 내부 UUID (필수, 사용자 표시 금지)
 * @param partnerCode     거래처 코드
 * @param partnerName     거래처명
 * @param employeeCode    담당 직원 코드
 * @param warehouseCode   출고 창고 코드 (필수)
 * @param warehouseId     창고 UUID (inventory by-code 해석 결과, 있으면 우선 사용)
 * @param shippingAddress 배송지 (FE 확정 병기값)
 * @param receiverPhone   수령인 연락처
 * @param memo            비고 (사용자 자유 입력)
 * @param paymentDueLabel 결제 기한 레이블
 * @param discountInfo    할인 정보
 * @param lines           출고 라인 목록 (최소 1건)
 */
public record PublishFromOrdersMergeRequest(
        @NotEmpty @Valid List<SourceOrderRef> sourceOrders,
        String ioDate,
        @NotNull UUID partnerId,
        @Size(max = 100) String partnerCode,
        @Size(max = 20) String bizCode,
        @Size(max = 100) String partnerName,
        @Size(max = 50) String employeeCode,
        @NotBlank @Size(max = 50) String warehouseCode,
        @Size(max = 36) String warehouseId,
        @Size(max = 500) String shippingAddress,
        @Size(max = 500) String deliveryAddress,
        @Size(max = 100) String receiverPhone,
        @Size(max = 500) String memo,
        @Size(max = 200) String paymentDueLabel,
        @Size(max = 200) String discountInfo,
        @NotEmpty @Valid List<PublishLineRequest> lines) {

    /** bizCode 도입 전 호출부·fixture 호환 생성자. */
    public PublishFromOrdersMergeRequest(
            List<SourceOrderRef> sourceOrders, String ioDate, UUID partnerId,
            String partnerCode, String partnerName, String employeeCode,
            String warehouseCode, String warehouseId, String shippingAddress,
            String deliveryAddress, String receiverPhone, String memo,
            String paymentDueLabel, String discountInfo, List<PublishLineRequest> lines) {
        this(sourceOrders, ioDate, partnerId, partnerCode, null, partnerName, employeeCode,
                warehouseCode, warehouseId, shippingAddress, deliveryAddress, receiverPhone,
                memo, paymentDueLabel, discountInfo, lines);
    }
}
