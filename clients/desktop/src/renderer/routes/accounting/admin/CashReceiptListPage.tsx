import { listCashReceipts } from '../../../api/accountingAdminApi'
import { CashTransactionList } from './CashTransactionList'

export function CashReceiptListPage() {
  return (
    <CashTransactionList
      title="회수 트랜잭션"
      testId="mig14-cash-receipt-page"
      queryKey="mig14-cash-receipts"
      emptyMessage="조회된 회수 트랜잭션이 없습니다."
      loadRows={listCashReceipts}
    />
  )
}
