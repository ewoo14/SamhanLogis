/**
 * SamhanLogis Mobile — axios HTTP client.
 *
 * 출처:
 *   - migration/analysis/04-migration-plan.md §2.1.7 (M1a backend endpoint)
 *   - migration/analysis/04-migration-plan.md §2.4 partner-order-service M4
 *
 * baseURL:
 *   - dev: localhost:8080 (gateway-service)
 *   - prod: https://api.samhan-air.com
 *
 * 인증 토큰: AsyncStorage 의 'auth.token' 자동 첨부 (BizGate 통과 후 저장).
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import axios, { type AxiosInstance } from 'axios';

const DEFAULT_BASE_URL = __DEV__
  ? 'http://localhost:8080'
  : 'https://api.samhan-air.com';

/** AsyncStorage 토큰 키 (UUID 미노출 원칙 — token 본체만 저장, partnerId 별도). */
export const STORAGE_KEY_TOKEN = 'auth.token';
export const STORAGE_KEY_PARTNER_CODE = 'auth.partnerCode';
export const STORAGE_KEY_PARTNER_NAME = 'auth.partnerName';

/**
 * 기본 axios 인스턴스. 모든 service 호출에 사용.
 *
 * @example
 *   const { data } = await api.get<PartnerOrderListResponse>('/api/v1/partner-orders');
 */
export const api: AxiosInstance = axios.create({
  baseURL: DEFAULT_BASE_URL,
  timeout: 15_000,
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },
});

api.interceptors.request.use(async (config) => {
  const token = await AsyncStorage.getItem(STORAGE_KEY_TOKEN);
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (res) => res,
  async (err) => {
    if (err?.response?.status === 401) {
      await AsyncStorage.multiRemove([STORAGE_KEY_TOKEN, STORAGE_KEY_PARTNER_CODE, STORAGE_KEY_PARTNER_NAME]);
    }
    return Promise.reject(err);
  },
);
