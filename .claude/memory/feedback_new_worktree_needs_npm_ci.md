---
name: feedback_new_worktree_needs_npm_ci
description: "🚨 새 워크트리에는 node_modules 가 없다 — \"로컬 의존성 부재로 미검증\" 은 변명이 아니라 npm ci 를 안 돌린 것이다 (2026-08-17)"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 3eff3ba8-a0c6-4617-8291-fbe5d48c20cc
  modified: 2026-08-17T08:06:35.128Z
---

# 🚨 "로컬 의존성 부재" 는 사유가 아니다 — **설치하면 된다**

> 2026-08-17 개발책임자: *"**로컬 의존성 부재라니? 설치하면 되잖아**"*

## 무슨 일이 있었나

`git worktree add` 로 만든 새 워크트리는 **`node_modules` 가 없다.** `.gitignore` 대상이라 따라오지 않는다.

구현자가 그 상태에서 이렇게 보고했다.

```text
"로컬 의존성 부재로 Jest, desktop typecheck/lint/build와
 라이브 캡처는 실행하지 못했으며, 보고서에 원문과 사유를 기록했습니다"
```

⟹ PM 이 그것을 그대로 받아 **"미검증" 으로 PR 을 열었다.** 잘못이다. `npm ci` 한 번이면 되는 일이다.

## 규칙

```text
새 워크트리를 만들면 즉시 의존성을 깐다
  clients/web/estimate-app   npm ci
  clients/desktop            npm ci
  clients/web/order-app      npm ci
  clients/web/design-system  npm ci
  (그 트랙이 만지는 패키지만 깔아도 된다)

🚨 브리핑에 "의존성이 없으면 npm ci 로 깔고 진행하라" 를 명시한다
🚫 "의존성 부재로 미검증" 을 완료 보고로 받지 마라
```

## 함께 챙길 것 — 새 워크트리에 없는 다른 것들

```text
infrastructure/.env.local     gitignore 대상 · 본체에서 복사해야 한다
                              없으면 resolveQaCredential() 이 자격을 못 찾아
                              라이브 QA 가 로그인에서 막힌다
node_modules                  npm ci
빌드 산출물(build/libs)        ./gradlew bootJar
```

⟹ 워크트리 생성 직후 **자격 복사 + npm ci** 를 한 세트로 한다.

**Why:** 검증을 못 한 채 머지 게이트에 올리면 CI 나 적대검증이 뒤늦게 잡고, 그만큼 라운드가 늘어난다. 설치는 몇 분이고 라운드 하나는 훨씬 비싸다.

**How to apply:** 워크트리를 만든 직후 `npm ci` 를 돌려 두고 브리핑을 발주하라. 구현자가 "의존성이 없다" 고 하면 그것은 PM 이 준비를 안 한 것이다. 관련 [[feedback_worktree_missing_gitignored_inputs]] · [[feedback_live_qa_stack_choice_by_change_layer]]
