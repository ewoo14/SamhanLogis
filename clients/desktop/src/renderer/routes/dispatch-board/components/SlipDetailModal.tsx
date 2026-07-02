/**
 * SlipDetailModal — 배차 보드에서 출고전표 row click 시 진입하는 상세 modal.
 *
 * <p>Phase A FE-5.2.
 *
 * <p>slip-service `GET /slips/{id}` 호출 → 판매전표 인쇄 본문을 미리보기로 표시.
 * 본 모달은 배차 보드 진입 시 문서 확인 용도 — 정식 수정/취소는 `/sales/:id` 페이지에서 처리.
 *
 * UUID 비공개:
 * - 모달에 노출되는 식별자 = slipNumber / partnerCode / partnerName / 인수자 phone / address / 라인 modelName.
 * - id (slip UUID) 는 GET path 에만 사용.
 */
import { useQuery } from '@tanstack/react-query'
import { Modal } from '@samhan/design-system'
import { getSlip } from '../../../api/slip'
import { listWarehouses, type Warehouse } from '../../../api/inventory'
import { fetchApprovalLineStructure } from '../../../api/approvalLineConfigApi'
import { DispatchDocument } from '../../../print/DispatchDocument'
import { useFitOneA4 } from '../../../print/useFitOneA4'

interface SlipDetailModalProps {
  slipId: string
  onClose: () => void
}

export function SlipDetailModal({ slipId, onClose }: SlipDetailModalProps) {
  const query = useQuery({
    queryKey: ['dispatchBoard', 'slipDetail', slipId],
    queryFn: () => getSlip(slipId),
    enabled: !!slipId,
  })
  const slip = query.data
  const warehousesQuery = useQuery<Warehouse[]>({
    queryKey: ['warehouses'],
    queryFn: listWarehouses,
    enabled: !!slip,
  })
  const approvalLineStructureQuery = useQuery({
    queryKey: ['approval-line-structure', 'SLIP_OUTBOUND'],
    queryFn: () => fetchApprovalLineStructure('SLIP_OUTBOUND'),
    enabled: !!slip,
  })

  // 판매전표 A4 본문을 모달 폭 안에서 잘리지 않게 높이 기준으로 축소한다.
  const { ref: fitRef, zoom } = useFitOneA4<HTMLDivElement>([
    slip?.lines?.length ?? 0,
    approvalLineStructureQuery.data?.length ?? 0,
  ])

  const title = slip ? `출고전표 ${slip.slipNo}` : '출고전표 상세'
  const sourceWarehouseName =
    warehousesQuery.isSuccess
      ? warehousesQuery.data.find((w) => w.id === slip?.sourceWarehouseId)?.name ?? '-'
      : '-'
  const approvalRoles = approvalLineStructureQuery.isSuccess
    ? approvalLineStructureQuery.data
    : null

  return (
    <Modal
      open
      onClose={onClose}
      title={title}
      description={slip ? '판매전표 미리보기' : undefined}
      size="lg"
      footer={
        <button
          type="button"
          onClick={onClose}
          data-testid="dispatch-board-slip-detail-close"
          style={{
            padding: '8px 16px',
            background: 'var(--color-action-brand, #1E40AF)',
            color: 'var(--color-neutral-0)',
            border: 'none',
            borderRadius: 4,
            cursor: 'pointer',
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          닫기
        </button>
      }
    >
      {query.isLoading ? (
        <div style={{ padding: 12, fontSize: 13, color: 'var(--color-neutral-500)' }}>
          출고전표를 불러오는 중…
        </div>
      ) : query.isError ? (
        <div
          style={{ padding: 12, fontSize: 13, color: 'var(--color-danger-500)' }}
          role="alert"
        >
          출고전표 조회 실패. 잠시 후 다시 시도해주세요.
        </div>
      ) : slip ? (
        <div
          data-testid="dispatch-board-slip-detail-body"
          style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
        >
          <section
            aria-label="배차 기사 정보"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              flexWrap: 'wrap',
              padding: '8px 10px',
              border: '1px solid var(--color-neutral-200)',
              borderRadius: 4,
              background: 'var(--color-neutral-50)',
              fontSize: 13,
            }}
          >
            <span style={{ fontWeight: 600 }}>기사: {slip.driverName ?? '-'}</span>
            <span style={{ color: 'var(--color-neutral-500)' }}>|</span>
            <span>연락처: {slip.driverPhone ?? '-'}</span>
          </section>

          <section
            aria-label="판매전표 문서 미리보기"
            style={{
              overflowX: 'auto',
              overflowY: 'visible',
              padding: '8px 0 10px',
            }}
          >
            <div
              ref={fitRef}
              style={{
                zoom,
                width: 'fit-content',
                minWidth: '210mm',
                margin: '0 auto',
              }}
            >
              <DispatchDocument
                slip={slip}
                roles={approvalRoles}
                sourceWarehouseName={sourceWarehouseName}
              />
            </div>
          </section>
        </div>
      ) : null}
    </Modal>
  )
}
