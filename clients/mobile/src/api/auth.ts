/**
 * partner-service 인증 (M2) endpoint wrapper.
 *
 * 출처: migration/analysis/04-migration-plan.md §2.2 + §2.4 인증 흐름.
 *
 * BizGate status 분기 (legacy partner-order Code.js #pageBizGate):
 *   - OK: 즉시 진입 가능
 *   - REQUIRES_PASSWORD: 임시 PW 입력 화면
 *   - REQUIRES_REGISTRATION: 신규 가입 요청
 *   - LOCKED: 3-fail 잠금 (관리자 해제 필요)
 *   - UNKNOWN: 미등록 사업자번호
 */

import { api } from './client';

export type BizGateStatus = 'OK' | 'REQUIRES_PASSWORD' | 'REQUIRES_REGISTRATION' | 'LOCKED' | 'UNKNOWN';

export interface BizGateResponse {
  status: BizGateStatus;
  partnerCode?: string;
  partnerName?: string;
  /** OK 시 발급 토큰 (이후 모든 호출 Bearer) */
  token?: string;
  /** LOCKED 시 잠금 사유 */
  lockReason?: string;
}

/**
 * 사업자번호 게이트.
 *
 * @param bizNo 10자리 사업자번호 (하이픈 포함/제외 모두 허용)
 */
export async function checkBizGate(bizNo: string): Promise<BizGateResponse> {
  const normalized = bizNo.replace(/[^0-9]/g, '');
  const { data } = await api.post<BizGateResponse>('/api/v1/auth/biz-gate', { bizNo: normalized });
  return data;
}

/** 임시 PW 4자리 검증 */
export async function loginWithTempPassword(bizNo: string, tempPassword: string): Promise<BizGateResponse> {
  const normalized = bizNo.replace(/[^0-9]/g, '');
  const { data } = await api.post<BizGateResponse>('/api/v1/auth/login-temp', {
    bizNo: normalized,
    tempPassword,
  });
  return data;
}

/** 신규 가입 요청 */
export async function requestRegistration(bizNo: string, contactName: string, contactPhone: string): Promise<{ requestId: string }> {
  const normalized = bizNo.replace(/[^0-9]/g, '');
  const { data } = await api.post<{ requestId: string }>('/api/v1/auth/register', {
    bizNo: normalized,
    contactName,
    contactPhone,
  });
  return data;
}
