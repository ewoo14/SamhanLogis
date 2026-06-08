package com.samhanair.logis.arologis.domain;

/**
 * 아로로지스 간이 계정과목 유형.
 *
 * <p>단식부기 간이 회계 전용 4분류이다. 복식부기의 차변/대변, 분개, 마감 개념은 사용하지 않는다.
 */
public enum AccountType {

    /** 자산 (예: 현금, 보통예금). */
    ASSET,

    /** 부채 (예: 미지급금). */
    LIABILITY,

    /** 수입 (예: 운송수입). */
    INCOME,

    /** 지출/비용 (예: 급여, 임차료). */
    EXPENSE
}
