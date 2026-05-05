/**
 * dev-only — capture script 가 query string `?__capture=<stepKey>` 로 전달한 키에 따라
 * usePricingStore 를 자동 시드.
 *
 * <p>본 모듈은 PR #18 의 capture 패턴 + v2/v3 정정 자동 캡처용. mock 모드
 * (`VITE_MOCK_MODE=1`) 에서만 활성화되며 production 빌드에는 dead code 로 트리쉐이킹.
 *
 * <p>v3 정정 (#17 + #18) 캡처 8 시나리오:
 * <ul>
 *   <li>01 — sales menu (sub-nav 4 + sidebar 그룹).</li>
 *   <li>02 — 라인 0건 → 카테고리 탭 X + cardOrderInfo X (메뉴 toolbar 만 표시).</li>
 *   <li>03 — 홈멀티 라인 1건 추가 → 홈멀티 탭 + cardOrderInfo 자동 표시 + 거래처 검색
 *       input 자동 focus.</li>
 *   <li>04 — 라인 3건 + 거래처 선택 후 자동 채움 (모델명/품목명/주소/연락처/배송지).</li>
 *   <li>05 — legacy 메뉴 toolbar 5종 표시 (분기계산 / 견적·주문 / 과거 발송내역 /
 *       주문저장 / 저장내역).</li>
 *   <li>06 — 인쇄 미리보기 (legacy 양식 + 복사/이미지/PDF 벡터 3 버튼).</li>
 *   <li>07 — 주문서 승인 status 6종 + dropdown + 비밀번호 초기화.</li>
 *   <li>08 — 거래처 DC 설정 222 row + 인라인 수정.</li>
 * </ul>
 *
 * <p>실행 시점: `main.tsx` 가 `App` mount 직전에 호출.
 */
import { usePricingStore } from '../stores/usePricingStore'
import { isMockMode } from './mock'

/** 카탈로그 mock 시드 (capture 03/04/06 공용). */
const HOME4HP = {
  modelCode: 'AJ040RXH4BC1',
  name: '시스템에어컨 4Way 4HP',
  usageScope: 'BOTH' as const,
  estimateCategory: 'HOME_MULTI' as const,
  releasePrice: 1800000,
  deliveryPrice: 1500000,
  hasVariableDiscount: false,
  legacyDiscountFlag: false,
  discountFlags: null,
}
const HOME5HP = {
  modelCode: 'AJ052RXH5BC1',
  name: '시스템에어컨 4Way 5HP',
  usageScope: 'BOTH' as const,
  estimateCategory: 'HOME_MULTI' as const,
  releasePrice: 2100000,
  deliveryPrice: 1700000,
  hasVariableDiscount: true,
  legacyDiscountFlag: false,
  discountFlags: 'HOMEMULTI',
}
const REMOTE = {
  modelCode: 'MWR-WE10N',
  name: '유선 리모컨',
  usageScope: 'BOTH' as const,
  estimateCategory: 'HOME_MULTI' as const,
  releasePrice: 65000,
  deliveryPrice: 50000,
  hasVariableDiscount: false,
  legacyDiscountFlag: false,
  discountFlags: null,
}

function fillCustomerSeed() {
  const s = usePricingStore.getState()
  s.setPartner('4348703365', '주식회사 엠엠시스템에어(고영현)')
  s.setOrderInfo('contactPhone', '010-2345-6789')
  s.setOrderInfo('deliveryAddress', '서울시 강남구 테헤란로 123')
  s.setOrderInfo('deliveryAddressDetail', '5층 501호')
  s.setOrderInfo('siteAddress', '서울시 강남구 역삼동 999')
  s.setOrderInfo('memo', '오전 10시 도착 요청')
  s.setOrderInfo('dueDate', '2026-05-12')
}

/** stepKey 별 시드 시나리오 (v3). */
function applyCaptureFixture(stepKey: string): void {
  const s = usePricingStore.getState()
  switch (stepKey) {
    case '01': {
      // 메뉴 / sub-nav 캡처 — store 초기 상태.
      s.reset()
      return
    }
    case '02': {
      // 라인 0건 검증 — cardOrderInfo + 카테고리 탭 모두 숨김 확인.
      s.reset()
      return
    }
    case '03': {
      // v3 §정정 #18 — 라인 1건 추가 → cardOrderInfo 자동 표시 + 거래처 검색 input focus.
      s.reset()
      s.addLineFromCatalog(HOME4HP, 1)
      // 거래처는 미선택 (autoFocus 검증).
      return
    }
    case '04': {
      // 라인 3건 + 거래처 선택 → cardOrderInfo 자동 채움.
      s.reset()
      s.addLineFromCatalog(HOME4HP, 2)
      s.addLineFromCatalog(HOME5HP, 1)
      s.addLineFromCatalog(REMOTE, 4)
      fillCustomerSeed()
      return
    }
    case '05': {
      // 메뉴 toolbar 5종 강조 — 라인 1건 + 거래처 채움 (canSendOrder=true 활성).
      s.reset()
      s.addLineFromCatalog(HOME4HP, 2)
      fillCustomerSeed()
      // toolbar 위치를 강조하기 위해 라인 1건 추가만 한다 (페이지가 short).
      return
    }
    case '06': {
      // 인쇄 미리보기 — 라인 + 거래처 채움.
      if (s.lines.length === 0) {
        s.addLineFromCatalog(HOME4HP, 2)
        s.addLineFromCatalog(HOME5HP, 1)
        s.addLineFromCatalog(REMOTE, 4)
        fillCustomerSeed()
      }
      return
    }
    case '07':
    case '08': {
      // approvals + dc-config 는 별도 store hydrate 불필요 (mock api 가 응답).
      s.reset()
      return
    }
    default:
      return
  }
}

/**
 * 페이지 로드 시 1회 실행 — query string `__capture=<stepKey>` 검사 후 적용.
 *
 * <p>capture 8 단계는 hash route 가 다르므로 매번 페이지 reload 됨 (Edge headless).
 * 따라서 본 함수도 매 navigation 마다 1회 호출되어 시드 적용.
 */
export function applyCaptureFixtureFromQuery(): void {
  if (!isMockMode()) return
  if (typeof window === 'undefined') return
  try {
    const params = new URLSearchParams(window.location.search)
    const stepKey = params.get('__capture')
    if (stepKey) {
      applyCaptureFixture(stepKey)
    }
  } catch {
    // 무시 — capture 환경 외에서는 no-op.
  }
}
