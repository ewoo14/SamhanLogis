/**
 * 거래처 등록 (승인 요청) — legacy `requestAuthApproval` 1:1 모방.
 *
 * <p>NOT_FOUND_AUTH / PENDING status 에서 진입. 사업자번호는 BizGate 에서
 * `location.state` 로 전달받음.
 */
import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { requestAuthApproval } from '../api/auth'

interface LocationState {
  bizno?: string
  status?: string
}

export function RegisterPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const state = (location.state ?? {}) as LocationState

  const [bizno] = useState(state.bizno ?? '')
  const [partnerName, setPartnerName] = useState('')
  const [contact, setContact] = useState('')
  const [requesterName, setRequesterName] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [err, setErr] = useState('')

  async function handleSubmit() {
    setErr('')
    if (!bizno || !partnerName || !contact || !requesterName) {
      setErr('모든 항목을 입력해주세요.')
      return
    }
    setBusy(true)
    try {
      await requestAuthApproval({ bizno, partnerName, contact, requesterName })
      setDone(true)
    } catch (e) {
      setErr(e instanceof Error ? e.message : '승인 요청 실패')
    } finally {
      setBusy(false)
    }
  }

  if (done) {
    return (
      <div className="page-gate">
        <div className="biz-box">
          <div className="page-loading-emoji">⏳</div>
          <div className="biz-title">승인 요청 완료</div>
          <div className="page-loading-msg" style={{ color: '#d1d5db', fontSize: 14 }}>
            관리자 검토 후 안내드리겠습니다.{'\n'}영업일 1~2일 소요됩니다.
          </div>
          <div className="biz-buttons">
            <button className="btn" onClick={() => navigate('/auth/login', { replace: true })}>
              게이트로 이동
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="page-gate">
      <div className="biz-box">
        <div className="biz-title">거래처 등록 / 승인 요청</div>
        {state.status === 'PENDING' && (
          <div style={{ color: '#fbbf24', fontSize: 13, textAlign: 'center', marginBottom: 12 }}>
            현재 승인 대기 중입니다. 추가 정보를 보내주시면 빠르게 처리됩니다.
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <label style={{ color: '#9ca3af', fontSize: 13 }}>사업자등록번호</label>
          <input
            value={bizno}
            readOnly
            className="biz-field-input"
            style={{
              height: 40,
              borderRadius: 10,
              border: '1px solid #1f2937',
              background: '#020617',
              color: '#9ca3af',
              padding: '0 10px',
              textAlign: 'center',
            }}
          />

          <label style={{ color: '#9ca3af', fontSize: 13, marginTop: 6 }}>거래처명</label>
          <input
            value={partnerName}
            onChange={(e) => setPartnerName(e.target.value)}
            placeholder="(주)거래처명"
            style={{
              height: 40,
              borderRadius: 10,
              border: '1px solid #1f2937',
              background: '#020617',
              color: '#e5e7eb',
              padding: '0 10px',
            }}
          />

          <label style={{ color: '#9ca3af', fontSize: 13, marginTop: 6 }}>담당자</label>
          <input
            value={requesterName}
            onChange={(e) => setRequesterName(e.target.value)}
            placeholder="홍길동"
            style={{
              height: 40,
              borderRadius: 10,
              border: '1px solid #1f2937',
              background: '#020617',
              color: '#e5e7eb',
              padding: '0 10px',
            }}
          />

          <label style={{ color: '#9ca3af', fontSize: 13, marginTop: 6 }}>연락처</label>
          <input
            value={contact}
            onChange={(e) => setContact(e.target.value)}
            placeholder="010-0000-0000"
            inputMode="tel"
            style={{
              height: 40,
              borderRadius: 10,
              border: '1px solid #1f2937',
              background: '#020617',
              color: '#e5e7eb',
              padding: '0 10px',
            }}
          />
        </div>

        {err && <div style={{ marginTop: 12, color: '#fca5a5', fontSize: 13 }}>{err}</div>}

        <div className="biz-buttons">
          <button
            className="btn"
            style={{ background: '#4b5563' }}
            onClick={() => navigate('/auth/login', { replace: true })}
          >
            취소
          </button>
          <button className="btn" onClick={() => void handleSubmit()} disabled={busy}>
            {busy ? '제출 중...' : '승인 요청'}
          </button>
        </div>
      </div>
    </div>
  )
}
