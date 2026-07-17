package com.samhanair.logis.accounting.domain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.UUID;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/** BankTransaction 회계 반영/통장연계 전이 단위 테스트. */
class BankTransactionDomainTest {

    @Test
    @DisplayName("linkCashReceipt — UNREFLECTED 거래를 REFLECTED 로 전환하고 journal/receipt 링크를 저장한다")
    void linkCashReceiptReflectsAndLinksReceipt() {
        BankTransaction transaction = deposit();
        UUID receiptId = UUID.randomUUID();
        UUID journalId = UUID.randomUUID();

        transaction.linkCashReceipt(receiptId, journalId);

        assertThat(transaction.getMatchStatus()).isEqualTo(MatchStatus.REFLECTED);
        assertThat(transaction.getMatchedJournalId()).isEqualTo(journalId);
        assertThat(transaction.getCashReceiptId()).isEqualTo(receiptId);
    }

    @Test
    @DisplayName("unlinkCashReceipt — 통장연계 취소 시 UNREFLECTED 로 되돌리고 링크를 제거한다")
    void unlinkCashReceiptClearsReceiptAndJournalLink() {
        BankTransaction transaction = deposit()
                .linkCashReceipt(UUID.randomUUID(), UUID.randomUUID());

        transaction.unlinkCashReceipt();

        assertThat(transaction.getMatchStatus()).isEqualTo(MatchStatus.UNREFLECTED);
        assertThat(transaction.getMatchedJournalId()).isNull();
        assertThat(transaction.getCashReceiptId()).isNull();
    }

    @Test
    @DisplayName("markReflected 기존 시그니처는 receipt 링크 없이 분개 반영만 수행한다")
    void markReflectedKeepsReceiptLinkEmpty() {
        BankTransaction transaction = deposit();
        UUID journalId = UUID.randomUUID();

        transaction.markReflected(journalId);

        assertThat(transaction.getMatchStatus()).isEqualTo(MatchStatus.REFLECTED);
        assertThat(transaction.getMatchedJournalId()).isEqualTo(journalId);
        assertThat(transaction.getCashReceiptId()).isNull();
    }

    @Test
    @DisplayName("linkCashReceipt 는 receiptId null 을 거부한다")
    void linkCashReceiptRejectsNullReceiptId() {
        assertThatThrownBy(() -> deposit().linkCashReceipt(null, UUID.randomUUID()))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("receiptId");
    }

    private static BankTransaction deposit() {
        return BankTransaction.importRow(
                LocalDateTime.of(2026, 7, 4, 9, 0),
                BankTxnType.DEPOSIT,
                new BigDecimal("10000.00"),
                null,
                "통장연계 테스트",
                "거래처",
                null,
                "테스트계좌",
                BankTxnSource.CSV_IMPORT,
                "DOMAIN-BANK-001");
    }

    @Test
    @DisplayName("매칭 provenance는 출처·매핑 근거를 저장하고 clearPartner가 함께 해제한다")
    void storesAndClearsPartnerProvenance() {
        UUID partnerId = UUID.randomUUID();
        UUID mappingId = UUID.randomUUID();
        BankTransaction transaction = deposit()
                .applyPartnerMatch(partnerId, PartnerMatchSource.DEPOSITOR_MAPPING, mappingId,
                        null, "SYSTEM", "원본 거래처", "원본 거래처");

        assertThat(transaction.getPartnerMatchSource()).isEqualTo(PartnerMatchSource.DEPOSITOR_MAPPING);
        assertThat(transaction.getMatchedMappingId()).isEqualTo(mappingId);
        assertThat(transaction.getMatchedMappingRawName()).isEqualTo("원본 거래처");

        transaction.clearPartner();

        assertThat(transaction.getMatchedPartnerId()).isNull();
        assertThat(transaction.getPartnerMatchSource()).isNull();
        assertThat(transaction.getMatchedMappingId()).isNull();
        assertThat(transaction.getMatchedMappingRawName()).isNull();
    }
}
