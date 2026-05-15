# SamhanLogis (Samhan Public + 아로로지스) — Codex CLI 진입점

> 본 파일은 OpenAI Codex CLI 세션 시작 시 자동 로드됩니다 (repo-level AGENTS.md).
> 행동 보강 규칙은 [.codex/AGENTS.md](.codex/AGENTS.md) 참조.
>
> **운영 단위 명칭 (2026-05-14 결정)**
> - **Samhan Public** (삼한 퍼블릭) = 기존 14 service 묶음의 외부 호칭
> - **아로로지스** (arologis) = Samhan Public 마이크로서비스에서 분리된 독립 운영 단위 (Phase 10.5)
> - `SamhanLogis` = 폴더/repo working dir 명일 뿐 (외부 호칭 X)

---

## 0. 코덱스가 본 repo 에서 먼저 알아야 할 3가지

1. **본 repo 의 1차 도구는 Claude Code 였으나, 토큰 한도 사유로 코덱스로 전환됨 (2026-05-15)**. Claude Code 의 auto-memory (`.claude/memory/*.md`) 는 코덱스가 자동 로드하지 못하지만 git tracked 이므로 **read 는 가능**. 아래 §4 의 "메모리 참조 가이드" 에 어느 파일을 언제 읽으면 되는지 정리.
2. **사용자 호칭 = "개발책임자"**. 실제 회사 대표는 김미선(다른 인물)이므로 "대표" 호칭 금지.
3. **모호한 요청은 바로 구현하지 말고 1~2개 핵심 질문**. 본 repo 는 도메인 컨벤션(한국어 commit/통합 PR/UUID 비공개/BaseEntity 등)이 많아 잘못된 방향으로 진행하면 통째로 재작업해야 함. 상세 규칙은 §3 "질문 규칙".

---

## 1. 즉시 시작 — 코덱스 첫 명령

```powershell
git pull
git log --oneline -10
Get-Content docs/handoff/CURRENT-WORK.md -TotalCount 80
```

읽고 나면:
- §0 의 "즉시 시작" 블록 = 어떤 main commit 이 최신인지
- §1 = 방금 끝난 일
- §3 = 다음 trigger 후보 (사용자 결정 대기)

**현재 진행 중인 브랜치 (2026-05-15 기준): `feat/arologis-dispatch-pages-extract`** — D-AX-11 (아로로지스 데스크톱 배차 페이지 이전). 5-team 리뷰 + 보완 commit 완료, PM 승인 artifact 까지 기록됨. 다음 단계는 사용자 머지 trigger 대기 또는 후속 fix.

---

## 2. 핵심 컨벤션 (코덱스는 .claude/memory 를 자동 로드하지 않으므로 본 절을 출처로 사용)

| 규칙 | 요점 | 출처 메모리 (필요 시 read) |
|---|---|---|
| **한국어 commit/PR/Issue** | `feat:`/`fix:`/... prefix + Co-Authored-By trailer 만 영어, 본문은 한국어 | `.claude/memory/feedback_korean_commits.md` |
| **5-team 패턴** | BE/FE/Designer/DevOps **4 parallel** + QA **sequential** (실 산출 검증 + 실 캡처) | `feedback_multi_agent_team_pattern.md`, `feedback_qa_sequential_after_be_fe.md` |
| **통합 PR 의무** | 단편 PR 금지. 디자인/UI 차이까지 묶어 통합 PR + QA + TM 승인 | `feedback_integrated_pr_pattern.md` |
| **QA 스크린샷** | 모든 PR 본문에 QA 결과 1장 이상 인라인 (`docs/qa/<slug>/screenshots/*.png`) | `feedback_pr_qa_screenshots.md` |
| **QA mock fallback** | 실 emulator 어려운 경우 PowerShell `System.Drawing` mock PNG OK (`scripts/generate-*-screenshots.ps1` 패턴) | 동상 |
| **UUID 사용자 비공개** | 모든 클라이언트 화면 UUID 노출 금지. 비즈니스 식별자(슬립번호/창고 코드/거래처명)만 | `feedback_uuid_no_user_visibility.md` |
| **BaseEntity 7 audit** | 모든 entity 가 `BaseEntity` 상속 + Soft Delete only (hard delete 금지) | `project_build_conventions.md` |
| **한글 경로 JDK 트랩** | 한글 path 에서 `gradle test` fail. `assemble` 사용 또는 영문 path 로 이동 | `feedback_korean_path_jdk.md` |
| **gradlew chmod** | Windows 커밋 시 `git update-index --chmod=+x gradlew` 필수 (Linux CI Permission denied 방지) | `feedback_gradlew_exec_bit.md` |
| **PowerShell UTF-8 트랩** | `Set-Content` 기본 UTF-16 LE BOM → 한글 깨짐. body 작성은 Write/Edit/heredoc 만 | `feedback_powershell_utf8_writes.md` |
| **머지 권한** | 사용자(개발책임자)만 머지 trigger. 5-team 0결함 + CI green 이어도 사용자 명시 요청 대기 | `feedback_user_merge_authority.md` |
| **GitGuardian 자동 처리** | false positive 명백 시 PM 자동 판정 후 진행, 사용자 대시보드 위임 X | `feedback_gitguardian_false_positive.md` |
| **PR CI 모니터링** | PR 발행 즉시 `gh pr checks --watch` 시작, fail 시 즉시 fix, green 후 사용자 머지 요청 | `feedback_pr_ci_monitoring.md` |
| **role 표기 풀네임** | PR/Issue/문서에서 역할은 `MASTER`/`MANAGER`/... 풀네임. M/M/D 약어 금지 | `feedback_role_naming_full.md` |
| **Issue 자동 close** | PR 발행 시 `연관 Issue: #N` 본문 명시, 머지/close 후 즉시 close | `feedback_issue_close_after_pr.md` |
| **문서 동기화** | 매 PR 에 README + ROADMAP + DECISIONS + dev-report 갱신 포함. 별도 docs-only PR 금지 | `feedback_continuous_docs_sync.md` |
| **3-layer 문서화** | (1) 한국어 Javadoc, (2) springdoc-openapi 자동, (3) `docs/dev-reports/<slice>.md` 누적 | `feedback_function_documentation.md` |
| **Testcontainers Windows** | Windows + Docker Desktop npipe 한계로 IT skip 가능. `DOCKER_HOST=tcp://localhost:2375` 우회 | `feedback_testcontainers_windows_docker.md` |
| **IT 외부 client `@MockBean`** | SpringBootTest IT 의 모든 외부 client 격리 + lenient setup. 누락 시 Eureka 비활성 → 500 | `feedback_it_mockbean_external_clients.md` |

**아로로지스 자율 진행 권한 (2026-05-14)**: 아로로지스 분리 작업은 머지 요청 외 모든 단계(TM/PR/CI/GitGuardian/5-team 검토)는 PM 자율. 단 코덱스에서는 사용자 결정 사항이 모호하면 §3 의 질문 규칙 따라 먼저 질문. 출처: `.claude/memory/feedback_arologis_extract_autopilot.md`.

---

## 3. 질문 규칙 (코덱스 자율 진행 시 필수)

**원칙**: 사용자는 코덱스가 "알아서 진행"하는 것을 기대하지만, **방향이 모호한 채 잘못된 구현을 하면 본 repo 의 통합 PR/5-team 회귀 비용이 큼**. 다음 케이스에서는 구현/디스패치 전에 반드시 1~2개 핵심 질문 후 진행.

### 3.1 질문해야 할 상황

| 상황 | 예시 | 권장 질문 |
|---|---|---|
| 요구사항이 불명확 | "X 페이지 개선해줘" — 구체 항목 미명시 | "어떤 항목 우선? (성능/디자인/접근성/기능 추가 중)" |
| 구현 방식이 2개 이상 | 신규 endpoint 위치, 도메인 경계 | "arologis-service vs slip-service 중 어느 쪽에 두는 것이 적절한지 확인 부탁" |
| 기존 코드 영향 큼 | DB 스키마 변경, 공통 모듈 수정 | "이 변경은 Flyway V?? migration 동반 + N service 재배포 필요. 진행 가능한지" |
| 범위가 큼 (1 PR 초과) | "Phase X 전체 진행" | "Phase X 는 D-XX-01~10 결정 10건 포함. 통합 1 PR 으로 묶을지 vs 사전 spec 작성 후 단계 PR 분할" |
| 사용자 결정 사항 | 머지, deploy trigger, 비용 발생 (AWS 자원 증설 등) | "PR #NN CI green + 5-team 0결함 상태. 머지 진행해도 될지 확인" |
| 외부 vendor / 비용 | 인성데이타 API, Aligo, AWS 리소스 | "본 변경은 ₩X/월 추가 비용. 진행 가능한지 확인" |
| 명칭/표기 모호 | "아로로지" vs "아로로지스" | 메모리 read 로 해결 가능하면 질문 불필요. 메모리에도 없으면 질문 |

### 3.2 질문하지 않아도 되는 상황 (즉시 진행)

- 명확한 버그 수정 요청 (재현 + fix 경로 명확)
- 단순 리팩토링 (행위 변경 없음)
- 요청에 이미 충분한 맥락이 있음 (파일/함수/기대 동작 명시)
- 메모리/문서 갱신, 오타 수정, README 보강 같은 무위험 작업
- 사용자가 명시적으로 "알아서 진행" 또는 "autopilot" 선언한 범위 내 작업

### 3.3 질문 형식

- **최대 2개**. 그 이상은 사용자 부담. 더 많으면 핵심 1개부터 순차 진행.
- **선택지 제시** 권장: "(a) X 방식 / (b) Y 방식 / (c) 둘 다 진행". 사용자가 단답으로 답할 수 있게.
- **자기 추천 명시**: "본인은 (a) 권장. 사유: ...". 그래야 사용자가 동의/반박만 하면 됨.

### 3.4 사용자 단답 응답 처리

사용자가 "ㅇ", "응", "ok", "진행" 만 답하면 = 추천안(a) 진행. "(b)" 또는 "다른 방향" 명시 시에만 변경.

---

## 4. 메모리 참조 가이드 (.claude/memory 는 git tracked 라 코덱스도 read 가능)

코덱스가 자동 로드하지는 않지만, 특정 상황에서 `read` 도구로 해당 파일을 읽으면 의사결정이 정확해짐.

| 상황 | 읽을 파일 |
|---|---|
| 본 repo 가 뭐 하는 곳인지 모를 때 | `.claude/memory/project_overview.md` |
| Phase 10 / Phase 11 / 로드맵 확인 | `project_arologis_phase10.md`, `project_phase11_aws.md` |
| 아로로지스 독립 분리 배경 | `project_arologis_independent.md` |
| 도메인/서브도메인 전략 | `project_domain_strategy.md` |
| 한국 회계 표준 계정과목 seed | `project_korean_accounting.md` |
| 개발환경 (JDK/Gradle/Docker) | `project_dev_environment.md` |
| 빌드 컨벤션 (BaseEntity / Soft Delete / 7 audit field) | `project_build_conventions.md` |
| 배차 보드 도메인 | `project_samhan_dispatch_board.md` |
| PR/Issue 워크플로우 | `feedback_github_pr_workflow.md`, `feedback_pr_review_workflow.md` |
| 사용자 호칭 / 역할 | `feedback_user_title.md`, `user_role.md` |
| 멀티 에이전트 5-team 패턴 | `feedback_multi_agent_team_pattern.md`, `feedback_qa_sequential_after_be_fe.md` |
| 통합 PR 패턴 회고 | `feedback_integrated_pr_pattern.md` |
| 인쇄/디자인 iteration | `feedback_print_design_iteration.md` |
| PM 통합 빌드 가드 | `feedback_pm_integration_build_check.md` |
| Monitor 도구 자동 사용 (사용자 허락 불필요) | `feedback_monitor_no_permission.md` |
| TM 주도 + 토론 패턴 | `feedback_tm_led_agent_discussion.md` |
| 모든 메모리 인덱스 | `.claude/memory/MEMORY.md` |

---

## 5. 작업 핸드오프

### 5.1 현재 작업 상태

- **`docs/handoff/CURRENT-WORK.md`** = 진행 슬라이스 + 다음 단계 + 미해결 결정. **세션 시작 시 무조건 read**.
- **`migration/decisions/DECISIONS.md`** = D-XX-NN 결정 누적 (50+ entry). 새 결정 발생 시 본 파일에 entry 추가.
- **`docs/superpowers/specs/<date>-<slice>.md`** = 슬라이스 spec (브레인스토밍 결과).
- **`docs/superpowers/plans/<date>-<slice>.md`** = 5-team plan (TM 작성).
- **`docs/dev-reports/<slice>.md`** = 3-layer 문서화 누적.

### 5.2 갱신 의무

| 시점 | 갱신 대상 |
|---|---|
| 매 PR 작업 | README + ROADMAP + DECISIONS + `docs/dev-reports/<slice>.md` (별도 PR 금지) |
| PC 이동 전 (집↔회사) | `docs/handoff/CURRENT-WORK.md` |
| 새 메모리 규칙 발견 (Claude Code 환경에서) | `.claude/memory/feedback_*.md` 또는 `project_*.md` + `MEMORY.md` 인덱스 |
| Claude Code 재진입 시 | `.\scripts\sync-claude-memory.ps1` (repo `.claude/memory/` → 사용자 홈 단방향 복사) |

### 5.3 회사 PC 첫 셋업

- **`docs/dev-environment-setup-multi-pc.md`** — 회사 PC 1회 셋업 가이드 (`.env`, Docker, 이카운트 raw 재다운로드 등).

---

## 6. PR/머지 워크플로우 (요약 — 상세는 `feedback_pr_review_workflow.md`)

```
[작업 시작]
  → (큰 작업) brainstorm → spec (docs/superpowers/specs/) → plan (docs/superpowers/plans/) → 5-team 디스패치
  → (작은 작업) 즉시 commit
[PR 발행]
  → 본문에 QA 스크린샷 인라인 + 연관 Issue: #N 명시
  → gh pr checks --watch 자동 시작 (Monitor 도구, 사용자 허락 불필요)
[5-team 리뷰]
  → BE/FE/Designer/DevOps 4 parallel → QA sequential (실 산출 검증)
  → reviewer agent 가 PR comment 로 토론 → TM 종합 후 추가 commit
[CI green + 0결함]
  → 사용자(개발책임자)에게 머지 요청 메시지
  → 사용자 머지 trigger → PR merge → 연관 Issue close
[다음 슬라이스]
  → docs/handoff/CURRENT-WORK.md 갱신
```

코덱스 환경 한계로 5-team 동시 디스패치 어려운 경우, TM 한 사람이 모든 team scope 를 순차 진행해도 됨 (slow but simple). 단 QA 스크린샷/통합 PR/한국어 commit/UUID 비공개 등 산출 컨벤션은 반드시 준수.

---

## 7. 양 PC 동기화 (Claude Code 메모리)

```powershell
# 회사 PC 에서 메모리 받기 (git pull 후 1회)
git pull
.\scripts\sync-claude-memory.ps1

# 메모리 수정 후 다른 PC 로 전달
git add .claude/memory/
git commit -m "memory: <변경 내용>"
git push
```

> 사용자 홈 auto-memory 경로 (`C:\Users\<user>\.claude\projects\C--dev-SamhanLogis\memory\`) 는 Claude Code 빌트인이라 변경 불가 — sync 스크립트가 repo → 홈 단방향 복사.
> **코덱스는 본 sync 스크립트 실행 불필요** (Claude Code 진입 시점에만 필요).

---

## 8. 코덱스 세션 종료 / Claude Code 복귀 시

1. 진행 중 작업 정리 후 `docs/handoff/CURRENT-WORK.md` 의 `## 2026-05-15 Codex Update` 블록 갱신 (또는 새 날짜 블록 추가).
2. 모든 commit push.
3. Claude Code 진입 시 본 repo 의 `CLAUDE.md` + `.claude/memory/MEMORY.md` 가 자동 로드되며 `sync-claude-memory.ps1` 실행으로 메모리 동기화.

---

## 9. 빠른 참조

- 핸드오프 노트: [docs/handoff/CURRENT-WORK.md](docs/handoff/CURRENT-WORK.md)
- 결정 누적: [migration/decisions/DECISIONS.md](migration/decisions/DECISIONS.md)
- 메모리 인덱스: [.claude/memory/MEMORY.md](.claude/memory/MEMORY.md)
- 행동 보강 규칙: [.codex/AGENTS.md](.codex/AGENTS.md)
- 회사 PC 셋업: [docs/dev-environment-setup-multi-pc.md](docs/dev-environment-setup-multi-pc.md)
- Claude Code 진입점 (참고): [CLAUDE.md](CLAUDE.md)
