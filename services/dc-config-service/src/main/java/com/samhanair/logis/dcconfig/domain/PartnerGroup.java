package com.samhanair.logis.dcconfig.domain;

/**
 * 거래처 그룹 분류 (legacy "거래처" 시트 group 컬럼 14 enum).
 *
 * <p>DC 룰 priority 산정 + 채권 한도 (creditLimit) + 보고서 분류에 사용.
 * 미분류는 {@link #UNCLASSIFIED}.
 */
public enum PartnerGroup {

    /** 직거래 (대리점 X) */
    DIRECT,
    /** 1차 대리점 */
    DEALER_1ST,
    /** 2차 대리점 */
    DEALER_2ND,
    /** 도매 */
    WHOLESALE,
    /** 인테리어 / 시공 */
    INTERIOR,
    /** 건설사 */
    CONSTRUCTION,
    /** 빌더 / 시행사 */
    BUILDER,
    /** AS / 유지보수 */
    AS,
    /** 온라인 (오픈마켓 포함) */
    ONLINE,
    /** 단순 소매 */
    RETAIL,
    /** 업무 협력 (공동 마케팅 등) */
    PARTNER,
    /** 시공 협력사 (외주) */
    SUBCONTRACTOR,
    /** 기타 */
    ETC,
    /** 미분류 — 시드 누락 / 신규 등록 직후 */
    UNCLASSIFIED
}
