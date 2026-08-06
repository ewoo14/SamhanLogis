// @vitest-environment jsdom
/**
 * PermissionGuard — 동적 RBAC 라우트 가드 유닛 테스트 (#17 S4b R2 fix, FE-LOW + QA-MED#1).
 *
 * 다수 라우트가 공유하는 컴포넌트이자 H1(#17 S4b, ACCOUNTANT 는 배열 pageCode 중 하나만
 * 보유해도 OR 판정으로 도달)의 실 게이트키퍼임에도 직접 렌더 테스트가 없었다.
 * MemoryRouter + Routes 로 redirect 목적지("/")를 실제로 렌더해, Navigate mock 없이도
 * 가드가 진짜로 홈으로 보내는지 확인한다.
 */
import React from 'react'
import fs from 'node:fs'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import type { PageCode } from '../api/permissionsApi'
import { PermissionGuard } from './PermissionGuard'

const mocks = vi.hoisted(() => ({
  canAccess: vi.fn(),
  // isLoading 은 mock 함수가 아니라 일반 값 — 테스트별로 mocks.state.isLoading 을 직접
  // 갱신해 usePermissions() 재호출 시 최신 값을 반영한다.
  state: { isLoading: false },
}))

vi.mock('../hooks/usePermissions', () => ({
  usePermissions: () => ({ canAccess: mocks.canAccess, isLoading: mocks.state.isLoading }),
}))

vi.mock('@samhan/design-system', () => ({
  MascotLoader: ({ label }: { label?: string }) => <div>{label ?? '로딩'}</div>,
}))

const PROTECTED_TEXT = '보호된 화면'
const HOME_TEXT = '홈 화면'

function renderGuard(pageCode: PageCode | PageCode[]) {
  return render(
    <MemoryRouter initialEntries={['/protected']}>
      <Routes>
        <Route path="/" element={<div>{HOME_TEXT}</div>} />
        <Route
          path="/protected"
          element={
            <PermissionGuard pageCode={pageCode}>
              <div>{PROTECTED_TEXT}</div>
            </PermissionGuard>
          }
        />
      </Routes>
    </MemoryRouter>,
  )
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  mocks.state.isLoading = false
})

describe('PermissionGuard', () => {
  it('OUTBOUND 상세 라우트는 승인선 후보 진입 경로를 SlipReadGuard에 전달한다', () => {
    const routes = fs.readFileSync(
      path.resolve(process.cwd(), 'src/renderer/routes/index.tsx'),
      'utf8',
    )
    expect(routes).toContain('allowApprovalLineCandidate')
  })

  it('단일 pageCode(string)·canAccess true 이면 children 을 렌더한다(하위호환)', () => {
    mocks.canAccess.mockReturnValue(true)

    renderGuard('sales.estimate-config')

    expect(screen.getByText(PROTECTED_TEXT)).not.toBeNull()
    expect(mocks.canAccess).toHaveBeenCalledWith('sales.estimate-config', 'view')
  })

  it('단일 pageCode·canAccess false 이면 홈("/")으로 redirect 한다', () => {
    mocks.canAccess.mockReturnValue(false)

    renderGuard('sales.estimate-config')

    expect(screen.getByText(HOME_TEXT)).not.toBeNull()
    expect(screen.queryByText(PROTECTED_TEXT)).toBeNull()
  })

  it('배열 [A,B] 중 A 만 true([T,F])면 통과한다(OR 판정)', () => {
    mocks.canAccess.mockImplementation((code: PageCode) => code === 'sales.estimate-config')

    renderGuard(['sales.estimate-config', 'products.price-schedule'])

    expect(screen.getByText(PROTECTED_TEXT)).not.toBeNull()
    expect(screen.queryByText(HOME_TEXT)).toBeNull()
  })

  it('배열 [A,B] 중 B 만 true([F,T])면 통과한다(OR 판정)', () => {
    mocks.canAccess.mockImplementation((code: PageCode) => code === 'products.price-schedule')

    renderGuard(['sales.estimate-config', 'products.price-schedule'])

    expect(screen.getByText(PROTECTED_TEXT)).not.toBeNull()
    expect(screen.queryByText(HOME_TEXT)).toBeNull()
  })

  it('배열 [A,B] 둘 다 false([F,F])면 redirect 한다', () => {
    mocks.canAccess.mockReturnValue(false)

    renderGuard(['sales.estimate-config', 'products.price-schedule'])

    expect(screen.getByText(HOME_TEXT)).not.toBeNull()
    expect(screen.queryByText(PROTECTED_TEXT)).toBeNull()
  })

  it('isLoading=true 이면 children 을 렌더하지 않는다(spinner)', () => {
    mocks.state.isLoading = true
    mocks.canAccess.mockReturnValue(true)

    renderGuard('sales.estimate-config')

    expect(screen.queryByText(PROTECTED_TEXT)).toBeNull()
    expect(screen.queryByText(HOME_TEXT)).toBeNull()
    expect(screen.getByText('권한 확인 중')).not.toBeNull()
  })
})
