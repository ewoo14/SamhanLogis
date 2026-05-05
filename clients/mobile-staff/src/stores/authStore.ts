/**
 * 영업직원 인증 store (Zustand).
 *
 * Mobile v4 의 authStore (거래처 — partnerCode + partnerName) 와 분리.
 * mobile-staff = employeeCode (사번) + employeeName 노출.
 *
 * UUID 미노출 — 화면에는 employeeCode/employeeName 만 노출, employeeId 는 내부 만.
 *
 * AsyncStorage namespace = 'staff.auth.*' — 같은 디바이스에 Mobile v4 (거래처) 와 mobile-staff (영업)
 * 동시 설치 시 token 충돌 방지.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import {
  STORAGE_KEY_EMPLOYEE_CODE,
  STORAGE_KEY_EMPLOYEE_NAME,
  STORAGE_KEY_TOKEN,
} from '@/api/client';

export interface AuthState {
  /** 영업직원 사번 (e.g. "S001"). */
  employeeCode: string | null;
  /** 영업직원 이름 (e.g. "홍길동"). */
  employeeName: string | null;
  /** Bearer token. */
  token: string | null;
  /** isAuthenticated = token 존재. */
  isAuthenticated: boolean;
  hydrate: () => Promise<void>;
  login: (employeeCode: string, employeeName: string, token: string) => Promise<void>;
  logout: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  employeeCode: null,
  employeeName: null,
  token: null,
  isAuthenticated: false,

  /** 앱 부트 시 AsyncStorage 에서 토큰 복원. */
  hydrate: async () => {
    const [token, employeeCode, employeeName] = await Promise.all([
      AsyncStorage.getItem(STORAGE_KEY_TOKEN),
      AsyncStorage.getItem(STORAGE_KEY_EMPLOYEE_CODE),
      AsyncStorage.getItem(STORAGE_KEY_EMPLOYEE_NAME),
    ]);
    set({
      token,
      employeeCode,
      employeeName,
      isAuthenticated: Boolean(token),
    });
  },

  login: async (employeeCode, employeeName, token) => {
    await AsyncStorage.multiSet([
      [STORAGE_KEY_TOKEN, token],
      [STORAGE_KEY_EMPLOYEE_CODE, employeeCode],
      [STORAGE_KEY_EMPLOYEE_NAME, employeeName],
    ]);
    set({ token, employeeCode, employeeName, isAuthenticated: true });
  },

  logout: async () => {
    await AsyncStorage.multiRemove([
      STORAGE_KEY_TOKEN,
      STORAGE_KEY_EMPLOYEE_CODE,
      STORAGE_KEY_EMPLOYEE_NAME,
    ]);
    set({ token: null, employeeCode: null, employeeName: null, isAuthenticated: false });
  },
}));
