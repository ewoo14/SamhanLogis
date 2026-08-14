/**
 * 관리자 — 권한 관리 (`/admin/roles`).
 *
 * Phase 10 P0-5 슬라이스 4. BE `GET /admin/users/roles` 로 전체 ROLE 조회 + 각 ROLE 별
 * 사용자 count 표시 (q=role 호출로 total 수집).
 *
 * <h2>PR-H4c FE-C 보강 — 실시간 동기화</h2>
 * <ul>
 *   <li>30초 polling — UsersPage 의 권한 변경/사용자 활성/잠금 토글 결과를 자동 반영.</li>
 *   <li>user-service SSE (PR-H4b BE-D) broadcast endpoint 합류 시 SSE 직접 구독 가능.</li>
 * </ul>
 *
 * memory feedback_role_naming_full — ROLE 풀네임 + 한국어 라벨 동시 표시.
 *
 * data-testid:
 * - admin-roles-table
 * - admin-roles-row-{role}
 * - admin-roles-realtime-indicator
 */
import { useQueries, useQuery } from '@tanstack/react-query'
import {
  Badge,
  DataTable,
  type DataTableColumn,
} from '@samhan/design-system'
import {
  ADMIN_ROLE_LABEL,
  listAdminRoles,
  listAdminUsers,
  type AdminRole,
} from '../../api/adminApi'
import { usePageTitle } from '../../hooks/usePageTitle'

interface RoleRow {
  role: AdminRole
  label: string
  count: number | null
  loading: boolean
}

export function RolesPage() {
  usePageTitle('권한 관리')

  const rolesQuery = useQuery({
    queryKey: ['admin', 'roles'],
    queryFn: listAdminRoles,
  })

  const roles = Array.isArray(rolesQuery.data) ? rolesQuery.data : []

  const countQueries = useQueries({
    queries: roles.map((role) => ({
      queryKey: ['admin', 'role-count', role],
      queryFn: () => listAdminUsers({ role, page: 0, size: 1 }),
      enabled: !!role,
      // PR-H4c FE-C: 30초 polling — UsersPage 변경 자동 반영.
      refetchInterval: 30_000,
    })),
  })

  const rows: RoleRow[] = roles.map((role, idx) => {
    const q = countQueries[idx]
    return {
      role,
      label: ADMIN_ROLE_LABEL[role],
      count: q?.data ? q.data.total : null,
      loading: q?.isLoading ?? false,
    }
  })

  const columns: DataTableColumn<RoleRow>[] = [
    {
      key: 'role',
      header: '권한 코드',
      width: '160px',
      mobilePriority: 'primary',
      render: (r) => (
        <span data-testid={`admin-roles-row-${r.role}`}>
          <Badge variant="brand">{r.role}</Badge>
        </span>
      ),
    },
    {
      key: 'label',
      header: '한국어',
      width: '120px',
      mobilePriority: 'secondary',
      render: (r) => r.label,
    },
    {
      key: 'count',
      header: '사용자 수',
      width: '120px',
      align: 'right',
      mobilePriority: 'secondary',
      render: (r) => (r.loading ? '…' : (r.count ?? 0).toLocaleString()),
    },
    {
      key: 'description',
      header: '설명',
      mobilePriority: 'hidden',
      render: (r) => ROLE_DESCRIPTION[r.role],
    },
  ]

  return (
    <>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          marginBottom: 8,
        }}
      >
        <h3 style={{ margin: 0 }}>권한 관리</h3>
        <span
          data-testid="admin-roles-realtime-indicator"
          style={{ fontSize: 12, color: 'var(--color-neutral-500)' }}
        >
          실시간 자동 갱신 · 30초
        </span>
      </div>
      <p style={{ marginTop: 0, color: '#6B7280', fontSize: 13 }}>
        10-role ROLE 정책 — 풀네임 의무 (M/M/D 약어 금지). 권한 변경은 사용자
        관리 화면에서 수행합니다.
      </p>
      <div data-testid="admin-roles-table">
        <DataTable
          columns={columns}
          rows={rows}
          loading={rolesQuery.isLoading}
          rowKey={(r) => r.role}
          emptyMessage="ROLE 정의가 없습니다."
        />
      </div>
    </>
  )
}

const ROLE_DESCRIPTION: Record<AdminRole, string> = {
  MASTER: '최고 관리자 — admin 메뉴 + 전 권한',
  DEVELOPER: '개발자 — 마스터 데이터 변경 + 시스템 설정',
  MANAGER: '매니저 — 부서/거래처 운영 + 승인 권한',
  DISPATCH: '배차담당자 — 배차 메뉴 + arologis 운영 조회/발송',
  DRIVER: '기사 — 모바일/배차 수행 계정',
  STAFF: '사원 — 일반 직원 기본 계정',
  SALES: '영업원 — 견적/출고 전표 작성',
  ACCOUNTANT: '회계원 — 분개 작성/확정 + 세금계산서',
  WAREHOUSE: '창고원 — 입출고 + 재고 실사',
  INVENTORY: '재고원 — 재고 이동 + 실사 시작/완료',
}
