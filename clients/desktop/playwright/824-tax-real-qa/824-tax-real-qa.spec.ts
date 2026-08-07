import { resolveQaCredential } from '../../../../scripts/lib/qa-credentials.cjs'
import { resolveQaShotsDir } from '../support/qa-screenshot-dir'
/**
 * #824 품목행 공급가액·부가세 — 라이브 QA (PM 직접 수행)
 *
 * `*-real-qa.spec.ts` 규칙으로 mock CI 에서 제외된다.
 * 실서버(게이트웨이 :8080) + 실 렌더러(HashRouter) 대상.
 * throwaway 전표만 사용하고 종료 시 정리한다(공유 실데이터 무변경).
 */
import { expect, test } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5192'
const API_BASE = process.env['API_BASE'] ?? 'http://localhost:8080'
const PASSWORD = resolveQaCredential('QA_DEV_DEFAULT_PASSWORD')
const SHOT_DIR = resolveQaShotsDir(join(process.cwd(), '..', '..', 'docs', 'qa', '824-tax-live-qa-2026-07-22'))
const MARK = 'PMLIVEQA-824-20260722'

/** BE 계약: S = trunc(T / 1.1) · V = T − S (부가가치세법 기준 · 절사) */
const expectSupply = (total: number) => Math.trunc(total / 1.1)

test.use({ viewport: { width: 1600, height: 1000 } })

test('#824 라이브QA — BE 절사 · 화면=저장값 · 수량 폭증 없음 · 자릿수 가드', async ({ page }) => {
  mkdirSync(SHOT_DIR, { recursive: true })
  const shot = async (n: string) => { await page.screenshot({ path: join(SHOT_DIR, `${n}.png`), fullPage: true }) }

  // 🔑 dev_master 는 이 로컬 DB 에서 account_page_permissions 가 0행이라
  // sales.slip.create(CREATE) 가 403 이다(시드 공백 — #824 결함 아님).
  // 권한 DB 를 쓰지 않고, 해당 권한을 실제로 보유한 dev_sales 로 QA 한다.
  const login = await page.request.post(`${API_BASE}/api/auth/login`, {
    data: { loginId: 'dev_sales', password: PASSWORD },
  })
  expect(login.ok(), `로그인 실패: HTTP ${login.status()}`).toBeTruthy()
  const d = (await login.json()).data ?? {}
  const auth = { Authorization: `Bearer ${d.token}` }
  await page.addInitScript((v: { token: string; userId: string; role: string; fullName: string }) => {
    Object.defineProperty(window, 'samhanAuth', {
      configurable: true,
      value: { getToken: async () => ({ ...v, partnerCode: null }), setToken: async () => undefined, clearToken: async () => undefined },
    })
  }, { token: d.token ?? '', userId: d.userId ?? '', role: d.role ?? 'MASTER', fullName: d.displayName ?? '개발책임자' })

  // ── 픽스처: 기존 DRAFT 에서 참조만 읽는다(쓰기 없음) ─────────────
  const list = await page.request.get(`${API_BASE}/api/slips?page=0&size=50`, { headers: auth })
  expect(list.ok(), `전표 목록 실패: HTTP ${list.status()}`).toBeTruthy()
  const src = ((await list.json()).data?.content ?? []).find((s: { status: string; partnerId?: string }) => s.status === 'DRAFT' && s.partnerId)
  expect(src, '참조용 DRAFT 전표를 찾지 못함').toBeTruthy()
  const srcDetail = await page.request.get(`${API_BASE}/api/slips/${src.id}`, { headers: auth })
  const productId = ((await srcDetail.json()).data?.lines ?? [])[0]?.productId
  expect(productId, '참조용 productId 없음').toBeTruthy()

  let slipId = ''
  try {
    // ── 생성 ─────────────────────────────────────────────────────
    const created = await page.request.post(`${API_BASE}/api/slips`, {
      headers: auth,
      data: {
        slipType: 'OUTBOUND',
        slipDate: new Date().toISOString().slice(0, 10),
        partnerId: src.partnerId,
        partnerName: src.partnerName,
        sourceWarehouseId: src.sourceWarehouseId,
        memo: `${MARK} throwaway`,
        // 생성 시 라인 필수(`lines: must not be empty`).
        // PRICE 경로 검증값 — S/V/T 를 보내지 않아 BE 가 직접 분해한다.
        lines: [{ productId, productName: 'PMQA 절사검증', quantity: 2, unitPrice: 7900, priceVatInclusive: true }],
      },
    })
    expect(created.ok(), `전표 생성 실패: HTTP ${created.status()} ${await created.text()}`).toBeTruthy()
    slipId = (await created.json()).data.id

    // ── A. BE 절사 확증 (PRICE 경로 · S/V/T 미전송) ───────────────
    await test.step('A BE 절사 (단가 7,900 VAT포함)', async () => {
      const got = await page.request.get(`${API_BASE}/api/slips/${slipId}`, { headers: auth })
      const line = ((await got.json()).data?.lines ?? []).at(-1)
      const S = Number(line.supplyAmount)
      const V = Number(line.vatAmount)
      const T = S + V
      console.log(`[A] supply=${S} vat=${V} total=${T} unitPriceWithVat=${line.unitPriceWithVat}`)
      // 항등식 + 절사 계약
      expect(S + V, 'S+V=T 항등식 위반').toBe(T)
      expect(S, `절사 위반 — trunc(${T}/1.1) 기대`).toBe(expectSupply(T))
    })

    // ── B. 화면 = 저장값 (BLOCKING-2) ────────────────────────────
    await test.step('B 화면=저장값', async () => {
      await page.goto(`${BASE_URL}/#/sales/${slipId}`)
      await page.waitForLoadState('domcontentloaded')
      await expect(page.getByText('PMQA 절사검증').first()).toBeVisible({ timeout: 30000 })
      await shot('B-전표상세-저장값')

      const got = await page.request.get(`${API_BASE}/api/slips/${slipId}`, { headers: auth })
      const line = ((await got.json()).data?.lines ?? []).at(-1)
      const S = Number(line.supplyAmount)
      const body = await page.locator('body').innerText()
      const fmt = S.toLocaleString('ko-KR')
      console.log(`[B] 저장 공급가액=${S} (표시형 ${fmt})`)
      expect(body.includes(fmt) || body.includes(String(S)), `BLOCKING-2 — 화면에 저장 공급가액 ${fmt} 미표시`).toBeTruthy()
    })

    // ── C. 자릿수 가드 (MED-4) — 500 아닌 400 ───────────────────
    await test.step('C 자릿수 가드', async () => {
      const huge = await page.request.post(`${API_BASE}/api/slips/${slipId}/lines`, {
        headers: auth,
        data: { productId, productName: 'PMQA 자릿수', quantity: 1, unitPrice: '1E+17', priceVatInclusive: false },
      })
      console.log(`[C] 1E+17 → HTTP ${huge.status()}`)
      expect(huge.status(), `MED-4 — 1E+17 이 500(서버오류)으로 처리됨`).not.toBe(500)
      expect(huge.status(), `MED-4 — 거절되지 않고 통과함`).toBeGreaterThanOrEqual(400)
    })
  } finally {
    if (slipId) {
      const del = await page.request.delete(`${API_BASE}/api/slips/${slipId}`, { headers: auth })
      console.log(`[cleanup] delete ${slipId} → HTTP ${del.status()}`)
    }
  }
})
