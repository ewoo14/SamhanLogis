import { useEffect, useRef, useState, type ReactNode } from 'react'
import { AppUpdateNotice } from '@samhan/design-system'
import { CertificateExpiryNotice } from './CertificateExpiryNotice'

type UpdateStatus =
  | { kind: 'checking' }
  | { kind: 'available'; version?: string }
  | { kind: 'downloading'; percent?: number }
  | { kind: 'downloaded'; version?: string }
  | { kind: 'not-available' }
  | { kind: 'error'; message?: string }

function severity(message: string): 'network' | 'integrity' | 'trust' {
  if (/인증서|신뢰|certificate|signature/i.test(message)) return 'trust'
  if (/손상|검증|integrity|checksum|hash/i.test(message)) return 'integrity'
  return 'network'
}

function title(status: UpdateStatus): string {
  if (status.kind === 'error') {
    const kind = severity(status.message ?? '')
    if (kind === 'trust') return '업데이트 파일의 인증서를 신뢰할 수 없습니다'
    if (kind === 'integrity') return '업데이트 파일을 확인하지 못했습니다'
    return '업데이트 서버에 연결하지 못했습니다'
  }
  if (status.kind === 'checking') return '업데이트를 확인하는 중입니다'
  if (status.kind === 'available') return '새 업데이트를 준비하고 있습니다'
  if (status.kind === 'downloading') return '새 업데이트를 다운로드하는 중입니다'
  if (status.kind === 'downloaded') return '새 업데이트를 설치할 준비가 되었습니다'
  return '업데이트 상태'
}

function description(status: UpdateStatus): string {
  if (status.kind === 'checking') return '업데이트를 확인하는 중입니다.'
  if (status.kind === 'available') return status.version ? `새 버전 ${status.version}을 다운로드하는 중입니다.` : '새 버전을 다운로드하는 중입니다.'
  if (status.kind === 'downloading') return `새 버전을 다운로드하는 중입니다. ${Math.round(status.percent ?? 0)}%`
  if (status.kind === 'downloaded') return '새 버전을 설치하고 앱을 다시 시작하는 중입니다.'
  if (status.kind === 'error') return status.message ?? '업데이트 서버에 연결하지 못했습니다. 잠시 후 다시 확인해 주세요.'
  return ''
}

export function InternalChatUpdateGate({ children }: { children: ReactNode }): JSX.Element {
  const [status, setStatus] = useState<UpdateStatus | null>(null)
  const installStarted = useRef(false)
  const updater = window.internalChatUpdater

  const check = () => {
    if (!updater) return
    setStatus({ kind: 'checking' })
    void updater.check().catch(() => setStatus({ kind: 'error' }))
  }

  useEffect(() => {
    if (!updater) return undefined
    const unsubscribe = updater.onStatus((raw) => {
      if (!raw || typeof raw !== 'object' || !('kind' in raw)) return
      setStatus(raw as UpdateStatus)
    })
    check()
    return unsubscribe
  }, [])

  useEffect(() => {
    if (status?.kind !== 'downloaded' || installStarted.current || !updater) return
    installStarted.current = true
    void updater.install().catch(() => {
      installStarted.current = false
      setStatus({ kind: 'error', message: '업데이트 설치에 실패했습니다. 다시 확인해 주세요.' })
    })
  }, [status?.kind])

  const updateNotice = status && status.kind !== 'not-available' ? (
    <AppUpdateNotice
      severity={status.kind === 'error' ? severity(status.message ?? '') : 'network'}
      title={title(status)}
      description={description(status)}
      testId="internal-chat-auto-update-status"
      actions={<button type="button" onClick={check}>다시 확인</button>}
    />
  ) : null

  return <>{updateNotice}<CertificateExpiryNotice />{children}</>
}
