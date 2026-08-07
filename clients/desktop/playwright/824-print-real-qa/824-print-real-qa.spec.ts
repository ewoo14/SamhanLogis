import { resolveQaShotsDir } from '../support/qa-screenshot-dir'
/**
 * #824 R2 — 인쇄 경로 라이브 GUI QA (PM 직접 수행)
 *
 * SOL R2 도달가능 #5·#6 이 실서버에서 해소됐는지 확인한다.
 *   #5 매출 계산서 인쇄가 저장된 공급가액/부가세를 그대로 쓰는가
 *      (lineTotal + vatFromSupply() 재계산 금지)
 *   #6 거래명세서 일괄 인쇄가 사용자가 실제 선택·조회한 데이터를 출력하는가
 *      (정적 MOCK_DATA 출력 금지)
 *
 * 🚨 계정 = dev_accountant.
 *    dev_sales 는 accounting.statement-batch 권한이 없어 PermissionGuard 가 대시보드로
 *    돌려보낸다. 그 상태에서 "목업 흔적 없음" 을 단언하면 페이지가 뜨지도 않은 채
 *    공허하게 통과한다(1차 시도에서 실제로 발생). 그래서 모든 부재 단언 앞에
 *    "화면이 실제로 렌더됐다" 는 양성 단언을 먼저 둔다.
 *
 * `*-real-qa.spec.ts` 규칙으로 mock CI 에서 제외된다.
 */
import { expect, test } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5192'
const API_BASE = process.env['API_BASE'] ?? 'http://localhost:8080'
const PASSWORD = process.env['DEV_PASSWORD'] ?? (process.env.DEV_PASSWORD ?? '')
const SHOT_DIR = resolveQaShotsDir(join(process.cwd(), '..', '..', 'docs', 'qa', '824-print-live-qa-2026-07-23'))

const PRODUCT_LABEL = 'PMQA 인쇄-비표준VAT'

test.use({ viewport: { width: 1400, height: 1400 } })

test('R2 #5·#6 — 인쇄물이 저장값을 쓰고 실제 선택을 출력한다', async ({ page }) => {
  mkdirSync(SHOT_DIR, { recursive: true })
  const shot = async (n: string) => { await page.screenshot({ path: join(SHOT_DIR, `${n}.png`), fullPage: true }) }

  // 🔑 권한이 나뉘어 있어 계정을 둘 쓴다.
  //    dev_sales      — 전표 생성·조회·매출 인쇄 (accounting.statement-batch 없음)
  //    dev_accountant — accounting.statement-batch view/print (전표 목록 권한 없음)
  const asUser = async (loginId: string) => {
    const r = await page.request.post(`${API_BASE}/api/auth/login`, { data: { loginId, password: PASSWORD } })
    expect(r.ok(), `${loginId} 실서버 로그인 실패: HTTP ${r.status()}`).toBeTruthy()
    const v = (await r.json()).data ?? {}
    return {
      headers: { Authorization: `Bearer ${v.token}`, 'X-User-Id': v.userId, 'X-User-Role': v.role ?? 'MASTER' },
      init: { token: v.token ?? '', userId: v.userId ?? '', role: v.role ?? 'MASTER', fullName: v.displayName ?? loginId },
    }
  }
  const applyBrowserAuth = async (init: { token: string; userId: string; role: string; fullName: string }) => {
    await page.addInitScript((x: { token: string; userId: string; role: string; fullName: string }) => {
      Object.defineProperty(window, 'samhanAuth', {
        configurable: true,
        value: { getToken: async () => ({ ...x, partnerCode: null }), setToken: async () => undefined, clearToken: async () => undefined },
      })
    }, init)
  }

  const sales = await asUser('dev_sales')
  const accountant = await asUser('dev_accountant')
  const auth = sales.headers
  await applyBrowserAuth(sales.init)

  // ── 준비: 비표준 부가세를 가진 전표 생성 ─────────────────────────
  let slipId = ''
  let saved = { supply: 0, vat: 0 }
  await test.step('준비 — 비표준 권위 부가세 전표 생성', async () => {
    const list = await page.request.get(`${API_BASE}/api/slips?page=0&size=50`, { headers: auth })
    const src = ((await list.json()).data?.content ?? []).find((s: { status: string; partnerId?: string }) => s.status === 'DRAFT' && s.partnerId)
    expect(src, '참조용 DRAFT 전표 없음').toBeTruthy()
    const srcDetail = await page.request.get(`${API_BASE}/api/slips/${src.id}`, { headers: auth })
    const productId = ((await srcDetail.json()).data?.lines ?? [])[0]?.productId
    expect(productId, '참조용 productId 없음').toBeTruthy()

    // 표준 10% 와 다른 부가세를 명시적으로 저장한다 (S=100000 / V=9999 / T=109999)
    const created = await page.request.post(`${API_BASE}/api/slips`, {
      headers: auth,
      data: {
        slipType: 'OUTBOUND',
        slipDate: new Date().toISOString().slice(0, 10),
        partnerId: src.partnerId,
        partnerName: src.partnerName,
        sourceWarehouseId: src.sourceWarehouseId,
        memo: 'PMQA-824-PRINT throwaway',
        lines: [{
          productId, productName: PRODUCT_LABEL, quantity: 1,
          unitPrice: 100000, supplyAmount: 100000, vatAmount: 9999, lineTotalWithVat: 109999,
        }],
      },
    })
    expect(created.status(), `전표 생성 실패: ${await created.text()}`).toBe(201)
    slipId = (await created.json()).data.id

    const got = await page.request.get(`${API_BASE}/api/slips/${slipId}`, { headers: auth })
    const line = (await got.json()).data.lines[0]
    saved = { supply: Number(line.supplyAmount), vat: Number(line.vatAmount) }
    console.log(`■ 저장값 supply=${saved.supply} vat=${saved.vat}`)
    // 표준 재계산이면 vat = 10000 이 된다 — 그와 달라야 시험이 성립한다
    expect(saved.vat, '비표준 부가세가 저장되지 않아 시험이 성립하지 않는다').not.toBe(Math.trunc(saved.supply * 0.1))
  })

  // ── #5 매출 계산서 인쇄 — 저장 부가세 그대로 ─────────────────────
  await test.step('#5 매출 계산서 인쇄가 저장 부가세를 쓴다', async () => {
    await page.goto(`${BASE_URL}/#/sales/${slipId}/print/invoice`)
    await page.waitForTimeout(3000)
    await shot('P5-매출계산서-인쇄')

    // ① 양성 — 인쇄 화면이 실제로 렌더됐다
    await expect(page.getByText('세 금 계 산 서')).toBeVisible({ timeout: 15000 })

    // ② 요약 박스 3줄만 정확히 본다 (본문 substring 매칭은 합계에도 걸려 false-green 이 된다)
    //    ⚠️ 품목 행은 카탈로그 modelName 을 표시하므로 productName 으로 행을 잡을 수 없다.
    const fmt = (n: number) => n.toLocaleString('ko-KR')
    const box = page.locator('.sales-print-totals-row')
    const rows = (await box.allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim())
    console.log(`■ 요약 박스 = ${JSON.stringify(rows)}`)

    const pick = (label: string) => rows.find((r) => r.startsWith(label)) ?? ''
    // #5 — 세액이 저장값이어야 한다 (재계산이면 10,000)
    expect(pick('세액'), `세액이 저장값 ${fmt(saved.vat)} 이 아니다 — 재계산 의심`).toContain(fmt(saved.vat))
    expect(pick('공급가액'), `공급가액이 저장값 ${fmt(saved.supply)} 이 아니다`).toContain(fmt(saved.supply))
    // 합계금액 = 공급가액 + 세액 (부가가치세법 별지 서식)
    expect(pick('합계금액'), `합계금액이 공급가액+세액(${fmt(saved.supply + saved.vat)}) 이 아니다`)
      .toContain(fmt(saved.supply + saved.vat))
  })

  // ── #6 은 전용 스펙에서 검증한다 ────────────────────────────────
  //  🚨 여기서 하지 않는 이유: addInitScript 는 누적이라 한 페이지 안에서 계정을
  //     바꿔치기할 수 없다(먼저 심은 dev_sales 가 그대로 이겨 PermissionGuard 가
  //     대시보드로 돌려보냈고, 그 상태의 "목업 흔적 없음" 단언은 공허하게 통과한다).
  //     accounting.statement-batch 권한을 가진 dev_accountant 로 처음부터 로그인하는
  //     statement-batch-real-qa.spec.ts 가 #6 을 덮는다.

  // ── 정리 ─────────────────────────────────────────────────────────
  await test.step('QA 잔재 정리', async () => {
    const del = await page.request.delete(`${API_BASE}/api/slips/${slipId}`, { headers: auth })
    console.log(`■ throwaway 전표 정리: HTTP ${del.status()} · slipId=${slipId}`)
  })
})
