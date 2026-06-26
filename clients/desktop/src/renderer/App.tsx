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

/**
 * 단일 QueryClient — 5분 staleTime + 1회 retry.
 * 권한/토큰 변경 시 `queryClient.clear()` 로 초기화 가능.
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

export function App() {
  const bootstrap = useSessionStore((s) => s.bootstrap)
  const bootstrapped = useSessionStore((s) => s.bootstrapped)

  useEffect(() => {
    void bootstrap()
  }, [bootstrap])

  return (
    <QueryClientProvider client={queryClient}>
      <AppRouter />
      <AppVersionGate bootstrapped={bootstrapped} />
    </QueryClientProvider>
  )
}
