---
name: codex-model-auto-switch
description: Codex 는 항상 gpt-5.5 최고 모델 사용 (2026-05-28 사용자 directive). effort 는 시나리오별 high/xhigh
metadata:
  type: feedback
---

# Codex 모델 규칙

## 🚨 2026-05-28 사용자 directive — gpt-5.5 최고 모델 상시 사용

사용자(개발책임자) 명시: **"코덱스는 gpt 5.5 최고 버전 모델을 사용하도록"**. 따라서 모든 Codex 호출에 **`model = "gpt-5.5"`** (최고 버전) 사용. spark/medium default 폐기.

**How to apply (`mcp__codex__codex` 호출):**
- `model: "gpt-5.5"` (최고 버전). `config: {model_reasoning_effort: "high"}` 기본, 보안/migration/architecture/incident 는 `"xhigh"`.
- **주의**: 본 ChatGPT 계정 Codex 는 `gpt-5.2-codex` 미지원(400 error). `gpt-5.5` 가 거부되면 사용자에 보고 후 대체 변형 시도.
- 그 외 디스패치 규칙은 [[codex-sandbox-git]] (git 금지 + Claude commit 대행 + approval-policy never).

**Why (구버전):** (history) 과거엔 일상 작업 spark+medium / critical 만 gpt-5.5 전환이었으나, 사용자가 상시 최고 모델로 통일 지시.

---

## (history) 효과(effort) 시나리오 표 — model 은 항상 gpt-5.5, effort 만 분기

- **Default effort**: `high`
- **xhigh 시나리오**: 아래 표 (보안/migration/architecture/race/incident/AWS sizing/vendor)

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
