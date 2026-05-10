package com.samhanair.logis.inventory.domain;

import lombok.Getter;
import lombok.RequiredArgsConstructor;

/**
 * 입고 검수 상태 — P0-9 검수 UI 슬라이스.
 *
 * <ul>
 *   <li>{@link #PENDING} — 검수 대기. 슬립이 SAVED/CONFIRMED 단계일 때 생성됨.</li>
 *   <li>{@link #COMPLETED} — 검수 완료. 정상 수량이 재고에 반영된 상태.</li>
 *   <li>{@link #CANCELED} — 검수 취소. 재고 반영 없이 종료.</li>
 * </ul>
 */
@Getter
@RequiredArgsConstructor
public enum InspectionStatus {
    PENDING("검수대기"),
    COMPLETED("검수완료"),
    CANCELED("검수취소");

    private final String displayName;
}
