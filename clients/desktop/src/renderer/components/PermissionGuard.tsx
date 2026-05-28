/**
 * PermissionGuard — 동적 RBAC 기반 라우트 가드.
 *
 * SP-D1 슬라이스. RoleGuard (정적 역할 화이트리스트) 와 달리
 * 서버 권한 매트릭스 기반으로 판정.
 *
 * 권한 없는 URL 직접 진입 시 → 404 페이지 렌더 (사이드바 미노출과 일관).
 * "접근 불가" 메시지 대신 URL 자체가 존재하지 않는 것처럼 처리.
 *
 * 로딩 중 (permissions 미캐시) → 일시적으로 children 렌더 (깜박임 방지).
 * 캐시 완료 후 권한 없음 확인 시 NotFound 로 전환.
 */
import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { usePermissions } from '../hooks/usePermissions'
import type { PageCode, PermissionLookupAction } from '../api/permissionsApi'

export interface PermissionGuardProps {
  /** 접근 허용 여부를 판단할 페이지 코드. */
  pageCode: PageCode
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
 * 로딩 중에는 children 을 투명하게 통과시켜 깜박임 방지.
 */
export function PermissionGuard({
  pageCode,
  action = 'view',
  children,
}: PermissionGuardProps) {
  const { canAccess, isLoading } = usePermissions()

  // 로딩 중 — children 렌더 (깜박임 방지). 캐시 완료 시 재평가.
  if (isLoading) {
    return <>{children}</>
  }

  // 권한 없음 → 홈 redirect (사이드바에도 없으므로 404 동일 효과)
  if (!canAccess(pageCode, action)) {
    return <Navigate to="/" replace />
  }

  return <>{children}</>
}
