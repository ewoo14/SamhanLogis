package com.samhanair.logis.inventory.web.dto;

import com.fasterxml.jackson.databind.annotation.JsonSerialize;
import com.samhanair.logis.inventory.domain.StockTransfer;
import com.samhanair.logis.inventory.domain.StockTransferLine;
import com.samhanair.logis.inventory.domain.TransferReason;
import com.samhanair.logis.inventory.domain.TransferStatus;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

/** 이동전표 상세 응답 — 헤더 + 라인 목록. */
public record TransferDetailResponse(
        UUID id,
        String transferNo,
        @JsonSerialize(using = OpaqueUuidSerializer.class)
        UUID sourceWarehouseId,
        String sourceWarehouseCode,
        @JsonSerialize(using = OpaqueUuidSerializer.class)
        UUID destinationWarehouseId,
        String destinationWarehouseCode,
        TransferReason reason,
        String reasonDetail,
        TransferStatus status,
        LocalDateTime requestedAt,
        LocalDateTime approvedAt,
        LocalDateTime shippedAt,
        LocalDateTime receivedAt,
        LocalDateTime confirmedAt,
        List<TransferLineResponse> lines) {

    public static TransferDetailResponse from(StockTransfer t) {
        return new TransferDetailResponse(
                t.getId(),
                t.getTransferNo(),
                t.getSourceWarehouse().getId(),
                t.getSourceWarehouse().getCode(),
                t.getDestinationWarehouse().getId(),
                t.getDestinationWarehouse().getCode(),
                t.getReason(),
                t.getReasonDetail(),
                t.getStatus(),
                t.getRequestedAt(),
                t.getApprovedAt(),
                t.getShippedAt(),
                t.getReceivedAt(),
                t.getConfirmedAt(),
                t.getLines().stream().map(TransferLineResponse::from).toList());
    }

    /** 이동전표 라인 응답. */
    public record TransferLineResponse(
            UUID id,
            UUID productId,
            int requestedQuantity,
            int shippedQuantity,
            int receivedQuantity
            ) {

        public static TransferLineResponse from(StockTransferLine line) {
            return new TransferLineResponse(
                    line.getId(),
                    line.getProductId(),
                    line.getRequestedQuantity(),
                    line.getShippedQuantity(),
                    line.getReceivedQuantity()
                    );
        }
    }
}
