import { useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { PartnerLedgerView } from './PartnerLedgerView'

/** 거래처 원장 일괄 인쇄 화면. 선택 코드는 내부 query로만 전달하고 각 원장을 연속 렌더링한다. */
export function PartnerLedgerBatchView() {
  const [searchParams] = useSearchParams()
  const partnerCodes = useMemo(
    () => searchParams.getAll('partnerCodes').map((code) => code.trim()).filter(Boolean),
    [searchParams],
  )

  if (partnerCodes.length === 0) {
    return <div data-testid="partner-ledger-batch-print-area">선택한 거래처가 없습니다.</div>
  }

  return (
    <div data-testid="partner-ledger-batch-print-area">
      {partnerCodes.map((code) => <PartnerLedgerView key={code} partnerCode={code} />)}
    </div>
  )
}
