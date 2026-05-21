import { listCashDisbursements } from '../../../api/accountingAdminApi'
import { CashTransactionList } from './CashTransactionList'
import { CASH_KIND_LABEL } from './Mig14AdminShared'

export function CashDisbursementListPage() {
  return (
    <CashTransactionList
      title="지출 트랜잭션"
      testId="mig14-cash-disbursement-page"
      queryKey="mig14-cash-disbursements"
      emptyMessage="조회된 지출 트랜잭션이 없습니다."
      kindLabels={CASH_KIND_LABEL}
      kindOptions={[
        { value: 'EXPENSE_VOUCHER', label: '지출결의서' },
        { value: 'MANUAL_DISBURSEMENT', label: '수기 지출' },
      ]}
      loadRows={listCashDisbursements}
    />
  )
}
