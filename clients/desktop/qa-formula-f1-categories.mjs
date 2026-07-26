/**
 * QA 실서버 실화면 캡처 — 수식 빌더 F1 전 카테고리 분류 GAS parity (PR #499)
 *
 * 멀티(홈멀티/상업멀티) + 싱글 모두 분류 컬럼이 GAS 화면 분류로 채워졌는지 실 DB 캡처.
 * mock OFF. 실 gateway(:8080). dev_master. renderer localhost:5173.
 */
import { chromium } from '@playwright/test'
import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveQaShotsDir } from '../../scripts/lib/qa-shots-dir.mjs'

const _dirname = path.dirname(fileURLToPath(import.meta.url))
const RENDERER = 'http://localhost:5173'
const GATEWAY = 'http://localhost:8080'
// 절대경로 하드코딩 제거 + _local 격리(2026-07-26 하네스 재수렴 라운드 G3).
// (resolveQaShotsDir 가 mkdirSync 를 내부에서 이미 호출한다.)
const OUT = resolveQaShotsDir(path.resolve(_dirname, '../../docs/qa/formula-f1-categories'))
const results = []
const record = (s, p, n) => { results.push({ scene: s, pass: p, note: n }); console.log(`[qa] ${p ? 'PASS' : 'FAIL'} — ${s}${n ? ' :: ' + n : ''}`) }

async function freshToken() {
  const res = await fetch(`${GATEWAY}/api/v1/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ loginId: 'dev_master', password: 'dev_p05_pass!' }) })
  const json = await res.json()
  if (!json?.data?.token) throw new Error('login failed')
  return json.data
}

async function classText(page) {
  const raw = await page.locator('[data-testid^="estimate-items-classification-"]:not([data-testid*="settings"])').allTextContents()
  return raw.map((t) => t.replace(/설정$/, '').trim()).filter(Boolean)
}

const CATS = [
  { key: 'HOME_MULTI', label: '홈멀티', expect: ['실외기', '실내기', '판넬'] },
  { key: 'COMMERCIAL_MULTI', label: '상업멀티', expect: ['실외기', '실내기'] },
  { key: 'SINGLE_SET', label: '싱글중대형', expect: ['가정용 에어컨', '4way 냉난방', '360'] },
]

async function main() {
  const auth = await freshToken()
  const browser = await chromium.launch({ headless: true, chromiumSandbox: false, args: ['--disable-dev-shm-usage', '--disable-gpu'] })
  const context = await browser.newContext({ viewport: { width: 1480, height: 980 }, deviceScaleFactor: 1.5, locale: 'ko-KR' })
  await context.addInitScript((snap) => {
    window.samhanAuth = { getToken: async () => snap, setToken: async () => {}, clearToken: async () => {} }
    window.samhanLegacy = { getEstimateUrl: async () => '', openExternal: async () => {} }
  }, { token: auth.token, userId: auth.userId, displayName: auth.displayName, role: auth.role })
  const page = await context.newPage()

  let idx = 0
  for (const cat of CATS) {
    idx += 1
    await page.goto(`${RENDERER}/#/products/estimate-items?category=${cat.key}`, { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('[data-testid="estimate-items-table"]', { timeout: 20000 })
    await page.waitForTimeout(1800)
    await page.screenshot({ path: `${OUT}/0${idx}-${cat.key}.png`, fullPage: false })
    const cells = await classText(page)
    const joined = cells.join(' | ')
    const found = cat.expect.filter((k) => joined.includes(k))
    const buojae = cells.filter((c) => c.startsWith('부자재')).length
    record(`${cat.label}(${cat.key}) 분류 = GAS 분류`, cells.length > 0 && found.length >= 1 && buojae <= Math.ceil(cells.length * 0.5),
      `기대분류발견=[${found.join(', ')}] 부자재=${buojae}/${cells.length} 샘플="${cells[0] || ''}"`)
  }

  writeFileSync(`${OUT}/_results.json`, JSON.stringify({ results }, null, 2))
  await browser.close()
  const pass = results.filter((r) => r.pass).length
  console.log(`[qa] ${pass}/${results.length} PASS`)
  if (pass < results.length) process.exitCode = 2
}
main().catch((e) => { console.error(e); process.exit(1) })
