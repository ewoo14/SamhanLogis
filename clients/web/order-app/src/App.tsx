/**
 * 앱 루트 — QueryClient + 세션 부트 + Route 등록.
 *
 * <p>의도:
 * - 첫 mount 에서 `useSessionStore.bootstrap()` 호출 → sessionStorage 토큰 복원
 * - Route 10종 (route §2.2.1) 등록
 * - PWA install prompt 5초 지연 (5초 후 표시, dismiss 시 7일 후 재시도) — F2/§7.1 #9
 */
import { useEffect } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useSessionStore } from './stores/session'
import { AuthGuard } from './components/auth/AuthGuard'
import { PwaInstallPrompt } from './components/layout/PwaInstallPrompt'
import { BizGatePage } from './routes/BizGatePage'
import { RegisterPage } from './routes/RegisterPage'
import { TempPasswordPage } from './routes/TempPasswordPage'
import { OrderListPage } from './routes/OrderListPage'
import { OrderFormPage } from './routes/OrderFormPage'
import { OrderDetailPage } from './routes/OrderDetailPage'
import { OrderPreviewPage } from './routes/OrderPreviewPage'
import { OrderInfoPage } from './routes/OrderInfoPage'
import { OrderSnapshotPage } from './routes/OrderSnapshotPage'
import { BranchCalculationPage } from './routes/BranchCalculationPage'
import { ProfilePage } from './routes/ProfilePage'
import { SettingsPage } from './routes/SettingsPage'

/** 단일 QueryClient — 5분 staleTime + 1회 retry. */
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
  useEffect(() => {
    bootstrap()
  }, [bootstrap])

  return (
    <QueryClientProvider client={queryClient}>
      <Routes>
        {/* 인증 (보호 X) */}
        <Route path="/auth/login" element={<BizGatePage />} />
        <Route path="/auth/register" element={<RegisterPage />} />
        <Route path="/auth/temp-password" element={<TempPasswordPage />} />

        {/* 보호 routes */}
        <Route
          path="/orders"
          element={
            <AuthGuard>
              <OrderListPage />
            </AuthGuard>
          }
        />
        <Route
          path="/orders/new"
          element={
            <AuthGuard>
              <OrderFormPage />
            </AuthGuard>
          }
        />
        <Route
          path="/orders/preview"
          element={
            <AuthGuard>
              <OrderPreviewPage />
            </AuthGuard>
          }
        />
        <Route
          path="/orders/info"
          element={
            <AuthGuard>
              <OrderInfoPage />
            </AuthGuard>
          }
        />
        <Route
          path="/orders/snapshots"
          element={
            <AuthGuard>
              <OrderSnapshotPage />
            </AuthGuard>
          }
        />
        <Route
          path="/orders/:orderNo"
          element={
            <AuthGuard>
              <OrderDetailPage />
            </AuthGuard>
          }
        />
        <Route
          path="/branch"
          element={
            <AuthGuard>
              <BranchCalculationPage />
            </AuthGuard>
          }
        />
        <Route
          path="/profile"
          element={
            <AuthGuard>
              <ProfilePage />
            </AuthGuard>
          }
        />
        <Route
          path="/settings"
          element={
            <AuthGuard>
              <SettingsPage />
            </AuthGuard>
          }
        />

        {/* 기본 redirect */}
        <Route path="/" element={<Navigate to="/auth/login" replace />} />
        <Route path="*" element={<Navigate to="/auth/login" replace />} />
      </Routes>

      <PwaInstallPrompt />
    </QueryClientProvider>
  )
}
