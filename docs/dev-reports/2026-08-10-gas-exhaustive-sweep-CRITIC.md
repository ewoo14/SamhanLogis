# GAS 전수조사 — 완결성 비판 (CRITIC)

> 역할: 완결성 비판자. 임무 = **이 조사가 무엇을 빠뜨렸는지** 찾는 것. 칭찬 없음, 구멍만.
> 대상: `docs/dev-reports/2026-08-10-gas-function-inventory.md`(분모) · `2026-08-10-gas-exhaustive-sweep-SYNTHESIS.md`(종합) · 파티션 보고서 12건.
> 코드·스키마·마이그레이션·git 변경 **0건**(읽기 전용). 모든 수치에 재현 명령과 출력 원문을 붙였다.
> 개발책임자: *"전수조사를 많이 했지만 **이번에는 확실해야해**."* — 아래 결론은 **아직 확실하지 않다** 이다.

---

## 0. 한 줄 결론

> **분모 889 는 "GAS 함수 인벤토리"가 아니다.** ①항목의 **19.7%(175건)가 함수가 아니고** ②최상위 함수 정의 **9건이 분모 밖**이며 ③**원본 GAS(`tools/legacy-gas/` 59파일·72,826줄·명명함수 1,820)가 통째로 0건 포함**이다.
> 지시문은 *"GAS의 모든 로직"* 인데 분모에는 **원본 GAS 파일이 한 개도 없다** — 전부 포팅본(Node/EJS/TS)이다.
> 종합 보고서의 **내부 산술은 대체로 정합**하다(§8 에 검산 전문). 틀린 것은 계산이 아니라 **모집단**이다.

| 구멍 | 건수 | 심각도 |
|---|---:|---|
| C-1 분모에 함수가 아닌 항목 | **175 / 889 (19.7%)** | 🔴 분모 자체 무효화 |
| C-2 분모 추출 명령 미기록 → 재현 불가 | — | 🔴 다음 라운드가 같은 잣대를 못 씀 |
| C-3 `window.X = function` 최상위 정의가 분모 밖 | **9** (그중 **4건이 분모 안 동명 함수를 덮어씀**) | 🔴 분류 결과가 실행되지 않는 사본을 가리킴 |
| C-4 `main.ts` 분모 0 인데 D-2 의 근거가 그 파일 | **6** (메서드 축약 4 + 화살표 프로퍼티 2) | 🟠 |
| C-5 **원본 GAS `tools/legacy-gas/` 전량 미포함** | **59파일 · 72,826줄 · 1,820함수** | 🔴🔴 지시문 직접 미충족 |
| C-5b 레거시 정본에만 있고 포팅본에 이름이 없는 함수 | **30** | 🔴 규칙 유실 여부 미확인 |
| C-6 `order-app/index.html` 결손표에 행조차 없음 | 실측 **명명함수 315 · 최상위 306** | 🔴 "결손 20" 이 결손을 대표 못 함 |
| C-7 데드 판정 오분류 — `bindCommQtyEvents` 는 B군 아니라 A군 | **1**(+ D-14 전제 붕괴) | 🔴 회귀 울타리가 죽은 사본을 지킴 |
| C-8 [불가] 규칙인데 결정 목록에 없음 | **최소 27 / 60** | 🔴 |
| C-9 종합 보고서 내부 산술 모순 | **2** | 🟠 증거 무결성 |
| C-10 적대 반증 산출물 파일 부재 → `checked_count` 대조 불가 | — | 🟠 실행=게시 1:1 미충족 |

---

## C-1. 🔴 분모 889 의 **19.7%(175건)는 함수가 아니다**

### 무엇이 빠졌는가(정확히는: 무엇이 잘못 들어갔는가)

인벤토리는 스스로를 *"함수 인벤토리(분모 고정)"* 이라 선언하고 각 파일 절 제목에 `함수 N개` 라고 적었다. 그러나 항목 중 **함수 정의도 화살표 함수도 아닌 순수 대입문·삼항식**이 175건이다. 분모가 부풀어 있으면 `869/889` 같은 커버리지 비율과 `업무규칙 318` 같은 집계가 **다른 것을 세고 있다.**

### 어떻게 확인했는가

```
node -e "인벤토리 각 항목 텍스트에서 /\bfunction\b/ 도 /=>/ 도 없는 줄을 센다"
```

출력(전문):

```
 130 /  642   clients/web/estimate-app/views/index.ejs
  33 /  171   clients/web/estimate-app/lib/code.js
   0 /   16   clients/web/estimate-app/lib/db-catalog.js
   1 /    4   clients/web/estimate-app/lib/slip-bridge.js
   0 /    8   clients/web/order-app/src/quantitySync.ts
   5 /   16   clients/web/order-app/src/samhanApi.ts
   0 /    4   clients/web/order-app/src/legacyShim.ts
   0 /    0   clients/web/order-app/src/main.ts
   2 /    6   clients/mobile/src/webview/legacyOrderSource.ts
   1 /    8   clients/mobile/src/webview/legacyOrderShim.ts
   2 /    6   clients/mobile-staff/src/webview/legacyEstimateSource.ts
   1 /    8   clients/mobile-staff/src/webview/legacyEstimateShim.ts
합계: 함수도 화살표도 아닌 항목 175 / 분모 889 = 19.7%
```

표본(인벤토리 원문 그대로):

```
2600: const useIHose = (dc.showIHose === true);
3384: const mod = ((outdoor % 1000) + 1000) % 1000;
4003: const head = (kind ? '[' + kind + '] ' : '') + (model || name) + …
4961: const ratio = (inCap / outCap) * 100;
5016: const missingBranch = (inCount - outCount) - branchCount;
6087: const pKey = (p.model || p.name || '').trim();
code.js 784: const name = (row[idxName] || '').toString().trim();
```

### 몇 건인가

**175 / 889.** 파티션들도 이를 알고 있었고 각자 다르게 대응했다 — 이것이 더 나쁘다.

- `order` 파티션 §0: *"인벤토리 기계 추출의 오탐(false positive) 확인 … 실제 독립 함수/화살표함수 개수는 22개(28 − 6)"*
- `code-1` §0: *"95개 중 47개는 최상위 `function`/독립 함수, 48개는 중첩 `const 헬퍼`"*
- `ejs-2` §1: *"부모 함수와 같은 규칙을 구성하는 하위 줄은 부모와 동일하게 분류했고(별개 규칙으로 부풀리지 않음)"*

⟹ **`업무규칙 318` 은 "규칙 318개"가 아니라 "부모 규칙의 분류를 상속한 줄 318개"** 다. 종합 §2 가 이를 *"318 줄 = 138 규칙 단위"* 로 환산한 것은 옳으나, §1.4 의 정정표는 여전히 `업무규칙 318` 을 축으로 쓰고 있어 **두 숫자가 같은 문서 안에서 다른 의미로 쓰인다.**

### 다음 라운드가 할 일

1. 분모를 **두 축으로 분리**해 다시 고정: `(A) 함수 정의 N개` / `(B) 그 안의 상수·판정줄 M개`. 커버리지 단정은 (A) 로만 한다.
2. `869/889` 는 폐기하고 `함수 (A) 기준 배정/분류` 로 재집계한다.

---

## C-2. 🔴 분모를 만든 **추출 명령이 문서에 없다** — 재현 불가

### 무엇이 빠졌는가

인벤토리 머리말은 *"생성 = PM 직접 (기계 추출)"* 이라고만 적고 **정규식도 명령도 남기지 않았다.** 이 때문에 "같은 잣대를 `order-app/index.html` 에도 적용하라"(종합 §5 0-3)를 **아무도 실행할 수 없다.** 무슨 잣대인지 모른다.

### 어떻게 확인했는가

추출식을 역설계해 대조했다. 항목 텍스트로부터 후보식 `function | => | (const|let|var) X = (` 를 만들어 각 파일에 적용:

```
clients/web/estimate-app/views/index.ejs 재현식 매치= 1748 인벤토리= 642 재현식에만= 1106 인벤토리에만= 0
clients/web/estimate-app/lib/code.js     재현식 매치=  234 인벤토리= 171 재현식에만=   63 인벤토리에만= 0
clients/web/order-app/src/samhanApi.ts   재현식 매치=   59 인벤토리=  16 재현식에만=   43 인벤토리에만= 0
```

**인벤토리는 내 재현식의 진부분집합**이다(`인벤토리에만 = 0`). 즉 PM 은 추가 필터를 걸었고 **그 필터가 무엇인지 문서에 없다.** 1,748 중 642 를 고른 기준이 재현되지 않는다.

### 다음 라운드가 할 일

분모 문서 맨 앞에 **실행 가능한 명령 원문**을 박는다. 그 명령을 `order-app/index.html`·`tools/legacy-gas/**` 에 그대로 돌려 같은 잣대의 분모를 만든다. 명령 없는 분모는 "이번에는 확실해야해" 를 충족할 수 없다.

---

## C-3. 🔴 `window.X = function` **최상위 정의 9건이 분모 밖** — 그중 4건은 분모 안 함수를 덮어쓴다

### 무엇이 빠졌는가

추출식이 `function NAME(` / `const X = (` 형태만 잡아, **`window.NAME = function(){}` 형태의 최상위 정의를 통째로 놓쳤다.** 이 형태는 나중에 실행되므로 **동명 함수를 덮어쓴다** — 즉 파티션이 분류한 정의가 실제로는 실행되지 않을 수 있다.

### 어떻게 확인했는가

```
node — index.ejs 전 줄에서 /^\s*[\w$.]+\s*=\s*(function|\(..\)=>)/ 매치 중 인벤토리 줄번호에 없는 것
```

출력(발췌, `<<<` 는 분모 안 동명 정의):

```
 1318: window.toggleTheme = function() {        <<< 분모에 동명 정의 있음 (line 19418)
13750: window.openPreview = function() {        <<< 분모에 동명 정의 있음 (line 8998)
13756: window.buildSendRows = function() {      <<< 분모에 동명 정의 있음 (line 9378)
18102: window.forceOrderTitle = function() {    <<< 분모에 동명 정의 있음 (line 10017)
16504: window.openInventoryCheck = function() {
17963: window.restoreSnapshot = function(index) {
18544: window.addCustomRow = function(type) {
18657: window.removeCustomRow = function(type) {
18666: window.updateCustomSubtotal = function(inp, type) {
충돌(재정의) 건수 = 4
```

### 왜 중요한가 — 두 개의 구체적 결과

**(1) 종합 §2 ⑨ 의 대표 규칙 `buildSendRows`(:9378) 는 실제 전송 경로가 아니다.**

`index.ejs:13750-13760` 실측:

```js
/* 래핑 적용 */
window.openPreview = function() {
  runWithAdjustedRates(() => { originOpenPreview.apply(this, arguments); });
};
window.buildSendRows = function() {
  return runWithAdjustedRates(() => { return originBuildSendRows.apply(this, arguments); });
};
```

⟹ **실제 발송 행은 항상 `runWithAdjustedRates`(45%→40% 하향 + 티어 보너스 +1~4%p + 적요 %문자열 치환)를 거친 뒤** 만들어진다. §2 ⑨ 는 `buildSendRows`(:9378, 경동 특례) 만 규칙으로 적고 이 래핑을 **금액 축(③ 할인·할증)과 연결하지 않았다.** ejs-5 §3.5 가 IIFE(13626~13762)를 다루긴 했으나, **종합의 규칙표에서 ⑨와 ③이 같은 함수라는 사실이 소실**됐다.

**(2) `forceOrderTitle` 은 잘못된 사본이 분류됐다.**
ejs-4 분류표 4번: `| 4 | 10017 | forceOrderTitle | ui_only |`. 그러나 실행되는 것은 **18102 의 `window.forceOrderTitle`** 이다(같은 전역 바인딩을 나중에 덮어씀). 18102 는 분모에 없어 ejs-6 도 보지 않았다 — `grep forceOrderTitle ejs-6.md` → **0건**.

**(3) `window.updateCustomSubtotal`(18666) 은 계산 규칙인데 어느 분류표에도 없다.**

```
18666: window.updateCustomSubtotal = function(inp, type) {
18669:   const qty   = parseInt(tr.querySelector('.custom-qty').value || '0', 10);
18670:   const price = parseInt(tr.querySelector('.custom-price').value.replace(/[^0-9-]/g,'') || '0', 10);
18672:   if (sub) sub.textContent = (qty * price).toLocaleString('ko-KR');
```

들여쓰기 0 = 최상위. `setupCustomRows`(18518) 안에 중첩된 것이 아니다.

### 몇 건인가

**최상위 `window.*` 정의 9건 · 그중 재정의 충돌 4건 · 이로 인해 잘못된 사본이 분류된 것 최소 1건(`forceOrderTitle`) · 규칙인데 미분류 1건(`updateCustomSubtotal`).**
참고로 `ejs-3` 은 **분모 안에서 일어난** 같은 유형(`updateTopControls` 7677 ↔ 14752 호이스팅 승부)을 정확히 잡았다. 분모 밖 형태만 아무도 못 봤다.

### 다음 라운드가 할 일

1. 추출식에 `^\s*(window\.|globalThis\.)?[\w$.]+\s*=\s*(async\s*)?(function|\(.*\)\s*=>)` 를 추가하고 **동명 심볼이 2회 이상 정의되면 별도 표로 뽑아 "어느 것이 실행되는가" 를 명시**한다(`order-app/index.html` 도 동일 — 거기서도 21건 검출).
2. 종합 §2 ⑨ 의 `buildSendRows` 항목에 **"실 경로 = 13756 래퍼 ∘ 9378 원본"** 을 명기하고, ③ 티어 보너스와 같은 규칙 단위로 묶는다.

---

## C-4. 🟠 `main.ts` — 분모 0 으로 **공식 제외**됐는데 D-2 의 유일한 근거가 그 파일이다

### 무엇이 빠졌는가

인벤토리: `## clients/web/order-app/src/main.ts — 128줄 · 함수 0개` (본문 빈 코드블록).
`order` 파티션 §0: *"인벤토리 분모가 0이므로 **분류 대상 없음**"*.
그런데 종합 **D-2** 는 *"`main.ts:61-83` 이 `selectSingleS03Rule` 만 호출해 상태 보관"* 을 근거로 삼는다. **분류에서 제외된 파일이 1군 결정의 근거**다.

### 어떻게 확인했는가

```
node — main.ts 에서 메서드 축약/객체 화살표 프로퍼티 스캔
  shorthand: 4
     62:async getQuantitySyncRules(catalog) {
     80:getState() {
    116:onOfflineReady() {
    119:onNeedRefresh() {
  objArrow: 2
     44:getQuantitySyncRules: (catalog: SingleCatalogRow[]) => Promise<SingleQuantitySyncState>
     45:getState: () => SingleQuantitySyncState
```

실물(`sed -n '55,90p'`):

```ts
window.__SAMHAN_QUANTITY_SYNC__ = {
  async getQuantitySyncRules(catalog) {
    …
    const selection = selectSingleS03Rule(rules, catalog)
    …
  },
  getState() { return singleQuantitySyncState },
}
```

### 몇 건인가

**6건**(메서드 축약 4 + 인터페이스 화살표 2). 규모는 작지만 **shadow 배선의 전부**다.

### 다음 라운드가 할 일

추출식에 **객체 메서드 축약(`name(args) {`)** 을 추가하고 `main.ts` 절을 `함수 0개` → 실제 값으로 정정. D-2 의 근거 인용에 "분모에서 제외된 파일" 이라는 단서를 붙이거나, 분모를 고쳐 단서를 없앤다.

---

## C-5. 🔴🔴 **원본 GAS(`tools/legacy-gas/`)가 분모에 0건** — 지시문 직접 미충족

### 무엇이 빠졌는가

개발책임자 지시는 ***"GAS의 모든 로직을 전수조사"*** 다. 분모 12파일은 **전부 포팅본**(`.ejs`/`.js`/`.ts`)이고, 실제 Apps Script 정본은 `tools/legacy-gas/` 에 git tracked 로 살아 있는데 **한 파일도 분모에 없다.**

종합 §1.2 는 이를 *"`tools/legacy-gas/**` 원본 GAS 4종"* 으로 한 줄 적었으나 **규모 칸이 비어 있다**(파일명 나열뿐). 실제로는 4종이 아니라 **59파일**이다.

### 어떻게 확인했는가

```
git -c core.quotePath=false ls-files → tools/legacy-gas/ 하위 .js/.gs/.html 전건에 /function NAME(/ 카운트
```

출력:

```
tools/legacy-gas 원본 GAS 파일 수 = 59 · 명명 함수 총합 = 1820 · 총 줄수 = 72826
  377   19183줄  tools/legacy-gas/종합견적서/index.html
  269    9826줄  tools/legacy-gas/거래처 발송 주문서/index.html
   96    3521줄  tools/legacy-gas/거래처 발송 주문서/Code.js
   87    3204줄  tools/legacy-gas/종합견적서/Code.js
   70    2877줄  tools/legacy-gas/제이시스템 전용 주문서 인식/Code.js
   64    2341줄  tools/legacy-gas/에어디자이너 전용 주문서 인식/Code.js
   51    1948줄  tools/legacy-gas/일마감 프로그램/Index.html
   44    1608줄  tools/legacy-gas/거래처별 원장생성 프로그램/Index.html
   41    1764줄  tools/legacy-gas/거래처별 일괄 거래명세서 생성/Index.html
   …(59개)
```

**견적·주문 축만 좁혀도 4파일 · 35,734줄 · 829 명명함수** 가 분모 밖이다.

### 몇 건인가

**59파일 · 72,826줄 · 1,820 명명함수 (분모 기여 0).**

### 다음 라운드가 할 일

1. **개발책임자께 범위를 확인**: *"GAS의 모든 로직"* 이 ⓐ견적·주문 2종의 원본만인가 ⓑ`tools/legacy-gas/` 59개 전부인가 ⓒ포팅본만으로 충분한가. **이것은 업무 범위 판단이라 PM 이 추론하면 안 된다.**
2. ⓐ/ⓑ 어느 쪽이든 **원본 GAS 를 분모에 넣고** 포팅본과 함수명 대조표를 만든다(아래 C-5b 가 그 첫 결과다).

---

## C-5b. 🔴 레거시 정본에만 있고 **포팅본 어디에도 이름이 없는 함수 30건** — 유실인지 병합인지 아무도 확인하지 않았다

### 어떻게 확인했는가

```
레거시 = tools/legacy-gas/{종합견적서,거래처 발송 주문서}/{index.html,Code.js}
포팅본 = estimate-app{views/index.ejs, lib/code.js, lib/db-catalog.js, lib/slip-bridge.js} + order-app{index.html, src/*.ts}
```

출력:

```
레거시 GAS 정본(견적+주문) 고유 명명함수 = 520
포팅본 전체(견적앱+주문앱) 고유 명명함수 = 626
레거시에만 존재 = 30
loadInitialData, initDataLayer, runHeavyInit, getInitialData, rebuildDerivedFromData,
applyAddrFromPostcode_, openNaverAddrDock_, requestInitialData, onInitialDataLoaded,
saveOrderSnapshot, getOrderSnapshotHistory,
getHomeIncreasePrices_, getCommIncreasePrices_, extractSingleIncreasePrices_,
getSingleIncreasePrices_, getSinglePartsIncreasePrices_, extractIncreasePrices_,
checkAuthStatus, requestAuthApproval, setAuthPassword, hashPassword_, tryLogin,
queryAuthDb_, getAccessExpiration, saveTutorialState, createAuthRow_, updateAuthPage_,
_triggerAuth, forceAuthCheck, getOrderHistory
```

### 이 중 규칙을 이고 있는 것

| 함수 | 실물 | 왜 문제인가 |
|---|---|---|
| `extractIncreasePrices_` 외 **가격인상 ETL 6종** | `거래처 발송 주문서/Code.js:281,294,345,358…` — `홈멀티_단가인상`/`상업멀티_단가인상`/`싱글 세트_단가인상`/`싱글 구성품_단가인상` **4개 탭 각각의 전용 추출기** + 헤더 탐색(`모델명` × `출고가\|LIST\|리스트\|정가\|소비자가`) | 포팅본은 `getPriceIncData_` 하나로 접었다. **D-20(PRICE_INC ↔ price_change_schedule) 은 이 4탭 구조를 모른 채 쓰였다** |
| `rebuildDerivedFromData` | `거래처 발송 주문서/index.html:2657` — `MODEL_6HP_SINGLE`/`BRANCH_2512`/`BRANCH_1509`/`_HOSE_L_1W` … **파생 target 상수 전량을 카탈로그에서 정규식으로 재도출** | **수량 축(§4)의 원본 규칙**이다. 포팅본은 이름 없이 top-level 상수 블록으로 흩어져 있고(§`DERIVATION_PREAMBLE`), 원본과 대조된 적이 없다 |
| `saveOrderSnapshot`/`getOrderSnapshotHistory`/`getOrderHistory` | 주문 스냅샷·이력 | 포팅본에 동명 없음 — 대체됐는지 드롭됐는지 미확인 |

나머지(auth 8종·부트스트랩 4종·주소 2종)는 우리 아키텍처로 대체된 것으로 보이나 **그것도 확인된 바 없다.**

### 몇 건인가

**30건 전건 미확인.** 종합 §1.3-B 는 *"포팅 과정에서 소비자가 사라진 규칙"* 을 12건 정도 언급했으나, **그 목록은 "포팅본 안에서 죽은 것"이지 "포팅본에 아예 없는 것"이 아니다.** 두 집합은 다르다.

### 다음 라운드가 할 일

30건을 3버킷으로 확정: **①대체됨(대체처를 `파일:줄` 로) ②병합됨(병합처 + 규칙 동등성 근거) ③드롭됨(→ 이식 대상 후보)**. 특히 가격인상 6종과 `rebuildDerivedFromData` 는 **D-20·§4 수량 축의 입력**이므로 결정 전에 끝내야 한다.

---

## C-6. 🔴 `order-app/index.html` — 결손표에 **행 자체가 없다**

### 무엇이 빠졌는가

종합 §1.1 표는 12행(=분모 12파일)뿐이고 **`order-app/index.html` 행이 없다.** 그래서 표 하단의 `결손 20` 이 실제 결손을 대표하지 못한다. §1.2 가 이를 별도로 자백한 것은 정직하지만, **§1.5 완결성 단정문과 §1.4 집계는 여전히 889 를 축으로 쓴다.**

또 §1.2 는 규모를 *"10,156줄 · 함수 350+"* 로 적었다 — 이 숫자의 출처가 없다.

### 어떻게 확인했는가

```
clients/web/order-app/index.html  줄 10157 | function NAME( 315 | 최상위 function 선언 306 | function( 익명 23 | => 전체 563
clients/web/estimate-app/views/index.ejs 줄 19754 | function NAME( 405 | 최상위 379 | 익명 92 | => 914
```

그리고 분모와 **같은 잣대**를 적용할 수 없다(C-2). 내 상위집합 재현식으로는 order-app 1,012 : index.ejs 1,748 이다.

### 몇 건인가

**명명함수 315 · 최상위 선언 306 · `window.*` 대입 21 · 익명 `function(` 23 · 화살표 563.** 어느 것도 분모에 없다.

### 다음 라운드가 할 일

C-2 의 명령을 확정한 뒤 그 명령으로 `order-app/index.html` 분모를 생성하고, §1.1 표에 **13번째 행**으로 넣는다. 그 전까지 *"견적서와 주문서 모두"* 는 충족되지 않았다고 보고해야 한다.

---

## C-7. 🔴 데드 판정 — `bindCommQtyEvents` 는 B군이 아니라 **A군**이고, 더 나쁘게 **CI 울타리가 죽은 사본을 지키고 있다**

### 무엇이 빠졌는가

종합 §1.3-B 는 `bindCommQtyEvents`(index.ejs:4732)를 *"판정은 맞으나 타 파일에서는 라이브"* 인 B군에 넣었고, **D-14** 는 이를 *"죽은 사본 vs 라이브 사본, 어느 쪽이 정본인가"* 라는 결정으로 올렸다.

실제로는 **견적 정본(index.ejs)의 그 사본을 CI 계약 테스트가 직접 읽어 단정**한다. 즉 지우면 CI 가 깨진다 — B군이 아니라 A군(`clearAllPanels` 와 같은 유형)이다.

### 어떻게 확인했는가

호출 경로:

```
clients/web/order-app/src/__tests__/commercialManualSymmetry.test.ts:13
  test.each(['order', 'estimate'])(… (app) => { const result = sourceGuardReport(app); … })
clients/web/order-app/src/__tests__/commercialManualSymmetryHarness.cjs:158-166
  const source  = sourceFor(app);                       // app='estimate' → SOURCE_PATH.estimate
  const binding = extractFunctionSource(source, 'bindCommQtyEvents');
  const outdoorClear = /isCommOutdoorRow…COMM_MANUAL_BASE\.clear\(\)/.test(binding);
clients/web/legacy-quantity-golden/legacyQuantityBoundary.js:8
  estimate: path.resolve(__dirname, '../estimate-app/views/index.ejs')
```

실제 실행 출력(내가 돌린 것):

```
$ node -e "const h=require('./src/__tests__/commercialManualSymmetryHarness.cjs'); …"
estimate: {"accessoryChecksManualBase":true,"outdoorClear":false}
order   : {"accessoryChecksManualBase":true,"outdoorClear":false}
추출 시작 오프셋의 줄번호 = 4732
추출 본문 줄수 = 125
index.ejs 안의 function bindCommQtyEvents 정의 개수 = 1
```

⟹ `extractFunctionSource` 는 `function bindCommQtyEvents` 를 **첫 매치(4732, 죽은 사본)** 에서 125줄 뽑아 정규식으로 단정한다. 한편 **런타임이 실제로 쓰는 것은 `index.ejs:7033-7056` 의 인라인 `else if` 체인**이다(`sed -n '7028,7060p'` 확인 — `if (isCommPanelRow(rec)) … else if (isCommHoseRow(rec)) …` + `/방진가대|받침대|발통세트|일자발|SI-AL/i` 판정).

### 왜 이것이 D-14 를 무너뜨리는가

- D-14 의 ③후보는 *"(a) `else if` 체인(라이브)을 정본 / (b) 독립 `if`(죽은 사본)를 정본 / (c) 확인 후 결정"* 이다.
- 실상은 **(b) 를 CI 가 이미 "정본" 처럼 감시하고 있다.** 그런데 그 코드는 실행되지 않는다 — **가짜 방어선**이다. 개발책임자 메모리 [[feedback_test_adapted_to_new_behavior_hides_regression]]·[[feedback_mock_gate_leaks_to_real_api]] 계열의 전형이다.
- 즉 D-14 는 *"어느 쪽이 정본인가"* 이전에 **"울타리가 실행되지 않는 코드를 지키고 있다"** 는 결함 보고가 먼저다.

### 부수 정정 — 데드 56 의 성격

내가 5,990개 tracked 파일 전수로 데드 59개 이름의 외부 참조를 다시 셌다(`git ls-files` → docs 제외 → 정의 파일 제외 → `(?<![\w$])NAME(?![\w$])`). 그 결과:

- 하네스가 **견적 정본에서 문자열로 지목**하는 것: `clearAllPanels` · `clearAllRemotes` · `onHomeQtyInput`(`legacyQuantityBoundary.js`) · `singleUnitPrice`(`qa-gas-parity-sim.mjs`) — 적대 반증이 잡은 4건 ✅ + **`bindCommQtyEvents`(신규 5번째)**
- 하네스가 **주문 정본**(`SOURCE_PATH.order`)에서 지목하는 것: `bindQty`·`onSingleQtyInput` → B군 판정 유지 ✅
- **`mobile` 파티션의 dead 12건은 GAS 가 아니라 우리가 새로 쓴 RN 코드**다(mobile 보고서 §0 스스로 명시). ⟹ `데드 56` 중 12 는 GAS 축이 아니다 → **GAS 축 데드는 44.**

### 다음 라운드가 할 일

1. **D-14 를 "결정" 에서 "결함" 으로 승격**하고, ①실행 경로(7033) 를 정본으로 명시 ②울타리를 실행 경로에 재조준(또는 죽은 사본 제거 + 울타리 이동)를 fix 로 낸다. **RED-B = `bindCommQtyEvents`(4732) 를 지웠을 때 `commercialManualSymmetry.test.ts` 가 어떤 이유로 깨지는지**를 먼저 적는다.
2. 데드 판정 재검증의 grep 범위를 **`clients/` + `tools/legacy-gas/` 전체 + 문자열 리터럴 지목 하네스**로 통일(종합 §5 0-4 와 동일. 단 하네스는 `SOURCE_PATH` 가 어느 앱인지까지 확인해야 A군/B군이 갈린다 — 내가 두 하네스에서 서로 다른 결론을 얻은 이유가 그것이다).

---

## C-8. 🔴 [불가] 60건 중 **최소 27건이 결정 목록(D-1~31)에 없다**

### 무엇이 빠졌는가

종합 §2 규칙표는 `불가 60` 을 세었고 §3 은 결정 31건을 냈다. 그런데 **`불가 60 ↔ D-1~31` 매핑표가 없다.** 그래서 "불가인데 결정 목록에 안 올라온 것" 이 몇 건인지 문서만으로는 알 수 없다. 표본으로 확인한 결과 **카테고리 두 개가 통째로 빠져 있다.**

### 어떻게 확인했는가

§3 구간(153~393행)에서 §2 가 [불가] 대표 예시로 든 함수명을 검색:

```
§3 결정목록 구간 = 153 ~ 393
getFooterNoticeHtml     전체등장 1 | §3 내 0   ← 결정목록에 없음
getInvoiceInnerContent  전체등장 1 | §3 내 0   ← 결정목록에 없음
numberToKorean          전체등장 1 | §3 내 0   ← 결정목록에 없음
getSlipInnerContent     전체등장 1 | §3 내 0   ← 결정목록에 없음
updateOrderTags         전체등장 1 | §3 내 0   ← 결정목록에 없음
toggleSlipButton        전체등장 1 | §3 내 0   ← 결정목록에 없음
applySnapshot           전체등장 2 | §3 내 0   ← 결정목록에 없음
updateHomeRatio         전체등장 1 | §3 내 0   ← 결정목록에 없음
updateCommRatio         전체등장 1 | §3 내 0   ← 결정목록에 없음
calcRecommendOdu        전체등장 1 | §3 내 0   ← 결정목록에 없음
isValidTel              전체등장 1 | §3 내 0   ← 결정목록에 없음
aggregateSendRows       전체등장 1 | §3 내 0   ← 결정목록에 없음
explodeSendSets_        전체등장 1 | §3 내 0   ← 결정목록에 없음
sumOld                  전체등장 1 | §3 내 1 [340]   ← D-24 로 등재됨(정상)
```

보조 확인 — 임계값 자체가 §3 에 없다:

```
grep -n "130%\|103%\|120%\|추천 실외기" SYNTHESIS.md
125: (§2 규칙표 행)
309: (D-19 본문 — "…무력화된다" 라는 **파급 서술**이지 결정 항목이 아님)
```

### 몇 건인가

| 계열 | 불가 | §3 등재 | 미등재 |
|---|---:|---:|---:|
| ⑪ 문서·표시 문구 | 5 | 0 | **5** |
| ⑫ 기타(주소·태그·인증·스냅샷) | 16 | 0 | **16** |
| ⑦ 검증·경고 | 6 | 2 (D-8) | **4** |
| ⑨ 전송·전표 | 6 | 4 (D-28·D-29·D-9 등) | **2** |
| **합계(확인분)** | **33** | **6** | **27** |

**최소 27 / 60 (45%)** 이 결정 목록 밖이다. 나머지 27건(②③⑤⑥⑩)은 §2 가 대표 예시만 실어 전건 대조가 불가능하다 — **이것도 구멍**이다.

특히 무게가 큰 미등재 3건:

- **`aggregateSendRows`(:9188) — 고정DC "최댓값 승리"**: 같은 모델·단가 행을 병합할 때 어느 거래처 고정DC 를 남길지의 규칙. 금액에 직결하는데 결정 항목이 없다.
- **`explodeSendSets_`(:8966) → `products.bundle_mode`**: 전송 시 세트를 분해할지 통짜로 보낼지. 출고 품목 자체가 달라진다.
- **`updateHomeRatio` 130% / `updateCommRatio` 103%·120%**: 조합비 상한. D-19 는 *"capacity 키가 없어 무력화된다"* 는 **파급**만 적었고, **임계값 3개를 어디에 저장할지는 아무도 묻지 않았다.**

### 다음 라운드가 할 일

§2 규칙표를 **138행 전개표**로 다시 뽑고 각 행에 `대응 판정 · D 번호(또는 "결정 불필요 + 이유")` 를 붙인다. **`불가` 인데 D 번호가 빈 행이 하나라도 남으면 "확실"이라고 보고하지 않는다.**

---

## C-9. 🟠 종합 보고서 내부 산술 모순 2건 (증거 무결성)

| # | 위치 | 문서 문장 | 실제 |
|---|---|---|---|
| 1 | SYNTHESIS §3 제목 (153행) | *"함수축 **45** + 시트축 28 = **73** → 중복 제거 후 31건"* | 같은 문서 §3 병합 회계표(386행)는 *"함수축 … **46**"*, *"원본 합계 **74**"*. 항목 합산 검증: `ejs-1 9 + ejs-2 8 + ejs-3 5 + ejs-4 7 + ejs-5 4 + ejs-6 5 + code-1 3 + code-2 2 + order 3 = 46`. **제목의 45/73 이 틀렸다.** |
| 2 | `ejs-2` §2 (30행) | *"아래 **5개 함수**(및 하위 줄)가 … 무호출임을 확인했다"* | 바로 뒤 표는 **8행**(`pickCommPanelModel`·`basesForSetPiecesByExistingRule_`·`applyHomeMultiPriceVat`·`singleUnitPrice`·`bindQty`·`bindCommQtyEvents`·`setPreviewFoot`·`buildSingleSetCompositionHtml_`). |

작은 오차지만 개발책임자 규칙([[feedback_quoted_output_splice_forgery]] · 대조 각도의 기본 임무)상 **보고서가 "실측" 으로 제시한 수치가 실제와 다르면 그 라운드에서 정정**한다.

---

## C-10. 🟠 적대 반증의 `checked_count` 를 대조할 수 없다 — **산출물 파일이 없다**

### 무엇이 빠졌는가

과제는 *"checked_count 와 배정 수를 대조"* 였다. 그런데 적대 반증의 산출물이 **저장소에 없다.**

```
$ ls docs/dev-reports/ | grep -i "2026-08-10-gas"
… (13개, 전부 파티션/분모/종합. 적대 반증 파일 없음)
$ grep -rn "checked_count\|false_dead\|적대 반증" docs/dev-reports/2026-08-10-gas-*.md | grep -v SYNTHESIS
→ 0건
$ git status --porcelain
?? docs/dev-reports/2026-08-10-gas-exhaustive-sweep-SYNTHESIS.md
?? …(파티션 12건). 적대 반증 없음
```

⟹ 적대 반증은 **세션 메시지로만 전달**됐고 파일로 남지 않았다. 그래서 ①`checked_count` 대조 불가 ②19건 회수의 근거 재현 불가 ③107건 목록 회수 불가(종합 §1.4 가 스스로 인정: *"payload 가 `false_dead_code` 배열 중간(`todayYMD_` 항목)에서 잘렸고, 분류 오판 107건의 목록은 아예 전달되지 않았다"*).

워크플로우 규칙([[feedback_review_post_one_to_one_enforcement]] — 실행=게시 1:1)상 **라운드 산출물은 파일로 남아야** 다음 라운드가 이어받는다.

### 내가 대신 한 것

적대 반증을 재현하는 대신 **독립 재계산**을 했다(C-7). 결과: 적대 반증의 19건 회수는 **과소**다 — 최소 1건(`bindCommQtyEvents`)이 B군→A군으로 더 올라간다. 반대로 **과대**인 축도 있다: 데드 56 중 12건은 GAS 가 아니라 우리 RN 코드다.

### 다음 라운드가 할 일

1. 적대 반증을 **파일 산출물로 재실행**(`docs/dev-reports/2026-08-10-gas-adversarial.md`), 맨 앞에 `assigned_count / checked_count / 미검사 목록` 3줄을 강제.
2. **107건 목록 없이는 `업무규칙 정정 후 N` 을 어떤 형태로도 보고하지 않는다.** 종합 §1.4 가 *"211~425"* 라는 폭을 정직하게 적은 것은 옳지만, 그 폭을 남긴 채 §2 규칙표(138)와 §3 결정(31)을 확정본처럼 쓰는 것은 앞뒤가 안 맞는다.

---

## 8. 내가 확인해서 **문제 없었던** 것 (구멍이 아니라고 판단한 근거)

비판자는 "구멍이 없다" 도 근거로 말해야 한다. 아래는 재계산해서 **정합**을 확인한 것이다.

### 8.1 파티션 배정 수 — 인벤토리와 정확히 일치 ✅

```
ejs-1 1~3300      68
ejs-2 3301~6600  174
ejs-3 6601~9900  114
ejs-4 9901~13200 105
ejs-5 13201~16500 118
ejs-6 16501~19753  63     (합 642)
code-1 1~1400     95 / code-2 1401~2858  76   (합 171)
```
구간이 **빈틈·중복 없이** 분모를 덮는다. 종합 §1.1 의 파티션 열과 전건 일치.

### 8.2 4분류 합계 — 재계산 일치 ✅

각 파티션 §0 값을 직접 더했다:

| 분류 | ejs-1 | ejs-2 | ejs-3 | ejs-4 | ejs-5 | ejs-6 | code-1 | code-2 | order | mobile | 합 | 종합 |
|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|
| business_rule | 27 | 81 | 58 | 16 | 45 | 8 | 69 | 10 | 4 | 0 | **318** | 318 ✅ |
| ui_only | 13 | 60 | 30 | 78 | 54 | 33 | 0 | 0 | 6 | 0 | **274** | 274 ✅ |
| infra_util | 21 | 20 | 11 | 7 | 14 | 21 | 8 | 66 | 18 | 16 | **202** | 202 ✅ |
| dead_code | 7 | 13 | 15 | 4 | 5 | 1 | 18 | 0 | 0 | 12 | **75** | 75 ✅ |
| 계 | 68 | 174 | 114 | 105 | 118 | 63 | 95 | 76 | 28 | 28 | **869** | 869 ✅ |

### 8.3 규칙 단위 138 — 각 보고서 절 수와 일치 ✅

```
ejs-1 §3-1~3-18 =18 · ejs-2 G1~G45 =45 · ejs-3 A~N =14 · ejs-4 3.1~3.12 =12
ejs-5 3.1~3.11 =11 · ejs-6 BR1~BR8 =8 · code-1 BR-1~BR-20 =20 · code-2 BR-1~BR-7 =7 · order 2-1~2-3 =3
→ 138 ✅
```

### 8.4 §2 규칙표의 행·열 합계 ✅

```
계열별 규칙 수 합 = 13+17+17+12+12+5+9+10+12+8+5+18 = 138 ✅
대응가능 45 + 부분 33 + 불가 60 = 138 ✅
열 합계도 각각 45 / 33 / 60 재계산 일치 ✅
```

### 8.5 분모 파일별 합 889 ✅ · 인벤토리 절 헤더의 `함수 N개` 와 실제 나열 수 전건 일치 ✅

```
declared=642/parsed=642 … 12개 절 전부 일치. TOTAL declared 889 parsed 889
```

### 8.6 종합 §1.1 의 "db-catalog(16)·slip-bridge(4) 미배정" ✅

`code-1` 보고서는 `db-catalog.js` 를 **근거로만** 인용한다(10곳). 분류표에는 없다. 종합의 자백이 정확하다.

### 8.7 `.ejs` 서버측 스크립틀릿 — 규칙 없음 ✅

```
ejs scriptlets <% %> = 0, 출력 태그 <%= / <%- = 21
```
전부 부트스트랩 JSON 주입(`homemulti`·`singleSets`·`priceInc`·`config`·`authData` …)이고 `routes/index.js`(41줄)를 실독해도 판단 로직이 없다. **여기엔 구멍이 없다.**

### 8.8 HTML 인라인 핸들러 — 대부분 단순 호출, 로직 15건 ✅(경미)

```
index.ejs 인라인 핸들러 속성 109건 · 그중 ?/&&/||/; 포함 15건
   예: onchange="if(window.activeSector==='preview') goPreview(); else if(window.activeSector==='final') goFinal();"
       onchange="syncVatFromOrderInfo(); if(window.activeSector==='preview') goPreview();"
```
전부 화면 전환 분기이며 금액·수량·모델에 닿지 않는다. **분모 밖이지만 이식 대상 아님**으로 판단.

### 8.9 분모 밖 기타 파일 — 업무규칙 밀도 낮음 ✅(단, 목록은 남긴다)

`clients/web/{estimate-app,order-app,legacy-quantity-golden}` 중 분모 밖에서 명명 함수를 가진 파일 **30개 · 함수 475개**. 상위:

```
315  order-app/index.html            ← C-6 (진짜 구멍)
 27  estimate-app/qa-set-expansion-parity-gate.mjs
 19  legacy-quantity-golden/legacyQuantityBoundary.js
 15  order-app/qa-gas-parity-sim.mjs
  8  estimate-app/lib/apps-script-shim.js
  8  estimate-app/qa-gas-parity-sim.mjs
  7  estimate-app/lib/version-check.js  …
```
`order-app/index.html` 을 빼면 나머지는 **하네스·시뮬레이터·버전게이트·GAS API 에뮬레이션**이라 이식 대상 규칙이 아니다. 다만 **하네스가 정본 함수를 문자열로 지목한다는 사실이 C-7 의 뿌리**이므로 목록 자체는 다음 라운드에 인계한다.

---

## 9. 다음 라운드 착수 순서 (구멍의 상류부터)

| 순서 | 할 일 | 왜 이 순서인가 |
|---|---|---|
| **1** | **개발책임자께 범위 확인 — `tools/legacy-gas/` 59파일이 사정권인가**(C-5) | 업무 범위 판단이라 PM 이 추론 금지. 답에 따라 분모 규모가 2배가 된다 |
| **2** | **분모 추출 명령을 문서에 박고 재생성**(C-2) — 형태 추가: 객체 메서드 축약 · `window.X = function` · 동명 재정의 표 | 명령이 없으면 3·4를 할 수 없다 |
| **3** | 그 명령으로 **`order-app/index.html` 분모 생성 + §1.1 13번째 행**(C-6) | *"견적서와 주문서 모두"* 의 미충족을 닫는다 |
| **4** | 분모를 **(A)함수 / (B)판정줄** 두 축으로 분리하고 커버리지 재집계(C-1) | `869/889`·`업무규칙 318` 이 같은 문서에서 두 의미로 쓰이는 것을 끝낸다 |
| **5** | **레거시 30건 3버킷 분류**(대체/병합/드롭)(C-5b) — 가격인상 6종·`rebuildDerivedFromData` 우선 | D-20 과 §4 수량 축의 입력 |
| **6** | **D-14 를 결함으로 승격**: 실행 경로(7033) 정본 명시 + 울타리 재조준(C-7) | 지금 CI 울타리가 실행되지 않는 코드를 지킨다 |
| **7** | **§2 를 138행 전개표로 재작성 + 각 행에 D 번호**(C-8) | `불가` 인데 D 없는 행이 0 이 되어야 "확실"이라 말할 수 있다 |
| **8** | 적대 반증 **파일 산출물로 재실행 + 107건 목록 회수**(C-10) · 산술 2건 정정(C-9) | 종합 스스로 "확정 불가" 라 적은 축 |

---

## 10. 개발책임자께 — *"이번에는 확실해야해"* 에 대한 정직한 답

**아직 확실하지 않습니다.** 확실한 것과 아닌 것을 나누면:

**확실한 것**
- 견적 `index.ejs`(642) + `lib/code.js`(171) 두 파일에 대해, **PM 이 고정한 분모 안에서는** 빈틈·중복 없이 전수 분류됐다(§8.1~8.5 재계산 전건 일치).
- 종합 보고서의 산술은 두 곳(C-9)을 빼면 정합하다.

**확실하지 않은 것**
- **분모가 모집단이 아니다.** 원본 GAS 59파일(72,826줄·1,820함수)이 0건이고, 주문 정본(10,156줄·315함수)도 0건이며, 분모 안에서도 최상위 함수 9건이 빠지고 함수 아닌 것 175건이 들어와 있다.
- **결정 목록이 [불가] 를 다 덮지 않는다** — 확인분만 27/60 미등재.
- **적대 반증이 재현되지 않는다**(파일 없음 · payload 절단 · 107건 목록 부재).

⟹ 지금 상태에서 "GAS 로직을 하나도 놓치지 않았다" 고 보고하면 **틀립니다.** 위 §9 의 1~4번(범위 확인 → 추출 명령 고정 → 주문 분모 생성 → 두 축 재집계)까지 끝내야 같은 문장을 쓸 수 있습니다.

---

*작성 = 완결성 비판자. 코드·스키마·git 변경 0건. 본문의 모든 수치는 위에 붙인 명령을 이 저장소(`C:\dev\Samhan-Public`, `main`, `0046d4603`)에서 그대로 재실행하면 재현됩니다. 재현 스크립트 원본: `%TEMP%\claude\C--dev-Samhan-Public\…\scratchpad\critic{1,2,3,4,5}.mjs`.*
