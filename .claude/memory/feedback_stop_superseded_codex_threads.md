---
name: feedback_stop_superseded_codex_threads
description: 🚨 설계가 뒤집히면 그 설계로 도는 codex 스레드를 즉시 중단시켜라 — 같은 워크트리에서 폐기된 설계를 구현하고 있다 (2026-08-14 #1210, 실측 3건)
metadata:
  type: feedback
---

# 🚨 설계가 뒤집히면 **도는 스레드부터 죽여라**

개발책임자 지시로 설계가 바뀌면 PM 은 결정 문서를 쓰고 새 브리핑을 보낸다.
그런데 **이전 브리핑으로 돌던 codex 는 그대로 살아 있다.** 그것이 같은 워크트리에서 **폐기된 설계를 구현하고 있다.**

## 실측 — 2026-08-14 `#1210` 하루에 3건

```text
14:xx  독립 QR 스캔 메뉴 구현 발주
17:xx  개발책임자 "메뉴는 따로 필요없어" — 설계 뒤집힘
       ⟹ 즉시 TaskStop. 아직 코드를 안 써서 버린 작업 0

17:xx  입고 배송태그 4종(구매·차용·반품·회차) 확정 → 구현 발주
17:5x  개발책임자가 입고 7종 · 출고 11종 으로 전면 재구성
       ⟹ 4종 설계로 도는 스레드 2개가 여전히 running
          같은 워크트리 · 같은 파일 (DeliveryTag.java · SlipFormPage.tsx)
       ⟹ TaskStop 2건. 그대로 뒀으면 7종 설계와 충돌하는 코드가 같은 파일에 들어갔다
```

🔑 **셋 다 "지시가 바뀌었으니 다음 브리핑에서 바로잡으면 된다" 로 넘길 뻔했다.**
codex 는 자기 브리핑만 보고 끝까지 간다. 지시가 바뀐 것을 알 방법이 없다.

## 특히 위험한 조합

```text
같은 워크트리          두 스레드가 같은 파일을 동시에 쓴다
같은 threadId 에 연속 reply   앞의 reply 가 아직 도는데 뒤의 reply 가 겹친다
                       (오늘 한 스레드에 3개가 동시에 running 이었다)
```

## How to apply

```text
설계가 뒤집힌 순간 순서
  ① 도는 스레드 목록을 확인한다 (TaskOutput block:false 로 running 인지 본다)
  ② 그 설계로 도는 것을 전부 TaskStop
  ③ 워크트리에 부분 산출물이 남았는지 git status 로 확인하고 필요하면 원복
  ④ 그 다음에 결정 문서를 쓰고 새 브리핑을 보낸다
🚫 ④를 먼저 하지 마라 — 문서 쓰는 동안 폐기된 코드가 쌓인다
```

🔑 **판단 기준은 "코드를 썼는가" 가 아니라 "그 설계로 돌고 있는가" 다.**
아직 안 썼어도 곧 쓴다. 오늘 첫 건은 중단이 빨라서 **버린 작업이 0** 이었다.

🚩 **한 스레드에 reply 를 연달아 보내지 마라.** 앞의 것이 끝났는지 확인하고 보낸다.
확인 없이 보내면 같은 워크트리에서 둘이 동시에 편집한다.

관련: [[feedback_codex_parallel_throughput_collapse]] · [[feedback_parallel_agent_gradle_shared_tree_contention]] ·
[[feedback_pm_verifies_round_and_directs_next_fix]]
