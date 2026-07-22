import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { isAxiosError } from 'axios'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import {
  createDocumentTemplate,
  deactivateDocumentTemplate,
  getDocumentTemplate,
  updateDocumentTemplate,
  type DocumentTemplateInput,
} from '../api/documentTemplate'
import { BandCanvas } from '../components/documentTemplate/BandCanvas'
import { ElementInspector } from '../components/documentTemplate/ElementInspector'
import { ElementPalette } from '../components/documentTemplate/ElementPalette'
import { useTemplateDraft } from '../components/documentTemplate/useTemplateDraft'
import { usePageTitle } from '../hooks/usePageTitle'
import { usePermissions } from '../hooks/usePermissions'
import { DocumentRenderer } from '../print/DocumentRenderer'
import type { ApprovalRenderModel } from '../print/approvalRenderModel'

const PREVIEW_MODEL: ApprovalRenderModel = {
  header: { title: '결재 문서 미리보기', docNo: '예시 문서번호', issueDate: '2026-01-01' },
  approvalSteps: [],
  body: { paragraphs: ['본문 미리보기'], fieldRows: [{ label: '예시 필드', value: '예시 값' }], attachments: [] },
  closing: { note: '위와 같이 품의하오니 재가하여 주시기 바랍니다.' },
}

function errorMessage(error: unknown): string {
  if (isAxiosError(error)) {
    const message = (error.response?.data as { message?: unknown } | undefined)?.message
    if (typeof message === 'string' && message.trim()) return message.trim()
  }
  return '문서 양식 처리에 실패했습니다.'
}

export function DocumentTemplateEditorPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { canAccess } = usePermissions()
  const canWrite = canAccess('groupware.approval-templates', 'update')
  const isNew = !id || id === 'new'
  const [editable, setEditable] = useState(isNew)
  const [error, setError] = useState<string | null>(null)
  const templateQuery = useQuery({
    queryKey: ['groupwareDocumentTemplate', id],
    queryFn: () => getDocumentTemplate(id!),
    enabled: !isNew,
    staleTime: 0,
  })
  const template = templateQuery.data
  const draftState = useTemplateDraft(template)
  const { draft, updateDraft, addElement, updateElement, removeElement, selectedKey, setSelectedKey, selectedElement, dirty, valid, markSaved } = draftState

  useEffect(() => {
    if (template) setEditable(template.status === 'DRAFT')
  }, [template?.id, template?.status])
  usePageTitle('결재 문서 양식 편집')

  const input = useMemo<DocumentTemplateInput>(() => ({
    docType: draft.docType,
    name: draft.name,
    schemaVersion: 2,
    document: draft.document,
  }), [draft.docType, draft.name, draft.document])

  const save = useMutation({
    mutationFn: () => isNew ? createDocumentTemplate(input) : updateDocumentTemplate(id!, input),
    onSuccess: (saved) => {
      markSaved(saved)
      setError(null)
      void queryClient.invalidateQueries({ queryKey: ['groupwareDocumentTemplates'] })
      if (isNew) navigate(`/groupware/document-templates/${saved.id}/edit`, { replace: true })
    },
    onError: (cause) => setError(errorMessage(cause)),
  })
  const deactivate = useMutation({
    mutationFn: () => deactivateDocumentTemplate(id!),
    onSuccess: (saved) => {
      markSaved(saved)
      setEditable(true)
      setError(null)
      void queryClient.invalidateQueries({ queryKey: ['groupwareDocumentTemplates'] })
      void queryClient.invalidateQueries({ queryKey: ['groupwareDocumentTemplate', id] })
    },
    onError: (cause) => setError(errorMessage(cause)),
  })

  if (!isNew && templateQuery.isLoading) return <p>문서 양식 불러오는 중...</p>
  if (!isNew && (templateQuery.isError || !template)) return <p role="alert">문서 양식을 불러오지 못했습니다.</p>
  const activeLocked = template?.status === 'ACTIVE' && !editable
  const canEdit = canWrite && !activeLocked

  return (
    <section aria-label="문서 양식 편집기" style={{ display: 'grid', gap: 16 }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <div>
          <h1 style={{ margin: 0 }}>결재 문서 양식 편집기</h1>
          <p style={{ margin: '4px 0 0', color: 'var(--color-neutral-500)' }}>팔레트 · 밴드 캔버스 · 속성 패널</p>
        </div>
        <button type="button" onClick={() => navigate('/groupware/document-templates')}>목록</button>
      </header>

      {activeLocked ? (
        <div role="status" style={{ padding: 10, background: 'var(--color-warning-50)', border: '1px solid var(--color-warning-300)' }}>
          ACTIVE 양식은 직접 수정할 수 없습니다. 비활성화 후 편집하세요.
          {canWrite ? <button type="button" onClick={() => deactivate.mutate()} disabled={deactivate.isPending}>편집 시작</button> : null}
        </div>
      ) : null}
      {!canWrite ? <p role="status">수정 권한이 없어 읽기 전용으로 표시합니다.</p> : null}

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(160px, 0.7fr) minmax(420px, 2fr) minmax(220px, 1fr)', gap: 12, alignItems: 'start' }}>
        <div style={{ display: 'grid', gap: 12, padding: 12, border: '1px solid var(--color-neutral-200)', borderRadius: 8 }}>
          <ElementPalette onAdd={addElement} />
          <label>문서 유형<input value={draft.docType} disabled={!canEdit} onChange={(event) => updateDraft({ docType: event.target.value })} /></label>
          <label>양식명<input value={draft.name} disabled={!canEdit} onChange={(event) => updateDraft({ name: event.target.value })} /></label>
        </div>
        <div style={{ display: 'grid', gap: 12 }}>
          <BandCanvas bands={draft.document.bands} selectedKey={selectedKey} onSelect={setSelectedKey} />
          <div data-testid="document-template-live-preview" style={{ border: '1px solid var(--color-neutral-300)', borderRadius: 8, padding: 12 }}>
            <h2 style={{ fontSize: 15, marginTop: 0 }}>라이브 미리보기</h2>
            <DocumentRenderer template={draft} model={PREVIEW_MODEL} />
          </div>
        </div>
        <div style={{ padding: 12, border: '1px solid var(--color-neutral-200)', borderRadius: 8 }}>
          <ElementInspector
            element={selectedElement}
            onUpdate={(patch) => selectedKey && updateElement(selectedKey, patch)}
            onRemove={() => selectedKey && removeElement(selectedKey)}
          />
        </div>
      </div>

      <footer style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <div>{error ? <p role="alert">{error}</p> : null}{dirty ? <span>저장하지 않은 변경이 있습니다.</span> : <span>저장된 상태입니다.</span>}</div>
        <button type="button" onClick={() => save.mutate()} disabled={!canEdit || !valid || !dirty || save.isPending}>
          저장
        </button>
      </footer>
    </section>
  )
}
