# GAS 전수조사 — ejs-4 (`clients/web/estimate-app/views/index.ejs` 9901~13200)

> 분모 고정: `docs/dev-reports/2026-08-10-gas-function-inventory.md`
> 범위: `clients/web/estimate-app/views/index.ejs` 줄 9901~13200
> 조사자: ejs-4 담당 에이전트 (코드/스키마/git 변경 없음, 조사 전용)

## 0. 완결성 집계 (1절 — 필수)

인벤토리 원문에서 9901~13200 구간에 속하는 함수/최상위 식별자를 전수 추출.
(9840줄 `openSelectedSpec()` 은 9901 이전에 시작하므로 이전 담당(ejs-3) 소관 — 9901~9961 구간은
그 함수의 본문(`.sort()` 콜백 등)일 뿐 신규 항목 없음. 첫 신규 항목은 9962줄 `getSpecCanvas`.
마지막 항목은 13198줄 `buildBranchView`(13219줄 `packAllOutColumns` 은 13200 초과로 제외).)

| 항목 | 건수 |
|---|---|
| **assigned_count** (인벤토리상 배정 구간 전체 항목) | **105** |
| **classified_count** (아래 표에서 분류 완료된 항목) | **105** |
| business_rule | 16 |
| ui_only | 78 |
| infra_util | 7 |
| dead_code | 4 |
| 합계 | 105 |

assigned_count = classified_count = 105. 누락 없음.

---

## 1. 전수 분류표 (줄번호 · 함수명/식별자 · 분류)

| # | 줄 | 함수/식별자 | 분류 |
|---|---|---|---|
| 1 | 9962 | `getSpecCanvas` | ui_only |
| 2 | 9990 | `copySelectedSpec` | ui_only |
| 3 | 10006 | `saveSelectedSpec` | ui_only |
| 4 | 10017 | `forceOrderTitle` | ui_only |
| 5 | 10026 | `clearFilterInput` | ui_only |
| 6 | 10036 | `resetHome` | **business_rule** |
| 7 | 10050 | (resetHome 내부) `const el` | ui_only |
| 8 | 10100 | `resetComm` | **business_rule** |
| 9 | 10129 | (resetComm 내부) `const setVal` | ui_only |
| 10 | 10133 | (resetComm 내부) `const setChk` | ui_only |
| 11 | 10152 | (resetComm 내부) `const el` | ui_only |
| 12 | 10181 | `resetBranch` | **business_rule** |
| 13 | 10226 | `resetSingle` | **business_rule** |
| 14 | 10279 | `resetOld` | **business_rule** |
| 15 | 10310 | `initEvents` | ui_only |
| 16 | 10311 | (initEvents 내부) `const el` | ui_only |
| 17 | 10316 | (initEvents 내부) `const getKstToday` | infra_util |
| 18 | 10361 | (initEvents 내부) `const bindTap` | ui_only |
| 19 | 10426 | (initEvents 내부) `const bindOrderHotkeys` | ui_only |
| 20 | 10479 | `updateInlineTotals` | ui_only |
| 21 | 10497 | `fixFootersForMobile` | **business_rule** |
| 22 | 10659 | `fitTableWrap` | ui_only |
| 23 | 10667 | (fitTableWrap 내부) `const vh` | ui_only |
| 24 | 10691 | `fitAllTables` | ui_only |
| 25 | 10699 | `call` | infra_util |
| 26 | 10701 | `setText` | infra_util |
| 27 | 10703 | `fmtOrRaw` | infra_util |
| 28 | 10705 | `valuesOf` | **dead_code** |
| 29 | 10708 | `goOrderInfo` | ui_only |
| 30 | 10722 | `goPreview` | ui_only |
| 31 | 10786 | `goFinal` | ui_only |
| 32 | 10804 | `clearAllActiveClasses` | ui_only |
| 33 | 10813 | `getSelectedTotalCount` | ui_only |
| 34 | 10827 | `goHome` | ui_only |
| 35 | 10839 | `goSingle` | ui_only |
| 36 | 10851 | `goComm` | ui_only |
| 37 | 10870 | `goOld` | ui_only |
| 38 | 10884 | `copyToClipboardImage` | **dead_code** |
| 39 | 10923 | `downloadFile` | **dead_code** |
| 40 | 10989 | `getSingleSetOptionLabel` | **business_rule** |
| 41 | 11053 | `getSingleSetOptionLabelLive` | **business_rule** |
| 42 | 11064 | (getSingleSetOptionLabelLive 내부) `const hasPart` | ui_only |
| 43 | 11081 | `getStructuredQuoteData` | **business_rule** |
| 44 | 11218 | (getStructuredQuoteData 내부) `const sSpec` | ui_only |
| 45 | 11226 | (getStructuredQuoteData 내부) `const hay` | ui_only |
| 46 | 11431 | (getStructuredQuoteData 내부) `const getCustoms` | ui_only |
| 47 | 11478 | `getVatLabel` | ui_only |
| 48 | 11495 | `syncVatCardPv` | ui_only |
| 49 | 11517 | `syncVatFromOrderInfo` | ui_only |
| 50 | 11526 | `getQuoteItemBgColor` | ui_only |
| 51 | 11579 | `renderPreviewContent` | ui_only |
| 52 | 11661 | (renderPreviewContent 내부) `const fmt` | infra_util |
| 53 | 11681 | (renderPreviewContent 내부) `function parseRatioText` | ui_only |
| 54 | 11854 | `processPCExport` | ui_only |
| 55 | 11965 | (processPCExport 내부) `const hVal` | ui_only |
| 56 | 11966 | (processPCExport 내부) `const hLim` | ui_only |
| 57 | 11967 | (processPCExport 내부) `const cVal` | ui_only |
| 58 | 11968 | (processPCExport 내부) `const cLim` | ui_only |
| 59 | 12028 | (processPCExport 내부) `const borderR` | ui_only |
| 60 | 12029 | (processPCExport 내부) `const bg` | ui_only |
| 61 | 12030 | (processPCExport 내부) `const clr` | ui_only |
| 62 | 12158 | (processPCExport 내부) `callback: function(doc)` | ui_only |
| 63 | 12209 | `escapeBOCsvField` | infra_util |
| 64 | 12219 | `processBOCSVExport` | **business_rule** |
| 65 | 12255 | (processBOCSVExport 내부) `const model` | ui_only |
| 66 | 12260 | (processBOCSVExport 내부) `const nameStr` | ui_only |
| 67 | 12301 | `renderMainScreenDate` | ui_only |
| 68 | 12323 | `openSaveOptions` | ui_only |
| 69 | 12324 | `closeSaveOptions` | ui_only |
| 70 | 12327 | `renderFinalContent` | ui_only |
| 71 | 12375 | (renderFinalContent 내부) `const currentSub` | ui_only |
| 72 | 12392 | `makeFinalSortable` | ui_only |
| 73 | 12399 | (makeFinalSortable 내부) `const onStart` | ui_only |
| 74 | 12434 | (makeFinalSortable 내부) `const onMove` | ui_only |
| 75 | 12471 | (makeFinalSortable 내부) `const onEnd` | ui_only |
| 76 | 12495 | (makeFinalSortable 내부) `const moveAt` | ui_only |
| 77 | 12522 | (makeFinalSortable 내부) `const bindNav` | ui_only |
| 78 | 12548 | `bindViewSwitchButtons` | ui_only |
| 79 | 12607 | `const _toInt` (모듈 최상위) | infra_util |
| 80 | 12613 | `capFromModel` | **dead_code** |
| 81 | 12619 | `pickSelectedOutdoors` | **business_rule** |
| 82 | 12620 | (pickSelectedOutdoors 내부) `const rows` | ui_only |
| 83 | 12641 | `pickSelectedIndoorsExpanded` | **business_rule** |
| 84 | 12642 | (pickSelectedIndoorsExpanded 내부) `const rows` | ui_only |
| 85 | 12669 | `codeByCumulativeSum` | **business_rule** |
| 86 | 12679 | `codeByOutdoorHP` | **business_rule** |
| 87 | 12692 | `recomputeBranchCodes` | **business_rule** |
| 88 | 12748 | (recomputeBranchCodes 내부) `const k` | ui_only |
| 89 | 12762 | `ensureBranchScaffold` | ui_only |
| 90 | 12810 | `syncCommQtyFromDOM` | ui_only |
| 91 | 12819 | `goBranchPage` | ui_only |
| 92 | 12848 | `backToComm` | ui_only |
| 93 | 12869 | `updateBranchTopButton` | ui_only |
| 94 | 12878 | `handleBranchToggleClick` | ui_only |
| 95 | 12884 | `renderBranchTable` | ui_only |
| 96 | 12929 | `makeCapsule` | ui_only |
| 97 | 12941 | `fixBranchDOM` | ui_only |
| 98 | 12950 | `wireBranchInput` | ui_only |
| 99 | 12968 | `makeBranchColumnSortable` | ui_only |
| 100 | 13037 | (makeBranchColumnSortable 내부) `const applyFlip` | ui_only |
| 101 | 13089 | `packOutColumn` | ui_only |
| 102 | 13122 | `updateBranchVisuals` | **business_rule** |
| 103 | 13174 | `repackLeft` | ui_only |
| 104 | 13190 | `pushBackToLeft` | ui_only |
| 105 | 13198 | `buildBranchView` | ui_only |

---

## 2. dead_code 판정 근거 (호출부 전수 확인)

4건 모두 `index.ejs` 전체(HTML 인라인 `onclick` 속성 포함)를 대상으로 grep 실행, **정의 1건만 매치되고 호출부 0건**임을 확인.

```bash
cd clients/web/estimate-app/views
grep -n "valuesOf" index.ejs
# 10705:function valuesOf(m){ return m && typeof m.values === 'function' ? Array.from(m.values()) : []; }

grep -n "capFromModel" index.ejs
# 12613:function capFromModel(model){

grep -n "copyToClipboardImage" index.ejs
# 10884:async function copyToClipboardImage() {

grep -n "downloadFile" index.ejs
# 10923:async function downloadFile(type) {
```

저장 옵션 모달(`#saveOptionsOverlay`, 1903~1912줄)의 실제 `onclick` 은 `processPCExport('png'|'jpg'|'pdf')` 와
`processBOCSVExport()` 뿐이며 `downloadFile()` / `copyToClipboardImage()` 는 어떤 버튼에도 연결되어 있지 않음
(둘 다 `processPCExport`/`copySelectedSpec` 계열로 대체된 구버전 함수로 추정). 추가로 저장소 전체(repo-wide)에서도
동적 호출(`window['downloadFile']` 류) 패턴이 없음을 확인:

```bash
grep -n "download\|Clipboard" index.ejs | grep -iv "clipboardimage\|clipboarditem\|navigator.clipboard\|copytoclipboardimage\|downloadfile"
# → link.download = ... 형태(다른 함수의 <a> 다운로드 속성)만 매치, 함수 호출 없음
```

`capFromModel` 은 정의만 있고 호출부가 없으나, **동일한 정규식 패턴(`/AM(\d{3})/i` 로 모델코드에서 용량 추출)이
`pickSelectedIndoorsExpanded`(12658줄) 와 `recomputeBranchCodes`(12736줄) 에 인라인으로 중복 존재** —
즉 "용량 추출" 규칙 자체는 살아있고, `capFromModel` 이라는 **이름 붙은 함수만** 죽어있다. 업무 규칙 소실 위험 없음.

`valuesOf` / `copyToClipboardImage` / `downloadFile` 은 대체 경로(각각 `Array.from(m.values())` 인라인 사용,
`copySelectedSpec`/`processPCExport`)가 이미 살아있어 로직 소실 없음.

---

## 3. business_rule 상세 (16건)

### 3.1 `resetHome` — 10036줄

② 조건→결과
| 조건 | 결과 |
|---|---|
| 홈멀티 초기화 버튼(실제 호출부: 9359줄 `showResetProgress(resetHome)`) | 아래 필드를 전부 시트 기본값/고정값으로 되돌림 |

③ 상수
- `home_rate` 기본값 = **45** (%, 할인율 슬라이더)
- `home_round_unit` 기본값 = **0**
- `home_round_mode` 기본값 = **'ROUND'**
- `home_remote` 기본값 = `HOME_DEFAULTS['리모컨']` (단, 시트값이 `'선택 안함'` 이면 `'기본'` 으로 강제 치환)
- `home_panel` 기본값 = `HOME_DEFAULTS['판넬변경']`
- `home_no_hose` 체크 기본값 = `!!HOME_DEFAULTS['유연호스 제외']`
- `home_no_branch` 체크 기본값 = `!!HOME_DEFAULTS['분기관 제외']`
- `home_foot` 체크 기본값 = `!!HOME_DEFAULTS['발통포함']`
- `chkHomeInc` 체크 기본값 = `!!PRICE_DEFAULT_VARIANT.homemulti`

④ 읽는 값: `HOME_DEFAULTS`(구글시트 "기본값" 계열 — `code.js:1215 getHomeDefaults()` 가 적재, ejs-4 범위 밖이라 재조사하지 않음), `PRICE_DEFAULT_VARIANT.homemulti`(`db-catalog.js:226 priceDefaultVariant()` — 범위 밖).

⑤ 스키마 대응: **[불가]** — 이 값들은 "품목" 이 아니라 **홈멀티 카테고리 전체에 적용되는 견적 세션 UI 기본값**(할인율/절삭단위/라운딩모드/리모컨·판넬 기본옵션)이다. 주어진 스키마(products/classification/bundle_component/quantity_sync_*)는 품목 단위 컬럼이며 "카테고리별 견적 UI 설정"을 담을 테이블이 없음.

⑥ 기본값: 🚩[결정 필요] — 아래 §4 결정사항 5번 참조(홈/상업/싱글/구형 4개 카테고리가 동일 패턴이라 하나로 묶어 결정 요청).

---

### 3.2 `resetComm` — 10100줄

③ 상수: `comm_rate=45`, `comm_round_unit=0`, `comm_round_mode='ROUND'`, `comm_panel='기본판넬'`, `comm_p360='원형'`, `comm_remote='무선'`, `comm_hose_i/comm_ex_hose/comm_ex_base/comm_ext_out` 체크 기본값 `false`, `chkCommInc = !!PRICE_DEFAULT_VARIANT.commercialMulti`.

④ 읽는 값: 위와 동일 구조, 상업멀티 전용 리터럴(하드코딩, 시트 참조 아님) — `'기본판넬'`,`'원형'`,`'무선'`.

⑤/⑥: 3.1과 동일 — [불가] / 🚩결정 필요(§4-5).

---

### 3.3 `resetBranch` — 10181줄

② 조건→결과
| 조건 | 결과 |
|---|---|
| `commQty` 의 key(모델명/품목명)가 정규식 `/(분기관\|AXJ)/i` 에 매치 | 해당 key 를 `commQty` 에서 삭제(분기계산 관련 수량만 선별 초기화) |

③ 상수: 정규식 `/(분기관\|AXJ)/i` — **`AXJ` 는 삼성 상업멀티 분기관(브랜치 조인트) 부품의 모델코드 접두어**로 확인됨(§3.7 `codeByCumulativeSum` 의 분기관 코드 6종과 같은 부품군).

④ 읽는 값: `commQty` map 의 key(모델/품목명 문자열).

⑤ 스키마 대응: **[부분]** — "이 품목이 분기관인가"는 문자열 매칭이 아니라 `classification`/`product_category` 로 판별 가능해야 함. `AXJ` 접두어 품목들의 현재 classification 값을 실측 확인해 매핑해야 이름 매칭을 제거할 수 있음.

⑥ 기본값: [자동 가능] — `AXJ` 접두어 품목 전수(코드로 `SELECT * FROM products WHERE model_code LIKE 'AXJ%'`) 조회 후 해당 품목들의 classification 값이 이미 "분기관" 계열로 일관되면 그 값을 그대로 채택. 불일치 시 🚩결정 필요.

---

### 3.4 `resetSingle` — 10226줄

③ 상수: `ss_disc_360/ss_disc_4way/ss_disc_stand/ss_disc_1way/ss_disc_deluxe/ss_disc_grade1` 기본값 **0**(원), `ss_expand` 체크 기본값 `false`, `ss_remote = SINGLE_DEFAULTS['유선리모컨']`, `ss_remote_ex = !!SINGLE_DEFAULTS['리모컨 제외']`, `ss_base = !!SINGLE_DEFAULTS['실외기 받침대 포함']`, `ss_panel = SINGLE_DEFAULTS['판넬변경']`, `ss_p360 = SINGLE_DEFAULTS['360판넬'] || '원형'`, `ss_mat = SINGLE_DEFAULTS['자재 포함 여부'] || '별도'`, `chkSingleInc = !!PRICE_DEFAULT_VARIANT.singleSets`.

④ 읽는 값: `SINGLE_DEFAULTS`(`code.js:1256 getSingleDefaults()`, 범위 밖).

⑤/⑥: 3.1과 동일 유형 — [불가] / 🚩결정 필요(§4-5).

---

### 3.5 `resetOld` — 10279줄

③ 상수: `old_rate` 기본값 = `getOldDiscountPercent()`(함수 호출 결과 — 정적 리터럴이 아니라 다른 설정값에서 파생됨, 원본은 estimateConfigNumber 계열, ejs-4 범위 밖), `old_round_unit` 기본값 = **0**.

⑤/⑥: [불가] / 🚩결정 필요(§4-5). 단, `old_rate` 는 하드코딩이 아니라 `estimateConfig` 기반 파생값이므로 이식 시에도 정적 상수가 아니라 **설정값 참조**로 유지해야 함(값 자체가 아니라 "어디서 읽는지"가 이식 대상).

---

### 3.6 `fixFootersForMobile` — 10497줄

이름과 달리 함수 끝부분(10552~10655줄)에 **전표생성 버튼(`#btnGenSlip`) 클릭 핸들러**가 통째로 붙어 있어 실질적으로 주문서 제출 페이로드 구성 로직을 포함한다(레거시 코드 배치 문제로 보이나 원문 그대로 보고).

② 조건→결과
| 조건 | 결과 |
|---|---|
| `#whCode` select 요소가 없음(DOM 미존재) | `whCode = '00003'` (창고코드 하드코딩 폴백) |
| `#chkCardPay` 체크됨 | `payDue = '카드결제'` |
| 카드결제 미체크 & `#payDuePre` 체크됨 | `payDue = '선결제'` |
| 둘 다 미체크 | `payDue = document.getElementById('payDue').value`(수동 입력 날짜) |

③ 상수: 창고코드 폴백 **`'00003'`**(메모리 기록상 "초월" 창고코드로 추정 — 홈PC 실측에선 미존재 코드였음, 재검증 필요), 결제조건 우선순위 문자열 `'카드결제'` > `'선결제'` > 수동값.

④ 읽는 값: DOM 폼 필드(`#custSearch`,`#managerSearch`,`#addrBase`,`#addrDetail`,`#addrAuditBase`,`#addrAuditDetail`,`#whCode`,`#due`,`#tel`,`#memo`) — 구글시트 컬럼이 아니라 주문서 입력 폼.

⑤ 스키마 대응: **[불가]** — 창고코드/결제조건은 품목(products) 스키마가 아니라 주문/전표 스키마 영역. 주어진 4개 표에 대응 없음(다른 담당 범위일 가능성 — 주문서 도메인 에이전트 확인 필요).

⑥ 기본값: 🚩[결정 필요] — 기본 출고창고 코드 `'00003'` 을 신규 시스템에서 하드코딩 유지할지, 거래처별/설정 테이블로 뺄지 결정 필요(§4-6).

---

### 3.7 `codeByCumulativeSum` — 12669줄, `codeByOutdoorHP` — 12679줄, `recomputeBranchCodes` — 12692줄

세 함수가 하나의 규칙(상업멀티 **분기관(브랜치 파이프) 모델코드 선택**)을 구성하므로 함께 기술.

② 조건→결과 — **누적 용량(구간 중간 분기점) 기준**(`codeByCumulativeSum`, csum 단위 불명 — 코드상 정수, 추정 HP*10 또는 kcal 환산치. 원문 그대로 기재):
| csum 범위 | 분기관 코드 |
|---|---|
| csum < 150 | `1509` |
| 150 ≤ csum < 406 | `2512` |
| 406 ≤ csum < 464 | `2812` |
| 464 ≤ csum < 696 | `2815` |
| 696 ≤ csum < 986 | `3419` |
| csum ≥ 986 | `4119` |

**실외기 자체 용량(HP) 기준**(`codeByOutdoorHP` — 체인의 **마지막 분기점**에서만 적용, `def`(누적합 기준값)를 덮어씀):
| HP 범위 | 분기관 코드 |
|---|---|
| hp ≤ 50 | `1509` |
| 50 < hp ≤ 100 | `2512` |
| 100 < hp ≤ 160 | `2812` |
| 160 < hp ≤ 220 | `2815` |
| 220 < hp ≤ 340 | `3419` |
| hp > 340 | `4119` |
| hp 미지정(0 이하/NaN) | 인자로 받은 `def`(누적합 기준 코드) 그대로 사용 |

**추가 규칙**(`recomputeBranchCodes`): 한 실외기 체인 안에서 **채워진 슬롯이 2개 이상일 때만** 코드를 배정(`filled.length > 1`) — 슬롯 1개(분기 없음)는 항상 `'-'`. 마지막 채워진 슬롯의 코드는 위 "실외기 자체 용량" 표로 최종 덮어씀(중간 분기점은 누적합 표, 최종 분기점은 실외기 자체 용량 표를 쓰는 2단 규칙).

③ 상수(전부 열거, **분기관 코드 6종 — 완전열거 확인**: `ensureBranchScaffold`(12762줄) UI 뱃지가 동일 6개 코드를 하드코딩하고 있어 교차 확인됨):
`'1509'`, `'2512'`, `'2812'`, `'2815'`, `'3419'`, `'4119'` — 임계값: `150,406,464,696,986`(누적합) / `50,100,160,220,340`(실외기HP).

④ 읽는 값: 사용자가 `.cap-input` 에 입력한 실외기별 용량 값(시트 컬럼 아님, 견적 작성 시점 입력), 실외기 model 문자열에서 정규식 `/^AM\s*-?\s*(\d{3})/i` 로 추출한 HP.

⑤ 스키마 대응: **[불가]** — "연속 구간(range) → 코드" 룩업은 주어진 4개 표(quantity_sync_rule/source/target, bundle_component) 어디에도 정확히 대응하지 않음. `quantity_sync_rule.condition_json(jsonb)` 을 재활용하면 구간 조건은 표현 가능하나, 이 규칙은 "수량 배수"가 아니라 "어떤 모델코드를 선택할지"이므로 목적이 다름.

⑥ 기본값: [자동 가능한 부분] 위 6행 임계값 표는 완전 열거되어 있어 그대로 이식 가능(값 자체는 확정). 🚩[결정 필요]는 "이 표를 넣을 그릇"(§4-1).

---

### 3.8 `pickSelectedOutdoors` — 12619줄, `pickSelectedIndoorsExpanded` — 12641줄

② 조건→결과
| 조건 | 결과 |
|---|---|
| `COMMULTI` 행의 `model` 이 `'AM'` 으로 시작하고 길이≥7, **7번째 문자(index 6)가 `'X'`** | 실외기(outdoor)로 분류, `pickSelectedOutdoors` 목록에 포함 |
| 〃 7번째 문자가 `'N'` | 실내기(indoor)로 분류, `pickSelectedIndoorsExpanded` 목록에 포함 |
| 수량 | `commQty` map 에서 그대로 읽음(**이름/모델에서 추론하지 않고 기존 수량상태를 그대로 사용** — 개발책임자 확정 규칙과 합치) |

③ 상수: 모델코드 위치 규약(`model[6] === 'X'` 실외기 / `model[6] === 'N'` 실내기), 용량 추출 정규식 `/AM(\d{3})/i`.

④ 읽는 값: `COMMULTI` 카탈로그(`model`, `name`, `능력`/`capacity`), `commQty` 상태맵, DOM 표시 순서(`#commBody .item-row` 의 `data-model`).

⑤ 스키마 대응: **[부분]** — 실내기/실외기 구분은 이미 `classification.name`/`product_category`(관측된 catL 값: `'실외기'`,`'실내기'`)로 표현 가능하므로 model 문자열 파싱은 대체 가능. 단 **용량(HP/능력) 자체는 products 테이블에 전용 컬럼이 없어 [불가]** — model 문자열 파싱(`/AM(\d{3})/i`)에 의존해야 하거나 신규 컬럼이 필요.

⑥ 기본값: 실내기/실외기 분류는 [자동] classification 참조로 대체(추가 결정 불요). 용량 컬럼 신설 여부는 🚩[결정 필요](§4-2).

---

### 3.9 `updateBranchVisuals` — 13122줄

② 조건→결과
| 조건 | 결과 |
|---|---|
| 사용자가 `.cap-input` 에 입력한 용량 값이, 선택된 실내기 풀(pickSelectedIndoorsExpanded) 중 아직 미사용(`!p.used`)인 항목의 `cap` 과 일치 | 해당 실내기를 "사용됨" 처리 |
| 일치하는 실내기가 없음 | **가상(phantom) 모델코드 `'AM' + 용량.padStart(3,'0')`** 를 생성해 적색(#fee2e2/#b91c1c)으로 표시(불일치 경고) |

③ 상수: 가상 모델코드 생성 규칙 `'AM' + String(val).padStart(3,'0')`(예: 용량 40 입력 시 `'AM040'`), 경고 색상 `#fee2e2`/`#b91c1c`/`#fca5a5`.

④ 읽는 값: 사용자 입력 용량, `pickSelectedIndoorsExpanded()` 결과 풀.

⑤ 스키마 대응: **[불가]** — 이는 저장 데이터가 아니라 **런타임 검증 UI**(입력 용량이 실제 선택 실내기와 불일치할 때의 경고 표시)이며 품목 스키마에 저장될 대상이 없음.

⑥ 기본값: 해당 없음(UI 정책) — 🚩[결정 필요]는 "이 경고 UX 자체를 신규 시스템에서도 유지할지"이며 스키마 결정이 아니라 UX 이관 여부 결정이라 §4 결정목록에서 낮은 우선순위로만 언급(§4-7).

---

### 3.10 `getSingleSetOptionLabel` — 10989줄, `getSingleSetOptionLabelLive` — 11053줄

② 조건→결과(정적 버전 `getSingleSetOptionLabel`)
| 조건 | 결과 |
|---|---|
| 분류(catL) === `'부자재'` 또는 `'실외기 받침'` | 라벨 없음(`''`) |
| 품명에 `/발통/` 매치 | 라벨 없음 |
| 세트에 리모컨 부품 존재 & `#ss_remote_ex` 체크 | `' (리모컨 제외)'` |
| 세트에 리모컨 부품 존재 & `allowRemoteChange_(s)===true` & `#ss_remote` 값이 `'기본'`/`'무선'` 아님 | 해당 선택값을 라벨에 추가 |
| 세트에 판넬 부품 존재 & `#ss_panel` 값이 `'기본'`/`'선택 안함'` 아님 & 값이 `'블랙판넬'` 또는 `'승강판넬'` | **4-way 세트이거나 360 세트일 때만** 라벨에 추가(그 외 세트 타입은 승강/블랙판넬 옵션 자체를 라벨에 반영하지 않음 — "승강제한") |
| 위 판넬값이 그 외 값 | 조건 없이 라벨에 추가 |
| 360 세트(`is360`) & `#ss_p360` 값이 `'기본'` 아님 | 라벨에 추가 |
| 모델코드가 `'AC'` 로 시작하지 않음 & `#ss_mat==='포함'` | `'자재포함'` 라벨 추가 |

라이브 버전(`getSingleSetOptionLabelLive`)은 DOM 상 실제 활성화된 부품 행(`part-qty-single≠0`)을 정규식(`/유선.*리모컨/`,`/컬러.*리모컨/`,`/블랙.*판넬/`,`/승강.*판넬/`,`/공청.*판넬/`,`/360/`&`/사각/`)으로 스캔해 동일 계열 라벨을 만듦 — 정적 규칙의 "실행 시점 재확인" 버전.

③ 상수: 문자열 리터럴 `'기본'`,`'무선'`,`'선택 안함'`,`'블랙판넬'`,`'승강판넬'`,`'자재포함'`,`'컬러유선'`,`'유선리모컨'`,`'공청판넬'`,`'사각'`, 모델 접두어 `'AC'`.

④ 읽는 값: `SINGLE_SETS`(`s.name`,`s.model`,`s.catL`), `SINGLE_PARTS`(부품 kind/name, `partsForSetStrict_`/`explodeSetParts` 경유), UI select(`#ss_remote`,`#ss_panel`,`#ss_p360`,`#ss_mat`,`#ss_remote_ex`) — 이 select 들의 초기값은 `SINGLE_DEFAULTS` 시트에서 옴(§3.4).

⑤ 스키마 대응: **[부분]** — 리모컨/판넬 옵션 종류 자체는 `bundle_component.component_kind`/`component_variant`/`is_default` 로 표현 가능. 그러나 **"블랙판넬·승강판넬은 4-way 또는 360 세트에서만 허용"이라는 옵션 간 호환성 제약**은 현재 스키마에 조건식을 담을 필드가 없음(단순 존재 여부만 표현되고, "이 변형은 이 세트 형태에서만 유효하다"는 제약은 별도).

⑥ 기본값: 리모컨/판넬 기본옵션 자체는 [자동] `SINGLE_DEFAULTS` 시트값을 그대로 채택(예: 유선리모컨 여부, 판넬변경 여부, 360판넬=원형, 자재포함 여부=별도). 🚩[결정 필요]는 "승강제한" 호환성 제약을 표현할 스키마 확장 여부(§4-3).

---

### 3.11 `getStructuredQuoteData` — 11081줄 (범위 내 최대 규모 business_rule)

견적서/전표 미리보기·내보내기가 공통으로 참조하는 **품목 라인 조립 함수**. 하위 규칙 6가지:

② 조건→결과
| 하위 규칙 | 조건 | 결과 |
|---|---|---|
| 카드수수료/선금할인 조정 | `#chkCardPay` 체크 또는 `#payDuePre` 체크 | `applyCardFeeLogic`/`applyEstimateTotalAdjustments`(범위 밖 함수) 호출해 "기타" 섹션에 조정행 추가 |
| 총액 절삭(cutoff) | `#selCutUnit` 값(cutUnit) > 0 이고 `총액 % cutUnit > 0` | 마지막 섹션부터 역순으로 **수량=1, `type≠'set-head'`, `source≠SPECIAL_ROW_SOURCE.CATALOG_SPECIAL`** 인 행을 찾아 그 행의 price/sub 에서 나머지(rem) 차감. 못 찾으면 `name:'절삭', qty:1, price:-rem` 인 합성행을 "기타" 섹션에 추가(`source:SPECIAL_ROW_SOURCE.AUTO_CUTOFF`) |
| 세트 분해 예외 | `SEND_AS_SET_IDS.has(s.id)` 이거나 부자재/특수품/SIMPLE모드 | 세트를 부품 분해하지 않고 **단일 라인(item)** 으로 전송 |
| 구성요소 표시순서 | 세트를 부품 분해할 때 | 랭크: 실내기=1, 실외기=2, 벽걸이=3, 판넬(블랙=4.3>승강=4.2>공청=4.1>기타판넬=4.0), 리모컨(스탠드=5.1>벽걸이=5.2>기타=5.3), 자재=6, 그 외=7 — 오름차순 정렬, 동률은 model/name 사전순 |
| 등급 표기 | 세트이고 이름에 `'등급'` 미포함 | `SPEC_DETAIL_MAP[model].single.grade`(또는 `s.grade`/`s.effGrade`) 우선, 없으면 `nameRaw+spec` 에서 정규식 `/([1-5A-Z/]+)\s*등급/` 검색 → `' N등급'` 접미사 |
| 사용자정의품목 병합 | `#{type}CustomBody` 의 `.custom-item-row` 중 수량≠0 | `home/single/comm/old` 4개 카테고리별로 "기타"(catL) 커스텀 라인을 해당 섹션에 병합 |

③ 상수: `SPECIAL_ROW_SOURCE.CATALOG_SPECIAL`, `SPECIAL_ROW_SOURCE.AUTO_CUTOFF`(enum, 정의는 범위 밖), 랭크 가중치 `1,2,3,4.0,4.1,4.2,4.3,5.1,5.2,5.3,6,7`, `identity` 포맷 문자열 `` `auto-cutoff:${cutUnit}:${sections.length}` ``.

④ 읽는 값: `COMMULTI`/`HOMEMULTI`/`SINGLE_SETS`/`OLD_PRODUCTS` 카탈로그(model/name/list·listPrice/unit/source), `SPEC_DETAIL_MAP[model].single.grade`, `commQty`/`homeQty`/`singleQty`/`oldQty` **수량 상태맵(수량은 그대로 읽기만 함 — 추론 없음, 개발책임자 규칙 준수)**, `COMM_PARTS`/`SINGLE_PARTS` 구성부품 카탈로그.

⑤ 스키마 대응:
- 수량: **[표현 가능]** — 기존 수량 상태를 그대로 읽으므로 이식 시 `quantity_sync_rule`/`quantity_sync_target.multiplier` 로 정의된 값을 그대로 조회하면 됨(구성품/이름 추론 금지 원칙과 일치).
- 구성요소 표시순서: **[부분]** — `bundle_component.display_order` 로 표현 가능하나, 위 랭크표 값을 사전 계산해 넣어야 함.
- 등급 표기: **[불가]** — `classification`/`products` 어디에도 "등급" 컬럼이 없음(요청 스키마 목록 기준). 등급 정보 자체는 `SPEC_DETAIL_MAP`(스펙 상세, 범위 밖 조사 대상)에서 옴.
- 절삭/카드수수료/선금할인: **[불가]** — 품목이 아니라 견적/전표 총액 계산 로직(다른 도메인).
- 세트 분해 예외(`SEND_AS_SET_IDS`): **[부분]** — `products.bundle_mode`(SINGLE|BUNDLE) 로 세트 여부 자체는 표현되나, "세트인데 예외적으로 분해하지 않고 보낸다"는 화이트리스트가 `bundle_mode` 하나로 완전히 흡수되는지는 해당 ID들의 실측 확인 필요.

⑥ 기본값: 구성요소 표시순서는 **[자동]** — 위 랭크표를 `bundle_component.display_order` 초기값으로 그대로 이식(실내기=1 … 그 외=7, 소수점 하위 랭크는 정수 간격으로 재매핑 가능). 나머지는 🚩[결정 필요](§4-3, §4-4).

---

### 3.12 `processBOCSVExport` — 12219줄

② 조건→결과
| 조건 | 결과 |
|---|---|
| 라인 품목의 `(originalName+name)` 문자열(공백 제거)이 `['유연호스','발통','일자발','방진가대']` 중 하나를 포함 | 해당 라인을 BO(외부 영업시스템) 업로드 CSV 에서 **제외** |
| 제외되지 않은 라인 | `항번`,`대표모델항번` 컬럼에 동일 순번(10부터 10씩 증가) 기입, `Product Code`=model, `Oppty. 수량`=`수주(예상)수량`=qty, 금액 3열은 공란 |

③ 상수: 제외 키워드 배열 `['유연호스','발통','일자발','방진가대']`, 순번 시작값 **10**·증분 **10**, CSV 헤더 8열 `['항번','대표모델항번','Product Code','Oppty. 수량','수주(예상)수량','견 적 금 액','견적금액(VAT포함)','서비스보증기간']`.

④ 읽는 값: `getStructuredQuoteData()` 파생 라인(`r.model`,`r.qty`,`r.originalName`,`r.name`) — 원본은 결국 COMMULTI/HOMEMULTI/SINGLE_SETS/OLD_PRODUCTS 카탈로그.

⑤ 스키마 대응: **[부분]** — 제외 키워드 4개는 사실상 "액세서리성 소모품" 카테고리를 이름으로 판별하는 것으로 보이며, §3.3 에서 확인된 `'부자재'`/`'실외기 받침'` 등 기존 classification 값과 겹칠 가능성이 큼. 정확히 어떤 classification/product_category 값과 1:1 대응하는지는 미확인.

⑥ 기본값: [자동 가능] — 저장소 실측으로 이 4개 키워드에 매치되는 현재 활성 품목 전체를 열거할 수 있음(다음 조사에서 `SELECT model_code, name, product_category FROM products WHERE name ~* '유연호스|발통|일자발|방진가대'` 형태로 산출 가능). 🚩[결정 필요]는 "그 결과를 product_category 매칭으로 완전히 대체할 수 있는가"(§4-4).

---

## 4. decisions_needed 요약 (구조화 출력과 동일 내용)

1. **분기관 코드 선택 규칙(§3.7)을 담을 그릇** — 누적용량/실외기HP 구간→6개 코드(1509/2512/2812/2815/3419/4119) 매핑을 어느 테이블에 넣을지. 후보: `quantity_sync_rule.condition_json` 재활용 / 신규 `branch_code_rule`(min_capacity, max_capacity, branch_model_code) 테이블. 권장: 신규 테이블(목적이 수량배수가 아니라 코드선택이라 기존 3테이블 의미와 다름).
2. **실외기 용량(HP)을 정식 컬럼화할지(§3.8)** — 현재 `capFromModel`/인라인 정규식으로 model 문자열에서만 파싱 가능, products 테이블에 용량 컬럼 없음. 후보: `capacity_hp` 컬럼 신설 / model 파싱 유지. 권장: 컬럼 신설(모델코드 표기 변경 시 파싱이 깨짐).
3. **싱글세트 옵션 호환성 제약(§3.10) 표현 방법** — "블랙판넬·승강판넬은 4-way/360 세트 전용" 같은 옵션 간 제약을 어디 둘지. 후보: `bundle_component` 확장 컬럼(allowed_when) 신설 / `quantity_sync_rule.condition_json` 활용. 권장: bundle_component 확장(제약이 구성요소 단위이므로).
4. **BO CSV 제외 키워드(§3.12)를 classification 매칭으로 전환 가능한지** — `['유연호스','발통','일자발','방진가대']` 매치 품목들의 현재 product_category/classification 값 실측 필요. 후보: 그대로 하드코딩 유지 / product_category 기반 필터로 전환. 권장: 실측 후 카테고리 필터 전환.
5. **견적 세션 카테고리 기본값(§3.1·3.2·3.4·3.5)을 담을 그릇** — 홈/상업/싱글/구형 4개 카테고리 각각의 할인율(45%)/절삭단위(0)/라운딩모드(ROUND)/리모컨·판넬·자재 기본옵션. 후보: `classification` 테이블에 카테고리 전역 설정 컬럼 추가 / 별도 `estimate_category_defaults` 설정 테이블 신설. 권장: 별도 설정 테이블(품목 단위가 아니라 카테고리 전역 1행 설정이라 classification 의 반복행 구조와 안 맞음).
6. **기본 출고창고 코드(§3.6) `'00003'` 하드코딩 유지 여부** — 주문서(order) 도메인 소관일 가능성 높음, 다른 담당 에이전트와 교차 확인 필요. 후보: 하드코딩 유지 / 거래처별·설정 테이블화. 권장: 주문서 도메인 담당에게 이관 확인 요청.
7. (참고, 낮은 우선순위) **분기계산 "가상 모델코드" 경고 UX(§3.9) 유지 여부** — 스키마 결정이 아니라 UX 이관 정책 결정.

---

## 5. 특기사항 (notable)

- **범위 경계**: 9840줄 `openSelectedSpec()` 은 9901 이전 시작이라 본 담당(ejs-4) 소관이 아님(ejs-3 담당). 13219줄 `packAllOutColumns` 은 13200 초과로 다음 담당(ejs-5) 소관.
- **분기관 코드 6종 이중 확인**: `codeByCumulativeSum`/`codeByOutdoorHP` 의 코드 6개(`1509,2512,2812,2815,3419,4119`)가 `ensureBranchScaffold`(12762줄, ui_only 로 분류)의 UI 뱃지 하드코딩과 완전히 일치 — 완전열거임을 교차 확인.
- **`capFromModel` 은 죽었지만 로직은 살아있음**: 동일 정규식이 `pickSelectedIndoorsExpanded`(12658줄)·`recomputeBranchCodes`(12736줄)에 인라인 중복 — 리팩터링 시 3곳이 하나로 합쳐질 수 있음(참고 정보, 이번 조사에서 수정하지 않음).
- **`getVatLabel`/`syncVatCardPv`/`syncVatFromOrderInfo`/`getQuoteItemBgColor`**: 실제 VAT율·카드수수료율 자체는 이 범위 밖(`code.js getCardFeeRate()`,`getVatDivisor()`)에 있고, 본 범위 함수들은 그 결과를 표시/동기화만 함 — business_rule 로 과다 분류하지 않도록 ui_only 로 유지.
- **`getQuoteItemBgColor`(11526줄)**: 상업멀티 서브카테고리명(`'프라임'`,`'고효율한랭지'`,`'표준형'`,`'상부토출'`,`'eco냉난방'`,`'eco냉방전용'`,`'eco리뉴얼'`,`'가스히트펌프'`,`'프레스티지'`,`'동시냉난방'`,`'공장전원'`) 이 색상코딩 목적으로만 하드코딩되어 있음 — business_rule 로 분류하지 않았으나(순수 표시색), 향후 classification 값과 대조 자료로 참고 가치 있음. 주석처리된 구버전 색상 매핑(11538~11573줄)도 원문 그대로 존재(현재 비활성).
- **fix/코드 수정 없음**: 본 조사는 읽기 전용으로 수행, git 조작·DB write 없음(공유 DB 조회도 이번 조사에서는 사용하지 않음 — 코드 정적분석 + 저장소 전수 grep 만으로 판정 가능했음).
