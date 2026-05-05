/**
 * SamhanLogis mobile-staff — axios HTTP client.
 *
 * Mobile v4 (`clients/mobile/src/api/client.ts`) 와 동일 패턴.
 * baseURL:
 *   - dev: localhost:8080 (gateway-service)
 *   - prod: https://api.samhan-air.com
 *
 * 인증 토큰: AsyncStorage 의 'staff.auth.token' 자동 첨부 (StaffLogin 통과 후 저장).
 * Mobile v4 의 'auth.token' (거래처용) 와 분리 — 같은 디바이스에 양쪽 앱 설치 가능 시 충돌 방지.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import axios, { type AxiosInstance } from 'axios';

const DEFAULT_BASE_URL = __DEV__
  ? 'http://localhost:8080'
  : 'https://api.samhan-air.com';

/** AsyncStorage 토큰 키 — mobile-staff 전용 namespace ('staff.auth.*'). */
export const STORAGE_KEY_TOKEN = 'staff.auth.token';
export const STORAGE_KEY_EMPLOYEE_CODE = 'staff.auth.employeeCode';
export const STORAGE_KEY_EMPLOYEE_NAME = 'staff.auth.employeeName';

/**
 * 기본 axios 인스턴스. 모든 service 호출에 사용.
 *
 * @example
 *   const { data } = await api.post('/api/v1/auth/staff-login', { employeeCode, password });
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
      await AsyncStorage.multiRemove([
        STORAGE_KEY_TOKEN,
        STORAGE_KEY_EMPLOYEE_CODE,
        STORAGE_KEY_EMPLOYEE_NAME,
      ]);
    }
    return Promise.reject(err);
  },
);
