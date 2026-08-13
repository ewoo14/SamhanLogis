package com.samhanair.logis.inventory.web.dto;

import com.fasterxml.jackson.databind.annotation.JsonSerialize;
import com.samhanair.logis.inventory.domain.Warehouse;
import com.samhanair.logis.inventory.domain.WarehouseType;
import java.time.LocalDateTime;
import java.util.UUID;

/** 창고 응답. */
public record WarehouseResponse(
        @JsonSerialize(using = OpaqueUuidSerializer.class)
        UUID id,
        String code,
        String name,
        WarehouseType type,
        String address,
        int displayOrder,
        String description,
        LocalDateTime createdAt,
        String createdBy,
        LocalDateTime modifiedAt,
        String modifiedBy) {

    public static WarehouseResponse from(Warehouse w) {
        return new WarehouseResponse(
                w.getId(),
                w.getCode(),
                w.getName(),
                w.getType(),
                w.getAddress(),
                w.getDisplayOrder(),
                w.getDescription(),
                w.getCreatedAt(),
                w.getCreatedBy(),
                w.getModifiedAt(),
                w.getModifiedBy());
    }
}
