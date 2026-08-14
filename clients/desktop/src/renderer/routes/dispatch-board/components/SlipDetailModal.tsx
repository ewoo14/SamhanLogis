/**
 * SlipDetailModal — 배차 보드에서 출고전표 row click 시 진입하는 상세 modal.
 *
 * <p>Phase A FE-5.2.
 *
 * <p>slip-service `GET /admin/dispatch-board/slips/{id}` 호출 → 출고전표 인쇄 본문을 미리보기로 표시.
 * 본 모달은 배차 보드 진입 시 문서 확인 용도 — 정식 수정/취소는 `/sales/:id` 페이지에서 처리.
 *
 * UUID 비공개:
 * - 모달에 노출되는 식별자 = slipNumber / partnerCode / partnerName / 인수자 phone / address / 라인 modelName.
 * - id (slip UUID) 는 GET path 에만 사용.
 */
import { useQuery } from '@tanstack/react-query'
import { Button, Modal } from '@samhan/design-system'
import { getDispatchBoardSlipDetail } from '../../../api/dispatchBoard'
import { listWarehouses, type Warehouse } from '../../../api/inventory'
import { fetchApprovalLineStructure } from '../../../api/approvalLineConfigApi'
import { DispatchDocument } from '../../../print/DispatchDocument'

interface SlipDetailModalProps {
  slipId: string
  onClose: () => void
}

export function SlipDetailModal({ slipId, onClose }: SlipDetailModalProps) {
  const query = useQuery({
    queryKey: ['dispatchBoard', 'slipDetail', slipId],
    queryFn: () => getDispatchBoardSlipDetail(slipId),
    enabled: !!slipId,
  })
  const slip = query.data
  const warehousesQuery = useQuery<Warehouse[]>({
    queryKey: ['warehouses'],
    queryFn: listWarehouses,
    enabled: !!slipId,
  })
  const approvalLineStructureQuery = useQuery({
    queryKey: ['approval-line-structure', 'SLIP_OUTBOUND'],
    queryFn: () => fetchApprovalLineStructure('SLIP_OUTBOUND'),
    enabled: !!slipId,
  })

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
      description={slip ? '출고전표 미리보기' : undefined}
      size="xl"
      // body 가 DispatchDocument(자체 인쇄 대상 문서)를 담고 있어 인쇄 시 모달 크롬을
      // 뺀다(opt-in). PR #921 chore-B R4 — CODEX SOL 2차 적대검증 A-1: 이 opt-in 없이
      // 크롬 숨김을 전 모달에 적용했던 R-3 회귀의 fix.
      printableBody
      footer={
        <Button
          type="button"
          variant="primary"
          size="sm"
          onClick={onClose}
          data-testid="dispatch-board-slip-detail-close"
        >
          닫기
        </Button>
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
            <span>기사 연락처: {slip.driverPhone ?? '-'}</span>
          </section>

          <section
            aria-label="출고전표 문서 미리보기"
            tabIndex={0}
            style={{
              overflowX: 'auto',
              overflowY: 'visible',
              padding: '8px 0 10px',
            }}
          >
            {/* A4(210mm) 문서를 1:1 로 렌더하고 모달 body 세로 스크롤에 위임 — 인쇄용 useFitOneA4 zoom 축소는
                스크롤 모달에선 글자 과축소로 판독성 저하(리뷰 라운드1 Design/FE HIGH). Modal size xl 로 폭 수용. */}
            <div style={{ width: 'fit-content', margin: '0 auto' }}>
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
