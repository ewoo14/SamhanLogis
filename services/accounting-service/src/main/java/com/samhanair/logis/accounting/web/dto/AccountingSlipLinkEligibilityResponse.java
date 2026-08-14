package com.samhanair.logis.accounting.web.dto;

import com.samhanair.logis.accounting.service.AccountingSlipEligibility;
import com.samhanair.logis.accounting.service.AccountingSlipLinkReadModel;
import java.util.List;

/** 회계전표 연결 가능 여부와 사용자 표시용 사유. UUID는 포함하지 않는다. */
public record AccountingSlipLinkEligibilityResponse(
        AccountingSlipLinkReadModel readModel,
        boolean allowed,
        List<String> reasons,
        List<String> reasonMessages) {

    public static AccountingSlipLinkEligibilityResponse of(
            AccountingSlipLinkReadModel readModel, AccountingSlipEligibility eligibility) {
        return new AccountingSlipLinkEligibilityResponse(
                readModel,
                eligibility.allowed(),
                eligibility.reasons().stream().map(Enum::name).toList(),
                eligibility.reasonMessages());
    }
}
