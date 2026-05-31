# 슬라이스 C — slip↔inventory 창고코드 정렬 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 주문→출고전표 전환(convert) 시 slip 발행이 성공하도록, inventory 를 창고코드 단일 출처로 삼아 convert 경로를 정렬한다 (현재 409/400 차단 제거).

**Architecture:** convert 경로에서 partner-order 가 inventory `by-code` 로 해석한 `warehouseId`(UUID)를 slip 에 직접 전달한다. slip 은 `warehouseId` 가 있으면 그대로 사용(yml 미경유), 없으면 기존 `WarehouseCodeMapper` 폴백(estimate 경로 등 하위호환). FE 전환 모달은 design-system `WarehouseSelector` 로 창고를 필수 선택하여 `warehouseCode` 를 전송한다.

**Tech Stack:** Spring Boot 3.3 / Java 17 / JPA / Testcontainers (Postgres) / MockMvc — slip-service · partner-order-service. React 18 / TypeScript / @samhan/design-system / TanStack Query / Playwright — clients/desktop.

**Spec:** `docs/superpowers/specs/2026-05-31-slip-inventory-warehouse-code-align-design.md`
**Branch:** `feat/slice-c-slip-inventory-warehouse-align` (진행 중)

---

## File Structure

| 파일 | 역할 | 변경 |
|---|---|---|
| `services/slip-service/.../publish/PublishFromPartnerOrderRequest.java` | from-partner-order 발행 요청 DTO | Modify — `warehouseId` nullable 필드 추가 |
| `services/slip-service/.../publish/SlipPublishService.java` | 발행 서비스 | Modify — `publishFromPartnerOrder` 가 warehouseId 우선 사용 + 폴백 helper |
| `services/slip-service/.../publish/SlipPublishWarehouseIdIT.java` | warehouseId 해석 IT | Create |
| `services/partner-order-service/.../service/PartnerOrderConvertService.java` | 전환 서비스 | Modify — slip payload 에 warehouseId 추가 |
| `services/partner-order-service/.../it/PartnerOrderConvertIT.java` | 전환 IT | Modify — payload warehouseId captor 단언 |
| `clients/desktop/src/renderer/routes/SalesPartnerOrderDetailPage.tsx` | 주문 상세 + 전환 모달 | Modify — WarehouseSelector + 필수 게이트 + warehouseCode 전송 |
| `clients/desktop/playwright/phase-2-6a-order-convert/phase-2-6a-order-convert.spec.ts` | 전환 Playwright | Modify — 창고 필수 선택 시나리오 |
| `clients/desktop/src/renderer/api/mock.ts` | Playwright mock api | Modify(필요 시) — /inventory/warehouses 핸들러 보장 |
| `docs/dev-reports/slice-c-warehouse-code-align.md` | dev-report | Create |
| `migration/decisions/DECISIONS.md` | 결정 기록 | Modify — D-WH-01~03 |
| `docs/handoff/CURRENT-WORK.md` | 핸드오프 | Modify — 슬라이스 C 완료 기록 |

---

## Task 1: slip-service — warehouseId 우선 해석 (yml 폴백 유지)

**Files:**
- Modify: `services/slip-service/src/main/java/com/samhanair/logis/slip/publish/PublishFromPartnerOrderRequest.java`
- Modify: `services/slip-service/src/main/java/com/samhanair/logis/slip/publish/SlipPublishService.java:181-251`
- Create: `services/slip-service/src/test/java/com/samhanair/logis/slip/publish/SlipPublishWarehouseIdIT.java`

- [ ] **Step 1: 실패 IT 작성 — warehouseId 직접 사용 + yml 폴백 회귀**

Create `services/slip-service/src/test/java/com/samhanair/logis/slip/publish/SlipPublishWarehouseIdIT.java`:

```java
package com.samhanair.logis.slip.publish;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.slip.SlipServiceApplication;
import com.samhanair.logis.slip.client.InventoryClient;
import com.samhanair.logis.slip.client.PartnerInternalClient;
import com.samhanair.logis.slip.client.PartnerInternalClient.PartnerVerifyResult;
import com.samhanair.logis.slip.client.ProductClient;
import com.samhanair.logis.slip.client.ProductSummary;
import com.samhanair.logis.slip.client.UserInternalClient;
import com.samhanair.logis.slip.client.WarehouseInternalClient;
import com.samhanair.logis.slip.domain.Slip;
import com.samhanair.logis.slip.it.AbstractPostgresIT;
import com.samhanair.logis.slip.repository.SlipRepository;
import java.math.BigDecimal;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

/**
 * 슬라이스 C — from-partner-order 발행의 창고 식별자 해석 IT.
 *
 * <ul>
 *   <li>warehouseId(UUID) 가 payload 에 있으면 yml 미경유로 그대로 sourceWarehouseId 저장.</li>
 *   <li>warehouseId 가 없으면 WarehouseCodeMapper(yml) 폴백으로 warehouseCode 해석(회귀).</li>
 * </ul>
 */
@SpringBootTest(classes = SlipServiceApplication.class)
@AutoConfigureMockMvc
@TestPropertySource(properties = {
        "app.publish.warehouse-code-map.WH-001=11111111-1111-1111-1111-111111111111",
})
class SlipPublishWarehouseIdIT extends AbstractPostgresIT {

    @Autowired private MockMvc mockMvc;
    @Autowired private ObjectMapper objectMapper;
    @Autowired private SlipRepository slipRepository;

    @MockBean private ProductClient productClient;
    @MockBean private InventoryClient inventoryClient;
    @MockBean private PartnerInternalClient partnerInternalClient;
    @MockBean private UserInternalClient userInternalClient;
    @MockBean private WarehouseInternalClient warehouseInternalClient;

    private static final String MASTER_ID = "99999999-0000-0000-0000-000000000001";
    private static final String MODEL_CODE = "MODEL-SLICE-C";
    private static final UUID PRODUCT_ID = UUID.randomUUID();
    /** convert 경로가 전달하는 inventory 해석 UUID — yml 값(…1111) 과 다름. */
    private static final String INVENTORY_WAREHOUSE_ID = "11111111-1111-1111-1111-000000000001";

    @BeforeEach
    void setUp() {
        Mockito.lenient().when(productClient.lookupByModel(Mockito.anyString()))
                .thenReturn(new ProductSummary(PRODUCT_ID, "테스트 상품", MODEL_CODE,
                        null, BigDecimal.valueOf(10000), "ACTIVE"));
        Mockito.lenient().when(partnerInternalClient.verifyPartnerCode(Mockito.anyString()))
                .thenReturn(PartnerVerifyResult.found(Optional.empty()));
    }

    @Test
    @DisplayName("warehouseId payload 존재 → yml 미경유, sourceWarehouseId = 전달 UUID")
    void warehouseId_present_usedDirectly() throws Exception {
        String slipNo = publish("PO-SLICE-C-1", INVENTORY_WAREHOUSE_ID);

        Slip saved = slipRepository.findBySlipNo(slipNo).orElseThrow();
        assertThat(saved.getSourceWarehouseId())
                .isEqualTo(UUID.fromString(INVENTORY_WAREHOUSE_ID));
    }

    @Test
    @DisplayName("warehouseId 없음 → yml 폴백으로 warehouseCode 해석 (회귀)")
    void warehouseId_absent_fallsBackToYml() throws Exception {
        String slipNo = publish("PO-SLICE-C-2", null);

        Slip saved = slipRepository.findBySlipNo(slipNo).orElseThrow();
        assertThat(saved.getSourceWarehouseId())
                .isEqualTo(UUID.fromString("11111111-1111-1111-1111-111111111111"));
    }

    private String publish(String partnerOrderId, String warehouseId) throws Exception {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("partnerOrderId", partnerOrderId);
        payload.put("partnerCode", "TEST-PARTNER");
        payload.put("ioDate", "20260531");
        payload.put("warehouseCode", "WH-001");
        if (warehouseId != null) {
            payload.put("warehouseId", warehouseId);
        }
        payload.put("partnerName", "테스트 거래처");
        Map<String, Object> line = new LinkedHashMap<>();
        line.put("productCode", MODEL_CODE);
        line.put("qty", "1");
        line.put("unitPriceVat", BigDecimal.valueOf(10000));
        payload.put("lines", List.of(line));

        MvcResult result = mockMvc.perform(
                        post("/api/v1/slips/from-partner-order")
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(objectMapper.writeValueAsString(payload))
                                .header("Idempotency-Key", "IDEM-" + partnerOrderId)
                                .header("X-User-Id", MASTER_ID)
                                .header("X-User-Role", "MASTER"))
                .andExpect(status().isCreated())
                .andReturn();

        JsonNode root = objectMapper.readTree(result.getResponse().getContentAsString());
        return root.path("data").path("slipNo").asText();
    }
}
```

- [ ] **Step 2: IT 실패 확인**

Run: `./gradlew :services:slip-service:test --tests "com.samhanair.logis.slip.publish.SlipPublishWarehouseIdIT"`
Expected: 컴파일 실패 (`warehouseId()` 메서드 없음) 또는 `warehouseId_present_usedDirectly` FAIL (현재는 yml 의 …1111 저장 → 단언 …0001 불일치).
> Docker 미가용 시 `AbstractPostgresIT` 가 자동 skip — Docker Desktop 기동 후 재실행. Windows npipe 한계 시 `$env:DOCKER_HOST='tcp://localhost:2375'` (memory feedback_testcontainers_windows_docker).

- [ ] **Step 3: DTO 에 warehouseId 필드 추가**

`PublishFromPartnerOrderRequest.java` — `warehouseCode` 필드 다음 줄에 추가:

```java
        @NotBlank @Size(max = 50) String warehouseCode,
        @Size(max = 36) String warehouseId,
        @Size(max = 500) String shippingAddress,
```

그리고 Javadoc `<ul>` 에 항목 추가:

```java
 *   <li>{@code warehouseId} (UUID, 선택) — partner-order convert 가 inventory by-code 로 해석한
 *       창고 UUID. 존재 시 yml 매핑 미경유로 직접 사용. 없으면 warehouseCode 를 WarehouseCodeMapper 폴백 해석.</li>
```

- [ ] **Step 4: 서비스 — warehouseId 우선 해석 helper**

`SlipPublishService.java` line 193 (`publishFromPartnerOrder` 내부):

```java
        UUID warehouseId = warehouseCodeMapper.resolve(req.warehouseCode());
```

을 다음으로 교체:

```java
        UUID warehouseId = resolveWarehouseId(req.warehouseId(), req.warehouseCode());
```

그리고 `publishFromEstimate`/`publishFromPartnerOrder` 아래 `// ---------- 내부 helper ----------` 섹션(line 268 근처)에 helper 추가:

```java
    /**
     * 창고 식별자 해석 — 슬라이스 C (inventory 단일 출처).
     *
     * <p>{@code warehouseId}(UUID 문자열) 가 주어지면 그대로 사용한다. partner-order convert 가
     * inventory {@code by-code} 로 이미 해석한 UUID 를 전달하는 경로로, slip 의 정적 yml 매핑
     * ({@link WarehouseCodeMapper})을 경유하지 않는다.
     *
     * <p>{@code warehouseId} 가 null/blank 이면 {@code warehouseCode} 를 {@link WarehouseCodeMapper}
     * 로 폴백 해석한다 (estimate-app 등 레거시 호출자 하위호환).
     *
     * @param warehouseId   inventory 해석 UUID 문자열 (null/blank 가능)
     * @param warehouseCode legacy/내부 창고 코드 (폴백 해석용)
     * @return 출고지 창고 UUID
     * @throws BusinessException(INVALID_INPUT) warehouseId 가 UUID 형식이 아니거나, 폴백 매핑 누락
     */
    private UUID resolveWarehouseId(String warehouseId, String warehouseCode) {
        if (warehouseId != null && !warehouseId.isBlank()) {
            try {
                return UUID.fromString(warehouseId.trim());
            } catch (IllegalArgumentException ex) {
                throw new BusinessException(ErrorCode.INVALID_INPUT,
                        "warehouseId 형식이 UUID 가 아닙니다: " + warehouseId);
            }
        }
        return warehouseCodeMapper.resolve(warehouseCode);
    }
```

- [ ] **Step 5: IT 통과 확인**

Run: `./gradlew :services:slip-service:test --tests "com.samhanair.logis.slip.publish.SlipPublishWarehouseIdIT"`
Expected: 2 tests PASS.

- [ ] **Step 6: 기존 from-partner-order IT 회귀 확인**

Run: `./gradlew :services:slip-service:test --tests "com.samhanair.logis.slip.publish.*"`
Expected: 전체 PASS (Phase26cSlipImmutableIT 등 — warehouseId 미전달이므로 yml 폴백 동작 유지).

- [ ] **Step 7: 커밋**

```bash
git add services/slip-service/src/main/java/com/samhanair/logis/slip/publish/PublishFromPartnerOrderRequest.java \
        services/slip-service/src/main/java/com/samhanair/logis/slip/publish/SlipPublishService.java \
        services/slip-service/src/test/java/com/samhanair/logis/slip/publish/SlipPublishWarehouseIdIT.java
git commit -m "feat(slip): from-partner-order 발행에 warehouseId 우선 해석 + yml 폴백 (슬라이스 C)"
```

---

## Task 2: partner-order-service — convert payload 에 warehouseId 전달

**Files:**
- Modify: `services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/service/PartnerOrderConvertService.java:178-186`
- Modify: `services/partner-order-service/src/test/java/com/samhanair/logis/partnerorder/it/PartnerOrderConvertIT.java:430-447`

- [ ] **Step 1: case6 captor 에 warehouseId 단언 추가 (실패)**

`PartnerOrderConvertIT.java` case6 의 captor 단언부(line 443 `assertThat(capturedLine.get("qty")...` 다음)에 추가:

```java
        // 수량 단언
        assertThat(capturedLine.get("qty")).isEqualTo("3");

        // 슬라이스 C — payload 에 inventory 해석 warehouseId 포함 (yml 미경유)
        assertThat(capturedPayload.get("warehouseId"))
                .isEqualTo("00000000-0000-0000-0000-000000000001");
        assertThat(capturedPayload.get("warehouseCode")).isEqualTo("WH-001");
```

> `inventoryClient.resolveWarehouseIdByCode` stub 은 `setUp()` 에서 `00000000-0000-0000-0000-000000000001` 반환(line 119-120).

- [ ] **Step 2: 실패 확인**

Run: `./gradlew :services:partner-order-service:test --tests "com.samhanair.logis.partnerorder.it.PartnerOrderConvertIT.case6_slipPayload_containsSourceOrderLineIdAndSelectedLinesOnly"`
Expected: FAIL — `capturedPayload.get("warehouseId")` 가 null (아직 payload 에 미포함).

- [ ] **Step 3: convert payload 에 warehouseId 추가**

`PartnerOrderConvertService.java` line 185 (`payload.put("warehouseCode", req.warehouseCode());`) 다음 줄에 추가:

```java
        payload.put("warehouseCode", req.warehouseCode());
        payload.put("warehouseId", warehouseId.toString());
        payload.put("lines", payloadLines);
```

> `warehouseId` 는 line 152 에서 이미 해석된 지역 변수(`inventoryClient.resolveWarehouseIdByCode(req.warehouseCode())`).

- [ ] **Step 4: 통과 확인**

Run: `./gradlew :services:partner-order-service:test --tests "com.samhanair.logis.partnerorder.it.PartnerOrderConvertIT"`
Expected: 전체 PASS (case1~10).

- [ ] **Step 5: 커밋**

```bash
git add services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/service/PartnerOrderConvertService.java \
        services/partner-order-service/src/test/java/com/samhanair/logis/partnerorder/it/PartnerOrderConvertIT.java
git commit -m "feat(partner-order): convert 시 slip payload 에 inventory 해석 warehouseId 전달 (슬라이스 C)"
```

---

## Task 3: FE — 전환 모달 창고 필수 선택 + warehouseCode 전송

**Files:**
- Modify: `clients/desktop/src/renderer/routes/SalesPartnerOrderDetailPage.tsx`
- Modify: `clients/desktop/playwright/phase-2-6a-order-convert/phase-2-6a-order-convert.spec.ts`
- Modify(필요 시): `clients/desktop/src/renderer/api/mock.ts`

- [ ] **Step 1: import 추가**

`SalesPartnerOrderDetailPage.tsx` 상단 import 영역:

```tsx
import { Button, Input, Modal, Select, WarehouseSelector } from '@samhan/design-system'
import type { Warehouse } from '@samhan/design-system'
```

그리고 inventory api / react-query import (기존 useQuery import 존재 여부 확인 후):

```tsx
import { useQuery } from '@tanstack/react-query'
import { listWarehouses } from '../api/inventory'
```

> `useMutation`/`useQueryClient` 는 이미 import 됨. `useQuery` 가 없으면 추가.

- [ ] **Step 2: 창고 목록 쿼리 + 선택 상태 추가**

`convertQtyMap` state 선언부(line 95 근처) 다음에 추가:

```tsx
  /** 부분전환 모달: 선택된 출고 창고 (필수, 기본값 없음). */
  const [convertWarehouse, setConvertWarehouse] = useState<Warehouse | null>(null)

  /** 출고 창고 후보 목록 — inventory 단일 출처. */
  const warehousesQuery = useQuery({
    queryKey: ['warehouses'],
    queryFn: listWarehouses,
  })
```

- [ ] **Step 3: convertMutation mutationFn 시그니처 변경**

`SalesPartnerOrderDetailPage.tsx:185-187` 를:

```tsx
  const convertMutation = useMutation({
    mutationFn: (payload: { items: ConvertToSlipItem[]; warehouseCode: string }) =>
      convertPartnerOrderToSlip(orderId, payload),
```

로 변경. `onSuccess`(line 188-203) 의 `setConvertQtyMap({})` 옆에 창고 초기화 추가:

```tsx
      setConvertOpen(false)
      setConvertQtyMap({})
      setConvertWarehouse(null)
```

- [ ] **Step 4: 모달 닫기 시 창고 초기화**

`Modal onClose`(line 874-879) 와 취소 Button onClick(line 891-894) 양쪽의 `setConvertErrorMessage(null)` 옆에 추가:

```tsx
            setConvertOpen(false)
            setConvertErrorMessage(null)
            setConvertWarehouse(null)
```

- [ ] **Step 5: 제출 버튼 게이트 + warehouseCode 전송**

제출 Button(line 898-925) 의 `disabled` 조건과 onClick 을 교체:

```tsx
            <Button
              type="button"
              variant="primary"
              data-testid="partner-order-convert-submit"
              disabled={
                convertMutation.isPending ||
                !query.data ||
                !convertWarehouse ||
                Object.values(convertQtyMap).every((q) => q <= 0)
              }
              onClick={() => {
                if (!query.data || !convertWarehouse) return
                const items = query.data.lines
                  .filter((line) => {
                    const remaining = line.quantity - line.convertedQuantity
                    const qty = convertQtyMap[line.lineId] ?? 0
                    return remaining > 0 && qty > 0
                  })
                  .map((line) => ({
                    orderLineId: line.lineId,
                    quantity: convertQtyMap[line.lineId]!,
                  }))
                if (items.length === 0) return
                setConvertErrorMessage(null)
                convertMutation.mutate({ items, warehouseCode: convertWarehouse.code })
              }}
            >
              {convertMutation.isPending ? '전환 중…' : '출고전표로 전환'}
            </Button>
```

- [ ] **Step 6: 모달 본문에 WarehouseSelector 추가**

모달 본문(line 929 `<div data-testid="partner-order-convert-modal-body">`) 의 비가역 경고 배너(line 940-954) **다음**, 테이블 wrap(line 955) **앞**에 삽입:

```tsx
          {/* 슬라이스 C — 출고 창고 필수 선택 (inventory 단일 출처). 미선택 시 전환 불가. */}
          <div style={{ marginBottom: 'var(--space-3)' }}>
            <WarehouseSelector
              warehouses={warehousesQuery.data ?? []}
              value={convertWarehouse?.id ?? null}
              onChange={(_id, warehouse) => setConvertWarehouse(warehouse)}
              label="출고 창고"
              placeholder="출고 창고를 선택하세요"
              hideVirtual
              required
              disabled={convertMutation.isPending}
              data-testid="partner-order-convert-warehouse"
            />
          </div>
```

> UUID 비공개: `value`/`onChange` 의 첫 인자는 창고 id 지만 화면 미노출. convert 요청 본문에는 `warehouse.code` 만 전송 (Step 5).
> `WarehouseSelector` 가 `data-testid` prop 을 지원하지 않으면 외부 `<div data-testid=...>` 로 감싼다(Step 8 Playwright 셀렉터 정합).

- [ ] **Step 7: 타입체크 + 린트**

Run: `cd clients/desktop; npm run typecheck; npm run lint`
Expected: 0 errors. (`ConvertToSlipRequest.warehouseCode` 는 sales.ts 에 이미 optional 정의됨 — 타입 정합.)

- [ ] **Step 8: Playwright — 창고 필수 선택 시나리오**

`clients/desktop/playwright/phase-2-6a-order-convert/phase-2-6a-order-convert.spec.ts` 에 테스트 추가 (기존 전환 모달 오픈 헬퍼/패턴 재사용). 신규 test:

```ts
test('전환 모달: 출고 창고 미선택 시 제출 비활성, 선택 후 전환 성공', async ({ page }) => {
  await openConvertModal(page) // 기존 스펙의 모달 오픈 헬퍼 (없으면 인라인 동작 복제)

  // 수량 입력
  await page.getByTestId('partner-order-convert-qty-0').fill('2')

  // 창고 미선택 → 제출 비활성
  await expect(page.getByTestId('partner-order-convert-submit')).toBeDisabled()

  // 창고 선택 (WarehouseSelector 내부 select)
  await page.getByTestId('partner-order-convert-warehouse').locator('select').selectOption({ index: 1 })

  // 제출 활성 → 클릭 → 성공 토스트
  await expect(page.getByTestId('partner-order-convert-submit')).toBeEnabled()
  await page.getByTestId('partner-order-convert-submit').click()
  await expect(page.getByText(/출고전표 .* 발행/)).toBeVisible()
})
```

> mock.ts 가 `/inventory/warehouses` 에 최소 1개 비-VIRTUAL 창고를 반환하는지 확인. 없으면 핸들러 추가:
> ```ts
> // mock.ts — listWarehouses 대응
> if (url.endsWith('/inventory/warehouses')) {
>   return ok([{ id: 'wh-hq', code: 'HQ-001', name: '본사창고', type: 'HEADQUARTERS', active: true }])
> }
> ```
> mock convert 핸들러(`/convert-to-slip`)가 `slipNo`/`fullyConverted` 를 반환하는지도 확인(기존 phase-2-6a 스펙이 통과했으므로 존재 가정).

- [ ] **Step 9: Playwright 실행**

Run: `cd clients/desktop; npx playwright test phase-2-6a-order-convert`
Expected: 신규 포함 전체 PASS.

- [ ] **Step 10: 커밋**

```bash
git add clients/desktop/src/renderer/routes/SalesPartnerOrderDetailPage.tsx \
        clients/desktop/playwright/phase-2-6a-order-convert/phase-2-6a-order-convert.spec.ts \
        clients/desktop/src/renderer/api/mock.ts
git commit -m "feat(fe): 주문 전환 모달 출고 창고 필수 선택 + warehouseCode 전송 (슬라이스 C)"
```

---

## Task 4: 문서 동기화 (dev-report + DECISIONS + 핸드오프)

> [[feedback_continuous_docs_sync]] — 별도 docs PR 금지, 본 슬라이스 PR 에 포함.

**Files:**
- Create: `docs/dev-reports/slice-c-warehouse-code-align.md`
- Modify: `migration/decisions/DECISIONS.md`
- Modify: `docs/handoff/CURRENT-WORK.md`

- [ ] **Step 1: dev-report 작성**

Create `docs/dev-reports/slice-c-warehouse-code-align.md` — 다음 섹션 포함:
- **목표/배경**: 2겹 차단(409 warehouseCode 누락 + 400 yml 매핑 누락) → inventory 단일 출처 정렬.
- **변경 요약**: slip warehouseId 우선 해석(폴백 유지) / partner-order payload warehouseId 전달 / FE 창고 필수 선택.
- **함수 단위 문서**: `SlipPublishService.resolveWarehouseId` (한국어 Javadoc 인용) + `PartnerOrderConvertService.convert` warehouseId 전달 지점.
- **테스트**: SlipPublishWarehouseIdIT 2케이스 + PartnerOrderConvertIT case6 captor + Playwright 창고 게이트.
- **배포 순서**: slip → partner-order → FE.
- **미해결/후속**: inventory legacy_code 별칭(slip yml 완전폐기), 전환 모달 가용재고 표시(슬라이스 B).

- [ ] **Step 2: DECISIONS 추가**

`migration/decisions/DECISIONS.md` 에 D-WH-01/02/03 추가 (spec §2 표 인용):
- **D-WH-01**: 창고코드 단일 출처 = inventory DB.
- **D-WH-02**: convert 는 warehouseId 직접 전달, estimate 는 yml 격리.
- **D-WH-03**: 전환 모달 창고 드롭다운 필수(기본값 없음).

- [ ] **Step 3: 핸드오프 갱신**

`docs/handoff/CURRENT-WORK.md` 상단 "새 세션 시작 가이드" 의 후보 표에서 **C** 행을 완료로 이동하고, 다음 후보 순서(D→B→A)를 명시. 슬라이스 C 완료 요약 블록 추가(spec/plan/dev-report 경로 + 배포 순서).

- [ ] **Step 4: 커밋**

```bash
git add docs/dev-reports/slice-c-warehouse-code-align.md migration/decisions/DECISIONS.md docs/handoff/CURRENT-WORK.md
git commit -m "docs(slice-c): dev-report + DECISIONS D-WH-01~03 + 핸드오프 갱신"
```

---

## 통합 검증 (PR 전)

- [ ] **컴파일 풀빌드**: `./gradlew :services:slip-service:assemble :services:partner-order-service:assemble` BUILD SUCCESSFUL.
- [ ] **BE 테스트**: 두 서비스 `test` 전체 PASS (Testcontainers, skipped=0 — Docker 기동 필수).
- [ ] **FE**: `npm run typecheck && npm run lint && npx playwright test phase-2-6a-order-convert` PASS.
- [ ] **Docker 실 QA** ([[feedback_no_fake_data_ever]] — 실 캡처만): 실 gateway + 실 JWT + 실 partner_order_db/inventory_db/slip_db. convert → reserve(RESERVE) → **slip 발행 성공(SENT)** → `converted_quantity` psql 적중 + 실 desktop renderer 화면. (재현 절차: 핸드오프 "재고 실 QA 재현 절차".)
- [ ] **5-team 리뷰 사이클 N=2** + CI green(skipped=0) → PM 승인 → 개발책임자 머지.

---

## Self-Review (작성자 점검 완료)

- **Spec coverage**: §3.1→Task1, §3.2→Task2, §3.3→Task3, §6 테스트→각 Task 의 IT/Playwright + 통합 검증, §7 배포순서→통합 검증/dev-report, §8 후속→dev-report. 누락 없음.
- **Placeholder scan**: 모든 코드 step 에 실제 코드 포함. "기존 헬퍼 재사용" 표기 지점(Playwright `openConvertModal`)은 부재 시 인라인 복제 지시 명시.
- **Type consistency**: `resolveWarehouseId(String, String)` (Task1 정의 ↔ Task1 호출), payload key `"warehouseId"`/`"warehouseCode"` (Task2 put ↔ Task2 단언 ↔ Task1 IT/DTO `warehouseId()`), FE `convertMutation.mutate({ items, warehouseCode })` (Task3 mutationFn ↔ onClick ↔ `ConvertToSlipRequest`), `convertWarehouse: Warehouse | null` 일관.
