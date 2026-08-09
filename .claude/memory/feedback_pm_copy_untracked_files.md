---
name: feedback_pm_copy_untracked_files
description: PM 이 codex 산출물을 워크트리에서 옮길 때 git diff --name-only 를 쓰면 신규(untracked) 파일이 통째로 빠진다 — 2026-07-29 한 세션 3회
metadata:
  type: feedback
---

# 산출물을 옮길 때 `git diff --name-only` 는 신규 파일을 빠뜨린다 (2026-07-29 · 한 세션 3회)

codex 는 **커밋하지 않고 파일만** 남긴다(git 쓰기 금지). PM 이 그것을 PR 브랜치로 옮길 때 이렇게 썼다:

```bash
for f in $(cd $W && git diff --name-only); do cp "$W/$f" "$f"; done
```

**`git diff --name-only` 는 tracked 파일의 수정만 나열한다. 새로 만든 파일은 안 나온다.**

## 실제로 빠진 것 (한 세션에 3회)

| PR | 빠진 파일 | 결과 |
|---|---|---|
| #987 | `src/__tests__/fixtures/homemultiBootstrap.fixture.json` | 로컬 테스트 **3건 실패**. PM 이 구현자 보고("184 통과")를 **거짓으로 오인**할 뻔했다 |
| #984 | `db/migration/V27__allow_skipped_main_candidate_status.sql` | **PR head 를 배포하면 임포트가 CHECK 위반으로 전체 롤백.** 로컬은 이미지 빌드 컨텍스트에 그 파일이 있어 통과했다 — CODEX SOL 이 `git ls-tree` 로 잡았다 |
| #987 | `docs/qa/.../screenshots/` · 새 테스트 파일 | 별도로 `cp` 해서 우연히 면했다 |

## 🆕 라운드 단위로는 부족하다 — **세션 단위로 전 워크트리를 훑어라** (2026-08-09)

한 세션에서 워크트리를 전수로 훑었더니 **이틀 전 산출물 5건이 고아**로 남아 있었다. 그중 셋은 **이미 close 된 작업**이라 최종 검증 증거가 영영 사라질 뻔했다.

```
#1096 [CLOSED] 재수렴 보고서 + 캡처 25장
#1101 [CLOSED] 재수렴 보고서 + 캡처  1장
#1108 [CLOSED] 재수렴 보고서 + 캡처  9장
#1091 [OPEN]  캡처 16장 · #1094 [OPEN] 캡처 11장
```

같은 세션에서 `#1111` S11 보고서(213줄 + 캡처 5장)도 같은 방식으로 살렸다 — 그 PR(`#1117`)은 **이미 머지된 상태**였다.

```bash
# 전 워크트리 훑기 (세션 시작·종료 시)
for wt in $(git worktree list --porcelain | grep '^worktree' | cut -d' ' -f2-); do
  st=$(git -C "$wt" status --porcelain | grep -vE '^\?\? \.claude/'); 
  [ -n "$st" ] && { echo "=== $wt"; echo "$st"; }
done
```

🔑 **머지된 PR 의 산출물이 가장 위험하다** — 브랜치가 지워지면 복구 경로가 없고, *"그때 무엇을 확인하고 머지했나"* 를 물으면 그것뿐이다.
🔑 열린 PR 것은 **그 브랜치에**, 닫힌 것은 **main 에** 넣는다.

## 올바른 방법

```bash
# 수정 + 신규 + (삭제는 별도 판단) 를 모두 본다
(cd $W && git status --porcelain)
# 신규만 따로 확인
(cd $W && git status --porcelain | grep '^??')
```

옮긴 뒤 **`git status --porcelain` 을 워크트리와 대상 브랜치 양쪽에서 찍어 대조**한다. 파일 수가 다르면 빠진 것이 있다.

**Why:** 빠진 파일이 **마이그레이션·fixture 처럼 로컬 실행에는 이미 반영돼 있는 종류**일 때 가장 위험하다. 로컬은 통과하고 CI 도 통과할 수 있는데(이미지 빌드 컨텍스트가 워크트리를 담으므로) **배포본만 깨진다**. 그리고 PM 이 "구현자가 거짓 보고했다"고 잘못 판단하게 만든다.

**How to apply:** codex 브리핑에 **"신규 파일을 만들면 보고에 목록으로 명시하라"** 를 넣는다. PM 은 옮기기 전 `git status --porcelain` 으로 **신규 파일 목록을 먼저 확인**하고, 옮긴 뒤 양쪽을 대조한다. 관련 [[feedback_pm_delegate_to_codex_conserve_tokens]] · [[feedback_pm_codex_progress_verification]] · [[feedback_ungated_surface_and_mock_covering_defect]]
