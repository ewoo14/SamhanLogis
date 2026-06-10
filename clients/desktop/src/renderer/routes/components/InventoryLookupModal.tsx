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
 *   <li>VIRTUAL 창고는 ON 토글에서도 제외 (D-IL-04)</li>
 * </ul>
 *
 * <h2>UUID 비공개 가드 ([[feedback_uuid_no_user_visibility]])</h2>
 * <p>productId / warehouseId 는 내부 key 전용 — 화면 미노출.
 * 사용자에게는 modelName / productName / warehouseCode / warehouseName 만 표시.
 *
 * <h2>design-system 재사용</h2>
 * Modal / Button (자체 신규 컴포넌트 작성 금지).
 *
 * <h2>색 토큰</h2>
 * <ul>
 *   <li>가용=0 → `var(--state-danger)` (빨강 경고)</li>
 *   <li>가용>0 → `var(--ink-primary)` (기본 묵색)</li>
 *   <li>예약>0 → `var(--state-warning)` (오렌지 강조)</li>
 *   <li>예약=0 → `var(--ink-secondary)` (일반)</li>
 *   <li>0셀 배경 → `var(--surface-subtle)`, 텍스트 → `var(--ink-tertiary)`</li>
 * </ul>
 *
 * <h2>data-testid 목록</h2>
 * <ul>
 *   <li>{@code inventory-lookup-modal}                       — Modal body root</li>
 *   <li>{@code inventory-lookup-zero-toggle}                 — 0수량 창고 토글 체크박스</li>
 *   <li>{@code inventory-lookup-cell-{modelName}-{warehouseCode}} — 셀 (3줄)</li>
 *   <li>{@code inventory-lookup-loading}                     — 로딩 상태</li>
 *   <li>{@code inventory-lookup-error}                       — 에러 배너</li>
 * </ul>
 */
import { useEffect, useState } from 'react'
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
  /**
   * 세트 전용 안내 (§2-2 세트 재고 가드).
   * 선택된 라인이 모두 BUNDLE 인 경우 호출자가 empty lines + true 로 전달.
   * true 시 재고 조회 대신 안내 메시지를 표시한다.
   */
  bundleOnlyLines?: boolean
  /**
   * 혼합 선택 시 제외된 세트 품목 수 (P2-3).
   * 0 또는 undefined 이면 캡션 미표시.
   * bundleOnlyLines=true 시에는 캡션 대신 전용 안내가 표시되므로 무시.
   */
  excludedBundleCount?: number
}

export function InventoryLookupModal({
  open,
  onClose,
  lines,
  bundleOnlyLines = false,
  excludedBundleCount = 0,
}: Props) {
  /** 0수량 창고도 표시 여부 (기본 OFF). 모달 재오픈 시 초기화 (P1-2). */
  const [showZero, setShowZero] = useState(false)

  // P1-2: open 변경(false→true) 시 showZero 기본 OFF 복원
  useEffect(() => {
    if (open) setShowZero(false)
  }, [open])

  const query = useQuery({
    queryKey: [
      'inventory-lookup',
      lines.map((l) => l.productId).sort().join(','),
    ],
    queryFn: () => fetchProductBalancesMatrix(lines),
    // bundleOnlyLines 시 라인이 비어 있으므로 enabled=false — 쿼리 미실행
    enabled: open && lines.length > 0 && !bundleOnlyLines,
    staleTime: 30_000,
  })

  const matrix = query.data

  /**
   * 0토글 OFF = 실재고(total) 합 > 0 인 창고만 컬럼 노출 (D-IL-03 기준).
   * ON = 전 창고(머지된 0 포함). VIRTUAL 은 양쪽 모두 제외 (D-IL-04).
   */
  const visibleCols = !matrix
    ? []
    : matrix.warehouses.filter(
        (w) =>
          w.warehouseType !== 'VIRTUAL' &&
          (showZero ||
            matrix.rows.some((r) => (r.cells[w.warehouseCode]?.total ?? 0) > 0)),
      )

  const lineCount = lines.length
  const colCount = visibleCols.length

  /**
   * 모달 title prop — ReactNode 로 헤더 우측에 0토글 인라인 배치 (Designer P1-3).
   * title = "재고조회" + [☐ 0수량 창고도 표시] (닫기 버튼 왼쪽).
   */
  const modalTitle = (
    <span
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        width: '100%',
        gap: 16,
      }}
    >
      <span>재고조회</span>
      <label
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          fontSize: 13,
          fontWeight: 400,
          color: 'var(--ink-secondary)',
          cursor: 'pointer',
          whiteSpace: 'nowrap',
        }}
      >
        <input
          type="checkbox"
          id="inventory-lookup-zero-toggle"
          data-testid="inventory-lookup-zero-toggle"
          checked={showZero}
          onChange={(e) => setShowZero(e.target.checked)}
          aria-label="0수량 창고도 표시"
          style={{ width: 16, height: 16, cursor: 'pointer' }}
        />
        0수량 창고도 표시
      </label>
    </span>
  )

  /** 서브헤더 — "선택 품목 N건 · 조회 창고 M개" (Designer P1-4). bundleOnlyLines 시 안내 문구. */
  const modalDescription =
    bundleOnlyLines
      ? '세트 품목 선택됨'
      : query.isSuccess
      ? `선택 품목 ${lineCount}건 · 조회 창고 ${colCount}개`
      : `선택 품목 ${lineCount}건`

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={modalTitle}
      description={modalDescription}
      size="xl"
      footer={
        <Button variant="secondary" size="sm" onClick={onClose}>
          닫기
        </Button>
      }
    >
      <div
        data-testid="inventory-lookup-modal"
        style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
      >
        {/* 혼합 선택 안내 — 세트+단품 혼합 시 제외된 세트 건수 표시 (P2-3) */}
        {!bundleOnlyLines && excludedBundleCount > 0 && (
          <div
            role="status"
            data-testid="inventory-lookup-mixed-bundle-notice"
            style={{
              padding: '6px 12px',
              borderRadius: 4,
              background: 'var(--color-neutral-50, #F7F8FA)',
              border: '1px solid var(--color-border, #E5E7EB)',
              fontSize: 12,
              color: 'var(--ink-secondary, #5C6773)',
            }}
          >
            세트 {excludedBundleCount}건은 제외됨 (구성품 단위로 조회됩니다)
          </div>
        )}

        {/* 세트 전용 안내 — BUNDLE 품목만 선택된 경우 (§2-2 세트 재고 가드) */}
        {bundleOnlyLines && (
          <div
            role="status"
            data-testid="inventory-lookup-bundle-only-notice"
            style={{
              textAlign: 'center',
              padding: '32px 24px',
              color: 'var(--ink-secondary, #5C6773)',
              fontSize: 14,
              lineHeight: 1.8,
              background: 'var(--surface-subtle, #F4F6F8)',
              borderRadius: 8,
              minHeight: 120,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
            }}
          >
            <strong style={{ color: 'var(--ink-primary, #1A1F2E)', fontSize: 15 }}>
              세트 품목은 재고를 표시하지 않습니다
            </strong>
            <span style={{ fontSize: 13, color: 'var(--ink-tertiary, #8A95A4)' }}>
              재고는 구성품 단위로 조회됩니다.
            </span>
          </div>
        )}

        {/* 로딩 상태 */}
        {!bundleOnlyLines && query.isPending && (
          <div
            role="status"
            data-testid="inventory-lookup-loading"
            aria-busy="true"
            style={{
              textAlign: 'center',
              padding: '32px 0',
              color: 'var(--ink-secondary)',
              fontSize: 14,
              minHeight: 200,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            재고 정보를 불러오는 중…
          </div>
        )}

        {/* 에러 상태 */}
        {!bundleOnlyLines && query.isError && (
          <div
            role="alert"
            data-testid="inventory-lookup-error"
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
            <span>재고 조회 중 오류가 발생했습니다.</span>
            <Button variant="secondary" size="sm" onClick={() => query.refetch()}>
              다시 시도
            </Button>
          </div>
        )}

        {/* 빈 상태 (데이터는 있지만 행 없음) */}
        {!bundleOnlyLines && query.isSuccess && matrix && matrix.rows.length === 0 && (
          <div
            style={{
              textAlign: 'center',
              padding: '32px 0',
              color: 'var(--ink-tertiary)',
              fontSize: 13,
            }}
          >
            재고 정보가 없습니다.
          </div>
        )}

        {/* 창고 없음 (0토글 OFF 상태 + 모든 창고 0) — 가이드 §4.3 문구 */}
        {!bundleOnlyLines && query.isSuccess && matrix && matrix.rows.length > 0 && visibleCols.length === 0 && (
          <div
            style={{
              textAlign: 'center',
              padding: '24px 0',
              color: 'var(--ink-tertiary)',
              fontSize: 13,
              lineHeight: 1.8,
            }}
          >
            <div>조회된 재고 창고가 없습니다.</div>
            <div>"0수량 창고도 표시"를 켜면 전체 창고를 확인할 수 있습니다.</div>
          </div>
        )}

        {/* 매트릭스 표 */}
        {!bundleOnlyLines && query.isSuccess && matrix && matrix.rows.length > 0 && visibleCols.length > 0 && (
          <div
            role="region"
            aria-label="재고 매트릭스"
            style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}
          >
            <table
              role="grid"
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                fontSize: 13,
              }}
            >
              {/* 접근성 caption (스크린리더 전용) — 가이드 §13 */}
              <caption
                style={{
                  position: 'absolute',
                  width: 1,
                  height: 1,
                  overflow: 'hidden',
                  clip: 'rect(0,0,0,0)',
                  whiteSpace: 'nowrap',
                }}
              >
                품목별 창고 재고 매트릭스
              </caption>
              <thead>
                <tr>
                  {/* 품목 헤더 — sticky 고정 컬럼 (P2: 가이드 §5.2) */}
                  <th
                    scope="col"
                    style={{
                      padding: '8px 12px',
                      background: 'var(--surface-subtle, #F4F6F8)',
                      borderBottom: '1px solid var(--line-default, #E5E7EB)',
                      borderRight: '1px solid var(--line-default, #E5E7EB)',
                      textAlign: 'left',
                      fontWeight: 600,
                      whiteSpace: 'nowrap',
                      position: 'sticky',
                      left: 0,
                      zIndex: 2,
                      minWidth: 180,
                      maxWidth: 220,
                      boxShadow: 'inset -1px 0 0 var(--line-default, #E5E7EB)',
                    }}
                  >
                    품목
                  </th>
                  {/* 창고 헤더 (scope="col") */}
                  {visibleCols.map((w) => (
                    <th
                      key={w.warehouseCode}
                      scope="col"
                      style={{
                        padding: '8px 12px',
                        background: 'var(--surface-subtle, #F4F6F8)',
                        borderBottom: '1px solid var(--line-default, #E5E7EB)',
                        borderRight: '1px solid var(--line-default, #E5E7EB)',
                        textAlign: 'center',
                        fontWeight: 600,
                        whiteSpace: 'nowrap',
                        minWidth: 96,
                      }}
                    >
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-primary)' }}>
                        {w.warehouseName}
                      </div>
                      <div
                        style={{
                          fontSize: 12,
                          fontWeight: 400,
                          color: 'var(--ink-tertiary)',
                        }}
                      >
                        {w.warehouseCode}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {matrix.rows.map((row, rowIdx) => (
                  <tr
                    key={row.productId}
                    style={{
                      background:
                        rowIdx % 2 === 1
                          ? 'var(--surface-subtle, #F4F6F8)'
                          : undefined,
                    }}
                  >
                    {/* 품목 셀 — sticky 고정 컬럼 + scope="row" */}
                    <th
                      scope="row"
                      style={{
                        padding: '8px 12px',
                        borderBottom: '1px solid var(--line-default, #E5E7EB)',
                        borderRight: '1px solid var(--line-default, #E5E7EB)',
                        verticalAlign: 'top',
                        textAlign: 'left',
                        fontWeight: 400,
                        whiteSpace: 'nowrap',
                        position: 'sticky',
                        left: 0,
                        zIndex: 1,
                        background:
                          rowIdx % 2 === 1
                            ? 'var(--surface-subtle, #F4F6F8)'
                            : 'var(--surface-card, #FFFFFF)',
                        boxShadow: 'inset -1px 0 0 var(--line-default, #E5E7EB)',
                        minWidth: 180,
                        maxWidth: 220,
                      }}
                    >
                      <div
                        style={{
                          fontWeight: 600,
                          fontSize: 13,
                          color: 'var(--ink-primary)',
                        }}
                      >
                        {row.modelName}
                      </div>
                      <div
                        style={{
                          fontSize: 12,
                          color: 'var(--ink-secondary)',
                          marginTop: 2,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          maxWidth: 200,
                        }}
                      >
                        {row.productName}
                      </div>
                    </th>
                    {/* 창고별 셀 — 3줄: 가용 N / 실 N / 예약 N */}
                    {visibleCols.map((w) => {
                      const cell = row.cells[w.warehouseCode] ?? {
                        available: 0,
                        reserved: 0,
                        total: 0,
                      }
                      const isZero = cell.total === 0
                      // 색 토큰 계산 (Designer P1-1, P1-2)
                      const availColor =
                        cell.available === 0
                          ? 'var(--state-danger, #EF4444)'
                          : 'var(--ink-primary, #1A1F2E)'
                      const totalColor = 'var(--ink-secondary, #5C6773)'
                      const reservedColor =
                        cell.reserved > 0
                          ? 'var(--state-warning, #F59E0B)'
                          : 'var(--ink-secondary, #5C6773)'
                      // 0셀 전체: ink-tertiary로 deemphasis (Designer P2-3)
                      const zeroCellColor = 'var(--ink-tertiary, #8A95A4)'
                      return (
                        <td
                          key={w.warehouseCode}
                          data-testid={`inventory-lookup-cell-${row.modelName}-${w.warehouseCode}`}
                          aria-label={`${row.modelName} ${w.warehouseName} — 가용 ${cell.available} 실 ${cell.total} 예약 ${cell.reserved}`}
                          style={{
                            padding: '8px 12px',
                            borderBottom: '1px solid var(--line-default, #E5E7EB)',
                            borderRight: '1px solid var(--line-default, #E5E7EB)',
                            textAlign: 'right',
                            verticalAlign: 'top',
                            background: isZero
                              ? 'var(--surface-subtle, #F4F6F8)'
                              : undefined,
                          }}
                        >
                          <div
                            style={{
                              display: 'flex',
                              flexDirection: 'column',
                              gap: 2,
                            }}
                          >
                            {/* 가용 */}
                            <span
                              style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                gap: 8,
                                fontSize: 12,
                                lineHeight: 1.6,
                                fontVariantNumeric: 'tabular-nums',
                                color: isZero ? zeroCellColor : availColor,
                                fontWeight: isZero ? 400 : cell.available === 0 ? 600 : 500,
                              }}
                            >
                              <span
                                style={{
                                  minWidth: '2em',
                                  fontSize: 11,
                                  color: isZero
                                    ? zeroCellColor
                                    : 'var(--ink-tertiary, #8A95A4)',
                                }}
                              >
                                가용
                              </span>
                              {cell.available.toLocaleString()}
                            </span>
                            {/* 실재고 */}
                            <span
                              style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                gap: 8,
                                fontSize: 12,
                                lineHeight: 1.6,
                                fontVariantNumeric: 'tabular-nums',
                                color: isZero ? zeroCellColor : totalColor,
                              }}
                            >
                              <span
                                style={{
                                  minWidth: '2em',
                                  fontSize: 11,
                                  color: isZero
                                    ? zeroCellColor
                                    : 'var(--ink-tertiary, #8A95A4)',
                                }}
                              >
                                실
                              </span>
                              {cell.total.toLocaleString()}
                            </span>
                            {/* 예약 */}
                            <span
                              style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                gap: 8,
                                fontSize: 12,
                                lineHeight: 1.6,
                                fontVariantNumeric: 'tabular-nums',
                                color: isZero ? zeroCellColor : reservedColor,
                              }}
                            >
                              <span
                                style={{
                                  minWidth: '2em',
                                  fontSize: 11,
                                  color: isZero
                                    ? zeroCellColor
                                    : 'var(--ink-tertiary, #8A95A4)',
                                }}
                              >
                                예약
                              </span>
                              {cell.reserved.toLocaleString()}
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
      </div>
    </Modal>
  )
}
