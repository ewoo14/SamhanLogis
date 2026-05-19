# SP-08-FU2 QA 시나리오 계획

슬라이스: SP-08-FU2 (Test Safety Bulk — 4건 통합)
작성일: 2026-05-19
작성자: QA agent
브랜치: feat/sp-08-fu2-test-safety-bulk

---

## 0. 범위 요약

| 항목 | 서비스 | 핵심 변경 |
|---|---|---|
| P2-2 | slip-service | `destination_warehouse_name` 컬럼 + `SlipDetailResponse.destinationWarehouseName` 노출 |
| P2-3 | partner-service / accounting-service | `GET /internal/partners/{partnerId}` + `PartnerLookupClient.findByPartnerId()` 실 구현 |
| P2-4 | accounting-service | `LedgerResponse.LedgerLine.accountName` + `LedgerImageResponse.LedgerLine.accountName` 추가, LEFT JOIN ChartOfAccount |
| P2-5 | clients/desktop | `TaxInvoiceListPage` 일괄 발행 버튼 navigate path 정합 |

---

## Q1. P2-2 — warehouse name snapshot

### 시나리오 Q1-1: 입고전표 생성 시 destinationWarehouseName snapshot 저장

**목적**: 신규 INBOUND 전표 생성 시 `destinationWarehouseId` 로 inventory-service 를 조회하고
결과 창고명을 `destination_warehouse_name` 컬럼에 snapshot 저장함을 검증.

**선행 조건**
- AbstractPostgresIT 싱글턴 컨테이너 기동 (postgres:16-alpine)
- Flyway V26 자동 적용 (`destination_warehouse_name VARCHAR(100)`)
- `@MockBean InventoryClient` + lenient stub: `lookupWarehouseName(anyUUID)` → `Optional.of("서울 창고")`
- `@MockBean ProductClient` + lenient stub 적용

**실행 단계**

1. `POST /slips` — `slipType=INBOUND, destinationWarehouseId=<uuid>` 포함 요청
2. `GET /slips/{id}` 단건 조회
3. 응답 `data.destinationWarehouseName` 필드 확인

**예상 결과**

| 검증 항목 | 기대값 |
|---|---|
| HTTP 상태 | 201 (생성) |
| `data.destinationWarehouseName` | `"서울 창고"` (Mock stub 반환값) |
| DB 컬럼 `destination_warehouse_name` | `"서울 창고"` (직접 쿼리 또는 GET 응답으로 확인) |

**IT 구현 힌트**

```java
// SlipControllerIT 또는 SlipDomainIT 내 신규 @Test
@MockBean InventoryClient inventoryClient;  // lenient (memory feedback_it_mockbean_external_clients)
@MockBean ProductClient productClient;

@BeforeEach
void stubClients() {
    lenient().when(inventoryClient.lookupWarehouseName(any()))
             .thenReturn(Optional.of("서울 창고"));
    // productClient stub — product 조회 기본값
}

@Test
void givenInboundSlip_whenCreated_thenDestinationWarehouseNameSnapshotted() {
    // POST /slips + destinationWarehouseId 포함
    // GET /slips/{id} → $.data.destinationWarehouseName == "서울 창고"
}
```

---

### 시나리오 Q1-2: inventory-service 호출 실패 시 null 유지 (fail-soft)

**목적**: inventory-service 가 404 또는 5xx 를 반환해도 전표 생성이 성공하고
`destinationWarehouseName` 은 null 로 저장됨을 검증.

**선행 조건**
- `@MockBean InventoryClient` stub: `lookupWarehouseName` → `Optional.empty()`

**예상 결과**

| 검증 항목 | 기대값 |
|---|---|
| HTTP 상태 | 201 (생성 성공 — 실패 전파 금지) |
| `data.destinationWarehouseName` | `null` 또는 응답 필드 누락 (FE 는 `'—'` 표시) |

---

### 시나리오 Q1-3: SlipDetailResponse destinationWarehouseName 필드 존재 확인

**목적**: `GET /slips/{id}` 응답 JSON 에 `destinationWarehouseName` 키가 포함됨을 확인
(기존 전표 기존 row — null 이어도 키 자체는 반환).

**검증 SQL (직접 DB 확인용)**

```sql
-- slip-service DB
SELECT id, destination_warehouse_id, destination_warehouse_name
FROM slips
WHERE id = '<test-slip-uuid>';
-- 기대: destination_warehouse_name = '서울 창고' (Q1-1 케이스)
-- 또는: destination_warehouse_name IS NULL (Q1-2 케이스)
```

---

### 시나리오 Q1-4 (선택): 기존 슬립 backfill 검증

**목적**: Flyway V26 이 `ADD COLUMN IF NOT EXISTS` 로 안전하게 기존 row 를 유지하는지 확인.

**검증 방법**
- V26 마이그레이션 실행 전후 기존 슬립 row 수 동일
- `destination_warehouse_name IS NULL` (backfill 미실행 시 기본값)
- `IF NOT EXISTS` 가드로 2회 재실행 시 오류 없음 (idempotent)

---

## Q2. P2-3 — PartnerLookupClient 실 구현

### 시나리오 Q2-1: partner-service `GET /internal/partners/{partnerId}` 신규 endpoint 200 응답

**목적**: partner-service 에 UUID 기반 internal lookup endpoint 가 추가되었음을 확인.

**주의**: 현재 `PartnerInternalController` 는 `/{partnerCode}` (문자열) 기반 endpoint 만 존재.
P2-3 는 UUID 기반 endpoint `GET /internal/partners/{partnerId}` 를 신규 추가하는 것이 목표.
본 시나리오는 해당 endpoint 의 추가 여부를 확인하는 회귀 검증 역할을 겸함.

**선행 조건**
- partner-service AbstractPostgresIT 기동
- 시드 데이터: `Partner` 1건 (id=UUID, partnerCode="P-2026-0001", name="삼한물산")

**실행 단계**

1. `GET /internal/partners/{partnerId}` — 존재하는 UUID 로 요청 (X-Internal-Token 첨부)
2. `GET /internal/partners/{nonExistentId}` — 미존재 UUID 로 요청

**예상 결과**

| 케이스 | HTTP 상태 | 응답 |
|---|---|---|
| 정상 | 200 | `data.partnerId`, `data.partnerCode`, `data.name` 포함 |
| 미존재 | 404 | `NOT_FOUND` ErrorCode |
| 토큰 누락 | 403 | FORBIDDEN |

---

### 시나리오 Q2-2: accounting-service PartnerAgingService — partnerCode + name 정상 표시

**목적**: `PartnerLookupClient.findByPartnerId(UUID)` 가 실 구현된 후
`PartnerAgingService.buildReport()` 가 fallback `"(미조회)"` 대신 실제 partnerName 을 반환함을 검증.

**현재 상태 확인**

현재 `PartnerLookupClient.findByPartnerId` 는 placeholder 구현 (`항상 empty 반환`).
P2-3 구현 완료 후 아래 검증 수행.

**선행 조건**
- `@MockBean PartnerLookupClient` + stub: `findByPartnerId(PARTNER_UUID)` → `Optional.of(new PartnerSummary(id, "P-2026-0001", "삼한물산", null, null))`
- 분개 라인 fixture: `partnerId=PARTNER_UUID, accountCode="110", debit=500000, credit=100000`

**예상 결과**

| 검증 항목 | 기대값 |
|---|---|
| `PartnerAgingLine.partnerCode` | `"P-2026-0001"` (UUID 문자열 아님) |
| `PartnerAgingLine.partnerName` | `"삼한물산"` (`"(미조회)"` 아님) |

**기존 테스트 파일 참고**

`PartnerAgingServiceTest.java` — `@MockitoSettings(strictness = Strictness.LENIENT)` 이미 적용.
신규 @Test 메서드 추가로 커버 가능.

---

### 시나리오 Q2-3: fail-soft — 404/5xx 시 partnerCode UUID 문자열 fallback

**목적**: partner-service 가 응답하지 않아도 aging 보고서가 정상 반환되고
fallback 으로 `partnerCode = partnerId.toString()`, `partnerName = "(미조회)"` 사용.

**선행 조건**
- `@MockBean PartnerLookupClient` stub: `findByPartnerId(any())` → `Optional.empty()`

**예상 결과**

| 검증 항목 | 기대값 |
|---|---|
| HTTP 상태 | 200 (서비스 실패 전파 금지) |
| `partnerCode` | UUID 문자열 (예: `"3f1c2d9a-..."`) |
| `partnerName` | `"(미조회)"` |

---

### 시나리오 Q2-4: @MockBean 누락 IT 확인

**목적**: accounting-service IT 클래스에 `@MockBean PartnerLookupClient` 가 빠진 경우
Eureka 비활성 환경에서 500 이 발생하는지 확인 (memory feedback_it_mockbean_external_clients 가드).

**검증 방법**

아래 IT 클래스에서 `@MockBean PartnerLookupClient` 선언 여부를 수동 확인:

- `JournalControllerIT.java`
- `TrialBalanceControllerIT.java`
- `SliceBValidationIT.java`
- `SliceCValidationIT.java`
- 기타 `AbstractPostgresIT` 상속 IT 전체

누락된 경우 해당 IT 에 `@MockBean private PartnerLookupClient partnerLookupClient;` 추가 필요.

---

## Q3. P2-4 — LedgerLine.accountName

### 시나리오 Q3-1: LedgerResponse.LedgerLine — accountName 필드 포함

**목적**: `GET /accounting/ledger` 응답의 `lines[*].accountName` 이 ChartOfAccount 에서
LEFT JOIN 하여 채워짐을 검증.

**선행 조건**
- AbstractPostgresIT 기동
- ChartOfAccount 시드 확인: code="110" → name="외상매출금"
- 분개 라인 fixture: `accountCode="110"` 포함 POSTED Journal
- `@MockBean PartnerLookupClient` lenient stub
- `@MockBean DynamicPermissionClient` lenient stub (SP-D2)

**실행 단계**

1. `POST /accounting/journals` → `POST /accounting/journals/{id}/post` — accountCode="110" 포함
2. `GET /accounting/ledger?from=2026-01-01&to=2026-12-31` 조회

**예상 결과**

| 검증 항목 | 기대값 |
|---|---|
| `data.lines[0].accountCode` | `"110"` |
| `data.lines[0].accountName` | `"외상매출금"` |

---

### 시나리오 Q3-2: LedgerImageResponse.LedgerLine — accountName 필드 포함

**목적**: `GET /accounting/ledger/image/{partnerCode}` 응답의 `lines[*].accountName` 도
동일하게 채워짐을 검증.

**선행 조건**
- Q3-1 과 동일 + partnerCode 필터용 `@MockBean PartnerLookupClient` stub 정상 반환

**예상 결과**

| 검증 항목 | 기대값 |
|---|---|
| `data.lines[0].accountName` | `"외상매출금"` |

---

### 시나리오 Q3-3: ChartOfAccount 미등록 code — null 또는 빈 문자열 반환

**목적**: `accountCode` 가 ChartOfAccount 에 없는 경우 LEFT JOIN 결과 `accountName = null`.
FE 는 null 시 코드만 표시.

**선행 조건**
- 분개 라인 fixture: `accountCode="999"` (시드에 없는 코드)

**예상 결과**

| 검증 항목 | 기대값 |
|---|---|
| `data.lines[0].accountCode` | `"999"` |
| `data.lines[0].accountName` | `null` (LEFT JOIN miss) |

---

### 시나리오 Q3-4 (회귀): 기존 LedgerService 로직 영향 없음

**목적**: LEFT JOIN ChartOfAccount 추가가 기존 잔액 계산 / partnerCode 조회 / 기간 필터에
영향을 미치지 않음을 확인.

**검증 항목**

- Q3-1 수행 후 `data.totalDebit`, `data.totalCredit`, `data.closingBalance` 값이
  기존 단위 테스트 기대값과 동일
- `LedgerImageServiceTest.java` 기존 테스트 전부 GREEN

---

## Q4. P2-5 — TaxInvoiceListPage path 정합

### 시나리오 Q4-1: 일괄 발행 버튼 → `/accounting/hometax-export` navigate 정합

**목적**: `TaxInvoiceListPage` 의 "일괄 발행 (홈택스 양식)" 버튼 클릭 시
라우터에 등록된 `/accounting/hometax-export` 로 정상 navigate 함을 확인.

**검증 대상 코드 위치**

| 구분 | 파일 | 위치 |
|---|---|---|
| 버튼 navigate | `clients/desktop/src/renderer/routes/TaxInvoiceListPage.tsx` | L185 `navigate('/accounting/hometax-export')` |
| 라우터 등록 | `clients/desktop/src/renderer/routes/index.tsx` | L856 `path: '/accounting/hometax-export'` |
| 컴포넌트 | index.tsx | `<HometaxExportPage />` |

**정합 결과**: FE navigate 경로 = 라우터 path = 일치. fix 불필요.

**Playwright spec 시나리오 (선택)**

```typescript
// qa/playwright/tests/desktop/sp-08-fu2-tax-invoice-path.spec.ts
test('일괄 발행 버튼 클릭 시 hometax-export 페이지로 이동', async ({ page }) => {
  // 1. ACCOUNTANT role 로 로그인
  // 2. /accounting/tax-invoices 진입
  // 3. [data-testid="tax-invoice-batch-button"] 클릭
  // 4. expect(page).toHaveURL(/\/accounting\/hometax-export$/)
})
```

---

### 시나리오 Q4-2: FE API 클라이언트 path 전수 정합 (정적 검증)

**목적**: `hometaxExportApi.ts` 의 8개 endpoint 호출 path 가 BE `AccountingReportController`
의 실제 `@RequestMapping` / `@GetMapping` 과 100% 일치함을 확인.

**검증 결과** (p2-5-path-verification.md 기준)

| FE 호출 경로 | BE 경로 | 일치 |
|---|---|---|
| `GET /accounting/tax-invoice/hometax-export` | `GET /accounting/tax-invoice/hometax-export` | 일치 |
| `POST /accounting/hometax-export/preview` | `POST /accounting/hometax-export/preview` | 일치 |
| `GET /accounting/hometax-export/{batchId}/split` | `GET /accounting/hometax-export/{batchId}/split` | 일치 |
| `GET /accounting/hometax-export/exclusions` | `GET /accounting/hometax-export/exclusions` | 일치 |
| `POST /accounting/hometax-export/exclusions` | `POST /accounting/hometax-export/exclusions` | 일치 |
| `DELETE /accounting/hometax-export/exclusions/{partnerCode}` | 동일 | 일치 |
| `GET /accounting/hometax-export/history` | 동일 | 일치 |
| `GET /accounting/hometax-export/history/{batchId}` | 동일 | 일치 |

**결론**: 전체 일치. fix 불필요.

---

## Q5. 회귀 — 기존 IT 영향 0

### 시나리오 Q5-1: SP-D5 PermissionAspect AOP 활성 환경에서 기존 IT 통과

**목적**: SP-D5 PR #247 머지 후 `PermissionAspect` AOP 가 활성화된 환경에서
본 슬라이스(P2-2~P2-5)의 BE 변경이 기존 IT 회귀를 유발하지 않음을 확인.

**검증 대상 IT**

- `slip-service`: `SlipControllerIT`, `SlipLifecycleControllerIT`, `SlipFormV20PersistIT`
- `accounting-service`: `JournalControllerIT`, `TrialBalanceControllerIT`, `SliceBValidationIT`, `SliceCValidationIT`

**체크리스트**

- [ ] `@MockBean DynamicPermissionClient` 선언 여부 확인 (SP-D2 의존 accounting IT 전체)
- [ ] `@MockBean PartnerLookupClient` 선언 여부 확인 (accounting IT 전체)
- [ ] LEFT JOIN 추가 후 기존 LedgerService 응답 구조 변경 없음 확인

---

### 시나리오 Q5-2: LedgerService LEFT JOIN 변경 — 기존 IT 회귀 없음

**목적**: `LedgerService.getLedger()` 에 `LEFT JOIN chart_of_accounts` 추가 시
기존 잔액 계산/응답 구조가 깨지지 않음을 확인.

**검증 방법**

`LedgerImageServiceTest.java` + 추가될 `LedgerControllerIT` 전체 통과.

| IT 클래스 | 상태 |
|---|---|
| `LedgerImageServiceTest.java` | 기존 테스트 GREEN 유지 필수 |
| `LedgerControllerIT` (신규 작성 예정) | Q3-1~Q3-3 검증 포함 |

---

## IT 구현 우선순위

| 우선순위 | 테스트 | 유형 |
|---|---|---|
| P1 | Q1-1 (warehouse name snapshot) | IT (@MockBean InventoryClient) |
| P1 | Q2-2 (PartnerAgingService partnerName 표시) | Unit (PartnerAgingServiceTest 신규 @Test) |
| P1 | Q3-1 (LedgerLine.accountName) | IT (LedgerControllerIT 신규) |
| P2 | Q1-2 (fail-soft null) | IT |
| P2 | Q2-3 (aging fail-soft) | Unit |
| P2 | Q2-1 (partner UUID endpoint 200/404) | IT (partner-service) |
| P3 | Q4-1 (Playwright navigate) | E2E (선택) |
| P3 | Q1-4 (backfill idempotent) | IT (선택) |

---

## @MockBean 의무 목록 (memory feedback_it_mockbean_external_clients)

slip-service IT 에서 반드시 격리해야 하는 외부 클라이언트:

| 클라이언트 | 격리 위치 |
|---|---|
| `InventoryClient` | SlipControllerIT, SlipLifecycleControllerIT 등 |
| `ProductClient` | SlipControllerIT 등 |
| `NotificationClient` | SlipLifecycleControllerIT 등 |

accounting-service IT 에서 반드시 격리해야 하는 외부 클라이언트:

| 클라이언트 | 격리 위치 |
|---|---|
| `PartnerLookupClient` | JournalControllerIT, SliceBValidationIT, SliceCValidationIT 등 |
| `DynamicPermissionClient` | JournalControllerIT 이미 선언 확인 |
| `ETaxClient` | JournalControllerIT 이미 선언 확인 |
| `KftcClient` | JournalControllerIT 이미 선언 확인 |
