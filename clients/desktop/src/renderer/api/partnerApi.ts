/**
 * 거래처 4탭 풀 API 클라이언트 — P0-6 슬라이스.
 *
 * <p>BE endpoint (partner-service, {@code Partner4TabController}):
 * <ul>
 *   <li>GET    /api/v1/partners/{partnerCode}/full   — 4탭 전체 조회</li>
 *   <li>POST   /api/v1/partners/full                  — 4탭 신규 등록</li>
 *   <li>PATCH  /api/v1/partners/{partnerCode}/full    — 4탭 전체 수정</li>
 *   <li>GET    /api/v1/partners/{partnerCode}/price-discount — 단가/할인 탭</li>
 *   <li>PUT    /api/v1/partners/{partnerCode}/price-discount — 단가/할인 탭 UPSERT</li>
 *   <li>GET    /api/v1/partners/{partnerCode}/shipping-addresses — 배송지 목록</li>
 *   <li>POST   /api/v1/partners/{partnerCode}/shipping-addresses — 배송지 추가</li>
 *   <li>DELETE /api/v1/partners/{partnerCode}/shipping-addresses/{addressId} — 배송지 삭제</li>
 *   <li>GET    /api/v1/partners/{partnerCode}/contacts — 담당자 목록</li>
 *   <li>POST   /api/v1/partners/{partnerCode}/contacts — 담당자 추가</li>
 *   <li>DELETE /api/v1/partners/{partnerCode}/contacts/{contactId} — 담당자 삭제</li>
 * </ul>
 *
 * <p><b>TM PR #141 cross-check fix</b> — Path variable 이름 (partnerCode), HTTP method
 * (price-discount = PUT), DTO 필드명 (basicDiscountRate / contactName / zipCode /
 * receiverName / discountMemo) 을 BE Partner4TabController 와 1:1 로 정렬.
 *
 * <p>UUID 비공개 가드 (memory feedback_uuid_no_user_visibility) — id 는 mutation path key 전용.
 * 화면 노출 식별자 = partnerCode / name 만.
 *
 * <p>화면 진입과 4탭 mutation 은 각 호출처에서 @RequirePermission page-code/action 을 사용한다.
 */
import { apiClient, type ApiEnvelope } from './client'
import type { PartnerOption } from '@samhan/design-system'

// ---------------------------------------------------------------------------
// 공통 열거형
// ---------------------------------------------------------------------------

/** 거래처 유형 — BE PartnerType enum 과 1:1. */
export type PartnerType = 'CUSTOMER' | 'SUPPLIER' | 'BOTH'

/** PartnerType → 한국어 표시 라벨. */
export const PARTNER_TYPE_LABEL: Record<PartnerType, string> = {
  CUSTOMER: '고객',
  SUPPLIER: '공급사',
  BOTH: '고객/공급사',
}

/**
 * 거래처 상태 표시 라벨 — PartnerDetailDialog 상태 표시용.
 * adminApi 의 PartnerStatus 와 동일 값이지만, partnerApi 에서 직접 참조하기 위해 재선언.
 */
export const PARTNER_STATUS_DISPLAY: Record<string, string> = {
  ACTIVE: '거래중',
  SUSPENDED: '거래중지',
  TERMINATED: '거래종료',
}

// ---------------------------------------------------------------------------
// 기본정보 탭 DTO — BE PartnerBasicResponse 와 1:1
// ---------------------------------------------------------------------------

/**
 * 기본정보 탭 응답 — BE {@code PartnerBasicResponse} record 와 1:1.
 *
 * <p>UUID 미포함 (BE record 가 id 를 반환하지 않음). 사용자 노출 식별자 = partnerCode / name.
 */
export interface PartnerBasic {
  /** 거래처 코드 (사용자 노출 식별자). 예: P-2026-0001 */
  partnerCode: string
  /** 사업자등록번호. 예: 123-45-67890 */
  bizNo: string
  /** 거래처 상호. */
  name: string
  /** 대표자명. */
  representative: string | null
  /** 업태. */
  businessType: string | null
  /** 종목. */
  industry: string | null
  /** 사업장 주소 (legacy). */
  address: string | null
  /** 대표 연락처. */
  phone: string | null
  /** FAX. */
  fax: string | null
  /** 이메일 (대표). */
  email: string | null
  /** 이메일 (보조). */
  email2: string | null
  /** 휴대전화. */
  mobile: string | null
  /** 홈페이지. */
  website: string | null
  /** 거래처 분류1. */
  partnerGroup1: string | null
  /** 거래처 분류2. */
  partnerGroup2: string | null
  /** 신용한도 (원, BE BigDecimal → number). */
  creditLimit: number | null
  /** 미수금 잔액. */
  outstandingBalance: number | null
  /** 거래 상태. */
  status: 'ACTIVE' | 'SUSPENDED' | 'TERMINATED'
  /** 거래 시작일 (회계상). ISO yyyy-MM-dd */
  registrationDate: string | null
  /** 이체정보 (MIG-1 신규, 이카운트 V9). */
  transferInfo: string | null
  /** 특이사항 (MIG-1 신규, 이카운트 V9). */
  note: string | null
  /** 담당자명 (MIG-1 신규, 이카운트 V9). */
  managerName: string | null
}

// ---------------------------------------------------------------------------
// 단가/할인 정책 탭 DTO — BE PartnerPriceDiscountResponse / Request 와 1:1
// ---------------------------------------------------------------------------

/**
 * 단가/할인 정책 응답 — BE {@code PartnerPriceDiscountResponse} record 와 1:1.
 */
export interface PartnerPriceDiscount {
  /** 기본 할인율 (%, BE BigDecimal → number). 예: 5.00 */
  basicDiscountRate: number
  /** 결제 조건 (일수). NULL 가능. */
  paymentTermDays: number | null
  /** 할인 정책 비고. */
  discountMemo: string | null
}

/** 단가/할인 탭 입력 요청 — BE {@code PartnerPriceDiscountRequest} 와 1:1. */
export interface PartnerPriceDiscountRequest {
  basicDiscountRate: number
  paymentTermDays?: number | null
  discountMemo?: string | null
}

// ---------------------------------------------------------------------------
// 배송지 탭 DTO — BE PartnerShippingAddressResponse / Request 와 1:1
// ---------------------------------------------------------------------------

/**
 * 배송지 1건 응답 — BE {@code PartnerShippingAddressResponse} record 와 1:1.
 *
 * <p>id (UUID) 는 path variable (DELETE) 전용, 화면 미노출.
 */
export interface PartnerShippingAddress {
  /** 내부 UUID — DELETE path 전용, 화면 미노출. */
  id: string
  /** 배송지 별칭. 예: 본사창고 */
  alias: string | null
  /** 우편번호. */
  zipCode: string | null
  /** 배송지 주소. */
  address: string
  /** 연락처. */
  phone: string | null
  /** 수신 담당자명. */
  receiverName: string | null
  /** 기본 배송지 여부. */
  isDefault: boolean
  /** 비고. */
  memo: string | null
}

/** 배송지 1건 입력 요청 — BE {@code PartnerShippingAddressRequest} 와 1:1. */
export interface PartnerShippingAddressRequest {
  alias?: string | null
  zipCode?: string | null
  address: string
  phone?: string | null
  receiverName?: string | null
  isDefault?: boolean
  memo?: string | null
}

// ---------------------------------------------------------------------------
// 담당자 탭 DTO — BE PartnerContactResponse / Request 와 1:1
// ---------------------------------------------------------------------------

/**
 * 담당자 1건 응답 — BE {@code PartnerContactResponse} record 와 1:1.
 *
 * <p>id (UUID) 는 path variable (DELETE) 전용, 화면 미노출.
 */
export interface PartnerContact {
  /** 내부 UUID — DELETE path 전용, 화면 미노출. */
  id: string
  /** 담당자명. */
  contactName: string
  /** 직책. 예: 과장 */
  position: string | null
  /** 직통 전화. */
  phone: string | null
  /** 이메일. */
  email: string | null
  /** 주 담당자 여부. */
  isPrimary: boolean
  /** 비고. */
  memo: string | null
}

/** 담당자 1건 입력 요청 — BE {@code PartnerContactRequest} 와 1:1. */
export interface PartnerContactRequest {
  contactName: string
  position?: string | null
  phone?: string | null
  email?: string | null
  isPrimary?: boolean
  memo?: string | null
}

// ---------------------------------------------------------------------------
// 4탭 풀 DTO — BE PartnerFullResponse / PartnerFullRequest 와 1:1
// ---------------------------------------------------------------------------

/**
 * 거래처 4탭 전체 응답 — BE {@code PartnerFullResponse} record 와 1:1.
 *
 * <p>{@code basic} (PartnerBasicResponse) + {@code priceDiscount} +
 * {@code shippingAddresses[]} + {@code contacts[]}.
 */
export interface PartnerFullResponse {
  basic: PartnerBasic
  priceDiscount: PartnerPriceDiscount
  shippingAddresses: PartnerShippingAddress[]
  contacts: PartnerContact[]
}

/**
 * 거래처 4탭 신규 등록 / 전체 수정 요청 — BE {@code PartnerFullRequest} record 와 1:1.
 *
 * <p>flat 구조 — partnerCode / bizNo / name 은 신규 등록 시 필수, 수정 시 path 식별이므로 선택.
 * BE record 시그니처: {@code (partnerCode, bizNo, name, priceDiscount, shippingAddresses, contacts)}.
 */
export interface PartnerFullRequest {
  /** 거래처 코드 (신규 등록 시 필수). */
  partnerCode?: string | null
  /** 사업자번호 (신규 등록 시 필수). */
  bizNo?: string | null
  /** 거래처 상호 (필수). */
  name: string
  priceDiscount?: PartnerPriceDiscountRequest | null
  shippingAddresses?: PartnerShippingAddressRequest[] | null
  contacts?: PartnerContactRequest[] | null
}

/**
 * @deprecated TM PR #141 cross-check 이전 명칭. {@link PartnerFullRequest} 사용.
 *   호환성 유지를 위해 alias 만 남김 (PartnerCreatePage / PartnerDetailDialog 가 사용).
 */
export type PartnerCreateFullRequest = PartnerFullRequest

// ---------------------------------------------------------------------------
// API 함수 — 모든 path variable 은 partnerCode (BE Controller 와 일치)
// ---------------------------------------------------------------------------

/**
 * 거래처 4탭 전체 조회 — `GET /api/v1/partners/{partnerCode}/full`.
 *
 * @param partnerCode 거래처 코드 (예: P-2026-0001) — UUID 가 아님.
 */
export async function getPartnerFull(
  partnerCode: string,
): Promise<PartnerFullResponse> {
  const res = await apiClient.get<ApiEnvelope<PartnerFullResponse>>(
    `/api/v1/partners/${encodeURIComponent(partnerCode)}/full`,
  )
  return res.data.data
}

/**
 * 거래처 4탭 신규 등록 — `POST /api/v1/partners/full`.
 *
 * @param body 4탭 전체 입력 (flat 구조 — BE PartnerFullRequest record 와 1:1).
 */
export async function createPartnerFull(
  body: PartnerFullRequest,
): Promise<PartnerFullResponse> {
  const res = await apiClient.post<ApiEnvelope<PartnerFullResponse>>(
    '/api/v1/partners/full',
    body,
  )
  return res.data.data
}

/**
 * 거래처 4탭 전체 수정 — `PATCH /api/v1/partners/{partnerCode}/full`.
 *
 * @param partnerCode 거래처 코드 (path variable)
 * @param body 4탭 전체 수정 데이터 (flat)
 */
export async function updatePartnerFull(
  partnerCode: string,
  body: PartnerFullRequest,
): Promise<PartnerFullResponse> {
  const res = await apiClient.patch<ApiEnvelope<PartnerFullResponse>>(
    `/api/v1/partners/${encodeURIComponent(partnerCode)}/full`,
    body,
  )
  return res.data.data
}

/**
 * 단가/할인 탭 개별 조회 — `GET /api/v1/partners/{partnerCode}/price-discount`.
 */
export async function getPartnerPriceDiscount(
  partnerCode: string,
): Promise<PartnerPriceDiscount> {
  const res = await apiClient.get<ApiEnvelope<PartnerPriceDiscount>>(
    `/api/v1/partners/${encodeURIComponent(partnerCode)}/price-discount`,
  )
  return res.data.data
}

/**
 * 단가/할인 탭 개별 UPSERT — `PUT /api/v1/partners/{partnerCode}/price-discount`.
 *
 * <p>BE method = PUT (UPSERT 시맨틱). PATCH 호출 시 405.
 */
export async function upsertPartnerPriceDiscount(
  partnerCode: string,
  body: PartnerPriceDiscountRequest,
): Promise<PartnerPriceDiscount> {
  const res = await apiClient.put<ApiEnvelope<PartnerPriceDiscount>>(
    `/api/v1/partners/${encodeURIComponent(partnerCode)}/price-discount`,
    body,
  )
  return res.data.data
}

/**
 * @deprecated TM PR #141 cross-check 이전 명칭. {@link upsertPartnerPriceDiscount} 사용.
 */
export const updatePartnerPriceDiscount = upsertPartnerPriceDiscount

/**
 * 배송지 탭 목록 조회 — `GET /api/v1/partners/{partnerCode}/shipping-addresses`.
 */
export async function listPartnerShippingAddresses(
  partnerCode: string,
): Promise<PartnerShippingAddress[]> {
  const res = await apiClient.get<ApiEnvelope<PartnerShippingAddress[]>>(
    `/api/v1/partners/${encodeURIComponent(partnerCode)}/shipping-addresses`,
  )
  return res.data.data
}

/**
 * 배송지 추가 — `POST /api/v1/partners/{partnerCode}/shipping-addresses`.
 */
export async function addPartnerShippingAddress(
  partnerCode: string,
  body: PartnerShippingAddressRequest,
): Promise<PartnerShippingAddress> {
  const res = await apiClient.post<ApiEnvelope<PartnerShippingAddress>>(
    `/api/v1/partners/${encodeURIComponent(partnerCode)}/shipping-addresses`,
    body,
  )
  return res.data.data
}

/**
 * 배송지 삭제 — `DELETE /api/v1/partners/{partnerCode}/shipping-addresses/{addressId}`.
 */
export async function deletePartnerShippingAddress(
  partnerCode: string,
  addressId: string,
): Promise<void> {
  await apiClient.delete<void>(
    `/api/v1/partners/${encodeURIComponent(partnerCode)}/shipping-addresses/${encodeURIComponent(addressId)}`,
  )
}

/**
 * 담당자 목록 조회 — `GET /api/v1/partners/{partnerCode}/contacts`.
 */
export async function listPartnerContacts(
  partnerCode: string,
): Promise<PartnerContact[]> {
  const res = await apiClient.get<ApiEnvelope<PartnerContact[]>>(
    `/api/v1/partners/${encodeURIComponent(partnerCode)}/contacts`,
  )
  return res.data.data
}

/**
 * 담당자 추가 — `POST /api/v1/partners/{partnerCode}/contacts`.
 */
export async function addPartnerContact(
  partnerCode: string,
  body: PartnerContactRequest,
): Promise<PartnerContact> {
  const res = await apiClient.post<ApiEnvelope<PartnerContact>>(
    `/api/v1/partners/${encodeURIComponent(partnerCode)}/contacts`,
    body,
  )
  return res.data.data
}

/**
 * 담당자 삭제 — `DELETE /api/v1/partners/{partnerCode}/contacts/{contactId}`.
 */
export async function deletePartnerContact(
  partnerCode: string,
  contactId: string,
): Promise<void> {
  await apiClient.delete<void>(
    `/api/v1/partners/${encodeURIComponent(partnerCode)}/contacts/${encodeURIComponent(contactId)}`,
  )
}

// ---------------------------------------------------------------------------
// 결정적 mock 데이터 (VITE_MOCK_MODE=1 시 사용, Math.random 사용 금지)
// ---------------------------------------------------------------------------

/**
 * P0-6 개발/QA용 결정적 mock PartnerFullResponse — BE record 시그니처와 1:1.
 *
 * <p>UUID 는 내부 전용 — 화면 표시 없음. partnerCode / name 만 노출.
 */
export const MOCK_PARTNER_FULL: PartnerFullResponse = {
  basic: {
    partnerCode: 'P-2026-0001',
    bizNo: '123-45-67890',
    name: '(주)한국공조',
    representative: '홍길동',
    businessType: '제조업',
    industry: '공조시스템',
    address: '서울특별시 강남구 테헤란로 123',
    phone: '02-1234-5678',
    fax: null,
    email: 'tax@hankookhvac.co.kr',
    email2: null,
    mobile: '010-1111-2222',
    website: null,
    partnerGroup1: 'VIP거래처',
    partnerGroup2: '수도권',
    creditLimit: 50_000_000,
    outstandingBalance: 0,
    status: 'ACTIVE',
    registrationDate: '2024-01-02',
    transferInfo: null,
    note: null,
    managerName: '홍길동',
  },
  priceDiscount: {
    basicDiscountRate: 5.0,
    paymentTermDays: 30,
    discountMemo: 'VIP 할인',
  },
  shippingAddresses: [
    {
      id: 'a2000000-0000-0000-0000-000000000001',
      alias: '본사창고',
      zipCode: '06234',
      address: '서울특별시 강남구 테헤란로 123 지하 1층',
      phone: '02-1234-5678',
      receiverName: '홍길동',
      isDefault: true,
      memo: null,
    },
    {
      id: 'a2000000-0000-0000-0000-000000000002',
      alias: '판교창고',
      zipCode: '13494',
      address: '경기도 성남시 분당구 판교로 100',
      phone: '031-9876-5432',
      receiverName: '판교담당',
      isDefault: false,
      memo: null,
    },
  ],
  contacts: [
    {
      id: 'c3000000-0000-0000-0000-000000000001',
      contactName: '김영업',
      position: '부장',
      phone: '010-1111-2222',
      email: 'sales@hankookhvac.co.kr',
      isPrimary: true,
      memo: null,
    },
    {
      id: 'c3000000-0000-0000-0000-000000000002',
      contactName: '이구매',
      position: '과장',
      phone: '010-3333-4444',
      email: 'purchase@hankookhvac.co.kr',
      isPrimary: false,
      memo: null,
    },
  ],
}

// ---------------------------------------------------------------------------
// AC-3 슬라이스 — 거래처 서버검색 자동완성
// ---------------------------------------------------------------------------

/**
 * admin-service `PartnerSummaryResponse` 매핑 타입 (AC-3 FE 전용).
 *
 * <p>BE `GET /admin/partners/search` 응답의 `items` 배열 원소.
 * `partnerId` UUID 는 BE 응답에 포함되지만 화면 표시 금지 — hidden state/API payload 전용.
 */
interface PartnerSummaryResponse {
  /** 내부 partnerId UUID — 화면 표시 금지, API payload 전용. */
  partnerId?: string | null
  partnerCode: string
  name: string
  bizNo?: string | null
  phone?: string | null
}

/**
 * admin-service `AdminPartnerListResponse` 래퍼.
 */
interface AdminPartnerListResponse {
  items: PartnerSummaryResponse[]
  total?: number
  page?: number
  size?: number
}

/**
 * 거래처 부분 검색 — `GET /admin/partners/search?q={q}&size={limit}`.
 *
 * <p>admin-service 의 `AdminPartnerController.search` 로 라우팅.
 * `q` 파라미터로 partnerCode/name/bizNo/phone LIKE 검색.
 *
 * UUID 비공개 가드: partnerId 는 화면 표시 없이 payload 전용으로만 사용한다.
 *
 * @param q 검색어 (거래처명·코드·사업자번호·전화 부분 입력)
 * @param options.limit 선택 모달 등 전체 후보가 필요한 호출처만 지정하는 상한. 기본 20은
 * 기존 자동완성 소비처의 비용·동작을 보존한다.
 * @param options.throwOnError 병합 후보처럼 권한/서버 오류를 호출처가 안내해야 할 때 true.
 * 기본값 false는 기존 자동완성 소비처의 graceful degradation 계약을 유지한다.
 * @returns `PartnerOption[]` — 기본값에서는 실패 시 빈 배열
 */
export async function searchPartners(
  q: string,
  options?: { activeOnly?: boolean; throwOnError?: boolean; limit?: number },
): Promise<PartnerOption[]> {
  try {
    const res = await apiClient.get<ApiEnvelope<AdminPartnerListResponse>>(
      '/admin/partners/search',
      {
        params: { q, size: options?.limit ?? 20, ...(options?.activeOnly ? { status: 'ACTIVE' } : {}) },
      },
    )
    const data = res.data.data
    const items = Array.isArray(data?.items) ? data.items : []
    return items.map((p): PartnerOption => ({
      id: p.partnerId ?? undefined,
      partnerCode: p.partnerCode ?? '',
      name: p.name ?? '',
      bizNo: p.bizNo ?? undefined,
      phone: p.phone ?? undefined,
    }))
  } catch (error) {
    if (options?.throwOnError) throw error
    // 기존 소비처 호환: 네트워크/서버 오류를 빈 배열로 반환한다.
    return []
  }
}
