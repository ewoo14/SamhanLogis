package com.samhanair.logis.inventory.web.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;
import java.util.List;

/**
 * 검수 결과 일괄 저장 요청 — {@code POST /api/v1/inventory/inbound-inspections/{slipId}/inspect}.
 *
 * @param lines 검수 결과 라인 목록 (1건 이상 필수)
 */
public record InboundInspectionRequest(
        @NotEmpty @Valid List<InboundInspectionLineResult> lines
) {
}
