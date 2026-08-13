/**
 * 거래처별 원장 생성 페이지 (`/accounting/partner-ledger`) — PR-E2 FE-7.
 *
 * <p>legacy GAS 3번 "거래처별 원장생성" 자동 조회 이식. accounting-service commit
 * c48e156 의 BE-A8 (매출/수금/채권 집계) + BE-A9 (거래처별 원장 line + 잔액) 통합 화면.
 *
 * <h2>페이지 구성</h2>
 * <ol>
 *   <li><b>Step 1 — 집계</b>: from/to 필터 + (선택) 단일 거래처 코드 → BE-A8 호출 →
 *       거래처별 매출/수금/채권 집계 표 표시. row 클릭 → Step 2 활성.</li>
 *   <li><b>Step 2 — 원장 출력</b>: 선택 거래처의 분개 line 표 (date/journalNo/적요/차변/대변/잔액) →
 *       "인쇄 미리보기" → Designer PartnerLedgerView 새 창. "여러 거래처 일괄 인쇄" →
 *       선택 거래처 multi-print (각 거래처 별도 창).</li>
 *   <li><b>CSV 다운로드</b>: 집계 결과 + 원장 line (선택 거래처 단건) UTF-8 BOM csv.</li>
 * </ol>
 *
 * <h2>접근 제어</h2>
 * <p>진입 권한은 accounting.partner-ledger VIEW page-code 계약을 사용한다.
 * RoleGuard 는 routes/index.tsx 에서 적용. BE 자체 가드는 ACCOUNTANT/MASTER 만이며
 * MANAGER 호출 시 403 발생 → 화면 error banner 안내.
 *
 * <h2>UUID 비공개 가드</h2>
 * <p>화면 표시 식별자 — bizNo + partnerName + journalNo + partnerBusinessNo +
 * chatRoomName 만. 어떤 UUID 도 노출 X.
 *
 * <h2>(주)삼한공조시스템 표기</h2>
 * <p>본 페이지는 회사명 직접 표기 X (Designer PartnerLedgerView 가 인쇄 양식에서
 * COMPANY.legalName 으로 표기). 페이지 본체는 page title 만 노출.
 *
 * <h2>data-testid (E2E)</h2>
 * <ul>
 *   <li>{@code partner-ledger-from} / {@code partner-ledger-to}</li>
 *   <li>{@code partner-ledger-partner} (단일 거래처 필터 input)</li>
 *   <li>{@code partner-ledger-search} (조회 버튼)</li>
 *   <li>{@code partner-ledger-aggregate-table}</li>
 *   <li>{@code partner-ledger-aggregate-row-{partnerCode}}</li>
 *   <li>{@code partner-ledger-detail-table}</li>
 *   <li>{@code partner-ledger-print-button}</li>
 *   <li>{@code partner-ledger-batch-print-button}</li>
 *   <li>{@code partner-ledger-csv-download}</li>
 * </ul>
 */
import { useMemo, useState, type CSSProperties } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Button, Card, Spinner } from '@samhan/design-system'
import {
  captureLedger,
  copyLedgerSnapshot,
  getLedgerData,
  getLedgerHistory,
  getSalesAggregate,
  mapLedgerSnapshotResponse,
  restoreLedger,
  type LedgerData,
  type LedgerLine,
  type SalesAggregateRow,
} from '../api/partnerLedgerApi'
import { AuditInfoBanner } from '../components/audit/AuditOverlaySection'
import { usePageTitle } from '../hooks/usePageTitle'

/** YYYY-MM-DD 헬퍼. */
function toIsoDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** default from = 당월 1일, to = 당월 말일. */
function defaultRange(): { from: string; to: string } {
  const now = new Date()
  const first = new Date(now.getFullYear(), now.getMonth(), 1)
  const last = new Date(now.getFullYear(), now.getMonth() + 1, 0)
  return { from: toIsoDate(first), to: toIsoDate(last) }
}

/** KRW BigDecimal string → "1,234,567" (0='—', 음수는 하이픈 prefix). */
function fmtKrw(raw: string | null | undefined): string {
  if (raw === null || raw === undefined || raw === '') return '—'
  const n = Number(raw)
  if (!Number.isFinite(n)) return raw
  if (n === 0) return '—'
  if (n < 0) return `-${Math.abs(Math.round(n)).toLocaleString('ko-KR')}`
  return Math.round(n).toLocaleString('ko-KR')
}

/** 음수만 빨강으로 표시하고 양수/0은 기본 잉크색을 유지한다. */
function amountStyle(raw: string | number | null | undefined): CSSProperties {
  const n = Number(raw)
  return {
    ...tdStyle,
    textAlign: 'right',
    color: Number.isFinite(n) && n < 0 ? '#DC2626' : tdStyle.color,
  }
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

/** 집계 + 원장 line CSV 직렬화. */
export function buildCsv(
  aggregate: SalesAggregateRow[],
  ledger: LedgerData | null,
): string {
  const lines: string[] = []
  // 섹션 1 — 집계
  lines.push(
    [
      '거래처코드',
      '거래처명',
      '매출합계',
      '수금합계',
      '조정합계',
      '채권잔액',
      '기간시작',
      '기간종료',
    ]
      .map(csvCell)
      .join(','),
  )
  for (const row of aggregate) {
    lines.push(
      [
        row.partnerCode,
        row.partnerName,
        row.salesTotal,
        row.paymentTotal,
        row.adjustmentTotal ?? '0',
        row.receivableBalance,
        row.periodFrom,
        row.periodTo,
      ]
        .map(csvCell)
        .join(','),
    )
  }
  // 섹션 2 — 원장 line (선택 거래처 1건)
  if (ledger) {
    lines.push('')
    lines.push(
      [
        `[원장] ${ledger.partnerName}`,
        `사업자번호 ${ledger.partnerBusinessNo || '-'}`,
        `단톡방 ${ledger.chatRoomNames.join(' / ') || '-'}`,
        `${ledger.periodFrom} ~ ${ledger.periodTo}`,
      ]
        .map(csvCell)
        .join(','),
    )
    lines.push(
      ['일자', '분개번호', '계정코드', '적요', '차변', '대변', '잔액']
        .map(csvCell)
        .join(','),
    )
    for (const ln of ledger.lines) {
      lines.push(
        [
          ln.date,
          ln.journalNo,
          ln.accountCode,
          ln.description,
          ln.debit,
          ln.credit,
          ln.balance,
        ]
          .map(csvCell)
          .join(','),
      )
    }
  }
  return lines.join('\r\n')
}

/** 인쇄 라우트 path 생성 — `/print/partner-ledger?partnerCode=&from=&to=`. */
function buildPrintPath(partnerCode: string, from: string, to: string, batchNo?: string): string {
  const qs = new URLSearchParams({ partnerCode, from, to })
  if (batchNo) qs.set('batchNo', batchNo)
  return `/print/partner-ledger?${qs.toString()}`
}

type ActiveLedger =
  | { source: 'LIVE'; data: LedgerData }
  | { source: 'SNAPSHOT'; batchNo: string; savedAt: string; data: LedgerData }

const inputStyle: CSSProperties = {
  height: 32,
  padding: '0 10px',
  border: '1px solid #D1D5DB',
  borderRadius: 6,
  fontSize: 13,
}

const thStyle: CSSProperties = {
  padding: '8px 10px',
  borderBottom: '1px solid #E5E7EB',
  fontSize: 12,
  fontWeight: 600,
  color: '#374151',
  background: '#F9FAFB',
  textAlign: 'left',
  whiteSpace: 'nowrap',
}

const tdStyle: CSSProperties = {
  padding: '8px 10px',
  fontSize: 13,
  color: '#1F2937',
  whiteSpace: 'nowrap',
  borderTop: '1px solid #F3F4F6',
}

export function PartnerLedgerPage() {
  usePageTitle('거래처별 원장 생성')
  const navigate = useNavigate()

  const initial = useMemo(() => defaultRange(), [])
  const [from, setFrom] = useState(initial.from)
  const [to, setTo] = useState(initial.to)
  const [partnerFilter, setPartnerFilter] = useState('')
  // 검색 버튼 클릭 시점의 (from, to, partnerFilter) 만 query key — 입력 중 fetch 방지.
  const [applied, setApplied] = useState<{
    from: string
    to: string
    partnerCode: string | undefined
  }>({
    from: initial.from,
    to: initial.to,
    partnerCode: undefined,
  })
  // Step 2 — Detail 선택 거래처 코드 (집계 row 클릭)
  const [selectedPartner, setSelectedPartner] = useState<string | null>(null)
  // 일괄 인쇄용 multi-select 거래처 코드 set
  const [batchSelected, setBatchSelected] = useState<Set<string>>(new Set())
  const [snapshotLedger, setSnapshotLedger] = useState<Extract<ActiveLedger, { source: 'SNAPSHOT' }> | null>(null)
  const [historyPage, setHistoryPage] = useState(0)
  const [isSavingSnapshot, setIsSavingSnapshot] = useState(false)

  const aggregateQuery = useQuery<SalesAggregateRow[]>({
    queryKey: [
      'partner-ledger-aggregate',
      applied.from,
      applied.to,
      applied.partnerCode ?? '',
    ],
    queryFn: () =>
      getSalesAggregate(applied.from, applied.to, applied.partnerCode),
  })

  const ledgerQuery = useQuery<LedgerData>({
    queryKey: ['partner-ledger-detail', selectedPartner, applied.from, applied.to],
    queryFn: () => getLedgerData(selectedPartner ?? '', applied.from, applied.to),
    enabled: !!selectedPartner,
  })

  const historyQuery = useQuery({
    queryKey: ['partner-ledger-history', selectedPartner, applied.from, applied.to, historyPage],
    queryFn: () => getLedgerHistory(selectedPartner ?? '', applied.from, applied.to, historyPage),
    enabled: !!selectedPartner,
  })

  const activeLedger: ActiveLedger | null = snapshotLedger
    ?? (ledgerQuery.data ? { source: 'LIVE', data: ledgerQuery.data } : null)

  const handleSearch = () => {
    if (!from || !to || from > to) return
    setApplied({
      from,
      to,
      partnerCode: partnerFilter.trim() || undefined,
    })
    setSelectedPartner(null)
    setSnapshotLedger(null)
    setHistoryPage(0)
    setBatchSelected(new Set())
  }

  const handleSelectPartner = (partnerCode: string) => {
    setSelectedPartner(partnerCode)
    setSnapshotLedger(null)
    setHistoryPage(0)
  }

  const handleRestore = async (batchNo: string) => {
    const restored = await restoreLedger(batchNo)
    if (restored.ledger) {
      setSnapshotLedger({
        source: 'SNAPSHOT',
        batchNo: restored.batchNo,
        savedAt: restored.savedAt,
        data: mapLedgerSnapshotResponse(restored.ledger),
      })
    }
  }

  const handleCaptureSnapshot = async () => {
    if (!selectedPartner || !activeLedger || isSavingSnapshot) return
    setIsSavingSnapshot(true)
    try {
      if (activeLedger.source === 'SNAPSHOT') {
        await copyLedgerSnapshot(activeLedger.batchNo)
      } else {
        await captureLedger(selectedPartner, applied.from, applied.to)
      }
      setHistoryPage(0)
      await historyQuery.refetch()
    } finally {
      setIsSavingSnapshot(false)
    }
  }

  const toggleBatch = (partnerCode: string, checked: boolean) => {
    setBatchSelected((prev) => {
      const next = new Set(prev)
      if (checked) next.add(partnerCode)
      else next.delete(partnerCode)
      return next
    })
  }

  const handlePrint = () => {
    if (!selectedPartner) return
    // Electron은 보안상 renderer의 내부 window.open을 차단하고 단일 BrowserWindow를 사용한다.
    // 따라서 인쇄 전용 화면은 현재 창의 허용된 HashRouter 라우트로 이동한다.
    navigate(buildPrintPath(
      selectedPartner,
      applied.from,
      applied.to,
      activeLedger?.source === 'SNAPSHOT' ? activeLedger.batchNo : undefined,
    ))
  }

  const handleBatchPrint = () => {
    if (batchSelected.size === 0) return
    const ok = window.confirm(`${batchSelected.size}건의 거래처 원장을 일괄 출력하시겠습니까?`)
    if (!ok) return
    const params = new URLSearchParams({ from: applied.from, to: applied.to })
    for (const code of batchSelected) {
      params.append('partnerCodes', code)
    }
    navigate(`/print/partner-ledger-batch?${params.toString()}`)
  }

  const handleCsv = () => {
    if (!aggregateQuery.data || !activeLedger) return
    const filename = `partner-ledger_${applied.from}_${applied.to}.csv`
    const aggregate = activeLedger.source === 'SNAPSHOT'
      ? [snapshotAggregateRow(activeLedger.data)]
      : aggregateQuery.data
    const csv = buildCsv(aggregate, activeLedger.data)
    downloadCsv(filename, csv)
  }

  const aggregateError = aggregateQuery.error as Error | null
  const ledgerError = ledgerQuery.error as Error | null

  return (
    <>
      {/* PR-H4c FE-A: read-only 집계 화면 — 변경 이력은 원본 분개/세금계산서 상세에서 확인 */}
      <AuditInfoBanner
        message="원장 라인의 변경 이력은 각 분개 또는 세금계산서 상세 화면에서 확인할 수 있습니다."
        testId="partner-ledger-audit-info-banner"
      />

      {/* Step 1 — 집계 필터 */}
      <Card style={{ marginBottom: 16 }}>
        <h3 style={{ margin: '0 0 12px 0' }}>Step 1 — 매출/수금/채권 집계</h3>
        <p
          style={{
            margin: '0 0 12px 0',
            fontSize: 12,
            color: '#6B7280',
            lineHeight: 1.5,
          }}
        >
          기간 + (선택) 거래처 코드를 입력하고 [조회] 버튼을 누르면 자체 분개
          (4019/1089 코드) 기반 거래처별 합계가 표시됩니다. 거래처 row 를 클릭하면
          Step 2 원장이 활성화됩니다.
        </p>

        <div
          style={{
            display: 'flex',
            gap: 12,
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
              data-testid="partner-ledger-from"
              style={inputStyle}
            />
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 13, color: '#374151' }}>종료일</span>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              data-testid="partner-ledger-to"
              style={inputStyle}
            />
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 13, color: '#374151' }}>거래처 코드(선택)</span>
            <input
              type="text"
              value={partnerFilter}
              onChange={(e) => setPartnerFilter(e.target.value)}
              placeholder="예: P-00123"
              data-testid="partner-ledger-partner"
              style={{ ...inputStyle, width: 180 }}
            />
          </label>
          <Button
            variant="primary"
            data-testid="partner-ledger-search"
            onClick={handleSearch}
            disabled={!from || !to || from > to}
          >
            조회
          </Button>
          <Button
            variant="secondary"
            data-testid="partner-ledger-csv-download"
            onClick={handleCsv}
            disabled={!aggregateQuery.data || aggregateQuery.data.length === 0 || !activeLedger}
          >
            CSV 다운로드
          </Button>
        </div>

        {aggregateError ? (
          <div className="error-banner" role="alert" style={{ marginTop: 8 }}>
            집계 조회 실패: {aggregateError.message}
          </div>
        ) : null}
      </Card>

      {/* 집계 결과 */}
      <Card style={{ marginBottom: 16 }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 8,
          }}
        >
          <h3 style={{ margin: 0 }}>
            거래처별 집계
            {aggregateQuery.data ? (
              <span
                style={{
                  marginLeft: 8,
                  fontSize: 13,
                  fontWeight: 400,
                  color: '#6B7280',
                }}
              >
                총 {aggregateQuery.data.length}건
              </span>
            ) : null}
          </h3>
          <Button
            variant="secondary"
            size="sm"
            data-testid="partner-ledger-batch-print-button"
            onClick={handleBatchPrint}
            disabled={batchSelected.size === 0}
          >
            여러 거래처 일괄 인쇄 ({batchSelected.size}건)
          </Button>
        </div>

        {aggregateQuery.isLoading ? (
          <div style={{ display: 'grid', placeItems: 'center', minHeight: 120 }}>
            <Spinner size="lg" label="집계 불러오는 중" />
          </div>
        ) : aggregateQuery.data && aggregateQuery.data.length === 0 ? (
          <div
            style={{
              padding: 24,
              color: '#6B7280',
              border: '1px dashed #D1D5DB',
              borderRadius: 6,
              textAlign: 'center',
            }}
          >
            기간 내 매출 거래처가 없습니다.
          </div>
        ) : aggregateQuery.data ? (
          <div style={{ overflowX: 'auto' }}>
            <table
              data-testid="partner-ledger-aggregate-table"
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                fontSize: 13,
              }}
            >
              <thead>
                <tr>
                  <th style={{ ...thStyle, width: 36, textAlign: 'center' }}>
                    선택
                  </th>
                  <th style={thStyle}>거래처코드</th>
                  <th style={thStyle}>거래처명</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>매출 합계</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>수금 합계</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>조정 합계</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>채권 잔액</th>
                  <th style={{ ...thStyle, width: 110 }}>원장</th>
                </tr>
              </thead>
              <tbody>
                {aggregateQuery.data.map((row) => {
                  const isSelected = selectedPartner === row.partnerCode
                  const isIdentifiablePartner = row.partnerCode !== '-'
                  return (
                    <tr
                      key={row.partnerCode}
                      data-testid={`partner-ledger-aggregate-row-${row.partnerCode}`}
                      style={{
                        background: isSelected ? '#EEF2FF' : undefined,
                        cursor: isIdentifiablePartner ? 'pointer' : 'default',
                      }}
                      onClick={() => {
                        if (isIdentifiablePartner) handleSelectPartner(row.partnerCode)
                      }}
                    >
                      <td
                        style={{ ...tdStyle, textAlign: 'center' }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <input
                          type="checkbox"
                          checked={batchSelected.has(row.partnerCode)}
                          disabled={!isIdentifiablePartner}
                          onChange={(e) =>
                            toggleBatch(row.partnerCode, e.target.checked)
                          }
                          aria-label={`${row.partnerName} 일괄 인쇄 선택`}
                        />
                      </td>
                      <td style={{ ...tdStyle, fontVariantNumeric: 'tabular-nums' }}>
                        {row.bizNo?.replace(/\D/g, '') || '-'}
                      </td>
                      <td style={tdStyle}>{row.partnerName}</td>
                      <td style={amountStyle(row.salesTotal)}>
                        {fmtKrw(row.salesTotal)}
                      </td>
                      <td style={amountStyle(row.paymentTotal)}>
                        {fmtKrw(row.paymentTotal)}
                      </td>
                      <td style={amountStyle(row.adjustmentTotal)}>
                        {fmtKrw(row.adjustmentTotal)}
                      </td>
                      <td style={amountStyle(row.receivableBalance)}>
                        {fmtKrw(row.receivableBalance)}
                      </td>
                      <td style={tdStyle}>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            if (isIdentifiablePartner) handleSelectPartner(row.partnerCode)
                          }}
                          disabled={!isIdentifiablePartner}
                          style={{
                            background: 'transparent',
                            border: '1px solid #D1D5DB',
                            borderRadius: 4,
                            padding: '4px 8px',
                            fontSize: 12,
                            cursor: 'pointer',
                            color: '#1D4ED8',
                          }}
                        >
                          원장 보기
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : null}
      </Card>

      {/* Step 2 — 원장 detail */}
      <Card>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 8,
            gap: 12,
            flexWrap: 'wrap',
          }}
        >
          <h3 style={{ margin: 0 }}>
            Step 2 — 거래처 원장
          </h3>
          <Button
            variant="primary"
            data-testid="partner-ledger-print-button"
            onClick={handlePrint}
            disabled={!selectedPartner || ledgerQuery.isLoading}
          >
            인쇄 미리보기
          </Button>
        </div>

        {!selectedPartner ? (
          <div
            style={{
              padding: 24,
              color: '#6B7280',
              border: '1px dashed #D1D5DB',
              borderRadius: 6,
              textAlign: 'center',
            }}
          >
            상단 집계 표에서 거래처 row 를 클릭하면 원장이 표시됩니다.
          </div>
        ) : ledgerQuery.isLoading ? (
          <div style={{ display: 'grid', placeItems: 'center', minHeight: 120 }}>
            <Spinner size="lg" label="원장 불러오는 중" />
          </div>
        ) : ledgerError ? (
          <div className="error-banner" role="alert">
            원장 조회 실패: {ledgerError.message}
          </div>
        ) : activeLedger ? (
          <>
            {activeLedger.source === 'SNAPSHOT' ? (
              <div role="status" style={{ marginBottom: 8, color: '#92400E', fontSize: 12 }}>
                복원 원장 {activeLedger.batchNo} · 저장 시각 {activeLedger.savedAt}
                <Button
                  variant="secondary"
                  size="sm"
                  data-testid="partner-ledger-return-live"
                  onClick={() => setSnapshotLedger(null)}
                  style={{ marginLeft: 8 }}
                >
                  현재 원장으로 돌아가기
                </Button>
              </div>
            ) : null}
            <LedgerDetailTable data={activeLedger.data} />
          </>
        ) : null}

        {selectedPartner ? (
          <div style={{ marginTop: 20 }} data-testid="partner-ledger-history">
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 8,
                marginBottom: 8,
              }}
            >
                <h4 style={{ margin: 0 }}>원장 저장 이력</h4>
              <Button
                variant="secondary"
                size="sm"
                data-testid="partner-ledger-save-snapshot"
                onClick={() => void handleCaptureSnapshot()}
                disabled={isSavingSnapshot || !activeLedger}
              >
                {isSavingSnapshot ? '저장 중…' : '현재 원장 저장'}
              </Button>
            </div>
            {historyQuery.isLoading ? (
              <Spinner size="sm" label="이력 불러오는 중" />
            ) : historyQuery.error ? (
              <div className="error-banner" role="alert">이력 조회 실패</div>
            ) : historyQuery.data?.content.length ? (
              <>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr>
                    <th style={thStyle}>배치번호</th>
                    <th style={thStyle}>기간</th>
                    <th style={thStyle}>행 수</th>
                    <th style={thStyle}>저장 시각</th>
                    <th style={thStyle}>복원</th>
                  </tr>
                </thead>
                <tbody>
                  {historyQuery.data.content.map((item) => (
                    <tr key={item.batchNo}>
                      <td style={tdStyle}>{item.batchNo}</td>
                      <td style={tdStyle}>{item.periodFrom} ~ {item.periodTo}</td>
                      <td style={tdStyle}>{item.lineCount}</td>
                      <td style={tdStyle}>{item.savedAt}</td>
                      <td style={tdStyle}>
                        <Button
                          variant="secondary"
                          size="sm"
                          data-testid={`partner-ledger-restore-${item.batchNo}`}
                          onClick={() => void handleRestore(item.batchNo)}
                        >
                          복원
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                </table>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
                <Button
                  variant="secondary"
                  size="sm"
                  data-testid="partner-ledger-history-prev"
                  disabled={(historyQuery.data?.number ?? historyPage) <= 0}
                  onClick={() => setHistoryPage((page) => Math.max(0, page - 1))}
                >
                  이전
                </Button>
                <span style={{ color: '#6B7280', fontSize: 12 }}>
                  {(historyQuery.data?.number ?? historyPage) + 1} / {historyQuery.data?.totalPages ?? 1}
                </span>
                <Button
                  variant="secondary"
                  size="sm"
                  data-testid="partner-ledger-history-next"
                  disabled={(historyQuery.data?.number ?? historyPage) + 1 >= (historyQuery.data?.totalPages ?? 1)}
                  onClick={() => setHistoryPage((page) => page + 1)}
                >
                  다음
                </Button>
                </div>
              </>
            ) : (
              <div style={{ color: '#6B7280', fontSize: 12 }}>저장된 이력이 없습니다.</div>
            )}
          </div>
        ) : null}
      </Card>
    </>
  )
}

/** 원장 line 표 — date / journalNo / 적요 / 차변 / 대변 / 잔액 + 합계. */
function LedgerDetailTable({ data }: { data: LedgerData }) {
  const totals = useMemo(() => sumLines(data.lines), [data.lines])

  return (
    <>
      {/* 거래처 정보 헤더 */}
      <div
        style={{
          marginBottom: 12,
          padding: 10,
          background: '#F9FAFB',
          border: '1px solid #E5E7EB',
          borderRadius: 6,
          fontSize: 13,
          color: '#374151',
          display: 'grid',
          gridTemplateColumns: 'auto 1fr',
          rowGap: 4,
          columnGap: 12,
        }}
      >
        <span style={{ fontWeight: 600 }}>거래처</span>
        <span>
          {data.partnerName}
        </span>
        <span style={{ fontWeight: 600 }}>사업자번호</span>
        <span>{data.partnerBusinessNo || '-'}</span>
        <span style={{ fontWeight: 600 }}>단톡방</span>
        <span>
          {(data.chatRoomNames?.length ?? 0) === 0 ? '-' : (data.chatRoomNames ?? []).join(' / ')}
        </span>
        <span style={{ fontWeight: 600 }}>기간</span>
        <span>
          {data.periodFrom} ~ {data.periodTo}
        </span>
      </div>

      {(data.lines?.length ?? 0) === 0 ? (
        <div
          style={{
            padding: 24,
            color: '#6B7280',
            border: '1px dashed #D1D5DB',
            borderRadius: 6,
            textAlign: 'center',
          }}
        >
          해당 기간 거래 내역이 없습니다.
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table
            data-testid="partner-ledger-detail-table"
            style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}
          >
            <thead>
              <tr>
                <th style={{ ...thStyle, width: 110 }}>일자</th>
                <th style={{ ...thStyle, width: 160 }}>분개번호</th>
                <th style={{ ...thStyle, width: 90 }}>문서</th>
                <th style={{ ...thStyle, width: 180 }}>배송주소</th>
                <th style={thStyle}>적요</th>
                <th style={{ ...thStyle, textAlign: 'right', width: 130 }}>차변</th>
                <th style={{ ...thStyle, textAlign: 'right', width: 130 }}>대변</th>
                <th style={{ ...thStyle, textAlign: 'right', width: 140 }}>잔액</th>
              </tr>
            </thead>
            <tbody>
              <tr style={{ background: '#FFFBEB' }}>
                <td colSpan={5} style={{ ...tdStyle, fontWeight: 600 }}>
                  기초 잔액 ({data.periodFrom} 이전)
                </td>
                <td style={tdStyle}>—</td>
                <td style={tdStyle}>—</td>
                <td style={{ ...amountStyle(data.openingBalance ?? '0'), fontWeight: 600 }}>
                  {fmtKrw(data.openingBalance ?? '0')}
                </td>
              </tr>
              {(data.lines ?? []).map((ln, idx) => (
                <tr key={`${ln.date}-${ln.journalNo}-${idx}`}>
                  <td style={tdStyle}>{ln.date}</td>
                  <td style={tdStyle}>{ln.journalNo}</td>
                  <td style={tdStyle}>
                    {ln.effect === 'PAYMENT'
                      ? '수금'
                      : ln.effect === 'ADJUSTMENT' ? '조정' : '매출'}
                  </td>
                  <td style={tdStyle}>{ln.deliveryAddress || '—'}</td>
                  <td style={tdStyle}>{ln.description || '-'}</td>
                  <td style={amountStyle(ln.debit)}>
                    {fmtKrw(ln.debit)}
                  </td>
                  <td style={amountStyle(ln.credit)}>
                    {fmtKrw(ln.credit)}
                  </td>
                  <td
                    style={{ ...amountStyle(ln.balance), fontWeight: 600 }}
                  >
                    {fmtKrw(ln.balance)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ background: '#F3F4F6' }}>
                <td colSpan={5} style={{ ...tdStyle, fontWeight: 600 }}>
                  합계
                </td>
                <td
                  style={{ ...amountStyle(totals.debit), fontWeight: 700 }}
                >
                  {fmtKrw(totals.debit)}
                </td>
                <td
                  style={{ ...amountStyle(totals.credit), fontWeight: 700 }}
                >
                  {fmtKrw(totals.credit)}
                </td>
                <td style={tdStyle}>—</td>
              </tr>
              <tr style={{ background: '#EEF2FF' }}>
                <td colSpan={7} style={{ ...tdStyle, fontWeight: 600 }}>기말 잔액</td>
                <td style={{ ...amountStyle(data.closingBalance ?? data.lines.at(-1)?.balance ?? '0'), fontWeight: 700 }}>
                  {fmtKrw(data.closingBalance ?? data.lines.at(-1)?.balance ?? '0')}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </>
  )
}

function snapshotAggregateRow(data: LedgerData): SalesAggregateRow {
  return {
    partnerCode: data.partnerCode,
    bizNo: data.partnerBusinessNo,
    partnerName: data.partnerName,
    salesTotal: data.salesTotal ?? '0',
    paymentTotal: data.paymentTotal ?? '0',
    adjustmentTotal: data.adjustmentTotal ?? '0',
    receivableBalance: data.closingBalance ?? data.lines.at(-1)?.balance ?? data.openingBalance ?? '0',
    periodFrom: data.periodFrom,
    periodTo: data.periodTo,
  }
}

/** 차변/대변 합계 (string BigDecimal → Number 합산 후 string 반환). */
function sumLines(lines: LedgerLine[]): { debit: string; credit: string } {
  let debit = 0
  let credit = 0
  for (const ln of lines) {
    const d = Number(ln.debit)
    const c = Number(ln.credit)
    if (Number.isFinite(d)) debit += d
    if (Number.isFinite(c)) credit += c
  }
  return { debit: String(debit), credit: String(credit) }
}
