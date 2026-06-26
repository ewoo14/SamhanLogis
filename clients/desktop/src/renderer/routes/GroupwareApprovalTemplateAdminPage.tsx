/**
 * 그룹웨어 결재유형 관리 — `/groupware/approval-templates`.
 *
 * 템플릿 UUID 는 DataTable key/API path 전용이다. 화면에는 code/name/field label 만 노출한다.
 */
import { useEffect, useMemo, useState } from 'react'
import { isAxiosError } from 'axios'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Badge,
  Button,
  Card,
  DataTable,
  FormField,
  Input,
  Select,
  Spinner,
  type DataTableColumn,
} from '@samhan/design-system'
import {
  APPROVAL_FIELD_TYPE_LABEL,
  createApprovalTemplate,
  deleteApprovalTemplate,
  listApprovalTemplates,
  updateApprovalTemplate,
  type ApprovalFieldType,
  type ApprovalTemplate,
  type ApprovalTemplateInput,
} from '../api/groupwareApprovalTemplate'
import { usePageTitle } from '../hooks/usePageTitle'
import { usePermissions } from '../hooks/usePermissions'

interface TemplateFieldDraft {
  fieldKey: string
  label: string
  fieldType: ApprovalFieldType
  required: boolean
  displayOrder: number
  optionsText: string
  placeholder: string
}

interface TemplateDraft {
  code: string
  name: string
  description: string
  active: boolean
  displayOrder: number
  fields: TemplateFieldDraft[]
}

const FIELD_TYPES: ApprovalFieldType[] = ['TEXT', 'NUMBER', 'DATE', 'SELECT', 'TEXTAREA']

function emptyFieldDraft(index: number): TemplateFieldDraft {
  return {
    fieldKey: '',
    label: '',
    fieldType: 'TEXT',
    required: false,
    displayOrder: index + 1,
    optionsText: '',
    placeholder: '',
  }
}

function emptyDraft(): TemplateDraft {
  return {
    code: '',
    name: '',
    description: '',
    active: true,
    displayOrder: 100,
    fields: [emptyFieldDraft(0)],
  }
}

function draftFromTemplate(template: ApprovalTemplate): TemplateDraft {
  return {
    code: template.code,
    name: template.name,
    description: template.description ?? '',
    active: template.active,
    displayOrder: template.displayOrder,
    fields: template.fields.map((field) => ({
      fieldKey: field.fieldKey,
      label: field.label,
      fieldType: field.fieldType,
      required: field.required,
      displayOrder: field.displayOrder,
      optionsText: field.options.join(', '),
      placeholder: field.placeholder ?? '',
    })),
  }
}

function draftToInput(draft: TemplateDraft): ApprovalTemplateInput {
  return {
    code: draft.code,
    name: draft.name,
    description: draft.description,
    active: draft.active,
    displayOrder: draft.displayOrder,
    fields: draft.fields.map((field, index) => ({
      fieldKey: field.fieldKey,
      label: field.label,
      fieldType: field.fieldType,
      required: field.required,
      displayOrder: Number.isFinite(field.displayOrder) ? field.displayOrder : index + 1,
      options: field.optionsText
        .split(',')
        .map((option) => option.trim())
        .filter((option) => option.length > 0),
      placeholder: field.placeholder,
    })),
  }
}

function serverErrorMessage(error: unknown): string {
  if (!isAxiosError(error)) return '처리에 실패했습니다.'
  const data = error.response?.data as { message?: unknown } | undefined
  return typeof data?.message === 'string' && data.message.trim()
    ? data.message.trim()
    : '처리에 실패했습니다.'
}

export function GroupwareApprovalTemplateAdminPage() {
  const queryClient = useQueryClient()
  const { canAccess } = usePermissions()
  const [selectedTemplate, setSelectedTemplate] = useState<ApprovalTemplate | null>(null)
  const [draft, setDraft] = useState<TemplateDraft>(() => emptyDraft())
  const [notice, setNotice] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  usePageTitle('결재 양식')

  const canWrite = canAccess('groupware.approval-templates', 'update')

  const templatesQuery = useQuery({
    queryKey: ['groupwareApprovalTemplates'],
    queryFn: listApprovalTemplates,
  })

  useEffect(() => {
    if (!selectedTemplate) return
    setDraft(draftFromTemplate(selectedTemplate))
  }, [selectedTemplate])

  const saveMutation = useMutation({
    mutationFn: () => {
      const input = draftToInput(draft)
      return selectedTemplate
        ? updateApprovalTemplate(selectedTemplate.id, input)
        : createApprovalTemplate(input)
    },
    onSuccess: (saved) => {
      setSelectedTemplate(saved)
      setDraft(draftFromTemplate(saved))
      setNotice('결재 양식을 저장했습니다.')
      setErrorMessage(null)
      void queryClient.invalidateQueries({ queryKey: ['groupwareApprovalTemplates'] })
      void queryClient.invalidateQueries({ queryKey: ['groupwareApprovalTemplates', 'active'] })
    },
    onError: (error) => {
      setNotice(null)
      setErrorMessage(serverErrorMessage(error))
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (template: ApprovalTemplate) => deleteApprovalTemplate(template.id),
    onSuccess: () => {
      setSelectedTemplate(null)
      setDraft(emptyDraft())
      setNotice('결재 양식을 삭제했습니다.')
      setErrorMessage(null)
      void queryClient.invalidateQueries({ queryKey: ['groupwareApprovalTemplates'] })
      void queryClient.invalidateQueries({ queryKey: ['groupwareApprovalTemplates', 'active'] })
    },
    onError: (error) => {
      setNotice(null)
      setErrorMessage(serverErrorMessage(error))
    },
  })

  const rows = Array.isArray(templatesQuery.data) ? templatesQuery.data : []

  const columns: DataTableColumn<ApprovalTemplate>[] = useMemo(() => [
    {
      key: 'code',
      header: '코드',
      width: '180px',
      render: (row) => <strong>{row.code}</strong>,
    },
    {
      key: 'name',
      header: '양식명',
      render: (row) => row.name,
    },
    {
      key: 'active',
      header: '상태',
      width: '90px',
      render: (row) => (
        <Badge variant={row.active ? 'success' : 'neutral'}>
          {row.active ? '활성' : '비활성'}
        </Badge>
      ),
    },
    {
      key: 'fieldCount',
      header: '필드',
      width: '80px',
      align: 'right',
      render: (row) => row.fields.length,
    },
  ], [])

  const updateField = (index: number, patch: Partial<TemplateFieldDraft>) => {
    setDraft((current) => ({
      ...current,
      fields: current.fields.map((field, fieldIndex) =>
        fieldIndex === index ? { ...field, ...patch } : field,
      ),
    }))
  }

  const addField = () => {
    setDraft((current) => ({
      ...current,
      fields: [...current.fields, emptyFieldDraft(current.fields.length)],
    }))
  }

  const removeField = (index: number) => {
    setDraft((current) => ({
      ...current,
      fields: current.fields.filter((_, fieldIndex) => fieldIndex !== index),
    }))
  }

  const startCreate = () => {
    setSelectedTemplate(null)
    setDraft(emptyDraft())
    setNotice(null)
    setErrorMessage(null)
  }

  const handleDelete = () => {
    if (!selectedTemplate) return
    if (!window.confirm(`${selectedTemplate.name} 양식을 삭제할까요?`)) return
    deleteMutation.mutate(selectedTemplate)
  }

  const invalid = !draft.code.trim()
    || !draft.name.trim()
    || draft.fields.length === 0
    || draft.fields.some((field) =>
      !field.fieldKey.trim()
      || !field.label.trim()
      || (field.fieldType === 'SELECT' && field.optionsText.split(',').filter((option) => option.trim()).length === 0),
    )

  if (templatesQuery.isLoading) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', minHeight: 220 }}>
        <Spinner size="lg" label="결재 양식 불러오는 중" />
      </div>
    )
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(360px, 0.9fr) minmax(520px, 1.1fr)', gap: 16 }}>
      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', marginBottom: 12 }}>
          <div>
            <h3 style={{ margin: 0 }}>결재 양식</h3>
            <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--color-neutral-500)' }}>
              전체 {rows.length}건
            </p>
          </div>
          {canWrite ? (
            <Button type="button" variant="primary" size="sm" onClick={startCreate}>
              신규
            </Button>
          ) : null}
        </div>

        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(row) => row.id}
          onRowClick={(row) => setSelectedTemplate(row)}
          emptyMessage="등록된 결재 양식이 없습니다."
        />
        {templatesQuery.isError ? (
          <p role="alert" style={{ color: 'var(--color-danger-700)', fontSize: 13 }}>
            결재 양식을 불러오지 못했습니다.
          </p>
        ) : null}
      </Card>

      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', marginBottom: 12 }}>
          <h3 style={{ margin: 0 }}>{selectedTemplate ? '양식 수정' : '양식 생성'}</h3>
          {selectedTemplate ? (
            <Badge variant="brand">{selectedTemplate.name}</Badge>
          ) : null}
        </div>

        <fieldset disabled={!canWrite || saveMutation.isPending || deleteMutation.isPending} style={{ border: 0, padding: 0, margin: 0 }}>
          <div className="mobile-form-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Input
              label="코드"
              required
              value={draft.code}
              onChange={(event) => setDraft((current) => ({ ...current, code: event.target.value }))}
              placeholder="EXPENSE_REPORT"
              inputSize="sm"
            />
            <Input
              label="양식명"
              required
              value={draft.name}
              onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
              placeholder="지출결의서"
              inputSize="sm"
            />
            <Input
              label="정렬"
              type="number"
              value={draft.displayOrder}
              onChange={(event) => setDraft((current) => ({ ...current, displayOrder: Number(event.target.value) }))}
              inputSize="sm"
            />
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600, paddingTop: 20 }}>
              <input
                type="checkbox"
                checked={draft.active}
                onChange={(event) => setDraft((current) => ({ ...current, active: event.target.checked }))}
              />
              활성
            </label>
          </div>

          <FormField
            label="설명"
            render={({ id, ariaDescribedBy }) => (
              <textarea
                id={id}
                value={draft.description}
                onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))}
                rows={2}
                aria-describedby={ariaDescribedBy}
                style={{
                  width: '100%',
                  resize: 'vertical',
                  padding: '8px 10px',
                  border: '1px solid var(--color-neutral-300)',
                  borderRadius: 4,
                  font: 'inherit',
                }}
              />
            )}
          />

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '14px 0 8px' }}>
            <h4 style={{ margin: 0, fontSize: 14 }}>필드 빌더</h4>
            <Button type="button" variant="secondary" size="sm" onClick={addField}>
              필드 추가
            </Button>
          </div>

          <div style={{ display: 'grid', gap: 8 }}>
            {draft.fields.map((field, index) => (
              <div
                className="mobile-form-grid"
                key={`field-row-${index}`}
                style={{
                  display: 'grid',
                  // 키/라벨에 충분한 최소폭 부여(잘림 방지) + 좁은 화면 자동 줄바꿈.
                  gridTemplateColumns: 'minmax(140px, 1.4fr) minmax(150px, 1.6fr) 120px 64px 72px minmax(140px, 1.2fr) 56px',
                  gap: 8,
                  alignItems: 'end',
                  padding: 8,
                  border: '1px solid var(--color-neutral-200)',
                  borderRadius: 6,
                }}
              >
                <Input
                  label="키"
                  value={field.fieldKey}
                  onChange={(event) => updateField(index, { fieldKey: event.target.value })}
                  inputSize="sm"
                />
                <Input
                  label="라벨"
                  value={field.label}
                  onChange={(event) => updateField(index, { label: event.target.value })}
                  inputSize="sm"
                />
                <Select
                  label="타입"
                  selectSize="sm"
                  value={field.fieldType}
                  onChange={(event) => updateField(index, { fieldType: event.target.value as ApprovalFieldType })}
                >
                  {FIELD_TYPES.map((type) => (
                    <option key={type} value={type}>{APPROVAL_FIELD_TYPE_LABEL[type]}</option>
                  ))}
                </Select>
                <Input
                  label="순서"
                  type="number"
                  value={field.displayOrder}
                  onChange={(event) => updateField(index, { displayOrder: Number(event.target.value) })}
                  inputSize="sm"
                />
                <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12, fontWeight: 600, minHeight: 32 }}>
                  <input
                    type="checkbox"
                    checked={field.required}
                    onChange={(event) => updateField(index, { required: event.target.checked })}
                  />
                  필수
                </label>
                {field.fieldType === 'SELECT' ? (
                  <Input
                    label="옵션"
                    value={field.optionsText}
                    onChange={(event) => updateField(index, { optionsText: event.target.value })}
                    placeholder="연차, 반차"
                    inputSize="sm"
                  />
                ) : (
                  <Input
                    label="placeholder"
                    value={field.placeholder}
                    onChange={(event) => updateField(index, { placeholder: event.target.value })}
                    inputSize="sm"
                  />
                )}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={draft.fields.length <= 1}
                  onClick={() => removeField(index)}
                >
                  삭제
                </Button>
              </div>
            ))}
          </div>
        </fieldset>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginTop: 14 }}>
          <div>
            {notice ? <p role="status" style={{ margin: 0, color: 'var(--color-success-700)', fontSize: 13 }}>{notice}</p> : null}
            {errorMessage ? <p role="alert" style={{ margin: 0, color: 'var(--color-danger-700)', fontSize: 13 }}>{errorMessage}</p> : null}
            {!canWrite ? <p style={{ margin: 0, color: 'var(--color-neutral-500)', fontSize: 13 }}>수정 권한이 없습니다.</p> : null}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {selectedTemplate && canWrite ? (
              <Button type="button" variant="danger" size="sm" onClick={handleDelete} disabled={deleteMutation.isPending}>
                삭제
              </Button>
            ) : null}
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={() => saveMutation.mutate()}
              disabled={!canWrite || invalid || saveMutation.isPending}
              loading={saveMutation.isPending}
            >
              저장
            </Button>
          </div>
        </div>
      </Card>
    </div>
  )
}
