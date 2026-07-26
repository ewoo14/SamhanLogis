import { resolveQaShotsDir } from '../support/qa-screenshot-dir'
/**
 * 880-opus-reconv-real-qa.spec.ts
 *
 * OPUS 4.8 재수렴 적대검증 — PR #917 / slice #880.
 * SOL 2차가 발견한 도달가능 1건(권한그룹 375·320px grid 붕괴)을 LUNA 가
 * mobile-form-grid class 로 고쳤다. 이 스펙은 (1) 그 붕괴가 닫혔는지,
 * (2) 1열 전환의 부작용(넓은폭 2열·769px 경계·세로순서·가로 오버플로우),
 * (3) 긴 그룹명 stress 를 실서버(mock OFF)에서 실측한다.
 *
 * 독립 작성 — LUNA/SOL 스펙을 신뢰하지 않고 자체 측정한다.
 * 실행: AUDIT_BASE_URL=http://127.0.0.1:5350 (mock OFF vite), API_BASE=:8080
 */
import { expect, test, type Page } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5350'
const API_BASE = process.env['API_BASE'] ?? 'http://localhost:8080'
const PASSWORD = process.env['DEV_PASSWORD'] ?? 'dev_p05_pass!'
const SHOT_DIR = resolveQaShotsDir(join(process.cwd(), '..', '..', 'docs', 'qa', '880-opus-reconv-2026-07-24'))
const THROWAWAY_NAME =
  'ZZ재수렴검증_아주매우긴권한그룹이름가로스크롤유발용0123456789오버플로우검증문자열끝'

type Auth = { token: string; userId: string; role: string; fullName: string }

async function login(page: Page): Promise<Auth> {
  const response = await page.request.post(`${API_BASE}/api/auth/login`, {
    data: { loginId: 'dev_master', password: PASSWORD },
  })
  expect(response.ok(), `dev_master 로그인 실패 HTTP ${response.status()}`).toBeTruthy()
  const data = (await response.json()).data ?? {}
  return {
    token: data.token ?? '',
    userId: data.userId ?? '',
    role: data.role ?? 'MASTER',
    fullName: data.displayName ?? '개발책임자',
  }
}

async function injectAuth(page: Page, auth: Auth) {
  await page.addInitScript((value: Auth) => {
    Object.defineProperty(window, 'samhanAuth', {
      configurable: true,
      value: {
        getToken: async () => ({ ...value, partnerCode: null }),
        setToken: async () => undefined,
        clearToken: async () => undefined,
      },
    })
  }, auth)
}

/** 문서 전체 가로 오버플로우 진단: 뷰포트보다 넓은 요소 + 그 요소를 자르는 조상 확인. */
async function horizontalOverflow(page: Page, viewportWidth: number) {
  return page.evaluate((vw) => {
    const de = document.documentElement
    const docScroll = Math.max(de.scrollWidth, document.body.scrollWidth)
    const offenders: {
      tag: string; cls: string; w: number; right: number; text: string; clippedBy: string
    }[] = []
    for (const el of Array.from(document.querySelectorAll('*'))) {
      const r = (el as HTMLElement).getBoundingClientRect()
      if (r.right > vw + 1 && r.width > 4) {
        // 이 요소를 clip 하는 가장 가까운 조상(overflow hidden/auto) 찾기
        let clippedBy = 'NONE(page-scroll)'
        let p = el.parentElement
        while (p) {
          const ox = getComputedStyle(p).overflowX
          if (ox === 'hidden' || ox === 'auto' || ox === 'scroll') {
            clippedBy = `${p.tagName.toLowerCase()}.${(p.getAttribute('class') ?? '').slice(0, 24)}[ox=${ox}]`
            break
          }
          p = p.parentElement
        }
        offenders.push({
          tag: el.tagName.toLowerCase(),
          cls: (el.getAttribute('class') ?? '').slice(0, 30),
          w: Math.round(r.width),
          right: Math.round(r.right),
          text: (el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 30),
          clippedBy,
        })
      }
    }
    offenders.sort((a, b) => b.right - a.right)
    return { docScroll, clientWidth: de.clientWidth, offenders: offenders.slice(0, 5) }
  }, viewportWidth)
}

async function gotoPermGroups(page: Page, width: number) {
  await page.setViewportSize({ width, height: 900 })
  await page.goto(`${BASE_URL}/#/admin/permission-groups/manage`, {
    waitUntil: 'domcontentloaded',
    timeout: 25_000,
  })
  await expect(page.getByTestId('perm-group-manage-table')).toBeVisible({ timeout: 20_000 })
  await expect(page.getByTestId('perm-group-manage-table').locator('table')).toBeVisible({
    timeout: 20_000,
  })
}

test.beforeAll(() => mkdirSync(SHOT_DIR, { recursive: true }))

test('권한그룹 레이아웃 실측 — 6폭 그리드·오버플로우·세로순서', async ({ page }) => {
  const auth = await login(page)
  await injectAuth(page, auth)

  const summary: Record<string, unknown>[] = []
  for (const width of [320, 375, 768, 769, 1280, 1920]) {
    await gotoPermGroups(page, width)

    const layout = page.getByTestId('perm-group-manage-table').locator('xpath=../..')
    const sections = layout.locator(':scope > section')
    const layoutBox = await layout.boundingBox()
    const listBox = await sections.nth(0).boundingBox()
    const formBox = await sections.nth(1).boundingBox()
    expect(layoutBox, `${width}px layout`).not.toBeNull()
    expect(listBox, `${width}px 목록 section`).not.toBeNull()
    expect(formBox, `${width}px 배속 section`).not.toBeNull()

    const of = await horizontalOverflow(page, width)
    // computed grid-template-columns 실측 — 1열/2열 실제 판정
    const gridCols = await layout.evaluate((el) => getComputedStyle(el).gridTemplateColumns)
    const colCount = gridCols.trim().split(/\s+/).length

    summary.push({
      width,
      layoutW: Math.round(layoutBox!.width),
      listW: Math.round(listBox!.width),
      formW: Math.round(formBox!.width),
      listTop: Math.round(listBox!.y),
      formTop: Math.round(formBox!.y),
      gridColCount: colCount,
      docScroll: of.docScroll,
      clientWidth: of.clientWidth,
      overflowPx: of.docScroll - of.clientWidth,
      offenders: of.offenders,
    })

    await page.screenshot({ path: join(SHOT_DIR, `perm-group-${width}.png`), fullPage: true })

    // ── 불변식 ──
    // 1) 페이지 가로 오버플로우 없음 (1px 허용)
    expect(of.docScroll, `${width}px 가로 오버플로우 offenders=${JSON.stringify(of.offenders)}`)
      .toBeLessThanOrEqual(of.clientWidth + 1)

    if (width <= 768) {
      // 1열: 실제 컬럼 1개 + 목록 전폭 + 목록이 폼보다 위(세로순서 목록 먼저)
      expect(colCount, `${width}px 1열이어야 함(실제 ${gridCols})`).toBe(1)
      expect(listBox!.width, `${width}px 목록 전폭`).toBeGreaterThanOrEqual(layoutBox!.width * 0.9)
      expect(formBox!.width, `${width}px 폼 전폭`).toBeGreaterThanOrEqual(layoutBox!.width * 0.9)
      expect(listBox!.y, `${width}px 목록이 폼보다 위`).toBeLessThan(formBox!.y)
    } else {
      // 2열: 실제 컬럼 2개 + 폼은 minmax(320) 유지 + 목록·폼 같은 줄.
      // ⚠️ 목록 폭은 뷰포트-사이드바에 따라 중간폭(769~)에서 좁아짐(inline style, fix 전후 동일=pre-existing).
      //    따라서 임의 폭 임계 대신 넓은폭(>=1280)에서만 목록 여유폭을 검증한다.
      expect(colCount, `${width}px 2열이어야 함(실제 ${gridCols})`).toBe(2)
      expect(formBox!.width, `${width}px 폼 열 minmax(320) 유지`).toBeGreaterThanOrEqual(300)
      expect(Math.abs(listBox!.y - formBox!.y), `${width}px 목록·폼 같은 줄`).toBeLessThan(30)
      expect(listBox!.width, `${width}px 목록이 전폭이 아님(2열)`).toBeLessThan(layoutBox!.width * 0.9)
      if (width >= 1280) {
        expect(listBox!.width, `${width}px 넓은폭 목록 여유폭`).toBeGreaterThan(300)
      }
      // 중간폭 도달성: 2열에서 목록이 좁아도 작업 버튼이 (내부 스크롤로) 도달·클릭 가능한가
      const edit = page.getByTestId('perm-group-edit-개발자')
      await edit.scrollIntoViewIfNeeded()
      await expect(edit, `${width}px 개명 표시`).toBeVisible()
      await expect(edit, `${width}px 개명 활성`).toBeEnabled()
      const reachable = await edit.evaluate((el) => {
        const r = el.getBoundingClientRect()
        const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
        return hit === el || el.contains(hit)
      })
      expect(reachable, `${width}px 개명 버튼 중심 클릭 도달(내부 스크롤 후)`).toBe(true)
    }
  }
  // eslint-disable-next-line no-console
  console.log('LAYOUT_SUMMARY ' + JSON.stringify(summary, null, 2))
})

test('권한그룹 상호작용 — 320·375 개명 클릭 실행 + 마스터 잠금 보존', async ({ page }) => {
  const auth = await login(page)
  await injectAuth(page, auth)

  for (const width of [320, 375]) {
    await gotoPermGroups(page, width)

    // 마스터(빌트인) 개명·삭제 잠금 보존
    await expect(page.getByTestId('perm-group-edit-master'), `${width}px 마스터 개명 잠금`).toBeDisabled()
    await expect(page.getByTestId('perm-group-delete-master'), `${width}px 마스터 삭제 잠금`).toBeDisabled()

    // 개발자 개명: 표시·활성·실클릭 → 모달 열림 → 값 확인 → 취소
    const edit = page.getByTestId('perm-group-edit-개발자')
    await expect(edit, `${width}px 개명 표시`).toBeVisible()
    await expect(edit, `${width}px 개명 활성`).toBeEnabled()
    // 클릭 타깃 무결성: 버튼 중심이 조상 overflow:hidden 에 클리핑되지 않았는지
    const clickable = await edit.evaluate((el) => {
      const r = el.getBoundingClientRect()
      const cx = r.left + r.width / 2
      const cy = r.top + r.height / 2
      const hit = document.elementFromPoint(cx, cy)
      return hit === el || el.contains(hit)
    })
    expect(clickable, `${width}px 개명 버튼 중심이 클릭 도달(클리핑 아님)`).toBe(true)
    await edit.click()
    await expect(page.getByTestId('perm-group-form-name'), `${width}px 모달 값`).toHaveValue('개발자')
    await page.screenshot({ path: join(SHOT_DIR, `perm-group-${width}-edit-modal.png`), fullPage: true })
    await page.getByRole('button', { name: '취소', exact: true }).click()

    // 삭제 버튼: 배속>0 이므로 비활성 (개발자 assigned=2)
    await expect(page.getByTestId('perm-group-delete-개발자'), `${width}px 개발자 삭제 비활성(배속 2)`).toBeDisabled()
  }
})

test('다른 5화면 무회귀 라이브 스모크 — 375·320px 렌더·조작열 도달', async ({ page }) => {
  const auth = await login(page)
  await injectAuth(page, auth)

  const screens: { name: string; path: string; root?: string }[] = [
    { name: 'collection-plans', path: '/accounting/reports/collection-plans' },
    { name: 'notes-receivable', path: '/accounting/reports/notes-receivable' },
    { name: 'purchase-slips', path: '/accounting/purchase-slips', root: 'purchase-accounting-slip-page' },
    { name: 'sales-slips', path: '/accounting/sales-slips', root: 'sales-accounting-slip-page' },
    { name: 'blocked-partners', path: '/admin/blocked-partners', root: 'admin-blocked-table' },
  ]
  const report: Record<string, unknown>[] = []
  for (const s of screens) {
    for (const width of [375, 320]) {
      await page.setViewportSize({ width, height: 900 })
      await page.goto(`${BASE_URL}/#${s.path}`, { waitUntil: 'domcontentloaded', timeout: 25_000 })
      if (s.root) {
        await expect(page.getByTestId(s.root), `${s.name} ${width}px 페이지 렌더`).toBeVisible({ timeout: 20_000 })
      } else {
        // 리포트 화면: 페이지 제목/표 렌더 대기(데이터 없어도 표 골격/빈메시지)
        await page.waitForTimeout(1500)
      }
      const of = await horizontalOverflow(page, width)
      const hasTable = await page.locator('table').first().isVisible().catch(() => false)
      const btnCount = await page.locator('table button, [data-testid^="admin-blocked-unblock"]').count().catch(() => 0)
      report.push({
        screen: s.name, width, hasTable, actionBtns: btnCount,
        overflowPx: of.docScroll - of.clientWidth,
        offenders: of.offenders.map((o) => `${o.tag}:${o.right}:${o.clippedBy}`),
      })
      if (width === 375) {
        await page.screenshot({ path: join(SHOT_DIR, `other-${s.name}-375.png`), fullPage: true })
      }
      // 무회귀 불변식: 페이지 레벨 가로 스크롤 없음
      expect(of.docScroll, `${s.name} ${width}px 페이지 가로 오버플로우 ${JSON.stringify(of.offenders)}`)
        .toBeLessThanOrEqual(of.clientWidth + 1)
    }
  }
  // eslint-disable-next-line no-console
  console.log('OTHER5_SMOKE ' + JSON.stringify(report, null, 2))
})

test('권한그룹 긴 그룹명 throwaway — 320px 오버플로우·클리핑 stress', async ({ page }) => {
  const auth = await login(page)
  await injectAuth(page, auth)

  let createdId = ''
  try {
    // throwaway 생성 (marker prefix, 배속 0 → 삭제 가능)
    const created = await page.request.post(`${API_BASE}/auth/admin/permission-groups`, {
      headers: { Authorization: `Bearer ${auth.token}` },
      data: { name: THROWAWAY_NAME, description: 'ZZ재수렴검증 throwaway — 자동 삭제 대상' },
    })
    expect(created.ok(), `throwaway 생성 HTTP ${created.status()}`).toBeTruthy()
    createdId = (await created.json()).data?.id ?? ''
    expect(createdId, 'throwaway id').not.toBe('')

    await gotoPermGroups(page, 320)
    // 긴 이름 행이 렌더됐는지
    await expect(page.getByTestId('perm-group-manage-table')).toContainText('ZZ재수렴검증')

    const of = await horizontalOverflow(page, 320)
    await page.screenshot({ path: join(SHOT_DIR, 'perm-group-320-longname-throwaway.png'), fullPage: true })

    expect(
      of.docScroll,
      `긴 그룹명 320px 가로 오버플로우 offenders=${JSON.stringify(of.offenders)}`,
    ).toBeLessThanOrEqual(of.clientWidth + 1)
    // eslint-disable-next-line no-console
    console.log('LONGNAME_OVERFLOW ' + JSON.stringify(of))
  } finally {
    if (createdId) {
      const del = await page.request.delete(
        `${API_BASE}/auth/admin/permission-groups/${encodeURIComponent(createdId)}`,
        { headers: { Authorization: `Bearer ${auth.token}` } },
      )
      // eslint-disable-next-line no-console
      console.log(`THROWAWAY_CLEANUP id=${createdId} deleteHTTP=${del.status()}`)
      expect(del.ok(), `throwaway 삭제 HTTP ${del.status()}`).toBeTruthy()
    }
  }
})
