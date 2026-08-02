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
import { Button, Card, FormField, Input, MultiSelectAutocomplete, Select, Spinner, TagChip } from '@samhan/design-system'
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
  fetchApprovalLineStructure,
  fetchDefaultApprovers,
  STEP_TYPE_LABEL,
  type ApprovalLineDefaultApprover,
  type ApprovalLineStructure,
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

export function buildGroupwareApprovalDocumentType(templateCode: string | null | undefined): string | null {
  const code = templateCode?.trim()
  return code ? `GROUPWARE_${code}` : null
}

export function shouldRequireManualApprover(
  templateCode: string | null | undefined,
  loadingConfig: boolean,
  configRoles: ApprovalLineStructure[],
): boolean {
  if (!templateCode?.trim()) return true
  if (loadingConfig) return true
  return !configRoles.some((role) => role.stepType !== 'CREATOR')
}

export function getApprovalLinePreviewStatus(
  templateCode: string | null | undefined,
  loadingConfig: boolean,
  configRoles: ApprovalLineStructure[],
): string {
  if (!templateCode?.trim()) return '결재 유형을 먼저 선택하세요.'
  if (loadingConfig) return '결재선을 불러오는 중입니다.'
  if (configRoles.length === 0) return '설정된 결재선이 없습니다. 수동으로 결재자를 추가하세요.'
  if (!configRoles.some((role) => role.stepType !== 'CREATOR')) {
    return '작성자 단독 결재선입니다. 수동으로 결재자를 추가하세요.'
  }
  return '중앙 결재라인 설정이 적용됩니다.'
}

export async function loadDefaultApproverOptions(
  templateCode: string | null | undefined,
  fetcher: (documentType: string) => Promise<ApprovalLineDefaultApprover[]> = fetchDefaultApprovers,
): Promise<ApproverOption[]> {
  const documentType = buildGroupwareApprovalDocumentType(templateCode)
  if (!documentType) return []
  try {
    const defaultApprovers = await fetcher(documentType)
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

/**
 * 중앙 결재선 구조 미리보기.
 *
 * P1-A/C 수정: 비-admin GET /auth/approval-line-configs/{type}/structure 결과(`ApprovalLineStructure[]`)를
 * 사용한다. 구조 DTO 에는 결재자 이름·그룹 UUID 가 없으므로 결재 단계 라벨·유형만 표시한다.
 * 그룹명은 구조 endpoint 가 제공하지 않으며 비-admin 그룹 lookup endpoint 도 없어 생략 처리.
 *
 * P2: statusText 이중 렌더 제거(헤더에 1회만), overflowX:auto(모바일 390px 가로 넘침 방지).
 */
function ApprovalLineInstancePreview({
  roles,
  loading,
  error,
  statusText,
}: {
  roles: ApprovalLineStructure[]
  loading: boolean
  error: boolean
  statusText: string
}) {
  return (
    <section
      data-testid="groupware-approval-line-preview"
      style={{
        marginTop: 16,
        display: 'grid',
        gap: 10,
        padding: 12,
        border: '1px solid var(--color-neutral-200)',
        borderRadius: 6,
        background: 'var(--color-neutral-50)',
        overflowX: 'auto',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <h4 style={{ margin: 0, fontSize: 14 }}>기본 결재선</h4>
        <span style={{ fontSize: 12, color: 'var(--color-neutral-500)' }}>{statusText}</span>
      </div>
      {error ? (
        <p role="alert" style={{ margin: 0, color: 'var(--color-warning-800, #8C5C13)', fontSize: 13 }}>
          중앙 결재선 정보를 불러오지 못했습니다. 수동 결재선으로 작성할 수 있습니다.
        </p>
      ) : null}
      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--color-neutral-500)' }}>
          <Spinner size="sm" />
          <span>결재선을 확인하는 중...</span>
        </div>
      ) : roles.length > 0 ? (
        <div className="mobile-item-list" style={{ display: 'grid', gap: 8 }}>
          {roles.map((role) => (
            <div
              key={role.sequence}
              data-testid="groupware-approval-line-preview-step"
              style={{
                display: 'grid',
                gridTemplateColumns: 'auto 1fr',
                gap: 8,
                alignItems: 'center',
                padding: '8px 10px',
                border: '1px solid var(--color-neutral-200)',
                borderRadius: 4,
                background: 'var(--color-neutral-0)',
                fontSize: 13,
              }}
            >
              <strong style={{ fontVariantNumeric: 'tabular-nums' }}>{role.sequence + 1}</strong>
              <span>
                <span style={{ fontSize: 11, color: 'var(--color-neutral-500)', marginRight: 6 }}>
                  {STEP_TYPE_LABEL[role.stepType]}
                </span>
                <strong>{role.label}</strong>
              </span>
            </div>
          ))}
        </div>
      ) : null}
      {/* statusText 이중 렌더 제거: roles.length === 0 시 헤더의 statusText 로 충분 */}
    </section>
  )
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
  const approverTemplateCodeRef = useRef('')
  const defaultApproverEditVersionRef = useRef(0)

  usePageTitle('결재 작성')

  const canWrite = canAccess('groupware.approvals', 'update')

  const templatesQuery = useQuery({
    queryKey: ['groupwareApprovalTemplates', 'active'],
    queryFn: listActiveApprovalTemplates,
  })

  const templates = Array.isArray(templatesQuery.data) ? templatesQuery.data : []
  const selectedTemplate: ApprovalTemplate | undefined = templates.find((template) => template.id === templateId)
  const selectedTemplateCode = selectedTemplate?.code ?? ''
  const selectedDocumentType = buildGroupwareApprovalDocumentType(selectedTemplateCode)
  const sortedFields = useMemo(
    () => selectedTemplate ? [...selectedTemplate.fields].sort((a, b) => a.displayOrder - b.displayOrder) : [],
    [selectedTemplate],
  )

  /**
   * P1-A 수정: 비-admin GET /auth/approval-line-configs/{type}/structure 사용.
   * 기존 fetchApprovalLineRoles(/auth/admin/approval-line-configs?documentType=) → 403 해소.
   */
  const approvalLineStructureQuery = useQuery({
    queryKey: ['groupwareApprovalCreate', 'approval-line-structure', selectedDocumentType],
    queryFn: () => fetchApprovalLineStructure(selectedDocumentType!),
    enabled: Boolean(selectedDocumentType),
    retry: 1,
  })

  // P1-A: fetchApprovalLineGroups(/auth/admin/approval-line-configs/groups) 제거.
  // 구조 endpoint 는 그룹 UUID/이름을 포함하지 않으며 비-admin 그룹 lookup endpoint 없음.

  const configRoles = useMemo(
    () => [...(approvalLineStructureQuery.data ?? [])].sort((a, b) => a.sequence - b.sequence),
    [approvalLineStructureQuery.data],
  )
  const requireManualApprover = shouldRequireManualApprover(
    selectedTemplateCode,
    approvalLineStructureQuery.isLoading,
    configRoles,
  )
  const approvalLinePreviewStatus = getApprovalLinePreviewStatus(
    selectedTemplateCode,
    approvalLineStructureQuery.isLoading,
    configRoles,
  )

  useEffect(() => {
    let cancelled = false
    if (approverTemplateCodeRef.current !== selectedTemplateCode) {
      approverTemplateCodeRef.current = selectedTemplateCode
      // 템플릿 전환만 기존 결재선을 초기화한다. 조회 상태 전환은 로딩 중 사용자 편집을 보존한다.
      defaultApproverEditVersionRef.current = approverEditVersionRef.current
      setApprovers([])
    }
    // 템플릿 전환 시점 이후 편집이 있으면 늦게 도착한 기본 결재자로 덮어쓰지 않는다.
    const capturedEditVersion = defaultApproverEditVersionRef.current
    if (configRoles.length > 0 || approvalLineStructureQuery.isLoading || approvalLineStructureQuery.isError) {
      return () => {
        cancelled = true
      }
    }
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
  }, [selectedTemplateCode, approvalLineStructureQuery.isLoading, approvalLineStructureQuery.isError, configRoles.length])

  const approverIds = approvers.map((approver) => approver.userId)
  const missingRequired = sortedFields.some((field) =>
    field.required && !(fieldValues[field.fieldKey] ?? '').trim(),
  )
  const invalidReferences = references.some((ref) =>
    ref.refDocType === 'PARTNER_LEDGER'
      ? !ref.refPartnerCode?.trim() || !ref.refPartnerName?.trim() || !ref.refPeriod?.trim()
      : !ref.refDocNo?.trim(),
  )
  const invalid = !canWrite
    || !templateId
    || approvalLineStructureQuery.isLoading
    || !title.trim()
    || (requireManualApprover && approverIds.length === 0)
    || missingRequired
    || invalidReferences

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

  const removeApprover = (approver: ApproverOption) => {
    approverEditVersionRef.current += 1
    setApprovers((current) => {
      const index = current.findIndex((item) => item.userId === approver.userId)
      return index < 0 ? current : removeApproverAt(current, index)
    })
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
              <MultiSelectAutocomplete<ApproverOption, ApproverOption>
                selected={approvers}
                onAdd={addApprover}
                onRemove={removeApprover}
                search={searchApprovers}
                getOptionKey={(option) => option.userId}
                getSelectedKey={(option) => option.userId}
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
                label={requireManualApprover ? '결재선' : '추가 결재자'}
                ariaLabel="결재자 이름 검색"
                inputTestId="approver-search-input"
                placeholder="결재자 이름 검색"
                minChars={1}
                required={requireManualApprover}
                resultSelectionMode="multiple"
                resultSelectionTitle="담당자 검색 결과"
                renderChip={(approver, index, onRemove) => (
                  <TagChip
                    label={String(index + 1)}
                    value={approverLabel(approver)}
                    removeLabel={approverLabel(approver)}
                    onRemove={onRemove}
                    data-testid="approver-chip"
                  />
                )}
              />
              <p style={{ margin: 0, fontSize: 12, color: 'var(--color-neutral-500)' }}>
                {requireManualApprover
                  ? '설정된 결재선이 없는 유형입니다. 사원 이름을 검색해 결재 순서대로 추가합니다.'
                  : '중앙 결재선 뒤에 추가할 결재자가 있을 때만 사원 이름을 검색해 추가합니다.'}
              </p>
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

        <ApprovalLineInstancePreview
          roles={configRoles}
          loading={approvalLineStructureQuery.isLoading}
          error={approvalLineStructureQuery.isError}
          statusText={approvalLinePreviewStatus}
        />

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
                    gridTemplateColumns: 'minmax(min(420px, 100%), 1fr)',
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
