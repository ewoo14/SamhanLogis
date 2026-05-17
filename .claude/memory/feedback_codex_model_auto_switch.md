---
name: codex-model-auto-switch
description: Codex 호출 시 default는 spark+medium (fast), 특정 시나리오에서는 gpt-5.5 + high/xhigh 자동 전환. PM 판단 의무
metadata:
  type: feedback
---

# Codex 모델 자동 전환 규칙 (2026-05-17 신규)

## 기본 규칙

- **Default**: `model = "gpt-5.3-codex-spark"` + `model_reasoning_effort = "medium"` (`~/.codex/config.toml` 영구)
- **자동 전환**: 아래 시나리오 진입 시 PM 이 `--model gpt-5.5 --effort high` 또는 `xhigh` override 자동 추가 (사용자 질문 불필요)

**Why:** 일상 sliced 작업 (단순 fix, label 변경, 한국어 치환, lint, mock PNG regen) 은 spark + medium 으로 충분. 단 critical 깊이 필요 작업에서 spark 의 얕은 reasoning 으로 결함 놓치면 `feedback_no_conditional_merge.md` 위반.

**How to apply:** Codex 호출 prompt 작성 시 시나리오 분류 → 아래 표대로 `--model` / `--effort` override 자동 추가.

## 자동 전환 시나리오 (high/xhigh 필수)

### 🔒 보안 review / 감사
- **Trigger**: auth flow / JWT / RBAC / SQL injection / XSS / CSRF / GitGuardian 결과 / OWASP / secret rotation / 권한 escalation 분석
- **Override**: `--model gpt-5.5 --effort high`
- **이유**: 보안 결함은 1건도 production 유출 시 금전/신뢰 손실. 깊은 attack vector 추론 의무

### 🗄️ Database migration / schema 변경
- **Trigger**: Flyway V* 신규 + breaking change / partial unique / cross-DB join 정책 / soft-delete + 외래키 / data migration ETL / rollback plan
- **Override**: `--model gpt-5.5 --effort high`
- **이유**: migration 실수 → production 데이터 손실. constraint 정합성 + rollback 안전성 깊이 검증 필요

### 🏗️ Architecture 결정
- **Trigger**: 도메인 경계 / MSA service split / event-driven boundary / saga pattern / CQRS / Event Sourcing / multi-service transaction
- **Override**: `--model gpt-5.5 --effort high` (또는 `xhigh` for production-impact)
- **이유**: architecture 결정은 후속 100+ 슬라이스에 영향. trade-off + alternative 깊이 분석 필요

### 🏎️ Race condition / concurrency
- **Trigger**: TOCTOU / JSONB merge / transaction isolation / REQUIRES_NEW / partial unique race / distributed lock / saga compensation / dead-letter queue
- **Override**: `--model gpt-5.5 --effort high`
- **이유**: concurrency 결함은 reproducer 어려움 + production 에서만 발견. 정밀 추론 필수

### 🚨 Production incident debug / root cause
- **Trigger**: incident SEV-2 이상 / multi-component failure / data 손상 / cascade failure / unclear root cause
- **Override**: `--model gpt-5.5 --effort xhigh`
- **이유**: 잘못된 root cause → 재발생. 모든 component 깊이 trace 필수

### ☁️ AWS resource sizing / cost analysis (Phase 11)
- **Trigger**: EC2 instance type 결정 / RDS sizing / Auto Recovery / cost optimization / spike traffic capacity / SLA 계산
- **Override**: `--model gpt-5.5 --effort high`
- **이유**: 비용 결정은 월 정기 지출 (`project_phase11_aws.md` ₩405K). 과소 sizing → outage, 과대 → 비용 낭비

### 🤝 외부 vendor 계약 / API contract
- **Trigger**: 인성데이타 퀵프로그램 / Aligo SMS / 외부 production API 호출 / 비용 발생 / SLA 협상 / 재시도 정책
- **Override**: `--model gpt-5.5 --effort high`
- **이유**: vendor 호출 실패 → 비즈니스 중단. retry / circuit breaker / fallback 정책 깊이 설계

## Default 유지 시나리오 (spark + medium 충분)

- ✅ 단순 fix (typo, lint, formatter, EOF blank line)
- ✅ 한국어 치환 (영문 라벨 → 한국어 운영 라벨)
- ✅ Mock PNG regen (PowerShell System.Drawing)
- ✅ Storybook story 추가 / variant 옵션 추가
- ✅ design-system token 일치 검증
- ✅ Javadoc 한국어 추가 / dev-report markdown 갱신
- ✅ Playwright spec testid 추가 / mock route 보강
- ✅ 5-agent 사이클 review (단순 cross-check)
- ✅ CI fail diagnosis (단순 lint / compile error)

## Override 호출 예시

```bash
# Default (spark + medium) — config.toml 그대로
node codex-companion.mjs task --write "F-* fix"

# High reasoning override (보안/migration/architecture)
node codex-companion.mjs task --write --model gpt-5.5 --effort high "FOSS Auth migration plan"

# xhigh (production incident)
node codex-companion.mjs task --write --model gpt-5.5 --effort xhigh "SEV-2 root cause"
```

또는 codex:rescue agent 호출 시:
```
Agent(subagent_type="codex:codex-rescue", prompt="--model gpt-5.5 --effort high ... 보안 review ...")
```

## 자동 판단 의무

- PM (Claude) 가 Codex 호출 prompt 작성 시 **trigger 표 자동 확인**
- 매칭되면 `--model` / `--effort` override 자동 추가 (사용자 질문 X)
- 매칭 안 되면 default spark + medium
- 불확실 시 보수적으로 high (safer)

## 관련 메모리

- [[codex-plugin-setup]] — Codex plugin 셋업 + `[windows] sandbox = "unelevated"`
- [[dual-5agent-review]] — Claude + Codex 5-agent 양쪽 리뷰
- [[no-conditional-merge]] — 0 결함 정책 (low effort 위험)
- [[pm-full-autonomy]] — PM 자율 머지 + 다음 슬라이스 진입
