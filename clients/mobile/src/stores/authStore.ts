/**
 * 인증 store (Zustand).
 *
 * 출처: legacy partner-order Code.js USER_EMAIL Notion AUTH 조회 → 토큰 캐싱.
 * UUID 미노출 — 화면에는 partnerCode/partnerName 만 노출, partnerId 는 내부 만.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { STORAGE_KEY_PARTNER_CODE, STORAGE_KEY_PARTNER_NAME, STORAGE_KEY_TOKEN } from '@/api/client';

export interface AuthState {
  partnerCode: string | null;
  partnerName: string | null;
  token: string | null;
  isAuthenticated: boolean;
  hydrate: () => Promise<void>;
  login: (partnerCode: string, partnerName: string, token: string) => Promise<void>;
  logout: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  partnerCode: null,
  partnerName: null,
  token: null,
  isAuthenticated: false,

  /** 앱 부트 시 AsyncStorage 에서 토큰 복원 */
  hydrate: async () => {
    const [token, partnerCode, partnerName] = await Promise.all([
      AsyncStorage.getItem(STORAGE_KEY_TOKEN),
      AsyncStorage.getItem(STORAGE_KEY_PARTNER_CODE),
      AsyncStorage.getItem(STORAGE_KEY_PARTNER_NAME),
    ]);
    set({
      token,
      partnerCode,
      partnerName,
      isAuthenticated: Boolean(token),
    });
  },

  login: async (partnerCode, partnerName, token) => {
    await AsyncStorage.multiSet([
      [STORAGE_KEY_TOKEN, token],
      [STORAGE_KEY_PARTNER_CODE, partnerCode],
      [STORAGE_KEY_PARTNER_NAME, partnerName],
    ]);
    set({ token, partnerCode, partnerName, isAuthenticated: true });
  },

  logout: async () => {
    await AsyncStorage.multiRemove([STORAGE_KEY_TOKEN, STORAGE_KEY_PARTNER_CODE, STORAGE_KEY_PARTNER_NAME]);
    set({ token: null, partnerCode: null, partnerName: null, isAuthenticated: false });
  },
}));
