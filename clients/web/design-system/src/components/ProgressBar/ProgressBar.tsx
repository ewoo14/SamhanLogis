/**
 * `<ProgressBar>` — 전표 진행 단계 (sales-polish-2-slice 신규).
 *
 * Designer `components.md` § 1 spec 충실 반영.
 *
 * 사용자 피드백 #1 ("라이프사이클" 표현 모호) 해결 — `SlipDetailPage` 상단에
 * 표시되는 10단계 + 분기 (REJECTED/CANCELED) 시각화 컴포넌트.
 *
 * 10단계 (Slice A 에서 INSPECTING 신규 추가):
 *   DRAFT → SAVED → SENT → ACCEPTED → PROCESSING → INSPECTING(신규) → COMPLETED
 *         → SHIPPING → DELIVERED → CONFIRMED
 *
 * 분기 2종 (정상 흐름에서 빠져나가는 종결 상태):
 * - `REJECTED` — 마지막 done 단계 이후 ⊗ 빨강 채움 + 라벨 "반려"
 * - `CANCELED` — 마지막 done 단계 이후 ⊗ 회색 채움 + 라벨 "취소"
 *
 * Visual states (Designer wireframes.md § 2.5):
 * - done     ● 파란 배경 (`--progress-step-bg-done`)
 * - current  ● 흰 배경 + 2px 파란 외곽선 + bold 600
 * - todo     ○ 흰 배경 + 2px 회색 외곽선 + tertiary text
 * - rejected ⊗ 빨간 배경 + 흰 X icon + bold 600
 * - canceled ⊗ 회색 배경 + 흰 X icon + bold 600
 *
 * 접근성:
 * - role="progressbar" + aria-valuemin/max/now
 * - 각 노드 aria-label="{label} — {state}"
 * - tabindex="0" + Enter/Space → onStepClick 콜백
 *
 * UUID 비공개 가드 — 본 컴포넌트는 status enum + 라벨만 표시. UUID 노출 X.
 */
import { forwardRef } from 'react'
import { safeActorName } from '../../utils/actorName'
import styles from './ProgressBar.module.css'
import type { SlipStatus } from '../SlipStatusBadge/SlipStatusBadge'

/**
 * 정상 진행 6단계 정의 (PR #21 hotfix — 개발책임자 회신 단순화).
 *
 * 사용자 명시 단계: 작성 중 → 창고 전송 → 출고 중 → 검수 중 → 배송 중 → 배송완료.
 *
 * 내부 SlipStatus enum 10단계 → 6 stage 매핑:
 * - 작성 중:   DRAFT, SAVED
 * - 창고 전송: SENT, ACCEPTED
 * - 출고 중:   PROCESSING
 * - 검수 중:   INSPECTING
 * - 배송 중:   COMPLETED, SHIPPING
 * - 배송완료: DELIVERED, CONFIRMED
 *
 * `statuses` 첫 원소는 "stage 의 대표 status" (transition 시점 기준).
 */
export const PROGRESS_STEPS: ReadonlyArray<{
  /** 대표 status — onStepClick 콜백에 전달. */
  status: SlipStatus
  label: string
  /** 본 stage 가 포괄하는 SlipStatus enum 값들. */
  statuses: ReadonlyArray<SlipStatus>
}> = [
  { status: 'DRAFT',      label: '작성 중',   statuses: ['DRAFT', 'SAVED'] },
  { status: 'SENT',       label: '창고 전송', statuses: ['SENT', 'ACCEPTED'] },
  { status: 'PROCESSING', label: '출고 중',   statuses: ['PROCESSING'] },
  { status: 'INSPECTING', label: '검수 중',   statuses: ['INSPECTING'] },
  { status: 'COMPLETED',  label: '배송 중',   statuses: ['COMPLETED', 'SHIPPING'] },
  { status: 'DELIVERED',  label: '배송완료', statuses: ['DELIVERED', 'CONFIRMED'] },
]

/** 단계별 시각 상태. */
type StepState = 'done' | 'current' | 'todo'
/** 분기 노드 시각 상태 (정상 단계 뒤에 추가 표시). */
type BranchKind = 'rejected' | 'canceled'

export interface ProgressBarHistoryItem {
  status: SlipStatus
  /** ISO 8601 timestamp. */
  transitionedAt: string
  actorFullName?: string
}

export interface ProgressBarProps {
  /** 현재 전표 상태 (10단계 중 하나 또는 분기). */
  currentStatus: SlipStatus
  /** 분기 사유 (REJECTED/CANCELED 시 ProgressBar 아래 표시). */
  branchReason?: string
  /** 단계별 transition 히스토리 (옵션 — 노드 hover tooltip). */
  history?: ProgressBarHistoryItem[]
  /** 노드 클릭 콜백 (옵션 — done 노드 클릭 시 history 모달 등). */
  onStepClick?: (status: SlipStatus) => void
}

/**
 * 분기 시 마지막 done 단계의 인덱스 결정.
 *
 * REJECTED 는 SENT/ACCEPTED 시점에서 발생 (Designer wireframes.md § 2.3 케이스).
 * CANCELED 는 DRAFT/SAVED/SENT 시점에서 발생 (§ 2.4 케이스).
 *
 * 본 컴포넌트는 history 가 없을 때 보수적으로 SENT (index 2) 를 마지막 done 으로
 * 가정. history 가 있으면 그 중 마지막 정상 status 의 인덱스를 사용.
 */
function lastDoneIndexForBranch(
  branchKind: BranchKind,
  history: ProgressBarHistoryItem[] | undefined,
): number {
  if (history && history.length > 0) {
    let maxIdx = -1
    for (const h of history) {
      const idx = PROGRESS_STEPS.findIndex((s) => s.statuses.includes(h.status))
      if (idx > maxIdx) maxIdx = idx
    }
    if (maxIdx >= 0) return maxIdx
  }
  // history 없을 때 보수적 default — REJECTED 는 창고 전송(1) 까지, CANCELED 는 작성 중(0).
  return branchKind === 'rejected' ? 1 : 0
}

/**
 * `<ProgressBar>` — 전표 진행 단계 시각화 컴포넌트.
 *
 * @example
 * ```tsx
 * <ProgressBar currentStatus="ACCEPTED" />
 * <ProgressBar currentStatus="REJECTED" branchReason="재고 부족" />
 * ```
 */
export const ProgressBar = forwardRef<HTMLDivElement, ProgressBarProps>(
  function ProgressBar({ currentStatus, branchReason, history, onStepClick }, ref) {
    const branchKind: BranchKind | null =
      currentStatus === 'REJECTED'
        ? 'rejected'
        : currentStatus === 'CANCELED'
          ? 'canceled'
          : null

    const currentIndex = branchKind === null
      ? PROGRESS_STEPS.findIndex((s) => s.statuses.includes(currentStatus))
      : -1

    const lastDoneIdx = branchKind !== null
      ? lastDoneIndexForBranch(branchKind, history)
      : -1

    const ariaValueNow = branchKind === null
      ? Math.max(1, currentIndex + 1)
      : lastDoneIdx + 1

    const handleNodeKey = (e: React.KeyboardEvent<HTMLDivElement>, status: SlipStatus) => {
      if (!onStepClick) return
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        onStepClick(status)
      }
    }

    /** 단계별 visual state 결정. */
    const stateForIndex = (idx: number): StepState => {
      if (branchKind !== null) {
        // 분기 시: 마지막 done 까지만 done, 그 이후는 모두 todo
        if (idx <= lastDoneIdx) return 'done'
        return 'todo'
      }
      if (idx < currentIndex) return 'done'
      if (idx === currentIndex) return 'current'
      return 'todo'
    }

    /** 라인 색상 (i 와 i+1 사이 연결선). */
    const lineColorClass = (i: number): string => {
      if (branchKind !== null) {
        if (i < lastDoneIdx) return styles['lineDone']!
        // 마지막 done → 분기 노드: 분기 색
        if (i === lastDoneIdx) {
          return branchKind === 'rejected' ? styles['lineRejected']! : styles['lineCanceled']!
        }
        return styles['lineTodo']!
      }
      if (i < currentIndex) return styles['lineDone']!
      return styles['lineTodo']!
    }

    return (
      <div
        ref={ref}
        className={styles['progressBar']}
        role="progressbar"
        aria-valuemin={1}
        aria-valuemax={PROGRESS_STEPS.length}
        aria-valuenow={ariaValueNow}
        aria-label="전표 진행 단계"
      >
        <div className={styles['header']}>전표 진행 단계</div>

        <div className={styles['track']}>
          {PROGRESS_STEPS.map((step, i) => {
            const state = stateForIndex(i)
            const isCurrent = state === 'current'
            const showBranchAfterThis = branchKind !== null && i === lastDoneIdx
            const stateLabel =
              state === 'done' ? '완료' : state === 'current' ? '현재' : '미진행'
            const nodeClass = [
              styles['step'],
              styles[`state-${state}`],
              isCurrent ? styles['current'] : null,
            ]
              .filter(Boolean)
              .join(' ')
            const labelClass = [
              styles['label'],
              styles[`labelState-${state}`],
            ].join(' ')

            return (
              <div key={step.status} className={styles['stepWrapper']}>
                <div className={styles['stepCol']}>
                  <div
                    className={nodeClass}
                    tabIndex={onStepClick ? 0 : -1}
                    role={onStepClick ? 'button' : undefined}
                    aria-label={`${step.label} — ${stateLabel}`}
                    onClick={() => onStepClick?.(step.status)}
                    onKeyDown={(e) => handleNodeKey(e, step.status)}
                    title={(() => {
                      const actorName = safeActorName(
                        history?.find((h) => step.statuses.includes(h.status))?.actorFullName,
                      )
                      return actorName ? `${step.label} — ${actorName}` : step.label
                    })()}
                  >
                    {state === 'done' || state === 'current' ? (
                      <span className={styles['nodeFilled']} aria-hidden="true" />
                    ) : (
                      <span className={styles['nodeOutline']} aria-hidden="true" />
                    )}
                  </div>
                  <div className={labelClass}>{step.label}</div>
                </div>

                {/* 정상 단계 사이 연결선 */}
                {i < PROGRESS_STEPS.length - 1 ? (
                  <div className={`${styles['line']} ${lineColorClass(i)}`} aria-hidden="true" />
                ) : null}

                {/* 분기 노드 — 마지막 done 노드 바로 뒤 (현 노드와 같은 row) */}
                {showBranchAfterThis ? (
                  <div className={styles['branchWrapper']} aria-hidden="false">
                    <div className={styles['stepCol']}>
                      <div
                        className={`${styles['step']} ${styles[`branch-${branchKind}`]}`}
                        aria-label={branchKind === 'rejected' ? '반려' : '취소'}
                      >
                        <span className={styles['branchIcon']} aria-hidden="true">
                          ⊗
                        </span>
                      </div>
                      <div
                        className={`${styles['label']} ${styles[`labelBranch-${branchKind}`]}`}
                      >
                        {branchKind === 'rejected' ? '반려' : '취소'}
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
            )
          })}
        </div>

        {branchKind !== null && branchReason ? (
          <p
            className={`${styles['branchReason']} ${
              branchKind === 'rejected'
                ? styles['branchReasonRejected']
                : styles['branchReasonCanceled']
            }`}
            role="note"
          >
            {branchKind === 'rejected' ? '반려 사유' : '취소 사유'}: {branchReason}
          </p>
        ) : null}
      </div>
    )
  },
)

export default ProgressBar
