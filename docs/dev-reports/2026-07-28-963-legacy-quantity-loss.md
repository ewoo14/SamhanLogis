# PR #967 `[FIX] #963 레거시 GAS 수량 계산 결함 2건`

구현 담당: CODEX LUNA 5.6. 이 워크트리에서는 파일 수정만 수행했으며 git 조작, push, PR/Issue 등록은 수행하지 않았다.

## 1. 결정 반영

- D-1: 전역 `SHOW_I_HOSE=true`이면 상업멀티 1WAY는 화면칩과 무관하게 I형을 선택한다. 견적의 상업 계산 블록은 L형을 `HOSE_1W` 권위로 고정하고 전역 플래그를 우선한다.
- D-2: 주문 홈멀티도 견적과 같이 사용자가 직접 입력한 파생 수량을 보존한다. 판넬·호스·리모컨·분기관·발통을 각각 잠근다.
- D-3: 저장된 문서 금액을 재계산하거나 소급 변경하는 코드는 추가하지 않았다. (🚨 R1 정정 — 이 줄은 원래 "snapshot 복원 시 수동 잠금은 새 UI 세션의 상태로 승계하지 않는다"였다. 이는 R1 게이트 B[HIGH] 그 자체였다: `takeSnapshot`이 `HOME_MANUAL_*`을 직렬화하지 않아 저장한 수동수량이 복원 시 자동값으로 덮였다. §8 참조 — 신규 저장분은 잠금을 직렬화·복원해 보존하고, 잠금 필드가 없는 **기존** 저장분만 이 fix 이전과 동일하게 승계하지 않는다.)

## 2. RED → GREEN → mutation RED

### 결함 1 — RED 원문

수정 전 실패 테스트를 먼저 추가하고 실행했다.

```text
FAIL test/legacy-quantity-golden.test.js
  ● ... 전역 I형=true · 화면칩 I형=true...
    expected i1w 2, received 0
  ● ... 전역 I형=true · 화면칩 I형=false...
    expected i1w 2, received 0
Test Suites: 1 failed, 1 total
Tests:       2 failed, 71 passed, 73 total
```

### 결함 2 — RED 원문

주문 앱 의존성을 설치한 뒤 동일 경계 테스트를 실행했다. (의존성 설치는 `node_modules`만 만들었고 추적 파일은 수정하지 않았다.)

```text
 RUN v2.1.9
src/__tests__/legacy-quantity-golden.test.ts (73 tests | 5 failed)
× 결함2: panel expected2 to be77
× 결함2: hose expected2 to be77
× 결함2: remote expected3 to be77
× 결함2: foot expected2 to be77
× 결함2: branch expected undefined to be77
Test Files 1 failed
Tests 5 failed | 68 passed (73)
```

### GREEN 원문

```text
[견적 결함1] Test Suites: 1 passed, 1 total; Tests: 69 skipped, 4 passed, 73 total
[주문 결함2] Test Files 1 passed (1); Tests 5 passed, 68 skipped (73)

[전체 견적] Test Suites: 1 passed, 1 total; Tests: 73 passed, 73 total
[전체 주문] Test Files 1 passed (1); Tests: 73 passed, 73 total
```

### mutation RED 원문

```text
[견적 LEGACY_MUTATION=legacy-963-hose-alias]
Tests: 1 failed, 73 passed, 74 total
Expected: FH-LFHIF: 2
Received: FH-LFHIF omitted (0)

[주문 LEGACY_MUTATION=legacy-963-home-manual]
Tests 1 failed | 73 passed (74)
- Expected: PC1MWSK3NW: 9
+ Received: PC1MWSK3NW omitted (0)
```

두 mutation 모두 fix를 되돌리면 새 실패가 재현된다.

## 3. golden diff 귀속

PR base `main`과 최종 파일을 읽기 전용으로 대조했으며, golden 값 변경은 아래 2줄뿐이다. 공백/포맷만으로 발생한 golden 전수 변경은 남기지 않았다.

| 파일/fixture | 변경 | 귀속 |
|---|---|---|
| `estimateOptionGoldens['C-02-I-HOSE']` | `FH-LFHIF` 없음 → `FH-LFHIF: 2` | 결함 1: 전역 I형 우선으로 1WAY source 2가 I형 target에 보존됨 |
| `orderOptionGoldens['H-03-PANEL-LOCK']` | `PC1MWSK3NW: 1` → `9` | 결함 2: 주문 홈 판넬 수동잠금 보존 |
| `goldens.js` 주석 4줄 → 1줄 | 주문도 수동 파생 수량을 보존한다는 현재 사실 반영 | 결함 2/D-2 문서화. 계산값 산출물 아님 |

`C-02-I-HOSE` 주문 golden, 4WAY 값, 나머지 모든 family/option golden은 값이 변하지 않았다. 따라서 golden diff의 모든 값 변경은 이번 두 fix로 귀속된다.

## 4. 회귀 울타리 실행

`probe2.js` 결과:

- 유연호스 제외: 전역 OFF/ON·견적/주문 모두 기존처럼 1WAY L/I가 0.
- `COMM_MANUAL_HOSE` 42 잠금: 두 앱·전역 OFF/ON 모두 I형 42 보존.
- golden 전수: 20 family × 2 앱 + option 45건 × 2 앱, 불일치 `0`.
- C-09 7개 fixture와 cap `null`/`0`: 기존 출력 유지.
- 상업 panel/pump 수동잠금: 55 보존. 상업 remote는 기존 probe 결과 3을 유지.
- `tools/legacy-gas/**`: 무접촉.

## 5. 계열 sweep

- 결함 1: 견적 상업 1WAY 블록(`index.ejs:8379-8391`)에서 `hose1L`은 `HOSE_1W`, I형은 `HOSE_I_1W`로 단일 권위를 사용한다. `pickHoseModel('1way')`와 `HOSE_I_1W`가 연속으로 같은 target을 덮는 패턴은 제거했다. 주문은 기존부터 `pickHoseModel('1way')` 한 경로를 사용한다. 4WAY는 양 앱 모두 기존 `pickHoseModel('4way')` 경로를 보존했다.
- 결함 2: 주문 홈 파생 5계열을 모두 sweep했다: 판넬 `HOME_MANUAL_PANEL`/`setP`, 호스 `HOME_MANUAL_HOSE`/`setH`, 리모컨 `HOME_MANUAL_REMOTE`/`setR`, 분기관 `HOME_MANUAL_BRANCH`/`setB`, 발통 `HOME_MANUAL_FOOT`. 초기화·옵션 재계산·판넬 치환·snapshot 복원·리셋 경로도 함께 확인했다.

## 6. 변경 파일 및 줄 수

PR base `main` 대비 line diff 기준이다.

| 파일 | 줄 수 | 이유 |
|---|---:|---|
| `clients/web/estimate-app/views/index.ejs` | `+2/-2` | 상업 1WAY 권위와 전역 우선 수정 |
| `clients/web/order-app/index.html` | `+75/-41` | 5계열 잠금 집합·입력 분류·재계산 guard·복원/리셋 처리. 기존 압축 one-line 함수 때문에 대체 줄 수가 크다 |
| `clients/web/legacy-quantity-golden/legacyQuantityBoundary.js` | `+10/-5` | fixture의 manualLocks를 실제 `onHomeQtyInput` 경로로 통과 |
| `clients/web/estimate-app/test/legacy-quantity-golden.test.js` | `+33/-2` | 결함1 4조합, mutation, 수렴 assertion |
| `clients/web/order-app/src/__tests__/legacy-quantity-golden.test.ts` | `+24/-1` | 결함2 5계열, mutation, 수렴 assertion |
| `clients/web/legacy-quantity-golden/goldens.js` | `+3/-6` | 두 값 변경 + stale 주석 교체 |

문서 동기화 diff:

| 파일 | 줄 수 | 이유 |
|---|---:|---|
| `docs/superpowers/specs/2026-07-27-896-survey.md` | `+8/-2` | D-2 결정 #7 및 drift 보정 |
| `docs/dev-reports/2026-07-27-896-s1-golden-baseline.md` | `+16/-8` | §6-1·§6-3·§13.4 historical baseline 보정 |
| `README.md` | `+4/-0` | 사용자 문서 요약 |
| `ROADMAP.md` | `+3/-1` | 로드맵 상태 |
| `docs/samhan-public-overview.html` | `+1/-0` | Overview 배지 |
| `docs/handoff/CURRENT-WORK.md` | `+7/-0` | 세션 handoff |
| 본 보고서 | 신규 파일 | RED/GREEN/mutation·golden·회귀·누락 기록 |

문서 변경은 이 보고서와 D-2 보정 기록에 한정했다. `tools/legacy-gas/**`와 백엔드/DB schema는 변경하지 않았다.

## 7. 못 한 것

- 운영 blob/저장 주문 초안의 실제 건수는 로컬·권한 범위에 운영 DB가 없어 측정하지 못했다. D-3에 따라 복원/확정 문서 금액을 소급하지 않았다.
- 브라우저 실서버 QA와 GitHub CI 전체 실행은 이 구현 세션에서 수행하지 못했다. 로컬 Jest/Vitest golden과 계측 probe만 실행했다.
- PR comment/commit/push/merge는 사용자 지시에 따라 수행하지 않았다.

### 계수 주의

기존 `#896` §13.4 원문은 8개 행이고, §6-3의 `C-02-I-HOSE`는 별도 추가 drift로 기록되어 있다. 이번 fix는 그 8개 중 `H-03-PANEL-LOCK` 1건과 별도 추가 drift 1건을 해소하므로, 원문 8행 중 남는 distinct는 7개다. 기획 문서의 “8→6” 표현은 두 목록을 한 번 중복 집계한 것으로 보여, 코드/보고서는 실제 실행 결과인 “7개 유지 + 별도 1개 수렴”으로 기록했다.

## 8. R1 라운드 — 적대검증 게이트 2건 fix + 증거 정정 종합 (SONNET5, PR #967 R1)

R1 적대검증(OPUS 발견 2 + SONNET5 대조 1)이 이 fix 자체가 만든 HIGH 결함 2건을 찾았다. 둘 다 `HOME_MANUAL_*`(홈 파생 5계열 수동잠금) 관련이며 금액에 직접 영향을 준다. 아래는 그 fix 기록이다.

### 8.1 게이트 A[HIGH] — 파생 수량 칸을 지우면 0에 영구 잠김

`onHomeQtyInput`(`index.html:4864-4887`)이 `HOME_MANUAL_*.add(model)`만 하고 `delete`가 없어, 칸을 지워도(v=0) 잠금이 풀리지 않고 다음 재계산이 자동값으로 복귀하지 못했다. 견적 앱(`index.ejs:5966-5973`)에는 이미 있는 `raw===''`→`delete` 규칙이 이식 시 누락된 것(D-2 대칭 위반).

**RED 원문**(`npx vitest run src/__tests__/homeManualLockRestore.test.ts`, fix 전):
```text
✗ 판넬 — 수동 입력 후 칸을 지우면 잠금이 풀리고 재계산이 자동값으로 복귀한다
  expected true to be false  // lockedAfterClear
✗ 호스 — 〃      ✗ 리모컨 — 〃      ✗ 분기관 — 〃      ✗ 발통 — 〃
Tests  10 failed | 6 passed (16)   ← fix 전 최초 실행. 10 실패 = 게이트 A 5계열 + 게이트 B "신규 저장분" 5계열(§8.2). 6 통과 = 회귀 1 + D-3 5(레거시 스냅샷은 이미 정확했다)
```

**fix** — `add`/`delete`를 `v`(clear 시 0, 이 코드베이스는 `bindQty`가 이미 "빈칸=0"으로 정규화해 clear 신호를 통일해 둠)로 분기:
```js
if(v){ /* 기존 add 5분기 */ } else { /* 신규 delete 5분기 — 견적과 대칭 */ }
```

**GREEN**: 16/16 passed. **뮤테이션 RED**(delete 분기만 원복) → 정확히 5계열 5건만 재실패, 나머지 11건은 무관하게 GREEN 유지(격리 확인) → fix 재적용 → 16/16 GREEN 재확인.

### 8.2 게이트 B[HIGH] — 저장내역 복원 시 수동수량이 자동값으로 덮임

`takeSnapshot()`(`:8740-8773`)이 `HOME_MANUAL_*`을 직렬화하지 않고, `applySnapshot()`(`:9031-9101`)이 `clearHomeManualLocks()`로 잠금을 비운 뒤 `recomputeHomeDerived(true)`를 불러 저장한 수동수량을 자동값으로 덮었다(#963 증상 그대로 재현).

**RED 원문**: `anyLockSerialized` 5계열 전부 `false`(기대 `true`), 5건 실패.

**fix** — `takeSnapshot`의 `core`에 `homeManualPanel/Hose/Remote/Branch/Foot: Array.from(HOME_MANUAL_*)` 5필드 추가, `applySnapshot`에 `Array.isArray` 가드 복원 헬퍼 추가(기존 `absoluteLock` 복원과 동일 패턴). **D-3 준수** — 잠금 필드가 없는 기존 저장분은 `Array.isArray`가 `false`라 복원되지 않고 `clearHomeManualLocks()`가 비운 채 유지 → 이 fix 이전과 동일 동작(회귀 테스트 "D-3" 5건으로 확인, fix 전부터 GREEN이었고 fix 후에도 GREEN 유지).

**GREEN**: 16/16 passed. **뮤테이션 RED**(직렬화 5필드 + 복원 블록만 원복) → 정확히 "신규 저장분" 5건만 재실패, 나머지(게이트 A 5건 + D-3 5건 + 회귀 1건) 11건은 GREEN 유지 → fix 재적용 → 16/16 GREEN 재확인.

### 8.3 계열 전수 sweep

① **`HOME_MANUAL_*` 읽기/쓰기 전 지점** — `grep -n HOME_MANUAL_ index.html` 33건 재확인. 쓰기: 선언 5(`:2814-2818`) · `clearHomeManualLocks` 5(`:2821-2825`) · `onHomeQtyInput` add 5 + 신규 delete 5(`:4878-4889`) · `takeSnapshot` 직렬화 5(`:8774-8778`, 신규) · `applySnapshot` 복원 5(`:9078-9082`, 신규). 읽기(가드): `clearAllPanels`/`clearAllRemotes`(`:1624,1627`) · `recomputeFootAll`(`:4953-4954`) · `recomputeHomePanels`의 `setP`(`:5073`,`:5191`) · `recomputeHomeRemotes`의 `setR`(`:5200`) · `recomputeHomeBranches`의 `setB`(`:5254`) · `recomputeHomeDerived`의 `setH`(`:5307`) = 파생 write 8지점 전부 이번 fix로 그대로(diff에 없음), 미가드 0건. `onHomeQtyInput`은 오직 `bindQty('#homeBody .qty-input', onHomeQtyInput)`(`:3887`) 한 곳에서만 실 유저 keystroke로 호출됨(내부 재계산 함수가 스스로 호출하는 경로 없음) — 신규 delete 분기가 자동 재계산 중 의도치 않게 발화할 위험 없음.
② **`takeSnapshot`/`applySnapshot` 직렬화 상태 중 재계산이 덮는 것이 더 있는지** — `singleQty`/`commQty`는 각각 `recomputeSingleBaseFoot`/`recomputeCommDerived`가 복원 후 재계산한다. `commQty`에는 `COMM_MANUAL_PANEL/HOSE/REMOTE/PUMP/BASE` 5개 Set이 **이미 이 PR 이전부터 존재**하지만(`:2272-2276`), `takeSnapshot`/`applySnapshot`은 이를 직렬화·복원하지 않는다 — 구조적으로 게이트 B와 동형이나 **이 PR이 만든 것이 아니고**(diff 미포함, `git diff 6566eb429..8e84e4f78`로 확인) R1 게이트로 지정되지도 않아 **고치지 않았다**. `singleQty`에는 대응하는 `SINGLE_MANUAL_*` 개념 자체가 주문 앱에 없다(§8.3③).
③ **견적에는 있는데 주문에 없는 잠금 규칙** — 견적(`index.ejs`)에는 주문에 없는 `SINGLE_MANUAL_PANEL/REMOTE/BASE`(`:10168-10170`)가 있고, `takeSnapshot`류 함수(`:16788-16798`,`:16875-16885`)가 `HOME_MANUAL_*`뿐 아니라 `COMM_MANUAL_*`까지 이미 직렬화·복원한다 — 주문 앱의 스냅샷은 이번 fix로 `HOME_MANUAL_*`만 견적 수준에 맞췄고, `COMM_MANUAL_*`/`SINGLE_MANUAL_*`는 아직 아니다.

**PM 판단 필요**: ②③에서 발견한 `COMM_MANUAL_*`(add-only + 미직렬화)·`SINGLE_MANUAL_*`(주문 앱 부재)는 R1 게이트(HOME 계열 2건)와 **동일 패턴**이지만 **이 PR이 만든 결함이 아니라 선재 상태**이고 사전 허락 없는 새 이슈 등록은 금지돼 있어 **고치지 않고 보고만 한다.**

### 8.4 회귀 울타리 7항목

| # | 항목 | 결과 |
|---|---|---|
| 1 | fix 목적(수동 보존) 5계열 | GREEN (`homeManualLockRestore.test.ts` "회귀 울타리" + 결함 A 5건 `valueAfterManualInput`) |
| 2 | 주문 golden 73/73 · 견적 golden 73/73 | 둘 다 재실행 재확인(`order-app` vitest 118/118 총, `estimate-app` jest 175/175 총, 그중 golden 각 73/73) |
| 3 | 파생 write 8지점 가드 유지 | §8.3① — diff에 미포함, 그대로 |
| 4 | 잠금 누수 없음 | 해제 지점이 기존 2곳(`btnResetHome`·`applySnapshot` 상단)에 `onHomeQtyInput`의 신규 delete 분기 1곳이 **의도적으로** 추가됨(I-1 자체가 요구하는 3번째 해제 지점) — `onHomeQtyInput`이 실 keystroke 외 경로로 호출되지 않아(§8.3①) 세션 간 이월 위험 없음 |
| 5 | 공청 4WAY 치환 가드·제외 옵션 견적과 동일 | 미접촉(diff 3개 hunk가 `onHomeQtyInput`·`takeSnapshot`·`applySnapshot`뿐, `recomputeHomePanels` 등 가드 로직 무변경) |
| 6 | `tools/legacy-gas/**` 무접촉 | 확인(수정 파일 목록에 없음) |
| 7 | 견적 앱 실 경로 무영향(BASE==HEAD) | estimate-app 파일 0건 수정 — 자동 성립 |

`npm run typecheck`(order-app, `tsc --noEmit`) 에러 0.

### 8.5 정정 A·B·C·D 반영 위치

- **정정 A**(드리프트 "8→6" 계수 오류) — `docs/dev-reports/2026-07-28-963-legacy-quantity-loss.md`·`docs/dev-reports/2026-07-27-896-s1-golden-baseline.md`§14·`docs/superpowers/specs/2026-07-27-896-survey.md`§11.1 은 **이미 자체 정정**돼 있었음(재확인만, 미수정). 아직 오기가 남아 있던 `docs/superpowers/specs/2026-07-28-963-legacy-quantity-loss-spec.md`(§2·§7·§8, 5곳) · `docs/superpowers/plans/2026-07-28-963-legacy-quantity-loss.md`(3곳)를 "8행 중 1건 해소·7건 유지 + 목록 밖 별도 1건 수렴"으로 정정.
- **정정 B**(ROADMAP.md 줄수) — 본 보고서 §6 표 `+2/-0`→`+3/-1`(`git diff 6566eb429..8e84e4f78 --numstat -- ROADMAP.md` = `3 1` 실측 일치).
- **정정 C**(견적 fix 성격 재정의) — spec.md §1.1 말미에 "R1 정정" 블록 추가: `applyConfigFromServer`(견적 호출 0건) 미도달 사실, "259개 중 30개(11.6%) 전부 결함 경로" 주장이 견적에서 성립하지 않고 실제로 자동 반영되는 건 홈 칩뿐이라는 점, PM 판정("현재 실 경로 미도달, 배선 시 도달" — 견적 fix 유지)을 명시. D-1 절의 동일 주장(§5)에도 교차 각주 추가.
- **정정 D**(U-gate 문구) — spec.md §11 시나리오 4번을 "수량이 소스대로 실린다"로 좁히고, 원 문구("합계 금액에 반영")가 `FH-LFHIF` 마스터 단가 0원(선재·무결성 도메인·개발책임자 보고 완료) 때문에 실측 실패한다는 각주 추가.
- 부수 정정 — 본 보고서 §1 D-3 설명이 게이트 B 그 자체(수동 잠금 미승계)를 "의도된 동작"처럼 서술하고 있어, fix 후 정확한 서술("신규 저장분은 보존, 잠금 필드 없는 기존 저장분만 미승계")로 교체.

### 8.6 변경 파일 및 줄 수 (R1 라운드분, `git diff` 실측)

| 파일 | 줄 수 | 이유 |
|---|---:|---|
| `clients/web/order-app/index.html` | `+29/-6` | 게이트 A(`onHomeQtyInput` add/delete 분기, 3줄→12줄) + 게이트 B(`takeSnapshot` core 5필드, `applySnapshot` 복원 5필드+가드) |
| `clients/web/order-app/src/__tests__/homeManualLockHarness.cjs` | 신규 226줄 | 정본 함수(`onHomeQtyInput`/`recomputeHomeDerived`/`takeSnapshot`/`applySnapshot`/`clearHomeManualLocks`) 추출·실행 전용 harness. `.cjs`인 이유: `order-app/package.json`이 `"type":"module"`이라 `.js`는 ESM으로 처리돼 `require`가 죽는다 |
| `clients/web/order-app/src/__tests__/homeManualLockRestore.test.ts` | 신규 89줄 | 게이트 A·B RED-first 테스트, 5계열×2 + D-3 5계열 + 회귀 1건 = 16 케이스 |
| `docs/dev-reports/2026-07-28-963-legacy-quantity-loss.md`(본 파일) | `+84/-2` | §1 D-3 정정(1줄) + 본 §8 전체 신규 작성(R1 게이트 fix·sweep·회귀·정정 기록) |
| `docs/superpowers/specs/2026-07-28-963-legacy-quantity-loss-spec.md` | `+10/-7` | 정정 A(5곳)·C(2곳)·D(1곳) |
| `docs/superpowers/plans/2026-07-28-963-legacy-quantity-loss.md` | `+3/-3` | 정정 A(3곳) |

`legacyQuantityBoundary.js`·`fixtures.js`·`goldens.js`·`legacy-quantity-golden.test.{js,ts}`(견적·주문 공유 golden 하네스)는 **미접촉** — 신규 harness가 그 exports(`extractFunctionSource`/`derivationPreambleSource`/`SOURCE_PATH`)만 읽기 전용으로 재사용한다.

### 8.7 이번 라운드에서 못 한 것

- §8.3②③에서 발견한 `COMM_MANUAL_*`(상업멀티, add-only 미직렬화)·`SINGLE_MANUAL_*`(주문 앱 부재)는 게이트 A·B와 동일 패턴이지만 **선재 상태이고 이 PR·이 라운드의 게이트가 아니라 고치지 않았다.** 새 이슈도 등록하지 않았다(사전 허락 필요) — PM 보고용으로만 남긴다.
- 운영 DB의 실제 저장내역(`partner_order_drafts`) 중 잠금 필드 없는 기존 스냅샷 건수는 로컬 개발 DB만 확인했다(R1과 동일한 한계, §7 기존 기록과 동일).
- 서버 저장 API→저장내역 목록→복원의 브라우저 왕복 라이브 QA는 이번 라운드에서 수행하지 않았다(R1이 이미 같은 사유로 스킵한 것과 동일 — 거래처 인증 게이트, 공유 실데이터 write 회피). `takeSnapshot()`/`applySnapshot()` 정본 함수를 직접 호출하는 방식으로 대체했다.
