/**
 * SP-08-3-2 dispatch contract.
 *
 * S4 moved the provisional eight-mode classifier out of the Arologis client.
 * The Arologis route is now a read-only received-group surface; history/restore
 * contracts remain covered by the still-owned legacy dispatch pages.
 */
import { expect, test } from '@playwright/test'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'

const dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(dirname, '../../../..')
const UUID_REGEX = /\b(?:[0-9a-f]{32}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\b/i

function read(relativePath: string): string {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8')
}

test.describe('SP-08-3-2 Arologis dispatch surface contract', () => {
  test('legacy history pages retain the shared history and restore contracts', () => {
    const api = read('clients/arologis-desktop/src/renderer/api/dispatchSaveHistoryApi.ts')
    const historyTab = read('clients/arologis-desktop/src/renderer/routes/dispatches/HistoryTab.tsx')
    const saveDialog = read('clients/arologis-desktop/src/renderer/routes/dispatches/SaveDialog.tsx')
    const restoredBanner = read('clients/arologis-desktop/src/renderer/routes/dispatches/RestoredBanner.tsx')
    const unassigned = read('clients/arologis-desktop/src/renderer/routes/dispatches/UnassignedPage.tsx')
    const reconcile = read('clients/arologis-desktop/src/renderer/routes/dispatches/DispatchReconcilePage.tsx')

    expect(api).toContain('/admin/arologis/dispatches/history')
    expect(api).toContain('/admin/arologis/dispatches/history/latest')
    expect(historyTab).toContain('maskCreatedBy')
    expect(historyTab).toContain('getRowTestId')
    expect(saveDialog).toContain('isSaving')
    expect(restoredBanner).toContain('restored-banner')
    expect(unassigned).toContain('unassigned-history')
    expect(reconcile).toContain('dispatch-reconcile-history')
  })

  test('S4 pre-classify is now a read-only received-group view', () => {
    const route = read('clients/arologis-desktop/src/renderer/routes/dispatches/PreClassifyPage.tsx')
    const page = read('clients/arologis-desktop/src/renderer/routes/dispatches/ReceivedGroupsPage.tsx')
    const api = read('clients/arologis-desktop/src/renderer/api/receivedDispatchGroups.ts')

    expect(route).toContain('ReceivedGroupsPage as ArologisPreClassifyPage')
    expect(page).toContain('arologis-received-groups-page')
    expect(page).toContain('DataTable')
    expect(page).toContain('수신 배차 그룹')
    expect(page).toContain('수정하거나 재분류할 수 없습니다')
    expect(api).toContain("'/admin/arologis/dispatch-groups'")
    expect(api).toContain('dispatchDate')
    expect(page).not.toContain('HistoryTab')
    expect(page).not.toContain('restoreBanner')
  })

  test('received-group output does not expose UUID literals or Notion runtime calls', () => {
    const guarded = [
      'clients/arologis-desktop/src/renderer/routes/dispatches/PreClassifyPage.tsx',
      'clients/arologis-desktop/src/renderer/routes/dispatches/ReceivedGroupsPage.tsx',
      'clients/arologis-desktop/src/renderer/api/receivedDispatchGroups.ts',
    ].map(read).join('\n')

    expect(guarded).not.toMatch(UUID_REGEX)
    expect(guarded).not.toMatch(/api\.notion\.com|Notion-Version|@notionhq/)
  })

  test('received-group contract keeps the date query and disallows mutation surfaces', () => {
    const page = read('clients/arologis-desktop/src/renderer/routes/dispatches/ReceivedGroupsPage.tsx')
    const api = read('clients/arologis-desktop/src/renderer/api/receivedDispatchGroups.ts')

    expect(page).toContain("queryKey: ['received-dispatch-groups', date]")
    expect(api).toContain("params: { dispatchDate }")
    expect(page).not.toContain('Button')
    expect(page).not.toContain('useMutation')
    expect(page).not.toContain('onClick')
  })
})
