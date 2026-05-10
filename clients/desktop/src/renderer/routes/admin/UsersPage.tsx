/**
 * 관리자 — 사용자 관리 (`/admin/users`).
 *
 * Phase 10 P0-5 슬라이스 4 (BE PR-P0-5 신규 endpoint 보강).
 * BE endpoints:
 *   GET    /api/v1/admin/users?status&role&page&size
 *   POST   /api/v1/admin/users         → CreateUserModal
 *   PATCH  /api/v1/admin/users/{id}/role  → RoleChangeModal
 *   PATCH  /api/v1/admin/users/{id}      → EditUserModal
 *   POST   /api/v1/admin/users/{id}/disable → DisableButton (사유 5자 이상)
 *   POST   /api/v1/admin/users/{id}/unlock  → UnlockButton
 *   GET    /api/v1/admin/users/{id}/role-history → RoleHistoryModal
 *   GET    /api/v1/admin/users/roles
 *
 * 표시 컬럼 (UUID 비공개): 로그인ID / 이름 / 부서 / 권한 (한국어 라벨) / 상태.
 *
 * PR-H4c FE-C 보강 — 30초 polling refetchInterval.
 *
 * data-testid:
 *   admin-users-table
 *   admin-users-create-button
 *   admin-user-disable-button
 *   admin-user-unlock-button
 *   admin-user-edit-button
 *   admin-user-role-change
 *   admin-user-role-history
 *   admin-user-search-input
 *   admin-user-role-filter
 *   admin-user-status-filter
 *   admin-user-dept-filter
 *   admin-user-create-modal
 *   admin-user-edit-modal
 *   admin-user-role-change-modal
 *   admin-user-role-history-modal
 *   admin-user-disable-modal
 *
 * memory feedback_role_naming_full — role label 풀네임 (BE Role.displayName 사용).
 * memory feedback_uuid_no_user_visibility — loginId/fullName 만 노출.
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
  enableAdminUser,
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
import { usePageTitle } from '../../hooks/usePageTitle'

// ---------------------------------------------------------------------------
// 상태 라벨
// ---------------------------------------------------------------------------

/** terminationDate 기준 잠금 여부 판단. */
function isLocked(user: AdminUser): boolean {
  return user.terminationDate !== null
}

// ---------------------------------------------------------------------------
// 공통 스타일 상수 (raw hex 0건 — design-system 토큰 var 또는 기본 중립)
// ---------------------------------------------------------------------------

const selectStyle: React.CSSProperties = {
  height: 32,
  padding: '0 10px',
  border: '1px solid var(--color-neutral-300, #D1D5DB)',
  borderRadius: 6,
  fontSize: 13,
  fontFamily: 'inherit',
  background: 'var(--color-surface, #fff)',
  color: 'var(--color-text-primary, #111827)',
}

const textareaStyle: React.CSSProperties = {
  padding: 8,
  border: '1px solid var(--color-neutral-300, #D1D5DB)',
  borderRadius: 6,
  fontSize: 13,
  fontFamily: 'inherit',
  resize: 'vertical',
  width: '100%',
  boxSizing: 'border-box',
  color: 'var(--color-text-primary, #111827)',
  background: 'var(--color-surface, #fff)',
}

const formColStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
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

  const enableMutation = useMutation({
    mutationFn: enableAdminUser,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin', 'users'] })
    },
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
        render: (u) => ADMIN_ROLE_LABEL[u.role],
      },
      {
        key: 'terminationDate',
        header: '상태',
        width: '90px',
        render: (u) =>
          isLocked(u) ? (
            <Badge variant="danger">잠금</Badge>
          ) : (
            <Badge variant="success">활성</Badge>
          ),
      },
      {
        key: 'id',
        header: '관리',
        render: (u) => (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {/* 잠금 해제 버튼 — terminationDate 가 set 된 경우만 표시 */}
            {isLocked(u) ? (
              <Button
                variant="ghost"
                size="sm"
                data-testid="admin-user-unlock-button"
                onClick={(e) => {
                  e.stopPropagation()
                  if (window.confirm(`${u.fullName} 계정의 잠금을 해제합니다.`)) {
                    unlockMutation.mutate(u.id)
                  }
                }}
              >
                잠금 해제
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
            {/* 탈퇴 처리 — 활성 사용자에만 표시 */}
            {!isLocked(u) ? (
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
            ) : (
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation()
                  if (window.confirm(`${u.fullName} 사용자를 재활성화합니다.`)) {
                    enableMutation.mutate(u.id)
                  }
                }}
              >
                재활성화
              </Button>
            )}
          </div>
        ),
      },
    ],
    [enableMutation, unlockMutation],
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
            style={{ fontSize: 12, color: 'var(--color-neutral-500)' }}
          >
            실시간 자동 갱신 · 30초
          </span>
          <Button
            variant="primary"
            size="sm"
            data-testid="admin-users-create-button"
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
          <option value="LOCKED">잠금</option>
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
          {(rolesQuery.data ?? []).map((r) => (
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
          {(departmentsQuery.data ?? []).map((d) => (
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
            roles={rolesQuery.data ?? []}
            departments={departmentsQuery.data ?? []}
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
            departments={departmentsQuery.data ?? []}
            onClose={() => setEditModal(null)}
            onCommitted={() => {
              setEditModal(null)
              invalidateUsers()
            }}
          />
        </div>
      ) : null}

      {/* 권한 변경 Modal */}
      {roleModal ? (
        <div data-testid="admin-user-role-change-modal">
          <RoleChangeModal
            user={roleModal}
            roles={rolesQuery.data ?? []}
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

  // 임시 비밀번호 표시 단계
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
            <strong>{result.user.fullName}</strong> ({result.user.loginId}) 계정이
            생성되었습니다.
          </p>
          <div
            style={{
              background: 'var(--color-neutral-100, #F3F4F6)',
              borderRadius: 6,
              padding: '12px 16px',
              fontSize: 14,
            }}
          >
            <div style={{ marginBottom: 4, fontWeight: 600 }}>초기 비밀번호</div>
            <code
              style={{
                fontSize: 16,
                letterSpacing: 2,
                color: 'var(--color-primary-700, #1D4ED8)',
              }}
            >
              {result.temporaryPassword}
            </code>
          </div>
          <p
            style={{
              margin: 0,
              fontSize: 12,
              color: 'var(--color-neutral-500)',
            }}
          >
            이 비밀번호는 사용자에게 직접 전달하세요. 화면을 닫으면 다시 확인할 수
            없습니다.
          </p>
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
              background: 'var(--color-danger-50, #FEF2F2)',
              color: 'var(--color-danger-700, #B91C1C)',
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
              background: 'var(--color-danger-50, #FEF2F2)',
              color: 'var(--color-danger-700, #B91C1C)',
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
// RoleChangeModal — 권한 변경
// ---------------------------------------------------------------------------

interface RoleChangeModalProps {
  user: AdminUser
  roles: AdminRole[]
  onClose: () => void
  onCommitted: () => void
}

function RoleChangeModal({
  user,
  roles,
  onClose,
  onCommitted,
}: RoleChangeModalProps) {
  const [newRole, setNewRole] = useState<AdminRole>(user.role)
  const [reason, setReason] = useState('')

  const mutation = useMutation({
    mutationFn: () =>
      updateAdminUserRole(user.id, {
        newRole,
        reason: reason.trim() || undefined,
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
      title={`권한 변경 — ${user.fullName} (${user.loginId})`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={mutation.isPending}>
            취소
          </Button>
          <Button
            variant="primary"
            onClick={() => mutation.mutate()}
            loading={mutation.isPending}
            disabled={newRole === user.role}
          >
            적용
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} style={formColStyle}>
        <FormField
          label="현재 권한"
          render={() => (
            <div style={{ fontSize: 13, padding: '4px 0' }}>
              {ADMIN_ROLE_LABEL[user.role]}
            </div>
          )}
        />
        <FormField
          label="신규 권한"
          required
          render={({ id }) => (
            <select
              id={id}
              value={newRole}
              onChange={(e) => setNewRole(e.target.value as AdminRole)}
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
          label="변경 사유"
          render={({ id }) => (
            <textarea
              id={id}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={500}
              rows={3}
              placeholder="변경 사유 (선택)"
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
              background: 'var(--color-danger-50, #FEF2F2)',
              color: 'var(--color-danger-700, #B91C1C)',
              fontSize: 13,
            }}
          >
            권한 변경에 실패했습니다.
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
        h.previousRole ? ADMIN_ROLE_LABEL[h.previousRole] : '(신규)',
    },
    {
      key: 'newRole',
      header: '변경 후',
      width: '110px',
      render: (h) => ADMIN_ROLE_LABEL[h.newRole],
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
        rows={query.data ?? []}
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
  const reasonValid = reasonTrimmed.length >= 5

  const mutation = useMutation({
    mutationFn: () =>
      disableAdminUser(user.id, { reason: reasonTrimmed }),
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
            color: 'var(--color-danger-700, #B91C1C)',
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
              background: 'var(--color-danger-50, #FEF2F2)',
              color: 'var(--color-danger-700, #B91C1C)',
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
