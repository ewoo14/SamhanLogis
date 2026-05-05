/**
 * 거래처 DC 설정 store — BizGate 인증 통과 후 backend 에서 fetch + cache.
 *
 * <p>흐름:
 * 1. {@link import('../routes/BizGatePage').BizGatePage} 의 `tryLogin` 성공 직후
 *    `loadFor(partnerCode)` 호출.
 * 2. {@link import('../api/dc').getPartnerDcConfig} 실 호출 (mock fallback).
 * 3. 결과는 `config` 에 저장 — `OrderFormPage` 의 라인 grid 가 본 store 를 구독.
 * 4. 로그아웃 시 `clear()`.
 *
 * <p>UUID 비공개 가드 — partnerCode 는 사업자번호 그 자체 (UUID 아님), 노출 무방.
 */
import { create } from 'zustand'
import type { PartnerDcConfig } from '../types'
import { getPartnerDcConfig } from '../api/dc'

interface DcConfigState {
  /** 현재 로그인 거래처의 DC 설정. null = 미로딩 또는 미등록. */
  config: PartnerDcConfig | null
  /** 가장 최근 로딩한 partnerCode (중복 호출 방지). */
  loadedFor: string | null
  /** 로딩 중 표시. */
  loading: boolean
  /** 마지막 오류 (UI 표시용). */
  error: string | null
  loadFor: (partnerCode: string) => Promise<void>
  clear: () => void
}

export const useDcConfigStore = create<DcConfigState>((set, get) => ({
  config: null,
  loadedFor: null,
  loading: false,
  error: null,
  loadFor: async (partnerCode) => {
    if (!partnerCode) return
    if (get().loadedFor === partnerCode && get().config) return
    set({ loading: true, error: null })
    try {
      const cfg = await getPartnerDcConfig(partnerCode)
      set({ config: cfg, loadedFor: partnerCode, loading: false })
    } catch (e) {
      set({
        loading: false,
        error: e instanceof Error ? e.message : 'DC 설정 조회 실패',
      })
    }
  },
  clear: () => set({ config: null, loadedFor: null, error: null, loading: false }),
}))
