# S4 전송 및 수신 전환 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 아로로지스 운송사 배차 그룹만 멱등 전송하고 아로로지스에서는 수신 그룹을 읽기 전용으로 표시한다.

**Architecture:** slip-service가 활성 그룹의 업무 식별자와 전표 목록을 전송 DTO로 만들어 arologis-service 내부 수신 계약을 호출한다. 삼한은 전송 상태를 기록하고 아로로지스는 `groupNo` unique 수신 저장소를 통해 중복을 반환한다. 각 데스크톱 화면은 UUID 없이 `groupNo`·`slipNo`를 사용한다.

**Tech Stack:** Spring Boot, JPA, Flyway, React, TanStack Query, Vitest, Playwright mock.

## Global Constraints

- `is_arologis=true` 활성 운송사 그룹만 전송 호출한다.
- `groupNo`는 활성 삼한 그룹의 유일 업무 식별자이며 UUID를 화면·요청에 노출하지 않는다.
- 전송 성공 후 그룹 mutation을 차단하고 실패 상태는 재시도 가능하다.
- 아로로지스 수신 화면은 읽기 전용이며 분류 API를 호출하지 않는다.
- S2 가배차 판정과 S1~S3b 그룹 계약은 변경하지 않는다.
- Docker 재빌드·컨테이너 조작·git add/commit/push는 하지 않는다.

## Tasks

### Task 1: BE 전송/수신 계약

**Files:** 기존 dispatch-group domain/service/controller/repository, 신규 V106 이상 migration 및 transfer DTO/client/controller/service/test.

- [ ] RED: 대상 판정, 실패 상태, 재시도, 아로로지스 수신 중복 반환, 비대상 호출 없음 테스트를 작성한다.
- [ ] RED 실행: 관련 Gradle 테스트를 실행해 계약 부재로 실패함을 기록한다.
- [ ] GREEN: 검증·상태 전이·내부 수신 계약을 최소 구현한다.
- [ ] GREEN 실행: slip/arologis 단위 테스트와 컨텍스트 IT를 실행한다.

### Task 2: 삼한 전송 UI

**Files:** `clients/desktop/src/renderer/api/dispatchGroupApi.ts`, `DispatchGroupPage.tsx`, `mock.ts`, 관련 contract/vitest/Playwright.

- [ ] RED: 확인 단계, 전송/재시도, 비대상 설명, SENT 잠금 사유를 검증한다.
- [ ] GREEN: API mutation과 상태별 UI를 구현하고 mock 응답을 동기화한다.
- [ ] 검증: typecheck, vitest, S4 Playwright mock을 실행한다.

### Task 3: 아로로지스 수신 전용 표시

**Files:** arologis API/controller/page/route/mock/contract/Playwright.

- [ ] RED: 수신 그룹이 표시되고 수정·분류 조작이 없음을 검증한다.
- [ ] GREEN: 조회 전용 화면과 API를 구현한다.
- [ ] 검증: typecheck, vitest, Playwright mock 및 UUID 참조 전수 조사.

### Task 4: legacy 8모드 결정

- [ ] 기존 계약 테스트와 Playwright를 먼저 실행한다.
- [ ] 깨지는 경우 제거하지 않고 근거를 보고한다.
- [ ] 안전한 경우에만 8모드 UI와 고아 계약을 함께 제거하고 회귀 테스트를 실행한다.

### Task 5: 종료 검증 및 보고

- [ ] 새 조합 5개를 각각 검증한다.
- [ ] 새 엔드포인트·상태·mock·계약 테스트를 `rg`로 전수 조사한다.
- [ ] 양 서비스 테스트, 컨텍스트 IT, desktop typecheck/vitest/Playwright를 실행하고 원문을 보고서에 append한다.
