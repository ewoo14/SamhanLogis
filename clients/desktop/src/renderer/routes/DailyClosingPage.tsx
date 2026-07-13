import { useMemo, useState, type CSSProperties } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Badge,
  Button,
  Card,
  DataTable,
  Modal,
  Spinner,
  type DataTableColumn,
} from '@samhan/design-system'
import {
  createDailyClosing,
  DAILY_CLOSING_STATUS_LABEL,
  deriveDailyClosingStatus,
  listDailyClosings,
  reverseDailyClosing,
  type DailyClosing,
  type DailyClosingKind,
  type DailyClosingSourceKind,
} from '../api/accounting'
import {
  getDailyClosingDetail,
  type DailyProductLine,
  type DailyProductRevalidationStatus,
  type DailyTaxInvoiceRow,
} from '../api/closingApi'
import { usePageTitle } from '../hooks/usePageTitle'
import { usePermissions } from '../hooks/usePermissions'
import { today } from '../utils/dateUtils'
import { fmtKrw } from '../utils/currencyUtils'

type ClosingKindFilter = 'ALL' | DailyClosingKind

const KIND_LABEL: Record<ClosingKindFilter, string> = {
  ALL: '통합',
  SALES: '매출',
  PURCHASE: '매입',
}

const SOURCE_LABEL: Record<DailyClosingSourceKind, string> = {
  TAX_INVOICE: '세금계산서',
  SALES_SLIP: '매출전표',
  PURCHASE_SLIP: '매입전표',
}

const REVALIDATION_STATUS_LABEL: Record<DailyProductRevalidationStatus, string> = {
  VERIFIED: '확인',
  NOT_FOUND: '미등록',
  AMBIGUOUS: '모호',
  MISSING_REFERENT: '정가결측',
  NOT_MEASURABLE: '측정불가',
  OUT_OF_SCOPE: '대상외',
}

const inputStyle: CSSProperties = {
  height: 32,
  padding: '0 8px',
  borderRadius: 6,
  border: '1px solid var(--line-default)',
  fontSize: 'var(--font-size-sm)',
  color: 'var(--ink-primary)',
  background: 'var(--surface-card)',
}

const toggleButtonStyle: CSSProperties = {
  height: 32,
  padding: '0 12px',
  borderRadius: 6,
  border: '1px solid var(--line-default)',
  background: 'var(--surface-card)',
  cursor: 'pointer',
}

function fmtTimestamp(iso: string | null | undefined): string {
  if (!iso) return '-'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const hour = String(d.getHours()).padStart(2, '0')
  const minute = String(d.getMinutes()).padStart(2, '0')
  return `${year}-${month}-${day} ${hour}:${minute}`
}

function compatibleSource(kind: DailyClosingKind, source: DailyClosingSourceKind): DailyClosingSourceKind {
  if (kind === 'SALES' && source === 'PURCHASE_SLIP') return 'SALES_SLIP'
  if (kind === 'PURCHASE' && source === 'SALES_SLIP') return 'PURCHASE_SLIP'
  return source
}

function availableSources(kind: ClosingKindFilter): DailyClosingSourceKind[] {
  if (kind === 'ALL') return []
  return kind === 'SALES'
    ? ['TAX_INVOICE', 'SALES_SLIP']
    : ['TAX_INVOICE', 'PURCHASE_SLIP']
}

function fmtNullableKrw(value: number | null): string {
  return value === null ? '—' : fmtKrw(String(value))
}

function fmtRate(value: number | null): string {
  return value === null ? '—' : `${value}%`
}

function rateStyle(value: number | null): CSSProperties {
  if (value === null || value >= 0) return {}
  return { color: 'var(--state-danger)' }
}

export function DailyClosingPage() {
  // [C5 후속 사이클2 D2-FE-001] role 문자열 직접 판정 제거 — BE @RequirePermission 과 1:1 page-code 판정.
  // 실행 = accounting.daily-closing.run CREATE / 잠금 해제(역마감) = accounting.daily-closing.unlock UPDATE.
  const { canAccess } = usePermissions()
  const canExecute = canAccess('accounting.daily-closing.run', 'create')
  const canReverse = canAccess('accounting.daily-closing.unlock', 'update')
  const queryClient = useQueryClient()

  usePageTitle('일마감')

  const [filterDate, setFilterDate] = useState(today())
  const [partnerCode, setPartnerCode] = useState('')
  const [closingKind, setClosingKind] = useState<ClosingKindFilter>('SALES')
  const [sourceKind, setSourceKind] = useState<DailyClosingSourceKind>('TAX_INVOICE')
  const [execDate, setExecDate] = useState(today())
  const [execPartner, setExecPartner] = useState('')
  const [execDescription, setExecDescription] = useState('')
  const [execKind, setExecKind] = useState<DailyClosingKind>('SALES')
  const [execSourceKind, setExecSourceKind] = useState<DailyClosingSourceKind>('TAX_INVOICE')
  const [reverseConfirmRow, setReverseConfirmRow] = useState<DailyClosing | null>(null)

  const queryKind = closingKind === 'ALL' ? undefined : closingKind
  const querySourceKind = closingKind === 'ALL' ? undefined : sourceKind

  const listQuery = useQuery({
    queryKey: ['daily-closings', filterDate, partnerCode, queryKind ?? 'ALL', querySourceKind ?? 'ALL'],
    queryFn: () =>
      listDailyClosings({
        from: filterDate,
        to: filterDate,
        partnerCode: partnerCode.trim() || undefined,
        closingKind: queryKind,
        sourceKind: querySourceKind,
      }),
  })

  const detailQuery = useQuery({
    queryKey: ['daily-closing-detail', filterDate, queryKind, querySourceKind],
    enabled: closingKind !== 'ALL',
    queryFn: () =>
      getDailyClosingDetail(
        filterDate,
        queryKind ?? 'SALES',
        querySourceKind ?? 'TAX_INVOICE',
      ),
  })

  const closeMutation = useMutation({
    mutationFn: () =>
      createDailyClosing({
        closingDate: execDate,
        partnerCode: execPartner.trim() || undefined,
        description: execDescription.trim() || undefined,
        closingKind: execKind,
        sourceKind: compatibleSource(execKind, execSourceKind),
      }),
    onSuccess: () => {
      setExecDescription('')
      void queryClient.invalidateQueries({ queryKey: ['daily-closings'] })
      void queryClient.invalidateQueries({ queryKey: ['daily-closing-detail'] })
    },
  })

  const reverseMutation = useMutation({
    mutationFn: (row: DailyClosing) =>
      reverseDailyClosing(row.closingDate, row.partnerCode, row.closingKind, row.sourceKind),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['daily-closings'] })
      void queryClient.invalidateQueries({ queryKey: ['daily-closing-detail'] })
    },
  })

  const columns: DataTableColumn<DailyClosing>[] = useMemo(
    () => [
      { key: 'closingDate', header: '마감일', width: '110px' },
      {
        key: 'kind',
        header: '종류',
        width: '110px',
        render: (row) => KIND_LABEL[row.closingKind ?? 'SALES'],
      },
      {
        key: 'source',
        header: '원천',
        width: '120px',
        render: (row) => SOURCE_LABEL[row.sourceKind ?? 'TAX_INVOICE'],
      },
      {
        key: 'bizNo',
        header: '거래처코드',
        width: '130px',
        render: (row) => row.bizNo?.replace(/\D/g, '') || '—',
      },
      {
        key: 'isLocked',
        header: '상태',
        width: '80px',
        render: (row) => {
          const status = deriveDailyClosingStatus(row.isLocked)
          return (
            <Badge variant={row.isLocked ? 'danger' : 'success'}>
              {DAILY_CLOSING_STATUS_LABEL[status]}
            </Badge>
          )
        },
      },
      {
        key: 'totalSupply',
        header: '공급가',
        width: '120px',
        align: 'right',
        render: (row) => fmtKrw(row.totalSupply),
      },
      {
        key: 'totalVat',
        header: '부가세',
        width: '120px',
        align: 'right',
        render: (row) => fmtKrw(row.totalVat),
      },
      {
        key: 'totalAmount',
        header: '합계',
        width: '120px',
        align: 'right',
        render: (row) => fmtKrw(row.totalAmount),
      },
      {
        key: 'slipCount',
        header: '건수',
        width: '80px',
        align: 'right',
        render: (row) => row.slipCount.toLocaleString(),
      },
      {
        key: 'lockedAt',
        header: '마감 시각',
        width: '140px',
        render: (row) => fmtTimestamp(row.lockedAt),
      },
      {
        key: 'reverseAction',
        header: '',
        width: '100px',
        render: (row) =>
          row.isLocked && canReverse ? (
            <Button
              variant="ghost"
              size="sm"
              data-testid={`daily-closing-reverse-button-${row.closingDate}-${row.closingKind}-${row.sourceKind}`}
              onClick={() => setReverseConfirmRow(row)}
              disabled={reverseMutation.isPending}
            >
              역마감
            </Button>
          ) : null,
      },
    ],
    [canReverse, reverseMutation.isPending],
  )

  const detailColumns: DataTableColumn<DailyTaxInvoiceRow>[] = [
    {
      key: 'taxInvoiceNo',
      header: '세금계산서',
      width: '150px',
      render: (row) => row.taxInvoiceNo || '-',
    },
    {
      key: 'salesSlipNo',
      header: '매출전표',
      width: '150px',
      render: (row) => row.salesSlipNo || '-',
    },
    {
      key: 'sourceSlipNo',
      header: '원천전표',
      width: '150px',
      render: (row) => row.sourceSlipNo || '-',
    },
    {
      key: 'bizNo',
      header: '거래처코드',
      width: '130px',
      render: (row) => row.bizNo?.replace(/\D/g, '') || '-',
    },
    { key: 'partnerName', header: '거래처' },
    {
      key: 'supplyAmount',
      header: '공급가',
      width: '120px',
      align: 'right',
      render: (row) => fmtKrw(row.supplyAmount),
    },
    {
      key: 'totalAmount',
      header: '합계',
      width: '120px',
      align: 'right',
      render: (row) => fmtKrw(row.totalAmount),
    },
  ]

  const productRows = useMemo(
    () => (detailQuery.data?.productSummaries ?? []).map((row, index) => ({ ...row, rowIndex: index })),
    [detailQuery.data?.productSummaries],
  )

  const productColumns: DataTableColumn<DailyProductLine>[] = [
    {
      key: 'productName',
      header: '품명',
      align: 'left',
      render: (row) => row.productName,
    },
    {
      key: 'modelName',
      header: '모델',
      align: 'left',
      render: (row) => row.modelName ?? '—',
    },
    {
      key: 'quantity',
      header: '수량',
      width: '90px',
      align: 'right',
      render: (row) => row.quantity.toLocaleString(),
    },
    {
      key: 'supplyAmount',
      header: '공급가',
      width: '120px',
      align: 'right',
      render: (row) => fmtKrw(String(row.supplyAmount)),
    },
    {
      key: 'releasePrice',
      header: '출고가',
      width: '120px',
      align: 'right',
      render: (row) => fmtNullableKrw(row.releasePrice),
    },
    {
      key: 'deliveryPrice',
      header: '납품가',
      width: '120px',
      align: 'right',
      render: (row) => fmtNullableKrw(row.deliveryPrice),
    },
    {
      key: 'expectedRate',
      header: '기대율',
      width: '90px',
      align: 'right',
      render: (row) => fmtRate(row.expectedRate),
    },
    {
      key: 'actualRate',
      header: '할인율',
      width: '90px',
      align: 'right',
      render: (row) => (
        <span style={rateStyle(row.actualRate)}>
          {fmtRate(row.actualRate)}
        </span>
      ),
    },
    {
      key: 'verified',
      header: '확인',
      width: '116px',
      align: 'center',
      render: (row) => {
        const badge =
          row.verified === true ? (
            <Badge variant="success">확인</Badge>
          ) : row.verified === false ? (
            <Badge variant="danger">불일치</Badge>
          ) : (
            <Badge variant="neutral">판정불가</Badge>
          )

        return (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}>
            {badge}
            {closingKind === 'PURCHASE' ? (
              <span
                aria-label="판매(출고) 기준 참고값"
                title="판매(출고) 기준 참고값"
                style={{ fontSize: 11, color: 'var(--ink-secondary, #5C6773)' }}
              >
                참고
              </span>
            ) : null}
          </span>
        )
      },
    },
    {
      key: 'revalidationStatus',
      header: '사유',
      width: '100px',
      align: 'center',
      // VERIFIED(확인/불일치 판정완료)는 확인 컬럼 배지가 판정을 전달하므로 사유는 '—'.
      // 사유 컬럼은 판정불가(verified=null) 상태의 사유 구분 전용(NOT_FOUND/AMBIGUOUS 등).
      render: (row) =>
        row.revalidationStatus && row.revalidationStatus !== 'VERIFIED'
          ? REVALIDATION_STATUS_LABEL[row.revalidationStatus]
          : '—',
    },
  ]

  const sourceButtons = availableSources(closingKind)
  const execSourceButtons = availableSources(execKind)
  const showProductRevalidation = closingKind !== 'ALL'

  return (
    <div data-testid="daily-closing-page">
      <Card style={{ marginBottom: 16 }}>
        <h3 style={{ margin: '0 0 12px' }}>일마감 조회</h3>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <label>
            대상일&nbsp;
            <input
              type="date"
              value={filterDate}
              onChange={(e) => setFilterDate(e.target.value)}
              data-testid="daily-closing-filter-date"
              style={inputStyle}
            />
          </label>
          <label>
            거래처 코드&nbsp;
            <input
              value={partnerCode}
              onChange={(e) => setPartnerCode(e.target.value)}
              placeholder="선택"
              data-testid="daily-closing-filter-partner"
              style={{ ...inputStyle, width: 140 }}
            />
          </label>
          <div data-testid="closing-kind-toggle" role="radiogroup" aria-label="마감 종류">
            {(['ALL', 'SALES', 'PURCHASE'] as ClosingKindFilter[]).map((kind) => (
              <button
                key={kind}
                type="button"
                role="radio"
                aria-checked={closingKind === kind}
                onClick={() => {
                  setClosingKind(kind)
                  if (kind !== 'ALL') setSourceKind((prev) => compatibleSource(kind, prev))
                }}
                style={{
                  ...toggleButtonStyle,
                  background: closingKind === kind ? 'var(--surface-selected)' : toggleButtonStyle.background,
                }}
              >
                {KIND_LABEL[kind]}
              </button>
            ))}
          </div>
          {sourceButtons.length > 0 ? (
            <div style={{ display: 'flex', gap: 6 }}>
              {sourceButtons.map((source) => (
                <button
                  key={source}
                  type="button"
                  onClick={() => setSourceKind(source)}
                  style={{
                    ...toggleButtonStyle,
                    background: sourceKind === source ? 'var(--surface-selected)' : toggleButtonStyle.background,
                  }}
                >
                  {SOURCE_LABEL[source]}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </Card>

      <Card style={{ marginBottom: 16 }}>
        <h3 style={{ margin: '0 0 12px' }}>일마감 실행</h3>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            type="date"
            value={execDate}
            onChange={(e) => setExecDate(e.target.value)}
            data-testid="daily-closing-exec-date"
            style={inputStyle}
          />
          <select
            value={execKind}
            onChange={(e) => {
              const next = e.target.value as DailyClosingKind
              setExecKind(next)
              setExecSourceKind((prev) => compatibleSource(next, prev))
            }}
            style={inputStyle}
          >
            <option value="SALES">매출</option>
            <option value="PURCHASE">매입</option>
          </select>
          <select
            value={compatibleSource(execKind, execSourceKind)}
            onChange={(e) => setExecSourceKind(e.target.value as DailyClosingSourceKind)}
            style={inputStyle}
          >
            {execSourceButtons.map((source) => (
              <option key={source} value={source}>
                {SOURCE_LABEL[source]}
              </option>
            ))}
          </select>
          <input
            type="text"
            value={execPartner}
            onChange={(e) => setExecPartner(e.target.value)}
            placeholder="거래처 코드 선택"
            data-testid="daily-closing-exec-partner"
            style={{ ...inputStyle, width: 160 }}
          />
          <input
            type="text"
            value={execDescription}
            onChange={(e) => setExecDescription(e.target.value)}
            placeholder="메모"
            data-testid="daily-closing-exec-description"
            style={{ ...inputStyle, width: 220 }}
          />
          <Button
            variant="primary"
            data-testid="daily-closing-exec-button"
            onClick={() => closeMutation.mutate()}
            disabled={!canExecute || closeMutation.isPending || !execDate}
          >
            {closeMutation.isPending ? '처리 중' : '마감 실행'}
          </Button>
        </div>
        {!canExecute ? (
          <p style={{ margin: '8px 0 0', color: 'var(--state-danger)', fontSize: 12 }}>
            일마감 실행 권한이 없습니다 — 일마감 실행 권한 보유자만 가능합니다.
          </p>
        ) : null}
        {closeMutation.isError ? (
          <div className="error-banner" role="alert" style={{ marginTop: 8 }}>
            일마감 실행에 실패했습니다.
          </div>
        ) : null}
      </Card>

      <Card style={{ marginBottom: 16 }}>
        <h3 style={{ margin: '0 0 12px' }}>마감 이력</h3>
        {listQuery.isLoading ? (
          <div style={{ display: 'grid', placeItems: 'center', minHeight: 140 }}>
            <Spinner size="lg" label="마감 이력 로딩 중" />
          </div>
        ) : listQuery.isError ? (
          <div className="error-banner" role="alert">마감 이력을 불러오지 못했습니다.</div>
        ) : (
          <div data-testid="daily-closing-list-table">
            <DataTable
              columns={columns}
              rows={listQuery.data?.content ?? []}
              rowKey={(row) => `${row.closingDate}-${row.partnerCode ?? 'ALL'}-${row.closingKind}-${row.sourceKind}`}
              emptyMessage="해당 일자의 일마감 이력이 없습니다."
            />
          </div>
        )}
      </Card>

      <Card>
        <h3 style={{ margin: '0 0 12px' }}>Daily Detail</h3>
        {closingKind === 'ALL' ? (
          <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-secondary)' }}>
            통합 조회에서는 이력만 표시합니다. 상세는 매출 또는 매입을 선택해 확인하세요.
          </p>
        ) : detailQuery.isLoading ? (
          <div style={{ display: 'grid', placeItems: 'center', minHeight: 120 }}>
            <Spinner size="lg" label="상세 로딩 중" />
          </div>
        ) : detailQuery.isError ? (
          <div className="error-banner" role="alert">Daily Detail을 불러오지 못했습니다.</div>
        ) : (
          <>
            <DataTable
              columns={detailColumns}
              rows={detailQuery.data?.taxInvoices ?? []}
              rowKey={(row) => `${row.taxInvoiceNo ?? ''}-${row.salesSlipNo ?? ''}-${row.sourceSlipNo ?? ''}-${row.partnerName}`}
              emptyMessage="상세 전표가 없습니다."
            />
            {showProductRevalidation ? (
              <div style={{ marginTop: 16 }}>
                <h4 style={{ margin: '0 0 4px', fontSize: 14 }}>모델별 재검증</h4>
                {closingKind === 'PURCHASE' ? (
                  <div
                    role="note"
                    style={{
                      margin: '0 0 8px',
                      padding: '8px 12px',
                      fontSize: 12,
                      background: 'var(--color-warning-50, #FEF6E7)',
                      color: 'var(--color-warning-800, #8C5C13)',
                      border: '1px solid var(--color-warning-300, #F1C268)',
                      borderRadius: 6,
                    }}
                  >
                    매입 재검증은 <b>판매(출고) 기준 참고용</b>입니다. 정식 매입단가 감사가 아닙니다.
                    모델·일 합계 평균 기준 새니티 체크이며 개별 라인 단위 판정이 아닙니다.
                  </div>
                ) : (
                  <p style={{ margin: '0 0 8px', fontSize: 12, color: 'var(--ink-secondary, #5C6773)' }}>
                    모델·일 합계 평균 기준 새니티 체크입니다. 개별 라인 단위 판정이 아닙니다.
                  </p>
                )}
                <DataTable
                  columns={productColumns}
                  rows={productRows}
                  rowKey={(row) => `${row.productName}-${row.rowIndex}`}
                  emptyMessage="모델별 재검증 결과가 없습니다."
                />
              </div>
            ) : null}
          </>
        )}
      </Card>

      <Modal
        open={reverseConfirmRow !== null}
        onClose={() => setReverseConfirmRow(null)}
        title="역마감 확인"
        size="sm"
        closeOnBackdropClick={false}
        footer={
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <Button variant="ghost" size="sm" onClick={() => setReverseConfirmRow(null)}>
              취소
            </Button>
            <Button
              variant="primary"
              size="sm"
              data-testid="daily-closing-reverse-confirm-button"
              disabled={reverseMutation.isPending}
              onClick={() => {
                if (reverseConfirmRow) {
                  reverseMutation.mutate(reverseConfirmRow)
                  setReverseConfirmRow(null)
                }
              }}
            >
              {reverseMutation.isPending ? '처리 중' : '역마감'}
            </Button>
          </div>
        }
      >
        {reverseConfirmRow ? (
          <p style={{ margin: 0, fontSize: 13 }}>
            {reverseConfirmRow.closingDate} {KIND_LABEL[reverseConfirmRow.closingKind]}{' '}
            {SOURCE_LABEL[reverseConfirmRow.sourceKind]} 마감을 해제합니다.
          </p>
        ) : null}
      </Modal>
    </div>
  )
}
