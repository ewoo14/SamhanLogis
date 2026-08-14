/**
 * PR #921 chore-B SONNET5 라운드 fix (개발책임자 표기 "R-3", 흡수 결정) — RED-first 회귀 게이트.
 *
 * 대상 결함: 배차보드 SlipDetailModal 인쇄 시 문서 하단이 잘린다.
 *   modalBody scrollH=1222 / clientH=943(또는 721) ← 스크롤포트
 *   .dispatch-page bottom=1306 > modalBody bottom=1053 → 253px 초과
 *   모달 크롬("출고전표 …", ✕, 닫기)이 종이에 찍힘
 *
 * 원인 위치: clients/web/design-system/src/components/Modal/Modal.module.css
 *   .backdrop { position: fixed }   -- 인쇄 프래그멘테이션에 정상 참여하지 않는 뷰포트 고정 박스
 *   .dialog   { max-height: ... }   -- 뷰포트 근사 상한
 *   .body     { overflow-y: auto }  -- 스크롤 컨테이너(flexbox automatic-minimum-size 규칙상
 *                                      overflow:auto 인 flex 자식은 0 까지 축소 가능해져 위
 *                                      max-height 캡이 "스크롤 가능한 실제 압축"으로 바뀐다)
 *
 * RED 지표(바이트 크기 단독 아님 — pypdf 텍스트 추출과 함께 판단):
 *  ① modalBody.scrollTop 을 0 vs 최대로 바꿔 인쇄한 PDF 가 서로 달라야 정상인데(=버그 재현),
 *     fix 후에는 스크롤 위치와 무관하게 완전히 동일해야 한다.
 *  ② 문서 끝(모달 body 최하단)에 break-before:page 마커를 심어도 인쇄 페이지 수가 늘지 않는다
 *     (현재 버그) → fix 후에는 늘어난다.
 *  ③ 문서의 마지막 텍스트(하단 책임 문구)가 인쇄 PDF 텍스트 추출에 없다(현재 버그) → fix 후 있다.
 *  ④ 모달 크롬(제목·설명·닫기 버튼) 텍스트가 인쇄 PDF 텍스트 추출에 있다(I-6 위반) → fix 후 없다.
 *
 * pypdf 교차검증은 docs/qa/choreb-sonnet-r2/pdf_text_check.py 가 별도 수행한다(R1 관례 재사용).
 *
 * 실행:
 *   cd clients/desktop
 *   set AUDIT_BASE_URL=http://127.0.0.1:5430
 *   set AUDIT_SHOT_DIR=<repo>\docs\qa\choreb-sonnet-r2
 *   node_modules\.bin\playwright test --config=playwright.real-qa.config.ts ^
 *     playwright/choreb-sonnet-r2-real-qa/choreb-sonnet-r2-real-qa.spec.ts --reporter=line --timeout=180000
 */
import fs from 'node:fs'
import path from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import { resolveQaShotsDir } from '../support/qa-screenshot-dir'

const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5430'
// resolveQaShotsDir 로 감싸 기본 실행이 커밋된 docs/qa/choreb-sonnet-r2/ 를 직접 덮어쓰지
// 않게 한다(기본 _local/ 격리, 2026-07-26 하네스 재수렴 라운드 G2).
const SHOTS = resolveQaShotsDir(
  process.env['AUDIT_SHOT_DIR']
    ? path.resolve(process.env['AUDIT_SHOT_DIR'])
    : path.resolve('../../docs/qa/choreb-sonnet-r2'),
)

const BACKDROP = "[data-testid='ds-modal-backdrop']"
const LIABILITY_TEXT = '서명 후 생긴 문제는 당사가 책임지지 않습니다'
const RECIPIENT_SIGN_TEXT = '인수자 서명'
const LOGO_TEXT = 'SAMSUNG'
const CHROME_TITLE_SUBSTR = '출고전표'
const CHROME_DESC_TEXT = '출고전표 미리보기'
const CHROME_CLOSE_TEXT = '닫기'
const TAIL_MARKER_TEXT = 'SONNET-R2-TAIL-PAGEBREAK-MARKER-7e2d1'

function pdfPageCount(pdf: Buffer): number {
  return (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length
}

async function openBoard(page: Page): Promise<void> {
  await page.goto(`${BASE_URL}/#/dispatch-board?mockRole=MASTER`, { waitUntil: 'domcontentloaded' })
  await expect(page.getByTestId('dispatch-board-page')).toBeVisible({ timeout: 15_000 })
  for (const label of ['닫기', '확인']) {
    const button = page.getByRole('button', { name: label })
    if (await button.count()) await button.first().click().catch(() => undefined)
  }
  await expect(page.locator('[data-testid^="dispatch-board-slip-row-"]').first()).toBeVisible()
}

async function openSlipDetail(page: Page): Promise<void> {
  await page.locator('[data-testid^="dispatch-board-slip-row-"]').first().click()
  await expect(page.locator(BACKDROP)).toBeVisible({ timeout: 10_000 })
  await expect(page.locator('.dispatch-page')).toBeVisible({ timeout: 10_000 })
}

/** Modal.module.css 의 .body(스크롤 컨테이너) — CSS Modules 해시를 피해 DOM 구조로 특정한다.
 *  SlipDetailModal 이 children 최상단에 두는 data-testid 의 직속 부모 = Modal 의 .body div. */
function modalBodyHandle(page: Page) {
  return page.locator('[data-testid="dispatch-board-slip-detail-body"]').locator('xpath=..')
}

async function scrollGeometry(page: Page) {
  return modalBodyHandle(page).evaluate((el) => ({
    scrollHeight: el.scrollHeight,
    clientHeight: el.clientHeight,
    scrollTop: el.scrollTop,
    overflowY: getComputedStyle(el).overflowY,
  }))
}

async function chromeDisplay(page: Page) {
  return page.evaluate(() => {
    const dialog = document.querySelector('[role="dialog"]')
    const header = dialog?.querySelector(':scope > header') as HTMLElement | null
    const desc = dialog?.querySelector(':scope > p') as HTMLElement | null
    const footer = dialog?.querySelector(':scope > footer') as HTMLElement | null
    const backdrop = document.querySelector("[data-testid='ds-modal-backdrop']") as HTMLElement | null
    return {
      header: header ? getComputedStyle(header).display : 'absent',
      desc: desc ? getComputedStyle(desc).display : 'absent',
      footer: footer ? getComputedStyle(footer).display : 'absent',
      backdropBg: backdrop ? getComputedStyle(backdrop).backgroundColor : 'absent',
      backdropPosition: backdrop ? getComputedStyle(backdrop).position : 'absent',
    }
  })
}

// 각 테스트가 openBoard+openSlipDetail 로 독립 진입한다 — 한 테스트의 실패가 나머지를
// skip 시키지 않도록(RED-first 단계에서 전 지표를 동시에 관측해야 한다) .serial 을 쓰지 않는다.
test.describe('SlipDetailModal 인쇄 — I-5(전체 인쇄) + I-6(크롬 미인쇄) RED-first 게이트', () => {
  test('지표1: 인쇄 PDF 가 모달 body 스크롤 위치에 좌우되지 않는다', async ({ page }) => {
    await openBoard(page)
    await openSlipDetail(page)

    const geomScreen = await scrollGeometry(page)
    console.log(`[R2-GEOM-SCREEN] scrollH=${geomScreen.scrollHeight} clientH=${geomScreen.clientHeight} overflowY=${geomScreen.overflowY}`)
    // 사전조건 — 이 진단이 유효하려면 화면에서 실제로 스크롤 가능해야 한다(I-7: 화면 동작 불변이므로
    // 이 부등식은 fix 전/후 항상 동일하게 성립해야 정상 — 즉 이 자체가 I-7 회귀 증거이기도 하다).
    expect(geomScreen.scrollHeight, '사전조건: 모달 body 가 화면에서 스크롤 가능해야 진단이 유효하다').toBeGreaterThan(geomScreen.clientHeight)

    // 워밍업 호출 — 실측(대조 실험)으로 확인: 이 페이지 생애주기에서 "첫" page.pdf() 호출은
    // scrollTop 과 무관하게 그 다음 호출들과 자체적으로 최대 수백 바이트 다르다(폰트 서브셋팅/
    // 캐시 위밍업으로 추정 — Chromium PDF 익스포트 자체의 논디터미니즘, 버그 아님). 아래 두 실측
    // 호출을 "첫 호출"로 만들지 않기 위해 버리는 워밍업 1회를 먼저 수행한다(측정 결론 오염 방지).
    await page.emulateMedia({ media: 'print' })
    void (await page.pdf({ format: 'A4', printBackground: true }))
    await page.emulateMedia({ media: 'screen' })

    await modalBodyHandle(page).evaluate((el) => { el.scrollTop = 0 })
    await page.emulateMedia({ media: 'print' })
    const pdfTop = await page.pdf({ format: 'A4', printBackground: true })
    fs.writeFileSync(path.join(SHOTS, 'scroll-top-0.pdf'), pdfTop)
    await page.screenshot({ path: path.join(SHOTS, 'scroll-top-0-print-media.png'), fullPage: false })
    await page.emulateMedia({ media: 'screen' })

    await modalBodyHandle(page).evaluate((el) => { el.scrollTop = el.scrollHeight })
    const geomBottom = await scrollGeometry(page)
    await page.emulateMedia({ media: 'print' })
    const pdfBottom = await page.pdf({ format: 'A4', printBackground: true })
    fs.writeFileSync(path.join(SHOTS, 'scroll-top-max.pdf'), pdfBottom)
    await page.screenshot({ path: path.join(SHOTS, 'scroll-top-max-print-media.png'), fullPage: false })
    await page.emulateMedia({ media: 'screen' })
    await modalBodyHandle(page).evaluate((el) => { el.scrollTop = 0 })

    console.log(`[R2-PDF] top0=${pdfTop.length}B/${pdfPageCount(pdfTop)}p max=${pdfBottom.length}B/${pdfPageCount(pdfBottom)}p geomBottomScrollTop=${geomBottom.scrollTop}`)
    expect(geomBottom.scrollTop, '사전조건: scrollTop=max 지정이 실제로 반영되지 않았다').toBeGreaterThan(0)

    expect(pdfTop.length, 'I-5: 인쇄 PDF 가 모달 body 스크롤 위치에 좌우된다(잘림 재현)').toBe(pdfBottom.length)
  })

  test('지표2: 문서 끝 marker(break-before:page) 가 인쇄 페이지네이션에 참여한다', async ({ page }) => {
    await openBoard(page)
    await openSlipDetail(page)
    await modalBodyHandle(page).evaluate((el) => { el.scrollTop = 0 })

    await page.emulateMedia({ media: 'print' })
    const before = await page.pdf({ format: 'A4', printBackground: true })
    const pagesBefore = pdfPageCount(before)

    await modalBodyHandle(page).evaluate((el, markerText) => {
      const marker = document.createElement('div')
      marker.dataset.qaTailMarker = 'true'
      marker.textContent = markerText
      marker.style.cssText = 'break-before: page; page-break-before: always; height: 1px;'
      el.appendChild(marker)
    }, TAIL_MARKER_TEXT)

    const after = await page.pdf({ format: 'A4', printBackground: true })
    fs.writeFileSync(path.join(SHOTS, 'tail-marker.pdf'), after)
    await page.screenshot({ path: path.join(SHOTS, 'tail-marker-print-media.png'), fullPage: false })
    const pagesAfter = pdfPageCount(after)
    await page.emulateMedia({ media: 'screen' })
    await modalBodyHandle(page).evaluate(() => {
      document.querySelector('[data-qa-tail-marker="true"]')?.remove()
    })

    console.log(`[R2-MARKER] pagesBefore=${pagesBefore} pagesAfter=${pagesAfter}`)
    expect(pagesAfter, 'I-5: 문서 끝 마커가 인쇄 페이지네이션에 전혀 참여하지 않는다(잘림 재현)').toBeGreaterThan(pagesBefore)
  })

  test('지표3+4: 인쇄 PDF 본문에는 문서 전체(머리~꼬리)가, 모달 크롬은 없다 (pypdf 교차검증용 저장)', async ({ page }) => {
    await openBoard(page)
    await openSlipDetail(page)
    await modalBodyHandle(page).evaluate((el) => { el.scrollTop = 0 })

    const chromeScreen = await chromeDisplay(page)
    console.log(`[R2-CHROME-SCREEN] ${JSON.stringify(chromeScreen)}`)

    await page.emulateMedia({ media: 'print' })
    const chromePrint = await chromeDisplay(page)
    const pdf = await page.pdf({ format: 'A4', printBackground: true })
    fs.writeFileSync(path.join(SHOTS, 'full-document.pdf'), pdf)
    await page.screenshot({ path: path.join(SHOTS, 'full-document-print-media.png'), fullPage: false })
    const pages = pdfPageCount(pdf)
    await page.emulateMedia({ media: 'screen' })

    console.log(`[R2-CHROME-PRINT] ${JSON.stringify(chromePrint)} pdf=${pdf.length}B/${pages}p`)

    // I-6 진단(계산 기하) — pypdf 텍스트 추출은 별도 스크립트가 최종 판정한다.
    console.log(`[R2-I6-CHECK] header=${chromePrint.header} desc=${chromePrint.desc} footer=${chromePrint.footer} backdropBg=${chromePrint.backdropBg} backdropPosition=${chromePrint.backdropPosition}`)
  })

  test('지표5: backdrop 이 문서 흐름 맨 앞(top≈0)에 오고, 그 앞에 빈 페이지 분량 여백이 없다', async ({ page }) => {
    // .backdrop 을 position:fixed→static 으로 바꾸며 새로 발견한 2차 결함 — .app-shell 의 화면용
    // min-height:100vh(+ html/body/#root 의 height:100% 사슬)가 인쇄에서도 살아있으면, .app-main
    // 이 display:none 이어도 그 조상 체인이 뷰포트 높이만큼 자리를 차지해 modal portal(=body 의
    // 뒤 형제)이 그만큼 아래로 밀려 인쇄물 맨 앞에 거의 빈 페이지가 생긴다.
    await openBoard(page)
    await openSlipDetail(page)
    await page.emulateMedia({ media: 'print' })
    void (await page.pdf({ format: 'A4', printBackground: true })) // 워밍업
    const geom = await page.evaluate(() => {
      const backdrop = document.querySelector("[data-testid='ds-modal-backdrop']") as HTMLElement
      const root = document.getElementById('root') as HTMLElement | null
      const b = backdrop.getBoundingClientRect()
      const r = root ? root.getBoundingClientRect() : null
      return {
        backdropTop: b.top,
        rootHeight: r ? r.height : null,
        bodyScrollHeight: document.body.scrollHeight,
      }
    })
    await page.emulateMedia({ media: 'screen' })
    console.log(`[R2-GAP] ${JSON.stringify(geom)}`)
    // 뷰포트(900px)의 상당 부분을 차지하는 "앞 여백"이 있으면 회귀 — 느슨하게 200px 미만으로 제한
    // (모달 크롬이 완전히 사라진 상태이므로 정상은 0에 가까워야 한다).
    expect(geom.backdropTop, 'I-5: 문서 인쇄물 맨 앞에 큰 빈 여백이 생겼다(.app-shell/#root 잔여 높이)').toBeLessThan(200)
  })

  test('I-7 불변: 화면(screen) 모달 동작은 fix 와 무관하게 그대로다', async ({ page }) => {
    await openBoard(page)
    await openSlipDetail(page)

    const screen = await page.evaluate(() => {
      const backdrop = document.querySelector("[data-testid='ds-modal-backdrop']") as HTMLElement
      const dialog = document.querySelector('[role="dialog"]') as HTMLElement
      const body = document.querySelector('[data-testid="dispatch-board-slip-detail-body"]')!.parentElement as HTMLElement
      return {
        backdropPosition: getComputedStyle(backdrop).position,
        backdropDisplay: getComputedStyle(backdrop).display,
        dialogMaxHeight: getComputedStyle(dialog).maxHeight,
        dialogDisplay: getComputedStyle(dialog).display,
        bodyOverflowY: getComputedStyle(body).overflowY,
      }
    })
    console.log(`[R2-I7-SCREEN] ${JSON.stringify(screen)}`)

    await page.screenshot({ path: path.join(SHOTS, 'i7-screen-modal-open.png'), fullPage: false })

    expect(screen.backdropPosition, 'I-7: 화면에서 backdrop position 이 fixed 가 아니다').toBe('fixed')
    expect(screen.backdropDisplay, 'I-7: 화면에서 backdrop display 가 flex 가 아니다').toBe('flex')
    expect(screen.dialogMaxHeight, 'I-7: 화면에서 dialog max-height 가 none 이 됐다(중앙정렬/스크롤 계약 파손)').not.toBe('none')
    expect(screen.bodyOverflowY, 'I-7: 화면에서 body overflow-y 가 auto 가 아니다').toBe('auto')
  })

  test('fence-단문서: 라인이 1개뿐인 짧은 문서는 강제 스크롤 없이도 잘리지 않는다(합성 트림)', async ({ page }) => {
    await openBoard(page)
    await openSlipDetail(page)

    // 트림 전 원본(긴) 문서의 페이지 수를 기준선으로 먼저 잰다 — "짧은 문서"의 페이지 수가
    // 이 기준선보다 많아지면 안 된다(콘텐츠를 줄였는데 페이지가 늘어나는 건 회귀).
    await page.emulateMedia({ media: 'print' })
    const fullPdf = await page.pdf({ format: 'A4', printBackground: true }) // 워밍업 겸 기준선
    const fullPages = pdfPageCount(fullPdf)
    await page.emulateMedia({ media: 'screen' })

    // 실제 라인 데이터를 1행만 남기고 합성 트림 — 순수 CSS 기하(오버플로/클리핑) 회귀만 겨냥한다.
    // (배차보드 mock 시드는 짧은 슬립을 별도로 제공하지 않아, 동일 문서에서 라인 수만 줄인다.)
    await page.evaluate(() => {
      const tbody = document.querySelector('.dispatch-table tbody')
      if (!tbody) return
      const rows = Array.from(tbody.querySelectorAll('tr'))
      rows.slice(1).forEach((r) => r.remove())
    })

    const geom = await scrollGeometry(page)
    console.log(`[R2-SHORT-GEOM] scrollH=${geom.scrollHeight} clientH=${geom.clientHeight} fullPages(baseline)=${fullPages}`)

    // 워밍업(트림 이후 상태의 "첫" page.pdf() 호출 노이즈를 실측 밖으로 뺀다 — 지표1과 동일 근거).
    await page.emulateMedia({ media: 'print' })
    void (await page.pdf({ format: 'A4', printBackground: true }))
    await page.emulateMedia({ media: 'screen' })

    await modalBodyHandle(page).evaluate((el) => { el.scrollTop = 0 })
    await page.emulateMedia({ media: 'print' })
    const pdfTop = await page.pdf({ format: 'A4', printBackground: true })
    await page.emulateMedia({ media: 'screen' })

    await modalBodyHandle(page).evaluate((el) => { el.scrollTop = el.scrollHeight })
    await page.emulateMedia({ media: 'print' })
    const pdfBottom = await page.pdf({ format: 'A4', printBackground: true })
    fs.writeFileSync(path.join(SHOTS, 'short-doc.pdf'), pdfBottom)
    await page.screenshot({ path: path.join(SHOTS, 'short-doc-print-media.png'), fullPage: false })
    const pages = pdfPageCount(pdfBottom)
    await page.emulateMedia({ media: 'screen' })

    console.log(`[R2-SHORT-PDF] top0=${pdfTop.length}B max=${pdfBottom.length}B pages=${pages} fullPages(baseline)=${fullPages}`)
    expect(pdfTop.length, '단문서: 인쇄 PDF 가 스크롤 위치에 좌우된다').toBe(pdfBottom.length)
    // 라인 3→1 로 줄인 트림이 원본(긴 문서) 대비 페이지가 "늘어나면" 회귀 — 짧아진 콘텐츠가
    // 페이지를 더 많이 쓰는 건 비정상이다(모놀리식 절대값 대신 같은 문서의 자기 자신 기준선 대조).
    expect(pages, '단문서: 트림으로 콘텐츠를 줄였는데 원본보다 페이지가 늘었다').toBeLessThanOrEqual(fullPages)
  })
})

test('진단: 인쇄 미디어에서 dialog 내부에 남은 스크롤 클리퍼가 있는가(H3 기법 재사용)', async ({ page }) => {
  await openBoard(page)
  await openSlipDetail(page)
  await page.emulateMedia({ media: 'print' })
  const scan = await page.evaluate(() => {
    const dialog = document.querySelector('[role="dialog"]') as HTMLElement | null
    if (!dialog) return null
    const clippers = (Array.from(dialog.querySelectorAll('*')) as HTMLElement[])
      .filter((el) => el.scrollHeight > el.clientHeight + 2)
      .map((el) => {
        const cs = getComputedStyle(el)
        return {
          tag: el.tagName,
          cls: el.className,
          overflowX: cs.overflowX,
          overflowY: cs.overflowY,
          scrollH: el.scrollHeight,
          clientH: el.clientHeight,
        }
      })
    return clippers
  })
  await page.emulateMedia({ media: 'screen' })
  console.log(`[R2-SCROLL-SCAN] ${JSON.stringify(scan)}`)
  expect(scan, '인쇄 미디어에서 dialog 내부에 여전히 스크롤 클리퍼가 남아있다').toEqual([])
})

test.afterAll(() => {
  const summary = {
    liabilityText: LIABILITY_TEXT,
    recipientSignText: RECIPIENT_SIGN_TEXT,
    logoText: LOGO_TEXT,
    chromeTitleSubstr: CHROME_TITLE_SUBSTR,
    chromeDescText: CHROME_DESC_TEXT,
    chromeCloseText: CHROME_CLOSE_TEXT,
    tailMarkerText: TAIL_MARKER_TEXT,
  }
  fs.writeFileSync(path.join(SHOTS, 'r2-marker-manifest.json'), JSON.stringify(summary, null, 2))
})
