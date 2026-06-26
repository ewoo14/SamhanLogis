package com.samhanair.logis.accounting.web.dto;

import com.samhanair.logis.accounting.domain.BankTransaction;
import com.samhanair.logis.accounting.domain.BankTxnSource;
import com.samhanair.logis.accounting.domain.BankTxnType;
import com.samhanair.logis.accounting.domain.MatchStatus;
import java.math.BigDecimal;
import java.time.LocalDateTime;

/** 통장 거래 응답. UUID 는 노출하지 않고 externalRef/거래처 표시 식별자만 반환한다. */
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
        MatchStatus matchStatus,
        String matchedPartnerCode,
        String matchedBizNo,
        String matchedPartnerName
) {
    public static BankTransactionResponse of(BankTransaction transaction, PartnerDisplay partner) {
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
                transaction.getMatchStatus(),
                partner == null ? null : partner.partnerCode(),
                partner == null ? null : partner.bizNo(),
                partner == null ? null : partner.partnerName()
        );
    }

    /** API 표시용 거래처 정보. */
    public record PartnerDisplay(String partnerCode, String bizNo, String partnerName) {
    }
}
