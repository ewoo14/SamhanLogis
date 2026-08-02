package com.samhanair.logis.partnerauth.service;

/** 거래처코드로 주문·출고 활동을 조회하는 내부 read-only 경계. */
@FunctionalInterface
public interface PartnerActivityReader {

    /** 주문확정 시각과 출고 시각을 조회한다. */
    PartnerActivity read(String partnerCode);
}
