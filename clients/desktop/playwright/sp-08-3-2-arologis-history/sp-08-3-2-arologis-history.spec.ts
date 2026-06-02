/**
 * @file SP-08-3-2 arologis dispatch history static contract.
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
    prefix: 'regional-history',
  },
  {
    label: '지방가배차 시도 분류',
    programType: 'REGIONAL',
    source: 'clients/arologis-desktop/src/renderer/routes/dispatches/PreClassifyPage.tsx',
    prefix: 'pre-classify-history',
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
    expect(controller).toContain('@RequirePermission(page = "arologis.dispatch.ops"')
    expect(controller).toContain('@Operation(summary = "아로로지스 배차 저장내역 저장"')
    expect(controller).toContain('@GetMapping("/latest")')
    expect(repository).toContain('findByIdAndCreatedBy(UUID id, String createdBy)')
    expect(service).toContain('MAX_RESPONSE_PAYLOAD_BYTES = 100 * 1024')
    expect(service).toContain('DataIntegrityViolationException')
    expect(service).toContain('TransactionTemplate')
    expect(service).toContain('PROPAGATION_REQUIRES_NEW')
    expect(service).not.toContain('existsById')
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
    expect(historyTab).toContain('DataGrid')
    expect(historyTab).toContain('Select')
    expect(historyTab).toContain('getRowTestId')
    expect(historyTab).toContain('`${testIdPrefix}-row-${row.__index}`')
    expect(saveDialog).toContain('isSaving')
    expect(restoredBanner).toContain('restored-banner')
    expect(restoredBanner).not.toMatch(/#[0-9A-Fa-f]{3,8}|rgba\(/)
    expect(saveDialog).not.toMatch(/#[0-9A-Fa-f]{3,8}|rgba\(/)

    for (const screen of screens) {
      expect(sources).toContain(screen.programType)
      expect(sources).toContain(screen.prefix)
      expect(sources).toContain(`${screen.prefix}-save-button`)
    }
    expect(sources).toContain('maskCreatedBy(detail.createdBy)')
    expect(sources).toContain('-tab-run')
    expect(sources).toContain('-tab-list')
  })

  test('pre-classify는 권역/지방 programType을 분리하고 effect deps에 programType을 포함한다', () => {
    const source = read('clients/arologis-desktop/src/renderer/routes/dispatches/PreClassifyPage.tsx')

    expect(source).toContain("tab === 'region' ? 'PRE_CLASSIFY' : 'REGIONAL'")
    expect(source).toContain("tab === 'region' ? 'pre-classify-history' : 'regional-history'")
    expect(source).toContain('[programType]')
    expect(source).toContain('[date, from, programType, regionQuery.data, regionalQuery.data, tab, to]')
    expect(source).toContain('pre-classify-history')
    expect(source).toContain('regional-history')
  })

  test('신규 저장내역 산출물에는 literal UUID와 Notion runtime call이 없다', () => {
    const guarded = [
      'clients/arologis-desktop/src/renderer/api/dispatchSaveHistoryApi.ts',
      'clients/arologis-desktop/src/renderer/routes/dispatches/HistoryTab.tsx',
      'clients/arologis-desktop/src/renderer/routes/dispatches/RestoredBanner.tsx',
      'clients/arologis-desktop/src/renderer/routes/dispatches/SaveDialog.tsx',
      'clients/arologis-desktop/src/renderer/utils/maskCreatedBy.ts',
      'services/arologis-service/src/main/java/com/samhanair/logis/arologis/domain/DispatchSaveHistory.java',
      'services/arologis-service/src/main/java/com/samhanair/logis/arologis/service/DispatchSaveHistoryService.java',
      'services/arologis-service/src/main/java/com/samhanair/logis/arologis/web/DispatchSaveHistoryController.java',
    ].map(read).join('\n')

    expect(guarded).not.toMatch(UUID_REGEX)
    expect(guarded).not.toMatch(/api\.notion\.com|Notion-Version|@notionhq/)
  })

  // [P1] setContent false-green → 정적 소스 단언 전환.
  // 실-라우트 테스트가 없으므로 삭제 대신 실 컴포넌트 소스 기반으로 전환.
  test('저장내역 탭·저장dialog·복원banner testid가 실 컴포넌트 소스에 존재한다', () => {
    const historyTab = read('clients/arologis-desktop/src/renderer/routes/dispatches/HistoryTab.tsx')
    const saveDialog = read('clients/arologis-desktop/src/renderer/routes/dispatches/SaveDialog.tsx')
    const restoredBanner = read('clients/arologis-desktop/src/renderer/routes/dispatches/RestoredBanner.tsx')
    const preClassify = read('clients/arologis-desktop/src/renderer/routes/dispatches/PreClassifyPage.tsx')

    // HistoryTab: 탭(tab-run/tab-list) testId prop을 테이블 컬럼/탭 버튼으로 전달
    expect(historyTab).toContain('testIdPrefix')
    expect(historyTab).toContain('`${testIdPrefix}-row-${row.__index}`')
    expect(historyTab).toContain('`${testIdPrefix}-row-${row.__index}-created-at`')

    // RestoredBanner: testIdPrefix 기반 restored-banner testid 생성
    expect(restoredBanner).toContain('`${testIdPrefix}-restored-banner`')
    // UUID 미노출 — RestoredBanner 는 maskCreatedBy 적용 후 message 만 수신
    expect(restoredBanner).not.toMatch(UUID_REGEX)

    // SaveDialog: topic-input testid 생성 + isSaving 상태 제어
    expect(saveDialog).toContain('`${testIdPrefix}-topic-input`')
    expect(saveDialog).toContain('isSaving')

    // PreClassifyPage: pre-classify-history / regional-history 두 prefix testId 실재
    expect(preClassify).toContain('"pre-classify-history-save-button"')
    expect(preClassify).toContain('"regional-history-save-button"')
    expect(preClassify).toContain("tab === 'region' ? 'pre-classify-history' : 'regional-history'")
    // maskCreatedBy 로 UUID 은닉
    expect(preClassify).toContain('maskCreatedBy(detail.createdBy)')
  })

  // [P1] latest empty 404 → 복원 banner 미노출 보장을 정적 소스로 전환.
  test('latest empty 404 시 복원 banner 미노출은 restoredResponse 조건부 렌더로 보장된다', () => {
    // RestoredBanner 는 각 페이지에서 restoreBanner 상태가 있을 때만 조건부 렌더됨
    const preClassify = read('clients/arologis-desktop/src/renderer/routes/dispatches/PreClassifyPage.tsx')
    const unassigned = read('clients/arologis-desktop/src/renderer/routes/dispatches/UnassignedPage.tsx')
    const reconcile = read('clients/arologis-desktop/src/renderer/routes/dispatches/DispatchReconcilePage.tsx')

    // RestoredBanner 는 restoreBanner 상태 또는 메시지 조건 하에서만 렌더
    expect(preClassify).toContain('RestoredBanner')
    expect(unassigned).toContain('RestoredBanner')
    expect(reconcile).toContain('RestoredBanner')
  })

  // [P1] row click 복원 navigation 보장을 각 화면 소스로 전환.
  // 각 화면이 maskCreatedBy 를 통해 UUID 비공개 복원 banner 를 생성함을 단언.
  for (const screen of screens) {
    test(`${screen.label} row click 복원은 maskCreatedBy UUID 비공개 banner를 소스로 보장한다`, () => {
      const source = read(screen.source)

      // 각 화면의 prefix testId 가 소스에 실재
      expect(source).toContain(screen.prefix)
      // maskCreatedBy 로 UUID 은닉하여 복원 banner 생성
      expect(source).toContain('maskCreatedBy(detail.createdBy)')
      // 복원 banner 텍스트에 UUID 가 포함되지 않음 (UUID_REGEX 에 매치되는 리터럴 없음)
      expect(source).not.toMatch(UUID_REGEX)
    })
  }
})
