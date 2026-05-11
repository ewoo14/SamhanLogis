/**
 * 관리자 — 부서 관리 (`/admin/departments`).
 *
 * Phase 10 P0-5 슬라이스 4. BE `GET /users/departments` (read-only) backing.
 *
 * BE 가 현재 read-only 만 노출 — admin 화면은 트리/목록 표시 + 사용자 수 집계.
 * CRUD endpoint 추가 시 본 화면에 신규/수정/삭제 모달 확장 예정.
 *
 * UUID 비공개 — 화면에는 code / name / displayOrder + 사용자 수 (q=departmentId).
 *
 * <h2>PR-H4c FE-C 보강 — 실시간 동기화</h2>
 * <ul>
 *   <li>30초 polling — UsersPage 의 부서 변경/사용자 활성/잠금 토글 결과 자동 반영.</li>
 *   <li>부서 자체 변경은 read-only 단계라 audit overlay 미적용 (CRUD 합류 시 도입).</li>
 * </ul>
 *
 * data-testid:
 * - admin-departments-table
 * - admin-departments-row-{code}
 * - admin-departments-realtime-indicator
 */
import { useQueries, useQuery } from '@tanstack/react-query'
import {
  DataTable,
  type DataTableColumn,
} from '@samhan/design-system'
import {
  listAdminUsers,
  listDepartments,
  type Department,
} from '../../api/adminApi'
import { usePageTitle } from '../../hooks/usePageTitle'

interface DepartmentRow extends Department {
  userCount: number | null
  loading: boolean
}

export function DepartmentsPage() {
  usePageTitle('부서 관리')

  const departmentsQuery = useQuery({
    queryKey: ['admin', 'departments'],
    queryFn: listDepartments,
  })

  const departments = Array.isArray(departmentsQuery.data) ? departmentsQuery.data : []

  const countQueries = useQueries({
    queries: departments.map((d) => ({
      queryKey: ['admin', 'dept-count', d.id],
      queryFn: () => listAdminUsers({ departmentId: d.id, page: 0, size: 1 }),
      enabled: !!d.id,
      // PR-H4c FE-C: 30초 polling — UsersPage 변경 자동 반영.
      refetchInterval: 30_000,
    })),
  })

  const rows: DepartmentRow[] = departments.map((d, idx) => {
    const q = countQueries[idx]
    return {
      ...d,
      userCount: q?.data ? q.data.total : null,
      loading: q?.isLoading ?? false,
    }
  })

  const columns: DataTableColumn<DepartmentRow>[] = [
    {
      key: 'code',
      header: '코드',
      width: '140px',
      render: (d) => (
        <span data-testid={`admin-departments-row-${d.code}`}>{d.code}</span>
      ),
    },
    { key: 'name', header: '부서명' },
    {
      key: 'displayOrder',
      header: '표시 순서',
      width: '110px',
      align: 'right',
    },
    {
      key: 'userCount',
      header: '사용자 수',
      width: '120px',
      align: 'right',
      render: (d) => (d.loading ? '…' : (d.userCount ?? 0).toLocaleString()),
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
        <h3 style={{ margin: 0 }}>부서 관리</h3>
        <span
          data-testid="admin-departments-realtime-indicator"
          style={{ fontSize: 12, color: 'var(--color-neutral-500)' }}
        >
          실시간 자동 갱신 · 30초
        </span>
      </div>
      <p style={{ marginTop: 0, color: '#6B7280', fontSize: 13 }}>
        부서 마스터는 read-only. 신규 등록/수정/삭제는 user-service CRUD endpoint
        확장 후 본 화면에 모달 추가 예정.
      </p>
      <div data-testid="admin-departments-table">
        <DataTable
          columns={columns}
          rows={rows}
          loading={departmentsQuery.isLoading}
          rowKey={(d) => d.id}
          emptyMessage="등록된 부서가 없습니다."
        />
      </div>
    </>
  )
}
