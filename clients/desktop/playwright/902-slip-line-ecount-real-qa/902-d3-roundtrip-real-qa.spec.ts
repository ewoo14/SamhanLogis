/**
 * PR #926 (#902) D-3 라이브 왕복 실증 — 개발책임자 정책(2026-07-25) 저장→재조회 실측.
 *
 *   사용자가 입력    재계산        유지
 *   단가             공급가액·부가세  —
 *   공급가액         합계만          부가세·단가
 *   부가세           합계만          공급가액·단가
 *   합계             (편집 불가)     —
 *
 * 🔑 개발책임자 결정: 입력한 단가를 보존한다 — 저장→상세 재조회에서 단가가
 *    입력값(11,000) 그대로여야 한다(D-3 fix 이전 버그: 25,000/26,000 로 역산됨).
 *
 * 실서버 전용(mock OFF). 실 전표를 1건 생성하고 끝나면 soft-delete 로 정리한다
 * (throwaway — 거래처/품목/창고 마스터에는 쓰지 않는다, 기존 활성 레코드를 조회만 한다).
 *
 * 🚫 이 스펙은 CI 대상이 아니다(디렉토리+파일명 모두 `-real-qa` opt-out 컨벤션).
 */
import { expect, test, type Page } from '@playwright/test'
import * as path from 'path'
import { execSync } from 'child_process'
import { fileURLToPath } from 'url'
import { resolveQaShotsDir } from '../support/qa-screenshot-dir'

const _dirname =
  typeof __dirname !== 'undefined' ? __dirname : path.dirname(fileURLToPath(import.meta.url))
const BASE_URL = process.env['QA_BASE_URL'] ?? 'http://127.0.0.1:5252'
const API_BASE = process.env['API_BASE'] ?? 'http://localhost:8080'
const PASSWORD = process.env['DEV_PASSWORD'] ?? 'dev_p05_pass!'
// 기본값은 커밋된 docs/qa/902-slip-line-ecount/ 가 아니라 그 밑 _local/ (gitignore 대상) —
// 이 스펙을 다음 라운드에 다시 돌려도 오늘 캡처한 확정 증거(08~12번)를 덮어쓰지 않는다.
// 오늘처럼 "이 캡처를 PR 확정 증거로 승격한다"는 의도적 결정은 QA_SHOTS_DIR 환경변수로
// docs/qa/902-slip-line-ecount 를 직접 지정해 opt-in 한다(파일명은 08~12 신규라 01~07 과 무충돌).
const SHOTS = resolveQaShotsDir(path.resolve(_dirname, '../../../../docs/qa/902-slip-line-ecount'))

// 실 DB 조회(살아있음 확인됨, 2026-07-25 curl 실측) — 거래처/품목 마스터에는 쓰지 않고 조회만 한다.
const PARTNER_QUERY = '부산냉난방'
const PARTNER_EXPECTED_NAME = '부산냉난방테크'
const PRODUCT_QUERY = 'AR09TXEAAWKNEU'

function psql(sql: string, db = 'slip_db'): string {
  return execSync(`docker exec samhan-postgres psql -U samhan -d ${db} -t -A -c "${sql.replace(/"/g, '\\"')}"`, {
    encoding: 'utf-8',
  }).trim()
}

function activeSlipCount(): number {
  return Number(psql('SELECT COUNT(*) FROM slips WHERE is_deleted=false'))
}

async function capture(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: false })
  // eslint-disable-next-line no-console
  console.log(`[캡처] ${name}.png → ${SHOTS}`)
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

/** 셀 값 읽기 — input/textarea 면 inputValue, 읽기전용(합계 등 non-input) 이면 innerText. */
async function readCell(locator: ReturnType<Page['getByLabel']>): Promise<string> {
  try {
    return await locator.inputValue()
  } catch {
    return (await locator.innerText()).trim()
  }
}

/** AsyncAutocomplete 계열(거래처/품목/창고 공용) 자동완성 확정 — 실 키보드(ArrowDown+Enter). */
async function pickAutocomplete(page: Page, input: ReturnType<Page['getByLabel']>, query: string): Promise<void> {
  await input.scrollIntoViewIfNeeded()
  await input.click()
  if (query) await input.fill(query)
  const options = page.locator('[role="listbox"] li[id^="ds-aac-list-"], [role="listbox"] li[id^="ds-wh-list-"]')
  await expect(options.first(), `자동완성 후보 미표시(query="${query}")`).toBeVisible({ timeout: 20000 })
  await input.press('ArrowDown')
  await input.press('Enter')
  await expect(options.first(), `자동완성 확정 실패(드롭다운 잔류, query="${query}")`).toBeHidden({ timeout: 10000 })
  await page.waitForTimeout(300)
}

test.describe.serial('#902 D-3 라이브 왕복 — 단가 보존 정책 실증', () => {
  let slipId = ''
  let beforeCount = -1
  let afterCreateCount = -1

  test('D-3 왕복 — 생성→화면 확인→저장→상세/수정 재열기 단가 보존', async ({ page }) => {
    test.setTimeout(120_000)

    // ── 0. 사전 — 정리 증명용 활성 전표 건수(생성 전) ──────────────────────────
    beforeCount = activeSlipCount()
    // eslint-disable-next-line no-console
    console.log(`[0. 사전] 활성 전표(is_deleted=false) 건수 = ${beforeCount}`)

    // ── 로그인 ──────────────────────────────────────────────────────────────
    // ⚠️ 실측(2026-07-25): dev_master 로 저장 시도 시 403 FORBIDDEN "전표 변경 권한이 없습니다"
    // (auth_db 상 "마스터" 그룹에 전표 저장 권한이 없음 — #809 QA 스펙에서도 동일하게 확인된
    // 기존 계정 배선이며 본 슬라이스의 회귀가 아니다). 저장까지 실 왕복을 실증하기 위해
    // 전표 저장 권한이 있는 dev_manager(MANAGER, "매니저" 그룹)로 로그인한다.
    const login = await realLogin(page, 'dev_manager')
    await installAuthStub(page, login)

    // ── 1. /sales/new → 거래처/창고/품목 선택 → 수량 2 · 단가 11,000 ─────────
    await page.goto(`${BASE_URL}/sales/new`)
    const partnerInput = page.getByRole('combobox', { name: '거래처' })
    await expect(partnerInput, '거래처 자동완성 입력란 미표시').toBeVisible({ timeout: 30000 })
    await pickAutocomplete(page, partnerInput, PARTNER_QUERY)
    const partnerNameField = page.getByLabel('거래처명')
    if (await partnerNameField.count() > 0) {
      await expect(partnerNameField, '거래처 선택 반영 실패').toHaveValue(PARTNER_EXPECTED_NAME, { timeout: 15000 })
    }

    const warehouseInput = page.getByRole('combobox', { name: '출고 창고' })
    if (await warehouseInput.count() > 0) {
      await pickAutocomplete(page, warehouseInput, '')
    } else {
      // eslint-disable-next-line no-console
      console.log('[1. 창고] "출고 창고" 콤보박스 미발견 — 이 화면에서는 선택 불필요/자동으로 판단하고 계속 진행')
    }

    const productInput = page.getByLabel('라인 1 품목')
    await expect(productInput, '라인 1 품목 자동완성 입력란 미표시').toBeVisible({ timeout: 20000 })
    await pickAutocomplete(page, productInput, PRODUCT_QUERY)

    const qty = page.getByLabel('라인 1 수량')
    await qty.fill('2')
    await page.waitForTimeout(400)
    const price = page.getByLabel('라인 1 단가', { exact: true })
    await price.fill('11000')
    await page.waitForTimeout(600)

    const supplyBefore = await page.getByLabel('라인 1 공급가액', { exact: true }).inputValue()
    const vatBefore = await page.getByLabel('라인 1 부가세', { exact: true }).inputValue()
    const totalBefore = await readCell(page.getByLabel('라인 1 합계(VAT포함)', { exact: true }))
    // eslint-disable-next-line no-console
    console.log(`[1. 단가입력 직후] 단가=${await price.inputValue()} 공급가액=${supplyBefore} 부가세=${vatBefore} 합계=${totalBefore}`)

    // ── 2. 공급가액을 50,000 으로 변경 ───────────────────────────────────────
    const supply = page.getByLabel('라인 1 공급가액', { exact: true })
    await supply.fill('50000')
    await page.waitForTimeout(600)

    // ── 3. 화면 = 단가 11,000 / 공급가액 50,000 / 부가세 ? / 합계 ? ─────────
    const priceAfter = await price.inputValue()
    const supplyAfter = await supply.inputValue()
    const vatAfter = await page.getByLabel('라인 1 부가세', { exact: true }).inputValue()
    const rowTotalAfter = await readCell(page.getByLabel('라인 1 합계(VAT포함)', { exact: true }))
    const beforeNoOpResave = {
      unitPrice: priceAfter.replace(/[^0-9]/g, ''),
      supply: supplyAfter.replace(/[^0-9]/g, ''),
      vat: vatAfter.replace(/[^0-9]/g, ''),
      total: rowTotalAfter.replace(/[^0-9]/g, ''),
    }
    // eslint-disable-next-line no-console
    console.log(`[3. 공급가액 50,000 변경 후] 단가=${priceAfter} 공급가액=${supplyAfter} 부가세=${vatAfter} 행합계=${rowTotalAfter}`)
    // eslint-disable-next-line no-console
    console.log(`[E-2 1단계 저장 직전] 단가=${beforeNoOpResave.unitPrice} 공급가액=${beforeNoOpResave.supply} 부가세=${beforeNoOpResave.vat} 합계=${beforeNoOpResave.total}`)

    // 화면(스크래치, gitignore) + 확정 증거(신규 파일명, 커밋 대상) 둘 다 캡처.
    await capture(page, '08-d3-row-after-supply-edit')

    // soft — 여기서 실패해도 아래 저장/재열기(D-3 핵심 관측)까지는 계속 진행한다.
    expect.soft(priceAfter, '공급가액 편집이 단가를 역산하면 안 된다').toBe('11,000')
    expect.soft(supplyAfter, '공급가액 입력값이 화면에 남아야 한다').toBe('50,000')

    // ── 4. 🔑 하단 합계도 행 합계와 같은 숫자를 보여주는가 (D-1 fix) ────────
    const totalsBarText = (await page.locator('.sfp-totals').innerText()).replace(/\s+/g, ' ')
    // eslint-disable-next-line no-console
    console.log(`[4. 하단 합계 바] "${totalsBarText}"`)
    await capture(page, '09-d3-bottom-totals-bar')

    const grandTotalText = await page.locator('.sfp-totals-item--strong .sfp-totals-value').innerText()
    const grandTotalDigits = grandTotalText.replace(/[^0-9]/g, '')
    const rowTotalDigits = rowTotalAfter.replace(/[^0-9]/g, '')
    // eslint-disable-next-line no-console
    console.log(`[4. D-1 비교] 하단 합계=${grandTotalDigits} vs 행 합계=${rowTotalDigits}`)
    // soft — D-1 관측은 기록하되, 실패해도 D-3(단가 보존) 관측까지는 계속 진행한다.
    expect.soft(grandTotalDigits, 'D-1: 하단 합계가 행의 합계와 같은 숫자를 보여줘야 한다').toBe(rowTotalDigits)

    // ── 5. 저장 ──────────────────────────────────────────────────────────────
    const responsePromise = page.waitForResponse(
      (response) => response.request().method() === 'POST' && /\/slips(\?|$)/.test(response.url()),
      { timeout: 30000 },
    )
    await page.getByRole('button', { name: '저장' }).click()
    const response = await responsePromise
    expect(response.ok(), `POST /slips 저장 실패: HTTP ${response.status()} ${await response.text().catch(() => '')}`).toBeTruthy()
    const body = await response.json()
    slipId = body?.data?.id ?? ''
    expect(slipId, 'POST /slips 2xx 응답에 신규 slipId 누락').toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    )
    // eslint-disable-next-line no-console
    console.log(`[5. 저장] 성공 — slipId=${slipId}`)
    await page.waitForTimeout(500)
    afterCreateCount = activeSlipCount()
    // eslint-disable-next-line no-console
    console.log(`[5. 저장 후] 활성 전표 건수 = ${afterCreateCount} (사전 ${beforeCount} 대비 +${afterCreateCount - beforeCount})`)

    // ── 6. 저장 성공 캡처 ────────────────────────────────────────────────────
    await page.waitForTimeout(500)
    await capture(page, '10-d3-save-success')

    // ── 6-2. 전표 상세를 다시 열기 → 🔑 단가가 11,000 인지 확인 ──────────────
    await page.goto(`${BASE_URL}/sales/${slipId}`)
    await expect(page.locator('td.col-price').first(), '상세 화면 단가 열 미표시').toBeVisible({ timeout: 20000 })
    await page.locator('td.col-price').first().scrollIntoViewIfNeeded()
    await page.waitForTimeout(500)
    const detailPriceText = await page.locator('td.col-price').first().innerText()
    // eslint-disable-next-line no-console
    console.log(`[6-2. 상세 재열기] 단가 열 표시값 = "${detailPriceText}" (기대: 11,000 — 25,000/26,000 이면 D-3 회귀)`)
    await capture(page, '11-d3-detail-reopen-price')
    // soft — 관측값을 최종 리포트에 pass/fail 로 남기되, 실패해도 수정 화면 확인까지 계속 진행한다.
    expect.soft(detailPriceText.replace(/[^0-9]/g, ''), '🔑 D-3: 상세 재열기 단가가 입력값(11,000)과 같아야 한다').toBe('11000')

    // ── 7. 수정 화면도 열어 단가 확인 ────────────────────────────────────────
    const editBtn = page.getByTestId('sales-slip-edit-button')
    await expect(editBtn, 'E-2 무수정 재저장을 위해 매출 전표 수정 버튼이 필요하다').toHaveCount(1)
    await editBtn.click()
    const editSection = page.getByTestId('sales-slip-edit-modal')
    await expect(editSection, '매출 전표 수정 인라인 영역 미표시').toBeVisible({ timeout: 15000 })
    const editPriceField = page.getByLabel(/^단가\(VAT(?:제외|포함)\) 1$/)
    await expect(editPriceField, '수정 화면 단가 입력란 미표시').toBeVisible({ timeout: 15000 })
    await page.waitForTimeout(400)
    const editPriceValue = await editPriceField.inputValue()
    const editPriceLabel = await editPriceField.getAttribute('aria-label')
    const editSupplyValue = await editSection.getByLabel('공급가액 1', { exact: true }).inputValue()
    const editVatValue = await editSection.getByLabel('부가세 1', { exact: true }).inputValue()
    const editTotalValue = await editSection.getByLabel('합계(VAT포함) 1', { exact: true }).inputValue()
    // eslint-disable-next-line no-console
    console.log(`[7. 수정 화면] 라벨=${editPriceLabel} 단가=${editPriceValue} 공급가액=${editSupplyValue} 부가세=${editVatValue} 합계=${editTotalValue}`)
    await capture(page, '12-d3-edit-form-price')
    expect.soft(editPriceLabel, '🔑 E-2: authoritative 입력 단가는 수정 화면에서도 VAT 포함으로 설명해야 한다').toBe('단가(VAT포함) 1')
    expect.soft(editPriceValue.replace(/[^0-9]/g, ''), '🔑 D-3: 수정 화면 단가도 입력값(11,000)과 같아야 한다').toBe('11000')

    // ── 7-2. 아무것도 바꾸지 않고 다시 저장 → 금액 네 값 무손실 확인 ─────
    const resaveResponsePromise = page.waitForResponse(
      (response) => response.request().method() === 'PUT' && new RegExp(`/slips/${slipId}/sales(?:\\?|$)`).test(response.url()),
      { timeout: 30000 },
    )
    await editSection.getByRole('button', { name: '저장', exact: true }).click()
    const resaveResponse = await resaveResponsePromise
    expect(resaveResponse.ok(), `E-2 무수정 재저장 실패: HTTP ${resaveResponse.status()} ${await resaveResponse.text().catch(() => '')}`).toBeTruthy()

    await page.goto(`${BASE_URL}/sales/${slipId}`)
    await expect(page.locator('td.col-price').first(), 'E-2 재저장 후 상세 단가 열 미표시').toBeVisible({ timeout: 20000 })
    await page.waitForTimeout(500)
    const afterNoOpResave = {
      unitPrice: (await page.locator('td.col-price').first().innerText()).replace(/[^0-9]/g, ''),
      supply: (await page.locator('td.col-supply').first().innerText()).replace(/[^0-9]/g, ''),
      vat: (await page.locator('td.col-vat').first().innerText()).replace(/[^0-9]/g, ''),
      total: (await page.locator('td.col-total').first().innerText()).replace(/[^0-9]/g, ''),
    }
    // eslint-disable-next-line no-console
    console.log(`[E-2 4단계 무수정 재저장 후] 단가=${afterNoOpResave.unitPrice} 공급가액=${afterNoOpResave.supply} 부가세=${afterNoOpResave.vat} 합계=${afterNoOpResave.total}`)
    expect(afterNoOpResave, '🔑 E-2/Q3: 아무것도 바꾸지 않은 재저장 후 네 금액이 보존되어야 한다').toEqual(beforeNoOpResave)
  })

  test.afterAll(async () => {
    // ── 8. 정리 — throwaway 전표 soft-delete + 건수 원복 증명 ────────────────
    if (!slipId) {
      // eslint-disable-next-line no-console
      console.warn('[정리] slipId 미확보 — 생성 자체가 실패했을 가능성. 정리할 대상 없음.')
      return
    }
    psql(
      `UPDATE slips SET is_deleted=true, deleted_at=CURRENT_TIMESTAMP, deleted_by='qa-d3-liveqa-cleanup'
       WHERE id='${slipId}' AND is_deleted=false`.replace(/\s+/g, ' '),
    )
    const afterCleanupCount = activeSlipCount()
    // eslint-disable-next-line no-console
    console.log(
      `[8. 정리] slipId=${slipId} soft-delete 완료. 활성 전표 건수: 사전=${beforeCount} → 생성직후=${afterCreateCount} → 정리후=${afterCleanupCount}`,
    )
    if (afterCleanupCount !== beforeCount) {
      // eslint-disable-next-line no-console
      console.error(`[8. 정리 실패 의심] 정리 후 건수(${afterCleanupCount})가 사전 건수(${beforeCount})와 다릅니다 — 수동 확인 필요.`)
    }
  })
})
