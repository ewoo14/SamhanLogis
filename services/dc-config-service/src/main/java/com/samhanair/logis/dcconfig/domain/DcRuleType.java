package com.samhanair.logis.dcconfig.domain;

/**
 * DcRule 적용 방식.
 *
 * <ul>
 *   <li>{@link #GLOBAL_RATE} — 전체에 % 차감 (partner=NULL 이면 모든 거래처 공통)</li>
 *   <li>{@link #FIXED_AMOUNT} — 정액 차감</li>
 *   <li>{@link #MODEL_PREFIX} — 모델 코드 prefix 매칭 (예: "AJ040" 시작)</li>
 *   <li>{@link #CATEGORY} — 카테고리 단위 (HOMEMULTI / COMMERCIAL_MULTI 등)</li>
 * </ul>
 */
public enum DcRuleType {
    GLOBAL_RATE,
    FIXED_AMOUNT,
    MODEL_PREFIX,
    CATEGORY
}
