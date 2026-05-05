/**
 * 주문 작성 상태 — 4 카테고리 라인 + Bundle EXPAND/KEEP + 주문 정보.
 *
 * <p>legacy partner-order index.html 의 SPA 상태 (homeBody/singleBody/commBody/oldBody +
 * order info form) 를 단일 zustand store 로 통합.
 *
 * <p>주요 동작 (legacy 모방):
 * - {@link upsertLine}: 카테고리/모델 단위로 qty 갱신, qty=0 이면 라인 제거
 * - {@link toggleBundleMode}: Bundle (싱글세트 SET 등) EXPAND/KEEP 토글 — 발송 전 미리보기 시 표시
 * - {@link resetCategory}: 카테고리 초기화 (legacy `btnResetHome` 등 1:1)
 * - {@link clear}: 전체 초기화 (발송 완료 후)
 *
 * <p>session 단위 임시저장은 별도 `createOrderDraft` API 가 처리.
 */
import { create } from 'zustand'
import type { BundleMode, EstimateCategory, OrderInfo, OrderLine, ProductCatalog } from '../types'

interface OrderState {
  /** 현재 활성 카테고리 (legacy `body.home-active` 등). */
  activeCategory: EstimateCategory | null
  /** 모든 카테고리의 라인 누적 (lineKey 로 unique). */
  lines: OrderLine[]
  /** 주문 정보 (배송지/현장/인수자 등). */
  info: OrderInfo
  setActiveCategory: (cat: EstimateCategory | null) => void
  upsertLine: (product: ProductCatalog, qty: number) => void
  toggleBundleMode: (lineKey: string) => void
  removeLine: (lineKey: string) => void
  resetCategory: (cat: EstimateCategory) => void
  setInfo: (patch: Partial<OrderInfo>) => void
  clear: () => void
  /** 카테고리별 라인 합계 (legacy `homeTotal` 등). */
  totalForCategory: (cat: EstimateCategory) => number
  /** 전체 합계. */
  grandTotal: () => number
  /** 선택된 라인 수 (legacy `selectedCount` badge). */
  selectedCount: () => number
}

const EMPTY_INFO: OrderInfo = {
  deliveryAddress: '',
  deliveryAddressDetail: '',
  siteName: '',
  receiver: '',
  receiverPhone: '',
  dueDate: '',
  paymentNote: '',
  requestNote: '',
}

export const useOrderStore = create<OrderState>((set, get) => ({
  activeCategory: null,
  lines: [],
  info: { ...EMPTY_INFO },
  setActiveCategory: (cat) => set({ activeCategory: cat }),
  upsertLine: (product, qty) => {
    set((s) => {
      const existing = s.lines.find(
        (l) => l.modelCode === product.modelCode && l.estimateCategory === product.estimateCategory,
      )
      if (qty <= 0) {
        return existing ? { lines: s.lines.filter((l) => l !== existing) } : s
      }
      if (existing) {
        return {
          lines: s.lines.map((l) => (l === existing ? { ...l, qty } : l)),
        }
      }
      const newLine: OrderLine = {
        lineKey: `${product.estimateCategory}:${product.modelCode}:${Date.now()}`,
        modelCode: product.modelCode,
        productName: product.productName,
        unit: product.unit,
        qty,
        deliveryPrice: product.deliveryPrice,
        estimateCategory: product.estimateCategory,
        bundleMode: product.isBundle ? 'EXPAND' : undefined,
      }
      return { lines: [...s.lines, newLine] }
    })
  },
  toggleBundleMode: (lineKey) => {
    set((s) => ({
      lines: s.lines.map((l) =>
        l.lineKey === lineKey
          ? { ...l, bundleMode: nextBundleMode(l.bundleMode) }
          : l,
      ),
    }))
  },
  removeLine: (lineKey) => set((s) => ({ lines: s.lines.filter((l) => l.lineKey !== lineKey) })),
  resetCategory: (cat) => set((s) => ({ lines: s.lines.filter((l) => l.estimateCategory !== cat) })),
  setInfo: (patch) => set((s) => ({ info: { ...s.info, ...patch } })),
  clear: () => set({ activeCategory: null, lines: [], info: { ...EMPTY_INFO } }),
  totalForCategory: (cat) =>
    get()
      .lines.filter((l) => l.estimateCategory === cat)
      .reduce((sum, l) => sum + l.qty * l.deliveryPrice, 0),
  grandTotal: () => get().lines.reduce((sum, l) => sum + l.qty * l.deliveryPrice, 0),
  selectedCount: () => get().lines.length,
}))

function nextBundleMode(current: BundleMode | undefined): BundleMode {
  if (current === 'EXPAND') return 'KEEP'
  return 'EXPAND'
}
