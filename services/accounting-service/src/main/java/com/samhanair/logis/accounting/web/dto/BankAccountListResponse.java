package com.samhanair.logis.accounting.web.dto;

import com.samhanair.logis.accounting.client.AccountInfo;
import java.util.List;

/** 은행계좌 목록 응답. */
public record BankAccountListResponse(
        List<AccountItem> accounts
) {
    public static BankAccountListResponse from(List<AccountInfo> accounts) {
        return new BankAccountListResponse(accounts.stream()
                .map(AccountItem::from)
                .toList());
    }

    /** 은행계좌 표시 항목. */
    public record AccountItem(
            String ref,
            String name,
            String bankName,
            String accountNumber
    ) {
        private static AccountItem from(AccountInfo info) {
            return new AccountItem(info.ref(), info.name(), info.bankName(), info.accountNumber());
        }
    }
}
