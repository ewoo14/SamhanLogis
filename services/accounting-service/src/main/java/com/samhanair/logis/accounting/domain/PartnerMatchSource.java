package com.samhanair.logis.accounting.domain;

/** 거래처 매칭의 provenance. 사용자가 오배정 원인을 추적할 수 있도록 저장한다. */
public enum PartnerMatchSource {
    /** 사용자가 거래 행에서 직접 지정한 매칭. */
    MANUAL,
    /** 학습된 입금자명 매핑으로 자동 적용한 매칭. */
    DEPOSITOR_MAPPING,
    /** 입금자명을 거래처 코드로 해석한 정확일치 매칭. */
    PARTNER_CODE_EXACT
}
