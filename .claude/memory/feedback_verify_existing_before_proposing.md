---
name: feedback-verify-existing-before-proposing
description: 조사·제안·결정 상정 전에 ①코드 ②이슈 ③기존결정 3축을 반드시 대조 — 이미 있는 것을 새 일로 올리지 마라 (2026-08-11 개발책임자 지시)
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 348866c5-6b7f-48f4-b9d8-efa5075df661
  modified: 2026-08-10T23:20:04.963Z
---

🚨 **무엇이든 "새로 만들자" 로 올리기 전에 3축을 대조한다.**

> *"GAS 전수조사 시 **기존 이슈 또는 구현된 기능인지, 그것도 확인**하라해줘."* (2026-08-11 개발책임자)

## 3축

```text
① 코드   git ls-files <추정경로>  ·  git grep -ril <기능어> -- services/ clients/
② 이슈   gh issue list --state all --limit 400   ← 🚨 CLOSED 포함. 닫힌 이슈가 곧 구현이다
③ 기존결정  .claude/memory/ · docs/handoff/CURRENT-WORK.md · 해당 PR 코멘트
```

**Why:** 이 세션에만 **네 번** 이미 있는 것을 개발책임자께 물었다 —
거래처 DC 설정 화면(`SalesPartnerDcConfigPage.tsx`) · 배차 지역 설정 화면(`DispatchGroupPage`) ·
세트 구성품 비율(`#1093 CLOSED` / `#1143 OPEN`) · 단가변동 이력(`price_history` 테이블 + `#1140 OPEN`).
매번 개발책임자가 *"이미 정한 결정이 있을텐데?"* 로 정정해야 했다.
그리고 조사 산출물도 같은 병을 앓았다 — Critic 이 원문 결정 50건 중 **상당수가 이미 저장소에 있다**고 걸러냈다.

🔑 **가장 자주 놓치는 축은 ②의 CLOSED 다.** 이 저장소는 기능을 이슈로 완결하고 닫는다.
`--state open` 만 보면 구현된 기능이 통째로 안 보인다.

🔑 **"기능이 없다" 와 "이름이 다르다" 를 구분하라.** 레거시 이름으로 grep 해서 안 나오는 것은
없는 것이 아니라 **우리 이름으로 있는 것**일 수 있다. 도메인 개념으로도 찾아라.
(실측: 원본 전용 이름 257개 중 **109개가 '대체'** — 이름만 다르고 기능은 있었다.)

## How to apply

**조사·제안 산출물의 모든 항목에 네 열을 의무화한다:**

| 열 | 내용 |
|---|---|
| `existing_file` | 대응 코드가 있으면 `파일:줄`, 없으면 **검색어와 함께** `없음(grep: …)` |
| `existing_issue` | 이슈 번호 + OPEN/CLOSED, 없으면 `없음` |
| `prior_decision` | 관련 기존 결정, 없으면 `없음` |
| `semantic_delta` | 있는데도 올리는 경우 **무엇이 다른지** |

🚨 **하나라도 걸리면 질문이 바뀐다** — *"만들까요?"* 가 아니라
*"이미 있는 것과 이렇게 다른데 맞출까요?"* 이고, 재현 fixture 로 그 차이를 보여야 한다.

🚨 **거르는 것도 보고하라.** 몇 건을 왜 걸렀는지 남기지 않으면 다음 라운드가 또 올린다.

관련: [[feedback-always-present-options-for-decisions]] — 올릴 것이 남았을 때 비로소 선택지를 만든다.
[[feedback-conflict-is-mostly-one-sided-blank]] — 올리기 전에 "고를 게 있긴 한가" 를 먼저 센다.
