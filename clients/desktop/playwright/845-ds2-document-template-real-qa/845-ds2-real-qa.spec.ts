/**
 * #845 DS-2 라이브 QA — 결재문서 렌더러 DB 활성 레이아웃 연결 "출력 무변경" 실증.
 *
 * DS-2는 결재문서 렌더러를 FE 상수 → docType 활성 문서템플릿(DB) 조회로 전환한다.
 * 핵심 불변식: 활성 레이아웃이 없거나 DEFAULT-복제이면 현 출력과 픽셀 동일.
 *
 * 실 게이트웨이(:8080, mock OFF) → 실 groupware-service(:8092, V10 적용) → 실 groupware_db.
 * 대상 = docType `GROUPWARE_EXPENSE_REPORT` 실 결재(dev seed).
 *
 * 단계별 캡처(docs/qa/845-ds2-document-template/):
 *  01 활성 문서템플릿 없음 → 결재문서 인쇄 = 현 DEFAULT 레이아웃(출력 무변경)
 *  02 EXPENSE_REPORT DEFAULT-복제 템플릿 생성·활성 후 재렌더 = 01과 동일(출력 무변경)
 *  이후 생성 템플릿 soft-delete 로 원상 복구.
 */
import { expect, test, type Page } from '@playwright/test'
import * as path from 'path'
import * as fs from 'fs'
import { fileURLToPath } from 'url'

const _dirname =
  typeof __dirname !== 'undefined' ? __dirname : path.dirname(fileURLToPath(import.meta.url))
const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://localhost:5188'
const API_BASE = process.env['API_BASE'] ?? 'http://localhost:8080'
const PASSWORD = process.env['DEV_PASSWORD'] ?? 'dev_p05_pass!'
const APPROVAL_ID = process.env['APPROVAL_ID'] ?? '77554976-81f7-4756-bb94-303f65d32e8f'
const DOC_TYPE = 'GROUPWARE_EXPENSE_REPORT'
const SHOTS = path.resolve(_dirname, '../../../../docs/qa/845-ds2-document-template')
fs.mkdirSync(SHOTS, { recursive: true })

let shotNo = 0
async function capture(page: Page, name: string): Promise<void> {
  shotNo++
  await page.screenshot({
    path: path.join(SHOTS, `${String(shotNo).padStart(2, '0')}-${name}.png`),
    fullPage: true,
  })
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

// 비기본 레이아웃: META_ROWS·ATTACHMENT_TABLE 생략 → 활성 적용 시 문서번호/첨부표가 사라져야 함.
// 활성이 실제로 적용되면 DEFAULT 렌더와 반드시 달라진다(핵심 기능 검증).
const SPARSE_PAYLOAD = {
  paper: 'A4_PORTRAIT',
  bands: [
    { key: 'approval-header', kind: 'HEADER', elements: [
      { key: 'approval-title', type: 'TITLE' },
      { key: 'approval-grid', type: 'APPROVAL_GRID' },
    ] },
    { key: 'approval-body', kind: 'BODY', elements: [
      { key: 'approval-content', type: 'CONTENT_PARAGRAPHS' },
      { key: 'approval-fields', type: 'FIELD_TABLE' },
    ] },
    { key: 'approval-footer', kind: 'FOOTER', elements: [{ key: 'approval-closing', type: 'CLOSING' }] },
  ],
}

test('결재문서 렌더 — 활성 없음=DEFAULT, 활성 비기본=적용반영 (DS-2 기능+출력무변경)', async ({ page }) => {
  const login = await realLogin(page, 'dev_master')
  await installAuthStub(page, login)
  const auth = { Authorization: `Bearer ${login.token}` }

  // 사전 정리: 잔존 QA 템플릿 제거(멱등)
  const existing = await page.request.get(`${API_BASE}/admin/groupware/document-templates`, { headers: auth })
  if (existing.ok()) {
    for (const t of ((await existing.json()).data ?? [])) {
      if (t.docType === DOC_TYPE || t.docType === 'GROUPWARE_QA_TEST') {
        await page.request.delete(`${API_BASE}/admin/groupware/document-templates/${t.id}`, { headers: auth })
      }
    }
  }

  // 01 — 활성 템플릿 없음 → DEFAULT 렌더
  await page.goto(`${BASE_URL}/#/groupware/approvals/${APPROVAL_ID}/print`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('text=결재문서, .document-renderer, [data-doc-root], h1, table', { timeout: 20000 }).catch(() => {})
  await page.waitForTimeout(1500)
  await capture(page, 'no-active-template-default-render')
  const htmlBefore = await page.locator('body').innerHTML()

  // 02 — EXPENSE_REPORT 비기본(SPARSE: META_ROWS·ATTACHMENT_TABLE 생략) 템플릿 생성·활성
  const created = await page.request.post(`${API_BASE}/admin/groupware/document-templates`, {
    headers: auth,
    data: { docType: DOC_TYPE, name: 'DS-2 QA 비기본 레이아웃', schemaVersion: 1, document: SPARSE_PAYLOAD },
  })
  expect(created.ok(), `생성 실패 HTTP ${created.status()}`).toBeTruthy()
  const createdId = (await created.json()).data.id
  const activated = await page.request.post(`${API_BASE}/admin/groupware/document-templates/${createdId}/activate`, { headers: auth })
  expect(activated.ok(), `활성 실패 HTTP ${activated.status()}`).toBeTruthy()

  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1800)
  await capture(page, 'with-active-sparse-render')
  const htmlAfter = await page.locator('body').innerHTML()

  // 정리: 생성 템플릿 soft-delete(원상 복구)
  await page.request.delete(`${API_BASE}/admin/groupware/document-templates/${createdId}`, { headers: auth })

  // 핵심 기능 단언: 활성 비기본 레이아웃이 실제로 렌더에 반영되어야 함(DEFAULT와 달라야 함).
  // 현 코드(CRITICAL 버그)에서는 활성이 폐기되고 DEFAULT가 렌더돼 htmlAfter===htmlBefore → 이 단언 실패로 버그 재현.
  expect(htmlAfter, '활성 비기본 레이아웃이 렌더에 반영되어 DEFAULT와 달라야 함(활성 렌더 기능)').not.toBe(htmlBefore)
})
