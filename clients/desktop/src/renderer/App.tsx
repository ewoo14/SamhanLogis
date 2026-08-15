/**
 * 앱 루트 — QueryClient + 세션 부트스트랩 + RouterProvider.
 *
 * 부팅 시퀀스:
 * 1) 컴포넌트 mount → `useSessionStore.bootstrap()` 호출 (IPC 로 토큰 조회)
 * 2) bootstrap 완료까지는 AuthGuard 가 spinner 표시
 * 3) 토큰이 있으면 `/` 로, 없으면 `/login` 으로 이동 (AuthGuard 책임)
 */
import { useEffect } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AppRouter } from './routes'
import { useSessionStore } from './stores/session'
import { AppVersionGate } from './components/common/AppVersionGate'
import { CertificateExpiryNotice } from './components/common/CertificateExpiryNotice'
import { BiometricLockGate } from './components/common/BiometricLockGate'
import { AppNoticeGate } from './components/common/AppNoticeGate'
import { registerQueryClient } from './queryClientRegistry'

/**
 * 단일 QueryClient — 5분 staleTime + 1회 retry.
 * 권한/토큰 변경 시 registry 를 통해 `queryClient.clear()` 로 초기화한다.
 */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
})

registerQueryClient(queryClient)

export function App() {
  const bootstrap = useSessionStore((s) => s.bootstrap)
  const bootstrapped = useSessionStore((s) => s.bootstrapped)
  const hasSession = useSessionStore((s) => Boolean(s.auth))

  useEffect(() => {
    void bootstrap()
  }, [bootstrap])

  return (
    <QueryClientProvider client={queryClient}>
      <AppVersionGate bootstrapped={bootstrapped}>
        <BiometricLockGate bootstrapped={bootstrapped} enabled={hasSession}>
          <AppRouter />
        </BiometricLockGate>
      </AppVersionGate>
      <CertificateExpiryNotice />
      <AppNoticeGate bootstrapped={bootstrapped} authenticated={hasSession} />
    </QueryClientProvider>
  )
}
