# SamhanLogis (Samhan Public + 아로로지스) — Claude Code 진입점

> 본 파일은 Claude Code 세션 시작 시 자동 로드됩니다 (project memory).
>
> **운영 단위 명칭 (2026-05-14 결정)**:
> - **Samhan Public** (삼한 퍼블릭) = 기존 14 service 묶음의 외부 호칭 ([feedback_samhan_public_name.md](.claude/memory/feedback_samhan_public_name.md))
> - **아로로지스** (arologis) = Samhan Public 마이크로서비스에서 분리된 독립 운영 단위 (Phase 10.5, [project_arologis_independent.md](.claude/memory/project_arologis_independent.md))
> - "SamhanLogis" = 폴더/repo working dir 명일 뿐 (외부 호칭 X)

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

> 사용자 홈 auto-memory 경로 (`C:\Users\<user>\.claude\projects\c--dev-SamhanLogis\memory\`) 는 Claude Code 빌트인이라 변경 불가 — sync 스크립트가 repo → 홈 단방향 복사.

---

## 2. 작업 핸드오프

PC 이동 직전에 반드시 갱신:

- **[docs/handoff/CURRENT-WORK.md](docs/handoff/CURRENT-WORK.md)** — 현재 진행 슬라이스 + 다음 단계 1~3개 + 미해결 결정

새 PC 에서 Claude 첫 세션 시작 시 이 파일만 읽으면 즉시 컨텍스트 회복.

---

## 3. 회사 PC 첫 셋업

- **[docs/dev-environment-setup-multi-pc.md](docs/dev-environment-setup-multi-pc.md)** — 회사 PC 1회 셋업 가이드 (`.env`, Docker, 이카운트 raw 재다운로드 등)

---

## 4. 핵심 규칙 (메모리에 상세)

본 repo 의 모든 작업은 `.claude/memory/` 의 규칙을 따릅니다. 특히:

- **5-team agent 패턴** ([feedback_multi_agent_team_pattern.md](.claude/memory/feedback_multi_agent_team_pattern.md))
- **통합 PR 패턴** ([feedback_integrated_pr_pattern.md](.claude/memory/feedback_integrated_pr_pattern.md))
- **한국어 커밋/PR** ([feedback_korean_commits.md](.claude/memory/feedback_korean_commits.md))
- **UUID 사용자 비공개** ([feedback_uuid_no_user_visibility.md](.claude/memory/feedback_uuid_no_user_visibility.md))
- **BaseEntity 7 audit + Soft Delete** ([project_build_conventions.md](.claude/memory/project_build_conventions.md))
- **아로로지스 독립 운영 단위** ([project_arologis_independent.md](.claude/memory/project_arologis_independent.md)) — 2026-05-14
- **아로로지스 명칭 규칙** ([feedback_arologis_name.md](.claude/memory/feedback_arologis_name.md)) — 한국어 표기 "아로로지스" 정식
- **Samhan Public 명칭 규칙** ([feedback_samhan_public_name.md](.claude/memory/feedback_samhan_public_name.md)) — 외부 호칭 통일
