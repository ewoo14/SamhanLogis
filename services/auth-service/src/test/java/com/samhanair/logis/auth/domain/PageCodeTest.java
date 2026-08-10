package com.samhanair.logis.auth.domain;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.DisplayName;

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
    void mig7_mig11_pageCodes_V37_seed와_동기화() {
        assertThat(PageCode.ECOUNT_MIG7_CASH_DISBURSEMENT.getCode())
                .isEqualTo("ecount.mig7.cash-disbursement");
        assertThat(PageCode.ECOUNT_MIG7_CASH_RECEIPT.getCode())
                .isEqualTo("ecount.mig7.cash-receipt");
        assertThat(PageCode.ECOUNT_MIG11_SALES_LEDGER.getCode())
                .isEqualTo("ecount.mig11.sales-ledger");
        assertThat(PageCode.ECOUNT_MIG11_PURCHASE_LEDGER.getCode())
                .isEqualTo("ecount.mig11.purchase-ledger");
    }

    @Test
    void mig14_adminPageCodes_2종_V25_seed와_동기화() {
        assertThat(PageCode.ECOUNT_MIG14_LEDGER.getCode())
                .isEqualTo("ecount.mig14.ledger");
        assertThat(PageCode.isValid("ecount.mig14.cash-list")).isFalse();
        assertThat(PageCode.isValid("ecount.mig14.aging-snapshot")).isFalse();
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
        assertThat(PageCode.SALES_ESTIMATE_CONFIG.getCode()).isEqualTo("sales.estimate-config");

        assertThat(PageCode.isValid("system.permission-admin")).isTrue();
        assertThat(PageCode.isValid("sales.partner-dc-config")).isTrue();
        assertThat(PageCode.isValid("sales.estimate-config")).isTrue();
    }

    @Test
    void appReleaseAdmin_pageCode_V71_seed와_동기화() {
        assertThat(PageCode.ADMIN_APP_RELEASE.getCode()).isEqualTo("admin.app-release");
        assertThat(PageCode.ADMIN_APP_RELEASE.getDisplayName()).isEqualTo("앱 릴리스 관리");
        assertThat(PageCode.isValid("admin.app-release")).isTrue();
    }

    @Test
    void developmentMenu_pageCodes_V73_V74_seed와_동기화() {
        assertThat(PageCode.DEV_POPUP_NOTICE.getCode()).isEqualTo("dev.popup-notice");
        assertThat(PageCode.DEV_POPUP_NOTICE.getDisplayName()).isEqualTo("팝업공지");
        assertThat(PageCode.DEV_ACTIVITY_LOG.getCode()).isEqualTo("dev.activity-log");
        assertThat(PageCode.DEV_ACTIVITY_LOG.getDisplayName()).isEqualTo("활동 로그");
        assertThat(PageCode.isValid("dev.popup-notice")).isTrue();
        assertThat(PageCode.isValid("dev.activity-log")).isTrue();
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
        assertThat(PageCode.PRODUCTS_SYNC.getCode()).isEqualTo("products.sync");
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
        assertThat(PageCode.isValid("products.sync")).isTrue();
        assertThat(PageCode.isValid("sales.partner-order.edit")).isTrue();
        assertThat(PageCode.isValid("sales.partner-order.edit-requests")).isTrue();
        assertThat(PageCode.isValid("sales.partner-order.edit-requests.decide")).isTrue();
    }

    @Test
    void pr994_groupwareSchedules_pageCode_V90_seed와_동기화() {
        assertThat(PageCode.GROUPWARE_SCHEDULES.getCode()).isEqualTo("groupware.schedules");
        assertThat(PageCode.GROUPWARE_SCHEDULES.getDisplayName()).isEqualTo("그룹웨어 일정");
        assertThat(PageCode.isValid("groupware.schedules")).isTrue();
        assertThat(PageCode.fromCode("groupware.schedules")).isEqualTo(PageCode.GROUPWARE_SCHEDULES);
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

    @Test
    void spD7_notificationsCenter_pageCode_V38_seed와_동기화() {
        assertThat(PageCode.NOTIFICATIONS_CENTER.getCode()).isEqualTo("notifications.center");
        assertThat(PageCode.NOTIFICATIONS_CENTER.getDisplayName()).isEqualTo("알림 센터");
        assertThat(PageCode.isValid("notifications.center")).isTrue();
    }

    @Test
    void spD7_dedicatedViewPageCodes_V38_seed와_동기화() {
        assertThat(PageCode.SALES_PARTNER_ORDER_HISTORY_VIEW.getCode())
                .isEqualTo("sales.partner-order.history.view");
        assertThat(PageCode.PRODUCTS_LIST_VIEW.getCode()).isEqualTo("products.list.view");
        assertThat(PageCode.PARTNERS_DETAIL_VIEW.getCode()).isEqualTo("partners.detail.view");
        assertThat(PageCode.INVENTORY_STOCK_BALANCE_VIEW.getCode())
                .isEqualTo("inventory.stock-balance.view");

        assertThat(PageCode.isValid("sales.partner-order.history.view")).isTrue();
        assertThat(PageCode.isValid("products.list.view")).isTrue();
        assertThat(PageCode.isValid("partners.detail.view")).isTrue();
        assertThat(PageCode.isValid("inventory.stock-balance.view")).isTrue();
    }

    @Test
    void spD64_pageCodes_V34_seed와_동기화() {
        assertThat(PageCode.PARTNERS_SEARCH.getCode()).isEqualTo("partners.search");
        assertThat(PageCode.PARTNERS_EDIT.getCode()).isEqualTo("partners.edit");
        assertThat(PageCode.PARTNERS_DELETE.getCode()).isEqualTo("partners.delete");
        assertThat(PageCode.PARTNERS_CREDIT_HISTORY.getCode()).isEqualTo("partners.credit-history");
        assertThat(PageCode.PARTNERS_BLOCK_BULK.getCode()).isEqualTo("partners.block.bulk");
        assertThat(PageCode.PARTNERS_4TAB.getCode()).isEqualTo("partners.4tab");
        assertThat(PageCode.PARTNERS_4TAB_EDIT.getCode()).isEqualTo("partners.4tab.edit");
        assertThat(PageCode.PARTNERS_EDIT_REQUESTS.getCode()).isEqualTo("partners.edit-requests");
        assertThat(PageCode.PARTNERS_EDIT_REQUESTS_DECIDE.getCode()).isEqualTo("partners.edit-requests.decide");
        assertThat(PageCode.AROLOGIS_DISPATCH_ADMIN.getCode()).isEqualTo("arologis.dispatch.admin");
        assertThat(PageCode.AROLOGIS_DISPATCH_OPS.getCode()).isEqualTo("arologis.dispatch.ops");
        assertThat(PageCode.AROLOGIS_REGION_MANAGE.getCode()).isEqualTo("arologis.region.manage");
        assertThat(PageCode.AROLOGIS_EDIT_REQUESTS.getCode()).isEqualTo("arologis.edit-requests");
        assertThat(PageCode.AROLOGIS_EDIT_REQUESTS_DECIDE.getCode()).isEqualTo("arologis.edit-requests.decide");
        assertThat(PageCode.AROLOGIS_DRIVER.getCode()).isEqualTo("arologis.driver");
        assertThat(PageCode.AROLOGIS_HR_EMPLOYEES.getCode()).isEqualTo("arologis.hr.employees");
        assertThat(PageCode.AROLOGIS_HR_DEPARTMENTS.getCode()).isEqualTo("arologis.hr.departments");

        assertThat(PageCode.isValid("partners.edit-requests.decide")).isTrue();
        assertThat(PageCode.isValid("arologis.edit-requests.decide")).isTrue();
        assertThat(PageCode.isValid("arologis.driver")).isTrue();
        assertThat(PageCode.isValid("arologis.hr.employees")).isTrue();
        assertThat(PageCode.isValid("arologis.hr.departments")).isTrue();
    }

    @Test
    void arologis_accountingPageCodes_V51_seed와_동기화() {
        assertThat(PageCode.AROLOGIS_ACCOUNTING_CASHBOOK.getCode())
                .isEqualTo("arologis.accounting.cashbook");
        assertThat(PageCode.AROLOGIS_ACCOUNTING_SUMMARY.getCode())
                .isEqualTo("arologis.accounting.summary");

        assertThat(PageCode.isValid("arologis.accounting.cashbook")).isTrue();
        assertThat(PageCode.isValid("arologis.accounting.summary")).isTrue();
    }

    @Test
    void arologis_adminPermissions_pageCode_V52_seed와_동기화() {
        assertThat(PageCode.AROLOGIS_ADMIN_PERMISSIONS.getCode())
                .isEqualTo("arologis.admin.permissions");
        assertThat(PageCode.AROLOGIS_ADMIN_PERMISSIONS.getDisplayName())
                .isEqualTo("아로로지스 권한 관리");
        assertThat(PageCode.isValid("arologis.admin.permissions")).isTrue();
    }

    @Test
    void arologis_accountingAccounts_pageCode_V54_seed와_동기화() {
        assertThat(PageCode.AROLOGIS_ACCOUNTING_ACCOUNTS.getCode())
                .isEqualTo("arologis.accounting.accounts");
        assertThat(PageCode.AROLOGIS_ACCOUNTING_ACCOUNTS.getDisplayName())
                .isEqualTo("아로로지스 계정과목 관리");
        assertThat(PageCode.isValid("arologis.accounting.accounts")).isTrue();
    }

    @Test
    void spD65_pageCodes_V35_seed와_동기화() {
        assertThat(PageCode.INVENTORY_WAREHOUSE_ADMIN.getCode())
                .isEqualTo("inventory.warehouse.admin");
        assertThat(PageCode.INVENTORY_WAREHOUSE_ADMIN.getDisplayName())
                .isEqualTo("창고 관리 admin");
        assertThat(PageCode.isValid("inventory.warehouse.admin")).isTrue();
    }

    @Test
    void spD67_accountingPageCodes_V37_seed와_동기화() {
        assertThat(PageCode.ACCOUNTING_EDIT_REQUESTS_DECIDE.getCode())
                .isEqualTo("accounting.edit-requests.decide");
        assertThat(PageCode.ACCOUNTING_TAX_INVOICE_CANCEL.getCode())
                .isEqualTo("accounting.tax-invoice.cancel");
        assertThat(PageCode.ACCOUNTING_TAX_INVOICE_INBOUND_MANAGE.getCode())
                .isEqualTo("accounting.tax-invoice.inbound.manage");
        assertThat(PageCode.ACCOUNTING_HOMETAX_EXPORT.getCode())
                .isEqualTo("accounting.hometax-export");
        assertThat(PageCode.ACCOUNTING_DAILY_CLOSING_UNLOCK.getCode())
                .isEqualTo("accounting.daily-closing.unlock");
        assertThat(PageCode.ACCOUNTING_PERIOD_CLOSE_REVERSE.getCode())
                .isEqualTo("accounting.period-close.reverse");
        assertThat(PageCode.ACCOUNTING_BALANCES_TRIAL_BALANCE.getCode())
                .isEqualTo("accounting.balances.trial-balance");
        assertThat(PageCode.ACCOUNTING_RECEIVABLES.getCode())
                .isEqualTo("accounting.receivables");
        assertThat(PageCode.ACCOUNTING_BANK_MATCHING.getCode())
                .isEqualTo("accounting.bank-matching");
        assertThat(PageCode.ACCOUNTING_BANK_MATCHING.getDisplayName())
                .isEqualTo("입출금 내역");
        assertThat(PageCode.ACCOUNTING_SUPPLIER_PROFILES.getCode())
                .isEqualTo("accounting.supplier-profiles");

        assertThat(PageCode.isValid("accounting.edit-requests.decide")).isTrue();
        assertThat(PageCode.isValid("accounting.hometax-export")).isTrue();
        assertThat(PageCode.isValid("accounting.receivables")).isTrue();
        assertThat(PageCode.isValid("accounting.bank-matching")).isTrue();
        assertThat(PageCode.isValid("accounting.supplier-profiles")).isTrue();
    }

    @Test
    @DisplayName("#810 accounting.deposit-mapping page-code가 V87 seed와 동기화된다")
    void bankDepositorMapping_pageCode_V87_seed와_동기화() {
        assertThat(PageCode.ACCOUNTING_DEPOSIT_MAPPING.getCode())
                .isEqualTo("accounting.deposit-mapping");
        assertThat(PageCode.ACCOUNTING_DEPOSIT_MAPPING.getDisplayName())
                .isEqualTo("입금자명 매핑");
        assertThat(PageCode.isValid("accounting.deposit-mapping")).isTrue();
    }
}
