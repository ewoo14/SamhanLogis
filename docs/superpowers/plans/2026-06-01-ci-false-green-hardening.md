# CI false-green 하드닝 (item 3-A) Implementation Plan

> **For agentic workers:** Codex 가 구현([[feedback_codex_implements_claude_reviews]]). Claude 기획·리뷰. 본 PR 의 **검증은 CI 자체**(새로 포함된 테스트가 Linux Testcontainers 에서 실제 실행) — 컴파일 후 push → CI 가 잠재 실패 포착 → 수정 반복.

**Goal:** slip-service 테스트 CI 패키지 allowlist 의 누락 패키지를 전수 등재하고, 6월 진입으로 터지는 date-bomb 테스트를 실행일 기준 상대범위로 정정해 false-green 을 폐쇄한다.

**배경 (S2 #338 회고):** `ci.yml` slip 잡이 패키지 allowlist `--tests` 필터라, 미등재 패키지(`slip.attachment.*`/`estimate.*`/`revision.*`/`audit.*`/`comment.*`/`realtime.*`/`vendor.*` 등)는 **CI 에서 아예 실행 안 됨** → 상시 실패 테스트(SlipPhotoAuditAdminControllerTest, #316 enum 버그)도 green 이었음. 또 save-history IT 가 created_at 을 하드코딩 월범위(2026-05)로 조회 → 6월에 실패(date-bomb). [[feedback_ci_test_filter_false_green]].

**Tech Stack:** GitHub Actions(ci.yml), Gradle `--tests` 필터, Testcontainers IT.

---

## 현황 (조사 완료)

- slip-service 실제 테스트 패키지 ≈30, CI 커버 8(`client`/`domain`/`delivery.domain`/`delivery.service`/`delivery.it`/`it`/`publish`/`service`). gradle `*` 가 `.` 포함 매칭이라 `*.dispatch` 하위는 상위 필터로 커버될 수 있음 — **검증 필요**.
- **누락(어느 잡에도 미할당) 단위 패키지는 로컬 전부 PASS**(attachment/audit/comment.service/editrequest/estimate.domain·service·web/estimate.revision.*/revision.*/realtime/vendor). 잠재 실패 0(attachment.web 는 #338 에서 이미 교정·머지).
- 누락 IT: `comment.it`, `estimate.it` (Testcontainers — CI 에서만 실행 가능).
- date-bomb 후보: `DispatchSaveHistoryIT`(arologis-ci.yml, ci.yml 미커버) — save-history 패턴. 기타 save-history-류 created_at 하드코딩 월범위 점검.

---

## Task 1: ci.yml slip 테스트 필터 누락 패키지 전수 등재

**Files:** `.github/workflows/ci.yml`

- [ ] **Step 1: gradle `--tests` 와일드카드 매칭 범위 확인** — `com.samhanair.logis.slip.domain.*` 가 `slip.domain.dispatch.*` 까지 매칭하는지 로컬 검증(매칭되면 dispatch 하위는 추가 불요). 매칭 안 되면 명시 등재.
- [ ] **Step 2: 누락 단위 패키지를 `slip-units` 잡 `test-tasks` 에 추가** — `attachment.domain`/`attachment.repository`/`attachment.service`/`attachment.web`/`audit.service`/`comment.service`/`editrequest.service`/`estimate.domain`/`estimate.service`/`estimate.web`/`estimate.revision.domain`/`estimate.revision.service`/`revision.domain`/`revision.service`/`realtime`/`vendor` (와일드카드로 묶을 수 있으면 묶기). 등재 후 **모든 slip 테스트 패키지가 정확히 한 잡에 할당**되도록(중복/누락 0) 점검.
- [ ] **Step 3: 누락 IT 추가** — `comment.it`, `estimate.it` 를 `slip-it-core`(또는 it-public) 필터에 추가. (slip.it.* 와 충돌 없이.)
- [ ] **Step 4: 검증** — push 후 CI 가 새 패키지 실행. 잠재 실패(특히 estimate.it/comment.it/revision) 포착 시 Task 3 로 수정.

## Task 2: date-bomb 테스트 전수 정정

**Files:** save-history/created_at-하드코딩-월범위 IT (최소 `services/arologis-service/.../it/DispatchSaveHistoryIT.java`, 그 외 `grep -rl "2026-05-01" services/*/src/test` 중 created_at 기준 목록 조회 테스트).

- [ ] **Step 1: 후보 식별** — `grep -rlE "2026-05-01|2026-05-31"` 후, 각 테스트가 **created_at(생성=now) 을 하드코딩 월범위로 조회**하는지 확인(그런 것만 date-bomb; created_at 을 명시 May 로 set 하거나 고정 과거데이터 조회는 무관 — 오탐 제외).
- [ ] **Step 2: 상대범위 정정** — date-bomb 만 실행일 기준 상대범위(예: 어제~내일, 또는 now 포함 범위)로 변경. S2 에서 DpsSaveHistoryIT/SlipCleanupSaveHistoryIT 에 쓴 패턴 미러.
- [ ] **Step 3: 검증** — 컴파일 + (Docker 가용 시 로컬 IT, 아니면 CI).

## Task 3: CI 가 포착한 잠재 실패 수정 (반복)

- [ ] Task 1 등재로 estimate.it/comment.it/revision 등에서 실패가 드러나면 근본 수정(테스트 격리/계약/날짜). whack-a-mole 방지 위해 일괄.

## 범위 밖 (별도 후속)

- **Playwright CI hard gate** (D2/2.6d desktop 스펙): `ci.yml:171` 이 "별도 PR(qa/playwright testDir 확장 또는 spec 이전)" 로 명시. E2E 스택 필요 → 독립 PR(item 3-A2).

## QA / 검증

- 본 PR 의 핵심 검증 = **CI green(skipped=0)** + 새로 포함된 패키지 수가 늘어남 확인(테스트 총수 증가). Docker 가용 시 로컬 IT 보조.
