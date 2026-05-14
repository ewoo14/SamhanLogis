/**
 * DispatchesPlaceholderPage — F1 skeleton 시점의 임시 placeholder.
 *
 * F2 에서 `clients/desktop/src/renderer/routes/arologis/` 의 `DISPATCH-DESIGN.md`
 * (와 후속 PR 에서 ArologisXxxPage.tsx 4 페이지 + api 3 + realtime client) 가
 * 본 폴더로 git mv 되면서 본 placeholder 가 실제 페이지 라우트로 대체된다.
 */
export function DispatchesPlaceholderPage(): JSX.Element {
  return (
    <section>
      <h1 style={{ fontSize: 'var(--font-size-xl)', marginTop: 0 }}>배차</h1>
      <p style={{ color: 'var(--color-text-muted)' }}>
        F2 git mv 이후 배차 페이지가 본 라우트에서 활성화됩니다.
      </p>
    </section>
  )
}
