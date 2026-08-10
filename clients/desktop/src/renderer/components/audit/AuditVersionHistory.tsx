import { Fragment, type ReactNode } from 'react'
import {
  Button,
  Card,
  Modal,
  Spinner,
} from '@samhan/design-system'
import { getApiErrorInfo } from '../../api/apiError'
import type { AuditLogEntry } from '../../api/createAuditApi'

export type AuditHistoryErrorKind = 'not-supported' | 'forbidden' | 'temporary'

/**
 * 조회 실패와 정상적인 빈 응답을 구분하기 위한 오류 분류.
 * 현재 A 계열의 404는 audit-logs endpoint 미제공 상태로 분류한다.
 */
export function classifyAuditHistoryError(error: unknown): AuditHistoryErrorKind {
  const { status } = getApiErrorInfo(error)
  if (status === 404) return 'not-supported'
  if (status === 403) return 'forbidden'
  return 'temporary'
}

export interface AuditVersionHistoryProps {
  /** createAuditApi 가 반환한 flat audit log 전체. */
  logs: AuditLogEntry[]
  /** audit log 조회 중인지 여부. */
  isLoading?: boolean
  /** audit log 조회 실패 여부. */
  isError?: boolean
  /** React Query가 보관한 원본 조회 오류. */
  error?: unknown
  /** 버전이력 모달 상태. */
  open: boolean
  /** 버튼/닫기 상태를 소유하는 화면 callback. */
  onOpenChange: (open: boolean) => void
  /** 화면별 DOM 식별자 prefix. */
  testIdPrefix: string
  /** 버튼이 놓인 곳의 보조 설명. */
  triggerAriaLabel?: string
}

interface AuditRevisionGroup {
  revisionNo: number
  logs: AuditLogEntry[]
  latestChangedAt: string
}

function timestamp(value: string): number | null {
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : null
}

function compareNewestFirst(left: AuditLogEntry, right: AuditLogEntry): number {
  const leftTime = timestamp(left.changedAt)
  const rightTime = timestamp(right.changedAt)
  if (leftTime != null && rightTime != null && leftTime !== rightTime) {
    return rightTime - leftTime
  }
  return right.revisionNo - left.revisionNo
}

function compareTimeNewestFirst(left: string, right: string): number {
  const leftTime = timestamp(left)
  const rightTime = timestamp(right)
  if (leftTime != null && rightTime != null && leftTime !== rightTime) {
    return rightTime - leftTime
  }
  return 0
}

function groupAuditLogs(logs: AuditLogEntry[]): AuditRevisionGroup[] {
  const groups = new Map<number, AuditLogEntry[]>()
  logs.forEach((log) => {
    const revisionLogs = groups.get(log.revisionNo) ?? []
    revisionLogs.push(log)
    groups.set(log.revisionNo, revisionLogs)
  })

  return Array.from(groups.entries())
    .map(([revisionNo, revisionLogs]) => {
      const sortedLogs = [...revisionLogs].sort(compareNewestFirst)
      return {
        revisionNo,
        logs: sortedLogs,
        latestChangedAt: sortedLogs[0]?.changedAt ?? '',
      }
    })
    .sort((left, right) => {
      const byTime = compareTimeNewestFirst(left.latestChangedAt, right.latestChangedAt)
      return byTime !== 0 ? byTime : right.revisionNo - left.revisionNo
    })
}

function formatValue(value: string | null): string {
  if (value === null) return '(없음)'
  if (value === '') return '(빈 값)'
  return value
}

function formatChangedAt(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('ko-KR')
}

function ChangeValue({ label, value }: { label: string; value: string | null }): ReactNode {
  return (
    <span style={{ display: 'inline-flex', gap: 4, alignItems: 'baseline', minWidth: 0 }}>
      <strong style={{ flexShrink: 0, fontSize: 12, color: 'var(--color-neutral-600)' }}>
        {label}
      </strong>
      <span style={{ overflowWrap: 'anywhere' }}>{formatValue(value)}</span>
    </span>
  )
}

/**
 * createAuditApi flat log adapter.
 *
 * 디자인 시스템 Modal을 재사용하면서 revisionNo별 카드와 field별 변경항목을
 * 조합한다. 원본 AuditOverlay는 계속 소비처에 남겨 기존 field-level 정보와
 * 현재값 표시를 보존하고, 이 adapter는 같은 로그의 전체 revision 보기를 제공한다.
 */
export function AuditVersionHistory({
  logs,
  isLoading = false,
  isError = false,
  error,
  open,
  onOpenChange,
  testIdPrefix,
  triggerAriaLabel = '버전이력',
}: AuditVersionHistoryProps) {
  const revisions = groupAuditLogs(logs)
  const modalTestId = `${testIdPrefix}-version-history`
  const errorKind = isError
    ? classifyAuditHistoryError(error)
    : undefined
  const errorMessage =
    errorKind === 'not-supported'
      ? '버전 이력 조회 기능이 아직 제공되지 않습니다.'
      : errorKind === 'forbidden'
        ? '버전 이력을 조회할 권한이 없습니다.'
        : '버전 이력을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.'

  return (
    <Fragment>
      <Button
        variant="secondary"
        type="button"
        data-testid={`${testIdPrefix}-version-history-open`}
        aria-label={triggerAriaLabel}
        onClick={() => onOpenChange(true)}
      >
        버전이력
      </Button>

      <Modal
        open={open}
        onClose={() => onOpenChange(false)}
        title="버전 이력"
        size="xl"
      >
        {isLoading ? (
          <div
            role="status"
            data-testid={`${modalTestId}-loading`}
            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0' }}
          >
            <Spinner size="sm" label="버전 이력 불러오는 중" />
            <span style={{ fontSize: 13, color: 'var(--color-neutral-500)' }}>
              버전 이력을 불러오는 중...
            </span>
          </div>
        ) : isError ? (
          <p
            role={errorKind === 'not-supported' ? 'status' : 'alert'}
            data-testid={`${modalTestId}-error`}
            data-error-kind={errorKind}
            style={{
              margin: 0,
              color:
                errorKind === 'not-supported'
                  ? 'var(--color-neutral-600)'
                  : 'var(--color-danger-600)',
            }}
          >
            {errorMessage}
          </p>
        ) : revisions.length === 0 ? (
          <p
            data-testid={`${modalTestId}-empty`}
            style={{ margin: 0, color: 'var(--color-neutral-500)' }}
          >
            아직 버전 이력이 없습니다.
          </p>
        ) : (
          <ul
            data-testid={`${modalTestId}-list`}
            style={{
              listStyle: 'none',
              margin: 0,
              padding: 0,
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
            }}
          >
            {revisions.map((revision) => (
              <li key={revision.revisionNo} data-testid={`${modalTestId}-row-${revision.revisionNo}`}>
                <Card padding={3} shadow="sm">
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'baseline',
                      gap: 12,
                      flexWrap: 'wrap',
                    }}
                  >
                    <strong style={{ fontSize: 14 }}>revision #{revision.revisionNo}</strong>
                    <span style={{ fontSize: 12, color: 'var(--color-neutral-500)' }}>
                      {formatChangedAt(revision.latestChangedAt)}
                    </span>
                  </div>

                  <details
                    data-testid={`${modalTestId}-changes-${revision.revisionNo}`}
                    style={{ marginTop: 8 }}
                  >
                    <summary
                      style={{ cursor: 'pointer', fontSize: 12, color: 'var(--color-neutral-600)' }}
                    >
                      변경 항목 {revision.logs.length}개
                    </summary>
                    <div style={{ display: 'grid', gap: 8, marginTop: 8 }}>
                      {revision.logs.map((log, index) => (
                        <div
                          key={`${log.field}-${log.changedAt}-${index}`}
                          data-testid={`${modalTestId}-change-${revision.revisionNo}-${index}`}
                          style={{
                            display: 'grid',
                            gap: 4,
                            padding: '8px 0',
                            borderTop: '1px solid var(--color-neutral-200)',
                          }}
                        >
                          <strong style={{ fontSize: 13 }}>{log.field || '(필드명 없음)'}</strong>
                          <div style={{ display: 'grid', gap: 2, fontSize: 12 }}>
                            <ChangeValue label="변경 전" value={log.beforeValue} />
                            <ChangeValue label="변경 후" value={log.afterValue} />
                          </div>
                          <span style={{ fontSize: 12, color: 'var(--color-neutral-500)' }}>
                            {log.actorName} · {formatChangedAt(log.changedAt)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </details>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </Modal>
    </Fragment>
  )
}
