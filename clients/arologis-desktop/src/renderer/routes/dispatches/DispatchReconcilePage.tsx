/**
 * arologis 운송사 실배차 비교 (`/dispatches/reconcile`).
 *
 * Phase 10 PR-F1 FE-2 — Designer mock (commit 2a1f11f) → 실 API 연결.
 *
 * <h2>용도</h2>
 * 운송사가 발행한 vendor 엑셀 (CJ대한통운 / 롯데 / 한진 등 다중 vendor) 과 우리
 * 시스템 내부 dispatch 기록을 비교하여 누락 / 시간 오차를 식별. 운송사 콘솔 외부
 * 접속 불요.
 *
 * <h2>UX 흐름</h2>
 * <pre>
 *   1) 다중 drag-drop 업로드 영역 (.xlsx 다수 — vendor 별 1 파일)
 *   2) from / to 날짜 선택 + "비교 실행" 버튼 → BE multipart POST
 *   3) 결과 비교 테이블 — 상태 색상 cell:
 *      - TRUE         (초록) — 양쪽 모두 일치 (matchedCount 만, 행 미포함)
 *      - FALSE_LEFT   (주황) — 우리 측엔 있으나 운송사엔 없음
 *      - FALSE_RIGHT  (빨강) — 운송사 측엔 있으나 우리에겐 없음
 *   4) 컬럼 필터 popup (상태 별 필터)
 *   5) "결과 CSV 다운로드" 버튼 (UTF-8 BOM 포함, Excel 한글 호환, 로컬 직렬화)
 * </pre>
 *
 * <h2>BE 연결</h2>
 * POST {@code /admin/arologis/dispatch/reconcile} (multipart 다중) — arologis-service
 * commit bb30725. 응답은 매칭 통계 + mismatch 행 (TRUE 행은 응답에서 제거되고
 * matchedCount 로만 카운트되므로 화면 "일치" 라벨은 별도 SummaryChip 으로 노출).
 *
 * <h2>설계 노트</h2>
 * <ul>
 *   <li>UUID 비공개 (feedback_uuid_no_user_visibility) — 사용자 노출 = slipNo /
 *       vendorName / partnerName.</li>
 *   <li>풀네임 ROLE (feedback_role_naming_full) — DISPATCH / MANAGER / MASTER 가드.</li>
 *   <li>한국어 라벨 100% — 영문 라벨 금지.</li>
 *   <li>5MB / .xlsx 가드 (vendor 별, FE 사전 검증). BE 도 50MB / .xlsx 강제.</li>
 *   <li>Designer mock 색상 cell / 상태 chip / drag-drop UX 보존 — CSS 무수정.</li>
 * </ul>
 *
 * <h2>data-testid</h2>
 * <ul>
 *   <li>{@code reconcile-upload-area / reconcile-file-input}</li>
 *   <li>{@code reconcile-from / reconcile-to / reconcile-run-btn}</li>
 *   <li>{@code reconcile-status-filter / reconcile-csv-btn}</li>
 *   <li>{@code reconcile-result-table / reconcile-row-{slipNo}}</li>
 * </ul>
 */
import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent as ReactDragEvent,
} from 'react'
import { useMutation } from '@tanstack/react-query'
import { Badge, Button } from '@samhan/design-system'
import { usePageTitle } from '../../hooks/usePageTitle'
import {
  reconcileDispatch,
  RECONCILE_STATUS_LABEL,
  type DispatchReconcileResponse,
  type MismatchedRow,
  type ReconcileStatus,
} from '../../api/dispatchReconcile'

// ---------------------------------------------------------------------------
// 도메인 표시 매핑 (Designer mock 보존)
// ---------------------------------------------------------------------------

const STATUS_VARIANT: Record<ReconcileStatus, 'success' | 'warning' | 'danger'> = {
  TRUE: 'success',
  FALSE_LEFT: 'warning',
  FALSE_RIGHT: 'danger',
}

/** 업로드 파일 1건 (FE 사전 검증 + vendor 명 추정). */
interface UploadedFile {
  file: File
  vendorGuess: string
}

const MAX_FILE_SIZE_MB = 5
const ACCEPT_EXT = ['.xlsx']

// ---------------------------------------------------------------------------
// CSV 다운로드 헬퍼 (UTF-8 BOM, Excel 호환) — Designer mock 보존
// ---------------------------------------------------------------------------

function csvCell(value: string | null | undefined): string {
  const s = value ?? ''
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

function downloadCsv(filename: string, rows: string[][]): void {
  const csv = rows.map((r) => r.map(csvCell).join(',')).join('\r\n')
  const bom = '﻿'
  const blob = new Blob([bom + csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

// ---------------------------------------------------------------------------
// 파일 검증
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

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

// ---------------------------------------------------------------------------
// 컴포넌트
// ---------------------------------------------------------------------------

export function ArologisDispatchReconcilePage() {
  usePageTitle('운송사 실배차 비교')

  const today = todayIso()
  const [from, setFrom] = useState<string>(today)
  const [to, setTo] = useState<string>(today)
  const [files, setFiles] = useState<UploadedFile[]>([])
  const [error, setError] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<ReconcileStatus | ''>('')
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // 비교 실행 mutation — 다중 multipart POST → 매칭 + mismatch 응답.
  const reconcileMutation = useMutation({
    mutationFn: (params: { files: File[]; from: string; to: string }) =>
      reconcileDispatch(params.files, params.from, params.to),
  })

  const response: DispatchReconcileResponse | null = reconcileMutation.data ?? null
  const running = reconcileMutation.isPending

  // ----- 파일 추가 -----

  const addFiles = useCallback((incoming: File[]) => {
    setError(null)
    const accepted: UploadedFile[] = []
    for (const f of incoming) {
      const ext = getExtension(f.name)
      if (!ACCEPT_EXT.includes(ext)) {
        setError(
          `지원하지 않는 파일 형식입니다 (${f.name}). ${ACCEPT_EXT.join(', ')} 만 허용.`,
        )
        return
      }
      if (f.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
        setError(
          `${f.name} 파일이 ${MAX_FILE_SIZE_MB}MB 를 초과합니다 (${formatSize(f.size)}).`,
        )
        return
      }
      // vendor 명 추정 — 파일명에서 첫 단어 (예: "CJ대한통운_20260510.xlsx" → "CJ대한통운")
      const base = f.name.replace(/\.xlsx$/i, '')
      const vendorGuess = base.split(/[_\-\s]/)[0] || base
      accepted.push({ file: f, vendorGuess })
    }
    setFiles((prev) => [...prev, ...accepted])
  }, [])

  const handleFileInput = (e: ChangeEvent<HTMLInputElement>) => {
    const list = e.target.files
    if (!list) return
    addFiles(Array.from(list))
    // input reset — 같은 파일 재선택 허용
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleDrop = (e: ReactDragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setDragOver(false)
    const list = e.dataTransfer.files
    if (!list || list.length === 0) return
    addFiles(Array.from(list))
  }

  const handleDragOver = (e: ReactDragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setDragOver(true)
  }

  const handleDragLeave = () => {
    setDragOver(false)
  }

  const removeFile = (idx: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== idx))
  }

  // ----- 비교 실행 (실 API) -----

  const handleRun = () => {
    if (files.length === 0) {
      setError('운송사 엑셀 파일을 1개 이상 업로드하세요.')
      return
    }
    if (!from || !to) {
      setError('조회 기간 (시작일 / 종료일) 을 입력하세요.')
      return
    }
    if (from > to) {
      setError('시작일은 종료일보다 빨라야 합니다.')
      return
    }
    setError(null)
    reconcileMutation.mutate({
      files: files.map((f) => f.file),
      from,
      to,
    })
  }

  // ----- 결과 필터링 -----

  const mismatchedRows: MismatchedRow[] = response?.mismatchedRows ?? []

  const filteredRows = useMemo<MismatchedRow[]>(() => {
    if (!response) return []
    if (!statusFilter) return mismatchedRows
    // BE 응답엔 TRUE 행이 미포함 — TRUE 필터 시 빈 배열 (matchedCount 는 SummaryChip 으로 별도 노출).
    return mismatchedRows.filter((r) => r.status === statusFilter)
  }, [response, mismatchedRows, statusFilter])

  const counts = useMemo(() => {
    if (!response) return { TRUE: 0, FALSE_LEFT: 0, FALSE_RIGHT: 0 }
    const c: Record<ReconcileStatus, number> = {
      TRUE: response.matchedCount,
      FALSE_LEFT: 0,
      FALSE_RIGHT: 0,
    }
    for (const r of mismatchedRows) {
      if (r.status === 'FALSE_LEFT') c.FALSE_LEFT += 1
      else if (r.status === 'FALSE_RIGHT') c.FALSE_RIGHT += 1
    }
    return c
  }, [response, mismatchedRows])

  // ----- CSV 다운로드 (BE mismatch 행 + matchedCount 헤더) -----

  const handleCsv = () => {
    if (!response) return
    const out: string[][] = [
      ['상태', '전표번호', '일자', '운송사', '우리 시간', '운송사 시간', '비고'],
    ]
    for (const r of filteredRows) {
      out.push([
        RECONCILE_STATUS_LABEL[r.status],
        r.slipNo,
        r.dispatchDate,
        r.vendorName ?? '',
        r.actualTime ?? '',
        r.expectedTime ?? '',
        r.reason,
      ])
    }
    downloadCsv(`reconcile_${from}_${to}.csv`, out)
  }

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
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
          <h3 style={{ margin: '0 0 4px' }}>운송사 실배차 비교</h3>
          {/* PR-H4c FE-B: 비교 도구 — read-only. 원 dispatch 변경 이력은 dispatch 상세에서 자동 추적 */}
          <span
            data-testid="reconcile-realtime-notice"
            style={{ fontSize: 11, color: 'var(--color-neutral-500)' }}
          >
            감사 추적 (수정 이력) 은 원 dispatch 화면에서 자동 (PR-H4c)
          </span>
        </div>
        <div style={{ fontSize: 12, color: 'var(--color-neutral-600)' }}>
          운송사별 엑셀 (.xlsx) 다중 업로드 → 우리 dispatch 기록과 비교 →
          누락 / 시각 오차 식별. 외부 vendor 콘솔 접속 불요.
        </div>
      </header>

      {/* ───── 다중 drag-drop 업로드 영역 (Designer mock 보존) ───── */}
      <div
        data-testid="reconcile-upload-area"
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
        style={{
          padding: 24,
          border: `2px dashed ${
            dragOver
              ? 'var(--color-brand-500)'
              : 'var(--color-neutral-300)'
          }`,
          borderRadius: 8,
          background: dragOver
            ? 'var(--color-brand-50)'
            : 'var(--color-neutral-50)',
          textAlign: 'center',
          cursor: 'pointer',
          transition: 'border-color 0.15s, background 0.15s',
        }}
      >
        <div
          style={{
            fontSize: 14,
            fontWeight: 600,
            color: 'var(--color-neutral-700)',
            marginBottom: 4,
          }}
        >
          운송사 엑셀 파일을 끌어다 놓거나 클릭하여 선택
        </div>
        <div
          style={{ fontSize: 12, color: 'var(--color-neutral-500)' }}
        >
          .xlsx 만 허용 · 파일당 최대 {MAX_FILE_SIZE_MB}MB · 다중 업로드 지원
        </div>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".xlsx"
          onChange={handleFileInput}
          data-testid="reconcile-file-input"
          style={{ display: 'none' }}
        />
      </div>

      {error ? (
        <div
          role="alert"
          style={{
            padding: '8px 12px',
            border: '1px solid var(--state-danger)',
            background: 'var(--state-danger-bg)',
            color: 'var(--state-danger)',
            borderRadius: 6,
            fontSize: 13,
          }}
        >
          {error}
        </div>
      ) : null}

      {reconcileMutation.isError ? (
        <div
          role="alert"
          style={{
            padding: '8px 12px',
            border: '1px solid var(--state-danger)',
            background: 'var(--state-danger-bg)',
            color: 'var(--state-danger)',
            borderRadius: 6,
            fontSize: 13,
          }}
        >
          비교 실행 중 오류가 발생했습니다. 파일 형식 / 기간 / 권한을 확인 후 다시
          시도해 주세요.
        </div>
      ) : null}

      {/* ───── 업로드 파일 목록 (Designer mock 보존) ───── */}
      {files.length > 0 ? (
        <div
          style={{
            border: '1px solid var(--color-neutral-200)',
            borderRadius: 6,
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              padding: '8px 12px',
              fontSize: 12,
              fontWeight: 600,
              color: 'var(--color-neutral-700)',
              background: 'var(--color-neutral-50)',
              borderBottom: '1px solid var(--color-neutral-200)',
            }}
          >
            업로드 대기 ({files.length}건)
          </div>
          <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
            {files.map((f, idx) => (
              <li
                key={`${f.file.name}-${idx}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '8px 12px',
                  borderTop:
                    idx === 0
                      ? 'none'
                      : '1px solid var(--color-neutral-100)',
                  fontSize: 13,
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 2,
                  }}
                >
                  <div
                    style={{
                      fontWeight: 500,
                      color: 'var(--color-neutral-800)',
                    }}
                  >
                    {f.file.name}
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      color: 'var(--color-neutral-500)',
                    }}
                  >
                    추정 운송사: <strong>{f.vendorGuess}</strong> ·{' '}
                    {formatSize(f.file.size)}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => removeFile(idx)}
                  disabled={running}
                  style={{
                    height: 28,
                    padding: '0 10px',
                    border: '1px solid var(--color-neutral-300)',
                    borderRadius: 4,
                    background: 'var(--surface-card)',
                    cursor: running ? 'not-allowed' : 'pointer',
                    fontSize: 12,
                    color: 'var(--color-neutral-700)',
                  }}
                >
                  제거
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* ───── 날짜 + 비교 실행 ───── */}
      <div
        style={{
          display: 'flex',
          gap: 12,
          alignItems: 'flex-end',
          flexWrap: 'wrap',
        }}
      >
        <label
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
            fontSize: 13,
          }}
        >
          시작일
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            data-testid="reconcile-from"
            style={inputStyle}
          />
        </label>
        <label
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
            fontSize: 13,
          }}
        >
          종료일
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            data-testid="reconcile-to"
            style={inputStyle}
          />
        </label>
        <Button
          variant="primary"
          onClick={handleRun}
          disabled={running || files.length === 0}
          data-testid="reconcile-run-btn"
        >
          {running ? '비교 중…' : '비교 실행'}
        </Button>
      </div>

      {/* ───── 결과 요약 + 필터 + CSV (Designer mock 보존) ───── */}
      {response ? (
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 12,
            flexWrap: 'wrap',
          }}
        >
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <SummaryChip
              label={RECONCILE_STATUS_LABEL.TRUE}
              value={counts.TRUE}
              tone="success"
            />
            <SummaryChip
              label={RECONCILE_STATUS_LABEL.FALSE_LEFT}
              value={counts.FALSE_LEFT}
              tone="warning"
            />
            <SummaryChip
              label={RECONCILE_STATUS_LABEL.FALSE_RIGHT}
              value={counts.FALSE_RIGHT}
              tone="danger"
            />
          </div>
          <div
            style={{
              display: 'flex',
              gap: 8,
              alignItems: 'center',
              flexWrap: 'wrap',
            }}
          >
            <label
              htmlFor="reconcile-status-filter"
              style={{
                fontSize: 13,
                color: 'var(--color-neutral-700)',
              }}
            >
              상태 필터
            </label>
            <select
              id="reconcile-status-filter"
              value={statusFilter}
              onChange={(e) =>
                setStatusFilter(e.target.value as ReconcileStatus | '')
              }
              data-testid="reconcile-status-filter"
              style={inputStyle}
            >
              <option value="">전체</option>
              <option value="FALSE_LEFT">{RECONCILE_STATUS_LABEL.FALSE_LEFT}</option>
              <option value="FALSE_RIGHT">{RECONCILE_STATUS_LABEL.FALSE_RIGHT}</option>
            </select>
            <Button
              variant="secondary"
              onClick={handleCsv}
              data-testid="reconcile-csv-btn"
            >
              결과 CSV 다운로드
            </Button>
          </div>
        </div>
      ) : null}

      {/* ───── 결과 비교 테이블 (Designer mock 색상 cell 보존) ───── */}
      {response ? (
        <div
          data-testid="reconcile-result-table"
          style={{
            border: '1px solid var(--color-neutral-200)',
            borderRadius: 6,
            background: 'var(--color-neutral-0)',
            overflow: 'auto',
          }}
        >
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: 13,
            }}
          >
            <thead>
              <tr
                style={{
                  background: 'var(--color-neutral-50)',
                  color: 'var(--color-neutral-700)',
                }}
              >
                <th style={{ ...thStyle, width: 120 }}>상태</th>
                <th style={thStyle}>전표번호</th>
                <th style={{ ...thStyle, width: 110 }}>일자</th>
                <th style={thStyle}>운송사</th>
                <th style={{ ...thStyle, width: 90 }}>우리 시간</th>
                <th style={{ ...thStyle, width: 90 }}>운송사 시간</th>
                <th style={thStyle}>비고</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    style={{
                      padding: 24,
                      textAlign: 'center',
                      color: 'var(--color-neutral-500)',
                    }}
                  >
                    {statusFilter
                      ? '해당 상태에 결과가 없습니다.'
                      : mismatchedRows.length === 0
                        ? '모든 라인이 일치합니다 — mismatch 없음.'
                        : '비교 결과가 없습니다.'}
                  </td>
                </tr>
              ) : (
                filteredRows.map((r) => (
                  <tr
                    key={`${r.slipNo}-${r.dispatchDate}-${r.status}`}
                    data-testid={`reconcile-row-${r.slipNo}`}
                    style={{
                      borderTop: '1px solid var(--color-neutral-100)',
                    }}
                  >
                    <td
                      style={{
                        ...tdStyle,
                        background: STATUS_CELL_BG[r.status],
                        fontWeight: 600,
                      }}
                    >
                      <Badge variant={STATUS_VARIANT[r.status]}>
                        {RECONCILE_STATUS_LABEL[r.status]}
                      </Badge>
                    </td>
                    <td style={tdStyle}>{r.slipNo}</td>
                    <td style={tdStyle}>{r.dispatchDate}</td>
                    <td style={tdStyle}>{r.vendorName ?? '—'}</td>
                    <td style={tdStyle}>{r.actualTime ?? '—'}</td>
                    <td style={tdStyle}>{r.expectedTime ?? '—'}</td>
                    <td
                      style={{
                        ...tdStyle,
                        color: 'var(--color-neutral-600)',
                      }}
                    >
                      {r.reason}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Summary chip (상태별 카운트) — Designer mock 보존
// ---------------------------------------------------------------------------

interface SummaryChipProps {
  label: string
  value: number
  tone: 'success' | 'warning' | 'danger'
}

const SUMMARY_BG: Record<SummaryChipProps['tone'], string> = {
  success: 'var(--state-success-bg)',
  warning: 'var(--state-warning-bg)',
  danger: 'var(--state-danger-bg)',
}

const SUMMARY_FG: Record<SummaryChipProps['tone'], string> = {
  success: 'var(--state-success)',
  warning: 'var(--state-warning)',
  danger: 'var(--state-danger)',
}

function SummaryChip({ label, value, tone }: SummaryChipProps) {
  return (
    <div
      style={{
        padding: '6px 12px',
        borderRadius: 999,
        background: SUMMARY_BG[tone],
        color: SUMMARY_FG[tone],
        fontWeight: 600,
        fontSize: 13,
      }}
    >
      {label} {value}
    </div>
  )
}

// ---------------------------------------------------------------------------
// 결과 행 status cell 배경 색상 (Designer mock 보존)
// TRUE=초록 (응답 미포함이지만 매핑 보존) / FALSE_LEFT=주황 / FALSE_RIGHT=빨강
// ---------------------------------------------------------------------------

const STATUS_CELL_BG: Record<ReconcileStatus, string> = {
  TRUE: 'var(--state-success-bg)',
  FALSE_LEFT: 'var(--state-warning-bg)',
  FALSE_RIGHT: 'var(--state-danger-bg)',
}

// ---------------------------------------------------------------------------
// 공통 스타일 (Designer mock 보존)
// ---------------------------------------------------------------------------

const inputStyle: React.CSSProperties = {
  height: 32,
  padding: '0 10px',
  border: '1px solid var(--color-neutral-300)',
  borderRadius: 6,
  fontSize: 13,
}

const thStyle: React.CSSProperties = {
  padding: '10px 12px',
  textAlign: 'left',
  fontWeight: 600,
  borderBottom: '1px solid var(--color-neutral-200)',
}

const tdStyle: React.CSSProperties = {
  padding: '10px 12px',
}
