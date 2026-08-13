# GAS 전수조사 — 주문서(order) 계열 시트·설정 기본값

> 개발책임자 지시(2026-08-10): *"견적서와 주문서 모두 전수 조사."* · *"이번에는 확실해야해."*
> 본 문서는 **주문서 계열 전체**를 담당한다(견적 index.ejs 본체는 별도 에이전트).
>
> 확정 규칙(판정에 반영): **수량은 구성품이나 이름에서 추론하지 않는다. 오로지 수량동기화 설정값이 정한다.**
> ⟹ 레거시가 이름·HP 파싱으로 수량을 도출하는 축은 **파싱을 이식하지 않고** `(본체 model_code, 부자재 model_code, 수량)` 설정값 표로 환원해 제출한다.

---

## 0. 분모 정정 — 인벤토리 누락 1건

배정 분모(`docs/dev-reports/2026-08-10-gas-function-inventory.md`)에는 견적 `index.ejs`(19,753줄)가 있으나
**주문 쪽 대응물인 `clients/web/order-app/index.html`(10,156줄 · 함수 350+개)이 없다.**

- 인벤토리에 있는 주문 계열 파일(`quantitySync.ts` 8 · `samhanApi.ts` 16 · `legacyShim.ts` 4 · `main.ts` 0 · 모바일 4파일 28)은 **전부 shim/URL/HTTP 계층**이고, **설정 기본값과 파생 수량 규칙은 단 한 줄도 들어 있지 않다.**
- 주문서의 시트 기본값·옵션 칩·파생 수량·단가 규칙은 **전부 `clients/web/order-app/index.html`** 에 있다.
- 따라서 본 조사는 인벤토리 6파일 + **`clients/web/order-app/index.html`** + 대조용 `clients/web/legacy-quantity-golden/*`(4파일)을 모집단으로 삼았다.
  **인벤토리 갱신 필요**(이 파일이 빠진 채로는 "주문서 전수" 가 성립하지 않는다).

**조사 축 총계 = 113개** (§1 21 · §2 18 · §3 34 · §4 23 · §5 6 · §6 11)

| 판정 | 개수 | 절별 내역 |
|---|---|---|
| **[자동]** 스키마에 그대로 대응 | **41** | §1 13 · §2 0 · §3 5 · §4 12 · §5 0 · §6 11 |
| **파생** 카탈로그 sweep/계산 1회로 환원 가능 | **13** | §1 1 · §2 1 · §3 6 · §4 3 · §5 2 · §6 0 |
| **🚩결정 필요** 정본 확정 없이는 이식 불가 | **59** | §1 7 · §2 17 · §3 23 · §4 8 · §5 4 · §6 0 |

> 🚩 59개 축은 **서로 중복되는 원인을 공유**하므로 §11 에서 **21개의 구별되는 결정**으로 묶었다
> (예: B-01~B-16 16개 축은 "옵션 기본값 저장 위치" 결정 하나로 전부 해소된다).

---

## 1. 🚨 필수 항목 ① — `quantitySync.ts` 가 거부하는 "조건 붙은 규칙"

### 거부 지점 원문 (`clients/web/order-app/src/quantitySync.ts:126-129`)

```ts
  const when = rule.when ?? rule.conditionJson ?? {}
  if (!when || typeof when !== 'object' || Array.isArray(when) || Object.keys(when).length > 0) {
    return selectionError('S-03 규칙은 조건 없는 설정만 지원합니다.')
  }
```

거부 조건을 정확히 풀면 **네 가지**다.

| # | 거부 조건 | 결과 |
|---|---|---|
| 1 | `when`/`conditionJson` 이 falsy 가 아닌데 `typeof !== 'object'` (문자열 JSON 포함) | error |
| 2 | 배열 | error |
| 3 | **키가 하나라도 있으면**(`Object.keys(when).length > 0`) | error |
| 4 | (통과 조건) `{}` 이거나 필드 자체가 없어 `?? {}` 로 떨어질 때만 | ready |

즉 **`condition_json` 이 `{}` 가 아닌 모든 규칙은 주문앱이 읽지 못한다.**
또한 필드명이 `when` 우선 → `conditionJson` 순인데, **BE 응답 DTO 필드는 `conditionJson` 하나뿐**이므로 `when` 갈래는 실제로는 죽은 경로다.

### 우리 `quantity_sync_rule.condition_json` 과의 간극

서버는 **조건식을 정식 지원**한다 —
`QuantitySyncRuleValidator.java:32-33` 의 연산자 화이트리스트:

```java
private static final Set<String> CONDITION_OPERATORS = Set.of(
        "optionEquals", "optionIn", "all", "any", "not");
```

`V24__quantity_sync_rule_schema.sql:15,29`:
```sql
condition_json    JSONB        NOT NULL DEFAULT '{}'::jsonb,
CONSTRAINT chk_qsr_condition_object CHECK (jsonb_typeof(condition_json) = 'object'),
```

| 축 | 서버(DB+Validator) | 주문앱 클라이언트 | 간극 |
|---|---|---|---|
| `condition_json` 빈 객체 | 허용 | 허용 | 없음 |
| `optionEquals [key, scalar]` | 허용 (재귀 검증) | **거부** | 🚩 |
| `optionIn [key, [scalar,…]]` | 허용 (비어 있지 않은 배열 필수) | **거부** | 🚩 |
| `all [cond,…]` / `any [cond,…]` | 허용 | **거부** | 🚩 |
| `not cond` | 허용 (재귀) | **거부** | 🚩 |
| option **key vocabulary** | **검증 없음**(2026-07-28 R1 결정으로 18키 하드코딩 폐기 — 근거 부재) | 해당 없음 | 🚩 |
| `aggregation` | `CHECK (aggregation = 'SUM')` — SUM 만 | `'SUM'` 만 | 없음 |
| `inactive_behavior` | `ZERO` \| `KEEP` | **`ZERO` 만** | 🚩 KEEP 소비 불가 |
| `conflict_policy` | `ADD` \| `REPLACE` | **읽지 않음** | 🚩 |
| `priority` | `>= 0`, 정렬 축 | **읽지 않음** | 🚩 |
| `targets` 개수 | ≥ 1 | **정확히 1** | 🚩 |
| `rounding_mode` | `NONE` \| `FLOOR` | `FLOOR` 만 특수 처리, 그 외 = 무반올림 | 없음(동치) |
| `factor × multiplier` | S-03 키에 한해 **= 1 강제** (`validateS03LegacyParity`) + 정수결과 강제 (`validateOrderQuantityCompatibility`) | `Math.abs(f*m - 1) > 1e-9` 면 거부 | 동일 |

**이 간극의 무게**: §3에서 세는 주문 파생 수량 축 **34개 중 조건 없이 성립하는 것은 사실상 3개**
(홈 발통·싱글 받침대·싱글 실링펌프)뿐이고, 나머지 31개는 전부 **옵션 칩 값(판넬변경/리모컨/유연호스 제외/받침대 제외/360판넬 형상)에 따라 target 모델 또는 발화 여부가 갈린다.**
즉 지금 클라이언트 계약을 그대로 두면 **주문 파생 규칙의 91%는 스키마로 이식해도 주문앱이 읽지 못한다.**

---

## 2. 🚨 필수 항목 ② — "주문앱이 서버 규칙을 수량에 반영하지 않는다" 는 **사실이다** (코드 확인)

증거 4점. 전부 실행 경로이며 추론이 아니다.

**(a) 모듈 헤더가 스스로 shadow 라고 선언** — `src/quantitySync.ts:1-6`
```ts
 * <p>이번 슬라이스는 S-03 설정을 읽고 기존 하드코딩 계산과 대조하는 데만 사용한다.
 * 사용자 주문 경로는 이 모듈의 evaluator를 호출하지 않고 legacy 계산을 유지한다.
```

**(b) 브리지는 rule 상태만 보관** — `src/main.ts:61-83`
`window.__SAMHAN_QUANTITY_SYNC__.getQuantitySyncRules()` 는 `selectSingleS03Rule` 만 호출하고
`singleQuantitySyncState`(status/rule/errorMessage)에 넣은 뒤 `samhan:quantity-sync-ready` 이벤트만 발행한다.
**`evaluateSingleS03Rule` 은 `main.ts` 어디에서도 호출되지 않는다.**

**(c) 레거시 페이지의 유일한 소비 지점이 `console.info` 뿐** — `index.html:5545-5558`
```js
function loadSingleS03QuantitySync_(){
  const bridge = window.__SAMHAN_QUANTITY_SYNC__;
  ...
  return bridge.getQuantitySyncRules(SINGLE_SETS).then(state=>{
    if(state?.status === 'ready'){
      console.info('[quantity-sync shadow] S-03 설정을 읽었습니다. 사용자 계산은 legacy 수식을 유지합니다.');
    } else {
      console.info('[quantity-sync shadow] S-03 설정 관측 불가:', state?.errorMessage || '알 수 없는 오류');
    }
  });
}
```
`state.rule` 을 꺼내 쓰는 코드가 없다. `singleQty` 에 반영하는 코드도 없다.

**(d) 호출 시점도 계산과 분리** — `index.html:8548-8571`
```js
  // 로그인으로 JWT가 준비된 뒤에만 칩 설정을 조회한다. 조회 결과는 shadow 관측만
  // 하고 사용자에게 보이는 수량·금액·전송 payload는 기존 S-03 식으로 유지한다.
  const quantitySyncLoad = loadSingleS03QuantitySync_();
```
그 뒤 `renderHome()/renderSingle()/renderComm()` 이 동기로 돌고, `quantitySyncLoad` 는 `void … .catch()` 로 버려진다.

**실제 S-03 수량을 정하는 코드**는 여전히 `index.html:5196-5202` 의 이름 파싱이다.
```js
  let pumpQty=0;
  SINGLE_SETS.forEach(s=>{
    if(s.id===SS_CEILING_PUMP_ID) return;
    if(/운임|절삭/i.test(s?.name||'')) return;
    if(/실링/i.test(((s?.name)||'')+' '+((s?.model)||''))){pumpQty+=(singleQty.get(s.id)||0);}
  });
  setSingleDerivedQty_(SS_CEILING_PUMP_ID, 'ADP-F075SP', pumpQty, '실링용 드레인펌프 파생');
```

**판정**: 서버 규칙은 **로그인 시 1회 조회 → 콘솔 로그 → 폐기**. 수량·금액·전송 payload 어디에도 반영되지 않는다.
`evaluateSingleS03Rule` 의 유일한 실행자는 테스트(`src/__tests__/quantitySyncS03*.test.ts`)와
`scripts/quantity-sync-s03-shadow.mjs`(오프라인 대조 하네스)다.

> 🔑 그리고 위 legacy 식은 개발책임자 확정 규칙 위반이다 — `/실링/` **이름 파싱**으로 본체를 고른다.
> 환원 형태는 §3 C-21 에 제시한다.

---

## 3. 🚨 필수 항목 ③ — 견적↔주문 **독립 구현** 대조표

두 앱이 같은 규칙을 **각자 복사해 구현**했고, 그 사이에 **실측 가능한 결과 차이**가 있다.
근거는 코드 원문 + `clients/web/legacy-quantity-golden/goldens.js`(정본 함수를 실제 실행해 기록한 출력)다.

| # | 규칙 | 견적 (`index.ejs`) | 주문 (`index.html`) | 실측 차이(golden) |
|---|---|---|---|---|
| X-1 | **360 CST 리모컨 target** | `REMOTE_360_DEFAULT` 정규식이 달라 `AR-EC05` 로 흡수 (`:4489`) | `REMOTE_360_DEFAULT=(HOMEMULTI.find(r=>/(AR-?KH05)/i.test(r?.model\|\|'')\|\|/360.*리모컨/i.test(r?.name\|\|''))\|\|{}).model` (`:2897`) | H-01 견적 `AR-EC05:4` ↔ 주문 `AR-EC05:3 + AR-KH05:1` · H-02 `5` ↔ `2+3` · H-05 `7` ↔ `5+2` |
| X-2 | **홈 Y형 분기관 발화 조건** | `if (iCnt >= 2 && sOut > 0)` (`:8318`) | `if (singleOutCount > 0)` — 실내기 하한 없음 (`:5526`) | — |
| X-3 | **홈 분기관 실내기 집계 범위** | `/(실내기\|벽걸이\|에어콤보\|전열교환기)/` 포함, 제외어 `(판넬\|리모컨\|호스\|분기관\|발통)` (`:8295`) | `/(실내기\|벽걸이)/` 만, 제외어 9종 (`:5503`) | H-07 견적 `AXJ-YA1509N:1` ↔ 주문 **없음** |
| X-4 | **홈 리모컨 반영 방식** | 누적 `homeQty.set(m,(homeQty.get(m)\|\|0)+q)` (`:8248`) | 치환 `setDerivedQty(...)` = `state.set(model, q)` (`:2338`) | 같은 모델이 두 갈래에서 잡히면 견적만 2배 |
| X-5 | **상업 공청 4WAY 판넬 target** | `m.replace('NUF','NUC').replace('K1','K4')` → `PC4NUCK4NW` (`:8635`) | `m.replace(/NBF\|NUF/,'NUC')` → **`PC4NUCK1NW`** (`:5919`) | C-01-AIR-PANEL 견적 `PC4NUCK4NW:1` ↔ 주문 **판넬 0** (모델이 카탈로그에 없어 누락 경고) |
| X-6 | 상업 공청 swap 매칭 범위 | `/NUF(K1N\|K1NW\|DK1N\|DK1NW)\|WSK3(NW\|N)/` | `/N[BU]?F(…)\|WSK3(NW\|N)/` — **NBF(블랙 base)도 매칭** | 블랙→공청 연속 변경 시 결과 상이 |
| X-7 | **상업 유연호스 "나머지"** | `if(1way\|2way) nTarget+=q; else nNormal+=q;` → 나머지를 **4WAY 호스에 합산** (`:8427`) | `if(kind==='1way'\|\|'2way') n1w+=q; if(kind==='4way'\|\|'360') n4w+=q;` → **나머지 버림** (`:5729`) | C-02-REMAINDER-DRIFT 견적 `FH-LFHLF4W:2` ↔ 주문 **없음** |
| X-8 | 상업 4WAY 호스 반영 | `want.set(hose4L,(want.get(hose4L)\|\|0)+nNormal)` 누적 | `want.set(hose4, n4w)` 치환 | 판넬/호스 target 충돌 시 상이 |
| X-9 | **I형 유연호스 스위치 출처** | 홈=`#home_hose_i` DOM 체크박스 / 상업=`window.SHOW_I_HOSE \|\| #comm_hose_i` | **거래처 DC 설정 `window.SHOW_I_HOSE` 단독** (칩 자체가 없음) | H-01-I-DOM-ONLY 견적 `FH-LFHIF:2` ↔ 주문 `FH-LFHLF:2` |
| X-10 | **싱글 받침대 대상 필터** | 부자재·실외기 받침·자재 제외 + `unit`이 `SET`\|`식` 인 것만 + 제외어 `운임\|절삭\|비용\|설치비` (`:7975-7989`) | `운임\|절삭` 만 제외 (`:5174`) | S-01-CATEGORY-DRIFT 주문에만 `set-round-target:4` 발생 |
| X-11 | **단위 반올림 설정 출처** | `roundByConfig(n, prefix)` — DOM `#{prefix}_round_unit/_round_mode` (화면 select) | `roundByConfig(n)` — `CONFIG.unitRoundTo/unitRoundMode` (거래처 DC) | 같은 품목 단가가 두 앱에서 다르게 절사 |
| X-12 | **티어 보너스 상한** | `calcH += hBonus` — **상한 없음** (`:13690`) | `calcH = Math.min(calcH + hBonus, 0.48)` (`:8127`) | 45%+4% 시 견적 49% ↔ 주문 48% |
| X-13 | **할인율 페널티 발화 조건** | `isIndoorOnly()` — **실외기가 0** 이면 45→40% | `isNoMainUnit()` — **실내기·실외기 둘 다 0** 이면 45→40% (`:8089`) | 실내기만 주문 시 견적만 페널티 |
| X-14 | 드레인펌프 seed | `want.set(pump, sum)` — 합계 0도 기록 | `if (sum > 0) want.set(pump, sum)` + 펌프 전용 입력행 `commQty.set(model,0)` (`:5769-5776`) | — |
| X-15 | 세트 구성품 "기본" 판별 | `isDefaultComponent_(p)` — `p.isDefault` boolean 우선, 없으면 `/기본/i.test(feat)` (`:5085`) | `/기본/i.test(p?.feat\|\|'')` 단독 (`:3248,3265`) | BE가 `isDefault` 를 주면 견적만 반응 |
| X-16 | 홈 계산 트리거 품목 | 분기관·일자발/발통·유연호스·판넬 제외 / 실내기·벽걸이·**단배관·다배관**·전열교환기 포함 | 분기관·실외기 받침대 제외 / 실내기·벽걸이·**실외기**·전열교환기·에어콤보 포함 (`:5214-5222`) | 입력→재계산 발화 범위 상이 |
| X-17 | 수동 잠금 저장소 | 계열별 Set 5종(`HOME_MANUAL_PANEL/REMOTE/HOSE/BRANCH/FOOT`, `COMM_MANUAL_BASE` …) | 스코프 3종 통합 `MANUAL_QTY_LOCKS{home,commercial,single}` + `controlId` 소유 판정 (`:2278-2334`) | 스냅샷 복원 형식 상이(주문은 구형 키 호환층 보유) |
| X-18 | 상업 GHP 실외기 원행 보존 | C-08 golden 에 원 실외기 `AM180AXVGHH1` **없음** | golden 에 `AM180AXVGHH1:2` **있음** | C-08 / C-08-NO-BASE 두 케이스 모두 |

> 🔑 **X-1 · X-3 · X-5 · X-7 · X-9 · X-10 · X-12 · X-13 은 금액 또는 출고 품목이 달라지는 축**이다.
> 정본을 하나로 확정하지 않으면 스키마 이식 시 "둘 중 어느 쪽을 넣을지" 가 그대로 남는다 → §7 결정 목록.

---

## 4. §1 서버 규칙 계약 축 (A-01 ~ A-21) — `quantitySync.ts` · `samhanApi.ts`

| ID | ①함수·파일:줄 | ②조건→결과 | ③상수·리터럴 | ④읽는 컬럼/속성 | ⑤우리 스키마 | ⑥판정 |
|---|---|---|---|---|---|---|
| A-01 | `selectSingleS03Rule` `quantitySync.ts:110-113` | `ruleKey===SINGLE_S03_CEILING_DRAIN_PUMP` 인 것이 정확히 1개가 아니면 error | `'SINGLE_S03_CEILING_DRAIN_PUMP'` | `rule.ruleKey` | `quantity_sync_rule.rule_key` (활성 unique) | [자동] |
| A-02 | 동 `:105-109` | 후보 필터는 `ruleKey` 일치 **또는** `legacyRef==='S-03'` | `'S-03'` | `rule.legacyRef` | `legacy_ref` | [자동] |
| A-03 | 동 `:117` | `enabled !== true` → error | `true` | `enabled` | `enabled` | [자동] |
| A-04 | 동 `:118-120` | `estimateCategory !== 'SINGLE_SET'` → error | `'SINGLE_SET'` | `estimateCategory` | `estimate_category` (`HOME_MULTI\|SINGLE_SET\|COMM_MULTI`) | [자동] |
| A-05 | 동 `:121` | `aggregation !== 'SUM'` → error | `'SUM'` | `aggregation` | `aggregation` (CHECK = SUM) | [자동] |
| A-06 | 동 `:122-124` | `inactiveBehavior !== 'ZERO'` → error | `'ZERO'` | `inactiveBehavior` | `inactive_behavior` (`ZERO\|KEEP`) | 🚩 KEEP 미소비 |
| A-07 | 동 `:126-129` | `condition` 키 1개라도 있으면 error | `{}` | `conditionJson`(`when` 우선, 죽은 경로) | `condition_json` jsonb | 🚩 **최대 간극** |
| A-08 | 동 `:130-132` | `sources.length < 1` → error | `1` | `sources[]` | `quantity_sync_source` | [자동] |
| A-09 | 동 `:133-135` | `targets.length !== 1` → error | `1` | `targets[]` | `quantity_sync_target` | 🚩 서버는 N 허용 |
| A-10 | `positiveNumber` `:61-67` | 유한수 & `>0` 아니면 throw | — | `factor`,`multiplier` | `factor`,`multiplier` (CHECK >0, ≤1000, scale≤4) | [자동] |
| A-11 | `:158-160` | `abs(factor*multiplier − 1) > 1e-9` → `'S-03 설정이 legacy 수량과 일치하지 않습니다.'` | `1e-9`, `1` | 동 | `QuantitySyncRuleValidator.validateS03LegacyParity` 와 동일 불변식 | [자동] |
| A-12 | `evaluateSingleS03Rule` `:207-208` | `roundingMode==='FLOOR'` → `Math.floor`, 그 외 무반올림 | `'NONE'`,`'FLOOR'` | `roundingMode` | `rounding_mode` (CHECK) | [자동] |
| A-13 | 전 파일 | `conflictPolicy` 를 읽는 코드 없음 | — | — | `conflict_policy` (`ADD\|REPLACE`) | 🚩 미소비 |
| A-14 | 전 파일 | `priority` 를 읽는 코드 없음 | — | — | `priority` | 🚩 미소비 |
| A-15 | `rowsForProductCode` `:69-71` | `String(row.modelCode ?? row.model).trim().toUpperCase()` 일치 | — | 카탈로그행 `modelCode`/`model` | `products.model_code` | [자동] |
| A-16 | `evaluateSingleS03Rule` `:204,213` | 수량 조회·결과 키가 **카탈로그행 `id`** (모델코드 아님) | — | `SingleCatalogRow.id` | `products.id`(UUID) — **화면 비노출 원칙과 충돌 없음(내부 조인)** | 파생 |
| A-17 | `fetchQuantitySyncRules` `samhanApi.ts:189-191` | `GET /quantity-sync-rules?estimateCategory=SINGLE_SET`, size 50, `totalPages` 전 페이지 순회 | `'SINGLE_SET'`, `50` | 페이지 메타 `content/totalElements/totalPages/number/size` | 목록 API | [자동] |
| A-18 | `confirmLines` `samhanApi.ts:226-228` | `Number.isInteger(qty) && qty>=1` 아니면 전송 거부 | `1` | 주문행 `qty` | 파생 수량이 소수면 전송 자체가 막힘 (서버 `validateOrderQuantityCompatibility` 와 짝) | [자동] |
| A-19 | `CONFIRM_CATEGORY_BY_SECTION` `samhanApi.ts:200-205` | `HOME→homemulti · COMM→commercialMulti · SINGLE→singleSets · OLD→oldProducts` | 4쌍 | 주문행 `section` | `estimate_category` 매핑(HOME_MULTI/COMM_MULTI/SINGLE_SET + 구형 미대응) | 🚩 OLD 대응 없음 |
| A-20 | `getProducts` `samhanApi.ts:407-414` | `usageScope=PARTNER_ORDER` + `status !== DISCONTINUED && !== NOT_FOR_SALE` | 3리터럴, size 50 | `products.status`,`usage_scope` | `usage_scope`,`status` | [자동] |
| A-21 | shadow 경계 | 조회 결과가 수량/금액/전송에 **미반영** (§2) | — | — | — | 🚩 |

---

## 5. §2 옵션 기본값 축 (B-01 ~ B-18)

**출처 실측**: `HOME_DEFAULTS`/`SINGLE_DEFAULTS` 는 bootstrap 의 `homeDefaults`/`singleDefaults` 키에서 온다(`index.html:1360-1361,1436`).
그런데 `partner-order-service/src/main/resources/application.yml:98` 의 `app.bootstrap.range-map` 에는
`homemulti / singleSets / singleParts / commercialMulti / commercialParts / oldProducts / *Inc` 만 있고
**`homeDefaults`·`singleDefaults` 시트 매핑이 없다.**
그리고 `V2__seed_bootstrap_cache.sql:14-15` 의 seed 값은 **`'{}'` 빈 객체**다.

⟹ **현재 운영에서 옵션 기본값은 전부 `index.html` 하드코딩 fallback 으로 떨어진다. 시트의 기본값 탭은 아직 한 축도 이식되지 않았다.**

| ID | ①함수·파일:줄 | ②조건→결과 | ③상수·리터럴 | ④읽는 시트 키 | ⑤우리 스키마 | ⑥판정 |
|---|---|---|---|---|---|---|
| B-01 | `renderHomeOptions` `:5126-5127` | 홈 리모컨 select. `'선택 안함'` → `'기본'` 로 치환 | 옵션 `기본/유선/컬러/제외` · 기본 `'기본'` | `HOME_DEFAULTS['리모컨']` | 대응 테이블 **없음** | 🚩 |
| B-02 | 동 `:5128` | 홈 판넬변경 select | `''`(=기본) `/판넬제외/공청판넬/인피니트 25년형/인피니트 공청+동작감지 AI` · 기본 `''` | `HOME_DEFAULTS['판넬변경']` | 없음 | 🚩 |
| B-03 | 동 `:5129` | 홈 유연호스 제외 체크박스 | 기본 `false` | `HOME_DEFAULTS['유연호스 제외']` | 없음 | 🚩 |
| B-04 | 동 `:5130` | 홈 분기관 제외 | 기본 `false` | `HOME_DEFAULTS['분기관 제외']` | 없음 | 🚩 |
| B-05 | 동 `:5131` | 홈 발통포함 | 기본 `false` | `HOME_DEFAULTS['발통포함']` | 없음 | 🚩 |
| B-06 | `renderSingleOptions` `:5137` | 싱글 유선리모컨 select | `''/유선리모컨/컬러유선리모컨` · 기본 `''` | `SINGLE_DEFAULTS['유선리모컨']` | 없음 | 🚩 |
| B-07 | 동 `:5138` | 싱글 리모컨 제외 | 기본 `false` | `SINGLE_DEFAULTS['리모컨 제외']` | 없음 | 🚩 |
| B-08 | 동 `:5139` | 싱글 실외기 받침대 포함 | 기본 `false` | `SINGLE_DEFAULTS['실외기 받침대 포함']` | 없음 | 🚩 |
| B-09 | 동 `:5140` | 싱글 판넬변경 select | `''/판넬제외/블랙판넬/승강판넬/공청판넬` | `SINGLE_DEFAULTS['판넬변경']` | 없음 | 🚩 |
| B-10 | 동 `:5141` | 싱글 360판넬 | `원형/사각` · **기본 `'원형'` 하드코딩 — 시트 미참조** | (없음) | 없음 | 🚩 |
| B-11 | 동 `:5142` | 싱글 자재 포함 여부 | `포함/별도` · 기본 `'별도'` | `SINGLE_DEFAULTS['자재 포함 여부']` | 없음 | 🚩 |
| B-12 | `renderCommOptions` `:4321` | 상업 판넬변경 | `판넬제외/기본판넬/블랙판넬/승강판넬/공청판넬/동작감지` · 기본 `'기본판넬'` **하드코딩** | (없음) | 없음 | 🚩 |
| B-13 | 동 `:4322` | 상업 360판넬 | `원형/사각` · 기본 `'원형'` | (없음) | 없음 | 🚩 |
| B-14 | 동 `:4323` | 상업 리모컨 | `제외/무선/유선/컬러유선` · 기본 `'무선'` | (없음) | 없음 | 🚩 |
| B-15 | 동 `:4324` | 상업 유연호스 제외 | 기본 `false` | (없음) | 없음 | 🚩 |
| B-16 | 동 `:4325` | 상업 받침대 제외 | 기본 `false` | (없음) | 없음 | 🚩 |
| B-17 | `sel()` `:5123` | 저장된 기본값이 옵션 배열에 없으면 **배열 첫 원소**로 강등 | — | — | — | 파생 |
| B-18 | `clearManualQtyLocks(scope, controlId)` `:2302-2334` | 옵션 변경 시 **그 옵션이 지배하는 계열의 수동잠금만** 해제 (홈 5 controlId · 상업 4 controlId) | `home_panel/home_no_hose/home_remote/home_no_branch/home_foot` · `comm_panel/comm_p360/comm_ex_hose/comm_remote/comm_ex_base` | 행 `name`,`model` 정규식 | 없음 | 🚩 |

---

## 6. §3 파생 수량 규칙 축 (C-01 ~ C-34)

> 이하 ⑤는 전부 `quantity_sync_rule(+source/target)` 로의 대응이며,
> **⑥에서 [자동] 은 "이름/HP 파싱 없이 (본체 코드, 부자재 코드, 수량) 표로 그대로 환원 가능"**,
> **파생 은 "카탈로그 sweep 1회로 표를 생성 가능"**, **🚩 는 "정본 확정 없이는 표를 만들 수 없음"** 이다.

### 6-1. 홈멀티 (C-01 ~ C-18)

| ID | ①함수:줄 | ②조건→결과 | ③상수 | ④읽는 속성 | ⑤스키마 대응 | ⑥판정 |
|---|---|---|---|---|---|---|
| C-01 | `recomputeHomeDerived` `:5626-5658` | 실내기 이름에 `1WAY` → `n1w` 합산 → `HOSE_1W` 수량 | fallback `'FH-LFHLF'` | 행 `name` 정규식 | rule(HOME_MULTI, cond `{}`), source=1WAY 실내기 전건 factor 1, target=FH-LFHLF ×1 | 파생 (실내기 코드 sweep) |
| C-02 | 동 `:5650-5653` | `window.SHOW_I_HOSE` 참이면 target 이 `HOSE_I_1W` 로 바뀌고 `HOSE_1W`=0 | fallback `'FH-LFHIF'` | DC 설정 | `condition_json {"optionEquals":["showIHose",true]}` 필요 | 🚩 (A-07 간극) |
| C-03 | 동 `:5634-5640,5659` | `4WAY` + `360` 합산 → `HOSE_4W` | fallback `'FH-LFHLN'` | 행 `name` | rule + source N건 | 파생 |
| C-04 | 동 `:5661` | `HOSE_I_4W` 는 **항상 0** (I형 4WAY 미사용) | — | — | 규칙 불필요 | [자동] |
| C-05 | 동 `:5643-5648` | `#home_no_hose` 체크 시 호스 4종 전부 0 | — | DOM | `condition_json` + `inactive_behavior=ZERO` | 🚩 |
| C-06 | `recomputeHomePanels` `:5350-5358` | 360/4WAY × WIFI/미내장 실내기 수 → `pickPanelBy()` 가 고른 판넬 | fallback `PC6NUDK1NW/PC6NUDK1N/PC4NUFK1NW/PC4NUFK1N` | 행 `name`,`disp`,`model` 정규식 + 가중치 정렬(`기본` −2 / `블랙·승강` +2) | rule 4개 | 🚩 **가중치 선택은 설정으로 환원 불가 — 표로 고정 필요** |
| C-07 | 동 `:5362-5385` | 1WAY 소/중/대 × WIFI/미내장 × 공청여부 → `PANEL_MODELS` 12키 | `p1sWi PC1MWSK3NW · p1mWi PC1NWSK3NW · p1bWi PC1BWSK3NW · p1sNo PC1MWSK3N · p1mNo PC1NWSK3N · p1bNo PC1BWSK3N · a1sWi PC1MWCK3NW · a1mWi PC1NWCK3NW · a1bWi PC1BWCK3NW · a1sNo PC1MWCK3N · a1mNo PC1NWCK3N · a1bNo PC1BWCK3N` | `name` 의 `소형/중형/대형`·`WIFI/미내장` | rule 12개(옵션 조건 2갈래) | 🚩 조건 필요 |
| C-08 | 동 `:5388-5405` / `INF_BASE :5240-5245` | 인피니트 중/대 × 옵션 4갈래 | `mid: base PC1YNWK1NW / air PC1YNCK1NW / ai PC1YNRK1NW` · `big: base PC1ZNSK1NW / base25 PC1ZNWK1NW / air PC1ZNCK1NW / ai PC1ZNRK1NW` | `name` 의 `인피니트`·`대형` | rule 7개 | 🚩 조건 필요 |
| C-09 | 동 `:5408-5427` | 옵션 `공청판넬` 일 때 4WAY/360 기본 판넬 → 공청 판넬로 **수량 이관** | `PC4NUFK1NW→PC4NUCK4NW · PC6NUDK1NW→PC6NUCK1NW · PC4NUFK1N→PC4NUCK1N · PC6NUDK1N→PC6NUCK1N` | 현재 수량 + 잠금 상태 | `conflict_policy=REPLACE` + 조건 | 🚩 |
| C-10 | 동 `:5297` | 옵션 `판넬제외` → 전 판넬 0 후 즉시 return | — | DOM | 조건 | 🚩 |
| C-11 | `recomputeHomeRemotes` `:5469-5476` | 옵션 `기본`: 360CST→`AR-KH05` · 인피니트→`AR-CH01` · (1/4WAY+벽걸이)→`AR-EC05`, 유선계 3종 0 | `AR-KH05/AR-CH01/AR-EC05` | `name` 정규식 4종 | rule 3개(조건 `remoteOption=기본`) | 🚩 |
| C-12 | 동 `:5477-5483` | 옵션 `유선`/`컬러`: 4계열 총합 → `AWR-WE13N`/`AWR-WG00N` + 동수 `AIM-A01N` | `AWR-WE13N/AWR-WG00N/AIM-A01N` | 동 | rule 4개 | 🚩 |
| C-13 | 동 `:5462` | 전열교환기·에어콤보 수 → `REMOTE_COLOR_AIRCOMBO`(fallback `AWR-WG00N`) 가산. 단 자기 자신 제외 | `AWR-WG00N` | `name` 정규식 | rule 1개 | 파생 |
| C-14 | 동 `:5457-5459` | 옵션 `제외` → 전 리모컨 0 후 return | — | DOM | 조건 | 🚩 |
| C-15 | `recomputeHomeBranches` `:5522-5539` | `단배관` 실외기>0 일 때 `2512 = 6HP단배관수`, `1509 = 실내기수 − 단배관수 − 6HP수` (음수 0 클램프) | `AXJ-YA2512N`,`AXJ-YA1509N`, `MODEL_6HP_SINGLE` | `name` 의 `실외기`·`단배관`·`실내기`·`벽걸이` | **뺄셈식** — `factor/multiplier` 로 표현 불가 | 🚩 **스키마 표현력 초과** |
| C-16 | 동 `:5491-5495` | `#home_no_branch` → 2512/1509 = 0 | — | DOM | 조건 | 🚩 |
| C-17 | `recomputeFootAll` `:5159-5166` | `#home_foot` 체크 시 홈 실외기 총수 → `FOOT_ROUND`(fallback `발통세트`) | — | `name` 의 `실외기` | rule 1개(source=실외기 전건, target=발통세트 ×1) | 파생 |
| C-18 | 동 `:5165` | `FOOT_FLAT`(SI-AL700a)은 홈에서 **항상 0** | — | — | 규칙 불필요 | [자동] |

### 6-2. 싱글중대형 (C-19 ~ C-21)

| ID | ①함수:줄 | ②조건→결과 | ③상수 | ④읽는 속성 | ⑤스키마 대응 | ⑥판정 |
|---|---|---|---|---|---|---|
| C-19 | `recomputeSingleBaseFoot` `:5168-5182` | `#ss_base` 체크 시 각 세트 수량을 모델로 갈라 `발통세트`/`SI-AL700a` 로 | `AP230DAPDHH1S`,`AP290DAPDHH1S` → flat, 그 외 round · 제외어 `운임\|절삭` | 세트 `model`,`name` | rule 2개, source = 세트 전건 factor 1 | 파생 — **X-10 정본 확정 선행** |
| C-20 | `recomputeSingleExtras` `:5185-5195` | `#ss_remote` 가 유선/컬러유선 **AND** `is1WaySet_` **AND** `allowRemoteChange_` 인 세트 수량 합 → `AIM-A01N` | `AIM-A01N` · 허용 기본리모컨 `/^(AR-?EH05\|AR-?EC05\|AR-?KH05)$/` | 세트 `name`,`model`, 구성품 `name`,`spec`,`model`,`feat` | rule 1개 + 조건 2개 | 🚩 |
| C-21 | 동 `:5196-5202` (**= S-03**) | `/실링/` 이 이름 또는 모델에 있는 세트 수량 합 → `ADP-F075SP`(자기 자신 제외, `운임\|절삭` 제외) | `ADP-F075SP` | 세트 `name`+`model` | **이미 이식됨** — `SINGLE_S03_CEILING_DRAIN_PUMP`, cond `{}`, SUM, ZERO, factor 1 × multiplier 1 | [자동] — 단 §2 대로 **소비되지 않음** |

**C-21 설정값 표 환원 (개발책임자 확정 규칙 준수 형식)** — 이름 파싱 폐기, 코드 지정으로:

| 본체 model_code | 부자재 model_code | 수량(계수) |
|---|---|---|
| (`실링` 계열 싱글 세트 전건 — 카탈로그 sweep 결과로 확정) | `ADP-F075SP` | 1 |

> 실측 sweep 은 활성 SHEET 계열 싱글 세트를 대상으로 해야 하며, 이 sweep 이 곧 `quantity_sync_source` 행 목록이다.
> 지금 shadow 하네스(`scripts/quantity-sync-s03-shadow.mjs:12-14`)도 같은 방식으로 `/실링/` 파싱을 쓰고 있어 **환원이 안 된 상태**다.

### 6-3. 상업멀티 (C-22 ~ C-34)

| ID | ①함수:줄 | ②조건→결과 | ③상수 | ④읽는 속성 | ⑤스키마 대응 | ⑥판정 |
|---|---|---|---|---|---|---|
| C-22 | `computeCommPanelModelForIndoor_` `:5892-5976` | 실내기 이름 형태(1/2/4WAY·360·MINI·인피니트) × WIFI 내장/미내장 × 크기(소/중/대) × 옵션(기본/블랙/승강/공청/동작감지) × 360형상(원형/사각) → 판넬 모델 | 아래 **전량 매트릭스** | `name` 정규식 12종 + DOM 2 | rule 다수 + 조건 | 🚩 |
| C-23 | `recomputeCommDerived` `:5723-5739` | `commIndoorKind` 이 `1way\|2way` → `pickHoseModel('1way')` | fallback `FH-LFHIF`/`FH-LFHLF` · 제외어 `벽걸이\|덕트\|DUCT\|실링\|스탠드` | `name` | rule 1개(+SHOW_I_HOSE 조건) | 🚩 |
| C-24 | 동 `:5730,5737-5739` | `4way\|360` → `pickHoseModel('4way')` | — | `name` | rule 1개 | 🚩 |
| C-25 | 동 `:5732,5740-5742` | `#comm_ex_hose` → 전 호스행 0 | — | DOM | 조건 | 🚩 |
| C-26 | `computeCommRemoteModelForIndoor_` `:2444-2475` | 우선순위 8단: 제외→`''` / 전열교환기→`AWR-VH12N` / 덕트→(컬러유선 `AWR-WG00N`, 그 외 `AWR-WE13N`) / 유선→`AWR-WE13N` / 컬러유선→`AWR-WG00N` / 무선+UV-C→`AR-CH01` / 인피니트→`AR-CH01` / 그 외→`AR-EH05` | `AWR-VH12N/AWR-WG00N/AWR-WE13N/AR-CH01/AR-EH05` | `name` | rule 5~8개 + 조건 | 🚩 |
| C-27 | 동 `:5754-5776` `PUMP_MAP` | 실내기 모델 리스트별 합계 → 펌프 모델 1:1 | **아래 22쌍 전량 표** | **`model` 정확 일치 — 이름 파싱 없음** | rule 6개, source 22행 factor 1, target multiplier 1 | **[자동] — 유일하게 이미 코드 기반** |
| C-28 | `chooseBaseModel` `:2504-2547` | 실외기 이름의 계열어(ECO/GHP/프라임/한랭지/표준형/냉방전용 상부토출/프레스티지·동시냉난방·공장전원) × **HP 토큰 정확 매칭** → 받침대 모델 | `SI-AL600a/SI-AL700a/GHP방진가대/ACL-KORGHP07/방진가대S2소/중/대` + HP 목록 20종 | `name` 문자열 + `(a+b)` 괄호 파싱 | rule 7개, source=실외기 코드 목록 | 🚩 **이름·HP 파싱 → 표 환원 필수** |
| C-29 | `countBranchForSet` `:2574-2580` + `:5806-5824` | 세트 실외기 이름 괄호 안 `+` 개수 × 수량 → `AXJ-TA3419M` | `AXJ-TA3419M` | `name` 괄호 | rule 1개, source=세트 실외기별 **factor = 조각수−1** | 파생 — 표 환원 가능 |
| C-30 | `RENEW_FILTER_MAP` `:2583-2586` + `:5827-5840` | 지정 실외기 수량 → 필터 | **`AF-R09A ← AM035FXMRHC1·AM050MXMRBC1·AM050FXMRHC1` · `AF-R12A ← AM075FXMRHC1`** | **`model` 정확 일치** | rule 2개, source 4행 | **[자동]** |
| C-31 | 동 `:5842-5866` | `comm_panel=판넬제외` → 판넬행 0 · `comm_remote=제외` → 리모컨행 0 · `#comm_ex_base` → 받침대행 0 | 받침대 판별어 `방진가대\|받침대\|발통세트\|si-al600a\|si-al700a` | DOM + `name/disp/model` | 조건 3개 | 🚩 |
| C-32 | `codeByCumulativeSum` `:7169-7176` / `codeByOutdoorHP` `:7179-7192` | 실내기 누적 용량 → 분기관 코드 6버킷; **마지막 슬롯은 실외기 HP 표로 강제 덮어쓰기** | 누적 `150/406/464/696/986` · HP `50/100/160/220/340` → `1509/2512/2812/2815/3419/4119` | 슬롯 `cap`, 실외기 `model` 의 `AM(\d{3})` | **구간 표** — 현 스키마에 구간 개념 없음 | 🚩 **스키마 표현력 초과** |
| C-33 | `firstBranchByOutdoorCap` `:7710-7717` | 실외기 용량 → 첫 분기관 모델 | `140/260/280/340/410` → `AXJ-YA1509N/2512N/2812M/2815M/3419M/4119M` | `cap` | 구간 표 | 🚩 |
| C-34 | `inferStandCountForOutdoor_` `:3485-3490` + `recalcCommAccessories` `:3492-3515` | 세트 구성품에 `GHP방진가대` 가 있으면 해당 실외기 수량만큼 추천 | `GHP방진가대` | 구성품 `name` | C-28 과 중복 계열 | 🚩 중복 |

#### C-27 PUMP_MAP 전량 (본체 model_code → 부자재 model_code, 수량 1) — `index.html:5754-5761`

| 본체(실내기) model_code | 부자재 model_code | 수량 |
|---|---|---|
| AM052DNLDBH1 · AM072DNLDBH1 | `MDP-Z075SZED` | 1 |
| AM100FNLDBH1 | `ADP-E075SEK3D` | 1 |
| AM130DNMDBH1 · AM145DNMDBH1 | `MDP-M075SGK2D` | 1 |
| AM083DNMDBH1 · AM100DNMDBH1 · AM110DNMDBH1 · AM052ANHDBH1 · AM060ANHDBH1 · AM072ANHDBH1 · AM083ANHDBH1 · AM100ANHDBH1 · AM110ANHDBH1 · AM130ANHDBH1 · AM145ANHDBH1 · AM230ANHDBH1 | `ADP-G075SPK1D` | 1 |
| AM290HNHDBH1 | `ADP-N047SNK1D` | 1 |
| AM072TNCDBH1 · AM110TNCDBH1 · AM130TNCDBH1 · AM145TNCDBH1 | `ADP-F075SP` | 1 |

= source 22행 / target 6행. **그대로 `quantity_sync_source`/`target` 으로 이식 가능.**

#### C-22 상업 판넬 target 전량 매트릭스 — `index.html:5892-5976`

| 실내기 형태 | WIFI | 크기 | 기본판넬 | 블랙판넬 | 승강판넬 | 공청판넬 | 동작감지 |
|---|---|---|---|---|---|---|---|
| 2WAY | — | — | `PC2NWSK1N` | 동左 | 동左 | 동左 | 동左 |
| 1WAY | 내장 | 소 | `PC1MWSK3NW` | 동左 | 동左 | `PC1MWCK3NW` | 동左 |
| 1WAY | 내장 | 중 | `PC1NWSK3NW` | 동左 | 동左 | `PC1NWCK3NW` | 동左 |
| 1WAY | 내장 | 대 | `PC1BWSK3NW` | 동左 | 동左 | `PC1BWCK3NW` | 동左 |
| 1WAY | 미내장 | 소 | `PC1MWSK3N` | 동左 | 동左 | `PC1MWCK3N` | 동左 |
| 1WAY | 미내장 | 중 | `PC1NWSK3N` | 동左 | 동左 | `PC1NWCK3N` | 동左 |
| 1WAY | 미내장 | 대 | `PC1BWSK3N` | 동左 | 동左 | `PC1BWCK3N` | 동左 |
| 1WAY 인피니트 | — | 중 | `PC1YNWK1NW` | 동左 | 동左 | 동左 | `PC1YNRK1NW` |
| 1WAY 인피니트 | — | 대 | `PC1ZNWK1NW` | 동左 | 동左 | 동左 | `PC1ZNRK1NW` |
| 4WAY MINI | 내장 | — | `PC4SUFK1NW` | 동左 | 동左 | 동左 | 동左 |
| 4WAY MINI | 미내장 | — | `PC4SUFK1N` | 동左 | 동左 | 동左 | 동左 |
| 4WAY | 내장 | — | `PC4NUFK1NW` | `PC4NBFK1NW` | `PC4NUXK1NW` | 🚩주문 `PC4NUCK1NW` / 견적 `PC4NUCK4NW` | (미적용) |
| 4WAY | 미내장 | — | `PC4NUFK1N` | `PC4NBFK1N` | `PC4NUXK1N` | 🚩주문 `PC4NUCK1N` / 견적 `PC4NUCK4N` | (미적용) |
| 360 원형 | 내장 | — | `PC6NUNK1NW` | `PC6NBNK1NW` | `PC6EUXK1NW` | `PC6EUCK1NW` | (기본 반환) |
| 360 사각 | 내장 | — | `PC6NUDK1NW` | `PC6NBDK1NW` | `PC6NUXK1NW` | `PC6NUCK1NW` | (기본 반환) |
| 360 원형 | 미내장 | — | `PC4NUNK1N` | `PC4NBNK1N` | `PC6EUXK1N` | `PC6EUCK1N` | (기본 반환) |
| 360 사각 | 미내장 | — | `PC4NUDK1N` | `PC4NBDK1N` | `PC6NUXK1N` | `PC6NUCK1N` | (기본 반환) |
| 그 외(덕트/실링/스탠드/벽걸이 …) | — | — | `null`(판넬 없음) | | | | |

> `동작감지` 는 `swap()` 안에서 `PC1Y*/PC1Z*` 패턴만 검사하므로 4WAY/360 계열에서는 **무효**(기본값 반환)다.
> 360 미내장 base 가 `PC4…` prefix 인 것은 정본 그대로다(오타 여부 확인 필요 — 🚩).

#### C-28 받침대 규칙 — HP 파싱 원문 (환원 대상)

```js
if(isECO){ if(['4','5','6'].some(test) || hasExactHP(nm,'3.5')) want.push('SI-AL600a');
           if(['8','10','12','14'].some(test) || hasExactHP(nm,'7.5')) want.push('SI-AL700a'); }
if(isGHP){ want.push('GHP방진가대'); want.push('ACL-KORGHP07'); }
if(isPrime   && ['8','10','12'].some(test))                     want.push('방진가대S2소');
if(isCold    && ['8','10','12'].some(test))                     want.push('방진가대S2소');
if(isStd     && ['8','10','12','14'].some(test))                want.push('방진가대S2소');
if(isCoolTop && ['8','10','12','14'].some(test))                want.push('방진가대S2소');
if(isExtra   && ['8','10','12'].some(test))                     want.push('방진가대S2소');
if(isPrime   && ['14','16','18','20'].some(test))               want.push('방진가대S2중');
if(isCold    && ['14','16','18','20','22','24'].some(test))     want.push('방진가대S2중');
if(isStd     && ['16','18','20','22','24','26','28'].some(test))want.push('방진가대S2중');
if(isCoolTop && ['16','18','20','22','24','26','28','30'].some(test)) want.push('방진가대S2중');
if(isExtra   && ['14','16','18','20'].some(test))               want.push('방진가대S2중');
if(isPrime   && ['22','24'].some(test))                         want.push('방진가대S2대');
if(isStd     && ['30','32','34'].some(test))                    want.push('방진가대S2대');
if(isCoolTop && ['32','34'].some(test))                         want.push('방진가대S2대');
```

계열 판별어: `프라임 / 한랭지 / 표준형 / 냉방전용 상부토출 / ECO / 가스히트펌프 / (프레스티지|동시냉난방|공장전원)`.
⟹ **환원 형태**: `(실외기 model_code, 받침대 model_code, 1)` 3열 표.
행 수는 `상업멀티` 실외기 활성 품목 수 × 매칭 받침대 수. **카탈로그 sweep 1회로 확정 가능하나, sweep 전에는 만들 수 없다.**
현 구현은 `modelByNameLike(baseName)` 로 **이름 부분일치 검색**까지 하고, 못 찾으면 **한글 키워드 문자열 자체를 모델코드로 사용**한다(`:5797,5812`) — 이대로면 `quantity_sync_target.target_product_id` 로 해소되지 않는다. 🚩

---

## 7. §4 단가·할인 설정 축 (D-01 ~ D-23)

`CONFIG` 기본값 원문 — `index.html:1453-1466`

```js
let CONFIG=J(CFG_RAW,{
  homeDiscount: 0.45, commDiscount: 0.45, showIHose: false,
  discount360: 0, discount4way: 0, discountStand: 0, singleSetDiscount: 0,
  oneWayDiscount: 0, deluxeDiscount: 0, firstGradeDiscount: 0,
  unitRoundTo: 0, unitRoundMode: 'ROUND'
});
```

| ID | ①위치 | ②조건→결과 | ③기본값 | ④출처 | ⑤스키마 | ⑥판정 |
|---|---|---|---|---|---|---|
| D-01 | `:1454`,`1518` | 홈멀티 정가 × (1−율) | `0.45` | 로그인 응답 `config.dc.homeDiscountRate` | dc-config-service(별도) | [자동] |
| D-02 | `:1455`,`1519` | 상업멀티 동 | `0.45` | `dc.commercialDiscountRate` | 동 | [자동] |
| D-03 | `:1456`,`1520` | I형 유연호스 노출/선택 | `false` | `dc.showIHose` | 동 | [자동] |
| D-04 | `:1457`,`1521` | 360 실내기 금액 차감 | `0` | `dc.discount360Amount` | 동 | [자동] |
| D-05 | `:1458`,`1522` | 4WAY 차감 | `0` | `dc.discount4wayAmount` ?? `discount4WayAmount` (두 표기 모두 수용) | 동 | [자동] |
| D-06 | `:1459`,`1523` | 스탠드 차감 | `0` | `dc.discountStandAmount` | 동 | [자동] |
| D-07 | `:1461`,`1524` | 1WAY 차감 | `0` | `dc.discount1wayAmount` ?? `discount1WayAmount` | 동 | [자동] |
| D-08 | `:1462`,`1525` | 디럭스 차감 | `0` | `dc.discountDeluxeAmount` | 동 | [자동] |
| D-09 | `:1463`,`1526` | 1등급 차감 | `0` | `dc.discountFirstGradeAmount` | 동 | [자동] |
| D-10 | `:1460` | **`singleSetDiscount` 은 선언만 되고 어디서도 읽히지 않음** (grep 결과 1건) | `0` | — | — | 🚩 사문 |
| D-11 | `:1464`,`1527` | 단가 절사 단위 | `0`(=절사 없음) | `dc.unitRoundTo` | 동 | [자동] |
| D-12 | `:1465`,`1528` | 절사 방식 | `'ROUND'` (`CEIL/FLOOR/ROUND`) | `dc.unitRoundMode` | 동 | [자동] |
| D-13 | `normalizeDcRate :1507-1511` | `n > 1` 이면 `n/100` (48 → 0.48) | `1` | — | — | [자동] |
| D-14 | `parseFixedDc :1556-1574` | 숫자/문자 모두 수용, `%` 또는 `>1` 이면 /100, **`0~0.99` 클램프** | `0.99` 상한 | 시트 `고정DC` 컬럼(`r['고정DC'] ?? r.fixedDC ?? r.fixedDc ?? r.FixedDC`) | `products.fixed_discount_rate` (**보유 167건**) · `classification.fixed_discount_rate`(**0건**) | 파생 |
| D-15 | `getTierBonusRate :8093-8099` + `:8127,8134` | 홈/상업 합계 1천만/3천만/5천만/1억 → +1/2/3/4%p, **단 `Math.min(…, 0.48)`**, 기준율이 정확히 0.45 일 때만 | `100000000/50000000/30000000/10000000` · `0.04/0.03/0.02/0.01` · 상한 `0.48` · 판정 tol `0.001` | 화면 합계 | 없음 | 🚩 (X-12) |
| D-16 | `isNoMainUnit :8054-8090` + `:8117-8120` | 전열교환기 제외 총수>0 이고 실내기·실외기·벽걸이 0 이면 45%→40% | `0.40` | 행 `name/catM/catL` | 없음 | 🚩 (X-13) |
| D-17 | `homeUnitPrice :2707-2710` / `partUnitPrice :2747` / `singleUnitPrice :2787` / `commUnitPrice :2833` / `calcSetUnitPrice :3300` | `SHOW_I_HOSE` 꺼짐 + 이름에 `유연호스 I형` → **단가 8000 고정** (5곳 중복) | `8000` | `name`/`nameRaw` | 없음 | 🚩 |
| D-18 | `buildSendRows :6637-6643` | 구형 `item.isDisc===true` → 정가 × 0.5 + 적요 `(50% DC)` | `0.5` | `oldProducts.isDisc` | 없음 | 🚩 |
| D-19 | `incActive :1447-1451` | `due < priceChangeSchedule[key]` 이면 인상 전 가격표 사용 | 5계열 `homemulti/commercialMulti/singleSets/singleParts/commParts` | `PRICE_CHANGE_SCHEDULE` + `*_INC` 맵 | 없음 | 🚩 |
| D-20 | `homeUnitPrice :2731-2737` / `commUnitPrice :2855-2863` | `useK2 && list>0` → `list×(1−(고정DC ?? 전역율))`; 상업은 추가로 `fixedDc!=null && list>0` 갈래; 그 외 시트가 우선 | — | `useK2`,`price`,`list` | `release_price`/`delivery_price` | 파생 |
| D-21 | `explodeSetParts :3402-3455` + `splitIndoorOutdoorToK :1796-1825` | 세트 단가 잔액을 실내:실외 = **가정용 6:4 / 그 외 4:6** 로 배분, 둘 다 천 단위 정합 | `6/4`, `1000` | `classifySingleSetFixed().catL`, `name` | 없음 | 🚩 |
| D-22 | `calcSetUnitPrice :3296-3323` | 세트 단가 = 기본가 + 판넬델타 + 리모컨델타 + 자재합, 그 뒤 세트 베이스 할인 재적용, 음수 0 클램프 | — | 구성품 `feat/kind/name/model` | `bundle_component` | 파생 |
| D-23 | `updateHomeRatio :3185` / `updateCommRatio :3213-3224` | 조합비 = 실내용량/실외용량×100. 홈 `>130` 경고 · 상업 `프라임\|한랭지\|표준형\|냉난방` 있으면 `103`, 아니면 `120` | `130/103/120` | `capacity`,`catL`,`name` | 없음 | 🚩 |

---

## 8. §5 모델 상수·도출 축 (E-01 ~ E-06)

| ID | ①위치 | ②내용 | ③상수 | ④읽는 속성 | ⑤스키마 | ⑥판정 |
|---|---|---|---|---|---|---|
| E-01 | `PANEL_MODELS :2901-2905` | 홈 판넬 26키 고정 코드표 (`p*`, `a*`, `inf*`) | 26개 모델코드 | — | `products.model_code` 참조로 환원 | 파생 |
| E-02 | `INF_BASE :5240-5245` (+ `:5388-5391` **동일 표 재선언**) | 인피니트 7키 | 7개 | — | 동 | 🚩 **같은 표가 두 곳에 중복 선언** |
| E-03 | `:2882-2899` | **17개** 상수를 **이름/모델 정규식 검색**으로 카탈로그에서 도출 (`MODEL_6HP_SINGLE` · `BRANCH_2512/1509` · `_HOSE_L_1W/L_4W/I_1W/I_4W/I_ANY` · `FOOT_ROUND/FLAT` · `REMOTE_WIRED/WIRED_COLOR/WIRED_KIT/WIRELESS/360_DEFAULT/INF_DEFAULT/COLOR_AIRCOMBO`) | 정규식 17개 | `name`,`model` | 코드 직접 지정으로 환원 필요 | 🚩 **이름 파싱** |
| E-04 | `SEND_AS_SET_IDS :2911` | 발통 원형/일자발/유선보드/실링펌프 4종은 전개하지 않고 세트 그대로 전송 | 4 id | — | 없음 | 🚩 |
| E-05 | `isExpansionModel :1420-1431` | 모델코드 자리값으로 확장모델을 판정해 `SINGLE_SETS` 에서 **배제** (`AC…CS`+프레스티지 / `AP…CA` / `AF70…24\|25` / `AF80\|AF90`) | 자리 인덱스 5·7·8·10 | `model`,`name` | `products.status`/`usage_scope` 로 대체 가능 | 🚩 |
| E-06 | `normalizeHomeCategory :2612-2626` / `classifySingleSetFixed :2627-2673` | 이름 키워드로 대/중분류 재작성(연도형·무풍·비스포크 등 40+ 분기) | 다수 | `name`,`model`,`spec` | `cat_l_id/cat_m_id/cat_s_id`,`classification_manual` | 파생 |

---

## 9. §6 앱 셸·환경 축 (F-01 ~ F-11)

| ID | ①위치 | ②내용 | ③기본값 | ⑤스키마/대응 | ⑥판정 |
|---|---|---|---|---|---|
| F-01 | `index.html:1356-1374` + `BootstrapService.CACHE_KEYS` | bootstrap **18키** (`homemulti … priceChangeSchedule`) | — | — | [자동] |
| F-02 | `index.html:1345-1351` + `main.ts:94` | `__SAMHAN_BOOTSTRAP_FATAL__` 이면 legacy snapshot 고정 전에 `throw` (빈 카탈로그 false-ready 차단) | — | — | [자동] |
| F-03 | `J() :1377` | 문자열이면 `JSON.parse`, 실패 시 default; `null` 이면 default | `[]`/`{}` | — | [자동] |
| F-04 | `main.ts:32-33` | `VITE_APP_VERSION` / `VITE_VERSION_API_BASE_URL` | `'0.1.0-dev'` / `'http://localhost:8080'` | — | [자동] |
| F-05 | `samhanApi.ts:16` | API base | `'/api/v1'` (`VITE_API_BASE_URL` override) | — | [자동] |
| F-06 | `samhanApi.ts:24-27,464` | axios timeout 기본 `5000`ms, bootstrap 만 `8000`ms | — | — | [자동] |
| F-07 | `samhanApi.ts:190,314-323,356-358,408` | 페이지 크기: 규칙 `50` · 품목 `50` · 주문이력 `20` · 임시저장 `20` | — | — | [자동] |
| F-08 | `legacyOrderSource.ts:48-49` | dev `http://localhost:4173` / prod `https://order.samhan-air.com`, `EXPO_PUBLIC_ORDER_APP_URL` override | — | — | [자동] |
| F-09 | `legacyEstimateSource.ts:29-30` | dev `http://localhost:5183/` / prod `https://estimate.samhan-air.com/`, `EXPO_PUBLIC_ESTIMATE_APP_URL` override | — | — | [자동] |
| F-10 | `legacyOrderShim.ts:144` / `legacyEstimateShim.ts` | `matchMedia('(max-width: 1280px)')` → `mobile-mode` 강제 | `1280` | — | [자동] |
| F-11 | `samhanApi.ts:19-21` | sessionStorage 키 `samhan-partner-token` / `samhan-partner-config`; `applyConfigFromServer` 는 **BE 재호출 없이 이 캐시만** 반환 | — | — | [자동] |

**모바일 4파일 종합**: `legacyOrderSource/Shim`(주문) 과 `legacyEstimateSource/Shim`(견적)은 **1:1 대칭 복사본**이다.
차이는 URL 기본값(F-08/F-09), header 이름(`X-Samhan-Partner` ↔ `X-Samhan-Staff`), 설정 필드(`partnerCode` ↔ `employeeCode`+`userEmail`), `?email=` query 지원(견적만) 뿐이며
**설정 기본값·수량 규칙은 네 파일 모두 0개**다. `ORDER_RPC_INVENTORY`(13개)는 실제 `RPC_MAP`(19개)과 불일치한다 — 교집합 10개, 인벤토리에만 있는 3개(`getCustomers`/`getManagers`/`getLogoImage`)는 `RPC_MAP` 에 없어 호출 시 `unmapped RPC` warn + `Promise.resolve(null)` 로 조용히 흘러가고, `RPC_MAP` 에만 있는 9개는 인벤토리에 없다. 🚩 문서 동기화 필요.

---

## 10. 계약 대조 — `legacyConfigMapping.test.ts` 가 고정한 것

`src/__tests__/legacyConfigMapping.test.ts` 는 `index.html` 에서 `function configNumber` ~ `// 고정DC 파싱` 구간을 VM 으로 잘라 실행하며, 다음을 **계약으로 고정**한다.

- nested `config.dc.*` → 평면 `CONFIG` + `window.*` 전역 **11쌍** 동시 매핑
  (`DISCOUNT_RATE_HOME/COMM · DISCOUNT_360_AMT · DISCOUNT_4WAY_AMT · ONEWAY_DISCOUNT_AMT · DISCOUNT_STAND_AMT · DELUXE_DISCOUNT_AMT · FIRSTGRADE_DISCOUNT_AMT · SHOW_I_HOSE · UNIT_ROUND_TO · UNIT_ROUND_MODE`)
- 퍼센트 정수 보정: `48 → 0.48`, `49 → 0.49` (D-13)
- 테스트가 넣는 초기 `CONFIG` 에는 **`singleSetDiscount` 가 없다** — D-10 이 사문임을 방증

---

## 11. 🚩 결정 필요 목록 (21건)

우선순위 순. 각 건은 **정본을 정하지 않으면 스키마 이식이 불가능하거나 두 앱이 계속 갈린다**.

1. **condition_json 소비** (A-07) — 클라이언트 계약을 서버에 맞출지, 규칙을 옵션값별로 분해할지
2. **홈 분기관 발화 조건** (X-2) — 실내기 ≥2 조건 유무
3. **홈 분기관 실내기 집계 범위** (X-3) — 에어콤보·전열교환기 포함 여부
4. **360 CST 리모컨 target** (X-1) — `AR-KH05` vs `AR-EC05`
5. **상업 공청 4WAY/미내장 판넬 target** (X-5) — `PC4NUC**K4**` vs `PC4NUC**K1**`
6. **상업 유연호스 나머지 처리** (X-7)
7. **I형 유연호스 스위치 출처** (X-9) — 거래처 DC vs 화면 칩
8. **싱글 받침대 대상 필터** (X-10)
9. **단위 반올림 설정 출처** (X-11) — 거래처 DC vs 화면 select
10. **티어 보너스 상한 0.48** (X-12)
11. **할인율 페널티 발화 조건** (X-13)
12. **옵션 기본값 저장 위치** (B-01~B-16) — 시트 매핑 부재 + seed `{}`
13. **수동 잠금(manual lock)의 스키마 대응** (B-18, X-17) — `inactive_behavior=KEEP` 로 볼지 별도 축인지
14. **뺄셈식 규칙 표현** (C-15) — `1509 = 실내기 − 단배관 − 6HP` 는 factor/multiplier 로 불가
15. **구간표 규칙 표현** (C-32, C-33) — 누적합/HP 구간
16. **`chooseBaseModel` HP 파싱 환원** (C-28) — sweep 선행
17. **한글 키워드가 model_code 로 새는 문제** (C-28, `방진가대S2소` 등)
18. **`targets` 개수** (A-09) — 클라이언트 1개 제한 유지 여부
19. **`conflict_policy`/`priority` 소비** (A-13, A-14)
20. **구형(OLD) 카테고리 대응** (A-19) — `estimate_category` 에 대응 값 없음
21. **`classification.fixed_discount_rate` 0건** (D-14) — 시트 `고정DC` 는 품목 단위로만 들어와 있음(167건)

---

## 12. 요약 판정

- **주문서 계열 설정 축 113개 전수 분류 완료** — [자동] 41 · 파생 13 · 🚩결정 필요 59(→ 구별되는 결정 21건)
- **분모 누락 1건**: `clients/web/order-app/index.html`(10,156줄)이 인벤토리에 없다. 인벤토리에 있던 주문 계열 6파일에는 설정 기본값이 **0개**다.
- **필수 ①**: `quantitySync.ts:126-129` 는 `condition_json` 이 비어 있지 않은 모든 규칙을 거부한다. 서버는 5개 연산자를 정식 지원하므로 **주문 파생 규칙 34개 중 31개가 이 벽에 막힌다.**
- **필수 ②**: "서버 규칙을 수량에 반영하지 않는다" 는 **사실**. 조회 → `console.info` → 폐기. `evaluateSingleS03Rule` 은 프로덕션 경로에서 호출되지 않는다.
- **필수 ③**: 견적↔주문 독립 구현 **18건** 확인, 그중 **8건은 금액 또는 출고 품목이 달라진다**(golden 실측 대조 포함).
- **개발책임자 확정 규칙 준수 상태**: 이름·HP 파싱으로 수량 또는 대상을 도출하는 축이 **23개**
  (C-01·C-03·C-06·C-07·C-08·C-11·C-12·C-13·C-15·C-17·C-19·C-20·C-21·C-22·C-23·C-24·C-26·C-28·C-29·C-34 · E-03 · E-05 · E-06).
  그중 코드 기반으로 이미 환원 가능한 것은 **PUMP_MAP(22쌍)·RENEW_FILTER_MAP(4쌍)·PANEL_MODELS(26)·INF_BASE(7)·상업 판넬 매트릭스** 뿐이고,
  나머지(특히 **S-03 자신**, 받침대 `chooseBaseModel`, 상수 도출 17종)는 **카탈로그 sweep 후 `(본체 model_code, 부자재 model_code, 수량)` 표로 재작성해야 한다.**

---

*조사 범위: 코드 읽기 전용. 코드/스키마 변경 0 · git 조작 0 · 컨테이너 조작 0 · DB write 0.*
