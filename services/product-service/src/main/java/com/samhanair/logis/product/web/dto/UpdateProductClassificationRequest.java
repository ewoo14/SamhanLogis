package com.samhanair.logis.product.web.dto;

import java.util.UUID;
import com.fasterxml.jackson.databind.annotation.JsonDeserialize;

/**
 * 품목별 F1-b 분류 저장 요청.
 *
 * <p>FE 계약: {@code PATCH /api/v1/products/{modelCode}/classification}
 * body = {@code {catLId, catMId, catSId}}.
 * 고정DC율은 인라인 자동저장 전용 {@code PATCH /api/v1/products/{modelCode}/fixed-discount} 로 분리한다.
 */
public record UpdateProductClassificationRequest(
        @JsonDeserialize(using = OpaqueUuidDeserializer.class) UUID catLId,
        @JsonDeserialize(using = OpaqueUuidDeserializer.class) UUID catMId,
        @JsonDeserialize(using = OpaqueUuidDeserializer.class) UUID catSId) {
}
