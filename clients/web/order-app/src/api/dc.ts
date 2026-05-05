/**
 * 거래처별 DC 설정 API — backend `partner-service` (M2 통합 후) endpoint.
 *
 * <p>endpoint:
 * <pre>
 *   GET /api/v1/partners/{partnerCode}/dc-config
 * </pre>
 *
 * <p>현 단계 (M2 미존재) → mock fallback. csv 222 row 중 4 sample partner 시연용.
 * 실 row sample 은 `migration/source/sheet/거래처별 DC리스트 *.csv` 참조.
 */
import axios from 'axios'
import { apiClient } from './client'
import type { PartnerDcConfig } from '../types'

/**
 * 사업자번호 (10자리, 하이픈 제거) 로 거래처 DC 설정 조회.
 *
 * <p>`partnerCode` = 사업자번호 그 자체 (`AuthSession.partnerCode`).
 *
 * @returns DC 설정 — 미등록 거래처면 null (모든 옵션 미적용 = 출고가 그대로)
 */
export async function getPartnerDcConfig(partnerCode: string): Promise<PartnerDcConfig | null> {
  try {
    const res = await apiClient.get<PartnerDcConfig>(
      `/api/v1/partners/${encodeURIComponent(partnerCode)}/dc-config`,
    )
    return res.data
  } catch (err) {
    if (axios.isAxiosError(err)) {
      // 404 = 거래처는 있으나 DC 설정 미등록 — null 반환 (출고가 그대로 적용)
      if (err.response?.status === 404) return null
      // 네트워크 오류 / BE 미존재 → mock
      if (err.response === undefined) return mockDcConfig(partnerCode)
    }
    throw err
  }
}

/**
 * Mock fallback — csv 222 row 중 4 sample partner 시연용.
 *
 * csv source row:
 * <pre>
 * 4348703365,주식회사 엠엠시스템에어(고영현),46%,,Yes,,,,,,,
 * 2568700899,주식회사 제이앤피공조,,,No,"₩70,000","₩70,000","₩50,000","₩70,000",,,,
 * 2188601069,(주)삼성에스에이씨비투비(더블유케이),45%,,No,"₩20,000","₩20,000","₩20,000","₩20,000",,,
 * </pre>
 */
function mockDcConfig(partnerCode: string): PartnerDcConfig | null {
  // csv row 1: 홈멀티 46% / I형 노출
  if (partnerCode === '4348703365') {
    return {
      partnerCode,
      partnerName: '주식회사 엠엠시스템에어 (고영현)',
      homeMultiDc: 0.46,
      commercialMultiDc: null,
      flexibleHoseI: true,
      option360: null,
      option4way: null,
      option1way: null,
      optionStand: null,
      optionDeluxe: null,
      option1Grade: null,
      unitProcessing: null,
      note: 'csv 시드 row 1',
    }
  }
  // csv row 3: 홈멀티 미적용 / 옵션 가산 거래처
  if (partnerCode === '2568700899') {
    return {
      partnerCode,
      partnerName: '주식회사 제이앤피공조',
      homeMultiDc: null,
      commercialMultiDc: null,
      flexibleHoseI: false,
      option360: 70000,
      option4way: 70000,
      option1way: 50000,
      optionStand: 70000,
      optionDeluxe: null,
      option1Grade: null,
      unitProcessing: null,
      note: 'csv 시드 row 3 — 옵션 가산 거래처',
    }
  }
  // csv row 4: 홈멀티 45% + 옵션 20000 가산
  if (partnerCode === '2188601069') {
    return {
      partnerCode,
      partnerName: '(주)삼성에스에이씨비투비 (더블유케이)',
      homeMultiDc: 0.45,
      commercialMultiDc: null,
      flexibleHoseI: false,
      option360: 20000,
      option4way: 20000,
      option1way: 20000,
      optionStand: 20000,
      optionDeluxe: null,
      option1Grade: null,
      unitProcessing: null,
      note: 'csv 시드 row 4',
    }
  }
  // mock 인증 BIZNO 와 매핑 (auth.ts 의 MOCK_BIZNO_OK = '123-45-67890' → '1234567890')
  if (partnerCode === '1234567890') {
    return {
      partnerCode,
      partnerName: '(주)테스트거래처',
      homeMultiDc: 0.46,
      commercialMultiDc: 0.4,
      flexibleHoseI: true,
      option360: 70000,
      option4way: 70000,
      option1way: 50000,
      optionStand: 70000,
      optionDeluxe: null,
      option1Grade: null,
      unitProcessing: 1000,
      note: 'mock 시연용 — 홈멀티 46% / 상업멀티 40% / 4 옵션 가산',
    }
  }
  return null
}

/** 사업자번호 → partnerCode (하이픈 제거 10 자리). */
export function biznoToPartnerCode(bizno: string): string {
  return bizno.replace(/\D/g, '').slice(0, 10)
}
