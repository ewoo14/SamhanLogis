# GAS 전수조사 v2 — 원본 견적·주문 정본 2개 프로젝트

> 조사일: 2026-08-11  
> 역할: CODEX SOL 5.6 · 레거시 GAS 법칙 조사자  
> 변경 범위: 이 보고서만 작성. 원본/포팅 코드·테스트·스키마·마이그레이션·git 무변경.

## 1. 완결성 선언

```text
배정 함수 수  993
분류 함수 수  993
  ├ 업무규칙(이식 대상)  395
  ├ UI·표시 전용         364
  ├ 인프라·유틸          234
  └ 데드코드               0

395 + 364 + 234 + 0 = 993
```

고정 분모는 `docs/dev-reports/2026-08-11-gas-function-inventory-v2.md`의 9개 추출 패턴 결과만 사용했다. 파일별 대조는 다음과 같다.

| 프로젝트/파일 | 배정 | 업무규칙 | UI·표시 | 인프라·유틸 | dead |
|---|---:|---:|---:|---:|---:|
| 거래처 발송 주문서/Code.js | 116 | 36 | 0 | 80 | 0 |
| 거래처 발송 주문서/index.html | 302 | 142 | 133 | 27 | 0 |
| 거래처 발송 주문서/기간별 비빌번호 재설정/Code.js | 3 | 0 | 0 | 3 | 0 |
| 거래처 발송 주문서/장기미발주 거래처 선별/Code.js | 5 | 5 | 0 | 0 | 0 |
| 종합견적서/Code.js | 109 | 33 | 0 | 76 | 0 |
| 종합견적서/index.html | 458 | 179 | 231 | 48 | 0 |
| **합계** | **993** | **395** | **364** | **234** | **0** |

분류 원칙은 함수명만이 아니라 정의 본문과 호출 축을 함께 보는 것이다. 금액·수량·출고품목·할인·분류·기본값·검증·전송 payload를 바꾸면 업무규칙, DOM 렌더·모달·내비게이션·필터 표시만 바꾸면 UI, 캐시·인증·주소 API·파싱·이스케이프·날짜·로깅이면 인프라·유틸로 두었다. 이름/HP에서 수량을 유도하는 함수는 개발책임자 확정 원칙에 따라 **레거시 사실은 업무규칙으로 기록하되 이식안은 정규식이 아니라 `quantity_sync_*` 설정값**으로 판정했다.

### 1.1 dead_code 판정 감사

다음 축을 모두 검색했다.

```text
rg -n "google\.script\.run|doGet\s*\(|doPost\s*\(|onOpen\s*\(|onEdit\s*\(|ScriptApp|newTrigger|createMenu|addItem|onclick=|onchange=|oninput=|onsubmit=" \
  tools/legacy-gas/종합견적서 tools/legacy-gas/거래처\ 발송\ 주문서
```

결과:

- 웹 앱 진입점 `doGet`: 견적 `Code.js:6`, 주문 `Code.js:2`.
- HTML → GAS RPC: 견적 `index.html:8799, 8899, 10310, 13198, 13538, 14262, 14853, 15614, 15662, 15802, 16079, 17007, 17046, 17315` 등, 주문 `index.html`의 `google.script.run` 호출들 확인.
- HTML 인라인 진입: `onclick`, `onchange`, `oninput`으로 공개 함수가 광범위하게 등록되어 있어 단순 텍스트 호출 횟수 1은 미호출 증거가 아니다.
- 시간 기반 진입 후보: `rotatePasswordsMonthly`, `processLongTermUnusedClientsFast`. 두 보조 프로젝트의 `appsscript.json`도 읽었고 명시적 선언은 없지만 설치형/시간 트리거는 manifest에 함수명을 남기지 않으므로 살아 있는 진입점으로 보았다.
- `onOpen`, `onEdit`, `doPost`, 코드 내 `ScriptApp.newTrigger`, 커스텀 메뉴 등록은 지정 범위에서 검출되지 않았다.
- 동일 이름의 함수 선언과 `window.<name> = function`은 로드 순서별 공개 래퍼/재정의 가능성이 있어 dead로 단정하지 않았다.

따라서 **실행 불가능이 증명된 함수는 0개**다. 호출이 불분명한 함수는 지시대로 dead가 아니라 본문 성격에 따라 업무규칙/UI/인프라에 보수적으로 넣었다.

## 2. 원본 Google Sheet 입력 축

### 2.1 시트와 범위

| 시트 | 원본 좌표 | 읽는 범위/열 | 정규화 목적지 |
|---|---|---|---|
| `홈멀티_단가인상` | 견적 `Code.js:49-54,364-444`; 주문 `Code.js:70-78,631-710` | 동적 헤더: 품명/품/품목/항목, 모델명/모델/품목코드/기종, 단위, 마지막 납품가, 용량, 규격, 출고가/LIST/리스트/정가/소비자가, 고정DC, 비고, 최대 연결 실내기 대수; 납품가 수식의 `$L$2` | `products.model_*`, `unit`, `release_price`, `delivery_price`, `fixed_discount_rate`, `status`, 분류/속성, 연결 제한은 별도 정책 필요 |
| `싱글 세트_단가인상` | 견적 `Code.js:488-587`; 주문 `Code.js:753-846` | 품명, 평형, 모델명, 단위, 비고, 출고가, 좌/우 납품가; 우측 납품가 수식 `$D$7/$D$8` | `products` BUNDLE, `pyong_size`, `set_material_key`, 가격·상태 |
| `싱글 구성품_단가인상` | 견적 `Code.js:600-669`; 주문 `Code.js:859-912` | 품명, 모델명, 구분, 단위, 마지막 납품가, 출고가, 세트, 구성품특징/특징, 규격 | `bundle_component` + 구성품 `products`; `기본` → `is_default=true` |
| `싱글 자재가격` | 견적 `Code.js:673-680`; 주문 `Code.js:915-923` | A2:B끝 = 이름, 가격 | 구성품 가격. 이름 키만 있으므로 모델코드 매핑 실패 행은 결정/정제 큐 |
| `상업멀티_단가인상` | 견적 `Code.js:768-862`; 주문 `Code.js:1010-1101` | 홈과 유사한 동적 헤더 + 분류·능력·최대연결 | `products` + 분류/속성/가격 |
| `상업멀티 구성_단가인상` | 견적 `Code.js:863-944`; 주문 `Code.js:1102-1184` | 세트, 구성품, 모델, 구분, 단위, 수량, 가격, 특징, 규격 | `bundle_component.component_product_code/default_qty/qty_mode/component_kind/component_variant/is_default/spec_text` |
| `추천실외기` | 견적 `Code.js:1610-1636` | `A3:E끝`: 구분, 최소, 최대, 모델, 비고 | 추천 규칙 테이블이 현재 제시 스키마에 없음 → [불가] |
| `구형` | 견적 `Code.js:1719-1759`; 주문 `Code.js:1911-1953` | `A2:I끝`; A 품명, B 모델, C 단위, D 출고가, F 납품가, H 적요, I 규격; F 수식의 `$I$1` | `products`, 가격, 규격. 수식 기반 할인 여부는 `fixed_discount_*`/`has_variable_discount`로 부분 표현 |
| `홈멀티/상업멀티/상업멀티 구성/싱글 세트/싱글 구성품` | 견적 `Code.js:2944-3013` | 인상 전 모델별 출고가/납품가 | 단일 `release_price/delivery_price`만으로 현재가+인상전가 동시 보존 불가 → 가격 이력 필요 |
| `거래처`, `담당자` | 양쪽 Code.js | 동적 헤더 전체 | product 스키마 밖 partner/user 도메인 |

### 2.2 품목 속성 기본값 판정

| 레거시 입력/판정 | 견적품목 기본값 | 스키마 판정 |
|---|---|---|
| 모델/품명 | 시트 값 그대로 | [표현 가능] `products.model_code/model_name` |
| 시트 원천 | 해당 정본 시트에서 온 행은 `SHEET` | [표현 가능] `products.lineage` |
| 홈/싱글/상업/구형 섹션 | 각각 견적 카테고리 노출 자동 생성 | [표현 가능] `estimate_category` + `product_estimate_exposure` |
| 품명 정규식 분류 | 분류가 유일할 때 자동; 충돌/무매칭은 `classification_manual=false` 상태로 검수 큐 | [부분] `cat_l/m/s_id`, `classification_manual`; 이름 파서 자체는 런타임 법칙으로 이식하지 말고 1회 seed 보조로만 사용 |
| `비고`에 `미판매|단종` | 견적 미노출/비활성 | [부분] `status`; `단종`과 `미판매`의 서로 다른 상태값 매핑은 제품 상태 enum 결정 필요 |
| `비고`에 `품절` | 품절 표시 | [부분] `status`; 날짜 예정과 동시 표현하려면 상태 이력/입고예정일 필요 |
| `고정DC` | 숫자/퍼센트 정규화 후 품목 override | [표현 가능] `fixed_discount_rate`, `fixed_discount_manual`, `has_variable_discount`, `discount_flags` |
| 세트 수식 `$D$7/$D$8`, 기본은 D4 | 각각 `set_material_key=D7/D8/D4` | [표현 가능] `products.set_material_key` |
| 구성품 특징 `기본` | `is_default=true`; 그 외 false | [표현 가능] `bundle_component.is_default` |
| 구성품 수량 | 시트의 명시 수량만 `default_qty`; 이름·HP 추론 금지 | [표현 가능] `bundle_component.default_qty/qty_mode`; 동적 연동은 `quantity_sync_*` |
| 단위 누락 | 세트 `SET`, 구성품 `EA` | [표현 가능] `products.unit`; 단, 원본 누락을 자동 보정한 값임을 별도 provenance로 남길 컬럼은 없음 |
| 가격 누락 | 레거시처럼 0 | [표현 가능] 가격 컬럼. 다만 0=무료와 미정 구별 불가 → 결정 필요 |

## 3. 공통 이식 판정

### 3.1 바로 표현 가능한 법칙

- 품목 identity/분류/노출/상태/단위/평형/패널/리모컨/가격/고정DC: `products`, `classification`, `product_estimate_exposure`.
- 세트 구성과 기본 구성품: `products.product_type=BUNDLE`, `bundle_component`.
- 본체 수량에 따른 부자재 수량: `quantity_sync_rule/source/target`. 이름·HP·구성품 이름 파서는 이 테이블을 만드는 조사 도구일 뿐 런타임 이식 대상이 아니다.
- 거래처별 DC는 제시된 product 스키마가 아니라 partner/estimate 정책 도메인에 두어야 한다. `products.fixed_discount_rate`는 품목 고정값이지 거래처 override가 아니다.

### 3.2 부분 또는 불가

| 법칙 | 판정 | 빠진 것 |
|---|---|---|
| 인상 전/후 가격 전환 | [부분] | `release_price/delivery_price` 한 벌뿐. effective date와 가격 버전/variant가 필요 |
| 최대 연결 실내기 수와 103%/120% 조합률 | [불가] | 본체별 max count/capacity 및 조합률 정책 테이블 |
| 추천실외기 최소~최대 구간 | [불가] | 추천 source/target, min/max, home/homeEx/comm 구분 테이블 |
| 창고코드 `2`/`00003` 선택 | [불가] | 주문 출고정책/창고 라우팅 규칙 테이블 |
| 카드 3%, 절삭 단위, 보너스 DC 구간 | [불가] | 견적/거래처 가격정책 테이블. product 고정DC에 넣으면 범위가 틀림 |
| 주문 태그·월요일/30일 장기미발주 | [불가] | order/partner workflow policy와 상태 변경 이력 |
| 구형 F 수식 `$I$1` 의미 | [부분] | `has_variable_discount`로 결과는 표현되나 원본 수식 provenance 없음 |

## 4. 업무규칙 상세 — 공통 규칙군

아래 규칙군은 §8의 **395개 함수별 레지스터**가 참조한다. 레지스터의 각 함수는 좌표·상수/리터럴·시트 축·포팅본 존재 여부를 개별 기재하고, 조건→결과·스키마·기본값·동작축은 이 절의 규칙군을 적용한다.

### R01. 품목 분류·노출·상태

대표 함수: `classifyHome_`, `classifySingleSetLM_`, `classifyCommercial_`, `unifyCatL_`, `getStockState_`, `isBlockedByNote_`, `isSoldOutByNote_`, `classifySingleSetFixed`, `normalizeHomeCategory`, `normalizeCommCategory`, `fixCommMidCategory`.

| 조건 | 결과 |
|---|---|
| 비고에서 공백 제거 후 `미판매|단종` 포함 | 카탈로그 행 제외 |
| 비고에 `품절` | `SOLD` 표시 |
| 비고에 `YYMMDD`이고 오늘보다 미래 | `MM.DD 예정` |
| 홈 이름이 실외기/실내기/판넬/리모컨/분기관/호스/받침대/전열교환기/인테리어핏/제습기 패턴 | L/M/S 및 표시명 결정 |
| 싱글 이름+모델에 `360/4way/1way/덕트/실링/스탠드/벽걸이/가정용` | L 결정; `프레스티지/프리미엄/디럭스/1등급/냉방전용/냉난방/무풍/유풍/갤러리/비스포크`로 M 결정 |
| 상업 모델 `AM...X` | 실외기; `AM...N` | 실내기 |
| L=`부자재2` | `부자재`로 통일 |

상수/리터럴은 위 패턴 문자열 전부와 모델 정규식 `AM\d{3}A[XVH]`, `AM\d{3}(BN|CN|PB|PH|PN)`, 상태 `SOLD/FUTURE/OK`, 날짜 기준 `2000+YY`다. 읽는 축은 품명·모델명·비고·분류·평형·규격이다. [표현 가능] `products.status`, `cat_l/m/s_id`, `panel_type`, `remote_type`, `pyong_size`, `classification_manual`, `product_estimate_exposure`. **[자동]** 시트에서 명시된 분류/속성이 우선이고, 정규식은 비어 있는 행의 1회 seed 후보만 생성한다. 여러 분류가 맞거나 기본 분기 `부자재/기타`로 떨어지면 자동 확정하지 않는다. 포팅본은 같은 함수가 존재하며 이름 기반 동작이 대체로 같다. 차이는 런타임 데이터가 DB catalog로 바뀌어 이미 정규화된 필드가 우선될 수 있다는 점이다.

### R02. 가격·DC·단위처리

대표 함수: `getBaseListPrice`, `getReal*Price`, `homeUnitPrice`, `partUnitPrice`, `singleUnitPrice`, `commUnitPrice`, `getRealListPrice`, `parseFixedDc`, `adjustSingleSetBasePrice`, `analyzeSingleSetDiscountFlags`, `applyHomeMultiPriceVat`, `splitIndoorOutdoorToK`, `roundK`, `roundByConfig`, `applyConfigFromServer`, `applyCustomerDiscounts`, `buildDefaultDcConfig_`, `fetchNotionDcConfig_`, `getAllNotionDcConfigs_`.

| 조건 | 결과 |
|---|---|
| 인상가 체크 + 모델별 인상가 있음 | 인상가 사용, 아니면 기본 출고가 |
| 수동 단가/출고가 맵에 모델 있음 | 수동값 최우선 |
| 고정DC 숫자 >1 또는 `%` | 100으로 나눔; 최종 `[0,0.99]` clamp |
| 거래처 DC 값 존재 | 전역 기본보다 우선 |
| 단위처리 | `ROUND/CEIL/FLOOR`, 단위 0이면 무처리 |
| 싱글 세트 실내·실외 모두 존재 | 일반 4:6, 가정용 6:4로 세트금액 배분; 고정부품 먼저 차감; 천원 단위 배분 |
| 구형 `isDisc=true` | 기본 50% DC; 아니면 시트 납품가 |

전역 기본은 홈 0.45, 상업 0.45, 구형 0.5, 선택형 정액DC 0원, 단위 0, 모드 `ROUND`다. 모델 플래그는 `AC`의 8·9번째 문자, `AP`의 9·11번째 문자와 `AP230/AP290` 예외를 사용한다. [표현 가능] 품목 고정 DC와 현재 가격은 `products.fixed_discount_rate/release_price/delivery_price`; [불가] 거래처 DC, 정액 옵션 DC, 가격 버전, 단위처리 정책. **[자동]** 품목 `고정DC`는 정규화해 품목 override로 저장하고, 미기재는 하위 분류→상위 분류→전역 순으로 상속한다. 거래처 45%, 정액DC 0, 구형 50%는 임시 기본이 아니라 별도 가격정책으로 이관해야 한다. 포팅 견적은 `dbCatalog` 우선+sheet fallback으로 같은 계산을 유지한다. 포팅 주문도 레거시 수식을 유지하나 사용자-visible 수량 설정은 shadow다.

### R03. 세트 구성·기본 구성품·옵션 치환

대표 함수: `getSingleParts`, `getCommercialParts`, `partsForSetStrict_`, `partsForCommSet_`, `getDefaultRemoteRows`, `getOptionRemoteRow`, `getBasePanelRow`, `pickPanelRow`, `calcSetUnitPrice`, `explodeSetParts`, `explodeCommSets_`, `explodeSendSets_`, `syncSetPriceFromParts`.

| 조건 | 결과 |
|---|---|
| 구성품 특징에 `기본` | 기본 구성품 포함 |
| 패널 제외 | 패널 미포함 |
| 패널 옵션 | 기본/블랙/승강/공청/360 원형·사각 후보로 치환 |
| 리모컨 제외 | 기본 리모컨 제거 |
| 유선/컬러유선 옵션 | 기본 유선 리모컨을 해당 후보로 치환 |
| 자재 포함 여부=`포함` | 특징 `자재` 구성품 포함 |
| 발통, 운임, 절삭, 유연호스 I형 | 세트 전개에서 별도/제외 처리 |
| 세트 수량 `q`와 구성품 명시수량 `defaultQty` | `q × defaultQty` |

리터럴: `기본`, `포함`, `판넬제외`, `공청판넬`, `블랙판넬`, `승강판넬`, `원형`, `사각`, `유선리모컨`, `컬러유선리모컨`, `EA`, `SET`, 비율 4:6/6:4. 읽는 시트 축은 세트, 품명, 모델, 구분, 단위, 수량, 특징, 규격, 납품가, 출고가. [표현 가능] `bundle_component` 전 컬럼. **[자동]** 시트의 세트-구성품-수량-특징을 그대로 저장한다. 이름에서 기본수량을 만들지 않는다. 특징 `기본`만 `is_default=true`. 포팅본은 동일 규칙이 있고 DB `bundle_component`를 읽을 수 있으나, 일부 화면은 `p.qty/defaultQty`를 계속 사용한다.

### R04. 수량 파생·동기화

대표 함수: `recomputeFootAll`, `recomputeSingleBaseFoot`, `recomputeSingleExtras`, `recomputeHomePanels`, `recomputeHomeRemotes`, `recomputeHomeBranches`, `recomputeHomeDerived`, `recomputeCommDerived`, `computeCommPanelModelForIndoor_`, `computeCommRemoteModelForIndoor_`, `pickHoseModel`, `chooseBaseModel`, `countBranchForSet`, `recalcCommAccessories`, `pushBranchPartsToCommFromBadges`.

| 조건 | 레거시 결과 | 이식 결과 |
|---|---|---|
| 본체 수량 변경 | 이름/모델/HP/옵션을 다시 파싱해 부자재 수량 갱신 | `(source model_code, target model_code, multiplier)` rule 적용 |
| 사용자가 부자재 수동 입력 | `ABSOLUTE_LOCK`/manual set으로 자동 덮어쓰기 차단 | 수동 override가 규칙 계산보다 우선 |
| 제외 옵션 | 해당 target 0 | 조건부 rule 비활성 |
| 세트 구성품 | `setQty × data-def` | `bundle_component.default_qty` 또는 명시 quantity rule |

[표현 가능] `quantity_sync_rule/source/target`; 옵션 조건은 `condition_json`. **[자동]** 소스·타깃 모델코드와 배수값이 코드/시트에 명시된 것만 저장한다. HP/이름에서 런타임 추론하지 않는다. 전체 설정값은 §5에 있다. 포팅 주문은 `clients/web/order-app/src/quantitySync.ts`가 설정을 읽고 계산할 수 있지만 `order-app/index.html:5545-5555,8548-8570`에서 **shadow 관측만 하고 사용자 계산은 legacy 수식 유지**라고 명시한다. 따라서 현재 동작은 원본과 같지만 개발책임자 확정 원칙과는 다르다.

### R05. 용량·조합률·분기관·추천실외기

대표 함수: `getCapacity`, `updateHomeRatio`, `updateCommRatio`, `capFromModel`, `pickSelectedOutdoors`, `pickSelectedIndoorsExpanded`, `codeByCumulativeSum`, `codeByOutdoorHP`, `recomputeBranchCodes`, `updateBranchRatios`, `calcRecommendOdu`, `getRecommendOduData`.

| 조건 | 결과 |
|---|---|
| 상업 모델 `AMddd` | ddd를 용량으로 사용 |
| 누적 실내 용량 `<150/<406/<464/<696/<986/그 이상` | 분기관 코드 `1509/2512/2812/2815/3419/4119` |
| 마지막 분기 + 실외기 숫자 `<=50/100/160/220/340/그 이상` | 같은 코드열로 강제 |
| 프라임/한랭지/표준형/냉난방/GHP/프레스티지/동시냉난방/공장전원 | 조합률 한도 103%, 그 외 120% |
| 실내기 대수 > 시트 `최대 연결 실내기 대수` | 수량 초과 |
| 추천실외기 시트 최소≤입력≤최대 | 구분별 추천 모델 반환 |

모델코드 `AXJ-YA1509N/2512N/2812M/2815M/3419M/4119M`로 매핑한다. [부분] 수량 target은 `quantity_sync_*`에 가능하지만 용량 합·구간·최대 연결/추천 정책을 담을 스키마가 없다. **🚩[결정 필요]** §7 D-03. 포팅본은 동일 함수가 있어 사용자 결과가 같다.

### R06. 견적/주문 행·합계·전송품목

대표 함수: `buildSendRows`, `aggregateSendRows`, `getStructuredQuoteData`, `sumHome`, `sumSingles`, `sumComm`, `sumOld`, `sync*Totals`, `materialsSumForSet`, `getSetUnitNowById`, `checkOrderReady`, `getSelectedTotalCount`, `getCurrentSlipSnapshot`, `extractSpecs`.

| 조건 | 결과 |
|---|---|
| 수량 0 | 전송/견적 행 제외 |
| 세트 상세 | 구성품으로 폭발; 첫 행에 세트명/스펙, 이후 구성품 |
| 같은 모델/단가/규격/적요 | 주문 행 집계 |
| 사용자 정의 행 수량≠0 | `unit=EA`, fixedDC=0으로 포함 |
| 카드/절삭 옵션 | R12 적용 후 모든 행에 결제일 주입 |

상수: 섹션 `HOME/SINGLE/COMM/OLD/SET/기타`, 기본단위 `EA`, 영폭문자 `\u200B`, 카드결제 라벨. [부분] 품목·세트는 표현되나 견적 snapshot/전송 행 스키마가 제시되지 않았다. **[자동]** 제품 기본값은 product/bundle에서, 견적 행의 수동값은 snapshot/line override로 분리한다. 포팅본은 같은 함수가 존재하며 금액·수량·출고품목 축이 대체로 같다.

### R07. 출고 창고·주문 메모·배송 workflow

대표 함수: `decideWarehouseCode_`, `detectHomeOrder`, `updateOrderTags`, `enforceTagsOnInput`, `appendMemo`, `toggleAuditLater`, `togglePayDueCb`, `isValidTel`, `submitOrderCard`, `sendOrderFromUi`.

| 조건 | 결과 |
|---|---|
| HOME 품명에 인피니트, 또는 SINGLE 품명에 `360/1등급/냉방전용/1way/덕트/냉전/비스포크/벽걸이/가정용 에어컨` | 창고코드 `2` |
| 그 외/빈 품목 | `00003` |
| 야적/지방 체크 | 주소 prefix `야적/` 또는 `지방/` |
| 야적/지방 + 출고일 | 메모 `D상N하`; 다음날 일요일이면 월요일, 단 토요일 야적 예외 |
| 현장추후 | 현장주소 `추후`, 배송=현장 해제 |
| 결제예정일 별표/선결제 | 상호 배타, 날짜 입력 비활성 |

[불가] 제시 product 스키마에는 주문 workflow/warehouse routing이 없다. **🚩[결정 필요]** D-04. 포팅본은 동일 client 규칙과 service 전송 adapter가 공존하며, 표시/전송 축 모두 확인 대상이다.

### R08. snapshot·이력·복원

대표 함수: 주문 `saveOrderSnapshot`, `getOrderSnapshotHistory`, `getOrderHistory`, 견적 `saveQuoteSnapshot`, `getQuoteHistory`, `getQuoteHistoryByCustomer`, 양쪽 `takeSnapshot`, `applySnapshot`, `handleSaveSnapshot`, `restoreSnapshot`.

| 조건 | 결과 |
|---|---|
| snapshot 저장 | 거래처명/코드/주제/시각/직렬화 데이터/이미지를 저장 |
| Notion rich_text | 2,000자 chunk; 주문 미리보기는 100 chunk × 3 필드 |
| 이력 조회 | 거래처코드, 시작/종료일 필터; 최신순; page_size 100, cursor 반복 |
| 복원 | 수량·가격·규격·옵션·주문카드 상태 재적용 |

[불가] product 스키마 밖 estimate/order snapshot 도메인. 포팅 견적은 `/internal/estimates/snapshots`로 이관돼 인증·저장축이 다르며 의미는 유지된다. 주문 원본의 `saveOrderSnapshot/getOrderSnapshotHistory` 이름은 포팅본에 없지만 order-app의 snapshot bridge/API로 대체되어 단순 유실로 보지 않는다.

### R09. 거래처별 DC·인증상태

대표 함수: `initDcConfigFromNotion`, `fetchNotionDcConfig_`, `getAllNotionDcConfigs_`, `searchCustomerByBizno`, `detectHomeOrder`.

Notion 속성 `거래처코드`, `홈멀티DC`, `상업멀티DC`, `유연호스I형`, `360`, `4way`, `스탠드`, `1way`, `디럭스`, `1등급`, `단위처리`를 읽는다. 단위처리는 숫자+`반올림/올림/내림`을 `unitRoundTo`와 `ROUND/CEIL/FLOOR`로 바꾼다. [불가] product 스키마가 아니라 거래처 가격정책. **[자동]** 기존 Notion 값이 명시된 거래처만 migrate; 없는 거래처에 45%를 영구값으로 박지 말고 정책 fallback으로 둔다. 포팅본은 estimate service/DC API를 통해 같은 필드를 유지한다.

### R10. 장기미발주 거래처 상태

함수: `processLongTermUnusedClientsFast` `:12`, `getActiveBizNosFromLog_` `:65`, `getActiveBizNosFromShipping_` `:110`, `getTargetClients_` `:161`, `updateClientStatus_` `:214`.

| 조건 | 결과 |
|---|---|
| 최근 30일 `주문 성공` 로그 또는 created_time/출고일 활동 | active |
| 월요일, 승인, inactive, 계정 생성도 30일 이전 | `장기미발주` |
| 장기미발주 + active | 매일 `승인` 복구 |

상수는 30일, 월요일 `getDay()===1`, page_size 100, 상태 `승인/장기미발주`, 로그 문자열 `주문 성공`, Notion 속성 `거래처코드/승인상태/로그/출고일`이다. [불가] partner 상태정책 스키마가 제시되지 않았다. 제품 기본값과 무관. 포팅 4곳에 대응 로직이 없어 **원본-only 유실 후보**다.

### R11. 모델 표시명·규격·전표명

대표 함수: `sanitizeDisp_`, `displayOverrides`, `stripCommKeywords`, `singleDispNameTrimmed`, `buildDisplayNameComm`, `displayNameForRow`, `getRealSpec`, `getSingleSetOptionLabel*`.

표시명에서 비한글 괄호, 기호, 분류 키워드를 제거하되 홈 예외 `유선리모컨(컬러) 용→유선리모컨 컬러 에어콤보용`, `일자발 전면 4~6HP→520 일자발`, `8~12HP→730 일자발`을 적용한다. [부분] `model_name`과 `spec_text`로 결과는 보존되나 원본명/표시명 이중 컬럼이 없다. **[자동]** `model_name`에는 정본 시트 품명, 화면용 정규화명은 별도 display_name이 생기기 전까지 런타임 projection으로 유지 권고. 포팅본은 동일.

### R12. 카드수수료·절삭·보너스 DC

대표 함수: `applyCardFeeLogic`, `applyCutoffLogic`, `getTierBonusRate`, `isStandard45`, `isIndoorOnly`/주문 `isNoMainUnit`, `runWithAdjustedRates`.

| 조건 | 결과 |
|---|---|
| 카드 체크, 기존 카드/수수료 행 없음 | 총액의 `floor(3%)`; 수량 1인 비세트 첫 행에 가산, 없으면 `카드수수료/식/1` 행 추가 |
| 절삭 단위 >0, 총액 나머지 >0 | 수량 1인 비세트 첫 행에서 차감, 없으면 `절삭/식/1/-rem` 행 |
| 홈/상업 DC가 45%±0.001, 섹션 총액 ≥1천/3천/5천/1억원 | +1%/+2%/+3%/+4% |
| 견적 원본: 실외기 없이 품목 존재 | 45%→40% 후 보너스 |
| 주문 원본: 메인장비 없이 부자재만 존재(전열 제외) | 45%→40% |

[불가] 거래처/견적 가격정책 스키마. **🚩[결정 필요]** D-01, D-02. 포팅본에도 동일 함수가 있으나 견적과 주문의 “실내기 단독” 대 “메인장비 없음” 조건축이 서로 다르다.

### R13. 기본 옵션·견적품목 기본값

대표 함수: `getHomeDefaults`, `getSingleDefaults`, `renderHomeOptions`, `renderSingleOptions`, `renderCommOptions`, `resetHome`, `resetSingle`, `resetComm`, `initOrderCard`.

홈/싱글 시트의 1~2행, 최대 24열에서 이름→값을 읽는다. 홈 리모컨 기본은 `선택 안함`을 `기본`으로 치환; 홈 패널은 빈값, 상업 패널 `기본판넬`, 360 `원형`, 리모컨 `무선`, 단위처리 `ROUND`; 당일 출고일을 기본으로 둔다. [부분] 품목 자체 속성은 `panel_type/remote_type`에 가능하지만 사용자 세션 옵션 기본은 별도 estimate config가 필요하다. **🚩[결정 필요]** D-05. 포팅본 동일.

## 5. 수량 이름/HP 파싱의 설정값 환원

### 5.1 이식 계약

다음 표의 `source`/`target`은 모두 `products.model_code`를 가리킨다. `factor=1`, `multiplier=1`, `rounding_mode=NONE`이 기본이다. 옵션별 target 치환은 각각 별도 rule과 `condition_json`으로 둔다. **소스/타깃 수량을 구성품명·HP·품명에서 런타임 추론하지 않는다.** 코드에 source model이 명시된 것은 즉시 tuple로, 이름 조건만 있는 것은 정규화된 product 속성으로 source model을 먼저 확정한 뒤 tuple을 생성한다. 속성이 비어 있으면 규칙을 만들지 않고 데이터 정제 큐로 보낸다.

### 5.2 코드가 source와 target을 모두 명시한 tuple

| rule_key | source model_code | target model_code | qty | 조건/근거 |
|---|---|---|---:|---|
| COMM_PUMP_01 | AM052DNLDBH1 | MDP-Z075SZED | 1 | `index.html:8024-8036` |
| COMM_PUMP_02 | AM072DNLDBH1 | MDP-Z075SZED | 1 | 동상 |
| COMM_PUMP_03 | AM100FNLDBH1 | ADP-E075SEK3D | 1 | 동상 |
| COMM_PUMP_04 | AM130DNMDBH1 | MDP-M075SGK2D | 1 | 동상 |
| COMM_PUMP_05 | AM145DNMDBH1 | MDP-M075SGK2D | 1 | 동상 |
| COMM_PUMP_06 | AM083DNMDBH1 | ADP-G075SPK1D | 1 | 동상 |
| COMM_PUMP_07 | AM100DNMDBH1 | ADP-G075SPK1D | 1 | 동상 |
| COMM_PUMP_08 | AM110DNMDBH1 | ADP-G075SPK1D | 1 | 동상 |
| COMM_PUMP_09 | AM052ANHDBH1 | ADP-G075SPK1D | 1 | 동상 |
| COMM_PUMP_10 | AM060ANHDBH1 | ADP-G075SPK1D | 1 | 동상 |
| COMM_PUMP_11 | AM072ANHDBH1 | ADP-G075SPK1D | 1 | 동상 |
| COMM_PUMP_12 | AM083ANHDBH1 | ADP-G075SPK1D | 1 | 동상 |
| COMM_PUMP_13 | AM100ANHDBH1 | ADP-G075SPK1D | 1 | 동상 |
| COMM_PUMP_14 | AM110ANHDBH1 | ADP-G075SPK1D | 1 | 동상 |
| COMM_PUMP_15 | AM130ANHDBH1 | ADP-G075SPK1D | 1 | 동상 |
| COMM_PUMP_16 | AM145ANHDBH1 | ADP-G075SPK1D | 1 | 동상 |
| COMM_PUMP_17 | AM230ANHDBH1 | ADP-G075SPK1D | 1 | 동상 |
| COMM_PUMP_18 | AM290HNHDBH1 | ADP-N047SNK1D | 1 | 동상 |
| COMM_PUMP_19 | AM072TNCDBH1 | ADP-F075SP | 1 | 동상 |
| COMM_PUMP_20 | AM110TNCDBH1 | ADP-F075SP | 1 | 동상 |
| COMM_PUMP_21 | AM130TNCDBH1 | ADP-F075SP | 1 | 동상 |
| COMM_PUMP_22 | AM145TNCDBH1 | ADP-F075SP | 1 | 동상 |
| COMM_FILTER_09_01 | AM035FXMRHC1 | AF-R09A | 1 | `index.html:3812-3816,8065-8073` |
| COMM_FILTER_09_02 | AM050MXMRBC1 | AF-R09A | 1 | 동상 |
| COMM_FILTER_09_03 | AM050FXMRHC1 | AF-R09A | 1 | 동상 |
| COMM_FILTER_12_01 | AM075FXMRHC1 | AF-R12A | 1 | 동상 |
| HOME_BRANCH_6HP | AJ060MXHNBC1 | AXJ-YA2512N | 1 | 실내기 2대 이상·단배관 선택 조건, `:7839-7896` |

### 5.3 target 모델이 명시된 속성 기반 tuple 생성표

아래는 “이름을 다시 파싱”하라는 표가 아니다. 최초 이관 시 정본 시트와 이미 정규화된 `classification/panel_type/remote_type/pyong_size`를 대조하여 **각 source model_code별 독립 row**를 생성하는 규격이다.

| source product 속성 | target model_code | qty | condition_json |
|---|---|---:|---|
| HOME 실내기, 1way, WIFI, 소형/중형/대형 | PC1MWSK3NW / PC1NWSK3NW / PC1BWSK3NW | 1 | `panel=DEFAULT` |
| HOME 실내기, 1way, 미내장, 소형/중형/대형 | PC1MWSK3N / PC1NWSK3N / PC1BWSK3N | 1 | `panel=DEFAULT` |
| 위 두 행, 공청 선택 | 각각 PC1MWCK3N(W) / PC1NWCK3N(W) / PC1BWCK3N(W) | 1 | `panel=AIR_CLEAN` |
| HOME 인피니트 중형 | PC1YNWK1NW / PC1YNRK1NW | 1 | `panel=DEFAULT|AI` |
| HOME 인피니트 대형 | PC1ZNSK1NW / PC1ZNWK1NW / PC1ZNRK1NW | 1 | `panel=DEFAULT|YEAR25|AI` |
| HOME 4way WIFI/미내장 | PC4NUFK1NW / PC4NUFK1N | 1 | `panel=DEFAULT` |
| HOME 4way 공청 | PC4NUCK4NW / PC4NUCK1N | 1 | `panel=AIR_CLEAN` |
| HOME 360 WIFI 원형/사각 | PC6NUNK1NW / PC6NUDK1NW | 1 | `shape=ROUND|SQUARE` |
| HOME 360 미내장 원형/사각 | PC4NUNK1N / PC4NUDK1N | 1 | 동상 |
| HOME/COMM 1way·2way 실내기 | 정규화된 L형/I형 1way 호스 target | 1 | `hose=DEFAULT|I` |
| HOME/COMM 4way·360 실내기 | 정규화된 4way 호스 target | 1 | `hose!=EXCLUDED` |
| HOME 360 실내기 | AR-EC05(원본 탐색 target) | 1 | `remote=DEFAULT` |
| HOME 인피니트 실내기 | AR-CH01 | 1 | `remote=DEFAULT` |
| HOME 일반 1/4way·벽걸이 | 정규화된 무선 리모컨 target | 1 | `remote=DEFAULT` |
| COMM 전열교환기 | AWR-VH12N | 1 | `remote!=EXCLUDED` |
| COMM 덕트 | AWR-WE13N / AWR-WG00N | 1 | `remote=WIRED|COLOR_WIRED` |
| COMM UV-C/인피니트 | AR-CH01 | 1 | `remote=WIRELESS` |
| COMM 그 외 실내기 | AR-EH05 | 1 | `remote=WIRELESS` |
| SINGLE 실링 세트 | 정본에서 확정한 실링 드레인펌프 model_code | 1 | pump enabled |
| SINGLE 1way 세트 | AIM-A01N(정본에서 확인) | 1 | `remote=WIRED|COLOR_WIRED` |
| AP230DAPDHH1S, AP290DAPDHH1S | SI-AL700a | 1 | base enabled |
| 그 외 받침 대상 SINGLE BUNDLE | 발통세트 target | 1 | base enabled |

이 표에서 target이 “정규화된 … target”으로 남은 행은 코드가 모델코드를 고정하지 않고 `HOMEMULTI.find(name regex)`로 런타임 탐색하기 때문이다(`index.html:8970-8995`). 이 행은 source/target model_code를 시트 행과 현재 products에서 대조해 확정 가능하지만, 이름 파서 결과만으로 자동 저장하면 개발책임자 결정에 위배된다. 따라서 **모델코드 확정 전에는 활성 rule을 만들지 않는다.**

### 5.4 이식하지 않을 수량 파서

- `parseSetHPs`, `hasExactHP`, `chooseBaseModel`, `countBranchForSet`: HP/괄호/`+`를 파싱해 받침대·분기관 수량을 계산한다.
- `recomputeHomeBranches`: 실내기/단배관/6HP 이름을 집계한다.
- `recomputeHomePanels`, `recomputeHomeRemotes`, `computeCommPanelModelForIndoor_`, `computeCommRemoteModelForIndoor_`: 품명으로 source type을 재판정한다.
- `recomputeSingleBaseFoot`, `recomputeSingleExtras`: 세트 이름/모델로 받침·보드·펌프를 결정한다.

이 함수들은 레거시 증거로만 남고, 이식 결과물은 §5.2 tuple과 §5.3의 모델코드 확정 후 생성되는 tuple이다.

## 6. 포팅본 대조

### 6.1 이름 존재 대조

| 원본 | 함수 수 | 포팅 상대 | 원본 이름 미존재 |
|---|---:|---|---|
| 견적 Code.js | 109 | estimate-app/lib/code.js | 8 unique: `chk`, `formatDate`, `getInitialData`, `getSelect`, `getText`, `getTitle`, `readSheet`, `sel` |
| 견적 index.html | 458 | estimate-app/views/index.ejs | 4: `decodeBase64`, `initDataLayer`, `loadInitialData`, `runHeavyInit` |
| 주문 index.html | 302 | order-app/index.html | 14: 주소검색 helper 9개, `fitAfterGate`, `onInitialDataLoaded`, `rebuildDerivedFromData`, `requestInitialData`, `scheduleNaverAutoSearch` 등 |

대부분은 bootstrap/API 구조 변경 또는 주소검색 UI 제거/대체이며, 이름 부재만으로 업무규칙 유실로 판정하지 않았다.

### 6.2 동작축

| 규칙축 | 원본↔포팅 판정 |
|---|---|
| 금액 | 견적은 동일 계산 함수가 남아 있고 `dbCatalog` 우선, sheet fallback. 가격 원천은 달라졌지만 계산식은 대체로 동일. 주문도 동일 legacy 계산 유지 |
| 수량 | 포팅 주문은 legacy 수식이 사용자 결과를 계속 결정. `quantitySync.ts`는 설정을 계산하지만 shadow only이므로 새 스키마가 authoritative하지 않음 |
| 출고품목 | 세트 폭발·분기관·패널·리모컨·펌프 target은 동일 이름 함수가 있어 대체로 동일. address helper 부재는 출고품목 축과 무관 |
| 표시 | 포팅에 bootstrap/주소검색/초기화 차이가 있고 일부 원본 helper가 이름상 없음. 표시 차이 가능 |

### 6.3 원본에만 있고 포팅본에 없는 업무규칙 — 유실 후보

함수명 전역 대조에서 업무규칙으로 분류된 원본-only는 14개다.

| 함수 | 원본 좌표 | 판정 |
|---|---|---|
| saveOrderSnapshot | 주문 Code.js:105 | 이름은 없으나 포팅 order snapshot API/bridge로 대체된 것으로 보임; 의미 대조 필요 |
| getOrderSnapshotHistory | 주문 Code.js:169 | 동상 |
| getHomeIncreasePrices_ | 주문 Code.js:281 | 포팅 견적의 `dbCatalog.priceIncData/getPriceIncData_`로 통합; 유실 아님 |
| getCommIncreasePrices_ | 주문 Code.js:294 | 동상 |
| extractSingleIncreasePrices_ | 주문 Code.js:307 | 동상 |
| getSingleIncreasePrices_ | 주문 Code.js:332 | 동상 |
| getSinglePartsIncreasePrices_ | 주문 Code.js:345 | 동상 |
| extractIncreasePrices_ | 주문 Code.js:358 | 동상 |
| getOrderHistory | 주문 Code.js:3084 | 포팅 주문 history API로 대체 여부 계약 대조 필요 |
| processLongTermUnusedClientsFast | 장기미발주 Code.js:12 | **유실 후보 확정** |
| getActiveBizNosFromLog_ | 동 파일:65 | **유실 후보 확정** |
| getActiveBizNosFromShipping_ | 동 파일:110 | **유실 후보 확정** |
| getTargetClients_ | 동 파일:161 | **유실 후보 확정** |
| updateClientStatus_ | 동 파일:214 | **유실 후보 확정** |

## 7. 🚩 개발책임자 결정 필요

### D-01. 카드수수료 3%를 어떤 정책으로 둘 것인가

1. 결정: 카드수수료율과 원단위 절사, 어느 행에 가산할지 확정 필요.
2. 레거시: 견적 `index.html:16172-16200` — `const fee = Math.floor(total * 0.03);`, 수량 1인 비세트 첫 행에 가산, 없으면 `카드수수료/식` 행.
3. 후보:
   - A. 3%+원단위 floor+별도 수수료 행: 감사/설명 용이, 기존 행 단가 비오염.
   - B. 3%+기존 첫 행 가산: 원본과 완전 동일, 품목 원단가가 오염됨.
   - C. 거래처별 수수료율: 유연하지만 가격정책 UI/스키마 추가 필요.
4. 권고: **A**. 총액은 같고 정규화·감사가 쉽다.

### D-02. 45% 기준 보너스와 메인장비 부재 페널티를 견적/주문 중 어느 의미로 통일할 것인가

1. 결정: “실외기 없음”과 “메인장비 없음” 중 판정 기준, 1천/3천/5천/1억원 보너스 유지 여부.
2. 레거시: 견적 `index.html:13301-13415`은 실외기 없이 품목이 있으면 45→40 후 섹션 총액별 +1~4%; 주문 `index.html:7685-7750`은 전열을 제외하고 실내기/실외기/벽걸이 모두 없을 때만 45→40.
3. 후보:
   - A. 견적 기준: 실내기 단독도 페널티, 매출 보호가 강함.
   - B. 주문 기준: 부자재-only만 페널티, 고객가격 변동이 적음.
   - C. 거래처/견적종류별 정책: 정확하지만 정책 스키마·QA 범위 큼.
4. 권고: **C**, 단 초기 기본은 현재 견적 사용자가 보는 A를 유지.

### D-03. 용량·조합률·추천실외기 정책 테이블을 추가할 것인가

1. 결정: 현재 product/quantity schema 밖의 누적용량 구간, 103/120%, 최대연결, 추천 최소·최대를 어디에 둘지.
2. 레거시: 견적 `index.html:12282-12415,12894-12943`, Code.js `:1610-1636`.
3. 후보:
   - A. `quantity_sync_rule.condition_json`에 우겨 넣기: 변경 적음, 의미/검증이 불명확.
   - B. `capacity_combination_rule`/`outdoor_recommendation_rule` 별도: 정규화·검증 용이, 신규 스키마 필요.
   - C. 코드 상수 유지: 빠르나 이번 이식 목적 실패.
4. 권고: **B**.

### D-04. 창고코드 `2`와 `00003` 라우팅을 유지할 것인가

1. 결정: 특정 HOME/SINGLE 제품군을 창고 `2`, 그 외 `00003`으로 보내는 원본 규칙의 현재 유효성.
2. 레거시: 견적 `Code.js:1639-1679` — 인피니트 및 9개 싱글 키워드면 `2`.
3. 후보:
   - A. model_code별 warehouse rule: 명시적·안전, 초기 매핑 작업 필요.
   - B. 분류별 warehouse rule: 관리 적음, 예외 모델 처리 필요.
   - C. 폐기하고 주문자가 선택: 자동 오류는 줄지만 운영 부담 증가.
4. 권고: **A**, 분류 fallback은 두지 않음.

### D-05. 옵션 기본값을 전역으로 둘지 거래처별로 둘지

1. 결정: 상업 패널=기본, 360=원형, 리모컨=무선, 홈/싱글 시트 1~2행 기본을 누구 범위로 저장할지.
2. 레거시: 견적 `Code.js:1357-1409`, `index.html:7355-7398,9725-9840`.
3. 후보:
   - A. 전역 estimate config: 단순, 거래처 예외 불가.
   - B. 전역+거래처 override: 레거시 DC 구조와 일치, 정책 스키마 필요.
   - C. 매번 무선택: 오주문 감소 가능, 입력비용 증가.
4. 권고: **B**.

### D-06. 기본구성품 0건 BUNDLE 72개의 노출 정책

1. 결정: 기본구성품이 하나도 없는 세트를 견적에 노출할지.
2. 레거시: `getSingleParts`는 `feat`에 `기본`이 있을 때만 `isDefault=true`(`Code.js:650-664`), `explodeSetParts`는 연결행이 없으면 빈 배열(`index.html:4780-4782`).
3. 후보:
   - A. 노출 차단: 잘못된 금액/출고 방지, 72개 판매 중단.
   - B. 세트 헤더만 노출: 가격은 보존, 출고품목 불완전.
   - C. 담당자 검수 후 구성 확정된 세트만 순차 활성: 작업량 있지만 안전.
4. 권고: **C**, 검수 전은 비노출.

### D-07. 가격 0을 무료와 미정 중 무엇으로 볼 것인가

1. 결정: 시트 누락을 레거시처럼 0원으로 견적 가능하게 둘지.
2. 레거시: 모든 `parseKRNumber_` 실패/공란이 0이고 loader가 그대로 저장한다(견적 `Code.js:196-200,407-408,534-540,642-643`).
3. 후보:
   - A. 0=무료: 원본 동일, 누락 가격 오견적 위험.
   - B. 0=미정/견적 차단: 안전, 실제 무료품목 별도 flag 필요.
   - C. 품목별 `price_zero_allowed`: 정확, 컬럼/정책 추가.
4. 권고: **C**; 컬럼 전까지 B.

### D-08. 장기미발주 자동 상태변경을 이식할 것인가

1. 결정: 30일·월요일 규칙을 새 partner workflow에서 활성화할지.
2. 레거시: `장기미발주 거래처 선별/Code.js:12-61` — 월요일에 승인→장기미발주, 활동 즉시 승인 복구.
3. 후보:
   - A. 동일 이식: 운영 연속성, 30일이 현재 정책인지 불확실.
   - B. 리포트만 생성: 안전, 수동 처리 필요.
   - C. 폐기: 단순, 장기미발주 관리 기능 상실.
4. 권고: **B로 1회 검증 후 A**.

## 8. 업무규칙 함수별 레지스터 — 395개

규칙군은 §4를 참조한다. `리터럴`은 해당 함수 정의 시작부터 다음 인벤토리 함수 시작 전까지의 문자열·숫자 리터럴을 기계 추출하고 업무 의미 없는 HTML/CSS 조각은 제외한 것이다. `시트축`이 “간접 catalog”인 client 함수는 §2 loader가 만든 품목 속성을 읽는다. 포팅은 지정 4곳에서 동명 함수 존재를 우선 대조하고, 이름이 달라도 확인된 adapter는 별도 표기했다.

| 함수 | 원본 좌표 | 규칙군 | 업무 상수·리터럴 | 시트/품목 축 | 스키마·기본값 | 포팅 대조 |
|---|---|---|---|---|---|---|
| `isBlockedByNote_` | `tools/legacy-gas/종합견적서/Code.js:257` | R01 | 없음 | 품명·모델·비고·분류·평형 | [표현 가능] products/classification; seed 자동·충돌 검수 | 동명 존재; §4 동작축 |
| `isSoldOutByNote_` | `tools/legacy-gas/종합견적서/Code.js:264` | R01 | 없음 | 품명·모델·비고·분류·평형 | [표현 가능] products/classification; seed 자동·충돌 검수 | 동명 존재; §4 동작축 |
| `classifyHome_` | `tools/legacy-gas/종합견적서/Code.js:274` | R01 | 실외기 받침대, 원형발통, 일자발, 전열교환기, 에어콤보, 인테리어핏, 시스템제습기, 실외기, 단배관, 다배관, 실내기, 1-Way WIFI, 1-Way 인피니트UV, 1-Way 인피니트, 1-Way 미내장, 4WAY WIFI, 4WAY 미내장, 360 WIFI, 360 미내장, 벽걸이, 소형, 중형, 대형, 무풍, 판넬, 공기청정 WIFI, 공기청정 미내장, WIFI, 미내장, 인피니트, 부자재, 리모컨, 분기관, 유연호스, 기타, 1, 4, 360 | 품명·모델·비고·분류·평형 | [표현 가능] products/classification; seed 자동·충돌 검수 | 동명 존재; §4 동작축 |
| `getHomeMulti` | `tools/legacy-gas/종합견적서/Code.js:364` | R06 | HM_FIX_V13, 모델명, 납품가, 품명, 품, 품목, 항목, 모델, 품목코드, 기종, 단위, 용량, 규격, 출고가, LIST, 리스트, 정가, 소비자가, 고정DC, 비고, 최대 연결 실내기 대수, >> 🔎 HM row=%s model=%s useK2=%s list=%s price=%s fixDC=%s f=%s, ..., -1, 0, 10, 3, 1, 80, 60 | 간접 catalog/견적·주문 상태 | [부분] 견적/주문 line 도메인 | 동명 존재; §4 동작축 |
| `classifySingleSetLM_` | `tools/legacy-gas/종합견적서/Code.js:448` | R01 | acc, 360, 4w, 1w, duct, ceiling, stand, wall, house, prestige, premium, grade1, cool, heatcool, mupung, yupung, gallery, bespoke, 4, 1 | 품명·모델·비고·분류·평형 | [표현 가능] products/classification; seed 자동·충돌 검수 | 동명 존재; §4 동작축 |
| `getSingleSets` | `tools/legacy-gas/종합견적서/Code.js:488` | R06 | SS_FIX_V16, 모델명, 납품가, 품명, 품, 평형, 단위, 비고, 출고가, SET, D4, D7, D8, >> 📦 싱글 원본 납품가 확정, \|, 0, 20, 2, -1, 6, 1, 60, 10 | 간접 catalog/견적·주문 상태 | [부분] 견적/주문 line 도메인 | 동명 존재; §4 동작축 |
| `getSingleParts` | `tools/legacy-gas/종합견적서/Code.js:600` | R03 | SP_FIX_V14, 품명, 품, 모델명, 모델, 품목코드, 기종, 구분, 단위, 납품가, 출고가, 세트, 구성품특징, 특징, 규격, EA, 1, -1, 0, 2, 60, 10 | 세트·구성품·수량·특징·규격 | [표현 가능] bundle_component; 시트 명시값 자동 | 동명 존재; §4 동작축 |
| `getSingleMatPrices` | `tools/legacy-gas/종합견적서/Code.js:673` | R02 | 싱글 자재가격, 2, 1, 0 | 납품가·출고가·고정DC·수식 | [부분] products 가격·고정DC; 정책/이력 별도 | 동명 존재; §4 동작축 |
| `classifyCommercial_` | `tools/legacy-gas/종합견적서/Code.js:684` | R01 | 분기관, 부자재, 프라임, 고효율한랭지, 표준형, ECO 냉난방, ECO 냉방전용, ECO 리뉴얼, 냉방전용, 1-Way WIFI내장, 1-Way 인피니트, 1WAY 미내장, 2Way, 4-Way UV-C WIFI내장, MINI 4WAY WIFI내장, 4-Way WIFI내장, MINI 4WAY 미내장, 4WAY 미내장, 360CST WIFI내장, 360CST 미내장, 벽걸이, 스탠드형(PAC), 실링, DUCT, 전열교환기, 실외기, 실내기, 소형, 대형, 중형, 저정압 SLIM, 중정압, 고정압, 상업용, 주택용, 단상형, 삼상형, 상부토출형, 판넬, 3, 1, 2, 4, 360 | 품명·모델·비고·분류·평형 | [표현 가능] products/classification; seed 자동·충돌 검수 | 동명 존재; §4 동작축 |
| `getCommercialMulti` | `tools/legacy-gas/종합견적서/Code.js:768` | R06 | CM_FIX_V9, 모델명, 납품가, 품명, 품, 품목, 항목, 모델, 품목코드, 기종, 단위, 출고가, LIST, 리스트, 정가, 소비자가, 고정DC, 규격, 용량, 용량(kW), 용량kW, 대분류, 비고, 최대 연결 실내기 대수, -1, 0, 10, 3, 1, 60 | 간접 catalog/견적·주문 상태 | [부분] 견적/주문 line 도메인 | 동명 존재; §4 동작축 |
| `getCommercialParts` | `tools/legacy-gas/종합견적서/Code.js:863` | R03 | CP_FIX_V9, 세트, 모델명, 품명, 품, 모델, 품목코드, 기종, 구분, 단위, 규격, 비고, 출고가, 납품가, 수량, EA, 1, >> 🧱 상업 구성 로드 V9 완료: %s 개, -1, 0, 10, 60 | 세트·구성품·수량·특징·규격 | [표현 가능] bundle_component; 시트 명시값 자동 | 동명 존재; §4 동작축 |
| `getSpecMap_` | `tools/legacy-gas/종합견적서/Code.js:945` | R11 | SPEC_MAP_V4 | 간접 catalog/견적·주문 상태 | [부분] model_name/spec_text; display_name 없음 | 동명 존재; §4 동작축 |
| `getSpecDetailMap_` | `tools/legacy-gas/종합견적서/Code.js:996` | R11 | SPEC_DETAIL_MAP_V10, 모델명, 모델, 품목코드, 0, 10, -1 | 간접 catalog/견적·주문 상태 | [부분] model_name/spec_text; display_name 없음 | 동명 존재; §4 동작축 |
| `scanHome` | `tools/legacy-gas/종합견적서/Code.js:1026` | R06 | 모델명, 모델, 품목코드, 기종, 배관경, 냉방성능(정격), 소비전력(정격), 에너지소비효율, 에너지소비효율등급, 냉매가스, 차단기, 전원선, 제품크기, 제품중량, 포장치수, 포장중량, 최대장배관, 최대 장배관, 최대고저차, 최대 고저차, >> 🧊 홈멀티 인덱스 iCoolKw=%s iCoolKcal=%s iPowKw=%s iEff=%s coolCols=%s, 0, 2, -1, 1 | 간접 catalog/견적·주문 상태 | [부분] 견적/주문 line 도메인 | 동명 존재; §4 동작축 |
| `scanSingle` | `tools/legacy-gas/종합견적서/Code.js:1108` | R06 | 모델명, 모델, 품목코드, 기종, 등급(냉방/난방), 등급 (냉방/난방), 배관경, 소비전력(kW)(최소/정격/최대), 소비전력(kW) (최소 / 정격 / 최대), 성능(kW)(최소/정격/최대), 성능(kW) (최소 / 정격 / 최대), 성능(kcal/h)(최소/정격/최대), 성능(kcal/h) (최소 / 정격 / 최대), 전원(mm²)/차단(A), 전원(mm²) / 차단(A), 실내기크기(mm), 실내기 크기(mm), 실외기크기(mm), 실외기 크기(mm), 실내기중량(kg), 실내기 중량(kg), 실외기중량(kg), 실외기 중량(kg), 실내기포장(mm), 실내기 포장(mm), 실외기포장(mm), 실외기 포장(mm), 실내기포장중량(kg), 실내기 포장중량(kg), 실외기포장중량(kg), 실외기 포장중량(kg), 배관길이/고낙차(m), 배관길이 / 고낙차(m), 냉매가스, \|, /, 0, 1 | 간접 catalog/견적·주문 상태 | [부분] 견적/주문 line 도메인 | 동명 존재; §4 동작축 |
| `scanComm` | `tools/legacy-gas/종합견적서/Code.js:1185` | R06 | 모델명, 모델, 품목코드, 기종, 배관경, 냉매가스, 차단기, 전원선, 제품크기, 제품중량, 포장치수, 포장중량, 소비효율등급, 에너지소비효율등급, 최대장배관, 최대 장배관, 배관길이, 최대고저차, 최대 고저차, 고낙차, 0 | 간접 catalog/견적·주문 상태 | [부분] 견적/주문 line 도메인 | 동명 존재; §4 동작축 |
| `getHomeDefaults` | `tools/legacy-gas/종합견적서/Code.js:1357` | R13 | 1, 2, 24, 0 | 간접 catalog/견적·주문 상태 | [부분] product 속성 + estimate config | 동명 존재; §4 동작축 |
| `getSingleDefaults` | `tools/legacy-gas/종합견적서/Code.js:1382` | R13 | 1, 2, 24, 0 | 간접 catalog/견적·주문 상태 | [부분] product 속성 + estimate config | 동명 존재; §4 동작축 |
| `getRecommendOduData` | `tools/legacy-gas/종합견적서/Code.js:1610` | R05 | 추천실외기, A3:E, 3, 0, 1, 2, 4 | 용량·최대연결·추천실외기 | [부분/불가] quantity_sync + 용량정책 필요 | 동명 존재; §4 동작축 |
| `decideWarehouseCode_` | `tools/legacy-gas/종합견적서/Code.js:1639` | R07 | 00003 | 간접 catalog/견적·주문 상태 | [부분] 견적/주문 line 도메인 | 동명 존재; §4 동작축 |
| `getOrigName_` | `tools/legacy-gas/종합견적서/Code.js:1644` | R11 | 없음 | 간접 catalog/견적·주문 상태 | [부분] model_name/spec_text; display_name 없음 | 동명 존재; §4 동작축 |
| `getSection_` | `tools/legacy-gas/종합견적서/Code.js:1650` | R06 | HOME, SINGLE, 2, 00003, 360, 1 | 간접 catalog/견적·주문 상태 | [부분] 견적/주문 line 도메인 | 동명 존재; §4 동작축 |
| `getOldProducts_` | `tools/legacy-gas/종합견적서/Code.js:1719` | R06 | 구형, $I$1, 2, 1, 9, 0, 5, -1, 3, 7, 8 | 간접 catalog/견적·주문 상태 | [부분] 견적/주문 line 도메인 | 동명 존재; §4 동작축 |
| `sendOrderFromUi` | `tools/legacy-gas/종합견적서/Code.js:1762` | R07 | string | 간접 catalog/견적·주문 상태 | [부분] 견적/주문 line 도메인 | 동명 존재; §4 동작축 |
| `detectHomeOrder` | `tools/legacy-gas/종합견적서/Code.js:1970` | R09 | 없음 | 없음(Notion 거래처DC) | [불가] partner 가격정책 | 동명 존재; §4 동작축 |
| `buildDefaultDcConfig_` | `tools/legacy-gas/종합견적서/Code.js:1990` | R13 | 없음 | 간접 catalog/견적·주문 상태 | [부분] product 속성 + estimate config | 동명 존재; §4 동작축 |
| `fetchNotionDcConfig_` | `tools/legacy-gas/종합견적서/Code.js:2007` | R09 | NOTION_DC_V2_, >> 📦 노션 DC 캐시 사용, >> 📡 노션 DC 조회 시작, (강제 새로고침), Bearer, Notion-Version, Content-Type, application/json, 2025-09-03, https://api.notion.com/v1/databases/, get, {}, >> 🗂️ 노션 data_source 선택, >> ⚠️ 노션 data_source 없음, /databases 쿼리로 폴백, >> ⚠️ 노션 DB 조회 실패, /, >> ⚠️ 노션 DB 조회 예외, https://api.notion.com/v1/data_sources/, /query, 거래처코드, post, >> 🟥 노션 응답 코드, >> ⚠️ 노션 결과 없음, 2025, 09, 03, 200, 0 | 없음(Notion 거래처DC) | [불가] partner 가격정책 | 동명 존재; §4 동작축 |
| `initDcConfigFromNotion` | `tools/legacy-gas/종합견적서/Code.js:2166` | R09 | 미확인, >> ⚠️ DC 설정 기본값 사용 (유효하지 않은 사업자번호), number, boolean, ⚙️ 할인조회, 🚫 에러기록, 10, 0 | 없음(Notion 거래처DC) | [불가] partner 가격정책 | 동명 존재; §4 동작축 |
| `getAllNotionDcConfigs_` | `tools/legacy-gas/종합견적서/Code.js:2204` | R09 | NOTION_DC_MAP_V1, Bearer, Notion-Version, Content-Type, application/json, 2025-09-03, https://api.notion.com/v1/databases/, get, {}, >> ⚠️ DC맵 data_source 예외, https://api.notion.com/v1/data_sources/, /query, post, >> 🟥 DC맵 응답, 2025, 09, 03, 200, 0, 100 | 없음(Notion 거래처DC) | [불가] partner 가격정책 | 동명 존재; §4 동작축 |
| `saveQuoteSnapshot` | `tools/legacy-gas/종합견적서/Code.js:2724` | R08 | 미지정, GMT+9, yyyy-MM-dd'T'HH:mm:ss+09:00, 거래처명, 담당자 계정, 저장일시, 데이터, 미리보기1, 미리보기2, 미리보기3, post, Authorization, Bearer, Content-Type, application/json, Notion-Version, 2022-06-28, https://api.notion.com/v1/pages, 저장완료 ✅, 저장실패 ❌, 저장 실패, 9, 09, 00, 0, 2000, 100, 1, 2, 3, 2022, 06, 28 | 간접 catalog/견적·주문 상태 | [불가] estimate/order snapshot 도메인 | 동명 존재; §4 동작축 |
| `getQuoteHistory` | `tools/legacy-gas/종합견적서/Code.js:2791` | R08 | 🚀 저장조회, 담당자 계정, 저장일시, post, Authorization, Bearer, Content-Type, application/json, Notion-Version, 2022-06-28, descending, ⚠️ 응답실패, 데이터, 미리보기1, 미리보기2, 미리보기3, 거래처명, 미지정, ✅ 조회완료, 💥 에러발생, 목록 로드 실패:, 2022, 06, 28, 100, 200, 1, 2, 3, 0, 30 | 간접 catalog/견적·주문 상태 | [불가] estimate/order snapshot 도메인 | 동명 존재; §4 동작축 |
| `getQuoteHistoryByCustomer` | `tools/legacy-gas/종합견적서/Code.js:2879` | R08 | 🚀 거래처별 저장조회, 담당자 계정, 거래처명, 저장일시, descending, post, Authorization, Bearer, Content-Type, application/json, Notion-Version, 2022-06-28, 응답 코드, 데이터, 미리보기1, 미리보기2, 미리보기3, 미지정, ✅ 거래처별 조회완료, 💥 거래처별 조회 에러, 거래처별 목록 로드 실패:, 30, 2022, 06, 28, 200, 1, 2, 3, 0 | 간접 catalog/견적·주문 상태 | [불가] estimate/order snapshot 도메인 | 동명 존재; §4 동작축 |
| `getPriceIncData_` | `tools/legacy-gas/종합견적서/Code.js:2944` | R02 | 🚀 인상전단가, PRICE_INC_CACHE_V3 | 납품가·출고가·고정DC·수식 | [부분] products 가격·고정DC; 정책/이력 별도 | 동명 존재; §4 동작축 |
| `saveOrderSnapshot` | `tools/legacy-gas/거래처 발송 주문서/Code.js:105` | R08 | 미지정 거래처, 주제 없음, GMT+9, yyyy-MM-dd'T'HH:mm:ss+09:00, 거래처명, 거래처코드, 주제, 저장일시, 데이터, 미리보기1, 미리보기2, 미리보기3, post, Authorization, Bearer, Content-Type, application/json, Notion-Version, 2022-06-28, https://api.notion.com/v1/pages, 💾 주문저장 완료, ❌ 주문저장 실패, 저장 실패, 9, 09, 00, 0, 2000, 100, 1, 2, 3, 2022, 06, 28 | 간접 catalog/견적·주문 상태 | [불가] estimate/order snapshot 도메인 | 동명 없음; §6.3 대체/유실 판정 |
| `getOrderSnapshotHistory` | `tools/legacy-gas/거래처 발송 주문서/Code.js:169` | R08 | 거래처코드, 저장일시, post, Authorization, Bearer, Content-Type, application/json, Notion-Version, 2022-06-28, descending, ⚠️ 응답실패, 데이터, 미리보기1, 미리보기2, 미리보기3, 거래처명, 미지정, 주제, 주제 없음, 📥 내역조회 완료, ❌ 내역조회 실패, 목록 로드 실패:, 2022, 06, 28, 100, 200, 1, 2, 3, 0, 90000 | 간접 catalog/견적·주문 상태 | [불가] estimate/order snapshot 도메인 | 동명 없음; §6.3 대체/유실 판정 |
| `getHomeIncreasePrices_` | `tools/legacy-gas/거래처 발송 주문서/Code.js:281` | R02 | HOME_INC_V2, 홈멀티_단가인상, ❌ 홈멀티단가인상 시트없음, 60, 10 | 납품가·출고가·고정DC·수식 | [부분] products 가격·고정DC; 정책/이력 별도 | 동명 없음; §6.3 대체/유실 판정 |
| `getCommIncreasePrices_` | `tools/legacy-gas/거래처 발송 주문서/Code.js:294` | R02 | COMM_INC_V2, 상업멀티_단가인상, ❌ 상업단가인상실패, 60, 10 | 납품가·출고가·고정DC·수식 | [부분] products 가격·고정DC; 정책/이력 별도 | 동명 없음; §6.3 대체/유실 판정 |
| `extractSingleIncreasePrices_` | `tools/legacy-gas/거래처 발송 주문서/Code.js:307` | R02 | 모델명, 납품가, 출고가, 모델, 품목코드, 0, 20, -1, 1 | 납품가·출고가·고정DC·수식 | [부분] products 가격·고정DC; 정책/이력 별도 | 동명 없음; §6.3 대체/유실 판정 |
| `getSingleIncreasePrices_` | `tools/legacy-gas/거래처 발송 주문서/Code.js:332` | R02 | SINGLE_INC_V1, 싱글 세트_단가인상, ❌ 싱글단가인상실패, 60, 10 | 납품가·출고가·고정DC·수식 | [부분] products 가격·고정DC; 정책/이력 별도 | 동명 없음; §6.3 대체/유실 판정 |
| `getSinglePartsIncreasePrices_` | `tools/legacy-gas/거래처 발송 주문서/Code.js:345` | R03 | SINGLE_PARTS_INC_V1, 싱글 구성품_단가인상, ❌ 싱글부품인상실패, 60, 10 | 세트·구성품·수량·특징·규격 | [표현 가능] bundle_component; 시트 명시값 자동 | 동명 없음; §6.3 대체/유실 판정 |
| `extractIncreasePrices_` | `tools/legacy-gas/거래처 발송 주문서/Code.js:358` | R02 | 모델명, 출고가, LIST, 리스트, 모델, 품목코드, 기종, 정가, 소비자가, -1, 0, 10, 1 | 납품가·출고가·고정DC·수식 | [부분] products 가격·고정DC; 정책/이력 별도 | 동명 없음; §6.3 대체/유실 판정 |
| `isBlockedByNote_` | `tools/legacy-gas/거래처 발송 주문서/Code.js:524` | R01 | 없음 | 품명·모델·비고·분류·평형 | [표현 가능] products/classification; seed 자동·충돌 검수 | 동명 존재; §4 동작축 |
| `isSoldOutByNote_` | `tools/legacy-gas/거래처 발송 주문서/Code.js:531` | R01 | 없음 | 품명·모델·비고·분류·평형 | [표현 가능] products/classification; seed 자동·충돌 검수 | 동명 존재; §4 동작축 |
| `classifyHome_` | `tools/legacy-gas/거래처 발송 주문서/Code.js:541` | R01 | 실외기 받침대, 원형발통, 일자발, 전열교환기, 에어콤보, 인테리어핏, 시스템제습기, 실외기, 단배관, 다배관, 실내기, 1-Way WIFI, 1-Way 인피니트UV, 1-Way 인피니트, 1-Way 미내장, 4WAY WIFI, 4WAY 미내장, 360 WIFI, 360 미내장, 벽걸이, 소형, 중형, 대형, 무풍, 판넬, 공기청정 WIFI, 공기청정 미내장, WIFI, 미내장, 인피니트, 부자재, 리모컨, 분기관, 유연호스, 기타, 1, 4, 360 | 품명·모델·비고·분류·평형 | [표현 가능] products/classification; seed 자동·충돌 검수 | 동명 존재; §4 동작축 |
| `getHomeMulti` | `tools/legacy-gas/거래처 발송 주문서/Code.js:631` | R06 | HM_FIX_V13, 모델명, 납품가, 품명, 품, 품목, 항목, 모델, 품목코드, 기종, 단위, 용량, 규격, 출고가, LIST, 리스트, 정가, 소비자가, 고정DC, 비고, >> 🔎 HM row=%s model=%s useK2=%s list=%s price=%s fixDC=%s f=%s, ..., -1, 0, 10, 3, 1, 80, 60 | 간접 catalog/견적·주문 상태 | [부분] 견적/주문 line 도메인 | 동명 존재; §4 동작축 |
| `classifySingleSetLM_` | `tools/legacy-gas/거래처 발송 주문서/Code.js:713` | R01 | acc, 360, 4w, 1w, duct, ceiling, stand, wall, house, prestige, premium, grade1, cool, heatcool, mupung, yupung, gallery, bespoke, 4, 1 | 품명·모델·비고·분류·평형 | [표현 가능] products/classification; seed 자동·충돌 검수 | 동명 존재; §4 동작축 |
| `getSingleSets` | `tools/legacy-gas/거래처 발송 주문서/Code.js:753` | R06 | SS_FIX_V16, 모델명, 납품가, 품명, 품, 평형, 단위, 비고, SET, D4, D7, D8, >> 📦 싱글 원본 납품가 확정, \|, 0, 20, 2, -1, 6, 1, 60, 10 | 간접 catalog/견적·주문 상태 | [부분] 견적/주문 line 도메인 | 동명 존재; §4 동작축 |
| `getSingleParts` | `tools/legacy-gas/거래처 발송 주문서/Code.js:859` | R03 | SP_FIX_V13, 품명, 품, 모델명, 모델, 품목코드, 기종, 구분, 단위, 납품가, 세트, 구성품특징, 특징, 규격, EA, 1, -1, 0, 2, 60, 10 | 세트·구성품·수량·특징·규격 | [표현 가능] bundle_component; 시트 명시값 자동 | 동명 존재; §4 동작축 |
| `getSingleMatPrices` | `tools/legacy-gas/거래처 발송 주문서/Code.js:915` | R02 | 싱글 자재가격, 2, 1, 0 | 납품가·출고가·고정DC·수식 | [부분] products 가격·고정DC; 정책/이력 별도 | 동명 존재; §4 동작축 |
| `classifyCommercial_` | `tools/legacy-gas/거래처 발송 주문서/Code.js:926` | R01 | 분기관, 부자재, 프라임, 고효율한랭지, 표준형, ECO 냉난방, ECO 냉방전용, ECO 리뉴얼, 냉방전용, 1-Way WIFI내장, 1-Way 인피니트, 1WAY 미내장, 2Way, 4-Way UV-C WIFI내장, MINI 4WAY WIFI내장, 4-Way WIFI내장, MINI 4WAY 미내장, 4WAY 미내장, 360CST WIFI내장, 360CST 미내장, 벽걸이, 스탠드형(PAC), 실링, DUCT, 전열교환기, 실외기, 실내기, 소형, 대형, 중형, 저정압 SLIM, 중정압, 고정압, 상업용, 주택용, 단상형, 삼상형, 상부토출형, 판넬, 3, 1, 2, 4, 360 | 품명·모델·비고·분류·평형 | [표현 가능] products/classification; seed 자동·충돌 검수 | 동명 존재; §4 동작축 |
| `getCommercialMulti` | `tools/legacy-gas/거래처 발송 주문서/Code.js:1010` | R06 | CM_FIX_V9, 모델명, 납품가, 품명, 품, 품목, 항목, 모델, 품목코드, 기종, 단위, 출고가, LIST, 리스트, 정가, 소비자가, 고정DC, 규격, 용량, 용량(kW), 용량kW, 대분류, 비고, >> 🧭 CM row=%s model=%s cap=%s catL=%s useK2=%s list=%s price=%s fixDC=%s, -1, 0, 10, 3, 1, 60 | 간접 catalog/견적·주문 상태 | [부분] 견적/주문 line 도메인 | 동명 존재; §4 동작축 |
| `getCommercialParts` | `tools/legacy-gas/거래처 발송 주문서/Code.js:1102` | R03 | CP_FIX_V6, 세트, 모델명, 품명, 품, 모델, 품목코드, 기종, 구분, 단위, 규격, 비고, 출고가, 납품가, EA, >> 🧱 상업 구성 로드 행 %s 헤더 %s 구성 %s, -1, 0, 10, 1, 60 | 세트·구성품·수량·특징·규격 | [표현 가능] bundle_component; 시트 명시값 자동 | 동명 존재; §4 동작축 |
| `getSpecMap_` | `tools/legacy-gas/거래처 발송 주문서/Code.js:1185` | R11 | SPEC_MAP_V4 | 간접 catalog/견적·주문 상태 | [부분] model_name/spec_text; display_name 없음 | 동명 존재; §4 동작축 |
| `getSpecDetailMap_` | `tools/legacy-gas/거래처 발송 주문서/Code.js:1237` | R11 | SPEC_DETAIL_MAP_V14, 모델명, 모델, 품목코드, 0, 10, -1 | 간접 catalog/견적·주문 상태 | [부분] model_name/spec_text; display_name 없음 | 동명 존재; §4 동작축 |
| `scanHome` | `tools/legacy-gas/거래처 발송 주문서/Code.js:1267` | R06 | 모델명, 모델, 품목코드, 기종, 배관경, 냉방성능(정격), 소비전력(정격), 에너지소비효율, 에너지소비효율등급, 냉매가스, 차단기, 전원선, 제품크기, 제품중량, 중량, 중량(kg), 포장치수, 포장크기, 포장치수(mm), 포장크기(mm), 포장중량, 포장중량(kg), 최대장배관, 최대 장배관, 최대고저차, 최대 고저차, 0, -1, 1 | 간접 catalog/견적·주문 상태 | [부분] 견적/주문 line 도메인 | 동명 존재; §4 동작축 |
| `scanSingle` | `tools/legacy-gas/거래처 발송 주문서/Code.js:1344` | R06 | 모델명, 모델, 품목코드, 기종, 등급(냉방/난방), 배관경, 소비전력(kW)(최소/정격/최대), 성능(kW)(최소/정격/최대), 성능(kcal/h)(최소/정격/최대), 전원(mm²)/차단(A), 실내기크기(mm), 실내기크기, 실외기크기(mm), 실외기크기, 실내기중량(kg), 실내기중량, 실외기중량(kg), 실외기중량, 실내기포장(mm), 실내기포장, 실내기포장치수, 실내기포장치수(mm), 실내기포장크기, 실내기포장크기(mm), 실외기포장(mm), 실외기포장, 실외기포장치수, 실외기포장치수(mm), 실외기포장크기, 실외기포장크기(mm), 실내기포장중량(kg), 실내기포장중량, 실내기포장무게, 실외기포장중량(kg), 실외기포장중량, 실외기포장무게, 배관길이/고낙차(m), 냉매가스, \|, /, 0, 1 | 간접 catalog/견적·주문 상태 | [부분] 견적/주문 line 도메인 | 동명 존재; §4 동작축 |
| `scanComm` | `tools/legacy-gas/거래처 발송 주문서/Code.js:1438` | R06 | 모델명, 모델, 품목코드, 기종, 배관경, 냉매가스, 차단기, 전원선, 제품크기, 제품중량, 중량, 중량(kg), 포장치수, 포장크기, 포장치수(mm), 포장크기(mm), 포장중량, 포장중량(kg), 포장무게, 소비효율등급, 에너지소비효율등급, 최대장배관, 배관길이, 최대고저차, 고낙차, 0 | 간접 catalog/견적·주문 상태 | [부분] 견적/주문 line 도메인 | 동명 존재; §4 동작축 |
| `getHomeDefaults` | `tools/legacy-gas/거래처 발송 주문서/Code.js:1606` | R13 | 1, 2, 24, 0 | 간접 catalog/견적·주문 상태 | [부분] product 속성 + estimate config | 동명 존재; §4 동작축 |
| `getSingleDefaults` | `tools/legacy-gas/거래처 발송 주문서/Code.js:1631` | R13 | 1, 2, 24, 0 | 간접 catalog/견적·주문 상태 | [부분] product 속성 + estimate config | 동명 존재; §4 동작축 |
| `decideWarehouseCode_` | `tools/legacy-gas/거래처 발송 주문서/Code.js:1831` | R07 | 00003 | 간접 catalog/견적·주문 상태 | [부분] 견적/주문 line 도메인 | 동명 존재; §4 동작축 |
| `getOrigName_` | `tools/legacy-gas/거래처 발송 주문서/Code.js:1836` | R11 | 없음 | 간접 catalog/견적·주문 상태 | [부분] model_name/spec_text; display_name 없음 | 동명 존재; §4 동작축 |
| `getSection_` | `tools/legacy-gas/거래처 발송 주문서/Code.js:1842` | R06 | HOME, SINGLE, 2, 00003, 360, 1 | 간접 catalog/견적·주문 상태 | [부분] 견적/주문 line 도메인 | 동명 존재; §4 동작축 |
| `getOldProducts_` | `tools/legacy-gas/거래처 발송 주문서/Code.js:1911` | R06 | 구형, $I$1, 2, 1, 9, 0, 5, -1, 3, 7, 8 | 간접 catalog/견적·주문 상태 | [부분] 견적/주문 line 도메인 | 동명 존재; §4 동작축 |
| `sendOrderFromUi` | `tools/legacy-gas/거래처 발송 주문서/Code.js:1954` | R07 | 항목 없음, SET, 사업자등록번호 없음, 미등록 거래처, (모바일), (PC), 거래처, -, \|, >> ⚠️ 싱글 세트 규격 맵 생성 오류:, number, HOME, COMM, SINGLE, undefined, /, \u200B, 1, 0, 항목없음, 📤 전송, post, application/json, samhan00@daum.net, yyyy-MM-dd HH:mm:ss, $1/$2/$3, 미지정, border-bottom:1px solid #eee;, padding:8px;border:1px solid #ddd;, padding:8px;border:1px solid #ddd;text-align:center;, padding:8px;border:1px solid #ddd;text-align:right;, 4, font-family:sans-serif;line-height:1.6;, border-collapse:collapse;width:100%;font-size:13px;border:1px solid #ddd;, margin:4px 0;, 다른전표생성, 판매조회, 📧 메일발송성공, ⚠️ 메일발송실패, >> 🔍 전표번호 원본:, 100, -1, 1.1, 152.69, 228.109, 3000, 200, 8, 2, 1.6, 13, 15, 120, 12, 555, 10 | 간접 catalog/견적·주문 상태 | [부분] 견적/주문 line 도메인 | 동명 존재; §4 동작축 |
| `detectHomeOrder` | `tools/legacy-gas/거래처 발송 주문서/Code.js:2407` | R09 | 없음 | 없음(Notion 거래처DC) | [불가] partner 가격정책 | 동명 존재; §4 동작축 |
| `buildDefaultDcConfig_` | `tools/legacy-gas/거래처 발송 주문서/Code.js:2427` | R13 | 없음 | 간접 catalog/견적·주문 상태 | [부분] product 속성 + estimate config | 동명 존재; §4 동작축 |
| `fetchNotionDcConfig_` | `tools/legacy-gas/거래처 발송 주문서/Code.js:2444` | R09 | NOTION_DC_, >> 📦 노션 DC 캐시 사용, >> 📡 노션 DC 조회 시작, (강제 새로고침), Bearer, Notion-Version, Content-Type, application/json, 2025-09-03, https://api.notion.com/v1/databases/, get, {}, >> 🗂️ 노션 data_source 선택, >> ⚠️ 노션 data_source 없음, /databases 쿼리로 폴백, >> ⚠️ 노션 DB 조회 실패, /, >> ⚠️ 노션 DB 조회 예외, https://api.notion.com/v1/data_sources/, /query, 거래처코드, post, >> 🟥 노션 응답 코드, >> ⚠️ 노션 결과 없음, 2025, 09, 03, 200, 0 | 없음(Notion 거래처DC) | [불가] partner 가격정책 | 동명 존재; §4 동작축 |
| `initDcConfigFromNotion` | `tools/legacy-gas/거래처 발송 주문서/Code.js:2632` | R09 | 미확인, >> ⚠️오류, number, boolean, 할인율 로드:, /, >> ⚙️적용, >> ⚠️없음, 기본할인 적용, 10, 0, 100, 360, 4, 1 | 없음(Notion 거래처DC) | [불가] partner 가격정책 | 동명 존재; §4 동작축 |
| `getOrderHistory` | `tools/legacy-gas/거래처 발송 주문서/Code.js:3084` | R08 | 주문일시, created_time, descending, 출고희망일, post, Authorization, Bearer, Notion-Version, 2022-06-28, Content-Type, application/json, 🔍 내역조회, 거래처코드, ⚠️ 응답실패, 2022, 06, 28, 100, 200, 9, 60, 1000, 0, 10 | 간접 catalog/견적·주문 상태 | [불가] estimate/order snapshot 도메인 | 동명 없음; §6.3 대체/유실 판정 |
| `processLongTermUnusedClientsFast` | `tools/legacy-gas/거래처 발송 주문서/장기미발주 거래처 선별/Code.js:12` | R10 | ▶️ 처리시작, 승인, 장기미발주, 1, 30, 24, 60, 1000 | 없음(Notion) | [불가] partner workflow | 없음 — 유실 후보 |
| `getActiveBizNosFromLog_` | `tools/legacy-gas/거래처 발송 주문서/장기미발주 거래처 선별/Code.js:65` | R10 | created_time, 로그, 주문 성공, post, Authorization, Bearer, Notion-Version, 2022-06-28, Content-Type, application/json, 거래처코드, 100, 2022, 06, 28, 200 | 없음(Notion) | [불가] partner workflow | 없음 — 유실 후보 |
| `getActiveBizNosFromShipping_` | `tools/legacy-gas/거래처 발송 주문서/장기미발주 거래처 선별/Code.js:110` | R10 | created_time, 출고일, post, Authorization, Bearer, Notion-Version, 2022-06-28, Content-Type, application/json, 거래처코드, 100, 2022, 06, 28, 200 | 없음(Notion) | [불가] partner workflow | 없음 — 유실 후보 |
| `getTargetClients_` | `tools/legacy-gas/거래처 발송 주문서/장기미발주 거래처 선별/Code.js:161` | R10 | 승인상태, 승인, 장기미발주, post, Authorization, Bearer, Notion-Version, 2022-06-28, Content-Type, application/json, 거래처코드, 100, 2022, 06, 28, 200, 0 | 없음(Notion) | [불가] partner workflow | 없음 — 유실 후보 |
| `updateClientStatus_` | `tools/legacy-gas/거래처 발송 주문서/장기미발주 거래처 선별/Code.js:214` | R10 | 승인상태, patch, Authorization, Bearer, Notion-Version, 2022-06-28, Content-Type, application/json, 2022, 06, 28 | 없음(Notion) | [불가] partner workflow | 없음 — 유실 후보 |
| `isExpansionModel` | `tools/legacy-gas/거래처 발송 주문서/index.html:1311` | R01 | AC, CS, 프레스티지, AP, CA, AF70, 24, 25, AF80, AF90, 2026-07-01, ROUND, 7, 5, 10, 8, 2026, 07, 01, 0.45, 0 | 품명·모델·비고·분류·평형 | [표현 가능] products/classification; seed 자동·충돌 검수 | 동명 존재; §4 동작축 |
| `getModelFlags` | `tools/legacy-gas/거래처 발송 주문서/index.html:1361` | R01 | AC, 6, P, 4, D, 1, AP, C, H, AP230, AP290, F, 9, 7, 8, 11, 10 | 품명·모델·비고·분류·평형 | [표현 가능] products/classification; seed 자동·충돌 검수 | 동명 존재; §4 동작축 |
| `applyConfigFromServer` | `tools/legacy-gas/거래처 발송 주문서/index.html:1391` | R02 | ROUND, >> ⚙️ DC 설정 갱신, 0 | 납품가·출고가·고정DC·수식 | [부분] products 가격·고정DC; 정책/이력 별도 | 동명 존재; §4 동작축 |
| `parseFixedDc` | `tools/legacy-gas/거래처 발송 주문서/index.html:1414` | R02 | 🔎 고정DC 파싱 요청, string, number, 🧮 고정DC 수치 변환, 🧮 고정DC 문자열 변환, 1, 100, 0, 0.99 | 납품가·출고가·고정DC·수식 | [부분] products 가격·고정DC; 정책/이력 별도 | 동명 존재; §4 동작축 |
| `getStockState_` | `tools/legacy-gas/거래처 발송 주문서/index.html:1443` | R01 | SOLD, FUTURE, ., 예정, OK, 기본, 2, 2000, 1, 10, 3, 0 | 품명·모델·비고·분류·평형 | [표현 가능] products/classification; seed 자동·충돌 검수 | 동명 존재; §4 동작축 |
| `modelExists` | `tools/legacy-gas/거래처 발송 주문서/index.html:1469` | R06 | 없음 | 간접 catalog/견적·주문 상태 | [부분] 견적/주문 line 도메인 | 동명 존재; §4 동작축 |
| `isPanelRow` | `tools/legacy-gas/거래처 발송 주문서/index.html:1471` | R01 | 없음 | 품명·모델·비고·분류·평형 | [표현 가능] products/classification; seed 자동·충돌 검수 | 동명 존재; §4 동작축 |
| `isRemoteRow` | `tools/legacy-gas/거래처 발송 주문서/index.html:1484` | R01 | 없음 | 품명·모델·비고·분류·평형 | [표현 가능] products/classification; seed 자동·충돌 검수 | 동명 존재; §4 동작축 |
| `clearAllPanels` | `tools/legacy-gas/거래처 발송 주문서/index.html:1488` | R06 | 0 | 간접 catalog/견적·주문 상태 | [부분] 견적/주문 line 도메인 | 동명 존재; §4 동작축 |
| `clearAllRemotes` | `tools/legacy-gas/거래처 발송 주문서/index.html:1491` | R06 | 0 | 간접 catalog/견적·주문 상태 | [부분] 견적/주문 line 도메인 | 동명 존재; §4 동작축 |
| `pickPanelBy` | `tools/legacy-gas/거래처 발송 주문서/index.html:1496` | R03 | 없음 | 세트·구성품·수량·특징·규격 | [표현 가능] bundle_component; 시트 명시값 자동 | 동명 존재; §4 동작축 |
| `stripCommKeywords` | `tools/legacy-gas/거래처 발송 주문서/index.html:1541` | R11 | S, (사각 WIFI), 사각 WIFI, $1, 1, 2, 4, 360 | 간접 catalog/견적·주문 상태 | [부분] model_name/spec_text; display_name 없음 | 동명 존재; §4 동작축 |
| `displayOverrides` | `tools/legacy-gas/거래처 발송 주문서/index.html:1563` | R11 | home, 유선리모컨 컬러 에어콤보용, 520 일자발, 730 일자발, single, 실링용 드레인펌프, 4, 6, 520, 8, 12, 730 | 간접 catalog/견적·주문 상태 | [부분] model_name/spec_text; display_name 없음 | 동명 존재; §4 동작축 |
| `adjustSingleSetBasePrice` | `tools/legacy-gas/거래처 발송 주문서/index.html:1575` | R02 | acc, 0 | 납품가·출고가·고정DC·수식 | [부분] products 가격·고정DC; 정책/이력 별도 | 동명 존재; §4 동작축 |
| `isIndoorUnitPart` | `tools/legacy-gas/거래처 발송 주문서/index.html:1632` | R06 | 없음 | 간접 catalog/견적·주문 상태 | [부분] 견적/주문 line 도메인 | 동명 존재; §4 동작축 |
| `isOutdoorUnitPart` | `tools/legacy-gas/거래처 발송 주문서/index.html:1645` | R06 | 없음 | 간접 catalog/견적·주문 상태 | [부분] 견적/주문 line 도메인 | 동명 존재; §4 동작축 |
| `splitIndoorOutdoorToK` | `tools/legacy-gas/거래처 발송 주문서/index.html:1656` | R02 | 🎯 세트 단가 잔액, ⚖️ 배분 결과, 0, 1000 | 납품가·출고가·고정DC·수식 | [부분] products 가격·고정DC; 정책/이력 별도 | 동명 존재; §4 동작축 |
| `analyzeSingleSetDiscountFlags` | `tools/legacy-gas/거래처 발송 주문서/index.html:1686` | R02 | acc, 0 | 납품가·출고가·고정DC·수식 | [부분] products 가격·고정DC; 정책/이력 별도 | 동명 존재; §4 동작축 |
| `isCommIndoorRow` | `tools/legacy-gas/거래처 발송 주문서/index.html:2147` | R01 | AM, N, 실내기, 7, 6 | 품명·모델·비고·분류·평형 | [표현 가능] products/classification; seed 자동·충돌 검수 | 동명 존재; §4 동작축 |
| `isCommOutdoorRow` | `tools/legacy-gas/거래처 발송 주문서/index.html:2153` | R01 | AM, X, 7, 6 | 품명·모델·비고·분류·평형 | [표현 가능] products/classification; seed 자동·충돌 검수 | 동명 존재; §4 동작축 |
| `commIndoorKind` | `tools/legacy-gas/거래처 발송 주문서/index.html:2159` | R01 | 360, 4way, 2way, 1way, 4, 2, 1 | 품명·모델·비고·분류·평형 | [표현 가능] products/classification; seed 자동·충돌 검수 | 동명 존재; §4 동작축 |
| `isCommPanelRow` | `tools/legacy-gas/거래처 발송 주문서/index.html:2169` | R01 | 없음 | 품명·모델·비고·분류·평형 | [표현 가능] products/classification; seed 자동·충돌 검수 | 동명 존재; §4 동작축 |
| `isCommHoseRow` | `tools/legacy-gas/거래처 발송 주문서/index.html:2175` | R01 | 없음 | 품명·모델·비고·분류·평형 | [표현 가능] products/classification; seed 자동·충돌 검수 | 동명 존재; §4 동작축 |
| `isCommRemoteRow` | `tools/legacy-gas/거래처 발송 주문서/index.html:2181` | R01 | 없음 | 품명·모델·비고·분류·평형 | [표현 가능] products/classification; seed 자동·충돌 검수 | 동명 존재; §4 동작축 |
| `isCommPumpRow` | `tools/legacy-gas/거래처 발송 주문서/index.html:2187` | R01 | 없음 | 품명·모델·비고·분류·평형 | [표현 가능] products/classification; seed 자동·충돌 검수 | 동명 존재; §4 동작축 |
| `computeCommRemoteModelForIndoor_` | `tools/legacy-gas/거래처 발송 주문서/index.html:2193` | R04 | comm_remote, 무선, 제외, AWR-VH12N, 컬러유선, AWR-WG00N, AWR-WE13N, 유선, AR-CH01, AR-EH05, 360 | 간접 catalog: model_code·분류·옵션 | [표현 가능] quantity_sync_*; model tuple만 | 동명 존재; legacy 사용자축, 설정 shadow |
| `pickHoseModel` | `tools/legacy-gas/거래처 발송 주문서/index.html:2225` | R04 | 1way, 4way, 360, 1, 4 | 간접 catalog: model_code·분류·옵션 | [표현 가능] quantity_sync_*; model tuple만 | 동명 존재; legacy 사용자축, 설정 shadow |
| `pickCommPanelModel` | `tools/legacy-gas/거래처 발송 주문서/index.html:2233` | R04 | comm_panel | 간접 catalog: model_code·분류·옵션 | [표현 가능] quantity_sync_*; model tuple만 | 동명 존재; legacy 사용자축, 설정 shadow |
| `parseSetHPs` | `tools/legacy-gas/거래처 발송 주문서/index.html:2246` | R04 | +, 1, 0, 9 | 간접 catalog: model_code·분류·옵션 | [표현 가능] quantity_sync_*; model tuple만 | 동명 존재; legacy 사용자축, 설정 shadow |
| `chooseBaseModel` | `tools/legacy-gas/거래처 발송 주문서/index.html:2253` | R04 | 4, 5, 6, 3.5, SI-AL600a, 8, 10, 12, 14, 7.5, SI-AL700a, GHP방진가대, ACL-KORGHP07, 방진가대S2소, 16, 18, 20, 방진가대S2중, 22, 24, 26, 28, 30, 방진가대S2대, 32, 34 | 간접 catalog: model_code·분류·옵션 | [표현 가능] quantity_sync_*; model tuple만 | 동명 존재; legacy 사용자축, 설정 shadow |
| `modelByNameLike` | `tools/legacy-gas/거래처 발송 주문서/index.html:2310` | R06 | \\$&, i | 간접 catalog/견적·주문 상태 | [부분] 견적/주문 line 도메인 | 동명 존재; §4 동작축 |
| `countBranchForSet` | `tools/legacy-gas/거래처 발송 주문서/index.html:2323` | R04 | AF-R09A, AM035FXMRHC1, AM050MXMRBC1, AM050FXMRHC1, AF-R12A, AM075FXMRHC1, 254,205,211, 255,219,199, 255,236,179, 199,232,239, 187,222,251, 209,196,233, 200,230,201, 255,204,188, 255,180,189, 197,225,165, 179,229,252, 225,190,231, 248,187,208, 255,224,178, 178,235,242, 174,213,129, 255,204,128, 206,147,216, 255,171,145, 129,199,132, 128,222,234, 159,168,218, 255,183,77, 244,143,177, 0, 1, 254, 205, 211, 255, 219, 199, 236, 179, 232, 239, 187, 222, 251, 209, 196, 233, 200, 230, 201, 204, 188, 180, 189, 197, 225, 165, 229, 252, 190, 231, 248, 208, 224, 178, 235, 242, 174, 213, 129, 128, 206, 147, 216, 171, 145, 132, 234, 159, 168, 218, 183, 77, 244, 143, 177 | 간접 catalog: model_code·분류·옵션 | [표현 가능] quantity_sync_*; model tuple만 | 동명 존재; legacy 사용자축, 설정 shadow |
| `applyHomeMultiPriceVat` | `tools/legacy-gas/거래처 발송 주문서/index.html:2353` | R02 | 🧮 홈멀티 납품가 산정 완료, 0 | 납품가·출고가·고정DC·수식 | [부분] products 가격·고정DC; 정책/이력 별도 | 동명 존재; §4 동작축 |
| `normalizeHomeCategory` | `tools/legacy-gas/거래처 발송 주문서/index.html:2361` | R01 | 부자재, 분기관, 리모컨, 전열교환기, 에어콤보, 인테리어핏, 시스템제습기, 실외기 받침대, 원형발통, 일자발, 1-Way 인피니트 UV, 1-Way 인피니트 일반, 1 | 품명·모델·비고·분류·평형 | [표현 가능] products/classification; seed 자동·충돌 검수 | 동명 존재; §4 동작축 |
| `classifySingleSetFixed` | `tools/legacy-gas/거래처 발송 주문서/index.html:2376` | R01 | 부자재, 기타, 실외기 받침, 360, CST UV, 4way 냉난방, 4way 냉방전용, 프레스티지, 프리미엄/디럭스, 1등급, 1way 냉난방, 1way 냉방전용, 덕트, 실링, 비스포크 스탠드, 콰이엇 그레이, 세이지 블루, 프라임 핑크, 냉난방 스탠드, 냉전 스탠드, 25년형 냉난방 벽걸이, 무풍, 25년형 냉전 벽걸이, 일반, 냉난방 벽걸이, 냉전 벽걸이, AF70, 24, 25, 가정용 에어컨, 무풍콤보 갤러리프로, Q9000, 무풍클래식, 무풍갤러리, 24년형, 4, 1, 5, 8, 10 | 품명·모델·비고·분류·평형 | [표현 가능] products/classification; seed 자동·충돌 검수 | 동명 존재; §4 동작축 |
| `priceFrom` | `tools/legacy-gas/거래처 발송 주문서/index.html:2419` | R02 | price, unitPrice, priceRight, list, 출고가, listPrice, msrp, wholesale, 출고가Left, listLeft | 납품가·출고가·고정DC·수식 | [부분] products 가격·고정DC; 정책/이력 별도 | 동명 존재; §4 동작축 |
| `homeUnitPrice` | `tools/legacy-gas/거래처 발송 주문서/index.html:2437` | R02 | ❓ 홈멀티 모델 없음, 🧵 홈 I형 유연호스 강제 단가 8000, 🧾 기본값, due, 고정DC, 0, 8000, 1 | 납품가·출고가·고정DC·수식 | [부분] products 가격·고정DC; 정책/이력 별도 | 동명 존재; §4 동작축 |
| `partUnitPrice` | `tools/legacy-gas/거래처 발송 주문서/index.html:2485` | R02 | due, price, unitPrice, list, 출고가, listPrice, msrp, 8000 | 납품가·출고가·고정DC·수식 | [부분] products 가격·고정DC; 정책/이력 별도 | 동명 존재; §4 동작축 |
| `setBasePriceLeft` | `tools/legacy-gas/거래처 발송 주문서/index.html:2500` | R02 | priceLeft, price, listLeft, list, 출고가 | 납품가·출고가·고정DC·수식 | [부분] products 가격·고정DC; 정책/이력 별도 | 동명 존재; §4 동작축 |
| `singleUnitPrice` | `tools/legacy-gas/거래처 발송 주문서/index.html:2509` | R02 | due, acc, 0, 8000 | 납품가·출고가·고정DC·수식 | [부분] products 가격·고정DC; 정책/이력 별도 | 동명 존재; §4 동작축 |
| `commUnitPrice` | `tools/legacy-gas/거래처 발송 주문서/index.html:2555` | R02 | 고정DC, due, 0, 8000, 1 | 납품가·출고가·고정DC·수식 | [부분] products 가격·고정DC; 정책/이력 별도 | 동명 존재; §4 동작축 |
| `singleDispNameTrimmed` | `tools/legacy-gas/거래처 발송 주문서/index.html:2606` | R11 | 실링용 드레인펌프, 냉전, 4WAY, 4 Way, 4-Way, 1WAY, 1 Way, 1-Way, 25년형, 가정용, 비스포크, 스탠드, 벽걸이, 실링, 덕트, 디럭스, \\s*, gi, single, PC1MWSK3NW, PC1NWSK3NW, PC1BWSK3NW, PC4NUFK1NW, PC6NUDK1NW, PC1MWCK3NW, PC1NWCK3NW, PC1BWCK3NW, PC4NUCK4NW, PC6NUCK1NW, PC1MWSK3N, PC1NWSK3N, PC1BWSK3N, PC4NUFK1N, PC6NUDK1N, PC1MWCK3N, PC1NWCK3N, PC1BWCK3N, PC4NUCK1N, PC6NUCK1N, PC1YNSK1NW, PC1ZNSK1NW, PC1YNWK1NW, PC1ZNWK1NW, PC1YNRK1NW, PC1ZNRK1NW, 4, 1, 25, 2 | 간접 catalog/견적·주문 상태 | [부분] model_name/spec_text; display_name 없음 | 동명 존재; §4 동작축 |
| `markAutoHome` | `tools/legacy-gas/거래처 발송 주문서/index.html:2650` | R06 | 없음 | 간접 catalog/견적·주문 상태 | [부분] 견적/주문 line 도메인 | 동명 존재; §4 동작축 |
| `markAutoSingle` | `tools/legacy-gas/거래처 발송 주문서/index.html:2651` | R06 | 없음 | 간접 catalog/견적·주문 상태 | [부분] 견적/주문 line 도메인 | 동명 존재; §4 동작축 |
| `sumHome` | `tools/legacy-gas/거래처 발송 주문서/index.html:2730` | R06 | 0 | 간접 catalog/견적·주문 상태 | [부분] 견적/주문 line 도메인 | 동명 존재; §4 동작축 |
| `sumSingles` | `tools/legacy-gas/거래처 발송 주문서/index.html:2731` | R06 | 0 | 간접 catalog/견적·주문 상태 | [부분] 견적/주문 line 도메인 | 동명 존재; §4 동작축 |
| `sumComm` | `tools/legacy-gas/거래처 발송 주문서/index.html:2732` | R06 | 0 | 간접 catalog/견적·주문 상태 | [부분] 견적/주문 line 도메인 | 동명 존재; §4 동작축 |
| `syncCommTotals` | `tools/legacy-gas/거래처 발송 주문서/index.html:2737` | R06 | #commTotal, 🧮 상업 합계 갱신 | 간접 catalog/견적·주문 상태 | [부분] 견적/주문 line 도메인 | 동명 존재; §4 동작축 |
| `setFootSum` | `tools/legacy-gas/거래처 발송 주문서/index.html:2746` | R06 | home, single, #singleTotal, 🧮 싱글 합계 갱신, comm, old | 간접 catalog/견적·주문 상태 | [부분] 견적/주문 line 도메인 | 동명 존재; §4 동작축 |
| `getCapacity` | `tools/legacy-gas/거래처 발송 주문서/index.html:2913` | R05 | 0 | 용량·최대연결·추천실외기 | [부분/불가] quantity_sync + 용량정책 필요 | 동명 존재; §4 동작축 |
| `updateHomeRatio` | `tools/legacy-gas/거래처 발송 주문서/index.html:2920` | R05 | #homeRatio, 조합비 : ---%, bad, ⚠️ 실외기 용량 없음 조합비 미표시, ko-KR, 📐 조합비 계산 완료, %, 0, 100, 1, 130 | 용량·최대연결·추천실외기 | [부분/불가] quantity_sync + 용량정책 필요 | 동명 존재; §4 동작축 |
| `updateCommRatio` | `tools/legacy-gas/거래처 발송 주문서/index.html:2949` | R05 | 대분류, 실내기, 실외기, #commRatio, 조합비 : ---%, bad, ⚠️ 상업 실외기 용량 없음 조합비 미표시, ko-KR, 📐 상업 조합비 계산 완료, %, 0, 100, 1, 103.0, 120.0 | 용량·최대연결·추천실외기 | [부분/불가] quantity_sync + 용량정책 필요 | 동명 존재; §4 동작축 |
| `setPreviewFoot` | `tools/legacy-gas/거래처 발송 주문서/index.html:2988` | R06 | #pvFoot, pc-spacer, 4, mo-spacer, 2, pvSubtotal | 간접 catalog/견적·주문 상태 | [부분] 견적/주문 line 도메인 | 동명 존재; §4 동작축 |
| `materialsSumForSet` | `tools/legacy-gas/거래처 발송 주문서/index.html:3002` | R03 | #ss_mat, 자재 포함 여부, 포함, 0 | 세트·구성품·수량·특징·규격 | [표현 가능] bundle_component; 시트 명시값 자동 | 동명 존재; §4 동작축 |
| `getDefaultRemoteRows` | `tools/legacy-gas/거래처 발송 주문서/index.html:3007` | R13 | 없음 | 간접 catalog/견적·주문 상태 | [부분] product 속성 + estimate config | 동명 존재; §4 동작축 |
| `getOptionRemoteRow` | `tools/legacy-gas/거래처 발송 주문서/index.html:3008` | R03 | 유선리모컨, 컬러유선리모컨 | 세트·구성품·수량·특징·규격 | [표현 가능] bundle_component; 시트 명시값 자동 | 동명 존재; §4 동작축 |
| `allowRemoteChange_` | `tools/legacy-gas/거래처 발송 주문서/index.html:3015` | R06 | 없음 | 간접 catalog/견적·주문 상태 | [부분] 견적/주문 line 도메인 | 동명 존재; §4 동작축 |
| `is1WaySet_` | `tools/legacy-gas/거래처 발송 주문서/index.html:3019` | R06 | 1 | 간접 catalog/견적·주문 상태 | [부분] 견적/주문 line 도메인 | 동명 존재; §4 동작축 |
| `getBasePanelRow` | `tools/legacy-gas/거래처 발송 주문서/index.html:3024` | R03 | 없음 | 세트·구성품·수량·특징·규격 | [표현 가능] bundle_component; 시트 명시값 자동 | 동명 존재; §4 동작축 |
| `pickPanelRow` | `tools/legacy-gas/거래처 발송 주문서/index.html:3025` | R03 | #ss_panel, #ss_p360, 원형, 판넬제외, 사각, 블랙판넬, 승강판넬, 공청판넬, 360 | 세트·구성품·수량·특징·규격 | [표현 가능] bundle_component; 시트 명시값 자동 | 동명 존재; §4 동작축 |
| `setBasePriceRightFirst` | `tools/legacy-gas/거래처 발송 주문서/index.html:3042` | R02 | due, price, priceLeft, unitPrice, list, listLeft, 출고가 | 납품가·출고가·고정DC·수식 | [부분] products 가격·고정DC; 정책/이력 별도 | 동명 존재; §4 동작축 |
| `calcSetUnitPrice` | `tools/legacy-gas/거래처 발송 주문서/index.html:3055` | R03 | #ss_panel, 판넬제외, #ss_remote_ex, #ss_remote, 🧮 싱글 세트 최종 단가, 0, 8000 | 세트·구성품·수량·특징·규격 | [표현 가능] bundle_component; 시트 명시값 자동 | 동명 존재; §4 동작축 |
| `partsForSetStrict_` | `tools/legacy-gas/거래처 발송 주문서/index.html:3085` | R03 | 없음 | 세트·구성품·수량·특징·규격 | [표현 가능] bundle_component; 시트 명시값 자동 | 동명 존재; §4 동작축 |
| `explodeSetParts` | `tools/legacy-gas/거래처 발송 주문서/index.html:3091` | R03 | #ss_mat, 자재 포함 여부, 포함, #ss_remote_ex, #ss_remote, SET, EA, 📦 구성 스냅샷, 🧾 세트 단가 입력, 🧭 배분 기준, 🏷️ 단일 배정, 🧩 다수 배정 완료, ℹ️ 실내기 또는 실외기 없음 배분 생략, ✅ 검증, 0, 6, 4, 1 | 세트·구성품·수량·특징·규격 | [표현 가능] bundle_component; 시트 명시값 자동 | 동명 존재; §4 동작축 |
| `partsForCommSet_` | `tools/legacy-gas/거래처 발송 주문서/index.html:3232` | R03 | 세트, >> 🔎 세트 구성 조회 | 세트·구성품·수량·특징·규격 | [표현 가능] bundle_component; 시트 명시값 자동 | 동명 존재; §4 동작축 |
| `inferStandCountForOutdoor_` | `tools/legacy-gas/거래처 발송 주문서/index.html:3244` | R04 | GHP방진가대 | 간접 catalog: model_code·분류·옵션 | [표현 가능] quantity_sync_*; model tuple만 | 동명 존재; legacy 사용자축, 설정 shadow |
| `recalcCommAccessories` | `tools/legacy-gas/거래처 발송 주문서/index.html:3251` | R04 | #commBody tr, .name .nm, .qty-input, 0, input, 1, 10 | 간접 catalog: model_code·분류·옵션 | [표현 가능] quantity_sync_*; model tuple만 | 동명 존재; legacy 사용자축, 설정 shadow |
| `applyHomeFilter` | `tools/legacy-gas/거래처 발송 주문서/index.html:3282` | R06 | i | 간접 catalog/견적·주문 상태 | [부분] 견적/주문 line 도메인 | 동명 존재; §4 동작축 |
| `applySingleFilter` | `tools/legacy-gas/거래처 발송 주문서/index.html:3301` | R06 | i | 간접 catalog/견적·주문 상태 | [부분] 견적/주문 line 도메인 | 동명 존재; §4 동작축 |
| `applyCommFilter` | `tools/legacy-gas/거래처 발송 주문서/index.html:3319` | R06 | i | 간접 catalog/견적·주문 상태 | [부분] 견적/주문 line 도메인 | 동명 존재; §4 동작축 |
| `updateHomeFilterOptions` | `tools/legacy-gas/거래처 발송 주문서/index.html:3339` | R13 | homeFilterL, homeFilterM, homeFilterS, i, </option> | 간접 catalog/견적·주문 상태 | [부분] product 속성 + estimate config | 동명 존재; §4 동작축 |
| `updateSingleFilterOptions` | `tools/legacy-gas/거래처 발송 주문서/index.html:3401` | R13 | singleFilterL, singleFilterM, 냉난방 스탠드, 프레스티지, 13, i, </option> | 간접 catalog/견적·주문 상태 | [부분] product 속성 + estimate config | 동명 존재; §4 동작축 |
| `updateCommFilterOptions` | `tools/legacy-gas/거래처 발송 주문서/index.html:3450` | R13 | commFilterL, commFilterM, commFilterS, i, option, 대분류 전체, 중분류 전체, 소분류 전체 | 간접 catalog/견적·주문 상태 | [부분] product 속성 + estimate config | 동명 존재; §4 동작축 |
| `buildSingleSetCompositionHtml_` | `tools/legacy-gas/거래처 발송 주문서/index.html:3961` | R06 | 실내기, 실외기, 자재, 벽걸이, indoor, [실내기], outdoor, [실외기], wall, [벽걸이], panel, [판넬], remote, [리모컨], material, [자재], font-weight:700, ,, </div>, 1, 12, 13, 1.5, 700 | 간접 catalog/견적·주문 상태 | [부분] 견적/주문 line 도메인 | 동명 존재; §4 동작축 |
| `normalizeCommCategory` | `tools/legacy-gas/거래처 발송 주문서/index.html:4026` | R01 | 부자재, 단내림몰딩 | 품명·모델·비고·분류·평형 | [표현 가능] products/classification; seed 자동·충돌 검수 | 동명 존재; §4 동작축 |
| `fixCommMidCategory` | `tools/legacy-gas/거래처 발송 주문서/index.html:4039` | R01 | 키트, 분배헤더 | 품명·모델·비고·분류·평형 | [표현 가능] products/classification; seed 자동·충돌 검수 | 동명 존재; §4 동작축 |
| `getCommFilterRows_` | `tools/legacy-gas/거래처 발송 주문서/index.html:4068` | R06 | ECO 리뉴얼 필터, MCU KIT 6실형(HR, WATER HR용), MCU KIT 4실형(HR, WATER HR용), MCU KIT 2실형(HR, WATER HR용), FCU KIT, 인체감시센서 KIT(4way), 인체감시센서 KIT(360), DMS(PC제어), 멀티Wifi KIT, 호환중계기(EHP용), 판넬, 1-Way, 2-Way, 4-Way, 360, 키트, 분배헤더, 6, 4, 2, 1 | 간접 catalog/견적·주문 상태 | [부분] 견적/주문 line 도메인 | 동명 존재; §4 동작축 |
| `buildDisplayNameComm` | `tools/legacy-gas/거래처 발송 주문서/index.html:4331` | R11 | 부자재, >> 🏷️ 부자재 표시명, 2, 1 | 간접 catalog/견적·주문 상태 | [부분] model_name/spec_text; display_name 없음 | 동명 존재; §4 동작축 |
| `buildCommSetIndex` | `tools/legacy-gas/거래처 발송 주문서/index.html:4389` | R06 | 세트, 모델명, 모델, 구성모델, Model, 수량, 구성수량, 단위, EA, 품목명, 출고가, >> 🧩 세트 인덱스 구축 완료, 10, 1, 0 | 간접 catalog/견적·주문 상태 | [부분] 견적/주문 line 도메인 | 동명 존재; §4 동작축 |
| `explodeCommPreviewParts` | `tools/legacy-gas/거래처 발송 주문서/index.html:4415` | R03 | >> ⚠️ 세트 구성 미존재, function, EA, 0, 3, 10, 1 | 세트·구성품·수량·특징·규격 | [표현 가능] bundle_component; 시트 명시값 자동 | 동명 존재; §4 동작축 |
| `isCommSetRow` | `tools/legacy-gas/거래처 발송 주문서/index.html:4429` | R06 | 실외기, SET | 간접 catalog/견적·주문 상태 | [부분] 견적/주문 line 도메인 | 동명 존재; §4 동작축 |
| `explodeCommSets_` | `tools/legacy-gas/거래처 발송 주문서/index.html:4434` | R03 | >> ⚠️ 상업 세트 전송 폭파 실패 구성 없음, function, 0, 3, 10, 1 | 세트·구성품·수량·특징·규격 | [표현 가능] bundle_component; 시트 명시값 자동 | 동명 존재; §4 동작축 |
| `syncOldTotals` | `tools/legacy-gas/거래처 발송 주문서/index.html:4584` | R06 | #oldTotal, (max-width: 1280px), 1280 | 간접 catalog/견적·주문 상태 | [부분] 견적/주문 line 도메인 | 동명 존재; §4 동작축 |
| `onHomeQtyInput` | `tools/legacy-gas/거래처 발송 주문서/index.html:4697` | R04 | ${CSS.escape(model)} | 간접 catalog: model_code·분류·옵션 | [표현 가능] quantity_sync_*; model tuple만 | 동명 존재; legacy 사용자축, 설정 shadow |
| `onSingleQtyInput` | `tools/legacy-gas/거래처 발송 주문서/index.html:4705` | R04 | ${CSS.escape(id)}, data-unitraw, #singleTotal | 간접 catalog: model_code·분류·옵션 | [표현 가능] quantity_sync_*; model tuple만 | 동명 존재; legacy 사용자축, 설정 shadow |
| `recomputeFootAll` | `tools/legacy-gas/거래처 발송 주문서/index.html:4757` | R04 | #home_foot, 0 | 간접 catalog: model_code·분류·옵션 | [표현 가능] quantity_sync_*; model tuple만 | 동명 존재; legacy 사용자축, 설정 shadow |
| `recomputeSingleBaseFoot` | `tools/legacy-gas/거래처 발송 주문서/index.html:4765` | R04 | #ss_base, 0 | 간접 catalog: model_code·분류·옵션 | [표현 가능] quantity_sync_*; model tuple만 | 동명 존재; legacy 사용자축, 설정 shadow |
| `recomputeSingleExtras` | `tools/legacy-gas/거래처 발송 주문서/index.html:4781` | R04 | #ss_remote_ex, #ss_remote, 유선리모컨, 컬러유선리모컨, 0 | 간접 catalog: model_code·분류·옵션 | [표현 가능] quantity_sync_*; model tuple만 | 동명 존재; legacy 사용자축, 설정 shadow |
| `isHomeCalcTriggerModel` | `tools/legacy-gas/거래처 발송 주문서/index.html:4806` | R06 | 없음 | 간접 catalog/견적·주문 상태 | [부분] 견적/주문 line 도메인 | 동명 존재; §4 동작축 |
| `isSingleCalcTriggerId` | `tools/legacy-gas/거래처 발송 주문서/index.html:4815` | R06 | 부자재, PC4NUFK1NW, PC4NUCK4NW, PC6NUDK1NW, PC6NUCK1NW, PC4NUFK1N, PC4NUCK1N, PC6NUDK1N, PC6NUCK1N, PC1YNWK1NW, PC1YNCK1NW, PC1YNRK1NW, PC1ZNSK1NW, PC1ZNWK1NW, PC1ZNCK1NW, PC1ZNRK1NW, 기본형, 4, 25, 360 | 간접 catalog/견적·주문 상태 | [부분] 견적/주문 line 도메인 | 동명 존재; §4 동작축 |
| `findHomePanelModel` | `tools/legacy-gas/거래처 발송 주문서/index.html:4840` | R04 | 없음 | 간접 catalog: model_code·분류·옵션 | [표현 가능] quantity_sync_*; model tuple만 | 동명 존재; legacy 사용자축, 설정 shadow |
| `pickInfinitePanelModel` | `tools/legacy-gas/거래처 발송 주문서/index.html:4855` | R04 | mid, 공청판넬, 인피니트 공청+동작감지 AI, 인피니트 25년형, 25 | 간접 catalog: model_code·분류·옵션 | [표현 가능] quantity_sync_*; model tuple만 | 동명 존재; legacy 사용자축, 설정 shadow |
| `recomputeHomePanels` | `tools/legacy-gas/거래처 발송 주문서/index.html:4879` | R04 | #home_panel, 판넬제외, s, m, b, 360, 4way, 공청판넬, 인피니트 공청+동작감지 AI, 0, 1, 4 | 간접 catalog: model_code·분류·옵션 | [표현 가능] quantity_sync_*; model tuple만 | 동명 존재; legacy 사용자축, 설정 shadow |
| `pickModel` | `tools/legacy-gas/거래처 발송 주문서/index.html:4951` | R06 | a1sWi, p1sWi, a1mWi, p1mWi, a1bWi, p1bWi, a1sNo, p1sNo, a1mNo, p1mNo, a1bNo, p1bNo, PC1YNWK1NW, PC1YNCK1NW, PC1YNRK1NW, PC1ZNSK1NW, PC1ZNWK1NW, PC1ZNCK1NW, PC1ZNRK1NW, 공청판넬, 인피니트 공청+동작감지 AI, 인피니트 25년형, PC4NUFK1NW, PC4NUCK4NW, PC6NUDK1NW, PC6NUCK1NW, PC4NUFK1N, PC4NUCK1N, PC6NUDK1N, PC6NUCK1N, 25, 4, 0 | 간접 catalog/견적·주문 상태 | [부분] 견적/주문 line 도메인 | 동명 존재; §4 동작축 |
| `recomputeHomeRemotes` | `tools/legacy-gas/거래처 발송 주문서/index.html:5005` | R04 | #home_remote, 기본, 제외, 유선, 0, 360, 1, 4 | 간접 catalog: model_code·분류·옵션 | [표현 가능] quantity_sync_*; model tuple만 | 동명 존재; legacy 사용자축, 설정 shadow |
| `recomputeHomeBranches` | `tools/legacy-gas/거래처 발송 주문서/index.html:5058` | R04 | #home_no_branch, 0 | 간접 catalog: model_code·분류·옵션 | [표현 가능] quantity_sync_*; model tuple만 | 동명 존재; legacy 사용자축, 설정 shadow |
| `recomputeHomeDerived` | `tools/legacy-gas/거래처 발송 주문서/index.html:5111` | R04 | 🧯 벽걸이 제외, 유연호스 자동계산 스킵, #home_no_hose, 1, 4, 360, 0 | 간접 catalog: model_code·분류·옵션 | [표현 가능] quantity_sync_*; model tuple만 | 동명 존재; legacy 사용자축, 설정 shadow |
| `recomputeCommDerived` | `tools/legacy-gas/거래처 발송 주문서/index.html:5165` | R04 | 1way, 2way, 4way, undefined, #comm_ex_hose, #comm_hose_i, MDP-Z075SZED, AM052DNLDBH1, AM072DNLDBH1, ADP-E075SEK3D, AM100FNLDBH1, MDP-M075SGK2D, AM130DNMDBH1, AM145DNMDBH1, ADP-G075SPK1D, AM083DNMDBH1, AM100DNMDBH1, AM110DNMDBH1, AM052ANHDBH1, AM060ANHDBH1, AM072ANHDBH1, AM083ANHDBH1, AM100ANHDBH1, AM110ANHDBH1, AM130ANHDBH1, AM145ANHDBH1, AM230ANHDBH1, ADP-N047SNK1D, AM290HNHDBH1, ADP-F075SP, AM072TNCDBH1, AM110TNCDBH1, AM130TNCDBH1, AM145TNCDBH1, SET, AXJ-TA3419M, comm_panel, 기본판넬, 판넬제외, comm_remote, 무선, 제외, comm_ex_base, ${CSS.escape(m)}, 0, 1, 2, 4 | 간접 catalog: model_code·분류·옵션 | [표현 가능] quantity_sync_*; model tuple만 | 동명 존재; legacy 사용자축, 설정 shadow |
| `computeCommPanelModelForIndoor_` | `tools/legacy-gas/거래처 발송 주문서/index.html:5348` | R04 | comm_panel, 기본판넬, comm_p360, 원형, WIFI내장, 미내장, 판넬제외, 1, 2, 4, 360 | 간접 catalog: model_code·분류·옵션 | [표현 가능] quantity_sync_*; model tuple만 | 동명 존재; legacy 사용자축, 설정 shadow |
| `syncHomeUIFromState` | `tools/legacy-gas/거래처 발송 주문서/index.html:5435` | R06 | #homeBody .qty-input, ${CSS.escape(m)}, 0 | 간접 catalog/견적·주문 상태 | [부분] 견적/주문 line 도메인 | 동명 존재; §4 동작축 |
| `syncSingleUIFromState` | `tools/legacy-gas/거래처 발송 주문서/index.html:5445` | R06 | #singleBody .qty-input, ${CSS.escape(id)}, data-unitraw, 0 | 간접 catalog/견적·주문 상태 | [부분] 견적/주문 line 도메인 | 동명 존재; §4 동작축 |
| `syncHomeTotals` | `tools/legacy-gas/거래처 발송 주문서/index.html:5456` | R06 | #homeTotal | 간접 catalog/견적·주문 상태 | [부분] 견적/주문 line 도메인 | 동명 존재; §4 동작축 |
| `explodeSendSets_` | `tools/legacy-gas/거래처 발송 주문서/index.html:5498` | R03 | 부자재, 실외기 받침, SET, EA | 세트·구성품·수량·특징·규격 | [표현 가능] bundle_component; 시트 명시값 자동 | 동명 존재; §4 동작축 |
| `isValidTel` | `tools/legacy-gas/거래처 발송 주문서/index.html:5983` | R07 | 010, 4 | 간접 catalog/견적·주문 상태 | [부분] 견적/주문 line 도메인 | 동명 존재; §4 동작축 |
| `checkOrderReady` | `tools/legacy-gas/거래처 발송 주문서/index.html:6022` | R06 | #memo, #addrBase, #tel, #sameAddr, #addrAuditBase, #btnSendOrder | 간접 catalog/견적·주문 상태 | [부분] 견적/주문 line 도메인 | 동명 존재; §4 동작축 |
| `aggregateSendRows` | `tools/legacy-gas/거래처 발송 주문서/index.html:6039` | R06 | 🧮 전송목록 병합 시작, \|\|, ✅ 전송목록 병합 완료, home, single, comm, 0 | 간접 catalog/견적·주문 상태 | [부분] 견적/주문 line 도메인 | 동명 존재; §4 동작축 |
| `buildSendRows` | `tools/legacy-gas/거래처 발송 주문서/index.html:6162` | R06 | 📦 전송행 생성 시작, SET, 대분류, number, >> 🧾 전송 목록 세트 전개(본행 제외), COMM, HOME, SINGLE, EA, 품 명, (50% DC), OLD, ✅ 전송행 생성 완료, 주문서, 0, 0.5, 50 | 간접 catalog/견적·주문 상태 | [부분] 견적/주문 line 도메인 | 동명 존재; §4 동작축 |
| `updateInlineTotals` | `tools/legacy-gas/거래처 발송 주문서/index.html:6498` | R06 | homeTotal, homeTotalInline, singleTotal, singleTotalInline, commTotal, commTotalInline | 간접 catalog/견적·주문 상태 | [부분] 견적/주문 line 도메인 | 동명 존재; §4 동작축 |
| `fixFootersForMobile` | `tools/legacy-gas/거래처 발송 주문서/index.html:6516` | R06 | #wrapHome tfoot tr, none, homeTotal, 0, homeTotalInline, #wrapSingle tfoot tr, singleTotal, singleTotalInline, #wrapComm tfoot tr, commTotal, commTotalInline, 6, 5, 2, 1, 4 | 간접 catalog/견적·주문 상태 | [부분] 견적/주문 line 도메인 | 동명 존재; §4 동작축 |
| `capFromModel` | `tools/legacy-gas/거래처 발송 주문서/index.html:6748` | R05 | 3, 1, 10, 0 | 용량·최대연결·추천실외기 | [부분/불가] quantity_sync + 용량정책 필요 | 동명 존재; §4 동작축 |
| `pickSelectedOutdoors` | `tools/legacy-gas/거래처 발송 주문서/index.html:6754` | R05 | 대분류, 실외기, #commBody .item-row, .qty-input, >> 🧲 실외기 필터, 3, 0, 10 | 용량·최대연결·추천실외기 | [부분/불가] quantity_sync + 용량정책 필요 | 동명 존재; §4 동작축 |
| `pickSelectedIndoorsExpanded` | `tools/legacy-gas/거래처 발송 주문서/index.html:6780` | R05 | 대분류, 실내기, ${CSS.escape(model)}, 0, ko, >> 🧲 실내기 확장, 3, 10, 1 | 용량·최대연결·추천실외기 | [부분/불가] quantity_sync + 용량정책 필요 | 동명 존재; §4 동작축 |
| `codeByCumulativeSum` | `tools/legacy-gas/거래처 발송 주문서/index.html:6812` | R05 | 1509, 2512, 2812, 2815, 3419, 4119, 150, 406, 464, 696, 986 | 용량·최대연결·추천실외기 | [부분/불가] quantity_sync + 용량정책 필요 | 동명 존재; §4 동작축 |
| `codeByOutdoorHP` | `tools/legacy-gas/거래처 발송 주문서/index.html:6822` | R05 | 1509, 2512, 2812, 2815, 3419, 4119, 0, 50, 100, 160, 220, 340 | 용량·최대연결·추천실외기 | [부분/불가] quantity_sync + 용량정책 필요 | 동명 존재; §4 동작축 |
| `recomputeBranchCodes` | `tools/legacy-gas/거래처 발송 주문서/index.html:6838` | R05 | ${key}, .capsule.in-grid, .code-cell, -, 0, function, 1509, 2512, 2812, 2815, 3419, 4119, ${k}, 1, 10, 3 | 용량·최대연결·추천실외기 | [부분/불가] quantity_sync + 용량정책 필요 | 동명 존재; §4 동작축 |
| `canOpenBranch` | `tools/legacy-gas/거래처 발송 주문서/index.html:6899` | R06 | 실외기, 실내기, 0 | 간접 catalog/견적·주문 상태 | [부분] 견적/주문 line 도메인 | 동명 존재; §4 동작축 |
| `ensureBranchScaffold` | `tools/legacy-gas/거래처 발송 주문서/index.html:6939` | R06 | .wrap, pageBranch, section, hidden, >> 🧱 pageBranch 생성, >> 🔀 pageBranch wrap으로 이동, branchTopbar, div, branch-top, branch-title, branchSummaryBar, branch-summarybar, 1509, 2512, 2812, 2815, 3419, 4119, >> 🧱 합계 패널 생성, branchBoard, >> 🧱 branchBoard 생성, .branch-option,.branch-toolbar,#btnBackToComm,#btnBranchApply, >> 🧹 옵션 제거 완료, 0 | 간접 catalog/견적·주문 상태 | [부분] 견적/주문 line 도메인 | 동명 존재; §4 동작축 |
| `syncCommQtyFromDOM` | `tools/legacy-gas/거래처 발송 주문서/index.html:6989` | R04 | #commBody .qty-input, >> 🔄 수량 싱크, 0 | 간접 catalog: model_code·분류·옵션 | [표현 가능] quantity_sync_*; model tuple만 | 동명 존재; legacy 사용자축, 설정 shadow |
| `backToComm` | `tools/legacy-gas/거래처 발송 주문서/index.html:7015` | R06 | branch-active, pageBranch, hidden, .view-group button, #btnPreview, #btnHistory, #btnSaveSnapshot, #btnLoadSnapshot, comm-active, smooth, beforeunload, ↩️ 상업멀티로 복귀, 0 | 간접 catalog/견적·주문 상태 | [부분] 견적/주문 line 도메인 | 동명 존재; §4 동작축 |
| `debugIndoorsScan` | `tools/legacy-gas/거래처 발송 주문서/index.html:7028` | R06 | 실내기, >> 🔎 실내기 스캔, 0, 8 | 간접 catalog/견적·주문 상태 | [부분] 견적/주문 line 도메인 | 동명 존재; §4 동작축 |
| `updateBranchTopButton` | `tools/legacy-gas/거래처 발송 주문서/index.html:7037` | R06 | btnOpenBranch, branch-active, 상업멀티, 분기계산, 🧭 상단 버튼 라벨 갱신: | 간접 catalog/견적·주문 상태 | [부분] 견적/주문 line 도메인 | 동명 존재; §4 동작축 |
| `handleBranchToggleClick` | `tools/legacy-gas/거래처 발송 주문서/index.html:7047` | R06 | branch-active, 상업멀티 | 간접 catalog/견적·주문 상태 | [부분] 견적/주문 line 도메인 | 동명 존재; §4 동작축 |
| `setBranchTopButtonForBranch` | `tools/legacy-gas/거래처 발송 주문서/index.html:7056` | R06 | btnOpenBranch, 상업멀티, 분기계산, 🧭 상단 버튼 전환 | 간접 catalog/견적·주문 상태 | [부분] 견적/주문 line 도메인 | 동명 존재; §4 동작축 |
| `fixBranchDOM` | `tools/legacy-gas/거래처 발송 주문서/index.html:7133` | R06 | .indoor-cell, .out-head, out${c+1}, 🧩 DOM 보정 완료, 1 | 간접 catalog/견적·주문 상태 | [부분] 견적/주문 line 도메인 | 동명 존재; §4 동작축 |
| `limitByOutdoor` | `tools/legacy-gas/거래처 발송 주문서/index.html:7331` | R06 | 103, 120 | 간접 catalog/견적·주문 상태 | [부분] 견적/주문 line 도메인 | 동명 존재; §4 동작축 |
| `sumCapsIn` | `tools/legacy-gas/거래처 발송 주문서/index.html:7334` | R06 | ${slot}, .capsule, 0 | 간접 catalog/견적·주문 상태 | [부분] 견적/주문 line 도메인 | 동명 존재; §4 동작축 |
| `firstBranchByOutdoorCap` | `tools/legacy-gas/거래처 발송 주문서/index.html:7340` | R06 | AXJ-YA1509N, AXJ-YA2512N, AXJ-YA2812M, AXJ-YA2815M, AXJ-YA3419M, AXJ-YA4119M, 140, 260, 280, 340, 410 | 간접 catalog/견적·주문 상태 | [부분] 견적/주문 line 도메인 | 동명 존재; §4 동작축 |
| `updateBranchRatios` | `tools/legacy-gas/거래처 발송 주문서/index.html:7350` | R05 | ${slot}, 0, 용량, 능력, 품    명, 품명, 품 목 명, ratio-bad, 📊 조합비, 1, 3, 072, 7.2, 110, 11.0, 10, 0.1, 100, 103.0, 120.0 | 용량·최대연결·추천실외기 | [부분/불가] quantity_sync + 용량정책 필요 | 동명 존재; §4 동작축 |
| `setCommBranchQtyByLike` | `tools/legacy-gas/거래처 발송 주문서/index.html:7394` | R04 | 분기관, ${CSS.escape(row.model)}, 0 | 간접 catalog: model_code·분류·옵션 | [표현 가능] quantity_sync_*; model tuple만 | 동명 존재; legacy 사용자축, 설정 shadow |
| `pushBranchPartsToCommFromBadges` | `tools/legacy-gas/거래처 발송 주문서/index.html:7403` | R04 | 1509, AXJ-YA1509N, 2512, AXJ-YA2512N, 2812, AXJ-YA2812M, 2815, AXJ-YA2815M, 3419, AXJ-YA3419M, 4119, AXJ-YA4119M, .code-cell, ${CSS.escape(model)}, 🔗 상업멀티 반영, BRANCH_STATE_V1, 0, 1 | 간접 catalog: model_code·분류·옵션 | [표현 가능] quantity_sync_*; model tuple만 | 동명 존재; legacy 사용자축, 설정 shadow |
| `snapshotBranchState` | `tools/legacy-gas/거래처 발송 주문서/index.html:7426` | R08 | .indoor-cell, .capsule:not(.in-grid), 0, .out-head, out${i}, .capsule.in-grid, 10, 1 | 간접 catalog/견적·주문 상태 | [불가] estimate/order snapshot 도메인 | 동명 존재; §4 동작축 |
| `saveBranchState` | `tools/legacy-gas/거래처 발송 주문서/index.html:7443` | R06 | 💾 세션 저장, ⚠️ 저장 실패 | 간접 catalog/견적·주문 상태 | [부분] 견적/주문 line 도메인 | 동명 존재; §4 동작축 |
| `loadBranchState` | `tools/legacy-gas/거래처 발송 주문서/index.html:7450` | R06 | ⚠️ 로드 실패, beforeunload | 간접 catalog/견적·주문 상태 | [부분] 견적/주문 line 도메인 | 동명 존재; §4 동작축 |
| `applyBranchState` | `tools/legacy-gas/거래처 발송 주문서/index.html:7461` | R06 | .indoor-cell, dragstart, text/plain, left, 0, .out-head, out${i}, .btn-x, click, 📦 상태 적용, 선택(수량>0), 10, 1 | 간접 catalog/견적·주문 상태 | [부분] 견적/주문 line 도메인 | 동명 존재; §4 동작축 |
| `canOpenBranchFromComm` | `tools/legacy-gas/거래처 발송 주문서/index.html:7511` | R06 | #commBody .qty-input, 대분류, 실외기, 실내기, 0 | 간접 catalog/견적·주문 상태 | [부분] 견적/주문 line 도메인 | 동명 존재; §4 동작축 |
| `isNoMainUnit` | `tools/legacy-gas/거래처 발송 주문서/index.html:7685` | R12 | undefined, 0 | 간접 catalog/견적·주문 상태 | [불가] 견적 가격정책 | 동명 존재; §4 동작축 |
| `getTierBonusRate` | `tools/legacy-gas/거래처 발송 주문서/index.html:7724` | R12 | 100000000, 0.04, 50000000, 0.03, 30000000, 0.02, 10000000, 0.01, 0 | 간접 catalog/견적·주문 상태 | [불가] 견적 가격정책 | 동명 존재; §4 동작축 |
| `isStandard45` | `tools/legacy-gas/거래처 발송 주문서/index.html:7733` | R12 | 0.45, 0.001 | 간접 catalog/견적·주문 상태 | [불가] 견적 가격정책 | 동명 존재; §4 동작축 |
| `runWithAdjustedRates` | `tools/legacy-gas/거래처 발송 주문서/index.html:7738` | R12 | function, %, HOME, COMM, string, 0, 0.40, 0.48, 100, -1 | 간접 catalog/견적·주문 상태 | [불가] 견적 가격정책 | 동명 존재; §4 동작축 |
| `buildSendRows` | `tools/legacy-gas/거래처 발송 주문서/index.html:7841` | R06 | #btnBizQuery, #bizGateInput, #stepBizInput, #stepAuthAction, input, -, click, 사업자번호를 정확히 입력해주세요., 오류:, 0, 9, 10, 4, 6, 3, 2, 5 | 간접 catalog/견적·주문 상태 | [부분] 견적/주문 line 도메인 | 동명 존재; §4 동작축 |
| `fetchOrderHistory` | `tools/legacy-gas/거래처 발송 주문서/index.html:8429` | R08 | #historyLoading, hidden, #histDateType, #histStart, #histEnd, 조회 실패: | 간접 catalog/견적·주문 상태 | [불가] estimate/order snapshot 도메인 | 동명 존재; §4 동작축 |
| `comma` | `tools/legacy-gas/거래처 발송 주문서/index.html:8499` | R06 | text-align:left, text-align:right, #detailContent, detail-biz-box, detail-table, 20%, 10%, 18%, detail-sum-row, 4, text-align:center, detail-info-box, detail-label, #dlgOrderDetail, 0, 20, 10, 18 | 간접 catalog/견적·주문 상태 | [부분] 견적/주문 line 도메인 | 동명 존재; §4 동작축 |
| `getBaseListPrice` | `tools/legacy-gas/종합견적서/index.html:2156` | R02 | home, chkHomeInc, comm, chkCommInc, single, chkSingleInc | 납품가·출고가·고정DC·수식 | [부분] products 가격·고정DC; 정책/이력 별도 | 동명 존재; §4 동작축 |
| `getModelFlags` | `tools/legacy-gas/종합견적서/index.html:2200` | R01 | AC, 6, P, 4, D, 1, AP, C, H, AP230, AP290, F, 9, 7, 8, 11, 10 | 품명·모델·비고·분류·평형 | [표현 가능] products/classification; seed 자동·충돌 검수 | 동명 존재; §4 동작축 |
| `getRealHomePrice` | `tools/legacy-gas/종합견적서/index.html:2230` | R02 | 없음 | 납품가·출고가·고정DC·수식 | [부분] products 가격·고정DC; 정책/이력 별도 | 동명 존재; §4 동작축 |
| `getRealCommPrice` | `tools/legacy-gas/종합견적서/index.html:2235` | R02 | 없음 | 납품가·출고가·고정DC·수식 | [부분] products 가격·고정DC; 정책/이력 별도 | 동명 존재; §4 동작축 |
| `getRealSinglePrice` | `tools/legacy-gas/종합견적서/index.html:2240` | R02 | 0 | 납품가·출고가·고정DC·수식 | [부분] products 가격·고정DC; 정책/이력 별도 | 동명 존재; §4 동작축 |
| `getRealOldPrice` | `tools/legacy-gas/종합견적서/index.html:2246` | R02 | #old_rate, 50, undefined, old, 0, 10, 1, 100 | 납품가·출고가·고정DC·수식 | [부분] products 가격·고정DC; 정책/이력 별도 | 동명 존재; §4 동작축 |
| `applyConfigFromServer` | `tools/legacy-gas/종합견적서/index.html:2272` | R02 | ROUND, 0 | 납품가·출고가·고정DC·수식 | [부분] products 가격·고정DC; 정책/이력 별도 | 동명 존재; §4 동작축 |
| `applyCustomerDiscounts` | `tools/legacy-gas/종합견적서/index.html:2293` | R09 | 없음 | 없음(Notion 거래처DC) | [불가] partner 가격정책 | 동명 존재; §4 동작축 |
| `getRealListPrice` | `tools/legacy-gas/종합견적서/index.html:2354` | R02 | HOME, undefined, COMM, SINGLE, OLD | 납품가·출고가·고정DC·수식 | [부분] products 가격·고정DC; 정책/이력 별도 | 동명 존재; §4 동작축 |
| `getRealSpec` | `tools/legacy-gas/종합견적서/index.html:2383` | R11 | HOME, undefined, COMM, OLD | 간접 catalog/견적·주문 상태 | [부분] model_name/spec_text; display_name 없음 | 동명 존재; §4 동작축 |
| `handleListPriceInput` | `tools/legacy-gas/종합견적서/index.html:2451` | R02 | home, comm, single, old, undefined, #374151, normal, #2563eb, bold, tr, .price-input, ${CSS.escape(key)}, function, .sub-cell, 0, 9, 374151, 10, 2563 | 납품가·출고가·고정DC·수식 | [부분] products 가격·고정DC; 정책/이력 별도 | 동명 존재; §4 동작축 |
| `makeListPriceInput` | `tools/legacy-gas/종합견적서/index.html:2542` | R02 | home, undefined, comm, single, old, color:#2563eb; font-weight:bold;, color:#374151; font-weight:normal;, width:100px; margin:0 auto; position:relative;, text, list-price-input, ${(Number(finalVal)\|\|0) > 0 ? (Number(finalVal)).toLocaleString() : ''}, this.select(), handleListPriceInput(event, '${type}', '${key}'), numeric, 2563, 374151, 100, 0, 1, 4, 8, 14 | 납품가·출고가·고정DC·수식 | [부분] products 가격·고정DC; 정책/이력 별도 | 동명 존재; §4 동작축 |
| `handlePriceInput` | `tools/legacy-gas/종합견적서/index.html:2568` | R02 | home, comm, single, old, old_rate, 50, #374151, normal, #2563eb, bold, tr, .qty-input, [data-sub], [data-csub], [data-ss], .sub-cell, function, undefined, ${CSS.escape(key)}, data-m, .part-price-single, .price, .part-qty-single, 0, .sub, .val-for-text, 9, 10, 1, 100, 374151, 2563 | 납품가·출고가·고정DC·수식 | [부분] products 가격·고정DC; 정책/이력 별도 | 동명 존재; §4 동작축 |
| `makePriceInput` | `tools/legacy-gas/종합견적서/index.html:2672` | R02 | home, undefined, comm, single, old, color:#2563eb; font-weight:bold;, color:#374151; font-weight:normal;, width:100px; margin:0 auto; position:relative;, text, price-input, ${(Number(finalVal)\|\|0).toLocaleString()}, this.select(), handlePriceInput(event, '${type}', '${key}'), numeric, 2563, 374151, 100, 0, 1, 4, 8, 14 | 납품가·출고가·고정DC·수식 | [부분] products 가격·고정DC; 정책/이력 별도 | 동명 존재; §4 동작축 |
| `handleFreightInput` | `tools/legacy-gas/종합견적서/index.html:2699` | R02 | 0, undefined, #2563eb, bold, #374151, normal, tr, input.qty-input[type="hidden"], 1, .qty-static, function, .sub, .sub-cell, [data-sub], [data-ss], [data-csub], 9, 10, 2563, 374151 | 납품가·출고가·고정DC·수식 | [부분] products 가격·고정DC; 정책/이력 별도 | 동명 존재; §4 동작축 |
| `parseFixedDc` | `tools/legacy-gas/종합견적서/index.html:2834` | R02 | number, 1, 100, 0, 0.99 | 납품가·출고가·고정DC·수식 | [부분] products 가격·고정DC; 정책/이력 별도 | 동명 존재; §4 동작축 |
| `getStockState_` | `tools/legacy-gas/종합견적서/index.html:2856` | R01 | SOLD, FUTURE, ., 예정, OK, 기본, 2, 2000, 1, 10, 3, 0 | 품명·모델·비고·분류·평형 | [표현 가능] products/classification; seed 자동·충돌 검수 | 동명 존재; §4 동작축 |
| `modelExists` | `tools/legacy-gas/종합견적서/index.html:2882` | R06 | 없음 | 간접 catalog/견적·주문 상태 | [부분] 견적/주문 line 도메인 | 동명 존재; §4 동작축 |
| `isPanelRow` | `tools/legacy-gas/종합견적서/index.html:2884` | R01 | 없음 | 품명·모델·비고·분류·평형 | [표현 가능] products/classification; seed 자동·충돌 검수 | 동명 존재; §4 동작축 |
| `isRemoteRow` | `tools/legacy-gas/종합견적서/index.html:2897` | R01 | 없음 | 품명·모델·비고·분류·평형 | [표현 가능] products/classification; seed 자동·충돌 검수 | 동명 존재; §4 동작축 |
| `clearAllPanels` | `tools/legacy-gas/종합견적서/index.html:2901` | R06 | 0 | 간접 catalog/견적·주문 상태 | [부분] 견적/주문 line 도메인 | 동명 존재; §4 동작축 |
| `clearAllRemotes` | `tools/legacy-gas/종합견적서/index.html:2904` | R06 | 0 | 간접 catalog/견적·주문 상태 | [부분] 견적/주문 line 도메인 | 동명 존재; §4 동작축 |
| `pickPanelBy` | `tools/legacy-gas/종합견적서/index.html:2909` | R03 | 없음 | 세트·구성품·수량·특징·규격 | [표현 가능] bundle_component; 시트 명시값 자동 | 동명 존재; §4 동작축 |
| `stripCommKeywords` | `tools/legacy-gas/종합견적서/index.html:2958` | R11 | S, (사각 WIFI), 사각 WIFI, $1, 1, 2, 4, 360 | 간접 catalog/견적·주문 상태 | [부분] model_name/spec_text; display_name 없음 | 동명 존재; §4 동작축 |
| `displayOverrides` | `tools/legacy-gas/종합견적서/index.html:2980` | R11 | home, 유선리모컨 컬러 에어콤보용, 520 일자발, 730 일자발, single, 실링용 드레인펌프, 4, 6, 520, 8, 12, 730 | 간접 catalog/견적·주문 상태 | [부분] model_name/spec_text; display_name 없음 | 동명 존재; §4 동작축 |
| `adjustSingleSetBasePrice` | `tools/legacy-gas/종합견적서/index.html:2992` | R02 | acc, #ss_disc_360, #ss_disc_4way, #ss_disc_stand, #ss_disc_1way, #ss_disc_deluxe, #ss_disc_grade1, 0, 10 | 납품가·출고가·고정DC·수식 | [부분] products 가격·고정DC; 정책/이력 별도 | 동명 존재; §4 동작축 |
| `isIndoorUnitPart` | `tools/legacy-gas/종합견적서/index.html:3054` | R06 | 없음 | 간접 catalog/견적·주문 상태 | [부분] 견적/주문 line 도메인 | 동명 존재; §4 동작축 |
| `isOutdoorUnitPart` | `tools/legacy-gas/종합견적서/index.html:3067` | R06 | 없음 | 간접 catalog/견적·주문 상태 | [부분] 견적/주문 line 도메인 | 동명 존재; §4 동작축 |
| `splitIndoorOutdoorToK` | `tools/legacy-gas/종합견적서/index.html:3078` | R02 | 0, 1000 | 납품가·출고가·고정DC·수식 | [부분] products 가격·고정DC; 정책/이력 별도 | 동명 존재; §4 동작축 |
| `analyzeSingleSetDiscountFlags` | `tools/legacy-gas/종합견적서/index.html:3106` | R02 | acc, #ss_disc_360, #ss_disc_4way, #ss_disc_stand, #ss_disc_1way, #ss_disc_deluxe, #ss_disc_grade1, 0, 10 | 납품가·출고가·고정DC·수식 | [부분] products 가격·고정DC; 정책/이력 별도 | 동명 존재; §4 동작축 |
| `getSpecModelName` | `tools/legacy-gas/종합견적서/index.html:3140` | R11 | specTitle, 스펙, 1 | 간접 catalog/견적·주문 상태 | [부분] model_name/spec_text; display_name 없음 | 동명 존재; §4 동작축 |
| `isCommIndoorRow` | `tools/legacy-gas/종합견적서/index.html:3628` | R01 | AM, N, 7, 6 | 품명·모델·비고·분류·평형 | [표현 가능] products/classification; seed 자동·충돌 검수 | 동명 존재; §4 동작축 |
| `isCommOutdoorRow` | `tools/legacy-gas/종합견적서/index.html:3634` | R01 | AM, X, 7, 6 | 품명·모델·비고·분류·평형 | [표현 가능] products/classification; seed 자동·충돌 검수 | 동명 존재; §4 동작축 |
| `commIndoorKind` | `tools/legacy-gas/종합견적서/index.html:3640` | R01 | 360, 4way, 2way, 1way, 4, 2, 1 | 품명·모델·비고·분류·평형 | [표현 가능] products/classification; seed 자동·충돌 검수 | 동명 존재; §4 동작축 |
| `isCommPanelRow` | `tools/legacy-gas/종합견적서/index.html:3650` | R01 | 없음 | 품명·모델·비고·분류·평형 | [표현 가능] products/classification; seed 자동·충돌 검수 | 동명 존재; §4 동작축 |
| `isCommHoseRow` | `tools/legacy-gas/종합견적서/index.html:3656` | R01 | 없음 | 품명·모델·비고·분류·평형 | [표현 가능] products/classification; seed 자동·충돌 검수 | 동명 존재; §4 동작축 |
| `isCommRemoteRow` | `tools/legacy-gas/종합견적서/index.html:3662` | R01 | 없음 | 품명·모델·비고·분류·평형 | [표현 가능] products/classification; seed 자동·충돌 검수 | 동명 존재; §4 동작축 |
| `isCommPumpRow` | `tools/legacy-gas/종합견적서/index.html:3668` | R01 | 없음 | 품명·모델·비고·분류·평형 | [표현 가능] products/classification; seed 자동·충돌 검수 | 동명 존재; §4 동작축 |
| `computeCommRemoteModelForIndoor_` | `tools/legacy-gas/종합견적서/index.html:3674` | R04 | comm_remote, 무선, 제외, AWR-VH12N, 컬러유선, AWR-WG00N, AWR-WE13N, 유선, AR-CH01, AR-EH05, 360 | 간접 catalog: model_code·분류·옵션 | [표현 가능] quantity_sync_*; model tuple만 | 동명 존재; legacy 사용자축, 설정 shadow |
| `pickHoseModel` | `tools/legacy-gas/종합견적서/index.html:3706` | R04 | 1way, 4way, 360, 1, 4 | 간접 catalog: model_code·분류·옵션 | [표현 가능] quantity_sync_*; model tuple만 | 동명 존재; legacy 사용자축, 설정 shadow |
| `pickCommPanelModel` | `tools/legacy-gas/종합견적서/index.html:3714` | R04 | comm_panel | 간접 catalog: model_code·분류·옵션 | [표현 가능] quantity_sync_*; model tuple만 | 동명 존재; legacy 사용자축, 설정 shadow |
| `parseSetHPs` | `tools/legacy-gas/종합견적서/index.html:3727` | R04 | +, 1, 0, 9 | 간접 catalog: model_code·분류·옵션 | [표현 가능] quantity_sync_*; model tuple만 | 동명 존재; legacy 사용자축, 설정 shadow |
| `chooseBaseModel` | `tools/legacy-gas/종합견적서/index.html:3734` | R04 | 4, 5, 6, 3.5, SI-AL600a, 8, 10, 12, 14, 7.5, SI-AL700a, GHP방진가대, ACL-KORGHP07, 방진가대S2소, 16, 18, 20, 방진가대S2중, 22, 24, 26, 28, 방진가대S2대, 30, 32, 34 | 간접 catalog: model_code·분류·옵션 | [표현 가능] quantity_sync_*; model tuple만 | 동명 존재; legacy 사용자축, 설정 shadow |
| `modelByNameLike` | `tools/legacy-gas/종합견적서/index.html:3791` | R06 | \\$&, i | 간접 catalog/견적·주문 상태 | [부분] 견적/주문 line 도메인 | 동명 존재; §4 동작축 |
| `countBranchForSet` | `tools/legacy-gas/종합견적서/index.html:3804` | R04 | AF-R09A, AM035FXMRHC1, AM050MXMRBC1, AM050FXMRHC1, AF-R12A, AM075FXMRHC1, 254,205,211, 255,219,199, 255,236,179, 199,232,239, 187,222,251, 209,196,233, 200,230,201, 255,204,188, 255,180,189, 197,225,165, 179,229,252, 225,190,231, 248,187,208, 255,224,178, 178,235,242, 174,213,129, 255,204,128, 206,147,216, 255,171,145, 129,199,132, 128,222,234, 159,168,218, 255,183,77, 244,143,177, 0, 1, 254, 205, 211, 255, 219, 199, 236, 179, 232, 239, 187, 222, 251, 209, 196, 233, 200, 230, 201, 204, 188, 180, 189, 197, 225, 165, 229, 252, 190, 231, 248, 208, 224, 178, 235, 242, 174, 213, 129, 128, 206, 147, 216, 171, 145, 132, 234, 159, 168, 218, 183, 77, 244, 143, 177 | 간접 catalog: model_code·분류·옵션 | [표현 가능] quantity_sync_*; model tuple만 | 동명 존재; legacy 사용자축, 설정 shadow |
| `applyHomeMultiPriceVat` | `tools/legacy-gas/종합견적서/index.html:3834` | R02 | 0 | 납품가·출고가·고정DC·수식 | [부분] products 가격·고정DC; 정책/이력 별도 | 동명 존재; §4 동작축 |
| `normalizeHomeCategory` | `tools/legacy-gas/종합견적서/index.html:3841` | R01 | 부자재, 분기관, 리모컨, 전열교환기, 에어콤보, 인테리어핏, 시스템제습기, 실외기 받침대, 원형발통, 일자발, 1-Way 인피니트 UV, 1-Way 인피니트 일반, 1 | 품명·모델·비고·분류·평형 | [표현 가능] products/classification; seed 자동·충돌 검수 | 동명 존재; §4 동작축 |
| `isExpansionModel` | `tools/legacy-gas/종합견적서/index.html:3856` | R01 | AC, CS, 프레스티지, AP, CA, AF70, 24, 25, AF80, AF90, 7, 5, 10, 8 | 품명·모델·비고·분류·평형 | [표현 가능] products/classification; seed 자동·충돌 검수 | 동명 존재; §4 동작축 |
| `classifySingleSetFixed` | `tools/legacy-gas/종합견적서/index.html:3869` | R01 | 부자재, 기타, 실외기 받침, 360, CST UV, 4way 냉난방, 4way 냉방전용, 프레스티지, 프리미엄/디럭스, 1등급, 1way 냉난방, 1way 냉방전용, 덕트, 실링, 비스포크 스탠드, 콰이엇 그레이, 세이지 블루, 프라임 핑크, 냉난방 스탠드, 냉전 스탠드, 냉난방 벽걸이, 무풍, 냉전 벽걸이, 일반, 가정용 에어컨, 무풍콤보 갤러리프로, Q9000, 무풍클래식, 무풍갤러리, 24년형, 4, 1, 5, 24 | 품명·모델·비고·분류·평형 | [표현 가능] products/classification; seed 자동·충돌 검수 | 동명 존재; §4 동작축 |
| `priceFrom` | `tools/legacy-gas/종합견적서/index.html:3910` | R02 | price, unitPrice, priceRight, list, 출고가, listPrice, msrp, wholesale, 출고가Left, listLeft | 납품가·출고가·고정DC·수식 | [부분] products 가격·고정DC; 정책/이력 별도 | 동명 존재; §4 동작축 |
| `homeUnitPrice` | `tools/legacy-gas/종합견적서/index.html:3928` | R02 | home_hose_i, home, undefined, ${CSS.escape(model)}, 고정DC, .var-dc-chk, .fix-dc-inp, home_rate, 45, 0, 7000, 100, 1 | 납품가·출고가·고정DC·수식 | [부분] products 가격·고정DC; 정책/이력 별도 | 동명 존재; §4 동작축 |
| `partUnitPrice` | `tools/legacy-gas/종합견적서/index.html:3974` | R02 | price, unitPrice, list, 출고가, listPrice, msrp, chkSingleInc, undefined, 7000 | 납품가·출고가·고정DC·수식 | [부분] products 가격·고정DC; 정책/이력 별도 | 동명 존재; §4 동작축 |
| `singleUnitPrice` | `tools/legacy-gas/종합견적서/index.html:3989` | R02 | chkSingleInc, undefined, acc, #ss_disc_360, #ss_disc_4way, #ss_disc_stand, #ss_disc_1way, #ss_disc_deluxe, #ss_disc_grade1, 0, 7000, 10 | 납품가·출고가·고정DC·수식 | [부분] products 가격·고정DC; 정책/이력 별도 | 동명 존재; §4 동작축 |
| `commUnitPrice` | `tools/legacy-gas/종합견적서/index.html:4039` | R02 | comm_hose_i, comm, undefined, ${CSS.escape(model)}, 고정DC, .var-dc-chk, .fix-dc-inp, comm_rate, 45, 0, 7000, 100, 1 | 납품가·출고가·고정DC·수식 | [부분] products 가격·고정DC; 정책/이력 별도 | 동명 존재; §4 동작축 |
| `singleDispNameTrimmed` | `tools/legacy-gas/종합견적서/index.html:4085` | R11 | 실링용 드레인펌프, 냉전, 4WAY, 4 Way, 4-Way, 1WAY, 1 Way, 1-Way, 25년형, 가정용, 비스포크, 스탠드, 벽걸이, 실링, 덕트, 디럭스, \\s*, gi, single, PC1MWSK3NW, PC1NWSK3NW, PC1BWSK3NW, PC4NUFK1NW, PC6NUDK1NW, PC1MWCK3NW, PC1NWCK3NW, PC1BWCK3NW, PC4NUCK4NW, PC6NUCK1NW, PC1MWSK3N, PC1NWSK3N, PC1BWSK3N, PC4NUFK1N, PC6NUDK1N, PC1MWCK3N, PC1NWCK3N, PC1BWCK3N, PC4NUCK1N, PC6NUCK1N, PC1YNSK1NW, PC1ZNSK1NW, PC1YNWK1NW, PC1ZNWK1NW, PC1YNRK1NW, PC1ZNRK1NW, 4, 1, 25, 2 | 간접 catalog/견적·주문 상태 | [부분] model_name/spec_text; display_name 없음 | 동명 존재; §4 동작축 |
| `markAutoHome` | `tools/legacy-gas/종합견적서/index.html:4130` | R06 | 없음 | 간접 catalog/견적·주문 상태 | [부분] 견적/주문 line 도메인 | 동명 존재; §4 동작축 |
| `markAutoSingle` | `tools/legacy-gas/종합견적서/index.html:4131` | R06 | 없음 | 간접 catalog/견적·주문 상태 | [부분] 견적/주문 line 도메인 | 동명 존재; §4 동작축 |
| `sumHome` | `tools/legacy-gas/종합견적서/index.html:4248` | R06 | 0 | 간접 catalog/견적·주문 상태 | [부분] 견적/주문 line 도메인 | 동명 존재; §4 동작축 |
| `sumSingles` | `tools/legacy-gas/종합견적서/index.html:4249` | R06 | 0 | 간접 catalog/견적·주문 상태 | [부분] 견적/주문 line 도메인 | 동명 존재; §4 동작축 |
| `sumComm` | `tools/legacy-gas/종합견적서/index.html:4250` | R06 | 0 | 간접 catalog/견적·주문 상태 | [부분] 견적/주문 line 도메인 | 동명 존재; §4 동작축 |
| `syncCommTotals` | `tools/legacy-gas/종합견적서/index.html:4255` | R06 | commCustomBody, .custom-item-row, .custom-qty, 0, .custom-price, #commTotal, 10, 9 | 간접 catalog/견적·주문 상태 | [부분] 견적/주문 line 도메인 | 동명 존재; §4 동작축 |
| `setFootSum` | `tools/legacy-gas/종합견적서/index.html:4271` | R06 | home, single, comm, old | 간접 catalog/견적·주문 상태 | [부분] 견적/주문 line 도메인 | 동명 존재; §4 동작축 |
| `getCapacity` | `tools/legacy-gas/종합견적서/index.html:4465` | R05 | 0 | 용량·최대연결·추천실외기 | [부분/불가] quantity_sync + 용량정책 필요 | 동명 존재; §4 동작축 |
| `updateHomeRatio` | `tools/legacy-gas/종합견적서/index.html:4472` | R05 | AJ072, AM072, AM083, AJ025, homeRecommendHp, 추천 실외기:, -, #homeRatio, 조합비 : ---%, bad, 조합 불가, #dc2626, 조합불가, 최대 실내기 허용 대수 초과 주의!, EXCEED, ko-KR, %, 0, 2, 100, 1, 130 | 용량·최대연결·추천실외기 | [부분/불가] quantity_sync + 용량정책 필요 | 동명 존재; §4 동작축 |
| `updateCommRatio` | `tools/legacy-gas/종합견적서/index.html:4559` | R05 | Y형 분기관, commRecommendHp, 추천 실외기:, -, #commRatio, color: #dc2626;, bad, color: #dc2626; font-weight: bold;, EXCEED, ko-KR, %, 0, 1, 100, 103.0, 120.0 | 용량·최대연결·추천실외기 | [부분/불가] quantity_sync + 용량정책 필요 | 동명 존재; §4 동작축 |
| `setPreviewFoot` | `tools/legacy-gas/종합견적서/index.html:4649` | R06 | pvFoot, pc-spacer, 4, mo-spacer, 2, text-align:right; padding-right:10px;, font-weight:normal; font-size:0.9em; margin-left:4px;, pvSubtotal, 10, 0.9 | 간접 catalog/견적·주문 상태 | [부분] 견적/주문 line 도메인 | 동명 존재; §4 동작축 |
| `materialsSumForSet` | `tools/legacy-gas/종합견적서/index.html:4665` | R03 | #ss_mat, 자재 포함 여부, 포함, 0 | 세트·구성품·수량·특징·규격 | [표현 가능] bundle_component; 시트 명시값 자동 | 동명 존재; §4 동작축 |
| `getDefaultRemoteRows` | `tools/legacy-gas/종합견적서/index.html:4670` | R13 | 없음 | 간접 catalog/견적·주문 상태 | [부분] product 속성 + estimate config | 동명 존재; §4 동작축 |
| `getOptionRemoteRow` | `tools/legacy-gas/종합견적서/index.html:4671` | R03 | 유선리모컨, 컬러유선리모컨 | 세트·구성품·수량·특징·규격 | [표현 가능] bundle_component; 시트 명시값 자동 | 동명 존재; §4 동작축 |
| `allowRemoteChange_` | `tools/legacy-gas/종합견적서/index.html:4678` | R06 | 없음 | 간접 catalog/견적·주문 상태 | [부분] 견적/주문 line 도메인 | 동명 존재; §4 동작축 |
| `is1WaySet_` | `tools/legacy-gas/종합견적서/index.html:4682` | R06 | 1 | 간접 catalog/견적·주문 상태 | [부분] 견적/주문 line 도메인 | 동명 존재; §4 동작축 |
| `getBasePanelRow` | `tools/legacy-gas/종합견적서/index.html:4687` | R03 | 없음 | 세트·구성품·수량·특징·규격 | [표현 가능] bundle_component; 시트 명시값 자동 | 동명 존재; §4 동작축 |
| `pickPanelRow` | `tools/legacy-gas/종합견적서/index.html:4688` | R03 | #ss_panel, #ss_p360, 원형, 판넬제외, 사각, 블랙판넬, 승강판넬, 공청판넬, 360 | 세트·구성품·수량·특징·규격 | [표현 가능] bundle_component; 시트 명시값 자동 | 동명 존재; §4 동작축 |
| `setBasePriceRightFirst` | `tools/legacy-gas/종합견적서/index.html:4705` | R02 | price, priceLeft, unitPrice, list, listLeft, 출고가 | 납품가·출고가·고정DC·수식 | [부분] products 가격·고정DC; 정책/이력 별도 | 동명 존재; §4 동작축 |
| `calcSetUnitPrice` | `tools/legacy-gas/종합견적서/index.html:4715` | R03 | chkSingleInc, undefined, #ss_panel, 판넬제외, #ss_remote_ex, #ss_remote, 0, 7000 | 세트·구성품·수량·특징·규격 | [표현 가능] bundle_component; 시트 명시값 자동 | 동명 존재; §4 동작축 |
| `partsForSetStrict_` | `tools/legacy-gas/종합견적서/index.html:4773` | R03 | 없음 | 세트·구성품·수량·특징·규격 | [표현 가능] bundle_component; 시트 명시값 자동 | 동명 존재; §4 동작축 |
| `explodeSetParts` | `tools/legacy-gas/종합견적서/index.html:4780` | R03 | #ss_mat, 자재 포함 여부, 포함, #ss_remote_ex, #ss_remote, SET, EA, 0, 6, 4, 1 | 세트·구성품·수량·특징·규격 | [표현 가능] bundle_component; 시트 명시값 자동 | 동명 존재; §4 동작축 |
| `partsForCommSet_` | `tools/legacy-gas/종합견적서/index.html:4914` | R03 | 세트 | 세트·구성품·수량·특징·규격 | [표현 가능] bundle_component; 시트 명시값 자동 | 동명 존재; §4 동작축 |
| `inferStandCountForOutdoor_` | `tools/legacy-gas/종합견적서/index.html:4925` | R04 | GHP방진가대 | 간접 catalog: model_code·분류·옵션 | [표현 가능] quantity_sync_*; model tuple만 | 동명 존재; legacy 사용자축, 설정 shadow |
| `recalcCommAccessories` | `tools/legacy-gas/종합견적서/index.html:4932` | R04 | #commBody tr, .name .nm, .qty-input, 0, input, 10 | 간접 catalog: model_code·분류·옵션 | [표현 가능] quantity_sync_*; model tuple만 | 동명 존재; legacy 사용자축, 설정 shadow |
| `applyHomeFilter` | `tools/legacy-gas/종합견적서/index.html:4963` | R06 | i | 간접 catalog/견적·주문 상태 | [부분] 견적/주문 line 도메인 | 동명 존재; §4 동작축 |
| `applySingleFilter` | `tools/legacy-gas/종합견적서/index.html:4984` | R06 | i | 간접 catalog/견적·주문 상태 | [부분] 견적/주문 line 도메인 | 동명 존재; §4 동작축 |
| `applyCommFilter` | `tools/legacy-gas/종합견적서/index.html:5004` | R06 | i | 간접 catalog/견적·주문 상태 | [부분] 견적/주문 line 도메인 | 동명 존재; §4 동작축 |
| `updateHomeFilterOptions` | `tools/legacy-gas/종합견적서/index.html:5026` | R13 | homeFilterL, homeFilterM, homeFilterS, i, </option> | 간접 catalog/견적·주문 상태 | [부분] product 속성 + estimate config | 동명 존재; §4 동작축 |
| `updateSingleFilterOptions` | `tools/legacy-gas/종합견적서/index.html:5088` | R13 | singleFilterL, singleFilterM, ss_expand, 냉난방 스탠드, 프레스티지, 13, function, i, </option> | 간접 catalog/견적·주문 상태 | [부분] product 속성 + estimate config | 동명 존재; §4 동작축 |
| `updateCommFilterOptions` | `tools/legacy-gas/종합견적서/index.html:5142` | R13 | commFilterL, commFilterM, commFilterS, i, option, 대분류 전체, 중분류 전체, 소분류 전체 | 간접 catalog/견적·주문 상태 | [부분] product 속성 + estimate config | 동명 존재; §4 동작축 |
| `updateHomeRowPrice` | `tools/legacy-gas/종합견적서/index.html:5549` | R02 | .price-input, #374151, normal, .sub, .fix-dc-inp, change, tr, .var-dc-chk, .qty-input:not(.fix-dc-inp):not([type="hidden"]), function, home, #wrapHome tfoot td[colspan], 0, 374151, 9, 10, 11 | 납품가·출고가·고정DC·수식 | [부분] products 가격·고정DC; 정책/이력 별도 | 동명 존재; §4 동작축 |
| `buildSingleSetCompositionHtml_` | `tools/legacy-gas/종합견적서/index.html:6101` | R06 | 실내기, 실외기, 자재, 벽걸이, indoor, [실내기], outdoor, [실외기], wall, [벽걸이], panel, [판넬], remote, [리모컨], material, [자재], font-weight:700, ,, </div>, 1, 12, 13, 1.5, 700 | 간접 catalog/견적·주문 상태 | [부분] 견적/주문 line 도메인 | 동명 존재; §4 동작축 |
| `normalizeCommCategory` | `tools/legacy-gas/종합견적서/index.html:6169` | R01 | 없음 | 품명·모델·비고·분류·평형 | [표현 가능] products/classification; seed 자동·충돌 검수 | 동명 존재; §4 동작축 |
| `fixCommMidCategory` | `tools/legacy-gas/종합견적서/index.html:6177` | R01 | 키트, 분배헤더 | 품명·모델·비고·분류·평형 | [표현 가능] products/classification; seed 자동·충돌 검수 | 동명 존재; §4 동작축 |
| `getCommFilterRows_` | `tools/legacy-gas/종합견적서/index.html:6246` | R06 | ECO 리뉴얼 필터, MCU KIT 6실형(HR, WATER HR용), MCU KIT 4실형(HR, WATER HR용), MCU KIT 2실형(HR, WATER HR용), FCU KIT, 인체감시센서 KIT(4way), 인체감시센서 KIT(360), DMS(PC제어), 멀티Wifi KIT, 호환중계기(EHP용), 호환중계기(ERV용), #comm_ext_out, 실외기, 가스히트펌프, 프레스티지, 동시냉난방, 공장전원, 판넬, 1-Way, 2-Way, 4-Way, 360, 키트, 분배헤더, 6, 4, 2, 1 | 간접 catalog/견적·주문 상태 | [부분] 견적/주문 line 도메인 | 동명 존재; §4 동작축 |
| `updateCommRowPrice` | `tools/legacy-gas/종합견적서/index.html:6562` | R02 | .price-input, #374151, normal, .sub, .fix-dc-inp, change, tr, .var-dc-chk, .qty-input:not(.fix-dc-inp):not(.part-qty-comm), focus, #2563eb, bold, ${CSS.escape(m)}, data-m, undefined, .part-qty-comm, .price, comm, function, #wrapComm tfoot td[colspan], 0, 374151, 9, 10, 2563, 1, 15 | 납품가·출고가·고정DC·수식 | [부분] products 가격·고정DC; 정책/이력 별도 | 동명 존재; §4 동작축 |
| `buildDisplayNameComm` | `tools/legacy-gas/종합견적서/index.html:6693` | R11 | 부자재, 2, 1 | 간접 catalog/견적·주문 상태 | [부분] model_name/spec_text; display_name 없음 | 동명 존재; §4 동작축 |
| `buildCommSetIndex` | `tools/legacy-gas/종합견적서/index.html:6748` | R06 | 세트, 모델명, 모델, 구성모델, Model, 수량, 구성수량, 단위, EA, 품목명, 출고가, 10, 1, 0 | 간접 catalog/견적·주문 상태 | [부분] 견적/주문 line 도메인 | 동명 존재; §4 동작축 |
| `explodeCommPreviewParts` | `tools/legacy-gas/종합견적서/index.html:6773` | R03 | function, EA, 10, 0, 1 | 세트·구성품·수량·특징·규격 | [표현 가능] bundle_component; 시트 명시값 자동 | 동명 존재; §4 동작축 |
| `isCommSetRow` | `tools/legacy-gas/종합견적서/index.html:6786` | R06 | 실외기, SET | 간접 catalog/견적·주문 상태 | [부분] 견적/주문 line 도메인 | 동명 존재; §4 동작축 |
| `explodeCommSets_` | `tools/legacy-gas/종합견적서/index.html:6791` | R03 | COMM, Q, 10, 0, 1 | 세트·구성품·수량·특징·규격 | [표현 가능] bundle_component; 시트 명시값 자동 | 동명 존재; §4 동작축 |
| `syncOldTotals` | `tools/legacy-gas/종합견적서/index.html:7154` | R06 | oldCustomBody, .custom-item-row, .custom-qty, 0, .custom-price, #oldTotal, (max-width: 1280px), 10, 9, 1280 | 간접 catalog/견적·주문 상태 | [부분] 견적/주문 line 도메인 | 동명 존재; §4 동작축 |
| `onHomeQtyInput` | `tools/legacy-gas/종합견적서/index.html:7279` | R04 | ${CSS.escape(model)}, tr, undefined, [data-sub], .sub | 간접 catalog: model_code·분류·옵션 | [표현 가능] quantity_sync_*; model tuple만 | 동명 존재; legacy 사용자축, 설정 shadow |
| `onSingleQtyInput` | `tools/legacy-gas/종합견적서/index.html:7328` | R04 | ${CSS.escape(id)}, data-unitraw | 간접 catalog: model_code·분류·옵션 | [표현 가능] quantity_sync_*; model tuple만 | 동명 존재; legacy 사용자축, 설정 shadow |
| `recomputeFootAll` | `tools/legacy-gas/종합견적서/index.html:7525` | R04 | #home_foot, 0 | 간접 catalog: model_code·분류·옵션 | [표현 가능] quantity_sync_*; model tuple만 | 동명 존재; legacy 사용자축, 설정 shadow |
| `recomputeSingleBaseFoot` | `tools/legacy-gas/종합견적서/index.html:7538` | R04 | ss_base, 부자재, 실외기 받침, 자재, SET, 식, 0 | 간접 catalog: model_code·분류·옵션 | [표현 가능] quantity_sync_*; model tuple만 | 동명 존재; legacy 사용자축, 설정 shadow |
| `recomputeSingleExtras` | `tools/legacy-gas/종합견적서/index.html:7579` | R04 | #ss_remote_ex, #ss_remote, 유선리모컨, 컬러유선리모컨, 0 | 간접 catalog: model_code·분류·옵션 | [표현 가능] quantity_sync_*; model tuple만 | 동명 존재; legacy 사용자축, 설정 shadow |
| `isHomeCalcTriggerModel` | `tools/legacy-gas/종합견적서/index.html:7604` | R06 | 없음 | 간접 catalog/견적·주문 상태 | [부분] 견적/주문 line 도메인 | 동명 존재; §4 동작축 |
| `isSingleCalcTriggerId` | `tools/legacy-gas/종합견적서/index.html:7615` | R06 | 부자재, PC4NUFK1NW, PC4NUCK4NW, PC6NUDK1NW, PC6NUCK1NW, PC4NUFK1N, PC4NUCK1N, PC6NUDK1N, PC6NUCK1N, PC1YNWK1NW, PC1YNCK1NW, PC1YNRK1NW, PC1ZNSK1NW, PC1ZNWK1NW, PC1ZNCK1NW, PC1ZNRK1NW, 기본형, 4, 25, 360 | 간접 catalog/견적·주문 상태 | [부분] 견적/주문 line 도메인 | 동명 존재; §4 동작축 |
| `findHomePanelModel` | `tools/legacy-gas/종합견적서/index.html:7640` | R04 | 없음 | 간접 catalog: model_code·분류·옵션 | [표현 가능] quantity_sync_*; model tuple만 | 동명 존재; legacy 사용자축, 설정 shadow |
| `pickInfinitePanelModel` | `tools/legacy-gas/종합견적서/index.html:7655` | R04 | mid, 공청판넬, 인피니트 공청+동작감지 AI, 인피니트 25년형, 25 | 간접 catalog: model_code·분류·옵션 | [표현 가능] quantity_sync_*; model tuple만 | 동명 존재; legacy 사용자축, 설정 shadow |
| `recomputeHomePanels` | `tools/legacy-gas/종합견적서/index.html:7679` | R04 | #home_panel, 판넬제외, s, b, 0, 360, 4, 1 | 간접 catalog: model_code·분류·옵션 | [표현 가능] quantity_sync_*; model tuple만 | 동명 존재; legacy 사용자축, 설정 shadow |
| `recomputeHomeRemotes` | `tools/legacy-gas/종합견적서/index.html:7792` | R04 | #home_remote, 기본, 0, 360, 1, 4 | 간접 catalog: model_code·분류·옵션 | [표현 가능] quantity_sync_*; model tuple만 | 동명 존재; legacy 사용자축, 설정 shadow |
| `recomputeHomeBranches` | `tools/legacy-gas/종합견적서/index.html:7839` | R04 | home_no_branch | 간접 catalog: model_code·분류·옵션 | [표현 가능] quantity_sync_*; model tuple만 | 동명 존재; legacy 사용자축, 설정 shadow |
| `recomputeHomeDerived` | `tools/legacy-gas/종합견적서/index.html:7900` | R04 | #home_no_hose, #home_hose_i, 0, 1, 4, 360 | 간접 catalog: model_code·분류·옵션 | [표현 가능] quantity_sync_*; model tuple만 | 동명 존재; legacy 사용자축, 설정 shadow |
| `recomputeCommDerived` | `tools/legacy-gas/종합견적서/index.html:7957` | R04 | 1way, 2way, 4way, undefined, #comm_ex_hose, #comm_hose_i, MDP-Z075SZED, AM052DNLDBH1, AM072DNLDBH1, ADP-E075SEK3D, AM100FNLDBH1, MDP-M075SGK2D, AM130DNMDBH1, AM145DNMDBH1, ADP-G075SPK1D, AM083DNMDBH1, AM100DNMDBH1, AM110DNMDBH1, AM052ANHDBH1, AM060ANHDBH1, AM072ANHDBH1, AM083ANHDBH1, AM100ANHDBH1, AM110ANHDBH1, AM130ANHDBH1, AM145ANHDBH1, AM230ANHDBH1, ADP-N047SNK1D, AM290HNHDBH1, ADP-F075SP, AM072TNCDBH1, AM110TNCDBH1, AM130TNCDBH1, AM145TNCDBH1, SET, AXJ-TA3419M, #comm_panel, 판넬제외, #comm_remote, 제외, #comm_ex_base, AWR-WE13N, AWR-VH12N, ${CSS.escape(m)}, ${CSS.escape(key)}, color, #2563eb, important, font-weight, bold, 0, 1, 2, 4, 2563 | 간접 catalog: model_code·분류·옵션 | [표현 가능] quantity_sync_*; model tuple만 | 동명 존재; legacy 사용자축, 설정 shadow |
| `computeCommPanelModelForIndoor_` | `tools/legacy-gas/종합견적서/index.html:8166` | R04 | comm_panel, 기본판넬, comm_p360, 원형, WIFI내장, 미내장, 판넬제외, 1, 2, 4, 360 | 간접 catalog: model_code·분류·옵션 | [표현 가능] quantity_sync_*; model tuple만 | 동명 존재; legacy 사용자축, 설정 shadow |
| `syncHomeUIFromState` | `tools/legacy-gas/종합견적서/index.html:8252` | R06 | ${CSS.escape(model)}, undefined, 0, #2563eb, #374151, bold, normal, input, 2563, 374151, 9 | 간접 catalog/견적·주문 상태 | [부분] 견적/주문 line 도메인 | 동명 존재; §4 동작축 |
| `syncSingleUIFromState` | `tools/legacy-gas/종합견적서/index.html:8316` | R06 | #singleBody .qty-input:not(.part-qty-single), 0, #2563eb, #374151, bold, normal, ${CSS.escape(id)}, data-unitraw, input, single, undefined, 9, 2563, 374151, 10 | 간접 catalog/견적·주문 상태 | [부분] 견적/주문 line 도메인 | 동명 존재; §4 동작축 |
| `syncHomeTotals` | `tools/legacy-gas/종합견적서/index.html:8380` | R06 | homeCustomBody, .custom-item-row, .custom-qty, 0, .custom-price, #homeTotal, 10, 9 | 간접 catalog/견적·주문 상태 | [부분] 견적/주문 line 도메인 | 동명 존재; §4 동작축 |
| `syncSingleTotals` | `tools/legacy-gas/종합견적서/index.html:8395` | R06 | singleCustomBody, .custom-item-row, .custom-qty, 0, .custom-price, #singleTotal, function, 10, 9 | 간접 catalog/견적·주문 상태 | [부분] 견적/주문 line 도메인 | 동명 존재; §4 동작축 |
| `explodeSendSets_` | `tools/legacy-gas/종합견적서/index.html:8510` | R03 | 부자재, 실외기 받침, undefined, SET, EA | 세트·구성품·수량·특징·규격 | [표현 가능] bundle_component; 시트 명시값 자동 | 동명 존재; §4 동작축 |
| `isValidTel` | `tools/legacy-gas/종합견적서/index.html:8659` | R07 | 010, 4 | 간접 catalog/견적·주문 상태 | [부분] 견적/주문 line 도메인 | 동명 존재; §4 동작축 |
| `checkOrderReady` | `tools/legacy-gas/종합견적서/index.html:8715` | R06 | #memo, #addrBase, #tel, #sameAddr, #addrAuditBase, #btnSendOrder | 간접 catalog/견적·주문 상태 | [부분] 견적/주문 line 도메인 | 동명 존재; §4 동작축 |
| `aggregateSendRows` | `tools/legacy-gas/종합견적서/index.html:8732` | R06 | \|\|, home, single, comm, 0 | 간접 catalog/견적·주문 상태 | [부분] 견적/주문 line 도메인 | 동명 존재; §4 동작축 |
| `buildSendRows` | `tools/legacy-gas/종합견적서/index.html:9075` | R06 | chkCardPay, 0, addrBase, addrDetail, 경동, / | 간접 catalog/견적·주문 상태 | [부분] 견적/주문 line 도메인 | 동명 존재; §4 동작축 |
| `getActiveFixedDc` | `tools/legacy-gas/종합견적서/index.html:9116` | R02 | HOME, #homeBody, COMM, #commBody, SINGLE, #singleBody, ${CSS.escape(key)}, .fix-dc-inp, number, 0, 9, 1, 100 | 납품가·출고가·고정DC·수식 | [부분] products 가격·고정DC; 정책/이력 별도 | 동명 존재; §4 동작축 |
| `updateInlineTotals` | `tools/legacy-gas/종합견적서/index.html:10168` | R06 | homeTotal, homeTotalInline, singleTotal, singleTotalInline, commTotal, commTotalInline | 간접 catalog/견적·주문 상태 | [부분] 견적/주문 line 도메인 | 동명 존재; §4 동작축 |
| `fixFootersForMobile` | `tools/legacy-gas/종합견적서/index.html:10186` | R06 | #wrapHome tfoot tr, none, homeTotal, 0, homeTotalInline, #wrapSingle tfoot tr, singleTotal, singleTotalInline, #wrapComm tfoot tr, commTotal, commTotalInline, btnGenSlip, click, function, 전송할 품목이 없습니다., custSearch, 거래처를 선택해주세요., addrBase, addrDetail, addrAuditBase, addrAuditDetail, whCode, 00003, due, chkCardPay, 카드결제, payDue, tel, memo, dlgProgress, progressIcon, progressText, progressBtns, block, ⏳, 이카운트로 전표를 생성 중입니다..., ✅, object, 전표 생성 완료!\n(, ), 5, 2, 1, 6, 4 | 간접 catalog/견적·주문 상태 | [부분] 견적/주문 line 도메인 | 동명 존재; §4 동작축 |
| `getSelectedTotalCount` | `tools/legacy-gas/종합견적서/index.html:10487` | R06 | #singleBody .qty-input, #commBody .qty-input, .custom-qty, 0, 1, 10 | 간접 catalog/견적·주문 상태 | [부분] 견적/주문 line 도메인 | 동명 존재; §4 동작축 |
| `getSingleSetOptionLabel` | `tools/legacy-gas/종합견적서/index.html:10663` | R11 | function, 부자재, 실외기 받침, ss_remote_ex, ss_remote, 리모컨 제외, 기본, 무선, ss_panel, 선택 안함, 블랙판넬, 승강판넬, ss_p360, ss_mat, 포함, 자재포함, (, /, ), 1, 0, 4, 360 | 간접 catalog/견적·주문 상태 | [부분] model_name/spec_text; display_name 없음 | 동명 존재; §4 동작축 |
| `getSingleSetOptionLabelLive` | `tools/legacy-gas/종합견적서/index.html:10727` | R11 | ${CSS.escape(s.id)}, function, .part-qty-single, 0, .colD, 10 | 간접 catalog/견적·주문 상태 | [부분] model_name/spec_text; display_name 없음 | 동명 존재; §4 동작축 |
| `getStructuredQuoteData` | `tools/legacy-gas/종합견적서/index.html:10755` | R06 | SIMPLE, undefined, comm, SET, set-head, ${CSS.escape(r.model)}, data-m, .colD, └ [구성], .part-qty-comm, 0, .price-input, EA, function, item, <상업멀티>, 상업멀티 합계, home, <홈멀티>, 홈멀티 합계, 부자재, 실외기 받침, 등급, 평형, single, 식, ${CSS.escape(s.id)}, .part-qty-single, 실내기, 실외기, 판넬, 블랙, 승강, 공기청정, 공청, 리모컨, 스탠드, 벽걸이, 자재, <싱글 세트>, 싱글 세트 합계, 품 명, 품명, old, <구형>, 구형 합계, chkCardPay, 기타, 소계, selCutUnit, 절삭, \u200B, 10, 9, 1, 5, 2, 4.3, 4.2, 4.1, 4.0, 5.1, 5.2, 5.3, 6, 3, 7 | 간접 catalog/견적·주문 상태 | [부분] 견적/주문 line 도메인 | 동명 존재; §4 동작축 |
| `getVatLabel` | `tools/legacy-gas/종합견적서/index.html:11145` | R06 | input[name="optVatDisplay"]:checked, inc, chkCardPay, VAT 포함, exc, VAT 별도, 카드 수수료 포함, /, 0 | 간접 catalog/견적·주문 상태 | [부분] 견적/주문 line 도메인 | 동명 존재; §4 동작축 |
| `syncVatCardPv` | `tools/legacy-gas/종합견적서/index.html:11160` | R06 | input[name="optVatPv"]:checked, inc, chkCardPayPv, input[name="optVatDisplay"], chkCardPay, preview, function | 간접 catalog/견적·주문 상태 | [부분] 견적/주문 line 도메인 | 동명 존재; §4 동작축 |
| `syncVatFromOrderInfo` | `tools/legacy-gas/종합견적서/index.html:11182` | R06 | input[name="optVatDisplay"]:checked, inc, input[name="optVatPv"] | 간접 catalog/견적·주문 상태 | [부분] 견적/주문 line 도메인 | 동명 존재; §4 동작축 |
| `parseRatioText` | `tools/legacy-gas/종합견적서/index.html:11346` | R05 | ---, 조합 불가, 초과 주의, homeRatio, commRatio, 홈멀티, 상업멀티, 조합비:, &, /, ,, display:flex; justify-content:space-between; align-items:center;, font-weight:normal; font-size:0.9em; white-space:nowrap;, pc-only, ${totalCols}, mobile-only, ${totalCols - 2}, function, tr, 1.1, set-head, group-top, #fff, text-align:left; padding:${PAD}; font-weight:bold; color:${C_TXT};${bgStyle}, child, 4px 8px 4px 20px, #4b5563, #111, └, #6b7280, #000000, model, ${tdBase} color:${modColor}; font-size:0.9em;, unit, ${tdBase} text-align:center;, ${tdBase} text-align:right;, padding:${PAD}; text-align:right;, section-subtotal, ${labelSpan}, font-weight:bold; color:#4b5563;, ${labelSpan - 2}, font-weight:bold; color:${C_TXT}; font-size:1.1em;, input[name="optVatDisplay"]:checked, inc, chkCardPay, VAT 포함, exc, VAT 별도, 카드 수수료 포함, padding:${PAD}; text-align:left;, font-weight:bold; font-size:1.0em; color:${C_TXT};, font-weight:normal; font-size:0.8em; margin-left:4px;, font-weight:bold; font-size:1.2em; color:${C_TXT};, chkShowListPrice, #wrapPreview table, resize, cardPreview, hidden, -1, 0, 0.9, 2, 1, 4, 8, 20, 111, 6, 000000, 1.0, 0.8, 1.2, 0.85, 555, 1.4, 30, 5, 100 | 용량·최대연결·추천실외기 | [부분/불가] quantity_sync + 용량정책 필요 | 동명 존재; §4 동작축 |
| `capFromModel` | `tools/legacy-gas/종합견적서/index.html:12282` | R05 | 3, 1, 10, 0 | 용량·최대연결·추천실외기 | [부분/불가] quantity_sync + 용량정책 필요 | 동명 존재; §4 동작축 |
| `pickSelectedOutdoors` | `tools/legacy-gas/종합견적서/index.html:12288` | R05 | AM, X, #commBody .item-row, .qty-input, 7, 6, 0, 10 | 용량·최대연결·추천실외기 | [부분/불가] quantity_sync + 용량정책 필요 | 동명 존재; §4 동작축 |
| `pickSelectedIndoorsExpanded` | `tools/legacy-gas/종합견적서/index.html:12310` | R05 | AM, N, ${CSS.escape(model)}, 0, ko, 7, 6, 10, 3, 1 | 용량·최대연결·추천실외기 | [부분/불가] quantity_sync + 용량정책 필요 | 동명 존재; §4 동작축 |
| `codeByCumulativeSum` | `tools/legacy-gas/종합견적서/index.html:12338` | R05 | 1509, 2512, 2812, 2815, 3419, 4119, 150, 406, 464, 696, 986 | 용량·최대연결·추천실외기 | [부분/불가] quantity_sync + 용량정책 필요 | 동명 존재; §4 동작축 |
| `codeByOutdoorHP` | `tools/legacy-gas/종합견적서/index.html:12348` | R05 | 1509, 2512, 2812, 2815, 3419, 4119, 0, 50, 100, 160, 220, 340 | 용량·최대연결·추천실외기 | [부분/불가] quantity_sync + 용량정책 필요 | 동명 존재; §4 동작축 |
| `recomputeBranchCodes` | `tools/legacy-gas/종합견적서/index.html:12361` | R05 | ${key}, .cap-input, .code-cell, 0, -, function, 1509, 2512, 2812, 2815, 3419, 4119, ${k}, 1, 10, 1200, 2000, 2800, 3100, 3800, 3 | 용량·최대연결·추천실외기 | [부분/불가] quantity_sync + 용량정책 필요 | 동명 존재; §4 동작축 |
| `ensureBranchScaffold` | `tools/legacy-gas/종합견적서/index.html:12431` | R06 | .wrap, pageBranch, section, hidden, branchTopbar, div, branch-top, branch-title, branchSummaryBar, branch-summarybar, 1509, number, extra-branch, 0, 2512, 2812, 2815, 3419, 4119, .extra-branch, input, branchBoard, .branch-option,.branch-toolbar,#btnBackToComm,#btnBranchApply, 40, 4, 1, 24 | 간접 catalog/견적·주문 상태 | [부분] 견적/주문 line 도메인 | 동명 존재; §4 동작축 |
| `syncCommQtyFromDOM` | `tools/legacy-gas/종합견적서/index.html:12479` | R04 | #commBody .qty-input, 0 | 간접 catalog: model_code·분류·옵션 | [표현 가능] quantity_sync_*; model tuple만 | 동명 존재; legacy 사용자축, 설정 shadow |
| `backToComm` | `tools/legacy-gas/종합견적서/index.html:12517` | R06 | branch-active, pageBranch, hidden, comm-active, function, comm, smooth, 0 | 간접 catalog/견적·주문 상태 | [부분] 견적/주문 line 도메인 | 동명 존재; §4 동작축 |
| `updateBranchTopButton` | `tools/legacy-gas/종합견적서/index.html:12538` | R06 | btnOpenBranch, branch-active, 상업멀티 보기, 분기계산, function, comm | 간접 catalog/견적·주문 상태 | [부분] 견적/주문 line 도메인 | 동명 존재; §4 동작축 |
| `handleBranchToggleClick` | `tools/legacy-gas/종합견적서/index.html:12547` | R06 | branch-active | 간접 catalog/견적·주문 상태 | [부분] 견적/주문 line 도메인 | 동명 존재; §4 동작축 |
| `fixBranchDOM` | `tools/legacy-gas/종합견적서/index.html:12610` | R06 | .indoor-cell, .out-head, out${c+1}, 1 | 간접 catalog/견적·주문 상태 | [부분] 견적/주문 line 도메인 | 동명 존재; §4 동작축 |
| `makeBranchColumnSortable` | `tools/legacy-gas/종합견적서/index.html:12637` | R06 | .branch-table, thead tr, .pc-draggable-col, dragstart, move, text/plain, 0.4, #f8fafc, dragover, pc-draggable-col, tbody tr, 0, -1, 2 | 간접 catalog/견적·주문 상태 | [부분] 견적/주문 line 도메인 | 동명 존재; §4 동작축 |
| `updateBranchVisuals` | `tools/legacy-gas/종합견적서/index.html:12791` | R06 | .out-slot, .capsule.in-grid, .cap-input, AM, 0, ko, .indoor-cell, span, capsule, m, 10, 3, 1 | 간접 catalog/견적·주문 상태 | [부분] 견적/주문 line 도메인 | 동명 존재; §4 동작축 |
| `updateBranchRatios` | `tools/legacy-gas/종합견적서/index.html:12894` | R05 | ${slot}, 용량, 능력, 품 명, 수량 초과, #dc2626, bold, ratio-bad, 1, 0, 10, 0.1, 100, 103.0, 120.0 | 용량·최대연결·추천실외기 | [부분/불가] quantity_sync + 용량정책 필요 | 동명 존재; §4 동작축 |
| `snapshotBranchState` | `tools/legacy-gas/종합견적서/index.html:12947` | R08 | .indoor-cell, .capsule:not(.in-grid), 0, .out-head, out${i}, .capsule.in-grid, chip, .cap-input, input, .extra-branch, .out-name-input, .branch-table thead th.out-head, 10, 1 | 간접 catalog/견적·주문 상태 | [불가] estimate/order snapshot 도메인 | 동명 존재; §4 동작축 |
| `pushBranchPartsToCommFromBadges` | `tools/legacy-gas/종합견적서/index.html:12980` | R04 | 1509, AXJ-YA1509N, 2512, AXJ-YA2512N, 2812, AXJ-YA2812M, 2815, AXJ-YA2815M, 3419, AXJ-YA3419M, 4119, AXJ-YA4119M, .code-cell, ${k}, 0, ${CSS.escape(m)}, function, 1, 10 | 간접 catalog: model_code·분류·옵션 | [표현 가능] quantity_sync_*; model tuple만 | 동명 존재; legacy 사용자축, 설정 shadow |
| `saveBranchState` | `tools/legacy-gas/종합견적서/index.html:13010` | R06 | function | 간접 catalog/견적·주문 상태 | [부분] 견적/주문 line 도메인 | 동명 존재; §4 동작축 |
| `loadBranchState` | `tools/legacy-gas/종합견적서/index.html:13018` | R06 | 없음 | 간접 catalog/견적·주문 상태 | [부분] 견적/주문 line 도메인 | 동명 존재; §4 동작축 |
| `applyBranchState` | `tools/legacy-gas/종합견적서/index.html:13023` | R06 | .out-head, .branch-table, thead tr, tbody tr, ${outId}, out${i}, chip, .btn-x, click, 0, number, cap-input, numeric, ${inputStyle}, input, ${k}, 90, 34, 1, 3, 14, 10 | 간접 catalog/견적·주문 상태 | [부분] 견적/주문 line 도메인 | 동명 존재; §4 동작축 |
| `isIndoorOnly` | `tools/legacy-gas/종합견적서/index.html:13301` | R12 | undefined, 0 | 간접 catalog/견적·주문 상태 | [불가] 견적 가격정책 | 동명 존재; §4 동작축 |
| `getTierBonusRate` | `tools/legacy-gas/종합견적서/index.html:13329` | R12 | 100000000, 0.04, 50000000, 0.03, 30000000, 0.02, 10000000, 0.01, 0, 45 | 간접 catalog/견적·주문 상태 | [불가] 견적 가격정책 | 동명 존재; §4 동작축 |
| `isStandard45` | `tools/legacy-gas/종합견적서/index.html:13338` | R12 | 0.45, 0.001 | 간접 catalog/견적·주문 상태 | [불가] 견적 가격정책 | 동명 존재; §4 동작축 |
| `runWithAdjustedRates` | `tools/legacy-gas/종합견적서/index.html:13343` | R12 | function, %, HOME, COMM, string, 0, 45, 40, 0.40, 100, -1 | 간접 catalog/견적·주문 상태 | [불가] 견적 가격정책 | 동명 존재; §4 동작축 |
| `buildSendRows` | `tools/legacy-gas/종합견적서/index.html:13424` | R06 | btnHistory, #f97316, #fff, click, pageOrder, pageHistory, hidden, 210000, history-snapshot-open, drawerTop, active, function, history | 간접 catalog/견적·주문 상태 | [부분] 견적/주문 line 도메인 | 동명 존재; §4 동작축 |
| `getSlipInnerContent` | `tools/legacy-gas/종합견적서/index.html:13590` | R06 | undefined, 초월창고, 삼성창고 (초월 무갑), 0 | 간접 catalog/견적·주문 상태 | [부분] 견적/주문 line 도메인 | 동명 존재; §4 동작축 |
| `updateSlipScale` | `tools/legacy-gas/종합견적서/index.html:13781` | R06 | slipViewWrapper, slipScaleBox, px, 794, 20, 1, 1123 | 간접 catalog/견적·주문 상태 | [부분] 견적/주문 line 도메인 | 동명 존재; §4 동작축 |
| `handleSlipCopy` | `tools/legacy-gas/종합견적서/index.html:13798` | R06 | saveMenu, hidden, div, NanumGothicBold, #ffffff, image/png, 클립보드에 복사되었습니다., 기능, 전표 복사, 복사 실패, 오류, 0, 794, 1123, 30, -9999, 2 | 간접 catalog/견적·주문 상태 | [부분] 견적/주문 line 도메인 | 동명 존재; §4 동작축 |
| `handleSlipSave` | `tools/legacy-gas/종합견적서/index.html:13835` | R06 | saveMenu, hidden, 데이터 없음, div, NanumGothicBold, #ffffff, pdf, image/png, p, mm, a4, PNG, a, 기능, 전표, 저장, 저장 중 오류가 발생했습니다., 0, 794, 1123, 30, -9999, 2 | 간접 catalog/견적·주문 상태 | [부분] 견적/주문 line 도메인 | 동명 존재; §4 동작축 |
| `getInvoiceInnerContent` | `tools/legacy-gas/종합견적서/index.html:13940` | R06 | undefined, 0, height:30px;, text-align:center; border-right:1px solid black;, text-align:right; padding-right:5px; border-right:1px solid black;, text-align:right; padding-right:5px;, display:flex; height:200px; margin-bottom:10px; flex-shrink:0;, position:absolute; top:0; left:0;, ${logoSrc}, height:36px;, font-size:34px; font-weight:bold;, text-align:center; margin-bottom:5px;, font-size:48px; font-weight:bold; letter-spacing:4px; line-height:1;, font-size:22px; font-weight:bold; margin-bottom:4px;, font-size:16px; margin-bottom:2px;, font-size:16px;, width:440px; position:relative;, ${stampSrc}, position:absolute; width:80px; top:45px; right:20px; z-index:10; opacity:0.8;, width:40px;, width:90px;, width:60px;, height:25%;, 4, border-right:1px solid black; border-bottom:1px solid black;, border-bottom:1px solid black;, 3, border-bottom:1px solid black; text-align:left; padding-left:10px;, text-align:left; padding-left:10px; font-size:13px;, margin-right:10px;, flex:1; margin-bottom:20px;, width:9%;, width:51%;, width:8%;, width:12%;, text-align:center; font-weight:bold; white-space:nowrap;, width:13%;, height:40px; border-bottom:1px solid black;, border-right:1px solid black; padding:0 5px; text-align:right;, padding:0 5px; text-align:right;, height:50px; background-color:#ffffff;, 10, padding:0 15px;, 1.1, 1, 2, 30, 5, 1123, 794, 40, 200, 20, 36, 34, 48, 95, 22, 16, 440, 80, 45, 0.8, 100, 14, 90, 60, 25, 15, 1.2, 02, 3465, 1331, 214, 87, 20659, 13, 9, 8, -1, 18, 51, 12, 7, 50, 750637, 01, 002557, 010, 3748, 9937 | 간접 catalog/견적·주문 상태 | [부분] 견적/주문 line 도메인 | 동명 존재; §4 동작축 |
| `handleInvoiceCopy` | `tools/legacy-gas/종합견적서/index.html:14181` | R06 | invSaveMenu, hidden, div, #invoiceScaleBox > div, #ffffff, image/png, 클립보드에 복사되었습니다., 기능, 명세서 복사, 복사 실패, 오류 발생, 0, 1123, 794, -9999, 2 | 간접 catalog/견적·주문 상태 | [부분] 견적/주문 line 도메인 | 동명 존재; §4 동작축 |
| `handleInvoiceSave` | `tools/legacy-gas/종합견적서/index.html:14209` | R06 | invSaveMenu, hidden, div, #invoiceScaleBox > div, #ffffff, pdf, image/png, l, mm, a4, PNG, a, 기능, 명세서, 저장, 저장 중 오류가 발생했습니다., 0, 1123, 794, -9999, 2 | 간접 catalog/견적·주문 상태 | [부분] 견적/주문 line 도메인 | 동명 존재; §4 동작축 |
| `getCurrentSlipSnapshot` | `tools/legacy-gas/종합견적서/index.html:14489` | R08 | checkbox, 1, 0, custSearch, function, \|, \|\|, due, whCode, addrBase, addrDetail, addrAuditBase, addrAuditDetail, sameAddr, auditLater, tel, memo, payDue, chkCardPay, payDueStar, payDuePre, chkYard, chkLocal, :: | 간접 catalog/견적·주문 상태 | [불가] estimate/order snapshot 도메인 | 동명 존재; §4 동작축 |
| `updateOrderTags` | `tools/legacy-gas/종합견적서/index.html:15057` | R07 | chkYard, chkLocal, addrBase, 야적/, 지방/, due, memo, 상, 하, 1, 0, 6 | 간접 catalog/견적·주문 상태 | [부분] 견적/주문 line 도메인 | 동명 존재; §4 동작축 |
| `appendMemo` | `tools/legacy-gas/종합견적서/index.html:15144` | R07 | memo, input | 간접 catalog/견적·주문 상태 | [부분] 견적/주문 line 도메인 | 동명 존재; §4 동작축 |
| `checkCardValid` | `tools/legacy-gas/종합견적서/index.html:15160` | R06 | 없음 | 간접 catalog/견적·주문 상태 | [부분] 견적/주문 line 도메인 | 동명 존재; §4 동작축 |
| `loadOrderData` | `tools/legacy-gas/종합견적서/index.html:15276` | R06 | 없음 | 간접 catalog/견적·주문 상태 | [부분] 견적/주문 line 도메인 | 동명 존재; §4 동작축 |
| `submitOrderCard` | `tools/legacy-gas/종합견적서/index.html:15289` | R07 | 없음 | 간접 catalog/견적·주문 상태 | [부분] 견적/주문 line 도메인 | 동명 존재; §4 동작축 |
| `getCanonicalSection` | `tools/legacy-gas/종합견적서/index.html:15368` | R06 | HOME, HM, COMM, CM, SINGLE, S, OLD, ETC, string, number, /, 수수료, ko-KR, 원 포함, 적요, 거래처를 선택해주세요., due, 납기일을 입력해주세요., 주소를 입력해주세요., whCode, chkCardPay, 카드결제, payDueStar, *, payDuePre, 선결제, payDue, tel, memo, custTel, custAddr, function, (^\| )USER_AUTH=([^;]+), auditLater, sameAddr, 추후, addrAuditBase, addrAuditDetail, dlgProgress, progressIcon, progressText, progressBtns, block, ⏳, 전표 생성 중..., none, ✅, object, 완료! 전표번호:, 전표 생성 오류, 기능, 전표생성:, ⚠️, 서버 오류:, 서버 처리에 실패했습니다.\n, 오류 발생:, 0, 9, 1, 100, 0.01, -1, 2, 1000 | 간접 catalog/견적·주문 상태 | [부분] 견적/주문 line 도메인 | 동명 존재; §4 동작축 |
| `applyCardFeeLogic` | `tools/legacy-gas/종합견적서/index.html:16172` | R12 | chkCardPay, 카드, 수수료, set-head, 카드수수료, 식, 기타, 0, 0.03, 1 | 간접 catalog/견적·주문 상태 | [불가] 견적 가격정책 | 동명 존재; §4 동작축 |
| `applyCutoffLogic` | `tools/legacy-gas/종합견적서/index.html:16205` | R12 | selCutUnit, set-head, 기타, 절삭, 식, 0, 1 | 간접 catalog/견적·주문 상태 | [불가] 견적 가격정책 | 동명 존재; §4 동작축 |
| `calcRecommendOdu` | `tools/legacy-gas/종합견적서/index.html:17518` | R05 | 0 | 용량·최대연결·추천실외기 | [부분/불가] quantity_sync + 용량정책 필요 | 동명 존재; §4 동작축 |
| `addCustomRow` | `tools/legacy-gas/종합견적서/index.html:18061` | R06 | CustomBody, tr, custom-item-row tint, 4, colD pc-only, text, custom-name pc-name, 사용자 정의 품목, 1, colD mobile-only, custom-name mo-name, colL, text-align:left; padding:6px 8px;, custom-name pc-name mo-name, if(typeof refreshSelectedBadge === 'function') refreshSelectedBadge();, model, custom-model, 모델명 입력, list-price pc-only, width:100px; margin:0 auto; position:relative;, list-price-input, 출고가, numeric, this.select(), spec-col pc-only, width:100%; min-width:80px; margin:0 auto; position:relative;, spec-input custom-spec, 규격, qty, qty-box, qty-input custom-qty, 0, \\d*, old, ${isOld ? 'ar price' : 'h-price price'}, price-input custom-price, ar sub-cell custom-sub, font-weight:bold;, sub custom-sub pc-only, pc-only, qty-input fix-dc-inp custom-fix-dc, %, font-size:13px; text-align:center;, checkbox, var-dc-chk custom-var-dc, transform:scale(1.2); cursor:pointer;, capa pc-only, text-align:center; color:#6b7280; font-size:13px;, CustomDelBtn, inline-flex, 100, 28, 8, 6, 14, 374151, 80, 9, 3, 13, 1.2 | 간접 catalog/견적·주문 상태 | [부분] 견적/주문 line 도메인 | 동명 존재; §4 동작축 |
| `removeCustomRow` | `tools/legacy-gas/종합견적서/index.html:18166` | R06 | CustomBody, CustomDelBtn, none, 0 | 간접 catalog/견적·주문 상태 | [부분] 견적/주문 line 도메인 | 동명 존재; §4 동작축 |
| `updateCustomSubtotal` | `tools/legacy-gas/종합견적서/index.html:18180` | R06 | tr, .custom-qty, 0, .custom-price, .custom-sub, ko-KR, home, function, single, comm, old, DOMContentLoaded, click, toggle-comp-comm, toggle-comp-single, ${CSS.escape(id)}, none, 닫기, 보기, #374151, #fff, input, 10, 9, 1500, 374151 | 간접 catalog/견적·주문 상태 | [부분] 견적/주문 line 도메인 | 동명 존재; §4 동작축 |
| `syncSetPriceFromParts` | `tools/legacy-gas/종합견적서/index.html:18738` | R03 | ${CSS.escape(setId)}, .price-input, 0, .price, .part-qty-single, .part-qty-comm, .val-for-text, .qty-input, function, undefined, .sub, [data-csub], change, qty-input, fix-dc-inp, part-qty-single, data-set, data-part, \|, data-def, 1, tr, .sub, part-qty-comm, 9, 10, 3 | 세트·구성품·수량·특징·규격 | [표현 가능] bundle_component; 시트 명시값 자동 | 동명 존재; §4 동작축 |

## 9. 전체 함수 분류 원장 (고정 분모 993건)

> 이 원장은 고정 inventory의 함수 993건을 한 줄씩 소진한다. `dead_code`는 0건이며, 호출 증거가 불명확한 함수도 GAS 외부 진입 가능성을 배제할 수 없어 업무규칙 또는 인프라·유틸로 보수 분류했다.

| 파일:줄 | 함수 | 분류 |
|---|---|---|
| `tools/legacy-gas/거래처 발송 주문서/Code.js:2` | `doGet` | 인프라·유틸 |
| `tools/legacy-gas/거래처 발송 주문서/Code.js:43` | `getInitialData` | 인프라·유틸 |
| `tools/legacy-gas/거래처 발송 주문서/Code.js:105` | `saveOrderSnapshot` | 업무규칙 |
| `tools/legacy-gas/거래처 발송 주문서/Code.js:169` | `getOrderSnapshotHistory` | 업무규칙 |
| `tools/legacy-gas/거래처 발송 주문서/Code.js:257` | `cachePutJSON_` | 인프라·유틸 |
| `tools/legacy-gas/거래처 발송 주문서/Code.js:267` | `cacheGetJSON_` | 인프라·유틸 |
| `tools/legacy-gas/거래처 발송 주문서/Code.js:281` | `getHomeIncreasePrices_` | 업무규칙 |
| `tools/legacy-gas/거래처 발송 주문서/Code.js:294` | `getCommIncreasePrices_` | 업무규칙 |
| `tools/legacy-gas/거래처 발송 주문서/Code.js:307` | `extractSingleIncreasePrices_` | 업무규칙 |
| `tools/legacy-gas/거래처 발송 주문서/Code.js:332` | `getSingleIncreasePrices_` | 업무규칙 |
| `tools/legacy-gas/거래처 발송 주문서/Code.js:345` | `getSinglePartsIncreasePrices_` | 업무규칙 |
| `tools/legacy-gas/거래처 발송 주문서/Code.js:358` | `extractIncreasePrices_` | 업무규칙 |
| `tools/legacy-gas/거래처 발송 주문서/Code.js:383` | `getGateImages` | 인프라·유틸 |
| `tools/legacy-gas/거래처 발송 주문서/Code.js:411` | `getLogoImage` | 인프라·유틸 |
| `tools/legacy-gas/거래처 발송 주문서/Code.js:454` | `normalizeSize_` | 인프라·유틸 |
| `tools/legacy-gas/거래처 발송 주문서/Code.js:459` | `findIdx_` | 인프라·유틸 |
| `tools/legacy-gas/거래처 발송 주문서/Code.js:463` | `parseKRNumber_` | 인프라·유틸 |
| `tools/legacy-gas/거래처 발송 주문서/Code.js:469` | `parseKRFloat_` | 인프라·유틸 |
| `tools/legacy-gas/거래처 발송 주문서/Code.js:475` | `toYmd_` | 인프라·유틸 |
| `tools/legacy-gas/거래처 발송 주문서/Code.js:482` | `toMmDd_` | 인프라·유틸 |
| `tools/legacy-gas/거래처 발송 주문서/Code.js:489` | `normalizeTel_` | 인프라·유틸 |
| `tools/legacy-gas/거래처 발송 주문서/Code.js:496` | `todayYMD_` | 인프라·유틸 |
| `tools/legacy-gas/거래처 발송 주문서/Code.js:497` | `_normSpec_` | 인프라·유틸 |
| `tools/legacy-gas/거래처 발송 주문서/Code.js:500` | `sanitizeKoreanParen_` | 인프라·유틸 |
| `tools/legacy-gas/거래처 발송 주문서/Code.js:508` | `trimSymbols_` | 인프라·유틸 |
| `tools/legacy-gas/거래처 발송 주문서/Code.js:511` | `sanitizeDisp_` | 인프라·유틸 |
| `tools/legacy-gas/거래처 발송 주문서/Code.js:514` | `hpFromText_` | 인프라·유틸 |
| `tools/legacy-gas/거래처 발송 주문서/Code.js:524` | `isBlockedByNote_` | 업무규칙 |
| `tools/legacy-gas/거래처 발송 주문서/Code.js:531` | `isSoldOutByNote_` | 업무규칙 |
| `tools/legacy-gas/거래처 발송 주문서/Code.js:538` | `unifyCatL_` | 인프라·유틸 |
| `tools/legacy-gas/거래처 발송 주문서/Code.js:541` | `classifyHome_` | 업무규칙 |
| `tools/legacy-gas/거래처 발송 주문서/Code.js:631` | `getHomeMulti` | 업무규칙 |
| `tools/legacy-gas/거래처 발송 주문서/Code.js:713` | `classifySingleSetLM_` | 업무규칙 |
| `tools/legacy-gas/거래처 발송 주문서/Code.js:742` | `findHeaderIndex_` | 인프라·유틸 |
| `tools/legacy-gas/거래처 발송 주문서/Code.js:753` | `getSingleSets` | 업무규칙 |
| `tools/legacy-gas/거래처 발송 주문서/Code.js:849` | `extractRowsFromFormula_` | 인프라·유틸 |
| `tools/legacy-gas/거래처 발송 주문서/Code.js:859` | `getSingleParts` | 업무규칙 |
| `tools/legacy-gas/거래처 발송 주문서/Code.js:915` | `getSingleMatPrices` | 업무규칙 |
| `tools/legacy-gas/거래처 발송 주문서/Code.js:926` | `classifyCommercial_` | 업무규칙 |
| `tools/legacy-gas/거래처 발송 주문서/Code.js:1010` | `getCommercialMulti` | 업무규칙 |
| `tools/legacy-gas/거래처 발송 주문서/Code.js:1102` | `getCommercialParts` | 업무규칙 |
| `tools/legacy-gas/거래처 발송 주문서/Code.js:1185` | `getSpecMap_` | 업무규칙 |
| `tools/legacy-gas/거래처 발송 주문서/Code.js:1195` | `scan` | 인프라·유틸 |
| `tools/legacy-gas/거래처 발송 주문서/Code.js:1237` | `getSpecDetailMap_` | 업무규칙 |
| `tools/legacy-gas/거래처 발송 주문서/Code.js:1253` | `idx` | 인프라·유틸 |
| `tools/legacy-gas/거래처 발송 주문서/Code.js:1260` | `findContains` | 인프라·유틸 |
| `tools/legacy-gas/거래처 발송 주문서/Code.js:1267` | `scanHome` | 업무규칙 |
| `tools/legacy-gas/거래처 발송 주문서/Code.js:1344` | `scanSingle` | 업무규칙 |
| `tools/legacy-gas/거래처 발송 주문서/Code.js:1438` | `scanComm` | 업무규칙 |
| `tools/legacy-gas/거래처 발송 주문서/Code.js:1465` | `iDuct` | 인프라·유틸 |
| `tools/legacy-gas/거래처 발송 주문서/Code.js:1498` | `joinCols` | 인프라·유틸 |
| `tools/legacy-gas/거래처 발송 주문서/Code.js:1606` | `getHomeDefaults` | 업무규칙 |
| `tools/legacy-gas/거래처 발송 주문서/Code.js:1612` | `pick` | 인프라·유틸 |
| `tools/legacy-gas/거래처 발송 주문서/Code.js:1631` | `getSingleDefaults` | 업무규칙 |
| `tools/legacy-gas/거래처 발송 주문서/Code.js:1637` | `pick` | 인프라·유틸 |
| `tools/legacy-gas/거래처 발송 주문서/Code.js:1659` | `getCustomers_` | 인프라·유틸 |
| `tools/legacy-gas/거래처 발송 주문서/Code.js:1710` | `searchCustomerByBizOrCode` | 인프라·유틸 |
| `tools/legacy-gas/거래처 발송 주문서/Code.js:1729` | `getManagers_` | 인프라·유틸 |
| `tools/legacy-gas/거래처 발송 주문서/Code.js:1762` | `searchManagersByName_` | 인프라·유틸 |
| `tools/legacy-gas/거래처 발송 주문서/Code.js:1770` | `findManagerByNameExact_` | 인프라·유틸 |
| `tools/legacy-gas/거래처 발송 주문서/Code.js:1779` | `getScriptCreds_` | 인프라·유틸 |
| `tools/legacy-gas/거래처 발송 주문서/Code.js:1793` | `callZoneApi` | 인프라·유틸 |
| `tools/legacy-gas/거래처 발송 주문서/Code.js:1806` | `getEcountSession` | 인프라·유틸 |
| `tools/legacy-gas/거래처 발송 주문서/Code.js:1831` | `decideWarehouseCode_` | 업무규칙 |
| `tools/legacy-gas/거래처 발송 주문서/Code.js:1836` | `getOrigName_` | 업무규칙 |
| `tools/legacy-gas/거래처 발송 주문서/Code.js:1842` | `getSection_` | 업무규칙 |
| `tools/legacy-gas/거래처 발송 주문서/Code.js:1874` | `formatWonDiscountLabel_` | 인프라·유틸 |
| `tools/legacy-gas/거래처 발송 주문서/Code.js:1895` | `formatPercentLabel_` | 인프라·유틸 |
| `tools/legacy-gas/거래처 발송 주문서/Code.js:1902` | `combineRemarks_` | 인프라·유틸 |
| `tools/legacy-gas/거래처 발송 주문서/Code.js:1911` | `getOldProducts_` | 업무규칙 |
| `tools/legacy-gas/거래처 발송 주문서/Code.js:1954` | `sendOrderFromUi` | 업무규칙 |
| `tools/legacy-gas/거래처 발송 주문서/Code.js:2368` | `formatDate` | 인프라·유틸 |
| `tools/legacy-gas/거래처 발송 주문서/Code.js:2407` | `detectHomeOrder` | 업무규칙 |
| `tools/legacy-gas/거래처 발송 주문서/Code.js:2427` | `buildDefaultDcConfig_` | 업무규칙 |
| `tools/legacy-gas/거래처 발송 주문서/Code.js:2444` | `fetchNotionDcConfig_` | 업무규칙 |
| `tools/legacy-gas/거래처 발송 주문서/Code.js:2543` | `num` | 인프라·유틸 |
| `tools/legacy-gas/거래처 발송 주문서/Code.js:2548` | `chk` | 인프라·유틸 |
| `tools/legacy-gas/거래처 발송 주문서/Code.js:2553` | `sel` | 인프라·유틸 |
| `tools/legacy-gas/거래처 발송 주문서/Code.js:2560` | `textProp` | 인프라·유틸 |
| `tools/legacy-gas/거래처 발송 주문서/Code.js:2632` | `initDcConfigFromNotion` | 업무규칙 |
| `tools/legacy-gas/거래처 발송 주문서/Code.js:2684` | `searchCustomerByBizno` | 인프라·유틸 |
| `tools/legacy-gas/거래처 발송 주문서/Code.js:2690` | `getManagersForInput` | 인프라·유틸 |
| `tools/legacy-gas/거래처 발송 주문서/Code.js:2703` | `forceAuth` | 인프라·유틸 |
| `tools/legacy-gas/거래처 발송 주문서/Code.js:2709` | `checkAuthStatus` | 인프라·유틸 |
| `tools/legacy-gas/거래처 발송 주문서/Code.js:2746` | `requestAuthApproval` | 인프라·유틸 |
| `tools/legacy-gas/거래처 발송 주문서/Code.js:2764` | `setAuthPassword` | 인프라·유틸 |
| `tools/legacy-gas/거래처 발송 주문서/Code.js:2804` | `hashPassword_` | 인프라·유틸 |
| `tools/legacy-gas/거래처 발송 주문서/Code.js:2811` | `tryLogin` | 인프라·유틸 |
| `tools/legacy-gas/거래처 발송 주문서/Code.js:2886` | `queryAuthDb_` | 인프라·유틸 |
| `tools/legacy-gas/거래처 발송 주문서/Code.js:2928` | `getAccessExpiration` | 인프라·유틸 |
| `tools/legacy-gas/거래처 발송 주문서/Code.js:2939` | `getLatestTime` | 인프라·유틸 |
| `tools/legacy-gas/거래처 발송 주문서/Code.js:3007` | `saveTutorialState` | 인프라·유틸 |
| `tools/legacy-gas/거래처 발송 주문서/Code.js:3030` | `createAuthRow_` | 인프라·유틸 |
| `tools/legacy-gas/거래처 발송 주문서/Code.js:3054` | `updateAuthPage_` | 인프라·유틸 |
| `tools/legacy-gas/거래처 발송 주문서/Code.js:3072` | `_triggerAuth` | 인프라·유틸 |
| `tools/legacy-gas/거래처 발송 주문서/Code.js:3077` | `forceAuthCheck` | 인프라·유틸 |
| `tools/legacy-gas/거래처 발송 주문서/Code.js:3084` | `getOrderHistory` | 업무규칙 |
| `tools/legacy-gas/거래처 발송 주문서/Code.js:3154` | `getText` | 인프라·유틸 |
| `tools/legacy-gas/거래처 발송 주문서/Code.js:3155` | `getTitle` | 인프라·유틸 |
| `tools/legacy-gas/거래처 발송 주문서/Code.js:3156` | `getDate` | 인프라·유틸 |
| `tools/legacy-gas/거래처 발송 주문서/Code.js:3157` | `getNum` | 인프라·유틸 |
| `tools/legacy-gas/거래처 발송 주문서/Code.js:3158` | `getPhone` | 인프라·유틸 |
| `tools/legacy-gas/거래처 발송 주문서/Code.js:3222` | `saveOrderToNotion` | 인프라·유틸 |
| `tools/legacy-gas/거래처 발송 주문서/Code.js:3280` | `logActionToNotion` | 인프라·유틸 |
| `tools/legacy-gas/거래처 발송 주문서/Code.js:3318` | `logFrontEvent` | 인프라·유틸 |
| `tools/legacy-gas/거래처 발송 주문서/Code.js:3345` | `searchNaverAddress` | 인프라·유틸 |
| `tools/legacy-gas/거래처 발송 주문서/Code.js:3359` | `pushUnique` | 인프라·유틸 |
| `tools/legacy-gas/거래처 발송 주문서/Code.js:3378` | `buildAddressRequests_` | 인프라·유틸 |
| `tools/legacy-gas/거래처 발송 주문서/Code.js:3434` | `parseJusoResponse_` | 인프라·유틸 |
| `tools/legacy-gas/거래처 발송 주문서/Code.js:3455` | `cleanBdNm_` | 인프라·유틸 |
| `tools/legacy-gas/거래처 발송 주문서/Code.js:3467` | `escapeRegex_` | 인프라·유틸 |
| `tools/legacy-gas/거래처 발송 주문서/Code.js:3472` | `stripTrailingName_` | 인프라·유틸 |
| `tools/legacy-gas/거래처 발송 주문서/Code.js:3481` | `parseNaverLocalResponse_` | 인프라·유틸 |
| `tools/legacy-gas/거래처 발송 주문서/Code.js:3485` | `strip` | 인프라·유틸 |
| `tools/legacy-gas/거래처 발송 주문서/Code.js:3499` | `parseNaverGeocodeResponse_` | 인프라·유틸 |
| `tools/legacy-gas/거래처 발송 주문서/Code.js:3504` | `pickBuilding` | 인프라·유틸 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:1310` | `J` | 인프라·유틸 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:1311` | `isExpansionModel` | 업무규칙 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:1361` | `getModelFlags` | 업무규칙 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:1391` | `applyConfigFromServer` | 업무규칙 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:1414` | `parseFixedDc` | 업무규칙 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:1437` | `isWallMountName` | UI·표시 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:1443` | `getStockState_` | 업무규칙 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:1469` | `modelExists` | 업무규칙 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:1471` | `isPanelRow` | 업무규칙 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:1476` | `inferOneWaySize` | UI·표시 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:1484` | `isRemoteRow` | 업무규칙 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:1488` | `clearAllPanels` | 업무규칙 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:1491` | `clearAllRemotes` | 업무규칙 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:1496` | `pickPanelBy` | 업무규칙 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:1497` | `has` | 인프라·유틸 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:1532` | `cleanDisplayName` | UI·표시 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:1541` | `stripCommKeywords` | 업무규칙 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:1563` | `displayOverrides` | 업무규칙 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:1575` | `adjustSingleSetBasePrice` | 업무규칙 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:1606` | `roundK` | UI·표시 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:1612` | `roundByConfig` | UI·표시 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:1632` | `isIndoorUnitPart` | 업무규칙 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:1645` | `isOutdoorUnitPart` | 업무규칙 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:1656` | `splitIndoorOutdoorToK` | 업무규칙 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:1686` | `analyzeSingleSetDiscountFlags` | 업무규칙 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:1715` | `closeSpecModal` | UI·표시 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:1719` | `openSpecModalByItem` | UI·표시 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:1764` | `renderHomeSpec_` | UI·표시 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:1801` | `renderSingleSpec_` | UI·표시 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:1893` | `renderCommSpec_` | UI·표시 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:1997` | `renderErvSpec_` | UI·표시 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:2007` | `join_` | 인프라·유틸 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:2037` | `renderPanelSpecCommon_` | UI·표시 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:2049` | `buildTripleSpecRows_` | UI·표시 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:2064` | `specTableWithTriple_` | UI·표시 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:2114` | `specTable_` | UI·표시 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:2142` | `rawNameOf` | 인프라·유틸 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:2147` | `isCommIndoorRow` | 업무규칙 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:2153` | `isCommOutdoorRow` | 업무규칙 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:2159` | `commIndoorKind` | 업무규칙 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:2169` | `isCommPanelRow` | 업무규칙 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:2175` | `isCommHoseRow` | 업무규칙 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:2181` | `isCommRemoteRow` | 업무규칙 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:2187` | `isCommPumpRow` | 업무규칙 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:2193` | `computeCommRemoteModelForIndoor_` | 업무규칙 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:2225` | `pickHoseModel` | 업무규칙 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:2233` | `pickCommPanelModel` | 업무규칙 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:2240` | `hasExactHP` | UI·표시 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:2246` | `parseSetHPs` | 업무규칙 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:2253` | `chooseBaseModel` | 업무규칙 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:2298` | `basesForSetPiecesByExistingRule_` | UI·표시 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:2310` | `modelByNameLike` | 업무규칙 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:2323` | `countBranchForSet` | 업무규칙 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:2340` | `rgbForMid` | 인프라·유틸 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:2353` | `applyHomeMultiPriceVat` | 업무규칙 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:2361` | `normalizeHomeCategory` | 업무규칙 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:2376` | `classifySingleSetFixed` | 업무규칙 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:2419` | `priceFrom` | 업무규칙 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:2421` | `first` | 인프라·유틸 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:2437` | `homeUnitPrice` | 업무규칙 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:2485` | `partUnitPrice` | 업무규칙 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:2500` | `setBasePriceLeft` | 업무규칙 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:2509` | `singleUnitPrice` | 업무규칙 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:2542` | `calc` | UI·표시 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:2555` | `commUnitPrice` | 업무규칙 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:2606` | `singleDispNameTrimmed` | 업무규칙 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:2650` | `markAutoHome` | 업무규칙 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:2651` | `markAutoSingle` | 업무규칙 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:2657` | `rebuildDerivedFromData` | UI·표시 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:2730` | `sumHome` | 업무규칙 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:2731` | `sumSingles` | 업무규칙 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:2732` | `sumComm` | 업무규칙 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:2737` | `syncCommTotals` | 업무규칙 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:2746` | `setFootSum` | 업무규칙 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:2769` | `bindQty` | UI·표시 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:2794` | `bindCommQtyEvents` | UI·표시 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:2889` | `bindCommQtyArrowNav` | UI·표시 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:2913` | `getCapacity` | 업무규칙 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:2920` | `updateHomeRatio` | 업무규칙 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:2949` | `updateCommRatio` | 업무규칙 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:2988` | `setPreviewFoot` | 업무규칙 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:3002` | `materialsSumForSet` | 업무규칙 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:3007` | `getDefaultRemoteRows` | 업무규칙 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:3008` | `getOptionRemoteRow` | 업무규칙 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:3015` | `allowRemoteChange_` | 업무규칙 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:3019` | `is1WaySet_` | 업무규칙 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:3024` | `getBasePanelRow` | 업무규칙 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:3025` | `pickPanelRow` | 업무규칙 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:3042` | `setBasePriceRightFirst` | 업무규칙 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:3055` | `calcSetUnitPrice` | 업무규칙 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:3085` | `partsForSetStrict_` | 업무규칙 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:3091` | `explodeSetParts` | 업무규칙 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:3232` | `partsForCommSet_` | 업무규칙 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:3244` | `inferStandCountForOutdoor_` | 업무규칙 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:3251` | `recalcCommAccessories` | 업무규칙 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:3278` | `escapeFilterRe_` | UI·표시 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:3282` | `applyHomeFilter` | 업무규칙 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:3301` | `applySingleFilter` | 업무규칙 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:3319` | `applyCommFilter` | 업무규칙 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:3339` | `updateHomeFilterOptions` | 업무규칙 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:3401` | `updateSingleFilterOptions` | 업무규칙 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:3450` | `updateCommFilterOptions` | 업무규칙 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:3560` | `initFilters` | UI·표시 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:3574` | `syncIcon` | 인프라·유틸 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:3588` | `syncIcon` | 인프라·유틸 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:3604` | `syncIcon` | 인프라·유틸 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:3613` | `renderHome` | UI·표시 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:3791` | `renderSingle` | UI·표시 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:3961` | `buildSingleSetCompositionHtml_` | 업무규칙 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:4026` | `normalizeCommCategory` | 업무규칙 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:4039` | `fixCommMidCategory` | 업무규칙 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:4047` | `renderCommOptions` | UI·표시 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:4068` | `getCommFilterRows_` | 업무규칙 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:4131` | `renderComm` | UI·표시 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:4331` | `buildDisplayNameComm` | 업무규칙 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:4370` | `displayNameForRow` | UI·표시 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:4383` | `normKey` | 인프라·유틸 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:4389` | `buildCommSetIndex` | 업무규칙 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:4415` | `explodeCommPreviewParts` | 업무규칙 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:4429` | `isCommSetRow` | 업무규칙 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:4434` | `explodeCommSets_` | 업무규칙 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:4452` | `renderCommSetParts` | UI·표시 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:4485` | `renderOld` | UI·표시 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:4563` | `sumOld` | UI·표시 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:4584` | `syncOldTotals` | 업무규칙 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:4592` | `isMobileNow` | 인프라·유틸 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:4600` | `initMobileUI` | UI·표시 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:4601` | `apply` | 인프라·유틸 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:4618` | `onViewportChange` | UI·표시 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:4646` | `enterMobile` | UI·표시 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:4669` | `updateTopControls` | UI·표시 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:4697` | `onHomeQtyInput` | 업무규칙 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:4705` | `onSingleQtyInput` | 업무규칙 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:4720` | `chk` | 인프라·유틸 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:4721` | `sel` | 인프라·유틸 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:4722` | `renderHomeOptions` | UI·표시 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:4734` | `renderSingleOptions` | UI·표시 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:4757` | `recomputeFootAll` | 업무규칙 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:4765` | `recomputeSingleBaseFoot` | 업무규칙 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:4781` | `recomputeSingleExtras` | 업무규칙 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:4806` | `isHomeCalcTriggerModel` | 업무규칙 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:4815` | `isSingleCalcTriggerId` | 업무규칙 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:4840` | `findHomePanelModel` | 업무규칙 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:4841` | `has` | 인프라·유틸 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:4855` | `pickInfinitePanelModel` | 업무규칙 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:4870` | `inferInfiniteSize` | UI·표시 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:4879` | `recomputeHomePanels` | 업무규칙 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:4951` | `pickModel` | 업무규칙 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:5005` | `recomputeHomeRemotes` | 업무규칙 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:5058` | `recomputeHomeBranches` | 업무규칙 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:5111` | `recomputeHomeDerived` | 업무규칙 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:5165` | `recomputeCommDerived` | 업무규칙 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:5347` | `has_` | 인프라·유틸 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:5348` | `computeCommPanelModelForIndoor_` | 업무규칙 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:5370` | `swap` | 인프라·유틸 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:5435` | `syncHomeUIFromState` | 업무규칙 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:5445` | `syncSingleUIFromState` | 업무규칙 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:5456` | `syncHomeTotals` | 업무규칙 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:5462` | `refreshSelectedBadge` | UI·표시 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:5484` | `getSetUnitNowById` | UI·표시 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:5498` | `explodeSendSets_` | 업무규칙 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:5527` | `openPreview` | UI·표시 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:5667` | `ensureKakaoPostcode` | UI·표시 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:5677` | `mountAddrSheet` | UI·표시 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:5724` | `fit` | UI·표시 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:5746` | `openPostcode` | UI·표시 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:5791` | `oncomplete` | UI·표시 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:5794` | `onresize` | UI·표시 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:5809` | `applyAddrFromPostcode_` | UI·표시 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:5819` | `openNaverAddrDock_` | UI·표시 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:5837` | `runNaverLocalSearch` | UI·표시 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:5869` | `scheduleNaverAutoSearch` | UI·표시 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:5883` | `escapeHtmlAddr` | UI·표시 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:5890` | `onNaverSearchSuccess` | UI·표시 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:5930` | `onNaverSearchFail` | UI·표시 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:5938` | `makeAddrRow_` | UI·표시 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:5960` | `composeAddrWithBuilding_` | UI·표시 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:5970` | `dedupeAddrWords_` | UI·표시 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:5983` | `isValidTel` | 업무규칙 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:5987` | `syncAuditFromShip_` | UI·표시 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:5994` | `toggleSameAddr_` | UI·표시 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:6022` | `checkOrderReady` | 업무규칙 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:6039` | `aggregateSendRows` | 업무규칙 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:6079` | `showSector` | UI·표시 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:6088` | `initGate` | UI·표시 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:6092` | `fitAfterGate` | UI·표시 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:6162` | `buildSendRows` | 업무규칙 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:6281` | `forceOrderTitle` | UI·표시 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:6291` | `initEvents` | UI·표시 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:6430` | `bindOrderHotkeys` | UI·표시 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:6431` | `run` | UI·표시 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:6439` | `applyDateChange` | UI·표시 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:6498` | `updateInlineTotals` | 업무규칙 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:6516` | `fixFootersForMobile` | 업무규칙 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:6571` | `fitTableWrap` | UI·표시 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:6603` | `fitAllTables` | UI·표시 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:6611` | `call` | 인프라·유틸 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:6613` | `setText` | 인프라·유틸 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:6615` | `fmtOrRaw` | 인프라·유틸 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:6617` | `valuesOf` | 인프라·유틸 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:6620` | `goHome` | UI·표시 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:6629` | `goSingle` | UI·표시 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:6638` | `goComm` | UI·표시 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:6653` | `goOld` | UI·표시 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:6679` | `bindViewSwitchButtons` | UI·표시 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:6748` | `capFromModel` | 업무규칙 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:6754` | `pickSelectedOutdoors` | 업무규칙 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:6780` | `pickSelectedIndoorsExpanded` | 업무규칙 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:6812` | `codeByCumulativeSum` | 업무규칙 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:6822` | `codeByOutdoorHP` | 업무규칙 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:6838` | `recomputeBranchCodes` | 업무규칙 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:6899` | `canOpenBranch` | 업무규칙 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:6912` | `refreshBranchButton` | UI·표시 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:6939` | `ensureBranchScaffold` | 업무규칙 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:6989` | `syncCommQtyFromDOM` | 업무규칙 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:6999` | `goBranchPage` | UI·표시 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:7015` | `backToComm` | 업무규칙 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:7028` | `debugIndoorsScan` | 업무규칙 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:7037` | `updateBranchTopButton` | 업무규칙 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:7047` | `handleBranchToggleClick` | 업무규칙 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:7056` | `setBranchTopButtonForBranch` | 업무규칙 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:7072` | `renderBranchTable` | UI·표시 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:7121` | `makeCapsule` | UI·표시 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:7133` | `fixBranchDOM` | 업무규칙 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:7143` | `wireBranchDnD` | UI·표시 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:7221` | `packOutColumn` | UI·표시 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:7249` | `repackLeft` | UI·표시 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:7273` | `pushBackToLeft` | UI·표시 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:7288` | `buildBranchView` | UI·표시 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:7324` | `packAllOutColumns` | UI·표시 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:7331` | `limitByOutdoor` | 업무규칙 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:7334` | `sumCapsIn` | 업무규칙 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:7340` | `firstBranchByOutdoorCap` | 업무규칙 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:7350` | `updateBranchRatios` | 업무규칙 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:7394` | `setCommBranchQtyByLike` | 업무규칙 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:7403` | `pushBranchPartsToCommFromBadges` | 업무규칙 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:7426` | `snapshotBranchState` | 업무규칙 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:7443` | `saveBranchState` | 업무규칙 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:7450` | `loadBranchState` | 업무규칙 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:7461` | `applyBranchState` | 업무규칙 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:7511` | `canOpenBranchFromComm` | 업무규칙 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:7526` | `refreshBranchOpenButton` | UI·표시 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:7590` | `prepareGateImages` | UI·표시 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:7600` | `isGateVisible` | UI·표시 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:7609` | `showGateImageModal` | UI·표시 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:7670` | `updateImgSlide` | UI·표시 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:7685` | `isNoMainUnit` | 업무규칙 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:7724` | `getTierBonusRate` | 업무규칙 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:7733` | `isStandard45` | 업무규칙 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:7738` | `runWithAdjustedRates` | 업무규칙 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:7815` | `openPreview` | UI·표시 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:7841` | `buildSendRows` | 업무규칙 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:7891` | `onAuthStatus` | UI·표시 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:7985` | `showAuthModal` | UI·표시 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:8143` | `completeLogin` | UI·표시 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:8196` | `fetchExpirationDate` | UI·표시 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:8212` | `startExpirationPolling` | UI·표시 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:8217` | `playWelcomeAnimation` | UI·표시 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:8273` | `showLoadingGate` | UI·표시 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:8353` | `enforceDateLimit` | UI·표시 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:8429` | `fetchOrderHistory` | 업무규칙 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:8447` | `renderHistory` | UI·표시 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:8494` | `openDetail` | UI·표시 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:8498` | `ymd` | UI·표시 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:8499` | `comma` | 업무규칙 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:8544` | `logActionToNotion` | UI·표시 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:8583` | `sendLog` | UI·표시 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:8603` | `relocateUI` | UI·표시 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:8725` | `updateTopControls` | UI·표시 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:8746` | `toggleDrawer` | UI·표시 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:8760` | `handleResize` | UI·표시 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:8769` | `takeSnapshot` | UI·표시 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:8805` | `toYMD` | 인프라·유틸 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:8813` | `updateTopControls` | UI·표시 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:8840` | `handleSaveSnapshot` | UI·표시 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:8987` | `showCustNameModal` | UI·표시 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:9060` | `applySnapshot` | UI·표시 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:9083` | `res` | 인프라·유틸 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:9127` | `goSnapshotPage` | UI·표시 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:9156` | `closeSnapshotPage` | UI·표시 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:9164` | `loadSnapshotHistory` | UI·표시 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:9199` | `renderSnapshotTable` | UI·표시 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:9235` | `restoreSnapshot` | UI·표시 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:9241` | `showSnapshotPreview` | UI·표시 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:9293` | `decodeBase64` | 인프라·유틸 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:9302` | `initAutoLogout` | UI·표시 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:9307` | `updateTimerDisplay` | UI·표시 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:9330` | `resetTimer` | UI·표시 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:9361` | `requestInitialData` | UI·표시 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:9376` | `onInitialDataLoaded` | UI·표시 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:9504` | `closeAllTutDrawers` | UI·표시 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:9514` | `openTutDrawer` | UI·표시 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:9562` | `setTutBlockers` | UI·표시 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:9588` | `hideTutBlockers` | UI·표시 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:9595` | `checkAndStartTutorial` | UI·표시 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:9613` | `runTutStep` | UI·표시 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:9677` | `getTarget` | 인프라·유틸 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:9711` | `trackTarget` | UI·표시 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:9733` | `getEvtTarget` | 인프라·유틸 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:9758` | `updateArrow` | UI·표시 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:9791` | `handler` | 인프라·유틸 |
| `tools/legacy-gas/거래처 발송 주문서/index.html:9805` | `endTut` | UI·표시 |
| `tools/legacy-gas/거래처 발송 주문서/기간별 비빌번호 재설정/Code.js:2` | `rotatePasswordsMonthly` | 인프라·유틸 |
| `tools/legacy-gas/거래처 발송 주문서/기간별 비빌번호 재설정/Code.js:89` | `getSafeText_` | 인프라·유틸 |
| `tools/legacy-gas/거래처 발송 주문서/기간별 비빌번호 재설정/Code.js:97` | `makeRichText_` | 인프라·유틸 |
| `tools/legacy-gas/거래처 발송 주문서/장기미발주 거래처 선별/Code.js:12` | `processLongTermUnusedClientsFast` | 업무규칙 |
| `tools/legacy-gas/거래처 발송 주문서/장기미발주 거래처 선별/Code.js:65` | `getActiveBizNosFromLog_` | 업무규칙 |
| `tools/legacy-gas/거래처 발송 주문서/장기미발주 거래처 선별/Code.js:110` | `getActiveBizNosFromShipping_` | 업무규칙 |
| `tools/legacy-gas/거래처 발송 주문서/장기미발주 거래처 선별/Code.js:161` | `getTargetClients_` | 업무규칙 |
| `tools/legacy-gas/거래처 발송 주문서/장기미발주 거래처 선별/Code.js:214` | `updateClientStatus_` | 업무규칙 |
| `tools/legacy-gas/종합견적서/Code.js:6` | `doGet` | 인프라·유틸 |
| `tools/legacy-gas/종합견적서/Code.js:17` | `getInitialData` | 인프라·유틸 |
| `tools/legacy-gas/종합견적서/Code.js:80` | `cachePutJSON_` | 인프라·유틸 |
| `tools/legacy-gas/종합견적서/Code.js:90` | `cacheGetJSON_` | 인프라·유틸 |
| `tools/legacy-gas/종합견적서/Code.js:104` | `cacheRemoveJSON_` | 인프라·유틸 |
| `tools/legacy-gas/종합견적서/Code.js:116` | `getGateImages` | 인프라·유틸 |
| `tools/legacy-gas/종합견적서/Code.js:144` | `getLogoImage` | 인프라·유틸 |
| `tools/legacy-gas/종합견적서/Code.js:187` | `normalizeSize_` | 인프라·유틸 |
| `tools/legacy-gas/종합견적서/Code.js:192` | `findIdx_` | 인프라·유틸 |
| `tools/legacy-gas/종합견적서/Code.js:196` | `parseKRNumber_` | 인프라·유틸 |
| `tools/legacy-gas/종합견적서/Code.js:202` | `parseKRFloat_` | 인프라·유틸 |
| `tools/legacy-gas/종합견적서/Code.js:208` | `toYmd_` | 인프라·유틸 |
| `tools/legacy-gas/종합견적서/Code.js:215` | `toMmDd_` | 인프라·유틸 |
| `tools/legacy-gas/종합견적서/Code.js:222` | `normalizeTel_` | 인프라·유틸 |
| `tools/legacy-gas/종합견적서/Code.js:229` | `todayYMD_` | 인프라·유틸 |
| `tools/legacy-gas/종합견적서/Code.js:230` | `_normSpec_` | 인프라·유틸 |
| `tools/legacy-gas/종합견적서/Code.js:233` | `sanitizeKoreanParen_` | 인프라·유틸 |
| `tools/legacy-gas/종합견적서/Code.js:241` | `trimSymbols_` | 인프라·유틸 |
| `tools/legacy-gas/종합견적서/Code.js:244` | `sanitizeDisp_` | 인프라·유틸 |
| `tools/legacy-gas/종합견적서/Code.js:247` | `hpFromText_` | 인프라·유틸 |
| `tools/legacy-gas/종합견적서/Code.js:257` | `isBlockedByNote_` | 업무규칙 |
| `tools/legacy-gas/종합견적서/Code.js:264` | `isSoldOutByNote_` | 업무규칙 |
| `tools/legacy-gas/종합견적서/Code.js:271` | `unifyCatL_` | 인프라·유틸 |
| `tools/legacy-gas/종합견적서/Code.js:274` | `classifyHome_` | 업무규칙 |
| `tools/legacy-gas/종합견적서/Code.js:364` | `getHomeMulti` | 업무규칙 |
| `tools/legacy-gas/종합견적서/Code.js:448` | `classifySingleSetLM_` | 업무규칙 |
| `tools/legacy-gas/종합견적서/Code.js:477` | `findHeaderIndex_` | 인프라·유틸 |
| `tools/legacy-gas/종합견적서/Code.js:488` | `getSingleSets` | 업무규칙 |
| `tools/legacy-gas/종합견적서/Code.js:590` | `extractRowsFromFormula_` | 인프라·유틸 |
| `tools/legacy-gas/종합견적서/Code.js:600` | `getSingleParts` | 업무규칙 |
| `tools/legacy-gas/종합견적서/Code.js:673` | `getSingleMatPrices` | 업무규칙 |
| `tools/legacy-gas/종합견적서/Code.js:684` | `classifyCommercial_` | 업무규칙 |
| `tools/legacy-gas/종합견적서/Code.js:768` | `getCommercialMulti` | 업무규칙 |
| `tools/legacy-gas/종합견적서/Code.js:863` | `getCommercialParts` | 업무규칙 |
| `tools/legacy-gas/종합견적서/Code.js:945` | `getSpecMap_` | 업무규칙 |
| `tools/legacy-gas/종합견적서/Code.js:955` | `scan` | 인프라·유틸 |
| `tools/legacy-gas/종합견적서/Code.js:996` | `getSpecDetailMap_` | 업무규칙 |
| `tools/legacy-gas/종합견적서/Code.js:1012` | `idx` | 인프라·유틸 |
| `tools/legacy-gas/종합견적서/Code.js:1019` | `findContains` | 인프라·유틸 |
| `tools/legacy-gas/종합견적서/Code.js:1026` | `scanHome` | 업무규칙 |
| `tools/legacy-gas/종합견적서/Code.js:1108` | `scanSingle` | 업무규칙 |
| `tools/legacy-gas/종합견적서/Code.js:1185` | `scanComm` | 업무규칙 |
| `tools/legacy-gas/종합견적서/Code.js:1212` | `iDuct` | 인프라·유틸 |
| `tools/legacy-gas/종합견적서/Code.js:1245` | `joinCols` | 인프라·유틸 |
| `tools/legacy-gas/종합견적서/Code.js:1357` | `getHomeDefaults` | 업무규칙 |
| `tools/legacy-gas/종합견적서/Code.js:1363` | `pick` | 인프라·유틸 |
| `tools/legacy-gas/종합견적서/Code.js:1382` | `getSingleDefaults` | 업무규칙 |
| `tools/legacy-gas/종합견적서/Code.js:1388` | `pick` | 인프라·유틸 |
| `tools/legacy-gas/종합견적서/Code.js:1410` | `getCustomerDataAsync` | 인프라·유틸 |
| `tools/legacy-gas/종합견적서/Code.js:1418` | `pickDc` | 인프라·유틸 |
| `tools/legacy-gas/종합견적서/Code.js:1429` | `getCustomers_` | 인프라·유틸 |
| `tools/legacy-gas/종합견적서/Code.js:1480` | `searchCustomerByBizOrCode` | 인프라·유틸 |
| `tools/legacy-gas/종합견적서/Code.js:1499` | `getManagers_` | 인프라·유틸 |
| `tools/legacy-gas/종합견적서/Code.js:1532` | `searchManagersByName_` | 인프라·유틸 |
| `tools/legacy-gas/종합견적서/Code.js:1540` | `findManagerByNameExact_` | 인프라·유틸 |
| `tools/legacy-gas/종합견적서/Code.js:1549` | `getScriptCreds_` | 인프라·유틸 |
| `tools/legacy-gas/종합견적서/Code.js:1563` | `callZoneApi` | 인프라·유틸 |
| `tools/legacy-gas/종합견적서/Code.js:1576` | `getEcountSession` | 인프라·유틸 |
| `tools/legacy-gas/종합견적서/Code.js:1610` | `getRecommendOduData` | 업무규칙 |
| `tools/legacy-gas/종합견적서/Code.js:1639` | `decideWarehouseCode_` | 업무규칙 |
| `tools/legacy-gas/종합견적서/Code.js:1644` | `getOrigName_` | 업무규칙 |
| `tools/legacy-gas/종합견적서/Code.js:1650` | `getSection_` | 업무규칙 |
| `tools/legacy-gas/종합견적서/Code.js:1682` | `formatWonDiscountLabel_` | 인프라·유틸 |
| `tools/legacy-gas/종합견적서/Code.js:1703` | `formatPercentLabel_` | 인프라·유틸 |
| `tools/legacy-gas/종합견적서/Code.js:1710` | `combineRemarks_` | 인프라·유틸 |
| `tools/legacy-gas/종합견적서/Code.js:1719` | `getOldProducts_` | 업무규칙 |
| `tools/legacy-gas/종합견적서/Code.js:1762` | `sendOrderFromUi` | 업무규칙 |
| `tools/legacy-gas/종합견적서/Code.js:1772` | `toYmd` | 인프라·유틸 |
| `tools/legacy-gas/종합견적서/Code.js:1938` | `formatDate` | 인프라·유틸 |
| `tools/legacy-gas/종합견적서/Code.js:1970` | `detectHomeOrder` | 업무규칙 |
| `tools/legacy-gas/종합견적서/Code.js:1990` | `buildDefaultDcConfig_` | 업무규칙 |
| `tools/legacy-gas/종합견적서/Code.js:2007` | `fetchNotionDcConfig_` | 업무규칙 |
| `tools/legacy-gas/종합견적서/Code.js:2106` | `num` | 인프라·유틸 |
| `tools/legacy-gas/종합견적서/Code.js:2111` | `chk` | 인프라·유틸 |
| `tools/legacy-gas/종합견적서/Code.js:2116` | `sel` | 인프라·유틸 |
| `tools/legacy-gas/종합견적서/Code.js:2166` | `initDcConfigFromNotion` | 업무규칙 |
| `tools/legacy-gas/종합견적서/Code.js:2204` | `getAllNotionDcConfigs_` | 업무규칙 |
| `tools/legacy-gas/종합견적서/Code.js:2257` | `num` | 인프라·유틸 |
| `tools/legacy-gas/종합견적서/Code.js:2260` | `chk` | 인프라·유틸 |
| `tools/legacy-gas/종합견적서/Code.js:2263` | `sel` | 인프라·유틸 |
| `tools/legacy-gas/종합견적서/Code.js:2311` | `searchCustomerByBizno` | 인프라·유틸 |
| `tools/legacy-gas/종합견적서/Code.js:2317` | `getManagersForInput` | 인프라·유틸 |
| `tools/legacy-gas/종합견적서/Code.js:2330` | `forceAuth` | 인프라·유틸 |
| `tools/legacy-gas/종합견적서/Code.js:2340` | `saveOrderToNotion` | 인프라·유틸 |
| `tools/legacy-gas/종합견적서/Code.js:2415` | `getNotionHistory` | 인프라·유틸 |
| `tools/legacy-gas/종합견적서/Code.js:2520` | `logFrontEvent` | 인프라·유틸 |
| `tools/legacy-gas/종합견적서/Code.js:2552` | `checkUserAuth` | 인프라·유틸 |
| `tools/legacy-gas/종합견적서/Code.js:2577` | `getText` | 인프라·유틸 |
| `tools/legacy-gas/종합견적서/Code.js:2578` | `getTitle` | 인프라·유틸 |
| `tools/legacy-gas/종합견적서/Code.js:2579` | `getSelect` | 인프라·유틸 |
| `tools/legacy-gas/종합견적서/Code.js:2604` | `getInventoryTableHtml` | 인프라·유틸 |
| `tools/legacy-gas/종합견적서/Code.js:2709` | `getInventoryTable` | 인프라·유틸 |
| `tools/legacy-gas/종합견적서/Code.js:2715` | `include` | 인프라·유틸 |
| `tools/legacy-gas/종합견적서/Code.js:2724` | `saveQuoteSnapshot` | 업무규칙 |
| `tools/legacy-gas/종합견적서/Code.js:2791` | `getQuoteHistory` | 업무규칙 |
| `tools/legacy-gas/종합견적서/Code.js:2879` | `getQuoteHistoryByCustomer` | 업무규칙 |
| `tools/legacy-gas/종합견적서/Code.js:2944` | `getPriceIncData_` | 업무규칙 |
| `tools/legacy-gas/종합견적서/Code.js:2953` | `readSheet` | 인프라·유틸 |
| `tools/legacy-gas/종합견적서/Code.js:3028` | `searchNaverAddress` | 인프라·유틸 |
| `tools/legacy-gas/종합견적서/Code.js:3042` | `pushUnique` | 인프라·유틸 |
| `tools/legacy-gas/종합견적서/Code.js:3061` | `buildAddressRequests_` | 인프라·유틸 |
| `tools/legacy-gas/종합견적서/Code.js:3117` | `parseJusoResponse_` | 인프라·유틸 |
| `tools/legacy-gas/종합견적서/Code.js:3138` | `cleanBdNm_` | 인프라·유틸 |
| `tools/legacy-gas/종합견적서/Code.js:3150` | `escapeRegex_` | 인프라·유틸 |
| `tools/legacy-gas/종합견적서/Code.js:3155` | `stripTrailingName_` | 인프라·유틸 |
| `tools/legacy-gas/종합견적서/Code.js:3164` | `parseNaverLocalResponse_` | 인프라·유틸 |
| `tools/legacy-gas/종합견적서/Code.js:3168` | `strip` | 인프라·유틸 |
| `tools/legacy-gas/종합견적서/Code.js:3182` | `parseNaverGeocodeResponse_` | 인프라·유틸 |
| `tools/legacy-gas/종합견적서/Code.js:3187` | `pickBuilding` | 인프라·유틸 |
| `tools/legacy-gas/종합견적서/index.html:2156` | `getBaseListPrice` | 업무규칙 |
| `tools/legacy-gas/종합견적서/index.html:2171` | `J` | 인프라·유틸 |
| `tools/legacy-gas/종합견적서/index.html:2200` | `getModelFlags` | 업무규칙 |
| `tools/legacy-gas/종합견적서/index.html:2230` | `getRealHomePrice` | 업무규칙 |
| `tools/legacy-gas/종합견적서/index.html:2235` | `getRealCommPrice` | 업무규칙 |
| `tools/legacy-gas/종합견적서/index.html:2240` | `getRealSinglePrice` | 업무규칙 |
| `tools/legacy-gas/종합견적서/index.html:2246` | `getRealOldPrice` | 업무규칙 |
| `tools/legacy-gas/종합견적서/index.html:2272` | `applyConfigFromServer` | 업무규칙 |
| `tools/legacy-gas/종합견적서/index.html:2293` | `applyCustomerDiscounts` | 업무규칙 |
| `tools/legacy-gas/종합견적서/index.html:2295` | `numOr` | UI·표시 |
| `tools/legacy-gas/종합견적서/index.html:2321` | `setField` | UI·표시 |
| `tools/legacy-gas/종합견적서/index.html:2327` | `setCheck` | UI·표시 |
| `tools/legacy-gas/종합견적서/index.html:2354` | `getRealListPrice` | 업무규칙 |
| `tools/legacy-gas/종합견적서/index.html:2383` | `getRealSpec` | 업무규칙 |
| `tools/legacy-gas/종합견적서/index.html:2391` | `handleSpecInput` | UI·표시 |
| `tools/legacy-gas/종합견적서/index.html:2431` | `makeSpecInput` | UI·표시 |
| `tools/legacy-gas/종합견적서/index.html:2451` | `handleListPriceInput` | 업무규칙 |
| `tools/legacy-gas/종합견적서/index.html:2542` | `makeListPriceInput` | 업무규칙 |
| `tools/legacy-gas/종합견적서/index.html:2568` | `handlePriceInput` | 업무규칙 |
| `tools/legacy-gas/종합견적서/index.html:2672` | `makePriceInput` | 업무규칙 |
| `tools/legacy-gas/종합견적서/index.html:2699` | `handleFreightInput` | 업무규칙 |
| `tools/legacy-gas/종합견적서/index.html:2757` | `numInp` | UI·표시 |
| `tools/legacy-gas/종합견적서/index.html:2804` | `roundSel` | UI·표시 |
| `tools/legacy-gas/종합견적서/index.html:2834` | `parseFixedDc` | 업무규칙 |
| `tools/legacy-gas/종합견적서/index.html:2850` | `isWallMountName` | UI·표시 |
| `tools/legacy-gas/종합견적서/index.html:2856` | `getStockState_` | 업무규칙 |
| `tools/legacy-gas/종합견적서/index.html:2882` | `modelExists` | 업무규칙 |
| `tools/legacy-gas/종합견적서/index.html:2884` | `isPanelRow` | 업무규칙 |
| `tools/legacy-gas/종합견적서/index.html:2889` | `inferOneWaySize` | UI·표시 |
| `tools/legacy-gas/종합견적서/index.html:2897` | `isRemoteRow` | 업무규칙 |
| `tools/legacy-gas/종합견적서/index.html:2901` | `clearAllPanels` | 업무규칙 |
| `tools/legacy-gas/종합견적서/index.html:2904` | `clearAllRemotes` | 업무규칙 |
| `tools/legacy-gas/종합견적서/index.html:2909` | `pickPanelBy` | 업무규칙 |
| `tools/legacy-gas/종합견적서/index.html:2910` | `has` | 인프라·유틸 |
| `tools/legacy-gas/종합견적서/index.html:2950` | `cleanDisplayName` | UI·표시 |
| `tools/legacy-gas/종합견적서/index.html:2958` | `stripCommKeywords` | 업무규칙 |
| `tools/legacy-gas/종합견적서/index.html:2980` | `displayOverrides` | 업무규칙 |
| `tools/legacy-gas/종합견적서/index.html:2992` | `adjustSingleSetBasePrice` | 업무규칙 |
| `tools/legacy-gas/종합견적서/index.html:3025` | `roundK` | UI·표시 |
| `tools/legacy-gas/종합견적서/index.html:3031` | `roundByConfig` | UI·표시 |
| `tools/legacy-gas/종합견적서/index.html:3054` | `isIndoorUnitPart` | 업무규칙 |
| `tools/legacy-gas/종합견적서/index.html:3067` | `isOutdoorUnitPart` | 업무규칙 |
| `tools/legacy-gas/종합견적서/index.html:3078` | `splitIndoorOutdoorToK` | 업무규칙 |
| `tools/legacy-gas/종합견적서/index.html:3106` | `analyzeSingleSetDiscountFlags` | 업무규칙 |
| `tools/legacy-gas/종합견적서/index.html:3136` | `closeSpecModal` | UI·표시 |
| `tools/legacy-gas/종합견적서/index.html:3140` | `getSpecModelName` | 업무규칙 |
| `tools/legacy-gas/종합견적서/index.html:3146` | `getSpecModalCanvas` | UI·표시 |
| `tools/legacy-gas/종합견적서/index.html:3171` | `copySpecImage` | UI·표시 |
| `tools/legacy-gas/종합견적서/index.html:3185` | `saveSpecImage` | UI·표시 |
| `tools/legacy-gas/종합견적서/index.html:3194` | `openSpecModalByItem` | UI·표시 |
| `tools/legacy-gas/종합견적서/index.html:3240` | `renderHomeSpec_` | UI·표시 |
| `tools/legacy-gas/종합견적서/index.html:3282` | `renderSingleSpec_` | UI·표시 |
| `tools/legacy-gas/종합견적서/index.html:3377` | `renderCommSpec_` | UI·표시 |
| `tools/legacy-gas/종합견적서/index.html:3481` | `renderErvSpec_` | UI·표시 |
| `tools/legacy-gas/종합견적서/index.html:3491` | `join_` | 인프라·유틸 |
| `tools/legacy-gas/종합견적서/index.html:3525` | `renderPanelSpecCommon_` | UI·표시 |
| `tools/legacy-gas/종합견적서/index.html:3537` | `buildTripleSpecRows_` | UI·표시 |
| `tools/legacy-gas/종합견적서/index.html:3552` | `specTableWithTriple_` | UI·표시 |
| `tools/legacy-gas/종합견적서/index.html:3602` | `specTable_` | UI·표시 |
| `tools/legacy-gas/종합견적서/index.html:3623` | `rawNameOf` | 인프라·유틸 |
| `tools/legacy-gas/종합견적서/index.html:3628` | `isCommIndoorRow` | 업무규칙 |
| `tools/legacy-gas/종합견적서/index.html:3634` | `isCommOutdoorRow` | 업무규칙 |
| `tools/legacy-gas/종합견적서/index.html:3640` | `commIndoorKind` | 업무규칙 |
| `tools/legacy-gas/종합견적서/index.html:3650` | `isCommPanelRow` | 업무규칙 |
| `tools/legacy-gas/종합견적서/index.html:3656` | `isCommHoseRow` | 업무규칙 |
| `tools/legacy-gas/종합견적서/index.html:3662` | `isCommRemoteRow` | 업무규칙 |
| `tools/legacy-gas/종합견적서/index.html:3668` | `isCommPumpRow` | 업무규칙 |
| `tools/legacy-gas/종합견적서/index.html:3674` | `computeCommRemoteModelForIndoor_` | 업무규칙 |
| `tools/legacy-gas/종합견적서/index.html:3706` | `pickHoseModel` | 업무규칙 |
| `tools/legacy-gas/종합견적서/index.html:3714` | `pickCommPanelModel` | 업무규칙 |
| `tools/legacy-gas/종합견적서/index.html:3721` | `hasExactHP` | UI·표시 |
| `tools/legacy-gas/종합견적서/index.html:3727` | `parseSetHPs` | 업무규칙 |
| `tools/legacy-gas/종합견적서/index.html:3734` | `chooseBaseModel` | 업무규칙 |
| `tools/legacy-gas/종합견적서/index.html:3779` | `basesForSetPiecesByExistingRule_` | UI·표시 |
| `tools/legacy-gas/종합견적서/index.html:3791` | `modelByNameLike` | 업무규칙 |
| `tools/legacy-gas/종합견적서/index.html:3804` | `countBranchForSet` | 업무규칙 |
| `tools/legacy-gas/종합견적서/index.html:3821` | `rgbForMid` | 인프라·유틸 |
| `tools/legacy-gas/종합견적서/index.html:3834` | `applyHomeMultiPriceVat` | 업무규칙 |
| `tools/legacy-gas/종합견적서/index.html:3841` | `normalizeHomeCategory` | 업무규칙 |
| `tools/legacy-gas/종합견적서/index.html:3856` | `isExpansionModel` | 업무규칙 |
| `tools/legacy-gas/종합견적서/index.html:3869` | `classifySingleSetFixed` | 업무규칙 |
| `tools/legacy-gas/종합견적서/index.html:3910` | `priceFrom` | 업무규칙 |
| `tools/legacy-gas/종합견적서/index.html:3912` | `first` | 인프라·유틸 |
| `tools/legacy-gas/종합견적서/index.html:3928` | `homeUnitPrice` | 업무규칙 |
| `tools/legacy-gas/종합견적서/index.html:3974` | `partUnitPrice` | 업무규칙 |
| `tools/legacy-gas/종합견적서/index.html:3989` | `singleUnitPrice` | 업무규칙 |
| `tools/legacy-gas/종합견적서/index.html:4026` | `calc` | UI·표시 |
| `tools/legacy-gas/종합견적서/index.html:4039` | `commUnitPrice` | 업무규칙 |
| `tools/legacy-gas/종합견적서/index.html:4085` | `singleDispNameTrimmed` | 업무규칙 |
| `tools/legacy-gas/종합견적서/index.html:4130` | `markAutoHome` | 업무규칙 |
| `tools/legacy-gas/종합견적서/index.html:4131` | `markAutoSingle` | 업무규칙 |
| `tools/legacy-gas/종합견적서/index.html:4142` | `trackInteraction` | UI·표시 |
| `tools/legacy-gas/종합견적서/index.html:4187` | `applyAbsoluteLock` | UI·표시 |
| `tools/legacy-gas/종합견적서/index.html:4212` | `set` | UI·표시 |
| `tools/legacy-gas/종합견적서/index.html:4230` | `set` | UI·표시 |
| `tools/legacy-gas/종합견적서/index.html:4248` | `sumHome` | 업무규칙 |
| `tools/legacy-gas/종합견적서/index.html:4249` | `sumSingles` | 업무규칙 |
| `tools/legacy-gas/종합견적서/index.html:4250` | `sumComm` | 업무규칙 |
| `tools/legacy-gas/종합견적서/index.html:4255` | `syncCommTotals` | 업무규칙 |
| `tools/legacy-gas/종합견적서/index.html:4271` | `setFootSum` | 업무규칙 |
| `tools/legacy-gas/종합견적서/index.html:4292` | `bindQty` | UI·표시 |
| `tools/legacy-gas/종합견적서/index.html:4314` | `bindCommQtyEvents` | UI·표시 |
| `tools/legacy-gas/종합견적서/index.html:4444` | `bindCommQtyArrowNav` | UI·표시 |
| `tools/legacy-gas/종합견적서/index.html:4465` | `getCapacity` | 업무규칙 |
| `tools/legacy-gas/종합견적서/index.html:4472` | `updateHomeRatio` | 업무규칙 |
| `tools/legacy-gas/종합견적서/index.html:4559` | `updateCommRatio` | 업무규칙 |
| `tools/legacy-gas/종합견적서/index.html:4649` | `setPreviewFoot` | 업무규칙 |
| `tools/legacy-gas/종합견적서/index.html:4665` | `materialsSumForSet` | 업무규칙 |
| `tools/legacy-gas/종합견적서/index.html:4670` | `getDefaultRemoteRows` | 업무규칙 |
| `tools/legacy-gas/종합견적서/index.html:4671` | `getOptionRemoteRow` | 업무규칙 |
| `tools/legacy-gas/종합견적서/index.html:4678` | `allowRemoteChange_` | 업무규칙 |
| `tools/legacy-gas/종합견적서/index.html:4682` | `is1WaySet_` | 업무규칙 |
| `tools/legacy-gas/종합견적서/index.html:4687` | `getBasePanelRow` | 업무규칙 |
| `tools/legacy-gas/종합견적서/index.html:4688` | `pickPanelRow` | 업무규칙 |
| `tools/legacy-gas/종합견적서/index.html:4705` | `setBasePriceRightFirst` | 업무규칙 |
| `tools/legacy-gas/종합견적서/index.html:4715` | `calcSetUnitPrice` | 업무규칙 |
| `tools/legacy-gas/종합견적서/index.html:4773` | `partsForSetStrict_` | 업무규칙 |
| `tools/legacy-gas/종합견적서/index.html:4780` | `explodeSetParts` | 업무규칙 |
| `tools/legacy-gas/종합견적서/index.html:4914` | `partsForCommSet_` | 업무규칙 |
| `tools/legacy-gas/종합견적서/index.html:4925` | `inferStandCountForOutdoor_` | 업무규칙 |
| `tools/legacy-gas/종합견적서/index.html:4932` | `recalcCommAccessories` | 업무규칙 |
| `tools/legacy-gas/종합견적서/index.html:4959` | `escapeFilterRe_` | UI·표시 |
| `tools/legacy-gas/종합견적서/index.html:4963` | `applyHomeFilter` | 업무규칙 |
| `tools/legacy-gas/종합견적서/index.html:4984` | `applySingleFilter` | 업무규칙 |
| `tools/legacy-gas/종합견적서/index.html:5004` | `applyCommFilter` | 업무규칙 |
| `tools/legacy-gas/종합견적서/index.html:5026` | `updateHomeFilterOptions` | 업무규칙 |
| `tools/legacy-gas/종합견적서/index.html:5088` | `updateSingleFilterOptions` | 업무규칙 |
| `tools/legacy-gas/종합견적서/index.html:5142` | `updateCommFilterOptions` | 업무규칙 |
| `tools/legacy-gas/종합견적서/index.html:5252` | `initFilters` | UI·표시 |
| `tools/legacy-gas/종합견적서/index.html:5266` | `syncIcon` | 인프라·유틸 |
| `tools/legacy-gas/종합견적서/index.html:5280` | `syncIcon` | 인프라·유틸 |
| `tools/legacy-gas/종합견적서/index.html:5296` | `syncIcon` | 인프라·유틸 |
| `tools/legacy-gas/종합견적서/index.html:5305` | `renderHome` | UI·표시 |
| `tools/legacy-gas/종합견적서/index.html:5549` | `updateHomeRowPrice` | 업무규칙 |
| `tools/legacy-gas/종합견적서/index.html:5625` | `renderSingleSetParts` | UI·표시 |
| `tools/legacy-gas/종합견적서/index.html:5681` | `getRank` | UI·표시 |
| `tools/legacy-gas/종합견적서/index.html:5812` | `renderSingle` | UI·표시 |
| `tools/legacy-gas/종합견적서/index.html:6101` | `buildSingleSetCompositionHtml_` | 업무규칙 |
| `tools/legacy-gas/종합견적서/index.html:6169` | `normalizeCommCategory` | 업무규칙 |
| `tools/legacy-gas/종합견적서/index.html:6177` | `fixCommMidCategory` | 업무규칙 |
| `tools/legacy-gas/종합견적서/index.html:6185` | `renderCommOptions` | UI·표시 |
| `tools/legacy-gas/종합견적서/index.html:6246` | `getCommFilterRows_` | 업무규칙 |
| `tools/legacy-gas/종합견적서/index.html:6302` | `renderComm` | UI·표시 |
| `tools/legacy-gas/종합견적서/index.html:6562` | `updateCommRowPrice` | 업무규칙 |
| `tools/legacy-gas/종합견적서/index.html:6693` | `buildDisplayNameComm` | 업무규칙 |
| `tools/legacy-gas/종합견적서/index.html:6731` | `displayNameForRow` | UI·표시 |
| `tools/legacy-gas/종합견적서/index.html:6742` | `normKey` | 인프라·유틸 |
| `tools/legacy-gas/종합견적서/index.html:6748` | `buildCommSetIndex` | 업무규칙 |
| `tools/legacy-gas/종합견적서/index.html:6773` | `explodeCommPreviewParts` | 업무규칙 |
| `tools/legacy-gas/종합견적서/index.html:6786` | `isCommSetRow` | 업무규칙 |
| `tools/legacy-gas/종합견적서/index.html:6791` | `explodeCommSets_` | 업무규칙 |
| `tools/legacy-gas/종합견적서/index.html:6834` | `renderCommSetParts` | UI·표시 |
| `tools/legacy-gas/종합견적서/index.html:6946` | `renderOldOptions` | UI·표시 |
| `tools/legacy-gas/종합견적서/index.html:6989` | `renderOld` | UI·표시 |
| `tools/legacy-gas/종합견적서/index.html:7130` | `sumOld` | UI·표시 |
| `tools/legacy-gas/종합견적서/index.html:7154` | `syncOldTotals` | 업무규칙 |
| `tools/legacy-gas/종합견적서/index.html:7171` | `isMobileNow` | 인프라·유틸 |
| `tools/legacy-gas/종합견적서/index.html:7179` | `initMobileUI` | UI·표시 |
| `tools/legacy-gas/종합견적서/index.html:7180` | `apply` | 인프라·유틸 |
| `tools/legacy-gas/종합견적서/index.html:7197` | `onViewportChange` | UI·표시 |
| `tools/legacy-gas/종합견적서/index.html:7223` | `enterMobile` | UI·표시 |
| `tools/legacy-gas/종합견적서/index.html:7244` | `updateTopControls` | UI·표시 |
| `tools/legacy-gas/종합견적서/index.html:7279` | `onHomeQtyInput` | 업무규칙 |
| `tools/legacy-gas/종합견적서/index.html:7328` | `onSingleQtyInput` | 업무규칙 |
| `tools/legacy-gas/종합견적서/index.html:7351` | `chk` | 인프라·유틸 |
| `tools/legacy-gas/종합견적서/index.html:7352` | `sel` | 인프라·유틸 |
| `tools/legacy-gas/종합견적서/index.html:7355` | `renderHomeOptions` | UI·표시 |
| `tools/legacy-gas/종합견적서/index.html:7398` | `renderSingleOptions` | UI·표시 |
| `tools/legacy-gas/종합견적서/index.html:7525` | `recomputeFootAll` | 업무규칙 |
| `tools/legacy-gas/종합견적서/index.html:7538` | `recomputeSingleBaseFoot` | 업무규칙 |
| `tools/legacy-gas/종합견적서/index.html:7579` | `recomputeSingleExtras` | 업무규칙 |
| `tools/legacy-gas/종합견적서/index.html:7604` | `isHomeCalcTriggerModel` | 업무규칙 |
| `tools/legacy-gas/종합견적서/index.html:7615` | `isSingleCalcTriggerId` | 업무규칙 |
| `tools/legacy-gas/종합견적서/index.html:7640` | `findHomePanelModel` | 업무규칙 |
| `tools/legacy-gas/종합견적서/index.html:7641` | `has` | 인프라·유틸 |
| `tools/legacy-gas/종합견적서/index.html:7655` | `pickInfinitePanelModel` | 업무규칙 |
| `tools/legacy-gas/종합견적서/index.html:7670` | `inferInfiniteSize` | UI·표시 |
| `tools/legacy-gas/종합견적서/index.html:7679` | `recomputeHomePanels` | 업무규칙 |
| `tools/legacy-gas/종합견적서/index.html:7726` | `setP` | UI·표시 |
| `tools/legacy-gas/종합견적서/index.html:7792` | `recomputeHomeRemotes` | 업무규칙 |
| `tools/legacy-gas/종합견적서/index.html:7815` | `setR` | UI·표시 |
| `tools/legacy-gas/종합견적서/index.html:7839` | `recomputeHomeBranches` | 업무규칙 |
| `tools/legacy-gas/종합견적서/index.html:7841` | `setB` | UI·표시 |
| `tools/legacy-gas/종합견적서/index.html:7900` | `recomputeHomeDerived` | 업무규칙 |
| `tools/legacy-gas/종합견적서/index.html:7921` | `setH` | UI·표시 |
| `tools/legacy-gas/종합견적서/index.html:7957` | `recomputeCommDerived` | 업무규칙 |
| `tools/legacy-gas/종합견적서/index.html:8165` | `has_` | 인프라·유틸 |
| `tools/legacy-gas/종합견적서/index.html:8166` | `computeCommPanelModelForIndoor_` | 업무규칙 |
| `tools/legacy-gas/종합견적서/index.html:8188` | `swap` | 인프라·유틸 |
| `tools/legacy-gas/종합견적서/index.html:8252` | `syncHomeUIFromState` | 업무규칙 |
| `tools/legacy-gas/종합견적서/index.html:8316` | `syncSingleUIFromState` | 업무규칙 |
| `tools/legacy-gas/종합견적서/index.html:8380` | `syncHomeTotals` | 업무규칙 |
| `tools/legacy-gas/종합견적서/index.html:8395` | `syncSingleTotals` | 업무규칙 |
| `tools/legacy-gas/종합견적서/index.html:8411` | `refreshSelectedBadge` | UI·표시 |
| `tools/legacy-gas/종합견적서/index.html:8496` | `getSetUnitNowById` | UI·표시 |
| `tools/legacy-gas/종합견적서/index.html:8510` | `explodeSendSets_` | 업무규칙 |
| `tools/legacy-gas/종합견적서/index.html:8542` | `openPreview` | UI·표시 |
| `tools/legacy-gas/종합견적서/index.html:8553` | `closePreview` | UI·표시 |
| `tools/legacy-gas/종합견적서/index.html:8562` | `openFinal` | UI·표시 |
| `tools/legacy-gas/종합견적서/index.html:8575` | `closeFinal` | UI·표시 |
| `tools/legacy-gas/종합견적서/index.html:8584` | `ensureKakaoPostcode` | UI·표시 |
| `tools/legacy-gas/종합견적서/index.html:8593` | `mountAddrSheet` | UI·표시 |
| `tools/legacy-gas/종합견적서/index.html:8640` | `fit` | UI·표시 |
| `tools/legacy-gas/종합견적서/index.html:8659` | `isValidTel` | 업무규칙 |
| `tools/legacy-gas/종합견적서/index.html:8663` | `syncAuditFromShip_` | UI·표시 |
| `tools/legacy-gas/종합견적서/index.html:8670` | `toggleSameAddr_` | UI·표시 |
| `tools/legacy-gas/종합견적서/index.html:8698` | `syncBizAddr` | UI·표시 |
| `tools/legacy-gas/종합견적서/index.html:8715` | `checkOrderReady` | 업무규칙 |
| `tools/legacy-gas/종합견적서/index.html:8732` | `aggregateSendRows` | 업무규칙 |
| `tools/legacy-gas/종합견적서/index.html:8773` | `showSector` | UI·표시 |
| `tools/legacy-gas/종합견적서/index.html:8777` | `el` | 인프라·유틸 |
| `tools/legacy-gas/종합견적서/index.html:8793` | `startAuth` | UI·표시 |
| `tools/legacy-gas/종합견적서/index.html:8824` | `showAuthFail` | UI·표시 |
| `tools/legacy-gas/종합견적서/index.html:8832` | `initGate` | UI·표시 |
| `tools/legacy-gas/종합견적서/index.html:8897` | `loadInitialData` | UI·표시 |
| `tools/legacy-gas/종합견적서/index.html:8934` | `initDataLayer` | UI·표시 |
| `tools/legacy-gas/종합견적서/index.html:9007` | `runHeavyInit` | UI·표시 |
| `tools/legacy-gas/종합견적서/index.html:9036` | `showResetProgress` | UI·표시 |
| `tools/legacy-gas/종합견적서/index.html:9053` | `bindResetButtons` | UI·표시 |
| `tools/legacy-gas/종합견적서/index.html:9075` | `buildSendRows` | 업무규칙 |
| `tools/legacy-gas/종합견적서/index.html:9093` | `addP` | UI·표시 |
| `tools/legacy-gas/종합견적서/index.html:9116` | `getActiveFixedDc` | 업무규칙 |
| `tools/legacy-gas/종합견적서/index.html:9136` | `getLiveSpec` | UI·표시 |
| `tools/legacy-gas/종합견적서/index.html:9373` | `extractSpecs` | UI·표시 |
| `tools/legacy-gas/종합견적서/index.html:9376` | `add` | UI·표시 |
| `tools/legacy-gas/종합견적서/index.html:9402` | `join_` | 인프라·유틸 |
| `tools/legacy-gas/종합견적서/index.html:9529` | `openSelectedSpec` | UI·표시 |
| `tools/legacy-gas/종합견적서/index.html:9531` | `addIfTarget` | UI·표시 |
| `tools/legacy-gas/종합견적서/index.html:9651` | `getSpecCanvas` | UI·표시 |
| `tools/legacy-gas/종합견적서/index.html:9679` | `copySelectedSpec` | UI·표시 |
| `tools/legacy-gas/종합견적서/index.html:9695` | `saveSelectedSpec` | UI·표시 |
| `tools/legacy-gas/종합견적서/index.html:9706` | `forceOrderTitle` | UI·표시 |
| `tools/legacy-gas/종합견적서/index.html:9715` | `clearFilterInput` | UI·표시 |
| `tools/legacy-gas/종합견적서/index.html:9725` | `resetHome` | UI·표시 |
| `tools/legacy-gas/종합견적서/index.html:9739` | `el` | 인프라·유틸 |
| `tools/legacy-gas/종합견적서/index.html:9789` | `resetComm` | UI·표시 |
| `tools/legacy-gas/종합견적서/index.html:9818` | `setVal` | 인프라·유틸 |
| `tools/legacy-gas/종합견적서/index.html:9822` | `setChk` | 인프라·유틸 |
| `tools/legacy-gas/종합견적서/index.html:9841` | `el` | 인프라·유틸 |
| `tools/legacy-gas/종합견적서/index.html:9870` | `resetBranch` | UI·표시 |
| `tools/legacy-gas/종합견적서/index.html:9915` | `resetSingle` | UI·표시 |
| `tools/legacy-gas/종합견적서/index.html:9968` | `resetOld` | UI·표시 |
| `tools/legacy-gas/종합견적서/index.html:9999` | `initEvents` | UI·표시 |
| `tools/legacy-gas/종합견적서/index.html:10000` | `el` | 인프라·유틸 |
| `tools/legacy-gas/종합견적서/index.html:10005` | `getKstToday` | 인프라·유틸 |
| `tools/legacy-gas/종합견적서/index.html:10050` | `bindTap` | UI·표시 |
| `tools/legacy-gas/종합견적서/index.html:10115` | `bindOrderHotkeys` | UI·표시 |
| `tools/legacy-gas/종합견적서/index.html:10168` | `updateInlineTotals` | 업무규칙 |
| `tools/legacy-gas/종합견적서/index.html:10186` | `fixFootersForMobile` | 업무규칙 |
| `tools/legacy-gas/종합견적서/index.html:10316` | `setTimeout` | UI·표시 |
| `tools/legacy-gas/종합견적서/index.html:10333` | `fitTableWrap` | UI·표시 |
| `tools/legacy-gas/종합견적서/index.html:10365` | `fitAllTables` | UI·표시 |
| `tools/legacy-gas/종합견적서/index.html:10373` | `call` | 인프라·유틸 |
| `tools/legacy-gas/종합견적서/index.html:10375` | `setText` | 인프라·유틸 |
| `tools/legacy-gas/종합견적서/index.html:10377` | `fmtOrRaw` | 인프라·유틸 |
| `tools/legacy-gas/종합견적서/index.html:10379` | `valuesOf` | 인프라·유틸 |
| `tools/legacy-gas/종합견적서/index.html:10382` | `goOrderInfo` | UI·표시 |
| `tools/legacy-gas/종합견적서/index.html:10396` | `goPreview` | UI·표시 |
| `tools/legacy-gas/종합견적서/index.html:10460` | `goFinal` | UI·표시 |
| `tools/legacy-gas/종합견적서/index.html:10478` | `clearAllActiveClasses` | UI·표시 |
| `tools/legacy-gas/종합견적서/index.html:10487` | `getSelectedTotalCount` | 업무규칙 |
| `tools/legacy-gas/종합견적서/index.html:10501` | `goHome` | UI·표시 |
| `tools/legacy-gas/종합견적서/index.html:10513` | `goSingle` | UI·표시 |
| `tools/legacy-gas/종합견적서/index.html:10525` | `goComm` | UI·표시 |
| `tools/legacy-gas/종합견적서/index.html:10544` | `goOld` | UI·표시 |
| `tools/legacy-gas/종합견적서/index.html:10558` | `copyToClipboardImage` | UI·표시 |
| `tools/legacy-gas/종합견적서/index.html:10597` | `downloadFile` | UI·표시 |
| `tools/legacy-gas/종합견적서/index.html:10663` | `getSingleSetOptionLabel` | 업무규칙 |
| `tools/legacy-gas/종합견적서/index.html:10727` | `getSingleSetOptionLabelLive` | 업무규칙 |
| `tools/legacy-gas/종합견적서/index.html:10738` | `hasPart` | UI·표시 |
| `tools/legacy-gas/종합견적서/index.html:10755` | `getStructuredQuoteData` | 업무규칙 |
| `tools/legacy-gas/종합견적서/index.html:11098` | `getCustoms` | UI·표시 |
| `tools/legacy-gas/종합견적서/index.html:11145` | `getVatLabel` | 업무규칙 |
| `tools/legacy-gas/종합견적서/index.html:11160` | `syncVatCardPv` | 업무규칙 |
| `tools/legacy-gas/종합견적서/index.html:11182` | `syncVatFromOrderInfo` | 업무규칙 |
| `tools/legacy-gas/종합견적서/index.html:11191` | `getQuoteItemBgColor` | UI·표시 |
| `tools/legacy-gas/종합견적서/index.html:11244` | `renderPreviewContent` | UI·표시 |
| `tools/legacy-gas/종합견적서/index.html:11326` | `fmt` | 인프라·유틸 |
| `tools/legacy-gas/종합견적서/index.html:11346` | `parseRatioText` | 업무규칙 |
| `tools/legacy-gas/종합견적서/index.html:11523` | `processPCExport` | UI·표시 |
| `tools/legacy-gas/종합견적서/index.html:11827` | `callback` | UI·표시 |
| `tools/legacy-gas/종합견적서/index.html:11878` | `escapeBOCsvField` | UI·표시 |
| `tools/legacy-gas/종합견적서/index.html:11888` | `processBOCSVExport` | UI·표시 |
| `tools/legacy-gas/종합견적서/index.html:11970` | `renderMainScreenDate` | UI·표시 |
| `tools/legacy-gas/종합견적서/index.html:11992` | `openSaveOptions` | UI·표시 |
| `tools/legacy-gas/종합견적서/index.html:11993` | `closeSaveOptions` | UI·표시 |
| `tools/legacy-gas/종합견적서/index.html:11996` | `renderFinalContent` | UI·표시 |
| `tools/legacy-gas/종합견적서/index.html:12061` | `makeFinalSortable` | UI·표시 |
| `tools/legacy-gas/종합견적서/index.html:12068` | `onStart` | UI·표시 |
| `tools/legacy-gas/종합견적서/index.html:12103` | `onMove` | UI·표시 |
| `tools/legacy-gas/종합견적서/index.html:12140` | `onEnd` | UI·표시 |
| `tools/legacy-gas/종합견적서/index.html:12164` | `moveAt` | UI·표시 |
| `tools/legacy-gas/종합견적서/index.html:12191` | `bindNav` | UI·표시 |
| `tools/legacy-gas/종합견적서/index.html:12217` | `bindViewSwitchButtons` | UI·표시 |
| `tools/legacy-gas/종합견적서/index.html:12282` | `capFromModel` | 업무규칙 |
| `tools/legacy-gas/종합견적서/index.html:12288` | `pickSelectedOutdoors` | 업무규칙 |
| `tools/legacy-gas/종합견적서/index.html:12310` | `pickSelectedIndoorsExpanded` | 업무규칙 |
| `tools/legacy-gas/종합견적서/index.html:12338` | `codeByCumulativeSum` | 업무규칙 |
| `tools/legacy-gas/종합견적서/index.html:12348` | `codeByOutdoorHP` | 업무규칙 |
| `tools/legacy-gas/종합견적서/index.html:12361` | `recomputeBranchCodes` | 업무규칙 |
| `tools/legacy-gas/종합견적서/index.html:12431` | `ensureBranchScaffold` | 업무규칙 |
| `tools/legacy-gas/종합견적서/index.html:12479` | `syncCommQtyFromDOM` | 업무규칙 |
| `tools/legacy-gas/종합견적서/index.html:12488` | `goBranchPage` | UI·표시 |
| `tools/legacy-gas/종합견적서/index.html:12517` | `backToComm` | 업무규칙 |
| `tools/legacy-gas/종합견적서/index.html:12538` | `updateBranchTopButton` | 업무규칙 |
| `tools/legacy-gas/종합견적서/index.html:12547` | `handleBranchToggleClick` | 업무규칙 |
| `tools/legacy-gas/종합견적서/index.html:12553` | `renderBranchTable` | UI·표시 |
| `tools/legacy-gas/종합견적서/index.html:12598` | `makeCapsule` | UI·표시 |
| `tools/legacy-gas/종합견적서/index.html:12610` | `fixBranchDOM` | 업무규칙 |
| `tools/legacy-gas/종합견적서/index.html:12619` | `wireBranchInput` | UI·표시 |
| `tools/legacy-gas/종합견적서/index.html:12637` | `makeBranchColumnSortable` | 업무규칙 |
| `tools/legacy-gas/종합견적서/index.html:12706` | `applyFlip` | UI·표시 |
| `tools/legacy-gas/종합견적서/index.html:12758` | `packOutColumn` | UI·표시 |
| `tools/legacy-gas/종합견적서/index.html:12791` | `updateBranchVisuals` | 업무규칙 |
| `tools/legacy-gas/종합견적서/index.html:12843` | `repackLeft` | UI·표시 |
| `tools/legacy-gas/종합견적서/index.html:12859` | `pushBackToLeft` | UI·표시 |
| `tools/legacy-gas/종합견적서/index.html:12867` | `buildBranchView` | UI·표시 |
| `tools/legacy-gas/종합견적서/index.html:12888` | `packAllOutColumns` | UI·표시 |
| `tools/legacy-gas/종합견적서/index.html:12894` | `updateBranchRatios` | 업무규칙 |
| `tools/legacy-gas/종합견적서/index.html:12947` | `snapshotBranchState` | 업무규칙 |
| `tools/legacy-gas/종합견적서/index.html:12980` | `pushBranchPartsToCommFromBadges` | 업무규칙 |
| `tools/legacy-gas/종합견적서/index.html:13010` | `saveBranchState` | 업무규칙 |
| `tools/legacy-gas/종합견적서/index.html:13018` | `loadBranchState` | 업무규칙 |
| `tools/legacy-gas/종합견적서/index.html:13023` | `applyBranchState` | 업무규칙 |
| `tools/legacy-gas/종합견적서/index.html:13098` | `refreshBranchOpenButton` | UI·표시 |
| `tools/legacy-gas/종합견적서/index.html:13150` | `refreshBranchButton` | UI·표시 |
| `tools/legacy-gas/종합견적서/index.html:13206` | `prepareGateImages` | UI·표시 |
| `tools/legacy-gas/종합견적서/index.html:13226` | `showGateImageModal` | UI·표시 |
| `tools/legacy-gas/종합견적서/index.html:13286` | `updateImgSlide` | UI·표시 |
| `tools/legacy-gas/종합견적서/index.html:13301` | `isIndoorOnly` | 업무규칙 |
| `tools/legacy-gas/종합견적서/index.html:13329` | `getTierBonusRate` | 업무규칙 |
| `tools/legacy-gas/종합견적서/index.html:13338` | `isStandard45` | 업무규칙 |
| `tools/legacy-gas/종합견적서/index.html:13343` | `runWithAdjustedRates` | 업무규칙 |
| `tools/legacy-gas/종합견적서/index.html:13418` | `openPreview` | UI·표시 |
| `tools/legacy-gas/종합견적서/index.html:13424` | `buildSendRows` | 업무규칙 |
| `tools/legacy-gas/종합견적서/index.html:13456` | `toYMD` | 인프라·유틸 |
| `tools/legacy-gas/종합견적서/index.html:13481` | `closeHistory` | UI·표시 |
| `tools/legacy-gas/종합견적서/index.html:13497` | `enforceDateLimit` | UI·표시 |
| `tools/legacy-gas/종합견적서/index.html:13529` | `loadHistory` | UI·표시 |
| `tools/legacy-gas/종합견적서/index.html:13552` | `renderHistoryTable` | UI·표시 |
| `tools/legacy-gas/종합견적서/index.html:13590` | `getSlipInnerContent` | 업무규칙 |
| `tools/legacy-gas/종합견적서/index.html:13601` | `getMMDD` | 인프라·유틸 |
| `tools/legacy-gas/종합견적서/index.html:13718` | `openSlipModal` | UI·표시 |
| `tools/legacy-gas/종합견적서/index.html:13775` | `closeSlipModal` | UI·표시 |
| `tools/legacy-gas/종합견적서/index.html:13781` | `updateSlipScale` | 업무규칙 |
| `tools/legacy-gas/종합견적서/index.html:13798` | `handleSlipCopy` | 업무규칙 |
| `tools/legacy-gas/종합견적서/index.html:13835` | `handleSlipSave` | 업무규칙 |
| `tools/legacy-gas/종합견적서/index.html:13905` | `numberToKorean` | 인프라·유틸 |
| `tools/legacy-gas/종합견적서/index.html:13940` | `getInvoiceInnerContent` | 업무규칙 |
| `tools/legacy-gas/종합견적서/index.html:14121` | `openInvoiceModal` | UI·표시 |
| `tools/legacy-gas/종합견적서/index.html:14166` | `updateScale` | UI·표시 |
| `tools/legacy-gas/종합견적서/index.html:14181` | `handleInvoiceCopy` | 업무규칙 |
| `tools/legacy-gas/종합견적서/index.html:14209` | `handleInvoiceSave` | 업무규칙 |
| `tools/legacy-gas/종합견적서/index.html:14256` | `logAction` | UI·표시 |
| `tools/legacy-gas/종합견적서/index.html:14277` | `relocateUI` | UI·표시 |
| `tools/legacy-gas/종합견적서/index.html:14418` | `updateTopControls` | UI·표시 |
| `tools/legacy-gas/종합견적서/index.html:14439` | `toggleDrawer` | UI·표시 |
| `tools/legacy-gas/종합견적서/index.html:14480` | `handleResize` | UI·표시 |
| `tools/legacy-gas/종합견적서/index.html:14489` | `getCurrentSlipSnapshot` | 업무규칙 |
| `tools/legacy-gas/종합견적서/index.html:14529` | `toggleSlipButton` | UI·표시 |
| `tools/legacy-gas/종합견적서/index.html:14623` | `initValidationEvents` | UI·표시 |
| `tools/legacy-gas/종합견적서/index.html:14651` | `initOrderCard` | UI·표시 |
| `tools/legacy-gas/종합견적서/index.html:14732` | `syncAudit` | UI·표시 |
| `tools/legacy-gas/종합견적서/index.html:14755` | `openAddrSearch` | UI·표시 |
| `tools/legacy-gas/종합견적서/index.html:14772` | `openAddrDock_` | UI·표시 |
| `tools/legacy-gas/종합견적서/index.html:14810` | `onKakaoAddrComplete` | UI·표시 |
| `tools/legacy-gas/종합견적서/index.html:14819` | `applyAddrToTarget` | UI·표시 |
| `tools/legacy-gas/종합견적서/index.html:14836` | `runNaverLocalSearch` | UI·표시 |
| `tools/legacy-gas/종합견적서/index.html:14868` | `scheduleNaverAutoSearch` | UI·표시 |
| `tools/legacy-gas/종합견적서/index.html:14882` | `escapeHtmlAddr` | UI·표시 |
| `tools/legacy-gas/종합견적서/index.html:14889` | `onNaverSearchSuccess` | UI·표시 |
| `tools/legacy-gas/종합견적서/index.html:14929` | `makeAddrRow_` | UI·표시 |
| `tools/legacy-gas/종합견적서/index.html:14947` | `composeAddrWithBuilding_` | UI·표시 |
| `tools/legacy-gas/종합견적서/index.html:14957` | `dedupeAddrWords_` | UI·표시 |
| `tools/legacy-gas/종합견적서/index.html:14970` | `onNaverSearchFail` | UI·표시 |
| `tools/legacy-gas/종합견적서/index.html:14978` | `toggleSameAddr` | UI·표시 |
| `tools/legacy-gas/종합견적서/index.html:15003` | `toggleAuditLater` | UI·표시 |
| `tools/legacy-gas/종합견적서/index.html:15027` | `togglePayDueCb` | UI·표시 |
| `tools/legacy-gas/종합견적서/index.html:15057` | `updateOrderTags` | 업무규칙 |
| `tools/legacy-gas/종합견적서/index.html:15097` | `enforceTagsOnInput` | UI·표시 |
| `tools/legacy-gas/종합견적서/index.html:15144` | `appendMemo` | 업무규칙 |
| `tools/legacy-gas/종합견적서/index.html:15160` | `checkCardValid` | 업무규칙 |
| `tools/legacy-gas/종합견적서/index.html:15165` | `resetCardData` | UI·표시 |
| `tools/legacy-gas/종합견적서/index.html:15173` | `setVal` | 인프라·유틸 |
| `tools/legacy-gas/종합견적서/index.html:15204` | `setChk` | 인프라·유틸 |
| `tools/legacy-gas/종합견적서/index.html:15266` | `decodeBase64` | 인프라·유틸 |
| `tools/legacy-gas/종합견적서/index.html:15276` | `loadOrderData` | 업무규칙 |
| `tools/legacy-gas/종합견적서/index.html:15289` | `submitOrderCard` | 업무규칙 |
| `tools/legacy-gas/종합견적서/index.html:15294` | `getEl` | 인프라·유틸 |
| `tools/legacy-gas/종합견적서/index.html:15295` | `getVal` | 인프라·유틸 |
| `tools/legacy-gas/종합견적서/index.html:15326` | `getInputVal` | 인프라·유틸 |
| `tools/legacy-gas/종합견적서/index.html:15348` | `fmtPct` | UI·표시 |
| `tools/legacy-gas/종합견적서/index.html:15349` | `fmtMoney` | UI·표시 |
| `tools/legacy-gas/종합견적서/index.html:15368` | `getCanonicalSection` | 업무규칙 |
| `tools/legacy-gas/종합견적서/index.html:15655` | `initCustomerSearch` | UI·표시 |
| `tools/legacy-gas/종합견적서/index.html:15761` | `addActive` | UI·표시 |
| `tools/legacy-gas/종합견적서/index.html:15770` | `removeActive` | UI·표시 |
| `tools/legacy-gas/종합견적서/index.html:15774` | `closeAllLists` | UI·표시 |
| `tools/legacy-gas/종합견적서/index.html:15788` | `syncCustomers` | UI·표시 |
| `tools/legacy-gas/종합견적서/index.html:15840` | `syncRepTel` | UI·표시 |
| `tools/legacy-gas/종합견적서/index.html:15860` | `fillCustomer` | UI·표시 |
| `tools/legacy-gas/종합견적서/index.html:15874` | `initExcelUX` | UI·표시 |
| `tools/legacy-gas/종합견적서/index.html:15943` | `moveTableVerticalVisual` | UI·표시 |
| `tools/legacy-gas/종합견적서/index.html:15983` | `moveTableHorizontal` | UI·표시 |
| `tools/legacy-gas/종합견적서/index.html:15999` | `moveSection` | UI·표시 |
| `tools/legacy-gas/종합견적서/index.html:16013` | `initInventoryModal` | UI·표시 |
| `tools/legacy-gas/종합견적서/index.html:16025` | `openInventoryCheck` | UI·표시 |
| `tools/legacy-gas/종합견적서/index.html:16051` | `doSearch` | UI·표시 |
| `tools/legacy-gas/종합견적서/index.html:16101` | `closeModal` | UI·표시 |
| `tools/legacy-gas/종합견적서/index.html:16115` | `toYMD` | 인프라·유틸 |
| `tools/legacy-gas/종합견적서/index.html:16123` | `enforceDateLimit` | UI·표시 |
| `tools/legacy-gas/종합견적서/index.html:16172` | `applyCardFeeLogic` | 업무규칙 |
| `tools/legacy-gas/종합견적서/index.html:16205` | `applyCutoffLogic` | 업무규칙 |
| `tools/legacy-gas/종합견적서/index.html:16240` | `takeSnapshot` | UI·표시 |
| `tools/legacy-gas/종합견적서/index.html:16428` | `applySnapshot` | UI·표시 |
| `tools/legacy-gas/종합견적서/index.html:16451` | `res` | 인프라·유틸 |
| `tools/legacy-gas/종합견적서/index.html:16452` | `resSet` | 인프라·유틸 |
| `tools/legacy-gas/종합견적서/index.html:16564` | `res` | 인프라·유틸 |
| `tools/legacy-gas/종합견적서/index.html:16956` | `hideAllPages` | UI·표시 |
| `tools/legacy-gas/종합견적서/index.html:16965` | `goSnapshotPage` | UI·표시 |
| `tools/legacy-gas/종합견적서/index.html:16996` | `loadSnapshotHistory` | UI·표시 |
| `tools/legacy-gas/종합견적서/index.html:17032` | `loadSnapshotByCustomer` | UI·표시 |
| `tools/legacy-gas/종합견적서/index.html:17057` | `handleSaveSnapshot` | UI·표시 |
| `tools/legacy-gas/종합견적서/index.html:17335` | `showCustNameModal` | UI·표시 |
| `tools/legacy-gas/종합견적서/index.html:17417` | `closeSnapshotPage` | UI·표시 |
| `tools/legacy-gas/종합견적서/index.html:17426` | `renderSnapshotTable` | UI·표시 |
| `tools/legacy-gas/종합견적서/index.html:17457` | `restoreSnapshot` | UI·표시 |
| `tools/legacy-gas/종합견적서/index.html:17464` | `showSnapshotPreview` | UI·표시 |
| `tools/legacy-gas/종합견적서/index.html:17518` | `calcRecommendOdu` | 업무규칙 |
| `tools/legacy-gas/종합견적서/index.html:17534` | `initKeyboardFix` | UI·표시 |
| `tools/legacy-gas/종합견적서/index.html:17590` | `forceOrderTitle` | UI·표시 |
| `tools/legacy-gas/종합견적서/index.html:17617` | `updateCellSelectionSum` | UI·표시 |
| `tools/legacy-gas/종합견적서/index.html:17652` | `clearSelection` | UI·표시 |
| `tools/legacy-gas/종합견적서/index.html:17660` | `getTrueMatrix` | 인프라·유틸 |
| `tools/legacy-gas/종합견적서/index.html:17691` | `getCellPos` | 인프라·유틸 |
| `tools/legacy-gas/종합견적서/index.html:17711` | `selectCells` | UI·표시 |
| `tools/legacy-gas/종합견적서/index.html:17741` | `getCellValue` | 인프라·유틸 |
| `tools/legacy-gas/종합견적서/index.html:17751` | `setCellValue` | 인프라·유틸 |
| `tools/legacy-gas/종합견적서/index.html:18006` | `setupCustomRows` | UI·표시 |
| `tools/legacy-gas/종합견적서/index.html:18061` | `addCustomRow` | 업무규칙 |
| `tools/legacy-gas/종합견적서/index.html:18166` | `removeCustomRow` | 업무규칙 |
| `tools/legacy-gas/종합견적서/index.html:18180` | `updateCustomSubtotal` | 업무규칙 |
| `tools/legacy-gas/종합견적서/index.html:18230` | `updateSpan` | 인프라·유틸 |
| `tools/legacy-gas/종합견적서/index.html:18450` | `adjustRowSpans` | UI·표시 |
| `tools/legacy-gas/종합견적서/index.html:18477` | `initVisibilityToggles` | UI·표시 |
| `tools/legacy-gas/종합견적서/index.html:18629` | `makeToggle` | UI·표시 |
| `tools/legacy-gas/종합견적서/index.html:18738` | `syncSetPriceFromParts` | 업무규칙 |
| `tools/legacy-gas/종합견적서/index.html:18889` | `autoShrinkTableColumns` | UI·표시 |
| `tools/legacy-gas/종합견적서/index.html:18922` | `toggleTheme` | UI·표시 |
| `tools/legacy-gas/종합견적서/index.html:18947` | `getElPath` | UI·표시 |
| `tools/legacy-gas/종합견적서/index.html:18988` | `isMan` | UI·표시 |
| `tools/legacy-gas/종합견적서/index.html:18996` | `getElVal` | UI·표시 |
| `tools/legacy-gas/종합견적서/index.html:19004` | `setElVal` | UI·표시 |
| `tools/legacy-gas/종합견적서/index.html:19029` | `saveState` | UI·표시 |
| `tools/legacy-gas/종합견적서/index.html:19053` | `applyState` | UI·표시 |
| `tools/legacy-gas/종합견적서/index.html:19140` | `initAutoLogout` | UI·표시 |
| `tools/legacy-gas/종합견적서/index.html:19145` | `updateTimerDisplay` | UI·표시 |
| `tools/legacy-gas/종합견적서/index.html:19168` | `resetTimer` | UI·표시 |
## 10. 최종 기계 검증

고정 inventory에서 다시 생성한 `(파일, 줄, 함수명)` key와 이 보고서의 원장을 집합 대조했다.

| 검증 항목 | 결과 |
|---|---:|
| 고정 inventory 함수 | 993 |
| 전체 분류 원장 행 / unique key | 993 / 993 |
| inventory에는 있으나 원장에 없음 | 0 |
| 원장에는 있으나 inventory에 없음 | 0 |
| 업무규칙 inventory / 상세 레지스터 / unique key | 395 / 395 / 395 |
| 업무규칙 레지스터 누락 / 초과 | 0 / 0 |
| 원장 업무규칙 / UI·표시 / 인프라·유틸 | 395 / 364 / 234 |
| 도구 출력 잘림 잔재 | 0 |

검증은 보고서의 섹션 8·9 범위를 분리한 뒤 Markdown 행을 파싱하여 수행했다. 따라서 설명문에 우연히 등장한 함수명이나 숫자는 집계에 포함하지 않았다.
