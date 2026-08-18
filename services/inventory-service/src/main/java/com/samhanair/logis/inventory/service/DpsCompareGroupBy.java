package com.samhanair.logis.inventory.service;

/**
 * DPS 입고 비교의 매칭 단위 — query parameter {@code groupBy} 값.
 *
 * <ul>
 *   <li>{@link #SLIP} — legacy GAS 1번 (DPS 입고기록 비교) — 입고전표 라인 단위 1:1 매칭.
 *       매칭 키 = (slipNo + productCode). 거래처 불일치 카테고리 가능.</li>
 *   <li>{@link #ITEM} — legacy GAS 16번 (품목별 DPS 입고내역 비교) — productCode 단위 합계 비교.
 *       매칭 키 = productCode. 거래처/슬립 식별자 비교 안 함.</li>
 * </ul>
 */
public enum DpsCompareGroupBy {
    SLIP,
    ITEM
}
