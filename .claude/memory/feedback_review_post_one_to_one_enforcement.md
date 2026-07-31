---
name: feedback_review_post_one_to_one_enforcement
description: 리뷰 1:1 게시 엄수 — 커밋과 PR 게시를 같은 도구 블록에서 처리한다. 미루면 누적된다 (2026-07-30 개발책임자 2회 지적)
metadata:
  type: feedback
---

# 리뷰 1:1 게시는 커밋과 한 묶음이다 (2026-07-30 개발책임자 2회 지적)

> *"리뷰 1:1 게시가 원칙임."*
> *"1:1 리뷰게시 원칙은 엄수요망."*

## 무슨 일이 있었나

캐논은 **실행 = 게시 1:1** 입니다. 그런데 PM 이 라운드를 돌리고 커밋만 한 뒤 게시를 뒤로 미뤘습니다.

| 시점 | 누락 |
|---|---|
| 1차 지적 시 | **8건** (`#993`x3 · `#984` · `#996`x2 · `#998`x2 · `#991`) |
| 정정 후 2차 지적 시 | **1건** (`#993` SOL 적대검증 1차) |

**미루는 것이 문제가 아니라, 미루면 쌓이는 것이 문제입니다.** 라운드가 병렬로 4~6개 돌면 게시 대기가 금방 누적되고, 그 사이에 다음 라운드 결과가 도착해 순서가 엉킵니다.

## 규칙

**라운드 완료 → 산출물 검증 → 커밋 → 게시** 를 **한 묶음**으로 처리한다. 게시는 라운드의 뒷정리가 아니라 **라운드의 일부**다.

🚫 *"트랙 여러 개 끝나면 한꺼번에 게시"* 금지.

## 감사법 (누락을 눈으로 찾지 말 것)

브랜치의 오늘 커밋과 PR 코멘트 시각을 나란히 뽑아 대조한다.

```bash
for n in <PR 번호들>; do
  b=$(gh pr view $n --json headRefName -q .headRefName)
  git log origin/$b --since="<오늘>" --pretty="  %h %ad %s" --date=format:"%H:%M"
  gh api repos/<owner>/<repo>/issues/$n/comments --paginate \
    -q '.[] | select(.created_at > "<오늘>T00:00:00Z") | "  \(.created_at[11:16]) \(.body[0:56])"'
done
```

⚠️ 커밋 시각은 로컬, 코멘트 `created_at` 은 UTC 다. **시차를 맞춰 대조**할 것(KST 는 +9).

## 게시 직후 자가 검사도 함께

게시했다고 끝이 아니다 — 본문이 훼손됐을 수 있다. [[feedback_gh_comment_utf8_pipe_mojibake]] 대로 **코드블록·코드스팬 생존**을 확인한다. 같은 세션에서 `<<EOF`(인용 없는 heredoc)로 백틱이 명령 치환돼 코드블록 2개가 빈 채 게시된 사례가 실제로 있었다.

**Why:** 게시가 없으면 **개발책임자가 무슨 일이 있었는지 볼 수 없습니다.** PM 세션 안에만 있는 판정은 다른 PC·다음 세션에 전달되지 않고, PR 이 결정의 누적 기록이라는 성질도 깨집니다.

관련: [[feedback_canonical_workflow]] · [[feedback_post_devlead_decisions_to_pr]] · [[feedback_pm_codex_progress_verification]] · [[feedback_gh_comment_utf8_pipe_mojibake]]
