import { expect, test, type Page } from '@playwright/test'
import * as fs from 'fs'
import * as http from 'http'
import * as path from 'path'
import { fileURLToPath } from 'url'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)
const repoRoot = path.resolve(dirname, '../../../..')
const BASE_URL = process.env['VITE_BASE_URL'] ?? 'http://localhost:5173'
const UUID_REGEX = /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i

function read(relPath: string): string {
  return fs.readFileSync(path.join(repoRoot, relPath), 'utf8')
}

async function isServerAvailable(): Promise<boolean> {
  return new Promise(resolve => {
    try {
      const url = new URL(BASE_URL)
      const req = http.get(
        { hostname: url.hostname, port: Number(url.port) || 80, path: '/', timeout: 2000 },
        res => {
          resolve(true)
          res.resume()
        },
      )
      req.on('error', () => resolve(false))
      req.on('timeout', () => {
        req.destroy()
        resolve(false)
      })
    } catch {
      resolve(false)
    }
  })
}

async function openMockPage(page: Page, route: string): Promise<void> {
  await page.goto(`${BASE_URL}/#${route}?mockRole=WAREHOUSE`)
  await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {})
}

test.describe('SP-08-2 DPS 저장내역 DB/API parity', () => {
  test('backend dps-history endpoint, soft-delete, jsonb migration contract', () => {
    const controller = read('services/inventory-service/src/main/java/com/samhanair/logis/inventory/web/DpsSaveHistoryController.java')
    const service = read('services/inventory-service/src/main/java/com/samhanair/logis/inventory/service/DpsSaveHistoryService.java')
    const entity = read('services/inventory-service/src/main/java/com/samhanair/logis/inventory/domain/DpsSaveHistory.java')
    const migration = read('services/inventory-service/src/main/resources/db/migration/V11__add_dps_save_history.sql')

    expect(controller).toContain('@RequestMapping("/warehouse/audit/dps-history")')
    expect(controller).toContain('@PreAuthorize("hasAnyRole(\'WAREHOUSE\',\'MANAGER\',\'MASTER\')")')
    expect(controller).toContain('@Operation(summary = "DPS 저장내역 저장"')
    expect(controller).toContain('@GetMapping("/latest")')
    expect(service).toContain('MAX_RESPONSE_PAYLOAD_BYTES = 100 * 1024')
    expect(service).toContain('previous.supersedeBy(user)')
    expect(entity).toContain('@SQLRestriction("is_deleted = false")')
    expect(entity).toContain('extends BaseEntity')
    expect(entity).toContain('@JdbcTypeCode(SqlTypes.JSON)')
    expect(migration).toContain('CREATE TABLE dps_save_history')
    expect(migration).toContain('response_payload JSONB')
    expect(migration).toContain('ux_dps_save_history_auto_latest_per_user_program')
    expect(migration).not.toMatch(/\bDELETE\s+FROM\b/i)
  })

  test('frontend pages use two-tab history UX and UUID-free row test ids', () => {
    const comparePage = read('clients/desktop/src/renderer/routes/InventoryDpsComparePage.tsx')
    const byProductPage = read('clients/desktop/src/renderer/routes/warehouse/DpsByProductPage.tsx')
    const historyTab = read('clients/desktop/src/renderer/components/DpsHistoryTab.tsx')
    const api = read('clients/desktop/src/renderer/api/dpsSaveHistoryApi.ts')

    for (const source of [comparePage, byProductPage]) {
      expect(source).toContain("testId: 'dps-history-tab-run'")
      expect(source).toContain("testId: 'dps-history-tab-list'")
      expect(source).toContain('getLatestDpsHistory(')
      expect(source).toContain('saveDpsHistory({')
      expect(source).toContain('data-testid="dps-history-save-button"')
    }

    expect(historyTab).toContain('data-testid={`dps-history-row-${index}`}')
    expect(historyTab).toContain('data-testid={`dps-history-row-${index}-created-at`}')
    expect(historyTab).not.toMatch(/data-testid=.*id/i)
    expect(api).toContain('/warehouse/audit/dps-history/latest')
  })

  test('new DPS history components do not contain literal UUIDs', () => {
    const sources = [
      'clients/desktop/src/renderer/components/DpsHistoryTab.tsx',
      'clients/desktop/src/renderer/components/DpsRestoredBanner.tsx',
      'clients/desktop/src/renderer/components/DpsSaveDialog.tsx',
    ].map(read).join('\n')

    expect(sources).not.toMatch(UUID_REGEX)
  })

  test('mock UI: compare page restores latest, saves with required topic, and restores from row click', async ({ page }) => {
    test.skip(!(await isServerAvailable()), `dev server 미접근: ${BASE_URL}`)

    await openMockPage(page, '/warehouse/dps-compare')
    await expect(page.locator('[data-testid="dps-history-tab-run"]')).toBeVisible()
    await expect(page.locator('[data-testid="dps-history-tab-list"]')).toBeVisible()
    await expect(page.locator('[data-testid="dps-history-restored-banner"]')).toContainText('이전 결과 복원됨')

    await page.locator('[data-testid="dps-history-save-button"]').click()
    await expect(page.locator('[data-testid="dps-history-topic-input"]')).toBeVisible()
    const dialog = page.getByRole('dialog', { name: 'DPS 결과 저장' })
    const saveButton = dialog.getByRole('button', { name: '저장', exact: true })
    await expect(saveButton).toBeDisabled()
    await page.locator('[data-testid="dps-history-topic-input"]').fill('오전 마감 점검')
    await expect(saveButton).toBeEnabled()
    await page.getByRole('button', { name: '취소' }).click()

    await page.locator('[data-testid="dps-history-tab-list"]').click()
    await expect(page.locator('[data-testid="dps-history-row-0"]')).toBeVisible()
    await expect(page.locator('[data-testid="dps-history-row-0-created-at"]')).toBeVisible()
    await page.locator('[data-testid="dps-history-row-0"]').click()
    await expect(page.locator('[data-testid="dps-history-restored-banner"]')).toContainText('복원:')
  })

  test('mock UI: by-product page has same history pattern with program isolation', async ({ page }) => {
    test.skip(!(await isServerAvailable()), `dev server 미접근: ${BASE_URL}`)

    await openMockPage(page, '/warehouse/dps-compare/by-product')
    await expect(page.locator('[data-testid="dps-history-tab-run"]')).toBeVisible()
    await expect(page.locator('[data-testid="dps-history-tab-list"]')).toBeVisible()
    await expect(page.locator('[data-testid="dps-history-restored-banner"]')).toContainText('이전 결과 복원됨')
    await expect(page.locator('[data-testid="dps-by-product-grid"]')).toBeVisible()

    await page.locator('[data-testid="dps-history-tab-list"]').click()
    await expect(page.locator('[data-testid="dps-history-row-0"]')).toBeVisible()
    await expect(page.locator('[data-testid="dps-history-row-0"]')).toContainText('명시')
    await page.locator('[data-testid="dps-history-row-0"]').click()
    await expect(page.locator('[data-testid="dps-history-restored-banner"]')).toContainText('복원:')
  })
})
