/**
 * 라인 입력 참조 조회 모달 — RC9 lookup 3종.
 *
 * <h2>역할</h2>
 * <p>견적/주문 라인 입력 시 자재 단가, 추천 실외기, 분지관 코드를 읽기전용 표로 참조한다.
 *
 * <h2>UUID 비공개 가드</h2>
 * <p>product-service lookup 응답은 UUID/id 없이 비즈니스 식별자만 노출한다.
 * React key 역시 materialKey / branchCode / recommendation tuple 만 사용한다.
 *
 * <h2>design-system 재사용</h2>
 * Modal / Button (자체 신규 컴포넌트 작성 금지).
 */
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button, Modal } from '@samhan/design-system'
import {
  listBranchPipes,
  listMaterialPrices,
  listOduRecommendations,
  type BranchPipeRow,
  type MaterialPriceRow,
  type OduRecommendationRow,
} from '../../api/sales'

interface Props {
  open: boolean
  onClose: () => void
}

type LookupTab = 'material' | 'odu' | 'branch'

const TAB_LABEL: Record<LookupTab, string> = {
  material: '자재 단가',
  odu: '추천 실외기',
  branch: '분지관',
}

const tableStyle = {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: 13,
} satisfies CSSProperties

const thStyle = {
  padding: '8px 12px',
  background: 'var(--surface-subtle, #F4F6F8)',
  borderBottom: '1px solid var(--line-default, #E5E7EB)',
  textAlign: 'left',
  fontWeight: 600,
  whiteSpace: 'nowrap',
} satisfies CSSProperties

const tdStyle = {
  padding: '8px 12px',
  borderBottom: '1px solid var(--line-default, #E5E7EB)',
  verticalAlign: 'top',
} satisfies CSSProperties

function formatNumber(value: number | null): string {
  if (value == null) return '-'
  return value.toLocaleString('ko-KR')
}

function renderEmpty() {
  return (
    <div
      style={{
        textAlign: 'center',
        padding: '32px 0',
        color: 'var(--ink-tertiary)',
        fontSize: 13,
      }}
    >
      데이터 없음(시드 전)
    </div>
  )
}

function MaterialPriceTable({ rows }: { rows: MaterialPriceRow[] }) {
  if (rows.length === 0) return renderEmpty()
  return (
    <TableRegion label="자재 단가 목록">
      <table style={tableStyle}>
        <thead>
          <tr>
            <th scope="col" style={thStyle}>자재 키</th>
            <th scope="col" style={thStyle}>자재명</th>
            <th scope="col" style={{ ...thStyle, textAlign: 'right' }}>단가</th>
            <th scope="col" style={thStyle}>옵션</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.materialKey}>
              <td style={tdStyle}>{row.materialKey}</td>
              <td style={tdStyle}>{row.name}</td>
              <td style={{ ...tdStyle, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                {formatNumber(row.price)}
              </td>
              <td style={tdStyle}>{row.optionLabel ?? '-'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </TableRegion>
  )
}

function OduRecommendationTable({ rows }: { rows: OduRecommendationRow[] }) {
  if (rows.length === 0) return renderEmpty()
  return (
    <TableRegion label="추천 실외기 목록">
      <table style={tableStyle}>
        <thead>
          <tr>
            <th scope="col" style={thStyle}>추천 타입</th>
            <th scope="col" style={{ ...thStyle, textAlign: 'right' }}>실내기 용량</th>
            <th scope="col" style={{ ...thStyle, textAlign: 'right' }}>실내기 대수</th>
            <th scope="col" style={thStyle}>실외기 마력</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={`${row.recommendationType}:${row.indoorCapacity}:${row.indoorCount}`}
            >
              <td style={tdStyle}>{row.recommendationType}</td>
              <td style={{ ...tdStyle, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                {formatNumber(row.indoorCapacity)}
              </td>
              <td style={{ ...tdStyle, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                {formatNumber(row.indoorCount)}
              </td>
              <td style={tdStyle}>{row.outdoorHp}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </TableRegion>
  )
}

function BranchPipeTable({ rows }: { rows: BranchPipeRow[] }) {
  if (rows.length === 0) return renderEmpty()
  return (
    <TableRegion label="분지관 목록">
      <table style={tableStyle}>
        <thead>
          <tr>
            <th scope="col" style={thStyle}>분지관 코드</th>
            <th scope="col" style={thStyle}>설명</th>
            <th scope="col" style={{ ...thStyle, textAlign: 'right' }}>합계 수량</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.branchCode}>
              <td style={tdStyle}>{row.branchCode}</td>
              <td style={tdStyle}>{row.description ?? '-'}</td>
              <td style={{ ...tdStyle, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                {formatNumber(row.summaryQty)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </TableRegion>
  )
}

function TableRegion({
  label,
  children,
}: {
  label: string
  children: ReactNode
}) {
  return (
    <div
      role="region"
      aria-label={label}
      style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}
    >
      {children}
    </div>
  )
}

export function LineLookupReferenceModal({ open, onClose }: Props) {
  const [activeTab, setActiveTab] = useState<LookupTab>('material')

  useEffect(() => {
    if (open) setActiveTab('material')
  }, [open])

  const materialQuery = useQuery({
    queryKey: ['line-lookup', 'material-prices'],
    queryFn: listMaterialPrices,
    enabled: open && activeTab === 'material',
    staleTime: 30_000,
  })

  const oduQuery = useQuery({
    queryKey: ['line-lookup', 'odu-recommendations'],
    queryFn: () => listOduRecommendations(),
    enabled: open && activeTab === 'odu',
    staleTime: 30_000,
  })

  const branchQuery = useQuery({
    queryKey: ['line-lookup', 'branch-pipes'],
    queryFn: () => listBranchPipes(),
    enabled: open && activeTab === 'branch',
    staleTime: 30_000,
  })

  const activeQuery =
    activeTab === 'material'
      ? materialQuery
      : activeTab === 'odu'
        ? oduQuery
        : branchQuery

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="참조 조회"
      description="라인 입력에 필요한 기준 데이터를 확인합니다."
      size="xl"
      footer={
        <Button variant="secondary" size="sm" onClick={onClose}>
          닫기
        </Button>
      }
    >
      <div
        data-testid="line-lookup-modal"
        style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
      >
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Button
            type="button"
            size="sm"
            variant={activeTab === 'material' ? 'secondary' : 'ghost'}
            data-testid="line-lookup-tab-material"
            onClick={() => setActiveTab('material')}
          >
            {TAB_LABEL.material}
          </Button>
          <Button
            type="button"
            size="sm"
            variant={activeTab === 'odu' ? 'secondary' : 'ghost'}
            data-testid="line-lookup-tab-odu"
            onClick={() => setActiveTab('odu')}
          >
            {TAB_LABEL.odu}
          </Button>
          <Button
            type="button"
            size="sm"
            variant={activeTab === 'branch' ? 'secondary' : 'ghost'}
            data-testid="line-lookup-tab-branch"
            onClick={() => setActiveTab('branch')}
          >
            {TAB_LABEL.branch}
          </Button>
        </div>

        {activeQuery.isPending ? (
          <div
            role="status"
            aria-busy="true"
            style={{
              textAlign: 'center',
              padding: '32px 0',
              color: 'var(--ink-secondary)',
              fontSize: 14,
              minHeight: 160,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            참조 데이터를 불러오는 중…
          </div>
        ) : null}

        {activeQuery.isError ? (
          <div
            role="alert"
            style={{
              padding: '12px 16px',
              borderRadius: 6,
              background: 'var(--state-danger-bg, #FEE2E2)',
              border: '1px solid var(--state-danger, #EF4444)',
              color: 'var(--state-danger, #EF4444)',
              fontSize: 13,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
            }}
          >
            <span>참조 데이터 조회 중 오류가 발생했습니다.</span>
            <Button variant="secondary" size="sm" onClick={() => activeQuery.refetch()}>
              다시 시도
            </Button>
          </div>
        ) : null}

        {activeQuery.isSuccess && activeTab === 'material' ? (
          <MaterialPriceTable rows={materialQuery.data ?? []} />
        ) : null}
        {activeQuery.isSuccess && activeTab === 'odu' ? (
          <OduRecommendationTable rows={oduQuery.data ?? []} />
        ) : null}
        {activeQuery.isSuccess && activeTab === 'branch' ? (
          <BranchPipeTable rows={branchQuery.data ?? []} />
        ) : null}
      </div>
    </Modal>
  )
}
