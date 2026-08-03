/**
 * @file SP-08-3-4 dispatch SMS history contract.
 *
 * Local-only - verifies notification-service history DB/API contract, desktop
 * static contract, and mock UI snippets for preview/manual save.
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


async function openDispatchSms(page: Page, query = 'mockRole=DISPATCH'): Promise<void> {
  await page.goto(`${BASE_URL}/#/arologis/dispatch-sms?${query}`, {
    waitUntil: 'domcontentloaded',
    timeout: 20_000,
  })
  await page.waitForLoadState('networkidle', { timeout: 8_000 }).catch(() => {})
  await page.locator('[data-testid="dispatch-sms-history-tab-run"]').waitFor({ state: 'visible', timeout: 10_000 })
}

test.describe('SP-08-3-4 dispatch SMS history', () => {
  test('backend dispatch_sms_save_history DB/API contract is stable', () => {
    const service = read('services/notification-service/src/main/java/com/samhanair/logis/notification/service/DispatchSmsSaveHistoryService.java')
    const controller = read('services/notification-service/src/main/java/com/samhanair/logis/notification/controller/DispatchSmsSaveHistoryController.java')
    const repository = read('services/notification-service/src/main/java/com/samhanair/logis/notification/repository/DispatchSmsSaveHistoryRepository.java')
    const migration = read('services/notification-service/src/main/resources/db/migration/V4__add_dispatch_sms_save_history.sql')
    const retirementMigration = read('services/notification-service/src/main/resources/db/migration/V7__retire_dispatch_sms_send_audit_history.sql')
    const errorCode = read('shared/common/src/main/java/com/samhanair/logis/common/exception/ErrorCode.java')

    expect(controller).toContain('@RequestMapping("/admin/notifications/dispatch-sms/history")')
    expect(controller).toContain('@RequirePermission(page = PAGE_CODE')
    expect(controller).toContain('PAGE_CODE = "notification.dispatch-sms.display"')
    expect(controller).toContain('@GetMapping("/latest")')
    expect(repository).toContain('findByIdAndCreatedBy(UUID id, String createdBy)')
    expect(service).toContain('MAX_RESPONSE_PAYLOAD_BYTES = 100 * 1024')
    expect(service).toContain('MAX_AUTO_LATEST_RETRIES = 3')
    expect(service).toContain('DataIntegrityViolationException')
    expect(service).toContain('TransactionTemplate')
    expect(service).toContain('PROPAGATION_REQUIRES_NEW')
    expect(service).toContain('request.saveMode() == DispatchSmsSaveMode.AUTO_LATEST')
    expect(service).toContain('request.saveMode().requiresTopic()')
    expect(service).toContain('DateRange.of(from, to)')
    expect(service).toContain('DISPATCH_SMS_HISTORY_NOT_FOUND')
    expect(service).not.toContain('existsById')
    expect(errorCode).toContain('DISPATCH_SMS_HISTORY_NOT_FOUND(HttpStatus.NOT_FOUND')
    expect(errorCode).toContain('DISPATCH_SMS_HISTORY_PAYLOAD_TOO_LARGE(HttpStatus.UNPROCESSABLE_ENTITY')
    expect(migration).toContain('CREATE TABLE dispatch_sms_save_history')
    expect(migration).toContain("CHECK (save_mode IN ('AUTO_LATEST', 'MANUAL_NAMED', 'SEND_AUDIT'))")
    expect(retirementMigration).toContain("save_mode = 'SEND_AUDIT'")
    expect(migration).toContain('ux_dispatch_sms_save_history_auto_latest_per_user_program')
    expect(migration).toContain("WHERE is_deleted = FALSE AND save_mode = 'AUTO_LATEST'")
    expect(retirementMigration).toContain("WHERE save_mode = 'SEND_AUDIT'")
    expect(retirementMigration).toContain("CHECK (is_deleted OR save_mode IN ('AUTO_LATEST', 'MANUAL_NAMED'))")
  })

  test('frontend wires 2 tabs, latest restore, preview auto-save, and manual save', () => {
    const pageSource = read('clients/desktop/src/renderer/routes/DispatchSmsPage.tsx')
    const api = read('clients/desktop/src/renderer/api/dispatchSmsSaveHistoryApi.ts')
    const historyTab = read('clients/desktop/src/renderer/components/DispatchSmsHistoryTab.tsx')
    const saveDialog = read('clients/desktop/src/renderer/components/DispatchSmsSaveDialog.tsx')
    const mock = read('clients/desktop/src/renderer/api/mock.ts')

    expect(api).toContain('/admin/notifications/dispatch-sms/history')
    expect(api).toContain('/admin/notifications/dispatch-sms/history/latest')
    expect(api).toContain("DispatchSmsSaveMode = 'AUTO_LATEST' | 'MANUAL_NAMED'")
    expect(api).toContain('axios.isAxiosError')
    expect(pageSource).toContain('getLatestDispatchSmsHistory')
    expect(pageSource).toContain("saveMode: 'AUTO_LATEST'")
    expect(pageSource).toContain("saveMode: 'MANUAL_NAMED'")
    expect(pageSource).toContain('previewHistoryPayload(preview, edited)')
    expect(pageSource).toContain('restored.edited ?? buildInitialEdited(restored.preview)')
    expect(pageSource).toContain('dispatchSmsHistoryListQueryKey')
    expect(historyTab).toContain('dispatchSmsHistoryListQueryKey')
    expect(historyTab).toContain('maskCreatedBy')
    expect(historyTab).toContain('DataGrid')
    expect(historyTab).toContain('`${testIdPrefix}-row-${row.__index}`')
    expect(saveDialog).toContain('closeOnEsc={!isSaving}')
    expect(saveDialog).toContain('closeOnHeaderX={!isSaving}')
    expect(saveDialog).toContain('autoFocus')
    expect(mock).toContain('/admin/notifications/dispatch-sms/history')
    expect(mock).toContain('mockDispatchSmsLatest404')
    expect(mock).toContain('mockDispatchSmsHistoryRows.unshift(savedRow)')
  })

  test('new artifacts expose no literal UUIDs or Notion runtime calls', () => {
    const guarded = [
      'clients/desktop/src/renderer/api/dispatchSmsSaveHistoryApi.ts',
      'clients/desktop/src/renderer/components/DispatchSmsHistoryTab.tsx',
      'clients/desktop/src/renderer/components/DispatchSmsSaveDialog.tsx',
      'clients/desktop/src/renderer/components/DispatchSmsRestoredBanner.tsx',
      'clients/desktop/src/renderer/routes/DispatchSmsPage.tsx',
      'services/notification-service/src/main/java/com/samhanair/logis/notification/domain/DispatchSmsSaveHistory.java',
      'services/notification-service/src/main/java/com/samhanair/logis/notification/service/DispatchSmsSaveHistoryService.java',
      'services/notification-service/src/main/java/com/samhanair/logis/notification/controller/DispatchSmsSaveHistoryController.java',
    ].map(read).join('\n')

    expect(guarded).not.toMatch(UUID_REGEX)
    expect(guarded).not.toMatch(/api\.notion\.com|Notion-Version|@notionhq/)
  })

  test('mock UI: preview restore, manual save, and row restore work on the real route', async ({ page }) => {
    await openDispatchSms(page)

    await expect(page.locator('[data-testid="dispatch-sms-history-tab-run"]')).toBeVisible()
    await expect(page.locator('[data-testid="dispatch-sms-history-tab-list"]')).toBeVisible()
    await expect(page.locator('[data-testid="dispatch-sms-history-restored-banner"]')).toBeVisible()

    await page.locator('[data-testid="dispatch-sms-preview-button"]').click()
    await expect(page.locator('[data-testid^="dispatch-sms-room-"]')).toBeVisible()
    await page.locator('[data-testid="dispatch-sms-history-save-button"]').click()
    await expect(page.locator('[data-testid="dispatch-sms-history-topic-input"]')).toBeVisible()

    await page.locator('[data-testid="dispatch-sms-history-topic-input"]').fill('오후 배차 코멘트 점검')
    await page.getByRole('button', { name: '저장', exact: true }).click()
    await expect(page.locator('[data-testid="dispatch-sms-history-tab-list"]')).toBeVisible()

    await page.locator('[data-testid="dispatch-sms-history-tab-list"]').click()
    await page.locator('[data-testid="dispatch-sms-history-mode"]').selectOption('MANUAL_NAMED')
    await page.locator('[data-testid="dispatch-sms-history-query"]').click()
    await expect(page.locator('[data-testid="dispatch-sms-history-row-0"]')).toContainText('오후 배차 코멘트 점검')
    await page.locator('[data-testid="dispatch-sms-history-row-0"]').click()
    await expect(page.locator('[data-testid="dispatch-sms-history-restored-banner"]')).toContainText('오후 배차 코멘트 점검')
    await expect(page.locator('[data-testid="dispatch-sms-history-restored-banner"]')).not.toContainText(UUID_REGEX)
  })

  test('mock route: latest 404 leaves dispatch sms page usable without restore banner', async ({ page }) => {
    await openDispatchSms(page, 'mockRole=DISPATCH&mockDispatchSmsLatest404=1')

    await expect(page.locator('[data-testid="dispatch-sms-history-tab-run"]')).toBeVisible()
    await expect(page.locator('[data-testid="dispatch-sms-history-restored-banner"]')).toHaveCount(0)
    await expect(page.locator('[data-testid="dispatch-sms-preview-button"]')).toBeEnabled()
  })

})
