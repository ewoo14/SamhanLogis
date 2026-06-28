/**
 * 그룹웨어 결재유형 템플릿 API client.
 *
 * BE DTO 는 SELECT 옵션을 optionsJson(JSON 배열 문자열)로 주고받는다. 화면에서는
 * 파싱된 options 배열만 사용하고, 생성/수정 요청 직전에 다시 optionsJson 으로 직렬화한다.
 */
import { apiClient, type ApiEnvelope } from './client'

export type ApprovalFieldType = 'TEXT' | 'NUMBER' | 'DATE' | 'SELECT' | 'TEXTAREA'

export const APPROVAL_FIELD_TYPE_LABEL: Record<ApprovalFieldType, string> = {
  TEXT: '텍스트',
  NUMBER: '숫자',
  DATE: '날짜',
  SELECT: '선택',
  TEXTAREA: '긴 텍스트',
}

export interface ApprovalTemplateField {
  id?: string
  fieldKey: string
  label: string
  fieldType: ApprovalFieldType
  required: boolean
  displayOrder: number
  options: string[]
  placeholder: string | null
}

export interface ApprovalTemplate {
  id: string
  code: string
  name: string
  description: string | null
  active: boolean
  displayOrder: number
  fields: ApprovalTemplateField[]
}

interface ApprovalTemplateFieldDto {
  id?: string
  fieldKey: string
  label: string
  fieldType: ApprovalFieldType
  required: boolean
  displayOrder: number
  optionsJson: string | null
  placeholder: string | null
}

interface ApprovalTemplateDto {
  id: string
  code: string
  name: string
  description: string | null
  active: boolean
  displayOrder: number
  fields: ApprovalTemplateFieldDto[] | null
}

export interface ApprovalTemplateFieldInput {
  fieldKey: string
  label: string
  fieldType: ApprovalFieldType
  required: boolean
  displayOrder: number
  options: string[]
  placeholder?: string | null
}

export interface ApprovalTemplateInput {
  code: string
  name: string
  description?: string | null
  active: boolean
  displayOrder: number
  fields: ApprovalTemplateFieldInput[]
}

interface ApprovalTemplateRequestDto {
  code: string
  name: string
  description: string | null
  active: boolean
  displayOrder: number
  fields: Array<{
    fieldKey: string
    label: string
    fieldType: ApprovalFieldType
    required: boolean
    displayOrder: number
    optionsJson: string | null
    placeholder: string | null
  }>
}

export function parseApprovalTemplateOptions(optionsJson: string | null | undefined): string[] {
  if (!optionsJson) return []
  try {
    const parsed = JSON.parse(optionsJson) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed
      .map((item) => String(item).trim())
      .filter((item) => item.length > 0)
  } catch {
    return []
  }
}

function serializeApprovalTemplateOptions(field: ApprovalTemplateFieldInput): string | null {
  if (field.fieldType !== 'SELECT') return null
  const options = field.options
    .map((option) => option.trim())
    .filter((option) => option.length > 0)
  return JSON.stringify(options)
}

function normalizeTemplateField(field: ApprovalTemplateFieldDto): ApprovalTemplateField {
  return {
    id: field.id,
    fieldKey: field.fieldKey,
    label: field.label,
    fieldType: field.fieldType,
    required: field.required,
    displayOrder: field.displayOrder,
    options: parseApprovalTemplateOptions(field.optionsJson),
    placeholder: field.placeholder,
  }
}

export function normalizeApprovalTemplate(dto: ApprovalTemplateDto): ApprovalTemplate {
  return {
    id: dto.id,
    code: dto.code,
    name: dto.name,
    description: dto.description,
    active: dto.active,
    displayOrder: dto.displayOrder,
    fields: (dto.fields ?? [])
      .map(normalizeTemplateField)
      .sort((a, b) => a.displayOrder - b.displayOrder),
  }
}

function toTemplateRequest(input: ApprovalTemplateInput): ApprovalTemplateRequestDto {
  return {
    code: input.code.trim(),
    name: input.name.trim(),
    description: input.description?.trim() || null,
    active: input.active,
    displayOrder: input.displayOrder,
    fields: input.fields
      .map((field, index) => ({
        fieldKey: field.fieldKey.trim(),
        label: field.label.trim(),
        fieldType: field.fieldType,
        required: field.required,
        displayOrder: Number.isFinite(field.displayOrder) ? field.displayOrder : index + 1,
        optionsJson: serializeApprovalTemplateOptions(field),
        placeholder: field.placeholder?.trim() || null,
      }))
      .sort((a, b) => a.displayOrder - b.displayOrder),
  }
}

export async function listApprovalTemplates(): Promise<ApprovalTemplate[]> {
  const res = await apiClient.get<ApiEnvelope<ApprovalTemplateDto[]>>(
    '/admin/groupware/approval-templates',
  )
  return (res.data.data ?? []).map(normalizeApprovalTemplate)
}

export async function listActiveApprovalTemplates(): Promise<ApprovalTemplate[]> {
  // 게이트웨이 노출 경로(/admin). /internal/** 은 게이트웨이 비노출(404)이라 사용 금지.
  const res = await apiClient.get<ApiEnvelope<ApprovalTemplateDto[]>>(
    '/groupware/approval-templates/active',
  )
  return (res.data.data ?? []).map(normalizeApprovalTemplate)
}

export async function findActiveApprovalTemplate(templateId: string): Promise<ApprovalTemplate | null> {
  const templates = await listActiveApprovalTemplates()
  return templates.find((template) => template.id === templateId) ?? null
}

export async function getApprovalTemplate(templateId: string): Promise<ApprovalTemplate> {
  const res = await apiClient.get<ApiEnvelope<ApprovalTemplateDto>>(
    `/admin/groupware/approval-templates/${encodeURIComponent(templateId)}`,
  )
  return normalizeApprovalTemplate(res.data.data)
}

export async function createApprovalTemplate(input: ApprovalTemplateInput): Promise<ApprovalTemplate> {
  const res = await apiClient.post<ApiEnvelope<ApprovalTemplateDto>>(
    '/admin/groupware/approval-templates',
    toTemplateRequest(input),
  )
  return normalizeApprovalTemplate(res.data.data)
}

export async function updateApprovalTemplate(
  templateId: string,
  input: ApprovalTemplateInput,
): Promise<ApprovalTemplate> {
  const res = await apiClient.put<ApiEnvelope<ApprovalTemplateDto>>(
    `/admin/groupware/approval-templates/${encodeURIComponent(templateId)}`,
    toTemplateRequest(input),
  )
  return normalizeApprovalTemplate(res.data.data)
}

export async function deleteApprovalTemplate(templateId: string): Promise<void> {
  await apiClient.delete<ApiEnvelope<null>>(
    `/admin/groupware/approval-templates/${encodeURIComponent(templateId)}`,
  )
}
