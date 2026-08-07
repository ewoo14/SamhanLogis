const { resolveQaCredential } = require('../../../scripts/lib/qa-credentials.cjs')
/**
 * Phase 2.5 주문 보류(ON_HOLD) + 상태 필터 — 실 연동 헤드리스 캡처 스크립트.
 *
 * 조건:
 *   - Vite dev server: http://localhost:5175 (VITE_MOCK_MODE 미설정 = 실 모드)
 *   - Backend gateway: http://localhost:8080 (실 JWT, 실 DB)
 *   - window.samhanAuth stub: 실 JWT 토큰 주입 (Electron IPC 대체)
 *
 * 실행:
 *   node clients/desktop/scripts/capture-phase-2-5-real.cjs
 *
 * 산출물:
 *   docs/qa/phase-2-5-partner-order-hold/screenshots/
 *     01-list-draft.png      DRAFT 필터 (진행중) — 실 데이터 9건
 *     02-list-confirmed.png  CONFIRMED 필터 (완료) — 실 데이터 50건
 *     03-list-onhold.png     ON_HOLD 필터 (보류) — PO-2026-0002 1건
 *     04-detail-draft.png    DRAFT 주문 상세 — 보류 버튼 노출
 *     05-hold-executed.png   보류 클릭 후 ON_HOLD 상태 + 해제 버튼
 *     06-release-executed.png 보류 해제 클릭 후 DRAFT 복귀
 *     07-label-badges.png    한글 상태 라벨 (진행중/완료/보류) 나란히
 */
'use strict'

const { chromium } = require('@playwright/test')
const path = require('path')
const https = require('https')
const http = require('http')
const { resolveQaShotsDir } = require('../../../scripts/lib/qa-shots-dir.cjs')

const VITE_URL = 'http://localhost:5175'
const GATEWAY = 'http://localhost:8080'
// _local 격리(2026-07-26 하네스 재수렴 라운드 G3) — 기본 실행이 커밋된 확정 증거를 직접
// 덮어쓰지 않는다.
const SCREENSHOT_DIR = resolveQaShotsDir(path.join(__dirname, '../../../docs/qa/phase-2-5-partner-order-hold/screenshots'))

// ──────────────────────────────────────────────────────────────────────────
// 실 JWT 발급
// ──────────────────────────────────────────────────────────────────────────
function loginReal() {
  return new Promise((resolve, reject) => {
    // 자격은 환경변수로 주입 (평문 커밋 금지 — GitGuardian). QA_LOGIN_ID/QA_DEV_DEFAULT_PASSWORD.
    const body = JSON.stringify({
      loginId: process.env.QA_LOGIN_ID || 'dev_master',
      password: resolveQaCredential('QA_DEV_DEFAULT_PASSWORD'),
    })
    const req = http.request(
      `${GATEWAY}/auth/login`,
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
      },
    )
    req.on('error', reject)
    req.write(body)
    req.end()
  })
}

// ──────────────────────────────────────────────────────────────────────────
// Playwright 유틸
// ──────────────────────────────────────────────────────────────────────────
async function installAuth(page, token) {
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

async function gotoList(page, status) {
  const url = `${VITE_URL}/#/sales/partner-orders`
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 })
  await page.waitForSelector('[data-testid="partner-order-list-status-filter"]', { timeout: 20_000 })
  if (status) {
    await page.selectOption('[data-testid="partner-order-list-status-filter"]', status)
    await page.waitForTimeout(2500)
  } else {
    await page.waitForTimeout(2500)
  }
}

async function shot(page, filename) {
  const fp = path.join(SCREENSHOT_DIR, filename)
  await page.screenshot({ path: fp, fullPage: false })
  const fs = require('fs')
  const size = fs.statSync(fp).size
  console.log(`  SAVED: ${filename} (${Math.round(size / 1024)} KB)`)
  return fp
}

// ──────────────────────────────────────────────────────────────────────────
// Main
// ──────────────────────────────────────────────────────────────────────────
;(async () => {
  console.log('[Phase 2.5 실 연동 캡처] 시작')

  // 실 JWT 발급
  console.log('1) 실 JWT 발급 중...')
  let token
  try {
    token = await loginReal()
    console.log('   OK — token:', token.substring(0, 40) + '...')
  } catch (e) {
    console.error('   FAIL — 로그인 실패:', e.message)
    process.exit(1)
  }

  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] })
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })

  try {
    // ── 01 DRAFT 필터 (진행중) ──────────────────────────────────────────
    console.log('2) 01 — DRAFT 필터 (진행중) 캡처')
    {
      const page = await context.newPage()
      await installAuth(page, token)
      await gotoList(page, 'DRAFT')
      // 테이블 또는 emptyState 대기
      await page.waitForSelector('table, [class*="emptyState"]', { timeout: 15_000 })
      await shot(page, '01-list-draft.png')
      await page.close()
    }

    // ── 02 CONFIRMED 필터 (완료) ────────────────────────────────────────
    console.log('3) 02 — CONFIRMED 필터 (완료) 캡처')
    {
      const page = await context.newPage()
      await installAuth(page, token)
      await gotoList(page, 'CONFIRMED')
      await page.waitForSelector('table, [class*="emptyState"]', { timeout: 15_000 })
      await shot(page, '02-list-confirmed.png')
      await page.close()
    }

    // ── 03 ON_HOLD 필터 (보류) ──────────────────────────────────────────
    console.log('4) 03 — ON_HOLD 필터 (보류) 캡처')
    {
      const page = await context.newPage()
      await installAuth(page, token)
      await gotoList(page, 'ON_HOLD')
      await page.waitForSelector('table, [class*="emptyState"]', { timeout: 15_000 })
      await shot(page, '03-list-onhold.png')
      await page.close()
    }

    // ── 04 DRAFT 주문 상세 — 보류 버튼 ─────────────────────────────────
    console.log('5) 04 — DRAFT 주문 상세 (보류 버튼) 캡처')
    {
      const page = await context.newPage()
      await installAuth(page, token)
      // 실 DRAFT 주문: FE path = orderNumber.replace(/\//g, '-')
      // 2026/04/15-5 → 2026-04-15-5
      await page.goto(`${VITE_URL}/#/sales/partner-orders/2026-04-15-5`, { waitUntil: 'domcontentloaded', timeout: 30_000 })
      await page.waitForSelector('[data-testid="partner-order-hold"]', { timeout: 20_000 })
      await shot(page, '04-detail-draft.png')

      // ── 05 보류 실행 → ON_HOLD ───────────────────────────────────────
      console.log('6) 05 — 보류 버튼 클릭 → ON_HOLD 캡처')
      await page.click('[data-testid="partner-order-hold"]')
      await page.waitForSelector('[data-testid="partner-order-release"]', { timeout: 15_000 })
      await page.waitForTimeout(500)
      await shot(page, '05-hold-executed.png')

      // ── 06 보류 해제 → DRAFT 복귀 ────────────────────────────────────
      console.log('7) 06 — 보류 해제 클릭 → DRAFT 복귀 캡처')
      await page.click('[data-testid="partner-order-release"]')
      await page.waitForSelector('[data-testid="partner-order-hold"]', { timeout: 15_000 })
      await page.waitForTimeout(500)
      await shot(page, '06-release-executed.png')

      await page.close()
    }

    // ── 07 라벨 한글 — 세 상태 배지를 한 화면에 ──────────────────────
    console.log('8) 07 — 한글 상태 라벨 (진행중/완료/보류) 배지 캡처')
    {
      const page = await context.newPage()
      await installAuth(page, token)
      // ON_HOLD 필터로 이동 — 테이블에 '보류' 배지 포함
      await gotoList(page, 'ON_HOLD')
      await page.waitForSelector('table, [class*="emptyState"]', { timeout: 15_000 })
      // 상태 필터 드롭다운 영역 스크롤해서 옵션(진행중/완료/보류) 전부 보이게
      await page.evaluate(() => {
        const el = document.querySelector('[data-testid="partner-order-list-status-filter"]')
        if (el) el.scrollIntoView()
      })
      await shot(page, '07-label-badges.png')
      await page.close()
    }

  } finally {
    await browser.close()
  }

  console.log('\n[완료] 실 캡처 7장 저장됨:', SCREENSHOT_DIR)
})()
