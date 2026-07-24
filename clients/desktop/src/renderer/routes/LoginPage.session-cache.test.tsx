// @vitest-environment jsdom
import React, { createElement, type ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, cleanup } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { LoginPage } from './LoginPage'
import { registerQueryClient } from '../queryClientRegistry'

const mocks = vi.hoisted(() => ({
  login: vi.fn(),
  setAuth: vi.fn(),
  navigate: vi.fn(),
  getPasswordPolicy: vi.fn(),
}))

vi.mock('../api/auth', () => ({ login: mocks.login }))
vi.mock('../stores/session', () => ({
  useSessionStore: (selector: (state: { setAuth: typeof mocks.setAuth }) => unknown) =>
    selector({ setAuth: mocks.setAuth }),
}))
vi.mock('../api/passwordApi', () => ({ getPasswordPolicy: mocks.getPasswordPolicy }))
vi.mock('react-router-dom', () => ({ useNavigate: () => mocks.navigate }))
vi.mock('@samhan/design-system', () => ({
  Button: ({ children, loading: _loading, fullWidth: _fullWidth, ...props }: { children: ReactNode; loading?: boolean; fullWidth?: boolean; [key: string]: unknown }) =>
    createElement('button', props, children),
  Card: ({ children }: { children: ReactNode }) => createElement('div', null, children),
  FormField: ({ label, render: renderField }: { label: string; render: (props: { id: string }) => ReactNode }) =>
    createElement('label', null, label, renderField({ id: label })),
}))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('LoginPage 세션 전환 캐시 경계', () => {
  it('로그인 성공 전에 이전 사용자 Query Cache를 비운다', async () => {
    const login = {
      token: 'new-token',
      userId: 'new-user',
      role: 'WAREHOUSE',
      displayName: '새 사용자',
      groups: [],
    }
    mocks.login.mockResolvedValue(login)
    mocks.setAuth.mockResolvedValue(undefined)
    mocks.getPasswordPolicy.mockResolvedValue({
      description: '정책',
      maxFailedLoginAttempts: 5,
    })

    const queryClient = new QueryClient()
    registerQueryClient(queryClient)
    queryClient.setQueryData(['permissions', 'my'], [{ pageCode: 'sales.slip.create' }])

    render(
      <QueryClientProvider client={queryClient}>
        <LoginPage />
      </QueryClientProvider>,
    )

    fireEvent.change(screen.getByTestId('login-id-input'), { target: { value: 'new-user' } })
    fireEvent.change(screen.getByTestId('login-password-input'), { target: { value: 'password' } })
    fireEvent.click(screen.getByTestId('login-submit-button'))

    await waitFor(() => expect(mocks.navigate).toHaveBeenCalledWith('/', { replace: true }))
    expect(queryClient.getQueryData(['permissions', 'my'])).toBeUndefined()
    expect(mocks.setAuth).toHaveBeenCalledWith(login)
  })
})
