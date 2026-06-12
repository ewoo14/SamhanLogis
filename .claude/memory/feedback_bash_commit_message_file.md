---
name: feedback_bash_commit_message_file
description: Bash 도구에서 커밋 메시지는 @'...'@ here-string 금지 — git commit -F 파일 사용
metadata:
  type: feedback
---

**Bash 도구(bash 셸)에서 멀티라인 커밋 메시지는 PowerShell here-string `@'...'@` 문법을 절대 쓰지 말 것.** bash 는 이를 `@`(리터럴 문자) + 작은따옴표 문자열 + `@`(리터럴)로 파싱한다. 결과: 커밋 **제목 첫 줄이 `@`** 로 박히고(실제 제목 `[FEAT]/[FIX] ...`는 둘째 줄로 밀림), 본문 끝에 `@` 한 줄이 남는다. `git log --oneline` 에서 제목이 `@ [FIX] ...`로 깨져 보인다.

**올바른 방법**: 커밋 메시지를 Write 도구로 UTF-8 파일(예: `.claude/tmp/commit-msg.txt`)에 쓴 뒤 `git commit -F <파일>`. 한글·다국어·이모지·trailer 모두 안전. (PR 본문이 `gh ... --body-file`을 쓰는 것과 동일 원리 — [[feedback_powershell_utf8_writes]].)

**Why**: PR #474 §7 작업에서 3개 커밋 제목이 전부 `@ [FEAT]/[FIX] ...`로 깨졌고, 개발책임자가 "커밋할때 주제를 왜 명시안했어?"로 지적. 이미 푸시된 commit 이라 filter-branch + force-push(개발책임자 명시 승인)로 사후 복구해야 했다. `@'...'@` 는 **PowerShell 도구 전용** here-string 이며 Bash 도구에서는 무효.

**How to apply**: ①멀티라인 커밋 = Write→`git commit -F 파일`. ②부득이 `-m` 인라인이면 단일 라인만. ③PowerShell 도구에서 `@'...'@` here-string 을 쓸 때도 그 커밋 명령이 **유일 명령**이어야 함(`git add ...; git commit -m @'...'` 한 줄 금지 — 과거 회고). 도구(bash vs PowerShell)와 문법을 항상 일치시킬 것.
