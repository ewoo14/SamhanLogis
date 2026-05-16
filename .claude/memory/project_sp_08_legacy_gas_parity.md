---
name: sp-08-legacy-gas-db-api-parity
description: SP-08 슬라이스 (2026-05-16~) — legacy GAS 전메뉴 동등 기능을 Samhan Public DB/API 만으로 잠그고, 다운로드 raw 는 read-only snapshot 으로 보존. Notion runtime 의존 zero 회귀 + 자격 비공개 가드.
metadata:
  type: project
---

**브랜치**: `codex/sp-08-legacy-gas-db-api-parity`
**기획서**: `docs/planning/2026-05-16_legacy-gas-db-api-parity.md`
**dev-report (누적)**: `docs/dev-reports/sp-08-legacy-gas-db-api-parity.md`
**Playwright 정적 계약**: `clients/desktop/playwright/sp-08-legacy-gas-db-api-parity/sp-08-legacy-gas-db-api-parity.spec.ts`

**Why:** 2026-05-16 개발책임자 명시 — legacy GAS UI/플로우는 유지하되 모든 조회/수정/삭제를 우리 DB CRUD 로 잠그고, 견적관리/공급사/주문/매입/매출/사입 등 전메뉴에서 GAS parity 가 누락 없이 회귀로 묶이도록. raw (legacy GAS / Notion CSV / Sheets / 이카운트) 는 이관 시점 snapshot 으로만 유지하고 우리 DB/API 가 source-of-truth.

**How to apply:**

1. **이중 source 규칙** — raw 와 DB 충돌 시 항상 DB 가 정답. raw 는 audit / 재이관 reference 전용. 재이관은 import/sync job 한 곳에서만 (멱등 + Soft Delete).
2. **메뉴별 CRUD parity 매트릭스** (기획서 §4.1) — 견적/공급사/주문/매입/매출/사입 + 전메뉴 보조 메뉴 각각 GAS 동작 ↔ endpoint 1:1 매핑. 누락 시 SP-08 sub-task 로 즉시 분해.
3. **Sub-task 단위 진행** — 후속 작업은 모두 본 슬라이스 안에서 (`SP-08-1` 기획 → `SP-08-2` 견적 → ... → `SP-08-9` 통합 PR). 5-team 리뷰 종합 후 통합 PR 1 회.
4. **Notion runtime 의존 zero** — SP-06 에서 active app endpoint 제거. SP-08 에서 grep + Playwright contract 로 재유입 zero 가드 확장.
5. **자격 비공개 가드** — Notion API key / Notion DB internal id (UUID) / Google Sheet id / SA private key / Aligo key 를 plan / dev-report / Playwright fixture / QA 캡처 / 운영 검증 문서에 평문 미기록. 운영 PC `%USERPROFILE%\.samhan\*` / `.env` 만. CI grep 가드 추가.
6. **non-goals** — UI 리디자인 / GAS ↔ DB 실시간 동기 / Notion runtime 재도입 / 신규 도메인 / 인쇄 양식 재설계 / 모바일/아로로지스 신규 화면 / Phase 11 AWS 는 본 슬라이스 범위 밖.

**직전 슬라이스 baseline:**
- SP-04 (전메뉴 + GAS 27건 + Notion 4 CSV audit)
- SP-05 (판매/구매 CRUD 표면 + UUID 비공개)
- SP-06 (Notion 4 CSV DB 이관 + Gateway no-strip + active Notion endpoint 제거)
- SP-07 (Google Sheets `종합견적서` source 계약 + bootstrap 보안 보정 + product DB sync)

**참조 메모리:** [[feedback_samhan_public_name]] / [[feedback_uuid_no_user_visibility]] / [[project_build_conventions]] / [[feedback_integrated_pr_pattern]] / [[feedback_multi_agent_team_pattern]] / [[feedback_pm_integration_build_check]] / [[feedback_function_documentation]] / [[feedback_korean_commits]] / [[feedback_pr_qa_screenshots]] / [[feedback_continuous_docs_sync]] / [[feedback_user_merge_authority]] / [[feedback_gitguardian_false_positive]]
