/** 그룹웨어 문서 레이아웃 템플릿 API client. 관리 UI는 DS-3에서 확장한다. */
import { apiClient, type ApiEnvelope } from './client'
import {
  parseDocumentTemplate,
  type DocumentPayload,
  type TemplateEnvelope,
  type TemplateStatus,
} from '../print/templateSchema'

interface DocumentTemplateDto {
  id?: string
  status?: TemplateStatus
  revision: number
  docType: string
  name: string
  schemaVersion: number
  document: unknown
}

export interface DocumentTemplateInput {
  docType: string
  name: string
  schemaVersion: 1
  document: DocumentPayload
}

function normalize(dto: DocumentTemplateDto | null | undefined): TemplateEnvelope | null {
  if (!dto) return null
  const parsed = parseDocumentTemplate(dto)
  return parsed.ok ? parsed.value : null
}

/** renderer용 active 레이아웃. malformed 응답은 null로 수렴시켜 DEFAULT를 선택한다. */
export async function findActiveDocumentTemplate(docType: string): Promise<TemplateEnvelope | null> {
  const res = await apiClient.get<ApiEnvelope<DocumentTemplateDto | null>>(
    '/groupware/document-templates/active',
    { params: { docType } },
  )
  return normalize(res.data.data)
}

export async function listDocumentTemplates(): Promise<TemplateEnvelope[]> {
  const res = await apiClient.get<ApiEnvelope<DocumentTemplateDto[]>>('/admin/groupware/document-templates')
  return (res.data.data ?? []).map(normalize).filter((item): item is TemplateEnvelope => item !== null)
}

export async function getDocumentTemplate(id: string): Promise<TemplateEnvelope> {
  const res = await apiClient.get<ApiEnvelope<DocumentTemplateDto>>(
    `/admin/groupware/document-templates/${encodeURIComponent(id)}`,
  )
  const normalized = normalize(res.data.data)
  if (!normalized) throw new Error('문서 양식 응답이 유효하지 않습니다.')
  return normalized
}

export async function createDocumentTemplate(input: DocumentTemplateInput): Promise<TemplateEnvelope> {
  const res = await apiClient.post<ApiEnvelope<DocumentTemplateDto>>(
    '/admin/groupware/document-templates',
    input,
  )
  const normalized = normalize(res.data.data)
  if (!normalized) throw new Error('문서 양식 응답이 유효하지 않습니다.')
  return normalized
}

export async function updateDocumentTemplate(id: string, input: DocumentTemplateInput): Promise<TemplateEnvelope> {
  const res = await apiClient.put<ApiEnvelope<DocumentTemplateDto>>(
    `/admin/groupware/document-templates/${encodeURIComponent(id)}`,
    input,
  )
  const normalized = normalize(res.data.data)
  if (!normalized) throw new Error('문서 양식 응답이 유효하지 않습니다.')
  return normalized
}

export async function activateDocumentTemplate(id: string): Promise<TemplateEnvelope> {
  const res = await apiClient.post<ApiEnvelope<DocumentTemplateDto>>(
    `/admin/groupware/document-templates/${encodeURIComponent(id)}/activate`,
  )
  const normalized = normalize(res.data.data)
  if (!normalized) throw new Error('문서 양식 응답이 유효하지 않습니다.')
  return normalized
}

export async function deactivateDocumentTemplate(id: string): Promise<TemplateEnvelope> {
  const res = await apiClient.post<ApiEnvelope<DocumentTemplateDto>>(
    `/admin/groupware/document-templates/${encodeURIComponent(id)}/deactivate`,
  )
  const normalized = normalize(res.data.data)
  if (!normalized) throw new Error('문서 양식 응답이 유효하지 않습니다.')
  return normalized
}

export async function deleteDocumentTemplate(id: string): Promise<void> {
  await apiClient.delete<ApiEnvelope<null>>(`/admin/groupware/document-templates/${encodeURIComponent(id)}`)
}
