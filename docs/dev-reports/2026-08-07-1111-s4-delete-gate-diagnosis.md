# PR #1117 / 이슈 #1111 S4 삭제 관문 진단

> 진단 기준: `feat/1111-bundle-components-to-base-product` / `cafbde4de10b41b89d37049fb2b174a084dff89f`  
> 진단일: 2026-08-07 KST  
> 범위: 원인 확정만 수행. 제품 코드 수정, commit/push, 컨테이너 재빌드·재기동, 고아 행 정리 없음.

## 1. 결론

**(나) + (라), 그리고 (마: #1109 S6 증거 오판)이다.**

- 품목 전환은 `PATCH /api/products/{id}` → `ProductService.update()`를 탄다. #1109의 구성품 동의 Boolean+집합 토큰 가드는 이 경로에만 있다.
- 품목 삭제는 별도 `DELETE /api/products/{id}` → `ProductService.delete()`를 탄다. 이 메서드는 구성품을 조회하지도, 동의를 검증하지도, 자식을 soft-delete하지도 않는다.
- 현재 PR 프런트가 동의 토큰을 자동 전송한 것이 아니다. 현재 PR과 main의 기초품목 목록에는 품목 삭제 버튼 자체가 없고 `수정` 버튼만 있다. S3의 삭제는 화면 버튼이 아니라 로그인한 브라우저 컨텍스트에서 직접 호출한 관리자 API였다.
- main과 현재 PR의 삭제 메서드 및 목록 관리 액션을 원문 문자열로 비교한 결과 각각 `True`로 완전히 동일했다. 따라서 이 PR이 만든 결함이 아니라 **main에 이미 있던 서버 무결성 구멍**이다.
- #1109의 S6 PR 코멘트는 `삭제 | 관문 동작`이라고 요약했지만, S6 배포 SHA의 코드에도 DELETE 가드는 없다. #1109 S2 원문은 오히려 DELETE가 `품목과 견적 노출만 soft-delete`하고 구성품은 건드리지 않는다고 정확히 관찰한 뒤, 이를 “같은 결과를 만들지 않는다”고 잘못 무해 판정했다. 부모만 지워 활성 자식을 남기는 것이 바로 이번 결함이다.

즉, S4의 DELETE 204는 `product_type`, `itemKind`, `bundleMode` 조건 차이 때문에 가드를 우회한 것이 아니다. **삭제 endpoint에는 그 가드가 애초에 연결되어 있지 않다.**

## 2. 실제 HTTP와 직접 API 결과

### 2.1 먼저 바로잡을 점 — 화면 삭제 요청은 존재하지 않는다

현재 PR의 `ProductCatalogPage.tsx:199-215`와 main의 같은 블록은 아래처럼 동일하다.

```tsx
key: '_actions',
header: '관리',
render: (row) => canEdit ? (
  <Button onClick={() => navigate(`/products/${encodeURIComponent(row.modelCode)}/edit`)}>
    수정
  </Button>
) : null
```

`ProductFormPage`에도 부모 품목 삭제 버튼은 없다. `ProductFormPage.tsx:919`의 `삭제`는 draft 구성품 한 행을 화면 배열에서 제거한 뒤 구성품 `PUT`으로 저장하는 버튼이지 부모 품목 DELETE가 아니다.

따라서 “화면에서 부모 삭제 버튼 클릭 시 나간 요청”은 캡처할 대상 자체가 없다. S3 보고서의 표현 중 `실제 관리자 DELETE`는 UI mutation이 아니라 로그인한 브라우저 컨텍스트에서 수행한 직접 API 호출이다.

### 2.2 보존된 S3 관찰 원문

`docs/qa-shots/1111-s3-live-qa/observations.json`에 보존된 원문은 다음과 같다.

```json
"guardDelete": {
  "status": 204,
  "body": ""
}
```

S3 보고서가 함께 기록한 요청 계약:

```http
DELETE /api/products/{internal-product-id} HTTP/1.1
Cookie: <redacted session>
Body: <empty>

HTTP/1.1 204 No Content
Body: <empty>
```

- 외부 URL: `http://localhost:8080/api/products/{id}`
- 메서드: `DELETE`
- 요청 바디: 없음
- 구성품 삭제 확인 query/body/header: 없음
- 브라우저→gateway 인증 쿠키 값: 보안상 미기록·redacted
- gateway→product-service actor: DB의 `deleted_by=a0000000-0000-0000-0000-000000000001`로 전달 사실 확인

원래 S3 관찰 JSON은 응답 status/body만 보존하고 실제 브라우저 요청 헤더 전체를 저장하지 않았다. 따라서 존재하지 않는 원문 헤더를 사후에 꾸며내지 않았다. 확인 가능한 계약은 `ProductController.java:175-181`의 무본문 DELETE와 `X-User-Id`, `X-User-Role` 수신뿐이다.

### 2.3 직접 API 판정

위 S3 호출 자체가 확인 필드 없는 직접 API 재현이다. 결과는 **400이 아니라 204**였다. 같은 요청을 다시 보내면 새 고아를 만들거나 다른 QA 표본을 훼손하므로 이번 라운드에는 반복하지 않았다. 이미 남은 부모 `deleted_at=2026-08-07 21:57:49.590551`와 활성 자식 11행이 204 mutation의 DB 사후 증거다.

대조군은 같은 S3에서 이미 측정됐다.

```text
PATCH SET→GENERAL  확인 Boolean/토큰 없음 → 400 INVALID_INPUT, 자식 1행 유지
PATCH SET→MATERIAL 확인 Boolean/토큰 없음 → 400 INVALID_INPUT, 자식 1행 유지
DELETE 부모 품목  확인 필드 없음          → 204, 부모만 삭제, 자식 11행 활성 잔존
```

## 3. 코드 데이터 흐름 — 삭제와 전환의 차이

### 3.1 전환 PATCH — 가드가 있는 경로

1. `ProductController.java:135-140`이 `PATCH /products/{id}`의 JSON을 `UpdateProductRequest`로 받는다.
2. `ProductService.java:583-589`가 graph lock, BUNDLE 부모 row lock을 얻은 뒤 `assertBundleChildrenDeletionConfirmed(product, req)`를 호출한다.
3. `ProductService.java:1212-1236`이 결과가 non-BUNDLE 또는 MATERIAL인지 판정하고, 활성 구성품 목록에서 집합 토큰을 재계산해 Boolean+토큰 불일치를 `INVALID_INPUT`으로 막는다.
4. 검증을 통과한 뒤에만 `ProductService.java:1147-1159` 또는 `:1238-1247`이 `removeBundleChildren()`를 호출한다.
5. 프런트는 `ProductFormPage.tsx:297-338`에서 전환 시에만 확인창을 띄우고 Boolean+토큰을 PATCH body에 붙인다.

### 3.2 부모 DELETE — 가드가 없는 별도 경로

`ProductController.java:175-181`:

```java
@DeleteMapping("/{id}")
@ResponseStatus(HttpStatus.NO_CONTENT)
public void delete(@PathVariable UUID id, ...) {
    productService.delete(id, callerHeader);
}
```

`ProductService.java:790-797`:

```java
public void delete(UUID id, String callerId) {
    quantitySyncRuleService.lockGraphMutation();
    Product product = loadOrThrow(id);
    assertNotReferencedByEnabledQuantitySyncRule(id);
    String actor = callerId == null ? "system" : callerId;
    product.markDeleted(actor);
    softDeleteAll(exposureRepository.findByProductIdAndIsDeletedFalse(product.getId()), actor);
}
```

이 경로에는 다음이 모두 없다.

- BUNDLE 부모 row lock
- `bundleComponentRepository.findByBundleProductId(...)`
- `assertBundleChildrenDeletionConfirmed(...)`
- Boolean/집합 토큰 요청 계약
- `bundleComponentService.removeBundleChildren(...)`

따라서 활성 구성품 수와 무관하게 수량 동기화 규칙 참조만 없으면 204가 정상 코드 경로다. DB FK는 hard-delete 참조 무결성만 보장하며 soft-delete 부모/활성 자식 조합을 막지 못한다.

## 4. #1109 S6 조건과 이번 조건의 차이

사용자가 지정한 `docs/dev-reports/2026-08-07-1108-s6-reconvergence-and-live-qa.md`는 현재 HEAD와 main tree 모두에 존재하지 않는다. 저장소에 있는 #1108 원문은 S2와 S4까지이고, S6는 PR #1109 코멘트 요약으로만 남아 있다.

확인 가능한 원문 간 비교:

| 근거 | 실제 내용 | 판정 |
|---|---|---|
| PR/커밋 제목 | `세트→단일·자재 전환` | 부모 품목 DELETE가 원래 구현 범위가 아님 |
| #1109 S2 보고서 §2 | DELETE는 `품목과 견적 노출만 soft-delete하며 구성품 전량 삭제를 호출하지 않는다` | 이번 고아의 원인을 이미 관찰함 |
| #1109 S2의 이어지는 판정 | 그래서 `같은 결과를 만들지 않는다` | 오류. 부모만 삭제해 활성 고아를 만드는 무결성 결과를 놓침 |
| #1109 S4 라이브QA 목록 | 구성품 있는 세트→단일, 자재 전환, 0건 전환, 표시 건수/실삭제 건수 | 부모 품목 DELETE 시나리오 없음 |
| #1109 S6 PR 코멘트 | `삭제 | 관문 동작` | 코드상 구성품 동의 가드가 DELETE에 도달할 수 없어 재현 원문 없이는 유효한 증거가 아님 |
| 이번 S3 | 구성품 11행 부모에 직접 DELETE → 204, 부모만 삭제 | 실제 누락 경로를 밟음 |

#1109 최종 S6 배포 대상 `d77dc11cc`와 최초 가드 `e98a60983`, 머지 `0fb998336`의 `ProductService.delete()`를 각각 확인했으며 모두 현재 main과 같은 무가드 8행이다. 따라서 “같은 jar인데 예전에는 DELETE 가드가 동작했다”가 아니라, **그 jar에는 부모 DELETE용 구성품 가드가 처음부터 없었다.** S6의 `삭제 관문 동작`은 전환 중 구성품 삭제와 부모 품목 삭제를 혼동했거나, 다른 차단 조건을 구성품 가드로 오인한 false positive로 판정한다. 원문 파일이 없어 둘 중 세부 방식은 더 좁힐 수 없지만, 어느 경우든 DELETE 구성품 동의 가드를 검증한 증거일 수는 없다.

## 5. main 대조 — 이 PR이 만든 것인가

현재 PR과 main에서 아래 두 코드 블록을 직접 추출해 원문 비교했다.

```text
ProductService.delete()             EXCERPTS_EQUAL=True
ProductCatalogPage 관리 action 블록 CATALOG_ACTIONS_EQUAL=True
```

- main 프런트에도 부모 품목 삭제 버튼이 없다.
- main 서버의 직접 DELETE도 같은 `ProductService.delete()`를 호출한다.
- 이 PR의 관련 diff는 구성품 편집기를 견적품목 화면에서 기초품목 상세로 옮긴 것이며, 부모 DELETE 호출자나 서버 delete 메서드를 변경하지 않았다.
- 오늘 S3 이전부터 `QA797-SET-01` 아래 활성 고아 2행이 이미 존재했다.

**최종 귀속: 선재 결함. PR #1117이 만든 결함이 아니다.** 다만 PR #1117이 구성품 편집을 기초품목 상세로 옮겨 구성품 있는 테스트 세트를 쉽게 만들 수 있게 되면서 선재 DELETE 구멍의 도달·관측 가능성이 커졌다.

## 6. 활성 고아 13행 SELECT 원문과 출처 판정

### 6.1 사용한 SELECT

```sql
SELECT p.model_code AS parent_model_code,
       p.name AS parent_name,
       p.created_at AS parent_created_at,
       p.created_by AS parent_created_by,
       p.deleted_at AS parent_deleted_at,
       p.deleted_by AS parent_deleted_by,
       count(*) AS active_child_count,
       min(bc.created_at) AS first_child_created_at,
       max(bc.created_at) AS last_child_created_at,
       string_agg(DISTINCT bc.created_by, ', ' ORDER BY bc.created_by) AS child_created_by
FROM bundle_component bc
JOIN products p ON p.id = bc.bundle_product_id
WHERE bc.is_deleted = false AND p.is_deleted = true
GROUP BY p.id, p.model_code, p.name, p.created_at, p.created_by,
         p.deleted_at, p.deleted_by
ORDER BY p.deleted_at, p.model_code;
```

### 6.2 집계 원문

```text
active_orphan_count = 13

parent_model_code              active_child_count  parent_created_at            parent_created_by                         parent_deleted_at            parent_deleted_by
QA797-SET-01                    2                   2026-07-12 09:21:42.924557     qa798                                    2026-07-28 20:34:06.452278   system-sheet-sync
S3-1111-GUARD-20260807-S3      11                  2026-08-07 21:54:16.984334     a0000000-0000-0000-0000-000000000001   2026-08-07 21:57:49.590551   a0000000-0000-0000-0000-000000000001
```

### 6.3 13행 상세 원문

```text
QA797-SET-01 / QA797-PART-01 / qty 2.00 / ACCESSORY / created 2026-07-12 09:21:42.924557 / by qa798
QA797-SET-01 / QA797-PART-02 / qty 1.00 / ACCESSORY / created 2026-07-12 09:21:42.924557 / by qa798

S3-1111-GUARD-20260807-S3 / AC023CN1DBC1 / qty 2.50 / ACCESSORY / created 2026-08-07 21:57:43.793170
S3-1111-GUARD-20260807-S3 / AC023CN1PBH1 / qty 1.00 / ACCESSORY / created 2026-08-07 21:57:43.793306
S3-1111-GUARD-20260807-S3 / AC023CX1DBC1 / qty 1.00 / ACCESSORY / created 2026-08-07 21:57:43.793369
S3-1111-GUARD-20260807-S3 / AC023CX1PBH1 / qty 1.00 / ACCESSORY / created 2026-08-07 21:57:43.793443
S3-1111-GUARD-20260807-S3 / AC032CN1DBC1 / qty 1.00 / ACCESSORY / created 2026-08-07 21:57:43.793535
S3-1111-GUARD-20260807-S3 / AC032CN1PBH1 / qty 1.00 / ACCESSORY / created 2026-08-07 21:57:43.793636
S3-1111-GUARD-20260807-S3 / AC032CX1DBC1 / qty 1.00 / ACCESSORY / created 2026-08-07 21:57:43.793719
S3-1111-GUARD-20260807-S3 / AC032CX1PBH1 / qty 1.00 / ACCESSORY / created 2026-08-07 21:57:43.793841
S3-1111-GUARD-20260807-S3 / AC040CN1DBC1 / qty 1.00 / ACCESSORY / created 2026-08-07 21:57:43.793926
S3-1111-GUARD-20260807-S3 / AC040CN1PBH1 / qty 1.00 / ACCESSORY / created 2026-08-07 21:57:43.794050
S3-1111-GUARD-20260807-S3 / AC040CX1DBC1 / qty 1.00 / ACCESSORY / created 2026-08-07 21:57:43.794122
```

S3 11행의 `created_by`는 모두 부모와 같은 `a000...0001`이고 이름에 `S3-1111`이 명시돼 있어 **이번 S3 QA 산물**이다. QA797 2행도 부모·자식 코드와 이름에 `QA797`, `created_by=qa798`이 명시돼 있어 **과거 QA 산물**이다. 실 운영 데이터로 판정되는 행은 0개다. 그러나 지시대로 이번 라운드에는 어느 행도 soft-delete/복구하지 않았다.

## 7. 고아가 화면·집계에 보이는 방식

### 7.1 보이지 않는 곳

- 기초품목 카탈로그: `ProductCatalogController.java:171-184`가 먼저 활성 Product page의 BUNDLE id만 모은 뒤 그 id 집합의 구성품만 조회한다. 삭제 부모와 13행은 목록 및 `componentCount`에서 숨는다.
- 견적 구성품 벌크: `EstimateCatalogInternalController.java:302-310`도 활성 부모 id 집합을 먼저 만든다. 13행은 견적품목/집계에 나오지 않는다.
- 삭제 부모의 상세/구성품 화면: 부모 조회가 `is_deleted=false`를 요구하므로 진입할 수 없다.
- 따라서 S3에서 부모는 목록에서 사라졌지만, `SELECT count(*) FROM bundle_component WHERE is_deleted=false` 같은 부모 미조인 전역 집계에는 13행이 계속 포함된다.

### 7.2 실제로 오염되는 곳

`BundleComponentRepository.java:55-60`의 `findByComponentProductCode()`는 자식 행의 `is_deleted=false`만 보고 부모의 `is_deleted`를 보지 않는다. `ProductService.java:1059-1094`의 단일 품목 응답 변환은 그 결과의 부모를 `findAllByIdIn()`으로 읽는데, 이 메서드도 삭제 부모를 제외하지 않는다.

그 결과 이번 S3 11개 코드에는 모두 기존 활성 부모 1개 이상 + 삭제된 S3 부모 1개가 함께 잡힌다. 실측:

```text
AC023CN1DBC1  활성 부모 2 + 삭제 부모 1
나머지 S3 실제 구성품 10개  활성 부모 1 + 삭제 부모 1
QA797-PART-01/02  활성 부모 0 + 삭제 부모 1
```

`findParentComponentLink()`는 부모 후보가 정확히 1개일 때만 `SET_COMPONENT`를 반환하고 2개 이상이면 `null`을 반환한다. 따라서 S3의 실제 구성품 11개는 상세/lookup에서 삭제 부모 때문에 부모 판정이 모호해져 `GENERAL`로 보일 수 있다. 즉 고아는 부모 세트 화면에서는 숨지만, 자식 품목의 종류/부모 링크 판정을 실제로 오염시킨다.

## 8. 권장 fix 방향 — 다음 라운드 구현 대상

1. 부모 DELETE에도 전환과 같은 **구성품 집합 동의 계약**을 둔다. 별도 `DeleteProductRequest(confirmBundleChildrenDeletion, expectedBundleComponentSetToken)` 또는 동등한 명시 계약을 사용하고, 확인 없는 componentful BUNDLE DELETE는 400으로 fail-closed한다.
2. `ProductService.delete()`에서 graph lock 다음 BUNDLE 부모 row lock → 활성 구성품 1회 조회 → Boolean+집합 토큰 검증 순서를 사용한다. #1109의 발급/실행 집합 원자성 규칙을 그대로 지킨다.
3. 유효한 동의 뒤에는 같은 actor로 자식 `bundle_component`, 노출 행, 부모를 한 트랜잭션에서 모두 soft-delete한다. 부모만 삭제되는 중간 커밋을 허용하지 않는다.
4. 구성품 0건 BUNDLE 및 일반 품목 DELETE는 확인 없이 기존 204를 유지하는 회귀 테스트를 둔다.
5. 직접 API 무동의 400, stale/타 품목/Boolean-only 토큰 400, 정상 토큰 204+부모/자식 동시 soft-delete, 동시 변경/동시 DELETE 테스트를 추가한다.
6. 방어적으로 `findParentComponentLink()`의 부모 조회도 `is_deleted=false`를 강제한다. 이는 기존 고아가 정리되기 전 화면 오염을 막는 별도 방어선이다.
7. 13행은 모두 QA 산물로 판정됐지만 이번 라운드에는 보존했다. 다음 라운드에서 fix 검증과 분리해 provenance를 다시 확인한 뒤 BaseEntity 규칙대로 soft-delete하고, 부모-자식 활성 상태 불일치가 0인지 SELECT로 검증한다.

## 9. 이번 라운드 비변경 확인

- 제품 코드 수정 없음
- DB `INSERT/UPDATE/DELETE` 없음; SELECT만 수행
- 고아 13행 그대로 보존
- 다른 워크트리 접근 없음
- commit/push 없음
- 컨테이너 재빌드·재기동 없음

