package com.samhanair.logis.inventory.web.dto;

import com.fasterxml.jackson.databind.annotation.JsonSerialize;
import com.samhanair.logis.inventory.domain.AuditStatus;
import com.samhanair.logis.inventory.domain.InventoryAudit;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.UUID;

/**
 * 재고 실사 헤더 요약 응답 (목록용).
 *
 * <p>UUID 비공개 원칙 (memory feedback_uuid_no_user_visibility) — id 는 mutation key 전용,
 * 사용자 노출 식별자는 auditNo + warehouseCode + auditDate.
 */
public record AuditResponse(
        @JsonSerialize(using = OpaqueUuidSerializer.class)
        UUID id,
        String auditNo,
        @JsonSerialize(using = OpaqueUuidSerializer.class)
        UUID warehouseId,
        String warehouseCode,
        String warehouseName,
        LocalDate auditDate,
        AuditStatus status,
        BigDecimal totalDiffAmount,
        LocalDateTime startedAt,
        LocalDateTime completedAt,
        LocalDateTime cancelledAt) {

    public static AuditResponse from(InventoryAudit a) {
        return new AuditResponse(
                a.getId(),
                a.getAuditNo(),
                a.getWarehouse().getId(),
                a.getWarehouse().getCode(),
                a.getWarehouse().getName(),
                a.getAuditDate(),
                a.getStatus(),
                a.getTotalDiffAmount(),
                a.getStartedAt(),
                a.getCompletedAt(),
                a.getCancelledAt());
    }
}
