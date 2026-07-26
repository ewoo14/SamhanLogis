import { resolveQaShotsDir } from '../support/qa-screenshot-dir'
/**
 * #845 DS-3a 라이브 QA — 결재 재인쇄 "승인 당시 레이아웃 pin" 실서버 검증.
 *
 * 🚨 R3 V-1: 이 스펙은 `*-real-qa.spec.ts` 명명 규칙상 `playwright.config.ts` testIgnore
 * 대상이며 `.github/workflows/`에 `real-qa` 매치가 0건이라 **CI에서 영구 미실행**이다(저장소
 * 전체 real-qa 85파일 공통, pre-existing — 이 PR 은 그 CI 편입을 시도하지 않는다). 수동
 * 실행 결과는 `docs/qa/845-ds3a-r1-liveqa/`에 보존돼 있다.
 *
 * 실 게이트웨이(:8080, mock OFF) → 실 groupware-service(V12 적용, 이 브랜치 jar) → 실 groupware_db.
 * 렌더러 = ds3a 워크트리 vite (:5297, --strictPort).
 *
 * 구별출력 설계(BE 검증기 제약: TITLE/APPROVAL_GRID/CLOSING 각 1 필수, paper=A4_PORTRAIT 고정):
 *  - v1(승인 당시) = META_ROWS+FIELD_TABLE 있음 / CONTENT_PARAGRAPHS 없음 → 문서번호O 본문X 필드O
 *  - v2(관리자 수정 후) = CONTENT_PARAGRAPHS 있음 / META_ROWS+FIELD_TABLE 없음 → 문서번호X 본문O 필드X
 *  - DEFAULT = 전부 있음 → 문서번호O 본문O 필드O
 *  세 렌더는 (문서번호, 본문마커) 쌍만으로 전부 pairwise 구별된다 (presence-only 금지 원칙).
 *
 * 캡처: docs/qa/845-ds3a-r1-liveqa/
 */
import { expect, test, type Page } from '@playwright/test'
import * as path from 'path'
import * as fs from 'fs'
import { fileURLToPath } from 'url'

const _dirname =
  typeof __dirname !== 'undefined' ? __dirname : path.dirname(fileURLToPath(import.meta.url))
const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5297'
const API_BASE = process.env['API_BASE'] ?? 'http://localhost:8080'
const PASSWORD = process.env['DEV_PASSWORD'] ?? 'dev_p05_pass!'
const DOC_TYPE = 'GROUPWARE_QA_DS3A_PIN'
const INPUT_TEMPLATE_ID = '6c584820-f8c2-45d6-9b70-4bd0722919c7' // [QA] DS-3a pin 검증 유형 (사전 생성)
const SEED_UNPINNED_APPROVAL = '09d31223-2acf-46c3-8e09-254fc0cebffb' // 2026/05/13-15 월말 재고 실사 (V12 이전 승인)
const PRE_DEPLOY_PENDING_APPROVAL = 'e98596be-dd56-47c2-a2bb-63e6a9bc5ce8' // 2026/07/21-1 PENDING
const NO_ACTIVE_APPROVED_APPROVAL = '056ec1ac-ee7c-45a0-b378-f02a80d82f72' // 2026/07/21-2 ACTIVE 양식 부재 승인
const CONTENT_MARKER = 'PIN-CONTENT-MARKER-본문식별자'
const SHOTS = resolveQaShotsDir(path.resolve(_dirname, '../../../../docs/qa/845-ds3a-r1-liveqa'))
fs.mkdirSync(SHOTS, { recursive: true })

const RAW_LOG = path.join(
  resolveQaShotsDir(path.resolve(_dirname, '../../../../docs/qa')),
  '845-ds3a-r1-liveqa-raw.txt',
)
function rawLog(line: string): void {
  fs.appendFileSync(RAW_LOG, `${new Date().toISOString()} ${line}\n`)
}

async function capture(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: true })
  rawLog(`capture ${name}.png`)
}

interface LoginResult { token: string; role: string; userId: string; displayName: string }

async function realLogin(page: Page, loginId: string): Promise<LoginResult> {
  const res = await page.request.post(`${API_BASE}/api/auth/login`, { data: { loginId, password: PASSWORD } })
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

/**
 * 렌더 완료까지 대기 후 (문서번호, 본문마커, 필드, 결재란, 배너) 시그니처를 수집한다.
 *
 * dev 렌더러는 HashRouter(routes/index.tsx isWebDeploy=false)이므로 `/#/...` 경로를 쓴다.
 * print 화면 고유 요소('상세로 돌아가기' 토올바)가 뜰 때까지 명시 대기해
 * 대시보드 fallback 렌더가 all-zero 시그니처로 위장 통과하는 것을 차단한다.
 */
async function openPrintAndSignature(page: Page, approvalId: string) {
  await page.goto(`${BASE_URL}/#/groupware/approvals/${approvalId}/print`, { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(
    () => !document.body.innerText.includes('불러오는 중'),
    undefined,
    { timeout: 25000 },
  )
  await expect(
    page.getByText('상세로 돌아가기').or(page.getByText('결재문서를 불러오지 못했습니다')).first(),
    'print 화면 진입 실패(대시보드 fallback 의심)',
  ).toBeVisible({ timeout: 15000 })
  await page.waitForTimeout(1200)
  const signature = {
    docNo: await page.locator('span', { hasText: /^문서번호$/ }).count(),
    contentMarker: await page.getByText(CONTENT_MARKER).count(),
    fieldLabel: await page.getByText('검증 사유', { exact: true }).count(),
    approvalGrid: await page.locator('section.print-approval-section').count(),
    banner: await page.locator('[data-testid="approval-reprint-unpinned-notice"]').count(),
    bannerText: (await page.locator('[data-testid="approval-reprint-unpinned-notice"]').allTextContents()).join(' | '),
  }
  rawLog(`signature ${approvalId} → ${JSON.stringify(signature)}`)
  return signature
}

const V1_PAYLOAD = {
  paper: 'A4_PORTRAIT',
  bands: [
    { key: 'qa1-header', kind: 'HEADER', elements: [
      { key: 'qa1-title', type: 'TITLE' },
      { key: 'qa1-meta', type: 'META_ROWS' },
      { key: 'qa1-grid', type: 'APPROVAL_GRID' },
    ] },
    { key: 'qa1-body', kind: 'BODY', elements: [
      { key: 'qa1-fields', type: 'FIELD_TABLE' },
    ] },
    { key: 'qa1-footer', kind: 'FOOTER', elements: [{ key: 'qa1-closing', type: 'CLOSING' }] },
  ],
}

const V2_PAYLOAD = {
  paper: 'A4_PORTRAIT',
  bands: [
    { key: 'qa2-header', kind: 'HEADER', elements: [
      { key: 'qa2-title', type: 'TITLE' },
      { key: 'qa2-grid', type: 'APPROVAL_GRID' },
    ] },
    { key: 'qa2-body', kind: 'BODY', elements: [
      { key: 'qa2-content', type: 'CONTENT_PARAGRAPHS' },
    ] },
    { key: 'qa2-footer', kind: 'FOOTER', elements: [{ key: 'qa2-closing', type: 'CLOSING' }] },
  ],
}

// 테스트 간 공유 상태 (workers=1, 파일 내 순차 실행)
const state: {
  login?: LoginResult
  docTemplateId?: string
  approvalA?: string
  approvalB?: string
} = {}

async function auth(page: Page): Promise<{ Authorization: string }> {
  if (!state.login) state.login = await realLogin(page, 'dev_master')
  await installAuthStub(page, state.login)
  return { Authorization: `Bearer ${state.login.token}` }
}

test('L0 — V12 이전 승인(시드) 재인쇄: 미pin 고지 배너 + DEFAULT 렌더', async ({ page }) => {
  await auth(page)
  const sig = await openPrintAndSignature(page, SEED_UNPINNED_APPROVAL)
  await capture(page, '01-seed-unpinned-approved-banner-default')
  expect(sig.banner, '미pin APPROVED 문서에 고지 배너가 없음').toBe(1)
  expect(sig.bannerText).toContain('승인 당시 레이아웃 정보가 없어')
  // docType 없는 시드 문서 → DEFAULT 렌더(문서번호 META_ROWS 존재)
  expect(sig.docNo, 'DEFAULT 렌더면 문서번호 행이 있어야 함').toBeGreaterThan(0)
})

test('L1 — QA 양식 v1 활성 + 결재A 승인 → pin 각인 + 재인쇄 v1 렌더', async ({ page }) => {
  const headers = await auth(page)

  // 사전 정리(멱등): 이전 실행이 남긴 QA docType 문서양식 soft-delete
  const existing = await page.request.get(`${API_BASE}/admin/groupware/document-templates`, { headers })
  if (existing.ok()) {
    for (const t of ((await existing.json()).data ?? [])) {
      if (t.docType === DOC_TYPE) {
        await page.request.delete(`${API_BASE}/admin/groupware/document-templates/${t.id}`, { headers })
        rawLog(`pre-clean soft-deleted leftover template ${t.id}`)
      }
    }
  }

  // v1 문서양식 생성(DRAFT rev1) → 활성화
  const createRes = await page.request.post(`${API_BASE}/admin/groupware/document-templates`, {
    headers, data: { docType: DOC_TYPE, name: '[QA] DS-3a pin v1', schemaVersion: 1, document: V1_PAYLOAD },
  })
  expect(createRes.status(), `v1 생성 실패: ${await createRes.text()}`).toBe(201)
  const tpl = (await createRes.json()).data
  state.docTemplateId = tpl.id
  rawLog(`doc-template created id=${tpl.id} rev=${tpl.revision} status=${tpl.status}`)
  const actRes = await page.request.post(`${API_BASE}/admin/groupware/document-templates/${tpl.id}/activate`, { headers })
  expect(actRes.ok(), `v1 활성화 실패: ${await actRes.text()}`).toBeTruthy()
  const active = (await actRes.json()).data
  expect(active.status).toBe('ACTIVE')
  expect(active.revision).toBe(1)

  // 결재 A 생성(config CREATOR 라인) + 승인 → pin
  const createAp = await page.request.post(`${API_BASE}/admin/groupware/approvals`, {
    headers,
    data: {
      requesterId: state.login!.userId,
      title: '[QA-DS3A] 결재A - 양식 수정 전 승인',
      content: `${CONTENT_MARKER} 결재A 본문. 관리자 양식 수정 후에도 이 문서의 재인쇄는 v1 외형이어야 한다.`,
      approverIds: [], templateId: INPUT_TEMPLATE_ID, fieldValues: { qa_reason: '수정 전 승인 pin 대상' },
    },
  })
  expect(createAp.status(), `결재A 생성 실패: ${await createAp.text()}`).toBe(201)
  const apA = (await createAp.json()).data
  state.approvalA = apA.approvalId // ApprovalLineAdminResponse.id 는 JSON 상 approvalId 로 직렬화됨(실측)
  rawLog(`approvalA id=${apA.approvalId} no=${apA.approvalNo} status=${apA.status}`)
  const approveRes = await page.request.put(`${API_BASE}/admin/groupware/approvals/${apA.approvalId}/approve`, { headers, data: {} })
  expect(approveRes.ok(), `결재A 승인 실패: ${await approveRes.text()}`).toBeTruthy()
  const approved = (await approveRes.json()).data
  expect(approved.status).toBe('APPROVED')
  expect(approved.documentTemplateId, 'APPROVED 전이 시 documentTemplateId 각인').toBe(tpl.id)
  expect(approved.documentTemplateRevision, 'APPROVED 전이 시 revision=1 각인').toBe(1)
  rawLog(`approvalA pinned → (${approved.documentTemplateId}, ${approved.documentTemplateRevision})`)

  // 각인 revision 이력 API 확인
  const revRes = await page.request.get(`${API_BASE}/groupware/document-templates/${tpl.id}/revisions/1`, { headers })
  expect(revRes.ok(), `revision(1) 이력 조회 실패: ${await revRes.text()}`).toBeTruthy()

  // GUI 재인쇄 = v1 시그니처(문서번호O 본문X 필드O) + 배너 없음
  const sig = await openPrintAndSignature(page, apA.approvalId)
  await capture(page, '02-approvalA-print-pinned-v1-before-edit')
  expect(sig.banner, 'pin 문서에 미pin 배너가 떠서는 안 됨').toBe(0)
  expect(sig.docNo, 'v1=META_ROWS 있음 → 문서번호 행').toBeGreaterThan(0)
  expect(sig.contentMarker, 'v1=CONTENT_PARAGRAPHS 없음 → 본문 마커 비노출').toBe(0)
  expect(sig.fieldLabel, 'v1=FIELD_TABLE 있음 → 검증 사유 라벨').toBeGreaterThan(0)
})

test('L2 — 🚨핵심: 관리자 양식 수정(비활성→수정→활성) 후 결재A 재인쇄 외형 불변(v1 유지)', async ({ page }) => {
  test.skip(!state.docTemplateId || !state.approvalA, 'L1 선행 필요')
  const headers = await auth(page)
  const id = state.docTemplateId!

  // 관리자 수정 절차: deactivate → update(v2, rev2) → activate
  const de = await page.request.post(`${API_BASE}/admin/groupware/document-templates/${id}/deactivate`, { headers })
  expect(de.ok(), `deactivate 실패: ${await de.text()}`).toBeTruthy()
  const up = await page.request.put(`${API_BASE}/admin/groupware/document-templates/${id}`, {
    headers, data: { docType: DOC_TYPE, name: '[QA] DS-3a pin v2(수정본)', schemaVersion: 1, document: V2_PAYLOAD },
  })
  expect(up.ok(), `update 실패: ${await up.text()}`).toBeTruthy()
  const re = await page.request.post(`${API_BASE}/admin/groupware/document-templates/${id}/activate`, { headers })
  expect(re.ok(), `re-activate 실패: ${await re.text()}`).toBeTruthy()
  const nowActive = (await re.json()).data
  expect(nowActive.revision, '수정 후 revision=2').toBe(2)
  expect(nowActive.status).toBe('ACTIVE')
  rawLog(`admin modified template → ACTIVE rev=${nowActive.revision}`)

  // 이력 2건 존재(각인용 rev1 + 현재 rev2)
  for (const rev of [1, 2]) {
    const r = await page.request.get(`${API_BASE}/groupware/document-templates/${id}/revisions/${rev}`, { headers })
    expect(r.ok(), `revision(${rev}) 이력 조회 실패`).toBeTruthy()
  }

  // 🚨 결재A 재인쇄 = 여전히 v1 (pin 제거 시 이 단언은 반드시 RED: v2는 문서번호X 본문O)
  const sig = await openPrintAndSignature(page, state.approvalA!)
  await capture(page, '03-approvalA-reprint-after-edit-STILL-v1')
  expect(sig.banner).toBe(0)
  expect(sig.docNo, '🚨 pin 불변식: 수정 후에도 문서번호 행(v1) 유지').toBeGreaterThan(0)
  expect(sig.contentMarker, '🚨 pin 불변식: v2 본문 요소가 새어들면 안 됨').toBe(0)
  expect(sig.fieldLabel, '🚨 pin 불변식: v1 필드 테이블 유지').toBeGreaterThan(0)
})

test('L3 — 같은 시점 신규 결재B 승인·인쇄 = 수정 후(v2) 외형 + rev2 각인', async ({ page }) => {
  test.skip(!state.docTemplateId, 'L2 선행 필요')
  const headers = await auth(page)

  const createAp = await page.request.post(`${API_BASE}/admin/groupware/approvals`, {
    headers,
    data: {
      requesterId: state.login!.userId,
      title: '[QA-DS3A] 결재B - 양식 수정 후 승인',
      content: `${CONTENT_MARKER} 결재B 본문. 이 문서는 수정 후(v2) 외형이어야 한다.`,
      approverIds: [], templateId: INPUT_TEMPLATE_ID, fieldValues: { qa_reason: '수정 후 승인 - v2 각인 대상' },
    },
  })
  expect(createAp.status(), `결재B 생성 실패: ${await createAp.text()}`).toBe(201)
  const apB = (await createAp.json()).data
  state.approvalB = apB.approvalId
  const approveRes = await page.request.put(`${API_BASE}/admin/groupware/approvals/${apB.approvalId}/approve`, { headers, data: {} })
  expect(approveRes.ok(), `결재B 승인 실패: ${await approveRes.text()}`).toBeTruthy()
  const approved = (await approveRes.json()).data
  expect(approved.status).toBe('APPROVED')
  expect(approved.documentTemplateId).toBe(state.docTemplateId)
  expect(approved.documentTemplateRevision, '결재B는 수정본 rev2 각인').toBe(2)
  rawLog(`approvalB pinned → (${approved.documentTemplateId}, ${approved.documentTemplateRevision})`)

  const sig = await openPrintAndSignature(page, apB.approvalId)
  await capture(page, '04-approvalB-print-pinned-v2-after-edit')
  expect(sig.banner).toBe(0)
  expect(sig.docNo, 'v2=META_ROWS 없음 → 문서번호 행 없음').toBe(0)
  expect(sig.contentMarker, 'v2=CONTENT_PARAGRAPHS 있음 → 본문 마커 노출').toBeGreaterThan(0)
  expect(sig.fieldLabel, 'v2=FIELD_TABLE 없음').toBe(0)
})

test('L4 — ACTIVE 양식 부재 시점에 승인된 문서 = pin 없음 → 배너 + 현재 ACTIVE(v2)로 표시', async ({ page }) => {
  const headers = await auth(page)
  const detail = await page.request.get(`${API_BASE}/admin/groupware/approvals/${NO_ACTIVE_APPROVED_APPROVAL}`, { headers })
  expect(detail.ok()).toBeTruthy()
  const d = (await detail.json()).data
  expect(d.status).toBe('APPROVED')
  expect(d.documentTemplateId, 'ACTIVE 부재 승인 → pin 없음').toBeNull()
  expect(d.documentTemplateRevision).toBeNull()

  const sig = await openPrintAndSignature(page, NO_ACTIVE_APPROVED_APPROVAL)
  await capture(page, '05-noactive-approved-banner-current-v2')
  expect(sig.banner, '미pin APPROVED → 고지 배너').toBe(1)
  expect(sig.docNo, '현재 ACTIVE=v2 → 문서번호 행 없음(현재 양식으로 표시됨의 실증)').toBe(0)
})

test('L5 — PENDING 문서 재인쇄 = 배너 없음(승인 완료 문서 한정 고지)', async ({ page }) => {
  await auth(page)
  const sig = await openPrintAndSignature(page, PRE_DEPLOY_PENDING_APPROVAL)
  await capture(page, '06-pending-doc-no-banner')
  expect(sig.banner, 'PENDING 문서에는 고지 배너가 없어야 함').toBe(0)
})

test('L6 — 🚨인쇄 매체: 미pin 고지 배너가 종이 출력물에 포함되는지', async ({ page }) => {
  await auth(page)
  await openPrintAndSignature(page, NO_ACTIVE_APPROVED_APPROVAL)
  await capture(page, '07a-unpinned-screen-media')

  await page.emulateMedia({ media: 'print' })
  await page.waitForTimeout(300)
  const bannerLocator = page.locator('[data-testid="approval-reprint-unpinned-notice"]')
  const bannerVisibleInPrint = await bannerLocator.isVisible()
  const noPrintToolbarVisible = await page.locator('.no-print').first().isVisible().catch(() => false)
  rawLog(`print-media: bannerVisible=${bannerVisibleInPrint} noPrintToolbarVisible=${noPrintToolbarVisible}`)
  await capture(page, '07b-unpinned-print-media-emulated')

  // 실 인쇄 산출물(PDF) — Chromium print 렌더 경로
  await page.pdf({ path: path.join(SHOTS, '07c-unpinned-print-output.pdf'), format: 'A4', printBackground: true })

  // print CSS가 실제로 적용됨(no-print 토올바 소거)을 확인한 위에서 배너 포함 여부를 판정한다.
  expect(noPrintToolbarVisible, 'print 매체에서 no-print 토올바는 사라져야 함(프린트 CSS 적용 증명)').toBe(false)
  rawLog(`print-media verdict: 배너 인쇄 포함=${bannerVisibleInPrint}`)
  await page.emulateMedia({ media: null })
})

test('L7 — 🚨pinned revision 조회 실패 경로: 배너 없이 DEFAULT로 강하(현행 동작 실측)', async ({ page }) => {
  test.skip(!state.approvalA, 'L1 선행 필요')
  await auth(page)
  let aborted = 0
  await page.route('**/groupware/document-templates/*/revisions/*', async (route) => {
    if (['xhr', 'fetch'].includes(route.request().resourceType())) {
      aborted += 1
      await route.abort('failed')
    } else {
      await route.continue()
    }
  })
  const sig = await openPrintAndSignature(page, state.approvalA!)
  await capture(page, '08-pinned-revision-fetch-failed-default-no-banner')
  rawLog(`L7 aborted revision requests=${aborted}`)
  expect(aborted, 'revision 조회가 실제로 차단됨').toBeGreaterThan(0)
  // 현행 구현 실측: DEFAULT(문서번호O+본문O) 렌더 + 배너 0 → pin 문서가 무고지로 다른 외형 인쇄됨
  const fellBackToDefault = sig.docNo > 0 && sig.contentMarker > 0
  rawLog(`L7 verdict: DEFAULT강하=${fellBackToDefault} banner=${sig.banner} (v1이면 contentMarker=0이어야 하나 실측 ${sig.contentMarker})`)
  expect(sig.banner, '실측: 실패 경로에서 어떤 고지도 없음').toBe(0)
  expect(fellBackToDefault, '실측: pinned 외형(v1)이 아닌 DEFAULT로 인쇄됨').toBe(true)
  await page.unroute('**/groupware/document-templates/*/revisions/*')
})

test('L8 — pinned 문서의 인쇄 매체 렌더(대조군: 배너 없음 + v1 유지)', async ({ page }) => {
  test.skip(!state.approvalA, 'L1 선행 필요')
  await auth(page)
  await openPrintAndSignature(page, state.approvalA!)
  await page.emulateMedia({ media: 'print' })
  await page.waitForTimeout(300)
  await capture(page, '09-approvalA-print-media-emulated-v1')
  await page.pdf({ path: path.join(SHOTS, '09b-approvalA-print-output.pdf'), format: 'A4', printBackground: true })
  const banner = await page.locator('[data-testid="approval-reprint-unpinned-notice"]').count()
  expect(banner).toBe(0)
  await page.emulateMedia({ media: null })
})
