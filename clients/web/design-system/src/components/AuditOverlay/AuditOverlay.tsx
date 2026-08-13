/**
 * AuditOverlay — PR-H2 audit overlay 컴포넌트.
 *
 * 한 필드(예: memo, shippingAddress, line.quantity)의 현재 값과 과거 변경 이력을
 * 사용자가 한 눈에 확인할 수 있도록 시각적으로 overlay 한다.
 *
 * <h2>표시 규칙</h2>
 * <ul>
 *   <li>현재 값(currentValue) 을 검정 텍스트로 우선 표시한다.</li>
 *   <li>history 가 1건 이상이면 가장 최근 1건의 "이전 값" 을 취소선(strike-through)
 *       + 회색으로 inline 표시한다.</li>
 *   <li>각 변경 우측에는 수정자 이름(actorName) + 색상 dot(userIdToColor)
 *       + 시각(HH:mm) 을 함께 표시한다.</li>
 *   <li>history 가 2건 이상이면 "이력 N개" 버튼 클릭 시 전체 revision 목록을
 *       expand 한다 (가장 최근 → 과거 순).</li>
 * </ul>
 *
 * <h2>UUID 비공개 가드</h2>
 * <ul>
 *   <li>{@link AuditLogEntry#actorId} 는 색상 hash 입력으로만 사용 — 화면 텍스트 노출 X.</li>
 *   <li>{@link AuditLogEntry#actorName} (사용자 풀네임) 만 화면 표시.</li>
 * </ul>
 *
 * <h2>의존</h2>
 * <ul>
 *   <li>{@link userIdToColor} util (PR-H1 fda4d8f) — 동일 사용자 동일 색상 보장.</li>
 * </ul>
 *
 * @example
 * <AuditOverlay
 *   field="memo"
 *   currentValue="긴급 배송"
 *   history={[
 *     { revisionNo: 2, beforeValue: '오전 배송', actorId: 'u-1', actorName: '김영업',
 *       changedAt: '2026-05-09T14:32:18+09:00' },
 *   ]}
 * />
 */
import { useMemo, useState } from 'react'
import { userIdToColor } from '../../utils/userColorHash'
import { safeActorName } from '../../utils/actorName'
import styles from './AuditOverlay.module.css'

/** 한 revision 변경의 audit 레코드 — BE {@code SlipAuditLogResponse} 와 1:1. */
export interface AuditLogEntry {
  /** revision 번호 (1, 2, 3, ... — 큰 수록 최근). */
  revisionNo: number
  /** 변경 이전 값 (null/undefined 가능 — 신규 추가 케이스). 화면 표시 시 빈 값은 "(빈 값)"). */
  beforeValue: string | null
  /** 변경자 UUID — userIdToColor 입력 전용. 화면 텍스트 노출 금지. */
  actorId: string
  /** 변경자 풀네임 — 화면 표시. 감사 데이터가 없으면 null. */
  actorName: string | null
  /** 변경 시각 ISO-8601. */
  changedAt: string
}

export interface AuditOverlayProps {
  /** 필드 식별자 (data-testid 키 + screen reader 라벨용). 예: "memo", "shippingAddress". */
  field: string
  /** 현재 값 — null/undefined 시 "(빈 값)" 으로 표시. */
  currentValue: string | null | undefined
  /** 변경 이력 — 가장 최근(revisionNo 큰) 항목이 inline 노출. 빈 배열이면 현재 값만 표시. */
  history: AuditLogEntry[]
  /** 조회 실패 시 빈 이력으로 오해하지 않도록 실패 상태를 표시한다. */
  isError?: boolean
  /** 첫 조회가 아직 시작되지 않았는지 여부. */
  isFetched?: boolean
  /** 첫 audit 조회가 진행 중인지 여부. */
  isLoading?: boolean
}

/** "2026-05-09T14:32:18+09:00" → "14:32" — Designer print-spec.md § 3.4 동일 로직. */
function formatHHmm(iso: string): string {
  if (!iso) return ''
  return iso.slice(11, 16)
}

/** null/empty 값을 한국어로 가시화. */
function displayValue(v: string | null | undefined): string {
  if (v === null || v === undefined || v === '') return '(빈 값)'
  return v
}

const UNKNOWN_ACTOR_NAME = '변경자 미상'
/** 정규화 후 UUID 모양의 actorName은 사용자 텍스트에서 숨긴다. */
function displayActorName(actorName: string | null | undefined): string {
  return safeActorName(actorName) ?? UNKNOWN_ACTOR_NAME
}

/**
 * AuditOverlay — 한 필드의 현재값 + 과거 변경 이력 overlay.
 *
 * - history 가 비어 있으면 현재 값만 표시 (no overlay)
 * - history 가 1건 이상이면 최근 1건 inline + (2건 이상 시) "이력 N개" expand
 */
export function AuditOverlay({
  field,
  currentValue,
  history,
  isError = false,
  isFetched = true,
  isLoading = false,
}: AuditOverlayProps) {
  const [expanded, setExpanded] = useState(false)

  // 최신 → 과거 정렬 (revisionNo 내림차순). 원본 mutate 금지를 위해 slice 후 sort.
  const sorted = useMemo(
    () => [...history].sort((a, b) => b.revisionNo - a.revisionNo),
    [history],
  )
  const latest = sorted[0]
  const canShowHistory = !isError && !isLoading && isFetched
  const olderCount = canShowHistory && sorted.length > 1 ? sorted.length - 1 : 0

  return (
    <div
      className={styles['container']}
      data-testid={`audit-overlay-${field}`}
      aria-label={`${field} 변경 이력`}
    >
      <div className={styles['row']}>
        <span className={styles['current']}>{displayValue(currentValue)}</span>
        {isError ? (
          <span className={styles['empty']}>변경 이력 조회 실패</span>
        ) : isLoading ? (
          <span className={styles['empty']}>변경 이력 불러오는 중</span>
        ) : !isFetched ? (
          <span className={styles['empty']}>변경 이력 미조회</span>
        ) : latest ? (
          <>
            <span
              className={styles['before']}
              aria-label={`이전 값: ${displayValue(latest.beforeValue)}`}
            >
              {displayValue(latest.beforeValue)}
            </span>
            <span className={styles['actor']}>
              <span
                className={styles['actorDot']}
                style={{ background: userIdToColor(latest.actorId) }}
                aria-hidden="true"
              />
              <span className={styles['actorName']}>{displayActorName(latest.actorName)}</span>
              <span className={styles['timestamp']}>{formatHHmm(latest.changedAt)}</span>
            </span>
          </>
        ) : (
          <span className={styles['empty']}>변경 이력 없음</span>
        )}
      </div>

      {olderCount > 0 ? (
        <button
          type="button"
          className={styles['expandToggle']}
          onClick={() => setExpanded((prev) => !prev)}
          data-testid={`audit-overlay-${field}-expand`}
          aria-expanded={expanded}
        >
          {expanded ? '이력 닫기' : `이력 ${sorted.length}개 보기`}
        </button>
      ) : null}

      {expanded && olderCount > 0 ? (
        <ul
          className={styles['expandedList']}
          data-testid={`audit-overlay-${field}-list`}
        >
          {sorted.slice(1).map((entry) => (
            <li key={entry.revisionNo}>
              <span className={styles['before']}>{displayValue(entry.beforeValue)}</span>
              <span className={styles['actor']}>
                <span
                  className={styles['actorDot']}
                  style={{ background: userIdToColor(entry.actorId) }}
                  aria-hidden="true"
                />
                <span className={styles['actorName']}>{displayActorName(entry.actorName)}</span>
                <span className={styles['timestamp']}>{formatHHmm(entry.changedAt)}</span>
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

export default AuditOverlay
