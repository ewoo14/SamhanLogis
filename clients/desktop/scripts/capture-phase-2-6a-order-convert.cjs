/**
 * Phase 2.6a 주문→출고전표 부분전환 — 실 연동 헤드리스 캡처 스크립트.
 *
 * 조건:
 *   - Vite dev server: http://localhost:5175 (VITE_MOCK_MODE 미설정 = 실 모드)
 *   - Backend gateway: http://localhost:8080 (실 JWT, 실 DB)
 *   - window.samhanAuth stub: 실 JWT 토큰 주입 (Electron IPC 대체)
 *
 * 실행:
 *   node clients/desktop/scripts/capture-phase-2-6a-order-convert.cjs
 *
 * 산출물:
 *   docs/qa/phase-2-6a-order-convert/screenshots/
 *     01-draft-order-list.png   DRAFT 주문 목록 (전환 대상 표시)
 *     02-draft-order-detail.png DRAFT 주문 상세 (converted_quantity 컬럼)
 *     03-converted-status.png   CONVERTED 상태 주문 (전량전환 완료 배지)
 *     04-confirmed-no-btn.png   CONFIRMED 주문 — 전환 버튼 미노출
 */
'use strict'

const { chromium } = require('@playwright/test')
const path = require('path')
const http = require('http')
const fs = require('fs')
const { resolveQaShotsDir } = require('../../../scripts/lib/qa-shots-dir.cjs')

const VITE_URL = 'http://localhost:5175'
const GATEWAY = 'http://localhost:8080'
// _local 격리(2026-07-26 하네스 재수렴 라운드 G3).
const SCREENSHOT_DIR = resolveQaShotsDir(path.join(__dirname, '../../../docs/qa/phase-2-6a-order-convert/screenshots'))

if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true })
}

function loginReal () {
  return new Promise((resolve, reject) => {
    // 자격은 환경변수로 주입 (평문 커밋 금지 — GitGuardian). 예: QA_LOGIN_ID=dev_master QA_LOGIN_PW=... node ...
    const body = JSON.stringify({
      loginId: process.env.QA_LOGIN_ID || 'dev_master',
      password: process.env.QA_LOGIN_PW || '',
    })
    const req = http.request(
      `${GATEWAY}/api/v1/auth/login`,
      { method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } },
      (res) => {
        let data = ''
        res.on('data', (chunk) => { data += chunk })
        res.on('end', () => {
          try {
            const json = JSON.parse(data)
            if (json.success) resolve(json.data.token)
            else reject(new Error('Login failed: ' + JSON.stringify(json)))
          } catch (e) { reject(e) }
        })
      }
    )
    req.on('error', reject)
    req.write(body)
    req.end()
  })
}

async function installAuth (page, token) {
  await page.addInitScript((tok) => {
    Object.defineProperty(window, 'samhanAuth', {
      configurable: true,
      value: {
        getToken: async () => ({
          token: tok,
          userId: 'a0000000-0000-0000-0000-000000000001',
          role: 'MASTER',
          fullName: '[DEV-SEED] 개발마스터',
        }),
        setToken: async () => undefined,
        clearToken: async () => undefined,
      },
    })
  }, token)
}

async function screenshotWithInfo(page, filename, label) {
  const filepath = path.join(SCREENSHOT_DIR, filename)
  await page.screenshot({ path: filepath, fullPage: false })
  const stat = fs.statSync(filepath)
  console.log(`  [OK] ${filename} (${(stat.size / 1024).toFixed(1)} KB) — ${label}`)
  return filepath
}

async function waitAndLoad(page, hashPath, ms = 4000) {
  // HashRouter 기반 — /#/path 형식
  const url = hashPath.startsWith('http')
    ? hashPath
    : `${VITE_URL}/#${hashPath}`
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 })
  // 테이블 또는 페이지 콘텐츠 대기
  try {
    await page.waitForSelector('table, [class*="emptyState"], [class*="detail"], [class*="card"]', { timeout: 15000 })
  } catch (e) { /* 페이지가 다르게 구성된 경우 무시 */ }
  await page.waitForTimeout(ms)
}

;(async () => {
  console.log('=== Phase 2.6a 주문→출고전표 부분전환 실 캡처 ===')

  let token
  try {
    token = await loginReal()
    console.log('[OK] 실 로그인 성공 (dev_master)')
  } catch (e) {
    console.error('[FAIL] 로그인 실패:', e.message)
    process.exit(1)
  }

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  })

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: 'ko-KR',
  })
  const page = await context.newPage()
  await installAuth(page, token)

  const results = []

  try {
    // ==== 01: DRAFT 주문 목록 ====
    console.log('\n[1/4] DRAFT 주문 목록 캡처...')
    await waitAndLoad(page, '/sales/partner-orders', 4000)
    results.push(await screenshotWithInfo(page, '01-draft-order-list.png', 'DRAFT 주문 목록'))

    // ==== 02: CONVERTED 주문 상세 (전량전환 완료) ====
    console.log('\n[2/4] CONVERTED 주문 (전량전환 완료) 캡처...')
    await waitAndLoad(page, '/sales/partner-orders/1341ce0a-c15d-441f-9112-02596aba92cb', 5000)
    results.push(await screenshotWithInfo(page, '02-converted-order-detail.png', 'CONVERTED 주문 상세 (converted_quantity=2/2)'))

    // ==== 03: CONVERTED 상태 필터 목록 ====
    console.log('\n[3/4] CONVERTED 상태 목록 캡처...')
    await waitAndLoad(page, '/sales/partner-orders', 3000)
    // status 필터 CONVERTED 선택 시도
    try {
      await page.selectOption('[data-testid="partner-order-list-status-filter"]', 'CONVERTED')
      await page.waitForTimeout(2500)
    } catch (e) { /* 필터 없으면 현재 화면 캡처 */ }
    results.push(await screenshotWithInfo(page, '03-converted-status-list.png', 'CONVERTED 상태 주문 목록'))

    // ==== 04: CONFIRMED 주문 상세 (전환 버튼 미노출) ====
    console.log('\n[4/4] CONFIRMED 주문 상세 (전환 버튼 미노출) 캡처...')
    await waitAndLoad(page, '/sales/partner-orders/339c0fb4-aae0-4250-a769-1edc07b49793', 5000)
    results.push(await screenshotWithInfo(page, '04-confirmed-no-convert-btn.png', 'CONFIRMED 주문 (전환 버튼 미노출)'))

  } catch (e) {
    console.error('[ERROR] 캡처 중 오류:', e.message)
  } finally {
    await browser.close()
  }

  console.log('\n=== 캡처 결과 ===')
  results.forEach(f => {
    if (fs.existsSync(f)) {
      const stat = fs.statSync(f)
      console.log(`  ${path.basename(f)}: ${(stat.size / 1024).toFixed(1)} KB`)
    }
  })
  console.log(`저장 경로: ${SCREENSHOT_DIR}`)
})()
