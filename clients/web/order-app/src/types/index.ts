/**
 * order-app 공용 타입 정의 — backend M2/M4 endpoint 응답과 정합.
 *
 * <p>출처: migration/analysis/04-migration-plan.md §2.1.7 (M1a 카탈로그) +
 * §2.2.2 (PartnerAuth status enum) + §2.4.7 (PartnerOrder).
 */

/* ==========================================================================
 * §1 인증 — PartnerAuth status 10 enum (legacy partner-order Code.js 2683)
 * ========================================================================== */

/**
 * 사업자번호 게이트 조회 후 분기되는 status enum.
 *
 * <p>legacy `checkAuthStatus` 의 10 status. M2 partner-service 통합 후
 * `GET /api/v1/partner-auth/status?bizno={bizno}` 응답 그대로 매핑.
 */
export type AuthStatus =
  | 'OK' // 인증 통과 (PW 일치 + 활성)
  | 'NEED_PW_INPUT' // 등록된 PW 존재 — 로그인 (3-fail LOCKED)
  | 'NEED_PW_SET' // 신규 4자리 PW 설정 (확인 일치 + 과거 5개 중복 차단)
  | 'NOT_FOUND_AUTH' // PartnerAuth row 없음 — 승인 요청 가능
  | 'PENDING' // 승인 대기 중
  | 'NOT_FOUND_SYSTEM' // PartnerMaster 자체 없음 — 관리자 문의
  | 'LOCKED' // 3-fail 잠금
  | 'LONG_UNUSED' // 장기 미사용
  | 'ACCESS_DENIED' // 차단된 거래처
  | 'PW_EXPIRED' // PW 만료
  | 'ERROR' // 시스템 오류

export interface AuthSession {
  /** 거래처 표시명 (사업자번호 만 노출 — UUID 비공개 가드 준수). */
  partnerName: string
  /** 사업자번호 (000-00-00000). */
  bizno: string
  /** PartnerAuth.status 결과. */
  status: AuthStatus
  /** OK 시 발급되는 거래처 token (mock 단계 — M2 통합 후 JWT). */
  token?: string
  /** 사용기한 (ISO datetime, optional). */
  accessLimit?: string
  /** DC 거래처별 할인 설정 (M2 `GET /partners/{id}.discountConfig`). */
  discountConfig?: PartnerDiscountConfig
}

export interface PartnerDiscountConfig {
  /** 싱글 세트 기본 할인율 (legacy `singleDiscountRate`). */
  singleDiscountRate?: number
  /** 카테고리별 추가 할인. */
  categoryRates?: Partial<Record<EstimateCategory, number>>
}

/* ==========================================================================
 * §2 카탈로그 — M1a product-service /api/v1/products 응답
 * ========================================================================== */

/** legacy `classifyHome_/SingleSetLM_/Commercial_` 의 4 카테고리. */
export type EstimateCategory = 'HOME_MULTI' | 'SINGLE_SET' | 'COMMERCIAL_MULTI' | 'LEGACY'

export type UsageScope = 'ESTIMATE_ONLY' | 'PARTNER_ORDER' | 'BOTH' | 'NONE'

export interface ProductCatalog {
  /** 모델 코드 (사용자 노출 — UUID 비공개). */
  modelCode: string
  /** 한국어 품명. */
  productName: string
  /** 대분류 (예: '실외기' / '실내기'). */
  categoryL: string
  categoryM: string
  categoryS: string
  categoryD: string
  /** 단위 (예: '대' / '셋트' / 'm'). */
  unit: string
  /** 납품가 (거래처 노출). */
  deliveryPrice: number
  /** 4 카테고리 분류. */
  estimateCategory: EstimateCategory
  /** ESTIMATE_ONLY/PARTNER_ORDER/BOTH/NONE. */
  usageScope: UsageScope
  /** Bundle 여부 (구성품 펼침 후보). */
  isBundle: boolean
}

export interface ProductSpecRow {
  id: string // UUID — 내부 식별 (사용자 미노출)
  specKey: string
  specValue: string
  unit?: string | null
  displayOrder: number
}

/* ==========================================================================
 * §3 주문 라인 + Bundle EXPAND/KEEP — M4 partner-order-service
 * ========================================================================== */

export type BundleMode = 'EXPAND' | 'KEEP'

export interface OrderLine {
  /** 라인 임시 키 (UI 전용 — UUID 비공개). */
  lineKey: string
  modelCode: string
  productName: string
  unit: string
  qty: number
  deliveryPrice: number
  estimateCategory: EstimateCategory
  /** Bundle 처리 모드 — partner-order 전송 직전에 EXPAND 가 구성품 펼침 트리거. */
  bundleMode?: BundleMode
}

export interface OrderInfo {
  /** 배송지 (Daum Postcode 결과). */
  deliveryAddress: string
  deliveryAddressDetail?: string
  /** 현장 명. */
  siteName?: string
  /** 인수자. */
  receiver: string
  receiverPhone: string
  /** 납기일 (ISO date). */
  dueDate: string
  /** 입금/결제 메모. */
  paymentNote?: string
  /** 요청사항. */
  requestNote?: string
}

/* ==========================================================================
 * §4 주문 master / 발송 이력
 * ========================================================================== */

export type PartnerOrderStatus = 'DRAFT' | 'PENDING' | 'CONFIRMED' | 'CANCELED'

export interface PartnerOrderSummary {
  /** 주문번호 (사용자 노출). */
  orderNo: string
  bizno: string
  partnerName: string
  status: PartnerOrderStatus
  totalAmount: number
  /** 주문 일시 (ISO datetime). */
  orderedAt: string
  /** 출고희망일. */
  dueDate: string
  lineCount: number
}

export interface PartnerOrderDetail extends PartnerOrderSummary {
  lines: OrderLine[]
  info: OrderInfo
}
