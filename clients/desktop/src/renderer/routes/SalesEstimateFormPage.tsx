/**
 * 견적서 작성 페이지 — `/sales/estimates/new` (또는 `/sales/estimates/:id` 편집).
 *
 * <p>legacy estimate index.html (line 1227-2074) 의 메인 SPA 구조를 React 로 옮긴다.
 * <ul>
 *   <li>{@link CategoryTabs} — legacy `body.{cat}-active` className toggle 대체.</li>
 *   <li>품목 grid 카드 — legacy `#cardHome/#cardSingle/#cardComm/#cardOld` 의 단일 카드
 *       활성 모델로 단순화 (4 카드 grid 동시 노출 대신 1 카드 + 탭).</li>
 *   <li>{@link OrderInfoCard} — legacy `#cardOrderInfo` 의 거래처/배송/현장/연락처/납기/메모
 *       form. 한 카드 grid 안에서 카테고리 탭과 같이 노출.</li>
 *   <li>{@link BranchCalcPlaceholder} — legacy `#pageBranch` 영역. M3 EstimateBranchCalcService
 *       통합 시 교체 (G13 b 결정).</li>
 * </ul>
 *
 * <p>F1 (a) 100% 보존 — DS 컴포넌트 import 0, sales.module.css token 만 활용.
 * Excel 키보드 매트릭스 (`initKeyboardFix` 16936) 보류 — 후속 슬라이스 결정.
 */
import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { CategoryTabs } from '../components/sales/CategoryTabs'
import { EstimateLineRow } from '../components/sales/EstimateLineRow'
import { ProductPickerModal } from '../components/sales/ProductPickerModal'
import { ProductSpecModal } from '../components/sales/ProductSpecModal'
import { AddrSearchDock } from '../components/sales/AddrSearchDock'
import { SalesSubNav } from '../components/sales/SalesSubNav'
import { usePricingStore } from '../stores/usePricingStore'
import { usePageTitleStore } from '../stores/pageTitle'
import type { ProductCatalog } from '../api/sales'
import { ESTIMATE_CATEGORY_LABEL } from '../api/sales'
import styles from '../components/sales/sales.module.css'

const krw = (n: number) => new Intl.NumberFormat('ko-KR').format(n)

/**
 * 분기계산 영역 placeholder — M3 EstimateBranchCalcService 통합 대기 (G13 b).
 *
 * <p>legacy `#pageBranch` (line 1909) 의 실외기 column + 실내기 capsule DnD 매트릭스를
 * react-beautiful-dnd 로 옮길 예정. backend `recomputeBranchCodes` (12042) 결과 매핑.
 */
function BranchCalcPlaceholder() {
  return (
    <div className={styles['branchPlaceholder']} aria-label="분기계산 placeholder">
      <h4>분기계산 (실외기→실내기 매트릭스)</h4>
      <p>legacy `#pageBranch` (line 1909) 의 DnD 매트릭스 화면이 표시되는 영역입니다.</p>
      <p>외기 column + 실내기 capsule drag-and-drop + 분기관 자동 lookup.</p>
      <span className={styles['pendingTag']}>M3 단계 EstimateBranchCalcService 통합 예정</span>
    </div>
  )
}

interface OrderInfoCardProps {
  onOpenAddr: (target: 'delivery' | 'site') => void
}

function OrderInfoCard({ onOpenAddr }: OrderInfoCardProps) {
  const orderInfo = usePricingStore((s) => s.orderInfo)
  const setOrderInfo = usePricingStore((s) => s.setOrderInfo)
  const setPartner = usePricingStore((s) => s.setPartner)

  return (
    <div className={styles['card']}>
      <div className={styles['cardHead']}>
        <div className={styles['cardTitle']}>거래처 / 배송 정보</div>
        <div className={styles['cardActions']}>
          <button
            type="button"
            className={styles['btnGhost']}
            onClick={() => setPartner('TEST-001', '샘플 거래처')}
          >
            샘플 거래처 채움
          </button>
        </div>
      </div>
      <div className={styles['formGrid']}>
        <div className={styles['formField']}>
          <label htmlFor="custName">거래처명</label>
          <input
            id="custName"
            type="text"
            value={orderInfo.partnerName ?? ''}
            onChange={(e) => setPartner(orderInfo.partnerCode ?? '', e.target.value)}
            placeholder="거래처 검색…"
          />
        </div>
        <div className={styles['formField']}>
          <label htmlFor="custCode">거래처 코드</label>
          <input
            id="custCode"
            type="text"
            value={orderInfo.partnerCode ?? ''}
            onChange={(e) => setPartner(e.target.value, orderInfo.partnerName ?? '')}
            placeholder="000-00-00000"
          />
        </div>
        <div className={styles['formField']}>
          <label htmlFor="addrBase">배송지 (주소)</label>
          <div style={{ display: 'flex', gap: 6 }}>
            <input
              id="addrBase"
              type="text"
              value={orderInfo.deliveryAddress}
              onChange={(e) => setOrderInfo('deliveryAddress', e.target.value)}
              style={{ flex: 1 }}
            />
            <button
              type="button"
              className={styles['btnMini']}
              onClick={() => onOpenAddr('delivery')}
            >
              주소 검색
            </button>
          </div>
        </div>
        <div className={styles['formField']}>
          <label htmlFor="addrDetail">배송지 (상세)</label>
          <input
            id="addrDetail"
            type="text"
            value={orderInfo.deliveryAddressDetail}
            onChange={(e) => setOrderInfo('deliveryAddressDetail', e.target.value)}
          />
        </div>
        <div className={styles['formField']}>
          <label htmlFor="addrAuditBase">현장 (주소)</label>
          <div style={{ display: 'flex', gap: 6 }}>
            <input
              id="addrAuditBase"
              type="text"
              value={orderInfo.siteAddress}
              onChange={(e) => setOrderInfo('siteAddress', e.target.value)}
              style={{ flex: 1 }}
            />
            <button
              type="button"
              className={styles['btnMini']}
              onClick={() => onOpenAddr('site')}
            >
              주소 검색
            </button>
          </div>
        </div>
        <div className={styles['formField']}>
          <label htmlFor="addrAuditDetail">현장 (상세)</label>
          <input
            id="addrAuditDetail"
            type="text"
            value={orderInfo.siteAddressDetail}
            onChange={(e) => setOrderInfo('siteAddressDetail', e.target.value)}
          />
        </div>
        <div className={styles['formField']}>
          <label htmlFor="tel">연락처</label>
          <input
            id="tel"
            type="tel"
            value={orderInfo.contactPhone}
            onChange={(e) => setOrderInfo('contactPhone', e.target.value)}
            placeholder="010-0000-0000"
          />
        </div>
        <div className={styles['formField']}>
          <label htmlFor="due">납기일</label>
          <input
            id="due"
            type="date"
            value={orderInfo.dueDate}
            onChange={(e) => setOrderInfo('dueDate', e.target.value)}
          />
        </div>
        <div className={styles['formField']}>
          <label htmlFor="payDue">결제 기한</label>
          <input
            id="payDue"
            type="date"
            value={orderInfo.paymentDueDate}
            onChange={(e) => setOrderInfo('paymentDueDate', e.target.value)}
          />
        </div>
        <div className={styles['formField']} style={{ gridColumn: '1 / -1' }}>
          <label htmlFor="memo">요청사항 / 메모</label>
          <textarea
            id="memo"
            rows={3}
            value={orderInfo.memo}
            onChange={(e) => setOrderInfo('memo', e.target.value)}
          />
        </div>
      </div>
    </div>
  )
}

export function SalesEstimateFormPage() {
  const params = useParams<{ id?: string }>()
  const setPageTitle = usePageTitleStore((s) => s.setPageTitle)

  const lines = usePricingStore((s) => s.lines)
  const activeCategory = usePricingStore((s) => s.activeCategory)
  const setActiveCategory = usePricingStore((s) => s.setActiveCategory)
  const addLineFromCatalog = usePricingStore((s) => s.addLineFromCatalog)
  const setLineQty = usePricingStore((s) => s.setLineQty)
  const setLineBundleMode = usePricingStore((s) => s.setLineBundleMode)
  const removeLine = usePricingStore((s) => s.removeLine)
  const resetCategory = usePricingStore((s) => s.resetCategory)
  const totalsByCategory = usePricingStore((s) => s.totalsByCategory)
  const grandTotal = usePricingStore((s) => s.grandTotal)
  const countsByCategory = usePricingStore((s) => s.countsByCategory)

  const [pickerOpen, setPickerOpen] = useState(false)
  const [specModelCode, setSpecModelCode] = useState<string | null>(null)
  const [specProductName, setSpecProductName] = useState<string | null>(null)
  const [addrTarget, setAddrTarget] = useState<'delivery' | 'site' | null>(null)

  const setOrderInfo = usePricingStore((s) => s.setOrderInfo)

  useEffect(() => {
    setPageTitle({ title: params.id ? '견적서 편집' : '견적서 작성', meta: '판매' })
    return () => setPageTitle({ title: '' })
  }, [setPageTitle, params.id])

  const linesByCategory = useMemo(
    () => lines.filter((l) => l.category === activeCategory),
    [lines, activeCategory],
  )

  const totals = totalsByCategory()
  const counts = countsByCategory()

  const handlePick = (catalog: ProductCatalog, qty: number) => {
    addLineFromCatalog(catalog, qty)
  }

  const handleAddrPick = (address: string) => {
    if (addrTarget === 'delivery') setOrderInfo('deliveryAddress', address)
    if (addrTarget === 'site') setOrderInfo('siteAddress', address)
    setAddrTarget(null)
  }

  return (
    <div className={styles['salesScope']}>
      <SalesSubNav />
      <div className={styles['wrap']}>
        <div className={styles['top']}>
          <div className={styles['title']}>
            종합견적서
            <span className={styles['badge']}>합계 {krw(grandTotal())}원</span>
          </div>
          <CategoryTabs
            value={activeCategory}
            onChange={setActiveCategory}
            counts={counts}
          />
          <div className={styles['topActions']}>
            <button
              type="button"
              className={styles['btn']}
              onClick={() => setPickerOpen(true)}
            >
              + 품목 추가
            </button>
            <button
              type="button"
              className={styles['btnGhost']}
              onClick={() => resetCategory(activeCategory)}
              disabled={linesByCategory.length === 0}
            >
              현재 카테고리 초기화
            </button>
          </div>
        </div>

        <div className={styles['grid']}>
          <div className={styles['card']}>
            <div className={styles['cardHead']}>
              <div className={styles['cardTitle']}>
                {ESTIMATE_CATEGORY_LABEL[activeCategory]}
                <span className={styles['badge']}>{linesByCategory.length}건</span>
              </div>
              <div className={styles['cardActions']}>
                <span className={styles['ratio']}>
                  소계 {krw(totals[activeCategory])}원
                </span>
              </div>
            </div>
            <div className={styles['tableWrap']}>
              <table className={styles['estTable']}>
                <thead>
                  <tr>
                    <th>품명</th>
                    <th>모델 코드</th>
                    <th>출고가</th>
                    <th style={{ width: 96 }}>수량</th>
                    <th>납품가</th>
                    <th>소계</th>
                    <th>Bundle</th>
                    <th>제거</th>
                  </tr>
                </thead>
                <tbody>
                  {linesByCategory.length === 0 ? (
                    <tr>
                      <td colSpan={8} style={{ padding: 24, color: '#6b7280' }}>
                        품목이 없습니다. 상단 [+ 품목 추가] 버튼을 사용하세요.
                      </td>
                    </tr>
                  ) : (
                    linesByCategory.map((line) => (
                      <EstimateLineRow
                        key={line.id}
                        line={line}
                        onQtyChange={(q) => setLineQty(line.id, q)}
                        onRemove={() => removeLine(line.id)}
                        onBundleModeChange={(m) => setLineBundleMode(line.id, m)}
                        onSpecClick={() => {
                          setSpecModelCode(line.modelCode)
                          setSpecProductName(line.productName)
                        }}
                      />
                    ))
                  )}
                </tbody>
                {linesByCategory.length > 0 ? (
                  <tfoot>
                    <tr className={styles['sumRow']}>
                      <td colSpan={5} style={{ textAlign: 'right' }}>
                        카테고리 합계
                      </td>
                      <td className="numeric">{krw(totals[activeCategory])}</td>
                      <td colSpan={2} />
                    </tr>
                  </tfoot>
                ) : null}
              </table>
            </div>
          </div>

          <OrderInfoCard onOpenAddr={(t) => setAddrTarget(t)} />
        </div>

        <BranchCalcPlaceholder />
      </div>

      <ProductPickerModal
        category={activeCategory}
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onPick={handlePick}
      />
      <ProductSpecModal
        modelCode={specModelCode}
        productName={specProductName}
        onClose={() => {
          setSpecModelCode(null)
          setSpecProductName(null)
        }}
      />
      <AddrSearchDock
        open={addrTarget !== null}
        onClose={() => setAddrTarget(null)}
        onPick={handleAddrPick}
      />
    </div>
  )
}
