# Codex 부재 시 Sonnet 5 서브에이전트 대체 모드

Codex 사용 불가(사용량 한도 등) + 토큰 절약 필요 시, 표준 캐논([[feedback_canonical_workflow]])의 "Codex 구현/리뷰" 역할을 **Sonnet 5 서브에이전트**로 대체하고 Opus 는 PM + STEP4 만 수행한다. (2026-07-08 개발책임자 지시 — Codex Jul11 한도.)

## 역할 분담
- **Sonnet 5 서브에이전트**(`model: sonnet` · 최대추론, Agent 도구는 effort 노브 없어 세션 effort 상속): 정찰 · **구현(코드 작성)** · 5-agent 리뷰(FE/BE/Design/DevOps/QA 전 차원) · 라이브 QA · 검증.
- **Opus (=PM)**: 기획·판단 · **STEP4 독립 적대검증**(= Codex 라운드 + 개발책임자 승인 대체) · **Sonnet 산출물 점검**(중형모델이라 필수) · commit 대행 · PR/이슈 관리 · 머지.

## 규율 (대체모드에서도 캐논 엄수)
- 구현 코드는 Sonnet 만 작성([[feedback_pm_no_direct_implementation]]). Opus 는 diff STEP4 검토 + genuine 테스트 재실행(캐시 false-green 방지 [[feedback_gradle_test_cache_false_green]])로 점검 후 commit 대행.
- 매 라운드: Sonnet 5-agent 리뷰/구현 → Opus 점검·전지적 disposition → genuine 건만 Sonnet fix(그 라운드 진행모델) → **Opus STEP4 0수렴**. 리뷰=실 라이브 QA 동반·단축금지([[feedback_review_5agent_no_shortcut_strict]]).
- **STEP4·검증은 변경모듈 전체 스위트 실행**([[feedback_changed_module_full_test_before_push]]) — slice-IT 만 돌리면 P0 누락. (2026-07-08 #774: PageCode enum P0·FE permissionsApi parity 를 전체 auth/desktop 스위트 미실행으로 놓쳐 CI 가 포착.)
- Codex 복구(Jul11) 후 표준 Opus + Codex 듀얼리뷰로 복귀.

## 실증 (2026-07-08 · #729·#771·#17 S4a 3-PR 캐논 완주)
Sonnet 5-agent 리뷰가 Opus STEP4 가 놓친 실결함 3건(accounting `MultipleBagFetchException`×5 · 역분개 backfill orphan 회귀 · PageCode enum 미등록 P0)을 포착 — **대체모드에서도 5-agent 리뷰 규율 유지가 결함 방지의 핵심**.
