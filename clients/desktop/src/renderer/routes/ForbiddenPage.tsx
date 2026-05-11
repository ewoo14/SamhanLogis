/**
 * 403 접근 거부 페이지 — 권한 부족 시 redirect 대상.
 *
 * <p>AdminLayout 의 대표실 부서 가드(`/me/is-executive-office`) 에서
 * `isExecutiveOffice: false` 시 이 페이지로 Navigate 된다.
 * 일반 RoleGuard 미통과 시에도 재사용 가능 (향후 확장).
 *
 * memory feedback_role_naming_full — ROLE 표기 풀네임 유지.
 */
import { useNavigate } from 'react-router-dom'

export function ForbiddenPage() {
  const navigate = useNavigate()

  return (
    <div
      style={{
        display: 'grid',
        placeItems: 'center',
        minHeight: 'calc(100vh - 120px)',
        padding: 24,
        textAlign: 'center',
      }}
      data-testid="forbidden-page"
    >
      <div style={{ maxWidth: 480 }}>
        <div
          style={{
            fontSize: 64,
            fontWeight: 700,
            color: 'var(--color-neutral-300)',
            lineHeight: 1,
            marginBottom: 16,
          }}
        >
          403
        </div>
        <h1
          style={{
            fontSize: 20,
            fontWeight: 600,
            color: 'var(--color-neutral-800)',
            margin: '0 0 8px',
          }}
        >
          접근 권한이 없습니다
        </h1>
        <p
          style={{
            fontSize: 14,
            color: 'var(--color-neutral-500)',
            margin: '0 0 24px',
            lineHeight: 1.6,
          }}
        >
          인사 카테고리는 <strong>대표실 부서 소속 + MASTER</strong> 권한자만 접근할 수 있습니다.
          <br />
          필요한 경우 IT 관리자(MASTER)에게 권한 추가를 요청하세요.
        </p>
        <button
          type="button"
          onClick={() => navigate('/')}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '10px 20px',
            background: 'var(--color-brand-600)',
            color: 'var(--color-neutral-0)',
            border: 'none',
            borderRadius: 6,
            fontSize: 14,
            fontWeight: 600,
            cursor: 'pointer',
          }}
          data-testid="forbidden-back-home"
        >
          대시보드로 돌아가기
        </button>
      </div>
    </div>
  )
}
