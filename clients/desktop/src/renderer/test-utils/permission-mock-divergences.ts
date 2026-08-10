/**
 * auth_db 파생 스냅샷과 desktop mock 사이의 의도적으로 동결한 차이 목록.
 * 항목은 판단/사유가 아니라 현재 관측된 두 값만 보존한다.
 */
export type PermissionMockDivergence = {
  role: string
  pageCode: string
  snapshotBits: string
  mockBits: string
}

export const PERMISSION_MOCK_DIVERGENCES: readonly PermissionMockDivergence[] = [
  {
    "role": "MANAGER",
    "pageCode": "products.price-schedule",
    "snapshotBits": "0000000",
    "mockBits": "1010000"
  },
  {
    "role": "MANAGER",
    "pageCode": "accounting.daily-closing.run",
    "snapshotBits": "1111000",
    "mockBits": "1100000"
  },
  {
    "role": "MANAGER",
    "pageCode": "products.sync",
    "snapshotBits": "0000000",
    "mockBits": "1100000"
  },
  {
    "role": "MANAGER",
    "pageCode": "accounting.tax-invoice.list",
    "snapshotBits": "1000001",
    "mockBits": "1000011"
  },
  {
    "role": "MANAGER",
    "pageCode": "accounting.tax-invoice.cancel",
    "snapshotBits": "1111000",
    "mockBits": "1111011"
  },
  {
    "role": "MANAGER",
    "pageCode": "accounting.tax-invoice.batch-issue",
    "snapshotBits": "0000000",
    "mockBits": "1111011"
  },
  {
    "role": "MANAGER",
    "pageCode": "accounting.tax-invoice.inbound",
    "snapshotBits": "1111000",
    "mockBits": "0000000"
  },
  {
    "role": "MANAGER",
    "pageCode": "accounting.sales-slip.list",
    "snapshotBits": "1111000",
    "mockBits": "1111011"
  },
  {
    "role": "MANAGER",
    "pageCode": "accounting.purchase-slip.list",
    "snapshotBits": "1111000",
    "mockBits": "1111011"
  },
  {
    "role": "MANAGER",
    "pageCode": "accounting.daily-closing",
    "snapshotBits": "1000000",
    "mockBits": "1000011"
  },
  {
    "role": "MANAGER",
    "pageCode": "accounting.general-ledger",
    "snapshotBits": "1000000",
    "mockBits": "1000011"
  },
  {
    "role": "MANAGER",
    "pageCode": "purchases.slip.list",
    "snapshotBits": "1000000",
    "mockBits": "1000011"
  },
  {
    "role": "MANAGER",
    "pageCode": "hr.carriers",
    "snapshotBits": "1111000",
    "mockBits": "1111011"
  },
  {
    "role": "MANAGER",
    "pageCode": "admin.app-release",
    "snapshotBits": "1111000",
    "mockBits": "1111011"
  },
  {
    "role": "MANAGER",
    "pageCode": "hr.slip-cutoff",
    "snapshotBits": "1111000",
    "mockBits": "1111011"
  },
  {
    "role": "MANAGER",
    "pageCode": "accounting.accounts",
    "snapshotBits": "1000000",
    "mockBits": "1000011"
  },
  {
    "role": "MANAGER",
    "pageCode": "accounting.journals",
    "snapshotBits": "1000010",
    "mockBits": "1000011"
  },
  {
    "role": "MANAGER",
    "pageCode": "accounting.balances",
    "snapshotBits": "1000000",
    "mockBits": "1000011"
  },
  {
    "role": "MANAGER",
    "pageCode": "accounting.reports",
    "snapshotBits": "1000001",
    "mockBits": "1000011"
  },
  {
    "role": "MANAGER",
    "pageCode": "accounting.receivables",
    "snapshotBits": "1110000",
    "mockBits": "1111011"
  },
  {
    "role": "MANAGER",
    "pageCode": "accounting.bank-card-admin",
    "snapshotBits": "1111000",
    "mockBits": "1111011"
  },
  {
    "role": "MANAGER",
    "pageCode": "accounting.bank-matching",
    "snapshotBits": "1110000",
    "mockBits": "1111011"
  },
  {
    "role": "MANAGER",
    "pageCode": "accounting.deposit-match",
    "snapshotBits": "1000000",
    "mockBits": "1000011"
  },
  {
    "role": "MANAGER",
    "pageCode": "accounting.cash-receipts",
    "snapshotBits": "1111000",
    "mockBits": "1111011"
  },
  {
    "role": "MANAGER",
    "pageCode": "accounting.period-close",
    "snapshotBits": "1000000",
    "mockBits": "1000011"
  },
  {
    "role": "MANAGER",
    "pageCode": "accounting.statement-batch",
    "snapshotBits": "1000001",
    "mockBits": "1000011"
  },
  {
    "role": "MANAGER",
    "pageCode": "accounting.partner-ledger",
    "snapshotBits": "1000001",
    "mockBits": "1000011"
  },
  {
    "role": "MANAGER",
    "pageCode": "accounting.supplier-profiles",
    "snapshotBits": "1111000",
    "mockBits": "1111011"
  },
  {
    "role": "MANAGER",
    "pageCode": "accounting.edit-requests",
    "snapshotBits": "1000000",
    "mockBits": "1111011"
  },
  {
    "role": "MANAGER",
    "pageCode": "sales.partner-order.draft",
    "snapshotBits": "1111000",
    "mockBits": "1111011"
  },
  {
    "role": "MANAGER",
    "pageCode": "sales.partner-order.confirm",
    "snapshotBits": "1111000",
    "mockBits": "1111011"
  },
  {
    "role": "MANAGER",
    "pageCode": "sales.partner-order.history",
    "snapshotBits": "1000000",
    "mockBits": "1000011"
  },
  {
    "role": "MANAGER",
    "pageCode": "sales.partner-order.print",
    "snapshotBits": "1000001",
    "mockBits": "1000011"
  },
  {
    "role": "MANAGER",
    "pageCode": "inventory.warehouse",
    "snapshotBits": "1111000",
    "mockBits": "1111011"
  },
  {
    "role": "MANAGER",
    "pageCode": "inventory.stock",
    "snapshotBits": "1000000",
    "mockBits": "1000011"
  },
  {
    "role": "MANAGER",
    "pageCode": "inventory.stock-transfer",
    "snapshotBits": "1111000",
    "mockBits": "1111011"
  },
  {
    "role": "MANAGER",
    "pageCode": "inventory.dps",
    "snapshotBits": "1000010",
    "mockBits": "1000011"
  },
  {
    "role": "MANAGER",
    "pageCode": "inventory.audit",
    "snapshotBits": "1000000",
    "mockBits": "1000011"
  },
  {
    "role": "MANAGER",
    "pageCode": "inventory.list",
    "snapshotBits": "1111000",
    "mockBits": "1111011"
  },
  {
    "role": "MANAGER",
    "pageCode": "inventory.detail",
    "snapshotBits": "1000000",
    "mockBits": "1000011"
  },
  {
    "role": "MANAGER",
    "pageCode": "inventory.adjust",
    "snapshotBits": "1111000",
    "mockBits": "1111011"
  },
  {
    "role": "MANAGER",
    "pageCode": "inventory.transfer",
    "snapshotBits": "1111000",
    "mockBits": "1111011"
  },
  {
    "role": "MANAGER",
    "pageCode": "inventory.stock-balance",
    "snapshotBits": "1111010",
    "mockBits": "1111011"
  },
  {
    "role": "MANAGER",
    "pageCode": "inventory.safety-stock",
    "snapshotBits": "1111000",
    "mockBits": "1111011"
  },
  {
    "role": "MANAGER",
    "pageCode": "inventory.edit-requests",
    "snapshotBits": "1111000",
    "mockBits": "1111011"
  },
  {
    "role": "MANAGER",
    "pageCode": "inventory.edit-requests.decide",
    "snapshotBits": "1111000",
    "mockBits": "1111011"
  },
  {
    "role": "MANAGER",
    "pageCode": "ecount.import.inventory",
    "snapshotBits": "1111000",
    "mockBits": "1111011"
  },
  {
    "role": "MANAGER",
    "pageCode": "admin.employees",
    "snapshotBits": "1111000",
    "mockBits": "1111011"
  },
  {
    "role": "MANAGER",
    "pageCode": "partners.list",
    "snapshotBits": "1111000",
    "mockBits": "1111011"
  },
  {
    "role": "MANAGER",
    "pageCode": "partners.detail",
    "snapshotBits": "1111000",
    "mockBits": "1111011"
  },
  {
    "role": "MANAGER",
    "pageCode": "partners.search",
    "snapshotBits": "1000000",
    "mockBits": "1000011"
  },
  {
    "role": "MANAGER",
    "pageCode": "partners.edit",
    "snapshotBits": "1111010",
    "mockBits": "1111011"
  },
  {
    "role": "MANAGER",
    "pageCode": "partners.4tab.edit",
    "snapshotBits": "1111000",
    "mockBits": "1111011"
  },
  {
    "role": "MANAGER",
    "pageCode": "partners.block",
    "snapshotBits": "1111000",
    "mockBits": "1111011"
  },
  {
    "role": "MANAGER",
    "pageCode": "partners.edit-request",
    "snapshotBits": "1111000",
    "mockBits": "1111011"
  },
  {
    "role": "MANAGER",
    "pageCode": "products.list",
    "snapshotBits": "1111000",
    "mockBits": "1111011"
  },
  {
    "role": "MANAGER",
    "pageCode": "products.admin",
    "snapshotBits": "1111000",
    "mockBits": "1111011"
  },
  {
    "role": "MANAGER",
    "pageCode": "arologis.admin",
    "snapshotBits": "1111000",
    "mockBits": "1111011"
  },
  {
    "role": "MANAGER",
    "pageCode": "arologis.region",
    "snapshotBits": "1111000",
    "mockBits": "1111011"
  },
  {
    "role": "MANAGER",
    "pageCode": "ecount.mig14.ledger",
    "snapshotBits": "1111000",
    "mockBits": "1111011"
  },
  {
    "role": "MANAGER",
    "pageCode": "sales.slip.create",
    "snapshotBits": "1111000",
    "mockBits": "1111011"
  },
  {
    "role": "MANAGER",
    "pageCode": "slip.delivery-batch",
    "snapshotBits": "1111000",
    "mockBits": "1111011"
  },
  {
    "role": "MANAGER",
    "pageCode": "slip.print.next-day",
    "snapshotBits": "1111001",
    "mockBits": "1111011"
  },
  {
    "role": "MANAGER",
    "pageCode": "slip.print.export",
    "snapshotBits": "1111010",
    "mockBits": "1111011"
  },
  {
    "role": "MANAGER",
    "pageCode": "sales.partner-dc-config",
    "snapshotBits": "1111000",
    "mockBits": "1111011"
  },
  {
    "role": "MANAGER",
    "pageCode": "sales.estimate-config",
    "snapshotBits": "0000000",
    "mockBits": "1111011"
  },
  {
    "role": "MANAGER",
    "pageCode": "slip.cleanup",
    "snapshotBits": "1111000",
    "mockBits": "1111011"
  },
  {
    "role": "MANAGER",
    "pageCode": "arologis.dispatch.admin",
    "snapshotBits": "1111000",
    "mockBits": "1111011"
  },
  {
    "role": "MANAGER",
    "pageCode": "arologis.dispatch.ops",
    "snapshotBits": "1111000",
    "mockBits": "1111011"
  },
  {
    "role": "MANAGER",
    "pageCode": "notification.dispatch-sms.display",
    "snapshotBits": "1110000",
    "mockBits": "1111011"
  },
  {
    "role": "MANAGER",
    "pageCode": "dispatch.batch",
    "snapshotBits": "1111000",
    "mockBits": "1111011"
  },
  {
    "role": "MANAGER",
    "pageCode": "aligo.address-book",
    "snapshotBits": "1111000",
    "mockBits": "1111011"
  },
  {
    "role": "MANAGER",
    "pageCode": "groupware.approvals",
    "snapshotBits": "0000000",
    "mockBits": "1111011"
  },
  {
    "role": "MANAGER",
    "pageCode": "groupware.approval-templates",
    "snapshotBits": "0000000",
    "mockBits": "1111011"
  },
  {
    "role": "MANAGER",
    "pageCode": "messenger.admin",
    "snapshotBits": "1111000",
    "mockBits": "1111011"
  },
  {
    "role": "MANAGER",
    "pageCode": "slip.edit-requests",
    "snapshotBits": "1111000",
    "mockBits": "1111011"
  },
  {
    "role": "MANAGER",
    "pageCode": "slip.edit-requests.decide",
    "snapshotBits": "1111000",
    "mockBits": "1111011"
  },
  {
    "role": "MANAGER",
    "pageCode": "slip.photo-audit",
    "snapshotBits": "1000000",
    "mockBits": "1000011"
  },
  {
    "role": "MANAGER",
    "pageCode": "accounting.edit-requests.decide",
    "snapshotBits": "1111000",
    "mockBits": "1111011"
  },
  {
    "role": "MANAGER",
    "pageCode": "purchases.slip.edit",
    "snapshotBits": "1111000",
    "mockBits": "1111011"
  },
  {
    "role": "MANAGER",
    "pageCode": "purchases.slip.delete",
    "snapshotBits": "1111000",
    "mockBits": "1111011"
  },
  {
    "role": "MANAGER",
    "pageCode": "sales.slip.edit",
    "snapshotBits": "1111000",
    "mockBits": "1111011"
  },
  {
    "role": "MANAGER",
    "pageCode": "sales.partner-order.edit",
    "snapshotBits": "1111000",
    "mockBits": "1111011"
  },
  {
    "role": "MANAGER",
    "pageCode": "slip.signature",
    "snapshotBits": "1000000",
    "mockBits": "1000011"
  },
  {
    "role": "MANAGER",
    "pageCode": "arologis.region.manage",
    "snapshotBits": "1111000",
    "mockBits": "1111011"
  },
  {
    "role": "MANAGER",
    "pageCode": "slip.transfer.process",
    "snapshotBits": "1111000",
    "mockBits": "1111011"
  },
  {
    "role": "MANAGER",
    "pageCode": "sales.slip.confirm",
    "snapshotBits": "1111000",
    "mockBits": "1111011"
  },
  {
    "role": "MANAGER",
    "pageCode": "slip.reject",
    "snapshotBits": "1111000",
    "mockBits": "1111011"
  },
  {
    "role": "MANAGER",
    "pageCode": "sales.slip.cancel",
    "snapshotBits": "1111000",
    "mockBits": "1111011"
  },
  {
    "role": "MANAGER",
    "pageCode": "inventory.warehouse.admin",
    "snapshotBits": "1111100",
    "mockBits": "1111011"
  },
  {
    "role": "MANAGER",
    "pageCode": "slip.comments",
    "snapshotBits": "1111000",
    "mockBits": "1111011"
  },
  {
    "role": "MANAGER",
    "pageCode": "slip.audit-overlay",
    "snapshotBits": "1111000",
    "mockBits": "1111011"
  },
  {
    "role": "MANAGER",
    "pageCode": "slip.audit-revert",
    "snapshotBits": "1111100",
    "mockBits": "1111011"
  },
  {
    "role": "MANAGER",
    "pageCode": "dispatch.board",
    "snapshotBits": "1111100",
    "mockBits": "1000000"
  },
  {
    "role": "MANAGER",
    "pageCode": "sales.slip.list",
    "snapshotBits": "1000100",
    "mockBits": "1000011"
  },
  {
    "role": "SALES",
    "pageCode": "accounting.sales-slip.list",
    "snapshotBits": "1000000",
    "mockBits": "0000000"
  },
  {
    "role": "SALES",
    "pageCode": "accounting.purchase-slip.list",
    "snapshotBits": "1000000",
    "mockBits": "0000000"
  },
  {
    "role": "SALES",
    "pageCode": "sales.partner-order.draft",
    "snapshotBits": "1111000",
    "mockBits": "1111011"
  },
  {
    "role": "SALES",
    "pageCode": "sales.partner-order.confirm",
    "snapshotBits": "1111000",
    "mockBits": "1111011"
  },
  {
    "role": "SALES",
    "pageCode": "sales.partner-order.history",
    "snapshotBits": "1000000",
    "mockBits": "1000011"
  },
  {
    "role": "SALES",
    "pageCode": "sales.partner-order.print",
    "snapshotBits": "1111001",
    "mockBits": "1111011"
  },
  {
    "role": "SALES",
    "pageCode": "inventory.stock",
    "snapshotBits": "1000000",
    "mockBits": "1000011"
  },
  {
    "role": "SALES",
    "pageCode": "inventory.list",
    "snapshotBits": "1111000",
    "mockBits": "1111011"
  },
  {
    "role": "SALES",
    "pageCode": "inventory.transfer",
    "snapshotBits": "1000000",
    "mockBits": "1000011"
  },
  {
    "role": "SALES",
    "pageCode": "partners.list",
    "snapshotBits": "1111000",
    "mockBits": "1111011"
  },
  {
    "role": "SALES",
    "pageCode": "partners.detail",
    "snapshotBits": "1111000",
    "mockBits": "1111011"
  },
  {
    "role": "SALES",
    "pageCode": "partners.search",
    "snapshotBits": "1000000",
    "mockBits": "1000011"
  },
  {
    "role": "SALES",
    "pageCode": "partners.edit-request",
    "snapshotBits": "1000000",
    "mockBits": "1000011"
  },
  {
    "role": "SALES",
    "pageCode": "products.list",
    "snapshotBits": "1000000",
    "mockBits": "1000011"
  },
  {
    "role": "SALES",
    "pageCode": "products.admin",
    "snapshotBits": "1111000",
    "mockBits": "1111011"
  },
  {
    "role": "SALES",
    "pageCode": "sales.slip.create",
    "snapshotBits": "1111000",
    "mockBits": "1111011"
  },
  {
    "role": "SALES",
    "pageCode": "slip.print.next-day",
    "snapshotBits": "1111001",
    "mockBits": "1111011"
  },
  {
    "role": "SALES",
    "pageCode": "sales.partner-dc-config",
    "snapshotBits": "1000000",
    "mockBits": "1000011"
  },
  {
    "role": "SALES",
    "pageCode": "slip.cleanup",
    "snapshotBits": "1111000",
    "mockBits": "1111011"
  },
  {
    "role": "SALES",
    "pageCode": "slip.edit-requests",
    "snapshotBits": "1111000",
    "mockBits": "1111011"
  },
  {
    "role": "SALES",
    "pageCode": "sales.slip.edit",
    "snapshotBits": "1111000",
    "mockBits": "1111011"
  },
  {
    "role": "SALES",
    "pageCode": "sales.partner-order.edit",
    "snapshotBits": "1111000",
    "mockBits": "1111011"
  },
  {
    "role": "SALES",
    "pageCode": "sales.slip.cancel",
    "snapshotBits": "1111000",
    "mockBits": "1111011"
  },
  {
    "role": "SALES",
    "pageCode": "slip.comments",
    "snapshotBits": "1111000",
    "mockBits": "1111011"
  },
  {
    "role": "SALES",
    "pageCode": "slip.audit-overlay",
    "snapshotBits": "1111000",
    "mockBits": "1111011"
  },
  {
    "role": "SALES",
    "pageCode": "sales.slip.list",
    "snapshotBits": "1111100",
    "mockBits": "1111111"
  },
  {
    "role": "ACCOUNTANT",
    "pageCode": "products.price-schedule",
    "snapshotBits": "0000000",
    "mockBits": "1010000"
  },
  {
    "role": "ACCOUNTANT",
    "pageCode": "accounting.daily-closing.run",
    "snapshotBits": "1111000",
    "mockBits": "1100000"
  },
  {
    "role": "ACCOUNTANT",
    "pageCode": "accounting.tax-invoice.emit-nts",
    "snapshotBits": "1111000",
    "mockBits": "1111011"
  },
  {
    "role": "ACCOUNTANT",
    "pageCode": "accounting.tax-invoice.list",
    "snapshotBits": "1111001",
    "mockBits": "1111011"
  },
  {
    "role": "ACCOUNTANT",
    "pageCode": "accounting.tax-invoice.cancel",
    "snapshotBits": "1111000",
    "mockBits": "1111011"
  },
  {
    "role": "ACCOUNTANT",
    "pageCode": "accounting.tax-invoice.batch-issue",
    "snapshotBits": "1000000",
    "mockBits": "1111011"
  },
  {
    "role": "ACCOUNTANT",
    "pageCode": "accounting.tax-invoice.inbound",
    "snapshotBits": "1111000",
    "mockBits": "0000000"
  },
  {
    "role": "ACCOUNTANT",
    "pageCode": "accounting.sales-slip.list",
    "snapshotBits": "1111000",
    "mockBits": "1111011"
  },
  {
    "role": "ACCOUNTANT",
    "pageCode": "accounting.purchase-slip.list",
    "snapshotBits": "1111000",
    "mockBits": "1111011"
  },
  {
    "role": "ACCOUNTANT",
    "pageCode": "accounting.daily-closing",
    "snapshotBits": "1111000",
    "mockBits": "1111011"
  },
  {
    "role": "ACCOUNTANT",
    "pageCode": "accounting.general-ledger",
    "snapshotBits": "1000000",
    "mockBits": "1000011"
  },
  {
    "role": "ACCOUNTANT",
    "pageCode": "purchases.slip.list",
    "snapshotBits": "1000000",
    "mockBits": "1000011"
  },
  {
    "role": "ACCOUNTANT",
    "pageCode": "accounting.accounts",
    "snapshotBits": "1111000",
    "mockBits": "1111011"
  },
  {
    "role": "ACCOUNTANT",
    "pageCode": "accounting.journals",
    "snapshotBits": "1111010",
    "mockBits": "1111011"
  },
  {
    "role": "ACCOUNTANT",
    "pageCode": "accounting.balances",
    "snapshotBits": "1000000",
    "mockBits": "1000011"
  },
  {
    "role": "ACCOUNTANT",
    "pageCode": "accounting.reports",
    "snapshotBits": "1000001",
    "mockBits": "1000011"
  },
  {
    "role": "ACCOUNTANT",
    "pageCode": "accounting.receivables",
    "snapshotBits": "1110000",
    "mockBits": "1111011"
  },
  {
    "role": "ACCOUNTANT",
    "pageCode": "accounting.bank-card-admin",
    "snapshotBits": "1000000",
    "mockBits": "1000011"
  },
  {
    "role": "ACCOUNTANT",
    "pageCode": "accounting.bank-matching",
    "snapshotBits": "1110000",
    "mockBits": "1111011"
  },
  {
    "role": "ACCOUNTANT",
    "pageCode": "accounting.deposit-match",
    "snapshotBits": "1111000",
    "mockBits": "1111011"
  },
  {
    "role": "ACCOUNTANT",
    "pageCode": "accounting.cash-receipts",
    "snapshotBits": "1111000",
    "mockBits": "1111011"
  },
  {
    "role": "ACCOUNTANT",
    "pageCode": "accounting.period-close",
    "snapshotBits": "1111000",
    "mockBits": "1111011"
  },
  {
    "role": "ACCOUNTANT",
    "pageCode": "accounting.statement-batch",
    "snapshotBits": "1111001",
    "mockBits": "1111011"
  },
  {
    "role": "ACCOUNTANT",
    "pageCode": "accounting.partner-ledger",
    "snapshotBits": "1000001",
    "mockBits": "1000011"
  },
  {
    "role": "ACCOUNTANT",
    "pageCode": "accounting.supplier-profiles",
    "snapshotBits": "1000000",
    "mockBits": "1000011"
  },
  {
    "role": "ACCOUNTANT",
    "pageCode": "accounting.edit-requests",
    "snapshotBits": "1111000",
    "mockBits": "0000000"
  },
  {
    "role": "ACCOUNTANT",
    "pageCode": "sales.partner-order.history",
    "snapshotBits": "1000000",
    "mockBits": "1000011"
  },
  {
    "role": "ACCOUNTANT",
    "pageCode": "inventory.stock",
    "snapshotBits": "1000000",
    "mockBits": "1000011"
  },
  {
    "role": "ACCOUNTANT",
    "pageCode": "inventory.audit",
    "snapshotBits": "1000000",
    "mockBits": "0000000"
  },
  {
    "role": "ACCOUNTANT",
    "pageCode": "inventory.list",
    "snapshotBits": "1000000",
    "mockBits": "1000011"
  },
  {
    "role": "ACCOUNTANT",
    "pageCode": "inventory.detail",
    "snapshotBits": "1000000",
    "mockBits": "1000011"
  },
  {
    "role": "ACCOUNTANT",
    "pageCode": "inventory.transfer",
    "snapshotBits": "1000000",
    "mockBits": "1000011"
  },
  {
    "role": "ACCOUNTANT",
    "pageCode": "inventory.edit-requests",
    "snapshotBits": "1111000",
    "mockBits": "1111011"
  },
  {
    "role": "ACCOUNTANT",
    "pageCode": "inventory.edit-requests.decide",
    "snapshotBits": "1111000",
    "mockBits": "1111011"
  },
  {
    "role": "ACCOUNTANT",
    "pageCode": "partners.list",
    "snapshotBits": "1000000",
    "mockBits": "1000011"
  },
  {
    "role": "ACCOUNTANT",
    "pageCode": "partners.detail",
    "snapshotBits": "1000000",
    "mockBits": "1000011"
  },
  {
    "role": "ACCOUNTANT",
    "pageCode": "partners.search",
    "snapshotBits": "1000000",
    "mockBits": "1000011"
  },
  {
    "role": "ACCOUNTANT",
    "pageCode": "products.list",
    "snapshotBits": "1000000",
    "mockBits": "0000000"
  },
  {
    "role": "ACCOUNTANT",
    "pageCode": "ecount.mig14.ledger",
    "snapshotBits": "1000000",
    "mockBits": "1000011"
  },
  {
    "role": "ACCOUNTANT",
    "pageCode": "slip.edit-requests",
    "snapshotBits": "1000000",
    "mockBits": "1000011"
  },
  {
    "role": "ACCOUNTANT",
    "pageCode": "sales.slip.confirm",
    "snapshotBits": "1111000",
    "mockBits": "1111011"
  },
  {
    "role": "ACCOUNTANT",
    "pageCode": "slip.comments",
    "snapshotBits": "1000000",
    "mockBits": "1000011"
  },
  {
    "role": "ACCOUNTANT",
    "pageCode": "slip.audit-overlay",
    "snapshotBits": "1000000",
    "mockBits": "1000011"
  },
  {
    "role": "ACCOUNTANT",
    "pageCode": "sales.slip.list",
    "snapshotBits": "1000000",
    "mockBits": "1000011"
  },
  {
    "role": "WAREHOUSE",
    "pageCode": "purchases.slip.list",
    "snapshotBits": "1000000",
    "mockBits": "1000011"
  },
  {
    "role": "WAREHOUSE",
    "pageCode": "sales.partner-order.print",
    "snapshotBits": "1000001",
    "mockBits": "1000011"
  },
  {
    "role": "WAREHOUSE",
    "pageCode": "inventory.warehouse",
    "snapshotBits": "1111000",
    "mockBits": "1111011"
  },
  {
    "role": "WAREHOUSE",
    "pageCode": "inventory.stock",
    "snapshotBits": "1111000",
    "mockBits": "1111011"
  },
  {
    "role": "WAREHOUSE",
    "pageCode": "inventory.stock-transfer",
    "snapshotBits": "1111000",
    "mockBits": "1111011"
  },
  {
    "role": "WAREHOUSE",
    "pageCode": "inventory.dps",
    "snapshotBits": "1111010",
    "mockBits": "1111011"
  },
  {
    "role": "WAREHOUSE",
    "pageCode": "inventory.audit",
    "snapshotBits": "1000000",
    "mockBits": "1000011"
  },
  {
    "role": "WAREHOUSE",
    "pageCode": "inventory.list",
    "snapshotBits": "1111000",
    "mockBits": "1111011"
  },
  {
    "role": "WAREHOUSE",
    "pageCode": "inventory.detail",
    "snapshotBits": "1000000",
    "mockBits": "1000011"
  },
  {
    "role": "WAREHOUSE",
    "pageCode": "inventory.transfer",
    "snapshotBits": "1111000",
    "mockBits": "1111011"
  },
  {
    "role": "WAREHOUSE",
    "pageCode": "inventory.stock-balance",
    "snapshotBits": "1111010",
    "mockBits": "1111011"
  },
  {
    "role": "WAREHOUSE",
    "pageCode": "inventory.safety-stock",
    "snapshotBits": "1111000",
    "mockBits": "1111011"
  },
  {
    "role": "WAREHOUSE",
    "pageCode": "products.list",
    "snapshotBits": "1000000",
    "mockBits": "1000011"
  },
  {
    "role": "WAREHOUSE",
    "pageCode": "slip.edit-requests",
    "snapshotBits": "1000000",
    "mockBits": "1000011"
  },
  {
    "role": "WAREHOUSE",
    "pageCode": "slip.photo-audit",
    "snapshotBits": "1000000",
    "mockBits": "1000011"
  },
  {
    "role": "WAREHOUSE",
    "pageCode": "purchases.slip.edit",
    "snapshotBits": "1111000",
    "mockBits": "1111011"
  },
  {
    "role": "WAREHOUSE",
    "pageCode": "purchases.slip.delete",
    "snapshotBits": "1111000",
    "mockBits": "1111011"
  },
  {
    "role": "WAREHOUSE",
    "pageCode": "slip.transfer.process",
    "snapshotBits": "1111000",
    "mockBits": "1111011"
  },
  {
    "role": "WAREHOUSE",
    "pageCode": "slip.comments",
    "snapshotBits": "1111000",
    "mockBits": "1111011"
  },
  {
    "role": "WAREHOUSE",
    "pageCode": "slip.audit-overlay",
    "snapshotBits": "1111000",
    "mockBits": "1111011"
  },
  {
    "role": "INVENTORY",
    "pageCode": "purchases.slip.list",
    "snapshotBits": "1000000",
    "mockBits": "1000011"
  },
  {
    "role": "INVENTORY",
    "pageCode": "inventory.warehouse",
    "snapshotBits": "1111000",
    "mockBits": "1111011"
  },
  {
    "role": "INVENTORY",
    "pageCode": "inventory.stock",
    "snapshotBits": "1111000",
    "mockBits": "1111011"
  },
  {
    "role": "INVENTORY",
    "pageCode": "inventory.stock-transfer",
    "snapshotBits": "1111000",
    "mockBits": "1111011"
  },
  {
    "role": "INVENTORY",
    "pageCode": "inventory.dps",
    "snapshotBits": "1111010",
    "mockBits": "1111011"
  },
  {
    "role": "INVENTORY",
    "pageCode": "inventory.audit",
    "snapshotBits": "1000000",
    "mockBits": "1000011"
  },
  {
    "role": "INVENTORY",
    "pageCode": "inventory.list",
    "snapshotBits": "1111000",
    "mockBits": "1111011"
  },
  {
    "role": "INVENTORY",
    "pageCode": "inventory.detail",
    "snapshotBits": "1000000",
    "mockBits": "1000011"
  },
  {
    "role": "INVENTORY",
    "pageCode": "inventory.adjust",
    "snapshotBits": "1111000",
    "mockBits": "1111011"
  },
  {
    "role": "INVENTORY",
    "pageCode": "inventory.transfer",
    "snapshotBits": "1111000",
    "mockBits": "1111011"
  },
  {
    "role": "INVENTORY",
    "pageCode": "inventory.stock-balance",
    "snapshotBits": "1111010",
    "mockBits": "1111011"
  },
  {
    "role": "INVENTORY",
    "pageCode": "inventory.safety-stock",
    "snapshotBits": "1111000",
    "mockBits": "1111011"
  },
  {
    "role": "INVENTORY",
    "pageCode": "inventory.edit-requests",
    "snapshotBits": "1111000",
    "mockBits": "1111011"
  },
  {
    "role": "INVENTORY",
    "pageCode": "products.list",
    "snapshotBits": "1000000",
    "mockBits": "1000011"
  },
  {
    "role": "INVENTORY",
    "pageCode": "products.admin",
    "snapshotBits": "1111000",
    "mockBits": "1111011"
  },
  {
    "role": "INVENTORY",
    "pageCode": "slip.edit-requests",
    "snapshotBits": "1000000",
    "mockBits": "1000011"
  },
  {
    "role": "INVENTORY",
    "pageCode": "slip.transfer.process",
    "snapshotBits": "1111000",
    "mockBits": "1111011"
  },
  {
    "role": "INVENTORY",
    "pageCode": "slip.comments",
    "snapshotBits": "1000000",
    "mockBits": "1000011"
  },
  {
    "role": "INVENTORY",
    "pageCode": "slip.audit-overlay",
    "snapshotBits": "1000000",
    "mockBits": "1000011"
  },
  {
    "role": "INVENTORY",
    "pageCode": "sales.slip.list",
    "snapshotBits": "1000000",
    "mockBits": "1000011"
  },
  {
    "role": "DISPATCH",
    "pageCode": "inventory.warehouse",
    "snapshotBits": "1000000",
    "mockBits": "1000011"
  },
  {
    "role": "DISPATCH",
    "pageCode": "inventory.stock",
    "snapshotBits": "1000000",
    "mockBits": "1000011"
  },
  {
    "role": "DISPATCH",
    "pageCode": "arologis.admin",
    "snapshotBits": "1111000",
    "mockBits": "1111011"
  },
  {
    "role": "DISPATCH",
    "pageCode": "arologis.region",
    "snapshotBits": "1111000",
    "mockBits": "1111011"
  },
  {
    "role": "DISPATCH",
    "pageCode": "arologis.dispatch.ops",
    "snapshotBits": "1111000",
    "mockBits": "1111011"
  },
  {
    "role": "DISPATCH",
    "pageCode": "notification.dispatch-sms.display",
    "snapshotBits": "1110000",
    "mockBits": "1111011"
  },
  {
    "role": "DISPATCH",
    "pageCode": "dispatch.batch",
    "snapshotBits": "1111000",
    "mockBits": "1111011"
  },
  {
    "role": "DISPATCH",
    "pageCode": "slip.edit-requests",
    "snapshotBits": "1000000",
    "mockBits": "0000000"
  },
  {
    "role": "DISPATCH",
    "pageCode": "slip.comments",
    "snapshotBits": "1000000",
    "mockBits": "1000011"
  },
  {
    "role": "DISPATCH",
    "pageCode": "slip.audit-overlay",
    "snapshotBits": "1000000",
    "mockBits": "1000011"
  },
  {
    "role": "DRIVER",
    "pageCode": "slip.edit-requests",
    "snapshotBits": "1000000",
    "mockBits": "0000000"
  },
  {
    "role": "DRIVER",
    "pageCode": "slip.comments",
    "snapshotBits": "1000000",
    "mockBits": "0000000"
  },
  {
    "role": "DRIVER",
    "pageCode": "slip.audit-overlay",
    "snapshotBits": "1000000",
    "mockBits": "0000000"
  },
  {
    "role": "STAFF",
    "pageCode": "slip.edit-requests",
    "snapshotBits": "1000000",
    "mockBits": "0000000"
  },
  {
    "role": "STAFF",
    "pageCode": "slip.comments",
    "snapshotBits": "1000000",
    "mockBits": "0000000"
  },
  {
    "role": "STAFF",
    "pageCode": "slip.audit-overlay",
    "snapshotBits": "1000000",
    "mockBits": "0000000"
  },
  {
    "role": "DEVELOPER",
    "pageCode": "admin.app-release",
    "snapshotBits": "1111000",
    "mockBits": "1111011"
  },
  {
    "role": "DEVELOPER",
    "pageCode": "dev.popup-notice",
    "snapshotBits": "1111000",
    "mockBits": "1111011"
  },
  {
    "role": "DEVELOPER",
    "pageCode": "dev.activity-log",
    "snapshotBits": "1111000",
    "mockBits": "1111011"
  },
  {
    "role": "DEVELOPER",
    "pageCode": "products.list",
    "snapshotBits": "1111000",
    "mockBits": "1111011"
  },
  {
    "role": "DEVELOPER",
    "pageCode": "products.admin",
    "snapshotBits": "1111000",
    "mockBits": "1111011"
  },
  {
    "role": "DEVELOPER",
    "pageCode": "slip.edit-requests",
    "snapshotBits": "1000000",
    "mockBits": "0000000"
  },
  {
    "role": "DEVELOPER",
    "pageCode": "slip.comments",
    "snapshotBits": "1000000",
    "mockBits": "1000011"
  },
  {
    "role": "DEVELOPER",
    "pageCode": "slip.audit-overlay",
    "snapshotBits": "1000000",
    "mockBits": "1000011"
  },
  {
    "role": "PARTNER",
    "pageCode": "sales.partner-order.draft",
    "snapshotBits": "1111000",
    "mockBits": "0000000"
  },
  {
    "role": "PARTNER",
    "pageCode": "sales.partner-order.confirm",
    "snapshotBits": "1111000",
    "mockBits": "0000000"
  },
  {
    "role": "PARTNER",
    "pageCode": "sales.partner-order.history",
    "snapshotBits": "1000000",
    "mockBits": "0000000"
  },
  {
    "role": "PARTNER",
    "pageCode": "sales.partner-order.print",
    "snapshotBits": "1000000",
    "mockBits": "0000000"
  },
  {
    "role": "PARTNER",
    "pageCode": "sales.partner-order.list",
    "snapshotBits": "1000000",
    "mockBits": "0000000"
  }
]
