/**
 * QA 실서버 실화면 캡처 — 수식 빌더 F1 싱글 세트 분류 GAS parity 복원 (PR #499)
 *
 * 깨짐(수정 전): BE 가 SINGLE_SET 을 classifyHome 으로 라우팅 → 싱글 에어컨 244/276(88%)이 '부자재' 추락.
 * fix: classifySingleSet(GAS classifySingleSetFixed 1:1 포팅) → 가정용 에어컨/4way 냉난방/비스포크 스탠드 등 복원.
 *
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
const OUT = resolveQaShotsDir(path.resolve(_dirname, '../../docs/qa/formula-f1-single-classify'))
const results = []
const record = (s, p, n) => { results.push({ scene: s, pass: p, note: n }); console.log(`[qa] ${p ? 'PASS' : 'FAIL'} — ${s}${n ? ' :: ' + n : ''}`) }

async function freshToken() {
  const res = await fetch(`${GATEWAY}/api/v1/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ loginId: 'dev_master', password: 'dev_p05_pass!' }) })
  const json = await res.json()
  if (!json?.data?.token) throw new Error('login failed')
  return json.data
}

// 분류 요약 셀만(설정 버튼 testid 제외) 텍스트 수집 → '설정' 꼬리 제거
async function classText(page) {
  const raw = await page.locator('[data-testid^="estimate-items-classification-"]:not([data-testid*="settings"])').allTextContents()
  return raw.map((t) => t.replace(/설정$/, '').trim()).filter(Boolean)
}

async function main() {
  const auth = await freshToken()
  const browser = await chromium.launch({ headless: true, chromiumSandbox: false, args: ['--disable-dev-shm-usage', '--disable-gpu'] })
  const context = await browser.newContext({ viewport: { width: 1480, height: 980 }, deviceScaleFactor: 1.5, locale: 'ko-KR' })
  await context.addInitScript((snap) => {
    window.samhanAuth = { getToken: async () => snap, setToken: async () => {}, clearToken: async () => {} }
    window.samhanLegacy = { getEstimateUrl: async () => '', openExternal: async () => {} }
  }, { token: auth.token, userId: auth.userId, displayName: auth.displayName, role: auth.role })
  const page = await context.newPage()

  // ── Scene 1: 싱글중대형 기본 — 부자재 추락 해소 ──
  await page.goto(`${RENDERER}/#/products/estimate-items?category=SINGLE_SET`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('[data-testid="estimate-items-table"]', { timeout: 20000 })
  await page.waitForTimeout(2000)
  await page.screenshot({ path: `${OUT}/01-single-classification.png`, fullPage: false })
  const cells1 = await classText(page)
  const buojae = cells1.filter((c) => c.startsWith('부자재')).length
  record('싱글중대형 분류 — 부자재 추락 해소(구 88% → )', cells1.length > 0 && buojae <= Math.ceil(cells1.length * 0.2),
    `부자재=${buojae}/${cells1.length}, 샘플="${cells1[0] || ''}"`)

  // ── Scene 2: '가정용' 검색 → 가정용 에어컨 분류 복원 ──
  await page.fill('[data-testid="estimate-items-search-input"]', '가정용')
  await page.click('[data-testid="estimate-items-query-button"]')
  await page.waitForTimeout(1800)
  await page.screenshot({ path: `${OUT}/02-single-search-household.png`, fullPage: false })
  const cells2 = await classText(page)
  const hasHousehold = cells2.some((c) => c.includes('가정용 에어컨'))
  record('검색 "가정용" → 가정용 에어컨 분류 복원', hasHousehold, `샘플=[${cells2.slice(0, 3).join(' / ')}]`)

  // ── Scene 3: '스탠드' 검색 → 냉난방/비스포크 스탠드 분류 ──
  await page.fill('[data-testid="estimate-items-search-input"]', '스탠드')
  await page.click('[data-testid="estimate-items-query-button"]')
  await page.waitForTimeout(1800)
  await page.screenshot({ path: `${OUT}/03-single-search-stand.png`, fullPage: false })
  const cells3 = await classText(page)
  const hasStand = cells3.some((c) => c.includes('스탠드'))
  record('검색 "스탠드" → 냉난방/비스포크 스탠드 분류', hasStand, `샘플=[${cells3.slice(0, 3).join(' / ')}]`)

  writeFileSync(`${OUT}/_results.json`, JSON.stringify({ results, scene1Sample: cells1.slice(0, 12), scene2Sample: cells2.slice(0, 8), scene3Sample: cells3.slice(0, 8) }, null, 2))
  await browser.close()
  const pass = results.filter((r) => r.pass).length
  console.log(`[qa] ${pass}/${results.length} PASS`)
  if (pass < results.length) process.exitCode = 2
}
main().catch((e) => { console.error(e); process.exit(1) })
