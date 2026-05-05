/**
 * 설정 — 다크모드 / 알림 / 캐시 비우기 등.
 *
 * <p>현 단계: PWA 캐시 비우기 + 로그아웃 만 제공. 추가 옵션은 후속 PR.
 */
import { Link } from 'react-router-dom'
import { useSessionStore } from '../stores/session'

export function SettingsPage() {
  const logout = useSessionStore((s) => s.logout)

  async function clearCaches() {
    if ('caches' in window) {
      const keys = await caches.keys()
      await Promise.all(keys.map((k) => caches.delete(k)))
    }
    window.alert('캐시를 비웠습니다. 새로고침을 권장합니다.')
  }

  return (
    <div className="wrap">
      <div className="top">
        <div className="title">설정</div>
        <div className="top-actions">
          <Link className="btn btn-ghost" to="/orders/new">
            주문 작성
          </Link>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 480 }}>
        <button className="btn btn-ghost" onClick={() => void clearCaches()}>
          PWA 캐시 비우기
        </button>
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
  )
}
