/**
 * 입고 검수 Dialog — InboundInspectionListPage / SlipListPage(INBOUND) 에서 호출.
 *
 * 기능:
 * - 슬립 헤더 표시 (slipNo / 거래처 / 입고창고 / 입고일 / 검수자 / 상태)
 * - 라인 표 (modelCode / expectedQty / inspectedQty input / defectQty input / DiffBadge / defectReason input)
 * - 행 배경: defectQty>0 -> danger-tint / inspectedQty!=expectedQty -> warning-tint
 * - DiffBadge: inspectedQty!=expectedQty 시 표시
 * - 자동 합계 (정상 수량 = inspectedQty minus defectQty)
 * - 검수 저장 -> POST /inspect (PENDING 유지)
 * - 검수 완료 -> alertdialog 2단계 확인 -> POST /complete 재고 적용
 *
 * UUID 비공개 가드: slipId 는 API 호출에만 사용. 화면 표시 X.
 *
 * data-testid (Designer spec):
 * - inbound-inspection-dialog
 * - inbound-inspection-line-{lineId}
 * - inbound-inspection-line-{lineId}-inspected-qty
 * - inbound-inspection-line-{lineId}-defect-qty
 * - inbound-inspection-line-{lineId}-defect-reason-row
 * - inbound-inspection-line-{lineId}-defect-reason
 * - inbound-inspection-save-button
 * - inbound-inspection-complete-button
 */
import { useEffect, useReducer, useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Badge,
  Button,
  Modal,
  Spinner,
} from '@samhan/design-system'
import {
  getInboundInspection,
  inspectInbound,
  completeInboundInspection,
  INSPECTION_STATUS_LABEL,
  type InboundInspectionLine,
  type InboundInspectionStatus,
} from '../../api/inboundInspectionApi'

interface LineState {
  lineId: string
  modelCode: string
  productName: string | null
  expectedQty: number
  inspectedQty: number
  defectQty: number
  defectReason: string
}

type LineAction =
  | { type: 'SET_INSPECTED'; lineId: string; value: number }
  | { type: 'SET_DEFECT'; lineId: string; value: number }
  | { type: 'SET_REASON'; lineId: string; value: string }
  | { type: 'RESET'; lines: InboundInspectionLine[] }

function lineReducer(state: LineState[], action: LineAction): LineState[] {
  switch (action.type) {
    case 'RESET':
      return action.lines.map((l) => ({
        lineId: l.lineId,
        modelCode: l.modelCode,
        productName: l.productName,
        expectedQty: l.expectedQty,
        inspectedQty: l.inspectedQty,
        defectQty: l.defectQty,
        defectReason: l.defectReason ?? '',
      }))
    case 'SET_INSPECTED':
      return state.map((l) =>
        l.lineId === action.lineId ? { ...l, inspectedQty: action.value } : l,
      )
    case 'SET_DEFECT':
      return state.map((l) =>
        l.lineId === action.lineId ? { ...l, defectQty: action.value } : l,
      )
    case 'SET_REASON':
      return state.map((l) =>
        l.lineId === action.lineId ? { ...l, defectReason: action.value } : l,
      )
    default:
      return state
  }
}

const STATUS_VARIANT: Record<InboundInspectionStatus, 'neutral' | 'warning' | 'success' | 'danger'> = {
  PENDING: 'warning',
  COMPLETED: 'success',
  CANCELED: 'danger',
}

function DiffBadge({ inspected, expected }: { inspected: number; expected: number }) {
  const diff = inspected - expected
  if (diff === 0) return null
  const positive = diff > 0
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        marginLeft: 6,
        padding: '1px 5px',
        borderRadius: 4,
        fontSize: 11,
        fontWeight: 600,
        background: positive ? 'var(--color-warning-100)' : 'var(--color-danger-100)',
        color: positive ? 'var(--color-warning-700)' : 'var(--color-danger-700)',
      }}
    >
      {positive ? `▲+${diff.toLocaleString()}` : `▼${diff.toLocaleString()}`}
    </span>
  )
}

export interface InboundInspectionDialogProps {
  slipId: string
  open: boolean
  onClose: () => void
  onSuccess?: () => void
}

export function InboundInspectionDialog({
  slipId,
  open,
  onClose,
  onSuccess,
}: InboundInspectionDialogProps) {
  const qc = useQueryClient()
  const [lines, dispatch] = useReducer(lineReducer, [])
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const firstInputRef = useRef<HTMLInputElement | null>(null)

  const detailQuery = useQuery({
    queryKey: ['inbound-inspection', slipId],
    queryFn: () => getInboundInspection(slipId),
    enabled: open && !!slipId,
  })

  useEffect(() => {
    if (detailQuery.data) {
      dispatch({ type: 'RESET', lines: detailQuery.data.lines })
    }
  }, [detailQuery.data])

  useEffect(() => {
    if (open) {
      setErrorMsg(null)
      setSuccessMsg(null)
      setConfirmOpen(false)
    }
  }, [open])

  useEffect(() => {
    if (lines.length > 0 && firstInputRef.current) {
      firstInputRef.current.focus()
    }
  }, [lines.length])

  const saveMutation = useMutation({
    mutationFn: () =>
      inspectInbound(slipId, {
        lines: lines.map((l) => ({
          lineId: l.lineId,
          inspectedQty: l.inspectedQty,
          defectQty: l.defectQty,
          defectReason: l.defectReason || null,
        })),
      }),
    onSuccess: () => {
      setErrorMsg(null)
      setSuccessMsg('검수 내용이 임시 저장되었습니다.')
      void qc.invalidateQueries({ queryKey: ['inbound-inspection', slipId] })
      void qc.invalidateQueries({ queryKey: ['inbound-inspections'] })
    },
    onError: () => {
      setErrorMsg('검수 저장에 실패했습니다. 잠시 후 다시 시도하세요.')
    },
  })

  const completeMutation = useMutation({
    mutationFn: () => completeInboundInspection(slipId),
    onSuccess: () => {
      setErrorMsg(null)
      setSuccessMsg('검수가 완료되어 재고에 반영되었습니다.')
      setConfirmOpen(false)
      void qc.invalidateQueries({ queryKey: ['inbound-inspection', slipId] })
      void qc.invalidateQueries({ queryKey: ['inbound-inspections'] })
      void qc.invalidateQueries({ queryKey: ['slips', 'list', 'INBOUND'] })
      onSuccess?.()
    },
    onError: () => {
      setErrorMsg('검수 완료에 실패했습니다. 잠시 후 다시 시도하세요.')
      setConfirmOpen(false)
    },
  })

  const detail = detailQuery.data
  const isCompleted = detail?.status === 'COMPLETED'
  const isBusy = saveMutation.isPending || completeMutation.isPending

  function normalQty(l: LineState): number {
    return Math.max(0, l.inspectedQty - l.defectQty)
  }

  function validationError(): string | null {
    for (const l of lines) {
      if (l.defectQty > l.inspectedQty) {
        return `${l.modelCode}: 불량 수량이 검수 수량을 초과합니다.`
      }
      if (l.defectQty > 0 && l.defectReason.trim().length === 0) {
        return `${l.modelCode}: 불량 수량이 1 이상이면 불량 사유를 입력해야 합니다.`
      }
    }
    return null
  }

  function handleSave() {
    const err = validationError()
    if (err) { setErrorMsg(err); return }
    setErrorMsg(null)
    saveMutation.mutate()
  }

  function handleCompleteRequest() {
    const err = validationError()
    if (err) { setErrorMsg(err); return }
    setErrorMsg(null)
    setConfirmOpen(true)
  }

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        size="xl"
        title="입고 검수"
        data-testid="inbound-inspection-dialog"
        footer={
          isCompleted ? (
            <Button variant="secondary" onClick={onClose}>닫기</Button>
          ) : (
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <Button variant="secondary" onClick={onClose} disabled={isBusy}>취소</Button>
              <Button
                variant="secondary"
                onClick={handleSave}
                disabled={isBusy}
                data-testid="inbound-inspection-save-button"
              >
                검수 저장
              </Button>
              <Button
                variant="primary"
                onClick={handleCompleteRequest}
                disabled={isBusy}
                data-testid="inbound-inspection-complete-button"
              >
                검수 완료
              </Button>
            </div>
          )
        }
      >
        {detailQuery.isLoading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 32 }}>
            <Spinner size="lg" />
          </div>
        ) : detailQuery.isError ? (
          <div className="error-banner" role="alert">검수 정보를 불러오지 못했습니다.</div>
        ) : detail ? (
          <>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr 1fr',
                gap: '8px 24px',
                marginBottom: 20,
                fontSize: 13,
              }}
            >
              <div>
                <span style={{ color: 'var(--color-neutral-500)', marginRight: 8 }}>전표번호</span>
                <strong>{detail.slipNo}</strong>
              </div>
              <div>
                <span style={{ color: 'var(--color-neutral-500)', marginRight: 8 }}>상태</span>
                <Badge variant={STATUS_VARIANT[detail.status]}>{INSPECTION_STATUS_LABEL[detail.status]}</Badge>
              </div>
              <div>
                <span style={{ color: 'var(--color-neutral-500)', marginRight: 8 }}>입고창고</span>
                {detail.destinationWarehouseName ?? '—'}
              </div>
              <div>
                <span style={{ color: 'var(--color-neutral-500)', marginRight: 8 }}>거래처</span>
                {detail.partnerName ?? '—'}
              </div>
              <div>
                <span style={{ color: 'var(--color-neutral-500)', marginRight: 8 }}>입고일</span>
                {detail.slipDate ?? '—'}
              </div>
              <div>
                <span style={{ color: 'var(--color-neutral-500)', marginRight: 8 }}>검수자</span>
                {detail.inspectorName ?? '—'}
              </div>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: 'var(--color-neutral-50)' }}>
                    {['모델코드', '예정 수량', '검수 수량', '불량 수량', '정상 수량', '불량 사유'].map((h) => (
                      <th
                        key={h}
                        style={{
                          padding: '8px 10px',
                          textAlign: 'left',
                          fontWeight: 600,
                          borderBottom: '1px solid var(--color-neutral-200)',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line, idx) => {
                    const defectError = line.defectQty > line.inspectedQty
                    const hasDefect = line.defectQty > 0
                    const hasDiff = line.inspectedQty !== line.expectedQty
                    const rowBg = hasDefect
                      ? 'var(--color-danger-50)'
                      : hasDiff
                        ? 'var(--color-warning-50)'
                        : undefined
                    return (
                      <tr
                        key={line.lineId}
                        data-testid={`inbound-inspection-line-${line.lineId}`}
                        style={{ borderBottom: '1px solid var(--color-neutral-100)', background: rowBg }}
                      >
                        <td style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>
                          <div style={{ fontWeight: 500 }}>{line.modelCode}</div>
                          {line.productName ? (
                            <div style={{ fontSize: 11, color: 'var(--color-neutral-500)' }}>{line.productName}</div>
                          ) : null}
                        </td>
                        <td style={{ padding: '8px 10px', textAlign: 'right', color: 'var(--color-neutral-600)' }}>
                          {line.expectedQty.toLocaleString()}
                        </td>
                        <td style={{ padding: '8px 10px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <input
                              ref={idx === 0 ? firstInputRef : undefined}
                              type="number"
                              min={0}
                              value={line.inspectedQty}
                              disabled={isCompleted || isBusy}
                              aria-label={`${line.modelCode} 검수 수량`}
                              data-testid={`inbound-inspection-line-${line.lineId}-inspected-qty`}
                              style={numInputStyle(defectError)}
                              onChange={(e) =>
                                dispatch({ type: 'SET_INSPECTED', lineId: line.lineId, value: Math.max(0, Number(e.target.value)) })
                              }
                            />
                            <DiffBadge inspected={line.inspectedQty} expected={line.expectedQty} />
                          </div>
                        </td>
                        <td style={{ padding: '8px 10px' }}>
                          <input
                            type="number"
                            min={0}
                            value={line.defectQty}
                            disabled={isCompleted || isBusy}
                            aria-label={`${line.modelCode} 불량 수량`}
                            data-testid={`inbound-inspection-line-${line.lineId}-defect-qty`}
                            style={numInputStyle(defectError)}
                            onChange={(e) =>
                              dispatch({ type: 'SET_DEFECT', lineId: line.lineId, value: Math.max(0, Number(e.target.value)) })
                            }
                          />
                          {defectError ? (
                            <div role="alert" style={{ fontSize: 11, color: 'var(--color-danger-600)', marginTop: 2 }}>
                              불량 수량이 검수 수량을 초과합니다
                            </div>
                          ) : null}
                        </td>
                        <td
                          style={{
                            padding: '8px 10px',
                            textAlign: 'right',
                            fontWeight: 500,
                            color: normalQty(line) < line.expectedQty ? 'var(--color-warning-600)' : 'inherit',
                          }}
                        >
                          {normalQty(line).toLocaleString()}
                        </td>
                        <td
                          style={{ padding: '8px 10px', minWidth: 160 }}
                          data-testid={`inbound-inspection-line-${line.lineId}-defect-reason-row`}
                        >
                          <input
                            type="text"
                            value={line.defectReason}
                            placeholder={line.defectQty > 0 ? '불량 사유 입력 (필수)' : '—'}
                            disabled={isCompleted || isBusy || line.defectQty === 0}
                            aria-label={`${line.modelCode} 불량 사유`}
                            data-testid={`inbound-inspection-line-${line.lineId}-defect-reason`}
                            style={{
                              ...reasonInputStyle,
                              borderColor: line.defectQty > 0 && !line.defectReason.trim() ? 'var(--color-danger-400)' : undefined,
                            }}
                            onChange={(e) =>
                              dispatch({ type: 'SET_REASON', lineId: line.lineId, value: e.target.value })
                            }
                          />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                {lines.length > 0 ? (
                  <tfoot>
                    <tr style={{ background: 'var(--color-neutral-50)', fontWeight: 600 }}>
                      <td style={{ padding: '8px 10px' }} colSpan={1}>합계</td>
                      <td style={{ padding: '8px 10px', textAlign: 'right', color: 'var(--color-neutral-600)' }}>
                        {lines.reduce((s, l) => s + l.expectedQty, 0).toLocaleString()}
                      </td>
                      <td style={{ padding: '8px 10px', textAlign: 'right' }}>
                        {lines.reduce((s, l) => s + l.inspectedQty, 0).toLocaleString()}
                      </td>
                      <td style={{ padding: '8px 10px', textAlign: 'right' }}>
                        {lines.reduce((s, l) => s + l.defectQty, 0).toLocaleString()}
                      </td>
                      <td style={{ padding: '8px 10px', textAlign: 'right' }}>
                        {lines.reduce((s, l) => s + normalQty(l), 0).toLocaleString()}
                      </td>
                      <td />
                    </tr>
                  </tfoot>
                ) : null}
              </table>
            </div>

            {errorMsg ? (
              <div className="error-banner" role="alert" style={{ marginTop: 12 }}>{errorMsg}</div>
            ) : null}
            {successMsg ? (
              <div
                role="status"
                style={{
                  marginTop: 12,
                  padding: '8px 12px',
                  background: 'var(--color-success-50)',
                  border: '1px solid var(--color-success-200)',
                  borderRadius: 6,
                  fontSize: 13,
                  color: 'var(--color-success-700)',
                }}
              >
                {successMsg}
              </div>
            ) : null}
          </>
        ) : null}
      </Modal>

      {confirmOpen ? (
        <div
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="inbound-confirm-title"
          aria-describedby="inbound-confirm-desc"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1100,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(15, 18, 22, 0.55)',
          }}
        >
          <div
            style={{
              background: 'var(--color-bg)',
              borderRadius: 8,
              padding: '28px 32px',
              maxWidth: 400,
              width: '100%',
              boxShadow: 'var(--shadow-modal)',
            }}
          >
            <h3 id="inbound-confirm-title" style={{ margin: '0 0 8px', fontSize: 16, fontWeight: 600 }}>
              검수 완료 확인
            </h3>
            <p id="inbound-confirm-desc" style={{ margin: '0 0 24px', fontSize: 13, color: 'var(--color-neutral-600)' }}>
              검수를 완료하면 재고에 즉시 반영됩니다.
              완료 후에는 수정이 불가합니다. 계속하시겠습니까?
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <Button variant="secondary" onClick={() => setConfirmOpen(false)} disabled={completeMutation.isPending}>
                취소
              </Button>
              <Button variant="primary" onClick={() => completeMutation.mutate()} disabled={completeMutation.isPending}>
                {completeMutation.isPending ? '처리 중...' : '검수 완료'}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}

function numInputStyle(error: boolean): React.CSSProperties {
  return {
    width: 72,
    height: 32,
    padding: '0 8px',
    border: `1px solid ${error ? 'var(--color-danger-500)' : 'var(--color-neutral-300)'}`,
    borderRadius: 4,
    fontSize: 13,
    textAlign: 'right',
  }
}

const reasonInputStyle: React.CSSProperties = {
  width: '100%',
  height: 32,
  padding: '0 8px',
  border: '1px solid var(--color-neutral-300)',
  borderRadius: 4,
  fontSize: 13,
}