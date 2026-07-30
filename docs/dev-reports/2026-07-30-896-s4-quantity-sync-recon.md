# #896 슬4 수량 동기화 설정 전환 정찰

작성일: 2026-07-30  
작업 브랜치: `feat/896-s4-quantity-sync-config`  
정찰 범위: `clients/web/order-app` + `services/product-service`  
원칙: 읽기 전용. 구현·테스트 실행·Docker/Gradle/npm 실행 없음.

## 0. ① 인벤토리 총계 — 표 맨 위

| 구분 | 직접 센 결과 | 산정 기준 |
|---|---:|---|
| **하드코딩 수량 동기화 논리 계열** | **20개** | `H-01~08` 8개 + `S-01~03` 3개 + `C-01~09` 9개. 한 함수 안에 여러 독립 source→target 식이 있어도 사업 규칙 계열별로 분리했다. |
| 실제 런타임 코드 집중 지점 | 10곳 | `order-app/index.html`의 `recompute*`/분기보드 경로. C-08은 C-05와 같은 업무 관계를 별도 DOM 경로가 다시 쓰는 중복 지점이다. |
| `product-service`의 수량 동기화 **실행 evaluator** | 0곳 | 현재 코드는 규칙 저장·조회·검증 CRUD만 제공하며 견적/주문 수량 계산을 호출하지 않는다. |
| 설정으로 1차 표현 가능한 계열 | 18개 | `H-01~06,H-08`, `S-01~03`, `C-01~08`. 단 C-08은 C-05와 같은 관계라 seed는 흡수해야 한다. |
| 현 스키마만으로 표현 판정이 어려운 계열 | 2개 | H-07의 차감·하한·게이트, C-09의 보드 순서·누적용량·마지막 강제·수동 추가. |

직접 검산: `8 + 3 + 9 = 20`. `product-service`의 `QuantitySyncAggregation`은 현재 `SUM` 하나뿐이고(`services/product-service/src/main/java/com/samhanair/logis/product/domain/QuantitySyncAggregation.java:3-5`), 기존 정찰도 H-07/C-09를 단순 source→target 모델 밖으로 분류한다(`docs/superpowers/specs/2026-07-27-896-survey.md:597-601`).

> 이 보고서의 20개는 “설정으로 이관해야 할 업무 수식 계열”의 총계다. 같은 계열이 함수·DOM 경로에서 재사용/중복되는 것을 20개 코드 파일로 세지 않았다. 반대로 C-08처럼 같은 관계를 별도 코드 경로가 다시 계산하는 경우는 실제 위험 지점으로 별도 표시했다.

## 1. 하드코딩 수량 동기화 수식 전수 인벤토리

아래 코드 블록은 지정한 파일·행의 **원문 발췌**다. 블록 안의 `...`는 소스 문자가 아니라 수식과 직접 관계없는 중간 라인을 생략한 편집 표기이며, 산식·target 대입문 자체는 그대로 인용했다.

### 1.1 홈멀티 H-01~H-08 — 8개

#### H-01 — 1WAY/4WAY/360 유연호스

위치: `clients/web/order-app/index.html:5611-5646` (`recomputeHomeDerived`)

원문:

```js
let n1w=0, n4w=0, c360=0, nWall=0;
...
else if(/(1\s*-?\s*way|1\s*way|1\s*WAY)/i.test(nm)) n1w += q;
else if(/(4\s*-?\s*way|4\s*way|4\s*WAY)/i.test(nm)) n4w += q;
if(/360/i.test(nm)) c360 += q; // 360은 4WAY 호스에 함께 가산
...
n1w += nWall;
n4w += c360;
...
if(n1w > 0) setRequiredH(HOSE_I_1W, 'FH-LFHIF', n1w, '유연호스 파생');
...
if(n1w > 0) setRequiredH(HOSE_1W, 'FH-LFHLF', n1w, '유연호스 파생');
...
if(n4w > 0) setRequiredH(HOSE_4W, 'FH-LFHLN', n4w, '유연호스 파생');
```

실효식은 `1WAY 합계 + nWall`을 1WAY 호스에, `4WAY 합계 + 360 합계`를 4WAY 호스에 1배수 반영한다. 현재 블록에는 `nWall` 증가문이 보이지 않아 선언 후 `0`인 상태지만, 그 사실을 기능 부재로 일반화하지 않고 현재 소스의 직접 관측으로만 기록한다. `window.SHOW_I_HOSE`에 따라 L/I target을 바꾼다.

#### H-02 — 홈 360/4WAY 판넬

위치: `clients/web/order-app/index.html:5299-5358` (`recomputeHomePanels`)

원문:

```js
const m360Wi = pickPanelBy('360',  true, opt);
const m360No = pickPanelBy('360',  false,opt);
const m4Wi   = pickPanelBy('4way', true, opt);
const m4No   = pickPanelBy('4way', false,opt);

setP(m360Wi, c360Wi, 'PC6NUDK1NW');
setP(m360No, c360No, 'PC6NUDK1N');
setP(m4Wi,   c4Wi,   'PC4NUFK1NW');
setP(m4No,   c4No,   'PC4NUFK1N');
```

`c360Wi/c360No/c4Wi/c4No`는 같은 파일 `:5314-5324`에서 실내기 수량을 합산한다. `판넬제외`이면 `:5296-5297`에서 전체 파생을 끝낸다.

#### H-03 — 홈 1WAY 판넬

위치: `clients/web/order-app/index.html:5328-5341,5371-5385`

원문:

```js
const m1WiS = pickModel(useAir ? 'a1sWi':'p1sWi', c1WiS);
const m1WiM = pickModel(useAir ? 'a1mWi':'p1mWi', c1WiM);
const m1WiB = pickModel(useAir ? 'a1bWi':'p1bWi', c1WiB);
if(m1WiS) setP(m1WiS, c1WiS);
if(m1WiM) setP(m1WiM, c1WiM);
if(m1WiB) setP(m1WiB, c1WiB);

const m1NoS = pickModel(useAir ? 'a1sNo':'p1sNo', c1NoS);
const m1NoM = pickModel(useAir ? 'a1mNo':'p1mNo', c1NoM);
const m1NoB = pickModel(useAir ? 'a1bNo':'p1bNo', c1NoB);
if(m1NoS) setP(m1NoS, c1NoS);
if(m1NoM) setP(m1NoM, c1NoM);
if(m1NoB) setP(m1NoB, c1NoB);
```

소형/중형/대형 × WIFI 내장/미내장별 합계를 각각 1배수로 판넬 target에 보낸다. `useAir`는 `공청판넬` 또는 `인피니트 공청+동작감지 AI`일 때 target 계열을 바꾼다(`:5360-5360`).

#### H-04 — 홈 인피니트·4WAY 공청 판넬 치환

위치: `clients/web/order-app/index.html:5387-5424`

원문:

```js
const midModel =
  opt==='공청판넬' ? INF.mid.air :
  opt==='인피니트 공청+동작감지 AI' ? INF.mid.ai :
  INF.mid.base;

const bigModel =
  opt==='공청판넬' ? INF.big.air :
  opt==='인피니트 공청+동작감지 AI' ? INF.big.ai :
  (opt==='인피니트 25년형' ? INF.big.base25 : INF.big.base);

if(homeRowByModel.has(midModel)) setP(midModel, infMid);
else if(infMid > 0) setP(null, infMid, midModel);
if(homeRowByModel.has(bigModel)) setP(bigModel, infBig);
else if(infBig > 0) setP(null, infBig, bigModel);
...
for(const [from,to] of map){
  ...
  const n = homeQty.get(from)||0;
  if(n>0 ...){ setP(from,0); setP(to,n); }
}
```

인피니트 중/대형 합계를 옵션 target으로 1:1 이동하고, `공청판넬`은 4WAY 기본 판넬 수량 `n`을 공청 target으로 옮긴다. 단순 `SUM + multiplier`로는 target 치환 조건까지 표현해야 한다.

#### H-05 — 홈 기본 리모컨

위치: `clients/web/order-app/index.html:5440-5449,5469-5476`

원문:

```js
if(/실내기.*360\s*CST|CST\s*360|360CST/i.test(name)) cntCST += q;
if(/실내기.*인피니트/i.test(name))                  cntINF += q;
if(/실내기/i.test(name) && /(1\s*-?\s*way|4\s*-?\s*way|1way|4way)/i.test(name) && !/벽걸이/i.test(name) && !/인피니트/i.test(name) && !/360/i.test(name)) cnt1w4w += q;
if(/벽걸이/i.test(name)) cntWall += q;
...
setR(REMOTE_360_DEFAULT, cntCST, 'AR-KH05');
setR(REMOTE_INF_CH01, cntINF, 'AR-CH01');
setR(REMOTE_WIRELESS, cnt1w4w + cntWall, 'AR-EC05');
```

유형별 실내기 합계 × 1을 유형별 리모컨 target에 반영한다. `기본` 옵션일 때만 이 경로가 실행된다.

#### H-06 — 홈 전열교환기/에어콤보 및 유선 리모컨 키트

위치: `clients/web/order-app/index.html:5451-5453,5461-5462,5477-5482`

원문:

```js
if(/(전열\s*교환기|에어콤보|에어콤포)/i.test(name) && !/(리모컨|remote)/i.test(name)){
  if(r.model!==REMOTE_COLOR_AIRCOMBO) cntCombo += q;
}
...
setR(REMOTE_COLOR_AIRCOMBO, Math.max(0, cntCombo), 'AWR-WG00N');
...
const totalBasic = cntCST + cntINF + cnt1w4w + cntWall;
const main = (opt==='유선') ? REMOTE_AWR_WE13N : REMOTE_AWR_WG00N;
setR(main, totalBasic, opt==='유선' ? 'AWR-WE13N' : 'AWR-WG00N');
setR(REMOTE_WIRED_KIT, totalBasic, 'AIM-A01N');
```

기본 대상 합계를 본체와 키트에 각각 반영하는 1:N 경로다. 에어콤보는 별도 target을 하나 더 가산한다.

#### H-07 — 홈 Y형 분기관 차감·하한

위치: `clients/web/order-app/index.html:5497-5538` (`recomputeHomeBranches`)

원문:

```js
if (/(실내기|벽걸이)/i.test(nm) && !/(판넬|패널|리모컨|리모콘|유연호스|분\s*기\s*관|분기관|발통|받침대|드레인펌프|유선보드|KIT|키트)/i.test(nm)){
  indoorCount += q;
}
...
if (/실외기/i.test(nm) && /단배관/i.test(nm)){
  singleOutCount += q;
  if (r.model === MODEL_6HP_SINGLE) sixHpSingleCount += q;
}
...
if (singleOutCount > 0){
  b2512 = sixHpSingleCount;
  b1509 = indoorCount - singleOutCount - sixHpSingleCount;
}
b2512 = Math.max(0, b2512);
b1509 = Math.max(0, b1509);
```

`AXJ-YA2512N`과 `AXJ-YA1509N`에 각각 `b2512`, `b1509`를 반영한다(`:5536-5539`). 차감·음수 하한·단배관 선행 게이트 때문에 현재 S2 스키마의 `SUM`만으로는 동등 표현이 확인되지 않는다.

#### H-08 — 홈 실외기 수량 → 원형/평형 발통

위치: `clients/web/order-app/index.html:5159-5165` (`recomputeFootAll`)

원문:

```js
const outTotalHome=HOMEMULTI.reduce((t,r)=>t+(/실외기/i.test(r?.name||'')?(homeQty.get(r.model)||0):0),0);
const wantHomeFoot=!!el('#home_foot')?.checked;
const totalRoundHome=wantHomeFoot?outTotalHome:0;
if(totalRoundHome > 0) setHomeDerivedQty_(FOOT_ROUND, '발통세트', totalRoundHome, '발통 파생');
else if(FOOT_ROUND) setDerivedQty('home', homeQty, FOOT_ROUND, 0);
if(FOOT_FLAT) setDerivedQty('home', homeQty, FOOT_FLAT, 0);
```

실외기 합계 × 1을 원형 발통에 반영하고 평형 발통은 0으로 만든다. `#home_foot`가 사용자 입력 경계다.

### 1.2 싱글중대형 S-01~S-03 — 3개

#### S-01 — 싱글 실외기 받침대

위치: `clients/web/order-app/index.html:5168-5182` (`recomputeSingleBaseFoot`)

원문:

```js
const baseOn=!!el('#ss_base')?.checked;let round=0,flat=0;
...
const q=singleQty.get(s.id)||0;if(!q) return;
const mdl=String(s?.model||'');
if(/^(AP230DAPDHH1S|AP290DAPDHH1S)$/i.test(mdl)) flat+=q; else round+=q;
...
setSingleDerivedQty_(SS_FOOT_ROUND_ID, '발통세트', round, '발통 파생');
setSingleDerivedQty_(SS_FOOT_FLAT_ID, 'SI-AL700a', flat, '발통 파생');
```

받침대 포함이면 일반 세트 합계는 원형, 두 모델은 평형 target으로 각각 1배수 반영한다.

#### S-02 — 1WAY 싱글 세트 → 유선보드

위치: `clients/web/order-app/index.html:5184-5195` (`recomputeSingleExtras`)

원문:

```js
let boardQty=0;
const remoteExcluded=!!el('#ss_remote_ex')?.checked;const remoteOpt=el('#ss_remote')?.value||'';
if(!remoteExcluded&&(remoteOpt==='유선리모컨'||remoteOpt==='컬러유선리모컨')){
  ...
  boardQty+=(singleQty.get(s.id)||0);
}
setSingleDerivedQty_(SS_WIRED_BOARD_ID, 'AIM-A01N', boardQty, '유선리모컨 파생');
```

조건을 만족하는 1WAY 세트 합계 × 1을 유선보드 target에 반영한다.

#### S-03 — 실링 싱글 세트 → 드레인펌프

위치: `clients/web/order-app/index.html:5196-5202` (`recomputeSingleExtras`)

원문:

```js
let pumpQty=0;
SINGLE_SETS.forEach(s=>{
  if(s.id===SS_CEILING_PUMP_ID) return;
  if(/운임|절삭/i.test(s?.name||'')) return;
  if(/실링/i.test(((s?.name)||'')+' '+((s?.model)||''))){pumpQty+=(singleQty.get(s.id)||0);}
});
setSingleDerivedQty_(SS_CEILING_PUMP_ID, 'ADP-F075SP', pumpQty, '실링용 드레인펌프 파생');
```

이름/모델에 `실링`이 있는 세트 합계 × 1을 펌프 target에 반영한다.

### 1.3 상업멀티·분기보드 C-01~C-09 — 9개

상업 C-01~C-07은 `recomputeCommDerived` 하나에 모여 있다(`clients/web/order-app/index.html:5699-5825`). 함수가 하나라는 이유로 한 수식으로 합치지 않고 target 기능별로 7개를 센다.

#### C-01 — 상업 실내기 → 판넬

위치: `clients/web/order-app/index.html:5699-5705`; target 결정기는 `:5877-5961`

원문:

```js
const pm = computeCommPanelModelForIndoor_(r);
if(pm) want.set(pm, (want.get(pm)||0) + q);
```

`computeCommPanelModelForIndoor_`는 1/2/4WAY·360, WIFI, 크기, MINI, 인피니트, `#comm_panel`, `#comm_p360`에 따라 모델 코드를 선택한다(`:5882-5958`). 따라서 실제 수식은 “선택 target별 실내기 수량 합계 × 1”이다.

#### C-02 — 상업 실내기 → 유연호스

위치: `clients/web/order-app/index.html:5707-5727`

원문:

```js
if(kind==='1way' || kind==='2way') n1w += q;
if(kind==='4way' || kind==='360')  n4w += q;
...
if(hose1) want.set(hose1, n1w);
if(hose4) want.set(hose4, n4w);
```

벽걸이·덕트·실링·스탠드는 제외하고 1/2WAY 합계를 1WAY hose, 4WAY/360 합계를 4WAY hose에 1배수 반영한다. `#comm_ex_hose`가 제외 경계다.

#### C-03 — 상업 실내기/전열교환기 → 리모컨

위치: 집계 `clients/web/order-app/index.html:5729-5736`; target 선택 `:2443-2475`

원문:

```js
if (!isCommIndoorRow(r) && !/전열교환기/i.test(nm)) return;
const rm = computeCommRemoteModelForIndoor_(r);
if(rm) want.set(rm, (want.get(rm)||0) + q);
```

`computeCommRemoteModelForIndoor_`는 `제외`, 전열교환기, 덕트, 유선/컬러유선, UV-C, 인피니트, 360 순서로 target 모델을 고른다(`:2449-2474`). 고른 target별 source 합계 × 1이다.

#### C-04 — 상업 실내기 → 드레인펌프

위치: `clients/web/order-app/index.html:5738-5760`

원문:

```js
Object.entries(PUMP_MAP).forEach(([pump, list])=>{
  let sum = 0;
  list.forEach(m => {
    pumpInputModels.add(m);
    sum += Number(commQty.get(m)||0);
  });
  if (sum > 0) want.set(pump, sum);
});
```

`PUMP_MAP`의 각 source 모델 수량을 합산해 pump target에 1배수 반영한다. map 자체가 하드코딩된 source→target 관계다(`:5739-5746`).

#### C-05 — 상업 실외기 → 받침대/GHP 보조품

위치: source→target 분류 `clients/web/order-app/index.html:2503-2547`; 적용 `:5763-5804`

원문:

```js
if(isGHP) {
  want.push('GHP방진가대');
  want.push('ACL-KORGHP07');
}
...
if(isPrime && ['8','10','12'].some(test)) want.push('방진가대S2소');
if(isCold  && ['8','10','12'].some(test)) want.push('방진가대S2소');
if(isStd   && ['8','10','12','14'].some(test)) want.push('방진가대S2소');
...
baseNames.forEach(baseName=>{
  ...
  want.set(m, (want.get(m)||0) + q);
});
```

실외기 품명 타입·HP 구간에 따라 한 source 수량을 여러 받침대 target에 각각 `+ q`한다. SET은 HP 조각별로 같은 계산을 반복한다(`:5773-5787`). 즉 C-05는 1:N 관계와 품명/HP 분류를 동시에 가진다.

#### C-06 — 상업 SET 괄호의 `+` → 분기관

위치: `clients/web/order-app/index.html:2573-2580,5790-5809`

원문:

```js
function countBranchForSet(nm){
  const m = nm.match(/\(([^)]+)\)/);
  if(!m) return 0;
  const s = m[1];
  const plus = (s.match(/\+/g)||[]).length;
  return plus; // 한 대당 분기관 수
}
...
const plus = countBranchForSet(nm);
branchCnt += plus * q;
...
if(branchCnt > 0){
  want.set('AXJ-TA3419M', (want.get('AXJ-TA3419M')||0) + branchCnt);
}
```

SET 1대당 괄호 내부 `+` 개수 × SET 수량을 누적하고 기존 분기관 수량에 더한다.

#### C-07 — 상업 실외기 → 리뉴얼 필터

위치: map `clients/web/order-app/index.html:2582-2586`; 적용 `:5811-5825`

원문:

```js
const RENEW_FILTER_MAP = {
  'AF-R09A': ['AM035FXMRHC1','AM050MXMRBC1','AM050FXMRHC1'],
  'AF-R12A': ['AM075FXMRHC1']
};
...
if(list.includes(r.model)){
  ...
  want.set(fModel, (want.get(fModel)||0) + q);
}
```

열거된 실외기 모델의 수량 × 1을 필터 target에 반영한다. `isCommOutdoorRow` 판별을 먼저 통과해야 한다(`:5813-5817`).

#### C-08 — GHP 방진가대 DOM 보조 경로

위치: `clients/web/order-app/index.html:3484-3514`

원문:

```js
const hasGHP = parts.some(p=>/GHP방진가대/i.test(p?.name||''));
if (hasGHP) return { name:'GHP방진가대', qty };
...
const v = Math.max(q, parseInt(inp.value||'0',10)||0);
if (v !== q){ inp.value = st.qty; inp.dispatchEvent(new Event('input')); }
```

SET 구성품에 `GHP방진가대`가 있으면 실외기 선택량 `q`를 화면 행에 반영한다. C-05의 `chooseBaseModel`/`recomputeCommDerived`가 같은 업무 관계를 이미 계산하므로 별도 seed를 만들면 중복 관계가 된다. 두 writer가 어떤 이벤트 순서로 실행되는지는 이 정찰에서 서버/브라우저 실행을 하지 않아 판정불가이며, 이관 시 한 책임점으로 수렴해야 한다.

#### C-09 — 분기보드 누적용량·실외기 HP 강제·코드별 개수

위치: `clients/web/order-app/index.html:7153-7244,7757-7773`

원문:

```js
function codeByCumulativeSum(csum){
  if(csum < 150) return '1509';
  if(csum < 406) return '2512';
  if(csum < 464) return '2812';
  if(csum < 696) return '2815';
  if(csum < 986) return '3419';
  return '4119';
}
...
if(hp <= 50)        forced = '1509';
else if(hp <= 100)  forced = '2512';
else if(hp <= 160)  forced = '2812';
else if(hp <= 220)  forced = '2815';
else if(hp <= 340)  forced = '3419';
else                forced = '4119';
...
const totals = { '1509':0,'2512':0,'2812':0,'2815':0,'3419':0,'4119':0 };
...
if(totals[k]!=null) totals[k]+=1;
...
commQty.set(model, q);
```

각 보드 cell의 `cap` 누적합으로 코드를 고른 뒤 마지막 cell은 실외기 모델의 HP 구간 코드로 강제하고, 코드별 cell 수를 `commQty`에 쓴다(`:7203-7236,7241-7251,7763-7772`). 품목 source 수량만이 아니라 셀 순서·용량·마지막 강제·수동 배치가 입력이므로 현 `SUM` schema와 1:1 대응하지 않는다.

### 1.4 인벤토리에서 의도적으로 제외한 수량식

다음은 코드에 곱셈이 있어도 #896의 “독립 최상위 Product 간 동기화”로 세지 않았다.

```js
const effQ = q * pqty;
...
const sub = (k.price||0) * (k.qty||0);
```

위치: `clients/web/order-app/index.html:3059-3070,6090-6104`, 전개 호출은 `:6541-6553,6589-6600`. 이는 BUNDLE 내부 구성품의 `component quantity`를 SET 수량에 곱하는 기존 세트 전개/금액 경계다. 기존 정찰도 BUNDLE 구성품 수량을 #896 규칙으로 이관하지 않는다고 명시한다(`docs/superpowers/specs/2026-07-27-896-survey.md:647-670`). 이 식을 누락한 것이 아니라 소유권이 다른 식으로 분리했다.

## 2. 슬1~슬3 머지 상태와 칩 기반 설정 접점

### 2.1 `origin/main` 실제 확인

`git log origin/main --oneline --grep=896` 및 ancestor 확인 결과:

| 단계 | 실제 머지 커밋 | `origin/main` 조상 여부 | 머지 산출물 |
|---|---|---|---|
| 슬1 | `2cb21872b` — `[FEAT] #896 품목 수량 동기화 칩 기반 설정 전환 ... (#948)` | **True** | 수량·선택모델 golden 경계와 두 레거시 앱 정답 고정. 런타임 evaluator 교체 아님. |
| 슬2 | `ebf9737c9` — `[FEAT] #896 슬2 수량 동기화 규칙 스키마 ... (#958)` | **True** | `product-service`의 V24 3테이블, Java domain/CRUD/검증, 명시 seed 없음. |
| 슬3 | `420395191` — `[FEAT] #896 슬3 라이브 GAS 가격 정합 ... (#980)` | **True** | 두 웹 앱의 라이브 GAS 가격/가격인상 기준 정합. 보고서가 설정화는 다음 슬라이스라고 명시한다(`docs/dev-reports/2026-07-29-896-s3-price-parity.md:8-14`). |

슬1의 `legacyQuantityBoundary`는 정본 레거시 소스를 읽어 golden을 실행하는 검증 경계이지, order-app의 수식을 설정 API로 바꾸지 않는다. 슬2 README도 규칙 저장 스키마가 evaluator를 호출하지 않는다고 명시한다(`services/product-service/README.md:39-54`). 따라서 이번 정찰 시점에는 “칩 저장소는 머지됨, 실 계산 연결은 아직 근거 없음”이 정확한 상태다.

### 2.2 테이블·컬럼 실측

근거: `services/product-service/src/main/resources/db/migration/V24__quantity_sync_rule_schema.sql`

| 테이블 | 핵심 컬럼 | 역할 | 파일:행 |
|---|---|---|---|
| `quantity_sync_rule` | `rule_key`, `estimate_category`, `name`, `enabled`, `aggregation`, `condition_json`, `inactive_behavior`, `conflict_policy`, `priority`, `legacy_ref` | 규칙 본체·카테고리·조건·활성/충돌 정책 | `V24__quantity_sync_rule_schema.sql:8-39` |
| `quantity_sync_source` | `rule_id`, `source_product_id` FK→`products.id`, `factor` | 기준 Product 수량 기여와 source 배수 | `V24__quantity_sync_rule_schema.sql:41-56` |
| `quantity_sync_target` | `rule_id`, `target_product_id` FK→`products.id`, `multiplier`, `rounding_mode`, `display_order` | 파생 Product와 결과 배수/반올림/순서 | `V24__quantity_sync_rule_schema.sql:58-78` |

세 테이블 모두 `BaseEntity` 계열 audit/soft-delete 필드를 갖고, active partial unique/index가 있다(`V24:80-105`). DB의 범위 축소로 Java validator는 남았지만 원문상 DB graph constraint trigger는 제거됐고(`V24:108-129`), 서비스 계층 우회 SQL까지 동일하게 막힌다고 판정하면 안 된다.

도메인 entity도 같은 표면을 확인한다:

- `QuantitySyncRule.java:27-31` → `@Table(name = "quantity_sync_rule")`.
- `QuantitySyncSource.java:17-23` → `quantity_sync_source`.
- `QuantitySyncTarget.java:19-25` → `quantity_sync_target`.
- `QuantitySyncSource.java:37-50` → `factor`.
- `QuantitySyncTarget.java:39-65` → `multiplier`, `roundingMode`, `displayOrder`.

### 2.3 API·gateway·DTO 실측

#### 엔드포인트

컨트롤러 base path는 `services/product-service/src/main/java/com/samhanair/logis/product/web/QuantitySyncRuleController.java:25-32`의 `/api/v1/quantity-sync-rules`다.

| Method | Endpoint | 동작/권한 | 파일:행 |
|---|---|---|---|
| GET | `/api/v1/quantity-sync-rules` | 활성 목록, `estimateCategory` 선택 필터, `products.list VIEW` | `QuantitySyncRuleController.java:40-45` |
| GET | `/api/v1/quantity-sync-rules/{ruleKey}` | ruleKey 단건, `products.list VIEW` | `QuantitySyncRuleController.java:48-53` |
| POST | `/api/v1/quantity-sync-rules` | 신규 저장, `products.admin CREATE` | `QuantitySyncRuleController.java:55-62` |
| PUT | `/api/v1/quantity-sync-rules/{ruleKey}` | 본체 + source/target 전체 교체, `products.admin UPDATE` | `QuantitySyncRuleController.java:64-71` |
| DELETE | `/api/v1/quantity-sync-rules/{ruleKey}` | 본체 + 자식 soft-delete, `products.admin DELETE` | `QuantitySyncRuleController.java:73-80` |

gateway도 같은 full path를 no-strip으로 product-service에 보낸다(`services/api-gateway/src/main/resources/application.yml:387-393`). 서비스 README의 endpoint 표와도 일치한다(`services/product-service/README.md:44-50`).

#### Request DTO

`services/product-service/src/main/java/com/samhanair/logis/product/web/dto/QuantitySyncRuleRequest.java:18-40`:

```java
String ruleKey,
QuantitySyncEstimateCategory estimateCategory,
String name,
boolean enabled,
String aggregation,
@JsonProperty("when") JsonNode conditionJson,
QuantitySyncInactiveBehavior inactiveBehavior,
QuantitySyncConflictPolicy conflictPolicy,
int priority,
String legacyRef,
List<@Valid SourceRequest> sources,
List<@Valid TargetRequest> targets
```

source/target DTO는 같은 파일 `:42-52`다.

```java
public record SourceRequest(
        String productCode,
        BigDecimal factor) {}

public record TargetRequest(
        String productCode,
        BigDecimal multiplier,
        String roundingMode,
        Integer displayOrder) {}
```

즉 API는 UUID를 받지 않고 `productCode`를 받는다. DTO의 `factor`/`multiplier`는 최대 1000·소수 scale 규칙의 Java/DB 검증 대상이며, condition은 `when` JSON object다(`V24:15,29,53-55,72-77`).

#### Response DTO

`services/product-service/src/main/java/com/samhanair/logis/product/web/dto/QuantitySyncRuleResponse.java:11-24`:

```java
String ruleKey,
QuantitySyncEstimateCategory estimateCategory,
String name,
boolean enabled,
QuantitySyncAggregation aggregation,
@JsonProperty("when") JsonNode conditionJson,
QuantitySyncInactiveBehavior inactiveBehavior,
QuantitySyncConflictPolicy conflictPolicy,
int priority,
String legacyRef,
List<QuantitySyncProductRef> sources,
List<QuantitySyncProductRef> targets
```

`QuantitySyncProductRef.java:5-8`은 사용자에게 `productCode`, `productName`, `factor`, `multiplier`, `roundingMode`, `displayOrder`만 반환하고 내부 UUID는 포함하지 않는다. `QuantitySyncRuleService.toResponse`도 source/target Product를 해소해 이 DTO를 만든다(`QuantitySyncRuleService.java:506-534`).

#### 현재 하드코딩과의 접점

현재 order-app은 source를 품명/모델/카테고리 정규식과 고정 map으로 찾아 `homeQty`, `singleQty`, `commQty`에 쓰고, target도 `PANEL_MODELS`, `PUMP_MAP`, `RENEW_FILTER_MAP`, `chooseBaseModel` 등 코드 상수로 선택한다. 이를 schema로 연결할 접점은 다음이다.

| 현 코드 역할 | 설정 schema 접점 | 현재 상태 |
|---|---|---|
| source 판별/합산 | `quantity_sync_source.source_product_id` + `factor` | 아직 정규식/고정 map 실행 |
| target 모델 선택 | `quantity_sync_target.target_product_id` + `multiplier` | 아직 고정 모델 코드/품명 map 실행 |
| 옵션 조건 | `quantity_sync_rule.condition_json` (`when`) | API 저장 가능하나 order-app evaluator 연결 근거 없음 |
| 옵션 미충족 처리 | `inactive_behavior` = ZERO/KEEP | 현재 앱은 계열별 clear/수동 lock 정책이 별도 |
| target 적용 순서 | `display_order`, `priority` | 현재는 함수 실행 순서/Map/DOM 이벤트 순서 |
| 수량 합산 | `aggregation=SUM` | C-01~C-08의 단순 합산 계열과 접점 가능 |

정적 문자열 sweep에서 `clients/web/order-app`에 `/api/v1/quantity-sync-rules` 또는 `quantity-sync` literal 호출은 확인되지 않았다. 다만 동적 URL 조립/공통 wrapper까지 이 0매치만으로 기능 부재라고 단정하지 않는다. 대신 `QuantitySyncRuleController.java:25-29`가 “evaluator 연결과 UI chip은 후속 slice”라고 명시하고, README `:41-54`가 저장 경계라고 명시하므로 **머지된 슬1~슬3에서 order-app 실 계산과 칩 API가 연결됐다는 근거는 없다**.

## 3. 실 사용자 경로에서 값·금액이 달라질 수 있는 지점

### 3.1 금액으로 이어지는 공통 sink

파생 수량이 바뀌면 단순 화면 숫자만 바뀌는 것이 아니다.

```js
const sumHome=()=>Array.from(homeQty.entries()).reduce((s,[m,q])=>s+(homeUnitPrice(m)||0)*(q||0),0);
const sumSingles=()=>SINGLE_SETS.reduce((s,x)=>s+(calcSetUnitPrice(x)*(singleQty.get(x.id)||0)),0);
const sumComm = () =>
  Array.from(commQty.entries())
    .reduce((s, [m, q]) => s + (commUnitPrice(m) || 0) * (q || 0), 0);
```

근거: `clients/web/order-app/index.html:2935-2940`. 화면 소계도 `price*q`를 직접 계산한다(`:3043-3049,6106-6117,6120-6123`). 최종 발송 payload는 계산된 수량을 다시 보낸다:

- 상업: `:6531-6563`의 `qty: q` 또는 `explodeCommSets_(r,q)` 결과.
- 홈: `:6566-6580`의 `qty: q`.
- 싱글: `:6582-6600`의 `explodeSendSets_(s,q)` 결과.

따라서 설정 target의 `modelCode`가 바뀌거나 `q`가 1만 달라져도 `unit price × q`, 세트 전개 행, 서버로 보내는 주문 라인이 함께 달라진다. target catalog 누락 시 warning과 0 금액으로 끝날 수 있는 경로도 있으므로 “모델 코드만 같으면 안전”하다고 판정할 수 없다.

### 3.2 사용자 입력별 위험 지점

| 경로 | 사용자가 바꾸는 값/행동 | 달라지는 수량·target | 금액 영향 근거 |
|---|---|---|---|
| 홈 H-01 | `#home_no_hose`, `window.SHOW_I_HOSE` | L형/I형 hose target, 1WAY·4WAY 합계 | H-01 `:5627-5646` → `homeQty` → `sumHome :2936` |
| 홈 H-02~H-04 | `#home_panel` 및 공청/25년형/AI 옵션 | 판넬 target 교체·0/1:N 이동 | `:5296-5424`; target 모델별 가격은 `sumHome`에 반영 |
| 홈 H-05~H-06 | `#home_remote` 기본/유선/컬러/제외 | 리모컨 본체·키트·에어콤보 target | `:5456-5482`; target별 `homeUnitPrice` |
| 홈 H-07 | `#home_no_branch`, 실내기/단배관 선택 | 차감식의 `b1509/b2512` | `:5487-5539`; 분기관 수량이 가격 합계에 포함 |
| 홈 H-08 | `#home_foot`, 실외기 수량 | 원형/평형 발통 | `:5159-5165`; `sumHome` |
| 싱글 S-01 | `#ss_base`, 세트 선택 | 원형/평형 받침대 | `:5169-5181`; `sumSingles` |
| 싱글 S-02~S-03 | `#ss_remote_ex`, `#ss_remote`, 실링 세트 선택 | 유선보드·드레인펌프 | `:5185-5202`; `sumSingles`와 전송 set 전개 |
| 상업 C-01 | `#comm_panel`, `#comm_p360`, 실내기 선택 | 판넬 target과 수량 | `:5877-5961`, `:5699-5705`; `sumComm` |
| 상업 C-02 | `#comm_ex_hose`, 실내기 선택 | 1WAY/4WAY hose | `:5707-5727`; `sumComm` |
| 상업 C-03 | `#comm_remote`, 실내기/전열교환기 선택 | 리모컨 target | `:2444-2475`, `:5729-5736`; `sumComm` |
| 상업 C-04 | 펌프 map 대상 실내기 수량 | 펌프 target 합계 | `:5738-5760`; `sumComm` |
| 상업 C-05 | `#comm_ex_base`, 실외기 품명/HP/SET 선택 | 받침대·GHP 보조품 1:N | `:2503-2547`, `:5763-5804`; `sumComm` |
| 상업 C-06 | SET 괄호의 `+`, SET 수량 | 분기관 `plus*q` | `:2573-2580`, `:5790-5809`; `sumComm` |
| 상업 C-07 | 열거된 AM 실외기 선택 | 리뉴얼 필터 | `:2582-2586`, `:5811-5825`; `sumComm` |
| 상업 C-08 | SET 구성품/GHP DOM 보조 경로 | GHP 방진가대 행 | `:3484-3514`; C-05와 writer 중복 위험 |
| 상업 C-09 | 분기보드 드래그/셀 순서/실외기 선택 | 1509~4119 분기관 개수 | `:7154-7244`, `:7758-7773`; `commQty`·`sumComm`·전송 payload |

### 3.3 이관 시 특히 위험한 결합

1. **수동 잠금과 설정값 충돌**: `setDerivedQty`는 `isManualQtyLocked`이면 계산값을 쓰지 않는다(`index.html:2335-2339`). 설정 evaluator가 새 값을 읽어도 이전 사용자 수동값이 남을 수 있다. 옵션 변경 시 lock을 지우는 현재 정책(`:5116-5119,5143-5155`)을 그대로 보존할지 결정해야 한다.
2. **target 모델 변경 = 단가 변경**: 같은 수량 1이라도 판넬·리모컨·받침대 target이 달라지면 `homeUnitPrice/commUnitPrice/calcSetUnitPrice`가 다른 금액을 곱한다. target catalog 누락은 warning만 보이고 금액이 0으로 될 수 있으므로 fail-closed/전송 차단 정책이 필요하다.
3. **조건 미충족의 ZERO/KEEP 차이**: 현재 코드는 계열별로 먼저 target을 0으로 clear하거나(`recomputeHomeRemotes:5437-5439`, `recomputeCommDerived:5695-5697`) 수동 잠금을 보존한다. schema `inactive_behavior`를 잘못 매핑하면 옵션을 끈 뒤 이전 수량이 남거나 반대로 사용자의 명시 수량이 사라진다.
4. **C-05/C-08 이중 writer**: C-05의 재계산과 C-08의 DOM `input` 이벤트가 같은 GHP target을 쓴다. 실행 순서/수동값 우선순위가 고정되지 않은 상태에서 둘 중 하나만 설정 evaluator로 치환하면 값이 재차 덮어써질 수 있다. 이 정찰은 브라우저 실행을 하지 않았으므로 실제 중복 금액의 발생 여부는 판정불가다.
5. **C-09는 다른 입력 차원**: 단순 source Product 수량을 읽는 방식으로 바꾸면 보드 셀 순서와 실외기 HP 강제를 잃어 분기관 수량이 달라진다. C-09를 현 schema에 억지로 넣어서는 안 된다.

## 4. 제안 슬라이스 3개

### 슬라이스 A — 최소 머지 단위: S-03 단일 규칙 E2E

**범위**: 싱글 실링 세트 → 드레인펌프 한 계열만 설정화.

- `GET /api/v1/quantity-sync-rules?estimateCategory=SINGLE_SET`로 규칙을 읽는 order-app adapter를 둔다.
- 실제 catalog의 source Product와 `ADP-F075SP` target을 명시한 1개 rule만 사용한다. 이름 정규식을 새 schema에 저장하지 않는다.
- 기존 `recomputeSingleExtras`와 설정 evaluator를 shadow 비교하고, diff가 0일 때만 feature flag로 전환한다.
- `sumSingles`/싱글 전송 payload/수동 lock을 함께 확인한다. 값이 다르면 legacy fallback으로 수렴시켜 금액을 보존한다.

이 한 계열은 `SUM + factor + multiplier + ZERO`로 표현 가능하고, H-07/C-09의 차감/보드 알고리즘을 건드리지 않아 **첫 PR로 머지 가능한 최소 단위**다. 단, 현재 V24에 seed INSERT가 없으므로 catalog snapshot 확보와 명시 source/target 승인 없이는 실제 전환을 완료했다고 판정할 수 없다(`V24:1-4`, `services/product-service/README.md:52-54`).

### 슬라이스 B — 단순 선형 계열 묶음

**범위**: H-01~H-06, H-08, S-01~S-02, C-01~C-04, C-07. 각 rule은 명시 Product 관계와 옵션 condition으로 seed하고, 같은 family 내 target `display_order`를 고정한다.

- 홈/싱글/상업 category별로 API 조회를 분리한다.
- 기존 map/정규식을 “시드 생성 1회”에만 사용하고 런타임에는 Product code chip만 사용한다.
- ZERO/KEEP와 manual lock 우선순위를 먼저 고정한다.
- 각 family별 golden 수량과 `unit price × qty`, 전송 row exact diff를 통과한 뒤 전환한다.

C-05/C-06/C-08은 1:N·SET 조각·DOM 중복이 섞여 있으므로 이 묶음에 넣지 않는다.

### 슬라이스 C — 상업 복합 + 잔여 legacy 경계

**범위**: C-05/C-06/C-08을 먼저 하나의 canonical evaluator로 통합한 뒤 설정화하고, H-07/C-09는 명시적으로 legacy owner로 남긴다.

- C-05의 받침대/HP/SET 조각 규칙을 명시 source→여러 target 관계로 펼친다.
- C-06의 `plus*q`는 SET metadata를 규칙 source로 오인하지 않도록 별도 typed operation 여부를 결정한다.
- C-08 DOM writer는 제거/위임해 C-05와 단일 writer로 만든다.
- C-09는 `CLAMPED_DIFFERENCE` 또는 분기보드 전용 typed evaluator가 결정되기 전까지 설정 seed를 만들지 않는다.
- H-07도 차감·하한·선행 게이트를 표현하는 typed operation 없이는 현행 수식을 유지한다.

## 5. 판정과 다음 담당자에게 남기는 경계

- 현재 머지 상태는 **저장 스키마/API는 있음, order-app 런타임 설정 소비는 근거 없음**이다.
- 하드코딩 수량 동기화는 논리 계열 기준 **20개**다. 그중 현 schema와 직접 맞물릴 수 있는 것은 18개지만 C-08은 C-05와 동일 관계로 중복 seed를 만들면 안 된다.
- product-service의 V24 범위 축소로 DB 직접 SQL까지 graph 불변식을 보장한다고 말할 수 없다. Java `QuantitySyncRuleValidator`와 CRUD service가 현재 강제 지점이다.
- H-07·C-09의 설정화 가능 여부, C-08의 실제 이중 반영 여부, 실 catalog에 모든 source/target이 존재하는지는 이 읽기 전용 정찰만으로 금액 안전을 확정할 수 없어 **판정불가**로 남긴다.
- estimate-app은 이번 요청의 소유 표면(`order-app` + `product-service`) 밖이므로 수식 총계에 포함하지 않았다. 슬1 golden은 두 앱의 정답을 함께 고정했으므로, order-app 전환 후에는 estimate-app과의 cross-app exact diff를 별도 게이트로 유지해야 한다.
