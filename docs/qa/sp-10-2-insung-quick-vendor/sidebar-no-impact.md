# SP-10-2 사이드바 메뉴 변동 0 명시

> 작성일: 2026-05-19
> 담당: QA Agent
> 브랜치: `feat/sp-10-2-insung-quick-program`
> 참조: `docs/planning/2026-05-19_sp-10-2-insung-quick-program.md` §3

---

## 결론 — 사이드바 메뉴 변동 없음 (SP-10-2)

SP-10-2 작업 범위는 아래 변경에 한정됩니다:

1. `VehicleMatchStatusBadge.tsx` 신규 (vehicle row 내부 badge — 사이드바 아님)
2. `InsungLbsPanel.tsx` 신규 (DispatchDetailPage 내부 패널 — 사이드바 아님)
3. `DispatchDetailPage.tsx` 갱신 (알림 발송 결과 row 추가 — 사이드바 아님)
4. design-system `tokens.css` `--color-insung-*` 토큰 추가 — 메뉴 구조 아님

**사이드바(DispatchesLayout nav) 는 변경되지 않습니다.**

---

## DispatchesLayout nav 현황 (불변 확인)

`clients/arologis-desktop/src/renderer/routes/dispatches/DispatchesLayout.tsx` — 현재 상태:

```typescript
const links = [
  { to: '/dispatches/manual',        label: '수동 배차' },
  { to: '/dispatches/pre-classify',  label: '가배차 분류' },
  { to: '/dispatches/unassigned',    label: '미배차' },
  { to: '/dispatches/reconcile',     label: '실배차 비교' },
]
```

SP-10-2 후에도 위 4개 링크 그대로 유지됩니다.

---

## Designer wireframe §사이드바 미변동 cross-check

| 항목 | wireframe 명시 | QA 확인 |
|------|--------------|--------|
| VehicleMatchStatusBadge 위치 | vehicle row 우측 상단 정렬 | nav 아님 — 페이지 내부 |
| sandbox 배너 위치 | DispatchDetailPage 상단 고정 | nav 아님 — 페이지 내부 |
| InsungLbsPanel 위치 | vehicle row 아래 패널 | nav 아님 — 페이지 내부 |
| 알림톡 결과 row 위치 | vehicle row 하단 들여쓰기 | nav 아님 — 페이지 내부 |
| 신규 nav 링크 | 언급 없음 | SP-10-2 비범위 확인 |

`docs/planning/.../sp-10-2-insung-quick-program.md` §3: "사이드바 메뉴 변동 0" 명시.
`docs/design/sp-10-2-insung-quick-vendor/wireframe.md`: 사이드바 변동 내용 없음.

---

## arologis-mobile 영향 0 명시

`docs/planning/.../sp-10-2-insung-quick-program.md` §1:

> "1 통합 PR 머지. `arologis-desktop` 만 영향, `arologis-mobile` 영향 0."

SP-10-2 작업 대상: `clients/arologis-desktop` 전용.
`clients/mobile-staff` (arologis-mobile) 변경 없음.

---

## QA-6 Playwright spec 연계

`qa/playwright/tests/arologis/sp-10-2-insung-quick-vendor.spec.ts` QA-6 case:

```typescript
test('DispatchesLayout nav 4개 링크 변동 없음 확인', async ({ page }) => {
  const navLinks = nav.locator('a');
  await expect(navLinks).toHaveCount(4);       // 정확히 4개
  // 기존 4개 메뉴 각각 visible 확인
  // 신규 vendor 메뉴 없음 확인
});
```

spec 실행 결과가 PASS 이면 사이드바 변동 0 자동 검증됩니다.

---

## 비범위 명시

아래 항목은 SP-10-2 에서 **변경하지 않습니다**:

| 항목 | 비범위 근거 |
|------|----------|
| DispatchesLayout nav 링크 추가/제거 | §9 비범위 — W10-3 이연 |
| arologis-mobile 사이드바 | §1 영향 0 명시 |
| AppLayout 전체 사이드바 구조 | SP-D1~D3 담당, SP-10-2 미수정 |
| 어플 invite 흐름 (Aligo deeplink) | §9 W10-3 별도 슬라이스 |
