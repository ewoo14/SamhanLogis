import { resolveQaShotsDir } from '../support/qa-screenshot-dir'
/**
 * #845 DS-3a R4 라이브 QA — 결재 재인쇄 화면의 캐시 freshness 검증 (R3 fix 반영본, V13 배포본).
 *
 * ⚠️ 검증 범위(정직 고지):
 *   이 스펙은 R3 HIGH-1 fix 의 **freshness 메커니즘**(ApprovalDocView 의 approval 쿼리
 *   staleTime:0 + refetchOnMount:'always')을 **실서버·실 GUI**로 검증한다. 같은 브라우저 세션
 *   안에서 HashRouter 클라이언트측 네비게이션(reload 없음 → QueryClient 캐시 유지)으로 인쇄
 *   화면을 떠났다 되돌아올 때, 캐시를 그대로 쓰지 않고 approval 을 **매 mount 재조회**하는지를
 *   네트워크 GET 카운트로 확증한다. 이것이 "5분 내 재인쇄에 pin 이 무시되던" HIGH-1 결함의
 *   근본 수리(캐시 무효화)다.
 *
 *   ❗ 승인 당시 pin 외형의 end-to-end OUTCOME(신규 결재 승인→pin 각인→재인쇄 외형)은 이
 *   세션 환경에서 재현 불가하다: throwaway docType 은 결재선 config 가 없어 dev_master 단독
 *   승인 경로(CREATOR 단계)를 API 로 만들 수 없고(직접 DB insert 는 이 세션에서 차단),
 *   dev_master 의 유일 그룹은 "시스템 마스터 그룹"이라 결재 그룹으로 지정 불가하다. → OUTCOME
 *   은 R3 라이브QA(docs/qa/845-ds3a-r3-liveqa, 픽셀 해시+뮤테이션)가 동일 FE/SQL 코드로 이미
 *   실증했고, R4 는 그 코드의 **배포 확증 + freshness 메커니즘 무회귀**를 담당한다.
 *
 * 🚨 real-qa 실행 전제:
 *   실 게이트웨이(:8080, mock OFF) → 실 groupware-service(이 브랜치 jar, V13 적용) → 실 groupware_db.
 *   렌더러 = ds3a 워크트리 vite (기본 :5411, --strictPort).
 *   `*-real-qa.spec.ts` 명명 규칙상 CI 미실행(저장소 전체 real-qa 공통, pre-existing).
 */
import { expect, test, type Page } from '@playwright/test'
import * as path from 'path'
import * as fs from 'fs'
import { fileURLToPath } from 'url'

const _dirname =
  typeof __dirname !== 'undefined' ? __dirname : path.dirname(fileURLToPath(import.meta.url))
const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5411'
const API_BASE = process.env['API_BASE'] ?? 'http://localhost:8080'
const PASSWORD = process.env['DEV_PASSWORD'] ?? 'dev_p05_pass!'

/** 실 groupware_db 의 기존 APPROVED 결재(문서번호/제목이 실데이터). */
const APPROVAL_ID = process.env['APPROVAL_ID'] ?? '4d7a6c77-0b5f-4f4b-a1fe-5a01d8f732af'
const REAL_TITLE = process.env['REAL_TITLE'] ?? '월말 재고 실사 일정 결재'

const SHOTS = resolveQaShotsDir(path.resolve(_dirname, '../../../../docs/qa/845-ds3a-r4-liveqa'))
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

async function waitPrintLoaded(page: Page): Promise<void> {
  await page.waitForFunction(() => !document.body.innerText.includes('불러오는 중'), undefined, { timeout: 25000 })
  await expect(
    page.getByText('상세로 돌아가기').or(page.getByText('결재문서를 불러오지 못했습니다')).first(),
    'print 화면 진입 실패(대시보드 fallback 의심)',
  ).toBeVisible({ timeout: 15000 })
  await page.waitForTimeout(800)
}

/** 🔑 reload 없는 클라이언트측 hash 네비게이션 — QueryClient 캐시를 유지한 채 라우트 전환. */
async function clientNav(page: Page, hash: string): Promise<void> {
  await page.evaluate((h) => { window.location.hash = h }, hash)
}

test('R4 freshness — 인쇄 화면을 세션 내에서 떠났다 되돌아올 때 approval 을 매 mount 재조회(staleTime:0 + refetchOnMount:always)', async ({ page }) => {
  const login = await realLogin(page, 'dev_master')
  await installAuthStub(page, login)
  rawLog(`login dev_master role=${login.role} userId=${login.userId}`)
  rawLog(`대상 기존 APPROVED 결재 = ${APPROVAL_ID} (실데이터 제목="${REAL_TITLE}")`)

  // 브라우저 앱이 approval 상세를 GET 하는 횟수(같은 세션 누계). print/detail 공통 엔드포인트.
  let approvalGetCount = 0
  await page.route(`**/admin/groupware/approvals/${APPROVAL_ID}`, async (route) => {
    const req = route.request()
    if (req.method() === 'GET' && ['xhr', 'fetch'].includes(req.resourceType())) approvalGetCount += 1
    await route.continue()
  })

  // (1) 최초 인쇄 화면 진입(full load)
  await page.goto(`${BASE_URL}/#/groupware/approvals/${APPROVAL_ID}/print`, { waitUntil: 'domcontentloaded' })
  await waitPrintLoaded(page)
  await capture(page, '01-print-initial')
  // mock OFF + 실서버 확증 — 실 groupware_db 의 결재 제목이 화면에 렌더되어야 한다(mock 데이터 아님).
  await expect(page.getByText(REAL_TITLE).first(), 'mock OFF 실데이터 렌더 확증').toBeVisible({ timeout: 10000 })
  const c1 = approvalGetCount
  rawLog(`(1) 최초 인쇄 진입 후 approval GET 누계=${c1}`)
  expect(c1, '최초 진입에서 approval 을 실제로 GET').toBeGreaterThan(0)

  // (2) 🔑 클라이언트측으로 상세로 이동(reload 없음 → 캐시 유지) 후 즉시 재인쇄 = remount #1
  await clientNav(page, `#/groupware/approvals/${APPROVAL_ID}`)
  await page.waitForTimeout(700)
  const cDetail = approvalGetCount
  rawLog(`(2a) 상세로 클라이언트 이동 후 GET 누계=${cDetail}`)
  await clientNav(page, `#/groupware/approvals/${APPROVAL_ID}/print`)
  await waitPrintLoaded(page)
  await capture(page, '02-reprint-remount-1')
  const c2 = approvalGetCount
  rawLog(`(2b) 재인쇄 remount#1 후 approval GET 누계=${c2}`)
  expect(c2, '🔑 재인쇄 mount 가 approval 을 재조회(캐시 stale 사용 안 함) = refetchOnMount:always').toBeGreaterThan(cDetail)
  await expect(page.getByText(REAL_TITLE).first(), '재인쇄에도 실데이터 렌더').toBeVisible({ timeout: 10000 })

  // (3) 🔑 다시 떠났다 되돌아오기 = remount #2 (staleTime:0 — 직전 재조회 직후에도 또 재조회)
  await clientNav(page, `#/groupware/approvals/${APPROVAL_ID}`)
  await page.waitForTimeout(500)
  const cDetail2 = approvalGetCount
  await clientNav(page, `#/groupware/approvals/${APPROVAL_ID}/print`)
  await waitPrintLoaded(page)
  await capture(page, '03-reprint-remount-2')
  const c3 = approvalGetCount
  rawLog(`(3) 재인쇄 remount#2 후 approval GET 누계=${c3}`)
  expect(c3, '🔑 직전 재조회 직후 remount 도 또 재조회 = staleTime:0 (신선캐시 재사용 안 함)').toBeGreaterThan(cDetail2)

  rawLog(`freshness 요약: 최초=${c1} → remount#1 후=${c2} → remount#2 후=${c3} (매 mount 증가 = 캐시 무효화 동작)`)
})
