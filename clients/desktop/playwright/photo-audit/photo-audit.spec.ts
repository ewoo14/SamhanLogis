/**
 * D-AX-20 사진 감사 contract / artifact Playwright spec.
 *
 * dev server 가 없어도 실행된다. 실제 시각 캡처는
 * `qa/playwright/scripts/generate-d-ax-20-arologis-admin-photo-audit-screenshots.mjs`
 * 가 담당하고, 이 spec 은 route/API/UUID 가드/캡처 산출물 계약을 검증한다.
 */
import { expect, test } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const desktopRoot = path.resolve(__dirname, '../..')
const repoRoot = path.resolve(desktopRoot, '../..')
const pagePath = path.join(desktopRoot, 'src/renderer/routes/admin/PhotoAuditPage.tsx')
const apiPath = path.join(desktopRoot, 'src/renderer/api/slipPhotoAuditApi.ts')
const routePath = path.join(desktopRoot, 'src/renderer/routes/index.tsx')
const layoutPath = path.join(desktopRoot, 'src/renderer/components/AppLayout.tsx')
const screenshotScriptPath = path.resolve(
  repoRoot,
  'qa/playwright/scripts/generate-d-ax-20-arologis-admin-photo-audit-screenshots.mjs',
)
const screenshotsDir = path.resolve(
  repoRoot,
  'docs/qa/d-ax-20-arologis-admin-photo-audit/screenshots',
)

const expectedScreenshots = [
  '01-scope-contract.png',
  '02-filter-table.png',
  '03-thumbnail-no-url.png',
  '04-reupload-candidate-badge.png',
  '05-gps-audit-metadata.png',
  '06-verification-matrix.png',
  '07-pr-inline-capture-checklist.png',
]

const forbiddenPrivacyTerms = [
  /attachmentId/,
  /slipId/,
  /dispatchId/,
  /vehicleId/,
  /stopId/,
  /downloadUrl/,
  /Bearer/,
  /\btoken\b/i,
  /storageKey/,
  /presigned/,
]

function read(filePath: string): string {
  return fs.readFileSync(filePath, 'utf8')
}

test.describe('D-AX-20 사진 감사 contract', () => {
  test('API와 route가 gateway 계약과 role guard를 유지한다', () => {
    const api = read(apiPath)
    const routes = read(routePath)
    const layout = read(layoutPath)

    expect(api).toContain('/api/v1/slips/admin/photo-audit')
    expect(routes).toContain("path: '/admin/photo-audit'")
    // [C2b] 단독 RoleGuard 제거 → PermissionGuard(slip.photo-audit) 단일 게이트.
    expect(routes).toMatch(/path: '\/admin\/photo-audit'[\s\S]*?pageCode="slip\.photo-audit"/)
    expect(layout).toContain('sidebar-warehouse-photo-audit')
    expect(layout).toContain('사진 감사')
  })

  test('화면 텍스트는 UUID와 raw URL을 노출하지 않는 가드를 포함한다', () => {
    const page = read(pagePath)
    const api = read(apiPath)

    // fix2 이후 UUID 판정은 개별 정규식이 아니라 공통 safeActorName resolver가 담당한다.
    expect(page).toContain('safeActorName')
    expect(page).toContain('URL_LIKE_PATTERN')
    expect(page).toContain('formatUploader')
    expect(page).toContain('업로더 확인 필요')
    expect(page).toContain('전표번호만 입력해 주세요.')
    expect(page).toContain('photo-audit-search-button')
    expect(page).toContain('미리보기, 전표')
    expect(api).toContain("slipNo: '2026/05/15-1'")
    expect(api).not.toMatch(/S-2026|SL-2026/)
    for (const pattern of forbiddenPrivacyTerms) {
      expect(api).not.toMatch(pattern)
      expect(page).not.toMatch(pattern)
    }
  })

  test('QA 캡처 산출물 7장은 실제 파일명과 privacy guard를 유지한다', () => {
    const generator = read(screenshotScriptPath)

    expect(generator).toContain('privacy guard PASS')
    expect(generator).not.toMatch(/S-2026|SL-2026/)
    expect(generator).not.toContain('candidate rule')
    expect(generator).toContain('internal-audit-rule-id')
    expect(generator).toContain('2026/05/16-412')

    for (const name of expectedScreenshots) {
      const filePath = path.join(screenshotsDir, name)
      expect(fs.existsSync(filePath), `${name} exists`).toBe(true)
      expect(fs.statSync(filePath).size, `${name} is not placeholder`).toBeGreaterThan(25_000)
    }
  })
})
