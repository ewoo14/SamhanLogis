import { Button, Modal } from '@samhan/design-system'
import { isAxiosError } from 'axios'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { listDocumentTemplates, activateDocumentTemplate, deactivateDocumentTemplate, deleteDocumentTemplate } from '../api/documentTemplate'
import { usePageTitle } from '../hooks/usePageTitle'
import { usePermissions } from '../hooks/usePermissions'
import { TEMPLATE_STATUS_LABEL } from '../print/templateSchema'
import './GroupwareDocumentTemplateAdminPage.css'

function errorMessage(error: unknown): string {
  if (isAxiosError(error)) {
    const message = (error.response?.data as { message?: unknown } | undefined)?.message
    if (typeof message === 'string' && message.trim()) return message.trim()
  }
  return '문서 양식 처리에 실패했습니다.'
}

export function GroupwareDocumentTemplateAdminPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { canAccess } = usePermissions()
  const canWrite = canAccess('groupware.approval-templates', 'update')
  const query = useQuery({ queryKey: ['groupwareDocumentTemplates'], queryFn: listDocumentTemplates, staleTime: 0 })
  usePageTitle('결재 문서 양식')
  // M-G: 목록 조작(활성화/비활성화/삭제) 실패가 오류 콜백 없이 조용히 무시됐다 — 사용자에게 한국어로
  // 드러난다.
  const [error, setError] = useState<string | null>(null)
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)

  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['groupwareDocumentTemplates'] })
  const lifecycle = useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'activate' | 'deactivate' }) => action === 'activate'
      ? activateDocumentTemplate(id)
      : deactivateDocumentTemplate(id),
    onSuccess: () => {
      setError(null)
      refresh()
    },
    onError: (cause) => setError(errorMessage(cause)),
  })
  const remove = useMutation({
    mutationFn: deleteDocumentTemplate,
    onSuccess: () => {
      setError(null)
      setPendingDeleteId(null)
      refresh()
    },
    onError: (cause) => setError(errorMessage(cause)),
  })

  if (query.isLoading) return <p>결재 문서 양식 불러오는 중...</p>
  if (query.isError) return <p role="alert">결재 문서 양식을 불러오지 못했습니다.</p>
  const rows = query.data ?? []

  return (
    <section className="document-template-admin" aria-label="결재 문서 양식 관리" style={{ display: 'grid', gap: 16 }}>
      <header className="document-template-admin-header">
        <div>
          <h1 style={{ margin: 0 }}>결재 문서 양식</h1>
          <p style={{ margin: '4px 0 0', color: 'var(--color-neutral-500)' }}>결재 출력 문서의 레이아웃을 관리합니다.</p>
        </div>
        {canWrite ? <Button type="button" onClick={() => navigate('/groupware/document-templates/new/edit')}>신규 문서 양식</Button> : null}
      </header>
      <p style={{ margin: 0, fontSize: 13 }}>사용 중인 양식은 비활성화한 뒤 편집할 수 있습니다. 편집 중 승인된 문서는 기본 양식으로 고정될 수 있습니다.</p>
      {error ? <p role="alert">{error}</p> : null}
      <div className="document-template-admin-table-wrap">
        <table className="document-template-admin-table" role="table">
          <thead><tr role="row"><th role="columnheader">문서 유형</th><th role="columnheader">양식명</th><th role="columnheader">상태</th><th role="columnheader">개정 번호</th><th role="columnheader" /></tr></thead>
          <tbody>
            {rows.map((row) => {
              if (!row.id) return null
              const templateId = row.id
              return (
              <tr key={row.id} role="row">
                <td role="cell" data-label="문서 유형">{row.docType}</td>
                <td role="cell" data-label="양식명"><button className="document-template-admin-name" type="button" onClick={() => navigate(`/groupware/document-templates/${row.id}/edit`)}>{row.name}</button></td>
                <td role="cell" data-label="상태">{TEMPLATE_STATUS_LABEL[row.status ?? 'DRAFT']}</td>
                <td role="cell" data-label="개정 번호">{row.revision}</td>
                <td role="cell" data-label="작업">
                  {canWrite ? (
                    <div className="document-template-admin-actions">
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        disabled={lifecycle.isPending}
                        onClick={() => lifecycle.mutate({ id: templateId, action: row.status === 'ACTIVE' ? 'deactivate' : 'activate' })}
                      >
                        {row.status === 'ACTIVE' ? '비활성화' : '활성화'}
                      </Button>
                      <Button type="button" variant="danger" size="sm" onClick={() => setPendingDeleteId(templateId)}>삭제</Button>
                    </div>
                  ) : null}
                </td>
              </tr>
              )
            })}
            {rows.length === 0 ? <tr role="row"><td role="cell" data-label="상태" colSpan={5}>등록된 문서 양식이 없습니다.</td></tr> : null}
          </tbody>
        </table>
      </div>
      {/* M-I: raw window.confirm 대신 design-system Modal 사용(신규 화면도 인접 화면과 동일 컴포넌트). */}
      <Modal
        open={pendingDeleteId !== null}
        onClose={() => setPendingDeleteId(null)}
        title="문서 양식 삭제"
        description="이 문서 양식을 삭제할까요? 삭제 후에는 목록에서 복구할 수 없습니다."
        footer={(
          <>
            <Button type="button" variant="ghost" onClick={() => setPendingDeleteId(null)}>취소</Button>
            <Button
              type="button"
              variant="danger"
              disabled={remove.isPending}
              onClick={() => pendingDeleteId && remove.mutate(pendingDeleteId)}
            >
              삭제
            </Button>
          </>
        )}
      />
    </section>
  )
}
