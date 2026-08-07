import { resolveQaCredential } from '../../../../scripts/lib/qa-credentials.cjs'
import { resolveQaShotsDir } from '../support/qa-screenshot-dir'
/**
 * #845 DS-3a R3 라이브 QA — 결재 재인쇄 "승인 당시 레이아웃 pin" 실서버 검증 (R2 fix 반영본).
 *
 * 🚨 R3 V-1: 이 스펙은 `*-real-qa.spec.ts` 명명 규칙상 `playwright.config.ts` testIgnore
 * 대상이며 `.github/workflows/`에 `real-qa` 매치가 0건이라 **CI에서 영구 미실행**이다(저장소
 * 전체 real-qa 85파일 공통, pre-existing — 이 PR 은 그 CI 편입을 시도하지 않는다). 수동
 * 실행 결과는 `docs/qa/845-ds3a-r3-liveqa/`에 보존돼 있다.
 *
 * 실행 전제 (0단계 배포 증명은 PR 보고서 참조):
 *   실 게이트웨이(:8080, mock OFF) → 실 groupware-service(이 브랜치 jar, V12 적용) → 실 groupware_db.
 *   렌더러 = ds3a 워크트리 vite (:5311, --strictPort — 타 워크트리 5173 선점과 격리).
 *
 * R1 하네스 대비 변경점:
 *  - R2 fix 로 ACTIVE-0 승인이 `document_template_default_pinned=true` 각인을 받으므로
 *    L4 계열 단언을 신규 계약(기본양식 고정 + 전용 배너)으로 전면 교체한다.
 *  - 결재선 config 의존을 없애고 `approverIds=[dev_master]` 로 생성한다.
 *    ⟹ auth DB `approval_line_config` 직삽 write 0건 (R1 은 직삽 후 hard-DELETE 했다).
 *  - 전용 결재유형 코드 `QA_DS3A_R3` 를 새로 만든다 ⟹ 공유 실 docType 의 양식 활성상태를
 *    단 한 번도 건드리지 않는다.
 *
 * 구별출력 설계 (presence-only 금지 — 세 렌더가 pairwise 전부 구별됨):
 *   v1      = META_ROWS + FIELD_TABLE            → docNo=1, contentMarker=0, fieldLabel=1
 *   v2 / v3 = CONTENT_PARAGRAPHS                 → docNo=0, contentMarker=1, fieldLabel=0
 *   DEFAULT = META_ROWS + CONTENT + FIELD_TABLE  → docNo=1, contentMarker=1, fieldLabel=1
 *
 * 캡처: docs/qa/845-ds3a-r3-liveqa/
 */
import { expect, test, type Page } from '@playwright/test'
import * as path from 'path'
import * as fs from 'fs'
import { fileURLToPath } from 'url'

const _dirname =
  typeof __dirname !== 'undefined' ? __dirname : path.dirname(fileURLToPath(import.meta.url))
const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5311'
const API_BASE = process.env['API_BASE'] ?? 'http://localhost:8080'
const PASSWORD = resolveQaCredential('QA_DEV_DEFAULT_PASSWORD')

/** 🚨 전용 throwaway 결재유형 — 공유 실 docType 의 양식 활성상태를 절대 건드리지 않는다. */
const QA_CODE = 'QA_DS3A_R3'
const DOC_TYPE = `GROUPWARE_${QA_CODE}`
const CONTENT_MARKER = 'R3-PIN-CONTENT-MARKER-본문식별자'
const FIELD_LABEL = 'R3 검증 사유'

const SHOTS = resolveQaShotsDir(path.resolve(_dirname, '../../../../docs/qa/845-ds3a-r3-liveqa'))
fs.mkdirSync(SHOTS, { recursive: true })
const RAW_LOG = path.resolve(SHOTS, '00-raw.txt')

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

/**
 * 재인쇄 화면을 열고 (문서번호, 본문마커, 필드라벨, 결재란, 배너 3종) 시그니처를 수집한다.
 *
 * dev 렌더러는 HashRouter 이므로 `/#/...` 경로를 쓴다. print 화면 고유 요소가 뜰 때까지
 * 명시 대기해 대시보드 fallback 렌더가 all-zero 시그니처로 위장 통과하는 것을 차단한다.
 */
async function openPrintAndSignature(page: Page, approvalId: string) {
  await page.goto(`${BASE_URL}/#/groupware/approvals/${approvalId}/print`, { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => !document.body.innerText.includes('불러오는 중'), undefined, { timeout: 25000 })
  await expect(
    page.getByText('상세로 돌아가기').or(page.getByText('결재문서를 불러오지 못했습니다')).first(),
    'print 화면 진입 실패(대시보드 fallback 의심)',
  ).toBeVisible({ timeout: 15000 })
  await page.waitForTimeout(1200)
  const signature = {
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
    { key: 'r3v1-header', kind: 'HEADER', elements: [
      { key: 'r3v1-title', type: 'TITLE' },
      { key: 'r3v1-meta', type: 'META_ROWS' },
      { key: 'r3v1-grid', type: 'APPROVAL_GRID' },
    ] },
    { key: 'r3v1-body', kind: 'BODY', elements: [{ key: 'r3v1-fields', type: 'FIELD_TABLE' }] },
    { key: 'r3v1-footer', kind: 'FOOTER', elements: [{ key: 'r3v1-closing', type: 'CLOSING' }] },
  ],
}

/** v2/v3 — CONTENT_PARAGRAPHS (문서번호·필드 없음) */
const V2_PAYLOAD = {
  paper: 'A4_PORTRAIT',
  bands: [
    { key: 'r3v2-header', kind: 'HEADER', elements: [
      { key: 'r3v2-title', type: 'TITLE' },
      { key: 'r3v2-grid', type: 'APPROVAL_GRID' },
    ] },
    { key: 'r3v2-body', kind: 'BODY', elements: [{ key: 'r3v2-content', type: 'CONTENT_PARAGRAPHS' }] },
    { key: 'r3v2-footer', kind: 'FOOTER', elements: [{ key: 'r3v2-closing', type: 'CLOSING' }] },
  ],
}

const state: {
  login?: LoginResult
  inputTemplateId?: string
  docTemplateId?: string
  v3TemplateId?: string
  approvalA?: string
  approvalB?: string
  approvalC?: string
} = {}

async function auth(page: Page): Promise<{ Authorization: string }> {
  if (!state.login) state.login = await realLogin(page, 'dev_master')
  await installAuthStub(page, state.login)
  return { Authorization: `Bearer ${state.login.token}` }
}

async function createApproval(page: Page, headers: Record<string, string>, title: string, reason: string) {
  const res = await page.request.post(`${API_BASE}/admin/groupware/approvals`, {
    headers,
    data: {
      requesterId: state.login!.userId,
      title,
      content: `${CONTENT_MARKER} — ${reason}`,
      // 결재선은 auth_db approval_line_config 의 CREATOR 단계(전용 docType 한정 1행)로 구성된다.
      // dev 환경에서 EXECUTIVE_OFFICE 부서 계정은 dev_master 뿐이고 "요청자 본인은 결재자가 될 수
      // 없다"는 검증(ApprovalLineService#validateApproverChain)이 override 결재자에만 걸리므로,
      // 단일 계정으로 승인까지 도달하는 유일한 실서버 경로가 CREATOR 단계다.
      approverIds: [],
      templateId: state.inputTemplateId,
      fieldValues: { r3_reason: reason },
    },
  })
  expect(res.status(), `결재 생성 실패(${title}): ${await res.text()}`).toBe(201)
  const d = (await res.json()).data
  rawLog(`approval created id=${d.approvalId} no=${d.approvalNo} status=${d.status} title=${title}`)
  return d
}

async function approve(page: Page, headers: Record<string, string>, approvalId: string) {
  const res = await page.request.put(`${API_BASE}/admin/groupware/approvals/${approvalId}/approve`, {
    headers, data: {},
  })
  expect(res.ok(), `승인 실패(${approvalId}): ${await res.text()}`).toBeTruthy()
  const d = (await res.json()).data
  rawLog(`approved ${approvalId} → status=${d.status} pin=(${d.documentTemplateId}, ${d.documentTemplateRevision}) defaultPinned=${d.documentTemplateDefaultPinned}`)
  return d
}

// ─────────────────────────────────────────────────────────────────────────────

test('R3-S1 — throwaway 결재유형/문서양식 v1 생성 + 활성화 (공유 docType 무접촉)', async ({ page }) => {
  const headers = await auth(page)
  rawLog(`login dev_master role=${state.login!.role} userId=${state.login!.userId}`)

  // 멱등 사전정리 — 이전 R3 실행 잔여 throwaway 만 대상
  const tplList = await page.request.get(`${API_BASE}/admin/groupware/approval-templates`, { headers })
  if (tplList.ok()) {
    for (const t of ((await tplList.json()).data ?? [])) {
      if (t.code === QA_CODE) {
        await page.request.delete(`${API_BASE}/admin/groupware/approval-templates/${t.id}`, { headers })
        rawLog(`pre-clean soft-deleted leftover approval-template ${t.id}`)
      }
    }
  }
  const docList = await page.request.get(`${API_BASE}/admin/groupware/document-templates`, { headers })
  if (docList.ok()) {
    for (const t of ((await docList.json()).data ?? [])) {
      if (t.docType === DOC_TYPE) {
        await page.request.delete(`${API_BASE}/admin/groupware/document-templates/${t.id}`, { headers })
        rawLog(`pre-clean soft-deleted leftover document-template ${t.id}`)
      }
    }
  }

  const created = await page.request.post(`${API_BASE}/admin/groupware/approval-templates`, {
    headers,
    data: {
      code: QA_CODE, name: '[QA-R3] DS-3a pin 검증 유형', description: 'R3 라이브QA 전용 throwaway',
      active: true, displayOrder: 900,
      fields: [{ fieldKey: 'r3_reason', label: FIELD_LABEL, fieldType: 'TEXT', required: false, displayOrder: 1 }],
    },
  })
  expect(created.status(), `결재유형 생성 실패: ${await created.text()}`).toBe(201)
  state.inputTemplateId = (await created.json()).data.id
  rawLog(`approval-template created id=${state.inputTemplateId} code=${QA_CODE} → docType=${DOC_TYPE}`)

  const docCreate = await page.request.post(`${API_BASE}/admin/groupware/document-templates`, {
    headers, data: { docType: DOC_TYPE, name: '[QA-R3] 문서양식 v1', schemaVersion: 1, document: V1_PAYLOAD },
  })
  expect(docCreate.status(), `문서양식 v1 생성 실패: ${await docCreate.text()}`).toBe(201)
  const tpl = (await docCreate.json()).data
  state.docTemplateId = tpl.id
  const act = await page.request.post(`${API_BASE}/admin/groupware/document-templates/${tpl.id}/activate`, { headers })
  expect(act.ok(), `v1 활성화 실패: ${await act.text()}`).toBeTruthy()
  const active = (await act.json()).data
  expect(active.status).toBe('ACTIVE')
  expect(active.revision).toBe(1)
  rawLog(`document-template v1 id=${tpl.id} ACTIVE rev=1`)
})

test('R3-S2 — 일반 pin 경로: 결재A 승인 → (v1, rev1) 각인 + GUI 재인쇄 v1 외형', async ({ page }) => {
  test.skip(!state.docTemplateId, 'S1 선행 필요')
  const headers = await auth(page)

  const apA = await createApproval(page, headers, '[QA-R3] 결재A — 양식 수정 전 승인', '수정 전 승인 pin 대상')
  state.approvalA = apA.approvalId
  const approved = await approve(page, headers, apA.approvalId)
  expect(approved.status).toBe('APPROVED')
  expect(approved.documentTemplateId, 'APPROVED 전이 시 documentTemplateId 각인').toBe(state.docTemplateId)
  expect(approved.documentTemplateRevision, 'revision=1 각인').toBe(1)
  expect(approved.documentTemplateDefaultPinned, 'ACTIVE 존재 → defaultPinned=false').toBe(false)

  const sig = await openPrintAndSignature(page, apA.approvalId)
  await capture(page, '01-approvalA-pinned-v1-before-edit')
  expect(sig.unpinnedBanner, 'pin 문서에 미pin 배너 금지').toBe(0)
  expect(sig.defaultPinnedBanner, 'pin 문서에 기본양식 고정 배너 금지').toBe(0)
  expect(sig.pinFailedBanner).toBe(0)
  expect(sig.docNo, 'v1=META_ROWS 있음').toBeGreaterThan(0)
  expect(sig.contentMarker, 'v1=CONTENT_PARAGRAPHS 없음').toBe(0)
  expect(sig.fieldLabel, 'v1=FIELD_TABLE 있음').toBeGreaterThan(0)
})

test('R3-S3 — 🚨핵심(일반 pin): 관리자 양식 수정 후 결재A 재인쇄 외형 불변(v1 유지)', async ({ page }) => {
  test.skip(!state.approvalA, 'S2 선행 필요')
  const headers = await auth(page)
  const id = state.docTemplateId!

  const de = await page.request.post(`${API_BASE}/admin/groupware/document-templates/${id}/deactivate`, { headers })
  expect(de.ok(), `deactivate 실패: ${await de.text()}`).toBeTruthy()
  const up = await page.request.put(`${API_BASE}/admin/groupware/document-templates/${id}`, {
    headers, data: { docType: DOC_TYPE, name: '[QA-R3] 문서양식 v2(수정본)', schemaVersion: 1, document: V2_PAYLOAD },
  })
  expect(up.ok(), `update 실패: ${await up.text()}`).toBeTruthy()
  const re = await page.request.post(`${API_BASE}/admin/groupware/document-templates/${id}/activate`, { headers })
  expect(re.ok(), `re-activate 실패: ${await re.text()}`).toBeTruthy()
  expect((await re.json()).data.revision, '수정 후 revision=2').toBe(2)
  rawLog(`document-template ${id} modified → ACTIVE rev=2 (v2)`)

  const sig = await openPrintAndSignature(page, state.approvalA!)
  await capture(page, '02-approvalA-reprint-after-edit-STILL-v1')
  expect(sig.docNo, '🚨 pin 불변식: 수정 후에도 v1 문서번호 행 유지').toBeGreaterThan(0)
  expect(sig.contentMarker, '🚨 pin 불변식: v2 본문 요소 유입 금지').toBe(0)
  expect(sig.fieldLabel, '🚨 pin 불변식: v1 필드 테이블 유지').toBeGreaterThan(0)
  expect(sig.unpinnedBanner + sig.defaultPinnedBanner + sig.pinFailedBanner, '배너 없음').toBe(0)
})

test('R3-S4 — 대조군: 수정 후 승인된 결재B = v2 외형 + rev2 각인', async ({ page }) => {
  test.skip(!state.docTemplateId, 'S3 선행 필요')
  const headers = await auth(page)

  const apB = await createApproval(page, headers, '[QA-R3] 결재B — 양식 수정 후 승인', '수정 후 승인 rev2 각인 대상')
  state.approvalB = apB.approvalId
  const approved = await approve(page, headers, apB.approvalId)
  expect(approved.documentTemplateId).toBe(state.docTemplateId)
  expect(approved.documentTemplateRevision, '결재B는 rev2 각인').toBe(2)
  expect(approved.documentTemplateDefaultPinned).toBe(false)

  const sig = await openPrintAndSignature(page, apB.approvalId)
  await capture(page, '03-approvalB-pinned-v2')
  expect(sig.docNo, 'v2=META_ROWS 없음').toBe(0)
  expect(sig.contentMarker, 'v2=CONTENT_PARAGRAPHS 있음').toBeGreaterThan(0)
  expect(sig.fieldLabel, 'v2=FIELD_TABLE 없음').toBe(0)
  expect(sig.unpinnedBanner + sig.defaultPinnedBanner + sig.pinFailedBanner).toBe(0)
})

test('R3-S5 — ACTIVE-0 경로: 전부 비활성화 → 결재C 승인 → defaultPinned=true 각인 + 기본양식 렌더', async ({ page }) => {
  test.skip(!state.docTemplateId, 'S4 선행 필요')
  const headers = await auth(page)

  // 전부 비활성화 (이 throwaway docType 한정)
  const list = await page.request.get(`${API_BASE}/admin/groupware/document-templates`, { headers })
  for (const t of ((await list.json()).data ?? [])) {
    if (t.docType === DOC_TYPE && t.status === 'ACTIVE') {
      const r = await page.request.post(`${API_BASE}/admin/groupware/document-templates/${t.id}/deactivate`, { headers })
      expect(r.ok(), `deactivate 실패 ${t.id}`).toBeTruthy()
      rawLog(`deactivated ${t.id} (${DOC_TYPE})`)
    }
  }
  const activeAfter = await page.request.get(`${API_BASE}/groupware/document-templates/active?docType=${DOC_TYPE}`, { headers })
  const activeBody = activeAfter.ok() ? (await activeAfter.json()).data : null
  rawLog(`ACTIVE-0 확인: HTTP ${activeAfter.status()} data=${JSON.stringify(activeBody)}`)
  expect(activeBody, 'ACTIVE 양식 0개여야 함').toBeNull()

  const apC = await createApproval(page, headers, '[QA-R3] 결재C — ACTIVE 양식 부재 상태 승인', 'ACTIVE-0 각인 대상')
  state.approvalC = apC.approvalId
  const approved = await approve(page, headers, apC.approvalId)
  expect(approved.status).toBe('APPROVED')
  expect(approved.documentTemplateId, 'ACTIVE-0 → pin id NULL').toBeNull()
  expect(approved.documentTemplateRevision, 'ACTIVE-0 → pin revision NULL').toBeNull()
  expect(approved.documentTemplateDefaultPinned, '🚨 R2 BLOCKING fix: ACTIVE-0 승인은 defaultPinned=true 각인').toBe(true)

  const sig = await openPrintAndSignature(page, apC.approvalId)
  await capture(page, '04-approvalC-active0-default-pinned')
  expect(sig.defaultPinnedBanner, '기본양식 고정 배너 노출').toBe(1)
  expect(sig.unpinnedBanner, '미pin 배너와 배타').toBe(0)
  expect(sig.pinFailedBanner).toBe(0)
  expect(sig.docNo, 'DEFAULT=META_ROWS 있음').toBeGreaterThan(0)
  expect(sig.contentMarker, 'DEFAULT=CONTENT_PARAGRAPHS 있음').toBeGreaterThan(0)
  expect(sig.fieldLabel, 'DEFAULT=FIELD_TABLE 있음').toBeGreaterThan(0)
})

test('R3-S6 — 🚨🚨핵심(BLOCKING fix): 새 ACTIVE 활성화 후 결재C 재인쇄 = 여전히 기본양식', async ({ page }) => {
  test.skip(!state.approvalC, 'S5 선행 필요')
  const headers = await auth(page)

  const docCreate = await page.request.post(`${API_BASE}/admin/groupware/document-templates`, {
    headers, data: { docType: DOC_TYPE, name: '[QA-R3] 문서양식 v3(사후 활성)', schemaVersion: 1, document: V2_PAYLOAD },
  })
  expect(docCreate.status(), `v3 생성 실패: ${await docCreate.text()}`).toBe(201)
  const v3 = (await docCreate.json()).data
  state.v3TemplateId = v3.id
  const act = await page.request.post(`${API_BASE}/admin/groupware/document-templates/${v3.id}/activate`, { headers })
  expect(act.ok(), `v3 활성화 실패: ${await act.text()}`).toBeTruthy()
  rawLog(`document-template v3 id=${v3.id} ACTIVE — ACTIVE-0 승인 이후 신규 활성화`)

  // 활성 양식이 실제로 v3(=v2 payload)로 바뀌었음을 먼저 확증한다 (측정 대상 존재 증명)
  const activeNow = await page.request.get(`${API_BASE}/groupware/document-templates/active?docType=${DOC_TYPE}`, { headers })
  const activeNowData = (await activeNow.json()).data
  expect(activeNowData?.id, '현재 ACTIVE = v3').toBe(v3.id)
  rawLog(`현재 ACTIVE 확인 → ${activeNowData?.id} (${activeNowData?.name})`)

  const sig = await openPrintAndSignature(page, state.approvalC!)
  await capture(page, '05-approvalC-STILL-default-after-new-active')
  expect(sig.defaultPinnedBanner, '🚨 기본양식 고정 배너 유지').toBe(1)
  expect(sig.docNo, '🚨 BLOCKING fix: v3 활성화 후에도 DEFAULT(문서번호 있음) 유지').toBeGreaterThan(0)
  expect(sig.fieldLabel, '🚨 BLOCKING fix: DEFAULT 의 FIELD_TABLE 유지 — v3 였다면 0').toBeGreaterThan(0)
  expect(sig.contentMarker, 'DEFAULT 본문 유지').toBeGreaterThan(0)
})

test('R3-S7 — 일반 pin 문서도 v3 활성화에 영향받지 않음(결재A=v1, 결재B=v2 유지)', async ({ page }) => {
  test.skip(!state.approvalA || !state.approvalB, 'S6 선행 필요')
  await auth(page)

  const sigA = await openPrintAndSignature(page, state.approvalA!)
  await capture(page, '06-approvalA-STILL-v1-after-v3')
  expect(sigA.docNo).toBeGreaterThan(0)
  expect(sigA.contentMarker, '결재A 는 v1 — 본문 없음').toBe(0)
  expect(sigA.fieldLabel).toBeGreaterThan(0)

  const sigB = await openPrintAndSignature(page, state.approvalB!)
  await capture(page, '07-approvalB-STILL-v2-after-v3')
  expect(sigB.docNo, '결재B 는 v2 — 문서번호 없음').toBe(0)
  expect(sigB.contentMarker).toBeGreaterThan(0)
  expect(sigB.fieldLabel).toBe(0)
})

test('R3-S8 — pin 조회 실패 경로: 전용 고지 배너 + 재시도 버튼 (R1 H-2 fix)', async ({ page }) => {
  test.skip(!state.approvalA, 'S2 선행 필요')
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
  await capture(page, '08-pin-fetch-failed-notice')
  rawLog(`S8 aborted revision requests=${aborted}`)
  expect(aborted, 'revision 조회가 실제로 차단됨').toBeGreaterThan(0)
  expect(sig.pinFailedBanner, '🚨 무고지 강하 금지 — 전용 고지 배너').toBe(1)
  await expect(page.locator('[data-testid="approval-reprint-pin-failed-notice"] button'), '재시도 버튼').toBeVisible()
  await page.unroute('**/groupware/document-templates/*/revisions/*')
})

test('R3-S9 — 🚨인쇄 매체: 배너 3종이 종이 출력물에서 소거되는지 (H-1 fix)', async ({ page }) => {
  test.skip(!state.approvalC, 'S5 선행 필요')
  await auth(page)
  await openPrintAndSignature(page, state.approvalC!)
  await capture(page, '09a-approvalC-screen-media')

  await page.emulateMedia({ media: 'print' })
  await page.waitForTimeout(400)
  const bannerVisible = await page.locator('[data-testid="approval-reprint-default-pinned-notice"]').isVisible()
  const backLinkVisible = await page.getByText('상세로 돌아가기').isVisible().catch(() => false)
  // 문서 본체는 인쇄물에 남아야 한다 — 배너만 사라진 것이지 화면 전체가 빈 것이 아님을 증명한다.
  const gridVisible = await page.locator('section.print-approval-section').first().isVisible().catch(() => false)
  rawLog(`S9 print-media: bannerVisible=${bannerVisible} backLinkVisible=${backLinkVisible} approvalGridVisible=${gridVisible}`)
  await capture(page, '09b-approvalC-print-media-emulated')
  await page.pdf({ path: path.join(SHOTS, '09c-approvalC-print-output.pdf'), format: 'A4', printBackground: true })

  expect(backLinkVisible, 'print CSS 적용 증명 — no-print 토올바는 사라져야 함').toBe(false)
  expect(gridVisible, '문서 본체(결재란)는 인쇄물에 남아야 함 — 빈 화면 false-green 차단').toBe(true)
  expect(bannerVisible, '🚨 배너가 종이 출력물에 유출되면 안 됨').toBe(false)
  await page.emulateMedia({ media: null })
})

/**
 * legacy(pre-V12 미pin) APPROVED 문서의 GUI 고지 검증.
 *
 * ⚠️ 이 저장소 groupware_db 에는 docType 을 가진 pre-V12 APPROVED 문서가 0건이다
 *    (실측: SELECT count(*) FROM approval_lines WHERE status='APPROVED' AND document_type IS NOT NULL → 0).
 *    따라서 legacy 상태를 관측할 자연 피검체가 없어, S1~S9 종료 후 **QA 전용 결재B** 의 pin 컬럼만
 *    직접 비워 legacy 행 형상을 만든 뒤 별도 run 으로 실 FE 렌더를 관측한다. 공유 실데이터 무접촉.
 *    실행: LEGACY_APPROVAL_ID=<결재B id> npx playwright test ... --grep "R3-S10"
 */
test('R3-S10 — legacy(미pin) 상태 GUI 고지: 미pin 배너 + 현재 ACTIVE 렌더', async ({ page }) => {
  const legacyId = process.env['LEGACY_APPROVAL_ID'] ?? state.approvalB
  test.skip(!legacyId, 'LEGACY_APPROVAL_ID 필요(별도 run)')
  await auth(page)
  const sig = await openPrintAndSignature(page, legacyId!)
  await capture(page, '10-legacy-unpinned-notice')
  rawLog(`S10 legacy 관측 ${legacyId} → ${JSON.stringify(sig)}`)
  expect(sig.unpinnedBanner, 'legacy 미pin APPROVED → 미pin 고지 배너').toBe(1)
  expect(sig.defaultPinnedBanner, 'defaultPinned 배너와 배타').toBe(0)
  // 현재 ACTIVE = v3(=v2 payload) → 문서번호 없음 = "현재 양식으로 표시됨" 의 실증
  expect(sig.docNo, '현재 ACTIVE(v3) 로 표시 — 문서번호 없음').toBe(0)
  expect(sig.contentMarker).toBeGreaterThan(0)
})
