package com.samhanair.logis.inventory.web.dto;

import com.fasterxml.jackson.databind.annotation.JsonDeserialize;
import com.samhanair.logis.inventory.domain.TransferReason;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;
import java.util.List;
import java.util.UUID;

/** 이동전표 생성 요청 + 라인 목록. */
public record CreateTransferRequest(
        @JsonDeserialize(using = OpaqueUuidDeserializer.class)
        @NotNull UUID sourceWarehouseId,
        @JsonDeserialize(using = OpaqueUuidDeserializer.class)
        @NotNull UUID destinationWarehouseId,
        @NotNull TransferReason reason,
        @Size(max = 500) String reasonDetail,
        @NotEmpty @Valid List<TransferLineRequest> lines) {

    /** 이동전표 라인. */
    public record TransferLineRequest(
            @NotNull UUID productId,
            @NotNull @Positive Integer requestedQuantity) {
    }
}
