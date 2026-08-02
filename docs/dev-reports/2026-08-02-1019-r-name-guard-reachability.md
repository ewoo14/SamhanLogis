# PR #1024 적대검증 — 품목명 guard 도달성과 정상 수정 차단 여부

- 대상: 이슈 #1019, PR #1024
- 브랜치/HEAD: `fix/1019-product-name-unique` / `ebe91183f`
- 검증일: 2026-08-02 (KST)
- 각도: **차단되면 안 되는 것이 차단되는가. 실 데이터에서 몇 건이 막히는가.**
- 제약 준수: 코드·기존 문서 수정 없음, Docker 이미지 재빌드 없음, 공유 DB write/DDL 없음. 아래 DB 실행은 모두 `psql -c "SELECT ..."` 또는 `BEGIN READ ONLY`이다.

## 1. 변경면

요청한 두 명령의 실행 원문:

```text
> git log --oneline -5
ebe91183f [FEAT] #1019 활성 품목명 중복 차단 — 신규 등록·이름 변경 경로만
380d5edb0 docs(recon): #1019 '157' 은 쌍이 아니라 동일 품목명 그룹 157개
3c6ed8795 [FIX] #1019 품목명 unique 정찰 — 결정한 제약을 지금은 걸 수 없다
3df5fcd94 memory: 머지 충돌 해소는 fix 다 · 새 데이터 QA 는 기존 행 호환을 못 본다
16f92deca [FIX] 일마감 상세 표시 단가가 전표 실제 단가와 어긋난다 — 날짜 상수 대신 설정 조회 (#991)
```

```text
> git diff --stat origin/main...HEAD
 .../2026-08-01-1019-duplicate-name-pairs.md        |   1 +
 .../2026-08-01-1019-product-name-unique-recon.md   | 410 +++++++++++++++++++++
 .../2026-08-02-1019-impl-active-name-unique.md     |  87 +++++
 docs/dev-reports/2026-08-02-1019-pairs.md          | 217 +++++++++++
 .../logis/product/service/ProductService.java      |  25 +-
 .../logis/product/service/ProductServiceTest.java  |  70 ++++
 6 files changed, 809 insertions(+), 1 deletion(-)
```

핵심 실행 변경은 다음 두 곳이다.

- `ProductService.java:470`: 생성 전에 `assertNameAvailable(req.name(), null)` 호출.
- `ProductService.java:521-523`: PATCH 이름이 현재 엔티티 값과 `Objects.equals`로 다를 때만 검사 후 rename.
- `ProductService.java:564-578`: `name.trim()` 후 `findByNameAndIsDeletedFalse` 조회, 현재 id 제외, 첫 충돌을 `409 CONFLICT`로 변환.
- `ProductRepository.java:65`: 조회 파생 조건은 `name = ? AND is_deleted = false`이다. `status = ACTIVE` 조건과 이름 잠금은 없다.
- DB migration/이름 unique index 추가는 없다.

## 2. 각도 1 — 기존 동명 품목의 다른 필드 정상 수정

### 판정

**실 DB 활성 동명 186그룹, 696행 중 정상적인 데스크톱 전체 폼 저장에서 이름 guard로 막히는 행은 0건이다.**

실측 원문:

```text
 total_rows | nondeleted_rows | active_rows | nonactive_nondeleted_rows
------------+-----------------+-------------+---------------------------
       1226 |            1220 |        1216 |                         4

 active_duplicate_groups | active_duplicate_rows | active_extra_rows
-------------------------+-----------------------+-------------------
                     186 |                   696 |               510

 existing_duplicate_other_field_edits_blocked
----------------------------------------------
                                            0
```

마지막 숫자의 SQL은 실제 ACTIVE 동명 그룹의 모든 행에 대해 데스크톱이 제출할 `BTRIM(name)`이 저장값과 달라지고, 그 제출 이름을 가진 다른 비삭제 행이 존재하는 경우를 센 것이다.

```sql
WITH dup AS (
  SELECT name
  FROM products
  WHERE NOT is_deleted AND status='ACTIVE'
  GROUP BY name HAVING COUNT(*)>1
), candidate AS (
  SELECT p.*, BTRIM(p.name) AS submitted_name
  FROM products p JOIN dup d ON d.name=p.name
  WHERE NOT p.is_deleted AND p.status='ACTIVE'
)
SELECT COUNT(*) AS existing_duplicate_other_field_edits_blocked
FROM candidate c
WHERE c.submitted_name<>c.name
  AND EXISTS (
    SELECT 1 FROM products x
    WHERE NOT x.is_deleted
      AND x.name=c.submitted_name
      AND x.id<>c.id
  );
```

코드 도달성도 일치한다. 데스크톱 edit hydrate는 `productFormModel.ts:102`에서 DB 응답 이름을 그대로 폼에 넣고, 저장은 `ProductFormPage.tsx:294`의 유일한 production 호출에서 전체 `buildUpdateProductRequest(values)`를 보낸다. 이 빌더는 `productFormModel.ts:303-317`에서 `name: trimmed(values.name)`을 항상 포함한다. 실 DB ACTIVE 이름의 선후행 ASCII 공백 행은 0건이므로 696행 모두 PATCH의 `req.name()`과 `product.getName()`이 같고 `ProductService.java:521`에서 검사가 돌지 않는다.

주의: 추가된 단위 테스트 `update_otherFieldOnExistingDuplicateName_isAllowed`는 `name=null`만 검증한다. 실제 데스크톱의 `name=현재값` 전체 payload 자체를 테스트한 것은 아니다. 이번 라운드는 소스 도달성 + 실 DB 696행 계수로 그 공백을 확인했다.

## 3. 각도 2 — 이름을 그대로 포함해 저장하는 클라이언트

### 판정

- production 클라이언트 PATCH 호출 경로: **1개** (`ProductFormPage.tsx:294`).
- 이 경로는 이름을 생략하지 않고 전체 payload에 포함: **예** (`productFormModel.ts:305`).
- 현재값과 완전히 같은 이름일 때 서버 guard 호출: **0회** (`ProductService.java:521`의 short-circuit).
- 실 DB 동명 행 중 클라이언트 trim 때문에 현재값과 달라지는 행: **0/696건**.

관련 실행 원문:

```text
clients/desktop/src/renderer/routes/productFormModel.ts:98:export function editSeedToProductFormValues(...)
clients/desktop/src/renderer/routes/productFormModel.ts:102:    name: seed.detail.name ?? seed.summary.name ?? '',
clients/desktop/src/renderer/routes/productFormModel.ts:303:export function buildUpdateProductRequest(...)
clients/desktop/src/renderer/routes/productFormModel.ts:305:    name: trimmed(values.name),
clients/desktop/src/renderer/routes/ProductFormPage.tsx:294:      return updateProduct(id, buildUpdateProductRequest(values))
```

따라서 이번 재발 각도의 핵심인 “프론트가 이름을 같이 보내서 기존 동명 품목의 설명/분류 저장이 전부 409가 되는가”에는 **아니다(실측 0건)**라고 판정한다.

## 4. 각도 3 — 공백·대소문자·전각/반각

### 구현 의미

- 서버 조회는 `String.trim()` 후 **대소문자 구분 exact match**이다 (`ProductService.java:564-566`).
- 저장은 정규화된 `normalizedName`이 아니라 원래 `req.name()`을 사용한다 (`ProductService.java:482`, `Product.java:375`, `Product.java:416-418`).
- 데스크톱은 create/update 모두 먼저 JS `trim()`한 이름을 보낸다 (`productFormModel.ts:284,305`).
- 따라서 데스크톱 경로의 선후행 공백은 같은 이름으로 취급한다. 대소문자, 내부 공백, 전각/반각 및 기타 Unicode 호환 문자는 서로 다른 이름으로 통과한다.
- raw API 호출은 조회만 trim하고 원문을 저장하므로, 대응하는 trim 이름이 아직 없을 경우 공백 원문을 저장할 수 있다. 즉 canonicalization이 guard와 persistence에서 일치하지 않는다.

### 실 데이터 숫자

```text
 trim_variant_groups | trim_distinct_spellings | trim_rows
---------------------+-------------------------+-----------
                   0 |                       0 |         0

 case_variant_groups | case_distinct_spellings | case_rows
---------------------+-------------------------+-----------
                   0 |                       0 |         0

 trim_or_case_variant_groups | trim_or_case_distinct_spellings | trim_or_case_rows
-----------------------------+---------------------------------+-------------------
                           0 |                               0 |                 0

 active_names_with_outer_ascii_space
-------------------------------------
                                   0

 active_names_with_ascii_uppercase
-----------------------------------
                               522
```

대소문자가 포함된 ACTIVE 행은 522건이지만, 동일 이름의 case-only 변형 쌍은 0그룹/0행이다. 즉 현재 DB에서 과도하게 합쳐 막히는 case 쌍도 없고, 이미 공존하는 case 쌍도 없다.

.NET `NormalizationForm.FormKC`로 실제 ACTIVE 1,216개 이름을 비교한 실행 원문:

```text
nfkc_variant_groups=0
nfkc_variant_rows=0
explicit_fullwidth_halfwidth_rows=0
```

NFKC에 의해 자체 문자열이 바뀌는 행은 10건이었고 모두 `㎡`가 `m2`로 호환 정규화되는 이름이었다. 그러나 정규화 결과와 같은 다른 실제 이름은 없어 variant 그룹은 0이다. 명시적 전각 ASCII/전각 공백/반각 가타카나를 포함한 행도 0건이다.

### 판정

- 현재 실 데이터에서 trim/case/전각·반각 때문에 정상 기존 수정이 막히는 건수: **0건**.
- 이름 변형에 대한 현재 guard 정책: **case·전각/반각은 통과**, 선후행 ASCII 공백은 데스크톱에서 제거.
- raw API의 “조회는 trim, 저장은 원문” 비대칭은 잠재적 우회 결함이다. 다만 실 DB 변형 쌍은 0이고 쓰기 재현이 금지되어 이번 라운드에서 실제 발생 건수로 확대 보고하지 않는다.

## 5. 각도 4 — 동시 등록 경합

### 판정: 결함 R-2 (HIGH)

**같은 이름의 동시 POST 2건이 모두 guard를 통과할 수 있다.** 이름 unique constraint/index는 0개이고, 이름 단위 lock/advisory lock도 없다. DB 기본 격리수준은 `read committed`이다.

실 DB 원문:

```text
 default_transaction_isolation
-------------------------------
 read committed

 product_name_unique_constraints_or_indexes
--------------------------------------------
                                          0
```

실제 soft-delete 전용 이름은 6개이며 guard에는 모두 0행으로 보인다. 그중 실제 값 `QA797 상업 시각폴리시 테스트`를 사용해 두 독립 read-only 세션을 동시에 실행한 원문:

```text
SESSION_1
BEGIN
37049|0
COMMIT

SESSION_2
BEGIN
37048|0
COMMIT
```

두 backend PID `37049`, `37048` 모두 동일 이름에 대해 `guard_visible_rows=0`을 얻었다. 실제 INSERT는 공유 DB write 금지 때문에 실행하지 않았다. 하지만 `ProductService.java:470`의 check와 `ProductService.java:493`의 save 사이에 이름 lock이 없고, 실제 DB에 name unique index가 0개이므로 두 트랜잭션은 이 결과 뒤 모두 INSERT를 완료할 수 있다. 모델코드는 서로 다르게 제출할 수 있으므로 기존 model code/model name unique index도 이 경합을 막지 않는다.

## 6. 각도 5 — API 우회 import·sync·seeder

### 실측 도달성

`ProductService.assertNameAvailable`을 통과하지 않고 `products`를 생성/갱신하는 production 컴포넌트는 **2개**, dev 전용 seeder까지 포함하면 **3개**이다.

1. 이카운트 import — `EcountProductImporter.java:261,288-329`: JDBC `INSERT ... ON CONFLICT(product_code) DO UPDATE`, 이름도 직접 INSERT/UPDATE.
2. Google Sheet sync — `ProductSheetSyncService.java:1246-1262`: modelCode로 조회하고 신규이면 `Product.seedFromSheet(name, ...)` 후 repository save. 동일 이름 검사는 없다. 이후 save 지점은 `1320`, `1329`, `1377`에도 있다.
3. dev HVAC seeder — `HvacProductSeeder.java:73-74,430`: `dev` + `seed-test-data=true`에서 raw INSERT. 이름 검사는 없다.

실행 원문:

```text
services/product-service/.../EcountProductImporter.java:261: UUID productId = jdbcTemplate.queryForObject(UPSERT_PRODUCT_SQL, params, UUID.class);
services/product-service/.../EcountProductImporter.java:289: INSERT INTO products (
services/product-service/.../ProductSheetSyncService.java:1246: Optional<Product> existing = productRepository.findByModelCodeAndIsDeletedFalse(modelCode);
services/product-service/.../ProductSheetSyncService.java:1261: productRepository.save(p);
services/product-service/.../HvacProductSeeder.java:73: @Profile("dev")
services/product-service/.../HvacProductSeeder.java:430: "INSERT INTO products ("
```

### 의도 판정

이번 구현 보고서 `2026-08-02-1019-impl-active-name-unique.md:5`가 범위를 **“product-service의 수동 품목 mutation 경로만”**이라고 명시하므로, 3개 우회 컴포넌트는 현재 문서화된 의도와 일치한다. 사용자 요약도 POST/PATCH 계약을 지정했다. 따라서 이 라운드에서는 우회 자체를 추가 차단 결함으로 판정하지 않는다.

다만 결과적으로 “이름 재사용 차단”은 전체 write invariant가 아니라 수동 API 2개 endpoint에만 적용된다. import/sync가 새 동명을 만든 뒤 수동 API가 그 상태를 보게 되는 구조는 그대로다. import/sync/seeder를 실제 실행해 신규 동명 생성 여부를 측정하는 것은 공유 DB write 금지 때문에 **조사하지 않음**이다.

## 7. 발견 결함 — 실제 값 재현

### R-1 (MEDIUM) `DISCONTINUED` 전용 이름도 409로 차단

요구와 정찰 문서는 ACTIVE 품목명을 대상으로 하지만 구현 쿼리는 `status`를 보지 않는다.

- 원인 위치: `ProductService.java:566` → `findByNameAndIsDeletedFalse`.
- repository 계약: `ProductRepository.java:65` — `is_deleted=false`만 조건에 포함.
- 실 DB 비삭제 단종 행: **4건**.
- ACTIVE 행 없이 DISCONTINUED 행만 이름을 점유해 재사용이 차단되는 이름: **1개 / 1행**.
- 실제 값: `외부 통신 모듈 MIM-N10`, 모델코드 `COMM-MIM-N10`.

실행 원문:

```text
          name          |  model_code  |    status    | is_deleted
------------------------+--------------+--------------+------------
 외부 통신 모듈 MIM-N10 | COMM-MIM-N10 | DISCONTINUED | f
(1 row)

 active_same_name
------------------
                0
(1 row)
```

이 이름으로 POST하면 `assertNameAvailable`은 위 DISCONTINUED 행을 충돌로 읽고 409를 던진다. 즉 “ACTIVE 동명만 차단” 계약과 달리 실제로 재사용 가능한 이름 1개가 막힌다. 나머지 DISCONTINUED 3행의 이름은 별도 ACTIVE 행도 존재하므로 이 결함 때문에 추가로 막히는 이름은 아니다.

### R-2 (HIGH) 동시 등록 2건 모두 통과 가능

원인과 실제 두 세션 원문은 §5에 기록했다. check-then-insert를 직렬화하는 name lock도, 최종 방어 DB constraint도 0개다. 공유 DB write 금지 때문에 두 INSERT의 최종 2행 생성은 실행하지 않았으며, 그 미실행 사실을 성공/결함 0으로 세지 않는다.

## 8. 최종 판정

**CHANGES REQUESTED / 차단.**

- 이번 라운드의 최우선 회귀인 기존 동명 품목의 다른 필드 저장은 실 DB **696행 중 0건 차단**으로 통과한다.
- 그러나 ACTIVE-only 계약보다 넓게 DISCONTINUED 전용 실제 이름 **1개**를 차단한다(R-1).
- 동시 POST **2건**은 둘 다 guard를 통과할 수 있다(R-2). 이름 unique index/constraint는 **0개**이다.
- API 우회 write 컴포넌트는 production **2개**, dev 포함 **3개**이며, 현재 구현 보고서의 “수동 mutation만” 범위에는 부합한다.

## 9. 이 라운드가 보지 않은 것

아래는 **조사하지 않음**이며 “결함 0”을 뜻하지 않는다.

1. 실제 POST/PATCH write 재현과 HTTP 409 body — 공유 DB write 금지 및 Docker 이미지 재빌드 금지 때문에 실행하지 않음. 현재 실행 중 product-service가 이 HEAD 이미지인지도 교체·검증하지 않음.
2. 두 동시 INSERT의 최종 commit 결과 — 두 독립 guard read까지만 실제 실행. write 경합은 구조적으로 판정했지만 DB에 행을 만들지 않음.
3. 이카운트 import, Google Sheet sync, HVAC seeder 실제 실행 — write 경로 정적 도달성만 확인. 신규 동명 생성 건수는 조사하지 않음.
4. 전체 product-service 테스트/통합 테스트/CI — 이번 라운드는 합성 데이터·목업 금지 및 Docker 재빌드 금지 조건에 따라 실행하지 않음.
5. NBSP, zero-width 문자, locale별 case folding 등 NFKC/ASCII trim/일반 lower 외 모든 Unicode spoofing 조합 — 조사하지 않음.
6. 모바일·외부 비공개 클라이언트 또는 저장소 밖 호출자 — 저장소 내 production 클라이언트만 검색함.

## 10. 새로 만든 파일

- `docs/dev-reports/2026-08-02-1019-r-name-guard-reachability.md`
