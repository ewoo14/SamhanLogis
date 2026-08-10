/**
 * 도메인 공통 audit overlay UI fragment — PR-H4c FE-A.
 *
 * <p>SlipDetailPage (PR-H2 commit 435918c) 의 헤더/복원 dropdown/잠금 banner UI 묶음을
 * 12 page 일괄 적용을 위해 재사용 가능한 component 로 추출.
 *
 * <h2>제공 component</h2>
 * <ul>
 *   <li>{@link AuditRevisionBadge} — "수정 N회" badge + 복원 dropdown (한 줄)</li>
 *   <li>{@link AuditLockedBanner} — 잠금 단계 안내 banner</li>
 * </ul>
 *
 * <p>UUID 비공개 가드 — actorId 는 색상 hash 입력 전용. 화면 노출은 actorName 만.
 */
import type { AuditLogEntry } from '../../api/createAuditApi'

export interface AuditRevisionBadgeProps {
  /** audit log 전체 — distinct revisionNo 로 횟수 + 복원 후보 산출. */
  logs: AuditLogEntry[]
  /** 로딩/에러 표시 — true 시 횟수 회색 처리 + tooltip. */
  isError?: boolean
  /** 복원 진행 중 — dropdown disabled. */
  reverting?: boolean
  /** 복원 콜백 — null 이면 dropdown 미노출 (read-only 페이지). */
  onRevert?: (revisionNo: number) => void
  /** data-testid prefix (도메인 별 page 식별). */
  testIdPrefix: string
}

/**
 * "수정 N회" badge + 복원 dropdown — 도메인 page header 우상단에 배치.
 *
 * @example
 * <AuditRevisionBadge
 *   logs={auditQuery.data ?? []}
 *   isError={auditQuery.isError}
 *   reverting={revertMutation.isPending}
 *   onRevert={(rev) => revertMutation.mutate(rev)}
 *   testIdPrefix="tax-invoice-detail"
 * />
 */
export function AuditRevisionBadge({
  logs,
  isError,
  reverting,
  onRevert,
  testIdPrefix,
}: AuditRevisionBadgeProps) {
  const revisionCount = new Set(logs.map((l) => l.revisionNo)).size
  const revertCandidates = Array.from(
    new Set(logs.map((l) => l.revisionNo)),
  ).sort((a, b) => b - a)

  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      <span
        data-testid={`${testIdPrefix}-revision-count`}
        data-audit-state={isError ? 'error' : 'ready'}
        style={{
          fontSize: 13,
          color: 'var(--color-neutral-600)',
          padding: '2px 8px',
          borderRadius: 12,
          background: 'var(--color-neutral-100)',
        }}
        title={isError ? '수정 이력을 불러오지 못했습니다' : '본 entity 변경 누적 횟수'}
      >
        {isError ? '수정 이력 조회 실패' : `수정 ${revisionCount}회`}
      </span>
      {onRevert && revertCandidates.length > 0 ? (
        <select
          data-testid={`${testIdPrefix}-revert-select`}
          defaultValue=""
          disabled={reverting}
          onChange={(e) => {
            const v = e.target.value
            if (!v) return
            const rev = Number(v)
            if (
              !window.confirm(
                `이 entity 를 revision #${rev} 시점으로 복원하시겠습니까?\n\n현재 값은 새 revision 으로 보존됩니다.`,
              )
            ) {
              e.target.value = ''
              return
            }
            onRevert(rev)
            e.target.value = ''
          }}
          style={{
            padding: '4px 8px',
            borderRadius: 4,
            border: '1px solid var(--color-neutral-300)',
            fontSize: 13,
          }}
          aria-label="이전 revision 으로 복원"
        >
          <option value="">복원...</option>
          {revertCandidates.map((rev) => (
            <option
              key={rev}
              value={rev}
              data-testid={`${testIdPrefix}-revert-button-${rev}`}
            >
              revision #{rev} 으로 복원
            </option>
          ))}
        </select>
      ) : null}
    </div>
  )
}

export interface AuditLockedBannerProps {
  /** 현재 status 라벨 (사용자 노출용). */
  statusLabel: string
  /** data-testid (도메인 별). */
  testId: string
  /** 잠금 사유 안내문 — 도메인 별 차이. 미지정 시 일반 안내. */
  message?: string
}

/**
 * 변경 차단 단계 안내 banner — SlipDetailPage 의 isLocked banner 패턴 1:1 복제.
 */
export function AuditLockedBanner({
  statusLabel,
  testId,
  message,
}: AuditLockedBannerProps) {
  return (
    <div
      role="alert"
      data-testid={testId}
      style={{
        padding: '10px 12px',
        marginBottom: 12,
        borderRadius: 6,
        border: '1px solid var(--color-warning-300, #FCD34D)',
        background: 'var(--color-warning-50, #FFFBEB)',
        color: 'var(--color-warning-800)',
        fontSize: 13,
      }}
    >
      현재 단계({statusLabel})에서는 변경이 차단됩니다.
      {message ? ` ${message}` : ''}
    </div>
  )
}

/**
 * audit log 배열을 field 별로 group — AuditOverlay history prop 형식.
 *
 * @example
 * const auditByField = groupAuditLogsByField(auditQuery.data ?? [])
 * <AuditOverlay field="memo" currentValue={x.memo} history={auditByField['memo'] ?? []} />
 */
export function groupAuditLogsByField(
  logs: AuditLogEntry[],
): Record<string, AuditLogEntry[]> {
  return logs.reduce<Record<string, AuditLogEntry[]>>((acc, log) => {
    const list = acc[log.field] ?? []
    list.push(log)
    acc[log.field] = list
    return acc
  }, {})
}

export interface AuditInfoBannerProps {
  /** 도메인별 안내 메시지. */
  message: string
  /** data-testid. */
  testId: string
}

/**
 * read-only 페이지의 audit 안내 banner — entity 단위 audit 노출이 어려운 aggregate
 * 페이지(거래처 원장 / 통계 배치 / 홈택스 export 등) 에서 "변경 이력은 원본 entity
 * 상세 화면에서 확인" 안내 표시.
 */
export function AuditInfoBanner({ message, testId }: AuditInfoBannerProps) {
  return (
    <div
      role="status"
      data-testid={testId}
      style={{
        padding: '8px 12px',
        marginBottom: 12,
        borderRadius: 6,
        border: '1px solid var(--color-info-300, #93C5FD)',
        background: 'var(--color-info-50, #EFF6FF)',
        color: 'var(--color-info-800, #1E40AF)',
        fontSize: 12,
      }}
    >
      {message}
    </div>
  )
}
