/**
 * @file SP-08-3-1 dispatch parity static contract.
 *
 * Local-only execution: CI `qa-e2e.yml` runs `qa/playwright` and does not run
 * `clients/desktop/playwright`; this spec is a dev-time defensive contract.
 */
import { expect, test } from '@playwright/test'
import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)
const repoRoot = path.resolve(dirname, '../../../..')
const SPEC_PATH = 'docs/planning/2026-05-16_sp-08-3-dispatch-legacy-gas-parity.md'
// hex 32+dashes 패턴. UUID v1~v8 + base64 미만 form 모두 커버 (v4/v6/v7 등 variant 무관).
const UUID_REGEX = /\b(?:[0-9a-f]{32}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\b/i

type MatrixRow = {
  legacyLabel: string
  desktopRoute: string
  currentRoute: string
  owner: 'arologis' | 'slip' | 'notification'
  sourceEndpoint: string
  historyEndpoint: string
  programType: string
  testidPrefix: string
}

const matrix: MatrixRow[] = [
  {
    legacyLabel: '가배차분류리스트',
    desktopRoute: '/dispatches/pre-classify',
    currentRoute: '/arologis/pre-classify',
    owner: 'arologis',
    sourceEndpoint: 'GET /admin/arologis/dispatches/pre-classify',
    historyEndpoint: 'POST/GET /admin/arologis/dispatches/history',
    programType: 'PRE_CLASSIFY',
    testidPrefix: 'pre-classify-history',
  },
  {
    legacyLabel: '지방가배차분류리스트',
    desktopRoute: '/dispatches/pre-classify',
    currentRoute: '/arologis/pre-classify',
    owner: 'arologis',
    sourceEndpoint: 'GET /admin/arologis/dispatches/regional',
    historyEndpoint: 'POST/GET /admin/arologis/dispatches/history',
    programType: 'REGIONAL',
    testidPrefix: 'pre-classify-history',
  },
  {
    legacyLabel: '미배차리스트',
    desktopRoute: '/dispatches/unassigned',
    currentRoute: '/arologis/unassigned',
    owner: 'arologis',
    sourceEndpoint: 'GET /admin/arologis/dispatches/unassigned',
    historyEndpoint: 'POST/GET /admin/arologis/dispatches/history',
    programType: 'UNASSIGNED',
    testidPrefix: 'unassigned-history',
  },
  {
    legacyLabel: '운송사-실배차내역 비교',
    desktopRoute: '/dispatches/reconcile',
    currentRoute: '/arologis/dispatch-reconcile',
    owner: 'arologis',
    sourceEndpoint: 'POST /admin/arologis/dispatch/reconcile',
    historyEndpoint: 'POST/GET /admin/arologis/dispatches/history',
    programType: 'RECONCILE',
    testidPrefix: 'dispatch-reconcile-history',
  },
  {
    legacyLabel: '전표정리리스트',
    desktopRoute: '/sales/slip-cleanup',
    currentRoute: '/sales/slip-cleanup',
    owner: 'slip',
    sourceEndpoint: 'GET /slips/cleanup',
    historyEndpoint: 'POST/GET /slips/cleanup/history',
    programType: 'SLIP_CLEANUP',
    testidPrefix: 'slip-cleanup-history',
  },
  {
    legacyLabel: '배차안내문자',
    desktopRoute: '/dispatch/sms',
    currentRoute: '/arologis/dispatch-sms',
    owner: 'notification',
    sourceEndpoint: 'POST /admin/notifications/dispatch-batch/preview',
    historyEndpoint: 'POST/GET /admin/notifications/dispatch-sms/history',
    programType: 'DISPATCH_SMS',
    testidPrefix: 'dispatch-sms-history',
  },
]

function read(relPath: string): string {
  return fs.readFileSync(path.join(repoRoot, relPath), 'utf8')
}

function listFiles(dir: string, predicate: (file: string) => boolean): string[] {
  const absolute = path.join(repoRoot, dir)
  if (!fs.existsSync(absolute)) return []

  return fs.readdirSync(absolute, { withFileTypes: true }).flatMap(entry => {
    const child = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (['node_modules', 'build', 'dist', '.gradle'].includes(entry.name)) return []
      return listFiles(child, predicate)
    }
    return predicate(child) ? [child] : []
  })
}

function scanFiles(files: string[], patterns: RegExp[]): string[] {
  return files.flatMap(file => {
    const content = read(file)
    return patterns.flatMap(pattern => (pattern.test(content) ? [`${file}: ${pattern.source}`] : []))
  })
}

function endpointPathRegex(endpointPath: string): RegExp {
  const escaped = endpointPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(^|[^A-Za-z0-9/_-])${escaped}([^A-Za-z0-9/_-]|$)`)
}

test.describe('SP-08-3-1 배차 legacy GAS DB/API parity 기반 잠금', () => {
  test('기획서가 6개 배차 화면 endpoint/history/programType 매트릭스를 고정한다', () => {
    const spec = read(SPEC_PATH)

    expect(spec).toContain('SP-08-3-1 (본 PR) — 기획 + scope 잠금')
    expect(spec).toContain('BaseEntity 7 audit')
    expect(spec).toContain('Soft Delete only')
    expect(spec).toContain('한국어 Javadoc + `@Operation`')
    expect(spec).toContain('arologis 외부 client 전체 `@MockBean`')
    expect(spec).toContain('PR 제목')
    expect(spec).toContain('[FEAT] SP-08-3-1 배차 GAS parity 기반 잠금')

    for (const row of matrix) {
      expect(spec).toContain(row.legacyLabel)
      expect(spec).toContain(row.desktopRoute)
      expect(spec).toContain(row.currentRoute)
      expect(spec).toContain(row.sourceEndpoint)
      expect(spec).toContain(row.historyEndpoint)
      expect(spec).toContain(row.programType)
      expect(spec).toContain(`${row.testidPrefix}-row-0`)
    }

    expect(matrix).toHaveLength(6)
    expect(new Set(matrix.map(row => row.programType)).size).toBe(6)
    expect(matrix.filter(row => row.owner === 'arologis')).toHaveLength(4)
    expect(matrix.filter(row => row.owner === 'slip')).toHaveLength(1)
    expect(matrix.filter(row => row.owner === 'notification')).toHaveLength(1)
  })

  test('현재 API/route 소스가 6개 기존 endpoint를 유지하고 SP-08-3-2 arologis history endpoint를 허용한다', () => {
    const sources = [
      'clients/desktop/src/renderer/api/arologisDispatchApi.ts',
      'clients/desktop/src/renderer/api/dispatchReconcileApi.ts',
      'clients/desktop/src/renderer/api/slipCleanupApi.ts',
      'clients/desktop/src/renderer/api/slipCleanupSaveHistoryApi.ts',
      'clients/desktop/src/renderer/api/dispatchSmsApi.ts',
      'clients/desktop/src/renderer/api/dispatchSmsSaveHistoryApi.ts',
      'clients/desktop/src/renderer/api/mock.ts',
      'clients/desktop/src/renderer/routes/index.tsx',
      'clients/arologis-desktop/src/renderer/api/arologisDispatch.ts',
      'clients/arologis-desktop/src/renderer/api/arologisManual.ts',
      'clients/arologis-desktop/src/renderer/api/dispatchReconcile.ts',
      'clients/arologis-desktop/src/renderer/api/dispatchSaveHistoryApi.ts',
      'clients/arologis-desktop/src/renderer/routes/index.tsx',
      'clients/arologis-desktop/src/renderer/routes/dispatches/DispatchesLayout.tsx',
      'clients/arologis-desktop/src/renderer/routes/dispatches/PreClassifyPage.tsx',
      'clients/arologis-desktop/src/renderer/routes/dispatches/UnassignedPage.tsx',
      'clients/arologis-desktop/src/renderer/routes/dispatches/DispatchReconcilePage.tsx',
      'services/arologis-service/src/main/java/com/samhanair/logis/arologis/web/DispatchSaveHistoryController.java',
      'services/arologis-service/src/main/java/com/samhanair/logis/arologis/controller/ArologisAdminController.java',
      'services/arologis-service/src/main/java/com/samhanair/logis/arologis/controller/DispatchReconcileController.java',
      'services/slip-service/src/main/java/com/samhanair/logis/slip/web/SlipController.java',
      'services/slip-service/src/main/java/com/samhanair/logis/slip/web/SlipCleanupSaveHistoryController.java',
      'services/notification-service/src/main/java/com/samhanair/logis/notification/controller/DispatchBatchAdminController.java',
      'services/notification-service/src/main/java/com/samhanair/logis/notification/controller/DispatchSmsSaveHistoryController.java',
    ].map(read).join('\n')

    for (const row of matrix) {
      const [, endpointPath] = row.sourceEndpoint.split(' ')
      expect(sources).toContain(row.currentRoute)
      if (!endpointPath.includes('{preview,send}')) {
        expect(sources).toMatch(endpointPathRegex(endpointPath))
      }
    }

    expect(sources).toContain('/admin/notifications/dispatch-batch/preview')
    expect(sources).not.toContain('/arologis/dispatch-sms/preview')
    expect(sources).not.toMatch(/\/arologis\/dispatch-sms\/send(?![-\w])/)
    expect(sources).toContain('/admin/arologis/dispatches/history')
    expect(sources).toContain('/admin/arologis/dispatches/history/latest')
    expect(sources).toContain('/slips/cleanup/history')
    expect(sources).toContain('/slips/cleanup/history/latest')
    expect(sources).toContain('/admin/notifications/dispatch-sms/history')
    expect(sources).toContain('/admin/notifications/dispatch-sms/history/latest')
  })

  test('SP-08-3-1 산출물과 계획 문서에는 UUID literal을 포함하지 않는다', () => {
    const guardedSources = [
      SPEC_PATH,
      'clients/desktop/playwright/sp-08-3-dispatch-parity/sp-08-3-dispatch-parity.spec.ts',
    ].map(read).join('\n')

    expect(guardedSources).not.toMatch(UUID_REGEX)
    expect(matrix.map(row => row.currentRoute).join('\n')).not.toMatch(UUID_REGEX)
  })

  test('desktop renderer와 3개 서비스 main 소스에 Notion runtime call 재유입이 없다', () => {
    const files = [
      ...listFiles('services/arologis-service/src/main', file => /\.(java|yml|yaml|properties)$/.test(file)),
      ...listFiles('services/slip-service/src/main', file => /\.(java|yml|yaml|properties)$/.test(file)),
      ...listFiles('services/notification-service/src/main', file => /\.(java|yml|yaml|properties)$/.test(file)),
      ...listFiles('clients/desktop/src/renderer', file => /\.(ts|tsx|js|jsx)$/.test(file)),
      ...listFiles('clients/arologis-desktop/src/renderer', file => /\.(ts|tsx|js|jsx)$/.test(file)),
    ]

    const matches = scanFiles(files, [/api\.notion\.com/, /Notion-Version/, /@notionhq/])

    expect(matches).toEqual([])
  })

  test('SP-08-3-1 문서/QA 산출물이 secret-like marker를 포함하지 않는다', () => {
    const files = [
      SPEC_PATH,
      'docs/dev-reports/sp-08-3-dispatch-legacy-gas-parity.md',
      'docs/qa/sp-08-3-dispatch-parity/screenshot-checklist.md',
      'docs/handoff/CURRENT-WORK.md',
      'migration/decisions/DECISIONS.md',
      'clients/desktop/playwright/sp-08-3-dispatch-parity/sp-08-3-dispatch-parity.spec.ts',
    ]

    const matches = scanFiles(files, [
      /secret_[A-Za-z0-9]+/,
      /\bntn_[A-Za-z0-9_-]{20,}\b/,
      /\bAIza[0-9A-Za-z_-]{20,}\b/,
      /\bKakaoAK\s+[0-9A-Za-z_-]{10,}\b/,
      new RegExp(`\\bBEGIN\\s+PRIVATE\\s+KEY\\b`),
    ])

    expect(matches).toEqual([])
  })
})
