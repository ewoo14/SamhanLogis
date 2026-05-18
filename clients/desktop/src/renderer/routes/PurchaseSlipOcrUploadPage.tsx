/**
 * 영수증 OCR 업로드 → 매입 슬립 자동 생성 화면 (SP-09-3).
 *
 * <h2>용도</h2>
 * Naver Clova OCR 를 이용하여 영수증 이미지를 업로드하면 가게명 / 금액 / 부가세 /
 * 일자를 자동 인식하고 매입 슬립을 즉시 생성한다. shell 단계에서는 DRY_RUN 모드가
 * 고정으로 사용되며 Phase 11 sandbox 연동 시 CLOVA 가 활성화된다.
 *
 * <h2>권한 가드</h2>
 * <ul>
 *   <li>WAREHOUSE / ACCOUNTANT / MANAGER / MASTER 만 접근 가능 (2026-05-18 사용자 정정).</li>
 *   <li>SALES / DISPATCH 진입 시 RoleGuard 가 403 화면을 표시.</li>
 * </ul>
 *
 * <h2>4개 영역</h2>
 * <ol>
 *   <li>파일 드롭존 + 클릭 업로드 (jpg/png/jpeg, 10MB)</li>
 *   <li>submitMethod 선택 (shell 단계 DRY_RUN 고정 표시 + CLOVA 안내)</li>
 *   <li>OCR 결과 — 가게명 / 금액 / 부가세 / 일자 + 매입 슬립 Badge + slipNo 링크</li>
 *   <li>실패 시 한국어 메시지 (422 / 502 구분)</li>
 * </ol>
 *
 * <h2>UUID 비공개</h2>
 * <p>응답의 slipNo 만 노출. BE DTO 에 slipId (UUID) 미포함 — slipNo 텍스트만 표시
 * (feedback_uuid_no_user_visibility). Phase 11 slipNo 기반 상세 라우트 추가 시 링크 활성화 검토.
 *
 * <h2>data-testid</h2>
 * <ul>
 *   <li>{@code receipt-ocr-drop-zone / receipt-ocr-file-input}</li>
 *   <li>{@code receipt-ocr-submit-btn / receipt-ocr-reset-btn}</li>
 *   <li>{@code receipt-ocr-result / receipt-ocr-slip-badge / receipt-ocr-slip-link}</li>
 *   <li>{@code receipt-ocr-error}</li>
 * </ul>
 */
import {
  useCallback,
  useEffect,
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
  parseReceipt,
  OcrGatewayError,
  ReceiptValidationError,
  type ReceiptParseResponse,
  type ReceiptSubmitMethod,
} from '../api/receiptOcrApi'

// ---------------------------------------------------------------------------
// 파일 검증 상수
// ---------------------------------------------------------------------------

const ACCEPT_EXTS = ['.jpg', '.png', '.jpeg'] as const
const MAX_FILE_SIZE_MB = 10
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024

// ---------------------------------------------------------------------------
// 유틸 함수
// ---------------------------------------------------------------------------

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

function formatDate(iso: string): string {
  // ISO date "YYYY-MM-DD" → "YYYY년 MM월 DD일"
  const [year, month, day] = iso.split('-')
  if (!year || !month || !day) return iso
  return `${year}년 ${month}월 ${day}일`
}

// ---------------------------------------------------------------------------
// 에러 메시지 변환
// ---------------------------------------------------------------------------

function toUserMessage(err: unknown): string {
  if (err instanceof ReceiptValidationError) {
    return err.message
  }
  if (err instanceof OcrGatewayError) {
    return err.message
  }
  if (axios.isAxiosError(err)) {
    const data = err.response?.data as { message?: string } | undefined
    if (data?.message) return data.message
    const status = err.response?.status
    if (status === 422) return '파일 검증에 실패했습니다. 지원 형식(jpg, png, jpeg) 및 파일 크기(10MB 이하)를 확인하세요.'
    if (status === 502) return 'OCR 외부 서비스에 일시적 오류가 발생했습니다. 잠시 후 다시 시도하세요.'
    return `요청에 실패했습니다. (HTTP ${status ?? '알 수 없음'})`
  }
  if (err instanceof Error) return err.message
  return '알 수 없는 오류가 발생했습니다.'
}

// ---------------------------------------------------------------------------
// 하위 컴포넌트 — OCR 결과 카드
// ---------------------------------------------------------------------------

interface ResultCardProps {
  result: ReceiptParseResponse
}

function ResultCard({ result }: ResultCardProps) {
  return (
    <div
      data-testid="receipt-ocr-result"
      role="status"
      aria-live="polite"
      style={{
        border: '1px solid var(--color-clova-200, #BBF7D0)',
        background: 'var(--color-clova-50, #F0FDF6)',
        borderRadius: 8,
        padding: '20px',
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
      }}
    >
      {/* 타이틀 */}
      <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-clova-text, #014A22)' }}>
        영수증 인식 완료
      </div>

      {/* 인식 결과 그리드 */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '120px 1fr',
          rowGap: 8,
          columnGap: 12,
          fontSize: 14,
          color: 'var(--color-neutral-800, #1f2937)',
        }}
      >
        <span style={{ color: 'var(--color-neutral-600, #4b5563)', fontWeight: 500 }}>가게명</span>
        <strong>{result.vendorName}</strong>

        <span style={{ color: 'var(--color-neutral-600, #4b5563)', fontWeight: 500 }}>금액</span>
        <strong style={{ fontVariantNumeric: 'tabular-nums' }}>
          {formatKrw(result.totalAmount)}
        </strong>

        <span style={{ color: 'var(--color-neutral-600, #4b5563)', fontWeight: 500 }}>부가세</span>
        <span style={{ fontVariantNumeric: 'tabular-nums' }}>
          {result.vatAmount != null ? formatKrw(result.vatAmount) : '—'}
        </span>

        <span style={{ color: 'var(--color-neutral-600, #4b5563)', fontWeight: 500 }}>날짜</span>
        <span>{formatDate(result.issuedAt)}</span>
      </div>

      {/* 매입 슬립 자동 생성 Badge + 링크 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span
          data-testid="receipt-ocr-slip-badge"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '4px 10px',
            borderRadius: 999,
            background: 'var(--color-success-600, #059669)',
            color: '#fff',
            fontSize: 12,
            fontWeight: 600,
          }}
        >
          매입 슬립 자동 생성됨
        </span>
        {/* slipNo 만 노출 — UUID 비공개 원칙 준수 (slipId BE 응답 미포함) */}
        <span
          data-testid="receipt-ocr-slip-link"
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: 'var(--color-brand-700, #1d4ed8)',
          }}
        >
          전표 보기 — {result.slipNo}
        </span>
      </div>

      {/* 처리 방식 안내 */}
      <div style={{ fontSize: 11, color: 'var(--color-neutral-500, #6b7280)' }}>
        처리 방식: {result.submitMethod === 'DRY_RUN' ? 'DRY_RUN (sandbox)' : 'Naver Clova OCR'}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// 메인 컴포넌트
// ---------------------------------------------------------------------------

export function PurchaseSlipOcrUploadPage() {
  usePageTitle('영수증 OCR 업로드')

  // shell 단계: DRY_RUN 고정 (Phase 11 sandbox 연동 시 CLOVA 활성)
  const [submitMethod] = useState<ReceiptSubmitMethod>('DRY_RUN')

  const [file, setFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [fileError, setFileError] = useState<string | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)

  // 미리보기 URL 메모리 해제
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    }
  }, [previewUrl])

  // ----- 파일 검증 + 상태 설정 -----

  const acceptFile = useCallback(
    (incoming: File) => {
      const ext = getExtension(incoming.name)
      if (!(ACCEPT_EXTS as readonly string[]).includes(ext)) {
        setFileError(
          `지원하지 않는 파일 형식입니다 (${incoming.name}). jpg, png, jpeg 만 허용됩니다.`,
        )
        return
      }
      if (incoming.size === 0) {
        setFileError('파일이 비어있습니다. 유효한 영수증 이미지를 선택해주세요.')
        return
      }
      if (incoming.size > MAX_FILE_SIZE_BYTES) {
        setFileError(
          `파일 크기가 ${MAX_FILE_SIZE_MB}MB 를 초과합니다 (${formatSize(incoming.size)}). 이미지를 압축하거나 다른 파일을 선택하세요.`,
        )
        return
      }
      setFileError(null)
      setFile(incoming)
      if (previewUrl) URL.revokeObjectURL(previewUrl)
      setPreviewUrl(URL.createObjectURL(incoming))
    },
    [previewUrl],
  )

  const handleFileInput = (e: ChangeEvent<HTMLInputElement>) => {
    const list = e.target.files
    if (!list || list.length === 0) return
    const first = list[0]
    if (first) acceptFile(first)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleDrop = (e: ReactDragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setDragOver(false)
    const list = e.dataTransfer.files
    if (!list || list.length === 0) return
    const first = list[0]
    if (first) acceptFile(first)
  }

  const handleDragOver = (e: ReactDragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setDragOver(true)
  }

  const handleDragLeave = () => setDragOver(false)

  // ----- 업로드 mutation -----

  const mutation = useMutation<
    ReceiptParseResponse,
    unknown,
    { file: File; submitMethod: ReceiptSubmitMethod }
  >({
    mutationFn: ({ file: f, submitMethod: sm }) => parseReceipt(f, sm),
  })

  const handleSubmit = () => {
    if (!file) {
      setFileError('영수증 이미지 파일을 선택해주세요.')
      return
    }
    setFileError(null)
    mutation.mutate({ file, submitMethod })
  }

  const handleReset = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setPreviewUrl(null)
    setFile(null)
    setFileError(null)
    mutation.reset()
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const isLoading = mutation.isPending
  const apiError = mutation.isError ? toUserMessage(mutation.error) : null

  return (
    <div
      style={{
        padding: 16,
        display: 'flex',
        flexDirection: 'column',
        gap: 20,
        maxWidth: 680,
      }}
    >
      {/* 헤더 */}
      <header>
        <h3 style={{ margin: '0 0 6px', fontSize: 18, fontWeight: 700 }}>
          영수증 OCR 업로드
        </h3>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--color-neutral-600, #4B5563)' }}>
          영수증 이미지를 업로드하면 Naver Clova OCR 이 가게명 / 금액 / 부가세 / 날짜를
          자동으로 인식하고 매입 슬립을 즉시 생성합니다.
        </p>
      </header>

      {/* ───────── 영역 2: submitMethod 안내 ───────── */}
      <section
        style={{
          padding: '12px 14px',
          border: '1px solid var(--color-warning-200, #fde68a)',
          background: 'var(--color-warning-50, #fffbeb)',
          borderRadius: 6,
          fontSize: 13,
          color: 'var(--color-warning-800, #92400e)',
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
        }}
      >
        <div style={{ fontWeight: 600 }}>처리 방식: DRY_RUN (sandbox)</div>
        <div>
          현재 shell 단계에서는 DRY_RUN 모드가 고정 사용됩니다.
          Phase 11 sandbox 연동 완료 후 Naver Clova OCR (CLOVA) 모드가 활성화됩니다.
        </div>
      </section>

      {/* ───────── 영역 1: 파일 드롭존 ───────── */}
      <section style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div
          data-testid="receipt-ocr-drop-zone"
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onClick={() => fileInputRef.current?.click()}
          role="button"
          tabIndex={0}
          aria-label="영수증 이미지 파일 업로드"
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              fileInputRef.current?.click()
            }
          }}
          style={{
            padding: '32px 20px',
            border: `2px dashed ${dragOver ? 'var(--color-brand-500, #2563eb)' : 'var(--color-neutral-300, #d1d5db)'}`,
            borderRadius: 8,
            background: dragOver
              ? 'var(--color-brand-50, #eff6ff)'
              : 'var(--color-neutral-50, #f9fafb)',
            textAlign: 'center',
            cursor: 'pointer',
            transition: 'border-color 0.15s, background 0.15s',
          }}
        >
          <div
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: 'var(--color-neutral-700, #374151)',
              marginBottom: 4,
            }}
          >
            영수증 이미지를 끌어다 놓거나 클릭하여 선택
          </div>
          <div style={{ fontSize: 12, color: 'var(--color-neutral-500, #6b7280)' }}>
            {ACCEPT_EXTS.join(', ')} 만 허용 · 최대 {MAX_FILE_SIZE_MB}MB
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPT_EXTS.join(',')}
            onChange={handleFileInput}
            data-testid="receipt-ocr-file-input"
            style={{ display: 'none' }}
          />
        </div>

        {/* 파일 검증 에러 */}
        {fileError ? (
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
            {fileError}
          </div>
        ) : null}

        {/* 파일 미리보기 */}
        {file && previewUrl ? (
          <div
            style={{
              display: 'flex',
              gap: 14,
              alignItems: 'flex-start',
              border: '1px solid var(--color-neutral-200, #e5e7eb)',
              borderRadius: 6,
              padding: 12,
              background: '#fff',
            }}
          >
            <div
              style={{
                width: 120,
                minHeight: 140,
                border: '1px solid var(--color-neutral-200, #e5e7eb)',
                borderRadius: 4,
                background: 'var(--color-neutral-50, #f9fafb)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
              }}
            >
              <img
                src={previewUrl}
                alt={`${file.name} 미리보기`}
                style={{ width: '100%', height: '100%', objectFit: 'contain' }}
              />
            </div>
            <div
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
                fontSize: 13,
                color: 'var(--color-neutral-700, #374151)',
              }}
            >
              <div style={{ display: 'flex', gap: 8 }}>
                <span style={{ width: 72, color: 'var(--color-neutral-500, #6b7280)' }}>파일명</span>
                <strong>{file.name}</strong>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <span style={{ width: 72, color: 'var(--color-neutral-500, #6b7280)' }}>크기</span>
                <span>{formatSize(file.size)}</span>
              </div>
            </div>
          </div>
        ) : null}
      </section>

      {/* ───────── 영역 4: API 에러 메시지 (422 / 502) ───────── */}
      {apiError ? (
        <div
          role="alert"
          data-testid="receipt-ocr-error"
          style={{
            padding: '10px 14px',
            border: '1px solid var(--color-danger-300, #fca5a5)',
            background: 'var(--color-danger-50, #fef2f2)',
            color: 'var(--color-danger-700, #b91c1c)',
            borderRadius: 6,
            fontSize: 13,
          }}
        >
          {apiError}
        </div>
      ) : null}

      {/* 액션 버튼 */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <Button
          variant="primary"
          onClick={handleSubmit}
          disabled={!file || isLoading}
          data-testid="receipt-ocr-submit-btn"
        >
          {isLoading ? 'OCR 분석 중…' : '영수증 분석 시작'}
        </Button>
        {(file || mutation.isSuccess || mutation.isError) ? (
          <Button
            variant="secondary"
            onClick={handleReset}
            disabled={isLoading}
            data-testid="receipt-ocr-reset-btn"
          >
            다시 업로드
          </Button>
        ) : null}
      </div>

      {/* ───────── 영역 3: OCR 결과 ───────── */}
      {mutation.isSuccess && mutation.data ? (
        <ResultCard result={mutation.data} />
      ) : null}
    </div>
  )
}
