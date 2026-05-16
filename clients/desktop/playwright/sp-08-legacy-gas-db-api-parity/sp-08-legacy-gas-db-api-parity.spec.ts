import { expect, test } from '@playwright/test'
import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'

const specDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(specDir, '../../../..')

function read(relPath: string): string {
  return fs.readFileSync(path.join(repoRoot, relPath), 'utf8')
}

function exists(relPath: string): boolean {
  return fs.existsSync(path.join(repoRoot, relPath))
}

function listLegacyGasApps(): string[] {
  const root = path.join(repoRoot, 'tools/legacy-gas')
  return fs.readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('_'))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b, 'ko'))
}

test.describe('SP-08 legacy GAS DB/API parity guard', () => {
  const orderAppApi = read('clients/web/order-app/src/samhanApi.ts')
  const orderAppHtml = read('clients/web/order-app/index.html')
  const estimateAppHtml = read('clients/web/estimate-app/views/index.ejs')
  const draftController = read('services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/web/PartnerOrderDraftController.java')
  const draftService = read('services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/service/PartnerOrderDraftService.java')
  const draftRepository = read('services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/repository/PartnerOrderDraftRepository.java')
  const dcConfigPage = read('clients/desktop/src/renderer/routes/SalesPartnerDcConfigPage.tsx')
  const regionsPage = read('clients/desktop/src/renderer/routes/admin/RegionsPage.tsx')
  const chatRoomsPage = read('clients/desktop/src/renderer/routes/admin/ChatRoomsPage.tsx')
  const chatRoomApi = read('clients/desktop/src/renderer/api/chatRoomApi.ts')
  const blockedPartnerApi = read('clients/desktop/src/renderer/api/blockedPartnerApi.ts')
  const planningDoc = read('docs/planning/2026-05-16_legacy-gas-db-api-parity.md')
  const reportDoc = read('docs/dev-reports/sp-08-legacy-gas-db-api-parity.md')
  const qaChecklist = read('docs/qa/sp-08-legacy-gas-db-api-parity/screenshot-checklist.md')
  const screenshotScript = read('scripts/generate-sp-08-legacy-gas-db-api-parity-screenshots.mjs')

  test('legacy GAS inventory includes UI files, including the known Inde.html typo surface', () => {
    const apps = listLegacyGasApps()
    expect(apps).toContain('종합견적서')
    expect(apps).toContain('거래처 발송 주문서')
    expect(apps).toContain('운송사-실배차내역 비교')
    expect(apps).toContain('알리고 자동 업로드')
    expect(apps.length).toBeGreaterThanOrEqual(18)

    expect(exists('tools/legacy-gas/운송사-실배차내역 비교/Inde.html')).toBe(true)
    expect(planningDoc).toContain('UI/플로우는 유지')
    expect(planningDoc).toContain('Samhan Public 14 service DB + 자체 API')
  })

  test('user-visible UI text no longer says Notion is the live save/import target', () => {
    expect(estimateAppHtml).not.toContain('노션에 저장')
    expect(dcConfigPage).not.toContain('Notion CSV')
    expect(dcConfigPage).not.toContain('노션에서 다운로드')
    expect(regionsPage).not.toContain('노션 "지역 분류')
    expect(regionsPage).not.toContain('노션에서 export')
    expect(chatRoomsPage).not.toContain('Notion 생성')
    expect(chatRoomApi).not.toContain("NOTION_IMPORT: 'Notion 시드'")
    expect(blockedPartnerApi).not.toContain("NOTION_IMPORT: '노션 가져오기'")
  })

  test('order-app snapshot history preserves legacy partner/date arguments through DB API query params', () => {
    expect(orderAppHtml).toContain('.getOrderSnapshotHistory(safeBizNo, sDate, eDate)')
    expect(orderAppApi).toContain('function toIsoDateParam(value: unknown): string | undefined')
    expect(orderAppApi).toContain('function draftHistoryParams(args: unknown[]): { from?: string; to?: string }')
    expect(orderAppApi).toContain('void bizNo')
    expect(orderAppApi).toContain('params: draftHistoryParams(args)')
    expect(orderAppApi).not.toContain('params: { bizNo, from, to }')
  })

  test('partner-order draft backend supports optional legacy date range filter without changing old callers', () => {
    expect(draftController).toContain('@DateTimeFormat(iso = DateTimeFormat.ISO.DATE)')
    expect(draftController).toContain('@RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from')
    expect(draftController).toContain('@RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to')
    expect(draftController).toContain('draftService.list(partnerCode, from, to, pageable)')
    expect(draftService).toContain('public Page<DraftResponse> list(String partnerCode, LocalDate from, LocalDate to, Pageable pageable)')
    expect(draftRepository).toContain('findAllByPartnerCodeAndCreatedAtBetweenOrderByCreatedAtDesc')
    expect(draftRepository).toContain('findAllByPartnerCodeAndCreatedAtGreaterThanEqualOrderByCreatedAtDesc')
    expect(draftRepository).toContain('findAllByPartnerCodeAndCreatedAtLessThanEqualOrderByCreatedAtDesc')
    expect(draftService).not.toContain('LocalDate.of(1970, 1, 1)')
    expect(draftService).not.toContain('LocalDate.of(9999, 12, 31)')
  })

  test('active runtime code does not keep a Notion HTTP endpoint as data source', () => {
    expect(orderAppHtml).not.toContain('https://api.notion.com')
    expect(orderAppApi).not.toContain('https://api.notion.com')
    expect(orderAppApi).not.toContain('Notion-Version')
    expect(estimateAppHtml).not.toContain('https://api.notion.com')
    expect(estimateAppHtml).not.toContain('Notion-Version')
  })

  test('SP-08 artifacts do not publish raw credentials or empty screenshots', () => {
    const textArtifacts = [
      planningDoc,
      reportDoc,
      qaChecklist,
      screenshotScript,
      read('CHANGELOG.md'),
      read('README.md'),
    ].join('\n')

    expect(textArtifacts).not.toMatch(/ntn_[A-Za-z0-9_-]{20,}/)
    expect(textArtifacts).not.toMatch(/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/)
    expect(textArtifacts).not.toMatch(/docs\.google\.com\/spreadsheets\/d\/[A-Za-z0-9_-]{30,}/)
    expect(textArtifacts).not.toMatch(/\b(?:spreadsheetId|sheetId|sourceId|SAMHAN_GOOGLE_SHEETS_SOURCE_ID)\s*[:=]\s*['"][A-Za-z0-9_-]{30,}['"]/i)
    expect(textArtifacts).not.toMatch(/aligo[_-]?key\s*[:=]\s*['"][^'"]+['"]/i)

    const screenshotDir = path.join(repoRoot, 'docs/qa/sp-08-legacy-gas-db-api-parity/screenshots')
    const screenshots = fs.readdirSync(screenshotDir).filter((name) => name.endsWith('.png'))
    expect(screenshots).toHaveLength(11)
    for (const screenshot of screenshots) {
      expect(fs.statSync(path.join(screenshotDir, screenshot)).size).toBeGreaterThan(0)
    }
  })
})
