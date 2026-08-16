---
name: feedback-gui-live-qa-steals-the-desktop
description: "GUI 라이브QA 는 개발책임자의 화면을 빼앗는다 — 허락받고 돌리고, 라운드마다 프로세스를 회수하라"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: c912e540-6b1a-48d7-a602-a64c7fa3e6ca
  modified: 2026-08-16T05:34:08.088Z
---

2026-08-16 개발책임자: *"뭔데 자꾸 프로그램이 켜지는거야"* → *"빨리 정리해 지금 계속 프로그램이 켜지잖아"*

## 무슨 일이 있었나

머지 게이트 ③(라이브QA=실서버 실제 실행)을 채우려고 매 라운드 브리핑에
**실 Electron production renderer + Playwright 실행**을 요구했다.
5슬롯이 병렬로 돌면서 **아로로지스 데스크톱 창이 계속 떴다 사라졌고**, 개발책임자가 그 PC 에서 실제로 일하고 있었다.

그리고 더 나쁜 것 — **끝난 프로세스가 회수되지 않았다.**

```text
실측  총 275개 · 그중 60분 초과 255개
  chrome-headless-shell   20   (전량 유출)
  node                    83   (75개 유출)
  node_repl              172   (160개 유출)
메모리 여유 6.8 GB / 61.6 GB
```

🔑 **브리핑에 "정리하라" 를 안 넣었다.** 그것뿐이다.
codex 는 시킨 것만 한다 — 띄우라고 했으니 띄우고, 끄라는 말이 없으니 안 껐다.

## How to apply

```text
🚨 모든 codex 브리핑 말미에 종료 조건을 박는다
   "라운드 종료 전 띄운 Electron / Playwright / Vite / Metro / 격리 컨테이너를
    전부 종료하고, 잔여 프로세스 수를 세어 보고에 적을 것"

🚨 GUI 라이브QA 는 개발책임자가 그 PC 를 쓰는 동안 돌리지 않는다
   허락을 받고 돌린다. 그때까지 GUI 검증 필요 항목은 목록으로 쌓아 둔다
   (코드·API·DB 검증은 창을 안 띄우므로 계속 가능하다)

🚨 병렬 슬롯 수만큼 창이 뜬다는 것을 계산에 넣어라
   5슬롯 = 창 5개가 번갈아 뜬다
```

### 정리 시 주의

```text
node_repl.exe  codex 샌드박스 헬퍼 — 진행 중 라운드 것을 죽이면 그 라운드가 통째로 날아간다
               나이(StartTime)로 걸러라. 가장 오래된 활성 라운드보다 넉넉히 위 임계값을 써라
node.exe       CommandLine 에 codex|mcp-server / claude 가 있으면 절대 죽이지 마라
               MCP 서버를 죽이면 이후 모든 codex 발주가 실패한다
chrome-headless-shell   Playwright 잔재 — 나이 무관하게 안전한 편
```

**Why:** 라이브QA 는 머지 게이트라 포기할 수 없지만, **개발책임자의 작업 환경을 점유할 권리는 없다.**
증거를 얻는 대가로 사람의 화면을 빼앗으면 그건 좋은 거래가 아니다.

관련: [[feedback_qa_processes_leak_and_starve_machine]] · [[feedback_live_qa_every_round_screenshots]] ·
[[feedback_canonical_workflow]] · [[feedback_codex_parallel_throughput_collapse]]
