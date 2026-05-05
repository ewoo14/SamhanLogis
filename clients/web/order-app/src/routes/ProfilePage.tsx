/**
 * 거래처 정보 (인증 통과 후 자기 정보 조회).
 *
 * <p>UUID 비공개 가드 — 사업자번호 / 거래처명 만 노출.
 */
import { Link } from 'react-router-dom'
import { useSessionStore } from '../stores/session'

export function ProfilePage() {
  const auth = useSessionStore((s) => s.auth)
  const logout = useSessionStore((s) => s.logout)

  if (!auth) return null

  return (
    <div className="wrap">
      <div className="top">
        <div className="title">거래처 정보</div>
        <div className="top-actions">
          <Link className="btn btn-ghost" to="/orders/new">
            주문 작성
          </Link>
          <button
            className="btn"
            style={{ background: '#dc2626' }}
            onClick={() => {
              logout()
              window.location.href = '/auth/login'
            }}
          >
            로그아웃
          </button>
        </div>
      </div>

      <div style={{ padding: 16, border: '1px solid var(--c-line)', borderRadius: 8, maxWidth: 480 }}>
        <div style={{ marginBottom: 8 }}>
          <strong>거래처명:</strong> {auth.partnerName}
        </div>
        <div style={{ marginBottom: 8 }}>
          <strong>사업자번호:</strong> {auth.bizno}
        </div>
        <div style={{ marginBottom: 8 }}>
          <strong>인증 상태:</strong> {auth.status}
        </div>
        {auth.accessLimit && (
          <div>
            <strong>사용기한:</strong> {new Date(auth.accessLimit).toLocaleString('ko-KR')}
          </div>
        )}
      </div>
    </div>
  )
}
