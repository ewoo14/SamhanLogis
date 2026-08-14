/**
 * 전표 정리 리스트 페이지 (`/sales/slip-cleanup`) — PR-E1 FE-5.
 *
 * <p>legacy GAS 13번 "전표정리리스트" 자동 조회 이식. BE-1 commit 281415f
 * ({@code GET /slips/cleanup?from=&to=}) 기반.
 *
 * <p>페이지 구성:
 * <ul>
 *   <li>헤더 "전표 정리 리스트" + 전체 카운트</li>
 *   <li>필터: from / to (default = 최근 7일)</li>
 *   <li>"CSV 다운로드" 버튼 — 현재 결과를 CSV (UTF-8 BOM) 로 다운로드</li>
 *   <li>status 별 그룹 (DRAFT / SAVED / SENT / ... / REJECTED / CANCELED)</li>
 *   <li>각 그룹 = 거래처 (partnerCode) 별 표 + flag 색상 chip</li>
 *   <li>row 클릭 → 기존 SlipDetailPage 이동 ({@code /sales/:id})</li>
 * </ul>
 *
 * <p>UUID 비공개 — 화면 표시는 slipNo / partnerCode / partnerName / slipDate.
 *
 * <p>data-testid:
 * <ul>
 *   <li>{@code slip-cleanup-from}, {@code slip-cleanup-to}, {@code slip-cleanup-search}</li>
 *   <li>{@code slip-cleanup-csv-download}</li>
 *   <li>{@code slip-cleanup-group-{status}} (예: slip-cleanup-group-DRAFT)</li>
 *   <li>{@code slip-cleanup-row-{slipNo}}</li>
 *   <li>{@code slip-cleanup-flag-{flagType}} (예: slip-cleanup-flag-REJECTED)</li>
 * </ul>
 *
 * <p>풀네임 ROLE: SALES / MANAGER / MASTER / ACCOUNTANT (RoleGuard 는 routes/index.tsx 에서).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, Input, Tabs } from '@samhan/design-system'
import type { SlipStatus } from '@samhan/design-system'
import {
  CLEANUP_FLAG_COLOR,
  CLEANUP_FLAG_LABEL,
  entryFlags,
  getCleanupList,
  type CleanupEntry,
  type CleanupFlag,
  type SlipCleanupResponse,
} from '../api/slipCleanupApi'
import {
  getLatestSlipCleanupHistory,
  saveSlipCleanupHistory,
  type SlipCleanupSaveHistoryDetailResponse,
} from '../api/slipCleanupSaveHistoryApi'
import { SlipCleanupHistoryTab, formatDateTime } from '../components/SlipCleanupHistoryTab'
import { SlipCleanupRestoredBanner } from '../components/SlipCleanupRestoredBanner'
import { SlipCleanupSaveDialog } from '../components/SlipCleanupSaveDialog'
import { usePageTitle } from '../hooks/usePageTitle'
import { maskCreatedBy } from '../utils/maskCreatedBy'

/** 한국어 status 라벨 (SlipStatusBadge 와 동일 매핑 — local copy 로 dependency cycle 회피). */
const STATUS_LABEL: Record<SlipStatus, string> = {
  DRAFT: '작성중',
  SAVED: '저장완료',
  SENT: '전송완료',
  ACCEPTED: '수락',
  PROCESSING: '처리중',
  INSPECTING: '검수중',
  COMPLETED: '처리완료',
  SHIPPING: '배송중',
  DELIVERED: '배송완료',
  CONFIRMED: '확정',
  REJECTED: '반려',
  CANCELED: '취소',
}

/** YYYY-MM-DD 포맷 헬퍼 (Date → ISO 앞 10자). */
function toIsoDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** default from = 오늘 - 7일, to = 오늘. */
function defaultRange(): { from: string; to: string } {
  const today = new Date()
  const past = new Date()
  past.setDate(today.getDate() - 7)
  return { from: toIsoDate(past), to: toIsoDate(today) }
}

/** KRW 정수 string → "₩1,234,567" (음수/0 호환). */
function formatKrw(raw: string): string {
  const n = Number.parseFloat(raw)
  if (!Number.isFinite(n)) return '—'
  const sign = n < 0 ? '-' : ''
  const abs = Math.abs(Math.round(n))
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return `${sign}₩${abs}`
}

/** CSV 셀 escape — 콤마/줄바꿈/큰따옴표 포함 시 큰따옴표 wrap + 내부 큰따옴표 2배. */
function csvCell(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return ''
  const s = String(v)
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

/**
 * 결과를 CSV 다운로드 (UTF-8 BOM — Excel 호환).
 *
 * 컬럼: 전표번호 / 전표일자 / 상태 / 거래처코드 / 거래처명 / 지역그룹 / 라인수 / 합계금액 / 정합성플래그
 */
function downloadCsv(filename: string, entries: CleanupEntry[]): void {
  const header = [
    '전표번호',
    '전표일자',
    '상태',
    '거래처코드',
    '거래처명',
    '지역그룹',
    '라인수',
    '합계금액',
    '정합성플래그',
  ]
  const rows = entries.map((e) => {
    const flags = entryFlags(e).map((f) => CLEANUP_FLAG_LABEL[f]).join(' / ')
    return [
      e.slipNo,
      e.slipDate,
      STATUS_LABEL[e.status],
      e.partnerCode ?? '(미매핑)',
      e.partnerName ?? '',
      e.classifiedRegionGroup ?? '',
      e.lineCount,
      e.totalAmount,
      flags,
    ]
      .map(csvCell)
      .join(',')
  })
  const body = [header.map(csvCell).join(','), ...rows].join('\r\n')
  // UTF-8 BOM (Excel 한글 호환).
  const blob = new Blob(['﻿', body], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

/** flag chip 컴포넌트 — 색상 + 라벨 + data-testid. */
function FlagChip({ flag }: { flag: CleanupFlag }) {
  const c = CLEANUP_FLAG_COLOR[flag]
  return (
    <span
      data-testid={`slip-cleanup-flag-${flag}`}
      data-flag={flag}
      style={{
        display: 'inline-block',
        padding: '2px 8px',
        marginRight: 4,
        borderRadius: 10,
        fontSize: 11,
        fontWeight: 600,
        background: c.bg,
        color: c.fg,
        border: `1px solid ${c.border}`,
      }}
    >
      {CLEANUP_FLAG_LABEL[flag]}
    </span>
  )
}

/** entries 를 status 키로 그룹핑 (LinkedHashMap 유사 — 첫 등장 순서 유지). */
function groupByStatus(
  entries: CleanupEntry[],
): { status: SlipStatus; rows: CleanupEntry[] }[] {
  const map = new Map<SlipStatus, CleanupEntry[]>()
  for (const e of entries) {
    const arr = map.get(e.status) ?? []
    arr.push(e)
    map.set(e.status, arr)
  }
  return Array.from(map.entries()).map(([status, rows]) => ({ status, rows }))
}

export function SlipCleanupPage() {
  usePageTitle('전표 정리 리스트')
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const initial = useMemo(() => defaultRange(), [])
  const [from, setFrom] = useState(initial.from)
  const [to, setTo] = useState(initial.to)
  // 검색 버튼 클릭 시점의 (from, to) 만 query key 로 사용 — 입력 중 자동 fetch 방지.
  const [applied, setApplied] = useState<{ from: string; to: string }>(initial)
  const [activeTab, setActiveTab] = useState(0)
  const [restoredResponse, setRestoredResponse] = useState<SlipCleanupResponse | null>(null)
  const [restoreBanner, setRestoreBanner] = useState<string | null>(null)
  const [saveDialogOpen, setSaveDialogOpen] = useState(false)
  const [latestRestoreSettled, setLatestRestoreSettled] = useState(false)
  const lastAutoSaveKeyRef = useRef<string | null>(null)
  const skipNextAutoSaveRef = useRef(false)

  const query = useQuery<SlipCleanupResponse>({
    queryKey: ['slip-cleanup', applied.from, applied.to],
    queryFn: () => getCleanupList(applied.from, applied.to),
    enabled: latestRestoreSettled && !restoredResponse,
  })

  const cleanupData = restoredResponse ?? query.data
  const groups = useMemo(
    () => (cleanupData ? groupByStatus(cleanupData.entries) : []),
    [cleanupData],
  )

  const handleSearch = () => {
    if (!from || !to) return
    setRestoredResponse(null)
    setRestoreBanner(null)
    skipNextAutoSaveRef.current = false
    setApplied({ from, to })
  }

  const handleCsv = () => {
    if (!cleanupData) return
    const filename = `slip-cleanup_${cleanupData.from}_${cleanupData.to}.csv`
    downloadCsv(filename, cleanupData.entries)
  }

  useEffect(() => {
    let cancelled = false
    void getLatestSlipCleanupHistory('SLIP_CLEANUP')
      .then((detail) => {
        if (cancelled || !detail) return
        const payload = detail.responsePayload as SlipCleanupResponse
        setRestoredResponse(payload)
        setFrom(payload.from)
        setTo(payload.to)
        skipNextAutoSaveRef.current = true
        setApplied({ from: payload.from, to: payload.to })
        setRestoreBanner(`이전 결과 복원됨 · ${formatDateTime(detail.createdAt)}`)
      })
      .catch(() => {
        // latest 없음/조회 실패는 첫 방문 UX 를 막지 않는다.
      })
      .finally(() => {
        if (!cancelled) setLatestRestoreSettled(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!query.data) return
    if (skipNextAutoSaveRef.current) {
      skipNextAutoSaveRef.current = false
      return
    }
    const rowCount = query.data.entries.length
    const autoSaveKey = `${query.data.from}|${query.data.to}|${rowCount}|${query.data.totalSlips}`
    if (lastAutoSaveKeyRef.current === autoSaveKey) return
    lastAutoSaveKeyRef.current = autoSaveKey
    void saveSlipCleanupHistory({
      programType: 'SLIP_CLEANUP',
      saveMode: 'AUTO_LATEST',
      requestParams: {
        from: query.data.from,
        to: query.data.to,
        rowCount,
        totalSlips: query.data.totalSlips,
      },
      responsePayload: query.data,
    }).catch(() => {
      // 자동 저장 실패는 조회 UX 를 막지 않는다.
    })
  }, [query.data])

  const saveManualMutation = useMutation({
    mutationFn: (topic: string) => {
      if (!cleanupData) throw new Error('저장할 전표정리 결과가 없습니다.')
      return saveSlipCleanupHistory({
        programType: 'SLIP_CLEANUP',
        saveMode: 'MANUAL_NAMED',
        topic,
        requestParams: {
          from: cleanupData.from,
          to: cleanupData.to,
          rowCount: cleanupData.entries.length,
          totalSlips: cleanupData.totalSlips,
        },
        responsePayload: cleanupData,
      })
    },
    onSuccess: () => {
      setSaveDialogOpen(false)
      setActiveTab(1)
      void queryClient.invalidateQueries({ queryKey: ['slip-cleanup-history-list', 'SLIP_CLEANUP'] })
      void queryClient.invalidateQueries({ queryKey: ['slip-cleanup-history-list'] })
    },
  })

  const handleRestore = useCallback((detail: SlipCleanupSaveHistoryDetailResponse) => {
    const payload = detail.responsePayload as SlipCleanupResponse
    setRestoredResponse(payload)
    setFrom(payload.from)
    setTo(payload.to)
    skipNextAutoSaveRef.current = true
    setApplied({ from: payload.from, to: payload.to })
    setActiveTab(0)
    setRestoreBanner(`복원: ${formatDateTime(detail.createdAt)} ${maskCreatedBy(detail.createdBy)} '${detail.topic}'`)
  }, [])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Tabs
        tabs={[
          { label: '실행', testId: 'slip-cleanup-history-tab-run' },
          { label: '저장내역', testId: 'slip-cleanup-history-tab-list' },
        ]}
        activeIndex={activeTab}
        onTabChange={setActiveTab}
        ariaLabel="전표정리 저장내역 탭"
      >
        <div>
          {restoreBanner ? (
            <SlipCleanupRestoredBanner
              message={restoreBanner}
              testIdPrefix="slip-cleanup-history"
              onClose={() => setRestoreBanner(null)}
            />
          ) : null}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 16,
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        <h3 style={{ margin: 0 }}>
          전표 정리 리스트
          {cleanupData ? (
            <span
              style={{
                marginLeft: 8,
                fontSize: 13,
                fontWeight: 400,
                color: 'var(--color-neutral-500)',
              }}
            >
              총 {cleanupData.totalSlips}건
            </span>
          ) : null}
        </h3>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Button
            variant="secondary"
            data-testid="slip-cleanup-csv-download"
            onClick={handleCsv}
            disabled={!cleanupData || (cleanupData.entries?.length ?? 0) === 0}
          >
            CSV 다운로드
          </Button>
          <Button
            variant="primary"
            data-testid="slip-cleanup-history-save-button"
            onClick={() => setSaveDialogOpen(true)}
            disabled={!cleanupData || (cleanupData.entries?.length ?? 0) === 0}
          >
            내역으로 저장
          </Button>
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          gap: 12,
          marginBottom: 20,
          flexWrap: 'wrap',
          alignItems: 'center',
        }}
      >
        <Input
          label="시작일"
          type="date"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          data-testid="slip-cleanup-from"
          inputSize="sm"
          fullWidth={false}
        />
        <Input
          label="종료일"
          type="date"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          data-testid="slip-cleanup-to"
          inputSize="sm"
          fullWidth={false}
        />
        <Button
          variant="primary"
          data-testid="slip-cleanup-search"
          onClick={handleSearch}
          disabled={!from || !to || from > to}
        >
          조회
        </Button>
      </div>

      {query.isError ? (
        <div className="error-banner" role="alert" style={{ marginBottom: 16 }}>
          전표 정리 리스트를 불러오지 못했습니다.
        </div>
      ) : null}

      {query.isLoading ? (
        <div style={{ padding: 24, color: 'var(--color-neutral-500)' }}>불러오는 중...</div>
      ) : null}

      {cleanupData && (cleanupData.entries?.length ?? 0) === 0 ? (
        <div
          style={{
            padding: 24,
            color: 'var(--color-neutral-500)',
            border: '1px dashed var(--color-neutral-300)',
            borderRadius: 6,
            textAlign: 'center',
          }}
        >
          기간 내 전표가 없습니다.
        </div>
      ) : null}

      {groups.map(({ status, rows }) => (
        <section
          key={status}
          data-testid={`slip-cleanup-group-${status}`}
          style={{
            marginBottom: 24,
            border: '1px solid var(--color-neutral-200)',
            borderRadius: 8,
            overflow: 'hidden',
          }}
        >
          <header
            style={{
              padding: '8px 12px',
              background: 'var(--color-neutral-50)',
              borderBottom: '1px solid var(--color-neutral-200)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <strong style={{ fontSize: 14 }}>
              {STATUS_LABEL[status]}{' '}
              <span style={{ color: 'var(--color-neutral-500)', fontWeight: 400, fontSize: 12 }}>
                ({rows.length}건)
              </span>
            </strong>
          </header>
          <div style={{ overflowX: 'auto' }}>
            <table
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                fontSize: 13,
              }}
            >
              <thead>
                <tr style={{ background: 'var(--surface-card)', textAlign: 'left' }}>
                  <th style={thStyle}>전표번호</th>
                  <th style={thStyle}>거래처코드</th>
                  <th style={thStyle}>거래처명</th>
                  <th style={thStyle}>지역그룹</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>라인수</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>합계금액</th>
                  <th style={thStyle}>정합성</th>
                  <th style={{ ...thStyle, width: 110 }}>원본</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((entry) => {
                  const flags = entryFlags(entry)
                  return (
                    <tr
                      key={entry.id}
                      data-testid={`slip-cleanup-row-${entry.slipNo}`}
                      style={{ borderTop: '1px solid var(--color-neutral-100)' }}
                    >
                      <td style={tdStyle}>{entry.slipNo}</td>
                      <td style={tdStyle}>{entry.partnerCode ?? '(미매핑)'}</td>
                      <td style={tdStyle}>{entry.partnerName ?? '—'}</td>
                      <td style={tdStyle}>
                        {entry.classifiedRegionGroup ?? '—'}
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'right' }}>
                        {entry.lineCount}
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'right' }}>
                        {formatKrw(entry.totalAmount)}
                      </td>
                      <td style={tdStyle}>
                        {flags.length === 0 ? (
                          <span style={{ color: 'var(--state-success)', fontSize: 12 }}>
                            정상
                          </span>
                        ) : (
                          flags.map((f) => <FlagChip key={f} flag={f} />)
                        )}
                      </td>
                      <td style={tdStyle}>
                        <button
                          type="button"
                          onClick={() => navigate(`/sales/${entry.id}`)}
                          data-testid={`slip-cleanup-row-${entry.slipNo}-link`}
                          style={linkBtnStyle}
                        >
                          원본 전표 보기
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>
      ))}
        </div>
        <SlipCleanupHistoryTab
          programType="SLIP_CLEANUP"
          testIdPrefix="slip-cleanup-history"
          isSaving={saveManualMutation.isPending}
          onRestore={handleRestore}
        />
      </Tabs>
      <SlipCleanupSaveDialog
        open={saveDialogOpen}
        isSaving={saveManualMutation.isPending}
        testIdPrefix="slip-cleanup-history"
        onClose={() => setSaveDialogOpen(false)}
        onSave={(topic) => saveManualMutation.mutate(topic)}
      />
    </div>
  )
}

const thStyle: React.CSSProperties = {
  padding: '8px 10px',
  borderBottom: '1px solid var(--color-neutral-200)',
  fontSize: 12,
  fontWeight: 600,
  color: 'var(--color-neutral-700)',
  background: 'var(--surface-card)',
}

const tdStyle: React.CSSProperties = {
  padding: '8px 10px',
  fontSize: 13,
  color: 'var(--color-neutral-800)',
  whiteSpace: 'nowrap',
}

const linkBtnStyle: React.CSSProperties = {
  background: 'transparent',
  border: '1px solid var(--color-neutral-300)',
  borderRadius: 4,
  padding: '4px 8px',
  fontSize: 12,
  cursor: 'pointer',
  color: 'var(--action-brand-hover)',
}
