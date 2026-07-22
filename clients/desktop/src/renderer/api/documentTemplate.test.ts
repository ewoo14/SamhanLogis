import { beforeEach, describe, expect, it, vi } from 'vitest'

import { apiClient } from './client'
import {
  createDocumentTemplate,
  findActiveDocumentTemplate,
  findDocumentTemplateRevision,
  getDocumentTemplate,
  listDocumentTemplates,
} from './documentTemplate'

vi.mock('./client', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}))

const envelope = (data: unknown) => ({
  data: { success: true, code: 'OK', message: '', data, timestamp: '2026-07-18T00:00:00Z' },
})

const document = {
  paper: 'A4_PORTRAIT',
  bands: [
    { key: 'header', kind: 'HEADER', elements: [{ key: 'title', type: 'TITLE' }, { key: 'approval', type: 'APPROVAL_GRID' }] },
    { key: 'body', kind: 'BODY', elements: [{ key: 'content', type: 'CONTENT_PARAGRAPHS' }] },
    { key: 'footer', kind: 'FOOTER', elements: [{ key: 'closing', type: 'CLOSING' }] },
  ],
}

const dto = {
  id: 'template-id',
  status: 'ACTIVE' as const,
  revision: 1,
  docType: 'GROUPWARE_EXPENSE',
  name: '지출 양식',
  schemaVersion: 1,
  document,
}

beforeEach(() => vi.clearAllMocks())

describe('document template API', () => {
  it('finds active payload with query parameter and normalizes envelope', async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce(envelope(dto))

    await expect(findActiveDocumentTemplate('GROUPWARE_EXPENSE')).resolves.toMatchObject({
      docType: 'GROUPWARE_EXPENSE',
      document,
    })
    expect(apiClient.get).toHaveBeenCalledWith('/groupware/document-templates/active', {
      params: { docType: 'GROUPWARE_EXPENSE' },
    })
  })

  it('turns absent and malformed active responses into null', async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce(envelope(null))
    await expect(findActiveDocumentTemplate('GROUPWARE_EXPENSE')).resolves.toBeNull()

    vi.mocked(apiClient.get).mockResolvedValueOnce(envelope({ ...dto, document: { paper: 'BROKEN' } }))
    await expect(findActiveDocumentTemplate('GROUPWARE_EXPENSE')).resolves.toBeNull()

    vi.mocked(apiClient.get).mockResolvedValueOnce(envelope({ ...dto, status: 'DRAFT' }))
    await expect(findActiveDocumentTemplate('GROUPWARE_EXPENSE')).resolves.toBeNull()

    vi.mocked(apiClient.get).mockResolvedValueOnce(envelope({ ...dto, docType: 'GROUPWARE_OTHER' }))
    await expect(findActiveDocumentTemplate('GROUPWARE_EXPENSE')).resolves.toBeNull()

    vi.mocked(apiClient.get).mockResolvedValueOnce(envelope({ ...dto, id: undefined }))
    await expect(findActiveDocumentTemplate('GROUPWARE_EXPENSE')).resolves.toBeNull()

    vi.mocked(apiClient.get).mockResolvedValueOnce(envelope({ ...dto, status: undefined }))
    await expect(findActiveDocumentTemplate('GROUPWARE_EXPENSE')).resolves.toBeNull()
  })

  it('loads a pinned revision without treating it as the current active template', async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce(envelope({
      templateId: dto.id,
      revision: 1,
      schemaVersion: 1,
      document,
    }))

    await expect(findDocumentTemplateRevision(dto.id, 1, dto.docType)).resolves.toMatchObject({
      id: dto.id,
      revision: 1,
      docType: dto.docType,
      name: '승인 당시 문서 양식',
    })
    expect(apiClient.get).toHaveBeenCalledWith(
      `/groupware/document-templates/${dto.id}/revisions/1`,
    )
  })

  it('keeps admin request free of server-owned lifecycle fields', async () => {
    vi.mocked(apiClient.post).mockResolvedValueOnce(envelope({ ...dto, status: 'DRAFT' }))
    await createDocumentTemplate({ docType: dto.docType, name: dto.name, schemaVersion: 1, document })

    expect(apiClient.post).toHaveBeenCalledWith('/admin/groupware/document-templates', {
      docType: dto.docType,
      name: dto.name,
      schemaVersion: 1,
      document,
    })
  })

  it('BLOCKING-1: 부분 style 응답(미지정 필드가 explicit null)도 재열람 파싱에 성공한다', async () => {
    // BE round-trip 버그가 재발하면 GET 응답에 이런 explicit null 이 실릴 수 있다 — 저장은
    // 성공했는데 재열람이 실패하는 모순을 FE 파서 레벨에서도 방어한다(invariant #2/#3).
    const v2Document = {
      ...document,
      bands: document.bands.map((band) => band.kind === 'BODY'
        ? {
            ...band,
            elements: [
              ...band.elements,
              {
                key: 'field-partial-style',
                type: 'FIELD',
                binding: 'header.docNo',
                geometry: { x: 0, y: 0, w: 50, h: 10 },
                style: { fontSize: 14, bold: null, align: null, border: null },
              },
            ],
          }
        : band),
    }
    vi.mocked(apiClient.get).mockResolvedValueOnce(envelope({ ...dto, schemaVersion: 2, document: v2Document }))

    const result = await getDocumentTemplate(dto.id)
    const field = result.document.bands[1]?.elements.find((element) => element.key === 'field-partial-style')
    expect(field && 'style' in field ? field.style : undefined).toEqual({ fontSize: 14 })
  })

  it('normalizes only valid entries in admin list', async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce(envelope([dto, { ...dto, document: null }]))
    await expect(listDocumentTemplates()).resolves.toHaveLength(1)
  })
})
