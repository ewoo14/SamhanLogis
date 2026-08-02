# PR #987 SOL Round 2 적대 검증 결과

- 검증 기준: `ae84029c64c831b1a426f6a2406be0cbdbbf116f`
- 대상 브랜치 원격 head: `origin/fix/978-silent-catalog-miss-signal`
- 질문: **실 사용자 경로로 재현 가능한 결함이 있는가?**
- 결론: **있다. 도달 가능 결함 1건이다.**
- 코드 수정, 커밋, 브랜치 조작, 이슈 등록은 하지 않았다. 이 문서만 추가했다.

## 1. 도달 가능 결함 — 싱글중대형 파생 품목 4계열이 카탈로그에서 빠지면 여전히 조용히 금액에서 누락된다

주문 앱의 싱글중대형에는 자동 파생 target이 정확히 네 종류 있다.

1. 원형 발통 `발통세트`
2. 일자발 `SI-AL700a`
3. 유선리모컨 키트 `AIM-A01N`
4. 실링용 드레인펌프 `ADP-F075SP`

홈멀티와 상업멀티에는 각각 `#homeCatalogWarnings`, `#commCatalogWarnings`가 생겼지만 싱글중대형에는 대응 경고 영역이 없다. 실제 bootstrap의 `singleSets=288`, `singleParts=1447`을 사용해 네 target을 전수 확인한 결과, 정상 카탈로그에서는 모두 수량 1로 파생되지만 해당 실제 target 행 하나가 API 응답에서 빠진 상태에서는 모두 수량 0, 비예외, 무경고로 끝났다.

### 실 사용자 재현 절차

카탈로그 누락은 이 PR이 다루는 운영 상태와 동일하게, 실제 API 응답에서 해당 target 행이 내려오지 않는 상태다. 원천·target 이름이나 모델을 지어내지 않고 현재 실 bootstrap에 함께 존재하는 행만 사용했다.

1. 싱글중대형에서 `360 CST UV` (`AC060CS6PBH1SY`) 수량을 1로 입력하고 `실외기 받침대 포함`을 선택한다. `발통세트` 행이 카탈로그에서 빠지면 원형발통이 금액에서 누락되지만 경고가 없다.
2. `냉난방 프리미엄 스탠드` (`AP230DAPDHH1S`) 수량을 1로 입력하고 `실외기 받침대 포함`을 선택한다. `SI-AL700a` 행이 빠지면 일자발이 금액에서 누락되지만 경고가 없다.
3. `무풍 1way 냉난방` (`AC023CS1PBH1SY`) 수량을 1로 입력하고 `유선리모컨`을 선택한다. `AIM-A01N` 행이 빠지면 유선리모컨 키트가 금액에서 누락되지만 경고가 없다.
4. `싱글 실링` (`AC072BSCPBH2SY`) 수량을 1로 입력한다. `ADP-F075SP` 행이 빠지면 실링용 드레인펌프가 금액에서 누락되지만 경고가 없다.

### 실행한 명령

작업 디렉토리: 저장소 루트

```powershell
@'
const { evaluateLegacyQuantityBoundary } = require('./clients/web/legacy-quantity-golden/legacyQuantityBoundary');
const fs = require('node:fs');
(async () => {
  const response = await fetch('http://localhost:8088/api/v1/partner-orders/bootstrap', { headers: {
    'X-Partner-Code':'P0001','X-Biz-Code':'2118712345','X-User-Id':'qa-pr987','X-User-Role':'PARTNER','X-Is-Partner':'true'
  }});
  const envelope = await response.json();
  const p = envelope.data.payloads;
  const catalog = { home:p.homemulti, single:p.singleSets, singleParts:p.singleParts, commercial:p.commercialMulti, priceSnapshot:null };
  const cases = [
    {kind:'round-foot', sourceId:'360 CST UV0', targetModel:'\uBC1C\uD1B5\uC138\uD2B8', dom:{'#ss_base':{checked:true}}},
    {kind:'flat-foot', sourceId:'\uB0C9\uB09C\uBC29 \uD504\uB9AC\uBBF8\uC5C4 \uC2A4\uD0E0\uB4DC98', targetModel:'SI-AL700a', dom:{'#ss_base':{checked:true}}},
    {kind:'wired-board', sourceId:'\uBB34\uD48D 1way \uB0C9\uB09C\uBC2947', targetModel:'AIM-A01N', dom:{'#ss_remote':'\uC720\uC120\uB9AC\uBAA8\uCEE8','#ss_remote_ex':{checked:false}}},
    {kind:'ceiling-pump', sourceId:'\uC2F1\uAE00 \uC2E4\uB9C161', targetModel:'ADP-F075SP', dom:{}}
  ];
  console.log(JSON.stringify({httpStatus:response.status,counts:{home:p.homemulti.length,single:p.singleSets.length,singleParts:p.singleParts.length,commercial:p.commercialMulti.length}}));
  for (const c of cases) {
    const source = catalog.single.find(r => String(r.id) === c.sourceId);
    const target = catalog.single.find(r => r.model === c.targetModel);
    if (!source || !target) throw new Error(`actual row missing: ${c.kind}`);
    const base = {family:`S-PR987-${c.kind}`,app:'order',catalog,sourceQuantities:{[source.id]:1},options:{dom:c.dom}};
    const full = evaluateLegacyQuantityBoundary(base);
    const missingCatalog = {...catalog,single:catalog.single.filter(r => r.model !== c.targetModel)};
    let missing, missingThrew=false, missingError='';
    try { missing = evaluateLegacyQuantityBoundary({...base,catalog:missingCatalog}); }
    catch (error) { missingThrew=true; missingError=String(error && error.message || error); }
    console.log(JSON.stringify({kind:c.kind,source:{id:source.id,model:source.model,name:source.name},target:{id:target.id,model:target.model,name:target.name},fullTargetQuantity:Number(full.quantities[String(target.id)]||0),missingTargetQuantity:Number(missing?.quantities?.[String(target.id)]||0),missingThrew,missingError,missingQuantities:missing?.quantities||null}));
  }
  const html = fs.readFileSync('./clients/web/order-app/index.html','utf8');
  console.log(JSON.stringify({warningElements:{home:(html.match(/id="homeCatalogWarnings"/g)||[]).length,commercial:(html.match(/id="commCatalogWarnings"/g)||[]).length,single:(html.match(/id="singleCatalogWarnings"/g)||[]).length}}));
})().catch(error => { console.error(error); process.exitCode=1; });
'@ | node -
```

### 출력 원문

```text
{"httpStatus":200,"counts":{"home":119,"single":288,"singleParts":1447,"commercial":408}}
{"kind":"round-foot","source":{"id":"360 CST UV0","model":"AC060CS6PBH1SY","name":"360 CST UV"},"target":{"id":"원형발통 세트283","model":"발통세트","name":"원형발통 세트"},"fullTargetQuantity":1,"missingTargetQuantity":0,"missingThrew":false,"missingError":"","missingQuantities":{"360 CST UV0":1}}
{"kind":"flat-foot","source":{"id":"냉난방 프리미엄 스탠드98","model":"AP230DAPDHH1S","name":"냉난방 프리미엄 스탠드"},"target":{"id":"실외기 일자발 (전면 8~12HP)285","model":"SI-AL700a","name":"실외기 일자발 (전면 8~12HP)"},"fullTargetQuantity":1,"missingTargetQuantity":0,"missingThrew":false,"missingError":"","missingQuantities":{"냉난방 프리미엄 스탠드98":1}}
{"kind":"wired-board","source":{"id":"무풍 1way 냉난방47","model":"AC023CS1PBH1SY","name":"무풍 1way 냉난방"},"target":{"id":"유선리모컨 키트76","model":"AIM-A01N","name":"유선리모컨 키트"},"fullTargetQuantity":1,"missingTargetQuantity":0,"missingThrew":false,"missingError":"","missingQuantities":{"무풍 1way 냉난방47":1}}
{"kind":"ceiling-pump","source":{"id":"싱글 실링61","model":"AC072BSCPBH2SY","name":"싱글 실링"},"target":{"id":"실링용 드레인펌프75","model":"ADP-F075SP","name":"실링용 드레인펌프"},"fullTargetQuantity":1,"missingTargetQuantity":0,"missingThrew":false,"missingError":"","missingQuantities":{"싱글 실링61":1}}
{"warningElements":{"home":1,"commercial":1,"single":0}}
```

실제 로컬 주문 앱 DOM에서도 경고 영역 개수를 읽었다.

```javascript
await tab.playwright.evaluate(() => ({
  homeWarningCount: document.querySelectorAll('#homeCatalogWarnings').length,
  commWarningCount: document.querySelectorAll('#commCatalogWarnings').length,
  singleWarningCount: document.querySelectorAll('#singleCatalogWarnings').length,
  anySingleWarningIds: Array.from(document.querySelectorAll(
    '[id*="single"][id*="Warning"], [id*="single"][id*="warning"]',
  )).map((e) => e.id),
  gateText: document.body.innerText.includes('미등록 사업자번호') ? '미등록 사업자번호' : '',
}));
```

출력 원문:

```text
{"anySingleWarningIds":[],"commWarningCount":1,"gateText":"미등록 사업자번호","homeWarningCount":1,"singleWarningCount":0}
```

### 왜 실 사용자에게 도달 가능한가

- 네 원천 행은 현재 실 API에 존재하고 주문 화면에서 수량·옵션으로 선택 가능한 실제 상품이다.
- 네 target 행도 현재 실 API에 존재하므로 정상 상태에서 파생 수량 1이 실제로 계산됨을 먼저 확인했다.
- target 상수 `SS_FOOT_ROUND_ID`, `SS_FOOT_FLAT_ID`, `SS_WIRED_BOARD_ID`, `SS_CEILING_PUMP_ID`는 페이지가 bootstrap을 읽을 때 `singleSets`에서 찾는다. 해당 행이 누락되면 상수는 `null`이 된다.
- `recomputeSingleBaseFoot()`와 `recomputeSingleExtras()`는 상수가 `null`이면 수량 반영을 건너뛴다. 예외도 경고 기록도 없다.
- 싱글 주문 금액은 `singleQty`에 실제 반영된 항목만 합산한다. 위 출력처럼 target 수량이 1에서 0으로 사라져 실제 주문 금액에서 제외된다.
- 싱글 자동 파생 target은 위 네 개가 전부이며 네 갈래를 모두 실행했다. 표본 결론이 아니다.

## 2. 요청된 새 표면별 판정

| 새 표면 | 실측 판정 |
|---|---|
| `actualCatalog()`의 `single: []`, `singleParts: []`, `priceSnapshot: null` | 이 helper는 `clients/web/legacy-quantity-golden/priceParityS3Cases.js`와 두 parity 테스트에서만 참조된다. 주문·견적 런타임에는 import되지 않아 빈 값 자체가 실 사용자에게 도달하지 않는다. |
| `remote360Input` / `coolTop30Input`의 family·source 변경 | 참조처를 전수 검색했다. estimate/order의 `priceParityS3` 두 파일 외 소비자는 없다. 실 사용자 런타임 경로는 없다. |
| order=비예외, estimate=예외 분기 | 실 API 카탈로그에서 실제 target 행만 제외해 양 앱 정본을 실행했다. order는 비예외, estimate는 모델명을 포함한 예외로 실제 구현과 일치했다. |
| `AR-EH05`·`방진가대S2중` 원천-파생 짝 | 정상 실 API 카탈로그에서 `AM130BN6PBH1 → AR-EH05=1`, `AM300AXVGHC1 → 방진가대S2중=1`을 order/estimate 모두에서 재현했다. |
| 사용자 경고 | 홈·상업 경고 DOM은 존재한다. 싱글 경고 DOM과 누락 기록 경로는 없고, 네 파생 계열 전부에서 조용한 금액 누락을 재현했다. |

참조처 전수 검색 명령과 출력:

```text
> rg -n "actualCatalog|remote360Input|coolTop30Input" clients/web --glob '!**/node_modules/**'
clients/web\legacy-quantity-golden\priceParityS3Cases.js:33:function actualCatalog() {
clients/web\legacy-quantity-golden\priceParityS3Cases.js:60:function remote360Input() {
clients/web\legacy-quantity-golden\priceParityS3Cases.js:67:    catalog: actualCatalog(),
clients/web\legacy-quantity-golden\priceParityS3Cases.js:71:function coolTop30Input() {
clients/web\legacy-quantity-golden\priceParityS3Cases.js:78:    catalog: actualCatalog(),
clients/web\legacy-quantity-golden\priceParityS3Cases.js:120:  coolTop30Input,
clients/web\legacy-quantity-golden\priceParityS3Cases.js:122:  remote360Input,
clients/web\estimate-app\test\price-parity-s3.test.js:4:  coolTop30Input,
clients/web\estimate-app\test\price-parity-s3.test.js:6:  remote360Input,
clients/web\estimate-app\test\price-parity-s3.test.js:12:    const input = remote360Input();
clients/web\estimate-app\test\price-parity-s3.test.js:22:    const input = coolTop30Input();
clients/web\estimate-app\test\price-parity-s3.test.js:32:    ['AR-EH05', remote360Input, 'order'],
clients/web\estimate-app\test\price-parity-s3.test.js:33:    ['AR-EH05', remote360Input, 'estimate'],
clients/web\estimate-app\test\price-parity-s3.test.js:34:    ['방진가대S2중', coolTop30Input, 'order'],
clients/web\estimate-app\test\price-parity-s3.test.js:35:    ['방진가대S2중', coolTop30Input, 'estimate'],
clients/web\order-app\src\__tests__\priceParityS3.test.ts:6:  coolTop30Input,
clients/web\order-app\src\__tests__\priceParityS3.test.ts:8:  remote360Input,
clients/web\order-app\src\__tests__\priceParityS3.test.ts:14:    const input = remote360Input();
clients/web\order-app\src\__tests__\priceParityS3.test.ts:24:    const input = coolTop30Input();
clients/web\order-app\src\__tests__\priceParityS3.test.ts:34:    ['AR-EH05', remote360Input, 'order'],
clients/web\order-app\src\__tests__\priceParityS3.test.ts:35:    ['AR-EH05', remote360Input, 'estimate'],
clients/web\order-app\src\__tests__\priceParityS3.test.ts:36:    ['방진가대S2중', coolTop30Input, 'order'],
clients/web\order-app\src\__tests__\priceParityS3.test.ts:37:    ['방진가대S2중', coolTop30Input, 'estimate'],
```

앱별 누락 계약 실행 출력:

```text
order	AR-EH05	OK	{"AM130BN6PBH1":1,"FH-LFHLN":1}
estimate	AR-EH05	THROW	상업멀티 파생 품목이 카탈로그에 없습니다: AR-EH05 (파생 품목 반영)
order	방진가대S2중	OK	{"AM300AXVGHC1":1}
estimate	방진가대S2중	THROW	상업멀티 파생 품목이 카탈로그에 없습니다: 방진가대S2중 (파생 품목 반영)
```

## 3. 증거 무결성

### 3.1 PR #987 최신 코멘트 확인

요청된 명령은 현재 토큰의 GitHub GraphQL scope 부족으로 실패했다.

```text
> gh pr view 987 --comments
GraphQL: Your token has not been granted the required scopes to execute this query. The 'login' field requires one of the following scopes: ['read:org'], but your token has only been granted the: ['read:user', 'repo', 'user:email', 'workflow'] scopes. Please modify your token's scopes at: https://github.com/settings/tokens., Your token has not been granted the required scopes to execute this query. The 'name' field requires one of the following scopes: ['read:org', 'read:discussion'], but your token has only been granted the: ['read:user', 'repo', 'user:email', 'workflow'] scopes. Please modify your token's scopes at: https://github.com/settings/tokens., Your token has not been granted the required scopes to execute this query. The 'slug' field requires one of the following scopes: ['read:org', 'read:discussion'], but your token has only been granted the: ['read:user', 'repo', 'user:email', 'workflow'] scopes. Please modify your token's scopes at: https://github.com/settings/tokens.
```

같은 PR의 issue comment REST API로 최신 코멘트를 읽었다.

```text
> gh api --paginate 'repos/ewoo14/Samhan-Public/issues/987/comments?per_page=100' --jq 'sort_by(.created_at) | last | {html_url,created_at,body}'
created_at: 2026-07-29T06:14:16Z
html_url: https://github.com/ewoo14/Samhan-Public/pull/987#issuecomment-5113919467
```

최신 코멘트의 결정적 주장과 재현 결과:

| 주장 | 재현 결과 |
|---|---|
| estimate: 9 suites, 182 tests 통과 | 일치 |
| order: 17 files, 186 tests 통과 | 일치 |
| `renderCatalogWarnings_` 조기 return 뮤테이션 시 지정 4건 실패, 3건 통과 | 일치 |
| `frontend-order-app` CI가 필터 없이 `npm run test` 실행 | `.github/workflows/ci.yml:786-815`에서 일치 |

### 3.2 최신 코멘트의 전체 스위트 수 재현

Windows PowerShell에서 실행 파일 해석만 `npm.cmd`를 사용했다. package script와 인자는 코멘트·보고서와 같다.

estimate 명령:

```text
npm.cmd test -- --runInBand
```

출력 원문 말미:

```text
Test Suites: 9 passed, 9 total
Tests:       182 passed, 182 total
Snapshots:   0 total
Time:        10.575 s, estimated 23 s
Ran all test suites.
```

order 명령:

```text
$env:NO_COLOR='1'; npm.cmd run test
```

출력 원문:

```text
 Test Files  17 passed (17)
      Tests  186 passed (186)
   Start at  15:51:30
   Duration  2.80s (transform 777ms, setup 0ms, collect 1.18s, tests 3.29s, environment 5ms, prepare 4.85s)
```

테스트 개수와 성공 여부는 최신 코멘트와 일치한다.

### 3.3 최신 코멘트의 뮤테이션 출력 재현

저장소 파일은 변경하지 않았다. `git archive HEAD clients/web`으로 만든 임시 디렉토리에서만 `renderCatalogWarnings_` 첫 줄에 `return`을 넣고 다음 명령을 실행한 뒤 임시 디렉토리를 삭제했다.

```text
npm.cmd run test -- src/__tests__/catalogMissingSignal.test.ts
```

출력 원문 판정 구간:

```text
 ❯ src/__tests__/catalogMissingSignal.test.ts (7 tests | 4 failed) 60ms
   × 상업멀티 파생 카탈로그 누락 신호 > 실 bootstrap fixture에서 방진가대S2소가 빠지면 모델명을 사용자 신호로 남긴다 18ms
     → expected true to be false // Object.is equality
   × 상업멀티 파생 카탈로그 누락 신호 > 실 bootstrap fixture에서 AR-EH05가 빠지면 모델명을 사용자 신호로 남긴다 10ms
     → expected true to be false // Object.is equality
   × 상업멀티 파생 카탈로그 누락 신호 > 실 bootstrap fixture에서 방진가대S2중가 빠지면 모델명을 사용자 신호로 남긴다 13ms
     → expected true to be false // Object.is equality
   × 홈멀티 파생 카탈로그 누락 신호 > 실 bootstrap fixture에서 FH-LFHLF가 빠지면 모델명을 사용자 신호로 남긴다 4ms
     → expected true to be false // Object.is equality

 Test Files  1 failed (1)
      Tests  4 failed | 3 passed (7)
```

실패 이름과 `4 failed | 3 passed (7)`은 최신 코멘트와 일치한다.

### 3.4 개발보고서의 수정 전 RED 재현

보고서의 “수정 전” 상태인 부모 커밋 `6379f74c3`을 `git archive`로 임시 디렉토리에 풀었다. checkout이나 브랜치 조작은 하지 않았다.

명령:

```text
npm.cmd test -- --runInBand test/price-parity-s3.test.js
```

출력 원문 말미:

```text
Test Suites: 1 failed, 1 total
Tests:       2 failed, 5 passed, 7 total
Snapshots:   0 total
Time:        1.001 s, estimated 2 s
Ran all test suites matching /test\\price-parity-s3.test.js/i.
```

- 종료 코드 `1`, 실패 `2`, 통과 `5`, 총 `7`은 보고서와 일치한다.
- 보고서의 시간은 `2.121 s`, 재실행은 `1.001 s`였다. **실행 시간 수치는 재현되지 않았다.**

### 3.5 개발보고서의 수정 후 출력 재현

결정적 성공/개수는 모두 일치했다.

| 항목 | 보고서 | 재실행 |
|---|---:|---:|
| estimate suites | 9 passed | 9 passed |
| estimate tests | 182 passed | 182 passed |
| order files | 17 passed | 17 passed |
| order tests | 186 passed | 186 passed |
| estimate typecheck | 14 JavaScript files | 14 JavaScript files |
| estimate build 내부 typecheck | 14 JavaScript files | 14 JavaScript files |

typecheck/build 출력 원문:

```text
> @samhan/estimate-app@2.0.0 typecheck
> node scripts/typecheck.cjs

typecheck OK: 14 JavaScript files
```

```text
> @samhan/estimate-app@2.0.0 build
> npm run typecheck


> @samhan/estimate-app@2.0.0 typecheck
> node scripts/typecheck.cjs

typecheck OK: 14 JavaScript files
```

실행 시간 수치는 일치하지 않았다.

| 항목 | 보고서 | 재실행 |
|---|---:|---:|
| estimate 전체 | `8.531 s` | `10.575 s` |
| order 전체 | `2.11 s` | `2.80 s` |

실행 시간은 환경·실행 순서에 따라 변하는 값이지만, 보고서가 실행 원문으로 수치를 제시했으므로 불일치를 그대로 기록한다.

### 3.6 실 bootstrap fixture와 현재 실 API 대조

명령은 현재 API 응답과 추적 fixture를 같은 필드로 전수 비교하고, 두 원천-파생 조합을 order/estimate에서 실행했다.

출력 원문:

```text
{"httpStatus":200,"liveCounts":{"home":119,"single":288,"singleParts":1447,"commercial":408},"fixtureCounts":{"homeSubset":2,"commercial":408},"commercialMismatchCount":0,"commercialMismatchIndexes":[],"homeSubsetMatch":[{"model":"AJ012BN1PBC2","exists":true,"selectedFieldsMatch":true},{"model":"FH-LFHLF","exists":true,"selectedFieldsMatch":true}]}
{"label":"remote360","app":"order","quantities":{"AM130BN6PBH1":1,"AR-EH05":1}}
{"label":"remote360","app":"estimate","quantities":{"AM130BN6PBH1":1,"AR-EH05":1}}
{"label":"coolTop30","app":"order","quantities":{"AM300AXVGHC1":1,"방진가대S2중":1}}
{"label":"coolTop30","app":"estimate","quantities":{"AM300AXVGHC1":1,"방진가대S2중":1}}
```

판정:

- commercial fixture 408행은 현재 실 API 408행과 선택 필드 기준 전수 일치했다.
- home fixture는 119행 전체가 아니라 명시된 2행 subset이며, 그 두 행은 현재 실 API와 일치했다.
- `AR-EH05`와 `방진가대S2중`의 원천-파생 짝은 실제로 성립했다.
- 결정적 테스트 결과·개수, 뮤테이션 결과, fixture 행은 재현됐다.
- 개발보고서에 원문으로 적힌 실행 시간만 재실행 수치와 달랐다.

## 4. 이 라운드가 조사하지 않은 영역

다음은 결함 0으로 세지 않았다.

- `services/**` 백엔드 코드 전부
- `clients/desktop/**` 전부
- Docker 서비스 기동·재빌드 및 컨테이너 상태
- GitHub Actions 원격 CI의 현재 실행 상태와 로그
- 인증을 통과한 실제 주문 화면에서의 마우스/키보드 클릭 E2E. 추적된 QA 사업자번호로 실 브라우저 진입을 시도했으나 현재 화면이 `미등록 사업자번호`로 막혔고, 검증을 위해 계정·카탈로그를 등록하거나 변경하지 않았다.
- 실제 운영 DB에서 target 행을 삭제·비활성화한 뒤의 E2E. 운영 상태를 바꾸지 않고 현재 실 API 응답의 실제 target 행만 메모리에서 제외해 동일 계산 경계를 실행했다.
- 인증 후 홈멀티·상업멀티의 모든 원천 모델·모든 옵션 조합에서 경고 바가 실제 픽셀로 보이는지에 대한 전수 GUI 실행
- 주문 미리보기, 저장, 전송, 인쇄 및 백엔드 수신 금액
- estimate-app의 인증 후 실제 GUI
- `clients/web/order-app`, `clients/web/estimate-app`, 공유 legacy quantity 경계 밖의 다른 웹·모바일 클라이언트
- 모노레포 전체 테스트 스위트
- 접근성, 반응형 레이아웃, 성능, 브라우저 호환성
- 테스트 강도, mock 완전성, 문서 완성도 등 검증 품질 전반. 단, 요청된 증거 무결성만 예외로 대조했다.
- 결함의 심각도·우선순위 판정

