# 3-A2 설계 — desktop Playwright CI hard gate

- **작성일**: 2026-06-02
- **슬라이스**: item 3-A2 (CURRENT-WORK.md 후속 큐)
- **상태**: 설계 승인 (개발책임자, 2026-06-02 "반영 후 구현")
- **유형**: CI/인프라 (BE/앱코드 무변경)
- **관련 메모리**: [[feedback_ci_test_filter_false_green]], [[feedback_open_pr_early]], [[feedback_no_backlog_strict]], [[project_local_stack_qa_gotchas]]

---

## 1. 배경 — false-green

`clients/desktop/playwright/**`의 77개 스펙은 **어떤 CI 잡에서도 실행/타입체크되지 않는다**.
- `qa-e2e.yml`의 `playwright` 잡은 별도 프로젝트 `qa/playwright`만 실행(backend 미가동 → `it.skip` + `|| true` 비차단).
- `ci.yml`의 `frontend-desktop`은 typecheck/lint/build만, Playwright 실행 없음.
- desktop `tsconfig.*`는 `playwright/**` 미포함 → 스펙 컴파일 오류도 green.

결과: 3-D에서 추가한 `partner-order-list-badge-refresh` 등 회귀 가드가 PR green 이어도 실제로는 0회 실행. [[feedback_ci_test_filter_false_green]]가 경고한 부류.

## 2. 목표 & 범위

### 목표
desktop Playwright의 **mock 회귀 스펙**을 CI에서 **실패 시 CI fail(hard gate)** 로 실행. 신규 mock 스펙이 **자동 커버**되도록 opt-out 컨벤션 도입.

### 범위 밖
- `qa/playwright`(별도 프로젝트) 변경.
- 실서버/실QA 캡처 스펙의 CI 실행(실 게이트웨이+JWT 필요 — 로컬/수동 전용 유지).
- Detox(모바일) 변경.

### 확정 결정
- **D-3A2-01**: 게이트 범위 = **mock 회귀 스펙**(VITE_MOCK_MODE headless 실행 가능분)만. 실QA/manual 캡처 스펙 제외.
- **D-3A2-02**: 큐레이션 = **opt-out 컨벤션**(testIgnore 제외 외 전부 실행). allowlist 금지([[feedback_ci_test_filter_false_green]] 철학). 신규 mock 스펙 자동 게이트.
- **D-3A2-03**: 트리아지에서 mock 불가/노후 스펙은 **투명 격리 허용** — 개별 `test.skip`/이동/개명 + **사유주석 + dev-report 추적목록**. 은폐(silent) 금지.

## 3. 설계

### 3.1 opt-out 컨벤션 (`clients/desktop/playwright.config.ts`)
- `testIgnore` 추가:
  - `**/manual/**`, `**/full-qa/**`, `**/audit/**`, `**/phase-2-4-real-qa/**`
  - `**/*-real-qa.spec.ts`
- 나머지(mockRole/VITE_MOCK_MODE 기반)는 전부 실행.
- **컨벤션 명문화**: 실서버 의존 스펙은 `playwright/manual/` 디렉토리 또는 `*-real-qa.spec.ts` 네이밍 — config 주석 + `clients/desktop/playwright/README.md`(신규)에 명시. → 신규 mock 스펙은 자동 게이트, 실QA 스펙은 컨벤션으로 명시 제외.

### 3.2 webServer 크로스플랫폼 (`playwright.config.ts`)
현재 `command: 'set VITE_MOCK_MODE=1&& npx vite ...'`(Windows cmd 전용)은 Linux CI 에서 실패.
- `command: 'npx vite src/renderer --host 127.0.0.1 --port 5173'` + `env: { VITE_MOCK_MODE: '1' }`(Playwright webServer `env` 옵션) 으로 교체. Windows/Linux 공통.
- `reuseExistingServer: !process.env.CI`(CI 에선 항상 새 서버).

### 3.3 workers (`playwright.config.ts`)
- `workers: process.env.CI ? 2 : 1`. page별 BrowserContext 격리 + 공유 mock 서버는 무상태(모듈 Set 은 page별 재평가)라 병렬 안전. 속도 완화.

### 3.4 CI 잡 (`qa-e2e.yml` 신규 `desktop-playwright`)
```
desktop-playwright:
  name: Desktop Playwright (mock 회귀 hard gate)
  runs-on: ubuntu-latest
  timeout-minutes: 30
  steps:
    - checkout
    - setup-node@20 (cache npm, clients/desktop/package-lock.json)
    - working-directory clients/desktop: npm ci
    - npx playwright install --with-deps chromium
    - npx playwright test --reporter=line,json   # 실패 시 CI fail (hard gate — || true 절대 금지)
    - silent-skip 가드: results.json 파싱 → skipped==0 && passed>0 아니면 실패
    - always: html/junit report artifact 업로드
```
- `qa-e2e.yml`의 `on.pull_request.paths`는 이미 `clients/**` 포함 → 별도 트리거 변경 불필요.

### 3.5 silent-skip 가드 (false-green 2차 방어)
- Playwright json reporter 출력에서 `stats.expected>0` 및 `stats.skipped==0` 단언(스크립트 1개, node).
- 조건부 `test.skip(true, ...)` 사용 스펙(예: d2-order-merge 시 3)은 트리아지에서 무조건 실행되도록 수정하거나 §3.6 격리.

### 3.6 일회성 트리아지 (조기 PR + CI 발견 방식)
[[feedback_open_pr_early]]: config+CI 변경을 먼저 push → PR → **CI가 testIgnore 제외분의 실패를 전수 노출**. 이후 분류:
| 분류 | 처리 |
|---|---|
| PASS | 게이트 편입(무작업) |
| 실서버 필요(mock 불가) | `manual/` 이동 또는 `*-real-qa.spec.ts` 개명(정당 제외) |
| 실 버그/노후 스펙 | 수정 |
| 범위 외 대량 결함 | **투명 격리**: 개별 `test.skip` + 사유주석 + dev-report 추적목록(D-3A2-03). 사이클 3 내 미해소분 한정 |

## 4. 검증
- PR CI에서 `desktop-playwright` 잡 green(testIgnore 제외분 전수 PASS, skipped==0 가드 통과).
- 의도적 실패 1건 주입 시 CI fail 확인(hard gate 실증) 후 원복.
- 기존 잡(qa/playwright, frontend-desktop) 무회귀.

## 5. 리스크
| 항목 | 평가 |
|---|---|
| 트리아지 규모 불확실 | 최대 리스크. 미실행이던 스펙 다수 실패 가능 → 투명 격리(D-3A2-03)로 게이트 도입 자체는 비차단 |
| CI 시간 증가 | workers 2 + chromium-only + timeout 30분으로 완화 |
| 신규 의존(playwright 브라우저 다운로드) | CI 캐시로 완화 |
| 영향 범위 | `qa-e2e.yml` 1잡 + `playwright.config.ts` + `playwright/README.md`(신규) + (격리분) 스펙 주석. BE/앱코드 무변경 |

## 6. 산출물 체크리스트
- [ ] `playwright.config.ts`: testIgnore + webServer env + workers(CI)
- [ ] `qa-e2e.yml`: `desktop-playwright` 잡 + silent-skip 가드 스텝
- [ ] `clients/desktop/playwright/README.md`: opt-out 컨벤션 명문화
- [ ] 트리아지: 제외분 전수 green(이동/개명/수정/투명격리)
- [ ] hard gate 실증(의도 실패→CI fail→원복)
- [ ] dev-report `docs/dev-reports/slice-3-a2-desktop-playwright-ci-gate.md` (격리 추적목록 포함)
- [ ] DECISIONS D-3A2-01~03 / CURRENT-WORK 동기화
