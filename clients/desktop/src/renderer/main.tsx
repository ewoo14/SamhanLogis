/**
 * 렌더러 React 진입점 — DOM mount + StrictMode + 글로벌 스타일 import.
 *
 * 라우터/QueryClient/세션 초기화는 `App` 컴포넌트가 담당한다.
 */
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import './styles/global.css'
import { isMockMode } from './api/mock'
import { usePricingStore } from './stores/usePricingStore'
import { applyCaptureFixtureFromQuery } from './api/captureFixtures'

const container = document.getElementById('root')
if (!container) {
  throw new Error('루트 컨테이너 (#root) 가 DOM 에 존재하지 않습니다.')
}

// dev-only — capture 모드에서 store 직접 접근을 위한 window 노출.
// production 빌드에서는 mock 모드 미활성화 → 본 객체 미노출 (dead code 제거 가능).
if (isMockMode()) {
  ;(window as unknown as { __samhanCaptureStores?: { usePricingStore: typeof usePricingStore } }).__samhanCaptureStores = {
    usePricingStore,
  }
  // v2 정정 라운드 — query string `__capture=<stepKey>` 시드 자동 적용.
  applyCaptureFixtureFromQuery()
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
