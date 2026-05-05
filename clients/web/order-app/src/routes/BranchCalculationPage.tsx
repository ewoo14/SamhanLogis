/**
 * 임의 분기계산 (legacy `#pageBranch` 라인 923).
 *
 * <p>실외기 column 사이 실내기 capsule DnD 이동. M1a `branch-pipes/lookup` API 활용.
 *
 * <p>현 단계: 핵심 5 route 완성 우선 — DnD UI 는 후속 PR (Sub-team C 분량 안내).
 * placeholder 만 표시.
 */
import { Link } from 'react-router-dom'

export function BranchCalculationPage() {
  return (
    <div className="wrap">
      <div className="top">
        <div className="title">임의 분기계산</div>
        <div className="top-actions">
          <Link className="btn btn-ghost" to="/orders/new">
            상업멀티로 돌아가기
          </Link>
        </div>
      </div>
      <div style={{ padding: 32, textAlign: 'center', color: 'var(--c-muted)' }}>
        분기계산 DnD UI 는 후속 PR (Sub-team C 후속 보강).<br />
        M1a <code>/api/v1/branch-pipes/lookup</code> API 와 `BranchPipeMatrix` 컴포넌트 통합 예정.
      </div>
    </div>
  )
}
