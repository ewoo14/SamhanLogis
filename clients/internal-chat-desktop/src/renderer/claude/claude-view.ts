import { askClaude, claudeErrorMessage } from './claude-api'
import { buildDeepLink } from './deep-link'

interface ClaudeBridge {
  openDeepLink: (link: string) => Promise<{ opened: boolean; message?: string }>
}

declare global {
  interface Window { internalChatNavigation?: ClaudeBridge }
}

export function mountClaudeConversation(parent: HTMLElement): void {
  const section = document.createElement('section')
  section.className = 'claude-panel'
  section.setAttribute('aria-labelledby', 'claude-title')
  section.innerHTML = `
    <header><h2 id="claude-title">Claude 대화</h2><p>서버 API를 통해 질문합니다. 업무 화면 조작은 하지 않습니다.</p></header>
    <div class="claude-history" aria-live="polite"><p class="claude-muted">아직 대화가 없습니다.</p></div>
    <form class="claude-form">
      <label for="claude-question">질문</label>
      <textarea id="claude-question" rows="3" required placeholder="질문을 입력하세요."></textarea>
      <button type="submit">질문 보내기</button>
    </form>
    <button type="button" class="claude-deep-link">배차 화면 열기</button>
    <p class="claude-muted">딥링크 대상 앱이 다시 인증·권한을 확인합니다.</p>
    <div class="claude-status" role="status" aria-live="assertive"></div>
  `
  parent.appendChild(section)

  const form = section.querySelector<HTMLFormElement>('.claude-form')!
  const input = section.querySelector<HTMLTextAreaElement>('#claude-question')!
  const history = section.querySelector<HTMLElement>('.claude-history')!
  const status = section.querySelector<HTMLElement>('.claude-status')!
  const submit = form.querySelector<HTMLButtonElement>('button')!
  form.addEventListener('submit', (event) => {
    event.preventDefault()
    const question = input.value.trim()
    if (!question || submit.disabled) return
    submit.disabled = true
    status.textContent = ''
    const userMessage = document.createElement('p')
    userMessage.textContent = `나: ${question}`
    history.replaceChildren(userMessage)
    input.value = ''
    void askClaude(question).then((answer) => {
      const assistantMessage = document.createElement('p')
      assistantMessage.textContent = `Claude: ${answer}`
      history.appendChild(assistantMessage)
    }).catch((error: unknown) => {
      status.textContent = claudeErrorMessage(error)
    }).finally(() => { submit.disabled = false })
  })

  section.querySelector<HTMLButtonElement>('.claude-deep-link')!.addEventListener('click', () => {
    const bridge = window.internalChatNavigation
    if (!bridge) { status.textContent = '딥링크를 열 수 없습니다.'; return }
    void bridge.openDeepLink(buildDeepLink('arologis', '/dispatches/manual')).then((result) => {
      if (!result.opened) status.textContent = result.message ?? '대상 앱을 열 수 없습니다.'
    }).catch((error: unknown) => { status.textContent = error instanceof Error ? error.message : '딥링크를 열 수 없습니다.' })
  })
}
