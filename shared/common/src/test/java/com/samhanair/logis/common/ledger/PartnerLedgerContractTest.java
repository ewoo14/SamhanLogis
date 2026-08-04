package com.samhanair.logis.common.ledger;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.math.BigDecimal;
import java.util.List;
import org.junit.jupiter.api.Test;

class PartnerLedgerContractTest {

    @Test
    void foldsVatIncludedSalesAndPaymentsIntoTheSameClosingBalance() {
        PartnerLedgerContract.Totals totals = PartnerLedgerContract.fold(
                List.of(
                        PartnerLedgerContract.Entry.sale(new BigDecimal("1100")),
                        PartnerLedgerContract.Entry.cashReceipt(new BigDecimal("400"))),
                new BigDecimal("0"));

        assertThat(totals.salesTotal()).isEqualByComparingTo("1100");
        assertThat(totals.paymentTotal()).isEqualByComparingTo("400");
        assertThat(totals.periodDelta()).isEqualByComparingTo("700");
        assertThat(totals.closingBalance()).isEqualByComparingTo("700");
    }

    @Test
    void foldsOpeningBalanceAndFlipsDebitCreditForNegativeMovements() {
        PartnerLedgerContract.Totals totals = PartnerLedgerContract.fold(
                List.of(PartnerLedgerContract.Entry.sale(new BigDecimal("-100"))),
                new BigDecimal("500"));

        assertThat(totals.periodDelta()).isEqualByComparingTo("-100");
        assertThat(totals.closingBalance()).isEqualByComparingTo("400");
        PartnerLedgerContract.Direction direction = PartnerLedgerContract.direction(new BigDecimal("-100"));
        assertThat(direction.debit()).isEqualByComparingTo("0");
        assertThat(direction.credit()).isEqualByComparingTo("100");
    }

    @Test
    void rejectsNormalDocumentWhenItsDirectionDoesNotMatchContract() {
        assertThatThrownBy(() -> new PartnerLedgerContract.Entry(
                PartnerLedgerContract.DocumentType.SALE, new BigDecimal("1100"),
                BigDecimal.ZERO, new BigDecimal("1100")))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new PartnerLedgerContract.Entry(
                PartnerLedgerContract.DocumentType.CASH_RECEIPT, new BigDecimal("400"),
                new BigDecimal("400"), BigDecimal.ZERO))
                .isInstanceOf(IllegalArgumentException.class);
    }
}
