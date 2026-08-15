# 남은 대체완료 GAS 업무 규칙 패리티 정찰

- 정찰일: 2026-08-15
- 정찰자: CODEX SOL
- 질문: **“앞선 네 정찰에서 다루지 않은 대체완료 GAS 중 업무 비중이 큰 프로그램의 값 결정 규칙이 우리 시스템에 그대로 있는가?”**
- 안전 조건: 정적 소스 대조만 수행했다. 공유 DB·GAS·서비스에 쓰지 않았고, Git 쓰기·배포·프로세스 제어를 하지 않았다.

## 대상 선정 이유

`docs/dev-reports/2026-08-15-gas-programs-coverage-survey.md`의 `✅ 대체완료` 17개에서 앞서 조사한 일마감과 데이터 원천 4종의 적용 경로를 제외했다. 가입고처리는 #1225가 이미 정찰했고, 에어디자이너·제이시스템 OCR은 개발책임자가 불필요로 확정했으므로 제외했다.

남은 프로그램 가운데 다음 4개를 골랐다.

| 프로그램 | 선정 이유 |
|---|---|
| 거래처별 원장생성 프로그램 | 매출·입금·조정·이월잔액을 합쳐 거래처 채권 잔액을 결정한다. 잘못되면 거래처에 안내하는 미수금이 달라진다. |
| 거래처별 일괄 거래명세서 생성 | 거래처별 공급가액·부가세·합계와 발송 대상을 결정한다. 일상 출고·정산 업무에 직접 닿는다. |
| 계산서일괄등록양식 생성 | 홈택스 발행 대상, 작성일자, 공급가액·세액, 제외 대상을 결정한다. 세무 자료에 직접 닿는다. |
| 영업수수료 계산 | 카드수수료·제경비·원천징수·도급비·VAT·지급액을 계산한다. 네 후보 중 금액 산식 밀도가 가장 높다. |

배차 계열도 업무 비중이 크지만, 이번 라운드는 개발책임자가 강조한 “금액에 닿는 규칙 우선”에 따라 회계 4종을 먼저 골랐다. 앞선 데이터 원천 보고서가 원장·거래명세서의 단톡방 매칭만 다뤘으므로, 여기서는 그 내용을 중복 집계하지 않고 원장 잔액·문서 대상·금액·세무·수수료 규칙을 대조했다.

## 결론 요약

**그대로 있지 않다.** 규칙 22개를 대조한 결과는 **동일 8 · 다름 12 · 없음 2 · 확인 불가 0**이다.

- 원장은 레거시 채권 파일의 기초채권과 업로드 기간을 기준으로 계산하지만, 현행은 canonical 출고전표와 POSTED 분개를 1900-01-01부터 접어 기초·기말을 만든다. 레거시의 최근 20건 제한과 생략분 이월 규칙은 현행에 없다.
- 거래명세서는 레거시가 양수 채권 거래처의 선택된 판매행을 일자·전표별로 만들지만, 현행은 `ISSUED` 세금계산서를 거래처별 묶음으로 반환한다. 공급가액+VAT 합계 공식은 같지만 대상과 문서 단위가 다르며 현행은 음수 공급가·세액을 허용하지 않는다.
- 홈택스 양식은 회계반영일 미전표 제외, 공급가·세액 pass-through, 청구 `02`, 100건 분할은 같다. 작성일자, 공급자 정보의 권위, 거래처명 정제, 제외 키는 다르다.
- 영업수수료 계산기와 v1 요율은 레거시 산식과 같다. 그러나 production controller와 현재 상세 화면에는 계산 입력·실행 경로가 없고, DRAFT 생성·조회·확정만 노출된다.

이 문서는 코드 차이를 업무 정책의 정답으로 간주하지 않는다. 코드에 남아 있다는 이유만으로 현재 유효한 업무 규칙이라고 확정할 수 없다. 아래 모든 항목의 `⑤ 업무 확인`이 최종 판단 게이트다.

## 판정 기준

- **동일**: 확인한 입력·조건·계산 순서·결과가 소스상 같다.
- **다름**: 같은 목적의 구현이 있으나 원천·대상·조건·계산·결과가 다르다.
- **없음**: 현행 사용자 또는 production 저장·조회 경로에서 대응 규칙을 찾지 못했다.
- **확인 불가**: 정적 코드만으로 결과를 확정할 수 없는 경우다. 이번 22개는 운영값이 필요한 부분을 별도 규칙으로 분리해 이 판정을 쓰지 않았다.

---

## R-01. 원장 대상 기간과 자료 원천

### ① 레거시 규칙

`tools/legacy-gas/거래처별 원장생성 프로그램/Index.html:606-638`

```js
let startDate = new Date();
startDate.setMonth(startDate.getMonth() - 1);
startDate.setDate(1);
let endDate = new Date();
// 채권 파일 앞 3행의 두 날짜가 있으면 그 기간으로 대체
let salesF = dfSales.filter(r => r._dt && r._dt >= startDate && r._dt <= endDate);
let receiptF = dfReceipt.filter(r => r._dt && r._dt >= startDate && r._dt <= endDate);
```

판매·수금 업로드 행을 채권 파일의 기간으로 자른다.

### ② 우리 구현

`services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/PartnerLedgerReadModelService.java:112-119,169-172`

```java
List<PartnerLedgerSalesClient.Sale> openingSales = findOpeningSales(
        from, targetSale, selectedSummary, selectedId);
Map<UUID, BigDecimal> openingBalances = openingBalances(
        from, targetSale, selectedSummary, selectedId, accountCodes, openingSales);
List<JournalLineRepository.PartnerAccountTotal> journalTotals =
        journalLineRepository.aggregatePostedOnlyByPartnerAccount(from, to);
List<PartnerLedgerSalesClient.Sale> sales = canonicalSales(
        findSales(from, to, selectedSummary, selectedId));
```

현행은 API의 `from/to`, canonical 출고전표, POSTED 분개를 원천으로 쓴다.

### ③ 판정

**다름** — 파일에 적힌 기간과 네 종류 업로드 자료를 쓰는 규칙이 내부 출고전표·분개 조회로 바뀌었다.

### ④ 사용자 차이

같은 날짜를 골라도 이카운트 파일에만 있거나 내부 전표·분개에만 있는 행은 원장 포함 여부가 달라진다.

### ⑤ 업무 확인

**🚨 업무 확인 필요 — 최우선.** 원장의 정본이 이카운트 판매·수금·채권·계정별원장 파일인지, 내부 출고전표와 POSTED 분개인지 확인해야 한다.

---

## R-02. 기초잔액과 기말잔액 계산

### ① 레거시 규칙

`tools/legacy-gas/거래처별 원장생성 프로그램/Index.html:678-680,724-739`

```js
let baseVal = bRows.length > 0 ? bRows[0]._base : 0.0;
let carryBase = baseVal;
if (items.length > maxItems) {
  let omit = items.slice(0, items.length - maxItems);
  itemsShow = items.slice(items.length - maxItems);
  omit.forEach(o => carryBase += o.sale - o.recv);
}
let curBal = carryBase;
itemsShow.forEach(it => { curBal += it.sale - it.recv; });
```

채권 파일 첫 행의 기초채권에 생략 매출을 더하고 수금을 빼 기말잔액을 만든다.

### ② 우리 구현

`shared/common/src/main/java/com/samhanair/logis/common/ledger/PartnerLedgerContract.java:99-120`

```java
if (entry.effect() == Effect.SALE) sales = sales.add(entry.amount());
if (entry.effect() == Effect.PAYMENT) payments = payments.add(entry.amount());
if (entry.effect() == Effect.ADJUSTMENT) adjustments = adjustments.add(entry.amount());
BigDecimal opening = openingBalance == null ? BigDecimal.ZERO : openingBalance;
delta = sales.add(adjustments).subtract(payments);
return new Totals(opening, sales, payments, adjustments, delta, opening.add(delta));
```

기초잔액은 `services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/PartnerLedgerReadModelService.java:436-505`에서 1900-01-01부터 기준일 전 canonical 판매와 POSTED 분개를 접어 만든다.

### ③ 판정

**다름** — `기초 + 매출 - 입금` 축은 남았지만 기초잔액 원천과 조정분개 포함이 다르다.

### ④ 사용자 차이

채권 파일의 기초채권과 내부 누적 분개가 다르면 같은 기간의 시작·최종잔액이 달라진다. 현행은 조정분개도 별도 효과로 기말에 반영한다.

### ⑤ 업무 확인

**🚨 업무 확인 필요 — 최우선.** 기초잔액을 업로드 채권 잔액으로 고정할지 내부 원장을 누적할지, 조정분개를 거래처 안내 잔액에 포함할지 확인해야 한다.

---

## R-03. 계정코드별 매출·입금 방향

### ① 레거시 규칙

`tools/legacy-gas/거래처별 원장생성 프로그램/Index.html:700-709`

```js
if (lr.account === '9199') sAmt = lr.credit;
else if (lr.account === '9549') rAmt = lr.debit;
else if (lr.account === '1089') { sAmt = lr.debit; rAmt = lr.credit; }
```

계정코드 `9199`, `9549`, `1089`를 하드코딩해 매출·수금 방향을 정한다.

### ② 우리 구현

`services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/PartnerLedgerReadModelService.java:774-789`

```java
.filter(account -> namedLeaf(account, AccountCategory.ASSET, "외상매출금"))
// ...
.filter(account -> namedLeaf(account, AccountCategory.REVENUE, "상품매출"))
// ...
.filter(account -> namedLeaf(account, AccountCategory.LIABILITY, "외상매입금"))
```

현행은 계정과목 chart의 분류·이름으로 채권·매출·매입 계정 집합을 해소하고 collection contract로 분개를 분류한다.

### ③ 판정

**다름** — 고정 코드 세 개와 동적 계정과목 집합의 판정 기준이 다르다.

### ④ 사용자 차이

계정코드가 바뀌거나 같은 이름의 leaf가 추가되면 현행과 레거시의 매출·입금·조정 반영 방향이 달라질 수 있다.

### ⑤ 업무 확인

**🚨 업무 확인 필요.** 세 고정 코드가 아직 정본인지, 계정과목 이름·분류를 정본으로 삼는 것이 맞는지 확인해야 한다.

---

## R-04. 최근 N건 제한과 생략분 이월

### ① 레거시 규칙

`tools/legacy-gas/거래처별 원장생성 프로그램/Index.html:674-675,724-730`

```js
let maxItems = parseInt(document.getElementById('max_items').value) || 20;
if (items.length > maxItems) {
  let omit = items.slice(0, items.length - maxItems);
  itemsShow = items.slice(items.length - maxItems);
  omit.forEach(o => carryBase += o.sale - o.recv);
}
```

기본 최근 20건만 상세로 보이고, 앞선 행의 순효과는 이월잔액에 합친다.

### ② 우리 구현

`services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/PartnerLedgerReadModelService.java:401-420`은 전체 `group.documents`를 정렬해 그대로 `entries`로 접는다. production 원장 서비스와 `PartnerLedgerPage`에서 최근 N건을 잘라 기초로 넘기는 규칙을 찾지 못했다.

### ③ 판정

**없음** — 최근 20건 제한과 생략분 이월 규칙이 없다.

### ④ 사용자 차이

레거시는 긴 원장을 최근 N건과 이월 한 줄로 축약하지만 현행은 조회기간의 문서를 모두 상세로 낸다.

### ⑤ 업무 확인

**🚨 업무 확인 필요.** 최근 20건이 실제 거래처 발송 문서 제한인지 과거 이미지 크기 제약인지 확인해야 한다.

---

## R-05. 원장 생성 대상 거래처

### ① 레거시 규칙

`tools/legacy-gas/거래처별 원장생성 프로그램/Index.html:713-744,747-760`

```js
if (!isForced && items.length === 0 && Math.abs(baseVal) < 0.5) continue;
if (showOnlyBalance) {
  if (curBal <= 0.5) continue;
}
// ...
if (!isForced && !roomName && !phonePick) continue;
```

강제 코드가 아니면 활동/잔액과 단톡방 또는 전화번호 조건을 통과해야 한다.

### ② 우리 구현

`services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/PartnerLedgerReadModelService.java:210-217`

```java
for (MutablePartner group : groups.values()) {
    PartnerSummary summary = summaries.get(group.partnerId);
    if (summary != null && isActive(summary)) {
        result.add(freeze(group, summary, openingBalances.getOrDefault(group.partnerId, BigDecimal.ZERO)));
    }
}
```

현행 read model은 활성 거래처와 원장 근거로 결과를 만들며 잔액 `0.5`·수신처 유무를 생성 게이트로 쓰지 않는다.

### ③ 판정

**다름** — 레거시의 잔액·수신 가능 조건이 현행 활성 거래처 기준으로 바뀌었다.

### ④ 사용자 차이

잔액이 없거나 수신처가 없는 거래처도 현행 원장 조회에는 나타날 수 있고, 레거시에서는 자동 생성 대상에서 빠질 수 있다.

### ⑤ 업무 확인

**🚨 업무 확인 필요.** “원장 조회 가능”과 “거래처 발송용 원장 생성 대상”을 같은 집합으로 볼지 확인해야 한다.

---

## R-06. 거래명세서 대상 원천과 상태

### ① 레거시 규칙

`tools/legacy-gas/거래처별 일괄 거래명세서 생성/Index.html:690-708,710-735`

```js
let bal = toNum(r[B_bal]);
if (bal <= 0) return;
// ... 채권 비고 제외어 적용
if (dateFilters[fmtD][cat] && hasCodeOrName) {
  r._dtObj = dt;
  dfSalesFiltered.push(r);
}
```

양수 채권 거래처이고 사용자가 고른 날짜·배송분류의 판매행만 대상이다.

### ② 우리 구현

`services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/StatementBatchService.java:52-65`

```java
List<TaxInvoice> issued = taxInvoiceRepository
        .findIssuedInRange(TaxInvoiceStatus.ISSUED, from, to);
Map<UUID, List<TaxInvoice>> byPartner = new LinkedHashMap<>();
for (TaxInvoice ti : issued) {
    byPartner.computeIfAbsent(ti.getPartnerId(), k -> new ArrayList<>()).add(ti);
}
```

### ③ 판정

**다름** — 양수 채권+판매행 선택에서 `ISSUED` 세금계산서로 대상 원천과 상태가 바뀌었다.

### ④ 사용자 차이

미수잔액이 없어도 발행 세금계산서가 있으면 현행에 포함될 수 있고, 판매행은 있으나 세금계산서가 발행되지 않았으면 빠진다.

### ⑤ 업무 확인

**🚨 업무 확인 필요 — 최우선.** 거래명세서의 정본이 판매전표인지 발행 세금계산서인지, 양수 채권만 발송하는 제한이 지금도 유효한지 확인해야 한다.

---

## R-07. 거래명세서 묶음 단위

### ① 레거시 규칙

`tools/legacy-gas/거래처별 일괄 거래명세서 생성/Index.html:755-773`

```js
let key = dVal.getTime() + "_" + noVal + "_" + matchedKey;
if (!invoices[key]) {
  invoices[key] = { date: dVal, no: noVal, cust_code: matchedKey, lines: [] };
}
```

일자+전표번호+거래처 하나가 명세서 한 장이다.

### ② 우리 구현

`services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/StatementBatchService.java:62-70,104-124`는 `partnerId`로 먼저 묶고 그 안에 여러 `StatementSlip`을 넣어 거래처별 `StatementBatchRow` 하나를 만든다.

```java
Map<UUID, List<TaxInvoice>> byPartner = new LinkedHashMap<>();
// ...
rows.add(new StatementBatchRow(selectionKey, partnerCode, bizNo, partnerName, chatRooms, slips));
```

### ③ 판정

**다름** — 전표별 한 장에서 거래처별 복수 전표 묶음으로 바뀌었다.

### ④ 사용자 차이

같은 기간에 전표가 여러 장인 거래처는 레거시에서 여러 문서, 현행에서 한 거래처 묶음으로 보인다.

### ⑤ 업무 확인

**🚨 업무 확인 필요.** 실제 발송 단위가 전표별인지 거래처별 기간 묶음인지 확인해야 한다.

---

## R-08. 거래명세서 공급가액·VAT·합계

### ① 레거시 규칙

`tools/legacy-gas/거래처별 일괄 거래명세서 생성/Index.html:780-800,824-829`

```js
invoices[key].sum_supply += supply;
invoices[key].sum_vat += vat;
// ...
amt: inv.sum_supply + inv.sum_vat,
```

업로드 라인의 공급가액과 VAT를 각각 합하고 둘의 합을 문서 합계로 쓴다.

### ② 우리 구현

`services/accounting-service/src/main/java/com/samhanair/logis/accounting/domain/TaxInvoice.java:624-636`

```java
BigDecimal vatSum = this.lines.stream()
        .map(TaxInvoiceLine::getVatAmount).reduce(BigDecimal.ZERO, BigDecimal::add);
this.supplyAmount = supplySum.setScale(2, RoundingMode.HALF_UP);
this.vatAmount = vatSum.setScale(2, RoundingMode.HALF_UP);
this.totalAmount = this.supplyAmount.add(this.vatAmount);
```

`services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/StatementBatchService.java:106-122`는 이 라인과 헤더 snapshot을 그대로 반환한다.

### ③ 판정

**동일** — 이미 정해진 라인 공급가액·VAT를 각각 합하고 합계를 더하는 계산 축은 같다.

### ④ 사용자 차이

같은 라인 금액 snapshot이 들어오면 공급가액·VAT·합계 산식 차이는 없다. 대상 원천 차이는 R-06이다.

### ⑤ 업무 확인

**🚨 업무 확인 필요 — 금액.** 거래명세서가 세금계산서의 금액 snapshot을 그대로 써야 하는지, 판매전표 금액과 불일치할 때 어느 쪽을 보여야 하는지 확인해야 한다.

---

## R-09. 음수 공급가액·VAT 행

### ① 레거시 규칙

`tools/legacy-gas/거래처별 일괄 거래명세서 생성/Index.html:351-356,780-788`

```js
let n = parseFloat(t);
return isNaN(n) ? 0 : n;
// ...
invoices[key].sum_supply += supply;
invoices[key].sum_vat += vat;
```

`toNum`은 음수를 막지 않고 그대로 합산한다.

### ② 우리 구현

`services/accounting-service/src/main/java/com/samhanair/logis/accounting/domain/TaxInvoiceLine.java:154-167`

```java
if (supplyAmount == null || supplyAmount.signum() < 0) {
    throw new IllegalArgumentException("supplyAmount 는 0 이상 필수입니다");
}
if (vatAmount == null || vatAmount.signum() < 0) {
    throw new IllegalArgumentException("vatAmount 는 0 이상 필수입니다");
}
```

### ③ 판정

**다름** — 레거시는 음수 정정행을 합칠 수 있지만 현행 세금계산서 라인은 음수 공급가·세액을 거부한다.

### ④ 사용자 차이

반품·정정이 음수행으로 들어오는 경우 레거시는 음수 명세서를 만들 수 있으나 현행 `ISSUED` 세금계산서 경로에는 같은 행이 존재할 수 없다.

### ⑤ 업무 확인

**🚨 업무 확인 필요 — 금액.** 반품·수정 거래명세서를 음수행으로 표현하는 것이 현재도 필요한지 확인해야 한다.

---

## R-10. 홈택스 변환 대상 행의 원천

### ① 레거시 규칙

`tools/legacy-gas/계산서일괄등록양식 생성/Index.html:323-325`

```js
let raw = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], {range: 1});
rawExcelData = raw.filter(r => (r['전표번호'] || r['거래처코드'] || r['일자'])
  && !String(r['거래처명'] || r['전표번호'] || '').includes('합계'));
```

업로드 첫 시트에서 식별값이 있고 합계가 아닌 행을 변환한다.

### ② 우리 구현

`services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/HometaxExportService.java:275-298`

```java
List<Map<String, Object>> rawRows = slipQueryClient.fetchAllSalesRows(
        req.fromDate(), req.toDate());
// ... 회계반영일·거래처 제외 후
homtaxRows.add(toHomtaxRow(raw, supplier));
```

### ③ 판정

**다름** — 사용자가 올린 이카운트 첫 시트에서 내부 판매조회 API로 원천이 바뀌었다.

### ④ 사용자 차이

같은 기간이라도 내부 판매조회에 없거나 업로드 파일에만 있던 행은 현행 양식에 나오지 않는다.

### ⑤ 업무 확인

**🚨 업무 확인 필요.** 홈택스 발행 대상의 정본이 이카운트 판매조회 파일인지 내부 판매조회인지 확인해야 한다.

---

## R-11. 회계반영일 없는 행 제외

### ① 레거시 규칙

`tools/legacy-gas/계산서일괄등록양식 생성/Index.html:369-383`

```js
let accDate = String(r['회계반영일자'] || r['회계반영여부'] || '').trim();
if (excludeEmptyDate && !accDate) continue;
```

### ② 우리 구현

`services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/HometaxExportService.java:287-293`

```java
if (req.excludeUnconfirmed()) {
    String accDate = safeStr(raw.get("accountingDate"));
    if (accDate.isBlank()) continue;
}
```

### ③ 판정

**동일** — 토글이 켜지면 회계반영일이 빈 행을 제외한다.

### ④ 사용자 차이

같은 회계반영일 값과 토글이면 포함 여부 차이는 없다.

### ⑤ 업무 확인

**🚨 업무 확인 필요.** 회계반영일이 세금계산서 발행 가능 상태를 뜻하는지, 빈 행을 제외하는 것이 현재도 맞는지 확인해야 한다.

---

## R-12. 홈택스 작성일자

### ① 레거시 규칙

`tools/legacy-gas/계산서일괄등록양식 생성/Index.html:364-391`

```js
let validDateFallback = '';
// 첫 유효 원본 일자 한 번만 채움
if (!validDateFallback && orgDate) validDateFallback = m[1] + m[2] + m[3];
let fullDate = validDateFallback || (new Date().toISOString().slice(0,10).replace(/-/g,''));
```

첫 유효 `일자`를 이후 모든 행의 작성일자로 재사용하고, 없으면 오늘을 쓴다.

### ② 우리 구현

`services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/HometaxExportService.java:856-861`

```java
String accDate = safeStr(raw.get("accountingDate")).replaceAll("[^0-9]", "");
if (accDate.length() >= 8) return accDate.substring(0, 8);
String slipDate = safeStr(raw.get("slipDate")).replaceAll("[^0-9]", "");
if (slipDate.length() >= 8) return slipDate.substring(0, 8);
return LocalDate.now().format(DateTimeFormatter.BASIC_ISO_DATE);
```

### ③ 판정

**다름** — 레거시의 배치 공통 첫 일자와 현행의 행별 회계반영일→전표일 fallback이 다르다.

### ④ 사용자 차이

여러 날짜가 섞인 배치에서 레거시는 모두 같은 작성일자, 현행은 행마다 다른 작성일자가 될 수 있다.

### ⑤ 업무 확인

**🚨 업무 확인 필요 — 최우선.** 세금계산서 작성일자가 배치 공통일인지 행별 회계반영일·전표일인지 확인해야 한다.

---

## R-13. 공급자 정보의 권위

### ① 레거시 규칙

`tools/legacy-gas/계산서일괄등록양식 생성/Index.html:402-410`

```js
case "공급자 등록번호 (\"-\" 없이 입력)": val = "2148720659"; break;
case "공급자 상호": val = "（주）삼한공조시스템"; break;
case "공급자 성명": val = "김미선"; break;
case "공급자 사업장주소": val = "서울특별시 서초구 마방로2길 9, 4층(양재동)"; break;
```

### ② 우리 구현

`services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/HometaxExportService.java:539-551`

```java
String supplierRegNo = supplier != null ? supplier.getBusinessNumber() : FALLBACK_REG_NO;
String supplierName  = supplier != null ? supplier.getCompanyName() : FALLBACK_NAME;
String supplierCeo   = supplier != null ? supplier.getRepresentativeName() : FALLBACK_CEO;
```

DB의 primary 공급자 프로필을 우선하고, 없을 때만 레거시 상수를 쓴다.

### ③ 판정

**다름** — 하드코딩 값에서 동적 primary 프로필 우선으로 바뀌었다.

### ④ 사용자 차이

primary 프로필이 레거시 상수와 다르면 홈택스 파일의 공급자 등록번호·상호·대표·주소·업태·종목·이메일이 달라진다.

### ⑤ 업무 확인

**🚨 업무 확인 필요.** DB primary 공급자 프로필이 현재 세금계산서 발행 주체의 정본인지 확인해야 한다.

---

## R-14. 공급받는자 상호 정제

### ① 레거시 규칙

`tools/legacy-gas/계산서일괄등록양식 생성/Index.html:346-354`

```js
txt = txt.replace(/\((?!주\)).*?\)/g, "");
if (txt.indexOf('-') > -1) txt = txt.split('-', 1)[0];
txt = txt.replace(/구\)/g, '').replace(/\*/g, '');
txt = txt.replace(/^[^가-힣A-Za-z0-9(]+/, '');
```

### ② 우리 구현

`services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/HometaxExportService.java:597-604`

```java
String txt = name.replaceAll("\\((?!주\\)).*?\\)", "");
int dashIdx = txt.indexOf('-');
if (dashIdx > -1) txt = txt.substring(0, dashIdx);
return txt.replace("구)", "").replace("*", "").trim();
```

### ③ 판정

**다름** — 괄호·하이픈·`구)`·별표 제거는 같지만, 현행에는 앞쪽 비한글/영문/숫자 기호 제거가 없다.

### ④ 사용자 차이

거래처명 앞에 특수기호가 있으면 레거시는 제거하고 현행은 홈택스 공급받는자 상호에 남긴다.

### ⑤ 업무 확인

**🚨 업무 확인 필요.** 앞쪽 기호 제거가 유효한 상호 정규화인지, 원문 상호를 보존해야 하는지 확인해야 한다.

---

## R-15. 공급가액·세액과 청구 유형

### ① 레거시 규칙

`tools/legacy-gas/계산서일괄등록양식 생성/Index.html:420-427`

```js
case "공급가액": val = r['공급가액합계'] || r['공급가액'] || 0; break;
case "세액": val = r['부가세합계'] || r['부가세'] || 0; break;
case "공급가액1": val = r['공급가액합계'] || r['공급가액'] || 0; break;
case "세액1": val = r['부가세합계'] || r['부가세'] || 0; break;
case "영수(01),청구(02)": val = "02"; break;
```

### ② 우리 구현

`services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/HometaxExportService.java:561-586`

```java
BigDecimal supplyAmt = toBigDecimal(raw.get("supplyAmount"));
BigDecimal vatAmt = toBigDecimal(raw.get("vatAmount"));
// ... 헤더와 품목1에 같은 금액
supplyAmt, vatAmt, remark,
day2, itemName1, itemSpec1, itemQty1, itemPrice1, supplyAmt, vatAmt, itemRemark1,
// ...
"02",
```

### ③ 판정

**동일** — 원천 공급가액·세액을 재계산하지 않고 헤더와 품목1에 복사하며 청구 `02`를 고정한다.

### ④ 사용자 차이

같은 원천 금액이면 홈택스 공급가액·세액·영수/청구 값은 같다.

### ⑤ 업무 확인

**🚨 업무 확인 필요 — 금액.** 모든 건을 청구 `02`로 발행하는 것과 헤더 금액을 품목1 한 줄에 복사하는 것이 현재도 맞는지 확인해야 한다.

---

## R-16. 홈택스 제외 키

### ① 레거시 규칙

`tools/legacy-gas/계산서일괄등록양식 생성/Index.html:745-748`

```js
let rowSlipNum = String(row[59] || '');
return !(rowSlipNum && exceptionCodes.includes(rowSlipNum));
```

전표번호 목록으로 출력 행을 제외한다.

### ② 우리 구현

`services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/HometaxExportService.java:279-297`

```java
Set<String> exclusionSet = new HashSet<>(exclusionRepository.findAllActiveCodes());
if (req.excludePartnerCodes() != null) exclusionSet.addAll(req.excludePartnerCodes());
String partnerCode = safeStr(raw.get("partnerCode"));
if (exclusionSet.contains(partnerCode)) continue;
```

### ③ 판정

**다름** — 전표번호 제외에서 거래처코드 제외로 바뀌었다.

### ④ 사용자 차이

레거시는 특정 전표 한 건만 제외할 수 있지만 현행은 해당 거래처의 기간 내 모든 행을 제외한다.

### ⑤ 업무 확인

**🚨 업무 확인 필요 — 최우선.** 예외가 거래처 단위 정책인지 전표별 임시 제외인지 확인해야 한다.

---

## R-17. 홈택스 파일당 100건 분할

### ① 레거시 규칙

`tools/legacy-gas/계산서일괄등록양식 생성/Index.html:755-758`

```js
for (let i = 0; i < exportData.length; i += 100) {
  chunks.push(exportData.slice(i, i + 100));
}
```

### ② 우리 구현

`services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/HometaxExportService.java:83-84,301-304`

```java
public static final int ROWS_PER_SHEET = 100;
int splitCount = total == 0 ? 0 : (int) Math.ceil((double) total / ROWS_PER_SHEET);
```

### ③ 판정

**동일** — 파일 하나의 데이터 행을 최대 100건으로 나눈다.

### ④ 사용자 차이

같은 대상 행 수면 생성 파일 수가 같다.

### ⑤ 업무 확인

**🚨 업무 확인 필요.** 홈택스 현행 업로드 제한이 여전히 파일당 100건인지 확인해야 한다.

---

## R-18. 영업수수료 계산의 사용자 실행 경로

### ① 레거시 규칙

`tools/legacy-gas/영업수수료 계산/Index.html:250-270,358-372`

```js
['f_total', 'f_equip', 'f_prepaid', 'f_install', 'f_safety'].forEach(function(id) {
  document.getElementById(id).addEventListener('input', recalc);
});
// ...
function recalc() {
  var v = getValues();
  document.getElementById('c_payout').value = fmt(v.payout);
  document.getElementById('c_supply').value = fmt(v.supply);
  document.getElementById('c_vat').value = fmt(v.vat);
}
```

사용자가 금액·토글을 바꿀 때 즉시 계산한다.

### ② 우리 구현

`services/accounting-service/src/main/java/com/samhanair/logis/accounting/web/SalesCommissionSettlementController.java:37-73`의 production endpoint는 목록, 상세, DRAFT 생성, 확정뿐이다.

```java
@GetMapping
public ApiResponse<Page<SalesCommissionSettlementResponse>> list(...)
@GetMapping("/{id}")
public ApiResponse<SalesCommissionSettlementResponse> getOne(...)
@PostMapping
public ApiResponse<SalesCommissionSettlementResponse> create(...)
@PostMapping("/{id}/confirm")
public ApiResponse<SalesCommissionSettlementResponse> confirm(...)
```

`clients/desktop/src/renderer/routes/SalesCommissionSettlementDetailPage.tsx:99-106`은 계산 결과를 읽기만 하며 입력·계산 호출이 없다. `SalesCommissionSettlementService.calculate`는 존재하지만 production controller와 desktop에서 호출 참조를 찾지 못했다.

### ③ 판정

**없음** — 사용자가 레거시처럼 값을 넣고 계산을 실행하는 production 경로가 없다.

### ④ 사용자 차이

현행 사용자는 빈 DRAFT를 만들고 확정할 수 있지만 화면에서 총 결제금액·장비대·선지급·설치비·안전관리비를 넣어 지급액을 계산할 수 없다.

### ⑤ 업무 확인

**🚨 업무 확인 필요 — 최우선.** 영업수수료 화면이 계산 도구인지, 이미 계산된 정산 snapshot의 목록·확정 도구인지 확인해야 한다.

---

## R-19. 영업수수료 기본 요율

### ① 레거시 규칙

`tools/legacy-gas/영업수수료 계산/Index.html:297-301,331-335`

```js
return 0.08;
var card = payMethod === '카드결제' ? xround(-total * 0.03) : 0;
var wht = whtApply ? xround(sales * -0.033) : 0;
var dogup = xround(install * -0.08);
```

### ② 우리 구현

`services/accounting-service/src/main/resources/db/migration/V98__add_sales_commission_rate_contract_snapshot.sql:27-31`

```sql
INSERT INTO sales_commission_rate_contracts (
    version_no, card_rate, expense_rate, withholding_rate, install_rate, created_by
) VALUES (1, 0.03, 0.08, 0.033, 0.08, 'd-g1-s2')
```

`services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/SalesCommissionSettlementCalculator.java:25-36`은 선택 계약의 네 요율을 같은 위치에 적용한다.

### ③ 판정

**동일** — 요율 계약 v1의 카드 3%, 제경비 8%, 원천징수 3.3%, 설치비 8%가 같다.

### ④ 사용자 차이

v1 계약을 선택하면 요율 자체의 차이는 없다. 다른 계약 버전이면 결과가 달라질 수 있다.

### ⑤ 업무 확인

**🚨 업무 확인 필요 — 금액.** 네 요율이 2026-08-15에도 유효한지, 계약 버전을 누가 어떤 기준으로 선택하는지 확인해야 한다.

---

## R-20. 카드수수료와 총 영업수수료

### ① 레거시 규칙

`tools/legacy-gas/영업수수료 계산/Index.html:323-333`

```js
var card = payMethod === '카드결제' ? xround(-total * 0.03) : 0;
var sales = total - equip + card;
```

### ② 우리 구현

`services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/SalesCommissionSettlementCalculator.java:25-28`

```java
BigDecimal card = input.paymentMethod() == SalesCommissionPaymentMethod.CARD
        ? xround(input.total().negate().multiply(contract.getCardRate()))
        : BigDecimal.ZERO;
BigDecimal sales = input.total().subtract(input.equipment()).add(card);
```

### ③ 판정

**동일** — 카드면 총 결제금액의 3%를 음수 반올림하고, 총액-장비대+카드수수료로 영업수수료 기준액을 만든다.

### ④ 사용자 차이

같은 입력과 v1 요율이면 계산값 차이는 없다. 사용자 실행 경로 부재는 R-18이다.

### ⑤ 업무 확인

**🚨 업무 확인 필요 — 금액.** 카드수수료를 총 결제금액 기준으로 공제하고 장비대보다 먼저 반영하는 순서가 현재도 맞는지 확인해야 한다.

---

## R-21. 제경비·원천징수·도급비·안전관리비와 지급액

### ① 레거시 규칙

`tools/legacy-gas/영업수수료 계산/Index.html:333-338`

```js
var expense = xround(sales * -expenseRate);
var wht = whtApply ? xround(sales * -0.033) : 0;
var dogup = xround(install * -0.08);
var safety = -safetyInput;
var subtotal = sales + expense + wht + dogup + safety;
var payout = subtotal - prepaid;
```

### ② 우리 구현

`services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/SalesCommissionSettlementCalculator.java:29-39`

```java
BigDecimal expense = xround(sales.multiply(expenseRate.negate()));
BigDecimal withholding = input.withholdingApplied()
        ? xround(sales.multiply(contract.getWithholdingRate().negate())) : BigDecimal.ZERO;
BigDecimal install = xround(input.install().multiply(contract.getInstallRate().negate()));
BigDecimal safety = input.safety().negate();
BigDecimal subtotal = sales.add(expense).add(withholding).add(install).add(safety);
BigDecimal payout = subtotal.subtract(input.prepaid());
```

### ③ 판정

**동일** — 공제 기준, 부호, 합산 순서, 선지급 차감이 같다.

### ④ 사용자 차이

같은 입력·토글·요율이면 소계와 지급액 차이는 없다. 사용자 실행 경로 부재는 R-18이다.

### ⑤ 업무 확인

**🚨 업무 확인 필요 — 금액.** 제경비·원천징수는 영업수수료 기준액, 도급비는 설치비 입력액을 기준으로 하는 것이 맞는지와 안전관리비 수기 전액 공제를 확인해야 한다.

---

## R-22. 영업수수료 공급가·VAT 분리와 반올림

### ① 레거시 규칙

`tools/legacy-gas/영업수수료 계산/Index.html:317-320,337-340`

```js
function xround(n) {
  return (n < 0 ? -1 : 1) * Math.round(Math.abs(n));
}
var subtotal = sales + expense + wht + dogup + safety;
var supply = xround(subtotal / 1.1);
var vat = subtotal - supply;
```

### ② 우리 구현

`services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/SalesCommissionSettlementCalculator.java:38-50`

```java
BigDecimal subtotal = sales.add(expense).add(withholding).add(install).add(safety);
BigDecimal supply = xround(subtotal.divide(VAT_DIVISOR, 20, RoundingMode.HALF_UP));
BigDecimal vat = subtotal.subtract(supply);
// ...
return value.setScale(0, RoundingMode.HALF_UP);
```

### ③ 판정

**동일** — VAT 포함 소계를 1.1로 나눠 원 단위 HALF_UP하고 차액을 VAT로 둔다. 음수도 부호를 보존해 절댓값 반올림과 같은 결과가 난다.

### ④ 사용자 차이

같은 소계면 공급가·VAT 값 차이는 없다. 사용자 실행 경로 부재는 R-18이다.

### ⑤ 업무 확인

**🚨 업무 확인 필요 — 금액.** 영업수수료 소계가 VAT 포함액인지, 공급가를 원 단위 반올림하고 잔액을 VAT로 두는 것이 세무 처리와 맞는지 확인해야 한다.

---

## 정찰 범위와 미확인 영역

### 끝까지 본 범위

- 레거시 `거래처별 원장생성 프로그램`의 `Code.js` 374행과 `Index.html` 1,608행을 함수·원천·기간·계정코드·잔액·제외·저장 경로 기준으로 훑었다. 핵심 `processLocalData` 568-790행과 계정별원장 parser 890-945행을 전문 대조했다.
- 레거시 `거래처별 일괄 거래명세서 생성`의 `Code.js` 379행과 `Index.html` 1,764행을 훑었다. 핵심 `processLocalData` 658-867행과 제외어·문서 생성 경로를 대조했다.
- 레거시 `계산서일괄등록양식 생성`의 `Code.js` 250행과 `Index.html` 1,150행을 훑었다. 입력 필터, 59열 매핑, 제외 전표, 100건 분할과 export 경로를 대조했다. 바이너리 `계산서 발행용.xlsx`의 셀 스타일·매크로 여부는 규칙 정찰 대상에서 제외했다.
- 레거시 `영업수수료 계산`의 `Code.js` 179행과 `Index.html` 558행을 훑었다. 입력 토글, `getValues`, 저장·복원 경로를 확인했다.
- 현행은 accounting-service의 원장 read model·공통 ledger contract·거래명세서 batch·세금계산서 금액 제약·홈택스 export·영업수수료 calculator/service/controller/domain과 desktop의 대응 route·API 호출을 추적했다.

### 규칙에서 제외한 것

- 색상, 폰트, canvas 좌표, 열 너비, 필터 팝업, Excel 셀 스타일, 이미지 복사처럼 값의 업무 의미를 결정하지 않는 표시·포맷 코드
- Notion history 압축, retry, Blob 변환, 파일 저장처럼 계산값·대상 집합을 결정하지 않는 전송 기술
- 앞선 데이터 원천 4종 보고서에서 이미 다룬 단톡방 매칭·회계방 제외·notification 장애 fallback
- 테스트·mock에만 있고 production 호출 경로에 없는 값

### 확인하지 못한 것

- 공유 DB를 조회하지 않았으므로 실제 primary 공급자 프로필, 영업수수료 활성 요율 계약, 원장 계정과목 chart, 발행 세금계산서·POSTED 분개 운영값을 확인하지 않았다.
- 실제 원장·명세서·홈택스 파일·영업수수료 정산을 생성하지 않았다. 따라서 배포 환경의 행 수·금액 결과와 레거시 업로드 파일의 실데이터 결과는 비교하지 않았다.
- `계산서 발행용.xlsx` 바이너리 템플릿은 파일 내부 표시형식 대상이다. 이번 요청의 값 결정 규칙에서는 제외했으며, 템플릿 셀 수식이 별도로 존재하는지는 **확인 불가**다.
- 저장소 밖 외부 배치나 수동 API가 `SalesCommissionSettlementService.calculate`를 호출하는지는 **확인 불가**다. 저장소 production controller·desktop 호출 경로에서는 찾지 못했다.
- 네 레거시 코드의 고정 계정코드·잔액 0.5 경계·최근 20건·청구 `02`·수수료율이 2026-08-15에도 유효한 업무 정책인지는 코드만으로 확정하지 않았다.

## 업무 확인 우선순위 — 수정 제안 아님

1. 원장 정본과 기초잔액: 이카운트 4종 파일 / canonical 출고전표 / POSTED 분개, 조정분개 포함 여부
2. 거래명세서 대상과 문서 단위: 양수 채권 판매전표 / ISSUED 세금계산서, 전표별 / 거래처별 묶음, 음수 정정행
3. 홈택스 작성일자와 제외 단위: 배치 첫 일자 / 행별 회계일·전표일, 전표번호 / 거래처코드
4. 홈택스 공급자 프로필과 공급받는자 상호 정제의 업무 정본
5. 영업수수료 화면의 정체성: 계산 도구 / 계산 snapshot 조회·확정 도구
6. 카드 3%·제경비 8%·원천 3.3%·설치 8%, 공제 순서, VAT 분리의 현재 유효성
