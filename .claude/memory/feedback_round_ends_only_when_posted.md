---
name: feedback_round_ends_only_when_posted
description: 🚨 라운드는 커밋이 아니라 "게시 + 캡처 전달" 로 끝난다 — 커밋만 하고 다음 발주로 넘어가면 게시가 영구 누락된다 (2026-08-14 실측 43건 누락)
metadata:
  type: feedback
---

# 🚨 라운드 종료 조건 = **커밋 + PR 게시 + 캡처 전달** 셋 다

2026-08-14 개발책임자 지적: *"1:1 리뷰 게시 원칙과 스크린샷 게시 등 원칙을 자꾸 어기는 경우가 발생"*

## 실측 — 하루 만에 43건이 밀렸다

| PR | 라운드 커밋 | PR 코멘트 | 누락 |
|---|---:|---:|---:|
| #1180 | 32 | 10 | **22** |
| #1210 | 16 | 8 | 8 |
| #1211 | 12 | 4 | 8 |
| #1213 | 6 | 1 | **5** |

캡처도 15개 라운드 중 **6번만** 사용자에게 전달했다.

## 왜 새는가 — 셋 다 구조적이다

```text
① 커밋과 게시가 별개 동작이다
   커밋은 워크트리를 비워야 다음 라운드가 도니 안 빼먹는다
   게시는 빼먹어도 그 순간 아프지 않다 ⟹ 조용히 밀린다

② 여러 트랙이 동시에 결과를 뱉으면 "다음 발주" 가 급하다
   게시를 미루고 발주부터 하고, 미룬 것을 잊는다

③ 아무도 세지 않았다
   커밋 수와 코멘트 수를 대조하는 장치가 없어
   개발책임자가 지적할 때까지 몰랐다
```

🔑 **가장 나쁜 것은 ③ 이다.** ①②는 사람이면 실수하는데, ③이 없으면 **실수가 누적되고도 드러나지 않는다.**

## How to apply — 세 겹

### ① 한 흐름으로 묶어라 (예방)

라운드 결과를 받으면 **끊지 말고 이어서** 한다.

```text
commit  →  push  →  gh pr comment  →  캡처 있으면 SendUserFile
```
🚫 커밋만 하고 다음 발주로 넘어가지 마라. 그 순간 게시는 영구 누락된다.
🚩 게시 본문은 커밋 메시지를 재활용하면 된다 — 새로 쓰는 비용이 아니라 옮기는 비용이다.

### ② 게시 전에는 다음 라운드를 발주하지 않는다 (차단)

```text
🚫 "일단 발주하고 게시는 나중에"  ← 이것이 실제 누락 경로다
✅ 게시가 끝나야 그 라운드가 끝난 것이고, 그때 다음을 발주한다
```
🔑 발주가 급해 보여도 게시는 30초다. 밀린 43건을 나중에 메우는 비용이 훨씬 크다.

### ③ 주기적으로 세라 (검출)

10분 현황보고 때마다 열린 PR 을 대조한다.

```bash
for p in <열린 PR 들>; do
  br=$(gh pr view $p --json headRefName --jq .headRefName)
  echo -n "PR #$p 커밋 "; git log origin/main..origin/$br --oneline | wc -l
  echo -n "        코멘트 "; gh pr view $p --json comments --jq '.comments | length'
done
```
🚩 **갭이 보이면 그 자리에서 메운다.** 다음으로 미루면 또 잊는다.
🚩 커밋 수 = 코멘트 수일 필요는 없다(문서 커밋 등). 다만 **갭이 벌어지는 추세**가 신호다.

## 캡처는 별도로 한 번 더 챙긴다

```text
캡처가 있는 라운드      → 반드시 SendUserFile 로 전달한다
결함이 없어도 보낸다     → 개발책임자 지시: "스크린샷 계속 보고 및 게시요청"
🚩 캡처 경로가 _local/ 이면 gitignore 대상이라 커밋되지 않는다
   tracked 경로로 옮기고 SHA-256 을 다시 재라 → [[feedback_live_qa_artifacts_vanish_silently]]
```

관련: [[feedback_review_post_one_to_one_enforcement]] · [[feedback_qa_screenshots_inline_to_user]] ·
[[feedback_pr_screenshot_sha_pinned_urls]] · [[feedback_pm_codex_progress_verification]]
