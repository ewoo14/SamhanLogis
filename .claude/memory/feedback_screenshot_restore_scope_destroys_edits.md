---
name: feedback_screenshot_restore_scope_destroys_edits
description: 🚨 Playwright 전체 mock 스위트는 커밋된 스크린샷(docs/qa/**·clients/desktop/playwright/**/screenshots/**)을 재생성해 덮어쓴다. 원복 시 반드시 **스크린샷 경로만** 좁혀서 checkout 할 것 — `git checkout -- clients/desktop/playwright/` 처럼 디렉토리 통째로 되돌리면 같은 트리의 **스펙 수정까지 삭제**된다(2026-07-21 실제 유실).
metadata:
  type: feedback
---

🚨 **2026-07-21 실제 작업 유실 사고.** #825 슬5(PR #864) 에서 CODEX LUNA 가 고친 Playwright 스펙 3건(+11/-1)을 **PM 이 원복 명령으로 삭제**했다. 커밋 전이라 복구 불가, 재디스패치로 재작업했다.

## 배경 — 전체 mock 스위트는 커밋된 증거를 덮어쓴다
`cd clients/desktop && ./node_modules/.bin/playwright test` (기본 mock config, 590건)를 돌리면 다수 스펙이 스크린샷을 **저장소에 커밋된 경로**에 재생성한다. 실측 **53~132개 PNG 가 바이트 단위로 변경**된다:
- `docs/qa/**`
- `clients/desktop/playwright/**/screenshots/**`

그런데 이 저장소는 **"mock.ts 데이터/공유 픽스처 변경 시 전체 mock 게이트 로컬 실행 필수"**([[feedback_design_system_playwright_mock_suite]])를 규칙으로 둔다. 즉 **규칙을 지키면 반드시 이 부수효과가 생긴다.**

## 🚫 사고를 만든 명령
```
git checkout -- docs/qa/ clients/desktop/playwright/     # ← 두 번째 경로가 치명적
```
`clients/desktop/playwright/` 아래에는 **스크린샷과 `*.spec.ts` 가 함께** 산다. 디렉토리 통째 복원은 **의도한 스펙 수정까지 되돌린다.** `git status` 가 갑자기 비면 이미 늦었다(커밋 전 변경은 복구 불가).

## ✅ 올바른 원복
```
git checkout -- docs/qa/
git checkout -- "clients/desktop/playwright/*/screenshots/"
# 새로 생긴 untracked 스크린샷은 개별 삭제
```
원복 후 **`git status --short` 에 의도한 소스 변경만 남는지 반드시 확인**한다. 남아야 할 것이 사라졌으면 그 자리에서 멈추고 보고한다.

## 규율
- **커밋 전에 원복하지 말 것** — 가능하면 **의도한 변경을 먼저 `git add`(스테이징) 한 뒤** 스크린샷을 원복하면 광범위 checkout 에도 스테이징분은 살아남는다. 가장 안전한 순서다.
- 부수효과 원복은 **패턴을 좁혀서**. 경로 하나 넓히는 것이 곧 작업 유실이다.
- 구현자에게 원복을 위임할 때도 **금지 명령을 명시**해서 전달할 것.

관련: [[feedback_design_system_playwright_mock_suite]] · [[feedback_qa_live_shared_data_readonly]](공유 실데이터 파괴 계열) · 이슈 #863(스위트가 증거를 덮어쓰는 구조적 함정 — 출력 경로 분리 제안)
