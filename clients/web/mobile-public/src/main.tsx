import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@samhan/design-system/tokens.css'
import '@samhan/design-system/style.css'
import { EmployeeSignaturePage } from './EmployeeSignaturePage'
import { resolveBuildAppVersion } from './version/versionCheck'

// 토큰 추출: path `/s/:token` 우선, 없으면 `?token=`.
function readToken(): string {
  const m = window.location.pathname.match(/\/s\/([^/]+)/)
  if (m?.[1]) return decodeURIComponent(m[1])
  return new URLSearchParams(window.location.search).get('token') ?? ''
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <EmployeeSignaturePage token={readToken()} currentVersion={resolveBuildAppVersion(import.meta.env.VITE_APP_VERSION)} />
  </StrictMode>,
)
