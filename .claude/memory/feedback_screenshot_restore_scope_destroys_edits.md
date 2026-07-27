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

## 2026-07-25 실측 — **한 슬라이스에서 3회 반복**. 개별 스펙 하나가 범인이다

#902(PR #926) 진행 중 **리뷰어 1명 + 구현자 2명이 각각 같은 함정에 빠졌습니다.** 셋 다 원복해 오염 0 으로 끝냈지만, 매번 사람이 알아채야 한다는 뜻입니다.

🔑 **전체 스위트를 돌릴 필요도 없습니다** — `clients/desktop/playwright/slip-form-v20/slip-form-v20-matching.spec.ts` **하나만** mock 으로 돌려도 `docs/qa/slip-form-v20-and-menu-relocate/tc-v*.png` **7장**이 덮어써집니다. CI 게이트 재현(전표 폼 관련 6스펙)에 이게 포함돼 있어, 전표 폼을 건드리는 작업자는 거의 반드시 밟습니다.

**안전한 원복(경로를 파일 단위로 좁힘)**:
```
git status --porcelain                          # 먼저 무엇이 바뀌었는지 본다
git show HEAD:<파일경로> > <파일경로>            # 파일 하나씩 되돌린다
git status --porcelain                          # 오염 0 재확인
```
`git checkout -- <디렉토리>` 는 쓰지 마십시오(위 2026-07-21 사고).

**에이전트 브리프에 미리 넣을 것** — 이 세 문장을 지시서에 넣으면 실제로 셋 다 자진 신고하고 원복했습니다:
> 🚨 `docs/qa/**` 의 커밋된 스크린샷을 덮어쓰지 마십시오. `slip-form-v20-matching.spec.ts` 를 mock 으로 돌리면 7장을 덮어씁니다. 실행했다면 `git status --porcelain` 확인 후 `git show HEAD:<path> > <path>` 로 반드시 원복하십시오.

**근본 대책은 미실행**(범위 밖으로 보류): 스펙이 임시 경로에 쓰게 하거나 CI 잡에서 그 스펙만 격리하는 방안. 지금은 **매번 사람이 잡아내는 구조**이고, 언젠가 놓치면 QA 증거가 오염된 채 커밋됩니다.

## ✅ 2026-07-26 — **근본 대책이 실행됐다** (PR #938). 그 전까지 하루에 또 3회 반복

**같은 날 세 트랙에서 또 터졌습니다.** 셋 다 *"무훼손 확인차 인접 스펙을 돌렸더니 커밋 증거가 덮어써진"* **동일 형태**이고, 셋 다 브리프에 원복 절차를 미리 넣어 둔 덕에 **자진 신고**했습니다.

| 회차 | 트랙 | 오염 | 범인 스펙 |
|---|---|---|---|
| 1 | #929 재수렴 표면 ① | 13장 | `bank-txn-filter` · `codef-connection.shots` |
| 2 | #929 배치 fix | 13장 | 동일 |
| 3 | #937 회귀 fix | 1장 | `slip-version-history` |

> 🔑 **`docs/qa` 만 오염됐고 스펙 수정은 섞이지 않은 것을 `git status --porcelain` 으로 확인한 뒤**에는 `git checkout -- docs/qa/` 가 안전합니다(2026-07-21 사고는 `clients/desktop/playwright/` 를 함께 넘긴 것이 원인). **확인 없이 쓰지 마십시오.**

### 근본 fix = 쓰기 목적지 격리 (#938 H-2 → D-1)

`resolveQaShotsDir()` 로 기본 출력을 `<committed-dir>/_local/`(gitignore)로 보내고, 승격은 `QA_SHOTS_DIR` **opt-in**. 1차 적용은 **mock 게이트만** 덮어 real-qa 가 뚫려 있었고(2차 적대검증 D-1 이 커밋 증거 12장 오염을 실증), 최종 fix 가 **TS/TSX 163개 목적지 + ESM 캡처 유틸리티 9개**를 전부 격리했다(172파일 / +413 −199, CI 41/41 green).

🔑 **sweep 은 파일명이 아니라 「쓰기 목적지」로 해야 한다** — `*-real-qa` 같은 파일명 패턴으로 훑었다면 ESM 9개(`full-qa/capture-all.mjs` · `qa782` · `qa797` · `qa798`)를 또 놓쳤을 것이다. `screenshot`/`write`/`append`/`mkdir` 의 실제 목적지를 검사하라. → [[feedback_defect_family_sweep_fix]]

**⟹ #938 머지 이후에는 이 계열이 구조적으로 끝난다.** 그 전까지는 위 브리프 3문장을 계속 넣을 것.
