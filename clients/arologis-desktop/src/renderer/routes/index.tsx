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
  useParams,
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
import { DispatchDetailPage } from './dispatches/DispatchDetailPage'

/**
 * DispatchDetailPage 라우트 래퍼 — URL params 에서 dispatchCode 를 추출.
 * 실제 데이터 로딩은 BE GET endpoint 완성 후 React Query 로 대체 예정 (운영 cutover 시).
 * 현재는 null 전달 (로딩 상태 표시) — QA Playwright 가 page.route() mock 으로 dispatch 데이터 주입.
 *
 * SP-10-2 TM cross-check cycle 2: orphan → router mount 연결.
 */
function DispatchDetailRouteWrapper(): JSX.Element {
  // dispatchCode 는 라우팅 용도 전용 — 사용자 화면 노출 X (UUID 비공개 원칙 적용)
  const { dispatchCode } = useParams<{ dispatchCode: string }>()
  // TODO: React Query 로 dispatch 데이터 로딩 (BE /api/arologis/dispatches/{id} 완성 후)
  // const { data: dispatch } = useQuery(...)
  void dispatchCode // 현재 미사용 — 컴파일 경고 억제
  return <DispatchDetailPage dispatch={null} />
}

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
          // SP-10-2 FE-3/FE-4: 배차 상세 페이지 — 사이드바 links 배열 변경 없음
          { path: 'detail/:dispatchCode', element: <DispatchDetailRouteWrapper /> },
        ],
      },
      { path: 'drivers', element: <DriverManagementPage /> },
    ],
  },
])

export function AppRouter(): JSX.Element {
  return <RouterProvider router={router} />
}
