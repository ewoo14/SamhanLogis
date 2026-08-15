# 일마감 프로그램 업무 규칙 패리티 정찰

- 정찰일: 2026-08-15
- 정찰자: CODEX SOL
- 질문: **“일마감 프로그램의 업무 규칙이 우리 시스템에 그대로 있는가?”**
- 레거시 범위: `tools/legacy-gas/일마감 프로그램/Code.js`, `tools/legacy-gas/일마감 프로그램/Index.html`
- 현행 기준: PR #1219 작업트리 `.claude/worktrees/wdc`의 `DailyClosingPage`와 직접 호출·판정하는 서비스
- 안전 조건: 정적 소스 대조만 수행했다. GAS·공유 DB·서비스에 쓰지 않았고, Git 쓰기·배포·프로세스 제어를 하지 않았다.

## 결론 요약

**그대로 있지 않다.** 규칙 20개를 대조한 결과는 **동일 8 · 다름 7 · 없음 4 · 확인 불가 1**이다. 할인율 산식, 전표별 zone 전이, 싱글 세트 수량 pool·정액 DC, 구형/부속/멀티 판정 순서, 음수 반품의 절댓값 비교, 전표별 소계 축은 상당 부분 옮겨졌다. 그러나 현행은 레거시 엑셀 전체 행이 아니라 상태가 제한된 출고전표·발행 세금계산서·POSTED 회계전표를 원천으로 쓰며, 가격표 선택, 1WAY 부속 키워드 검색, 멀티 검증 미적용 토글, 선발행 분류, 미발행 거래처 표식, 실제 마감·회계 게이트가 다르다.

특히 **현행 화면의 `결과`/`선발행` 분류가 레거시와 반대**다. 레거시는 회계반영일자가 있으면 `선발행(pre)`으로 보냈지만, 현행은 `결과` 탭에 `accountingPostedAt`이 있는 행을 넣는다.

이 문서는 코드 차이를 업무 정책의 정답으로 간주하지 않는다. 모든 항목의 `⑤ 업무 확인`이 최종 판단 게이트다.

## 판정 기준

- **동일**: 확인한 입력과 결과 조건이 소스상 같다.
- **다름**: 같은 목적의 구현이 있으나 조건·원천·결과가 다르다.
- **없음**: 현행 일마감 조회·판정·실행 경로에서 대응 규칙을 찾지 못했다.
- **확인 불가**: 코드 형태는 대응하지만 외부 가격표·카탈로그·전역DC 운영값 없이는 실제 결과의 동등성을 확정할 수 없다.

---

## R-01. 일마감 대상 행과 전표 상태

### ① 레거시 규칙

`tools/legacy-gas/일마감 프로그램/Index.html:860-875`

```js
let raw = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], {range: 1});
ecountData = raw.filter(r => r['번호'] && !String(r['품목명']).includes('합계') && !String(r['품목명']).includes('총계'));
```

첫 시트에서 `번호`가 있고 품목명이 `합계`·`총계`가 아닌 행을 받는다. 별도 전표 상태 필터는 없다.

### ② 우리 구현

`.claude/worktrees/wdc/services/slip-service/src/main/java/com/samhanair/logis/slip/service/DailyClosingQueryService.java:21-43`

```java
private static final EnumSet<SlipStatus> INCLUDED_STATUSES = EnumSet.of(
        SlipStatus.CONFIRMED, SlipStatus.DELIVERED, SlipStatus.COMPLETED);
return slipRepository.findDailyClosingOutboundSlips(slipDate, INCLUDED_STATUSES).stream()
        .filter(slip -> INCLUDED_STATUSES.contains(slip.getStatus()))
        .flatMap(slip -> slip.getLines().stream())
        .toList();
```

출고전표 중 `CONFIRMED`·`DELIVERED`·`COMPLETED`만 가져온다.

### ③ 판정

**다름** — 레거시는 업로드 파일의 번호 있는 행, 현행은 출고전표 도메인과 세 상태로 대상을 한정한다.

### ④ 사용자 차이

같은 날짜라도 엑셀에 있던 다른 상태 행은 현행에 나타나지 않을 수 있고, 반대로 합계행 제거는 도메인 라인 구조로 대체된다.

### ⑤ 업무 확인

**🚨 업무 확인 필요 — 최우선.** 일마감 대상의 정본이 “이카운트 추출 파일 전체”인지 “확정·배송·완료 출고전표”인지, 취소·임시·잠금 상태를 각각 포함할지 확인해야 한다.

---

## R-02. 전표별 행 순서에 따른 SINGLE·HOME_MULTI·COMM_MULTI zone 전이

### ① 레거시 규칙

`tools/legacy-gas/일마감 프로그램/Code.js:473-499`

```js
var key = row['일자'] + '_' + row['번호'];
if (!invoiceGroups[key]) invoiceGroups[key] = [];
invoiceGroups[key].push(row);
// ...
if (/^AM/.test(t) && t.length >= 7 && (t[6] === 'X' || t[6] === 'N')) currentZone = 'COMM_MULTI';
else if (/^AJ/.test(t) && t.length >= 7 && (t[6] === 'X' || t[6] === 'N')) currentZone = 'HOME_MULTI';
else if (isTargetModelCode_(t) && (cls === 'INDOOR' || cls === 'OUTDOOR' || cls === 'SUB_INDOOR')) currentZone = 'SINGLE';
item._zone = currentZone;
```

일자+번호로 묶은 원본 행 순서에서 zone을 바꾸며, 전환 행부터 새 zone을 적용한다.

### ② 우리 구현

`.claude/worktrees/wdc/services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/LegacyVerificationChain.java:74-95`

```java
Map<String, Zone> zoneByScope = new LinkedHashMap<>();
for (Row row : rows) {
    String scope = scopeKey(row);
    Zone zone = zoneByScope.getOrDefault(scope, Zone.UNKNOWN);
    if (isCommercialMultiToken(token)) zone = Zone.COMM_MULTI;
    else if (isHomeMultiToken(token)) zone = Zone.HOME_MULTI;
    else if (isTargetModelCode(token) && isPresentMain(row.kind())) zone = Zone.SINGLE;
    zoneByScope.put(scope, zone);
    result.add(new RoutedRow(row, zone));
}
```

scope별 순서를 보존하고 전환 행부터 새 zone을 기록한다.

### ③ 판정

**동일** — 모델 접두·7번째 문자·본체 종류와 ordered transition이 같다.

### ④ 사용자 차이

동일한 원천 행 순서와 모델 분류가 전달되면 어느 판정 분기로 들어가는지는 같다.

### ⑤ 업무 확인

**🚨 업무 확인 필요.** 행 순서가 실제 업무 의미를 가져야 하는지, 원천 변환 과정에서도 이카운트와 같은 순서가 보존되는지 확인해야 한다.

---

## R-03. 2026-07-01 단가인상 가격표 선택

### ① 레거시 규칙

`tools/legacy-gas/일마감 프로그램/Code.js:423-455`

```js
if (ecountData && ecountData.length > 0 && !isBeforeHike) {
  // 앞 5행에서 첫 유효 일자
  if (dateNum >= 20260701) suffix = '_단가인상';
}
var priceMap = loadPriceMap_(suffix);
var catalog = loadSingleSetCatalog(suffix);
```

사용자가 `인상 전`을 선택하지 않았고 앞 5행의 첫 유효 일자가 2026-07-01 이상이면 `_단가인상` 시트와 구성표를 쓴다.

### ② 우리 구현

`.claude/worktrees/wdc/services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/MonthEndCloseService.java:885-895`

```java
Boolean defaultPreChange = defaultVariants.get(axis.scheduleKey());
if (defaultPreChange == null) return null;
return defaultPreChange ? BEFORE_INCREASE_PRICE_HISTORY_DATE : asOf;
```

카테고리별 `defaultPreChange` 설정에 따라 2000-01-01 또는 대상일 가격 이력을 고른다. 화면에는 레거시 `인상 전` 토글이 없다.

### ③ 판정

**다름** — 고정 경계일+사용자 토글과 카테고리 운영 설정+가격 이력 방식이 다르다.

### ④ 사용자 차이

같은 2026-07-01 전표도 카테고리 설정에 따라 다른 출고가·납품가·할인율 판정을 받을 수 있다. 설정이 없으면 현행은 가격을 판정하지 않는다.

### ⑤ 업무 확인

**🚨 업무 확인 필요 — 최우선.** 2026-07-01 경계가 지금도 유효한지, 가격 기준은 전표일·수동 인상 전 선택·카테고리 기본 variant 중 무엇인지 확인해야 한다.

---

## R-04. 부속 가격 찾기와 1WAY의 역할

### ① 레거시 규칙

`tools/legacy-gas/일마감 프로그램/Code.js:502-539`

```js
if (rawName.indexOf('유연호스') > -1) {
    isAccSearch = true;
    if (rawName.indexOf('1WAY') > -1) accKeywords = ['유연호스', '1WAY'];
    else if (rawName.indexOf('4WAY') > -1) accKeywords = ['유연호스', '4WAY'];
    else if (rawName.indexOf('I형') > -1 || rawName.indexOf('I') > -1) accKeywords = ['유연호스', 'I형'];
}
// UNKNOWN 가격표의 key가 모든 키워드를 포함하면 그 가격 사용
```

여기서 `1WAY`는 창고가 아니라 **유연호스 종류를 골라 가격을 찾는 부속 키워드**다. 방진가대도 `소`·`중` 키워드로 찾는다.

### ② 우리 구현

`.claude/worktrees/wdc/services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/MonthEndCloseService.java:429-459,483-495`

```java
Map<String, ProductLabelMatch> labelMatches = resolveProductLabels(labels);
Map<String, ProductSummary> modelSummaries = resolveProductSummaries(byModel.keySet());
ProductLabelMatch labelMatch = effectiveProductMatch(axisKey, labelMatches, modelMatches);
ApplicablePrice price = labelMatch.isMatched() && priceDate != null
        ? pricesByAxis.get(new PriceLookupKey(productId, priceDate)) : null;
```

현행은 품명/모델을 product-service 상품에 해소한 뒤 상품 ID의 가격 이력을 쓴다. 일마감 경로에는 `['유연호스','1WAY']`·방진가대 크기 키워드로 가격 후보를 순회하는 규칙이 없다.

### ③ 판정

**다름** — 1WAY의 업무 의미를 창고로 오해하지는 않지만, 레거시의 부속 키워드 가격 탐색 자체는 상품 식별자 조회로 바뀌었다.

### ④ 사용자 차이

레거시에서 키워드로 찾던 유연호스·방진가대가 상품 라벨/모델로 정확히 해소되지 않으면 현행은 가격·판정을 못 내거나 다른 상품을 고를 수 있다.

### ⑤ 업무 확인

**🚨 업무 확인 필요 — 1WAY 중점.** 1WAY·4WAY·I형 유연호스와 방진가대 소/중이 현재 상품 마스터에서 각각 유일한 상품으로 식별되는지, 키워드 fallback이 아직 필요한지 확인해야 한다.

---

## R-05. 할인율과 총계 계산

### ① 레거시 규칙

`tools/legacy-gas/일마감 프로그램/Code.js:551-561`

```js
var price = pData.price;
var unit = money_to_int_(item['단가(VAT포함)']);
var qty = money_to_int_(item['수량']);
var rate = price ? (1 - (unit / price)) : 0;
item['할인율'] = rate;
item['총계'] = unit * qty;
```

### ② 우리 구현

`.claude/worktrees/wdc/services/slip-service/src/main/java/com/samhanair/logis/slip/web/dto/DailyClosingRowResponse.java:72-86`

```java
BigDecimal grandTotal = unitPriceWithVat.multiply(BigDecimal.valueOf(line.getQuantity()));
discountRate = BigDecimal.ONE.subtract(unitPriceWithVat.divide(productPrice, 8, RoundingMode.HALF_UP))
        .multiply(BigDecimal.valueOf(100)).setScale(0, RoundingMode.HALF_UP);
```

상세 재검증도 `(공급가액+세액)/수량`을 VAT 포함 유효단가로 만들고 동일한 `1-단가/출고가`를 반올림한다(`.claude/worktrees/wdc/services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/MonthEndCloseService.java:403-412`, `.claude/worktrees/wdc/services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/DiscountRevalidator.java:285-294`).

### ③ 판정

**동일** — VAT 포함 단가 기준 할인율과 단가×수량 총계 공식이 같다.

### ④ 사용자 차이

같은 출고가·VAT 포함 단가·수량이 전달되면 할인율과 총계는 같다. 원천 가격이 달라지는 차이는 R-03·R-04에 따른다.

### ⑤ 업무 확인

**🚨 업무 확인 필요 — 금액.** 할인율의 분모인 출고가가 VAT 포함 기준인지, 정수 % 반올림이 계속 유효한지 확인해야 한다.

---

## R-06. 단가·할인율·출고가 양방향 수정과 VAT 분리

### ① 레거시 규칙

`tools/legacy-gas/일마감 프로그램/Index.html:1203-1237`

```js
if (changedField === 'unit') rowData['할인율'] = price ? (1 - (unit / price)) : 0;
else if (changedField === 'rate') rowData['단가(VAT포함)'] = Math.round(price * (1 - rate));
else if (changedField === 'price') rowData['할인율'] = price ? (1 - (unit / price)) : 0;
rowData['합계'] = unit * qty;
rowData['공급가액'] = Math.round(unit / 1.1);
rowData['부가세'] = unit - rowData['공급가액'];
```

### ② 우리 구현

`.claude/worktrees/wdc/clients/desktop/src/renderer/routes/DailyClosingPage.tsx:386-410`

```ts
if (changedField === 'unit') next.rate = next.price ? (1 - next.unit / next.price) * 100 : 0
else if (changedField === 'rate') next.unit = Math.round(next.price * (1 - next.rate / 100))
else next.rate = next.price ? (1 - next.unit / next.price) * 100 : 0
const supply = Math.round(next.unit / 1.1)
return { ...next, supply, vat: next.unit - supply, total: next.unit }
```

화면 공식은 같다. 하지만 저장은 출고전표 세 상태만 허용하고, 회계전표가 있거나 마감일이 잠기면 차단한다(`.claude/worktrees/wdc/services/slip-service/src/main/java/com/samhanair/logis/slip/service/DailyClosingAmountUpdateService.java:58-70`). 또한 화면은 dirty 행마다 라인 하나만 보내지만 서비스는 요청 라인 수와 전표 전체 라인 수가 같아야 한다(`.claude/worktrees/wdc/clients/desktop/src/renderer/routes/DailyClosingPage.tsx:562-569`, `.claude/worktrees/wdc/services/slip-service/src/main/java/com/samhanair/logis/slip/service/DailyClosingAmountUpdateService.java:73-84`).

### ③ 판정

**다름** — 계산 공식은 같지만 수정 가능 조건과 다라인 전표 저장 계약이 레거시와 다르다.

### ④ 사용자 차이

레거시에서 즉시 고치던 행이 현행에서는 회계반영·마감잠금·상태 또는 다라인 계약 때문에 저장되지 않을 수 있다.

### ⑤ 업무 확인

**🚨 업무 확인 필요 — 최우선.** 공급가/부가세를 단가 기준으로 표시하는 레거시 산식과, 어떤 상태·다라인 범위까지 실제 전표 금액을 수정할 수 있어야 하는지 확인해야 한다.

---

## R-07. 품목 고정DC → 거래처 홈/상업 DC → 45% 기본값

### ① 레거시 규칙

`tools/legacy-gas/일마감 프로그램/Code.js:718-731`

```js
if (item._fixedDc != null) expectRate = Math.round(item._fixedDc * 100);
else if (item._zone === 'COMM_MULTI') expectRate = Math.round((discInfo.commRate || 0.45) * 100);
else if (item._zone === 'HOME_MULTI') expectRate = Math.round((discInfo.homeRate || 0.45) * 100);
else expectRate = 45;
item['확인'] = (actualRate === expectRate);
```

### ② 우리 구현

`.claude/worktrees/wdc/services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/MonthEndCloseService.java:460-474`, `.claude/worktrees/wdc/services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/DiscountRevalidator.java:231-249`

```java
// partnerCode로 전역DC 조회
GlobalDiscount.found(result.homeRate(), result.commercialRate(), ...)
// ...
if (fixedDc != null) return roundPercent(fixedDc);
if (globalDiscount == null || !globalDiscount.available()) return null;
BigDecimal rate = home ? globalDiscount.homeRate() : globalDiscount.commercialRate();
return rate == null ? 45 : roundPercent(rate.multiply(ONE_HUNDRED));
```

우선순위는 같지만, 전역DC 조회 실패/미등록은 레거시 45% fallback과 달리 `MISSING_GLOBAL_DISCOUNT`로 판정 불가다.

### ③ 판정

**확인 불가** — 코드 우선순위는 대응하지만 운영 전역DC 값의 동등성을 조회하지 않았고, 미등록/장애 fallback은 다르다.

### ④ 사용자 차이

정상 매핑된 거래처는 같은 기대율을 볼 수 있다. 전역DC가 없거나 조회가 실패하면 레거시는 45%로 판정하고 현행은 판정불가가 된다.

### ⑤ 업무 확인

**🚨 업무 확인 필요 — 최우선.** Notion DC와 현행 전역DC의 거래처별 값이 같은지, 미설정·조회 실패 때 45%를 적용할지 판정을 중단할지 확인해야 한다.

---

## R-08. 싱글 세트 구성품 pool·옵션 DC·수량 소비

### ① 레거시 규칙

`tools/legacy-gas/일마감 프로그램/Code.js:568-659`

```js
var qty = money_to_int_(item['수량']) || 1;
for (var q = 0; q < Math.abs(qty); q++) pool.push(...);
cands.sort(function(a, b) { return catalog.setToComps[b].length - catalog.setToComps[a].length; });
// 필수 실내기·실외기와 존재 옵션을 찾고
var finalExpectedPrice = expectedPriceSum - discount;
if (Math.abs(invoicePriceSum) === Math.abs(finalExpectedPrice)) matchedPoolIdxs.forEach(...used = true);
```

360·4way·1way·스탠드·디럭스·1등급 정액 DC 중 세트코드에 해당하는 하나를 차감한다(`tools/legacy-gas/일마감 프로그램/Code.js:619-650`).

### ② 우리 구현

`.claude/worktrees/wdc/services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/LegacySetMatcher.java:28-67,74-120`, `.claude/worktrees/wdc/services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/MonthEndCloseService.java:576-617,752-765`

```java
list.sort(Comparator.comparingInt((SetCandidate c) -> c.components().size()).reversed());
// 실내기·실외기, 존재 옵션을 scope 안에서 소비
BigDecimal discount = globalDiscount.discountForSet(candidate.setName());
BigDecimal finalExpected = expected.subtract(discount.abs());
if (invoice.abs().compareTo(finalExpected.abs()) != 0) return Optional.empty();
```

0수량은 1, 음수는 절댓값 수량으로 확장하고 sourceKey별 total/used를 기록한다.

### ③ 판정

**동일** — 후보 정렬, 필수 본체, 존재 옵션, 정액 DC 1회 차감, 절댓값 금액 비교, 수량별 사용 여부가 대응한다.

### ④ 사용자 차이

같은 세트 카탈로그·납품가·전역DC가 공급되면 구성품 완전소비와 확인 결과가 같다.

### ⑤ 업무 확인

**🚨 업무 확인 필요 — 금액/1WAY.** 6종 옵션 DC와 세트 구성표가 현재 설치·판매 관행에 유효한지, 특히 1WAY가 세트 옵션 정액 DC와 유연호스 부속 키워드에서 서로 다른 역할을 갖는 것이 맞는지 확인해야 한다.

---

## R-09. 할인제외 품목은 세트 정액 DC를 적용하지 않음

### ① 레거시 규칙

`tools/legacy-gas/일마감 프로그램/Code.js:603-624`

```js
var isExcl = false;
reqComps.forEach(function(rc) {
  var nm = rc.raw.toUpperCase();
  if (discInfo.excl.some(function(ex) { return nm.indexOf(ex) > -1; })) isExcl = true;
});
var discount = 0;
if (!isExcl) { /* 옵션별 정액 DC 선택 */ }
```

### ② 우리 구현

`.claude/worktrees/wdc/services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/DiscountRevalidator.java:355-399`

```java
public record GlobalDiscount(boolean available, BigDecimal homeRate, BigDecimal commercialRate,
    BigDecimal discount360Amount, BigDecimal discount4WayAmount,
    BigDecimal discount1WayAmount, BigDecimal discountStandAmount,
    BigDecimal discountDeluxeAmount, BigDecimal discountFirstGradeAmount) { ... }
```

현행 전역DC 계약과 `LegacySetMatcher`에는 할인제외 품목 목록이나 구성품 raw 명칭 대조가 없다.

### ③ 판정

**없음** — 옵션 정액 DC는 있지만 할인제외 목록에 의한 차단은 찾지 못했다.

### ④ 사용자 차이

레거시에서 할인제외 구성품 때문에 DC 0원으로 검증되던 세트가 현행에서는 옵션 정액 DC가 차감된 금액을 기대할 수 있다.

### ⑤ 업무 확인

**🚨 업무 확인 필요 — 최우선.** 할인제외 품목 목록이 지금도 유효한지, 상품/세트 어느 단위로 관리해야 하는지 확인해야 한다.

---

## R-10. 구형 품목 50% 또는 납품가 일치

### ① 레거시 규칙

`tools/legacy-gas/일마감 프로그램/Code.js:668-682`

```js
} else if (item._isOld) {
  if (isMultiApplied === false) item['확인'] = true;
  else if (/^(AM|NJ|NS|AVX)/.test(item._token)) item['확인'] = (actualRate === 50);
  else item['확인'] = (unitPrice === item._deliveryPrice);
}
```

### ② 우리 구현

`.claude/worktrees/wdc/services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/LegacyVerificationChain.java:103-114`, `.claude/worktrees/wdc/services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/DiscountRevalidator.java:120-129`

```java
if (row.oldProduct()) {
    return OLD_RATE_TOKEN.matcher(token).matches() ? Branch.OLD_RATE_50 : Branch.OLD_DELIVERY;
}
case OLD_RATE_50 -> verified(integerEquals(actualRate, 50), 50, actualRate, ...);
case OLD_DELIVERY -> verified(integerWonEquals(effectiveUnitPrice, effectiveDeliveryPrice), ...);
```

### ③ 판정

**동일** — 구형 접두 50%와 그 밖의 납품가 일치 분기가 같다. 단, 미적용 토글 차이는 R-12에 분리했다.

### ④ 사용자 차이

같은 품목이 `OLD`로 분류되고 같은 가격 이력이 공급되면 확인 결과가 같다.

### ⑤ 업무 확인

**🚨 업무 확인 필요.** AM·NJ·NS·AVX 구형 50%와 나머지 구형 납품가 기준이 현재도 유효한지 확인해야 한다.

---

## R-11. 운임·절삭, 부속, 싱글 본체, 멀티의 판정 우선순위

### ① 레거시 규칙

`tools/legacy-gas/일마감 프로그램/Code.js:668-735`

```js
if (/(운임|절삭)/.test(item['품목명'])) item['확인'] = true;
else if (item._isOld) { ... }
else if (/(유연호스|발통세트|일자발|방진가대)/.test(item['품목명']) || /^AXJ/.test(item._token)) { ... }
else if (item._zone === 'SINGLE') { ... }
else if (item._zone === 'COMM_MULTI' || item._zone === 'HOME_MULTI' || /(멀티|MULTI)/i.test(item['품목명'])) { ... }
else item['확인'] = true;
```

### ② 우리 구현

`.claude/worktrees/wdc/services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/LegacyVerificationChain.java:98-130`

```java
if (FREIGHT_OR_CUTTING.matcher(itemName).find()) return FREIGHT_OR_CUTTING;
if (row.oldProduct()) ...
if (ACCESSORY_LABEL.matcher(itemName).find() || token.startsWith("AXJ")) ...
if (routed.zone() == Zone.SINGLE) ...
if (routed.zone() == Zone.COMM_MULTI || routed.zone() == Zone.HOME_MULTI
        || MULTI_LABEL.matcher(itemName).find()) ...
return DEFAULT;
```

### ③ 판정

**동일** — ordered `if/else-if` 우선순위가 같다.

### ④ 사용자 차이

한 행이 여러 키워드·모델 조건에 걸려도 먼저 걸린 분기가 같은 판정을 지배한다.

### ⑤ 업무 확인

**🚨 업무 확인 필요.** 운임·절삭 무조건 확인, 부속 우선 판정 등 이 순서가 현재 예외 정책과 맞는지 확인해야 한다.

---

## R-12. “멀티 할인율 미적용”이면 가격 검증을 통과시킴

### ① 레거시 규칙

`tools/legacy-gas/일마감 프로그램/Index.html:136-140`, `tools/legacy-gas/일마감 프로그램/Code.js:672-685,714-717`

```html
<div ...>멀티 할인율 미적용</div>
<div ...>멀티 할인율 적용</div>
```

```js
if (isMultiApplied === false) item['확인'] = true;
```

이 토글은 멀티뿐 아니라 구형·명시 부속 분기의 가격 검증도 `true`로 우회한다.

### ② 우리 구현

`.claude/worktrees/wdc/services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/MonthEndCloseService.java:671-699`

```java
LegacyVerificationChain.Branch branch = LegacyVerificationChain.branch(route, true);
```

현행 production 경로는 항상 `true`를 전달하며 `DailyClosingPage`에 적용/미적용 토글이 없다.

### ③ 판정

**없음** — 레거시의 검증 비활성 선택을 제공하지 않는다.

### ④ 사용자 차이

레거시에서 “미적용”으로 모두 확인 처리하던 날에도 현행은 DC·납품가·세트 검증을 수행하고 불일치/판정불가를 낼 수 있다.

### ⑤ 업무 확인

**🚨 업무 확인 필요 — 최우선.** 이 토글이 과거 임시 우회인지 지금도 필요한 마감 정책인지, 이름과 달리 구형·부속까지 우회하는 것이 의도인지 확인해야 한다.

---

## R-13. 음수 수량·반품 세트의 절댓값 비교

### ① 레거시 규칙

`tools/legacy-gas/일마감 프로그램/Code.js:571-573,650-655`

```js
var qty = money_to_int_(item['수량']) || 1;
var loopQty = Math.abs(qty);
var finalExpectedPrice = expectedPriceSum - discount;
if (Math.abs(invoicePriceSum) === Math.abs(finalExpectedPrice)) { ... }
```

### ② 우리 구현

`.claude/worktrees/wdc/services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/MonthEndCloseService.java:752-765`, `.claude/worktrees/wdc/services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/LegacySetMatcher.java:109-120`

```java
int quantity = line.quantity() == null || line.quantity().signum() == 0
        ? 1 : Math.abs(line.quantity().intValueExact());
BigDecimal finalExpected = expected.subtract(discount.abs());
if (invoice.abs().compareTo(finalExpected.abs()) != 0) return Optional.empty();
```

### ③ 판정

**동일** — 수량 0→1, 음수 수량 절댓값 확장, 금액 절댓값 비교가 같다.

### ④ 사용자 차이

같은 반품 세트는 부호와 무관하게 같은 구성·금액 일치 여부로 판정된다.

### ⑤ 업무 확인

**🚨 업무 확인 필요 — 금액.** 반품/취소를 양수 판매와 같은 절댓값 DC 규칙으로 검증하는 것이 회계 정책상 유효한지 확인해야 한다.

---

## R-14. 확인 판정의 riUsage 후처리

### ① 레거시 규칙

`tools/legacy-gas/일마감 프로그램/Code.js:690-713`

```js
if (!hasSingleMain && accessory) item['확인'] = true;
else if (accessory) {
  if (isUsed) item['확인'] = true;
  else if (hasFailedMain) item['확인'] = false;
  else item['확인'] = (unitPrice === item._deliveryPrice);
} else if (main) {
  item['확인'] = fullyUsed;
} else item['확인'] = true;
```

### ② 우리 구현

`.claude/worktrees/wdc/services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/LegacyVerificationChain.java:132-176`

```java
if (focusBranch == Branch.SINGLE_MAIN) return focusRows(...).stream().allMatch(...fullyConsumed...);
if (focusBranch == Branch.SINGLE_DEFAULT) return Boolean.TRUE;
// accessory: 본체 없음 true → 완전소비 true → 실패 본체 있으면 false → 납품가 비교
```

앞선 운임·구형·명시 부속·멀티 분기는 riUsage가 덮지 않는다.

### ③ 판정

**동일** — 본체/부속 소비 결과와 분기 우선순위가 같다.

### ④ 사용자 차이

세트에 완전히 소비된 본체·부속과 누락된 본체의 확인 결과가 같은 규칙으로 정해진다.

### ⑤ 업무 확인

**🚨 업무 확인 필요.** “본체 없는 부속은 무조건 확인”과 “실패 본체가 하나라도 있으면 미소비 부속 불일치”가 현재 검수 관행인지 확인해야 한다.

---

## R-15. 회계반영일자에 따른 결과·선발행 분리

### ① 레거시 규칙

`tools/legacy-gas/일마감 프로그램/Code.js:737-740`, `tools/legacy-gas/일마감 프로그램/Index.html:210-213`

```js
if (datePattern.test(String(item['회계반영일자']).trim())) pre.push(item);
else main.push(item);
```

`main`은 `결과`, `pre`는 `선발행` 탭이다. 즉 회계반영일자가 있으면 선발행이다.

### ② 우리 구현

`.claude/worktrees/wdc/clients/desktop/src/renderer/routes/DailyClosingPage.tsx:618-623,1263,1281-1285`

```ts
rows.filter((row) => tab === 'RESULT'
  ? Boolean(row.accountingPostedAt)
  : !row.accountingPostedAt)
```

`RESULT`는 회계반영일시가 있는 행, `PRE_ISSUED`는 없는 행을 보여준다.

### ③ 판정

**다름** — 탭 분류가 레거시와 반대다.

### ④ 사용자 차이

레거시에서 선발행으로 보던 행이 현행에서는 결과에 나오고, 아직 회계반영되지 않은 행이 선발행에 나온다.

### ⑤ 업무 확인

**🚨 업무 확인 필요 — 최우선.** “선발행”의 업무 정의가 회계전표가 이미 먼저 발행된 건인지, 아직 회계반영 전인 건인지 확정해야 한다.

---

## R-16. 매출전표 없는 거래처 표식

### ① 레거시 규칙

`tools/legacy-gas/일마감 프로그램/Code.js:444-468`

```js
pendingData.forEach(function(item) {
  var cleanCode = String(item.code || '').replace(/[^\d]/g, '');
  if (cleanCode) dynamicNoSalesMap[cleanCode] = item.date;
});
if (dynamicNoSalesMap[codeKey] && !hasDate) {
  obj['회계반영일자'] = '매출전표X - ' + dynamicNoSalesMap[codeKey];
}
```

특이사항에 등록한 거래처가 회계반영일자가 없으면 날짜 대신 `매출전표X - ...`를 넣는다. 이 문자열은 유효 날짜가 아니므로 결과(main)에 남는다.

### ② 우리 구현

현행 `.claude/worktrees/wdc/services/slip-service/src/main/java/com/samhanair/logis/slip/service/DailyClosingSourceResolver.java:22-32`는 회계 `postedAt`을 조회해 미확보 사유만 반환하고, `DailyClosingPage`·관련 서비스에서 거래처별 “매출전표X” 등록 목록이나 대체 문자열 규칙을 찾지 못했다.

### ③ 판정

**없음** — 거래처별 미발행 예정/특이사항 표식이 없다.

### ④ 사용자 차이

레거시에서 “이 거래처는 매출전표가 없는 예정 건”으로 구분하던 행이 현행에서는 단순 미반영/원천 미확보로 보인다.

### ⑤ 업무 확인

**🚨 업무 확인 필요.** 이 목록이 현재도 일마감 예외관리의 정본인지, `매출전표X`가 오류·예정·면제 중 무엇을 의미하는지 확인해야 한다.

---

## R-17. 전표별 소계와 화면 합계의 집계 축

### ① 레거시 규칙

`tools/legacy-gas/일마감 프로그램/Index.html:1061-1095,1155-1194`

```js
let k = d['일자'] + '_' + d['번호'];
groupSums[k].qty += Number(d['수량']) || 0;
groupSums[k].supply += Number(d['공급가액']) || 0;
groupSums[k].vat += Number(d['부가세']) || 0;
groupSums[k].sum += Number(d['합계']) || 0;
```

필터 후 행을 일자+번호로 소계하고, 화면 합계는 필터 후 모든 행을 합산한다. 단가·출고가·할인율도 단순 합산한다.

### ② 우리 구현

`.claude/worktrees/wdc/clients/desktop/src/renderer/routes/DailyClosingPage.tsx:624-639,659-709`

```ts
const key = row.slipDate + '_' + row.seqNo
const summary = summaryRows.reduce((sum, row) => ({
  quantity: sum.quantity + amount.quantity,
  unit: sum.unit + amount.unit,
  supply: sum.supply + amount.supply,
  vat: sum.vat + amount.vat,
  total: sum.total + amount.total,
  price: sum.price + amount.price,
  rate: sum.rate + amount.rate,
  grand: sum.grand + amount.grand,
}), ...)
```

### ③ 판정

**동일** — 일자+전표번호 소계와 표시 행 단순 합계 축이 같다.

### ④ 사용자 차이

같은 탭에 같은 행이 들어오면 소계·합계의 묶음과 더하기 방식은 같다. 탭 자체의 행 구성 차이는 R-15다.

### ⑤ 업무 확인

**🚨 업무 확인 필요 — 금액.** 단가·출고가·할인율을 수량가중 평균이 아니라 단순 합으로 보여주는 것이 지금도 유효한 집계인지 확인해야 한다.

---

## R-18. 재업로드 때 전표 변경 횟수 누적

### ① 레거시 규칙

`tools/legacy-gas/일마감 프로그램/Index.html:921-940`

```js
let cols = ['품목명', '창고명', '수량', '단가(VAT포함)', '할인율', '총계', '거래처코드'];
if (s1 !== s2) invoiceModCounts[k] = (invoiceModCounts[k] || 0) + 1;
```

같은 일자+번호 전표의 핵심 열이 재처리 때 달라지면 횟수를 누적하고 번호 셀 색을 1·2·3회 이상으로 바꾼다(`tools/legacy-gas/일마감 프로그램/Index.html:1109-1115`).

### ② 우리 구현

현행은 `updatedAt` 낙관적 잠금과 수정 감사로그를 저장하지만(`.claude/worktrees/wdc/services/slip-service/src/main/java/com/samhanair/logis/slip/service/DailyClosingAmountUpdateService.java:71-105,122-129`), 일마감 화면에서 같은 전표의 재조회 변경 횟수를 비교·누적하는 규칙은 찾지 못했다.

### ③ 판정

**없음** — 동시수정 충돌 감지는 있으나 레거시의 전표 변경 횟수 규칙은 없다.

### ④ 사용자 차이

사용자는 현행에서 다른 사용자가 먼저 수정한 충돌은 알 수 있지만, 같은 전표가 일마감 재처리 중 몇 번 바뀌었는지는 번호 색으로 알 수 없다.

### ⑤ 업무 확인

**🚨 업무 확인 필요.** 변경 횟수 색상이 실제 검수 우선순위를 정하는 현행 업무 규칙인지, 과거 편의 기능인지 확인해야 한다.

---

## R-19. 저장의 의미, 중복 처리, 잠금과 역마감

### ① 레거시 규칙

`tools/legacy-gas/일마감 프로그램/Index.html:953-960`, `tools/legacy-gas/일마감 프로그램/Code.js:752-820`

```js
google.script.run.autoSaveToNotion(JSON.stringify(toSave), ...);
```

처리 완료 뒤 결과 JSON을 Notion 이력으로 저장한다. `processDailyData`와 저장 함수에는 업무 전표 잠금, 같은 날짜 재마감 충돌, 역마감 상태 전이가 없다.

### ② 우리 구현

`.claude/worktrees/wdc/services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/DailyClosingService.java:149-175`, `.claude/worktrees/wdc/services/accounting-service/src/main/java/com/samhanair/logis/accounting/domain/DailyClosing.java:178-233`

```java
// 같은 날짜·범위·종류·원천 snapshot 조회 또는 생성
if (closing.isLocked()) closing.lock(actorUserId); // CONFLICT
closing.recalculate(...);
closing.lock(actorUserId);
```

잠긴 동일 범위 재마감은 충돌이고, 역마감은 `isLocked=true→false`로 바꾸며 잠금자/시각은 보존한다. 실행과 역마감은 별도 동적 권한 코드를 쓴다(`.claude/worktrees/wdc/services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/DailyClosingService.java:71-76,294-326`).

### ③ 판정

**다름** — 레거시의 “저장”은 결과 이력 보존이고, 현행은 집계 snapshot 잠금·재마감 방지·역마감 상태 머신이다.

### ④ 사용자 차이

레거시는 같은 자료를 다시 처리·저장할 수 있지만, 현행은 잠긴 같은 범위를 다시 실행하면 충돌하고 권한 있는 사용자가 역마감해야 한다.

### ⑤ 업무 확인

**🚨 업무 확인 필요 — 최우선.** 일마감이 단순 검수 결과 저장인지 회계 선행 잠금인지, 재마감은 거부·재계산·새 이력 중 무엇이어야 하는지, 역마감 시 감사정보 보존 규칙을 확인해야 한다.

---

## R-20. 회계 반영과 마감 실행 게이트

### ① 레거시 규칙

`tools/legacy-gas/일마감 프로그램/Code.js:463-468,737-744`

```js
var hasDate = /^\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2}$/.test(String(obj['회계반영일자']).trim());
// ... 날짜 유무로 main/pre 분류
return { status: 'success', main: main, pre: pre, sum: main.concat(pre) };
```

레거시는 이미 들어온 회계반영일자를 읽어 분류할 뿐, 이 프로그램에서 회계전표를 생성하거나 `확인=false`를 근거로 실행을 차단하지 않는다.

### ② 우리 구현

`.claude/worktrees/wdc/services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/DailyClosingVerificationService.java:23-38,41-68`

```java
boolean verified = detail.productSummaries().stream().allMatch(this::isVerified);
return verified ? VerificationResult.verified() : VerificationResult.amountMismatch();
// 회계전표 생성 전에는 잠긴 일마감 snapshot 요구
if (closing == null || !closing.isLocked()) return VerificationResult.closingNotFound();
```

`DailyClosingService.close`는 검증이 허용되지 않으면 409로 막고(`.claude/worktrees/wdc/services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/DailyClosingService.java:142-147`), 매출·매입 회계전표 생성 경로는 잠긴 일마감을 요구한다.

### ③ 판정

**다름** — 레거시는 회계 반영 결과를 읽는 검수 도구이고, 현행은 금액 검증→일마감 잠금→회계전표 생성의 선행 게이트다.

### ④ 사용자 차이

현행에서는 한 품목이라도 불일치·판정불가이면 일마감이 실패하고, 잠긴 일마감이 없으면 회계전표 생성도 막힐 수 있다. 레거시는 불일치 행을 보여주되 처리 결과를 만들었다.

### ⑤ 업무 확인

**🚨 업무 확인 필요 — 최우선.** `확인=false/null`을 일마감·회계전표 생성의 차단 조건으로 쓸지, 경고만 할지, 선발행 전표가 이 순서에서 어떤 예외인지 확인해야 한다.

---

## 정찰 범위와 미확인 영역

### 끝까지 본 범위

- 레거시 `Code.js` 전체 1,034행과 `Index.html` 전체 1,948행을 함수·이벤트 목록, 가격/DC/확인/회계반영/저장 키워드로 전수 검색했다. 핵심 실행 함수 `processDailyData` 420-749행과 입력·편집·집계·재분류 경로를 전문 대조했다.
- `wdc`의 `DailyClosingPage.tsx`, `closingApi.ts`, `accounting.ts` 일마감 API, slip-service의 원본행 조회·원천 해소·금액 수정, accounting-service의 일마감 실행·검증·상세 집계·DC 재검증·ordered branch·세트 매칭·잠금 엔티티를 대조했다.
- 다른 GAS 프로그램은 조사하지 않았다. 앞선 주문서·종합견적서 보고서는 형식과 판정 기준만 참조했다.

### 규칙에서 제외한 것

- 색상, 열 너비, sticky header, 필터 팝업, 정렬, 이미지 복사, Excel 서식처럼 값의 업무 의미를 바꾸지 않는 표시·포맷 코드
- Notion HTTP adapter, 압축/분할 저장, 재시도처럼 저장 내용 자체를 결정하지 않는 전송 기술
- 테스트·QA fixture에만 있고 production 호출 경로에 없는 값

### 확인하지 못한 것

- Google Sheet의 현재 가격표·싱글 구성표와 product-service 가격 이력·bundle 카탈로그가 행 단위로 같은지
- Notion 거래처 DC/할인제외 목록과 현행 전역DC 운영값이 같은지. 공유 DB 조회는 수행하지 않았다.
- 실제 운영 전표에서 세 상태 필터, 1WAY 유연호스, 할인제외 세트, 음수 반품, 선발행이 각각 몇 건·얼마인지
- PR #1219 `wdc` 코드를 실행한 라이브 화면·API 결과. 이번 라운드는 정적 대조이며 서비스 재배포·재생성·DB write를 하지 않았다.
- 레거시 원격 배포본과 저장소 사본의 바이트 동일성. 저장소에 지정된 두 파일을 정본으로 대조했다.

## 업무 확인 우선순위(수정 제안 아님)

1. 일마감 대상 상태와 원천: 이카운트 행 / 출고전표 / ISSUED 세금계산서 / POSTED 회계전표
2. 금액: 가격 기준일·variant, VAT 포함 출고가, 단가↔할인율, 수정 가능한 상태·다라인 범위
3. DC: 전역DC 미설정 fallback, 할인제외 품목, 6종 옵션 정액, 구형 50%
4. 1WAY: 유연호스 부속 키워드와 세트 옵션 정액 DC라는 두 역할
5. 선발행의 정의와 `결과`/`선발행` 탭 분류
6. 일마감의 법적·업무적 의미: 검수 저장 / 잠금 / 회계전표 생성 게이트 / 재마감·역마감
