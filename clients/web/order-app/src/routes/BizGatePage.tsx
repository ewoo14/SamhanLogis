/**
 * 사업자번호 게이트 (legacy `#pageBizGate` line 566 1:1 모방).
 *
 * <p>흐름 (legacy `checkAuthStatus` 10 status enum 분기):
 * 1. 사업자번호 입력 (`#bizGateInput`) → `checkAuthStatus(bizno)`
 * 2. status 분기:
 *    - OK / NEED_PW_INPUT → 인라인 PW 입력 (page 전환 X)
 *    - NEED_PW_SET → `/auth/temp-password` 로 이동
 *    - NOT_FOUND_AUTH / PENDING → `/auth/register` 로 이동
 *    - LOCKED / LONG_UNUSED / ACCESS_DENIED / PW_EXPIRED → 안내만
 *    - ERROR → 시스템 오류 안내
 * 3. PW 일치 시 `/orders/new` 로 이동 (legacy completeLogin)
 *
 * <p>본 화면은 page-gate 어두운 배경 (#020617) 위 biz-box (어두운 #0b1120 카드).
 */
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { checkAuthStatus, tryLogin } from '../api/auth'
import { useSessionStore } from '../stores/session'
import { useDcConfigStore } from '../stores/dcConfigStore'
import type { AuthStatus } from '../types'

const ICON_MAP: Record<AuthStatus, string> = {
  OK: '✅',
  NEED_PW_INPUT: '🔐',
  NEED_PW_SET: '🆕',
  NOT_FOUND_AUTH: '⏳',
  PENDING: '⏳',
  NOT_FOUND_SYSTEM: '🛑',
  LOCKED: '🔒',
  LONG_UNUSED: '⚠️',
  ACCESS_DENIED: '🚫',
  PW_EXPIRED: '⏰',
  ERROR: '🛑',
}

const TITLE_MAP: Record<AuthStatus, string> = {
  OK: '인증 통과',
  NEED_PW_INPUT: '비밀번호 입력',
  NEED_PW_SET: '신규 비밀번호 설정',
  NOT_FOUND_AUTH: '거래처 등록 필요',
  PENDING: '승인 대기 중',
  NOT_FOUND_SYSTEM: '거래처 정보 없음',
  LOCKED: '계정 잠금',
  LONG_UNUSED: '장기 미사용',
  ACCESS_DENIED: '접근 차단',
  PW_EXPIRED: '비밀번호 만료',
  ERROR: '시스템 오류',
}

export function BizGatePage() {
  const navigate = useNavigate()
  const setAuth = useSessionStore((s) => s.setAuth)
  const loadDcConfig = useDcConfigStore((s) => s.loadFor)
  const [bizno, setBizno] = useState('')
  const [step, setStep] = useState<'INPUT' | 'ACTION'>('INPUT')
  const [status, setStatus] = useState<AuthStatus | null>(null)
  const [partnerName, setPartnerName] = useState('')
  const [message, setMessage] = useState('')
  const [pw1, setPw1] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  function formatBizno(raw: string): string {
    const d = raw.replace(/\D/g, '').slice(0, 10)
    if (d.length < 4) return d
    if (d.length < 6) return `${d.slice(0, 3)}-${d.slice(3)}`
    return `${d.slice(0, 3)}-${d.slice(3, 5)}-${d.slice(5)}`
  }

  async function handleBizQuery() {
    setErr('')
    if (bizno.replace(/\D/g, '').length !== 10) {
      setErr('사업자등록번호 10자리를 모두 입력해주세요.')
      return
    }
    setBusy(true)
    try {
      const res = await checkAuthStatus(bizno)
      setStatus(res.status)
      setPartnerName(res.partnerName)
      setMessage(res.message)

      if (res.status === 'NEED_PW_SET') {
        navigate('/auth/temp-password', { state: { bizno, partnerName: res.partnerName } })
        return
      }
      if (res.status === 'NOT_FOUND_AUTH' || res.status === 'PENDING') {
        navigate('/auth/register', { state: { bizno, status: res.status } })
        return
      }
      setStep('ACTION')
    } catch (e) {
      setErr(e instanceof Error ? e.message : '조회 중 오류가 발생했습니다.')
    } finally {
      setBusy(false)
    }
  }

  async function handleAuthAction() {
    setErr('')
    if (status !== 'NEED_PW_INPUT' && status !== 'OK') {
      // 안내성 status — 게이트 최초로 복귀
      setStep('INPUT')
      setStatus(null)
      return
    }
    if (!/^\d{4}$/.test(pw1)) {
      setErr('비밀번호 4자리를 입력해주세요.')
      return
    }
    setBusy(true)
    try {
      const session = await tryLogin(bizno, pw1)
      setAuth(session)
      // 정정 #12 — 로그인 직후 PartnerDcConfig fetch (실패해도 진행, 출고가 그대로)
      void loadDcConfig(session.partnerCode).catch(() => {
        /* dc config 미등록 — 출고가 그대로 표시 */
      })
      navigate('/orders/new', { replace: true })
    } catch (e) {
      setErr(e instanceof Error ? e.message : '로그인 실패')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="page-gate" id="pageBizGate">
      <div className="biz-box">
        <div style={{ textAlign: 'center', marginBottom: 12 }}>
          <div style={{ fontSize: 26, fontWeight: 900, color: '#60a5fa', lineHeight: 1.2 }}>
            삼한공조시스템 주문서
          </div>
        </div>

        {step === 'INPUT' && (
          <div id="stepBizInput">
            <div className="biz-title" style={{ marginBottom: 20 }}>
              사업자등록번호
            </div>
            <div className="biz-field-row" style={{ marginBottom: 12 }}>
              <input
                id="bizGateInput"
                type="text"
                inputMode="numeric"
                autoComplete="off"
                placeholder="000-00-00000"
                maxLength={12}
                value={bizno}
                onChange={(e) => setBizno(formatBizno(e.target.value))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void handleBizQuery()
                }}
              />
            </div>
            <div className="biz-buttons">
              <button id="btnBizQuery" className="btn" disabled={busy} onClick={() => void handleBizQuery()}>
                {busy ? '조회 중...' : '조회'}
              </button>
            </div>

            {err && (
              <div style={{ marginTop: 12, color: '#fca5a5', fontSize: 13, textAlign: 'center' }}>{err}</div>
            )}

            <div className="biz-info-block">
              <div style={{ marginBottom: 12 }}>
                <strong>① 사업자 등록·승인 안내</strong>
                본 시스템은 <em>최초 1회 사업자 등록 및 승인 절차 완료 후</em> 이용 가능합니다.<br />
                사업자 번호를 기입하시고 승인 요청을 보내주시면 처리 도와드리겠습니다.<br />
                승인 관련 문의: (주)삼한공조시스템 ☎ 02-3465-1331
              </div>
              <div>
                <strong>② 이용 환경 안내</strong>
                본 링크는 PC와 모바일 환경을 지원합니다.<br />
                PC 또는 모바일로 접속하여 사용하시기 바랍니다.
              </div>
            </div>
          </div>
        )}

        {step === 'ACTION' && status && (
          <div id="stepAuthAction" style={{ textAlign: 'center', color: '#fff' }}>
            <div id="authIcon" style={{ fontSize: 48, marginBottom: 16 }}>{ICON_MAP[status]}</div>
            <div id="authTitle" style={{ fontSize: 20, fontWeight: 700, marginBottom: 10 }}>
              {TITLE_MAP[status]}
              {partnerName && <div style={{ fontSize: 14, color: '#60a5fa', marginTop: 4 }}>{partnerName}</div>}
            </div>
            <div id="authMsg" style={{ fontSize: 16, marginBottom: 20, color: '#d1d5db', whiteSpace: 'pre-line' }}>
              {message}
            </div>

            {(status === 'NEED_PW_INPUT') && (
              <div id="authPwGroup">
                <div className="biz-field-row" style={{ marginBottom: 8 }}>
                  <input
                    id="authPw1"
                    type="password"
                    inputMode="numeric"
                    maxLength={4}
                    placeholder="비밀번호 (4자리)"
                    value={pw1}
                    onChange={(e) => setPw1(e.target.value.replace(/\D/g, ''))}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') void handleAuthAction()
                    }}
                  />
                </div>
              </div>
            )}

            <div className="biz-buttons">
              <button
                id="btnAuthCancel"
                className="btn"
                style={{ background: '#4b5563' }}
                onClick={() => {
                  setStep('INPUT')
                  setStatus(null)
                  setPw1('')
                  setErr('')
                }}
              >
                취소
              </button>
              <button id="btnAuthAction" className="btn" disabled={busy} onClick={() => void handleAuthAction()}>
                {busy ? '처리 중...' : '확인'}
              </button>
            </div>

            {err && (
              <div style={{ marginTop: 12, color: '#fca5a5', fontSize: 13 }}>{err}</div>
            )}

            <div id="authSubMsg" style={{ fontSize: 12, marginTop: 12, color: '#6b7280' }}>
              비밀번호 3회 오입력 시 계정이 잠금됩니다.
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
