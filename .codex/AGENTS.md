# .codex/AGENTS.md — 코덱스 행동 보강 규칙

> 본 파일은 루트 [`AGENTS.md`](../AGENTS.md) 의 행동(behavior) 보강용 규칙만 담습니다.
> 도메인/컨벤션/메모리 가이드는 루트 AGENTS.md 가 출처 (single source of truth).

---

## 1. 작업 시작 전 확인 규칙 (질문 우선)

요청이 모호하거나 방향이 여러 갈래일 때는 **바로 구현하지 말고 핵심 질문 1~2개만 먼저** 물어볼 것.

### 질문해야 할 상황
- 요구사항이 불명확할 때 (어떤 항목 우선? 어떤 페이지?)
- 구현 방식이 여러 가지일 때 (도메인 경계, 신규 모듈 위치 등)
- 기존 코드에 큰 영향을 줄 수 있을 때 (DB 스키마, 공통 모듈, auth 흐름)
- 범위가 클 때 (Phase 전체, 다중 service)
- 사용자 결정이 필요한 시점 (머지 trigger, 비용 발생, 외부 vendor)

### 질문하지 않아도 되는 상황 (즉시 진행)
- 명확한 버그 수정 요청 (재현 + fix 경로 명확)
- 단순 리팩토링 (행위 변경 없음)
- 요청에 이미 충분한 맥락이 있음 (파일/함수/기대 동작 명시)
- 메모리/문서 갱신, 오타 수정, README 보강 같은 무위험 작업
- 사용자가 명시적으로 "알아서 진행" / "autopilot" 선언한 범위 내

### 질문 형식
- **최대 2개**. 그 이상은 사용자 부담.
- **선택지 제시**: `(a) X / (b) Y / (c) 둘 다`. 사용자가 단답으로 답할 수 있게.
- **본인 추천 명시**: "본인은 (a) 권장. 사유: ...". 동의/반박만 하면 되도록.
- 단답 응답("ㅇ", "응", "ok", "진행") = 추천안 진행으로 해석.

---

## 2. 자율 진행 (autopilot) 범위

다음 범위는 사용자 확인 없이 자율 진행 가능:

- 아로로지스 분리 작업 (D-AX-*): 머지 요청 외 모든 단계 (TM/PR/CI/GitGuardian/5-team 검토)
- CI 모니터링: `gh pr checks --watch` 즉시 시작
- false positive GitGuardian: PM 자동 판정 후 진행
- 문서 갱신: README/ROADMAP/DECISIONS/dev-report 동시 갱신
- mock PNG 생성: `scripts/generate-*-screenshots.ps1` PowerShell `System.Drawing` 패턴

**autopilot 금지** (반드시 사용자 확인):
- main 머지
- AWS 자원 증설/비용 발생 작업
- 외부 vendor 계약/API 호출 (인성데이타, Aligo 등 production)
- force push, branch 삭제, history 재작성

---

## 3. 코덱스-specific 운영 팁

### 3.1 메모리 (Claude Code 의 `.claude/memory/`)
- 자동 로드 X. 필요 시 `read` 로 명시적 조회.
- 우선순위: 작업 시작 시 `docs/handoff/CURRENT-WORK.md` 만 필수 read. 그 외 메모리는 §2 의 컨벤션 표 보고 필요할 때 read.

### 3.2 PowerShell 환경 주의
- `Set-Content` 기본값 UTF-16 LE BOM → 한글 깨짐. 본문 작성은 코덱스 file write 도구 사용 (UTF-8).
- `gradle test` 가 한글 path 에서 fail. `gradle assemble` 사용 또는 영문 path.
- gradlew exec bit: Windows 커밋 시 `git update-index --chmod=+x gradlew` 필수.

### 3.3 5-team 디스패치 한계
- Claude Code 의 worktree 기반 동시 디스패치를 코덱스에서 그대로 재현하기 어려울 수 있음.
- 대안: TM 한 사람이 BE → FE → Designer → DevOps → QA 순차 진행. slow 하지만 산출 컨벤션은 유지 가능.
- 단, **QA sequential 원칙** 은 절대 유지 (BE/FE 산출 검증 후 QA).

### 3.4 PR 발행 후
- 즉시 `gh pr checks --watch` 시작 (사용자 허락 불필요).
- CI fail 시 즉시 fix commit. green 후 사용자에게 머지 요청.
- 머지 후 연관 Issue 즉시 close.

---

## 4. 사용자(개발책임자) 호칭 / 응대

- 호칭: **"개발책임자"** (회사 실제 대표는 김미선이라 "대표" 호칭 금지)
- 응답 톤: 짧고 명확. 한국어. 불필요한 요약/사족 금지.
- end-of-turn 요약: 1~2문장 이내. "무엇이 바뀌었고 다음은 무엇" 만.
