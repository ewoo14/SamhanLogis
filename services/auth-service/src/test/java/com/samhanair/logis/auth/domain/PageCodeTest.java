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

    @Test
    void spD61_pageCodes_V29_seed와_동기화() {
        assertThat(PageCode.SYSTEM_PERMISSION_ADMIN.getCode()).isEqualTo("system.permission-admin");
        assertThat(PageCode.SYSTEM_PASSWORD_ADMIN.getCode()).isEqualTo("system.password-admin");
        assertThat(PageCode.SYSTEM_ACCOUNT_ADMIN.getCode()).isEqualTo("system.account-admin");
        assertThat(PageCode.DC_CONFIG_IMPORT.getCode()).isEqualTo("dc-config.import");
        assertThat(PageCode.DASHBOARD_ADMIN.getCode()).isEqualTo("dashboard.admin");
        assertThat(PageCode.SALES_PARTNER_DC_CONFIG.getCode()).isEqualTo("sales.partner-dc-config");

        assertThat(PageCode.isValid("system.permission-admin")).isTrue();
        assertThat(PageCode.isValid("sales.partner-dc-config")).isTrue();
    }

    @Test
    void spD62_pageCodes_V30_seed와_동기화() {
        assertThat(PageCode.MESSENGER_ADMIN.getCode()).isEqualTo("messenger.admin");
        assertThat(PageCode.MESSENGER_SEND.getCode()).isEqualTo("messenger.send");
        assertThat(PageCode.PRODUCTS_PRICE.getCode()).isEqualTo("products.price");
        assertThat(PageCode.PRODUCTS_EDIT_REQUESTS.getCode()).isEqualTo("products.edit-requests");
        assertThat(PageCode.PRODUCTS_EDIT_REQUESTS_DECIDE.getCode())
                .isEqualTo("products.edit-requests.decide");
        assertThat(PageCode.PRODUCTS_ECOUNT_IMPORT.getCode()).isEqualTo("products.ecount-import");
        assertThat(PageCode.SALES_PARTNER_ORDER_EDIT.getCode()).isEqualTo("sales.partner-order.edit");
        assertThat(PageCode.SALES_PARTNER_ORDER_EDIT_REQUESTS.getCode())
                .isEqualTo("sales.partner-order.edit-requests");
        assertThat(PageCode.SALES_PARTNER_ORDER_EDIT_REQUESTS_DECIDE.getCode())
                .isEqualTo("sales.partner-order.edit-requests.decide");
        assertThat(PageCode.SALES_PARTNER_ORDER_TUTORIAL.getCode())
                .isEqualTo("sales.partner-order.tutorial");

        assertThat(PageCode.isValid("messenger.admin")).isTrue();
        assertThat(PageCode.isValid("products.price")).isTrue();
        assertThat(PageCode.isValid("products.edit-requests.decide")).isTrue();
        assertThat(PageCode.isValid("products.ecount-import")).isTrue();
        assertThat(PageCode.isValid("sales.partner-order.edit")).isTrue();
        assertThat(PageCode.isValid("sales.partner-order.edit-requests")).isTrue();
        assertThat(PageCode.isValid("sales.partner-order.edit-requests.decide")).isTrue();
    }

    @Test
    void spD63_pageCodes_V33_seed와_동기화() {
        assertThat(PageCode.NOTIFICATIONS_ADMIN.getCode()).isEqualTo("notifications.admin");
        assertThat(PageCode.ALIGO_ADDRESS_BOOK.getCode()).isEqualTo("aligo.address-book");
        assertThat(PageCode.DISPATCH_SMS_SAVE_HISTORY.getCode()).isEqualTo("dispatch.sms-save-history");
        assertThat(PageCode.DISPATCH_BATCH.getCode()).isEqualTo("dispatch.batch");

        assertThat(PageCode.isValid("notifications.admin")).isTrue();
        assertThat(PageCode.isValid("aligo.address-book")).isTrue();
        assertThat(PageCode.isValid("dispatch.sms-save-history")).isTrue();
        assertThat(PageCode.isValid("dispatch.batch")).isTrue();
    }
}
