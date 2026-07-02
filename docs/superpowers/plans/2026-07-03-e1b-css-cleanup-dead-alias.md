# E1-b 후속 cleanup — dead `.sales-edit-inline*` CSS alias 제거

> 구현=Codex. 캐논 소형 cleanup PR. E1-b-1/E1-b-2 리뷰에서 3 agent(Design/FE/DevOps)가 NIT 로 flag·"cleanup PR 권장".

**Goal:** E1-b-2 에서 `.sales-edit-inline*`→`.slip-edit-inline*` 공유화하며 매출 TSX 도 `.slip-edit-inline` 로 전환됨 → global.css 의 `.sales-edit-inline`/`.sales-edit-inline-header`/`.sales-edit-inline-header .detail-section-title`/`.sales-edit-inline-actions` comma-selector alias 가 **소비자 0 dead CSS**. 제거.

**Scope (zero-risk):** `clients/desktop/src/renderer/styles/global.css` 만 — comma-selector 에서 `.sales-edit-inline*` alias 4종 제거(shell/header/title/actions + @media 블록). `.slip-edit-inline*` 는 그대로(매출/매입 인라인 폼이 실제 사용).
- ⚠️ **비스코프(E3 S4 번들)**: `.purchase-edit-*`↔`.sales-edit-*` field/memo/lines 통합(TSX rename 리스크) — 별도.

**검증:** grep 으로 `.sales-edit-inline` TSX/spec 소비자 0 재확인 → 제거 → typecheck + Playwright(slip-collab-panel·coedit-s2a·sp-08-5-2·sp-08-6-2) 무회귀 + 매출/매입 인라인 시각 무변(공유 `.slip-edit-inline` 유지).

**Self-Review:** 소비자 0 dead CSS 제거라 시각/기능 무영향. 매출/매입 인라인은 `.slip-edit-inline*` 사용 유지.
