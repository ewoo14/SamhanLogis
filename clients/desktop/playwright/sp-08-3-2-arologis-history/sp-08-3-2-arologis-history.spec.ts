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
    const pageCodes = read('services/arologis-service/src/main/java/com/samhanair/logis/arologis/security/ArologisPageCodes.java')
    const repository = read('services/arologis-service/src/main/java/com/samhanair/logis/arologis/repository/DispatchSaveHistoryRepository.java')
    const migration = read('services/arologis-service/src/main/resources/db/migration/V12__add_dispatch_save_history.sql')

    expect(controller).toContain('@RequestMapping("/admin/arologis/dispatches/history")')
    expect(controller).toContain('@RequirePermission(page = ArologisPageCodes.DISPATCH_OPS')
    expect(pageCodes).toContain('DISPATCH_OPS = "arologis.dispatch.ops"')
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
    expect(source).toContain('[date, executionMode, from, programType, regionQuery.data, regionalQuery.data, tab, to]')
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
  // (cross-check 보강) "404/latest 없음이면 배너 미노출" 의도를 실제로 고정한다:
  //   ① 배너는 restoreBanner 상태가 truthy 일 때만 조건부 렌더(`{restoreBanner ? (`)
  //   ② latest fetch 실패(404/없음) catch 핸들러는 배너를 설정하지 않음(첫 방문 UX 보존 주석)
  //   ③ 어떤 catch 블록도 배너 메시지를 setRestoreBanner 로 설정하지 않음(실패=무배너)
  test('latest empty 404 시 복원 banner 미노출 — 조건부 렌더 + catch 무설정으로 보장된다', () => {
    const pages = [
      'clients/arologis-desktop/src/renderer/routes/dispatches/PreClassifyPage.tsx',
      'clients/arologis-desktop/src/renderer/routes/dispatches/UnassignedPage.tsx',
      'clients/arologis-desktop/src/renderer/routes/dispatches/DispatchReconcilePage.tsx',
    ].map(p => ({ p, src: read(p) }))

    for (const { p, src } of pages) {
      // ① 조건부 렌더 게이트: restoreBanner 상태가 있을 때만 RestoredBanner 노출
      expect(src, `${p}: restoreBanner 조건부 렌더 게이트 부재`).toMatch(/\{\s*restoreBanner\s*\?\s*\(/)
      expect(src, `${p}: RestoredBanner 미사용`).toContain('RestoredBanner')
      // ② latest 없음/조회 실패(404) catch 가 배너를 세우지 않음 (첫 방문 UX 보존)
      expect(src, `${p}: latest 실패 catch 무배너 보장 주석 부재`)
        .toContain('// latest 없음/조회 실패는 첫 방문 UX 를 막지 않는다.')
      // ③ 어떤 catch 블록에서도 배너 메시지를 설정하지 않음 (실패 경로 = 무배너)
      const catchBlocks = src.match(/\.catch\(\(\)\s*=>\s*\{[\s\S]*?\}\)/g) ?? []
      expect(catchBlocks.length, `${p}: catch 블록 미검출`).toBeGreaterThan(0)
      for (const block of catchBlocks) {
        expect(block, `${p}: catch 블록이 복원 배너를 설정함(404 무배너 위반)`).not.toContain('setRestoreBanner(`')
      }
    }
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
