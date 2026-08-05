# R24 액션 집합 수정 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `SlipDetailPage`가 도메인 허용 액션을 전부 노출하고 `/complete`의 재고 반영 결과를 화면 라벨에 표시하게 한다.

**Architecture:** 기존 상태→액션 함수와 공용 액션 라벨을 단일 진실원으로 유지한다. 백엔드 전이와 재고 호출은 수정하지 않고 화면 계약 테스트만 보강한다.

**Tech Stack:** React, TypeScript, Vitest, Spring domain tests as existing reference.

## Global Constraints

- INSPECTING `reject`를 추가하고 기존 `inspect` 매핑은 유지한다.
- PROCESSING `/complete` 호출 및 재고 반영 시점을 변경하지 않는다.
- INBOUND `inbound.inspection` 가드, 미추적 QA 파일, Docker, commit/push는 범위 밖이다.

### Task 1: 화면 액션 계약

**Files:**
- Modify: `clients/desktop/src/renderer/routes/SlipDetailPage.lifecycle-contract.test.ts`
- Modify: `clients/desktop/src/renderer/routes/SlipDetailPage.tsx`
- Modify: `docs/dev-reports/2026-08-04-874-r24-action-set-fix.md`

- [ ] INSPECTING `reject`와 PROCESSING의 업무 라벨을 검증하는 실패 테스트를 추가한다.
- [ ] 테스트가 현재 구현에서 실패하는지 확인한다.
- [ ] `actionsForStatus`와 공용 라벨을 최소 수정한다.
- [ ] 계약 테스트와 타입 검사를 실행한다.
- [ ] 상태별 전수 대조표와 RED/GREEN 원문을 보고서에 append한다.
