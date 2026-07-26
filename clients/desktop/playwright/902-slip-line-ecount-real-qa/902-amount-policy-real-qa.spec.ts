/**
 * PR #926 (#902) 라이브QA — 금액 열 편집 정책 (개발책임자 결정 2026-07-25).
 *
 *   사용자가 입력    재계산        유지
 *   단가             공급가액·부가세  —
 *   공급가액         합계만          부가세·단가
 *   부가세           합계만          공급가액·단가
 *   합계             (편집 불가)     —
 *
 * 재계산의 출발점은 오직 단가 하나이고, 공급가액·부가세는 사용자가 넣은 값이
 * 그대로 보존되며 그 둘의 합이 합계가 된다.
 *
 * 🚨 getByLabel 은 기본이 부분일치라 `라인 1 공급가액` 이 합계 셀의 읽기전용
 *    `라인 1 공급가액/부가세` 까지 잡는다 — 반드시 { exact: true } 를 쓴다.
 *
 * 🚫 저장(POST)은 하지 않는다.
 */
import { expect, test, type Page } from '@playwright/test'
import * as path from 'path'
import { fileURLToPath } from 'url'
import { resolveQaShotsDir } from '../support/qa-screenshot-dir'

const _dirname =
  typeof __dirname !== 'undefined' ? __dirname : path.dirname(fileURLToPath(import.meta.url))
const BASE_URL = process.env['QA_BASE_URL'] ?? 'http://127.0.0.1:5252'
const API_BASE = process.env['API_BASE'] ?? 'http://localhost:8080'
const PASSWORD = process.env['DEV_PASSWORD'] ?? 'dev_p05_pass!'
// 기본값은 커밋된 docs/qa/902-slip-line-ecount/ 가 아니라 그 밑 _local/ (gitignore 대상) —
// 재실행이 커밋된 증거를 덮어쓰지 않는다. QA_SHOTS_DIR 로 의도적 승격만 opt-in.
const SHOTS = resolveQaShotsDir(path.resolve(_dirname, '../../../../docs/qa/902-slip-line-ecount'))

async function login(page: Page): Promise<void> {
  const res = await page.request.post(`${API_BASE}/auth/login`, { data: { loginId: 'dev_master', password: PASSWORD } })
  expect(res.ok(), `로그인 실패: HTTP ${res.status()}`).toBeTruthy()
  const d = (await res.json()).data ?? {}
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
    { tok: d.token ?? '', r: d.role ?? '', uid: d.userId ?? '', name: d.displayName ?? 'dev_master' },
  )
}

const cell = (page: Page, label: string) => page.getByLabel(label, { exact: true }).first()

async function snapshot(page: Page): Promise<string> {
  const read = async (l: string) => {
    const el = cell(page, l)
    if (await el.count() === 0) return '(없음)'
    return await el.inputValue().catch(async () => (await el.innerText()).trim())
  }
  return `단가=${await read('라인 1 단가')} 공급가액=${await read('라인 1 공급가액')} 부가세=${await read('라인 1 부가세')} 합계=${await read('라인 1 합계(VAT포함)')}`
}

test('금액 열 편집 정책 — 재계산의 출발점은 단가 하나뿐이고 합계는 편집 불가', async ({ page }) => {
  await login(page)
  await page.goto(`${BASE_URL}/#/sales/new`)
  await cell(page, '라인 1 수량').waitFor({ state: 'visible', timeout: 30000 })
  await page.waitForTimeout(1500)

  // P1 — 합계는 입력 요소가 아니어야 한다
  const total = cell(page, '라인 1 합계(VAT포함)')
  const totalTag = await total.evaluate((el) => el.tagName.toLowerCase())
  // eslint-disable-next-line no-console
  console.log(`[P1 합계 칸] tag=${totalTag}  ${totalTag === 'input' ? '❌ 편집 가능' : '✅ 편집 불가'}`)
  expect(totalTag, '합계는 편집할 수 없어야 한다(P1)').not.toBe('input')

  // P3 — 단가를 입력하면 공급가액·부가세가 재계산된다
  await cell(page, '라인 1 수량').fill('2')
  await page.waitForTimeout(300)
  await cell(page, '라인 1 단가').fill('11000')
  await page.waitForTimeout(500)
  // eslint-disable-next-line no-console
  console.log(`[P3 단가 11,000 · 수량 2] ${await snapshot(page)}`)

  // P4·P6 — 공급가액을 바꿔도 단가·부가세는 그대로, 합계만 재계산
  await cell(page, '라인 1 공급가액').fill('50000')
  await page.waitForTimeout(500)
  // eslint-disable-next-line no-console
  console.log(`[P4·P6 공급가액 50,000] ${await snapshot(page)}   ← 단가·부가세 유지, 합계만 갱신`)
  expect(await cell(page, '라인 1 단가').inputValue(), '공급가액 편집이 단가를 역산하면 안 된다(P4)').toBe('11,000')
  expect(await cell(page, '라인 1 부가세').inputValue(), '공급가액 편집이 부가세를 바꾸면 안 된다(P6)').toBe('2,000')

  // P4·P6 — 부가세를 바꿔도 단가·공급가액은 그대로, 합계만 재계산
  await cell(page, '라인 1 부가세').fill('7000')
  await page.waitForTimeout(500)
  // eslint-disable-next-line no-console
  console.log(`[P4·P6 부가세 7,000] ${await snapshot(page)}   ← 단가·공급가액 유지, 합계만 갱신`)
  expect(await cell(page, '라인 1 단가').inputValue(), '부가세 편집이 단가를 역산하면 안 된다(P4)').toBe('11,000')
  expect(await cell(page, '라인 1 공급가액').inputValue(), '부가세 편집이 공급가액을 바꾸면 안 된다(P6)').toBe('50,000')

  await page.screenshot({ path: path.join(SHOTS, '07-amount-edit-policy.png'), fullPage: false })
  // eslint-disable-next-line no-console
  console.log('[캡처] 07-amount-edit-policy.png')
})
