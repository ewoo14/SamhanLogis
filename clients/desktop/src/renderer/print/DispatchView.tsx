/**
 * 출고전표 작업지시서 인쇄 미리보기 — `/sales/:id/print/dispatch`.
 *
 * PR #21 hotfix v2 — 개발책임자 첨부 이미지 기준 큰 재디자인.
 *
 * 2026-06-10 원본 양식 정렬 (개발책임자 샘플 이미지 재첨부 — docs/sample, 비커밋):
 * - 라인 표 4-col = 월/일 / 품목명(모델명+품목명 결합) / 규격 / 수량 — PR #21 의
 *   "월/일 열 제거" 결정을 원본 양식 반영 지시가 대체.
 * - 결재란 마지막 칸 "결 제" + 발행일 MMDD 표시 (샘플 '0610').
 * - 품목 다량 시 한 A4 자동 비율 축소 (useFitOneA4).
 *
 * 변경 요점 (PR #21 당시):
 * - 라인 표 4-col (모델명/품목명/규격/수량) — 월/일 열 제거 (사용자 명시)
 * - 헤더: SAMSUNG 로고 풀 스트립 + 큰 거래처명 박스 (좌) + 결재란 5칸 (우)
 * - 일련번호 박스 (좌) + 출하창고 (우, 빨강) — 창고명만 (코드 X)
 * - 배송지/연락처/특이사항 큰 박스
 * - "기사님 출발전에 수요처에 전화주세요~ 감사합니다^^" 가운데 안내
 * - "※ 제품수량 및 이상유무 확인 후 서명 必"
 * - 용달기사 서명 / 인수자 서명 — 박스 X, 라벨만
 * - 하단 안내문 "제품 인수시 ... 책임지지 않습니다."
 *
 * @page A4 portrait 12mm 여백 — global.css @media print 에 적용.
 *
 * UUID 비공개: 일련번호 `slipDate - seqNo` 만 노출. dispatcher.userId / inspector.userId
 * 는 부모로부터 받지만 화면 표시 X (이름만 표시). 출하창고 코드 미노출 (사용자 명시).
 */
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Button } from '@samhan/design-system'
import { getSlip } from '../api/slip'
import { listWarehouses, type Warehouse } from '../api/inventory'
import { fetchApprovalLineStructure } from '../api/approvalLineConfigApi'
import { usePageTitle } from '../hooks/usePageTitle'
import { stripSlipNoZeros } from '../utils/orderNo'
import { DispatchDocument } from './DispatchDocument'
import { useFitOneA4 } from './useFitOneA4'

export function DispatchView() {
  const params = useParams<{ id: string }>()
  const id = params.id ?? ''
  const navigate = useNavigate()
  const detailQuery = useQuery({
    queryKey: ['slip', id],
    queryFn: () => getSlip(id),
    enabled: !!id,
  })
  const warehousesQuery = useQuery<Warehouse[]>({
    queryKey: ['warehouses'],
    queryFn: listWarehouses,
  })
  const approvalLineStructureQuery = useQuery({
    queryKey: ['approval-line-structure', 'SLIP_OUTBOUND'],
    queryFn: () => fetchApprovalLineStructure('SLIP_OUTBOUND'),
  })

  // 한 A4 자동 비율 — 품목 수 변동 시 재측정 (개발책임자 2026-06-10)
  const { ref: fitRef, zoom } = useFitOneA4<HTMLDivElement>([
    detailQuery.data?.lines?.length ?? 0,
  ])

  const displaySlipNo = stripSlipNoZeros(detailQuery.data?.slipNo)
  usePageTitle('출고전표', displaySlipNo)

  if (!id) return null
  if (detailQuery.isLoading) return <p>불러오는 중...</p>
  if (detailQuery.isError || !detailQuery.data) {
    return (
      <div className="error-banner" role="alert">
        전표를 불러오지 못했습니다.
      </div>
    )
  }

  const slip = detailQuery.data
  const sourceWarehouseName =
    warehousesQuery.data?.find((w) => w.id === slip.sourceWarehouseId)?.name ?? '-'
  const approvalRoles = approvalLineStructureQuery.isSuccess
    ? approvalLineStructureQuery.data
    : null

  return (
    <div>
      <div className="no-print" style={{ marginBottom: 16, display: 'flex', gap: 8 }}>
        <Button variant="ghost" onClick={() => navigate(`/sales/${id}`)}>
          상세로 돌아가기
        </Button>
        <Button variant="primary" onClick={() => window.print()}>
          인쇄
        </Button>
      </div>

      <div ref={fitRef} style={{ zoom }}>
        <DispatchDocument
          slip={slip}
          roles={approvalRoles}
          sourceWarehouseName={sourceWarehouseName}
        />
      </div>
    </div>
  )
}
