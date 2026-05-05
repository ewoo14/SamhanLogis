/**
 * dev-only — capture script 가 query string `?__capture=<stepKey>` 로 전달한 키에 따라
 * usePricingStore 를 자동 시드.
 *
 * <p>본 모듈은 PR #18 의 capture 패턴 + v2 정정 8 화면 자동 캡처용. mock 모드
 * (`VITE_MOCK_MODE=1`) 에서만 활성화되며 production 빌드에는 dead code 로 트리쉐이킹.
 *
 * <p>실행 시점: `main.tsx` 가 `App` mount 직전에 호출.
 */
import { usePricingStore } from '../stores/usePricingStore'
import { isMockMode } from './mock'

/** 카탈로그 mock 시드 (capture 02/03/04/08 공용). */
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
  s.setOrderInfo('memo', '오전 10시 도착 요청')
  s.setOrderInfo('dueDate', '2026-05-12')
}

/** stepKey 별 시드 시나리오. */
function applyCaptureFixture(stepKey: string): void {
  const s = usePricingStore.getState()
  switch (stepKey) {
    case '02': {
      // 라인 0건 검증 — 명시적 reset.
      s.reset()
      return
    }
    case '03': {
      // 홈멀티 라인 3건 + 거래처 자동 채움.
      s.reset()
      s.addLineFromCatalog(HOME4HP, 2)
      s.addLineFromCatalog(HOME5HP, 1)
      s.addLineFromCatalog(REMOTE, 4)
      fillCustomerSeed()
      return
    }
    case '04': {
      // 인쇄 미리보기용 — 라인 + 거래처 채움.
      if (s.lines.length === 0) {
        s.addLineFromCatalog(HOME4HP, 2)
        s.addLineFromCatalog(HOME5HP, 1)
        s.addLineFromCatalog(REMOTE, 4)
        fillCustomerSeed()
      }
      return
    }
    case '08': {
      // PDF 저장 결과 시뮬레이션 — 라인 + 거래처 + 'PDF 저장 완료' 안내 강제 표시.
      if (s.lines.length === 0) {
        s.addLineFromCatalog(HOME4HP, 2)
        s.addLineFromCatalog(HOME5HP, 1)
        s.addLineFromCatalog(REMOTE, 4)
        fillCustomerSeed()
      }
      // App mount 후 toolbar 가 render 된 시점에 안내 강제 삽입.
      // setTimeout 으로 다음 tick 에 재시도 (React render 대기).
      const tryInjectPdfNotice = (retry: number) => {
        if (retry > 30) return
        const toolbar = document.querySelector('[class*="printToolbar"]')
        if (!toolbar || !toolbar.parentElement) {
          window.setTimeout(() => tryInjectPdfNotice(retry + 1), 200)
          return
        }
        if (document.querySelector('[data-capture="pdf-notice"]')) return
        const notice = document.createElement('div')
        notice.dataset['capture'] = 'pdf-notice'
        notice.style.cssText =
          'background:#d1fae5;color:#065f46;padding:10px 14px;border-radius:8px;'
          + 'font-size:13px;width:794px;max-width:calc(100vw - 48px);'
          + 'box-sizing:border-box;font-weight:600;margin-top:4px;'
          + 'border:2px solid #059669;'
        notice.textContent =
          '✓ PDF 저장 완료 — 텍스트 select 가능 (벡터 모드). 산출 파일: 2026-05-05 - 0001.pdf'
        toolbar.parentElement.insertBefore(notice, toolbar.nextSibling)
      }
      window.setTimeout(() => tryInjectPdfNotice(0), 300)
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
