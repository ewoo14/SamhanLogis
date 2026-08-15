# 종합견적서 업무 규칙 패리티 정찰

- 정찰일: 2026-08-15
- 정찰자: CODEX SOL
- 질문: **“종합견적서의 업무 규칙이 우리 시스템에 그대로 있는가?”**
- 범위: 레거시 `tools/legacy-gas/종합견적서/Code.js`, `tools/legacy-gas/종합견적서/index.html`과 현행 견적서 관리 화면, `clients/web/estimate-app`, 관련 견적 설정·스냅샷·전표 발행 서비스
- 방식: 정적 소스 대조만 수행했다. 공유 DB 조회·쓰기, 서비스 재기동, 배포, 실제 견적 저장·발행은 하지 않았다.

## 결론 요약

**그대로 있지 않다.** 확인한 25개 규칙의 판정은 **동일 12 · 다름 11 · 없음 0 · 확인 불가 2**다. 분류, DC 계산, 반올림, 세트 단가 배분, 창고 결정, 필수 입력, 조합비, 분지관 코드는 소스상 대체로 같다. 그러나 금액에 직접 닿는 구제품 할인율·I호스 단가·카드 수수료·선금 할인·절삭·VAT가 달라졌고, 자동 부속 수량과 저장·발행 생명주기도 달라졌다.

이 문서는 코드 차이를 현재 업무 정책의 정답으로 간주하지 않는다. 아래 모든 항목의 `🚨 업무 확인 필요`가 최종 판단 게이트다. 특히 1WAY는 양쪽 코드에 존재하더라도 지금 유효한 업무 규칙이라고 단정하지 않았다.

## 판정 기준

- **동일**: 확인한 입력과 결과 조건이 소스상 같다.
- **다름**: 같은 목적의 구현이 있으나 조건이나 결과가 다르다.
- **없음**: 현행 저장·발행 경로에서 대응 규칙을 찾지 못했다.
- **확인 불가**: 동적 카탈로그·가격 이력·운영 설정이 있어야 결과를 확정할 수 있다.

---

## R-01. 구제품 할인율과 고정 출고가

### ① 레거시 규칙

`tools/legacy-gas/종합견적서/index.html:2246-2268`

```js
function getRealOldPrice(model) {
  if (oldCustomPrices.has(model)) return oldCustomPrices.get(model);
  const item = OLD_PRODUCTS.find(p=>p.model===model);
  if(!item) return 0;
  const rateVal = parseInt(el('#old_rate')?.value || '50', 10);
```

`tools/legacy-gas/종합견적서/index.html:2260-2268`

```js
if(item.isDisc) {
  p = Math.round(p * (1 - rateVal/100));
} else {
  // 사용자가 출고가를 직접 고친 경우가 아니면 기존 고정가 유지
  if (!isCustom) {
    p = Math.round(Number(item.sheetPrice)||0);
  }
}
return roundByConfig(p, 'old');
```

### ② 우리 구현

현행 계산 구조는 같지만 기본값을 서버 설정에서 읽는다.

`clients/web/estimate-app/views/index.ejs:2421-2443`, `clients/web/estimate-app/views/index.ejs:2475-2476`

```js
const rateVal = parseInt(el('#old_rate')?.value || String(getOldDiscountPercent()), 10);
```

`clients/web/estimate-app/views/index.ejs:2475-2476`

```js
function getOldDiscountPercent() {
  return Math.round(estimateConfigNumber('oldDiscount', 0.5) * 100);
}
```

### ③ 판정

**다름** — 레거시는 화면 기본 50%이고, 현행은 변경 가능한 `oldDiscount`를 사용한다. 현행 설정의 기본값만 50%다.

### ④ 사용자 차이

운영 설정이 0.5가 아니면 같은 구제품도 레거시와 현행 견적 단가가 달라진다.

### ⑤ 업무 확인

**🚨 업무 확인 필요 — 최우선.** 구제품 할인율이 현재도 50% 고정인지, 거래처나 시점에 따라 바뀌어야 하는지 확인해야 한다.

---

## R-02. I호스 숨김 시 강제 단가

### ① 레거시 규칙

`tools/legacy-gas/종합견적서/index.html:3928-3935`

```js
function homeUnitPrice(model){
  const r = homeRowByModel.get(model);
  if(!r) return 0;
  const rawName = String(r.name || '');
  const showIHose = document.getElementById('home_hose_i')?.checked;
  if (!showIHose && /유연호스\s*I형/i.test(rawName)) return 7000;
```

### ② 우리 구현

`clients/web/estimate-app/views/index.ejs:4351-4357`

```js
function homeUnitPrice(model){
  const r = homeRowByModel.get(model);
  if(!r) return 0;
  const rawName = String(r.name || '');
  const showIHose = document.getElementById('home_hose_i')?.checked;
  if (!showIHose && /유연호스\s*I형/i.test(rawName)) return 8000;
```

같은 8,000원 규칙은 현행 싱글·상업·세트 계산에도 반복된다(`views/index.ejs:4421-4424`, `4465-4468`, `5146-5149`).

### ③ 판정

**다름** — 7,000원에서 8,000원으로 바뀌었다.

### ④ 사용자 차이

I호스를 숨기는 조건에서 해당 행 또는 세트 단가가 수량당 1,000원 높아진다.

### ⑤ 업무 확인

**🚨 업무 확인 필요 — 최우선.** 8,000원이 최신 정책인지, “숨김”이 무료가 아니라 강제 단가를 뜻하는 이유까지 확인해야 한다.

---

## R-03. 카드 결제 수수료

### ① 레거시 규칙

`tools/legacy-gas/종합견적서/index.html:16172-16201`

```js
const total = rows.reduce((acc, r) => acc + (r.sub || (r.price * r.qty) || 0), 0);
const fee = Math.floor(total * 0.03);
let target = rows.find(r => r.qty === 1 && r.type !== 'set-head');
if (!target) target = rows.find(r => r.qty === 1);
if (target) {
  target.price += fee;
  if (target.sub !== undefined) target.sub += fee;
}
```

### ② 우리 구현

`clients/web/estimate-app/views/index.ejs:16921-16939`

```js
const total = rows.reduce((acc, r) => acc + (r.sub || (r.price * r.qty) || 0), 0);
const fee = Math.floor(total * getCardFeeRate());
```

`getCardFeeRate()`는 `cardFeeRate` 설정을 읽고 0.03을 fallback으로 쓴다(`views/index.ejs:2479-2480`).

### ③ 판정

**다름** — 행에 합산하는 방식은 같지만 요율이 3% 고정에서 설정값으로 바뀌었다.

### ④ 사용자 차이

운영 요율이 3%가 아니면 카드 선택 시 최종 견적 합계가 달라진다.

### ⑤ 업무 확인

**🚨 업무 확인 필요 — 최우선.** 카드 수수료 전가 자체와 현재 적용 요율을 확인해야 한다.

---

## R-04. 선결제 할인

### ① 레거시 규칙

레거시는 선결제를 입금예정일 표기로만 사용한다.

`tools/legacy-gas/종합견적서/index.html:15573-15578`

```js
payDue: document.getElementById('chkCardPay')?.checked ? '카드결제' : 
        (document.getElementById('payDueStar')?.checked ? '*' : 
        (document.getElementById('payDuePre')?.checked ? '선결제' : getVal('payDue'))),
```

### ② 우리 구현

현행은 선결제 선택과 설정 요율이 있으면 음수 할인행을 추가한다.

`clients/web/estimate-app/views/index.ejs:2574-2585`

```js
const advanceRate = estimateConfigNumber('advanceDiscountRate', 0);
if (opts && opts.advance === true && advanceRate > 0
    && !rows.some(r => String(r.name || '').includes('선금할인') || r.advanceDiscount)) {
  const discount = -Math.round(baseTotal * advanceRate);
  if (discount !== 0) {
    rows.push({ section:'ETC', type:'item', name:'선금할인', model:'선금할인', unit:'식', qty:1, price:discount, sub:discount, remarks:'선금 할인', cat:'기타', advanceDiscount:discount });
  }
}
```

### ③ 판정

**다름** — 현행에 금액 차감 규칙이 추가됐다. 설정이 0이면 실행되지 않는다.

### ④ 사용자 차이

선결제 선택 시 현행은 설정에 따라 견적 총액이 내려가지만 레거시는 결제 표기만 바뀐다.

### ⑤ 업무 확인

**🚨 업무 확인 필요 — 최우선.** 선결제 할인 존재 여부, 요율, 부가세·절삭·카드 수수료와의 적용 순서를 확인해야 한다.

---

## R-05. 총액 절삭

### ① 레거시 규칙

`tools/legacy-gas/종합견적서/index.html:16205-16235`

```js
const total = rows.reduce((acc, r) => acc + (r.sub || (r.price * r.qty) || 0), 0);
const rem = total % unit;
let target = rows.find(r => r.qty === 1 && r.type !== 'set-head');
if (target) {
  target.price -= rem;
  if (target.sub !== undefined) target.sub -= rem;
} else {
  rows.push({
    section: '기타',
    name: '절삭',
    model: '절삭',
    unit: '식',
    qty: 1,
    price: -rem,
    sub: -rem,
    remarks: ''
  });
}
```

### ② 우리 구현

`clients/web/estimate-app/views/index.ejs:16945-16969`

```js
const rem = total % unit;
let target = rows.find(r => r.qty === 1
  && r.type !== 'set-head'
  && r.source !== SPECIAL_ROW_SOURCE.CATALOG_SPECIAL);
```

현행은 사용자 카탈로그 특별행을 차감 대상으로 삼지 않는다.

### ③ 판정

**다름** — 차감 대상 선정 조건이 달라졌다.

### ④ 사용자 차이

수량 1인 특별행이 있는 견적에서 어느 품목 단가에 절삭액이 붙는지가 달라질 수 있다.

### ⑤ 업무 확인

**🚨 업무 확인 필요 — 최우선.** 특별행 보호가 현재 정책인지, 별도 음수 절삭행의 발행 허용 여부도 확인해야 한다.

---

## R-06. VAT 포함가 분리와 음수 부호

### ① 레거시 규칙

`tools/legacy-gas/종합견적서/Code.js:1843-1853`

```js
const qty = Math.round(Number(it.qty) || 0);
if (qty === 0) return; 
const priceVat = Math.round(Number(it.price) || 0);
const total = priceVat * qty;
const sup = Math.round(Math.abs(total) / 1.1);
const vat = Math.abs(total) - sup;
const supply = total < 0 ? -sup : sup;
const vatAmt = total < 0 ? -vat : vat;
const priceEx = priceVat < 0 ? -Math.round(Math.abs(priceVat) / 1.1) : Math.round(priceVat / 1.1);
```

### ② 우리 구현

`clients/web/estimate-app/lib/code.js:2356-2366`

```js
const qty = Math.round(Number(it.qty) || 0);
if (qty === 0) return;
const priceVat = Math.round(Number(it.price) || 0);
const total = priceVat * qty;
const split = splitVatAmount_(total, estimateConfig);
const unitSplit = splitVatAmount_(priceVat, estimateConfig);
const supply = split.supply;
const vatAmt = split.vat;
const priceEx = unitSplit.supply;
```

현행 분리 함수는 `vatRate` 설정을 사용한다(`clients/web/estimate-app/lib/code.js:461-468`). 반면 스냅샷 합계는 여전히 10%를 전제로 계산한다(`clients/web/estimate-app/views/index.ejs:18071-18076`).

### ③ 판정

**다름** — 10% 고정에서 설정 요율로 바뀌었고, 현행 내부에서도 발행과 스냅샷 계산 기준이 한 경로로 통일돼 있지 않다.

### ④ 사용자 차이

VAT 설정이 10%가 아니거나 음수 조정행이 있으면 화면 저장 합계와 발행 금액이 달라질 수 있다.

### ⑤ 업무 확인

**🚨 업무 확인 필요 — 최우선.** VAT 요율, 원 단위 반올림, 음수 할인행의 공급가·세액 처리 기준을 확인해야 한다.

---

## R-07. 전역·거래처 DC 우선순위

### ① 레거시 규칙

`tools/legacy-gas/종합견적서/index.html:2293-2312`

```js
const numOr = (v, d) => (typeof v === 'number' && isFinite(v)) ? v : d;
const homeRate = numOr(dc.homeDiscount, (typeof CONFIG.homeDiscount === 'number' ? CONFIG.homeDiscount : 0.45));
const commRate = numOr(dc.commDiscount, (typeof CONFIG.commDiscount === 'number' ? CONFIG.commDiscount : 0.45));
window.DISCOUNT_RATE_HOME = homeRate;
window.DISCOUNT_RATE_COMM = commRate;
```

### ② 우리 구현

`clients/web/estimate-app/views/index.ejs:2592-2611`에 같은 null/undefined 우선순위와 fallback이 있다. 서버는 사업자번호별 DC 설정을 읽어 이 구조로 매핑한다(`clients/web/estimate-app/lib/code.js:2143-2180`).

### ③ 판정

**동일** — 값의 저장소는 바뀌었지만 고객별 값이 있으면 우선하고 없으면 전역값을 쓰는 계산 규칙은 같다.

### ④ 사용자 차이

같은 설정값이 공급되면 사용자 계산 결과 차이는 없다.

### ⑤ 업무 확인

**🚨 업무 확인 필요.** 고객별 override가 지금도 유효한지와 이관된 설정값 자체가 같은지는 별도 확인해야 한다.

---

## R-08. 비율 DC·고정 DC 적용

### ① 레거시 규칙

`tools/legacy-gas/종합견적서/index.html:3928-3970`

```js
if (isVarChecked && listPrice > 0) {
  const parsedFixed = parseFixedDc(fixedDcVal);
  const finalRate = (parsedFixed !== null) ? parsedFixed : globalRate;
  computed = Math.round(listPrice * (1 - finalRate));
} else {
  computed = (sheetPrice > 0 && !homeCustomListPrices.has(model)) ? sheetPrice : listPrice;
}
return roundByConfig(computed, 'home');
```

### ② 우리 구현

`clients/web/estimate-app/views/index.ejs:4351-4393`에 같은 `fixedDc` 우선, 비율 차감, 고정가 fallback, 반올림 순서가 있다.

### ③ 판정

**동일** — I호스 강제 단가는 R-02로 분리했고, 일반 품목 DC 산식은 같다.

### ④ 사용자 차이

같은 가격표와 DC 설정이면 일반 품목 단가는 같다.

### ⑤ 업무 확인

**🚨 업무 확인 필요.** 품목별 고정 DC가 거래처 DC보다 우선하는 정책이 현재도 유효한지 확인해야 한다.

---

## R-09. 싱글 모델 고정액 DC와 1WAY 판별

### ① 레거시 규칙

`tools/legacy-gas/종합견적서/index.html:2200-2226`, `tools/legacy-gas/종합견적서/index.html:2992-3021`

```js
if (m.startsWith('AC') && m.length >= 9) {
    if (m[7] === '6' && m[8] === 'P') is360 = true;
    if (m[7] === '4' && (m[8] === 'P' || m[8] === 'D')) is4way = true;
    if (m[7] === '1' && (m[8] === 'P' || m[8] === 'D')) is1way = true;
}
```

`tools/legacy-gas/종합견적서/index.html:3014-3019`

```js
if(flags.is360 && d360 > 0) v = Math.max(0, v - d360);
if(flags.is4way && d4way > 0) v = Math.max(0, v - d4way);
if(flags.isStand && dStand > 0) v = Math.max(0, v - dStand);
if(flags.is1way && d1w > 0) v = Math.max(0, v - d1w);
if(flags.isDeluxe && dDeluxe > 0) v = Math.max(0, v - dDeluxe);
if(flags.isGrade1 && dFirst > 0) v = Math.max(0, v - dFirst);
```

### ② 우리 구현

`clients/web/estimate-app/views/index.ejs:2375-2401`, `clients/web/estimate-app/views/index.ejs:3291-3320`에 같은 모델 위치 판별과 고정액 차감·0원 하한이 있다.

### ③ 판정

**동일** — 코드상 판별과 차감 순서는 같다.

### ④ 사용자 차이

같은 모델과 설정액이면 사용자 계산 결과 차이는 없다.

### ⑤ 업무 확인

**🚨 업무 확인 필요 — 1WAY 중점.** 1WAY 고정액 DC가 코드에 양쪽 모두 있다는 사실은 현재 업무 규칙의 증거가 아니다. 각 제품군 DC의 현행 유효성을 확인해야 한다.

---

## R-10. 금액 반올림·올림·내림

### ① 레거시 규칙

`tools/legacy-gas/종합견적서/index.html:3031-3050`

```js
const unit = elUnit ? parseInt(elUnit.value, 10) : 0;
const mode = elMode ? elMode.value : 'ROUND';
if (unit > 0) {
  const x = v / unit;
  let out;
  if (mode === 'CEIL')      out = Math.ceil(x) * unit;
  else if (mode === 'FLOOR') out = Math.floor(x) * unit;
  else                       out = Math.round(x) * unit; 
  return out;
}
```

### ② 우리 구현

`clients/web/estimate-app/views/index.ejs:3330-3352`에 같은 단위 선택과 `CEIL`·`FLOOR`·`ROUND` 계산이 있다.

### ③ 판정

**동일** — 소스상 같은 입력에 같은 결과를 낸다.

### ④ 사용자 차이

같은 반올림 설정이면 차이가 없다.

### ⑤ 업무 확인

**🚨 업무 확인 필요.** 제품군별 반올림 단위와 모드가 현재 회계·영업 정책인지 확인해야 한다.

---

## R-11. 세트 옵션에 따른 단가 증감

### ① 레거시 규칙

`tools/legacy-gas/종합견적서/index.html:4715-4769`

```js
let panelDelta=0;
if(basePanel){
  const baseP=partUnitPrice(basePanel);
  if(panelExcluded) panelDelta-=baseP;
  else if(chosenPanel && chosenPanel.model!==basePanel.model){
    panelDelta += (partUnitPrice(chosenPanel)-baseP);
  }
}
```

### ② 우리 구현

`clients/web/estimate-app/views/index.ejs:5144-5198`에 기본 패널·리모컨을 빼고 선택 옵션을 더하며, 고정 DC 후 0원 하한을 적용하는 같은 흐름이 있다.

### ③ 판정

**동일** — I호스 단가 차이는 R-02로 분리했고 옵션 차액 규칙은 같다.

### ④ 사용자 차이

같은 구성품 가격이면 옵션 변경에 따른 세트 단가 차이는 없다.

### ⑤ 업무 확인

**🚨 업무 확인 필요.** 기본 옵션 교체를 차액만 반영하는 정책이 현재도 유효한지 확인해야 한다.

---

## R-12. 세트 단가의 구성품 배분

### ① 레거시 규칙

`tools/legacy-gas/종합견적서/index.html:4839-4848`

```js
// 세트비율결정
const fixedCls = classifySingleSetFixed(s);
const isHousehold =
  /가정용\s*에어컨/.test(String(fixedCls?.catL||'')) ||
  /가정용\s*에어컨/.test(String(s?.name||''));
const ratioIn = isHousehold ? 6 : 4;
const ratioOut = isHousehold ? 4 : 6;
```

### ② 우리 구현

`clients/web/estimate-app/views/index.ejs:5270-5279`에 가정용 6:4, 그 외 4:6 가중치가 같고, `views/index.ejs:5300-5341`에서 천원 단위 배분 후 잔액을 마지막 대상에 보정한다.

### ③ 판정

**동일** — 배분 비율과 잔액 보정 구조가 같다.

### ④ 사용자 차이

같은 세트 총액과 구성품이면 구성품별 발행 단가 차이는 없다.

### ⑤ 업무 확인

**🚨 업무 확인 필요 — 최우선.** 가정용 6:4와 그 외 4:6 배분이 현재 세무·매출 정책인지 확인해야 한다.

---

## R-13. 규격·출고가 수동 수정

### ① 레거시 규칙

`tools/legacy-gas/종합견적서/index.html:2383-2400`

```js
function getRealSpec(type, model, defaultVal) {
  if (type === 'HOME' && typeof homeCustomSpecs !== 'undefined' && homeCustomSpecs.has(model)) return homeCustomSpecs.get(model);
  if (type === 'COMM' && typeof commCustomSpecs !== 'undefined' && commCustomSpecs.has(model)) return commCustomSpecs.get(model);
  if (type === 'OLD' && typeof oldCustomSpecs !== 'undefined' && oldCustomSpecs.has(model)) return oldCustomSpecs.get(model);
  return defaultVal;
}
```

### ② 우리 구현

`clients/web/estimate-app/views/index.ejs:2682-2699`에 같은 규격 override map이 있고, 출고가·판매가 수정도 각각 `views/index.ejs:2750`, `2867`의 입력 처리에서 유지된다.

### ③ 판정

**동일** — 사용자가 입력한 값을 기본 카탈로그 값보다 우선하는 규칙은 같다.

### ④ 사용자 차이

웹 종합견적서에서는 같은 방식으로 규격과 가격을 직접 고칠 수 있다.

### ⑤ 업무 확인

**🚨 업무 확인 필요.** 수동 가격 수정 권한과 수정값의 발행 허용 범위를 확인해야 한다.

---

## R-14. 가격 기준일·가격표 variant

### ① 레거시 규칙

`tools/legacy-gas/종합견적서/Code.js:2971-2977`, `tools/legacy-gas/종합견적서/Code.js:3004-3009`

```js
const H = (vr[hdrRow] || []).map(v => String(v || '').trim().replace(/\s+/g, ''));
const idxModel = findIdx_(H, ['모델명','모델','품목코드','기종']);
const idxList = findIdx_(H, ['출고가','list','리스트','소비자가']);
const idxPrices = H.map((v,i) => v === '납품가' ? i : -1).filter(i => i >= 0);
const idxPrice = idxPrices.length ? idxPrices[idxPrices.length - 1] : findIdx_(H, ['납품가']);
```

```js
readSheet('홈멀티', out.home, false);
readSheet('상업멀티', out.comm, false);
readSheet('상업멀티 구성', out.comm, false);
readSheet('싱글 세트', out.single, true);
readSheet('싱글 구성품', out.single, true);
```

### ② 우리 구현

현행은 제품 서비스의 일정과 기본 variant를 읽는다.

`clients/web/estimate-app/lib/db-catalog.js:223-239`

```js
async function priceChangeSchedule() {
  const resp = await ax.get(`${PRODUCT_BASE}/products/internal/price-change-schedule`, {
    headers: { 'X-Internal-Token': INTERNAL_TOKEN },
  });
}
async function priceDefaultVariant() {
  const resp = await ax.get(`${PRODUCT_BASE}/products/internal/price-change-default-variant`, {
    headers: { 'X-Internal-Token': INTERNAL_TOKEN },
  });
}
```

화면은 variant에 따라 인상 가격표를 선택한다(`views/index.ejs:2274-2288`).

### ③ 판정

**확인 불가** — 저장소와 선택 경로는 바뀌었고, 운영 DB의 가격 이력·기본 variant를 조회하지 않아 실제 기준일과 금액 동등성을 확정할 수 없다.

### ④ 사용자 차이

운영 데이터가 시트와 다르면 같은 날짜·모델의 기준 출고가가 달라질 수 있다.

### ⑤ 업무 확인

**🚨 업무 확인 필요 — 최우선.** 가격 변경 효력일, 기본 variant, 과거 견적 재열람 시 적용할 가격 기준을 확인해야 한다.

---

## R-15. 미판매·단종 제외와 품절 표시

### ① 레거시 규칙

`tools/legacy-gas/종합견적서/Code.js:257-267`

```js
function isBlockedByNote_(note){
  const s = String(note || '').replace(/\s+/g,'');
  if(!s) return false;
  return /미판매|단종/.test(s);
}
function isSoldOutByNote_(note){
  const s = String(note || '').replace(/\s+/g,'');
  return /품절/.test(s);
}
```

### ② 우리 구현

`clients/web/estimate-app/lib/db-catalog.js:66-72`

```js
const statusNote = (status) => ({
  DISCONTINUED: '단종',
  NOT_FOR_SALE: '미판매',
  OUT_OF_STOCK: '품절',
}[String(status || '')] || '');
```

화면의 품절 날짜 해석은 `views/index.ejs:3155-3170`에 남아 있다.

### ③ 판정

**확인 불가** — 상태 의미의 매핑은 있으나 실제 운영 제품 상태와 레거시 비고가 동등한지는 DB를 조회하지 않아 확정할 수 없다.

### ④ 사용자 차이

상태 이관이 다르면 검색 가능 여부와 품절 경고가 달라질 수 있다.

### ⑤ 업무 확인

**🚨 업무 확인 필요.** 단종·미판매는 완전 제외인지, 품절은 선택 허용인지와 날짜 문자열의 의미를 확인해야 한다.

---

## R-16. HOME·SINGLE·COMM 품목 분류

### ① 레거시 규칙

`tools/legacy-gas/종합견적서/Code.js:314-340`

```js
if (/^실내기|[\s_\-]실내기/.test(n) || /벽걸이/.test(n)) {
  catL = '실내기';
  if (/1\s*-?\s*Way/i.test(n)) {
    if (/WIFI\s*내장/i.test(n)) catM = '1-Way WIFI';
    else if (/인피니트\s*UV/i.test(n)) catM = '1-Way 인피니트UV';
    else if (/인피니트/i.test(n)) catM = '1-Way 인피니트';
    else catM = '1-Way 미내장';
```

싱글과 상업멀티 분류는 각각 `Code.js:448-473`, `684-765`에 있다.

### ② 우리 구현

현행의 세 분류기는 `clients/web/estimate-app/lib/code.js:549-595`, `602-627`, `634-710`에 같은 정규식·분기 순서로 존재한다.

### ③ 판정

**동일** — 이번 대상인 종합견적서 파일을 직접 대조했으며, 1WAY를 포함한 코드 분류 조건은 같다.

### ④ 사용자 차이

같은 품명 문자열이면 같은 대·중분류에 들어간다.

### ⑤ 업무 확인

**🚨 업무 확인 필요 — 1WAY 중점.** 코드 동등성과 별개로 1WAY 및 다른 이름 기반 분류가 현재 카탈로그 업무 정의와 맞는지 확인해야 한다.

---

## R-17. 품목 기반 창고 결정

### ① 레거시 규칙

`tools/legacy-gas/종합견적서/Code.js:1639-1678`

```js
var homeHit = items.some(function(it){
  if (getSection_(it) !== 'HOME') return false;
  var nm = getOrigName_(it);
  return /인피니트/.test(nm);
});
```

`tools/legacy-gas/종합견적서/Code.js:1666-1678`

```js
if (/360/i.test(nm)) return true;
if (/1등급/.test(nm)) return true;
if (/냉방전용/.test(nm)) return true;
if (/1\s*way/i.test(nm)) return true;
if (/덕트/.test(nm)) return true;
if (/냉전/.test(nm)) return true;
if (/비스포크/.test(nm)) return true;
if (/벽걸이/.test(nm)) return true;
if (/가정용\s*에어컨/.test(nm)) return true;
return false;
});
return (homeHit || singleHit) ? '2' : '00003';
```

### ② 우리 구현

`clients/web/estimate-app/lib/code.js:2246-2284`에 HOME 인피니트와 SINGLE 360·1등급·냉방전용·1way·덕트·냉전·비스포크·벽걸이·가정용 에어컨 조건 및 결과 `'2'`/`'00003'`가 같다.

### ③ 판정

**동일** — 품목 판별 목록과 창고 코드가 같다.

### ④ 사용자 차이

같은 품목 목록이면 웹 종합견적서 발행 창고 결과는 같다.

### ⑤ 업무 확인

**🚨 업무 확인 필요 — 1WAY 중점.** 품목 목록과 창고 `2`·`00003`이 현재 물류 정책인지 확인해야 한다.

---

## R-18. 확정 전 필수 입력과 차단

### ① 레거시 규칙

`tools/legacy-gas/종합견적서/index.html:14555-14584`

```js
const isAuditOk = (sameAddr && sameAddr.checked) || (auditLater && auditLater.checked) || (addrAuditBase && addrAuditBase.value.trim());
if (!isAuditOk && !failReason) failReason = '감리주소';
const tv = tel ? tel.value.trim() : '';
const isTel = /^010-\d{4}-\d{4}$/.test(tv);
if (!isTel && !failReason) failReason = '인수자번호';
if ((!memo || !memo.value.trim()) && !failReason) failReason = '요청사항';
```

### ② 우리 구현

`clients/web/estimate-app/views/index.ejs:15155-15183`에 감리주소 선택/직접입력, 전화 형식, 메모, 결제일, 품목 존재의 같은 차단 조건이 있다. 최종 전송 직전에도 거래처·결제일·주소를 재검사한다(`views/index.ejs:16165-16168`).

### ③ 판정

**동일** — 웹 확정 게이트의 핵심 조건은 같다.

### ④ 사용자 차이

같은 누락 입력에서 같은 종류의 확정 차단을 겪는다.

### ⑤ 업무 확인

**🚨 업무 확인 필요.** 인수자번호를 `010-0000-0000` 형식으로 필수화하는 것과 요청사항을 필수화하는 정책이 현재도 유효한지 확인해야 한다.

---

## R-19. 홈멀티 부속 수량 동기화

### ① 레거시 규칙

`tools/legacy-gas/종합견적서/index.html:7900-7914`

```js
function recomputeHomeDerived(updateUI) {
  // 실내기집계
  let n1w=0, n4w=0, c360=0;
  HOMEMULTI.forEach(r => {
    const q = homeQty.get(r.model) || 0;
    if (!q) return;
    const nm = String(r?.name || '');
    if (/(실내기|벽걸이)/i.test(nm)) {
}
```

패널·리모컨·분지관 계산은 각각 `index.html:7679-7791`, `7792-7836`, `7839-7897`의 정적 규칙으로 수량을 만든다.

### ② 우리 구현

현행은 레거시 계산 뒤 서버 활성 규칙의 대상 수량을 다시 덮는다.

`clients/web/estimate-app/views/index.ejs:8468-8484`

```js
function recomputeHomeDerived(updateUI) {
  /* 서버 규칙을 읽지 못한 구버전/장애 fallback — legacy 계산은 항상 먼저 실행한다. */
  // 기존 환경 호환 경계(typeof applyServerHomeQuantitySync_ === 'function')는 유지한다.
```

서버 규칙 조회는 `clients/web/estimate-app/lib/db-catalog.js:48-54`, 적용은 `views/index.ejs:8435-8464`, 레거시 계산 뒤 override는 `views/index.ejs:8496-8549`에 있다.

### ③ 판정

**다름** — 레거시 정적 계산만 쓰지 않고 활성 서버 규칙이 특정 target을 소유해 override할 수 있다.

### ④ 사용자 차이

같은 실내·실외기 조합이라도 운영 수량 규칙에 따라 패널·리모컨·분지관·호스 수량이 달라질 수 있다.

### ⑤ 업무 확인

**🚨 업무 확인 필요.** 서버 규칙을 정답으로 볼지, 수동 수정 보존 범위와 각 부속 공식의 현행 유효성을 확인해야 한다.

---

## R-20. 상업멀티 부속 수량 동기화

### ① 레거시 규칙

`tools/legacy-gas/종합견적서/index.html:7957-7974`

```js
function recomputeCommDerived() {
  const want = new Map();

  /* 수동제외초기화 */
  COMMULTI.forEach(r => {
    if (isCommPanelRow(r)) want.set(r.model, 0);
    if (isCommHoseRow(r)) want.set(r.model, 0);
    if (isCommRemoteRow(r)) want.set(r.model, 0);
    if (isCommPumpRow(r)) want.set(r.model, 0);
```

이 함수는 실내기 유형 합계로 패널·리모컨·드레인펌프·베이스·분지관·필터·호스 수량을 계산한다(`index.html:7957-8162`).

### ② 우리 구현

현행 함수는 `clients/web/estimate-app/views/index.ejs:8651-8867`에 있으나 필수 카탈로그 행 검사, 예외 모델 처리, `HOSE_1W` 고정 대상, I호스 표시 조건이 추가됐다.

### ③ 판정

**다름** — 핵심 합계 공식은 남았지만 대상 선택·누락 처리·호스 조건이 달라졌다.

### ④ 사용자 차이

카탈로그 누락이나 예외 모델, 1WAY/I호스 조합에서 자동 부속 수량 또는 오류 표시가 달라질 수 있다.

### ⑤ 업무 확인

**🚨 업무 확인 필요 — 1WAY 중점.** 상업멀티 각 부속 공식과 새 예외가 실제 설치·출고 규칙인지 확인해야 한다.

---

## R-21. 홈·상업 조합비 판정

### ① 레거시 규칙

`tools/legacy-gas/종합견적서/index.html:4526-4555`, `tools/legacy-gas/종합견적서/index.html:4600-4645`

```js
const ratio = (inCap / outCap) * 100;
const ratioTxt = new Intl.NumberFormat('ko-KR',{minimumFractionDigits:1,maximumFractionDigits:1}).format(ratio);
box.textContent = `조합비 : ${ratioTxt}%`;
const isBad = ratio > 130;
```

`tools/legacy-gas/종합견적서/index.html:4630-4641`

```js
const hasStrict = COMMULTI.some(r => {
  const q = commQty.get(r.model) || 0; if(!q) return false;
  if(!isCommOutdoorRow(r)) return false;
  const n = rawNameOf(r) + ' ' + String(r?.disp || '');
  return /(프라임|한랭지|표준형|냉난방|가스히트펌프|GHP|프레스티지|동시냉난방|공장전원)/i.test(n);
});
const limit = hasStrict ? 103.0 : 120.0;
const isBad = parseFloat(ratioTxt) >= limit;
```

### ② 우리 구현

`clients/web/estimate-app/views/index.ejs:4897-4980`, `4984-5070`에 홈 130% 초과와 상업 엄격군 103%/일반 120% 이상 판정이 같다.

### ③ 판정

**동일** — 비율과 경계 연산자가 같다. 양쪽 모두 이 경고를 `checkOrderReady`의 발행 차단 조건으로 사용하지 않는다.

### ④ 사용자 차이

같은 조합에서 같은 조합비 경고를 보며, 경고만으로 발행이 막히지는 않는다.

### ⑤ 업무 확인

**🚨 업무 확인 필요.** 130·103·120 기준과 “경고만 하고 발행 허용” 정책을 확인해야 한다.

---

## R-22. 분지관 코드 생성

### ① 레거시 규칙

`tools/legacy-gas/종합견적서/index.html:12338-12344`

```js
function codeByCumulativeSum(csum){
  if(csum < 150) return '1509';
  if(csum < 406) return '2512';
  if(csum < 464) return '2812';
  if(csum < 696) return '2815';
  if(csum < 986) return '3419';
  return '4119';
}
```

### ② 우리 구현

`clients/web/estimate-app/views/index.ejs:12930-12952`에 같은 누적 용량 경계와 실외기 HP 보정표가 있고, 이를 분지관 행에 적용하는 흐름은 `views/index.ejs:12953-13022`에 있다.

### ③ 판정

**동일** — 코드 구간과 마지막 보정 규칙이 같다.

### ④ 사용자 차이

같은 실내기 순서·용량과 실외기 HP이면 같은 분지관 코드가 생성된다.

### ⑤ 업무 확인

**🚨 업무 확인 필요.** 누적 용량 구간과 실외기 HP 보정표가 최신 자재 기준인지 확인해야 한다.

---

## R-23. 음수 수량·금액 허용

### ① 레거시 규칙

`tools/legacy-gas/종합견적서/index.html:2948-2952`, `tools/legacy-gas/종합견적서/Code.js:1843-1848`

```js
const toInt=v=>{const m=String(v||'').replace(/[^0-9-]/g,'');if(m===''||m==='-')return 0;return Math.max(-999999,Math.min(999999,parseInt(m,10)));};
```

```js
const qty = Math.round(Number(it.qty) || 0);
if (qty === 0) return; 
const priceVat = Math.round(Number(it.price) || 0);
const total = priceVat * qty;
```

### ② 우리 구현

웹 입력은 음수를 여전히 허용한다(`clients/web/estimate-app/views/index.ejs:3247-3251`). 그러나 내부 발행 서비스는 수량이 0보다 커야 한다(`services/slip-service/src/main/java/com/samhanair/logis/slip/publish/SlipPublishService.java:813-821`). 견적 관리 생성 계약도 수량에 `@Positive`, 가격에 `@PositiveOrZero`를 둔다(`services/slip-service/src/main/java/com/samhanair/logis/slip/estimate/web/dto/CreateEstimateRequest.java:28-38`).

### ③ 판정

**다름** — 화면은 레거시 입력을 유지하지만 현행 서버 계약은 음수 수량·단가를 정상 견적행으로 허용하지 않는다.

### ④ 사용자 차이

레거시에서 가능했던 음수 정정행이 현행 저장 또는 발행에서 거부되거나 다른 값으로 처리될 수 있다.

### ⑤ 업무 확인

**🚨 업무 확인 필요 — 최우선.** 할인·반품·정정에 음수 수량/단가/합계 중 무엇을 허용할지 확인해야 한다.

---

## R-24. 견적 저장과 수정 생명주기

### ① 레거시 규칙

`tools/legacy-gas/종합견적서/Code.js:2724-2744`

```js
function saveQuoteSnapshot(payload) {
  try {
    const email = Session.getActiveUser().getEmail();
    const fullData = payload.data;
    const imgData = payload.image || '';
    const custName = payload.summary.custName || '미지정';
    const nowStr = Utilities.formatDate(new Date(), "GMT+9", "yyyy-MM-dd'T'HH:mm:ss+09:00");
```

레거시는 매 저장마다 Notion 페이지를 만들고 작성자 이메일로 이력을 거른다(`Code.js:2791-2827`).

### ② 우리 구현

현행 웹은 `snapshotId`가 있으면 기존 스냅샷을 수정하고 없으면 생성한다(`clients/web/estimate-app/lib/code.js:2473-2515`). 데스크톱 견적서 관리 목록은 내부 견적과 웹 스냅샷을 합쳐 보여 주지만 출처를 분리한다(`clients/desktop/src/renderer/routes/EstimateListPage.tsx:209-226`, `575-593`). 웹 스냅샷은 목록에서 별도 상태 전이 없이 “저장됨”으로 표시된다(`EstimateListPage.tsx:726`).

### ③ 판정

**다름** — 저장소, 작성자 범위, 새 문서 생성/기존 문서 수정, 견적 관리 상태 모델이 다르다.

### ④ 사용자 차이

현행 사용자는 한 목록에서 두 출처를 보지만 웹 견적은 내부 견적의 DRAFT/SENT 등 상태 생명주기를 그대로 따르지 않는다.

### ⑤ 업무 확인

**🚨 업무 확인 필요.** 웹 스냅샷을 내부 견적과 같은 업무 문서로 볼지, 수정 권한·이력·상태의 기준을 확인해야 한다.

---

## R-25. 발행 성공의 의미와 상태 전이

### ① 레거시 규칙

`tools/legacy-gas/종합견적서/Code.js:1908-1927`

```js
const res = UrlFetchApp.fetch(url, {
  method: 'post',
  contentType: 'application/json',
  payload: JSON.stringify({ SESSION_ID: sessionId, ZONE: zone, payload: payload }),
  muteHttpExceptions: true
});
const text = res.getContentText();
let body; try { body = JSON.parse(text); } catch (e) { body = { raw: text }; }
const ok = (res.getResponseCode() === 200) && (body?.Data?.SuccessCnt > 0);
```

### ② 우리 구현

현행 웹은 내부 slip bridge를 호출한다(`clients/web/estimate-app/lib/code.js:2415-2421`). bridge는 내부 `/slips/internal/publish`의 2xx를 성공으로 본다(`clients/web/estimate-app/lib/slip-bridge.js:150-175`). 내부 서비스는 전표를 생성해 일반적으로 `DRAFT`를 반환한다(`services/slip-service/src/main/java/com/samhanair/logis/slip/publish/SlipPublishService.java:124-200`, `PublishSlipResponse.java:1-35`).

### ③ 판정

**다름** — 레거시 성공은 이카운트 주문서 생성 성공이고, 현행 성공은 내부 전표 생성 성공이다.

### ④ 사용자 차이

현행에서 성공 메시지를 봐도 그 시점에 이카운트 주문서까지 발행됐다고 볼 수 없다.

### ⑤ 업무 확인

**🚨 업무 확인 필요 — 최우선.** “견적 발행”이 내부 DRAFT 생성인지 외부 이카운트 반영인지, 사용자에게 보여 줄 완료 상태를 확인해야 한다.

---

## 정찰 범위와 미확인 영역

### 끝까지 본 범위

- 레거시 `tools/legacy-gas/종합견적서/Code.js` 전체 3,204줄과 `index.html` 전체 19,183줄을 함수·이벤트·저장/발행 경로 기준으로 검색하고 관련 블록을 대조했다.
- 현행 `clients/web/estimate-app/lib/code.js`, `lib/db-catalog.js`, `lib/slip-bridge.js`, `views/index.ejs`의 카탈로그 로드, 가격/DC, 자동 수량, 저장, 발행 경로를 대조했다.
- 관련 서비스의 견적 설정, 웹 스냅샷, 내부 견적 생성 제약, 전표 발행 경로와 데스크톱 견적서 관리 목록의 두 출처 병합을 확인했다.
- 다른 GAS 프로그램(거래처 발송 주문서·일마감·가입고)은 조사 범위에 포함하지 않았다.

### 규칙에서 제외한 것

- 색상, 패널 배치, 폰트, 모달 열기/닫기, 인쇄 CSS, 숫자 천단위 표시처럼 값의 업무 의미를 결정하지 않는 표시·포맷 코드
- 단순 API adapter, 로깅, retry, chunk 분할처럼 견적 값 자체를 결정하지 않는 전송 기술
- 테스트·mock·QA 캡처에만 존재하고 운영 경로에서 호출되지 않는 값

### 확인하지 못한 것

- 운영 DB의 제품 상태, 가격 변경 일정·기본 variant, 거래처별 DC, 구제품 할인율, VAT·카드·선금 설정값은 조회하지 않았다. 따라서 R-14와 R-15는 **확인 불가**이며, 설정 기반 규칙은 코드 판정과 실제 운영 결과가 다를 수 있다.
- 실제 저장·발행을 실행하지 않았으므로 음수행, 절삭행, 선금 할인행이 각 배포 환경에서 어떤 응답을 받는지는 확인하지 않았다.
- 이카운트의 후속 처리와 내부 `DRAFT` 이후 승인·전송은 이번 질문의 종합견적서 저장/발행 경계 밖이라 추적하지 않았다.
- 레거시 코드가 현재도 업무적으로 유효한지는 소스만으로 확정하지 않았다. 모든 항목은 업무 담당자 확인 전 잠정 판정이다.

## 업무 확인 우선순위(수정 제안 아님)

1. 구제품 할인, I호스 7,000/8,000원, 카드 수수료, 선결제 할인, 절삭, VAT와 음수 조정행
2. 세트 6:4/4:6 배분과 가격 기준일·variant
3. 1WAY를 포함한 분류·고정 DC·창고·자동 부속 수량 규칙
4. 웹 스냅샷과 내부 견적의 문서 정체성, 저장/수정 권한, 발행 성공 상태
