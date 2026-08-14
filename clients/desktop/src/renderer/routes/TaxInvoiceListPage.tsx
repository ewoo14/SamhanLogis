/**
 * 세금계산서 목록 화면 — `/accounting/tax-invoices` (P0-4 #1).
 *
 * <p>매뉴얼 출처: {@code docs/manual/03-회계/03-세금계산서.md}.
 *
 * <p>필터:
 * <ul>
 *   <li>status — DRAFT / ISSUED / CANCELLED (전체)</li>
 *   <li>기간 — supplyDate from/to (date-range)</li>
 *   <li>partner — 거래처명 부분 매칭 (BE 검색 미지원이라 client-side 필터)</li>
 * </ul>
 *
 * <p>컬럼: 세금계산서번호 / 거래처 코드 / 거래처 / 작성일 / 공급가액 / 세액 / 합계 / 상태.
 * UUID 비공개 가드 — id 컬럼 미포함, 사용자 노출은 taxInvoiceNo + partnerName 만.
 *
 * <p>권한 — RoleGuard 가 ACCOUNTANT / MASTER 만 통과 (라우팅 단계).
 */
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  Badge,
  Button,
  DataTable,
  Input,
  type DataTableColumn,
} from '@samhan/design-system'
import {
  TAX_INVOICE_STATUS_LABEL,
  listTaxInvoices,
  type TaxInvoiceStatus,
  type TaxInvoiceSummary,
} from '../api/taxInvoiceApi'
import { usePageTitle } from '../hooks/usePageTitle'
import { usePermissions } from '../hooks/usePermissions'
import { DocumentNumberLink } from '../components/DocumentNumberLink'

const STATUS_OPTIONS: Array<{ value: TaxInvoiceStatus | ''; label: string }> = [
  { value: '', label: '전체' },
  { value: 'DRAFT', label: '임시저장' },
  { value: 'ISSUED', label: '발행' },
  { value: 'CANCELLED', label: '취소' },
]

const STATUS_VARIANT: Record<TaxInvoiceStatus, 'neutral' | 'success' | 'danger'> = {
  DRAFT: 'neutral',
  ISSUED: 'success',
  CANCELLED: 'danger',
}

/** KRW BigDecimal string → 천단위 콤마 + ₩ prefix. */
const fmtKrw = (raw: string): string => {
  const n = Number.parseFloat(raw)
  if (!Number.isFinite(n)) return raw
  return '₩' + Math.trunc(n).toLocaleString('ko-KR')
}

export function TaxInvoiceListPage() {
  const navigate = useNavigate()
  const { canAccess } = usePermissions()

  usePageTitle('세금계산서')

  const [statusFilter, setStatusFilter] = useState<TaxInvoiceStatus | ''>('')
  const [from, setFrom] = useState<string>('')
  const [to, setTo] = useState<string>('')
  const [partnerKeyword, setPartnerKeyword] = useState<string>('')

  const query = useQuery({
    queryKey: ['accounting', 'tax-invoices', 'list', statusFilter, from, to],
    queryFn: () =>
      listTaxInvoices({
        page: 0,
        size: 50,
        ...(statusFilter ? { status: statusFilter } : {}),
        ...(from ? { from } : {}),
        ...(to ? { to } : {}),
      }),
  })

  /** client-side 거래처명 부분 매칭 (BE 가 partnerName 검색 미지원). */
  const filteredRows = useMemo(() => {
    const rows = query.data?.content ?? []
    const kw = partnerKeyword.trim().toLowerCase()
    if (!kw) return rows
    return rows.filter((r) => r.partnerName.toLowerCase().includes(kw))
  }, [query.data?.content, partnerKeyword])

  const columns: DataTableColumn<TaxInvoiceSummary>[] = [
    {
      key: 'taxInvoiceNo',
      header: '세금계산서번호',
      width: '180px',
      mobilePriority: 'primary',
      render: (row) => (
        <DocumentNumberLink
          number={row.taxInvoiceNo}
          to={row.id ? `/accounting/tax-invoices/${row.id}` : ''}
          detailWindow={row.id ? { documentType: 'TAX_INVOICE', documentId: row.id } : undefined}
        />
      ),
    },
    {
      key: 'partnerBusinessNo',
      header: '거래처 코드',
      width: '140px',
      mobilePriority: 'hidden',
      render: (row) => (
        <span style={{ fontVariantNumeric: 'tabular-nums' }}>
          {row.partnerBusinessNo ? row.partnerBusinessNo.replace(/\D/g, '') : '—'}
        </span>
      ),
    },
    {
      key: 'partnerName',
      header: '거래처',
      mobilePriority: 'secondary',
      render: (row) => row.partnerName,
    },
    {
      key: 'supplyAmount',
      header: '공급가액',
      width: '140px',
      align: 'right',
      mobilePriority: 'hidden',
      render: (row) => fmtKrw(row.supplyAmount),
    },
    {
      key: 'vatAmount',
      header: '세액',
      width: '120px',
      align: 'right',
      mobilePriority: 'hidden',
      render: (row) => fmtKrw(row.vatAmount),
    },
    {
      key: 'totalAmount',
      header: '합계',
      width: '140px',
      align: 'right',
      mobilePriority: 'secondary',
      render: (row) => (
        <strong style={{ fontVariantNumeric: 'tabular-nums' }}>
          {fmtKrw(row.totalAmount)}
        </strong>
      ),
    },
    {
      key: 'legacyReadOnly',
      header: '연결 상태',
      width: '130px',
      mobilePriority: 'secondary',
      render: (row) => row.legacyReadOnly ? (
        <Badge variant="neutral" data-testid="tax-invoice-legacy-read-only">
          읽기 전용
        </Badge>
      ) : (
        <span style={{ color: '#087443' }}>생성 가능</span>
      ),
    },
    {
      key: 'status',
      header: '상태',
      width: '100px',
      mobilePriority: 'secondary',
      render: (row) => (
        <Badge variant={STATUS_VARIANT[row.status]}>
          {TAX_INVOICE_STATUS_LABEL[row.status]}
        </Badge>
      ),
    },
  ]

  const canCreate = canAccess('accounting.tax-invoice.list', 'create')

  return (
    <>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-end',
          gap: 16,
          marginBottom: 16,
          flexWrap: 'wrap',
        }}
      >
        <h3 style={{ margin: 0 }}>세금계산서</h3>
        <div style={{ display: 'flex', gap: 8 }}>
          {/* GAS 이식 — 홈택스 일괄 양식 5탭 페이지 진입 (ACCOUNTANT / MANAGER / MASTER). URL: /accounting/hometax-export */}
          <Button
            variant="secondary"
            onClick={() => navigate('/accounting/hometax-export')}
            data-testid="tax-invoice-batch-button"
          >
            일괄 발행 (홈택스 양식)
          </Button>
          {canCreate ? (
            <Button
              variant="primary"
              onClick={() => navigate('/accounting/tax-invoices/new')}
              data-testid="tax-invoice-new-button"
            >
              신규 작성
            </Button>
          ) : null}
        </div>
      </div>

      {/* 필터 영역 */}
      <div
        style={{
          display: 'flex',
          gap: 12,
          marginBottom: 16,
          flexWrap: 'wrap',
          alignItems: 'flex-end',
        }}
        data-testid="tax-invoice-list-filter"
      >
        <label style={{ fontSize: 13, color: '#374151' }}>
          상태
          <br />
          <select
            value={statusFilter}
            onChange={(e) =>
              setStatusFilter(e.target.value as TaxInvoiceStatus | '')
            }
            style={{
              height: 36,
              padding: '0 8px',
              borderRadius: 6,
              border: '1px solid #D1D5DB',
              fontSize: 13,
              minWidth: 120,
            }}
            data-testid="tax-invoice-list-filter-status"
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <Input
          label="기간 (시작)"
          type="date"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          fullWidth={false}
          data-testid="tax-invoice-list-filter-from"
        />
        <Input
          label="기간 (종료)"
          type="date"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          fullWidth={false}
          data-testid="tax-invoice-list-filter-to"
        />
        <Input
          label="거래처명"
          placeholder="거래처명 부분 검색"
          value={partnerKeyword}
          onChange={(e) => setPartnerKeyword(e.target.value)}
          fullWidth={false}
          data-testid="tax-invoice-list-filter-partner"
        />
      </div>

      <div data-testid="tax-invoice-list-table">
        <DataTable
          columns={columns}
          rows={filteredRows}
          loading={query.isLoading}
          rowKey={(r) => r.id}
          onRowClick={(r) => navigate(`/accounting/tax-invoices/${r.id}`)}
          emptyMessage="등록된 세금계산서가 없습니다."
        />
      </div>

      {query.isError ? (
        <div className="error-banner" role="alert" style={{ marginTop: 16 }}>
          세금계산서 목록을 불러오지 못했습니다. 백엔드 연결을 확인하세요.
        </div>
      ) : null}
    </>
  )
}
