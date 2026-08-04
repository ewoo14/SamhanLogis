/**
 * arologis 가배차 분류 admin UI — `/arologis/pre-classify` (Phase 10 PR-E1 FE-2).
 *
 * <p>매뉴얼 / 슬라이스 prompt: 출고전표 자동 조회 → 권역 (REGION 마스터) + 시도 (광역 prefix)
 * 2-탭 통합 화면. legacy GAS 2번 (REGION) + 15번 (시도) 이식, 가배차 작업 전 사전 분류.
 *
 * <p>BE 출처 (commit e5dc20f):
 * - GET /admin/dispatches/pre-classify?from&to → PreClassifyResponse (slip-service S2)
 * - GET /admin/arologis/dispatches/regional?date       → RegionalDispatchResponse (BE-A4)
 *
 * <p>구성:
 * <pre>
 *  [탭] 가배차 (REGION) | 지방가배차 (시도)
 *  ┌──────────────────────────────────────────────────────────────┐
 *  │ from [____] to [____] [조회] [CSV 다운로드]                    │   (탭1)
 *  │   ─ 권역: 서울특별시 (3건) ──────                              │
 *  │      slipNo / partnerCode / partnerName / address / 배차여부   │
 *  │   ─ 권역: 경기동부 (1건) ──────                               │
 *  │      ...                                                      │
 *  │   ─ 미분류 거래처 (2건) ─ "REGION 마스터에 추가하세요" link    │
 *  └──────────────────────────────────────────────────────────────┘
 * </pre>
 *
 * <p>UUID 비공개 (feedback_uuid_no_user_visibility.md):
 * - 사용자 노출 = slipNo / partnerCode / partnerName / address / regionGroup / sido
 * - dispatchPlanned 는 boolean badge 만 표시, dispatch UUID 노출 X
 *
 * <p>풀네임 ROLE (feedback_role_naming_full.md): MASTER / MANAGER / DISPATCH (RoleGuard 외부).
 *
 * <p>data-testid (슬라이스 명세):
 * - arologis-preclassify-tab-region / arologis-preclassify-tab-regional
 * - arologis-preclassify-from / arologis-preclassify-to / arologis-preclassify-date
 * - arologis-preclassify-group-{regionGroup or sido}
 * - arologis-preclassify-row-{slipNo}
 * - arologis-preclassify-csv (탭별 단일 — 활성 탭 결과 다운로드)
 * - arologis-preclassify-search (조회 트리거)
 */
import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Badge, Button, Card, FormField, Select } from '@samhan/design-system'
import {
  getPreClassify,
  getRegional,
  type DispatchExecutionMode,
  type PreClassifyEntry,
  type PreClassifyResponse,
  type RegionalEntry,
  type RegionalResponse,
} from '../api/arologisDispatchApi'
import { usePageTitle } from '../hooks/usePageTitle'
import { useIsMobile } from '../hooks/useIsMobile'

type TabKey = 'region' | 'regional'

const EXECUTION_MODES: Array<{ value: DispatchExecutionMode; label: string }> = [
  { value: 'SANGIL_AND_CHOWOL_REGION_EXCLUDED', label: '상일+초월 (지방 제외)' },
  { value: 'CHOWOL_REGION_EXCLUDED', label: '초월 (지방 제외)' },
  { value: 'SANGIL_REGION_EXCLUDED', label: '상일 (지방 제외)' },
  { value: 'STACK_ONLY', label: '야적 only' },
  { value: 'REGION_ONLY', label: '지방 only' },
  { value: 'SANGIL_AND_CHOWOL_REGION_INCLUDED', label: '상일+초월 (지방 포함)' },
  { value: 'CHOWOL_REGION_INCLUDED', label: '초월 (지방 포함)' },
  { value: 'SANGIL_REGION_INCLUDED', label: '상일 (지방 포함)' },
]

/** ISO YYYY-MM-DD (브라우저 로컬 기준) — 오늘 기본값. */
function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

/** CSV 셀 escape — 콤마/따옴표/개행 포함 시 따옴표 wrap + 내부 따옴표 2배. */
function csvCell(value: string | null | undefined): string {
  const s = value ?? ''
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

/** Blob 다운로드 헬퍼 — UTF-8 BOM (엑셀 한글 호환). */
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

export function ArologisPreClassifyPage() {
  usePageTitle('가배차 분류')
  const isMobile = useIsMobile()

  const [tab, setTab] = useState<TabKey>('region')

  // 탭1 — REGION 권역: from/to 날짜 (default 오늘 단일 일자)
  const today = todayIso()
  const [from, setFrom] = useState<string>(today)
  const [to, setTo] = useState<string>(today)
  const [executionMode, setExecutionMode] = useState<DispatchExecutionMode>(
    'SANGIL_AND_CHOWOL_REGION_EXCLUDED',
  )

  // 탭2 — 시도: date 단일
  const [date, setDate] = useState<string>(today)

  // 탭1 query — 활성 탭일 때만 fetch
  const regionQuery = useQuery<PreClassifyResponse>({
    queryKey: ['arologis', 'pre-classify', from, to, executionMode],
    queryFn: () => getPreClassify(from, to, executionMode),
    enabled: tab === 'region',
    // PR-H4c FE-B: 30초 polling — 멀티 워크스테이션 동기화 안전망
    refetchInterval: 30_000,
  })

  // 탭2 query — 활성 탭일 때만 fetch
  const regionalQuery = useQuery<RegionalResponse>({
    queryKey: ['arologis', 'regional', date],
    queryFn: () => getRegional(date),
    enabled: tab === 'regional',
    // PR-H4c FE-B: 30초 polling
    refetchInterval: 30_000,
  })

  // ----- CSV 다운로드 -----

  const handleCsvRegion = () => {
    const data = regionQuery.data
    if (!data) return
    const rows: string[][] = [
      ['권역', '전표번호', '거래처코드', '거래처명', '주소', '배차여부'],
    ]
    for (const [groupName, entries] of Object.entries(data.regionGroups ?? {})) {
      for (const e of entries) {
        rows.push([
          groupName,
          e.slipNo,
          e.partnerCode,
          e.partnerName,
          e.address,
          e.dispatchPlanned ? '배차됨' : '미배차',
        ])
      }
    }
    for (const e of (data.unclassified ?? [])) {
      rows.push([
        '(미분류)',
        e.slipNo,
        e.partnerCode,
        e.partnerName,
        e.address,
        e.dispatchPlanned ? '배차됨' : '미배차',
      ])
    }
    downloadCsv(`pre-classify_${from}_${to}.csv`, rows)
  }

  const handleCsvRegional = () => {
    const data = regionalQuery.data
    if (!data) return
    const rows: string[][] = [
      ['시도', '전표번호', '거래처코드', '거래처명', '주소'],
    ]
    for (const [sidoName, entries] of Object.entries(data.sidoGroups ?? {})) {
      for (const e of entries) {
        rows.push([sidoName, e.slipNo, e.partnerCode, e.partnerName, e.address])
      }
    }
    for (const e of (data.unmatched ?? [])) {
      rows.push(['(미매칭)', e.slipNo, e.partnerCode, e.partnerName, e.address])
    }
    downloadCsv(`regional_${data.date}.csv`, rows)
  }

  // ----- 합계 (탭별 entry 총수) -----

  const regionTotal = useMemo<number>(() => {
    const data = regionQuery.data
    if (!data) return 0
    let n = data.unclassified?.length ?? 0
    for (const list of Object.values(data.regionGroups ?? {})) n += list?.length ?? 0
    return n
  }, [regionQuery.data])

  const regionalTotal = useMemo<number>(() => {
    const data = regionalQuery.data
    if (!data) return 0
    let n = data.unmatched?.length ?? 0
    for (const list of Object.values(data.sidoGroups ?? {})) n += list?.length ?? 0
    return n
  }, [regionalQuery.data])

  return (
    <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* ───── 탭 헤더 + 실시간 갱신 안내 ───── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div role="tablist" aria-label="가배차 분류 탭" style={{ display: 'flex', gap: 4 }}>
          <button
            role="tab"
            type="button"
            aria-selected={tab === 'region'}
            data-testid="arologis-preclassify-tab-region"
            onClick={() => setTab('region')}
            style={tabButtonStyle(tab === 'region')}
          >
            가배차 (권역)
          </button>
          <button
            role="tab"
            type="button"
            aria-selected={tab === 'regional'}
            data-testid="arologis-preclassify-tab-regional"
            onClick={() => setTab('regional')}
            style={tabButtonStyle(tab === 'regional')}
          >
            지방가배차 (시도)
          </button>
        </div>
        {/* PR-H4c FE-B: 실시간 자동 갱신 안내 (30s polling) */}
        <span
          data-testid="arologis-preclassify-realtime-indicator"
          style={{ fontSize: 12, color: 'var(--color-neutral-500, #6B7280)', marginLeft: 'auto' }}
        >
          실시간 자동 갱신 · 30초
        </span>
      </div>

      {tab === 'region' ? (
        <RegionTabPanel
          from={from}
          to={to}
          onFromChange={setFrom}
          onToChange={setTo}
          executionMode={executionMode}
          onExecutionModeChange={setExecutionMode}
          query={regionQuery}
          total={regionTotal}
          onCsv={handleCsvRegion}
          isMobile={isMobile}
        />
      ) : (
        <RegionalTabPanel
          date={date}
          onDateChange={setDate}
          query={regionalQuery}
          total={regionalTotal}
          onCsv={handleCsvRegional}
          isMobile={isMobile}
        />
      )}
    </div>
  )
}

// ===========================================================================
// 탭1 — 가배차 (REGION 권역)
// ===========================================================================

interface RegionTabPanelProps {
  from: string
  to: string
  onFromChange: (v: string) => void
  onToChange: (v: string) => void
  executionMode: DispatchExecutionMode
  onExecutionModeChange: (v: DispatchExecutionMode) => void
  query: ReturnType<typeof useQuery<PreClassifyResponse>>
  total: number
  onCsv: () => void
  isMobile: boolean
}

function RegionTabPanel(props: RegionTabPanelProps) {
  const { from, to, onFromChange, onToChange, executionMode, onExecutionModeChange, query, total, onCsv, isMobile } = props
  const data = query.data

  return (
    <Card>
      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <FormField
            label="시작일"
            id="arologis-preclassify-from"
            render={({ id }) => (
              <input
                id={id}
                data-testid="arologis-preclassify-from"
                type="date"
                value={from}
                onChange={(e) => onFromChange(e.target.value)}
                style={inputStyle}
              />
            )}
          />
          <Select
            label="실행 모드"
            value={executionMode}
            onChange={(event) => onExecutionModeChange(event.target.value as DispatchExecutionMode)}
            data-testid="arologis-preclassify-mode"
          >
            {EXECUTION_MODES.map((mode) => (
              <option key={mode.value} value={mode.value}>{mode.label}</option>
            ))}
          </Select>
          <FormField
            label="종료일"
            id="arologis-preclassify-to"
            render={({ id }) => (
              <input
                id={id}
                data-testid="arologis-preclassify-to"
                type="date"
                value={to}
                onChange={(e) => onToChange(e.target.value)}
                style={inputStyle}
              />
            )}
          />
          <Button
            variant="primary"
            data-testid="arologis-preclassify-search"
            onClick={() => query.refetch()}
            disabled={query.isFetching}
          >
            {query.isFetching ? '조회중...' : '조회'}
          </Button>
          <Button
            variant="secondary"
            data-testid="arologis-preclassify-csv"
            onClick={onCsv}
            disabled={!data || total === 0}
          >
            CSV 다운로드
          </Button>
          <div style={{ marginLeft: 'auto', fontSize: 12, color: '#6B7280' }}>
            총 {total} 건
          </div>
        </div>

        {query.isError ? (
          <div style={errorStyle}>조회 실패 — 잠시 후 다시 시도해 주세요.</div>
        ) : null}

        {!query.isLoading && data ? (
          <>
            {(data.unknownWarehouseCount ?? 0) > 0 ? (
              <div style={warningStyle}>
                창고 업무 구분 미확정 {data.unknownWarehouseCount}건은 분류에서 제외되었습니다. 창고 정보를 확인한 뒤 다시 조회해 주세요.
              </div>
            ) : null}

            {Object.keys(data.regionGroups ?? {}).length === 0 && (data.unclassified?.length ?? 0) === 0
              && (data.unknownWarehouseCount ?? 0) === 0 ? (
              <div style={emptyStyle}>해당 기간에 출고전표가 없습니다.</div>
            ) : null}

            {Object.entries(data.regionGroups ?? {}).map(([groupName, entries]) => (
              <RegionGroupSection
                key={groupName}
                title={groupName}
                count={entries?.length ?? 0}
                entries={entries ?? []}
                isMobile={isMobile}
              />
            ))}

            {(data.unclassified?.length ?? 0) > 0 ? (
              <UnclassifiedSection entries={data.unclassified} isMobile={isMobile} />
            ) : null}
          </>
        ) : null}

        {query.isLoading ? <div style={emptyStyle}>조회 중...</div> : null}
      </div>
    </Card>
  )
}

interface RegionGroupSectionProps {
  title: string
  count: number
  entries: PreClassifyEntry[]
  isMobile: boolean
}

function RegionGroupSection({ title, count, entries, isMobile }: RegionGroupSectionProps) {
  return (
    <section data-testid={`arologis-preclassify-group-${title}`}>
      <h3 style={groupHeadStyle}>
        {title} <span style={{ color: '#6B7280', fontWeight: 400 }}>({count}건)</span>
      </h3>
      {isMobile ? (
        <PreClassifyCardList entries={entries} />
      ) : (
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={thStyle}>전표번호</th>
              <th style={thStyle}>거래처코드</th>
              <th style={thStyle}>거래처명</th>
              <th style={thStyle}>주소</th>
              <th style={thStyle}>배차여부</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e.slipNo} data-testid={`arologis-preclassify-row-${e.slipNo}`}>
                <td style={tdStyle}>{e.slipNo}</td>
                <td style={tdStyle}>{e.partnerCode}</td>
                <td style={tdStyle}>{e.partnerName}</td>
                <td style={tdStyle}>{e.address}</td>
                <td style={tdStyle}>
                  <DispatchPlannedBadge planned={e.dispatchPlanned} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  )
}

interface UnclassifiedSectionProps {
  entries: PreClassifyEntry[]
  isMobile: boolean
}

function UnclassifiedSection({ entries, isMobile }: UnclassifiedSectionProps) {
  return (
    <section
      data-testid="arologis-preclassify-group-unclassified"
      style={{
        border: '1px solid #FCD34D',
        borderRadius: 6,
        padding: 12,
        background: '#FFFBEB',
      }}
    >
      <h3 style={{ ...groupHeadStyle, color: '#92400E' }}>
        미분류 거래처 <span style={{ color: '#92400E', fontWeight: 400 }}>({entries.length}건)</span>
      </h3>
      <p style={{ margin: '0 0 8px 0', fontSize: 13, color: '#92400E' }}>
        주소가 권역 키워드와 매칭되지 않은 거래처입니다.{' '}
        <Link to="/admin/regions" style={{ color: '#92400E', textDecoration: 'underline' }}>
          REGION 마스터에 추가하세요
        </Link>
        .
      </p>
      {isMobile ? (
        <PreClassifyCardList entries={entries} />
      ) : (
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={thStyle}>전표번호</th>
              <th style={thStyle}>거래처코드</th>
              <th style={thStyle}>거래처명</th>
              <th style={thStyle}>주소</th>
              <th style={thStyle}>배차여부</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e.slipNo} data-testid={`arologis-preclassify-row-${e.slipNo}`}>
                <td style={tdStyle}>{e.slipNo}</td>
                <td style={tdStyle}>{e.partnerCode}</td>
                <td style={tdStyle}>{e.partnerName}</td>
                <td style={tdStyle}>{e.address}</td>
                <td style={tdStyle}>
                  <DispatchPlannedBadge planned={e.dispatchPlanned} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  )
}

// ===========================================================================
// 탭2 — 지방가배차 (시도)
// ===========================================================================

interface RegionalTabPanelProps {
  date: string
  onDateChange: (v: string) => void
  query: ReturnType<typeof useQuery<RegionalResponse>>
  total: number
  onCsv: () => void
  isMobile: boolean
}

function RegionalTabPanel(props: RegionalTabPanelProps) {
  const { date, onDateChange, query, total, onCsv, isMobile } = props
  const data = query.data

  return (
    <Card>
      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <FormField
            label="조회일"
            id="arologis-preclassify-date"
            render={({ id }) => (
              <input
                id={id}
                data-testid="arologis-preclassify-date"
                type="date"
                value={date}
                onChange={(e) => onDateChange(e.target.value)}
                style={inputStyle}
              />
            )}
          />
          <Button
            variant="primary"
            data-testid="arologis-preclassify-search"
            onClick={() => query.refetch()}
            disabled={query.isFetching}
          >
            {query.isFetching ? '조회중...' : '조회'}
          </Button>
          <Button
            variant="secondary"
            data-testid="arologis-preclassify-csv"
            onClick={onCsv}
            disabled={!data || total === 0}
          >
            CSV 다운로드
          </Button>
          <div style={{ marginLeft: 'auto', fontSize: 12, color: '#6B7280' }}>
            총 {total} 건
          </div>
        </div>

        {query.isError ? (
          <div style={errorStyle}>조회 실패 — 잠시 후 다시 시도해 주세요.</div>
        ) : null}

        {!query.isLoading && data ? (
          <>
            {Object.keys(data.sidoGroups ?? {}).length === 0 && (data.unmatched?.length ?? 0) === 0 ? (
              <div style={emptyStyle}>해당 일자에 출고전표가 없습니다.</div>
            ) : null}

            {Object.entries(data.sidoGroups ?? {}).map(([sido, entries]) => (
              <RegionalGroupSection
                key={sido}
                title={sido}
                count={entries?.length ?? 0}
                entries={entries ?? []}
                isMobile={isMobile}
              />
            ))}

            {(data.unmatched?.length ?? 0) > 0 ? (
              <RegionalUnmatchedSection entries={data.unmatched} isMobile={isMobile} />
            ) : null}
          </>
        ) : null}

        {query.isLoading ? <div style={emptyStyle}>조회 중...</div> : null}
      </div>
    </Card>
  )
}

interface RegionalGroupSectionProps {
  title: string
  count: number
  entries: RegionalEntry[]
  isMobile: boolean
}

function RegionalGroupSection({ title, count, entries, isMobile }: RegionalGroupSectionProps) {
  return (
    <section data-testid={`arologis-preclassify-group-${title}`}>
      <h3 style={groupHeadStyle}>
        {title} <span style={{ color: '#6B7280', fontWeight: 400 }}>({count}건)</span>
      </h3>
      {isMobile ? (
        <RegionalCardList entries={entries} />
      ) : (
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={thStyle}>전표번호</th>
              <th style={thStyle}>거래처코드</th>
              <th style={thStyle}>거래처명</th>
              <th style={thStyle}>주소</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e.slipNo} data-testid={`arologis-preclassify-row-${e.slipNo}`}>
                <td style={tdStyle}>{e.slipNo}</td>
                <td style={tdStyle}>{e.partnerCode}</td>
                <td style={tdStyle}>{e.partnerName}</td>
                <td style={tdStyle}>{e.address}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  )
}

interface RegionalUnmatchedSectionProps {
  entries: RegionalEntry[]
  isMobile: boolean
}

function RegionalUnmatchedSection({ entries, isMobile }: RegionalUnmatchedSectionProps) {
  return (
    <section
      data-testid="arologis-preclassify-group-unmatched"
      style={{
        border: '1px solid #FCA5A5',
        borderRadius: 6,
        padding: 12,
        background: '#FEF2F2',
      }}
    >
      <h3 style={{ ...groupHeadStyle, color: '#991B1B' }}>
        미매칭 (광역 prefix){' '}
        <span style={{ color: '#991B1B', fontWeight: 400 }}>({entries.length}건)</span>
      </h3>
      <p style={{ margin: '0 0 8px 0', fontSize: 13, color: '#991B1B' }}>
        17 시도 광역 prefix 와 매칭되지 않은 출고전표입니다. 거래처 주소를 확인해 주세요.
      </p>
      {isMobile ? (
        <RegionalCardList entries={entries} />
      ) : (
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={thStyle}>전표번호</th>
              <th style={thStyle}>거래처코드</th>
              <th style={thStyle}>거래처명</th>
              <th style={thStyle}>주소</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e.slipNo} data-testid={`arologis-preclassify-row-${e.slipNo}`}>
                <td style={tdStyle}>{e.slipNo}</td>
                <td style={tdStyle}>{e.partnerCode}</td>
                <td style={tdStyle}>{e.partnerName}</td>
                <td style={tdStyle}>{e.address}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  )
}

function DispatchPlannedBadge({ planned }: { planned: boolean }) {
  return planned ? (
    <Badge variant="success">배차됨</Badge>
  ) : (
    <Badge variant="neutral">미배차</Badge>
  )
}

function PreClassifyCardList({ entries }: { entries: PreClassifyEntry[] }) {
  return (
    <div className="mobile-line-card-list">
      {entries.map((entry) => (
        <article
          key={entry.slipNo}
          className="mobile-line-card"
          data-testid={`arologis-preclassify-row-${entry.slipNo}`}
        >
          <div className="mobile-line-card-header">
            <strong className="mobile-line-field-value">{entry.slipNo}</strong>
            <DispatchPlannedBadge planned={entry.dispatchPlanned} />
          </div>
          <MobileField label="거래처코드" value={entry.partnerCode} />
          <MobileField label="거래처명" value={entry.partnerName} />
          <MobileField label="주소" value={entry.address} />
        </article>
      ))}
    </div>
  )
}

function RegionalCardList({ entries }: { entries: RegionalEntry[] }) {
  return (
    <div className="mobile-line-card-list">
      {entries.map((entry) => (
        <article
          key={entry.slipNo}
          className="mobile-line-card"
          data-testid={`arologis-preclassify-row-${entry.slipNo}`}
        >
          <div className="mobile-line-card-header">
            <strong className="mobile-line-field-value">{entry.slipNo}</strong>
          </div>
          <MobileField label="거래처코드" value={entry.partnerCode} />
          <MobileField label="거래처명" value={entry.partnerName} />
          <MobileField label="주소" value={entry.address} />
        </article>
      ))}
    </div>
  )
}

function MobileField({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="mobile-line-field">
      <span className="mobile-line-field-label">{label}</span>
      <div className="mobile-line-field-value">{value}</div>
    </div>
  )
}

// ===========================================================================
// 인라인 스타일 (페이지 전용 — design-system token 참조)
// ===========================================================================

const inputStyle: React.CSSProperties = {
  border: '1px solid #D1D5DB',
  borderRadius: 4,
  padding: '6px 10px',
  fontSize: 13,
  minWidth: 140,
}

const tableStyle: React.CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: 13,
}

const thStyle: React.CSSProperties = {
  textAlign: 'left',
  padding: '6px 10px',
  borderBottom: '2px solid #E5E7EB',
  background: '#F9FAFB',
  fontWeight: 600,
}

const tdStyle: React.CSSProperties = {
  padding: '6px 10px',
  borderBottom: '1px solid #F3F4F6',
}

const groupHeadStyle: React.CSSProperties = {
  margin: '0 0 8px 0',
  fontSize: 14,
  fontWeight: 600,
  color: '#1F2937',
}

const emptyStyle: React.CSSProperties = {
  padding: 24,
  textAlign: 'center',
  color: '#6B7280',
  fontSize: 13,
}

const errorStyle: React.CSSProperties = {
  padding: 12,
  border: '1px solid #FCA5A5',
  borderRadius: 4,
  background: '#FEF2F2',
  color: '#991B1B',
  fontSize: 13,
}

const warningStyle: React.CSSProperties = {
  padding: 12,
  border: '1px solid #FCD34D',
  borderRadius: 4,
  background: '#FFFBEB',
  color: '#92400E',
  fontSize: 13,
}

function tabButtonStyle(active: boolean): React.CSSProperties {
  return {
    padding: '8px 16px',
    fontSize: 13,
    fontWeight: active ? 600 : 400,
    border: '1px solid #E5E7EB',
    borderBottom: active ? '2px solid #1F2937' : '1px solid #E5E7EB',
    borderRadius: '4px 4px 0 0',
    background: active ? '#fff' : '#F9FAFB',
    color: active ? '#1F2937' : '#6B7280',
    cursor: 'pointer',
  }
}
