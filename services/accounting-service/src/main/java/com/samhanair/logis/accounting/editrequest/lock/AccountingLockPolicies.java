package com.samhanair.logis.accounting.editrequest.lock;

import com.samhanair.logis.accounting.domain.CashReceiptStatus;
import com.samhanair.logis.accounting.domain.JournalStatus;
import com.samhanair.logis.accounting.domain.PeriodStatus;
import com.samhanair.logis.accounting.domain.TaxInvoiceStatus;
import com.samhanair.logis.shared.realtime.lock.EditLockPolicy;

/**
 * 회계 도메인 잠금 정책 — PR-H4b (Phase 12 Step 4b).
 *
 * <p>shared:realtime-abstraction 의 {@link EditLockPolicy} 인스턴스 — accounting-service 의 3 개
 * 도메인 entity (TaxInvoice / Journal / AccountingPeriod / CashReceipt) 용 정책 상수.
 *
 * <p>사용자 명시 정책 (회계 도메인은 MANAGER 권한자 우선):
 *
 * <table>
 *   <caption>accounting 도메인 잠금 정책</caption>
 *   <tr><th>entity</th><th>FREE</th><th>LOCKED_REQUIRES_APPROVAL</th><th>FULLY_LOCKED</th><th>TERMINAL</th></tr>
 *   <tr><td>TaxInvoice</td><td>DRAFT</td><td>ISSUED</td><td>(없음)</td><td>CANCELLED</td></tr>
 *   <tr><td>Journal</td><td>DRAFT</td><td>POSTED</td><td>(없음)</td><td>REVERSED</td></tr>
 *   <tr><td>AccountingPeriod</td><td>OPEN</td><td>CLOSED</td><td>(없음)</td><td>(없음)</td></tr>
 *   <tr><td>CashReceipt</td><td>DRAFT</td><td>CONFIRMED</td><td>(없음)</td><td>CANCELLED</td></tr>
 * </table>
 *
 * <p>{@link com.samhanair.logis.shared.realtime.lock.EditLockGuard} 가 본 정책을 받아 canEdit /
 * canDelete 분기.
 */
public final class AccountingLockPolicies {

    private AccountingLockPolicies() {
        // utility class
    }

    /** TaxInvoice 잠금 정책 — DRAFT 자유, ISSUED 잠금 (MANAGER 수락), CANCELLED 종결. */
    public static final EditLockPolicy<TaxInvoiceStatus> TAX_INVOICE =
            EditLockPolicy.<TaxInvoiceStatus>builder()
                    .freeStatuses(TaxInvoiceStatus.DRAFT)
                    .lockedRequiresApproval(TaxInvoiceStatus.ISSUED)
                    .terminalStatuses(TaxInvoiceStatus.CANCELLED)
                    .build();

    /** Journal 잠금 정책 — DRAFT 자유, POSTED 잠금 (MANAGER 수락), REVERSED 종결. */
    public static final EditLockPolicy<JournalStatus> JOURNAL =
            EditLockPolicy.<JournalStatus>builder()
                    .freeStatuses(JournalStatus.DRAFT)
                    .lockedRequiresApproval(JournalStatus.POSTED)
                    .terminalStatuses(JournalStatus.REVERSED)
                    .build();

    /** AccountingPeriod 잠금 정책 — OPEN 자유, CLOSED 잠금 (MANAGER 수락 = 역마감 채널). */
    public static final EditLockPolicy<PeriodStatus> ACCOUNTING_PERIOD =
            EditLockPolicy.<PeriodStatus>builder()
                    .freeStatuses(PeriodStatus.OPEN)
                    .lockedRequiresApproval(PeriodStatus.CLOSED)
                    .build();

    /** CashReceipt 잠금 정책 — DRAFT 자유, CONFIRMED 잠금, CANCELLED 종결. */
    public static final EditLockPolicy<CashReceiptStatus> CASH_RECEIPT =
            EditLockPolicy.<CashReceiptStatus>builder()
                    .freeStatuses(CashReceiptStatus.DRAFT)
                    .lockedRequiresApproval(CashReceiptStatus.CONFIRMED)
                    .terminalStatuses(CashReceiptStatus.CANCELLED)
                    .build();
}
