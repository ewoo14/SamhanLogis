package com.samhanair.logis.accounting.web.dto;

import com.samhanair.logis.accounting.service.AccountingSlipEligibility;
import com.samhanair.logis.accounting.service.AccountingSlipLinkReadModel;
import java.util.List;

/** batch 결과. 사용자 식별자는 sourceSlipNo이며 UUID는 포함하지 않는다. */
public record AccountingSlipLinkEligibilityBatchResponse(
        String sourceSlipNo,
        AccountingSlipLinkReadModel readModel,
        boolean allowed,
        List<String> reasons,
        List<String> reasonMessages) {

    public static AccountingSlipLinkEligibilityBatchResponse of(
            AccountingSlipLinkReadModel readModel, AccountingSlipEligibility eligibility) {
        return new AccountingSlipLinkEligibilityBatchResponse(
                readModel == null ? null : readModel.sourceSlipNo(),
                readModel,
                eligibility.allowed(),
                eligibility.reasons().stream().map(Enum::name).toList(),
                eligibility.reasonMessages());
    }
}
