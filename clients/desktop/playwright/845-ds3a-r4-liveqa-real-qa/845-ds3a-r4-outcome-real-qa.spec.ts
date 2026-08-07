import { resolveQaShotsDir } from '../support/qa-screenshot-dir'
/**
 * #845 DS-3a R4 라이브 QA — 결재 재인쇄 "승인 당시 pin" end-to-end OUTCOME (V13 배포본).
 *
 * 개발책임자 승인(2026-07-22): throwaway 결재선 config insert 허용 → dev_master 단독 승인
 * 경로(GROUPWARE_QA_DS3A_R4 docType 의 CREATOR 단계)를 열어 승인당시 pin 외형을 실서버로 실증.
 *
 * 검증(R3 라이브QA 로직 재사용 · 이번엔 V13 배포본):
 *   1. 🔑 pin OUTCOME — 승인 시 (양식,revision) 각인 → 관리자가 양식을 바꿔도 재인쇄 외형 불변.
 *   2. ACTIVE-0 배너 — 승인 시 활성양식 0 → defaultPinned=true → 기본양식 고정 + 배너, 이후 신규
 *      ACTIVE 활성화해도 재인쇄 DEFAULT 유지.
 *   구별출력(presence-only 금지 — pairwise 전부 구별): SHA-256 을 캡처마다 인스펙 산출·로깅.
 *     v1      = META_ROWS + FIELD_TABLE            → docNo=1, contentMarker=0, fieldLabel=1
 *     v2 / v3 = CONTENT_PARAGRAPHS                 → docNo=0, contentMarker=1, fieldLabel=0
 *     DEFAULT = META_ROWS + CONTENT + FIELD_TABLE  → docNo=1, contentMarker=1, fieldLabel=1
 *
 * 실서버·실 GUI·mock OFF: 게이트웨이 :8080 → groupware-service(이 브랜치 jar, V13) → groupware_db.
 * 렌더러 = ds3a vite(기본 :5412, --strictPort). CI 미실행(*-real-qa 명명, pre-existing).
 * 캡처: docs/qa/845-ds3a-r4-liveqa/ (outcome- 접두).
 */
import { expect, test, type Page } from '@playwright/test'
import * as path from 'path'
import * as fs from 'fs'
import * as crypto from 'crypto'
import { fileURLToPath } from 'url'

const _dirname =
  typeof __dirname !== 'undefined' ? __dirname : path.dirname(fileURLToPath(import.meta.url))
const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5412'
const API_BASE = process.env['API_BASE'] ?? 'http://localhost:8080'
const PASSWORD = process.env['DEV_PASSWORD'] ?? (process.env.DEV_PASSWORD ?? '')

const QA_CODE = 'QA_DS3A_R4'
const DOC_TYPE = `GROUPWARE_${QA_CODE}`
const CONTENT_MARKER = 'R4-OUTCOME-CONTENT-MARKER-본문식별자'
const FIELD_LABEL = 'R4 검증 사유'

const SHOTS = resolveQaShotsDir(path.resolve(_dirname, '../../../../docs/qa/845-ds3a-r4-liveqa'))
fs.mkdirSync(SHOTS, { recursive: true })
const RAW_LOG = path.resolve(SHOTS, '00-outcome-raw.txt')

function rawLog(line: string): void {
  fs.appendFileSync(RAW_LOG, `${new Date().toISOString()} ${line}\n`)
}

/** 캡처 + SHA-256 인스펙 산출(픽셀 동일/상이 실측 — presence-only 금지). */
async function capture(page: Page, name: string): Promise<string> {
  const file = path.join(SHOTS, `${name}.png`)
  await page.screenshot({ path: file, fullPage: true })
  const sha = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')
  rawLog(`capture ${name}.png sha256=${sha}`)
  return sha
}

interface LoginResult { token: string; role: string; userId: string; displayName: string }

async function realLogin(page: Page, loginId: string): Promise<LoginResult> {
  const res = await page.request.post(`${API_BASE}/api/auth/login`, { data: { loginId, password: PASSWORD } })
  expect(res.ok(), `로그인 실패(${loginId}): HTTP ${res.status()} ${await res.text()}`).toBeTruthy()
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

interface Signature {
  docNo: number; contentMarker: number; fieldLabel: number; approvalGrid: number
  unpinnedBanner: number; defaultPinnedBanner: number; pinFailedBanner: number
}

async function openPrintAndSignature(page: Page, approvalId: string): Promise<Signature> {
  await page.goto(`${BASE_URL}/#/groupware/approvals/${approvalId}/print`, { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => !document.body.innerText.includes('불러오는 중'), undefined, { timeout: 25000 })
  await expect(
    page.getByText('상세로 돌아가기').or(page.getByText('결재문서를 불러오지 못했습니다')).first(),
    'print 화면 진입 실패(대시보드 fallback 의심)',
  ).toBeVisible({ timeout: 15000 })
  await page.waitForTimeout(1200)
  const signature: Signature = {
    docNo: await page.locator('span', { hasText: /^문서번호$/ }).count(),
    contentMarker: await page.getByText(CONTENT_MARKER).count(),
    fieldLabel: await page.getByText(FIELD_LABEL, { exact: true }).count(),
    approvalGrid: await page.locator('section.print-approval-section').count(),
    unpinnedBanner: await page.locator('[data-testid="approval-reprint-unpinned-notice"]').count(),
    defaultPinnedBanner: await page.locator('[data-testid="approval-reprint-default-pinned-notice"]').count(),
    pinFailedBanner: await page.locator('[data-testid="approval-reprint-pin-failed-notice"]').count(),
  }
  rawLog(`signature ${approvalId} → ${JSON.stringify(signature)}`)
  return signature
}

/** v1 — META_ROWS + FIELD_TABLE (본문 없음) */
const V1_PAYLOAD = {
  paper: 'A4_PORTRAIT',
  bands: [
    { key: 'r4v1-header', kind: 'HEADER', elements: [
      { key: 'r4v1-title', type: 'TITLE' }, { key: 'r4v1-meta', type: 'META_ROWS' }, { key: 'r4v1-grid', type: 'APPROVAL_GRID' },
    ] },
    { key: 'r4v1-body', kind: 'BODY', elements: [{ key: 'r4v1-fields', type: 'FIELD_TABLE' }] },
    { key: 'r4v1-footer', kind: 'FOOTER', elements: [{ key: 'r4v1-closing', type: 'CLOSING' }] },
  ],
}
/** v2/v3 — CONTENT_PARAGRAPHS (문서번호·필드 없음) */
const V2_PAYLOAD = {
  paper: 'A4_PORTRAIT',
  bands: [
    { key: 'r4v2-header', kind: 'HEADER', elements: [{ key: 'r4v2-title', type: 'TITLE' }, { key: 'r4v2-grid', type: 'APPROVAL_GRID' }] },
    { key: 'r4v2-body', kind: 'BODY', elements: [{ key: 'r4v2-content', type: 'CONTENT_PARAGRAPHS' }] },
    { key: 'r4v2-footer', kind: 'FOOTER', elements: [{ key: 'r4v2-closing', type: 'CLOSING' }] },
  ],
}

const state: {
  login?: LoginResult; inputTemplateId?: string; docTemplateId?: string; v3TemplateId?: string
  approvalA?: string; approvalB?: string; approvalC?: string
  shaA1?: string; shaA1b?: string; shaB?: string; shaC?: string; shaC2?: string
} = {}

async function auth(page: Page): Promise<Record<string, string>> {
  if (!state.login) state.login = await realLogin(page, 'dev_master')
  await installAuthStub(page, state.login)
  return { Authorization: `Bearer ${state.login.token}` }
}

async function createApproval(page: Page, headers: Record<string, string>, title: string, reason: string) {
  const res = await page.request.post(`${API_BASE}/admin/groupware/approvals`, {
    headers,
    data: { requesterId: state.login!.userId, title, content: `${CONTENT_MARKER} — ${reason}`, approverIds: [], templateId: state.inputTemplateId, fieldValues: { r4_reason: reason } },
  })
  expect(res.status(), `결재 생성 실패(${title}): ${await res.text()}`).toBe(201)
  const d = (await res.json()).data
  rawLog(`approval created id=${d.approvalId} no=${d.approvalNo} status=${d.status} title=${title}`)
  return d
}

async function approve(page: Page, headers: Record<string, string>, approvalId: string) {
  const res = await page.request.put(`${API_BASE}/admin/groupware/approvals/${approvalId}/approve`, { headers, data: {} })
  expect(res.ok(), `승인 실패(${approvalId}): ${await res.text()}`).toBeTruthy()
  const d = (await res.json()).data
  rawLog(`approved ${approvalId} → status=${d.status} pin=(${d.documentTemplateId}, ${d.documentTemplateRevision}) defaultPinned=${d.documentTemplateDefaultPinned}`)
  return d
}

// ─────────────────────────────────────────────────────────────────────────────

test('R4-OUT-S1 — throwaway 결재유형/문서양식 v1 생성 + 활성화 (CREATOR config 로 dev_master 자가승인 경로 확보)', async ({ page }) => {
  const headers = await auth(page)
  rawLog(`login dev_master role=${state.login!.role} userId=${state.login!.userId}`)

  // 멱등 사전정리 — 이전 R4 outcome 실행 잔여 throwaway 만
  const tplList = await page.request.get(`${API_BASE}/admin/groupware/approval-templates`, { headers })
  if (tplList.ok()) for (const t of ((await tplList.json()).data ?? [])) if (t.code === QA_CODE) {
    await page.request.delete(`${API_BASE}/admin/groupware/approval-templates/${t.id}`, { headers }); rawLog(`pre-clean approval-template ${t.id}`)
  }
  const docList = await page.request.get(`${API_BASE}/admin/groupware/document-templates`, { headers })
  if (docList.ok()) for (const t of ((await docList.json()).data ?? [])) if (t.docType === DOC_TYPE) {
    await page.request.delete(`${API_BASE}/admin/groupware/document-templates/${t.id}`, { headers }); rawLog(`pre-clean document-template ${t.id}`)
  }

  const created = await page.request.post(`${API_BASE}/admin/groupware/approval-templates`, {
    headers, data: { code: QA_CODE, name: '[QA-R4] pin OUTCOME 검증 유형', description: 'R4 outcome throwaway', active: true, displayOrder: 902,
      fields: [{ fieldKey: 'r4_reason', label: FIELD_LABEL, fieldType: 'TEXT', required: false, displayOrder: 1 }] },
  })
  expect(created.status(), `결재유형 생성 실패: ${await created.text()}`).toBe(201)
  state.inputTemplateId = (await created.json()).data.id
  rawLog(`approval-template created id=${state.inputTemplateId} code=${QA_CODE} → docType=${DOC_TYPE}`)

  const docCreate = await page.request.post(`${API_BASE}/admin/groupware/document-templates`, {
    headers, data: { docType: DOC_TYPE, name: '[QA-R4] 문서양식 v1', schemaVersion: 1, document: V1_PAYLOAD },
  })
  expect(docCreate.status(), `문서양식 v1 생성 실패: ${await docCreate.text()}`).toBe(201)
  const tpl = (await docCreate.json()).data
  state.docTemplateId = tpl.id
  const act = await page.request.post(`${API_BASE}/admin/groupware/document-templates/${tpl.id}/activate`, { headers })
  expect(act.ok(), `v1 활성화 실패: ${await act.text()}`).toBeTruthy()
  const active = (await act.json()).data
  expect(active.status).toBe('ACTIVE'); expect(active.revision).toBe(1)
  rawLog(`document-template v1 id=${tpl.id} ACTIVE rev=1`)
})

test('R4-OUT-S2 — pin 경로: 결재A 승인 → (v1, rev1) 각인 + 재인쇄 v1 외형', async ({ page }) => {
  test.skip(!state.docTemplateId, 'S1 선행 필요')
  const headers = await auth(page)
  const apA = await createApproval(page, headers, '[QA-R4] 결재A — 양식 수정 전 승인', '수정 전 승인 pin 대상')
  state.approvalA = apA.approvalId
  const approved = await approve(page, headers, apA.approvalId)
  expect(approved.status).toBe('APPROVED')
  expect(approved.documentTemplateId, 'APPROVED 각인 = v1').toBe(state.docTemplateId)
  expect(approved.documentTemplateRevision, 'revision=1 각인').toBe(1)
  expect(approved.documentTemplateDefaultPinned, 'ACTIVE 존재 → defaultPinned=false').toBe(false)

  const sig = await openPrintAndSignature(page, apA.approvalId)
  state.shaA1 = await capture(page, 'outcome-01-approvalA-pinned-v1-before-edit')
  expect(sig.unpinnedBanner + sig.defaultPinnedBanner + sig.pinFailedBanner, 'pin 문서 배너 없음').toBe(0)
  expect(sig.docNo, 'v1=META_ROWS 있음').toBeGreaterThan(0)
  expect(sig.contentMarker, 'v1=CONTENT 없음').toBe(0)
  expect(sig.fieldLabel, 'v1=FIELD_TABLE 있음').toBeGreaterThan(0)
})

test('R4-OUT-S3 — 🔑핵심: 관리자 양식 수정(v2) 후 결재A 재인쇄 외형 불변(v1 유지, 픽셀 동일)', async ({ page }) => {
  test.skip(!state.approvalA, 'S2 선행 필요')
  const headers = await auth(page)
  const id = state.docTemplateId!
  const de = await page.request.post(`${API_BASE}/admin/groupware/document-templates/${id}/deactivate`, { headers })
  expect(de.ok(), `deactivate 실패: ${await de.text()}`).toBeTruthy()
  const up = await page.request.put(`${API_BASE}/admin/groupware/document-templates/${id}`, {
    headers, data: { docType: DOC_TYPE, name: '[QA-R4] 문서양식 v2(수정본)', schemaVersion: 1, document: V2_PAYLOAD },
  })
  expect(up.ok(), `update 실패: ${await up.text()}`).toBeTruthy()
  const re = await page.request.post(`${API_BASE}/admin/groupware/document-templates/${id}/activate`, { headers })
  expect(re.ok(), `re-activate 실패: ${await re.text()}`).toBeTruthy()
  expect((await re.json()).data.revision, '수정 후 revision=2').toBe(2)
  rawLog(`document-template ${id} modified → ACTIVE rev=2 (v2)`)

  const sig = await openPrintAndSignature(page, state.approvalA!)
  state.shaA1b = await capture(page, 'outcome-02-approvalA-reprint-after-edit-STILL-v1')
  expect(sig.docNo, '🔑 pin 불변: 수정 후에도 v1 문서번호 유지').toBeGreaterThan(0)
  expect(sig.contentMarker, '🔑 pin 불변: v2 본문 유입 금지').toBe(0)
  expect(sig.fieldLabel, '🔑 pin 불변: v1 필드 유지').toBeGreaterThan(0)
  expect(sig.unpinnedBanner + sig.defaultPinnedBanner + sig.pinFailedBanner).toBe(0)
  // 🔑 픽셀 동일 실측: 승인당시 v1 == 양식변경후 재인쇄
  expect(state.shaA1b, `🔑 SHA-256: 양식 변경 후 재인쇄가 승인당시 v1 과 픽셀 동일 (${state.shaA1})`).toBe(state.shaA1)
})

test('R4-OUT-S4 — 대조군: 수정 후 승인된 결재B = v2 외형 + rev2 각인 (A 와 픽셀 상이)', async ({ page }) => {
  test.skip(!state.docTemplateId, 'S3 선행 필요')
  const headers = await auth(page)
  const apB = await createApproval(page, headers, '[QA-R4] 결재B — 양식 수정 후 승인', '수정 후 rev2 각인 대상')
  state.approvalB = apB.approvalId
  const approved = await approve(page, headers, apB.approvalId)
  expect(approved.documentTemplateRevision, '결재B는 rev2 각인').toBe(2)

  const sig = await openPrintAndSignature(page, apB.approvalId)
  state.shaB = await capture(page, 'outcome-03-approvalB-pinned-v2')
  expect(sig.docNo, 'v2=META_ROWS 없음').toBe(0)
  expect(sig.contentMarker, 'v2=CONTENT 있음').toBeGreaterThan(0)
  expect(sig.fieldLabel, 'v2=FIELD_TABLE 없음').toBe(0)
  // 🔑 픽셀 상이 실측: v2(결재B) != v1(결재A) — presence-only 아님
  expect(state.shaB, `🔑 SHA-256: 결재B(v2) 는 결재A(v1) 와 픽셀 상이 (${state.shaA1})`).not.toBe(state.shaA1)
})

test('R4-OUT-S5 — ACTIVE-0: 전부 비활성화 → 결재C 승인 → defaultPinned=true + 기본양식 배너', async ({ page }) => {
  test.skip(!state.docTemplateId, 'S4 선행 필요')
  const headers = await auth(page)
  const list = await page.request.get(`${API_BASE}/admin/groupware/document-templates`, { headers })
  for (const t of ((await list.json()).data ?? [])) if (t.docType === DOC_TYPE && t.status === 'ACTIVE') {
    const r = await page.request.post(`${API_BASE}/admin/groupware/document-templates/${t.id}/deactivate`, { headers })
    expect(r.ok(), `deactivate 실패 ${t.id}`).toBeTruthy(); rawLog(`deactivated ${t.id}`)
  }
  const activeAfter = await page.request.get(`${API_BASE}/groupware/document-templates/active?docType=${DOC_TYPE}`, { headers })
  const activeBody = activeAfter.ok() ? (await activeAfter.json()).data : null
  rawLog(`ACTIVE-0 확인: HTTP ${activeAfter.status()} data=${JSON.stringify(activeBody)}`)
  expect(activeBody, 'ACTIVE 양식 0개').toBeNull()

  const apC = await createApproval(page, headers, '[QA-R4] 결재C — ACTIVE 부재 상태 승인', 'ACTIVE-0 각인 대상')
  state.approvalC = apC.approvalId
  const approved = await approve(page, headers, apC.approvalId)
  expect(approved.documentTemplateId, 'ACTIVE-0 → pin id NULL').toBeNull()
  expect(approved.documentTemplateDefaultPinned, '🚨 ACTIVE-0 승인 → defaultPinned=true 각인').toBe(true)

  const sig = await openPrintAndSignature(page, apC.approvalId)
  state.shaC = await capture(page, 'outcome-04-approvalC-active0-default-pinned')
  expect(sig.defaultPinnedBanner, '기본양식 고정 배너 노출').toBe(1)
  expect(sig.unpinnedBanner + sig.pinFailedBanner, '타 배너 배타').toBe(0)
  expect(sig.docNo, 'DEFAULT=META 있음').toBeGreaterThan(0)
  expect(sig.contentMarker, 'DEFAULT=CONTENT 있음').toBeGreaterThan(0)
  expect(sig.fieldLabel, 'DEFAULT=FIELD 있음').toBeGreaterThan(0)
})

test('R4-OUT-S6 — 🚨ACTIVE-0 불변: 새 ACTIVE(v3) 활성화 후 결재C 재인쇄 = 여전히 DEFAULT (픽셀 동일)', async ({ page }) => {
  test.skip(!state.approvalC, 'S5 선행 필요')
  const headers = await auth(page)
  const docCreate = await page.request.post(`${API_BASE}/admin/groupware/document-templates`, {
    headers, data: { docType: DOC_TYPE, name: '[QA-R4] 문서양식 v3(사후 활성)', schemaVersion: 1, document: V2_PAYLOAD },
  })
  expect(docCreate.status(), `v3 생성 실패: ${await docCreate.text()}`).toBe(201)
  const v3 = (await docCreate.json()).data
  state.v3TemplateId = v3.id
  const act = await page.request.post(`${API_BASE}/admin/groupware/document-templates/${v3.id}/activate`, { headers })
  expect(act.ok(), `v3 활성화 실패: ${await act.text()}`).toBeTruthy()
  const activeNow = await page.request.get(`${API_BASE}/groupware/document-templates/active?docType=${DOC_TYPE}`, { headers })
  expect((await activeNow.json()).data?.id, '현재 ACTIVE = v3').toBe(v3.id)
  rawLog(`document-template v3 id=${v3.id} ACTIVE (ACTIVE-0 승인 이후)`)

  const sig = await openPrintAndSignature(page, state.approvalC!)
  state.shaC2 = await capture(page, 'outcome-05-approvalC-STILL-default-after-new-active')
  expect(sig.defaultPinnedBanner, '🚨 기본양식 고정 배너 유지').toBe(1)
  expect(sig.docNo, '🚨 v3 활성화 후에도 DEFAULT 유지 (v3 였다면 문서번호 0)').toBeGreaterThan(0)
  expect(sig.fieldLabel, '🚨 DEFAULT FIELD 유지').toBeGreaterThan(0)
  // 🔑 픽셀 동일 실측: 신규 ACTIVE 활성화 후에도 승인당시 DEFAULT 와 동일
  expect(state.shaC2, `🔑 SHA-256: v3 활성화 후 재인쇄가 승인당시 DEFAULT 와 픽셀 동일 (${state.shaC})`).toBe(state.shaC)
})
