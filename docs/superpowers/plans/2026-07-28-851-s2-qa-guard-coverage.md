# #851 S2 QA Guard Coverage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 모든 QA 캡처 목적지 resolver와 `qa/playwright` 캡처가 물리적으로 `docs/qa` 아래를 우회·덮어쓰지 못하게 하고, 가드가 CI에서 실패 시 반드시 red가 되게 한다.

**Architecture:** 기존 resolver 계약은 유지하되 각 언어 구현에 동일한 물리 경로 판정(존재하는 부모의 realpath 해석, Windows 확장 길이 접두사 제거·대소문자 정규화, 상대경로 정규화)을 적용한다. 회귀 테스트는 현재 파일 목록을 하드코딩하지 않고 resolver 선언/QA 직접 쓰기 표면을 저장소에서 발견하며, 임시 디렉터리의 junction만 사용해 RED/GREEN과 정상 기본·승격 경로를 함께 검증한다. `qa/playwright`의 직접 경로 캡처는 공용 `captureForQa`를 경유한다.

**Tech Stack:** Node.js `node:test`, CommonJS 테스트 러너, TypeScript transpile 검증, Node ESM/CJS, Python, Bash, PowerShell, Playwright, GitHub Actions.

## Global Constraints

- 기획서 불변식 I-1~I-5를 모두 만족한다.
- RED-first: 무가드 resolver와 물리 표기 우회가 실제로 실패한 원문을 먼저 기록한다.
- 테스트·캡처 실행은 `os.tmpdir()` 출력만 사용하고 `docs/qa/**` 산출물을 변경하지 않는다.
- `qa-e2e.yml:56`의 `|| true`, typecheck 범위 편입, `assert-playwright-ran.mjs` 하한, mock parity는 제외하고 보고서에만 기록한다.
- git 상태를 바꾸는 명령(커밋·push·branch·stash·checkout)은 실행하지 않는다.

---

### Task 1: 실제 쓰기 도달성 RED inventory

**Files:**
- Modify: `clients/desktop/scripts/qa-output-path-guard.test.cjs`
- Test: `clients/desktop/scripts/qa-output-path-guard.test.cjs`

**Interfaces:**
- Produces: 동적으로 발견한 QA resolver 목록과 `qa/playwright` 직접 쓰기 경로 수를 출력·검증한다.
- Produces: 모든 resolver가 동일한 물리 경로 차단 계약을 지켜야 한다는 회귀 테스트.

- [ ] **Step 1: Add the failing test before production changes**
  - 루트 `scripts/lib/qa-shots-dir.mjs`와 `qa/playwright/utils/screenshot.ts`를 현재 가드 대상에 포함한다.
  - 임시 junction이 가리키는 `docs/qa` 물리 위치에 `QA_SHOTS_DIR`를 지정하고 `QA_ALLOW_OVERWRITE` 없이 각 resolver가 throw해야 한다고 단언한다.
  - `path: 'docs/qa/...png'` 직접 쓰기와 resolver 기반 쓰기를 구분해 파일·경로 수를 출력한다.

- [ ] **Step 2: Run the focused RED command**
  - Run from `clients/desktop`:
    ```powershell
    git status --porcelain
    git diff -- docs/qa
    node --test scripts/qa-output-path-guard.test.cjs
    git status --porcelain
    git diff -- docs/qa
    ```
  - Expected: the new root `.mjs` or `qa/playwright` resolver physical-alias assertion fails before any production resolver is changed; both docs/qa checks remain empty.

### Task 2: Canonical physical guard behavior

**Files:**
- Modify: `scripts/lib/qa-shots-dir.mjs`
- Modify: `qa/playwright/utils/screenshot.ts`
- Modify: `infrastructure/scripts/operational-validation.ps1`
- Modify: `scripts/lib/qa-shots-dir.sh`
- Modify: `scripts/lib/qa_shots_dir.py`
- Modify: `clients/desktop/src/main/capture.ts` only if the dynamic inventory confirms it is an active resolver copy
- Test: `clients/desktop/scripts/qa-output-path-guard.test.cjs`

**Interfaces:**
- Consumes: `QA_SHOTS_DIR`, `QA_ALLOW_OVERWRITE`, committed destination.
- Produces: the same default `<committedDir>/_local`, guarded override, and explicit overwrite opt-in in every supported resolver.

- [ ] **Step 1: Implement the smallest physical-path guard for each language**
  - Preserve existing function names and return paths.
  - Resolve missing descendants through the nearest existing parent with physical realpath.
  - Normalize `\\?\\` Windows prefixes, trailing separators, relative paths, and Windows case before containment testing.
  - Throw before directory creation when an override is physically under `docs/qa` without explicit opt-in.
  - Keep `QA_ALLOW_OVERWRITE=1|true|yes` as the only explicit promotion escape hatch.

- [ ] **Step 2: Run the focused GREEN command**
  - Run the same command from Task 1.
  - Expected: all resolver alias cases pass; default `_local`, promotion, junction, relative, extended-prefix, and case cases are green.

### Task 3: Remove qa/playwright direct committed writes

**Files:**
- Modify: `qa/playwright/tests/arologis/sp-10-2-insung-quick-vendor.spec.ts`
- Modify: `qa/playwright/utils/screenshot.ts`
- Test: `qa/playwright/typecheck` and focused guard test.

**Interfaces:**
- Consumes: Playwright `page`, `testInfo`, and slug.
- Produces: all 14 existing SP-10-2 screenshots through `captureForQa(page, testInfo, slug)`, which resolves to a temporary `_local` destination by default.

- [ ] **Step 1: Replace direct screenshot paths**
  - Import `captureForQa`.
  - Add `testInfo` to each test using a screenshot.
  - Replace each hard-coded `docs/qa/...png` path with its existing stable slug, preserving screenshot names in the slug.
- [ ] **Step 2: Run focused static and type checks**
  - Confirm no executable `page.screenshot` in `qa/playwright` has a direct `docs/qa` path.
  - Run `npm run typecheck` in `qa/playwright`.

### Task 4: Dynamic coverage and CI gate

**Files:**
- Modify: `clients/desktop/scripts/qa-output-path-guard.test.cjs`
- Modify: `.github/workflows/qa-e2e.yml`
- Modify: `clients/desktop/README.md`
- Modify: related QA README(s) discovered during implementation.

**Interfaces:**
- Produces: a discovery-based guard that fails when a new resolver or direct `docs/qa` screenshot sink appears without the contract.
- Produces: a non-optional GitHub Actions gate before Playwright execution.
- Produces: README documentation naming both root `qa-shots-dir.cjs` and `qa-shots-dir.mjs`.

- [ ] **Step 1: Make the inventory discovery-based**
  - Discover resolver implementations by source contract markers and scan `qa/playwright` for screenshot write sinks.
  - Do not hard-code the current count as the source of truth; assert the measured current result separately for the report.
  - Keep language-specific execution/adapters in the guard test so a new matching copy is not silently ignored.

- [ ] **Step 2: Register the gate without tolerated failure**
  - Add or update a workflow step that runs `node --test clients/desktop/scripts/qa-output-path-guard.test.cjs`.
  - Do not add `continue-on-error` or an `|| true` to this guard.

- [ ] **Step 3: Synchronize README**
  - Correct the root shared-copy list to include both `.cjs` and `.mjs`.
  - Document that default and test outputs are `_local`, while promotion requires `QA_ALLOW_OVERWRITE=1`.

### Task 5: Evidence report and full verification

**Files:**
- Create: `docs/dev-reports/2026-07-28-851-s2-qa-guard-coverage.md`

- [ ] **Step 1: Record measured reachability**
  - Include the exact command and raw output for 13 reference files, 11 writer files, 14 literal paths, 10 resolver roots, and the resulting 24 path expressions.
  - Explain why read-only `nine-slice` and `signature-c` references are excluded.

- [ ] **Step 2: Record RED/GREEN and clean-tree evidence**
  - Include only commands actually executed and their raw output.
  - For every run, include pre/post `git status --porcelain` and `git diff -- docs/qa` empty output.
  - Record normal first-capture/default and promotion paths.

- [ ] **Step 3: Run the requested verification commands**
  - From `clients/desktop`:
    ```powershell
    node --test scripts/qa-output-path-guard.test.cjs
    npm test
    npm run typecheck
    ```
  - Run the corresponding `qa/playwright` typecheck and any focused tests required by the changed code.
  - Re-run clean-tree checks after the final execution.

- [ ] **Step 4: Report excluded findings**
  - Record, without modifying, `qa-e2e.yml:56` `|| true`, typecheck scope, `assert-playwright-ran.mjs` lower bound, and mock parity drift as future work.

