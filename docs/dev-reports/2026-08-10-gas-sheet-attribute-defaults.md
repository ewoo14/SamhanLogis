# 구글 시트 품목 속성 → 견적품목 스키마 기본값 확정

- 조사일: 2026-08-10 (KST) · 조사자: 레거시 데이터 모델 조사 서브에이전트
- 지시: *"함수만 보지 말고 함수를 통해 구글 시트의 품목들의 기본값을 견적품목에서 어떻게 스키마로 설정할지도 확정해야함."* / *"이번에는 확실해야해."*
- 준수: 코드/스키마 변경 없음 · git 조작 없음 · 컨테이너 조작 없음 · **공유 DB 는 SELECT 만**
- 결론 수치: **총 속성 54 = 자동확정(이미 앉음) 39 + 자동확정(규칙 확정·구현만 필요) 8 + 🚩결정 필요 7**

---

## 0. 이 문서를 읽는 법 — 세 가지 판정 등급

| 등급 | 뜻 | 개발책임자 결정 필요? |
|---|---|---|
| **[자동·적재됨]** | 우리 스키마에 자리가 있고 **실제로 값이 들어와 있음**(DB 실측 확인) | 불필요 |
| **[자동·미적재]** | 앉힐 값과 규칙이 레거시 코드에 **확정**돼 있으나 현재 컬럼이 비었거나 키가 어긋남 | 불필요(구현/키 정합만) |
| **🚩[결정 필요]** | 앉힐 자리가 없거나, 두 자리 중 어느 쪽이 권위인지 / 원문을 보존할지가 **업무 판단** | **필요** |

---

## 1. 증거의 등급 — 무엇을 실측했고 무엇을 못 했는가

**직접 실측한 것**

| 증거 | 내용 | 재현 명령 |
|---|---|---|
| 시트 스냅샷 1개 | `docs/dev-reports/1008-r9-snapshot/single-components-A1-N1737.csv` — `싱글 구성품` 탭 A1:N1737, sha256 `405b2596…0663`, capturedAt 2026-08-02T22:40:29+09:00 (metadata.json) | 파일 직독 |
| 공유 DB (product_db) | 품목 3,084 · 사양 키 27종 · 구성품 1,598 | `docker exec samhan-postgres psql -U samhan -d product_db -c "…"` |
| 레거시 파서 | `clients/web/estimate-app/lib/code.js`, `views/index.ejs` | 파일 직독 |
| 우리 sync | `services/product-service/.../ProductSheetSyncService.java`, `EstimateCatalogInternalController.java` | 파일 직독 |

**실측하지 못한 것 — 정직 보고**

- **라이브 구글 시트에 직접 접근하지 못했다.** `GOOGLE_SERVICE_ACCOUNT_KEY` / `GOOGLE_SA_KEY_JSON_BASE64` 가 이 PC 어디에도 없다(`infrastructure/.env.local` 에 google/sheet 키워드 0건).
- 따라서 `홈멀티 / 싱글 세트 / 상업멀티 / 상업멀티 구성 / 구형` **5개 탭의 헤더 전량은 스냅샷으로 확정하지 못했다.** 이 5개 탭의 열 목록은 ①레거시가 읽는 헤더 ②우리 sync 가 읽는 헤더 ③그 결과로 DB 에 실제로 생긴 사양 키(=그 헤더가 시트에 존재했다는 역증거) 세 가지의 합집합이다.
- ⚠️ **"코드가 안 읽는 열"은 이 방법으로 셀 수 없다.** 실제로 유일하게 스냅샷이 있는 `싱글 구성품` 탭에서 **`모듈조합` 열이 그 사례로 잡혔다**(양쪽 코드 모두 미참조, 실측 28행 비어있지 않음). 나머지 5개 탭에도 같은 유형의 열이 있을 수 있으므로 §7 **D-7** 을 결정 항목으로 남긴다.
- 2026-08-08 보고서(`docs/dev-reports/2026-08-08-896-sheet-column-contract.md`)가 인용한 `live_sheet/*.csv` 스냅샷들은 **현재 이 워킹트리·홈 어디에도 없다**(`find . -type d -name "live_sheet*"` 0건). 그 보고서의 **열 문자(A/B/C…) 주장은 재현할 수 없으므로 본 문서는 인용만 하고 근거로 삼지 않는다.** 본 문서의 판정은 전부 위 4개 직접 증거로만 만들었다.

---

## 2. 대상 범위 — "품목마다 들고 있는 값"

품목 행을 가진 탭은 6개다. 우리 sync 의 `TAB_MAPPINGS`(ProductSheetSyncService.java:109-128) 와 레거시 상수(code.js:129-133) 가 같은 6개를 가리킨다.

| 코드 | 탭(정본 = `_단가인상`) | 인상 전 비교탭 | ProductCategory | UsageScope | 활성 품목(실측) |
|---|---|---|---|---|---|
| A | `홈멀티_단가인상` | `홈멀티` | HOME_MULTI | BOTH | 120 |
| B | `싱글 세트_단가인상` | `싱글 세트` | SINGLE_SET | BOTH | 276 |
| C | `싱글 구성품_단가인상` | `싱글 구성품` | SINGLE_PART | NONE | 346 |
| D | `상업멀티_단가인상` | `상업멀티` | COMMERCIAL_MULTI | BOTH | 342 |
| E | `상업멀티 구성_단가인상` | `상업멀티 구성` | COMMERCIAL_PART | NONE | **0** |
| F | `구형` | (없음) | OLD | BOTH | 37 |

> 실측: `SELECT product_category, lineage, count(*) FROM products WHERE is_deleted=false GROUP BY 1,2;`
> → SHEET 계보 1,121 (COMMERCIAL_MULTI 342 · HOME_MULTI 120 · OLD 37 · SINGLE_PART 346 · SINGLE_SET 276) + ECOUNT 계보 1,963 = 3,084.
> **E 탭 전용 품목 0** — 상업멀티 구성 탭의 모델은 전부 D 탭에도 있어 D 탭이 먼저 insert 하기 때문이다(TAB_MAPPINGS 순서 고정).

**품목 행이 아닌 탭**(참고, 본 축의 속성 계수에서 제외): `싱글 자재가격`(→ `material_price` 28행) · `추천실외기`(→ `odu_recommendation_lookup` 32행) · `분기계산`(→ `branch_pipe_lookup` 6행) · 홈멀티/싱글 세트 **1~2행 상단 기본값**(→ `dc_config_db.estimate_configs` 싱글턴, 이미 전량 이관 완료 — §8).

---

## 3. 속성 전건표 (54건)

각 행: ① 시트 이름·탭 → ② 레거시 사용처 → ③ 값의 도메인 → ④ 우리 스키마 대응 → ⑤ 견적품목 기본값.

### 3.1 식별·거래 열 (20건)

| # | 시트 열 (탭) | ② 레거시 사용처 | ③ 값의 도메인 (실측) | ④ 우리 스키마 | ⑤ 견적품목 기본값 |
|---|---|---|---|---|---|
| 1 | **품명** (A~F) | `code.js:769,784` `name`; 분류·표시의 입력 | 문자열 100% 비어있지 않음(싱글 구성품 1,735/1,735) | `products.name` | **[자동·적재됨]** insert=시트 품명. **update 시엔 DB 이름 보존**(`ProductSheetSyncService.java:1336-1340` — `nameDriftOccurrences` 만 증가). 표시명은 저장하지 않고 `sanitizeDisp_()` 로 화면에서 파생 |
| 2 | **모델명** (A~F) | `code.js:770,785` `model`; 모든 조인의 키 | 문자열 100% 비어있지 않음 | `products.model_code` (자연키) | **[자동·적재됨]** 시트 값 그대로. 공백이면 행 skip(`:1277-1280`) |
| 3 | **평형** (B,C) | `code.js:850,864` `normalizeSize_` → `size` | B탭: 숫자문자열. C탭 실측 880/1,735 비어있지 않음 | `products.pyong_size numeric(5,2)` | **[자동·적재됨]** B탭만 적재(`applyPyongSize`, SINGLE_SET 271/276). **C탭 평형은 레거시도 안 읽으므로 미적재가 정합** |
| 4 | **단위** (A~F) | `code.js:786,867,955,1051,1140` → `unit`. **`views/index.ejs:8487` 이 `unit==='SET'` 로 조합 실외기 분해 분기** | 싱글 구성품 실측: `EA` 853 · `대` 609 · `SET` 271 · `-` 2 | `products.unit varchar(20)` 존재 | **[자동·미적재]** 🔴 **현재 SHEET 품목 1,121건 전부 `EA`**(`SELECT lineage,unit,count(*)…` → SHEET/EA 1121, ECOUNT/EA 1963). sync 에 writer 자체가 없다(`grep changeUnit ProductSheetSyncService.java` → 0건). 규칙은 확정: 시트값 그대로 · 공백이면 B탭 `SET` / C·E탭 `EA` / A·D·F탭 `''`. **파급은 §6 참조 — 조합 실외기 84행의 부자재 산출이 어긋난다** |
| 5 | **대분류** (D) | `code.js:1042,1062-1064` — **시트 값이 코드 분류를 이긴다**: `const catL = catLFromSheet \|\| cls.catL` | 미실측(스냅샷 없음) | `products.cat_l_id → classification.name` | **[자동·미적재]** 우리 sync 는 `classifyCommercial()` 만 쓰고 시트 `대분류` 열을 읽지 않는다(`:1300-1301`). 규칙 확정: **시트 대분류가 있으면 그것이 catL** |
| 6 | **구분** (C,E) | `code.js:936,954` `kind`; UI 가 **한글 원문으로 정규식 판정**(`views/index.ejs:5089,5106,5193-5195` `/리모컨/.test(p.kind)`) | 싱글 구성품 실측 10종: 리모컨 320 · 자재 273 · 세트 271 · 실내기 271 · 실외기 271 · 판넬 250 · 벽걸이 67 · 부자재 9 · 기타 2 · 펌프 1 | `bundle_component.component_kind` **enum 6종** | 🚩**[결정 필요 D-1]** enum 6종(INDOOR/OUTDOOR/PANEL/REMOTE/FOOT/MATERIAL/ACCESSORY)으로 접히며 **벽걸이 67·부자재 9·기타 2·펌프 1 = 79행이 전부 `ACCESSORY`** 로 뭉친다(DB 실측 ACCESSORY 81 — 상업멀티 구성 기여분 포함). 게다가 API 가 **enum 이름**(`"REMOTE"`)을 반환해(`EstimateCatalogInternalController.java:348`) UI 의 한글 정규식이 `kind` 로는 안 맞고 `name` fallback 으로만 맞는다 |
| 7 | **세트** (C,E) | `code.js:941,948` `setModel`; 세트→구성품 필터 키 | 싱글 구성품 실측 1,451/1,735 비어있지 않음(빈 284 = 세트 헤더행 등, 레거시가 skip) | `bundle_component.bundle_product_id` + `products.parent_bundle_set_model` | **[자동·적재됨]** 부모 모델코드로 조회해 링크(`:364-372`). 부모/자식 미존재 시 조용히 skip |
| 8 | **구성품 특징** (C) | `code.js:942,958,963` `feat` + `isDefault = /기본/.test(feat)` | 실측 상위: 기본 855 · (공백) 277 · 자재 273 · 컬러유선리모컨 65 · 유선리모컨 63 · 공청 48 · 블랙 37 · 승강 37 · 사각/원형×색상 각 10 | `bundle_component.component_variant` + `is_default` | **[자동·적재됨]** DB 실측 `is_default=true` 857 · variant 값 분포가 시트와 일치. 판정은 `(variant+" "+구분).contains("기본")` (`:397`) |
| 9 | **수량** (C,E) | **C탭: 레거시·우리 둘 다 안 읽음.** E탭: `code.js:1128,1141` → `qty` 문자열, 화면이 `qtySet * (parseInt(qty)\|\|1)` | **C탭 실측: 823행이 `0`, 912행이 공백 — 1 이상인 값이 한 건도 없다.** E탭 미실측 | `bundle_component.default_qty` + `qty_mode` | 🚩**[결정 필요 D-2]** 현재 `FOLLOW_SET×1.00` 1,594 / `FOLLOW_SET×2.50` 2 / `FIXED` 2(QA 잔재). **개발책임자 규칙 "수량은 수량동기화 설정값이 정한다"** 를 어디까지 적용할지가 결정 대상 — §6 |
| 10 | **비고** (A,B,D,F) | `code.js:778,792,796` `note`; **`isBlockedByNote_()` 가 `미판매\|단종` 행을 카탈로그에서 통째로 제외**, `isSoldOutByNote_()` 가 `품절` 표시 | `단종` `미판매` `품절` + 그 밖의 자유 텍스트 | 상태 3종 → `products.status` / 원문 → `products.remark`(존재) | 🚩**[결정 필요 D-3]** 상태는 **[자동·적재됨]**(ACTIVE 1,019 · DISCONTINUED 83 · NOT_FOR_SALE 16 · OUT_OF_STOCK 3, `ProductStatus.fromSheetDisplay` 는 **정확일치만** 인정) 이고 카탈로그 쿼리가 DISCONTINUED/NOT_FOR_SALE 을 제외해 레거시와 정합(`ProductRepository.findExposedCatalog`). 그러나 **`products.remark` 는 3,084건 전부 비어 있다** — 3종 외 비고 원문이 통째로 소실된다 |
| 11 | **규격** (A,B,C,D,E,F) | `code.js:775,790`(품목) / `:943,959`(구성품) `spec`; 화면 규격 표시 · E탭에선 판매차단 텍스트 겸용(`:1148`) | 싱글 구성품 실측 1,361/1,735 비어있지 않음 | 품목 `products.spec_text` / 구성품 `bundle_component.spec_text` | **[자동·미적재]** 구성품은 **적재됨**(1,348/1,598). **품목은 `spec_text` 3,084건 전부 공백** — sync 에 writer 없음(`grep SpecText ProductSheetSyncService.java` → 0건). 그 결과 `oldProducts()` 의 `spec` 과 `multiCatalog()` 의 `spec` 이 DB 모드에서 항상 빈 문자열 |
| 12 | **고정DC** (A,D) | `code.js:777,791` → `'고정DC'`; 주문앱은 `useK2` 가 false 여도 고정DC 있으면 출고가 할인 계산 | `parseFixedDcRate` 정규화 후 실측 0.00×6 · 35×21 · 40×38 · 45×73 · 50×29 = **167건** | `products.fixed_discount_rate numeric(5,2)` **+ V36 `classification.fixed_discount_rate`** | 🚩**[결정 필요 D-4]** 품목 쪽은 **적재됨 167건**, **분류 쪽은 지정 0건**. 두 자리가 공존하는데 우선순위 계약이 없다 |
| 13 | **출고가** (A~F) | `code.js:776,788` `list`; 변동DC 켜지면 **할인 기준가** | 숫자(표시형 콤마) → `parseKRNumber_`/`parseDecimal` 동일 정규화 | `products.release_price numeric(12,2)` + `price_history` | **[자동·적재됨]** 정본탭 → `release_price` 및 `price_history(2026-04-01)`, 무접미사 탭 → `price_history(2000-01-01)` |
| 14 | **납품가 — 첫 번째 열** (B,C) | B탭: `code.js:856,869` 로 읽어 **`priceLeft` 지역변수에 담고 출력하지 않는다**. C탭: 위치만 수집하고 **값을 읽지 않는다**(`:938-939`) | **싱글 구성품 실측 1,191/1,735 행이 비어있지 않다** — 죽은 열이 아니라 "쓰이지 않는 열" | 🚩**없음** | 🚩**[결정 필요 D-5]** 담을 컬럼이 없다. 업무 의미가 코드 어디에도 없다(2026-08-08 보고서 §10-1 과 같은 결론에 독립 도달) |
| 15 | **납품가 — 마지막 열** (A~F) | `code.js:772-773,787` 등 — **중복 헤더 중 마지막**이 실행 가격 | 실측 1,733/1,735 비어있지 않음 | `products.delivery_price numeric(12,2)` | **[자동·적재됨]** ⚠️단, C탭에서 이 값은 레거시상 **(세트,구성품,특징) 행 문맥 가격**인데 우리 DB 는 구성품 모델 1개당 1행이라 문맥이 접힌다. 같은 구성품이 세트별로 다른 납품가를 가지면 마지막 sync 행이 이긴다 |
| 16 | **소계** (B,C,E) | 어느 코드도 읽지 않음 (`SPEC_EXCLUDE_HEADERS` 에 명시 차단) | 실측 1,464/1,735 비어있지 않음 | 없음(계산열) | **[자동·미적재]** 저장 불필요 — 견적 라인에서 수량×단가로 재계산. 보존 대상 아님 |
| 17 | **모듈조합** (C) | **어느 코드도 읽지 않음** — 우리 `SPEC_EXCLUDE_HEADERS` 에도 없어 "차단"조차 아니다 | 실측 28/1,735: `10+12` `12+12` … `12+12+22` 등 HP 조합 26종 + **`운임 직접입력` 1 · `마이너스 금액입력` 1** | 🚩**없음** | 🚩**[결정 필요 D-6]** 값의 절반은 조합 실외기의 HP 구성, 나머지 둘은 **처리 지시문**이다. 업무 의미를 추론하지 않고 확인받아야 한다 |
| 18 | **용량** (A,D) | `code.js:774,789-800` `parseKRFloat_` → `capacity`; 추천 실외기 매칭 입력 | 미실측(스냅샷 없음) | `product_spec(spec_key='용량')` 을 **컨트롤러가 읽도록 이미 배선돼 있다**(`EstimateCatalogInternalController.java:69,275` `SPEC_CAPACITY="용량"`) | **[자동·미적재]** 🔴 **`product_spec` 에 `용량` 키 0건** — sync 의 사양 매핑 목록(`loadHomeSpecs`/`loadCommercialSpecs`)에 `용량` 이 아예 없다. 결과적으로 DB 모드의 `capacity` 는 항상 0. 규칙은 자명(해당 열 → spec `용량`) |
| 19 | **최대 연결 실내기 대수** (A,D) | `code.js:779,793` → `maxIndoor` | 적재 실측 191건(HOME 10 · COMMERCIAL 180 · SINGLE 1) | `product_spec` — 적재 키 **`최대 연결 실내기 대수, 대`** ↔ 조회 키 **`최대연결실내기대수`** | **[자동·미적재]** 🔴 **키 불일치로 조회가 항상 null**. 적재 쪽(`ProductSheetSyncService.java:638-640`)과 조회 쪽(`EstimateCatalogInternalController.java:70,276`)이 다른 문자열을 쓴다. `spec_key_template` 정본은 `최대 연결 실내기 대수, 대`(HOME/COMMERCIAL 양쪽 등록) |
| 20 | **납품가 셀의 수식 마커** (A,B,D,F) | `$L$2`→`useK2`(변동DC) · `$D$7`/`$D$8`→`matKey` · 구형 F열 `$I$1`→`isDisc` | 실측 `has_variable_discount` 803 · `set_material_key` D4 84·D7 17·D8 5 · `legacy_discount_flag` 29 | `products.has_variable_discount` · `set_material_key` · `legacy_discount_flag` · `discount_flags` | **[자동·적재됨]** `discount_flags` 는 `100000` 8건 외 전부 `000000` |

### 3.2 사양 열 — 홈멀티(A)·상업멀티(D) 계열 (17건)

모두 `product_spec(product_id, spec_key, spec_value, unit, display_order)` 로 앉는다. **⑤ 기본값은 전부 [자동·적재됨]** 이며 아래 표의 "실측" 은 `SELECT p.product_category, s.spec_key, count(*) … GROUP BY 1,2` 결과다.

| # | 시트 열 | 앉는 spec_key | 실측 건수 (HOME / COMMERCIAL) |
|---|---|---|---|
| 21 | 배관경 | `배관경` | 67 / 269 |
| 22 | 냉방성능(정격) kcal/h | `냉방능력, kcal/h` | 71 / 298 |
| 23 | 냉방성능(정격) kW | `냉방능력, kW` | 67 / 280 |
| 24 | 소비전력(정격) | `냉방소비전력, kW` | 73 / 311 |
| 25 | 난방성능 (D, 2열) | `난방능력, kcal/h` · `난방능력, kW` | 22 / 242 |
| 26 | 냉매가스 | `냉매가스` | 68 / 280 |
| 27 | 에너지소비효율(등급) (A) | `에너지소비효율등급` | 9 / — |
| 28 | 소비효율등급 (D) | `소비효율등급` | — / 62 |
| 29 | 전원선 | `전원선, mm²` | 65 / 269 |
| 30 | 차단기 | `차단기, A` | 9 / 177 |
| 31 | 제품크기 | `제품크기, mm` | 106 / 218 |
| 32 | 제품중량 | `제품중량, kg` | 51 / — |
| 33 | 포장치수 | `포장치수, mm` | 57 / — |
| 34 | **포장중량** | `포장중량, kg` | **0 / 0** → **[자동·미적재]** (아래 주석) |
| 35 | 최대장배관 | `배관길이, m` | 9 / 177 |
| 36 | 최대고저차 | `고낙차, m` | 9 / 176 |
| 37 | 덕트구경 (D, ERV 레이아웃) | **`냉매가스`** 키로 저장 | 레거시 `gas: row[iDuct]` 와 동일 — 의도적 동형 |

> 🔴 **#34 `포장중량, kg` 은 실적재 0건이다.** 코드 매핑도 있고(`ProductSheetSyncService.java:632-633`) `spec_key_template` 에도 HOME/COMMERCIAL 양쪽 등록돼 있는데 행이 없다. 실측:
> `SELECT spec_key,count(*) FROM product_spec WHERE is_deleted=false AND (spec_key LIKE '포장%' OR spec_key LIKE '제품%' OR spec_key LIKE '실%포장%') GROUP BY 1;`
> → `실내기포장, mm` 271 · `실내기포장중량, kg` 271 · `실외기포장, mm` 271 · `제품중량, kg` 51 · `제품크기, mm` 335 · `포장치수, mm` 57. **`포장중량, kg` 과 `실외기포장중량, kg`(§3.3 #50) 두 개만 0이다.**
> 이 둘은 각 탭에서 **매핑된 물리 사양 열 중 가장 뒤쪽**이라는 공통점이 있다(홈멀티 `…제품크기·제품중량·포장치수·포장중량` / 싱글 `…실내기포장중량·실외기포장중량`). 우리 sync 의 DISPLAY 읽기 범위가 `!A1:Z`(26열)로 고정(`ProductSheetSyncService.java:1206`)인 반면 레거시는 `getDataRange()` 로 전열을 읽으므로 **Z 를 넘는 꼬리 열이 잘렸다는 가설이 두 건 모두를 설명한다.** 시트 헤더를 못 봤으므로 확정은 못 한다 — D-7 덤프로 함께 확인.

### 3.3 사양 열 — 싱글 세트(B) 전용 (14건)

| # | 시트 열 | 앉는 spec_key | 실측 (SINGLE_SET) | 판정 |
|---|---|---|---|---|
| 38 | 등급(냉방/난방) | `에너지소비효율등급` | 266 | [자동·적재됨] |
| 39 | 성능(kW)(최소/정격/최대) | `냉방능력, kW`(`\|` 앞) · `난방능력, kW`(뒤) | 271 / 106 | [자동·적재됨] |
| 40 | 성능(kcal/h)(최소/정격/최대) | `냉방능력, kcal/h` · `난방능력, kcal/h` | 271 / 106 | [자동·적재됨] |
| 41 | 소비전력(kW)(최소/정격/최대) | `냉방소비전력, kW` · `난방소비전력, kW` | 274 / 106 | [자동·적재됨] |
| 42 | 전원(mm²)/차단(A) | `전원선, mm²`(`/` 앞) · `차단기, A`(뒤) | 271 / 112 | [자동·적재됨] |
| 43 | 실내기 크기(mm) | `실내기크기, mm` | 271 | [자동·적재됨] |
| 44 | 실외기 크기(mm) | `실외기크기, mm` | 271 | [자동·적재됨] |
| 45 | 실내기 중량(kg) | `실내기중량, kg` | 269 | [자동·적재됨] |
| 46 | 실외기 중량(kg) | `실외기중량, kg` | 269 | [자동·적재됨] |
| 47 | 실내기 포장(mm) | `실내기포장, mm` | 269 | [자동·적재됨] |
| 48 | 실외기 포장(mm) | `실외기포장, mm` | 269 | [자동·적재됨] |
| 49 | 실내기 포장중량(kg) | `실내기포장중량, kg` | 269 | [자동·적재됨] |
| 50 | **실외기 포장중량(kg)** | `실외기포장중량, kg` | **0** | **[자동·미적재]** 🔴 코드 매핑도 있고(`ProductSheetSyncService.java:715-717`) `spec_key_template` 에도 등록돼 있는데 **실적재 0건**. 대칭인 #49 는 269건이므로 코드 문제는 아니다. 후보 원인 둘 — ⓐ 우리 sync 의 DISPLAY 읽기 범위가 `!A1:Z`(26열)라 Z 를 넘는 열이 잘린다(레거시는 `getDataRange()` 로 전열) ⓑ 시트에 값이 없다. **어느 쪽이든 업무 결정이 아니라 확인·구현 사항** |
| 51 | 배관길이/고낙차(m) | `배관길이, m`(`/` 앞) · `고낙차, m`(뒤) | 271 / 137 | [자동·적재됨] |

### 3.4 판넬 행 전용 (2건)

| # | 시트 열 | 앉는 spec_key | 실측 | 판정 |
|---|---|---|---|---|
| 52 | 타공사이즈 | `타공사이즈, mm` | 전체 50 — 활성 품목 기준 49 (HOME 29 · COMMERCIAL 12 · SINGLE_PART 8, 나머지 1건은 soft-delete 된 품목에 매달린 사양) | [자동·적재됨] |
| 53 | 전산볼트간격 | `전산볼트간격, mm` | 전체 50 — 활성 기준 49 (동일 분해) | [자동·적재됨] |

> 판넬 행(`isPanelRow`: 품명에 판넬/판널/패널 또는 모델이 `PC[0-9]…`)은 성능 열 위치를 타공/볼트 값으로 재해석한다. 레거시(`getSpecDetailMap_`)와 동형.

### 3.5 코드가 읽지 않는 열 (1건)

| # | 대상 | 판정 |
|---|---|---|
| 54 | **5개 탭(A·B·D·E·F)의 미참조 열 일반** | 🚩**[결정 필요 D-7]** `싱글 구성품` 한 탭에서만 실제로 1건(`모듈조합`)이 발견됐다. 나머지 탭은 스냅샷이 없어 **"없다"를 증명할 수 없다.** 헤더 전량 덤프 없이 이관하면 조용히 소실된다 |

---

## 4. 합계 검산

| 등급 | 건수 | 내역 |
|---|---|---|
| **[자동·적재됨]** | **39** | §3.1 8건(#1,2,3,7,8,13,15,20) + §3.2 16건(#21~37 중 #34 제외) + §3.3 13건 + §3.4 2건 |
| **[자동·미적재]** | **8** | §3.1 6건(#4 단위, #5 대분류, #11 규격, #16 소계, #18 용량, #19 최대연결실내기대수) + §3.2 1건(#34 포장중량) + §3.3 1건(#50 실외기 포장중량) |
| 🚩**[결정 필요]** | **7** | D-1 구분(#6) · D-2 수량(#9) · D-3 비고 원문(#10) · D-4 고정DC 권위(#12) · D-5 첫 납품가(#14) · D-6 모듈조합(#17) · D-7 미참조 열(#54) |
| **총계** | **54** | 39 + 8 + 7 = 54 ✅ |

---

## 5. "이미 앉아 있는 기본값" 한 장 요약 — 견적품목 신규 행이 시트에서 받는 값

시트 행 1개가 `products` 1행이 될 때 실제로 채워지는 것(`Product.seedFromSheet` + `syncTab`):

```
name            = 시트 품명                      (재sync 시 DB 이름 보존)
model_code      = 시트 모델명                    (자연키 · 공백이면 행 skip)
release_price   = 시트 출고가                    (parseDecimal: 콤마·₩ 제거)
delivery_price  = 시트 납품가(중복 시 마지막 열)
lineage         = SHEET                          (ECOUNT 행은 시트 등장 시 SHEET 로 승격)
product_type    = SINGLE                         (구성품 탭이 부모로 지목하면 BUNDLE + bundle_mode)
product_category= 탭 고정값                      (첫 등장 탭이 홈 탭으로 고정)
usage_scope     = 탭 고정값(BOTH/NONE)           (usage_scope_manual=true 면 동결)
status          = 비고 정확일치 3종 → 그 상태, 아니면 ACTIVE
pyong_size      = 싱글 세트 B열 평형             (그 외 탭 무동작)
has_variable_discount / set_material_key / legacy_discount_flag / fixed_discount_rate / discount_flags
                = 납품가 셀 수식 + 고정DC 열      (variable_discount_manual=true 면 5개 모두 동결)
cat_l_id/cat_m_id/cat_s_id = 품명·모델 분류기 결과 (classification_manual=true 면 동결)
panel_type / remote_type   = 품명·모델 분류기 결과 (SHEET 1,121건 중 panel_type 62 · remote_type 17 만 비어있지 않음)
display_order   = product_estimate_exposure.display_order (탭 내 유효행 순번 1부터)
estimate_category = products 에는 저장하지 않는다 (V18 이후 exposure 테이블이 단일 권위)
--- 아래는 시트에 값이 있어도 현재 채워지지 않는다 ---
unit            = 항상 'EA'      (시트 단위 미반영)
spec_text       = 항상 NULL      (시트 규격 미반영)
remark          = 항상 NULL      (시트 비고 원문 미반영)
```

> `estimate_category` 가 `seedFromSheet` 의 인자로 넘어오지만 **대입되지 않는다**(`Product.java:408-424`). 이는 결함이 아니라 V18 결정(`Product.java:521` Javadoc)의 잔여 시그니처다 — DB 실측도 3,084건 전부 NULL 이고 노출은 `product_estimate_exposure` 4종(COMMERCIAL_MULTI 416 · SINGLE_SET 288 · HOME_MULTI 123 · LEGACY 40)이 담당한다.

---

## 6. 수량 축 — 개발책임자 규칙 적용 결과

> **규칙: "수량은 구성품이나 이름에서 추론하지 않는다. 오로지 수량동기화 설정값이 정한다. 40HP는 2개로 설정했으면 그대로 나올 뿐임."**

### 6.1 레거시가 이름·HP 로 수량을 만드는 지점 — 전건

| 지점 | 파일:줄 | 하는 일 | 환원 형태 |
|---|---|---|---|
| `chooseBaseModel()` | `views/index.ejs:4150-4194` | 실외기 **품명의 HP 토큰 + 계열 키워드**(프라임/한랭지/표준형/냉방전용 상부토출/ECO/가스히트펌프/프레스티지·동시냉난방·공장전원)로 방진가대·일자발 모델을 고른다 | **(본체 model_code, 부자재 model_code, 수량) 표** — §6.3 에 313행 전건 산출 |
| `parseSetHPs()` + 단위 SET 분기 | `views/index.ejs:4143-4148`, `:8487-8497` | 조합 실외기 품명 괄호를 `+` 로 쪼개 **각 HP 조각마다** `chooseBaseModel` 을 돌린다 | 같은 표에 흡수(조각별 결과가 합산됨) |
| `countBranchForSet()` | `views/index.ejs:4219-4226` | 품명 괄호 안 `+` **개수**를 세어 T형 분기관(`AXJ-TA3419M`) 수량으로 삼는다 | 같은 표에 흡수 |
| `PUMP_MAP` | `views/index.ejs:8466-8479` | 실내기 모델코드 → 드레인펌프 모델코드 (이미 명시표) | **이미 (본체,부자재,1) 표** — 22쌍 |
| `RENEW_FILTER_MAP` | `views/index.ejs:4228-4231`, `:8506-8514` | 실외기 모델코드 → 리뉴얼 필터 (이미 명시표) | **이미 (본체,부자재,1) 표** — 4쌍 |
| `recomputeHomeBranches()` | `views/index.ejs:8272-8330` | 홈멀티 분기관: `b25 = 6HP단배관실외기수` · `b15 = 실내기수 − 단배관실외기수 − 6HP수`, **조건 `실내기≥2 AND 단배관실외기>0`** | **쌍 표로 환원 불가 — 집계 규칙** (§6.4) |

### 6.2 🔴 지금 이 파싱이 이미 어긋나 있다 (단위 미적재의 파급)

레거시는 `String(r.unit).toUpperCase()==='SET'` 일 때만 괄호 HP 분해 경로로 간다(`views/index.ejs:8487`). 그런데 **§3.1 #4 대로 DB 모드의 `unit` 은 항상 `EA`** 이므로 이 분기에 절대 진입하지 못한다.

실측(읽기 전용 재현 스크립트로 상업멀티 실외기 177행에 레거시 로직을 그대로 적용):

```
#outdoorRows            177     (model_code 가 AM…, 7번째 문자 X — isCommOutdoorRow)
#setComboRows            84     (품명에 괄호와 '+' 가 함께 있는 조합 실외기)
#rowsWithBaseOrBranch   177
#legacyVsDbModeDiff      84     ← 조합 실외기 84행 전건이 어긋난다
```

예(왼쪽=레거시 SET 경로, 오른쪽=현재 DB 모드):

```
AM220AXVHHR1SY  DVM S2 동시냉난방 22HP (10HP+12HP)
   레거시 : AXJ-TA3419M×1, 방진가대S2소×2
   DB모드 :                방진가대S2소×1        ← 분기관 누락 + 방진가대 1개 부족
AM260AXVHHH1SY  DVM S2 프라임 26HP (10HP+16HP)
   레거시 : AXJ-TA3419M×1, 방진가대S2소×1, 방진가대S2중×1
   DB모드 :                방진가대S2소×1, 방진가대S2중×1
```

**이 어긋남은 §6.3 의 설정값 표를 도입하면 파싱 자체가 사라지므로 함께 해소된다.** 반대로 표 없이 `unit` 만 채우면 파싱을 되살리는 셈이 되어 개발책임자 규칙에 어긋난다.

### 6.3 환원 결과 — (본체 model_code, 부자재 model_code, 수량) 설정값 표

산출 방법(재현 가능): `products` 에서 활성 COMMERCIAL_MULTI 342행을 SELECT → `views/index.ejs` 의 `isCommOutdoorRow`/`parseSetHPs`/`chooseBaseModel`/`countBranchForSet` 를 그대로 옮긴 스크립트에 투입 → 본체 1대당 부자재 수량으로 전개. **총 313쌍**(부록 A).

부자재 모델코드는 전부 실재한다(실측):

| 부자재 model_code | 품명 | 소속 |
|---|---|---|
| `방진가대S2소` / `방진가대S2중` / `방진가대S2대` | S2 방진가대 소/중/대 | COMMERCIAL_MULTI |
| `GHP방진가대` | GHP 방진가대 | COMMERCIAL_MULTI |
| `ACL-KORGHP07` | GHP 저감장치 | COMMERCIAL_MULTI |
| `AXJ-TA3419M` | T형 분기관 | COMMERCIAL_MULTI |
| `AF-R09A` / `AF-R12A` | ECO 리뉴얼 필터 | COMMERCIAL_MULTI |
| `SI-AL600a` / `SI-AL700a` | 실외기 일자발 (전면 4~6HP / 8~12HP) | **SINGLE_SET** ⚠️ |
| `AXJ-YA1509N` / `AXJ-YA2512N` | Y형 실내기 분기관 | HOME_MULTI |
| `AJ060MXHNBC1` | 실외기_6HP 단배관 | HOME_MULTI |

> ⚠️ `SI-AL600a/700a` 는 상업멀티 카탈로그에 없다. 레거시 `modelByNameLike()` 는 상업멀티 목록에서만 찾으므로 ECO 실외기의 일자발은 화면 반영 단계(`requireCommCatalogRow_`)에서 탈락한다. **설정값 표로 옮기면 카테고리 경계와 무관하게 지정되므로 이 결손도 함께 닫힌다** — 다만 "ECO 실외기에 일자발을 붙이는 게 맞는가"는 D-2 확인 항목.

**추가 표 2종(파싱 없음, 그대로 이식 가능)**

`PUMP_MAP` — 본체=실내기, 부자재=드레인펌프, 수량 1 (22쌍)

| 부자재 | 본체 model_code |
|---|---|
| `MDP-Z075SZED` | AM052DNLDBH1, AM072DNLDBH1 |
| `ADP-E075SEK3D` | AM100FNLDBH1 |
| `MDP-M075SGK2D` | AM130DNMDBH1, AM145DNMDBH1 |
| `ADP-G075SPK1D` | AM083DNMDBH1, AM100DNMDBH1, AM110DNMDBH1, AM052ANHDBH1, AM060ANHDBH1, AM072ANHDBH1, AM083ANHDBH1, AM100ANHDBH1, AM110ANHDBH1, AM130ANHDBH1, AM145ANHDBH1, AM230ANHDBH1 |
| `ADP-N047SNK1D` | AM290HNHDBH1 |
| `ADP-F075SP` | AM072TNCDBH1, AM110TNCDBH1, AM130TNCDBH1, AM145TNCDBH1 |

`RENEW_FILTER_MAP` — 본체=실외기, 부자재=필터, 수량 1 (4쌍)

| 부자재 | 본체 model_code |
|---|---|
| `AF-R09A` | AM035FXMRHC1, AM050MXMRBC1, AM050FXMRHC1 |
| `AF-R12A` | AM075FXMRHC1 |

### 6.4 쌍 표로 환원되지 않는 하나 — 홈멀티 분기관

```
b25(AXJ-2512N) = (6HP 단배관 실외기 수량)
b15(AXJ-1509N) = (실내기·벽걸이·에어콤보·전열교환기 수량 합) − (단배관 실외기 수량) − (6HP 단배관 수량)
단, 실내기합 ≥ 2 AND 단배관실외기 > 0 일 때만 계산, 아니면 둘 다 0. 음수는 0으로 절단.
```

`quantity_sync_rule` 스키마로는 **source(품목, factor) 다수 → target(품목, multiplier)** 형태라 뺄셈은 `factor=-1` 로 표현 가능하지만, **발화 조건(`실내기≥2 AND 단배관실외기>0`)과 음수 절단은 `condition_json` 에 무엇을 넣을지가 정해져 있지 않다.** → D-2 에 포함.

> 참고: `quantity_sync_rule` 현재 6행 중 **5행이 QA 잔재**(`QA996_*`, `SINGLE_S03_*` 2행, rule_key 중복 priority 1/999)이고 실사용 규칙은 `UI_HOME_MULTI_AM052BN6PBH1` 1행이다. 설정값 표를 채우기 전에 잔재 정리 여부도 함께 판단이 필요하다(본 조사는 읽기 전용이라 손대지 않았다).

---

## 7. 🚩 결정이 필요한 7건

| ID | 속성 | 질문 | 레거시가 하던 것 | 후보 | 권장 |
|---|---|---|---|---|---|
| **D-1** | 구분 (C·E탭) | 시트 `구분` 10종을 6종 enum 으로 접으면서 원문을 버릴 것인가 | 한글 원문을 그대로 실어 보내고 UI 가 정규식으로 판정 | ⓐ 원문 보존 컬럼 추가(`bundle_component.kind_raw`) ⓑ enum 확대(벽걸이/펌프/부자재/기타) ⓒ 현행 유지(ACCESSORY 로 뭉침) | **ⓐ** — enum 은 우리 로직용으로 두고 원문을 별도 보존. 시트가 새 구분을 추가해도 안 깨지고, API 가 한글 원문을 함께 실으면 UI 정규식(`/리모컨/.test(kind)`)이 되살아난다 |
| **D-2** | 수량 (C·E탭 + 자동 부자재) | 부자재 자동수량의 단일 권위를 수량동기화 설정값으로 옮길 때, ①상업멀티 구성 `수량` 열 ②홈멀티 분기관 조건절 ③싱글 구성품 `수량` 열(전건 0/공백)을 각각 어떻게 둘 것인가 | ①`parseInt\|\|1` 로 세트수량에 곱함 ②집계식+발화조건 ③아예 안 읽음 | ⓐ 셋 다 설정값으로 흡수(시트 수량열은 참고값) ⓑ ①만 시트 유지, ②③은 설정값 ⓒ 현행 유지 | **ⓐ** — "오로지 설정값이 정한다"는 지시에 유일하게 부합. 단 ②의 조건절(`실내기≥2 AND 단배관실외기>0`)·음수절단을 `condition_json` 규격으로 먼저 정의해야 한다 |
| **D-3** | 비고 원문 | 상태 3종(단종/미판매/품절) 외의 비고 텍스트를 보존할 것인가 | `note` 를 화면에 그대로 표시하고, 3종은 행 차단/표시에 사용 | ⓐ `products.remark` 에 원문 전량 보존(상태는 지금처럼 별도 파생) ⓑ 3종만 유지하고 원문 폐기(현행) | **ⓐ** — 컬럼이 이미 있고 비용이 0에 가깝다. 지금은 3,084건 전부 NULL 이라 "품절 사유·대체품 안내" 같은 텍스트가 소실 중 |
| **D-4** | 고정DC 권위 | 품목 `fixed_discount_rate`(167건) 와 V36 `classification.fixed_discount_rate`(0건) 중 무엇이 이기는가 | 시트 품목 열 하나뿐 — 분류 단위 고정DC 개념 자체가 없었다 | ⓐ 품목 > 분류(품목 값이 있으면 그것, 없으면 분류) ⓑ 분류 > 품목 ⓒ 분류는 신규 품목 초기값으로만 쓰고 계산에는 미참여 | **ⓐ** — 레거시 동작(품목 열)이 보존되고 분류는 "일괄 지정" 편의로만 작동. ⓑ 를 고르면 기존 167건의 값이 조용히 무시될 수 있다 |
| **D-5** | 첫 번째 납품가 열 | 담을 자리가 없는 이 열을 어떻게 할 것인가 (실측 1,191/1,735 비어있지 않음) | B탭은 읽고 버림, C탭은 읽지도 않음 | ⓐ 원시 보존 컬럼 신설 후 계산 미참여 ⓑ 폐기 ⓒ 의미 확정 후 정식 컬럼 부여 | **ⓐ 후 ⓒ** — 실행 재현에는 불필요하나 1,191행이 실제 값이라 폐기는 되돌릴 수 없다. **업무 의미는 추론 금지 — 시트 작성자 확인 필요** |
| **D-6** | 모듈조합 (C탭) | 어느 코드도 읽지 않는 이 열(28행)을 이관할 것인가 | 미사용 | ⓐ 확인 후 결정(보류) ⓑ 원시 보존 ⓒ 폐기 | **ⓐ** — 값 26종은 HP 조합이라 §6 의 설정값 표와 **중복 정의가 될 위험**이 있고, `운임 직접입력`·`마이너스 금액입력` 은 처리 지시문으로 보인다. 의미 확인 전 이관 금지 |
| **D-7** | 미참조 열 일반 | 5개 탭 헤더 전량 덤프를 뜰 것인가 | — | ⓐ 6개 탭 A1 행 전량 덤프 후 본 표와 대조(1회) ⓑ 현행 코드 참조 열만 이관 | **ⓐ** — `싱글 구성품` 단 한 탭에서 이미 미참조 열이 1건 나왔다. 덤프 없이 이관하면 "없어서 0" 인지 "안 보여서 0" 인지 구분할 수 없다. 서비스 계정 키 재발급/접근 승인 필요 |

---

## 8. 부수 확인 — 탭 상단 기본값은 이미 전량 이관 완료

`getHomeDefaults()`/`getSingleDefaults()`(홈멀티·싱글 세트 시트 1~2행)는 **품목 속성이 아니라 탭 단위 기본값**이며, 이미 `dc_config_db.estimate_configs` 싱글턴으로 옮겨져 있다(실측 1행, id `…0004`).

| 시트 라벨 | 컬럼 | 현재 값 |
|---|---|---|
| 유연호스 제외 / 분기관 제외 / 발통포함 | `home_no_hose` / `home_no_branch` / `home_with_foot` | false / false / false |
| 판넬변경(홈) | `home_default_panel` | `''` |
| 유선리모컨 / 리모컨 제외 / 실외기 받침대 포함 | `single_default_wired_remote` / `single_no_remote` / `single_with_base` | `''` / false / false |
| 판넬변경(싱글) / 360판넬 | `single_default_panel` / `single_panel_shape` | `''` / `원형` |
| 할인 / 1WAY할인 / 자재 포함 여부 | `single_discount` / `single_one_way_discount` / `single_material_inclusion` | 0 / 0 / `별도` |
| (시트 외 전역) | 홈·상업 공통DC 0.45 · 구형DC 0.5 · VAT 0.1 · 카드수수료 0.03 | 실측 일치 |

→ 본 축의 54건 계수에는 포함하지 않는다(품목 행의 열이 아님).

---

## 9. 재현 명령 모음

```powershell
# 품목/계보
docker exec samhan-postgres psql -U samhan -d product_db -c "SELECT product_category, lineage, count(*) FROM products WHERE is_deleted=false GROUP BY 1,2 ORDER BY 1,2;"
# 단위 (전건 EA 확인)
docker exec samhan-postgres psql -U samhan -d product_db -c "SELECT lineage, unit, count(*) FROM products WHERE is_deleted=false GROUP BY 1,2;"
# 규격/비고/평형/고정DC 채움률
docker exec samhan-postgres psql -U samhan -d product_db -c "SELECT product_category, count(*) FILTER (WHERE spec_text<>'') , count(*) FILTER (WHERE remark<>''), count(*) FILTER (WHERE pyong_size IS NOT NULL), count(*) FILTER (WHERE fixed_discount_rate IS NOT NULL), count(*) FROM products WHERE is_deleted=false AND lineage='SHEET' GROUP BY 1;"
# 사양 키 (27종) · 용량/최대연결 키 부재
docker exec samhan-postgres psql -U samhan -d product_db -c "SELECT spec_key, count(*) FROM product_spec WHERE is_deleted=false GROUP BY 1 ORDER BY 2 DESC;"
docker exec samhan-postgres psql -U samhan -d product_db -c "SELECT count(*) FROM product_spec WHERE is_deleted=false AND spec_key IN ('용량','최대연결실내기대수');"
# 구성품 수량/구분/기본
docker exec samhan-postgres psql -U samhan -d product_db -c "SELECT qty_mode, default_qty, count(*) FROM bundle_component WHERE is_deleted=false GROUP BY 1,2;"
docker exec samhan-postgres psql -U samhan -d product_db -c "SELECT component_kind, count(*) FROM bundle_component WHERE is_deleted=false GROUP BY 1 ORDER BY 2 DESC;"
```

싱글 구성품 스냅샷 열별 채움/도메인은 `docs/dev-reports/1008-r9-snapshot/single-components-A1-N1737.csv` 를 CSV 파싱해 재현(헤더 14열 · 데이터 1,735행 · sha256 은 같은 폴더 `metadata.json`).

---

## 부록 A. 상업멀티 실외기 → 부자재 설정값 표 (313쌍, 본체 1대당)

> 산출: 활성 COMMERCIAL_MULTI 342행 중 `isCommOutdoorRow` 177행에 레거시 `chooseBaseModel`/`parseSetHPs`/`countBranchForSet` 를 그대로 적용. 조합 실외기는 괄호 HP 조각별 결과를 합산했다(레거시 SET 경로 기준). **이 표를 등록하면 §6.1 의 이름·HP 파싱은 전부 폐기 가능하다.**

| 본체 model_code | 본체 품명 | 부자재 model_code | 수량 |
|---|---|---|---|
| AM035FXMRHC1 | DVM ECO 리뉴얼 3.5HP 삼상형 | SI-AL600a | 1 |
| AM040BXMDBH1 | DVM ECO 냉난방 4HP 단상형 | SI-AL600a | 1 |
| AM040BXMDHH1 | DVM ECO 냉난방 4HP 삼상형 | SI-AL600a | 1 |
| AM040FXMDBC1 | DVM ECO 냉방전용 4HP 단상형 | SI-AL600a | 1 |
| AM050BXMDHH1 | DVM ECO 냉난방 5HP 삼상형 | SI-AL600a | 1 |
| AM050FXMDBC1 | DVM ECO 냉방전용 5HP 단상형 | SI-AL600a | 1 |
| AM050FXMRHC1 | DVM ECO 리뉴얼 5HP 삼상형 | SI-AL600a | 1 |
| AM050MXMRBC1 | DVM ECO 리뉴얼 5HP 단상형 | SI-AL600a | 1 |
| AM050TXMDBH1 | DVM ECO 냉난방 5HP 단상형 | SI-AL600a | 1 |
| AM060BXMDHH1 | DVM ECO 냉난방 6HP 삼상형 | SI-AL600a | 1 |
| AM060TXMDBC1 | DVM ECO 냉방전용 6HP 단상형 | SI-AL600a | 1 |
| AM060TXMDBH1 | DVM ECO 냉난방 6HP 단상형 | SI-AL600a | 1 |
| AM075FXMRHC1 | DVM ECO 리뉴얼 7.5HP 삼상형 | SI-AL700a | 1 |
| AM080AXVGHC1 | DVM S2 냉방전용 상부토출 8HP | 방진가대S2소 | 1 |
| AM080AXVGHH1 | DVM S2 표준형 8HP | 방진가대S2소 | 1 |
| AM080AXVHHH1 | DVM S2 프라임 8HP | 방진가대S2소 | 1 |
| AM080AXVHHR1 | DVM S2 동시냉난방 8HP | 방진가대S2소 | 1 |
| AM080AXVHJH1 | DVM S2 공장전원 8HP | 방진가대S2소 | 1 |
| AM080AXVSHH1 | DVM S2 고효율한랭지 8HP | 방진가대S2소 | 1 |
| AM080AXVUHH1 | DVM S2 프레스티지 8HP | 방진가대S2소 | 1 |
| AM080KXMDHH1 | DVM ECO 냉난방 8HP 삼상형 | SI-AL700a | 1 |
| AM080MXMDHC1 | DVM ECO 냉방전용 8HP 삼상형 | SI-AL700a | 1 |
| AM100AXVGHC1 | DVM S2 냉방전용 상부토출 10HP | 방진가대S2소 | 1 |
| AM100AXVGHH1 | DVM S2 표준형 10HP | 방진가대S2소 | 1 |
| AM100AXVHHH1 | DVM S2 프라임 10HP | 방진가대S2소 | 1 |
| AM100AXVHHR1 | DVM S2 동시냉난방 10HP | 방진가대S2소 | 1 |
| AM100AXVHJH1 | DVM S2 공장전원 10HP | 방진가대S2소 | 1 |
| AM100AXVSHH1 | DVM S2 고효율한랭지 10HP | 방진가대S2소 | 1 |
| AM100AXVUHH1 | DVM S2 프레스티지 10HP | 방진가대S2소 | 1 |
| AM100KXMDHH1 | DVM ECO 냉난방 10HP 삼상형 | SI-AL700a | 1 |
| AM100MXMDHC1 | DVM ECO 냉방전용 10HP 삼상형 | SI-AL700a | 1 |
| AM120AXVGHC1 | DVM S2 냉방전용 상부토출 12HP | 방진가대S2소 | 1 |
| AM120AXVGHH1 | DVM S2 표준형 12HP | 방진가대S2소 | 1 |
| AM120AXVHHH1 | DVM S2 프라임 12HP | 방진가대S2소 | 1 |
| AM120AXVHHR1 | DVM S2 동시냉난방 12HP | 방진가대S2소 | 1 |
| AM120AXVHJH1 | DVM S2 공장전원 12HP | 방진가대S2소 | 1 |
| AM120AXVSHH1 | DVM S2 고효율한랭지 12HP | 방진가대S2소 | 1 |
| AM120AXVUHH1 | DVM S2 프레스티지 12HP | 방진가대S2소 | 1 |
| AM120KXMDHH1 | DVM ECO 냉난방 12HP 삼상형 | SI-AL700a | 1 |
| AM120MXMDHC1 | DVM ECO 냉방전용 12HP 삼상형 | SI-AL700a | 1 |
| AM120MXVRHC1 | DVM ECO 리뉴얼 12HP 상부토출형 | SI-AL700a | 1 |
| AM140AXVGHC1 | DVM S2 냉방전용 상부토출 14HP | 방진가대S2소 | 1 |
| AM140AXVGHH1 | DVM S2 표준형 14HP | 방진가대S2소 | 1 |
| AM140AXVHHH1 | DVM S2 프라임 14HP | 방진가대S2중 | 1 |
| AM140AXVHHR1 | DVM S2 동시냉난방 14HP | 방진가대S2중 | 1 |
| AM140AXVHJH1 | DVM S2 공장전원 14HP | 방진가대S2중 | 1 |
| AM140AXVSHH1 | DVM S2 고효율한랭지 14HP | 방진가대S2중 | 1 |
| AM140AXVUHH1 | DVM S2 프레스티지 14HP | 방진가대S2중 | 1 |
| AM140MXMDHC1 | DVM ECO 냉방전용 14HP 삼상형 | SI-AL700a | 1 |
| AM160AXVGHC1 | DVM S2 냉방전용 상부토출 16HP | 방진가대S2중 | 1 |
| AM160AXVGHH1 | DVM S2 표준형 16HP | 방진가대S2중 | 1 |
| AM160AXVHHH1 | DVM S2 프라임 16HP | 방진가대S2중 | 1 |
| AM160AXVHHR1 | DVM S2 동시냉난방 16HP | 방진가대S2중 | 1 |
| AM160AXVHJH1 | DVM S2 공장전원 16HP | 방진가대S2중 | 1 |
| AM160AXVSHH1 | DVM S2 고효율한랭지 16HP | 방진가대S2중 | 1 |
| AM160AXVUHH1 | DVM S2 프레스티지 16HP | 방진가대S2중 | 1 |
| AM160NXGGBH1 | GHP 가스히트펌프 16HP | ACL-KORGHP07 | 1 |
| AM160NXGGBH1 | GHP 가스히트펌프 16HP | GHP방진가대 | 1 |
| AM180AXVGHC1 | DVM S2 냉방전용 상부토출 18HP | 방진가대S2중 | 1 |
| AM180AXVGHH1 | DVM S2 표준형 18HP | 방진가대S2중 | 1 |
| AM180AXVHHH1 | DVM S2 프라임 18HP | 방진가대S2중 | 1 |
| AM180AXVHHR1 | DVM S2 동시냉난방 18HP | 방진가대S2중 | 1 |
| AM180AXVHJH1 | DVM S2 공장전원 18HP | 방진가대S2중 | 1 |
| AM180AXVSHH1 | DVM S2 고효율한랭지 18HP | 방진가대S2중 | 1 |
| AM180AXVUHH1 | DVM S2 프레스티지 18HP | 방진가대S2중 | 1 |
| AM200AXVGHC1 | DVM S2 냉방전용 상부토출 20HP | 방진가대S2중 | 1 |
| AM200AXVGHH1 | DVM S2 표준형 20HP | 방진가대S2중 | 1 |
| AM200AXVHHH1 | DVM S2 프라임 20HP | 방진가대S2중 | 1 |
| AM200AXVHHR1 | DVM S2 동시냉난방 20HP | 방진가대S2중 | 1 |
| AM200AXVHJH1 | DVM S2 공장전원 20HP | 방진가대S2중 | 1 |
| AM200AXVSHH1 | DVM S2 고효율한랭지 20HP | 방진가대S2중 | 1 |
| AM200AXVUHH1 | DVM S2 프레스티지 20HP | 방진가대S2중 | 1 |
| AM200NXGGBH1 | GHP 가스히트펌프 20HP | ACL-KORGHP07 | 1 |
| AM200NXGGBH1 | GHP 가스히트펌프 20HP | GHP방진가대 | 1 |
| AM220AXVGHC1 | DVM S2 냉방전용 상부토출 22HP | 방진가대S2중 | 1 |
| AM220AXVGHH1 | DVM S2 표준형 22HP | 방진가대S2중 | 1 |
| AM220AXVHHH1 | DVM S2 프라임 22HP | 방진가대S2대 | 1 |
| AM220AXVHHR1SY | DVM S2 동시냉난방 22HP (10HP+12HP) | AXJ-TA3419M | 1 |
| AM220AXVHHR1SY | DVM S2 동시냉난방 22HP (10HP+12HP) | 방진가대S2소 | 2 |
| AM220AXVHJH1SY | DVM S2 공장전원 22HP (10HP+12HP) | AXJ-TA3419M | 1 |
| AM220AXVHJH1SY | DVM S2 공장전원 22HP (10HP+12HP) | 방진가대S2소 | 2 |
| AM220AXVSHH1 | DVM S2 고효율한랭지 22HP | 방진가대S2중 | 1 |
| AM220AXVUHH1SY | DVM S2 프레스티지 22HP (10HP+12HP) | AXJ-TA3419M | 1 |
| AM220AXVUHH1SY | DVM S2 프레스티지 22HP (10HP+12HP) | 방진가대S2소 | 2 |
| AM240AXVGHC1 | DVM S2 냉방전용 상부토출 24HP | 방진가대S2중 | 1 |
| AM240AXVGHH1 | DVM S2 표준형 24HP | 방진가대S2중 | 1 |
| AM240AXVHHH1 | DVM S2 프라임 24HP | 방진가대S2대 | 1 |
| AM240AXVHHR1SY | DVM S2 동시냉난방 24HP (12HP+12HP) | AXJ-TA3419M | 1 |
| AM240AXVHHR1SY | DVM S2 동시냉난방 24HP (12HP+12HP) | 방진가대S2소 | 2 |
| AM240AXVHJH1SY | DVM S2 공장전원 24HP (12HP+12HP) | AXJ-TA3419M | 1 |
| AM240AXVHJH1SY | DVM S2 공장전원 24HP (12HP+12HP) | 방진가대S2소 | 2 |
| AM240AXVSHH1 | DVM S2 고효율한랭지 24HP | 방진가대S2중 | 1 |
| AM240AXVUHH1SY | DVM S2 프레스티지 24HP (12HP+12HP) | AXJ-TA3419M | 1 |
| AM240AXVUHH1SY | DVM S2 프레스티지 24HP (12HP+12HP) | 방진가대S2소 | 2 |
| AM250NXGGBH1 | GHP 가스히트펌프 25HP | ACL-KORGHP07 | 1 |
| AM250NXGGBH1 | GHP 가스히트펌프 25HP | GHP방진가대 | 1 |
| AM260AXVGHC1 | DVM S2 냉방전용 상부토출 26HP | 방진가대S2중 | 1 |
| AM260AXVGHH1 | DVM S2 표준형 26HP | 방진가대S2중 | 1 |
| AM260AXVHHH1SY | DVM S2 프라임 26HP (10HP+16HP) | AXJ-TA3419M | 1 |
| AM260AXVHHH1SY | DVM S2 프라임 26HP (10HP+16HP) | 방진가대S2소 | 1 |
| AM260AXVHHH1SY | DVM S2 프라임 26HP (10HP+16HP) | 방진가대S2중 | 1 |
| AM260AXVHHR1SY | DVM S2 동시냉난방 26HP (10HP+16HP) | AXJ-TA3419M | 1 |
| AM260AXVHHR1SY | DVM S2 동시냉난방 26HP (10HP+16HP) | 방진가대S2소 | 1 |
| AM260AXVHHR1SY | DVM S2 동시냉난방 26HP (10HP+16HP) | 방진가대S2중 | 1 |
| AM260AXVHJH1SY | DVM S2 공장전원 26HP (10HP+16HP) | AXJ-TA3419M | 1 |
| AM260AXVHJH1SY | DVM S2 공장전원 26HP (10HP+16HP) | 방진가대S2소 | 1 |
| AM260AXVHJH1SY | DVM S2 공장전원 26HP (10HP+16HP) | 방진가대S2중 | 1 |
| AM260AXVSHH1SY | DVM S2 고효율한랭지 26HP (12HP+14HP) | AXJ-TA3419M | 1 |
| AM260AXVSHH1SY | DVM S2 고효율한랭지 26HP (12HP+14HP) | 방진가대S2소 | 1 |
| AM260AXVSHH1SY | DVM S2 고효율한랭지 26HP (12HP+14HP) | 방진가대S2중 | 1 |
| AM260AXVUHH1SY | DVM S2 프레스티지 26HP (10HP+16HP) | AXJ-TA3419M | 1 |
| AM260AXVUHH1SY | DVM S2 프레스티지 26HP (10HP+16HP) | 방진가대S2소 | 1 |
| AM260AXVUHH1SY | DVM S2 프레스티지 26HP (10HP+16HP) | 방진가대S2중 | 1 |
| AM280AXVGHC1 | DVM S2 냉방전용 상부토출 28HP | 방진가대S2중 | 1 |
| AM280AXVGHH1 | DVM S2 표준형 28HP | 방진가대S2중 | 1 |
| AM280AXVHHH1SY | DVM S2 프라임 28HP (10HP+18HP) | AXJ-TA3419M | 1 |
| AM280AXVHHH1SY | DVM S2 프라임 28HP (10HP+18HP) | 방진가대S2소 | 1 |
| AM280AXVHHH1SY | DVM S2 프라임 28HP (10HP+18HP) | 방진가대S2중 | 1 |
| AM280AXVHHR1SY | DVM S2 동시냉난방 28HP (10HP+18HP) | AXJ-TA3419M | 1 |
| AM280AXVHHR1SY | DVM S2 동시냉난방 28HP (10HP+18HP) | 방진가대S2소 | 1 |
| AM280AXVHHR1SY | DVM S2 동시냉난방 28HP (10HP+18HP) | 방진가대S2중 | 1 |
| AM280AXVHJH1SY | DVM S2 공장전원 28HP (10HP+18HP) | AXJ-TA3419M | 1 |
| AM280AXVHJH1SY | DVM S2 공장전원 28HP (10HP+18HP) | 방진가대S2소 | 1 |
| AM280AXVHJH1SY | DVM S2 공장전원 28HP (10HP+18HP) | 방진가대S2중 | 1 |
| AM280AXVSHH1SY | DVM S2 고효율한랭지 28HP (08HP+20HP) | AXJ-TA3419M | 1 |
| AM280AXVSHH1SY | DVM S2 고효율한랭지 28HP (08HP+20HP) | 방진가대S2중 | 1 |
| AM280AXVUHH1SY | DVM S2 프레스티지 28HP (10HP+18HP) | AXJ-TA3419M | 1 |
| AM280AXVUHH1SY | DVM S2 프레스티지 28HP (10HP+18HP) | 방진가대S2소 | 1 |
| AM280AXVUHH1SY | DVM S2 프레스티지 28HP (10HP+18HP) | 방진가대S2중 | 1 |
| AM300AXVGHC1 | DVM S2 냉방전용 상부토출 30HP | 방진가대S2중 | 1 |
| AM300AXVGHH1 | DVM S2 표준형 30HP | 방진가대S2대 | 1 |
| AM300AXVHHH1SY | DVM S2 프라임 30HP (10HP+20HP) | AXJ-TA3419M | 1 |
| AM300AXVHHH1SY | DVM S2 프라임 30HP (10HP+20HP) | 방진가대S2소 | 1 |
| AM300AXVHHH1SY | DVM S2 프라임 30HP (10HP+20HP) | 방진가대S2중 | 1 |
| AM300AXVHHR1SY | DVM S2 동시냉난방 30HP (10HP+20HP) | AXJ-TA3419M | 1 |
| AM300AXVHHR1SY | DVM S2 동시냉난방 30HP (10HP+20HP) | 방진가대S2소 | 1 |
| AM300AXVHHR1SY | DVM S2 동시냉난방 30HP (10HP+20HP) | 방진가대S2중 | 1 |
| AM300AXVHJH1SY | DVM S2 공장전원 30HP (10HP+20HP) | AXJ-TA3419M | 1 |
| AM300AXVHJH1SY | DVM S2 공장전원 30HP (10HP+20HP) | 방진가대S2소 | 1 |
| AM300AXVHJH1SY | DVM S2 공장전원 30HP (10HP+20HP) | 방진가대S2중 | 1 |
| AM300AXVSHH1SY | DVM S2 고효율한랭지 30HP (10HP+20HP) | AXJ-TA3419M | 1 |
| AM300AXVSHH1SY | DVM S2 고효율한랭지 30HP (10HP+20HP) | 방진가대S2소 | 1 |
| AM300AXVSHH1SY | DVM S2 고효율한랭지 30HP (10HP+20HP) | 방진가대S2중 | 1 |
| AM300AXVUHH1SY | DVM S2 프레스티지 30HP (10HP+20HP) | AXJ-TA3419M | 1 |
| AM300AXVUHH1SY | DVM S2 프레스티지 30HP (10HP+20HP) | 방진가대S2소 | 1 |
| AM300AXVUHH1SY | DVM S2 프레스티지 30HP (10HP+20HP) | 방진가대S2중 | 1 |
| AM300JXGGBH1 | GHP 가스히트펌프 30HP | ACL-KORGHP07 | 1 |
| AM300JXGGBH1 | GHP 가스히트펌프 30HP | GHP방진가대 | 1 |
| AM320AXVGHC1 | DVM S2 냉방전용 상부토출 32HP | 방진가대S2대 | 1 |
| AM320AXVGHH1 | DVM S2 표준형 32HP | 방진가대S2대 | 1 |
| AM320AXVHHH1SY | DVM S2 프라임 32HP (12HP+20HP) | AXJ-TA3419M | 1 |
| AM320AXVHHH1SY | DVM S2 프라임 32HP (12HP+20HP) | 방진가대S2소 | 1 |
| AM320AXVHHH1SY | DVM S2 프라임 32HP (12HP+20HP) | 방진가대S2중 | 1 |
| AM320AXVHHR1SY | DVM S2 동시냉난방 32HP (12HP+20HP) | AXJ-TA3419M | 1 |
| AM320AXVHHR1SY | DVM S2 동시냉난방 32HP (12HP+20HP) | 방진가대S2소 | 1 |
| AM320AXVHHR1SY | DVM S2 동시냉난방 32HP (12HP+20HP) | 방진가대S2중 | 1 |
| AM320AXVHJH1SY | DVM S2 공장전원 32HP (12HP+20HP) | AXJ-TA3419M | 1 |
| AM320AXVHJH1SY | DVM S2 공장전원 32HP (12HP+20HP) | 방진가대S2소 | 1 |
| AM320AXVHJH1SY | DVM S2 공장전원 32HP (12HP+20HP) | 방진가대S2중 | 1 |
| AM320AXVSHH1SY | DVM S2 고효율한랭지 32HP (12HP+20HP) | AXJ-TA3419M | 1 |
| AM320AXVSHH1SY | DVM S2 고효율한랭지 32HP (12HP+20HP) | 방진가대S2소 | 1 |
| AM320AXVSHH1SY | DVM S2 고효율한랭지 32HP (12HP+20HP) | 방진가대S2중 | 1 |
| AM320AXVUHH1SY | DVM S2 프레스티지 32HP (12HP+20HP) | AXJ-TA3419M | 1 |
| AM320AXVUHH1SY | DVM S2 프레스티지 32HP (12HP+20HP) | 방진가대S2소 | 1 |
| AM320AXVUHH1SY | DVM S2 프레스티지 32HP (12HP+20HP) | 방진가대S2중 | 1 |
| AM320NXGGBH1 | GHP 가스히트펌프 32HP | ACL-KORGHP07 | 1 |
| AM320NXGGBH1 | GHP 가스히트펌프 32HP | GHP방진가대 | 1 |
| AM340AXVGHC1 | DVM S2 냉방전용 상부토출 34HP | 방진가대S2대 | 1 |
| AM340AXVGHH1 | DVM S2 표준형 34HP | 방진가대S2대 | 1 |
| AM340AXVHHH1SY | DVM S2 프라임 34HP (14HP+20HP) | AXJ-TA3419M | 1 |
| AM340AXVHHH1SY | DVM S2 프라임 34HP (14HP+20HP) | 방진가대S2중 | 2 |
| AM340AXVHHR1SY | DVM S2 동시냉난방 34HP (14HP+20HP) | AXJ-TA3419M | 1 |
| AM340AXVHHR1SY | DVM S2 동시냉난방 34HP (14HP+20HP) | 방진가대S2중 | 2 |
| AM340AXVHJH1SY | DVM S2 공장전원 34HP (14HP+20HP) | AXJ-TA3419M | 1 |
| AM340AXVHJH1SY | DVM S2 공장전원 34HP (14HP+20HP) | 방진가대S2중 | 2 |
| AM340AXVSHH1SY | DVM S2 고효율한랭지 34HP (10HP+24HP) | AXJ-TA3419M | 1 |
| AM340AXVSHH1SY | DVM S2 고효율한랭지 34HP (10HP+24HP) | 방진가대S2소 | 1 |
| AM340AXVSHH1SY | DVM S2 고효율한랭지 34HP (10HP+24HP) | 방진가대S2중 | 1 |
| AM340AXVUHH1SY | DVM S2 프레스티지 34HP (14HP+20HP) | AXJ-TA3419M | 1 |
| AM340AXVUHH1SY | DVM S2 프레스티지 34HP (14HP+20HP) | 방진가대S2중 | 2 |
| AM360AXVGHC1SY | DVM S2 냉방전용 상부토출 36HP (14HP+22HP) | AXJ-TA3419M | 1 |
| AM360AXVGHC1SY | DVM S2 냉방전용 상부토출 36HP (14HP+22HP) | 방진가대S2소 | 1 |
| AM360AXVGHC1SY | DVM S2 냉방전용 상부토출 36HP (14HP+22HP) | 방진가대S2중 | 1 |
| AM360AXVGHH1SY | DVM S2 표준형 36HP (12HP+24HP) | AXJ-TA3419M | 1 |
| AM360AXVGHH1SY | DVM S2 표준형 36HP (12HP+24HP) | 방진가대S2소 | 1 |
| AM360AXVGHH1SY | DVM S2 표준형 36HP (12HP+24HP) | 방진가대S2중 | 1 |
| AM360AXVHHH1SY | DVM S2 프라임 36HP (18HP+18HP) | AXJ-TA3419M | 1 |
| AM360AXVHHH1SY | DVM S2 프라임 36HP (18HP+18HP) | 방진가대S2중 | 2 |
| AM360AXVHHR1SY | DVM S2 동시냉난방 36HP (18HP+18HP) | AXJ-TA3419M | 1 |
| AM360AXVHHR1SY | DVM S2 동시냉난방 36HP (18HP+18HP) | 방진가대S2중 | 2 |
| AM360AXVHJH1SY | DVM S2 공장전원 36HP (18HP+18HP) | AXJ-TA3419M | 1 |
| AM360AXVHJH1SY | DVM S2 공장전원 36HP (18HP+18HP) | 방진가대S2중 | 2 |
| AM360AXVSHH1SY | DVM S2 고효율한랭지 36HP (16HP+20HP) | AXJ-TA3419M | 1 |
| AM360AXVSHH1SY | DVM S2 고효율한랭지 36HP (16HP+20HP) | 방진가대S2중 | 2 |
| AM360AXVUHH1SY | DVM S2 프레스티지 36HP (18HP+18HP) | AXJ-TA3419M | 1 |
| AM360AXVUHH1SY | DVM S2 프레스티지 36HP (18HP+18HP) | 방진가대S2중 | 2 |
| AM360NXGGBH1S | GHP 가스히트펌프 36HP (16HP+20HP) | ACL-KORGHP07 | 2 |
| AM360NXGGBH1S | GHP 가스히트펌프 36HP (16HP+20HP) | AXJ-TA3419M | 1 |
| AM360NXGGBH1S | GHP 가스히트펌프 36HP (16HP+20HP) | GHP방진가대 | 2 |
| AM380AXVGHC1SY | DVM S2 냉방전용 상부토출 38HP (14HP+24HP) | AXJ-TA3419M | 1 |
| AM380AXVGHC1SY | DVM S2 냉방전용 상부토출 38HP (14HP+24HP) | 방진가대S2소 | 1 |
| AM380AXVGHC1SY | DVM S2 냉방전용 상부토출 38HP (14HP+24HP) | 방진가대S2중 | 1 |
| AM380AXVGHH1SY | DVM S2 표준형 38HP (14HP+24HP) | AXJ-TA3419M | 1 |
| AM380AXVGHH1SY | DVM S2 표준형 38HP (14HP+24HP) | 방진가대S2소 | 1 |
| AM380AXVGHH1SY | DVM S2 표준형 38HP (14HP+24HP) | 방진가대S2중 | 1 |
| AM380AXVHHH1SY | DVM S2 프라임 38HP (18HP+20HP) | AXJ-TA3419M | 1 |
| AM380AXVHHH1SY | DVM S2 프라임 38HP (18HP+20HP) | 방진가대S2중 | 2 |
| AM380AXVHHR1SY | DVM S2 동시냉난방 38HP (18HP+20HP) | AXJ-TA3419M | 1 |
| AM380AXVHHR1SY | DVM S2 동시냉난방 38HP (18HP+20HP) | 방진가대S2중 | 2 |
| AM380AXVHJH1SY | DVM S2 공장전원 38HP (18HP+20HP) | AXJ-TA3419M | 1 |
| AM380AXVHJH1SY | DVM S2 공장전원 38HP (18HP+20HP) | 방진가대S2중 | 2 |
| AM380AXVSHH1SY | DVM S2 고효율한랭지 38HP (18HP+20HP) | AXJ-TA3419M | 1 |
| AM380AXVSHH1SY | DVM S2 고효율한랭지 38HP (18HP+20HP) | 방진가대S2중 | 2 |
| AM380AXVUHH1SY | DVM S2 프레스티지 38HP (18HP+20HP) | AXJ-TA3419M | 1 |
| AM380AXVUHH1SY | DVM S2 프레스티지 38HP (18HP+20HP) | 방진가대S2중 | 2 |
| AM400AXVGHC1SY | DVM S2 냉방전용 상부토출 40HP (12HP+28HP) | AXJ-TA3419M | 1 |
| AM400AXVGHC1SY | DVM S2 냉방전용 상부토출 40HP (12HP+28HP) | 방진가대S2소 | 1 |
| AM400AXVGHC1SY | DVM S2 냉방전용 상부토출 40HP (12HP+28HP) | 방진가대S2중 | 1 |
| AM400AXVGHH1SY | DVM S2 표준형 40HP (20HP+20HP) | AXJ-TA3419M | 1 |
| AM400AXVGHH1SY | DVM S2 표준형 40HP (20HP+20HP) | 방진가대S2중 | 2 |
| AM400AXVHHH1SY | DVM S2 프라임 40HP (20HP+20HP) | AXJ-TA3419M | 1 |
| AM400AXVHHH1SY | DVM S2 프라임 40HP (20HP+20HP) | 방진가대S2중 | 2 |
| AM400AXVHHR1SY | DVM S2 동시냉난방 40HP (20HP+20HP) | AXJ-TA3419M | 1 |
| AM400AXVHHR1SY | DVM S2 동시냉난방 40HP (20HP+20HP) | 방진가대S2중 | 2 |
| AM400AXVHJH1SY | DVM S2 공장전원 40HP (20HP+20HP) | AXJ-TA3419M | 1 |
| AM400AXVHJH1SY | DVM S2 공장전원 40HP (20HP+20HP) | 방진가대S2중 | 2 |
| AM400AXVSHH1SY | DVM S2 고효율한랭지 40HP (20HP+20HP) | AXJ-TA3419M | 1 |
| AM400AXVSHH1SY | DVM S2 고효율한랭지 40HP (20HP+20HP) | 방진가대S2중 | 2 |
| AM400AXVUHH1SY | DVM S2 프레스티지 40HP (20HP+20HP) | AXJ-TA3419M | 1 |
| AM400AXVUHH1SY | DVM S2 프레스티지 40HP (20HP+20HP) | 방진가대S2중 | 2 |
| AM400NXGGBH1S | GHP 가스히트펌프 40HP (20HP+20HP) | ACL-KORGHP07 | 2 |
| AM400NXGGBH1S | GHP 가스히트펌프 40HP (20HP+20HP) | AXJ-TA3419M | 1 |
| AM400NXGGBH1S | GHP 가스히트펌프 40HP (20HP+20HP) | GHP방진가대 | 2 |
| AM420AXVGHC1SY | DVM S2 냉방전용 상부토출 42HP (14HP+28HP) | AXJ-TA3419M | 1 |
| AM420AXVGHC1SY | DVM S2 냉방전용 상부토출 42HP (14HP+28HP) | 방진가대S2소 | 1 |
| AM420AXVGHC1SY | DVM S2 냉방전용 상부토출 42HP (14HP+28HP) | 방진가대S2중 | 1 |
| AM420AXVGHH1SY | DVM S2 표준형 42HP (20HP+22HP) | AXJ-TA3419M | 1 |
| AM420AXVGHH1SY | DVM S2 표준형 42HP (20HP+22HP) | 방진가대S2중 | 2 |
| AM420AXVHHH1SY | DVM S2 프라임 42HP (10HP+12HP+20HP) | AXJ-TA3419M | 2 |
| AM420AXVHHH1SY | DVM S2 프라임 42HP (10HP+12HP+20HP) | 방진가대S2소 | 2 |
| AM420AXVHHH1SY | DVM S2 프라임 42HP (10HP+12HP+20HP) | 방진가대S2중 | 1 |
| AM420AXVHHR1SY | DVM S2 동시냉난방 42HP (10HP+12HP+20HP) | AXJ-TA3419M | 2 |
| AM420AXVHHR1SY | DVM S2 동시냉난방 42HP (10HP+12HP+20HP) | 방진가대S2소 | 2 |
| AM420AXVHHR1SY | DVM S2 동시냉난방 42HP (10HP+12HP+20HP) | 방진가대S2중 | 1 |
| AM420AXVHJH1SY | DVM S2 공장전원 42HP (10HP+12HP+20HP) | AXJ-TA3419M | 2 |
| AM420AXVHJH1SY | DVM S2 공장전원 42HP (10HP+12HP+20HP) | 방진가대S2소 | 2 |
| AM420AXVHJH1SY | DVM S2 공장전원 42HP (10HP+12HP+20HP) | 방진가대S2중 | 1 |
| AM420AXVSHH1SY | DVM S2 고효율한랭지 42HP (18HP+24HP) | AXJ-TA3419M | 1 |
| AM420AXVSHH1SY | DVM S2 고효율한랭지 42HP (18HP+24HP) | 방진가대S2중 | 2 |
| AM420AXVUHH1SY | DVM S2 프레스티지 42HP (10HP+12HP+20HP) | AXJ-TA3419M | 2 |
| AM420AXVUHH1SY | DVM S2 프레스티지 42HP (10HP+12HP+20HP) | 방진가대S2소 | 2 |
| AM420AXVUHH1SY | DVM S2 프레스티지 42HP (10HP+12HP+20HP) | 방진가대S2중 | 1 |
| AM440AXVGHC1SY | DVM S2 냉방전용 상부토출 44HP (14HP+30HP) | AXJ-TA3419M | 1 |
| AM440AXVGHC1SY | DVM S2 냉방전용 상부토출 44HP (14HP+30HP) | 방진가대S2소 | 1 |
| AM440AXVGHC1SY | DVM S2 냉방전용 상부토출 44HP (14HP+30HP) | 방진가대S2중 | 1 |
| AM440AXVGHH1SY | DVM S2 표준형 44HP (20HP+24HP) | AXJ-TA3419M | 1 |
| AM440AXVGHH1SY | DVM S2 표준형 44HP (20HP+24HP) | 방진가대S2중 | 2 |
| AM440AXVHHH1SY | DVM S2 프라임 44HP (12HP+12HP+20HP) | AXJ-TA3419M | 2 |
| AM440AXVHHH1SY | DVM S2 프라임 44HP (12HP+12HP+20HP) | 방진가대S2소 | 2 |
| AM440AXVHHH1SY | DVM S2 프라임 44HP (12HP+12HP+20HP) | 방진가대S2중 | 1 |
| AM440AXVHHR1SY | DVM S2 동시냉난방 44HP (12HP+12HP+20HP) | AXJ-TA3419M | 2 |
| AM440AXVHHR1SY | DVM S2 동시냉난방 44HP (12HP+12HP+20HP) | 방진가대S2소 | 2 |
| AM440AXVHHR1SY | DVM S2 동시냉난방 44HP (12HP+12HP+20HP) | 방진가대S2중 | 1 |
| AM440AXVHJH1SY | DVM S2 공장전원 44HP (12HP+12HP+20HP) | AXJ-TA3419M | 2 |
| AM440AXVHJH1SY | DVM S2 공장전원 44HP (12HP+12HP+20HP) | 방진가대S2소 | 2 |
| AM440AXVHJH1SY | DVM S2 공장전원 44HP (12HP+12HP+20HP) | 방진가대S2중 | 1 |
| AM440AXVSHH1SY | DVM S2 고효율한랭지 44HP (20HP+24HP) | AXJ-TA3419M | 1 |
| AM440AXVSHH1SY | DVM S2 고효율한랭지 44HP (20HP+24HP) | 방진가대S2중 | 2 |
| AM440AXVUHH1SY | DVM S2 프레스티지 44HP (12HP+12HP+20HP) | AXJ-TA3419M | 2 |
| AM440AXVUHH1SY | DVM S2 프레스티지 44HP (12HP+12HP+20HP) | 방진가대S2소 | 2 |
| AM440AXVUHH1SY | DVM S2 프레스티지 44HP (12HP+12HP+20HP) | 방진가대S2중 | 1 |
| AM450NXGGBH1S | GHP 가스히트펌프 45HP (20HP+25HP) | ACL-KORGHP07 | 2 |
| AM450NXGGBH1S | GHP 가스히트펌프 45HP (20HP+25HP) | AXJ-TA3419M | 1 |
| AM450NXGGBH1S | GHP 가스히트펌프 45HP (20HP+25HP) | GHP방진가대 | 2 |
| AM460AXVGHC1SY | DVM S2 냉방전용 상부토출 46HP (22HP+24HP) | AXJ-TA3419M | 1 |
| AM460AXVGHC1SY | DVM S2 냉방전용 상부토출 46HP (22HP+24HP) | 방진가대S2중 | 2 |
| AM460AXVGHH1SY | DVM S2 표준형 46HP (22HP+24HP) | AXJ-TA3419M | 1 |
| AM460AXVGHH1SY | DVM S2 표준형 46HP (22HP+24HP) | 방진가대S2중 | 2 |
| AM460AXVHHH1SY | DVM S2 프라임 46HP (12HP+16HP+18HP) | AXJ-TA3419M | 2 |
| AM460AXVHHH1SY | DVM S2 프라임 46HP (12HP+16HP+18HP) | 방진가대S2소 | 1 |
| AM460AXVHHH1SY | DVM S2 프라임 46HP (12HP+16HP+18HP) | 방진가대S2중 | 2 |
| AM460AXVHHR1SY | DVM S2 동시냉난방 46HP (12HP+16HP+18HP) | AXJ-TA3419M | 2 |
| AM460AXVHHR1SY | DVM S2 동시냉난방 46HP (12HP+16HP+18HP) | 방진가대S2소 | 1 |
| AM460AXVHHR1SY | DVM S2 동시냉난방 46HP (12HP+16HP+18HP) | 방진가대S2중 | 2 |
| AM460AXVHJH1SY | DVM S2 공장전원 46HP (12HP+16HP+18HP) | AXJ-TA3419M | 2 |
| AM460AXVHJH1SY | DVM S2 공장전원 46HP (12HP+16HP+18HP) | 방진가대S2소 | 1 |
| AM460AXVHJH1SY | DVM S2 공장전원 46HP (12HP+16HP+18HP) | 방진가대S2중 | 2 |
| AM460AXVSHH1SY | DVM S2 고효율한랭지 46HP (22HP+24HP) | AXJ-TA3419M | 1 |
| AM460AXVSHH1SY | DVM S2 고효율한랭지 46HP (22HP+24HP) | 방진가대S2중 | 2 |
| AM460AXVUHH1SY | DVM S2 프레스티지 46HP (12HP+16HP+18HP) | AXJ-TA3419M | 2 |
| AM460AXVUHH1SY | DVM S2 프레스티지 46HP (12HP+16HP+18HP) | 방진가대S2소 | 1 |
| AM460AXVUHH1SY | DVM S2 프레스티지 46HP (12HP+16HP+18HP) | 방진가대S2중 | 2 |
| AM480AXVGHC1SY | DVM S2 냉방전용 상부토출 48HP (24HP+24HP) | AXJ-TA3419M | 1 |
| AM480AXVGHC1SY | DVM S2 냉방전용 상부토출 48HP (24HP+24HP) | 방진가대S2중 | 2 |
| AM480AXVGHH1SY | DVM S2 표준형 48HP (24HP+24HP) | AXJ-TA3419M | 1 |
| AM480AXVGHH1SY | DVM S2 표준형 48HP (24HP+24HP) | 방진가대S2중 | 2 |
| AM480AXVHHH1SY | DVM S2 프라임 48HP (12HP+16HP+20HP) | AXJ-TA3419M | 2 |
| AM480AXVHHH1SY | DVM S2 프라임 48HP (12HP+16HP+20HP) | 방진가대S2소 | 1 |
| AM480AXVHHH1SY | DVM S2 프라임 48HP (12HP+16HP+20HP) | 방진가대S2중 | 2 |
| AM480AXVHHR1SY | DVM S2 동시냉난방 48HP (12HP+16HP+20HP) | AXJ-TA3419M | 2 |
| AM480AXVHHR1SY | DVM S2 동시냉난방 48HP (12HP+16HP+20HP) | 방진가대S2소 | 1 |
| AM480AXVHHR1SY | DVM S2 동시냉난방 48HP (12HP+16HP+20HP) | 방진가대S2중 | 2 |
| AM480AXVHJH1SY | DVM S2 공장전원 48HP (12HP+16HP+20HP) | AXJ-TA3419M | 2 |
| AM480AXVHJH1SY | DVM S2 공장전원 48HP (12HP+16HP+20HP) | 방진가대S2소 | 1 |
| AM480AXVHJH1SY | DVM S2 공장전원 48HP (12HP+16HP+20HP) | 방진가대S2중 | 2 |
| AM480AXVUHH1SY | DVM S2 프레스티지 48HP (12HP+16HP+20HP) | AXJ-TA3419M | 2 |
| AM480AXVUHH1SY | DVM S2 프레스티지 48HP (12HP+16HP+20HP) | 방진가대S2소 | 1 |
| AM480AXVUHH1SY | DVM S2 프레스티지 48HP (12HP+16HP+20HP) | 방진가대S2중 | 2 |
| AM500AXVGHC1SY | DVM S2 냉방전용 상부토출 50HP (22HP+28HP) | AXJ-TA3419M | 1 |
| AM500AXVGHC1SY | DVM S2 냉방전용 상부토출 50HP (22HP+28HP) | 방진가대S2중 | 2 |
| AM500NXGGBH1S | GHP 가스히트펌프 50HP (25HP+25HP) | ACL-KORGHP07 | 2 |
| AM500NXGGBH1S | GHP 가스히트펌프 50HP (25HP+25HP) | AXJ-TA3419M | 1 |
| AM500NXGGBH1S | GHP 가스히트펌프 50HP (25HP+25HP) | GHP방진가대 | 2 |
