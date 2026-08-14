// @vitest-environment jsdom
/**
 * PR #921 chore-B SONNET5 R4 — CODEX SOL 2차 적대검증 B-1 RED-first 회귀 게이트.
 *
 * 결함: `AppLayout.tsx` 의 `isPrintSurfacePath()` 가 별칭 `/sales/query`·`/purchases/query`
 * 만 검사하고, 사이드바 판매관리/구매관리 메뉴의 실제 진입점 `/sales`·`/purchases` 를
 * 빠뜨렸다. 그 결과 `.app-main:not(.is-print-surface)` 인쇄 차폐 규칙(global.css)이 기본
 * 진입점에서는 목록을 지워버린다(검색 모달이 열려 있을 때).
 *
 * `isPrintSurfacePath` 는 모듈 비공개 함수라 재구현 대신 실제 렌더 결과(`.app-main` 의
 * `is-print-surface` 클래스 부여 여부)로 블랙박스 검증한다 — CSS 매칭 규칙 자체는
 * global.css 가 이미 여러 real-qa 라운드로 증명했으므로, 여기서는 React 라우팅 로직만
 * 격리해서 빠르게(브라우저 없이) 확인한다. 실제 인쇄 CSS 캐스케이드는
 * playwright/choreb-sonnet-r4-real-qa 가 별도로 확인한다.
 */
import React from 'react'
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { AppLayout } from '../AppLayout'

const mocks = vi.hoisted(() => ({
  logout: vi.fn(async () => undefined),
  removeQueries: vi.fn(),
}))

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ removeQueries: mocks.removeQueries }),
}))

vi.mock('../../stores/session', () => ({
  canQuerySales: () => true,
  canQueryPurchases: () => true,
  useSessionStore: (selector: (state: { auth: { fullName: string; role: string }; logout: () => Promise<void> }) => unknown) =>
    selector({
      auth: { fullName: '[DEV-SEED] 오병승', role: 'MASTER' },
      logout: mocks.logout,
    }),
}))

vi.mock('../../stores/pageTitle', () => ({
  usePageTitleStore: (selector: (state: { title: string; meta: string | null }) => unknown) =>
    selector({ title: '홈', meta: null }),
}))

vi.mock('../../hooks/usePermissions', () => ({
  usePermissions: () => ({
    canAccess: () => true,
  }),
}))

vi.mock('../../hooks/useMenuCatalog', () => ({
  useMenuCatalog: () => ({
    menus: [],
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
}))

vi.mock('../NotificationBellDropdown', () => ({
  NotificationBellDropdown: () => <button type="button">알림</button>,
}))

function renderAt(pathname: string) {
  return render(
    <MemoryRouter initialEntries={[pathname]}>
      <Routes>
        <Route path="/" element={<AppLayout />}>
          <Route index element={<div>홈 화면</div>} />
          <Route path="sales" element={<div>판매관리 화면</div>} />
          <Route path="sales/query" element={<div>판매조회 화면(별칭)</div>} />
          <Route path="sales/closing" element={<div>매출마감 화면</div>} />
          <Route path="sales/link-dispatch" element={<div>배차 연결 화면</div>} />
          <Route path="sales/new" element={<div>판매 신규 화면</div>} />
          <Route path="purchases" element={<div>구매관리 화면</div>} />
          <Route path="purchases/query" element={<div>구매조회 화면(별칭)</div>} />
          <Route path="purchases/xxx" element={<div>구매 자식 화면</div>} />
          <Route path="sales/:id/print/statement" element={<div>거래명세서 인쇄 화면</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  )
}

function isPrintSurface(): boolean {
  const main = document.querySelector('.app-main')
  if (!main) throw new Error('.app-main not found — AppLayout 렌더 실패')
  return main.classList.contains('is-print-surface')
}

afterEach(() => {
  cleanup()
})

describe('AppLayout isPrintSurfacePath — PR #921 SOL 2차 B-1', () => {
  test('공통 헤더는 DEV-SEED 표시명을 사용자에게 내보내지 않는다', () => {
    renderAt('/')
    const header = document.querySelector('[data-testid="header-user-name"]')
    expect(header?.textContent).toContain('오병승')
    expect(header?.textContent).not.toContain('[DEV-SEED]')
  })

  test('사이드바 판매관리 진입점 /sales 는 인쇄 표면으로 판정된다', () => {
    renderAt('/sales')
    expect(isPrintSurface(), '/sales(기본 진입점)이 is-print-surface 클래스를 받지 못했다').toBe(true)
  })

  test('사이드바 구매관리 진입점 /purchases 는 인쇄 표면으로 판정된다', () => {
    renderAt('/purchases')
    expect(isPrintSurface(), '/purchases(기본 진입점)이 is-print-surface 클래스를 받지 못했다').toBe(true)
  })

  test('대조 — 별칭 /sales/query 는 여전히 인쇄 표면이다(기존 동작 무회귀)', () => {
    renderAt('/sales/query')
    expect(isPrintSurface()).toBe(true)
  })

  test('대조 — 별칭 /purchases/query 는 여전히 인쇄 표면이다(기존 동작 무회귀)', () => {
    renderAt('/purchases/query')
    expect(isPrintSurface()).toBe(true)
  })

  test.each([
    ['/sales/', '판매관리 trailing slash'],
    ['/Sales', '판매관리 대소문자 변형'],
    ['/sales/query/', '판매조회 별칭 trailing slash'],
    ['/PURCHASES/', '구매관리 대소문자·trailing slash'],
    ['/purchases/query/', '구매조회 별칭 trailing slash'],
  ])('%s 는 React Router 동등 경로이므로 인쇄 표면이다 — %s', (pathname) => {
    renderAt(pathname)
    expect(isPrintSurface(), `${pathname} 동등 경로가 인쇄 표면으로 판정되지 않았다`).toBe(true)
  })

  test.each([
    ['/sales/closing', '회계 자식 화면'],
    ['/sales/link-dispatch', '그룹웨어 자식 화면'],
    ['/sales/new', '판매 신규 화면'],
    ['/purchases/xxx', '구매 자식 화면'],
  ])('과잉 방지 — %s 는 인쇄 표면이 아니다(%s, exact 매칭)', (pathname) => {
    renderAt(pathname)
    expect(isPrintSurface(), `${pathname} 이 prefix 과매칭으로 인쇄 표면이 됐다`).toBe(false)
  })

  test.each(['/sales/slip-1/print/statement', '/sales/slip-1/Print/statement'])
  ('불변 — 전체 페이지 인쇄 라우트(/print/ 세그먼트)는 여전히 인쇄 표면이다: %s', (pathname) => {
    renderAt(pathname)
    expect(isPrintSurface()).toBe(true)
  })
})
