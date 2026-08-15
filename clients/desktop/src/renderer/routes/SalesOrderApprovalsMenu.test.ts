import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const rendererRoot = fileURLToPath(new URL('../', import.meta.url))
const salesSubNav = readFileSync(`${rendererRoot}components/sales/SalesSubNav.tsx`, 'utf8')
const appLayout = readFileSync(`${rendererRoot}components/AppLayout.tsx`, 'utf8')
const page = readFileSync(`${rendererRoot}routes/SalesOrderApprovalsPage.tsx`, 'utf8')
const externalLinks = readFileSync(`${rendererRoot}components/sales/SalesExternalLink.tsx`, 'utf8')
const salesRoutes = [
  'EstimateListPage.tsx',
  'EstimatePricingConfigPage.tsx',
  'SalesOrderApprovalsPage.tsx',
  'SalesPartnerOrderListPage.tsx',
  'SalesPartnerOrderDetailPage.tsx',
  'SalesPartnerDcConfigPage.tsx',
].map((name) => readFileSync(`${rendererRoot}routes/${name}`, 'utf8'))

describe('주문서 승인 메뉴 계약', () => {
  it('판매 route sub navigation은 제거되고 주문서 승인 route는 사이드바에만 남는다', () => {
    expect(salesSubNav).not.toContain("to: '/sales/order-approvals'")
    expect(salesRoutes.every((source) => !source.includes('SalesSubNav'))).toBe(true)
    expect(appLayout.match(/to="\/sales\/order-approvals"/g)).toHaveLength(1)
    expect(page).toContain("setPageTitle({ title: '주문서 승인', meta: '영업' })")
    expect(page).toContain('            주문서 승인')
    expect(page).not.toContain('주문서 앱 접근권한 설정')
  })

  it('외부 웹앱 진입구는 권한 게이트가 있는 판매 사이드바용 컴포넌트로 이동한다', () => {
    expect(salesSubNav).not.toContain('웹 종합견적서')
    expect(salesSubNav).not.toContain('웹 주문서')
    expect(appLayout).toContain('<SalesExternalLink')
    expect(appLayout).toContain('show={showEstimatesList}')
    expect(appLayout).toContain('show={showPartnerOrderList}')
    expect(externalLinks).toContain('{label} ↗')
    expect(appLayout).toContain('label="웹 종합견적서"')
    expect(appLayout).toContain('label="웹 주문서"')
  })

  it('외부 URL이 없으면 열지 않고 운영 빌드 설정 안내를 표시한다', () => {
    expect(externalLinks).toContain('외부 웹앱 주소가 운영 빌드에 설정되지 않았습니다')
    expect(externalLinks).not.toContain("?? 'http://localhost")
  })
})
