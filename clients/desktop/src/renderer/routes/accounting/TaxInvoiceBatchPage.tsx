/**
 * 세금계산서 일괄발행 (홈택스 양식) 페이지 — `/accounting/tax-invoices/batch`.
 *
 * <p>PR #161 4탭 UI 는 {@code HometaxExportPage} (`/accounting/hometax-export`) 로 흡수됨.
 * 이 컴포넌트는 URL 북마크 호환을 위한 redirect 전용 wrapper 로 축소.
 *
 * @deprecated 신규 URL 은 `/accounting/hometax-export`. 이 route 는 redirect 전용.
 */
import { Navigate } from 'react-router-dom'

export function TaxInvoiceBatchPage() {
  return <Navigate to="/accounting/hometax-export" replace />
}
