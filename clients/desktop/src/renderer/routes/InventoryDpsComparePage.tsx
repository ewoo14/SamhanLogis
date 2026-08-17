/**
 * DPS 입고 비교 페이지 (`/warehouse/dps-compare`) — PR-E1 FE-1.
 *
 * <p>Samhan Public 자동화 — legacy GAS 1번 (DPS 입고기록 비교) + 16번 (품목별
 * DPS 입고내역 비교) 의 native 이식. BE-2 (commit 4b14084) endpoint 호출.
 *
 * <h2>PR-H4c FE-B 보강</h2>
 * <ul>
 *   <li>본 화면은 read-only (사용자 비교 도구) — 단일 entity 미보유 → SSE/audit overlay 미적용.</li>
 *   <li>비교 결과 mismatch 표 자체에는 변경 이력이 없음. 만약 mismatch 가 발견되어 사용자가
 *       원본 출고전표를 수정하면 SlipDetailPage (PR-H1~H3) 의 audit overlay 가 자동 추적.</li>
 *   <li>화면 우상단에 "감사 추적: 원 전표 화면에서 자동" 안내 배너 추가.</li>
 * </ul>
 *
 * data-testid (PR-H4c FE-B 신규):
 * - dps-compare-realtime-notice
 *
 * <h2>UX</h2>
 * <ol>
 *   <li>날짜 범위 from/to 입력 (입고전표 자동 조회 기간)</li>
 *   <li>매칭 단위 토글 (SLIP / ITEM)</li>
 *   <li>DPS 엑셀 .xlsx 업로드 — 사용자 명시 "자동 조회 X"</li>
 *   <li>"양식 다운로드" link — 헤더만 있는 .xlsx 받기</li>
 *   <li>"비교 실행" → 결과 통계 카드 + mismatch 표</li>
 *   <li>mismatch 표 reason 별 색상 (QUANTITY=주황, PARTNER=빨강, NOT_FOUND=회색)</li>
 *   <li>"결과 CSV 다운로드" — mismatch 보고서 BOM 포함 UTF-8 CSV</li>
 * </ol>
 *
 * <h2>UUID 비공개</h2>
 * <p>화면 노출 식별자 = slipNo / productCode / partnerCode 만. UUID 미사용.
 *
 * <h2>data-testid</h2>
 * <ul>
 *   <li>{@code dps-compare-from} / {@code dps-compare-to} — 날짜 input</li>
 *   <li>{@code dps-compare-groupby-slip} / {@code dps-compare-groupby-item}</li>
 *   <li>{@code dps-compare-file-input} — 숨김 input + 트리거 버튼</li>
 *   <li>{@code dps-compare-template-link} — 양식 다운로드</li>
 *   <li>{@code dps-compare-run-button} — 비교 실행</li>
 *   <li>{@code dps-compare-result-table} — mismatch 표</li>
 *   <li>{@code dps-compare-row-{slipNo|index}} — 각 mismatch 행</li>
 * </ul>
 */
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type CSSProperties,
} from 'react'
import { useMutation } from '@tanstack/react-query'
import { Button, Tabs } from '@samhan/design-system'
import {
  compareDps,
  downloadDpsTemplate,
  DPS_MISMATCH_COLOR,
  DPS_MISMATCH_LABEL,
  type DpsCompareGroupBy,
  type DpsCompareResponse,
  type DpsRowMismatch,
} from '../api/dpsCompareApi'
import {
  getLatestDpsHistory,
  saveDpsHistory,
  type DpsSaveHistoryDetailResponse,
} from '../api/dpsSaveHistoryApi'
import { DpsHistoryTab } from '../components/DpsHistoryTab'
import { DpsRestoredBanner } from '../components/DpsRestoredBanner'
import { DpsSaveDialog } from '../components/DpsSaveDialog'
import { maskCreatedBy } from '../utils/maskCreatedBy'
import { usePageTitle } from '../hooks/usePageTitle'
import { useIsMobile } from '../hooks/useIsMobile'

/** 오늘 날짜 (YYYY-MM-DD) — date input 기본값. */
function todayIso(): string {
  const d = new Date()
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

/**
 * mismatch[] → CSV 문자열 (BOM 포함, Excel 한글 호환).
 *
 * <p>컬럼: 카테고리 / 전표번호 / 품번 / 거래처코드 / 출고수량 / DPS수량 / 사유.
 */
function mismatchesToCsv(mismatches: DpsRowMismatch[]): string {
  const header = [
    '카테고리',
    '전표번호',
    '품번',
    '거래처코드',
    '입고수량',
    'DPS수량',
    '입고합계',
    'DPS합계',
    '사유',
  ]
  const escape = (v: string): string => {
    if (v.includes('"') || v.includes(',') || v.includes('\n')) {
      return `"${v.replace(/"/g, '""')}"`
    }
    return v
  }
  const lines = [header.map(escape).join(',')]
  for (const m of mismatches) {
    const cells = [
      DPS_MISMATCH_LABEL[m.rowType],
      m.slipNo ?? '',
      m.productCode ?? '',
      m.partnerCode ?? '',
      String(m.expectedQty),
      String(m.actualQty),
      String(m.expectedAmount),
      String(m.actualAmount),
      m.reason,
    ]
    lines.push(cells.map(escape).join(','))
  }
  return '﻿' + lines.join('\n')
}

/** Blob 을 사용자 다운로드로 트리거 (filename 지정). */
function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

/** 한국어 fallback error 메시지. */
function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  return '비교 실행 중 오류가 발생했습니다. 다시 시도해 주세요.'
}

export function InventoryDpsComparePage() {
  usePageTitle('DPS 입고 비교')
  const isMobile = useIsMobile()

  // ── 폼 상태 ────────────────────────────────────────────────
  const today = useMemo(todayIso, [])
  const [from, setFrom] = useState(today)
  const [to, setTo] = useState(today)
  const [groupBy, setGroupBy] = useState<DpsCompareGroupBy>('SLIP')
  const [file, setFile] = useState<File | null>(null)
  const [validationError, setValidationError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState(0)
  const [restoredResult, setRestoredResult] = useState<DpsCompareResponse | null>(null)
  const [restoreBanner, setRestoreBanner] = useState<string | null>(null)
  const [saveDialogOpen, setSaveDialogOpen] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  // ── BE 호출 mutation ───────────────────────────────────────
  const compareMutation = useMutation({
    mutationFn: () => {
      if (!file) throw new Error('DPS 엑셀 파일을 먼저 선택해 주세요.')
      return compareDps(file, from, to, groupBy)
    },
    onSuccess: (data) => {
      setRestoredResult(null)
      void saveDpsHistory({
        programType: 'DPS_COMPARE',
        saveMode: 'AUTO_LATEST',
        requestParams: {
          from,
          to,
          groupBy,
          fileName: file?.name ?? null,
          rowCount: data.dpsRowCount,
          mismatchCount: data.mismatchCount,
        },
        responsePayload: data,
      }).catch(() => {
        // 자동 저장 실패는 비교 실행 UX 를 막지 않는다. 명시 저장에서 사용자에게 재시도 기회를 제공한다.
      })
    },
  })
  const saveManualMutation = useMutation({
    mutationFn: (topic: string) => {
      const payload = compareMutation.data ?? restoredResult
      if (!payload) throw new Error('저장할 DPS 비교 결과가 없습니다.')
      return saveDpsHistory({
        programType: 'DPS_COMPARE',
        saveMode: 'MANUAL_NAMED',
        topic,
        requestParams: {
          from: payload.from,
          to: payload.to,
          groupBy: payload.groupBy,
          mismatchCount: payload.mismatchCount,
          rowCount: payload.dpsRowCount,
        },
        responsePayload: payload,
      })
    },
    onSuccess: () => {
      setSaveDialogOpen(false)
      setActiveTab(1)
    },
  })
  const result: DpsCompareResponse | undefined = compareMutation.data ?? restoredResult ?? undefined

  useEffect(() => {
    let cancelled = false
    void getLatestDpsHistory('DPS_COMPARE')
      .then((detail) => {
        if (cancelled || !detail) return
        setRestoredResult(detail.responsePayload as DpsCompareResponse)
        setRestoreBanner(`이전 결과 복원됨 · ${formatDateTime(detail.createdAt)}`)
      })
      .catch(() => {
        // latest 없음/조회 실패는 첫 방문 UX 를 막지 않는다.
      })
    return () => {
      cancelled = true
    }
  }, [])

  // ── 파일 선택 ─────────────────────────────────────────────
  const handleFileChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0]
    if (!selected) return
    if (!selected.name.toLowerCase().endsWith('.xlsx')) {
      setValidationError(
        `.xlsx 파일만 업로드 가능합니다 (선택한 파일: ${selected.name})`,
      )
      setFile(null)
    } else {
      setValidationError(null)
      setFile(selected)
    }
    // 동일 파일 재선택 허용
    e.target.value = ''
  }, [])

  // ── 양식 다운로드 ─────────────────────────────────────────
  const handleTemplateDownload = useCallback(async (e: React.MouseEvent) => {
    e.preventDefault()
    try {
      const blob = await downloadDpsTemplate()
      triggerDownload(blob, 'dps-compare-template.xlsx')
    } catch (err) {
      setValidationError(`양식 다운로드 실패: ${errorMessage(err)}`)
    }
  }, [])

  // ── 비교 실행 ─────────────────────────────────────────────
  const handleRun = useCallback(() => {
    if (!file) {
      setValidationError('DPS 엑셀 파일을 먼저 선택해 주세요.')
      return
    }
    if (!from || !to) {
      setValidationError('조회 기간을 입력해 주세요.')
      return
    }
    if (from > to) {
      setValidationError('시작일이 종료일보다 늦을 수 없습니다.')
      return
    }
    setValidationError(null)
    setRestoreBanner(null)
    compareMutation.mutate()
  }, [compareMutation, file, from, to])

  const handleRestore = useCallback((detail: DpsSaveHistoryDetailResponse) => {
    const payload = detail.responsePayload as DpsCompareResponse
    setRestoredResult(payload)
    setActiveTab(0)
    setRestoreBanner(`복원: ${formatDateTime(detail.createdAt)} ${maskCreatedBy(detail.createdBy)} '${detail.topic}'`)
  }, [])

  // ── 결과 CSV 다운로드 ─────────────────────────────────────
  const handleCsvDownload = useCallback(() => {
    if (!result || result.mismatches.length === 0) return
    const csv = mismatchesToCsv(result.mismatches)
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const stamp = new Date()
      .toISOString()
      .replace(/[:.]/g, '-')
      .substring(0, 19)
    triggerDownload(blob, `dps-compare-${stamp}.csv`)
  }, [result])

  // ── 비교 실행 활성 조건 ────────────────────────────────────
  const canRun
    = !!file && !!from && !!to && !compareMutation.isPending

  return (
    <>
      <div style={headerRowStyle}>
        <h3 style={{ margin: 0 }}>DPS 입고 비교</h3>
        <span style={subtitleStyle}>
          입고전표 자동 조회 + DPS 엑셀 업로드 → SLIP/ITEM 단위 매칭
        </span>
        {/* PR-H4c FE-B: read-only 비교 화면 안내 */}
        <span
          data-testid="dps-compare-realtime-notice"
          style={{
            fontSize: 11,
            color: 'var(--color-neutral-500, #6B7280)',
            marginLeft: 'auto',
          }}
        >
          감사 추적 (수정 이력) 은 원 출고전표 화면에서 자동
        </span>
      </div>

      <Tabs
        tabs={[
          { label: '실행', testId: 'dps-history-tab-run' },
          { label: '저장내역', testId: 'dps-history-tab-list' },
        ]}
        activeIndex={activeTab}
        onTabChange={setActiveTab}
        ariaLabel="DPS 입고 비교 탭"
      >
        <div>
          {restoreBanner ? (
            <DpsRestoredBanner
              message={restoreBanner}
              onClose={() => setRestoreBanner(null)}
            />
          ) : null}

          {/* ── 폼 영역 ─────────────────────────────────────────── */}
          <section style={formCardStyle}>
        <div style={formRowStyle}>
          <label style={fieldLabelStyle}>
            <span>조회 기간 시작</span>
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              data-testid="dps-compare-from"
              style={inputStyle}
            />
          </label>
          <label style={fieldLabelStyle}>
            <span>조회 기간 종료</span>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              data-testid="dps-compare-to"
              style={inputStyle}
            />
          </label>
          <div style={fieldLabelStyle}>
            <span>매칭 단위</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                data-testid="dps-compare-groupby-slip"
                onClick={() => setGroupBy('SLIP')}
                style={toggleButtonStyle(groupBy === 'SLIP')}
              >
                전표 단위 (SLIP)
              </button>
              <button
                type="button"
                data-testid="dps-compare-groupby-item"
                onClick={() => setGroupBy('ITEM')}
                style={toggleButtonStyle(groupBy === 'ITEM')}
              >
                품목 단위 (ITEM)
              </button>
            </div>
          </div>
        </div>

        <div style={formRowStyle}>
          <div style={fieldLabelStyle}>
            <span>DPS 엑셀 (.xlsx)</span>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx"
                onChange={handleFileChange}
                data-testid="dps-compare-file-input"
                style={{ display: 'none' }}
              />
              <Button
                variant="secondary"
                onClick={() => fileInputRef.current?.click()}
              >
                DPS 엑셀 업로드
              </Button>
              <span style={{ fontSize: 13, color: '#374151' }}>
                {file ? file.name : '선택된 파일 없음'}
              </span>
              {file ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setFile(null)
                    setValidationError(null)
                  }}
                >
                  제거
                </Button>
              ) : null}
            </div>
          </div>
          <div style={fieldLabelStyle}>
            <span>양식</span>
            <a
              href="#"
              onClick={handleTemplateDownload}
              data-testid="dps-compare-template-link"
              style={linkStyle}
            >
              DPS 엑셀 양식 다운로드
            </a>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Button
            variant="primary"
            onClick={handleRun}
            disabled={!canRun}
            loading={compareMutation.isPending}
            data-testid="dps-compare-run-button"
          >
            비교 실행
          </Button>
          {validationError ? (
            <span role="alert" style={errorBannerStyle}>
              ⚠ {validationError}
            </span>
          ) : null}
          {compareMutation.isError ? (
            <span role="alert" style={errorBannerStyle}>
              ⚠ {errorMessage(compareMutation.error)}
            </span>
          ) : null}
        </div>
      </section>

          {/* ── 결과 통계 카드 + mismatch 표 ─────────────────────── */}
          {result ? (
        <section style={resultSectionStyle}>
          <div style={statsRowStyle}>
            <StatCard label="조회 기간" value={`${result.from} ~ ${result.to}`} />
            <StatCard label="매칭 단위" value={result.groupBy} />
            <StatCard label="출고전표 라인" value={result.outboundCount.toLocaleString()} />
            <StatCard label="DPS 행" value={result.dpsRowCount.toLocaleString()} />
            <StatCard
              label="정상 일치"
              value={result.matchedCount.toLocaleString()}
              tone="success"
            />
            <StatCard
              label="불일치"
              value={result.mismatchCount.toLocaleString()}
              tone={result.mismatchCount > 0 ? 'danger' : 'neutral'}
            />
          </div>

          <div style={resultActionRowStyle}>
            <h4 style={{ margin: 0 }}>
              불일치 상세 ({result.mismatches.length.toLocaleString()}건)
            </h4>
            <Button
              variant="secondary"
              onClick={handleCsvDownload}
              disabled={result.mismatches.length === 0}
            >
              결과 CSV 다운로드
            </Button>
            <Button
              variant="primary"
              onClick={() => setSaveDialogOpen(true)}
              data-testid="dps-history-save-button"
            >
              내역으로 저장
            </Button>
          </div>

          {result.mismatches.length === 0 ? (
            <div style={successBannerStyle} role="status">
              ✓ 모든 라인이 정상 일치합니다
            </div>
          ) : (
            <div style={tableWrapStyle} data-testid="dps-compare-result-table">
              {isMobile ? (
                <div className="mobile-line-card-list">
                  {result.mismatches.map((m, idx) => (
                    <DpsMismatchCard
                      key={`${m.rowType}-${m.slipNo ?? ''}-${m.productCode ?? ''}-${idx}`}
                      mismatch={m}
                      testId={`dps-compare-row-${m.slipNo ?? `idx-${idx}`}`}
                    />
                  ))}
                </div>
              ) : (
                <table style={tableStyle}>
                  <thead>
                    <tr>
                      <th style={thStyle}>카테고리</th>
                      <th style={thStyle}>전표번호</th>
                      <th style={thStyle}>품번</th>
                      <th style={thStyle}>거래처코드</th>
                      <th style={{ ...thStyle, textAlign: 'right' }}>입고수량</th>
                      <th style={{ ...thStyle, textAlign: 'right' }}>DPS수량</th>
                      <th style={{ ...thStyle, textAlign: 'right' }}>입고합계</th>
                      <th style={{ ...thStyle, textAlign: 'right' }}>DPS합계</th>
                      <th style={thStyle}>사유</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.mismatches.map((m, idx) => {
                      const colors = DPS_MISMATCH_COLOR[m.rowType]
                      const testId = `dps-compare-row-${m.slipNo ?? `idx-${idx}`}`
                      return (
                        <tr
                          key={`${m.rowType}-${m.slipNo ?? ''}-${m.productCode ?? ''}-${idx}`}
                          data-testid={testId}
                          style={{ background: colors.background }}
                        >
                          <td style={tdStyle}>
                            <DpsMismatchBadge mismatch={m} />
                          </td>
                          <td style={tdStyle}>{m.slipNo ?? '—'}</td>
                          <td style={tdStyle}>{m.productCode ?? '—'}</td>
                          <td style={tdStyle}>{m.partnerCode ?? '—'}</td>
                          <td style={{ ...tdStyle, textAlign: 'right' }}>
                            {m.expectedQty.toLocaleString()}
                          </td>
                          <td style={{ ...tdStyle, textAlign: 'right' }}>
                            {m.actualQty.toLocaleString()}
                          </td>
                          <td style={{ ...tdStyle, textAlign: 'right' }}>
                            {m.expectedAmount.toLocaleString()}
                          </td>
                          <td style={{ ...tdStyle, textAlign: 'right' }}>
                            {m.actualAmount.toLocaleString()}
                          </td>
                          <td style={{ ...tdStyle, color: colors.text }}>
                            {m.reason}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </section>
          ) : null}
        </div>
        <DpsHistoryTab programType="DPS_COMPARE" onRestore={handleRestore} />
      </Tabs>
      <DpsSaveDialog
        open={saveDialogOpen}
        saving={saveManualMutation.isPending}
        onClose={() => setSaveDialogOpen(false)}
        onSave={(topic) => saveManualMutation.mutate(topic)}
      />
    </>
  )
}

// ---------------------------------------------------------------------------
// 보조 컴포넌트 / 스타일
// ---------------------------------------------------------------------------

interface StatCardProps {
  label: string
  value: string
  tone?: 'neutral' | 'success' | 'danger'
}

function StatCard({ label, value, tone = 'neutral' }: StatCardProps) {
  const valueColor
    = tone === 'success' ? '#047857' : tone === 'danger' ? '#B91C1C' : '#111827'
  return (
    <div style={statCardStyle}>
      <div style={{ fontSize: 11, color: '#6B7280', marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ fontSize: 18, fontWeight: 700, color: valueColor }}>
        {value}
      </div>
    </div>
  )
}

function DpsMismatchBadge({ mismatch }: { mismatch: DpsRowMismatch }) {
  const colors = DPS_MISMATCH_COLOR[mismatch.rowType]
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '2px 8px',
        borderRadius: 4,
        border: `1px solid ${colors.border}`,
        color: colors.text,
        fontSize: 12,
        fontWeight: 600,
        background: '#fff',
      }}
    >
      {DPS_MISMATCH_LABEL[mismatch.rowType]}
    </span>
  )
}

function DpsMismatchCard({
  mismatch,
  testId,
}: {
  mismatch: DpsRowMismatch
  testId: string
}) {
  const colors = DPS_MISMATCH_COLOR[mismatch.rowType]
  return (
    <article
      className="mobile-line-card"
      data-testid={testId}
      style={{ background: colors.background }}
    >
      <div className="mobile-line-card-header">
        <DpsMismatchBadge mismatch={mismatch} />
        <span className="mobile-line-card-meta">{mismatch.slipNo ?? '—'}</span>
      </div>
      <MobileField label="품번" value={mismatch.productCode ?? '—'} />
      <MobileField label="거래처코드" value={mismatch.partnerCode ?? '—'} />
      <MobileField label="입고수량" value={mismatch.expectedQty.toLocaleString()} numeric />
      <MobileField label="DPS수량" value={mismatch.actualQty.toLocaleString()} numeric />
      <MobileField label="입고합계" value={mismatch.expectedAmount.toLocaleString()} numeric />
      <MobileField label="DPS합계" value={mismatch.actualAmount.toLocaleString()} numeric />
      <MobileField label="사유" value={mismatch.reason} />
    </article>
  )
}

function MobileField({
  label,
  value,
  numeric = false,
}: {
  label: string
  value: React.ReactNode
  numeric?: boolean
}) {
  return (
    <div className="mobile-line-field">
      <span className="mobile-line-field-label">{label}</span>
      <div
        className={
          numeric
            ? 'mobile-line-field-value mobile-line-field-value--numeric'
            : 'mobile-line-field-value'
        }
      >
        {value}
      </div>
    </div>
  )
}

function formatDateTime(value: string): string {
  try {
    return new Date(value).toLocaleString('ko-KR', {
      timeZone: 'Asia/Seoul',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return value
  }
}

const headerRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'baseline',
  gap: 12,
  marginBottom: 16,
  flexWrap: 'wrap',
}

const subtitleStyle: CSSProperties = {
  fontSize: 12,
  color: '#6B7280',
}

const formCardStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 16,
  padding: 16,
  border: '1px solid #E5E7EB',
  borderRadius: 8,
  background: '#FFFFFF',
  marginBottom: 16,
}

const formRowStyle: CSSProperties = {
  display: 'flex',
  gap: 16,
  flexWrap: 'wrap',
  alignItems: 'flex-end',
}

const fieldLabelStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  fontSize: 12,
  color: '#374151',
  minWidth: 200,
}

const inputStyle: CSSProperties = {
  height: 32,
  padding: '0 10px',
  border: '1px solid #D1D5DB',
  borderRadius: 6,
  fontSize: 13,
}

function toggleButtonStyle(active: boolean): CSSProperties {
  return {
    height: 32,
    padding: '0 12px',
    border: `1px solid ${active ? '#2563EB' : '#D1D5DB'}`,
    borderRadius: 6,
    background: active ? '#EFF6FF' : '#FFFFFF',
    color: active ? '#1D4ED8' : '#374151',
    fontSize: 13,
    fontWeight: active ? 600 : 400,
    cursor: 'pointer',
  }
}

const linkStyle: CSSProperties = {
  fontSize: 13,
  color: '#2563EB',
  textDecoration: 'underline',
  cursor: 'pointer',
  height: 32,
  display: 'inline-flex',
  alignItems: 'center',
}

const errorBannerStyle: CSSProperties = {
  fontSize: 12,
  color: '#B91C1C',
  background: '#FEF2F2',
  border: '1px solid #FECACA',
  borderRadius: 4,
  padding: '4px 8px',
}

const successBannerStyle: CSSProperties = {
  fontSize: 13,
  color: '#047857',
  background: '#ECFDF5',
  border: '1px solid #A7F3D0',
  borderRadius: 6,
  padding: 12,
}

const resultSectionStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
}

const statsRowStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
  gap: 12,
}

const statCardStyle: CSSProperties = {
  padding: 12,
  border: '1px solid #E5E7EB',
  borderRadius: 6,
  background: '#FFFFFF',
}

const resultActionRowStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginTop: 8,
}

const tableWrapStyle: CSSProperties = {
  border: '1px solid #E5E7EB',
  borderRadius: 6,
  overflow: 'auto',
  background: '#FFFFFF',
}

const tableStyle: CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: 13,
}

const thStyle: CSSProperties = {
  textAlign: 'left',
  padding: '8px 10px',
  borderBottom: '1px solid #E5E7EB',
  background: '#F9FAFB',
  fontSize: 12,
  fontWeight: 600,
  color: '#374151',
  whiteSpace: 'nowrap',
}

const tdStyle: CSSProperties = {
  padding: '8px 10px',
  borderBottom: '1px solid #F3F4F6',
}
