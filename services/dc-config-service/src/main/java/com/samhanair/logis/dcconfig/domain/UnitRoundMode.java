package com.samhanair.logis.dcconfig.domain;

/**
 * 단가 반올림 모드 (legacy `applyConfigFromServer` UNIT_ROUND_MODE).
 *
 * <p>{@code calcDcPrice` (mobile) `roundToUnit` 와 1:1 동기화.
 */
public enum UnitRoundMode {
    /** 반올림 — Math.round */
    ROUND,
    /** 내림 — Math.floor */
    FLOOR,
    /** 올림 — Math.ceil */
    CEIL
}
