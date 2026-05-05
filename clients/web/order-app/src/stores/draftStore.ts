/**
 * 정정 #17 — 주문저장 (PartnerOrderDraft, 30일 expiry).
 *
 * <p>legacy partner-order index.html 의 `handleSaveSnapshot` (line 8502) 흐름:
 * <ul>
 *   <li>btnSaveDraft → 현재 lines + info 를 30일 보관 (`PartnerOrderDraft`)</li>
 *   <li>btnDraftList → 저장 목록 navigate (`/orders/snapshots`)</li>
 * </ul>
 *
 * <p>Backend M4 partner-order-service `/api/v1/partner-orders/drafts` 미존재 →
 * 단계 1 sessionStorage fallback (key `samhan.order.draft.mock`).
 */
import { create } from 'zustand'
import type { OrderInfo, OrderLine } from '../types'

const STORAGE_KEY = 'samhan.order.draft.mock'

/** 만료 기간 (밀리초) — 30일. */
const EXPIRY_MS = 30 * 24 * 60 * 60 * 1000

export interface PartnerOrderDraft {
  /** 저장 시각 (ISO datetime). */
  savedAt: string
  /** 만료 시각 (ISO datetime, savedAt + 30일). */
  expireAt: string
  /** 저장 시 표시명 (사용자 메모). */
  title: string
  /** 거래처 사업자번호. */
  bizno: string
  partnerName: string
  /** 저장 라인. */
  lines: OrderLine[]
  /** 저장 정보. */
  info: OrderInfo
  /** 합계 (저장 시점 스냅샷). */
  totalAmount: number
}

interface DraftState {
  drafts: PartnerOrderDraft[]
  /** sessionStorage → state 부트. */
  bootstrap: () => void
  saveDraft: (input: Omit<PartnerOrderDraft, 'savedAt' | 'expireAt'>) => PartnerOrderDraft
  deleteDraft: (savedAt: string) => void
  clear: () => void
}

function readStorage(): PartnerOrderDraft[] {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const list = JSON.parse(raw) as PartnerOrderDraft[]
    // 만료 정리 (30일 초과 자동 제거)
    const now = Date.now()
    return list.filter((d) => new Date(d.expireAt).getTime() > now)
  } catch {
    return []
  }
}

function writeStorage(list: PartnerOrderDraft[]): void {
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(list))
  } catch {
    /* ignore */
  }
}

export const useDraftStore = create<DraftState>((set, get) => ({
  drafts: [],
  bootstrap: () => set({ drafts: readStorage() }),
  saveDraft: (input) => {
    const savedAt = new Date().toISOString()
    const expireAt = new Date(Date.now() + EXPIRY_MS).toISOString()
    const draft: PartnerOrderDraft = { ...input, savedAt, expireAt }
    const next = [draft, ...get().drafts]
    writeStorage(next)
    set({ drafts: next })
    return draft
  },
  deleteDraft: (savedAt) => {
    const next = get().drafts.filter((d) => d.savedAt !== savedAt)
    writeStorage(next)
    set({ drafts: next })
  },
  clear: () => {
    writeStorage([])
    set({ drafts: [] })
  },
}))
