/**
 * 계정명세서 화면 (`/accounting/reports/account-statement`).
 *
 * 특정 기준일의 계정×거래처 잔액 스냅샷을 표시한다.
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
} from '@samhan/design-system'
import {
  getAccountStatement,
  type AccountStatementAccountSection,
} from '../api/accounting'
import { PartnerLookupErrorBanner } from '../components/common/PartnerLookupErrorBanner'
import { usePageTitle } from '../hooks/usePageTitle'
import {
  accountStatementTotalItems,
  bizNoDigits,
  buildAccountStatementRows,
  fmtAmount,
  isNegativeAmount,
  partnerLabel,
  type AccountStatementAmountValue,
  type AccountStatementTableRow,
  type AccountStatementTotalItem,
} from './accountStatementPageModel'

function isoToday(): string {
  return new Date().toISOString().slice(0, 10)
}

function amountStyle(raw: AccountStatementAmountValue): React.CSSProperties {
  return {
    fontVariantNumeric: 'tabular-nums',
    color: isNegativeAmount(raw) ? 'var(--state-danger)' : undefined,
    fontWeight: isNegativeAmount(raw) ? 700 : undefined,
  }
}

function AmountText({ value }: { value: AccountStatementAmountValue }) {
  return <span style={amountStyle(value)}>{fmtAmount(value)}</span>
}

function TotalBand({
  items,
}: {
  items: AccountStatementTotalItem[]
}) {
  if (items.length === 0) return null

  return (
    <Card data-testid="accounting-account-statement-total" style={{ marginTop: 16 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          gap: 16,
          fontSize: 14,
          fontWeight: 700,
        }}
      >
        {items.map((item, index) => (
          <span key={item.label}>
            {index > 0 ? <span style={{ margin: '0 8px', color: 'var(--color-neutral-400)' }}>/</span> : null}
            <span>{item.label} </span>
            <strong style={amountStyle(item.value)}>{fmtAmount(item.value)} 원</strong>
          </span>
        ))}
      </div>
    </Card>
  )
}

export function AccountStatementPage() {
  const [asOfDate, setAsOfDate] = useState<string>(isoToday())
  const [accountCode, setAccountCode] = useState<string>('')
  const [query, setQuery] = useState(() => ({ asOfDate: isoToday(), accountCode: '' }))

  usePageTitle('계정명세서', query.asOfDate)

  const statementQuery = useQuery({
    queryKey: ['accounting', 'reports', 'account-statement', query.asOfDate, query.accountCode],
    queryFn: () => getAccountStatement(query.asOfDate, query.accountCode || undefined),
  })

  const columns = useMemo<DataTableColumn<AccountStatementTableRow>[]>(() => [
    {
      key: 'bizNo',
      header: '거래처코드',
      width: '130px',
      render: (row) => (
        <span style={{ fontVariantNumeric: 'tabular-nums' }}>
          {bizNoDigits(row)}
        </span>
      ),
    },
    {
      key: 'partnerName',
      header: '거래처명',
      width: '240px',
      render: (row) => (
        <span style={{ fontWeight: 600 }}>
          {partnerLabel(row)}
        </span>
      ),
    },
    {
      key: 'increase',
      header: '증가누계',
      width: '130px',
      align: 'right',
      render: (row) => <AmountText value={row.increase} />,
    },
    {
      key: 'decrease',
      header: '감소누계',
      width: '130px',
      align: 'right',
      render: (row) => <AmountText value={row.decrease} />,
    },
    {
      key: 'debitTotal',
      header: '차변누계',
      width: '130px',
      align: 'right',
      render: (row) => <AmountText value={row.debitTotal} />,
    },
    {
      key: 'creditTotal',
      header: '대변누계',
      width: '130px',
      align: 'right',
      render: (row) => <AmountText value={row.creditTotal} />,
    },
    {
      key: 'balance',
      header: '잔액',
      width: '140px',
      align: 'right',
      render: (row) => <AmountText value={row.balance} />,
    },
  ], [])

  const handleSearch = () => {
    setQuery({ asOfDate, accountCode: accountCode.trim() })
  }

  const groups = statementQuery.data?.groups ?? []
  const totalItems = accountStatementTotalItems(statementQuery.data?.total)

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
        <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>계정명세서</h3>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
          기준일
          <input
            type="date"
            value={asOfDate}
            onChange={(event) => setAsOfDate(event.target.value)}
            style={{
              height: 32,
              padding: '0 8px',
              borderRadius: 6,
              border: '1px solid var(--color-border)',
            }}
          />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
          계정코드
          <input
            type="text"
            inputMode="numeric"
            value={accountCode}
            onChange={(event) => setAccountCode(event.target.value)}
            style={{
              height: 32,
              width: 120,
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
          disabled={statementQuery.isFetching || !asOfDate}
        >
          조회
        </Button>
      </div>

      {statementQuery.isLoading ? (
        <div style={{ display: 'grid', placeItems: 'center', minHeight: 220 }}>
          <Spinner size="lg" label="계정명세서 불러오는 중" />
        </div>
      ) : statementQuery.isError ? (
        <PartnerLookupErrorBanner
          error={statementQuery.error}
          onRetry={() => statementQuery.refetch()}
          subject="계정명세서"
        />
      ) : (
        <>
          {groups.map((group) => (
            <Card
              key={group.groupCode}
              data-testid={`accounting-account-statement-group-${group.groupCode}`}
              style={{ marginBottom: 16 }}
            >
              <div
                style={{
                  marginBottom: 12,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                }}
              >
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700 }}>{group.groupName}</div>
                  <div style={{ marginTop: 2, fontSize: 12, color: 'var(--color-neutral-500)' }}>
                    {group.balanceDirection === 'DEBIT' ? '차변잔액' : '대변잔액'}
                  </div>
                </div>
                <div style={{ fontSize: 12, color: 'var(--color-neutral-500)' }}>
                  소계 잔액 <strong style={amountStyle(group.subtotal.balance)}>
                    {fmtAmount(group.subtotal.balance)}
                  </strong>
                </div>
              </div>

              {group.accounts.map((section: AccountStatementAccountSection) => (
                <div key={section.accountCode} style={{ marginBottom: 14 }}>
                  <div
                    style={{
                      marginBottom: 8,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      flexWrap: 'wrap',
                    }}
                  >
                    <span
                      style={{
                        padding: '1px 6px',
                        borderRadius: 6,
                        background: 'var(--color-bg-muted)',
                        color: 'var(--color-neutral-600)',
                        fontSize: 12,
                        fontWeight: 700,
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      {section.accountCode}
                    </span>
                    <span style={{ fontSize: 13, fontWeight: 700 }}>
                      {section.accountName}
                    </span>
                    <span style={{ fontSize: 12, color: 'var(--color-neutral-500)' }}>
                      {section.categoryDisplayName} · {section.balanceDirectionDisplayName}
                    </span>
                  </div>
                  <DataTable<AccountStatementTableRow>
                    columns={columns}
                    rows={buildAccountStatementRows(section)}
                    rowKey={(row) => row.rowKey}
                    emptyMessage="계정명세서 라인이 없습니다."
                  />
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'flex-end',
                      marginTop: 8,
                      fontSize: 12,
                      color: 'var(--color-neutral-600)',
                    }}
                  >
                    계정 소계 <strong style={{ marginLeft: 8, ...amountStyle(section.subtotal.balance) }}>
                      {fmtAmount(section.subtotal.balance)}
                    </strong>
                  </div>
                </div>
              ))}
            </Card>
          ))}

          {groups.length === 0 ? (
            <Card>
              <div style={{ padding: 24, color: 'var(--color-neutral-500)', textAlign: 'center' }}>
                조회 기준에 해당하는 계정명세서 라인이 없습니다.
              </div>
            </Card>
          ) : null}

          <TotalBand items={totalItems} />
        </>
      )}
    </>
  )
}
