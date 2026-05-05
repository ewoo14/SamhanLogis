/**
 * 주문 작성 상태 — 4 카테고리 라인 + Bundle EXPAND/KEEP + 주문 정보 + DC 적용 가격.
 *
 * <p>legacy partner-order index.html 의 SPA 상태 (homeBody/singleBody/commBody/oldBody +
 * order info form) 를 단일 zustand store 로 통합.
 *
 * <p>주요 동작 (legacy 모방 + v2 정정):
 * - {@link upsertLine}: 카테고리/모델 단위로 qty 갱신, qty=0 이면 라인 제거
 * - {@link toggleBundleMode}: Bundle (싱글세트 SET 등) EXPAND/KEEP 토글
 * - {@link reorderLines}: 정정 #2 — drag-and-drop 정렬 변경 (sortOrder 갱신)
 * - {@link toggleOption}: 정정 #12 — 라인 옵션 (4way/360 등) 토글, DC config 의 가산 적용
 * - {@link totalForCategory} / {@link grandTotal}: DC config 적용 후 finalPrice 합계
 *
 * <p>합계 계산 시 `useDcConfigStore.getState().config` 을 동적 참조 (store 간 결합 최소화).
 */
import { create } from 'zustand'
import type { BundleMode, EstimateCategory, LineOption, OrderInfo, OrderLine, ProductCatalog } from '../types'
import { calcLineFinalPrice } from '../utils/calcDcPrice'
import { useDcConfigStore } from './dcConfigStore'

interface OrderState {
  /** 현재 활성 카테고리 (legacy `body.home-active` 등). */
  activeCategory: EstimateCategory | null
  /** 모든 카테고리의 라인 누적 (lineKey 로 unique). sortOrder 기준 정렬. */
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
  /** 카테고리별 라인 합계 — DC config 적용 후 finalPrice × qty 합계. */
  totalForCategory: (cat: EstimateCategory) => number
  /** 전체 합계 (DC + 옵션 적용 후). */
  grandTotal: () => number
  /** 선택된 라인 수 (legacy `selectedCount` badge). */
  selectedCount: () => number
  /**
   * 정정 #2 — drag-and-drop 으로 라인 순서 변경.
   *
   * @param category 변경 대상 카테고리 (다른 카테고리 라인 영향 없음)
   * @param fromIndex 카테고리 내부 index
   * @param toIndex 카테고리 내부 index
   */
  reorderLines: (category: EstimateCategory, fromIndex: number, toIndex: number) => void
  /** 정정 #12 — 라인의 옵션 (4way/360/1way 등) 토글. */
  toggleOption: (lineKey: string, opt: LineOption) => void
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

/** 라인 단위 final 단가 = DC 적용 후 + 옵션 가산 (소계 = qty × finalPrice). */
function lineFinalUnit(line: OrderLine): number {
  const config = useDcConfigStore.getState().config
  return calcLineFinalPrice({
    releasePrice: line.releasePrice,
    category: line.estimateCategory,
    options: line.options,
    config,
  }).finalPrice
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
      const nextSortOrder = nextSortOrderFor(s.lines, product.estimateCategory)
      const newLine: OrderLine = {
        lineKey: `${product.estimateCategory}:${product.modelCode}:${Date.now()}`,
        modelCode: product.modelCode,
        productName: product.productName,
        unit: product.unit,
        qty,
        releasePrice: product.releasePrice,
        estimateCategory: product.estimateCategory,
        bundleMode: product.isBundle ? 'EXPAND' : undefined,
        options: [],
        sortOrder: nextSortOrder,
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
      .reduce((sum, l) => sum + l.qty * lineFinalUnit(l), 0),
  grandTotal: () => get().lines.reduce((sum, l) => sum + l.qty * lineFinalUnit(l), 0),
  selectedCount: () => get().lines.length,
  reorderLines: (category, fromIndex, toIndex) => {
    set((s) => {
      const inCat = s.lines
        .filter((l) => l.estimateCategory === category)
        .sort((a, b) => a.sortOrder - b.sortOrder)
      if (fromIndex < 0 || fromIndex >= inCat.length || toIndex < 0 || toIndex >= inCat.length) {
        return s
      }
      const reordered = [...inCat]
      const [moved] = reordered.splice(fromIndex, 1)
      if (!moved) return s
      reordered.splice(toIndex, 0, moved)
      // sortOrder 재할당 (10 단위 — 후속 삽입 여유)
      const updated = reordered.map((l, idx) => ({ ...l, sortOrder: (idx + 1) * 10 }))
      const others = s.lines.filter((l) => l.estimateCategory !== category)
      return { lines: [...others, ...updated] }
    })
  },
  toggleOption: (lineKey, opt) => {
    set((s) => ({
      lines: s.lines.map((l) => {
        if (l.lineKey !== lineKey) return l
        const cur = l.options ?? []
        const has = cur.includes(opt)
        const next = has ? cur.filter((o) => o !== opt) : [...cur, opt]
        return { ...l, options: next }
      }),
    }))
  },
}))

function nextSortOrderFor(lines: OrderLine[], cat: EstimateCategory): number {
  const inCat = lines.filter((l) => l.estimateCategory === cat)
  if (inCat.length === 0) return 10
  return Math.max(...inCat.map((l) => l.sortOrder)) + 10
}

function nextBundleMode(current: BundleMode | undefined): BundleMode {
  if (current === 'EXPAND') return 'KEEP'
  return 'EXPAND'
}
