import { listPurchaseLedgers } from '../../../api/accountingAdminApi'
import { LedgerList } from './LedgerList'

export function PurchaseLedgerPage() {
  return (
    <LedgerList
      title="매입 원장 대조"
      testId="mig14-purchase-ledger-page"
      queryKey="mig14-purchase-ledgers"
      emptyMessage="조회된 매입 원장 데이터가 없습니다."
      loadRows={listPurchaseLedgers}
    />
  )
}
