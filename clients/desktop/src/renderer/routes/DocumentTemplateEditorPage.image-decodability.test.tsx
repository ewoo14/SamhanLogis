// @vitest-environment jsdom

import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

const mocks = vi.hoisted(() => ({
  findUndecodableImages: vi.fn(),
  updateDocumentTemplate: vi.fn(),
  fetchActiveGroupwareDocTypes: vi.fn(),
  listApprovalTemplates: vi.fn(),
  canAccess: vi.fn(),
}))

vi.mock('../api/documentTemplate', () => ({
  createDocumentTemplate: vi.fn(),
  deactivateDocumentTemplate: vi.fn(),
  getDocumentTemplate: vi.fn(),
  updateDocumentTemplate: mocks.updateDocumentTemplate,
}))
vi.mock('../api/approvalLineConfigApi', () => ({ fetchActiveGroupwareDocTypes: mocks.fetchActiveGroupwareDocTypes }))
vi.mock('../api/groupwareApprovalTemplate', () => ({ listApprovalTemplates: mocks.listApprovalTemplates }))
vi.mock('../hooks/usePageTitle', () => ({ usePageTitle: () => {} }))
vi.mock('../hooks/usePermissions', () => ({ usePermissions: () => ({ canAccess: mocks.canAccess }) }))
vi.mock('../print/templateSchema', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../print/templateSchema')>()
  return { ...actual, findUndecodableImages: mocks.findUndecodableImages }
})
vi.mock('../components/documentTemplate/ElementPalette', () => ({ ElementPalette: () => null }))
vi.mock('../components/documentTemplate/BandCanvas', () => ({ BandCanvas: () => null }))
vi.mock('../components/documentTemplate/ElementInspector', () => ({
  ElementInspector: ({ onUpdate }: { onUpdate: (patch: Record<string, unknown>) => void }) => (
    <button type="button" onClick={() => onUpdate({ src: '/print-logo.svg' })}>fix-image</button>
  ),
}))
vi.mock('../print/DocumentRenderer', () => ({ DocumentRenderer: () => <div /> }))
vi.mock('../print/documentTemplateEditorPreview', () => ({ buildPreviewModel: () => ({}) }))
vi.mock('../components/documentTemplate/useTemplateDraft', () => ({
  useTemplateDraft: () => draftState,
}))
vi.mock('@samhan/design-system', () => ({
  Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => <button {...props}>{children}</button>,
  Select: ({ children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) => <select {...props}>{children}</select>,
}))

import { DocumentTemplateEditorPage } from './DocumentTemplateEditorPage'

const invalidIssue = { key: 'image-row-b', alt: '동일 대체 문구', src: 'broken', bandKind: 'HEADER' as const }
const makeDraft = (src: string) => ({
  schemaVersion: 2 as const,
  revision: 1,
  id: 'template-1',
  status: 'DRAFT' as const,
  docType: 'GROUPWARE_DEFAULT',
  name: 'throwaway',
  document: {
    paper: 'A4' as const,
    bands: [
      { key: 'header-band', kind: 'HEADER' as const, elements: [{ key: 'image-row-b', type: 'IMAGE' as const, src, alt: '동일 대체 문구' }] },
      { key: 'body-band', kind: 'BODY' as const, elements: [] },
      { key: 'footer-band', kind: 'FOOTER' as const, elements: [] },
    ],
  },
})

const draftState = {
  draft: makeDraft('broken'),
  updateDraft: vi.fn(),
  addElement: vi.fn(),
  moveElement: vi.fn(),
  moveElementToBand: vi.fn(),
  updateElement: vi.fn((key: string, patch: { src?: string }) => {
    if (key !== 'image-row-b' || !patch.src) return
    draftState.draft = { ...draftState.draft, document: { ...draftState.draft.document, bands: draftState.draft.document.bands.map((band) => ({
      ...band,
      elements: band.elements.map((element) => element.key === key ? { ...element, src: patch.src! } : element),
    })) } }
  }),
  removeElement: vi.fn(),
  selectedKey: 'image-row-b',
  setSelectedKey: vi.fn(),
  selectedElement: null,
  dirty: true,
  valid: true,
  validationError: null,
  markSaved: vi.fn(),
  notice: null,
  clearNotice: vi.fn(),
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const buildUi = () => (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/groupware/document-templates/new/edit']}>
        <Routes><Route path="/groupware/document-templates/:id/edit" element={<DocumentTemplateEditorPage />} /></Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
  const view = render(buildUi())
  return { ...view, rerenderPage: () => view.rerender(buildUi()) }
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  draftState.draft = makeDraft('broken')
})

describe('DocumentTemplateEditorPage current image save reason', () => {
  it('이미지 수정 뒤에는 직전 저장 차단 사유가 현재 draft 기준으로 즉시 재평가된다', async () => {
    mocks.canAccess.mockReturnValue(true)
    mocks.fetchActiveGroupwareDocTypes.mockResolvedValue([])
    mocks.listApprovalTemplates.mockResolvedValue([])
    mocks.updateDocumentTemplate.mockResolvedValue(draftState.draft)
    mocks.findUndecodableImages
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([invalidIssue])
      .mockResolvedValueOnce([])

    const view = renderPage()
    fireEvent.click(screen.getByRole('button', { name: '저장' }))
    await screen.findByText(/저장할 수 없는 이미지:.*image-row-b/)

    fireEvent.click(screen.getByRole('button', { name: 'fix-image' }))
    // mocked draft hook is deliberately controlled by the test; rerender reproduces the next React render.
    view.rerenderPage()

    await waitFor(() => expect(screen.queryByText(/저장할 수 없는 이미지/)).toBeNull())
  })
})
