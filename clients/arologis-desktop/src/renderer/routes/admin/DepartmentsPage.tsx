/**
 * 아로로지스 인사 — 부서 관리.
 *
 * UUID 비공개: 부서 code/name/displayOrder 만 화면에 표시한다.
 */
import axios from 'axios'
import { useMemo, useState, type CSSProperties, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Button,
  DataGrid,
  Input,
  Modal,
  type DataGridColumn,
} from '@samhan/design-system'
import {
  createDepartment,
  deleteDepartment,
  listDepartments,
  updateDepartment,
  type DepartmentRow,
} from '../../api/arologisHr'
import { usePageTitle } from '../../hooks/usePageTitle'

type DepartmentModalState =
  | { mode: 'create' }
  | { mode: 'edit'; department: DepartmentRow }
  | { mode: 'delete'; department: DepartmentRow }
  | null

export function DepartmentsPage(): JSX.Element {
  usePageTitle('부서 관리')

  const queryClient = useQueryClient()
  const [modal, setModal] = useState<DepartmentModalState>(null)

  const departmentsQuery = useQuery({
    queryKey: ['arologis', 'hr', 'departments'],
    queryFn: listDepartments,
  })

  const refreshDepartments = async (): Promise<void> => {
    await queryClient.invalidateQueries({ queryKey: ['arologis', 'hr', 'departments'] })
  }

  const columns = useMemo<DataGridColumn<DepartmentRow>[]>(() => [
    { key: 'code', label: '부서 코드', width: 180 },
    { key: 'name', label: '부서명' },
    {
      key: 'displayOrder',
      label: '표시 순서',
      width: 120,
      align: 'right',
      format: (v) => Number(v ?? 0).toLocaleString('ko-KR'),
    },
    {
      key: 'actions',
      label: '관리',
      width: 170,
      filter: false,
      render: (row) => (
        <div style={actionRowStyle}>
          <Button size="sm" variant="secondary" onClick={() => setModal({ mode: 'edit', department: row })}>
            수정
          </Button>
          <Button size="sm" variant="danger" onClick={() => setModal({ mode: 'delete', department: row })}>
            삭제
          </Button>
        </div>
      ),
    },
  ], [])

  return (
    <section style={pageStyle}>
      <header style={headerStyle}>
        <div>
          <h1 style={titleStyle}>부서 관리</h1>
          <p style={descStyle}>
            아로로지스 직원 배속에 사용하는 부서 마스터를 관리합니다.
          </p>
        </div>
        <Button variant="primary" onClick={() => setModal({ mode: 'create' })}>
          부서 등록
        </Button>
      </header>

      {departmentsQuery.error ? (
        <ErrorBanner message={toErrorMessage(departmentsQuery.error, '부서 목록을 불러오지 못했습니다.')} />
      ) : null}

      <DataGrid
        columns={columns}
        rows={departmentsQuery.data ?? []}
        rowKey={(row) => row.code}
        loading={departmentsQuery.isLoading}
        emptyMessage="등록된 부서가 없습니다."
        enableMultiSelect={false}
        enableCopy
        getRowTestId={(row) => `arologis-department-row-${row.code}`}
      />

      {(modal?.mode === 'create' || modal?.mode === 'edit') ? (
        <DepartmentFormModal
          mode={modal.mode}
          department={modal.mode === 'edit' ? modal.department : undefined}
          onClose={() => setModal(null)}
          onSaved={() => {
            setModal(null)
            void refreshDepartments()
          }}
        />
      ) : null}

      {modal?.mode === 'delete' ? (
        <DepartmentDeleteModal
          department={modal.department}
          onClose={() => setModal(null)}
          onDeleted={() => {
            setModal(null)
            void refreshDepartments()
          }}
        />
      ) : null}
    </section>
  )
}

function DepartmentFormModal({
  mode,
  department,
  onClose,
  onSaved,
}: {
  mode: 'create' | 'edit'
  department?: DepartmentRow
  onClose: () => void
  onSaved: () => void
}): JSX.Element {
  const [code, setCode] = useState(department?.code ?? '')
  const [name, setName] = useState(department?.name ?? '')
  const [displayOrder, setDisplayOrder] = useState(String(department?.displayOrder ?? 0))
  const [error, setError] = useState<string | null>(null)

  const createMutation = useMutation({
    mutationFn: () => createDepartment({
      code: code.trim(),
      name: name.trim(),
      displayOrder: toDisplayOrder(displayOrder),
    }),
    onSuccess: onSaved,
    onError: (err) => setError(toErrorMessage(err, '부서 등록에 실패했습니다.')),
  })

  const updateMutation = useMutation({
    mutationFn: () => updateDepartment(department?.code ?? '', {
      name: name.trim(),
      displayOrder: toDisplayOrder(displayOrder),
    }),
    onSuccess: onSaved,
    onError: (err) => setError(toErrorMessage(err, '부서 수정에 실패했습니다.')),
  })

  const isPending = createMutation.isPending || updateMutation.isPending
  const canSubmit = name.trim().length > 0 && (mode === 'edit' || code.trim().length > 0)

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
      title={mode === 'create' ? '부서 등록' : '부서 수정'}
      footer={
        <div style={modalFooterStyle}>
          <Button variant="ghost" onClick={onClose}>취소</Button>
          <Button variant="primary" loading={isPending} disabled={!canSubmit} onClick={() => submitForm('department-form')}>
            저장
          </Button>
        </div>
      }
    >
      <form id="department-form" onSubmit={handleSubmit} style={formColStyle}>
        {error ? <FormError message={error} /> : null}
        <Input
          label="부서 코드"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          required
          disabled={mode === 'edit'}
          hint={mode === 'edit' ? '부서 코드는 변경할 수 없습니다.' : undefined}
        />
        <Input
          label="부서명"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
        <Input
          label="표시 순서"
          type="number"
          value={displayOrder}
          onChange={(e) => setDisplayOrder(e.target.value)}
        />
      </form>
    </Modal>
  )
}

function DepartmentDeleteModal({
  department,
  onClose,
  onDeleted,
}: {
  department: DepartmentRow
  onClose: () => void
  onDeleted: () => void
}): JSX.Element {
  const [error, setError] = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: () => deleteDepartment(department.code),
    onSuccess: onDeleted,
    onError: (err) => setError(toDeleteError(err)),
  })

  return (
    <Modal
      open
      onClose={onClose}
      title="부서 삭제"
      description={`${department.name} (${department.code})`}
      footer={
        <div style={modalFooterStyle}>
          <Button variant="ghost" onClick={onClose}>취소</Button>
          <Button
            variant="danger"
            loading={mutation.isPending}
            onClick={() => {
              setError(null)
              mutation.mutate()
            }}
          >
            삭제
          </Button>
        </div>
      }
    >
      <div style={formColStyle}>
        {error ? <FormError message={error} /> : null}
        <p style={{ margin: 0 }}>
          부서를 삭제하면 직원 등록/수정 화면의 부서 선택 목록에서 제외됩니다.
        </p>
      </div>
    </Modal>
  )
}

function ErrorBanner({ message }: { message: string }): JSX.Element {
  return <div role="alert" style={errorStyle}>{message}</div>
}

function FormError({ message }: { message: string }): JSX.Element {
  return <div role="alert" style={errorStyle}>{message}</div>
}

function submitForm(formId: string): void {
  const form = document.getElementById(formId) as HTMLFormElement | null
  form?.requestSubmit()
}

function toDisplayOrder(value: string): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function toDeleteError(err: unknown): string {
  if (axios.isAxiosError(err) && err.response?.status === 409) {
    return '현직 직원이 배속된 부서는 삭제할 수 없습니다. 먼저 직원 부서를 변경하거나 퇴직 처리하세요.'
  }
  return toErrorMessage(err, '부서 삭제에 실패했습니다.')
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
const actionRowStyle: CSSProperties = { display: 'flex', gap: 6, flexWrap: 'wrap' }
const modalFooterStyle: CSSProperties = { display: 'flex', justifyContent: 'flex-end', gap: 8 }
const formColStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 14 }
const errorStyle: CSSProperties = {
  padding: '10px 12px',
  border: '1px solid var(--state-danger, #dc2626)',
  borderRadius: 4,
  background: 'var(--state-danger-bg, #fee2e2)',
  color: 'var(--state-danger, #b91c1c)',
}
