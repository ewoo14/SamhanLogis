# 주문서웹 창고 지정 — 정규식이 아니라 품목분류로 (2026-08-15 개발책임자)

## 개발책임자 원문

> *"가입고는 창고대로 입고시키는거고, 너가말한 품목에 따라 창고지정되는 것은 거래처에서 주문서웹으로 주문서를 발송했을때야."*
>
> *"그렇지 정규식으로 창고지정하지 말고 품목분류로 부탁해."*

## 레거시가 하던 방식 (`거래처 발송 주문서/Code.js:1831` `decideWarehouseCode_`)

```js
// 홈멀티: 인피니트
var homeHit = items.some(function(it){
  if (getSection_(it) !== 'HOME') return false;
  return /인피니트/.test(getOrigName_(it));
});

// 싱글 세트
var singleHit = items.some(function(it){
  if (getSection_(it) !== 'SINGLE') return false;
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

⟹ **품명 문자열에 정규식을 걸어 판정**했습니다. 섹션(HOME/SINGLE)까지는 봤습니다.

## 🚨 확정 — 정규식을 쓰지 않는다

```text
🚫 품명 문자열 정규식으로 창고를 정하지 마라
✅ 품목분류(카테고리)로 정한다
```

🔑 **왜 이게 중요한가.**

```text
정규식은 이름이 바뀌면 조용히 틀린다
  "1way" 가 "1-Way" 로, "냉방전용" 이 "냉전" 으로 적히면 판정이 뒤집힌다
  레거시가 조건을 9개나 나열한 것이 그 증거다 — 같은 것을 여러 철자로 잡으려 한 것이다
품목분류는 품목에 붙은 속성이다
  이름을 어떻게 적든 분류가 같으면 같은 창고로 간다
```

## ⏳ 열린 것 — 구현 전에 정해야 한다

```text
어느 분류축이 창고를 가르는가
  🚩 우리 시스템의 분류 체계(카테고리·섹션)를 먼저 읽고
     레거시 9개 조건이 어느 분류에 대응하는지 대조해야 한다
  🚩 대응이 1:1 이 아니면 그 사실을 개발책임자께 올린다
     레거시 조건 중 분류로 표현 안 되는 것이 있을 수 있다
기본값은 어디인가 (레거시는 초월 00003)
분류가 없는 품목은 어디로 가는가
한 주문에 두 창고 품목이 섞이면 어떻게 하는가
  🚩 레거시는 하나라도 걸리면 전부 상일(2) 로 보냈다 (some 판정)
```

## 관련

```text
가입고(#1225)   창고는 파일의 고객명대로만 — 품목으로 바꾸지 않는다
                docs/decisions/2026-08-15-inbound-xlsx-auto-slip.md
규칙 대조       docs/dev-reports/2026-08-15-order-web-rule-parity.md (작성 중)
```
