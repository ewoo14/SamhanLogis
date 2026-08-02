import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const pageSource = readFileSync(new URL('./DispatchSmsPage.tsx', import.meta.url), 'utf8')
const apiSource = readFileSync(new URL('../api/dispatchSmsApi.ts', import.meta.url), 'utf8')
const routeSource = readFileSync(new URL('./index.tsx', import.meta.url), 'utf8')
const layoutSource = readFileSync(new URL('../components/AppLayout.tsx', import.meta.url), 'utf8')

describe('#1013 Scope A — 배차안내문자 표시·복사 전용 계약', () => {
  it('화면은 자동 SMS 발송 API와 발송 버튼을 제공하지 않는다', () => {
    expect(pageSource).not.toContain('sendDispatchBatch')
    expect(pageSource).not.toContain('SMS 발송 (')
    expect(apiSource).not.toContain('/admin/notifications/dispatch-batch/send')
  })

  it('화면은 레거시 계승용 편집·복사 경로를 유지한다', () => {
    expect(pageSource).toContain('buildDispatchSmsClipboardText')
    expect(pageSource).toContain('onMessageChange')
    expect(pageSource).toContain('saveDispatchSmsHistory')
  })

  it('자동 발송 감사 전용 화면과 사이드바 진입점은 제공하지 않는다', () => {
    expect(routeSource).not.toContain("/arologis/dispatch-sms/send-audit")
    expect(layoutSource).not.toContain('notification.dispatch-sms.send-audit')
    expect(layoutSource).not.toContain('sidebar-arologis-sms-send-audit')
  })
})
