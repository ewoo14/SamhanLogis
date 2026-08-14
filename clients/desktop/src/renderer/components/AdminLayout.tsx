/**
 * 인사 통합 관리 셸 — 대표실 부서 + MASTER 전용 레이아웃.
 *
 * <p>AppLayout 의 Outlet 안에 mount 되며, 두 단계 가드 적용:
 * 1) {@link RoleGuard} — MASTER ROLE 미소지 사용자 즉시 차단 (동기, BE 호출 없음)
 * 2) {@code useQuery} — `GET /api/v1/users/me/is-executive-office` 로 대표실 부서
 *    소속 여부 확인. false 시 `/forbidden` redirect.
 *
 * 인사 사이드바 6 entry:
 * - 신규 인사    (`/admin/users/new`)         — admin-nav-users-new
 * - 권한 조정    (`/admin/roles`)              — admin-nav-roles
 * - 부서         (`/admin/departments`)        — admin-nav-departments
 * - 거래처 DC 설정 (`/sales/partner-dc-config`)  — admin-nav-dc-config
 * - 거래처 관리  (`/admin/partners`)           — admin-nav-partners (공용 거래처 화면 quick link)
 * - 창고 관리    (`/admin/warehouses`)         — admin-nav-warehouses
 *
 * memory feedback_uuid_no_user_visibility — admin 화면도 비즈니스 식별자만 노출.
 * memory feedback_role_naming_full — entry 라벨/가드 표기 풀네임 사용.
 */
import { Navigate, NavLink, Outlet } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { MascotLoader } from '@samhan/design-system'
import { RoleGuard } from './RoleGuard'
import { fetchIsExecutiveOffice } from '../api/adminApi'

const ADMIN_ROLES = ['MASTER'] as const

export function AdminLayout() {
  return (
    <RoleGuard allow={ADMIN_ROLES}>
      <AdminLayoutInner />
    </RoleGuard>
  )
}

/**
 * 대표실 부서 가드 — MASTER ROLE 통과 후 BE 호출로 추가 검증.
 *
 * RoleGuard 가 MASTER 를 확인한 뒤 mount 되므로, MASTER 전제 하에
 * 대표실 부서 소속 여부만 판정한다.
 */
function AdminLayoutInner() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['me', 'executive-office'],
    queryFn: fetchIsExecutiveOffice,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  })

  if (isLoading) {
    return (
      <div
        style={{
          display: 'grid',
          placeItems: 'center',
          minHeight: 'calc(100vh - 120px)',
        }}
      >
        <MascotLoader size="md" label="권한 확인 중" />
      </div>
    )
  }

  // 오류 또는 대표실 미소속 → /forbidden 리다이렉트
  if (isError || !data?.isExecutiveOffice) {
    return <Navigate to="/forbidden" replace />
  }

  return (
    <div
      className="admin-shell"
      style={{
        display: 'grid',
        gridTemplateColumns: '200px 1fr',
        gap: 16,
        minHeight: 'calc(100vh - 120px)',
      }}
      data-testid="admin-shell"
    >
      <aside
        className="admin-sidebar"
        style={{
          background: 'var(--color-neutral-0)',
          border: '1px solid var(--color-neutral-200)',
          borderRadius: 6,
          padding: 12,
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
          height: 'fit-content',
        }}
      >
        <div
          style={{
            padding: '8px 12px 12px',
            fontSize: 12,
            fontWeight: 700,
            color: 'var(--color-brand-700)',
            borderBottom: '1px solid var(--color-neutral-100)',
            marginBottom: 8,
          }}
        >
          인사 (대표실 전용)
        </div>
        {/* [PR-HR] 신규 인사 등록 — /admin/users/new (action=create) */}
        <AdminNav to="/admin/users/new" testId="admin-nav-users-new">
          신규 인사
        </AdminNav>
        <AdminNav to="/admin/roles" testId="admin-nav-roles">
          권한 조정
        </AdminNav>
        <AdminNav to="/admin/departments" testId="admin-nav-departments">
          부서
        </AdminNav>
        {/*
          [PR-D Phase B FE-C] DC 설정 — sales 라우트이지만 MASTER 전용 CSV 일괄 업로드.
          인사 카테고리에 통합 노출 (TM PR #115 권고 유지).
        */}
        <AdminNav
          to="/sales/partner-dc-config"
          testId="admin-nav-dc-config"
        >
          거래처 DC 설정
        </AdminNav>
        <AdminNav to="/admin/partners" testId="admin-nav-partners">
          거래처 관리
        </AdminNav>
        <AdminNav to="/admin/warehouses" testId="admin-nav-warehouses">
          창고관리
        </AdminNav>
        {/*
          [Slice 2 이관 완료] 다음 4건은 PR #159 에서 일반 카테고리 (설정/arologis/영업/메신저)
          단독 노출로 이동. 라우트 유지 (legacy 호환). 인사 사이드바 미노출.
          - 시트 동기화 (/admin/sheet-sync) → 설정
          - 지역 분류 (/admin/regions) → arologis
          - 발송금지 거래처 (/admin/blocked-partners) → 영업
          - 알리고 주소록 (/admin/aligo-address-book) → 메신저
        */}
      </aside>
      <section className="admin-main">
        <Outlet />
      </section>
    </div>
  )
}

interface AdminNavProps {
  to: string
  testId: string
  children: React.ReactNode
}

function AdminNav({ to, testId, children }: AdminNavProps) {
  return (
    <NavLink
      to={to}
      data-testid={testId}
      style={({ isActive }) => ({
        display: 'block',
        padding: '8px 12px',
        borderRadius: 6,
        fontSize: 13,
        color: isActive
          ? 'var(--color-brand-700)'
          : 'var(--color-neutral-700)',
        background: isActive ? 'var(--color-brand-50)' : 'transparent',
        textDecoration: 'none',
        fontWeight: isActive ? 600 : 400,
      })}
    >
      {children}
    </NavLink>
  )
}
