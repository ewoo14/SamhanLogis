# #977 금액 계열 legacy GAS 재대조

- 조사일: 2026-07-29
- 조사 성격: 읽기 전용 정적 대조
- 기준 브랜치/작업 트리: `chore/977-money-gas-recompare`, 조사 시작 시 `HEAD=ad5b8d374`
- 제품 대조 기준: 최종 확인 시 `origin/main=506ebe742`; 조사 시작 HEAD와 제품 범위(`clients/web/order-app`, `clients/web/estimate-app`, `services/**`)의 파일 차이 0건
- PR #974 squash commit: `9c7f0d546d68474f3e4dd6b180072c5662f58c59`
- 비교 기준: `9c7f0d546^1` → `9c7f0d546`

## 1. 결론

PR #974가 이번 범위 네 프로젝트에 만든 금액·수량 변경은 논리 규칙 기준 **총 13건**이다.

| 프로젝트 | 표준 unified diff | GitHub patch hunk | `+/-` | 금액·수량 변경 |
|---|---:|---:|---:|---:|
| `일마감 프로그램` | 41줄 | 32줄 | `+13/-3` | **1건** |
| `영업수수료 계산` | 768줄 | 753줄 | `+747/-0` | **11건** |
| `제이시스템 전용 주문서 인식` | 25줄 | 20줄 | `+18/-0` | **0건** |
| `에어디자이너 전용 주문서 인식` | 146줄 | 137줄 | `+68/-7` | **1건** |
| 합계 | **980줄** | **942줄** | **`+846/-10`** | **13건** |

가장 중요한 제품 대조 결과는 다음 두 가지다.

1. `일마감 프로그램`은 인상 단가 기준일을 `2026-04-01`에서 `2026-07-01`로 바꿨다. 주문 앱의 스케줄 seed는 현재 7월을 따르지만, **제품의 실제 일마감 재검증 경로는 `price_history`의 4월 기준을 계속 따른다.**
2. `영업수수료 계산`의 11개 금액 규칙을 그대로 수행하는 제품 기능은 없다. `groupware-service`의 일반 `지출결의서`는 금액 한 칸을 입력받을 뿐 수수료·공제·부가세 계산을 하지 않는다.

`if (!row) return;` 계열은 조건을 하나씩 세면 **11개 guard 단정문**이다. helper/caller 중복을 걷어낸 최종 품목 제외 단정은 **9개**, 고유 처리 지점은 **7곳**이다. 그중 사용자에게 미매칭으로도 알리지 않는 **엄격한 조용한 누락은 3개 단정문·1곳**이며, 모두 PR #974가 `에어디자이너`에 새로 넣은 `capQtyToOrder_()` 안에 있다.

## 2. 조사·카운트 방법

### 2.1 diff

요약문을 사용하지 않고 다음 원문을 확인했다.

```powershell
gh pr view 974 --json commits,files,mergeCommit
git diff --no-ext-diff --unified=3 9c7f0d546^1 9c7f0d546 -- <프로젝트 경로>
gh api --paginate 'repos/ewoo14/Samhan-Public/pulls/974/files?per_page=100'
```

- `표준 unified diff`는 파일 header와 hunk를 포함한 `git diff --unified=3` 출력 줄 수다.
- `GitHub patch hunk`는 GitHub Pull Files API의 `patch` 필드 줄 수다.
- `+/-`는 같은 API와 `git diff --numstat`을 교차 확인했다.
- 금액 변경 수는 줄 수가 아니라 독립적인 계산·선택 규칙으로 셌다. 같은 규칙을 단건/일괄 함수에 두 번 연결한 경우에는 1건이다.

참고로 조사 지시에 예시로 든 `거래처 발송 주문서/index.html`의 “501줄”은 현재 저장소/PR API에서 그대로 재현되지 않았다. 같은 방식의 현재 값은 표준 unified diff 671줄, GitHub patch hunk 667줄, `+151/-148`이다. 이 보고서는 줄 수 정의가 숨지 않도록 두 측정값을 모두 남긴다. 내용 판정은 두 diff의 before/after가 동일함을 확인했다.

### 2.2 제품 대조

다음 범위만 검색했다.

```text
clients/web/order-app
clients/web/estimate-app
services/**
```

Docker, DB, 서비스 빌드, 라이브 Google Drive 호출은 하지 않았다. 따라서 “현재 DB에 수동으로 어떤 행이 들어 있는가”가 아니라 **현재 `origin/main` 계열 코드가 어떤 값을 seed·sync·소비하는가**를 판정한다.

## 3. 프로젝트별 전수 결과

## 3.1 일마감 프로그램

### diff 전수 분류

- `Code.js`: `+3/-3`. 두 줄은 공백 정리이고, 실질 변경은 기준일 1건이다.
- `appsscript.json`: 신규 10줄. 실행 주체·접근 범위 manifest이며 금액·수량과 무관하다.

따라서 금액 변경은 **1건**이다.

### D-1. 단가인상 기준일 `20260401` → `20260701`

Before:

```js
if (dateNum >= 20260401) suffix = '_단가인상';
```

After:

```js
if (dateNum >= 20260701) suffix = '_단가인상';
```

현재 GAS 위치: `tools/legacy-gas/일마감 프로그램/Code.js:426-438`.

이 분기는 일마감 대상 첫 유효 `일자`를 숫자로 바꾼 뒤, 기준일 이상이면 `_단가인상` 시트에서 출고가·납품가를 읽게 한다. 2026-04-01~2026-06-30 전표가 인상 단가를 쓰던 동작에서 인상 전 단가를 쓰는 동작으로 바뀌므로 금액 직접 변경이다.

### 제품 대응

#### 정확한 대응 기능: 제품 일마감 재검증은 **낡은 4월 값**

제품의 일마감 상세는 `MonthEndCloseService`가 품목별 업무일 `asOf`를 `ProductClient.applicablePrices()`에 넘긴다.

- `services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/MonthEndCloseService.java:357-398`
- `services/accounting-service/src/main/java/com/samhanair/logis/accounting/client/ProductClient.java:286-325`

`ProductClient`의 계약은 `effectiveDate <= asOf`인 최신 `price_history`를 고르는 것이다. 그런데 운영 Google Sheet sync가 인상본을 넣는 기준은 여전히 다음과 같다.

```java
private static final LocalDate PRICE_INCREASE_EFFECTIVE_DATE =
        LocalDate.of(2026, 4, 1);
```

- `services/product-service/src/main/java/com/samhanair/logis/product/service/ProductSheetSyncService.java:88-92`
- 실제 upsert 소비: 같은 파일 `1262`, `1321`, `1333`, `1338`
- dev fallback도 `services/product-service/src/main/java/com/samhanair/logis/product/seed/PriceHistorySeeder.java:33-41,54-56,80-93`에서 `2026-04-01`

따라서 코드 기준으로 2026-04-01~2026-06-30의 제품 일마감은 인상 후 정가/납품가를 참조하고, 갱신된 GAS는 인상 전 탭을 참조한다. **정확한 대응 기능은 before인 4월 값을 따른다.**

#### 인접 주문 기능: order-app 스케줄은 **새 7월 값**

PR #980이 추가한 V26은 V22 초기 seed 네 카테고리를 `2026-07-01`로 바꾼다.

- `services/product-service/src/main/resources/db/migration/V26__align_price_change_schedule_to_live_gas.sql:1-12`
- `clients/web/order-app/index.html:1438-1445`는 납기일과 이 스케줄을 비교한다.

다만 V26은 `price_change_schedule`만 바꾸며, 위 일마감이 읽는 `price_history`는 바꾸지 않는다. 관리자가 생성·수정한 schedule 행도 `created_by = 'V22_MIGRATION'` 조건 밖이면 보존된다.

`estimate-app`은 `clients/web/estimate-app/views/index.ejs:2255-2258`에서 스케줄을 주입받지만 현재 화면 계산은 `PRICE_DEFAULT_VARIANT` 기반 수동 체크박스를 사용한다(`6608`, `7778`, `7817`, `10022`, `10103`, `10204`). 날짜 기준의 직접 대응으로 판정하지 않았다.

## 3.2 영업수수료 계산

### diff 전수 분류

PR #974가 Drive에만 있던 프로젝트를 새로 추가했다.

- `Code.js`: 신규 179줄
- `Index.html`: 신규 558줄
- `appsscript.json`: 신규 10줄

Before는 세 파일 모두 **존재하지 않음**이다. 인증·Notion 저장·복원·HTML/CSS는 금액 변경 수에서 제외하고, `Index.html:203-355`의 상태와 산식을 전수 분해했다.

### 금액 변경 11건

아래 11건 모두 공통 Before는 “프로젝트/산식 없음”이다.

| ID | After 원문 | 판정 |
|---|---|---|
| C-1 | `var payMethod = '카드결제';` / `var card = payMethod === '카드결제' ? xround(-total * 0.03) : 0;` (`Index.html:206,331`) | 카드결제가 기본이며 총 결제금액의 **3% 공제** |
| C-2 | `var sales = total - equip + card;` (`332`) | 총 영업수수료 기준액 = 결제금액 - 장비대 + 카드 공제 |
| C-3 | `var expenseRate = 0.08;` / 수기면 입력값÷100 / `var expense = xround(sales * -expenseRate);` (`208,297-301,330,333`) | 제경비 기본 **8%**, 수기 비율 허용, 영업수수료 기준 공제 |
| C-4 | `var whtApply = true;` / `var wht = whtApply ? xround(sales * -0.033) : 0;` (`207,334`) | 원천징수 기본 적용, 영업수수료의 **3.3% 공제** |
| C-5 | `var dogup = xround(install * -0.08);` (`335`) | 설치비의 **8% 공제** |
| C-6 | `var safety = -safetyInput;` (`336`) | 산업안전관리비 입력액 전액 공제 |
| C-7 | `var subtotal = sales + expense + wht + dogup + safety;` (`337`) | 소계 합산 규칙 |
| C-8 | `var payout = subtotal - prepaid;` (`338`) | 차인지급액에서 선지급 수수료 공제 |
| C-9 | `var supply = xround(subtotal / 1.1);` (`339`) | VAT 포함 소계를 **1.1로 나눠 공급가** 계산 |
| C-10 | `var vat = subtotal - supply;` (`340`) | 부가세를 소계-공급가 잔액으로 계산 |
| C-11 | `return (n < 0 ? -1 : 1) * Math.round(Math.abs(n));` (`318-320`) | 카드·제경비·원천징수·설치비·공급가를 부호 대칭 원 단위 반올림 |

직접 입력 필드, 출력/미리보기의 같은 금액 재표시, 저장/복원은 별도 금액 규칙으로 중복 계산하지 않았다.

### 제품 대응: **기능 없음**

다음 한국어/영문 기능어를 제품 범위에서 전수 검색했으나 대응 계산은 0건이었다.

```text
영업수수료, 제경비, 차인지급액, 원천징수, 가맹점 수수료,
산업안전관리비, 도급비, 선지급 수수료,
sales commission, withholding, merchant fee, prepaid commission
```

`groupware-service`에는 일반 지출결의서가 있지만 대응 기능은 아니다.

- `services/groupware-service/src/main/resources/db/migration/V5__add_approval_templates_and_attachments.sql:109-116`
- 같은 파일 `128-142`: `amount`라는 숫자 입력 필드 1개만 정의

이 템플릿은 C-1~C-11의 비율·공제·VAT 산식을 갖지 않는다. 따라서 11건 모두 제품이 before/after 어느 쪽을 따르는지 비교할 구현 자체가 없다.

## 3.3 제이시스템 전용 주문서 인식

### diff 전수 분류

PR #974 diff는 `appsscript.json` 신규 18줄뿐이다. Drive v2 고급 서비스, 배포 실행 주체, 접근 범위, V8 runtime manifest다. `Code.js`와 `Index.html`은 바뀌지 않았다.

따라서 금액·수량 변경은 **0건**, 대응 제품 비교 대상도 **0건**이다.

현재 `Code.js:489-493`의 `AXJ-YA1509N → 45,000원` 특수 단가는 금액 하드코딩이지만 PR #974의 부모와 결과 양쪽에 동일하게 존재한다. 이번 PR 변경 수에는 넣지 않았다.

## 3.4 에어디자이너 전용 주문서 인식

### diff 전수 분류

`Code.js`의 `+50/-7`과 manifest 18줄을 전수 분류한 결과는 다음과 같다.

| 변경 | 위치 | 금액·수량 판정 |
|---|---|---|
| 싱글 창고 판정에 `getModelFlags()` 보강 | `Code.js:511-523` | 창고 코드만 변경, 금액 아님 |
| 발주서 수량 map 및 최종 품목 cap 신설 | `1478-1506`, 연결 `1776-1782`, `2011-2018` | **수량·금액 직접** |
| 창고 판정은 cap 전 목록으로 유지 | `1777-1785`, `2012-2021` | 창고만 변경 |
| 일괄 preview에 창고 코드/명 추가 | `2034-2039` | 금액 아님 |
| 모델/품명 header exact miss 시 부분일치 fallback | `2284-2337` | 유일 소비처가 창고 판정(`478-524`), 금액 아님 |
| `appsscript.json` 신규 | manifest | 금액 아님 |

따라서 금액·수량 변경은 **1건**이다.

### A-1. 발주서에 없는 모델 제거, 수량 상한 및 금액 재계산

Before:

```js
finalItems = mergeKeepLastScoped_(finalItems);
const finalSquashed = squashConsecutiveSpecs_(finalItems);
const subtotal = finalItems.reduce((acc,x)=> acc + (x.unit||0)*(x.qty||0), 0);
```

After:

```js
finalItems = mergeKeepLastScoped_(finalItems);
const whItems = finalItems.slice();
finalItems = capQtyToOrder_(finalItems, buildOrderQtyMap_(srcItems));
const finalSquashed = squashConsecutiveSpecs_(finalItems);
const subtotal = finalItems.reduce((acc,x)=> acc + (x.unit||0)*(x.qty||0), 0);
```

신규 규칙 원문:

```js
if (!remain.has(k)) return;
const budget = Number(remain.get(k)) || 0;
if (budget <= 0) return;
const q = Math.min(Math.floor(Number(x.qty)||0), budget);
if (q <= 0) return;
remain.set(k, budget - q);
out.push({ ...x, qty: q, line: (Number(x.unit)||0) * q });
```

- 현재 위치: `tools/legacy-gas/에어디자이너 전용 주문서 인식/Code.js:1478-1506`
- 단건 연결: `1776-1782`
- 일괄 연결: `2011-2018`

모델별 발주 수량을 합산하고, 최종 품목 수량을 그 예산까지 줄인 뒤 `unit × q`로 행 금액과 subtotal을 다시 만든다. 발주서 map에 모델이 없으면 그 품목은 결과에서 제거된다. `발통세트`와 `볼트세트`는 예외로 보존된다.

### 제품 대응: **동일한 PDF 주문 인식 기능 없음**

제품 범위에서 `parsePdfForPreview`, `parseOrderFromText`, 주문 PDF upload/import, 에어디자이너 전용 parser를 검색했으나 0건이었다. `estimate-app`의 PDF 항목은 `views/index.ejs:1903,14028,14408`의 문서 **출력** 기능일 뿐 입력/인식 기능이 아니다. `order-app`에도 PDF 주문서 입력 경로가 없다.

따라서 A-1을 before/after 어느 쪽으로 수행하는 제품 대응 구현은 없다. `order-app`의 수동 수량·파생 수량 로직은 입력 방식과 데이터 흐름이 달라 이 PDF cap의 대응 구현으로 세지 않았다.

## 4. `if (!row) return;` 계열 전수 카운트

### 4.1 카운트 정의

네 프로젝트의 `Code.js`, `Index.html`, manifest 전부에서 다음을 전수 확인했다.

- `.find(...)` 결과 결측 처리
- catalog/map의 `[...]` 조회 뒤 `return`/빈 배열
- 품목 코드가 다른 집합에 없을 때 현재 품목을 결과에 넣지 않는 분기

세 수치를 구분한다.

1. **guard 단정문 11개**: `if` 조건 하나를 한 건으로 세며, helper 내부와 caller의 별도 guard도 각각 센다.
2. **최종 품목 제외 단정문 9개**: helper 내부 결측을 caller에서 다시 받는 2개는 이중 계산하지 않는다.
3. **고유 최종 제외 지점 7곳**: 같은 `capQtyToOrder_()` callback 안의 연속 세 단정문은 한 처리 지점으로 묶는다.
4. **엄격한 조용한 누락 3개 단정문·1곳**: 로그, `itemsUnmatched`, 화면 경고 어느 것도 남기지 않는 단정과 처리 지점이다.

### 4.2 guard 단정문 11개

| # | 프로젝트/위치 | 조회 키·품목 코드 | 결측 동작 | 사용자 노출 |
|---:|---|---|---|---|
| 1 | 제이시스템 `Code.js:1070-1073` | 동적 싱글 세트 `setModelKey` | `singleCtx.map[...]`가 비면 `{parts:[]}` 반환 | helper 로그 후 caller로 전파 |
| 2 | 제이시스템 `Code.js:2233-2236` | 동적 `it.codeRaw`/`keyBase` | 세트 품목 전체를 `finalItems`에 넣지 않고 return | `itemsUnmatched` 추가 |
| 3 | 제이시스템 `Code.js:2292-2295` | 동적 `it.codeRaw`; 하드코딩 alias 후보 `FH-LFHIF`, `발통세트`, `SI-AL700a`, `SI-AL600a` 포함 | `homeMap` miss면 품목 제외 | 로그 + `itemsUnmatched` |
| 4 | 에어디자이너 `Code.js:1047-1050` | 동적 싱글 세트 `setModelKey` | `singleCtx.map[...]`가 비면 `{parts:[]}` 반환 | helper 로그 후 caller로 전파 |
| 5 | 에어디자이너 `Code.js:1498` | 동적 최종 품목 `x.model`/정규화 `k` | 원 발주 수량 map에 없으면 결과에서 return | **없음** |
| 6 | 에어디자이너 `Code.js:1500` | 같은 동적 `x.model`; `budget`은 해당 모델의 남은 발주 수량 | 잔여 발주 수량이 0 이하면 결과에서 return | **없음** |
| 7 | 에어디자이너 `Code.js:1502` | 같은 동적 `x.model`; `q`는 `min(품목수량, 잔여수량)` | 계산 수량이 0 이하면 결과에서 return | **없음** |
| 8 | 에어디자이너 `Code.js:1698-1700` | 동적 `it.modelRaw`/`key` | 단건 세트 전개 결과가 비면 품목 제외 | `itemsUnmatched` |
| 9 | 에어디자이너 `Code.js:1711-1712` | 동적 `it.modelRaw`; 하드코딩 정규화 결과 `FH-LFHIF`, `AXJ-YA1509N`, `AXJ-YA2512N`, `PC1YNWK1NW` 포함 | 단건 `homeMap` miss면 품목 제외 | `itemsUnmatched` |
| 10 | 에어디자이너 `Code.js:1933-1937` | 동적 `it.modelRaw`/`key` | 일괄 세트 전개 결과가 비면 품목 제외 | 로그 + `itemsUnmatched` |
| 11 | 에어디자이너 `Code.js:1948-1949` | #9와 같은 동적/정규화 코드 | 일괄 `homeMap` miss면 품목 제외 | `itemsUnmatched` |

`일마감 프로그램`은 해당 계열 0개다. `reqComps.find(...)` 결측은 뒤에서 `.price` 접근으로 예외가 나므로 “조용한 return”에 포함하지 않았다. 가격 map 결측도 품목을 제거하지 않고 `{price:0,...}`로 남긴다.

`영업수수료 계산`은 품목 catalog 자체가 없어 0개다.

### 4.3 최종 제외 단정 9개·고유 지점 7곳·엄격한 조용한 누락 3개/1곳

helper의 빈 `parts` 반환(#1, #4)은 각각 caller(#2, #8/#10)가 최종 제외와 `itemsUnmatched` 기록을 수행한다. 따라서 실제 최종 제외 단정문은 #2, #3, #5, #6, #7, #8, #9, #10, #11의 **9개**다. 다만 #5~#7은 같은 callback 안에서 한 품목을 거르는 연속 조건이므로 처리 위치로 묶으면 **고유 최종 제외 지점은 7곳**이다.

그중 #2, #3, #8, #9, #10, #11은 화면에서 다음 경고로 보인다.

- 제이시스템: `Index.html:590-606` — “모델 불일치 품목은 전송 대상에서 제외됩니다”
- 에어디자이너: `Index.html:484-495` — 같은 경고와 모델·수량 표

#5~#7 `capQtyToOrder_()`만 `unmatched`에 넣지 않고 로그도 남기지 않는다. 따라서 엄격한 의미의 **조용한 금액 누락은 단정문 기준 3개, 고유 처리 지점 기준 1곳**이다. 해당 코드는 고정 literal 하나가 아니라 cap 대상인 모든 동적 `x.model`이다. 예외는 `발통세트`, `볼트세트`뿐이다.

### 4.4 catalog `.find()`지만 누락으로 세지 않은 12개

두 인식기의 `partsAll.find(...)` 교체 조회는 각각 6개, 합계 **12개**다. 모두 miss면 기존 구성품 `p`를 그대로 반환하므로 품목·금액이 사라지지 않는다.

- 제이시스템 동적 조회 4개: `Code.js:1086-1091`, `1100-1104`, `1117-1121`, `1129-1133`
- 에어디자이너 동적 조회 4개: `Code.js:1061-1065`, `1073-1077`, `1088-1092`, `1099-1103`
- 아래 표의 literal 조회 4개

| 위치 | literal | miss 동작 |
|---|---|---|
| 제이시스템 `Code.js:1141-1143` | `AWR-WG00N` | 기존 `p` 유지 |
| 제이시스템 `Code.js:1147-1149` | `AWR-WE13N` | 기존 `p` 유지 |
| 에어디자이너 `Code.js:1110-1112` | `AWR-WG00N` | 기존 `p` 유지 |
| 에어디자이너 `Code.js:1116-1118` | `AWR-WE13N` | 기존 `p` 유지 |

따라서 catalog 교체 lookup 12개는 전수 확인했지만 `if (!row) return;` 누락 카운트에는 넣지 않았다.

## 5. 판정 요약

| 변경 | GAS after | 제품 대응 | 제품이 따르는 쪽 |
|---|---|---|---|
| 일마감 인상 기준일 | `2026-07-01` | accounting 일마감 + product `price_history` | **before `2026-04-01`** |
| order-app 인접 주문 스케줄 | `2026-07-01` | V26 + `incActive()` | **after `2026-07-01`** |
| 영업수수료 11개 산식 | 신규 | 없음; 일반 지출결의서 금액 입력만 있음 | 비교 불가 |
| 제이시스템 PR diff | manifest만 | 금액 변경 없음 | 해당 없음 |
| 에어디자이너 발주 수량 cap | 신규 | 동일 PDF 인식 기능 없음 | 비교 불가 |

## 6. 이 라운드가 보지 않은 것

- `종합견적서`: export가 `File too large`로 막힌 별도 라운드이며 열지 않았다.
- 이번 네 프로젝트 밖의 나머지 20개 legacy GAS 프로젝트.
- PR #974가 네 프로젝트 밖에서 바꾼 파일과 금액 변경.
- Google Drive 라이브 재호출, Google Sheet의 현재 실제 행, Notion, 외부 API.
- Docker 기동, DB 접근, `services/**` 빌드·테스트. 다른 트랙의 공유 스택을 건드리지 않았다.
- 제품 운영 DB에 관리자가 수동으로 넣거나 수정한 `price_change_schedule`/`price_history` 행의 실값. 이 보고서의 old/new 판정은 코드의 seed·sync·소비 경로 기준이다.
- PR #974 이전부터 존재한 모든 금액 상수의 제품 동등성 재검증. 예를 들어 제이시스템 `AXJ-YA1509N=45,000`, 에어디자이너 `0.47` fallback과 `20260401`은 before/after가 같아 PR #974 변경 건수에서 제외했다.
- 누락 guard의 라이브 도달 빈도와 실제 누락 금액. 정적 경로와 사용자 노출 여부까지만 판정했다.
- 코드 수정, commit, branch 조작, PR/Issue 생성.

## 7. PM 종합 — 이 라운드의 결론과 후속 배치 (2026-07-29)

### 7.1 개발책임자 정정 — 일마감은 "기준일 문제"가 아니다

이 보고서 §1 결론 ①과 §5 표의 **측정값은 그대로 유효하다**. 정정된 것은 그 측정값의 **해석**이다.

> 📌 개발책임자: *"일마감은 기준일 문제가 아니다. 아니면 이슈 확인바람 — 아직 구현이 안되었을수도 있음"*

확인 결과 **미구현이 맞고, #773 이 이미 문서화하고 있었다.**

- **#773 [CLOSED]** `[FEAT] #17 후속 — 일마감 단가변동 재계산 토글 (레거시 isBeforeHike 동등, 별도 대규모 슬라이스)`
- 2026-07-08 정찰: 현대 일마감 화면에는 단가변동 토글이 없고 가격 재계산도 하지 않는다. `DailyClosingService.close()` 는 이미 stamp 된 합계를 집계·lock 할 뿐이며 `DailyClosing` 에는 **카테고리 축 자체가 없다**.
- 레거시 GAS 는 `processDailyData(..., isBeforeHike)` 가 raw export 를 단가시트로 라이브 재계산하는 **전역 단일 토글**이다.
- 즉 현대 시스템은 단가변동을 **상류(견적/전표 생성 시)에 stamp** 하므로, 일마감 재계산은 근본 아키텍처 변경이며 S4 와 분리하기로 2026-07-08 에 확정돼 있었다.

⟹ 이 라운드가 "제품 이원화" 로 규정한 것은 실은 **알려진 미구현**이었다. 정찰 보고서와 PR 코멘트 모두 #773 을 참조하지 않았다. 여기에 기록해 정정한다.

### 7.2 #773 이 다루지 않은 좁은 표면 — 별도 트랙 #991 로 분리

#773 정찰은 `DailyClosingService`(집계·lock)를 봤다. `MonthEndCloseService` 는 다르다.

```java
// MonthEndCloseService:238, 282, 316
List<DailyProductLine> products = revalidateProductLines(byModel, date);
// :357-398 → loadApplicablePrices(matchedProductIds, asOf)
//            계약: effectiveDate <= asOf 인 최신 price_history
```

`DailyProductLine` 은 **일마감 상세 화면의 품목별 라인**이다. 합계는 stamp 값을 쓰지만 **상세의 품목 단가는 `asOf` 로 `price_history` 를 재조회해 표시한다.** `ProductSheetSyncService` 가 그 `price_history` 를 하드코딩 `2026-04-01` 로 적재하므로, 4~6월 전표에서 **주문서가 실제로 쓴 단가(인상 전)** 와 **일마감 상세가 표시하는 단가(인상 후)** 가 어긋난다.

이것은 재계산 토글이 아니라 **표시 단가 조회 기준** 문제이므로 범위가 훨씬 작다.

> 📌 개발책임자 결정 (2026-07-29): **일마감이 무엇을 조회해 기본/`_단가인상` 을 고를지 = 카테고리별 기존 설정 `price_change_schedule.default_pre_change`. 신규 스키마·화면 없음.**

`services/**` 를 건드리므로 #984 #985 와 Docker 스택 직렬화가 필요하다. **별도 트랙 PR #991 로 분리했다.**

### 7.3 영업수수료 11건 — 제품 대응 없음, 이번 범위에서 종결

`영업수수료 계산` 의 11개 금액 규칙을 그대로 수행하는 제품 기능은 없다. `groupware-service` 의 일반 `지출결의서` 는 금액 한 칸을 입력받을 뿐 수수료·공제·부가세 계산을 하지 않는다. **비교 대상 자체가 없으므로 이 라운드에서 파생되는 코드 변경은 없다.** 제품화 여부는 신규 기능 결정이라 이 트랙 밖이다.

### 7.4 누락 guard 전수 — 조용한 누락 3개 단정문·1곳

`if (!row) return;` 계열은 조건 단위로 **11개 단정문**, 중복 제거 후 **9개**, 고유 처리 지점 **7곳**이다. 그중 사용자에게 미매칭으로도 알리지 않는 **엄격한 조용한 누락은 3개 단정문·1곳**이며 전부 PR #974 가 `에어디자이너` 에 새로 넣은 `capQtyToOrder_()` 안에 있다. **레거시 GAS 파일 안의 문제이고 제품 코드에는 대응 경로가 없다.** 같은 계열의 제품 표면(카탈로그 누락이 조용히 끝나는 문제)은 **PR #987 에서 이미 별도로 처리 중**이다.

### 7.5 이 트랙의 최종 판정

| 게이트 | 상태 |
|---|---|
| ① 실 사용자 경로로 재현 가능한 결함 | **0** — 이 PR 은 코드 변경 0. 파생된 제품 결함 1건은 #991 로 분리, 1건은 #987 에서 진행 중 |
| ② CI green | 문서 전용 변경 |
| ③ 라이브QA | **해당 없음** — 실행 표면을 만들지 않는다 |

**코드 변경 0 조건을 지켜 종료한다.**
