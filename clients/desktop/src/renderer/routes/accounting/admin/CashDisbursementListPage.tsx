import { listCashDisbursements } from '../../../api/accountingAdminApi'
import { CashTransactionList } from './CashTransactionList'

export function CashDisbursementListPage() {
  return (
    <CashTransactionList
      title="지출 트랜잭션"
      testId="mig14-cash-disbursement-page"
      queryKey="mig14-cash-disbursements"
      emptyMessage="조회된 지출 트랜잭션이 없습니다."
      loadRows={listCashDisbursements}
    />
  )
}
