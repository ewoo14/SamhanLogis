/**
 * 관리자 — 외부기사/배송사 마스터 (`/admin/external-carriers`).
 *
 * <p>UUID 비공개 가드: 사용자 노출 식별자는 name/phone 이며 data-testid suffix 도 name 기준이다.
 * id 는 mutation path key 와 DataTable rowKey 로만 사용한다.
 */
import { useMemo, useState, type CSSProperties, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Badge,
  Button,
  DataTable,
  FormField,
  Modal,
  type DataTableColumn,
} from '@samhan/design-system'
import {
  createExternalCarrier,
  listExternalCarriers,
  removeExternalCarrier,
  updateExternalCarrier,
  type ExternalCarrier,
  type ExternalCarrierCreateRequest,
  type ExternalCarrierUpdateRequest,
} from '../../api/externalCarrier'
import { usePageTitle } from '../../hooks/usePageTitle'
import { usePermissions } from '../../hooks/usePermissions'

export interface ExternalCarrierFormState {
  editing: ExternalCarrier | null
  name: string
  phone: string
  email: string
  defaultVehicleType: string
  memo: string
  active: boolean
}

export const EMPTY_EXTERNAL_CARRIER_FORM: ExternalCarrierFormState = {
  editing: null,
  name: '',
  phone: '',
  email: '',
  defaultVehicleType: '',
  memo: '',
  active: true,
}

/** name 기반 test id suffix. UUID 대신 사용자 노출 식별자를 사용한다. */
export function externalCarrierTestIdName(name: string): string {
  return name.trim().replace(/\s+/g, '-')
}

/** 등록/수정 폼 필수값 검증. */
export function validateExternalCarrierForm(form: ExternalCarrierFormState): string | null {
  if (!form.name.trim()) return '이름/배송사명은 필수입니다.'
  if (!form.phone.trim()) return '전화번호는 필수입니다.'
  return null
}

/** 관리 액션은 dispatch.external-carriers CREATE 권한으로 노출한다. */
export function canManageExternalCarrier(
  canAccess: (pageCode: 'dispatch.external-carriers', action: 'create') => boolean,
): boolean {
  return canAccess('dispatch.external-carriers', 'create')
}

/** 신규 등록 요청 — 빈 선택필드(email/기본차종/메모)는 null 로 전송한다. */
export function formToCreateRequest(form: ExternalCarrierFormState): ExternalCarrierCreateRequest {
  return {
    name: form.name.trim(),
    phone: form.phone.trim(),
    email: nullableText(form.email),
    defaultVehicleType: nullableText(form.defaultVehicleType),
    memo: nullableText(form.memo),
    active: form.active,
  }
}

/**
 * 수정 요청 — 빈 선택필드는 빈 문자열("")로 전송한다.
 *
 * <p>BE PATCH 시맨틱이 "null=미변경 / ""=클리어" 이므로, 기존 이메일/기본차종/메모를
 * 지우고 저장하면 실제로 비워진다. null 로 보내면 BE 가 미변경으로 처리해 클리어가
 * silent 하게 무시되던 회귀(P1)를 방지한다.
 */
export function formToUpdateRequest(form: ExternalCarrierFormState): ExternalCarrierUpdateRequest {
  return {
    name: form.name.trim(),
    phone: form.phone.trim(),
    email: form.email.trim(),
    defaultVehicleType: form.defaultVehicleType.trim(),
    memo: form.memo.trim(),
    active: form.active,
  }
}

export function ExternalCarriersPage() {
  usePageTitle('외부기사/배송사')
  const queryClient = useQueryClient()
  const { canAccess } = usePermissions()
  const canManage = canManageExternalCarrier(canAccess)

  const [form, setForm] = useState<ExternalCarrierFormState | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const query = useQuery({
    queryKey: ['admin', 'external-carriers'],
    queryFn: () => listExternalCarriers({ page: 0, size: 100 }),
  })

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ['admin', 'external-carriers'] })

  const createMutation = useMutation({
    mutationFn: createExternalCarrier,
    onSuccess: () => {
      void invalidate()
      setForm(null)
      setSubmitError(null)
    },
    onError: (err: unknown) => setSubmitError(extractErrorMessage(err)),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, req }: { id: string; req: ExternalCarrierUpdateRequest }) =>
      updateExternalCarrier(id, req),
    onSuccess: () => {
      void invalidate()
      setForm(null)
      setSubmitError(null)
    },
    onError: (err: unknown) => setSubmitError(extractErrorMessage(err)),
  })

  const deleteMutation = useMutation({
    mutationFn: removeExternalCarrier,
    onSuccess: () => void invalidate(),
  })

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (!form) return
    const validationError = validateExternalCarrierForm(form)
    if (validationError) {
      setSubmitError(validationError)
      return
    }
    if (form.editing) {
      updateMutation.mutate({
        id: form.editing.id,
        req: formToUpdateRequest(form),
      })
      return
    }
    createMutation.mutate(formToCreateRequest(form))
  }

  const columns: DataTableColumn<ExternalCarrier>[] = useMemo(
    () => [
      {
        key: 'name',
        header: '이름/배송사명',
        width: '180px',
        mobilePriority: 'primary',
        render: (row) => (
          <span data-testid={`admin-external-carriers-row-${externalCarrierTestIdName(row.name)}`}>
            {row.name}
          </span>
        ),
      },
      {
        key: 'phone',
        header: '전화',
        width: '150px',
        mobilePriority: 'secondary',
        render: (row) => row.phone,
      },
      {
        key: 'email',
        header: '이메일',
        mobilePriority: 'hidden',
        render: (row) => row.email || '-',
      },
      {
        key: 'defaultVehicleType',
        header: '기본차종',
        width: '120px',
        mobilePriority: 'secondary',
        render: (row) => row.defaultVehicleType || '-',
      },
      {
        key: 'active',
        header: '활성여부',
        width: '100px',
        mobilePriority: 'secondary',
        render: (row) => (
          <Badge variant={row.active ? 'success' : 'neutral'}>
            {row.active ? '활성' : '비활성'}
          </Badge>
        ),
      },
      {
        key: 'id',
        header: '관리',
        width: '170px',
        mobilePriority: 'hidden',
        render: (row) =>
          canManage ? (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <Button
                variant="ghost"
                size="sm"
                data-testid={`admin-external-carriers-edit-${externalCarrierTestIdName(row.name)}`}
                onClick={(e) => {
                  e.stopPropagation()
                  setSubmitError(null)
                  setForm({
                    editing: row,
                    name: row.name,
                    phone: row.phone,
                    email: row.email ?? '',
                    defaultVehicleType: row.defaultVehicleType ?? '',
                    memo: row.memo ?? '',
                    active: row.active,
                  })
                }}
              >
                수정
              </Button>
              <Button
                variant="ghost"
                size="sm"
                data-testid={`admin-external-carriers-delete-${externalCarrierTestIdName(row.name)}`}
                onClick={(e) => {
                  e.stopPropagation()
                  if (window.confirm(`"${row.name}" 외부기사/배송사를 삭제하시겠습니까?`)) {
                    deleteMutation.mutate(row.id)
                  }
                }}
              >
                삭제
              </Button>
            </div>
          ) : (
            <span style={{ color: 'var(--color-neutral-500)' }}>조회 전용</span>
          ),
      },
    ],
    [canManage, deleteMutation.mutate],
  )

  const rows = query.data?.content ?? []
  const isSubmitting = createMutation.isPending || updateMutation.isPending

  return (
    <>
      <div style={headerStyle}>
        <h3 style={{ margin: 0 }}>외부기사/배송사</h3>
      </div>
      <p style={descriptionStyle}>
        타배송사 문자와 인쇄 배차의뢰서 발송에 사용할 기사/배송사 연락처입니다.
      </p>

      {canManage ? (
        <div style={{ marginBottom: 16 }}>
          <Button
            variant="primary"
            data-testid="admin-external-carriers-add-button"
            onClick={() => {
              setSubmitError(null)
              setForm({ ...EMPTY_EXTERNAL_CARRIER_FORM })
            }}
          >
            등록
          </Button>
        </div>
      ) : null}

      {query.isError ? (
        <div
          role="alert"
          style={errorStyle}
          data-testid="admin-external-carriers-load-error"
        >
          목록을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.
        </div>
      ) : null}

      <div data-testid="admin-external-carriers-table">
        <DataTable
          columns={columns}
          rows={rows}
          loading={query.isLoading}
          rowKey={(row) => row.id}
          emptyMessage="등록된 외부기사/배송사가 없습니다."
        />
      </div>

      {form ? (
        <div data-testid="admin-external-carriers-form-modal">
          <Modal
            open
            onClose={() => {
              if (!isSubmitting) {
                setForm(null)
                setSubmitError(null)
              }
            }}
            title={form.editing ? '외부기사/배송사 수정' : '외부기사/배송사 등록'}
            description="이름과 전화번호는 타배송사 발송 대상 식별자로 사용됩니다."
            size="md"
            footer={
              <>
                <Button
                  variant="ghost"
                  onClick={() => {
                    setForm(null)
                    setSubmitError(null)
                  }}
                  disabled={isSubmitting}
                >
                  취소
                </Button>
                <Button
                  variant="primary"
                  onClick={handleSubmit}
                  disabled={isSubmitting}
                >
                  {form.editing ? '수정' : '등록'}
                </Button>
              </>
            }
          >
            <form onSubmit={handleSubmit} style={formStyle}>
              <FormField
                label="이름/배송사명"
                required
                render={({ id, ariaDescribedBy }) => (
                  <input
                    id={id}
                    aria-describedby={ariaDescribedBy}
                    type="text"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    maxLength={100}
                    disabled={isSubmitting}
                    data-testid="admin-external-carriers-form-name"
                    style={inputStyle}
                  />
                )}
              />
              <FormField
                label="전화번호"
                required
                render={({ id, ariaDescribedBy }) => (
                  <input
                    id={id}
                    aria-describedby={ariaDescribedBy}
                    type="tel"
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    maxLength={30}
                    disabled={isSubmitting}
                    data-testid="admin-external-carriers-form-phone"
                    style={inputStyle}
                  />
                )}
              />
              <FormField
                label="이메일"
                render={({ id, ariaDescribedBy }) => (
                  <input
                    id={id}
                    aria-describedby={ariaDescribedBy}
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    maxLength={255}
                    disabled={isSubmitting}
                    data-testid="admin-external-carriers-form-email"
                    style={inputStyle}
                  />
                )}
              />
              <FormField
                label="기본차종"
                render={({ id, ariaDescribedBy }) => (
                  <input
                    id={id}
                    aria-describedby={ariaDescribedBy}
                    type="text"
                    value={form.defaultVehicleType}
                    onChange={(e) => setForm({ ...form, defaultVehicleType: e.target.value })}
                    maxLength={50}
                    disabled={isSubmitting}
                    data-testid="admin-external-carriers-form-default-vehicle-type"
                    style={inputStyle}
                  />
                )}
              />
              <label style={checkboxRowStyle}>
                <input
                  type="checkbox"
                  checked={form.active}
                  onChange={(e) => setForm({ ...form, active: e.target.checked })}
                  disabled={isSubmitting}
                  data-testid="admin-external-carriers-form-active"
                />
                활성 (해제 시 발송 대상에서 제외)
              </label>
              <FormField
                label="메모"
                render={({ id, ariaDescribedBy }) => (
                  <textarea
                    id={id}
                    aria-describedby={ariaDescribedBy}
                    value={form.memo}
                    onChange={(e) => setForm({ ...form, memo: e.target.value })}
                    rows={4}
                    disabled={isSubmitting}
                    data-testid="admin-external-carriers-form-memo"
                    style={textareaStyle}
                  />
                )}
              />
              {submitError ? (
                <div role="alert" style={errorStyle}>
                  {submitError}
                </div>
              ) : null}
            </form>
          </Modal>
        </div>
      ) : null}
    </>
  )
}

const headerStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'baseline',
  marginBottom: 8,
}

const descriptionStyle: CSSProperties = {
  marginTop: 0,
  color: '#6B7280',
  fontSize: 13,
}

const formStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
}

const inputStyle: CSSProperties = {
  width: '100%',
  height: 32,
  padding: '0 10px',
  border: '1px solid #D1D5DB',
  borderRadius: 6,
  fontSize: 13,
  boxSizing: 'border-box',
}

const textareaStyle: CSSProperties = {
  ...inputStyle,
  height: 'auto',
  minHeight: 80,
  paddingTop: 8,
  paddingBottom: 8,
  fontFamily: 'inherit',
  resize: 'vertical',
}

const checkboxRowStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
  fontSize: 13,
}

const errorStyle: CSSProperties = {
  padding: 8,
  borderRadius: 4,
  background: '#FEE2E2',
  color: '#991B1B',
  fontSize: 13,
}

function nullableText(value: string): string | null {
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

function extractErrorMessage(err: unknown): string {
  if (typeof err === 'object' && err !== null) {
    const anyErr = err as {
      response?: { data?: { message?: string } }
      message?: string
    }
    const beMsg = anyErr.response?.data?.message
    if (beMsg) return beMsg
    if (anyErr.message) return anyErr.message
  }
  return '요청 처리 중 오류가 발생했습니다.'
}
