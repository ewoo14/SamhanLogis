import { resolveQaShotsDir } from '../support/qa-screenshot-dir'
/**
 * #711 분개 상세 라인 테이블 열 재배분 — 실서버 GUI 실증 (mock OFF).
 * #714 후속 — 1024px(앱 minWidth) 열 압축 회귀 방지 케이스 추가.
 *
 * 캡처(docs/qa/journal-detail-column-widths/screenshots/):
 *  01 분개 상세 전폭 — 차변 좌측 당김·거래처 확대·합계 행 정렬(HIGH fix 검증)
 *  02 라인 테이블+합계 클로즈업 — 차/대 합계가 각 열 아래 정렬
 *  03 분개장 목록(역분개 필터) — 구 J- 형식 시드 정리 후 중복 부재 실증
 *  04 1024px(minWidth) 열 압축 회귀 방지(전) — 전 열 spec 폭 유지 실측(#714)
 *  05 1024px(minWidth) 메모 값 셀 가로 스크롤 후 뷰포트 진입(#714)
 *  01(mobile) 모바일 합계 카드 클로즈업 — 차변/대변 분리 렌더(결합 문자열 개행 위험 해소, Opus 재검 HIGH fix)
 *
 * #714 — 분개 상세 라인 테이블은 원래 메모 열이 width 미지정(auto 잔여폭)이라 좁은 폭에서
 * 급격히 압축됐다(#711 QA 라운드 실측: 1024px 서 20px, 헤더 "메"만 가시·값 완전 비가시). 후속
 * 수정(PR #737)이 메모 열에도 명시 고정폭(180px)을 부여 + JournalDetailPage 로컬 wrapper
 * (global.css `.journal-detail-table-scroll` overflow-x:auto + `.journal-detail-line-table`
 * min-width:860px)를 추가해 컨테이너가 열 합(860px)보다 좁아지면 압축 대신 가로 스크롤로 전환되게
 * 했다 — 아래 1024px 케이스가 이 상태를 실측으로 고정한다(회귀 시 즉시 RED).
 *
 * 정상 실행 기대값 = 3 passed + 3 skipped (project 상호배타 skip — 데스크톱 전용 2건(1440px 재배분+
 * 1024px 회귀 가드)·모바일 전용 1건이 서로 다른 project 를 skip). #714 케이스는 별도 project 를
 * 추가하지 않고 데스크톱 project 안에서 `page.setViewportSize`로 1024px 로 축소해 검증한다(기존
 * 2-project 매트릭스·스크린샷 넘버링 보존, 최소 파급).
 */
import { expect, test, type Locator, type Page } from '@playwright/test'
import * as path from 'path'
import * as fs from 'fs'
import { fileURLToPath } from 'url'

const _dirname =
  typeof __dirname !== 'undefined' ? __dirname : path.dirname(fileURLToPath(import.meta.url))
const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5175'
const API_BASE = process.env['API_BASE'] ?? 'http://localhost:8080'
const PASSWORD = process.env['DEV_PASSWORD'] ?? 'dev_p05_pass!'
const SHOTS = resolveQaShotsDir(path.resolve(_dirname, '../../../../docs/qa/journal-detail-column-widths/screenshots'))
fs.mkdirSync(SHOTS, { recursive: true })

let shotNo = 0
async function capture(page: Page, name: string): Promise<void> {
  shotNo++
  await page.screenshot({
    path: path.join(SHOTS, `${String(shotNo).padStart(2, '0')}-${name}.png`),
    fullPage: false,
  })
}

async function captureElement(
  page: Page,
  locator: ReturnType<Page['locator']>,
  name: string,
): Promise<void> {
  shotNo++
  await locator.screenshot({ path: path.join(SHOTS, `${String(shotNo).padStart(2, '0')}-${name}.png`) })
}

interface LoginResult { token: string; role: string; userId: string; displayName: string }

interface JournalSummaryRow {
  id: string
  journalNo: string
  // BE 원 필드명(JournalResponse/JournalDetailResponse 공통: description) — 말줄임 대상
  // 동적 탐색(목록 1차 정렬)에 사용(Opus 재검 LOW → 라이브 QA FAIL 후속).
  description: string | null
}

interface JournalDetail extends JournalSummaryRow {
  totalDebit: string
  totalCredit: string
  // BE 원 필드명(JournalLineResponse: debitAmount/creditAmount/memo, BigDecimal/String) —
  // 라인 레벨 값-라벨 배정(swap) 검증 + 말줄임 대상 동적 탐색에 사용(Opus 재검 MED/LOW, #711 fix2/fix3).
  lines: Array<{
    id: string
    lineNo: number
    debitAmount: string
    creditAmount: string
    memo: string | null
  }>
}

function fmtKrw(raw: string): string {
  const n = Number.parseInt(raw, 10)
  if (!Number.isFinite(n)) return raw
  if (n === 0) return '—'
  return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

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

async function getJournalDetail(page: Page, token: string, id: string): Promise<JournalDetail> {
  const res = await page.request.get(`${API_BASE}/accounting/journals/${id}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  expect(res.ok(), `분개 상세 조회 실패(${id}): HTTP ${res.status()}`).toBeTruthy()
  return (await res.json()).data as JournalDetail
}

async function findReversedJournalWithLines(page: Page, token: string): Promise<JournalDetail | undefined> {
  for (let pageNo = 0; pageNo < 10; pageNo++) {
    const res = await page.request.get(`${API_BASE}/accounting/journals?status=REVERSED&page=${pageNo}&size=50`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(res.ok(), `분개 목록 조회 실패: HTTP ${res.status()}`).toBeTruthy()
    const rows = ((await res.json()).data?.content ?? []) as JournalSummaryRow[]
    for (const row of rows) {
      const detail = await getJournalDetail(page, token, row.id)
      if ((detail.lines ?? []).length >= 2) return detail
    }
    if (rows.length < 50) return undefined
  }
  return undefined
}

interface LongestMemoTarget {
  id: string
  journalNo: string
  lineNo: number
  memoLength: number
}

/**
 * 말줄임 오버플로 검증 대상 — 열 재배분 대상 분개(findReversedJournalWithLines)와 분리 탐색한다
 * (Opus 재검 LOW → 라이브 QA FAIL 후속: 뷰포트 축소만으론 결정성이 안 나옴, 대상 분개 텍스트
 * 길이에 의존). 상태 제한 없이 전체 분개를 스캔해 목록 description 길이로 1차 정렬한 상위 5건만
 * 상세 fetch 로 실제 라인 메모 길이를 비교하고, 그중 최장 메모 라인을 최종 대상으로 삼는다
 * (과도한 전수 상세조회 회피).
 */
async function findJournalWithLongestMemo(page: Page, token: string): Promise<LongestMemoTarget | undefined> {
  const candidates: JournalSummaryRow[] = []
  for (let pageNo = 0; pageNo < 20; pageNo++) {
    // status 미지정 = 전체 상태(BE JournalController.list: status null 이면 전체) — REVERSED 제한 없음.
    const res = await page.request.get(`${API_BASE}/accounting/journals?page=${pageNo}&size=100`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(res.ok(), `분개 목록 조회 실패(page=${pageNo}): HTTP ${res.status()}`).toBeTruthy()
    const rows = ((await res.json()).data?.content ?? []) as JournalSummaryRow[]
    candidates.push(...rows)
    if (rows.length < 100) break
  }

  const ranked = [...candidates]
    .sort((a, b) => (b.description ?? '').length - (a.description ?? '').length)
    .slice(0, 5)

  let best: LongestMemoTarget | undefined
  for (const row of ranked) {
    const detail = await getJournalDetail(page, token, row.id)
    for (const line of detail.lines ?? []) {
      const memoLength = (line.memo ?? '').length
      if (!best || memoLength > best.memoLength) {
        best = { id: detail.id, journalNo: detail.journalNo, lineNo: line.lineNo, memoLength }
      }
    }
  }
  return best
}

async function expectNoLegacyJournals(page: Page, token: string): Promise<void> {
  const statuses = ['DRAFT', 'POSTED', 'REVERSED']
  const legacy: string[] = []
  for (const status of statuses) {
    for (let pageNo = 0; pageNo < 20; pageNo++) {
      const res = await page.request.get(`${API_BASE}/accounting/journals?status=${status}&page=${pageNo}&size=100`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      expect(res.ok(), `분개 목록 조회 실패(${status}/${pageNo}): HTTP ${res.status()}`).toBeTruthy()
      const rows = ((await res.json()).data?.content ?? []) as Array<{ journalNo: string }>
      legacy.push(...rows.map((r) => r.journalNo).filter((no) => /^J-2026-/.test(no)))
      if (rows.length < 100) break
    }
  }
  expect(legacy, '구 J-2026- 형식 분개번호 잔여').toEqual([])
}

async function expectRightEdgesAligned(
  left: Locator,
  right: Locator,
  label: string,
): Promise<void> {
  const leftBox = await left.boundingBox()
  const rightBox = await right.boundingBox()
  expect(leftBox, `${label}: table cell bounding box`).toBeTruthy()
  expect(rightBox, `${label}: totals cell bounding box`).toBeTruthy()
  const delta = Math.abs((leftBox!.x + leftBox!.width) - (rightBox!.x + rightBox!.width))
  expect(delta, `${label}: table/totals right edge delta`).toBeLessThanOrEqual(2)
}

async function expectHeaderWidth(header: Locator, expected: number, label: string): Promise<void> {
  const box = await header.boundingBox()
  expect(box, `${label}: header bounding box`).toBeTruthy()
  expect(Math.abs(box!.width - expected), `${label}: header width`).toBeLessThanOrEqual(2)
}

/**
 * #714 정정 — 1440px(넓은 뷰포트) 처럼 컨테이너(table 실폭)가 열 spec 폭 합(860px)보다 넓은 경우,
 * DataTable 의 `.table{width:100%}` + `table-layout:fixed` + colgroup 전 열 명시폭 조합은 CSS2.1
 * fixed-layout 알고리즘상 초과분을 spec 폭 비례로 전 열에 배분한다(Chromium 실측 확인 — 1440px
 * 기준 스케일 ×1.2977: 계정과목 160→~207·거래처 260→~337·메모 180→~233). exact 폭 대신 "기준 열
 * (메모) 대비 spec 비율"이 보존됐는지를 단언한다 — 실제 스케일팩터(뷰포트 실폭·폰트·스크롤바 등에
 * 의존)를 몰라도 fixed-layout 알고리즘의 정의상 항상 성립해 안정적이다.
 */
async function expectHeaderWidthRatio(
  header: Locator,
  referenceWidth: number,
  specWidth: number,
  specReferenceWidth: number,
  label: string,
): Promise<void> {
  const box = await header.boundingBox()
  expect(box, `${label}: header bounding box`).toBeTruthy()
  const expectedWidth = specWidth * (referenceWidth / specReferenceWidth)
  expect(
    Math.abs(box!.width - expectedWidth),
    `${label}: header width(실측 ${box!.width}px) vs 비례배분 기대폭(${expectedWidth.toFixed(1)}px, spec 비율 ${specWidth}/${specReferenceWidth})`,
  ).toBeLessThanOrEqual(3)
}

/**
 * lineNo(# 열) 로 tbody 행 인덱스를 찾는다 — 테스트가 별도 fetch 로 얻은 라인 배열과 화면 렌더
 * 순서가 반드시 일치한다는 가정(JPA `@OneToMany lines` 에 `@OrderBy` 부재) 없이, 렌더된 DOM
 * 자체에서 lineNo 텍스트로 직접 매칭한다.
 */
async function rowIndexByLineNo(table: Locator, lineNo: number): Promise<number> {
  return table.locator('tbody tr').evaluateAll((rows, targetLineNo) => {
    return rows.findIndex((row) => row.querySelector('td')?.textContent?.trim() === String(targetLineNo))
  }, lineNo)
}

interface EllipsisOverflowProbe {
  text: string
  clientWidth: number
  scrollWidth: number
  overflow: string
  textOverflow: string
  whiteSpace: string
}

/** 말줄임 후보 셀 중 scrollWidth 최대값을 측정 — 최초 1440px 측정과 뷰포트 축소 재측정에 공용. */
async function measureEllipsisOverflow(table: Locator): Promise<EllipsisOverflowProbe | null> {
  return table.locator('.journal-cell-ellipsis').evaluateAll((nodes) => {
    const cells = nodes.map((node) => {
      const el = node as HTMLElement
      const style = window.getComputedStyle(el)
      return {
        text: el.textContent ?? '',
        clientWidth: el.clientWidth,
        scrollWidth: el.scrollWidth,
        overflow: style.overflow,
        textOverflow: style.textOverflow,
        whiteSpace: style.whiteSpace,
      }
    })
    return cells.sort((a, b) => b.scrollWidth - a.scrollWidth)[0] ?? null
  })
}

/** 이미 특정된 단일 셀(예: 최장 메모 라인의 메모 셀)의 말줄임 오버플로를 측정한다. */
async function measureSingleEllipsisOverflow(cell: Locator): Promise<EllipsisOverflowProbe> {
  return cell.evaluate((node) => {
    const el = node as HTMLElement
    const style = window.getComputedStyle(el)
    return {
      text: el.textContent ?? '',
      clientWidth: el.clientWidth,
      scrollWidth: el.scrollWidth,
      overflow: style.overflow,
      textOverflow: style.textOverflow,
      whiteSpace: style.whiteSpace,
    }
  })
}

test('데스크톱 열 재배분 실증 — 폭·합계행·금액 정렬·J- 시드 정리', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name.includes('mobile'), '데스크톱 전용 단언')

  const login = await realLogin(page, 'dev_master')
  await installAuthStub(page, login)

  // 분개 UUID resolve(화면 비노출·라우팅 전용) — REVERSED + 라인 2건 이상 실분개를 동적 탐색.
  const target = await findReversedJournalWithLines(page, login.token)
  expect(target, '전제 데이터 없음: REVERSED 상태이면서 라인 2건 이상인 분개가 필요').toBeTruthy()
  const debitTotal = fmtKrw(target!.totalDebit)
  const creditTotal = fmtKrw(target!.totalCredit)

  // 말줄임 오버플로 검증 대상 — 열 재배분 대상 분개와 분리 동적 탐색(상태 제한 없음). 최장 메모
  // 후보가 4자 미만이면(사실상 시드 부재) 조용히 넘어가지 않고 명시적으로 실패시킨다.
  const longestMemo = await findJournalWithLongestMemo(page, login.token)
  expect(longestMemo, '말줄임 검증용 메모 시드 부재 — 전제 미충족').toBeTruthy()
  expect(
    longestMemo!.memoLength,
    '말줄임 검증용 메모 시드 부재 — 전제 미충족(최장 메모 4자 미만)',
  ).toBeGreaterThanOrEqual(4)

  // 1) 분개 상세 전폭 — 열 재배분+합계 행 정렬
  await page.goto(`${BASE_URL}/#/accounting/journals/${target!.id}`)
  await expect(page.getByText(target!.journalNo).first()).toBeVisible({ timeout: 30_000 })
  await expect(page.getByText(debitTotal).first()).toBeVisible()
  await capture(page, 'journal-detail-fullwidth-columns')

  // 2) 라인 테이블+합계 클로즈업 — 합계=테이블 내부 행(journal-total-row)이라 열 정렬을 구조가 보장.
  //    열 순서(개발책임자 지시): # | 계정과목 | 거래처 | 차변 | 대변 | 메모 — 거래처가 차변 왼쪽.
  const table = page.locator('table').first()
  const headers = table.locator('thead th')
  await expect(headers).toHaveText(['#', '계정과목', '거래처', '차변', '대변', '메모'])
  // #714 정정 — 1440px(넓은 뷰포트) 에서 exact spec 폭 단언은 구조적으로 항상 FAIL 한다: 테이블
  // 실폭(1440px 뷰포트의 실 콘텐츠 영역, 실측 clientWidth~1118px)이 열 spec 합(860px)보다 넓으면
  // fixed-layout 알고리즘이 초과분을 전 열에 spec 비례로 배분한다(정상 반응형 동작 — 넓은 뷰포트는
  // 비례확대로 전폭을 채우고, 반대로 컨테이너가 spec 합보다 좁은 1024px/앱 minWidth 는 열이 spec
  // 폭을 유지한 채 가로 스크롤로 전환된다: 아래 별도 테스트가 그 경우를 정확히 담당, 여기선 무변경).
  // exact 폭 대신 "메모 열 대비 spec 비율 보존"을 단언한다.
  const memoHeaderBox = await headers.nth(5).boundingBox()
  expect(memoHeaderBox, '메모(1440px): header bounding box').toBeTruthy()
  await expectHeaderWidthRatio(headers.nth(1), memoHeaderBox!.width, 160, 180, '계정과목(1440px)')
  await expectHeaderWidthRatio(headers.nth(2), memoHeaderBox!.width, 260, 180, '거래처(1440px)')
  await expectHeaderWidthRatio(headers.nth(3), memoHeaderBox!.width, 110, 180, '차변(1440px)')
  await expectHeaderWidthRatio(headers.nth(4), memoHeaderBox!.width, 110, 180, '대변(1440px)')
  // #714 회귀 가드(존치) — 메모 열은 과거 width 미지정(auto 잔여폭)이라 좁은 폭에서 압축(1024px
  // 실측 20px)됐던 이력이 있다(#711 QA 라운드). 1440px 는 비례확대만 발생하고 압축은 없으므로
  // 여기서는 절대 하한(spec 180px 이상 = 압축 아님)만 단언한다 — exact 폭 회귀 재발은 아래 1024px
  // 전용 테스트가 정확히 담당한다(무변경).
  expect(
    memoHeaderBox!.width,
    `메모(1440px): 비례확대 하한 미달(실측 ${memoHeaderBox!.width}px, spec 180px 미만=압축 의심)`,
  ).toBeGreaterThanOrEqual(180)
  // 1440px(넓은 뷰포트) = 컨테이너가 열 spec 합(860px)보다 넓어 비례확대로 100% 채워야 정상 — 가로
  // 스크롤이 발생하면 비례확대가 미동작(회귀)했다는 뜻이다(1024px/minWidth 의 스크롤 발생과는 반대
  // 의미 — 아래 별도 테스트가 그 경우를 담당).
  const scrollContainerAt1440 = page.locator('.journal-detail-table-scroll')
  const scrollMetricsAt1440 = await scrollContainerAt1440.evaluate((el) => ({
    scrollWidth: el.scrollWidth,
    clientWidth: el.clientWidth,
  }))
  expect(
    Math.abs(scrollMetricsAt1440.scrollWidth - scrollMetricsAt1440.clientWidth),
    `1440px: 가로 스크롤 발생(비례확대 미동작 의심) — scrollWidth(${scrollMetricsAt1440.scrollWidth}) vs clientWidth(${scrollMetricsAt1440.clientWidth})`,
  ).toBeLessThanOrEqual(2)
  await expect(headers.nth(2)).toHaveText('거래처')
  await expect(headers.nth(3)).toHaveText('차변')
  await expect(headers.nth(4)).toHaveText('대변')
  const totals = table.locator('tbody tr').last()
  await expect(totals).toHaveCount(1)
  await expect(totals).toHaveClass(/journal-total-row/)
  await expect(totals.locator('td').nth(1)).toContainText('합계')
  await expect(totals.locator('td').nth(3)).toHaveText(debitTotal)
  await expect(totals.locator('td').nth(4)).toHaveText(creditTotal)
  const firstLine = table.locator('tbody tr').first()
  await expectRightEdgesAligned(firstLine.locator('td').nth(3), totals.locator('td').nth(3), '차변')
  await expectRightEdgesAligned(firstLine.locator('td').nth(4), totals.locator('td').nth(4), '대변')
  await expect(totals.locator('td').nth(3)).toHaveCSS('text-align', 'right')
  await expect(totals.locator('td').nth(4)).toHaveCSS('text-align', 'right')

  // 값-라벨 배정(열 교체 swap) 검증 — 라인 레벨(Opus 재검 MED, fix2 후속). 합계 행은 POSTED/REVERSED
  // 불변식(차변합≡대변합, Journal.post() CONFLICT 가드)상 열이 바뀌어도 값이 같아 swap 회귀를
  // 원리적으로 판별 불가 — 정확히 한쪽만 >0 인(비대칭 보장) 개별 라인에서 차변/대변 셀이 각각
  // 올바른 값에 배정됐는지 직접 단언한다.
  const debitLine = target!.lines.find((l) => Number.parseInt(l.debitAmount, 10) > 0)
  expect(debitLine, '차변>0 라인 없음(비대칭 라인 전제)').toBeTruthy()
  const debitRowIndex = await rowIndexByLineNo(table, debitLine!.lineNo)
  expect(debitRowIndex, `lineNo=${debitLine!.lineNo} 행 DOM 매칭 실패`).toBeGreaterThanOrEqual(0)
  const debitRow = table.locator('tbody tr').nth(debitRowIndex)
  await expect(debitRow.locator('td').nth(3)).toHaveText(fmtKrw(debitLine!.debitAmount))
  await expect(debitRow.locator('td').nth(4)).toHaveText('—')

  // REVERSED 원분개는 통상 차/대 양방향 라인이 존재(대변합=차변합>0 이면 대변>0 라인이 반드시 있음)
  // — 있으면 역방향도 단언, 없으면(이론상 단일 방향뿐인 편성) 차변 라인 단언만 유지.
  const creditLine = target!.lines.find((l) => Number.parseInt(l.creditAmount, 10) > 0)
  if (creditLine) {
    const creditRowIndex = await rowIndexByLineNo(table, creditLine.lineNo)
    expect(creditRowIndex, `lineNo=${creditLine.lineNo} 행 DOM 매칭 실패`).toBeGreaterThanOrEqual(0)
    const creditRow = table.locator('tbody tr').nth(creditRowIndex)
    await expect(creditRow.locator('td').nth(3)).toHaveText('—')
    await expect(creditRow.locator('td').nth(4)).toHaveText(fmtKrw(creditLine.creditAmount))
  }

  const ellipsisProbe = await measureEllipsisOverflow(table)
  expect(ellipsisProbe, '계정과목/거래처/메모 말줄임 셀 존재').toBeTruthy()
  expect(ellipsisProbe!.overflow, '말줄임 셀 overflow').toBe('hidden')
  expect(ellipsisProbe!.textOverflow, '말줄임 셀 text-overflow').toBe('ellipsis')
  expect(ellipsisProbe!.whiteSpace, '말줄임 셀 white-space').toBe('nowrap')
  const tableBox = await table.boundingBox()
  const totalsBox = await totals.boundingBox()
  expect(tableBox).toBeTruthy()
  expect(totalsBox).toBeTruthy()
  await page.screenshot({
    path: path.join(SHOTS, `${String(++shotNo).padStart(2, '0')}-table-and-totals-closeup.png`),
    clip: {
      x: tableBox!.x,
      y: tableBox!.y,
      width: Math.min(tableBox!.width, 1200),
      height: totalsBox!.y + totalsBox!.height - tableBox!.y + 8,
    },
  })

  // 말줄임 오버플로 무조건 단언(Opus 재검 LOW 후속 — 라이브 QA FAIL 수정). 뷰포트 축소만으로는
  // 결정성이 안 나옴(대상 분개 텍스트 길이 의존, 동적 재시드 시 동일 분개도 메모 길이가 바뀔 수
  // 있음) — 열 재배분 대상과 분리한 최장 메모 분개(longestMemo)로 이동해 1440 → 1152 →
  // 1024(앱 minWidth) 순으로 축소하며 재측정하고, 발동 시점에 scrollWidth > clientWidth 를
  // 무조건 단언한다(1024 실측 메모열 ~20px — 4자 이상 메모는 확실히 발동, 위 전제 조건에서 4자
  // 미만이면 이미 실패했으므로 이 지점 도달 시 memoLength>=4 보장). 캡처 뒤에 배치해 위 전폭
  // 스크린샷에는 영향이 없고, 단언 후 즉시 뷰포트를 원복한다.
  await page.goto(`${BASE_URL}/#/accounting/journals/${longestMemo!.id}`)
  await expect(page.getByText(longestMemo!.journalNo).first()).toBeVisible({ timeout: 30_000 })
  const memoTable = page.locator('table').first()
  const memoRowIndex = await rowIndexByLineNo(memoTable, longestMemo!.lineNo)
  expect(memoRowIndex, `lineNo=${longestMemo!.lineNo} 행 DOM 매칭 실패`).toBeGreaterThanOrEqual(0)
  const memoTd = memoTable.locator('tbody tr').nth(memoRowIndex).locator('td').last()
  const memoEllipsis = memoTd.locator('.journal-cell-ellipsis')

  const originalViewport = page.viewportSize()
  let overflowProbe: EllipsisOverflowProbe | null = null
  for (const width of [1440, 1152, 1024]) {
    if (width !== 1440) {
      await page.setViewportSize({ width, height: 900 })
    }
    const probe = await measureSingleEllipsisOverflow(memoEllipsis)
    if (probe.scrollWidth > probe.clientWidth) {
      overflowProbe = probe
      break
    }
  }
  expect(
    overflowProbe,
    `말줄임 미발동(1440/1152/1024 전부) — journalNo=${longestMemo!.journalNo} lineNo=${longestMemo!.lineNo} memoLength=${longestMemo!.memoLength}`,
  ).toBeTruthy()
  expect(
    overflowProbe!.scrollWidth,
    `말줄임 무조건 단언 — scrollWidth(${overflowProbe!.scrollWidth}) > clientWidth(${overflowProbe!.clientWidth})`,
  ).toBeGreaterThan(overflowProbe!.clientWidth)
  if (originalViewport) {
    await page.setViewportSize(originalViewport)
  }

  // 3) 분개장 목록(역분개 필터) — 구 J- 형식 부재(시드 정리 실증) + 슬래시 형식만 표시
  await expectNoLegacyJournals(page, login.token)
  await page.goto(`${BASE_URL}/#/accounting/journals`)
  await expect(page.locator('h3', { hasText: '분개장' })).toBeVisible({ timeout: 30_000 })
  await page.locator('select').first().selectOption('REVERSED')
  await expect(page.locator('table').first()).toBeVisible({ timeout: 30_000 })
  await expect(page.getByText(/^J-2026-/)).toHaveCount(0)
  await captureElement(page, page.locator('table').first(), 'journal-list-no-duplicate-seeds')
})

test('#714 1024px(앱 minWidth) 열 압축 회귀 방지 — 전 열 spec 폭 유지 + 가로 스크롤로 메모 값 접근', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name.includes('mobile'), '데스크톱 전용 단언 — 앱 minWidth(Electron main/index.ts)는 데스크톱 셸 전용 개념')

  const login = await realLogin(page, 'dev_master')
  await installAuthStub(page, login)

  const target = await findReversedJournalWithLines(page, login.token)
  expect(target, '전제 데이터 없음: REVERSED 상태이면서 라인 2건 이상인 분개가 필요').toBeTruthy()

  // #714 실측 지점 — Electron BrowserWindow minWidth=1024(main/index.ts) = 앱 공식 최소 지원폭.
  // 사이드바(240px 고정)+본문/카드 패딩을 뺀 실 콘텐츠 폭은 열 합(860px)보다 좁아 가로 스크롤이
  // 반드시 발동해야 한다 — #711 QA 라운드 당시엔 메모 열이 width 미지정이라 이 폭에서 20px
  // ("메"만 가시·값 완전 비가시)로 압축됐었다(이슈 #714 실측 표).
  await page.setViewportSize({ width: 1024, height: 900 })
  await page.goto(`${BASE_URL}/#/accounting/journals/${target!.id}`)
  await expect(page.getByText(target!.journalNo).first()).toBeVisible({ timeout: 30_000 })

  const table = page.locator('table').first()
  const headers = table.locator('thead th')
  await expect(headers).toHaveText(['#', '계정과목', '거래처', '차변', '대변', '메모'])

  // 전 열 spec 폭 유지 단언(#714 회귀 가드 핵심) — table-layout:fixed + 전 열 명시폭 조합이면
  // 컨테이너가 좁아도 열이 비례 압축되지 않고 테이블 자체가 가로로 넘쳐야 정상(압축=회귀 재발).
  await expectHeaderWidth(headers.nth(0), 40, '#(1024px)')
  await expectHeaderWidth(headers.nth(1), 160, '계정과목(1024px)')
  await expectHeaderWidth(headers.nth(2), 260, '거래처(1024px)')
  await expectHeaderWidth(headers.nth(3), 110, '차변(1024px)')
  await expectHeaderWidth(headers.nth(4), 110, '대변(1024px)')
  const memoHeaderBox = await headers.nth(5).boundingBox()
  expect(memoHeaderBox, '메모(1024px): header bounding box').toBeTruthy()
  expect(
    memoHeaderBox!.width,
    `메모 열이 최소 가독폭(160px) 미만으로 압축됨(실측 ${memoHeaderBox?.width}px) — #714 회귀`,
  ).toBeGreaterThanOrEqual(160)

  // 가로 스크롤 컨테이너(JournalDetailPage 로컬 wrapper, global.css `.journal-detail-table-scroll`)
  // 실동작 확인 — 컨테이너가 열 합(860px)보다 좁을 때 압축 대신 스크롤로 전환되는지가 #714 fix 의 핵심.
  const scrollContainer = page.locator('.journal-detail-table-scroll')
  await expect(scrollContainer).toHaveCount(1)
  const scrollMetrics = await scrollContainer.evaluate((el) => ({
    scrollWidth: el.scrollWidth,
    clientWidth: el.clientWidth,
  }))
  expect(
    scrollMetrics.scrollWidth,
    `가로 스크롤 미동작 — scrollWidth(${scrollMetrics.scrollWidth}) <= clientWidth(${scrollMetrics.clientWidth})`,
  ).toBeGreaterThan(scrollMetrics.clientWidth)

  await capture(page, 'journal-detail-1024-minwidth-columns-precompressed')

  // 실제 가로 스크롤 후 메모 값 셀이 온전한 폭으로 보이고 뷰포트 안에 들어오는지(헤더만 폭을
  // 유지하고 값 셀이 별도로 무너지는 회귀·스크롤이 시각적으로 안 먹는 회귀까지 차단) — 컨테이너를
  // 끝까지 스크롤해 메모 열을 뷰포트 안으로 이동시킨다.
  await scrollContainer.evaluate((el) => { el.scrollLeft = el.scrollWidth })
  const firstMemoCell = table.locator('tbody tr').first().locator('td').last()
  const memoCellBox = await firstMemoCell.boundingBox()
  expect(memoCellBox, '메모 값 셀(1024px, 스크롤 후) bounding box').toBeTruthy()
  expect(
    memoCellBox!.width,
    `메모 값 셀이 압축되어 값 접근 불가(실측 ${memoCellBox?.width}px) — #714 회귀`,
  ).toBeGreaterThanOrEqual(160)
  await expect(firstMemoCell).toBeInViewport()

  await capture(page, 'journal-detail-1024-minwidth-memo-scrolled-into-view')
})

test('모바일 합계 카드 실증 — 390px 카드 라벨+차대변 분리 값 노출(결합 문자열 폐기)', async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.includes('mobile'), '모바일 전용 단언')

  const login = await realLogin(page, 'dev_master')
  await installAuthStub(page, login)

  const target = await findReversedJournalWithLines(page, login.token)
  expect(target, '전제 데이터 없음: REVERSED 상태이면서 라인 2건 이상인 분개가 필요').toBeTruthy()
  const debitTotal = fmtKrw(target!.totalDebit)
  const creditTotal = fmtKrw(target!.totalCredit)

  await page.goto(`${BASE_URL}/#/accounting/journals/${target!.id}`)
  await expect(page.getByText(target!.journalNo).first()).toBeVisible({ timeout: 30_000 })

  // 합계 카드 — 라인 카드와 동일한 2열 grid(mobile-item-metrics) 패턴으로 차변/대변을 분리 렌더.
  // 결합 문자열("X / Y")은 10자리 금액에서 개행/절단 위험이 있어 폐기(Opus 재검 HIGH fix) — 부재를 명시 단언.
  const totalCard = page.getByTestId('journal-mobile-total')
  await expect(totalCard).toBeVisible()
  await expect(totalCard.getByText('합계')).toBeVisible()
  const metrics = totalCard.locator('.mobile-item-metric')
  await expect(metrics).toHaveCount(2)
  await expect(totalCard.locator('.mobile-item-metric-value')).toHaveCount(2)
  await expect(metrics.nth(0).locator('.mobile-item-metric-label')).toHaveText('차변')
  await expect(metrics.nth(0).locator('.mobile-item-metric-value')).toHaveText(debitTotal)
  await expect(metrics.nth(1).locator('.mobile-item-metric-label')).toHaveText('대변')
  await expect(metrics.nth(1).locator('.mobile-item-metric-value')).toHaveText(creditTotal)
  await expect(page.getByText(`${debitTotal} / ${creditTotal}`)).toHaveCount(0)
  await captureElement(page, totalCard, 'mobile-total-card')
})
