import {
  fetchWebVersionStatus,
  hasUnsavedFormInput,
  resolveVersionPromptState,
  type FormControlSnapshot,
  type VersionPromptState,
} from './versionCheck'

export type VersionReloadResult = 'confirmation-required' | 'reloaded'

/** dirty 상태에서는 사용자의 두 번째 선택 전까지 페이지를 재요청하지 않는다. */
export function createVersionReloadGuard(
  isDirty: () => boolean,
  reload: () => void,
): (confirmed?: boolean) => VersionReloadResult {
  return (confirmed = false) => {
    if (isDirty() && !confirmed) return 'confirmation-required'
    reload()
    return 'reloaded'
  }
}

const DRAFT_ROOT_SELECTOR = '#cardHome, #cardSingle, #cardComm, #cardOld, #pageOrderInfo, #pageBranch'

function readOrderDraftControls(documentRef: Document): FormControlSnapshot[] {
  return Array.from(documentRef.querySelectorAll<FormControlElement>(
    `${DRAFT_ROOT_SELECTOR} input, ${DRAFT_ROOT_SELECTOR} select, ${DRAFT_ROOT_SELECTOR} textarea`,
  ))
    .filter((element) => !element.closest('.filter-bar'))
    .map((element) => ({
      tagName: element.tagName,
      type: element.type,
      value: element.value,
      defaultValue: element.defaultValue,
      checked: element.checked,
      defaultChecked: element.defaultChecked,
    }))
}

function isOrderDraftDirty(documentRef: Document): boolean {
  return hasUnsavedFormInput(readOrderDraftControls(documentRef))
}

interface FormControlElement extends Element {
  type?: string
  value?: string
  defaultValue?: string
  checked?: boolean
  defaultChecked?: boolean
}

interface OrderVersionGateOptions {
  currentVersion: string
  apiBaseUrl: string
  documentRef?: Document
  fetchImpl?: typeof fetch
  reload?: () => void
}

/** 주문 레거시 DOM 위에 버전 안내를 얹는다. 어떤 분기도 자동 reload를 실행하지 않는다. */
export async function mountOrderVersionGate({
  currentVersion,
  apiBaseUrl,
  documentRef = document,
  fetchImpl,
  reload = () => window.location.reload(),
}: OrderVersionGateOptions): Promise<void> {
  const versionInfo = await fetchWebVersionStatus({ apiBaseUrl, currentVersion, fetchImpl })
  if (!versionInfo) return

  const promptState = resolveVersionPromptState(versionInfo, readBrowserStorage())
  if (promptState.kind === 'none') return

  const notice = documentRef.createElement('aside')
  notice.id = 'samhan-order-version-notice'
  notice.setAttribute('data-testid', 'web-version-notice')
  notice.setAttribute('role', promptState.kind === 'blocking' ? 'alertdialog' : 'status')
  notice.setAttribute('aria-live', 'polite')
  Object.assign(notice.style, {
    position: 'fixed',
    insetInline: '16px',
    insetBlockEnd: '16px',
    zIndex: '300000',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '12px',
    padding: '14px 16px',
    border: '1px solid #2563eb',
    borderRadius: '10px',
    background: '#ffffff',
    color: '#111827',
    boxShadow: '0 12px 30px rgba(15, 23, 42, .2)',
    fontFamily: 'system-ui, sans-serif',
  })

  const message = documentRef.createElement('span')
  message.textContent = promptMessage(promptState)
  notice.appendChild(message)

  const actions = documentRef.createElement('div')
  actions.style.display = 'flex'
  actions.style.gap = '8px'
  const reloadButton = documentRef.createElement('button')
  reloadButton.type = 'button'
  reloadButton.textContent = '페이지 새로고침'
  reloadButton.setAttribute('data-testid', 'web-version-reload')
  reloadButton.addEventListener('click', () => {
    const guard = createVersionReloadGuard(
      () => isOrderDraftDirty(documentRef),
      reload,
    )
    if (guard() === 'confirmation-required' && window.confirm('작성 중인 주문서가 있습니다. 저장하지 않은 입력이 사라질 수 있습니다. 그래도 새로고침할까요?')) {
      guard(true)
    }
  })
  actions.appendChild(reloadButton)

  if (promptState.kind !== 'blocking') {
    const dismissButton = documentRef.createElement('button')
    dismissButton.type = 'button'
    dismissButton.textContent = '나중에'
    dismissButton.setAttribute('data-testid', 'web-version-dismiss')
    dismissButton.addEventListener('click', () => {
      if (promptState.kind === 'minor' || promptState.kind === 'recommend') {
      try {
        const storage = promptState.kind === 'minor' ? window.localStorage : window.sessionStorage
        storage.setItem(promptState.dismissKey, 'true')
      } catch { /* 저장소 차단은 무시 */ }
      }
      notice.remove()
    })
    actions.appendChild(dismissButton)
  }
  notice.appendChild(actions)
  documentRef.body.appendChild(notice)
}

function promptMessage(state: Exclude<VersionPromptState, { kind: 'none' }>): string {
  if (state.kind === 'blocking') return `현재 주문 웹 버전은 지원이 종료되었습니다. 최신 버전 ${state.latestVersion}으로 새로고침해 주세요.`
  if (state.kind === 'recommend') return `새 주문 웹 버전 ${state.latestVersion}이 있습니다. 작성 중인 내용이 있으면 먼저 저장해 주세요.`
  return `새 주문 웹 버전 ${state.latestVersion}을 사용할 수 있습니다.`
}

function readBrowserStorage(): Map<string, string> {
  const values = new Map<string, string>()
  for (const storageName of ['localStorage', 'sessionStorage'] as const) {
    try {
      const storage = window[storageName]
      for (let index = 0; index < storage.length; index += 1) {
        const key = storage.key(index)
        if (key) values.set(key, storage.getItem(key) ?? '')
      }
    } catch {
      // 저장소 차단은 dismiss 없이 진행한다.
    }
  }
  return values
}
