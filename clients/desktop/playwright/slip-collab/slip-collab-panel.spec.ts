/**
 * §7 입출고전표 협업 패널 — Playwright mock 회귀 (Fable5 Round C P2-4).
 *
 * 검증 대상: {@code SlipCollaborationPanel} (전표 상세 `/sales/:id` 하단 협업 섹션) 의
 *   1) 코멘트 등록 → 목록 반영 (+ 해결 처리 → '해결' 배지)
 *   2) 수정 버튼 → 편집 → 수정완료 → 수정 이력 diff 표시
 *
 * <h2>권한 전제 — mock 매트릭스 (Round C P2-1 fix)</h2>
 * <p>패널 버튼은 {@code canAccess('slip.comments'|'slip.audit-overlay', ...)} 로 가드된다.
 * mock {@code SP_D1_PAGES} + DEFAULT_VIEW/EDIT 에 두 page-code 가 등재되어 있어야
 * (auth V36 seed: MASTER/MANAGER/SALES/WAREHOUSE view+edit) 버튼이 노출된다 — 본 spec 이
 * 그 silent regression 의 회귀 가드다.
 *
 * <h2>Mock 전략 — mock.ts fixture (VITE_MOCK_MODE=1)</h2>
 * <p>{@code VITE_MOCK_MODE=1} 일 때 axios request interceptor 가 {@code getMockResponse()}
 * 로 백엔드 호출을 대체한다(실 HTTP 미발생, page.route 불요 — interceptor 가 앞단).
 * 협업 store 는 {@code globalThis} in-memory 라 테스트별 새 page = 자동 초기화.
 *
 * <h2>UUID 비공개 가드</h2>
 * <p>화면 단언은 작성자/수정자 실명(오병승)·필드 라벨(메모)·본문 텍스트만 사용한다
 * (slipId 'slip-001' 은 path 전용) — [[uuid-no-user-visibility]].
 *
 * 실행 (slip-version-history.spec 패턴 동일):
 *   cd clients/desktop
 *   (별도 터미널) set VITE_MOCK_MODE=1 && npx vite src/renderer --port 5174
 *   set PLAYWRIGHT_SKIP_WEB_SERVER=1 && set AUDIT_BASE_URL=http://127.0.0.1:5174
 *     && node_modules/.bin/playwright test playwright/slip-collab --reporter=line
 */
import { expect, test, type Page } from '@playwright/test'
import * as Y from 'yjs'
import { Awareness, encodeAwarenessUpdate } from 'y-protocols/awareness'

const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5173'

/** mock.ts MOCK_SLIPS[0] (OUTBOUND / PROCESSING) 의 id — fixture getSlip 이 이 전표를 반환. */
const SLIP_ID = 'slip-001'
const PAGE_URL = `${BASE_URL}/#/sales/${SLIP_ID}?mockRole=MASTER`
const DRAFT_SLIP_ID = 'slip-005'
const DRAFT_PAGE_URL = `${BASE_URL}/#/sales/${DRAFT_SLIP_ID}?mockRole=MASTER`

function encodeBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64')
}

/**
 * window.samhanAuth stub — AuthGuard 통과용 (slip-version-history.spec 패턴 동일).
 * mock 모드라도 client.ts interceptor 가 getToken() 을 호출하므로 stub 필요.
 */
async function installAuthMock(page: Page) {
  await page.addInitScript(() => {
    const auth = {
      token: 'playwright-token',
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

async function seedOtherViewerOnce(page: Page) {
  await page.addInitScript(({ slipId }) => {
    const storageKey = `samhan-presence-seeded:${slipId}`
    const g = globalThis as unknown as {
      __SAMHAN_MOCK_SLIP_PRESENCE?: Record<string, Array<{
        sessionId: string
        displayName: string
        color: 'BLUE' | 'GREEN' | 'AMBER' | 'ROSE' | 'VIOLET' | 'CYAN' | 'LIME' | 'PINK'
      }>>
    }
    const seeded = window.localStorage.getItem(storageKey) === '1'
    g.__SAMHAN_MOCK_SLIP_PRESENCE = {
      [slipId]: seeded
        ? []
        : [{ sessionId: 'presence-kim-manager', displayName: '김관리', color: 'GREEN' }],
    }
    window.localStorage.setItem(storageKey, '1')
  }, { slipId: SLIP_ID })
}

async function installCoeditSeed(page: Page) {
  const remoteDoc = new Y.Doc()
  remoteDoc.getText('memo').insert(0, '원격 seed 메모')
  const update = encodeBase64(Y.encodeStateAsUpdate(remoteDoc))

  const awarenessDoc = new Y.Doc()
  const remoteAwareness = new Awareness(awarenessDoc)
  remoteAwareness.setLocalState({
    user: { displayName: '원격 사용자', color: '#2563EB' },
    cursor: { fieldName: 'memo', anchor: 2, head: 7 },
  })
  const awareness = encodeBase64(encodeAwarenessUpdate(remoteAwareness, [awarenessDoc.clientID]))

  await page.addInitScript(({ slipId, seededUpdate }) => {
    const g = globalThis as unknown as {
      __SAMHAN_MOCK_SLIP_COEDIT_SEED?: Record<string, string[]>
    }
    g.__SAMHAN_MOCK_SLIP_COEDIT_SEED = {
      [slipId]: [seededUpdate],
    }
  }, { slipId: SLIP_ID, seededUpdate: update })

  await page.route(`**/api/v1/slips/${SLIP_ID}/collab/stream`, async (route) => {
    await route.fulfill({
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache',
      },
      body: `event: coedit:awareness\ndata: ${JSON.stringify({ awareness })}\n\n`,
    })
  })
}

test.describe('§7 입출고전표 협업 패널', () => {
  test('코멘트 등록 → 목록 반영 → 해결 처리', async ({ page }) => {
    await installAuthMock(page)
    await page.goto(PAGE_URL, { waitUntil: 'domcontentloaded' })

    const panel = page.getByTestId('slip-collaboration-panel')
    await expect(panel).toBeVisible()
    // presence 는 이제 패널 밖(SlipDetailPage 상단)에 렌더 → 페이지 스코프로 단언.
    await expect(page.getByTestId('presence-indicator')).toBeVisible()
    await expect(page.getByLabel('오병승 현재 보고 있음').first()).toBeVisible()

    // 1) 초기 빈 목록 — fresh page = fresh mock store.
    await expect(panel.getByText('아직 코멘트가 없습니다.')).toBeVisible()

    // 2) 코멘트 입력 폼 노출 자체가 canAccess('slip.comments','create') 회귀 가드.
    const input = panel.getByTestId('slip-collab-comment-input')
    await expect(input).toBeVisible()
    await input.fill('배송 전 검수 부탁드립니다')
    await panel.getByRole('button', { name: '등록' }).click()

    // 3) 목록 반영 — 작성자 실명 + 본문 (UUID 비노출).
    const commentItem = panel.getByTestId('slip-collab-comment-item')
    await expect(commentItem).toHaveCount(1)
    await expect(commentItem).toContainText('오병승')
    await expect(commentItem).toContainText('배송 전 검수 부탁드립니다')
    await expect(panel.getByText('아직 코멘트가 없습니다.')).toHaveCount(0)

    // 4) 해결 처리 — canAccess('slip.comments','update') 가드 + mock resolve 핸들러.
    await commentItem.getByRole('button', { name: '해결' }).click()
    await expect(commentItem.getByRole('button', { name: '해결' })).toHaveCount(0)
    await expect(commentItem).toContainText('해결')
  })

  test('수정 버튼 → 편집 → 수정완료 → 이력 diff 반영', async ({ page }) => {
    await installAuthMock(page)
    await page.goto(PAGE_URL, { waitUntil: 'domcontentloaded' })

    const panel = page.getByTestId('slip-collaboration-panel')
    await expect(panel).toBeVisible()
    await expect(panel.getByText('아직 수정 이력이 없습니다.')).toBeVisible()
    await expect(page.getByTestId('slip-detail-edit-request-button')).toHaveCount(0)
    await expect(page.getByTestId('slip-detail-delete-request-button')).toBeVisible()

    // 1) 상세 상단 수정 버튼 노출 자체가 canAccess('slip.audit-overlay','update') 회귀 가드.
    await page.getByTestId('slip-collab-edit-open').click()

    // 2) 편집모드 — 메모 필드 수정 + 사유 입력.
    const form = panel.getByTestId('slip-collab-edit-form')
    await expect(form).toBeVisible()
    await form.getByLabel('메모 수정값').fill('출고 전 거래처 통화 완료')
    await form.getByLabel('수정 사유').fill('현장 요청 반영')
    await form.getByRole('button', { name: '수정완료' }).click()

    // 3) 목록 반영 — 수정완료 배지 + 이전값 → 새값 diff + 사유.
    const item = panel.getByTestId('slip-collab-edit-item')
    await expect(item).toHaveCount(1)
    await expect(item).toContainText('오병승')
    await expect(item).toContainText('수정완료')
    await expect(item).toContainText('메모')
    await expect(item).toContainText('출고 전 거래처 통화 완료')
    await expect(item).toContainText('사유: 현장 요청 반영')
    await expect(panel.getByText('아직 수정 이력이 없습니다.')).toHaveCount(0)
  })

  test('presence list 백필은 다른 시청자와 본인 아바타를 함께 표시한다', async ({ page }) => {
    await installAuthMock(page)
    await seedOtherViewerOnce(page)
    await page.goto(PAGE_URL, { waitUntil: 'domcontentloaded' })

    const panel = page.getByTestId('slip-collaboration-panel')
    await expect(panel).toBeVisible()
    const presence = page.getByTestId('presence-indicator')
    await expect(presence).toHaveAttribute('aria-label', '현재 보고 있음 2명')
    await expect(page.getByLabel('김관리 현재 보고 있음')).toBeVisible()
    await expect(page.getByLabel('오병승 현재 보고 있음')).toBeVisible()

    await page.reload({ waitUntil: 'domcontentloaded' })
    const reloadedPanel = page.getByTestId('slip-collaboration-panel')
    await expect(reloadedPanel).toBeVisible()
    await expect(page.getByLabel('김관리 현재 보고 있음')).toHaveCount(0)
    await expect(page.getByLabel('오병승 현재 보고 있음')).toBeVisible()
    await expect(page.getByTestId('presence-indicator')).toHaveAttribute('aria-label', '현재 보고 있음 1명')
  })

  test('협업 메모는 remote update와 cursor를 렌더하고 로컬 입력 update를 누적한다', async ({ page }) => {
    await installAuthMock(page)
    await installCoeditSeed(page)
    await page.goto(PAGE_URL, { waitUntil: 'domcontentloaded' })

    const panel = page.getByTestId('slip-collaboration-panel')
    await expect(panel).toBeVisible()

    const memo = panel.getByLabel('협업 메모')
    await expect(memo).toHaveValue('원격 seed 메모')
    await expect(panel.getByTestId(/coedit-remote-cursor-/)).toContainText('원격 사용자')

    await memo.fill('원격 seed 메모 + 로컬 입력')
    await page.waitForFunction((slipId) => {
      const g = globalThis as unknown as {
        __SAMHAN_MOCK_SLIP_COEDIT?: Record<string, string[]>
      }
      return (g.__SAMHAN_MOCK_SLIP_COEDIT?.[slipId]?.length ?? 0) >= 2
    }, SLIP_ID)

    await expect(memo).toHaveValue('원격 seed 메모 + 로컬 입력')
    await expect(panel).not.toContainText(SLIP_ID)
    await expect(panel).not.toContainText('remote-client')
  })

  test('S2a direct edit modal은 헤더와 품목 셀을 fieldPath 단위 coedit input으로 렌더한다', async ({ page }) => {
    await installAuthMock(page)
    await page.goto(DRAFT_PAGE_URL, { waitUntil: 'domcontentloaded' })

    await page.getByTestId('sales-slip-edit-button').click()
    const modal = page.getByRole('dialog', { name: '매출 전표 수정' })
    await expect(modal).toBeVisible()

    await expect(page.getByTestId('slip-coedit-field-header-partnerName')).toBeVisible()
    await expect(page.getByTestId('slip-coedit-field-header-memo')).toBeVisible()
    await expect(page.getByTestId('slip-coedit-field-items-0-productName')).toBeVisible()
    await expect(page.getByTestId('slip-coedit-field-items-0-quantity')).toBeVisible()
    await expect(page.getByTestId('slip-coedit-field-items-0-unitPrice')).toBeVisible()

    await modal.getByLabel('거래처', { exact: true }).fill('한일냉동기술 S2a')
    await modal.getByLabel('수량 1').fill('3')
    await modal.getByLabel('단가 1').fill('120000')

    await expect(modal.getByLabel('거래처', { exact: true })).toHaveValue('한일냉동기술 S2a')
    await expect(modal.getByLabel('수량 1')).toHaveValue('3')
    await expect(modal.getByLabel('단가 1')).toHaveValue('120000')
    await expect(modal).not.toContainText(DRAFT_SLIP_ID)
  })
})
