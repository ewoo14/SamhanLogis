/**
 * #845 DS-3a 재인쇄 "승인 당시 레이아웃" pin — screen/print mock 회귀 스위트.
 *
 * FABLE5 R1 M-1: mock 결재 픽스처에 documentTemplateId 가 0건이라 pin revision 조회 분기
 * (`ApprovalDocView.tsx` 의 `findDocumentTemplateRevision` 경로)가 Playwright mock
 * 게이트에서 한 번도 실행되지 않는 dead code였다("590 passed" 는 pin 분기 무회귀 신호일
 * 뿐이었음). 이 스펙은 `mock.ts` 에 추가한 pin 시드(`documentTemplateId`/`Revision`이 있는
 * approvalId ...0004, 무pin 대조군 ...0005, docType `GROUPWARE_QA_DS3A_PIN`)로 그 갭을
 * 메운다.
 *
 * ⚠️ 이 스펙은 파일명이 `*-real-qa.spec.ts` 가 아니므로 메인 playwright.config.ts
 * (VITE_MOCK_MODE=1 자동 기동)의 **자동 하드게이트 대상**이다.
 *
 * mock 설계 ([[feedback_inprocess_mock_principles]]):
 * - mock 모드에서는 axios 인터셉터(api/client.ts)가 클라이언트 레벨에서 응답을 주입해 실
 *   HTTP 가 발생하지 않으므로 Playwright `page.route(...)` 는 절대 발동하지 않는다. 따라서
 *   지어낸 id + page.route override 대신 mock.ts 의 실제 시드를 그대로 쓴다.
 *
 * 구별출력 설계(presence-only 단언 금지 — [[feedback_react_query_freshness_route_param_reset]]):
 * 라이브QA real-qa 하네스(`845-ds3a-reprint-pin-real-qa`)의 V1_PAYLOAD/V2_PAYLOAD
 * 구별출력 설계와 동형이다.
 * - rev1(각인 대상, mock.ts MOCK_DOCUMENT_TEMPLATE_REVISION_HISTORY) = META_ROWS+FIELD_TABLE
 *   있음 / CONTENT_PARAGRAPHS 없음 → 문서번호 행 표시 + fixture content 텍스트 비노출.
 * - rev2(현재 활성, mock.ts MOCK_DOCUMENT_TEMPLATES.GROUPWARE_QA_DS3A_PIN) = CONTENT_PARAGRAPHS
 *   있음 / META_ROWS 없음 → 문서번호 행 비표시 + fixture content 텍스트 노출.
 * 두 신호(문서번호 유무 + content 텍스트 유무)를 함께 확인해 pairwise로 구별한다.
 *
 * 실행:
 *   cd clients/desktop
 *   node_modules/.bin/playwright test playwright/ac-845-ds3a-reprint-pin/ --reporter=line
 */
import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test, type Page } from '@playwright/test'

const BASE = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5173'
const dirname = path.dirname(fileURLToPath(import.meta.url))
const screenshotDir = path.resolve(dirname, '../../../../docs/qa/ac-845-ds3a-reprint-pin/screenshots')
fs.mkdirSync(screenshotDir, { recursive: true })

/** 느슨한 UUID 패턴 — ac-845-ds1-form-renderer 스펙과 동형([[feedback_uuid_no_user_visibility]]). */
const UUID_PATTERN = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i

// mock.ts 시드 id — 지어낸 id 금지([[feedback_mock_value_format_be_parity]] 원칙 동형 적용).
const APPROVAL_PINNED_REV1 = '77777777-aaaa-4aaa-8aaa-000000000004'
const APPROVAL_UNPINNED_ACTIVE_REV2 = '77777777-aaaa-4aaa-8aaa-000000000005'
const PINNED_CONTENT_MARKER = 'DS-3a 재인쇄 pin mock 회귀 게이트용'

/** window.samhanAuth stub — AuthGuard 통과(MASTER). ac-845-ds1-form-renderer 검증 패턴 동형. */
async function installAuthMock(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const auth = {
      token: 'playwright-ds3a-pin-token',
      userId: '00000000-0000-0000-0000-000000010001',
      role: 'MASTER',
      fullName: '오병승',
      partnerCode: 'P-MOCK-001',
    }
    Object.defineProperty(window, 'samhanAuth', {
      configurable: true,
      value: {
        getToken: async () => auth,
        setToken: async () => undefined,
        clearToken: async () => undefined,
      },
    })
  })
}

/** 시드 결재 인쇄뷰로 진입하고 렌더 완료(애니메이션 고정)까지 대기한다. */
async function gotoApproval(page: Page, approvalId: string): Promise<void> {
  await installAuthMock(page)
  await page.goto(`${BASE}/#/groupware/approvals/${approvalId}/print?mockRole=MASTER`, {
    waitUntil: 'domcontentloaded',
  })
  await expect(page.locator('.print-approval-doc')).toBeVisible({ timeout: 15_000 })
  await page.evaluate(async () => {
    await document.fonts.ready
    document.querySelectorAll('*').forEach((element) => {
      const item = element as HTMLElement
      item.style.setProperty('animation', 'none', 'important')
      item.style.setProperty('transition', 'none', 'important')
    })
  })
}

/** (문서번호 행 유무, content 마커 유무) 쌍 — rev1/rev2를 pairwise로 구별하는 시그니처. */
async function signature(page: Page): Promise<{ docNo: number; contentMarker: number }> {
  return {
    docNo: await page.locator('span', { hasText: /^문서번호$/ }).count(),
    contentMarker: await page.getByText(PINNED_CONTENT_MARKER).count(),
  }
}

async function expectNoUuidInDocument(page: Page): Promise<void> {
  const approvalDoc = page.locator('.print-approval-doc')
  await expect(approvalDoc).not.toContainText(UUID_PATTERN)
  const innerHtml = await approvalDoc.innerHTML()
  expect(innerHtml).not.toMatch(UUID_PATTERN)
}

test.describe('AC-845 DS-3a 재인쇄 pin screen/print mock 회귀', () => {
  test('pin이 각인된 결재는 현재 활성(rev2)이 아니라 승인 당시 각인된 rev1을 재인쇄한다', async ({ page }) => {
    await gotoApproval(page, APPROVAL_PINNED_REV1)

    const approvalDoc = page.locator('.print-approval-doc')
    await expect(approvalDoc.getByRole('heading', { name: '[QA] DS-3a 재인쇄 pin 검증 — 양식 수정 전 승인' })).toBeVisible()

    const sig = await signature(page)
    // rev1 = META_ROWS 있음(문서번호 행) / CONTENT_PARAGRAPHS 없음(fixture content 비노출).
    // 🚨 pin 분기가 dead code로 되돌아가면(활성 rev2로 fallback) 이 두 단언 모두 반대로 RED.
    expect(sig.docNo, 'pin된 rev1 = META_ROWS 있음 → 문서번호 행 표시').toBeGreaterThan(0)
    expect(sig.contentMarker, 'pin된 rev1 = CONTENT_PARAGRAPHS 없음 → 활성 rev2 본문 비노출').toBe(0)

    // pin이 있으므로 미pin 고지·조회실패 고지 둘 다 뜨지 않는다.
    await expect(page.getByTestId('approval-reprint-unpinned-notice')).toHaveCount(0)
    await expect(page.getByTestId('approval-reprint-pin-failed-notice')).toHaveCount(0)

    await expectNoUuidInDocument(page)
    await page.screenshot({ path: path.join(screenshotDir, '01-pinned-rev1.png'), fullPage: true })
  })

  test('같은 docType의 무pin 대조군은 현재 활성(rev2) + 미pin 고지 배너를 함께 표시한다', async ({ page }) => {
    await gotoApproval(page, APPROVAL_UNPINNED_ACTIVE_REV2)

    const sig = await signature(page)
    // rev2(활성) = META_ROWS 없음(문서번호 행 비노출) / CONTENT_PARAGRAPHS 있음(대조군 content 노출).
    expect(sig.docNo, '활성 rev2 = META_ROWS 없음 → 문서번호 행 비노출').toBe(0)
    expect(sig.contentMarker, '활성 rev2 = CONTENT_PARAGRAPHS 있음 → 대조군 content 노출').toBeGreaterThan(0)

    const notice = page.getByTestId('approval-reprint-unpinned-notice')
    await expect(notice).toBeVisible()
    await expect(notice).toHaveText('승인 당시 레이아웃 정보가 없어 현재 양식으로 표시됩니다.')
    await expect(page.getByTestId('approval-reprint-pin-failed-notice')).toHaveCount(0)

    await expectNoUuidInDocument(page)
    await page.screenshot({ path: path.join(screenshotDir, '02-unpinned-active-rev2.png'), fullPage: true })
  })

  test('🚨 print 매체에서는 pin 여부와 무관하게 고지 배너가 출력물에 포함되지 않는다(H-1, DS-1 strangler 불변식)', async ({ page }) => {
    await gotoApproval(page, APPROVAL_UNPINNED_ACTIVE_REV2)
    await expect(page.getByTestId('approval-reprint-unpinned-notice')).toBeVisible()

    await page.emulateMedia({ media: 'print' })
    await page.waitForTimeout(200)

    const noticeVisibleInPrint = await page.getByTestId('approval-reprint-unpinned-notice').isVisible()
    const toolbarVisibleInPrint = await page.locator('.no-print').first().isVisible().catch(() => false)
    // print CSS가 실제로 적용됨(no-print 토올바 소거)을 먼저 확인한 위에서 배너 포함 여부를 판정한다.
    expect(toolbarVisibleInPrint, 'print 매체에서 no-print 토올바는 사라져야 함(프린트 CSS 적용 증명)').toBe(false)
    expect(noticeVisibleInPrint, '미pin 고지 배너가 종이 출력물에 포함되면 안 됨').toBe(false)

    await page.screenshot({ path: path.join(screenshotDir, '03-unpinned-print-media-no-banner.png'), fullPage: true })
    await page.emulateMedia({ media: null })
  })

  test('pin된 결재의 print 매체 렌더는 배너 없이 rev1 외형을 유지한다(대조군)', async ({ page }) => {
    await gotoApproval(page, APPROVAL_PINNED_REV1)
    await page.emulateMedia({ media: 'print' })
    await page.waitForTimeout(200)

    await expect(page.locator('.paper-a4-portrait')).toBeVisible()
    expect(await page.getByTestId('approval-reprint-unpinned-notice').count()).toBe(0)
    expect(await page.getByTestId('approval-reprint-pin-failed-notice').count()).toBe(0)

    await page.screenshot({ path: path.join(screenshotDir, '04-pinned-print-media.png'), fullPage: true })
    await page.emulateMedia({ media: null })
  })
})
