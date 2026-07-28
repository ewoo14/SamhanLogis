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

## 9. R2 라운드 — 신규 도달가능 결함 6건 fix + 7000→8000 + 최신 GAS 재대조 (SONNET5, PR #967 R2)

R2 적대검증(OPUS 발견 1 + SONNET5 대조 1 + PM 직접 라이브QA)이 신규 도달 가능 결함 6건(G-1~G-6)을 찾았다. PM 판정: G-3/G-4/G-5/G-6은 이 PR(D-2 대칭 이식)의 회귀, G-1/G-2는 §8.3②에서 이미 발견됐던 선재 결함을 흡수 게이트로 전환한 것. 세 뿌리로 묶어 고쳤다. 작업 도중 개발책임자가 `clasp`로 최신 GAS 스냅샷(2026-06-10 저장소 스냅샷보다 최신)을 받아와 두 과제를 추가 지시했다: I형 유연호스 고정단가 `7000→8000`, 그리고 이슈 #963 견적 절반(결함 1)의 최신 GAS 재대조.

### 9.1 뿌리 매핑

| 뿌리 | 결함 | 원인 |
|---|---|---|
| **① 옵션 컨트롤이 계열 잠금을 못 비움** | G-3[MED·회귀], G-6[LOW-MED] | `renderHomeOptions`의 change 리스너가 `recomputeHomeDerived(true)`만 부르고 `HOME_MANUAL_*`을 비우지 않아, 사용자가 명시적으로 고른 "판넬제외·유연호스 제외·리모컨 제외·분기관 제외·공청↔기본 판넬 치환"이 개별 잠금에 막혔다(U-1 위반) |
| **② 상업멀티에 홈멀티 R1 fix 미이식** | G-1[HIGH], G-2[HIGH] | `takeSnapshot`/`applySnapshot`이 `COMM_MANUAL_*`을 직렬화·복원하지 않고(G-1), `bindCommQtyEvents`의 잠금 로직이 add-only이며 `btnResetComm`에 잠금 해제 호출이 없었다(G-2) — §8.3②에서 이미 발견했던 것과 동일 패턴 |
| **③ D-2 비대칭(0 잠금 불가·표시 없음)** | G-4[MED], G-5[MED] | `bindQty`가 raw==='' (지움)과 raw==='0'(명시적 0)을 구분하지 않고 둘 다 v=0으로 뭉갰고(G-5), 잠금 상태를 화면에 표시하는 코드가 주문앱에 전혀 없었다(G-4) |

### 9.2 fix — 뿌리 단위

**뿌리①** — `onHomeOptionChange(controlId)`(신규, `index.html:4964-4980`, 주석 4964-4969·함수본문 4970-4980)를 추가해 컨트롤 id→해당 `HOME_MANUAL_*` Set 매핑을 `clear()`한 뒤 `recomputeHomeDerived(true)`를 부른다. `renderHomeOptions`의 이벤트 바인딩(`:4993`)을 이 함수 호출 1줄로 통일했다(기존 `home_remote` 특례 분기 2줄 제거). **계열 sweep으로 `home_foot`(발통포함) 도 같은 결함 패턴임을 확인해 함께 포함**했다(보고 대상 G-3/G-6엔 없었지만 같은 코드 블록·같은 근본 원인).

**뿌리②** — `applyCommManualLock(rec, model, q)`(신규, `:2909-2921`, 주석 2909-2911·함수본문 2912-2921)가 `bindCommQtyEvents`의 인라인 add-only 로직을 대체(`q`truthy면 add, falsy면 delete — 홈멀티 `onHomeQtyInput`과 대칭). `clearCommManualLocks()`(신규, `:2828-2837`, 주석 2828-2830·함수본문 2831-2837)가 `clearHomeManualLocks`의 comm 대칭으로 5계열을 비우며, `btnResetComm`(`:6388`)과 `applySnapshot` 최상단(`:9134`)에서 호출한다. `takeSnapshot`(`:8855-8859`)이 `commManualPanel/Hose/Remote/Pump/Base` 5필드를 추가 직렬화하고, `applySnapshot`(`:9169-9173`)이 기존 `resLock` 헬퍼(D-3 `Array.isArray` 가드 재사용, 신규 코드 추가 없음)로 복원한다.

**뿌리③** — `bindQty`(`:2891-2900`)가 `raw=String(value).replace(/[^\d]/g,'')`로 원본 문자열을 먼저 판정해 `explicit=(raw!=='')`를 `onChange`의 3번째 인자로 넘긴다. `onHomeQtyInput`(`:4908`, 시그니처에 3번째 인자 `explicit` 추가)이 이를 받아 `shouldLock=(explicit!==undefined)?explicit:!!v`(`:4921`)로 판정(2-인자 레거시 호출은 `explicit===undefined`라 기존 `!!v` 동작으로 폴백 — 하위호환). `isHomeManualLocked(row,model)`(신규, `:4891-4902`, 주석 4891-4893·함수본문 4894-4902)이 `onHomeQtyInput`의 isP/isR/isH/isB/isF 판정·정규식을 그대로 공유해 화면 렌더(입력창 생성 `:3891-3896`·`syncHomeUIFromState:5695-5703`)와 `onHomeQtyInput` 자신(방금 편집한 칸의 즉시 스타일 반영, `:4936-4943` — `syncHomeUIFromState`를 부르지 않는 분기라 별도 처리 필요)에서 `color:#2563eb;font-weight:bold` 를 적용한다(견적 앱 `index.ejs:5861-5863`·`5966-5973`·`8647-8664` 대칭).

### 9.3 RED → GREEN → mutation RED

vm 기반 신규 harness 3개(정본 함수를 파일에서 그대로 추출·실행 — 재구현 아님)로 RED-first 진행했다. 공유 golden 하네스(`legacyQuantityBoundary.js`/`fixtures.js`/`goldens.js`/`legacy-quantity-golden.test.{js,ts}`)와 R1의 `homeManualLockHarness.cjs`는 건드리지 않고 export만 재사용했다(단, `homeManualLockHarness.cjs`의 `runSnapshotRoundtrip`은 `takeSnapshot`/`applySnapshot`이 이제 `COMM_MANUAL_*`/`clearCommManualLocks`를 참조하므로 **빈 Set 5개 + 함수 1개를 스코프에 추가**하지 않으면 `ReferenceError`로 죽는다 — R1 테스트 16개를 그대로 통과시키기 위한 필수 보정, §9.7 참조).

**G-1/G-2 RED**(`commManualLockRestore.test.ts`, fix 전 — `applyCommManualLock`이 없어 즉시 추출 실패):
```text
FAIL src/__tests__/commManualLockRestore.test.ts (20 tests)
Error: applyCommManualLock 함수를 찾을 수 없습니다.
  at extractFunctionSource legacyQuantityBoundary.js:15:24
Tests  20 failed | 0 passed (20)
```

**G-3/G-5/G-6 RED**(`homeOptionAndZeroLockRestore.test.ts`, fix 전):
```text
Error: onHomeOptionChange 함수를 찾을 수 없습니다.   ← G-3 5건 + G-6 1건
AssertionError: expected false to be true            ← G-5 "명시적 0" 1건
Tests  8 failed | 2 passed (10)   (통과한 2건은 "칸을 진짜 지움"·"2-인자 레거시" —
                                     이 fix 이후에도 항상 성립해야 하는 회귀 울타리라
                                     RED 이전에도 원래 GREEN이어야 정상)
```

**GREEN**(fix 후, 전체):
```text
order-app: Test Files 12 passed (12) / Tests 148 passed (148)
  ├ commManualLockRestore.test.ts        20 passed  (G-1/G-2)
  ├ homeOptionAndZeroLockRestore.test.ts 10 passed  (G-3/G-5/G-6)
  ├ homeManualLockRestore.test.ts        16 passed  (R1 회귀 — 무변화)
  └ legacy-quantity-golden.test.ts       73 passed  (골든 — 무변화)
estimate-app: Test Suites 8 passed (8) / Tests 175 passed (175)  (7000→8000 이후 재확인)
tsc --noEmit: 에러 0
```

**뮤테이션 RED**(9건, fix를 조각 단위로 원복 → 해당 결함만 재현 → 원복 취소 → 재확인. `sourceMutator` 훅으로 소스 텍스트를 in-memory 치환했을 뿐 파일은 건드리지 않았다):

```text
[뮤테이션1] onHomeOptionChange 의 lockSet.clear() 제거
  G-3 판넬제외 valueAfterOptionChange: 9 (fix면 0)      ← 재현
  G-6 (d4) 이중계상: {from:5,to:2} (fix면 {from:5,to:0}) ← 재현
[뮤테이션2] applyCommManualLock 의 method 를 항상 'add' 로 고정
  G-2 칸지움 lockedAfterClear: true (fix면 false)        ← 재현
[뮤테이션3] clearCommManualLocks 를 no-op 으로
  G-2 초기화 lockedAfterReset: true (fix면 false)         ← 재현
[뮤테이션4] takeSnapshot 의 commManual* 직렬화 5줄 제거
  G-1 anyLockSerialized: false (fix면 true)               ← 재현
[뮤테이션5] onHomeQtyInput 의 shouldLock 을 항상 !!v 로
  G-5 lockedAfterExplicitZero: false (fix면 true)         ← 재현
  (회귀 2건은 뮤테이션에도 안전 — lockedAfterRealClear/lockedAfterLegacyTwoArgClear 그대로 false)
총 9건 — PASS(=뮤테이션이 기대대로 결함을 재현) 9 / FAIL 0
```

### 9.4 라이브 QA — 실 브라우저(Docker 실서버, GET만)

R2 자체가 923bc79d1(fix 전)에서 t5(G-3/G-6)·t7(G-1 잠금누수)·t8(G-2)·t3b(G-1 저장복원) 로 이미 RED를 실측해 뒀으므로(스크래치패드 `967-r2/`), 이번 라운드는 **같은 시나리오를 fix 후 코드로 재실행해 GREEN을 확인**했다. `npx vite --port 5405`(`VITE_API_BASE_URL=http://localhost:8080/api/v1` 절대경로 — dev 서버에 `/api/v1` proxy 규칙이 없어 상대경로는 vite 자체 SPA fallback 에 걸려 `Accept:application/json` 요청이 404로 죽는다는 것을 진단으로 확인, §9.9 기록) + Playwright(headless chromium) 로 판넬/전 실서버(Docker 22개 컨테이너 healthy) 대상 실행했다.

```text
G-3 사전조건: 수동 판넬9/호스7/리모컨6 잠금             PASS
G-3 GREEN: 4종 제외 선택 후 판넬/호스/리모컨 모두 0(빈칸) PASS  {"PC1MWSK3NW":"","FH-LFHLF":"","AR-EC05":""}
G-3 GREEN: 잠금도 전부 해제                              PASS
G-3 GREEN: 발송행에 판넬/호스/리모컨 없음(실내기만)       PASS
G-6 GREEN: 기본판넬 복귀 시 이중계상 없음(from=5,to=0)    PASS  {"PC4NUFK1NW":"5","PC4NUCK4NW":""}
G-6 GREEN: 다시 공청판넬 시 치환 고착 없음(to=5)          PASS
G-5 GREEN: "0" 명시 입력 후 칸에 0이 보임(빈칸 아님)      PASS  {"value":"0","locked":true}
G-4 GREEN: 잠금 중인 칸이 파란 굵은 글씨로 표시됨         PASS  {"color":"rgb(37, 99, 235)","fontWeight":"bold"}
G-5 GREEN: 실내기 변경 후에도 0-잠금 유지                 PASS  (자동값 7로 안 돌아옴)
회귀울타리 GREEN: 진짜로 지우면 잠금 해제+자동값(9) 복귀  PASS
G-2 GREEN: 칸 지운 직후 잠금 해제(add-only 버그 종료)     PASS
G-2 GREEN: 실내기 변경 후 판넬 자동복귀(7)                PASS
G-2 GREEN: 초기화 버튼이 잠금을 비움                      PASS  (panel/hose/remote/pump/base 전부 [])
G-2 GREEN: 초기화 후 실내기 5 입력 시 판넬 자동 5         PASS  (새로고침 없이 회복)
G-1 GREEN: takeSnapshot 이 commManualPanel 을 직렬화      PASS  ["PC1MWSK3NW"]
G-1 GREEN: 신선 세션 복원 후 판넬 13 보존                 PASS  (자동값으로 안 덮임)

총 20건 — PASS 20 / FAIL 0. pageerror 0. 스크린샷 7장(G3/G4-G5/G6/G1/G2 각 단계).
```

DB write는 0(`takeSnapshot()`/`applySnapshot()` 정본 함수를 client 메모리에서 직접 호출 — 서버 저장 API를 부르지 않았다). 앱의 GET만 사용했다.

### 9.5 계열 전수 sweep

① **`HOME_MANUAL_*`/`COMM_MANUAL_*` 읽기·쓰기 전 지점** — `grep -n "HOME_MANUAL_\|COMM_MANUAL_"` 68건 재확인. 신규 쓰기: `clearCommManualLocks`(5)·`applyCommManualLock`(5, `[method]` 동적 호출)·`isHomeManualLocked`(5, 읽기)·`onHomeOptionChange`(5, 매핑)·`takeSnapshot`(5)·`applySnapshot`(5). 기존 가드 8지점(`setP/setR/setB/setH` 4개 + `clearAllPanels/clearAllRemotes/recomputeFootAll` 3개 + swap map 1개)은 **diff에 없음 — 전부 그대로**. `recomputeCommDerived`의 최종 반영 가드 5곳(`:5578-5583`)도 무변경.
② **`takeSnapshot`/`applySnapshot`가 직렬화하는 상태 중 재계산이 덮는 게 더 있는지(싱글중대형 포함)** — `singleQty`는 R1 §8.3③에서 이미 확인한 대로 `SINGLE_MANUAL_*` 개념 자체가 주문 앱에 없다(재확인: `grep -c SINGLE_MANUAL index.html` = 0). 이번 라운드가 `COMM_MANUAL_*`을 직렬화·복원하도록 고쳐 R1 §8.3②가 지적한 격차는 닫혔다. **남은 것은 `SINGLE_MANUAL_*` 부재뿐**이며 이는 G-1~G-6 어디에도 게이트되지 않았고 §9.9에 보고만 한다.
③ **잠금이 다른 계열 단위 조작을 막는 곳이 또 있는지** — `renderCommOptions`(`:4152-4160`, 기존)는 이미 comm 5계열 옵션 컨트롤 변경 시 5개 Set을 전부 `clear()`한다(이 PR 이전부터 존재 — comm 쪽엔 G-3류 결함이 아예 없었던 이유). 홈 쪽엔 `home_foot`(발통포함)이 같은 패턴의 미수정 사각지대였고 뿌리① fix에 포함했다(§9.2). 그 외 가드는 모두 개별-모델 write 가드(`setP` 등)이고 계열 단위 컨트롤이 아니다 — 추가 사각지대 없음.

### 9.6 회귀 울타리 7항목

| # | 항목 | 결과 |
|---|---|---|
| 1 | R1 게이트 2건(칸 지움→자동복귀·저장→복원 보존) | GREEN — `homeManualLockRestore.test.ts` 16/16 무변화 |
| 2 | 주문 golden 73/73·견적 golden 73/73·`homeManualLockRestore` 16/16·typecheck 0 | 전부 재확인(§9.3) |
| 3 | 신선 세션 복원(잠금·값·총액 일치)·복원 confirm 취소 시 무변화 | §9.4 라이브 확인(G-1 신선복원) + `applySnapshot` 최상단 `confirm()` 가드 무변경 |
| 4 | 잘못된 타입/없는 모델/`core` 부재 → 예외 0 | `applySnapshot`의 `try/catch`·`Array.isArray` 가드 구조 무변경(§9.2, diff에 로직 삭제 없음 — 라인 추가만) |
| 5 | 구버전 앱이 신규 스냅샷 복원 → `pageerror 0` | 신규 5필드는 `shot.core`의 추가 프로퍼티일 뿐이고 구버전 `applySnapshot`은 읽지 않는 필드를 단순 무시한다(JSON 구조상 안전, R1과 동일 논리) |
| 6 | 섹터 전환·거래처 전환 잠금 누수 0·홈 파생 write 10곳 중 파생 8곳 가드 유지 | §9.5① — 8지점 diff 미포함 확인 |
| 7 | `tools/legacy-gas/**` 무접촉·견적 앱 실 경로 무영향 | `tools/legacy-gas` git status 무출력(무접촉). **견적 앱은 개발책임자 지시로 7000→8000 5줄만 수정**(§9.7) — "무영향" 항목은 이번 라운드부터 "가격 5줄 외 무변화"로 재정의(§9.8) |

### 9.7 변경 파일 및 줄 수 (`git diff --numstat` 실측 + hunk 자동 합산, 뿌리별)

`git diff --numstat`:

| 파일 | 줄 수 |
|---|---:|
| `clients/web/order-app/index.html` | `+118/-27` |
| `clients/web/estimate-app/views/index.ejs` | `+5/-5` |
| `clients/web/order-app/src/__tests__/homeManualLockHarness.cjs` | `+10/-1` |

신규 파일(전량 신규, `wc -l`):

| 파일 | 줄 수 |
|---|---:|
| `clients/web/order-app/src/__tests__/commManualLockHarness.cjs` | 295 |
| `clients/web/order-app/src/__tests__/commManualLockRestore.test.ts` | 92 |
| `clients/web/order-app/src/__tests__/homeOptionAndZeroLockHarness.cjs` | 274 |
| `clients/web/order-app/src/__tests__/homeOptionAndZeroLockRestore.test.ts` | 122 |

`index.html`의 `+118/-27`을 hunk 단위로 자동 집계(스크립트로 `+`/`-` 라인을 셈 — 손 계산 아님, 합계가 `git diff --numstat`과 118/27로 정확히 일치함을 교차검증)해 뿌리별로 귀속:

| 뿌리 | 줄 수 | 비고 |
|---|---:|---|
| **뿌리① (G-3/G-6)** | `+19/-2` | `onHomeOptionChange` 신규(+18/-0) + `renderHomeOptions` 바인딩 교체(+1/-2) |
| **뿌리② (G-1/G-2)** | `+43/-10` | `clearCommManualLocks`(+11/-0) + `applyCommManualLock`(+14/-0) + `bindCommQtyEvents` 인라인→호출(+1/-8) + `btnResetComm` 호출 추가(+1/-1) + `takeSnapshot` 5필드(+6/-1) + `applySnapshot` 호출 추가(+1/-0) + `applySnapshot` resLock 5호출(+9/-0) |
| **뿌리③ (G-4/G-5)** | `+50/-9` | `bindQty` explicit 판정(+9/-3) + `renderHome` 입력템플릿(+5/-1) + `isHomeManualLocked` 신규+`onHomeQtyInput` 시그니처(+18/-2) + `onHomeQtyInput` shouldLock+즉시스타일(+11/-2) + `syncHomeUIFromState`(+7/-1) |
| **7000→8000(개발책임자 지시)** | `+6/-6` | `homeUnitPrice`/`partUnitPrice`/`singleUnitPrice`/`commUnitPrice`/`calcSetUnitPrice` 5곳, 값+주석 숫자만 |
| **합계** | `+118/-27` | `git diff --numstat`과 일치 |

`homeManualLockHarness.cjs`(R1 소유, `+10/-1`)는 뿌리②가 `takeSnapshot`/`applySnapshot`에 `COMM_MANUAL_*` 참조를 추가해 그 두 함수를 추출·실행하는 R1 harness가 `ReferenceError`로 깨지는 것을 막기 위한 **호환성 보정**(빈 `COMM_MANUAL_*` Set 5개 선언 + `clearCommManualLocks`를 추출 목록에 추가) — 로직 변경 없음.

### 9.8 7000→8000(개발책임자 지시) — 대조 및 실행 결과

**최신 GAS 대조**(스크래치패드 `gas-latest/order/index.html`·`gas-latest/estimate/index.html`, `clasp` 로 방금 재수신, 읽기 전용 — 수정하지 않음): 두 앱 각 5곳이 **동일 함수·동일 가드 조건**으로 최신 GAS와 1:1 대응함을 확인했다(함수명·가드 스타일·주석까지 일치, 숫자만 다름):

| 앱 | 함수 | 가드 | 현재(fix 전) | 최신 GAS |
|---|---|---|---|---|
| order | `homeUnitPrice` | `!window.SHOW_I_HOSE` | `return 7000` (주석도 "…7000") | `return 8000` (주석도 "…8000") |
| order | `partUnitPrice` | `!window.SHOW_I_HOSE` | `return 7000` | `return 8000` |
| order | `singleUnitPrice`(익명 함수, `it.nameRaw`) | `!window.SHOW_I_HOSE` | `return 7000` | `return 8000` |
| order | `commUnitPrice` | `!window.SHOW_I_HOSE` | `return 7000` | `return 8000` |
| order | `calcSetUnitPrice` | `!window.SHOW_I_HOSE` (norm 정규식) | `return 7000` | `return 8000` |
| estimate | `homeUnitPrice` | `document.getElementById('home_hose_i')?.checked` | `return 7000` | `return 8000` |
| estimate | `partUnitPrice`("싱글 부자재 단가") | `!window.SHOW_I_HOSE` | `return 7000` | `return 8000` |
| estimate | `singleUnitPrice` | `!window.SHOW_I_HOSE` | `return 7000` | `return 8000` |
| estimate | `commUnitPrice` | `document.getElementById('comm_hose_i')?.checked` | `return 7000` | `return 8000` |
| estimate | `calcSetUnitPrice` | (가드 없음 — 최신 GAS도 동일하게 무가드) | `return 7000` | `return 8000` |

10곳 모두 "I형 유연호스" 문맥임을 각각 개별 확인(다른 의미의 7000 섞임 0건 — 두 앱 각각 `return 7000\|return 8000` 이 정확히 5곳뿐이었다). 10곳 전부 값만 `8000`으로 교체, 가드·함수 구조는 무변경.

**골든 영향 확인** — `legacy-quantity-golden/goldens.js`는 수량·target 모델만 기록하고 가격 필드가 없다(파일 자체 주석: "금액은 가격 snapshot 부재로 null을 유지한다"). 예상대로 영향 0: order-app golden 73/73, estimate-app golden(73/73 포함 전체 175/175) 재실행 결과 전부 GREEN, 실패 0건(§9.3).

### 9.9 결함 1(견적 I형 1WAY 호스) 최신 GAS 재대조

R1이 이미 실 견적앱(`CATALOG_SOURCE=db`)으로 검증해 "`FH_LFHIF4W`는 실 카탈로그에 없는 모델(`HOSE_I_4W=''`), 칩 ON 시 `FH-LFHIF`엔 정상 수량이 실린다"는 결론을 냈다(§ R1 코멘트, 이 라운드가 재현하지 않고 그대로 인용). 이번엔 그 위에 **최신 GAS 소스 코드 자체**와 현재 `index.ejs`를 비교했다.

- 현재 `index.ejs:8379`(R1 D-1 fix): `const hose1L = HOSE_1W;` — 상업 1WAY L형 target을 **고정 상수**로 고정.
- 최신 GAS `gas-latest/estimate/index.html:8006`: `const hose1L = pickHoseModel('1way');` — **아직 원래 형태**. `pickHoseModel('1way')`(`:3708`)는 `useI`(전역 `SHOW_I_HOSE`) 가 true 면 `HOSE_I_1W||HOSE_1W`를 반환하므로, 전역 ON 일 때 `hose1L`이 `hose1I`와 **같은 모델로 별칭(alias)**된다.
- 다음 줄들(최신 GAS `:8013-8018`, 현재 `index.ejs`와 구조 동일): `if(useIHose && hose1I){ want.set(hose1I, nTarget); if(hose1L) want.set(hose1L, 0); }` — `hose1L===hose1I`인 별칭 상태에서는 두 번째 `want.set(hose1L, 0)`이 **방금 넣은 값을 즉시 0으로 덮어쓴다.**

**결론 — 최신 GAS도 R1이 재현했던 "전역 I형 ON → I형 수량이 0" 버그를 그대로 갖고 있다.** R1의 D-1 fix(`hose1L`을 `HOSE_1W` 고정 상수로 바꿔 별칭 자체를 없앰)는 GAS의 실제 결함을 우회한 **의도된 GAS 이탈**이며, 이번 재대조로 "저장소 스냅샷이 낡아서 놓친 최신 동작"이 아니라 "최신 GAS도 동일 결함을 가진 상태에서 개발책임자가 이미 개정을 승인한 사안"임이 확정됐다. 코드 변경은 없음(이미 R1에서 fix 완료) — 검증 전용.

### 9.10 D-1/D-2 — GAS 이탈 명시 기록(다음 라운드가 되돌리지 않도록)

- **D-1**(§1, §9.9): 최신 GAS 도 "전역 I형 ON, 화면칩 무관"일 때 1WAY 호스가 0이 되는 별칭 버그를 갖고 있다. `hose1L=HOSE_1W` 고정은 그 버그를 우회하는 **의도된 이탈**이지 저장소 드리프트가 아니다.
- **D-2**(홈 파생 수동잠금 전체 — G-1~G-6 전부): 최신 GAS 주문서에 `HOME_MANUAL` **0건**, `COMM_MANUAL_*.delete` **0건**(둘 다 스냅샷과 동일 — 재확인 완료). **홈 파생 수동잠금은 GAS 원본에 없는 개념**이며, 상업멀티의 add-only(해제 불가) 도 GAS 원본 그대로다. 그럼에도 이슈 #963 이 이 소실을 결함으로 등록했고 개발책임자가 개정을 명시 승인했으므로(§1 D-2), 이번 R2 fix(뿌리①②③ 전체)는 **GAS 패리티 원칙의 명시적·승인된 예외**로 유지한다. GAS 에 없다는 사실은 "GAS 도 같은 결함을 가진다"는 뜻이지 "그 동작이 정답"이라는 뜻이 아니다.

### 9.11 이번 라운드에서 못 한 것

- `SINGLE_MANUAL_*`(주문 앱에 싱글중대형 잠금 개념 자체가 없음, §9.5②)은 R1·R2 모두 게이트되지 않아 고치지 않았다. 새 이슈 등록하지 않음(사전 허락 필요) — PM 보고용.
- G-4 스타일 값은 `syncHomeUIFromState`/`onHomeQtyInput`/입력창 생성 3곳에서 인라인 `style.color`/`style.fontWeight`로 직접 설정한다(견적 앱과 동일한 인라인 스타일 패턴, CSS 클래스화는 하지 않았다) — 리팩터 여지는 있으나 이번 게이트(G-4)는 "표시되는가"이지 "구현 방식"이 아니라 범위를 넘기지 않았다.
- **R2 당시 기록**: 상업멀티(comm)는 잠금 상태를 화면에 표시하지 않았다(G-4는 홈만 게이트됐다). 이 격차는 CODEX SOL에서 도달 가능 결함으로 승격되어 §10~§11의 fix와 실 브라우저 검증으로 해소했다.
- 모바일/터치, 운영 DB 실측, 서버 저장 API 왕복은 R1과 동일한 사유로 이번 라운드도 스킵했다(§8.7 그대로).
- **정정**: CODEX SOL 5.6 2차 적대검증 라운드는 완료됐다. 결과와 증거는 아래 §10~§12에 기록한다.

## 10. CODEX SOL 5.6 2차 적대검증 — 상업멀티 도달 가능 결함 4건

CODEX SOL은 홈멀티에만 적용된 수동수량 잠금 규칙이 상업멀티에서 완전히 대칭되지 않은 경로를 실 브라우저에서 발견했다. 모든 금액은 실제 상업 카탈로그 단가 기준이다.

| 결함 | 실 브라우저 경로 | 결과 및 금액 영향 |
|---|---|---:|
| ① 받침대 잠금 소실 | `AM080AXVHHH1` 1대 → `방진가대S2소` 3개 수동 → 실외기 2대 | 수동 3개가 자동 2개로 바뀌어 `160,000원` 누락 |
| ② 명시적 0 잠금 불가 | `AM016BN1PBH2` 4대 → `PC1MWSK3NW=0` → 실내기 5대 | 자동 5개가 부활해 `698,500원` 과다 계상 |
| ③ 무관 계열 잠금 해제 | DUCT `AM052DNLDBH1` 2대 → `MDP-Z075SZED=5` → 판넬·리모컨·호스·받침대 제외 각 1회 | 펌프 5개가 자동 2개로 바뀌어 `181,632원` 누락 |
| ④ 상업 잠금 표시 없음 | `AM016BN1PBH2` 4대 → 판넬 `PC1MWSK3NW=11` → 실내기 5대 | 자동 5개 대비 차액 `838,200원`인데 화면 신호 없음 |

실데이터 부트스트랩은 `GET /api/v1/partner-orders/bootstrap` HTTP 200, `commercialMulti=404`, `commercialParts=137`이었다. 대표 모델 `AM080AXVHHH1`과 부자재 모델들은 모두 이 응답에서 읽었다.

## 11. CODEX SOL 라운드 fix 및 재검증

fix는 상업멀티를 홈멀티와 같은 규칙으로 수렴시키는 최소 변경으로 수행했다.

- RED-first: 상업 수동잠금 harness에서 4개 결함 경로가 fix 전 실패함을 먼저 확인했다.
- GREEN: `commercialManualSymmetry.test.ts` 9/9, order-app 157/157, estimate-app 175/175.
- 뮤테이션 RED: 실외기 변경 시 base clear, 명시적 0 판정, 옵션별 lock set 매핑, 표시 판정 조각을 각각 원복해 해당 결함만 다시 실패하는 것을 확인한 뒤 원상복구했다.
- 상업 5계열 전수 sweep: 판넬 `11`, 호스 `7`, 리모컨 `6`, 펌프 `5`, 받침대 `3` 모두 지배 입력 변경 후 보존되고 파란색·굵은 글씨로 표시됐다.
- 실데이터 저장→복원: `11/7/6/5/3`과 5개 잠금이 복원됐다. 초기화 시 5계열 모두 빈 칸과 잠금 해제로 돌아왔다.
- 실데이터 보조 확인: I형 호스 단가 `8,000원`, 모바일 `390×844`, 주문 앱·견적 앱 모두 통과.
- 서버 저장 API는 호출하지 않았고, 앱의 GET 및 브라우저 메모리 상태만 사용했다.

## 12. 라이브QA 증거 정정 및 스크린샷 무결성

### 12.1 1차 라이브QA의 0건 오판

1차 보고의 `commercialMulti=0`, `commercialParts=0`은 게이트웨이 원 응답을 읽은 결과가 아니었다. fixture를 보강한 브라우저 세션의 `window.__SAMHAN_BOOTSTRAP__` 상태를 라이브 카탈로그 상태로 오인했다. 따라서 해당 fixture 기반 상업 라이브QA는 무효다.

재확인에서는 새 브라우저 컨텍스트로 로그인 후 같은 부트스트랩을 직접 읽었고, 인증 전후 모두 `commercialMulti=404`, `commercialParts=137`을 확인했다. 앱이 상업 목록을 읽지 못한 결함은 재현되지 않았다.

### 12.2 1차 실데이터 캡처의 스크롤 리셋 사고

실데이터 상태 자체는 JSON 값과 computed style로 정확했지만, 실내기·실외기 수량 변경이 상품 테이블을 재렌더링하며 스크롤을 최상단으로 되돌렸다. 캡처 코드가 대상 행을 재스크롤하지 않아 다음 after 파일이 캡션과 다른 최상단 카탈로그를 담았다.

1차 영향 파일은 주문 앱 8장과 견적 앱 9장이었다. 전체 기존 캡처 대조 중 `18-real-mobile-390x844-panel-lock.png`와 `45-real-estimate-mobile-panel-lock.png`도 대상 판넬 행이 보이지 않는 사실을 추가 확인해, 두 장을 포함한 주문 앱 9장·견적 앱 10장을 새로 캡처했다. 새 `967-lunafix-real2` 캡처에서는 저장 직전마다 다음 검증을 수행했다.

1. 대상 `data-model` 행을 다시 찾는다.
2. `scrollIntoView({ block: 'center' })`를 실행한다.
3. 캡처 전후 input 값이 단언값과 같은지 확인한다.
4. `getBoundingClientRect()`로 행 전체가 viewport 안에 있는지 확인한다.
5. 값·뷰포트 검증이 모두 통과한 경우에만 PNG를 저장한다.

재촬영 결과 19장은 `...\\scratchpad\\967-lunafix-real2\\`에 저장했고, 주문·견적의 모든 재촬영 파일이 대상 행 값 일치, viewport 포함, 파란색 `rgb(37, 99, 235)`, font weight `700` 검증을 통과했다. 기존 before·옵션 변경 후·저장복원·초기화·I형 호스·모바일 초기 화면도 이미지로 대조해 캡션과 일치함을 확인했고, 위 두 모바일 잠금 캡처만 불일치로 분류해 교체용 증거를 추가했다.

## 13. PR #967 후속 흡수 — 선재 결함 2건 (2026-07-28)

PM 적대검증에서 확인한 아래 2건은 현재 fix가 만든 회귀가 아니라 `origin/main`에서도 동일한 수치로 재현되는 **선재 결함**이다. PR #967에서 흡수 처리했다.

### 13.1 결함과 원인 계보

| 결함 | 사용자 영향 | 원인 계보 | 금액 영향 |
|---|---|---|---:|
| ① 상업멀티 옵션 5종 리셋 | 옵션 선택 후 품목 검색·필터·저장복원 시 기본값으로 돌아가고 검색어 삭제로도 복구되지 않음 | `renderComm()` → 매 렌더 `renderCommOptions()` → 첫 줄 `box.innerHTML=''` → 하드코딩 기본값 재삽입. 검색·필터·`applySnapshot`이 이 렌더 경로를 통과함. `renderHome()`에는 같은 옵션 재생성 호출이 없음. | **+202,830원** |
| ② 상업 T형 분기관 수동 수량 소실 | `AXJ-TA3419M` 수동 수량이 다른 값 변경 후 자동값으로 덮이고 파란 굵은 수동 표시도 없음 | `COMM_MANUAL_*`가 `PANEL/HOSE/REMOTE/PUMP/BASE` 5종뿐이고 `BRANCH`가 없음. 따라서 `commManualSetForRow()`가 분기관에 `null`을 반환하고 `recomputeCommDerived()` 최종 guard도 분기관을 통과시킴. | **−2,057,000원** |

②는 직전 fix 커밋이 스스로 열거한 “홈 파생 5계열(판넬·호스·리모컨·**분기관**·발통)” 중 **분기관만 상업에 이식하지 않은**, “홈만 게이트” 계열의 5번째 누락이다. 이번 fix는 `COMM_MANUAL_BRANCH`를 분류·입력 잠금·재계산 guard·초기화·snapshot 저장/복원에 연결했다.

### 13.2 계열 전수 sweep

| 영역 | 전수 계열 | 확인 결과 |
|---|---|---|
| 홈멀티 | 판넬·호스·리모컨·분기관·발통 (**5계열**) | 입력·표시·재계산·옵션 변경·snapshot 경로에 5계열 gate 존재 |
| 상업멀티 | 판넬·호스·리모컨·펌프·받침대·분기관 (**6계열**) | 기존 5계열에 분기관을 추가해 입력·표시·재계산·초기화·snapshot 경로를 모두 대칭화 |

렌더 삭제 지점도 전수 확인했다. 상업 옵션 컨트롤을 재생성하는 `renderCommOptions()`는 현재 값을 보존하고, 기존 컨트롤이 있으면 no-op이다. 기본값 재생성은 명시적 상업멀티 초기화의 `reset=true`에서만 발생한다. 상업 행 렌더는 `commQty`와 manual lock에서 값을 다시 읽으며, 홈멀티 옵션은 상업 검색 렌더 경로와 분리되어 있다.

### 13.3 RED/GREEN 및 라이브 QA

- RED-first 신규 probe: 옵션 재렌더 보존 1건, T형 분기관 재계산 잠금 1건 — fix 전 2/2 실패.
- GREEN: 전체 order-app **14 test files / 163 tests passed**, golden **73/73**, typecheck exit 0.
- 라이브 브라우저 프로그램 검증: 분기관 값 **`77`**, `getComputedStyle(input).color` **`rgb(37, 99, 235)`**, `font-weight` **`700`**, `getBoundingClientRect()` **`x=121, y=393.375, width=1198, height=40, top=393.375, bottom=433.375`**, viewport `1440×1000`.
- 옵션 라이브 검증: 검색 전·검색 후·검색어 삭제 후 모두 `블랙판넬 / 사각 / 컬러유선 / 유연호스 제외=true / 받침대 제외=true` 유지.
- 캡처: `docs/qa/2026-07-28-963-preexisting-fix/`의 옵션 검색 2장, T형 분기관 재계산 1장, `metrics.json`.

라이브 QA는 실제 앱·실제 gateway/API·실제 Chromium을 사용했다. 당시 공유 `product_db`에 대상 모델이 없어 QA 식별자 `created_by=qa-963`로 두 product와 exposure를 **임시 삽입 후 삭제**했고, 재시작 후 대상 모델 0행을 확인했다. PM이 후속 검증에서 공유 `product_db` 잔재 0행 및 기준값(products 105 / 노출 4)을 재확인했다. 다음 라이브 QA부터는 공유 DB write를 하지 않고 전용 throwaway DB를 사용한다.

### 13.4 변경 줄 수와 경계 하네스 근거

PM 대조값 기준 개별 파일 numstat을 그대로 기록한다.

```text
1	0	clients/web/legacy-quantity-golden/legacyQuantityBoundary.js
26	13	clients/web/order-app/index.html
46	3	clients/web/order-app/src/__tests__/commManualLockHarness.cjs
3	2	clients/web/order-app/src/__tests__/commManualLockRestore.test.ts
1	0	clients/web/order-app/src/__tests__/commercialManualSymmetryHarness.cjs
1	0	clients/web/order-app/src/__tests__/homeManualLockHarness.cjs
(신규) clients/web/order-app/src/__tests__/legacyPreexistingFix.test.ts
(신규) clients/web/order-app/src/__tests__/legacyPreexistingFixHarness.cjs
(신규) qa/playwright/scripts/qa-963-preexisting-fix.mjs
(신규) docs/qa/2026-07-28-963-preexisting-fix/ (캡처 3 + metrics.json)
```

`legacyQuantityBoundary.js`의 **+1**은 `runCommercial()`이 정본의 snapshot/recompute 함수를 추출 실행할 때 필요한 빈 `COMM_MANUAL_BRANCH` Set 선언 1줄이다(`:291`). 골든 fixture·정답 수량·계산식은 변경하지 않았고, 새 상업 분기관 lock 참조가 기존 golden sandbox에서 `ReferenceError`가 되지 않도록 스코프만 보강했다. 따라서 #948이 고정한 골든 정답의 경계 정의나 73건의 기대값을 변경한 것이 아니다.

## 14. CODEX LUNA 5.6 — SOL 2차 라운드 fix (2026-07-28)

### 14.1 RED-first 원문

SOL 보고서가 지목한 5군을 정본 함수로 재현하는 실패 테스트를 먼저 추가하고 실행했다. production fix 전 결과는 다음과 같다.

```text
npm test -- --run src/__tests__/sol2QuantityFix.test.ts
Test Files 1 failed (1)
Tests 1 passed, 8 failed (9)
```

실패 내용은 상업 T형 분기관의 수동값 소실, 상업 리뉴얼 필터의 자동값 덮어쓰기·stale 값, 싱글 round-foot/wired-board/ceiling-pump 3계열 각각의 잠금 부재, 잠금 배열이 없는 구형 snapshot의 `77 → 1` 복원, GHP `ACL-KORGHP06` 오선택, 계열별 registry를 계속 요구하는 구조 검증이었다. 결함 4 테스트는 새 snapshot을 만들지 않고 `manualQtyLocks`가 존재하지 않던 실제 구형 형식으로 `shot.core.manualQtyLocks`를 삭제해 재현했다.

### 14.2 범용 수량 잠금 구조 및 H-1 전수 sweep

정본 `clients/web/order-app/index.html`에 영역별 `MANUAL_QTY_LOCKS`와 `DERIVED_QTY_TARGETS`라는 범용 registry를 두고, 파생 row를 semantic predicate로 분류했다. 입력 핸들러·표시·초기화·재계산 guard·snapshot·복원·옵션 변경 해제를 이 공통 registry에 연결했다. 특정 계열을 별도 manual set으로 하나씩 이식하는 방식은 제거했다. 옵션 변경은 해당 영역의 관련 파생 계열 잠금만 targeted clear한다.

| 영역 | 입력 잠금 | 표시(파란 굵은 글씨) | 초기화 | 재계산 가드 | snapshot 저장 | snapshot 복원 | 옵션변경 시 해제 |
|---|---|---|---|---|---|---|---|
| 홈 | `onHomeQtyInput` → 공통 `setManualQtyLock` | `syncHomeUIFromState`/렌더가 공통 lock 판정 | `clearHomeManualLocks` → `clearManualQtyLocks('home')` | 홈 파생 target 전체를 `setDerivedQty`로 갱신한 뒤 공통 lock skip | `manualQtyLocks.home` | 공통 lock 복원 + 구형 derived snapshot 복원 | `onHomeOptionChange(controlId)`가 관련 홈 파생 lock만 해제 |
| 상업 | `applyCommManualLock` → 공통 `setManualQtyLock` | `syncCommManualUI`/렌더가 공통 lock 판정 | `clearCommManualLocks` → `clearManualQtyLocks('commercial')` | `recomputeCommDerived`의 최종 guard가 generic commercial derived row 전체를 skip | `manualQtyLocks.commercial` | 공통 lock 복원 + 구형 derived snapshot 복원 | `onCommOptionChange(controlId)`가 관련 상업 파생 lock만 해제 |
| 싱글 | `onSingleQtyInput` → 공통 `setManualQtyLock` | 싱글 렌더/sync가 공통 lock 판정 | 싱글 reset/옵션 경로가 `clearManualQtyLocks('single')` 사용 | round-foot·wired-board·ceiling-pump 및 이후 semantic derived row에 공통 guard 적용 | `manualQtyLocks.single` | 공통 lock 복원 + 구형 derived snapshot 복원 | 싱글 옵션 변경 경로에서 관련 single derived lock 해제 |

따라서 H-1의 7축(입력 잠금, 표시, 초기화, 재계산 가드, snapshot 저장, snapshot 복원, 옵션변경 시 해제)을 홈·상업·싱글 각 행에 모두 확인했다. 새 파생 계열이 추가돼도 row predicate와 공통 registry를 통과하면 동일 경로에 들어가며, `HOME_MANUAL_*`/`COMM_MANUAL_*`/`SINGLE_MANUAL_*`을 기능의 source of truth로 사용하지 않는다.

### 14.3 H-2/H-3/H-4 및 회귀 검증

- H-2: 구형 snapshot(잠금 배열 없음)에 상업 T형 분기관 수량 `77`을 넣어 복원한 뒤 값 `77`과 manual lock을 보존했다. 새 snapshot은 `manualQtyLocks`를 저장하고, 복원 시 신·구 형식을 모두 처리한다.
- H-3: 상업 실외기 변경 후 T형 분기관 `77`, 리뉴얼 필터 수동값 `77`이 유지됐다. 리뉴얼 필터의 자동값도 소스 수량 변경 시 최신 자동값으로 계산된 후 수동잠금 값은 덮어쓰지 않는다.
- H-4: GHP 파생 기준 코드를 `ACL-KORGHP06`에서 실제 마스터 코드 `ACL-KORGHP07`로 정정했다.
- 집중 테스트: `sol2QuantityFix.test.ts` **1 file / 9 tests passed**.
- order-app 전체: **15 test files / 172 tests passed / 0 failed**.
- 하네스 guard: `harness-false-green-guard.test.ts` **1 file / 49 tests passed / 0 failed**. G3a 예외나 가드 완화는 추가하지 않았다.

### 14.4 실서버 라이브 QA

실제 주문 앱(`http://127.0.0.1:5180/`)에 실제 로그인·클릭·입력·검색·옵션 변경을 수행하고 Playwright로 프로그램 검증했다. 캡처와 `metrics.json`은 `_local` 격리 경로에만 기록했다.

`docs/qa/2026-07-28-963-sol2-fix/_local/`의 5개 PNG에서 대상 행의 실제 수량, `getComputedStyle`, `getBoundingClientRect`, 합계 숫자를 모두 검증했다.

| 경로 | 대상 | 수량 | color | font-weight | rect | 합계 숫자 |
|---|---|---:|---|---:|---|---:|
| 상업 T형 분기관 | `AXJ-TA3419M` | 77 | `rgb(37, 99, 235)` | 700 | `x=121,y=588.375,w=1198,h=40`, viewport 내 | `34,823,800` |
| 상업 리뉴얼 필터 | `AF-R09A` | 77 | `rgb(37, 99, 235)` | 700 | `x=121,y=588.375,w=1198,h=40`, viewport 내 | `8,499,000` |
| 싱글 round-foot | `발통세트` | 77 | `rgb(37, 99, 235)` | 700 | `x=121,y=860.375,w=1198,h=40`, viewport 내 | `40,000` |
| 싱글 wired-board | `AIM-A01N` | 77 | `rgb(37, 99, 235)` | 700 | `x=121,y=589.375,w=1198,h=40`, viewport 내 | `3,380,000` |
| 싱글 ceiling-pump | `ADP-F075SP` | 77 | `rgb(37, 99, 235)` | 700 | `x=121,y=589.375,w=1198,h=40`, viewport 내 | `8,958,400` |

라이브 하네스의 `pageErrors`는 0건이었다. 서버가 반환한 기존 정적/API 리소스 응답 중 404 1건과 400 1건은 `consoleErrors`에 원문으로 기록했으며, 대상 행 값·스타일·rect·합계 검증은 모두 통과했다. 라이브 검증과 테스트에서 공유 `product_db`에 쓰지 않았다.

### 14.5 증거 수치 정정: `404/137` → `2/2`

직전 보고의 `commercialMulti=404`, `commercialParts=137`은 공유 `product_db`의 품목 행 수가 아니었다. 당시 브라우저 부트스트랩/카탈로그 응답에서 읽은 **응답 payload 배열의 길이**를 각각 센 값(`commercialMulti.length`, `commercialParts.length`)이었고, DB 행 수처럼 제시하면 안 되는 측정이었다. SOL 재측정은 no-store 직접 GET으로 응답을 확인했고 정확한 결과는 다음과 같다.

```json
{"measuredAt":"2026-07-28T11:19:10.850Z","serverTimestamp":"2026-07-28T11:19:10.797935964Z","httpStatus":200,"commercialMulti":2,"commercialParts":2,"singleSets":0,"models":["QA797-SET-01","QA797-GEN-01","QA797-PART-01","QA797-PART-02"]}
```

즉 정정값 `2/2`는 해당 응답의 두 배열 길이이며, 품목 마스터 전체 건수도 공유 DB의 총 행 수를 의미하지 않는다. 이번 작업에서는 공유 DB INSERT/UPDATE/DELETE를 수행하지 않았고, 임시 품목 삽입도 하지 않았다.

### 14.6 CI RED 원인과 수정

G3a가 지적한 `qa/playwright/scripts/qa-963-preexisting-fix.mjs`의 커밋 경로 직접 쓰기를 수정했다. `QA_DIR` 상수를 직접 만들던 코드를 `resolveQaShotsDir(...)`로 바꾸고, 캡처·metrics 경로를 반환된 `_local` 디렉터리로 통일했다. `const result`가 캡처 목적지에 직접 연결된 패턴도 `buildMetrics()` 함수로 바꿔 가드가 요구하는 격리를 통과시켰다. 동일 규약으로 신규 SOL2 라이브 하네스도 작성했다.

### 14.7 변경 파일 및 변경 줄 수

읽기 전용 `git diff --numstat` 실측값이다. `--stat` 합산값을 사용하지 않았다.

```text
5	5	clients/web/legacy-quantity-golden/goldens.js
43	11	clients/web/legacy-quantity-golden/legacyQuantityBoundary.js
198	152	clients/web/order-app/index.html
24	16	clients/web/order-app/src/__tests__/commManualLockHarness.cjs
5	6	clients/web/order-app/src/__tests__/commManualLockRestore.test.ts
53	20	clients/web/order-app/src/__tests__/commercialManualSymmetryHarness.cjs
23	14	clients/web/order-app/src/__tests__/homeManualLockHarness.cjs
5	6	clients/web/order-app/src/__tests__/homeManualLockRestore.test.ts
16	5	clients/web/order-app/src/__tests__/homeOptionAndZeroLockHarness.cjs
2	1	clients/web/order-app/src/__tests__/legacy-quantity-golden.test.ts
75	0	docs/dev-reports/2026-07-28-963-legacy-quantity-loss.md
23	21	qa/playwright/scripts/qa-963-preexisting-fix.mjs
(신규) src/__tests__/sol2QuantityFix.test.ts · sol2QuantityFixHarness.cjs
(신규) qa/playwright/scripts/qa-963-sol2-fix.mjs
(신규) docs/qa/2026-07-28-963-sol-round2/
```

`§14.8`의 골든 독립성 감사 절을 추가한 뒤의 report 자체 numstat은 아래 표의 `75`보다 증가하므로, PM commit 직전 위 표의 report 행만 다시 읽기 전용 `git diff --numstat`로 갱신해야 한다. 코드 파일 값은 위 실측 그대로다. `tools/legacy-gas/**`와 다른 worktree는 건드리지 않았다.

### 14.8 골든 기대값 독립성 재검증 — PM 보완

#### 14.8.1 도출 원천과 파일:줄

새 골든은 하나의 제품 출력만 받아 적었는지 확인하기 위해, `git show 58524ce77:<file>`로 fix 이전 정본·경계 하네스를 메모리에 읽고 `sourceMutator`로 VM에 넣어 실행했다. 파일을 checkout하거나 덮어쓰지 않았다. 경계 추출기는 fix 이전 `legacyQuantityBoundary.js:13-26`의 `extractFunctionSource`, `:79-81`의 `sourceFunctionBundle`, `runCommercial:256-322`를 사용했다.

| 골든 key | 독립 실행 원천·입력 | fix 이전 실행 결과 | 현재 변경 골든 |
|---|---|---|---|
| `C-06` | `fixtures.js:200`의 `AM140AXVGHH1=1`; 견적 정본 `estimate-app/views/index.ejs:4011` `isCommOutdoorRow`, `:8355` `recomputeCommDerived` | `{AM140AXVGHH1:1, 방진가대S2소:1, AXJ-TA3419M:1}` | 견적 쪽과 일치. 주문 쪽은 아래 독립성 판정 참조 |
| `C-07` | `fixtures.js:201`의 `AM035=2, AM075=1`; 견적 정본 `:4011`, `:4190` `RENEW_FILTER_MAP`, `:8355` | `{AM035:2, AM075:1, AF-R09A:2, AF-R12A:1}` | 견적 쪽과 일치. |
| `C-08` | `fixtures.js:202`의 `AM180=2`; 견적 정본 `:4111` `chooseBaseModel`, `:4131` `ACL-KORGHP07`, `:8355` | `{GHP방진가대:2, ACL-KORGHP07:2}` | 견적 쪽과 일치. |
| `C-02-REMAINDER-DRIFT` | `fixtures.js:296`의 `AM072TNCDBH1=2`; 견적 정본 `:8355`의 호스/PUMP_MAP 경로 | `{FH-LFHLF4W:2, ADP-F075SP:2}` | 견적 쪽은 기존값 유지; 주문 변경값은 `AM072TNCDBH1:2, ADP-F075SP:2` |
| `C-08-NO-BASE` | `fixtures.js:308`의 `C-08` + `#comm_ex_base=true`; 견적 정본 `:8355` 받침대 제외 경로 | `{ACL-KORGHP07:2}` | 견적 쪽은 기존값 유지; 주문 변경값은 `AM180AXVGHH1:2, ACL-KORGHP07:2` |

#### 14.8.2 이전 `{}`의 원인과 경계 하네스 +43/−11 내역

`C-08`과 `C-08-NO-BASE`가 이전 주문 골든에서 `{}`였던 것은 레거시 정본이 실제로 빈 결과를 낸다는 뜻이 아니었다. fix 이전 주문 정본의 `isCommOutdoorRow`(`order-app/index.html:2292`)가 fixture의 `catL` 없는 GHP row를 실외기로 인식하지 못했고, 주문 정본 `chooseBaseModel:2397`은 `ACL-KORGHP06`(`:2417`)을 사용했다. 현재 fixture에는 `ACL-KORGHP07`만 있으므로 주문 경계에서 target row도 성립하지 않았다. 견적 정본은 `isCommOutdoorRow:4011`의 `AM……X` 규칙과 `chooseBaseModel:4111`의 `ACL-KORGHP07`로 같은 입력에서 파생값을 냈다.

`legacyQuantityBoundary.js`의 `+43/-11`은 골든을 계산하는 새 식을 추가한 것이 아니라 다음 extraction scope를 넓힌 것이다.

```text
runHome:       +7 generic helper names +1 isHomeDerivedRow +2 generic registries -5 old home Set declarations = +5 net
runSingle:     +10 generic helper bundle +2 generic registries                         = +12 net
runCommercial: +7 generic helper names +1 isCommDerivedRow +13 generic registries -6 old Sets = +15 net
합계: +43 / -11
```

그러나 이 추가 함수(`lockScope_`, `setDerivedQty`, `isCommDerivedRow` 등)는 fix 이전 order 정본에 존재하지 않는다. 따라서 fix 이전 order source를 같은 경계에 넣으면 새 값을 내는 것이 아니라 `extractFunctionSource`가 먼저 `lockScope_ 함수를 찾을 수 없습니다`로 중단된다. 즉 `C-08 {}`를 경계 한계가 숨겼다가 +43줄로 복구했다는 증명은 성립하지 않는다.

#### 14.8.3 순환 여부 — 실행 원문

아래는 fix 이전 경계와 fix 이전 order source를 동시에 메모리에서 실행한 원문이다. `baseOrderAgainstBaseGoldens=65/65`는 기존 65개 golden row가 원래 정본과 일치했음을 뜻하지만, 새로 바꾼 5개 order golden은 같은 정본에서 나오지 않는다.

```json
{
  "C-06": {"order":{"AM140AXVGHH1":1,"방진가대S2소":1},"newOrderGolden":{"AM140AXVGHH1":1,"방진가대S2소":1,"AXJ-TA3419M":1}},
  "C-07": {"order":{"AM035FXMRHC1":2,"AM075FXMRHC1":1},"newOrderGolden":{"AM035FXMRHC1":2,"AM075FXMRHC1":1,"AF-R09A":2,"AF-R12A":1}},
  "C-08": {"order":{},"newOrderGolden":{"AM180AXVGHH1":2,"GHP방진가대":2,"ACL-KORGHP07":2}},
  "C-02-REMAINDER-DRIFT": {"order":{"ADP-F075SP":2},"newOrderGolden":{"AM072TNCDBH1":2,"ADP-F075SP":2}},
  "C-08-NO-BASE": {"order":{},"newOrderGolden":{"AM180AXVGHH1":2,"ACL-KORGHP07":2}}
}
```

전체 비교 원문:

```json
{
  "baseOrderAgainstBaseGoldens":{"pass":65,"total":65,"fail":[]},
  "currentOrderAgainstNewGoldens":{"pass":65,"total":65,"fail":[]},
  "goldenDeltaRows":5,
  "unchangedGoldenRows":60,
  "allTestCases":73,
  "unchangedIncludingNonGolden":68
}
```

판정은 명확하다. `estimateGoldens`의 5개 변경은 fix 이전 견적 정본 함수 실행과 독립적으로 일치한다. 반면 `orderGoldens`의 5개 변경은 fix 이전 order 정본에서 재현되지 않으므로, 현재 증거만으로는 순환이 아니라고 인증할 수 없다. 이것은 보고 누락이 아니라 4번 요구를 실제 실행해 얻은 **RED 결과**다. PM 머지 전에는 주문 쪽 5개 기대값의 독립 oracle(구형 order source 또는 명시된 별도 계약)을 확정하거나, 해당 기대값 변경을 되돌려야 한다.

`§14.8` 추가 시점의 dev-report 자체 numstat은 `246\t0`이었고, §14.9까지 포함한 현재 읽기 전용 `git diff --numstat`은 `400\t0`이다. `§14.7`의 `75\t0`은 PM이 보완을 요청한 감사 절 추가 전 checkpoint 값이다.

#### 14.8.4 PM oracle 확정 결과 및 `C-02-REMAINDER-DRIFT` 처분

PM이 확정한 독립 oracle을 반영해 5개 변경 행을 다시 분류했다. 다음은 PM이 제시한 grep 원문이다. 저장소의 주문서 사본은 `ACL-KORGHP06`으로 낡아 있었고, Drive 라이브 재다운로드 사본은 `ACL-KORGHP07`을 사용한다.

```text
tools/legacy-gas/거래처 발송 주문서/index.html:2276:    want.push('ACL-KORGHP06');
tools/legacy-gas/종합견적서/index.html:3754:              want.push('ACL-KORGHP07');
tools/legacy-gas/종합견적서/index.html:8095:    const isBaseItem = /방진가대|받침대|발통세트|일자발|si-al|AXJ-TA3419M|ACL-KORGHP07|AF-R09A|AF-R12A/i.test(s);
C:\Users\user\AppData\Local\Temp\claude\C--dev-Samhan-Public\7445e5b2-c181-4d85-abc3-95daebb19d9f\scratchpad\gas-fresh\거래처 주문서\index.html:2273:    want.push('ACL-KORGHP07');
```

이 원문과 견적 정본의 `isBaseItem` 열거를 독립 근거로 인정할 수 있는 행은 `C-06`의 `AXJ-TA3419M`, `C-07`의 `AF-R09A`·`AF-R12A`, `C-08`의 `ACL-KORGHP07`, `C-08-NO-BASE`의 `ACL-KORGHP07`이다. 따라서 5개 중 4개는 제품 수정 후 출력이 아니라 레거시 GAS 라이브/정본 규칙으로 뒷받침된다.

`C-02-REMAINDER-DRIFT`는 그 근거가 없었다. fixture는 `clients/web/legacy-quantity-golden/fixtures.js:297`의 `sourceQuantities: { 'AM072TNCDBH1': 2 }`이다. 저장소 주문서 정본의 실제 함수 원문은 다음과 같다.

```text
tools/legacy-gas/거래처 발송 주문서/index.html:2190: function isCommPumpRow(r){
tools/legacy-gas/거래처 발송 주문서/index.html:2191:   const s=((r?.name||'')+' '+(r?.disp||'')+' '+(r?.model||'')).toLowerCase();
tools/legacy-gas/거래처 발송 주문서/index.html:2192:   return /드레인펌프|펌프/i.test(s);
tools/legacy-gas/거래처 발송 주문서/index.html:5203:   const PUMP_MAP = {
tools/legacy-gas/거래처 발송 주문서/index.html:5209:     'ADP-F075SP':    ['AM072TNCDBH1','AM110TNCDBH1','AM130TNCDBH1','AM145TNCDBH1']
tools/legacy-gas/거래처 발송 주문서/index.html:5211:   Object.entries(PUMP_MAP).forEach(([pump, list])=>{
tools/legacy-gas/거래처 발송 주문서/index.html:5213:     list.forEach(m => { sum += Number(commQty.get(m)||0); });
tools/legacy-gas/거래처 발송 주문서/index.html:5214:     want.set(pump, sum);
```

Drive 라이브 사본도 같은 판정 구조였다.

```text
...\scratchpad\gas-fresh\거래처 주문서\index.html:2187: function isCommPumpRow(r){
...\scratchpad\gas-fresh\거래처 주문서\index.html:2188:   const s=((r?.name||'')+' '+(r?.disp||'')+' '+(r?.model||'')).toLowerCase();
...\scratchpad\gas-fresh\거래처 주문서\index.html:2189:   return /드레인펌프|펌프/i.test(s);
...\scratchpad\gas-fresh\거래처 주문서\index.html:5217:   const PUMP_MAP = {
...\scratchpad\gas-fresh\거래처 주문서\index.html:5223:     'ADP-F075SP':    ['AM072TNCDBH1','AM110TNCDBH1','AM130DNMDBH1','AM145DNMDBH1']
...\scratchpad\gas-fresh\거래처 주문서\index.html:5225:   Object.entries(PUMP_MAP).forEach(([pump, list])=>{
...\scratchpad\gas-fresh\거래처 주문서\index.html:5227:     list.forEach(m => { sum += Number(commQty.get(m)||0); });
...\scratchpad\gas-fresh\거래처 주문서\index.html:5228:     want.set(pump, sum);
```

즉 `AM072TNCDBH1`은 이 fixture에서 파생 target으로 방출되는 코드가 아니라 `ADP-F075SP`의 입력 모델이다. 이름이 `실내기 펌프 대상`인 fixture row는 `isCommPumpRow`에 걸리고, 주문 정본은 그 row를 0으로 초기화한 뒤 `PUMP_MAP`의 합계를 `ADP-F075SP`에 기록한다. 저장소 정본과 Drive 라이브 사본 모두에서 `AM072TNCDBH1`은 이 `PUMP_MAP` 입력 목록 외에 독립적인 `want` 출력 규칙으로 확인되지 않았다.

따라서 주문 레거시의 이 fixture 결과는 `{ "ADP-F075SP": 2 }`이다. 주문 정본의 호스 경로(`tools/legacy-gas/거래처 발송 주문서/index.html:5177-5188`)는 `commIndoorKind`가 `1way/2way` 또는 `4way/360`일 때만 `n1w/n4w`를 증가시킨다. fixture 이름 `실내기 펌프 대상`에는 그 타입 토큰이 없으므로 호스 수량은 0이다.

견적 정본의 `{ "FH-LFHLF4W": 2, "ADP-F075SP": 2 }`는 다른 규칙에서 나온다. `tools/legacy-gas/종합견적서/index.html:7979-8005`는 같은 실내기 row를 `commIndoorKind`가 빈 문자열이어도 `nNormal`로 세고, `hose4L`에 그 수량을 더한다. 그래서 `pickHoseModel('4way')`가 고른 `FH-LFHLF4W`에 2를 기록한다. 두 앱의 레거시 정본이 미분류 실내기를 처리하는 규칙이 원래 다르므로, 이 차이만으로 어느 한쪽이 결함이라고 판정할 수 없다. 다만 현재 주문 수정 코드가 H-2를 위해 보존한 `{ "AM072TNCDBH1": 2, "ADP-F075SP": 2 }`는 레거시 GAS에서 도출된 기대값이 아니므로, 이 행을 레거시 골든으로 확정할 수 없다.

요청대로 다른 행·제품 코드·테스트·하네스는 건드리지 않고 `goldens.js`의 `C-02-REMAINDER-DRIFT` 한 행만 이전 값으로 되돌렸다.

```diff
-  'C-02-REMAINDER-DRIFT': { AM072TNCDBH1: 2, 'ADP-F075SP': 2 },
+  'C-02-REMAINDER-DRIFT': { 'ADP-F075SP': 2 },
```

되돌린 뒤 실행한 골든 테스트 원문은 다음과 같다. 현재 수정 제품 출력에 `AM072TNCDBH1:2`가 남으므로, 레거시 골든으로 되돌리면 73건 중 72건 통과·1건 실패한다. 이는 `C-02` 골든과 H-2 제품 동작이 충돌한다는 RED 증거이며, 새 골든을 정당화하는 독립 oracle로 사용할 수 없다.

```text
npm test -- --run src/__tests__/legacy-quantity-golden.test.ts
> @samhan/order-app@0.4.0 test
> vitest run --run src/__tests__/legacy-quantity-golden.test.ts


 RUN  v2.1.9 C:/dev/Samhan-Public/.claude/worktrees/963-qty/clients/web/order-app

 ❯ src/__tests__/legacy-quantity-golden.test.ts (73 tests | 1 failed) 265ms
   × 단계 0 주문 앱 legacy 수량 경계 golden > 'C-02-REMAINDER-DRIFT' 옵션 갈래의 수량·target 모델이 golden과 같다 10ms
     → expected { AM072TNCDBH1: 2, 'ADP-F075SP': 2 } to deeply equal { 'ADP-F075SP': 2 }

 Test Files  1 failed (1)
      Tests  1 failed | 72 passed (73)
   Start at  22:51:48
   Duration  773ms (transform 27ms, setup 0ms, collect 37ms, tests 265ms, environment 0ms, prepare 117ms)

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

 FAIL  src/__tests__/legacy-quantity-golden.test.ts > 단계 0 주문 앱 legacy 수량 경계 golden > 'C-02-REMAINDER-DRIFT' 옵션 갈래의 수량·target 모델이 golden과 같다
AssertionError: expected { AM072TNCDBH1: 2, 'ADP-F075SP': 2 } to deeply equal { 'ADP-F075SP': 2 }

- Expected
+ Received

  Object {
    "ADP-F075SP": 2,
+   "AM072TNCDBH1": 2,
  }

 ❯ src/__tests__/legacy-quantity-golden.test.ts:199:31
    197|   test.each(optionFixtures as any[])('$id 옵션 갈래의 수량·target 모델…
    198|     const actual = evaluateLegacyQuantityBoundary(inputFor(fixture));
    199|     expect(actual.quantities).toEqual(orderOptionGoldens[fixture.id]);
       |                               ^
    200|     expect(actual.unitPrices).toBeNull();
    201|     expect(actual.subtotals).toBeNull();

EXIT=1
```

결론적으로 PM oracle 기준으로 4개는 독립 근거가 확보됐고, `C-02-REMAINDER-DRIFT` 1개는 레거시 근거를 찾지 못해 이전 값으로 되돌린 채 RED로 보류했다. 처분 후 읽기 전용 `git diff --numstat`은 `4\t4\tclients/web/legacy-quantity-golden/goldens.js`, `246\t0\tdocs/dev-reports/2026-07-28-963-legacy-quantity-loss.md`이다. 이 후속 작업에서 `tools/legacy-gas/**`, 제품 코드, 다른 골든 행, 새 테스트·리팩터는 변경하지 않았고 공유 `product_db`에도 쓰지 않았다.

## 14.9 서비스 개시 전 최종 2건

개발책임자 지시 범위인 `C-02-REMAINDER-DRIFT` 제품 누출과 GHP 보조품 코드만 최종 처리했다. 새 테스트·리팩터·다른 결함 수정은 하지 않았다.

### 14.9.1 `C-02-REMAINDER-DRIFT` — 계산 입력 모델 결과 누출

#### 원인과 제품 수정

`legacyQuantityBoundary.js:310`은 fixture 원수량으로 `commQty`를 시작한다. 제품 `recomputeCommDerived`는 `index.html:5607-5618`의 `PUMP_MAP`에서 `ADP-F075SP`를 계산하지만, 그 입력 모델을 결과 상태에서 제거하지 않았다. 그래서 펌프 전용 fixture row `AM072TNCDBH1`이 `{AM072TNCDBH1:2, ADP-F075SP:2}`로 남았다.

제품 정본 `clients/web/order-app/index.html:5615-5629`에 PUMP_MAP 입력 모델 집합을 만들고, 해당 모델의 catalog row가 실제로 `isCommPumpRow`인 경우에만 `commQty`를 0으로 정리했다. 따라서 실제 상업 실내기 row(품명에 펌프가 없는 경우)는 보존되고, 계산 전용 입력 row만 결과에서 제외된다.

```diff
+  const pumpInputModels = new Set();
+  ...
+  pumpInputModels.forEach(model=>{
+    const row = COMMULTI.find(x=>x.model===model);
+    if(row && isCommPumpRow(row)) commQty.set(model, 0);
+  });
```

같은 계열 전수 sweep 원문:

```json
{
  "fixtures": 65,
  "pumpInputRowsScanned": ["AM052ANHDBH1", "AM072TNCDBH1"],
  "leaks": []
}
EXIT=0
```

#### 73/73 GREEN 원문

```text
npm test -- --run src/__tests__/legacy-quantity-golden.test.ts

> @samhan/order-app@0.4.0 test
> vitest run --run src/__tests__/legacy-quantity-golden.test.ts

 RUN  v2.1.9 C:/dev/Samhan-Public/.claude/worktrees/963-qty/clients/web/order-app

 ✓ src/__tests__/legacy-quantity-golden.test.ts (73 tests) 333ms

 Test Files  1 passed (1)
      Tests  73 passed (73)
   Start at  23:06:31
   Duration  904ms (transform 34ms, setup 0ms, collect 45ms, tests 333ms, environment 0ms, prepare 139ms)

EXIT=0
```

### 14.9.2 GHP 보조품 `ACL-KORGHP07`

GHP 경로는 이 worktree의 기존 SOL2 수정으로 이미 `clients/web/order-app/index.html:2517-2519`가 `ACL-KORGHP07`을 사용하고 있었다. 이는 저장소 레거시 주문서 사본의 낡은 코드 `ACL-KORGHP06`을 그대로 따르던 제품을, 현재 catalog와 Drive 라이브 GAS에 맞춘 수정이다. 이번 §14.9에서는 그 경로를 다시 변경하지 않고 실제 결과만 검증했다.

독립 근거 원문:

```text
tools/legacy-gas/거래처 발송 주문서/index.html:2276:    want.push('ACL-KORGHP06');
tools/legacy-gas/종합견적서/index.html:3754:              want.push('ACL-KORGHP07');
tools/legacy-gas/종합견적서/index.html:8095:    const isBaseItem = /방진가대|받침대|발통세트|일자발|si-al|AXJ-TA3419M|ACL-KORGHP07|AF-R09A|AF-R12A/i.test(s);
C:\Users\user\AppData\Local\Temp\claude\C--dev-Samhan-Public\7445e5b2-c181-4d85-abc3-95daebb19d9f\scratchpad\gas-fresh\거래처 주문서\index.html:2273:    want.push('ACL-KORGHP07');
clients/web/order-app/index.html:2519:    want.push('ACL-KORGHP07');
```

공유 `product_db`에는 쓰지 않고 SELECT만 실행했다.

```text
ACL-KORGHP07	GHP 저감장치	6710000.00	6710000.00	COMMERCIAL_MULTI	f
AM180AXVGHH1	DVM S2 표준형 18HP	6884900.00	12518000.00	COMMERCIAL_MULTI	f
GHP방진가대	GHP 방진가대	330000.00	330000.00	COMMERCIAL_MULTI	f
EXIT=0
```

주문 정본 boundary에 GHP 실외기 수량 9를 넣은 실제 실행 결과:

```json
{
  "quantities": {
    "AM180AXVGHH1": 9,
    "GHP방진가대": 9,
    "ACL-KORGHP07": 9
  },
  "model": "ACL-KORGHP07",
  "qty": 9
}
EXIT=0
```

따라서 `ACL-KORGHP07`은 실제 결과에 `9개`로 들어오며, DB 납품가 `6,710,000원` 기준 소계는 `9 × 6,710,000 = 60,390,000원`이다. GHP 방진가대도 `9개 × 330,000원 = 2,970,000원`으로 함께 결과에 존재한다. `ACL-KORGHP06`은 SELECT 결과에 없으므로 제품 코드와 catalog가 어긋났던 기존 `06` 경로는 `COMMULTI.find(...)` 이후 조용히 skip되어 6,710,000원 품목을 누락시키는 결함이었다.

같은 `recomputeCommDerived` 함수 안의 조용한 누락 지점은 범위 밖이므로 고치지 않고 보고한다.

```text
clients/web/order-app/index.html:5651  const row = COMMULTI.find(x=>x.model===m); if(!row) return;
clients/web/order-app/index.html:5666  const row = COMMULTI.find(x=>x.model===m); if(!row) return;
clients/web/order-app/index.html:5686  if(!COMMULTI.find(x=>x.model===fModel)) continue;
clients/web/order-app/index.html:5720  const row = COMMULTI.find(x=>x.model===m); if(!row) return;
```

### 14.9.3 order-app 전체 Vitest 원문 및 최종 numstat

```text
npm test

> @samhan/order-app@0.4.0 test
> vitest run

 RUN  v2.1.9 C:/dev/Samhan-Public/.claude/worktrees/963-qty/clients/web/order-app

 ✓ src/__tests__/sanity.test.ts (2 tests) 2ms
 ✓ src/__tests__/commSetIndex.test.ts (1 test) 4ms
 ✓ src/__tests__/legacyConfigMapping.test.ts (2 tests) 8ms
 ✓ src/__tests__/bootstrapFailure.test.ts (2 tests) 14ms
 ✓ src/__tests__/legacyPreexistingFix.test.ts (2 tests) 15ms
 ✓ src/version/versionCheck.test.ts (5 tests) 4ms
 ✓ src/version/versionGate.test.ts (2 tests) 3ms
 ✓ src/__tests__/priceChangeSchedule.test.ts (10 tests) 45ms
 ✓ src/__tests__/sol2QuantityFix.test.ts (9 tests) 52ms
 ✓ src/__tests__/homeOptionAndZeroLockRestore.test.ts (10 tests) 52ms
 ✓ src/__tests__/commercialManualSymmetry.test.ts (9 tests) 65ms
 ✓ src/__tests__/samhanApi.test.ts (5 tests) 4ms
 ✓ src/__tests__/homeManualLockRestore.test.ts (16 tests) 90ms
 ✓ src/__tests__/commManualLockRestore.test.ts (24 tests) 131ms
 ✓ src/__tests__/legacy-quantity-golden.test.ts (73 tests) 308ms

 Test Files  15 passed (15)
      Tests  172 passed (172)
   Start at  23:06:37
   Duration  980ms (transform 631ms, setup 0ms, collect 1.11s, tests 796ms, environment 2ms, prepare 3.66s)

EXIT=0
```

§14.9 추가 전 읽기 전용 `git diff --numstat` 개별 파일 원문:

```text
4	4	clients/web/legacy-quantity-golden/goldens.js
43	11	clients/web/legacy-quantity-golden/legacyQuantityBoundary.js
209	153	clients/web/order-app/index.html
24	16	clients/web/order-app/src/__tests__/commManualLockHarness.cjs
5	6	clients/web/order-app/src/__tests__/commManualLockRestore.test.ts
53	20	clients/web/order-app/src/__tests__/commercialManualSymmetryHarness.cjs
23	14	clients/web/order-app/src/__tests__/homeManualLockHarness.cjs
5	6	clients/web/order-app/src/__tests__/homeManualLockRestore.test.ts
16	5	clients/web/order-app/src/__tests__/homeOptionAndZeroLockHarness.cjs
2	1	clients/web/order-app/src/__tests__/legacy-quantity-golden.test.ts
246	0	docs/dev-reports/2026-07-28-963-legacy-quantity-loss.md
23	21	qa/playwright/scripts/qa-963-preexisting-fix.mjs
```

신규 파일은 이전 SOL2 작업에서 생성된 `sol2QuantityFix.test.ts`, `sol2QuantityFixHarness.cjs`, `qa-963-sol2-fix.mjs`, `docs/qa/2026-07-28-963-sol-round2/`이며, 이번 최종 2건 처리에서 새 파일은 만들지 않았다. §14.9까지 포함한 report의 최종 numstat 행은 `400\t0\tdocs/dev-reports/2026-07-28-963-legacy-quantity-loss.md`이다.

## 14.10 CI RED — 견적·주문 앱별 함수 추출 경계

### 14.10.1 원인과 최소 수정

`f8d873ab1`에서 `legacyQuantityBoundary.js`의 홈·싱글·상업 함수 목록에 SOL2 주문 전용 헬퍼를 넣었다. 견적 정본 `clients/web/estimate-app/views/index.ejs`에는 `lockScope_`, `targetScope_`, `registerDerivedQty`, `isManualQtyLocked`, `setManualQtyLock`, `setDerivedQty`, `seedDerivedQty`, `isHomeDerivedRow`, `isSingleDerivedRow`, `isSingleManualLocked`, `applySingleManualLock`, `isCommDerivedRow`가 없었다. 따라서 견적 골든의 첫 H-01에서 `lockScope_ 함수를 찾을 수 없습니다.`가 발생했다.

`clients/web/legacy-quantity-golden/legacyQuantityBoundary.js:86-104`에 앱별 선택 경계를 추가했다. `sourceFunctionBundleForApp(..., 'order', ...)`는 원래 목록 전체를 기존의 필수 `sourceFunctionBundle`로 추출한다. 주문 소스에 함수가 없으면 여전히 즉시 예외가 난다. 견적 앱에서만 위 12개 주문 전용 헬퍼를 목록에서 제외하고, 나머지 도메인 함수는 계속 필수 추출한다. 견적 정본의 구형 함수가 참조하는 기존 수동 상태도 `runHome:230-234`, `runCommercial:341-345`에서 원래 이름의 Set으로 복원했다. 골든 기대값과 제품 정본은 변경하지 않았다.

### 14.10.2 재현 및 로컬 설치 함정

수정 전 견적 테스트를 `npm ci` 후 실행해 다음 RED를 재현했다.

```text
> @samhan/estimate-app@2.0.0 test
> jest --passWithNoTests --runInBand

FAIL test/legacy-quantity-golden.test.js
  ● 단계 0 견적 앱 legacy 수량 경계 golden › H-01 수량·target 모델이 golden과 같다

    lockScope_ 함수를 찾을 수 없습니다.

Test Suites: 1 failed, 7 passed, 8 total
Tests:       61 failed, 114 passed, 175 total
Ran all test suites.
EXIT=1
```

이전 로컬 확인에서 `estimate-app`은 `node_modules`가 설치되지 않아 Jest를 실행하지 못했다. 그 상태가 CI에서 처음 드러난 함정이다. 이번 검증에서는 먼저 `npm ci`를 실행했다.

```text
added 382 packages, and audited 383 packages in 10s
EXIT=0
```

### 14.10.3 견적 앱 전체 테스트 GREEN 원문

```text
> @samhan/estimate-app@2.0.0 test
> jest --passWithNoTests

PASS test/version-gate.test.js
PASS test/version-check.test.js
PASS test/db-catalog.test.js
PASS test/directory.test.js
PASS test/default-component-baseline.test.js
PASS test/calc-fidelity.test.js
PASS test/code.test.js
PASS test/legacy-quantity-golden.test.js

Test Suites: 8 passed, 8 total
Tests:       175 passed, 175 total
Snapshots:   0 total
Time:        4.388 s
Ran all test suites.
EXIT=0
```

### 14.10.4 주문 앱 전체 및 강제성 검증 원문

```text
> @samhan/order-app@0.4.0 test
> vitest run

✓ src/__tests__/sanity.test.ts (2 tests)
✓ src/__tests__/commSetIndex.test.ts (1 test)
✓ src/__tests__/legacyConfigMapping.test.ts (2 tests)
✓ src/__tests__/bootstrapFailure.test.ts (2 tests)
✓ src/__tests__/priceChangeSchedule.test.ts (10 tests)
✓ src/__tests__/legacyPreexistingFix.test.ts (2 tests)
✓ src/version/versionGate.test.ts (2 tests)
✓ src/version/versionCheck.test.ts (5 tests)
✓ src/__tests__/samhanApi.test.ts (5 tests)
✓ src/__tests__/sol2QuantityFix.test.ts (9 tests)
✓ src/__tests__/homeOptionAndZeroLockRestore.test.ts (10 tests)
✓ src/__tests__/commercialManualSymmetry.test.ts (9 tests)
✓ src/__tests__/homeManualLockRestore.test.ts (16 tests)
✓ src/__tests__/commManualLockRestore.test.ts (24 tests)
✓ src/__tests__/legacy-quantity-golden.test.ts (73 tests)

Test Files  15 passed (15)
Tests       172 passed (172)
EXIT=0
```

주문 경계의 필수 추출이 약해지지 않았는지는 저장소를 건드리지 않는 `sourceMutator`로 확인했다. H-01 기준 원문은 다음과 같다. `function lockScope_`를 메모리상 `function removed_lockScope_`로 바꾼 뒤 평가하고, 예외 후 변이 문자열을 폐기했으므로 작업 트리 파일은 원상 그대로다.

```text
baseline order H-01: {"AM020BN1PBH1":2,"AM052BN4DBH1":1,"AM083BN6PBH1":1,"FH-LFHLF":2,"FH-LFHLF4W":2,"AR-EC05":3,"AR-KH05":1,"PC1NWSK3NW":2,"PC4NUFK1NW":1,"PC6NUDK1NW":1}
expected order H-01: {"AM020BN1PBH1":2,"AM052BN4DBH1":1,"AM083BN6PBH1":1,"FH-LFHLF":2,"FH-LFHLF4W":2,"AR-EC05":3,"AR-KH05":1,"PC1NWSK3NW":2,"PC4NUFK1NW":1,"PC6NUDK1NW":1}
mutated order H-01: RED
lockScope_ 함수를 찾을 수 없습니다.
EXIT=0
```

### 14.10.5 최종 읽기 전용 `git diff --numstat` 개별 파일 원문

```text
38\t3\tclients/web/legacy-quantity-golden/legacyQuantityBoundary.js
101\t0\tdocs/dev-reports/2026-07-28-963-legacy-quantity-loss.md
```
