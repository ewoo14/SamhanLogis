package com.samhanair.logis.accounting.web.dto;

/** CODEF 온디맨드 import 대상 구분. */
public enum CodefImportType {
    /** 요청에 포함된 계좌/카드/대출 ref 를 모두 조회한다. */
    ALL,
    /** 법인계좌 거래내역만 조회한다. */
    BANK,
    /** 법인카드 승인내역만 조회한다. */
    CARD,
    /** 대출 거래내역만 조회한다. */
    LOAN
}
