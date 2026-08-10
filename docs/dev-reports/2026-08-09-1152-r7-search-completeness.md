# PR #1152 R7 — 검색 완전성·Product 직접 응답 DTO 전수 보강

## ① 검색 절단과 선택 가능성

R6의 원인은 두 층이었다.

1. `productApi.ts`가 Spring `Page`의 `content`만 배열로 반환해 `totalElements`를 잃었다.
2. 견적 선택 모달은 `size=50` 응답만 로컬 필터링했다. 따라서 `A`의 2,686건 중 첫 50건 밖에 있는 `AP110BAPPBH2S`를 모달 필터로 찾을 수 없었다.

이번 방식은 `size=50`을 유지한다. `EstimateFormPage.tsx`의 검색도 명시적으로 `{ size: 50 }`을 사용하고, `productApi.ts`는 배열 호환 결과에 `totalElements`, `displayedElements`, `truncated` 메타데이터를 붙인다. 절단된 결과는 모달에 다음 상태를 표시한다.

> 2,686건 중 50건 표시 — 더 입력해 좁히세요

모달의 `검색 결과 필터`는 로컬 필터로 끝내지 않고 Enter 제출 시 같은 검색 함수를 한 번 호출한다. 따라서 후보별 N+1은 없고, 검색어 하나마다 API 호출은 1회다. `A`의 첫 검색은 1회이며, `AP110BAPPBH2S`를 명시적으로 좁히는 재검색이 1회 추가된다.

### RED-A / RED-B 동시 GREEN 원문

실 API QA에서 다음을 확인했다.

```text
GET /api/products?q=A&page=0&size=50
totalElements > 50
content.length = 50
AP110BAPPBH2S ∉ first page
검색 요청 수 = 1
화면: 2,686건 중 50건 표시 — 더 입력해 좁히세요

모달 필터 Enter: AP110BAPPBH2S
검색 요청 수 = 2 (A 검색 1회 + 명시적 좁히기 1회)
AP110BAPPBH2S radio 표시 → 선택 확정 → 모델 입력값 AP110BAPPBH2S
```

재현 스펙은 [1152-r7-search-completeness-real-qa.spec.ts](../../clients/desktop/playwright/1152-r7-search-completeness-real-qa/1152-r7-search-completeness-real-qa.spec.ts)이며, 실 캡처는 `resolveQaShotsDir`를 경유한 `docs/qa/1152-r7-search-completeness-real-qa/_local/`에 생성됐다.

## ② 절단 표시와 테스트

- `clients/desktop/src/renderer/api/productApi.ts:49-85` — 페이지 메타데이터 보존
- `clients/web/design-system/src/components/ProductAutocomplete/ProductAutocomplete.tsx:98-116` — 절단 안내
- `clients/web/design-system/src/components/SearchResultSelectionModal/SearchResultSelectionModal.tsx` — Enter 서버 재검색 및 안내 렌더
- `clients/desktop/src/renderer/api/productApi.search-modal.test.ts:34-45` — `2,686`, `truncated=true` 보존
- `clients/web/design-system/src/components/ProductAutocomplete/ProductAutocomplete.test.tsx` — `A` 절단 안내와 `AP110BAPPBH2S` 선택 재현

## ③ Product 직접 응답 DTO 전수 재확인

다음 grep을 product-service 전체 `src/main/java/com/samhanair/logis/product`에서 수행했다.

```powershell
Get-ChildItem services/product-service/src/main/java/com/samhanair/logis/product -Recurse -File -Filter *.java |
  Select-String -Pattern 'public record [A-Za-z]*Product[A-Za-z]*Response|public record Product[A-Za-z]*Response|class [A-Za-z]*Product[A-Za-z]*Response|class Product[A-Za-z]*Response'
```

`Product` 직접 응답 DTO는 4종이다.

| DTO | 직접 응답 용도 | `goodsType` |
|---|---|---|
| `ProductSummaryResponse` | 검색/lookup 요약 | 있음 |
| `ProductCatalogResponse` | `/api/v1/products` 카탈로그 | 있음 |
| `ProductResponse` | Product 상세 CRUD | 있음 |
| `ProductByCodeResponse` | `GET /api/products/by-code/{code}` | R7 추가 |

grep에 함께 나온 `ProductAuditLogResponse`, `ProductEditRequestResponse`, `ProductSpecResponse`는 각각 감사로그·수정요청·사양 하위 리소스 응답으로 Product 직접 응답 DTO 5종째가 아니다.

`ProductResponseGoodsTypeSerializationTest`는 네 DTO 각각을 별도 테스트 메서드로 직렬화한다. R7에서는 네 번째 테스트를 먼저 추가해 다음 RED를 관찰했다.

```text
4 tests completed, 1 failed
productByCodeResponse_serializesGoodsType
NullPointerException: JsonNode.get("goodsType") == null
```

`ProductByCodeResponse`에 `ProductGoodsType goodsType`와 `from(Product)` 매핑을 추가한 뒤 4/4 GREEN이다.

## ④ 기존 보존 확인

- `./gradlew :services:product-service:test --tests '*Product*' --rerun-tasks` — BUILD SUCCESSFUL
- `npx tsc -p tsconfig.web.json --noEmit` — exit 0
- desktop API/견적 coedit — 59/59 pass
- design-system 관련 — 51/51 pass
- 라이브 R7 — 1/1 pass, headless, mock OFF, hash-router `/#/sales/estimates/new`
- 실 DB 쓰기 없음. QA는 로그인·GET 검색·화면 선택만 수행했다.
- product-service JAR SHA: 로컬/컨테이너 모두 `e34c0836b31c533fb331f03a113acd3c789462e92c584785d5b50a3770f98d6a`
- Vite QA 프로세스와 5175 포트는 종료했다.

## 신규·변경 파일

- `clients/desktop/src/renderer/api/productApi.ts`
- `clients/desktop/src/renderer/api/productApi.search-modal.test.ts`
- `clients/desktop/src/renderer/routes/EstimateFormPage.tsx`
- `clients/desktop/src/renderer/routes/EstimateFormPage.coedit.test.tsx`
- `clients/web/design-system/src/components/AsyncAutocomplete/AsyncAutocomplete.tsx`
- `clients/web/design-system/src/components/MultiSelectAutocomplete/MultiSelectAutocomplete.tsx`
- `clients/web/design-system/src/components/ProductAutocomplete/ProductAutocomplete.tsx`
- `clients/web/design-system/src/components/ProductAutocomplete/ProductAutocomplete.test.tsx`
- `clients/web/design-system/src/components/SearchResultSelectionModal/SearchResultSelectionModal.tsx`
- `services/product-service/src/main/java/com/samhanair/logis/product/web/dto/ProductByCodeResponse.java`
- `services/product-service/src/test/java/com/samhanair/logis/product/web/dto/ProductResponseGoodsTypeSerializationTest.java`
- `clients/desktop/playwright/1152-r7-search-completeness-real-qa/1152-r7-search-completeness-real-qa.spec.ts`
