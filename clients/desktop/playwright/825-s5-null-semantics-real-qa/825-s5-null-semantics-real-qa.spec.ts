/**
 * #825 슬5 null-semantics('전체' vs '미선택' 분리) — 실서버 라이브 QA (FABLE5 적대검증 차원F R1).
 *
 * 실 게이트웨이 :8080 · mock OFF · 실 로그인(dev_master) · 합성/fixture 캡처 없음(전부 실 DOM).
 * 세 도메인: 일마감(/accounting/daily-closings) · 안전재고(/inventory/safety-stock-alerts) ·
 * CODEF 가져오기 범위(/accounting/bank-transactions).
 *
 * 시나리오(각 단계 실캡처 → docs/qa/825-s5-r1-liveqa/):
 *  1) 칩 0개 = 저장/실행 잠금 + 안내 문구
 *  2) '전체'(ALL) 명시 후 정상 동작
 *  3) 개별 선택(SELECTED) 후 정상 동작(선택 범위만 반영)
 *  4) ALL vs SELECTED 고유 출력 차이(같은 화면, presence-only 금지)
 *  5) 화면 전환/복귀 후 범위 상태 stale 여부
 *  6) 모바일 폭(390px) 칩·안내 레이아웃
 *  F1) [결함 증거] '전체' 칩 X 제거 클릭이 칩 onClick 으로 버블 → 해제 불가(트랩) 실증
 *
 * ⚠️ 흐름 순서: SELECTED → 해제 → ALL. (F1 결함으로 ALL 진입 후엔 마우스로 벗어날 수 없어
 *    ALL 을 마지막에 밟는다 — 결함 회피가 아니라 결함을 별도 단계로 실증한 뒤의 우회 경로.)
 *
 * 데이터 안전([[feedback_qa_live_shared_data_readonly]]):
 *  - 안전재고 = 전용 throwaway 품목(QA-825-S5-LIVE, 사전 API 생성)만 사용.
 *  - 일마감 = 불활성 과거일 2020-01-02 + 시드 거래처 참조(거래처 자체는 무변경), 종료 시 역마감.
 *  - CODEF = dev_master 본인 scope 행 + DRY_RUN 고정 목록(외부 호출 0).
 */
import { expect, test, type Page } from '@playwright/test'
import * as path from 'path'
import * as fs from 'fs'
import { fileURLToPath } from 'url'

const _dirname =
  typeof __dirname !== 'undefined' ? __dirname : path.dirname(fileURLToPath(import.meta.url))
const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5281'
const API_BASE = process.env['API_BASE'] ?? 'http://localhost:8080'
const LOGIN_ID = process.env['DEV_LOGIN'] ?? 'dev_master'
const PASSWORD = process.env['DEV_PASSWORD'] ?? 'dev_p05_pass!'
const SHOTS = path.resolve(_dirname, '../../../../docs/qa/825-s5-r1-liveqa')
fs.mkdirSync(SHOTS, { recursive: true })

/** 불활성 과거일 — 세금계산서/전표 0건 확인된 날짜(집계 0 스냅샷). */
const CLOSING_DATE = '2020-01-02'
/** throwaway 품목(사전 API 생성) 모델명 — 드롭다운 옵션 식별자. */
const QA_PRODUCT_MODEL = 'QA-825-S5-LIVE'

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

async function shot(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: true })
}

async function goto(page: Page, route: string): Promise<void> {
  // 이 renderer 번들은 HashRouter — 라우트는 `/#/...` 로 진입해야 실제 페이지가 렌더된다.
  await page.goto(`${BASE_URL}/#${route}`, { waitUntil: 'domcontentloaded' })
  await expect(page.getByText('MASTER').first()).toBeVisible({ timeout: 25000 })
  await page.waitForTimeout(1500)
}

test.describe.serial('#825 슬5 null-semantics — 실서버 라이브 QA', () => {
  test.beforeEach(async ({ page }) => {
    const login = await realLogin(page, LOGIN_ID)
    expect(login.token, '토큰 없음').toBeTruthy()
    await installAuthStub(page, login)
  })

  test('D1 · 일마감 — 칩0 잠금 → SELECTED 실행 → 해제 → ALL 실행 → 차별 출력 → F1 결함 실증 → 리셋 → 역마감', async ({ page }) => {
    await goto(page, '/accounting/daily-closings')

    // S1 — 칩 0개: 실행 버튼 잠금 + 안내 문구
    const hint = page.getByTestId('daily-closing-scope-hint')
    const execBtn = page.getByTestId('daily-closing-exec-button')
    await expect(hint).toBeVisible()
    await expect(hint).toHaveText(/전체로 처리하려면 '전체' 칩을 선택하세요\./)
    await expect(execBtn).toBeDisabled()
    await shot(page, 'd1-s1-chip0-locked-hint')

    // S3 — 개별 거래처(SELECTED) 먼저 실행 (미선택 상태에선 거래처 입력이 활성)
    await page.getByTestId('daily-closing-exec-date').fill(CLOSING_DATE)
    const partnerInput = page.getByTestId('daily-closing-exec-partner')
    await expect(partnerInput).toBeEnabled()
    await partnerInput.fill('서울택배')
    const option = page.getByRole('option').filter({ hasText: '서울택배' }).first()
    await expect(option).toBeVisible({ timeout: 10000 })
    await option.click()
    await expect(page.getByTestId('daily-closing-selected-chip')).toBeVisible()
    await expect(hint).toHaveCount(0)
    await expect(execBtn).toBeEnabled()
    await shot(page, 'd1-s3a-selected-partner-chip-enabled')
    await execBtn.click()
    await page.waitForTimeout(2500)
    await page.getByTestId('daily-closing-filter-date').fill(CLOSING_DATE)
    await page.waitForTimeout(1500)
    const table = page.getByTestId('daily-closing-list-table')
    await expect(table.locator('tbody tr').first()).toBeVisible({ timeout: 10000 })
    await shot(page, 'd1-s3b-selected-closed-row-in-list')

    // SELECTED 칩 X 제거 → 미선택 복귀(개별 칩 제거는 정상 동작함을 확인)
    await page.getByTestId('daily-closing-selected-chip').getByRole('button', { name: /제거/ }).click()
    await expect(hint).toBeVisible()
    await expect(execBtn).toBeDisabled()
    await shot(page, 'd1-s3c-selected-chip-removed-back-to-unset')

    // S2 — '전체'(ALL) 명시 실행: 거래처 입력 비활성(상호 배타) + 실행 성공
    await page.getByTestId('daily-closing-all-chip').click()
    await expect(hint).toHaveCount(0)
    await expect(execBtn).toBeEnabled()
    await expect(partnerInput).toBeDisabled()
    await shot(page, 'd1-s2a-all-chip-enabled-partner-disabled')
    await execBtn.click()
    await page.waitForTimeout(2500)

    // S4 — 같은 화면 목록에서 ALL 행(거래처코드 '—') vs SELECTED 행(사업자번호 숫자) 차별 출력
    await page.getByTestId('daily-closing-filter-date').fill(CLOSING_DATE)
    await page.waitForTimeout(1500)
    const rows = table.locator('tbody tr')
    await expect(rows).toHaveCount(2, { timeout: 10000 })
    const rowTexts = await rows.allInnerTexts()
    const hasAllRow = rowTexts.some((t) => t.includes('—'))
    const hasPartnerRow = rowTexts.some((t) => /\d{6,}/.test(t))
    expect(hasAllRow, `전체 마감 행(거래처코드 —) 미표시: ${JSON.stringify(rowTexts)}`).toBeTruthy()
    expect(hasPartnerRow, `거래처 마감 행(사업자번호) 미표시: ${JSON.stringify(rowTexts)}`).toBeTruthy()
    await shot(page, 'd1-s4-list-all-vs-selected-rows')

    // F1 — [결함 실증] ALL 칩 X 제거 클릭: onRemove(null 셋) 후 클릭이 칩 onClick 으로 버블 →
    //      즉시 ALL 재선택 = 해제 불가. 힌트 미복귀 + 칩 유지 + 실행 버튼 활성 유지가 그 증거.
    await page.getByTestId('daily-closing-all-chip').getByRole('button', { name: '전체 범위 제거' }).click()
    await page.waitForTimeout(800)
    const hintAfterRemove = await hint.count()
    const execEnabledAfterRemove = await execBtn.isEnabled()
    console.log(`[F1-D1] ALL 칩 X 클릭 후 hint=${hintAfterRemove}(기대 1), 실행버튼활성=${execEnabledAfterRemove}(기대 false) — 0/true 면 해제 불가 결함`)
    await shot(page, 'd1-f1-defect-all-chip-remove-noop')
    expect(hintAfterRemove, 'F1 재현 실패 — 결함이 재현되지 않으면 본 단계 재검토').toBe(0)

    // S5 — 화면 전환 후 복귀: 범위 상태가 stale ALL 로 남지 않고 미선택으로 초기화
    await goto(page, '/inventory/safety-stock-alerts')
    await goto(page, '/accounting/daily-closings')
    await expect(page.getByTestId('daily-closing-scope-hint')).toBeVisible()
    await expect(page.getByTestId('daily-closing-exec-button')).toBeDisabled()
    await expect(page.getByTestId('daily-closing-selected-chip')).toHaveCount(0)
    await shot(page, 'd1-s5-revisit-state-reset')

    // 원복 — 두 스냅샷 역마감(잠금 해제). 행 자체는 감사 보존(삭제 API 없음 — 보고서 명기).
    await page.getByTestId('daily-closing-filter-date').fill(CLOSING_DATE)
    await page.waitForTimeout(1500)
    for (let i = 0; i < 2; i += 1) {
      const btn = page.locator('[data-testid^="daily-closing-reverse-button-"]').first()
      if (await btn.count() === 0) break
      await btn.click()
      const confirm = page.getByTestId('daily-closing-reverse-confirm-button')
      await expect(confirm).toBeVisible({ timeout: 5000 })
      await confirm.click()
      await page.waitForTimeout(2000)
    }
    await expect(page.locator('[data-testid^="daily-closing-reverse-button-"]')).toHaveCount(0, { timeout: 10000 })
    await shot(page, 'd1-s6-cleanup-both-reversed')
    console.log('[D1] 일마감 SELECTED→ALL 실행·차별출력·F1 실증·리셋·역마감 완료')
  })

  test('D2 · 안전재고 — 칩0 잠금 → SELECTED 저장 → 해제 → ALL 저장 → 차별 출력 → F1 재확인 → F3 무피드백 → 리셋', async ({ page }) => {
    await goto(page, '/inventory/safety-stock-alerts')

    // S1 — 칩 0개: 저장 잠금 + 안내(제품·임계값을 채워도 잠금 유지)
    const hint = page.getByTestId('safety-stock-scope-hint')
    const saveBtn = page.getByTestId('safety-stock-config-save')
    await expect(hint).toBeVisible()
    await expect(hint).toHaveText(/전체로 처리하려면 '전체' 칩을 선택하세요\./)
    await expect(saveBtn).toBeDisabled()
    await shot(page, 'd2-s1a-chip0-locked-hint')

    // [F2 증거] 제품 드롭다운 — 이름 해석 실패로 모든 옵션이 "제품 코드 미확인 · 제품명 미확인"
    //  (orphan config 1건이 chunk lookup 전체를 실패시키는 pre-existing 부분실패 처리 — 로그 실측)
    const productSelect = page.getByTestId('safety-stock-config-product')
    const optionLabels = await productSelect.locator('option').allInnerTexts()
    console.log(`[F2-D2] 제품 옵션 라벨: ${JSON.stringify(optionLabels)}`)
    // 이름이 전부 미확인이라 라벨 선택 불가 → QA throwaway 품목은 value(productId)로 선택(라벨은 캡처로 증거화)
    await productSelect.selectOption({ value: '1d9e8116-56d1-4f77-9020-c4ebdb1a52ed' })
    await page.getByTestId('safety-stock-config-threshold').fill('3')
    await expect(saveBtn).toBeDisabled()
    await shot(page, 'd2-s1b-product-threshold-filled-still-locked')

    // S3 — 개별 창고(SELECTED) 먼저 저장. QA 품목 행 식별 = 창고명+임계값 셀 정확값(이름 미확인 우회).
    await page.getByTestId('safety-stock-config-warehouse').selectOption({ label: '1호차 차량재고' })
    await expect(hint).toHaveCount(0)
    await expect(saveBtn).toBeEnabled()
    await shot(page, 'd2-s3a-selected-warehouse-enabled')
    await saveBtn.click()
    await page.waitForTimeout(2500)
    const rows = page.getByTestId('safety-stock-table').locator('tbody tr')
    const selRow = rows.filter({ hasText: '1호차 차량재고' }).filter({ has: page.getByText('3', { exact: true }) })
    await expect(selRow.first()).toBeVisible({ timeout: 10000 })
    await shot(page, 'd2-s3b-selected-saved-alert-row')

    // 창고 선택 해제('창고 선택' 복귀) → 미선택 잠금 복귀
    await page.getByTestId('safety-stock-config-warehouse').selectOption({ label: '창고 선택' })
    await expect(hint).toBeVisible()
    await expect(saveBtn).toBeDisabled()
    await shot(page, 'd2-s3c-warehouse-cleared-back-to-unset')

    // S2 — '전체'(ALL): 창고 select 비활성(상호 배타) → 저장 → 알림 행 '전체'
    await page.getByTestId('safety-stock-all-chip').click()
    await expect(hint).toHaveCount(0)
    await expect(page.getByTestId('safety-stock-config-warehouse')).toBeDisabled()
    await page.getByTestId('safety-stock-config-threshold').fill('7')
    await expect(saveBtn).toBeEnabled()
    await shot(page, 'd2-s2a-all-chip-warehouse-disabled')
    await saveBtn.click()
    await page.waitForTimeout(2500)

    // S4 — 같은 표에서 동일 품목의 '전체'(7) vs '1호차 차량재고'(3) vs bootstrap '본사창고'(5) 병립
    const allRow = rows.filter({ hasText: '전체' }).filter({ has: page.getByText('7', { exact: true }) })
    const bootRow = rows.filter({ hasText: '본사창고' }).filter({ has: page.getByText('5', { exact: true }) })
    await expect(allRow.first()).toBeVisible({ timeout: 10000 })
    await expect(selRow.first()).toBeVisible()
    await expect(bootRow.first()).toBeVisible()
    const texts = await rows.allInnerTexts()
    console.log(`[D2] 알림 전체 행 ${texts.length}건: ${JSON.stringify(texts)}`)
    await shot(page, 'd2-s4-alerts-all-vs-selected-rows')

    // F1 — [결함 재확인] ALL 칩 X 제거: 버블 재선택으로 해제 불가(창고 select 비활성 유지)
    await page.getByTestId('safety-stock-all-chip').getByRole('button', { name: '전체 창고 범위 제거' }).click()
    await page.waitForTimeout(800)
    const hintAfterRemove = await hint.count()
    const warehouseDisabled = await page.getByTestId('safety-stock-config-warehouse').isDisabled()
    console.log(`[F1-D2] ALL 칩 X 클릭 후 hint=${hintAfterRemove}(기대 1), 창고select 비활성=${warehouseDisabled}(기대 false) — 0/true 면 해제 불가 결함`)
    await shot(page, 'd2-f1-defect-all-chip-remove-noop')
    expect(hintAfterRemove, 'F1 재현 실패 — 결함이 재현되지 않으면 본 단계 재검토').toBe(0)

    // F3 — [결함 실증] 존재하지 않는 품목(orphan config)의 저장 실패가 무피드백(silent).
    //  configMutation 에 onError 없음 → BE 404 인데 화면 변화 0. (스로우어웨이 write 아님 — 실패 요청)
    const orphanValue = await productSelect.locator('option').evaluateAll((els) =>
      (els as HTMLOptionElement[]).map((e) => e.value).find((v) => v.startsWith('a0a0a0a0')) ?? '')
    if (orphanValue) {
      await productSelect.selectOption({ value: orphanValue })
      await page.getByTestId('safety-stock-config-threshold').fill('9')
      // 직전 F1 로 scopeMode 는 여전히 ALL — 저장 활성 상태
      await expect(saveBtn).toBeEnabled()
      const alertsBefore = await rows.count()
      await saveBtn.click()
      await page.waitForTimeout(2500)
      const alertsAfter = await rows.count()
      const bodyAfter = (await page.locator('body').innerText()) ?? ''
      const hasErrorText = /실패|오류|찾을 수 없/.test(bodyAfter)
      console.log(`[F3-D2] orphan 품목 저장 시도 → 행수 ${alertsBefore}→${alertsAfter}, 에러 문구 표시=${hasErrorText}(기대 true) — false 면 무피드백 결함`)
      await shot(page, 'd2-f3-defect-save-error-silent')
    } else {
      console.log('[F3-D2] orphan 옵션 미발견 — 스킵')
    }

    // S5 — 화면 전환 후 복귀: 설정 폼 미선택 초기화(stale 없음)
    await goto(page, '/accounting/daily-closings')
    await goto(page, '/inventory/safety-stock-alerts')
    await expect(page.getByTestId('safety-stock-scope-hint')).toBeVisible()
    await expect(page.getByTestId('safety-stock-config-save')).toBeDisabled()
    await shot(page, 'd2-s5-revisit-state-reset')
    console.log('[D2] 안전재고 SELECTED→ALL 저장·차별출력·F1 재확인·리셋 완료 (전용 throwaway 품목만 사용)')
  })

  test('D3 · CODEF — 칩0 잠금(구 오해문구 제거) → SELECTED 저장·복원·가져오기 → ALL 저장·가져오기 차별 → 재진입 미선택 확증', async ({ page }) => {
    await goto(page, '/accounting/bank-transactions')

    // S1 — 칩 0개: 저장/가져오기 모두 잠금 + 새 안내. 구 문구("선택 항목이 없으면 현재 범위 전체를 가져옵니다") 부재 확인.
    const hint = page.getByTestId('codef-scope-hint')
    const saveBtn = page.getByTestId('codef-save-scope-button')
    const importBtn = page.getByTestId('codef-import-button')
    await expect(hint).toBeVisible({ timeout: 15000 })
    await expect(hint).toHaveText(/전체로 처리하려면 '전체' 칩을 선택하세요\./)
    await expect(saveBtn).toBeDisabled()
    await expect(importBtn).toBeDisabled()
    const bodyText = (await page.locator('body').innerText()) ?? ''
    expect(bodyText, '구 오해 문구가 여전히 렌더됨').not.toContain('선택 항목이 없으면 현재 범위 전체를 가져옵니다')
    await shot(page, 'd3-s1-chip0-save-import-locked')

    // S3 — SELECTED: 은행계좌 1건 체크 → 저장 → 재진입 시 칩 복원
    const bankCheckbox = page.getByTestId('codef-bank-account-0')
    await expect(bankCheckbox).toBeVisible({ timeout: 15000 })
    await bankCheckbox.check()
    await expect(page.getByTestId('codef-selected-chip').first()).toBeVisible()
    await expect(hint).toHaveCount(0)
    await expect(saveBtn).toBeEnabled()
    await shot(page, 'd3-s3a-selected-one-account-chip')
    await saveBtn.click()
    await expect(page.getByTestId('bank-transaction-toast')).toBeVisible({ timeout: 10000 })
    await page.reload({ waitUntil: 'domcontentloaded' })
    await expect(page.getByText('MASTER').first()).toBeVisible({ timeout: 25000 })
    await page.waitForTimeout(2500)
    await expect(page.getByTestId('codef-selected-chip').first()).toBeVisible({ timeout: 15000 })
    await expect(page.getByTestId('codef-scope-hint')).toHaveCount(0)
    await shot(page, 'd3-s3b-reload-after-selected-restores-chip')

    // SELECTED 가져오기(DRY_RUN, 2020-02 범위): 선택 계좌만 반영된 결과 요약
    await page.getByTestId('codef-import-from').fill('2020-02-01')
    await page.getByTestId('codef-import-to').fill('2020-02-07')
    const importBtnAfter = page.getByTestId('codef-import-button')
    await expect(importBtnAfter).toBeEnabled()
    await importBtnAfter.click()
    const result = page.getByTestId('codef-import-result')
    await expect(result).toBeVisible({ timeout: 20000 })
    const selSummary = (await result.innerText()).replace(/\s+/g, ' ').trim()
    console.log(`[D3] SELECTED 가져오기 요약: ${selSummary}`)
    await shot(page, 'd3-s3c-selected-import-result')

    // S2 — ALL: '전체' 칩 클릭(개별 선택 해제·체크박스 비활성) → 저장
    await page.getByTestId('codef-all-scope-chip').click()
    await expect(page.getByTestId('codef-selected-chip')).toHaveCount(0)
    const firstBankCheckbox = page.getByTestId('codef-bank-account-0')
    await expect(firstBankCheckbox).toBeDisabled()
    await shot(page, 'd3-s2a-all-chip-checkboxes-disabled')
    await page.getByTestId('codef-save-scope-button').click()
    await expect(page.getByTestId('bank-transaction-toast')).toBeVisible({ timeout: 10000 })
    await shot(page, 'd3-s2b-all-scope-saved-toast')

    // F4 — [결함 실증] ALL 저장 직후 가져오기: FE 가 explicit-empty payload 를 보내고 서버는
    //      '저장 선택 사용' 경로로 해석 → 저장 표현이 [](D-S5-01)이라 400
    //      "저장된 가져오기 선택이 비어 있습니다…" 에러 토스트 + 결과 영역은 직전(SELECTED) 요약 stale 유지.
    await page.getByTestId('codef-import-from').fill('2020-01-01')
    await page.getByTestId('codef-import-to').fill('2020-01-07')
    await expect(page.getByTestId('codef-import-button')).toBeEnabled()
    await page.getByTestId('codef-import-button').click()
    await page.waitForTimeout(3000)
    const toastText = ((await page.getByTestId('bank-transaction-toast').innerText().catch(() => '')) ?? '').trim()
    const staleSummary = (await result.innerText()).replace(/\s+/g, ' ').trim()
    console.log(`[F4-D3] ALL 저장 후 가져오기 → 토스트: "${toastText}" · 결과영역: "${staleSummary}" (직전 SELECTED 요약과 동일=stale)`)
    expect(toastText, 'F4 재현 실패 — 에러 토스트가 없으면 재검토').toMatch(/저장된 가져오기 선택이 비어|오류/)
    expect(staleSummary, 'F4 stale 증거 — 결과영역이 갱신됐다면 재검토').toBe(selSummary)
    await shot(page, 'd3-f4-defect-all-import-400-stale-result')

    // S2b — ALL 저장 후 재진입: 저장 표현이 [] 유지(D-S5-01)라 복원은 '미선택'으로 나타남(의도 결과 확증 캡처)
    await page.reload({ waitUntil: 'domcontentloaded' })
    await expect(page.getByText('MASTER').first()).toBeVisible({ timeout: 25000 })
    await page.waitForTimeout(2500)
    await expect(page.getByTestId('codef-scope-hint')).toBeVisible({ timeout: 15000 })
    await expect(page.getByTestId('codef-save-scope-button')).toBeDisabled()
    await expect(page.getByTestId('codef-import-button')).toBeDisabled()
    await shot(page, 'd3-s2c-reload-after-all-shows-unset')

    // S4 — [우회 경로] 재진입 후 '전체' 칩만 선택(저장 없이) → 가져오기: refs 미지정 payload →
    //      서버 전수 열거(진짜 ALL). SELECTED(5건)와 다른 고유 출력(계좌 4개+카드+대출) 확증.
    await page.getByTestId('codef-all-scope-chip').click()
    await page.getByTestId('codef-import-from').fill('2020-03-01')
    await page.getByTestId('codef-import-to').fill('2020-03-07')
    const importBtn3 = page.getByTestId('codef-import-button')
    await expect(importBtn3).toBeEnabled()
    await importBtn3.click()
    const result3 = page.getByTestId('codef-import-result')
    await expect(result3).toBeVisible({ timeout: 20000 })
    const allSummary = (await result3.innerText()).replace(/\s+/g, ' ').trim()
    console.log(`[D3] 진짜 ALL(미저장 칩) 가져오기 요약: ${allSummary}`)
    expect(allSummary, 'ALL/SELECTED 가져오기 요약이 동일 — 범위 미반영 의심').not.toBe(selSummary)
    const fetchedMatch = allSummary.match(/조회 ([\d,]+)건/)
    const fetchedAll = fetchedMatch ? Number(fetchedMatch[1].replace(/,/g, '')) : 0
    expect(fetchedAll, `ALL 조회 건수(${fetchedAll})가 SELECTED(5) 이하 — 전수 열거 미동작 의심`).toBeGreaterThan(5)
    await shot(page, 'd3-s4-true-all-import-differs')
    console.log('[D3] CODEF 칩0 잠금·SELECTED 저장/복원/가져오기·F4 실증·진짜 ALL 차별 확증 완료')
  })

  test('D3b · [F4 시각 보강] ALL 저장 직후 가져오기 400 에러 토스트 실캡처(3초 자동소멸 전)', async ({ page }) => {
    await goto(page, '/accounting/bank-transactions')
    await expect(page.getByTestId('codef-scope-hint')).toBeVisible({ timeout: 15000 })
    await page.getByTestId('codef-all-scope-chip').click()
    await page.getByTestId('codef-save-scope-button').click()
    await expect(page.getByTestId('bank-transaction-toast')).toBeVisible({ timeout: 10000 })
    // 성공 토스트 소멸 대기 후 가져오기 → 에러 토스트를 소멸(3s) 전에 캡처
    await page.waitForTimeout(3500)
    await page.getByTestId('codef-import-from').fill('2020-01-01')
    await page.getByTestId('codef-import-to').fill('2020-01-07')
    await page.getByTestId('codef-import-button').click()
    const toast = page.getByTestId('bank-transaction-toast')
    await expect(toast).toBeVisible({ timeout: 8000 })
    await expect(toast).toContainText('저장된 가져오기 선택이 비어 있습니다')
    await shot(page, 'd3-f4b-error-toast-visible')
    console.log(`[F4-D3b] 에러 토스트 실캡처: ${(await toast.innerText()).trim()}`)
  })

  test('D6 · 모바일 390px — 세 화면 칩·안내 레이아웃', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await goto(page, '/accounting/daily-closings')
    await expect(page.getByTestId('daily-closing-scope-hint')).toBeVisible()
    await shot(page, 'd6-s1-mobile-daily-closing-chip0')
    await goto(page, '/inventory/safety-stock-alerts')
    await expect(page.getByTestId('safety-stock-scope-hint')).toBeVisible()
    await shot(page, 'd6-s2-mobile-safety-stock-chip0')
    await goto(page, '/accounting/bank-transactions')
    await expect(page.getByTestId('codef-scope-hint')).toBeVisible({ timeout: 15000 })
    await shot(page, 'd6-s3-mobile-codef-chip0')
    console.log('[D6] 모바일 390px 칩0 레이아웃 캡처 완료')
  })
})
