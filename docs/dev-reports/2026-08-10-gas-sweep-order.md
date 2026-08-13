# GAS 전수조사 — order 트랙 (`clients/web/order-app/src/{quantitySync,samhanApi,legacyShim,main}.ts`)

> 조사자 = 서브에이전트(정찰 전용, 코드/스키마/git 변경 없음). 분모 = `docs/dev-reports/2026-08-10-gas-function-inventory.md`.
> 범위: `clients/web/order-app/src/quantitySync.ts` + `samhanApi.ts` + `legacyShim.ts` + `main.ts` 전체.

## 0. 완결성 집계

| 파일 | 인벤토리 함수 수 | 분류 완료 |
|---|---:|---:|
| `quantitySync.ts` | 8 | 8 |
| `samhanApi.ts` | 16 | 16 |
| `legacyShim.ts` | 4 | 4 |
| `main.ts` | 0 | 0 |
| **합계** | **28** | **28** |

- **assigned_count = 28**, **classified_count = 28** (일치).
- 4분류 합계: business_rule **4** · ui_only **6** · infra_util **18** · dead_code **0** → 4+6+18+0 = 28 ✓.
- `main.ts`(128줄)는 기계 추출 결과 함수 0개 — 실측: 최상위 `function` 선언도, `const x = (...) =>` 패턴도 없음(전부 `google.script.run` 대체 객체의 메서드 축약형 `getQuantitySyncRules(catalog) {`/`getState() {` 또는 `.then(cb =>`류 인라인 콜백이라 인벤토리 추출 정규식에 안 걸림). 인벤토리 분모가 0이므로 분류 대상 없음 — 다만 §4에 `main.ts`의 배선 역할을 별도로 기록.
- ⚠️ **인벤토리 기계 추출의 오탐(false positive) 확인**: `samhanApi.ts:218`, `239`, `243`, `245`, `248`, `legacyShim.ts:149` 는 실제로는 독립 함수가 아니라 상위 함수 본문 내부의 지역 변수 선언(`const x = (...)`, 괄호로 감싼 표현식) 또는 중첩 화살표 함수다. 분모가 고정되어 있으므로 각각을 소속 함수와 **동일 분류**로 채워 28건을 맞췄고, 표에 "중첩/오탐" 주석을 달았다(§1 표 참조). 실제 **독립 함수/화살표함수 개수는 22개**(28 − 6개 중첩 항목), 그중 진짜 별개 로직인 것은 `legacyShim.ts:149`(`setLogo`, 진짜 중첩 화살표 함수)뿐이고 나머지 5개(`218/239/243/245/248`)는 함수조차 아닌 단순 대입문이다.

## 1. 전수 분류표

| 파일 | 줄 | 식별자 | 분류 | 비고 |
|---|---:|---|---|---|
| quantitySync.ts | 57 | `text` | infra_util | 문자열 trim/coerce, 도메인 무관 |
| quantitySync.ts | 61 | `positiveNumber` | infra_util | 범용 양수 검증(라벨 인자로 메시지만 다름) |
| quantitySync.ts | 69 | `rowsForProductCode` | infra_util | 카탈로그 modelCode/model 대소문자 무시 매칭 |
| quantitySync.ts | 73 | `sourceRows` | infra_util | `rowsForProductCode` 다중 소스 래퍼 |
| quantitySync.ts | 77 | `errorResult` | infra_util | 에러 결과 객체 shape 생성 |
| quantitySync.ts | 87 | `selectionError` | infra_util | 선택 에러 객체 shape 생성 |
| quantitySync.ts | 97 | `selectSingleS03Rule` | **business_rule** | S-03(실링 드레인펌프) 규칙 선택·검증 — 상세 §2-1 |
| quantitySync.ts | 174 | `evaluateSingleS03Rule` | **business_rule** | S-03 대상 수량 계산 — 상세 §2-2 |
| samhanApi.ts | 67 | `toIsoDateParam` | infra_util | 날짜 ISO(`YYYY-MM-DD`) 정규화 |
| samhanApi.ts | 85 | `toIsoDateTimeParam` | infra_util | 날짜+`00:00:00`/`23:59:59` 조합 |
| samhanApi.ts | 91 | `draftHistoryParams` | infra_util | `args`→`{from,to}` 재포장 |
| samhanApi.ts | 97 | `unwrapApiResponse` | infra_util | `{success/code,data}` envelope 언랩 |
| samhanApi.ts | 121 | `nonNegativeInteger` | infra_util | 정수 검증 |
| samhanApi.ts | 125 | `decodeCollectionResponse` | infra_util | 목록/페이지 응답 디코드 |
| samhanApi.ts | 159 | `fetchAllPages` | infra_util | 페이지 전체 순회 수집 |
| samhanApi.ts | 189 | `fetchQuantitySyncRules` | infra_util | `estimateCategory:'SINGLE_SET'` 고정 GET(리터럴은 §2-1 규칙과 연동) |
| samhanApi.ts | 207 | `confirmLines` | **business_rule** | 주문 라인 검증 + 섹션→카테고리 매핑 — 상세 §2-3 |
| samhanApi.ts | 218 | *(중첩, `const item = (rawItem\|\|{}) as LegacyOrderItem`)* | **business_rule** | 오탐 — `confirmLines` 본문 내부 지역변수, 별도 함수 아님. `confirmLines`와 동일 규칙에 포함 |
| samhanApi.ts | 237 | `apiErrorMessage` | ui_only | 사용자 노출 에러 문구 결정(타임아웃/응답메시지/기본문구) |
| samhanApi.ts | 239 | *(중첩, `const code = ...`)* | ui_only | 오탐 — `apiErrorMessage` 본문 내부, 별도 함수 아님 |
| samhanApi.ts | 243 | *(중첩, `const responseData = ...`)* | ui_only | 상동 |
| samhanApi.ts | 245 | *(중첩, `const message = ...`)* | ui_only | 상동 |
| samhanApi.ts | 248 | *(중첩, `const message = ...`)* | ui_only | 상동 |
| samhanApi.ts | 254 | `confirmHeaders` | infra_util | `order.bizno`→`X-Biz-Code` 헤더, 존재검증만·계산규칙 없음 |
| legacyShim.ts | 56 | `buildGoogleScriptRun` | infra_util | `google.script.run` Proxy 구현체 |
| legacyShim.ts | 114 | `buildUrlFetchAppNoop` | infra_util | `UrlFetchApp.fetch` 차단 noop |
| legacyShim.ts | 133 | `installLegacyShim` | infra_util | shim 설치 오케스트레이션 |
| legacyShim.ts | 149 | *(중첩, `const setLogo = () => {...}`)* | ui_only | 진짜 중첩 함수(오탐 아님) — 로고 이미지 DOM 주입/폴백 토글 |

**dead_code 조사(전수 grep 완료, 0건)**: 28개 항목 전부 파일 내부에서 즉시 호출되거나(직접 읽어 확인) `main.ts`/테스트/스크립트에서 참조됨을 grep으로 확인했다.
- `evaluateSingleS03Rule`/`selectSingleS03Rule`: `main.ts:66` 직접 호출 + `clients/web/order-app/src/__tests__/quantitySyncS03.test.ts` + `clients/web/order-app/scripts/quantity-sync-s03-shadow.mjs` (legacy golden 대조 하네스)에서 사용.
- `confirmLines`/`confirmHeaders`/`apiErrorMessage`: `samhanApi.ts` 내부 `RPC_MAP.sendOrderFromUi` 핸들러(§ RPC_MAP, line 361~392)에서 직접 호출 확인(직접 읽어 확인, grep 불요).
- `installLegacyShim`/`buildGoogleScriptRun`/`buildUrlFetchAppNoop`: `main.ts:86`에서 `installLegacyShim` 호출 → 내부에서 나머지 둘을 직접 호출(직접 읽어 확인).
- `samhanApi.call`/`fetchBootstrap`/`fetchQuantitySyncRules`(공개 API): `main.ts`, `legacyShim.ts` 양쪽에서 import 후 호출 확인(`Grep confirmHeaders|installLegacyShim|fetchQuantitySyncRules|...` → `clients/web/order-app/src/{samhanApi,quantitySync,main,legacyShim}.ts` 전부 매치).

## 2. business_rule 상세 (4항목 중 실질 로직 3개 — `confirmLines`+§218 중첩은 하나로 통합)

### 2-1. `selectSingleS03Rule` — `clients/web/order-app/src/quantitySync.ts:97`

**① 함수명·위치**: `selectSingleS03Rule(rules, catalog)`, `quantitySync.ts:97-166`.

**② 법칙(조건→결과)**:

| 조건 | 결과 |
|---|---|
| `rules`가 배열이 아님 | error: "수량 동기화 규칙 목록 응답 형식이 올바르지 않습니다." |
| `ruleKey==='SINGLE_S03_CEILING_DRAIN_PUMP'` 또는 `legacyRef==='S-03'` 후보 중 `ruleKey` 정확일치가 정확히 1개가 아님 | error: "S-03 규칙을 정확히 하나 찾지 못했습니다" |
| `rule.enabled !== true` | error: "비활성화되어 있습니다" |
| `rule.estimateCategory !== 'SINGLE_SET'` | error |
| `rule.aggregation !== 'SUM'` | error: "SUM만 지원합니다" |
| `rule.inactiveBehavior !== 'ZERO'` | error: "ZERO만 지원합니다" |
| `rule.when`/`conditionJson`이 빈 객체가 아님(키 존재) | error: "조건 없는 설정만 지원합니다" |
| `sources` 배열 길이 < 1 | error |
| `targets` 배열 길이 !== 1 | error |
| source/target `productCode` 중 하나라도 공백 | error |
| source/target `productCode`가 `catalog`(싱글 세트)에 없음 | error + `missingCatalogCodes` 나열 |
| `source.factor` 또는 `target.multiplier`가 0 이하/비유한수 | error(`positiveNumber` throw 메시지) |
| 임의의 source에 대해 `abs(factor × multiplier − 1) > 1e-9` | error: "S-03 설정이 legacy 수량과 일치하지 않습니다." |
| 위 전부 통과 | `{status:'ready', rule, errorMessage:null, missingCatalogCodes:[]}` |

**③ 상수/리터럴 전부**: `'SINGLE_S03_CEILING_DRAIN_PUMP'`(rule_key, 모듈 상수 `SINGLE_S03_RULE_KEY`, line 8) · `'S-03'`(legacy_ref) · `'SINGLE_SET'`(estimate_category) · `'SUM'`(aggregation) · `'ZERO'`(inactive_behavior) · `1e-9`(factor×multiplier≈1 오차 허용치).

**④ 읽는 속성**: (이미 API/DB화된 계층이라 "구글시트 컬럼"이 아니라 `quantity_sync_rule`/`quantity_sync_source`/`quantity_sync_target` 행의 필드) `ruleKey`·`legacyRef`·`estimateCategory`·`enabled`·`aggregation`·`inactiveBehavior`·`when`(=`conditionJson`)·`sources[].productCode`·`sources[].factor`·`targets[].productCode`·`targets[].multiplier`. `catalog` 쪽은 `SingleCatalogRow.modelCode`/`model`/`id`(= `products.model_code`/`id`).

**⑤ 스키마 대응**: **[표현 가능]** — `quantity_sync_rule.rule_key/estimate_category/enabled/aggregation/inactive_behavior/condition_json/legacy_ref`, `quantity_sync_source.factor`, `quantity_sync_target.multiplier`, `products.model_code`. 전부 이미 존재하는 컬럼이며 신규 스키마 불필요.

**⑥ 기본값**: 이 함수 자체는 값을 "설정"하지 않고 **이미 입력된 `quantity_sync_rule` 행을 검증만** 한다 — 견적품목 기본값 산정 로직이 아니라 **시드 데이터 무결성 게이트**다. 실제 시드 대상(source/target model_code 조합)은 결정 필요 — §3 decisions_needed-1 참조. **실측: 현재 DB(`product_db.quantity_sync_rule`)에 `rule_key='SINGLE_S03_CEILING_DRAIN_PUMP'` 활성(`is_deleted=false`) 행 0건** — 존재하는 2건 전부 `created_by='a0000...0001'`, `name`에 `'QA996 throwaway'`/`'QA R2 ... throwaway'` 포함, `is_deleted=true`(QA 잔재, `feedback_qa_rounds_pollute_shared_data.md` 패턴과 일치). 즉 이 규칙은 **아직 한 번도 실 시딩된 적이 없다**.

### 2-2. `evaluateSingleS03Rule` — `clients/web/order-app/src/quantitySync.ts:174`

**① 함수명·위치**: `evaluateSingleS03Rule(rule, catalog, quantities)`, `quantitySync.ts:174-220`.

**② 법칙(조건→결과)**:

| 조건 | 결과 |
|---|---|
| `rule === null` | error: "S-03 규칙이 없습니다." |
| `sources.length < 1` 또는 `targets.length !== 1` | error |
| source/target 코드가 catalog에 없음 | error + `missingCatalogCodes` |
| `multiplier`/`factor` 양수 검증 실패 | error |
| 정상 | `sourceTotal = Σ(source_qty_i × factor_i)`; `raw = sourceTotal × multiplier`; `roundingMode==='FLOOR'` → `Math.floor(raw)`, 그 외(기본 `'NONE'`) → `raw` 그대로; `targetQuantities` Map에 `{target.id ?? targetCode: targetQuantity}` 1건 반환 |

**③ 상수**: `'FLOOR'`(반올림 분기 리터럴) · `'NONE'`(roundingMode 기본 fallback 문자열).

**④ 읽는 속성**: `rule.sources[].productCode/factor`, `rule.targets[0].productCode/multiplier/roundingMode`, `catalog`(`SingleCatalogRow`).`modelCode/model/id`, `quantities` Map(품목 id→현재 화면 수량).

**⑤ 스키마 대응**: **[표현 가능]** — `quantity_sync_source.factor`, `quantity_sync_target.multiplier`·`rounding_mode`, `products.id/model_code`.

**⑥ 기본값**: 계산 함수 자체는 이미 앉혀진 factor/multiplier로 대상 수량을 산출할 뿐 — "(본체 model_code, 부자재 model_code, 수량)" 표 자체를 만드는 건 `quantity_sync_source`/`quantity_sync_target` 시드 행이며, 그 값은 §3 decisions_needed-1의 결정 사항. 현재 shadow 하네스(`quantity-sync-s03-shadow.mjs`)의 **테스트 픽스처**는 `target='ADP-F075SP'`, `source=fixture 내 이름에 '실링' 포함 행 전부`, `factor=1, multiplier=1`을 사용하지만 이는 **fixture 데이터일 뿐 실 시드가 아니다** — 실 카탈로그 대조 결과는 §3 참조.

### 2-3. `confirmLines`(+ 중첩 `L218`) — `clients/web/order-app/src/samhanApi.ts:207-235`

**① 함수명·위치**: `confirmLines(itemsArg)`, `samhanApi.ts:207-235`. (`L218`은 이 함수 본문 내부 지역변수로, 별도 함수가 아님.)

**② 법칙(조건→결과)**:

| 조건 | 결과 |
|---|---|
| `itemsArg`가 배열이 아니거나 `length===0` | throw "전송할 주문 품목이 없습니다" |
| `item.model` 공백 | throw "N번째 품목의 모델코드가 없습니다" |
| `item.section`(대문자 변환)이 `CONFIRM_CATEGORY_BY_SECTION`에 없음(`HOME`/`COMM`/`SINGLE`/`OLD` 이외) | throw "N번째 품목의 카테고리를 확인할 수 없습니다" |
| `item.qty`가 정수가 아니거나 1 미만 | throw "N번째 품목의 수량이 올바르지 않습니다" |
| 통과 | `{modelCode, categoryKey, quantity, remark}` 배열 반환(`remark`는 공백이면 `null`) |

**③ 상수 전부**: `CONFIRM_CATEGORY_BY_SECTION` 매핑 테이블(`samhanApi.ts:200-205`) — `HOME→'homemulti'`, `COMM→'commercialMulti'`, `SINGLE→'singleSets'`, `OLD→'oldProducts'` (레거시 GAS 시트/섹션 키 문자열 그대로 잔존).

**④ 읽는 속성**: `LegacyOrderItem.section`/`model`/`qty`/`remarks` — order-app 프런트가 만드는 주문 라인 payload 필드(레거시 index.html의 섹션 구분: `HOME`=가정용멀티, `COMM`=상업용멀티, `SINGLE`=싱글세트, `OLD`=구제품).

**⑤ 스키마 대응**: **[부분]**. `modelCode`→`products.model_code`(전역 유니크, `ux_products_model_code_active`)로 직접 조회 가능. `categoryKey`(`'homemulti'`/`'singleSets'`/`'commercialMulti'`/`'oldProducts'`)는 DB enum 값이 아니라 **부트스트랩 payload 키 이름**(`samhanApi.ts` 주석: `<?!= var ?>` 17종 중 `homemulti`/`singleSets`/…)이며, 대응 후보 컬럼은 두 개가 있고 서로 표기가 다르다:
  - `products.product_category` — `'OLD'`, `'SINGLE_SET'`, `'HOME_MULTI'`, `'COMMERCIAL_MULTI'`, `'SINGLE_PART'`, `'COMMERCIAL_PART'`, `'MATERIAL'` 지원(실측 `chk_pm_product_category`) — **`OLD`가 정확히 존재**.
  - `products.estimate_category` — `'HOME_MULTI'`, `'SINGLE_SET'`, `'COMMERCIAL_MULTI'`, `'LEGACY'`, `'OTHER'` 지원(실측 `chk_pm_estimate_category`) — `OLD` 없음(`LEGACY`/`OTHER`로 흡수해야 함).
  - ⚠️ **실측 발견 — 표기 불일치**: `quantity_sync_rule.estimate_category`는 `chk_qsr_category`로 `'COMM_MULTI'`를 쓰는데 `products.estimate_category`(`chk_pm_estimate_category`)는 `'COMMERCIAL_MULTI'`를 쓴다(같은 개념, 다른 문자열). §3 decisions_needed-3.

**⑥ 기본값**: 견적품목 기본값 설정 로직이 아니다 — "주문 확정 시 라인 검증 + 카테고리 매핑"이며 제품 기본값을 앉히지 않는다. `CONFIRM_CATEGORY_BY_SECTION`의 `OLD→'oldProducts'` 매핑을 어느 컬럼(`product_category`/`estimate_category`)으로 이식할지는 결정 필요 — §3 decisions_needed-3.

## 3. business_rule 외 항목 — 왜 business_rule이 아닌지

- **infra_util(18개)**: 날짜/문자열 정규화, API envelope 언랩, 페이지네이션, catalog lookup, 에러 객체 shape, Proxy/noop shim 구현 — 전부 도메인 상수(모델코드/할인율/HP 등)를 담지 않는 범용 배관(plumbing) 코드다. `fetchQuantitySyncRules`의 `'SINGLE_SET'` 리터럴만 업무 관련이나, 함수 자체는 "필터를 걸어 API를 부른다"는 순수 호출 래퍼라 business_rule로 승격하지 않았다.
- **ui_only(6개)**: `apiErrorMessage`(+ 중첩 4개)는 사용자에게 보여줄 에러 **문구**를 고르는 로직으로, 제품/수량/가격 계산이 아니라 텍스트 표시 UX다. `setLogo`(legacyShim.ts:149)는 DOM에 로고 `<img>` src를 넣고 폴백을 숨기는 순수 렌더링 로직이다. 스키마 이식 대상이 아니다.
- **dead_code(0개)**: §1 표 하단 grep/직접읽기 근거 참조 — 전 항목 활성 호출부 확인됨.

## 4. `main.ts` — 배선 역할(분류 대상 아님, 참고용)

`main.ts`(128줄, 인벤토리 함수 0개)는 `installLegacyShim` 동기 설치 → `mountOrderVersionGate` 마운트 → 부트스트랩 미선주입 시에만 비동기 fallback prefetch → PWA SW 등록의 4단계 진입 스크립트다. `window.__SAMHAN_QUANTITY_SYNC__.getQuantitySyncRules(catalog)`(line 61-83, 객체 메서드 축약형이라 기계 추출에 안 걸림)가 `samhanApi.fetchQuantitySyncRules()` → `selectSingleS03Rule` 을 연결하는 배선이지만, 이 메서드 자체는 상태 캐싱(`singleQuantitySyncState`)과 이벤트 발행(`samhan:quantity-sync-ready`)만 하고 §2-1/§2-2가 이미 그 규칙을 온전히 담고 있어 **중복 business_rule로 세지 않았다**(같은 규칙, 다른 호출 계층).

## 5. decisions-needed — 근거

DB 실측(읽기 전용, `samhan-postgres` / `product_db`):

```sql
-- quantity_sync_rule 활성 시드 0건, QA 잔재만 존재
SELECT rule_key, name, priority, is_deleted, created_by, created_at
FROM quantity_sync_rule ORDER BY rule_key, priority;
--  SINGLE_S03_CEILING_DRAIN_PUMP 2건 모두 is_deleted=t, name에 'QA996'/'QA R2' 포함

-- estimate_category 커버리지
SELECT estimate_category, count(*) FROM products WHERE status='ACTIVE' GROUP BY estimate_category;
--  ''(빈값) 3126 · COMMERCIAL_MULTI 2 · HOME_MULTI 2  (SINGLE_SET 0)

-- S-03 후보 실측
SELECT model_code, product_type, bundle_mode, goods_type, status FROM products
WHERE model_code IN ('ADP-F075SP','AC072BSCPBH2SY','AC090BSCPBH2SY','AC130BSCPHH2SY',
                      'AC145BSCPHH2SY','AC072BNCPBH1','AC090BNCPBH1','AC130BNCPHH1','AC145BNCPHH1');
--  ADP-F075SP(SINGLE,ACTIVE) · AC145BSCPHH2SY(BUNDLE/EXPAND,ACTIVE) · 나머지 BSCPBH2SY 3종(BUNDLE,DISCONTINUED)
--  · BNCPBH1 계열 4종(SINGLE,ACTIVE, 실내기 개별품)
```

상세 질문·후보·권고는 `decisions_needed` 구조화 출력 참조.

## 6. 이 조사가 다루지 않은 것 (배정 범위 밖)

- `clients/web/estimate-app/**`(GAS 원본 `index.ejs`/`code.js`/`db-catalog.js`/`slip-bridge.js`) — 다른 트랙 배정. `SS_CEILING_PUMP_ID`의 실제 "실링" 이름 매칭 소스 모집단(세트 레벨 vs 실내기 레벨)은 그쪽 조사 결과와 대조가 필요(§decisions_needed-1).
- `clients/mobile/**`, `clients/mobile-staff/**` webview shim — 다른 트랙 배정.
- `products.estimate_category` 전사 백필 — order-app 스코프 밖, 별도 분류 트랙 필요(§decisions_needed-2).
