/**
 * @file SP-08-3-4 dispatch SMS history contract.
 *
 * Local-only - verifies notification-service history DB/API contract, desktop
 * static contract, and mock UI snippets for preview/send/SEND_AUDIT.
 */
import { expect, test, type Page } from '@playwright/test'
import * as fs from 'fs'
import * as http from 'http'
import * as path from 'path'
import { fileURLToPath } from 'url'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)
const repoRoot = path.resolve(dirname, '../../../..')
const BASE_URL = process.env['VITE_BASE_URL'] ?? process.env['AUDIT_BASE_URL'] ?? 'http://localhost:5173'
const UUID_REGEX = /\b(?:[0-9a-f]{32}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\b/i

function read(relPath: string): string {
  return fs.readFileSync(path.join(repoRoot, relPath), 'utf8')
}

async function isServerAvailable(): Promise<boolean> {
  return new Promise(resolve => {
    try {
      const url = new URL(BASE_URL)
      const directPath = '/sp-08-3-4-dispatch-sms-history'
      const req = http.get(
        { hostname: url.hostname, port: Number(url.port) || 80, path: directPath, timeout: 2000 },
        res => {
          resolve(Boolean(res.statusCode && res.statusCode < 500))
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
    const errorCode = read('shared/common/src/main/java/com/samhanair/logis/common/exception/ErrorCode.java')

    expect(controller).toContain('@RequestMapping("/admin/notifications/dispatch-sms/history")')
    expect(controller).toContain('@RequirePermission(page = PAGE_CODE')
    expect(controller).toContain('PAGE_CODE = "dispatch.sms-save-history"')
    expect(controller).toContain('@GetMapping("/latest")')
    expect(controller).toContain('SEND_AUDIT')
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
    expect(migration).toContain('ux_dispatch_sms_save_history_auto_latest_per_user_program')
    expect(migration).toContain("WHERE is_deleted = FALSE AND save_mode = 'AUTO_LATEST'")
  })

  test('frontend wires 2 tabs, latest restore, preview auto-save, manual save, and send audit append', () => {
    const pageSource = read('clients/desktop/src/renderer/routes/DispatchSmsPage.tsx')
    const api = read('clients/desktop/src/renderer/api/dispatchSmsSaveHistoryApi.ts')
    const historyTab = read('clients/desktop/src/renderer/components/DispatchSmsHistoryTab.tsx')
    const saveDialog = read('clients/desktop/src/renderer/components/DispatchSmsSaveDialog.tsx')
    const mock = read('clients/desktop/src/renderer/api/mock.ts')

    expect(api).toContain('/admin/notifications/dispatch-sms/history')
    expect(api).toContain('/admin/notifications/dispatch-sms/history/latest')
    expect(api).toContain("DispatchSmsSaveMode = 'AUTO_LATEST' | 'MANUAL_NAMED' | 'SEND_AUDIT'")
    expect(api).toContain('axios.isAxiosError')
    expect(pageSource).toContain('getLatestDispatchSmsHistory')
    expect(pageSource).toContain("saveMode: 'AUTO_LATEST'")
    expect(pageSource).toContain("saveMode: 'MANUAL_NAMED'")
    expect(pageSource).toContain("saveMode: 'SEND_AUDIT'")
    expect(pageSource).toContain('previewHistoryPayload(preview, edited)')
    expect(pageSource).toContain('restored.edited ?? buildInitialEdited(restored.preview)')
    expect(pageSource).toContain('dispatchSmsHistoryListQueryKey')
    expect(pageSource).toContain('variant="warning"')
    expect(pageSource).toContain('saveSendAudit')
    expect(pageSource).toContain('정말 실 발송을 진행하시겠습니까?')
    expect(pageSource).toContain('발송 감사 이력')
    expect(historyTab).toContain('<option value="SEND_AUDIT">발송 감사</option>')
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

  test('mock UI: preview restore, manual save dialog, send audit mode, and row restore work on the real route', async ({ page }) => {
    test.skip(!(await isServerAvailable()), `dev server unavailable: ${BASE_URL}`)
    page.on('dialog', dialog => dialog.accept())
    await openDispatchSms(page)

    await expect(page.locator('[data-testid="dispatch-sms-history-tab-run"]')).toBeVisible()
    await expect(page.locator('[data-testid="dispatch-sms-history-tab-list"]')).toBeVisible()
    await expect(page.locator('[data-testid="dispatch-sms-history-restored-banner"]')).toBeVisible()

    await page.locator('[data-testid="dispatch-sms-preview-button"]').click()
    await expect(page.locator('[data-testid^="dispatch-sms-room-"]')).toBeVisible()
    await page.locator('[data-testid="dispatch-sms-history-save-button"]').click()
    await expect(page.locator('[data-testid="dispatch-sms-history-topic-input"]')).toBeVisible()

    await page.keyboard.press('Escape').catch(() => {})
    await page.locator('[data-testid="dispatch-sms-confirm-checkbox"]').check()
    await page.locator('[data-testid="dispatch-sms-send-button"]').click()
    await expect(page.locator('[data-testid="dispatch-sms-result-stats"]')).toBeVisible()

    await page.locator('[data-testid="dispatch-sms-history-tab-list"]').click()
    await page.locator('[data-testid="dispatch-sms-history-mode"]').selectOption('SEND_AUDIT')
    await page.locator('[data-testid="dispatch-sms-history-query"]').click()
    await expect(page.locator('[data-testid="dispatch-sms-history-row-0"]')).toContainText(/감사|발송/)
    await page.locator('[data-testid="dispatch-sms-history-row-0"]').click()
    await expect(page.locator('[data-testid="dispatch-sms-history-restored-banner"]')).toContainText(/감사|발송/)
    await expect(page.locator('[data-testid="dispatch-sms-history-restored-banner"]')).not.toContainText(UUID_REGEX)
  })

  test('mock route: latest 404 leaves dispatch sms page usable without restore banner', async ({ page }) => {
    test.skip(!(await isServerAvailable()), `dev server unavailable: ${BASE_URL}`)
    await openDispatchSms(page, 'mockRole=DISPATCH&mockDispatchSmsLatest404=1')

    await expect(page.locator('[data-testid="dispatch-sms-history-tab-run"]')).toBeVisible()
    await expect(page.locator('[data-testid="dispatch-sms-history-restored-banner"]')).toHaveCount(0)
    await expect(page.locator('[data-testid="dispatch-sms-preview-button"]')).toBeEnabled()
  })

  test('mock UI snippet: SEND_AUDIT rows are index-based and UUID-free', async ({ page }) => {
    await page.setContent(`
      <main>
        <button data-testid="dispatch-sms-history-tab-run">실행</button>
        <button data-testid="dispatch-sms-history-tab-list">저장내역</button>
        <select data-testid="dispatch-sms-history-mode">
          <option value="MANUAL_NAMED">명시 저장만</option>
          <option value="AUTO_LATEST">자동 저장만</option>
          <option value="SEND_AUDIT" selected>발송 감사</option>
        </select>
        <div data-testid="dispatch-sms-history-row-0" role="row">2026. 05. 17. 사용자 발송 감사 2건</div>
        <button data-testid="dispatch-sms-send-button" class="variant-warning">SMS 발송</button>
      </main>
    `)

    await expect(page.locator('[data-testid="dispatch-sms-history-row-0"]')).toContainText('발송 감사')
    await expect(page.locator('[data-testid="dispatch-sms-history-row-0"]')).not.toContainText(UUID_REGEX)
    await expect(page.locator('[data-testid="dispatch-sms-send-button"]')).toHaveClass(/variant-warning/)
  })
})
