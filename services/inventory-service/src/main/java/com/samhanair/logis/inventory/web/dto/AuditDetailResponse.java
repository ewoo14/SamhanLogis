package com.samhanair.logis.inventory.web.dto;

import com.fasterxml.jackson.databind.annotation.JsonSerialize;
import com.samhanair.logis.inventory.domain.AuditStatus;
import com.samhanair.logis.inventory.domain.InventoryAudit;
import com.samhanair.logis.inventory.domain.InventoryAuditLine;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

/**
 * 재고 실사 상세 응답 — 헤더 + 라인 목록.
 *
 * <p>라인의 productId 는 mutation key 로만 사용. 사용자 화면 표시 식별자는 productName (snapshot).
 */
public record AuditDetailResponse(
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
        LocalDateTime cancelledAt,
        List<AuditLineResponse> lines) {

    public static AuditDetailResponse from(InventoryAudit a) {
        return new AuditDetailResponse(
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
                a.getCancelledAt(),
                a.getLines().stream().map(AuditLineResponse::from).toList());
    }

    /** 재고 실사 라인 응답. */
    public record AuditLineResponse(
            UUID id,
            UUID productId,
            String productName,
            int expectedQty,
            Integer actualQty,
            int diffQty,
            BigDecimal unitCost,
            BigDecimal diffAmount,
            boolean barcodeScanned,
            LocalDateTime scannedAt) {

        public static AuditLineResponse from(InventoryAuditLine line) {
            return new AuditLineResponse(
                    line.getId(),
                    line.getProductId(),
                    line.getProductName(),
                    line.getExpectedQty(),
                    line.getActualQty(),
                    line.getDiffQty(),
                    line.getUnitCost(),
                    line.getDiffAmount(),
                    line.isBarcodeScanned(),
                    line.getScannedAt());
        }
    }
}
