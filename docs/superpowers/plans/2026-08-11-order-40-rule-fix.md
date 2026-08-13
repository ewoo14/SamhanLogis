# 주문 40% 규칙·서버 미리보기 API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `partner-order-service` 호출에서만 서버의 40% 규칙을 적용하고, 인증된 order-app 미리보기도 확정과 동일한 서버 계산기를 통과하도록 만든다.

**Architecture:** `dc-config-service`의 `PriceCalculationService`가 `callerService`를 검사하여 주문 호출에만 40% 게이트를 연다. `partner-order-service`는 확정과 미리보기 양쪽에서 동일한 상품 해석·가격 라인 생성 서비스와 `DcConfigClient`를 사용하며, 인증된 `POST /api/v1/partner-orders/price-preview`로 결과를 반환한다. order-app은 독립적인 40% 판정과 자체 가격 폴백을 제거하고 서버 응답만 표시한다.

**Tech Stack:** Java 21, Spring Boot, Spring MVC, JUnit 5, Mockito, MockMvc, RestClient, TypeScript, Vitest, Vite, legacy HTML + `google.script.run` shim, Playwright Chromium-1217.

## Global Constraints

- Git 조작, commit, push, 배포, `samhan-*` 조작을 하지 않는다.
- 공유 DB에는 write하지 않는다. 통합/라이브 검증은 격리 환경에서만 수행한다.
- 40%의 유일한 정본은 `dc-config-service.PriceCalculationService`이다.
- `callerService`는 호출자가 명시적으로 선언하는 계약 축이며 경로·품명 heuristic을 추가하지 않는다.
- 미리보기 실패·timeout 시 클라이언트는 기존 자체 계산값으로 폴백하지 않고 실패 상태를 표시한다.
- `partner-order-service`와 `estimate-service`의 기존 할인·정액DC·tier bonus 및 S1 회귀를 보존한다.

---

### Task 1: 서버 caller 경계와 계산 결과 상세 계약

**Files:**
- Modify: `services/dc-config-service/src/main/java/com/samhanair/logis/dcconfig/service/PriceCalculationService.java`
- Modify: `services/dc-config-service/src/main/java/com/samhanair/logis/dcconfig/dto/PriceCalculationRequest.java`
- Test: `services/dc-config-service/src/test/java/com/samhanair/logis/dcconfig/service/PriceCalculationServiceTest.java`

- [ ] **Step 1: Write the failing tests**

  Add tests for `estimate-service + HVAC + variable=true + HOMEMULTI + 1,000,000` expecting `0.0700` and `930000`, while the same line with `partner-order-service` expects `0.40` and `600000`. Add estimate+UNCLASSIFIED, estimate+OUTDOOR, order+UNCLASSIFIED, order+OUTDOOR, order+variable=false, fixed 15%, and `495000 -> 420750` assertions.

- [ ] **Step 2: Run the focused test and verify RED**

  Run:

  ```powershell
  .\gradlew.bat :services:dc-config-service:test --tests '*PriceCalculationServiceTest' --rerun-tasks --no-build-cache --console=plain
  ```

  Expected: the new estimate HVAC test fails with `expected 0.0700 but was 0.40`.

- [ ] **Step 3: Implement the minimal caller gate**

  Compute the no-main qualification only when `"partner-order-service".equals(request.callerService())`. Keep fixed DC precedence, variable=false behavior, unknown physical category blocking, and all existing rate selection unchanged. Update the DTO documentation so `callerService` is described as the behavior boundary, not audit-only metadata.

- [ ] **Step 4: Run the focused test and verify GREEN**

  Re-run the same command and confirm all dc-config service tests pass with the estimate line at 7% and the order line at 40%.

---

### Task 2: Shared order price-line builder and authenticated preview endpoint

**Files:**
- Create: `services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/service/PartnerOrderPriceCalculationService.java`
- Create: `services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/web/PartnerOrderPricePreviewController.java`
- Create: `services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/web/dto/PricePreviewResponse.java`
- Modify: `services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/client/DcConfigClient.java`
- Modify: `services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/service/PartnerOrderConfirmService.java`
- Test: `services/partner-order-service/src/test/java/com/samhanair/logis/partnerorder/client/DcConfigClientTest.java`
- Test: `services/partner-order-service/src/test/java/com/samhanair/logis/partnerorder/service/PartnerOrderPriceCalculationServiceTest.java`
- Test: `services/partner-order-service/src/test/java/com/samhanair/logis/partnerorder/web/PartnerOrderPricePreviewControllerTest.java`

- [ ] **Step 1: Write failing shared-calculation and auth tests**

  Define the preview contract as `POST /api/v1/partner-orders/price-preview` with the existing `ConfirmRequest` body and `X-Partner-Code` header. Require `@RequirePermission(page="sales.partner-order.draft", action=CREATE, partnerSelfService=true)`, so authenticated PARTNER users and existing order-authorized staff can preview, while unauthenticated or unauthorized callers receive 401/403. Test that the shared service resolves products, fixed DC, physical category, variable flag, and calls `DcConfigClient` with `callerService=partner-order-service` through the existing client.

- [ ] **Step 2: Run the focused tests and verify RED**

  Run:

  ```powershell
  .\gradlew.bat :services:partner-order-service:test --tests '*PartnerOrderPriceCalculationServiceTest' --tests '*PartnerOrderPricePreviewControllerTest' --tests '*DcConfigClientTest' --rerun-tasks --no-build-cache --console=plain
  ```

  Expected: compilation/test failure because the shared service, detailed client result, preview response, and endpoint do not yet exist.

- [ ] **Step 3: Implement the shared path**

  Extract the existing `PartnerOrderConfirmService` product lookup, fixed-rate lookup, `PriceLine` construction, category mapping, and discount-flag mapping into `PartnerOrderPriceCalculationService`. Return line-indexed list/final/applied-rate data. Make confirm consume this service, and make preview consume the same service. Extend `DcConfigClient` with a detailed result while keeping `calculatePrices()` as a compatibility delegate.

- [ ] **Step 4: Implement endpoint authentication and response**

  Add the authenticated preview controller with no persistence. Return line-indexed final prices, applied rates, total list, total final, and total discount. Do not expose UUIDs. Missing/invalid partner code or product resolution must return the existing validation/business errors.

- [ ] **Step 5: Run focused tests and verify GREEN**

  Re-run the focused command. Confirm preview and confirm both send the same resolved `PriceLine` values and the same `partner-order-service` caller value; confirm permission tests prove anonymous/unauthorized rejection.

---

### Task 3: order-app server-only preview integration

**Files:**
- Modify: `clients/web/order-app/src/samhanApi.ts`
- Modify: `clients/web/order-app/index.html`
- Test: `clients/web/order-app/src/__tests__/order40RuleParity.test.ts`
- Test: `clients/web/order-app/src/__tests__/samhanApi.test.ts`

- [ ] **Step 1: Write failing client contract tests**

  Assert that `pricePreview` posts the same model/category/quantity lines used by confirm to `/partner-orders/price-preview`, and that preview failure is surfaced rather than replaced with a locally calculated price. Add a source contract asserting the legacy `isNoMainUnit` → `0.40` assignment and `noMainWarn` path are absent.

- [ ] **Step 2: Run the client tests and verify RED**

  Run:

  ```powershell
  npm test -- --runInBand
  ```

  from `clients/web/order-app`. Expected: the new API/source tests fail against the current RPC map and legacy branch.

- [ ] **Step 3: Add the API shim**

  Add `pricePreview` to `RPC_MAP`, reuse `confirmLines`, send only server-relevant line identity/category/quantity data, and return the unwrapped server response. Keep timeout bounded at the existing axios client timeout. Never calculate or substitute a price in the catch path.

- [ ] **Step 4: Replace legacy preview pricing**

  Remove only the independent `isNoMainUnit` / `calcH` / `calcC=0.40` / `noMainWarn` behavior. Preserve tier bonus logic. Make `openPreview` request server preview and render returned final price/rate values. During the request show loading; on error show an explicit preview-unavailable state and keep proceed/send disabled. Add a 250 ms debounce/coalescing guard for repeated preview requests and ignore stale responses by request sequence. No client-side price fallback is permitted.

- [ ] **Step 5: Run client tests and type/build checks**

  Run:

  ```powershell
  npm test
  npm run typecheck
  npm run build
  ```

  Confirm existing order-app tests remain green.

---

### Task 4: isolated QA and regression evidence

**Files:**
- Create: `docs/dev-reports/2026-08-11-order-40-rule-fix.md`
- Create: `docs/qa/2026-08-11-order40-fix/` evidence files/screenshots as generated by isolated QA
- Test: `clients/desktop/playwright/<new-order40-fix-spec>/...`

- [ ] **Step 1: Run the full required backend regression**

  Run:

  ```powershell
  .\gradlew.bat :services:dc-config-service:test :services:partner-order-service:test :services:product-service:test --rerun-tasks --no-build-cache --console=plain
  ```

  Record the complete test counts and verify 1,378 total tests remain passing.

- [ ] **Step 2: Run S1 client regressions**

  Run order-app tests and the existing Desktop suite. Record 미분류 `3,084 → 2,126 → 3,084`, 받침대 11, 역산 41, `classification_manual` protection, product-service 781, and Desktop 152.

- [ ] **Step 3: Run isolated Chromium-1217 headless Playwright**

  Create/execute a `clients/desktop/playwright` spec that separately creates an estimate and an order through the server-backed flows, captures the displayed discount rate, and exercises preview success, server failure, delayed response, estimate exclusion, order 40%, outdoor protection, unclassified protection, ERV/HVAC physical code, and preview-vs-confirm equality. Do not use shared DB V38; stop any QA server in a finally/cleanup path.

- [ ] **Step 4: Write the Korean dev report**

  Include the current RED raw failure, caller boundary evidence, endpoint authentication rationale and HTTP 401/403 evidence, shared-calculator code path, debounce/failure behavior, legacy changes, full combination table, numeric RED-B counts, and every test command/output. Explicitly report any unfinished item with numeric counts.

