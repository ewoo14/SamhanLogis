/**
 * 전표현황 화면 (`/accounting/reports/journal-status`).
 *
 * eCount 전표현황을 상태 필터 기준으로 조회한다. 기본값은 POSTED 이며,
 * 리포트 잔액 계열은 POSTED+REVERSED(보상쌍 상쇄) 집계로 분리된다.
 * sourceType 다중 필터, 거래처 자동완성 필터, 일자/출처/거래처 grouping 을 지원한다.
 */
import { useMemo, useState } from 'react'
import type React from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Button,
  Card,
  DataTable,
  Spinner,
  type DataTableColumn,
  PartnerAutocomplete,
  type PartnerOption,
} from '@samhan/design-system'
import {
  getJournalStatusReport,
  type JournalStatusGroupBy,
  type JournalStatusSourceType,
} from '../api/accounting'
import { searchPartners } from '../api/partnerApi'
import { PartnerLookupErrorBanner } from '../components/common/PartnerLookupErrorBanner'
import { usePageTitle } from '../hooks/usePageTitle'
import {
  JOURNAL_STATUS_GROUP_OPTIONS,
  JOURNAL_STATUS_SOURCE_OPTIONS,
  buildJournalStatusRows,
  displayJournalStatusBizNo,
  fmtJournalStatusKrw,
  isNegativeJournalStatusAmount,
  summaryLabel,
  type JournalStatusTableRow,
} from './journalStatusPageModel'

function isoToday(): string {
  return new Date().toISOString().slice(0, 10)
}

function isoMonthStart(): string {
  const d = new Date()
  d.setDate(1)
  return d.toISOString().slice(0, 10)
}

function amountStyle(raw: string | number, strong = false): React.CSSProperties {
  const negative = isNegativeJournalStatusAmount(raw)
  return {
    color: negative ? 'var(--state-danger)' : undefined,
    fontWeight: strong || negative ? 700 : undefined,
    fontVariantNumeric: 'tabular-nums',
  }
}

function AmountCell({ value, strong = false }: { value: string; strong?: boolean }) {
  return (
    <span style={amountStyle(value, strong)}>
      {fmtJournalStatusKrw(value)}
    </span>
  )
}

function SourceTypeChip({
  value,
  label,
  selected,
  onToggle,
}: {
  value: JournalStatusSourceType
  label: string
  selected: boolean
  onToggle: (value: JournalStatusSourceType) => void
}) {
  return (
    <button
      type="button"
      onClick={() => onToggle(value)}
      aria-pressed={selected}
      style={{
        height: 30,
        padding: '0 10px',
        borderRadius: 6,
        border: selected ? '1px solid var(--color-primary-600)' : '1px solid var(--color-border)',
        background: selected ? 'var(--color-primary-50)' : 'var(--color-bg-surface)',
        color: selected ? 'var(--color-primary-700)' : 'var(--color-neutral-700)',
        fontSize: 12,
        fontWeight: selected ? 700 : 500,
        cursor: 'pointer',
      }}
    >
      {label}
    </button>
  )
}

export function JournalStatusReportPage() {
  const [from, setFrom] = useState<string>(isoMonthStart())
  const [to, setTo] = useState<string>(isoToday())
  const [sourceTypes, setSourceTypes] = useState<JournalStatusSourceType[]>([])
  const [selectedPartner, setSelectedPartner] = useState<PartnerOption | null>(null)
  const [groupBy, setGroupBy] = useState<JournalStatusGroupBy>('DATE')
  const [queryFilters, setQueryFilters] = useState(() => ({
    from: isoMonthStart(),
    to: isoToday(),
    sourceTypes: [] as JournalStatusSourceType[],
    partnerCode: undefined as string | undefined,
    groupBy: 'DATE' as JournalStatusGroupBy,
  }))

  usePageTitle('전표현황', `${queryFilters.from} ~ ${queryFilters.to}`)

  const query = useQuery({
    queryKey: [
      'accounting',
      'reports',
      'journal-status',
      queryFilters.from,
      queryFilters.to,
      queryFilters.sourceTypes.join(','),
      queryFilters.partnerCode ?? '',
      queryFilters.groupBy,
    ],
    queryFn: () => getJournalStatusReport(queryFilters),
  })

  const columns = useMemo<DataTableColumn<JournalStatusTableRow>[]>(() => [
    {
      key: 'journalNo',
      header: '전표번호',
      width: '150px',
      render: (row) => (
        <span style={{ fontWeight: row.rowKind === 'subtotal' ? 700 : 500 }}>
          {row.journalNo}
        </span>
      ),
    },
    {
      key: 'sourceTypeDisplayName',
      header: '출처',
      width: '118px',
      render: (row) => row.rowKind === 'subtotal' ? '—' : row.sourceTypeDisplayName,
    },
    {
      key: 'bizNo',
      header: '거래처코드',
      width: '130px',
      render: (row) => displayJournalStatusBizNo(row),
    },
    {
      key: 'partnerName',
      header: '거래처',
      width: '180px',
      render: (row) => row.rowKind === 'subtotal' ? '—' : row.partnerName,
    },
    {
      key: 'description',
      header: '적요',
      render: (row) => row.description || '—',
    },
    {
      key: 'totalDebit',
      header: '차변합',
      width: '130px',
      align: 'right',
      render: (row) => <AmountCell value={row.totalDebit} strong={row.rowKind === 'subtotal'} />,
    },
    {
      key: 'totalCredit',
      header: '대변합',
      width: '130px',
      align: 'right',
      render: (row) => <AmountCell value={row.totalCredit} strong={row.rowKind === 'subtotal'} />,
    },
  ], [])

  const toggleSourceType = (value: JournalStatusSourceType) => {
    setSourceTypes((prev) =>
      prev.includes(value)
        ? prev.filter((item) => item !== value)
        : [...prev, value],
    )
  }

  const handleSearch = () => {
    setQueryFilters({
      from,
      to,
      sourceTypes,
      partnerCode: selectedPartner?.partnerCode || undefined,
      groupBy,
    })
  }

  const groups = query.data?.groups ?? []

  return (
    <>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: 16,
          flexWrap: 'wrap',
          marginBottom: 16,
        }}
      >
        <div>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>전표현황</h3>
          <div style={{ marginTop: 4, fontSize: 13, color: 'var(--color-neutral-500)' }}>
            {queryFilters.from} ~ {queryFilters.to}
          </div>
        </div>
        {query.data ? (
          <div style={{ textAlign: 'right', fontSize: 13, color: 'var(--color-neutral-600)' }}>
            <strong style={{ color: 'var(--color-neutral-900)' }}>{summaryLabel(query.data.total)}</strong>
          </div>
        ) : null}
      </div>

      <Card style={{ marginBottom: 16 }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: 12,
            alignItems: 'end',
          }}
        >
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
            시작일
            <input
              type="date"
              value={from}
              onChange={(event) => setFrom(event.target.value)}
              style={{
                height: 34,
                padding: '0 8px',
                borderRadius: 6,
                border: '1px solid var(--color-border)',
                fontSize: 13,
              }}
            />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
            종료일
            <input
              type="date"
              value={to}
              onChange={(event) => setTo(event.target.value)}
              style={{
                height: 34,
                padding: '0 8px',
                borderRadius: 6,
                border: '1px solid var(--color-border)',
                fontSize: 13,
              }}
            />
          </label>
          <div style={{ minWidth: 220 }}>
            <PartnerAutocomplete
              value={selectedPartner}
              onChange={setSelectedPartner}
              searchPartners={searchPartners}
              label="거래처"
              placeholder="거래처명 또는 코드 입력"
              inputTestId="journal-status-partner-filter"
              minChars={1}
            />
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {JOURNAL_STATUS_GROUP_OPTIONS.map((option) => (
              <Button
                key={option.value}
                variant={groupBy === option.value ? 'primary' : 'ghost'}
                size="sm"
                onClick={() => setGroupBy(option.value)}
              >
                {option.label}
              </Button>
            ))}
          </div>
          <Button
            variant="primary"
            size="sm"
            onClick={handleSearch}
            disabled={query.isFetching || !from || !to}
          >
            조회
          </Button>
        </div>
        <div
          style={{
            display: 'flex',
            gap: 8,
            flexWrap: 'wrap',
            marginTop: 14,
            alignItems: 'center',
          }}
        >
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-neutral-600)' }}>
            출처
          </span>
          {JOURNAL_STATUS_SOURCE_OPTIONS.map((option) => (
            <SourceTypeChip
              key={option.value}
              value={option.value}
              label={option.label}
              selected={sourceTypes.includes(option.value)}
              onToggle={toggleSourceType}
            />
          ))}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSourceTypes([])}
            disabled={sourceTypes.length === 0}
          >
            전체
          </Button>
        </div>
      </Card>

      {query.isLoading ? (
        <div style={{ display: 'grid', placeItems: 'center', minHeight: 220 }}>
          <Spinner size="lg" label="전표현황 불러오는 중" />
        </div>
      ) : query.isError ? (
        <PartnerLookupErrorBanner
          error={query.error}
          onRetry={() => query.refetch()}
          subject="전표현황"
        />
      ) : (
        <>
          {groups.map((group) => (
            <Card
              key={group.groupKey}
              data-testid={`journal-status-group-${group.groupKey}`}
              style={{ marginBottom: 16 }}
            >
              <div
                style={{
                  marginBottom: 10,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: 12,
                }}
              >
                <div style={{ fontSize: 15, fontWeight: 700 }}>{group.groupLabel}</div>
                <div style={{ fontSize: 12, color: 'var(--color-neutral-500)' }}>
                  {summaryLabel(group.subtotal)}
                </div>
              </div>
              <DataTable
                columns={columns}
                rows={buildJournalStatusRows(group)}
                rowKey={(row) => row.rowKey}
                rowClassName={(row) => row.rowKind === 'subtotal' ? 'report-total-row' : undefined}
                tableLayout="fixed"
                emptyMessage="전표현황 라인이 없습니다."
              />
            </Card>
          ))}

          {groups.length === 0 ? (
            <Card>
              <div style={{ padding: 24, textAlign: 'center', color: 'var(--color-neutral-500)' }}>
                조회 조건에 맞는 전표가 없습니다.
              </div>
            </Card>
          ) : null}
        </>
      )}
    </>
  )
}
