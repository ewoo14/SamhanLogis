# GAS 전수조사 종합 — 개발책임자 제출용

> 개발책임자 지시(2026-08-10): *"GAS의 모든 로직을 전수조사하여 해당 법칙을 우리 스키마와 비교해 정규화하고 스키마로 이식"* · *"견적서와 주문서 모두"* · *"되도록 하나도 놓치지 않도록"* · ***"전수조사를 많이 했지만 이번에는 확실해야해."***
>
> 종합자 = PM. 입력 = 분모 1 + 파티션 보고서 12 + 적대 반증 1.
> 본 문서는 **판정을 릴레이하지 않았다** — 아래 §0 에 PM 이 직접 재확인한 항목을 명시한다.

---

## 0. PM 직접 재확인 (릴레이 금지 원칙)

종합 전에 **적대 반증의 핵심 주장 4개를 코드로 직접 재현**했다. 종합자가 하위 보고서 판정을 그대로 합산하면 그 오류가 종합의 오류가 되기 때문이다.

| # | 재확인한 주장 | 재현 명령 / 근거 | 결과 |
|---|---|---|---|
| 1 | `clearAllPanels`/`clearAllRemotes`/`onHomeQtyInput` 은 golden 하네스가 **문자열 이름으로 index.ejs 에서 본문을 추출**해 실행한다 | `clients/web/legacy-quantity-golden/legacyQuantityBoundary.js:7-9`(`SOURCE_PATH.estimate = ../estimate-app/views/index.ejs`) · `:205-228`(추출 이름 목록에 3개 모두 리터럴로 존재) · `:86-103`(`ORDER_ONLY_QUANTITY_HELPERS` 에 **없음** → `app='estimate'` 에서도 필터되지 않음) | ✅ **반증이 옳다** — ejs-1/ejs-3 의 dead 판정은 오판 |
| 2 | `singleUnitPrice` 는 parity 하네스가 이름으로 지목한다 | `clients/web/estimate-app/qa-gas-parity-sim.mjs:36`(`APP_EJS = views/index.ejs`) · `:289`(`PRICE_FNS = [...,'singleUnitPrice',...]`) · `:290`(`PRICE_FNS.map(assertPriceFnIdentical)`) | ✅ **반증이 옳다** — ejs-2 의 dead 판정은 오판 |
| 3 | `getSpecMap_`/`formatWonDiscountLabel_`/`combineRemarks_`/`normalizeTel_` 은 레거시 GAS 정본에서 살아 있다 | `tools/legacy-gas/거래처 발송 주문서/Code.js:2023,2101-2106,2161/2172/2180,2005` 실측 매치 | ✅ **호출부는 실재** — 단 §1.3 의 성격 구분 필요 |
| 4 | 분모 889 의 파일별 합 | 642+171+16+4+8+16+4+0+6+8+6+8 = **889** | ✅ 분모 자체는 정합 |

**재확인 결과 하나가 종합의 결론을 바꿨다**: 적대 반증이 찾은 "데드 오판 19건"은 **성격이 두 가지로 갈린다**(§1.3). 이를 뭉뚱그리면 "데드 75 → 56" 이라는 잘못된 한 줄이 남는다.

---

## 1. 완결성 단정

### 1.1 분모 대비 실제 분류 — **869 / 889, 결손 20건**

| # | 파일 | 분모(함수) | 배정 | 담당 파티션 | 결손 |
|---|---|---:|---:|---|---:|
| 1 | `clients/web/estimate-app/views/index.ejs` | 642 | 642 | ejs-1(68)·ejs-2(174)·ejs-3(114)·ejs-4(105)·ejs-5(118)·ejs-6(63) | 0 |
| 2 | `clients/web/estimate-app/lib/code.js` | 171 | 171 | code-1(95)·code-2(76) | 0 |
| 3 | **`clients/web/estimate-app/lib/db-catalog.js`** | **16** | **0** | **없음** | **16** |
| 4 | **`clients/web/estimate-app/lib/slip-bridge.js`** | **4** | **0** | **없음** | **4** |
| 5 | `clients/web/order-app/src/quantitySync.ts` | 8 | 8 | order | 0 |
| 6 | `clients/web/order-app/src/samhanApi.ts` | 16 | 16 | order | 0 |
| 7 | `clients/web/order-app/src/legacyShim.ts` | 4 | 4 | order | 0 |
| 8 | `clients/web/order-app/src/main.ts` | 0 | 0 | order | 0 |
| 9 | `clients/mobile/src/webview/legacyOrderSource.ts` | 6 | 6 | mobile | 0 |
| 10 | `clients/mobile/src/webview/legacyOrderShim.ts` | 8 | 8 | mobile | 0 |
| 11 | `clients/mobile-staff/src/webview/legacyEstimateSource.ts` | 6 | 6 | mobile | 0 |
| 12 | `clients/mobile-staff/src/webview/legacyEstimateShim.ts` | 8 | 8 | mobile | 0 |
| | **합계** | **889** | **869** | | **20** |

**🚩 어디가 비었는가 — 숨기지 않고 명시한다.**

- **`db-catalog.js` 16함수 · `slip-bridge.js` 4함수 = 20건이 어떤 파티션에도 배정되지 않았다.** code-1 이 이 파일을 *참고용으로 전문 독해*했으나 스스로 *"분류/줄번호 배정은 다른 조사 라운드(있다면) 소관"*(code-1 §부록)이라 명시했다. 즉 **읽혔지만 분류되지 않았다.**
- 무게: `db-catalog.js` 는 **레거시 시트 → 우리 DB 매핑의 유일한 어댑터**다(`useK2 ↔ has_variable_discount`, `'고정DC' ↔ fixed_discount_rate`, `matKey ↔ set_material_key`, `isDisc ↔ legacy_discount_flag`, `qty ↔ default_qty`). 이 20건이 미분류라는 것은 **"레거시 법칙 → 스키마" 번역 계층 자체가 전수조사되지 않았다**는 뜻이다. `slip-bridge.js` 4함수는 전표 전송 계약(`buildSlipRequest`/`postSlip`)이다.
- 조치: §5 의 0순위.

### 1.2 분모 889 자체가 모집단이 아니다 — 🚩🚩 이번 조사의 최대 구멍

*"되도록 하나도 놓치지 않도록"* 이라는 지시에 대해 **정직 보고**한다. 분모 파일이 포착하지 못한 모집단이 셋 있다.

| 누락 모집단 | 규모 | 근거 | 무게 |
|---|---|---|---|
| **`clients/web/order-app/index.html`** | **10,156줄 · 함수 350+** | order-side-defaults §0 이 지적 · 분모 파일에 절 자체가 없음 | 🚨 **주문서 전수조사가 성립하지 않는다.** 분모에 있던 주문 계열 6파일(quantitySync/samhanApi/legacyShim/main + 모바일 4)은 **전부 shim·URL·HTTP 계층**이고 설정 기본값·파생 수량 규칙이 **0개**다. 주문서의 실제 법칙은 전부 이 파일에 있다 |
| **익명 `addEventListener` 콜백 내부 규칙** | 최소 2건 실측 | ejs-6 §4: `index.ejs:18719-18921`(BR6 세트-구성품 수량 전개) · `:19296-19378`(BR8 기본값 복귀)이 **`bundle_component.default_qty` 와 직결되는 핵심 규칙**인데 인벤토리는 내부의 사소한 상수(`updateSpan`·`isCleared`)만 잡았다 | 분모 추출이 `function` 선언 패턴 기반이라 **같은 유형이 다른 구간에도 있을 수 있다**(ejs-6 가 PM 에게 명시 경고) |
| **`tools/legacy-gas/**` 원본 GAS 4종** | 종합견적서 · 거래처 발송 주문서 · 제이시스템 · 에어디자이너 | §0 재확인 3 | 포팅본이 **드롭한** 규칙이 여기 살아 있다(§1.3-B) |

⟹ **"889 전수" 는 `estimate-app` 견적 축에 대해서만 성립한다.** 주문 축은 order-side-defaults 가 자체 모집단(113축)을 세워 메꿨으나 **함수 단위 분모는 여전히 없다.**

### 1.3 적대 반증 반영 — 데드 오판 19건은 **두 종류**다

기계 합산은 `데드코드 75`. 적대 반증이 19건을 뒤집었다. **그러나 19건을 한 통에 넣으면 안 된다** — PM 재확인(§0) 결과 성격이 갈렸다.

**A군 — 진짜 오판(판정 자체가 틀림). 그 파일 안에서 실제로 실행된다.**

| 항목 | 판정한 보고서 | 실제 소비자 | 왜 놓쳤나 |
|---|---|---|---|
| `clearAllPanels`(3193) · `clearAllRemotes`(3196) | ejs-1 §4-6/4-7 | `legacy-quantity-golden/legacyQuantityBoundary.js:216-217` 문자열 리터럴 → `extractFunctionSource` → `vm.runInNewContext` | grep 범위를 **`clients/web/estimate-app` 로 한정**. 하네스는 `clients/web/legacy-quantity-golden/` 에 있다 |
| `onHomeQtyInput`(7712) | ejs-3 §4-4 | 동 `:229` 등재 + `:246` 실행. **golden 결과값을 지배**(H-03-PANEL-LOCK 픽스처에서 `PC1MWSK3NW=9` 유지가 이 함수 때문) | 동일 |
| `singleUnitPrice`(4405) + 하위 4421·4442 | ejs-2 §2 | `estimate-app/qa-gas-parity-sim.mjs:289` PRICE_FNS 문자열 지목 | grep 범위를 **`views/index.ejs` 단일 파일로 한정** |

🔑 **공통 원인 = 파티션마다 grep 범위가 달랐다.** ejs-1 은 `clients/web/estimate-app`, ejs-2 는 `index.ejs` 하나, ejs-3 은 "전체 앱 디렉터리". **어느 것도 `clients/web/legacy-quantity-golden/` 을 덮지 않았다.** ejs-1 이 스스로 *"`.map(estimateOptionHtml)` 콜백 참조 때문에 bare grep 을 병행했다"* 고 적었으면서도, **문자열 리터럴로 함수를 지목하는 하네스**라는 제3의 소비 형태는 어느 파티션도 상정하지 않았다.

**B군 — 판정은 맞으나 "규칙 소실" 신호(이쪽이 더 중요하다).**

`bindQty`(4710) · `bindCommQtyEvents`(4732)+하위 3 · `setPreviewFoot`(5064) · `getSpecMap_` · `formatWonDiscountLabel_` · `formatPercentLabel_` · `combineRemarks_` · `_normSpec_` · `normalizeTel_` · `toYmd_` · `toMmDd_` · `todayYMD_` …

- 이 함수들은 **판정 대상 파일 안에서는 실제로 무호출**이다(반증도 *"index.ejs 안에서는 정의 1건뿐(무호출)이 맞으나"* 라고 스스로 인정).
- 그러나 **형제 포팅본(`order-app/index.html`)과 레거시 원본(`tools/legacy-gas/거래처 발송 주문서/Code.js`)에서는 살아 있다.** PM 실측: `Code.js:2023 getSpecMap_()` · `:2101-2106 formatWonDiscountLabel_` ×6 · `:2161/2172/2180 combineRemarks_` · `:2005 normalizeTel_`.
- ⟹ 이것은 데드코드 통계 문제가 아니라 **"포팅 과정에서 소비자가 사라진 규칙"** 목록이다. `formatWonDiscountLabel_`(6종 할인 라벨) · `combineRemarks_`(전표 비고 병합) · `formatPercentLabel_`(전역 DC 텍스트)는 **전표 적요에 찍히는 업무 산출물**이다. "데드" 로 흘려보내면 이식 대상에서 통째로 빠진다.
- 🚩 **가장 위험한 한 건**: `bindCommQtyEvents`(죽음, 독립 `if` 4개) ↔ `index.ejs:7033-7056`(라이브, `else if` 체인) — **한 행이 두 계열에 동시 해당할 때 결과가 갈린다.** 어느 쪽이 정본인지 판정 없이 버리면 `/방진가대|받침대|발통세트|일자발|SI-AL/i` 수동추적 계열 판별 규칙의 정본이 **결정되지 않은 채** 사라진다 → §3 D-14.

### 1.4 정정 후 집계

| 축 | 기계 합산 | 적대 반증 반영 | 비고 |
|---|---:|---|---|
| 배정 합계 | 869 | **869**(불변) | 분모 889 대비 **결손 20** |
| 분류 합계 | 869 | 869(불변) | |
| 업무규칙 | 318 | **≥ 322** *(범위 미상)* | A군 4건(`clearAllPanels`·`clearAllRemotes`·`onHomeQtyInput`·`singleUnitPrice`)이 최소 회수. 하위 줄(4421·4442) 포함 시 +6 |
| UI 전용 | 274 | 274 ± | |
| 인프라·유틸 | 202 | 202 ± | |
| 데드코드 | 75 | **56**(19건 회수) | 단 그중 **B군 ~13건은 "타 파일에서는 라이브" 이지 "이 파일에서 라이브" 가 아니다** |

**🚩 정직 보고 — 정정 후 업무규칙 수를 확정할 수 없다.**
본 종합에 전달된 적대 반증 payload 가 **`false_dead_code` 배열 중간(`todayYMD_` 항목)에서 잘렸고, `분류 오판 107건`의 목록은 아예 전달되지 않았다.** 107건이 어느 버킷에서 어느 버킷으로 가는지 모르므로:

- 확정 가능: `데드 75 → 56`, `배정 869 / 분모 889`, `결손 20`.
- **확정 불가: `업무규칙 318` 의 정정 후 값.** 107건이 전부 UI/인프라→업무규칙이면 425, 전부 반대면 211 이다. **이 폭(211~425)을 "확실하다" 고 보고할 수는 없다.**
- ⟹ **§5 0순위 조치**: 107건 목록을 회수해 재집계한다. 목록 없이 나온 어떤 "정정 후 업무규칙 N건" 도 근거가 없다.

### 1.5 완결성 단정문

> **`clients/web/estimate-app/views/index.ejs`(642) 와 `lib/code.js`(171) 는 줄 구간이 빈틈·중복 없이 6+2 파티션으로 덮여 전수 분류됐다(813/813, 경계 함수는 §notable 로 인수인계됨).**
> **`db-catalog.js`(16)·`slip-bridge.js`(4) 20건은 미분류다.**
> **주문서 함수 축(`order-app/index.html` 10,156줄 350+함수)은 분모에 없어 전수조사되지 않았다** — order-side-defaults 가 설정·수량 축 113개로 대체 조사했을 뿐이다.
> **적대 반증이 데드 판정 19건을 뒤집었고, 그 원인은 파티션별 grep 범위 불일치다.** 분류 오판 107건은 목록 미전달로 반영하지 못했다.

---

## 2. 이식 대상 규칙표 — 계열별

**318 줄 = 138 규칙 단위**(각 파티션 보고서의 규칙 절 수 합계: ejs-1 18 · ejs-2 45 · ejs-3 14 · ejs-4 12 · ejs-5 11 · ejs-6 8 · code-1 20 · code-2 7 · order 3). 한 규칙이 두 계열에 걸치면 주 계열에 1회만 계상했다.

| 계열 | 규칙 수 | 대응 가능 | 부분 | 불가 | 대표 예시 (파일:줄) |
|---|---:|---:|---:|---:|---|
| **① 분류·카테고리** | 13 | 11 | 2 | 0 | `classifyHome_`(code.js:509, 8단 캐스케이드) · `classifyCommercial_`(:634, L/M/S + 모델코드 폴백) · `classifySingleSetFixed`(index.ejs:4285, 최대 분류엔진) · `normalizeHomeCategory`(:4257) · `unifyCatL_`(:319, `부자재2`→`부자재`) → `classification` + `products.cat_l/m/s_id` + `classification_manual` |
| **② 단가·금액** | 17 | 9 | 5 | 3 | `homeUnitPrice`(:4344)/`commUnitPrice`(:4455) 45% 폴백 · `calcSetUnitPrice`(:5134) · `splitIndoorOutdoorToK`(:3370, 가정용 6:4 / 그 외 4:6) · `roundByConfig`(:3323) · **I형 호스 8,000원 고정**(5곳 중복, order D-17) |
| **③ 할인·할증** | 17 | 8 | 6 | 3 | `parseFixedDc`(:3126, `[0,0.99]` 클램프) → `products.fixed_discount_rate`(실측 167건) · `getModelFlags`(:2368, 모델코드 7/8/10자리 파싱 6플래그) → `discount_flags` · `adjustSingleSetBasePrice`(:3284) · `getTierBonusRate`(:13661, 1천만~1억 → +1~4%p) · `applyCardFeeLogic`(:16651, 3%) |
| **④ 수량 파생** | 12 | 4 | 3 | **5** | `recomputeHomePanels/Remotes/Branches`(:8112/8225/8272) · `recomputeCommDerived`(:8390) · `chooseBaseModel`(:4150) · `PUMP_MAP`(:8466) · `inferStandCountForOutdoor_`(:5346) · `bundle_component.default_qty × qty_mode`(ejs-6 BR6/BR8) → **§4 전용 절** |
| **⑤ 구성품 선택·모델 치환** | 12 | 1 | 4 | **7** | `computeCommPanelModelForIndoor_`(:8608, **36 관계**) · `pickPanelBy`(:3201, 가중치 −6~+3 스코어링) · `computeCommRemoteModelForIndoor_`(:4090, 8단 우선순위) · `pickHoseModel`(:4122) → **스키마에 "옵션→SKU 치환" 개념 부재** |
| **⑥ 노출·필터** | 5 | 1 | 2 | 2 | `isExpansionModel`(:4272, **활성 149건 기본 숨김**) · `updateSingleFilterOptions`(:5511, 13평 프레스티지 스탠드 **항상 제외**) · `getStockState_`(:3148, SOLD/FUTURE) · `isBlockedByNote_`(code.js:306) → `products.status` |
| **⑦ 검증·경고** | 9 | 0 | 3 | 6 | `updateHomeRatio`(:4887, 130%) · `updateCommRatio`(:4974, 103%/120%) · `calcRecommendOdu`(:18030) · `isValidTel`(:9115) · `codeByCumulativeSum`/`codeByOutdoorHP`(:12669/12679, 구간→분기관 코드) |
| **⑧ 시트 ETL·속성 적재** | 10 | 9 | 1 | 0 | `getHomeMulti`(code.js:744, `$L$2`→`useK2`) · `getSingleSets`(:827, `$D$7/$D$8`→matKey) · `getSingleParts`(:919, `/기본/`→`isDefault`) · `getOldProducts_`(:1176, `$I$1`→`isDisc`) · `normalizeSize_`(:221) · `sanitizeDisp_`(:291) |
| **⑨ 전송·전표** | 12 | 2 | 4 | 6 | `buildSendRows`(:9378, 경동 특례) · `aggregateSendRows`(:9188, fixedDc **최댓값 승리**) · `explodeSendSets_`(:8966) → `products.bundle_mode` · `submitOrderCard`(:15633, 6종 적요) · `decideWarehouseCode_`(code.js:2244, **품명 키워드로 창고 추론**) |
| **⑩ 견적 세션 기본값** | 8 | 0 | 1 | 7 | `renderHomeOptions`/`renderSingleOptions`(:7788/7831) · `resetHome/Comm/Single/Old`(:10036~10279) · `getHomeDefaults`/`getSingleDefaults`(code.js:1215/1256) → **담을 테이블 없음**(단, 시트 상단 기본값은 `dc_config_db.estimate_configs` 로 **이미 이관 완료**) |
| **⑪ 문서·표시 문구** | 5 | 0 | 0 | 5 | `getFooterNoticeHtml`(:2558, 하드코딩 4줄) · `getInvoiceInnerContent`(:14274, 회사 고정정보) · `numberToKorean`(:14239) · `getSlipInnerContent`(:13922, `초월창고`→`삼성창고 (초월 무갑)`) |
| **⑫ 기타(주소·태그·인증·스냅샷)** | 18 | 0 | 2 | 16 | `updateOrderTags`(:15395, 야적/지방 접두 + D+1 일요일 회피) · `toggleSlipButton`(:14867, 8단 게이트 + 중복방지 스냅샷) · `applySnapshot` ABSOLUTE_LOCK 역산(:17364-17418) |
| | **138** | **45** | **33** | **60** | |

> **읽는 법**: `대응 가능`=현 스키마 컬럼에 그대로 앉음 · `부분`=축은 있으나 값/키/커버리지 미확정 · `불가`=담을 자리가 스키마에 없음.
> 🔑 **불가 60 중 절반이 ④·⑤·⑦ 에 몰려 있다** — 즉 *"수량/모델을 무엇으로 정하는가"* 라는 단일 축이다. §3 결정 목록이 이 순서로 정렬된 이유다.

### 2.1 이미 스키마에 앉아 있어 결정이 불필요한 것 (재논의 금지)

시트 속성 축 실측 기준 **54개 중 39개가 [자동·적재됨]**(sheet-attribute-defaults §4). 재확인된 확정 매핑:

```
품명→products.name(update 시 DB 보존) · 모델명→model_code(자연키) · 평형→pyong_size(SINGLE_SET 271/276)
출고가→release_price+price_history · 납품가(중복 시 마지막 열)→delivery_price
납품가 수식 $L$2→has_variable_discount(803) · $D$7/$D$8→set_material_key(D4 84·D7 17·D8 5) · $I$1→legacy_discount_flag(29)
고정DC→fixed_discount_rate(167) · 비고 3종→status(ACTIVE 1019·DISCONTINUED 83·NOT_FOR_SALE 16·OUT_OF_STOCK 3)
세트→bundle_component.bundle_product_id · 구성품특징 /기본/→is_default(857) · 구성품 규격→spec_text(1348/1598)
사양 27키(배관경·냉방능력·소비전력·냉매가스·제품크기 …)→product_spec
탭 상단 기본값 전량→dc_config_db.estimate_configs(싱글턴 1행, 이관 완료)
material_price 28 · odu_recommendation_lookup 32 · branch_pipe_lookup 6
```

---

## 3. 🚩 개발책임자 결정 필요 목록 — **함수축 45 + 시트축 28 = 73 → 중복 제거 후 31건**

정렬 = **영향 범위**(① 다른 결정을 막는가 ② 금액·출고품목이 달라지는가 ③ 건수). 각 항목의 `[출처]` 는 원 보고서 결정 ID 다.

---

### 🔴 1군 — 막고 있는 것 / 금액·출고품목이 달라지는 것 (D-1 ~ D-9)

#### D-1. `condition_json` 을 주문앱이 소비하게 할 것인가 — **파생 수량 규칙 34개 중 31개가 여기서 막힌다**
`[order #1 / A-07]`
- **① 정할 것**: 주문앱 클라이언트 계약을 서버 스펙에 맞출 것인가, 아니면 조건부 규칙을 조건 없는 규칙 N개로 분해할 것인가.
- **② 레거시/현재**: `clients/web/order-app/src/quantitySync.ts:126-129` — `Object.keys(when).length > 0` 이면 **무조건 거부**. 서버는 `QuantitySyncRuleValidator.java:32-33` 에서 `optionEquals·optionIn·all·any·not` 5연산자를 정식 지원하고 `V24__quantity_sync_rule_schema.sql:15` 이 `condition_json JSONB NOT NULL DEFAULT '{}'` 로 저장한다.
- **③ 후보**
  - (a) 클라이언트가 5연산자를 해석하도록 확장 — 대가: 주문앱 구현 + 옵션 key vocabulary 를 확정해야 함(2026-07-28 R1 결정으로 18키 하드코딩이 폐기돼 현재 **검증 없음**).
  - (b) 조건을 규칙 분해로 흡수(옵션값마다 별도 rule + `priority`/`conflict_policy`) — 대가: 규칙 행 수가 폭증(상업 판넬만 36 → 100+), 그리고 클라이언트가 `priority`·`conflict_policy` 를 **읽지 않으므로**(D-3) 그대로는 동작 안 함.
  - (c) 옵션 의존 규칙은 이식하지 않고 프런트 상수로 유지 — 대가: "설정값이 정한다" 원칙이 파생 규칙의 91%에서 무효.
- **④ 권고 (a)**. 이 결정을 미루면 D-5·D-6·D-7·D-8·D-10·D-12 가 전부 "스키마에 넣어도 안 읽힌다" 로 귀결된다. **31개 규칙의 상류 병목이라 1순위다.**

#### D-2. 주문앱이 서버 규칙을 수량에 **반영하지 않는 shadow 상태**를 언제 끝낼 것인가
`[order #필수② / order-track ⑥]`
- **① 정할 것**: `evaluateSingleS03Rule` 을 실제 주문 경로에 배선할 시점과 조건.
- **② 현재(코드 확인, 추론 아님)**: `main.ts:61-83` 이 `selectSingleS03Rule` 만 호출해 상태 보관 → `index.html:5545-5558` 이 `console.info` 만 찍고 폐기 → `index.html:8548-8571` 에서 `void ….catch()` 로 버림. 실제 수량은 여전히 `index.html:5196-5202` 의 **`/실링/` 이름 파싱**이 정한다. `evaluateSingleS03Rule` 의 유일한 실행자는 테스트와 shadow 하네스다.
- **③ 후보**: (a) D-1 해결 후 즉시 배선 · (b) 조건 없는 3규칙(홈 발통·싱글 받침대·S-03)만 먼저 배선하고 나머지는 D-1 대기 · (c) 유지.
- **④ 권고 (b)**. 조건 없이 성립하는 3건은 D-1 과 무관하게 지금 닫을 수 있고, "설정값이 실제로 화면 수량을 정한다"는 것을 **실 경로로 1회 증명**하는 가치가 크다. ⚠️ 배선 전 **`quantity_sync_rule` 실시딩이 0건**임을 먼저 해소해야 한다(활성 행 0 · 존재하는 2건 전부 `QA996`/`QA R2` 이름의 `is_deleted=true` QA 잔재).

#### D-3. 견적 ↔ 주문 **독립 구현 18건**의 정본을 하나로 확정
`[order #2~#11 / X-1~X-18]` — 🔑 **그중 8건은 금액 또는 출고 품목이 실제로 달라진다**(golden 실측 대조 포함).

| 축 | 견적(`index.ejs`) | 주문(`index.html`) | 실측 차이 |
|---|---|---|---|
| **X-1** 360CST 리모컨 | `AR-EC05` 로 흡수(:4489) | `AR-KH05` 별도(:2897) | H-01 `AR-EC05:4` ↔ `AR-EC05:3 + AR-KH05:1` |
| **X-3** 홈 분기관 실내기 집계 | 에어콤보·전열교환기 **포함**(:8295) | 실내기·벽걸이만(:5503) | H-07 견적 `AXJ-YA1509N:1` ↔ 주문 **0** |
| **X-2** 홈 분기관 발화 | `iCnt>=2 && sOut>0`(:8318) | `singleOutCount>0`(:5526) | 실내기 1대일 때 갈림 |
| **X-5** 상업 공청 4WAY 판넬 | `PC4NUCK4NW`(:8635) | `PC4NUCK1NW`(:5919) | 주문은 **판넬 0**(모델 부재 경고) |
| **X-7** 상업 호스 나머지 | 4WAY 호스에 합산(:8427) | **버림**(:5729) | 견적 `FH-LFHLF4W:2` ↔ 주문 **0** |
| **X-9** I형 호스 스위치 | DOM 체크박스 | 거래처 DC 단독(칩 없음) | 견적 `FH-LFHIF:2` ↔ 주문 `FH-LFHLF:2` |
| **X-10** 싱글 받침대 필터 | 부자재·받침·자재 제외 + `unit∈{SET,식}`(:7975) | `운임\|절삭` 만(:5174) | 주문에만 `set-round-target:4` |
| **X-12** 티어 보너스 상한 | 상한 **없음**(:13690) | `min(…,0.48)`(:8127) | 45%+4% → 견적 49% ↔ 주문 48% |
| **X-13** 할인율 페널티 | `isIndoorOnly()`(실외기 0) | `isNoMainUnit()`(실내·실외 둘 다 0) | 실내기만 주문 시 견적만 45→40% |
| **X-11** 반올림 출처 | 화면 select | 거래처 DC | 같은 품목 단가가 다르게 절사 |

- **③ 후보**: (a) 견적을 정본 · (b) 주문을 정본 · (c) 축마다 개별 판정.
- **④ 권고 (c) — 단 축별로 PM 권고안을 붙여 일괄 승인 형태로 올린다.** 실무 의미가 축마다 다르다(예 X-12 상한 0.48 은 "49% 는 나가면 안 된다"는 영업 정책일 가능성이 높아 주문 쪽이 정본으로 보이고, X-3 은 에어콤보에 분기관이 필요한가라는 설비 판단이라 견적 쪽이 정본으로 보인다). **하나로 뭉뚱그리면 8건 중 몇 건은 반드시 틀린다.**

#### D-4. 상업멀티 실외기 → 부자재 **313쌍 설정값 표**를 등록할 것인가
`[ejs-2 #3 / order #16,#17 / sheet 부록A]` — **이름·HP 파싱 폐기의 본체**
- **① 정할 것**: 이미 산출된 `(본체 model_code, 부자재 model_code, 수량)` **313쌍**을 `quantity_sync_source/target` 에 등록하고 `chooseBaseModel`/`parseSetHPs`/`countBranchForSet` 파싱을 폐기할 것인가.
- **② 레거시**: `index.ejs:4150-4194`(`chooseBaseModel` — 계열 정규식 × HP 토큰 20종) · `:4143-4148`(`parseSetHPs` 괄호 `+` 분해) · `:4219-4226`(`countBranchForSet` `+` 개수). 산출 결과는 `sheet-attribute-defaults 부록 A` 에 313행 전량이 있다.
- **③ 후보**: (a) 313쌍 그대로 등록 후 파싱 폐기 · (b) 규칙(정규식+HP 임계표)을 코드로 이식 · (c) 보류.
- **④ 권고 (a)**. 개발책임자 확정 규칙에 유일하게 부합. **함께 판단할 것 2가지**:
  - ⚠️ 부자재 중 **`SI-AL600a`/`SI-AL700a` 는 `SINGLE_SET` 카테고리**라 레거시 `modelByNameLike()`(상업 목록만 검색) 에서 탈락한다 — 즉 **ECO 실외기의 일자발이 지금 화면에 안 붙고 있다.** 표로 옮기면 카테고리 경계와 무관해져 이 결손이 함께 닫힌다. "ECO 실외기에 일자발을 붙이는 게 맞는가" 는 업무 확인 필요.
  - ⚠️ 현 구현은 못 찾으면 **한글 키워드 문자열(`방진가대S2소` 등)을 그대로 model_code 로 사용**한다(`index.html:5797,5812`). 실제 `products.model_code` 가 한글 `방진가대S2중` 인 것도 있어(ejs-3 §H 실측) **오타가 아니다.** 표 등록 시 model_code 정본 확정 필요.

#### D-5. 🔴 **`products.unit` 미적재가 지금 조합 실외기 84행의 부자재 산출을 어긋내고 있다**
`[sheet #4 / §6.2]` — **결정이라기보다 확인된 결함. 최우선 보고 대상.**
- **② 실측**: 레거시는 `String(r.unit).toUpperCase()==='SET'` 일 때만 괄호 HP 분해로 간다(`index.ejs:8487`). 그런데 sync 에 `unit` writer 가 없어(`grep changeUnit ProductSheetSyncService.java` → 0건) **SHEET 품목 1,121건 + ECOUNT 1,963건 = 3,084건 전부 `EA`** 다. ⟹ 분기에 **절대 진입하지 못한다**. 재현 결과 `#legacyVsDbModeDiff = 84` — 조합 실외기 84행 전건이 어긋난다.
  ```
  AM220AXVHHR1SY  DVM S2 동시냉난방 22HP (10HP+12HP)
     레거시 : AXJ-TA3419M×1, 방진가대S2소×2
     DB모드 :                방진가대S2소×1   ← 분기관 누락 + 방진가대 1개 부족
  ```
- **③ 후보**: (a) **D-4 의 313쌍 표를 도입**해 파싱 자체를 없앤다(어긋남이 함께 해소) · (b) `unit` 만 채워 파싱을 되살린다 · (c) 방치.
- **④ 권고 (a)**. **(b) 는 개발책임자 규칙에 정면으로 어긋난다**(파싱을 되살리는 셈). 단 `unit` 자체는 시트값(`EA` 853 · `대` 609 · `SET` 271 · `-` 2)을 적재하는 것이 정합이므로 **표 도입과 별개로 채운다**(파싱 분기가 사라진 뒤에 채우면 부작용 없음).

#### D-6. 상업멀티 판넬 **"모델 자체 치환" 36관계**를 어디에 실을 것인가
`[ejs-3 D1 / order C-22]`
- **② 레거시**: `index.ejs:8608` `computeCommPanelModelForIndoor_` — 실내기 이름(1/2/4way·360·소중대·WIFI 내장/미내장·인피니트·MINI) × `#comm_panel`(기본/블랙/승강/공청/동작감지) × `#comm_p360`(원형/사각) → 목표 판넬 model_code. **1way 12 + 360 16 + 4way 스왑 4 + 인피니트 4 = 36 관계**(전량 표는 ejs-3 §I / order C-22 매트릭스).
- **③ 후보**: (a) 신규 `product_option_variant(source_model, option_key, option_value, target_model)` 테이블 · (b) `bundle_component.component_variant` 재해석 · (c) 애플리케이션 상수 유지.
- **④ 권고 (a)**. `quantity_sync` 는 수량 승수 모델이라 "SKU 자체가 바뀐다"를 못 담고, `bundle_component` 는 *번들 하위 구성품* 개념이라 **독립 실내기 1개당 독립 판넬 1개**와 의미가 다르다 — 억지로 끼우면 다른 번들 조회 로직과 충돌한다.
- ⚠️ 함께 결정: **X-5(공청 4WAY target `K4` vs `K1`)를 D-3 에서 먼저 확정**해야 표를 만들 수 있다.

#### D-7. 홈멀티 분기관 **뺄셈+조건부 공식**을 스키마로 표현할 것인가
`[ejs-3 D3 / order #14 / sheet §6.4]`
- **② 레거시**(`index.ejs:8272-8330`):
  ```
  b25(AXJ-YA2512N) = 6HP 단배관 실외기 수량
  b15(AXJ-YA1509N) = 실내기합 − 단배관실외기 − 6HP수     ← 뺄셈
  발화조건: 실내기합 ≥ 2 AND 단배관실외기 > 0            ← 조건
  음수는 0 절단
  ```
- **③ 후보**: (a) `factor=-1` 소스 + `condition_json` 으로 표현(D-1 선결 필요, 음수 절단 규격 신설) · (b) 여러 rule+priority 로 분해 · (c) 이 항목만 애플리케이션 유지.
- **④ 권고 (a)**. 단 **X-2·X-3(발화조건·집계범위)이 견적↔주문에서 이미 갈려 있으므로 D-3 선결.** 정본 없이 표현식만 정하면 틀린 식을 스키마에 박는다.

#### D-8. 분기관 **코드 구간표**(누적합/HP → 6코드)를 담을 그릇
`[ejs-4 #1 / order #15]`
- **② 레거시**: `index.ejs:12669` `codeByCumulativeSum`(누적 임계 `150/406/464/696/986`) + `:12679` `codeByOutdoorHP`(HP 임계 `50/100/160/220/340`, **체인 마지막 슬롯만 덮어씀**) → 코드 6종 `1509/2512/2812/2815/3419/4119` → `:13311` `pushBranchPartsToCommFromBadges` 가 `AXJ-YA1509N/2512N/2812M/2815M/3419M/4119M` 로 매핑. 코드 6종은 `ensureBranchScaffold`(:12762) UI 뱃지와 **완전 일치 교차확인됨**.
- **③ 후보**: (a) 신규 `branch_code_rule(min_capacity, max_capacity, branch_model_code, tier)` 테이블 · (b) `quantity_sync_rule.condition_json` 재활용 · (c) 프런트 유지.
- **④ 권고 (a)**. 목적이 **수량 배수가 아니라 코드 선택**이라 기존 3테이블 의미와 다르다. ⚠️ 수량 자체는 **사용자가 분기표 UI 에 드래그해 배치한 결과값**이라 고정 배수 모델로 환원 불가 — 이 축은 "설정값이 정한다" 대상이 아니라 **주문별 입력값**으로 분류하는 것이 맞아 보인다(개발책임자 확인 요).

#### D-9. `discount_flags` 의 **6종 키를 확정**
`[ejs-1 D2 / ejs-5 #1 / code-2 note]`
- **② 레거시**: `index.ejs:2368` `getModelFlags` — 모델코드 `AC`/`AP` 접두 + 인덱스 7·8·10 문자로 `is360/is4way/is1way/isStand/isDeluxe/isGrade1` 6불리언 런타임 파싱. 소비 지점 `submitOrderCard`(:15633)는 `has360/has4way/hasStand/hasOneWayDc/hasDeluxeDc/hasFirstGradeDc` 로, 거래처 DC 는 `discount360/discount4way/discountStand/oneWayDiscount/deluxeDiscount/firstGradeDiscount` 로 — **같은 6종을 세 가지 이름으로 부른다.**
- **③ 후보**: (a) 마이그레이션 시 1회 계산해 `products.discount_flags` 를 채우고 키를 `is360/is4way/is1way/isStand/isDeluxe/isGrade1` 로 확정 · (b) 런타임 파싱 유지 · (c) 실사용 카테고리만 축소.
- **④ 권고 (a)**. 실측상 `discount_flags` 는 `100000` 8건 외 전부 `000000` — **사실상 비어 있다.** ⚠️ 함께: OLD `isDisc`(`legacy_discount_flag` 29건)를 `discount_flags.legacyDiscount` 로 합칠지 별도 컬럼으로 둘지(`code-1 결정2`).

---

### 🟠 2군 — 스키마 자리·권위 확정 (D-10 ~ D-20)

#### D-10. 홈 판넬 `pickPanelBy` **가중치 스코어링**을 매핑표로 고정할 것인가
`[ejs-1 D1 / order C-06]`
- **②** `index.ejs:3201-3230` — 후보 필터(kind×wifi) 후 이름 텍스트 가중치(`AI/동작감지 −6`, `공기청정 −4`, `기본 −2`, `블랙/승강 +2`, 미매치 `−1`, …)로 정렬해 1위 선택.
- **③** (a) 실 카탈로그에 알고리즘 1회 실행 → `(본체, kind, wifi, opt) → 판넬 model_code` 표 고정 · (b) 알고리즘 이식 · (c) `bundle_component.is_default` 로 흡수.
- **④ 권고 (a)**. "추론 금지" 와 동일 계열. **단 표 산출에 실 데이터 실행이 필요해 후속 라운드로 분리**(kind×wifi×opt = 3×2×3 = 18 조합 × 홈멀티 본체).

#### D-11. `component_kind` enum 6종으로 접으면서 **시트 `구분` 한글 원문을 버릴 것인가**
`[ejs-1 D4 / ejs-2 G7-13 / sheet D-1]`
- **② 실측**: 시트 `구분` 10종(리모컨 320 · 자재 273 · 세트 271 · 실내기 271 · 실외기 271 · 판넬 250 · 벽걸이 67 · 부자재 9 · 기타 2 · 펌프 1). enum 6종으로 접으면 **벽걸이 67 + 부자재 9 + 기타 2 + 펌프 1 = 79행이 전부 `ACCESSORY`** 로 뭉친다. 게다가 API 가 **enum 이름**(`"REMOTE"`)을 반환해(`EstimateCatalogInternalController.java:348`) UI 의 한글 정규식(`index.ejs:5089` `/리모컨/.test(p.kind)`)이 `kind` 로는 안 맞고 `name` fallback 으로만 맞는다.
- **③** (a) `bundle_component.kind_raw` 원문 보존 컬럼 추가 · (b) enum 확대(벽걸이/펌프/부자재/기타) · (c) 현행.
- **④ 권고 (a)**. enum 은 우리 로직용으로 두고 원문을 별도 보존하면 시트가 새 구분을 추가해도 안 깨지고, API 가 한글을 함께 실으면 UI 정규식이 되살아난다. 유연호스/드레인펌프 세분류(ejs-2 G7~G13)도 `component_variant` 로 함께 정리.

#### D-12. 리모컨·호스 **옵션 전환**을 데이터화할 것인가
`[ejs-2 G14,G15,G27 / order C-23,C-24,C-26]`
- **②** `computeCommRemoteModelForIndoor_`(:4090, 8단 우선순위 → `AWR-VH12N/AWR-WG00N/AWR-WE13N/AR-CH01/AR-EH05`) · `pickHoseModel`(:4122) · 자동 부속 상수 13종(`:4520-4541`)이 **카탈로그에서 이름 정규식으로 모델을 찾아 전역 상수로 고정**한다.
- **③** (a) `component_variant` + `quantity_sync_rule.condition_json`(D-1 선결) · (b) 프런트 상수 유지.
- **④ 권고 (a)**. ⚠️ 13개 상수가 가리키는 실제 model_code 를 **1회 조회로 확정**해야 한다(정규식은 결정론적이라 스냅샷 시점에 유일 매칭).

#### D-13. **고정DC 권위** — `products` 167건 vs `classification` 0건
`[sheet D-4 / order #21 / ejs-1 D13]`
- **②** 레거시는 시트 품목 열 하나뿐이고 **분류 단위 고정DC 개념 자체가 없었다.** 우리 스키마엔 V36 으로 `classification.fixed_discount_rate` 가 생겼는데 **지정 0건**이고 우선순위 계약이 없다.
- **③** (a) 품목 > 분류 · (b) 분류 > 품목 · (c) 분류는 신규 품목 초기값으로만.
- **④ 권고 (a)**. (b) 를 고르면 **기존 167건이 조용히 무시**될 수 있다.

#### D-14. 🚩 `bindCommQtyEvents` **죽은 사본 vs 라이브 사본의 동작 차이** — 어느 쪽이 정본인가
`[적대 반증 B군 / ejs-2 §2]`
- **②** 죽은 `index.ejs:4744-4747` 은 **독립 `if` 4개**, 살아 있는 `:7033-7036` 은 **`else if` 체인**이다. **한 행이 두 계열에 동시 해당할 때 결과가 갈린다.** 대상 규칙 = `/방진가대|받침대|발통세트|일자발|SI-AL/i` 수동추적 계열 판별.
- **③** (a) `else if` 체인(라이브)을 정본 · (b) 독립 `if`(죽은 사본)를 정본 · (c) 동시 해당 케이스가 실제로 없는지 카탈로그로 확인 후 결정.
- **④ 권고 (c) 후 결정**. 이 판정 없이 4748/4758/4814 를 데드로 버리면 **정본이 결정되지 않은 채 규칙이 사라진다.** 확인 비용이 작다(활성 품목명 정규식 교차 매치 카운트 1회).

#### D-15. 확장모델 **활성 149건 기본 숨김**을 어떻게 표현할 것인가
`[ejs-2 #1 / order E-05]`
- **②** `index.ejs:4272` `isExpansionModel` — `AC***CS`+프레스티지 / `AP***CA` / `AF70****{24,25}` / `AF80*` / `AF90*` 이면 `#ss_expand` 체크 전까지 목록에서 **완전 숨김**. SQL 실측 `status='ACTIVE'` **149건**.
- **③** (a) `goods_type` 신규값(예 `SPECIAL_EDITION`) · (b) `product_estimate_exposure` 에 "기본 비노출" 플래그 · (c) 전부 노출로 전환.
- **④ 권고 (a)**. 기존 필드 재사용이고 M:N 신규 생성이 불필요하다.

#### D-16. 13평 냉난방 프레스티지 스탠드(`AP052CAPPBH1S`) **완전 제외**를 이식할 것인가
`[ejs-2 #8]`
- **②** `index.ejs:5511` `updateSingleFilterOptions` — `catL='냉난방 스탠드' & catM='프레스티지' & 사이즈 13` 이면 **체크박스와 무관하게 항상 숨김**. 실측: 이 SKU 는 DB 에서 `status='ACTIVE'`.
- **③** (a) `status` 를 단종류로 변경 · (b) `product_estimate_exposure` 에서 배제 · (c) 낡은 규칙으로 보고 미이식(노출).
- **④ 개발책임자 확인 필요** — *"이 SKU 가 실제로 지금 판매 가능한가"* 는 업무 사실이라 코드로 추론하지 않는다.

#### D-17. 재고상태 `SOLD`/`FUTURE`(예정일)를 존속시킬 것인가
`[ejs-1 D3 / code-1 결정1]`
- **②** `index.ejs:3148` `getStockState_` — 비고 텍스트에서 `품절` 및 `YYMMDD` 미래 날짜를 파싱해 SOLD/FUTURE(`MM.DD 예정`)/OK 3단계. 서버측 쌍둥이 `isSoldOutByNote_`(code.js:313)는 **미사용**.
- **③** (a) `products.status` 에 `SOLD_OUT` 추가(현재 3건 존재) · (b) `inventory_qty_mgmt` 실시간 판정 · (c) 비고 원문 보존 후 화면 재판정(레거시 동일).
- **④ 권고 (c) — 단 D-18 선결.** 지금 프런트가 이미 동일 정규식을 재판정 중이라 기능 손실이 없다. **예정일(`FUTURE`) 라벨은 어디에도 자리가 없으므로 별도 확인 필요.**

#### D-18. **비고 원문 · 규격 원문 미적재**를 열 것인가
`[sheet D-3 / sheet #11]`
- **② 실측**: `products.remark` **3,084건 전부 비어 있다**(상태 3종만 파싱해 `status` 로 가고 원문은 버려진다). `products.spec_text` 도 **3,084건 전부 공백**(sync 에 writer 없음 — `grep SpecText ProductSheetSyncService.java` → 0건). 그 결과 DB 모드의 `oldProducts().spec` / `multiCatalog().spec` 이 **항상 빈 문자열**.
- **③** (a) 둘 다 원문 적재 · (b) 상태 3종만 유지(현행).
- **④ 권고 (a)**. 컬럼이 이미 있고 비용이 0에 가깝다. 지금은 *"품절 사유·대체품 안내"* 같은 텍스트가 소실 중이며, D-17(c) 는 원문이 있어야 성립한다.

#### D-19. `capacity` / `maxIndoor` — **키 불일치·미매핑으로 조회가 항상 비어 있다**
`[ejs-2 #7 / ejs-4 #2 / sheet #18,#19]`
- **② 실측 두 건**:
  - `product_spec` 에 **`용량` 키 0건** — 컨트롤러는 `SPEC_CAPACITY="용량"` 으로 읽도록 배선돼 있는데(`EstimateCatalogInternalController.java:69,275`) sync 의 사양 매핑 목록에 `용량` 이 **아예 없다**. ⟹ DB 모드 `capacity` 는 항상 0. 조합비 검증(130%/103%/120%)과 추천 실외기가 무력화된다.
  - 최대 연결 실내기: 적재 키 **`최대 연결 실내기 대수, 대`**(191건) ↔ 조회 키 **`최대연결실내기대수`** — **키 불일치로 조회 항상 null**.
- **③** (a) 매핑 추가 + 키 정합(전용 컬럼 없이 `product_spec` 유지) · (b) `capacity_hp` 전용 컬럼 신설.
- **④ 권고 (a) 즉시 + (b) 검토**. (a) 는 업무 결정이 아니라 **버그 수정**이다. (b) 는 "모델코드 표기가 바뀌면 파싱이 깨진다"는 ejs-4 논거가 타당하나 별건.

#### D-20. `PRICE_INC`(가격인상 체크박스 대체표) ↔ `price_change_schedule`/`price_default_variant`
`[ejs-1 D9 / order D-19]`
- **②** `index.ejs:2267` `getBaseListPrice` — `chkHomeInc/chkCommInc/chkSingleInc` 체크 시 시트 "가격인상" 탭 파생 `PRICE_INC` 를 원본 출고가 대신 사용. 주문 쪽은 `incActive`(`index.html:1447-1451`)가 `due < priceChangeSchedule[key]` 로 **출고일 기준 자동 판정**한다 — **판정 축이 다르다**(수동 체크 vs 날짜).
- **③** (a) 날짜 기준(`price_change_schedule`)으로 통일 · (b) 두 경로 병존 · (c) 체크박스 유지.
- **④ 권고 (a)**. 카탈로그 기본값(`release_price`/`delivery_price`)에는 지장 없다(폴백 존재). ⚠️ 견적/주문이 다른 축을 쓰는 상태라 **D-3 과 함께 판정**.

---

### 🟡 3군 — 계산·표시 정책 (D-21 ~ D-27)

#### D-21. 견적 세션 **옵션 기본값**을 담을 그릇 — 시트 매핑 자체가 없다
`[ejs-3 E / ejs-4 #5 / order #12 (B-01~B-16)]`
- **② 실측**: `partner-order-service` `application.yml:98` 의 `app.bootstrap.range-map` 에 **`homeDefaults`·`singleDefaults` 시트 매핑이 없고**, `V2__seed_bootstrap_cache.sql:14-15` seed 는 **`'{}'` 빈 객체**다. ⟹ 현재 운영에서 옵션 기본값은 **전부 `index.html` 하드코딩 fallback**(홈 45% · 상업 `기본판넬`/`원형`/`무선` · 싱글 정액할인 0 · `ss_p360='원형'` · `ss_mat='별도'`)으로 떨어진다.
- ⚠️ 반면 **견적 쪽 탭 상단 기본값은 `dc_config_db.estimate_configs` 싱글턴으로 이미 전량 이관 완료**(sheet §8, 실측 1행). **즉 견적은 이관됐고 주문은 안 됐다.**
- **③** (a) 주문도 `estimate_configs` 를 읽게 통일 · (b) 신규 `estimate_category_defaults` 테이블 · (c) 하드코딩 유지.
- **④ 권고 (a)**. 이미 이관된 싱글턴이 있는데 주문만 하드코딩인 상태가 X-9/X-11 불일치의 뿌리다.

#### D-22. 전역 기본 할인율 **45%** 를 스키마 기본값으로 승격할 것인가
`[ejs-2 #4 / ejs-3 E]` — `index.ejs:4344/4455`(`#home_rate`/`#comm_rate` 기본 `'45'`). `classification.fixed_discount_rate` 실측 **0건**.
- **③** (a) `classification.fixed_discount_rate` 시스템 기본 45% · (b) 견적건별 UI 입력 유지.
- **④ 권고 (b)** — 단 **D-13 과 충돌 주의**: (a) 를 고르면 `classification` 값이 생겨 D-13 우선순위 계약이 즉시 필요해진다. 45% 는 이미 `dc_config_db` 에 있으므로 **거래처 DC 축에 두는 것이 정합**이다.

#### D-23. 티어 보너스 상한 `0.48` · 실내기단독 페널티 `45→40%`
`[order #10,#11 / X-12,X-13 / ejs-5 3.5]` — 상수 전량: 구간 `1천만/3천만/5천만/1억 → +1/2/3/4%p`, 상한 `0.48`(주문만), 판정 허용오차 `0.001`, **원래 율이 정확히 45% 일 때만 발동**.
- **④ 권고**: 상한 0.48 은 **주문 쪽을 정본**으로 추정(영업 정책 성격) — **개발책임자 확인 필요**. 페널티 발화조건은 X-13 과 동일 건이라 D-3 에서 함께 판정.

#### D-24. 구형 합계 `sumOld()` **50% 하드코딩** vs 행별 동적 `old_rate`
`[ejs-3 D4]` — `index.ejs:7563` 이 `Math.round(listP * 0.5)` 로 **50% 고정**인데, `renderOld()`/`renderOldOptions()` 는 사용자가 바꿀 수 있는 `#old_rate` 를 쓴다. **레거시 자체 불일치.**
- **④ 권고**: 동적 `old_rate` 로 통일 — 사용자가 보는 값과 합계가 어긋나는 것은 결함이다. (개발책임자 확인: 50% 가 의도였는지)

#### D-25. VAT 계산 **이중 구현** 정정 여부
`[ejs-6 #2]` — `handleSaveSnapshot`(`index.ejs:17810-17815`)이 `getVatDivisor()`(`:2476`, `estimateConfig.vatRate` 기반)를 무시하고 `0.1`/`11` 을 **하드코딩**. `vatRate` 를 10% 아닌 값으로 바꾸면 **저장 스냅샷 합계와 화면 합계가 어긋난다.**
- **④ 권고**: config-driven 으로 통일. 그대로 이식하면 드리프트가 재현된다.

#### D-26. 카드수수료율(3%)·절삭단위·VAT율(10%)·구형할인(50%)의 **저장 위치**
`[ejs-6 #1 / ejs-1 3-5]` — 현재 `estimateConfig` 시트/Notion 값. 주어진 품목 스키마에 자리 없음. **단 `dc_config_db.estimate_configs` 에 이미 홈·상업 0.45 / 구형 0.5 / VAT 0.1 / 카드 0.03 이 실측 존재**(sheet §8) ⟹ **자리는 이미 있다.** 확인만 필요.
- **④ 권고**: 이관 완료로 간주하고 **절삭단위 옵션 목록만** 확정(현재 HTML `<select>` 하드코딩).

#### D-27. 구성품 **역산 UX** 재현 여부
`[ejs-6 #5]` — `index.ejs:18719-18921`/`19230-19293` — 구성품 수량·단가를 직접 고치면 **세트 수량·세트 단가가 거꾸로 재계산**된다(`newUnit = floor(totalSum/setQty)`).
- **④ 권고 제외**. 개발책임자 확정 규칙(*"40HP는 2개로 설정했으면 그대로 나올 뿐임"*)은 **정방향 단일 소스**를 시사한다. ⚠️ 반면 **"지우면 `default_qty` 로 복귀"(BR8)는 그 규칙의 가장 직접적인 코드 증거이므로 반드시 보존.**

---

### ⚪ 4군 — 품목 스키마 밖 / 확인 성격 (D-28 ~ D-31)

#### D-28. **창고코드를 품명 키워드로 추론**하는 규칙
`[code-2 #1 / ejs-4 #6 / ejs-5 3.7]` — `code.js:2244` `decideWarehouseCode_`: HOME 품목 품명에 `인피니트` 또는 SINGLE 품목 품명에 `360/1등급/냉방전용/1way/덕트/냉전/비스포크/벽걸이/가정용 에어컨` 중 하나면 창고 `'2'`, 아니면 `'00003'`. **개발책임자 "이름 추론 금지" 원칙과 동일 유형.**
- **④ 권고**: `products` 에 `warehouse_code` 명시 컬럼. ⚠️ **먼저 몇 종이 걸리는지 세고 결정**(읽기 전용 조사라 미집계). ⚠️ 집PC 실측상 창고 코드 `2`·`00003` 은 **QA 잔재로 오인된 전례**가 있으니 카운트 시 `created_at`/`created_by` 대조 필요.

#### D-29. **"경동" 거래처 하드코딩 특례**
`[ejs-3 D5 / code-2 #2]` — 주소에 `경동` + `/`(또는 `:`)가 있으면 전표 규격란(`SIZE_DES`)에 spec 대신 출고가를 병기(`code.js:2366` · `index.ejs:9391`).
- **④ 권고**: **영업 담당 확인 후 결정**. 코드에 근거가 없어 자동 판단 불가 — 폐기도 유지도 리스크.

#### D-30. 시트 **미참조 열** — 덤프를 뜰 것인가 (🚩 "안 보여서 0" 문제)
`[sheet D-7 / D-5 / D-6]`
- **② 실측**: 유일하게 스냅샷이 있는 `싱글 구성품` 탭에서 미참조 열이 **실제로 1건 나왔다** — `모듈조합`(28행: HP 조합 26종 + **`운임 직접입력` 1 · `마이너스 금액입력` 1 = 처리 지시문**). 그 밖에 **첫 번째 납품가 열이 1,191/1,735 행 비어있지 않은데 어느 코드도 읽지 않는다.** 나머지 5개 탭은 **스냅샷이 없어 "없다"를 증명할 수 없다**(`GOOGLE_SERVICE_ACCOUNT_KEY` 부재).
- 추가 정황: `포장중량, kg` 과 `실외기포장중량, kg` **두 키만 적재 0건** — 둘 다 각 탭의 **매핑된 물리 사양 열 중 가장 뒤쪽**이고, 우리 sync 는 `!A1:Z`(26열) 고정인 반면 레거시는 `getDataRange()` 전열이다. **Z 초과 꼬리 열 절단 가설이 두 건을 함께 설명한다.**
- **③** (a) 6개 탭 A1 행 전량 덤프 후 대조(1회) · (b) 현행 코드 참조 열만 이관.
- **④ 권고 (a) — 서비스 계정 키 재발급/접근 승인 필요.** 🔑 **"0건" 은 "없어서" 일 수도 "안 보여서" 일 수도 있다.** 덤프 없이 이관하면 조용히 소실된다. **`모듈조합`·`첫 납품가` 의 업무 의미는 추론 금지 — 시트 작성자 확인 대상.**

#### D-31. 카테고리 표기 불일치 · 구형(OLD) 대응 없음
`[order-track #3 / order #20]`
- **② 실측**: `quantity_sync_rule.estimate_category` 는 `'COMM_MULTI'`(`chk_qsr_category`), `products.estimate_category` 는 `'COMMERCIAL_MULTI'`(`chk_pm_estimate_category`) — **같은 개념, 다른 문자열.** 그리고 `products.estimate_category` 에는 `OLD` 가 없어 `CONFIRM_CATEGORY_BY_SECTION` 의 `OLD→oldProducts` 를 받을 자리가 없다(`LEGACY`/`OTHER` 로 흡수해야 함). 추가로 `products.estimate_category` 는 **3,084건 전부 NULL**(V18 결정으로 `product_estimate_exposure` 가 단일 권위 — 노출 실측 COMMERCIAL_MULTI 416 · SINGLE_SET 288 · HOME_MULTI 123 · LEGACY 40).
- **④ 권고**: 표기 통일 + `OLD→LEGACY` 매핑 확정. 저비용·고위험(조인 키 문제 계열).

---

### 병합 회계 (중복 제거 내역)

| 원본 | 건수 | → 병합 후 |
|---|---:|---|
| 함수축 (ejs-1 9 · ejs-2 8 · ejs-3 5 · ejs-4 7 · ejs-5 4 · ejs-6 5 · code-1 3 · code-2 2 · order-track 3) | 46 | |
| 시트축 (sheet D-1~D-7 = 7 · order-side 21) | 28 | |
| **원본 합계** | **74** | **31** |

주요 병합: 받침대 HP 파싱(ejs-2 #3 + order #16 + #17 + sheet 부록A) → **D-4** · 분기관 뺄셈식(ejs-3 D3 + order #14 + sheet §6.4 + X-2 + X-3) → **D-7 + D-3** · 옵션 기본값(ejs-3 E + ejs-4 #5 + order B-01~B-16) → **D-21** · 고정DC(sheet D-4 + order #21 + ejs-1 D13) → **D-13** · discount_flags(ejs-1 D2 + ejs-5 #1 + code-2 note) → **D-9** · 판넬 치환(ejs-3 D1 + order C-22 + X-5) → **D-6 + D-3**.

---

## 4. 수량 축 특별 절

> **개발책임자 확정 규칙: "수량은 구성품이나 이름에서 추론하지 않고 오로지 수량동기화 설정값이 정한다. 40HP는 2개로 설정했으면 그대로 나올 뿐임."**

### 4.1 레거시가 이름·HP 로 수량/대상을 만드는 지점 — **전건 23축**

order-side-defaults 집계: `C-01·C-03·C-06·C-07·C-08·C-11·C-12·C-13·C-15·C-17·C-19·C-20·C-21·C-22·C-23·C-24·C-26·C-28·C-29·C-34 · E-03 · E-05 · E-06`.
견적 쪽 대응: `chooseBaseModel`(:4150) · `parseSetHPs`(:4143) · `countBranchForSet`(:4219) · `recomputeHome*`(:8112/8225/8272) · `recomputeCommDerived`(:8390) · `inferStandCountForOutdoor_`(:5346) · 자동 부속 상수 13종(:4520-4541) · `applySnapshot` ABSOLUTE_LOCK 역산(:17364).

### 4.2 ✅ 환원 **완료** — 그대로 `quantity_sync_source/target` 에 로드 가능

| 표 | 규모 | 산출 근거 | 모델 실재 확인 |
|---|---:|---|---|
| **상업멀티 실외기 → 받침대·분기관·필터·일자발** | **313쌍** | `sheet-attribute-defaults 부록 A` — 활성 COMMERCIAL_MULTI 342행 중 `isCommOutdoorRow` 177행에 레거시 `chooseBaseModel`/`parseSetHPs`/`countBranchForSet` 를 그대로 적용, 조합 실외기는 HP 조각별 결과 합산 | ✅ 부자재 12종 전건 `products` 실재 |
| **PUMP_MAP**(실내기 → 드레인펌프) | **22쌍 / target 6** | `index.ejs:8466-8479` = `index.html:5754-5761` (양쪽 동일, **이름 파싱 없이 model 정확 일치**) | ✅ 22 model_code 전건 SHEET/ACTIVE |
| **RENEW_FILTER_MAP**(실외기 → 리뉴얼 필터) | **4쌍 / target 2** | `AF-R09A ← AM035FXMRHC1·AM050MXMRBC1·AM050FXMRHC1` · `AF-R12A ← AM075FXMRHC1` | ✅ |
| **GHP 방진가대** | **9행** | GHP 실외기 9종(`AM160/200/250/300/320NXGGBH1`, `AM360/400/450/500NXGGBH1S`) → `GHP방진가대` ×1 (+ `ACL-KORGHP07`) | ✅ (313쌍에 포함) |
| **세트 BOM 기본수량** | **1,598행 적재됨** | `bundle_component.default_qty × qty_mode` — ejs-6 BR6/BR8 이 "지우면 `default_qty` 로 복귀" 로 메커니즘 일치 확인 | ✅ 실측 `FOLLOW_SET×1.00` 1,594 |

> 🔑 **부자재 model_code 12종**: `방진가대S2소/중/대` · `GHP방진가대` · `ACL-KORGHP07` · `AXJ-TA3419M` · `AF-R09A`/`AF-R12A` · `SI-AL600a`/`SI-AL700a`(⚠️SINGLE_SET 소속) · `AXJ-YA1509N`/`AXJ-YA2512N` · `AJ060MXHNBC1`.

### 4.3 ⚠️ 환원 **가능하나 sweep 선행 필요**(1회 스크립트로 확정)

| 축 | 필요한 sweep | 막는 것 |
|---|---|---|
| **S-03 실링 드레인펌프**(`ADP-F075SP`) | `/실링/` 매칭 활성 SHEET 싱글 세트 전건 → source 목록 | 없음(즉시 가능). ⚠️ 현재 shadow 하네스(`quantity-sync-s03-shadow.mjs:12-14`)도 여전히 `/실링/` 파싱 사용 = **환원 안 된 상태** |
| **홈 발통**(실외기 총수 → `발통세트`) | 홈멀티 실외기 model_code 전건 | 없음 |
| **싱글 받침대**(세트 → `발통세트`/`SI-AL700a`) | 싱글 세트 전건, `AP230DAPDHH1S`/`AP290DAPDHH1S` 만 flat | **X-10 정본 확정 선행**(견적/주문 필터 상이) |
| **홈 판넬 pickPanelBy** | 18조합 × 홈멀티 본체 실행 → 매핑표 | D-10 |
| **상업 판넬 36관계 / 1way 12 / 360 MAP 16 / 4way 스왑 4 / 인피니트 7** | 표는 이미 전량 확정 | **그릇이 없다**(D-6) — 이것은 *수량*이 아니라 *모델 치환* 축 |

### 4.4 ❌ 환원 **불가** — 그대로 결정 목록으로 올린다

| # | 축 | 왜 (본체, 부자재, 수량) 3열로 안 되는가 | 결정 |
|---|---|---|---|
| 1 | **홈멀티 분기관** | `b15 = 실내기합 − 단배관실외기 − 6HP수` — **뺄셈**이고, 발화조건(`실내기≥2 AND 단배관>0`)과 음수 절단이 있다. `source×factor` 합산 모델을 벗어난다 | **D-7**(+ D-3 X-2/X-3) |
| 2 | **분기관 코드 선택** | 누적합/HP **구간 → 코드** 룩업. 수량 배수가 아니라 **코드 선택**이고, 수량 자체는 사용자가 분기표에 배치한 결과값 | **D-8** |
| 3 | **옵션 조건부 파생 31축** | target 모델 또는 발화 여부가 옵션 칩 값에 따라 갈린다 → `condition_json` 필수인데 클라이언트가 거부 | **D-1** |
| 4 | **판넬 가중치 선택** | `-6~+3` 스코어링 정렬 1위 — 알고리즘이지 설정값이 아니다 | **D-10** |
| 5 | **`bindCommQtyEvents` 계열 판별** | 죽은 사본(독립 `if`)과 라이브 사본(`else if` 체인)이 **다른 결과**를 낸다 — 정본 미결 | **D-14** |
| 6 | **자동 부속 상수 17종** | `modelByNameLike()` 로 카탈로그에서 **이름 부분일치 검색**하고, 못 찾으면 **한글 키워드 문자열 자체를 model_code 로 사용**(`index.html:5797,5812`) | **D-4 ⚠️ / D-12** |

### 4.5 🔴 수량 축의 실측 결함 3건 (결정이 아니라 사실)

1. **조합 실외기 84행 부자재 산출이 지금 어긋나 있다** — `unit` 전건 `EA` 라 `unit==='SET'` 분기 미진입(§D-5).
2. **`quantity_sync_rule` 실시딩 0건** — 활성 행 0. 존재하는 2건은 전부 `QA996 throwaway`/`QA R2 … throwaway` 이름의 `is_deleted=true` **QA 잔재**. `bundle_component` 에 `GHP방진가대`/`방진가대S2*` 를 component 로 갖는 행도 **0건**. ⟹ **313쌍·22쌍·4쌍 어느 것도 아직 DB 에 없다.**
3. **서버 규칙이 화면 수량에 전혀 반영되지 않는다**(§D-2, shadow).

---

## 5. 다음 단계 — 착수 순서와 근거

### 0순위 — 종합의 신뢰도를 먼저 복구한다 (결정 불필요, 즉시)

| # | 할 일 | 근거 |
|---|---|---|
| 0-1 | **분류 오판 107건 목록 회수 후 재집계** | 목록 없이는 "정정 후 업무규칙" 을 확정할 수 없다(§1.4). *"이번에는 확실해야해"* 에 대해 지금 상태로는 답할 수 없다 |
| 0-2 | **`db-catalog.js`(16) + `slip-bridge.js`(4) 파티션 1개 추가** | 결손 20건. 그리고 이 파일이 **레거시→스키마 번역 계층**이라 §2 의 "이미 앉음" 판정 근거 자체가 여기서 나온다 |
| 0-3 | **`clients/web/order-app/index.html`(10,156줄·350+함수) 함수 인벤토리 생성 후 파티션 배정** | *"견적서와 주문서 모두"* 지시가 아직 미충족. 분모에 없던 파일이다 |
| 0-4 | **전 파티션 데드 판정 재검증 — grep 범위를 `clients/` + `tools/legacy-gas/` 전체로 통일** | 19건 오판의 단일 원인이 범위 불일치였다(§1.3). **문자열 리터럴로 함수를 지목하는 하네스**(`legacyQuantityBoundary.js`·`qa-gas-parity-sim.mjs`·`*Harness.cjs`)를 판정 기준에 명시 |
| 0-5 | **인벤토리 추출 방식 보강 — 익명 `addEventListener` 내부 규칙** | ejs-6 실측 2건(BR6/BR8)이 `bundle_component.default_qty` 직결 규칙인데 이름으로 안 잡혔다 |

### 1순위 — 개발책임자 결정 (병렬 가능, 다른 모든 것을 막음)

**D-1(condition_json) → D-3(견적↔주문 정본 8건) → D-4(313쌍) → D-5(unit) 순.**
근거: D-1 은 파생 규칙 34개 중 31개의 상류 병목이고, D-3 은 D-6/D-7/D-20 의 입력이며, D-4·D-5 는 **지금 84행이 실제로 틀리게 나오고 있는** 유일한 확인된 결함이다.

### 2순위 — 결정 없이도 지금 이식 가능한 것 (착수)

1. **PUMP_MAP 22쌍 + RENEW_FILTER_MAP 4쌍** — 이름 파싱이 아예 없고 모델 실재 확인 완료. `quantity_sync_source/target` 시딩 첫 대상.
   ⚠️ 시딩 전 **QA 잔재 2행 정리 여부**를 함께 판단(`is_deleted=true` 이나 `rule_key` 중복 priority 1/999).
2. **분류 캐스케이드 이식** — `classifyHome_`/`classifySingleSetLM_`/`classifyCommercial_` 은 `db-catalog.js` 가 **지금도 단일 진실원으로 콜백 주입해 쓰고 있다**(code-1 실측). `classification` 시드 생성 스크립트 1개로 통합 가능(ejs-2 notable: 홈·싱글 분류 엔진이 상당 부분 유사).
3. **버그성 미적재 3건** — `capacity` 매핑 추가 · `최대연결실내기대수` 키 정합 · `spec_text`/`remark`/`unit` writer 추가. **업무 결정이 아니다.**
   ⚠️ `포장중량, kg`·`실외기포장중량, kg` 0건은 **`!A1:Z` 26열 절단 가설**을 D-30 덤프로 함께 확인.
4. **`bundle_component.default_qty` 정방향 계약 고정** — ejs-6 BR8("지우면 설정값으로 복귀")을 회귀 울타리로 삼아 테스트 고정. 개발책임자 규칙의 가장 직접적 코드 증거다.

### 3순위 — 승인 후 실행

- **313쌍 등록 + `chooseBaseModel` 계열 파싱 폐기**(D-4 승인 시). 등록 후 §4.5-1 의 84행 어긋남이 자동 해소되는지 **실 데이터로 재현 확인**.
- **`product_option_variant` 신설 + 36관계 적재**(D-6 승인 시, X-5 선결).
- **`branch_code_rule` 신설**(D-8 승인 시).
- **시트 헤더 6탭 전량 덤프**(D-30 — 서비스 계정 키 승인 필요). 🔑 이것을 미루면 **"안 보여서 0"을 "없어서 0"으로 오독**한 채 이관이 굳는다.

### 이번 라운드에서 하지 않은 것 (정직 보고)

- 코드·스키마·마이그레이션·git 변경 **0건**(조사 전용).
- 라이브 구글 시트 **미접근**(`GOOGLE_SERVICE_ACCOUNT_KEY` 부재) — 5개 탭 헤더 전량은 **코드가 읽는 열 + sync 가 읽는 열 + DB 에 생긴 사양 키의 합집합**으로 역추정한 것이다.
- 분류 오판 107건 **미반영**(목록 미전달).
- `order-app/index.html` **함수 단위 미조사**(설정·수량 축 113개로 대체).

---

*종합자 = PM. 입력 보고서 12건 + 분모 1건 + 적대 반증 1건. §0 의 4개 주장은 PM 이 코드로 직접 재현했고, 나머지는 각 보고서의 실측 근거를 인용했다. 인용 수치에 재현 명령이 붙어 있지 않은 항목은 원 보고서 §재현 명령 절을 따른다.*
