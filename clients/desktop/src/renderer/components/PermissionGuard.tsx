/**
 * PermissionGuard — 동적 RBAC 기반 라우트 가드.
 *
 * SP-D1 슬라이스. RoleGuard (정적 역할 화이트리스트) 와 달리
 * 서버 권한 매트릭스 기반으로 판정.
 *
 * 권한 없는 URL 직접 진입 시 → 404 페이지 렌더 (사이드바 미노출과 일관).
 * "접근 불가" 메시지 대신 URL 자체가 존재하지 않는 것처럼 처리.
 *
 * 로딩 중 (permissions 미캐시) → 권한 확인 spinner 만 렌더.
 * 캐시 완료 후 권한 없음 확인 시 홈으로 전환.
 */
import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { MascotLoader } from '@samhan/design-system'
import { usePermissions } from '../hooks/usePermissions'
import type { PageCode, PermissionLookupAction } from '../api/permissionsApi'
import { canQueryPurchases, canQuerySales, useSessionStore } from '../stores/session'
import type { SlipType } from '../api/slip'

export interface PermissionGuardProps {
  /**
   * 접근 허용 여부를 판단할 페이지 코드.
   *
   * 배열 전달 시 OR 판정(배열 중 하나라도 canAccess 가 true 면 통과) — 서로 다른
   * page-code 로 동일 화면에 도달 가능한 경우(예: #17 S4b H1) 사용한다.
   * 단일 pageCode 전달 시 동작은 기존과 100% 동일(backward-compat) — 이 컴포넌트는
   * 다수 라우트가 공유하므로 기존 호출부는 무영향이다.
   */
  pageCode: PageCode | PageCode[]
  /** 확인할 액션 (기본값: 'view'). */
  action?: PermissionLookupAction
  /** 가드 통과 시 렌더링. */
  children: ReactNode
}

/**
 * 동적 RBAC 기반 라우트 가드.
 *
 * <p>권한 없으면 홈으로 redirect (404 효과 — 사이드바에도 메뉴가 없으므로
 * 사용자 입장에서는 해당 URL 이 존재하지 않는 것과 동일).
 * 로딩 중에는 children 을 통과시키지 않아 권한 확인 전 화면 노출을 막는다.
 */
export function PermissionGuard({
  pageCode,
  action = 'view',
  children,
}: PermissionGuardProps) {
  const { canAccess, isLoading } = usePermissions()

  // 로딩 중 fail-closed — 권한 확인 전 보호 화면이 flash 되지 않도록 차단.
  if (isLoading) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', minHeight: 'calc(100vh - 120px)' }}>
        <MascotLoader size="md" label="권한 확인 중" />
      </div>
    )
  }

  // 배열이면 OR 판정 — 단일 pageCode 분기는 기존 canAccess(pageCode, action) 호출과
  // 100% 동일하게 유지해 다른 라우트의 기존 동작에 영향을 주지 않는다.
  const hasAccess = Array.isArray(pageCode)
    ? pageCode.some((code) => canAccess(code, action))
    : canAccess(pageCode, action)

  // 권한 없음 → 홈 redirect (사이드바에도 없으므로 404 동일 효과)
  if (!hasAccess) {
    return <Navigate to="/" replace />
  }

  return <>{children}</>
}

/**
 * 전표 유형별 서버 조회 guard와 동일한 진입 경로 guard.
 *
 * PageCode의 VIEW seed는 서버의 전표 유형별 조회 허용 집합보다 넓을 수 있으므로,
 * 메뉴·목록·상세가 모두 같은 유형 판정을 소비해야 403을 사용자에게 노출하지 않는다.
 */
export function SlipReadGuard({
  mode,
  allowApprovalLineCandidate = false,
  children,
}: {
  mode: SlipType
  /** OUTBOUND 상세 API가 전표별 결재선 capability를 판정하도록 정적 목록 가드를 건너뛴다. */
  allowApprovalLineCandidate?: boolean
  children: ReactNode
}) {
  const auth = useSessionStore((state) => state.auth)
  const hasReadAccess = mode === 'OUTBOUND'
    ? canQuerySales(auth)
    : canQueryPurchases(auth)

  if (!hasReadAccess && !(mode === 'OUTBOUND' && allowApprovalLineCandidate)) {
    return <Navigate to="/" replace />
  }

  return <>{children}</>
}
