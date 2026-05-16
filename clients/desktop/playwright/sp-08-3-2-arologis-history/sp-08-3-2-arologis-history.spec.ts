/**
 * @file SP-08-3-2 arologis dispatch history static contract.
 *
 * Local-only execution: backend/frontend source contract + mock UI only.
 */
import { expect, test } from '@playwright/test'
import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)
const repoRoot = path.resolve(dirname, '../../../..')
const UUID_REGEX = /\b(?:[0-9a-f]{32}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\b/i

type ScreenContract = {
  label: string
  programType: string
  source: string
  prefix: string
}

const screens: ScreenContract[] = [
  {
    label: '가배차 권역 분류',
    programType: 'PRE_CLASSIFY',
    source: 'clients/arologis-desktop/src/renderer/routes/dispatches/PreClassifyPage.tsx',
    prefix: 'pre-classify-history',
  },
  {
    label: '지방가배차 시도 분류',
    programType: 'REGIONAL',
    source: 'clients/arologis-desktop/src/renderer/routes/dispatches/PreClassifyPage.tsx',
    prefix: 'regional-history',
  },
  {
    label: '미배차 리스트',
    programType: 'UNASSIGNED',
    source: 'clients/arologis-desktop/src/renderer/routes/dispatches/UnassignedPage.tsx',
    prefix: 'unassigned-history',
  },
  {
    label: '운송사 실배차 비교',
    programType: 'RECONCILE',
    source: 'clients/arologis-desktop/src/renderer/routes/dispatches/DispatchReconcilePage.tsx',
    prefix: 'dispatch-reconcile-history',
  },
]

function read(relPath: string): string {
  return fs.readFileSync(path.join(repoRoot, relPath), 'utf8')
}

test.describe('SP-08-3-2 아로로지스 배차 저장내역', () => {
  test('backend 저장내역 DB/API 계약을 고정한다', () => {
    const service = read('services/arologis-service/src/main/java/com/samhanair/logis/arologis/service/DispatchSaveHistoryService.java')
    const controller = read('services/arologis-service/src/main/java/com/samhanair/logis/arologis/web/DispatchSaveHistoryController.java')
    const repository = read('services/arologis-service/src/main/java/com/samhanair/logis/arologis/repository/DispatchSaveHistoryRepository.java')
    const migration = read('services/arologis-service/src/main/resources/db/migration/V12__add_dispatch_save_history.sql')

    expect(controller).toContain('@RequestMapping("/admin/arologis/dispatches/history")')
    expect(controller).toContain("hasAnyRole('MASTER','MANAGER','DISPATCH','AROLOGIS_MASTER','AROLOGIS_MANAGER')")
    expect(controller).toContain('@Operation(summary = "아로로지스 배차 저장내역 저장"')
    expect(controller).toContain('@GetMapping("/latest")')
    expect(repository).toContain('findByIdAndCreatedBy(UUID id, String createdBy)')
    expect(service).toContain('MAX_RESPONSE_PAYLOAD_BYTES = 100 * 1024')
    expect(service).toContain('DataIntegrityViolationException')
    expect(service).toContain('DateRange.of(from, to)')
    expect(migration).toContain('CREATE TABLE dispatch_save_history')
    expect(migration).toContain('ux_dispatch_save_history_auto_latest_per_user_program')
  })

  test('frontend 4개 프로그램이 공통 HistoryTab과 저장 API를 사용한다', () => {
    const api = read('clients/arologis-desktop/src/renderer/api/dispatchSaveHistoryApi.ts')
    const historyTab = read('clients/arologis-desktop/src/renderer/routes/dispatches/HistoryTab.tsx')
    const saveDialog = read('clients/arologis-desktop/src/renderer/routes/dispatches/SaveDialog.tsx')
    const restoredBanner = read('clients/arologis-desktop/src/renderer/routes/dispatches/RestoredBanner.tsx')
    const sources = screens.map((screen) => read(screen.source)).join('\n')

    expect(api).toContain('/admin/arologis/dispatches/history')
    expect(api).toContain('/admin/arologis/dispatches/history/latest')
    expect(historyTab).toContain('maskCreatedBy')
    expect(historyTab).toContain('data-testid={`${testIdPrefix}-row-${index}`}')
    expect(saveDialog).toContain('isSaving')
    expect(restoredBanner).toContain('restored-banner')

    for (const screen of screens) {
      expect(sources).toContain(screen.programType)
      expect(sources).toContain(screen.prefix)
      expect(sources).toContain(`${screen.prefix}-save-button`)
    }
    expect(sources).toContain('-tab-run')
    expect(sources).toContain('-tab-list')
  })

  test('pre-classify는 권역/지방 programType을 분리하고 effect deps에 programType을 포함한다', () => {
    const source = read('clients/arologis-desktop/src/renderer/routes/dispatches/PreClassifyPage.tsx')

    expect(source).toContain("tab === 'region' ? 'PRE_CLASSIFY' : 'REGIONAL'")
    expect(source).toContain('[programType]')
    expect(source).toContain('[date, from, programType, regionQuery.data, regionalQuery.data, tab, to]')
    expect(source).toContain('regional-history')
    expect(source).toContain('pre-classify-history')
  })

  test('신규 저장내역 산출물에는 literal UUID와 Notion runtime call이 없다', () => {
    const guarded = [
      'clients/arologis-desktop/src/renderer/api/dispatchSaveHistoryApi.ts',
      'clients/arologis-desktop/src/renderer/routes/dispatches/HistoryTab.tsx',
      'clients/arologis-desktop/src/renderer/routes/dispatches/RestoredBanner.tsx',
      'clients/arologis-desktop/src/renderer/routes/dispatches/SaveDialog.tsx',
      'services/arologis-service/src/main/java/com/samhanair/logis/arologis/domain/DispatchSaveHistory.java',
      'services/arologis-service/src/main/java/com/samhanair/logis/arologis/service/DispatchSaveHistoryService.java',
      'services/arologis-service/src/main/java/com/samhanair/logis/arologis/web/DispatchSaveHistoryController.java',
    ].map(read).join('\n')

    expect(guarded).not.toMatch(UUID_REGEX)
    expect(guarded).not.toMatch(/api\.notion\.com|Notion-Version|@notionhq/)
  })

  test('mock UI: 저장내역 탭, 저장 dialog, 복원 banner testid를 노출한다', async ({ page }) => {
    await page.setContent(`
      <main>
        <button data-testid="pre-classify-history-tab-run">실행</button>
        <button data-testid="pre-classify-history-tab-list">저장내역</button>
        <div data-testid="pre-classify-history-restored-banner">이전 결과 복원됨 · 2026. 05. 17.</div>
        <button data-testid="pre-classify-history-save-button">내역으로 저장</button>
        <div role="dialog" aria-label="배차 결과 저장">
          <input data-testid="pre-classify-history-topic-input" value="오전 마감 점검" />
          <button>저장</button>
        </div>
        <table>
          <tbody>
            <tr data-testid="pre-classify-history-row-0">
              <td data-testid="pre-classify-history-row-0-created-at">2026. 05. 17. 오전 10:00</td>
              <td>사용자</td>
              <td>명시</td>
            </tr>
          </tbody>
        </table>
      </main>
    `)

    await expect(page.locator('[data-testid="pre-classify-history-tab-run"]')).toBeVisible()
    await expect(page.locator('[data-testid="pre-classify-history-tab-list"]')).toBeVisible()
    await expect(page.locator('[data-testid="pre-classify-history-restored-banner"]')).toContainText('이전 결과 복원됨')
    await expect(page.getByRole('dialog', { name: '배차 결과 저장' })).toBeVisible()
    await expect(page.locator('[data-testid="pre-classify-history-topic-input"]')).toBeVisible()
    await expect(page.locator('[data-testid="pre-classify-history-row-0"]')).toContainText('명시')
  })
})
