# GAS 전수조사 v4 — 유실 규칙 확정

> 조사일: 2026-08-11  
> 역할: CODEX SOL 5.6 — 레거시 유실 확정자  
> 범위: 읽기 전용 조사와 본 보고서 작성만 수행했다. 코드·스키마·git 상태·`samhan-*` 컨테이너·공유 DB는 변경하지 않았다.

## 0. 결론

### 0.1 판정보류 49 해소

| v4 판정 | 수 | 산식 |
|---|---:|---|
| 유실 | 1 | 교육 상태 자동 전환 1 |
| 대체 | 19 | 입출고 분석 4 + 세트 가격 배분 1 + Ecount/배치 7 + 범용명 7 |
| 불필요 | 29 | OCR/GAS-direct 및 표시 helper 23 + 범용 helper 6 |
| 남은 보류 | 0 | 없음 |
| **합계** | **49** | **1+19+29+0=49** |

### 0.2 v3 전체 257 재집계

v3 유실 22를 다시 검사해 `유실 8 + 대체 6 + 불필요 8`로 고쳤다. 여기에 보류 49의 해소 결과를 반영했다.

| 판정 | v3 | v4 증감 | v4 |
|---|---:|---:|---:|
| 유실 | 22 | -14 + 1 | **9** |
| 대체 | 109 | +6 + 19 | **134** |
| 불필요 | 77 | +8 + 29 | **114** |
| 보류 | 49 | -49 | **0** |
| **합계** | **257** |  | **257** |

## 1. 조사 절차와 판정 기준

1. `docs/dev-reports/2026-08-11-gasv3-remainder.md`와 `2026-08-11-gasv2-CRITIC.md`를 전부 읽고 v3의 이름 원장을 복원했다.
2. 원본 함수는 보고서 요약이 아니라 `tools/legacy-gas/**`의 실제 정의행과 본문을 다시 읽었다.
3. 후보마다 read-only `git ls-files`로 파일을, `git grep`/`rg`로 같은 의미의 production 코드를 확인했다. 조사 범위는 `clients services shared`이고 `node_modules/build/out/dist/test/tests/__tests__`는 제외했다.
4. `gh issue list --state all --limit 400 --json number,title,state,body`로 전체 205개 이슈를 받은 뒤 제목과 본문을 검색했다. 단순히 조사 필요성을 기록한 #977은 구현 소유 이슈로 세지 않았고, 실제 기능의 완전계승·후속 결함을 소유한 #1011/#1012/#1013/#1098/#1072만 대체 근거로 사용했다.
5. 실 DB는 `127.0.0.1:5432`에 JDBC로 직접 연결했다. 모든 연결에 `Connection.setReadOnly(true)`와 `BEGIN READ ONLY`를 적용하고 조회 뒤 `ROLLBACK`했다. 컨테이너 명령은 실행하지 않았다.
6. DB 적용 행이 0이면 결함 부재로 해석하지 않고 **판정 불가**로 썼다.

## 2. 판정보류 49 전건 해소

### 2.1 유실 1

| 이름 | v4 판정 | 근거 |
|---|---|---|
| `checkAndUpdateNotion` | 유실 | 등록마감일 경과→`신청불가`, 문자발송 파일 존재→`발송완료`라는 상태 전환 규칙이다. production 파일·동일 의미 코드·구현 소유 이슈가 모두 0이다. 상세는 §4.9. |

### 2.2 대체 19

| # | 이름 | 대응 좌표 |
|---:|---|---|
| 1 | `analyzeFiltered` | #1012 CLOSED; `clients/desktop/src/renderer/routes/warehouse/inoutAnalysisModel.ts:86-155`의 `deriveLegacyAnalysis`가 전년/당년, 예측, Top/Bottom 3, 추천을 계산한다. |
| 2 | `getChartData` | #1012 CLOSED; `clients/desktop/src/renderer/api/inventory.ts:336-339`의 `listInOutAnalysis`와 `InOutAnalysisPage.tsx:32-35`. |
| 3 | `processModelData` | #1012 CLOSED; `inoutAnalysisModel.ts:159-186`의 분류 chip과 filter, `services/slip-service/.../InOutAnalysisService.java:109-115`의 품목별 금액·이익 계산. |
| 4 | `updateChart` | #1012 CLOSED; `InOutAnalysisPage.tsx:62-77`이 추이·수요예측·Top/Bottom·추천을 렌더링한다. |
| 5 | `distributeSetPrice_` | #1093 CLOSED/#1143 OPEN; `services/product-service/.../BundleExpander.java:326-369`에 6:4/4:6 및 천원 배분이 있고 데이터 기반 비율 전환은 #1143이 소유한다. |
| 6 | `confirmEcount` | #1011 CLOSED; 원본 Ecount 전송 대신 `SlipService.java:246-329`의 INBOUND 입고전표 생성 계약으로 대체됐다. |
| 7 | `proceedToDateModal` | #1011 CLOSED; 같은 INBOUND 전표의 `slipDate` 입력·생성 경로로 대체됐다. |
| 8 | `processData` | #1011 CLOSED; `DpsExcelParser`→`DpsCompareService.java:76-113`→INBOUND 전표 흐름이 소유한다. |
| 9 | `processNextBatch` | #1016 CLOSED/#1098 OPEN; `services/notification-service/.../AligoAddressBookSyncService.java:41,72-107`의 50건 chunk와 누적 결과로 대체됐다. |
| 10 | `runMatching` | #1011 CLOSED; `DpsCompareService.java:95-113,168-296`의 SLIP/ITEM 매칭과 mismatch 분류가 대체한다. |
| 11 | `sendOrderToEcount_` | Ecount 직접 판매전표 대신 `PartnerOrderConfirmController.java:40-60` 및 `SlipPublishService.java:78-80,125-199`의 OUTBOUND 발행·멱등 계약으로 대체됐다. |
| 12 | `sendToEcountAPI` | #1011 CLOSED; Ecount 구매전표 직접 호출 대신 INBOUND 입고전표 발행으로 대체됐다. |
| 13 | `checkDuplicates` | #1013 CLOSED; 원본의 얇은 `checkDuplicatesFor(activeSourceBody())` wrapper이며 현 배차문자 경로는 `DispatchMessageGroupComposer`와 배차 preview가 소유한다. |
| 14 | `extractNum` | #1013 CLOSED; 괄호 전표번호 추출은 배차문자 완전계승 이슈와 현 배차 preview/메시지 조합 경로에 귀속된다. |
| 15 | `fmtMinusUnit` | #1008 CLOSED; 일마감 DC 계약은 `DailyClosingService`와 `DailyClosingPage`가 소유한다. 원본 함수 자체는 표시 helper다. |
| 16 | `isExcludedByName` | #1001/#1014 CLOSED; `PartnerLedgerReadModelService`, `StatementBatchService`, `blocked_partners`/batch exclusion 계약으로 대체됐다. |
| 17 | `isExcludedByWord` | #1001/#1014 CLOSED; 원장·거래명세서의 제외 판단은 위 동일 계약이 소유한다. |
| 18 | `recalcRow` | #1008 CLOSED; 일마감 재계산은 `DailyClosingService`와 VAT 권위 금액 필드(`unit_price_with_vat/supply_amount/vat_amount`)로 대체됐다. |
| 19 | `boolKey` | #1013 CLOSED; 단톡방/인수자/기사 순서는 배차문자 완전계승과 현 메시지 group composer에 귀속된다. |

### 2.3 불필요 29

#### OCR/GAS-direct 또는 표시 helper 23

```text
_coerceQtyToken_, aliasModelIfNeeded_, buildItemsInPreviewOrder_, buildOrderQtyMap_,
capQtyToOrder_, detectOptionsFromRawName_, extractItemsFromTable_, fixLargeQty_, fmtMoney,
getZeroOKeyCandidates_, groupRank_, isBolt, isLikelyCode_, mergeKeepLastScoped_,
mergeSrcItemsByModel_, orderIndex_, parseShortDiscount_, pickQtyToken_,
sortFinalItemsForSend_, sortItemsForSend_, squashConsecutiveSpecs_,
squashPreviewSets_, tryMatch
```

- `services/auth-service/src/main/resources/db/migration/V76__remove_ocr_page_permissions.sql:2-6`은 **개발책임자 지시로 영수증 OCR과 발주서 업로드 OCR을 제거**했다고 명시한다.
- `docs/superpowers/plans/2026-06-28-remove-ocr-menus.md:3-8`은 OCR 전수 삭제 후 **GAS 직접 주문서 전송 레거시 패턴으로 대체**한다고 명시한다.
- `clients/desktop/playwright/menu-relocate/menu-ia-contract.spec.ts:268-272`는 OCR 메뉴 부재를 회귀 가드로 고정한다.
- 따라서 vendor OCR의 토큰 보정·표 파싱·수량 추정·정렬·미리보기 중복표시 helper를 Samhan Public production에 다시 넣는 것은 확정된 삭제 결정을 되돌리는 일이다. `distributeSetPrice_`만 OCR 수단과 독립된 금액 규칙이라 §2.2의 대체로 분리했다.
- `parseShortDiscount_`는 `tools/legacy-gas/거래처 업데이트 프로그램/Code.js:936-958`의 Notion 표시 문자열 formatter일 뿐 할인율 산식이 아니다.

#### 범용 helper 6

| 이름 | 불필요 근거 |
|---|---|
| `chk` | `extract-notion-dc-csv.js`/브라우저의 checkbox 생성·필드 읽기 helper다. |
| `norm` | 공백 제거·대문자화 같은 로컬 정규화 helper로 독립 업무결정을 하지 않는다. |
| `pct` | CSV 값에 100을 곱해 문자열로 쓰는 formatter다. |
| `resetCounters` | 가배차 분류 실행 전 메모리 counter를 0으로 만드는 초기화 helper다. |
| `sel` | select/필드 읽기 helper다. |
| `won` | 정수를 문자열로 바꾸는 CSV formatter다. |

## 3. v3 유실 22 재검증

| v4 판정 | v3 함수 | 근거 |
|---|---|---|
| **유실 8** | `setPay`, `setWht`, `setExp`, `getExpenseRate`, `xround`, `getValues`, `recalc`, `renderDoc` | D-G1로 영업수수료 정산 도메인 신설이 확정됐지만 production 구현·소유 이슈가 없다. #977은 “대응 기능 미확인” 조사 이슈일 뿐 구현 acceptance criterion이 아니다. |
| **대체 1** | `parseAccountLedger` | #1072 OPEN이 계정과목 정본과 기존 라인 정규화를 소유한다. D-G3에 따라 9199/9549/1089는 영향액 실측 후 #1072에서 판단한다. |
| **대체 2** | `checkDuplicatesFor`, `getDeliveryInitialState` | #1013 CLOSED가 배차안내문자 완전계승을 명시하고 `DispatchMessageGroupComposer`/배차 preview 구현이 있다. 의미 결함이면 #1013 회귀이지 신규 유실 이슈가 아니다. |
| **대체 3** | `executePromo`, `executeGolf`, `initDayMappingUI` | #1016 CLOSED와 #1098 OPEN이 알리고 실호출·지역/요일 segment·중복·이력을 소유한다. |
| **불필요 8** | `decideWarehouseFromItems_`, `detectWarehouseFromItems_`, `overrideSpecialUnitPrice_`, `parseKoreanTimeWindow_`, `parseOrderFromText_`, `extractItemsVerticalList_`, `extractItemsLooseRow_`, `processMemoAndCustomer_` | 위 OCR 전수 삭제/GAS-direct 결정에 속한다. 추가로 “창고는 사용자가 견적에서 고른다”는 확정 결정 때문에 vendor keyword 자동 창고 선택을 production 규칙으로 복원하면 안 된다. |

검산: `22 = 유실 8 + 대체 6 + 불필요 8`.

## 4. 이슈 작성용 유실 9 — 금액 영향 우선

### 4.0 공통 검색·DB 증거

#### production/issue 검색

```text
git ls-files clients services shared | rg -i
  'commission|settlement|sales.?fee|education|training'
=> 0건

git grep -n -I -E
  '영업수수료 정산|제경비율|선지급 수수료|sales commission settlement|
   CommissionSettlement|commission settlement'
  -- clients services shared
=> 0건

git grep -n -I -E
  '등록마감일|신청불가|안내문자발송|문자발송내역|교육안내 자동상태변경'
  -- clients services shared
=> 0건

함수 정의 검색:
  function|const|let|var
  (setPay|setWht|setExp|getExpenseRate|xround|getValues|recalc|renderDoc|
   checkAndUpdateNotion)
  범위 clients services shared, build/test 계열 제외
=> 9개 전부 0건

gh issue list --state all --limit 400
검색어: 영업수수료|판매수수료|제경비|선지급 수수료|교육안내|등록마감일|
        신청불가|안내문자발송
=> 구현 소유 이슈 0건
   #977 CLOSED 1건은 영업수수료의 "제품 대응 미확인"을 기록한 조사 이슈라
   구현 acceptance criterion 또는 대체 구현 좌표가 아니다.
```

#### 실 DB read-only 조회

```text
대상 DB 14개:
accounting_db, arologis_db, auth_db, dashboard_db, dc_config_db,
groupware_db, inventory_db, notification_db, partner_auth_db, partner_db,
partner_order_db, product_db, slip_db, user_db

information_schema.tables
  table_name ~* '(commission|settlement|education|training)'
=> 0개

accounting_db.staging.ecount_expense_voucher_raw
  description ILIKE 영업수수료/판매수수료/제경비/선지급수수료/
                    카드수수료/원천징수
=> 활성 0행

slip_db.slips
  is_deleted=false AND slip_type='OUTBOUND'
=> 403행

slip_db.slip_lines
  활성 OUTBOUND 전표의 활성 line
=> 774행

accounting_db.sales_accounting_slips
  is_deleted=false
=> 0행
```

403개 OUTBOUND 전표는 잠재 원천일 뿐, 어느 전표가 영업수수료 정산 대상인지 연결하는 settlement 행·참조키·수수료 상태가 없다. 따라서 아래 영업수수료 8건의 **직접 적용행은 저장된 settlement 기준 0건이며 판정 불가**다. 0건을 결함 없음으로 보지 않는다. 정확한 적용 건수는 D-G1의 settlement domain이 생긴 뒤 전표/지출결의 참조 연결로 산출할 수 있다.

### 4.1 `setPay` — 카드결제 수수료 적용 상태

- **무엇을 하는 규칙인가**: 결제방식이 `카드결제`일 때만 총 결제금액의 3% 카드수수료를 정산 산식에 포함하도록 상태를 정한다.
- **레거시 원문**: `tools/legacy-gas/영업수수료 계산/Index.html:262-270`

  ```javascript
  function setPay(method) {
    payMethod = method;
    var isCard = method === '카드결제';
    document.getElementById('paySlider').style.transform = isCard ? 'translateX(0)' : 'translateX(100%)';
    var items = document.querySelectorAll('#payToggle .toggle-item');
    items[0].classList.toggle('active', isCard);
    items[1].classList.toggle('active', !isCard);
    document.getElementById('row_card').style.display = isCard ? 'flex' : 'none';
    recalc();
  }
  ```

- **왜 유실인가**: exact 정의 `setPay`와 의미 검색 `영업수수료 정산|카드 수수료 3%|CommissionSettlement`을 `clients services shared`에서 찾았으나 0건이다. issue 검색도 구현 소유 0건이다.
- **금액에 닿는가**: **예**. `getValues`가 카드일 때 `-total*0.03`을 계산해 영업수수료와 최종 지급액을 바꾼다.
- **발화 조건**: settlement 직접 적용행 **0건 — 판정 불가**. 잠재 원천 OUTBOUND 403전표/774라인은 있으나 카드결제 정산 참조행이 없다.
- **크기 추정**: **S**. D-G1 settlement domain 안의 결제수단 enum·검증·계산 분기 1개 기준.

### 4.2 `setWht` — 원천징수 3.3% 적용 상태

- **무엇을 하는 규칙인가**: 원천징수 적용 여부를 정하고 적용 시 영업수수료의 3.3%를 공제한다.
- **레거시 원문**: `tools/legacy-gas/영업수수료 계산/Index.html:274-281`

  ```javascript
  function setWht(v) {
    whtApply = v === '적용';
    document.getElementById('whtSlider').style.transform = whtApply ? 'translateX(0)' : 'translateX(100%)';
    var items = document.querySelectorAll('#whtToggle .toggle-item');
    items[0].classList.toggle('active', whtApply);
    items[1].classList.toggle('active', !whtApply);
    document.getElementById('row_wht').style.display = whtApply ? 'flex' : 'none';
    recalc();
  }
  ```

- **왜 유실인가**: exact 정의 `setWht`와 의미 검색 `원천징수 3.3|영업수수료 정산|CommissionSettlement` 결과가 production 0건이고, 구현 소유 issue도 0건이다.
- **금액에 닿는가**: **예**. 적용 여부에 따라 `sales * -0.033` 공제가 생긴다.
- **발화 조건**: settlement 직접 적용행 **0건 — 판정 불가**. 원천징수 적용 상태를 저장하는 열/행이 없다.
- **크기 추정**: **S**.

### 4.3 `setExp` — 제경비 8%/수기율 모드

- **무엇을 하는 규칙인가**: 제경비율을 기본 8% 또는 제한 없는 수기율 모드 중 하나로 정한다.
- **레거시 원문**: `tools/legacy-gas/영업수수료 계산/Index.html:285-293`

  ```javascript
  function setExp(mode) {
    expMode = mode === 'manual' ? 'manual' : '8';
    var isEight = expMode === '8';
    document.getElementById('expSlider').style.transform = isEight ? 'translateX(0)' : 'translateX(100%)';
    var items = document.querySelectorAll('#expToggle .toggle-item');
    items[0].classList.toggle('active', isEight);
    items[1].classList.toggle('active', !isEight);
    document.getElementById('row_exp_manual').style.display = isEight ? 'none' : 'flex';
    recalc();
  }
  ```

- **왜 유실인가**: exact 정의 `setExp`와 검색어 `제경비율|제경비 8%|영업수수료 정산`의 production 결과가 0건이며 구현 소유 issue가 없다.
- **금액에 닿는가**: **예**. 선택 모드가 영업수수료에서 공제할 제경비 금액을 바꾼다.
- **발화 조건**: settlement 직접 적용행 **0건 — 판정 불가**. 수기율/8% 모드 저장행이 없다.
- **크기 추정**: **S**.

### 4.4 `getExpenseRate` — 제경비율 값 선택

- **무엇을 하는 규칙인가**: 수기 모드에서는 입력 백분율을 그대로 소수율로 바꾸고, 아니면 8%를 반환한다.
- **레거시 원문**: `tools/legacy-gas/영업수수료 계산/Index.html:297-301`

  ```javascript
  function getExpenseRate() {
    if (expMode === 'manual') {
      return parseNum(document.getElementById('f_exp_manual').value) / 100;
    }
    return 0.08;
  }
  ```

- **왜 유실인가**: exact 정의 `getExpenseRate`와 검색어 `제경비율|manual expense rate|0.08 commission`을 production에서 찾았으나 0건이고, 구현 소유 issue도 없다.
- **금액에 닿는가**: **예**. `sales * -expenseRate`의 비율을 직접 결정한다. 개발책임자의 “수기율 제한 없음” 결정도 이 규칙에 귀속된다.
- **발화 조건**: settlement 직접 적용행 **0건 — 판정 불가**. 제경비율 값이 저장되는 정산행이 없다.
- **크기 추정**: **S**.

### 4.5 `xround` — 음수 대칭 원단위 반올림

- **무엇을 하는 규칙인가**: 양수와 음수의 절대값을 같은 방식으로 원단위 반올림한 뒤 원래 부호를 복원한다.
- **레거시 원문**: `tools/legacy-gas/영업수수료 계산/Index.html:318-320`

  ```javascript
  function xround(n) {
    return (n < 0 ? -1 : 1) * Math.round(Math.abs(n));
  }
  ```

- **왜 유실인가**: exact 정의 `xround`와 영업수수료 의미 범위의 검색어 `음수 대칭 반올림|영업수수료 정산|CommissionSettlement` 결과가 production 0건이다. 다른 도메인의 일반 `HALF_UP`은 이 정산 계약의 대체가 아니다.
- **금액에 닿는가**: **예**. 카드·제경비·원천·설치·공급가의 원단위 결과를 바꾼다.
- **발화 조건**: settlement 직접 적용행 **0건 — 판정 불가**. 반올림할 정산 금액행이 없다.
- **크기 추정**: **S**.

### 4.6 `getValues` — 영업수수료 전체 정산 산식

- **무엇을 하는 규칙인가**: 총액·장비대·카드·제경비·원천·설치·안전관리비·선지급을 결합해 소계, 차인지급액, 매입계산서 공급가/VAT를 계산한다.
- **레거시 원문**: `tools/legacy-gas/영업수수료 계산/Index.html:323-340`

  ```javascript
  function getValues() {
    var total = parseNum(document.getElementById('f_total').value);
    var equip = parseNum(document.getElementById('f_equip').value);
    var prepaid = parseNum(document.getElementById('f_prepaid').value);
    var install = parseNum(document.getElementById('f_install').value);
    var safetyInput = parseNum(document.getElementById('f_safety').value);

    expenseRate = getExpenseRate();
    var card = payMethod === '카드결제' ? xround(-total * 0.03) : 0;
    var sales = total - equip + card;
    var expense = xround(sales * -expenseRate);
    var wht = whtApply ? xround(sales * -0.033) : 0;
    var dogup = xround(install * -0.08);
    var safety = -safetyInput;
    var subtotal = sales + expense + wht + dogup + safety;
    var payout = subtotal - prepaid;
    var supply = xround(subtotal / 1.1);
    var vat = subtotal - supply;
  ```

- **왜 유실인가**: exact 정의 `getValues`는 0건(`Range.getValues` 동명이의 호출 제외)이고, `영업수수료 정산|제경비율|선지급 수수료|CommissionSettlement` 의미 검색도 production 0건이다. #1144의 일반 회계전표/세금계산서 연결은 이 산식을 구현하지 않는다.
- **금액에 닿는가**: **예**. D-G1 정산의 금액 정본 자체다.
- **발화 조건**: settlement 직접 적용행 **0건 — 판정 불가**. 잠재 OUTBOUND 403전표가 있지만 장비대·설치비·안전관리비·선지급 입력과의 연결이 없다.
- **크기 추정**: **M**. 산식·검증·versioned 계약·금액 회귀 fixture 기준이며, D-G1 전체 domain 구축은 별도 L 범위다.

### 4.7 `recalc` — 정산 결과 동기화

- **무엇을 하는 규칙인가**: 입력이 바뀔 때 전체 산식을 다시 실행해 카드·영업수수료·공제·지급액·공급가·VAT와 문서 미리보기를 하나의 결과로 동기화한다.
- **레거시 원문**: `tools/legacy-gas/영업수수료 계산/Index.html:359-372`

  ```javascript
  function recalc() {
    var v = getValues();
    document.getElementById('c_card').value = fmt(v.card);
    document.getElementById('c_sales').value = fmt(v.sales);
    document.getElementById('c_expense').value = fmt(v.expense);
    document.getElementById('c_wht').value = fmt(v.wht);
    document.getElementById('c_dogup').value = fmt(v.dogup);
    document.getElementById('c_safety').value = fmt(v.safety);
    document.getElementById('c_subtotal').value = fmt(v.subtotal);
    document.getElementById('c_payout').value = fmt(v.payout);
    document.getElementById('c_supply').value = fmt(v.supply);
    document.getElementById('c_vat').value = fmt(v.vat);
    document.getElementById('c_invtotal').value = fmt(v.subtotal);
    renderDoc(v);
  }
  ```

- **왜 유실인가**: exact 정의 `recalc` 중 영업수수료 계보와 `정산 결과|차인 지급액|매입계산서 소계` 의미 검색이 production 0건이고 소유 issue가 없다.
- **금액에 닿는가**: **예**. 모든 금액 필드와 문서가 같은 계산 snapshot을 쓰도록 강제한다.
- **발화 조건**: settlement 직접 적용행 **0건 — 판정 불가**. 갱신할 정산 aggregate가 없다.
- **크기 추정**: **M**. 계산 service, 저장 snapshot, 화면/문서 동일 결과 검증까지 포함.

### 4.8 `renderDoc` — 지출품의서·매입계산서 정산 문서

- **무엇을 하는 규칙인가**: 차인지급액과 소계 기준 공급가/VAT를 포함한 지출품의서 및 매입계산서용 정산 문서를 만든다.
- **레거시 원문**: `tools/legacy-gas/영업수수료 계산/Index.html:413-417`

  ```javascript
  '<tr><td class="lbl">선지급 수수료 공제</td><td class="' + negCls(-v.prepaid) + '" colspan="3">' + fmt(-v.prepaid) + '</td></tr>' +
  '<tr class="final"><td class="lbl">차인 지급액 (VAT포함)</td><td class="num" colspan="3">' + fmt(v.payout) + '</td></tr>' +
  '<tr><td class="sec" colspan="4">매입계산서 (소계 기준)</td></tr>' +
  '<tr><td class="lbl">공급가</td><td class="num">' + fmt(v.supply) + '</td><td class="lbl">부가세</td><td class="num">' + fmt(v.vat) + '</td></tr>' +
  '<tr><td class="lbl">특이사항</td><td colspan="3" style="white-space:pre-wrap;text-align:left;">' + esc(v.note) + '</td></tr>' +
  ```

- **왜 유실인가**: exact 정의 `renderDoc`와 검색어 `지출품의서 영업수수료|매입계산서 소계 기준|차인 지급액|선지급 수수료`가 production 0건이다. D-G1이 요구한 문서번호 `YYYY/MM/DD-N`, `ApprovalReferenceDocType` 7번째 값, 지출결의서 참조 첨부·연결 버튼도 아직 구현/소유 issue가 없다.
- **금액에 닿는가**: **예**. 지급액·공급가·VAT를 회계 문서에 고정하며 잘못되면 실제 지급/세금계산서 금액이 달라진다.
- **발화 조건**: settlement 직접 적용행 **0건 — 판정 불가**. `sales_accounting_slips` 활성행도 0이고 정산→지출결의 참조가 없다.
- **크기 추정**: **L**. D-G1의 신규 번호채번·approval enum 확장·참조 첨부·연결 UI·감사 snapshot을 함께 구현해야 한다.

### 4.9 `checkAndUpdateNotion` — 교육 신청/문자 상태 자동 전환

- **무엇을 하는 규칙인가**: 교육 등록마감일이 지나면 가능여부를 `신청불가`로 바꾸고 문자발송내역 파일이 생기면 안내문자발송을 `발송완료`로 바꾼다.
- **레거시 원문 A**: `tools/legacy-gas/교육안내 자동상태변경/Code.js:31-45`

  ```javascript
  // 1. 등록마감일 업데이트 처리
  if (properties && properties["등록마감일"] &&
      properties["등록마감일"].date && properties["등록마감일"].date.start) {
    var deadlineStr = properties["등록마감일"].date.start;
    var deadline = new Date(deadlineStr);

    // 마감일이 지난 경우
    if (now.getTime() > deadline.getTime()) {
      // "가능여부"가 아직 "신청불가"가 아니라면 업데이트 요청
      if (!(properties["가능여부"] && properties["가능여부"].select && properties["가능여부"].select.name === "신청불가")) {
        var updateUrl = "https://api.notion.com/v1/pages/" + pageId;
        var updatePayload = {
          properties: {
            "가능여부": {
              select: { name: "신청불가" }
  ```

- **레거시 원문 B**: `tools/legacy-gas/교육안내 자동상태변경/Code.js:67-76`

  ```javascript
  // 2. 문자발송내역 업데이트 처리 (파일이 단순히 존재하는지만 확인)
  if (properties && properties["문자발송내역"] &&
      properties["문자발송내역"].files && properties["문자발송내역"].files.length > 0) {
    // "안내문자발송"이 아직 "발송완료"가 아니라면 업데이트 요청
    if (!(properties["안내문자발송"] && properties["안내문자발송"].select && properties["안내문자발송"].select.name === "발송완료")) {
      var updateUrl2 = "https://api.notion.com/v1/pages/" + pageId;
      var updatePayload2 = {
        properties: {
          "안내문자발송": {
            select: { name: "발송완료" }
  ```

- **왜 유실인가**: exact 정의 `checkAndUpdateNotion`과 검색어 `등록마감일|신청불가|문자발송내역|안내문자발송|교육 상태`가 production 0건이다. 전체 issue 205건에도 이 상태 전환을 소유한 구현 이슈가 없다. Notion transport를 제거한 사실은 맞지만, 그 안의 두 상태 전환 규칙을 대체한 DB domain/scheduler도 없다.
- **금액에 닿는가**: **아니오**. 신청 가능 상태와 문자 발송 완료 상태만 바꾸며 금액·단가·세액을 읽거나 쓰지 않는다.
- **발화 조건**: 현 실 DB의 commission/settlement/education/training 이름 테이블 **0개, 직접 적용행 0건 — 판정 불가**. 실제 발화 건수는 레거시 Notion 교육 DB 원본에서 `등록마감일 < now AND 가능여부 <> 신청불가` 또는 `문자발송내역 files>0 AND 안내문자발송 <> 발송완료`인 page를 읽어야 확정된다.
- **크기 추정**: **M**. 교육 상태 저장모델, 두 idempotent transition, scheduler, 문자 결과 연결, 감사필드가 필요하다.

## 5. 이슈화 권고

유실 함수 9개를 함수별 이슈 9개로 쪼개면 D-G1의 하나의 금액 snapshot이 분산된다. 실제 발행은 다음 두 개가 적절하다.

1. **L — D-G1 영업수수료 정산 domain 신설**: §4.1-§4.8을 acceptance criterion 8개로 묶는다. 문서번호 `YYYY/MM/DD-N`, `ApprovalReferenceDocType` 7번째 값, 지출결의서 참조 첨부와 연결 버튼을 함께 포함한다.
2. **M — 교육 신청/문자 상태 자동 전환**: §4.9의 두 transition과 실 Notion 원본 대조를 하나의 이슈로 묶는다.

금액 영향 우선순위는 `getValues` → `xround` → `setPay/setWht/setExp/getExpenseRate` → `recalc` → `renderDoc` 순이 아니라, 구현 의존성 때문에 **D-G1 통합 이슈 1개**로 처리해야 한다. `renderDoc`만 먼저 만들면 계산 snapshot·번호·approval 참조가 분리된다.
