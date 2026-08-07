import { resolveQaCredential } from '../../../../scripts/lib/qa-credentials.cjs'
import { resolveQaShotsDir } from '../support/qa-screenshot-dir'
/**
 * #810 입금자명↔거래처 매핑 — OPUS 적대검증 R1 fix 라이브 QA.
 *
 * 실 게이트웨이(:8080, VITE_MOCK_MODE OFF) → 재빌드 accounting-service(V57+V58 적용) → 실 Postgres.
 * 렌더러는 :5212(vite dev) 선기동. dev_master 로그인.
 *
 * 검증 대상(R1 fix):
 *  - DepositorMappingPage(신규 관리화면) 실 렌더 + CRUD(생성/수정) 실 반영
 *  - 이력 조회가 거래처코드·사유 변경을 노출(L4-H2/L6-H1 fix — 구버전은 정규화명만)
 *  - BankTransactionPage 매칭근거 배지(수동/자동) 실 렌더 (V57 backfill=MANUAL 실데이터)
 *
 * 단계별 캡처: docs/qa/810-depositor-mapping/
 */
import { expect, test, type Page } from '@playwright/test'
import * as path from 'path'
import * as fs from 'fs'
import { fileURLToPath } from 'url'

const _dirname =
  typeof __dirname !== 'undefined' ? __dirname : path.dirname(fileURLToPath(import.meta.url))
const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5212'
const API_BASE = process.env['API_BASE'] ?? 'http://localhost:8080'
const PASSWORD = resolveQaCredential('QA_DEV_DEFAULT_PASSWORD')
const SHOTS = resolveQaShotsDir(path.resolve(_dirname, '../../../../docs/qa/810-depositor-mapping'))
fs.mkdirSync(SHOTS, { recursive: true })

const RAW = 'QA-R2-매핑검증-' + Date.now()

let shotNo = 0
async function capture(page: Page, name: string): Promise<void> {
  shotNo++
  await page.screenshot({
    path: path.join(SHOTS, `${String(shotNo).padStart(2, '0')}-${name}.png`),
    fullPage: false,
  })
}

interface LoginResult { token: string; role: string; userId: string; displayName: string }

async function realLogin(page: Page, loginId: string): Promise<LoginResult> {
  const res = await page.request.post(`${API_BASE}/auth/login`, { data: { loginId, password: PASSWORD } })
  expect(res.ok(), `로그인 실패(${loginId}): HTTP ${res.status()}`).toBeTruthy()
  const d = (await res.json()).data ?? {}
  return { token: d.token ?? '', role: d.role ?? '', userId: d.userId ?? '', displayName: d.displayName ?? loginId }
}

async function installAuthStub(page: Page, login: LoginResult): Promise<void> {
  await page.addInitScript(
    ({ tok, r, uid, name }: { tok: string; r: string; uid: string; name: string }) => {
      Object.defineProperty(window, 'samhanAuth', {
        configurable: true,
        value: {
          getToken: async () => ({ token: tok, userId: uid, role: r, fullName: name, partnerCode: null }),
          setToken: async () => undefined,
          clearToken: async () => undefined,
        },
      })
    },
    { tok: login.token, r: login.role, uid: login.userId, name: login.displayName },
  )
}

test('#810 R1 fix 라이브 QA — 매핑 관리화면·이력(거래처변경)·배지 실증', async ({ page }) => {
  const login = await realLogin(page, 'dev_master')
  await installAuthStub(page, login)
  const H = { Authorization: `Bearer ${login.token}` }

  // ── setup(API): 실 거래처코드 2개 + 매핑 생성→수정(이력에 거래처 변경 발생) ──
  const btRes = await page.request.get(`${API_BASE}/accounting/bank-transactions?size=60`, { headers: H })
  const btJson = await btRes.json()
  const txns: Array<{ matchedPartnerCode?: string | null; partnerMatchSource?: string | null; counterpartyName?: string | null; txnType?: string }> =
    Array.isArray(btJson.data) ? btJson.data : (btJson.data?.content ?? [])
  const partnerCodes = Array.from(new Set(txns.map((t) => t.matchedPartnerCode).filter((c): c is string => !!c)))
  expect(partnerCodes.length, `실 거래처코드 확보 실패: ${JSON.stringify(partnerCodes)}`).toBeGreaterThanOrEqual(1)
  const A = partnerCodes[0]
  const B = partnerCodes[1] ?? partnerCodes[0]
  console.log('[SETUP] partnerCodes', partnerCodes.slice(0, 4), '→ A=', A, 'B=', B)

  // 멱등: 기존 QA 매핑 제거(정규화키=대문자화, RAW는 소문자 없음 → RAW 동일)
  await page.request.delete(
    `${API_BASE}/accounting/deposit-mappings?normalizedName=${encodeURIComponent(RAW)}&reason=QA-cleanup`,
    { headers: H },
  ).catch(() => undefined)

  const createRes = await page.request.post(`${API_BASE}/accounting/deposit-mappings`, {
    headers: H,
    data: { rawName: RAW, partnerCode: A, reason: '초기 등록(R1 QA)' },
  })
  expect([200, 201], `매핑 생성 실패: HTTP ${createRes.status()} ${await createRes.text()}`).toContain(createRes.status())
  const created = (await createRes.json()).data ?? {}
  const normalized: string = created.normalizedName ?? RAW
  console.log('[SETUP] created mapping normalized=', normalized, 'partnerA=', A)

  // 거래처 변경(A→B) — 이력에 partnerCode 변경 revision 생성(구버전 결함이면 이력에 안 보임)
  if (B !== A) {
    const updRes = await page.request.put(
      `${API_BASE}/accounting/deposit-mappings?normalizedName=${encodeURIComponent(normalized)}`,
      { headers: H, data: { rawName: RAW, partnerCode: B, reason: '거래처 변경(R1 QA)' } },
    )
    expect(updRes.ok(), `매핑 수정 실패: HTTP ${updRes.status()} ${await updRes.text()}`).toBeTruthy()
    console.log('[SETUP] updated mapping partnerB=', B)
  }

  // 이력 API 직접 확인(구버전 결함=정규화명 행만·거래처변경 소실 / fix=partnerCode 행 노출)
  const histRes = await page.request.get(
    `${API_BASE}/accounting/deposit-mappings/history?normalizedName=${encodeURIComponent(normalized)}`,
    { headers: H },
  )
  const hist: Array<{ fieldName?: string; oldValue?: string; newValue?: string }> = (await histRes.json()).data ?? []
  const histFields = hist.map((h) => h.fieldName)
  console.log('[HISTORY API] fields=', JSON.stringify(histFields))
  const hasPartnerCodeRow = hist.some((h) => (h.fieldName ?? '').toLowerCase().includes('partnercode'))
  expect(hasPartnerCodeRow, `이력에 거래처(partnerCode) 행 부재 — L4-H2/L6-H1 회귀: ${JSON.stringify(histFields)}`).toBeTruthy()

  // ── UI 캡처 ──
  const dmStatuses: string[] = []
  page.on('response', (r) => {
    const u = r.url()
    if (u.includes('/accounting/deposit-mappings') || u.includes('/accounting/bank-transactions')) {
      dmStatuses.push(`${r.request().method()} ${u.split('?')[0]} -> ${r.status()}`)
    }
  })

  // 1) 매핑 관리화면(신규) — 목록에 QA 매핑 노출
  await page.goto(`${BASE_URL}/#/accounting/deposit-mappings`)
  await expect(page.getByRole('heading', { name: '입금자명 매핑', exact: true })).toBeVisible({ timeout: 30_000 })
  const row = page.getByTestId(`depositor-mapping-row-${normalized}`)
  await expect(row, '생성한 QA 매핑 행이 목록에 보이지 않음').toBeVisible({ timeout: 15_000 })
  await capture(page, 'depositor-mapping-list')

  // 2) 이력 모달 — 거래처 변경(A→B)·사유가 보여야 함(fix 실증)
  await row.getByRole('button', { name: '이력' }).click()
  await expect(page.getByRole('heading', { name: '입금자명 매핑 이력' })).toBeVisible({ timeout: 15_000 })
  // partnerCode 변경값(B)이 이력 모달 어딘가에 노출(구버전은 정규화명만)
  if (B !== A) {
    await expect(page.getByText(B, { exact: false }).first(), `이력 모달에 거래처코드 ${B} 미노출`).toBeVisible({ timeout: 10_000 })
  }
  await page.waitForTimeout(600)
  await capture(page, 'depositor-mapping-history')
  // 모달 닫기(Escape)
  await page.keyboard.press('Escape')

  // 3) 생성 모달(폼) — 입력 필드 렌더 + 애니메이션 정착 후 캡처
  await page.getByTestId('depositor-mapping-create').click()
  await expect(page.getByRole('heading', { name: '입금자명 매핑 등록' })).toBeVisible({ timeout: 10_000 })
  await expect(page.getByTestId('depositor-mapping-raw-name')).toBeVisible({ timeout: 5_000 })
  await page.waitForTimeout(500)
  await capture(page, 'depositor-mapping-create-modal')
  await page.keyboard.press('Escape')

  // 4) 입출금내역 — 매칭근거 배지(V57 backfill=수동 실데이터). 배지 테이블로 스크롤 후 캡처
  await page.goto(`${BASE_URL}/#/accounting/bank-transactions`)
  const badge = page.getByText(/수동|자동·입금자명|자동·코드일치/).first()
  await expect(badge, '매칭근거 배지 미렌더').toBeVisible({ timeout: 30_000 })
  await badge.scrollIntoViewIfNeeded()
  await page.waitForTimeout(400)
  await capture(page, 'bank-transaction-badges')

  console.log('[API STATUSES]\n' + dmStatuses.join('\n'))
  // 회귀 가드: 매핑 API·거래 API 모두 200 관측
  expect(dmStatuses.some((s) => s.includes('/accounting/deposit-mappings') && s.endsWith('-> 200')), 'deposit-mappings GET 200 미관측').toBeTruthy()
})
