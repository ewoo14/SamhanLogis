# PR #1024 / 이슈 #1019 — R3 postfix 재수렴 리뷰

- 검토일: 2026-08-02 (KST)
- 역할: 머지 전 재수렴 리뷰어
- 대상 브랜치: `fix/1019-product-name-unique`
- 대상 HEAD: `2a26bf5cb36090393acd7ab5d549347e6fea92a7`
- 검토 범위: R2 `df281ad01`이 새로 만든 표면 1~5만
- 제약 준수: 코드 수정, commit/push/checkout/브랜치 조작, Docker 이미지 재빌드, 공유 DB write/DDL, 합성 데이터 생성을 하지 않았다. DB 실행은 모두 `BEGIN READ ONLY` 안의 `SELECT`이다.

## 1. R2 fix가 만든 새 표면

R2의 실행 변경은 두 가지다.

1. 이름 충돌 조회가 비삭제 전체 상태에서 비삭제 `ACTIVE`만 조회하도록 바뀌었다.
   - 신규 등록과 이름 변경은 `DISCONTINUED` 이름을 재사용할 수 있다.
   - 반대로 코드 enum 또는 실 DB에 제3 상태가 있다면 그 상태도 조회에서 빠질 수 있다.
2. `POST /products/{id}/reactivate`가 상태를 `ACTIVE`로 바꾸기 전에 같은 이름의 비삭제 `ACTIVE` 행을 조회한다.
   - ACTIVE 동명이 있으면 409가 맞다.
   - ACTIVE 동명이 없는데도 조회가 자기 자신 또는 다른 상태를 충돌로 오인하면 정상 재활성화가 막힌다.

R2 diff 실행 원문:

```diff
-        productRepository.findByNameAndIsDeletedFalse(normalizedName).stream()
+        productRepository.findByNameAndStatusAndIsDeletedFalse(normalizedName, ProductStatus.ACTIVE).stream()
```

```diff
     public void reactivate(UUID id) {
-        loadOrThrow(id).reactivate();
+        Product product = loadOrThrow(id);
+        assertNameAvailable(product.getName(), product.getId());
+        product.reactivate();
     }
```

## 2. 각도 1 — `status = ACTIVE`로 놓치는 충돌

### 실 DB 상태 분포

실행 원문:

```text
BEGIN
 transaction_read_only
-----------------------
 on
(1 row)

    status    | is_deleted | rows
--------------+------------+------
 ACTIVE       | f          | 1216
 ACTIVE       | t          |   11
 DISCONTINUED | f          |    4
(3 rows)

 status_outside_code_enum
--------------------------
                        0
(1 row)
```

코드 enum 실행 원문:

```java
public enum ProductStatus {
    ACTIVE("판매중"),
    DISCONTINUED("단종");
```

DB 컬럼·제약 실행 원문:

```text
 column_name |     data_type     | udt_name | is_nullable
-------------+-------------------+----------+-------------
 status      | character varying | varchar  | NO
(1 row)

 conname | definition
---------+------------
(0 rows)
```

### 판정

**PASS — 현재 코드와 실 DB에서 의도치 않게 빠지는 제3 상태는 0개/0행이다.**

- 코드가 정의한 상태는 `ACTIVE`, `DISCONTINUED` 2개뿐이다.
- 실 DB 전체(soft-delete 포함)에도 두 값만 있고, enum 밖 상태는 0행이다.
- `DISCONTINUED`를 조회에서 제외하는 것은 이번 R2의 명시적 이름 재사용 정책이다.
- 다만 DB `status`는 `varchar`이고 CHECK 제약이 0개다. 향후 제3 상태를 추가하면 이름 점유 정책을 함께 결정해야 한다. 현재 도달 가능한 결함으로 판정하지 않는다.

## 3. 각도 2 — 정상 재활성화 거짓 409

### DISCONTINUED 4행 실측

UUID는 노출하지 않고 품목명과 충돌 수만 인용한다.

```text
            name             | active_conflicts |          expected
-----------------------------+------------------+-----------------------------
 삼성 윈드프리 11평형        |                2 | CONFLICT_REACTIVATION_409
 삼성 비스포크 스탠드 20평형 |                2 | CONFLICT_REACTIVATION_409
 삼성 DVM-S 20HP             |                1 | CONFLICT_REACTIVATION_409
 외부 통신 모듈 MIM-N10      |                0 | NORMAL_REACTIVATION_ALLOWED
(4 rows)

 discontinued_rows | normal_reactivation_candidates | correct_409_conflicts
-------------------+--------------------------------+-----------------------
                 4 |                              1 |                     3
(1 row)
```

정상 재활성화 후보만 다시 R2 guard 조건으로 조회한 원문:

```text
 normal_reactivation_candidates | guard_hits_for_normal_reactivation | normal_reactivation_false_blocks
--------------------------------+------------------------------------+----------------------------------
                              1 |                                  0 |                                0
(1 row)
```

### 판정

**PASS — 정상 재활성화를 막는 건수는 0건이다.**

- 4행 중 3행은 각각 ACTIVE 동명 1~2행이 있어 재활성화하면 ACTIVE 중복을 만든다. 이 3행의 409는 올바른 차단이다.
- 정상 재활성화 후보는 `외부 통신 모듈 MIM-N10` 1행이다. R2와 같은 `ACTIVE + is_deleted=false + exact name + 자기 ID 제외` 조건의 조회 결과는 0행이므로 409 없이 `reactivate()`까지 진행한다.

## 4. 각도 3 — 정상 수정 차단 0 유지

실행 SQL은 ACTIVE 동명 그룹의 모든 행에 대해 데스크톱이 제출하는 `BTRIM(name)`이 저장값과 달라져 guard가 실행되고, 그 이름으로 자기 외 ACTIVE 행을 찾는 경우를 센다.

실행 원문:

```text
 active_duplicate_groups | active_duplicate_rows | existing_duplicate_other_field_edits_blocked
-------------------------+-----------------------+----------------------------------------------
                     186 |                   696 |                                            0
(1 row)
```

서비스 분기 원문:

```java
if (req.name() != null && !Objects.equals(req.name(), product.getName())) {
    assertNameAvailable(req.name(), product.getId());
    product.rename(req.name());
}
```

### 판정

**PASS — ACTIVE 동명 186그룹/696행 기준 정상적인 다른 필드 수정의 이름 guard 차단은 0건이다.** 이름이 현재 저장값과 같으면 guard 자체가 실행되지 않고, 실데이터에는 데스크톱 trim 때문에 값이 달라지는 대상이 없다.

## 5. 각도 4 — ACTIVE 중복 차단과 soft-delete 재사용

R2 guard 원문:

```java
String normalizedName = name.trim();
productRepository.findByNameAndStatusAndIsDeletedFalse(normalizedName, ProductStatus.ACTIVE).stream()
        .filter(candidate -> !Objects.equals(candidate.getId(), excludedProductId))
        .findFirst()
        .ifPresent(conflict -> {
            throw new BusinessException(ErrorCode.CONFLICT,
                    "이미 사용 중인 품목명입니다: " + normalizedName
                            + " (충돌 품목 모델코드: " + conflictModelCode + ")");
        });
```

실 DB 실행 원문:

```text
 active_names_that_new_create_or_rename_would_block | active_rows_reachable_by_guard
----------------------------------------------------+--------------------------------
                                                706 |                           1216
(1 row)

 soft_deleted_rows | soft_deleted_rows_with_reusable_name | reusable_soft_deleted_names
-------------------+--------------------------------------+-----------------------------
                11 |                                    9 |                           7
(1 row)
```

### 판정

- **ACTIVE 중복 차단: PASS(코드·데이터 경로).** 현재 706개 ACTIVE 이름, 1,216행 모두 R2 조회 대상이다. 신규 등록 또는 다른 품목의 이름 변경이 이 이름 중 하나를 제출하면 자기 ID 제외 후 후보가 남아 409 경로에 도달한다.
- **soft-delete 이름 재사용: PASS(코드·데이터 경로).** soft-delete 11행은 `is_deleted=false` 조회에서 제외된다. 그중 ACTIVE 동명이 없는 9행/7개 이름은 guard 후보 0이라 재사용 가능하다. 나머지 2행은 soft-delete 때문이 아니라 별도 ACTIVE 동명이 있으므로 재사용이 막히는 것이 맞다.
- 이번 라운드에서는 공유 DB write 금지 때문에 POST/PATCH를 재실행하지 않았다. 따라서 위 판정은 현재 HEAD 소스와 실 DB SELECT의 결합 판정이며, 신규 라이브 HTTP 실행 판정은 아니다.

## 6. 각도 5 — 라이브QA 미실시 시나리오 ⑤ 재활성화

### production 코드 경로

실행 원문:

```java
@RestController
@RequestMapping("/products")
public class ProductController {

@PostMapping("/{id}/reactivate")
@ResponseStatus(HttpStatus.NO_CONTENT)
@RequirePermission(page = "products.admin", action = PermissionAction.UPDATE)
public void reactivate(@PathVariable UUID id,
                       @RequestHeader(value = ROLE_HEADER, required = false) String roleHeader) {
    productService.reactivate(id);
}
```

```java
@Service
@Transactional
public class ProductService {

public void reactivate(UUID id) {
    Product product = loadOrThrow(id);
    assertNameAvailable(product.getName(), product.getId());
    product.reactivate();
}
```

```java
public void reactivate() {
    this.status = ProductStatus.ACTIVE;
}
```

데스크톱 production 소스에서 재활성화/단종 호출을 찾은 실행 원문:

```text
> rg -n "reactivate|discontinue" clients/desktop/src -g '*.ts' -g '*.tsx'
rg_exit=1
```

### 코드·데이터 결합 결과

1. `POST /products/{id}/reactivate`는 실제 production endpoint로 존재한다.
2. 서비스 트랜잭션 안에서 현재 단종 행을 읽고, 상태 변경 전에 ACTIVE 동명만 조회하며 자기 ID를 제외한다.
3. 실데이터 4행에 적용하면 ACTIVE 동명이 있는 3행은 409, ACTIVE 동명이 없는 1행은 조회 후보 0 후 `ACTIVE` 전환이다.
4. 정상 재활성화 후보에 대한 거짓 차단은 0건이다.

### 판정

**시나리오 ⑤는 코드·실데이터 경로 기준 PASS다.** 다만 UI가 없고 공유 DB write가 금지되어 실제 HTTP `POST /reactivate`는 이번 라운드에서도 실행하지 않았다. 따라서 “라이브 HTTP PASS”로 확대하지 않는다.

## 7. 최종 판정

**R2가 만든 새 표면 1~5에서 머지 차단 결함 없음 — PASS.**

| 각도 | 실측 | 판정 |
|---|---:|---|
| 1. ACTIVE 조건으로 빠지는 예상 밖 상태 | enum 밖 상태 0개, 실 DB 0행 | PASS |
| 2. 정상 재활성화 거짓 차단 | DISCONTINUED 4행 중 정상 후보 1, guard hit 0, 거짓 차단 0 | PASS |
| 3. 정상 수정 차단 | ACTIVE 동명 186그룹/696행 중 0 | PASS |
| 4. ACTIVE 중복/soft-delete | 차단 대상 ACTIVE 이름 706개·1,216행, 재사용 가능 soft-delete 7개 이름 | PASS(코드·데이터) |
| 5. 재활성화 | 올바른 409 3행, 정상 허용 1행, 거짓 409 0 | PASS(코드·데이터) |

비차단 관찰: DB `status`에 CHECK 제약이 없으므로 미래 제3 상태 추가 시 이름 점유 정책을 명시해야 한다. 현재 코드 enum과 실 DB에는 제3 상태가 없다.

## 8. 이 라운드가 보지 않은 것

- R2 이전부터 범위 밖으로 확정된 동시 등록 경합과 API 우회 write 경로는 재검토하지 않았다.
- CI 38/38과 라이브QA 시나리오 1~4는 재실행하지 않았다. 사용자 제공 상태와 기존 보고서를 새 실행 증거로 바꾸지 않았다.
- 시나리오 ⑤의 실제 HTTP 204/409는 실행하지 않았다. UI가 없고, 실행하면 공유 DB 상태 변경이 필요하기 때문이다.
- standalone jar를 새로 빌드하거나 포트 18419로 기동하지 않았다. Docker 이미지도 재빌드하지 않았다.
- DB status CHECK 제약 추가, 미래 제3 상태 설계, DB 유니크 제약 도입 여부는 조사·변경하지 않았다.
- 코드 수정, 테스트 fixture/합성 데이터 생성, 공유 DB write/DDL은 하지 않았다.

## 9. 재현 명령과 SQL 원문

```powershell
git branch --show-current
git rev-parse HEAD
git status --short

docker exec samhan-postgres psql -X -U samhan -d product_db -v ON_ERROR_STOP=1 -c "BEGIN READ ONLY; ... SELECT ...; COMMIT;"

rg -n "reactivate|discontinue" clients/desktop/src -g '*.ts' -g '*.tsx'
```

조사 시작 기준 원문:

```text
branch=fix/1019-product-name-unique
head=2a26bf5cb36090393acd7ab5d549347e6fea92a7
git_status_short=<empty>
```

모든 DB 세션에서 확인한 원문:

```text
BEGIN
 transaction_read_only
-----------------------
 on
(1 row)
```

## 10. 새 파일 경로 목록

- `docs/dev-reports/2026-08-02-1019-r3-postfix-reconvergence.md`
