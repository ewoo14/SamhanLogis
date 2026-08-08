# #896 세트 구성품 납품가 출처 코드 판정

- 조사일: 2026-08-08
- 조사 범위: 저장소 코드만 읽기 전용 분석. Google Sheet·DB·실행 환경은 조회하지 않음.
- 판정 대상: 싱글중대형 세트, 주문서, 상업멀티, `BundleExpander`

## 한 문장 결론

**세트 내부 실내기·실외기 납품가는 조건에 따라 다르다: 실내기와 실외기가 모두 있으면 세트 단가 잔액을 실행 시 비율 배분하여 덮어쓰되, 같은 그룹에 구성품이 여러 개면 시트 납품가를 배분 가중치로 쓰고, 한쪽 그룹이 없으면 시트 기반 구성품 납품가를 그대로 둔다.**

## 1. 세트를 펼칠 때 각 구성품의 납품가가 어디서 정해지는가

### 1.1 최초값은 시트의 구성품 납품가다

레거시 서버는 `싱글 구성품_단가인상` 시트에서 마지막 `납품가` 열을 찾아 숫자로 읽고 반환 객체의 `price`에 넣는다.

- `tools/legacy-gas/종합견적서/Code.js:605-621`
  > `const sh = SpreadsheetApp.openById(SRC_SHEET_ID).getSheetByName(SINGLE_PARTS_NAME);`
  > `const idxPrices   = H.map((v,i)=>v==='납품가'?i:-1).filter(i=>i>=0);`
  > `const idxPrice    = idxPrices.length ? idxPrices[idxPrices.length - 1] : -1;`
- `tools/legacy-gas/종합견적서/Code.js:641-659`
  > `const price    = idxPrice >= 0 ? parseKRNumber_(row[idxPrice]) : 0;`
  > `out.push({ ... price, ... });`

세트 전개 시작 시 선택된 모든 구성품은 이 값을 `partUnitPrice(p)`로 스냅샷한다.

- `tools/legacy-gas/종합견적서/index.html:4822-4832`
  > `const mapped = picked.map(p => ({`
  > `  ...`
  > `  price: partUnitPrice(p),`
  > `  ...`
  > `}));`
- `tools/legacy-gas/종합견적서/index.html:3974-3986`
  > `let basePrice = priceFrom(p,{ priceKeys:['price','unitPrice'], listKeys:['list','출고가','listPrice','msrp'] });`
  > `...`
  > `return basePrice;`

단, 단가인상 체크가 켜져 있고 해당 모델의 인상 단가가 있으면 `partUnitPrice`가 그 값으로 바꾼다.

- `tools/legacy-gas/종합견적서/index.html:3981-3984`
  > `if (isInc && ... PRICE_INC.single[p.model] ... ) {`
  > `  basePrice = PRICE_INC.single[p.model].price;`
  > `}`

### 1.2 실내기·실외기가 모두 있으면 세트 잔액을 비율 배분하여 덮어쓴다

구성품은 실내기, 실외기, 그 외 고정부품으로 나뉜다. 세트 단가는 override → 세트 `price` → 기본가 순으로 정하고, 고정부품 합계를 먼저 뺀 잔액만 실내·실외기에 배분한다.

- `tools/legacy-gas/종합견적서/index.html:4834-4845`
  > `let indoorParts = mapped.filter(isIndoorUnitPart);`
  > `let outdoorParts = mapped.filter(isOutdoorUnitPart);`
  > `let fixedParts = mapped.filter(x => !indoorParts.includes(x) && !outdoorParts.includes(x));`
  > `...`
  > `const ratioIn = isHousehold ? 6 : 4;`
  > `const ratioOut = isHousehold ? 4 : 6;`
- `tools/legacy-gas/종합견적서/index.html:4856-4867`
  > `const setUnit = Math.round(Number(setUnitOverride)) || Math.round(Number(s.price)) || Math.round(Number(setBasePriceRightFirst(s)));`
  > `const fixedSum = fixedParts.reduce((t, x) => t + (Math.round(Number(x.price)||0)), 0);`
  > `if (indoorParts.length && outdoorParts.length){`
  > `  const { indoor, outdoor, remain } = splitIndoorOutdoorToK(setUnit, fixedSum, ratioIn, ratioOut);`

`splitIndoorOutdoorToK` 자체도 `세트 단가 - 고정부품 합계`를 잔액으로 삼아 비율 계산한다.

- `tools/legacy-gas/종합견적서/index.html:3078-3085`
  > `const remain = Math.max(0, Math.round(Number(setUnit)||0) - Math.round(Number(fixedSum)||0));`
  > `const tot = ratioIn + ratioOut;`
  > `let indoor = Math.round(remain * ratioIn / tot);`
  > `let outdoor = remain - indoor;`

실내기 1개·실외기 1개이면 두 시트 납품가를 가중치로도 쓰지 않고 배분 총액으로 직접 덮어쓴다.

- `tools/legacy-gas/종합견적서/index.html:4869-4872`
  > `if (indoorParts.length === 1 && outdoorParts.length === 1){`
  > `  indoorParts[0].price = indoor;`
  > `  outdoorParts[0].price = outdoor;`
  > `}`

같은 그룹에 여러 구성품이 있으면 시트에서 시작한 기존 `price` 합계와 각 행의 `price`를 가중치로 사용한 뒤 최종값을 덮어쓴다.

- `tools/legacy-gas/종합견적서/index.html:4873-4894`
  > `const sumInBase = indoorParts.reduce((t,x)=>t+(Number(x.price)||0),0) || indoorParts.length;`
  > `const sumOutBase = outdoorParts.reduce((t,x)=>t+(Number(x.price)||0),0) || outdoorParts.length;`
  > `const v = roundK(indoor * (Number(x.price)||1) / sumInBase);`
  > `x.price = v;`
  > `...`
  > `const v = roundK(outdoor * (Number(x.price)||1) / sumOutBase);`
  > `x.price = v;`

### 1.3 판넬·리모컨·자재 등은 시트 기반값을 유지한다

실내기·실외기로 분류되지 않은 행은 `fixedParts`가 되고, 배분 전 고정합계에서 차감될 뿐 그 행의 `price`를 다시 쓰는 문장은 없다. 반환 시 현재 `p.price`가 그대로 나간다.

- `tools/legacy-gas/종합견적서/index.html:4835-4837`
  > `let fixedParts = mapped.filter(x => !indoorParts.includes(x) && !outdoorParts.includes(x));`
- `tools/legacy-gas/종합견적서/index.html:4862-4863`
  > `const fixedSum = fixedParts.reduce((t, x) => t + (Math.round(Number(x.price)||0)), 0);`
- `tools/legacy-gas/종합견적서/index.html:4900-4909`
  > `return mapped.map(p => ({`
  > `  ...`
  > `  price: Math.max(0, Math.round(Number(p.price)||0)),`
  > `  ...`
  > `}));`

따라서 질문에 제시된 “실내기·실외기는 배분, 판넬·리모컨은 시트값” 구분은 기본적으로 사실이다. 여기에 다음 조건이 붙는다.

1. 가정용 세트의 벽걸이 실내기는 고정부품으로 이동하므로 시트 기반값을 유지한다.
   - `tools/legacy-gas/종합견적서/index.html:4847-4853`
     > `if (isHousehold) {`
     > `  const wallMounts = indoorParts.filter(p => /벽걸이/.test(p.name));`
     > `  ... wallMounts.forEach(w => fixedParts.push(w));`
     > `  indoorParts = indoorParts.filter(p => !/벽걸이/.test(p.name));`
2. 실내기 또는 실외기 중 한쪽이 하나도 없으면 `if (indoorParts.length && outdoorParts.length)`가 실행되지 않으므로 선택된 모든 구성품의 시트 기반값이 유지된다.

## 2. 시트에서 읽은 실내기·실외기 납품가는 어디에 쓰이는가

판정은 **죽은 데이터가 아니다**이다.

- 실내기 1개·실외기 1개인 정상 배분 경로에서는 두 구성품의 원래 납품가가 덮어써지므로 최종 구성품 가격이나 배분 가중치에 쓰이지 않는다. 이 경우에 한해서 원래 두 절대값은 출력 관점에서 죽은 값이다.
- 실내기 또는 실외기 그룹에 여러 행이 있으면 원래 납품가가 그룹 내부 비례 배분의 가중치다. 근거는 `sumInBase`, `sumOutBase`, `Number(x.price)`를 사용하는 `index.html:4875-4892`이다.
- 한쪽 그룹이 없으면 배분문 자체가 실행되지 않아 원래 납품가가 최종 출력값이다. 근거는 `index.html:4866`의 양쪽 존재 조건과 `index.html:4907`의 반환문이다.
- 실내·실외기가 아닌 고정부품 가격은 잔액 산정 입력(`fixedSum`)이면서 자기 최종값이다.

또한 같은 시트 구성품 가격은 세트 옵션 가격 계산에도 쓰인다. 자재 포함 합계, 기본/선택 판넬 차액, 리모컨 제외·교체 차액을 세트 단가에 더하거나 뺀다.

- `tools/legacy-gas/종합견적서/index.html:4665-4668`
  > `return partsForSetStrict_(s).reduce((t,p)=>t+(/자재/.test(p?.feat||'')?partUnitPrice(p):0),0);`
- `tools/legacy-gas/종합견적서/index.html:4732-4737`
  > `const baseP=partUnitPrice(basePanel);`
  > `if(panelExcluded) panelDelta-=baseP;`
  > `else if(chosenPanel && chosenPanel.model!==basePanel.model){ panelDelta += (partUnitPrice(chosenPanel)-baseP); }`
- `tools/legacy-gas/종합견적서/index.html:4741-4754`
  > `const baseRemoteSum = baseRemoteRows.reduce((t,p)=>t+partUnitPrice(p),0);`
  > `... remoteDelta -= baseRemoteSum;`
  > `... remoteDelta += (partUnitPrice(cand)-partUnitPrice(replace));`
- `tools/legacy-gas/종합견적서/index.html:4758-4766`
  > `const matIncludedTotal = materialsSumForSet(s);`
  > `let setPrice = baseL + panelDelta + remoteDelta + matIncludedTotal;`

현행 포팅본도 같은 구조다.

- `clients/web/estimate-app/lib/code.js:938-957`
  > `const idxPrices = H.map((v, i) => v === '납품가' ? i : -1)...`
  > `const price = idxPrice >= 0 ? parseKRNumber_(row[idxPrice]) : 0;`
- `clients/web/estimate-app/views/index.ejs:5241-5249`
  > `price: partUnitPrice(p),`
- `clients/web/estimate-app/views/index.ejs:5285-5312`
  > `if (indoorParts.length && outdoorParts.length){`
  > `...`
  > `const v = roundK(indoor * (Number(x.price)||1) / sumInBase);`
  > `...`
  > `const v = roundK(outdoor * (Number(x.price)||1) / sumOutBase);`

## 3. 주문서도 견적서와 같은가

### 판정

**핵심 가격 원칙은 같다. 세부 구현은 완전히 같지 않다.**

주문서도 최초 구성품 가격을 `partUnitPrice(p)`로 잡고, 고정부품을 차감한 세트 잔액을 가정용 6:4·그 외 4:6으로 배분한다. 1+1이면 덮어쓰고, 다수이면 기존 가격을 가중치로 쓴다.

- `clients/web/order-app/index.html:3374-3382`
  > `const mapped = picked.map(p => ({`
  > `  ...`
  > `  price: partUnitPrice(p),`
  > `  ...`
  > `}));`
- `clients/web/order-app/index.html:3398-3417`
  > `const fixedSum = fixedParts.reduce((t, x) => t + (Math.round(Number(x.price)||0)), 0);`
  > `const ratioIn = isHousehold ? 6 : 4;`
  > `const ratioOut = isHousehold ? 4 : 6;`
  > `if (indoorParts.length && outdoorParts.length){`
  > `...`
  > `indoorParts[0].price = indoor;`
  > `outdoorParts[0].price = outdoor;`
- `clients/web/order-app/index.html:3423-3441`
  > `const sumInBase = indoorParts.reduce((t,x)=>t+(Number(x.price)||0),0) || indoorParts.length;`
  > `... roundK(indoor * (Number(x.price)||1) / sumInBase);`
  > `... roundK(outdoor * (Number(x.price)||1) / sumOutBase);`

주문서 미리보기와 전송도 이 함수의 결과 가격을 쓴다.

- `clients/web/order-app/index.html:6050-6075`
  > `return explodeSetParts(s, q, unitOverride).map(k => ({ ... price:k.price }));`
- `clients/web/order-app/index.html:6170-6184`
  > `explodeSetParts(s, q, unitOverride).forEach(k=>{`
  > `  const sub = (k.price||0) * (k.qty||0);`
  > `  ...`
  > `  <td>${fmt(k.price)}</td>`

확인된 차이는 다음 두 가지다.

1. 주문서는 구성품 수량을 `qty * p.qty`로 잡지만 종합견적서는 해당 스냅샷에서 `qty`만 넣는다.
   - 주문서 `clients/web/order-app/index.html:3379-3381`: `qty: qty * (parseInt(p.qty, 10) || 1)`
   - 종합견적서 `tools/legacy-gas/종합견적서/index.html:4827-4829`: `qty: qty`, `price: partUnitPrice(p)`
2. 종합견적서는 가정용 벽걸이 실내기를 고정부품으로 이동하는 `index.html:4847-4853` 코드가 있지만, 주문서의 `explodeSetParts`에는 대응 블록이 없다. 주문서는 `clients/web/order-app/index.html:3386-3411`에서 바로 그룹 분류→세트 단가→비율 결정→배분으로 진행한다. 따라서 가정용 벽걸이가 포함된 경우 가격 결과가 같다고 확정할 수 없고, 코드상 경로는 다르다.

주문서의 구성품 배열은 bootstrap의 `singleParts`와 `commercialParts`에서 온다.

- `clients/web/order-app/index.html:1353-1364`
  > `const SP_RAW = __BS.singleParts || [];`
  > `...`
  > `const CP_RAW = __BS.commercialParts || [];`
- `clients/web/order-app/index.html:1432-1435`
  > `const SINGLE_PARTS=J(SP_RAW,[]);`
  > `const COMMULTI=J(CM_RAW,[]), COMM_PARTS=J(CP_RAW,[]);`

## 4. 우리 구현 `BundleExpander`가 레거시와 같은가

### 같은 부분

싱글세트에 대해 고정부품 선차감, 가정용 6:4·그 외 4:6, 1개 그룹 통째 배정, 다수 그룹 기존가격 비례, 마지막 행 잔차 흡수라는 계산 구조는 같다.

- `services/product-service/src/main/java/com/samhanair/logis/product/service/BundleExpander.java:326-335`
  > `int ratioIn = household ? 6 : 4;`
  > `int ratioOut = household ? 4 : 6;`
  > `... fixedSum = fixedSum.add(round(f.price));`
  > `Split split = splitIndoorOutdoorToK(setUnit, fixedSum, ratioIn, ratioOut);`
  > `assignGroup(indoor, split.indoor);`
  > `assignGroup(outdoor, split.outdoor);`
- `services/product-service/src/main/java/com/samhanair/logis/product/service/BundleExpander.java:338-360`
  > `if (group.size() == 1) { group.get(0).price = total; ... }`
  > `base = base.add(p.price);`
  > `BigDecimal w = p.price.signum() == 0 ? BigDecimal.ONE : p.price;`
  > `BigDecimal v = roundK(total.multiply(w).divide(base, 0, RoundingMode.HALF_UP));`
  > `p.price = total.subtract(acc);`

### 다른 부분 — 문맥별 구성품 납품가가 사라진다

레거시는 `싱글 구성품` 행마다 읽은 `price`를 세트 문맥 안에 보유한다(`Code.js:632-659`). 반면 우리 `BundleComponent`에는 가격 필드가 없고 링크·수량·종류·variant·기본 여부·규격만 있다.

- `services/product-service/src/main/java/com/samhanair/logis/product/domain/BundleComponent.java:71-100`
  > `private UUID bundleProductId;`
  > `private String componentProductCode;`
  > `private BigDecimal defaultQty;`
  > `private QtyMode qtyMode;`
  > `private ComponentKind componentKind;`
  > `private String componentVariant;`
  > `private Boolean isDefault = Boolean.FALSE;`
  > `private String specText;`

`BundleExpander`는 구성 링크가 가리키는 구성품 `Product`를 모델코드로 조회하고 그 제품의 단일 `deliveryPrice`를 모든 세트 문맥의 초기 가격으로 쓴다.

- `services/product-service/src/main/java/com/samhanair/logis/product/service/BundleExpander.java:98-118`
  > `productRepository.findByModelCodeInAndIsDeletedFalse(...)`
  > `...`
  > `BigDecimal price = cp != null ? nz(cp.getDeliveryPrice()) : BigDecimal.ZERO;`
  > `parts.add(new Part(... price, qty, ...));`

내부 카탈로그 구성품 응답도 동일하게 구성 링크와 `Product`를 join하여 `cp.getDeliveryPrice()`를 내보낸다.

- `services/product-service/src/main/java/com/samhanair/logis/product/web/EstimateCatalogInternalController.java:308-318`
  > `List<BundleComponent> components = bundleComponentRepository.findByBundleProductIdIn(...)`
  > `... productRepository.findByModelCodeInAndIsDeletedFalse(componentCodes) ...`
- `services/product-service/src/main/java/com/samhanair/logis/product/web/EstimateCatalogInternalController.java:335-350`
  > `Product cp = componentProducts.get(c.getComponentProductCode());`
  > `...`
  > `cp == null ? null : cp.getDeliveryPrice(),`

따라서 다음 경우 레거시와 달라질 수 있음이 코드로 확정된다.

- 같은 구성품 모델의 시트 납품가가 세트 문맥마다 다르고, 해당 가격이 다수 실내기/실외기 그룹의 가중치로 쓰이는 경우
- 같은 구성품 모델의 시트 납품가가 세트 문맥마다 다르고, 해당 구성품이 판넬·리모컨·자재·가정용 벽걸이 등 고정부품인 경우
- 실내기 또는 실외기 한쪽이 없어 재배분이 실행되지 않는 경우

반대로 실내기 1개·실외기 1개가 모두 존재하고 두 행이 고정부품이 아닌 경우에는 두 원래 가격이 통째로 덮어써지므로, 그 두 시트 절대값의 차이만으로 레거시 최종 출력 차이가 발생한다고 볼 수 없다.

### 다른 부분 — 일부 예외 처리

- 레거시는 실내기 또는 실외기 한쪽이 없으면 재배분하지 않고 원래 가격을 반환한다(`index.html:4866-4907`). 우리 구현은 명시적 단가 override가 없으면 원래 가격을 반환하지만, override가 있으면 예외를 던진다.
  - `BundleExpander.java:318-323`
    > `if (indoor.isEmpty() || outdoor.isEmpty()) {`
    > `  if (!explicitUnitOverride) { return; }`
    > `  throw new BusinessException(...);`
- 레거시는 이름·구분 문자열로 실내기·실외기를 판정하지만, 우리 구현은 `ComponentKind.INDOOR`/`OUTDOOR`만 인정한다.
  - `BundleExpander.java:420-431`
    > `if (p.kind == BundleComponent.ComponentKind.INDOOR) ...`
    > `if (p.kind == BundleComponent.ComponentKind.OUTDOOR) ...`
  - 따라서 DB의 `component_kind` 적재 결과가 레거시 문자열 분류와 다르면 그룹 자체가 달라질 수 있다.

### 재현 불일치 83건에 대한 코드 판정

83건 전부가 문제인지 여부는 현재 읽은 코드만으로 확정할 수 없다.

- 해당 83개가 모두 “실내기 1개 + 실외기 1개”의 두 본체 원가격 차이라면 그 값은 실행 시 덮어써지므로 그 차이 자체는 최종 출력 차이가 아니다.
- 다수 구성품 그룹의 가중치, 고정부품, 한쪽 그룹 누락 중 하나라면 문맥별 가격을 잃는 우리 구현은 실제 출력 차이를 만들 수 있다.

즉, `BundleExpander`가 문맥별 가격 대신 전역 `Product.deliveryPrice`를 쓰는 것은 **확정된 원인 후보**이지만, 83건 각각의 실제 영향 여부는 아직 확정되지 않았다.

## 5. 상업멀티 구성품 납품가는 시트값을 그대로 쓰는가

### 종합견적서

상업멀티 구성 시트 getter는 `납품가`를 읽고, 없으면 `출고가`를 fallback으로 `price`에 넣는다.

- `tools/legacy-gas/종합견적서/Code.js:894-915`
  > `const idxPrice    = findIdx_(H, ['납품가']);`
  > `...`
  > `const priceVal = idxPrice >= 0 ? parseKRNumber_(row[idxPrice]) : 0;`
  > `const basePrice = priceVal || listVal;`
- `tools/legacy-gas/종합견적서/Code.js:923-935`
  > `out.push({ ... price: basePrice, ... qty: qty });`

상업멀티 전개에는 싱글의 `splitIndoorOutdoorToK` 같은 세트 총액 재배분이 없다. 다만 최종 단가의 우선 소스는 소비 경로별로 구분해야 한다.

- 미리보기 보조 함수는 `commUnitPrice(구성품 모델)`을 먼저 쓰고, 그것이 0이면 구성 시트의 `p.price`를 쓴다.
  - `tools/legacy-gas/종합견적서/index.html:6773-6782`
    > `const unitPrice = ... (commUnitPrice(p.model) || 0) ... || p.price || 0;`
- 화면의 세트 구성 행은 `commUnitPrice(p.model)`만 사용한다.
  - `tools/legacy-gas/종합견적서/index.html:6854-6856`
    > `const unit = typeof commUnitPrice === 'function' ? commUnitPrice(p.model) : 0;`
  - `tools/legacy-gas/종합견적서/index.html:6917-6931`
    > `<input ... value="${unit > 0 ? fmt(unit) : ''}" ...>`
    > `tdSub.innerHTML = \`${fmt(unit*effQ)}...\`;`
- 이 `commUnitPrice`는 `COMMULTI`에서 같은 모델을 찾아 그 행의 `price`(또는 출고가 할인 계산)를 쓴다.
  - `tools/legacy-gas/종합견적서/index.html:4039-4048`
    > `const r = (COMMULTI||[]).find(x=>x.model===model);`
    > `if(!r) return 0;`
    > `const sheetPrice = Math.round(Number(r.price)||0);`
  - `tools/legacy-gas/종합견적서/index.html:4071-4081`
    > `if (isVarChecked && listPrice > 0) { ... computed = Math.round(listPrice * (1 - finalRate)); }`
    > `else { computed = ... ? sheetPrice : listPrice; }`
- 전송 fallback도 `getRealCommPrice(p.model)` 즉 `COMMULTI` 모델 가격을 사용한다.
  - `tools/legacy-gas/종합견적서/index.html:6791-6828`
    > `const parts = COMM_PARTS.filter(p => p.refModel === setRow.model);`
    > `...`
    > `price: getRealCommPrice(p.model) || 0,`

따라서 **상업멀티는 재배분하지 않고 구성품별 직접 단가를 쓴다**는 판정은 맞다. 그러나 “항상 `상업멀티 구성` 시트의 납품가를 그대로 쓴다”는 문장은 코드상 거짓이다. 종합견적서의 주 화면·전송은 우선 `COMMULTI`의 같은 모델 가격/할인 계산을 사용하고, 구성 시트 `p.price`는 명시된 미리보기 fallback에서만 확인된다.

### 주문서

주문서는 구성품 직접 단가 규칙을 한 함수로 모아 두었다. 단가인상 조건이면 `COMM_PARTS_INC`, 아니면 `commUnitPrice(model)`, 그것도 0이면 구성 시트에서 온 `basePrice`를 쓴다. 재배분은 없다.

- `clients/web/order-app/index.html:2760-2767`
  > `function commPartUnitPrice(model, basePrice){`
  > `  ... if (incActive('commercialMulti', due) && COMM_PARTS_INC[model]) return COMM_PARTS_INC[model];`
  > `  return (commUnitPrice(model) || 0) || basePrice || 0;`
  > `}`
- `clients/web/order-app/index.html:4752-4765`
  > `const parts = partsForCommSet_(setRow.model);`
  > `...`
  > `const unit = commPartUnitPrice(p.model, p.price);`
  > `return { ... price: unit };`

그러므로 주문서도 상업멀티를 세트 단가로 재배분하지 않는다. 최종값은 조건에 따라 인상전 구성품값 → `COMMULTI` 동일 모델 계산값 → `COMM_PARTS` 구성 행값 순으로 정해진다.

우리 `BundleExpander`도 상업멀티 등 비싱글 세트에는 재배분하지 않고 각 구성품 `Product.deliveryPrice`를 반환한다.

- `services/product-service/src/main/java/com/samhanair/logis/product/service/BundleExpander.java:123-135`
  > `boolean isSingleSet = parent.getProductCategory() == ProductCategory.SINGLE_SET;`
  > `...`
  > `if (isSingleSet) { redistribute(...); }`
  > `...`
  > `BigDecimal unit = round(p.price).max(BigDecimal.ZERO);`

## 확정하지 못한 것

1. 측정된 불일치 83건 각각이 1+1 덮어쓰기 대상인지, 다수 그룹의 가중치인지, 고정부품인지, 한쪽 그룹 누락인지 코드만으로는 모른다. 각 세트의 실제 구성 행·종류·수량·옵션을 측정 결과와 join해야 한다.
2. 83건에 대응하는 현재 DB `Product.deliveryPrice`와 시트 문맥별 가격의 구체적 매핑은 DB·시트를 조회하지 않았으므로 모른다.
3. 주문서 bootstrap 서버가 반환하는 현재 데이터가 원시 시트값과 DB 포팅값 중 어느 배포 상태인지 이 파일만으로는 모른다. 서버의 `/partner-orders/bootstrap` 구현과 실행 환경 응답을 추가로 봐야 한다.
4. 상업멀티의 모든 구성품 모델이 `COMMULTI`에도 반드시 존재하는지는 코드만으로 보장되지 않는다. 실제 데이터 집합을 대조해야 한다. 존재하면 `COMMULTI` 가격 경로가 우선하고, 없으면 종합견적서 경로에 따라 0 또는 구성 시트 fallback이 된다.
5. `component_kind`가 모든 행에서 레거시 이름·구분 분류와 동일하게 적재됐는지는 DB를 조회하지 않았으므로 모른다.

## 신규 파일

- `docs/dev-reports/2026-08-08-896-set-component-price-source.md`
