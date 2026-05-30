# [FEAT] 권한 재편 Phase 2.5 — 주문(Partner-Order) 보류(ON_HOLD) 상태 + 리스트 상태 필터

> 🚧 조기 draft PR ([[early-pr-docker-qa-screenshots]]) · ⚠️ Codex 토큰 소진(6/1 12:00 복구 전) → Claude 에이전트 전면 대체

## 개요
주문에 **보류(ON_HOLD)** 상태 추가(진행중↔보류 전이) + 주문 리스트 상태별(진행중/완료/보류) 정확 조회.

## 업무 규칙 (개발책임자 확정)
- 진행중(DRAFT) ↔ 보류(ON_HOLD) 양방향. 완료(CONFIRMED)는 보류 불가(slip 정합성).
- 리스트 기본 '진행중' + 상태 필터(진행중/완료/보류). 라벨 업무용어 통일(작성중→진행중, 확정→완료).

## 범위
- BE: `ON_HOLD` enum + `markOnHold`/`releaseHold` 도메인 메서드 + `POST /hold`·`/release`(기존 edit 권한) + list 정렬 보정(DRAFT/ON_HOLD createdAt) + confirm 가드
- FE: `PARTNER_ORDER_STATUS_LABEL` ON_HOLD='보류' + 타입 + 보류/해제 버튼 + 필터 옵션
- 마이그레이션 불필요(status CHECK 제약 없음) / status 필터 인프라 기존 존재

## 체크리스트
- [ ] T1 ON_HOLD enum
- [ ] T2 markOnHold/releaseHold 도메인 메서드 + 단위테스트
- [ ] T3 hold/release REST API
- [ ] T4 confirm 가드 (ON_HOLD 허용 또는 영향없음 문서화)
- [ ] T5 list 정렬/기간필터 보정
- [ ] T6 Testcontainers IT
- [ ] T7 FE 라벨/타입/버튼/필터
- [ ] T8 Playwright + 문서 + Docker 실 QA
- [ ] 5팀 리뷰(사이클 N=2) → CI green → 머지

spec: `docs/superpowers/specs/2026-05-31-partner-order-hold-status-filter-design.md`
plan: `docs/superpowers/plans/2026-05-31-partner-order-hold-status-filter.md`

🤖 Generated with [Claude Code](https://claude.com/claude-code)
