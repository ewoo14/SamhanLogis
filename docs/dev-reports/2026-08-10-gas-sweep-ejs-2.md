# GAS 전수조사 — 배정 범위 ejs-2: `index.ejs` 3301~6600행

> 조사 대상: `clients/web/estimate-app/views/index.ejs` 3301~6600행
> 고정 분모: `docs/dev-reports/2026-08-10-gas-function-inventory.md`
> 조사 원칙: 코드·테스트·스키마·마이그레이션·git 변경 없이 레거시 법칙만 조사한다. dead_code 는 grep 전수 확인 후에만 판정.

## 1. 완결성 집계

```text
배정 범위 항목 수(인벤토리 3301~6600행)   174
분류한 항목 수                            174   ← 배정 범위와 일치
  ├ 업무규칙 (이식 대상)                    81
  ├ UI·표시 전용                            60
  ├ 인프라·유틸                             20
  └ 데드코드(호출부 없음, grep 확인)        13   81+60+20+13 = 174
미분류 항목 수                              0
```

인벤토리 카운트 확인 명령:
```
awk 'NR>=11 && NR<=653' docs/dev-reports/2026-08-10-gas-function-inventory.md \
  | grep -E '^[0-9]+:' | awk -F: '{print $1}' | awk '$1>=3301 && $1<=6600' | wc -l
→ 174
```

인벤토리는 top-level `function` 선언뿐 아니라 함수 본문 내부의 유의미한 3항연산자·화살표함수·정규식 판정 줄까지 기계 추출했다. 부모 함수와 같은 규칙을 구성하는 하위 줄은 부모와 **동일하게 분류**했고(별개 규칙으로 부풀리지 않음), 표에 부모 함수명을 그대로 표기했다.

## 2. dead_code 판정 근거 (13건 — 전부 grep 전수 확인)

🚨 지시에 따라 dead_code 는 반드시 호출부 grep 결과를 남긴다. 아래 5개 함수(및 그 내부에 종속된 하위 줄)가 **`index.ejs` 전체 10,000+ 행 어디에서도 정의부 외 호출이 없음**을 확인했다. HTML 인라인 속성(`onclick=` 등) 검색도 포함된 전체 파일 grep이므로 동적 문자열 호출도 걸러진다.

| 함수 | 정의 줄 | grep 결과(정의부 포함 매치 횟수) | 비고 |
|---|---:|---:|---|
| `pickCommPanelModel` | 4130 | 1 (정의만) | 종전 조사(`2026-08-10-gas-sweep-A-estimate-1-10000.md:143`)도 동일 판정 — 교차확인 |
| `basesForSetPiecesByExistingRule_` | 4195 | 1 (정의만) | 내부에서 쓰는 `parseSetHPs`/`chooseBaseModel` 자체는 8488~8498행에서 **별도 인라인 호출로 살아있음** — 이 래퍼 함수만 죽어있고 로직 자체는 라이브 |
| `applyHomeMultiPriceVat` | 4250 | 1 (정의만, 전체 repo 검색도 이 3개 앱 사본 전부 무호출) | `order-app` 사본은 실제 반올림을 하지만 estimate-app 사본은 `roundByConfig(base)`(prefix 없음)라 항등 반환 — 애초에 no-op. 종전 조사 동일 판정 |
| `singleUnitPrice` | 4405 | 1 (정의만) | 6개 할인유형(360/4way/스탠드/1way/디럭스/1등급) 차감 로직을 담고 있으나, **동일 규칙이 `adjustSingleSetBasePrice`(3284, 범위 밖)를 통해 라이브 경로(`calcSetUnitPrice`→`adjustSingleSetBasePrice`)로 이미 적용됨** → 규칙 자체는 유실 아님, 이 사본만 미사용 |
| `bindQty` | 4710 | 1 (정의만) | 종전 조사 동일 판정 |
| `bindCommQtyEvents` | 4732 | 1 (정의만) | 종전 조사 동일 판정. 상업멀티 수동추적 세트(COMM_MANUAL_PANEL 등) 로직을 담고 있으나 미호출 — 라이브 경로는 `bindCommQtyArrowNav`(4859, 살아있음) 및 범위 밖 render 함수의 인라인 리스너가 대체 수행 |
| `setPreviewFoot` | 5064 | 1 (정의만) | 종전 조사 동일 판정 |
| `buildSingleSetCompositionHtml_` | 6522 | 1 (정의만) | 종전 조사 동일 판정. 동일 기능은 `renderSingleSetParts`(6047, 살아있음)가 대체 수행 |

grep 명령(예):
```
grep -n "\bsingleUnitPrice\b" clients/web/estimate-app/views/index.ejs
→ 4405:function singleUnitPrice(it){   (그 외 매치 없음)

grep -n "\bbindQty\b" / "\bbindCommQtyEvents\b" / "\bsetPreviewFoot\b" / "\bbuildSingleSetCompositionHtml_\b"
→ 각 정의 줄 1건씩만
```

하위 종속 줄(부모 함수가 dead면 도달 불가능하므로 동일 판정): `singleUnitPrice` 내부 4421(`isAcc` 판정), 4442(`calc` 헬퍼) / `bindCommQtyEvents` 내부 4748, 4758, 4814(방진가대류 정규식 판정 3곳).

⚠️ **`chooseBaseModel`/`parseSetHPs`/`hasExactHP`/`countBranchForSet`/`modelByNameLike` 등은 dead 아님** — 8488~8500행(범위 밖의 `recomputeCommDerived` 계열)에서 실제로 호출되는 것을 grep으로 확인했다(§4 각 항목에 근거 표기). `basesForSetPiecesByExistingRule_`만 이 함수들을 감싸는 **미사용 래퍼**이고, 실제 라이브 경로는 8488행 부근에서 동일 로직을 인라인으로 재구현한 것이다(괄호 치환 방식이 래퍼와 다르다는 점은 `docs/dev-reports/896-gas-formula-agg/EXCEPTIONS.txt` [E14]도 지적함 — 이식 시 라이브 인라인 버전을 기준으로 삼을 것, 범위는 8000번대라 ejs-3 담당).

## 3. 전수 분류표 (174건)

범례: BR=업무규칙 · UI=UI전용 · IU=인프라유틸 · DC=데드코드. 하위 줄은 `└` 로 부모 규칙에 종속됨을 표시.

| 줄 | 함수/항목 | 분류 |
|---:|---|---|
| 3317 | `roundK` | BR |
| 3323 | `roundByConfig` | BR |
| 3346 | `isIndoorUnitPart` | BR |
| 3359 | `isOutdoorUnitPart` | BR |
| 3370 | `splitIndoorOutdoorToK` | BR |
| 3384 | └ (mod 보정, splitIndoorOutdoorToK) | BR |
| 3398 | `analyzeSingleSetDiscountFlags` | BR |
| 3403 | └ (isAcc 판정) | BR |
| 3428 | `closeSpecModal` | UI |
| 3432 | `getSpecModelName` | UI |
| 3438 | `getSpecModalCanvas` | UI |
| 3463 | `copySpecImage` | UI |
| 3477 | `saveSpecImage` | UI |
| 3486 | `openSpecModalByItem` | UI |
| 3495 | └ (isErv, openSpecModalByItem) | UI |
| 3532 | `formatSpecialPriceForDisplay` | UI |
| 3537 | `renderHomeSpec_` | UI |
| 3579 | `renderSingleSpec_` | UI |
| 3675 | `renderCommSpec_` | UI |
| 3684 | └ (isSetOutdoor) | UI |
| 3687 | └ (compParts) | UI |
| 3782 | `renderErvSpec_` | UI |
| 3792 | └ (join_) | UI |
| 3826 | `renderPanelSpecCommon_` | UI |
| 3838 | `buildTripleSpecRows_` | UI |
| 3853 | `specTableWithTriple_` | UI |
| 3865 | └ (val) | UI |
| 3894 | └ (tVal) | UI |
| 3904 | `renderComponentSpecs_` | UI |
| 3906 | └ (s) | UI |
| 4003 | └ (head) | UI |
| 4018 | `specTable_` | UI |
| 4027 | └ (val) | UI |
| 4039 | `rawNameOf` | IU |
| 4044 | `isCommIndoorRow` | BR |
| 4050 | `isCommOutdoorRow` | BR |
| 4056 | `commIndoorKind` | BR |
| 4066 | `isCommPanelRow` | BR |
| 4067 | └ (s) | BR |
| 4072 | `isCommHoseRow` | BR |
| 4073 | └ (s) | BR |
| 4078 | `isCommRemoteRow` | BR |
| 4079 | └ (s) | BR |
| 4084 | `isCommPumpRow` | BR |
| 4085 | └ (s) | BR |
| 4090 | `computeCommRemoteModelForIndoor_` | BR |
| 4092 | └ (opt) | BR |
| 4122 | `pickHoseModel` | BR |
| 4130 | `pickCommPanelModel` | **DC** |
| 4137 | `hasExactHP` | BR |
| 4143 | `parseSetHPs` | BR |
| 4150 | `chooseBaseModel` | BR |
| 4195 | `basesForSetPiecesByExistingRule_` | **DC** |
| 4207 | `modelByNameLike` | IU |
| 4212 | └ (row) | IU |
| 4213 | └ (s) | IU |
| 4220 | `countBranchForSet` | BR |
| 4224 | └ (plus) | BR |
| 4237 | `rgbForMid` | UI |
| 4250 | `applyHomeMultiPriceVat` | **DC** |
| 4257 | `normalizeHomeCategory` | BR |
| 4272 | `isExpansionModel` | BR |
| 4285 | `classifySingleSetFixed` | BR |
| 4286 | └ (hay) | BR |
| 4287 | └ (mdl) | BR |
| 4326 | `priceFrom` | IU |
| 4328 | └ (first) | IU |
| 4344 | `homeUnitPrice` | BR |
| 4379 | └ (finalRate) | BR |
| 4390 | `partUnitPrice` | BR |
| 4405 | `singleUnitPrice` | **DC** |
| 4421 | └ (isAcc, singleUnitPrice) | **DC** |
| 4442 | └ (calc, singleUnitPrice) | **DC** |
| 4455 | `commUnitPrice` | BR |
| 4456 | └ (r) | BR |
| 4490 | └ (finalRate) | BR |
| 4501 | `singleDispNameTrimmed` | BR |
| 4508 | └ (size) | BR |
| 4520 | `_HOSE_I_ANY`(상수) | BR |
| 4522 | `FOOT_ROUND`(상수) | BR |
| 4523 | `FOOT_FLAT`(상수) | BR |
| 4524 | `REMOTE_WIRED`(상수) | BR |
| 4525 | `REMOTE_WIRED_COLOR`(상수) | BR |
| 4526 | `REMOTE_WIRED_KIT`(상수) | BR |
| 4527 | `REMOTE_WIRELESS`(상수) | BR |
| 4529 | `REMOTE_INF_DEFAULT`(상수) | BR |
| 4530 | `REMOTE_COLOR_AIRCOMBO`(상수) | BR |
| 4538 | `SS_WIRED_BOARD_ID`(상수) | BR |
| 4539 | `SS_CEILING_PUMP_ID`(상수) | BR |
| 4540 | `SS_FOOT_ROUND_ID`(상수) | BR |
| 4541 | `SS_FOOT_FLAT_ID`(상수) | BR |
| 4546 | `markAutoHome` | IU |
| 4547 | `markAutoSingle` | IU |
| 4560 | `trackInteraction` | IU |
| 4605 | `applyAbsoluteLock` | IU |
| 4630 | └ (value setter guard) | IU |
| 4648 | └ (style.color guard) | IU |
| 4666 | `sumHome` | IU |
| 4667 | `sumSingles` | IU |
| 4668 | `sumComm` | IU |
| 4673 | `syncCommTotals` | UI |
| 4689 | `setFootSum` | UI |
| 4710 | `bindQty` | **DC** |
| 4732 | `bindCommQtyEvents` | **DC** |
| 4748 | └ (COMM_MANUAL_BASE, bindCommQtyEvents) | **DC** |
| 4758 | └ (COMM_MANUAL_BASE, bindCommQtyEvents) | **DC** |
| 4814 | └ (COMM_MANUAL_BASE, bindCommQtyEvents) | **DC** |
| 4859 | `bindCommQtyArrowNav` | UI |
| 4880 | `getCapacity` | IU |
| 4887 | `updateHomeRatio` | BR |
| 4961 | └ (ratio) | BR |
| 4974 | `updateCommRatio` | BR |
| 5016 | └ (missingBranch) | BR |
| 5041 | └ (ratio) | BR |
| 5064 | `setPreviewFoot` | **DC** |
| 5080 | `materialsSumForSet` | BR |
| 5081 | └ (includeMat) | BR |
| 5085 | `isDefaultComponent_` | BR |
| 5089 | `getDefaultRemoteRows` | BR |
| 5090 | `getOptionRemoteRow` | BR |
| 5097 | `allowRemoteChange_` | BR |
| 5101 | `is1WaySet_` | BR |
| 5102 | └ (t) | BR |
| 5106 | `getBasePanelRow` | BR |
| 5107 | `pickPanelRow` | BR |
| 5124 | `setBasePriceRightFirst` | BR |
| 5134 | `calcSetUnitPrice` | BR |
| 5149 | └ (panelExcluded) | BR |
| 5192 | `partsForSetStrict_` | IU |
| 5199 | `explodeSetParts` | BR |
| 5203 | └ (includeMat) | BR |
| 5335 | `partsForCommSet_` | IU |
| 5337 | └ (rows) | IU |
| 5346 | `inferStandCountForOutdoor_` | BR |
| 5353 | `recalcCommAccessories` | BR |
| 5355 | └ (outdoorModels) | BR |
| 5382 | `escapeFilterRe_` | IU |
| 5386 | `applyHomeFilter` | UI |
| 5388 | └ (text) | UI |
| 5407 | `applySingleFilter` | UI |
| 5409 | └ (text) | UI |
| 5427 | `applyCommFilter` | UI |
| 5429 | └ (text) | UI |
| 5449 | `updateHomeFilterOptions` | UI |
| 5454 | └ (text) | UI |
| 5511 | `updateSingleFilterOptions` | BR |
| 5515 | └ (text) | BR |
| 5522 | └ (size, 13평 프레스티지 제외) | BR |
| 5565 | `updateCommFilterOptions` | UI |
| 5575 | └ (text) | UI |
| 5675 | `initFilters` | UI |
| 5689 | └ (syncIcon, home) | UI |
| 5703 | └ (syncIcon, single) | UI |
| 5719 | └ (syncIcon, comm) | UI |
| 5728 | `renderHome` | UI |
| 5812 | └ (groupTop) | UI |
| 5971 | └ (updateHomeRowPrice) | UI |
| 6047 | `renderSingleSetParts` | UI |
| 6087 | └ (pKey) | UI |
| 6103 | └ (getRank) | UI |
| 6104 | └ (k) | UI |
| 6135 | └ (pKey) | UI |
| 6171 | └ (baseP) | UI |
| 6234 | `renderSingle` | UI |
| 6244 | └ (size) | UI |
| 6299 | └ (currentPrice) | UI |
| 6304 | └ (groupTop) | UI |
| 6306 | └ (szVal) | UI |
| 6312 | └ (idx) | UI |
| 6377 | └ (isManual) | UI |
| 6454 | └ (realId) | UI |
| 6522 | `buildSingleSetCompositionHtml_` | **DC** |
| 6590 | `normalizeCommCategory` | BR |
| 6598 | `fixCommMidCategory` | BR |

## 4. 업무규칙(business_rule) 상세 — 45개 규칙 단위, 81개 줄

### G1. `roundK(n)` — 3317
② n(임의 금액) → `Math.round(n/1000)*1000` (천원 단위 반올림)
③ 상수: `1000`
④ 읽는 값: 없음(순수 계산)
⑤ [표현 가능] — 저장 컬럼 불필요, 계산 로직
⑥ [자동] 계산 유틸 그대로 이식. 결정 불요.

### G2. `roundByConfig(n, prefix)` — 3323
② `prefix`없음→그대로 반환. `#{prefix}_round_unit`(단위)·`#{prefix}_round_mode`(모드, 기본 `'ROUND'`) DOM값을 읽어 `unit>0`이면 `CEIL`/`FLOOR`/`ROUND`로 그 단위 반올림
③ 모드 3종: `CEIL`/`FLOOR`/`ROUND`(기본)
④ 읽는 값: 화면 상단 "단위처리" select/입력(시트 컬럼 아님 — 견적 세션 UI 설정)
⑤ [불가: 무엇이 없는가] — 견적 단위의 반올림 단위/모드를 저장하는 테이블이 스키마에 없음(품목 스키마 범위 밖, estimate 세션 설정 영역)
⑥ 🚩[결정 필요] — 견적카테고리 고정 규칙으로 승격할지, 견적건마다 입력하는 UI 설정으로 유지할지(→ 품목 기본값 대상 아님일 가능성 높음, decisions_needed #5 참조)

### G3~G4. `isIndoorUnitPart(p)` / `isOutdoorUnitPart(p)` — 3346, 3359
② 구성품 `kind`/`name`에 "실외기"/"실내기" 포함 여부로 실내/실외 판별, 판넬·리모컨·자재·발통(=`isPanel/isRemote/isMaterial/isFoot`, 범위 밖 헬퍼)은 배분 대상에서 제외
③ 상수 없음(정규식 `/실내기/i`, `/실외기/i`)
④ 읽는 값: `bundle_component.component_kind`, `products.name`에 해당하는 GAS 쪽 `kind`/`name` 필드
⑤ [표현 가능: `bundle_component.component_kind`] — 우리 스키마는 이미 `INDOOR`/`OUTDOOR` enum(§2 dead_code 근거의 `bundle_component` 카운트: OUTDOOR 415·INDOOR 279)을 갖고 있어 이름 정규식 없이 바로 판별 가능
⑥ [자동] `bundle_component.component_kind IN ('INDOOR','OUTDOOR')` 그대로 사용. 결정 불요.

### G5. `splitIndoorOutdoorToK(setUnit, fixedSum, ratioIn, ratioOut)` — 3370, 3384
② 세트 총액에서 고정부품 합계를 뺀 잔액을 `ratioIn:ratioOut` 비율로 나눠 실내기는 먼저 천원단위 반올림, 실외기는 잔액에서 역산 후 나머지(mod)를 실내기↔실외기 사이로 이동해 **양쪽 다 정확히 천원 단위**가 되도록 보정. 음수 방지 클램프.
③ 상수: 반올림 단위 `1000`
④ 읽는 값: `setUnit`(세트 총액), `fixedSum`(고정부품 합), `ratioIn/ratioOut`(호출부에서 6:4 또는 4:6, G40 참조)
⑤ [표현 가능] — 순수 배분 알고리즘, 저장 불필요(견적 라인 생성 시 계산 로직으로 이식)
⑥ [자동] 알고리즘 그대로 이식. 결정 불요.

### G6. `analyzeSingleSetDiscountFlags(s)` — 3398, 3403
② 싱글중대형 세트가 부자재/받침대류(`/리모컨|리모콘|자재|부자재|보드|키트|KIT|중계기|발통|드레인펌프|일자발|분\s*기\s*관|분기관/i` 매칭 또는 `catL==='acc'`)이거나 모델코드가 `AC/AP/AR/AF`로 시작하지 않으면 전 항목 `false`. 아니면 `getModelFlags(model)`(범위 밖, 2368행)이 반환하는 `is360/is4way/isStand/is1way/isDeluxe/isGrade1` 각각을, 대응 DOM 할인입력(`#ss_disc_360` 등)이 0보다 클 때만 `true`로 반환
③ 상수: DOM id 6종 `ss_disc_360/4way/stand/1way/deluxe/grade1`
④ 읽는 값: `products.model_code`(접두사), `products.name`(제외 정규식), `products.discount_flags`(추정 — `getModelFlags`가 판정하는 원천, 범위 밖)
⑤ [부분: `products.discount_flags`] — "이 모델이 어떤 할인유형에 해당하는가"는 `discount_flags`로 표현 가능하나, "할인 원단위 금액을 입력했을 때만 적용"이라는 **UI 게이트 조건**은 스키마 항목이 아니라 견적 작성 화면의 입력 상태
⑥ [자동] 분류축은 `products.discount_flags` 그대로 사용. 원단위 할인액은 견적건별 입력값이라 품목 기본값 대상 아님.

### G7~G13. 상업멀티 구성요소 판별 6종 — `isCommIndoorRow`(4044) / `isCommOutdoorRow`(4050) / `commIndoorKind`(4056) / `isCommPanelRow`(4066) / `isCommHoseRow`(4072) / `isCommRemoteRow`(4078) / `isCommPumpRow`(4084)
② 조건→결과표:

| 함수 | 조건 | 결과 |
|---|---|---|
| isCommIndoorRow | model 7자리 이상 & `AM`로 시작 & 7번째 문자==`N` | 실내기 |
| isCommOutdoorRow | model 7자리 이상 & `AM`로 시작 & 7번째 문자==`X` | 실외기 |
| commIndoorKind | name에 `360`/`4way`/`2way`/`1way` 매칭 | 해당 문자열('360'/'4way'/'2way'/'1way') 또는 '' |
| isCommPanelRow | name+disp+model에 `판넬|panel` | 판넬 |
| isCommHoseRow | 위 문자열에 `유연호스` | 유연호스 |
| isCommRemoteRow | 위 문자열에 `리모컨|remote` | 리모컨 |
| isCommPumpRow | 위 문자열에 `드레인펌프|펌프` | 드레인펌프 |

③ 상수: 모델코드 위치 규칙(7번째 문자 `N`=실내/`X`=실외), 정규식 6종
④ 읽는 값: `products.model_code`, `products.name`
⑤ [부분] — `isCommIndoorRow/isCommOutdoorRow`는 `bundle_component.component_kind`(INDOOR/OUTDOOR)로 이미 대체 가능(§G3~G4와 동일 결론). 나머지 4종(판넬/호스/리모컨/펌프)은 `bundle_component.component_kind`에 `PANEL`/`REMOTE`/`ACCESSORY`가 있으나 "유연호스"·"드레인펌프"를 구분하는 세부 축은 없음 — `component_variant` 컬럼으로 세분화 가능해 보이나 현재 값 채움 여부 미확인
⑥ [자동] 실내/실외는 `bundle_component.component_kind`. 판넬/리모컨은 `component_kind`. 호스/펌프 세분류는 🚩[결정 필요] — `component_variant`에 '유연호스'/'드레인펌프' 같은 표준 태그를 채울지, 아니면 정규식 판별을 유지할지(decisions_needed #6).

### G14. `computeCommRemoteModelForIndoor_(row)` — 4090, 4092
② 조건→결과(우선순위 순):

| 조건 | 결과 |
|---|---|
| 옵션(`#comm_remote`)==`'제외'` | `''`(리모컨 없음) |
| 실내기 name에 `전열교환기` | `AWR-VH12N` |
| name에 `덕트`/`DUCT` & 옵션==`'컬러유선'` | `AWR-WG00N` |
| name에 `덕트`/`DUCT`(그 외) | `AWR-WE13N` |
| 옵션==`'유선'` | `AWR-WE13N` |
| 옵션==`'컬러유선'` | `AWR-WG00N` |
| 옵션==`'무선'` & name에 `UV-?C` | `AR-CH01` |
| name에 `인피니트` | `AR-CH01` |
| name에 `360` | `AR-EH05` |
| 기본값(그 외 전부) | `AR-EH05` |

③ 모델코드 상수: `AWR-VH12N`, `AWR-WG00N`, `AWR-WE13N`, `AR-CH01`, `AR-EH05`(전부 `products.model_code`에 실재 확인 — §DB조회)
④ 읽는 값: `#comm_remote` select 옵션(견적 화면 입력), 실내기 `products.name`
⑤ [부분] — 리모컨 후보 모델코드 자체는 `products`에 존재하지만, "실내기 옵션 조합→어떤 리모컨 1개를 자동으로 붙이는가"라는 매핑은 `bundle_component`(REMOTE, is_default)나 `quantity_sync_rule`에 아직 없음(§3 dead_code 근거에서 `bundle_component`엔 REMOTE 316행이 있으나 이 "옵션별 전환" 축은 조건부 스위치라 정적 매핑이 아님)
⑥ 🚩[결정 필요] — 이 조건표를 `quantity_sync_rule.condition_json`(REMOTE 옵션값 기준 target 전환)으로 이식할지, 프런트 상수 매핑으로 유지할지. 모델코드 자체는 위 표를 그대로 사용하면 됨(decisions_needed #6).

### G15. `pickHoseModel(kind)` — 4122
② `kind==='1way'`→`SHOW_I_HOSE` 플래그로 `HOSE_I_1W` 또는 `HOSE_1W` 중 존재하는 쪽; `kind∈{'4way','360'}`→`HOSE_I_4W`/`HOSE_4W`; 그 외 `''`
③ 참조 상수: `HOSE_1W`, `HOSE_4W`, `HOSE_I_1W`, `HOSE_I_4W`(ejs-1 범위 4516~4519에서 이름 정규식으로 유도된 모델코드, 이 파일 안에서는 4520행만 제가 관측)
④ 읽는 값: `window.SHOW_I_HOSE`(전역 UI 토글), 호스 계열 모델코드
⑤ [부분] — 호스 모델코드 자체는 `products.model_code`로 표현 가능하나 "1way/4way 세트에 어떤 호스가 기본 부착되는가"는 `bundle_component`(MATERIAL/ACCESSORY)로 옮겨야 함
⑥ 🚩[결정 필요] — I형/L형 호스 선택을 사용자 토글로 유지할지, 세트별 `bundle_component.is_default` 값으로 고정할지(decisions_needed #6과 통합).

### G16~G18. `hasExactHP(nm,hp)`(4137) / `parseSetHPs(nm)`(4143) / `chooseBaseModel(nm)`(4150) — ⚠️ 최우선 검토 대상
> 라이브 확인: 세 함수 모두 8488~8500행(`recomputeCommDerived` 계열, 범위 밖)에서 실제 호출됨 — grep: `hasExactHP`(4161,4164,4165 자기참조 + 살아있음), `parseSetHPs`(4197 dead 래퍼 + **8488 라이브**), `chooseBaseModel`(4201 dead 래퍼 + **8490, 8498 라이브**).

② 조건→결과(핵심 규칙 — **개발책임자 지시대로 "이름에서 추론" 금지 대상**):
- `hasExactHP`: 정규식 `(^|[^0-9.])${hp}HP([^0-9.]|$)` 로 이름에서 "정확히 그 HP 토큰"이 있는지 판별 (예: "12HP"는 매칭, "112HP"는 불매칭)
- `parseSetHPs`: 이름의 첫 괄호 안 문자열을 `+`로 split해 숫자만 남긴 HP 배열 추출 (예: `"...(16HP+20HP)..."` → `['16','20']`)
- `chooseBaseModel`: 이름에서 브랜드라인 플래그(`isPrime`=프라임, `isCold`=한랭지, `isStd`=표준형, `isCoolTop`=냉방전용 상부토출, `isECO`=ECO, `isGHP`=가스히트펌프, `isExtra`=프레스티지|동시냉난방|공장전원)를 정규식으로 판정한 뒤, HP 토큰이 아래 표에 해당하면 받침대(방진가대) 모델코드를 배열로 반환:

| 브랜드라인 | HP 토큰 | 받침대 모델코드 |
|---|---|---|
| ECO | 4,5,6,3.5 | `SI-AL600a` |
| ECO | 8,10,12,14,7.5 | `SI-AL700a` |
| GHP(모든 HP) | — | `GHP방진가대`, `ACL-KORGHP07`(2개 동시 추가) |
| 프라임/한랭지/표준형/냉방전용상부토출/(프레스티지·동시냉난방·공장전원) | 8,10,12(±14 라인별 상이) | `방진가대S2소` |
| 프라임/한랭지/표준형/냉방전용상부토출/(프레스티지 등) | 14~30(라인별 상이, 아래) | `방진가대S2중` |
| 프라임/표준형/냉방전용상부토출 | 22,24 / 30,32,34 / 32,34 | `방진가대S2대` |

세부 HP 임계값(라인별 상이, S2중 예):
- 프라임: 14,16,18,20 | 한랭지: 14,16,18,20,22,24 | 표준형: 16,18,20,22,24,26,28 | 냉방전용상부토출: 16,18,20,22,24,26,28,30 | 프레스티지 등: 14,16,18,20

③ 상수: 모델코드 `SI-AL600a`, `SI-AL700a`, `GHP방진가대`, `ACL-KORGHP07`, `방진가대S2소`, `방진가대S2중`, `방진가대S2대`(전부 §DB조회로 `products.model_code` 실재 확인). HP 임계값 배열은 위 표 그대로.
④ 읽는 값: 상업멀티 실외기 `products.name`(브랜드라인·HP 토큰 파싱 원천), 세트명 괄호 안 HP 조합
⑤ [불가: 무엇이 없는가] — "이 실외기 SKU를 선택하면 이 받침대가 자동으로 붙는다"는 관계가 `bundle_component`/`quantity_sync_*` 어디에도 없음(§DB조회: `GHP방진가대`/`방진가대S2*` component_product_code 로 걸리는 `bundle_component` 행 0건)
⑥ 🚩[결정 필요] — **개발책임자 지시대로 이름·HP 파싱을 이식하지 않고**, 위 표를 `(실외기 model_code, 받침대 model_code, 수량=1)` 행 집합으로 환원해 `quantity_sync_source`/`quantity_sync_target`(또는 `bundle_component`)에 채워야 함. 다만 "어느 실외기 SKU가 '프라임'/'한랭지'/'표준형'/'냉방전용 상부토출' 라인에 속하는가"는 실제 COMMULTI 카탈로그 수백 개 SKU를 이 규칙으로 1건씩 매칭해야 나오는 **데이터 산출물**이라 이 보고서에서 손으로 다 나열하지 않았다. 후속 스크립트(위 표의 정규식·HP임계값을 그대로 이식해 활성 상업멀티 실외기 전수를 매칭)로 자동 생성할 것을 권고(decisions_needed #3).

### G19. `countBranchForSet(nm)` — 4220, 4224 (라이브 확인: 8496행 `branchCnt += countBranchForSet(nm) * q;`)
② 이름의 첫 괄호 안 문자열에서 `+` 개수를 세어 "세트 1대당 필요 분기관 수" 반환 (예: `"(16HP+20HP)"` → `+` 1개 → 분기관 1개)
③ 상수 없음(구분자 `+`)
④ 읽는 값: 세트 `products.name`(괄호 안 HP 조합 표기)
⑤ [불가] — "이 멀티조합 세트에 분기관이 몇 개 필요한가"라는 관계가 스키마에 없음. `bundle_component`(component_kind 미분류) 또는 `quantity_sync_rule`(조건: 세트 구성 실외기 대수-1) 로 대체 가능해 보임
⑥ 🚩[결정 필요] — "분기관 수 = 세트 구성 실외기 대수 − 1"이라는 산식 자체는 이름 파싱 없이도 `bundle_component`에서 그 세트의 OUTDOOR 구성행 개수로 계산 가능(개수-1). 이름 파싱을 아예 없애고 이 산식으로 대체할지 확인 필요(decisions_needed #3에 통합).

### G20. `normalizeHomeCategory(row)` — 4257 ⚠️ 카테고리 정규화 핵심 규칙
② 조건→결과표:

| 조건(name/model 정규식) | catL | catM |
|---|---|---|
| name에 `분\s*기\s*관`/`Y형 분기관` 또는 model이 `AXJ-YA2512N`/`AXJ-YA1509N` | `부자재` | `분기관` |
| model이 `AWR-WV00N` 또는 (name에 `(에어콤보\|콤보).*(유선\|리모컨)` & `컬러` 미포함) | `부자재` | `리모컨` |
| name에 `전열\s*교환기`/`에어콤보`/`에어콤포` | `전열교환기`(콤보 포함시 M=`에어콤보`) | — |
| name에 `인테리어핏` | `인테리어핏` | — |
| name에 `시스템\s*제습`/`제습기` | `시스템제습기` | — |
| name+model에 `발통`/`받침대`/`SI-AL700a`/`일자발` | `실외기 받침대`(원형→M=`원형발통`, 일자발/SI-AL700a→M=`일자발`) | — |
| name에 `1\s*-?\s*Way.*인피니트` | — | UV포함→`1-Way 인피니트 UV`, 아니면 `1-Way 인피니트 일반` |

③ 상수: model 리터럴 `AXJ-YA2512N`,`AXJ-YA1509N`,`AWR-WV00N`,`SI-AL700a`
④ 읽는 값: `products.name`, `products.model_code`, (기존)`row.catL/catM/catS` 원본값(시트 카테고리 컬럼)
⑤ [부분: `classification.name`(L/M) 또는 `products.cat_l_id/cat_m_id`] — 스키마는 이미 계층형 `classification`을 갖고 있어 이 규칙이 만드는 "보정된 카테고리"가 곧 `classification` 테이블의 정본 값이 되어야 함. 현재 원본 시트 카테고리(`catL/catM`)와 이 정규화 후 값이 다른 경우가 존재한다는 것이 이 함수의 존재 이유
⑥ [자동] 위 표의 최종 결과값을 `classification.name`(L/M 레벨) 시드 데이터로 그대로 채택. 단, `products` 3,084건 전체에 대해 원본 시트값과 정규화 후 값이 실제로 갈리는 행이 몇 건인지는 카탈로그 전수 대조가 필요 — 표 자체는 결정 완료, 대조 작업만 후속 필요(자동값 판정에는 영향 없음, decisions_needed 아님).

### G21. `isExpansionModel(s)` — 4272 ⚠️ 기본 노출 여부 규칙
② 조건→결과: model이 `AC?????CS`이고 name에 `프레스티지` 포함 → 확장형 / model이 `AP?????CA` → 확장형 / model이 `AF70` + 8~10번째 문자가 `24`나 `25` → 확장형 / model이 `AF80`나 `AF90`으로 시작 → 항상 확장형. 확장형이면 `#ss_expand` 체크박스를 켜지 않는 한 목록에서 **완전히 숨김**(필터·렌더 양쪽에서 제외, G43 참조)
③ 상수: model 접두사 패턴 `AC**CS`,`AP**CA`,`AF70**{24,25}`,`AF80*`,`AF90*`
④ 읽는 값: `products.model_code`, `products.name`
⑤ [불가: 무엇이 없는가] — "기본 숨김, 체크박스로만 노출"이라는 상태를 표현할 필드가 없음. `product_estimate_exposure`(견적카테고리 M:N)는 카테고리별 노출/비노출은 표현하나 "기본 제외·토글로 재노출"이라는 3단계 상태는 아님. `goods_type`이 후보이나 값 목록 미확인
⑥ 🚩[결정 필요] — **실측: 이 조건에 해당하는 활성(`status='ACTIVE'`) 품목 149건**(쿼리: `model_code ~ '^AC.{3}CS' AND name ILIKE '%프레스티지%'` 등 OR 결합, 아래 SQL 참고). `goods_type`에 신규값(예: `SPECIAL_EDITION`)을 추가해 표현할지, `product_estimate_exposure`에 "기본 비노출" 플래그를 얹을지 결정 필요(decisions_needed #1).
```sql
SELECT count(*) FROM products WHERE status='ACTIVE' AND (
  (model_code ~ '^AC.{3}CS' AND name ILIKE '%프레스티지%') OR
  model_code ~ '^AP.{3}CA' OR model_code ~ '^AF70.{4}(24|25)' OR
  model_code ~ '^AF80' OR model_code ~ '^AF90'); -- → 149
```

### G22. `classifySingleSetFixed(s)` — 4285~4287 ⚠️ 싱글중대형 분류 엔진(최대 규칙)
② 조건→결과표(순서대로 첫 매치 채택):

| 조건(name/model/spec 소문자 결합) | catL | catM |
|---|---|---|
| model == `ADP-F075SP` | `부자재` | — |
| `발통`/`일자발`/`받침` | `실외기 받침` | — |
| `360`/`cst` | `360`(CST UV 포함시 M=`CST UV`) | — |
| `4way`/`4 way` & 냉난방 | `4way 냉난방`(추가: 프레스티지→M=`프레스티지`, 프리미엄/디럭스→`프리미엄/디럭스`, 1등급→`1등급`) | 위 참조 |
| `4way`/`4 way` & 냉방전용/냉전 | `4way 냉방전용` | — |
| `1way`/`1 way` & 냉난방/냉방전용 | `1way 냉난방` / `1way 냉방전용` | — |
| `덕트`/`duct` | `덕트` | — |
| `실링` | `실링` | — |
| `스탠드` & `비스포크` | `비스포크 스탠드`(콰이엇그레이/세이지블루/프라임핑크 색상 M) | — |
| `스탠드` & 냉난방(비스포크 아님) | `냉난방 스탠드`(프레스티지/프리미엄·디럭스/1등급 M) | — |
| `스탠드` & 냉방전용 | `냉전 스탠드`(프레스티지 M) | — |
| `벽걸이` & 냉난방 | `냉난방 벽걸이`(무풍 M) | — |
| `벽걸이` & 냉방전용 | `냉전 벽걸이`(무풍/일반 M) | — |
| `가정용` | `가정용 에어컨` (M: 무풍콤보갤러리프로 / Q9000 / 무풍클래식 / 무풍갤러리 / 기본값=24년형) | — |
| `기타` & (kit/키트/중계기/리모컨/유연호스/드레인펌프/유선보드/board/보드/멀티wifi) | `부자재` | — |

③ 상수: model 리터럴 `ADP-F075SP`, 색상명 3종(콰이엇 그레이/세이지 블루/프라임 핑크), 브랜드 M값 목록(프레스티지/프리미엄·디럭스/1등급/무풍콤보갤러리프로/Q9000/무풍클래식/무풍갤러리/24년형)
④ 읽는 값: `products.name`, `products.model_code`, `products.classification_manual`(spec 텍스트로 추정)
⑤ [부분: `classification.name`(L/M), `products.cat_l_id/cat_m_id`] — 이 표 전체가 `classification` 시드 데이터의 원천 규칙. 스키마상 표현은 가능하나 조건 우선순위(첫 매치)와 다중 정규식 결합은 데이터가 아닌 **분류 판정 절차**라 마이그레이션 시점에 1회 실행할 매핑 스크립트로 처리해야 함
⑥ [자동] 표의 최종 L/M 매핑을 `classification` 시드값으로 채택. 스크립트 실행은 후속작업이나 규칙 자체는 확정(결정 불요). 단 `products.classification_manual` 플래그가 있는 품목은 이 자동판정을 덮어쓰지 않는 것으로 이미 스키마가 대응.

### G23. `homeUnitPrice(model)` — 4344, 4379 ⚠️ 홈멀티 단가 산정 핵심 규칙
② 조건→결과:
1. `home_hose_i` 미체크 & name에 `유연호스 I형` → **고정 8,000원** (조기 반환)
2. 수동 출고가 오버라이드(`homeCustomListPrices`) 있으면 그 값 사용, 없으면 `getBaseListPrice`(범위 밖) 결과
3. `useK2`(변동DC 체크, 행별 override 가능) & 출고가>0 → `parseFixedDc(고정DC입력값)`(범위 밖, 3126행)이 있으면 그 율, 없으면 전역 `#home_rate`(기본 `'45'`)/100 → `납품가 = round(출고가 × (1-율))`
4. 미체크 → 시트 자체 가격(`sheetPrice`)이 있고 출고가 수동입력 아니면 시트가, 아니면 출고가 그대로
5. 최종 `roundByConfig(computed, 'home')`(G2)로 단위 반올림

③ 상수: **고정단가 8,000원**(I형 호스), **전역 기본 할인율 45%**(`#home_rate` DOM 기본값)
④ 읽는 값: `products.name`(I형 호스 판별), `products.release_price`(list), `products.delivery_price`(sheetPrice 추정), `products.fixed_discount_rate`(고정DC), `products.has_variable_discount`(useK2 추정)
⑤ [부분] — 스키마에 `fixed_discount_rate`·`has_variable_discount`가 이미 있어 축 자체는 표현 가능. 다만 **전역 기본율 45%가 어디에도 저장되지 않음**(현재는 화면 입력값) — `classification.fixed_discount_rate`가 0건이라는 실측과 맞물려, "품목에 고정율이 없을 때 무엇을 기본율로 쓰는가"가 빠져있음
⑥ [자동] 8,000원 고정가·라운딩 로직은 그대로 이식. 🚩[결정 필요] 전역 기본율 45%를 `classification.fixed_discount_rate`류 시스템 기본값으로 승격할지, 여전히 견적건별 입력으로 둘지(decisions_needed #4).

### G24. `partUnitPrice(p)` — 4390
② I형 호스 미노출시 8,000원 고정. 아니면 `priceFrom(p, {price/unitPrice, list/출고가/listPrice/msrp})`. `#chkSingleInc` 체크 & `PRICE_INC.single[model].price` 있으면 그 값으로 덮어씀(인상가 반영)
③ 상수: 8,000원
④ 읽는 값: `products.release_price`/`delivery_price`, (범위 밖) `PRICE_INC` 인상가 테이블
⑤ [부분] — 8,000원 고정가는 표현 가능. `PRICE_INC`(가격 인상 예정표)에 대응하는 스키마 요소 미확인(가격 이력/예정가 테이블 존재 여부는 범위 밖)
⑥ [자동] 8,000원 고정가 이식. 인상가 반영 여부는 견적 작성 시점 토글이라 품목 기본값 대상 아님.

### G25. `commUnitPrice(model)` — 4455, 4456, 4490 (G23과 동일 구조, 상업멀티용)
② 로직 동일(G23 참조), `#comm_hose_i`/`#comm_rate`(기본 `'45'`)만 상업멀티용으로 치환
③ 상수: 8,000원(I형호스), 전역 기본율 45%(`#comm_rate`)
④~⑥ G23과 동일 결론(decisions_needed #4에 통합, 홈/상업 공통 이슈).

### G26. `singleDispNameTrimmed(s,cls)` — 4501, 4508
② model이 `ADP-F075SP`면 무조건 `"실링용 드레인펌프"`로 표시명 고정. 아니면 분류 토큰(catL/catM 파생 단어)들을 원본 name에서 제거 후 정리, 사이즈(`sizeText`/`size`)를 `"N평형"`으로 접미
③ 상수: model 리터럴 `ADP-F075SP` → 고정 문자열 `"실링용 드레인펌프"`
④ 읽는 값: `products.name`, `products.pyong_size`
⑤ [표현 가능: `products.name`] — 표시명 정리는 UI 가공이나, `ADP-F075SP`의 하드코딩 오버라이드는 곧 **정본 표시명**이라 `products.name` 값 자체가 이미 이 문자열과 일치하는지 확인이 필요한 항목
⑥ [자동] `products.name`을 그대로 사용(하드코딩 오버라이드가 이미 DB name과 일치하면 결정 불요, 불일치 시 name을 갱신). 사이즈 접미는 `pyong_size` 기반 표시 로직으로 그대로 이식.

### G27. 자동 부속 모델코드 상수 블록 — 4520,4522,4523,4524,4525,4526,4527,4529,4530,4538,4539,4540,4541 (13줄)
② `HOMEMULTI`/`SINGLE_SETS` 카탈로그에서 이름 정규식으로 "자동 부속 후보 1개"를 찾아 전역 상수로 고정하는 블록. 매칭 규칙:

| 상수 | 정규식(요약) | 역할 |
|---|---|---|
| `_HOSE_I_ANY` | `유연호스.*(I형\|아이형)`(1way/4way 아님 우선, 없으면 아무 I형) | I형 호스 기본후보 |
| `FOOT_ROUND` | `원형발통\s*세트\|발통세트` | 원형발통 |
| `FOOT_FLAT` | `SI-AL700a` | 일자발 |
| `REMOTE_WIRED` | `유선\s*리모컨`(컬러 제외) | 유선 리모컨 |
| `REMOTE_WIRED_COLOR` | `컬러\s*유선\s*리모컨` | 컬러 유선 리모컨 |
| `REMOTE_WIRED_KIT` | `유선\s*리모컨\s*키트\|유선\s*키트\|리모컨\s*키트` | 유선 키트 |
| `REMOTE_WIRELESS` | `AR-EC05\|무선\s*리모컨\|무선리모콘` | 무선 리모컨 |
| `REMOTE_INF_DEFAULT` | `AR-?CH01\|인피니트.*리모컨` | 인피니트 리모컨 |
| `REMOTE_COLOR_AIRCOMBO` | `리모컨`&`에어콤보`&`무선`아님 | 에어콤보 유선 리모컨 |
| `SS_WIRED_BOARD_ID` | `유선보드\|AIM-?A01N` | 유선보드(싱글) |
| `SS_CEILING_PUMP_ID` | `(실링용\s*)?드레인펌프`&`실링` | 실링 드레인펌프 |
| `SS_FOOT_ROUND_ID` | `발통세트`(model 또는 name) | 원형발통(싱글) |
| `SS_FOOT_FLAT_ID` | `SI-AL700a` | 일자발(싱글) |

이 상수들은 이후(범위 밖 `recomputeHomeRemotes`/`recomputeHomePanels` 등)에서 옵션 선택에 따라 수량을 자동 입력하는 데 쓰임 — **"부속을 이름으로 찾아 자동으로 수량을 넣는다"**는 개발책임자가 명시적으로 금지한 패턴의 원천.
③ 상수: 위 표의 정규식 13개, 모델코드는 카탈로그 매칭 결과(고정 리터럴 아님)
④ 읽는 값: `products.name`, `products.model_code`
⑤ [불가: 무엇이 없는가] — "이 옵션을 선택하면 이 부속을 자동으로 넣는다"는 관계가 `bundle_component`/`quantity_sync_*`에 없음(§DB조회로 `방진가대` 계열 0건 확인, 리모컨/호스 계열도 옵션전환식이라 정적 매핑 아님)
⑥ 🚩[결정 필요] — 13개 상수가 가리키는 실제 `products.model_code`를 1회 조회로 확정한 뒤(정규식은 결정론적이라 카탈로그 스냅샷 시점에 유일 매칭), `quantity_sync_rule`(옵션값→target 전환)로 이식할지, 프런트 상수로 유지할지(decisions_needed #6, G14/G15와 동일 이슈군).

### G28. `updateHomeRatio()` — 4887, 4961 ⚠️ 조합비/조합가능성 검증 규칙
② 실내기(`/실내기|벽걸이/i` & `분기관` 아님) 수량합·실외기 수량합의 용량(capacity) 비율 계산. 조건별 결과:

| 조건 | 결과 |
|---|---|
| 실외기 용량합 0 | `"조합비 : ---%"` |
| `AJ025` 실외기 있음 & 다른 실외기 없음 & 제한실내기(`AJ072`/`AM072`/`AM083`) 있음 | `"조합 불가"`(빨강) |
| 최대허용대수(`maxIndoor×수량` 합) < 실내기 수량 | `"최대 실내기 허용 대수 초과 주의!"`(빨강) |
| 그 외 | `조합비 = 실내기용량합/실외기용량합×100`, **130% 초과시 경고(bad 클래스)** |

③ 상수: 경고 임계값 **130%**, 모델코드 `AJ025`(제한 계열), `AJ072`/`AM072`/`AM083`(제한 실내기)
④ 읽는 값: `products.capacity`(추정 — GAS `r.capacity`), `products.maxIndoor`(실외기 최대 연결대수), `products.model_code`
⑤ [부분] — 용량/최대연결대수 필드가 스키마에 명시적으로 안 보임(제공된 스키마 목록에 `capacity`/`maxIndoor` 없음 — `panel_type`/`remote_type` 등은 있으나 냉방능력·최대연결대수 컬럼 미상)
⑥ 🚩[결정 필요] — 이 조합비 검증은 **주문/견적 확정을 막는 게 아니라 경고만 하는 UX 규칙**이라 품목 "기본값"이 아니라 검증 규칙 배치 위치의 문제. `capacity`/`maxIndoor` 저장 컬럼 존재 여부부터 확인 필요(decisions_needed #7, 스키마 밖 필드일 가능성 — PM 재확인 요).

### G29. `updateCommRatio()` — 4974, 5016, 5041 (G28의 상업멀티 버전 + 분기관 부족 경고)
② G28과 동일한 용량비 계산 + `missingBranch = (실내기수-실외기수) - 분기관수` ≥1이면 `"부족 분기관: N개"` 표시. 임계값은 **출력계열에 따라 분기**: 실외기 name에 `프라임|한랭지|표준형|냉난방|가스히트펌프|GHP|프레스티지|동시냉난방|공장전원` 매칭 있으면 **103.0%**, 없으면 **120.0%**
③ 상수: 임계값 **103.0** / **120.0**(브랜드라인 분기), 정규식 브랜드라인 목록(G16~G18과 동일 계열)
④ 읽는 값: G28과 동일 + 분기관 수량(`AXJ-YA` 계열 model)
⑤,⑥ G28과 동일 결론 — 🚩[결정 필요](decisions_needed #7). 추가로 103%/120% 분기 브랜드라인 판정은 G16~G18의 브랜드라인 정규식과 동일 계열이라 그쪽 결정과 함께 처리 권고.

### G30. `materialsSumForSet(s)` — 5080, 5081
② `#ss_mat`(자재 포함 여부, 기본값 `SINGLE_DEFAULTS['자재 포함 여부']`)이 `'포함'`일 때만 `partsForSetStrict_(s)` 중 `feat`에 `자재` 포함된 부품 가격 합산, 아니면 0
③ 상수: 문자열 `'포함'`
④ 읽는 값: `bundle_component.component_kind`(MATERIAL 273행), `#ss_mat` DOM 선택값(견적 화면 옵션), `SINGLE_DEFAULTS`(범위 밖 기본값 오브젝트)
⑤ [부분: `bundle_component` MATERIAL] — 자재 구성품 자체는 표현 가능. "기본적으로 포함인가 제외인가"라는 **세트 기본값**은 `SINGLE_DEFAULTS['자재 포함 여부']`(범위 밖 상수 오브젝트)에 있어 이 파일 범위에서 값 확인 불가
⑥ 🚩[결정 필요] — `SINGLE_DEFAULTS['자재 포함 여부']` 원본값이 무엇인지(범위 밖) 확인 후 `bundle_component.is_default`(자재 종류) 기본 포함여부로 이식할지 결정(다른 담당 구간과 교차 확인 필요 — notable에 기록).

### G31~G37. 싱글중대형 세트 구성품 선택 규칙군 — `isDefaultComponent_`(5085) / `getDefaultRemoteRows`(5089) / `getOptionRemoteRow`(5090) / `allowRemoteChange_`(5097) / `is1WaySet_`(5101) / `getBasePanelRow`(5106) / `pickPanelRow`(5107)
② 조건→결과:

| 함수 | 규칙 |
|---|---|
| isDefaultComponent_ | `p.isDefault===true` 또는 `feat`에 `/기본/i` |
| getDefaultRemoteRows | 기본구성품 중 `kind`/`name`에 `리모컨` 포함된 행 전부 |
| getOptionRemoteRow | 옵션`'유선리모컨'`→feat에 `유선리모컨`&컬러아님 / `'컬러유선리모컨'`→`컬러유선리모컨`\|`유선컬러` |
| allowRemoteChange_ | 기본 리모컨 모델이 `AR-EH05`/`AR-EC05`/`AR-KH05` 중 하나일 때만 옵션 전환 허용 |
| is1WaySet_ | 세트 name/model 또는 구성품 name/spec에 `1way`/`1 way` |
| getBasePanelRow | 기본구성품 중 `kind`/`name`에 `판넬`\|`패널` 포함 첫 행 |
| pickPanelRow | 옵션(`#ss_panel`: 판넬제외/블랙판넬/승강판넬/공청판넬)·형태(`#ss_p360`: 원형/사각, 360계열 한정)에 따라 후보 판넬 중 매칭 행 선택, 없으면 기본행 폴백 |

③ 상수: 모델코드 `AR-EH05`,`AR-EC05`,`AR-KH05`(리모컨 전환 허용 게이트), 옵션값 문자열(판넬제외/블랙판넬/승강판넬/공청판넬/원형/사각/유선리모컨/컬러유선리모컨)
④ 읽는 값: `bundle_component.is_default`, `bundle_component.component_kind`(REMOTE/PANEL), `bundle_component.spec_text`/`component_variant`(feat 텍스트 추정)
⑤ [부분] — `bundle_component`가 기본구성/종류 축은 갖고 있으나 "옵션값→대체 구성품 전환" 규칙은 `qty_mode`/`component_variant`로 일부 표현 가능해 보이나 옵션별 매칭(블랙/승강/공청) 텍스트 매칭 로직 자체는 스키마 항목이 아님
⑥ [자동] 기본구성 판별(`isDefaultComponent_` 이하)은 `bundle_component.is_default`로 대체 가능 — 결정 불요. 옵션 전환(판넬/리모컨 교체) UI 로직은 견적 작성 화면 기능이라 품목 기본값 대상 아님(그대로 프런트 로직 이식).

### G38. `setBasePriceRightFirst(s)` — 5124
② `priceFrom(s, {priceKeys:['price','priceLeft','unitPrice'], listKeys:['list','listLeft','출고가']})` — 서버 계산가(price) 최우선, 그다음 방향 필드
③ 상수 없음(필드 우선순위)
④ 읽는 값: `products.release_price`/`delivery_price`(추정 매핑)
⑤ [부분: `products.release_price`/`delivery_price`] — 필드명 우선순위 로직은 레거시 시트의 컬럼명 혼재(price/priceLeft/priceRight 등) 때문이며, 우리 스키마는 이미 단일 `release_price`/`delivery_price`로 정규화돼 있어 이 폴백 체인 자체가 불필요
⑥ [자동] `products.release_price`/`delivery_price` 직접 사용. 결정 불요(폴백 체인은 스키마 정규화로 이미 해소됨).

### G39. `calcSetUnitPrice(s)` — 5134, 5149 ⚠️ 싱글중대형 세트 단가 산정 총괄 규칙
② I형 호스 세트면 8,000원 고정. 아니면 `setBasePriceRightFirst`(G38) 기준가 + 판넬 델타(선택 판넬-기본 판넬 가격차, 판넬제외 옵션이면 기본판넬 가격 전액 차감) + 리모컨 델타(옵션 전환 시 가격차, 제외 옵션이면 전액 차감) + 자재 합계(G30). 이후 할인유형(G6 계열, `adjustSingleSetBasePrice` 범위 밖)을 base에만 적용하고 델타(extras)는 유지
③ 상수: 8,000원(I형호스 고정가)
④ 읽는 값: G30·G31~G37이 읽는 값 전부 + `#chkSingleInc`(인상가 토글)
⑤ [부분] — 계산 절차 자체는 이식 가능하나, 최종 결과는 G14/G16~G18/G27과 동일하게 "구성품 자동 전환" 축에 의존
⑥ [자동] 산식 절차는 그대로 이식. 구성품 전환 축의 미해결 사항(G14/G27)이 선결되어야 함(중복 카운트 방지 위해 결정 목록엔 별도 추가 안 함).

### G40. `explodeSetParts(s, qty, setUnitOverride)` — 5199, 5203 ⚠️ 세트 분해·실내외 배분 규칙
② 포함 구성품 결정(발통/자재숨김 제외, 판넬은 선택된 것만, 리모컨은 옵션 매칭 모델만, 자재는 `#ss_mat==='포함'`일 때만) → 실내/실외/고정 그룹 분리 → **"가정용 에어컨"이면 실내:실외 = 6:4, 그 외(상업/싱글중대형 일반)는 4:6** 비율로 잔액 배분(G5 `splitIndoorOutdoorToK` 호출) → 가정용은 벽걸이 구성품을 고정그룹으로 강제 이동(비율배분 대상에서 제외)
③ 상수: **배분비율 6:4(가정용) / 4:6(그 외)**
④ 읽는 값: G3~G4(`bundle_component.component_kind`), `classifySingleSetFixed`(G22) 결과의 `catL`(가정용 에어컨 판별)
⑤ [표현 가능] — 배분 산식은 계산 로직으로 이식 가능. 비율 6:4/4:6 자체가 업무규칙이므로 상수로 보존 필요
⑥ [자동] 6:4/4:6 비율 상수 그대로 이식. 결정 불요(다만 향후 이 비율이 변경될 수 있는 값이면 하드코딩보다 `quantity_sync_rule.condition_json` 같은 설정값화가 바람직 — notable로 남김, 강제 결정 아님).

### G41~G42. `inferStandCountForOutdoor_(setModel,qty)`(5346) / `recalcCommAccessories()`(5353, 5355) ⚠️ 받침대 자동수량 규칙
② `inferStandCountForOutdoor_`: 해당 세트의 구성품(`partsForCommSet_`)에 `GHP방진가대`가 있으면 `{name:'GHP방진가대', qty: 실외기수량}` 반환(1:1 배수). `recalcCommAccessories`: 선택된 실외기 각각에 대해 위 결과가 있으면 해당 명칭을 포함하는 화면 행을 찾아 **수량을 `max(현재값, 실외기수량)`으로 갱신**, 단 `COMM_MANUAL_BASE`(사용자 수동 입력 추적셋)에 있으면 건드리지 않음
③ 상수: 배수 **1:1**(실외기 1대당 받침대 1개), 문자열 `GHP방진가대`
④ 읽는 값: `bundle_component`(COMM_PARTS 원천, 현재 GHP방진가대 관계 미등록 — §DB조회 확인) 또는 신규 `quantity_sync_source/target`
⑤ [불가: 무엇이 없는가] — §2/§DB조회에서 확인했듯 `bundle_component`에 `GHP방진가대`/`방진가대S2*`를 component로 갖는 행이 0건. **개발책임자 지시(수량은 이름·구성품에서 추론하지 않고 오직 수량동기화 설정값이 정한다)에 정확히 부합하는 케이스** — 이 GAS 로직이 하는 일이 바로 그 "추론"이며, 이를 대체할 `quantity_sync_rule/source/target` 행이 아직 없음
⑥ 🚩[결정 필요] — `(실외기 model_code, GHP방진가대 model_code, multiplier=1)` 행을 `quantity_sync_source`/`quantity_sync_target`에 신규 생성해야 함. GHP 실외기 SKU 전수(5개 단위 + 4개 조합=9개, §DB조회 목록)를 대상으로 생성 가능 — 이 표는 **손으로 바로 만들 수 있는 크기**이므로 후보안으로 제시(decisions_needed #2): source=`AM160NXGGBH1`,`AM200NXGGBH1`,`AM250NXGGBH1`,`AM300JXGGBH1`,`AM320NXGGBH1`,`AM360NXGGBH1S`,`AM400NXGGBH1S`,`AM450NXGGBH1S`,`AM500NXGGBH1S`(9종) → target=`GHP방진가대`, multiplier=1. `방진가대S2소/중/대`(일반 냉난방 계열)는 브랜드라인별 HP표(G16~G18)가 선행 확정돼야 함.

### G43. `updateSingleFilterOptions()`의 제외 규칙 — 5511, 5515, 5522
② 필터 목록 생성 시 `classifySingleSetFixed(s)`(G22) 결과가 `catL==='냉난방 스탠드' && catM==='프레스티지'`이고 사이즈가 `'13'`(평형)이면 **체크박스와 무관하게 항상 목록에서 제외**. 그 외 "확장형"(G21)은 `#ss_expand` 체크시에만 노출
③ 상수: `'13'`(평형), `'냉난방 스탠드'`, `'프레스티지'`
④ 읽는 값: `products.pyong_size`, `classifySingleSetFixed`가 산출하는 `catL`/`catM`
⑤ [불가: 무엇이 없는가] — "이 SKU는 체크박스로도 못 살리는 완전 제외"라는 상태를 표현할 필드가 없음. `status`(ACTIVE/…) 후보이나, 실측상 이 SKU(`AP052CAPPBH1S`)는 이미 `status='ACTIVE'`임
⑥ 🚩[결정 필요] — **실측: `model_code='AP052CAPPBH1S'`(냉난방 프레스티지 스탠드, 13평, BUNDLE, status=ACTIVE)가 GAS에서는 무조건 숨겨짐.** 이 SKU를 우리 스키마에서 `status=DISCONTINUED`류로 바꿀지, `product_estimate_exposure`에서 완전 배제할지, 혹은 GAS의 이 제외가 이미 낡은 규칙이라 이식하지 않을지 결정 필요(decisions_needed #8).

### G44~G45. `normalizeCommCategory(r)`(6590) / `fixCommMidCategory(r)`(6598, **범위 경계로 본문 truncated**)
② `normalizeCommCategory`: `{L: r.catL, M: fixCommMidCategory(r), S: r.catS}` 조립. `fixCommMidCategory`: 이 배정 구간(3301~6600)에서는 첫 조건만 보임 — name에 `유선\s*리모[컨콘].*모듈` 매칭시 `'키트'` 반환. **6601행 이후로 함수 본문이 이어지며 이는 다음 배정 구간(ejs-3, 6601~) 담당**
③ 상수: `'키트'`(1건만 확인, 이후 조건은 범위 밖)
④ 읽는 값: `products.name`
⑤ [부분] — `classification`(M레벨) 대응 가능. 다만 함수 본문이 잘려 전체 규칙표를 이 보고서에서 완성할 수 없음
⑥ [자동] 확인된 1개 조건은 `classification` M레벨 시드로 채택 가능. **나머지 조건은 ejs-3 담당 구간(6601행~)에서 이어받아야 완결** — decisions_needed 아님, notable로 인수인계 기록.

## 5. notable (조사 중 발견한 특이사항)

- `singleUnitPrice`(4405, DC)가 담고 있던 6종 싱글 할인유형 차감 로직은 **유실이 아니다** — 동일 규칙이 `adjustSingleSetBasePrice`(3284, ejs-1 담당 범위)를 통해 라이브 경로(`calcSetUnitPrice`)로 이미 적용되고 있음을 확인했다. ejs-1 보고서와 교차 확인 권장.
- `basesForSetPiecesByExistingRule_`(4195, DC)가 감싸는 `parseSetHPs`/`chooseBaseModel`은 8488~8500행(범위 밖, 아마도 ejs-3 담당)에서 **괄호 치환 방식이 다른 인라인 사본**으로 실제 동작한다. 이식 시 반드시 라이브 인라인 버전(8488행 부근)을 기준으로 삼을 것 — 종전 조사(`896-gas-formula-agg/EXCEPTIONS.txt` [E14])도 동일 지적.
- `fixCommMidCategory`(6598)는 함수 본문이 6600행 경계에서 잘렸다. ejs-3 담당(6601행~)이 이어서 조사해야 완전한 규칙표가 나온다.
- G16~G18(`chooseBaseModel` 계열)과 G29(103%/120% 조합비 임계값 분기)가 참조하는 "브랜드라인"(프라임/한랭지/표준형/냉방전용상부토출/프레스티지·동시냉난방·공장전원) 정규식은 **동일 계열**이다 — 두 규칙을 함께 정리하면 중복 작업을 줄일 수 있다.
- `products.capacity`/`maxIndoor`(G28/G29가 읽는 냉방능력·최대연결대수)가 프롬프트에 제공된 스키마 목록에 없다 — PM 확인 필요(스키마 누락인지, 다른 이름의 컬럼인지).
- G22(`classifySingleSetFixed`)와 G20(`normalizeHomeCategory`)은 **각각 SINGLE_SETS/HOMEMULTI 두 카탈로그에 대한 별개의 분류 엔진**이지만 상당 부분(발통/받침대, 리모컨/키트, 전열교환기 등) 규칙이 유사하다 — `classification` 시드 생성 스크립트를 하나로 통합할 여지가 있다.

## 6. 이식 시 유의 — 개발책임자 지시(수량 비추론 원칙)

G14, G15, G16~G18, G19, G27, G41~G42가 모두 "이름/HP/구성품에서 수량 또는 모델을 추론"하는 패턴이다. 위 각 항목에서 표로 환원한 (조건, 모델코드) 조합을 `quantity_sync_rule`/`quantity_sync_source`/`quantity_sync_target`(또는 `bundle_component`)의 명시적 설정값으로 이식하고, 실행 시점에는 그 설정값만 참조하도록 해야 한다는 지시에 맞춰 **정규식·파싱 자체는 이식 대상에서 제외**했다. 다만 "어느 실제 SKU가 그 정규식에 매칭되는가"는 카탈로그 스냅샷 시점에 결정되는 데이터라 이 보고서는 규칙(조건표)까지만 확정하고, 실제 행 생성은 후속 추출 스크립트 또는 개발책임자 확인으로 넘겼다(§decisions_needed).
