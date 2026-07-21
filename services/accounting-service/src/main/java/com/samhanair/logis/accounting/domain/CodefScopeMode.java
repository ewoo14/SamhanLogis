package com.samhanair.logis.accounting.domain;

/** CODEF 저장 범위의 명시적 의미. */
public enum CodefScopeMode {
    ALL,
    SELECTED;

    /** 외부 요청 문자열을 도메인 enum으로 변환한다. */
    public static CodefScopeMode parse(String value) {
        if (value == null) {
            throw new IllegalArgumentException("scopeMode 는 필수입니다");
        }
        try {
            return valueOf(value);
        } catch (IllegalArgumentException ex) {
            throw new IllegalArgumentException("scopeMode 는 ALL 또는 SELECTED 이어야 합니다", ex);
        }
    }
}
