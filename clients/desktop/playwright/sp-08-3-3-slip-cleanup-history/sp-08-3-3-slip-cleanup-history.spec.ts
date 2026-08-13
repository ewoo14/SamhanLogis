/**
 * @file SP-08-3-3 slip cleanup history contract.
 *
 * Local-only - qa-e2e.yml does not run this file. It verifies the clients/desktop
 * static contract plus mock UI on the real /sales/slip-cleanup route when a local
 * VITE_MOCK_MODE=1 renderer dev server is available.
 */
import { expect, test, type Page } from '@playwright/test'
import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)
const repoRoot = path.resolve(dirname, '../../../..')
const BASE_URL = process.env['VITE_BASE_URL'] ?? process.env['AUDIT_BASE_URL'] ?? 'http://localhost:5173'
const UUID_REGEX = /\b(?:[0-9a-f]{32}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\b/i

function read(relPath: string): string {
  return fs.readFileSync(path.join(repoRoot, relPath), 'utf8')
}


async function openSlipCleanup(page: Page, query = 'mockRole=SALES'): Promise<void> {
  await page.goto(`${BASE_URL}/#/sales/slip-cleanup?${query}`, {
    waitUntil: 'domcontentloaded',
    timeout: 20_000,
  })
  await page.waitForLoadState('networkidle', { timeout: 8_000 }).catch(() => {})
}

test.describe('SP-08-3-3 slip cleanup history', () => {
  test('backend save-history DB/API contract is stable', () => {
    const service = read('services/slip-service/src/main/java/com/samhanair/logis/slip/service/SlipCleanupSaveHistoryService.java')
    const controller = read('services/slip-service/src/main/java/com/samhanair/logis/slip/web/SlipCleanupSaveHistoryController.java')
    const repository = read('services/slip-service/src/main/java/com/samhanair/logis/slip/repository/SlipCleanupSaveHistoryRepository.java')
    const migration = read('services/slip-service/src/main/resources/db/migration/V25__add_slip_cleanup_save_history.sql')
    const errorCode = read('shared/common/src/main/java/com/samhanair/logis/common/exception/ErrorCode.java')

    expect(controller).toContain('@RequestMapping("/slips/cleanup/history")')
    expect(controller).toContain('@RequirePermission(page = "slip.cleanup-history"')
    expect(controller).toContain('@GetMapping("/latest")')
    expect(repository).toContain('findByIdAndCreatedBy(UUID id, String createdBy)')
    expect(service).toContain('MAX_RESPONSE_PAYLOAD_BYTES = 100 * 1024')
    expect(service).toContain('MAX_AUTO_LATEST_RETRIES = 3')
    expect(service).toContain('DataIntegrityViolationException')
    expect(service).toContain('TransactionTemplate')
    expect(service).toContain('PROPAGATION_REQUIRES_NEW')
    expect(service).toContain('DateRange.of(from, to)')
    expect(service).toContain('SLIP_CLEANUP_HISTORY_NOT_FOUND')
    expect(service).not.toContain('existsById')
    expect(errorCode).toContain('SLIP_CLEANUP_HISTORY_NOT_FOUND(HttpStatus.NOT_FOUND')
    expect(migration).toContain('CREATE TABLE slip_cleanup_save_history')
    expect(migration).toContain('CHECK (program_type IN (\'SLIP_CLEANUP\'))')
    expect(migration).toContain('ux_slip_cleanup_history_auto_latest_per_user_program')
  })

  test('frontend uses gated latest restore, cache invalidation, Modal, and shared masking', () => {
    const pageSource = read('clients/desktop/src/renderer/routes/SlipCleanupPage.tsx')
    const api = read('clients/desktop/src/renderer/api/slipCleanupSaveHistoryApi.ts')
    const historyTab = read('clients/desktop/src/renderer/components/SlipCleanupHistoryTab.tsx')
    const saveDialog = read('clients/desktop/src/renderer/components/SlipCleanupSaveDialog.tsx')
    const restoredBanner = read('clients/desktop/src/renderer/components/SlipCleanupRestoredBanner.tsx')
    const maskCreatedBy = read('clients/desktop/src/renderer/utils/maskCreatedBy.ts')
    const mock = read('clients/desktop/src/renderer/api/mock.ts')

    expect(api).toContain('/slips/cleanup/history')
    expect(api).toContain('/slips/cleanup/history/latest')
    expect(api).toContain('axios.isAxiosError')
    expect(pageSource).toContain('latestRestoreSettled')
    expect(pageSource).toContain('skipNextAutoSaveRef')
    expect(pageSource).toContain('enabled: latestRestoreSettled && !restoredResponse')
    expect(pageSource).toContain("queryKey: ['slip-cleanup-history-list', 'SLIP_CLEANUP']")
    expect(pageSource).toContain('invalidateQueries')
    expect(historyTab).toContain('DataGrid')
    expect(historyTab).toContain('Input')
    expect(historyTab).toContain('Select')
    expect(historyTab).toContain('getRowTestId')
    expect(historyTab).toContain('maskCreatedBy')
    expect(saveDialog).toContain('Modal')
    expect(saveDialog).not.toContain('backdropStyle')
    expect(restoredBanner).toContain('restored-banner')
    // fix2 이후 시스템/UUID 변형 판정은 공통 safeActorName resolver에 위임한다.
    expect(maskCreatedBy).toContain('safeActorName')
    expect(maskCreatedBy).toContain("return '시스템'")
    expect(maskCreatedBy).toContain("return '사용자'")
    expect(mock).toContain('mockLatest404')
    expect(mock.indexOf('/slips/cleanup/history')).toBeLessThan(mock.indexOf("url.includes('/slips/cleanup')"))
  })

  test('DPS regression guard uses design-system Input and tokenized colors', () => {
    const saveDialog = read('clients/desktop/src/renderer/components/DpsSaveDialog.tsx')
    const restoredBanner = read('clients/desktop/src/renderer/components/DpsRestoredBanner.tsx')

    expect(saveDialog).toContain('Input')
    expect(saveDialog).not.toContain('<input')
    expect(saveDialog).not.toMatch(/#[0-9A-Fa-f]{3,6}/)
    expect(restoredBanner).not.toMatch(/#[0-9A-Fa-f]{3,6}/)
    expect(restoredBanner).toContain('var(--state-info-border)')
  })

  test('new history artifacts expose no literal UUIDs or Notion runtime calls', () => {
    const guarded = [
      'clients/desktop/src/renderer/api/slipCleanupSaveHistoryApi.ts',
      'clients/desktop/src/renderer/components/SlipCleanupHistoryTab.tsx',
      'clients/desktop/src/renderer/components/SlipCleanupRestoredBanner.tsx',
      'clients/desktop/src/renderer/components/SlipCleanupSaveDialog.tsx',
      'services/slip-service/src/main/java/com/samhanair/logis/slip/domain/SlipCleanupSaveHistory.java',
      'services/slip-service/src/main/java/com/samhanair/logis/slip/service/SlipCleanupSaveHistoryService.java',
      'services/slip-service/src/main/java/com/samhanair/logis/slip/web/SlipCleanupSaveHistoryController.java',
    ].map(read).join('\n')

    expect(guarded).not.toMatch(UUID_REGEX)
    expect(guarded).not.toMatch(/api\.notion\.com|Notion-Version|@notionhq/)
  })

  test('mock route: latest restore, dialog, history tab, and row restore work on the real route', async ({ page }) => {
    await openSlipCleanup(page)

    await expect(page.locator('[data-testid="slip-cleanup-history-tab-run"]')).toBeVisible()
    await expect(page.locator('[data-testid="slip-cleanup-history-tab-list"]')).toBeVisible()
    await expect(page.locator('[data-testid="slip-cleanup-history-restored-banner"]')).toBeVisible()

    await page.locator('[data-testid="slip-cleanup-history-save-button"]').click()
    await expect(page.locator('[data-testid="slip-cleanup-history-topic-input"]')).toBeVisible()
    await page.keyboard.press('Escape').catch(() => {})

    await page.locator('[data-testid="slip-cleanup-history-tab-list"]').click()
    await expect(page.locator('[data-testid="slip-cleanup-history-row-0"]')).toBeVisible()
    await page.locator('[data-testid="slip-cleanup-history-row-0"]').click()
    await expect(page.locator('[data-testid="slip-cleanup-history-restored-banner"]')).toContainText(/복원|蹂듭썝/)
    await expect(page.locator('[data-testid="slip-cleanup-history-restored-banner"]')).not.toContainText(UUID_REGEX)
  })

  test('mock route: latest 404 leaves the first-visit page usable without restore banner', async ({ page }) => {
    await openSlipCleanup(page, 'mockRole=SALES&mockLatest404=1')

    await expect(page.locator('[data-testid="slip-cleanup-history-tab-run"]')).toBeVisible()
    await expect(page.locator('[data-testid="slip-cleanup-history-restored-banner"]')).toHaveCount(0)
    await expect(page.locator('[data-testid="slip-cleanup-search"]')).toBeEnabled()
  })

  test('static parity: slip cleanup HistoryTab follows arologis HistoryTab data-grid pattern', () => {
    const slipHistoryTab = read('clients/desktop/src/renderer/components/SlipCleanupHistoryTab.tsx')
    const arologisHistoryTab = read('clients/arologis-desktop/src/renderer/routes/dispatches/HistoryTab.tsx')

    for (const pattern of ['DataGrid', 'Input', 'Select', 'getRowTestId', 'onRowClick', 'maskCreatedBy']) {
      expect(slipHistoryTab).toContain(pattern)
      expect(arologisHistoryTab).toContain(pattern)
    }
  })
})
