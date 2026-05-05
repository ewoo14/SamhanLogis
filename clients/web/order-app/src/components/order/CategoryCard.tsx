/**
 * 단일 카테고리 카드 (legacy `#cardHome` / `#cardSingle` / `#cardComm` / `#cardOld` 1:1).
 *
 * <p>구성 (legacy line 706-887):
 * - card-head: 제목 + 합계 + 초기화 버튼
 * - filter-bar: 검색 input
 * - table-wrap: 라인 표 (모델명 + 수량 + 납품가 + 소계)
 *
 * <p>partner-order 는 estimate 와 달리 출고가/규격 column 없음 (납품가만 — 거래처 미노출).
 */
import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { listProducts } from '../../api/catalog'
import { useOrderStore } from '../../stores/order'
import type { EstimateCategory } from '../../types'
import { BundleToggle } from './BundleToggle'

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

  const lineMap = useMemo(() => {
    const map = new Map<string, { qty: number; lineKey: string; bundleMode?: 'EXPAND' | 'KEEP' }>()
    lines.filter((l) => l.estimateCategory === category).forEach((l) =>
      map.set(l.modelCode, { qty: l.qty, lineKey: l.lineKey, bundleMode: l.bundleMode }),
    )
    return map
  }, [lines, category])

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
            <col style={{ width: '38%' }} />
            <col style={{ width: '20%' }} />
            <col style={{ width: '14%' }} />
            <col style={{ width: '14%' }} />
            <col style={{ width: '14%' }} />
          </colgroup>
          <thead>
            <tr>
              <th>품목명</th>
              <th>모델명</th>
              <th>수량</th>
              <th>납품가</th>
              <th>소계</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={5} style={{ padding: 30, color: 'var(--c-muted)' }}>
                  불러오는 중...
                </td>
              </tr>
            )}
            {!isLoading && filtered.length === 0 && (
              <tr>
                <td colSpan={5} style={{ padding: 30, color: 'var(--c-muted)' }}>
                  표시할 품목이 없습니다.
                </td>
              </tr>
            )}
            {filtered.map((p) => {
              const current = lineMap.get(p.modelCode)
              const qty = current?.qty ?? 0
              return (
                <tr key={p.modelCode}>
                  <td style={{ textAlign: 'left' }}>
                    {p.productName}
                    {p.isBundle && current && (
                      <BundleToggle
                        mode={current.bundleMode ?? 'EXPAND'}
                        onToggle={() => toggleBundle(current.lineKey)}
                      />
                    )}
                  </td>
                  <td>{p.modelCode}</td>
                  <td>
                    <input
                      type="number"
                      className="qty-input"
                      min={0}
                      value={qty || ''}
                      placeholder="0"
                      onChange={(e) => {
                        const next = Math.max(0, Number(e.target.value) || 0)
                        upsert(p, next)
                      }}
                    />
                  </td>
                  <td>{p.deliveryPrice.toLocaleString()}</td>
                  <td>{(qty * p.deliveryPrice).toLocaleString()}</td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr className="sumrow">
              <td colSpan={3}></td>
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
