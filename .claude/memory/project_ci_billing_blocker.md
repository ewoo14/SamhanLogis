---
name: project_ci_billing_blocker
description: 2026-07-07 GitHub Actions 빌링 실패로 CI 전면 중단 — 계정 소유자만 해결 가능(머지 게이트 블로커)
metadata:
  type: project
---

# 🚨 GitHub Actions 빌링 실패 — CI 전면 중단 (2026-07-07 새벽 ~06:20 KST 발견)

## 증상
2026-07-06 21:19 UTC(=07-07 06:19 KST)경부터 **모든 신규 CI 잡이 startup_failure**(steps=0·2초·로그부재)로 실패. `gh run view` 명시 메시지:
> **X The job was not started because recent account payments have failed or your spending limit needs to be increased. Please check the 'Billing & plans' section in your settings**

## 원인
GitHub **Actions 결제 실패 / spending limit 초과**. 야간 자율 3트랙 대량 CI(+수차례 rerun)로 한도 도달 추정. 20:37·20:57 run=success → 21:19+ run=failure 로 경계 명확.

## 영향
- **모든 신규 push/PR 의 CI 가 green 불가** → 캐논 "CI green" 머지 게이트 충족 불가.
- Track A(#755, 20:03 머지)·Track B(#756) 는 한도 前 코드가 green 이었어 정상 머지됨. **Track C(#757) 및 이후 파이프라인은 CI green 불가 → 머지 defer**.

## 해결 (⚠️ 계정 소유자=개발책임자 전용)
GitHub 설정 → **Billing & plans** → 결제수단 갱신 / spending limit 증액. PM(Claude) 는 처리 불가 → **defer + 아침 보고 최상단 안건**.

## PM 대응 (빌링 복구 전)
- CI 무관 **로컬 검증**(standalone 라이브 QA·real-PG IT·typecheck·듀얼리뷰)은 계속 진행 → 슬라이스를 **merge-ready** 상태로.
- **CI 유발 push/rerun 최소화**(어차피 phantom·한도만 더 소진 가능). 머지는 빌링 복구 후.
- phantom fail(steps=0)을 코드결함으로 오판 금지 → [[feedback_workflow_discipline_root_cause]].

## 복구 후
빌링 정상화 시 각 대기 PR CI 재실행(빈 커밋 or rerun)→green 확인→머지.

## 2026-07-07 후속 — Codex(ChatGPT) 사용량 한도 (STEP4 블로커)
`mcp__codex__codex` 호출이 **"You've hit your usage limit ... try again at Jul 11th 2026"** 로 차단(계정 레벨, codex exec도 동일 계정=동일 차단). 캐논 STEP4(Codex 5-agent 순차 듀얼리뷰) 불가.
**개발책임자 결정(2026-07-07)**: **Opus 독립 적대검증으로 STEP4 대체** — Codex 대신 별도 Opus 5-agent를 "적대적 refute 관점"(각 fix를 깨뜨려 시도·의심 기본)으로 실행해 STEP4 갈음. **정식 승인 대체이며 단축 아님**. PR·dev-report에 "STEP4=Opus 적대검증(Codex 한도 대체, 개발책임자 승인)" 명시. Codex 복구(Jul 11) 후 여력되면 소급 Codex 재검 가능(선택). [[feedback_canonical_workflow]] [[feedback_review_5agent_no_shortcut_strict]]
