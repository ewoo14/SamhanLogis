import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'

import { listDocumentTemplates, activateDocumentTemplate, deactivateDocumentTemplate, deleteDocumentTemplate } from '../api/documentTemplate'
import { usePageTitle } from '../hooks/usePageTitle'
import { usePermissions } from '../hooks/usePermissions'

export function GroupwareDocumentTemplateAdminPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { canAccess } = usePermissions()
  const canWrite = canAccess('groupware.approval-templates', 'update')
  const query = useQuery({ queryKey: ['groupwareDocumentTemplates'], queryFn: listDocumentTemplates, staleTime: 0 })
  usePageTitle('결재 문서 양식')

  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['groupwareDocumentTemplates'] })
  const lifecycle = useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'activate' | 'deactivate' }) => action === 'activate'
      ? activateDocumentTemplate(id)
      : deactivateDocumentTemplate(id),
    onSuccess: refresh,
  })
  const remove = useMutation({ mutationFn: deleteDocumentTemplate, onSuccess: refresh })

  if (query.isLoading) return <p>결재 문서 양식 불러오는 중...</p>
  if (query.isError) return <p role="alert">결재 문서 양식을 불러오지 못했습니다.</p>
  const rows = query.data ?? []

  return (
    <section aria-label="결재 문서 양식 관리" style={{ display: 'grid', gap: 16 }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <div>
          <h1 style={{ margin: 0 }}>결재 문서 양식</h1>
          <p style={{ margin: '4px 0 0', color: 'var(--color-neutral-500)' }}>결재 출력 문서의 레이아웃을 관리합니다.</p>
        </div>
        {canWrite ? <button type="button" onClick={() => navigate('/groupware/document-templates/new/edit')}>신규 문서 양식</button> : null}
      </header>
      <p style={{ margin: 0, fontSize: 13 }}>ACTIVE 양식은 비활성화한 뒤 편집할 수 있습니다. 편집 중 승인된 문서는 기본 양식으로 고정될 수 있습니다.</p>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr><th style={{ textAlign: 'left' }}>문서 유형</th><th style={{ textAlign: 'left' }}>양식명</th><th>상태</th><th>revision</th><th /></tr></thead>
          <tbody>
            {rows.map((row) => {
              if (!row.id) return null
              const templateId = row.id
              return (
              <tr key={row.id}>
                <td>{row.docType}</td>
                <td><button type="button" onClick={() => navigate(`/groupware/document-templates/${row.id}/edit`)}>{row.name}</button></td>
                <td>{row.status === 'ACTIVE' ? 'ACTIVE' : 'DRAFT'}</td>
                <td>{row.revision}</td>
                <td>
                  {canWrite ? (
                    <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                      <button type="button" onClick={() => lifecycle.mutate({ id: templateId, action: row.status === 'ACTIVE' ? 'deactivate' : 'activate' })}>
                        {row.status === 'ACTIVE' ? '비활성화' : '활성화'}
                      </button>
                      <button type="button" onClick={() => { if (window.confirm('문서 양식을 삭제할까요?')) remove.mutate(templateId) }}>삭제</button>
                    </div>
                  ) : null}
                </td>
              </tr>
              )
            })}
            {rows.length === 0 ? <tr><td colSpan={5}>등록된 문서 양식이 없습니다.</td></tr> : null}
          </tbody>
        </table>
      </div>
    </section>
  )
}
