/**
 * 그룹웨어 결재 작성 — `/groupware/approvals/new`.
 *
 * 생성 본문은 ApprovalLineCreateRequest 계약(templateId/fieldValues/title/content/approverIds)과
 * 일치한다. 첨부는 결재 생성 후 전용 endpoint 로 순차 등록한다.
 */
import { useMemo, useState } from 'react'
import { isAxiosError } from 'axios'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Button, Card, FormField, Input, Select, Spinner } from '@samhan/design-system'
import { createGroupwareApproval } from '../api/groupwareApproval'
import {
  addApprovalAttachmentReference,
  uploadApprovalAttachmentFile,
  type ApprovalAttachmentReferenceInput,
} from '../api/groupwareApprovalAttachment'
import {
  listActiveApprovalTemplates,
  type ApprovalTemplate,
} from '../api/groupwareApprovalTemplate'
import { DynamicApprovalFieldInput } from '../components/groupware/DynamicApprovalFieldInput'
import { SlipReferencePicker } from '../components/groupware/SlipReferencePicker'
import { usePageTitle } from '../hooks/usePageTitle'
import { usePermissions } from '../hooks/usePermissions'

interface ReferenceDraft {
  type: 'SLIP_REF' | 'PARTNER_LEDGER_REF'
  label: string
  refSlipNo: string
  refSlipType: string
  refPartnerCode: string
  refPartnerName: string
  refPeriod: string
}

interface FileDraft {
  file: File
  label: string
}

function serverErrorMessage(error: unknown): string {
  if (!isAxiosError(error)) return error instanceof Error ? error.message : '결재 생성에 실패했습니다.'
  const data = error.response?.data as { message?: unknown } | undefined
  return typeof data?.message === 'string' && data.message.trim()
    ? data.message.trim()
    : '결재 생성에 실패했습니다.'
}

function parseApproverIds(value: string): string[] {
  return value
    .split(/[\n,]+/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
}

function buildReferenceInput(draft: ReferenceDraft, displayOrder: number): ApprovalAttachmentReferenceInput {
  if (draft.type === 'SLIP_REF') {
    return {
      attachmentType: 'SLIP_REF',
      label: draft.label || '전표 참조',
      displayOrder,
      refSlipNo: draft.refSlipNo,
      refSlipType: draft.refSlipType,
    }
  }
  return {
    attachmentType: 'PARTNER_LEDGER_REF',
    label: draft.label || '거래처원장 참조',
    displayOrder,
    refPartnerCode: draft.refPartnerCode,
    refPartnerName: draft.refPartnerName,
    refPeriod: draft.refPeriod,
  }
}

function emptyReferenceDraft(type: ReferenceDraft['type']): ReferenceDraft {
  return {
    type,
    label: '',
    refSlipNo: '',
    refSlipType: '',
    refPartnerCode: '',
    refPartnerName: '',
    refPeriod: new Date().toISOString().slice(0, 7),
  }
}

export function GroupwareApprovalCreatePage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { canAccess } = usePermissions()
  const [templateId, setTemplateId] = useState('')
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [approverInput, setApproverInput] = useState('')
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({})
  const [references, setReferences] = useState<ReferenceDraft[]>([])
  const [files, setFiles] = useState<FileDraft[]>([])
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  usePageTitle('결재 작성')

  const canWrite = canAccess('groupware.approvals', 'update')

  const templatesQuery = useQuery({
    queryKey: ['groupwareApprovalTemplates', 'active'],
    queryFn: listActiveApprovalTemplates,
  })

  const templates = Array.isArray(templatesQuery.data) ? templatesQuery.data : []
  const selectedTemplate: ApprovalTemplate | undefined = templates.find((template) => template.id === templateId)
  const sortedFields = useMemo(
    () => selectedTemplate ? [...selectedTemplate.fields].sort((a, b) => a.displayOrder - b.displayOrder) : [],
    [selectedTemplate],
  )

  const approverIds = parseApproverIds(approverInput)
  const missingRequired = sortedFields.some((field) =>
    field.required && !(fieldValues[field.fieldKey] ?? '').trim(),
  )
  const invalidReferences = references.some((ref) =>
    ref.type === 'SLIP_REF' && (!ref.refSlipNo.trim() || !ref.refSlipType.trim()),
  )
  const invalid = !canWrite || !templateId || !title.trim() || approverIds.length === 0 || missingRequired || invalidReferences

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!selectedTemplate) throw new Error('결재 유형을 선택하세요.')
      const auth = await window.samhanAuth.getToken()
      if (!auth?.userId) throw new Error('현재 사용자 정보를 확인할 수 없습니다.')
      const created = await createGroupwareApproval({
        requesterId: auth.userId,
        title: title.trim(),
        content: content.trim() || null,
        approverIds,
        templateId: selectedTemplate.id,
        fieldValues,
      })
      let displayOrder = 1
      for (const ref of references) {
        await addApprovalAttachmentReference(created.approvalId, buildReferenceInput(ref, displayOrder))
        displayOrder += 1
      }
      for (const fileDraft of files) {
        await uploadApprovalAttachmentFile(created.approvalId, fileDraft.file, fileDraft.label, displayOrder)
        displayOrder += 1
      }
      return created
    },
    onSuccess: (created) => {
      setErrorMessage(null)
      void queryClient.invalidateQueries({ queryKey: ['groupwareApprovals'] })
      navigate(`/groupware/approvals/${created.approvalId}`)
    },
    onError: (error) => setErrorMessage(serverErrorMessage(error)),
  })

  const addReference = (type: ReferenceDraft['type']) => {
    setReferences((current) => [...current, emptyReferenceDraft(type)])
  }

  const updateReference = (index: number, patch: Partial<ReferenceDraft>) => {
    setReferences((current) =>
      current.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item),
    )
  }

  const removeReference = (index: number) => {
    setReferences((current) => current.filter((_, itemIndex) => itemIndex !== index))
  }

  if (templatesQuery.isLoading) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', minHeight: 220 }}>
        <Spinner size="lg" label="결재 유형 불러오는 중" />
      </div>
    )
  }

  return (
    <Card>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', marginBottom: 16 }}>
        <div>
          <h3 style={{ margin: 0 }}>결재 작성</h3>
          <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--color-neutral-500)' }}>
            유형 선택 후 세부 필드와 결재선을 입력합니다.
          </p>
        </div>
        <Button type="button" variant="ghost" onClick={() => navigate('/groupware/approvals')}>
          목록
        </Button>
      </div>

      <fieldset disabled={!canWrite || createMutation.isPending} style={{ border: 0, padding: 0, margin: 0 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 1fr) minmax(360px, 1fr)', gap: 16 }}>
          <section style={{ display: 'grid', gap: 12 }}>
            <Select
              label="결재 유형"
              required
              value={templateId}
              onChange={(event) => {
                setTemplateId(event.target.value)
                setFieldValues({})
              }}
              data-testid="groupware-approval-create-template"
            >
              <option value="">유형 선택</option>
              {templates.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name}
                </option>
              ))}
            </Select>

            <Input
              label="제목"
              required
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={200}
              data-testid="groupware-approval-create-title"
            />

            <FormField
              label="본문"
              render={({ id, ariaDescribedBy }) => (
                <textarea
                  id={id}
                  value={content}
                  onChange={(event) => setContent(event.target.value)}
                  maxLength={2000}
                  rows={5}
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

            <FormField
              label="결재선"
              required
              hint="결재자 식별자를 줄바꿈 또는 쉼표로 구분해 입력합니다."
              render={({ id, ariaDescribedBy }) => (
                <textarea
                  id={id}
                  value={approverInput}
                  onChange={(event) => setApproverInput(event.target.value)}
                  rows={3}
                  aria-describedby={ariaDescribedBy}
                  data-testid="groupware-approval-create-approvers"
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
          </section>

          <section style={{ display: 'grid', gap: 12, alignContent: 'start' }}>
            <h4 style={{ margin: 0, fontSize: 14 }}>세부 필드</h4>
            {selectedTemplate ? (
              sortedFields.map((field) => (
                <DynamicApprovalFieldInput
                  key={field.fieldKey}
                  field={field}
                  value={fieldValues[field.fieldKey] ?? ''}
                  onChange={(value) => setFieldValues((current) => ({ ...current, [field.fieldKey]: value }))}
                />
              ))
            ) : (
              <p style={{ margin: 0, color: 'var(--color-neutral-500)', fontSize: 13 }}>
                결재 유형을 먼저 선택하세요.
              </p>
            )}
          </section>
        </div>

        <section style={{ marginTop: 18 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
            <h4 style={{ margin: 0, fontSize: 14 }}>첨부</h4>
            <div style={{ display: 'flex', gap: 8 }}>
              <Button type="button" variant="secondary" size="sm" onClick={() => addReference('SLIP_REF')}>
                전표 참조
              </Button>
              <Button type="button" variant="secondary" size="sm" onClick={() => addReference('PARTNER_LEDGER_REF')}>
                거래처원장 참조
              </Button>
            </div>
          </div>

          <div style={{ display: 'grid', gap: 8 }}>
            {references.map((ref, index) => (
              <div
                key={`${ref.type}-${index}`}
                style={{
                  display: 'grid',
                  gridTemplateColumns: ref.type === 'SLIP_REF'
                    ? '1fr 1fr 1fr 72px'
                    : '1fr 1fr 1fr 1fr 72px',
                  gap: 8,
                  alignItems: 'end',
                  padding: 8,
                  border: '1px solid var(--color-neutral-200)',
                  borderRadius: 6,
                }}
              >
                <Input
                  label="라벨"
                  value={ref.label}
                  onChange={(event) => updateReference(index, { label: event.target.value })}
                  inputSize="sm"
                />
                {ref.type === 'SLIP_REF' ? (
                  <SlipReferencePicker
                    slipNo={ref.refSlipNo}
                    refSlipType={ref.refSlipType}
                    onChange={(next) => updateReference(index, next)}
                    inputSize="sm"
                    style={{ gridColumn: 'span 2' }}
                  />
                ) : (
                  <>
                    <Input
                      label="거래처코드"
                      value={ref.refPartnerCode}
                      onChange={(event) => updateReference(index, { refPartnerCode: event.target.value })}
                      inputSize="sm"
                    />
                    <Input
                      label="거래처명"
                      value={ref.refPartnerName}
                      onChange={(event) => updateReference(index, { refPartnerName: event.target.value })}
                      inputSize="sm"
                    />
                    <Input
                      label="기간"
                      type="month"
                      value={ref.refPeriod}
                      onChange={(event) => updateReference(index, { refPeriod: event.target.value })}
                      inputSize="sm"
                    />
                  </>
                )}
                <Button type="button" variant="ghost" size="sm" onClick={() => removeReference(index)}>
                  삭제
                </Button>
              </div>
            ))}
          </div>

          <FormField
            label="파일"
            hint={files.length > 0 ? `${files.length}개 선택됨` : '사진/PDF 등 파일을 선택합니다.'}
            render={({ id, ariaDescribedBy }) => (
              <input
                id={id}
                type="file"
                multiple
                aria-describedby={ariaDescribedBy}
                onChange={(event) => {
                  const selected = Array.from(event.target.files ?? []).map((file) => ({ file, label: file.name }))
                  setFiles(selected)
                }}
              />
            )}
          />
        </section>
      </fieldset>

      {templatesQuery.isError ? (
        <p role="alert" style={{ color: 'var(--color-danger-700)', fontSize: 13 }}>
          결재 유형 목록을 불러오지 못했습니다.
        </p>
      ) : null}
      {errorMessage ? (
        <p role="alert" style={{ color: 'var(--color-danger-700)', fontSize: 13 }}>{errorMessage}</p>
      ) : null}
      {!canWrite ? (
        <p style={{ color: 'var(--color-neutral-500)', fontSize: 13 }}>결재 작성 권한이 없습니다.</p>
      ) : null}

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
        <Button type="button" variant="ghost" onClick={() => navigate('/groupware/approvals')} disabled={createMutation.isPending}>
          취소
        </Button>
        <Button
          type="button"
          variant="primary"
          onClick={() => createMutation.mutate()}
          disabled={invalid || createMutation.isPending}
          loading={createMutation.isPending}
          data-testid="groupware-approval-create-submit"
        >
          생성
        </Button>
      </div>
    </Card>
  )
}
