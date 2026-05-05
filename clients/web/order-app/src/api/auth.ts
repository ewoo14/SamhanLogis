/**
 * 거래처 인증 API — M2 partner-service `partner-auth` endpoint 1:1 매핑.
 *
 * <p>본 파일은 mock fallback 포함 (M2 통합 전 단계).
 * legacy partner-order Code.js 의 인증 함수군 매핑:
 *
 * <ul>
 *   <li>{@link checkAuthStatus} — `checkAuthStatus(bizno)` — status 10 enum 분기</li>
 *   <li>{@link tryLogin} — `tryLogin(bizno, pw)` — 4자리 PW 로그인 (3-fail LOCKED)</li>
 *   <li>{@link setAuthPassword} — `setAuthPassword(bizno, pw, pw2)` — 신규 PW 설정</li>
 *   <li>{@link requestAuthApproval} — `requestAuthApproval(bizno, contact)` — 승인 요청</li>
 * </ul>
 *
 * <p>운영 endpoint (M2 통합 후):
 * <pre>
 *   POST /api/v1/partner-auth/check    body: { bizno }
 *   POST /api/v1/partner-auth/login    body: { bizno, pw }
 *   POST /api/v1/partner-auth/set-pw   body: { bizno, pw, pw2 }
 *   POST /api/v1/partner-auth/request  body: { bizno, contact, requesterName }
 * </pre>
 *
 * <p>현 단계: BE 미존재 → axios 호출 시 네트워크 오류 발생하면 mock fallback.
 */
import axios from 'axios'
import { apiClient } from './client'
import type { AuthSession, AuthStatus } from '../types'

const MOCK_BIZNO_OK = '123-45-67890'
const MOCK_BIZNO_NEED_PW_INPUT = '111-11-11111'
const MOCK_BIZNO_NEED_PW_SET = '222-22-22222'
const MOCK_BIZNO_PENDING = '333-33-33333'
const MOCK_BIZNO_LOCKED = '444-44-44444'

/**
 * 사업자번호로 인증 상태 조회.
 *
 * <p>legacy `checkAuthStatus(bizno)` 1:1 모방. M2 통합 전에는 BE 호출 실패 시
 * 사업자번호 패턴 기반 mock 응답 반환 (BizGate UI 시연용).
 *
 * @param bizno 사업자등록번호 (`000-00-00000`)
 */
export async function checkAuthStatus(bizno: string): Promise<{ status: AuthStatus; partnerName: string; message: string }> {
  try {
    const res = await apiClient.post<{ status: AuthStatus; partnerName: string; message: string }>(
      '/api/v1/partner-auth/check',
      { bizno },
    )
    return res.data
  } catch (err) {
    // BE 미존재 / 네트워크 오류 — mock fallback (개발 단계 시연용)
    if (axios.isAxiosError(err) && (err.response === undefined || err.response.status === 404)) {
      return mockCheckStatus(bizno)
    }
    throw err
  }
}

function mockCheckStatus(bizno: string): { status: AuthStatus; partnerName: string; message: string } {
  const cleaned = bizno.replace(/\s/g, '')
  if (cleaned === MOCK_BIZNO_OK) {
    return { status: 'NEED_PW_INPUT', partnerName: '(주)테스트거래처', message: '비밀번호를 입력해주세요.' }
  }
  if (cleaned === MOCK_BIZNO_NEED_PW_INPUT) {
    return { status: 'NEED_PW_INPUT', partnerName: '(주)예시상사', message: '비밀번호를 입력해주세요.' }
  }
  if (cleaned === MOCK_BIZNO_NEED_PW_SET) {
    return { status: 'NEED_PW_SET', partnerName: '신규 등록 거래처', message: '신규 비밀번호 4자리를 설정해주세요.' }
  }
  if (cleaned === MOCK_BIZNO_PENDING) {
    return { status: 'PENDING', partnerName: '(주)대기거래처', message: '승인 대기 중입니다. 영업일 1~2일 소요됩니다.' }
  }
  if (cleaned === MOCK_BIZNO_LOCKED) {
    return { status: 'LOCKED', partnerName: '(주)잠금거래처', message: '비밀번호 3회 오입력으로 잠금되었습니다.' }
  }
  return { status: 'NOT_FOUND_AUTH', partnerName: '', message: '등록된 거래처가 없습니다. 승인 요청을 보내주세요.' }
}

/**
 * 4자리 비밀번호로 로그인. 3 회 실패 시 LOCKED.
 *
 * @returns 성공 시 `AuthSession` (token + 사용기한)
 */
export async function tryLogin(bizno: string, pw: string): Promise<AuthSession> {
  try {
    const res = await apiClient.post<AuthSession>('/api/v1/partner-auth/login', { bizno, pw })
    return res.data
  } catch (err) {
    if (axios.isAxiosError(err) && (err.response === undefined || err.response.status === 404)) {
      // mock — pw 가 '0000' 이면 성공
      if (pw === '0000') {
        return {
          partnerName: '(주)테스트거래처',
          bizno,
          status: 'OK',
          token: `mock.token.${Date.now()}`,
          accessLimit: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
        }
      }
      throw new Error('비밀번호가 일치하지 않습니다.')
    }
    throw err
  }
}

/** 신규 PW 4자리 설정 (확인 일치 + 과거 5개 중복 차단). */
export async function setAuthPassword(bizno: string, pw: string, pw2: string): Promise<AuthSession> {
  if (pw !== pw2) {
    throw new Error('비밀번호 확인이 일치하지 않습니다.')
  }
  if (!/^\d{4}$/.test(pw)) {
    throw new Error('숫자 4자리만 입력해주세요.')
  }
  try {
    const res = await apiClient.post<AuthSession>('/api/v1/partner-auth/set-pw', { bizno, pw, pw2 })
    return res.data
  } catch (err) {
    if (axios.isAxiosError(err) && (err.response === undefined || err.response.status === 404)) {
      return {
        partnerName: '(주)신규거래처',
        bizno,
        status: 'OK',
        token: `mock.newpw.${Date.now()}`,
        accessLimit: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      }
    }
    throw err
  }
}

/** 거래처 등록 승인 요청 (PENDING 으로 전이). */
export async function requestAuthApproval(input: {
  bizno: string
  partnerName: string
  contact: string
  requesterName: string
}): Promise<{ status: 'PENDING'; message: string }> {
  try {
    const res = await apiClient.post<{ status: 'PENDING'; message: string }>(
      '/api/v1/partner-auth/request',
      input,
    )
    return res.data
  } catch (err) {
    if (axios.isAxiosError(err) && (err.response === undefined || err.response.status === 404)) {
      return { status: 'PENDING', message: '승인 요청이 접수되었습니다. 관리자 검토 후 안내드리겠습니다.' }
    }
    throw err
  }
}
