package com.samhanair.logis.accounting.web.dto;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

/**
 * 거래처 원장 snapshot 복원 응답.
 *
 * <p>신규 snapshot은 화면 read 계약의 documents를 사용하고, 기존 snapshot은
 * legacy 분개 line을 사용한다. 두 payload를 하나의 복원 응답으로 감싸 기존 이력도
 * 사용자 화면에서 계속 열 수 있게 한다.
 */
public record LedgerSnapshotResponse(
        String partnerCode,
        String partnerName,
        String partnerBusinessNo,
        List<String> chatRoomNames,
        LocalDate periodFrom,
        LocalDate periodTo,
        BigDecimal openingBalance,
        BigDecimal salesTotal,
        BigDecimal paymentTotal,
        BigDecimal closingBalance,
        BigDecimal adjustmentTotal,
        List<PartnerLedgerResponse.Document> documents,
        List<LedgerImageResponse.LedgerLine> lines) {

    public LedgerSnapshotResponse {
        chatRoomNames = chatRoomNames == null ? List.of() : List.copyOf(chatRoomNames);
        documents = documents == null ? List.of() : List.copyOf(documents);
        lines = lines == null ? List.of() : List.copyOf(lines);
        openingBalance = openingBalance == null ? BigDecimal.ZERO : openingBalance;
        salesTotal = salesTotal == null ? BigDecimal.ZERO : salesTotal;
        paymentTotal = paymentTotal == null ? BigDecimal.ZERO : paymentTotal;
        closingBalance = closingBalance == null ? BigDecimal.ZERO : closingBalance;
        adjustmentTotal = adjustmentTotal == null ? BigDecimal.ZERO : adjustmentTotal;
    }

    /** 화면 GET과 같은 read model payload를 복원 응답으로 투영한다. */
    public static LedgerSnapshotResponse fromPartnerLedger(PartnerLedgerResponse ledger) {
        return new LedgerSnapshotResponse(ledger.partnerCode(), ledger.partnerName(),
                ledger.partnerBusinessNo(), List.of(), ledger.periodFrom(), ledger.periodTo(),
                ledger.openingBalance(), ledger.salesTotal(), ledger.paymentTotal(), ledger.closingBalance(),
                ledger.adjustmentTotal(),
                ledger.documents(), List.of());
    }

    /** 기존 LedgerImageResponse payload를 손실 없이 복원 응답으로 투영한다. */
    public static LedgerSnapshotResponse fromLegacy(LedgerImageResponse ledger) {
        return new LedgerSnapshotResponse(ledger.partnerCode(), ledger.partnerName(),
                ledger.partnerBusinessNo(), ledger.chatRoomNames(), ledger.periodFrom(),
                ledger.periodTo(), BigDecimal.ZERO, BigDecimal.ZERO, BigDecimal.ZERO, BigDecimal.ZERO,
                BigDecimal.ZERO,
                List.of(), ledger.lines());
    }

    /** 화면이 documents를 line으로 펼칠 때와 같은 이력 행 수를 계산한다. */
    public static int lineCount(PartnerLedgerResponse ledger) {
        return ledger.documents().stream()
                .mapToInt(document -> "SALE".equals(document.type()) && !document.lines().isEmpty()
                        ? document.lines().size() : 1)
                .sum();
    }
}
