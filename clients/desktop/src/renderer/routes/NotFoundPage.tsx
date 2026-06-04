/**
 * NotFoundPage — 인앱 404 페이지.
 *
 * <p>로그인 사용자가 존재하지 않는 URL 로 진입 시 AppLayout(사이드바 유지) 내부에
 * 렌더되는 한국어 404 안내 화면.
 *
 * <p>사용처:
 * - `routes/index.tsx` 의 `AuthGuard + AppLayout` children 말미 catch-all
 *   `{ path: '*', element: <NotFoundPage /> }` 에서 사용.
 * - AdminLayout 중첩 라우트 children 말미 catch-all 에서도 동일하게 사용.
 *
 * <p>UUID/내부 경로는 노출하지 않는다 (feedback_uuid_no_user_visibility).
 * 스타일 톤은 ForbiddenPage 와 일관 (중앙 정렬, design-system 컬러 토큰 재사용).
 */
import { useNavigate } from 'react-router-dom'
import { Button } from '@samhan/design-system'

/**
 * 404 한국어 안내 컴포넌트.
 *
 * AppLayout 내부에서 렌더되므로 `minHeight` 는 뷰포트 전체가 아닌
 * 콘텐츠 영역 기준으로 계산한다.
 */
export function NotFoundPage() {
  const navigate = useNavigate()

  return (
    <div
      data-testid="not-found-page"
      style={{
        display: 'grid',
        placeItems: 'center',
        minHeight: 'calc(100vh - 120px)',
        padding: 24,
        textAlign: 'center',
      }}
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
          aria-hidden="true"
        >
          404
        </div>
        <h1
          data-testid="not-found-title"
          style={{
            fontSize: 20,
            fontWeight: 600,
            color: 'var(--color-neutral-800)',
            margin: '0 0 8px',
          }}
        >
          페이지를 찾을 수 없습니다
        </h1>
        <p
          style={{
            fontSize: 14,
            color: 'var(--color-neutral-500)',
            margin: '0 0 24px',
            lineHeight: 1.6,
          }}
        >
          요청하신 페이지가 없거나 주소가 변경되었습니다.
          <br />
          메뉴를 다시 선택하거나 대시보드로 돌아가세요.
        </p>
        <Button
          variant="primary"
          onClick={() => navigate('/', { replace: true })}
          data-testid="not-found-back-home"
        >
          대시보드로 돌아가기
        </Button>
      </div>
    </div>
  )
}
