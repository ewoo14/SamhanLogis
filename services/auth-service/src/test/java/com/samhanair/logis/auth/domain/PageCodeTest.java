package com.samhanair.logis.auth.domain;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class PageCodeTest {

    @Test
    void accounting_salesSlip_label_회계분개_명확화() {
        assertThat(PageCode.ACCOUNTING_SALES_SLIP_LIST.getDisplayName())
                .isEqualTo("매출전표(회계분개)");
    }

    @Test
    void accounting_purchaseSlip_label_회계분개_명확화() {
        assertThat(PageCode.ACCOUNTING_PURCHASE_SLIP_LIST.getDisplayName())
                .isEqualTo("매입전표(회계분개)");
    }

    @Test
    void accounting_taxInvoiceInbound_label_세금계산서_수신() {
        assertThat(PageCode.ACCOUNTING_TAX_INVOICE_INBOUND.getCode())
                .isEqualTo("accounting.tax-invoice.inbound");
        assertThat(PageCode.ACCOUNTING_TAX_INVOICE_INBOUND.getDisplayName())
                .isEqualTo("세금계산서 수신");
    }

    @Test
    void mig3_pageCodes_4종_정상등록() {
        assertThat(PageCode.ECOUNT_MIG3_PURCHASE_SLIP.getCode())
                .isEqualTo("ecount.mig3.purchase-slip");
        assertThat(PageCode.ECOUNT_MIG3_SALES_SLIP.getCode())
                .isEqualTo("ecount.mig3.sales-slip");
        assertThat(PageCode.ECOUNT_MIG3_GENERAL_VOUCHER.getCode())
                .isEqualTo("ecount.mig3.general-voucher");
        assertThat(PageCode.ECOUNT_MIG3_JOURNAL_ENTRY.getCode())
                .isEqualTo("ecount.mig3.journal-entry");
    }

    @Test
    void mig5_pageCodes_3종_정상등록() {
        assertThat(PageCode.ECOUNT_MIG5_STOCK_TRANSFER.getCode())
                .isEqualTo("ecount.mig5.stock-transfer");
        assertThat(PageCode.ECOUNT_MIG5_EXPENSE_VOUCHER.getCode())
                .isEqualTo("ecount.mig5.expense-voucher");
        assertThat(PageCode.ECOUNT_MIG5_DEPOSIT_REPORT.getCode())
                .isEqualTo("ecount.mig5.deposit-report");
    }

    @Test
    void mig6_pageCodes_5종_정상등록() {
        assertThat(PageCode.ECOUNT_MIG6_BANK_ACCOUNT.getCode())
                .isEqualTo("ecount.mig6.bank-account");
        assertThat(PageCode.ECOUNT_MIG6_EMPLOYEE.getCode())
                .isEqualTo("ecount.mig6.employee");
        assertThat(PageCode.ECOUNT_MIG6_EMPLOYEE_CARD.getCode())
                .isEqualTo("ecount.mig6.employee-card");
        assertThat(PageCode.ECOUNT_MIG6_PAYROLL_EMPLOYEE.getCode())
                .isEqualTo("ecount.mig6.payroll-employee");
        assertThat(PageCode.ECOUNT_MIG6_FIXED_ASSET_TYPE.getCode())
                .isEqualTo("ecount.mig6.fixed-asset-type");
    }

    @Test
    void mig9_pageCodes_2종_V22_seed와_동기화() {
        assertThat(PageCode.ECOUNT_MIG9_CASH_JOURNAL_DISBURSEMENT.getCode())
                .isEqualTo("ecount.mig9.cash-journal.disbursement");
        assertThat(PageCode.ECOUNT_MIG9_CASH_JOURNAL_RECEIPT.getCode())
                .isEqualTo("ecount.mig9.cash-journal.receipt");
    }

    @Test
    void mig10_pageCode_V23_seed와_동기화() {
        assertThat(PageCode.ECOUNT_MIG10_ORDER_EMPLOYEE_BACKFILL.getCode())
                .isEqualTo("ecount.mig10.order-employee-backfill");
        assertThat(PageCode.ECOUNT_MIG10_ORDER_EMPLOYEE_BACKFILL.getDisplayName())
                .isEqualTo("이카운트 주문 담당자 Employee 연결");
    }

    @Test
    void mig14_adminPageCodes_4종_V25_seed와_동기화() {
        assertThat(PageCode.ECOUNT_MIG14_CASH_LIST.getCode())
                .isEqualTo("ecount.mig14.cash-list");
        assertThat(PageCode.ECOUNT_MIG14_ORDER_LIST.getCode())
                .isEqualTo("ecount.mig14.order-list");
        assertThat(PageCode.ECOUNT_MIG14_AGING_SNAPSHOT.getCode())
                .isEqualTo("ecount.mig14.aging-snapshot");
        assertThat(PageCode.ECOUNT_MIG14_LEDGER.getCode())
                .isEqualTo("ecount.mig14.ledger");
    }

    @Test
    void mig20_reimport_pageCode_V26_seed와_동기화() {
        assertThat(PageCode.ECOUNT_REIMPORT.getCode()).isEqualTo("ecount.reimport");
        assertThat(PageCode.ECOUNT_REIMPORT.getDisplayName()).isEqualTo("이카운트 raw 자동 재import");
        assertThat(PageCode.isValid("ecount.reimport")).isTrue();
    }

    @Test
    void mig21_ops_dashboard_pageCode_V27_seed와_동기화() {
        assertThat(PageCode.ECOUNT_MIG_OPS_DASHBOARD.getCode())
                .isEqualTo("ecount.mig.ops-dashboard");
        assertThat(PageCode.ECOUNT_MIG_OPS_DASHBOARD.getDisplayName())
                .isEqualTo("이카운트 마이그레이션 운영 대시보드");
        assertThat(PageCode.isValid("ecount.mig.ops-dashboard")).isTrue();
    }
}
