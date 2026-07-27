/**
 * #845 DS-1 문서 양식 렌더러 — screen/print sanity mock 회귀 스위트.
 *
 * DOM 바이트 golden 은 Vitest(approvalRenderGolden.test.tsx)가 담당하고, 이 스위트는
 * CSS/폰트가 로드된 실제 Chromium 에서 in-process mock 시드 결재를 screen 과 print
 * media 로 렌더해 보조 게이트로 확인한다.
 *
 * ⚠️ 이 스펙은 파일명이 `*-real-qa.spec.ts` 가 아니므로 메인 `playwright.config.ts`
 * (VITE_MOCK_MODE=1 자동 기동)의 **자동 하드게이트 대상**이다. PM 수동 실행 전용이 아니다.
 *
 * mock 설계 ([[feedback_inprocess_mock_principles]]):
 * - mock 모드에서는 axios 인터셉터(api/client.ts)가 클라이언트 레벨에서 응답을 주입해
 *   실 HTTP 가 발생하지 않으므로 Playwright `page.route(...)` 는 절대 발동하지 않는다.
 *   따라서 지어낸 id + page.route override 대신 mock.ts 의 실제 시드 결재를 그대로 쓴다.
 * - `?mockRole=MASTER` 로 groupware.approvals 권한을 부여한다(SP_D1_PAGES 포함).
 *
 * UUID 비공개 실증 ([[feedback_uuid_no_user_visibility]]):
 * - 시드 approvalId/requesterId/templateId/approverId/attachmentId 는 전부 실 UUID 형이다.
 *   렌더 모델(buildApprovalRenderModel)이 이들을 투영에서 제거하므로 `.print-approval-doc`
 *   의 텍스트/속성(innerHTML) 어디에도 UUID 가 남지 않아야 한다.
 *
 * 실행:
 *   cd clients/desktop
 *   node_modules/.bin/playwright test playwright/ac-845-ds1-form-renderer/ --reporter=line
 */
import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test, type Page } from '@playwright/test'
import { resolveMockQaShotsDir } from '../support/qa-screenshot-dir'

const BASE = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5173'
const dirname = path.dirname(fileURLToPath(import.meta.url))
// 캡처는 커밋된 확정 증거(docs/qa/<slug>/*.png)가 아니라 gitignore 된 _local/ 로 나간다 —
// 재실행이 증거를 덮어쓰지 못하게 한다. 승격은 QA_SHOTS_DIR 로만 opt-in (#926 참조 구현).
const screenshotDir = resolveMockQaShotsDir(path.resolve(dirname, '../../../../docs/qa/ac-845-ds1-form-renderer/screenshots'))
fs.mkdirSync(screenshotDir, { recursive: true })

/**
 * 느슨한 UUID 패턴 — 시드에 존재하는 모든 내부 id 형태를 포괄한다.
 * (approvalId/attachmentId `77777777-…-4xxx-8xxx-…`, requesterId/approverId `00000000-…`).
 * 좁은 RFC 변형(버전/variant 고정) 패턴은 all-zero 형 approverId 를 놓치므로 느슨한 형을 쓴다.
 */
const UUID_PATTERN = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i

/** mock.ts 시드 결재 id — 실제 스토어에 존재해야 mock 이 404 대신 문서를 반환한다. */
const SEED_APPROVAL_FULL = '77777777-aaaa-4aaa-8aaa-000000000001' // 지출결의서 템플릿 + 첨부 2 + 스텝 2, PENDING
const SEED_APPROVAL_DEFAULT_TEMPLATE = '77777777-aaaa-4aaa-8aaa-000000000003' // templateId=null → GROUPWARE_DEFAULT, APPROVED

/** window.samhanAuth stub — AuthGuard 통과 (MASTER). ac-3 검증 패턴 동형. */
async function installAuthMock(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const auth = {
      token: 'playwright-ds1-token',
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

/** `.print-approval-doc` 의 텍스트와 속성(innerHTML) 양쪽에 UUID 가 없음을 단언한다. */
async function expectNoUuidInDocument(page: Page): Promise<void> {
  const approvalDoc = page.locator('.print-approval-doc')
  await expect(approvalDoc).not.toContainText(UUID_PATTERN)
  // toContainText 는 텍스트만 보므로 속성(옵션 id/href 등)까지 innerHTML 로 재검사한다.
  const innerHtml = await approvalDoc.innerHTML()
  expect(innerHtml).not.toMatch(UUID_PATTERN)
}

test.describe('AC-845 DS-1 문서 렌더러 screen/print sanity', () => {
  test('screen — 시드 지출결의서: 제목/결재란/필드표/첨부표 렌더와 UUID 비노출', async ({ page }) => {
    await gotoApproval(page, SEED_APPROVAL_FULL)

    const approvalDoc = page.locator('.print-approval-doc')
    // 제목(h1) — 시드 title 그대로.
    await expect(approvalDoc.getByRole('heading', { name: '6월 2주차 배송비 정산 승인' })).toBeVisible()
    // 전자서명 결재란 골격.
    await expect(approvalDoc.getByLabel('전자서명 결재란')).toBeVisible()

    // 본문: 내용 문단 + 템플릿 필드표(라벨·값) + 첨부표 렌더 확인.
    const body = approvalDoc.locator('.print-approval-body')
    await expect(body).toContainText('아로로지스 외주 배차 정산 내역 승인 요청입니다.')
    await expect(body).toContainText('지출항목')
    await expect(body).toContainText('여비교통비')
    await expect(body).toContainText('1,840,000') // NUMBER 필드 krw 포맷(1840000)
    await expect(body).toContainText('정산서 PDF') // FILE 첨부 라벨
    await expect(body).toContainText('정산 대상 전표') // SLIP_REF 첨부 라벨

    // 결재란 이름(작성자/결재자)이 이름으로 표시되고 id 로 노출되지 않음.
    await expect(
      approvalDoc.locator('.print-approval-section .print-approval-name').filter({ hasText: '오병승' }).first(),
    ).toBeVisible()

    await expectNoUuidInDocument(page)

    await page.screenshot({ path: path.join(screenshotDir, '01-screen-approval-full.png'), fullPage: true })
  })

  test('print media — 시드 지출결의서: A4 용지 골격과 본문 sanity', async ({ page }) => {
    await gotoApproval(page, SEED_APPROVAL_FULL)
    await page.emulateMedia({ media: 'print' })

    await expect(page.locator('.paper-a4-portrait')).toBeVisible()
    await expect(page.locator('.print-approval-body')).toContainText('아로로지스 외주 배차')
    await expect(page.locator('.print-approval-closing')).toContainText('재가')

    await expectNoUuidInDocument(page)

    await page.screenshot({ path: path.join(screenshotDir, '02-print-approval-full.png'), fullPage: true })
  })

  test('screen — 시드 예외처리(템플릿 null): GROUPWARE_DEFAULT fallback + 발행일 렌더', async ({ page }) => {
    await gotoApproval(page, SEED_APPROVAL_DEFAULT_TEMPLATE)

    const approvalDoc = page.locator('.print-approval-doc')
    await expect(approvalDoc.getByRole('heading', { name: '반품 운송비 예외 처리' })).toBeVisible()
    await expect(approvalDoc.getByLabel('전자서명 결재란')).toBeVisible()
    // templateId=null 이어도 본문 내용은 렌더(기본 양식 fallback).
    await expect(approvalDoc.locator('.print-approval-body')).toContainText('거래처 요청에 따른 운송비 예외 승인 건입니다.')
    // APPROVED 최종 스텝의 승인일이 문서 발행일로 표시.
    await expect(approvalDoc.locator('.print-approval-doc-meta')).toContainText('발행일')

    await expectNoUuidInDocument(page)

    await page.screenshot({ path: path.join(screenshotDir, '03-screen-approval-default-template.png'), fullPage: true })
  })
})
