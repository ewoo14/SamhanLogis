import { resolveQaShotsDir } from '../support/qa-screenshot-dir'
/**
 * #729 게이트웨이 매출/매입 전표 admin 라우트 추가 — 404 해소 라이브 QA (2차 — 실데이터 검증).
 *
 * 근본원인 1(라우트 누락, 선행 fix): 게이트웨이에 `/admin/sales-slips`, `/admin/purchase-slips`,
 * `/admin/tax-invoices/inbound`, `/admin/tax-invoices/batch-from-sales-slips/**`
 * 라우트가 등록되어 있지 않아 전부 404 → 매출전표/매입전표/세금계산서 화면 진입 불가.
 * fix: `services/api-gateway/src/main/resources/application.yml` 에 4개 admin 라우트 추가.
 *
 * 근본원인 2(MultipleBagFetchException, 본 라운드 fix): 라우트 추가 후 4개 엔드포인트가 500 으로
 * 전환 — accounting-service 조회 쿼리가 다중 컬렉션(@OneToMany) fetch join 을 동시에 사용해
 * Hibernate MultipleBagFetchException 발생. fix 로 500 → 200 전환, accounting-service 재빌드 완료.
 *
 * 본 스펙(2차)은 실 로그인(dev_master) 세션으로 4개 화면에 진입한 뒤 **날짜 범위를 데이터가
 * 실재하는 구간(2026-01-01~2026-12-31)으로 확장**해 실데이터가 렌더링되고(에러 배너 없음,
 * DataTable 에 실 행 표시) 백엔드 응답이 200 인 것을 실증한다. 기본 조회 구간(당월 2026-07)은
 * 데이터가 없어 화면 진입만으론 빈 목록만 보임 — 날짜 필터를 넓혀야 실데이터 확인 가능.
 *
 * 단계별 캡처(docs/qa/729-gateway-admin-slip-route/):
 *  01 매출전표 목록 — GET /admin/sales-slips (확장 범위, ~2512건)
 *  02 매입전표 목록 — GET /admin/purchase-slips (확장 범위, ~35건)
 *  03 세금계산서 발행 묶음(후보 목록) — GET /admin/tax-invoices/batch-from-sales-slips/candidates
 *  04 수신 세금계산서 등록 — GET /admin/tax-invoices/inbound + GET /admin/purchase-slips
 *     (상단 매입전표 카드 — 이전 라운드엔 500 유발 에러배너, 본 라운드엔 정상 표시 확인)
 */
import { expect, test, type Locator, type Page } from '@playwright/test'
import * as path from 'path'
import * as fs from 'fs'
import { fileURLToPath } from 'url'

const _dirname =
  typeof __dirname !== 'undefined' ? __dirname : path.dirname(fileURLToPath(import.meta.url))
const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5199'
const API_BASE = process.env['API_BASE'] ?? 'http://localhost:8080'
const PASSWORD = process.env['DEV_PASSWORD'] ?? 'dev_p05_pass!'
const SHOTS = resolveQaShotsDir(path.resolve(_dirname, '../../../../docs/qa/729-gateway-admin-slip-route'))
fs.mkdirSync(SHOTS, { recursive: true })

// 데이터가 실재하는 구간 — 사전 curl 검증: sales-slips ~2512건 / purchase-slips ~35건 /
// batch candidates 실그룹(예 2026-05) 모두 2026 연중 범위에 분포. 기본 UI 구간(당월)은 공백.
const WIDE_FROM = '2026-01-01'
const WIDE_TO = '2026-12-31'

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

interface AdminResponseRecord {
  url: string
  method: string
  status: number
  body?: string
  /** GET 200 이고 payload 가 배열(또는 {data:[]}) 일 때 항목 수 — 그룹/행 개수 검증용. */
  itemCount?: number
}

/**
 * DataTable 실 데이터 행수 카운트 — 빈 상태 placeholder(`td.emptyCell`, colSpan, data-label
 * 없음)는 제외한다. 실 행은 컬럼마다 `td[data-label=헤더]` 를 갖는다(design-system DataTable.tsx)
 * — Vite CSS module 해시 클래스명에 의존하지 않는 안정적 셀렉터.
 */
async function countDataRows(container: Locator, tableIndex = 0): Promise<number> {
  return container.locator('table').nth(tableIndex).locator('tbody tr > td[data-label]:first-child').count()
}

test('게이트웨이 admin 라우트 4종 — 실데이터(2026 연중) 날짜범위 확장 + 200 응답 + 에러배너 없음 + 행 렌더 실증 (#729 MultipleBagFetchException fix 후)', async ({ page }) => {
  const login = await realLogin(page, 'dev_master')
  await installAuthStub(page, login)

  // 게이트웨이 :8080 경유 /admin/sales-slips, /admin/purchase-slips, /admin/tax-invoices/** 실 응답 캡처.
  // 4xx/5xx 는 body 도 함께 기록(원인 진단용). 200 GET 배열 응답은 전체 body 대신 항목 수만
  // 경량 기록(매출전표 2500+건 화면에서 콘솔 과다 출력 방지).
  const adminResponses: AdminResponseRecord[] = []
  page.on('response', (response) => {
    const url = response.url()
    if (
      url.includes('/admin/sales-slips') ||
      url.includes('/admin/purchase-slips') ||
      url.includes('/admin/tax-invoices')
    ) {
      const method = response.request().method()
      const status = response.status()
      const record: AdminResponseRecord = { url, method, status }
      adminResponses.push(record)
      console.log(`[ADMIN RESPONSE] ${method} ${url} -> ${status}`)
      if (status >= 400) {
        response
          .text()
          .then((body) => {
            record.body = body
            console.log(`[ADMIN RESPONSE BODY] ${method} ${url} -> ${status}\n${body}`)
          })
          .catch(() => undefined)
      } else if (method === 'GET') {
        response
          .json()
          .then((json: unknown) => {
            const arr = Array.isArray(json)
              ? json
              : Array.isArray((json as { data?: unknown })?.data)
                ? (json as { data: unknown[] }).data
                : null
            if (arr) {
              record.itemCount = arr.length
              console.log(`[ADMIN RESPONSE COUNT] ${method} ${url} -> ${arr.length}건`)
            }
          })
          .catch(() => undefined)
      }
    }
  })

  /**
   * 화면 진입 + testid 컨테이너 가시성 대기(NOT networkidle — SSE 연결이 열려있어 절대 끝나지
   * 않음) → 날짜 필터를 데이터 존재 구간(2026 연중)으로 확장 → 확장된 파라미터의 최종 응답
   * 도착까지 대기(waiter 는 fill 이전에 등록해 레이스 방지 — from 만 바뀐 중간 stale 요청은
   * to 조건 불일치로 자동 무시) → 에러배너 부재 확인 + 캡처 + 응답 상태/행수 검증.
   */
  async function visitWidenAndVerify(
    urlPath: string,
    testId: string,
    shotName: string,
    expectedGetPatterns: string[],
    dateInputIndices: { from: number; to: number },
    rowCountTables: { label: string; tableIndex: number; expectNonZero: boolean }[],
  ): Promise<void> {
    const marker = adminResponses.length

    await page.goto(`${BASE_URL}/#${urlPath}`, { waitUntil: 'domcontentloaded' })
    const container = page.getByTestId(testId)
    await expect(container).toBeVisible({ timeout: 30_000 })

    // 날짜 필터 확장(조회 시작/종료 — 발행일/수신일 입력이 있는 화면은 index 로 구분).
    const dateInputs = container.locator('input[type="date"]')
    const wideWaiters = expectedGetPatterns.map((pattern) =>
      page
        .waitForResponse(
          (res) =>
            res.request().method() === 'GET' &&
            res.url().includes(pattern) &&
            res.url().includes(`from=${WIDE_FROM}`) &&
            res.url().includes(`to=${WIDE_TO}`),
          { timeout: 30_000 },
        )
        .catch(() => null),
    )
    await dateInputs.nth(dateInputIndices.from).fill(WIDE_FROM)
    await dateInputs.nth(dateInputIndices.to).fill(WIDE_TO)
    await Promise.all(wideWaiters)
    // react-query 전역 설정 retry:1(기본 retryDelay) 정착 + 대량 행(최대 ~2512) 렌더 여유.
    await page.waitForTimeout(3_000)
    await capture(page, shotName)

    // error-banner 는 실 백엔드 상태를 그대로 반영하는 관찰 대상 — hard fail 로 나머지 화면
    // 방문을 막지 않도록 soft assertion 사용(끝까지 4개 화면 전부 캡처 + 기록 확보 목적).
    const bannerCount = await page.locator('.error-banner').count()
    if (bannerCount > 0) {
      const bannerText = await page.locator('.error-banner').first().innerText().catch(() => '(읽기 실패)')
      console.log(`[ERROR-BANNER] ${urlPath} — ${bannerCount}건 노출: "${bannerText}"`)
    }
    expect.soft(bannerCount, `${urlPath} 에서 error-banner ${bannerCount}건 노출`).toBe(0)

    const fresh = adminResponses.slice(marker)
    console.log(`[SCREEN] ${urlPath} — 신규 admin 응답 ${fresh.length}건`)
    for (const pattern of expectedGetPatterns) {
      const matched = fresh.filter((r) => r.method === 'GET' && r.url.includes(pattern))
      console.log(
        `[STATUS] GET ${pattern} ->`,
        matched.length
          ? matched.map((m) => `${m.status}${m.itemCount !== undefined ? `(${m.itemCount}건)` : ''}`).join(', ')
          : '(응답 미기록)',
      )
      expect.soft(matched.length, `GET ${pattern} 응답이 기록되지 않음 (라우트 미도달 가능성)`).toBeGreaterThan(0)
      for (const m of matched) {
        expect.soft(m.status, `GET ${pattern} 응답 ${m.status} (기대 200) — url=${m.url}`).toBe(200)
      }
    }

    for (const { label, tableIndex, expectNonZero } of rowCountTables) {
      const rowCount = await countDataRows(container, tableIndex)
      console.log(`[ROWS] ${urlPath} — ${label}: ${rowCount}행 렌더`)
      if (expectNonZero) {
        expect
          .soft(rowCount, `${urlPath} ${label} 이 0행 — 확장 범위(${WIDE_FROM}~${WIDE_TO})에도 데이터 미표시`)
          .toBeGreaterThan(0)
      }
    }
  }

  // 1) 매출전표 목록 — 2026 연중 확장 시 ~2512건 기대. input[type=date] 순서: from(0), to(1).
  await visitWidenAndVerify(
    '/accounting/sales-slips',
    'sales-accounting-slip-page',
    'sales-slips',
    ['/admin/sales-slips'],
    { from: 0, to: 1 },
    [{ label: '매출전표 목록', tableIndex: 0, expectNonZero: true }],
  )

  // 2) 매입전표 목록 — 2026 연중 확장 시 ~35건 기대. input[type=date] 순서: from(0), to(1).
  await visitWidenAndVerify(
    '/accounting/purchase-slips',
    'purchase-accounting-slip-page',
    'purchase-slips',
    ['/admin/purchase-slips'],
    { from: 0, to: 1 },
    [{ label: '매입전표 목록', tableIndex: 0, expectNonZero: true }],
  )

  // 3) 세금계산서 발행 묶음 — 매출전표 발행 후보(그룹당 매출전표 라인으로 flatMap 렌더).
  // input[type=date] 순서: 발행일(0, 미변경) / 조회시작(1) / 조회종료(2).
  await visitWidenAndVerify(
    '/accounting/tax-invoices/batch',
    'tax-invoice-batch-issue-page',
    'tax-invoice-batch',
    ['/admin/tax-invoices/batch-from-sales-slips/candidates'],
    { from: 1, to: 2 },
    [{ label: '발행 후보 매출전표 라인', tableIndex: 0, expectNonZero: true }],
  )

  // 4) 수신 세금계산서 등록 — 매입전표(POSTED) 카드(상단, 이전 라운드엔 500→에러배너) +
  // 수신 세금계산서 목록 카드(하단, 등록 이력 없으면 0건 가능 — 필수 아님).
  // input[type=date] 순서: 수신일(0, 미변경) / 조회시작(1) / 조회종료(2).
  await visitWidenAndVerify(
    '/accounting/tax-invoices/inbound',
    'tax-invoice-inbound-page',
    'tax-invoice-inbound',
    ['/admin/tax-invoices/inbound', '/admin/purchase-slips'],
    { from: 1, to: 2 },
    [
      { label: '매입전표(POSTED) 카드(상단)', tableIndex: 0, expectNonZero: true },
      { label: '수신 세금계산서 목록 카드(하단)', tableIndex: 1, expectNonZero: false },
    ],
  )

  console.log('[ALL ADMIN RESPONSES]', JSON.stringify(adminResponses, null, 2))
})
