# Samhan Public (삼한 퍼블릭) — Claude Code 진입점

> 본 파일은 Claude Code 세션 시작 시 자동 로드됩니다 (project memory).
>
> **프로젝트 정식 명칭 = Samhan Public** (2026-06-06 확정 — GitHub 레포 `ewoo14/Samhan-Public`, Gradle `samhan-public`).
>
> **운영 단위 명칭 (2026-05-14 결정)**:
> - **Samhan Public** (삼한 퍼블릭) = 14 service 묶음(모노레포 전체)의 정식 명칭
> - **아로로지스** (arologis) = Samhan Public 마이크로서비스에서 분리된 독립 운영 단위 (Phase 10.5, [project_arologis_independent.md](.claude/memory/project_arologis_independent.md))
> - `SamhanLogis` = **`com.samhanair.logis.*` 패키지 네임스페이스**(기술 식별자, rename 비대상). 프로젝트/제품 명칭 아님. ※ 로컬 working dir 폴더명은 `Samhan-Public` 으로 통일 (집 PC 2026-06-06 완료, 회사 PC 변경 예정).

---

## 1. 메모리 시스템

본 repo 의 **30+ 개 Claude 메모리 규칙** 은 `.claude/memory/` 에 git tracked 되어 있어 양 PC (집/회사) 간 자동 동기화됩니다.

| 파일 | 용도 |
|---|---|
| [.claude/memory/MEMORY.md](.claude/memory/MEMORY.md) | 메모리 인덱스 (1줄 hook + 링크) |
| [.claude/memory/feedback_*.md](.claude/memory/) | 사용자 피드백 / 규칙 (PR 회고 기반) |
| [.claude/memory/project_*.md](.claude/memory/) | 프로젝트 컨텍스트 (Phase / 도메인 전략 등) |
| [.claude/memory/user_role.md](.claude/memory/user_role.md) | 사용자 역할 (개발책임자) |

### 양 PC 동기화 절차

```powershell
# 회사 PC 에서 메모리 받기 (git pull 후 1회)
git pull
.\scripts\sync-claude-memory.ps1

# 메모리 수정 후 다른 PC 로 전달
git add .claude/memory/
git commit -m "memory: <변경 내용>"
git push
```

> 사용자 홈 auto-memory 경로 (`C:\Users\<user>\.claude\projects\C--dev-Samhan-Public\memory\`) 는 working dir 경로에서 파생되는 Claude Code 빌트인이라 직접 변경 불가 — sync 스크립트가 repo → 홈 단방향 복사. (폴더명 `Samhan-Public` rename 에 따라 2026-06-06 경로 갱신 — 회사 PC 도 폴더 rename 후 동일 경로 적용됨.)

---

## 2. 작업 핸드오프

PC 이동 직전에 반드시 갱신:

- **[docs/handoff/CURRENT-WORK.md](docs/handoff/CURRENT-WORK.md)** — 현재 진행 슬라이스 + 다음 단계 1~3개 + 미해결 결정

새 PC 에서 Claude 첫 세션 시작 시 이 파일만 읽으면 즉시 컨텍스트 회복.

---

## 3. 회사 PC 첫 셋업

- **[docs/dev-environment-setup-multi-pc.md](docs/dev-environment-setup-multi-pc.md)** — 회사 PC 1회 셋업 가이드 (`.env`, Docker, 이카운트 raw 재다운로드 등)
- **Codex 사용**: `mcp__codex__codex` MCP 도구 (Plugin 폐기, 2026-05-17 사용자 정정). `claude mcp list` 로 `codex: codex mcp-server - ✓ Connected` 확인.

---

## 4. 핵심 규칙 (메모리에 상세)

본 repo 의 모든 작업은 `.claude/memory/` 의 규칙을 따릅니다. 특히:

- 🚨 **표준 워크플로우 (단일 진실원)** ([feedback_canonical_workflow.md](.claude/memory/feedback_canonical_workflow.md)) — **2026-07-15 전면 개편(구 워크플로우 전부 폐기)** · **07-20 기획검수 폐지(적대리뷰와 중복)** · **🚨07-20 2차: 1차 적대검증 리뷰=FABLE5·라운드 fix=SONNET5**(OPUS 4.8 리뷰 역할 전면 대체 — "OPUS 4.8 라운드는 모두 해당"). **OPUS 4.8 기획**(조기 PR 개설+기획 리뷰 게시·spec 점검 흡수) → **CODEX LUNA 5.6 구현**(게시) → **FABLE5 5-agents(또는 그 이상) 적대리뷰+라이브QA + SONNET5 fix + 검증**(게시) → **CODEX SOL 5.6 5-agents 리뷰 + CODEX LUNA 5.6 fix**(게시) → 두 검증 **error/skip/backlog 0수렴까지 반복** → PM 종합(게시)+CI green → PM 머지. **OPUS 4.8 = 기획 + PM 오케스트레이션/commit 대행/머지 전담**(리뷰·라운드 fix 직접 수행 금지). 🚫**엄수·단축금지·순차(병렬금지)**·**모든 단계 리뷰 게시(실행=게시 1:1)**·**라이브QA=스크린샷 다수 필수**·모델 대체 금지(codex 모델 ID 실측: `gpt-5.6-sol`/`gpt-5.6-luna`).
- **한국어 커밋/PR** ([feedback_korean_commits.md](.claude/memory/feedback_korean_commits.md))
- **UUID 사용자 비공개** ([feedback_uuid_no_user_visibility.md](.claude/memory/feedback_uuid_no_user_visibility.md))
- **BaseEntity 7 audit + Soft Delete** ([project_build_conventions.md](.claude/memory/project_build_conventions.md))
- **아로로지스 독립 운영 단위** ([project_arologis_independent.md](.claude/memory/project_arologis_independent.md)) — 2026-05-14
- **아로로지스 명칭 규칙** ([feedback_arologis_name.md](.claude/memory/feedback_arologis_name.md)) — 한국어 표기 "아로로지스" 정식
- **Samhan Public 명칭 규칙** ([feedback_samhan_public_name.md](.claude/memory/feedback_samhan_public_name.md)) — 외부 호칭 통일
- **Codex CLI MCP 서버 사용** ([feedback_codex_plugin_setup.md](.claude/memory/feedback_codex_plugin_setup.md)) — 2026-05-17 사용자 정정. **`mcp__codex__codex` 도구** 사용 (Plugin 폐기). review/fix 모두 `sandbox: "danger-full-access"`(git 금지·PM commit 대행), **model 스테이지별 명시**(2차 적대리뷰=`gpt-5.6-sol`, 구현·라운드 fix=`gpt-5.6-luna`). (기획검수 스테이지는 2026-07-20 폐지) ⚠️ **두 검증 스테이지는 순차**(OPUS 4.8 라운드 완료·게시 후 CODEX SOL 5.6 라운드) — 동시 실행 금지. → [feedback_canonical_workflow.md](.claude/memory/feedback_canonical_workflow.md)
