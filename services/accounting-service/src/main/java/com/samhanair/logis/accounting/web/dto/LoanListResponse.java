package com.samhanair.logis.accounting.web.dto;

import com.samhanair.logis.accounting.client.LoanInfo;
import java.util.List;

/** 대출 목록 응답. */
public record LoanListResponse(
        List<LoanItem> loans
) {
    public static LoanListResponse from(List<LoanInfo> loans) {
        return new LoanListResponse(loans.stream()
                .map(LoanItem::from)
                .toList());
    }

    /** 대출 표시 항목. */
    public record LoanItem(
            String ref,
            String name,
            String lenderName,
            String loanType
    ) {
        private static LoanItem from(LoanInfo info) {
            return new LoanItem(info.ref(), info.name(), info.lenderName(), info.loanType());
        }
    }
}
