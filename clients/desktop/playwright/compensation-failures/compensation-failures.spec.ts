/**
 * @file compensation-failures.spec.ts — D-SER-23 시리얼 보상 실패 복구 mock 회귀.
 *
 * 검증 범위:
 * 1. 목록 렌더 — 미해소 필터 기본 적용, 전표번호/배지 표시
 * 2. 전체 보기 전환 — resolved=true 포함 행 표시
 * 3. 해소 처리 흐름 — 확인 다이얼로그 → 해소 처리 → 배지 전환 (미해소→해소됨)
 * 4. UUID 비공개 — 화면 텍스트에 UUID 패턴 미노출
 * 5. 사이드바 진입점 노출 (inventory.list view 권한 보유 역할)
 *
 * false-green 방지:
 * - 목록 행 data-testid 로 직접 단언 (텍스트 기반 아님)
 * - 배지 전환을 PATCH resolve 이후 실제 DOM 변화로 단언
 */
import { expect, test } from '@playwright/test'

const BASE_URL =
  process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5173'

const UUID_REGEX =
  /\b(?:[0-9a-f]{32}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\b/i

/** 보상 실패 복구 페이지로 이동 — MANAGER 역할(inventory.list view 권한) */
async function gotoPage(
  page: import('@playwright/test').Page,
  role = 'MANAGER',
): Promise<void> {
  await page.goto(
    `${BASE_URL}/#/inventory/compensation-failures?mockRole=${role}`,
    { waitUntil: 'domcontentloaded', timeout: 20_000 },
  )
  await page
    .waitForLoadState('networkidle', { timeout: 8_000 })
    .catch(() => {})
  // 페이지 루트 div 대기
  await page
    .locator('[data-testid="compensation-failures-page"]')
    .waitFor({ state: 'visible', timeout: 10_000 })
}

test.describe('D-SER-23 보상 실패 복구 화면', () => {
  test('미해소 목록 기본 렌더 — 전표번호 행 + 미해소 배지 표시', async ({ page }) => {
    await gotoPage(page)

    // 테이블 표시
    await expect(
      page.locator('[data-testid="compensation-failures-table"]'),
    ).toBeVisible()

    // seed: 미해소 2건 (2026/06/03-001, 2026/06/02-017)
    await expect(
      page.locator('[data-testid="compensation-failures-row-2026/06/03-001"]'),
    ).toBeVisible()
    await expect(
      page.locator('[data-testid="compensation-failures-row-2026/06/02-017"]'),
    ).toBeVisible()

    // 미해소 배지
    await expect(
      page.locator('[data-testid="compensation-failures-badge-2026/06/03-001"]'),
    ).toContainText('미해소')

    // resolved=true 인 seed 행(2026/06/01-042)은 기본 필터에서 숨겨짐
    await expect(
      page.locator('[data-testid="compensation-failures-row-2026/06/01-042"]'),
    ).toHaveCount(0)
  })

  test('전체 보기 전환 — resolved=true 행 포함', async ({ page }) => {
    await gotoPage(page)

    // 전체 보기 토글
    await page
      .locator('[data-testid="compensation-failures-filter-toggle"]')
      .click()

    // resolved=true seed 행(2026/06/01-042) 표시
    await expect(
      page.locator('[data-testid="compensation-failures-row-2026/06/01-042"]'),
    ).toBeVisible()

    // 해소됨 배지
    await expect(
      page.locator('[data-testid="compensation-failures-badge-2026/06/01-042"]'),
    ).toContainText('해소됨')
  })

  test('해소 처리 흐름 — 다이얼로그 열기 → 확인 → 배지 전환', async ({
    page,
  }) => {
    await gotoPage(page)

    // 해소 처리 버튼 클릭 (첫 번째 미해소 행)
    await page
      .locator('[data-testid="compensation-failures-resolve-2026/06/03-001"]')
      .click()

    // 확인 다이얼로그 표시
    await expect(
      page.locator('[data-testid="compensation-failures-resolve-dialog"]'),
    ).toBeVisible()

    // 다이얼로그 내 전표번호 노출 (slipNo)
    const dialog = page.locator('[data-testid="compensation-failures-resolve-dialog"]')
    await expect(dialog).toContainText('2026/06/03-001')

    // UUID 미노출
    const dialogText = await dialog.textContent()
    expect(dialogText ?? '').not.toMatch(UUID_REGEX)

    // 확인 버튼 클릭
    await page
      .locator('[data-testid="compensation-failures-resolve-confirm"]')
      .click()

    // 다이얼로그 닫힘 대기
    await expect(
      page.locator('[data-testid="compensation-failures-resolve-dialog"]'),
    ).toHaveCount(0, { timeout: 5_000 })

    // 미해소 필터 기본 → 목록에서 해소된 행이 사라짐
    await expect(
      page.locator('[data-testid="compensation-failures-row-2026/06/03-001"]'),
    ).toHaveCount(0, { timeout: 5_000 })

    // 전체 보기로 전환 후 해소됨 배지 확인
    await page
      .locator('[data-testid="compensation-failures-filter-toggle"]')
      .click()

    await expect(
      page.locator('[data-testid="compensation-failures-badge-2026/06/03-001"]'),
    ).toContainText('해소됨', { timeout: 5_000 })
  })

  test('취소 버튼 — 다이얼로그 닫힘, 상태 변화 없음', async ({ page }) => {
    await gotoPage(page)

    await page
      .locator('[data-testid="compensation-failures-resolve-2026/06/02-017"]')
      .click()

    await expect(
      page.locator('[data-testid="compensation-failures-resolve-dialog"]'),
    ).toBeVisible()

    await page
      .locator('[data-testid="compensation-failures-resolve-cancel"]')
      .click()

    // 다이얼로그 닫힘
    await expect(
      page.locator('[data-testid="compensation-failures-resolve-dialog"]'),
    ).toHaveCount(0)

    // 행 여전히 미해소
    await expect(
      page.locator('[data-testid="compensation-failures-badge-2026/06/02-017"]'),
    ).toContainText('미해소')
  })

  test('UUID 비공개 — 페이지 텍스트에 UUID 미노출', async ({ page }) => {
    await gotoPage(page)

    // 전체 보기로 전환하여 모든 행 렌더
    await page
      .locator('[data-testid="compensation-failures-filter-toggle"]')
      .click()

    await page
      .locator('[data-testid="compensation-failures-table"]')
      .waitFor({ state: 'visible' })

    const bodyText = await page.locator('body').textContent()
    // cf-seed-0001... 같은 UUID 패턴이 화면에 없어야 함
    expect(bodyText ?? '').not.toMatch(UUID_REGEX)
  })

  test('사이드바 진입점 노출 — inventory.list view 권한 보유 역할', async ({
    page,
  }) => {
    await page.goto(`${BASE_URL}/#/?mockRole=MANAGER`, {
      waitUntil: 'domcontentloaded',
    })
    await page
      .waitForLoadState('networkidle', { timeout: 8_000 })
      .catch(() => {})

    await expect(
      page.locator('[data-testid="sidebar-warehouse-compensation-failures"]'),
    ).toBeVisible()
  })

  test('해소 버튼 권한 가드 — update 권한 없는 역할(ACCOUNTANT)은 해소 버튼 미노출', async ({
    page,
  }) => {
    // ACCOUNTANT: inventory.list view=true(진입 가능) / update=false → 해소 버튼만 숨김.
    await gotoPage(page, 'ACCOUNTANT')

    // 페이지는 정상 진입(미해소 행 표시) — 전체 차단이 아닌 버튼 가드임을 확인.
    await expect(
      page.locator('[data-testid="compensation-failures-row-2026/06/02-017"]'),
    ).toBeVisible()

    // 미해소 행이어도 update 권한이 없으면 해소 버튼이 렌더되지 않아야 한다(canAccess update 가드).
    await expect(
      page.locator('[data-testid="compensation-failures-resolve-2026/06/02-017"]'),
    ).toHaveCount(0)
  })
})
