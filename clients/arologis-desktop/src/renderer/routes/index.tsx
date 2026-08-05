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
  useCallback,
  useEffect,
  useRef,
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
import { ReceivedGroupsPage } from './dispatches/ReceivedGroupsPage'
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
 *
 * #815 후속 5-agent 리뷰 fix — stale-while-revalidate + stale-response guard:
 * - `isRefresh=false`(최초 진입/dispatchCode 변경): 기존과 동일하게 `dispatch` 를
 *   null 로 비워 로딩 화면을 보여준다.
 * - `isRefresh=true`(ManualLocationForm 저장 등 `onDataChanged` 트리거): 기존 데이터를
 *   유지한 채 백그라운드로만 재조회한다 — 매 수동 위치 저장마다 전체 화면이
 *   "불러오는 중..." 으로 깜빡이는 회귀를 방지한다.
 * - `activeCodeRef` + `requestSeqRef` 로 요청 시점의 dispatchCode 와 순번을 기록해두고,
 *   await 이후 현재 활성 코드/최신 요청 순번과 다르면 응답을 무시한다 — 네비게이션 도중
 *   도착한 이전 dispatch 응답과 같은 dispatchCode 의 이전 refresh 응답이 최신 화면을
 *   덮어쓰는 경합을 방지한다.
 * - `loadDetail` 은 클로저-캡처된 dispatchCode 대신 `latestDispatchCodeRef`(렌더마다 갱신)
 *   에서 "현재" 화면의 dispatchCode 를 읽는다 — 자식(ManualLocationForm)이 캡처한
 *   `onSaved` 클로저가 dispatch 간 네비게이션 후 뒤늦게 실행돼도 옛 dispatchCode 로
 *   activeCodeRef 가드를 하이재킹(엉뚱한 dispatch 로 화면 교체 / 로딩 영구 고착)하지 못하게
 *   한다(R3 리뷰 fix — R2 requestSeqRef 미커버 경로).
 */
function DispatchDetailRouteWrapper(): JSX.Element {
  // dispatchCode 는 라우팅 용도 전용 — 사용자 화면 노출 X (UUID 비공개 원칙 적용)
  const { dispatchCode } = useParams<{ dispatchCode: string }>()
  const [dispatch, setDispatch] = useState<DispatchDetail | null>(null)
  const [loadError, setLoadError] = useState<boolean>(false)
  const activeCodeRef = useRef<string | undefined>(undefined)
  const requestSeqRef = useRef(0)
  // 렌더마다 동기 갱신 — loadDetail 이 stale 클로저가 아닌 "현재" dispatchCode 를 참조하게 한다.
  const latestDispatchCodeRef = useRef(dispatchCode)
  latestDispatchCodeRef.current = dispatchCode

  const loadDetail = useCallback(async (isRefresh: boolean) => {
    const requestCode = latestDispatchCodeRef.current
    if (!requestCode) {
      activeCodeRef.current = undefined
      requestSeqRef.current += 1
      setDispatch(null)
      setLoadError(false)
      return
    }

    const requestSeq = requestSeqRef.current + 1
    activeCodeRef.current = requestCode
    requestSeqRef.current = requestSeq

    if (!isRefresh) {
      // 최초 진입/dispatchCode 변경 — 로딩 화면 표시.
      setDispatch(null)
      setLoadError(false)
    }
    // isRefresh=true — stale-while-revalidate, 기존 데이터를 그대로 보여준 채 재조회.

    try {
      const nextDispatch = await getDispatchDetail(requestCode)
      if (activeCodeRef.current !== requestCode || requestSeqRef.current !== requestSeq) return
      setDispatch(nextDispatch)
      setLoadError(false)
    } catch (err) {
      if (activeCodeRef.current !== requestCode || requestSeqRef.current !== requestSeq) return
      if (!isRefresh) {
        console.error('[DispatchDetailRouteWrapper] 배차 상세 조회 실패', err)
        setDispatch(null)
        setLoadError(true)
      } else {
        // 백그라운드 재조회 실패 — 기존 데이터를 유지(사용자 화면 유지), 콘솔에만 기록.
        console.error('[DispatchDetailRouteWrapper] 배차 상세 재조회 실패 — 기존 데이터 유지', err)
      }
    }
  }, [])

  useEffect(() => {
    void loadDetail(false)
  }, [dispatchCode, loadDetail])

  return (
    <DispatchDetailPage
      dispatch={dispatch}
      loadError={loadError}
      onDataChanged={() => loadDetail(true)}
    />
  )
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
          {
            path: 'pre-classify',
            element: (
              <PermissionGuard pageCode="arologis.dispatch.ops" action="view">
                <ArologisPreClassifyPage />
              </PermissionGuard>
            ),
          },
          { path: 'unassigned', element: <ArologisUnassignedPage /> },
          { path: 'reconcile', element: <ArologisDispatchReconcilePage /> },
          {
            path: 'received-groups',
            element: (
              <PermissionGuard pageCode="arologis.dispatch.ops" action="view">
                <ReceivedGroupsPage />
              </PermissionGuard>
            ),
          },
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
