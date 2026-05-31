# 2.6d 재고조회 모달 — BE 리뷰 사이클 1

**리뷰어**: Claude BE  
**대상 브랜치**: feat/2-6d-inventory-lookup-modal  
**대상 파일**: `services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/web/dto/PartnerOrderDetailResponse.java`  
**변경 요약**: `LineResponse` record 에 `productId: String` 필드 추가 + `from()` 매핑 1줄 추가

---

## 1. null 안전성 — `line.getProductId().toString()`

**분석**

`PartnerOrderLine.productId` 는 `@Column(name = "product_id", nullable = false)` 로 DB not-null 제약이 걸려 있다.  
생성자(`PartnerOrderLine(...)`) 내부에서 명시적으로 `if (productId == null) throw new IllegalArgumentException("productId 필수")` 검증을 수행한다.  
따라서 `line.getProductId()` 는 정상 런타임에서 절대 `null` 이 될 수 없고, `.toString()` 에서 NPE 발생 가능성은 **없음**.

**결론**: 안전.

---

## 2. UUID 비공개 원칙 위반 여부

**분석**

`feedback_uuid_no_user_visibility` 규칙은 **사용자 화면 노출** 을 금지하며 payload 포함 자체는 허용한다.

- Javadoc `@param productId`: "재고 batch 조회 키. 사용자 화면 미노출(UUID 비공개)." — 의도 명시 OK.
- FE `InventoryLookupModal.tsx` 주석: "productId / warehouseId 는 내부 key 전용 — 화면 미노출."
- `InventoryLookupModal` 의 `<tr key={row.productId}>` — React key 속성으로만 사용, DOM text 미렌더링.
- `inventory.ts` 전체에서 `productId` 는 axios body/path param 및 `Map` key 로만 사용, JSX text 노출 없음.
- `SalesPartnerOrderDetailPage.tsx` 에서는 filter + batch 요청 파라미터 조립에만 사용.

**결론**: UUID 비공개 원칙 위반 없음.

---

## 3. LineResponse 소비처 회귀 점검

**LineResponse 소비처 목록**

| 소비처 | 방식 | 회귀 여부 |
|---|---|---|
| `PartnerOrderDetailResponse.from(PartnerOrder)` | `LineResponse::from` 스트림 매핑 | 변경 없음 — 컴파일 성공 확인 |
| `PartnerOrderPermissionControllerIT` (170라인) | `new PartnerOrderDetailResponse(..., List.of())` | `lines = List.of()` — `LineResponse` 생성자 호출 없음, 위반 없음 |
| `PartnerOrderDetailIT.saveOrder()` | `PartnerOrderLine.create()` → DB 경유 | `from()` 경로로 역직렬화, productId가 not-null이므로 안전 |
| `PartnerOrderRestoreResponse.from()` | `PartnerOrderDetailResponse.from(result.order())` 위임 | 동일 경로, 문제 없음 |
| `PartnerOrderHoldService`, `PartnerOrderUpdateService`, `PartnerOrderQueryService`, `PartnerOrderFromEstimateService` | 모두 `PartnerOrderDetailResponse.from(order)` 위임 | 회귀 없음 |

컴파일 검증: `gradlew :services:partner-order-service:compileJava :services:partner-order-service:compileTestJava` — **BUILD SUCCESSFUL** 확인.

**결론**: 소비처 전체 회귀 없음.

---

## 4. 한국어 Javadoc

**분석**

추가된 `@param productId` 은 "재고 batch 조회 키. 사용자 화면 미노출(UUID 비공개)." 로 한국어 작성됨.  
기존 `@param lineId` 이하 Javadoc 모두 한국어. 규칙 준수.

**결론**: 한국어 Javadoc 의무 충족.

---

## 5. 추가 관찰 사항 (MINOR — 차단 아님)

- `PartnerOrderDetailResponse` 클래스 수준 Javadoc (13라인) 에 "라인 내부 식별자 / product 내부 식별자는 응답하지 않는다" 고 되어 있는데, 이번 변경으로 `productId` 가 실제 응답에 포함됨. 주석이 사실과 달라졌으므로 다음 슬라이스 시 업데이트가 필요하다. 현재 기능에 영향은 없고 Javadoc 오탐 수준.
- `PartnerOrderDetailIT.detail_by_order_number_returns_header_and_lines()` 테스트가 `lines[0].productId` 존재 여부를 검증하지 않는다. IT 신뢰성 강화 차원에서 `jsonPath("$.data.lines[0].productId").exists()` 단언 추가를 권고한다 (차기 슬라이스 또는 이 PR 내).

---

## 종합 평가

| 항목 | 결과 |
|---|---|
| NPE 안전성 | 통과 (not-null 컬럼 + 생성자 선검증) |
| UUID 비공개 원칙 | 통과 (FE 화면 미노출 확인) |
| 소비처 회귀 | 통과 (컴파일 BUILD SUCCESSFUL + 경로 분석) |
| 한국어 Javadoc | 통과 |

**결정: APPROVE**  
변경 규모 1 필드 추가, 안전성 4개 항목 모두 통과. MINOR 관찰 2건은 차단 사유 아님.
