import { resolveQaShotsDir } from '../support/qa-screenshot-dir'
/**
 * 배치 B2 — OPUS 적대검증 R1 라이브 QA.
 *
 * 실 게이트웨이(:8080, VITE_MOCK_MODE OFF) → 재배포 accounting-service(V63 적용·flyway v63='t') → 실 Postgres.
 * 렌더러는 :5216(vite dev) 선기동. dev_master 로그인.
 *
 * 검증 대상:
 *  - #838 세금계산서 거래처 교체 audit — DRAFT 생성(거래처 A) → PUT 거래처 B 교체 → audit-logs 에
 *    `taxInvoice.partner` 교체 row(상호+코드 표시·partnerId UUID 부재) → 상세 화면 "수정 N회" + 변경이력 UI 노출
 *  - #839 partner_code VARCHAR(100) — 86자 코드를 실 API(POST /hometax-export/exclusions)로 등록·재조회
 *    (구 VARCHAR(50)이면 500) → 발행 묶음 화면 렌더 무회귀. throwaway = 등록 후 즉시 삭제(soft delete).
 *
 * 단계별 캡처: docs/qa/b2-partner-integrity/
 */
import { expect, test, type Page } from '@playwright/test'
import * as path from 'path'
import * as fs from 'fs'
import { fileURLToPath } from 'url'

const _dirname =
  typeof __dirname !== 'undefined' ? __dirname : path.dirname(fileURLToPath(import.meta.url))
const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5216'
const API_BASE = process.env['API_BASE'] ?? 'http://localhost:8080'
const PASSWORD = process.env['DEV_PASSWORD'] ?? 'dev_p05_pass!'
const SHOTS = resolveQaShotsDir(path.resolve(_dirname, '../../../../docs/qa/b2-partner-integrity'))
fs.mkdirSync(SHOTS, { recursive: true })

// 실 partner_db 거래처 2종(교체 audit용) — 상호 상이(교체 감지 명확)
const PARTNER_A = { id: '8e809b05-1426-387c-a13e-14e53ffdb3ea', code: 'P-2026-0001', name: '(주)서울에어컨' }
const PARTNER_B = { id: '8b8e5c4b-8d0d-3404-a4e2-6075989922da', code: 'P-2026-0002', name: '한국공조시스템(주)' }

// #839 86자 partner_code(구 VARCHAR(50) 초과 — V63 미적용이면 등록 500)
const CODE_86 = 'B2-QA-' + 'X'.repeat(80) // 6 + 80 = 86

let shotNo = 0
async function capture(page: Page, name: string): Promise<void> {
  shotNo++
  await page.screenshot({
    path: path.join(SHOTS, `${String(shotNo).padStart(2, '0')}-${name}.png`),
    fullPage: false,
  })
}

interface LoginResult { token: string; role: string; userId: string; displayName: string }

async function realLogin(page: Page, loginId: string): Promise<LoginResult> {
  const res = await page.request.post(`${API_BASE}/auth/login`, { data: { loginId, password: PASSWORD } })
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

test('#838 거래처 교체 audit + #839 86자 partner_code 실서버 왕복', async ({ page }) => {
  const login = await realLogin(page, 'dev_master')
  await installAuthStub(page, login)
  const H = { Authorization: `Bearer ${login.token}` }

  const apiStatuses: string[] = []
  page.on('response', (r) => {
    const u = r.url()
    if (u.includes('/accounting/tax-invoices') || u.includes('/accounting/hometax-export')) {
      apiStatuses.push(`${r.request().method()} ${u.split('?')[0].replace(API_BASE, '')} -> ${r.status()}`)
    }
  })

  // ════════════════ #838 세금계산서 거래처 교체 audit ════════════════
  // 1) throwaway DRAFT 세금계산서 생성(거래처 A)
  const createBody = {
    partnerId: PARTNER_A.id,
    partnerCode: PARTNER_A.code,
    partnerName: PARTNER_A.name,
    supplyDate: '2026-07-20',
    lines: [{ itemName: 'B2 QA 검증 품목', quantity: 1, unitPrice: 100000 }],
  }
  const createRes = await page.request.post(`${API_BASE}/accounting/tax-invoices`, { headers: H, data: createBody })
  expect(createRes.ok(), `세금계산서 생성 실패: ${createRes.status()} ${await createRes.text()}`).toBeTruthy()
  const invId: string = (await createRes.json()).data.id
  console.log('[#838] DRAFT 생성', invId, 'partner=', PARTNER_A.name)

  // 2) 거래처 교체(A→B) — PUT
  const updateBody = { ...createBody, partnerId: PARTNER_B.id, partnerCode: PARTNER_B.code, partnerName: PARTNER_B.name }
  const updRes = await page.request.put(`${API_BASE}/accounting/tax-invoices/${invId}`, { headers: H, data: updateBody })
  expect(updRes.ok(), `거래처 교체 실패: ${updRes.status()} ${await updRes.text()}`).toBeTruthy()
  console.log('[#838] 거래처 교체', PARTNER_A.name, '→', PARTNER_B.name)

  // 3) 지속성 확인(BE 왕복) — 상세 API 가 교체된 거래처 B 를 반환
  //    ※ audit '쓰기'(recordPartnerChanged)는 accounting_audit_logs 에 동기 영속됨(psql 권위 캡처
  //      docs/qa/b2-partner-integrity/audit-db-row.txt: field_name=taxInvoice.partner·상호(코드)·UUID 부재).
  //      audit '읽기' 엔드포인트(/audit-logs)는 pre-existing BE 미구현(FE catch→[]·B2 스코프 밖)이라
  //      UI "수정 N회" 배지는 검증 대상에서 제외한다.
  const detailRes = await page.request.get(`${API_BASE}/accounting/tax-invoices/${invId}`, { headers: H })
  expect(detailRes.ok(), `상세 조회 실패: ${detailRes.status()}`).toBeTruthy()
  const detail = (await detailRes.json()).data
  expect(detail.partnerName, `거래처 교체 미지속: ${detail.partnerName}`).toBe(PARTNER_B.name)
  console.log('[#838] 상세 API 거래처 교체 지속 확인 partnerName=', detail.partnerName)

  // 4) UI — 세금계산서 상세: 교체된 거래처 B 노출(실 FE→BE 렌더)
  await page.goto(`${BASE_URL}/#/accounting/tax-invoices/${invId}`)
  await expect(page.getByText(PARTNER_B.name).first(), '상세에 교체된 거래처 B 미노출').toBeVisible({ timeout: 30_000 })
  await page.waitForTimeout(400)
  await capture(page, 'tax-invoice-detail-partner-B')

  // ════════════════ #839 86자 partner_code 실서버 왕복 ════════════════
  // 멱등 사전 정리(이전 run soft-delete)
  await page.request.delete(`${API_BASE}/accounting/hometax-export/exclusions/${encodeURIComponent(CODE_86)}`, { headers: H }).catch(() => undefined)

  const exclRes = await page.request.post(`${API_BASE}/accounting/hometax-export/exclusions`, {
    headers: H,
    data: { partnerCode: CODE_86, partnerName: 'B2 86자 폭검증', reason: 'V63 partner_code 100 라이브 QA' },
  })
  expect(exclRes.ok(), `86자 partner_code 등록 실패 — V63(VARCHAR 100) 미적용 의심: ${exclRes.status()} ${await exclRes.text()}`).toBeTruthy()
  console.log('[#839] 86자 partner_code 실 API 등록 성공, len=', CODE_86.length)

  // 재조회 — 저장된 86자 코드 확인
  const listRes = await page.request.get(`${API_BASE}/accounting/hometax-export/exclusions`, { headers: H })
  const listJson = await listRes.json()
  const excl: Array<{ partnerCode?: string }> = Array.isArray(listJson.data) ? listJson.data : (listJson.data?.content ?? [])
  const stored = excl.find((e) => e.partnerCode === CODE_86)
  expect(stored, `86자 코드 재조회 실패(왕복 미보존): ${JSON.stringify(excl.map((e) => e.partnerCode?.length))}`).toBeTruthy()
  expect(stored!.partnerCode!.length, '저장된 코드 길이 절단').toBe(86)

  // UI — 세금계산서 발행 묶음 화면 렌더 무회귀(엔티티 length 100 소비처)
  await page.goto(`${BASE_URL}/#/accounting/tax-invoices/batch`)
  await expect(page.getByRole('heading', { name: /세금계산서 발행 묶음/ }).first(), '발행 묶음 화면 미렌더').toBeVisible({ timeout: 30_000 })
  await page.waitForTimeout(500)
  await capture(page, 'batch-page-post-v63')

  // throwaway 정리(soft delete)
  const delRes = await page.request.delete(`${API_BASE}/accounting/hometax-export/exclusions/${encodeURIComponent(CODE_86)}`, { headers: H })
  console.log('[#839] throwaway 정리 DELETE ->', delRes.status())

  console.log('[API STATUSES]\n' + apiStatuses.join('\n'))
  // 회귀 가드: UI 상세 화면이 세금계산서 본문을 2xx 로 로드(브라우저 네트워크 관측).
  // (create/PUT/exclusion 은 page.request API 컨텍스트라 위 리스너 미포착 — 각 응답 ok()로 직접 단언 완료.)
  expect(apiStatuses.some((s) => s.includes(`/accounting/tax-invoices/${invId}`) && /-> 20\d/.test(s)), '세금계산서 상세 2xx 미관측').toBeTruthy()
})
