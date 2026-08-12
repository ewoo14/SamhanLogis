package com.samhanair.logis.product.web.dto;

import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.Size;
import java.util.List;
import java.util.UUID;
import com.fasterxml.jackson.databind.annotation.JsonDeserialize;

/** 제품 batch 조회 — 한 번에 최대 100개. */
public record LookupRequest(
        @JsonDeserialize(using = OpaqueUuidListDeserializer.class) @NotEmpty @Size(max = 100) List<UUID> ids) {
}
