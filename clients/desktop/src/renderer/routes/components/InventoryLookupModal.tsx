/**
 * 품목 재고조회 모달 — Phase 2.6d.
 *
 * <h2>역할</h2>
 * <p>주문/출고/입고 상세에서 선택한 다건 품목의 창고별 가용/실/예약 매트릭스를 표시한다.
 *
 * <h2>레이아웃</h2>
 * <ul>
 *   <li>행 = 품목 (modelName / productName)</li>
 *   <li>열 = 창고 (warehouseCode / warehouseName)</li>
 *   <li>셀 = 3줄 `가용 N / 실 N / 예약 N` (D-IL-03)</li>
 *   <li>0토글(기본 OFF): 실재고(total) 합 > 0 인 창고만 컬럼 노출 (D-IL-03)</li>
 * </ul>
 *
 * <h2>UUID 비공개 가드 ([[feedback_uuid_no_user_visibility]])</h2>
 * <p>productId / warehouseId 는 내부 key 전용 — 화면 미노출.
 * 사용자에게는 modelName / productName / warehouseCode / warehouseName 만 표시.
 *
 * <h2>design-system 재사용</h2>
 * Modal / Button (자체 신규 컴포넌트 작성 금지).
 *
 * <h2>data-testid 목록</h2>
 * <ul>
 *   <li>{@code inventory-lookup-modal}                       — Modal root</li>
 *   <li>{@code inventory-lookup-zero-toggle}                 — 0수량 창고 토글 체크박스</li>
 *   <li>{@code inventory-lookup-cell-{modelName}-{warehouseCode}} — 셀 (3줄)</li>
 * </ul>
 */
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button, Modal } from '@samhan/design-system'
import {
  fetchProductBalancesMatrix,
  type StockBalanceLookupLine,
} from '../../api/inventory'

interface Props {
  open: boolean
  onClose: () => void
  /** 조회 대상 라인 — {productId, modelName, productName}. UUID 화면 미노출. */
  lines: StockBalanceLookupLine[]
}

export function InventoryLookupModal({ open, onClose, lines }: Props) {
  /** 0수량 창고도 표시 여부 (기본 OFF). */
  const [showZero, setShowZero] = useState(false)

  const query = useQuery({
    queryKey: [
      'inventory-lookup',
      lines.map((l) => l.productId).sort().join(','),
    ],
    queryFn: () => fetchProductBalancesMatrix(lines),
    enabled: open && lines.length > 0,
    staleTime: 30_000,
  })

  const matrix = query.data

  /**
   * 0토글 OFF = 실재고(total) 합 > 0 인 창고만 컬럼 노출 (D-IL-03 기준).
   * ON = 전 창고(머지된 0 포함).
   */
  const visibleCols = !matrix
    ? []
    : matrix.warehouses.filter(
        (w) =>
          showZero ||
          matrix.rows.some((r) => (r.cells[w.warehouseCode]?.total ?? 0) > 0),
      )

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="품목별 재고 현황"
      size="xl"
    >
      <div
        data-testid="inventory-lookup-modal"
        style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
      >
        {/* 0수량 창고 토글 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            type="checkbox"
            id="inventory-lookup-zero-toggle"
            data-testid="inventory-lookup-zero-toggle"
            checked={showZero}
            onChange={(e) => setShowZero(e.target.checked)}
            style={{ cursor: 'pointer' }}
          />
          <label
            htmlFor="inventory-lookup-zero-toggle"
            style={{ fontSize: 13, cursor: 'pointer', color: 'var(--color-neutral-700)' }}
          >
            0수량 창고도 표시
          </label>
        </div>

        {/* 로딩 상태 */}
        {query.isPending && (
          <div
            role="status"
            style={{
              textAlign: 'center',
              padding: '24px 0',
              color: 'var(--color-neutral-500)',
              fontSize: 14,
            }}
          >
            재고 조회 중…
          </div>
        )}

        {/* 에러 상태 */}
        {query.isError && (
          <div
            role="alert"
            style={{
              padding: '12px 16px',
              borderRadius: 6,
              background: 'var(--color-danger-50, #FEF2F2)',
              border: '1px solid var(--color-danger-200, #FECACA)',
              color: 'var(--color-danger-800, #991B1B)',
              fontSize: 13,
            }}
          >
            재고 조회에 실패했습니다. 잠시 후 다시 시도해 주세요.
          </div>
        )}

        {/* 빈 상태 (데이터는 있지만 행 없음) */}
        {query.isSuccess && matrix && matrix.rows.length === 0 && (
          <div
            style={{
              textAlign: 'center',
              padding: '24px 0',
              color: 'var(--color-neutral-500)',
              fontSize: 14,
            }}
          >
            재고 정보가 없습니다.
          </div>
        )}

        {/* 창고 없음 (0토글 OFF 상태 + 모든 창고 0) */}
        {query.isSuccess && matrix && matrix.rows.length > 0 && visibleCols.length === 0 && (
          <div
            style={{
              textAlign: 'center',
              padding: '16px 0',
              color: 'var(--color-neutral-500)',
              fontSize: 13,
            }}
          >
            실재고가 있는 창고가 없습니다. "0수량 창고도 표시"를 체크하면 모든 창고를 볼 수 있습니다.
          </div>
        )}

        {/* 매트릭스 표 */}
        {query.isSuccess && matrix && matrix.rows.length > 0 && visibleCols.length > 0 && (
          <div style={{ overflowX: 'auto' }}>
            <table
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                fontSize: 13,
              }}
            >
              <thead>
                <tr>
                  {/* 품목 헤더 */}
                  <th
                    style={{
                      padding: '8px 12px',
                      background: 'var(--color-neutral-50, #F9FAFB)',
                      border: '1px solid var(--color-neutral-200, #E5E7EB)',
                      textAlign: 'left',
                      fontWeight: 600,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    품목명 / 모델명
                  </th>
                  {/* 창고 헤더 */}
                  {visibleCols.map((w) => (
                    <th
                      key={w.warehouseCode}
                      style={{
                        padding: '8px 12px',
                        background: 'var(--color-neutral-50, #F9FAFB)',
                        border: '1px solid var(--color-neutral-200, #E5E7EB)',
                        textAlign: 'center',
                        fontWeight: 600,
                        whiteSpace: 'nowrap',
                        minWidth: 100,
                      }}
                    >
                      <div>{w.warehouseName}</div>
                      <div
                        style={{
                          fontSize: 11,
                          fontWeight: 400,
                          color: 'var(--color-neutral-500)',
                        }}
                      >
                        {w.warehouseCode}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {matrix.rows.map((row) => (
                  <tr key={row.productId}>
                    {/* 품목 셀 */}
                    <td
                      style={{
                        padding: '8px 12px',
                        border: '1px solid var(--color-neutral-200, #E5E7EB)',
                        verticalAlign: 'middle',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      <div style={{ fontWeight: 500 }}>{row.productName}</div>
                      <div
                        style={{
                          fontSize: 11,
                          color: 'var(--color-neutral-500)',
                          marginTop: 2,
                        }}
                      >
                        {row.modelName}
                      </div>
                    </td>
                    {/* 창고별 셀 — 3줄: 가용 N / 실 N / 예약 N */}
                    {visibleCols.map((w) => {
                      const cell = row.cells[w.warehouseCode] ?? {
                        available: 0,
                        reserved: 0,
                        total: 0,
                      }
                      const isZero = cell.total === 0
                      return (
                        <td
                          key={w.warehouseCode}
                          data-testid={`inventory-lookup-cell-${row.modelName}-${w.warehouseCode}`}
                          style={{
                            padding: '8px 12px',
                            border: '1px solid var(--color-neutral-200, #E5E7EB)',
                            textAlign: 'center',
                            verticalAlign: 'middle',
                            background: isZero
                              ? 'var(--color-neutral-50, #F9FAFB)'
                              : undefined,
                          }}
                        >
                          <div
                            style={{
                              display: 'flex',
                              flexDirection: 'column',
                              gap: 2,
                              fontSize: 12,
                              lineHeight: 1.5,
                            }}
                          >
                            <span
                              style={{
                                color:
                                  cell.available === 0
                                    ? 'var(--color-danger-600, #DC2626)'
                                    : 'var(--color-success-700, #15803D)',
                                fontWeight: cell.available === 0 ? 600 : 400,
                              }}
                            >
                              가용 {cell.available.toLocaleString()}
                            </span>
                            <span style={{ color: 'var(--color-neutral-700)' }}>
                              실 {cell.total.toLocaleString()}
                            </span>
                            <span style={{ color: 'var(--color-neutral-500)' }}>
                              예약 {cell.reserved.toLocaleString()}
                            </span>
                          </div>
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* 닫기 버튼 */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
          <Button variant="secondary" size="sm" onClick={onClose}>
            닫기
          </Button>
        </div>
      </div>
    </Modal>
  )
}
