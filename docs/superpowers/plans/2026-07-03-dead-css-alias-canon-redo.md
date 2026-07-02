# dead `.sales-edit-inline*` CSS alias 제거 — full 캐논 재수행 (#705 revert 후)

> 개발책임자 지시: #705 를 단축 머지(Codex 개발+검증1개) 위반 → revert(#707) 후 **full 캐논 재수행**. 이번엔 Opus 5-agent→Codex 5-agent→0수렴→PM 종합→머지 전체 수행(단축 금지).

**Goal:** E1-b-2 에서 slip-edit CSS 공유화(`.slip-edit-inline*`) 후 매출 TSX 도 전환되어 소비자 0 dead 된 `.sales-edit-inline*` comma-selector alias(shell/header/title/actions + @media, 7곳) 제거. `global.css` only.

**Scope (zero-risk):** `clients/desktop/src/renderer/styles/global.css` — comma-selector 에서 `.sales-edit-inline*` alias 제거. `.slip-edit-inline*`(매출/매입 인라인 실사용)·`.sales-edit-field/-memo/-lines`(실사용) 유지.
- 비스코프(별도): `.purchase-edit-*`↔`.sales-edit-*` 통합(TSX rename)=E3 S4 번들.

**선행 검증:** `rg sales-edit-inline clients/desktop/src` TSX/spec 소비자 0 재확인(global.css 외 소비자 있으면 중단).

**검증:** typecheck + Playwright(slip-collab-panel·coedit-s2a·sp-08-5-2·sp-08-6-2) 무회귀. 매출/매입 인라인 시각 무변(`.slip-edit-inline*` 유지).

**Self-Review:** 소비자 0 dead 제거라 시각/기능 무영향. full 캐논(5-agent 무회귀 검증)으로 진행.
