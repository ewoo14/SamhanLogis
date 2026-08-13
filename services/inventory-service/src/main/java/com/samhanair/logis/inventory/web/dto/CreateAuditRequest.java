package com.samhanair.logis.inventory.web.dto;

import com.fasterxml.jackson.databind.annotation.JsonDeserialize;
import jakarta.validation.constraints.NotNull;
import java.time.LocalDate;
import java.util.UUID;

/**
 * 재고 실사 신규 등록 요청 — POST /inventory/audits.
 *
 * <p>warehouseId 의 모든 활성 stock_balance 를 snapshot 라인으로 자동 생성. PLANNED 상태로 시작.
 *
 * @param warehouseId 대상 창고 UUID (필수)
 * @param auditDate   실사 기준 일자 (필수)
 */
public record CreateAuditRequest(
        @JsonDeserialize(using = OpaqueUuidDeserializer.class)
        @NotNull(message = "warehouseId 는 필수입니다") UUID warehouseId,
        @NotNull(message = "auditDate 는 필수입니다") LocalDate auditDate) {
}
