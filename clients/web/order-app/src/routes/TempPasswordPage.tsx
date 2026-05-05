/**
 * 임시 비밀번호 설정 (legacy `setAuthPassword` 1:1 모방).
 *
 * <p>NEED_PW_SET status 에서 진입. 4자리 PW + 확인 일치 + 과거 5개 중복 차단.
 */
import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { setAuthPassword } from '../api/auth'
import { useSessionStore } from '../stores/session'

interface LocationState {
  bizno?: string
  partnerName?: string
}

export function TempPasswordPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const setAuth = useSessionStore((s) => s.setAuth)
  const state = (location.state ?? {}) as LocationState

  const [pw1, setPw1] = useState('')
  const [pw2, setPw2] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  async function handleSubmit() {
    setErr('')
    setBusy(true)
    try {
      const session = await setAuthPassword(state.bizno ?? '', pw1, pw2)
      setAuth(session)
      navigate('/orders/new', { replace: true })
    } catch (e) {
      setErr(e instanceof Error ? e.message : '비밀번호 설정 실패')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="page-gate">
      <div className="biz-box">
        <div className="biz-title">신규 비밀번호 설정</div>
        {state.partnerName && (
          <div style={{ color: '#60a5fa', textAlign: 'center', marginBottom: 12, fontSize: 14 }}>
            {state.partnerName}
          </div>
        )}
        <div style={{ color: '#9ca3af', fontSize: 13, textAlign: 'center', marginBottom: 16 }}>
          4자리 숫자 비밀번호를 설정해주세요.<br />
          (과거 사용한 비밀번호 5개는 사용할 수 없습니다.)
        </div>

        <div className="biz-field-row" style={{ marginBottom: 8 }}>
          <input
            type="password"
            inputMode="numeric"
            maxLength={4}
            placeholder="비밀번호 (4자리)"
            value={pw1}
            onChange={(e) => setPw1(e.target.value.replace(/\D/g, ''))}
          />
        </div>
        <div className="biz-field-row" style={{ marginBottom: 8 }}>
          <input
            type="password"
            inputMode="numeric"
            maxLength={4}
            placeholder="비밀번호 확인"
            value={pw2}
            onChange={(e) => setPw2(e.target.value.replace(/\D/g, ''))}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void handleSubmit()
            }}
          />
        </div>

        {err && <div style={{ marginTop: 12, color: '#fca5a5', fontSize: 13, textAlign: 'center' }}>{err}</div>}

        <div className="biz-buttons">
          <button
            className="btn"
            style={{ background: '#4b5563' }}
            onClick={() => navigate('/auth/login', { replace: true })}
          >
            취소
          </button>
          <button className="btn" onClick={() => void handleSubmit()} disabled={busy}>
            {busy ? '저장 중...' : '설정'}
          </button>
        </div>
      </div>
    </div>
  )
}
