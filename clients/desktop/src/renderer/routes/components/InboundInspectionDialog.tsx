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
 * - [P1] 검수 사진 viewer 섹션 — mobile-staff 에서 업로드된 사진 썸네일 + 클릭 확대
 *
 * UUID 비공개 가드: slipId 는 API 호출에만 사용. 화면 표시 X.
 * 사진 첨부 id 도 내부 삭제 요청 용도로만 사용, 화면 미노출.
 *
 * data-testid (Designer spec):
 * - inbound-inspection-dialog
 * - inbound-inspection-line-{modelCode|index}
 * - inbound-inspection-line-{modelCode|index}-inspected-qty
 * - inbound-inspection-line-{modelCode|index}-defect-qty
 * - inbound-inspection-line-{modelCode|index}-defect-reason-row
 * - inbound-inspection-line-{modelCode|index}-defect-reason
 * - inbound-inspection-save-button
 * - inbound-inspection-complete-button
 * - inbound-inspection-photo-viewer
 * - inbound-inspection-photo-thumb-{i}
 * - inbound-inspection-photo-lightbox
 */
import { useEffect, useReducer, useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Badge,
  Button,
  Input,
  Modal,
  safeActorName,
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
import {
  listInspectionAttachments,
  type AttachmentResponse,
} from '../../api/attachmentApi'
import styles from './InboundInspectionDialog.module.css'

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

function toPublicTestId(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9가-힣_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
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
        background: positive ? 'var(--state-warning-bg)' : 'var(--state-danger-bg)',
        color: positive ? 'var(--color-warning-800, #8C5C13)' : 'var(--color-danger-700)',
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
  /** 사진 lightbox 인덱스 — null 이면 닫힘. */
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)

  const detailQuery = useQuery({
    queryKey: ['inbound-inspection', slipId],
    queryFn: () => getInboundInspection(slipId),
    enabled: open && !!slipId,
  })

  /** 검수 사진 목록 — P1 사진 첨부 (mobile-staff 업로드 결과 viewer). */
  const attachmentsQuery = useQuery({
    queryKey: ['inbound-inspection-attachments', slipId],
    queryFn: () => listInspectionAttachments(slipId),
    enabled: open && !!slipId,
    staleTime: 30_000,
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
      // 검수 저장 시 BE 가 슬립 상태를 INSPECTING 으로 전환하므로 구매관리 목록도 갱신.
      void qc.invalidateQueries({ queryKey: ['slips', 'query', 'INBOUND'] })
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
      void qc.invalidateQueries({ queryKey: ['slips', 'query', 'INBOUND'] })
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
                {safeActorName(detail.inspectorName) ?? '—'}
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
                    const lineTestId = toPublicTestId(line.modelCode) || String(idx)
                    const rowBg = hasDefect
                      ? 'var(--color-danger-50)'
                      : hasDiff
                        ? 'var(--color-warning-50)'
                        : undefined
                    return (
                      <tr
                        key={line.lineId}
                        data-testid={`inbound-inspection-line-${lineTestId}`}
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
                            <Input
                              ref={idx === 0 ? firstInputRef : undefined}
                              type="number"
                              min={0}
                              value={line.inspectedQty}
                              disabled={isCompleted || isBusy}
                              aria-label={`${line.modelCode} 검수 수량`}
                              data-testid={`inbound-inspection-line-${lineTestId}-inspected-qty`}
                              inputSize="sm"
                              fullWidth={false}
                              error={defectError ? ' ' : undefined}
                              onChange={(e) =>
                                dispatch({ type: 'SET_INSPECTED', lineId: line.lineId, value: Math.max(0, Number(e.target.value)) })
                              }
                            />
                            <DiffBadge inspected={line.inspectedQty} expected={line.expectedQty} />
                          </div>
                        </td>
                        <td style={{ padding: '8px 10px' }}>
                          <Input
                            type="number"
                            min={0}
                            value={line.defectQty}
                            disabled={isCompleted || isBusy}
                            aria-label={`${line.modelCode} 불량 수량`}
                            data-testid={`inbound-inspection-line-${lineTestId}-defect-qty`}
                            inputSize="sm"
                            fullWidth={false}
                            error={defectError ? ' ' : undefined}
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
                            color: normalQty(line) < line.expectedQty ? 'var(--color-warning-800, #8C5C13)' : 'inherit',
                          }}
                        >
                          {normalQty(line).toLocaleString()}
                        </td>
                        <td
                          style={{ padding: '8px 10px', minWidth: 160 }}
                          data-testid={`inbound-inspection-line-${lineTestId}-defect-reason-row`}
                        >
                          <Input
                            type="text"
                            inputSize="sm"
                            fullWidth
                            value={line.defectReason}
                            placeholder={line.defectQty > 0 ? '불량 사유 입력 (필수)' : '—'}
                            disabled={isCompleted || isBusy || line.defectQty === 0}
                            aria-label={`${line.modelCode} 불량 사유`}
                            data-testid={`inbound-inspection-line-${lineTestId}-defect-reason`}
                            style={line.defectQty > 0 && !line.defectReason.trim() ? { borderColor: 'var(--color-danger-400)' } : undefined}
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

            {/* P1 검수 사진 viewer — mobile-staff 업로드 결과 thumbnail + lightbox */}
            <InspectionPhotoViewer
              attachments={Array.isArray(attachmentsQuery.data) ? attachmentsQuery.data : []}
              loading={attachmentsQuery.isLoading}
              lightboxIndex={lightboxIndex}
              onOpenLightbox={setLightboxIndex}
              onCloseLightbox={() => setLightboxIndex(null)}
            />
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
            className={styles.confirmDialog}
            style={{
              background: 'var(--color-bg)',
              borderRadius: 8,
              padding: '28px 32px',
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

// ---------------------------------------------------------------------------
// P1 검수 사진 Viewer 컴포넌트
// ---------------------------------------------------------------------------

/**
 * 사진 파일 크기 포맷 유틸.
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '—'
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
}

/**
 * 날짜 ISO → 한국어 표시 (짧은 형식).
 */
function fmtDateKo(iso: string | null): string {
  if (!iso) return '—'
  try {
    const d = new Date(iso)
    return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  } catch {
    return iso
  }
}

/** 첨부 유형 → 한국어 라벨. */
const ATTACHMENT_TYPE_LABEL: Record<string, string> = {
  INSPECTION: '검수 사진',
  DELIVERY: '배송 사진',
  ESTIMATE: '견적 사진',
}

interface InspectionPhotoViewerProps {
  attachments: AttachmentResponse[]
  loading: boolean
  lightboxIndex: number | null
  onOpenLightbox: (index: number) => void
  onCloseLightbox: () => void
}

/**
 * 검수 사진 뷰어 — 썸네일 그리드 + 클릭 시 lightbox 확대.
 *
 * desktop 은 사진 업로드를 하지 않으므로 viewer 전용 (업로드 = mobile-staff).
 * downloadUrl 이 null 인 경우 S3 미연동 환경으로 안내 메시지 표시.
 *
 * data-testid:
 *   - inbound-inspection-photo-viewer
 *   - inbound-inspection-photo-thumb-{i}
 *   - inbound-inspection-photo-lightbox
 */
function InspectionPhotoViewer({
  attachments,
  loading,
  lightboxIndex,
  onOpenLightbox,
  onCloseLightbox,
}: InspectionPhotoViewerProps) {
  const lightboxAttachment =
    lightboxIndex !== null ? (attachments[lightboxIndex] ?? null) : null

  return (
    <div
      style={{
        marginTop: 20,
        padding: '16px',
        background: 'var(--color-neutral-50)',
        borderRadius: 8,
        border: '1px solid var(--color-neutral-200)',
      }}
      data-testid="inbound-inspection-photo-viewer"
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginBottom: 12,
        }}
      >
        <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--color-neutral-800)' }}>
          검수 사진
        </span>
        <Badge variant="neutral">
          {loading ? '조회 중' : `${attachments.length}장`}
        </Badge>
        <span style={{ fontSize: 11, color: 'var(--color-neutral-500)', marginLeft: 'auto' }}>
          mobile-staff 에서 업로드된 사진 (업로드는 앱에서 진행)
        </span>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 20 }}>
          <Spinner size="sm" />
        </div>
      ) : attachments.length === 0 ? (
        <div
          style={{
            padding: '20px 0',
            textAlign: 'center',
            color: 'var(--color-neutral-500)',
            fontSize: 13,
          }}
        >
          첨부된 검수 사진이 없습니다.{' '}
          <span style={{ fontSize: 12 }}>
            (모바일 앱에서 [검수 사진 촬영]으로 추가 가능)
          </span>
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
            gap: 10,
          }}
        >
          {attachments.map((att, i) => (
            <AttachmentThumb
              key={att.id}
              attachment={att}
              index={i}
              onClick={() => onOpenLightbox(i)}
            />
          ))}
        </div>
      )}

      {/* Lightbox 확대 */}
      {lightboxAttachment !== null ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="사진 확대"
          data-testid="inbound-inspection-photo-lightbox"
          className={styles.lightboxOverlay}
          onClick={onCloseLightbox}
        >
          <div
            className={styles.lightboxDialog}
            onClick={(e) => e.stopPropagation()}
          >
            {/* 사진 영역 */}
            {lightboxAttachment.downloadUrl ? (
              <img
                src={lightboxAttachment.downloadUrl}
                alt={lightboxAttachment.fileName}
                style={{
                  width: '100%',
                  maxHeight: 500,
                  objectFit: 'contain',
                  background: '#111',
                  display: 'block',
                }}
              />
            ) : (
              <div
                style={{
                  height: 240,
                  background: 'var(--color-neutral-100)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexDirection: 'column',
                  gap: 8,
                  color: 'var(--color-neutral-500)',
                  fontSize: 13,
                }}
              >
                <span style={{ fontSize: 32 }}>사진 없음</span>
                <span>S3 연동 후 이미지 URL 이 제공됩니다</span>
              </div>
            )}
            {/* 메타 정보 */}
            <div
              style={{
                padding: '14px 18px',
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '6px 24px',
                fontSize: 12,
                color: 'var(--color-neutral-700)',
                borderTop: '1px solid var(--color-neutral-200)',
              }}
            >
              <MetaRow label="파일명" value={lightboxAttachment.fileName} />
              <MetaRow label="유형" value={ATTACHMENT_TYPE_LABEL[lightboxAttachment.attachmentType] ?? lightboxAttachment.attachmentType} />
              <MetaRow label="크기" value={formatBytes(lightboxAttachment.fileSize)} />
              <MetaRow label="촬영 시각" value={fmtDateKo(lightboxAttachment.capturedAt)} />
              <MetaRow label="업로드" value={safeActorName(lightboxAttachment.uploadedBy) ?? '업로더 확인 필요'} />
              <MetaRow label="업로드 시각" value={fmtDateKo(lightboxAttachment.uploadedAt)} />
              {lightboxAttachment.exifGpsLat && lightboxAttachment.exifGpsLng ? (
                <MetaRow
                  label="GPS"
                  value={`${lightboxAttachment.exifGpsLat}, ${lightboxAttachment.exifGpsLng}`}
                  colSpan
                />
              ) : null}
            </div>
            <div style={{ padding: '10px 18px', borderTop: '1px solid var(--color-neutral-200)', display: 'flex', justifyContent: 'flex-end' }}>
              <Button variant="secondary" onClick={onCloseLightbox}>닫기</Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

interface AttachmentThumbProps {
  attachment: AttachmentResponse
  index: number
  onClick: () => void
}

function AttachmentThumb({ attachment, index, onClick }: AttachmentThumbProps) {
  const hasImage = !!attachment.downloadUrl && attachment.contentType.startsWith('image/')
  return (
    <button
      type="button"
      data-testid={`inbound-inspection-photo-thumb-${index}`}
      onClick={onClick}
      aria-label={`${attachment.fileName} 사진 확대`}
      style={{
        border: '1px solid var(--color-neutral-300)',
        borderRadius: 6,
        overflow: 'hidden',
        cursor: 'pointer',
        padding: 0,
        background: 'transparent',
        textAlign: 'left',
        width: '100%',
        transition: 'box-shadow 0.15s',
      }}
      onMouseEnter={(e) => {
        ;(e.currentTarget as HTMLButtonElement).style.boxShadow = '0 0 0 2px var(--color-brand-400)'
      }}
      onMouseLeave={(e) => {
        ;(e.currentTarget as HTMLButtonElement).style.boxShadow = 'none'
      }}
    >
      {/* 썸네일 이미지 영역 */}
      {hasImage ? (
        <img
          src={attachment.downloadUrl!}
          alt={attachment.fileName}
          style={{
            width: '100%',
            height: 100,
            objectFit: 'cover',
            display: 'block',
            background: 'var(--color-neutral-100)',
          }}
        />
      ) : (
        <div
          style={{
            height: 100,
            background: 'var(--color-neutral-100)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 11,
            color: 'var(--color-neutral-500)',
          }}
        >
          {attachment.contentType.startsWith('image/') ? '미리보기 없음' : '사진'}
        </div>
      )}
      {/* 메타 */}
      <div style={{ padding: '6px 8px', background: 'var(--color-bg)' }}>
        <div
          style={{
            fontSize: 11,
            fontWeight: 500,
            color: 'var(--color-neutral-800)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
          title={attachment.fileName}
        >
          {attachment.fileName}
        </div>
        <div style={{ fontSize: 10, color: 'var(--color-neutral-500)', marginTop: 2 }}>
          {formatBytes(attachment.fileSize)} · {fmtDateKo(attachment.capturedAt ?? attachment.uploadedAt)}
        </div>
      </div>
    </button>
  )
}

interface MetaRowProps {
  label: string
  value: string
  colSpan?: boolean
}

function MetaRow({ label, value, colSpan = false }: MetaRowProps) {
  return (
    <div style={colSpan ? { gridColumn: '1 / -1' } : undefined}>
      <span style={{ color: 'var(--color-neutral-500)', marginRight: 6 }}>{label}</span>
      <span style={{ fontWeight: 500 }}>{value}</span>
    </div>
  )
}
