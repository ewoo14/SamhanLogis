/**
 * F1 skeleton 시점의 LoginPage placeholder.
 *
 * 실제 로그인 폼 + 자체 auth API 호출 구현은 F3 (별도 commit) 에서 추가한다.
 * 본 stub 은 라우터가 mount 가능하도록 export 만 유지한다.
 */
export function LoginPage(): JSX.Element {
  return (
    <div
      style={{
        height: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <p style={{ color: 'var(--color-text-muted)' }}>
        로그인 화면 — F3 에서 구현됩니다.
      </p>
    </div>
  )
}
