/**
 * 영업 native 앱 API client — P1-4 신규 (mobile-staff sales mode).
 *
 * 출처: BE record 1:1.
 *   - `slip-service` /mobile/sales/dashboard — 영업 대시보드 집계
 *   - `partner-service` /api/v1/partners/quick-search — 거래처 자동완성
 *   - `quotation-service` /api/v1/quotations/mobile — 견적 생성
 *   - `slip-service` /api/v1/slips/mobile-order — 주문 (파트너 주문) 생성
 *
 * Base URL = `EXPO_PUBLIC_API_BASE_URL` (default `http://localhost:8080` = api-gateway 진입).
 * gateway 가 JWT verify + @PreAuthorize(SALES / MANAGER / MASTER) 확인 후 각 서비스로 forward.
 *
 * 인증:
 *   - JWT = user-service 발급 Bearer access token.
 *   - 401 응답 시 호출자가 재로그인 유도 (refresh token 흐름은 desktop 전용).
 *
 * UUID 비공개:
 *   - 화면 표시는 slipNo / partnerCode / productCode / quotationNo 만 사용.
 *   - UUID 는 path/body parameter 내부 이동에만 사용, 사용자에게 노출 금지.
 */

import { API_BASE_URL, assertApiResponseSuccess, SalesApiError } from './salesUtils';

// -----------------------------------------------------------------------
// 응답 타입 — backend DTO 와 1:1
// -----------------------------------------------------------------------

/**
 * slip-service 모바일 대시보드 응답을 화면 모델로 정규화한 타입.
 * BE의 기존 계약(fromDate/toDate, totalSalesAmount 등)은 다른 소비자가 사용하므로
 * FE API 경계에서만 소비하기 쉬운 형태로 변환한다.
 */
export interface SalesDashboardResponse {
  fromDate: string;
  toDate: string;
  totalSalesAmount: number;
  totalOutstanding: number;
  estimateDraftCount: number;
  estimateSentCount: number;
  estimateAcceptedCount: number;
}

/**
 * 거래처 자동완성 항목 — `partner-service` GET /api/v1/partners/quick-search 응답 배열 요소.
 * @PreAuthorize SALES / MANAGER / MASTER
 *
 * UUID 비공개: id 는 내부 라우팅에만 사용. 화면 표시는 partnerCode + partnerName 만.
 */
export interface CustomerSummary {
  /** 거래처 내부 UUID (화면 노출 금지, 라우팅 전달 전용) */
  id: string;
  /** 거래처 코드 (화면 표시용) */
  partnerCode: string;
  /** 거래처명 */
  partnerName: string;
  /** 대표자명 (선택) */
  representativeName: string | null;
  /** 연락처 (선택) */
  phone: string | null;
}

/**
 * 견적 라인 — `createMobileQuotation` 요청 body 의 배열 요소.
 */
export interface QuotationLineRequest {
  /** 품목 코드 (화면 표시 + 전송용) */
  productCode: string;
  /** 품목명 */
  productName: string;
  /** 수량 */
  quantity: number;
  /** 단가 (원) */
  unitPrice: number;
  /** 비고 (선택) */
  memo: string | null;
}

/**
 * 견적 생성 요청 body — `quotation-service` POST /api/v1/quotations/mobile.
 */
export interface CreateMobileQuotationRequest {
  /** 거래처 내부 UUID (선택된 CustomerSummary.id) */
  partnerId: string;
  /** 유효기간 (일 수, 기본 30) */
  validDays: number;
  /** 견적 라인 목록 (최소 1건) */
  lines: QuotationLineRequest[];
  /** 특이사항 메모 (선택) */
  memo: string | null;
}

/**
 * 견적 생성 응답 — `quotation-service` POST /api/v1/quotations/mobile 응답.
 */
export interface QuotationResponse {
  /** 견적 내부 UUID (화면 노출 금지) */
  quotationId: string;
  /** 견적 번호 (화면 표시용) */
  quotationNo: string;
  /** 거래처명 */
  partnerName: string;
  /** 합계 (원, 부가세 별도) */
  totalAmount: number;
  /** 생성 일시 (ISO8601) */
  createdAt: string;
  /** 상태 */
  status: 'DRAFT' | 'SENT' | 'CONFIRMED' | 'CANCELLED';
}

/**
 * 주문 라인 — `createMobilePartnerOrder` 요청 body 의 배열 요소.
 */
export interface PartnerOrderLineRequest {
  /** 품목 코드 */
  productCode: string;
  /** 품목명 */
  productName: string;
  /** 수량 */
  quantity: number;
  /** 단가 (원) */
  unitPrice: number;
}

/**
 * 주문 생성 요청 body — `slip-service` POST /api/v1/slips/mobile-order.
 */
export interface CreateMobilePartnerOrderRequest {
  /** 거래처 내부 UUID */
  partnerId: string;
  /** 배송 주소 (선택) */
  deliveryAddress: string | null;
  /** 요청 납기일 (ISO8601 date, 선택) */
  requestedDate: string | null;
  /** 주문 라인 목록 (최소 1건) */
  lines: PartnerOrderLineRequest[];
  /** 비고 */
  memo: string | null;
}

/**
 * 주문 생성 응답 — `slip-service` POST /api/v1/slips/mobile-order 응답.
 */
export interface PartnerOrderResponse {
  /** 슬립 내부 UUID (화면 노출 금지) */
  slipId: string;
  /** 슬립 번호 (화면 표시용) */
  slipNo: string;
  /** 거래처명 */
  partnerName: string;
  /** 합계 (원) */
  totalAmount: number;
  /** 생성 일시 (ISO8601) */
  createdAt: string;
  /** 슬립 상태 */
  status: 'DRAFT' | 'PENDING' | 'CONFIRMED' | 'SHIPPED' | 'CANCELLED';
}

// -----------------------------------------------------------------------
// API 함수
// -----------------------------------------------------------------------

/**
 * 영업 대시보드 집계 조회.
 *
 * @param token JWT access token (null 허용 — 미인증 시 401)
 * @returns 오늘 매출 / 미수금 / 견적 진행 집계
 * @throws SalesApiError HTTP 오류 또는 ApiResponse.success=false 시
 */
export async function getSalesDashboard(token: string | null): Promise<SalesDashboardResponse> {
  const url = `${API_BASE_URL}/mobile/sales/dashboard`;
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(url, { method: 'GET', headers });
  if (!res.ok) {
    throw new SalesApiError(res.status, `대시보드 조회 실패: HTTP ${res.status}`);
  }
  const json = await res.json();
  assertApiResponseSuccess(json, '대시보드');
  const data = json.data as {
    fromDate: string;
    toDate: string;
    totalSalesAmount: number;
    totalOutstanding: number;
    estimateDraftCount: number;
    estimateSentCount: number;
    estimateAcceptedCount: number;
  };
  return {
    fromDate: data.fromDate,
    toDate: data.toDate,
    totalSalesAmount: data.totalSalesAmount,
    totalOutstanding: data.totalOutstanding,
    estimateDraftCount: data.estimateDraftCount,
    estimateSentCount: data.estimateSentCount,
    estimateAcceptedCount: data.estimateAcceptedCount,
  };
}

/**
 * 거래처 자동완성 검색 (키워드 2자 이상 권장).
 *
 * @param q 검색 키워드 (거래처명 or 코드 부분 일치)
 * @param token JWT access token
 * @returns 최대 20건 CustomerSummary 배열
 * @throws SalesApiError HTTP 오류 또는 ApiResponse.success=false 시
 */
export async function quickSearchCustomer(
  q: string,
  token: string | null,
): Promise<CustomerSummary[]> {
  const url = `${API_BASE_URL}/api/v1/partners/quick-search?q=${encodeURIComponent(q)}&size=20`;
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(url, { method: 'GET', headers });
  if (!res.ok) {
    throw new SalesApiError(res.status, `거래처 검색 실패: HTTP ${res.status}`);
  }
  const json = await res.json();
  assertApiResponseSuccess(json, '거래처 검색');
  return (json.data ?? []) as CustomerSummary[];
}

/**
 * 모바일 견적 생성.
 *
 * @param body 견적 생성 요청 (거래처 UUID + 라인 목록)
 * @param token JWT access token
 * @returns 생성된 견적 (quotationNo 화면 표시용)
 * @throws SalesApiError HTTP 오류 또는 ApiResponse.success=false 시
 */
export async function createMobileQuotation(
  body: CreateMobileQuotationRequest,
  token: string | null,
): Promise<QuotationResponse> {
  const url = `${API_BASE_URL}/api/v1/quotations/mobile`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new SalesApiError(res.status, `견적 생성 실패: HTTP ${res.status}`);
  }
  const json = await res.json();
  assertApiResponseSuccess(json, '견적 생성');
  return json.data as QuotationResponse;
}

/**
 * 모바일 파트너 주문 생성.
 *
 * @param body 주문 생성 요청 (거래처 UUID + 라인 목록)
 * @param token JWT access token
 * @returns 생성된 슬립 (slipNo 화면 표시용)
 * @throws SalesApiError HTTP 오류 또는 ApiResponse.success=false 시
 */
export async function createMobilePartnerOrder(
  body: CreateMobilePartnerOrderRequest,
  token: string | null,
): Promise<PartnerOrderResponse> {
  const url = `${API_BASE_URL}/api/v1/slips/mobile-order`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new SalesApiError(res.status, `주문 생성 실패: HTTP ${res.status}`);
  }
  const json = await res.json();
  assertApiResponseSuccess(json, '주문 생성');
  return json.data as PartnerOrderResponse;
}
