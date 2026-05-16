import { useCallback, useMemo, useState, type CSSProperties } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button } from '@samhan/design-system'
import {
  getDpsHistoryDetail,
  listDpsHistory,
  type DpsProgramType,
  type DpsSaveHistoryDetailResponse,
  type DpsSaveMode,
} from '../api/dpsSaveHistoryApi'
import { maskCreatedBy } from '../utils/maskCreatedBy'

interface DpsHistoryTabProps {
  programType: DpsProgramType
  onRestore: (detail: DpsSaveHistoryDetailResponse) => void
}

/** DPS 저장내역 목록 공통 탭. */
export function DpsHistoryTab({ programType, onRestore }: DpsHistoryTabProps) {
  const today = useMemo(todayIso, [])
  const [from, setFrom] = useState(today.slice(0, 8) + '01')
  const [to, setTo] = useState(today)
  const [mode, setMode] = useState<DpsSaveMode | 'ALL'>('MANUAL_NAMED')
  const [query, setQuery] = useState({ from, to, mode })
  const [error, setError] = useState<string | null>(null)

  const historyQuery = useQuery({
    queryKey: ['dps-history-list', programType, query],
    queryFn: () => listDpsHistory({ programType, ...query }),
  })

  const handleRestore = useCallback(async (id: string) => {
    try {
      setError(null)
      const detail = await getDpsHistoryDetail(id)
      onRestore(detail)
    } catch (err) {
      setError(err instanceof Error ? err.message : '저장내역 복원에 실패했습니다.')
    }
  }, [onRestore])

  const rows = historyQuery.data?.content ?? []

  return (
    <section style={rootStyle}>
      <div style={filterRowStyle}>
        <label style={fieldStyle}>
          <span>기간 시작</span>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            style={inputStyle}
          />
        </label>
        <label style={fieldStyle}>
          <span>기간 종료</span>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            style={inputStyle}
          />
        </label>
        <label style={fieldStyle}>
          <span>모드</span>
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value as DpsSaveMode | 'ALL')}
            style={inputStyle}
          >
            <option value="MANUAL_NAMED">명시 저장만</option>
            <option value="AUTO_LATEST">자동 저장만</option>
            <option value="ALL">전체</option>
          </select>
        </label>
        <Button
          variant="primary"
          onClick={() => setQuery({ from, to, mode })}
          loading={historyQuery.isFetching}
        >
          조회
        </Button>
      </div>

      {error ? <div role="alert" style={errorStyle}>{error}</div> : null}

      <div style={tableWrapStyle}>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={thStyle}>작성시각</th>
              <th style={thStyle}>작성자</th>
              <th style={thStyle}>저장주제</th>
              <th style={thStyle}>구분</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>mismatch 수</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} style={emptyStyle}>
                  저장내역이 없습니다.
                </td>
              </tr>
            ) : rows.map((row, index) => (
              <tr
                key={row.id}
                data-testid={`dps-history-row-${index}`}
                onClick={() => void handleRestore(row.id)}
                style={clickableRowStyle}
              >
                <td
                  data-testid={`dps-history-row-${index}-created-at`}
                  style={tdStyle}
                >
                  {formatDateTime(row.createdAt)}
                </td>
                <td style={tdStyle}>{maskCreatedBy(row.createdBy)}</td>
                <td style={tdStyle}>{row.topic}</td>
                <td style={tdStyle}>{row.saveMode === 'AUTO_LATEST' ? '자동' : '명시'}</td>
                <td style={{ ...tdStyle, textAlign: 'right' }}>
                  {row.mismatchCount.toLocaleString('ko-KR')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function todayIso(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
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

const rootStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 12 }
const filterRowStyle: CSSProperties = { display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }
const fieldStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: '#374151' }
const inputStyle: CSSProperties = { height: 32, padding: '0 10px', border: '1px solid #D1D5DB', borderRadius: 6, fontSize: 13 }
const errorStyle: CSSProperties = { padding: 8, border: '1px solid #FECACA', borderRadius: 4, background: '#FEF2F2', color: '#B91C1C', fontSize: 12 }
const tableWrapStyle: CSSProperties = { border: '1px solid #E5E7EB', borderRadius: 6, overflow: 'auto', background: '#FFFFFF' }
const tableStyle: CSSProperties = { width: '100%', borderCollapse: 'collapse', fontSize: 13 }
const thStyle: CSSProperties = { textAlign: 'left', padding: '8px 10px', borderBottom: '1px solid #E5E7EB', background: '#F9FAFB', fontWeight: 600, whiteSpace: 'nowrap' }
const tdStyle: CSSProperties = { padding: '8px 10px', borderBottom: '1px solid #F3F4F6' }
const emptyStyle: CSSProperties = { ...tdStyle, textAlign: 'center', color: '#6B7280', padding: 24 }
const clickableRowStyle: CSSProperties = { cursor: 'pointer' }
