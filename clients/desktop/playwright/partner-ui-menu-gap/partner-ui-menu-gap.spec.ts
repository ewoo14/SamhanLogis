/**
 * Samhan Public 거래처 관리 UI gap contract.
 *
 * dev server 없이 실행되는 정적 회귀 스펙:
 * - /admin/partners 목록은 SALES / MANAGER / MASTER 가드로 AdminLayout 외부에서 열려야 한다.
 * - 영업 사이드바에서 거래처 관리 진입점을 노출해야 한다.
 * - 생성 성공/취소 후 복귀 경로는 UUID가 아닌 /admin/partners 목록이어야 한다.
 */
import { expect, test } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const desktopRoot = path.resolve(__dirname, '../..')
const routePath = path.join(desktopRoot, 'src/renderer/routes/index.tsx')
const layoutPath = path.join(desktopRoot, 'src/renderer/components/AppLayout.tsx')
const partnerApiPath = path.join(desktopRoot, 'src/renderer/api/partnerApi.ts')
const createPagePath = path.join(
  desktopRoot,
  'src/renderer/routes/admin/PartnerCreatePage.tsx',
)

function read(filePath: string): string {
  return fs.readFileSync(filePath, 'utf8')
}

test.describe('Samhan Public 거래처 관리 UI gap', () => {
  test('거래처 목록과 신규 등록 라우트는 SALES/MANAGER/MASTER 권한으로 정렬된다', () => {
    const routes = read(routePath)
    const partnerApi = read(partnerApiPath)

    expect(partnerApi).toContain('PARTNER_FULL_ROLES')
    expect(partnerApi).toContain("'SALES'")
    expect(partnerApi).toContain("'MANAGER'")
    expect(partnerApi).toContain("'MASTER'")

    expect(routes).toContain("path: '/admin/partners'")
    expect(routes).toContain("path: '/admin/partners/new'")
    expect(routes).toMatch(
      /path:\s*'\/admin\/partners'[\s\S]*?<RoleGuard allow=\{PARTNER_FULL_ROLES\}>[\s\S]*?<AdminPartnersPage \/>[\s\S]*?<\/RoleGuard>/,
    )
    expect(routes).toMatch(
      /path:\s*'\/admin\/partners\/new'[\s\S]*?<RoleGuard allow=\{PARTNER_FULL_ROLES\}>[\s\S]*?<AdminPartnerCreatePage \/>[\s\S]*?<\/RoleGuard>/,
    )
    expect(routes).not.toContain("{ path: 'partners', element: <AdminPartnersPage /> }")
  })

  test('영업 사이드바에서 거래처 관리 목록을 직접 발견할 수 있다', () => {
    const layout = read(layoutPath)

    expect(layout).toContain('sidebar-sales-partners')
    expect(layout).toContain('거래처 관리')
    expect(layout).toMatch(
      /to="\/admin\/partners"[\s\S]*show=\{showPartnerManagement[\s\S]*requiredRole="SALES \/ MANAGER \/ MASTER"/,
    )
  })

  test('신규 등록 성공과 취소는 UUID 없이 거래처 목록으로 복귀한다', () => {
    const createPage = read(createPagePath)

    expect(createPage).toContain("navigate('/admin/partners'")
    expect(createPage).toContain('createdPartnerCode')
    expect(createPage).not.toContain('createdPartnerId')
    expect(createPage).not.toContain('result.basic.id')
  })
})
