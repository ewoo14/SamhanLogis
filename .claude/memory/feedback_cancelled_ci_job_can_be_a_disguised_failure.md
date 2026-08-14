---
name: feedback_cancelled_ci_job_can_be_a_disguised_failure
description: 🚨 CI job 이 cancelled 면 "플레이크니까 재실행" 이 아니다 — 테스트가 실패 후 안 죽으면 failure 가 cancelled 로 위장된다. 로그부터 열어라 (2026-08-15 #1210, 재실행 2회 30분 낭비)
metadata:
  type: feedback
---

# 🚨 `cancelled` 는 결론이 아니다 — **실패가 위장된 것일 수 있다**

2026-08-15 `#1210`. CI 52 pass, 하나만 `cancelled`. 나는 그걸 **플레이크로 읽고 두 번 재실행**했다.
매번 15분씩 태우고 같은 자리에서 죽었다. 로그를 연 뒤에야 알았다.

```text
16:50:52  ELECTRON_STEP|group-page
16:51:22  locator.waitFor: Timeout 30000ms exceeded.
            - waiting for getByText('오전 8:36') to be visible
            at scripts/actual-entry.electron.contract.cjs:84
17:04:31  ##[error]The operation was canceled.
          Terminate orphan process: xvfb-run / Xvfb / npm / node / electron
```

🔑 **16:51 에 실패했는데 프로세스가 안 죽어서 17:04 job 타임아웃까지 매달려 있었다.**
그래서 결과가 `failure` 가 아니라 `cancelled` 로 찍혔다.

## 왜 이게 특히 나쁜가

```text
failure    → 로그를 연다
cancelled  → "러너가 뺏겼나 · concurrency 로 취소됐나" 로 읽고 재실행한다
```

**둘의 겉모습이 다르니 내 행동이 달라진다.** 그리고 재실행은 같은 결과를 15분에 한 번씩 반복한다.

🚩 원인은 두 겹이었다.
```text
① 시간대 의존 단정이 계열의 나머지 한 곳에 남아 있었다
   messenger-ui-v2.test.tsx 는 고쳤는데 actual-entry.electron.contract.cjs 는 안 고쳤다
② 계약 스크립트가 실패 후 종료코드를 안 내고 안 죽었다
   ①이 없었어도 ②는 언젠가 다른 실패에서 똑같이 터진다
```

## How to apply

```text
cancelled 를 보면 재실행하기 전에 step 목록과 로그를 먼저 본다
  gh run view <runId> --json jobs --jq '.jobs[] | select(...) | .steps[] | "\(.conclusion) \(.name)"'
  gh api "repos/<owner>/<repo>/actions/jobs/<jobId>/logs" | tail -60
🚩 앞 step 들이 success 인데 마지막 하나만 cancelled 면 거의 항상 "매달린 실패" 다
   진짜 취소(러너 회수·concurrency)는 보통 앞쪽 step 에서 끊긴다
```

🚨 **하네스가 실패하면 0이 아닌 종료코드로 즉시 죽고 띄운 것을 정리해야 한다.**
타임아웃을 늘려서 넘기지 마라 — 실패를 더 늦게 보이게 할 뿐이다.

🔑 그리고 이건 계열 sweep 규칙의 실제 사례다 — **같은 단정이 두 곳에 있었고 한 곳만 고쳤다.**
"고쳤다" 는 그 파일에서 참이었고 CI 에서는 거짓이었다.

관련: [[feedback_defect_family_sweep_fix]] · [[feedback_ci_setup_job_failure_is_github_outage]] ·
[[feedback_qa_harness_commit_breaks_ci]] · [[feedback_exit_code_measurement_traps]] ·
[[feedback_qa_processes_leak_and_starve_machine]]
