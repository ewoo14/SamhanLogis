/**
 * Electron updater가 렌더러에 전달하는 상태.
 * 정책 판정과 Electron IPC를 분리해, 오프라인/실패 상태도 동일한 계약으로 표시한다.
 */
export type DesktopUpdateStatus =
  | { kind: 'checking' }
  | { kind: 'available'; version: string }
  | { kind: 'downloading'; percent: number }
  | { kind: 'downloaded'; version: string }
  | { kind: 'not-available' }
  | { kind: 'error'; message: string }

export type DesktopUpdatePresentation =
  | { kind: 'none'; canContinue: true; canInstall: false }
  | { kind: 'minor'; canContinue: true; canInstall: boolean; version?: string; message?: string }
  | { kind: 'major'; canContinue: true; canInstall: boolean; version?: string; message?: string }
  | { kind: 'critical'; canContinue: false; canInstall?: true; version?: string; message?: string }

/**
 * BE가 결정한 forceLevel을 실제 desktop updater 화면 정책으로 변환한다.
 * CRITICAL은 확인된 업데이트가 없거나 다운로드에 실패해도 계속 사용하지 못하게 한다.
 * 이는 schema v2를 모르는 구버전이 잘못된 양식을 인쇄할 수 있기 때문이다.
 */
export function resolveDesktopUpdatePresentation(
  forceLevel: 'NONE' | 'MINOR' | 'MAJOR' | 'CRITICAL',
  status: DesktopUpdateStatus,
): DesktopUpdatePresentation {
  if (forceLevel === 'NONE') {
    return { kind: 'none', canContinue: true, canInstall: false }
  }

  const common = {
    canContinue: true as const,
    canInstall: status.kind === 'downloaded',
    ...(status.kind === 'available' || status.kind === 'downloaded'
      ? { version: status.version }
      : {}),
    ...(status.kind === 'error' ? { message: status.message } : {}),
  }

  if (forceLevel === 'CRITICAL') {
    return status.kind === 'downloaded'
      ? { kind: 'critical', canContinue: false, canInstall: true, version: status.version }
      : {
          kind: 'critical',
          canContinue: false,
          ...(status.kind === 'error' ? { message: status.message } : {}),
        }
  }

  return { kind: forceLevel === 'MAJOR' ? 'major' : 'minor', ...common }
}
