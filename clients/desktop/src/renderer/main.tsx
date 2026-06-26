/**
 * 렌더러 React 진입점 — DOM mount + StrictMode + 글로벌 스타일 import.
 *
 * 라우터/QueryClient/세션 초기화는 `App` 컴포넌트가 담당한다.
 */
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { PwaUpdatePrompt } from './components/common/PwaUpdatePrompt'
import './styles/global.css'

const container = document.getElementById('root')
if (!container) {
  throw new Error('루트 컨테이너 (#root) 가 DOM 에 존재하지 않습니다.')
}

createRoot(container).render(
  <StrictMode>
    <App />
    <PwaUpdatePrompt />
  </StrictMode>,
)
