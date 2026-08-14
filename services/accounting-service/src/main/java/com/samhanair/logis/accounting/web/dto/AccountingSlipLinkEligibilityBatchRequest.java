package com.samhanair.logis.accounting.web.dto;

import java.util.List;

/** 화면별 N+1을 막는 회계전표 연결 eligibility batch 요청. UUID 원문은 받지 않는다. */
public record AccountingSlipLinkEligibilityBatchRequest(
        List<Item> items,
        boolean dailyAmountVerified) {

    public record Item(String sourceSlipIdToken, String sourceSlipNo, String sourceSlipType) { }
}
