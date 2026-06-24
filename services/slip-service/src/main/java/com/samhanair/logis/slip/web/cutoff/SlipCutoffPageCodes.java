package com.samhanair.logis.slip.web.cutoff;

/**
 * 출고 마감시각 설정 동적 권한 page-code 상수.
 *
 * <p>auth-service {@code PageCode.HR_SLIP_CUTOFF} 와 동일한 문자열을 유지해야 한다.
 * FE {@code canAccess('hr.slip-cutoff', action)} 과도 정확히 일치해야 한다
 * (feedback_fe_canaccess_pagecode_be_match 가드).
 */
public final class SlipCutoffPageCodes {

    /** 출고 마감시간 설정 page-code. */
    public static final String HR_SLIP_CUTOFF = "hr.slip-cutoff";

    private SlipCutoffPageCodes() {
    }
}
