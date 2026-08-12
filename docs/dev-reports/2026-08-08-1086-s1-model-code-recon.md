# #1086 S1 정찰 — 활성 품목 모델코드·이름 fallback

> 조사일: 2026-08-08 (KST)  
> 작업 트리: `feat/1086-product-model-code`  
> 범위: SELECT 및 소스 정독만 수행. 데이터 변경, relink, 코드 수정 없음.

## 결론 요약

현재 공유 PostgreSQL에서 이슈 본문의 전제는 재현되지 않는다.

- `product_db.products`의 활성 정의를 `is_deleted=false AND status='ACTIVE'`로 잡으면 **3,083건**이다.
- 그중 `model_code` NULL/공백은 **0건**이다. 따라서 “활성 품목 33개에 불변 모델코드 부재”는 현재 DB 기준 **33건이 아니라 0건**이다.
- 현재 line 테이블에서 `product_id IS NULL`인 행도 0건이다. “4,225 line이 이름 fallback에 의존” 역시 현재 공유 DB에서 같은 의미로 재현되지 않았다.
- 다만 `products.name`은 동일 이름 활성 그룹 170개(652행, 초과 482행)다. 이름만으로 해소하는 계약이 존재한다면 오인 가능성은 이미 있다. 반면 fallback에 실제 사용되는 `model_name`은 활성 중복 0그룹이다.

## A. 실 데이터

### A-1. 활성 품목 및 모델코드 결손

쿼리 기준:

```sql
WHERE is_deleted = false AND status = 'ACTIVE'
```

실측 결과:

| 항목 | 건수 |
|---|---:|
| 활성 품목 | 3,083 |
| `model_code` NULL/공백 | 0 |
| `model_code`가 채워진 활성 품목 | 3,083 |
| 이슈 본문 주장 33개와의 차이 | **-33 (현재는 0)** |

`status/is_deleted` 분포도 `ACTIVE/f=3,083`, `ACTIVE/t=134`, `DISCONTINUED/t=4`였다. 즉 `is_deleted=false`만 써도 3,083건이며 status를 함께 적용해도 변하지 않는다.

### A-2. 모델코드 후보 컬럼 채움률

모델코드로 오인될 수 있거나 기존 식별 흐름에서 사용되는 `products` 컬럼을 모두 점검했다. 채움률의 분모는 활성 3,083건이며, 공백은 `btrim(col) <> ''`로 제외했다.

| 컬럼 | 채움 | 채움률 | 판단 |
|---|---:|---:|---|
| `model_code` | 3,083 | 100.00% | 현재 불변 카탈로그 식별자 |
| `model_name` | 3,083 | 100.00% | legacy/모델명 조회 축, fallback 입력 |
| `product_code` | 2,696 | 87.45% | 이카운트/품목 코드 후보이나 model code와 별도 |
| `barcode` | 0 | 0.00% | 현재 데이터에는 없음 |
| `name` | 3,083 | 100.00% | 표시 품목명; 이름 fallback 계약 시 충돌 위험 |

`set_material_key`, `product_group1/2`, `category_group` 등은 분류·자재·그룹 속성이므로 모델코드 후보에서 제외했다. 별도 비즈니스 식별자로 정할지는 개발책임자 결정이 필요하다.

### A-3. 4,225 line 재확인

현재 line 저장소를 모두 확인했다.

| DB / 테이블 | 전체 행 | soft-delete 제외 | `product_id IS NULL` | `model_name` 채움 |
|---|---:|---:|---:|---:|
| `slip_db.slip_lines` | 3,467 | 830 | 0 | 3,467 |
| `slip_db.estimate_lines` | 2,093 | 89 | 0 | 2,093 |
| `partner_order_db.partner_order_lines` | 2,270 | 8 | 0 | 2,270 |
| `accounting_db.sales_accounting_slip_lines` | 1 | 0 | 해당 컬럼 없음 | 0 |
| `accounting_db.tax_invoice_lines` | 22 | 22 | 해당 컬럼 없음 | 0 |

현재 `product_id IS NULL` line은 확인된 세 line 테이블에서 **0건**이다. 따라서 4,225라는 수치를 현재 데이터에서 재확인할 수 없다. 위 세 테이블의 전체 `model_name` 채움 합계는 7,830건이지만, 이것은 snapshot 컬럼이 채워졌다는 뜻이지 이름 fallback 의존 건수라는 뜻은 아니다. 활성 행 합계는 927건이다.

### A-4. 이름 fallback 오인 가능성

fallback 구현의 2차 키는 `name`이 아니라 `model_name`이다. 따라서 두 축을 나눠 세었다.

| 비교 축 | 동일 값이 2개 이상인 활성 그룹 | 해당 행 | 초과 행 |
|---|---:|---:|---:|
| `products.name` | 170 | 652 | 482 |
| `products.model_name` | 0 | 0 | 0 |

`name` 중복은 실제로 많으며, 이름을 식별자로 계약하면 오인 대상이 이미 존재한다. 예: `냉난방 무풍 벽걸이` 14건, `냉난방 무풍 벽걸이 실내기` 14건, `냉난방 무풍 벽걸이 실외기` 14건. 현재 구현의 `model_name` 정확 매칭은 활성 중복 0건이라 이 축에서의 오인 데이터는 **0건**이다. 이는 이름 fallback을 안전하다고 확정하는 근거가 아니라, 현재 데이터 snapshot에서 `model_name`이 우연히 유일하다는 뜻이다.

### A-5. 원문 출력 요청에 대한 결과

요청한 “33개 품목과 그 line 각 2건”은 결손 집합이 현재 0건이므로 출력할 원문이 없다. 결손 원문 쿼리 결과는 0행이다.

```sql
SELECT name, model_name, model_code, product_code, lineage, status, is_deleted
FROM products
WHERE is_deleted = false
  AND (model_code IS NULL OR btrim(model_code) = '')
ORDER BY created_at
LIMIT 2;
-- 0 rows
```

대조용으로 현재 활성 line 원문 2건씩은 다음과 같다(결손 33개 소속이라는 의미는 아님).

```text
slip_lines
product_name=테스트제품-TEST-MODEL-0001 | model_name=TEST-MODEL-0001 | quantity=1 | unit_price=109000.00 | is_deleted=false
product_name=테스트제품-TEST-MODEL-0008 | model_name=TEST-MODEL-0008 | quantity=2 | unit_price=179000.00 | is_deleted=false

estimate_lines
product_name=[QA797] 구성품A(기본2개) | model_name=QA797-PART-01 | quantity=2 | unit_price=80000.00 | is_deleted=false
product_name=[QA797] 구성품B(기본1개) | model_name=QA797-PART-02 | quantity=1 | unit_price=50000.00 | is_deleted=false
```

## B. 코드 실측

### B-1. 이름 fallback 지점

확인된 전수 지점은 다음과 같다. 여기서 “fallback”은 model code 조회 실패 후 model name으로 재조회하는 경로를 뜻한다.

- `services/product-service/src/main/java/com/samhanair/logis/product/repository/ProductRepository.java:56-58` — `findByModelCodeAndIsDeletedFalse(normalized).or(() -> findByModelNameAndIsDeletedFalse(normalized))`.
- `services/product-service/src/main/java/com/samhanair/logis/product/service/ProductService.java:441-452` — bulk model code 조회 후 미해소 토큰을 `findByModelNameInAndIsDeletedFalse`로 2차 조회.
- `services/product-service/src/main/java/com/samhanair/logis/product/service/ProductService.java:457-477` — model name bulk lookup API.
- `services/product-service/src/main/java/com/samhanair/logis/product/service/ProductService.java:917-918,1005` — catalog exposed identifier의 model code → model name fallback을 repository default method으로 위임.
- `services/product-service/src/main/java/com/samhanair/logis/product/service/BundleComponentService.java:121-122,149` — 구성품 코드 미해소 시 model name 재조회.
- `services/product-service/src/main/java/com/samhanair/logis/product/service/BundleComponentService.java:347,357` — 구성품 명칭 조회의 model code → model name fallback.
- `services/product-service/src/main/java/com/samhanair/logis/product/service/BundleComponentService.java:630-648` — display-order 벌크 조회의 model code 1차, model name 2차 조회.
- `services/product-service/src/main/java/com/samhanair/logis/product/web/EstimateCatalogInternalController.java:431,590-591` — 응답 key를 `modelCode`, 공백이면 `modelName`으로 정규화.

`ProductSheetSyncService.java`의 `:1198,1248,1613-1619`에 있는 row-index fallback은 **이름 fallback이 아니라 Google Sheet formula row 정렬 fallback**이다. 혼동하지 않아야 한다.

### B-2. 모델코드 발급·검증

발급/검증은 존재한다.

- 화면/API 생성: `ProductService.java:528-531,535-557`에서 `req.modelName().trim()`을 생성 시 `modelCode`로 설정하고 활성 중복을 검사한다.
- 생성 도메인: `Product.java:448-451`의 `changeModelCode`는 값 대입만 하며 자체 형식/공백 검증은 없다.
- 시트 sync: `ProductSheetSyncService.java:1234-1271`에서 시트 model-code 셀을 공백 reject하고, 코드로 기존 품목을 찾거나 `Product.seedFromSheet(name, modelCode, ...)`로 만든다.
- 시트 seed factory: `Product.java:407-422`는 전달된 model code를 그대로 저장한다. null/공백 방어는 호출부에 있다.
- 이카운트 import: `EcountProductImporter.java:59-167,314-337,549`에서 원본 품목코드와 main candidate를 사용하고 alias를 별도 저장한다. 이 경로는 model code 결손을 현재 DB에서 만들었다고 단정할 근거는 없지만, 원본 코드·main code·alias 정책을 별도 확인해야 한다.
- HVAC 시더: `HvacProductSeeder.java:76,139,202`의 `CommandLineRunner`가 시드 행을 생성한다. 제품 생성 경로가 살아 있으므로 재시드 시 데이터 계보를 확인해야 한다.

왜 33개가 빠졌는지는 현재 DB에서 결손 0건이라 특정할 수 없다. 다만 코드상 위험 지점은 (1) `changeModelCode` 자체가 무검증 setter인 점, (2) `seedFromSheet`가 호출자 전달값을 그대로 받는 점, (3) 생성 시 model code를 별도 입력받지 않고 model name에서 파생하는 점, (4) ECOUNT의 원본 코드와 sheet model code를 alias/main으로 분리하는 점이다.

### B-3. 생성 경로

소스상 세 갈래가 확인된다.

1. **시더**: `HvacProductSeeder`의 CommandLineRunner.
2. **Google Sheet sync/import**: `ProductSheetSyncService`가 model-code 열을 읽어 upsert한다. 현재 scheduler는 설정에 따라 cron/부팅 sync를 게이트한다.
3. **화면/API 등록**: `ProductService.create`가 model name을 trim한 값을 최초 model code로 설정한다.
4. **이카운트 import**: `EcountProductImporter`가 원본 품목코드, main candidate, alias를 처리한다.

따라서 재발 여부의 핵심은 ① 시트/이카운트 원본에서 model code가 공백인 행의 처리 계약, ② 화면 생성에서 model name과 immutable model code를 같은 값으로 파생하는 계약, ③ 재시드/재import가 기존 연결을 보존하는지다.

## C. 개발책임자 결정 질문

추측으로 결정하지 않고 다음을 확인해야 한다.

1. 현재 DB에서는 결손 0건인데, 이슈의 33건은 어떤 snapshot/환경/필터를 기준으로 한 수치인가? 재현 대상 DB와 기준 쿼리를 지정할 것인가.
2. 결손이 재현되는 경우 33개에 새 model code를 발급할 것인가, 아니면 이름 fallback을 일정 기간/영구 계약으로 인정할 것인가.
3. 새로 발급한다면 값의 주체는 자동 생성 규칙인가, 담당자 입력인가. 자동 생성이면 원본 품목코드·alias·기존 line snapshot과의 관계를 어떻게 보존하는가.
4. `relink 금지`의 정확한 범위는 무엇인가: `product_id` 변경 금지인지, model code 재할당 금지인지, 이름 기반 재매칭 금지인지, alias 추가도 금지인지 구체화해야 한다.
5. 이미 저장된 line의 `product_id`, `product_name`, `model_name` 중 어떤 필드를 정본으로 인정할 것인가. 결손 보완 시 line snapshot을 바꾸지 않는 것이 원칙인지 확인해야 한다.
6. `products.name` 중복 170그룹을 이름 fallback의 위험 데이터로 보류할 것인가, 아니면 fallback 키를 `model_name`으로 한정하는 현재 계약을 명시적으로 유지할 것인가.
7. `product_code`(2,696/3,083)와 `model_code`(3,083/3,083)를 서로 대체 가능한 식별자로 볼 것인가. 현재 코드는 두 값을 별도 축으로 취급한다.

## 슬라이스 후보

1. **기준 데이터 재현 슬라이스** — 33건과 4,225 line의 원본 DB/필터/시점을 고정하고, 현재 snapshot과의 차이를 닫는다.
2. **식별자 계약 슬라이스** — model code, model name, product code, alias의 발급·검증·불변성 규칙을 결정하고 문서/테스트로 닫는다.
3. **fallback 안전장치 슬라이스** — model code 1차 실패 후 이름 fallback의 오인·다중매칭·0매칭을 200 빈 응답 없이 보류/경고하는 계약을 닫는다.
4. **생성 경로 차단 슬라이스** — 화면, sheet sync, ECOUNT import, 시더별로 공백/중복 model code 유입을 차단하고 재발을 닫는다.
5. **cross-service line 관측 슬라이스** — line의 product UUID/model snapshot 해소율을 서비스별로 측정하고, 끊긴 참조가 200 OK 빈 값으로 사라지지 않도록 진단을 닫는다.

## 신규 파일 및 변경 여부

- 신규 파일: `docs/dev-reports/2026-08-08-1086-s1-model-code-recon.md`
- 코드 수정: 없음
- DB 변경: 없음 (SELECT만 수행)
- 커밋/push: 없음
