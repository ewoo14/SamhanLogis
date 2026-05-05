/**
 * dcConfigStore — 거래처별 DC 설정 store (Zustand).
 *
 * DECISIONS Phase 6 정정 #12 — 사업자번호 입장 시 DC율 자동 적용된 가격 표시.
 * Web v2 의 `dcConfigStore` 와 동일 책임 (mobile 1:1).
 *
 * 흐름:
 *   1. BizGate 인증 OK → `fetchPartnerDcConfig(partnerCode)` 호출 → `setConfig` 저장
 *   2. OrderForm / ProductPicker / OrderDetail 에서 `useDcConfig` 로 구독 → `calcDcPrice` 적용
 *   3. logout → `clear()` 로 초기화
 *
 * UUID 미노출 — partnerCode (사업자번호) 가 key. partnerId 는 내부 fetch 만.
 */

import { create } from 'zustand';
import { api } from '@/api/client';
import type { PartnerDcConfig } from '@/utils/calcDcPrice';

export interface DcConfigState {
  /** 현재 사업자번호 — 인증 후 BizGate 가 setPartnerCode 호출 */
  partnerCode: string | null;
  /** 서버에서 fetch 된 DC 설정 (없으면 default 0) */
  config: PartnerDcConfig | null;
  /** loading flag */
  loading: boolean;
  /** 마지막 fetch 오류 (있으면 표시) */
  error: string | null;

  /** BizGate 인증 후 호출 — partnerCode 저장 + DC 설정 fetch */
  loadForPartner: (partnerCode: string) => Promise<void>;
  /** 수동 setter (테스트/외부 주입) */
  setConfig: (config: PartnerDcConfig | null) => void;
  /** logout 시 초기화 */
  clear: () => void;
}

/**
 * GET /api/v1/partner-dc-configs/{partnerCode}
 *   - M1a 보강 endpoint (DECISIONS Phase 6 §정정 #12 + #13 csv 222 row 시드)
 *   - 미등록 거래처는 404 → null 반환 (DC 0%)
 */
async function fetchPartnerDcConfig(partnerCode: string): Promise<PartnerDcConfig | null> {
  try {
    const { data } = await api.get<PartnerDcConfig>(`/api/v1/partner-dc-configs/${encodeURIComponent(partnerCode)}`);
    return data;
  } catch (e: unknown) {
    const status = (e as { response?: { status?: number } })?.response?.status;
    if (status === 404) return null;
    throw e;
  }
}

export const useDcConfigStore = create<DcConfigState>((set) => ({
  partnerCode: null,
  config: null,
  loading: false,
  error: null,

  loadForPartner: async (partnerCode) => {
    set({ partnerCode, loading: true, error: null });
    try {
      const cfg = await fetchPartnerDcConfig(partnerCode);
      set({ config: cfg, loading: false });
    } catch {
      set({ config: null, loading: false, error: 'DC 설정을 불러오지 못했습니다. 표시 가격은 정상가 기준입니다.' });
    }
  },

  setConfig: (config) => set({ config }),

  clear: () => set({ partnerCode: null, config: null, loading: false, error: null }),
}));
