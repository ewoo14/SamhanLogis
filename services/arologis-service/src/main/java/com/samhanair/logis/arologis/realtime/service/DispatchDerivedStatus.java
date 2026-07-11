package com.samhanair.logis.arologis.realtime.service;

import com.samhanair.logis.arologis.domain.StopStatus;
import com.samhanair.logis.arologis.domain.VehicleStop;
import java.util.Collection;
import lombok.Getter;
import lombok.RequiredArgsConstructor;

/**
 * Dispatch 의 derived status — PR-H4b (Phase 12 Step 4b).
 *
 * <p>Dispatch 도메인 자체는 status enum 미보유. 본 PR 의 잠금 정책 적용을 위해 stop 들의 aggregate
 * 로 derived status 를 산출한다 — Dispatch entity 자체는 변경 없이 본 enum 으로 표현.
 *
 * <p>전이 규칙:
 * <ul>
 *   <li>{@link #PLANNED} — 모든 stop 이 PENDING 또는 UNPARSED (배차 진행 전)</li>
 *   <li>{@link #DISPATCHED} — 어떤 stop 이 ARRIVED 또는 DELIVERED 또는 FAILED (진행 중)</li>
 *   <li>{@link #DELIVERED} — 모든 stop 이 DELIVERED 또는 FAILED 또는 UNPARSED (완료)</li>
 * </ul>
 *
 * <p>Stop 0 건 (parsing 미완 / 직접 매뉴얼 입력 직후) → PLANNED.
 */
@Getter
@RequiredArgsConstructor
public enum DispatchDerivedStatus {

    PLANNED("배차 전"),
    DISPATCHED("배차중"),
    DELIVERED("배송완료");

    private final String displayName;

    /**
     * stops 집합으로 derived status 산출.
     *
     * @param stops VehicleStop 집합 (모든 vehicle 의 stop 합)
     * @return derived status
     */
    public static DispatchDerivedStatus from(Collection<? extends VehicleStop> stops) {
        if (stops == null || stops.isEmpty()) {
            return PLANNED;
        }
        boolean anyProgress = false;
        boolean allTerminal = true;
        for (VehicleStop stop : stops) {
            StopStatus s = stop.getStatus();
            if (s == StopStatus.ARRIVED) {
                anyProgress = true;
                allTerminal = false;
            } else if (s == StopStatus.DELIVERED || s == StopStatus.FAILED) {
                anyProgress = true;
            } else if (s == StopStatus.PENDING) {
                allTerminal = false;
            }
            // UNPARSED 는 progress 도 active 도 아님 (라벨 라인)
        }
        if (!anyProgress) {
            return PLANNED;
        }
        return allTerminal ? DELIVERED : DISPATCHED;
    }
}
