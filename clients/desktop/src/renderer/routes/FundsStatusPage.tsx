/**
 * 자금현황 화면 (`/accounting/funds/status`).
 *
 * 자금일보/자금현황표를 기간 필터 하나로 병합하고, 증가 금액 클릭 시
 * 자금의증가/자금증감내역 drill-down modal 을 표시한다.
 */
import { useMemo, useState } from 'react'
import type React from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Button,
  Card,
  DataTable,
  Modal,
  Spinner,
  type DataTableColumn,
} from '@samhan/design-system'
import {
  getFundsIncreaseDetail,
  getFundsStatus,
  type FundsIncreaseDetailLine,
  type FundsIncreaseDetailResponse,
  type FundsStatusAccountSection,
  type FundsStatusLine,
} from '../api/accounting'
import { PartnerLookupErrorBanner } from '../components/common/PartnerLookupErrorBanner'
import { usePageTitle } from '../hooks/usePageTitle'
import {
  buildFundsStatusRows,
  fmtFundsKrw,
  fundsIncreaseDetailTitle,
  isNegativeAmount,
  summaryToLine,
  type FundsStatusTableRow,
} from './fundsStatusPageModel'

interface DetailTarget {
  accountCode: string
  accountName: string
}

function isoToday(): string {
  return new Date().toISOString().slice(0, 10)
}

function isoMonthStart(): string {
  const d = new Date()
  d.setDate(1)
  return d.toISOString().slice(0, 10)
}

function amountStyle(raw: string | number): React.CSSProperties {
  return {
    fontVariantNumeric: 'tabular-nums',
    color: isNegativeAmount(raw) ? 'var(--state-danger)' : undefined,
    fontWeight: isNegativeAmount(raw) ? 700 : undefined,
  }
}

function AmountText({ value }: { value: string }) {
  return <span style={amountStyle(value)}>{fmtFundsKrw(value)}</span>
}

function FundsTotalBand({ line }: { line: FundsStatusLine }) {
  return (
    <Card data-testid="accounting-funds-status-total" style={{ marginTop: 16 }}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(160px, 1fr) repeat(4, minmax(120px, 160px))',
          gap: 12,
          alignItems: 'center',
          fontSize: 14,
          fontWeight: 700,
        }}
      >
        <div>{line.partnerName}</div>
        <div style={{ textAlign: 'right' }}>
          <AmountText value={line.openingBalance} />
        </div>
        <div style={{ textAlign: 'right' }}>
          <AmountText value={line.increase} />
        </div>
        <div style={{ textAlign: 'right' }}>
          <AmountText value={line.decrease} />
        </div>
        <div style={{ textAlign: 'right' }}>
          <AmountText value={line.closingBalance} />
        </div>
      </div>
    </Card>
  )
}

export function FundsStatusPage() {
  const [from, setFrom] = useState<string>(isoMonthStart())
  const [to, setTo] = useState<string>(isoToday())
  const [queryRange, setQueryRange] = useState(() => ({ from: isoMonthStart(), to: isoToday() }))
  const [detailTarget, setDetailTarget] = useState<DetailTarget | null>(null)

  usePageTitle('자금현황', `${queryRange.from} ~ ${queryRange.to}`)

  const statusQuery = useQuery({
    queryKey: ['accounting', 'reports', 'funds-status', queryRange.from, queryRange.to],
    queryFn: () => getFundsStatus(queryRange.from, queryRange.to),
  })

  const detailQuery = useQuery<FundsIncreaseDetailResponse>({
    queryKey: [
      'accounting',
      'reports',
      'funds-status',
      'increase-detail',
      queryRange.from,
      queryRange.to,
      detailTarget?.accountCode ?? '',
    ],
    queryFn: () => getFundsIncreaseDetail({
      from: queryRange.from,
      to: queryRange.to,
      accountCode: detailTarget?.accountCode ?? '',
    }),
    enabled: detailTarget != null,
  })

  const columns = useMemo<DataTableColumn<FundsStatusTableRow>[]>(() => [
    {
      key: 'bizNo',
      header: '거래처코드',
      width: '130px',
      render: (row) => row.rowKind === 'subtotal' ? '—' : (row.bizNo?.replace(/\D/g, '') || '—'),
    },
    {
      key: 'partnerName',
      header: '거래처',
      width: '220px',
      render: (row) => (
        <span style={{ fontWeight: row.rowKind === 'subtotal' ? 700 : 500 }}>
          {row.partnerName}
        </span>
      ),
    },
    {
      key: 'openingBalance',
      header: '이월잔액',
      width: '140px',
      align: 'right',
      render: (row) => <AmountText value={row.openingBalance} />,
    },
    {
      key: 'increase',
      header: '증가',
      width: '140px',
      align: 'right',
      render: (row) => {
        // 결정 A: 계정 소계 행에서만 drill-down 클릭 허용.
        // 거래처 행(rowKind === 'line')은 표시전용 — 클릭 시 모달 합계 ≠ 셀 금액 불일치 방지.
        const isClickable =
          row.rowKind === 'subtotal' && Number.parseInt(row.increase, 10) !== 0
        if (isClickable) {
          return (
            <button
              type="button"
              data-testid={`funds-increase-subtotal-${row.accountCode}`}
              onClick={() => setDetailTarget({
                accountCode: row.accountCode,
                accountName: row.accountName,
              })}
              style={{
                border: 'none',
                background: 'transparent',
                padding: 0,
                margin: 0,
                cursor: 'pointer',
                color: 'var(--color-primary-700)',
                fontWeight: 700,
                fontVariantNumeric: 'tabular-nums',
                textDecoration: 'underline',
              }}
            >
              {fmtFundsKrw(row.increase)}
            </button>
          )
        }
        return <AmountText value={row.increase} />
      },
    },
    {
      key: 'decrease',
      header: '감소',
      width: '140px',
      align: 'right',
      render: (row) => <AmountText value={row.decrease} />,
    },
    {
      key: 'closingBalance',
      header: '금일잔액',
      width: '140px',
      align: 'right',
      render: (row) => <AmountText value={row.closingBalance} />,
    },
  ], [])

  const detailColumns = useMemo<DataTableColumn<FundsIncreaseDetailLine>[]>(() => [
    { key: 'txDate', header: '일자', width: '110px' },
    { key: 'counterAccountName', header: '상대계정명', width: '180px' },
    { key: 'counterPartnerName', header: '상대거래처명', width: '180px' },
    { key: 'description', header: '적요', width: '260px' },
    {
      key: 'amount',
      header: '금액',
      width: '140px',
      align: 'right',
      render: (row) => <AmountText value={row.amount} />,
    },
  ], [])

  const handleSearch = () => {
    setQueryRange({ from, to })
  }

  const closeDetail = () => {
    setDetailTarget(null)
  }

  const groups = statusQuery.data?.groups ?? []
  const totalLine = statusQuery.data ? summaryToLine('합계', statusQuery.data.total) : null
  const detail = detailQuery.data ?? null

  return (
    <>
      <div
        className="no-print"
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          gap: 12,
          marginBottom: 16,
          flexWrap: 'wrap',
        }}
      >
        <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>자금현황</h3>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
          시작일
          <input
            type="date"
            value={from}
            onChange={(event) => setFrom(event.target.value)}
            style={{
              height: 32,
              padding: '0 8px',
              borderRadius: 6,
              border: '1px solid var(--color-border)',
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
              height: 32,
              padding: '0 8px',
              borderRadius: 6,
              border: '1px solid var(--color-border)',
            }}
          />
        </label>
        <Button
          variant="primary"
          size="sm"
          onClick={handleSearch}
          disabled={statusQuery.isFetching || !from || !to}
        >
          조회
        </Button>
      </div>

      {statusQuery.isLoading ? (
        <div style={{ display: 'grid', placeItems: 'center', minHeight: 220 }}>
          <Spinner size="lg" label="자금현황 불러오는 중" />
        </div>
      ) : statusQuery.isError ? (
        <PartnerLookupErrorBanner
          error={statusQuery.error}
          onRetry={() => statusQuery.refetch()}
          subject="자금현황"
        />
      ) : (
        <>
          {groups.map((group) => (
            <Card
              key={group.groupCode}
              data-testid={`accounting-funds-group-${group.groupCode}`}
              style={{ marginBottom: 16 }}
            >
              <div
                style={{
                  marginBottom: 12,
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: 12,
                  alignItems: 'center',
                }}
              >
                <div style={{ fontSize: 15, fontWeight: 700 }}>
                  {group.groupName}
                </div>
                <div style={{ fontSize: 12, color: 'var(--color-neutral-500)' }}>
                  소계 금일잔액 <strong>{fmtFundsKrw(group.subtotal.closingBalance)}</strong>
                </div>
              </div>

              {group.accounts.map((section: FundsStatusAccountSection) => (
                <div key={section.accountCode} style={{ marginBottom: 14 }}>
                  <div
                    style={{
                      marginBottom: 8,
                      fontSize: 13,
                      fontWeight: 700,
                      color: 'var(--color-neutral-800)',
                    }}
                  >
                    {section.accountCode} {section.accountName}
                  </div>
                  <DataTable
                    columns={columns}
                    rows={buildFundsStatusRows(section)}
                    rowKey={(row) => row.rowKey}
                    rowClassName={(row) =>
                      row.rowKind === 'subtotal' ? 'report-total-row' : undefined
                    }
                    emptyMessage="자금현황 라인이 없습니다."
                  />
                </div>
              ))}
            </Card>
          ))}

          {groups.length === 0 ? (
            <Card>
              <div style={{ padding: 24, color: 'var(--color-neutral-500)', textAlign: 'center' }}>
                조회 기간에 자금 계정 분개가 없습니다.
              </div>
            </Card>
          ) : null}

          {totalLine ? <FundsTotalBand line={totalLine} /> : null}
        </>
      )}

      <Modal
        open={detailTarget != null}
        onClose={closeDetail}
        title={detail
          ? fundsIncreaseDetailTitle(detail)
          : detailTarget
            ? `${detailTarget.accountCode} ${detailTarget.accountName} — 증가 상세`
            : '자금 증가 상세'}
        size="lg"
        footer={(
          <Button variant="secondary" size="sm" onClick={closeDetail}>
            닫기
          </Button>
        )}
      >
        <div data-testid="funds-increase-detail-modal">
          {detailQuery.isLoading ? (
            <div style={{ display: 'grid', placeItems: 'center', minHeight: 160 }}>
              <Spinner size="md" label="증가 상세 불러오는 중" />
            </div>
          ) : detailQuery.isError ? (
            <PartnerLookupErrorBanner
              error={detailQuery.error}
              onRetry={() => detailQuery.refetch()}
              subject="자금 증가 상세"
            />
          ) : detail ? (
            <>
              <div
                style={{
                  marginBottom: 12,
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: 12,
                  fontSize: 13,
                }}
              >
                <span>{detail.fromDate} ~ {detail.toDate}</span>
                <strong>합계 {fmtFundsKrw(detail.totalAmount)} 원</strong>
              </div>
              <DataTable
                columns={detailColumns}
                rows={detail.lines}
                rowKey={(row) => `${row.txDate}:${row.counterAccountName}:${row.description ?? ''}:${row.amount}`}
                emptyMessage="증가 상세 라인이 없습니다."
              />
            </>
          ) : null}
        </div>
      </Modal>
    </>
  )
}
