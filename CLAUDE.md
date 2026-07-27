# Samhan Public (삼한 퍼블릭) — Claude Code 진입점

> 본 파일은 Claude Code 세션 시작 시 자동 로드됩니다 (project memory).
>
> **프로젝트 정식 명칭 = Samhan Public** (2026-06-06 확정 — GitHub 레포 `ewoo14/Samhan-Public`, Gradle `samhan-public`).
>
> **운영 단위 명칭 (2026-05-14 결정)**:
> - **Samhan Public** (삼한 퍼블릭) = 14 service 묶음(모노레포 전체)의 정식 명칭
> - **아로로지스** (arologis) = Samhan Public 마이크로서비스에서 분리된 독립 운영 단위 (Phase 10.5, [project_arologis_independent.md](.claude/memory/project_arologis_independent.md))
> - `SamhanLogis` = **`com.samhanair.logis.*` 패키지 네임스페이스**(기술 식별자, rename 비대상). 프로젝트/제품 명칭 아님. ※ 로컬 working dir 폴더명은 `Samhan-Public` 으로 통일 (집 PC 2026-06-06 완료, 회사 PC 2026-07-22 완료 — `C:\dev` → `D:\dev\Samhan-Public` 이동).

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

> 사용자 홈 auto-memory 경로 (회사 PC 현재: `C:\Users\<user>\.claude\projects\D--dev-Samhan-Public\memory\`) 는 working dir 경로에서 파생되는 Claude Code 빌트인이라 직접 변경 불가 — sync 스크립트가 repo → 홈 단방향 복사. **2026-07-22: 회사 PC 프로젝트를 `C:\dev` → `D:\dev` 로 이동** 하며 파생 폴더명이 `C--dev-…` → `D--dev-…` 로 바뀜. 이에 따라 sync 스크립트는 경로를 하드코딩하지 않고 **working dir 에서 슬러그를 자동 도출**하도록 개편(양 PC·드라이브 무관 동작). 집 PC 가 `C:\dev` 를 유지하면 자동으로 `C--dev-…` 로 미러됨(스크립트 재수정 불필요). (이력: 폴더명 `Samhan-Public` rename 2026-06-06.)

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

- 🚨 **표준 워크플로우 (단일 진실원)** ([feedback_canonical_workflow.md](.claude/memory/feedback_canonical_workflow.md)) — **2026-07-15 전면 개편(구 워크플로우 전부 폐기)** · **07-20 기획검수 폐지(적대리뷰와 중복)** · **🚨07-21 현행 정본: 1차 적대검증 리뷰=OPUS 4.8 재전환(FABLE5 토큰 과다)·라운드 fix=SONNET5 유지**. **🆕2026-07-27 개발책임자 승인 — 1차 리뷰 각도를 모델로 분리**: **발견 각도(기준 자체를 만드는 일 — 설계 전제·경로 개방성·표면 충돌)=OPUS 유지** / **대조 각도(기준이 주어진 일 — 문서 수치 대조·인용 원문 재현 대조·계열 sweep 카운팅·무훼손 수집 비교·트리거/YAML 정합)=SONNET5**. 병목은 토큰이 아니라 **라운드 개수**라 발견을 낮추면 되레 비싸고, 대조는 정답이 정해져 있어 등급 차가 작다. **애매하면 발견 쪽(OPUS)**. 🚫도달성 판정·종합·라이브QA 는 여전히 루트(PM) 몫. **OPUS 4.8 기획**(조기 PR 개설+기획 리뷰 게시·spec 점검 흡수) → **CODEX LUNA 5.6 구현**(게시) → **OPUS 4.8 5-agents(또는 그 이상) 적대리뷰+라이브QA + SONNET5 fix + 검증**(게시) → **CODEX SOL 5.6 5-agents 리뷰 + CODEX LUNA 5.6 fix**(게시) → 두 검증 **도달 가능한 결함 0 수렴까지 반복**(검증 품질은 이월) → PM 종합(게시)+CI green → PM 머지. **🚨🚨2026-07-22 현행 정본 — 머지 게이트 = 도달성 축**: **① 실 사용자 경로로 재현 가능한 결함 0(심각도 무관) + ② CI green(exact SHA) + ③ 라이브QA(실서버 실제 실행)**. ⚠️**07-21 "전 심각도(BLOCKING/HIGH/MED/LOW) 0" 은 폐기** — 종료 조건이 아님이 실측됐다(밤새 3트랙 머지 0, MED 만 7 근처 평평, 그 과반이 "fix 가 추가한 방어선이 가짜" 류 **검증 품질**). 🔑비종료 이유=**fix 하면 검증 장치가 늘고 그게 다음 라운드 감사 대상**(fix-유발률 76~100%, RED-first 도 못 막음). **검증 품질(테스트 약함·문서 과장·가드 구멍·mock 미비·직접SQL전용)=게이트 아님**. 🚫MED/LOW 무시 아님 — **도달 가능한 MED/LOW 는 여전히 게이트**, 축이 심각도→도달성으로 바뀐 것. ⚠️**07-23 개편으로 "도달가능/검증품질 분류 의무"·"슬라이스당 1이슈 이월" 은 폐기** — 적대리뷰는 **오직 도달성 단일 질문**만 하고 검증품질은 **찾지도 보고하지도 않는다**(기존 이월 이슈는 백로그 chore 로만 소진). 🆕**2026-07-27 유일 예외 = 증거 무결성** — 보고서·코멘트가 "원문/실측" 으로 제시한 출력이 **재현되지 않거나** 수치가 실제와 다르면 **도달성 0 이어도 항상 보고하고 그 라운드에서 정정**한다(대조 각도의 기본 임무). 정정이 검증 장치를 늘리지 않아 종료 조건을 흐리지 않는다. 라운드 무한증식 문제는 **fix 품질**로도 해결한다: 🚨**RED-first fix**(결함 재현 실패 테스트를 먼저 쓰고 RED 원문 제출 후 고침 — 뮤테이션이 fix 후면 "구현자가 고른 fix"만 검증하고 결함 전체 표면은 미검증) · 🚨**라이브QA=실서버 실제 실행**(`--list`/typecheck 류 정적 게이트로 대체 금지 — 사용자 버그는 실행해야 나옴) · 🚨**PM 은 fix 지시에서 불변식만 말하고 구현 수단을 지시하지 않는다**(수단 지시 시 그 결함까지 PM 이 떠안음 — 실측 3건). **OPUS 4.8 = 기획 + 1차 적대검증 리뷰 + PM 오케스트레이션/commit 대행/머지**(라운드 fix 직접 수행만 금지 — 리뷰어/구현자 분리 유지). **FABLE5 는 파이프라인에서 제외**(07-16 폐지 → 07-20 복원 → 07-21 재폐지). 🚫**엄수·단축금지·순차(병렬금지)**·**모든 단계 리뷰 게시(실행=게시 1:1)**·**라이브QA=스크린샷 다수 필수**·모델 대체 금지(codex 모델 ID 실측: `gpt-5.6-sol`/`gpt-5.6-luna`).
- **한국어 커밋/PR** ([feedback_korean_commits.md](.claude/memory/feedback_korean_commits.md))
- **UUID 사용자 비공개** ([feedback_uuid_no_user_visibility.md](.claude/memory/feedback_uuid_no_user_visibility.md))
- **BaseEntity 7 audit + Soft Delete** ([project_build_conventions.md](.claude/memory/project_build_conventions.md))
- **아로로지스 독립 운영 단위** ([project_arologis_independent.md](.claude/memory/project_arologis_independent.md)) — 2026-05-14
- **아로로지스 명칭 규칙** ([feedback_arologis_name.md](.claude/memory/feedback_arologis_name.md)) — 한국어 표기 "아로로지스" 정식
- **Samhan Public 명칭 규칙** ([feedback_samhan_public_name.md](.claude/memory/feedback_samhan_public_name.md)) — 외부 호칭 통일
- **Codex CLI MCP 서버 사용** ([feedback_codex_plugin_setup.md](.claude/memory/feedback_codex_plugin_setup.md)) — 2026-05-17 사용자 정정. **`mcp__codex__codex` 도구** 사용 (Plugin 폐기). review/fix 모두 `sandbox: "danger-full-access"`(git 금지·PM commit 대행), **model 스테이지별 명시**(2차 적대리뷰=`gpt-5.6-sol`, 구현·라운드 fix=`gpt-5.6-luna`). (기획검수 스테이지는 2026-07-20 폐지) ⚠️ **두 검증 스테이지는 순차**(OPUS 4.8 라운드 완료·게시 후 CODEX SOL 5.6 라운드) — 동시 실행 금지. → [feedback_canonical_workflow.md](.claude/memory/feedback_canonical_workflow.md)
