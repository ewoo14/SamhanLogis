/**
 * 그룹웨어 결재 작성 — `/groupware/approvals/new`.
 *
 * 생성 본문은 ApprovalLineCreateRequest 계약(templateId/fieldValues/title/content/approverIds)과
 * 일치한다. 첨부는 결재 생성 후 전용 endpoint 로 순차 등록한다.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { isAxiosError } from 'axios'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { AsyncAutocomplete, Button, Card, FormField, Input, Select, Spinner, TagChip } from '@samhan/design-system'
import { createGroupwareApproval } from '../api/groupwareApproval'
import {
  searchApprovers,
  type ApproverOption,
} from '../api/groupwareApprovalApprover'
import {
  addApprovalAttachmentReference,
  uploadApprovalAttachmentFile,
  type ApprovalAttachmentReferenceInput,
} from '../api/groupwareApprovalAttachment'
import {
  APPROVAL_REFERENCE_DOC_TYPE_LABEL,
  type ApprovalReferenceDocType,
} from '../api/documentReferenceSearch'
import {
  listActiveApprovalTemplates,
  type ApprovalTemplate,
} from '../api/groupwareApprovalTemplate'
import {
  fetchDefaultApprovers,
  type ApprovalLineDefaultApprover,
} from '../api/approvalLineConfigApi'
import { DynamicApprovalFieldInput } from '../components/groupware/DynamicApprovalFieldInput'
import { DocumentReferencePicker, type DocumentReferenceValue } from '../components/groupware/DocumentReferencePicker'
import { usePageTitle } from '../hooks/usePageTitle'
import { usePermissions } from '../hooks/usePermissions'
import { getAuthProvider } from '../auth/authProvider'

type ReferenceDraft = DocumentReferenceValue

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

function buildReferenceInput(draft: ReferenceDraft, displayOrder: number): ApprovalAttachmentReferenceInput {
  const label = APPROVAL_REFERENCE_DOC_TYPE_LABEL[draft.refDocType]
  const refSlipType = draft.refDocType === 'OUTBOUND_SLIP'
    ? 'SLIP_OUTBOUND'
    : draft.refDocType === 'INBOUND_SLIP'
      ? 'SLIP_INBOUND'
      : null
  if (draft.refDocType === 'PARTNER_LEDGER') {
    return {
      attachmentType: 'PARTNER_LEDGER_REF',
      label,
      displayOrder,
      refDocType: draft.refDocType,
      refDocNo: null,
      refDocLabel: draft.refDocLabel,
      refPartnerCode: draft.refPartnerCode,
      refPartnerName: draft.refPartnerName,
      refPeriod: draft.refPeriod,
    }
  }
  return {
    attachmentType: 'SLIP_REF',
    label,
    displayOrder,
    refDocType: draft.refDocType,
    refDocNo: draft.refDocNo,
    refDocLabel: draft.refDocLabel,
    refSlipNo: refSlipType ? draft.refDocNo : null,
    refSlipType,
  }
}

function emptyReferenceDraft(type: ApprovalReferenceDocType = 'OUTBOUND_SLIP'): ReferenceDraft {
  return {
    refDocType: type,
    refDocNo: null,
    refDocLabel: null,
    refPartnerCode: null,
    refPartnerName: null,
    refPeriod: new Date().toISOString().slice(0, 7),
  }
}

function approverLabel(approver: ApproverOption): string {
  return approver.department ? `${approver.name} (${approver.department})` : approver.name
}

export function mapDefaultApproversToApproverOptions(defaultApprovers: ApprovalLineDefaultApprover[]): ApproverOption[] {
  return [...defaultApprovers]
    .sort((a, b) => a.sequence - b.sequence)
    .map((approver) => ({
      userId: approver.userId,
      name: approver.displayName,
      department: null,
    }))
}

export async function loadDefaultApproverOptions(
  templateCode: string | null | undefined,
  fetcher: (documentType: string) => Promise<ApprovalLineDefaultApprover[]> = fetchDefaultApprovers,
): Promise<ApproverOption[]> {
  if (!templateCode) return []
  try {
    const defaultApprovers = await fetcher(`GROUPWARE_${templateCode}`)
    return mapDefaultApproversToApproverOptions(defaultApprovers)
  } catch {
    return []
  }
}

export function shouldApplyDefaultApproverPrefill(
  capturedEditVersion: number,
  currentEditVersion: number,
  cancelled: boolean,
): boolean {
  return !cancelled && capturedEditVersion === currentEditVersion
}

export function addApproverOption(current: ApproverOption[], item: ApproverOption): ApproverOption[] {
  return current.some((approver) => approver.userId === item.userId)
    ? current
    : [...current, item]
}

export function removeApproverAt(current: ApproverOption[], index: number): ApproverOption[] {
  return current.filter((_, itemIndex) => itemIndex !== index)
}

function referenceChipValue(ref: ReferenceDraft): string {
  return ref.refDocNo ?? ref.refPartnerName ?? ref.refDocLabel ?? '(미입력)'
}

function hasReferenceChipValue(ref: ReferenceDraft): boolean {
  return Boolean(ref.refDocNo ?? ref.refPartnerName ?? ref.refDocLabel)
}

export function GroupwareApprovalCreatePage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { canAccess } = usePermissions()
  const [templateId, setTemplateId] = useState('')
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [approvers, setApprovers] = useState<ApproverOption[]>([])
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({})
  const [references, setReferences] = useState<ReferenceDraft[]>([])
  const [files, setFiles] = useState<FileDraft[]>([])
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const approverEditVersionRef = useRef(0)

  usePageTitle('결재 작성')

  const canWrite = canAccess('groupware.approvals', 'update')

  const templatesQuery = useQuery({
    queryKey: ['groupwareApprovalTemplates', 'active'],
    queryFn: listActiveApprovalTemplates,
  })

  const templates = Array.isArray(templatesQuery.data) ? templatesQuery.data : []
  const selectedTemplate: ApprovalTemplate | undefined = templates.find((template) => template.id === templateId)
  const selectedTemplateCode = selectedTemplate?.code ?? ''
  const sortedFields = useMemo(
    () => selectedTemplate ? [...selectedTemplate.fields].sort((a, b) => a.displayOrder - b.displayOrder) : [],
    [selectedTemplate],
  )

  useEffect(() => {
    let cancelled = false
    const capturedEditVersion = approverEditVersionRef.current
    setApprovers([])
    void loadDefaultApproverOptions(selectedTemplateCode).then((defaultApprovers) => {
      if (shouldApplyDefaultApproverPrefill(
        capturedEditVersion,
        approverEditVersionRef.current,
        cancelled,
      )) {
        setApprovers(defaultApprovers)
      }
    })
    return () => {
      cancelled = true
    }
  }, [selectedTemplateCode])

  const approverIds = approvers.map((approver) => approver.userId)
  const missingRequired = sortedFields.some((field) =>
    field.required && !(fieldValues[field.fieldKey] ?? '').trim(),
  )
  const invalidReferences = references.some((ref) =>
    ref.refDocType === 'PARTNER_LEDGER'
      ? !ref.refPartnerCode?.trim() || !ref.refPartnerName?.trim() || !ref.refPeriod?.trim()
      : !ref.refDocNo?.trim(),
  )
  const invalid = !canWrite || !templateId || !title.trim() || approverIds.length === 0 || missingRequired || invalidReferences

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!selectedTemplate) throw new Error('결재 유형을 선택하세요.')
      const auth = await getAuthProvider().getSession()
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

  const addReference = () => {
    setReferences((current) => [...current, emptyReferenceDraft()])
  }

  const updateReference = (index: number, patch: Partial<ReferenceDraft>) => {
    setReferences((current) =>
      current.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item),
    )
  }

  const removeReference = (index: number) => {
    setReferences((current) => current.filter((_, itemIndex) => itemIndex !== index))
  }

  const removeFile = (index: number) => {
    setFiles((current) => current.filter((_, itemIndex) => itemIndex !== index))
  }

  const addApprover = (item: ApproverOption | null) => {
    if (!item) return
    approverEditVersionRef.current += 1
    setApprovers((current) => addApproverOption(current, item))
  }

  const removeApprover = (index: number) => {
    approverEditVersionRef.current += 1
    setApprovers((current) => removeApproverAt(current, index))
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
        <div
          className="mobile-form-grid"
          style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 1fr) minmax(360px, 1fr)', gap: 16 }}
        >
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

            <div data-testid="groupware-approval-create-approvers" style={{ display: 'grid', gap: 8 }}>
              <AsyncAutocomplete<ApproverOption>
                value={null}
                onChange={addApprover}
                search={searchApprovers}
                getKey={(option) => option.userId}
                getInputLabel={(option) => option.name}
                renderOption={(option) => (
                  <span>
                    {option.name}
                    {option.department ? (
                      <span style={{ color: 'var(--color-neutral-500)', marginLeft: 6 }}>
                        {option.department}
                      </span>
                    ) : null}
                  </span>
                )}
                listboxLabel="결재자 검색 결과"
                label="결재선"
                ariaLabel="결재자 이름 검색"
                inputTestId="approver-search-input"
                placeholder="결재자 이름 검색"
                minChars={2}
                required
              />
              <p style={{ margin: 0, fontSize: 12, color: 'var(--color-neutral-500)' }}>
                사원 이름을 검색해 결재 순서대로 추가합니다.
              </p>
              {approvers.length > 0 ? (
                <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                  {approvers.map((approver, index) => (
                    <TagChip
                      key={`${approver.userId}-${index}`}
                      label={String(index + 1)}
                      value={approverLabel(approver)}
                      removeLabel={approverLabel(approver)}
                      onRemove={() => removeApprover(index)}
                      data-testid="approver-chip"
                    />
                  ))}
                </div>
              ) : null}
            </div>
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
              <Button type="button" variant="secondary" size="sm" onClick={addReference}>
                문서 참조 추가
              </Button>
            </div>
          </div>

          <div style={{ display: 'grid', gap: 8 }}>
            {references.map((ref, index) =>
              hasReferenceChipValue(ref) ? null : (
                <div
                  key={`${ref.refDocType}-${index}`}
                  className="mobile-form-grid"
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'minmax(420px, 1fr)',
                    gap: 8,
                    alignItems: 'end',
                    padding: 8,
                    border: '1px solid var(--color-neutral-200)',
                    borderRadius: 6,
                  }}
                >
                  <DocumentReferencePicker
                    value={ref}
                    onChange={(next) => updateReference(index, next)}
                    inputSize="sm"
                  />
                </div>
              ),
            )}
          </div>

          {references.some(hasReferenceChipValue) || files.length > 0 ? (
            <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap', margin: '10px 0' }}>
              {references.map((ref, index) =>
                hasReferenceChipValue(ref) ? (
                  <TagChip
                    key={`${ref.refDocType}-${index}-chip`}
                    label={APPROVAL_REFERENCE_DOC_TYPE_LABEL[ref.refDocType]}
                    value={referenceChipValue(ref)}
                    onRemove={() => removeReference(index)}
                    data-testid="attachment-chip"
                  />
                ) : null,
              )}
              {files.map((fileDraft, index) => (
                <TagChip
                  key={`${fileDraft.file.name}-${fileDraft.file.lastModified}-${index}`}
                  label="파일"
                  value={fileDraft.file.name}
                  onRemove={() => removeFile(index)}
                  data-testid="attachment-chip"
                />
              ))}
            </div>
          ) : null}

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
                  setFiles((current) => [...current, ...selected])
                  event.currentTarget.value = ''
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
