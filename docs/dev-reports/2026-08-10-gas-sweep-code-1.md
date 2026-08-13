# GAS 전수조사 — code-1 (`clients/web/estimate-app/lib/code.js` 1~1400)

> 조사자: code-1 서브에이전트 (읽기 전용, 코드/스키마 변경 없음)
> 분모 원본: `docs/dev-reports/2026-08-10-gas-function-inventory.md` § `lib/code.js` 항목 중 줄번호 1~1400.
> 방법: 파일 실독(1~1450줄, 경계 함수 문맥 확인용) + 호출부 grep 전수(코드/테스트/EJS/스크립트 전체) + `lib/db-catalog.js`(형제 파일, 이미 이관된 매핑의 실측 근거) 대조.

---

## 0. 완결성 집계 (1절 — 필수)

| 항목 | 값 |
|---|---|
| **assigned_count** (분모, 인벤토리 원문 줄번호 1~1400) | **95** |
| **classified_count** | **95** |
| business_rule | **69** |
| ui_only | **0** |
| infra_util | **8** |
| dead_code | **18** |
| 합계 검산 | 69+0+8+18 = **95** = assigned_count ✅ |

인벤토리 원문에서 코드값(줄번호)이 **1397 이하**인 항목까지가 이 범위(95개, 인벤토리 doc 654번째~752번째 줄)이고, 다음 항목(`1404: const findContains`, `getSpecDetailMap_` 내부 헬퍼)부터는 code-2(또는 이후) 범위다. 95개 중 47개는 최상위 `function`/독립 함수, 48개는 그 47개 안에 중첩된 `const 헬퍼`(인벤토리 추출 스크립트가 화살표함수까지 개별 항목으로 뽑은 것)다. 중첩 헬퍼는 부모 함수와 분리해 실행될 수 없으므로 **부모 함수와 동일한 분류를 상속**했다(§2 표에 "→ 상위 함수#N에 포함" 으로 명시). 6점 상세(①~⑥)는 최상위 business_rule 함수 27개에 대해서만 작성했고(§3), 중첩 헬퍼는 각 상위 함수 절 안에서 함께 설명한다.

이 파일의 앞부분 주석(1~35줄)이 legacy 76함수 인벤토리를 §별로 이미 분류해 두었고, 실제 module.exports(2805~2858줄, 참고용으로 읽었으나 내 범위 밖)와 대조해 죽은 코드 여부를 grep 으로 재검증했다.

---

## 1. 개발책임자 확정 규칙 준수 확인 — 수량 파생 금지

> "수량은 구성품이나 이름에서 추론하지 않는다. 오로지 수량동기화 설정값이 정한다."

**code.js 1~1400 범위 전수 확인 결과: 위반 없음.** 이 범위 안에서 이름/HP 텍스트를 파싱하는 함수는 `hpFromText_`(296줄) 하나뿐이며, 그 출력은 `classifyHome_` 의 **`disp`(표시 텍스트) 필드**에만 쓰인다(예: "5HP" 라벨). 수량(`qty`)을 계산·설정하는 코드는 이 범위에 존재하지 않는다(수량 로직은 `views/index.ejs` 의 `recomputeHomeDerived`/`explodeSetParts` 등 — 다른 에이전트 범위). 따라서 "(본체 model_code, 부자재 model_code, 수량)" 설정값 표로 환원할 대상이 이 범위에는 없다.

---

## 2. 전수 분류표 (95/95)

범례: **BR**=business_rule, **UI**=ui_only, **IU**=infra_util, **DEAD**=dead_code. 부모-자식 관계는 들여쓰기로 표시.

| 줄 | 식별자 | 분류 | 비고 |
|---|---|---|---|
| 96 | `_msGet` | IU | SamhanLogis MS GET 래퍼 |
| 110 | `_msPost` | IU | SamhanLogis MS POST 래퍼 |
| 182 | `cachePutJSON_` | IU | 캐시 write(청크 분할) |
| 193 | `cacheGetJSON_` | IU | 캐시 read |
| 206 | `cacheRemoveJSON_` | IU | 캐시 invalidate |
| 221 | `normalizeSize_` | **BR-8** | 평형 텍스트 정규화 → `products.pyong_size` |
| 227 | `findIdx_` | IU | 범용 헤더열 탐색(별칭 배열) |
| 232 | `parseKRNumber_` | IU | 한국어 숫자 문자열 파싱(정수) |
| 239 | `parseKRFloat_` | IU | 한국어 숫자 문자열 파싱(실수) |
| 246 | `toYmd_` | **DEAD** | 호출부 0(§4-1) |
| 254 | `toMmDd_` | **DEAD** | 호출부 0(§4-1) |
| 262 | `normalizeTel_` | **DEAD** | 단위테스트만 존재, 런타임 호출 0(§4-2) |
| 270 | `todayYMD_` | **DEAD** | 호출부 0(§4-1) |
| 274 | `_normSpec_` | **DEAD** | 호출부 0, 테스트도 0(§4-1) |
| 278 | `sanitizeKoreanParen_` | **BR-6** | disp 파생 파이프라인 1단계 |
| 287 | `trimSymbols_` | **BR-6** | disp 파생 파이프라인 2단계 |
| 291 | `sanitizeDisp_` | **BR-6** | disp 파생 최종 진입점(9회 내부호출) |
| 296 | `hpFromText_` | **BR-7** | 실외기 HP 표시텍스트 추출 |
| 306 | `isBlockedByNote_` | **BR-5** | 미판매/단종 → 카탈로그 제외 |
| 313 | `isSoldOutByNote_` | **DEAD** | 호출부 0, EJS 에 동일 규칙 별도 구현 존재(§4-3) |
| 319 | `unifyCatL_` | **BR-4** | "부자재2"→"부자재" 별칭 정규화 |
| 325 | `findHeaderIndex_` | **DEAD** | `findIdx_` 로 완전 대체, 호출부 0(§4-4) |
| 326 | ㄴ `norm`(중첩) | **DEAD** | → 325(findHeaderIndex_)에 포함 |
| 336 | `extractRowsFromFormula_` | **DEAD** | 호출부 0(테스트만 직접 호출)(§4-5) |
| 346 | `formatWonDiscountLabel_` | **DEAD** | 호출부 0(§4-6) |
| 367 | `formatPercentLabel_` | **DEAD** | 호출부 0(§4-6) |
| 373 | `combineRemarks_` | **DEAD** | 호출부 0(§4-6) |
| 380 | `detectHomeOrder` | **BR-9** | 주문 타입(홈/상업) 판정 |
| 387 | ㄴ `U`(중첩) | BR | → 380에 포함 |
| 399 | `normalizeEstimateConfig_` | **BR-10** | estimate 설정 정규화(11키) |
| 401 | ㄴ `num`(중첩) | BR | → 399에 포함 |
| 406 | ㄴ `bool`(중첩) | BR | → 399에 포함 |
| 413 | ㄴ `str`(중첩) | BR | → 399에 포함 |
| 414 | ㄴ `amount`(중첩) | BR | → 399에 포함 |
| 444 | `buildDefaultDcConfig_` | **BR-10** | DC 설정 flat 11키 생성 |
| 461 | `splitVatAmount_` | **BR-10** | VAT 분리(공급가/세액) |
| 471 | `applyEstimateTotalAdjustments_` | **BR-10** | 선금할인 조정행 삽입 |
| 509 | `classifyHome_` | **BR-1** | 홈멀티 8단계 분류 캐스케이드 |
| 602 | `classifySingleSetLM_` | **BR-2** | 싱글세트 L/M 분류 |
| 634 | `classifyCommercial_` | **BR-3** | 상업멀티 L/M/S 분류 |
| 721 | `classifyCommercialDisp_` | **BR-3** | 위 + disp 어댑터 |
| 744 | `getHomeMulti` | **BR-11** | 홈멀티 시트 ETL |
| 760 | ㄴ `row` map(중첩) | BR | → 744에 포함(헤더행 탐지) |
| 767 | ㄴ `Hraw` map(중첩) | BR | → 744에 포함 |
| 784 | ㄴ `name` 추출(중첩) | BR | → 744에 포함 |
| 785 | ㄴ `model` 추출(중첩) | BR | → 744에 포함 |
| 798 | ㄴ `priceFormula` 추출(중첩) | BR | → 744에 포함(useK2 판정 원천) |
| 827 | `getSingleSets` | **BR-12** | 싱글세트 시트 ETL + matKey |
| 866 | ㄴ `model` 추출(중첩) | BR | → 827에 포함 |
| 867 | ㄴ `unit` 추출(중첩) | BR | → 827에 포함 |
| 880 | ㄴ `fH` 수식(중첩) | BR | → 827에 포함(matKey D4/D7/D8 판정) |
| 919 | `getSingleParts` | **BR-13** | 싱글 구성품 ETL + isDefault |
| 931 | ㄴ `Hraw` map(중첩) | BR | → 919에 포함 |
| 948 | ㄴ `setModel` 추출(중첩) | BR | → 919에 포함 |
| 951 | ㄴ `nameRaw` 추출(중첩) | BR | → 919에 포함 |
| 953 | ㄴ `model` 추출(중첩) | BR | → 919에 포함 |
| 954 | ㄴ `kind` 추출(중첩) | BR | → 919에 포함 |
| 955 | ㄴ `unit` 추출(중첩) | BR | → 919에 포함 |
| 958 | ㄴ `feat` 추출(중첩) | BR | → 919에 포함(isDefault 판정 원천) |
| 989 | `getSingleMatPrices` | **BR-14** | 싱글 자재가격 맵 |
| 1007 | `getCommercialMulti` | **BR-15** | 상업멀티 시트 ETL |
| 1023 | ㄴ `row` map(중첩) | BR | → 1007에 포함 |
| 1030 | ㄴ `Hraw` map(중첩) | BR | → 1007에 포함 |
| 1049 | ㄴ `name` 추출(중첩) | BR | → 1007에 포함 |
| 1050 | ㄴ `model` 추출(중첩) | BR | → 1007에 포함 |
| 1071 | ㄴ `priceFormula` 추출(중첩) | BR | → 1007에 포함(useK2) |
| 1097 | `getCommercialParts` | **BR-16** | 상업멀티 구성품 ETL + isDefault |
| 1111 | ㄴ `row` map(중첩) | BR | → 1097에 포함 |
| 1117 | ㄴ `Hraw` map(중첩) | BR | → 1097에 포함 |
| 1135 | ㄴ `setModel` 추출(중첩) | BR | → 1097에 포함 |
| 1136 | ㄴ `nameRaw` 추출(중첩) | BR | → 1097에 포함 |
| 1138 | ㄴ `model` 추출(중첩) | BR | → 1097에 포함 |
| 1139 | ㄴ `kind` 추출(중첩) | BR | → 1097에 포함(isDefault 판정 원천) |
| 1140 | ㄴ `unit` 추출(중첩) | BR | → 1097에 포함 |
| 1176 | `getOldProducts_` | **BR-17** | 구형(단종/대체) 시트 ETL |
| 1215 | `getHomeDefaults` | **BR-18** | 홈멀티 estimate 기본값 |
| 1230 | ㄴ `nameRow`(중첩) | BR | → 1215에 포함 |
| 1231 | ㄴ `valRow`(중첩) | BR | → 1215에 포함 |
| 1233 | ㄴ `pick`(중첩) | BR | → 1215에 포함 |
| 1256 | `getSingleDefaults` | **BR-18** | 싱글 estimate 기본값 |
| 1274 | ㄴ `nameRow`(중첩) | BR | → 1256에 포함 |
| 1275 | ㄴ `valRow`(중첩) | BR | → 1256에 포함 |
| 1277 | ㄴ `pick`(중첩) | BR | → 1256에 포함 |
| 1303 | `getRecommendOduData` | **BR-19** | 추천실외기 조회 테이블 |
| 1325 | `getSpecMap_` | **DEAD** | 호출부 0, `getSpecDetailMap_` 로 대체됨(§4-7) |
| 1334 | ㄴ `scan`(중첩) | **DEAD** | → 1325에 포함 |
| 1342 | ㄴ `Hraw`(중첩) | **DEAD** | → 1325에 포함 |
| 1345 | ㄴ `iSpec`(중첩) | **DEAD** | → 1325에 포함 |
| 1352 | ㄴ `Hraw`(2차, 중첩) | **DEAD** | → 1325에 포함 |
| 1355 | ㄴ `idxSpec`(중첩) | **DEAD** | → 1325에 포함 |
| 1381 | `getSpecDetailMap_` | **BR-20** | 모델별 상세 spec 맵(홈/싱글/상업) |
| 1389 | ㄴ `normH`(중첩) | BR | → 1381에 포함 |
| 1390 | ㄴ `findHeaderRow`(중첩) | BR | → 1381에 포함 |
| 1392 | ㄴ `H` map(중첩) | BR | → 1381에 포함 |
| 1397 | ㄴ `idx`(중첩) | BR | → 1381에 포함 |

**검산**: BR 최상위 27 + BR 중첩 42 = 69. IU 최상위 8 + IU 중첩 0 = 8. DEAD 최상위 12 + DEAD 중첩 6 = 18. UI 0. 합계 69+8+18+0=95.

---

## 3. business_rule 상세 (①~⑥) — 최상위 함수 27개 / 20개 절

### BR-1. `classifyHome_` — `lib/code.js:509`

홈멀티(HOME_MULTI) 품명 텍스트 → 대/중/소 분류 + 표시명(disp) 8단계 캐스케이드(먼저 매칭되는 조건이 승리, 순서 고정).

② 조건 → 결과

| 순서 | 조건(정규식) | catL | catM | catS | disp |
|---|---|---|---|---|---|
| 1 | `/원형\s*발통\|발통\s*세트\|받침대\|일자발\|평발\|플랫/i` | `실외기 받침대` | `원형발통`(원형\|발통) / `일자발`(일자발\|평발\|플랫) | — | 키워드 제거 후 sanitize |
| 2 | `/전열\s*교환기\|에어콤보\|에어콤포/i` | `전열교환기` | `에어콤보`(매칭 시) | — | 키워드 제거 후 sanitize |
| 3 | `/인테리어\s*핏\|인테리어핏/i` | `인테리어핏` | — | — | 키워드 제거 후 sanitize |
| 4 | `/시스템\s*제습기\|제습기/i` AND NOT `/가정용/i` | `시스템제습기` | — | — | 키워드 제거 후 sanitize |
| 5 | `/^실외기/` 또는 `/[\s_-]실외기/` | `실외기` | `단배관`/`다배관` | — | `hpFromText_(n)` 우선, 없으면 sanitize |
| 6 | `/^실내기/` 또는 `/[\s_-]실내기/` 또는 `/벽걸이/` | `실내기` | 1-Way(WIFI내장/인피니트UV/인피니트/미내장) · 4WAY(WIFI/미내장) · 360(WIFI/미내장) · 벽걸이 | 소형/중형/대형(`/소형\|중형\|대형/i`) | `무풍`+`N평형` 조합, 없으면 키워드 제거 sanitize |
| 7 | `/판넬\|패널/i` | `판넬` | 공기청정 WIFI / 공기청정 미내장 / WIFI / 미내장 / 인피니트 | — | 키워드 제거 후 sanitize |
| 8 | (fallback) | `부자재` | 리모컨/분기관/유연호스/기타 | — | 키워드 제거 후 sanitize |

모든 catL은 마지막에 `unifyCatL_()`(BR-4)를 거친다.

③ 상수(정규식 리터럴) 전부 — 위 표의 8개 정규식 전체 + 내부 서브 분기 정규식: `/원형\|발통/i`, `/일자발\|평발\|플랫/i`, `/에어콤보\|에어콤포/i`, `/1\s*-?\s*Way/i`, `/WIFI\s*내장/i`, `/인피니트\s*UV/i`, `/인피니트/i`, `/4\s*WAY\|4\s*-?\s*Way/i`, `/360\s*CST/i`, `/WIFI/i`, `/벽걸이/i`, `/소형/i`,`/중형/i`,`/대형/i`, `/(\d+(?:\.\d+)?)\s*평형/`, `/무풍/i`, `/공기청정\|공청/i`, `/미내장/i`, `/리모컨\|리모콘/i`, `/분\s*기\s*관\|분기관/i`, `/유연호스/i`.

④ 읽는 시트 컬럼/품목 속성 — `getHomeMulti`(BR-11)가 전달하는 `name`(원본 품명) 단일 문자열만 입력으로 받는다(간접적으로 "품명" 컬럼 의존).

⑤ 스키마 대응 — **[표현 가능]** `classification`(level=L/M/S, name=catL/catM/catS, estimate_category='HOME_MULTI') + `products.cat_l_id/cat_m_id/cat_s_id`(FK) + `products.classification_manual`(수동 override 플래그, 이미 스키마에 존재 — 캐스케이드 재실행 시 이 값이 true인 품목은 건드리지 않으면 됨). disp → `products.name`(SHEET lineage 품목의 표시명 후보, ECOUNT lineage는 원본 name 유지 추정).

⑥ 기본값 — **[자동]** 이 캐스케이드를 그대로 이식해 SHEET lineage HOME_MULTI 품목의 `cat_l_id/cat_m_id/cat_s_id` 기본값 산출 함수로 사용. 근거: `db-catalog.js`(형제 파일)의 `multiCatalog()`가 이미 DB 모드에서도 이 분류 콜백(`classifyHome_`)을 그대로 주입받아 호출하고 있어(`code.js:1885` 부근, bootstrap) — **현재도 이 캐스케이드가 살아있는 단일 진실원**임이 실측으로 확인됨.

---

### BR-2. `classifySingleSetLM_` — `lib/code.js:602`

싱글(중대형) 세트의 name+model 합성 텍스트 → L(대분류코드)/M(중분류코드) 2단 분류.

② 조건 → 결과 (L, 순서대로 첫 매치 승리)

| 정규식 | L |
|---|---|
| `/360\s*cst\|360cst\|360/` | `360` |
| `/4\s*way\|4way/` | `4w` |
| `/1\s*way\|1way/` | `1w` |
| `/덕트/` | `duct` |
| `/실링/` | `ceiling` |
| `/스탠드/` | `stand` |
| `/벽걸이/` | `wall` |
| `/가정용\|하우스\|집/` | `house` |
| `/보드\|키트\|자재\|부자재\|리모컨/` | `acc` |
| (기본값) | `acc` |

M(중복 매치 가능, 순서대로 첫 매치):
`/프레스티지.*프리미엄/`→`prestige`, `/프레스티지/`→`prestige`, `/프리미엄\|디럭스/`→`premium`, `/1\s*등급/`→`grade1`, `/냉방전용\|냉전/`→`cool`, `/냉난방/`→`heatcool`, `/무풍/`→`mupung`, `/유풍/`→`yupung`, `/갤러리/`→`gallery`, `/비스포크/`→`bespoke`.

③ 상수 — 위 정규식 전체(L 9종 + fallback, M 10종). 문자열 리터럴 코드값: `360,4w,1w,duct,ceiling,stand,wall,house,acc` / `prestige,premium,grade1,cool,heatcool,mupung,yupung,gallery,bespoke`.

④ 읽는 속성 — `s.name`, `s.model`(둘 다 소문자 합성 후 매칭).

⑤ 스키마 대응 — **[표현 가능]** `classification`(level=L/M, estimate_category='SINGLE_SET') + `products.cat_l_id/cat_m_id`. L코드(`360/4w/1w/...`)는 classification.name 텍스트가 아니라 **내부 코드값**이라는 점에 주의 — 화면 표시용 한글 라벨과 별도로 이 코드 자체를 `classification` 테이블의 어떤 키(코드 vs name)로 보존할지는 이식 시 매핑표가 필요(자동 가능, 결정 불필요 — 코드↔한글 라벨 1:1 고정 매핑이므로).

⑥ 기본값 — **[자동]** `db-catalog.js:singleSets()`가 이 함수를 `classifyLM` 콜백으로 그대로 주입받아 호출 중(코드.js:1883) — 이미 살아있는 단일 진실원.

---

### BR-3. `classifyCommercial_` / `classifyCommercialDisp_` — `lib/code.js:634` / `:721`

상업멀티(COMMERCIAL_MULTI) name+model → L/M/S 분류. 홈멀티보다 규칙이 더 복잡(모델코드 정규식 fallback 포함).

② 조건 → 결과

1. `name.includes('분기관')` → 즉시 `{catL:'부자재', catM:'분기관', catS:''}` (최우선, 다른 규칙보다 앞섬)
2. 실외기 중분류 키워드(순서대로 첫 매치, `catL='실외기'`):
   `/프\s*라임|프라임/i`→`프라임`, `/고효율.*한랭지/i`→`고효율한랭지`, `/표준형/i`→`표준형`, `/ECO.*냉난방/i`→`ECO 냉난방`, `/ECO.*냉방전용/i`→`ECO 냉방전용`, `/리뉴얼/i`→`ECO 리뉴얼`, `/냉방전용/i`→`냉방전용`
3. (2에서 못 찾으면) 실내기 중분류 키워드(`catL='실내기'`):
   1-Way(`/\b1\s*-?\s*Way\b|1WAY/i`, WIFI/인피니트/미내장 3분기), 2Way(`/\b2\s*Way\b|2Way/i`), 4-Way(`/\b4\s*-?\s*Way\b|4Way/i`, UV-C WIFI/MINI WIFI/WIFI/MINI 미내장/미내장 5분기), 360CST(`/360\s*CST|360CST/i`, WIFI/미내장), 벽걸이, 스탠드(PAC), 실링, DUCT, 전열교환기
4. L 보정(2·3 모두 실패 시): 모델코드 정규식 `/AM\d{3}A[XVH]/i` 또는 `/AXV|AXH|AXX/i` → 실외기 / `/AM\d{3}(BN|CN|PB|PH|PN)/i` → 실내기 / 이름에 `/실외기/i` 또는 `/DVM\s*(S2|ECO)/i` → 실외기 / `/실내기/i` → 실내기
5. 소분류(catS): catM이 1-Way계열이면 소형/중형(기본)/대형(`/소형|대형/i`, 없으면 중형); catM='DUCT'면 저정압 SLIM/중정압/고정압; catM='전열교환기'면 상업용/주택용; catL='실외기' AND catM이 `^ECO`면 단상형/삼상형/상부토출형
6. catL 여전히 없고 `/판넬|패널|panel/i` → `판넬`
7. 최종 fallback → `부자재`

`classifyCommercialDisp_`는 위 결과에 `disp: sanitizeDisp_(name)`을 추가하는 어댑터.

③ 상수 — 모델코드 정규식: `/AM\d{3}A[XVH]/i`, `/AXV|AXH|AXX/i`, `/AM\d{3}(BN|CN|PB|PH|PN)/i`, `/DVM\s*(S2|ECO)/i`. 키워드 정규식(실외기 7종, 실내기 9종, catS 분기 규칙군) — 위 ②에 전량 열거함. 리터럴 카테고리 문자열: `프라임,고효율한랭지,표준형,ECO 냉난방,ECO 냉방전용,ECO 리뉴얼,냉방전용,1-Way WIFI내장,1-Way 인피니트,1WAY 미내장,2Way,4-Way UV-C WIFI내장,MINI 4WAY WIFI내장,4-Way WIFI내장,MINI 4WAY 미내장,4WAY 미내장,360CST WIFI내장,360CST 미내장,벽걸이,스탠드형(PAC),실링,DUCT,전열교환기,저정압 SLIM,중정압,고정압,상업용,주택용,단상형,삼상형,상부토출형`.

④ 읽는 속성 — `name`, `model`(모델코드 정규식 fallback에 사용).

⑤ 스키마 대응 — **[표현 가능]** `classification`(estimate_category='COMMERCIAL_MULTI') + `products.cat_l_id/cat_m_id/cat_s_id`. 모델코드 정규식(AM\d{3}A[XVH] 등)은 `products.model_code` 접두 패턴 검증용으로도 재사용 가능(품질 게이트).

⑥ 기본값 — **[자동]** `db-catalog.js:multiCatalog('COMMERCIAL_MULTI', classify)`가 `classifyCommercialDisp_`를 콜백으로 주입받아 실사용 중(`code.js:1886`) — 실측 확인됨.

---

### BR-4. `unifyCatL_` — `lib/code.js:319`

② 조건 → 결과: 입력 `L`(trim) === `'부자재2'` → 반환 `'부자재'`. 그 외에는 trim된 원문 그대로.

③ 상수 — 리터럴 문자열 `'부자재2'` → `'부자재'` (1:1 별칭).

④ 읽는 속성 — 없음(순수 함수, `classifyHome_`이 산출한 catL 문자열을 입력받음).

⑤ 스키마 대응 — **[표현 가능]** `classification.name`(level=L). 시트/ECOUNT 원본에 `부자재2`로 표기된 레코드가 있다면 import 시 이 별칭 규칙을 적용해 `부자재`로 통일해야 함.

⑥ 기본값 — **[자동]** import/배치 스크립트에 이 별칭 매핑 1건을 하드코딩 이식. `views/index.ejs:4247`에도 완전히 동일한 규칙이 클라이언트 측에 독립 구현되어 있어(`const unifyCatL_=L=>String(L||'').trim()==='부자재2'?'부자재':...`) 규칙의 안정성이 이중으로 확인됨.

---

### BR-5. `isBlockedByNote_` — `lib/code.js:306`

② 조건 → 결과: 비고(note) 텍스트에서 공백 제거 후 `/미판매|단종/` 매치 시 `true`(→ 해당 행은 카탈로그에서 **완전히 제외**), 빈 문자열이면 `false`.

③ 상수 — 정규식 `/미판매|단종/` (공백 제거된 문자열에 적용).

④ 읽는 속성 — "비고"(홈멀티/싱글세트/상업멀티) 컬럼, 상업멀티 구성품은 "규격"(spec) 컬럼을 note 대용으로 재사용(`getCommercialParts`, BR-16).

⑤ 스키마 대응 — **[표현 가능]** `products.status`(비활성/제외 값)로 표현 가능. import 시 note에 "미판매"/"단종" 포함 행은 `status`를 비활성으로 세팅.

⑥ 기본값 — **[자동]** `status` 컬럼이 이미 스키마에 있고(실측: 활성 3,084건), 이 필터는 "카탈로그 노출 여부"를 결정하는 게이트이므로 status=INACTIVE(또는 동등 값) 매핑을 그대로 이식. 4개 ETL 함수(BR-11,12,15,16 중 3곳 + getSingleSets)에서 실호출 확인(306,796/876/1069/1148줄).

---

### BR-6. `sanitizeKoreanParen_` → `trimSymbols_` → `sanitizeDisp_` — `lib/code.js:278/287/291`

품명 원문에서 표시용 이름(disp)을 파생하는 2단 파이프라인. `sanitizeDisp_(text) = trimSymbols_(sanitizeKoreanParen_(text))`.

② 조건 → 결과
- `sanitizeKoreanParen_`: `()`,`[]`,`{}`,`<>` 각 괄호 안 내용에 **한글이 없으면** 괄호째 제거, 한글이 있으면 보존.
- `trimSymbols_`: `~`\`!@#$%^&*_-+=\|/;:'",.<>?·•` 문자 전부를 공백으로 치환 후 연속공백 축약 + trim.

③ 상수 — 괄호 4종류(`()`, `[]`, `{}`, `<>`) 판정용 한글 감지 정규식 `/[가-힣]/`; 심볼 제거용 문자 클래스 `~\`!@#$%^&*_\-+=\\|/;:'",.<>?·•`.

④ 읽는 속성 — "품명" 원문 문자열(모든 ETL 함수에서 name/nameRaw 파생 시 경유).

⑤ 스키마 대응 — **[표현 가능]** `products.name`(SHEET lineage 품목의 표시명 파생 규칙). ECOUNT lineage(1,963건)는 이 파이프라인을 거치지 않는 원본명일 가능성이 높음(별도 확인 필요 — 결정 불필요, 사실 확인 사항).

⑥ 기본값 — **[자동]** SHEET lineage 신규/재수입 품목의 `name` 기본값 = `sanitizeDisp_(원본 품명)`. `sanitizeDisp_`는 코드 전체에서 9회 내부 호출되는 핵심 경유 함수(519,893,952,1082,1137줄 등)로 죽은 코드 위험 없음.

---

### BR-7. `hpFromText_` — `lib/code.js:296`

② 조건 → 결과: 텍스트에서 `/(\d+(?:[.,]\d+)?)\s*hp/i` 또는 `/(\d+(?:[.,]\d+)?)\s*마력/i` 매치 시 콤마→점 치환 후 `` `${num}HP` `` 반환, 없으면 빈 문자열.

③ 상수 — 두 정규식(hp/마력 표기 인식), 접미사 리터럴 `'HP'`.

④ 읽는 속성 — 품명(name) 원문. `classifyHome_`의 실외기 분기(BR-1 표 순서5)에서만 호출되어 **`disp`(표시 텍스트) 파생에만** 사용됨.

⑤ 스키마 대응 — **[불가: 전용 필드 없음]** — 단, `products.capacity`류 수치 필드가 이미 별도 존재하는 것으로 보임(§6 특이사항 참조, `getHomeMulti`가 "용량" 컬럼을 직접 읽어 `capacity`로 채움 — `hpFromText_`와는 무관한 별개 경로). `hpFromText_`는 순수 표시텍스트 fallback이라 구조화 필드가 없어도 데이터 손실이 없다.

⑥ 기본값 — **[자동] 이식 불필요.** disp가 비어있을 때만 쓰이는 표시용 fallback이며 수량/가격/분류 어디에도 영향 없음(개발책임자 수량규칙과도 무관 — §1 참조).

---

### BR-8. `normalizeSize_` — `lib/code.js:221`

② 조건 → 결과: 입력 문자열에서 `[^\d.+]`(숫자/점/plus 이외) 전부 제거. 예: `"18평"` → `"18"`, `"16+18"` → `"16+18"`.

③ 상수 — 정규식 `/[^\d.+]/g`.

④ 읽는 속성 — "평형" 컬럼(싱글세트 시트).

⑤ 스키마 대응 — **[표현 가능]** `products.pyong_size`. `db-catalog.js:singleSets()`가 이미 `normalizeSize(r.pyongSize...)`로 동일 함수를 재호출 중(코드.js:1883) — 실사용 확인.

⑥ 기본값 — **[자동]** `pyong_size` 저장/표시 시 이 정규화 규칙(숫자·소수점·plus만 허용 — 복합평형 `16+18` 표기 지원)을 그대로 이식.

---

### BR-9. `detectHomeOrder` — `lib/code.js:380`

② 조건 → 결과: `order.{type,mode,orderType,kind,category}` 중 하나라도 `/home|home-multi|homemulti|hm/`(대소문자 무관) 매치 → `true`. 아니면 `items[]`를 순회하며 각 항목의 `{section,group,kind,category,tags}`가 `/HOME|HOME-MULTI|HOMEMULTI|HM/` 매치하거나, `model`이 `/AJ0|AJ1|AM0|AM1/` 매치 → `true`. 모두 실패 시 `false`.

③ 상수 — **모델코드 접두 패턴 `AJ0`,`AJ1`,`AM0`,`AM1`**(홈멀티 모델코드 식별용, 재현 테스트로 검증됨 — `code.test.js:448` "라이브 분기 복원"). 타입 문자열 매칭 정규식 2종.

④ 읽는 속성 — 주문/견적 항목의 section/group/kind/category/tags/model 필드(품목 원본 컬럼이 아니라 견적 항목 스냅샷).

⑤ 스키마 대응 — **[부분]** `products.model_code` 접두 패턴(`AJ0/AJ1/AM0/AM1`)이 홈멀티 여부의 보조 판별 신호로 재사용 가능 — 단, 이 함수 자체는 견적/주문 항목(estimate line) 도메인이라 products/classification 테이블 직접 대응 대상은 아님.

⑥ 기본값 — 품목 기본값 이식 대상 아님(주문 라우팅 로직). 모델코드 접두 상수만 §7 참고용으로 기록.

---

### BR-10. `normalizeEstimateConfig_` / `buildDefaultDcConfig_` / `splitVatAmount_` / `applyEstimateTotalAdjustments_` — `lib/code.js:399/444/461/471`

견적 전역 설정(DC율/VAT/카드수수료/선금할인 등) 도메인 — **품목(product) 단위가 아니라 견적(estimate) 단위 설정**이라는 점이 다른 BR과 다르다.

② 조건 → 결과 (핵심만)
- `normalizeEstimateConfig_`: raw 설정 객체를 11키 flat 구조로 정규화, 각 키는 `num/bool/str/amount` 헬퍼로 타입 강제 + 기본값 fallback.
- `buildDefaultDcConfig_`: 정규화된 설정 → legacy flat DC 설정(homeDiscount/commDiscount/showIHose/discount360/discount4way/discountStand/oneWayDiscount/deluxeDiscount/firstGradeDiscount/unitRoundTo/unitRoundMode) 11키로 재포장.
- `splitVatAmount_`: `divisor=1+vatRate`; `supply=round(abs/divisor)`; `vat=abs-supply`; 부호는 원래 금액 부호를 따름.
- `applyEstimateTotalAdjustments_`: `options.advance===true` AND `cfg.advanceDiscountRate>0` AND 기존 행에 "선금할인" 행이 없으면 → `-round(baseTotal*advanceDiscountRate)` 만큼의 조정행을 추가.

③ 상수 전부 (§0, 128~174줄에서 정의되어 이 4개 함수의 fallback 기본값으로 쓰임):
`DISCOUNT_RATE_HOME=0.45`, `DISCOUNT_RATE_COMM=0.45`, `SHOW_I_HOSE=false`, `DISCOUNT_360_AMT=0`, `DISCOUNT_4WAY_AMT=0`, `DISCOUNT_STAND_AMT=0`, `ONEWAY_DISCOUNT_AMT=0`, `DELUXE_DISCOUNT_AMT=0`, `FIRSTGRADE_DISCOUNT_AMT=0`, `UNIT_ROUND_TO=0`, `UNIT_ROUND_MODE='ROUND'`. `DEFAULT_ESTIMATE_CONFIG`: `oldProductDiscountRate=0.5`(구형 품목 기본 50% 할인), `vatRate=0.1`, `cardFeeRate=0.03`, `advanceDiscountRate=0`, `comboWarnRate=0`, `homeNoHose/homeNoBranch/homeWithFoot=false`, `homeDefaultPanel=''`, `singleDefaultWiredRemote=''`, `singleNoRemote/singleWithBase=false`, `singleDefaultPanel=''`, `singlePanelShape='원형'`, `singleDiscount/singleOneWayDiscount=0`, `singleMaterialInclusion='별도'`, `footerNotice`(4줄 안내 문구 텍스트 자산).

④ 읽는 속성 — 품목 컬럼이 아니라 견적/거래처 DC 설정 객체(외부에서 주입, `estimateConfig` 파라미터).

⑤ 스키마 대응 — **[불가: 본 조사 스키마(products/classification/bundle/quantity_sync 등)는 품목 도메인만 포함, 이 4개 함수는 estimate-config 도메인]**. 코드 주석(63~65줄)에 따르면 이미 `dc-config-service`(내부 endpoint)로 이관된 것으로 보임 — 신규 이식 대상이 아닐 가능성이 높다(§7 결정사항 3 참고).

⑥ 기본값 — 품목 단위 기본값 이식 대상 **아님**(N/A). 리터럴 상수만 기록해 둔다(추후 dc-config 도메인 조사 시 재사용).

---

### BR-11. `getHomeMulti` — `lib/code.js:744`

홈멀티(HOME_MULTI) 시트 → 카탈로그 행 배열 ETL. 캐시 키 `HM_FIX_V13`(TTL 600초).

② 조건 → 결과
- 헤더행 자동탐지: 상위 10행 중 `모델명`+`납품가`+(`품명`|`품`|`품목`) 모두 포함하는 첫 행. 못 찾으면 `hdrRow=3` 고정 fallback.
- 컬럼 별칭: 품명(`품명/품/품목/항목`), 모델명(`모델명/모델/품목코드/기종`), 납품가는 **동일 헤더명 중 마지막 열**(`idxPrices`의 마지막 인덱스) 채택.
- 필터: name/model 없으면 skip, `isBlockedByNote_(note)`(BR-5) 이면 skip.
- **`useK2 = /\$L\$2/i.test(가격셀 수식)`** — 납품가 수식이 시트 셀 `L2`를 참조하는지 여부.
- `capacity = parseKRFloat_(용량컬럼)`.
- 분류: `classifyHome_(name)`(BR-1). `disp = cls.disp || sanitizeDisp_(name)`.

③ 상수 — 캐시 키 `'HM_FIX_V13'`, TTL `600`초, 헤더 fallback 행 `3`, 컬럼 별칭 리스트(품명 4종/모델명 4종/출고가 5종), 수식 판별 정규식 `/\$L\$2/i`.

④ 읽는 시트 컬럼 — 품명, 모델명, 단위, **납품가(동명 마지막 열)**, 용량, 규격, 출고가, **고정DC**, 비고, 최대 연결 실내기 대수.

⑤ 스키마 대응 — **[표현 가능, 이미 이관 확인됨]** `db-catalog.js:multiCatalog()`(형제 파일, 실측)이 동일 shape을 DB에서 직접 만들어낸다: `price←r.deliveryPrice`(납품가), `list←r.releasePrice`(출고가), **`useK2 ← r.hasVariableDiscount===true`**, **`'고정DC' ← r.fixedDiscountRate`**, `capacity←r.capacity`, `spec←r.specText`, `note←r.remark||statusNote(r.status)`, `maxIndoor←r.maxIndoor`. 즉 `products.has_variable_discount`↔`useK2`, `products.fixed_discount_rate`↔`'고정DC'` 매핑이 **이미 실측으로 확정**되어 있다.

⑥ 기본값 — **[자동, 확정]** 위 매핑을 그대로 유지. 신규/재수입 SHEET lineage 홈멀티 품목의 `has_variable_discount`/`fixed_discount_rate` 기본값 = 시트의 납품가 수식이 `$L$2`를 참조하는지 / "고정DC" 열 원문 그대로.

---

### BR-12. `getSingleSets` — `lib/code.js:827`

싱글(중대형) 세트 시트 ETL. 캐시 키 `SS_FIX_V16`.

② 조건 → 결과
- 헤더행 탐지(상위 20행, `모델명`+`납품가`+`품명` 모두 있는 첫 행, 못 찾으면 `hdrRow=2`).
- `size = normalizeSize_(평형컬럼)`(BR-8).
- **matKey 판정**: 기본 `'D4'`, 납품가(오른쪽 열) 수식에 `/\$D\$7/` 포함 시 `'D7'`, `/\$D\$8/` 포함 시 `'D8'`.
- `catL/catM = classifySingleSetLM_({name,model})`(BR-2).
- id 조합: `name + '|' + size + '|' + sheetRow`(1-base 시트행 번호 포함).

③ 상수 — 캐시 키 `'SS_FIX_V16'`, 헤더 fallback 행 `2`, matKey 후보 `'D4'/'D7'/'D8'`, 수식 판별 정규식 `/\$D\$7/`,`/\$D\$8/`.

④ 읽는 컬럼 — 품명, 평형, 모델명, 단위, 비고, 출고가, **납품가(동명 2열 중 좌/우)**.

⑤ 스키마 대응 — **[표현 가능, 이미 이관 확인됨]** `products.set_material_key` ↔ matKey(D4/D7/D8). `db-catalog.js:singleSets()`가 `matKey: r.materialKey || 'D4'`로 동일 필드를 그대로 읽음 — 실측 확인.

⑥ 기본값 — **[자동, 확정]** `set_material_key` 기본값 = `'D4'`(레거시와 동일한 기본값), 시트 재수입 시에만 수식 분기로 `D7`/`D8` override.

---

### BR-13. `getSingleParts` — `lib/code.js:919`

싱글 구성품(컴포넌트) 시트 ETL. 캐시 키 `SP_FIX_V14`.

② 조건 → 결과: `isDefault = /기본/.test(구성품특징(feat))` — "기본" 키워드 포함 시 그 세트의 **기본 구성품**으로 표시.

③ 상수 — 캐시 키 `'SP_FIX_V14'`, 판정 정규식 `/기본/`.

④ 읽는 컬럼 — 품명, 모델명, 구분(kind), 단위, 납품가, 출고가, 세트(setModel — 소속 세트 FK), 구성품특징(feat), 규격.

⑤ 스키마 대응 — **[표현 가능]** `bundle_component.is_default` ↔ isDefault. `bundle_component.bundle_product_id`/`component_product_code` ↔ setModel/model(FK 관계). `db-catalog.js:components()`가 `isDefault: r.isDefault===true`로 이미 동일 매핑 확인.

⑥ 기본값 — **[자동, 확정]** "구성품특징"에 "기본" 포함 여부 → `bundle_component.is_default` 그대로 이식.

---

### BR-14. `getSingleMatPrices` — `lib/code.js:989`

싱글 자재가격 시트("싱글 자재가격") → `{자재명: 가격}` 맵. 캐시 없음(매 호출 재조회).

② 조건 → 결과: 2행부터 끝까지 A열=자재명, B열=가격(`parseKRNumber_`)을 그대로 키-값 맵으로.

③ 상수 — 없음(단순 2열 매핑, 하드코딩 리터럴 없음).

④ 읽는 컬럼 — "싱글 자재가격" 시트의 자재명/가격 2열.

⑤ 스키마 대응 — **[불가/확인 필요]** 제공된 스키마 요약(products/classification/bundle_component/quantity_sync_*)에는 자재가격 룩업 테이블이 없다. 단 `db-catalog.js:materialPrices()`가 `/material-prices` 내부 endpoint를 이미 호출 중 — **이미 어딘가에 이관된 테이블이 존재**하는 것으로 보이나 이번 조사 스키마 요약에는 미포함(§6 특이사항).

⑥ 기본값 — 품목(products) 테이블 기본값 이식 대상은 아님(별도 자재가격 테이블 소관). `products.set_material_key`(BR-12)가 이 맵을 조회하는 키 역할.

---

### BR-15. `getCommercialMulti` — `lib/code.js:1007`

상업멀티(COMMERCIAL_MULTI) 시트 ETL. 캐시 키 `CM_FIX_V9`. 구조는 BR-11(getHomeMulti)과 거의 동일하되, **대분류를 시트 "대분류" 컬럼값을 우선하고, 없으면 `classifyCommercial_`(BR-3)로 fallback**하는 점이 다르다(`catL = catLFromSheet || cls.catL`).

② 조건 → 결과 — BR-11과 동일(헤더탐지/컬럼별칭/isBlockedByNote_ 필터/useK2/고정DC/capacity) + 위의 대분류 우선순위 규칙.

③ 상수 — 캐시 키 `'CM_FIX_V9'`, 헤더 fallback 행 `3`, 수식 판별 `/\$L\$2/i`, 용량 컬럼 별칭에 `'용량(kW)'`,`'용량kW'` 추가(홈멀티보다 별칭 1종 더 많음).

④ 읽는 컬럼 — 품명, 모델명, 단위, 납품가, 출고가, 규격, 용량, **대분류**, 고정DC, 비고, 최대 연결 실내기 대수.

⑤ 스키마 대응 — **[표현 가능, 이미 이관 확인됨]** BR-11과 동일 매핑(`useK2`↔`has_variable_discount`, `고정DC`↔`fixed_discount_rate`) + **대분류 컬럼 우선순위 규칙**은 `products.cat_l_id`를 채울 때 "시트 원본 대분류 텍스트가 있으면 그것을 classification.name 매칭에 우선 사용, 없으면 `classifyCommercial_` 캐스케이드로 산출"로 이식 가능.

⑥ 기본값 — **[자동, 확정]** BR-11과 동일 + 대분류 우선순위 규칙 이식.

---

### BR-16. `getCommercialParts` — `lib/code.js:1097`

상업멀티 구성품 ETL. 캐시 키 `CP_FIX_V9`. 구조는 BR-13(getSingleParts)과 거의 동일하되:
- `isDefault = /기본/.test(구분(kind))` — **BR-13은 "구성품특징"에서, 이 함수는 "구분" 컬럼에서** 판정(컬럼이 다름, 규칙은 동일 키워드).
- `isBlockedByNote_(spec)` — **note가 아니라 "규격/비고"(spec) 컬럼**을 note 대용으로 검사(BR-5 재사용, 입력 컬럼만 다름).
- `qty`(수량) 컬럼을 문자열 그대로 보존(`row[idxQty] || '1'`) — **단, 이 qty 는 "구성품 1세트당 기본 수량"이며 개발책임자 확정 규칙의 "수량동기화 설정값"과는 다른 층위**(세트 분해 시 고정 구성비, 견적 화면의 사용자 조정 수량이 아님).

③ 상수 — 캐시 키 `'CP_FIX_V9'`, 판정 정규식 `/기본/`, 기본 수량 리터럴 `'1'`.

④ 읽는 컬럼 — 품명, 모델명, 구분(kind), 단위, 세트(setModel), 규격/비고, 출고가, 납품가, **수량**.

⑤ 스키마 대응 — **[표현 가능]** `bundle_component.is_default`↔isDefault, `bundle_component.default_qty`↔qty(문자열→수치 캐스팅 필요), `bundle_component.bundle_product_id/component_product_code`↔setModel/model.

⑥ 기본값 — **[자동, 확정]** `db-catalog.js:components()`가 `isDefault: r.isDefault===true`, `qty: r.defaultQty==null?'1':String(r.defaultQty)`로 이미 동일 매핑 확인. `bundle_component.default_qty` 기본값 = 이 시트의 "수량" 컬럼 원문(정수 캐스팅), 없으면 `1`.

> ⚠️ **개발책임자 수량규칙과의 경계 명시**: 이 `default_qty`는 "세트 1개를 분해했을 때 구성품이 몇 개 들어가는가"(고정 BOM 비율)이며, "40HP는 2개로 설정" 같은 **품목 간 수량동기화 규칙**(quantity_sync_rule/source/target)과는 다른 개념이다. 후자는 code.js 1~1400 범위에 존재하지 않는다(§1 참조).

---

### BR-17. `getOldProducts_` — `lib/code.js:1176`

구형(단종/대체) "구형" 시트 ETL. 캐시 없음.

② 조건 → 결과: A열(name) 없으면 skip. **`isDisc = F열(0-idx 5) 수식에 '$I$1' 포함 여부`** — 구형 품목이 할인 대상(대체품 기준액 연동)인지 판정.

③ 상수 — 수식 참조 리터럴 `'$I$1'`(문자열 포함 검사, 정규식 아님).

④ 읽는 컬럼 — A=품명, B=모델명, C=단위, D=price(출고가/할인기준액), F=수식(할인 판정용, 표시값은 F=sheetPrice/납품가), H=비고(remarks), I=규격(spec). *(0-index 기준 A=0,B=1,C=2,D=3,F=5,H=7,I=8)*

⑤ 스키마 대응 — **[표현 가능, 이관 확인됨]** `db-catalog.js:oldProducts()`가 `isDisc ← r.legacyDiscountFlag===true`, `price←r.releasePrice`, `sheetPrice←r.deliveryPrice`로 이미 매핑 중. 다만 `isDisc`가 `products`의 어느 컬럼(discount_flags 내부 키?)에 대응하는지는 제공된 스키마 요약만으로 단정 불가(§7 결정사항 2).

⑥ 기본값 — **[부분 자동]** `estimate_category='LEGACY'`(구형) 품목의 `release_price`/`delivery_price`는 자동 매핑 가능. `isDisc`(할인 대상 플래그)의 저장 위치만 🚩결정 필요.

---

### BR-18. `getHomeDefaults` / `getSingleDefaults` — `lib/code.js:1215` / `:1256`

estimate-config 도메인(BR-10과 동일 계열) — 홈멀티/싱글 섹션별 **견적서 상단 기본 옵션**(품목이 아니라 견적 화면의 초기 체크박스/셀렉트 상태). `estimateConfig` 파라미터가 주어지면 그것을 정규화해 반환(신규 DB 경로), 없으면 시트 1~2행을 직접 읽어 파싱(레거시 경로) — **두 경로가 동일 shape로 병존**.

② 조건 → 결과(시트 경로 기준) — `pick(label, default)`: 시트 헤더행에서 label 위치를 찾아 값이 `true/TRUE/1/예/Y`→true, `false/FALSE/0/아니오/N`→false, 그 외 원문 그대로.
- 홈: `'유연호스 제외'`,`'분기관 제외'`,`'발통포함'`,`'리모컨'(항상 '선택 안함' 고정)`,`'판넬변경'`.
- 싱글: `'유선리모컨'`,`'리모컨 제외'`,`'실외기 받침대 포함'`,`'판넬변경'`,`'360판넬'(기본 '원형')`,`'할인'`,`'1WAY할인'`,`'자재 포함 여부'(기본 '별도')`.

③ 상수 — 불리언 파싱 정규식 `/^(true|TRUE|1|예|Y)$/i`,`/^(false|FALSE|0|아니오|N)$/i`. 리터럴 기본값: `'선택 안함'`(홈 리모컨 고정값 — 사용자가 못 바꾸는 하드코딩), `'원형'`(360판넬 기본), `'별도'`(자재 포함 여부 기본).

④ 읽는 컬럼 — 시트 1~2행(라벨행/값행) 24열, 라벨 매칭.

⑤ 스키마 대응 — **[불가: estimate-config 도메인, BR-10과 동일 사유]**. 품목 스키마 대상 아님.

⑥ 기본값 — N/A(품목 기본값 아님). 단 `'리모컨'` 필드가 시트에서 값을 읽어오지 않고 **항상 `'선택 안함'`으로 하드코딩**되어 있다는 점은 legacy 동작 재현 시 놓치기 쉬운 디테일이라 기록해 둔다.

---

### BR-19. `getRecommendOduData` — `lib/code.js:1303`

"추천실외기" 시트 → `{comm, home, homeEx}` 3개 배열(용량↔HP 매핑 테이블).

② 조건 → 결과: 3행부터 끝까지, A열(0)≠''→comm에 `{cap:A, hp:B}` push, C열(2)≠''→home에 `{cap:C, hp:E}` push, D열(3)≠''→homeEx에 `{cap:D, hp:E}` push (E열(4)이 hp 공통열).

③ 상수 — 없음(순수 컬럼 위치 매핑, 시작행 `3`).

④ 읽는 컬럼 — A~E 5개 열(상업/홈/홈확장 각각의 용량 + 공통 HP).

⑤ 스키마 대응 — **[불가: 조회용 룩업 테이블, 제공 스키마에 없음]**. `db-catalog.js:recommendOduData()`가 `/odu-recommendations` endpoint로 이미 이관 확인(`recommendationType` enum: `MULTI_HEATING_COOLING`/`HOME_MULTI`). `homeEx`는 아직 분리 안 되어 `home`과 동일값 반환 중(기존 구현자가 주석으로 이미 인지한 TODO — 결정 불필요, §6 참고).

⑥ 기본값 — 품목 기본값 이식 대상 아님(추천 로직용 참조 테이블). 이미 이관 확인되어 결정 불필요.

---

### BR-20. `getSpecDetailMap_` — `lib/code.js:1381`

모델별 상세 spec(성능/전력/포장 등) 맵. 캐시 키 `SPEC_DETAIL_MAP_V10`. 홈/싱글/상업 3개 시트를 각각 다른 규칙으로 스캔(`scanHome`/`scanSingle`/`scanComm` — 함수 본문이 1400줄 경계를 넘어가 다음 조사자 범위에 이어짐. 여기서는 **내가 읽은 1381~1400줄 안의 공통 헤더-탐지 로직**만 기술).

② 조건 → 결과(범위 내 공통 헬퍼) — `normH`: 공백 제거 트림. `findHeaderRow`: 상위 10행 중 `모델명`/`모델`/`품목코드` 중 하나라도 있는 첫 행. `idx(H, labels)`: 라벨 후보 배열을 순서대로 찾아 첫 매치 인덱스 반환(별칭 매칭, `findIdx_`와 유사하나 이 함수 전용 로컬 구현).

③ 상수(범위 내) — 헤더 탐지 라벨 후보 `['모델명','모델','품목코드']`.

④ 읽는 컬럼 — "모델명"류 헤더(구체적 spec 필드는 1400줄 이후에 이어짐 — 배관경/냉방성능/소비전력/에너지소비효율/냉매가스/차단기/전원선/제품크기 등, code-2 범위에서 상세 기술 예정).

⑤ 스키마 대응 — **[불가/확인 필요]** 제공된 스키마 요약에 spec-detail 저장 테이블이 없다. `db-catalog.js:specDetailMap()`이 `/spec-detail-map` endpoint로 이관 확인(shape 유지) — 어딘가 이미 존재.

⑥ 기본값 — 품목 기본값 이식 대상은 아님(파생 조회 맵). `getSpecDetailMap_` 자체는 **살아있음**(`code.js:1912` bootstrap에서 직접 호출, `calc-fidelity.test.js`에 4개 behavior 테스트 존재) — dead_code 아님.

---

## 4. dead_code 판정 근거 (grep 전수, 명령/결과 원문)

> 방법: `clients/web/estimate-app` 디렉터리 전체(코드/테스트/EJS/스크립트/routes)를 대상으로 각 함수명을 grep. "정의/주석/export나열/76함수 존재검사 테스트" 외의 **실행 호출부**가 있는지 확인. RPC 동적 디스패치(`routes/rpc.js:30 const fn = code[fnName]`)가 있어 `views/index.ejs`의 `google.script.run.<함수명>` 리터럴 문자열 호출도 함께 확인(문자열 참조 포함 전수).

### §4-1. `toYmd_`/`toMmDd_`/`todayYMD_`/`_normSpec_` — 순수 유틸, 호출부 0건

```
grep -rn "toYmd_|toMmDd_|todayYMD_" clients/web/estimate-app
→ code.js:23-24(주석 인벤토리 나열), code.js:246/254/270(정의),
  code.js:2810(export 나열), test/code.test.js:689(76함수 존재검사 나열)
  ※ 실행 호출(괄호 포함 invocation) 0건, 어떤 test 도 이 3개 함수의 "동작"을 검증하지 않음
```
```
grep -rn "_normSpec_" clients/web/estimate-app  → code.js:274(정의) 단 1건.
grep -rn "_normSpec_\(" clients/web/estimate-app → 위와 동일 1건(자기 정의문뿐)
```
`_normSpec_`는 export조차 없이(export 목록엔 있으나 참조 0) 정의만 존재 — legacy에서 spec 텍스트 비교용으로 쓰였을 것으로 추정되나 현재 이식본에는 비교 대상 코드 자체가 없다.

### §4-2. `normalizeTel_` — 단위테스트는 있으나 런타임 호출 0건

```
grep -rn "normalizeTel_" clients/web/estimate-app
→ code.js:262(정의), code.js:2810(export), test/calc-fidelity.test.js:497-500(직접 함수호출 — 단, 테스트 파일 자체 호출이며 앱 런타임 경로 아님), test/code.test.js:689(존재검사)
```
전화번호 포맷 규칙(010 11자리/10자리 대시 포맷)은 존재하지만 거래처/담당자 전화번호 표시 경로 어디에서도 호출되지 않는다. 품목 스키마와 무관한 도메인(고객 정보)이라 리스크는 낮다.

### §4-3. `isSoldOutByNote_` — 서버측 호출 0건, 클라이언트에 동일 규칙 독립 구현 존재

```
grep -rn "isSoldOutByNote_" clients/web/estimate-app
→ code.js:25(주석), 313(정의), 2812(export), test/code.test.js:691(존재검사) — 실행 호출 0건
grep -n "isSoldOutByNote_|품절" clients/web/estimate-app/views/index.ejs
→ 3150-3151: function getStockState_(note){ ... if (/품절/.test(s)) return {type:'SOLD'}; ... }
```
**동일한 `/품절/` 정규식 규칙이 `views/index.ejs:3148 getStockState_()`에 독립적으로 재구현**되어 있다(다른 에이전트 범위이므로 그 함수 자체는 내 분류 대상 아님). 즉 "품절" 판정 로직 자체는 소실되지 않았고, code.js 안의 쌍둥이 함수만 미사용이다. → **업무규칙 손실 없음**을 확인한 뒤 dead_code 판정.

### §4-4. `findHeaderIndex_` — `findIdx_`로 완전 대체, 호출부 0건

```
grep -rn "findHeaderIndex_" clients/web/estimate-app
→ code.js:26(주석), 325(정의), 2813(export), test/code.test.js:692(존재검사) — 실행 호출 0건
```
단일 key 검색 버전(`findHeaderIndex_`)이며, 배열 별칭 검색 버전(`findIdx_`, 여러 후보 라벨 동시 지원)이 모든 ETL 함수에서 실사용 중. 기능적으로 `findIdx_(headers, [key])`가 완전히 상위호환이라 정보 손실 없음.

### §4-5. `extractRowsFromFormula_` — 자기 테스트만 호출, 앱 경로 0건

```
grep -rn "extractRowsFromFormula_" clients/web/estimate-app
→ code.js:26(주석),336(정의),2814(export), test/code.test.js:693(존재검사),
  test/calc-fidelity.test.js:492-494(직접 함수호출 — 단위테스트 한정)
```
"싱글 세트" 시트를 수식으로 역참조하는 행 추출 로직(`'싱글 세트(?:_단가인상)?'!\$?[A-Z]\$?(\d+)`)이나, 현재 구조에서는 `bundle_component.bundle_product_id` FK로 세트↔구성품 관계가 직접 표현되어 수식 역참조가 필요 없다 → 스키마 이관 시 이 파싱 자체가 불필요(구조적으로 대체됨).

### §4-6. `formatWonDiscountLabel_`/`formatPercentLabel_`/`combineRemarks_` — 순수 표시 포맷터, 호출부 0건

```
grep -rn "formatWonDiscountLabel_|formatPercentLabel_|combineRemarks_" clients/web/estimate-app
→ code.js 정의 3건 + 주석 1 + export 1, test/calc-fidelity.test.js(자기 단위테스트 4건), test/code.test.js(존재검사 1건)
grep -rn "...같은 패턴..." lib/slip-bridge.js / routes/ → 0건
grep -n "만\$\{|\}만|천\`|만천" views/index.ejs → 0건(동등 클라이언트 구현도 없음)
```
세 함수 모두 **이미 계산된 값을 문자열로 예쁘게 포맷**만 할 뿐 가격/수량/분류를 결정하지 않는다 — 설령 판정이 틀렸어도 업무규칙 손실 위험은 사실상 없음(포맷 규칙 자체는 §3에 기록해 두었으니 필요 시 그대로 부활 가능).

### §4-7. `getSpecMap_` — 호출부 0건, 문서상 "단일 진실원" 선언과 실제 불일치

```
grep -rn "getSpecMap_\(\)" clients/web/estimate-app → 0건
grep -n "getSpecMap_" routes/*.js views/index.ejs test/*.js → routes: 0건, index.ejs: 0건,
  test/code.test.js:695(존재검사만, 동작 테스트 없음)
```
`code.js:2779` 주석은 "§3의 getSpecMap_() 시트 직접 read 버전이 단일 진실원"이라 선언하지만 실제로는 **아무도 호출하지 않는다**. 대신 `getSpecDetailMap_`(BR-20, 살아있음)이 모델→규격 정보를 더 풍부하게 제공하며 `code.js:1912`(bootstrap)에서 실호출된다. 문서(주석)와 실측(grep)이 어긋나는 사례라 §6에 별도 기록.

---

## 5. infra_util 판정 근거 (간략)

`_msGet`/`_msPost`(HTTP 래퍼), `cachePutJSON_`/`cacheGetJSON_`/`cacheRemoveJSON_`(캐시 청크 분할 저장/조회/삭제), `findIdx_`(범용 헤더 별칭 탐색), `parseKRNumber_`/`parseKRFloat_`(한국어 숫자 문자열 파싱) — 8건 모두 **특정 임계값·비율·분류 리터럴을 갖지 않는 범용 알고리즘**이며 여러 ETL 함수(BR-11~17)에서 실사용 확인됨(호출부 다수, 위험 없음). 업무규칙이 아니라 파싱/전송/캐싱 인프라이므로 스키마 이식 대상이 아니다.

---

## 6. 특이사항 (notable, 결정 불필요 — 기록용)

1. **`useK2`/`고정DC` 매핑이 이미 확정되어 있다** — `lib/db-catalog.js:82,87`이 `useK2: r.hasVariableDiscount===true`, `'고정DC': r.fixedDiscountRate==null?'':String(r.fixedDiscountRate)`로 구현 중. `products.has_variable_discount`/`products.fixed_discount_rate` 매핑은 실측으로 확정된 사실이며 재논의 불필요.
2. **classification 로직은 "recompute-on-read"** — `db-catalog.js` 주석(11~13줄): "분류(catL/M/S)·표시명(disp)·matKey·useK2 등 파생값은 legacy 와 동일하게 응답 데이터를 기반으로 본 모듈(또는 호출자가 주입한 classifier)이 재계산한다 — DB 는 raw 단가/단위/규격/변동DC 분기만 보유하고, 분류 로직은 estimate-app 의 단일 진실원(code.js)을 따른다." 즉 **`classifyHome_`/`classifySingleSetLM_`/`classifyCommercial_`이 지금도 분류의 유일한 정본**이며 `classification`/`products.cat_*_id` 값이 이 캐스케이드의 출력과 실제로 일치하는지는 별도 대사(reconciliation)가 필요할 수 있다(내 범위 밖의 DB 조회 실측 필요 — PM 판단 권장).
3. **`products.capacity` 컬럼 존재 추정** — `db-catalog.js:83` `capacity: numOrNull(r.capacity)`을 이미 사용 중인데, 이번 조사에 주어진 스키마 요약(products 컬럼 목록)에는 `capacity`가 없다. 실외기 "용량" 컬럼(BR-11/15에서 직접 읽음)이 어디 저장되는지 스키마 요약 누락 가능성 — 재조사 대상은 아니나 PM 확인 권장.
4. **`getSingleMatPrices`/`getRecommendOduData`/`getSpecDetailMap_`는 이미 전용 endpoint로 이관 확인**(`/material-prices`, `/odu-recommendations`, `/spec-detail-map`) — 별도 결정 불필요, 이미 해결됨.
5. **`getRecommendOduData`의 `homeEx` 미분리**는 `db-catalog.js:183-184` 주석에 기존 구현자가 이미 인지한 TODO로 기록되어 있다("분리 필요 시 엔티티 확장 후속") — 신규 결정 아님.
6. **`getSpecMap_`의 주석-실측 불일치**(§4-7) — "단일 진실원"이라 문서화되어 있으나 실제 호출부 0건. 코드 정리 시 참고.

---

## 7. 결정 필요 사항 (decisions_needed)

### 결정 1 — "품절"(SOLD_OUT) 상태를 정적 컬럼으로 저장할지, 표시 시점 신호로만 둘지

- **레거시 동작**: `isBlockedByNote_`(미판매/단종)은 카탈로그에서 **완전 제외**하는 반면, `isSoldOutByNote_`(품절)는 **노출은 유지하되 품절 표시**만 하는 별개 규칙이다. 그런데 서버측 `isSoldOutByNote_`는 현재 미사용(dead code, §4-3)이고 동일 규칙이 `views/index.ejs`에 독립 구현되어 있다.
- **후보안**:
  1. `products.status`에 `SOLD_OUT` 값을 추가해 정적으로 저장.
  2. 정적 컬럼 없이 `inventory_qty_mgmt=true` 품목만 실시간 재고 API로 판정(현재 index.ejs 방식과 유사).
  3. 비고(remark) 텍스트를 그대로 보존해 화면에서 매번 정규식 재판정(레거시와 동일, 서버 role 없음).
- **권장**: 3안 — 현재도 프론트가 독립적으로 동일 정규식을 재판정 중이므로 서버측에 새 상태값을 추가하지 않아도 기능 손실이 없다. 다만 "품절"이 재고관리 도메인과 어떻게 연결될지는 다른 트랙(재고)의 설계와 맞물려 있어 확정이 필요하다.

### 결정 2 — 구형(LEGACY) 품목 `isDisc`(할인 대상 플래그)를 `discount_flags`의 어느 키로 저장할지

- **레거시 동작**: `getOldProducts_`가 "구형" 시트 F열 수식에 `$I$1` 참조가 있으면 `isDisc=true`(해당 구형 품목이 대체품 기준액과 연동된 할인 대상임을 의미).
- **레거시 값**: `db-catalog.js:134`가 이미 `isDisc: r.legacyDiscountFlag===true`로 매핑 중 — 즉 다운스트림에 대응 컬럼이 이미 존재하는 것으로 보이나, 제공된 스키마 요약(`discount_flags` jsonb의 키 목록 미상)만으로는 정확한 저장 위치를 단정할 수 없다.
- **후보안**: (a) `discount_flags: {legacyDiscount: true}` 같은 jsonb 키로 저장 (b) 기존 `has_variable_discount`를 재사용(의미 충돌 우려 — useK2와 다른 개념) (c) 전용 컬럼 신설.
- **권장**: (a) — 이미 `legacyDiscountFlag`라는 필드명이 살아있으므로 `discount_flags.legacyDiscount` 키로 맞추는 것이 최소 변경. 다만 `discount_flags`의 기존 키 스펙을 PM이 확인해줘야 충돌 여부를 확정할 수 있다.

### 결정 3 — estimate-config 전역 상수(DC율 0.45/VAT 10%/카드수수료 3%/구형할인 50% 등, BR-10)의 스키마 소속

- **레거시 동작**: `DEFAULT_ESTIMATE_CONFIG`가 코드에 하드코딩된 fallback이며, 코드 주석(63~65줄)은 이미 `dc-config-service`로 이관되었다고 명시한다.
- **질문**: 이 값들이 이미 dc-config-service DB에 살아있어 "이관 완료·재작업 불필요"인지, 아니면 이번 품목 스키마 조사와 별개로 dc-config 도메인도 전수조사 대상에 포함해야 하는지.
- **권장**: 이관 완료로 간주하고 이번 라운드에서는 제외(품목 스키마 범위 밖) — 단, PM이 dc-config-service 스키마를 이미 별도 트랙에서 다루고 있는지만 확인 필요.

---

## 부록 — 참고용으로 읽었으나 분류 대상이 아닌 파일

- `clients/web/estimate-app/lib/db-catalog.js`(형제 파일, 260줄) — 본 조사의 여러 매핑을 **실측으로 확정**하는 데 결정적 근거가 되어 전문을 읽었다. 분류/줄번호 배정은 다른 조사 라운드(있다면) 소관.
- `clients/web/estimate-app/views/index.ejs` — `unifyCatL_`/`getStockState_` 등 클라이언트측 중복 구현 확인용으로 grep만 수행(전문 미독). 분류 대상 아님(다른 에이전트 범위).
