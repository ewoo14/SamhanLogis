/**
 * 주문 작성 임시 store (Zustand) — v3 정정 #17 확장.
 *
 * 출처: legacy partner-order Code.js `saveOrderSnapshot` (Notion SNAPSHOT_009) →
 *      partner-order-service PartnerOrderDraft (§2.4.3).
 *
 * v2: 화면 전환 중 메모리 보존 만 책임.
 * v3 추가 (정정 #17 — `btnSaveDraft` / `btnDraftList`):
 *   - `snapshot()` — 현재 작성중인 라인을 별도 `snapshots` 배열에 보관
 *   - `loadSnapshot(id)` — 저장된 snapshot 을 현재 작성 line/info 로 복원
 *   - `removeSnapshot(id)` — 저장 항목 삭제
 *
 * 영구 임시저장은 `savePartnerOrderDraft()` API 호출 (Phase 6 이후).
 *
 * v3 추가 (정정 #18 — cardOrderInfo):
 *   - `dueDate` (납기희망일)
 *   - `requestNote` (요청사항 — memo 와 별개로 legacy `#memo` 라인 분리)
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

/** 저장된 draft snapshot (legacy `saveOrderSnapshot` 1:1) */
export interface DraftSnapshot {
  id: string;
  /** 저장 시점 ISO timestamp */
  savedAt: string;
  lines: DraftLine[];
  shippingAddress: string;
  receiverPhone: string;
  memo: string;
  dueDate: string;
  requestNote: string;
}

export interface OrderDraftState {
  lines: DraftLine[];
  shippingAddress: string;
  receiverPhone: string;
  memo: string;
  /** 정정 #18 — cardOrderInfo 납기희망일 (legacy `#due` line 1064) */
  dueDate: string;
  /** 정정 #18 — cardOrderInfo 요청사항 (legacy `#memo` line 1080) */
  requestNote: string;
  /** 정정 #17 — 저장된 draft 목록 (`btnSaveDraft` / `btnDraftList`) */
  snapshots: DraftSnapshot[];

  addLine: (line: Omit<DraftLine, 'tempKey'>) => void;
  updateQty: (tempKey: string, qty: number) => void;
  removeLine: (tempKey: string) => void;
  setShippingAddress: (v: string) => void;
  setReceiverPhone: (v: string) => void;
  setMemo: (v: string) => void;
  setDueDate: (v: string) => void;
  setRequestNote: (v: string) => void;
  reset: () => void;

  /** 정정 #17 — 현재 작성 상태를 snapshot 으로 보관 */
  snapshot: () => string;
  /** 저장된 snapshot 을 현재 작성 상태로 복원 */
  loadSnapshot: (id: string) => boolean;
  /** 저장된 snapshot 삭제 */
  removeSnapshot: (id: string) => void;
}

export const useOrderDraftStore = create<OrderDraftState>((set, get) => ({
  lines: [],
  shippingAddress: '',
  receiverPhone: '',
  memo: '',
  dueDate: '',
  requestNote: '',
  snapshots: [],

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
  setDueDate: (v) => set({ dueDate: v }),
  setRequestNote: (v) => set({ requestNote: v }),

  reset: () =>
    set({
      lines: [],
      shippingAddress: '',
      receiverPhone: '',
      memo: '',
      dueDate: '',
      requestNote: '',
    }),

  snapshot: () => {
    const s = get();
    const id = `snap-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const snap: DraftSnapshot = {
      id,
      savedAt: new Date().toISOString(),
      lines: s.lines.map((l) => ({ ...l })),
      shippingAddress: s.shippingAddress,
      receiverPhone: s.receiverPhone,
      memo: s.memo,
      dueDate: s.dueDate,
      requestNote: s.requestNote,
    };
    set((prev) => ({ snapshots: [snap, ...prev.snapshots] }));
    return id;
  },

  loadSnapshot: (id) => {
    const s = get();
    const target = s.snapshots.find((x) => x.id === id);
    if (!target) return false;
    set({
      lines: target.lines.map((l) => ({ ...l })),
      shippingAddress: target.shippingAddress,
      receiverPhone: target.receiverPhone,
      memo: target.memo,
      dueDate: target.dueDate,
      requestNote: target.requestNote,
    });
    return true;
  },

  removeSnapshot: (id) =>
    set((s) => ({
      snapshots: s.snapshots.filter((x) => x.id !== id),
    })),
}));
