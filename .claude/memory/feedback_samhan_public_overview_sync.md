---
name: samhan-public-overview-sync
description: 매 슬라이스 진행/머지 시 docs/samhan-public-overview.html (GitHub Pages 호스팅) 항시 동기화 의무. nav-badge + progress 표 + callout 갱신.
metadata:
  type: feedback
---

매 슬라이스 진행/머지 시 `docs/samhan-public-overview.html` 페이지 (GitHub Pages 호스팅) 도 동기화한다.

**Why:** 2026-05-20 사용자 정정 — `https://ewoo14.github.io/SamhanLogis/samhan-public-overview.html` 가 외부 가시 시스템 구조 문서. 슬라이스 진행 변동 시 페이지가 stale 되면 외부 stakeholder 혼선. 사용자 명시 "항시 업데이트 요망".

**How to apply:**

- 모든 PR 작업 안에 페이지 갱신 의무 포함 (별도 docs PR 금지 — [[continuous-docs-sync]] 패턴 일관)
- 슬라이스 시작 시: nav-badge `Phase X · 슬라이스 이름 진행 중` 으로 갱신
- 머지 후: progress 표의 해당 row status-badge (`wip` → `done`) + PR# 추가
- 시리즈 진행 (MIG-1~N 같은 누적 시리즈) 은 별도 callout 으로 누적 시각화
- 페이지 위치: `docs/samhan-public-overview.html` (GitHub Pages 자동 빌드)
- `clients/` / `services/` README 갱신 (`[[continuous-docs-sync]]`) 과 동급 의무 — PR 본문에 페이지 갱신 명시

관련: [[continuous-docs-sync]]
