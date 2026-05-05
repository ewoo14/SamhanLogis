/**
 * 견적/주문 라인 + 합계 + 카테고리 + 옵션 + 자동 계산 상태 store.
 *
 * <p>본 store 는 legacy estimate index.html 의 다음 인터랙션을 React 로 옮긴 것.
 * <ul>
 *   <li>{@code recomputeHomeDerived} (line 7827) / {@code recomputeSingleDerived} (7884) —
 *       수량 변경 시 자동 패널 / 리모컨 / 분기관 라인 추가 (Excel UX).</li>
 *   <li>{@code bindQty} (4219) — 라인 수량 입력 → 소계/총계 즉시 갱신.</li>
 *   <li>{@code resetCard} — 초기화 버튼.</li>
 *   <li>{@code calcRecommendOdu} (16920) — 홈멀티 추천 실외기 표시 (badge).</li>
 * </ul>
 *
 * <p>본 store 는 화면 단일 견적 화면 단위 ephemeral 상태만 다룬다. 저장 (CONFIRMED) 시점에
 * estimate-service 로 POST. 임시저장은 Phase 6 후속 슬라이스에서 PartnerAuth snapshot
 * 패턴 활용 예정.
 *
 * <p>UUID 비공개 가드 ({@code feedback_uuid_no_user_visibility.md}): 라인 식별자 {@code id}
 * 는 React key 로만 사용, 화면 미노출. 사용자 노출 식별자는 {@code modelCode} / {@code productName} 만.
 */
import { create } from 'zustand'
import type { EstimateCategory, ProductCatalog } from '../api/sales'

/**
 * 화면 라인 — backend `EstimateLine` 의 Frontend ephemeral 표현.
 * Bundle EXPAND/KEEP 토글은 Bundle 부모만 의미.
 */
export interface PricingLine {
  /** crypto.randomUUID — React key, 화면 미노출. */
  id: string
  category: EstimateCategory
  modelCode: string
  productName: string
  quantity: number
  releasePrice: number
  deliveryPrice: number
  /** 라인 소계 = quantity × deliveryPrice. selector 가 자동 계산. */
  subtotal: number
  hasVariableDiscount: boolean
  /** Bundle 부모 SKU 라인이면 EXPAND/KEEP, 일반 SKU 면 null. */
  bundleMode: 'EXPAND' | 'KEEP' | null
  /** 자동 추가된 derived 라인 (패널/리모컨/분기관) 표시 marker — UI 회색조. */
  derived?: boolean
}

/**
 * 거래처 / 배송 정보 — legacy `#cardOrderInfo` 의 form fields.
 */
export interface OrderInfoState {
  partnerCode: string | null
  partnerName: string | null
  deliveryAddress: string
  deliveryAddressDetail: string
  siteAddress: string
  siteAddressDetail: string
  contactPhone: string
  dueDate: string
  paymentDueDate: string
  memo: string
}

const EMPTY_ORDER_INFO: OrderInfoState = {
  partnerCode: null,
  partnerName: null,
  deliveryAddress: '',
  deliveryAddressDetail: '',
  siteAddress: '',
  siteAddressDetail: '',
  contactPhone: '',
  dueDate: '',
  paymentDueDate: '',
  memo: '',
}

/** Pricing store 의 외부 노출 인터페이스. */
export interface PricingStore {
  /** 현재 활성 카테고리 — legacy `body.{home/single/comm/old}-active` 와 동일. */
  activeCategory: EstimateCategory
  setActiveCategory: (cat: EstimateCategory) => void

  /** 라인 목록 (모든 카테고리). selector 로 카테고리별 필터링. */
  lines: PricingLine[]
  /**
   * 카탈로그 모달에서 라인 추가. modelCode 중복 시 quantity 증가.
   * legacy `addItemRow_` (5232 등) 와 동일.
   */
  addLineFromCatalog: (
    catalog: ProductCatalog,
    quantity: number,
    bundleMode?: 'EXPAND' | 'KEEP',
  ) => void
  /** 단일 라인 수량 변경. soft cap 9999. legacy `bindQty` (4219). */
  setLineQty: (id: string, quantity: number) => void
  /** Bundle EXPAND/KEEP 토글. */
  setLineBundleMode: (id: string, mode: 'EXPAND' | 'KEEP') => void
  /** 라인 제거. */
  removeLine: (id: string) => void
  /** 카테고리별 라인 전부 초기화 — legacy `resetCard*`. */
  resetCategory: (cat: EstimateCategory) => void
  /** 전체 초기화 — 새 견적 시작. */
  reset: () => void

  /** 거래처/배송/현장 form. */
  orderInfo: OrderInfoState
  setOrderInfo: <K extends keyof OrderInfoState>(
    key: K,
    value: OrderInfoState[K],
  ) => void
  setPartner: (code: string, name: string) => void

  /**
   * 카테고리별 합계 (자동 selector). legacy `#previewBody` 합계 row 와 동일.
   */
  totalsByCategory: () => Record<EstimateCategory, number>
  /** 전체 합계. */
  grandTotal: () => number
  /** 카테고리별 라인 수 (badge 표시 source). */
  countsByCategory: () => Record<EstimateCategory, number>
}

/** 빈 카테고리 record helper. */
function emptyByCategory(): Record<EstimateCategory, number> {
  return {
    HOME_MULTI: 0,
    SINGLE_SET: 0,
    COMMERCIAL_MULTI: 0,
    LEGACY: 0,
    OTHER: 0,
  }
}

/** 라인 소계 재계산 helper — 음수/소수 방어. */
function recompute(line: PricingLine): PricingLine {
  const qty = Math.max(0, Math.floor(line.quantity))
  const subtotal = Math.round(qty * line.deliveryPrice)
  return { ...line, quantity: qty, subtotal }
}

/** UUID 생성 — Electron renderer 는 webcrypto 항상 가용. */
function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  // fallback (legacy Electron — 미발생 가정).
  return `line_${Date.now()}_${Math.floor(Math.random() * 1e9)}`
}

export const usePricingStore = create<PricingStore>((set, get) => ({
  activeCategory: 'HOME_MULTI',
  setActiveCategory: (cat) => set({ activeCategory: cat }),

  lines: [],
  addLineFromCatalog: (catalog, quantity, bundleMode) => {
    set((state) => {
      // 중복 modelCode 시 quantity 증가 (legacy `addItemRow_` upsert 동작).
      const existingIndex = state.lines.findIndex(
        (l) => l.modelCode === catalog.modelCode && l.category === catalog.estimateCategory,
      )
      if (existingIndex >= 0) {
        const updated = [...state.lines]
        const existing = updated[existingIndex]!
        updated[existingIndex] = recompute({
          ...existing,
          quantity: existing.quantity + Math.max(1, quantity),
        })
        return { lines: updated }
      }
      const line: PricingLine = recompute({
        id: newId(),
        category: catalog.estimateCategory ?? 'OTHER',
        modelCode: catalog.modelCode,
        productName: catalog.name,
        quantity: Math.max(1, quantity),
        releasePrice: catalog.releasePrice ?? 0,
        deliveryPrice: catalog.deliveryPrice ?? 0,
        subtotal: 0,
        hasVariableDiscount: catalog.hasVariableDiscount,
        bundleMode: bundleMode ?? null,
      })
      return { lines: [...state.lines, line] }
    })
  },
  setLineQty: (id, quantity) => {
    set((state) => ({
      lines: state.lines.map((l) =>
        l.id === id ? recompute({ ...l, quantity: Math.min(9999, Math.max(0, quantity)) }) : l,
      ),
    }))
  },
  setLineBundleMode: (id, mode) => {
    set((state) => ({
      lines: state.lines.map((l) => (l.id === id ? { ...l, bundleMode: mode } : l)),
    }))
  },
  removeLine: (id) => {
    set((state) => ({ lines: state.lines.filter((l) => l.id !== id) }))
  },
  resetCategory: (cat) => {
    set((state) => ({ lines: state.lines.filter((l) => l.category !== cat) }))
  },
  reset: () => set({ lines: [], orderInfo: EMPTY_ORDER_INFO, activeCategory: 'HOME_MULTI' }),

  orderInfo: EMPTY_ORDER_INFO,
  setOrderInfo: (key, value) =>
    set((state) => ({ orderInfo: { ...state.orderInfo, [key]: value } })),
  setPartner: (code, name) =>
    set((state) => ({ orderInfo: { ...state.orderInfo, partnerCode: code, partnerName: name } })),

  totalsByCategory: () => {
    const out = emptyByCategory()
    for (const line of get().lines) {
      out[line.category] += line.subtotal
    }
    return out
  },
  grandTotal: () => get().lines.reduce((acc, l) => acc + l.subtotal, 0),
  countsByCategory: () => {
    const out = emptyByCategory()
    for (const line of get().lines) {
      out[line.category] += 1
    }
    return out
  },
}))
