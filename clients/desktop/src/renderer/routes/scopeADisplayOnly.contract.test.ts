import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const pageSource = readFileSync(new URL('./DispatchSmsPage.tsx', import.meta.url), 'utf8')
const apiSource = readFileSync(new URL('../api/dispatchSmsApi.ts', import.meta.url), 'utf8')
const historyApiSource = readFileSync(new URL('../api/dispatchSmsSaveHistoryApi.ts', import.meta.url), 'utf8')
const mockSource = readFileSync(new URL('../api/mock.ts', import.meta.url), 'utf8')
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
    expect(pageSource).toContain('groupMessage')
    expect(pageSource).toContain('dispatch-sms-unmapped-message')
    expect(pageSource).toContain('getDispatchSmsRowKey')
    expect(pageSource).not.toContain('onMessageChange(p.partnerCode')
  })

  it('미매핑 전표는 각 행 라벨에 미매핑을 명시한다', () => {
    expect(pageSource).toContain('{u.partnerName} [미매핑] · 전표 {u.slipNo}')
  })

  it('V92 정본 page code가 메뉴·라우트·실행 화면의 공통 인가 근거다', () => {
    const pageCode = 'notification.dispatch-sms.send-audit'
    expect(layoutSource).toContain(`dynamicCanAccess('${pageCode}', 'view')`)
    expect(routeSource).toContain(`pageCode="${pageCode}"`)
    expect(pageSource).toContain(`canAccess('${pageCode}', 'create')`)
    expect(layoutSource).not.toContain("dynamicCanAccess('dispatch.batch', 'view')")
    expect(routeSource).not.toContain('pageCode="dispatch.batch"')
    expect(pageSource).not.toContain("canAccess('dispatch.batch', 'create')")
  })

  it('발송 감사 모드·mock 데이터·생성 API 잔재를 제공하지 않는다', () => {
    expect(historyApiSource).not.toContain('SEND_AUDIT')
    expect(historyApiSource).not.toContain('sendAudit')
    expect(mockSource).not.toContain('SEND_AUDIT')
    expect(mockSource).not.toContain("saveMode: 'SEND_AUDIT'")
    expect(mockSource).not.toContain('/send-audit')
  })
})
