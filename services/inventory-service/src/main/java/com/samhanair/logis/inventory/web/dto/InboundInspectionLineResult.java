package com.samhanair.logis.inventory.web.dto;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import java.util.UUID;

/**
 * 검수 결과 라인 1건 — {@link InboundInspectionRequest} 의 lines 요소.
 *
 * @param lineId       대상 InboundInspectionLine UUID (inventory-service 내부 PK)
 * @param inspectedQty 실제 검수 수량 (0 이상)
 * @param defectQty    불량 수량 (0 이상, inspectedQty 이하 — 도메인 레이어 검증)
 * @param defectReason 불량 사유 (defectQty > 0 이면 권장, 최대 500자)
 */
public record InboundInspectionLineResult(
        @NotNull UUID lineId,
        @Min(0) int inspectedQty,
        @Min(0) int defectQty,
        String defectReason
) {
}
