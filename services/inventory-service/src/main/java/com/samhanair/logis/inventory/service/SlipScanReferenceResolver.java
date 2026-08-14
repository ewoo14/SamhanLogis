package com.samhanair.logis.inventory.service;

/** 사용자 slipNo를 유효한 전표와 내부 slip id·품목 라인으로 해석하는 포트. */
@FunctionalInterface
public interface SlipScanReferenceResolver {

    /**
     * 전표번호를 검증하고 스캔에 필요한 내부 참조를 반환한다.
     *
     * @param slipNo 사용자 노출 전표번호
     * @return 검증된 전표 참조
     */
    SlipScanReference resolve(String slipNo, StockScanDirection direction);
}
