/**
 * 진입점 — order-app.
 *
 * <p>React 18 createRoot + BrowserRouter (PWA 환경 — file:// 사용 안 함).
 *
 * <p>tokens.css + 전역 스타일 import 순서 의무:
 * 1. `@samhan/design-system/tokens.css` — :root 변수 등록
 * 2. `./styles/global.css` — legacy 스타일 (tokens 사용 가능)
 */
import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { App } from './App'
import './styles/global.css'

const rootEl = document.getElementById('root')
if (!rootEl) {
  throw new Error('루트 컨테이너 (#root) 가 index.html 에 없습니다.')
}

ReactDOM.createRoot(rootEl).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
)
