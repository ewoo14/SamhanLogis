---
name: feedback_codex_parallel_throughput_collapse
description: 🚨 codex 병렬 12개는 12배가 아니라 0배 — 나중에 띄운 세션이 앞선 것을 굶기고 어느 선을 넘으면 전부 멈춘다. 프로세스 목록이 아니라 세션 로그로 확인할 것 (2026-08-02 실측)
metadata:
  type: feedback
---

# 🚨 병렬 codex 를 늘리면 어느 선에서 **처리량이 0 이 된다**

**2026-08-02 실측.** 개발책임자 지시로 트랙 12개를 동시에 띄웠다. 40분 뒤 세션 로그를 열어보니 **디스패치 순서대로 단조 감소**했다.

```text
세션            assistant턴  도구호출
14:08 (#984)         8         21   ← 유일하게 완주
14:17                5         16
15:38                2          5
15:52                3          3
16:01                2          2
16:06                1          1
16:08 (마지막)       0          0   ← 한 턴도 못 돌았다
```

그리고 **11개 전부가 `16:20:47` 에 동시에 멎었다.** 35분간 완전 정지.

## 🔑 rate limit 이 아니다

```json
"primary": { "used_percent": 8.0, "window_minutes": 10080 }
"rate_limit_reached_type": null
```

주간 한도의 **8%** 만 썼다. `Selected model is at capacity` 도 아니다. 순수하게 **동시 실행 수** 문제다.

## 🔑 프로세스 목록으로는 안 보인다

`Get-Process` 에 `codex` 가 **40개** 떠 있었다. 전부 살아 있었다. **살아 있는 것과 일하는 것은 다르다.**

## 확인 방법 — 세션 로그

```bash
cd ~/.codex/sessions/<YYYY>/<MM>/<DD>
for f in $(find . -name '*.jsonl' -newermt '-20 minutes'); do
  wt=$(grep -ao 'worktrees.\{1,4\}t[0-9a-z]*' "$f" | head -1 | grep -o 't[0-9a-z]*$')
  a=$(grep -c '"role":"assistant"' "$f"); t=$(grep -c '"type":"custom_tool_call"' "$f")
  printf "%s %-8s %8sB 수정 %s a=%-3s t=%-3s\n" "$(echo $f|cut -c11-26)" "$wt" \
    "$(stat -c %s $f)" "$(date -d @$(stat -c %Y $f) +%H:%M:%S)" "$a" "$t"
done
```

- `assistant` 턴 수와 `custom_tool_call` 수가 **실제 진행량**이다.
- 파일 **크기**의 대부분은 `world_state`(AGENTS.md 통째 덤프)라 크기만 보면 일한 것처럼 보인다. **줄 수도** 마찬가지다.
- 세션 파일 안의 `worktrees\\tNNN` 로 **어느 트랙인지** 식별한다. task_id ↔ 세션 매핑은 디스패치 순서 추측으로 하면 **틀린다**(실제로 틀렸다).

## 🚨 MCP 7200초 타임아웃은 **클라이언트 측**이다

타임아웃 통지를 받은 뒤에도 **밑의 codex 세션은 계속 돈다.** 실측: `#1059` 는 "실패" 통지 후에도 도구호출이 6→7 로 늘었다.

⟹ 이것이 [[feedback_narrow_briefing_completes_wide_times_out]] 의 *"타임아웃인데 산출물이 있었다"*(하루 9회)의 진짜 이유다.

- 🚨 **타임아웃 직후 회수하면 작업 중간 상태를 본다.** 완료가 아니다.
- 🚨 **즉시 재발주하면 같은 워크트리에 세션 둘이 붙는다** → [[feedback_git_add_all_swallows_concurrent_round]] 로 이어진다.
- 회수 전에 **세션이 아직 크고 있는지** 먼저 보라. 크고 있으면 기다린다.

**Why:** 상류가 동시 요청을 거절하지 않고 **조용히 큐에 넣는다.** 그래서 에러가 없고, 프로세스도 살아 있고, 로그 파일도 존재한다 — 오직 `assistant` 턴만 안 늘어난다.

## How to apply

- 🚨 **동시 codex 는 3~4 개.** 하나 끝나면 하나 채운다. "슬롯을 다 채운다" 는 지시를 받아도 **12개는 12배가 아니라 0배**임을 보고하고 3~4로 운영한다.
- 🚨 트랙 상태를 보고하기 전에 **세션 로그로 진행량을 확인**한다. `TaskList`·프로세스 목록·"돌고 있습니다" 는 근거가 아니다.
- 굶은 세션은 **산출물이 0** 이라 `TaskStop` 해도 잃을 것이 없다 — 평소의 *"강제 종료 = 산출물 0"* 경고([[feedback_parallel_backend_tracks_share_docker_stack]])와 **반대 상황**이다. `git status --porcelain` 으로 먼저 확인하고 판단한다.
- 정지 후 **남은 세션이 재개되는지** 90초 관측으로 확인한다(실측: 즉시 재개됐다).

## 관련
[[feedback_narrow_briefing_completes_wide_times_out]] · [[feedback_throughput_parallel_scope_freeze_batch]] · [[feedback_model_substitution_delegated_to_pm]] · [[feedback_pm_codex_progress_verification]]
