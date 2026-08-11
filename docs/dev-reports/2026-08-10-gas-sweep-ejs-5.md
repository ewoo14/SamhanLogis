# GAS 전수조사 — ejs-5 (`clients/web/estimate-app/views/index.ejs` 13201~16500)

> 배정: PM 분모 고정 인벤토리(`docs/dev-reports/2026-08-10-gas-function-inventory.md`) 중
> `clients/web/estimate-app/views/index.ejs` 13201~16500 구간. 조사자 = ejs-5. 코드 변경 없음(읽기 전용 조사).

## 0. 구간 성격 요약 (먼저 읽을 것)

이 구간은 파일 전체(19,753줄) 중 **주문카드(발송) 흐름의 후반부**에 해당한다 — 분기관(분기배관) 계산 마무리,
할인율 자동보정(45%→40%/보너스), 발송내역·전표·명세서 모달, **주문카드 입력검증·전표전송(`submitOrderCard`)**,
거래처/담당자 검색, 엑셀식 키보드 내비게이션, 재고조회 모달 진입부까지다.

품목의 "기본값을 견적품목에 스키마로 이식"하는 관점에서 이 구간의 핵심 발견은 두 가지다:

1. **`submitOrderCard`의 할인 카테고리 6종**(`has360/has4way/hasStand/hasOneWayDc/hasDeluxeDc/hasFirstGradeDc`) —
   싱글중대형 세트가 어느 정액할인 카테고리에 속하는지를 소비하는 지점. 우리 스키마 `products.discount_flags`가
   이 6종을 전부 표현하는지 확인이 필요한 **결정 필요 항목**.
2. **분기관 코드→모델 매핑**(`pushBranchPartsToCommFromBadges`) — `quantity_sync_*` 스키마와 맞닿는 정적 테이블이지만,
   수량 자체는 사용자가 분기표에 배치한 결과값이라 단순 배수(multiplier) 모델로 그대로 이식되지 않는다.

나머지는 대부분 **주문카드 워크플로우 규칙**(필수입력 게이트, 전화번호 형식, 상/하차 태그, 창고코드 기본값,
중복전송 방지)이며 품목 스키마와는 직접 관련이 없다 — 그래도 상수·임계값은 전부 열거했다(누락 방지).

---

## 1. 완결성 집계 (필수)

| 항목 | 값 |
|---|---|
| **assigned_count** (분모, 인벤토리 라인 수 13201~16500) | **118** |
| **classified_count** | **118** |
| 차이 | 0 |

### 4분류 합계

| 분류 | 건수 |
|---|---|
| business_rule | 45 |
| ui_only | 54 |
| infra_util | 14 |
| dead_code | 5 |
| **합계** | **118** |

분모 산정 방법: 인벤토리 파일의 `clients/web/estimate-app/views/index.ejs` 블록에서 콜론(`:`) 앞 숫자가
13201 이상 16500 이하인 **모든 라인**(최상위 `function` 선언 + 인벤토리가 추출한 내부 `const fn = (...) => {}` /
중첩 `function` 표현식 포함)을 셌다. 마지막 항목은 `16492:function initInventoryModal()`이며, 그 본문 내부의
`doSearch`(16530)·`closeModal`(16580) 등은 16500을 넘어가 **다음 구간(ejs-6) 담당**이다 — 함수 하나가 경계에
걸쳐 있다는 점을 다음 조사자에게 인계한다.

---

## 2. 전수 분류표 (줄번호 · 함수/식별자 · 분류)

`└` 표시는 상위 함수 본문 내부의 인벤토리 추출 항목(중첩 함수·화살표 상수)이며, 분류는 상위 함수를 상속했다
(독립된 규칙이 아니라 그 함수의 구현 파편이기 때문 — 근거는 §3/§5에서 상위 함수 단위로 설명).

### 2.1 분기관(분기배관) 마무리 (13201~13524)

| 줄 | 식별자 | 분류 |
|---|---|---|
| 13219 | `packAllOutColumns` | **dead_code** |
| 13225 | `updateBranchRatios` | business_rule |
| 13278 | `snapshotBranchState` | infra_util |
| 13311 | `pushBranchPartsToCommFromBadges` | business_rule |
| 13319 | └ `const k=...` | business_rule |
| 13341 | `saveBranchState` | infra_util |
| 13349 | `loadBranchState` | infra_util |
| 13354 | `applyBranchState` | ui_only |
| 13429 | `refreshBranchOpenButton` | business_rule |
| 13430 | └ `const mActive` | business_rule |
| 13436 | └ `const isVisible` | business_rule |
| 13459 | └ `const cat` | business_rule |
| 13481 | `refreshBranchButton` | ui_only |
| 13537 | `prepareGateImages` | ui_only |
| 13557 | `showGateImageModal` | ui_only |
| 13618 | `updateImgSlide` | ui_only |

### 2.2 할인율 자동보정 IIFE (13625~13762)

| 줄 | 식별자 | 분류 |
|---|---|---|
| 13633 | `isIndoorOnly` | business_rule |
| 13661 | `getTierBonusRate` | business_rule |
| 13670 | `isStandard45` | business_rule |
| 13675 | `runWithAdjustedRates` | business_rule |
| 13691 | └ `const hSum` | business_rule |
| 13698 | └ `const cSum` | business_rule |

### 2.3 발송내역 (13764~13915)

| 줄 | 식별자 | 분류 |
|---|---|---|
| 13788 | `const toYMD` (btnHistory 클릭핸들러 내부) | infra_util |
| 13813 | `closeHistory` | ui_only |
| 13829 | `enforceDateLimit` (1-인자 버전) | **dead_code** |
| 13861 | `loadHistory` | infra_util |
| 13884 | `renderHistoryTable` | ui_only |

### 2.4 전표 모달 (13917~14237)

| 줄 | 식별자 | 분류 |
|---|---|---|
| 13922 | `getSlipInnerContent` | business_rule |
| 13933 | └ `const getMMDD` (단순 포맷, 규칙 아님) | business_rule* |
| 14052 | `openSlipModal` | ui_only |
| 14109 | `closeSlipModal` | ui_only |
| 14115 | `updateSlipScale` | ui_only |
| 14132 | `handleSlipCopy` | ui_only |
| 14169 | `handleSlipSave` | ui_only |
| 14213 | └ `const x` | ui_only |
| 14214 | └ `const y` | ui_only |

### 2.5 숫자→한글, 명세서(거래명세서) 모달 (14238~14587)

| 줄 | 식별자 | 분류 |
|---|---|---|
| 14239 | `numberToKorean` | infra_util |
| 14274 | `getInvoiceInnerContent` | business_rule |
| 14275 | └ `const safeLogoSrc` | business_rule* |
| 14276 | └ `const safeStampSrc` | business_rule* |
| 14455 | `openInvoiceModal` | ui_only |
| 14500 | └ `const updateScale` | ui_only |
| 14515 | `handleInvoiceCopy` | ui_only |
| 14543 | `handleInvoiceSave` | ui_only |
| 14568 | └ `const x` | ui_only |
| 14569 | └ `const y` | ui_only |

### 2.6 로그, 레이아웃 (14589~14821)

| 줄 | 식별자 | 분류 |
|---|---|---|
| 14590 | `logAction` | infra_util |
| 14611 | `relocateUI` | ui_only |
| 14752 | `updateTopControls` (2번째 정의 — 살아있는 버전) | ui_only |
| 14773 | `toggleDrawer` | ui_only |
| 14814 | `handleResize` | ui_only |

### 2.7 주문카드 검증/스냅샷 (14822~15090)

| 줄 | 식별자 | 분류 |
|---|---|---|
| 14823 | `getCurrentSlipSnapshot` | business_rule |
| 14867 | `toggleSlipButton` | business_rule |
| 14895 | └ `const isAuditOk` | business_rule |
| 14913 | └ `const isPayOk` | business_rule |
| 14961 | `initValidationEvents` | **dead_code** |
| 14989 | `initOrderCard` | business_rule |
| 15070 | └ `const syncAudit` | business_rule* |

### 2.8 주소검색 (네이버/카카오) (15092~15362)

| 줄 | 식별자 | 분류 |
|---|---|---|
| 15093 | `openAddrSearch` | ui_only |
| 15110 | `openAddrDock_` | ui_only |
| 15148 | `onKakaoAddrComplete` | business_rule |
| 15157 | `applyAddrToTarget` | ui_only |
| 15174 | `runNaverLocalSearch` | ui_only |
| 15178 | └ `const q` | ui_only |
| 15206 | `scheduleNaverAutoSearch` | ui_only |
| 15210 | └ `const v` | ui_only |
| 15220 | `escapeHtmlAddr` | infra_util |
| 15227 | `onNaverSearchSuccess` | ui_only |
| 15267 | `makeAddrRow_` | ui_only |
| 15285 | `composeAddrWithBuilding_` | infra_util |
| 15295 | `dedupeAddrWords_` | infra_util |
| 15308 | `onNaverSearchFail` | ui_only |
| 15316 | `toggleSameAddr` | business_rule |
| 15341 | `toggleAuditLater` | business_rule |

### 2.9 결제예정일 / 태그 (15364~15479)

| 줄 | 식별자 | 분류 |
|---|---|---|
| 15365 | `togglePayDueCb` | business_rule |
| 15395 | `updateOrderTags` | business_rule |
| 15435 | `enforceTagsOnInput` | business_rule |

### 2.10 메모/카드검증/초기화/스냅샷복원 (15481~15630)

| 줄 | 식별자 | 분류 |
|---|---|---|
| 15482 | `appendMemo` | ui_only |
| 15498 | `checkCardValid` | ui_only |
| 15503 | `resetCardData` | business_rule |
| 15511 | └ `const setVal` | business_rule* |
| 15545 | └ `const setChk` | business_rule* |
| 15607 | `decodeSnapshotState` | infra_util |
| 15620 | `loadOrderData` | **dead_code** |

### 2.11 전표전송 (15632~16011) — 이 구간 최대 규칙 밀집

| 줄 | 식별자 | 분류 |
|---|---|---|
| 15633 | `submitOrderCard` | business_rule |
| 15638 | └ `const getEl` | business_rule* |
| 15639 | └ `const getVal` | business_rule* |
| 15670 | └ `const fullAddr` | business_rule* |
| 15673 | └ `const getInputVal` | business_rule* |
| 15695 | └ `const fmtPct` | business_rule |
| 15696 | └ `const fmtMoney` | business_rule |
| 15715 | └ `const getCanonicalSection` | business_rule |
| 15968 | └ `const errorMsg` | business_rule* |
| 15975 | └ `const slipNo` | business_rule* |

### 2.12 거래처/담당자 검색 (16013~16337)

| 줄 | 식별자 | 분류 |
|---|---|---|
| 16013 | `initCustomerSearch` | ui_only |
| 16059 | └ `const targets` | ui_only |
| 16075 | └ `const addrShort` | ui_only |
| 16118 | └ `function addActive` | ui_only |
| 16127 | └ `function removeActive` | ui_only |
| 16131 | └ `function closeAllLists` | ui_only |
| 16144 | `getManagerName_` | infra_util |
| 16148 | `getManagerCode_` | infra_util |
| 16152 | `initManagerSearch` | ui_only |
| 16191 | └ `const targets` | ui_only |
| 16240 | └ `function addActive` | ui_only |
| 16249 | └ `function removeActive` | ui_only |
| 16253 | └ `function closeAllLists` | ui_only |
| 16267 | `syncCustomers` | infra_util |
| 16319 | `syncRepTel` | business_rule |
| 16339 | `fillCustomer` | **dead_code** |

### 2.13 엑셀식 키보드 내비게이션 (16353~16489)

| 줄 | 식별자 | 분류 |
|---|---|---|
| 16353 | `initExcelUX` | ui_only |
| 16402 | └ `const dir` | ui_only |
| 16408 | └ `const dir` | ui_only |
| 16416 | └ `const dir` | ui_only |
| 16422 | └ `function moveTableVerticalVisual` | ui_only |
| 16462 | └ `function moveTableHorizontal` | ui_only |
| 16478 | └ `function moveSection` | ui_only |

### 2.14 재고조회 모달 진입 (16492, 경계)

| 줄 | 식별자 | 분류 |
|---|---|---|
| 16492 | `initInventoryModal` (본문은 16500을 넘어 ejs-6 구간까지 이어짐) | business_rule |

`*` = 파편(부모 함수의 세부 구현), 그 자체로 독립적 규칙이 아니라 부모의 분류를 상속. 단, `getMMDD`/`safeLogoSrc`/
`safeStampSrc`/`syncAudit`/`getEl`/`getVal`/`fullAddr`/`getInputVal`/`errorMsg`/`slipNo`/`setVal`/`setChk`는
그 자체로는 순수 기술 파편(포맷/DOM read)이며 상수·임계값을 담고 있지 않다 — §3에서 부모 함수 설명에 포함.

---

## 3. business_rule 상세 (①~⑥)

### 3.1 🎯 `submitOrderCard` — 정액할인 카테고리 6종 소비 (schema 직결, 최우선)

**① 함수명 · 위치**: `submitOrderCard()` — `clients/web/estimate-app/views/index.ejs:15633`

**② 법칙 (조건 → 결과)**

| 입력 조건 | 결과 |
|---|---|
| 세트 헤드(`head`)의 `has360 === true` 이고 `D_360`(입력값, `#ss_disc_360`) `> 0` | `fmtMoney(D_360)` 텍스트를 세트 대표 품목 적요에 추가 |
| `head.has4way === true` 이고 `D_4WAY > 0` (`#ss_disc_4way`) | `fmtMoney(D_4WAY)` 추가 |
| `head.hasStand === true` 이고 `D_STAND > 0` (`#ss_disc_stand`) | `fmtMoney(D_STAND)` 추가 |
| `head.hasOneWayDc === true` 이고 `D_1WAY > 0` (`#ss_disc_1way`) | `fmtMoney(D_1WAY)` 추가 |
| `head.hasDeluxeDc === true` 이고 `D_DLX > 0` (`#ss_disc_deluxe`) | `fmtMoney(D_DLX)` 추가 |
| `head.hasFirstGradeDc === true` 이고 `D_GR1 > 0` (`#ss_disc_grade1`) | `fmtMoney(D_GR1)` 추가 |
| 세트 내 적요가 빈 품목이 있으면 | 그 품목에 할인텍스트 기록 |
| 없으면 | 세트 첫 품목에 병합(단, 그 품목 적요가 배송주소 텍스트와 동일하면 병합 안 함) |
| `HOME`/`COMM`/`OLD` 섹션의 전역 할인율(`dcCfg[sec] >= 0.01`)이고 그 섹션에 `fixedDc >= 0.01`인 품목이 하나라도 있으면 | `fmtPct(rate)`(`Math.round(rate*100)+'%'`) 텍스트를 섹션 내 빈 적요 품목(없으면 첫 품목)에 기록 |
| 품목 `fixedDc`가 문자열이고 파싱값 `>1` | `v/100`으로 나눔(퍼센트 표기 자동 보정) |
| 개별 품목 `fixedDc >= 0.01`이고 직전 품목과 텍스트가 다르면 | `fmtPct(fixedDc)`를 적요에 추가(연속 동일 값은 중복 생략) |
| `window.CURRENT_CARD_FEE > 0` | 두 번째 품목부터 첫 빈 적요에 `"수수료 N원 포함"` 삽입(idx 0은 건너뜀 — 주소가 들어있을 가능성이 높은 자리) |
| `custCode`/`due`/`fullAddr` 중 하나라도 없음 | `throw Error`로 전송 차단 |
| 확인(confirm) 거부 | 전송 취소, `isSubmitting` 해제 |

**③ 상수·임계값·리터럴 전부 열거**
- 할인 플래그 6종(정확한 식별자): `has360`, `has4way`, `hasStand`, `hasOneWayDc`, `hasDeluxeDc`, `hasFirstGradeDc`
- 대응 입력 필드 id 6종: `ss_disc_360`, `ss_disc_4way`, `ss_disc_stand`, `ss_disc_1way`, `ss_disc_deluxe`, `ss_disc_grade1`
- `fmtMoney(n)`: `만`/`천` 단위 절삭 표기(`Math.floor(n/10000)`, `Math.floor((n%10000)/1000)`) — **1,000원 미만 잔액은 텍스트에서 소거**(계산에는 영향 없음, 표시만)
- `fmtPct(r)`: `Math.round(r*100)+'%'`
- `checkGlobalTarget`: `v < 0.01`이면 "대상 아님" — **1% 미만은 할인 없음으로 간주하는 임계값**
- `getCanonicalSection(s)`: `s`를 대문자+영문만 남긴 뒤 `HOME`/`HM`→`HOME`, `COMM`/`CM`→`COMM`, `SINGLE`/`S`→`SINGLE`, `OLD`→`OLD`, 그 외 `ETC`
- 필수값 3종: `custCode`, `due`, `fullAddr` (없으면 각각 다른 에러 메시지로 차단)
- `orderData.payDue` 우선순위: `chkCardPay` 체크 시 `'카드결제'` > `payDueStar` 체크 시 `'*'` > `payDuePre` 체크 시 `'선결제'` > 그 외 입력값 그대로
- `dcInfoStr`(이카운트 `ADD_TXT_06_T`용): COMM 전역% → HOME 전역% → 싱글 정액할인 텍스트들 → 사용자 지정 고정%들 순서로 결합(`' / '` 구분)

**④ 읽는 구글시트 컬럼 / 품목 속성**
- 품목(행) 속성: `fixedDc`, `setId`, `isSetHead`, `has360`, `has4way`, `hasStand`, `hasOneWayDc`, `hasDeluxeDc`, `hasFirstGradeDc`, `section`, `spec`, `model`, `qty`, `price`, `remarks`
- 이 속성들은 이 함수 밖(범위 밖, `classifySingleSetFixed` 등 — `index.ejs:4285` 부근으로 추정, **미조사 범위**)에서 계산되어 넘어온다. 이 함수는 **소비만** 한다.

**⑤ 우리 스키마 대응**
- `fixedDc` → `products.fixed_discount_rate` [표현 가능]
- `has360/has4way/hasStand/hasOneWayDc/hasDeluxeDc/hasFirstGradeDc` → `products.discount_flags` [부분] — 필드는 존재하나 **이 6개 카테고리를 전부 담는 비트 정의인지 미확인**(이 함수의 코드 범위 안에서는 discount_flags의 실제 스키마 정의를 볼 수 없음, 스키마 정의 파일은 조사 범위 밖)
- `D_360` 등 6개 정액할인 금액 자체는 **주문 시점 사용자 입력**(제품 기본값 아님) — 품목 기본값 이식 대상 아님, 이 부분은 order_app의 주문 입력 폼 필드로 남아야 함

**⑥ 견적품목 기본값**
- 🚩[결정 필요] `discount_flags`가 360/4way/stand/1way/deluxe/grade1 6개 카테고리를 정확히 1:1로 표현하는지 스키마 정의(마이그레이션 DDL) 대조 필요. 후보:
  - (A) 이미 6비트 이상으로 정의되어 있다 → 그대로 사용, `bundle_component`/`products` 시딩 시 레거시 6개 플래그를 그대로 매핑
  - (B) discount_flags가 이보다 적은 카테고리만 표현 → 마이그레이션으로 비트 추가 필요(개발책임자 확인 요)
  - (C) 6개 중 일부는 이미 폐기된 레거시 카테고리(구형 세트 전용) → 활성 품목 3,084건 기준 실사용 카테고리만 남기고 축소
  - **권장**: (A)를 우선 확인(스키마 정의 파일 검색으로 즉시 판별 가능한 문제이나 본 조사 범위 밖이라 여기서는 확정하지 않음)

---

### 3.2 `pushBranchPartsToCommFromBadges` — 분기관 코드→모델 정적 매핑

**① 함수명 · 위치**: `pushBranchPartsToCommFromBadges()` — `index.ejs:13311`

**② 법칙**

| 입력 조건 | 결과 |
|---|---|
| `.code-cell` DOM 요소의 `data-code`가 MAP의 키와 일치 | 해당 코드 카운트 `totals[code]++` |
| `totals[code] > 0` | `MAP[code]`로 모델명 결정, `commQty.set(model, count + 수동입력분)` |
| `#branchSummaryBar [data-k="code"] .extra-branch` 입력값 존재 | count에 가산(수동 보정분) |

**③ 상수 전부 열거 (분기관 코드 → 모델코드 고정 테이블)**

| 코드 | 모델코드 |
|---|---|
| `1509` | `AXJ-YA1509N` |
| `2512` | `AXJ-YA2512N` |
| `2812` | `AXJ-YA2812M` |
| `2815` | `AXJ-YA2815M` |
| `3419` | `AXJ-YA3419M` |
| `4119` | `AXJ-YA4119M` |

**④ 읽는 속성**: DOM `data-code`(분기표 배지에 이미 배정된 코드 — 코드 산출 로직 자체는 범위 밖 `recomputeBranchCodes`/`codeByOutdoorHP`, `index.ejs:12669~12760`대), `#branchSummaryBar`의 수동 보정 입력값

**⑤ 스키마 대응**: [부분] — 코드→모델 매핑 자체는 `quantity_sync_target.target_product_id`(모델 6종을 상품으로 등록)로 표현 가능하나, **수량 소스가 정적 배수가 아니라 사용자가 분기표 UI에 실외기·실내기를 드래그해 배치한 결과값**이라 `quantity_sync_source.factor`(고정 배수) 모델에 그대로 들어가지 않는다.

**⑥ 기본값**: 🚩[결정 필요] — 개발책임자 규칙("수량은 설정값이 정한다, 이름/구성 추론 금지")과 이 함수가 충돌하는 지점. 후보:
  - (A) 분기관 수량은 애초에 "품목 기본값"이 아니라 **주문별 입력값**으로 분류하고 quantity_sync 대상에서 제외(현재 UI처럼 사용자가 분기표에서 직접 배치)
  - (B) 모델 6종만 `quantity_sync_target`에 등록해 두고, 소스는 없이(수동전용) 유지
  - **권장**: (A) — 분기관 배치는 실외기 용량조합에 따라 매번 달라지는 물리적 배관 설계이므로 고정 배수 규칙으로 환원 불가능해 보임. 개발책임자 확인 요망(레거시가 왜 "구성/이름 추론"이 아니라 "사용자 배치+코드매핑"을 썼는지 — 분기관은 애초에 자동추론 대상이 아니었을 가능성)

---

### 3.3 `updateBranchRatios` — 분기 용량비 상한

**① 함수명 · 위치**: `updateBranchRatios()` — `index.ejs:13225`

**② 법칙**

| 입력 조건 | 결과 |
|---|---|
| 실외기 품명이 `/프라임\|한랭지\|표준형\|냉난방\|가스히트펌프\|GHP\|프레스티지\|동시냉난방\|공장전원/i` 매치 | `limit = 103.0` (%) |
| 매치 안 됨 | `limit = 120.0` (%) |
| `indoorSum/outdoorCap*100 > limit` | 배지에 `ratio-bad` 클래스(경고 표시) |
| `row.maxIndoor > 0` 이고 배치된 실내기 수 `> maxIndoor` | `"수량 초과"` 배지 표시(비율 대신) |

**③ 상수**: `103.0`, `120.0`(용량비 상한 %), 정규식 카테고리 리스트(위 9개 키워드), 실내기 1대당 가중치 `0.1`(`cap*0.1`을 용량 합산 단위로 사용 — 즉 10을 1로 스케일)

**④ 읽는 속성**: `row['용량']`/`row['능력']`/`row.capacity`(실외기 용량), `row['품 명']`/`row.name`(품명 — 정규식 매치 대상), `row.maxIndoor`(최대 실내기 대수)

**⑤ 스키마 대응**: [불가] — 우리 스키마에 "타이트 계열(103%) vs 일반(120%)" 구분 필드가 없다. `classification`이나 `products`에 해당 boolean/enum이 없음.

**⑥ 기본값**: 🚩[결정 필요] — 이 상한은 품목 "기본값"이 아니라 **UI 검증 임계값**(사용자가 배치를 초과하면 경고만 표시, 강제 차단 아님)이라 "견적품목 기본값" 질문에는 해당 없음. 다만 스키마 이식 시 어디에 저장할지 결정 필요: 후보 (A) `products`에 `branch_ratio_limit_pct` 컬럼 신설 (B) 정규식 매치를 그대로 프론트에 유지(스키마 이식 안 함, UI 로직으로 존속). **권장**: (B) — 이 값은 "기본값 적용"이 아니라 실시간 검증이라 스키마 이식보다 로직 이식이 더 자연스러움. 개발책임자 확인 요.

---

### 3.4 `refreshBranchOpenButton` — 실내/실외기 판별 규칙

**① 함수명 · 위치**: `refreshBranchOpenButton(ctx)` — `index.ejs:13429`

**② 법칙**

| 입력 조건 | 결과 |
|---|---|
| `commQty`에 수량 `>0`인 모델의 `row.catL`(또는 `row['대분류']`) `=== '실외기'` | `hasOut = true` |
| 그 외 `cat.includes('실내')` 또는 `cat.includes('전열')` 또는 (`/^AM\d{3}/i.test(model)` 이면서 `!cat.includes('패널')` 이고 `!cat.includes('리모컨')`) | `hasIn = true` |
| `hasOut && hasIn` | "분기계산" 버튼 활성화 |

**③ 상수**: 분류 리터럴 `'실외기'`, 부분일치 `'실내'`/`'전열'`, 모델코드 접두 정규식 `/^AM\d{3}/i`, 제외 키워드 `'패널'`/`'리모컨'`

**④ 읽는 속성**: `row.catL`/`row['대분류']`(대분류), `row.model`

**⑤ 스키마 대응**: [부분] — `classification.name`(대분류: 실외기/실내기/전열교환기 등)로 대부분 표현 가능하나, **`/^AM\d{3}/i` 정규식 폴백**은 대분류가 비어있거나 애매한 데이터에 대한 보정 로직으로 보인다 — 즉 데이터 품질이 완전하면 불필요한 로직.

**⑥ 기본값**: 🚩[결정 필요] — 상업멀티 실내기 판별을 `classification.name`(정본)만으로 100% 커버 가능한지, 아니면 `/^AM\d{3}/` 폴백이 필요한 예외 품목이 실제로 존재하는지 확인 필요. **권장**: 활성 SHEET 계열 품목(1,121건) 중 `classification`이 비어있거나 `대분류`가 실내/실외로 명확히 안 잡히는 상업멀티 품목이 있는지 SQL로 대조 후, 있으면 그 품목들의 `cat_l_id`를 보정해서 정규식 폴백을 아예 없애는 방향(개발책임자 판단 필요 — 데이터 보정 vs 로직 존속).

---

### 3.5 `isIndoorOnly` / `getTierBonusRate` / `isStandard45` / `runWithAdjustedRates` — 할인율 자동보정 (45%→40%, 누적 보너스)

**① 함수명 · 위치**: IIFE 내부, `index.ejs:13626~13762`. 핵심 3개: `isIndoorOnly()`(13633), `getTierBonusRate(sum)`(13661), `runWithAdjustedRates(callback)`(13675)

**② 법칙**

| 입력 조건 | 결과 |
|---|---|
| 홈멀티+상업멀티 합산 수량 `>0`이고 그중 `실외기`/`outdoor` 매치 수량이 `0` (=실내기만 있음) | "실내기 단독" 판정 |
| 실내기 단독 이고 현재 할인율이 `45%`(`|rate-0.45|<0.001`) | 계산용 할인율을 **40%로 강제 하향** (HOME/COMM 각각 독립 판정) |
| (하향 적용 후에도) 할인율이 정확히 45%로 남아있는 섹션 | 해당 섹션 매출합계(`sumHome()`/`sumComm()`)에 따라 보너스 가산 |
| 합계 `>= 1억(100,000,000)` | `+4%` |
| 합계 `>= 5천만(50,000,000)` | `+3%` |
| 합계 `>= 3천만(30,000,000)` | `+2%` |
| 합계 `>= 1천만(10,000,000)` | `+1%` |
| 그 외 | `+0%` |
| 최종 계산율이 원래 표기율과 다르면 | 각 품목 `REMARKS`(적요) 내 구율(%) 텍스트를 신율(%) 텍스트로 **문자열 치환**(`r.section`이 `HOME`/`COMM`일 때만) |
| `callback()` 실행 후(성공/실패 무관) | `window.DISCOUNT_RATE_HOME`/`COMM`을 **원래 값으로 복구**(임시 조정이었음을 명시) |

**③ 상수·임계값 전부 열거**
- 실내기 단독 판별 정규식: `/실외기|outdoor/i` (품명+대분류 문자열에 매치)
- 표준 할인율 판정 허용오차: `0.001` (즉 45.0% ±0.1%p)
- 실내기 단독 시 하향값: `0.40` (40%)
- 매출 구간 보너스 테이블: `1억→+4%`, `5천만→+3%`, `3천만→+2%`, `1천만→+1%`, `그 미만→+0%`
- 이 보정은 **원래 할인율이 정확히 45%일 때만** 발동(다른 %는 건드리지 않음)

**④ 읽는 속성**: `homeQty`/`commQty`(수량 맵), `HOMEMULTI`/`COMMULTI`(품명/대분류), `window.DISCOUNT_RATE_HOME`/`DISCOUNT_RATE_COMM`, `sumHome()`/`sumComm()`(구간 밖 정의, 13691/13698에서 호출만)

**⑤ 스키마 대응**: [불가] — 이것은 품목 기본값이 아니라 **주문 시점 동적 할인율 재계산 규칙**(사용자가 45%를 입력했을 때만 발동하는 매크로). `products`/`classification` 어디에도 대응 컬럼이 없고, 있어야 할 이유도 없다(주문/견적 앱 로직으로 남는 게 맞다).

**⑥ 기본값**: 해당 없음(품목 기본값 질문 아님). 다만 **상수 값 자체(45%, 40%, 1억/5천/3천/1천만 구간, 1~4% 보너스)는 향후 이 로직을 백엔드로 이관할 경우 반드시 그대로 보존**해야 할 리터럴이므로 여기 기록해 둔다. 변경 시 개발책임자 확인 필요.

---

### 3.6 `toggleSlipButton` / `getCurrentSlipSnapshot` — 전표 전송 게이트 & 중복방지

**① 함수명 · 위치**: `toggleSlipButton()` — `index.ejs:14867`, `getCurrentSlipSnapshot()` — `index.ejs:14823`

**② 법칙**

| 필수 조건(순서대로 검사, 먼저 걸린 것만 표시) | 실패 사유 텍스트 |
|---|---|
| `custSearch`에 `dataset.code`와 값 모두 있어야 함 | `'거래처'` |
| `due`(출고일) 값 필요 | `'출고일'` |
| `whCode`(출고창고) 값 필요 | `'출고창고'` |
| `addrBase`(배송주소) 값 필요 | `'배송주소'` |
| `sameAddr` 또는 `auditLater` 체크, 또는 `addrAuditBase` 값 중 하나 | `'감리주소'` |
| `tel`이 정확히 `/^010-\d{4}-\d{4}$/` 형식 | `'인수자번호'` |
| `memo`(요청사항) 값 필요 | `'요청사항'` |
| `chkCardPay` 또는 `payDueStar` 또는 `payDuePre` 체크, 또는 `payDue` 값 중 하나 | `'입금예정일'` |
| `buildSendRows()` 결과가 1건 이상 | `'품목'` |
| 위 전부 통과 + `getCurrentSlipSnapshot() === window.LAST_SLIP_SNAPSHOT`(직전 전송과 완전 동일) | 버튼 비활성 + `'전표생성불가(중복방지)'` |

**③ 상수**: 전화번호 정규식 `/^010-\d{4}-\d{4}$/`(010 국내번호, 하이픈 고정 포맷), 실패사유 8종 리터럴, 중복판정 스냅샷 키 = `[거래처코드,거래처명,담당자코드,담당자명,출고일,창고코드,배송주소(2필드),감리주소(2필드),같은주소여부,감리추후여부,전화,메모,입금예정일,카드결제여부,입금예정일*표시,선결제여부,야적,지방,품목키] .join('::')`

**④ 읽는 속성**: 없음(품목 스키마 무관 — 주문카드 DOM 입력값들)

**⑤ 스키마 대응**: 해당 없음(주문 워크플로우 검증 규칙, 품목 스키마 무관)

**⑥ 기본값**: 해당 없음. 단, 전화번호 정규식 `010-XXXX-XXXX`와 중복방지 스냅샷 구성 필드 목록은 order_app 이관 시 그대로 보존해야 할 규칙으로 기록.

---

### 3.7 `initOrderCard` / `resetCardData` — 주문카드 기본값

**① 함수명 · 위치**: `initOrderCard()` — `index.ejs:14989`, `resetCardData()` — `index.ejs:15503`

**② 법칙**

| 항목 | 기본값 |
|---|---|
| `due`(출고일) 초기값 | KST 기준 오늘 날짜 (`new Date(Date.now()+9*3600*1000)`) |
| `whCode`(출고창고) 초기값(리셋 시) | `'00003'` |
| `tel`(인수자 번호) 초기값(리셋 시) | `'010-'` |
| `payDue`(입금예정일) 초기값 | 오늘 날짜 |
| `selCutUnit`(절삭 단위) 초기값 | `'0'` |
| VAT 표시(`optVatDisplay`/`optVatPv`) 초기값 | `'inc'`(포함 표시) |
| `tel` 입력 시 자동 하이픈 | `010-XXXX-XXXX` 형식으로 실시간 재포맷(13자 초과 시 절단) |

**③ 상수 전부 열거**: `'00003'`(출고창고 기본코드 — PM 메모리 실측 "창고 코드 00003=초월"과 일치), `'010-'`, `'0'`, `'inc'`

**④ 읽는 속성**: 없음(주문카드 DOM 초기화, 품목 스키마 무관)

**⑤ 스키마 대응**: 해당 없음 — 이 기본값들은 **주문(order_app) 워크플로우의 기본값**이지 `products` 품목 기본값이 아니다. 참고로만 기록.

**⑥ 기본값**: 해당 없음(품목 기본값 질문 대상 아님). `whCode = '00003'`은 창고 기본값으로서 order_app 스키마(주문 헤더)에 이식할 값 후보 — 🚩[결정 필요, order_app 담당 조사자에게 인계 권장]: 창고 기본값을 "00003(초월)"로 하드코딩 유지할지, 사용자 마지막 선택을 기억할지는 이 구간 조사 범위(품목 스키마) 밖이므로 여기서는 사실만 기록한다.

---

### 3.8 `getSlipInnerContent` — 전표 창고 표시명 매핑

**① 함수명 · 위치**: `getSlipInnerContent(d)` — `index.ejs:13922`

**② 법칙**

| 입력 조건 | 결과 |
|---|---|
| `d.warehouse`에 `'초월창고'` 포함 | 표시 텍스트를 `'삼성창고 (초월 무갑)'`로 치환 |
| 그 외 | `d.warehouse` 그대로 표시 |
| `d.payDate` 있음 | 그대로 사용 |
| 없고 `d.date` 있음 | `date.slice(5).replace('-','')`로 `MMDD` 파생 |

**③ 상수**: 매치 리터럴 `'초월창고'` → 표시 리터럴 `'삼성창고 (초월 무갑)'`, 고정 텍스트 `'영업1팀'`(담당부서)

**④ 읽는 속성**: `d.warehouse`, `d.date`, `d.payDate`, `d.items[].name/model/spec/qty`

**⑤ 스키마 대응**: [불가] — 창고 표시명 별칭 테이블이 우리 스키마에 없다(창고 자체가 이 프로젝트 스키마 범위 밖으로 보임 — `products`/`classification`에 창고 개념 없음).

**⑥ 기본값**: 해당 없음(품목 기본값 아님, 전표 출력 텍스트 규칙). order_app/창고 스키마 담당에게 참고 전달 권장.

---

### 3.9 `getInvoiceInnerContent` — 거래명세서 회사 식별정보

**① 함수명 · 위치**: `getInvoiceInnerContent(d, priceMap)` — `index.ejs:14274`

**③ 상수 전부 열거(회사 고정정보)**: TEL `02-3465-1331`, 등록번호 `214-87-20659`, 성명 `김미선`, 상호 `(주)삼한공조시스템`, 주소 `서울 서초구 마방로2길 9 삼한빌딩 4층`, 예금주 `(주)삼한공조시스템`, 계좌 `국민은행 750637-01-002557`/`기업은행 010-3748-9937`, VAT 분할은 범위 밖 `getVatDivisor()` 사용

**⑤ 스키마 대응**: [불가] — 회사 프로필 정보이며 품목/할인 스키마와 무관. 참고용으로만 기록.

**⑥ 기본값**: 해당 없음.

---

### 3.10 주소/태그/결제예정일 미세 규칙 (묶음 서술)

아래 6개는 각각 작은 상수 하나씩을 가진 워크플로우 규칙이라 묶어서 기록한다(품목 스키마 무관, ⑤/⑥ 전부 해당없음).

- **`onKakaoAddrComplete`**(15148): 도로명주소(`roadAddress`) 우선, 없으면 지번(`jibunAddress`), 건물명 있으면 뒤에 append.
- **`toggleSameAddr`**(15316): "배송주소=현장감리주소" 체크 시 감리주소 필드에 배송주소 값 복사 + 비활성화(회색 배경).
- **`toggleAuditLater`**(15341): "현장추후" 체크 시 감리주소를 리터럴 `'추후'`로 고정 + 비활성화.
- **`togglePayDueCb`**(15365): `payDueStar`(*)와 `payDuePre`(선결제)는 상호배타 체크박스, 하나라도 체크되면 `payDue` 날짜필드 비활성화.
- **`updateOrderTags`/`enforceTagsOnInput`**(15395/15435): `chkYard`(야적) 체크 시 주소 앞에 `'야적/'`, `chkLocal`(지방) 체크 시 `'지방/'` 접두 강제 부착(상호배타). 메모 앞에 `"D일상(D+1)일하 "` 태그 자동삽입 — **D+1이 일요일이면 D+2로 이동, 단 야적이고 D가 토요일이면 예외(그대로 일요일 유지)**.
- **`syncRepTel`**(16319): 거래처 대표번호(`custTel`)에서 `/010[-\s]?\d{4}[-\s]?\d{4}/` 매치 시 `010-XXXX-XXXX`로 재포맷해 `tel` 필드에 주입.

### 3.11 `initInventoryModal` — 재고조회 기본 조회일

**① 함수명 · 위치**: `initInventoryModal()` — `index.ejs:16492` (본문이 16500을 넘어 이어짐 — 나머지는 ejs-6 담당)

**② 법칙**: 재고조회 모달을 열 때 `invDate` 기본값 = **KST 기준 오늘 + 20일**.

**③ 상수**: `20`(일)

**⑤/⑥**: 해당 없음(품목 기본값 아님, 조회 UI 기본값). 참고로만 기록. ⚠️ 이 함수의 검색 로직(`doSearch`, 16530~)은 16500을 넘어가 **본 조사 범위 밖** — ejs-6 조사자가 이어서 볼 것.

---

## 4. dead_code 상세 증거 (5건)

🚨 아래 5건은 모두 **호출부 grep 전수 확인** 후 판정했다. 판정 기준: HTML 인라인 `onclick`/`onchange` 속성,
`addEventListener` 콜백 참조(괄호 없는 함수 참조 포함), 문자열 동적 호출 전부 검색.

### 4.1 `packAllOutColumns` (13219) — dead_code

```
$ grep -rn "packAllOutColumns" clients/web/estimate-app
clients\web\estimate-app\views\index.ejs:13219:function packAllOutColumns(){
```
정의 라인 외 호출부 0건. 참고: 자매 파일 `clients/web/order-app/index.html`에는 **동일한 이름의 함수가 있고 실제로 호출된다**(`7683: packAllOutColumns();`) — 즉 order-app 쪽에서는 살아있는 기능이나, **이 파일(estimate-app)에서는 처음부터 배선되지 않았다**. 레거시 GAS 원본(`tools/legacy-gas/종합견적서/index.html:12888`)에서도 호출부 0건으로 동일하게 죽어있어 마이그레이션 중 발생한 회귀가 아니라 **원래부터 estimate-app에서는 미사용**이었던 것으로 판단.

### 4.2 `loadOrderData` (15620) — dead_code

```
$ grep -rn "loadOrderData" clients/web/estimate-app
clients\web\estimate-app\views\index.ejs:15620:function loadOrderData(savedBase64String) {
```
정의 외 호출 0건. 본문 자체도 `restoredItems.forEach(item => { // addRowToTable(...); })`로 **주석 처리된 스텁**이라 실행돼도 아무 일도 하지 않는다. 레거시 원본(`tools/legacy-gas/종합견적서/index.html:15276`)에서도 동일하게 호출부 0건 — 원래부터 미완성 상태로 방치된 코드.

### 4.3 `fillCustomer` (16339) — dead_code

```
$ grep -rn "fillCustomer" clients/web/estimate-app
clients\web\estimate-app\views\index.ejs:16339:function fillCustomer(c) {
```
정의 외 호출 0건(거래처 자동완성은 `initCustomerSearch`의 인라인 `mousedown` 핸들러가 직접 필드를 채우고 있어 `fillCustomer`를 거치지 않음). 레거시 원본(`tools/legacy-gas/종합견적서/index.html:15860`)에서도 호출부 0건.

### 4.4 `initValidationEvents` (14961) — dead_code

```
$ grep -n "initValidationEvents" clients/web/estimate-app/views/index.ejs
14961:function initValidationEvents() {
```
정의 외 호출 0건. 이 함수가 하려던 일(6개 필드에 `input`/`change`→`toggleSlipButton` 바인딩)은 **`initOrderCard()`가 별도로 이미 비슷한 범위의 필드에 `checkCardValid`(=`toggleSlipButton` 래퍼)를 바인딩**하고 있어 기능적으로 대체된 것으로 보인다. 레거시 원본(`tools/legacy-gas/종합견적서/index.html:14623`)에서도 호출부 0건 — 원래부터 미배선.

### 4.5 `enforceDateLimit` — 13829 정의(1-인자) — dead_code (섀도잉으로 인한 사장)

이 파일 안에 **동일 이름의 최상위 `function` 선언이 두 번** 있다:
```
$ grep -n "function enforceDateLimit" clients/web/estimate-app/views/index.ejs
13829:function enforceDateLimit(changedId) {
16602:function enforceDateLimit(changedType, startId, endId) {
```
자바스크립트의 함수선언 호이스팅 규칙상, 같은 스코프(둘 다 최상위, 감싸는 블록/IIFE 없음 — 직접 확인함)에
동일 이름의 `function` 선언이 두 번 있으면 **소스상 나중 선언이 앞 선언을 완전히 덮어쓴다**(파싱 단계에서
확정되며, 코드 실행 순서와 무관). 실제 호출부를 보면:
```
$ grep -n "enforceDateLimit(" clients/web/estimate-app/views/index.ejs
16634:    elStart.addEventListener('change', () => enforceDateLimit('start', 'histStart', 'histEnd'));
16635:    elEnd.addEventListener('change', () => enforceDateLimit('end', 'histStart', 'histEnd'));
16642:    snapStart.addEventListener('change', () => enforceDateLimit('start', 'snapStart', 'snapEnd'));
16643:    snapEnd.addEventListener('change', () => enforceDateLimit('end', 'snapStart', 'snapEnd'));
```
전부 **3-인자** 형태로만 호출된다 — 즉 16602의 두 번째 정의가 실제로 동작하는 버전이고, **13829의 1-인자
버전 본문은 프로그램 전체에서 단 한 번도 실행될 수 없다**(이름이 영구히 가려짐). ⚠️ 다만 이 규칙이 담고 있던
"기간 7일 초과 시 자동 보정, 역순 시 자동 스왑" 자체는 **소실되지 않았다** — 16602 버전(범위 밖, ejs-6 담당)이
동일한 규칙을 유지하며 살아있다. 즉 이 건은 "업무 규칙 소실"이 아니라 "죽은 중복 코드 조각" 판정이다.

---

## 5. decisions_needed 요약 (본문 §3과 동일 내용, 발췌)

1. **`discount_flags` 6종 카테고리 커버리지** — `submitOrderCard`가 소비하는 `has360/has4way/hasStand/hasOneWayDc/hasDeluxeDc/hasFirstGradeDc` 6개가 `products.discount_flags`에 전부 비트로 정의돼 있는지 스키마 정의 대조 필요.
2. **분기관 코드→모델 매핑의 수량 산출 방식** — 정적 매핑(6개 코드→모델)은 `quantity_sync_target`에 넣을 수 있으나, 수량 자체가 사용자의 분기표 배치 결과값이라 고정 배수(`quantity_sync_source.factor`) 모델에 맞지 않음. 별도 취급 여부 결정 필요.
3. **분기 용량비 상한(103%/120%) 저장 위치** — 품목 기본값이 아니라 UI 검증 임계값. 스키마에 컬럼을 신설할지, 프론트 로직으로 존속시킬지 결정 필요.
4. **`/^AM\d{3}/` 실내기 판별 정규식 폴백 필요 여부** — `classification.name`만으로 상업멀티 실내/실외 분류가 완전한지 SQL 대조 후, 폴백이 불필요하면 로직 제거 검토(데이터 보정 vs 로직 존속).

(창고 기본값 `'00003'`, 전표 창고 표시명 매핑 `'초월창고'→'삼성창고 (초월 무갑)'` 등은 품목 스키마 밖이라 order_app/창고 담당 조사자에게 참고 전달 — 이 보고서 §3.7/§3.8에 사실만 기록해 둠.)
