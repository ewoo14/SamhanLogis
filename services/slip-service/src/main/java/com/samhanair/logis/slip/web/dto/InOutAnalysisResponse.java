package com.samhanair.logis.slip.web.dto;

import java.math.BigDecimal;

/** 입출고 분석 화면에 표시할 모델코드 단위 집계 응답. UUID는 응답에 포함하지 않는다. */
public record InOutAnalysisResponse(
        String modelCode,
        String productName,
        String categoryKey,
        int inboundQuantity,
        int outboundQuantity,
        BigDecimal purchaseAmount,
        BigDecimal salesAmount,
        BigDecimal profitAmount,
        BigDecimal profitRate) {
}
