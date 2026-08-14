import './styles.css'
import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ChatApp } from './ChatApp'
import { InternalChatUpdateGate } from './InternalChatUpdateGate'

interface VersionInfo {
  latestVersion: string
  minSupportedVersion: string
  forceLevel: 'NONE' | 'MINOR' | 'MAJOR' | 'CRITICAL'
  releaseNotes: string
}

declare global {
  interface Window {
    internalChatUpdater?: {
      check: () => Promise<void>
      install: () => Promise<void>
      quit: () => Promise<void>
      onStatus: (listener: (status: unknown) => void) => () => void
    }
  }
}

const rootElement = document.querySelector<HTMLElement>('#root')
if (!rootElement) throw new Error('렌더러 루트가 없습니다.')
const root: HTMLElement = rootElement

const CURRENT_VERSION = String(import.meta.env.VITE_APP_VERSION ?? '0.1.0-dev').trim() || '0.1.0-dev'
const VERSION_API_BASE_URL = String(import.meta.env.VITE_VERSION_API_BASE_URL ?? 'http://localhost:8080').replace(/\/+$/, '')
const VERSION_POLICY_FAILURE_MESSAGE = '버전 정책을 확인하지 못했습니다. 네트워크 연결 후 다시 확인해 주세요.'

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
createRoot(root).render(createElement(QueryClientProvider, { client: queryClient }, createElement(InternalChatUpdateGate, null, createElement(ChatApp))))

function checkForUpdate(): void {
  void window.internalChatUpdater?.check().catch(() => undefined)
}

function versionCheckUrl(): string {
  const params = new URLSearchParams({
    clientType: 'INTERNAL_CHAT_DESKTOP',
    currentVersion: CURRENT_VERSION,
  })
  return `${VERSION_API_BASE_URL}/app/version?${params.toString()}`
}

async function fetchVersionInfo(): Promise<VersionInfo> {
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), 5_000)
  try {
    const response = await fetch(versionCheckUrl(), {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    })
    if (!response.ok) throw new Error(VERSION_POLICY_FAILURE_MESSAGE)
    const payload = await response.json() as { data?: unknown }
    const data = typeof payload.data === 'object' && payload.data !== null ? payload.data : payload
    if (!data || typeof data !== 'object' || !('forceLevel' in data)) throw new Error(VERSION_POLICY_FAILURE_MESSAGE)
    const record = data as Record<string, unknown>
    const forceLevel = record.forceLevel
    if (forceLevel !== 'NONE' && forceLevel !== 'MINOR' && forceLevel !== 'MAJOR' && forceLevel !== 'CRITICAL') {
      throw new Error(VERSION_POLICY_FAILURE_MESSAGE)
    }
    return {
      latestVersion: typeof record.latestVersion === 'string' ? record.latestVersion : '',
      minSupportedVersion: typeof record.minSupportedVersion === 'string' ? record.minSupportedVersion : '',
      forceLevel,
      releaseNotes: typeof record.releaseNotes === 'string' ? record.releaseNotes : '',
    }
  } finally {
    window.clearTimeout(timeout)
  }
}

function renderPolicyNotice(versionInfo: VersionInfo): void {
  if (versionInfo.forceLevel === 'NONE') return
  const notice = document.createElement('aside')
  notice.id = 'internal-chat-version-notice'
  notice.setAttribute('data-testid', 'internal-chat-version-notice')
  notice.setAttribute('role', versionInfo.forceLevel === 'CRITICAL' ? 'alertdialog' : 'status')
  notice.className = 'notice version-notice'
  notice.textContent = versionInfo.forceLevel === 'CRITICAL'
    ? `현재 버전은 지원이 종료되었습니다. 최신 버전 ${versionInfo.latestVersion || '확인 필요'}을 설치한 뒤 다시 실행해 주세요.`
    : `새 사내 메신저 버전 ${versionInfo.latestVersion || '확인 필요'}이 있습니다. 다운로드가 끝나면 자동으로 설치하고 앱을 다시 시작합니다.`
  if (versionInfo.releaseNotes) {
    const notes = document.createElement('small')
    notes.textContent = ` ${versionInfo.releaseNotes}`
    notice.appendChild(notes)
  }
  const close = document.createElement('button')
  close.type = 'button'
  close.textContent = versionInfo.forceLevel === 'CRITICAL' ? '업데이트 다시 확인' : '안내 닫기'
  close.addEventListener('click', versionInfo.forceLevel === 'CRITICAL' ? checkForUpdate : () => notice.remove())
  notice.append(' ', close)
  root.appendChild(notice)
}

function renderPolicyFailure(error: unknown): void {
  console.warn('[internal-chat-version] 버전 정책 조회 실패', error)
  const notice = document.createElement('aside')
  notice.id = 'internal-chat-version-policy-error'
  notice.setAttribute('data-testid', 'internal-chat-version-policy-error')
  notice.setAttribute('role', 'status')
  notice.className = 'notice policy-error-notice'
  notice.textContent = VERSION_POLICY_FAILURE_MESSAGE
  root.appendChild(notice)
}

void fetchVersionInfo().then(renderPolicyNotice).catch(renderPolicyFailure)
