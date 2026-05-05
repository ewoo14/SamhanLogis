/**
 * 품목 추가 모달 — legacy `#modalInventory` (line 1954) 의 `initInventoryModal` (15436) 의
 * 카탈로그 검색 화면을 React 로 변환.
 *
 * <p>M1a `GET /api/v1/products?usageScope=BOTH&category=...` 실 fetch 로 ProductMaster
 * 3113 row 중 카테고리에 해당하는 부분만 페이징.
 *
 * <p>UUID 비공개 가드 — modelCode (사용자 노출 식별자) 만 표시.
 *
 * <p>모달 12종 중 핵심 1종 — 나머지 #dlgSpec / #dlgSlipDetail / #dlgInvoice / #pageHistory
 * 등은 후속 슬라이스에서 보강.
 */
import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  ESTIMATE_CATEGORY_LABEL,
  type EstimateCategory,
  type ProductCatalog,
  listProducts,
} from '../../api/sales'
import styles from './sales.module.css'

interface Props {
  category: EstimateCategory
  open: boolean
  onClose: () => void
  onPick: (catalog: ProductCatalog, quantity: number) => void
}

const krw = (n: number | null) =>
  n == null ? '-' : new Intl.NumberFormat('ko-KR').format(n)

export function ProductPickerModal({ category, open, onClose, onPick }: Props) {
  const [keyword, setKeyword] = useState('')
  const [page, setPage] = useState(0)

  // 카테고리 변경 시 첫 페이지로.
  useEffect(() => {
    if (open) {
      setPage(0)
      setKeyword('')
    }
  }, [category, open])

  const query = useQuery({
    queryKey: ['products', category, page],
    queryFn: () => listProducts({ usageScope: 'BOTH', category, page, size: 50 }),
    enabled: open,
  })

  const filtered = useMemo(() => {
    const items = query.data?.content ?? []
    if (!keyword.trim()) return items
    const lower = keyword.toLowerCase()
    return items.filter(
      (p) =>
        p.modelCode.toLowerCase().includes(lower) ||
        (p.name ?? '').toLowerCase().includes(lower),
    )
  }, [query.data, keyword])

  if (!open) return null

  return (
    <div className={styles['modalBackdrop']} role="dialog" aria-modal="true">
      <div className={styles['modal']}>
        <div className={styles['modalHead']}>
          <div className={styles['modalTitle']}>
            품목 검색 · {ESTIMATE_CATEGORY_LABEL[category]}
          </div>
          <button type="button" className={styles['btnGhost']} onClick={onClose}>
            닫기
          </button>
        </div>

        <div className={styles['filterBar']}>
          <span style={{ fontSize: 12, color: '#6b7280' }}>
            전체 {query.data?.totalElements ?? 0}건
          </span>
          <input
            type="search"
            placeholder="모델 코드 / 품명 검색"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            className={styles['filterSearch']}
            aria-label="품목 검색어"
          />
        </div>

        <div className={styles['modalBody']}>
          {query.isLoading ? (
            <div className={styles['emptyState']}>불러오는 중…</div>
          ) : query.isError ? (
            <div className={styles['emptyState']}>
              <h3>품목 데이터를 불러오지 못했습니다</h3>
              <p>product-service 가 미배포 상태이거나 네트워크 오류일 수 있습니다.</p>
              <p style={{ fontSize: 11 }}>
                M1a 시드 (ProductMaster 3113 row + ProductSpec 18922 row) 미적용 시 빈
                목록이 표시됩니다.
              </p>
            </div>
          ) : filtered.length === 0 ? (
            <div className={styles['emptyState']}>
              <h3>검색 결과가 없습니다</h3>
              <p>키워드를 변경하거나 카테고리를 다시 선택하세요.</p>
            </div>
          ) : (
            <table className={styles['estTable']} style={{ marginTop: 8 }}>
              <thead>
                <tr>
                  <th style={{ width: 200 }}>모델 코드</th>
                  <th>품명</th>
                  <th style={{ width: 100 }}>출고가</th>
                  <th style={{ width: 100 }}>납품가</th>
                  <th style={{ width: 100 }}>변동DC</th>
                  <th style={{ width: 80 }}>추가</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => (
                  <tr key={p.modelCode}>
                    <td>{p.modelCode}</td>
                    <td style={{ textAlign: 'left' }}>{p.name}</td>
                    <td className="numeric">{krw(p.releasePrice)}</td>
                    <td className="numeric">{krw(p.deliveryPrice)}</td>
                    <td>
                      {p.hasVariableDiscount ? (
                        <span className={styles['badge']}>변동DC</span>
                      ) : (
                        '-'
                      )}
                    </td>
                    <td>
                      <button
                        type="button"
                        className={styles['btn']}
                        onClick={() => {
                          onPick(p, 1)
                        }}
                      >
                        +1
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className={styles['modalFoot']}>
          <button
            type="button"
            className={styles['btnGhost']}
            disabled={page === 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
          >
            이전
          </button>
          <span style={{ alignSelf: 'center', fontSize: 12 }}>
            페이지 {(query.data?.number ?? 0) + 1} /{' '}
            {Math.max(1, query.data?.totalPages ?? 1)}
          </span>
          <button
            type="button"
            className={styles['btnGhost']}
            disabled={query.data?.last ?? true}
            onClick={() => setPage((p) => p + 1)}
          >
            다음
          </button>
          <button type="button" className={styles['btn']} onClick={onClose}>
            완료
          </button>
        </div>
      </div>
    </div>
  )
}
