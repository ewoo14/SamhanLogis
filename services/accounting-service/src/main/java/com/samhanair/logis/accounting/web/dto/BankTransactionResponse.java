package com.samhanair.logis.accounting.web.dto;

import com.samhanair.logis.accounting.domain.BankTransaction;
import com.samhanair.logis.accounting.domain.BankTxnSource;
import com.samhanair.logis.accounting.domain.BankTxnType;
import com.samhanair.logis.accounting.domain.MatchStatus;
import com.samhanair.logis.accounting.domain.PartnerMatchSource;
import java.math.BigDecimal;
import java.time.LocalDateTime;

/** 통장 거래 응답. UUID는 노출하지 않고 거래처 표시 식별자와 매칭 근거만 반환한다. */
public record BankTransactionResponse(
        LocalDateTime transactedAt,
        BankTxnType txnType,
        BigDecimal amount,
        BigDecimal balanceAfter,
        String description,
        String counterpartyName,
        String counterpartyAccount,
        String bankAccountLabel,
        BankTxnSource source,
        String externalRef,
        String cardName,
        String approvalId,
        String loanName,
        MatchStatus matchStatus,
        String matchedPartnerCode,
        String matchedBizNo,
        String matchedPartnerName,
        String cashReceiptSlipNo,
        PartnerMatchSource partnerMatchSource,
        String appliedMappingRawName,
        String appliedMappingNormalizedName
) {
    public static BankTransactionResponse of(BankTransaction transaction, PartnerDisplay partner,
                                             String cashReceiptSlipNo) {
        return new BankTransactionResponse(
                transaction.getTransactedAt(),
                transaction.getTxnType(),
                transaction.getAmount(),
                transaction.getBalanceAfter(),
                transaction.getDescription(),
                transaction.getCounterpartyName(),
                transaction.getCounterpartyAccount(),
                transaction.getBankAccountLabel(),
                transaction.getSource(),
                transaction.getExternalRef(),
                transaction.getCardName(),
                transaction.getApprovalId(),
                transaction.getLoanName(),
                transaction.getMatchStatus(),
                partner == null ? null : partner.partnerCode(),
                partner == null ? null : partner.bizNo(),
                partner == null ? null : partner.partnerName(),
                cashReceiptSlipNo,
                transaction.getPartnerMatchSource(),
                transaction.getMatchedMappingRawName(),
                transaction.getMatchedMappingNormalizedName()
        );
    }

    /** API 표시용 거래처 정보. */
    public record PartnerDisplay(String partnerCode, String bizNo, String partnerName) {
    }
}
