/**
 * PR #462 cycle-3 — view-only 계정의 변경 액션 버튼 비활성화 mock gate.
 *
 * playwright.config.ts 기본 VITE_MOCK_MODE dev server에서 실행되는 mock 전용 spec이다.
 * live backend, real-qa, page.setContent fallback 없이 mockPerms query override로만 권한을 바꾼다.
 */
import { test, expect, type Page } from '@playwright/test'
import * as fs from 'fs'
import * as http from 'http'
import * as path from 'path'
import { fileURLToPath } from 'url'

const _filename = fileURLToPath(import.meta.url)
const _dirname = path.dirname(_filename)

const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5173'

type MockPerm = { pageCode: string; view?: boolean; edit?: boolean }

function mockPerms(perms: MockPerm[]): string {
  return btoa(JSON.stringify(perms))
}

function withMockPerms(url: string, perms: MockPerm[]): string {
  const separator = url.includes('?') ? '&' : '?'
  return `${url}${separator}mockPerms=${encodeURIComponent(mockPerms(perms))}`
}

async function isServerAvailable(): Promise<boolean> {
  return new Promise(resolve => {
    try {
      const url = new URL(BASE_URL)
      const req = http.get(
        {
          hostname: url.hostname,
          port: Number(url.port) || 80,
          path: '/',
          timeout: 2000,
        },
        res => {
          resolve(true)
          res.resume()
        },
      )
      req.on('error', () => resolve(false))
      req.on('timeout', () => {
        req.destroy()
        resolve(false)
      })
    } catch {
      resolve(false)
    }
  })
}

function envelope<T>(data: T) {
  return {
    success: true,
    code: 'OK',
    message: null,
    data,
    timestamp: new Date().toISOString(),
  }
}

async function gotoWithPerm(
  page: Page,
  pathFragment: string,
  pageCode: string,
  edit: boolean,
  mockRole = 'MANAGER',
): Promise<void> {
  const url = `${BASE_URL}/#${pathFragment}?mockRole=${mockRole}`
  await page.goto(
    withMockPerms(url, [{ pageCode, view: true, edit }]),
    { waitUntil: 'domcontentloaded', timeout: 20_000 },
  )
}

async function routeAccountingEditRequests(page: Page): Promise<void> {
  await page.route('**/api/v1/accounting/edit-requests?**', async route => {
    if (route.request().method() !== 'GET') {
      await route.continue()
      return
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(envelope([
        {
          requestId: 'aaaaaaaa-0000-0000-0000-000000000001',
          entityId: 'journal-001',
          requestType: 'EDIT',
          status: 'PENDING',
          reason: '마감 전표 금액 정정 요청',
          requesterId: 'user-001',
          requesterName: '오병승',
          targetRole: 'MANAGER',
          decidedById: null,
          decidedByName: null,
          decisionReason: null,
          requestedAt: '2026-06-11T09:10:00',
          decidedAt: null,
          expiresAt: null,
        },
      ])),
    })
  })
}

async function routeSlipEditRequests(page: Page): Promise<void> {
  await page.route('**/api/v1/slips/edit-requests?**', async route => {
    if (route.request().method() !== 'GET') {
      await route.continue()
      return
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(envelope([
        {
          id: 'slip-edit-request-001',
          slipId: 'slip-001',
          slipNo: '2026/06/11-1',
          requesterId: 'user-001',
          requesterName: '오병승',
          type: 'EDIT',
          reason: '배송 시각 정정 요청',
          requestedAt: '2026-06-11T09:00:00+09:00',
          status: 'PENDING',
          decidedAt: null,
          decidedBy: null,
          decidedByName: null,
          decisionReason: null,
        },
      ])),
    })
  })
}

async function routeDispatchTask(
  page: Page,
  options: { allowCreate: boolean } = { allowCreate: true },
): Promise<{ getCreateCallCount: () => number }> {
  let createCallCount = 0
  const task = {
    id: 'dispatch-task-view-only-001',
    taskCode: '2026/06/11-1',
    dispatchDate: '2026-06-11',
    status: 'DRAFT',
    vehicleGroups: [],
    matchedDrivers: [],
    failureReason: null,
    modificationReason: null,
    rejectionReason: null,
    modificationRequestedAt: null,
    modificationDecidedAt: null,
  }
  await page.route(/^http:\/\/localhost:8080\/admin\/dispatch-tasks(?:\?.*)?$/, async route => {
    if (route.request().method() === 'POST') {
      createCallCount++
      if (!options.allowCreate) {
        await route.fulfill({
          status: 403,
          contentType: 'application/json',
          body: JSON.stringify({
            success: false,
            code: 'FORBIDDEN',
            message: 'dispatch.board 수정 권한이 필요합니다.',
            data: null,
            timestamp: new Date().toISOString(),
          }),
        })
        return
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(envelope(task)),
      })
      return
    }
    await route.continue()
  })
  await page.route(/^http:\/\/localhost:8080\/admin\/dispatch-tasks\/dispatch-task-view-only-001(?:\?.*)?$/, async route => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(envelope(task)),
      })
      return
    }
    await route.continue()
  })
  await page.route(/^http:\/\/localhost:8080\/admin\/dispatch-board\/undispatched-slips(?:\?.*)?$/, async route => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(envelope({
          content: [
            {
              id: 'slip-view-only-001',
              slipNo: '2026/06/11-VIEW-001',
              slipDate: '2026-06-11',
              partnerCode: 'P-VIEW-001',
              partnerName: '권한조회공조',
              deliveryAddress: '서울시 강남구 테헤란로 10',
              recipientPhone: '010-1000-2000',
              dispatchStatus: 'UNDISPATCHED',
            },
          ],
          totalElements: 1,
          totalPages: 1,
          number: 0,
          size: 50,
          first: true,
          last: true,
        })),
      })
      return
    }
    await route.continue()
  })
  return { getCreateCallCount: () => createCallCount }
}

test.describe('menu-5category view-only mutation gates', () => {
  test.beforeEach(async () => {
    const ok = await isServerAvailable()
    expect(
      ok,
      `dev server 미접근: ${BASE_URL} — playwright.config.ts webServer가 VITE_MOCK_MODE=1로 기동돼야 한다.`,
    ).toBe(true)
  })

  test('전표 수정 요청 view-only: 수락/거절 버튼이 비활성화된다', async ({ page }) => {
    await routeSlipEditRequests(page)
    await gotoWithPerm(page, '/admin/slip-edit-requests', 'slip.edit-requests.decide', false)

    await expect(page.locator('[data-testid^="admin-slip-edit-requests-approve-"]').first()).toBeDisabled()
    await expect(page.locator('[data-testid^="admin-slip-edit-requests-reject-"]').first()).toBeDisabled()
  })

  test('전표 수정 요청 update 보유: 수락/거절 버튼이 활성화된다', async ({ page }) => {
    await routeSlipEditRequests(page)
    await gotoWithPerm(page, '/admin/slip-edit-requests', 'slip.edit-requests.decide', true)

    await expect(page.locator('[data-testid^="admin-slip-edit-requests-approve-"]').first()).not.toBeDisabled()
    await expect(page.locator('[data-testid^="admin-slip-edit-requests-reject-"]').first()).not.toBeDisabled()
  })

  test('회계 수정 요청 view-only: 수락/거절 버튼이 비활성화된다', async ({ page }) => {
    await routeAccountingEditRequests(page)
    await gotoWithPerm(page, '/admin/accounting-edit-requests', 'accounting.edit-requests.decide', false)

    await expect(page.locator('[data-testid^="admin-accounting-edit-requests-approve-"]').first()).toBeDisabled()
    await expect(page.locator('[data-testid^="admin-accounting-edit-requests-reject-"]').first()).toBeDisabled()
  })

  test('회계 수정 요청 update 보유: 수락/거절 버튼이 활성화된다', async ({ page }) => {
    await routeAccountingEditRequests(page)
    await gotoWithPerm(page, '/admin/accounting-edit-requests', 'accounting.edit-requests.decide', true)

    await expect(page.locator('[data-testid^="admin-accounting-edit-requests-approve-"]').first()).not.toBeDisabled()
    await expect(page.locator('[data-testid^="admin-accounting-edit-requests-reject-"]').first()).not.toBeDisabled()
  })

  test('배차 보드 view-only: 진입 가능하고 자동 생성 없이 변경 버튼이 비활성화된다', async ({ page }) => {
    await routeDispatchTask(page, { allowCreate: false })
    await gotoWithPerm(page, '/dispatch-board', 'dispatch.board', false, 'DISPATCH')

    await expect(page.getByTestId('dispatch-board-slip-row-2026/06/11-1')).toBeVisible()
    await expect(page.locator('[data-testid="dispatch-board-add-vehicle-button"]')).toBeDisabled()
    await expect(page.locator('[data-testid="dispatch-board-complete-button"]')).toBeDisabled()
    await expect(page.getByText('배차 작업 초기화 실패')).toHaveCount(0)
  })

  test('배차 보드 update 보유: 차량 추가 버튼이 활성화된다', async ({ page }) => {
    await routeDispatchTask(page)
    await gotoWithPerm(page, '/dispatch-board', 'dispatch.board', true, 'DISPATCH')

    await expect(page.locator('[data-testid="dispatch-board-add-vehicle-button"]')).not.toBeDisabled()
  })

  test('단톡방 매핑 view-only: 추가/업로드/삭제 버튼이 비활성화된다', async ({ page }) => {
    await gotoWithPerm(page, '/admin/chat-rooms', 'messenger.admin', false)

    await expect(page.locator('[data-testid="admin-chatrooms-add-button"]')).toBeDisabled()
    await expect(page.locator('[data-testid="admin-chatrooms-import-button"]')).toBeDisabled()
    await expect(page.locator('[data-testid^="admin-chatrooms-delete-"]').first()).toBeDisabled()
  })

  test('단톡방 매핑 create/delete 보유: 추가/업로드/삭제 버튼이 활성화된다', async ({ page }) => {
    await gotoWithPerm(page, '/admin/chat-rooms', 'messenger.admin', true)

    await expect(page.locator('[data-testid="admin-chatrooms-add-button"]')).not.toBeDisabled()
    await expect(page.locator('[data-testid="admin-chatrooms-import-button"]')).not.toBeDisabled()
    await expect(page.locator('[data-testid^="admin-chatrooms-delete-"]').first()).not.toBeDisabled()
  })

  test('알리고 주소록 view-only: 동기화 버튼이 비활성화되고 CSV는 유지된다', async ({ page }) => {
    await gotoWithPerm(page, '/admin/aligo-address-book', 'aligo.address-book', false)

    await expect(page.locator('[data-testid="admin-aligo-sync-btn"]')).toBeDisabled()
    await expect(page.locator('[data-testid="admin-aligo-csv-btn"]')).not.toBeDisabled()
    await expect(page.getByText(/동기화 실행 권한이 없어 실행할 수 없습니다/)).toBeVisible()
    await expect(page.getByText(/상단의 "주소록 동기화 실행" 버튼을 눌러 sync 를 시작하세요/)).toHaveCount(0)
  })

  test('알리고 주소록 update 보유: 동기화 버튼이 활성화된다', async ({ page }) => {
    await gotoWithPerm(page, '/admin/aligo-address-book', 'aligo.address-book', true)

    await expect(page.locator('[data-testid="admin-aligo-sync-btn"]')).not.toBeDisabled()
    await expect(page.getByText(/상단의 "주소록 동기화 실행" 버튼을 눌러 sync 를 시작하세요/)).toBeVisible()
    await expect(page.getByText(/동기화 실행 권한이 없어 실행할 수 없습니다/)).toHaveCount(0)
  })

  test('배차 SMS view-only: 미리보기 버튼이 비활성화된다', async ({ page }) => {
    await gotoWithPerm(page, '/arologis/dispatch-sms', 'dispatch.batch', false, 'DISPATCH')

    await expect(page.locator('[data-testid="dispatch-sms-preview-button"]')).toBeDisabled()
  })

  test('배차 SMS create 보유: 미리보기 버튼이 활성화된다', async ({ page }) => {
    await gotoWithPerm(page, '/arologis/dispatch-sms', 'dispatch.batch', true, 'DISPATCH')

    await expect(page.locator('[data-testid="dispatch-sms-preview-button"]')).not.toBeDisabled()
  })
})

test.describe('menu-5category view-only gate spec guard', () => {
  test('false green 패턴을 쓰지 않는다', async () => {
    const specFile = path.resolve(_dirname, 'view-only-mutation-gates.spec.ts')
    const specContent = fs.readFileSync(specFile, 'utf-8')
    const selfTestMarker = "test.describe('menu-5category view-only gate spec guard'"
    const selfTestStart = specContent.indexOf(selfTestMarker)
    const codeToCheck = selfTestStart >= 0 ? specContent.slice(0, selfTestStart) : specContent
    const codeLines = codeToCheck
      .split('\n')
      .filter(line => {
        const trimmed = line.trimStart()
        return !trimmed.startsWith('//') &&
          !trimmed.startsWith('*') &&
          !trimmed.startsWith('/*')
      })
      .join('\n')

    expect(codeLines.match(new RegExp('\\|\\|\\s*true(?!\\s*//)', 'g')) ?? []).toHaveLength(0)
    expect(codeLines.match(new RegExp('test\\.skip\\(!ok\\)', 'g')) ?? []).toHaveLength(0)
    expect(codeLines.match(new RegExp('page\\.setContent\\s*\\(', 'g')) ?? []).toHaveLength(0)
  })
})
