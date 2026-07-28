# #964 — 공유 real-QA 설정 수집 범위 구현 계획

> **작업자 안내**
> - 이 계획은 워크트리 `D:\dev\Samhan-Public\.claude\worktrees\964-testmatch` (브랜치 `chore/964-real-qa-testmatch-scope`, main `40c415426` 기준) 에서 실행한다.
> - 🚫 **git 명령 전면 금지**(add/commit/push/checkout/branch/reset/stash). 파일 작성만 — commit·PR 게시는 PM 이 대행한다.
>   ※ 예외: **읽기 전용 조회**(`git ls-files` · `git check-ignore` · `git status --porcelain` · `git log`)는 진단·검증에 필요하므로 허용한다.
> - 기획서 = `docs/superpowers/specs/2026-07-28-964-real-qa-testmatch-scope-spec.md`. **불변식·울타리는 그 문서가 정본**이다.
> - 🚫 **수단은 지시하지 않는다.** 아래 각 작업은 "무엇을 달성/증명" 인지만 적는다. 어떤 API·어떤 파일·어떤 방식으로 할지는 구현자가 고른다.
> - 모든 보고서·주석·커밋 문구는 **한국어** ([[feedback_korean_commits]]).

**목표** — 공유 real-QA 하네스가 수집한 집합이 Git 추적 집합과 어긋날 때 **실행자가 즉시 알고**, 그 정합이 **회귀 게이트로 지켜지며**, 그 과정에서 **현재 172파일/548테스트가 단 1개도 줄지 않는다.**

**전제(측정 완료)** — 이 PC(`D:\dev\Samhan-Public`, `40c415426`, clean)에서 결함 A **증상은 미재현**, **메커니즘은 주입 실험으로 재현**. 결함 B **증상 재현·원인 상이**. 전부 spec §1 에 원문 기록.

---

## 전역 제약

- **F-1 ~ F-8 (spec §5) 는 모든 작업의 상시 조건**이다. 어느 작업이든 끝날 때 F-1·F-2 를 재측정한다.
- Playwright 는 `clients/desktop/node_modules/.bin/playwright` 를 **직접** 호출한다 ([[feedback_playwright_local_version_skew]]).
- 🚨 **워크트리에는 `node_modules` 가 없다**(실측). 실행 위치를 정할 때 이 사실을 먼저 처리하고, **어느 트리에서 측정했는지 매 측정마다 기록**한다. 두 트리의 수를 섞어 비교하지 말 것.
- 🚨 **실험용 파일 주입 시 `git status --porcelain` 이 계속 비어 있어야 한다.** 실험이 추적 트리를 오염시키면 안 된다. 주입 파일은 **반드시 원복**하고 원복 후 재확인한다.
- 로컬 전체 스위트를 권위로 삼지 않는다 — **권위는 exact SHA 의 CI** ([[feedback_throughput_parallel_scope_freeze_batch]] R2).
- 🚫 범위 밖 파일(spec §8) 을 열지도 수정하지도 않는다. 특히 `.github/workflows/qa-e2e.yml` 및 PR #957 소유 5개 파일.

---

### 작업 1: 변경 전 기준 고정 (baseline)

**목적** — F-1 ~ F-8 의 기준값을 **이 트리에서 직접** 재측정해 못 박는다. spec §5 수치는 메인 트리 실측이므로, 작업 트리에서 같은 수가 나오는지부터 확인한다.

- [ ] 공유 하네스 전체 수집 수를 원문으로 기록한다 (전체 / `--project=renderer` / `--project=order-app` 3종).
- [ ] **파일 이름 목록**을 파일로 저장한다 — 이후 비교는 **개수가 아니라 이름 집합**으로 한다(F-2 는 개수로는 통과해 버린다).
- [ ] Git 추적 `*-real-qa.spec.ts` 목록을 저장하고 위 목록과 **차집합 양방향**을 기록한다.
- [ ] mock 게이트 수집 수(F-4)와 `tsconfig.node.json` 의 `playwright.real-qa.config.ts` 포함 여부(F-8)를 기록한다.
- [ ] `manual/slip-form-3d-real-qa.spec.ts` · `dispatch-collab-real-qa/dispatch-collab-real-qa.spec.ts` 두 파일이 **현재 수집 집합 안에 있음**을 이름으로 확인한다(F-2 기준선).

**산출** — 이후 모든 비교의 기준이 되는 목록 파일 + 수치 원문.

---

### 작업 2: 결함 재현 (RED 를 먼저 만든다)

**목적** — 고치기 전에 **결함이 존재함을 이 트리에서 실증**한다. spec §1-2 의 주입 실험을 작업 트리에서 재현한다.

- [ ] `.gitignore` 등재 디렉터리에 미추적 `*-real-qa.spec.ts` 1개를 주입한다.
- [ ] 세 가지를 **동시에** 기록한다: ① `git status --porcelain` 이 **빈 출력**인 것 ② `git check-ignore -v` 가 무시 규칙을 반환하는 것 ③ 수집 수가 **늘어나는 것**.
- [ ] 🔑 **실행자에게 도달한 경고/신호가 0개임**을 명시적으로 기록한다 — 이것이 결함의 본체다.
- [ ] 주입 파일을 **원복**하고 수집 수가 기준선으로 돌아옴을 확인한다.

**완료 조건** — "미추적 스펙이 조용히 섞인다" 가 이 트리의 실측으로 증명됐다.

---

### 작업 3: I-1 · I-2 충족 — 실행자가 어긋남을 안다

**목적** — spec I-1 · I-2 를 만족시킨다. **수단은 구현자가 고른다.**

- [ ] 공유 하네스 실행 시, 수집 집합이 Git 추적 집합과 **다르면 실행자가 그 사실과 어긋난 파일 이름을 알게** 한다.
  - 🔑 "다르다" 만으로는 불충분 — **어느 파일인지**가 나와야 한다(spec I-1).
- [ ] 🚨 **spec §1-4 의 지뢰를 피한다** — 추적/미추적 판정을 `.gitignore` **규칙 목록**으로 하면
      `manual/` · `dispatch-collab-real-qa/` 안의 **추적 스펙 2개가 사라진다.**
      `git check-ignore` 는 index 참조 여부(`--no-index`)에 따라 **답이 뒤집힌다**(spec §1-4 표 참조).
      어떤 판정 기준을 택했는지와 **왜 그것이 F-2 를 깨지 않는지**를 보고서에 적는다.
- [ ] 작업 2 를 다시 돌려 이번엔 **신호가 나오는지** 확인한다(전/후 출력 원문 병기).
- [ ] F-1 · F-2 · F-3 재측정 — 작업 1 목록과 **이름 집합이 동일**함을 확인한다.

**완료 조건** — 주입 상태에서 실행자가 파일 이름을 읽을 수 있고, 원복 시 일치 신호로 돌아오며, 추적 172파일이 그대로다.

---

### 작업 4: I-3 충족 — 로컬 개발자의 정당한 경로를 살린다

**목적** — spec I-3 · F-7. 이 슬라이스는 로컬 스펙 사용을 **금지하지 않는다**.

- [ ] 미추적 로컬 스펙을 **의도적으로** 실행하는 경로를 정하고 **문서에 명시**한다.
- [ ] 그 경로가 **실제로 동작함을 실행으로 증명**한다(작업 2 의 주입 스펙이 그 경로에서 실행되는 출력 원문).
- [ ] 🚨 **F-6 을 함께 확인** — 기존 격리 실행(`--config=… <스펙경로>`, config 헤더 49~51행의 정본 사용법)이 계속 동작한다.
- [ ] 🚨 **F-5 를 함께 확인** — 새 판정 기준이 `-real-qa` 접미사 규칙(mock config `testIgnore`)을 **대체하거나 무력화하지 않는다**. 두 규칙이 각각 무엇을 담당하는지 한 문장씩 적는다.

**완료 조건** — "조용히 섞이는 것" 만 막혔고 "의도적으로 돌리는 것" 은 그대로다.

---

### 작업 5: 회귀 게이트 신설 + 🚨 RED-first 왕복 (M-1 · M-2 **둘 다**)

**목적** — spec §3. 게이트가 **장식이 아님**을 뮤테이션으로 증명한다.

- [ ] 게이트를 신설한다. 위치는 구현자 재량이되 **spec §4 의 커버리지 질문에 한 문장으로 답할 수 있어야** 한다 — *"내 게이트를 어느 CI 잡이 실행하는가"*. 답을 보고서에 적는다.
  - ⚠️ **충돌 주의**: `harness-false-green-guard.test.ts` 는 **PR #957 이 수정 중**(spec §9 E-3). PM 지시 없이 그 파일에 추가하지 말 것.
- [ ] **M-1 (정방향)** — 미추적 스펙 주입 → 게이트 **RED 원문** 저장 → 원복 → **GREEN 원문** 저장.
- [ ] 🚨 **M-2 (역방향 — 이 슬라이스의 핵심)** — 배제 기준을 "`.gitignore` 디렉터리 목록" 으로 순진하게 바꿨을 때
      **F-2 가 RED** 가 되는지 확인한다. **RED 가 안 되면 게이트가 §1-4 지뢰를 못 잡는 것**이므로 게이트를 보강한다.
      RED 원문 저장 후 **원복**하고 GREEN 재확인.
- [ ] 두 뮤테이션 모두 **원복 후 `git status --porcelain` 이 비어 있음**을 확인한다.

**완료 조건** — M-1 · M-2 **양쪽** RED→GREEN 왕복 원문이 확보됐다. **M-2 생략 시 이 작업은 미완이다.**

---

### 작업 6: I-4 충족 — 파생물 stale 을 실행자가 구분한다

**목적** — spec I-4. 결함 B 의 재정의된 본체.

- [ ] spec §1-5 의 **3종 파생물**(`out/**` · `file:` 의존 `dist` · 설치된 `node_modules`) 중
      **로컬에서 stale 이 실제로 관측된 것**을 이 트리/메인 트리에서 재확인해 원문으로 기록한다.
- [ ] 소스보다 낡은 파생물을 읽고 있을 때, **실패 메시지에서 그 사실이 구분 가능**하게 한다.
      🔑 **"코드가 틀렸다" 로 읽히는 실패가 실제로는 "파생물이 낡았다" 인 상태**를 없애는 것이 목표다.
      어디에·어떤 방식으로 신호를 낼지는 **구현 재량**.
- [ ] ⚠️ **범위 판단** — 이 항목이 `ci.yml`/빌드 파이프라인 개편으로 번지면 **멈추고 PM 에게 보고**한다
      ([[feedback_expanded_scope_reinstate_review]] · [[feedback_pm_regulate_slice_effort]]).
      이 슬라이스가 요구하는 것은 **개편이 아니라 신호**다.
- [ ] 🚫 mock 이 결함 지점을 덮지 않는지 확인한다 — *"이 테스트가 mock 하는 것이, 결함이 실제로 발생하는 그 지점인가?"*
      ([[feedback_ungated_surface_and_mock_covering_defect]] R2). 이 레포는 `vi.mock('electron-updater')` 로 **정확히 이 실수**를 한 전례가 있다.

**완료 조건** — 파생물이 낡았을 때 실행자가 그것을 **코드 결함과 혼동하지 않는다.**

---

### 작업 7: U-gate 실증 (spec §6 5단계 그대로)

**목적** — 머지 전 PM 이 실행할 시나리오를 **구현자가 먼저 1회 완주**한다.

- [ ] spec §6 의 **1~5단계를 순서대로 실행**하고 각 단계 출력을 원문으로 남긴다.
- [ ] 🚨 **5단계(I-3 경로가 실제로 동작)** 가 실패하면 **정당한 워크플로를 죽인 것** — U-gate 실패로 보고한다.
- [ ] 🚨 **라이브QA** — `--list`·typecheck 류 **정적 게이트로 대체 금지**. 실제 실행 + **스크린샷 다수**
      ([[feedback_live_qa_every_round_screenshots]] · [[feedback_canonical_workflow]]).
      real-QA 스펙을 실제로 돌린다면 하네스 함정을 먼저 확인한다 — 어느 config 로 렌더러를 띄울지,
      `VITE_APP_VERSION`(`YYYY/MM/DD-N`) 주입, 포트 리스너 커맨드라인이 **이 워크트리인지**
      ([[feedback_realqa_run_and_false_red]]).
- [ ] 🚨 **공유 실데이터 write 금지** — 읽기 전용 또는 전용 throwaway ([[feedback_qa_live_shared_data_readonly]]).

**완료 조건** — 5단계 전부 통과 + 스크린샷 확보.

---

### 작업 8: 최종 회귀 울타리 전수 + 문서 동기화

- [ ] **F-1 ~ F-8 전수 재측정** — 작업 1 의 기준 목록과 **이름 집합 대조**(개수 일치만으로 통과 금지).
- [ ] `npm run typecheck` · `npm run lint` · `npm test`(변경 모듈) 실행 ([[feedback_changed_module_full_test_before_push]] · [[feedback_desktop_typecheck_command]]).
      ⚠️ spec §1-5 대로 **이 PC 에서는 파생물 stale 로 인한 RED 가 이미 존재**한다 —
      **변경 때문인지 stale 때문인지 구분해서** 보고한다. 구분 못 하면 그 측정은 아무것도 증명하지 않는다
      ([[feedback_pm_verify_what_measurement_proves]]).
- [ ] 문서 동기화 ([[feedback_continuous_docs_sync]]) — `docs/dev-reports/2026-07-28-964-real-qa-testmatch-scope.md` 신설,
      `clients/desktop/README.md`(공유 하네스 사용법 · I-3 경로), `README.md` · `ROADMAP.md` · `docs/samhan-public-overview.html` 중 해당 항목.
- [ ] `playwright.real-qa.config.ts` 헤더 주석에 **이 슬라이스가 정한 계약**을 남긴다(이 파일은 이미 R2/R3 사고 이력을 주석으로 보존하는 관행이 있다).
- [ ] dev-report 에 다음을 **원문으로** 포함: 작업 1 기준값 · 작업 2 재현 · **M-1·M-2 RED/GREEN 왕복** · 작업 7 U-gate 5단계 · F-1~F-8 전수 결과 · **판정 기준을 무엇으로 택했고 왜 F-2 를 깨지 않는지**.

---

## 검증 체크리스트 (머지 게이트)

| # | 항목 | 근거 |
|---|---|---|
| 1 | 실 사용자 경로로 **재현 가능한 결함 0** | 두 검증 스테이지 수렴 |
| 2 | **CI green (exact SHA)** | `clients/**` 변경 → `ci.yml` + `qa-e2e.yml` 둘 다 발동(spec §4) |
| 3 | **라이브QA — 실서버 실제 실행 + 스크린샷** | 작업 7 |
| 4 | **F-1 ~ F-8 전수 통과 (이름 집합 대조)** | 작업 8 |
| 5 | 🚨 **M-1 · M-2 RED-first 왕복 원문** | 작업 5 — **M-2 없으면 미완** |
| 6 | **U-gate 5단계 완주** (특히 5단계 = I-3) | 작업 7 |

---

## 🚫 이 계획이 하지 않는 것

- `.github/workflows/qa-e2e.yml` **및 PR #957 소유 5개 파일** 수정 (spec §8)
- **#851 슬3 (`|| true` 제거)** 편입 — 함께 처리하지 않는다 (spec §8 사유 3가지)
- `.gitignore` 재정리 (spec §9 E-1 — **PM 판단**)
- `assert-playwright-ran.mjs` 하한 추가 (spec §9 E-2 — **PM 판단**)
- `harness-false-green-guard.test.ts` 수정 (spec §9 E-3 — **#957 충돌, PM 판단**)
- 새 이슈 등록 · 후속 PR 분리 ([[feedback_fix_in_current_pr_no_split]] · [[feedback_backlog_burndown_issue_bar]])
- mock 게이트 / vitest 수집 표면 변경 (F-4 · spec §1-6 실측 오염 0건)
