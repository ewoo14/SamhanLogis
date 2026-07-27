/**
 * PR #458 출고전표·거래명세서 원본 양식 1:1 — 실 연동 헤드리스 캡처.
 *
 * 조건:
 *   - Vite dev server: http://localhost:5173 (electron-vite dev — 실 모드, VITE_MOCK_MODE 미설정)
 *   - Backend gateway: http://localhost:8080 (실 JWT, 실 DB)
 *
 * 실행:
 *   QA_LOGIN_PW=<V5 DEV 시드 비번> node clients/desktop/scripts/capture-slip-print-form-458.cjs
 *
 * 산출물: docs/qa/slip-shipout-print-form/screenshots/
 *   10-dispatch-real.png        출고전표 (실전표, 원본 양식 4열 월/일|품목명|규격|수량)
 *   11-statement-real.png       거래명세서 (실전표, 원본 양식 — 공급자표/배송지/한글금액/합계행/계좌푸터)
 *   12-dispatch-many-lines.png  품목 다량(24행) 실전표 — 한 A4 자동 zoom 축소 검증
 *   13-statement-many-lines.png 동일 전표 거래명세서 자동 축소
 */
'use strict'

const { chromium } = require('@playwright/test')
const path = require('path')
const http = require('http')
const { resolveQaShotsDir } = require('../../../scripts/lib/qa-shots-dir.cjs')

const VITE_URL = 'http://localhost:5173'
const GATEWAY = 'http://localhost:8080'
// _local 격리(2026-07-26 하네스 재수렴 라운드 G3).
const OUT = resolveQaShotsDir(path.join(__dirname, '../../../docs/qa/slip-shipout-print-form/screenshots'))

/** 기존 실전표 (slip_db 조회 — 2026/06/09-1 QA거래처 4 lines). */
const BASE_SLIP_ID = process.env.QA_SLIP_ID || '44a5e186-e9dc-4006-b46c-99e65d66dda3'

function jsonReq(method, urlPath, body, token) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null
    const req = http.request(
      `${GATEWAY}${urlPath}`,
      {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      },
      (res) => {
        let buf = ''
        res.on('data', (c) => { buf += c })
        res.on('end', () => {
          try {
            const json = JSON.parse(buf || '{}')
            if (res.statusCode >= 200 && res.statusCode < 300) resolve(json)
            else reject(new Error(`${method} ${urlPath} → ${res.statusCode}: ${buf.slice(0, 300)}`))
          } catch (e) { reject(e) }
        })
      },
    )
    req.on('error', reject)
    if (data) req.write(data)
    req.end()
  })
}

async function loginReal() {
  const json = await jsonReq('POST', '/auth/login', {
    loginId: process.env.QA_LOGIN_ID || 'dev_master',
    password: process.env.QA_LOGIN_PW || '',
  })
  if (!json.success) throw new Error('login failed: ' + JSON.stringify(json))
  return json.data.token
}

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

async function shot(page, filename) {
  const fp = path.join(OUT, filename)
  await page.screenshot({ path: fp, fullPage: true })
  const size = require('fs').statSync(fp).size
  console.log(`  SAVED: ${filename} (${Math.round(size / 1024)} KB)`)
}

async function capturePrint(context, token, slipId, route, filename) {
  const page = await context.newPage()
  await installAuth(page, token)
  await page.goto(`${VITE_URL}/#/sales/${slipId}/print/${route}`, {
    waitUntil: 'domcontentloaded', timeout: 30_000,
  })
  // 데이터 로드 + zoom 측정 완료 대기
  await page.waitForSelector(route === 'dispatch' ? '.dispatch-page' : '.stm-page', { timeout: 20_000 })
  await page.waitForTimeout(2500)
  const zoom = await page.evaluate((sel) => {
    const el = document.querySelector(sel)
    return el ? (el.style.zoom || '1') : 'no-el'
  }, route === 'dispatch' ? '.dispatch-page' : '.stm-page')
  console.log(`  [${filename}] zoom=${zoom}`)
  await shot(page, filename)
  await page.close()
  return zoom
}

/** 다량 품목 실전표 생성 — 실 product 24종 라인 포함 (실데이터 QA, mock 아님). */
async function createManyLineSlip(token) {
  // 실 products 조회 (카탈로그 24종)
  const prods = await jsonReq('GET', '/api/products?size=24&page=0', null, token)
  const list = (prods.data && (prods.data.content || prods.data)) || []
  const lines = list.slice(0, 24).map((p, i) => ({
    productId: p.id,
    productName: p.name,
    modelName: p.modelName || p.modelCode || p.name,
    quantity: 1 + (i % 3),
    unitPrice: String(p.sellingPrice ?? p.releasePrice ?? 100000),
  }))
  if (lines.length === 0) throw new Error('실 products 0건 — 카탈로그 확인 필요')
  const created = await jsonReq('POST', '/slips', {
    slipType: 'OUTBOUND',
    sourceWarehouseId: '11111111-1111-1111-1111-000000000001', // 본사창고 (실 시드)
    partnerName: 'QA 다량품목 자동축소 검증',
    paymentDueDate: '2026-06-30', // 결제예정일 칸 QA (개발책임자 정정)
    memo: '오전일찍 최대한 빨리 (PR #458 자동 축소 QA)',
    shippingAddress: '경기도 광주시 초월읍 무갑길 100 (자동축소 QA 배송지)',
    customerTel: '010-0000-0000',
    lines,
  }, token)
  const slipId = created.data.id
  console.log(`  다량 전표 생성: ${slipId} (lines=${lines.length})`)
  return slipId
}

;(async () => {
  console.log('[PR #458 실 캡처] 시작')
  const token = await loginReal()
  console.log('1) 실 JWT OK')

  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] })
  const context = await browser.newContext({ viewport: { width: 1100, height: 1500 } })

  console.log('2) 기존 실전표 — 출고전표/거래명세서')
  await capturePrint(context, token, BASE_SLIP_ID, 'dispatch', '10-dispatch-real.png')
  await capturePrint(context, token, BASE_SLIP_ID, 'statement', '11-statement-real.png')

  console.log('3) 다량 품목(24행) 실전표 생성 + 자동 축소 검증')
  const bigSlipId = await createManyLineSlip(token)
  const z1 = await capturePrint(context, token, bigSlipId, 'dispatch', '12-dispatch-many-lines.png')
  const z2 = await capturePrint(context, token, bigSlipId, 'statement', '13-statement-many-lines.png')
  console.log(`  자동 축소 결과: dispatch zoom=${z1} / statement zoom=${z2}`)

  console.log('4) 거래처 연동 전표 — 공급받는자 사업자주소+대표번호 검증')
  {
    const prods = await jsonReq('GET', '/api/products?size=3&page=0', null, token)
    const list = (prods.data && (prods.data.content || prods.data)) || []
    const created = await jsonReq('POST', '/slips', {
      slipType: 'OUTBOUND',
      sourceWarehouseId: '11111111-1111-1111-1111-000000000001',
      partnerId: 'a1b2c3d4-0001-0001-0001-000000000001', // P0-6-C001 (주)한국냉동물류 (실 시드)
      partnerName: '(주)한국냉동물류',
      shippingAddress: '경기도 남양주시 다산순환로 300 (배송지 QA)',
      recipientPhone: '010-0000-0000',
      lines: list.slice(0, 3).map((p, i) => ({
        productId: p.id, productName: p.name,
        modelName: p.modelName || p.name, quantity: i + 1,
        unitPrice: String(p.sellingPrice ?? 100000),
      })),
    }, token)
    await capturePrint(context, token, created.data.id, 'statement', '14-statement-partner.png')
  }

  await browser.close()
  console.log('[PR #458 실 캡처] 완료 →', OUT)
})().catch((e) => { console.error('FAIL:', e.message); process.exit(1) })
