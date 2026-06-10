/**
 * useCompanyProfile — 인쇄 양식 공급자 정보 훅.
 *
 * `GET /accounting/supplier-profiles/primary` (react-query, staleTime 5분) 로
 * COMPANY 동형 객체를 반환한다. 로딩 중·에러·기본 사업자 미등록 시 DEFAULT_COMPANY
 * fallback 을 즉시 반환하여 인쇄 양식이 항상 데이터를 가질 수 있도록 보장한다.
 *
 * 반환 형태 (CompanyProfile):
 * - legalName        상호
 * - legalNameEn      영문 상호 (정적 — BE 미구현)
 * - businessRegNo    사업자등록번호 "3-2-5" dash 포맷 (예: 2148720659 → "214-87-20659")
 * - subBusinessNo    종사업장번호 (없으면 '0000')
 * - ceo              대표 성명
 * - address          사업장 주소
 * - tel              대표 전화 (없으면 '')
 * - fax              팩스 (없으면 '')
 * - businessType     업태
 * - businessItem     종목
 * - logoPath         로고 경로 (정적 '/print-logo.svg')
 * - bankNotice       입금계좌 안내 문자열 (0건이면 빈 문자열 — placeholder 문구 인쇄 금지)
 * - stampUrl         인감 data URL (없으면 빈 문자열 → 미표시)
 *
 * UUID 비공개 가드:
 * - 훅 내부에서 id 등 UUID 를 반환 객체에 포함하지 않는다.
 *
 * @see feedback_uuid_no_user_visibility
 * @see PrintLayout DEFAULT_COMPANY
 */
import { useQuery } from '@tanstack/react-query'
import { getPrimarySupplierProfile, type SupplierProfile } from '../api/supplierProfileApi'

/** COMPANY 동형 인터페이스 — 12개 인쇄 뷰가 동일 형태로 사용. */
export interface CompanyProfile {
  legalName: string
  legalNameEn: string
  businessRegNo: string
  subBusinessNo: string
  ceo: string
  address: string
  tel: string
  fax: string
  businessType: string
  businessItem: string
  logoPath: string
  bankNotice: string
  stampUrl: string
}

/**
 * 사업자등록번호 10자리 → "3-2-5" dash 포맷.
 * "2148720659" → "214-87-20659"
 * 10자리가 아니면 원본 반환.
 */
function formatBizNoFull(raw: string): string {
  if (/^\d{10}$/.test(raw)) {
    return `${raw.slice(0, 3)}-${raw.slice(3, 5)}-${raw.slice(5)}`
  }
  // 이미 하이픈이 포함된 경우 (xxx-xx-xxxxx) 그대로 반환
  if (/^\d{3}-\d{2}-\d{5}$/.test(raw)) return raw
  return raw
}

/**
 * bankAccounts 배열 → 입금계좌 안내 문자열.
 *
 * 형식: "예금주:{holder}/{bank1} {acct1} {bank2} {acct2}…"
 * 0건이면 빈 문자열 (placeholder 문구 인쇄 금지 — spec §2c).
 *
 * 동일 예금주인 경우 첫 번째 계좌만 "예금주:{holder}/" prefix 를 붙이고
 * 이후 계좌는 "{bank} {acct}" 로 이어붙인다.
 */
function buildBankNotice(accounts: SupplierProfile['bankAccounts']): string {
  if (!accounts || accounts.length === 0) return ''
  const sorted = [...accounts].sort((a, b) => a.displayOrder - b.displayOrder)
  const firstHolder = sorted[0]!.accountHolder
  const allSameHolder = sorted.every((a) => a.accountHolder === firstHolder)
  if (allSameHolder) {
    const acctParts = sorted.map((a) => `${a.bankName} ${a.accountNumber}`).join(' ')
    return `예금주:${firstHolder}/${acctParts}`
  }
  // 예금주가 다른 경우 각 계좌마다 "예금주:{holder}/{bank} {acct}" 로 표시
  return sorted
    .map((a) => `예금주:${a.accountHolder}/${a.bankName} ${a.accountNumber}`)
    .join(' ')
}

/**
 * BE SupplierProfile → CompanyProfile 매핑.
 */
function toCompanyProfile(p: SupplierProfile): CompanyProfile {
  const representativeName = p.representativeName ?? p.ceoName ?? ''
  const businessAddress = p.businessAddress ?? p.address ?? ''
  return {
    legalName: p.companyName,
    legalNameEn: 'SAMHAN AIR-CONDITIONING SYSTEMS CO., LTD.',
    businessRegNo: formatBizNoFull(p.businessNumber),
    subBusinessNo: p.subBusinessNumber ?? '0000',
    ceo: representativeName,
    address: businessAddress,
    tel: p.tel ?? '',
    fax: p.fax ?? '',
    businessType: p.businessType,
    businessItem: p.businessItem,
    logoPath: '/print-logo.svg',
    bankNotice: buildBankNotice(p.bankAccounts),
    stampUrl: p.stampPngBase64 ? `data:image/png;base64,${p.stampPngBase64}` : '',
  }
}

/**
 * 기본 fallback — API 미응답 시 인쇄 양식 블랭크 방지.
 *
 * env 읽기 제거 (VITE_COMPANY_BANK_NOTICE / VITE_COMPANY_STAMP_URL 폐기 — spec §2c).
 * bankNotice placeholder 제거 — 계좌 미입력 시 빈 문자열.
 */
export const DEFAULT_COMPANY: CompanyProfile = {
  legalName: '(주)삼한공조시스템',
  legalNameEn: 'SAMHAN AIR-CONDITIONING SYSTEMS CO., LTD.',
  businessRegNo: '214-87-20659',
  subBusinessNo: '0000',
  ceo: '김미선',
  address: '서울특별시 서초구 마방로2길 9 (양재동) 삼한빌딩 4층',
  tel: '02-3461-0000',
  fax: '02-3461-0001',
  businessType: '도매 및 소매업',
  businessItem: '공조설비, 냉난방기',
  logoPath: '/print-logo.svg',
  bankNotice: '',
  stampUrl: '',
}

/**
 * 인쇄 양식 공급자 정보 훅.
 *
 * @returns company  - CompanyProfile (로딩 중에도 DEFAULT_COMPANY 즉시 반환)
 * @returns isLoading - true 이면 API 응답 대기 중 (현재 DEFAULT_COMPANY 표시)
 */
export function useCompanyProfile(): { company: CompanyProfile; isLoading: boolean } {
  const { data, isLoading } = useQuery({
    queryKey: ['supplier-profile-primary'],
    queryFn: getPrimarySupplierProfile,
    staleTime: 5 * 60 * 1000, // 5분
    // 에러 시 retry 2회 후 포기 → fallback 유지
    retry: 2,
  })

  const company = data ? toCompanyProfile(data) : DEFAULT_COMPANY

  return { company, isLoading }
}
