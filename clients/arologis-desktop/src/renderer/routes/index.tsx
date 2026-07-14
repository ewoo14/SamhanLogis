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
 * - `/admin/employees`    인사 직원 관리
 * - `/admin/departments`  인사 부서 관리
 * - `/admin/cashbook`     회계 현금출납장 (간이 회계 수입/지출)
 * - `/admin/permissions`  권한 관리 (롤×page-code 매트릭스 — page-code 권한 기반)
 *
 * `ProtectedRoute` 가 토큰 부재 시 `/login` 으로 강제 리다이렉트한다.
 */
import {
  useEffect,
  useState,
} from 'react'
import {
  createHashRouter,
  Navigate,
  RouterProvider,
  useParams,
} from 'react-router-dom'
import { getDispatchDetail } from '../api/arologisDispatchDetail'
import { AppLayout } from '../components/AppLayout'
import { PermissionGuard } from '../components/PermissionGuard'
import { ProtectedRoute } from '../components/ProtectedRoute'
import { LoginPage } from './login/LoginPage'
import { DriverManagementPage } from './drivers/DriverManagementPage'
import { EmployeesPage } from './admin/EmployeesPage'
import { DepartmentsPage } from './admin/DepartmentsPage'
import { CashbookPage } from './admin/CashbookPage'
import { AccountsPage } from './admin/AccountsPage'
import { PermissionsPage } from './admin/PermissionsPage'
import { DispatchesLayout } from './dispatches/DispatchesLayout'
import { ArologisManualDispatchPage } from './dispatches/ManualDispatchPage'
import { ArologisPreClassifyPage } from './dispatches/PreClassifyPage'
import { ArologisUnassignedPage } from './dispatches/UnassignedPage'
import { ArologisDispatchReconcilePage } from './dispatches/DispatchReconcilePage'
import {
  DispatchDetailPage,
  type DispatchDetail,
} from './dispatches/DispatchDetailPage'

/**
 * DispatchDetailPage 라우트 래퍼 — URL params 에서 dispatchCode 를 추출.
 * QA Playwright page.route() mock 과 실 BE endpoint 양쪽에서 동일한 fetch 경로를 사용한다.
 *
 * SP-10-2 TM cross-check cycle 2: orphan → router mount 연결.
 * SP-10-2 TM cross-check cycle 3: loadError state 분리 (Cycle 2 FE-C2-1 P1 fix).
 * fetch 실패 시 사용자가 "배차 정보를 불러오는 중..." 영구 노출되는 회귀 방지.
 */
function DispatchDetailRouteWrapper(): JSX.Element {
  // dispatchCode 는 라우팅 용도 전용 — 사용자 화면 노출 X (UUID 비공개 원칙 적용)
  const { dispatchCode } = useParams<{ dispatchCode: string }>()
  const [dispatch, setDispatch] = useState<DispatchDetail | null>(null)
  const [loadError, setLoadError] = useState<boolean>(false)

  useEffect(() => {
    if (!dispatchCode) {
      setDispatch(null)
      setLoadError(false)
      return
    }

    let cancelled = false
    setDispatch(null)
    setLoadError(false)

    getDispatchDetail(dispatchCode)
      .then((nextDispatch) => {
        if (!cancelled) {
          setDispatch(nextDispatch)
          setLoadError(false)
        }
      })
      .catch((err) => {
        console.error('[DispatchDetailRouteWrapper] 배차 상세 조회 실패', err)
        if (!cancelled) {
          setDispatch(null)
          setLoadError(true)
        }
      })

    return () => {
      cancelled = true
    }
  }, [dispatchCode])

  return <DispatchDetailPage dispatch={dispatch} loadError={loadError} />
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
      {
        path: 'admin/employees',
        element: (
          <PermissionGuard pageCode="arologis.hr.employees" action="view">
            <EmployeesPage />
          </PermissionGuard>
        ),
      },
      {
        path: 'admin/departments',
        element: (
          <PermissionGuard pageCode="arologis.hr.departments" action="view">
            <DepartmentsPage />
          </PermissionGuard>
        ),
      },
      {
        path: 'admin/cashbook',
        element: (
          <PermissionGuard pageCode="arologis.accounting.cashbook" action="view">
            <CashbookPage />
          </PermissionGuard>
        ),
      },
      {
        path: 'admin/accounts',
        element: (
          <PermissionGuard pageCode="arologis.accounting.accounts" action="view">
            <AccountsPage />
          </PermissionGuard>
        ),
      },
      {
        path: 'admin/permissions',
        element: (
          <PermissionGuard pageCode="arologis.admin.permissions" action="view" requireMaster>
            <PermissionsPage />
          </PermissionGuard>
        ),
      },
    ],
  },
])

export function AppRouter(): JSX.Element {
  return <RouterProvider router={router} />
}
