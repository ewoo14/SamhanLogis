# #845 DS-1 문서 양식 렌더러 Foundation Implementation Plan

> 구현 기준: `docs/specs/845-ds1-form-renderer-foundation-spec.md` v4. 이 작업은 파일만 수정하며 git add/commit/push/branch 명령을 사용하지 않는다.

**Goal:** 결재 문서의 기존 DOM 출력을 독립 frozen 오라클과 골든 HTML로 고정한 뒤, 스키마 기반 `DocumentRenderer` 경로로 전환한다.

**Architecture:** 런타임 parser가 밴드/요소 불변식을 검증하고, 기본 템플릿 resolver가 `GROUPWARE_DEFAULT` fallback을 제공한다. `buildApprovalRenderModel`은 기존 `approvalDoc.ts` 헬퍼만 재사용해 UUID 없는 슬롯 모델을 만들고, compiler가 `PrintLayout`의 기존 shell과 추출한 본문 컴포넌트를 조립한다. frozen 파일은 현재 JSX를 독립 복사해 golden 생성/비교 오라클로만 사용한다.

**Tech Stack:** React 18, TypeScript 5.6, React Router, TanStack Query, Vitest, Testing Library, Playwright.

## Global Constraints

- `global.css`, `PrintLayout.tsx`, `@page`, 기존 CSS는 변경하지 않는다.
- TITLE/APPROVAL_GRID/CLOSING은 정확히 1개, META_ROWS와 BODY 요소는 명시된 최대 개수, 허용 band와 unique key를 parser에서 검증한다.
- `ApprovalRenderModel`에는 UUID/내부 ID를 넣지 않고 기존 `approvalDoc.ts` 변환/정렬/포맷 헬퍼를 재사용한다.
- frozen JSX는 test/golden 생성 전용이며 production model/body 컴포넌트와 공유하지 않는다.
- 일반 vitest 실행은 golden을 절대 갱신하지 않으며, 명시적 PowerShell 생성 스크립트만 갱신한다.
- 한국어 Javadoc/주석/사용자 문자열을 사용하고 Playwright 스위트는 생성만 하며 실행하지 않는다.

## Task 1: 스키마 경계와 기본 템플릿

**Files:** `clients/desktop/src/renderer/print/templateSchema.ts`, `approvalDefaultTemplate.ts`, 관련 Vitest.

- discriminated union과 envelope 타입을 정의한다.
- schemaVersion, revision, paper, band/element key 중복, 허용 band, 필수/최대 개수를 runtime 검증한다.
- version 1 upcast와 exhaustive `paperToPrintLayout`을 구현한다.
- 기본 template과 `GROUPWARE_${code}` resolver, null/error/invalid fallback을 정의한다.
- F1/F8 및 invalid parser truth-table을 먼저 실패시키고 구현 후 통과시킨다.

## Task 2: 모델·본문 projection·2단계 compiler

**Files:** `approvalRenderModel.ts`, `LegacyApprovalDocBody.tsx`, `DocumentRenderer.tsx` 및 관련 Vitest.

- 공통 입력 번들, UUID-stripped slot model, helper 기반 projection을 구현한다.
- 본문 3개 section을 현재 인라인 style 그대로 추출하고 외곽 div를 한 번만 렌더한다.
- template element 순서로 body section을 조립하고 header/approval/closing slot을 `PrintLayout` props 동형으로 compile한다.
- `DocumentRenderer`는 spec의 명시 JSX와 별도 `backTo` prop을 사용한다.

## Task 3: 독립 frozen 오라클과 golden 회귀

**Files:** `print/__frozen__/FrozenApprovalDocLegacy.tsx`, fixture/golden files, golden Vitest, 명시적 golden 생성 PowerShell.

- 기존 ApprovalDocView 본문+PrintLayout 조합을 fetch/router 없는 입력 컴포넌트로 verbatim 복사한다.
- F1~F14 fixture를 만들고 frozen output을 committed HTML로 생성한다.
- 매 fixture에서 `new === frozen-golden`과 UUID 부재를 검증한다.
- golden update는 환경 가드가 있는 명시적 script로만 가능하게 한다.

## Task 4: ApprovalDocView 전환과 상태 회귀

**Files:** `ApprovalDocView.tsx`, jsdom fetch-state/renderer tests.

- approval/attachment/template 3-fetch를 유지한다.
- template 오류는 빈 필드 의미를 유지하고 approval/attachment 오류는 error banner에서 중단한다.
- id 미존재와 loading/done 상태를 MemoryRouter, QueryClient, 미완료 promise/prefilled cache로 검증한다.

## Task 5: Playwright sanity 스위트 생성

**Files:** `clients/desktop/playwright/ac-845-ds1-form-renderer/*.spec.ts`.

- 고정 viewport/device scale/font wait/animation off 조건으로 screen과 `emulateMedia('print')` 캡처를 정의한다.
- 대표 fixture의 DOM/UUID/인쇄 sanity만 정의하고 실행은 PM이 담당한다.

## Verification

- `npm --prefix clients/desktop run typecheck`
- 필요 시 `npm --prefix clients/desktop run build:print-renderer`
- `npm --prefix clients/desktop run test`
- Playwright는 실행하지 않는다.
