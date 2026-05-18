/**
 * 원장 화면 — `/accounting/ledgers` (SP-08-6-5 P2).
 *
 * <p>구성:
 * <ul>
 *   <li>필터 카드: 기간 + 계정 코드(선택) + 거래처 코드(선택) + 조회 버튼</li>
 *   <li>원장 요약 카드: 기초잔액 / 기말잔액 + CSV 다운로드 / 출력 버튼</li>
 *   <li>원장 라인 테이블: 일자 / 분개번호 / 계정 / 거래처 / 적요 / 차변 / 대변 / 잔액</li>
 * </ul>
 *
 * <p>권한: ACCOUNTANT / MANAGER / MASTER (RoleGuard 는 routes/index.tsx 적용).
 *
 * <p>UUID 비공개 가드 (`feedback_uuid_no_user_visibility.md`):
 * 화면 표시 식별자 — journalNo / accountCode / partnerCode / partnerName 만.
 * 어떤 UUID 도 미노출.
 *
 * data-testid:
 * - `general-ledger-page`             — 페이지 루트
 * - `general-ledger-filter-from`      — 시작일 input
 * - `general-ledger-filter-to`        — 종료일 input
 * - `general-ledger-filter-account`   — 계정 코드 input
 * - `general-ledger-filter-partner`   — 거래처 코드 input
 * - `general-ledger-filter-search`    — 조회 버튼
 * - `general-ledger-summary`          — 요약 카드
 * - `general-ledger-csv-button`       — CSV 다운로드 버튼
 * - `general-ledger-print-button`     — 출력 버튼
 * - `general-ledger-table`            — 원장 라인 테이블
 */
import { useMemo, useState, type CSSProperties } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button, Card, Spinner } from '@samhan/design-system'
import {
  getGeneralLedger,
  type GeneralLedgerLine,
  type GeneralLedgerResponse,
} from '../api/accounting'
import { usePageTitle } from '../hooks/usePageTitle'

/** YYYY-MM-DD 오늘 날짜. */
function today(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** 당월 1일 YYYY-MM-DD. */
function firstDayOfMonth(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

/** KRW BigDecimal string → "1,234,567" (NaN 시 "—", 음수 △ prefix). */
function fmtKrw(raw: string | null | undefined): string {
  if (raw === null || raw === undefined || raw === '') return '—'
  const n = Number(raw)
  if (!Number.isFinite(n)) return raw
  if (n === 0) return '—'
  if (n < 0) return `△ ${Math.abs(Math.round(n)).toLocaleString('ko-KR')}`
  return Math.round(n).toLocaleString('ko-KR')
}

/** CSV 셀 escape — RFC4180. */
function csvCell(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return ''
  const s = String(v)
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

/** 다운로드 helper — UTF-8 BOM + CRLF (Excel 한글 호환). */
function downloadCsv(filename: string, content: string): void {
  const blob = new Blob(['﻿', content], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

/** 원장 라인 CSV 직렬화. */
function buildCsv(data: GeneralLedgerResponse): string {
  const headerRow = [
    '일자',
    '분개번호',
    '계정코드',
    '계정명',
    '거래처코드',
    '거래처명',
    '적요',
    '차변',
    '대변',
    '잔액',
  ]
    .map(csvCell)
    .join(',')

  const dataRows = data.lines.map((ln) =>
    [
      ln.transactionDate,
      ln.journalNo,
      ln.accountCode,
      ln.accountName,
      ln.partnerCode ?? '',
      ln.partnerName ?? '',
      ln.description ?? '',
      ln.debit,
      ln.credit,
      ln.runningBalance,
    ]
      .map(csvCell)
      .join(','),
  )

  const summaryRows = [
    '',
    ['기초잔액', '', '', '', '', '', '', '', '', data.openingBalance]
      .map(csvCell)
      .join(','),
    ['기말잔액', '', '', '', '', '', '', '', '', data.closingBalance]
      .map(csvCell)
      .join(','),
  ]

  return [headerRow, ...dataRows, ...summaryRows].join('\r\n')
}

const inputStyle: CSSProperties = {
  height: 32,
  padding: '0 10px',
  border: '1px solid var(--line-default)',
  borderRadius: 6,
  fontSize: 'var(--font-size-sm)',
  color: 'var(--ink-primary)',
  background: 'var(--surface-card)',
}

const thStyle: CSSProperties = {
  padding: '8px 10px',
  borderBottom: '1px solid var(--line-default)',
  fontSize: 'var(--font-size-xs)',
  fontWeight: 'var(--font-weight-semibold)',
  color: 'var(--ink-secondary)',
  background: 'var(--color-neutral-50)',
  textAlign: 'left',
  whiteSpace: 'nowrap',
}

const tdStyle: CSSProperties = {
  padding: '8px 10px',
  fontSize: 'var(--font-size-sm)',
  color: 'var(--ink-primary)',
  whiteSpace: 'nowrap',
  borderTop: '1px solid var(--color-neutral-50)',
}

export function GeneralLedgerPage() {
  usePageTitle('원장')

  const [filterFrom, setFilterFrom] = useState<string>(firstDayOfMonth())
  const [filterTo, setFilterTo] = useState<string>(today())
  const [filterAccount, setFilterAccount] = useState<string>('')
  const [filterPartner, setFilterPartner] = useState<string>('')

  // 조회 버튼 클릭 시점의 값만 query key 에 반영 — 입력 중 fetch 방지
  const [applied, setApplied] = useState<{
    fromDate: string
    toDate: string
    accountCode: string | undefined
    partnerCode: string | undefined
  } | null>(null)

  const ledgerQuery = useQuery<GeneralLedgerResponse>({
    queryKey: [
      'general-ledger',
      applied?.fromDate ?? '',
      applied?.toDate ?? '',
      applied?.accountCode ?? '',
      applied?.partnerCode ?? '',
    ],
    queryFn: () =>
      getGeneralLedger({
        fromDate: applied!.fromDate,
        toDate: applied!.toDate,
        accountCode: applied?.accountCode,
        partnerCode: applied?.partnerCode,
      }),
    enabled: applied !== null,
  })

  const handleSearch = () => {
    if (!filterFrom || !filterTo || filterFrom > filterTo) return
    setApplied({
      fromDate: filterFrom,
      toDate: filterTo,
      accountCode: filterAccount.trim() || undefined,
      partnerCode: filterPartner.trim() || undefined,
    })
  }

  const handleCsv = () => {
    if (!ledgerQuery.data) return
    const filename = `general-ledger_${applied?.fromDate ?? ''}_${applied?.toDate ?? ''}.csv`
    downloadCsv(filename, buildCsv(ledgerQuery.data))
  }

  // 기말잔액 색상 — 음수 시 경고
  const balanceColor = useMemo(() => {
    if (!ledgerQuery.data) return 'var(--ink-primary)'
    const n = Number(ledgerQuery.data.closingBalance)
    if (!Number.isFinite(n)) return 'var(--ink-primary)'
    if (n < 0) return 'var(--state-danger)'
    return 'var(--ink-primary)'
  }, [ledgerQuery.data])

  const ledgerError = ledgerQuery.error as Error | null

  return (
    <div data-testid="general-ledger-page">
      {/* 필터 카드 */}
      <Card style={{ marginBottom: 16 }}>
        <h3
          style={{
            margin: '0 0 12px 0',
            fontSize: 'var(--font-card-title)',
            fontWeight: 'var(--font-weight-semibold)',
          }}
        >
          원장 조회 조건
        </h3>
        <div
          style={{
            display: 'flex',
            gap: 12,
            flexWrap: 'wrap',
            alignItems: 'center',
          }}
        >
          <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span
              style={{
                fontSize: 'var(--font-size-sm)',
                fontWeight: 'var(--font-weight-medium)',
                color: 'var(--ink-secondary)',
              }}
            >
              시작일 *
            </span>
            <input
              type="date"
              value={filterFrom}
              onChange={(e) => setFilterFrom(e.target.value)}
              data-testid="general-ledger-filter-from"
              style={inputStyle}
            />
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span
              style={{
                fontSize: 'var(--font-size-sm)',
                fontWeight: 'var(--font-weight-medium)',
                color: 'var(--ink-secondary)',
              }}
            >
              종료일 *
            </span>
            <input
              type="date"
              value={filterTo}
              onChange={(e) => setFilterTo(e.target.value)}
              data-testid="general-ledger-filter-to"
              style={inputStyle}
            />
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span
              style={{
                fontSize: 'var(--font-size-sm)',
                fontWeight: 'var(--font-weight-medium)',
                color: 'var(--ink-secondary)',
              }}
            >
              계정 코드(선택)
            </span>
            <input
              type="text"
              value={filterAccount}
              onChange={(e) => setFilterAccount(e.target.value)}
              placeholder="예: 1101"
              maxLength={4}
              data-testid="general-ledger-filter-account"
              style={{ ...inputStyle, width: 100 }}
            />
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span
              style={{
                fontSize: 'var(--font-size-sm)',
                fontWeight: 'var(--font-weight-medium)',
                color: 'var(--ink-secondary)',
              }}
            >
              거래처 코드(선택)
            </span>
            <input
              type="text"
              value={filterPartner}
              onChange={(e) => setFilterPartner(e.target.value)}
              placeholder="예: P-00123"
              data-testid="general-ledger-filter-partner"
              style={{ ...inputStyle, width: 160 }}
            />
          </label>
          <Button
            variant="primary"
            data-testid="general-ledger-filter-search"
            onClick={handleSearch}
            disabled={!filterFrom || !filterTo || filterFrom > filterTo}
          >
            조회
          </Button>
        </div>
        {filterFrom && filterTo && filterFrom > filterTo ? (
          <p
            style={{
              margin: '8px 0 0 0',
              fontSize: 'var(--font-size-xs)',
              color: 'var(--state-danger)',
            }}
          >
            시작일이 종료일보다 늦을 수 없습니다.
          </p>
        ) : null}
      </Card>

      {/* 미조회 안내 */}
      {applied === null ? (
        <Card>
          <div
            style={{
              padding: 32,
              textAlign: 'center',
              color: 'var(--ink-secondary)',
              fontSize: 'var(--font-size-sm)',
            }}
          >
            기간을 선택하고 [조회] 버튼을 누르면 원장이 표시됩니다.
          </div>
        </Card>
      ) : ledgerQuery.isLoading ? (
        <Card>
          <div style={{ display: 'grid', placeItems: 'center', minHeight: 200 }}>
            <Spinner size="lg" label="원장 불러오는 중" />
          </div>
        </Card>
      ) : ledgerError ? (
        <div className="error-banner" role="alert">
          원장을 불러오지 못했습니다: {ledgerError.message}
        </div>
      ) : ledgerQuery.data ? (
        <>
          {/* 요약 카드 */}
          <Card style={{ marginBottom: 16 }}>
            <div
              data-testid="general-ledger-summary"
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: 12,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  gap: 32,
                  flexWrap: 'wrap',
                  fontSize: 'var(--font-size-sm)',
                }}
              >
                <span>
                  <span
                    style={{
                      fontWeight: 'var(--font-weight-medium)',
                      color: 'var(--ink-secondary)',
                    }}
                  >
                    기간:
                  </span>{' '}
                  {applied.fromDate} ~ {applied.toDate}
                </span>
                {applied.accountCode ? (
                  <span>
                    <span
                      style={{
                        fontWeight: 'var(--font-weight-medium)',
                        color: 'var(--ink-secondary)',
                      }}
                    >
                      계정:
                    </span>{' '}
                    {applied.accountCode}
                  </span>
                ) : null}
                {applied.partnerCode ? (
                  <span>
                    <span
                      style={{
                        fontWeight: 'var(--font-weight-medium)',
                        color: 'var(--ink-secondary)',
                      }}
                    >
                      거래처:
                    </span>{' '}
                    {applied.partnerCode}
                  </span>
                ) : null}
                <span>
                  <span
                    style={{
                      fontWeight: 'var(--font-weight-medium)',
                      color: 'var(--ink-secondary)',
                    }}
                  >
                    기초잔액:
                  </span>{' '}
                  {fmtKrw(ledgerQuery.data.openingBalance)}
                </span>
                <span>
                  <span
                    style={{
                      fontWeight: 'var(--font-weight-medium)',
                      color: 'var(--ink-secondary)',
                    }}
                  >
                    기말잔액:
                  </span>{' '}
                  <span
                    style={{
                      fontWeight: 'var(--font-weight-semibold)',
                      color: balanceColor,
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {fmtKrw(ledgerQuery.data.closingBalance)}
                  </span>
                </span>
                <span>
                  <span
                    style={{
                      fontWeight: 'var(--font-weight-medium)',
                      color: 'var(--ink-secondary)',
                    }}
                  >
                    총 라인:
                  </span>{' '}
                  {ledgerQuery.data.lines.length.toLocaleString()}건
                </span>
              </div>

              <div style={{ display: 'flex', gap: 8 }}>
                <Button
                  variant="ghost"
                  size="sm"
                  data-testid="general-ledger-csv-button"
                  disabled={ledgerQuery.data.lines.length === 0}
                  onClick={handleCsv}
                >
                  CSV 다운로드
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  data-testid="general-ledger-print-button"
                  disabled={ledgerQuery.data.lines.length === 0}
                  onClick={() => window.print()}
                >
                  출력
                </Button>
              </div>
            </div>
          </Card>

          {/* 원장 라인 테이블 */}
          <Card>
            <h3
              style={{
                margin: '0 0 8px 0',
                fontSize: 'var(--font-card-title)',
                fontWeight: 'var(--font-weight-semibold)',
              }}
            >
              원장 라인
            </h3>

            {ledgerQuery.data.lines.length === 0 ? (
              <div
                style={{
                  padding: 32,
                  textAlign: 'center',
                  color: 'var(--ink-secondary)',
                  border: '1px dashed var(--line-default)',
                  borderRadius: 6,
                  fontSize: 'var(--font-size-sm)',
                }}
              >
                해당 기간 거래 내역이 없습니다.
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table
                  data-testid="general-ledger-table"
                  aria-label="원장 라인 테이블"
                  style={{
                    width: '100%',
                    borderCollapse: 'collapse',
                    fontSize: 'var(--font-size-sm)',
                  }}
                >
                  <thead>
                    <tr>
                      <th style={{ ...thStyle, width: 110 }}>일자</th>
                      <th style={{ ...thStyle, width: 160 }}>분개번호</th>
                      <th style={{ ...thStyle, width: 80 }}>계정코드</th>
                      <th style={{ ...thStyle, width: 100 }}>계정명</th>
                      <th style={{ ...thStyle, width: 110 }}>거래처코드</th>
                      <th style={thStyle}>거래처명</th>
                      <th style={thStyle}>적요</th>
                      <th
                        style={{
                          ...thStyle,
                          textAlign: 'right',
                          width: 130,
                        }}
                      >
                        차변
                      </th>
                      <th
                        style={{
                          ...thStyle,
                          textAlign: 'right',
                          width: 130,
                        }}
                      >
                        대변
                      </th>
                      <th
                        style={{
                          ...thStyle,
                          textAlign: 'right',
                          width: 140,
                        }}
                      >
                        잔액
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {ledgerQuery.data.lines.map((ln, idx) => (
                      <LedgerLineRow
                        key={`${ln.transactionDate}-${ln.journalNo}-${idx}`}
                        line={ln}
                        tdStyle={tdStyle}
                      />
                    ))}
                  </tbody>
                  <tfoot>
                    <tr
                      style={{
                        background: 'var(--color-neutral-100)',
                        borderTop: '2px solid var(--line-default)',
                      }}
                    >
                      <td
                        colSpan={7}
                        style={{
                          ...tdStyle,
                          fontWeight: 'var(--font-weight-semibold)',
                          color: 'var(--color-neutral-900)',
                        }}
                      >
                        기말잔액
                      </td>
                      <td colSpan={2} style={tdStyle} />
                      <td
                        style={{
                          ...tdStyle,
                          textAlign: 'right',
                          fontWeight: 'var(--font-weight-bold)',
                          color: balanceColor,
                          fontVariantNumeric: 'tabular-nums',
                        }}
                      >
                        {fmtKrw(ledgerQuery.data.closingBalance)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </Card>
        </>
      ) : null}
    </div>
  )
}

/** 원장 라인 행 컴포넌트 — 잔액 음수 시 색상 강조. */
function LedgerLineRow({
  line,
  tdStyle,
}: {
  line: GeneralLedgerLine
  tdStyle: CSSProperties
}) {
  const balanceColor = useMemo(() => {
    const n = Number(line.runningBalance)
    if (!Number.isFinite(n) || n >= 0) return 'var(--ink-primary)'
    return 'var(--state-danger)'
  }, [line.runningBalance])

  return (
    <tr style={{ borderTop: '1px solid var(--color-neutral-50)' }}>
      <td style={tdStyle}>{line.transactionDate}</td>
      <td style={tdStyle}>{line.journalNo}</td>
      <td style={tdStyle}>{line.accountCode}</td>
      <td style={tdStyle}>{line.accountName}</td>
      <td style={tdStyle}>{line.partnerCode ?? '—'}</td>
      <td style={tdStyle}>{line.partnerName ?? '—'}</td>
      <td style={tdStyle}>{line.description ?? '—'}</td>
      <td
        style={{
          ...tdStyle,
          textAlign: 'right',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {fmtKrw(line.debit)}
      </td>
      <td
        style={{
          ...tdStyle,
          textAlign: 'right',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {fmtKrw(line.credit)}
      </td>
      <td
        style={{
          ...tdStyle,
          textAlign: 'right',
          fontWeight: 'var(--font-weight-semibold)',
          fontVariantNumeric: 'tabular-nums',
          color: balanceColor,
        }}
      >
        {fmtKrw(line.runningBalance)}
      </td>
    </tr>
  )
}
