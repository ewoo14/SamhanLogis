import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { fetchExternalDispatchPrintData } from '../api/externalDispatch'
import { usePageTitle } from '../hooks/usePageTitle'
import { ExternalDispatchRequestDocument } from './ExternalDispatchRequestDocument'
import { PrintLayout } from './PrintLayout'
import { useFitOneA4 } from './useFitOneA4'

/** 타배송사 배차의뢰서 인쇄 미리보기 화면. */
export function ExternalDispatchRequestView() {
  const params = useParams<{ id: string }>()
  const id = params.id ?? ''
  const printDataQuery = useQuery({
    queryKey: ['admin', 'external-dispatches', id, 'print-data'],
    queryFn: () => fetchExternalDispatchPrintData(id),
    enabled: !!id,
  })

  const itemCount = printDataQuery.data?.items.length ?? 0
  const { ref: fitRef, zoom } = useFitOneA4<HTMLDivElement>([itemCount])
  usePageTitle('배차의뢰서', printDataQuery.data?.carrierName ?? '')

  if (!id) return null
  if (printDataQuery.isLoading) return <p>불러오는 중...</p>
  if (printDataQuery.isError || !printDataQuery.data) {
    return (
      <div className="error-banner" role="alert">
        배차의뢰서 인쇄 데이터를 불러오지 못했습니다.
      </div>
    )
  }

  return (
    <PrintLayout paper="a4-portrait" backTo="/dispatch-board" approvalDoc={false}>
      <div ref={fitRef} style={{ zoom }}>
        <ExternalDispatchRequestDocument data={printDataQuery.data} />
      </div>
    </PrintLayout>
  )
}
