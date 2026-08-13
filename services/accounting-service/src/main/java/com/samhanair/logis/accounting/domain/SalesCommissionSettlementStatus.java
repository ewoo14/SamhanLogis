package com.samhanair.logis.accounting.domain;

/** 영업수수료 정산서 상태. */
public enum SalesCommissionSettlementStatus {
    /** 작성 중인 정산서. 문서번호를 아직 발급하지 않는다. */
    DRAFT,
    /** 정산 기준일의 문서번호를 발급한 확정 정산서. */
    CONFIRMED
}
