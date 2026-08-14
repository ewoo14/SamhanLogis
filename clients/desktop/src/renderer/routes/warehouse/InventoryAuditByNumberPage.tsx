import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { listAudits } from '../../api/auditApi'
import { InventoryAuditDetailPage } from '../InventoryAuditDetailPage'

/** 실사번호만 URL에 남기고 목록에서 내부 상세 키를 해석한다. UUID는 URL에 노출하지 않는다. */
export function InventoryAuditByNumberPage() {
  const [searchParams] = useSearchParams()
  const auditNo = searchParams.get('auditNo')?.trim() ?? ''
  const query = useQuery({
    queryKey: ['inventory-audit-by-number', auditNo],
    queryFn: () => listAudits({ page: 0, size: 100 }),
    enabled: auditNo.length > 0,
    retry: false,
  })
  if (!auditNo) return <p role="alert">실사번호가 없습니다.</p>
  if (query.isError) return <p role="alert">재고 실사를 찾을 수 없거나 열람 권한이 없습니다.</p>
  if (!query.data) return <p role="status">재고 실사를 불러오는 중입니다.</p>
  const audit = query.data.content.find((row) => row.auditNo === auditNo)
  if (!audit) return <p role="alert">해당 재고 실사를 찾을 수 없습니다.</p>
  return <InventoryAuditDetailPage opaqueAuditId={audit.id} />
}
