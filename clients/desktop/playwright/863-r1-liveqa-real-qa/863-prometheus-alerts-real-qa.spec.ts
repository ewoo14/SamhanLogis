import { resolveQaShotsDir } from '../support/qa-screenshot-dir'
/**
 * #863 R1 라이브QA ②③ — Prometheus 알람 GUI 실캡처.
 *
 * QA 전용 Prometheus(:9091)는 이 브랜치의 룰 파일
 * (infrastructure/prometheus/rules/partner-order-outbox.yml)을 **무수정으로** 마운트한다.
 * 공유 samhan-prometheus(:9090)는 main 트리 룰을 물고 있어 이 슬라이스 룰이 없으므로 별도 인스턴스를 쓴다.
 *
 * 캡처 대상:
 *   - /alerts  : 알람 state(inactive/pending/firing) 와 평가값
 *   - /graph   : heartbeat 게이지 시계열(정지 후 단조 증가) / depth·age 게이지
 *
 * 실행:
 *   SHOT_PREFIX=20-stall node_modules\.bin\playwright test --config=playwright.real-qa.config.ts \
 *     playwright/863-r1-liveqa-real-qa/863-prometheus-alerts-real-qa.spec.ts --reporter=line
 */
import { test, type Page } from '@playwright/test'
import * as path from 'path'
import * as fs from 'fs'
import { fileURLToPath } from 'url'

const _dirname =
  typeof __dirname !== 'undefined' ? __dirname : path.dirname(fileURLToPath(import.meta.url))
const PROM = process.env['QA_PROM_URL'] ?? 'http://127.0.0.1:9091'
const PREFIX = process.env['SHOT_PREFIX'] ?? 'prom'
const SHOTS = resolveQaShotsDir(path.resolve(_dirname, '../../../../docs/qa/863-r1-liveqa'))
fs.mkdirSync(SHOTS, { recursive: true })

async function shot(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: path.join(SHOTS, `${PREFIX}-${name}.png`), fullPage: true })
}

test('#863 Prometheus 알람 상태 + 게이지 그래프 캡처', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })

  // 1) 알람 목록 — state 배지가 보이도록 전부 펼친다.
  await page.goto(`${PROM}/alerts`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2500)
  // "Show annotations" 및 각 알람 접힘 해제
  const collapsibles = page.locator('.collapsible-parent, [class*="collapsible"]')
  const n = await collapsibles.count()
  for (let i = 0; i < Math.min(n, 12); i++) {
    try {
      await collapsibles.nth(i).click({ timeout: 1500 })
    } catch {
      /* 이미 펼쳐졌거나 클릭 불가 — 무시 */
    }
  }
  await page.waitForTimeout(1200)
  await shot(page, 'alerts')

  // 2) heartbeat 게이지 그래프
  const hbExpr = encodeURIComponent('outbox_scheduler_heartbeat_seconds{application="partner-order-service"}')
  await page.goto(`${PROM}/graph?g0.expr=${hbExpr}&g0.tab=0&g0.range_input=30m`, {
    waitUntil: 'domcontentloaded',
  })
  await page.waitForTimeout(4000)
  await shot(page, 'graph-heartbeat')

  // 3) depth / age 게이지 그래프 (fail-loud sentinel 확인용)
  const depthExpr = encodeURIComponent('outbox_pending_depth{application="partner-order-service"}')
  const ageExpr = encodeURIComponent(
    'outbox_oldest_pending_age_seconds{application="partner-order-service"}',
  )
  await page.goto(
    `${PROM}/graph?g0.expr=${depthExpr}&g0.tab=0&g0.range_input=30m&g1.expr=${ageExpr}&g1.tab=0&g1.range_input=30m`,
    { waitUntil: 'domcontentloaded' },
  )
  await page.waitForTimeout(4000)
  await shot(page, 'graph-depth-age')
})
