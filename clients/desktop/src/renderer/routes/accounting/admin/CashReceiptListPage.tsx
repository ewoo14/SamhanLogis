import { listCashReceipts } from '../../../api/accountingAdminApi'
import { CashTransactionList } from './CashTransactionList'
import { CASH_RECEIPT_KIND_LABEL } from './Mig14AdminShared'

export function CashReceiptListPage() {
  return (
    <CashTransactionList
      title="입금 트랜잭션"
      testId="mig14-cash-receipt-page"
      queryKey="mig14-cash-receipts"
      emptyMessage="조회된 입금 트랜잭션이 없습니다."
      kindLabels={CASH_RECEIPT_KIND_LABEL}
      kindOptions={[
        { value: 'DEPOSIT_REPORT', label: '입금보고서' },
        { value: 'MANUAL_RECEIPT', label: '수기 입금' },
      ]}
      loadRows={listCashReceipts}
    />
  )
}
