import { resolveQaShotsDir } from '../support/qa-screenshot-dir'
/**
 * E2 롤아웃 — 주문 목록 soft-delete / 복원 / 누출차단 적대적 라이브 QA (R2).
 *
 * PR #757. 실서버(게이트웨이 :8080, 프레시 partner-order-service V10 + auth V83) + 실 GUI(:5199, mock OFF).
 * 로그인: dev_master. 대상 주문: 2026/06/08-1983 (DRAFT, 1 라인, 합계 1,560,000).
 *
 * 검증축(적대 가정 = "삭제 주문 누출 또는 복원 깨짐"):
 *  1. soft-delete 목록 표시(취소선+배지+복원버튼) 실 GUI
 *  2. 누출차단: 삭제 주문이 상세/전환/병합/검색-활성행 에 안 새는지 (API 프로브)
 *  3. restore 라인 생존: 복원 후 상세에 라인·수량·금액 살아있는지 (빈 껍데기 아님)
 *  4. 주문번호 취소선 확대 캡처
 *  5. 복원 실 클릭 → 활성 복귀
 */
import { expect, test, type Page } from '@playwright/test'
import * as path from 'path'
import * as fs from 'fs'
import { fileURLToPath } from 'url'

const _dirname =
  typeof __dirname !== 'undefined' ? __dirname : path.dirname(fileURLToPath(import.meta.url))
const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5199'
const API_BASE = process.env['API_BASE'] ?? 'http://localhost:8080'
const PASSWORD = process.env['DEV_PASSWORD'] ?? 'dev_p05_pass!'
const LOGIN_ID = process.env['LOGIN_ID'] ?? 'dev_master'
const ORDER_NO = process.env['ORDER_NO'] ?? '2026/06/08-1983'
const ORDER_PATH = ORDER_NO.replace(/\//g, '-') // 2026-06-08-1983
// 이식성: 대상 주문 합계는 env 로 주입(하드결합 시 시드 정리 후 재실행 불가 — real-qa 이식성 교훈).
const EXPECTED_TOTAL = Number(process.env['EXPECTED_TOTAL'] ?? '1560000')

const SHOTS = resolveQaShotsDir(path.resolve(_dirname, '../../../../docs/qa/e2-rollout-order-list'))
fs.mkdirSync(SHOTS, { recursive: true })

const probe: Record<string, unknown> = { orderNo: ORDER_NO, ts: new Date().toISOString() }

async function capture(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: false })
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

test('E2 주문 soft-delete/복원/누출차단 라이브 실증', async ({ page }) => {
  const login = await realLogin(page, LOGIN_ID)
  await installAuthStub(page, login)
  const H = { Authorization: `Bearer ${login.token}` }

  // ---- PRE: 삭제 전 상세 스냅샷 (라인/수량/금액) ----
  const preRes = await page.request.get(`${API_BASE}/api/v1/partner-orders/${ORDER_PATH}`, { headers: H })
  const preJson = (await preRes.json()).data
  probe['pre'] = { status: preRes.status(), total: preJson?.totalAmount, lines: preJson?.lines?.length, isDeleted: preJson?.isDeleted, lineDetail: preJson?.lines }
  console.log('[PRE-SNAPSHOT]', JSON.stringify(probe['pre']))
  expect(preRes.status(), 'pre 상세 200').toBe(200)
  expect(preJson.isDeleted, 'pre 활성상태').toBeFalsy()
  const preLineCount = preJson.lines?.length ?? 0
  expect(preLineCount, 'pre 라인 존재').toBeGreaterThan(0)

  // ---- 1) GUI: 목록 진입(DRAFT), 대상 주문 활성 렌더 ----
  await page.goto(`${BASE_URL}/#/sales/partner-orders`)
  await page.getByTestId('partner-order-list-keyword-filter').fill(ORDER_NO)
  await expect(page.getByTestId(`partner-order-row-${ORDER_NO}`)).toBeVisible({ timeout: 30_000 })
  await capture(page, 'r2-01-list-active-before-delete')

  // ---- 2) GUI: 상세 진입 → 삭제 ----
  await page.goto(`${BASE_URL}/#/sales/partner-orders/${ORDER_PATH}`)
  await expect(page.getByTestId('partner-order-delete-open')).toBeVisible({ timeout: 30_000 })
  await capture(page, 'r2-02-detail-before-delete')
  await page.getByTestId('partner-order-delete-open').click()
  await expect(page.getByTestId('partner-order-delete-confirm-dialog')).toBeVisible({ timeout: 10_000 })
  await capture(page, 'r2-03-delete-confirm-dialog')
  await page.getByTestId('partner-order-delete-confirm').click()
  // 삭제 성공 시 상세 → 목록 자동 이동
  await page.waitForURL('**/sales/partner-orders', { timeout: 20_000 }).catch(() => undefined)
  await page.waitForTimeout(1500)

  // ---- 3) GUI: 목록에서 삭제행 표시(취소선+배지+복원버튼) ----
  await page.getByTestId('partner-order-list-keyword-filter').fill(ORDER_NO)
  await page.waitForTimeout(1200)
  const deletedRow = page.getByTestId(`partner-order-row-${ORDER_NO}:deleted`)
  await expect(deletedRow, '삭제행 렌더').toBeVisible({ timeout: 20_000 })
  await capture(page, 'r2-04-list-deleted-row')
  // 복원 버튼 존재
  const restoreBtn = page.getByTestId(`partner-order-restore-${ORDER_NO}:deleted`)
  await expect(restoreBtn, '복원 버튼 렌더').toBeVisible()
  // 4) 취소선 확대 캡처 — 주문번호 셀 element 스샷
  const orderCell = deletedRow.locator('td').first()
  await orderCell.screenshot({ path: path.join(SHOTS, 'r2-05-strikethrough-zoom.png') })
  // 삭제행 병합 체크박스 부재(누출차단: 삭제행은 병합전환 선택 불가)
  const mergeCbCount = await page.getByTestId(`merge-checkbox-${ORDER_NO}`).count()
  probe['gui_deletedRowRendered'] = true
  probe['gui_restoreBtnVisible'] = true
  probe['gui_mergeCheckboxOnDeletedRow'] = mergeCbCount

  // ---- 누출차단 API 프로브 (주문이 삭제된 상태) ----
  // (a) 상세 조회 — 삭제 주문은 404 (조회 화면 누출 차단)
  const delDetail = await page.request.get(`${API_BASE}/api/v1/partner-orders/${ORDER_PATH}`, { headers: H })
  probe['leak_detail_status'] = delDetail.status()
  // (b) 목록/검색 — 삭제행은 isDeleted=true 로만 표기(활성행으로 누출되지 않음)
  // R2 fix 신계약: includeDeleted 미지정(기본) = 활성 행만 — 삭제 tombstone 자체가 목록에 없어야 한다.
  const listRes = await page.request.get(`${API_BASE}/api/v1/partner-orders?status=DRAFT&page=0&size=300&searchKeyword=${encodeURIComponent(ORDER_NO)}`, { headers: H })
  const listJson = (await listRes.json()).data
  const matches = (listJson?.content ?? []).filter((r: any) => r.orderNumber === ORDER_NO)
  probe['leak_list_matchCount'] = matches.length
  probe['leak_list_activeCount'] = matches.filter((r: any) => r.isDeleted !== true).length
  probe['leak_list_deletedCount'] = matches.filter((r: any) => r.isDeleted === true).length
  probe['leak_list_row'] = matches[0]
  // 내부 opt-in(includeDeleted=true) = 취소선/복원용 tombstone 행이 삭제 메타데이터와 함께 노출.
  const inclRes = await page.request.get(`${API_BASE}/api/v1/partner-orders?status=DRAFT&page=0&size=300&includeDeleted=true&searchKeyword=${encodeURIComponent(ORDER_NO)}`, { headers: H })
  const inclJson = (await inclRes.json()).data
  const inclMatches = (inclJson?.content ?? []).filter((r: any) => r.orderNumber === ORDER_NO)
  probe['optin_list_deletedCount'] = inclMatches.filter((r: any) => r.isDeleted === true).length
  probe['optin_list_activeCount'] = inclMatches.filter((r: any) => r.isDeleted !== true).length
  probe['optin_list_row'] = inclMatches[0]
  // (c) 단일 전환(convert-to-slip) — 삭제 주문 404 (전표전환 누출 차단)
  const convRes = await page.request.post(`${API_BASE}/api/v1/partner-orders/${ORDER_PATH}/convert-to-slip`, {
    headers: H, data: { warehouseCode: 'HQ-001', items: [{ orderLineId: preJson.lines?.[0]?.lineId ?? '00000000-0000-0000-0000-000000000000', quantity: 1 }] },
  })
  probe['leak_convert_status'] = convRes.status()
  // (d) 병합 전환(merge) — 삭제 주문 포함 시 404
  const mergeRes = await page.request.post(`${API_BASE}/api/v1/partner-orders/convert-to-slip-merge`, {
    headers: H, data: { warehouseCode: 'HQ-001', orders: [{ partnerOrderId: ORDER_PATH, items: [{ orderLineId: preJson.lines?.[0]?.lineId ?? '0', quantity: 1 }] }] },
  })
  probe['leak_merge_status'] = mergeRes.status()
  // (e) print — 삭제 주문 인쇄 누출
  const printRes = await page.request.get(`${API_BASE}/api/v1/partner-orders/${ORDER_PATH}/print`, { headers: H })
  probe['leak_print_status'] = printRes.status()
  console.log('[LEAK-PROBES]', JSON.stringify({
    detail: probe['leak_detail_status'], list_active: probe['leak_list_activeCount'], list_deleted: probe['leak_list_deletedCount'],
    optin_deleted: probe['optin_list_deletedCount'], optin_active: probe['optin_list_activeCount'],
    convert: probe['leak_convert_status'], merge: probe['leak_merge_status'], print: probe['leak_print_status'], mergeCb: probe['gui_mergeCheckboxOnDeletedRow'],
  }))

  // ---- 5) GUI: 복원 실 클릭 → 활성 복귀 ----
  await restoreBtn.click()
  await page.waitForTimeout(2000)
  // 복원 후 활성행 testid(접미사 없음) 로 전환, 복원버튼 사라짐
  await expect(page.getByTestId(`partner-order-row-${ORDER_NO}`), '복원 후 활성행').toBeVisible({ timeout: 20_000 })
  await capture(page, 'r2-06-list-after-restore-active')
  const restoreBtnGone = await page.getByTestId(`partner-order-restore-${ORDER_NO}:deleted`).count()
  probe['gui_restoreBtnGoneAfterRestore'] = restoreBtnGone

  // ---- 6) restore 라인 생존 검증 (상세 재조회 — 빈 껍데기 아님) ----
  const postRes = await page.request.get(`${API_BASE}/api/v1/partner-orders/${ORDER_PATH}`, { headers: H })
  const postJson = (await postRes.json()).data
  probe['post'] = { status: postRes.status(), total: postJson?.totalAmount, lines: postJson?.lines?.length, isDeleted: postJson?.isDeleted, lineDetail: postJson?.lines }
  console.log('[POST-RESTORE]', JSON.stringify(probe['post']))
  // GUI 상세 — 라인/합계 실 렌더 캡처
  await page.goto(`${BASE_URL}/#/sales/partner-orders/${ORDER_PATH}`)
  await expect(page.getByTestId('partner-order-delete-open')).toBeVisible({ timeout: 30_000 })
  await page.waitForTimeout(800)
  await capture(page, 'r2-07-detail-after-restore-lines-survive')

  fs.writeFileSync(path.join(SHOTS, 'r2-leak-probe-results.json'), JSON.stringify(probe, null, 2), 'utf-8')

  // ---- 최종 단언 (적대) ----
  expect(postRes.status(), '복원 후 상세 200').toBe(200)
  expect(postJson.isDeleted, '복원 후 활성').toBeFalsy()
  expect(postJson.lines?.length ?? 0, 'restore 라인 생존(빈 껍데기 아님)').toBe(preLineCount)
  expect(Number(postJson.totalAmount), 'restore 합계 생존').toBe(EXPECTED_TOTAL)
  expect(probe['leak_detail_status'], '삭제 상세 누출차단(404)').toBe(404)
  expect(probe['leak_list_activeCount'], '삭제행 활성 누출 0').toBe(0)
  // R2 fix 신계약: 기본 목록은 tombstone 자체 미노출, 내부 opt-in 만 삭제행 표기.
  expect(probe['leak_list_deletedCount'], '기본 목록 삭제행 미노출(신계약)').toBe(0)
  expect(probe['optin_list_deletedCount'], 'opt-in 목록 삭제행 취소선표기 존재').toBe(1)
  expect(probe['optin_list_activeCount'], 'opt-in 목록 활성 오표기 0').toBe(0)
  expect(probe['leak_convert_status'], '삭제 전환 누출차단').toBeGreaterThanOrEqual(400)
  expect(probe['leak_merge_status'], '삭제 병합 누출차단').toBeGreaterThanOrEqual(400)
  expect(Number(probe['gui_mergeCheckboxOnDeletedRow']), '삭제행 병합체크박스 부재').toBe(0)
  expect(Number(probe['gui_restoreBtnGoneAfterRestore']), '복원 후 복원버튼 사라짐').toBe(0)
})
