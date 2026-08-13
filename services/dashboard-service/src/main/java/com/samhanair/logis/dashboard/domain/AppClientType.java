package com.samhanair.logis.dashboard.domain;

/**
 * 앱 버전 정책을 적용할 클라이언트 식별자.
 *
 * <p>{@code DESKTOP}은 기존 등록 데이터와 구버전 삼한 데스크톱 클라이언트의 호환을 위해
 * 삼한 데스크톱의 정본 식별자로 유지한다. {@code WEB}/{@code MOBILE}은 구버전 클라이언트가
 * 보내는 값을 BE 선배포 시에도 수용하기 위한 호환 식별자이며 신규 릴리스 등록에는 사용하지 않는다.
 */
public enum AppClientType {
    DESKTOP,
    SAMHAN_MOBILE,
    SAMHAN_MOBILE_STAFF,
    AROLOGIS_MOBILE,
    SAMHAN_ORDER_WEB,
    SAMHAN_ESTIMATE_WEB,
    SAMHAN_MOBILE_PUBLIC_WEB,
    AROLOGIS_DESKTOP,
    INTERNAL_CHAT_DESKTOP,
    /** 구버전 웹 클라이언트 호환용 식별자. */
    WEB,
    /** 구버전 모바일 클라이언트 호환용 식별자. */
    MOBILE
}
