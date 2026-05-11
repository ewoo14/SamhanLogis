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
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Button } from '@samhan/design-system'
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
import { usePageTitle } from '../hooks/usePageTitle'

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

  const initial = useMemo(() => defaultRange(), [])
  const [from, setFrom] = useState(initial.from)
  const [to, setTo] = useState(initial.to)
  // 검색 버튼 클릭 시점의 (from, to) 만 query key 로 사용 — 입력 중 자동 fetch 방지.
  const [applied, setApplied] = useState<{ from: string; to: string }>(initial)

  const query = useQuery<SlipCleanupResponse>({
    queryKey: ['slip-cleanup', applied.from, applied.to],
    queryFn: () => getCleanupList(applied.from, applied.to),
  })

  const groups = useMemo(
    () => (query.data ? groupByStatus(query.data.entries) : []),
    [query.data],
  )

  const handleSearch = () => {
    if (!from || !to) return
    setApplied({ from, to })
  }

  const handleCsv = () => {
    if (!query.data) return
    const filename = `slip-cleanup_${query.data.from}_${query.data.to}.csv`
    downloadCsv(filename, query.data.entries)
  }

  return (
    <>
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
          {query.data ? (
            <span
              style={{
                marginLeft: 8,
                fontSize: 13,
                fontWeight: 400,
                color: '#6B7280',
              }}
            >
              총 {query.data.totalSlips}건
            </span>
          ) : null}
        </h3>
        <Button
          variant="secondary"
          data-testid="slip-cleanup-csv-download"
          onClick={handleCsv}
          disabled={!query.data || query.data.entries.length === 0}
        >
          CSV 다운로드
        </Button>
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
        <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 13, color: '#374151' }}>시작일</span>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            data-testid="slip-cleanup-from"
            style={inputStyle}
          />
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 13, color: '#374151' }}>종료일</span>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            data-testid="slip-cleanup-to"
            style={inputStyle}
          />
        </label>
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
        <div style={{ padding: 24, color: '#6B7280' }}>불러오는 중...</div>
      ) : null}

      {query.data && query.data.entries.length === 0 ? (
        <div
          style={{
            padding: 24,
            color: '#6B7280',
            border: '1px dashed #D1D5DB',
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
            border: '1px solid #E5E7EB',
            borderRadius: 8,
            overflow: 'hidden',
          }}
        >
          <header
            style={{
              padding: '8px 12px',
              background: '#F9FAFB',
              borderBottom: '1px solid #E5E7EB',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <strong style={{ fontSize: 14 }}>
              {STATUS_LABEL[status]}{' '}
              <span style={{ color: '#6B7280', fontWeight: 400, fontSize: 12 }}>
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
                <tr style={{ background: '#FFFFFF', textAlign: 'left' }}>
                  <th style={thStyle}>전표번호</th>
                  <th style={thStyle}>전표일자</th>
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
                      style={{ borderTop: '1px solid #F3F4F6' }}
                    >
                      <td style={tdStyle}>{entry.slipNo}</td>
                      <td style={tdStyle}>{entry.slipDate}</td>
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
                          <span style={{ color: '#10B981', fontSize: 12 }}>
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
    </>
  )
}

const inputStyle: React.CSSProperties = {
  height: 32,
  padding: '0 10px',
  border: '1px solid #D1D5DB',
  borderRadius: 6,
  fontSize: 13,
}

const thStyle: React.CSSProperties = {
  padding: '8px 10px',
  borderBottom: '1px solid #E5E7EB',
  fontSize: 12,
  fontWeight: 600,
  color: '#374151',
  background: '#FFFFFF',
}

const tdStyle: React.CSSProperties = {
  padding: '8px 10px',
  fontSize: 13,
  color: '#1F2937',
  whiteSpace: 'nowrap',
}

const linkBtnStyle: React.CSSProperties = {
  background: 'transparent',
  border: '1px solid #D1D5DB',
  borderRadius: 4,
  padding: '4px 8px',
  fontSize: 12,
  cursor: 'pointer',
  color: '#1D4ED8',
}
