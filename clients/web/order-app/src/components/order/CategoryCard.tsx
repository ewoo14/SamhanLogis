/**
 * 단일 카테고리 카드 (legacy `#cardHome` / `#cardSingle` / `#cardComm` / `#cardOld` 1:1 + v2 정정).
 *
 * <p>v1 → v2 변경:
 * <ul>
 *   <li>정정 #4: '모델 코드' → '모델명' (table header + filter placeholder 유지)</li>
 *   <li>정정 #5: '품명' → '품목명' (이미 v1 에서 동일)</li>
 *   <li>정정 #12: 단가/소계 → {@link LinePriceDisplay} 출고가 + DC% + 최종가</li>
 *   <li>정정 #2: 선택된 라인 (qty &gt; 0) drag-and-drop 으로 정렬 변경 (`@dnd-kit/sortable`)</li>
 * </ul>
 *
 * <p>구성 (legacy line 706-887):
 * - card-head: 제목 + 합계 + 초기화 버튼
 * - filter-bar: 검색 input
 * - table-wrap: 라인 표 (품목명 + 모델명 + 수량 + 단가 + 소계)
 *
 * <p>DnD: 선택된 라인 (qty &gt; 0) 만 sortable. 미선택 행은 정렬 불변.
 */
import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { listProducts } from '../../api/catalog'
import { useOrderStore } from '../../stores/order'
import { useDcConfigStore } from '../../stores/dcConfigStore'
import type { EstimateCategory, OrderLine, ProductCatalog } from '../../types'
import { BundleToggle } from './BundleToggle'
import { LinePriceDisplay } from './LinePriceDisplay'

interface Props {
  id: string
  title: string
  category: EstimateCategory
}

export function CategoryCard({ id, title, category }: Props) {
  const [search, setSearch] = useState('')
  const lines = useOrderStore((s) => s.lines)
  const upsert = useOrderStore((s) => s.upsertLine)
  const reset = useOrderStore((s) => s.resetCategory)
  const total = useOrderStore((s) => s.totalForCategory(category))
  const toggleBundle = useOrderStore((s) => s.toggleBundleMode)
  const reorderLines = useOrderStore((s) => s.reorderLines)
  const dcConfig = useDcConfigStore((s) => s.config)

  const { data, isLoading } = useQuery({
    queryKey: ['products', category],
    queryFn: () => listProducts({ category, usageScope: 'PARTNER_ORDER' }),
  })

  const filtered = useMemo(() => {
    const all = data?.content ?? []
    const q = search.trim().toLowerCase()
    if (!q) return all
    return all.filter(
      (p) =>
        p.modelCode.toLowerCase().includes(q) ||
        p.productName.toLowerCase().includes(q) ||
        `${p.categoryL}${p.categoryM}${p.categoryS}${p.categoryD}`.toLowerCase().includes(q),
    )
  }, [data, search])

  /** 선택된 라인 (qty > 0) — sortOrder 기준 정렬. */
  const selectedLines = useMemo(
    () =>
      lines
        .filter((l) => l.estimateCategory === category)
        .sort((a, b) => a.sortOrder - b.sortOrder),
    [lines, category],
  )

  /** 미선택 row (qty 0) — 카탈로그 노출용. */
  const unselectedProducts = useMemo(
    () => filtered.filter((p) => !selectedLines.find((l) => l.modelCode === p.modelCode)),
    [filtered, selectedLines],
  )

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  )

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const fromIndex = selectedLines.findIndex((l) => l.lineKey === active.id)
    const toIndex = selectedLines.findIndex((l) => l.lineKey === over.id)
    if (fromIndex < 0 || toIndex < 0) return
    reorderLines(category, fromIndex, toIndex)
  }

  return (
    <div className="card" id={id}>
      <div className="card-head">
        <div className="card-title">{title}</div>
        <div className="card-actions">
          <div className="ratio">합계 : {total.toLocaleString()} 원</div>
          <button type="button" className="btn-mini" onClick={() => reset(category)}>
            초기화
          </button>
        </div>
      </div>

      <div className="filter-bar">
        <div className="filter-search">
          <span className="filter-icon">🔍</span>
          <input
            type="text"
            className="filter-input"
            placeholder="품목명 또는 모델명 입력"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="table-wrap">
        <table className="est-table">
          <colgroup>
            <col style={{ width: '4%' }} />
            <col style={{ width: '34%' }} />
            <col style={{ width: '20%' }} />
            <col style={{ width: '14%' }} />
            <col style={{ width: '14%' }} />
            <col style={{ width: '14%' }} />
          </colgroup>
          <thead>
            <tr>
              <th aria-label="정렬"></th>
              <th>품목명</th>
              <th>모델명</th>
              <th>수량</th>
              <th>단가</th>
              <th>소계</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={6} style={{ padding: 30, color: 'var(--c-muted)' }}>
                  불러오는 중...
                </td>
              </tr>
            )}
            {!isLoading && filtered.length === 0 && (
              <tr>
                <td colSpan={6} style={{ padding: 30, color: 'var(--c-muted)' }}>
                  표시할 품목이 없습니다.
                </td>
              </tr>
            )}

            {/* === 선택된 라인 — drag-and-drop 정렬 === */}
            {selectedLines.length > 0 && (
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
                <SortableContext
                  items={selectedLines.map((l) => l.lineKey)}
                  strategy={verticalListSortingStrategy}
                >
                  {selectedLines.map((l) => {
                    const p = filtered.find((x) => x.modelCode === l.modelCode)
                    return (
                      <SortableLineRow
                        key={l.lineKey}
                        line={l}
                        product={p}
                        category={category}
                        config={dcConfig}
                        onQty={(qty) => p && upsert(p, qty)}
                        onToggleBundle={() => toggleBundle(l.lineKey)}
                      />
                    )
                  })}
                </SortableContext>
              </DndContext>
            )}

            {/* === 미선택 카탈로그 행 === */}
            {unselectedProducts.map((p) => (
              <tr key={p.modelCode}>
                <td></td>
                <td style={{ textAlign: 'left' }}>{p.productName}</td>
                <td>{p.modelCode}</td>
                <td>
                  <input
                    type="number"
                    className="qty-input"
                    min={0}
                    placeholder="0"
                    onChange={(e) => {
                      const next = Math.max(0, Number(e.target.value) || 0)
                      upsert(p, next)
                    }}
                  />
                </td>
                <td>
                  <LinePriceDisplay
                    releasePrice={p.releasePrice}
                    category={p.estimateCategory}
                    config={dcConfig}
                    compact
                  />
                </td>
                <td style={{ color: 'var(--c-muted)' }}>-</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="sumrow">
              <td colSpan={4}></td>
              <td>
                <strong>합계</strong>
              </td>
              <td>
                <strong>{total.toLocaleString()}</strong>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}

interface SortableRowProps {
  line: OrderLine
  /** 카탈로그 product (없을 수도 — 선택된 라인이 카탈로그 검색 필터에서 빠진 경우). */
  product: ProductCatalog | undefined
  category: EstimateCategory
  config: ReturnType<typeof useDcConfigStore.getState>['config']
  onQty: (qty: number) => void
  onToggleBundle: () => void
}

/**
 * Drag-and-drop 가능한 선택된 라인 row.
 *
 * <p>품목명 좌측 핸들 (≡) 로 잡고 끄는 형태. 5px 이내 클릭은 일반 클릭 (`activationConstraint`).
 */
function SortableLineRow({ line, product: _product, category, config, onQty, onToggleBundle }: SortableRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: line.lineKey,
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    background: isDragging ? '#eff6ff' : '#fff7ed',
  }

  return (
    <tr ref={setNodeRef} style={style}>
      <td
        {...attributes}
        {...listeners}
        style={{ cursor: 'grab', userSelect: 'none', textAlign: 'center', color: '#64748b' }}
        title="끌어 옮기기"
        aria-label="라인 정렬 핸들"
      >
        ≡
      </td>
      <td style={{ textAlign: 'left' }}>
        {line.productName}
        {line.bundleMode && (
          <BundleToggle mode={line.bundleMode} onToggle={onToggleBundle} />
        )}
      </td>
      <td>{line.modelCode}</td>
      <td>
        <input
          type="number"
          className="qty-input"
          min={0}
          value={line.qty || ''}
          placeholder="0"
          onChange={(e) => {
            const next = Math.max(0, Number(e.target.value) || 0)
            onQty(next)
          }}
        />
      </td>
      <td>
        <LinePriceDisplay
          releasePrice={line.releasePrice}
          category={category}
          options={line.options}
          config={config}
          compact
        />
      </td>
      <td>
        <LinePriceDisplay
          releasePrice={line.releasePrice}
          category={category}
          options={line.options}
          config={config}
          qty={line.qty}
        />
      </td>
    </tr>
  )
}
