import { resolveQaCredential } from '../../../../scripts/lib/qa-credentials.cjs'
/**
 * #845 DS-3b 실서버 라이브 QA 하네스.
 *
 * `*-real-qa.spec.ts` 규칙으로 mock CI에서 제외된다. 개발책임자가
 * AUDIT_BASE_URL/API_BASE/QA_DEV_DEFAULT_PASSWORD를 지정한 실 게이트웨이에서만 실행한다.
 * 고정된 throwaway docType을 매 실행 전 정리하고 종료 시 soft-delete한다.
 */
import { expect, test } from '@playwright/test'

const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5188'
const API_BASE = process.env['API_BASE'] ?? 'http://localhost:8080'
const PASSWORD = resolveQaCredential('QA_DEV_DEFAULT_PASSWORD')
const DOC_TYPE = 'GROUPWARE_QA_DS3B_EDITOR'

const V2_DOCUMENT = {
  paper: 'A4_PORTRAIT',
  bands: [
    {
      key: 'qa-header',
      kind: 'HEADER',
      elements: [
        { key: 'qa-title', type: 'TITLE' },
        { key: 'qa-approval', type: 'APPROVAL_GRID' },
        { key: 'qa-field', type: 'FIELD', binding: 'header.docNo', geometry: { x: 10, y: 20, w: 60, h: 8 }, style: { fontSize: 14, bold: true, align: 'center', border: true } },
      ],
    },
    {
      key: 'qa-body',
      kind: 'BODY',
      elements: [
        { key: 'qa-text', type: 'TEXT', text: 'DS-3b 실서버 왕복 검증', geometry: { x: 5, y: 5, w: 90, h: 10 } },
      ],
    },
    { key: 'qa-footer', kind: 'FOOTER', elements: [{ key: 'qa-closing', type: 'CLOSING' }] },
  ],
}

test('DS-3b 실서버 v2 저장·활성·조회 왕복', async ({ page }) => {
  const login = await page.request.post(`${API_BASE}/api/auth/login`, {
    data: { loginId: 'dev_master', password: PASSWORD },
  })
  expect(login.ok(), `실서버 로그인 실패: HTTP ${login.status()}`).toBeTruthy()
  const loginData = (await login.json()).data ?? {}
  const auth = { Authorization: `Bearer ${loginData.token}` }
  await page.addInitScript(
    ({ token, userId, role, fullName }: { token: string; userId: string; role: string; fullName: string }) => {
      Object.defineProperty(window, 'samhanAuth', {
        configurable: true,
        value: {
          getToken: async () => ({ token, userId, role, fullName, partnerCode: null }),
          setToken: async () => undefined,
          clearToken: async () => undefined,
        },
      })
    },
    {
      token: loginData.token ?? '',
      userId: loginData.userId ?? '',
      role: loginData.role ?? 'MASTER',
      fullName: loginData.displayName ?? '개발책임자',
    },
  )

  const existing = await page.request.get(`${API_BASE}/admin/groupware/document-templates`, { headers: auth })
  expect(existing.ok(), `문서 양식 목록 조회 실패: HTTP ${existing.status()}`).toBeTruthy()
  for (const template of ((await existing.json()).data ?? [])) {
    if (template.docType === DOC_TYPE) {
      const removed = await page.request.delete(`${API_BASE}/admin/groupware/document-templates/${template.id}`, { headers: auth })
      expect(removed.ok(), `잔여 throwaway 양식 삭제 실패: HTTP ${removed.status()}`).toBeTruthy()
    }
  }

  let templateId = ''
  try {
    const created = await page.request.post(`${API_BASE}/admin/groupware/document-templates`, {
      headers: auth,
      data: { docType: DOC_TYPE, name: 'DS-3b 실서버 검증 양식', schemaVersion: 2, document: V2_DOCUMENT },
    })
    expect(created.ok(), `v2 양식 생성 실패: HTTP ${created.status()}`).toBeTruthy()
    templateId = (await created.json()).data.id

    const activated = await page.request.post(`${API_BASE}/admin/groupware/document-templates/${templateId}/activate`, { headers: auth })
    expect(activated.ok(), `v2 양식 활성화 실패: HTTP ${activated.status()}`).toBeTruthy()

    const active = await page.request.get(`${API_BASE}/groupware/document-templates/active`, {
      headers: auth,
      params: { docType: DOC_TYPE },
    })
    expect(active.ok(), `v2 active 조회 실패: HTTP ${active.status()}`).toBeTruthy()
    const data = (await active.json()).data
    expect(data.schemaVersion).toBe(2)
    expect(data.document).toEqual(V2_DOCUMENT)

    await page.goto(`${BASE_URL}/#/groupware/document-templates/${templateId}/edit`, { waitUntil: 'domcontentloaded' })
    await expect(page.getByText('결재 문서 양식 편집기')).toBeVisible()
    await expect(page.getByText('사용 중인 양식은 직접 수정할 수 없습니다')).toBeVisible()
  } finally {
    if (templateId) {
      const removed = await page.request.delete(`${API_BASE}/admin/groupware/document-templates/${templateId}`, { headers: auth })
      expect(removed.ok(), `throwaway 양식 정리 실패: HTTP ${removed.status()}`).toBeTruthy()
    }
  }
})
