/**
 * 견적 revision 복원과 legacy 협업 문서의 첫 편집 진입 사이를 잇는 브라우저 세대 fence.
 *
 * <p>R26 이전 Y.Doc은 {@code estimateServerVersion} 헤더가 없어 같은 세대의 미저장
 * 입력과 복원 전 stale 행을 구분할 수 없다. 복원 성공 시 서버 version을 session storage에
 * 잠깐 기록하고 첫 편집 진입에서만 소비해, 복원 결과를 우선 seed한다. 사용자 화면에는
 * 노출되지 않는 내부 경계값이다.
 */
const ESTIMATE_RESTORE_FENCE_PREFIX = 'samhan:estimate-restore-version:'

function storage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.sessionStorage
  } catch {
    return null
  }
}

function key(estimateId: string): string {
  return `${ESTIMATE_RESTORE_FENCE_PREFIX}${estimateId}`
}

/** 복원 성공 후 다음 견적 편집 진입에 적용할 서버 version을 기록한다. */
export function markEstimateRestoreFence(estimateId: string, serverVersion: number | string): void {
  storage()?.setItem(key(estimateId), String(serverVersion))
}

/** 현재 서버 version과 일치하는 복원 fence만 1회 소비한다. */
export function consumeEstimateRestoreFence(estimateId: string, serverVersion: number | string): boolean {
  const store = storage()
  if (!store) return false
  const fenceKey = key(estimateId)
  if (store.getItem(fenceKey) !== String(serverVersion)) return false
  store.removeItem(fenceKey)
  return true
}
