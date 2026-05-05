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
  /**
   * 거래처 비즈니스 코드 (사업자번호 정규화 — 하이픈 제거된 10자리).
   * Backend `GET /api/v1/partners/{partnerCode}/dc-config` 호출 키.
   * UUID 비공개 가드 — partnerCode 는 사업자번호 그 자체이므로 노출 무방.
   */
  partnerCode: string
  /** PartnerAuth.status 결과. */
  status: AuthStatus
  /** OK 시 발급되는 거래처 token (mock 단계 — M2 통합 후 JWT). */
  token?: string
  /** 사용기한 (ISO datetime, optional). */
  accessLimit?: string
}

/**
 * 거래처별 DC 설정 — `migration/source/sheet/거래처별 DC리스트 *.csv` 222 row 시드.
 *
 * <p>legacy partner-order index.html `applyConfigFromServer(cfg)` (line 1322) 의 12 컬럼
 * 1:1 변환. 거래처가 사업자번호 입장 시 backend 가 본 entity 를 응답.
 *
 * <p>가격 계산 흐름 (legacy 동일):
 * <ul>
 *   <li>홈멀티 라인 → `homeMultiDc` 율 적용 (예: 0.46 = 46%)</li>
 *   <li>상업멀티 라인 → `commercialMultiDc` 율 적용</li>
 *   <li>옵션 (4way 등) 추가 시 `option*` 가산 (양수면 추가, 음수면 차감)</li>
 *   <li>최종가 = round(출고가 × (1 - dcRate)) + 옵션 가산</li>
 *   <li>유연호스 I형 옵션 — `flexibleHoseI` true 면 노출, false 면 단가 7000 강제 (legacy 2392)</li>
 * </ul>
 */
export interface PartnerDcConfig {
  /** 거래처 코드 (사업자번호 그대로 — UUID 아님). */
  partnerCode: string
  /** 거래처명 (조회 편의). */
  partnerName: string
  /** 홈멀티 DC율 (0~0.99, null 이면 미적용). */
  homeMultiDc: number | null
  /** 상업멀티 DC율 (0~0.99, null 이면 미적용). */
  commercialMultiDc: number | null
  /** 유연호스 I형 옵션 노출 여부 (legacy `SHOW_I_HOSE`). */
  flexibleHoseI: boolean
  /** 360 옵션 추가/차감 금액 (단위: 원, 음수 가능). */
  option360: number | null
  /** 4-way 옵션. */
  option4way: number | null
  /** 1-way 옵션. */
  option1way: number | null
  /** 스탠드 옵션. */
  optionStand: number | null
  /** 디럭스 옵션. */
  optionDeluxe: number | null
  /** 1등급 옵션. */
  option1Grade: number | null
  /** 단위처리 (라운딩 단위 — 1000 / 100 / 0). */
  unitProcessing: number | null
  /** 특이사항 (영업자 메모). */
  note: string | null
}

/* ==========================================================================
 * §2 카탈로그 — M1a product-service /api/v1/products 응답
 * ========================================================================== */

/** legacy `classifyHome_/SingleSetLM_/Commercial_` 의 4 카테고리. */
export type EstimateCategory = 'HOME_MULTI' | 'SINGLE_SET' | 'COMMERCIAL_MULTI' | 'LEGACY'

export type UsageScope = 'ESTIMATE_ONLY' | 'PARTNER_ORDER' | 'BOTH' | 'NONE'

export interface ProductCatalog {
  /**
   * 모델 코드 (UUID 아님 — 사용자 노출 가능. 정정 #4 후 라벨은 '모델명' 으로 변경).
   * UI 라벨: '모델명' (정정 #4)
   */
  modelCode: string
  /**
   * 한국어 품목명 (정정 #5: '품명' → '품목명').
   * UI 라벨: '품목명'
   */
  productName: string
  /** 대분류 (예: '실외기' / '실내기'). */
  categoryL: string
  categoryM: string
  categoryS: string
  categoryD: string
  /** 단위 (예: '대' / '셋트' / 'm'). */
  unit: string
  /**
   * 출고가 (마스터 가격, DC 적용 전).
   * 거래처에게는 출고가 + DC% + 최종가 모두 노출 (정정 #12).
   */
  releasePrice: number
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

/** 옵션 종류 — DC csv 의 옵션 컬럼과 1:1. */
export type LineOption = '360' | '4way' | '1way' | 'stand' | 'deluxe' | 'grade1'

export interface OrderLine {
  /** 라인 임시 키 (UI 전용 — UUID 비공개). */
  lineKey: string
  modelCode: string
  productName: string
  unit: string
  qty: number
  /**
   * 출고가 (마스터 가격) — DC 적용 전 원본.
   * 거래처에게는 "출고가" + "DC% 표시" + "최종가" 모두 노출 (정정 #12).
   */
  releasePrice: number
  estimateCategory: EstimateCategory
  /** Bundle 처리 모드 — partner-order 전송 직전에 EXPAND 가 구성품 펼침 트리거. */
  bundleMode?: BundleMode
  /** 옵션 (4way / 1way 등) — 가격 가산용. UI 에서 토글. */
  options?: LineOption[]
  /** UI 정렬 순서 (drag-and-drop, 정정 #2). */
  sortOrder: number
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
  /**
   * 주문번호 (사용자 노출 — 정정 #8 양식 'YYYY/MM/DD - 0001').
   * {@link import('../utils/formatSlipNumber').formatSlipNumber} 로 생성.
   */
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
