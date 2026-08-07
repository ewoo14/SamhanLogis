import { resolveQaCredential } from '../../../../scripts/lib/qa-credentials.cjs'
/**
 * 거래처(Partner) RESTORE 버전이력 실사용 QA 캡처 — PR #320.
 *
 * 실 백엔드(Docker partner-service, 재빌드된 PR #320 이미지) 대상으로 desktop
 * renderer(web, :5173)를 헤드리스 chromium 으로 구동, 다음 흐름을 단계별 촬영:
 *   로그인 → 거래처 등록(CREATE rev) → 4탭 편집(EDIT rev) → 버전이력 탭
 *   → 이 시점으로 복원 confirm → 복원 결과(toast).
 *
 * <h2>게이트웨이 우회 (QA 한정, PR #320 코드와 무관)</h2>
 * 로컬 스택의 api-gateway/auth-service 이미지가 stale(2026-05-22) 이고, 게이트웨이
 * 라우팅에 다음 격차가 있어(별도 finding 으로 기록) FE→gateway 경로가 막힌다:
 *   (#1) /auth/** 라우트에 JwtAuthentication 필터 미적용 → 권한매트릭스 403
 *   (#2) /admin/partners/search 의 lower(bytea) SQL 오류 → 목록 500 (partner DB)
 *   (#3) /api/v1/partners/** 라우트 StripPrefix=2 ↔ 4tab/revision 컨트롤러 풀패스 매핑 불일치 → 404
 * 따라서 본 캡처는 Playwright route() 로:
 *   - /api/v1/partners/**  → partner-service(:8095) 로 직접 프록시(X-User-* 헤더 주입,
 *     게이트웨이 JwtAuthentication 필터가 하던 신원 전파를 대행) — 복원 기능은 100% 실 서버.
 *   - /auth/admin/permissions/my → MASTER 전체 허용 매트릭스 stub(#1 우회).
 *   - /admin/partners/search → 방금 만든 거래처를 담은 합성 목록 stub(#2 우회).
 *   - 로그인/비번정책 등 그 외는 실 게이트웨이로 passthrough.
 * 즉 복원 기능(등록/편집/버전이력/복원) 자체는 전부 실 partner-service + 실 Postgres
 * V12(partner_revisions) + JSONB 스냅샷에 적중한다. stub 대상은 기능과 무관한 인프라 격차뿐.
 */
import { chromium } from '@playwright/test'
import http from 'node:http'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { resolveQaShotsDir } from '../support/qa-screenshot-dir.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
// resolveQaShotsDir 로 감싸 기본 실행이 커밋된 docs/qa/phase-2-3-partner-restore/ 를 직접
// 덮어쓰지 않게 한다(기본 _local/ 격리, 2026-07-26 하네스 재수렴 라운드 G2 — OUT 은 이
// 파일에서 템플릿 리터럴 `${OUT}/...` 로 간접 참조되어 기존 가드가 놓쳤다).
const OUT = resolveQaShotsDir(resolve(__dirname, '../../../../docs/qa/phase-2-3-partner-restore'))
const BASE = 'http://127.0.0.1:5173'
const PARTNER_HOST = 'localhost'
const PARTNER_PORT = 8095
const MASTER_ID = 'a0000000-0000-0000-0000-000000000001'
// 로그인 자격은 환경변수로 주입(시드 dev master). 평문 자격 하드코딩 금지(GitGuardian).
const LOGIN_ID = process.env.QA_MASTER_ID || 'dev_master'
const LOGIN_PW = resolveQaCredential('QA_MASTER_PASSWORD')
if (!LOGIN_PW) {
  console.error('QA_MASTER_PASSWORD 환경변수를 설정하세요 (seed dev master 비밀번호). 예: $env:QA_MASTER_PASSWORD=...')
  process.exit(2)
}

const SHIM = `
(() => {
  const KEY = '__qa_auth';
  const read = () => { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { return null; } };
  window.samhanAuth = {
    getToken: async () => read(),
    setToken: async (a) => { localStorage.setItem(KEY, JSON.stringify(a)); },
    clearToken: async () => { localStorage.removeItem(KEY); },
  };
  window.samhanLegacy = { getEstimateUrl: async () => '', openExternal: async () => {} };
})();
`

// MASTER 전체 허용 7-action 매트릭스 (partners.* 만 있어도 본 흐름엔 충분).
const ALL = ['VIEW', 'CREATE', 'UPDATE', 'DELETE', 'RESTORE', 'DOWNLOAD', 'PRINT']
const PERM_PAGES = ['partners.list', 'partners.detail', 'partners.4tab.edit']
const permMatrix = Object.fromEntries(PERM_PAGES.map((p) => [p, ALL]))

// 흐름 중 UI 가 만든 거래처를 기억 → search stub 이 목록으로 반환.
let created = null // { partnerCode, name, bizNo, status }

function partnerProxy(method, path, body, authHeader) {
  return new Promise((res, rej) => {
    const headers = {
      'X-User-Id': MASTER_ID,
      'X-User-Role': 'MASTER',
      'X-User-Name': 'dev-master',
      'Content-Type': 'application/json',
    }
    if (authHeader) headers['Authorization'] = authHeader
    const r = http.request({ host: PARTNER_HOST, port: PARTNER_PORT, path, method, headers }, (x) => {
      let d = ''
      x.on('data', (c) => (d += c))
      x.on('end', () => res({ status: x.statusCode, body: d, ctype: x.headers['content-type'] || 'application/json' }))
    })
    r.on('error', rej)
    if (body) r.write(body)
    r.end()
  })
}

let step = 0
async function shot(page, name) {
  step += 1
  const file = `${OUT}/${String(step).padStart(2, '0')}-${name}.png`
  await page.screenshot({ path: file, fullPage: true })
  console.log(`  📸 ${file}`)
}

async function main() {
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({ viewport: { width: 1440, height: 980 }, locale: 'ko-KR' })
  await context.addInitScript(SHIM)

  await context.route('**', async (route) => {
    const req = route.request()
    const url = new URL(req.url())
    const path = url.pathname + url.search
    const auth = req.headers()['authorization']

    // 권한 매트릭스 stub (#1 우회)
    if (url.pathname === '/auth/admin/permissions/my') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, code: 'OK', message: '성공', data: permMatrix, timestamp: new Date().toISOString() }),
      })
    }
    // 거래처 목록 stub (#2 우회) — 만든 거래처 1건 반환
    if (url.pathname === '/admin/partners/search') {
      const items = created ? [{ partnerCode: created.partnerCode, name: created.name, bizNo: created.bizNo, phone: null, status: created.status || 'ACTIVE', creditLimit: 0, outstandingBalance: 0 }] : []
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, code: 'OK', message: '성공', data: { items, total: items.length, page: 0, size: 20 }, timestamp: new Date().toISOString() }),
      })
    }
    // partner-service 직접 프록시 (#3 우회) — 복원 기능 전부 실 서버 적중
    if (url.pathname.startsWith('/api/v1/partners/')) {
      const body = req.postData() || null
      const r = await partnerProxy(req.method(), path, body, auth)
      // CREATE 응답에서 코드/이름 기억
      if (req.method() === 'POST' && url.pathname === '/api/v1/partners/full') {
        console.log(`   [proxy] CREATE -> ${r.status} ${r.body.slice(0, 120)}`)
        if (r.status < 300) {
          try { const d = JSON.parse(r.body).data; created = { partnerCode: d.basic.partnerCode, name: d.basic.name, bizNo: d.basic.bizNo, status: d.basic.status } } catch {}
        }
      }
      return route.fulfill({ status: r.status, contentType: r.ctype, body: r.body })
    }
    // 그 외 (로그인/정책/위젯 등) → 실 게이트웨이 passthrough
    return route.continue()
  })

  const page = await context.newPage()
  page.on('console', (m) => { if (m.type() === 'error') console.log('  [browser-error]', m.text().slice(0, 120)) })

  console.log('1) 로그인')
  await page.goto(BASE, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('[data-testid=login-id-input]', { timeout: 30000 })
  await page.fill('[data-testid=login-id-input]', LOGIN_ID)
  await page.fill('[data-testid=login-password-input]', LOGIN_PW)
  await shot(page, 'login')
  await page.click('[data-testid=login-submit-button]')
  await page.waitForFunction(() => !location.hash.includes('login'), { timeout: 30000 })
  await page.waitForTimeout(1500)
  await shot(page, 'dashboard')

  console.log('2) 거래처 신규 등록')
  await page.goto(`${BASE}/#/admin/partners/new`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('[data-testid=partner-create-basic-name]', { timeout: 30000 })
  const d10 = Date.now().toString().slice(-10)
  const NAME = `QA복원상사_${d10.slice(-6)}`
  const BIZ = `${d10.slice(0, 3)}-${d10.slice(3, 5)}-${d10.slice(5)}`
  await page.fill('[data-testid=partner-create-basic-name]', NAME)
  await page.fill('[data-testid=partner-create-basic-bizno]', BIZ)
  await shot(page, 'create-form')
  await page.click('[data-testid=partner-create-submit]')
  await page.waitForFunction(() => location.hash.includes('/admin/partners') && !location.hash.includes('/new'), { timeout: 30000 })
  await page.waitForTimeout(1500)
  console.log(`   created=${created ? created.partnerCode : 'NONE'}`)
  await shot(page, 'partner-list')

  console.log('3) 상세 다이얼로그')
  await page.getByText(NAME, { exact: false }).first().click()
  // DS Modal 은 role="dialog" 만 노출(data-testid 미전달) → 편집 버튼(실 testid)으로 로딩 완료 대기.
  await page.waitForSelector('[data-testid=partner-detail-edit-btn]', { timeout: 15000 })
  await page.waitForTimeout(800)
  await shot(page, 'detail-dialog')

  console.log('4) 편집 → 저장 (EDIT revision)')
  await page.click('[data-testid=partner-detail-edit-btn]')
  await page.waitForTimeout(500)
  const nameInput = page.locator('[role=dialog] input:not([disabled])').first()
  await nameInput.fill(`${NAME}-수정`)
  await shot(page, 'edit-mode')
  await page.click('[data-testid=partner-detail-save-btn]')
  await page.waitForTimeout(1800)
  await shot(page, 'after-save')

  console.log('5) 버전 이력 탭 (저장 직후, 리로드 없이 — F5 invalidate 검증)')
  // F5 수정 검증: 편집 저장 mutation 이 ['partnerRevisions'] 를 invalidate 하므로, 다이얼로그를
  // 닫지 않고 바로 '버전 이력' 탭으로 전환해도 rev2(EDIT) 가 최신으로 표시되어야 한다.
  await page.getByRole('tab', { name: '버전 이력' }).click()
  await page.waitForSelector('[data-testid=partner-version-history-list]', { timeout: 15000 })
  await page.waitForTimeout(1500)
  const histText = await page.locator('[data-testid=partner-version-history-list]').innerText().catch(() => '(none)')
  console.log('   version-history list:', histText.replace(/\n+/g, ' | '))
  await shot(page, 'version-history')

  console.log('6) rev1 복원 confirm')
  const restoreBtn = page.locator('[data-testid=partner-version-history-restore-button-1]')
  await restoreBtn.waitFor({ timeout: 10000 })
  await restoreBtn.click()
  await page.waitForSelector('[data-testid=partner-version-history-restore-confirm]', { timeout: 10000 })
  await page.waitForTimeout(500)
  await shot(page, 'restore-confirm')

  console.log('7) 복원 실행 → toast')
  await page.click('[data-testid=partner-version-history-restore-confirm]')
  await page.waitForSelector('[data-testid=partner-version-history-toast]', { timeout: 15000 })
  await page.waitForTimeout(1000)
  await shot(page, 'restore-success')

  const toast = await page.locator('[data-testid=partner-version-history-toast]').innerText().catch(() => '')
  console.log(`  ✅ toast: ${toast.replace(/\n/g, ' ')}`)

  await browser.close()
  console.log('DONE')
}

main().catch((e) => { console.error('CAPTURE FAILED:', e?.stack || e?.message || e); process.exit(1) })
