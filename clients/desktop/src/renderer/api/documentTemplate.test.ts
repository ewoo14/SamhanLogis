import { beforeEach, describe, expect, it, vi } from 'vitest'

import { apiClient } from './client'
import { createDocumentTemplate, findActiveDocumentTemplate, listDocumentTemplates } from './documentTemplate'

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

  it('normalizes only valid entries in admin list', async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce(envelope([dto, { ...dto, document: null }]))
    await expect(listDocumentTemplates()).resolves.toHaveLength(1)
  })
})
