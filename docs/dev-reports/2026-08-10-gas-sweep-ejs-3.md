# GAS 전수조사 — ejs-3 (`clients/web/estimate-app/views/index.ejs` 6601~9900)

> 배정: ejs-3 · 분모원본: `docs/dev-reports/2026-08-10-gas-function-inventory.md`
> 코드/스키마/마이그레이션 변경 없음. git 조작 없음. DB는 읽기 조회만(samhan-postgres/product_db).

## 0. 완결성 집계

- **assigned_count = 114** — `docs/dev-reports/2026-08-10-gas-function-inventory.md` 에서
  `clients/web/estimate-app/views/index.ejs` 구간 중 줄번호 6601~9900 사이 항목을 전수 추출:
  ```
  awk -F: '{ if ($1 ~ /^[0-9]+$/) { n=$1+0; if (n>=6601 && n<=9900) print $0 } }' \
    docs/dev-reports/2026-08-10-gas-function-inventory.md | wc -l
  → 114
  ```
- **classified_count = 114** (아래 §2 전수 분류표 참조 — 114행 전부 4분류 중 하나로 채움)
- **분류 합계**: business_rule **58** · ui_only **30** · infra_util **11** · dead_code **15**
  (58+30+11+15 = 114 = assigned_count, classified_count 일치)

### dead_code 15건 요약 (근거는 §4에 grep 명령/결과 전문)

| # | 줄 | 함수 | 근거 요지 |
|---|---|---|---|
|1| 7161 | `displayNameForRow` | 파일/레포 전체 호출부 0건 (선행 리포트도 동일 판정, 교차확인) |
|2| 7216 | `isCommSetRow` | 이 파일 내 호출부 0건 (자매 파일 order-app 에서만 살아있음) |
|3| 7677 | `updateTopControls`(1차 정의) | 14752 에 동명함수 재선언 — 같은 `<script>` 블록 내 호이스팅으로 후자가 항상 승리, 1차 정의는 영구 도달불가 |
|4| 7712 | `onHomeQtyInput` | 전체 앱 디렉터리 호출부 0건 |
|5| 7761 | `onSingleQtyInput` | 전체 앱 디렉터리 호출부 0건 |
|6| 8073 | `findHomePanelModel` | 전체 앱 디렉터리 호출부 0건 (`pickPanelBy`로 대체됨) |
|7| 8088 | `pickInfinitePanelModel` | 전체 앱 디렉터리 호출부 0건 (`recomputeHomePanels` 내 인라인 중복 로직으로 대체됨) |
|8| 8103 | `inferInfiniteSize` | 전체 앱 디렉터리 호출부 0건 |
|9| 8607 | `has_` | 전체 앱 디렉터리 호출부 0건 |
|10| 8952 | `getSetUnitNowById` | 이 파일 내 호출부 0건 (자매 파일 order-app 에서만 살아있음) |
|11| 9040 | `ensureKakaoPostcode` | 이 파일 내 호출부 0건 (자매 파일 order-app 에서만 살아있음) |
|12| 9049 | `mountAddrSheet` | 이 파일 내 호출부 0건 (실제 주소검색은 정적 `#addrDock`/`#addrSheet` 사용) |

(나머지 3건은 위 dead 함수 본문에 속한 중첩 상수/화살표함수 — §2 표에 개별 표기)

---

## 1. 업무규칙(business_rule) 상세 — 14개 클러스터, 58줄

### A. 상업멀티 카테고리 분류 (대/중/소분류 파생)
**함수·줄**: `onCommOptionChange` 6607 · `renderCommOptions` 6623 · `getCommFilterRows_` 6678
· `renderComm` 6734 및 내부 6783(`isEcoOutdoor`)·6823(`currentPrice`)·6906(`sText`)·7037·7055

| 입력 조건 | 결과 |
|---|---|
| 품명+표시명에 `GHP/프레스티지/동시냉난방/공장전원` 매치 & KIT_WHITELIST 12종 미포함 & `#comm_ext_out` 미체크 | 목록에서 제외 |
| 위 조건 매치 & 체크됨 | `catL='실외기'`, `catM`∈{가스히트펌프,프레스티지,동시냉난방,공장전원} (이름별 배타 매칭) |
| `판넬｜패널｜panel｜데코커버` 포함 | `catL='판넬'`, `catM`∈{1-Way,2-Way,4-Way,360} (규격 텍스트의 WAY/CST 표기로 판별) |
| `분배헤더` / `분기관` / `드레인펌프` / `리모컨` / `유연호스` / `S2방진가대*·실외기일자발·원형발통세트·GHP방진가대` / KIT_WHITELIST 포함 | `catL='부자재'`, `catM`= 해당 키워드 |
| `catL==='실외기'` 이고 `catM` 에 `ECO` 포함 (대소문자무관) | `isEcoOutdoor=true` → 소분류(S) 유지, 그 외엔 소분류 공백 처리 |
| 수량 셀 색상 판정: 판넬/호스/리모컨/펌프는 각 MANUAL Set 소속 여부, 그 외는 이름에 `방진가대\|받침대\|발통세트\|일자발\|si-al` 매치 시 `COMM_MANUAL_BASE` 소속 여부, 나머지는 `q>0` | 파란색굵게(수동) / 회색(자동) |
| `commCustomPrices` 에 모델이 있으면 그 값, 없으면 `commUnitPrice(model)` | 화면표시 단가(현재가) |

**하드코딩 값**: `KIT_WHITELIST`(12종 완전일치 이름), 판넬 WAY 정규식(`1\s*-?\s*Way|2\s*Way|4\s*-?\s*Way|360\s*CST`), 부자재 키워드셋(분배헤더/분기관/드레인펌프/리모컨/유연호스/S2방진가대*), `방진가대|받침대|발통세트|일자발|si-al` 정규식.

**읽는 속성**: `name`, `disp`, `catL/catM/catS`(원본), `unit`, `model`.

**스키마 대응**: [표현 가능] `classification.name/level/estimate_category`, `products.cat_l_id/cat_m_id/cat_s_id`, `products.product_category`. 다만 레거시는 **정적 컬럼이 아니라 이름 정규식으로 매 렌더시 재계산**한다.

**기본값**: 🚩[결정 필요 아님, 확정 가능] — 3,084개 활성 품목 각각에 대해 위 정규식을 1회 실행해 `cat_l_id/cat_m_id/cat_s_id` 를 고정 배정하는 **1회성 마이그레이션 스크립트**로 이식 권장(매 렌더 재계산 불필요). 정규식 자체는 위 표가 전부이므로 자동화 가능.

---

### B. 상업멀티 세트 BOM 전개(구성품 수량)
**함수·줄**: `buildCommSetIndex` 7178(+7181,7190,7193) · `explodeCommPreviewParts` 7203(+7210)
· `isCommSetRow` 7216(**dead**, §4) · `explodeCommSets_` 7221(+7240) · `renderCommSetParts` 7268(+7293)

| 입력 조건 | 결과 |
|---|---|
| `COMM_PARTS` 에서 `refModel===setModel` 인 행들이 세트 구성품 | 구성품 목록 |
| 구성품의 `qty` 필드가 문자열 `"Q"` | 구성품 수량 = **세트수량 그대로**(승수 아님, 1:1 연동) |
| 그 외 `qty` 값 | 구성품 수량 = 세트수량 × `parseInt(qty)`(파싱 실패시 1) |
| `commCustomPartQtys` 에 `"세트모델｜구성품모델"` 키로 수동값이 있으면 그 값 | 수동 오버라이드 우선 |
| 구성품 `spec` 없으면 세트 헤더(`COMM_PARTS.find(p=>p.model===setModel)`)의 `spec` 상속 | 규격 표시 |

**하드코딩 값**: 없음(전부 데이터 기반). 단 `qty==='Q'` 리터럴은 "세트수량과 1:1"을 뜻하는 **매직 문자열**.

**읽는 속성**: `COMM_PARTS[].refModel/model/name/partName/qty/unit/price/spec/kind`.

**스키마 대응**: [표현 가능] `bundle_component.bundle_product_id/component_product_code/default_qty/qty_mode`. `qty==='Q'` → `qty_mode`(예: `'PER_SET'` 등 1:1 모드)로, 숫자 `qty` → `qty_mode='FIXED', default_qty=N` 로 이식.

**기본값**: [자동] — `bundle_component` 1,598행이 이미 이 규칙으로 적재돼 있다고 실측되어 있으므로(PM 실측 수치) 별도 결정 불필요. 단 `qty==='Q'` 매직값이 어느 `qty_mode` 로 이관됐는지만 확인 요망(재조사 범위 밖).

---

### C. 표시명 생성(실외기 HP 표기 규칙)
**함수·줄**: `buildDisplayNameComm` 7123 · `displayNameForRow` 7161(**dead**, §4)

| 입력 조건 | 결과 |
|---|---|
| `catL==='부자재'` | 원본 `name`(공백정리만) 그대로 표시 |
| 그 외 | `disp+name` 에서 `DVM_S2, EHP, GHP, 프라임, 프레스티지, 고효율, 한랭지` 토큰 제거 후 |
| 제거 후 문자열에 `숫자+HP(괄호옵션)` 패턴이 있으면 | **마지막 매치된 HP 표기만** 표시명으로 사용(예: "10HP(콤보)") |
| HP 패턴이 없으면 | `stripCommKeywords(cleanDisplayName(...))`(범위 밖 함수)로 위임 |

**하드코딩 값**: 제거 토큰 7종(`DVM_S2/EHP/GHP/프라임/프레스티지/고효율/한랭지`), HP 정규식 `(\d+(?:\.\d+)?\s*HP(?:\([^)]*\))?)`.

**읽는 속성**: `name`, `disp`.

**스키마 대응**: [부분] — 표시명은 `products.name`/`display_order` 로 저장 가능하나, 이 함수는 **저장값이 아니라 렌더 시점 가공**이다. 정적 이관 시 3,084개 품목의 `name` 자체를 이 규칙으로 1회 정규화할지, 혹은 화면 레이어에 표시가공 로직을 유지할지는 UI/데이터 경계 문제.

**기본값**: 🚩[결정 필요] — "실외기 표시명 = 원본 그대로 저장" vs "HP 스캔 후 정규화된 이름을 `products.name` 에 저장". 후자를 택하면 3,084건 재정규화 스크립트가 필요.

---

### D. 구형(단종)품목 할인율
**함수·줄**: `renderOldOptions` 7380 · `renderOld` 7423(+7472 ui_only) · `sumOld` 7563 · (`syncOldTotals` 7587 은 ui_only로 분류, 집계만)

| 입력 조건 | 결과 |
|---|---|
| `#old_rate` 입력값(기본 `getOldDiscountPercent()`, 범위 밖 상수) | `discountRate = rate/100` |
| `item.isDisc===true` | `autoPrice = round(listPrice × (1-discountRate))` → `roundByConfig(autoPrice,'old')`(범위 밖) 로 재라운딩 |
| `item.isDisc!==true` | `autoPrice = round(item.sheetPrice)`(시트고정가) |
| `oldCustomPrices` 에 수동값 있으면 | 그 값 우선 |

**하드코딩 값**: ⚠️ `sumOld()` 내부에는 **`finalP = Math.round(listP * 0.5)`** 로 **50% 고정**되어 있다 — `renderOld()`/`renderOldOptions()` 가 쓰는 **동적 `discountRate`(사용자가 `#old_rate` 로 바꿀 수 있음)와 다른 상수**다. 두 계산 경로가 서로 다른 할인율을 쓰는 **레거시 자체 불일치**로 판단됨(§5 결정 필요 D4).

**읽는 속성**: `OLD_PRODUCTS[].price/sheetPrice/isDisc/model/name`.

**스키마 대응**: [표현 가능] `products.fixed_discount_rate`(품목별 고정율) 또는 전역 설정값. `isDisc` 플래그는 `products` 에 상당 컬럼 없음 — [부분].

**기본값**: 🚩[결정 필요 D4] — 총합계산(`sumOld`)이 정말 50% 고정이어야 하는지, 아니면 행별 표시와 같은 동적 `old_rate` 를 써야 하는지. 권장: 행별 표시(동적 rate)를 정본으로 채택(사용자가 보는 값과 합계가 일치해야 하므로).

---

### E. 홈멀티/싱글중대형 옵션 기본값(할인율·리모컨·판넬·자재)
**함수·줄**: `renderHomeOptions` 7788 · `renderSingleOptions` 7831

| 옵션 컨트롤 | 기본값 | 리터럴 출처 |
|---|---|---|
| `home_rate`(홈멀티 할인율) | `DISCOUNT_RATE_HOME×100` 없으면 **45** | 하드코딩 45 |
| `home_remote` | `HOME_DEFAULTS['리모컨']`, `'선택 안함'`이면 `'기본'`으로 강제 | — |
| `home_panel` | `HOME_DEFAULTS['판넬변경']` 없으면 `''` | — |
| `home_hose_i`(유연호스 I형) | **false 고정**(HOME_DEFAULTS 미반영) | 하드코딩 false |
| `home_no_hose`/`home_no_branch`/`home_foot` | `HOME_DEFAULTS[...]` 각 항목 | — |
| `comm_rate` | `DISCOUNT_RATE_COMM×100` 없으면 **45** | 하드코딩 45 |
| `comm_panel` 기본 | **'기본판넬'** | 하드코딩 |
| `comm_p360` 기본 | **'원형'** | 하드코딩 |
| `comm_remote` 기본 | **'무선'** | 하드코딩 |
| `ss_disc_360/4way/1way/stand/deluxe/grade1`(정액할인) | `window.DISCOUNT_*_AMT` 없으면 **0** | 하드코딩 0 |
| `ss_remote/ss_remote_ex/ss_base/ss_panel/ss_p360/ss_mat` | `SINGLE_DEFAULTS[...]`, `ss_p360` 없으면 `'원형'`, `ss_mat` 없으면 `'별도'` | — |

**읽는 속성**: `HOME_DEFAULTS`, `SINGLE_DEFAULTS`(둘 다 `db-catalog.js:getHomeDefaults/getSingleDefaults` 를 통해 시트 "기본값" 탭에서 옴, 범위 밖) · `window.DISCOUNT_RATE_HOME/COMM`, `window.DISCOUNT_360_AMT` 등(범위 밖 `estimateConfig`).

**스키마 대응**: [부분] — `home_rate`/`comm_rate` 45%는 우리 스키마의 전역 할인율 설정에 대응 없음(품목별 `fixed_discount_rate`/`has_variable_discount`는 있으나 "섹션 전역 기본 할인율" 개념이 없음). `HOME_DEFAULTS`/`SINGLE_DEFAULTS` 자체가 이미 시트 탭이므로 [표현 가능]하나 우리 schema엔 대응 테이블명이 안 보임(제공된 스키마 목록에 없음).

**기본값**: 🚩[결정 필요] — 전역 할인율 45%, 정액할인 0원 초기값들을 "품목 기본값"이 아니라 "**추정 앱 세션 초기 옵션값**"으로 어디에 둘지(추정앱 설정 테이블이 스키마에 없음). 이 항목은 견적품목 자체의 기본값이 아니라 "새 견적서를 열 때 옵션바 초기 세팅"이므로 개발책임자 확인 요망.

---

### F. 파생수량 트리거 판별(어떤 품목 변경이 재계산을 유발하는가)
**함수·줄**: `isHomeCalcTriggerModel` 8037 · `isSingleCalcTriggerId` 8048
· `recomputeFootAll` 7958 · `recomputeSingleBaseFoot` 7971 · `recomputeSingleExtras` 8012

| 입력 조건 | 결과 |
|---|---|
| 이름에 `분기관\|일자발·발통\|유연호스\|판넬` 포함 | 트리거 아님(파생품목 자신이므로) |
| 이름에 `실내기\|벽걸이` 또는 `단배관\|다배관` 또는 `전열교환기\|에어콤보` 포함 | **트리거**(수량 바뀌면 `recomputeHomeDerived` 전체 재계산) |
| 싱글세트: `SEND_AS_SET_IDS` 소속, 또는 유선보드/실링펌프 파생 id 자신, 또는 `classifySingleSetFixed(s).catL==='부자재'` | 트리거 아님 |
| 그 외 싱글세트 | 트리거 |
| `#home_foot`(발통포함) 체크 시 | 원형발통 수량 = "이름에 실외기 포함" 품목들의 수량 합, 아니면 0 |
| `#ss_base`(받침대포함) 체크 시 | SET/식 단위 & `부자재/실외기 받침/자재` 카테고리 제외 세트들의 수량 합 → 모델이 `AP230DAPDHH1S`/`AP290DAPDHH1S` 면 "flat"(사각발통), 아니면 "round"(원형발통) 로 분리 집계 |
| `#ss_remote` 가 유선/컬러유선 & 리모컨 미제외 | 1-way 세트(`is1WaySet_`) & `allowRemoteChange_` 인 세트들의 수량 합 → 유선보드(SS_WIRED_BOARD_ID) 수량 |
| 이름에 `실링` 포함 세트들의 수량 합(자기 자신 제외) | 실링펌프(SS_CEILING_PUMP_ID) 수량 |

**하드코딩 값**: `AP230DAPDHH1S`, `AP290DAPDHH1S`(사각발통 대상 모델), `운임\|절삭\|비용\|설치비`/`운임\|절삭` 제외 정규식.

**읽는 속성**: `name`, `catL`, `unit`, `model`(싱글세트).

**스키마 대응**: [부분] — "어떤 품목이 트리거인가"는 `quantity_sync_rule.condition_json`(트리거 조건)에 대응 가능. "발통/보드/펌프 집계식"은 **덧셈 집계**(단순 SUM)라 `quantity_sync_source(factor=1)/target(multiplier=1, aggregation=SUM)` 로 표현 가능.

**기본값**: [자동] — SUM 집계 구조 자체는 스키마가 이미 지원. 다만 "무엇이 소스인가"(이름 정규식)를 실제 SHEET 품목 목록으로 치환하는 작업이 필요 — 발통(SS_FOOT_ROUND_ID/SS_FOOT_FLAT_ID), 유선보드(SS_WIRED_BOARD_ID), 실링펌프(SS_CEILING_PUMP_ID)의 실제 `model_code` 는 이 파일 범위 밖(3,398~3,541줄 근방)에서 `SINGLE_SETS.find(...)` 로 정의되므로 다른 세그먼트 조사 결과와 합쳐야 완결.

---

### G. 홈멀티 판넬/리모컨/분기관/호스 파생수량 (핵심 — 수량동기화 대상)
**함수·줄**: `recomputeHomePanels` 8112(+8159,8174) · `recomputeHomeRemotes` 8225(+8248,8255,8256,8257,8265)
· `recomputeHomeBranches` 8272(+8274) · `recomputeHomeDerived` 8333(+8354)

> ⚠️ 개발책임자 지시대로 **이름 파싱 로직 자체는 이식 대상이 아니다.** 아래는 코드가 실제로
> 도출하는 **(원인 품목군 → 결과 모델 → 수량계산식)** 을 최대한 명시적 model_code 표로 환원한 것.
> "원인 품목군"란은 레거시가 이름 정규식으로 실내기를 그룹핑하는 조건을 **참고용으로만** 적었다 —
> 실제 이식 시엔 이 그룹에 속하는 SHEET 품목의 `model_code` 목록을 DB에서 뽑아
> `quantity_sync_source` 행으로 등록해야 한다(파싱 함수 자체를 옮기지 말 것).

**G-1. 인피니트 판넬 (수량 1:1, SUM 집계)**

| 실내기 그룹 | 판넬옵션 | 목표 model_code | 상태 |
|---|---|---|---|
| 실내기·인피니트·중형 | 기본/25년형 | `PC1YNWK1NW` | ACTIVE |
| 실내기·인피니트·중형 | 공청판넬 | `PC1YNCK1NW` | ⚠️**DISCONTINUED**(DB 실측) |
| 실내기·인피니트·중형 | 동작감지/AI | `PC1YNRK1NW` | ACTIVE |
| 실내기·인피니트·대형 | 기본 | `PC1ZNSK1NW` | ACTIVE |
| 실내기·인피니트·대형 | 25년형 | `PC1ZNWK1NW` | ACTIVE |
| 실내기·인피니트·대형 | 공청판넬 | `PC1ZNCK1NW` | ⚠️**DISCONTINUED**(DB 실측) |
| 실내기·인피니트·대형 | 동작감지/AI | `PC1ZNRK1NW` | ACTIVE |

**G-2. 4-Way "공청판넬" 옵션 활성 시 1:1 스왑(수량 전량 이관)**

| from model_code | to model_code |
|---|---|
| `PC4NUFK1NW` | `PC4NUCK4NW` |
| `PC6NUDK1NW` | `PC6NUCK1NW` |
| `PC4NUFK1N` | `PC4NUCK1N` |
| `PC6NUDK1N` | `PC6NUCK1N` |

**G-3. 360/1-Way 판넬**: 대상 target 모델은 `pickPanelBy()`/`PANEL_MODELS`(정의는 이 배정범위 **밖**, 3201·8163~8188줄 근방)로 위임 — 다른 세그먼트 조사와 합산 필요.

**G-4. 리모컨 (SUM 집계, 실내기 카테고리별 카운트 → 리모컨 모델 배정)**

| 실내기 그룹 | 대상 model_code | 옵션 조건 |
|---|---|---|
| 실내기·360CST | `REMOTE_360_DEFAULT`(정의 범위 밖) | `home_remote==='기본'` |
| 실내기·인피니트 | `AR-CH01`(무선리모컨 인피니트) | `home_remote==='기본'` |
| 실내기(1way/4way, 비인피니트/비360) + 벽걸이 | `REMOTE_WIRELESS`(범위 밖 상수) | `home_remote==='기본'` |
| 전열교환기/에어콤보(단, `REMOTE_COLOR_AIRCOMBO` 모델 자신 제외) | `REMOTE_COLOR_AIRCOMBO`(범위 밖 상수) | 옵션 무관 |
| 위 4그룹 합계 | `AWR-WE13N`(유선) 또는 `AWR-WG00N`(컬러유선) | `home_remote∈{'유선','컬러'}` |
| 위와 동시에 | `REMOTE_WIRED_KIT`(범위 밖 상수) | 동일 수량으로 동반 배정 |

**G-5. 분기관 (SUM+뺄셈 조건식 — 단순 승수 모델로 표현 불가)**

```
iCnt = Σ(실내기|벽걸이|에어콤보|전열교환기, 단 판넬/리모컨/호스/분기관/발통 제외) 수량
sOut = Σ(실외기 & 단배관) 수량
h6   = Σ(실외기 & model='AJ060MXHNBC1' 인 6HP 단배관) 수량
조건: iCnt>=2 && sOut>0 일 때만
  b25(AXJ-TA3419M 25A 분기관) = h6
  b15(AXJ-TA3419M 계열 15A? — 실제 target은 BRANCH_1509, 범위 밖 상수) = iCnt - sOut - h6
아니면 둘 다 0
```
🚩 **[결정 필요 D3]** — 뺄셈+조건부 다중소스 공식이라 `quantity_sync_source×factor` 합산 모델로 직접 표현 불가.

**G-6. 유연호스 (SUM, 1-way/4-way 실내기 수 기준)**

| 실내기 그룹 | 옵션 | 대상 model_code(범위 밖 상수) |
|---|---|---|
| 1-way 실내기 합 | `home_hose_i` 체크 시 | `HOSE_I_1W` |
| 1-way 실내기 합 | 미체크 시 | `HOSE_1W` |
| 4-way+360 실내기 합 | 항상 | `HOSE_4W`(I형 4-way는 미사용, `HOSE_I_4W` 는 항상 0) |
| `home_no_hose` 체크 시 | 전부 0 |

**하드코딩 값 전부**: `PC1YNWK1NW/PC1YNCK1NW/PC1YNRK1NW/PC1ZNSK1NW/PC1ZNWK1NW/PC1ZNCK1NW/PC1ZNRK1NW`(인피니트 7종), `PC4NUFK1NW→PC4NUCK4NW / PC6NUDK1NW→PC6NUCK1NW / PC4NUFK1N→PC4NUCK1N / PC6NUDK1N→PC6NUCK1N`(4-way 스왑 4쌍), `AR-CH01`, `AWR-WE13N`, `AWR-WG00N`, `AJ060MXHNBC1`(6HP 실외기).

**읽는 속성**: `HOMEMULTI[].name/model`(수량은 `homeQty` 맵), `HOME_MANUAL_*` Set(수동잠금).

**스키마 대응**: [부분] — G-1/G-2/G-4 는 `quantity_sync_source/target`(SUM, multiplier=1) 로 표현 가능. G-5(분기관)는 [불가: 스키마의 source×factor 합산 모델이 뺄셈·조건부 공식을 못 담음] → 결정 필요.

**기본값**: [자동] G-1/G-2/G-4/G-6 — DB에 model_code 전부 실재 확인됨(§0 상단 DB 조회, 77/77 매치). 다만 G-1의 두 목표 모델이 DISCONTINUED이므로 🚩[결정 필요 D2].

---

### H. 상업멀티 파생수량 (판넬/호스/리모컨/펌프/받침대/리뉴얼필터)
**함수·줄**: `recomputeCommDerived` 8390(+8392,8393,8409,8536,8556)

| 파생대상 | 소스 | 집계식 |
|---|---|---|
| 판넬 | 실내기(`isCommIndoorRow`) 수량 | `computeCommPanelModelForIndoor_(r)` 결과 모델에 1:1 합산(§I 참조) |
| 유연호스 | 벽걸이/덕트/실링/스탠드 제외 실내기 중 `1way`/`2way`→`nTarget`, 그 외→`nNormal` | I형/일반 옵션에 따라 `HOSE_1W`/`HOSE_I_1W` = nTarget, `HOSE_4W`(`pickHoseModel('4way')`, 범위 밖) += nNormal |
| 리모컨 | 실내기 또는 이름에 `전열교환기` 포함 품목 수량 | `computeCommRemoteModelForIndoor_(r)`(범위 밖, 4090줄) 결과에 합산 |
| **펌프**(완전 명시적 M:N 표) | 아래 **PUMP_MAP** | SUM, 승수 1 — *바로 로드 가능한 표* |
| 받침대/분기관 | 실외기(`isCommOutdoorRow`) 수량, SET 이면 `parseSetHPs`로 HP분해 후 `chooseBaseModel`(둘다 범위 밖)로 모델명 산출, 그 위에 `countBranchForSet`(범위 밖)로 T형분기관(`AXJ-TA3419M`) 수량 가산 | SUM |
| 리뉴얼필터 | `RENEW_FILTER_MAP`(정의 범위 밖) 의 실외기 모델 목록에 속하면 | SUM, 승수 1 |
| 옵션 제외 | `comm_panel==='판넬제외'`→판넬 전부 0, `comm_remote==='제외'`→리모컨 전부 0, `comm_ex_base` 체크→받침대류 전부 0 | — |
| 카탈로그 존재 가드 | `AR-EH05`, `방진가대S2중`(**리터럴 오타 아님** — 이 모델의 실제 `model_code` 값이 한글 `"방진가대S2중"`, DB 조회로 확인) 제외 나머지 파생모델이 카탈로그에 없으면 **에러 throw** | — |

**PUMP_MAP (완전 명시적 — 이식 시 그대로 quantity_sync_source/target 행으로 로드 가능)**

| 목표 model_code(펌프) | 소스 실내기 model_code(SUM, factor=1) |
|---|---|
| `MDP-Z075SZED` | `AM052DNLDBH1`, `AM072DNLDBH1` |
| `ADP-E075SEK3D` | `AM100FNLDBH1` |
| `MDP-M075SGK2D` | `AM130DNMDBH1`, `AM145DNMDBH1` |
| `ADP-G075SPK1D` | `AM083DNMDBH1`, `AM100DNMDBH1`, `AM110DNMDBH1`, `AM052ANHDBH1`, `AM060ANHDBH1`, `AM072ANHDBH1`, `AM083ANHDBH1`, `AM100ANHDBH1`, `AM110ANHDBH1`, `AM130ANHDBH1`, `AM145ANHDBH1`, `AM230ANHDBH1` |
| `ADP-N047SNK1D` | `AM290HNHDBH1` |
| `ADP-F075SP` | `AM072TNCDBH1`, `AM110TNCDBH1`, `AM130TNCDBH1`, `AM145TNCDBH1` |

(위 표의 22개 model_code 전부 DB `products` 에 SHEET/ACTIVE 로 실재 확인됨 — §0 DB 조회.)

**하드코딩 값**: PUMP_MAP 전체(펌프 6종 × 실내기 22종), `AR-EH05`/`방진가대S2중`(카탈로그 존재예외), `AWR-WE13N`/`AWR-VH12N`(특수리모컨 예외).

**읽는 속성**: `COMMULTI[].name/model/unit`, `commQty`.

**스키마 대응**: PUMP_MAP은 [표현 가능] `quantity_sync_source/target` 그대로. 받침대/리뉴얼필터는 [부분](범위 밖 헬퍼 의존). 판넬/리모컨은 §I 참조.

**기본값**: [자동] PUMP_MAP은 즉시 로드 가능(위 표 그대로). 나머지는 범위 밖 함수(다른 세그먼트) 결과와 합쳐야 완결.

---

### I. 상업멀티 판넬 모델 옵션치환 (모델 자체가 바뀌는 규칙 — 수량승수 아님)
**함수·줄**: `computeCommPanelModelForIndoor_` 8608(+8610,8630)

이 함수는 "수량이 몇 개인가"가 아니라 **"어떤 모델을 쓸 것인가"**를 결정한다(1개 실내기당 판넬 1개, 승수는 항상 1). 실내기 이름에서 `1way/2way/4way/360`, `소형/중형/대형`, `WIFI내장/미내장`, `인피니트`, `MINI` 를 읽고 `#comm_panel`(기본판넬/블랙판넬/승강판넬/공청판넬/동작감지) 옵션에 따라 아래처럼 목표 모델을 고른다.

**2way**: 무조건 `PC2NWSK1N`

**1way + WIFI내장** (옵션이 공청판넬이면 C열, 아니면 S열):

| 크기 | 기본(S) | 공청(C) |
|---|---|---|
| 소형 | `PC1MWSK3NW` | `PC1MWCK3NW` |
| 중형 | `PC1NWSK3NW` | `PC1NWCK3NW` |
| 대형 | `PC1BWSK3NW` | `PC1BWCK3NW` |

**1way + 미내장**:

| 크기 | 기본(S) | 공청(C) |
|---|---|---|
| 소형 | `PC1MWSK3N` | `PC1MWCK3N` |
| 중형 | `PC1NWSK3N` | `PC1NWCK3N` |
| 대형 | `PC1BWSK3N` | `PC1BWCK3N` |

**1way + 인피니트**: 중형 → 동작감지옵션이면 `PC1YNRK1NW` 아니면 `PC1YNWK1NW` / 대형 → `PC1ZNRK1NW` 아니면 `PC1ZNWK1NW`

**4way**: WIFI+MINI→`PC4SUFK1NW`, WIFI+일반→`swap('PC4NUFK1NW')`, 미내장+MINI→`PC4SUFK1N`, 미내장+일반→`swap('PC4NUFK1N')`
- `swap()` 규칙: 블랙판넬 옵션이면 `NUF→NBF` 치환, 승강판넬이면 `NUF→NUX` 치환, 공청판넬이면 `NUF→NUC`+`K1→K4` 치환(또는 `WSK3→WCK3`), 동작감지는 별도 인피니트 모델로 분기.

**360 + WIFI/미내장 × 원형/사각(MAP360, 완전 명시적)**

| WIFI | 형태 | 기본 | 블랙판넬 | 공청판넬 | 승강판넬 |
|---|---|---|---|---|---|
| WIFI내장 | 원형 | `PC6NUNK1NW` | `PC6NBNK1NW` | `PC6EUCK1NW` | `PC6EUXK1NW` |
| WIFI내장 | 사각 | `PC6NUDK1NW` | `PC6NBDK1NW` | `PC6NUCK1NW` | `PC6NUXK1NW` |
| 미내장 | 원형 | `PC4NUNK1N` | `PC4NBNK1N` | `PC6EUCK1N` | `PC6EUXK1N` |
| 미내장 | 사각 | `PC4NUDK1N` | `PC4NBDK1N` | `PC6NUCK1N` | `PC6NUXK1N` |

(위 표의 model_code 16개 전부 DB `products` 에 SHEET/ACTIVE 로 실재 확인됨.)

`#comm_panel==='판넬제외'` 이면 판넬 전체 미배정(0).

**읽는 속성**: `COMMULTI[].name`(원본, `rawNameOf`), `#comm_panel`, `#comm_p360` 옵션값.

**스키마 대응**: 🚩[불가: 스키마에 "옵션값에 따른 모델 치환" 개념이 없음] — `quantity_sync`는 수량 승수 모델이라 "SKU 자체가 바뀐다"를 못 담는다. `bundle_component.component_variant`가 후보이나 이 케이스는 번들 하위 구성품이 아니라 **독립 실내기 1개당 독립 판넬 1개를 고르는 문제**라 성격이 다르다.

**기본값**: 🚩[결정 필요 D1] — 위 표(1way 12종 + 360 16종 + 4way 스왑 4종 + 인피니트 4종 = 총 36개 모델관계)를 스키마 어디에 실을지 결정 필요. 후보: (a) 신규 테이블 `product_option_variant`(source_model, option_key, option_value, target_model) 신설, (b) `bundle_component`를 "실내기 자신을 bundle_product로 보고 판넬을 옵션별 component로" 재해석, (c) 현행처럼 애플리케이션 레이어에 표 형태 상수로 유지(스키마 이관 보류).

---

### J. 전송 시 세트 분해/미분해 판정(부자재는 통짜로 보낸다)
**함수·줄**: `explodeSendSets_` 8966(+8971)

| 입력 조건 | 결과 |
|---|---|
| `SEND_AS_SET_IDS`(범위 밖) 에 포함되거나, `classifySingleSetFixed(s).catL` 이 `부자재`/`실외기 받침` | 세트를 분해하지 않고 **세트 자체를 1줄**로 전송(수량=세트수량, 단가=`getRealSinglePrice`) |
| 그 외 | `explodeSetParts(s,q,unitOverride)`(범위 밖)로 구성품 낱개 분해해서 전송 |

**스키마 대응**: [표현 가능] `products.bundle_mode`(SET 전체발송 vs 구성품전개) 필드가 정확히 이 스위치에 대응.

**기본값**: [자동] — `classifySingleSetFixed` 의 `catL`(범위 밖 함수, 다른 세그먼트) 결과와 `SEND_AS_SET_IDS` 목록을 합쳐 `bundle_mode` 초기값을 정하면 됨. 사람 판단 불필요.

---

### K. 전송데이터 조립 — 경동 특례 · 고정DC 추출 · 단가 폴백체인
**함수·줄**: `buildSendRows` 9378(+9391,9396,9419)

| 입력 조건 | 결과 |
|---|---|
| 배송주소(`addrBase+addrDetail`)에 `경동` 과 `/` 둘 다 포함 (`isKyungdong`) | 각 라인의 **규격(spec)란 끝에 출고가를 자동 병기**(`spec + ' / ' + fmt(list)`) — 경동 특정 거래처 전용 표기 |
| 목록가 조회 우선순위 | ①`COMM_PARTS/COMMULTI/SINGLE_PARTS/HOMEMULTI` 순서로 `model→list\|listPrice\|cprice\|price` ②`OLD_PRODUCTS`는 `price` 직접 사용(구형은 list 개념 없음) ③`getBaseListPrice(...)`(범위 밖)로 최종 산출 |
| `.fix-dc-inp`(화면 입력) 값이 있으면 그 값 | 1 초과면 `/100`(퍼센트로 간주), 없으면 품목의 `fixedDc` 정적값 |

**하드코딩 값**: 고객식별 문자열 `'경동'`, 구분자 `'/'`.

**스키마 대응**: [불가: 스키마에 거래처 식별/특례표기 개념 없음] — `products`/`classification` 어디에도 "이 거래처엔 규격란에 출고가를 병기"할 근거 컬럼이 없다.

**기본값**: 🚩[결정 필요 D5] — 경동 특례를 유지한다면 거래처 마스터에 플래그를 두는 방식이 필요(현재 스키마 목록엔 거래처 테이블 자체가 없어 범위 밖일 가능성).

---

### L. 전송 라인 병합(동일모델·동일단가 dedup)
**함수·줄**: `aggregateSendRows` 9188

| 입력 조건 | 결과 |
|---|---|
| `model+'||'+price` 키가 같은 라인이 여러 개 | 수량 합산, 이름은 마지막 라인 값 사용 |
| 병합되는 라인들의 `fixedDc`(고정할인율) | **더 큰 값이 승리**(`nDc>pDc?nDc:pDc`) |
| `has360/has4way/hasStand/hasOneWayDc/hasDeluxeDc/hasFirstGradeDc` 할인 플래그 | OR 병합(하나라도 true면 true) |

**스키마 대응**: [불가: estimate 라인 병합은 스키마 범위 밖(주문서 생성 시점 로직)] — `products.discount_flags`/`fixed_discount_rate`는 품목 1건의 속성이라 "병합 시 최댓값 채택" 규칙은 라인아이템 처리 로직에 속한다.

**기본값**: 정보 제공용 — decisions_needed 아님(제품 기본값이 아니라 라인 병합 정책이므로).

---

### M. 주문 준비 검증(전화번호 형식·필수항목)
**함수·줄**: `isValidTel` 9115 · `checkOrderReady` 9171

| 입력 조건 | 결과 |
|---|---|
| 전화번호가 `^010-\d{4}-\d{4}$` 정규식과 불일치 | 유효하지 않음 |
| 메모·배송지·전화번호(유효)·감사주소(동일주소 아니면 필수) 넷 다 채워짐 | `#btnSendOrder` 활성화, 아니면 비활성 |

**하드코딩 값**: `^010-\d{4}-\d{4}$`(한국 010 휴대폰 형식 강제).

**스키마 대응**: [불가: 상품 카탈로그 스키마 대상 아님] — 주문서 폼 검증 로직으로, `products`/`classification` 등 배정된 스키마와 무관.

**기본값**: 결정 불필요(제품 기본값 항목 아님, 이미 확정된 검증규칙).

---

### N. 스펙 라벨링·스펙조회 대상 판별
**함수·줄**: `extractSpecs` 9684(+9842) · `openSelectedSpec` 9840

| item.catL | 라벨 규칙 |
|---|---|
| `판넬` | `type==='home'` 이면 "타공사이즈/전산볼트간격"=`cool_kw/cool_power`, 아니면(comm) `cool_cap_kcal/cool_pow_kw` 사용 — **같은 라벨, 다른 원본 필드**(홈/상업 스펙시트 컬럼명이 다름) |
| `전열교환기` | 이름에 `에어콤보` 포함시 "냉매가스/소비전력(전열환기)/제품크기"만, 아니면 "덕트구경/소비전력(전열환기)/소비전력(일반환기)/제품크기/제품중량" |
| `세트` | 구성품을 kind/name 기준 실내기/실외기/판넬/리모컨/자재/벽걸이로 그룹핑해 "구성" 라인 생성 |
| `openSelectedSpec`: 이름/대분류/중분류에 `일자발,발통,펌프,보드,자재,분기관,받침,중계기,유연호스,리모컨` 포함 | 스펙조회 대상에서 **제외**(부속품은 스펙표시 안 함) |

**하드코딩 값**: 제외 키워드 10종, catL별 라벨-필드 매핑표(약 20쌍).

**스키마 대응**: 🚩[불가: 제공된 스키마에 기술스펙 세부 컬럼(cool_kw, pipeDia 등)이 없음] — `products.spec_text`(단일 문자열)만 있어 라벨별 구조화 저장이 안 됨.

**기본값**: 결정 필요라기보다 **범위 밖 확인사항** — 기술스펙을 구조화 컬럼으로 이관할지, `spec_text`에 조립된 문자열로 유지할지는 제품스키마 설계 전체 논의 대상(이 세그먼트 단독 결정 사항 아님).

---

## 2. 전수 분류표 (114행)

| 줄 | 함수/식별자 | 분류 | 비고 |
|---|---|---|---|
| 6607 | `onCommOptionChange` | business_rule | A |
| 6623 | `renderCommOptions` | business_rule | A/E |
| 6678 | `getCommFilterRows_` | business_rule | A |
| 6734 | `renderComm` | business_rule | A |
| 6783 | `isEcoOutdoor`(const, renderComm 내부) | business_rule | A |
| 6823 | `currentPrice`(const, renderComm 내부) | business_rule | A(커스텀단가 우선순위) |
| 6828 | `groupTop`(const, renderComm 내부) | ui_only | 행 렌더 그룹핑 |
| 6906 | `sText`(const, renderComm 내부) | business_rule | A(받침대류 판정 정규식) |
| 6993 | `updateCommRowPrice`(const, renderComm 내부) | ui_only | 화면 갱신만 |
| 7037 | `s`(const, qty change handler) | business_rule | A(받침대류 판정) |
| 7055 | `s`(const, qty change handler) | business_rule | A(받침대류 판정) |
| 7123 | `buildDisplayNameComm` | business_rule | C |
| 7161 | `displayNameForRow` | **dead_code** | §4-1 |
| 7172 | `normKey` | infra_util | 문자열 정규화 |
| 7178 | `buildCommSetIndex` | business_rule | B |
| 7181 | `src`(const) | business_rule | B |
| 7190 | `qty`(const) | business_rule | B |
| 7193 | `price`(const) | business_rule | B |
| 7203 | `explodeCommPreviewParts` | business_rule | B |
| 7210 | `unitPrice`(const) | business_rule | B |
| 7216 | `isCommSetRow` | **dead_code** | §4-2 |
| 7221 | `explodeCommSets_` | business_rule | B |
| 7240 | `mainSpec`(const) | business_rule | B |
| 7268 | `renderCommSetParts` | business_rule | B |
| 7293 | `effQ`(const) | business_rule | B |
| 7380 | `renderOldOptions` | business_rule | D |
| 7423 | `renderOld` | business_rule | D |
| 7472 | `isManual`(const) | ui_only | 색상표시만 |
| 7563 | `sumOld` | business_rule | D(⚠️0.5 하드코딩) |
| 7587 | `syncOldTotals` | ui_only | 합계 표시 |
| 7604 | `isMobileNow` | ui_only | 뷰포트 판정 |
| 7605 | `vv`(const) | ui_only | 〃 |
| 7612 | `initMobileUI` | ui_only | 이벤트 바인딩 |
| 7613 | `apply`(const) | ui_only | 〃 |
| 7630 | `onViewportChange` | ui_only | 클래스 토글 |
| 7656 | `enterMobile` | ui_only | 화면 전환 |
| 7677 | `updateTopControls`(1차 정의) | **dead_code** | §4-3 |
| 7712 | `onHomeQtyInput` | **dead_code** | §4-4 |
| 7761 | `onSingleQtyInput` | **dead_code** | §4-5 |
| 7763 | `key`(const, onSingleQtyInput 내부) | **dead_code** | 죽은 함수 본문 |
| 7784 | `chk` | ui_only | DOM 빌더 |
| 7785 | `sel` | ui_only | DOM 빌더 |
| 7788 | `renderHomeOptions` | business_rule | E |
| 7831 | `renderSingleOptions` | business_rule | E |
| 7958 | `recomputeFootAll` | business_rule | F |
| 7971 | `recomputeSingleBaseFoot` | business_rule | F |
| 8012 | `recomputeSingleExtras` | business_rule | F |
| 8037 | `isHomeCalcTriggerModel` | business_rule | F |
| 8048 | `isSingleCalcTriggerId` | business_rule | F |
| 8073 | `findHomePanelModel` | **dead_code** | §4-6 |
| 8074 | `has`(const, findHomePanelModel 내부) | **dead_code** | 죽은 함수 본문 |
| 8088 | `pickInfinitePanelModel` | **dead_code** | §4-7 |
| 8103 | `inferInfiniteSize` | **dead_code** | §4-8 |
| 8112 | `recomputeHomePanels` | business_rule | G-1/G-2 |
| 8159 | `setP`(const) | infra_util | setter 헬퍼 |
| 8174 | `useAir`(const) | business_rule | G-1 옵션분기 |
| 8225 | `recomputeHomeRemotes` | business_rule | G-4 |
| 8248 | `setR`(const) | infra_util | setter 헬퍼 |
| 8255 | `R_WE`(const) | business_rule | G-4(모델상수) |
| 8256 | `R_WG`(const) | business_rule | G-4(모델상수) |
| 8257 | `R_CH`(const) | business_rule | G-4(모델상수) |
| 8265 | `main`(const) | business_rule | G-4 옵션분기 |
| 8272 | `recomputeHomeBranches` | business_rule | G-5(🚩결정필요 D3) |
| 8274 | `setB`(const) | infra_util | setter 헬퍼 |
| 8333 | `recomputeHomeDerived` | business_rule | G-6 + 오케스트레이션 |
| 8354 | `setH`(const) | infra_util | setter 헬퍼 |
| 8390 | `recomputeCommDerived` | business_rule | H |
| 8392 | `requireCommCatalogRow_`(const) | business_rule | H(카탈로그 예외 리터럴) |
| 8393 | `row`(const) | infra_util | lookup |
| 8409 | `s`(const) | business_rule | H(받침대류 판정) |
| 8536 | `s`(const) | business_rule | H(받침대류 판정) |
| 8556 | `isSpecialRemote`(const) | business_rule | H(특수리모컨 예외) |
| 8607 | `has_` | **dead_code** | §4-9 |
| 8608 | `computeCommPanelModelForIndoor_` | business_rule | I(🚩결정필요 D1) |
| 8610 | `panelOpt`(const) | infra_util | 옵션값 read |
| 8630 | `swap`(const) | business_rule | I(모델코드 치환규칙) |
| 8694 | `syncHomeUIFromState` | ui_only | DOM 동기화 |
| 8770 | `syncSingleUIFromState` | ui_only | DOM 동기화 |
| 8834 | `syncHomeTotals` | ui_only | 합계 표시 |
| 8849 | `syncSingleTotals` | ui_only | 합계 표시 |
| 8865 | `refreshSelectedBadge` | ui_only | 뱃지/버튼 상태 |
| 8952 | `getSetUnitNowById` | **dead_code** | §4-10 |
| 8966 | `explodeSendSets_` | business_rule | J |
| 8971 | `isAccessory`(const) | business_rule | J |
| 8998 | `openPreview` | ui_only | 모달 열기 |
| 9009 | `closePreview` | ui_only | 모달 닫기 |
| 9018 | `openFinal` | ui_only | 모달 열기 |
| 9031 | `closeFinal` | ui_only | 모달 닫기 |
| 9040 | `ensureKakaoPostcode` | **dead_code** | §4-11 |
| 9049 | `mountAddrSheet` | **dead_code** | §4-12 |
| 9096 | `fit`(const, mountAddrSheet 내부) | **dead_code** | 죽은 함수 본문 |
| 9115 | `isValidTel` | business_rule | M |
| 9119 | `syncAuditFromShip_` | ui_only | 필드 복사 |
| 9126 | `toggleSameAddr_` | ui_only | 폼 토글 |
| 9154 | `syncBizAddr` | ui_only | 필드 자동입력 |
| 9171 | `checkOrderReady` | business_rule | M |
| 9188 | `aggregateSendRows` | business_rule | L |
| 9229 | `showSector` | ui_only | 섹터 전환 |
| 9233 | `el`(const) | infra_util | querySelector 래퍼 |
| 9249 | `startAuth` | infra_util | 인증 플로우 |
| 9278 | `showAuthFail` | ui_only | UI 전환 |
| 9286 | `initGate` | ui_only | 웰컴 애니메이션 |
| 9340 | `showResetProgress` | ui_only | 모달 래퍼 |
| 9357 | `bindResetButtons` | ui_only | 이벤트 바인딩 |
| 9378 | `buildSendRows` | business_rule | K |
| 9391 | `fullAddr`(const) | business_rule | K(경동 특례) |
| 9396 | `addP`(const) | business_rule | K(단가 폴백체인) |
| 9419 | `getActiveFixedDc`(const) | business_rule | K(고정DC 추출) |
| 9439 | `getLiveSpec`(const) | ui_only | DOM 텍스트 read |
| 9684 | `extractSpecs` | business_rule | N |
| 9687 | `add`(const) | infra_util | 헬퍼 |
| 9713 | `join_`(const) | infra_util | 헬퍼 |
| 9840 | `openSelectedSpec` | business_rule | N |
| 9842 | `addIfTarget`(const) | business_rule | N |

**합계 검증**: business_rule 58 + ui_only 30 + infra_util 11 + dead_code 15 = **114** = assigned_count = classified_count. ✓

---

## 3. 우리 스키마로 즉시 로드 가능한 표 (요약)

1. **PUMP_MAP**(§H) — 펌프 6종 × 실내기 소스 22종, SUM/factor=1/multiplier=1로 `quantity_sync_rule`+`source`+`target` 그대로 등록 가능. 전 모델 DB 실재 확인됨.
2. **인피니트 판넬**(§G-1) — 7개 model_code, 1:1. 단 2개(`PC1YNCK1NW`,`PC1ZNCK1NW`) DISCONTINUED → D2 결정 후 로드.
3. **4-way 공청 스왑**(§G-2) — 4쌍 1:1 스왑, 전 모델 ACTIVE.
4. **comm 360 MAP**(§I) — 16개 model_code, WIFI×형태×옵션 4x4 표. "모델 자체 치환"이라 D1 결정 후 스키마 배치 필요.
5. **bundle_component 세트 BOM**(§B) — 이미 1,598행 적재 실측됨(재확인 불필요), `qty==='Q'` 매직값의 이관 방식만 확인.

## 4. dead_code 근거 전문 (grep 명령 + 결과)

### §4-1 `displayNameForRow` (7161)
```
$ grep -rn "displayNameForRow" clients/
clients/web/order-app/index.html:4643:function displayNameForRow(row){
clients/web/estimate-app/views/index.ejs:7161:function displayNameForRow(row){
```
동일 패턴 grep을 레포 전체(`docs/` 포함)로 넓혀도 정의(4곳: 본 파일, order-app, legacy-gas 사본 2개) 외 호출부 0건.
선행 리포트 `docs/dev-reports/2026-08-10-gas-sweep-A-estimate-1-10000.md:281`도 동일 판정
(`| 7161 | displayNameForRow | 데드코드(호출부 없음) |`) — 독립 교차확인.

### §4-2 `isCommSetRow` (7216)
```
$ grep -n "isCommSetRow" clients/web/estimate-app/views/index.ejs
7216:function isCommSetRow(r){
```
이 파일 내 호출부 0건. (자매 파일 `clients/web/order-app/index.html:4581`에서는 `isSetRow = isCommSetRow(r)`로 살아있으나 별개 앱/별개 실행컨텍스트라 본 파일 판정에 영향 없음.)

### §4-3 `updateTopControls` 1차 정의 (7677)
```
$ grep -n "function updateTopControls" clients/web/estimate-app/views/index.ejs
7677:function updateTopControls(){
14752:function updateTopControls(){

$ grep -n "updateTopControls(" clients/web/estimate-app/views/index.ejs
7627:  updateTopControls();
7650:  updateTopControls();
7677:function updateTopControls(){
10833:  updateTopControls();
10845:  updateTopControls();
10861:  updateTopControls();
14752:function updateTopControls(){
```
두 정의 모두 같은 `<script>` 블록(2229~19743줄, 개폐 태그 확인됨) 안의 top-level 함수선언이다.
JS는 같은 스코프에서 `function` 선언이 중복되면 **소스 순서상 나중 선언이 앞선 선언을 덮어쓴다**(호이스팅
생성단계에서 순차 처리). 따라서 5개 호출부는 전부 14752의 몸체로 귀결되고, 7677~7696 몸체는
어떤 실행 경로로도 도달 불가능하다. 14752 바로 위 주석 `// 상단제어 (분기함수 호출 제거됨)`도
14752가 최신·의도된 버전임을 뒷받침한다(7677 쪽에만 있던 `refreshBranchButton()` 호출과
`sw.textContent` 분기가 14752엔 없음 — 리팩터 흔적).

### §4-4 `onHomeQtyInput` (7712) / §4-5 `onSingleQtyInput` (7761)
```
$ grep -n "onHomeQtyInput" clients/web/estimate-app/views/index.ejs
7712:function onHomeQtyInput(model, v) {
$ grep -n "onSingleQtyInput" clients/web/estimate-app/views/index.ejs
7761:function onSingleQtyInput(id,v){
```
파일 전체(따옴표 문자열·onXXX 속성 포함) 어디에도 정의 외 재출현 없음. `clients/web/estimate-app`
디렉터리 전체로 넓혀도 동일(0건). 실제 수량 변경 이벤트는 `renderComm`(7018~7110)처럼 각 render
함수가 자체 `addEventListener('change', ...)` 인라인 핸들러를 직접 붙이는 방식으로 대체되어 있다
(→ 이 두 함수는 그 방식으로 리팩터되기 전의 구버전 핸들러로 추정).

### §4-6 `findHomePanelModel` (8073) / §4-7 `pickInfinitePanelModel` (8088) / §4-8 `inferInfiniteSize` (8103)
```
$ grep -n "findHomePanelModel\|pickInfinitePanelModel\|inferInfiniteSize" clients/web/estimate-app/views/index.ejs
8073:function findHomePanelModel(kind, wifi){
8088:function pickInfinitePanelModel(size, opt){
8103:function inferInfiniteSize(nameLike){
```
정의만 3건, 호출 0건(디렉터리 전체 기준). 이들이 쓰려던 `PANEL_SWAP_4WAY_TO_AIR`(8057)·`INF_BASE`(8065)
상수도 이 죽은 함수들 밖에서는 재참조되지 않음(`grep -n "INF_BASE\|PANEL_SWAP_4WAY_TO_AIR"` 결과
전부 8057~8098 구간 내부). 실제 라이브 경로는 `recomputeHomePanels`(8112) 안에 **동일 데이터를 다시
인라인으로 선언한 로컬 `INF`/`map` 변수**(8191~8209)로 대체되어 있다 — 리팩터 중 옛 헬퍼가 안 지워지고
남은 사례로 판단.

### §4-9 `has_` (8607)
```
$ grep -n "has_(" clients/web/estimate-app/views/index.ejs
8607:function has_(s, re){ return re.test(String(s||'')); }
```
호출부 0건(디렉터리 전체). 자매 파일 `order-app/index.html:5891`에도 동일 패턴(정의만 있고 미사용)으로
존재 — 두 앱 모두에서 같은 이유로 죽어있는 공용 유틸.

### §4-10 `getSetUnitNowById` (8952)
```
$ grep -n "getSetUnitNowById" clients/web/estimate-app/views/index.ejs
8952:function getSetUnitNowById(id){
```
이 파일 내 호출 0건. 같은 위치의 `explodeSendSets_`(8966, 바로 아래 함수)는 이 함수를 쓰지 않고
`getRealSinglePrice(s.id)`를 직접 호출한다(8967) — 화면표시가와 무관하게 서버 정본가를 쓰도록
바뀌면서 이 헬퍼가 불필요해진 것으로 추정. (자매 파일 order-app/index.html:6036 은 살아있음 — 거긴
`getSetUnitNowById(s.id) || calcSetUnitPrice(s)` 폴백을 여전히 씀, 별개 앱이라 본 판정과 무관.)

### §4-11 `ensureKakaoPostcode` (9040) / §4-12 `mountAddrSheet` (9049)
```
$ grep -n "mountAddrSheet\|ensureKakaoPostcode" clients/web/estimate-app/views/index.ejs
9040:function ensureKakaoPostcode(){
9049:function mountAddrSheet(){
```
이 파일 내 호출 0건. 실제 주소검색 진입점 `openAddrSearch`(15093)/`openAddrDock_`(15110)를 직접
읽어보면 `document.getElementById('addrDock')`/`#addrSheet`/`#addrEmbed`/`#naverPanel`처럼
**HTML에 이미 정적으로 박혀있는 DOM**을 그대로 쓰고, `mountAddrSheet()`가 만들려는 **동적 생성
`#addrSheet`**(`#pageOrderInfo .modal` 안에 새로 append)는 전혀 참조하지 않는다. 자매 파일
`order-app/index.html`에는 `mountAddrSheet()`/`ensureKakaoPostcode()`가 실제로 호출되며
(6332/6338/6345) 살아있다 — 즉 두 앱이 한때 같은 구현을 공유했다가 estimate-app 쪽만
정적 DOM 방식으로 교체되고 옛 함수가 정리되지 않은 채 남은 것으로 판단.

---

## 5. decisions_needed 요약 (기본값 자동확정 불가 항목만)

| ID | 항목 | 후보 |
|---|---|---|
| D1 | 상업멀티 판넬 "모델 자체 치환"(§I, 36개 관계) 을 스키마 어디에 실을지 | (a) 신규 `product_option_variant` 테이블 (b) `bundle_component.component_variant` 재해석 (c) 애플리케이션 레이어 유지 |
| D2 | 인피니트 공청판넬 목표모델 2종(`PC1YNCK1NW`,`PC1ZNCK1NW`)이 DISCONTINUED | (a) 후속모델로 교체 (b) 해당 옵션 자체를 비활성화 (c) 그대로 두고 재고소진시까지 유지 |
| D3 | 홈멀티 분기관 수량식(§G-5, 뺄셈+조건부 3소스 공식)이 단순 source×factor 합산 모델을 벗어남 | (a) 여러 rule+priority로 분해 (b) condition_json에 자유식 허용 (c) 이 항목만 애플리케이션 레이어 유지 |
| D4 | 구형품목 합계 `sumOld()`의 하드코딩 50% vs 행별표시가 쓰는 동적 `old_rate` 불일치(§D) | (a) 동적 rate로 통일(권장 — 행별 표시와 합계가 일치해야 함) (b) 50% 고정이 의도된 것이었는지 확인 |
| D5 | 경동 고객 특례(주소문자열 `'경동'`+`'/'` 매치 시 규격란에 출고가 병기, §K)를 스키마화할지 | (a) 거래처 마스터에 플래그 신설(스키마 목록에 거래처 테이블 없음 — 범위 밖 확인 필요) (b) 애플리케이션 레이어 유지 (c) 폐기 |
