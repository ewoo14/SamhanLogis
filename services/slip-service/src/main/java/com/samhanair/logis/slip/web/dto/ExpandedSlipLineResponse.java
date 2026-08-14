package com.samhanair.logis.slip.web.dto;

import java.math.BigDecimal;
import java.util.UUID;

/** 출고전표 입력 화면에 표시할 서버 전개 구성품. */
public record ExpandedSlipLineResponse(
        UUID productId,
        String modelCode,
        String modelName,
        String name,
        BigDecimal quantity,
        BigDecimal unitPrice,
        String componentKind,
        Boolean setHead,
        String specification) {
}
