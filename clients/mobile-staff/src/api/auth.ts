/**
 * iam-service M2 영업직원 인증 endpoint wrapper.
 *
 * 출처: 사용자 명시 (PR #60 회고) — mobile-staff = 영업직원 전용.
 *   - 옵션 A: SamhanLogis iam-service 의 `POST /api/v1/auth/staff-login` (사번 + 비밀번호)
 *   - 옵션 B: SSO (OAuth) — 후속 (v2)
 * 본 v1 = 사번 + 비밀번호 (단순, mock fallback).
 *
 * status 분기:
 *   - OK: 즉시 진입 가능 (token + employeeCode + employeeName 발급)
 *   - INVALID_CREDENTIALS: 사번/비밀번호 불일치
 *   - LOCKED: 3-fail 잠금 (관리자 해제 필요)
 *   - UNKNOWN: 미등록 사번
 *
 * UUID 미노출 — 영업직원 식별자는 사번 (employeeCode, e.g. "S001") + 이름 만 노출, employeeId UUID 는 내부.
 */

import { api } from './client';

export type StaffLoginStatus = 'OK' | 'INVALID_CREDENTIALS' | 'LOCKED' | 'UNKNOWN';

export interface StaffLoginResponse {
  status: StaffLoginStatus;
  /** 영업직원 사번 (e.g. "S001") — UUID 회피, 화면 노출 가능. */
  employeeCode?: string;
  /** 영업직원 이름 (e.g. "홍길동") — 화면 노출 가능. */
  employeeName?: string;
  /** OK 시 발급 token (이후 모든 호출 Bearer). */
  token?: string;
  /** LOCKED 시 잠금 사유. */
  lockReason?: string;
}

/**
 * 영업직원 사번 + 비밀번호 로그인.
 *
 * @param employeeCode 사번 (e.g. "S001")
 * @param password 비밀번호 (평문 — TLS 채널)
 *
 * 본 endpoint 가 아직 iam-service 에 미구현 (M2 후속) 일 경우, server 가 404 응답 시 본 함수는
 * Mock fallback 활성화 — `S001/1234` 또는 `S002/1234` 입력 시 mock token 반환.
 * 실 endpoint 구현 후 fallback 제거.
 */
export async function loginStaff(
  employeeCode: string,
  password: string,
): Promise<StaffLoginResponse> {
  const normalizedCode = employeeCode.trim().toUpperCase();
  try {
    const { data } = await api.post<StaffLoginResponse>('/api/v1/auth/staff-login', {
      employeeCode: normalizedCode,
      password,
    });
    return data;
  } catch (err: unknown) {
    // mock fallback — iam-service 의 staff-login endpoint 미구현 시 (404/Network) 로컬 검증 가능.
    const status = (err as { response?: { status?: number } })?.response?.status;
    const isMockable = status === 404 || status === undefined;
    if (isMockable) {
      // eslint-disable-next-line no-console
      console.warn('[mobile-staff] /api/v1/auth/staff-login 미구현 — mock fallback 활성화');
      return mockStaffLogin(normalizedCode, password);
    }
    throw err;
  }
}

/**
 * mock fallback — iam-service 의 staff-login endpoint 구현 전 로컬 검증용.
 *
 * 허용 자격증명:
 *   - S001 / 1234 → 홍길동
 *   - S002 / 1234 → 김영희
 *   - 그 외 → INVALID_CREDENTIALS
 */
function mockStaffLogin(employeeCode: string, password: string): StaffLoginResponse {
  if (password !== '1234') return { status: 'INVALID_CREDENTIALS' };
  if (employeeCode === 'S001') {
    return {
      status: 'OK',
      employeeCode: 'S001',
      employeeName: '홍길동',
      token: 'mock-token-staff-S001',
    };
  }
  if (employeeCode === 'S002') {
    return {
      status: 'OK',
      employeeCode: 'S002',
      employeeName: '김영희',
      token: 'mock-token-staff-S002',
    };
  }
  return { status: 'UNKNOWN' };
}
