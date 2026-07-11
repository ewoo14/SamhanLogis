package com.samhanair.logis.inventory.domain;

import lombok.Getter;
import lombok.RequiredArgsConstructor;

/**
 * 개별시리얼 인스턴스 상태 — soft delete 대신 status 전이로 이력 보존 (Phase INV-S S1).
 *
 * <ul>
 *   <li>{@link #AVAILABLE} — 입고 후 가용 상태. FIFO 소진 대상.</li>
 *   <li>{@link #RESERVED} — 예약(2.6c 수량 reserve 통합은 후속 슬라이스).</li>
 *   <li>{@link #SHIPPED} — 출고 완료. 출고처(거래처/전표) 기록됨.</li>
 *   <li>{@link #RECALLED} — 회수됨(반품/회차 역-FIFO, S4 연동 시 구현).</li>
 * </ul>
 */
@Getter
@RequiredArgsConstructor
public enum StockInstanceStatus {
    /** 입고 후 가용 상태 — FIFO 소진 대상 */
    AVAILABLE("가용"),
    /** 예약 상태 — 2.6c 통합 후속 */
    RESERVED("예약"),
    /** 출고 완료 — 출고처 기록 포함 */
    SHIPPED("출고완료"),
    /** 회수됨 — 반품/회차 역-FIFO (S4 연동) */
    RECALLED("회수완료");

    private final String displayName;
}
