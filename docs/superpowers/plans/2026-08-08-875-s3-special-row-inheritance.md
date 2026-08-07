# #875 S3 특수행 계승 구현 Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 웹 종합견적서의 카탈로그 `운임`·`절삭`을 금액 우선 특수행으로 계승하고, 0원 행 보존과 자동 절삭행 출처 분리를 보장한다.

**Architecture:** `clients/web/estimate-app/views/index.ejs`의 기존 Map/state 흐름을 유지하면서 특수행 row metadata에 `source`와 synthetic identity를 실어 나른다. q=0은 화면 state에만 남기고 계산·저장·출력 payload에서 제외하며, 자동 절삭행은 카탈로그 행과 별도 source로 생성한다.

**Tech Stack:** EJS embedded JavaScript, Vitest/Playwright 기존 웹 견적 테스트, PowerShell 검증 명령

## Global Constraints

- 화면 라벨은 `운임`·`절삭` 그대로 유지한다.
- UUID를 화면에 노출하지 않는다.
- DB 직접 변경, 스프레드시트/GAS 쓰기, 공유 Docker 재기동, commit/push를 하지 않는다.
- 기존 테스트는 새 동작에 맞춰 수정하지 않고 전부 실행한다.

---

### Task 1: 기존 테스트 기준선과 RED 회귀 테스트

**Files:**
- Create: `clients/web/estimate-app/src/__tests__/special-row-inheritance.test.js` (기존 웹 테스트 구조 확인 후 실제 test root에 맞춤)
- Test: `clients/web/estimate-app`의 기존 견적 테스트 전체

- [ ] 기존 테스트 파일과 package script를 확인한다.
- [ ] 변경 대상 파일의 기존 테스트를 실행하고 원문 결과를 보고서에 기록한다.
- [ ] 카탈로그 특수행 q=1, q=0, 사용자/자동 `절삭` 분리, q=0 payload 부재를 실제 payload 생성 결과로 검증하는 RED 테스트를 작성한다.
- [ ] 테스트만 실행해 기능 부재로 실패하는지 확인한다.

### Task 2: 특수행 source/identity 계약과 입력 계승

**Files:**
- Modify: `clients/web/estimate-app/views/index.ejs:2957`, 특수행 렌더 호출부 `:5761~7491`

- [ ] `CATALOG_SPECIAL` metadata를 catalog row에서 초기화한다.
- [ ] 전용 금액 입력에서 0은 `price=0`, `qty=0`으로 만들고 row를 제거하지 않는다.
- [ ] 비0은 q=1로 만들고 `절삭`은 음수로 정규화한다.
- [ ] source가 입력·재렌더·sync 과정에서 보존되는지 RED 테스트를 GREEN으로 만든다.

### Task 3: 계산·cutoff·payload 분리

**Files:**
- Modify: `clients/web/estimate-app/views/index.ejs:9590`, `:9331~9460`, `:11026~11110`, `:16617~16655`

- [ ] 합계 계산은 q=0 특수행을 기여시키지 않고 q=1 특수행을 `price × 1`로 반영한다.
- [ ] 자동 절삭행에 `source: AUTO_CUTOFF`와 별도 identity를 부여한다.
- [ ] payload를 실제 생성해 q=0 catalog special row가 배열에 없고, q=1 catalog special row와 auto cutoff row가 각각 존재하는지 검증한다.
- [ ] 이름·모델만으로 두 절삭행을 merge/dedupe하지 않도록 관련 키를 점검하고 source-aware identity를 사용한다.

### Task 4: 전체 회귀 검증 및 보고서 마감

**Files:**
- Modify: `docs/dev-reports/2026-08-08-875-s3-special-row-inheritance.md`

- [ ] 변경 파일 기존 테스트 전부를 다시 실행한다.
- [ ] RED-A/B/C와 관련 Playwright/mock gate를 실행 가능한 범위에서 실행한다.
- [ ] `git diff --stat`의 삭제 줄 수, 신규 파일 목록, 테스트 원문 결과, 미실행 검증을 보고서에 기록한다.
- [ ] git status로 commit/push가 없음을 확인한다.

