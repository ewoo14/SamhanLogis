import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const rendererRoot = fileURLToPath(new URL('../', import.meta.url))
const salesSubNav = readFileSync(`${rendererRoot}components/sales/SalesSubNav.tsx`, 'utf8')
const appLayout = readFileSync(`${rendererRoot}components/AppLayout.tsx`, 'utf8')
const page = readFileSync(`${rendererRoot}routes/SalesOrderApprovalsPage.tsx`, 'utf8')

describe('주문서 승인 메뉴 계약', () => {
  it('상단 탭과 사이드바에서 주문서 승인 라우트가 각각 한 항목만 노출된다', () => {
    expect(salesSubNav.match(/\{ to: '\/sales\/order-approvals', label:/g)).toHaveLength(1)
    expect(appLayout.match(/to="\/sales\/order-approvals"/g)).toHaveLength(1)
    expect(page).toContain("setPageTitle({ title: '주문서 승인', meta: '영업' })")
    expect(page).toContain('            주문서 승인')
    expect(page).not.toContain('주문서 앱 접근권한 설정')
  })
})
