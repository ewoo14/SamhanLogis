# 거래처 발송 주문서 업무 규칙 패리티 정찰

- 정찰일: 2026-08-15
- 정찰자: CODEX SOL
- 질문: **“주문서웹(거래처 발송 주문서)의 업무 규칙이 우리 시스템에 그대로 있는가?”**
- 범위: 레거시 `tools/legacy-gas/거래처 발송 주문서/Code.js`, `tools/legacy-gas/거래처 발송 주문서/index.html`과 현행 주문서웹의 입력·확정·저장 경로
- 방식: 정적 소스 대조만 수행했다. 공유 DB 조회·쓰기, 서비스 재기동, 배포, 코드 실행에 의한 실데이터 주문 생성은 하지 않았다.

## 결론 요약

**그대로 있지 않다.** 화면의 필수 입력, 품목 병합, 조합비 표시, 세트 구성품 선택, 자동 부속 수량 공식 등은 상당 부분 복제되어 있다. 그러나 최종 확정 경로에서는 창고, 납기일, 입금예정일, 전화, 감리주소, 메모, 화면 계산 단가, 고정 DC 표지, 세트 배분 단가 등이 전달되지 않거나 서버 규칙으로 대체된다. 특히 레거시는 이카운트 주문서 성공을 전송 성공으로 보지만 현행은 내부 `DRAFT` 주문 생성까지만 수행한다.

이 문서는 코드 차이를 업무 정책의 정답으로 간주하지 않는다. 아래 모든 항목의 `🚨 업무 확인 필요`가 최종 판단 게이트다. 이미 확인된 1WAY 사례처럼 레거시 코드가 현재 업무 규칙이라는 보장은 없다.

## 판정 기준

- **동일**: 확인한 입력과 결과 조건이 소스상 같다.
- **다름**: 같은 목적의 구현이 있으나 조건이나 결과가 다르다.
- **없음**: 현행 확정·저장 경로에서 대응 규칙을 찾지 못했다.
- **확인 불가**: 동적 카탈로그·DC 설정·운영 데이터가 있어야 결과를 확정할 수 있다.

---

## R-01. 품목에 따른 창고 결정

### ① 레거시 규칙

`tools/legacy-gas/거래처 발송 주문서/Code.js:1846-1870`

```js
// 홈멀티: 인피니트
var homeHit = items.some(function(it){
  if (getSection_(it) !== 'HOME') return false;
  var nm = getOrigName_(it);
  return /인피니트/.test(nm);
});
// 싱글 세트: 360, 1등급, 냉방전용, 1way, 덕트, 냉전, 비스포크, 벽걸이, 가정용 에어컨
var singleHit = items.some(function(it){
  if (getSection_(it) !== 'SINGLE') return false;
  var nm = getOrigName_(it);
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

현행 확정 요청은 모델·분류·수량·비고만 만든다. 창고 값이 없다.

`clients/web/order-app/src/samhanApi.ts:208-234`

```ts
return { modelCode, categoryKey, quantity, remark }
```

`services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/service/PartnerOrderConfirmService.java:145-150`도 창고 없이 주문을 생성한다.

```java
PartnerOrder order = PartnerOrder.createFromConfirm(
        partnerId, partnerCode, bizCode, orderNo, idempotencyKey, BigDecimal.ZERO,
        request.deliveryAddress());
```

### ③ 판정

**없음** — 주문서웹 확정 시점의 품목 기반 창고 결정은 현행 계약에 없다. 이후 전표 전환 단계의 실제 창고 결과까지는 이 정찰 범위에서 확인하지 않았다.

### ④ 사용자 차이

레거시는 해당 품목이 하나라도 있으면 이카운트 주문서 창고가 `2`, 아니면 `00003`으로 확정된다. 현행 거래처 주문 생성 시에는 같은 결정을 하지 않는다.

### ⑤ 업무 확인

**🚨 업무 확인 필요 — 최우선.** 1WAY가 이미 “코드에는 있으나 현재 업무 설명과 충돌한” 사례다. 목록 전체와 기본 창고까지 각각 현재 유효한 주문서웹 정책인지 확인해야 한다.

---

## R-02. 전송 가능 필수 입력

### ① 레거시 규칙

`tools/legacy-gas/거래처 발송 주문서/index.html:5983-5985,6022-6035`

```js
function isValidTel(v){
  return /^010-\d{4}-\d{4}$/.test(String(v||'').trim());
}
const auditOK = same ? true : !!auditBase;
btn.disabled = !(memo && addr && telOK && auditOK);
```

메모, 배송 기본주소, `010-0000-0000` 형식 전화번호가 필수이고, 동일주소가 아니면 감리 기본주소도 필수다.

### ② 우리 구현

`clients/web/order-app/index.html:6369-6371,6408-6421`

```js
function isValidTel(v){
  return /^010-\d{4}-\d{4}$/.test(String(v||'').trim());
}
const auditOK = same ? true : !!auditBase;
btn.disabled = !(memo && addr && telOK && auditOK);
```

### ③ 판정

**동일** — 브라우저의 전송 버튼 활성 조건은 같다.

### ④ 사용자 차이

버튼 활성 여부에는 차이가 없다. 다만 입력값의 최종 저장 여부는 R-05와 다르다.

### ⑤ 업무 확인

**🚨 업무 확인 필요.** 메모·감리주소·휴대전화 형식을 지금도 거래처 주문의 필수 조건으로 강제해야 하는지, 그리고 필수라면 R-05처럼 저장되지 않는 현재 동작을 허용할지 확인이 필요하다.

---

## R-03. 거래처 식별과 미등록 전송 차단

### ① 레거시 규칙

`tools/legacy-gas/거래처 발송 주문서/Code.js:1976-1981`

```js
let key = safeNum(order?.bizno||'');
if (!key && order?.custCode) key = String(order.custCode).trim();
if (!key) return { ok:false, error:'사업자등록번호 없음' };
const custRec = searchCustomerByBizOrCode(key);
if (!custRec) return { ok:false, error:'미등록 거래처' };
const custFinal = custRec.code;
```

사업자번호가 우선이고 없으면 거래처코드로 조회한다. 둘 다 없거나 마스터에 없으면 전송을 막는다.

### ② 우리 구현

`clients/web/order-app/src/samhanApi.ts:255-260`

```ts
const bizCode = order && typeof order === 'object'
  ? String((order as { bizno?: unknown }).bizno ?? '').trim()
  : ''
if (!bizCode) throw new Error('주문 사업자번호가 없습니다')
return { headers: { 'X-Biz-Code': bizCode } }
```

`services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/service/PartnerOrderConfirmService.java:106-129`는 인증의 `partnerCode`, 헤더의 `bizCode`를 모두 요구하고 `partnerIdentityResolver.requirePartnerId(...)`로 등록 거래처 정체성을 확인한다.

### ③ 판정

**다름** — 미등록 차단 목적은 같지만 현행에는 `custCode` 단독 fallback이 없고, 인증 거래처코드와 사업자번호의 조합을 요구한다.

### ④ 사용자 차이

레거시에서 거래처코드만으로 보완되던 요청은 현행에서 사업자번호가 없으면 전송되지 않는다. 정상 로그인 흐름에서는 차이가 드러나지 않을 수 있다.

### ⑤ 업무 확인

**🚨 업무 확인 필요.** 거래처코드 fallback이 실제 업무상 필요한 예외인지, 과거 호환 코드일 뿐인지 확인해야 한다.

---

## R-04. 이카운트 담당자 자동 선택

### ① 레거시 규칙

`tools/legacy-gas/거래처 발송 주문서/Code.js:2008-2020`

```js
const mgrNameFromCust = String(custRec.manager || '').trim();
let empCdFinal = '';
if (mgrNameFromCust) {
  const m = findManagerByNameExact_(mgrNameFromCust);
  if (m && m.empCd) empCdFinal = m.empCd;
}
if (!empCdFinal) {
  empCdFinal = getScriptCreds_().EMP_CD;
}
```

거래처 담당자 이름을 정확히 매칭해 사원코드를 쓰고, 실패하면 공통 `EMP_CD`를 쓴다.

### ② 우리 구현

브라우저는 `managerName`을 주문 객체에 넣는다(`clients/web/order-app/index.html:6716-6724`). 그러나 확정 호출은 `{ lines }`만 보낸다(`clients/web/order-app/src/samhanApi.ts:378-391`). `ConfirmRequest`도 라인과 배송주소만 가진다(`services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/web/dto/ConfirmRequest.java:15-17`).

### ③ 판정

**없음** — 현행 거래처 주문 확정에는 담당자 이름→사원코드 선택 계약이 없다.

### ④ 사용자 차이

레거시는 전송 순간 이카운트 담당 사원을 정한다. 현행 내부 주문에는 주문서웹에서 선택한 담당자 정보가 남지 않으며, 이후 전표 전환에서 어떤 담당자가 쓰이는지는 이 범위에서 확인하지 못했다.

### ⑤ 업무 확인

**🚨 업무 확인 필요.** 거래처 담당자 우선/공통 사원 fallback이 현재도 유효한 배정 규칙인지 확인해야 한다.

---

## R-05. 납기·입금예정·주소·전화·메모의 확정 저장

### ① 레거시 규칙

`tools/legacy-gas/거래처 발송 주문서/Code.js:1996-2006,2197-2205`

```js
const dueYmd = toYmd(order?.due||'') || todayYMD_();
const payMMDD = toMmdd(order?.payDue||'');
const addrShip  = String(order?.addr||'');
const addrAudit = String(order?.auditAddr||'').trim() ? String(order.auditAddr).trim() : '-';
const tel       = normalizeTel_(order?.tel||'');
const memo      = String(order?.memo||'');
```

```js
TIME_DATE: timeDate,
U_TXT1: addrShip,
ADD_TXT_01_T: addrAudit,
ADD_TXT_03_T: tel || String(custRec.tel||''),
ADD_TXT_04_T: memo,
ADD_TXT_05_T: payMMDD,
```

납기 미입력은 오늘로 보정하고, 감리주소 미입력은 `-`, 전화 미입력은 거래처 전화로 보정한다.

### ② 우리 구현

브라우저는 이 값을 모두 만든다.

`clients/web/order-app/index.html:6712-6727`

```js
const order = {
  bizno: safeBizNo,
  managerName: el('#mgrQuery')?.value.trim() || '',
  addr: addrShip,
  auditAddr: addrAudit,
  tel: el('#tel').value.trim(),
  due: el('#due').value,
  payDue: el('#payDue').value,
  memo: el('#memo').value.trim(),
  // ...
};
```

하지만 이 객체는 임시저장 JSON에만 들어가고, 확정에는 라인만 전달된다.

`clients/web/order-app/src/samhanApi.ts:378-391`

```ts
payloadJson: JSON.stringify({ items, order }),
// ...
.post(`/partner-orders/${encodeURIComponent(draftId)}/confirm`, { lines }, headers)
```

현행 도메인에는 `dueDate`, `memo`, `deliveryAddress` 컬럼이 있지만(`PartnerOrder.java:92-102`), 직접 확정 생성은 전달받은 배송주소만 설정한다(`PartnerOrder.java:215-224`). 현재 클라이언트는 그 배송주소조차 확정 body에 보내지 않는다.

### ③ 판정

**다름** — 화면 입력은 있으나 직접 확정 주문의 정식 헤더로 저장되지 않는다. 전화·감리주소·입금예정일은 확정 계약 자체에 없다.

### ④ 사용자 차이

사용자는 필수값을 입력하고 전송 성공을 보지만, 생성된 내부 주문의 납기·메모·배송주소는 비어 있고 전화·감리주소·입금예정일은 주문 필드로 남지 않는다. 전체 입력은 만료 가능한 임시저장 JSON에만 남는다.

### ⑤ 업무 확인

**🚨 업무 확인 필요 — 최우선.** 각 헤더 값이 주문 원장에 반드시 보존되어야 하는지, 레거시 fallback(오늘·`-`·거래처전화)을 유지해야 하는지 업무 확인이 필요하다.

---

## R-06. 미판매·단종 제외와 품절·입고예정 선택 차단

### ① 레거시 규칙

서버 카탈로그 구성에서 `미판매`·`단종` 메모를 제외한다.

`tools/legacy-gas/거래처 발송 주문서/Code.js:523-528`

```js
function isBlockedByNote_(note){
  const s = String(note || '').replace(/\s+/g,'');
  if(!s) return false;
  return /미판매|단종/.test(s);
}
```

화면에서는 `품절` 또는 미래 `YYMMDD`를 수량 입력 대신 상태로 표시한다.

`tools/legacy-gas/거래처 발송 주문서/index.html:1443-1465`

```js
if (/품절/.test(s)) return { type: 'SOLD' };
const m = s.match(/(\d{2})(\d{2})(\d{2})/);
// ...
if (today < target) {
  return { type: 'FUTURE', label: m[2] + '.' + m[3] + ' 예정' };
}
```

### ② 우리 구현

현행 `getStockState_`는 같은 조건이다(`clients/web/order-app/index.html:1583-1605`). 다만 현행 카탈로그는 `product-service`의 `UsageScope.PARTNER_ORDER` 결과를 우선 사용한다(`services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/service/BootstrapService.java:301-309`). 이 경로가 레거시 메모의 `미판매|단종`과 정확히 같은 행을 제외하는지는 두 레거시 파일과 주문서웹 코드만으로 확인되지 않는다.

### ③ 판정

**확인 불가** — 화면에 전달된 메모의 품절·미래일 처리 규칙은 동일하지만, 애초 카탈로그에서 제외되는 품목 집합의 패리티는 동적 상품 노출 데이터가 필요하다.

### ④ 사용자 차이

같은 메모가 전달되면 선택 차단 표시는 같다. 그러나 어떤 품목이 목록 자체에서 사라지는지는 운영 상품 노출 설정에 따라 달라질 수 있다.

### ⑤ 업무 확인

**🚨 업무 확인 필요.** `미판매`, `단종`, `품절`, 미래 날짜 메모가 각각 “목록 제외”인지 “선택 차단”인지 현재 정책을 확인해야 한다.

---

## R-07. 품목 분류 — 홈멀티와 가정용 싱글

### ① 레거시 규칙

홈멀티는 분기관·리모컨·전열교환기·인테리어핏·제습기·받침대·1-Way 인피니트를 문자열로 재분류한다.

`tools/legacy-gas/거래처 발송 주문서/index.html:2361-2374`

```js
if (/분\s*기\s*관|Y형\s*분기관/i.test(nm) || /AXJ-YA2512N|AXJ-YA1509N/i.test(mdl)) {
  return { catL: '부자재', catM: '분기관', catS: S || '' };
}
if(/전열\s*교환기|에어콤보|에어콤포/i.test(nm)){L='전열교환기'; /* ... */}
```

가정용 싱글은 모두 `가정용 에어컨` 대분류 아래 5개 중분류로 묶는다.

`tools/legacy-gas/거래처 발송 주문서/index.html:2396-2409`

```js
L='가정용 에어컨';
if(isPro) M='무풍콤보 갤러리프로';
else if(isQ9000) M='Q9000';
else if(isClassic) M='무풍클래식';
else if(isGallery) M='무풍갤러리';
else M='24년형';
```

### ② 우리 구현

홈멀티 후처리는 같은 코드다(`clients/web/order-app/index.html:2612-2626`). 그러나 가정용 싱글은 연식별 대분류로 바뀌었다.

`clients/web/order-app/index.html:2647-2669`

```js
if(isPro){
  L='26년형 가정용 에어컨';
  M='무풍갤러리프로';
}else if(is25 || isClassicHigh || isClassic || isQ9000){
  L='25년형 가정용 에어컨';
  // ...
}else{
  L='24년형 가정용 에어컨';
  // ...
}
```

### ③ 판정

**다름** — 홈멀티 후처리는 동일하나 가정용 싱글 분류 트리는 다르다.

### ④ 사용자 차이

가정용 싱글을 찾을 때 레거시는 하나의 대분류에서 유형을 고르지만 현행은 24·25·26년형 대분류로 나뉜다. 같은 모델의 화면 탐색 위치와 분류명이 달라진다.

### ⑤ 업무 확인

**🚨 업무 확인 필요.** 연식별 분류가 의도된 최신 업무 분류인지, 레거시 5개 중분류가 기준인지 확인해야 한다.

---

## R-08. 홈멀티·상업멀티 자동 부속 수량

### ① 레거시 규칙

홈멀티는 실내기 명칭·Wi-Fi·크기·선택 옵션으로 판넬과 리모컨을 자동 산출한다(`index.html:4879-5002`, `5005-5055`). Y형 분기관은 다음 공식이다.

`tools/legacy-gas/거래처 발송 주문서/index.html:5091-5107`

```js
if (singleOutCount > 0){
  b2512 = sixHpSingleCount;
  b1509 = indoorCount - singleOutCount - sixHpSingleCount;
}
b2512 = Math.max(0, b2512);
b1509 = Math.max(0, b1509);
if (BRANCH_2512) homeQty.set(BRANCH_2512, b2512);
if (BRANCH_1509) homeQty.set(BRANCH_1509, b1509);
```

상업멀티는 실내기마다 판넬, 호스, 리모컨을 합산하고 모델별 펌프표를 적용한다.

`tools/legacy-gas/거래처 발송 주문서/index.html:5177-5183,5195-5203,5216-5228`

```js
const pm = computeCommPanelModelForIndoor_(r);
if(pm) want.set(pm, (want.get(pm)||0) + q);
// ...
if(useIHose && hose1I){ want.set(hose1I, nTarget); /* ... */ }
// ...
Object.entries(PUMP_MAP).forEach(([pump, list])=>{
  let sum = 0;
  list.forEach(m => { sum += Number(commQty.get(m)||0); });
  want.set(pump, sum);
});
```

### ② 우리 구현

핵심 공식은 현행 함수에도 남아 있다. 홈 분기관은 `clients/web/order-app/index.html:5487-5537`, 상업 파생은 `5687-5888`이다. 다만 현행은 파생품을 사용자가 직접 입력하면 잠그고 자동 재계산이 덮어쓰지 않는다.

`clients/web/order-app/index.html:2335-2339,5056-5065`

```js
function setDerivedQty(scope, state, model, quantity){
  registerDerivedQty(scope, model);
  if(!isManualQtyLocked(scope, model)) state.set(model, quantity);
}
// ...
if(isHomeDerivedRow(r, model)){
  const shouldLock = (explicit!==undefined) ? explicit : !!v;
  setManualQtyLock('home', model, shouldLock);
}
```

레거시는 판넬·리모컨을 먼저 전부 0으로 지운다(`index.html:4882-4886,5008-5009`).

### ③ 판정

**다름** — 자동 산출 공식의 중심은 같지만, 현행은 수동 입력 잠금을 보존하고 레거시는 재계산 때 파생 수량을 덮어쓴다. 현행은 누락 카탈로그 경고·fallback도 추가했다(`clients/web/order-app/index.html:5689-5707`).

### ④ 사용자 차이

같은 기본 입력이면 대체로 같은 부속 수량을 얻는다. 사용자가 판넬·리모컨·분기관 등 자동 품목 수량을 직접 바꾼 뒤 원품 수량을 수정하면, 레거시는 자동값으로 되돌릴 수 있지만 현행은 수동값을 유지한다. 카탈로그 품목 누락 시 현행은 경고할 수 있다.

### ⑤ 업무 확인

**🚨 업무 확인 필요.** 자동 수량을 절대값으로 강제할지, 사용자 수정값을 우선할지 확인해야 한다. 개별 판넬·리모컨·펌프 매핑표도 현재 판매 구성표와 별도 대조가 필요하다.

---

## R-09. 조합비 계산과 초과 처리

### ① 레거시 규칙

홈멀티는 `실내용량/실외용량×100`이 130%를 **초과**하면 경고색이다.

`tools/legacy-gas/거래처 발송 주문서/index.html:2941-2944`

```js
const ratio = (inCap / outCap) * 100;
box.textContent = `조합비 : ${ratioTxt}%`;
box.classList.toggle('bad', ratio > 130);
```

상업멀티는 프라임·한랭지·표준형·냉난방 실외기가 있으면 103%, 아니면 120%이며 한계값과 **같아도** 경고다.

`tools/legacy-gas/거래처 발송 주문서/index.html:2972-2983`

```js
return /(프라임|한랭지|표준형|냉난방)/i.test(nm);
// ...
const limit = hasStrict ? 103.0 : 120.0;
box.classList.toggle('bad', parseFloat(ratioTxt) >= limit);
```

이 경고는 `checkOrderReady`의 전송 차단 조건에 포함되지 않는다(R-02).

### ② 우리 구현

같은 계산과 경계 조건이 `clients/web/order-app/index.html:3161-3185,3190-3224`에 있다. 현행 `checkOrderReady` 역시 조합비를 검사하지 않는다(`6408-6421`).

### ③ 판정

**동일** — 비율, 경계값, “시각 경고만 하고 전송은 막지 않음”까지 같다.

### ④ 사용자 차이

없다. 초과 주문도 전송 버튼은 활성 상태일 수 있다.

### ⑤ 업무 확인

**🚨 업무 확인 필요.** 130/103/120 경계와 초과 시 경고만 할지 전송을 막을지는 업무 정책 확인이 필요하다.

---

## R-10. 전송 행 병합

### ① 레거시 규칙

모델코드와 단가가 모두 같은 행만 수량을 합치며, 표시명과 순서는 마지막 행을 따른다.

`tools/legacy-gas/거래처 발송 주문서/index.html:6038-6049`

```js
const model = String(it.model || '');
const price = Number(it.price || 0);
const key   = model + '||' + price;
if(map.has(key)){
  const prev = map.get(key);
  prev.qty = Number(prev.qty || 0) + Number(it.qty || 0);
```

### ② 우리 구현

`clients/web/order-app/index.html:6424-6456`에 같은 키, 합산, 마지막 이름·순서 규칙이 있다.

```js
const key   = model + '||' + price;
prev.qty = Number(prev.qty || 0) + Number(it.qty || 0);
prev.name = it.name;
prev._lastIndex = idx;
```

### ③ 판정

**동일** — 브라우저의 전송 행 병합은 같다.

### ④ 사용자 차이

화면에서 만들어지는 행 개수·수량에는 차이가 없다. 다만 현행 서버는 병합 키에 사용된 화면 단가를 받지 않고 다시 계산한다(R-12).

### ⑤ 업무 확인

**🚨 업무 확인 필요.** 같은 모델을 단가별로 별도 행으로 유지해야 하는지, 서버 재가격 후 같아진 행도 별도여야 하는지 확인해야 한다.

---

## R-11. 세트·상업 SET의 구성품 전개

### ① 레거시 규칙

상업멀티에서 단위가 `SET`이고 대분류가 실외기인 행은 본행을 보내지 않고 구성품으로 전개한다.

`tools/legacy-gas/거래처 발송 주문서/index.html:6166-6188`

```js
const isSet =
  String(r.unit||'').toUpperCase()==='SET' &&
  /실외기/.test(String(r.catL || r['대분류'] || ''));
if (isSet) {
  const parts = explodeCommSets_(r, q);
  parts.forEach(it=>{ rows.push({ section: 'COMM', /* ... */ }); });
}
```

싱글 세트 구성품은 발통·숨김자재를 제외하고, 선택 판넬·리모컨과 “자재 포함” 선택을 반영한다.

`tools/legacy-gas/거래처 발송 주문서/index.html:3118-3131`

```js
const picked = parts.filter(p => {
  if (isFoot(p) || isHideMat(p)) return false;
  // 선택 판넬만 포함
  if (isRemote(p)) return remoteModels.has(p.model);
  if (isMaterial(p)) return includeMat;
  return true;
});
```

### ② 우리 구현

상업 SET 전개는 `clients/web/order-app/index.html:6546-6568`, 싱글 구성품 선택은 `3332-3371`에 같은 조건으로 남아 있다. 확정 API도 전개된 각 모델과 수량을 라인으로 전달한다(`clients/web/order-app/src/samhanApi.ts:218-235`).

### ③ 판정

**동일** — 어떤 구성품 모델과 수량을 주문 라인 후보로 만드는지는 소스상 같다.

### ④ 사용자 차이

구성품 선택 자체에는 확인된 차이가 없다. 구성품별 단가 배분은 R-13처럼 다르다.

### ⑤ 업무 확인

**🚨 업무 확인 필요.** 상업 SET 본행 제외, 발통·숨김자재 제외, 판넬·리모컨 대체가 현재 세트 판매 규칙인지 확인해야 한다.

---

## R-12. 거래처 DC·옵션 DC·단가 절삭/반올림

### ① 레거시 규칙

홈·상업은 거래처별 비율 또는 품목 고정 DC를 적용하고 단위 반올림한다.

`tools/legacy-gas/거래처 발송 주문서/index.html:2471-2479`

```js
if (r.useK2 && currentListPrice > 0) {
  const fixedDc = parseFixedDc(r['고정DC'] ?? r.fixedDC ?? r.fixedDc ?? r.FixedDC);
  const useRate = (fixedDc ?? rate);
  computed = Math.round(currentListPrice * (1 - useRate));
} else {
  computed = currentSheetPrice > 0 ? currentSheetPrice : currentListPrice;
}
const finalVat = roundByConfig(computed);
```

싱글은 360·4way·스탠드·1way·디럭스·1등급 DC를 순서대로 적용하며, 값이 1 미만이면 비율, 아니면 정액 차감이다.

`tools/legacy-gas/거래처 발송 주문서/index.html:2542-2549`

```js
const calc = (val, rateAmt) => rateAmt < 1 ? Math.round(val * (1 - rateAmt)) : Math.max(0, val - rateAmt);
if (flags.is360 && d360 > 0) v = calc(v, d360);
// ... 4way, stand, 1way, deluxe, grade1
```

### ② 우리 구현

현행 브라우저에도 같은 계산식이 있다(`clients/web/order-app/index.html:2697-2858`). 그러나 확정은 화면 `price`, `fixedDc`, 여섯 플래그를 보내지 않고 모델·분류·수량만 보낸다(`clients/web/order-app/src/samhanApi.ts:194-235`). 서버가 상품 메타데이터와 DC 설정으로 다시 계산한다.

`services/dc-config-service/src/main/java/com/samhanair/logis/dcconfig/service/PriceCalculationService.java:65-72`

```java
BigDecimal appliedRate = pickCategoryRate(config, line.category(), line.fixedDiscountRate(),
        line.hasVariableDiscount(), applyNoMainEquipmentRule);
BigDecimal afterRate = listPrice.multiply(BigDecimal.ONE.subtract(appliedRate));
BigDecimal optionDc = sumOptionDc(config, line);
BigDecimal afterOption = afterRate.subtract(optionDc).max(BigDecimal.ZERO);
BigDecimal finalPrice = roundToUnit(afterOption, config);
```

반올림 단위·FLOOR·CEIL·ROUND 개념은 현행 서버에도 있다(`PriceCalculationService.java:183-198`). 반면 현행에는 레거시에 보이지 않는 “주문 전체에 메인 장비가 없고 판정 가능한 경우 가변 DC 40%” 규칙도 있다(`PriceCalculationService.java:62-68,130-141`).

### ③ 판정

**다름** — 기본 DC 개념과 단위 반올림은 대응하지만 권위가 브라우저/Notion에서 서버 상품·DC 설정으로 바뀌었고, 현행에 40% 추가 규칙이 있다. 운영 상품 메타데이터와 거래처 DC snapshot이 없어 숫자별 차이의 크기는 확인 불가다.

### ④ 사용자 차이

화면의 과거 계산값이 그대로 주문되는 것이 아니라 서버 결과가 최종값이다. 상품의 고정/가변 DC 메타데이터, 여섯 옵션 플래그, 거래처 설정이 다르면 단가가 달라질 수 있다. 메인 장비 없는 주문은 현행에서 레거시에 없는 40% 규칙을 적용받을 수 있다.

### ⑤ 업무 확인

**🚨 업무 확인 필요 — 최우선.** 거래처별 비율, 옵션 DC의 중첩 순서, 단위 반올림, “메인 장비 없음 40%”가 현재 승인된 가격 정책인지 각각 확인해야 한다.

---

## R-13. 납기일 기준 가격 변경과 세트 단가 배분

### ① 레거시 규칙

레거시는 고정 기준일 `2026-07-01` 이후 납기면 인상 맵을 사용한다.

`tools/legacy-gas/거래처 발송 주문서/index.html:1341-1342,2462-2466`

```js
const PRICE_INC_DATE = '2026-07-01';
// ...
if (due >= PRICE_INC_DATE && HOME_INC[model]) {
  currentListPrice = HOME_INC[model];
  currentSheetPrice = HOME_INC[model];
}
```

싱글 세트 총액은 선택 판넬·리모컨·자재를 더한 뒤, 가정용은 실내:실외 6:4, 그 외는 4:6으로 구성품에 배분한다.

`tools/legacy-gas/거래처 발송 주문서/index.html:3160-3171`

```js
const ratioIn = isHousehold ? 6 : 4;
const ratioOut = isHousehold ? 4 : 6;
const { indoor, outdoor, remain } = splitIndoorOutdoorToK(setUnit, fixedSum, ratioIn, ratioOut);
```

### ② 우리 구현

현행 화면은 카테고리별 변동일을 사용하고 의미가 반대인 Model B 맵으로 전환했다.

`clients/web/order-app/index.html:1446-1451`

```js
// Model B: due<변동일→*_INC(인상전), due>=변동일→base(인상후)
function incActive(categoryKey, due) {
  const effectiveDate = PRICE_CHANGE_SCHEDULE && PRICE_CHANGE_SCHEDULE[categoryKey];
  if (!effectiveDate || !due) return false;
  return due < String(effectiveDate);
}
```

화면의 세트 배분 코드는 남아 있다(`clients/web/order-app/index.html:3296-3420`). 그러나 확정 요청은 납기일과 배분된 가격을 모두 버리고 라인만 보낸다(`samhanApi.ts:208-235,378-391`). 서버 가격 계산도 `ConfirmRequest`의 라인만 소비한다(`PartnerOrderPriceCalculationService.java:54-76`).

### ③ 판정

**다름** — 화면 가격 기준일 모델이 변경됐고, 최종 확정 가격은 납기일이나 브라우저의 6:4/4:6 배분 단가를 입력으로 받지 않는다.

### ④ 사용자 차이

레거시는 사용자가 선택한 납기일과 세트 총액 배분이 이카운트 라인 단가를 결정한다. 현행은 같은 납기일을 입력해도 서버 확정 단가 계산에 그 날짜가 들어가지 않으며, 각 구성품이 서버에서 독립적으로 재가격된다.

### ⑤ 업무 확인

**🚨 업무 확인 필요 — 최우선.** 가격 적용 기준이 주문일인지 납기일인지, 기준일이 공통인지 카테고리별인지, 세트 총액을 6:4/4:6으로 보존해야 하는지 확인해야 한다.

---

## R-14. 구형 품목 50% DC

### ① 레거시 규칙

`tools/legacy-gas/거래처 발송 주문서/index.html:6245-6273`

```js
if(item.name === '품 명' || /운임|절삭/.test(item.name)) return;
// ...
if(item.isDisc === true){
  finalPrice = Math.round(listPrice * 0.5);
  rem = rem ? (rem + ' (50% DC)') : '(50% DC)';
} else {
  finalPrice = Math.round(Number(item.sheetPrice) || 0);
}
```

### ② 우리 구현

브라우저 코드는 동일하다(`clients/web/order-app/index.html:6625-6654`). 그러나 현행 `confirmLines`는 `isDisc`와 `price`를 보내지 않고 `remarks`만 보낸다(`clients/web/order-app/src/samhanApi.ts:194-235`). 서버는 `oldProducts`의 기준가로 상품 `releasePrice`를 선택한다(`PartnerOrderPriceCalculationService.java:255-271`).

### ③ 판정

**없음** — 확정 요청에서 “이 행은 50% DC”라는 판정 신호와 계산 단가가 사라진다. 서버 DC 결과가 우연히 같을 가능성의 수치 검증은 별도다.

### ④ 사용자 차이

화면 확인표에는 50% 단가와 `(50% DC)`가 보일 수 있지만, 확정 단가는 해당 플래그가 아닌 서버 상품·DC 설정으로 다시 정해진다. 비고 문자열은 남아도 50% 가격을 보장하지 않는다.

### ⑤ 업무 확인

**🚨 업무 확인 필요 — 최우선.** 구형의 `isDisc` 50%가 현재도 유효한 가격 규칙인지 먼저 확인해야 한다.

---

## R-15. VAT 분리, 원 단위 처리, 음수 금액

### ① 레거시 규칙

레거시는 VAT 포함 라인 합계를 `Math.round(total/1.1)`로 공급가액에 배분하고 나머지를 VAT로 둔다. 음수 단가도 부호를 보존한다.

`tools/legacy-gas/거래처 발송 주문서/Code.js:2122-2128`

```js
const priceVat = Math.round(Number(it.price)||0);
const total = priceVat * qty;
const sup = Math.round(Math.abs(total)/1.1);
const vat = Math.abs(total) - sup;
const supply = total<0 ? -sup : sup;
const vatAmt = total<0 ? -vat : vat;
```

### ② 우리 구현

현행 주문 라인은 VAT 포함 합계를 공통 계산기로 나누지만 기본 모드는 절사(`DOWN`)다.

`shared/common/src/main/java/com/samhanair/logis/common/financial/VatAmountCalculator.java:34-48`

```java
public static Split splitVatInclusive(BigDecimal lineTotal) {
    return splitVatInclusive(lineTotal, RoundingMode.DOWN);
}
BigDecimal supply = lineTotal.divide(VAT_DENOMINATOR, 0, roundingMode);
```

음수 합계는 거부한다(`VatAmountCalculator.java:40-43`). 확정 단가도 0보다 커야 한다(`PartnerOrderConfirmService.java:135-139,156-160`).

### ③ 판정

**다름** — 레거시는 반올림, 현행은 절사이며 레거시는 음수를 허용하지만 현행은 허용하지 않는다.

### ④ 사용자 차이

VAT 포함 합계를 1.1로 나눈 소수부가 0.5 이상인 라인은 공급가액과 VAT가 각각 1원씩 반대로 달라질 수 있다. 반품·차감처럼 음수 금액 행을 주문서웹에서 보내는 것은 현행에서 불가능하다.

### ⑤ 업무 확인

**🚨 업무 확인 필요.** 주문서의 공급가/VAT는 반올림인지 절사인지, 음수 주문 라인이 실제 업무에 필요한지 확인해야 한다.

---

## R-16. 규격과 DC 적요 생성

### ① 레거시 규칙

싱글은 `세트모델|구성품모델` 규격을 우선하고, 없으면 일반 모델 규격을 쓴다. 직전 행과 같은 규격은 zero-width 문자로 대체한다.

`tools/legacy-gas/거래처 발송 주문서/Code.js:2132-2150`

```js
if (sect === 'SINGLE' && it.setId != null) {
  const key2 = setModel + '|' + String(it.model || '');
  if (singleSpecBySetKey[key2]) rawSpec = String(singleSpecBySetKey[key2]);
}
if (!rawSpec) rawSpec = String(specMap[it.model] || '');
const sizeDes = (!norm || (prevSpecNorm!==null && norm===prevSpecNorm)) ? "\u200B" : rawSpec;
```

또 첫 행 주소, 두 번째 행 전역 DC, 품목 고정 DC, 싱글 옵션 DC를 이카운트 `REMARKS`에 합성한다(`Code.js:2152-2182`).

### ② 우리 구현

현행 확정 라인은 사용자가 만든 `remarks`만 전달한다(`clients/web/order-app/src/samhanApi.ts:194-235`). `price`, `fixedDc`, 세트 ID·옵션 플래그·규격은 전달하지 않는다. `PartnerOrderLine` 생성도 모델 snapshot, 분류, 수량, 서버단가, 전달된 비고만 받는다(`PartnerOrderConfirmService.java:152-166`).

### ③ 판정

**없음** — 레거시의 규격 우선순위·중복 억제와 주소/DC 적요 배치 규칙은 현행 직접 주문 라인 생성에 없다.

### ④ 사용자 차이

레거시 이카운트 주문서에는 구성품 규격과 할인 설명이 정해진 행에 자동 기재된다. 현행 내부 주문에는 그 정보가 자동 생성되지 않는다. 이후 전표 전환이 별도로 보강하는지는 이 범위에서 확인하지 못했다.

### ⑤ 업무 확인

**🚨 업무 확인 필요.** 규격 중복 억제와 할인율·주소를 적요에 넣는 방식이 현재 이카운트 문서 형식에서 필요한지 확인해야 한다.

---

## R-17. 임시저장 보존기간

### ① 레거시 규칙

레거시는 주문 전체 데이터와 미리보기 이미지를 Notion 페이지로 저장한다.

`tools/legacy-gas/거래처 발송 주문서/Code.js:105-118,131-158`

```js
const fullData = payload.data;
const imgData = payload.image || '';
// ... 2000자 chunk
const body = {
  parent: { database_id: NOTION_DB_ID_SNAPSHOT },
  properties: props
};
UrlFetchApp.fetch('https://api.notion.com/v1/pages', options);
```

두 레거시 파일 안에서는 만료·자동 삭제 규칙을 찾지 못했다.

### ② 우리 구현

현행 임시저장은 거래처별이며 TTL을 가진다.

`services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/service/PartnerOrderDraftService.java:30-37,80-85`

```java
/** 임시저장 ... 30일 TTL ({@link PartnerOrderProperties#getTtlDays}). */
// ...
LocalDateTime expiresAt = LocalDateTime.now().plusDays(properties.getTtlDays());
PartnerOrderDraft draft = PartnerOrderDraft.create(
        partnerCode, nextSeq, request.label(), request.payloadJson(), expiresAt);
```

만료 행은 soft delete한다(`PartnerOrderDraftService.java:148-168`). 실제 일수는 운영 설정값에 따라 달라질 수 있다.

### ③ 판정

**다름** — 현행에는 명시적 TTL과 만료 정리가 있다.

### ④ 사용자 차이

레거시 Notion snapshot은 두 파일상 자동 만료되지 않지만, 현행 임시저장은 설정된 기간 뒤 목록·복원 대상에서 사라질 수 있다.

### ⑤ 업무 확인

**🚨 업무 확인 필요.** 거래처 주문 초안의 필요한 보존기간과 만료 고지 방식이 현재 업무·감사 요건에 맞는지 확인해야 한다.

---

## R-18. 중복 전송 방지

### ① 레거시 규칙

레거시는 매 호출마다 이카운트 proxy로 POST한다.

`tools/legacy-gas/거래처 발송 주문서/Code.js:2233-2243`

```js
const res = UrlFetchApp.fetch(url, {
  method: 'post',
  payload: JSON.stringify({ SESSION_ID: sessionId, ZONE: zone, payload: { SaleOrderList } }),
  // ...
});
const ok = (code===200) && (body?.Data?.SuccessCnt > 0);
```

두 레거시 파일 안에서는 idempotency key나 동일 payload 재사용 가드를 찾지 못했다.

### ② 우리 구현

동일한 자동확정 payload의 유효 draft를 재사용한다.

`services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/service/PartnerOrderDraftService.java:67-77`

```java
var existing = draftRepository
        .findFirstByPartnerCodeAndLabelAndPayloadJsonOrderByCreatedAtDesc(
                partnerCode, request.label(), request.payloadJson())
        .filter(draft -> !draft.isExpired(LocalDateTime.now()));
if (existing.isPresent()) return DraftResponse.from(existing.get());
```

확정도 거래처코드+draftSeq 멱등키로 기존 주문을 반환한다(`PartnerOrderConfirmService.java:113-125`).

### ③ 판정

**다름** — 현행에 중복 생성 가드가 추가됐다.

### ④ 사용자 차이

같은 주문을 재시도하거나 동시에 보냈을 때 현행은 기존 내부 주문을 반환할 수 있다. 레거시는 소스상 매번 외부 POST를 시도한다.

### ⑤ 업무 확인

**🚨 업무 확인 필요.** 안전장치 자체와 함께 “동일 주문”을 payload 전체 동일로 보는 현재 기준, draft TTL 동안 재주문 의도를 구분하는 방식이 업무에 맞는지 확인해야 한다.

---

## R-19. 전송 성공의 의미와 상태 전이

### ① 레거시 규칙

레거시는 이카운트 saleorder 응답이 HTTP 200이고 `SuccessCnt > 0`이어야 성공이다.

`tools/legacy-gas/거래처 발송 주문서/Code.js:2233-2243`

```js
const res = UrlFetchApp.fetch(url, { method: 'post', /* ... */ });
const code = res.getResponseCode();
// ...
const ok = (code===200) && (body?.Data?.SuccessCnt > 0);
```

### ② 우리 구현

현행 confirm은 내부 주문을 `DRAFT + NOT_REQUIRED`로 만들며 전표를 자동 발행하지 않는다.

`services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/domain/PartnerOrder.java:178-183,218-224`

```java
// 거래처 포털 confirm 흐름 — slip 미발행 DRAFT 주문 생성
// ...
order.status = PartnerOrderStatus.DRAFT;
order.slipPublishStatus = SlipPublishStatus.NOT_REQUIRED;
order.confirmedAt = null;
```

`PartnerOrderConfirmService.java:174-175`는 출고전표가 본사 데스크톱의 명시적 convert 액션으로만 발행된다고 명시한다.

### ③ 판정

**다름** — 성공의 업무 상태가 완전히 다르다.

### ④ 사용자 차이

레거시의 “전송 성공”은 이카운트 주문서 등록 성공이다. 현행 주문서웹의 “전송 성공”은 내부 DRAFT 접수 성공이며, 본사가 별도로 전표 전환해야 한다.

### ⑤ 업무 확인

**🚨 업무 확인 필요 — 최우선.** 거래처가 보는 “주문 전송 완료” 문구가 내부 접수인지 이카운트/출고전표 생성인지, 후속 승인·전환 책임과 상태명을 업무적으로 확정해야 한다.

---

## R-20. I형 유연호스 표시와 8,000원 강제 단가

### ① 레거시 규칙

`SHOW_I_HOSE`가 거짓이면 I형 유연호스는 홈·싱글 부자재·싱글·상업 단가 함수에서 8,000원으로 강제된다.

`tools/legacy-gas/거래처 발송 주문서/index.html:2445-2449,2484-2489,2516-2519,2561-2565`

```js
if (!window.SHOW_I_HOSE && /유연호스\s*I형/i.test(rawName)) {
  return 8000;
}
```

### ② 우리 구현

브라우저에는 같은 8,000원 규칙이 있다(`clients/web/order-app/index.html:2705-2709,2744-2749,2786-2789,2831-2835`). 그러나 확정 요청은 `SHOW_I_HOSE`와 화면 단가를 보내지 않는다(`clients/web/order-app/src/samhanApi.ts:194-235`). 서버는 카테고리와 상품의 release/delivery/selling price 중 하나를 기준가로 선택한다(`services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/service/PartnerOrderPriceCalculationService.java:255-271`).

### ③ 판정

**확인 불가** — 화면의 강제 단가는 동일하지만 최종 확정 단가에는 같은 명시 규칙이 없다. 운영 상품 기준가가 8,000원이면 결과가 같을 수 있으나 소스만으로 보장할 수 없다.

### ④ 사용자 차이

화면상 I형 유연호스가 8,000원으로 보여도 서버 상품 기준가가 다르면 확정 단가는 달라질 수 있다. 실제 차액은 운영 카탈로그 조회 없이 확인할 수 없다.

### ⑤ 업무 확인

**🚨 업무 확인 필요.** I형 유연호스 숨김 설정과 무관하게 8,000원을 강제하는 것이 현재 가격 정책인지 확인해야 한다.

---

## R-21. 수량 입력 정수화·상한·0행 제외

### ① 레거시 규칙

수량 입력은 숫자 이외 문자를 제거하고 최대 999,999로 제한한다.

`tools/legacy-gas/거래처 발송 주문서/index.html:1530`

```js
const toInt=v=>{const m=String(v||'').replace(/[^\d]/g,'');return m===''?0:Math.min(999999,parseInt(m,10));};
```

외부 전송 직전에는 반올림한 수량이 0 이하면 행을 제외한다.

`tools/legacy-gas/거래처 발송 주문서/Code.js:2118-2120`

```js
const qty = Math.round(Number(it.qty)||0);
if (qty<=0) return;
```

### ② 우리 구현

브라우저 상한은 동일하다.

`clients/web/order-app/index.html:1670`

```js
const toInt=v=>{const m=String(v||'').replace(/[^\d]/g,'');return m===''?0:Math.min(999999,parseInt(m,10));};
```

확정 shim은 정수이면서 1 이상인 수량만 허용한다(`clients/web/order-app/src/samhanApi.ts:223-229`).

```ts
if (!Number.isInteger(quantity) || quantity < 1) {
  throw new Error(`주문 ${index + 1}번째 품목의 수량이 올바르지 않습니다`)
}
```

### ③ 판정

**동일** — 정상 UI 경로에서 수량은 0~999,999 정수이고, 실제 전송 라인은 1 이상만 허용된다.

### ④ 사용자 차이

정상 화면 입력에서는 차이가 없다. 0수량 품목은 주문 라인이 되지 않는다.

### ⑤ 업무 확인

**🚨 업무 확인 필요.** 단일 품목 999,999 상한과 0수량 행 제거가 현재 주문 한도 정책인지 확인해야 한다.

---

## 정찰 범위와 미확인 영역

### 끝까지 본 범위

- `tools/legacy-gas/거래처 발송 주문서/Code.js`: **1-3521행 전체**의 함수 선언·조건문·외부 전송 payload를 인덱싱했다.
- `tools/legacy-gas/거래처 발송 주문서/index.html`: **1-9826행 전체**의 함수 선언·이벤트·계산·전송 행 생성 경로를 인덱싱했다.
- 현행은 `clients/web/order-app/index.html`의 대응 UI 함수, `clients/web/order-app/src/samhanApi.ts`의 shim, `partner-order-service`의 draft/confirm/domain/price 경로, `dc-config-service` 가격 계산기, 공통 VAT 계산기를 따라 최종 저장 경계까지 대조했다.

### 규칙에서 제외한 것

단순 표시 형식, CSS, 인쇄 레이아웃, 튜토리얼, 주소검색 UI, 로그인 화면, 로깅·메일 문구, snapshot 미리보기 렌더링은 “값이 왜 그렇게 되는가”를 결정하지 않아 규칙 목록에서 제외했다. 인증·권한은 거래처 식별과 직접 연결되는 R-03만 포함했다.

### 확인하지 못한 것

- 운영 `product-service` 카탈로그 행과 `UsageScope.PARTNER_ORDER` 노출 결과
- 거래처별 운영 DC 값·고정 DC·옵션 플래그·가격 변동 schedule의 실제 데이터
- 본사 데스크톱 convert 이후 최종 전표의 창고·담당자·규격·적요 보강 여부
- 레거시 외부 시스템(Notion, 이카운트)의 현재 설정과 실제 응답

따라서 동적 데이터가 있어야 숫자별 결과를 증명할 수 있는 항목은 `확인 불가`로 남겼다. 이 정찰에서는 공유 DB를 조회하지 않았고, 실제 주문을 생성하지 않았다.

## 업무 확인 우선순위(수정 제안 아님)

업무 사실 확인이 먼저 필요한 순서는 코드 영향도가 아니라 사용자 결과의 직접성 기준이다.

1. R-19 전송 성공의 의미와 상태 전이
2. R-05 주문 헤더 보존
3. R-12~R-15 가격·기준일·구형 DC·VAT
4. R-01 창고 결정 — 특히 1WAY를 포함한 품목 목록
5. R-08 자동 수량과 수동 override

이 순서는 구현 또는 설계 제안이 아니다. 각 레거시 줄이 현재도 업무 규칙인지 개발책임자·업무 담당자가 확인할 때의 검증 순서다.
