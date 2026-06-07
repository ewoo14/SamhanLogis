/**
 * 관리자 — 사용자 관리 (`/admin/users`).
 *
 * Phase 10 P0-5 슬라이스 4 (BE PR-P0-5 신규 endpoint 보강).
 * BE endpoints:
 *   GET    /api/v1/admin/users?status&role&page&size
 *   POST   /api/v1/admin/users         → CreateUserModal
 *   PATCH  /api/v1/admin/users/{id}/role  → GroupAssignModal (C3b 전환)
 *   PATCH  /api/v1/admin/users/{id}      → EditUserModal
 *   POST   /api/v1/admin/users/{id}/disable → DisableButton (사유 5자 이상)
 *   POST   /api/v1/admin/users/{id}/unlock  → UnlockButton
 *   GET    /api/v1/admin/users/{id}/role-history → RoleHistoryModal
 *   GET    /api/v1/admin/users/roles
 *   GET    /auth/admin/permission-groups   → 빌트인 그룹 select 소스
 *   GET    /auth/admin/accounts/{id}/groups → 현재 배속 그룹 조회
 *   POST   /auth/admin/accounts/{id}/groups → 추가 그룹 배속
 *   DELETE /auth/admin/accounts/{id}/groups/{groupId} → 배속 해제
 *
 * C3b: RoleChangeModal(단일 role 드롭다운) → GroupAssignModal(권한그룹 배속) 전환.
 * - 기본 권한그룹(필수 1개): 빌트인 그룹 select → 그룹→role 역매핑 → updateAdminUserRole 호출.
 * - 추가 권한그룹(선택 N개): 비빌트인 커스텀 그룹 multi-assign.
 * - 그룹↔role 역매핑 상수: BUILTIN_GROUP_ROLE_MAP (FE 정의, BuiltinRoleGroupIds V43 UUID 기반).
 *
 * 표시 컬럼 (UUID 비공개): 로그인ID / 이름 / 부서 / 권한 (한국어 라벨) / 상태.
 *
 * PR-H4c FE-C 보강 — 30초 polling refetchInterval.
 *
 * PR #140 reviewer 결함 fix:
 * - raw hex fallback → design-system 토큰 (--surface-card / --line-default / --ink-primary)
 * - LOCKED Badge variant danger → warning
 * - DISABLED 상태 구분 (terminationDate 기반)
 * - CreateUserModal 임시 비밀번호 복사 버튼 + 보안 안내 박스 + data-testid
 * - GroupAssignModal 사유 5자 검증 + 저장 버튼 disabled 조건 (C3b)
 * - Role Badge 시각화 (5종 색상)
 * - data-testid: admin-user-create-button, admin-user-unlock-button-{loginId}, admin-user-temp-password-display
 *
 * data-testid:
 *   admin-users-table
 *   admin-user-create-button          (P-7 정정: admin-users-create-button → admin-user-create-button)
 *   admin-user-disable-button
 *   admin-user-unlock-button-{loginId} (P-7 정정: suffix 추가)
 *   admin-user-edit-button
 *   admin-user-role-change
 *   admin-user-role-history
 *   admin-user-search-input
 *   admin-user-role-filter
 *   admin-user-status-filter
 *   admin-user-dept-filter
 *   admin-user-create-modal
 *   admin-user-edit-modal
 *   admin-user-role-change-modal      (C3b: GroupAssignModal wrapper)
 *   admin-user-role-history-modal
 *   admin-user-disable-modal
 *   admin-user-temp-password-display  (D-4 신규)
 *
 * memory feedback_role_naming_full — role label 풀네임 (BE Role.displayName 사용).
 * memory feedback_uuid_no_user_visibility — loginId/fullName 만 노출, 그룹/계정 UUID 비공개.
 */
import { useMemo, useState, type FormEvent } from 'react'
import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import {
  Badge,
  Button,
  DataTable,
  FormField,
  Input,
  Modal,
  type DataTableColumn,
} from '@samhan/design-system'
import {
  ADMIN_ROLE_LABEL,
  createAdminUser,
  disableAdminUser,
  listAdminRoles,
  listAdminUsers,
  listDepartments,
  listRoleHistory,
  unlockAdminUser,
  updateAdminUser,
  updateAdminUserRole,
  type AdminRole,
  type AdminUser,
  type CreateAdminUserResponse,
  type RoleHistoryEntry,
} from '../../api/adminApi'
import {
  assignAccountGroup,
  fetchAccountGroups,
  fetchPermissionGroups,
  unassignAccountGroup,
  type AccountGroupSummary,
  type PermissionGroupSummary,
} from '../../api/permissionGroupsApi'
import { usePageTitle } from '../../hooks/usePageTitle'

// ---------------------------------------------------------------------------
// C3b: 빌트인 그룹↔role 역매핑 상수 (BuiltinRoleGroupIds V43 UUID 기반)
// UUID 체계: 00000000-0000-0000-0000-0000000001XX
// 사용자에게 UUID 미노출 — 그룹명/loginId 만 표시.
// ---------------------------------------------------------------------------

/** 빌트인 그룹 UUID → AdminRole 역매핑. FE 전용 상수, BE BuiltinRoleGroupIds V43 와 1:1. */
export const BUILTIN_GROUP_ROLE_MAP: Record<string, AdminRole> = {
  '00000000-0000-0000-0000-000000000100': 'MASTER',
  '00000000-0000-0000-0000-000000000101': 'MANAGER',
  '00000000-0000-0000-0000-000000000102': 'SALES',
  '00000000-0000-0000-0000-000000000103': 'WAREHOUSE',
  '00000000-0000-0000-0000-000000000104': 'ACCOUNTANT',
  '00000000-0000-0000-0000-000000000105': 'INVENTORY',
  '00000000-0000-0000-0000-000000000106': 'DISPATCH',
  // DRIVER(107) / STAFF(108) = 표시 전용 role — C3b 기본 그룹 변경 대상에서는 제외
  '00000000-0000-0000-0000-000000000109': 'DEVELOPER',
}

/** AdminRole → 빌트인 그룹 UUID 정매핑. */
export const ROLE_BUILTIN_GROUP_MAP: Record<string, string> = Object.fromEntries(
  Object.entries(BUILTIN_GROUP_ROLE_MAP).map(([gid, role]) => [role, gid]),
)

// ---------------------------------------------------------------------------
// 상태 판별 헬퍼
// ---------------------------------------------------------------------------

/**
 * terminationDate 기반 비활성 여부 판단.
 * DISABLED = terminationDate IS NOT NULL (adminDisable 호출 결과).
 * auth-service LOCKED 는 추후 연동 슬라이스에서 별도 필드로 구분.
 */
function isDisabled(user: AdminUser): boolean {
  return user.terminationDate !== null
}

// ---------------------------------------------------------------------------
// 공통 스타일 상수 — design-system 토큰만 사용 (raw hex fallback 0건)
// D-1 fix: var(--color-surface, #fff) → var(--surface-card)
//           var(--color-neutral-300, #D1D5DB) → var(--line-default)
//           var(--color-text-primary, #111827) → var(--ink-primary)
// ---------------------------------------------------------------------------

const selectStyle: React.CSSProperties = {
  height: 32,
  padding: '0 10px',
  border: '1px solid var(--line-default)',
  borderRadius: 6,
  fontSize: 13,
  fontFamily: 'inherit',
  background: 'var(--surface-card)',
  color: 'var(--ink-primary)',
}

const textareaStyle: React.CSSProperties = {
  padding: 8,
  border: '1px solid var(--line-default)',
  borderRadius: 6,
  fontSize: 13,
  fontFamily: 'inherit',
  resize: 'vertical',
  width: '100%',
  boxSizing: 'border-box',
  color: 'var(--ink-primary)',
  background: 'var(--surface-card)',
}

const formColStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
}

// ---------------------------------------------------------------------------
// Role Badge 시각화 (P-6)
// MASTER danger / DEVELOPER warning / MANAGER brand / 나머지 neutral
// ---------------------------------------------------------------------------

const ROLE_BADGE_VARIANT: Record<AdminRole, 'danger' | 'warning' | 'brand' | 'neutral'> = {
  MASTER: 'danger',
  DEVELOPER: 'warning',
  MANAGER: 'brand',
  DISPATCH: 'neutral',
  DRIVER: 'neutral',
  STAFF: 'neutral',
  SALES: 'neutral',
  ACCOUNTANT: 'neutral',
  WAREHOUSE: 'neutral',
  INVENTORY: 'neutral',
}

// ---------------------------------------------------------------------------
// UsersPage
// ---------------------------------------------------------------------------

export function UsersPage() {
  usePageTitle('사용자 관리')
  const queryClient = useQueryClient()

  // 필터 상태
  const [q, setQ] = useState('')
  const [role, setRole] = useState<AdminRole | ''>('')
  const [status, setStatus] = useState<'ACTIVE' | 'LOCKED' | ''>('')
  const [departmentId, setDepartmentId] = useState('')
  const [page, setPage] = useState(0)

  // Modal 상태
  const [createModal, setCreateModal] = useState(false)
  const [editModal, setEditModal] = useState<AdminUser | null>(null)
  const [roleModal, setRoleModal] = useState<AdminUser | null>(null)
  const [historyModal, setHistoryModal] = useState<AdminUser | null>(null)
  const [disableModal, setDisableModal] = useState<AdminUser | null>(null)

  // 쿼리
  const usersQuery = useQuery({
    queryKey: ['admin', 'users', q, role, status, departmentId, page],
    queryFn: () =>
      listAdminUsers({
        q: q || undefined,
        role: role || undefined,
        status: status || undefined,
        departmentId: departmentId || undefined,
        page,
        size: 20,
      }),
    refetchInterval: 30_000,
  })

  const rolesQuery = useQuery({
    queryKey: ['admin', 'roles'],
    queryFn: listAdminRoles,
  })

  const departmentsQuery = useQuery({
    queryKey: ['admin', 'departments'],
    queryFn: listDepartments,
  })

  const unlockMutation = useMutation({
    mutationFn: unlockAdminUser,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin', 'users'] })
    },
  })

  const columns: DataTableColumn<AdminUser>[] = useMemo(
    () => [
      { key: 'loginId', header: '로그인ID', width: '140px' },
      { key: 'fullName', header: '이름', width: '120px' },
      {
        key: 'departmentName',
        header: '부서',
        width: '140px',
        render: (u) => u.departmentName,
      },
      {
        key: 'role',
        header: '권한',
        width: '110px',
        // P-6: Role Badge 시각화
        render: (u) => (
          <Badge variant={ROLE_BADGE_VARIANT[u.role]}>
            {ADMIN_ROLE_LABEL[u.role]}
          </Badge>
        ),
      },
      {
        key: 'terminationDate',
        header: '상태',
        width: '90px',
        // D-2 fix: LOCKED variant 'danger' → 'warning'
        // D-3 fix: DISABLED 상태 구분 (terminationDate 기반)
        render: (u) =>
          isDisabled(u) ? (
            <Badge variant="warning">비활성</Badge>
          ) : (
            <Badge variant="success">활성</Badge>
          ),
      },
      {
        key: 'id',
        header: '관리',
        render: (u) => (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {/* 잠금 해제 버튼 — terminationDate 가 set 된 경우만 표시.
                P-7 fix: data-testid suffix loginId 추가 */}
            {isDisabled(u) ? (
              <Button
                variant="ghost"
                size="sm"
                data-testid={`admin-user-unlock-button-${u.loginId}`}
                onClick={(e) => {
                  e.stopPropagation()
                  if (window.confirm(`${u.fullName} 계정의 비활성을 해제합니다.`)) {
                    unlockMutation.mutate(u.id)
                  }
                }}
              >
                재활성화
              </Button>
            ) : null}
            {/* 정보 수정 */}
            <Button
              variant="ghost"
              size="sm"
              data-testid="admin-user-edit-button"
              onClick={(e) => {
                e.stopPropagation()
                setEditModal(u)
              }}
            >
              수정
            </Button>
            {/* 권한 변경 */}
            <Button
              variant="ghost"
              size="sm"
              data-testid="admin-user-role-change"
              onClick={(e) => {
                e.stopPropagation()
                setRoleModal(u)
              }}
            >
              권한 변경
            </Button>
            {/* 권한 이력 */}
            <Button
              variant="ghost"
              size="sm"
              data-testid="admin-user-role-history"
              onClick={(e) => {
                e.stopPropagation()
                setHistoryModal(u)
              }}
            >
              이력
            </Button>
            {/*
             * 탈퇴 처리 (영구 Soft Delete) — 활성 사용자에만 표시.
             * 비활성 사용자 재활성화는 위 재활성화 버튼 사용.
             */}
            {!isDisabled(u) ? (
              <Button
                variant="ghost"
                size="sm"
                data-testid="admin-user-disable-button"
                onClick={(e) => {
                  e.stopPropagation()
                  setDisableModal(u)
                }}
              >
                탈퇴
              </Button>
            ) : null}
          </div>
        ),
      },
    ],
    [unlockMutation],
  )

  const totalPages = usersQuery.data
    ? Math.max(1, Math.ceil(usersQuery.data.total / usersQuery.data.size))
    : 1

  function invalidateUsers() {
    void queryClient.invalidateQueries({ queryKey: ['admin', 'users'] })
  }

  return (
    <>
      {/* 헤더 */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 16,
        }}
      >
        <h3 style={{ margin: 0 }}>사용자 관리</h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <span
            data-testid="admin-users-realtime-indicator"
            style={{ fontSize: 12, color: 'var(--ink-tertiary)' }}
          >
            실시간 자동 갱신 · 30초
          </span>
          {/* P-7 fix: admin-users-create-button → admin-user-create-button */}
          <Button
            variant="primary"
            size="sm"
            data-testid="admin-user-create-button"
            onClick={() => setCreateModal(true)}
          >
            신규 사용자 등록
          </Button>
        </div>
      </div>

      {/* 필터 바 */}
      <div
        style={{
          display: 'flex',
          gap: 12,
          marginBottom: 16,
          flexWrap: 'wrap',
        }}
      >
        <Input
          type="search"
          placeholder="로그인ID / 이름 / 이메일 검색"
          value={q}
          onChange={(e) => {
            setQ(e.target.value)
            setPage(0)
          }}
          data-testid="admin-user-search-input"
          inputSize="sm"
          fullWidth={false}
          style={{ flex: '1 1 240px', minWidth: 200 }}
        />
        <select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value as 'ACTIVE' | 'LOCKED' | '')
            setPage(0)
          }}
          data-testid="admin-user-status-filter"
          style={selectStyle}
        >
          <option value="">상태 전체</option>
          <option value="ACTIVE">활성</option>
          <option value="LOCKED">비활성</option>
        </select>
        <select
          value={role}
          onChange={(e) => {
            setRole(e.target.value as AdminRole | '')
            setPage(0)
          }}
          data-testid="admin-user-role-filter"
          style={selectStyle}
        >
          <option value="">권한 전체</option>
          {(Array.isArray(rolesQuery.data) ? rolesQuery.data : []).map((r) => (
            <option key={r} value={r}>
              {ADMIN_ROLE_LABEL[r]}
            </option>
          ))}
        </select>
        <select
          value={departmentId}
          onChange={(e) => {
            setDepartmentId(e.target.value)
            setPage(0)
          }}
          data-testid="admin-user-dept-filter"
          style={selectStyle}
        >
          <option value="">부서 전체</option>
          {(Array.isArray(departmentsQuery.data) ? departmentsQuery.data : []).map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
      </div>

      {/* 테이블 */}
      <div data-testid="admin-users-table">
        <DataTable
          columns={columns}
          rows={usersQuery.data?.items ?? []}
          loading={usersQuery.isLoading}
          rowKey={(u) => u.id}
          emptyMessage="조건에 맞는 사용자가 없습니다."
        />
      </div>

      {/* 페이지네이션 */}
      {usersQuery.data && totalPages > 1 ? (
        <Pagination page={page} totalPages={totalPages} onChange={setPage} />
      ) : null}

      {/* 신규 사용자 등록 Modal */}
      {createModal ? (
        <div data-testid="admin-user-create-modal">
          <CreateUserModal
            roles={Array.isArray(rolesQuery.data) ? rolesQuery.data : []}
            departments={Array.isArray(departmentsQuery.data) ? departmentsQuery.data : []}
            onClose={() => setCreateModal(false)}
            onCommitted={() => {
              setCreateModal(false)
              invalidateUsers()
            }}
          />
        </div>
      ) : null}

      {/* 정보 수정 Modal */}
      {editModal ? (
        <div data-testid="admin-user-edit-modal">
          <EditUserModal
            user={editModal}
            departments={Array.isArray(departmentsQuery.data) ? departmentsQuery.data : []}
            onClose={() => setEditModal(null)}
            onCommitted={() => {
              setEditModal(null)
              invalidateUsers()
            }}
          />
        </div>
      ) : null}

      {/* 권한그룹 배속 Modal (C3b) */}
      {roleModal ? (
        <div data-testid="admin-user-role-change-modal">
          <GroupAssignModal
            user={roleModal}
            onClose={() => setRoleModal(null)}
            onCommitted={() => {
              setRoleModal(null)
              invalidateUsers()
            }}
          />
        </div>
      ) : null}

      {/* 권한 이력 Modal */}
      {historyModal ? (
        <div data-testid="admin-user-role-history-modal">
          <RoleHistoryModal
            user={historyModal}
            onClose={() => setHistoryModal(null)}
          />
        </div>
      ) : null}

      {/* 탈퇴 처리 Modal */}
      {disableModal ? (
        <div data-testid="admin-user-disable-modal">
          <DisableUserModal
            user={disableModal}
            onClose={() => setDisableModal(null)}
            onCommitted={() => {
              setDisableModal(null)
              invalidateUsers()
            }}
          />
        </div>
      ) : null}
    </>
  )
}

// ---------------------------------------------------------------------------
// Pagination
// ---------------------------------------------------------------------------

interface PaginationProps {
  page: number
  totalPages: number
  onChange: (page: number) => void
}

function Pagination({ page, totalPages, onChange }: PaginationProps) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 12,
        marginTop: 16,
      }}
    >
      <Button
        variant="ghost"
        size="sm"
        disabled={page <= 0}
        onClick={() => onChange(page - 1)}
      >
        이전
      </Button>
      <span style={{ fontSize: 13 }}>
        {page + 1} / {totalPages}
      </span>
      <Button
        variant="ghost"
        size="sm"
        disabled={page + 1 >= totalPages}
        onClick={() => onChange(page + 1)}
      >
        다음
      </Button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// CreateUserModal — 신규 사용자 등록
// D-4 fix: 임시 비밀번호 복사 버튼 + 보안 안내 박스 + data-testid
// ---------------------------------------------------------------------------

interface Department {
  id: string
  name: string
}

interface CreateUserModalProps {
  roles: AdminRole[]
  departments: Department[]
  onClose: () => void
  onCommitted: () => void
}

function CreateUserModal({
  roles,
  departments,
  onClose,
  onCommitted,
}: CreateUserModalProps) {
  const [loginId, setLoginId] = useState('')
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [selectedRole, setSelectedRole] = useState<AdminRole>(
    roles[0] ?? 'SALES',
  )
  const [selectedDeptId, setSelectedDeptId] = useState('')
  const [phoneNumber, setPhoneNumber] = useState('')
  const [result, setResult] = useState<CreateAdminUserResponse | null>(null)
  const [copied, setCopied] = useState(false)

  const mutation = useMutation({
    mutationFn: () =>
      createAdminUser({
        loginId: loginId.trim(),
        fullName: fullName.trim(),
        email: email.trim(),
        role: selectedRole,
        departmentId: selectedDeptId || undefined,
        phoneNumber: phoneNumber.trim() || undefined,
      }),
    onSuccess: (data) => {
      setResult(data)
    },
  })

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (mutation.isPending) return
    mutation.mutate()
  }

  /** D-4 — 임시 비밀번호 클립보드 복사 */
  const handleCopy = () => {
    if (!result) return
    navigator.clipboard.writeText(result.temporaryPassword).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }).catch(() => {
      // clipboard API 미지원 환경 — silent fail
    })
  }

  // 임시 비밀번호 표시 단계 (D-4 보안 안내 박스 + 복사 버튼 + data-testid)
  if (result) {
    return (
      <Modal
        open
        onClose={onCommitted}
        title="사용자 등록 완료"
        footer={
          <Button variant="primary" onClick={onCommitted}>
            확인
          </Button>
        }
      >
        <div style={formColStyle}>
          <p style={{ margin: 0, fontSize: 14 }}>
            <strong>{result.fullName}</strong> ({result.loginId}) 계정이
            생성되었습니다.
          </p>
          {/* D-4: 임시 비밀번호 표시 영역 + data-testid */}
          <div
            data-testid="admin-user-temp-password-display"
            style={{
              background: 'var(--surface-subtle)',
              borderRadius: 6,
              padding: '12px 16px',
              fontSize: 14,
            }}
          >
            <div style={{ marginBottom: 4, fontWeight: 600, color: 'var(--ink-primary)' }}>
              초기 비밀번호
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <code
                style={{
                  fontSize: 16,
                  letterSpacing: 2,
                  color: 'var(--action-brand)',
                  flex: 1,
                }}
              >
                {result.temporaryPassword}
              </code>
              {/* D-4: 복사 버튼 (navigator.clipboard) */}
              <Button
                variant="ghost"
                size="sm"
                onClick={handleCopy}
              >
                {copied ? '복사됨' : '복사'}
              </Button>
            </div>
          </div>
          {/* D-4: 보안 안내 박스 (--state-warning-bg) */}
          <div
            style={{
              padding: '10px 14px',
              borderRadius: 6,
              background: 'var(--state-warning-bg)',
              borderLeft: '3px solid var(--state-warning)',
              fontSize: 13,
              color: 'var(--ink-secondary)',
            }}
          >
            <strong style={{ color: 'var(--ink-primary)' }}>보안 안내</strong>
            <ul style={{ margin: '4px 0 0 16px', padding: 0, lineHeight: 1.7 }}>
              <li>이 비밀번호는 지금만 확인할 수 있습니다.</li>
              <li>사용자에게 안전한 경로로 직접 전달하세요.</li>
              <li>첫 로그인 후 비밀번호 변경이 강제됩니다.</li>
            </ul>
          </div>
        </div>
      </Modal>
    )
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="신규 사용자 등록"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={mutation.isPending}>
            취소
          </Button>
          <Button
            variant="primary"
            onClick={() => mutation.mutate()}
            loading={mutation.isPending}
            disabled={
              !loginId.trim() || !fullName.trim() || !email.trim()
            }
          >
            등록
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} style={formColStyle}>
        <FormField
          label="로그인 ID"
          required
          render={({ id }) => (
            <Input
              id={id}
              value={loginId}
              onChange={(e) => setLoginId(e.target.value)}
              placeholder="예: kimmiseon"
              autoComplete="off"
            />
          )}
        />
        <FormField
          label="이름"
          required
          render={({ id }) => (
            <Input
              id={id}
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="예: 김미선"
            />
          )}
        />
        <FormField
          label="이메일"
          required
          render={({ id }) => (
            <Input
              id={id}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="예: kimmiseon@samhan-air.com"
            />
          )}
        />
        <FormField
          label="권한"
          required
          render={({ id }) => (
            <select
              id={id}
              value={selectedRole}
              onChange={(e) => setSelectedRole(e.target.value as AdminRole)}
              style={selectStyle}
            >
              {roles.map((r) => (
                <option key={r} value={r}>
                  {ADMIN_ROLE_LABEL[r]}
                </option>
              ))}
            </select>
          )}
        />
        <FormField
          label="부서 (선택)"
          render={({ id }) => (
            <select
              id={id}
              value={selectedDeptId}
              onChange={(e) => setSelectedDeptId(e.target.value)}
              style={selectStyle}
            >
              <option value="">부서 없음</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          )}
        />
        <FormField
          label="전화번호 (선택)"
          render={({ id }) => (
            <Input
              id={id}
              type="tel"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              placeholder="예: 010-1234-5678"
            />
          )}
        />
        {mutation.isError ? (
          <div
            role="alert"
            style={{
              padding: '8px 12px',
              borderRadius: 6,
              background: 'var(--state-danger-bg)',
              color: 'var(--state-danger)',
              fontSize: 13,
            }}
          >
            사용자 등록에 실패했습니다. 입력 값을 확인하세요.
          </div>
        ) : null}
      </form>
    </Modal>
  )
}

// ---------------------------------------------------------------------------
// EditUserModal — 정보 수정
// ---------------------------------------------------------------------------

interface EditUserModalProps {
  user: AdminUser
  departments: Department[]
  onClose: () => void
  onCommitted: () => void
}

function EditUserModal({
  user,
  departments,
  onClose,
  onCommitted,
}: EditUserModalProps) {
  const [fullName, setFullName] = useState(user.fullName)
  const [email, setEmail] = useState(user.email ?? '')
  const [phoneNumber, setPhoneNumber] = useState(user.phone ?? '')
  const [selectedDeptId, setSelectedDeptId] = useState(user.departmentId ?? '')

  const mutation = useMutation({
    mutationFn: () =>
      updateAdminUser(user.id, {
        fullName: fullName.trim(),
        email: email.trim() || undefined,
        phoneNumber: phoneNumber.trim() || undefined,
        departmentId: selectedDeptId || undefined,
      }),
    onSuccess: () => onCommitted(),
  })

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (mutation.isPending) return
    mutation.mutate()
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`정보 수정 — ${user.fullName} (${user.loginId})`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={mutation.isPending}>
            취소
          </Button>
          <Button
            variant="primary"
            onClick={() => mutation.mutate()}
            loading={mutation.isPending}
            disabled={!fullName.trim()}
          >
            저장
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} style={formColStyle}>
        <FormField
          label="이름"
          required
          render={({ id }) => (
            <Input
              id={id}
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
            />
          )}
        />
        <FormField
          label="이메일"
          render={({ id }) => (
            <Input
              id={id}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="이메일 주소"
            />
          )}
        />
        <FormField
          label="전화번호"
          render={({ id }) => (
            <Input
              id={id}
              type="tel"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              placeholder="010-0000-0000"
            />
          )}
        />
        <FormField
          label="부서"
          render={({ id }) => (
            <select
              id={id}
              value={selectedDeptId}
              onChange={(e) => setSelectedDeptId(e.target.value)}
              style={selectStyle}
            >
              <option value="">부서 없음</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          )}
        />
        {mutation.isError ? (
          <div
            role="alert"
            style={{
              padding: '8px 12px',
              borderRadius: 6,
              background: 'var(--state-danger-bg)',
              color: 'var(--state-danger)',
              fontSize: 13,
            }}
          >
            정보 수정에 실패했습니다.
          </div>
        ) : null}
      </form>
    </Modal>
  )
}

// ---------------------------------------------------------------------------
// GroupAssignModal — 권한그룹 배속 (C3b 전환, RoleChangeModal 대체)
//
// 기본 권한그룹 (필수 1개):
//   빌트인 role-group select → 그룹명 표시 (UUID 비공개) →
//   저장 시 BUILTIN_GROUP_ROLE_MAP 역매핑 → updateAdminUserRole(derivedRole) 호출.
//
// 추가 권한그룹 (선택 N개):
//   비빌트인(isBuiltin=false && isSystemMaster=false) 커스텀 그룹 배속/해제.
//   fetchAccountGroups / assignAccountGroup / unassignAccountGroup 재사용.
//
// UUID 비공개: 그룹 UUID 는 API 경로 key 전용 — 모달 내 텍스트는 그룹명/loginId 만 표시.
// ---------------------------------------------------------------------------

interface GroupAssignModalProps {
  user: AdminUser
  onClose: () => void
  onCommitted: () => void
}

function GroupAssignModal({ user, onClose, onCommitted }: GroupAssignModalProps) {
  const queryClient = useQueryClient()

  // 전체 권한그룹 목록 (빌트인 + 커스텀)
  const groupsQuery = useQuery({
    queryKey: ['admin', 'permission-groups'],
    queryFn: fetchPermissionGroups,
  })

  // 현재 사용자 배속 그룹 목록
  const accountGroupsQuery = useQuery({
    queryKey: ['admin', 'permission-account-groups', user.id],
    queryFn: () => fetchAccountGroups(user.id),
  })

  const allGroups: PermissionGroupSummary[] = groupsQuery.data ?? []
  const assignedGroups: AccountGroupSummary[] = accountGroupsQuery.data ?? []
  const assignedGroupIds = useMemo(
    () => new Set(assignedGroups.map((g) => g.groupId)),
    [assignedGroups],
  )

  // 빌트인 그룹 목록 (기본 권한그룹 select 소스)
  // isSystemMaster 그룹(MASTER)은 목록 포함 — MASTER 도 기본 그룹으로 변경 가능.
  // DRIVER(107) / STAFF(108) = 표시 전용 role → BUILTIN_GROUP_ROLE_MAP 에 역매핑 없음 → 선택해도 저장 불가
  // → select 옵션에서 명시적으로 제외 (사용자 혼란 방지).
  const builtinGroups = allGroups.filter(
    (g) => g.isBuiltin && g.id in BUILTIN_GROUP_ROLE_MAP,
  )

  // 커스텀 그룹 목록 (추가 배속 소스 — 미배속 것만)
  const customGroups = allGroups.filter((g) => !g.isBuiltin && !g.isSystemMaster)
  const assignableCustomGroups = customGroups.filter((g) => !assignedGroupIds.has(g.id))
  // 현재 배속된 커스텀 그룹만 (빌트인 제외)
  const assignedCustomGroups = assignedGroups.filter((g) => !g.groupBuiltin && !g.groupSystemMaster)

  // 현재 사용자 role 에 대응하는 빌트인 그룹 UUID (기본 선택값 결정)
  const currentBuiltinGroupId = ROLE_BUILTIN_GROUP_MAP[user.role] ?? ''

  // 선택된 기본 권한그룹 UUID (변경 전까지 현재 role 의 빌트인 그룹)
  const [selectedBuiltinId, setSelectedBuiltinId] = useState(currentBuiltinGroupId)

  // 변경 사유 (5자 이상 검증)
  const [reason, setReason] = useState('')
  // P2-4: 추가 그룹 배속/해제 에러 메시지
  const [assignError, setAssignError] = useState<string | null>(null)
  const reasonTrimmed = reason.trim()
  const reasonValid = reasonTrimmed.length === 0 || reasonTrimmed.length >= 5

  const isBuiltinChanged = selectedBuiltinId !== currentBuiltinGroupId

  // 기본 권한그룹 변경 → updateAdminUserRole(derivedRole) 호출
  const roleMutation = useMutation({
    mutationFn: () => {
      const derivedRole = BUILTIN_GROUP_ROLE_MAP[selectedBuiltinId]
      if (!derivedRole) throw new Error('선택된 그룹에 대응하는 역할이 없습니다.')
      return updateAdminUserRole(user.id, {
        newRole: derivedRole,
        reason: reasonTrimmed || undefined,
      })
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin', 'permission-account-groups', user.id] })
      onCommitted()
    },
  })

  // 추가 그룹 배속
  const assignMutation = useMutation({
    mutationFn: (groupId: string) => assignAccountGroup(user.id, groupId),
    onSuccess: () => {
      setAssignError(null)
      void queryClient.invalidateQueries({ queryKey: ['admin', 'permission-account-groups', user.id] })
    },
    onError: () => {
      setAssignError('추가 그룹 배속에 실패했습니다.')
    },
  })

  // 추가 그룹 해제 (빌트인 그룹 해제 불가)
  const unassignMutation = useMutation({
    mutationFn: (groupId: string) => unassignAccountGroup(user.id, groupId),
    onSuccess: () => {
      setAssignError(null)
      void queryClient.invalidateQueries({ queryKey: ['admin', 'permission-account-groups', user.id] })
    },
    onError: () => {
      setAssignError('그룹 배속 해제에 실패했습니다.')
    },
  })

  const isLoading = groupsQuery.isLoading || accountGroupsQuery.isLoading

  const handleSave = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (roleMutation.isPending) return
    if (isBuiltinChanged) {
      roleMutation.mutate()
    } else {
      // P2-5: 기본 그룹 변경 없을 때는 추가 refetch 없이 onClose() — 추가 그룹은 이미 invalidate 됨
      onClose()
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`권한그룹 배속 — ${user.fullName} (${user.loginId})`}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={roleMutation.isPending}>
            닫기
          </Button>
          <Button
            type="button"
            variant="primary"
            onClick={() => {
              // P1-2: 이중 발행 방지
              if (roleMutation.isPending) return
              if (isBuiltinChanged) roleMutation.mutate()
              // P2-5: 기본 그룹 변경 없을 때는 목록 refetch 없이 닫기 (추가 그룹은 이미 invalidate)
              else onClose()
            }}
            loading={roleMutation.isPending}
            disabled={
              isLoading ||
              (isBuiltinChanged && !reasonValid) ||
              (isBuiltinChanged && !BUILTIN_GROUP_ROLE_MAP[selectedBuiltinId])
            }
          >
            저장
          </Button>
        </>
      }
    >
      <form onSubmit={handleSave} style={formColStyle}>
        {/* ─ 섹션 1: 기본 권한그룹 ─ */}
        <div
          style={{
            padding: '12px 14px',
            borderRadius: 6,
            background: 'var(--surface-subtle)',
            border: '1px solid var(--line-default)',
          }}
        >
          <div
            style={{
              fontWeight: 700,
              fontSize: 13,
              marginBottom: 8,
              color: 'var(--ink-primary)',
            }}
          >
            기본 권한그룹
            <span
              style={{
                marginLeft: 6,
                fontSize: 11,
                fontWeight: 400,
                color: 'var(--ink-tertiary)',
              }}
            >
              필수 1개 — 역할(Role)의 파생 근거
            </span>
          </div>
          <FormField
            label="현재 역할"
            render={() => (
              <div style={{ fontSize: 13, padding: '4px 0' }}>
                <Badge variant={ROLE_BADGE_VARIANT[user.role]}>
                  {ADMIN_ROLE_LABEL[user.role]}
                </Badge>
              </div>
            )}
          />
          <FormField
            label="기본 그룹 선택"
            required
            render={({ id }) => (
              <select
                id={id}
                value={selectedBuiltinId}
                onChange={(e) => setSelectedBuiltinId(e.target.value)}
                style={selectStyle}
                data-testid="group-assign-builtin-select"
                disabled={isLoading}
              >
                {/* DRIVER/STAFF 등 기본 그룹 변경 미지원 role 계정 진입 시 placeholder */}
                {!selectedBuiltinId ? (
                  <option value="">그룹을 선택하세요</option>
                ) : null}
                {builtinGroups.length === 0 ? (
                  <option value="" disabled>그룹 로딩 중…</option>
                ) : (
                  builtinGroups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                      {g.isSystemMaster ? ' (마스터)' : ''}
                    </option>
                  ))
                )}
              </select>
            )}
          />
          {/* DRIVER/STAFF 등 기본 그룹 변경 미지원 role 안내 */}
          {!currentBuiltinGroupId ? (
            <div
              style={{
                marginTop: 4,
                padding: '6px 10px',
                borderRadius: 4,
                background: 'var(--state-warning-bg)',
                borderLeft: '3px solid var(--state-warning)',
                fontSize: 12,
                color: 'var(--ink-secondary)',
              }}
            >
              이 계정의 현재 역할(DRIVER/STAFF)은 관리자 화면에서 직접 지정하는 빌트인 그룹이
              없습니다. 위 목록에서 새 기본 그룹을 선택해 변경할 수 있습니다.
            </div>
          ) : null}
          {isBuiltinChanged ? (
            <FormField
              label="변경 사유 (입력 시 5자 이상)"
              error={
                reason.length > 0 && reasonTrimmed.length < 5
                  ? '사유는 5자 이상 입력해야 합니다.'
                  : undefined
              }
              render={({ id }) => (
                <textarea
                  id={id}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  maxLength={500}
                  rows={2}
                  placeholder="기본 권한그룹 변경 사유 (선택)"
                  style={textareaStyle}
                  data-testid="group-assign-reason"
                />
              )}
            />
          ) : null}
        </div>

        {/* ─ 섹션 2: 추가 권한그룹 ─ */}
        <div
          style={{
            padding: '12px 14px',
            borderRadius: 6,
            border: '1px solid var(--line-default)',
          }}
        >
          <div
            style={{
              fontWeight: 700,
              fontSize: 13,
              marginBottom: 10,
              color: 'var(--ink-primary)',
            }}
          >
            추가 권한그룹
            <span
              style={{
                marginLeft: 6,
                fontSize: 11,
                fontWeight: 400,
                color: 'var(--ink-tertiary)',
              }}
            >
              선택 N개 — 커스텀 그룹 가산 배속
            </span>
          </div>

          {/* 현재 배속된 커스텀 그룹 */}
          <div style={{ marginBottom: 8 }}>
            <div
              style={{
                fontSize: 12,
                color: 'var(--ink-tertiary)',
                marginBottom: 6,
              }}
            >
              현재 배속
            </div>
            {isLoading ? (
              <span style={{ fontSize: 13, color: 'var(--ink-tertiary)' }}>
                로딩 중…
              </span>
            ) : assignedCustomGroups.length === 0 ? (
              <span
                style={{ fontSize: 13, color: 'var(--ink-tertiary)' }}
                data-testid="group-assign-custom-empty"
              >
                추가 그룹 없음
              </span>
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {assignedCustomGroups.map((ag) => (
                  <span
                    key={ag.groupId}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                      padding: '3px 8px',
                      borderRadius: 14,
                      background: 'var(--surface-subtle)',
                      border: '1px solid var(--line-default)',
                      fontSize: 12,
                    }}
                  >
                    {ag.groupName}
                    <button
                      type="button"
                      aria-label={`${ag.groupName} 배속 해제`}
                      data-testid={`group-assign-remove-${ag.groupName}`}
                      disabled={unassignMutation.isPending}
                      onClick={() => unassignMutation.mutate(ag.groupId)}
                      style={{
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        color: 'var(--ink-tertiary)',
                        padding: 0,
                        fontSize: 14,
                        lineHeight: 1,
                      }}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* 추가 가능한 커스텀 그룹 */}
          <div>
            <div
              style={{
                fontSize: 12,
                color: 'var(--ink-tertiary)',
                marginBottom: 6,
              }}
            >
              추가 배속
            </div>
            {customGroups.length === 0 ? (
              <span
                style={{ fontSize: 13, color: 'var(--ink-tertiary)' }}
                data-testid="group-assign-no-custom"
              >
                커스텀 권한그룹이 없습니다.
              </span>
            ) : assignableCustomGroups.length === 0 ? (
              <span style={{ fontSize: 13, color: 'var(--ink-tertiary)' }}>
                모든 커스텀 그룹에 이미 배속되어 있습니다.
              </span>
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {assignableCustomGroups.map((g) => (
                  <Button
                    key={g.id}
                    variant="secondary"
                    size="sm"
                    data-testid={`group-assign-add-${g.name}`}
                    disabled={assignMutation.isPending}
                    onClick={() => assignMutation.mutate(g.id)}
                  >
                    + {g.name}
                  </Button>
                ))}
              </div>
            )}
          </div>
        </div>

        {roleMutation.isError ? (
          <div
            role="alert"
            style={{
              padding: '8px 12px',
              borderRadius: 6,
              background: 'var(--state-danger-bg)',
              color: 'var(--state-danger)',
              fontSize: 13,
            }}
          >
            기본 권한그룹 변경에 실패했습니다.
          </div>
        ) : null}
        {/* P2-4: 추가 그룹 배속/해제 에러 피드백 */}
        {assignError !== null ? (
          <div
            role="alert"
            style={{
              padding: '8px 12px',
              borderRadius: 6,
              background: 'var(--state-danger-bg)',
              color: 'var(--state-danger)',
              fontSize: 13,
            }}
          >
            {assignError}
          </div>
        ) : null}
      </form>
    </Modal>
  )
}

// ---------------------------------------------------------------------------
// RoleHistoryModal — 권한 변경 이력
// ---------------------------------------------------------------------------

interface RoleHistoryModalProps {
  user: AdminUser
  onClose: () => void
}

function RoleHistoryModal({ user, onClose }: RoleHistoryModalProps) {
  const query = useQuery({
    queryKey: ['admin', 'role-history', user.id],
    queryFn: () => listRoleHistory(user.id),
  })

  const columns: DataTableColumn<RoleHistoryEntry>[] = [
    {
      key: 'changedAt',
      header: '변경 시각',
      width: '180px',
      render: (h) => h.changedAt.replace('T', ' ').slice(0, 19),
    },
    {
      key: 'previousRole',
      header: '이전 권한',
      width: '110px',
      render: (h) =>
        h.previousRole ? (
          <Badge variant={ROLE_BADGE_VARIANT[h.previousRole]}>
            {ADMIN_ROLE_LABEL[h.previousRole]}
          </Badge>
        ) : (
          '(신규)'
        ),
    },
    {
      key: 'newRole',
      header: '변경 후',
      width: '110px',
      render: (h) => (
        <Badge variant={ROLE_BADGE_VARIANT[h.newRole]}>
          {ADMIN_ROLE_LABEL[h.newRole]}
        </Badge>
      ),
    },
    {
      key: 'reason',
      header: '사유',
      render: (h) => h.reason ?? '—',
    },
    {
      key: 'changedBy',
      header: '변경자',
      width: '120px',
      render: (h) => h.changedBy ?? '—',
    },
  ]

  return (
    <Modal
      open
      onClose={onClose}
      title={`권한 변경 이력 — ${user.fullName} (${user.loginId})`}
      size="lg"
      footer={
        <Button variant="primary" onClick={onClose}>
          닫기
        </Button>
      }
    >
      <DataTable
        columns={columns}
        rows={Array.isArray(query.data) ? query.data : []}
        loading={query.isLoading}
        rowKey={(h) => h.id}
        emptyMessage="권한 변경 이력이 없습니다."
      />
    </Modal>
  )
}

// ---------------------------------------------------------------------------
// DisableUserModal — 탈퇴 처리 (사유 5자 이상)
// ---------------------------------------------------------------------------

interface DisableUserModalProps {
  user: AdminUser
  onClose: () => void
  onCommitted: () => void
}

function DisableUserModal({ user, onClose, onCommitted }: DisableUserModalProps) {
  const [reason, setReason] = useState('')

  const reasonTrimmed = reason.trim()
  // 사유 5자 이상 입력 UX 강제 — BE 가 사유를 적재하지는 않으나 (audit 슬라이스 backlog),
  // 관리자가 신중히 입력하도록 클라이언트 측에서 가드.
  const reasonValid = reasonTrimmed.length >= 5

  const mutation = useMutation({
    mutationFn: () => disableAdminUser(user.id),
    onSuccess: () => onCommitted(),
  })

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (mutation.isPending || !reasonValid) return
    mutation.mutate()
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`탈퇴 처리 — ${user.fullName} (${user.loginId})`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={mutation.isPending}>
            취소
          </Button>
          <Button
            variant="danger"
            onClick={() => mutation.mutate()}
            loading={mutation.isPending}
            disabled={!reasonValid}
          >
            탈퇴 처리
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} style={formColStyle}>
        <p
          style={{
            margin: 0,
            fontSize: 14,
            color: 'var(--state-danger)',
          }}
        >
          이 작업은 되돌리기 어렵습니다. 사유를 입력한 후 탈퇴 처리하세요.
        </p>
        <FormField
          label="탈퇴 사유"
          required
          error={reason.length > 0 && !reasonValid ? '사유는 5자 이상 입력해야 합니다.' : undefined}
          render={({ id }) => (
            <textarea
              id={id}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={500}
              rows={4}
              placeholder="탈퇴 사유를 5자 이상 입력하세요."
              style={textareaStyle}
            />
          )}
        />
        {mutation.isError ? (
          <div
            role="alert"
            style={{
              padding: '8px 12px',
              borderRadius: 6,
              background: 'var(--state-danger-bg)',
              color: 'var(--state-danger)',
              fontSize: 13,
            }}
          >
            탈퇴 처리에 실패했습니다.
          </div>
        ) : null}
      </form>
    </Modal>
  )
}
