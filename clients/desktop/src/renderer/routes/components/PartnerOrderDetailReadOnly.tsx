import { Badge, Card } from '@samhan/design-system'
import type { ReactNode } from 'react'
import type { PartnerOrderDetail } from '../../api/sales'
import styles from '../../components/sales/sales.module.css'

const krw = (value: number) => new Intl.NumberFormat('ko-KR').format(value)
const empty = (value: string | null | undefined) => value || '-'
const displayOrderNumber = (value: string) => value.replace(/^(\d{4})-(\d{2})-(\d{2})-/, '$1/$2/$3-')
const firstNonBlank = (...values: Array<string | null | undefined>) =>
  values.find((value) => typeof value === 'string' && value.trim().length > 0) ?? '-'

/**
 * 주문서 상세의 표시 본문. 라우트의 편집/전환 제어와 분리해 병합 승인 전에도
 * 평소 상세 화면과 같은 헤더·상세 필드·라인 표를 사용한다.
 */
type PartnerOrderDetailReadOnlyProps = {
  order: PartnerOrderDetail
  statusBadge?: ReactNode
  selectedLineIds?: ReadonlySet<string>
  onToggleLine?: (lineId: string) => void
  onToggleAllLines?: (selected: boolean) => void
  onInventoryLookup?: () => void
  onLineLookup?: () => void
  onClearSelection?: () => void
  canViewProductLookups?: boolean
  /** 병합 승인 미리보기에서 품목별 원 주문번호를 같은 표 안에 표시한다. */
  renderLineSource?: (line: PartnerOrderDetail['lines'][number]) => ReactNode
}

const statusLabel = (status: string) => {
  if (status === 'DRAFT') return '접수'
  if (status === 'CONVERTED' || status === 'CONFIRMED') return '완료'
  if (status === 'ON_HOLD') return '보류'
  if (status === 'CONFIRMING') return '접수'
  return status
}

export function PartnerOrderDetailReadOnly({
  order,
  statusBadge,
  selectedLineIds,
  onToggleLine,
  onToggleAllLines,
  onInventoryLookup,
  onLineLookup,
  onClearSelection,
  canViewProductLookups = false,
  renderLineSource,
}: PartnerOrderDetailReadOnlyProps) {
  const interactive = selectedLineIds !== undefined && onToggleLine && onToggleAllLines
  const selectedCount = selectedLineIds?.size ?? 0
  return (
    <div data-testid="partner-order-detail-read-only">
      <Card padding={4} shadow="sm">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <h4 style={{ margin: 0 }}>거래처 · {firstNonBlank(order.partnerName, order.partnerCode)}</h4>
            <Badge variant={order.status === 'CONVERTED' || order.status === 'CONFIRMED' ? 'success' : 'warning'}>
              {statusLabel(order.status)}
            </Badge>
            {statusBadge}
          </div>
          <strong style={{ fontVariantNumeric: 'tabular-nums' }}>합계 {krw(order.totalAmount)}원</strong>
        </div>
        <div className="detail-grid">
          {[
            ['거래처 코드', order.partnerCode],
            ['연결 전표', order.linkedSlipNo],
            ['배송지', order.deliveryAddress],
            ['현장', order.siteAddress],
            ['연락처', order.contactPhone],
            ['납기', order.dueDate],
            ['요청사항', order.memo],
          ].map(([label, value]) => (
            <div key={label}>
              <span className="detail-label">{label}</span>
              <span className="detail-value">{empty(value)}</span>
            </div>
          ))}
        </div>
      </Card>

      <Card padding={4} shadow="sm" style={{ marginTop: 24 }}>
        <div className="detail-mobile-hide" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h4 style={{ margin: 0 }}>라인 ({order.lines.length}건)</h4>
          {interactive ? (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <button type="button" disabled={selectedCount === 0} onClick={onInventoryLookup} data-testid="partner-order-inventory-lookup-btn">
                선택 품목 재고조회{selectedCount > 0 ? ` (${selectedCount})` : ''}
              </button>
              {canViewProductLookups ? <button type="button" onClick={onLineLookup} data-testid="partner-order-line-lookup-btn">참조 조회</button> : null}
              {selectedCount > 0 ? <button type="button" onClick={onClearSelection}>선택 해제</button> : null}
            </div>
          ) : null}
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table className={`${styles['estTable']} ${styles['orderLineTable']}`}>
            <thead>
              <tr>
                <th style={{ width: 28, textAlign: 'center' }}>
                  {interactive ? (
                    <input
                      type="checkbox"
                      aria-label="전체 선택"
                      disabled={order.lines.length === 0}
                      checked={order.lines.length > 0 && order.lines.every((line) => selectedLineIds?.has(line.lineId))}
                      onChange={(event) => onToggleAllLines?.(event.target.checked)}
                    />
                  ) : '선택'}
                </th>
                <th>품목명</th>
                <th>모델명</th>
                <th>수량</th>
                <th>납품가</th>
                <th>소계</th>
                <th>전환됨</th>
                <th>잔여</th>
                <th>묶음 처리</th>
                <th>구성품 펼침</th>
              </tr>
            </thead>
            <tbody>
              {order.lines.map((line, index) => {
                const converted = line.convertedQuantity ?? 0
                const remaining = line.quantity - converted
                const lineSource = renderLineSource?.(line)
                return (
                  <tr key={`${line.lineId}-${index}`}>
                    <td style={{ textAlign: 'center', paddingLeft: 4 }}>
                    <input
                      type="checkbox"
                      aria-label={`${line.modelCode} 재고조회 선택`}
                      disabled={!interactive}
                      checked={interactive ? selectedLineIds?.has(line.lineId) ?? false : false}
                      onChange={() => onToggleLine?.(line.lineId)}
                    />
                    </td>
                    <td className={styles['tdLeft']}>{line.productName}</td>
                    <td>
                      <div>{line.modelCode}</div>
                      {lineSource !== undefined ? (
                        <div data-testid={`partner-order-line-source-${line.lineId}`} style={{ fontSize: 11, color: 'var(--color-neutral-500, #6b7280)', marginTop: 2 }}>
                          {typeof lineSource === 'string' ? displayOrderNumber(lineSource) : lineSource}
                        </div>
                      ) : null}
                    </td>
                    <td className={styles['numericCol']}>{line.quantity}</td>
                    <td className={styles['numericCol']}>{krw(line.deliveryPrice)}</td>
                    <td className={styles['numericCol']}>{krw(line.subtotal)}</td>
                    <td className={styles['numericCol']}>{converted > 0 ? <Badge variant="neutral">{converted}</Badge> : '-'}</td>
                    <td className={styles['numericCol']}>{converted > 0 ? remaining : '-'}</td>
                    <td>{line.bundleMode ? <span className={styles['badge']}>{line.bundleMode === 'EXPAND' ? '구성품 전개' : '세트 유지'}</span> : '-'}</td>
                    <td className={styles['expandedComponentText']}>
                      {(line.expandedComponents ?? []).length === 0 ? '-' : (line.expandedComponents ?? []).map((component) => (
                        <div key={component.modelCode}>{component.productName} ({component.modelCode}) × {component.quantity}</div>
                      ))}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
