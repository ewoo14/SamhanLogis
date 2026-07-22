import { Button, Select } from '@samhan/design-system'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { isAxiosError } from 'axios'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import { fetchConfigurableDocTypes } from '../api/approvalLineConfigApi'
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
import '../components/documentTemplate/documentTemplateEditor.css'
import { useTemplateDraft } from '../components/documentTemplate/useTemplateDraft'
import { usePageTitle } from '../hooks/usePageTitle'
import { usePermissions } from '../hooks/usePermissions'
import { DocumentRenderer } from '../print/DocumentRenderer'
import type { ApprovalRenderModel } from '../print/approvalRenderModel'

// M-E: 결재란(approvalSteps)이 빈 배열로 고정돼 있으면 편집기에서 APPROVAL_GRID 를 조작해도 미리보기
// 픽셀이 전혀 바뀌지 않는다(결재란 자체가 그려지지 않으므로). 최소 1단계를 채워 "요소를 조작하면 그
// 변화가 미리보기에 드러난다"는 편집기의 핵심 계약을 시연 가능하게 한다.
const PREVIEW_MODEL: ApprovalRenderModel = {
  header: { title: '결재 문서 미리보기', docNo: '예시 문서번호', issueDate: '2026-01-01' },
  approvalSteps: [
    { label: '작성', name: '작성자' },
    { label: '결재', name: '결재자' },
  ],
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
  // H-D: docType 은 실제 결재 문서와 매칭되는 값만 의미가 있다(오타는 어떤 문서에도 매칭되지 않는
  // 죽은 양식을 만든다). 결재 유형 관리(#845)가 이미 관리하는 실제 GROUPWARE_* 코드 목록을 재사용한다
  // — 새 docType 도메인 확장은 비범위(spec §1.2)이므로 그룹웨어 결재 문서로 한정한다.
  const docTypeOptionsQuery = useQuery({
    queryKey: ['groupwareDocumentTemplateDocTypeOptions'],
    queryFn: fetchConfigurableDocTypes,
    enabled: isNew,
    staleTime: 60_000,
  })
  const groupwareDocTypeOptions = (docTypeOptionsQuery.data ?? []).filter((option) => option.kind === 'GROUPWARE')
  const template = templateQuery.data
  const draftState = useTemplateDraft(template)
  const {
    draft, updateDraft, addElement, moveElement, updateElement, removeElement,
    selectedKey, setSelectedKey, selectedElement, dirty, valid, validationError, markSaved, notice, clearNotice,
  } = draftState

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
      // LOW: 저장 성공 시 상세 쿼리 키를 무효화하지 않으면 재진입 시 stale 캐시가 보일 수 있다.
      void queryClient.invalidateQueries({ queryKey: ['groupwareDocumentTemplate', saved.id] })
      if (isNew) navigate(`/groupware/document-templates/${saved.id}/edit`, { replace: true })
    },
    onError: (cause) => setError(errorMessage(cause)),
  })
  const deactivate = useMutation({
    mutationFn: () => deactivateDocumentTemplate(id!),
    // H-E: deactivate()는 document 내용을 바꾸지 않는다(status 만 DRAFT 로 전환) — 종전에는 성공 콜백이
    // markSaved(saved)로 draft 전체를 서버본으로 덮어써, ACTIVE 잠금 상태에서 이미 입력해 둔 값(H-E 가
    // 고쳐지기 전에는 잠금 중에도 입력이 가능했다)이 경고 없이 사라졌다. status/editable 만 갱신하고
    // draft 는 그대로 둔다 — 어떤 경우에도 사용자의 미저장 입력이 경고 없이 폐기되지 않아야 한다.
    onSuccess: () => {
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
  // H-E: canEdit 이 팔레트·캔버스·인스펙터에 전달되지 않으면 ACTIVE 잠금·VIEW 전용 상태에서도
  // 요소 추가/문구 입력/삭제/이동이 전부 동작한다 — 편집 조작 자체를 막는다.
  const canEdit = canWrite && !activeLocked

  return (
    <section aria-label="문서 양식 편집기" style={{ display: 'grid', gap: 16 }}>
      <header className="no-print" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <div>
          <h1 style={{ margin: 0 }}>결재 문서 양식 편집기</h1>
          <p style={{ margin: '4px 0 0', color: 'var(--color-neutral-500)' }}>팔레트 · 밴드 캔버스 · 속성 패널</p>
        </div>
        <Button type="button" variant="ghost" onClick={() => navigate('/groupware/document-templates')}>목록</Button>
      </header>

      {activeLocked ? (
        <div className="no-print" role="status" style={{ padding: 10, background: 'var(--color-warning-50)', border: '1px solid var(--color-warning-300)' }}>
          <p style={{ margin: '0 0 6px' }}>
            사용 중인 양식은 직접 수정할 수 없습니다. 비활성화 후 편집하세요.
            {/* M-H: 부작용 고지 — 편집 시작(비활성화)이 해당 문서 유형의 사용 중 양식을 0개로 만들어,
                그 사이 승인되는 문서는 기본 양식으로 고정된다(D-DS3A-03 표면화, 신규 정책 아님). */}
            {' '}편집을 시작하면 이 문서 유형은 사용 중인 양식이 없는 상태가 되며, 그 사이 승인되는 문서는
            기본 양식으로 고정됩니다.
          </p>
          {canWrite ? <Button type="button" variant="warning" onClick={() => deactivate.mutate()} disabled={deactivate.isPending}>편집 시작</Button> : null}
        </div>
      ) : null}
      {/* M-H: 편집 후 원상복구(재활성화) 경로가 편집기 안에 있어야 한다. */}
      {!activeLocked && !isNew && template?.status === 'DRAFT' && canWrite ? (
        <p className="no-print" role="status" style={{ margin: 0, fontSize: 13 }}>
          편집을 마쳤다면 목록에서 이 양식을 다시 사용 설정(활성화)할 수 있습니다.
        </p>
      ) : null}
      {!canWrite ? <p className="no-print" role="status">수정 권한이 없어 읽기 전용으로 표시합니다.</p> : null}
      {notice ? (
        <p className="no-print" role="status" style={{ margin: 0, color: 'var(--color-warning-700, #92600a)' }}>
          {notice}
          <Button type="button" variant="ghost" size="sm" onClick={clearNotice}>확인</Button>
        </p>
      ) : null}

      <div className="no-print document-template-editor-form">
        {isNew ? (
          <div>
            <Select
              label="문서 유형"
              required
              disabled={!canEdit}
              value={draft.docType}
              onChange={(event) => updateDraft({ docType: event.target.value })}
            >
              <option value="">문서 유형을 선택하세요</option>
              {groupwareDocTypeOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </Select>
          </div>
        ) : (
          // H-D: 기존 양식은 BE 가 docType 변경을 항상 422 로 거부한다 — 수정 가능한 입력처럼 보이면
          // 저장 시 사용자가 이유를 알 수 없는 실패를 겪는다. 생성 후에는 읽기 전용으로 고정한다.
          <label className="document-template-editor-form-field">
            문서 유형(생성 후 변경 불가)
            <input value={draft.docType} disabled aria-readonly="true" />
          </label>
        )}
        <label className="document-template-editor-form-field">양식명<input value={draft.name} disabled={!canEdit} onChange={(event) => updateDraft({ name: event.target.value })} /></label>
      </div>

      {/*
        H-B: 3-pane 을 좁은 뷰포트에 그대로 강제하면 `.app-main{overflow-x:hidden}` 아래에서 우측
        속성 패널이 잘려 도달할 수 없었다. 1100px 미만에서는 이 wrapper 안의 grid가 고정 min-width 없는
        세로 카드 스택으로 전환되어 팔레트 → 밴드 캔버스 → 속성 패널 → 미리보기 순서로 흐른다. 1100px
        이상에서만 3-pane 을 사용하며 모든 트랙에 minmax(0, ...) / min-width:0 을 적용해 M-J max-content
        확장과 패널 겹침을 막는다.
      */}
      <div className="document-template-editor-scroll" data-testid="document-template-editor-scroll">
      <div className="document-template-editor-grid">
        <div className="no-print document-template-editor-pane document-template-editor-pane--palette">
          <ElementPalette onAdd={addElement} canEdit={canEdit} />
        </div>
        {/* gridTemplateColumns 명시(minmax(0,1fr)) — 미지정 시 이 nested grid 의 암묵적 auto 트랙은
            BandCanvas 의 flex-wrap 요소 행을 "줄바꿈 없이 한 줄로 편 max-content 폭"으로 측정해 트랙을
            그만큼 넓힌다(요소가 많아지면 실제 가용폭을 넘어 우측 속성 패널과 겹쳐 클릭을 막았다 — M-J). */}
        <div className="document-template-editor-center">
          <div className="no-print document-template-band-pane">
            <BandCanvas bands={draft.document.bands} selectedKey={selectedKey} onSelect={setSelectedKey} onMove={moveElement} canEdit={canEdit} />
          </div>
          <div className="document-template-preview" data-testid="document-template-live-preview">
            <h2 className="no-print" style={{ fontSize: 15, marginTop: 0 }}>라이브 미리보기</h2>
            <DocumentRenderer template={draft} model={PREVIEW_MODEL} />
          </div>
        </div>
        {/* minWidth:0 — geometry 2열 grid(`ElementInspector` 위치(%) fieldset)의 number input 들이
            내재 최소폭을 요구해 이 트랙이 minmax(220px,1fr) 를 넘어 확장, 가운데 BandCanvas 트랙과
            겹쳐 M-J 이동 버튼 클릭을 막았다. */}
        <div className="no-print document-template-editor-pane document-template-editor-pane--inspector">
          <ElementInspector
            element={selectedElement}
            onUpdate={(patch) => selectedKey && updateElement(selectedKey, patch)}
            onRemove={() => selectedKey && removeElement(selectedKey)}
            canEdit={canEdit}
          />
        </div>
      </div>
      </div>

      <footer className="no-print" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <div>
          {error ? <p role="alert">{error}</p> : null}
          {/* H-C: 저장이 불가능한 상태의 이유를 화면에서 알 수 있어야 한다. */}
          {!error && dirty && validationError ? <p role="alert">{validationError}</p> : null}
          {dirty ? <span>저장하지 않은 변경이 있습니다.</span> : <span>저장된 상태입니다.</span>}
        </div>
        <Button type="button" onClick={() => save.mutate()} disabled={!canEdit || !valid || !dirty || save.isPending}>
          저장
        </Button>
      </footer>
    </section>
  )
}
