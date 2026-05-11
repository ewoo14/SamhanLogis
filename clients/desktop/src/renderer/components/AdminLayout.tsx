/**
 * 관리자 통합 admin 셸 — Phase 10 P0-5 슬라이스 4.
 *
 * <p>AppLayout 의 Outlet 안에 mount 되며, MASTER 만 접근 허용 (RoleGuard).
 * 좌측 5 entry 사이드바 + 우측 본문 (Outlet).
 *
 * 사이드바 entry:
 * - 사용자 (`/admin/users`)
 * - 권한    (`/admin/roles`)
 * - 거래처 (`/admin/partners`)
 * - 창고    (`/admin/warehouses`)
 * - 부서    (`/admin/departments`)
 * - 단톡방 매핑 (`/admin/chat-rooms`) — PR-D Phase B FE-D (MASTER/MANAGER, 본 entry 는 MASTER 만 가시)
 * - DC 설정 (`/sales/partner-dc-config`) — PR-D Phase B FE-C (MASTER 만 CSV 일괄 업로드)
 *
 * <h2>Slice 2 (PR #159) 마스터 메뉴 제거</h2>
 * 다음 4건은 일반 카테고리 메뉴 (설정/arologis/영업/메신저) 로 단독 이동되어 admin 사이드바에서 제거.
 * 라우트는 유지 (legacy 호환):
 * - 시트 동기화 (`/admin/sheet-sync`) → 설정
 * - 지역 분류 (`/admin/regions`) → arologis
 * - 발송금지 거래처 (`/admin/blocked-partners`) → 영업
 * - 알리고 주소록 (`/admin/aligo-address-book`) → 메신저
 *
 * memory feedback_uuid_no_user_visibility — admin 화면도 비즈니스 식별자만 노출.
 * memory feedback_role_naming_full — entry 라벨/가드 표기 풀네임 사용.
 */
import { NavLink, Outlet } from 'react-router-dom'
import { RoleGuard } from './RoleGuard'

const ADMIN_ROLES = ['MASTER'] as const

export function AdminLayout() {
  return (
    <RoleGuard allow={ADMIN_ROLES}>
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
            관리자 (MASTER 전용)
          </div>
          <AdminNav to="/admin/users" testId="admin-nav-users">
            사용자
          </AdminNav>
          <AdminNav to="/admin/roles" testId="admin-nav-roles">
            권한
          </AdminNav>
          <AdminNav to="/admin/partners" testId="admin-nav-partners">
            거래처
          </AdminNav>
          <AdminNav to="/admin/warehouses" testId="admin-nav-warehouses">
            창고
          </AdminNav>
          <AdminNav to="/admin/departments" testId="admin-nav-departments">
            부서
          </AdminNav>
          {/*
            [PR-D Phase B FE-D] 단톡방 매핑 — 라우트 자체는 MASTER/MANAGER 허용.
            AdminLayout 은 MASTER 전용이므로 본 entry 는 MASTER 시점만 노출되며,
            MANAGER 는 직접 URL (/admin/chat-rooms) 또는 AppLayout 좌측 메뉴로 접근.
          */}
          <AdminNav to="/admin/chat-rooms" testId="admin-nav-chat-rooms">
            단톡방 매핑
          </AdminNav>
          {/*
            [PR-D Phase B FE-C] 거래처 DC율 설정 — sales 라우트 그룹이지만 CSV 일괄 업로드는
            MASTER 전용 (BE @PreAuthorize). MASTER 진입 편의를 위해 admin 사이드바에도 노출
            (TM PR #115 권고 — DC AdminLayout entry 누락 fix).
          */}
          <AdminNav
            to="/sales/partner-dc-config"
            testId="admin-nav-dc-config"
          >
            DC 설정
          </AdminNav>
          {/*
            [Slice 2 단독 노출] GAS 이식 4건 — 시트 동기화 / 지역 분류 / 발송금지 거래처 / 알리고 주소록 —
            은 마스터 사이드바에서 제거되고 일반 카테고리 (설정/arologis/영업/메신저) 메뉴로만 노출됩니다.
            라우트 자체는 그대로 유지 (legacy 호환).
          */}
        </aside>
        <section className="admin-main">
          <Outlet />
        </section>
      </div>
    </RoleGuard>
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
