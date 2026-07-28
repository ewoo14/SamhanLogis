# #896 단계 0 정답 고정 — 슬라이스 1 R1 라운드 fix 보고서

## 0. 요약

R1 적대검증(OPUS 4.8)이 지적한 4대 결함(D-1~D-4, 전부 BLOCKING/HIGH)과 CI 표면 누락·증거 무결성 정정을 처리했다. 전면 개편이다 — 이전 보고서(초판)의 골든은 **정본이 아니라 하네스 자신이 만든 답과 대조되고 있었다**는 것이 R1의 핵심 지적이었고, 이번 라운드는 그 지적을 그대로 인정하고 처음부터 다시 만들었다.

핵심 변경:

- `legacyQuantityBoundary.js`의 자체 구현·스텁·target 주입을 전부 제거했다. `codeByCumulativeSum`/`codeByOutdoorHP`/`pushBranchPartsToCommFromBadges`/`partsForSetStrict_`/`getDefaultRemoteRows`를 정본에서 그대로 추출해 실행한다. HOSE_\*/FOOT_\*/REMOTE_\*/BRANCH_\*/MODEL_6HP_SINGLE/PANEL_MODELS/SS_\*_ID는 정본의 top-level 도출 블록(`derivationPreambleSource`)을 그대로 실행해 카탈로그 snapshot에서 얻는다 — fixture는 더 이상 이 값들을 주지 않는다.
- `fixtures.js`에 실제 도출을 가능하게 하는 카탈로그 행을 추가했다(4WAY 유연호스 2종, `SINGLE_PARTS` 카탈로그, `wired-board`/`ceiling-pump` target 행, `set-1way-inf-source`). 신규 코드 3종은 저장소에 실제 코드가 없어 새로 채운 자리이며 아래 §2에서 출처를 밝힌다.
- 재생성 결과 **기존 golden 70건의 값이 바뀌었다**(§9). 이는 예상된 결과다 — R1이 예고한 대로다.
- D-2 재발 방지를 위해 **12종의 신규 뮤테이션**을 두 테스트 파일에 영구 게이트로 추가했다. 재실행 결과 **23/24가 RED, 1/24가 정당한 GREEN**이었다(견적 12종 전부 RED, 주문 11종 RED + `derive-renew-filter-map` 1종은 주문 앱 자체 코드 경로 미도달). 그 사실을 테스트 자체가 문서화하도록 만들었다(§4).
- 기존 8종 뮤테이션의 증거를 실제 실행 원문으로 교체했다. 이전 보고서의 "Test Suites: 1 failed, 1 passed, 2 total"은 이 저장소 구조상 나올 수 없는 수치였다는 지적이 맞다 — 실제로는 단일 파일 스코프 실행 시 `Test Suites: 1 failed, 1 total`이다(§5).
- `deploy-estimate-app.yml`의 PR 경로 필터에 `clients/web/legacy-quantity-golden/**`을 추가했다(§8).
- 이번 재생성이 그 자체로 **두 앱 사이의 새로운 실제 드리프트 3건**을 발견했다(§6) — 손으로 만든 게 아니라 실행이 드러낸 것이다.

정본 2파일(`index.ejs`, `index.html`)과 `tools/legacy-gas/**`는 이번에도 수정하지 않았다.

## 1. 무엇이 정본에서 추출되고 무엇이 입력인가 (D-1/D-2 불변식)

| 구분 | 이전(R1이 지적한 상태) | 이번 |
|---|---|---|
| `codeByCumulativeSum`/`codeByOutdoorHP` | 하네스 자체 구현(죽은 fallback 삼항식을 베낌) | `sourceFunctionBundle`로 정본에서 추출·실행 |
| `pushBranchPartsToCommFromBadges` | no-op 스텁 + 하네스 자체 `modelByCode` 사본 | 정본에서 추출·실행, `commQty`에 실제로 씀 |
| `partsForSetStrict_`/`getDefaultRemoteRows` | `set.components` 필드를 읽는 스텁(SINGLE_PARTS는 항상 `[]`) | 정본 함수 그대로 + 실제 `SINGLE_PARTS` 카탈로그 |
| HOSE_1W/4W, HOSE_I_1W/4W, FOOT_ROUND/FLAT, REMOTE_\*, BRANCH_2512/1509, MODEL_6HP_SINGLE, PANEL_MODELS, SS_\*_ID | fixture `targets` 필드로 주입(하드코딩) | `derivationPreambleSource`가 정본 텍스트를 그대로 잘라 실행 — `HOMEMULTI`/`SINGLE_SETS` 카탈로그 snapshot에서 도출 |
| 입력 | 원수량 / 옵션 / 수동잠금 / 카탈로그 snapshot | (불변, 그러나 `targets` 필드 완전 삭제) |

`derivationPreambleSource`는 `legacyQuantityBoundary.js`에 새로 추가한 함수로, 정본의 `const MODEL_6HP_SINGLE=...`부터 `markAutoSingle(SS_FOOT_ROUND_ID,SS_FOOT_FLAT_ID,SS_WIRED_BOARD_ID,SS_CEILING_PUMP_ID);`까지(estimate `index.ejs:4474-4510`, order `index.html:2774-2810`) 정본 텍스트를 그대로 잘라 반환한다. 이 블록을 `runHome`/`runSingle`/`runCommercial` 셋 다 공유 주입한다 — 실제 페이지에서도 이 상수들은 한 번만 계산되어 세 계산이 전부 같은 값을 참조하기 때문이다(예: 상업의 `pickHoseModel`은 홈 카탈로그에서 도출된 `HOSE_I_1W`를 그대로 재사용한다 — `index.ejs:4083-4088`). 이 발견 자체가 이번 라운드의 산물이다: 이전 하네스는 `runCommercial`에 `HOMEMULTI`를 아예 주지 않고 `HOSE_1W`류를 직접 주입했다 — 즉 D-2는 홈 패밀리만이 아니라 **상업 패밀리에도 있었다**.

## 2. D-3 "정본이 만들 수 없는 상태" — 실제 조치

지적: `hose1w`/`hose4w`를 같은 모델(`'FH-LFHLF'`)로 주입해 `recomputeHomeDerived`의 `setH(HOSE_1W,...)` 다음 `setH(HOSE_4W,...)` 덮어쓰기로 1WAY 수량이 지워지는 상태를, 정본이 만들 수 없는데도 golden으로 고정했다는 것.

조치: 정본 정규식(`_HOSE_L_1W`/`_HOSE_L_4W`/`_HOSE_I_1W`/`_HOSE_I_4W`)이 실제로 서로 다른 카탈로그 행을 찾도록 홈·상업 카탈로그에 4WAY 행을 추가했다.

- `FH-LFHLF4W`("유연호스 L형 4WAY") — 기존 `FH-LFHLF`("유연호스 L형 1WAY")의 4WAY 대응.
- `FH-LFHIF4W`("유연호스 I형 4WAY") — 기존 `FH-LFHIF`의 4WAY 대응.

이 두 코드는 **저장소 어디에도(product-service 라벨 fixture, `tools/legacy-gas`, 마이그레이션) 실제 코드가 확인되지 않았다** — 명명은 이미 커밋된 인접 코드(`FH-LFHLF`/`FH-LFHIF`, 이 역시 최초 fixture 저자가 채운 자리다)의 규칙을 그대로 따랐을 뿐이다. 정본은 `HOSE_4W`/`HOSE_I_4W`가 반드시 존재한다고 가정하고 계산하므로(코드가 없으면 그 갈래 자체가 검증되지 않는다), 카탈로그 shape을 채우는 것 외에 다른 선택지가 없었다. **PM 확인 필요.**

같은 이유로 다음 target 행을 추가했다(정본 정규식이 실제로 찾아야 하는 행이 카탈로그에 없었다):

- `wired-board`(model `AIM-A01N`, name `유선보드`) — `SS_WIRED_BOARD_ID` 정규식(`/유선보드/i` OR `/AIM-?A01N/i`)의 실제 target. `AIM-A01N`은 이미 홈 카탈로그의 실제 코드(유선 리모컨 키트)를 재사용했다.
- `ceiling-pump`(model `ADP-F075SP`, name `실링용 드레인펌프`) — `SS_CEILING_PUMP_ID` 정규식의 실제 target. 이름·모델은 이미 이 fixture 파일의 상업 카탈로그에 있던 동일 실물(`ADP-F075SP 실링용 드레인펌프`)을 그대로 재사용했다.
- `set-1way-inf-source`(model `SINGLE-1WAY-INF-REAL`) — §3 참조.

이전에는 이 네 target(`wiredBoardId`/`ceilingPumpId`/`footRoundId`/`footFlatId`)도 `targets` 필드로 주입돼 있었다 — 카탈로그에 대응 행이 없었으므로 **주입 없이는 애초에 도출될 수 없는 값**이었다. 지금은 `SS_FOOT_ROUND_ID`/`SS_FOOT_FLAT_ID`(기존 `set-round-target`/`set-flat-target` 행으로 이미 도출 가능했다)를 포함해 넷 다 카탈로그에서 도출된다.

## 3. D-4 대응 — SINGLE_PARTS 카탈로그 신설 + 거짓 갈래 실제 실행

`partsForSetStrict_(s) = SINGLE_PARTS.filter(p => p.setModel === s.model)`(`index.ejs:5156`)이 참조하는 `SINGLE_PARTS`가 하네스에 `[]`로 고정돼 있었다. 새 카탈로그(`singlePartsCatalog`)를 만들어 세트별 리모컨 구성품을 넣었다.

```js
p('AP110RNPPBH1', 'AR-EC05', '무선리모컨', { kind: '리모컨', feat: '기본' }),
p('SINGLE-1WAY-REAL', 'AR-EH05', '무선 냉난방 리모컨', { kind: '리모컨', feat: '기본' }),
p('SINGLE-1WAY-INF-REAL', 'AR-CH01', '무선 인피니트 리모컨', { kind: '리모컨', feat: '기본' }),
```

`allowRemoteChange_(s)`는 `getDefaultRemoteRows(s)`가 반환한 리모컨이 `/^(AR-?EH05|AR-?EC05|AR-?KH05)$/i`에 걸리는지로 참/거짓을 가른다. 스텁 시절엔 `getDefaultRemoteRows`가 인자를 무시하고 상수 `[{model:'AR-EC05'}]`를 반환해 **항상 참**이었다(D-4). 거짓 갈래를 실제로 밟기 위해 `set-1way-inf-source`(기본 리모컨 `AR-CH01`, 인피니트 무선 — 정규식에 안 걸림)를 카탈로그에 추가하고, 신규 fixture `S-02-REMOTE-CHANGE-GATE`로 두 갈래를 한 실행 안에서 동시에 확인한다.

```js
sourceQuantities: { 'set-1way-source': 3, 'set-1way-inf-source': 2 }
```

실제 실행 결과(양 앱 동일): `{ 'set-1way-source': 3, 'set-1way-inf-source': 2, 'wired-board': 3 }` — `set-1way-inf-source`의 2대는 `wired-board`에 전혀 반영되지 않았다. 스텁이었다면(항상 true) `wired-board`가 5(3+2)로 나왔을 것이다 — 이 차이 자체가 거짓 갈래가 실제로 실행됐다는 증거다.

## 4. 12종 신규 뮤테이션 — D-2 재발 방지 게이트, 실제 RED 원문

`derivationPreambleSource`가 도출하는 상수마다 정본 정규식/임계값을 실제로 변조해, golden이 이 도출 계산에 진짜로 묶여 있는지 확인했다. 저장소 밖으로 복제하지 않고 `evaluateLegacyQuantityBoundary(input, { sourceMutator })`로 정본 파일을 읽은 **문자열에만** 적용했다(디스크에 쓰지 않음, 실행 후 그대로 복원됨 — 애초에 파일을 고치지 않는다).

| 뮤테이션 | 대상 | base fixture | 견적 | 주문 |
|---|---|---|---|---|
| `derive-foot-round` | `FOOT_ROUND` regex → `FOOT_FLAT`과 동일 target | H-08 | RED | RED |
| `derive-branch-swap` | `BRANCH_2512`↔`BRANCH_1509` regex 교환 | 단배관 실외기 1대+실내기 3대(H-01 변형) | RED | RED |
| `derive-hose-1w-swap` | `_HOSE_L_1W` regex를 I형으로 | H-01 | RED | RED |
| `derive-hose-4w-swap` | `_HOSE_L_4W` regex를 I형으로 | H-02 | RED | RED |
| `derive-remote-kit-off` | `REMOTE_WIRED_KIT` regex 무력화(`/$^/`) | H-06 | RED | RED |
| `derive-remote-wireless-off` | `REMOTE_WIRELESS` regex 무력화 | H-01 | RED | RED |
| `derive-remote-360-drift` | `REMOTE_360_DEFAULT`를 상대 앱 정규식으로 교체 | H-01 | RED | RED |
| `derive-cumsum-threshold` | `codeByCumulativeSum` 첫 임계값 150→9999 | C-09-2512 | RED | RED |
| `derive-outdoor-hp-threshold` | `codeByOutdoorHP`의 hp≤160 임계값→60 | C-09(base) | RED | RED |
| `derive-wired-board-off` | `SS_WIRED_BOARD_ID` regex 무력화 | S-02 | RED | RED |
| `derive-ceiling-pump-off` | `SS_CEILING_PUMP_ID` regex 무력화 | S-03 | RED | RED |
| `derive-renew-filter-map` | `RENEW_FILTER_MAP['AF-R09A']` 목록 축소 | C-07 | RED | **도달 불가(문서화, 아래 참조)** |

23/24가 RED. `derive-renew-filter-map`의 주문 앱만 GREEN인데, 이는 실행으로 확인한 **정당한 결과**다 — §6-2에서 원인을 설명하고, 테스트 자체가 "RED로 만든다"가 아니라 "도달 불가능함을 문서화한다"는 별도 테스트로 그 사실을 단정한다(무시하거나 조용히 스킵하지 않는다).

### 4-1. 실행 원문 발췌 (전부 위 20+2 실행에서 그대로 복사, 조작 없음)

**`derive-foot-round`(견적, H-08 — FOOT_ROUND가 FOOT_FLAT과 같은 target을 가리키도록 변조)**

```
Object {
  "AJ060MXHNBC1": 2,
-   "발통세트": 2,
}
Test Suites: 1 failed, 1 total
Tests:       1 failed, 64 passed, 65 total
```

**`derive-cumsum-threshold`(견적, C-09-2512 — 150 임계값을 9999로)**

```
Object {
-   "AXJ-YA2512N": 1,
+   "AXJ-YA1509N": 1,
    "AXJ-YA2812M": 1,
}
Test Suites: 1 failed, 1 total
Tests:       1 failed, 64 passed, 65 total
```

**`derive-outdoor-hp-threshold`(주문, base C-09 — hp≤160 임계값을 60으로, hp=120이 2815 버킷으로 밀림)**

```
AssertionError: expected 'AXJ-YA2815M': 1 to deeply equal 'AXJ-YA2812M': 1
Test Files 1 failed (1)
Tests 1 failed | 64 passed (65)
```

**`derive-remote-360-drift`(주문, H-01 — REMOTE_360_DEFAULT를 견적과 같은 AR-EC05 탐색으로)**

```
AssertionError: expected { AM020BN1PBH1: 2, …(8) } to deeply equal { AM020BN1PBH1: 2, …(9) }
Object {
    ...
-   "AR-KH05": 1,
    ...
}
Test Files 1 failed (1)
Tests 1 failed | 64 passed (65)
```

**`derive-hose-4w-swap`(주문, H-02 — _HOSE_L_4W regex를 I형으로)**

```
AssertionError: expected { AM052BN4DBH1: 2, …(5) } to deeply equal { AM052BN4DBH1: 2, …(6) }
Object {
    ...
-   "FH-LFHLF4W": 5,
    ...
}
Test Files 1 failed (1)
Tests 1 failed | 64 passed (65)
```

**`derive-wired-board-off`/`derive-ceiling-pump-off`(주문, S-02/S-03 — SS_\*_ID regex 무력화)**

```
expected { 'set-1way-source': 3 } to deeply equal { 'set-1way-source': 3, …(1) }
-   "wired-board": 3,

expected { 'set-ceiling-source': 4 } to deeply equal { 'set-ceiling-source': 4, …(1) }
-   "ceiling-pump": 4,
Test Files 1 failed (1)  (각각)
```

**`derive-renew-filter-map`(주문, C-07 — 도달 불가 문서화, GREEN이 맞는 이유는 §6-2)**

```
✓ src/__tests__/legacy-quantity-golden.test.ts (65 tests)
Test Files  1 passed (1)
Tests       65 passed (65)
```

나머지(`derive-branch-swap`/`derive-hose-1w-swap`/`derive-remote-kit-off`/`derive-remote-wireless-off`)도 양 앱 모두 동일 패턴(`Test Suites: 1 failed, 1 total` 견적 / `Test Files 1 failed (1)` 주문)의 RED를 냈다 — 로그 길이상 위 발췌로 대표한다.

## 5. 기존 8종 뮤테이션 — 증거 정정

R1이 지적한 증거 무결성 문제 3건을 실제 실행 원문으로 바로잡았다.

**정정 1 — 불가능한 테스트 수치.** 이전 보고서의 "`Test Suites: 1 failed, 1 passed, 2 total`"은 이 구조에서 나올 수 없는 수치였다(단일 파일 스코프 실행이면 스위트가 1개뿐이라 "1 passed"가 있을 수 없고, 전체 스위트면 8개 파일이라 "2 total"이 될 수 없다). 이번엔 **실제로 실행한 명령**(`npx jest test/legacy-quantity-golden.test.js --runInBand`, 단일 파일 스코프 — "로컬 전체 스위트 금지, golden 테스트는 직접 돌릴 것" 지침에 정확히 맞는 범위)의 원문을 그대로 옮긴다: `Test Suites: 1 failed, 1 total` / `Tests: 1 failed, 64 passed, 65 total`(견적), `Test Files 1 failed (1)` / `Tests 1 failed | 64 passed (65)`(주문, vitest). 64는 **20 + 42 + 가족순서 1 + 드리프트 보존 1 = 64**이다. 뮤테이션 게이트 1건이 추가되면 65건이다.

**정정 2 — Vitest 배열 축약 표기.** `drift-fixture-delete` 인용의 `…, 'H-07', …`는 Vitest가 내지 않는 형식이었다는 지적이 맞다. 실제 출력(주문, 그대로 복사):

```
AssertionError: expected [ 'H-01', 'H-02', 'H-03', …(16) ] to deeply equal [ 'H-01', 'H-02', 'H-03', …(17) ]
- Expected
+ Received
  Array [
    "H-01", "H-02", "H-03", "H-04", "H-05", "H-06",
-   "H-07",
    "H-08", "S-01", "S-02", "S-03", "C-01", "C-02", "C-03", "C-04", "C-05", "C-06", "C-07", "C-08", "C-09",
  ]
```

견적(Jest)도 동일하게 `…(N)` 요약과 unified diff(`@@ -3,11 +3,10 @@`) 형식이며 쉼표로 구간을 나열하는 방식은 어느 러너에서도 나오지 않는다:

```
@@ -3,11 +3,10 @@
    "H-02", "H-03", "H-04", "H-05", "H-06",
-   "H-07",
    "H-08", "S-01", "S-02", "S-03", "C-01",
```

**정정 3 — `source-omit`/`drift-fixture-delete`는 정본을 변조하지 않는다는 지적.** 사실이다 — 그대로 인정한다. `mutationSource(source, 'source-omit')`는 `return source;`로 정본을 전혀 건드리지 않고, 대신 `mutationInput`이 **입력 Map에서 원수량 하나를 지운다**. `drift-fixture-delete`도 정본이 아니라 **테스트 자체의 `fixtures` 배열**에서 `H-07`을 필터링한다. 둘 다 "레거시 코드 지점에서 검출했다"는 서술은 부정확했다 — 두 게이트가 실제로 검증하는 것은 **legacy 계산 로직이 아니라 fixture 입력·배열의 완전성**이다. 이번 보고서는 그 성격을 그대로 부른다: 이 둘은 D-2 재발 방지용 12종(§4, 정본 자체를 변조)과는 다른 층위의 게이트이며, 코드는 그대로 유지했다(대체할 만한 "정본을 변조하는" 등가물을 찾기보다, 실제로 다른 것을 검증하고 있다는 사실을 정직하게 기술하는 쪽을 택했다).

```
=== source-omit(견적, H-01의 AM020BN1PBH1 source를 입력에서 삭제) ===
Object {
-   "AM020BN1PBH1": 2,
    "AM052BN4DBH1": 1,
    "AM083BN6PBH1": 1,
-   "AR-EC05": 4,
-   "FH-LFHLF": 2,
+   "AR-EC05": 2,
    "FH-LFHLF4W": 2,
-   "PC1NWSK3NW": 2,
    "PC4NUFK1NW": 1,
    "PC6NUDK1NW": 1,
}
Test Suites: 1 failed, 1 total
Tests:       1 failed, 64 passed, 65 total
```

나머지 6종(`multiplier`/`target-model`/`add-to-replace`/`inactive-keep`/`option-invert`/`manual-lock-ignore`)은 실제로 정본 문자열을 변조한다(`replaceOnce`가 정본에서 그대로 인용한 실제 코드 조각을 대상으로 한다) — 이 서술은 원래 정확했다. 실행 원문(견적):

```
=== multiplier(H-01, setH의 q를 q*2로) ===
-   "FH-LFHLF": 2,     -   "FH-LFHLF4W": 2,
+   "FH-LFHLF": 4,     +   "FH-LFHLF4W": 4,

=== target-model(H-03, PANEL_MODELS.p1sWi를 PC1NWSK3NW로) ===
-   "PC1MWSK3NW": 1,

=== add-to-replace(C-01 변형, want.set(pm,q+..)를 want.set(pm,q)로) ===
-   "PC1NWSK3NW": 3,
+   "PC1NWSK3NW": 1,

=== inactive-keep(H-03 변형, 판넬 초기화 조건 무력화) ===
- Object {}
+ Object { "PC2NWSK1N": 7 }

=== option-invert(H-04, opt==='공청판넬'을 반전) ===
-   "PC4NUCK4NW": 1,
+   "PC4NUFK1NW": 1,

=== manual-lock-ignore(견적: H-03 + HOME_MANUAL_PANEL 무력화) ===
-   "PC1MWSK3NW": 9,

=== manual-lock-ignore(주문: C-05 + COMM_MANUAL_BASE 무력화) ===
Object { AM120AXVHHH1: 1, +   "방진가대S2소": 1, }
```

모두 `Test Suites: 1 failed, 1 total` / `Tests: 1 failed, 64 passed, 65 total`(견적) 또는 `Test Files 1 failed (1)` / `Tests 1 failed | 64 passed (65)`(주문)로 종료했다.

## 6. 이번 재생성이 새로 드러낸 사실

기존 결함 fix 과정에서, 손으로 만든 게 아니라 **실행이 드러낸** 두 앱 사이의 실제 드리프트 3건을 발견했다. 전부 정본을 실행해서 나온 결과이지 추측이 아니다.

**6-1. 주문 앱의 홈 패밀리 수동 잠금 부재(수정 전 baseline).** `H-03-PANEL-LOCK`(§ 아래) fixture를 만들며 `grep -c HOME_MANUAL_ order-app/index.html` → **0건**을 확인했다. 당시 견적은 `HOME_MANUAL_PANEL`을 실제로 존중해 9를 보존했지만 주문은 `recomputeHomePanels`가 자동값 1로 되돌렸다. PR #967에서 주문에도 실 입력 경로와 5계열 manual lock을 추가해 견적과 동일하게 9를 보존하도록 수정했다. `COMM_MANUAL_*`(상업)는 두 앱 다 기존 동작을 유지한다. 수정 전 golden은 다음과 같았다:

```js
estimateOptionGoldens['H-03-PANEL-LOCK'] = { ..., PC1MWSK3NW: 9, ... };
orderOptionGoldens['H-03-PANEL-LOCK']    = { ..., PC1MWSK3NW: 1, ... }; // 수정 전
```

**6-2. 주문 앱의 `isCommOutdoorRow`는 견적과 완전히 다른 판별식을 쓴다.** 견적(`index.ejs:4011-4014`)은 모델 문자열 패턴(`AM`+7자리 이상+7번째 문자 `X`)으로 판별하지만, 주문(`index.html:2291-2299`)은 `catL==='실외기'` 또는 이름에 `dvm|프라임|표준형|한랭지|상부토출` 포함 여부로 판별한다. `RENEW_FILTER_MAP`의 세 모델(`AM035FXMRHC1` 등, 이름 "실외기 리뉴얼 필터 대상")은 이 카탈로그에서 어느 쪽도 만족하지 않아 **주문에서는 실외기로 인식되지 않는다** — `isCommOutdoorRow(r)` 게이트에서 걸려 필터 반영 루프에 진입조차 못 한다(`globalThis.__filterTrace`로 직접 확인, 아래). §4의 `derive-renew-filter-map`이 주문에서 GREEN인 진짜 이유이며, §4(이전 보고서) 드리프트 표의 "리뉴얼 필터: 견적만 존재"·"GHP 보조 경로: 견적만 존재"(C-08, `AM180AXVGHH1`도 이름에 저 키워드가 없다)가 **같은 원인**이었음을 이번에 처음 확인했다.

```
COMMULTI has AF-R09A row: true   // 카탈로그엔 있다
{model:"AM035FXMRHC1", q:2, outdoor:false}   // 그런데도 실외기로 인식 안 됨
{model:"AM075FXMRHC1", q:1, outdoor:false}
```

**6-3. 견적 앱에서 I형 호스 스위치 2개(DOM `#comm_hose_i` + `window.SHOW_I_HOSE`)를 동시에 켜면 1WAY 수량이 상쇄된다.** `pickHoseModel('1way')`은 `window.SHOW_I_HOSE`가 켜져 있으면 `HOSE_I_1W||HOSE_1W`를 반환한다 — 즉 `hose1L`도 I형 코드가 된다. `recomputeCommDerived`의 useIHose(DOM) 분기는 `want.set(hose1I, nTarget)` 직후 `want.set(hose1L, 0)`을 실행하는데, 이 상태에서 `hose1L === hose1I`라 **방금 쓴 값을 그 자리에서 0으로 덮어쓴다**. 실행으로 직접 추적(`globalThis.__trace`)해 확인했다:

```
{ nTarget: 2, nNormal: 1, hose1L: 'FH-LFHIF', hose1I: 'FH-LFHIF', useIHose: true, wantFH_LFHIF: 0 }
```

수정 전에는 `C-02-I-HOSE` 견적 golden에 `FH-LFHIF`가 없고 `FH-LFHIF4W`만 남았다. PR #967에서 상업 1WAY의 L형 권위를 `HOSE_1W`로 분리하고 전역 I형을 우선해, 견적도 주문과 같이 `FH-LFHIF:2`를 보존한다. `FH-LFHIF4W:1` 및 주문 경로는 그대로다.

주문 앱의 홈·상업 I형 호스는 계속 `window.SHOW_I_HOSE`를 단일 진입점으로 사용한다. 이번 수정은 주문의 I형 진입점을 바꾸지 않고, 견적 상업 1WAY에만 있던 두 권위의 충돌을 제거해 양 앱 golden을 수렴시킨다.

**MODEL_6HP_SINGLE 관련 확인.** 정본 정규식 `/실외기_6HP\s*단배관/`은 리터럴 언더스코어를 요구하는데 카탈로그의 실제 이름은 공백(`실외기 6HP 단배관`)이다 — 즉 `MODEL_6HP_SINGLE`은 이 카탈로그로는 **항상 빈 문자열**이다(카탈로그를 "고쳐서" 매치시키지 않았다 — 실제 카탈로그 이름이 언더스코어를 쓴다는 근거가 없다). 다만 `recomputeHomeBranches`가 `r.model === 'AJ060MXHNBC1'`를 하드코딩된 리터럴로 별도 체크하므로 실무 영향은 없다 — 이 상수는 죽은 코드에 가깝다.

## 7. C-09 커버 라인 정정

이전 보고서 `:139`가 인용한 `index.ejs:12592`·`:12602`·`:13235-13238` 중 앞의 둘(`codeByCumulativeSum`/`codeByOutdoorHP`)은 이번에 실제로 추출·실행하도록 고쳤다(§1). 세 번째(`pushBranchPartsToCommFromBadges`, 코드→모델 MAP)는 **이전 하네스가 no-op으로 스텁하고 자체 사본을 대신 썼다** — 우연히 같은 문자열이라 결과는 맞았지만 그 라인은 실행되지 않았다. `runBranch`에 `commQty` Map·`CSS.escape`·`updateCommRatio`/`syncCommTotals`/`updateInlineTotals` no-op을 추가해 이 함수를 실제로 추출·실행하도록 고쳤다. 재실행 결과 모든 C-09 계열 값은 **동일**했다(코드가 정말 같았으므로) — 이는 우연이 아니라 처음부터 정확히 같은 텍스트를 옮겨 적었기 때문이며, 이제는 그 텍스트 자체가 정본에서 나온다.

## 8. CI 표면

`deploy-estimate-app.yml`의 `pull_request`/`push` 경로 필터에 `clients/web/legacy-quantity-golden/**`가 없어, golden/fixture/harness만 고치는 PR은 견적 golden(Jest)이 CI에서 전혀 돌지 않았다. 두 트리거 모두 추가했다:

```diff
   pull_request:
     paths:
       - 'clients/web/estimate-app/**'
+      - 'clients/web/legacy-quantity-golden/**'
       - 'infrastructure/render/**'
       - '.github/workflows/deploy-estimate-app.yml'
   push:
     branches: [main]
     paths:
       - 'clients/web/estimate-app/**'
+      - 'clients/web/legacy-quantity-golden/**'
       - '.github/workflows/deploy-estimate-app.yml'
```

주문 앱 쪽 PR 게이트는 `.github/workflows/ci.yml`의 `frontend-order-app` 잡이며, 이 워크플로는 최상위에서 `paths-ignore`(허용목록이 아니라 차단목록)를 쓰고 `clients/web/legacy-quantity-golden/**`를 차단하지 않으므로 원래부터 golden-only PR에서도 정상 트리거된다 — 이쪽은 문제가 없었다. `deploy-order-app.yml`은 `push`(main)에만 반응하는 배포 워크플로이고 PR 게이트가 아니므로 손대지 않았다.

## 9. 재생성으로 값이 바뀐 항목 (실행 결과 기준 정확한 카운트)

R1이 예고한 대로 "재생성된 golden 값은 지금 커밋된 값과 다르다"가 실측됐다. 기존 값을 유지하려고 fixture를 역산하지 않았다 — 아래는 전부 §1~3의 fix를 적용한 뒤 **실제 실행**으로 나온 값이다.

- 4-family base 20건 중 **10건 변경**(양 앱 동일 집합): H-01, H-02, H-03, H-04, H-05, H-06, H-07, C-01, C-02, C-09. (S-01~03, C-03~08은 변화 없음 — 이 계열은 애초에 hose/branch derivation을 타지 않는다.)
- 옵션 갈래 50건 중 **25건 변경**(양 앱 동일 집합): H-01-I, H-02-NO-PANEL, H-03-AIR-PANEL, H-03-NO-PANEL, H-04-25, H-04-AI, H-05-WIRED, H-05-COLOR, H-05-NO-REMOTE, H-06-COLOR, H-06-NO-REMOTE, H-07-NO-BRANCH, C-01-NO-PANEL, C-01-BLACK-PANEL, C-01-LIFT-PANEL, C-01-AIR-PANEL, C-01-CIRCLE-360, C-01-SQUARE-360, C-02-I-HOSE, C-09-1509, C-09-2512, C-09-2812, C-09-2815, C-09-3419, C-09-4119.
- **신규 fixture 4종**(양 앱 8건 추가): `H-03-PANEL-LOCK`(§6-1 드리프트 발견), `S-02-REMOTE-CHANGE-GATE`(§3 거짓 갈래), `C-05-BASE-LOCK`(수동 잠금 축, 아래), `C-09-HP-1509`(실외기 HP 강제표 독립 검증, §4 `derive-outdoor-hp-threshold`와 짝).

변경 원인은 전부 동일 계열이다: 4WAY 유연호스가 이제 1WAY와 다른 target을 가져 값이 두 항목으로 분리되거나(예: `H-01`의 `'FH-LFHLF':2` 단일값 → `'FH-LFHLF':2, 'FH-LFHLF4W':2`로), 정본 정규식이 실제로 도출한 값이 이전 주입값과 달랐다(C-09 계열, §4/§7 표 참조).

## 10. 수동 잠금 축 (D-2 불변식 6)

R1: "수동 잠금 축을 채운 fixture가 0건이고 `LEGACY_MUTATION` 없이는 실행되지 않는다." 두 개의 **일반 golden**(뮤테이션이 아니라 기본 `npm test`로 CI에서 항상 도는) fixture를 추가했다.

- `H-03-PANEL-LOCK`(§6-1) — 수정 전에는 주문의 `HOME_MANUAL_PANEL` 경로가 없었고, PR #967 후에는 두 앱 모두 사용자 입력 9를 보호한다.
- `C-05-BASE-LOCK` — `COMM_MANUAL_BASE`를 `방진가대S2소`에 걸면, `recomputeCommDerived`의 마지막 apply 단계(`index.ejs:8508`)가 그 모델에 대해 want→commQty 반영 자체를 건너뛴다. C-05의 자동 계산값(1)이 사라지고 결과는 `{ AM120AXVHHH1: 1 }`(양 앱 동일 — `COMM_MANUAL_BASE`는 두 앱 다 있다). 이 시나리오는 기존 `manual-lock-ignore` 뮤테이션(주문)이 이미 검증하던 것과 같은 지점이지만, 이번엔 뮤테이션 없이도 CI 기본 스위트에서 매번 실행된다.

## 11. 산출물 — 변경 파일 전체 목록

```
.github/workflows/deploy-estimate-app.yml
clients/web/estimate-app/test/legacy-quantity-golden.test.js
clients/web/legacy-quantity-golden/fixtures.js
clients/web/legacy-quantity-golden/goldens.js
clients/web/legacy-quantity-golden/legacyQuantityBoundary.js
clients/web/order-app/src/__tests__/legacy-quantity-golden.test.ts
docs/dev-reports/2026-07-27-896-s1-golden-baseline.md (본 문서)
```

정본 2파일(`clients/web/estimate-app/views/index.ejs`, `clients/web/order-app/index.html`)과 `tools/legacy-gas/**`는 미수정이다(`git status` 확인).

## 12. 실행 결과 (전부 이번 라운드 실제 실행, 원문)

### 정상 검증(뮤테이션 없음)

```text
[견적] npx jest test/legacy-quantity-golden.test.js --runInBand
Test Suites: 1 passed, 1 total
Tests:       64 passed, 64 total

[견적] npm test -- --runInBand   (모듈 전체 스위트)
Test Suites: 8 passed, 8 total
Tests:       166 passed, 166 total

[견적] npm run typecheck
typecheck OK: 14 JavaScript files

[견적] npm run build
typecheck OK: 14 JavaScript files

[주문] npx vitest run src/__tests__/legacy-quantity-golden.test.ts
Test Files  1 passed (1)
Tests       64 passed (64)

[주문] npm test -- --run   (모듈 전체 스위트)
Test Files  9 passed (9)
Tests       93 passed (93)

[주문] npm run typecheck
(tsc --noEmit, exit 0)

[주문] npm run build
✓ built in 374ms
```

166(견적, 이전 162+4)·93(주문, 이전 89+4)로 4씩 늘어난 것은 신규 fixture 4종(§9)과 정확히 일치한다.

### 뮤테이션 검증 — 20종 × 2앱 = 40회 전부 실제 실행

```text
[견적, 단일 파일 스코프] 20종 전부:
  Test Suites: 1 failed, 1 total
  Tests:       1 failed, 64 passed, 65 total

[주문, 단일 파일 스코프] 19종:
  Test Files 1 failed (1)
  Tests 1 failed | 64 passed (65)

[주문] derive-renew-filter-map 1종만:
  Test Files 1 passed (1)
  Tests 65 passed (65)     ← §4/§6-2에서 설명한 정당한 결과
```

각 실행 후 `LEGACY_MUTATION` 환경변수는 제거했고, §12 정상 검증은 뮤테이션 없이 별도로 재실행해 확인했다. 뮤테이션은 정본 파일에 쓰지 않았다(`git status`로 매 실행 후 clean 확인).

## 13. R2 라운드 fix — 분기보드 수동 추가 입력 경계

### 13.1 R2-1 RED 원문과 원인

`C-09-2812` 입력에서 분기 슬롯의 계산 셀 2개와 견적 화면의 `extra-branch=3`을 함께 재현했다. R2 fix 전 실제 실행 출력은 다음과 같다.

```text
{"app":"estimate","state":{"computed2812Cells":2,"userExtra2812":3},"boundary":{"AXJ-YA2812M":2},"directCanonical":{"AXJ-YA1509N":0,"AXJ-YA2512N":0,"AXJ-YA2812M":5,"AXJ-YA2815M":0,"AXJ-YA3419M":0,"AXJ-YA4119M":0}}
{"app":"order","state":{"computed2812Cells":2,"userExtra2812":3},"boundary":{"AXJ-YA2812M":2},"directCanonical":{"AXJ-YA1509N":0,"AXJ-YA2512N":0,"AXJ-YA2812M":2,"AXJ-YA2815M":0,"AXJ-YA3419M":0,"AXJ-YA4119M":0}}
```

원인은 `runBranch()`의 `document.querySelector: () => null`이었다. 정본 견적 함수가 `#branchSummaryBar [data-k="2812"] .extra-branch`의 `value`를 읽는데, 하네스가 그 입력까지 없애 계산 셀 2개만 반환했다. 주문 정본에는 해당 추가 입력 경로가 없으므로 주문의 2는 정상이다.

### 13.2 R2-1 fix

- `legacyQuantityBoundary.js`에 `options.branchExtras`를 경계 입력으로 추가했다.
- 분기 추가 입력 selector에는 경계 Map의 값을 `{ value }`로 반환하고, 분기 badge는 표시용 `{ textContent }`로 반환한다. 그 밖의 선택적 출력 DOM만 `null`로 남겼다. 정본 함수는 계속 파일에서 추출·실행한다.
- `fixtures.js`의 `C-09-2812`에 `branchExtras: { '2812': 3 }`을 넣었다.
- `estimateOptionGoldens['C-09-2812']`는 정본 실행 결과 `2→5`로 바꾸고, `orderOptionGoldens['C-09-2812']`는 `2`를 유지했다.
- 회귀 단언을 두 앱에 추가해 견적 5와 주문 2를 각각 고정했다.

초회 하네스 수정에서 생성 VM 정규식의 대괄호 escape가 소실되어 다음 오류가 발생했고, escape를 보정한 뒤 재실행했다.

```text
Invalid regular expression: /^#branchSummaryBar [data-k="([^"]+)"] .extra-branch$/: Unmatched ')'
```

### 13.3 R2-1 GREEN 직접 대조 원문

수정 후 같은 입력을 정본 직접 실행과 경계 실행으로 다시 대조한 실제 출력이다.

```text
{"app":"estimate","state":{"computed2812Cells":2,"userExtra2812":3},"boundary":{"AXJ-YA2812M":5},"directCanonical":{"AXJ-YA1509N":0,"AXJ-YA2512N":0,"AXJ-YA2812M":5,"AXJ-YA2815M":0,"AXJ-YA3419M":0,"AXJ-YA4119M":0}}
{"app":"order","state":{"computed2812Cells":2,"userExtra2812":3},"boundary":{"AXJ-YA2812M":2},"directCanonical":{"AXJ-YA1509N":0,"AXJ-YA2512N":0,"AXJ-YA2812M":2,"AXJ-YA2815M":0,"AXJ-YA3419M":0,"AXJ-YA4119M":0}}
```

주문 직접 대조 원문에서 `AXJ-YA2812M`은 2이며, 견적만 수동 추가 3을 더해 5가 된다.

### 13.4 정찰 §5 드리프트 8종 전수 결과

기존 5종은 기존 golden을 확인했고, fixture가 차이를 가리던 3종은 기존 카탈로그 행만 사용한 옵션 fixture를 추가해 다시 정본 실행했다. 기준 시점 독립 sweep은 **8행**이었고, PR #967 후속 반영 결과는 H-03 수렴으로 **7행 distinct + 1행 수렴**이다.

```text
{"id":"H-01","model":"AR-EC05","estimate":4,"order":3,"distinct":true}
{"id":"H-07","model":"AXJ-YA1509N","estimate":1,"order":0,"distinct":true}
{"id":"H-01-I-DOM-ONLY","model":"FH-LFHIF","estimate":2,"order":0,"distinct":true}
{"id":"C-01-AIR-PANEL","model":"PC4NUCK4NW","estimate":1,"order":0,"distinct":true}
{"id":"S-01-CATEGORY-DRIFT","model":"set-round-target","estimate":0,"order":4,"distinct":true}
{"id":"C-02-REMAINDER-DRIFT","model":"FH-LFHLF4W","estimate":2,"order":0,"distinct":true}
{"id":"H-03-PANEL-LOCK","model":"PC1MWSK3NW","estimate":9,"order":9,"distinct":false}
{"id":"C-09-2812","model":"AXJ-YA2812M","estimate":5,"order":2,"distinct":true}
{"total":8,"distinct":7}
```

추가한 3개 fixture는 `H-01-I-DOM-ONLY`(견적 DOM 칩만 ON), `S-01-CATEGORY-DRIFT`(기존 `set-ceiling-source` 부자재 행), `C-02-REMAINDER-DRIFT`(기존 `AM072TNCDBH1` 미분류 실내기 행)이다. 합성 제품 코드나 정본 로직은 추가하지 않았다.

### 13.5 R2 직접 테스트 GREEN 원문

```text
[견적] npx jest test/legacy-quantity-golden.test.js --runInBand
Test Suites: 1 passed, 1 total
Tests:       69 passed, 69 total

[주문] npx vitest run src/__tests__/legacy-quantity-golden.test.ts
Test Files  1 passed (1)
Tests       68 passed (68)
```

### 13.6 R2 golden 변경 목록

기존 항목 중 값이 바뀐 golden은 1건이다.

| 앱 | golden | 변경 전 | 변경 후 | 근거 |
|---|---|---:|---:|---|
| 견적 | `estimateOptionGoldens['C-09-2812']['AXJ-YA2812M']` | 2 | 5 | 계산 셀 2 + 수동 추가 3 |

주문 `orderOptionGoldens['C-09-2812']['AXJ-YA2812M']`는 2로 유지했다. 드리프트 전수 확인을 위해 다음 신규 option golden 3종은 견적·주문에 각각 추가했으며, 기존 값의 수정이 아닌 새 관측값이다: `H-01-I-DOM-ONLY`, `S-01-CATEGORY-DRIFT`, `C-02-REMAINDER-DRIFT`.

### 13.7 R2-2 뮤테이션 수치 재실행 원문

12종의 정본 도출 뮤테이션을 각 앱의 golden 테스트 파일에만 주입해 재실행했다. 저장소 전체 스위트는 실행하지 않았다.

```text
[견적] 12회
  derive-foot-round ... derive-ceiling-pump-off: exit=1 (12/12)
  Test Suites: 1 failed, 1 total
  Tests:       1 failed, 69 passed, 70 total

[주문] RED 11회
  derive-foot-round ... derive-ceiling-pump-off 중 derive-renew-filter-map 제외: exit=1 (11/12)
  Test Files  1 failed (1)
  Tests       1 failed | 68 passed (69)

[주문] derive-renew-filter-map 1회
  exit=0
  Test Files  1 passed (1)
  Tests       69 passed (69)
```

따라서 실제 합계는 **24회 중 23회 RED, 1회 정당한 GREEN**이다. 주문의 `derive-renew-filter-map` GREEN은 `isCommOutdoorRow`가 해당 fixture를 실외기로 판정하지 않아 해당 맵의 계산 경로에 도달하지 않는 기존 포팅 드리프트를 문서화한 결과다.

정본 `clients/web/estimate-app/views/index.ejs`, `clients/web/order-app/index.html` 및 `tools/legacy-gas/**`는 R2에서도 수정하지 않았다.

## 14. 2026-07-28 PR #967 후속 보정

위 §6-1·§6-3·§13.4의 당시 snapshot은 PR #967 fix 전 상태다. 후속 실행에서 `H-03-PANEL-LOCK` 주문 `PC1MWSK3NW`가 `1→9`, 별도 기록된 `C-02-I-HOSE` 견적 `FH-LFHIF`가 `0→2`로 수렴했다. 이 두 값 외 §13.4 원문 8행은 유지했다.

따라서 §13.4 원문 8행 기준 잔여 distinct는 7행이며, §6-3의 C-02 I형 항목은 8행 밖의 별도 항목이다. “8→6”은 두 목록을 합산하는 과정의 계수 불일치이므로, 실제 실행 결과는 새 보고서의 “7행 유지 + 별도 1건 수렴”을 정본으로 삼는다.

상세 RED/GREEN/mutation, golden 전체 diff 및 회귀 울타리는 `docs/dev-reports/2026-07-28-963-legacy-quantity-loss.md`를 참조한다.
