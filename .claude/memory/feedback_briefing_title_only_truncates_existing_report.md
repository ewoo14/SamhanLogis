---
name: feedback_briefing_title_only_truncates_existing_report
description: 🚨 브리핑의 "보고서를 지금 만들고 제목만 저장" 이 같은 이름의 기존 커밋 보고서를 51줄 → 1줄로 날린다 — 라운드 보고서 파일명은 라운드마다 유일해야 (2026-08-02 #1013)
metadata:
  type: feedback
---

# 🚨 *"지금 만들고 제목만 저장"* 이 **기존 보고서를 파괴한다**

**2026-08-02 실측.** 타임아웃 대비로 브리핑마다 이 절을 넣고 있다.

```markdown
## 시작하기 전에
`docs/dev-reports/2026-08-02-1013-ci-fix.md` 를 **지금 만들고** 제목만 저장.
```

`#1013` 은 **같은 날 이미 CI fix 라운드를 한 번 돌았고** 그 파일이 51줄로 커밋돼 있었다. 구현자는 지시대로 **제목 한 줄로 덮어썼다.**

```text
docs/dev-reports/2026-08-02-1013-ci-fix.md | 52 +-----------------
1 file changed, 1 insertion(+), 51 deletions(-)
```

## 🔑 왜 안 보이는가

- 구현자는 **지시를 정확히 따랐다.** 잘못은 브리핑에 있다.
- 그 라운드가 **타임아웃**나면 PM 은 `git status` 에서 `M` 하나만 보고 *"진행 중이었구나"* 로 읽는다. **`--stat` 을 봐야** 51줄이 사라진 게 보인다.
- 커밋 전이면 `git checkout -- <경로>` 로 **온전히 복구된다**. 커밋해 버리면 이력을 뒤져야 한다.

## How to apply

- 🚨 **라운드 보고서 파일명에 라운드 번호를 붙인다** — `…-1013-ci-fix2.md`, `…-review3.md`. 날짜+슬라이스만으로는 하루에 두 라운드가 돌면 충돌한다.
- 🚨 브리핑에 파일명을 적기 전에 **그 파일이 이미 있는지 본다**. 있으면 *"만들고"* 가 아니라 **"이어서 append"** 라고 쓴다.
- 🚨 회수할 때 `git status --porcelain` 만 보지 말고 **`git diff --stat`** 을 함께 본다. 삭제 줄 수가 큰 `M` 은 진행이 아니라 **파괴**다.
- 산출물 0 인 라운드에서 `M` 이 보이면 의심하라 — 정상 진행이면 **추가**가 있어야 한다.

## 관련
[[feedback_narrow_briefing_completes_wide_times_out]] · [[feedback_codex_parallel_throughput_collapse]] · [[feedback_check_tracked_before_delete]] · [[feedback_pm_copy_untracked_files]]
