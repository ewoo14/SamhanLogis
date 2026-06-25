/**
 * vendor 발주서 OCR 업로드 (`/sales/vendor-order-upload`).
 *
 * Phase 10 PR-F2 Phase B FE — Designer mock 위에 실 BE API 연결.
 * (mock data 제거 → useMutation 패턴 + 503 graceful fallback)
 *
 * <h2>용도</h2>
 * legacy GAS #10 (에어디자이너) + #14 (제이시스템) 운송장/발주서 OCR 자동화 native
 * 이식. vendor 가 우리에게 보내준 PDF / 이미지 형태의 발주서를 desktop 에서 직접
 * OCR 하여 견적 / 주문서 line item 을 자동 생성. 사용자는 매칭 결과만 확인 후
 * 확정 → PartnerOrder 발행.
 *
 * <h2>3-step UX (Designer mock 보존)</h2>
 * <ol>
 *   <li><b>Step 1 — Upload:</b> vendor 라디오 (에어디자이너 / 제이시스템) +
 *       파일 drag-drop (.pdf, .png, .jpg, 단일) + 미리보기 + "OCR 분석 시작" →
 *       {@code uploadVendorOrder} 호출.</li>
 *   <li><b>Step 2 — Preview:</b> 좌측 OCR raw 텍스트 read-only + 우측 파싱된
 *       line item 표 (수량/단가 수정 가능, MANUAL source 행 빨간 highlight) +
 *       거래처 정보 자동 lookup + 합계 row + "다시 업로드" / "확정" →
 *       {@code confirmVendorOrder} 호출.</li>
 *   <li><b>Step 3 — Confirm:</b> 발주 생성 결과 (orderNo + 상태 + 총액) +
 *       "발주서 보기" link + "다른 vendor 업로드".</li>
 * </ol>
 *
 * <h2>설계 노트</h2>
 * <ul>
 *   <li>UUID 비공개 (feedback_uuid_no_user_visibility) — 사용자 노출 = vendorName
 *       + partnerCode + productName + orderNo 만. 내부 식별자 partnerOrderId 는
 *       link 의 path param 으로만 전달.</li>
 *   <li>풀네임 ROLE — 라우트 가드는 routes/index.tsx 에서 부여 (영업 그룹).</li>
 *   <li>한국어 라벨 100%.</li>
 *   <li>503 graceful fallback — {@link OcrDisabledError} 캐치 후 사용자 친화 메시지.</li>
 *   <li>Designer mock 색상 / Stepper / drag-drop UX 보존 — CSS module 무수정.</li>
 * </ul>
 *
 * <h2>data-testid</h2>
 * <ul>
 *   <li>{@code vendor-order-stepper}</li>
 *   <li>{@code vendor-radio-airdesigner / vendor-radio-jsystem}</li>
 *   <li>{@code vendor-order-file-input / vendor-order-drop-zone}</li>
 *   <li>{@code vendor-order-ocr-run-btn / vendor-order-confirm-btn /
 *       vendor-order-restart-btn}</li>
 *   <li>{@code vendor-order-item-row-{idx} / vendor-order-item-qty-{idx} /
 *       vendor-order-item-price-{idx}}</li>
 *   <li>{@code vendor-order-result-card / vendor-order-view-link}</li>
 * </ul>
 */
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent as ReactDragEvent,
} from 'react'
import axios from 'axios'
import { useMutation } from '@tanstack/react-query'
import { Button } from '@samhan/design-system'
import { usePageTitle } from '../hooks/usePageTitle'
import {
  confirmVendorOrder,
  OcrDisabledError,
  uploadVendorOrder,
  type VendorConfirmLine,
  type VendorName,
  type VendorOrderConfirmResponse,
  type VendorOrderUploadResponse,
  type VendorPreviewLine,
} from '../api/vendorOrderApi'
import styles from './SalesVendorOrderUploadPage.module.css'

// ---------------------------------------------------------------------------
// vendor 옵션 — BE parser VENDOR_NAME 와 1:1 (사용자 명시 2종)
// ---------------------------------------------------------------------------

interface VendorOption {
  /** BE 와 일치하는 한국어 vendor 식별자. */
  name: VendorName
  /** 사용자 보조 안내. */
  hint: string
  /** data-testid. */
  testId: string
}

const VENDOR_OPTIONS: ReadonlyArray<VendorOption> = [
  {
    name: '에어디자이너',
    hint: 'PDF·이미지 발주서 OCR 인식',
    testId: 'vendor-radio-airdesigner',
  },
  {
    name: '제이시스템',
    hint: 'PDF·이미지 발주서 OCR 인식',
    testId: 'vendor-radio-jsystem',
  },
]

// ---------------------------------------------------------------------------
// UI line item — BE PreviewLine 을 사용자 편집 가능 형태로 확장
// ---------------------------------------------------------------------------

/**
 * 표시용 line item — BE {@link VendorPreviewLine} 을 사용자 편집 가능 형태로 미러.
 *
 * <p>{@code matchFailed} 는 source 가 {@code MANUAL} (단가 누락) 또는 unitPrice/finalPrice
 * 가 0 인 경우 true — 빨간 highlight 로 사용자 보정을 유도.
 */
interface EditableLine {
  productName: string
  modelCode: string
  quantity: number
  /** 단가 (시트 또는 OCR). 사용자가 보정 시 finalPrice 로만 반영. */
  unitPrice: number
  /** DC 적용율 (0.0~1.0). 표시 전용. */
  dcRate: number
  /** 최종 단가 (DC 적용 후) — 사용자 수정 시 갱신. */
  finalPrice: number
  /** finalPrice * quantity. */
  subtotal: number
  /** 단가 source. */
  source: VendorPreviewLine['source']
  /** 매칭 실패 (MANUAL or 단가 0) — 사용자 보정 안내. */
  matchFailed: boolean
  /** 매칭 실패 사유 (사용자 안내). */
  failReason?: string
}

function fromPreviewLine(line: VendorPreviewLine): EditableLine {
  const matchFailed = line.source === 'MANUAL' || line.finalPrice <= 0
  let failReason: string | undefined
  if (matchFailed) {
    if (line.source === 'MANUAL') {
      failReason = '시트/OCR 단가 모두 누락 — 수동 입력 필요'
    } else if (line.finalPrice <= 0) {
      failReason = '최종 단가가 0 — 단가 보정 필요'
    }
  }
  return {
    productName: line.productName,
    modelCode: line.modelCode,
    quantity: line.quantity,
    unitPrice: line.unitPrice,
    dcRate: line.dcRate,
    finalPrice: line.finalPrice,
    subtotal: line.subtotal,
    source: line.source,
    matchFailed,
    failReason,
  }
}

// ---------------------------------------------------------------------------
// 파일 검증
// ---------------------------------------------------------------------------

const ACCEPT_EXT = ['.pdf', '.png', '.jpg', '.jpeg']
const MAX_FILE_SIZE_MB = 10

function getExtension(name: string): string {
  const idx = name.lastIndexOf('.')
  return idx === -1 ? '' : name.substring(idx).toLowerCase()
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

function formatKrw(value: number): string {
  return value.toLocaleString('ko-KR') + '원'
}

// ---------------------------------------------------------------------------
// Stepper — 3-step 진행 상황 시각화 (Designer mock 보존)
// ---------------------------------------------------------------------------

type StepKey = 'UPLOAD' | 'PREVIEW' | 'CONFIRM'

const STEP_LABELS: Record<StepKey, string> = {
  UPLOAD: 'Step 1: 파일 업로드',
  PREVIEW: 'Step 2: 분석 결과 확인',
  CONFIRM: 'Step 3: 발주 확정',
}

const STEP_ORDER: ReadonlyArray<StepKey> = ['UPLOAD', 'PREVIEW', 'CONFIRM']

interface StepperProps {
  current: StepKey
}

function Stepper({ current }: StepperProps) {
  const currentIdx = STEP_ORDER.indexOf(current)
  return (
    <div
      className={styles.stepper}
      data-testid="vendor-order-stepper"
      aria-label="발주 OCR 진행 단계"
    >
      {STEP_ORDER.map((step, idx) => {
        const stepIdx = idx
        const isActive = stepIdx === currentIdx
        const isDone = stepIdx < currentIdx
        const cls = [
          styles.step,
          isActive ? styles.stepActive : '',
          isDone ? styles.stepDone : '',
        ]
          .filter(Boolean)
          .join(' ')
        const badgeCls = [
          styles.stepBadge,
          !isActive && !isDone ? styles.stepBadgeDefault : '',
        ]
          .filter(Boolean)
          .join(' ')
        return (
          <div key={step} style={{ display: 'flex', alignItems: 'center' }}>
            <div
              className={cls}
              role="status"
              aria-current={isActive ? 'step' : undefined}
            >
              <span className={badgeCls}>{isDone ? '✓' : stepIdx + 1}</span>
              {STEP_LABELS[step]}
            </div>
            {stepIdx < STEP_ORDER.length - 1 ? (
              <div className={styles.stepConnector} aria-hidden="true" />
            ) : null}
          </div>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------------------
// 에러 메시지 변환 — 503 OcrDisabled / axios / 일반 Error 분기
// ---------------------------------------------------------------------------

function toUserMessage(err: unknown, fallback: string): string {
  if (err instanceof OcrDisabledError) {
    return err.message
  }
  if (axios.isAxiosError(err)) {
    const data = err.response?.data as { message?: string } | undefined
    return data?.message ?? fallback
  }
  if (err instanceof Error) {
    return err.message
  }
  return fallback
}

// ---------------------------------------------------------------------------
// 컴포넌트
// ---------------------------------------------------------------------------

export function SalesVendorOrderUploadPage() {
  usePageTitle('vendor 발주서 OCR 업로드')

  // ----- step + 입력 state -----
  const [step, setStep] = useState<StepKey>('UPLOAD')
  const [vendor, setVendor] = useState<VendorName>('에어디자이너')
  const [file, setFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // ----- Step 2 OCR 결과 (실 BE 응답) -----
  const [uploadResult, setUploadResult] = useState<VendorOrderUploadResponse | null>(null)
  const [items, setItems] = useState<EditableLine[]>([])

  // ----- Step 3 발주 결과 -----
  const [confirmResult, setConfirmResult] = useState<VendorOrderConfirmResponse | null>(null)

  // 파일 미리보기 URL revoke
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    }
  }, [previewUrl])

  // ----- 파일 업로드 검증 -----

  const accept = useCallback(
    (incoming: File) => {
      const ext = getExtension(incoming.name)
      if (!ACCEPT_EXT.includes(ext)) {
        setError(
          `지원하지 않는 파일 형식입니다 (${incoming.name}). ${ACCEPT_EXT.join(', ')} 만 허용.`,
        )
        return
      }
      if (incoming.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
        setError(
          `${incoming.name} 파일이 ${MAX_FILE_SIZE_MB}MB 를 초과합니다 (${formatSize(incoming.size)}).`,
        )
        return
      }
      setError(null)
      setFile(incoming)
      // 이미지 형식만 즉시 직접 미리보기 (PDF 는 placeholder 안내)
      if (previewUrl) URL.revokeObjectURL(previewUrl)
      if (ext === '.pdf') {
        setPreviewUrl(null)
      } else {
        setPreviewUrl(URL.createObjectURL(incoming))
      }
    },
    [previewUrl],
  )

  const handleFileInput = (e: ChangeEvent<HTMLInputElement>) => {
    const list = e.target.files
    if (!list || list.length === 0) return
    const first = list[0]
    if (first) accept(first)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleDrop = (e: ReactDragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setDragOver(false)
    const list = e.dataTransfer.files
    if (!list || list.length === 0) return
    const first = list[0]
    if (first) accept(first)
  }

  const handleDragOver = (e: ReactDragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setDragOver(true)
  }

  const handleDragLeave = () => setDragOver(false)

  // ----- Step 1 → Step 2: OCR 실행 (실 BE) -----

  const uploadMutation = useMutation<
    VendorOrderUploadResponse,
    unknown,
    { vendor: VendorName; file: File }
  >({
    mutationFn: ({ vendor: v, file: f }) => uploadVendorOrder(v, f),
    onSuccess: (data) => {
      setUploadResult(data)
      setItems((data.parsedLines ?? []).map(fromPreviewLine))
      setError(null)
      setStep('PREVIEW')
    },
    onError: (err) => {
      setError(toUserMessage(err, 'OCR 분석에 실패했습니다.'))
    },
  })

  const handleRunOcr = () => {
    if (!file) {
      setError('vendor 발주서 파일을 업로드하세요.')
      return
    }
    setError(null)
    uploadMutation.mutate({ vendor, file })
  }

  // ----- Step 2 line item 수정 -----

  const updateItem = (idx: number, patch: Partial<EditableLine>) => {
    setItems((prev) =>
      prev.map((it, i) => {
        if (i !== idx) return it
        const next = { ...it, ...patch }
        // 단가/수량 변경 시 subtotal 재계산 (matchFailed 갱신 — finalPrice 보정 시 해제)
        next.subtotal = next.finalPrice * next.quantity
        if (next.finalPrice > 0 && next.matchFailed) {
          next.matchFailed = false
          next.failReason = undefined
        }
        return next
      }),
    )
  }

  const totalAmount = useMemo(
    () => items.reduce((sum, it) => sum + it.subtotal, 0),
    [items],
  )

  const failedCount = useMemo(
    () => items.filter((it) => it.matchFailed).length,
    [items],
  )

  // ----- Step 2 → Step 3: 발주 확정 (실 BE) -----

  const confirmMutation = useMutation<
    VendorOrderConfirmResponse,
    unknown,
    { vendorName: string; partnerCode: string; lines: VendorConfirmLine[] }
  >({
    mutationFn: ({ vendorName, partnerCode, lines }) =>
      confirmVendorOrder(vendorName, partnerCode, lines),
    onSuccess: (data) => {
      setConfirmResult(data)
      setError(null)
      setStep('CONFIRM')
    },
    onError: (err) => {
      setError(toUserMessage(err, '발주 확정에 실패했습니다.'))
    },
  })

  const handleConfirm = () => {
    if (!uploadResult) return
    const partnerCode = uploadResult.partnerCode?.trim()
    if (!partnerCode) {
      setError('거래처 코드 인식 실패 — vendor 발주서를 다시 업로드하거나 BE 관리자에게 문의하세요.')
      return
    }
    const lines: VendorConfirmLine[] = items.map((it) => ({
      modelCode: it.modelCode,
      productName: it.productName,
      quantity: it.quantity,
      finalPrice: it.finalPrice,
    }))
    setError(null)
    confirmMutation.mutate({
      vendorName: uploadResult.vendorName,
      partnerCode,
      lines,
    })
  }

  // ----- Step 3 → Step 1: 다른 vendor 업로드 -----

  const handleReset = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setPreviewUrl(null)
    setFile(null)
    setUploadResult(null)
    setItems([])
    setConfirmResult(null)
    setError(null)
    uploadMutation.reset()
    confirmMutation.reset()
    setStep('UPLOAD')
  }

  // ----- Step 2 → Step 1: 다시 업로드 (vendor 유지) -----

  const handleRestart = () => {
    setUploadResult(null)
    setItems([])
    setError(null)
    confirmMutation.reset()
    setStep('UPLOAD')
  }

  // ----- 파생 상태 -----

  const analyzing = uploadMutation.isPending
  const submitting = confirmMutation.isPending

  // ----- render -----

  return (
    <div
      style={{
        padding: 16,
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
      }}
    >
      <header>
        <h3 style={{ margin: '0 0 4px' }}>vendor 발주서 OCR 업로드</h3>
        <div style={{ fontSize: 12, color: 'var(--color-neutral-600, #4B5563)' }}>
          PDF·이미지 발주서를 OCR로 인식해 품목을 자동으로 읽고, 매칭 확인 후 발주서를 생성합니다.
        </div>
      </header>

      <Stepper current={step} />

      {error ? (
        <div
          role="alert"
          style={{
            padding: '8px 12px',
            border: '1px solid var(--color-danger-300, #fca5a5)',
            background: 'var(--color-danger-50, #fef2f2)',
            color: 'var(--color-danger-700, #b91c1c)',
            borderRadius: 6,
            fontSize: 13,
          }}
        >
          {error}
        </div>
      ) : null}

      {/* ───────── Step 1 — Upload ───────── */}
      {step === 'UPLOAD' ? (
        <section style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* vendor 라디오 */}
          <div>
            <div
              style={{
                fontSize: 13,
                fontWeight: 600,
                marginBottom: 8,
                color: 'var(--color-neutral-700, #374151)',
              }}
            >
              vendor 선택
            </div>
            <div className={styles.vendorList} role="radiogroup" aria-label="vendor 선택">
              {VENDOR_OPTIONS.map((opt) => {
                const active = vendor === opt.name
                const cls = [
                  styles.vendorCard,
                  active ? styles.vendorCardActive : '',
                ]
                  .filter(Boolean)
                  .join(' ')
                return (
                  <label
                    key={opt.name}
                    className={cls}
                    data-testid={opt.testId}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <input
                        type="radio"
                        name="vendor"
                        value={opt.name}
                        checked={active}
                        onChange={() => setVendor(opt.name)}
                      />
                      <span className={styles.vendorTitle}>{opt.name}</span>
                    </div>
                    <div className={styles.vendorHint}>{opt.hint}</div>
                  </label>
                )
              })}
            </div>
          </div>

          {/* drag-drop 업로드 영역 */}
          <div
            data-testid="vendor-order-drop-zone"
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onClick={() => fileInputRef.current?.click()}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                fileInputRef.current?.click()
              }
            }}
            className={[
              styles.dropZone,
              dragOver ? styles.dropZoneActive : '',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            <div className={styles.dropTitle}>
              발주서 파일을 끌어다 놓거나 클릭하여 선택
            </div>
            <div className={styles.dropHint}>
              {ACCEPT_EXT.join(', ')} 만 허용 · 단일 파일 · 최대{' '}
              {MAX_FILE_SIZE_MB}MB
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPT_EXT.join(',')}
              onChange={handleFileInput}
              data-testid="vendor-order-file-input"
              style={{ display: 'none' }}
            />
          </div>

          {/* 파일 미리보기 */}
          {file ? (
            <div className={styles.previewBox}>
              <div className={styles.previewThumb}>
                {previewUrl ? (
                  <img src={previewUrl} alt={`${file.name} 미리보기`} />
                ) : (
                  <span>PDF 미리보기 — 첫 페이지 (BE 연결 시점에 실 렌더)</span>
                )}
              </div>
              <div className={styles.previewMeta}>
                <div className={styles.previewMetaRow}>
                  <span className={styles.previewMetaLabel}>파일명</span>
                  <strong>{file.name}</strong>
                </div>
                <div className={styles.previewMetaRow}>
                  <span className={styles.previewMetaLabel}>크기</span>
                  <span>{formatSize(file.size)}</span>
                </div>
                <div className={styles.previewMetaRow}>
                  <span className={styles.previewMetaLabel}>대상 vendor</span>
                  <strong>{vendor}</strong>
                </div>
              </div>
            </div>
          ) : null}

          {/* 액션 */}
          <div className={styles.actionRow}>
            <Button
              variant="primary"
              onClick={handleRunOcr}
              disabled={!file || analyzing}
              data-testid="vendor-order-ocr-run-btn"
            >
              {analyzing ? '분석 중…' : 'OCR 분석 시작'}
            </Button>
          </div>
        </section>
      ) : null}

      {/* ───────── Step 2 — Preview ───────── */}
      {step === 'PREVIEW' && uploadResult ? (
        <section style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* 거래처 정보 + vendor (자동 lookup 결과) */}
          <div className={styles.partnerInfo}>
            <span className={styles.partnerInfoLabel}>vendor</span>
            <strong>{uploadResult.vendorName}</strong>
            <span className={styles.partnerInfoLabel}>거래처 코드</span>
            <strong>{uploadResult.partnerCode ?? '— (인식 실패)'}</strong>
            {uploadResult.parsedTotal != null && uploadResult.parsedTotal > 0 ? (
              <>
                <span className={styles.partnerInfoLabel}>OCR 합계</span>
                <span>{formatKrw(uploadResult.parsedTotal)}</span>
              </>
            ) : null}
          </div>

          {/* BE suggestions — 단가 누락/거래처 미발견 등 사용자 안내 */}
          {uploadResult.suggestions.length > 0 ? (
            <div
              role="status"
              style={{
                padding: '8px 12px',
                border: '1px solid var(--color-warning-300, #fcd34d)',
                background: 'var(--color-warning-50, #fffbeb)',
                color: 'var(--color-warning-800, #92400e)',
                borderRadius: 6,
                fontSize: 13,
              }}
            >
              <div style={{ fontWeight: 600, marginBottom: 4 }}>
                BE 분석 안내 ({uploadResult.suggestions.length}건)
              </div>
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {uploadResult.suggestions.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {failedCount > 0 ? (
            <div
              role="alert"
              style={{
                padding: '8px 12px',
                border: '1px solid var(--color-warning-300, #fcd34d)',
                background: 'var(--color-warning-50, #fffbeb)',
                color: 'var(--color-warning-800, #92400e)',
                borderRadius: 6,
                fontSize: 13,
              }}
            >
              품목 매칭 실패 — 수동 보정 필요 ({failedCount}건). 빨간 행을
              확인 후 단가를 보정하세요.
            </div>
          ) : null}

          {/* OCR 텍스트 + line item 표 (좌/우 grid) */}
          <div className={styles.previewGrid}>
            <div>
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  marginBottom: 6,
                  color: 'var(--color-neutral-700, #374151)',
                }}
              >
                OCR 결과 (read-only)
              </div>
              <pre className={styles.ocrText} aria-readonly="true">
                {uploadResult.ocrText}
              </pre>
            </div>
            <div>
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  marginBottom: 6,
                  color: 'var(--color-neutral-700, #374151)',
                }}
              >
                파싱된 line item ({items.length}건)
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table className={styles.itemTable}>
                  <thead>
                    <tr>
                      <th>품목</th>
                      <th>모델</th>
                      <th className={styles.colNumeric} style={{ width: 80 }}>
                        수량
                      </th>
                      <th className={styles.colNumeric} style={{ width: 110 }}>
                        단가 (시트)
                      </th>
                      <th className={styles.colNumeric} style={{ width: 110 }}>
                        최종 단가
                      </th>
                      <th className={styles.colNumeric} style={{ width: 130 }}>
                        소계
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((it, idx) => (
                      <tr
                        key={`${it.modelCode}-${idx}`}
                        data-testid={`vendor-order-item-row-${idx}`}
                        className={it.matchFailed ? styles.itemRowFail : ''}
                      >
                        <td>
                          {it.productName}
                          {it.matchFailed ? (
                            <span
                              className={styles.itemRowFailHint}
                              title={it.failReason}
                            >
                              매칭 실패
                            </span>
                          ) : null}
                        </td>
                        <td>{it.modelCode || '—'}</td>
                        <td className={styles.colNumeric}>
                          <input
                            type="number"
                            min={1}
                            value={it.quantity}
                            onChange={(e) =>
                              updateItem(idx, {
                                quantity: Math.max(1, Number(e.target.value) || 1),
                              })
                            }
                            className={styles.itemInput}
                            data-testid={`vendor-order-item-qty-${idx}`}
                          />
                        </td>
                        <td className={styles.colNumeric}>
                          {formatKrw(it.unitPrice)}
                        </td>
                        <td className={styles.colNumeric}>
                          <input
                            type="number"
                            min={0}
                            value={it.finalPrice}
                            onChange={(e) =>
                              updateItem(idx, {
                                finalPrice: Math.max(0, Number(e.target.value) || 0),
                              })
                            }
                            className={styles.itemInput}
                            data-testid={`vendor-order-item-price-${idx}`}
                          />
                        </td>
                        <td className={styles.colNumeric}>
                          {formatKrw(it.subtotal)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan={5} className={styles.colNumeric}>
                        합계
                      </td>
                      <td className={styles.colNumeric}>
                        {formatKrw(totalAmount)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </div>

          <div className={styles.actionRow}>
            <Button
              variant="secondary"
              onClick={handleRestart}
              disabled={submitting}
              data-testid="vendor-order-restart-btn"
            >
              다시 업로드
            </Button>
            <Button
              variant="primary"
              onClick={handleConfirm}
              disabled={submitting || items.length === 0}
              data-testid="vendor-order-confirm-btn"
            >
              {submitting ? '발주 생성 중…' : '확정'}
            </Button>
          </div>
        </section>
      ) : null}

      {/* ───────── Step 3 — Confirm ───────── */}
      {step === 'CONFIRM' && confirmResult ? (
        <section style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div
            className={styles.confirmCard}
            data-testid="vendor-order-result-card"
          >
            <div className={styles.confirmTitle}>발주가 정상 생성되었습니다.</div>
            <div className={styles.confirmRow}>
              <span className={styles.confirmLabel}>발주서 번호</span>
              <span className={styles.confirmStrong}>{confirmResult.orderNo}</span>
            </div>
            <div className={styles.confirmRow}>
              <span className={styles.confirmLabel}>vendor</span>
              <span>{confirmResult.vendorName}</span>
            </div>
            <div className={styles.confirmRow}>
              <span className={styles.confirmLabel}>거래처 코드</span>
              <span>{confirmResult.partnerCode}</span>
            </div>
            <div className={styles.confirmRow}>
              <span className={styles.confirmLabel}>상태</span>
              <span>{confirmResult.status}</span>
            </div>
            <div className={styles.confirmRow}>
              <span className={styles.confirmLabel}>총 금액</span>
              <span className={styles.confirmStrong}>
                {formatKrw(confirmResult.totalAmount)}
              </span>
            </div>
          </div>

          <div className={styles.actionRow}>
            {/* 발주서 보기 — 기존 partner-order-service 페이지 link (orderNo 만 노출, UUID 비공개) */}
            <a
              href={`#/sales/partner-orders/${encodeURIComponent(confirmResult.orderNo)}`}
              data-testid="vendor-order-view-link"
              style={{
                padding: '8px 14px',
                borderRadius: 6,
                border: '1px solid var(--color-brand-500, #2563eb)',
                color: 'var(--color-brand-700, #1d4ed8)',
                background: '#fff',
                fontSize: 13,
                textDecoration: 'none',
                fontWeight: 600,
              }}
            >
              발주서 보기
            </a>
            <Button variant="secondary" onClick={handleReset}>
              다른 vendor 업로드
            </Button>
          </div>
        </section>
      ) : null}
    </div>
  )
}
