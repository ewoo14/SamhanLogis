/**
 * RoleGuard — 라우트 단위 role 화이트리스트 가드.
 *
 * accounting-slice-A 신규. 회계 라우트는 ACCOUNTANT/MANAGER/MASTER 가 진입하며,
 * 그 외 role 의 사용자는 안내 메시지를 보고 대시보드로 돌아갈 수 있다.
 *
 * `feedback_role_naming_full.md` — role 표기는 풀네임 (M/M/D 약어 금지). 본
 * 컴포넌트의 props 와 렌더 메시지 모두 풀네임을 사용한다.
 *
 * AuthGuard (인증 여부) 와 별개로 이중 방어 — AuthGuard 통과 후 본 가드를
 * children 으로 wrap.
 */
import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@samhan/design-system'
import { useSessionStore } from '../stores/session'

export interface RoleGuardProps {
  /** 진입을 허용할 role 화이트리스트. 풀네임 의무 (예: ACCOUNTANT, MASTER). */
  allow: readonly string[]
  /** 가드 통과 시 렌더링. */
  children: ReactNode
}

export function RoleGuard({ allow, children }: RoleGuardProps) {
  const role = useSessionStore((s) => s.auth?.role)
  const navigate = useNavigate()

  if (role && allow.includes(role)) {
    return <>{children}</>
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 12,
        padding: 48,
      }}
    >
      <h3 style={{ margin: 0 }}>접근 권한이 없습니다</h3>
      <p style={{ margin: 0, fontSize: 13, color: '#6B7280' }}>
        본 화면은 {allow.join(' / ')} 권한 보유자만 접근 가능합니다.
        <br />현재 role: {role ?? '(미인증)'}
      </p>
      <Button variant="primary" onClick={() => navigate('/', { replace: true })}>
        대시보드로 돌아가기
      </Button>
    </div>
  )
}
