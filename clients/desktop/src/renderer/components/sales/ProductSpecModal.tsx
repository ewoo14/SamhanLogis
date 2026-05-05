/**
 * 장비 스펙 모달 — legacy `#dlgSpec` (line 1937) 의 `openSpecModalByItem` (3113) +
 * `renderHomeSpec_/SingleSpec_/CommSpec_/ErvSpec_/PanelSpecCommon_` 5종 분기를 React
 * 단일 모달로 통합.
 *
 * <p>M1a `GET /api/v1/products/{modelCode}/specs` 실 fetch — displayOrder ASC 순서로
 * specKey:specValue 표 표시.
 */
import { useQuery } from '@tanstack/react-query'
import { getProductSpecs } from '../../api/sales'
import styles from './sales.module.css'

interface Props {
  modelCode: string | null
  productName: string | null
  onClose: () => void
}

export function ProductSpecModal({ modelCode, productName, onClose }: Props) {
  const query = useQuery({
    queryKey: ['product-specs', modelCode],
    queryFn: () => getProductSpecs(modelCode!),
    enabled: !!modelCode,
  })

  if (!modelCode) return null

  const specs = query.data ?? []

  return (
    <div className={styles['modalBackdrop']} role="dialog" aria-modal="true">
      <div className={styles['modal']} style={{ maxWidth: 720 }}>
        <div className={styles['modalHead']}>
          <div className={styles['modalTitle']}>
            장비 스펙 · {productName ?? modelCode}
          </div>
          <button type="button" className={styles['btnGhost']} onClick={onClose}>
            닫기
          </button>
        </div>

        <div className={styles['modalBody']}>
          {query.isLoading ? (
            <div className={styles['emptyState']}>스펙을 불러오는 중…</div>
          ) : query.isError ? (
            <div className={styles['emptyState']}>
              <h3>스펙 조회에 실패했습니다</h3>
              <p>모델 코드: {modelCode}</p>
            </div>
          ) : specs.length === 0 ? (
            <div className={styles['emptyState']}>
              <h3>등록된 스펙이 없습니다</h3>
              <p>관리자 화면에서 SpecKeyTemplate 추천 키를 적용하세요.</p>
            </div>
          ) : (
            <table className={styles['estTable']} style={{ marginTop: 8 }}>
              <thead>
                <tr>
                  <th style={{ width: 120 }}>순서</th>
                  <th style={{ width: 220 }}>스펙 키</th>
                  <th>값</th>
                  <th style={{ width: 80 }}>단위</th>
                </tr>
              </thead>
              <tbody>
                {specs.map((s) => (
                  <tr key={s.id}>
                    <td>{s.displayOrder ?? '-'}</td>
                    <td style={{ textAlign: 'left', fontWeight: 600 }}>{s.specKey}</td>
                    <td style={{ textAlign: 'left' }}>{s.specValue ?? '-'}</td>
                    <td>{s.unit ?? '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className={styles['modalFoot']}>
          <button type="button" className={styles['btn']} onClick={onClose}>
            확인
          </button>
        </div>
      </div>
    </div>
  )
}
