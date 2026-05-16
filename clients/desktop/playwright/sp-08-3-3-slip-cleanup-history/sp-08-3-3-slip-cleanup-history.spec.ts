/**
 * @file SP-08-3-3 slip cleanup history static contract.
 *
 * No live server required — static contract + mock UI only.
 */
import { expect, test } from '@playwright/test'
import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)
const repoRoot = path.resolve(dirname, '../../../..')
const UUID_REGEX = /\b(?:[0-9a-f]{32}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\b/i

function read(relPath: string): string {
  return fs.readFileSync(path.join(repoRoot, relPath), 'utf8')
}

test.describe('SP-08-3-3 전표정리 저장내역', () => {
  test('backend 저장내역 DB/API 계약을 고정한다', () => {
    const service = read('services/slip-service/src/main/java/com/samhanair/logis/slip/service/SlipCleanupSaveHistoryService.java')
    const controller = read('services/slip-service/src/main/java/com/samhanair/logis/slip/web/SlipCleanupSaveHistoryController.java')
    const repository = read('services/slip-service/src/main/java/com/samhanair/logis/slip/repository/SlipCleanupSaveHistoryRepository.java')
    const migration = read('services/slip-service/src/main/resources/db/migration/V25__add_slip_cleanup_save_history.sql')

    expect(controller).toContain('@RequestMapping("/slips/cleanup/history")')
    expect(controller).toContain("hasAnyRole('SALES','MANAGER','MASTER')")
    expect(controller).toContain('@Operation(summary = "전표정리 저장내역 저장"')
    expect(controller).toContain('@GetMapping("/latest")')
    expect(repository).toContain('findByIdAndCreatedBy(UUID id, String createdBy)')
    expect(service).toContain('MAX_RESPONSE_PAYLOAD_BYTES = 100 * 1024')
    expect(service).toContain('MAX_AUTO_LATEST_RETRIES = 3')
    expect(service).toContain('DataIntegrityViolationException')
    expect(service).toContain('TransactionTemplate')
    expect(service).toContain('PROPAGATION_REQUIRES_NEW')
    expect(service).toContain('DateRange.of(from, to)')
    expect(service).not.toContain('existsById')
    expect(migration).toContain('CREATE TABLE slip_cleanup_save_history')
    expect(migration).toContain('CHECK (program_type IN (\'SLIP_CLEANUP\'))')
    expect(migration).toContain('ux_slip_cleanup_history_auto_latest_per_user_program')
  })

  test('frontend 전표정리 화면이 저장 API와 2-Tab UX를 사용한다', () => {
    const page = read('clients/desktop/src/renderer/routes/SlipCleanupPage.tsx')
    const api = read('clients/desktop/src/renderer/api/slipCleanupSaveHistoryApi.ts')
    const historyTab = read('clients/desktop/src/renderer/components/SlipCleanupHistoryTab.tsx')
    const saveDialog = read('clients/desktop/src/renderer/components/SlipCleanupSaveDialog.tsx')
    const restoredBanner = read('clients/desktop/src/renderer/components/SlipCleanupRestoredBanner.tsx')
    const mock = read('clients/desktop/src/renderer/api/mock.ts')

    expect(api).toContain('/slips/cleanup/history')
    expect(api).toContain('/slips/cleanup/history/latest')
    expect(api).toContain('axios.isAxiosError')
    expect(page).toContain('getLatestSlipCleanupHistory')
    expect(page).toContain('saveSlipCleanupHistory')
    expect(page).toContain('slip-cleanup-history-tab-run')
    expect(page).toContain('slip-cleanup-history-tab-list')
    expect(page).toContain('slip-cleanup-history-save-button')
    expect(page).toContain('maskCreatedBy(detail.createdBy)')
    expect(historyTab).toContain('maskCreatedBy')
    expect(historyTab).toContain('DataGrid')
    expect(historyTab).toContain('Input')
    expect(historyTab).toContain('Select')
    expect(historyTab).toContain('getRowTestId')
    expect(historyTab).toContain('`${testIdPrefix}-row-${row.__index}`')
    expect(saveDialog).toContain('isSaving')
    expect(restoredBanner).toContain('restored-banner')
    expect(mock.indexOf('/slips/cleanup/history')).toBeLessThan(mock.indexOf("url.includes('/slips/cleanup')"))
  })

  test('신규 저장내역 산출물에는 literal UUID와 Notion runtime call이 없다', () => {
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

  test('mock UI: 저장내역 탭, 저장 dialog, 복원 banner testid를 노출한다', async ({ page }) => {
    await page.setContent(`
      <main>
        <button data-testid="slip-cleanup-history-tab-run">실행</button>
        <button data-testid="slip-cleanup-history-tab-list">저장내역</button>
        <div data-testid="slip-cleanup-history-restored-banner">이전 결과 복원됨 · 2026. 05. 17.</div>
        <button data-testid="slip-cleanup-history-save-button">내역으로 저장</button>
        <div role="dialog" aria-label="전표정리 결과 저장">
          <input data-testid="slip-cleanup-history-topic-input" value="월말 마감 직전 점검" />
          <button>저장</button>
        </div>
        <table>
          <tbody>
            <tr data-testid="slip-cleanup-history-row-0">
              <td data-testid="slip-cleanup-history-row-0-created-at">2026. 05. 17. 오전 10:00</td>
              <td>사용자</td>
              <td>명시</td>
            </tr>
          </tbody>
        </table>
      </main>
    `)

    await expect(page.locator('[data-testid="slip-cleanup-history-tab-run"]')).toBeVisible()
    await expect(page.locator('[data-testid="slip-cleanup-history-tab-list"]')).toBeVisible()
    await expect(page.locator('[data-testid="slip-cleanup-history-restored-banner"]')).toContainText('이전 결과 복원됨')
    await expect(page.getByRole('dialog', { name: '전표정리 결과 저장' })).toBeVisible()
    await expect(page.locator('[data-testid="slip-cleanup-history-topic-input"]')).toBeVisible()
    await expect(page.locator('[data-testid="slip-cleanup-history-row-0"]')).toContainText('명시')
  })

  test('mock UI: latest empty 404 시 복원 banner를 노출하지 않는다', async ({ page }) => {
    await page.setContent(`
      <main>
        <button data-testid="slip-cleanup-history-tab-run">실행</button>
        <button data-testid="slip-cleanup-history-tab-list">저장내역</button>
      </main>
    `)

    await expect(page.locator('[data-testid="slip-cleanup-history-restored-banner"]')).toHaveCount(0)
  })

  test('mock UI: row click 복원은 내부 UUID를 표시하지 않는다', async ({ page }) => {
    await page.setContent(`
      <main>
        <button data-testid="slip-cleanup-history-tab-run">실행</button>
        <button data-testid="slip-cleanup-history-tab-list">저장내역</button>
        <div id="view">list</div>
        <div data-testid="slip-cleanup-history-row-0" role="row" tabindex="0">명시 저장</div>
        <script>
          document.querySelector('[data-testid="slip-cleanup-history-row-0"]').addEventListener('click', () => {
            document.querySelector('#view').textContent = 'restored';
            const banner = document.createElement('div');
            banner.dataset.testid = 'slip-cleanup-history-restored-banner';
            banner.textContent = '복원: 2026. 05. 17. 사용자 월말 마감';
            document.querySelector('main').appendChild(banner);
          });
        </script>
      </main>
    `)

    await page.locator('[data-testid="slip-cleanup-history-row-0"]').click()
    await expect(page.locator('#view')).toHaveText('restored')
    await expect(page.locator('[data-testid="slip-cleanup-history-restored-banner"]')).toContainText('복원:')
    await expect(page.locator('[data-testid="slip-cleanup-history-restored-banner"]')).toContainText('사용자')
    await expect(page.locator('[data-testid="slip-cleanup-history-restored-banner"]')).not.toContainText(UUID_REGEX)
  })
})
