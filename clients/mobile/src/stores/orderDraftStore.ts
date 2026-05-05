/**
 * 주문 작성 임시 store (Zustand).
 *
 * 출처: legacy partner-order Code.js `saveOrderSnapshot` (Notion SNAPSHOT_009) →
 *      partner-order-service PartnerOrderDraft (§2.4.3).
 *
 * 본 store 는 화면 전환 중 메모리 보존 만 책임.
 * 영구 임시저장은 `savePartnerOrderDraft()` API 호출.
 */

import { create } from 'zustand';
import type { EstimateCategory } from '@/api/product';

export interface DraftLine {
  /** 클라이언트 임시 키 (저장 시 서버 발급 id 로 교체) */
  tempKey: string;
  category: EstimateCategory;
  modelCode: string;
  modelName: string;
  qty: number;
  unitPrice: number;
}

export interface OrderDraftState {
  lines: DraftLine[];
  shippingAddress: string;
  receiverPhone: string;
  memo: string;
  addLine: (line: Omit<DraftLine, 'tempKey'>) => void;
  updateQty: (tempKey: string, qty: number) => void;
  removeLine: (tempKey: string) => void;
  setShippingAddress: (v: string) => void;
  setReceiverPhone: (v: string) => void;
  setMemo: (v: string) => void;
  reset: () => void;
}

export const useOrderDraftStore = create<OrderDraftState>((set) => ({
  lines: [],
  shippingAddress: '',
  receiverPhone: '',
  memo: '',

  addLine: (line) =>
    set((s) => ({
      lines: [...s.lines, { ...line, tempKey: `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` }],
    })),

  updateQty: (tempKey, qty) =>
    set((s) => ({
      lines: s.lines.map((l) => (l.tempKey === tempKey ? { ...l, qty } : l)),
    })),

  removeLine: (tempKey) =>
    set((s) => ({
      lines: s.lines.filter((l) => l.tempKey !== tempKey),
    })),

  setShippingAddress: (v) => set({ shippingAddress: v }),
  setReceiverPhone: (v) => set({ receiverPhone: v }),
  setMemo: (v) => set({ memo: v }),

  reset: () => set({ lines: [], shippingAddress: '', receiverPhone: '', memo: '' }),
}));
