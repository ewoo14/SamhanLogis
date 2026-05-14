/**
 * DispatchesPlaceholderPage — F2 시점의 임시 placeholder.
 *
 * F2 에서 `clients/desktop/src/renderer/routes/arologis/` 의 `DISPATCH-DESIGN.md`
 * 1건만 본 폴더로 git mv 되었다. ArologisManualDispatchPage / ArologisPreClassifyPage
 * 등 4 페이지 + arologis*Api.ts 3 + ArologisRealtimeClient.ts 의 이전은 후속
 * 슬라이스에서 디자인 토큰 통일 + import path 정정과 함께 진행한다.
 *
 * 본 placeholder 는 그 시점에 실제 라우트 트리로 대체된다.
 */
export function DispatchesPlaceholderPage(): JSX.Element {
  return (
    <section>
      <h1 style={{ fontSize: 'var(--font-size-xl)', marginTop: 0 }}>배차</h1>
      <p style={{ color: 'var(--color-text-muted)' }}>
        DISPATCH-DESIGN.md 의 3 페이지 (Auto / Manual / Pre-Classify) 가
        후속 슬라이스에서 본 라우트로 이식됩니다.
      </p>
    </section>
  )
}
