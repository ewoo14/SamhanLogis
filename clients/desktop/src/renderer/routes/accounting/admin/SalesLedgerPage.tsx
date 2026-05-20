import { listSalesLedgers } from '../../../api/accountingAdminApi'
import { LedgerList } from './LedgerList'

export function SalesLedgerPage() {
  return (
    <LedgerList
      title="매출 원장 대조"
      testId="mig14-sales-ledger-page"
      queryKey="mig14-sales-ledgers"
      emptyMessage="조회된 매출 원장 데이터가 없습니다."
      loadRows={listSalesLedgers}
    />
  )
}
