import { useQuery } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router-dom'
import { Button } from '@samhan/design-system'
import {
  listWebPartnerOrderDraftSummaries,
  listWebQuoteSnapshotSummaries,
} from '../api/estimateSourceApi'
import { usePageTitle } from '../hooks/usePageTitle'

type SourceKind = 'snapshot' | 'draft'

/** 웹 저장 견적/주문서의 읽기 전용 상세 진입 화면. 목록과 동일한 UUID-free 요약 API를 사용한다. */
export function WebEstimateSourceDetailPage({ kind }: { kind: SourceKind }) {
  const navigate = useNavigate()
  const { id = '' } = useParams<{ id: string }>()
  const query = useQuery({
    queryKey: ['web-estimate-source-detail', kind, id],
    queryFn: async () => {
      if (kind === 'snapshot') {
        return (await listWebQuoteSnapshotSummaries()).find((row) => row.snapshotKey === id) ?? null
      }
      return (await listWebPartnerOrderDraftSummaries()).find((row) => row.draftKey === id) ?? null
    },
  })

  usePageTitle('웹 저장 상세', query.data?.documentLabel)

  if (query.isLoading) return <div>불러오는 중입니다.</div>
  if (query.isError || !query.data) return <div role="alert">웹 저장 상세를 찾을 수 없습니다.</div>

  const item = query.data
  const isSnapshot = kind === 'snapshot'
  const created = isSnapshot
    ? (item as Awaited<ReturnType<typeof listWebQuoteSnapshotSummaries>>[number]).created
    : (item as Awaited<ReturnType<typeof listWebPartnerOrderDraftSummaries>>[number]).createdAt
  const amount = item.totalAmount ?? 0

  return (
    <main>
      <Button type="button" variant="secondary" onClick={() => navigate('/sales/estimates')}>
        목록으로
      </Button>
      <h1>{isSnapshot ? '웹 종합견적서 상세' : '웹 주문서 상세'}</h1>
      <dl>
        <dt>문서번호</dt><dd>{item.documentLabel}</dd>
        <dt>저장일시</dt><dd>{created}</dd>
        <dt>금액</dt><dd>{String(amount)}</dd>
        {!isSnapshot && (
          <><dt>거래처 코드</dt><dd>{(item as Awaited<ReturnType<typeof listWebPartnerOrderDraftSummaries>>[number]).partnerCode ?? ''}</dd></>
        )}
      </dl>
    </main>
  )
}
