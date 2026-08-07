import { resolveQaCredential } from '../../../../scripts/lib/qa-credentials.cjs'
import { resolveQaShotsDir } from '../support/qa-screenshot-dir'
/**
 * #825 슬5 null-semantics('전체' vs '미선택' 분리) — 실서버 라이브 QA (FABLE5 적대검증 차원F R4).
 *
 * 🚨 [SONNET5 R1 fix 정정] 이 스펙은 원래 FABLE5 R1 적대검증이 실증한 결함(F1 TagChip 버블링·
 * F2 안전재고 제품명 미확인·F3 저장 실패 무피드백·F4 CODEF BLOCKING#1 자기모순)을 그대로
 * 기록했었다. fix 반영 후 F1/F4/H-4(S2c) 단계는 "결함 재현" 이 아닌 "fix 회귀 확인" 단언으로
 * 갱신했고, F3 는 결정2ⓒ(ProductAutocomplete 교체)로 재현 경로 자체가 사라져 성공 피드백
 * 확인으로 대체했다. F2(제품명 미확인)는 이 슬라이스 범위 밖 pre-existing 결함으로 남아있다.
 * ⚠️ 본 갱신은 코드 분석 + vitest/gradle IT 실측에 기반한 것으로, 라이브 서버 재실행으로
 * 재검증되지 않았다(SONNET5 정직 고지 — 원문은 PM/다음 라운드 라이브 QA 로 재확인 권고).
 *
 * 실 게이트웨이 :8080 · mock OFF · 실 로그인(dev_master) · 합성/fixture 캡처 없음(전부 실 DOM).
 * 세 도메인: 일마감(/accounting/daily-closings) · 안전재고(/inventory/safety-stock-alerts) ·
 * CODEF 가져오기 범위(/accounting/bank-transactions).
 *
 * 시나리오(각 단계 실캡처 → docs/qa/825-s5-r4-liveqa/):
 *  1) 칩 0개 = 저장/실행 잠금 + 안내 문구
 *  2) '전체'(ALL) 명시 후 정상 동작
 *  3) 개별 선택(SELECTED) 후 정상 동작(선택 범위만 반영)
 *  4) ALL vs SELECTED 고유 출력 차이(같은 화면, presence-only 금지)
 *  5) 화면 전환/복귀 후 범위 상태 stale 여부
 *  6) 모바일 폭(390px) 칩·안내 레이아웃
 *  F1) [R1 fix 확인] '전체' 칩 X 제거 — TagChip stopPropagation 근본 fix 후 정상 해제 확인
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
const PASSWORD = resolveQaCredential('QA_DEV_DEFAULT_PASSWORD')
const SHOTS = resolveQaShotsDir(path.resolve(_dirname, '../../../../docs/qa/825-s5-r4-liveqa'))
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

/**
 * CODEF 실 QA의 외부 scope 행은 테스트 사이에 삭제 API가 없다.
 * 따라서 매 테스트가 화면에 복원된 범위를 직접 해제해 '미선택' 전제를 만든다.
 * 저장된 ALL/SELECTED 어느 상태에서 시작해도 동작하므로 이전 실행 잔여 상태에도
 * 의존하지 않는다.
 *
 * 🚨 [SONNET5 R3 MED-9(a) fix] 종전에는 '선택 칩 제거 반복' → '눌린 ALL 칩 제거'
 * 순서로만 해제를 시도해, SELECTED + refs 전부 [](V64 backfill 직후의 "제4의 무표시
 * 상태" — scopeMode='SELECTED' 인데 화면엔 칩이 0개)에서는 해제할 선택 칩도 눌린 ALL
 * 칩도 없어 아무 것도 클릭하지 못하고 마지막 hint 대기에서 데드락(15s 타임아웃)됐다.
 * '전체' 칩 클릭(selectAllScope)은 현재 scopeMode 와 무관하게 canUpdate 이기만 하면
 * 항상 가능한 유일한 무조건부 진입점이므로, 모든 시작 상태를 먼저 ALL 로 강제 수렴시킨
 * 뒤 그 자리에서 곧바로 제거해 null(미선택)로 전이한다 — FE 상태전이표(selectAllScope→
 * clearScope)만 사용하는 결정적 2-클릭 경로라 SELECTED-빈값/SELECTED-값있음/ALL 어느
 * 시작 상태에서도 동일하게 동작한다.
 */
async function resetCodefScopeToUnset(page: Page): Promise<void> {
  const hint = page.getByTestId('codef-scope-hint')
  if (await hint.count() > 0) {
    await expect(hint).toBeVisible({ timeout: 15000 })
    return
  }

  const allChip = page.getByTestId('codef-all-scope-chip')
  await allChip.click()
  await expect(allChip.locator('[role="button"]')).toHaveAttribute('aria-pressed', 'true', { timeout: 10000 })
  await allChip.getByRole('button', { name: '전체 범위 제거' }).click()
  await expect(hint).toBeVisible({ timeout: 15000 })
}

test.describe.serial('#825 슬5 null-semantics — 실서버 라이브 QA', () => {
  test.beforeEach(async ({ page }) => {
    const login = await realLogin(page, LOGIN_ID)
    expect(login.token, '토큰 없음').toBeTruthy()
    await installAuthStub(page, login)
  })

  test('D1 · 일마감 — 칩0 잠금 → SELECTED 실행 → 해제 → ALL 실행 → 차별 출력 → F1 fix 확인 → 리셋 → 역마감', async ({ page }) => {
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

    // F1 — [R1 fix 회귀 확인, 정정] 종전에는 ALL 칩 X 제거 클릭이 onRemove(null 셋) 후 칩
    //      자신의 onClick 으로 버블링되어 즉시 ALL 재선택(해제 불가)이었다. TagChip 이
    //      제거 버튼에 stopPropagation 을 추가하고 role="button" 을 라벨/값 텍스트만
    //      감싸는 내부 wrapper 로 옮겨(ARIA 중첩도 해소) 근본 fix 되었다 — 이제 X 클릭은
    //      정확히 미선택으로 복귀해야 한다(힌트 재표시 + 실행 버튼 비활성).
    await page.getByTestId('daily-closing-all-chip').getByRole('button', { name: '전체 범위 제거' }).click()
    await page.waitForTimeout(800)
    const hintAfterRemove = await hint.count()
    const execEnabledAfterRemove = await execBtn.isEnabled()
    console.log(`[F1-D1 fix 확인] ALL 칩 X 클릭 후 hint=${hintAfterRemove}(기대 1), 실행버튼활성=${execEnabledAfterRemove}(기대 false)`)
    await shot(page, 'd1-f1-fixed-all-chip-remove-works')
    expect(hintAfterRemove, 'TagChip 버블링 fix 회귀 — 제거 후 힌트가 재표시되지 않음').toBe(1)
    expect(execEnabledAfterRemove, 'TagChip 버블링 fix 회귀 — 제거 후 실행 버튼이 비활성화되지 않음').toBe(false)

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

  test('D2 · 안전재고 — 칩0 잠금 → SELECTED 저장 → 해제 → ALL 저장 → 차별 출력 → F1 fix 확인 → 리셋', async ({ page }) => {
    await goto(page, '/inventory/safety-stock-alerts')

    // S1 — 칩 0개: 저장 잠금 + 안내(제품·임계값을 채워도 잠금 유지)
    const hint = page.getByTestId('safety-stock-scope-hint')
    const saveBtn = page.getByTestId('safety-stock-config-save')
    await expect(hint).toBeVisible()
    await expect(hint).toHaveText(/전체로 처리하려면 '전체' 칩을 선택하세요\./)
    await expect(saveBtn).toBeDisabled()
    await shot(page, 'd2-s1a-chip0-locked-hint')

    // [R1 결정2ⓒ fix] 제품 드롭다운(alertsQuery 파생 <select>, F2 이름 미확인 결함의 원인)을
    // ProductAutocomplete(product-service 실검색)로 교체 — 알림 이력이 없는 제품도 최초 설정
    // 가능해졌다(순환 구조 해소). 선택은 이제 UUID 가 아닌 모델명 검색으로 이뤄진다.
    const productCombo = page.getByRole('combobox', { name: '제품' })
    await productCombo.click()
    await productCombo.fill(QA_PRODUCT_MODEL)
    // 🚨 [SONNET5 R3 MED-9(b) fix] AsyncAutocomplete 의 로딩 행("검색 중…")도 실 후보 행과
    // 동일하게 li[role="option"] 이라 종전 `.first()` 는 타이밍에 따라 로딩 행을 클릭할
    // 수 있었다(제품 미커밋 → 저장 영구 비활성, 입력창엔 초안이 남아 육안으로는 정상처럼
    // 보임). 로딩 행 텍스트를 명시적으로 배제해 실 후보 행만 대상으로 삼는다 — 렌더
    // 타이밍과 무관하게 구조적으로 로딩 행을 절대 클릭하지 않는다(AsyncAutocomplete 컴포넌트
    // 자체는 이 슬라이스 범위 밖 — LOW pre-existing, 개발책임자 처분 대기).
    const productCandidate = page.locator('li[role="option"]').filter({ hasNotText: '검색 중' })
    await expect(productCandidate.first(), '품목 후보 미표시').toBeVisible({ timeout: 15000 })
    await productCandidate.first().click()
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
    // [R1 결정2ⓑ fix 확인] 저장 성공 피드백 배너 — 종전 무피드백(F3) 대응.
    await expect(page.getByTestId('safety-stock-config-save-success')).toBeVisible({ timeout: 5000 })
    await shot(page, 'd2-s2b-save-success-feedback')
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

    // F1 — [R1 fix 회귀 확인, 정정] TagChip 버블링 근본 fix — X 클릭이 이제 정확히
    //      미선택으로 복귀해야 한다(힌트 재표시 + 창고 select 재활성).
    await page.getByTestId('safety-stock-all-chip').getByRole('button', { name: '전체 창고 범위 제거' }).click()
    await page.waitForTimeout(800)
    const hintAfterRemove = await hint.count()
    const warehouseDisabled = await page.getByTestId('safety-stock-config-warehouse').isDisabled()
    console.log(`[F1-D2 fix 확인] ALL 칩 X 클릭 후 hint=${hintAfterRemove}(기대 1), 창고select 비활성=${warehouseDisabled}(기대 false)`)
    await shot(page, 'd2-f1-fixed-all-chip-remove-works')
    expect(hintAfterRemove, 'TagChip 버블링 fix 회귀 — 제거 후 힌트가 재표시되지 않음').toBe(1)
    expect(warehouseDisabled, 'TagChip 버블링 fix 회귀 — 제거 후 창고 select 가 재활성화되지 않음').toBe(false)

    // F3 — [R1 결정2ⓑ/ⓒ fix 정정 — 성공 피드백은 S2 에서 이미 확인] 종전에는
    // configMutation 에 onError 가 없어 저장 실패가 무피드백(silent)이었다(라이브 QA d2-f3
    // 로 실증). 성공 피드백은 위 S2 저장 직후 배너로 이미 확증했다(ⓑ). 종전 F3 는
    // alertsQuery 파생 <select> 에 남아있던 orphan(존재하지 않는 productId) 옵션을 통해
    // 실패를 유도했으나, 결정2ⓒ 로 제품 선택을 ProductAutocomplete(product-service 실검색)
    // 로 교체하면서 그 경로 자체가 사라졌다 — 존재하지 않는 제품은 애초에 검색 결과에 나타나지
    // 않으므로 UI 로는 재현 불가(설계상 원천 차단 — ⓒ 의 부수 효과). 실패 피드백 자체는
    // SafetyStockAlertsPage.test.tsx(vitest, mock 404 — 라이브 QA d2-f3 실측 메시지 그대로
    // 재현)로 결정적으로 커버한다.

    // S5 — 화면 전환 후 복귀: 설정 폼 미선택 초기화(stale 없음)
    await goto(page, '/accounting/daily-closings')
    await goto(page, '/inventory/safety-stock-alerts')
    await expect(page.getByTestId('safety-stock-scope-hint')).toBeVisible()
    await expect(page.getByTestId('safety-stock-config-save')).toBeDisabled()
    await shot(page, 'd2-s5-revisit-state-reset')
    console.log('[D2] 안전재고 SELECTED→ALL 저장·차별출력·F1 재확인·리셋 완료 (전용 throwaway 품목만 사용)')
  })

  test('D3 · CODEF — 칩0 잠금(구 오해문구 제거) → SELECTED 저장·복원·가져오기 → ALL 저장·가져오기(BLOCKING#1 fix) → 재진입 ALL 복원 확증(H-4 fix)', async ({ page }) => {
    await goto(page, '/accounting/bank-transactions')
    await resetCodefScopeToUnset(page)

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

    // F4 — [R1 BLOCKING#1 fix 회귀 확인, 정정] 종전에는 ALL 저장 직후 가져오기가 FE 의
    //      explicit-empty payload 를 서버가 "저장된 선택이 비어 있음" 으로 오판해 400 으로
    //      자기모순 실패했다(라이브 QA d3-f4 로 실증). scope_mode 컬럼(V64) 도입 후에는
    //      저장 당시 scopeMode=ALL 을 신뢰해 CODEF 서버 전체 열거(진짜 전체)로 성공해야 한다
    //      — 성공 토스트 + 결과 영역이 SELECTED 요약과 달라짐(stale 아님)이 그 증거.
    await page.getByTestId('codef-import-from').fill('2020-01-01')
    await page.getByTestId('codef-import-to').fill('2020-01-07')
    await expect(page.getByTestId('codef-import-button')).toBeEnabled()
    await page.getByTestId('codef-import-button').click()
    // 결과 영역은 SELECTED 실행 결과가 이미 마운트되어 있으므로, 새 실행의 성공 토스트를
    // 기다린 뒤 읽는다. 동일한 날짜/카탈로그이면 요약 문자열이 같을 수 있어 문자열 차이를
    // 비동기 완료의 동기화 조건으로 사용하지 않는다.
    await expect(page.getByTestId('bank-transaction-toast')).toContainText('거래내역 가져오기 완료', { timeout: 20000 })
    const toastTextAfterAllImport = ((await page.getByTestId('bank-transaction-toast').innerText().catch(() => '')) ?? '').trim()
    const allSavedSummary = (await result.innerText()).replace(/\s+/g, ' ').trim()
    console.log(`[F4-D3 fix 확인] ALL 저장 후 가져오기 → 토스트: "${toastTextAfterAllImport}" · 결과영역: "${allSavedSummary}"`)
    expect(toastTextAfterAllImport, 'BLOCKING#1 fix 회귀 — 에러 토스트가 떴다면 재검토').not.toMatch(/저장된 가져오기 선택이 비어|오류/)
    expect(allSavedSummary, 'BLOCKING#1 fix 회귀 — 결과 영역이 SELECTED 요약과 동일(stale)하면 재검토').not.toBe(selSummary)
    await shot(page, 'd3-f4-fixed-all-import-succeeds')

    // S2b — [R1 H-4 fix 회귀 확인, 정정] ALL 저장 후 재진입: scope_mode 컬럼 도입으로 복원이
    //       '미선택' 이 아닌 'ALL' 로 정확히 나타나야 한다(refs=[] 를 미저장과 혼동하지 않음).
    await page.reload({ waitUntil: 'domcontentloaded' })
    await expect(page.getByText('MASTER').first()).toBeVisible({ timeout: 25000 })
    await page.waitForTimeout(2500)
    await expect(page.getByTestId('codef-scope-hint')).toHaveCount(0)
    await expect(page.getByTestId('codef-save-scope-button')).toBeEnabled()
    await expect(page.getByTestId('codef-import-button')).toBeEnabled()
    const allChipPressableAfterReload = page.getByTestId('codef-all-scope-chip').locator('[role="button"]')
    await expect(allChipPressableAfterReload).toHaveAttribute('aria-pressed', 'true')
    await shot(page, 'd3-s2c-reload-after-all-shows-all-restored')

    // S4 — 재진입 후(이미 ALL 로 복원된 상태) 가져오기: FE는 저장된 defaultImportType=ALL을
    //      type으로 보내고 refs 필드를 생략한다. 서버의 진짜 전체(null refs) 경로를 직접
    //      검증한다. F4(저장 scope 경유)와 동일한 전체 범위로 수렴해야 한다.
    await page.getByTestId('codef-import-from').fill('2020-03-01')
    await page.getByTestId('codef-import-to').fill('2020-03-07')
    const importBtn3 = page.getByTestId('codef-import-button')
    await expect(importBtn3).toBeEnabled()
    await importBtn3.click()
    const result3 = page.getByTestId('codef-import-result')
    // 이전 결과와 문자열이 같을 수 있으므로, 이번 요청의 성공 토스트를 완료 경계로 삼는다.
    await expect(page.getByTestId('bank-transaction-toast')).toContainText('거래내역 가져오기 완료', { timeout: 20000 })
    const allSummary = (await result3.innerText()).replace(/\s+/g, ' ').trim()
    console.log(`[D3] 진짜 ALL(저장 scope 경유) 가져오기 요약: ${allSummary}`)
    expect(allSummary, 'ALL/SELECTED 가져오기 요약이 동일 — 범위 미반영 의심').not.toBe(selSummary)
    const fetchedMatch = allSummary.match(/조회 ([\d,]+)건/)
    const fetchedAll = fetchedMatch ? Number(fetchedMatch[1].replace(/,/g, '')) : 0
    expect(fetchedAll, `ALL 조회 건수(${fetchedAll})가 SELECTED(5) 이하 — 전수 열거 미동작 의심`).toBeGreaterThan(5)
    await shot(page, 'd3-s4-true-all-import-differs')
    console.log('[D3] CODEF 칩0 잠금·SELECTED 저장/복원/가져오기·BLOCKING#1/H-4 fix 확인·진짜 ALL 차별 확증 완료')
  })

  test('D3b · [R1 BLOCKING#1 fix 시각 보강] ALL 저장 직후 가져오기 성공 토스트 실캡처(3초 자동소멸 전)', async ({ page }) => {
    await goto(page, '/accounting/bank-transactions')
    await resetCodefScopeToUnset(page)
    await page.getByTestId('codef-all-scope-chip').click()
    await page.getByTestId('codef-save-scope-button').click()
    await expect(page.getByTestId('bank-transaction-toast')).toBeVisible({ timeout: 10000 })
    // 저장 성공 토스트 소멸 대기 후 가져오기 → 가져오기 성공 토스트를 소멸(3s) 전에 캡처.
    // fix 전에는 이 토스트가 "저장된 가져오기 선택이 비어 있습니다" 에러였다(d3-f4b 구 캡처).
    await page.waitForTimeout(3500)
    await page.getByTestId('codef-import-from').fill('2020-01-01')
    await page.getByTestId('codef-import-to').fill('2020-01-07')
    await page.getByTestId('codef-import-button').click()
    const toast = page.getByTestId('bank-transaction-toast')
    await expect(toast).toBeVisible({ timeout: 8000 })
    await expect(toast).not.toContainText('저장된 가져오기 선택이 비어 있습니다')
    await expect(toast).toContainText('거래내역 가져오기 완료')
    await shot(page, 'd3-f4b-success-toast-visible')
    console.log(`[F4-D3b fix 확인] 성공 토스트 실캡처: ${(await toast.innerText()).trim()}`)
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
    await resetCodefScopeToUnset(page)
    await shot(page, 'd6-s3-mobile-codef-chip0')
    console.log('[D6] 모바일 390px 칩0 레이아웃 캡처 완료')
  })
})
