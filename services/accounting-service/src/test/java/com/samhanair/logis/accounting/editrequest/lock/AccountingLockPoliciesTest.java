package com.samhanair.logis.accounting.editrequest.lock;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.samhanair.logis.accounting.domain.CashReceiptStatus;
import com.samhanair.logis.accounting.domain.JournalStatus;
import com.samhanair.logis.accounting.domain.PeriodStatus;
import com.samhanair.logis.accounting.domain.TaxInvoiceStatus;
import com.samhanair.logis.shared.realtime.lock.DefaultEditLockGuard;
import com.samhanair.logis.shared.realtime.lock.EditLockGuard;
import com.samhanair.logis.shared.realtime.lock.LockedException;
import org.junit.jupiter.api.Test;

/**
 * PR-H4b BE-A — AccountingLockPolicies × DefaultEditLockGuard 통합 단위 테스트.
 *
 * <p>4개 도메인 (TaxInvoice / Journal / AccountingPeriod / CashReceipt) 의 잠금 분기 검증.
 */
class AccountingLockPoliciesTest {

    private final EditLockGuard guard = new DefaultEditLockGuard();

    @Test
    void taxInvoice_DRAFT_isFree() {
        guard.guardCanEdit(TaxInvoiceStatus.DRAFT, AccountingLockPolicies.TAX_INVOICE, false);
        // no throw
    }

    @Test
    void taxInvoice_ISSUED_throwsWithoutApproval() {
        assertThatThrownBy(() -> guard.guardCanEdit(TaxInvoiceStatus.ISSUED,
                AccountingLockPolicies.TAX_INVOICE, false))
                .isInstanceOf(LockedException.class);
    }

    @Test
    void taxInvoice_ISSUED_passesWithApproval() {
        guard.guardCanEdit(TaxInvoiceStatus.ISSUED, AccountingLockPolicies.TAX_INVOICE, true);
        // no throw
    }

    @Test
    void taxInvoice_CANCELLED_throwsAsTerminal() {
        assertThatThrownBy(() -> guard.guardCanDelete(TaxInvoiceStatus.CANCELLED,
                AccountingLockPolicies.TAX_INVOICE, true))
                .isInstanceOf(LockedException.class);
    }

    @Test
    void journal_DRAFT_isFree_POSTED_locked_REVERSED_terminal() {
        guard.guardCanEdit(JournalStatus.DRAFT, AccountingLockPolicies.JOURNAL, false);
        assertThatThrownBy(() -> guard.guardCanEdit(JournalStatus.POSTED,
                AccountingLockPolicies.JOURNAL, false)).isInstanceOf(LockedException.class);
        guard.guardCanEdit(JournalStatus.POSTED, AccountingLockPolicies.JOURNAL, true);
        assertThatThrownBy(() -> guard.guardCanEdit(JournalStatus.REVERSED,
                AccountingLockPolicies.JOURNAL, true)).isInstanceOf(LockedException.class);
    }

    @Test
    void accountingPeriod_OPEN_free_CLOSED_locked() {
        guard.guardCanEdit(PeriodStatus.OPEN, AccountingLockPolicies.ACCOUNTING_PERIOD, false);
        assertThatThrownBy(() -> guard.guardCanEdit(PeriodStatus.CLOSED,
                AccountingLockPolicies.ACCOUNTING_PERIOD, false)).isInstanceOf(LockedException.class);
        guard.guardCanEdit(PeriodStatus.CLOSED, AccountingLockPolicies.ACCOUNTING_PERIOD, true);
    }

    @Test
    void cashReceipt_DRAFT_free_CONFIRMED_locked_CANCELLED_terminal() {
        guard.guardCanEdit(CashReceiptStatus.DRAFT, AccountingLockPolicies.CASH_RECEIPT, false);
        assertThatThrownBy(() -> guard.guardCanEdit(CashReceiptStatus.CONFIRMED,
                AccountingLockPolicies.CASH_RECEIPT, false)).isInstanceOf(LockedException.class);
        guard.guardCanEdit(CashReceiptStatus.CONFIRMED, AccountingLockPolicies.CASH_RECEIPT, true);
        assertThatThrownBy(() -> guard.guardCanEdit(CashReceiptStatus.CANCELLED,
                AccountingLockPolicies.CASH_RECEIPT, true)).isInstanceOf(LockedException.class);
    }

    @Test
    void taxInvoicePolicy_categoriesAreCorrect() {
        assertThat(AccountingLockPolicies.TAX_INVOICE.isFree(TaxInvoiceStatus.DRAFT)).isTrue();
        assertThat(AccountingLockPolicies.TAX_INVOICE.isLockedRequiresApproval(TaxInvoiceStatus.ISSUED))
                .isTrue();
        assertThat(AccountingLockPolicies.TAX_INVOICE.isTerminal(TaxInvoiceStatus.CANCELLED)).isTrue();
    }
}
