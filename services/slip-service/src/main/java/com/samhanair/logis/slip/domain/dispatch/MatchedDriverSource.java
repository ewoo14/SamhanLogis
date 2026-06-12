package com.samhanair.logis.slip.domain.dispatch;

/**
 * 배차 매칭 기사 출처 표준 enum.
 *
 * <p>{@code AROLOGIS} 는 아로로지스 자동/외부 매칭 회신을 대표한다. 타사 수동기입은
 * {@code GYEONGGI_QUICK}, {@code JEONGUK_HWAMUL}, {@code OTHER} 중 하나로 저장해 자유 문자열
 * 저장과 DB CHECK 불일치를 방지한다.
 */
public enum MatchedDriverSource {
    AROLOGIS,
    GYEONGGI_QUICK,
    JEONGUK_HWAMUL,
    OTHER
}
