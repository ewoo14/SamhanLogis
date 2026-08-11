# GAS 전수조사 — ejs-6 (`clients/web/estimate-app/views/index.ejs` 16501~19753)

> 배정: ejs-6. 분모 = `docs/dev-reports/2026-08-10-gas-function-inventory.md` 중 이 범위에 속하는 항목.
> 코드/스키마/마이그레이션 변경 없음. git 조작 없음. 공유 DB 는 읽기 조회만 사용(SELECT 대신 grep/파일 실측으로 충분해 실제 DB 조회는 수행하지 않음 — 스키마는 PM 실측 고정값을 그대로 사용).

## 0. 완결성 집계

- **assigned_count = 63** (분모 파일 587~650행, `16492:function initInventoryModal(){` 는 16501 미만이라 제외, 마지막 항목은 `19720: element.addEventListener(...)`)
- **classified_count = 63** (전수 일치)
- 분류 합계: `business_rule 8` + `ui_only 33` + `infra_util 21` + `dead_code 1` = **63**

| 분류 | 건수 |
|---|---|
| business_rule | 8 |
| ui_only | 33 |
| infra_util | 21 |
| dead_code | 1 |
| **합계** | **63** |

---

## 1. 전수 분류표 (줄번호 · 심볼 · 분류)

| # | 줄 | 심볼(요약) | 분류 | 비고 |
|---|---|---|---|---|
| 1 | 16530 | `const doSearch` (재고조회 쿼리, initInventoryModal 내부) | ui_only | google.script.run 호출 트리거 |
| 2 | 16580 | `const closeModal` (모달 닫기) | ui_only | |
| 3 | 16594 | `const toYMD` (날짜 포맷) | infra_util | 범용 날짜 포맷터 |
| 4 | 16602 | `function enforceDateLimit(changedType,startId,endId)` | ui_only | 이력/저장내역 날짜필터 7일 제한(UI 폼 제약, 품목과 무관) |
| 5 | 16651 | `function applyCardFeeLogic(rows)` | **business_rule** | BR1 |
| 6 | 16684 | `function applyCutoffLogic(rows)` | **business_rule** | BR2 |
| 7 | 16724 | `function takeSnapshot()` | infra_util | 폼 상태 직렬화 |
| 8 | 16916 | `function applySnapshot(shot,custName)` | infra_util | 폼 상태 복원(오케스트레이션) — 단, 내부 17364-17418 구간에 이름기반 규칙 포함(→#16) |
| 9 | 16924 | `const v = (valObj...)` | infra_util | applySnapshot 내부 3항연산 |
| 10 | 16939 | `const res = (m,d)=>{...}` (Map 복원 helper #1) | infra_util | |
| 11 | 16940 | `const resSet = (set,arr)=>{...}` | infra_util | |
| 12 | 17052 | `const res = (m,d)=>{...}` (Map 복원 helper #2) | infra_util | |
| 13 | 17111 | `const isObj = ...` | infra_util | |
| 14 | 17120 | `const matched = CUSTOMERS.find(...)` | infra_util | 스냅샷 복원 시 거래처 재매칭 |
| 15 | 17132 | `const matched = MANAGERS.find(...)` | infra_util | 스냅샷 복원 시 담당자 재매칭 |
| 16 | 17400 | `const s = ((rec.name...)` (comm 제외 정규식) | **business_rule** | BR3 |
| 17 | 17449 | `function hideAllPages()` | **dead_code** | 근거 §3 |
| 18 | 17458 | `function goSnapshotPage()` | ui_only | 페이지 전환 |
| 19 | 17489 | `function loadSnapshotHistory()` | ui_only | 서버조회+날짜필터(표시용) |
| 20 | 17525 | `function loadSnapshotByCustomer()` | ui_only | 서버조회(표시용) |
| 21 | 17550 | `async function handleSaveSnapshot(customTheme)` | **business_rule** | BR4 |
| 22 | 17636 | `const hVal` | ui_only | 저장용 캡처 이미지 헤더 표시 |
| 23 | 17637 | `const hLim` | ui_only | 〃 |
| 24 | 17638 | `const cVal` | ui_only | 〃 |
| 25 | 17639 | `const cLim` | ui_only | 〃 |
| 26 | 17681 | `const bg` (헤더 셀 배경색) | ui_only | 스타일 |
| 27 | 17682 | `const clr` (헤더 셀 글자색) | ui_only | 스타일 |
| 28 | 17683 | `const bRight` (테두리) | ui_only | 스타일 |
| 29 | 17841 | `function showCustNameModal()` | ui_only | 모달 |
| 30 | 17923 | `function closeSnapshotPage()` | ui_only | 페이지 전환 |
| 31 | 17932 | `function renderSnapshotTable(list)` | ui_only | 테이블 렌더 |
| 32 | 17971 | `function showSnapshotPreview(index)` | ui_only | 이미지 모달 |
| 33 | 18030 | `function calcRecommendOdu(cap,array)` | **business_rule** | BR5 |
| 34 | 18046 | `function initKeyboardFix()` | ui_only | 모바일 키보드 대응 |
| 35 | 18129 | `function updateCellSelectionSum()` | ui_only | 엑셀형 셀선택 합계 |
| 36 | 18164 | `function clearSelection()` | ui_only | 〃 |
| 37 | 18172 | `function getTrueMatrix(table)` | ui_only | 〃 |
| 38 | 18203 | `function getCellPos(td)` | ui_only | 〃 |
| 39 | 18223 | `function selectCells(td1,td2)` | ui_only | 〃 |
| 40 | 18253 | `function getCellValue(td)` | ui_only | 〃 |
| 41 | 18263 | `function setCellValue(td,val)` | ui_only | 〃 |
| 42 | 18448 | `const text = (e.clipboardData...)` (붙여넣기) | ui_only | 〃 |
| 43 | 18518 | `function setupCustomRows()` | ui_only | 사용자정의 행 초기화(컬럼 수만 하드코딩) |
| 44 | 18646 | `function ensureCustomBlankRow(type)` | ui_only | 마지막 빈행 유지 UX |
| 45 | 18722 | `const updateSpan` (+ 주변 18719-18921 구성품 수량/단가 동기화) | **business_rule** | BR6 |
| 46 | 18942 | `function adjustRowSpans(tr,diff)` | ui_only | 테이블 rowspan 보정 |
| 47 | 18969 | `function initVisibilityToggles()` | ui_only | 컬럼 표시/숨김 토글 UI |
| 48 | 19121 | `const makeToggle` | ui_only | 토글 chip 생성기 |
| 49 | 19230 | `function syncSetPriceFromParts(setId,isSingle)` | **business_rule** | BR7 |
| 50 | 19299 | `const isCleared` (+ 주변 19296-19378 defQty 복원) | **business_rule** | BR8 |
| 51 | 19381 | `function autoShrinkTableColumns(...)` | ui_only | 폰트 자동축소 |
| 52 | 19418 | `function toggleTheme()` | ui_only | 다크모드 토글(활성 정의, §4 참고) |
| 53 | 19443 | `function getElPath(el)` | infra_util | 실행취소/재실행용 셀렉터 경로 |
| 54 | 19484 | `function isMan(el)` | infra_util | "수동입력" 스타일(파란/굵게) 판별 |
| 55 | 19492 | `function getElVal(el)` | infra_util | 실행취소용 값 추출 |
| 56 | 19500 | `function setElVal(el,val,man)` | infra_util | 실행취소용 값 반영 |
| 57 | 19525 | `function saveState(el,isInit)` | infra_util | 실행취소 스택 push |
| 58 | 19549 | `function applyState(action,isUndo)` | infra_util | 실행취소 반영 |
| 59 | 19663 | `function initAutoLogout()` | infra_util | 세션 5시간 타임아웃(보안정책, 품목무관) |
| 60 | 19668 | `function updateTimerDisplay()` | infra_util | 〃 |
| 61 | 19691 | `function resetTimer()` | infra_util | 〃 |
| 62 | 19707 | `function installCspEventListeners(root)` | infra_util | CSP 인라인이벤트 우회 배선 |
| 63 | 19720 | `element.addEventListener(...,cspEventHandler)` | infra_util | 〃 |

---

## 2. business_rule 상세 (8건)

### BR1 — `applyCardFeeLogic(rows)` · index.ejs:16651-16681

② 조건 → 결과

| 조건 | 결과 |
|---|---|
| `#chkCardPay` 미체크 | `CURRENT_CARD_FEE=0`, no-op |
| 체크됨 + rows 안에 이미 이름 '카드' 이거나 remarks 에 '수수료' 포함된 행 존재 | 중복 방지, no-op |
| 체크됨 + 중복 없음 | `total = Σ(r.sub ?? r.price*r.qty)`; `fee = floor(total * getCardFeeRate())` |
| `qty===1 && type!=='set-head'` 행 존재 | 그 행의 price/sub 에 fee 가산 |
| 위 조건 행 없고 `qty===1` 행만 존재 | 그 행에 가산(폴백) |
| qty===1 행 자체가 없음 | 새 행 push: `{name:'카드수수료', model:'카드수수료', unit:'식', qty:1, price:fee, sub:fee, cat:'기타', cardFee:fee}` |

③ 리터럴: 행 이름/모델 `'카드수수료'`, unit `'식'`, cat `'기타'`, 중복판정 문자열 `'카드'`/`'수수료'`. 수수료율 자체는 이 함수엔 하드코딩 없음 — `getCardFeeRate()`(index.ejs:2472-2473, 범위 밖)가 `estimateConfigNumber('cardFeeRate', 0.03)` 로 시트/Notion 설정값을 읽고 기본값 **3%**.
④ 읽는 것: `#chkCardPay` DOM 체크상태(주문 단위 플래그, 시트 컬럼 아님), `rows`(카트 상태: qty/price/sub/type/remarks). 수수료율 자체는 estimateConfig 시트의 `cardFeeRate` 값(간접, 범위 밖).
⑤ 스키마 대응: **[불가]** — 주어진 스키마(products/classification/bundle_component/quantity_sync_*/product_estimate_exposure)에 "견적/주문 총액 부가 수수료" 개념을 담을 테이블이 없음. 품목 속성이 아니라 주문 단위 합계 조정.
⑥ 기본값: 해당없음(품목 기본값 아님, 총액 조정 규칙). 🚩[결정 필요]: `cardFeeRate`(현재 estimateConfig 시트/Notion 값, 기본 3%) 를 신규 스키마 어디에 둘 것인가 — 견적 설정 테이블이 별도로 필요.

### BR2 — `applyCutoffLogic(rows)` · index.ejs:16684-16721

② 조건 → 결과

| 조건 | 결과 |
|---|---|
| `#selCutUnit` 값 0(사용안함) | no-op |
| `total % unit === 0` | no-op |
| 나머지 `rem>0` + `qty===1 && type!=='set-head' && source!==SPECIAL_ROW_SOURCE.CATALOG_SPECIAL` 행 존재 | 그 행 price/sub 에서 rem 차감 |
| 대상 행 없음 | 새 행 push: `{section:'기타', name:'절삭', model:'절삭', unit:'식', qty:1, price:-rem, sub:-rem, source:SPECIAL_ROW_SOURCE.AUTO_CUTOFF, identity:'auto-cutoff:${unit}:${rows.length}'}` |

③ 리터럴: `'절삭'`, `'기타'`, `'식'`, `SPECIAL_ROW_SOURCE.CATALOG_SPECIAL`(제외 대상 — 사용자 카탈로그 특수행은 절삭 타겟에서 배제), identity 템플릿 `auto-cutoff:${unit}:${rows.length}`.
④ 읽는 것: `#selCutUnit`(절삭 단위 드롭다운, 옵션값은 HTML 템플릿에 하드코딩 — 범위 밖), `rows` 카트 상태.
⑤ **[불가]** — BR1 과 동일 사유, 절삭단위/절삭규칙을 담을 테이블 없음.
⑥ 해당없음(품목 기본값 아님). 🚩[결정 필요]: 절삭단위 옵션 목록과 그 저장위치.

### BR3 — applySnapshot 레거시 호환 ABSOLUTE_LOCK 역산 · index.ejs:17364-17418 (지정줄 17400)

> 트리거 조건: 저장된 스냅샷에 `absoluteLock` 배열 필드가 없는 **구버전 포맷**일 때만 실행(17368 `else if (shot.core)`).

② 조건 → 결과

| 대상 | 조건 | 결과 |
|---|---|---|
| home qty>0 모델 | `homeRowByModel` 의 name 이 `/(판넬\|패널\|panel\|리모컨\|리모콘\|유연호스\|분\s*기\s*관\|분기관\|발통\|일자발)/i` 매치 | ABSOLUTE_LOCK 미등록(자동구성품으로 간주) |
| home qty>0 모델 | 매치 안됨 | ABSOLUTE_LOCK 등록(수동입력으로 간주) |
| comm qty>0 모델 | `isCommPanelRow`/`isCommHoseRow`/`isCommRemoteRow`/`isCommPumpRow` 매치, 또는 name 이 `/방진가대\|받침대\|발통세트\|일자발\|SI-AL/i` 매치 | ABSOLUTE_LOCK 미등록 |
| comm qty>0 모델 | 매치 안됨 | ABSOLUTE_LOCK 등록 |
| single/old 값 존재 | 항상 | ABSOLUTE_LOCK 등록 |

③ 리터럴 키워드: home = `판넬,패널,panel,리모컨,리모콘,유연호스,분기관,발통,일자발` / comm = `방진가대,받침대,발통세트,일자발,SI-AL`(모델접두어).
④ 읽는 것: 저장된 스냅샷의 `homeQty`/`commQty`/`singleQty`/`oldQty` 및 인메모리 카탈로그 캐시(`homeRowByModel`/`COMMULTI`, HOMEMULTI/COMMULTI 시트 파생, 범위 밖)의 `.name`/`.disp`/`.model`.
⑤ **[불가]** — 개발책임자 확정 규칙("이름에서 추론하지 않는다")이 정확히 금지하는 패턴 그 자체. 신규 로직으로 이식 금지 대상.
⑥ 해당없음 — 이식하지 않음. 🚩[결정 필요]: 이 규칙은 오직 "absoluteLock 필드가 없는 구버전 저장 스냅샷을 읽을 때"만 동작. 신규 시스템이 **레거시 저장 스냅샷 JSON 을 그대로 재생(replay)** 해야 한다면 이 휴리스틱(또는 1회성 마이그레이션 스크립트)이 유일한 수동/자동 판별 수단이고, 신규 시스템이 구버전을 읽지 않는다면(완전 컷오버) 폐기 가능.

### BR4 — `handleSaveSnapshot` 내 VAT 분리 계산 · index.ejs:17810-17815 (함수 시작 17550)

② 조건 → 결과

| `optVatDisplay` 라디오 값 | 저장되는 값 |
|---|---|
| `'exc'`(VAT 별도) | `supplyAmount=screenTotal`; `vatAmount=floor(screenTotal*0.1)`; `totalAmount=screenTotal+vatAmount` |
| 그 외(기본 `'inc'`, VAT 포함) | `vatAmount=floor(screenTotal/11)`; `supplyAmount=screenTotal-vatAmount`; `totalAmount=screenTotal` |

③ 리터럴: VAT율 **0.1**(10%), VAT포함 역산 나눗값 **11**, `Math.floor`.
④ 읽는 것: `getStructuredQuoteData()` 합계(카트 상태 파생, 범위 밖), `input[name="optVatDisplay"]:checked`.
⑤ **[부분]** — 저장 대상 테이블(`supplyAmount`/`vatAmount`/`totalAmount` 목적지)이 주어진 스키마 목록엔 없음. 더 중요한 발견: 이 함수의 `0.1`/`11` 은 **하드코딩된 중복**이다. 같은 파일 내 `getVatDivisor()`(index.ejs:2476-2477, `1+estimateConfigNumber('vatRate',0.1)`)가 이미 설정가능한 `vatRate` 를 읽어 같은 계산(line 14294 에서 실사용, 범위 밖)을 수행하는데, 본 함수는 그 함수를 호출하지 않고 값을 다시 박아 넣었다 — `vatRate` 설정이 10% 가 아닌 값으로 바뀌면 저장되는 스냅샷 합계와 화면 표시 합계가 어긋난다.
⑥ 해당없음(품목 기본값 아님, 견적 합계 계산). 🚩[결정 필요]: (a) 이 함수가 `getVatDivisor()`/`estimateConfig.vatRate` 를 쓰도록 정정할 것인지(설정 드리프트 방지) — 신규 스키마 이식 시 VAT율을 config-driven 으로 통일할지 확정 필요. (b) 스냅샷 저장 합계 3필드의 신규 스키마 목적지.

### BR5 — `calcRecommendOdu(cap, array)` · index.ejs:18030-18043

② 조건 → 결과 (array 는 오름차순 정렬된 `{cap, hp}` 목록 가정)

| 조건 | 결과 |
|---|---|
| `cap >= array[i].cap` (i=0부터 순차) | `res = array[i].hp` 로 갱신하며 계속 진행 |
| 처음으로 `cap < array[i].cap` 인 지점 | 즉시 루프 종료, 마지막 `res` 유지 |
| `cap < array[0].cap` | `res=0`(추천값 없음) |

즉, "합산 용량 이하의 문턱값 중 가장 높은 단계의 HP" 를 찾는 계단식 룩업.
③ 함수 자체엔 리터럴 상수 없음(문턱값은 전부 인자 `array` 로 주입). 실제 호출부(범위 밖): index.ejs:4922 `calcRecommendOdu(inCap, arr)`(홈멀티), :5005 `calcRecommendOdu(inCap, RECOMMEND_DATA.comm)`(상업멀티). 데이터 출처는 `getRecommendOduData()`(code.js:1303-1319, 범위 밖) — "추천실외기" 시트 3~마지막행, 5개 컬럼(comm cap/hp, home cap, homeEx cap, 공용 hp).
④ (간접) "추천실외기" 시트: comm(cap,hp) / home(cap,hp) / homeEx(cap,hp) 3계열 문턱값-HP 쌍.
⑤ **[불가]** — 주어진 스키마 어디에도 "용량 구간→추천 HP" 룩업 테이블이 없음. 품목 속성이 아니라 별도 참고 데이터셋.
⑥ 해당없음 — 견적품목에 값을 앉히지 않는다. 실내기 합산용량/실외기 비율 표시 옆에 "추천 실외기 XX HP" 라벨만 보조 출력(호출부 4922/5005, 범위 밖). 🚩[결정 필요]: 이 보조 추천 기능을 신규 시스템에 유지할지, 유지한다면 "추천실외기" 시트를 그대로 반영하는 룩업 테이블(가칭 `recommend_odu_tier`: series/cap/hp)을 스키마에 추가할지.

### BR6 — 세트-구성품 수량 자동전개/역산 · index.ejs:18719-18921 (지정줄 18722 `updateSpan`)

> `document.addEventListener('input', ...)` 익명 리스너 내부. 인벤토리 추출이 이름 없는 리스너를 통째로 잡지 못해, 내부의 `const updateSpan` 한 줄만 개별 항목으로 잡혔음 — 리스너 전체(18719-18921)를 문맥으로 함께 조사함.

② 조건 → 결과

| 트리거 | 조건 | 결과 |
|---|---|---|
| 세트 헤더(comm/single) qty-input 변경 | 구성품 qty 가 수동오버라이드 아님(`!singleCustomPartQtys/commCustomPartQtys.has(setModel\|partModel)`) | 구성품 수량 = `Math.floor(setQty * defQ)`, `defQ = qtyInp.dataset.def`(구성품별 세트당 기본 배수, 없으면 `1`) |
| 세트 헤더 qty-input 변경(싱글세트만) | 구성품 모델이 현재 옵션조합의 활성부품(`explodeSetParts` 결과)에 없음 | 해당 구성품 수량 = 0 강제 |
| 구성품 행 자체의 qty/price 직접 수정 | — | `sumSub=Σ(구성품qty×price)`; 세트헤더 자신의 표시수량은 **수동고정(파란/굵게) 상태가 아니면** `maxQty`(양수 중 최댓값, 없으면 음수 중 최솟값)를 자동 추종 |
| 위 재계산 후 | `effQty`(세트헤더 유효수량) ≠ 0 | 세트 단가 = `Math.round(sumSub/effQty)`, `singleCustomPrices`/`commCustomPrices` 오버라이드맵에 저장 |
| 구성품이 직접 수정된 경우 | `partModel` 존재 | 인메모리 `SINGLE_PARTS`/`COMM_PARTS` 캐시행의 `.qty`/`.defaultQty` 를 `partQtyVal/effectiveMainQty` 로 **세션 중 재기록**(DB 아님, 화면상태) |

③ 리터럴 상수 없음(공식만). `defQ` 폴백 리터럴 `'1'`.
④ 읽는 것: DOM `data-def` 속성(원천 = `SINGLE_PARTS`/`COMM_PARTS` 의 `.qty`/`.defaultQty`, "싱글세트부품"/"상업멀티세트부품" 시트 컬럼, `getSingleParts()`/`getCommercialParts()` — code.js, 범위 밖), 세션 오버라이드 Map `singleCustomPartQtys`/`commCustomPartQtys`.
⑤ 정방향(세트수량→구성품수량 전개) **[표현 가능]**: 정확히 `bundle_component.default_qty` × `qty_mode` 의미와 일치 — `구성품수량 = default_qty × 세트수량`(수동오버라이드 없을 때). 역방향(구성품 수정→세트수량/단가 역산) **[불가]**: "실시간 평균단가 역산" 개념은 스키마에 없음 — 이는 카탈로그 속성이 아니라 견적 편집 중 UI 편의 계산기.
⑥ [자동] 구성품 기본수량 = 매칭되는 `(bundle_product_id, component_product_code)` 의 `bundle_component.default_qty`, `qty_mode` 에 따라 `구성품수량 = default_qty × 세트라인수량`(오버라이드 없을 때). 🚩[결정 필요]: "구성품을 직접 고쳐서 세트수량/세트단가가 역산되는" UX 를 신규 시스템에도 재현할 것인가 — 개발책임자 확정규칙("40HP는 2개로 설정했으면 그대로 나올 뿐임")은 정방향 단일 소스를 시사하므로, 이 역산 UX 는 이식 대상에서 제외하는 편을 권고.

### BR7 — `syncSetPriceFromParts(setId, isSingle)` · index.ejs:19230-19293

② 조건 → 결과

| 조건 | 결과 |
|---|---|
| `tr[data-part-of="setId"]` 행 없음 | no-op |
| 세트 자신의 qty-input 값 `setQty===0` | 가격/소계 갱신 안함(0나눗셈 방지) |
| `setQty≠0` | `totalSum=Σ(구성품단가×구성품수량)`; `newUnit=Math.floor(totalSum/setQty)`; 세트행 price-input=`newUnit`(오버라이드맵 저장), 세트행 소계 셀=`totalSum`(그대로 — `newUnit×setQty` 반올림오차와 다를 수 있음) |

③ 공식만(`Math.floor(totalSum/setQty)`), 리터럴 상수 없음.
④ 읽는 것: 라이브 DOM 구성품 행의 `.price-input`/`.part-qty-single`/`.part-qty-comm`(원천은 `SINGLE_PARTS`/`COMM_PARTS`, 범위 밖 — 이 함수는 시트를 직접 읽지 않음).
⑤ **[불가]** — "구성품 합산 기반 평균단가 역산"은 저장 스키마 개념이 아님. 정방향으로는 세트(번들) 자체의 `products.release_price`/`delivery_price` 가 이미 권위값이므로, 이 함수는 사용자가 구성품 단가/수량을 손으로 바꾸는 동안 화면 표시 일관성만 맞추는 보조 계산기.
⑥ 해당없음(카탈로그 기본값 없음) — BR6/BR8 에서 트리거되는 보조 함수(호출부 19332/19372, 같은 범위 내).

### BR8 — 구성품 수동오버라이드 해제 시 기본값 복귀 · index.ejs:19296-19378 (지정줄 19299 `isCleared`)

> `document.addEventListener('change', ...)` 리스너, `.part-qty-single`/`.part-qty-comm` 대상. BR6 과 동일 메커니즘의 "clear" 분기를 명시적으로 다룸.

② 조건 → 결과

| 사용자 동작 | 결과 |
|---|---|
| 구성품 qty-input 값 지움(빈칸) | `singleCustomPartQtys`/`commCustomPartQtys` 에서 오버라이드 제거; 값이 `effQ = 현재세트수량 × defQ(dataset.def, 기본1)` 로 **자동 복귀** |
| 구성품 qty-input 에 값 입력 | `singleCustomPartQtys/commCustomPartQtys.set(`${setId}\|${partId}`, val)` — 수동오버라이드 기록(세션 한정) |
| 둘 다 | `syncSetPriceFromParts(setId,isSingle)`(BR7) 재호출로 세트 단가/소계 재동기화 |

③ `defQ` 폴백 `'1'`, 키 포맷 `${setId}|${partId}` — BR6 과 동일.
④ BR6 과 동일 원천(`data-def` ⇐ `SINGLE_PARTS`/`COMM_PARTS`, 범위 밖).
⑤ "지우면 기본값 복귀" 경로는 **[표현 가능]** — `bundle_component.default_qty` 가 정확히 이 "리셋 목표값" 역할을 한다(개발책임자 규칙과 정확히 부합: 오버라이드가 없으면 오직 설정값이 정한다). 오버라이드 맵 자체(`singleCustomPartQtys`/`commCustomPartQtys`)는 **[불가]** — 카탈로그 데이터가 아니라 "그 견적 그 라인" 한정 편차값이며, 스키마에 있어야 할 자리는 카탈로그가 아니라 견적/주문 라인아이템 저장 테이블(본 스키마 목록엔 미포함, 범위 밖 대상).
⑥ [자동] 새/리셋된 구성품 라인의 기본수량 = `bundle_component.default_qty`(BR6 과 동일 근거) — 개발책임자 규칙의 가장 직접적인 코드 증거: "지우는 순간 이름/HP 파싱이 아니라 설정값(default_qty)으로 되돌아간다".

---

## 3. dead_code (1건) — 근거 필수

### `hideAllPages()` · index.ejs:17449-17455

```js
function hideAllPages() {
  const ids = ['divOrderInfo', 'divHome', 'divSingle', 'divComm', 'divOld', 'divPreviewSimple', 'divPreview', 'divFinal', 'divHistory', 'divSnapshotPage'];
  ids.forEach(id => {
    const el = document.getElementById(id);
    if(el) el.style.display = 'none';
  });
}
```

**호출부 전수 검색(수행한 명령과 결과)**

```
grep -rn "hideAllPages" clients/web/estimate-app
→ clients\web\estimate-app\views\index.ejs:17449:function hideAllPages() {
   (자기 정의 1건 외 없음 — onclick, 문자열참조, 동적호출 전혀 없음)

grep -rn "hideAllPages" .   (레포 전체)
→ tools\legacy-gas\종합견적서\index.html:16956:function hideAllPages() {   (레거시 원본에도 정의만 있고 미사용 동일)
   clients\web\estimate-app\views\index.ejs:17449:function hideAllPages() {
   docs\dev-reports\2026-08-10-gas-function-inventory.md:606:...  (인벤토리 자체 목록)
```

레거시 GAS 원본(`tools/legacy-gas/종합견적서/index.html`)에도 동일한 위치에 동일 함수가 존재하며, 그 원본에서도 다른 곳에서 호출되지 않는다(단일 매치). 즉 이식 이전부터 죽어 있던 코드다. 실제 페이지 전환은 `goHome()`/`goSingle()`/`goComm()`/`goOld()`/`goPreview()`/`goFinal()`/`goSnapshotPage()`(각자 자신의 div 만 개별 토글) 가 담당하며, 이 범용 "전체 숨김" 헬퍼는 대체된 뒤 제거되지 않은 것으로 보인다. **업무 규칙 없음 — 이식 불필요.**

---

## 4. notable (경계 간 교차 발견 — 인접 범위 인지용, 내 범위 판정에는 영향 없음)

- **`enforceDateLimit` 이름 중복**: index.ejs:13829 `function enforceDateLimit(changedId)`(1-인자, 범위 밖 — 다른 에이전트 담당) vs 본 범위 16602 `function enforceDateLimit(changedType,startId,endId)`(3-인자). 최상위 `function` 선언은 나중 것이 `window.enforceDateLimit` 을 덮어쓰므로, 실행 시점엔 **16602 버전만 유효**하다. `grep enforceDateLimit\(['"]?\w*['"]?\)` 결과 13829 버전을 1-인자로 호출하는 곳은 전체 파일에 전무 — 13829 쪽은 사실상 죽어있을 가능성이 높다(그 줄번호는 내 배정범위 밖이라 확정 판정은 해당 에이전트 몫).
- **`toggleTheme` 이름 중복**: index.ejs:1318 `window.toggleTheme = function(){...}`(data-theme 속성 + localStorage 캐스케이드, 범위 밖) vs 본 범위 19418 `function toggleTheme(){...}`(body.dark-mode 클래스 토글). 스크립트 실행 순서상 **19418(본 범위) 버전이 최종 승자**이며 1318 의 구현은 로드 완료 후 사실상 무효화된다. 두 구현이 서로 다른 다크모드 메커니즘(속성 vs 클래스)을 쓰고 있어 병합/정리가 필요해 보이나, 1318 쪽 판단은 해당 줄 담당 에이전트 몫.
- **VAT 계산 이중화**: BR4(17811-17815, 하드코딩 `0.1`/`11`) vs `getVatDivisor()`(2476-2477, `vatRate` config-driven, 범위 밖) — 같은 계산을 두 곳에서 서로 다른 방식(하드코딩 vs 설정읽기)으로 수행. §2 BR4 결정필요 항목 참고.
- **익명 리스너가 인벤토리에서 누락**: 18719-18921, 19296-19378 두 구간은 이 범위에서 가장 core 한 "번들 구성품 기본수량" 업무 규칙(BR6/BR8, `bundle_component.default_qty` 와 직결)을 담고 있으나, `document.addEventListener('input'/'change', e=>{...})` 익명 콜백이라 인벤토리 추출(함수 선언 패턴 매칭)에 이름으로 잡히지 않고 내부의 사소한 하위 상수(`updateSpan`, `isCleared`)만 개별 항목으로 걸렸다. 본 보고서에서는 해당 항목의 클래스를 business_rule 로 승격하고 전체 문맥을 함께 기술해 누락을 방지했다. **다른 범위에서도 동일 패턴(익명 addEventListener 내부에 핵심 규칙)이 있을 수 있음 — 분모 파일이 "function" 선언만 포착했다면 유사 누락 가능성 있음(PM 참고용).**

---

## 5. 이 범위에서 확정한 "(본체, 부자재, 수량)" 표 — 개발책임자 규칙 반영

이 범위(ejs-6) 안에서 실제로 수량을 계산하는 로직은 **이름/HP 파싱이 아니라 전부 `data-def`(구성품별 세트당 기본배수) 값을 그대로 곱하는 구조**였다(BR6/BR8). `data-def` 값 자체(구체적 "(세트 model_code, 구성품 model_code, 수량)" 리스트)는 `SINGLE_PARTS`/`COMM_PARTS`(code.js `getSingleParts()`/`getCommercialParts()`, db-catalog.js `components()`) 가 시트에서 읽어 렌더링 시점에 DOM 에 주입하는 값이며, 그 원천 데이터 자체는 **범위 밖**(code.js/db-catalog.js 담당 에이전트 영역)이라 본 보고서는 구체적 수치 나열을 하지 않는다. 확인된 것은 **메커니즘**(= `bundle_component.default_qty × qty_mode`) 이 우리 스키마와 정확히 대응한다는 점, 그리고 "지우면 기본값 복귀"(BR8) 가 그 메커니즘을 직접 뒷받침한다는 점이다.

---

## 6. decisions_needed 요약 (본문 🚩 항목 재수록)

1. **estimate 단위 부가 조정값(카드수수료율/절삭단위/VAT율) 저장 위치** — BR1/BR2/BR4. 현재 GAS 는 estimateConfig 시트(Notion 연동)에서 `cardFeeRate`(기본 0.03), `vatRate`(기본 0.1) 를 읽고, 절삭단위는 HTML `<select>` 하드코딩 옵션이다. 주어진 스키마(products/classification/bundle_component/quantity_sync_*/product_estimate_exposure) 어디에도 대응 테이블이 없다.
2. **VAT 계산 이중구현 정정 여부** — BR4. `handleSaveSnapshot` 이 `getVatDivisor()`/`vatRate` 설정을 무시하고 `0.1`/`11` 을 직접 하드코딩. 신규 이식 시 단일 소스로 통일할지 확정 필요(그대로 이식하면 설정변경 시 드리프트가 그대로 재현됨).
3. **"추천실외기" 용량 문턱값 테이블 신설 여부** — BR5. `calcRecommendOdu` 는 품목 기본값을 정하지 않는 순수 보조 표시 기능이지만, 이식하려면 "추천실외기" 시트(3계열 cap→hp) 대응 테이블이 스키마에 새로 필요하다. 기능 자체를 폐기할지도 함께 결정.
4. **레거시 스냅샷(ABSOLUTE_LOCK 백필) 재생 필요 여부** — BR3. 구버전 저장 스냅샷 JSON(수동/자동 플래그 없음)을 신규 시스템에서 그대로 복원해야 한다면 이름기반 휴리스틱(또는 1회성 마이그레이션)이 불가피하고, 완전 컷오버라면 폐기 가능.
5. **구성품 역산 UX(BR6) 재현 여부** — 구성품을 직접 수정하면 세트수량/세트단가가 거꾸로 재계산되는 현재 UX 를, 개발책임자의 "설정값이 정한다" 원칙(정방향 단일소스)에 맞춰 신규 시스템에서 제외할지 확정 필요. 제외를 권고.
