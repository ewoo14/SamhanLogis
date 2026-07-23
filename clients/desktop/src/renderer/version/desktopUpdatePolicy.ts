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

/**
 * 기동 updater가 사용자를 기다리게 하지 않도록 둔 상한.
 * 실제 게이트웨이 왕복·로컬 payload·동일 PC 스트리밍 측정값은 라운드 보고서에 기록한다.
 */
export const DESKTOP_UPDATE_CHECK_TIMEOUT_MS = 30_000
export const DESKTOP_UPDATE_DOWNLOAD_TIMEOUT_MS = 180_000

export type DesktopUpdateErrorStage =
  | 'check'
  | 'download'
  | 'install'
  | 'check-timeout'
  | 'download-timeout'
  | 'unknown'

/** updater 내부 오류 원문 대신 화면에 표시할 고정 한국어 문구. */
export function desktopUpdateErrorMessage(stage: DesktopUpdateErrorStage): string {
  switch (stage) {
    case 'check':
      return '업데이트 확인에 실패했습니다. 인터넷 연결을 확인한 뒤 다시 실행해 주세요.'
    case 'download':
      return '업데이트를 다운로드하지 못했습니다. 인터넷 연결을 확인한 뒤 다시 실행해 주세요.'
    case 'install':
      return '업데이트를 설치하지 못했습니다. 앱을 종료한 뒤 잠시 후 다시 실행해 주세요.'
    case 'check-timeout':
      return '업데이트 확인 시간이 제한을 초과했습니다. 잠시 후 다시 확인해 주세요.'
    case 'download-timeout':
      return '업데이트 다운로드 시간이 제한을 초과했습니다. 잠시 후 다시 확인해 주세요.'
    case 'unknown':
      return '업데이트에 실패했습니다. 인터넷 연결을 확인한 뒤 다시 실행해 주세요.'
  }
}

export type DesktopUpdatePresentation =
  | { kind: 'none'; canContinue: true; canInstall: false }
  | { kind: 'minor'; canContinue: true; canInstall: boolean; version?: string; message?: string }
  | { kind: 'major'; canContinue: true; canInstall: boolean; version?: string; message?: string }
  | { kind: 'critical'; canContinue: false; canInstall?: boolean; version?: string; message?: string }

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
    canInstall: false,
    ...(status.kind === 'available' || status.kind === 'downloaded'
      ? { version: status.version }
      : {}),
    ...(status.kind === 'error' ? { message: status.message } : {}),
  }

  if (forceLevel === 'CRITICAL') {
    return status.kind === 'downloaded'
      ? { kind: 'critical', canContinue: false, canInstall: false, version: status.version }
      : {
          kind: 'critical',
          canContinue: false,
          ...(status.kind === 'error' ? { message: status.message } : {}),
        }
  }

  return { kind: forceLevel === 'MAJOR' ? 'major' : 'minor', ...common }
}
