/**
 * DispatchTask 코멘트 스레드 — C1c.
 *
 * 목록/등록/삭제는 REST API 로 동작한다. SSE 구독은 부모 상세 모달의 단일 stream 이 담당한다.
 */
import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, safeActorName } from '@samhan/design-system'
import {
  addDispatchComment,
  deleteDispatchComment,
  getDispatchComments,
  type DispatchComment,
} from '../../../api/dispatchCollab'
import { usePermissions } from '../../../hooks/usePermissions'

interface DispatchCommentThreadProps {
  taskId: string
  readOnly?: boolean
}

const QUERY_KEY_PREFIX = 'dispatch-comments'

export const dispatchCommentsQueryKey = (taskId: string) =>
  [QUERY_KEY_PREFIX, taskId] as const

function formatDateTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function displayAuthorName(authorName: string): string {
  return safeActorName(authorName) ?? '변경자 미상'
}

export function DispatchCommentThread({ taskId, readOnly = false }: DispatchCommentThreadProps) {
  const [body, setBody] = useState('')
  const queryClient = useQueryClient()
  const { canAccess } = usePermissions()
  const canWrite = !readOnly && canAccess('dispatch.board', 'update')
  const queryKey = useMemo(() => dispatchCommentsQueryKey(taskId), [taskId])

  const commentsQuery = useQuery({
    queryKey,
    queryFn: () => getDispatchComments(taskId),
    enabled: taskId.length > 0,
  })

  const addMutation = useMutation({
    mutationFn: (nextBody: string) =>
      addDispatchComment(taskId, { body: nextBody }),
    onSuccess: () => {
      setBody('')
      void queryClient.invalidateQueries({ queryKey })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (commentId: string) =>
      deleteDispatchComment(taskId, commentId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey })
    },
  })

  const comments = Array.isArray(commentsQuery.data)
    ? commentsQuery.data
    : []
  const trimmedBody = body.trim()

  const submit = () => {
    if (!canWrite || trimmedBody.length === 0 || addMutation.isPending) return
    addMutation.mutate(trimmedBody)
  }

  return (
    <section
      data-testid="dispatch-comment-thread"
      aria-label="코멘트"
      style={{
        borderTop: '1px solid var(--color-neutral-200)',
        paddingTop: 12,
      }}
    >
      <h4 style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 600 }}>
        코멘트
      </h4>

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          maxHeight: 260,
          overflowY: 'auto',
          marginBottom: 10,
        }}
      >
        {commentsQuery.isLoading ? (
          <p style={{ margin: 0, fontSize: 12, color: 'var(--color-neutral-500)' }}>
            코멘트를 불러오는 중...
          </p>
        ) : commentsQuery.isError ? (
          <p
            role="alert"
            style={{ margin: 0, fontSize: 12, color: 'var(--color-danger-700, #B91C1C)' }}
          >
            코멘트를 불러오지 못했습니다.
          </p>
        ) : comments.length === 0 ? (
          <p style={{ margin: 0, fontSize: 12, color: 'var(--color-neutral-500)' }}>
            아직 코멘트가 없습니다.
          </p>
        ) : (
          comments.map((comment: DispatchComment) => (
            <article
              key={comment.id}
              data-testid="dispatch-comment-item"
              style={{
                border: '1px solid var(--color-neutral-200)',
                borderRadius: 4,
                padding: 8,
                background: 'var(--color-neutral-0, #fff)',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  gap: 8,
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  fontSize: 12,
                  color: 'var(--color-neutral-600)',
                }}
              >
                <strong style={{ color: 'var(--color-neutral-900)' }}>
                  {displayAuthorName(comment.authorName)}
                </strong>
                <span style={{ marginLeft: 'auto' }}>
                  {formatDateTime(comment.createdAt)}
                </span>
                {canWrite ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    aria-label="코멘트 삭제"
                    disabled={deleteMutation.isPending}
                    onClick={() => deleteMutation.mutate(comment.id)}
                  >
                    삭제
                  </Button>
                ) : null}
              </div>
              <div
                style={{
                  marginTop: 4,
                  fontSize: 13,
                  lineHeight: 1.5,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                }}
              >
                {comment.body}
              </div>
            </article>
          ))
        )}
      </div>

      {canWrite ? (
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          <textarea
            data-testid="dispatch-comment-input"
            value={body}
            onChange={(event) => setBody(event.target.value)}
            onKeyDown={(event) => {
              if (
                event.key === 'Enter'
                && (event.ctrlKey || event.metaKey)
                && trimmedBody.length > 0
              ) {
                event.preventDefault()
                submit()
              }
            }}
            placeholder="코멘트 입력..."
            maxLength={500}
            rows={2}
            style={{
              flex: 1,
              resize: 'vertical',
              minHeight: 56,
              padding: '8px 10px',
              borderRadius: 4,
              border: '1px solid var(--color-neutral-300)',
              fontSize: 13,
              fontFamily: 'inherit',
            }}
          />
          <Button
            data-testid="dispatch-comment-submit"
            type="button"
            variant="primary"
            size="sm"
            disabled={trimmedBody.length === 0 || addMutation.isPending}
            loading={addMutation.isPending}
            onClick={submit}
          >
            등록
          </Button>
        </div>
      ) : null}

      {addMutation.isError ? (
        <p role="alert" style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--color-danger-700, #B91C1C)' }}>
          코멘트를 등록하지 못했습니다.
        </p>
      ) : null}
      {deleteMutation.isError ? (
        <p role="alert" style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--color-danger-700, #B91C1C)' }}>
          코멘트를 삭제하지 못했습니다.
        </p>
      ) : null}
    </section>
  )
}
