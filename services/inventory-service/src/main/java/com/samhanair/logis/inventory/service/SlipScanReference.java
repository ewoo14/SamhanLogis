package com.samhanair.logis.inventory.service;

import java.util.Set;
import java.util.UUID;

/** slipNo를 내부 전표 참조로 해석한 서버 내부 값. UUID는 외부 요청·응답에 포함하지 않는다. */
public record SlipScanReference(UUID slipId, String slipNo, StockScanDirection direction,
                                String partnerCode, Set<String> productCodes) {

    /** 출고 전표의 내부 스캔 참조를 만든다. */
    public static SlipScanReference outbound(UUID slipId, String slipNo,
                                             String partnerCode, String productCode) {
        return new SlipScanReference(slipId, slipNo, StockScanDirection.OUTBOUND,
                partnerCode, Set.of(productCode));
    }

    /** 입고 전표의 내부 스캔 참조를 만든다. */
    public static SlipScanReference inbound(UUID slipId, String slipNo, String productCode) {
        return new SlipScanReference(slipId, slipNo, StockScanDirection.INBOUND,
                null, Set.of(productCode));
    }
}
