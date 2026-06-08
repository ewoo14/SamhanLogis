/**
 * 아로로지스 인사 — 직원 관리.
 *
 * UUID 비공개: 화면과 라우팅에는 loginId / 부서명만 노출한다.
 * 직원 등록 시 임시 비밀번호는 생성 응답에서만 1회 표시하고 별도 재조회 경로를 두지 않는다.
 */
import axios from 'axios'
import { useMemo, useState, type CSSProperties, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Badge,
  Button,
  DataGrid,
  Input,
  Modal,
  Select,
  type DataGridColumn,
} from '@samhan/design-system'
import {
  changeEmployeeRole,
  createEmployee,
  listDepartments,
  listEmployees,
  listRoleHistories,
  terminateEmployee,
  updateEmployee,
  type ArologisRole,
  type DepartmentRow,
  type EmployeeRow,
  type ProvisionedEmployee,
  type RoleHistoryRow,
} from '../../api/arologisHr'
import { usePageTitle } from '../../hooks/usePageTitle'
import { canGrantMaster, canManageHr, useAuthStore } from '../../stores/authStore'

type EmployeeModalState =
  | { mode: 'create' }
  | { mode: 'edit'; employee: EmployeeRow }
  | { mode: 'role'; employee: EmployeeRow }
  | { mode: 'terminate'; employee: EmployeeRow }
  | { mode: 'history'; employee: EmployeeRow }
  | null

const ROLE_OPTIONS: ArologisRole[] = ['AROLOGIS_MANAGER', 'AROLOGIS_MASTER']
const ROLE_LABELS: Partial<Record<ArologisRole, string>> = {
  AROLOGIS_MASTER: '마스터',
  AROLOGIS_MANAGER: '매니저',
}

interface DepartmentOption extends DepartmentRow {
  disabled?: boolean
}

export function EmployeesPage(): JSX.Element {
  usePageTitle('직원 관리')

  const queryClient = useQueryClient()
  const [departmentFilter, setDepartmentFilter] = useState('')
  const [modal, setModal] = useState<EmployeeModalState>(null)
  const [provisioned, setProvisioned] = useState<ProvisionedEmployee | null>(null)
  const auth = useAuthStore((s) => s.auth)
  const canManage = canManageHr(auth?.role)
  const canGrantMasterRole = canGrantMaster(auth?.role)

  const departmentsQuery = useQuery({
    queryKey: ['arologis', 'hr', 'departments'],
    queryFn: listDepartments,
  })

  const employeesQuery = useQuery({
    queryKey: ['arologis', 'hr', 'employees', departmentFilter],
    queryFn: () => listEmployees(departmentFilter || undefined),
  })

  const departments = departmentsQuery.data ?? []
  const employees = employeesQuery.data ?? []

  const refreshEmployees = async (): Promise<void> => {
    await queryClient.invalidateQueries({ queryKey: ['arologis', 'hr', 'employees'] })
  }

  const columns = useMemo<DataGridColumn<EmployeeRow>[]>(() => [
    { key: 'loginId', label: '로그인 ID', width: 150 },
    { key: 'fullName', label: '성명', width: 130 },
    {
      key: 'position',
      label: '직급',
      width: 110,
      format: (v) => nullableText(v),
    },
    { key: 'departmentName', label: '부서', width: 140 },
    {
      key: 'role',
      label: '롤',
      width: 180,
      filter: 'select',
      format: (v) => roleLabel(v as ArologisRole),
      render: (row) => (
        <Badge variant={row.role === 'AROLOGIS_MASTER' ? 'brand' : 'neutral'}>
          {roleLabel(row.role)}
        </Badge>
      ),
    },
    {
      key: 'hireDate',
      label: '입사일',
      width: 120,
      format: (v) => formatDate(String(v)),
    },
    {
      key: 'active',
      label: '재직상태',
      width: 110,
      filter: 'select',
      format: (v) => (v ? '재직' : '퇴직'),
      render: (row) => (
        <Badge variant={row.active ? 'success' : 'danger'}>
          {row.active ? '재직' : '퇴직'}
        </Badge>
      ),
    },
    {
      key: 'actions',
      label: '관리',
      width: 330,
      filter: false,
      render: (row) => (
        <div style={actionRowStyle}>
          {canManage ? (
            <>
              <Button size="sm" variant="secondary" onClick={() => setModal({ mode: 'edit', employee: row })}>
                수정
              </Button>
              <Button size="sm" variant="secondary" onClick={() => setModal({ mode: 'role', employee: row })}>
                롤 변경
              </Button>
            </>
          ) : null}
          <Button size="sm" variant="ghost" onClick={() => setModal({ mode: 'history', employee: row })}>
            이력
          </Button>
          {canManage ? (
            <Button
              size="sm"
              variant="danger"
              disabled={!row.active}
              onClick={() => setModal({ mode: 'terminate', employee: row })}
            >
              퇴직
            </Button>
          ) : null}
        </div>
      ),
    },
  ], [canManage])

  return (
    <section style={pageStyle}>
      <header style={headerStyle}>
        <div>
          <h1 style={titleStyle}>직원 관리</h1>
          <p style={descStyle}>
            아로로지스 행정직원 계정, 부서, 롤, 재직 상태를 관리합니다.
          </p>
        </div>
        {canManage ? (
          <Button variant="primary" onClick={() => setModal({ mode: 'create' })}>
            직원 등록
          </Button>
        ) : null}
      </header>

      <div style={filterRowStyle}>
        <Select
          label="부서 필터"
          value={departmentFilter}
          onChange={(e) => setDepartmentFilter(e.target.value)}
          selectSize="sm"
          fullWidth={false}
          data-testid="arologis-employee-department-filter"
        >
          <option value="">전체 부서</option>
          {departments.map((department) => (
            <option key={department.code} value={department.code}>
              {department.name}
            </option>
          ))}
        </Select>
        <Button
          variant="secondary"
          size="sm"
          loading={employeesQuery.isFetching || departmentsQuery.isFetching}
          onClick={() => {
            void employeesQuery.refetch()
            void departmentsQuery.refetch()
          }}
        >
          새로고침
        </Button>
      </div>

      {employeesQuery.error ? (
        <ErrorBanner message={toErrorMessage(employeesQuery.error, '직원 목록을 불러오지 못했습니다.')} />
      ) : null}

      <DataGrid
        columns={columns}
        rows={employees}
        rowKey={(row) => row.loginId}
        loading={employeesQuery.isLoading}
        emptyMessage="등록된 직원이 없습니다."
        enableMultiSelect={false}
        enableCopy
        getRowTestId={(row) => `arologis-employee-row-${row.loginId}`}
        className="arologis-employee-grid"
      />

      {canManage && (modal?.mode === 'create' || modal?.mode === 'edit') ? (
        <EmployeeFormModal
          mode={modal.mode}
          employee={modal.mode === 'edit' ? modal.employee : undefined}
          departments={departments}
          canGrantMasterRole={canGrantMasterRole}
          onClose={() => setModal(null)}
          onCreated={(result) => {
            setModal(null)
            setProvisioned(result)
            void refreshEmployees()
          }}
          onUpdated={() => {
            setModal(null)
            void refreshEmployees()
          }}
        />
      ) : null}

      {canManage && modal?.mode === 'role' ? (
        <RoleChangeModal
          employee={modal.employee}
          canGrantMasterRole={canGrantMasterRole}
          onClose={() => setModal(null)}
          onUpdated={() => {
            setModal(null)
            void refreshEmployees()
          }}
        />
      ) : null}

      {canManage && modal?.mode === 'terminate' ? (
        <TerminateModal
          employee={modal.employee}
          onClose={() => setModal(null)}
          onUpdated={() => {
            setModal(null)
            void refreshEmployees()
          }}
        />
      ) : null}

      {modal?.mode === 'history' ? (
        <RoleHistoryModal
          employee={modal.employee}
          onClose={() => setModal(null)}
        />
      ) : null}

      {provisioned ? (
        <TemporaryPasswordModal
          result={provisioned}
          onClose={() => setProvisioned(null)}
        />
      ) : null}
    </section>
  )
}

function EmployeeFormModal({
  mode,
  employee,
  departments,
  canGrantMasterRole,
  onClose,
  onCreated,
  onUpdated,
}: {
  mode: 'create' | 'edit'
  employee?: EmployeeRow
  departments: DepartmentRow[]
  canGrantMasterRole: boolean
  onClose: () => void
  onCreated: (result: ProvisionedEmployee) => void
  onUpdated: () => void
}): JSX.Element {
  const [loginId, setLoginId] = useState(employee?.loginId ?? '')
  const [fullName, setFullName] = useState(employee?.fullName ?? '')
  const [position, setPosition] = useState(employee?.position ?? '')
  const [departmentCode, setDepartmentCode] = useState(employee?.departmentCode ?? departments[0]?.code ?? '')
  const [hireDate, setHireDate] = useState(employee?.hireDate ?? todayIso())
  const [email, setEmail] = useState(employee?.email ?? '')
  const [phone, setPhone] = useState(employee?.phone ?? '')
  const [role, setRole] = useState<ArologisRole>(employee?.role ?? 'AROLOGIS_MANAGER')
  const [error, setError] = useState<string | null>(null)
  const roleOptions = availableRoleOptions(canGrantMasterRole)
  const departmentOptions = buildDepartmentOptions(departments, employee)
  const selectedDepartmentIsStale = departmentOptions.some(
    (department) => department.code === departmentCode && department.disabled,
  )

  const createMutation = useMutation({
    mutationFn: () => createEmployee({
      loginId: loginId.trim(),
      fullName: fullName.trim(),
      position: blankToNull(position),
      departmentCode,
      hireDate,
      email: blankToNull(email),
      phone: blankToNull(phone),
      role,
    }),
    onSuccess: onCreated,
    onError: (err) => setError(toErrorMessage(err, '직원 등록에 실패했습니다.')),
  })

  const updateMutation = useMutation({
    mutationFn: () => updateEmployee(employee?.loginId ?? '', {
      fullName: fullName.trim(),
      position: blankToNull(position),
      departmentCode,
      email: blankToNull(email),
      phone: blankToNull(phone),
    }),
    onSuccess: onUpdated,
    onError: (err) => setError(toErrorMessage(err, '직원 수정에 실패했습니다.')),
  })

  const isPending = createMutation.isPending || updateMutation.isPending
  const canSubmit =
    fullName.trim().length > 0
    && departmentCode.length > 0
    && !selectedDepartmentIsStale
    && (mode === 'edit' || (loginId.trim().length > 0 && hireDate.length > 0))

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    if (!canSubmit || isPending) return
    setError(null)
    if (mode === 'create') createMutation.mutate()
    else updateMutation.mutate()
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={mode === 'create' ? '직원 등록' : '직원 수정'}
      size="lg"
      footer={
        <div style={modalFooterStyle}>
          <Button variant="ghost" onClick={onClose}>취소</Button>
          <Button variant="primary" loading={isPending} disabled={!canSubmit} onClick={() => submitForm('employee-form')}>
            저장
          </Button>
        </div>
      }
    >
      <form id="employee-form" onSubmit={handleSubmit} style={formGridStyle}>
        {error ? <FormError message={error} /> : null}
        <Input
          label="로그인 ID"
          value={loginId}
          onChange={(e) => setLoginId(e.target.value)}
          required
          disabled={mode === 'edit'}
          hint={mode === 'edit' ? '로그인 ID는 변경할 수 없습니다.' : '직원 로그인 식별자입니다.'}
        />
        <Input
          label="성명"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          required
        />
        <Input
          label="직급"
          value={position}
          onChange={(e) => setPosition(e.target.value)}
        />
        <Select
          label="부서"
          value={departmentCode}
          onChange={(e) => setDepartmentCode(e.target.value)}
          required
          hint={selectedDepartmentIsStale ? '삭제된 부서입니다. 저장하려면 활성 부서를 다시 선택하세요.' : undefined}
        >
          <option value="" disabled>부서 선택</option>
          {departmentOptions.map((department) => (
            <option key={department.code} value={department.code} disabled={department.disabled}>
              {department.name}
            </option>
          ))}
        </Select>
        <Input
          label="입사일"
          type="date"
          value={hireDate}
          onChange={(e) => setHireDate(e.target.value)}
          required
          disabled={mode === 'edit'}
        />
        {mode === 'edit' ? (
          <Input
            label="롤"
            value={roleLabel(role)}
            disabled
            hint="롤 변경은 별도 이력 모달에서 처리합니다."
          />
        ) : (
          <Select
            label="롤"
            value={role}
            onChange={(e) => setRole(e.target.value as ArologisRole)}
            required
          >
            {roleOptions.map((nextRole) => (
              <option key={nextRole} value={nextRole}>{roleLabel(nextRole)}</option>
            ))}
          </Select>
        )}
        <Input
          label="이메일"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <Input
          label="연락처"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
        />
      </form>
    </Modal>
  )
}

function RoleChangeModal({
  employee,
  canGrantMasterRole,
  onClose,
  onUpdated,
}: {
  employee: EmployeeRow
  canGrantMasterRole: boolean
  onClose: () => void
  onUpdated: () => void
}): JSX.Element {
  const roleOptions = availableRoleOptions(canGrantMasterRole)
  const [role, setRole] = useState<ArologisRole>(
    roleOptions.includes(employee.role) ? employee.role : 'AROLOGIS_MANAGER',
  )
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: () => changeEmployeeRole(employee.loginId, {
      role,
      reason: blankToNull(reason),
    }),
    onSuccess: onUpdated,
    onError: (err) => setError(toRoleChangeError(err)),
  })

  // 대상이 마스터인데 actor 가 마스터 부여 권한이 없으면, 어떤 롤 변경도 마스터 권한이 필요(강등 포함)하므로 선제 차단(BE 403 왕복 방지).
  const targetIsProtectedMaster = employee.role === 'AROLOGIS_MASTER' && !canGrantMasterRole
  const canSubmit = !targetIsProtectedMaster && role !== employee.role && reason.trim().length > 0

  return (
    <Modal
      open
      onClose={onClose}
      title="롤 변경"
      description={`${employee.fullName} (${employee.loginId})`}
      footer={
        <div style={modalFooterStyle}>
          <Button variant="ghost" onClick={onClose}>취소</Button>
          <Button
            variant="primary"
            loading={mutation.isPending}
            disabled={!canSubmit}
            onClick={() => {
              setError(null)
              mutation.mutate()
            }}
          >
            변경
          </Button>
        </div>
      }
    >
      <div style={formColStyle}>
        {error ? <FormError message={error} /> : null}
        {targetIsProtectedMaster ? (
          <div style={noticeStyle}>마스터 직원의 롤 변경(강등 포함)은 마스터 권한 계정만 가능합니다.</div>
        ) : null}
        <Select
          label="변경할 롤"
          value={role}
          onChange={(e) => setRole(e.target.value as ArologisRole)}
          required
        >
          {roleOptions.map((nextRole) => (
            <option key={nextRole} value={nextRole}>{roleLabel(nextRole)}</option>
          ))}
        </Select>
        <label style={textareaLabelStyle}>
          <span>변경 사유 <strong aria-hidden="true">*</strong></span>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={500}
            rows={5}
            style={textareaStyle}
            placeholder="권한 변경 사유를 입력하세요."
          />
        </label>
        {canGrantMasterRole ? (
          <div style={noticeStyle}>
            마스터 부여는 BE에서 마스터 계정만 허용합니다. 권한이 없으면 403 안내가 표시됩니다.
          </div>
        ) : null}
      </div>
    </Modal>
  )
}

function TerminateModal({
  employee,
  onClose,
  onUpdated,
}: {
  employee: EmployeeRow
  onClose: () => void
  onUpdated: () => void
}): JSX.Element {
  const [terminationDate, setTerminationDate] = useState(todayIso())
  const [error, setError] = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: () => terminateEmployee(employee.loginId, { terminationDate }),
    onSuccess: onUpdated,
    onError: (err) => setError(toErrorMessage(err, '퇴직 처리에 실패했습니다.')),
  })

  return (
    <Modal
      open
      onClose={onClose}
      title="퇴직 처리"
      description={`${employee.fullName} (${employee.loginId})`}
      footer={
        <div style={modalFooterStyle}>
          <Button variant="ghost" onClick={onClose}>취소</Button>
          <Button
            variant="danger"
            loading={mutation.isPending}
            disabled={!terminationDate}
            onClick={() => {
              setError(null)
              mutation.mutate()
            }}
          >
            퇴직 처리
          </Button>
        </div>
      }
    >
      <div style={formColStyle}>
        {error ? <FormError message={error} /> : null}
        <Input
          label="퇴직일"
          type="date"
          value={terminationDate}
          onChange={(e) => setTerminationDate(e.target.value)}
          required
          hint={`${employee.hireDate} 이후`}
        />
        <div style={noticeStyle}>
          퇴직 처리 시 직원과 연결된 로그인 계정이 함께 비활성화됩니다.
        </div>
      </div>
    </Modal>
  )
}

function RoleHistoryModal({
  employee,
  onClose,
}: {
  employee: EmployeeRow
  onClose: () => void
}): JSX.Element {
  const historyQuery = useQuery({
    queryKey: ['arologis', 'hr', 'employees', employee.loginId, 'role-histories'],
    queryFn: () => listRoleHistories(employee.loginId),
  })

  const columns: DataGridColumn<RoleHistoryRow>[] = [
    {
      key: 'previousRole',
      label: '이전 롤',
      width: 180,
      format: (v) => roleLabel(v as ArologisRole),
      render: (row) => <Badge variant="neutral">{roleLabel(row.previousRole)}</Badge>,
    },
    {
      key: 'newRole',
      label: '변경 롤',
      width: 180,
      format: (v) => roleLabel(v as ArologisRole),
      render: (row) => <Badge variant={row.newRole === 'AROLOGIS_MASTER' ? 'brand' : 'neutral'}>{roleLabel(row.newRole)}</Badge>,
    },
    { key: 'reason', label: '사유', format: (v) => nullableText(v) },
    { key: 'changedBy', label: '변경자 로그인 ID', width: 160 },
    { key: 'changedAt', label: '변경시각', width: 170, format: (v) => formatDateTime(String(v)) },
  ]

  return (
    <Modal open onClose={onClose} title="롤 변경 이력" description={`${employee.fullName} (${employee.loginId})`} size="xl">
      {historyQuery.error ? (
        <ErrorBanner message={toErrorMessage(historyQuery.error, '롤 변경 이력을 불러오지 못했습니다.')} />
      ) : null}
      <DataGrid
        columns={columns}
        rows={historyQuery.data ?? []}
        rowKey={(row) => `${row.changedAt}-${row.changedBy}-${row.newRole}`}
        loading={historyQuery.isLoading}
        emptyMessage="롤 변경 이력이 없습니다."
        enableMultiSelect={false}
        enableCopy
      />
    </Modal>
  )
}

function TemporaryPasswordModal({
  result,
  onClose,
}: {
  result: ProvisionedEmployee
  onClose: () => void
}): JSX.Element {
  const [copied, setCopied] = useState(false)

  const handleCopy = (): void => {
    navigator.clipboard.writeText(result.temporaryPassword).then(() => {
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    }).catch(() => {
      setCopied(false)
    })
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="직원 등록 완료"
      closeOnBackdropClick={false}
      footer={<Button variant="primary" onClick={onClose}>확인</Button>}
    >
      <div style={formColStyle}>
        <p style={{ margin: 0 }}>
          <strong>{result.employee.fullName}</strong> ({result.employee.loginId}) 계정이 생성되었습니다.
        </p>
        <div data-testid="arologis-employee-temp-password" style={passwordBoxStyle}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>임시 비밀번호</div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <code style={passwordCodeStyle}>{result.temporaryPassword}</code>
            <Button size="sm" variant="secondary" onClick={handleCopy}>
              {copied ? '복사됨' : '복사'}
            </Button>
          </div>
        </div>
        <div style={noticeStyle}>
          이 비밀번호는 지금만 확인할 수 있습니다. 직원에게 안전한 경로로 전달하세요.
        </div>
      </div>
    </Modal>
  )
}

function ErrorBanner({ message }: { message: string }): JSX.Element {
  return <div role="alert" style={errorStyle}>{message}</div>
}

function FormError({ message }: { message: string }): JSX.Element {
  return <div role="alert" style={formErrorStyle}>{message}</div>
}

function submitForm(formId: string): void {
  const form = document.getElementById(formId) as HTMLFormElement | null
  form?.requestSubmit()
}

function blankToNull(value: string): string | null {
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function nullableText(value: unknown): string {
  return value === null || value === undefined || value === '' ? '-' : String(value)
}

function roleLabel(role: ArologisRole): string {
  return ROLE_LABELS[role] ?? role
}

function availableRoleOptions(canGrantMasterRole: boolean): ArologisRole[] {
  return ROLE_OPTIONS.filter((role) => role !== 'AROLOGIS_MASTER' || canGrantMasterRole)
}

function buildDepartmentOptions(departments: DepartmentRow[], employee?: EmployeeRow): DepartmentOption[] {
  if (!employee?.departmentCode) return departments
  if (departments.some((department) => department.code === employee.departmentCode)) return departments
  return [
    ...departments,
    {
      code: employee.departmentCode,
      name: `${employee.departmentCode} (삭제된 부서)`,
      displayOrder: Number.MAX_SAFE_INTEGER,
      disabled: true,
    },
  ]
}

function todayIso(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function formatDate(value: string): string {
  if (!value) return '-'
  return value
}

function formatDateTime(value: string): string {
  try {
    return new Date(value).toLocaleString('ko-KR', {
      timeZone: 'Asia/Seoul',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return value
  }
}

function toRoleChangeError(err: unknown): string {
  if (axios.isAxiosError(err) && err.response?.status === 403) {
    return '마스터 부여는 마스터 권한 계정만 가능합니다.'
  }
  return toErrorMessage(err, '롤 변경에 실패했습니다.')
}

function toErrorMessage(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err)) {
    const status = err.response?.status
    const data = err.response?.data as { message?: unknown } | undefined
    const message = typeof data?.message === 'string' ? data.message : undefined
    if (status === 403) return message ?? '해당 작업 권한이 없습니다.'
    if (message) return message
  }
  return fallback
}

const pageStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 16 }
const headerStyle: CSSProperties = { display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start' }
const titleStyle: CSSProperties = { fontSize: 'var(--font-size-xl)', margin: 0 }
const descStyle: CSSProperties = { color: 'var(--color-text-muted)', margin: '6px 0 0' }
const filterRowStyle: CSSProperties = { display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }
const actionRowStyle: CSSProperties = { display: 'flex', gap: 6, flexWrap: 'wrap' }
const modalFooterStyle: CSSProperties = { display: 'flex', justifyContent: 'flex-end', gap: 8 }
const formGridStyle: CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 14 }
const formColStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 14 }
const textareaLabelStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, fontWeight: 600 }
const textareaStyle: CSSProperties = {
  minHeight: 96,
  resize: 'vertical',
  border: '1px solid var(--color-border)',
  borderRadius: 4,
  padding: 10,
  font: 'inherit',
}
const noticeStyle: CSSProperties = {
  padding: '10px 12px',
  border: '1px solid var(--state-warning, #f0b429)',
  borderRadius: 4,
  background: 'var(--state-warning-bg, #fffbe6)',
  color: 'var(--color-text-secondary, #595959)',
  fontSize: 13,
}
const errorStyle: CSSProperties = {
  padding: '10px 12px',
  border: '1px solid var(--state-danger, #dc2626)',
  borderRadius: 4,
  background: 'var(--state-danger-bg, #fee2e2)',
  color: 'var(--state-danger, #b91c1c)',
}
const formErrorStyle: CSSProperties = { ...errorStyle, gridColumn: '1 / -1' }
const passwordBoxStyle: CSSProperties = {
  padding: 14,
  border: '1px solid var(--color-border)',
  borderRadius: 6,
  background: 'var(--color-surface-muted, #f8fafc)',
}
const passwordCodeStyle: CSSProperties = {
  flex: 1,
  fontSize: 18,
  letterSpacing: 1,
  color: 'var(--color-primary)',
}
