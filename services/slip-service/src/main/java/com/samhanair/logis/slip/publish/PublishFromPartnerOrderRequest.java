package com.samhanair.logis.slip.publish;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.Size;
import java.util.List;

/**
 * Phase 6 M5 (slip-service-integration) — partner-order-service M4 의 협력사 주문 승인 →
 * 출고전표 발행 요청.
 *
 * <p>endpoint: {@code POST /api/v1/slips/from-partner-order}
 *
 * <p>호출자: partner-order-service M4 의 SlipServiceClient (별도 PR — 본 슬라이스에서는 endpoint
 * 만 노출).
 *
 * <p>설계 §3 헤더 매핑은 estimate 와 거의 동일하지만 차이점:
 * <ul>
 *   <li>{@code partnerOrderId} (UUID 문자열) → {@code Slip.sourceId}</li>
 *   <li>{@code orderApprovedAt} (선택) → 메모에 prepend 할 정보 (서비스 레이어 결정)</li>
 *   <li>나머지 필드는 estimate 와 동일 — partner-order-service 가 이미 매핑 변환을 마친 상태로 호출</li>
 *   <li>{@code warehouseId} (UUID, 선택) — partner-order convert 가 inventory by-code 로 해석한
 *       창고 UUID. 존재 시 yml 매핑 미경유로 직접 사용. 없으면 warehouseCode 를 WarehouseCodeMapper 폴백 해석.</li>
 * </ul>
 */
public record PublishFromPartnerOrderRequest(
        @NotBlank @Size(max = 64) String partnerOrderId,
        @Size(max = 64) String orderNo,
        String ioDate,
        @Size(max = 100) String partnerCode,
        @NotBlank @Size(max = 20) String bizCode,
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
        String orderApprovedAt,
        @NotEmpty @Valid List<PublishLineRequest> lines) {

    /** bizCode 도입 전 호출부·fixture 호환 생성자. */
    public PublishFromPartnerOrderRequest(
            String partnerOrderId, String ioDate, String partnerCode, String partnerName,
            String employeeCode, String warehouseCode, String warehouseId,
            String shippingAddress, String deliveryAddress, String receiverPhone,
            String memo, String paymentDueLabel, String discountInfo,
            String orderApprovedAt, List<PublishLineRequest> lines) {
        this(partnerOrderId, null, ioDate, partnerCode, null, partnerName, employeeCode, warehouseCode,
                warehouseId, shippingAddress, deliveryAddress, receiverPhone, memo,
                paymentDueLabel, discountInfo, orderApprovedAt, lines);
    }
}
