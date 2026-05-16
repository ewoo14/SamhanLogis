---
name: pr-title-caps-bracket
description: PR 제목 prefix 는 `[FEAT]` / `[FIX]` / `[CHORE]` / `[DOCS]` / `[REFACTOR]` 등 대괄호+대문자 (codex 자율 PR 도 `[codex]` 대신 본 형식)
metadata:
  type: feedback
---

PR 제목 prefix 는 **대괄호+대문자** 형식 사용한다.

예:
- `[FEAT] SP-08-3 배차 GAS parity`
- `[FIX] SP-08-2 INVENTORY role 누락 보강`
- `[REFACTOR] mobile-staff driver 전표 상세 경계 분리`
- `[DOCS] handoff 노트 SP-08 후속 표 갱신`

**Why**: 기존 PR (#199, #197 등) 의 `feat(...)` conventional 도 사용됐으나 사용자가 가독성 측면에서 `[FEAT]` 대괄호+대문자를 선호 — 한국어 본문과 시각 구분 명확. PR #211 머지 직후 (2026-05-16) 사용자 명시 요청으로 `[codex] SP-08-2 ...` → `[FEAT] SP-08-2 ...` 변경.

**How to apply**:
- 모든 신규 PR 제목에 `[FEAT]` / `[FIX]` / `[CHORE]` / `[DOCS]` / `[REFACTOR]` / `[TEST]` 등 대괄호+대문자 prefix.
- codex CLI 자율 작업 PR 도 동일 — **`[codex] SP-XX-X` 형식 사용 금지**, 대신 `[FEAT] SP-XX-X ...`.
- commit 메시지는 별개 — Conventional Commits (`feat:`, `fix:` 소문자 + scope) 그대로 유지 (`feedback_korean_commits.md`).
- `gh pr edit <num> --title "[FEAT] ..."` 로 기존 PR 제목도 정정.

[[dual-5agent-review]] [[korean-commits]]
