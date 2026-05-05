/**
 * 견적서 작성 페이지 — `/sales/estimates/new` (또는 `/sales/estimates/:id` 편집).
 *
 * <p>legacy estimate index.html (line 1227-2074) 의 메인 SPA 구조를 React 로 옮긴다.
 *
 * <p>v2 정정 통합 (DECISIONS 정정 라운드 §):
 * <ul>
 *   <li>§정정 1 — 라인 0건 시 카테고리 탭 미표시 (CategoryTabs 가 counts 분포 기반 동적
 *       렌더링).</li>
 *   <li>§정정 2 — 품목 drag-and-drop (@dnd-kit/sortable). EstimateLineRow 가 draggable.</li>
 *   <li>§정정 3 — 'Bundle' 컬럼 제거 (EstimateLineRow 마지막 컬럼이 액션 통합).</li>
 *   <li>§정정 4/5 — '모델 코드' → '모델명' / '품명' → '품목명' (header).</li>
 *   <li>§정정 16 — 거래처 자동완성 → 하단 자동 채움 (legacy `fillCustomer` 1:1).</li>
 * </ul>
 *
 * <p>F1 (a) 100% 보존 — DS 컴포넌트 import 0, sales.module.css token 만 활용.
 */
import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import {
  DndContext,
  type DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  SortableContext,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CategoryTabs } from '../components/sales/CategoryTabs'
import { EstimateLineRow } from '../components/sales/EstimateLineRow'
import { ProductPickerModal } from '../components/sales/ProductPickerModal'
import { ProductSpecModal } from '../components/sales/ProductSpecModal'
import { AddrSearchDock } from '../components/sales/AddrSearchDock'
import { SalesSubNav } from '../components/sales/SalesSubNav'
import { PartnerAutocomplete } from '../components/sales/PartnerAutocomplete'
import { usePricingStore } from '../stores/usePricingStore'
import { usePageTitleStore } from '../stores/pageTitle'
import type { ProductCatalog, PartnerSummary } from '../api/sales'
import { ESTIMATE_CATEGORY_LABEL } from '../api/sales'
import styles from '../components/sales/sales.module.css'

const krw = (n: number) => new Intl.NumberFormat('ko-KR').format(n)

/**
 * 분기계산 영역 placeholder — M3 EstimateBranchCalcService 통합 대기 (G13 b).
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

/**
 * 거래처 / 배송 정보 카드 — legacy `#cardOrderInfo` 의 form fields.
 *
 * <p>v2 §정정 16 — 거래처명 input 을 `<PartnerAutocomplete>` 로 교체. 선택 시
 * `onPartnerSelect` 가 거래처명/거래처코드/배송지/현장/연락처/메모 모두 자동 채움
 * (legacy `fillCustomer(c)` 1:1 변환).
 */
function OrderInfoCard({ onOpenAddr }: OrderInfoCardProps) {
  const orderInfo = usePricingStore((s) => s.orderInfo)
  const setOrderInfo = usePricingStore((s) => s.setOrderInfo)
  const setPartner = usePricingStore((s) => s.setPartner)

  /**
   * 거래처 선택 → legacy `fillCustomer(c)` 동작 그대로 적용.
   * 거래처명/거래처코드/연락처/배송지(주소)/메모(note) 모두 자동 채움.
   */
  function handlePartnerSelect(p: PartnerSummary) {
    setPartner(p.businessRegistrationNumber, p.companyName)
    if (p.contactPhone) setOrderInfo('contactPhone', p.contactPhone)
    if (p.address) setOrderInfo('deliveryAddress', p.address)
    if (p.note) setOrderInfo('memo', p.note)
  }

  return (
    <div className={styles['card']}>
      <div className={styles['cardHead']}>
        <div className={styles['cardTitle']}>거래처 / 배송 정보</div>
        <div className={styles['cardActions']}>
          <span style={{ fontSize: 11, color: '#6b7280' }}>
            거래처 선택 시 하단 자동 채움
          </span>
        </div>
      </div>
      <div className={styles['formGrid']}>
        <div className={styles['formField']} style={{ gridColumn: '1 / -1' }}>
          <label htmlFor="custSearch">거래처 검색</label>
          <PartnerAutocomplete
            inputId="custSearch"
            value={orderInfo.partnerName ?? ''}
            onChangeText={(t) => setPartner(orderInfo.partnerCode ?? '', t)}
            onSelect={handlePartnerSelect}
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
            readOnly
            style={{ background: '#f9fafb' }}
          />
        </div>
        <div className={styles['formField']}>
          <label htmlFor="custName">거래처명 (확정)</label>
          <input
            id="custName"
            type="text"
            value={orderInfo.partnerName ?? ''}
            onChange={(e) => setPartner(orderInfo.partnerCode ?? '', e.target.value)}
            placeholder="거래처 검색 후 자동 채움"
            readOnly
            style={{ background: '#f9fafb' }}
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
  const reorderLines = usePricingStore((s) => s.reorderLines)
  const totalsByCategory = usePricingStore((s) => s.totalsByCategory)
  const grandTotal = usePricingStore((s) => s.grandTotal)
  const countsByCategory = usePricingStore((s) => s.countsByCategory)

  const [pickerOpen, setPickerOpen] = useState(false)
  const [specModelCode, setSpecModelCode] = useState<string | null>(null)
  const [specProductName, setSpecProductName] = useState<string | null>(null)
  const [addrTarget, setAddrTarget] = useState<'delivery' | 'site' | null>(null)

  const setOrderInfo = usePricingStore((s) => s.setOrderInfo)

  // dnd sensors — Pointer 기준, 5px 이상 드래그 시 활성 (클릭 충돌 방지).
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

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

  // v2 §정정 1 — 라인 0건 시 그리드 카드 자체 숨김 + 거래처 카드만 노출.
  const hasLines = lines.length > 0

  const handlePick = (catalog: ProductCatalog, qty: number) => {
    addLineFromCatalog(catalog, qty)
    // 신규 라인의 카테고리로 자동 전환 (UX — 사용자가 추가한 카테고리를 즉시 보도록).
    if (catalog.estimateCategory) setActiveCategory(catalog.estimateCategory)
  }

  const handleAddrPick = (address: string) => {
    if (addrTarget === 'delivery') setOrderInfo('deliveryAddress', address)
    if (addrTarget === 'site') setOrderInfo('siteAddress', address)
    setAddrTarget(null)
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over) return
    if (active.id === over.id) return
    reorderLines(String(active.id), String(over.id))
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
          {/* v2 §정정 1 — counts 분포 기반 동적 렌더링. 0건 시 자동으로 null. */}
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
          {hasLines ? (
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
                <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
                  <table className={styles['estTable']}>
                    <thead>
                      <tr>
                        <th style={{ width: 36 }} aria-label="순서 변경"></th>
                        {/* v2 §정정 5 — '품명' → '품목명' */}
                        <th>품목명</th>
                        {/* v2 §정정 4 — '모델 코드' → '모델명' */}
                        <th>모델명</th>
                        <th>출고가</th>
                        <th style={{ width: 96 }}>수량</th>
                        <th>납품가</th>
                        <th>소계</th>
                        {/* v2 §정정 3 — 'Bundle' 컬럼 제거. 마지막은 액션 (Bundle 토글 또는 제거). */}
                        <th style={{ width: 140 }}>액션</th>
                      </tr>
                    </thead>
                    <SortableContext
                      items={linesByCategory.map((l) => l.id)}
                      strategy={verticalListSortingStrategy}
                    >
                      <tbody>
                        {linesByCategory.length === 0 ? (
                          <tr>
                            <td colSpan={8} style={{ padding: 24, color: '#6b7280' }}>
                              현 카테고리에 품목이 없습니다.
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
                              onBundleClick={() =>
                                setLineBundleMode(
                                  line.id,
                                  line.bundleMode === 'EXPAND' ? 'KEEP' : 'EXPAND',
                                )
                              }
                              onSpecClick={() => {
                                setSpecModelCode(line.modelCode)
                                setSpecProductName(line.productName)
                              }}
                            />
                          ))
                        )}
                      </tbody>
                    </SortableContext>
                    {linesByCategory.length > 0 ? (
                      <tfoot>
                        <tr className={styles['sumRow']}>
                          <td colSpan={6} style={{ textAlign: 'right' }}>
                            카테고리 합계
                          </td>
                          <td className="numeric">{krw(totals[activeCategory])}</td>
                          <td />
                        </tr>
                      </tfoot>
                    ) : null}
                  </table>
                </DndContext>
              </div>
            </div>
          ) : (
            <div className={styles['card']}>
              <div className={styles['cardHead']}>
                <div className={styles['cardTitle']}>품목</div>
              </div>
              <div className={styles['emptyState']}>
                <h3>품목이 없습니다</h3>
                <p>상단 [+ 품목 추가] 버튼으로 첫 라인을 추가하세요.</p>
                <p style={{ fontSize: 11, marginTop: 8 }}>
                  (라인이 추가되면 카테고리별 탭이 자동으로 표시됩니다 — v2 §정정 1)
                </p>
              </div>
            </div>
          )}

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
