/**
 * 거래처 4탭 풀 API 클라이언트 — P0-6 슬라이스.
 *
 * <p>BE endpoint (partner-service):
 * <ul>
 *   <li>GET    /api/v1/partners/{id}/full   — 4탭 전체 조회</li>
 *   <li>POST   /api/v1/partners/full        — 4탭 신규 등록</li>
 *   <li>PATCH  /api/v1/partners/{id}/full   — 4탭 전체 수정</li>
 *   <li>GET    /api/v1/partners/{id}/price-discount — 단가/할인 탭</li>
 *   <li>PATCH  /api/v1/partners/{id}/price-discount — 단가/할인 탭 수정</li>
 *   <li>GET    /api/v1/partners/{id}/shipping-addresses — 배송지 탭</li>
 *   <li>POST   /api/v1/partners/{id}/shipping-addresses — 배송지 추가</li>
 *   <li>DELETE /api/v1/partners/{id}/shipping-addresses/{addressId} — 배송지 삭제</li>
 *   <li>GET    /api/v1/partners/{id}/contacts — 담당자 탭</li>
 *   <li>POST   /api/v1/partners/{id}/contacts — 담당자 추가</li>
 *   <li>DELETE /api/v1/partners/{id}/contacts/{contactId} — 담당자 삭제</li>
 * </ul>
 *
 * <p>UUID 비공개 가드: 내부 id (UUID) 는 mutation path key 전용.
 * 화면 노출 식별자 = partnerCode / businessName 만.
 *
 * <p>@PreAuthorize — SALES / MANAGER / MASTER (BE 와 일치).
 */
import { apiClient, type ApiEnvelope } from './client'

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
// 기본정보 탭 DTO
// ---------------------------------------------------------------------------

/**
 * 기본정보 탭 — BE `PartnerBasicDto` 와 1:1.
 *
 * <p>id (UUID) 는 화면 미노출. 사용자 노출 식별자 = partnerCode / businessName.
 */
export interface PartnerBasic {
  /** 내부 UUID — mutation path key 전용, 화면 미노출. */
  id: string
  /** 거래처 코드 (사용자 노출 식별자). 예: P-2026-0001 */
  partnerCode: string
  /** 거래처명 (사용자 노출 식별자). */
  businessName: string
  /** 사업자등록번호. 예: 123-45-67890 */
  businessNumber: string
  /** 사업장 주소. */
  address: string | null
  /** 거래처 유형. */
  type: PartnerType
  /** 대표자명. */
  ceoName: string | null
  /** 업태. */
  businessCategory: string | null
  /** 종목. */
  businessItem: string | null
  /** 세금계산서 이메일. */
  taxEmail: string | null
  /** 메모. */
  memo: string | null
}

/** 기본정보 탭 입력 요청 DTO. */
export interface PartnerBasicRequest {
  businessName: string
  businessNumber: string
  address?: string
  type: PartnerType
  ceoName?: string
  businessCategory?: string
  businessItem?: string
  taxEmail?: string
  memo?: string
}

// ---------------------------------------------------------------------------
// 단가/할인 정책 탭 DTO
// ---------------------------------------------------------------------------

/**
 * 단가/할인 정책 탭 — BE `PartnerPriceDiscountDto` 와 1:1.
 */
export interface PartnerPriceDiscount {
  /** 기본 할인율 (%). 예: 5.0 */
  basicDiscount: number
  /** 결제 기간(일). 예: 30 */
  paymentTermDays: number
  /** 신용한도 (원). null = 미설정. */
  creditLimit: number | null
}

/** 단가/할인 탭 입력 요청 DTO. */
export interface PartnerPriceDiscountRequest {
  basicDiscount: number
  paymentTermDays: number
  creditLimit?: number
}

// ---------------------------------------------------------------------------
// 배송지 탭 DTO
// ---------------------------------------------------------------------------

/**
 * 배송지 1건 — BE `PartnerShippingAddressDto` 와 1:1.
 */
export interface PartnerShippingAddress {
  /** 내부 UUID — mutation path key 전용, 화면 미노출. */
  id: string
  /** 배송지 별칭. 예: 본사창고 */
  alias: string
  /** 배송지 주소. */
  address: string
  /** 연락처. */
  phone: string | null
  /** 기본 배송지 여부. */
  isDefault: boolean
}

/** 배송지 1건 입력 요청 DTO. */
export interface PartnerShippingAddressRequest {
  alias: string
  address: string
  phone?: string
  isDefault?: boolean
}

// ---------------------------------------------------------------------------
// 담당자 탭 DTO
// ---------------------------------------------------------------------------

/**
 * 담당자 1건 — BE `PartnerContactDto` 와 1:1.
 */
export interface PartnerContact {
  /** 내부 UUID — mutation path key 전용, 화면 미노출. */
  id: string
  /** 담당자명. */
  name: string
  /** 직책. 예: 과장 */
  position: string | null
  /** 휴대전화. 예: 010-1234-5678 */
  phone: string
  /** 이메일. */
  email: string | null
  /** 주 담당자 여부. */
  isPrimary: boolean
}

/** 담당자 1건 입력 요청 DTO. */
export interface PartnerContactRequest {
  name: string
  position?: string
  phone: string
  email?: string
  isPrimary?: boolean
}

// ---------------------------------------------------------------------------
// 4탭 풀 DTO
// ---------------------------------------------------------------------------

/**
 * 거래처 4탭 전체 응답 — BE `PartnerFullResponse` 와 1:1.
 */
export interface PartnerFullResponse {
  basic: PartnerBasic
  priceDiscount: PartnerPriceDiscount
  shippingAddresses: PartnerShippingAddress[]
  contacts: PartnerContact[]
}

/**
 * 거래처 4탭 신규 등록 / 전체 수정 요청 — BE `PartnerCreateFullRequest` 와 1:1.
 */
export interface PartnerCreateFullRequest {
  basic: PartnerBasicRequest
  priceDiscount: PartnerPriceDiscountRequest
  shippingAddresses: PartnerShippingAddressRequest[]
  contacts: PartnerContactRequest[]
}

// ---------------------------------------------------------------------------
// API 함수
// ---------------------------------------------------------------------------

/**
 * 거래처 4탭 전체 조회 — `GET /api/v1/partners/{id}/full`.
 *
 * @param id 거래처 내부 UUID (라우트 param 전용)
 */
export async function getPartnerFull(id: string): Promise<PartnerFullResponse> {
  const res = await apiClient.get<ApiEnvelope<PartnerFullResponse>>(
    `/api/v1/partners/${id}/full`,
  )
  return res.data.data
}

/**
 * 거래처 4탭 신규 등록 — `POST /api/v1/partners/full`.
 *
 * @param body 4탭 전체 입력 데이터
 */
export async function createPartnerFull(
  body: PartnerCreateFullRequest,
): Promise<PartnerFullResponse> {
  const res = await apiClient.post<ApiEnvelope<PartnerFullResponse>>(
    '/api/v1/partners/full',
    body,
  )
  return res.data.data
}

/**
 * 거래처 4탭 전체 수정 — `PATCH /api/v1/partners/{id}/full`.
 *
 * @param id 거래처 내부 UUID (라우트 param 전용)
 * @param body 4탭 전체 수정 데이터
 */
export async function updatePartnerFull(
  id: string,
  body: PartnerCreateFullRequest,
): Promise<PartnerFullResponse> {
  const res = await apiClient.patch<ApiEnvelope<PartnerFullResponse>>(
    `/api/v1/partners/${id}/full`,
    body,
  )
  return res.data.data
}

/**
 * 단가/할인 탭 개별 조회 — `GET /api/v1/partners/{id}/price-discount`.
 */
export async function getPartnerPriceDiscount(
  id: string,
): Promise<PartnerPriceDiscount> {
  const res = await apiClient.get<ApiEnvelope<PartnerPriceDiscount>>(
    `/api/v1/partners/${id}/price-discount`,
  )
  return res.data.data
}

/**
 * 단가/할인 탭 개별 수정 — `PATCH /api/v1/partners/{id}/price-discount`.
 */
export async function updatePartnerPriceDiscount(
  id: string,
  body: PartnerPriceDiscountRequest,
): Promise<PartnerPriceDiscount> {
  const res = await apiClient.patch<ApiEnvelope<PartnerPriceDiscount>>(
    `/api/v1/partners/${id}/price-discount`,
    body,
  )
  return res.data.data
}

/**
 * 배송지 탭 목록 조회 — `GET /api/v1/partners/{id}/shipping-addresses`.
 */
export async function listPartnerShippingAddresses(
  id: string,
): Promise<PartnerShippingAddress[]> {
  const res = await apiClient.get<ApiEnvelope<PartnerShippingAddress[]>>(
    `/api/v1/partners/${id}/shipping-addresses`,
  )
  return res.data.data
}

/**
 * 배송지 추가 — `POST /api/v1/partners/{id}/shipping-addresses`.
 */
export async function addPartnerShippingAddress(
  id: string,
  body: PartnerShippingAddressRequest,
): Promise<PartnerShippingAddress> {
  const res = await apiClient.post<ApiEnvelope<PartnerShippingAddress>>(
    `/api/v1/partners/${id}/shipping-addresses`,
    body,
  )
  return res.data.data
}

/**
 * 배송지 삭제 — `DELETE /api/v1/partners/{id}/shipping-addresses/{addressId}`.
 */
export async function deletePartnerShippingAddress(
  id: string,
  addressId: string,
): Promise<void> {
  await apiClient.delete<void>(
    `/api/v1/partners/${id}/shipping-addresses/${addressId}`,
  )
}

/**
 * 담당자 목록 조회 — `GET /api/v1/partners/{id}/contacts`.
 */
export async function listPartnerContacts(
  id: string,
): Promise<PartnerContact[]> {
  const res = await apiClient.get<ApiEnvelope<PartnerContact[]>>(
    `/api/v1/partners/${id}/contacts`,
  )
  return res.data.data
}

/**
 * 담당자 추가 — `POST /api/v1/partners/{id}/contacts`.
 */
export async function addPartnerContact(
  id: string,
  body: PartnerContactRequest,
): Promise<PartnerContact> {
  const res = await apiClient.post<ApiEnvelope<PartnerContact>>(
    `/api/v1/partners/${id}/contacts`,
    body,
  )
  return res.data.data
}

/**
 * 담당자 삭제 — `DELETE /api/v1/partners/{id}/contacts/{contactId}`.
 */
export async function deletePartnerContact(
  id: string,
  contactId: string,
): Promise<void> {
  await apiClient.delete<void>(`/api/v1/partners/${id}/contacts/${contactId}`)
}

// ---------------------------------------------------------------------------
// 결정적 mock 데이터 (VITE_MOCK_MODE=1 시 사용, Math.random 사용 금지)
// ---------------------------------------------------------------------------

/**
 * P0-6 개발/QA용 결정적 mock PartnerFullResponse.
 *
 * <p>UUID 는 내부 전용 — 화면 표시 없음. partnerCode / businessName 만 노출.
 */
export const MOCK_PARTNER_FULL: PartnerFullResponse = {
  basic: {
    id: 'b1000000-0000-0000-0000-000000000001',
    partnerCode: 'P-2026-0001',
    businessName: '(주)한국공조',
    businessNumber: '123-45-67890',
    address: '서울특별시 강남구 테헤란로 123',
    type: 'CUSTOMER',
    ceoName: '홍길동',
    businessCategory: '제조업',
    businessItem: '공조시스템',
    taxEmail: 'tax@hankookhvac.co.kr',
    memo: '주요 고객사 — 분기별 정기 거래',
  },
  priceDiscount: {
    basicDiscount: 5.0,
    paymentTermDays: 30,
    creditLimit: 50_000_000,
  },
  shippingAddresses: [
    {
      id: 'a2000000-0000-0000-0000-000000000001',
      alias: '본사창고',
      address: '서울특별시 강남구 테헤란로 123 지하 1층',
      phone: '02-1234-5678',
      isDefault: true,
    },
    {
      id: 'a2000000-0000-0000-0000-000000000002',
      alias: '판교창고',
      address: '경기도 성남시 분당구 판교로 100',
      phone: '031-9876-5432',
      isDefault: false,
    },
  ],
  contacts: [
    {
      id: 'c3000000-0000-0000-0000-000000000001',
      name: '김영업',
      position: '부장',
      phone: '010-1111-2222',
      email: 'sales@hankookhvac.co.kr',
      isPrimary: true,
    },
    {
      id: 'c3000000-0000-0000-0000-000000000002',
      name: '이구매',
      position: '과장',
      phone: '010-3333-4444',
      email: 'purchase@hankookhvac.co.kr',
      isPrimary: false,
    },
  ],
}
