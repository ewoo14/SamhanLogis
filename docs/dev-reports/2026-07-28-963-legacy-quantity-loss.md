# PR #967 `[FIX] #963 레거시 GAS 수량 계산 결함 2건`

구현 담당: CODEX LUNA 5.6. 이 워크트리에서는 파일 수정만 수행했으며 git 조작, push, PR/Issue 등록은 수행하지 않았다.

## 1. 결정 반영

- D-1: 전역 `SHOW_I_HOSE=true`이면 상업멀티 1WAY는 화면칩과 무관하게 I형을 선택한다. 견적의 상업 계산 블록은 L형을 `HOSE_1W` 권위로 고정하고 전역 플래그를 우선한다.
- D-2: 주문 홈멀티도 견적과 같이 사용자가 직접 입력한 파생 수량을 보존한다. 판넬·호스·리모컨·분기관·발통을 각각 잠근다.
- D-3: snapshot 복원 시 수동 잠금은 새 UI 세션의 상태로 승계하지 않는다. 저장된 문서 금액을 재계산하거나 소급 변경하는 코드는 추가하지 않았다.

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
| `ROADMAP.md` | `+2/-0` | 로드맵 상태 |
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
