/**
 * 아로로지스 라우트 정의 — `HashRouter` 기반.
 *
 * Electron 의 `file://` 프로토콜에서는 BrowserRouter 가 새로고침 시 404 를 일으키므로
 * `createHashRouter` 를 사용한다 (Samhan Public desktop 패턴 일치).
 *
 * 라우트:
 * - `/login`        admin 로그인 (loginId + password) — 보호 X
 * - `/`             대시보드 (배차 진입점으로 redirect)
 * - `/dispatches/*` 배차 화면 (`routes/dispatches/` 하위 — F2 에서 git mv 로 이전)
 * - `/drivers`      기사 마스터 (phoneNumber 사전 등록 — F4)
 *
 * `ProtectedRoute` 가 토큰 부재 시 `/login` 으로 강제 리다이렉트한다.
 */
import {
  createHashRouter,
  Navigate,
  RouterProvider,
} from 'react-router-dom'
import { AppLayout } from '../components/AppLayout'
import { ProtectedRoute } from '../components/ProtectedRoute'
import { LoginPage } from './login/LoginPage'
import { DriverManagementPage } from './drivers/DriverManagementPage'
import { DispatchesLayout } from './dispatches/DispatchesLayout'
import { ArologisManualDispatchPage } from './dispatches/ManualDispatchPage'
import { ArologisPreClassifyPage } from './dispatches/PreClassifyPage'
import { ArologisUnassignedPage } from './dispatches/UnassignedPage'
import { ArologisDispatchReconcilePage } from './dispatches/DispatchReconcilePage'

const router = createHashRouter([
  { path: '/login', element: <LoginPage /> },
  {
    path: '/',
    element: (
      <ProtectedRoute>
        <AppLayout />
      </ProtectedRoute>
    ),
    children: [
      { index: true, element: <Navigate to="/dispatches" replace /> },
      {
        path: 'dispatches',
        element: <DispatchesLayout />,
        children: [
          { index: true, element: <Navigate to="/dispatches/manual" replace /> },
          { path: 'manual', element: <ArologisManualDispatchPage /> },
          { path: 'pre-classify', element: <ArologisPreClassifyPage /> },
          { path: 'unassigned', element: <ArologisUnassignedPage /> },
          { path: 'reconcile', element: <ArologisDispatchReconcilePage /> },
        ],
      },
      { path: 'drivers', element: <DriverManagementPage /> },
    ],
  },
])

export function AppRouter(): JSX.Element {
  return <RouterProvider router={router} />
}
