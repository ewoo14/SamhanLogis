/**
 * codef-connection.shots.spec.ts
 *
 * BankCardAdminPage Opus 라운드 라이브 QA — mock 기반 단계별 스크린샷 캡처 + 렌더 검증.
 * 실 백엔드/CODEF sandbox 계약, 기관 자격 암호화·저장 경로는 본 spec 범위 밖이다.
 *
 * 뷰포트: 데스크톱 1280×800 / 모바일 390×844
 * 4단계: 초기진입 → 폼 입력 → 등록 후(Badge pill) → 계좌 조회 후
 *
 * 저장 경로: docs/qa/codef-task7/
 * 실행:
 *   cd clients/desktop
 *   node_modules/.bin/playwright test playwright/codef-connection/codef-connection.shots.spec.ts --headed
 */

import { test, expect, type Page } from '@playwright/test'
import { fileURLToPath } from 'node:url'
import * as path from 'path'
import * as fs from 'fs'
import { resolveQaShotsDir } from '../support/qa-screenshot-dir'

// ---------------------------------------------------------------------------
// 경로 설정
// ---------------------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5173'
// spec 위치: playwright/codef-connection/ → 4단계 상위 = 레포 루트
// 캡처는 커밋된 확정 증거(docs/qa/<slug>/*.png)가 아니라 gitignore 된 _local/ 로 나간다 —
// 재실행이 증거를 덮어쓰지 못하게 한다. 승격은 QA_SHOTS_DIR 로만 opt-in (#926 참조 구현).
const QA_DIR = resolveQaShotsDir(path.resolve(__dirname, '../../../../docs/qa/codef-task7'))

// ---------------------------------------------------------------------------
// 헬퍼
// ---------------------------------------------------------------------------

function pageUrl(role: string): string {
  return `${BASE_URL}/#/accounting/bank-card-admin?mockRole=${role}`
}

async function shot(page: Page, filename: string): Promise<void> {
  fs.mkdirSync(QA_DIR, { recursive: true })
  await page.screenshot({ path: path.join(QA_DIR, filename), fullPage: true })
}

/**
 * UUID / connectedId 텍스트 화면 노출 검증.
 * data-testid='bank-card-admin-*' 구간에서 내부 식별자가 보이면 FAIL.
 */
async function assertNoInternalIds(page: Page): Promise<void> {
  const leaks = await page.evaluate(() => {
    const uuidRe = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
    const found: string[] = []
    let node: Node | null
    while ((node = walker.nextNode())) {
      const parent = node.parentElement
      if (!parent || ['script', 'style'].includes(parent.tagName.toLowerCase())) continue
      const text = node.textContent ?? ''
      if (text.includes('connectedId')) found.push('connectedId-leak')
      const uuids = text.match(uuidRe)
      if (uuids) found.push(...uuids)
    }
    return found
  })
  expect(leaks, `내부 식별자가 화면에 노출됨: ${leaks.join(', ')}`).toHaveLength(0)
}

// ---------------------------------------------------------------------------
// 뷰포트 파라미터화
// ---------------------------------------------------------------------------

const VIEWPORTS = [
  { label: 'desktop', width: 1280, height: 800 },
  { label: 'mobile', width: 390, height: 844 },
] as const

for (const { label, width, height } of VIEWPORTS) {
  test.describe(`BankCardAdminPage ${label} 스크린샷`, () => {
    test.use({ viewport: { width, height } })

    // -----------------------------------------------------------------------
    // 01 초기 진입
    // -----------------------------------------------------------------------
    test(`[${label}] 01 초기 진입 — 빈 폼·빈 목록·결과 안내문구`, async ({ page }) => {
      await page.goto(pageUrl('MASTER'), { waitUntil: 'domcontentloaded' })

      // 페이지 타이틀 (AppLayout header-page-title)
      await expect(page.getByTestId('header-page-title')).toHaveText('계좌/카드 관리')

      // 기관 목록 테이블 빈 상태 메시지
      const institutionTable = page.getByTestId('bank-card-admin-institution-table')
      await expect(institutionTable).toContainText('등록된 금융기관이 없습니다.')

      // 결과 영역 — resultMode=null 분기: 안내문구
      const resultTable = page.getByTestId('bank-card-admin-result-table')
      await expect(resultTable).toContainText('계좌·카드·대출 조회 버튼을 눌러 결과를 확인하세요.')

      // 로그인방식 한국어 옵션 존재 확인 (샌드박스 라이브 QA 검증값 loginType=5)
      const loginTypeSelect = page.getByTestId('bank-card-admin-login-type')
      await expect(loginTypeSelect).toBeVisible()
      const optionText = await loginTypeSelect.locator('option[value="5"]').textContent()
      expect(optionText?.trim()).toBe('마이데이터')

      await shot(page, `${label}-01-initial.png`)
    })

    // -----------------------------------------------------------------------
    // 02 폼 입력
    // -----------------------------------------------------------------------
    test(`[${label}] 02 폼 입력 — FormGrid 반응형·자격증명 입력`, async ({ page }) => {
      await page.goto(pageUrl('MASTER'), { waitUntil: 'domcontentloaded' })
      await expect(page.getByTestId('header-page-title')).toHaveText('계좌/카드 관리')

      // 구분(은행) / 기관코드(0004) / 로그인방식(아이디/비밀번호) / 자격증명
      await page.getByTestId('bank-card-admin-business-type').selectOption('BANK')
      await page.getByTestId('bank-card-admin-organization').fill('0004')
      await page.getByTestId('bank-card-admin-login-type').selectOption('5')
      await page.getByTestId('bank-card-admin-credential-id').fill('samhan-bank-user')
      await page.getByTestId('bank-card-admin-credential-password').fill('secret-pass')

      // 5개 입력 필드 모두 visible (FormGrid columns=3 + columns=2)
      await expect(page.getByTestId('bank-card-admin-business-type')).toBeVisible()
      await expect(page.getByTestId('bank-card-admin-organization')).toBeVisible()
      await expect(page.getByTestId('bank-card-admin-login-type')).toBeVisible()
      await expect(page.getByTestId('bank-card-admin-credential-id')).toBeVisible()
      await expect(page.getByTestId('bank-card-admin-credential-password')).toBeVisible()

      // 기관코드 입력값 확인
      await expect(page.getByTestId('bank-card-admin-organization')).toHaveValue('0004')

      await shot(page, `${label}-02-form-filled.png`)
    })

    // -----------------------------------------------------------------------
    // 03 등록 후
    // -----------------------------------------------------------------------
    test(`[${label}] 03 등록 후 — Badge 상태 pill·page-level 토스트·자격 클리어`, async ({ page }) => {
      await page.goto(pageUrl('MASTER'), { waitUntil: 'domcontentloaded' })
      await expect(page.getByTestId('header-page-title')).toHaveText('계좌/카드 관리')

      // 등록 폼 입력 + 제출
      await page.getByTestId('bank-card-admin-business-type').selectOption('BANK')
      await page.getByTestId('bank-card-admin-organization').fill('0004')
      await page.getByTestId('bank-card-admin-login-type').selectOption('5')
      await page.getByTestId('bank-card-admin-credential-id').fill('samhan-bank-user')
      await page.getByTestId('bank-card-admin-credential-password').fill('secret-pass')
      await page.getByTestId('bank-card-admin-register-button').click()

      // page-level 토스트(role=status) 표시 — design-system Badge 아닌 CSS 인라인 배너
      const successToast = page.getByRole('status').filter({ hasText: '금융기관 등록을 완료했습니다.' })
      await expect(successToast).toBeVisible()

      // 자격증명 폼 클리어 확인
      await expect(page.getByTestId('bank-card-admin-credential-id')).toHaveValue('')
      await expect(page.getByTestId('bank-card-admin-credential-password')).toHaveValue('')

      // 기관 목록: 국민은행 등록 + 상태="정상"
      const institutionTable = page.getByTestId('bank-card-admin-institution-table')
      await expect(institutionTable).toContainText('국민은행')
      await expect(institutionTable).toContainText('정상')

      // Badge 컴포넌트: "정상" 텍스트가 <span> 으로 감싸짐 (design-system Badge, 자체 텍스트 노드 아님)
      const badgeSpan = institutionTable.locator('span').filter({ hasText: '정상' })
      await expect(badgeSpan.first()).toBeVisible()

      // UUID / connectedId 비노출 검증
      await assertNoInternalIds(page)

      await shot(page, `${label}-03-after-registration.png`)
    })

    // -----------------------------------------------------------------------
    // 04 계좌 조회 후
    // -----------------------------------------------------------------------
    test(`[${label}] 04 계좌 조회 — 결과 테이블 렌더·UUID 비노출`, async ({ page }) => {
      await page.goto(pageUrl('MASTER'), { waitUntil: 'domcontentloaded' })
      await expect(page.getByTestId('header-page-title')).toHaveText('계좌/카드 관리')

      // 기관 등록 선행
      await page.getByTestId('bank-card-admin-business-type').selectOption('BANK')
      await page.getByTestId('bank-card-admin-organization').fill('0004')
      await page.getByTestId('bank-card-admin-login-type').selectOption('5')
      await page.getByTestId('bank-card-admin-credential-id').fill('samhan-bank-user')
      await page.getByTestId('bank-card-admin-credential-password').fill('secret-pass')
      await page.getByTestId('bank-card-admin-register-button').click()
      await expect(page.getByRole('status').filter({ hasText: '금융기관 등록을 완료했습니다.' })).toBeVisible()

      // "계좌 조회" 버튼 클릭
      await page.getByTestId('bank-card-admin-list-accounts').click()

      // 결과 테이블에 mock 계좌 데이터 렌더
      const resultTable = page.getByTestId('bank-card-admin-result-table')
      await expect(resultTable).toContainText('국민 운영계좌')
      await expect(resultTable).toContainText('국민은행')
      await expect(resultTable).toContainText('123456-78-901234')

      // 계좌 조회 성공 토스트
      await expect(page.getByRole('status').filter({ hasText: '계좌 검증 결과를 조회했습니다.' })).toBeVisible()

      // UUID / connectedId 비노출 검증
      await assertNoInternalIds(page)

      await shot(page, `${label}-04-after-accounts.png`)
    })
  })
}
