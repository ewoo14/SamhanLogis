/**
 * 거래명세서 일괄 페이지 — `/accounting/statement-batch` (PR-E2 FE-8 Samhan Public native).
 *
 * <p>legacy GAS 4번 "거래처별 일괄 거래명세서" 의 desktop 자체 화면 이식. 회계 담당자가
 * 기간(from/to)을 입력하면 BE-A10 ({@code GET /accounting/statements/batch-data})
 * 가 ISSUED 세금계산서를 거래처별로 그룹핑하여 응답하며, 본 페이지가 거래처별 요약
 * 표 + 다중 선택 → page-break per partner 일괄 인쇄 진입을 제공한다.
 *
 * <h2>화면 구성</h2>
 * <ul>
 *   <li>상단: 기간 입력 (from/to, default = 최근 1개월) + [선택 거래처 일괄 인쇄] /
 *       [전체 일괄 인쇄] 액션 버튼 2종</li>
 *   <li>본문: 거래처별 요약 표 (체크박스 / partnerCode / partnerName / 단톡방 /
 *       slip count / 합계금액)</li>
 * </ul>
 *
 * <h2>인쇄 진입</h2>
 * <ul>
 *   <li>[선택 거래처 일괄 인쇄] →
 *       {@code /print/statement-batch?from=&to=&partnerCodes=A,B,C}</li>
 *   <li>[전체 일괄 인쇄] → {@code /print/statement-batch?from=&to=}
 *       (partnerCodes 미지정 시 전체)</li>
 * </ul>
 * <p>실제 인쇄 view 는 Designer commit 69fd8f0 의 {@link StatementBatchView} 가
 * 담당 (page-break-after: always per partner). 본 1차 mock 단계에서는 view 가
 * 자체 MOCK_DATA 를 사용 — 후속 iteration 에서 BE 응답 wiring.
 *
 * <h2>UUID 비공개</h2>
 * <p>화면 노출 식별자는 partnerCode / partnerName / slipNo (taxInvoiceNo) 만.
 * BE 응답 wire-format 에 UUID 없음.
 *
 * <h2>접근 제어</h2>
 * <p>ACCOUNTANT / MASTER 만 진입 — BE {@code @PreAuthorize} 와 1:1. RoleGuard 는
 * router 측에서 적용.
 *
 * <h2>data-testid</h2>
 * <ul>
 *   <li>{@code statement-batch-from} / {@code statement-batch-to} — 기간 입력</li>
 *   <li>{@code statement-batch-table} — 거래처 요약 표</li>
 *   <li>{@code statement-batch-row-{partnerCode}} — 거래처 row</li>
 *   <li>{@code statement-batch-checkbox-{partnerCode}} — 다중 선택 체크박스</li>
 *   <li>{@code statement-batch-print-selected} — 선택 거래처 일괄 인쇄 버튼</li>
 *   <li>{@code statement-batch-print-all} — 전체 일괄 인쇄 버튼</li>
 * </ul>
 */
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Button } from '@samhan/design-system'
import {
  getStatementBatch,
  sumPartnerTotals,
  type StatementBatchRow,
} from '../api/statementBatchApi'
import { AuditInfoBanner } from '../components/audit/AuditOverlaySection'
import { usePageTitle } from '../hooks/usePageTitle'
import { krw, krDate } from '../print/PrintLayout'

/**
 * 오늘 일자 (YYYY-MM-DD) — 기간 to default.
 *
 * <p>local 시간 기준 (운영 환경 KST 가정).
 */
function todayIso(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/**
 * 1개월 전 일자 (YYYY-MM-DD) — 기간 from default.
 */
function oneMonthAgoIso(): string {
  const d = new Date()
  d.setMonth(d.getMonth() - 1)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function StatementBatchPage() {
  usePageTitle('거래명세서 일괄')
  const navigate = useNavigate()

  const [from, setFrom] = useState<string>(oneMonthAgoIso())
  const [to, setTo] = useState<string>(todayIso())

  /** 다중 선택 거래처 코드 set. partnerCode key. */
  const [selected, setSelected] = useState<Set<string>>(new Set())

  /** from <= to 검증 — false 시 BE 호출 차단. */
  const validRange = !!from && !!to && from <= to

  const query = useQuery({
    queryKey: ['statement-batch', from, to],
    queryFn: () => getStatementBatch(from, to),
    enabled: validRange,
  })

  const rows: StatementBatchRow[] = useMemo(
    () => Array.isArray(query.data) ? query.data : [],
    [query.data],
  )

  /** 전체 합계 — 표 footer / 요약 영역. */
  const grandTotal = useMemo(() => {
    let totalSupply = 0
    let totalVat = 0
    let totalAmount = 0
    let slipCount = 0
    for (const row of rows) {
      const sums = sumPartnerTotals(row)
      totalSupply += sums.totalSupply
      totalVat += sums.totalVat
      totalAmount += sums.totalAmount
      slipCount += row.slips.length
    }
    return { totalSupply, totalVat, totalAmount, slipCount }
  }, [rows])

  /** "전체 선택" 체크박스 상태. */
  const allSelected
    = rows.length > 0 && rows.every((r) => selected.has(r.partnerCode))
  const partialSelected
    = !allSelected && rows.some((r) => selected.has(r.partnerCode))

  const toggleAll = () => {
    if (allSelected) {
      setSelected(new Set())
    } else {
      setSelected(new Set(rows.map((r) => r.partnerCode)))
    }
  }

  const toggleOne = (partnerCode: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(partnerCode)) {
        next.delete(partnerCode)
      } else {
        next.add(partnerCode)
      }
      return next
    })
  }

  /** 선택 거래처 일괄 인쇄 — partnerCodes query 포함. */
  const handlePrintSelected = () => {
    const codes = [...selected]
    if (codes.length === 0) return
    const params = new URLSearchParams({
      from,
      to,
      partnerCodes: codes.join(','),
    })
    navigate(`/print/statement-batch?${params.toString()}`)
  }

  /** 전체 일괄 인쇄 — partnerCodes 미지정 (= 전체). */
  const handlePrintAll = () => {
    const params = new URLSearchParams({ from, to })
    navigate(`/print/statement-batch?${params.toString()}`)
  }

  return (
    <>
      {/* PR-H4c FE-A: read-only 일괄 인쇄 화면 — 변경 이력은 원본 세금계산서 상세에서 확인 */}
      <AuditInfoBanner
        message="원본 세금계산서의 변경 이력은 각 거래처 row 의 세금계산서 상세 화면에서 확인할 수 있습니다."
        testId="statement-batch-audit-info-banner"
      />

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
        <h3 style={{ margin: 0 }}>거래명세서 일괄 생성</h3>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            flexWrap: 'wrap',
          }}
        >
          <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 13, color: 'var(--color-neutral-600)' }}>
              시작
            </span>
            <input
              type="date"
              value={from}
              max={to}
              onChange={(e) => setFrom(e.target.value)}
              data-testid="statement-batch-from"
            />
          </label>
          <span aria-hidden="true" style={{ color: '#9CA3AF' }}>
            ~
          </span>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 13, color: 'var(--color-neutral-600)' }}>
              종료
            </span>
            <input
              type="date"
              value={to}
              min={from}
              onChange={(e) => setTo(e.target.value)}
              data-testid="statement-batch-to"
            />
          </label>
          <Button
            variant="primary"
            onClick={handlePrintSelected}
            disabled={selected.size === 0}
            data-testid="statement-batch-print-selected"
          >
            선택 거래처 일괄 인쇄 ({selected.size})
          </Button>
          <Button
            variant="ghost"
            onClick={handlePrintAll}
            disabled={rows.length === 0}
            data-testid="statement-batch-print-all"
          >
            전체 일괄 인쇄
          </Button>
        </div>
      </div>

      {!validRange ? (
        <div className="error-banner" role="alert" style={{ marginBottom: 16 }}>
          기간이 올바르지 않습니다. 시작일은 종료일 이전이어야 합니다.
        </div>
      ) : null}

      <div
        style={{
          padding: '12px 16px',
          background: 'var(--color-neutral-50, #F9FAFB)',
          border: '1px solid var(--color-neutral-200, #E5E7EB)',
          borderRadius: 6,
          marginBottom: 16,
          display: 'flex',
          flexWrap: 'wrap',
          gap: 16,
          alignItems: 'center',
          fontSize: 13,
        }}
      >
        <span>
          기간: <strong>{krDate(from)}</strong> ~{' '}
          <strong>{krDate(to)}</strong>
        </span>
        <span aria-hidden="true" style={{ color: '#9CA3AF' }}>
          ·
        </span>
        <span>
          거래처{' '}
          <strong>{rows.length.toLocaleString('ko-KR')}</strong>건 · 전표{' '}
          <strong>{grandTotal.slipCount.toLocaleString('ko-KR')}</strong>건
        </span>
        <span style={{ marginLeft: 'auto' }}>
          합계금액{' '}
          <strong>₩ {krw(grandTotal.totalAmount)}</strong>
        </span>
      </div>

      {query.isLoading ? (
        <div style={{ padding: 24, textAlign: 'center', color: '#6B7280' }}>
          불러오는 중...
        </div>
      ) : null}

      {query.isError ? (
        <div className="error-banner" role="alert" style={{ marginTop: 16 }}>
          거래명세서 데이터를 불러오지 못했습니다. 백엔드 연결을 확인하세요.
        </div>
      ) : null}

      {query.data && rows.length === 0 ? (
        <div
          style={{
            padding: 32,
            textAlign: 'center',
            color: '#6B7280',
            border: '1px dashed var(--color-neutral-300, #D1D5DB)',
            borderRadius: 6,
          }}
        >
          해당 기간 발행된 세금계산서가 없습니다.
        </div>
      ) : null}

      {rows.length > 0 ? (
        <table
          data-testid="statement-batch-table"
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            fontSize: 13,
            background: '#fff',
            border: '1px solid var(--color-neutral-200, #E5E7EB)',
          }}
        >
          <thead>
            <tr
              style={{
                background: 'var(--color-neutral-50, #F9FAFB)',
                borderBottom: '1px solid var(--color-neutral-200, #E5E7EB)',
              }}
            >
              <th style={{ padding: '8px 10px', width: 40, textAlign: 'center' }}>
                <input
                  type="checkbox"
                  checked={allSelected}
                  ref={(el) => {
                    if (el) el.indeterminate = partialSelected
                  }}
                  onChange={toggleAll}
                  aria-label="전체 선택"
                  data-testid="statement-batch-checkbox-all"
                />
              </th>
              <th
                style={{
                  padding: '8px 10px',
                  textAlign: 'left',
                  width: 120,
                }}
              >
                거래처코드
              </th>
              <th style={{ padding: '8px 10px', textAlign: 'left' }}>거래처명</th>
              <th style={{ padding: '8px 10px', textAlign: 'left', width: 200 }}>
                단톡방
              </th>
              <th
                style={{
                  padding: '8px 10px',
                  textAlign: 'right',
                  width: 80,
                }}
              >
                전표
              </th>
              <th
                style={{
                  padding: '8px 10px',
                  textAlign: 'right',
                  width: 130,
                }}
              >
                공급가액
              </th>
              <th
                style={{
                  padding: '8px 10px',
                  textAlign: 'right',
                  width: 110,
                }}
              >
                세액
              </th>
              <th
                style={{
                  padding: '8px 10px',
                  textAlign: 'right',
                  width: 140,
                }}
              >
                합계
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const sums = sumPartnerTotals(row)
              const isChecked = selected.has(row.partnerCode)
              return (
                <tr
                  key={row.partnerCode}
                  data-testid={`statement-batch-row-${row.partnerCode}`}
                  style={{
                    borderBottom: '1px solid #F3F4F6',
                    background: isChecked ? '#EFF6FF' : 'transparent',
                  }}
                >
                  <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => toggleOne(row.partnerCode)}
                      aria-label={`${row.partnerName} 선택`}
                      data-testid={`statement-batch-checkbox-${row.partnerCode}`}
                    />
                  </td>
                  <td style={{ padding: '8px 10px', fontFamily: 'monospace' }}>
                    {row.partnerCode}
                  </td>
                  <td style={{ padding: '8px 10px' }}>{row.partnerName}</td>
                  <td
                    style={{
                      padding: '8px 10px',
                      color: 'var(--color-neutral-600)',
                      fontSize: 12,
                    }}
                  >
                    {row.chatRoomNames.length === 0
                      ? '-'
                      : row.chatRoomNames.join(', ')}
                  </td>
                  <td
                    style={{
                      padding: '8px 10px',
                      textAlign: 'right',
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {row.slips.length.toLocaleString('ko-KR')}건
                  </td>
                  <td
                    style={{
                      padding: '8px 10px',
                      textAlign: 'right',
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    ₩ {krw(sums.totalSupply)}
                  </td>
                  <td
                    style={{
                      padding: '8px 10px',
                      textAlign: 'right',
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    ₩ {krw(sums.totalVat)}
                  </td>
                  <td
                    style={{
                      padding: '8px 10px',
                      textAlign: 'right',
                      fontVariantNumeric: 'tabular-nums',
                      fontWeight: 600,
                    }}
                  >
                    ₩ {krw(sums.totalAmount)}
                  </td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr
              style={{
                background: 'var(--color-neutral-50, #F9FAFB)',
                borderTop: '2px solid var(--color-neutral-200, #E5E7EB)',
                fontWeight: 600,
              }}
            >
              <td colSpan={4} style={{ padding: '8px 10px', textAlign: 'right' }}>
                합계
              </td>
              <td
                style={{
                  padding: '8px 10px',
                  textAlign: 'right',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {grandTotal.slipCount.toLocaleString('ko-KR')}건
              </td>
              <td
                style={{
                  padding: '8px 10px',
                  textAlign: 'right',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                ₩ {krw(grandTotal.totalSupply)}
              </td>
              <td
                style={{
                  padding: '8px 10px',
                  textAlign: 'right',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                ₩ {krw(grandTotal.totalVat)}
              </td>
              <td
                style={{
                  padding: '8px 10px',
                  textAlign: 'right',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                ₩ {krw(grandTotal.totalAmount)}
              </td>
            </tr>
          </tfoot>
        </table>
      ) : null}

      <footer
        style={{
          marginTop: 24,
          padding: '12px 16px',
          fontSize: 12,
          color: 'var(--color-neutral-600)',
          background: 'var(--color-neutral-50, #F9FAFB)',
          borderRadius: 6,
        }}
      >
        ※ 거래명세서는 ISSUED 세금계산서를 거래처별로 그룹핑한 결과입니다.
        다중 선택 후 [선택 거래처 일괄 인쇄] 를 누르면 거래처당 1페이지 분리
        인쇄됩니다 (page-break-after per partner).
      </footer>
    </>
  )
}
