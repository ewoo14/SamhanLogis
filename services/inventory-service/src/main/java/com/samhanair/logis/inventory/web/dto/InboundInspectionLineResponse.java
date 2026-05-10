package com.samhanair.logis.inventory.web.dto;

import com.samhanair.logis.inventory.domain.InboundInspectionLine;
import java.util.UUID;

/**
 * 검수 라인 응답 DTO — UUID 비공개 가드 준수 (lineId 내부 식별자, modelCode 사용자 노출).
 *
 * @param lineId       InboundInspectionLine 내부 PK (UUID)
 * @param slipLineId   slip-service SlipLine UUID (internal reference)
 * @param modelCode    모델코드 (사용자 노출 식별자)
 * @param productName  제품명 snapshot
 * @param expectedQty  슬립 수량 (검수 기준)
 * @param inspectedQty 실제 검수 수량 (미입력 시 null)
 * @param defectQty    불량 수량 (미입력 시 null)
 * @param defectReason 불량 사유 (없으면 null)
 * @param normalQty    정상 수량 (inspectedQty - defectQty, 미입력 시 0)
 */
public record InboundInspectionLineResponse(
        UUID lineId,
        UUID slipLineId,
        String modelCode,
        String productName,
        int expectedQty,
        Integer inspectedQty,
        Integer defectQty,
        String defectReason,
        int normalQty
) {
    /**
     * InboundInspectionLine 엔티티로부터 응답 DTO 를 생성한다.
     *
     * @param line 영속 상태의 InboundInspectionLine
     * @return InboundInspectionLineResponse
     */
    public static InboundInspectionLineResponse from(InboundInspectionLine line) {
        return new InboundInspectionLineResponse(
                line.getId(),
                line.getSlipLineId(),
                line.getModelCode(),
                line.getProductName(),
                line.getExpectedQty(),
                line.getInspectedQty(),
                line.getDefectQty(),
                line.getDefectReason(),
                line.normalQty()
        );
    }
}
