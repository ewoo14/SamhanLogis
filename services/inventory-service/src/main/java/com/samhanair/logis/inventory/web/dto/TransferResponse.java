package com.samhanair.logis.inventory.web.dto;

import com.fasterxml.jackson.databind.annotation.JsonSerialize;
import com.samhanair.logis.inventory.domain.StockTransfer;
import com.samhanair.logis.inventory.domain.TransferReason;
import com.samhanair.logis.inventory.domain.TransferStatus;
import java.time.LocalDateTime;
import java.util.UUID;

/** 이동전표 헤더 요약 응답 (목록용). */
public record TransferResponse(
        UUID id,
        String transferNo,
        @JsonSerialize(using = OpaqueUuidSerializer.class)
        UUID sourceWarehouseId,
        String sourceWarehouseCode,
        @JsonSerialize(using = OpaqueUuidSerializer.class)
        UUID destinationWarehouseId,
        String destinationWarehouseCode,
        TransferReason reason,
        TransferStatus status,
        String requesterId,
        String approverId,
        LocalDateTime requestedAt,
        LocalDateTime approvedAt,
        LocalDateTime shippedAt,
        LocalDateTime receivedAt,
        LocalDateTime confirmedAt) {

    public static TransferResponse from(StockTransfer t) {
        return new TransferResponse(
                t.getId(),
                t.getTransferNo(),
                t.getSourceWarehouse().getId(),
                t.getSourceWarehouse().getCode(),
                t.getDestinationWarehouse().getId(),
                t.getDestinationWarehouse().getCode(),
                t.getReason(),
                t.getStatus(),
                t.getRequesterId(),
                t.getApproverId(),
                t.getRequestedAt(),
                t.getApprovedAt(),
                t.getShippedAt(),
                t.getReceivedAt(),
                t.getConfirmedAt());
    }
}
