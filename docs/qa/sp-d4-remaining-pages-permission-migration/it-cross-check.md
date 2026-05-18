# SP-D4 IT 회귀 가드 Cross-Check

> 작성일: 2026-05-18
> 작성자: QA (Claude)
> 검토 대상: BE agent 작성 예정 7 IT (EstimatePermissionIT / PartnerOrderListPermissionIT / WarehousePermissionIT / EmployeePermissionIT / PartnerAdminPermissionIT / ProductPermissionIT / ArologisAdminPermissionIT)
> 회귀 기준: SP-D2 P04 NPE 트랩 + SP-D3 cycle 3 X-User-Role 헤더 누락 회귀

---

## 필수 3종 패턴 (SP-D3 cycle 3 회고 반영)

BE agent 가 SP-D4 IT 를 작성할 때 반드시 준수해야 할 3종 패턴:

```java
// 패턴 1: @MockBean DynamicPermissionClient 명시
@MockBean
private DynamicPermissionClient dynamicPermissionClient;

// 패턴 2: @BeforeEach lenient stub (canView=true, canEdit=true 기본값)
@BeforeEach
void setupLenientStubs() {
    Mockito.lenient()
        .when(dynamicPermissionClient.canView(anyString(), anyString()))
        .thenReturn(true);
    Mockito.lenient()
        .when(dynamicPermissionClient.canEdit(anyString(), anyString()))
        .thenReturn(true);
}

// 패턴 3: X-User-Role 헤더 명시 (SP-D3 cycle 3 회고 — @WithMockUser 만으로 부족)
mockMvc.perform(get("/api/v1/...")
    .header("X-User-Role", "MASTER")
    ...
```

---

## IT 점검 매트릭스

아래 표는 BE agent 가 IT 를 작성하면 QA 가 검토할 기준표다.

SP-D4 브랜치 기준 2026-05-18 현재 7 IT 파일 미작성 상태 — BE 작업 완료 후 재검토 필요.

| IT 파일 | 예상 서비스 | @MockBean DynamicPermissionClient | @BeforeEach lenient stub | X-User-Role 헤더 | deny override (.thenReturn(false)) | 현재 상태 |
|---|---|---|---|---|---|---|
| `EstimatePermissionIT` | slip-service | 필수 | 필수 | 필수 | 필수 (canView=false case) | **미작성** |
| `PartnerOrderListPermissionIT` | partner-order-service | 필수 | 필수 | 필수 | 필수 (canView=false case) | **미작성** |
| `WarehousePermissionIT` | inventory-service | 필수 | 필수 | 필수 | 필수 (canView=false + canEdit=false case) | **미작성** |
| `EmployeePermissionIT` | user-service | 필수 | 필수 | 필수 | 필수 (canView=false case) | **미작성** |
| `PartnerAdminPermissionIT` | partner-service | 필수 | 필수 | 필수 | 필수 (canView=false + partners.block deny case) | **미작성** |
| `ProductPermissionIT` | product-service | 필수 | 필수 | 필수 | 필수 (products.admin canEdit=false case) | **미작성** |
| `ArologisAdminPermissionIT` | arologis-service | **기존 IT 확장** (ArologisDynamicPermissionIT) | 기존 lenient stub 활용 | 기존 헤더 패턴 활용 | 필수 (arologis.admin + arologis.region deny case) | **미작성 (확장 필요)** |

---

## 기존 IT 패턴 준수 확인 (SP-D2/D3 기준)

SP-D2/D3 에서 이미 작성된 IT 의 패턴 준수 여부 검토:

| IT 파일 | @MockBean | lenient stub | X-User-Role 헤더 | deny override | 판정 |
|---|---|---|---|---|---|
| `AccountingDynamicPermissionIT` (SP-D2) | O (`DynamicPermissionClient`) | O (`lenient().when(...)`) | O (`.header("X-User-Role", ...)`) | O (`when(...).thenReturn(false)`) | **PASS** |
| `ArologisDynamicPermissionIT` (SP-D3) | O (`DynamicPermissionClient`) | O (`lenient().when(...)`) | O (`.header("X-User-Role", "MASTER")`) | O (`when(...).thenReturn(false)`) | **PASS** |
| `SlipDynamicPermissionIT` (SP-D3) | O (`DynamicPermissionClient`) | O (`Mockito.lenient()...`) | O (`.header("X-User-Role", "SALES")` 등) | O (`Mockito.when(...).thenReturn(false)`) | **PASS** |
| `DispatchSmsAuditDynamicPermissionIT` (SP-D3) | 확인 필요 | 확인 필요 | 확인 필요 | 확인 필요 | **검토 대기** |
| `NotificationDynamicPermissionIT` (SP-D3) | 확인 필요 | 확인 필요 | 확인 필요 | 확인 필요 | **검토 대기** |

---

## SP-D4 신규 IT 작성 가이드

### IT 별 PageCode × 검증 케이스 (최소 deny 1 + allow 1)

**1. EstimatePermissionIT (slip-service)**

```
C1: MANAGER, estimates.list canView=true → GET /estimates 200 OK
C2: WAREHOUSE, estimates.list canView=false → GET /estimates 403 FORBIDDEN
C3: SALES, estimates.list canEdit=false → POST /estimates 403 (view-only override)
```

**2. PartnerOrderListPermissionIT (partner-order-service)**

```
C1: SALES, sales.partner-order.list canView=true → GET /partner-orders 200 OK
C2: WAREHOUSE, sales.partner-order.list canView=false → GET /partner-orders 403
C3: SALES, sales.partner-order.draft canEdit=true → POST /partner-orders 200 or 422
C4: ACCOUNTANT, sales.partner-order.draft canView=false → POST /partner-orders 403
C5: SALES, sales.partner-order.confirm canView=true → POST /partner-orders/{id}/confirm 200 or 422
```

**3. WarehousePermissionIT (inventory-service)**

```
C1: WAREHOUSE, inventory.warehouse canView=true → GET /warehouses 200 OK
C2: DISPATCH, inventory.warehouse canView=false → GET /warehouses 403
C3: WAREHOUSE, inventory.warehouse canEdit=true → POST /warehouses 200 or 422
C4: INVENTORY, inventory.stock canView=true → GET /stocks 200 OK
C5: DISPATCH, inventory.stock canEdit=false → POST /stocks 403 (view-only)
```

**4. EmployeePermissionIT (user-service)**

```
C1: MASTER, admin.employees canView=true → GET /admin/employees 200 OK
C2: SALES, admin.employees canView=false → GET /admin/employees 403
C3: MASTER, admin.users canView=true → GET /admin/users 200 OK
C4: MANAGER, admin.users canView=false → GET /admin/users 403
```

**5. PartnerAdminPermissionIT (partner-service)**

```
C1: MANAGER, partners.list canView=true → GET /admin/partners 200 OK
C2: DISPATCH, partners.list canView=false → GET /admin/partners 403
C3: ACCOUNTANT, partners.list canEdit=false → POST /admin/partners 403 (view-only)
C4: MASTER, partners.block canView=true → GET /admin/partners/block 200 OK
C5: SALES, partners.block canView=false → GET /admin/partners/block 403
```

**6. ProductPermissionIT (product-service)**

```
C1: MASTER, products.list canView=true → GET /products 200 OK
C2: DISPATCH, products.list canView=false → GET /products 403
C3: SALES, products.admin canEdit=true → POST /admin/products/categories 200 or 422
C4: WAREHOUSE, products.admin canEdit=false → POST /admin/products/categories 403
```

**7. ArologisAdminPermissionIT (arologis-service — 기존 ArologisDynamicPermissionIT 확장)**

```
기존 C1~C6 (dispatch.board) 유지 + 추가:
C7: DISPATCH, arologis.admin canView=true → GET /api/v1/arologis/admin/... 200 OK
C8: INVENTORY, arologis.admin canView=false → GET /api/v1/arologis/admin/... 403
C9: DISPATCH, arologis.region canView=true → GET /api/v1/arologis/admin/regions 200 OK
C10: SALES, arologis.region canView=false → GET /api/v1/arologis/admin/regions 403
```

---

## 공통 기타 MockBean 목록 (서비스별)

BE agent 가 IT 작성 시 각 서비스의 외부 client 를 모두 @MockBean 처리해야 함.

| 서비스 | 추가 @MockBean 필요 client |
|---|---|
| slip-service | InventoryClient, ProductClient, PartnerInternalClient, PartnerBlockClient, NotificationClient, NotificationChatRoomClient, ArologisDispatchClient |
| partner-order-service | PartnerClient, ProductClient, EstimateClient, NotificationClient |
| inventory-service | ProductClient, PartnerClient, SlipServiceClient |
| user-service | (외부 client 적음 — auth flow 확인) |
| partner-service | (외부 client 적음 — 기존 IT 참고) |
| product-service | InventoryClient, PartnerClient |
| arologis-service | PartnerClient, SlipClient, NotificationClient, SlipServiceClient (기존 ArologisDynamicPermissionIT 참고) |

---

## IT 100% 패턴 준수 여부 종합

**현재 상태 (2026-05-18)**: SP-D4 전용 IT 7개 모두 미작성.

BE agent 작업 완료 후 QA 는 다음 항목을 재검토:

1. 각 IT 파일에 `@MockBean DynamicPermissionClient` 선언 존재 여부
2. `@BeforeEach void setup...()` 내 `lenient().when(dynamicPermissionClient.canView(...)).thenReturn(true)` + `canEdit` lenient stub 존재 여부
3. 모든 `mockMvc.perform(...)` 호출에 `.header("X-User-Role", ...)` 명시 여부
4. deny 검증 케이스에서 `Mockito.when(dynamicPermissionClient.canView(...)).thenReturn(false)` override 존재 여부

> SP-D3 cycle 3 회귀 패턴: `@WithMockUser` 만으로는 정적 가드 통과 불가. X-User-Role 헤더 별도 명시 필수.
