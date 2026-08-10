# #896 옵션 명칭 통일 정찰 보고서

- 조사일: 2026-08-10 (Asia/Seoul)
- 작업 브랜치: `feat/896-option-naming-unify`
- 기준 커밋: `61078f7d9`
- 범위: `estimate-app`, `order-app`, Desktop, product/slip/dc-config/partner-order 서비스, 시트 동기화, 테스트·QA 계약, 운영 DB 읽기
- 실행 범위: 조사만 수행. 소스 구현·Docker 재시작·DB 쓰기·commit/add/push는 수행하지 않았다.

## 1. 결론

1. 상업멀티 리모컨은 이미 정본 축의 값인 `제외·무선·유선·컬러유선`을 사용한다. 선언은 `clients/web/estimate-app/views/index.ejs:6638`, `clients/web/order-app/index.html:4323`에 있다. 상업멀티의 현재 기본값도 `무선`이며 `clients/web/estimate-app/views/index.ejs:4092`, `clients/web/order-app/index.html:2446`에서 읽는다.
2. 홈멀티와 싱글중대형은 단순 라벨 교체로 끝나지 않는다. 홈의 `기본`은 `무선`이라는 한 값이 아니라 360·인피니트·1/4way·벽걸이별 기본 모델을 고르는 분기다(`clients/web/estimate-app/views/index.ejs:8252-8267`). 싱글의 `유선리모컨`/`컬러유선리모컨`은 FE와 BE 모두에 별도 문자열 비교가 있다(`clients/web/estimate-app/views/index.ejs:5090-5094`, `services/product-service/src/main/java/com/samhanair/logis/product/service/BundleExpander.java:268-289`).
3. 옵션 JSON 저장은 실제로 존재한다. 최신 측정에서 `slip_lines` 활성 302건 중 `bundle_set_options`가 있는 행은 20건이며, 20건 모두 `remoteOption=null`, `remoteExcluded=false`, `panelOption`은 `null` 16건·`블랙판넬` 4건이었다(측정 시각 2026-08-10 17:17:43.883976+09). 저장 컬럼은 `V114__preserve_bundle_set_options.sql:1-3`와 `services/slip-service/src/main/java/com/samhanair/logis/slip/domain/SlipLine.java:150-152`에 근거한다.
4. 현재 활성 `estimate_lines`는 35건 중 옵션 JSON 0건이었다(같은 측정 시각). 기존 견적 revision도 47건 중 옵션 키가 있는 snapshot 0건이었다(측정 시각 2026-08-10 17:18:10.114365+09). 다만 저장 컬럼 자체는 존재하며 기존 행을 null로 유지하도록 추가됐다(`V115__preserve_estimate_bundle_set_options.sql:1-3`, `EstimateLine.java:147-149`).
5. `partner_orders`에는 옵션 컬럼이 없다. 주문 라인은 상품명·모델명·category_key·remark를 저장한다(`services/partner-order-service/src/main/resources/db/migration/V1__init_partner_order.sql:60-80`). revision snapshot의 `리모컨` 문자열은 현재 snapshot의 옵션 키가 아니라 `lines[].productName` 등 상품 스냅샷에서 발생한다. 실제 snapshot top-level/line key 측정 결과에는 옵션 키가 없고 `productName`만 있었다(측정 시각 2026-08-10 17:18:22.420315+09). 따라서 주문 revision의 상품명 `유선리모컨`을 옵션 값 마이그레이션 대상으로 세면 안 된다.
6. 판넬의 공통 축은 아직 완전히 성립하지 않는다. product 정본 축은 `일반·공청·블랙·승강·360`이며(`ProductAttributeClassifier.java:35-47`), 현재 활성 DB에도 `인피니트`나 `동작감지` 값이 없다(측정 시각 2026-08-10 17:17:43.884067+09). 홈의 `인피니트 25년형`과 `인피니트 공청+동작감지 AI`, 상업의 `동작감지`는 현재 `panel_type` 값이 아니라 모델 코드 선택 분기다(`clients/web/estimate-app/views/index.ejs:8190-8202`, `clients/web/estimate-app/views/index.ejs:8631-8649`). 이 세 의미를 어떻게 보존할지는 개발책임자 확인이 필요하다.

## 2. 정본 축과 현재 DB 실측

### 2.1 product 정본 축

`ProductAttributeClassifier`는 판넬을 `공청·블랙·승강·360·일반`, 리모컨을 `컬러유선·유선·무선`으로 분류한다(`services/product-service/src/main/java/com/samhanair/logis/product/service/ProductAttributeClassifier.java:28-61`). 시트 동기화는 시트에서 읽은 품목명·모델코드로 이 분류기를 호출하고 product 속성을 갱신한다(`services/product-service/src/main/java/com/samhanair/logis/product/service/ProductSheetSyncService.java:1216`, `:1327`, `:1566-1574`). 즉 시트 동기화가 UI 옵션 문자열을 그대로 저장하는 경로는 확인되지 않았고, 품목명·모델코드가 정본 축으로 변환된다.

활성 product DB 분포(측정 시각 **2026-08-10 17:17:43.884067+09**):

| 축 | 값 | 건수 |
|---|---:|---:|
| `remote_type` | 빈 값 | 3,044 |
| `remote_type` | `무선` | 14 |
| `remote_type` | `유선` | 3 |
| `remote_type` | `컬러유선` | 0 |
| `panel_type` | 빈 값 | 3,000 |
| `panel_type` | `일반` | 28 |
| `panel_type` | `공청` | 16 |
| `panel_type` | `블랙` | 6 |
| `panel_type` | `승강` | 6 |
| `panel_type` | `360` | 5 |
| `panel_type` | `인피니트`/`동작감지` | 0 |

컬럼은 `services/product-service/src/main/resources/db/migration/V21__add_product_attribute_types.sql:4-14`에 추가됐다.

### 2.2 설정 저장

`estimate_configs`에는 홈 리모컨 기본값이나 상업 기본값 컬럼이 없다. 현재 명칭 관련 컬럼은 `home_default_panel`, `single_default_wired_remote`, `single_no_remote`, `single_default_panel`이다(`services/dc-config-service/src/main/resources/db/migration/V5__add_estimate_option_defaults.sql:4-16`). 현재 활성 설정 측정(**2026-08-10 17:17:43.896065+09**)은 홈 판넬 빈 값, 싱글 유선 리모컨 빈 값, `single_no_remote=false`, 싱글 판넬 빈 값, 360 형상 `원형`이었다.

estimate-app은 DB config에서 홈 리모컨을 `선택 안함`으로 고정하고(`clients/web/estimate-app/lib/code.js:1216-1224`), 화면에서 이를 `기본`으로 보정한다(`clients/web/estimate-app/views/index.ejs:7802-7804`). 싱글은 `singleDefaultWiredRemote`와 `singleNoRemote`를 각각 legacy 키로 변환한다(`clients/web/estimate-app/lib/code.js:1256-1268`). 따라서 홈 리모컨 기본값을 DB로 통일하려면 기존 컬럼만 이름 변경해서는 부족하다.

order-app은 `partner_order_bootstrap_cache`의 `homeDefaults`·`singleDefaults`를 사용한다(`clients/web/order-app/index.html:1360-1361`, `:1436`). 현재 cache 실측(**2026-08-10 17:17:43.893674+09**)은 `homeDefaults={}`, `singleDefaults={}`, `config={"vatRate":0.1,"deliveryDays":3}`였다. 시드도 두 defaults를 빈 객체로 시작한다(`services/partner-order-service/src/main/resources/db/migration/V2__seed_bootstrap_cache.sql:6-16`).

이번 검색에서 `COMM_DEFAULTS`라는 별도 저장 객체는 확인하지 못했다. 상업 기본값은 renderer가 `기본판넬`·`무선`으로 직접 reset/render한다(`clients/web/estimate-app/views/index.ejs:6636-6638`, `:10144-10146`, `clients/web/order-app/index.html:4314-4323`).

## 3. 값 선언·읽기·변환 경로 전수

### 3.1 estimate-app

| 영역 | 파일:줄 | 현재 계약 및 읽기 경로 |
|---|---|---|
| 홈 선언 | `clients/web/estimate-app/views/index.ejs:7802-7805` | 리모컨 label `리모컨`, 값 `기본·유선·컬러·제외`; 판넬 값 `''·판넬제외·공청판넬·인피니트 25년형·인피니트 공청+동작감지 AI` |
| 상업 선언 | `clients/web/estimate-app/views/index.ejs:6636-6638` | 판넬 `판넬제외·기본판넬·블랙판넬·승강판넬·공청판넬·동작감지`; 리모컨 `제외·무선·유선·컬러유선` |
| 싱글 선언 | `clients/web/estimate-app/views/index.ejs:7846-7851` | label `유선리모컨`, 값 `''·유선리모컨·컬러유선리모컨`; 별도 `리모컨 제외`; 판넬 `''·판넬제외·블랙판넬·승강판넬·공청판넬` |
| 홈 리모컨 계산 | `clients/web/estimate-app/views/index.ejs:8233-8268` | `제외`는 return; `기본`은 360/인피니트/1·4way/벽걸이별 기본 모델; 그 밖은 `유선`이면 WE, 나머지는 WG |
| 홈 판넬 계산 | `clients/web/estimate-app/views/index.ejs:8173-8205` | `공청판넬`·AI 여부로 공청/AI 모델을 고르고, 인피니트 25년형은 대형만 별도 modelCode를 선택 |
| 싱글 리모컨 선택 | `clients/web/estimate-app/views/index.ejs:5090-5095` | 오직 `유선리모컨`·`컬러유선리모컨` 문자열을 품목 feature/name과 비교 |
| 싱글 판넬 선택 | `clients/web/estimate-app/views/index.ejs:5110-5120` | 빈 값은 기본 panel, `판넬제외`는 null, 나머지는 old label 정규식으로 선택 |
| 싱글 가격/전개 | `clients/web/estimate-app/views/index.ejs:5147-5175` | `remoteExcluded`가 true면 선택 리모컨보다 먼저 기본 리모컨 금액을 제외; false일 때만 old remote 값을 치환 |
| 싱글 파생 수량 | `clients/web/estimate-app/views/index.ejs:8014-8015` | 체크박스가 false이고 old wired remote 값일 때 유선보드 파생 수량 생성 |
| 싱글 cross-product 회귀 | `clients/web/estimate-app/views/index.ejs:6074-6075` | panels/remotes 배열에 old 값이 직접 고정 |
| 상업 리모컨 읽기 | `clients/web/estimate-app/views/index.ejs:4092-4110`, `:8519-8522` | `제외·무선·유선·컬러유선`을 modelCode와 제외 분기로 변환 |
| 상업 판넬 읽기 | `clients/web/estimate-app/views/index.ejs:8610-8649` | `기본판넬` fallback, 블랙/승강/공청/동작감지를 모델 코드 치환으로 처리 |
| reset | `clients/web/estimate-app/views/index.ejs:10062-10068`, `:10144-10146`, `:10245-10250` | HOME_DEFAULTS·SINGLE_DEFAULTS를 다시 DOM에 기록; 상업은 `기본판넬`·`무선` 직접 기록 |
| 구조화 라벨 | `clients/web/estimate-app/views/index.ejs:11007-11009`, `:11066-11068` | 싱글 체크박스가 true면 `리모컨 제외`만 표기하고 selected wired 값은 표기하지 않음 |
| DB/bootstrap 경계 | `clients/web/estimate-app/lib/code.js:1215-1268`, `:1907-1908`; `clients/web/estimate-app/views/index.ejs:2246-2255`, `:2304-2306` | DB 설정을 HOME_DEFAULTS/SINGLE_DEFAULTS로 변환해 화면에 주입 |

### 3.2 order-app

order-app은 estimate-app과 같은 old 문자열을 별도 구현으로 다시 갖고 있다.

| 영역 | 파일:줄 | 현재 계약 및 읽기 경로 |
|---|---|---|
| 홈/싱글 선언 | `clients/web/order-app/index.html:5126-5142` | 홈 `기본·유선·컬러·제외`, 홈 특수 판넬; 싱글 `''·유선리모컨·컬러유선리모컨` + `리모컨 제외` + old 판넬 |
| 상업 선언/reset | `clients/web/order-app/index.html:4314-4325` | `기본판넬`·`무선` reset, 상업 판넬 6값, 리모컨 4값 |
| 싱글 리모컨/판넬 계산 | `clients/web/order-app/index.html:3252-3278`, `:3302-3309`, `:3336-3345` | old wired string 비교; checkbox true가 remote replacement보다 우선 |
| 홈 판넬 계산 | `clients/web/order-app/index.html:5360-5408` | 홈 공청/AI/인피니트 modelCode 분기 |
| 상업 판넬 계산 | `clients/web/order-app/index.html:5892-5942` | `동작감지`를 `PC1YNRK1NW`/`PC1ZNRK1NW`로 치환 |
| 상업 리모컨 계산 | `clients/web/order-app/index.html:2444-2447`, `:5843-5853` | 상업 공통 4값을 modelCode/제외 분기로 읽음 |
| 홈 tutorial | `clients/web/order-app/index.html:9863-9864`, `:9870` | `공청판넬`, `유선리모컨` 문자열을 QA/tutorial 동작에 직접 사용 |
| bootstrap 경계 | `clients/web/order-app/index.html:1356-1373`, `:1436` | `__BS.homeDefaults/singleDefaults`를 HOME_DEFAULTS/SINGLE_DEFAULTS로 변환 |

### 3.3 Desktop

Desktop은 세 화면의 전 옵션 select를 렌더링하는 앱이 아니라 전역 견적 기본값 페이지와 세트 옵션 전개/저장 계약을 가진다.

| 영역 | 파일:줄 | 현재 계약 및 영향 |
|---|---|---|
| 전역 기본값 select | `clients/desktop/src/renderer/routes/EstimatePricingConfigPage.tsx:60-63`, `:423-432` | 홈 특수 판넬, 싱글 old remote·제외 checkbox·old panel을 렌더링 |
| config request/response | `clients/desktop/src/renderer/routes/EstimatePricingConfigPage.tsx:65-112`; `clients/desktop/src/renderer/api/sales.ts:1227-1251` | `homeDefaultPanel`, `singleDefaultWiredRemote`, `singleNoRemote`, `singleDefaultPanel`을 PUT/GET |
| mock config | `clients/desktop/src/renderer/api/mock.ts:600-611` | 같은 old default field를 초기값으로 고정 |
| 세트 판넬 공용 도메인 | `clients/desktop/src/renderer/utils/bundleOptionDomain.ts:1-12` | 빈 값=기본, 허용 panel 값이 `판넬제외·블랙판넬·승강판넬·공청판넬` |
| API 정규화 | `clients/desktop/src/renderer/api/slip.ts:259-305` | remoteOption/remoteExcluded/panelOption을 전송; panel은 old allowlist 밖이면 null |
| 견적 저장 | `clients/desktop/src/renderer/routes/EstimateFormPage.tsx:138`, `:1824-1827` | BUNDLE line의 setOptions를 API payload에 포함 |
| 전표 재조회/비교/저장 | `clients/desktop/src/renderer/routes/SlipFormPage.tsx:550-575`, `:1900-1905` | remoteOption·remoteExcluded·panelOption을 round-trip 비교하고 저장 |

### 3.4 서버 변환 경계

| 경계 | 파일:줄 | 현재 동작 |
|---|---|---|
| product expand request | `services/product-service/src/main/java/com/samhanair/logis/product/web/dto/ExpandRequest.java:20-23`; `ProductInternalController.java:325-334` | legacy `remoteOption`, `remoteExcluded`, `panelOption`을 product-service로 전달 |
| panel mapping | `services/product-service/src/main/java/com/samhanair/logis/product/service/BundleExpander.java:172-231` | `블랙판넬→블랙`, `승강판넬→승강`, `공청판넬→공청`; `판넬제외`만 명시적으로 제외 |
| remote mapping | `BundleExpander.java:234-265`, `:268-295` | `remoteExcluded`가 최우선; `유선리모컨→유선`, `컬러유선리모컨→컬러유선` |
| 서버 contract 주석 | `BundleExpander.java:503-518` | old 싱글 값이 public record 계약으로 문서화돼 있음 |
| slip→product 전달 | `services/slip-service/src/main/java/com/samhanair/logis/slip/client/ProductClient.java:354-360`; `SlipLookupController.java:64-69`; `EstimateService.java:134-139`; `SlipService.java:206-210` | 같은 문자열이 lookup, 견적 전개, 전표 전개 경계를 통과 |
| 저장 DTO/entity | `services/slip-service/src/main/java/com/samhanair/logis/slip/estimate/web/dto/BundleSetOptions.java:7-12`; `EstimateLine.java:147-149`; `SlipLine.java:150-152` | 문자열·boolean 옵션을 JSONB로 보존 |

## 4. 저장 데이터와 마이그레이션 판단

### 4.1 최신 활성 데이터

| DB/테이블 | 측정 결과 | 측정 시각 |
|---|---|---|
| `product_db.products` | `remote_type`: 빈 값 3,044 / 무선 14 / 유선 3 / 컬러유선 0; `panel_type`: 빈 값 3,000 / 일반 28 / 공청 16 / 블랙 6 / 승강 6 / 360 5 | 2026-08-10 17:17:43.884067+09 |
| `dc_config_db.estimate_configs` | 활성 1행; `home_default_panel=''`, `single_default_wired_remote=''`, `single_no_remote=false`, `single_default_panel=''`, `single_panel_shape=원형` | 2026-08-10 17:17:43.896065+09 |
| `slip_db.estimates` / `slips` | 활성 header 24건 / 128건; 옵션 JSON은 각 line의 `bundle_set_options` 경계에서 보존 | 2026-08-10 17:25:07.737966+09 |
| `slip_db.estimate_lines` | 활성 35행; `bundle_set_options IS NOT NULL` 0행 | 2026-08-10 17:17:43.883976+09 |
| `slip_db.slip_lines` | 활성 302행; 옵션 JSON 20행; 그 20행은 `remoteOption=null` 20, `remoteExcluded=false` 20, `panelOption=null` 16, `panelOption=블랙판넬` 4 | 2026-08-10 17:17:43.883976+09 |
| `partner_order_db.partner_orders` | 활성 567행; `partner_order_lines` 586행; drafts 2,028행; revisions 568행 | 2026-08-10 17:17:43.893674+09 |
| `partner_order_bootstrap_cache` | `homeDefaults={}`, `singleDefaults={}`, `config={"vatRate":0.1,"deliveryDays":3}` | 2026-08-10 17:17:43.893674+09 |

### 4.2 revision 및 주문 문자열 구분

- `slip_revisions`는 활성 197건 중 옵션 키 snapshot 5건, `블랙판넬` 포함 1건이었다. `estimate_revisions`는 활성 47건 중 옵션 키 snapshot 0건이었다(측정 시각 **2026-08-10 17:18:10.114365+09**). `slip_revisions`의 옵션 키는 `remoteOption`, `panelOption`, `remoteExcluded`이며 JSON snapshot으로 남는다(`services/slip-service/src/main/java/com/samhanair/logis/slip/revision/domain/SlipSnapshot.java:165-167`).
- 현재 `slip_lines.bundle_set_options`에서 old remote label `유선리모컨`은 0건, old panel label `블랙판넬`은 4건이었다(측정 시각 **2026-08-10 17:18:10.114365+09**). `slip_revisions`에서도 remoteOption과 remoteExcluded가 함께 true인 snapshot은 0건이었다(측정 시각 **2026-08-10 17:19:38.843717+09**).
- `partner_order_revisions.snapshot`에서 `리모컨` 포함 16행/16주문, `유선리모컨` 포함 10행/10주문, `무선` 포함 6행/6주문이었다(측정 시각 **2026-08-10 17:18:10.114080+09**). 그러나 snapshot key 측정에는 top-level `lines`와 line-level `productName`은 있고 option key는 없었다(측정 시각 **2026-08-10 17:18:22.420315+09**; 스키마상 주문 라인도 `product_name`을 저장한다(`V1__init_partner_order.sql:62-72`)). 이 16건은 옵션 값 마이그레이션으로 분류하지 않는다.
- `partner_order_drafts.payload_json`의 `리모컨` 포함 0건, `partner_order_history.detail_json`의 `리모컨` 포함 0건이었다(측정 시각 **2026-08-10 17:18:10.114080+09**).

### 4.3 마이그레이션 결론

1. **엄격히 새 canonical 값(`블랙`, `승강`, `공청` 등)을 JSONB에 저장한다면** 현재 `slip_lines` 4행과 `slip_revisions`에서 확인된 1 snapshot이 데이터 호환 대상이다. `estimate_lines`와 현재 주문 payload/draft에는 옵션 값 마이그레이션 대상이 확인되지 않았다.
2. **구값을 읽는 compatibility adapter를 유지한다면** 기존 데이터 마이그레이션 없이 신규 저장값만 새 값으로 전환할 수 있다. 다만 `BundleExpander`는 현재 old panel label만 switch한다(`BundleExpander.java:182-200`). 새 값만 보내면 명시적 mapping을 타지 않고 기본 panel로 떨어질 수 있으므로 구현 순서가 중요하다.
3. `estimate_configs`의 현재 저장값은 빈 문자열뿐이고 홈 리모컨 컬럼도 없다(`V5__add_estimate_option_defaults.sql:8-12`). 따라서 defaults 컬럼명 변경만으로 홈 리모컨을 통일할 수 없고, 화면 bootstrap shape/API 계약을 함께 정해야 한다.

## 5. 판넬 의미 대응

### 5.1 홈 빈 값

홈의 판넬 빈 값은 `판넬제외`가 아니라 기본이다. 싱글의 현재 picker는 `panelOpt === '판넬제외'`일 때만 null을 반환하고, 빈 값은 기본 panel을 선택한다(`clients/web/estimate-app/views/index.ejs:5110-5120`). Desktop 공용 주석도 빈 문자열을 기본 판넬로 정의한다(`clients/desktop/src/renderer/utils/bundleOptionDomain.ts:1-7`). 홈 계산도 `판넬제외`에서 종료하고(`clients/web/estimate-app/views/index.ejs:8112-8120`), 그 외에는 기본/공청/AI 모델을 계산한다(`clients/web/estimate-app/views/index.ejs:8173-8205`).

**판정: 홈 빈 값 = 기본.** 새 공통 값으로 바꿀 경우 `기본`을 UI 값으로 명시할지, 내부에서는 빈 값/`일반`으로 번역할지 결정해야 한다.

### 5.2 홈 인피니트

홈 인피니트는 `panel_type` 하나로 대응되지 않는다.

- 중형/대형의 기본·공청·AI 모델 코드가 별도로 존재하고(`clients/web/estimate-app/views/index.ejs:8190-8199`),
- `인피니트 25년형`은 대형만 `base25`로 바꾸며 중형은 기본과 같은 modelCode를 사용한다(`clients/web/estimate-app/views/index.ejs:8087-8098`).
- classifier의 panel 결과는 `공청/블랙/승강/360/일반`뿐이고 인피니트·AI 전용 값은 없다(`ProductAttributeClassifier.java:28-47`).

따라서 `인피니트 25년형`과 `인피니트 공청+동작감지 AI`를 `panel_type`의 어느 값으로 볼지는 현재 코드와 DB만으로 결정할 수 없다.

### 5.3 상업 동작감지

상업 `동작감지`는 현재 `panel_type` 값이 아니다. 상업 renderer는 인피니트 중형/대형에 대해 각각 `PC1YNRK1NW`/`PC1ZNRK1NW`를 선택한다(`clients/web/estimate-app/views/index.ejs:8637-8649`, `clients/web/order-app/index.html:5921-5942`). product 정본 축에는 동작감지가 없고 활성 DB에도 해당 값이 없다(측정 시각 **2026-08-10 17:17:43.884067+09**).

### 5.4 개발책임자 확인 항목

| 선택지 | 의미 | 대가 |
|---|---|---|
| A. 권장: 일반/공청 등 공통 panel_type만 통일하고 인피니트 25년형·인피니트 AI·상업 동작감지는 별도 model variant로 유지 | 현재 modelCode 동작을 보존하고 `panel_type`의 의미를 왜곡하지 않음 | “판넬 축 완전 단일화”는 달성하지 못함; variant 계약을 별도 문서화해야 함 |
| B. `panel_type`에 `인피니트25`, `인피니트AI`, `동작감지`를 추가 | 모든 화면에서 하나의 값 축으로 표현 가능 | classifier·시트 sync·product 데이터 backfill·BundleExpander·모든 fixture/QA·DB 값 확장이 필요함. 현재 DB에는 값이 0건임 |
| C. 25년형→`일반`, AI/동작감지→`공청`으로 강제 매핑 | migration과 UI 변경이 가장 작음 | 25년형 model variant와 AI/동작감지 model variant를 잃어 잘못된 품목/단가가 선택될 위험이 있음 |

## 6. 리모컨 대응 및 부작용

### 6.1 홈 `기본`은 `무선`과 동일하지 않다

홈 `기본`은 `REMOTE_360_DEFAULT`, 인피니트 `AR-CH01`, 1/4way·벽걸이 `REMOTE_WIRELESS`를 family별로 선택한다(`clients/web/estimate-app/views/index.ejs:8255-8267`). 반면 `기본` 이외의 값은 `유선`일 때 WE, 그 밖에는 WG로 처리한다(`clients/web/estimate-app/views/index.ejs:8263-8267`). 따라서 화면 문자열만 `기본→무선`으로 바꾸면 `무선`이 기존 `기본` branch를 타지 않아 컬러 유선 모델(R_WG)로 흐를 수 있다.

**구현 시 필수:** canonical UI 값은 `무선`으로 표시하더라도 내부 계산에서는 홈 기본 family 분기와 `무선` 명시 선택을 구분하거나, `무선` branch를 기존 기본 branch 의미로 재정의해야 한다.

### 6.2 싱글 checkbox 흡수 가능성

현재 싱글 select와 checkbox는 독립 DOM 상태이므로 `ss_remote='유선리모컨'`과 `ss_remote_ex=true`를 동시에 만들 수 있다(`clients/web/estimate-app/views/index.ejs:7846-7849`). 그러나 실제 가격 계산은 checkbox가 true이면 selected remote를 무시하고 기본 리모컨 전체를 제외한다(`clients/web/estimate-app/views/index.ejs:5160-5175`). order-app도 같은 우선순위를 갖는다(`clients/web/order-app/index.html:3302-3309`, `:3340-3345`). 구조화 라벨도 checkbox가 true일 때 `리모컨 제외`만 기록한다(`clients/web/estimate-app/views/index.ejs:11007-11009`).

**판정:** 유효 동작은 셀렉트 `제외`로 표현 가능하다. 다만 raw 상태에서 “유선 선택 + 제외 체크”라는 잠재 조합은 새 셀렉트 하나로 보존되지 않는다. 최신 DB의 현재 `slip_lines` 옵션 20건에는 이 조합이 없었고, revision snapshot에서도 `remoteOption`+`remoteExcluded=true` 조합은 0건이었다(측정 시각 **2026-08-10 17:19:38.843717+09**).

### 6.3 싱글 old remote와 서버 계약

FE는 `유선리모컨`·`컬러유선리모컨`을 직접 비교하고(`clients/web/estimate-app/views/index.ejs:5090-5094`), BE도 같은 두 값을 `유선`·`컬러유선`으로 바꾼다(`BundleExpander.java:268-287`). 새 canonical 값 `유선`·`컬러유선`을 곧바로 전송하면 현재 BE의 old switch를 통과하지 못한다. canonical 전환에는 BE adapter 또는 구값/신값 양쪽 switch가 필요하다.

## 7. 테스트·QA·fixture 영향

| 종류 | 파일:줄 | 현재 단정 |
|---|---|---|
| estimate config/default unit | `clients/web/estimate-app/test/code.test.js:275-304`, `:480-518` | `공청판넬`, `블랙판넬`, `유선리모컨`, `컬러유선리모컨`, `리모컨 제외`를 DB→legacy defaults 기대값으로 단정 |
| estimate option fixture | `clients/web/legacy-quantity-golden/fixtures.js:172-203`, `:244-302` | 홈 `기본/유선/컬러/제외`, 싱글 old remote/checkbox, 상업 `기본판넬`·공통 remote를 계산 fixture로 사용 |
| estimate source mutation/capture | `clients/web/estimate-app/test/legacy-quantity-golden.test.js:37-38`; `clients/web/estimate-app/scripts/smp-estimate-capture.mjs:175-216` | `공청판넬` branch와 `블랙판넬` UI 조작을 소스/실 DOM 계약으로 단정 |
| order panel/remote regression | `clients/web/order-app/src/__tests__/homeOptionAndZeroLockRestore.test.ts:17-41`, `:90-101`; `catalogMissingSignal.test.ts:106`, `:425` | 판넬 제외/공청/기본 왕복, 상업 기본판넬, 유선리모컨 kit를 단정 |
| order fixture/harness | `clients/web/order-app/src/__tests__/homeOptionAndZeroLockHarness.cjs:177-226`; `legacyPreexistingFixHarness.cjs:72-74`; `sol2QuantityFixHarness.cjs:205` | 공청↔기본, 상업 블랙/컬러유선, 싱글 wired+checkbox 상태를 재현 |
| order QA scripts | `qa/playwright/scripts/qa-963-sol2-fix.mjs:143-162`; `qa/playwright/scripts/qa-963-preexisting-fix.mjs:78-80` | 상업 `블랙판넬`·`컬러유선` 선택값을 직접 사용 |
| Desktop API tests | `clients/desktop/src/renderer/api/mock.test.ts:160`; `clients/desktop/src/renderer/api/slip.test.ts:144`; `clients/desktop/src/renderer/utils/slipLineDraft.test.ts:188-216` | `panelOption=블랙판넬`, option equality, remoteExcluded/remoteOption 변화를 검증 |
| 실 QA 보고서 | `docs/qa/1069-bundle-expansion-real-qa/2026-08-06-1069-r7-real-qa.md:64-70`, `:78-101`, `:142-154` | 5개 panel 값과 `panelOption=블랙판넬` 저장/재조회 parity를 PASS 계약으로 기록 |
| DB mode QA artifacts | `docs/qa/896-db-mode-output/03-options-features-defaults.json:39-66`, `:200-264`, `:329-359`, `:560-561`; `05-price-scenarios.json:22-48`, `:232-276` | 화면 option value/label과 시나리오 입력에 old 값을 고정 |
| 설계/결정 문서 | `docs/handoff/2026-06-18-formula-f3-f4-decision-brief.md:8`, `:15-16`, `:29` | `homeDefaults/singleDefaults`, `BundleOptionRow`, `panelType=공청` 방향을 설명 |

상품 catalog fixture의 `유선리모컨`, `컬러유선리모컨`, `블랙판넬`은 옵션 state가 아니라 상품/자재 이름인 경우가 있다(`clients/desktop/src/renderer/api/mock.ts:1434-1454`). 이 문자열까지 일괄 치환하면 상품명·시트 품목명이 훼손될 수 있다. 상품명 표기 통일까지 별도 승인되지 않은 현재 범위에서는 catalog name은 보존해야 한다.

## 8. 바꿀 곳 전수 표 (현재값 → 새값)

아래 표는 이번 조사에서 **옵션 계약값/라벨/reader/저장 계약으로 확인된 변경 대상**을 묶은 것이다. 상품 catalog의 품목명은 마지막 행에서 별도로 제외했다.

| 파일:줄 | 현재값/현재 읽기 | 새값 또는 변경 방향 |
|---|---|---|
| `clients/web/estimate-app/views/index.ejs:7802-7805`; `clients/web/order-app/index.html:5126-5128` | 홈 label `리모컨`; 값 `기본·유선·컬러·제외`; 특수 panel old label | label은 `리모컨` 유지. remote 값은 `무선·유선·컬러유선·제외`; `기본→무선`, `컬러→컬러유선` adapter 필요. 홈 특수 panel은 §5 결정 후 확정 |
| `clients/web/estimate-app/views/index.ejs:8233-8268`; `clients/web/order-app/index.html:2444-2447` | 홈 `기본` branch와 그 외 branch가 서로 다른 model 선택 | UI `무선`과 기존 기본-family 계산 의미를 보존하도록 branch 분리/명시 |
| `clients/web/estimate-app/views/index.ejs:7846-7849`; `clients/web/order-app/index.html:5137-5140` | label `유선리모컨`; `''·유선리모컨·컬러유선리모컨`; checkbox `리모컨 제외` | 공통 label `리모컨`; select `무선·유선·컬러유선·제외`; checkbox 제거. `''` 및 checkbox raw 상태의 compatibility read 필요 |
| `clients/web/estimate-app/views/index.ejs:5090-5094`, `:5160-5175`, `:8014-8015`; `clients/web/order-app/index.html:3252-3253`, `:3302-3309`, `:5184-5187` | `유선리모컨`/`컬러유선리모컨` 비교 및 `remoteExcluded` 우선 | `유선`/`컬러유선`/`무선`/`제외` canonical reader; old 값 read compatibility; 제외 우선 semantics 유지 |
| `services/product-service/src/main/java/com/samhanair/logis/product/service/BundleExpander.java:268-287`, `:503-508` | BE contract가 `유선리모컨`/`컬러유선리모컨`만 변환 | `유선`/`컬러유선` canonical을 직접 처리하고 old 값도 기존 저장 데이터용으로 read |
| `clients/web/estimate-app/views/index.ejs:7849`; `clients/web/order-app/index.html:5140`; `clients/desktop/src/renderer/utils/bundleOptionDomain.ts:7`; `clients/desktop/src/renderer/api/slip.ts:264-305` | 싱글 panel `''·판넬제외·블랙판넬·승강판넬·공청판넬` | `panel_type` 기반 canonical. 후보값은 `판넬제외·일반(또는 기본)·블랙·승강·공청·360`; 실제 `일반 vs 기본`은 결정 필요 |
| `services/product-service/src/main/java/com/samhanair/logis/product/service/BundleExpander.java:182-200` | `블랙판넬→블랙`, `승강판넬→승강`, `공청판넬→공청`만 switch | canonical `블랙·승강·공청`을 직접 매핑하고 old label도 read. `기본/일반/360`의 default/shape 의미를 분리 |
| `clients/web/estimate-app/views/index.ejs:6636`; `clients/web/order-app/index.html:4321`; `:5892-5942`; `clients/web/estimate-app/views/index.ejs:8610-8649` | 상업 `기본판넬·블랙판넬·승강판넬·공청판넬·동작감지` | 공통 panel 축에 편입할지 §5.4 선택. `동작감지`는 현재 panel_type이 아니라 model variant |
| `clients/web/estimate-app/views/index.ejs:7805`, `:8190-8205`; `clients/web/order-app/index.html:5128`, `:5387-5408`; `clients/desktop/src/renderer/routes/EstimatePricingConfigPage.tsx:60` | 홈 `인피니트 25년형`, `인피니트 공청+동작감지 AI` | panel_type으로 강제 치환 금지. A(variant 유지) 또는 B(새 축 값 추가) 결정 후 변경 |
| `clients/web/estimate-app/lib/code.js:1216-1268`; `services/dc-config-service/src/main/resources/db/migration/V5__add_estimate_option_defaults.sql:4-31` | `HOME_DEFAULTS['리모컨']='선택 안함'`; 싱글 DB field가 old key shape로 변환 | canonical defaults shape/API 결정. 홈 remote 저장 컬럼 신설 여부와 기존 `single_no_remote` 흡수 정책 확정 |
| `clients/web/order-app/index.html:1360-1436`; `services/partner-order-service/src/main/resources/db/migration/V2__seed_bootstrap_cache.sql:14-16` | `homeDefaults/singleDefaults` 빈 객체 bootstrap | canonical defaults key/value로 seed·cache·FE reader 동시 변경; 상업 defaults 객체는 새로 만들지/직접 기본값 유지할지 결정 |
| `services/slip-service/src/main/resources/db/migration/V114__preserve_bundle_set_options.sql:1-3`; `V115__preserve_estimate_bundle_set_options.sql:1-3`; `SlipLine.java:150-152`; `EstimateLine.java:147-149` | JSONB `remoteOption`, `remoteExcluded`, `panelOption`이 old 값 저장 가능 | canonical 신규 저장 + old read adapter. 엄격 전환 시 현재 `slip_lines` 4행과 revision 1 snapshot 데이터 migration |
| `clients/desktop/src/renderer/routes/EstimatePricingConfigPage.tsx:60-61`, `:428-431`; `sales.ts:1227-1251`; `api/slip.ts:259-305` | Desktop 전역 config와 setOptions가 old label/checkbox 계약 | 공통 canonical value 및 제외 단일화, API/normalizer/round-trip test 동시 변경 |
| `clients/web/estimate-app/test/code.test.js:280-304`, `:493-518`; `clients/web/legacy-quantity-golden/fixtures.js:187-203`, `:244-302` | old defaults 및 old DOM 값 기대 | canonical 입력/old compatibility/홈 기본 branch를 별도 golden case로 추가 |
| `clients/web/order-app/src/__tests__/homeOptionAndZeroLockRestore.test.ts:17-41`, `:90-101`; `legacyPreexistingFixHarness.cjs:72-74`; `sol2QuantityFixHarness.cjs:205` | panel/remote old value와 checkbox 조합 기대 | `무선·유선·컬러유선·제외`, canonical panel, `유선+제외` raw compatibility/effective exclusion 회귀 추가 |
| `clients/desktop/src/renderer/api/mock.test.ts:160`; `api/slip.test.ts:144`; `utils/slipLineDraft.test.ts:193-216` | `panelOption='블랙판넬'`, old setOptions 비교 | canonical panel 값 및 old stored payload round-trip 검증 |
| `clients/desktop/src/renderer/utils/slipLineDraft.ts:82-90`; `clients/web/design-system/src/components/LineRow/LineRow.tsx:34-48`, `:125` | literal label은 없고 `remoteOption`·`remoteExcluded`·`panelOption`을 구조적으로 비교/전달 | 값 치환 대상은 아니지만 canonical 타입/주석/공용 payload가 바뀌면 함께 검토 |
| `services/product-service/src/main/java/com/samhanair/logis/product/quantitysync/QuantitySyncRuleValidator.java:534-544`; `services/product-service/src/main/java/com/samhanair/logis/product/service/ProductAttributeClassifier.java:28-61` | quantity-sync는 option key allowlist를 두지 않으며, 실제 정본 변환은 classifier가 담당 | quantity-sync에 UI label을 추가하지 않음; classifier의 `panel_type`/`remote_type` 값만 결정에 맞춰 갱신 |
| `qa/playwright/scripts/qa-963-sol2-fix.mjs:143-162`; `docs/qa/1069-bundle-expansion-real-qa/2026-08-06-1069-r7-real-qa.md:78-101`, `:142-154`; `docs/qa/896-db-mode-output/03-options-features-defaults.json:39-66`, `:200-264`, `:329-359`; `05-price-scenarios.json:22-48`, `:232-276` | QA가 old value/label을 직접 선택·단정 | canonical 값으로 fixture/QA 갱신하고 old payload compatibility와 실제 DB 재조회 모두 추가 |
| `clients/desktop/src/renderer/api/mock.ts:1438-1453`; product/sheet name 경로 `ProductSheetSyncService.java:1216`, `:1566-1574` | 상품명 `유선리모컨`, `컬러유선리모컨`, `블랙판넬` | **변경 대상 아님(현재 범위)**. 상품명/시트 원문과 옵션 state를 분리. 별도 상품명 통일 결정 없이는 치환 금지 |

## 9. 슬라이스 제안

개발책임자 결정대로 기존 옵션/전개 트랙 안의 별도 슬라이스로 둔다.

1. **결정 게이트 슬라이스**: `panel_type`의 canonical 값에서 `일반`과 화면 label `기본`의 관계, 홈 인피니트 25년형/AI, 상업 동작감지의 A/B/C를 확정한다. 이 결정 없이는 panel 전체 통일 구현을 시작하지 않는다.
2. **계약·호환 슬라이스**: estimate-app/order-app/Desktop의 선언·reader·defaults, `BundleExpander`·DTO·product/slip 경계를 한 계약으로 바꾼다. 신규 canonical 값을 읽되 old 값도 읽는 adapter를 먼저 둔다. 홈 `기본` family 계산과 싱글 `제외` 우선 semantics를 golden test로 고정한다.
3. **저장 전환 슬라이스**: canonical JSONB 저장을 선택한 경우에만 migration을 둔다. 실측상 우선 대상은 활성 `slip_lines`의 `블랙판넬` 4행과 `slip_revisions`의 옵션 snapshot 1건이다. estimate와 partner order는 이번 실측상 옵션 값 backfill을 만들지 않는다.
4. **QA·문서 동기화 슬라이스**: #896 DB mode fixture, legacy quantity golden, order Playwright, Desktop API test, #1069 real QA를 canonical 값·old payload 재조회·조합 상태까지 갱신한다. 상품 catalog name은 옵션 migration과 분리한다.

### 조사 종료 상태

- 소스 수정: 없음
- DB 쓰기: 없음
- Docker 재배포/재시작: 없음
- 조사 산출물: 본 문서만 작성 대상
- 구현 진행: 다음 라운드에서 개발책임자 확인 항목 확정 후 시작
