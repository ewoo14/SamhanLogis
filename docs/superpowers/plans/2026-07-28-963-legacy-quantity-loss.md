# #963 구현 계획 — 레거시 GAS 수량 계산 결함 2건

> 스펙: [`docs/superpowers/specs/2026-07-28-963-legacy-quantity-loss-spec.md`](../specs/2026-07-28-963-legacy-quantity-loss-spec.md)
> 연관 Issue: #963 · 선행 #896 / #948
> 브랜치 `fix/963-legacy-gas-quantity-loss` (main `40c415426` 기준) · 워크트리 `.claude/worktrees/963-qty`

---

## 0. 이 계획이 지키는 것

1. **RED-first** — 결함을 재현하는 실패 테스트를 먼저 세우고 RED 원문을 제출한 뒤 고친다.
2. **golden 은 결과다** — 고친 뒤 실행 출력으로 재생성한다. 먼저 고쳐 놓고 코드를 맞추지 않는다.
3. **불변식만 지시한다** — PM/기획은 *무엇이 참이어야 하는가* 만 말한다. 구현 수단(어떤 변수를 두고 어디서 분기할지)은 구현자가 정한다.
4. **경로 수와 무관한 진술** — #896 슬2 가 "형태별로 하나씩 막는 fix" 로 4라운드를 끌었다. 검증도 보존량으로 한다.

---

## ⛔ 착수 차단 조건

**단계 1 이전에 결정 D-1 이 확정되어야 한다.**
D-1(전역 I형 설정 vs 화면칩 중 어느 쪽이 1WAY 형태의 권위인가)이 미확정이면 불변식 I-4 를 만족시키는 구현이 두 가지로 갈리고, golden 재생성 결과도 달라진다. **D-1 확정 전에는 구현을 디스패치하지 않는다.**

D-2·D-3 은 구현과 병행 가능하되 **머지 전** 확정한다.

---

## 단계 1 — RED 세우기 (구현 코드 변경 0)

> 산출물: 실패하는 테스트 + **RED 원문** PR 게시

### 1-1. 결함 1 RED
견적 golden 테스트(`clients/web/estimate-app/test/legacy-quantity-golden.test.js`)에 **불변식 I-1/I-2 를 보존량으로 검사하는** 테스트를 추가한다.

- 열거형("`C-02-I-HOSE` 의 `FH-LFHIF` 가 2인가")이 아니라 **합계 보존형**으로 쓴다:
  `(L형1WAY 수량 + I형1WAY 수량) === nTarget` · `(L형4WAY + I형4WAY) === nNormal`
- **전역 ON/OFF × 화면칩 ON/OFF 네 조합 전부**를 돌린다. 조합을 두 개만 넣으면 이 계열은 다시 라운드를 끈다.
- 현재 A(ON/ON)·B(ON/OFF) 두 조합에서 RED 여야 한다. C·D 는 처음부터 GREEN 이며 그것이 F-2 울타리다.

### 1-2. 결함 2 RED
주문 golden 테스트(`clients/web/order-app/src/__tests__/legacy-quantity-golden.test.ts`)에 **불변식 I-5/I-6 를 검사하는** 테스트를 추가한다.

- 판넬 하나가 아니라 **홈 파생 5계열 전부**(판넬·유연호스·리모컨·발통·분기관)를 돌린다.
- I-6(손대지 않은 파생은 계속 자동 계산) 도 같은 테스트에서 함께 검사한다 — 보존만 검사하면 "전부 얼려버리는" fix 가 GREEN 이 된다.
- 현재 5계열 전부 RED 여야 한다.

### 1-3. RED 원문 제출
두 테스트를 각각 **단일 파일 스코프**로 실행하고 출력 원문을 PR 에 그대로 게시한다.

```bash
# 견적
cd clients/web/estimate-app && npx jest test/legacy-quantity-golden.test.js --runInBand
# 주문
cd clients/web/order-app && npx vitest run src/__tests__/legacy-quantity-golden.test.ts
```

> 🚫 로컬 전체 스위트 금지(권위는 CI on exact SHA). 🚫 `--list`·typecheck 로 대체 금지.
> 🚨 RED 원문은 **요약이 아니라 붙여넣기**다. 수치를 손으로 옮겨 적으면 증거 무결성 위반이다.

### 게이트 G1
- [ ] 결함 1 RED 2조합(A·B), 결함 2 RED 5계열 — 실제 출력 원문 게시
- [ ] 정본 파일 diff **0줄** (`git diff --stat` 로 확인)

---

## 단계 2 — 결함 1 fix (견적 상업 유연호스)

> 대상: `clients/web/estimate-app/views/index.ejs`
> 불변식: I-1 · I-2 · I-3 · I-4 · I-8
> **구현 수단은 지시하지 않는다.** 아래는 관찰된 사실이지 지시가 아니다.

**관찰된 사실(참고용, 지시 아님)**
- `:4084-4087` `pickHoseModel(kind)` 는 `window.SHOW_I_HOSE` 만 본다.
- `:8379-8381` 이 `hose1L = pickHoseModel('1way')`(전역 기준) 과 `hose1I = HOSE_I_1W`(상수) 를 **서로 다른 권위**로 정한다.
- `:8383-8393` 의 선택/0-덮기 두 문장은 두 변수가 같은 모델일 때 서로를 무효화한다.
- 견적 **홈** 계산(`:8319-8327`)은 `pickHoseModel` 을 쓰지 않고 `HOSE_1W`/`HOSE_I_1W` 를 직접 쓴다 — 그래서 이 결함이 없다(F-2-6).
- 주문 **상업**(`index.html:5349-5350`)은 0-덮기 문장 자체가 없다.

**요구**
- D-1 이 정한 권위 하나로 1WAY 형태를 결정한다(I-4).
- 4WAY 도 같은 권위를 쓴다 — 1WAY 와 4WAY 가 서로 다른 스위치를 보는 상태를 남기지 않는다.
- 홈 계산과 주문 앱 상업 계산에는 **손대지 않는다**(F-2-6·F-2-7 훼손 금지).

### 게이트 G2
- [ ] 1-1 테스트 GREEN, 출력 원문 게시
- [ ] `git diff` 가 `index.ejs` 상업 호스 블록 밖으로 번지지 않음
- [ ] `clients/web/order-app/index.html` diff 0줄 (이 단계에서는)

---

## 단계 3 — 결함 2 fix (주문 홈 파생 수동 보존)

> 대상: `clients/web/order-app/index.html`
> 불변식: I-5 · I-6 · I-7 · I-8 · I-9

**관찰된 사실(참고용, 지시 아님)**
- `grep -c HOME_MANUAL clients/web/order-app/index.html` → **0**, `COMM_MANUAL` → **20**. 상업에는 있고 홈에만 없다.
- 견적 대조군: `index.ejs:7655-7659` 5개 Set 선언, `:7695-7699` 사용자 입력 시 등록, `:9977-9981` 화면 리셋 시 해제.
- 주문 `onHomeQtyInput`(`index.html:4851-4857`)은 `homeQty.set` 만 하고 표식을 남기지 않는다.
- 홈 옵션바의 모든 컨트롤이 `change` 에서 `recomputeHomeDerived(true)` 를 호출한다(`:4884-4885`).
- 주문 앱의 `window.ABSOLUTE_LOCK` 은 **초기화되지 않고**(선언 없음) 어떤 재계산도 참조하지 않는다 — `:8731` 저장과 `:9041-9044` 복원에서만 언급되는 사실상 사문이다. 이 사실을 모르고 여기에 얹으면 아무 효과가 없다.

**요구**
- 홈 파생 **5계열 전부**에 성립해야 한다(I-5). 판넬만 막는 fix 는 미달이다.
- 손대지 않은 파생은 계속 자동 계산돼야 한다(I-6).
- 보존 상태는 해제 가능해야 한다(I-7).
- 주문 **상업** 수동 보존(F-2-2·F-2-3·F-2-4·F-2-8)을 훼손하면 안 된다.
- **I-9** — `H-03-PANEL-LOCK` fixture 의 `manualLocks.home` 입력이 fix 이후 **실 사용자 입력으로 도달 가능한 상태**여야 한다. 하네스 입력만 받고 실 화면 입력으로는 그 상태가 안 만들어지면 golden 은 허구다([[feedback_fixture_must_be_reachable_by_real_path]]).

### 게이트 G3
- [ ] 1-2 테스트 GREEN(5계열 전부), 출력 원문 게시
- [ ] 주문 상업 수동 보존 F-2-2/3/4 값 불변 확인
- [ ] `git diff` 가 견적 파일로 번지지 않음

---

## 단계 4 — golden 재생성

> 🚨 **단계 2·3 GREEN 이후에만 착수한다.** 순서를 바꾸면 그 라운드는 무효다.

### 4-1. 재생성 실행
`fixtures`/`optionFixtures` 를 순회하며 `evaluateLegacyQuantityBoundary({...fixture, app})` 의 `.quantities` 를 그대로 기록해 `goldens.js` 를 만든다. **손으로 값을 타이핑하지 않는다** — 파일 헤더가 이미 그것을 계약으로 선언하고 있다.

### 4-2. diff 검토 (핵심 게이트)
재생성 diff 를 한 줄씩 본다.

| 바뀌어야 하는 줄 | 기대 |
|---|---|
| `estimateOptionGoldens['C-02-I-HOSE']` | `FH-LFHIF` 출현 (D-1 확정 형태에 따라 4WAY 도 함께 바뀔 수 있음) |
| `orderOptionGoldens['H-03-PANEL-LOCK']['PC1MWSK3NW']` | `1` → `9` |
| (D-1=전역 우선인 경우) 신규 fixture 1건 | 전역 ON + 화면칩 OFF 조합 |

**그 밖의 줄이 하나라도 바뀌면 커밋하지 않는다.** 원인을 먼저 밝히고 PR 에 기록한다.
현행 HEAD 에서 전수 실행 불일치가 **0** 임을 이미 확인했으므로, 예상 밖 diff 는 전부 이번 fix 가 만든 것이다.

### 4-3. 드리프트 어서션 갱신
두 테스트의 `'정찰 §5 드리프트 8종이 양 앱 golden에 각각 남아 있다'` / `'두 앱 드리프트의 주문 fixture를 보존한다'` 가 반드시 RED 가 된다(1종 해소).
**그냥 지우지 않는다** — 해소된 항목은 *"두 앱이 같은 값이 되었다"* 를 어서션하는 형태로 바꾸고, 나머지 6종은 distinct 어서션을 유지한다. 그래야 수렴 자체가 회귀 게이트로 남는다.

`goldens.js` 의 `H-03-PANEL-LOCK` 주석(*"주문 앱은 index.html 전체에 HOME_MANUAL_*가 단 한 줄도 없다"*)도 현재 사실이 아니게 되므로 함께 고친다.

### 게이트 G4
- [ ] golden diff 가 §9.2 예상 목록과 정확히 일치, 초과 줄 0
- [ ] 견적 jest / 주문 vitest 전체 GREEN, 출력 원문 게시
- [ ] 드리프트 어서션이 "6종 유지 + 2종 수렴" 을 명시적으로 검사

---

## 단계 5 — 뮤테이션 판별력 확인

> golden 을 갱신했으므로 **그 golden 이 여전히 결함을 잡는지**를 다시 증명해야 한다. 갱신된 golden 이 뮤테이션에 둔감해졌다면 우리는 게이트를 잃은 것이다.

### 5-1. 기존 뮤테이션 전수 재실행

```bash
# 견적 — 19종
for M in multiplier target-model source-omit add-to-replace inactive-keep option-invert \
         manual-lock-ignore drift-fixture-delete derive-foot-round derive-branch-swap \
         derive-hose-1w-swap derive-remote-kit-off derive-cumsum-threshold \
         derive-renew-filter-map derive-remote-360-drift derive-outdoor-hp-threshold \
         derive-hose-4w-swap derive-remote-wireless-off derive-wired-board-off \
         derive-ceiling-pump-off; do
  LEGACY_MUTATION=$M npx jest test/legacy-quantity-golden.test.js --runInBand
done
```

주문 쪽도 동일하게 `LEGACY_MUTATION` 을 주입해 반복한다.

**전부 RED 여야 한다.** 단, `derive-renew-filter-map` 은 주문에서 정당한 GREEN 이다(s1 dev-report §13.7 — `isCommOutdoorRow` 드리프트로 경로 미도달). 이 예외는 이미 테스트가 문서화하고 있으므로 그대로 유지한다.

특히 확인:
- `manual-lock-ignore` — 결함 2 fix 가 직접 건드리는 표면. fix 후에도 RED 인가?
- `inactive-keep` — 판넬 초기화 경로. fix 가 이 경로를 죽이지 않았는가?
- `derive-hose-1w-swap` / `derive-hose-4w-swap` — 결함 1 fix 표면.

### 5-2. 신규 뮤테이션 (이번 fix 표면 전용)
이번에 고친 지점을 되돌리는 뮤테이션을 각 결함당 최소 1종 추가하고 **RED 를 확인**한다. 이것이 없으면 새 golden 은 "이번 fix 를 검증한다" 고 말할 수 없다.

### 게이트 G5
- [ ] 견적 19+n 종 / 주문 해당분 RED 원문 게시 (정당한 GREEN 은 사유 명시)
- [ ] 신규 뮤테이션 2종 이상 RED

---

## 단계 6 — 라이브 QA (실 서버 · 실 브라우저 · 실 스크린샷)

> 🚨 두 결함 모두 **사용자가 화면에서 만드는 상태**다. golden 은 계산 경계만 본다 — 화면에서 실제로 그 상태가 만들어지는지는 **오직 라이브 QA 만** 증명한다([[feedback_ungated_surface_and_mock_covering_defect]], [[feedback_live_qa_every_round_screenshots]]).

### 6-1. 실행 함정 (착수 전 확인)
- **견적 앱**: `clients/web/estimate-app` — Express + EJS. `npm run dev`(= `node server.js`). `.env`/DC 설정 원천이 필요하다.
- **주문 앱**: `clients/web/order-app` — Vite SPA, `index.html` 이 엔트리. `npm run dev`.
- 🚨 **`VITE_APP_VERSION`(`YYYY/MM/DD-N`) 미주입 시 런타임 사망** ([[feedback_realqa_run_and_false_red]]). 띄우기 전에 주입 여부부터 확인한다.
- 🚨 라우터 형태에 따라 목표 화면 goto 가 다르다. **띄운 뒤 두 형태(경로 / `#/`)로 목표 화면 도달을 먼저 확정**하고 나서 시나리오를 돌린다.
- 🚨 공유 실데이터에 **write 금지** — DC 설정은 조회만 한다([[feedback_qa_live_shared_data_readonly]]).

### 6-2. 시나리오
스펙 §11 의 11단계를 그대로 실행한다. **매 라운드** 실행하며, 끝 1회로 갈음하지 않는다.

### 6-3. 증거
- 단계별 스크린샷 다수
- 사용자에게 인라인 첨부(`SendUserFile`, display=render) **와** PR 에 SHA-pinned 인라인 게시 — **둘 다** ([[feedback_pr_screenshot_sha_pinned_urls]])
- 🚫 API JSON·SSE 텍스트로 GUI 스크린샷 대체 금지
- 🚫 합성·fixture 캡처 금지 — 실 캡처만 ([[feedback_no_fake_data_ever]])

### 게이트 G6
- [ ] 스펙 §11 의 4·6·10·11 네 관측 지점 스크린샷 확보
- [ ] 견적 금액 합계에 1WAY 호스가 실제로 반영된 화면
- [ ] 주문 판넬 9 가 옵션 변경 후에도 남은 화면

---

## 단계 7 — 문서 동기화

| 파일 | 갱신 내용 |
|---|---|
| `docs/superpowers/specs/2026-07-27-896-survey.md` | §5 드리프트 표 8행 중 해소 1건(`H-03-PANEL-LOCK`) 표시(7 유지) + 목록 밖 별도 1건(`C-02-I-HOSE`) 수렴 · §11 결정 #7 개정(D-2 확정 후) (🚨 R1 정정: "해소 2건(6 유지)"는 계수 오류) |
| `docs/dev-reports/2026-07-27-896-s1-golden-baseline.md` | §6-1(주문 홈 수동 잠금 부재) · §6-3(견적 I형 상쇄) · §13.4 sweep 결과 갱신 |
| `clients/web/legacy-quantity-golden/goldens.js` | `H-03-PANEL-LOCK` 주석 갱신 |
| `docs/dev-reports/2026-07-28-963-legacy-quantity-loss.md` | **신규** — 진단 원문·fix 근거·golden diff·뮤테이션 결과·라이브 QA |
| `docs/handoff/CURRENT-WORK.md` | #963 상태 · #896 슬3 선행조건 비간섭 판정 기록 |
| `README.md` · `ROADMAP.md` · `docs/samhan-public-overview.html` | [[feedback_continuous_docs_sync]] |

> 🚫 별도 docs PR 금지 — 같은 PR 에 포함한다.

### 게이트 G7
- [ ] 드리프트 "8건 중 7건 유지 + 별도 1건 수렴"(🚨 R1 정정 — "8→6"은 계수 오류) 이 **네 곳 전부**(survey · dev-report · 테스트 어서션 · goldens.js 주석)에서 일치
- [ ] 새 dev-report 의 모든 수치가 실행 원문에서 왔고 재현 가능

---

## 단계 8 — 머지 게이트

| # | 게이트 | 판정 |
|---|---|---|
| ① | **실 사용자 경로로 재현 가능한 결함 0** (심각도 무관) | 두 검증 스테이지(OPUS 5-agents + CODEX SOL 5-agents) 수렴 |
| ② | **CI green (exact SHA)** | `deploy-estimate-app.yml`(jest) + `ci.yml frontend-order-app`(vitest) 둘 다 확인. ⚠️ `deploy-order-app.yml` 은 PR 트리거가 없다 — 그것으로 착각하지 말 것 |
| ③ | **라이브 QA — 실 서버 실제 실행** | 단계 6 스크린샷 |
| ④ | D-1 · D-2 · D-3 전부 확정 + PR 에 "📌 개발책임자 결정 기록" 으로 누적 게시 | |
| ⑤ | golden 무훼손(F-1) · 실 경로(F-2) · 뮤테이션(F-3) 전부 통과 | |

> 🚨 PR 충돌이면 워크플로가 **아예 생성되지 않는다**. 체크 수가 평소보다 적으면 `gh pr view --json mergeable` 부터 본다([[feedback_pr_conflict_blocks_all_workflows]]).

---

## 부록 A — 라운드 운영

- **워크플로우 캐논 엄수**: OPUS 기획 → CODEX LUNA 5.6 구현 → OPUS 5-agents 적대리뷰 + 라이브 QA + SONNET5 fix → CODEX SOL 5.6 5-agents 리뷰 + LUNA fix → 수렴까지 반복 → PM 종합 + CI green → 머지. 두 검증 스테이지는 **순차**.
- **리뷰 fix 는 이 PR 안에서 처리한다.** 별도 PR/후속 이슈 분리 금지. **새 이슈 등록은 사전 허락 필수.**
- **범위 점증 감시**: 이 슬라이스는 드리프트 8행 중 `H-03-PANEL-LOCK` 1건과 목록 밖 별도 1건(`C-02-I-HOSE`)만 다룬다(🚨 R1 정정: "8건 중 2건"이 아니라 "8행 중 1건 + 별도 1건"). 리뷰가 나머지 7건을 지적하면 **범위 밖**으로 기록하고 고치지 않는다. 고치기 시작하면 정식 리뷰 재가동 대상이 된다([[feedback_expanded_scope_reinstate_review]]).
- **바운드**: 3라운드 이상에서 "fix 가 새 결함" 이 반복되면 개발책임자께 바운드 옵션을 제시한다([[feedback_pm_regulate_slice_effort]]).

## 부록 B — 적대검증 브리핑에 반드시 넣을 것

1. **네 조합 전부 물어라** — 결함 1 은 전역 ON × 칩 OFF 조합이 가장 흔한 실 경로다. 이슈 문구("I형 선택 시")만 보고 한 조합만 재현하면 놓친다.
2. **5계열 전부 물어라** — 결함 2 는 판넬만이 아니다. 호스·리모컨·발통·분기관도 같이 잃는다.
3. **"표시" 가 아니라 "조작" 을 측정하라** — 수량 칸이 보이는 것과 입력이 남는 것은 다른 질문이다([[feedback_measure_display_vs_interaction]]).
4. **실 API/실 화면으로 재현하라** — 하네스 입력으로만 재현하면 "실 경로가 만들 수 없는 상태" 를 검증하게 된다([[feedback_fixture_must_be_reachable_by_real_path]]).
5. **무훼손 목록을 세어라** — 스펙 §8 F-1/F-2 값이 하나라도 움직였는지 실제로 실행해 대조한다.
