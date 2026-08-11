# Order 40% Rule Fix3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:test-driven-development for each behavior.

**Goal:** Preserve the fail-closed dc-config path while making the fixed-discount compatibility lookup conditional on an explicit product lookup marker.

**Architecture:** Carry `fixedDiscountSource` through the partner-order wire record. Treat the known product-service markers `NONE`, `PRODUCT`, `S`, `M`, and `L` as resolved states; only a missing or unknown marker enters the legacy bulk helper. The helper remains fail-closed when it is actually required.

**Tech Stack:** Java records, Spring RestClient, JUnit 5, AssertJ, Mockito, Gradle.

## Global Constraints

- `fixedDiscountSource=NONE` with a null rate is a valid resolved state, not an outage.
- Preserve the three distinct states: explicit `NONE` (known no fixed discount), missing/unknown marker (compatibility lookup required), and compatibility lookup failure (fail closed).
- Resolved `NONE/PRODUCT/S/M/L` must not call the compatibility endpoint.
- Missing/unknown marker must call the compatibility endpoint; its 5xx/network failure remains `PRICE_CALCULATION_UNAVAILABLE`.
- dc-config unavailable/partial and missing final prices remain unavailable before persistence.
- Add the exact RED-A regression: helper 500 plus resolved NONE still calculates/stores 600,000원 at the service boundary.
- Keep `clients/desktop/playwright.config.ts` `testIgnore` unchanged. Every live QA directory and spec must use the `-real-qa` suffix.
- GitGuardian is PM-owned; do not change or suppress it.
- Update the required Korean dev report and Playwright QA evidence; do not mutate git state.

### Task 1: RED-A and wire contract

**Files:**
- Modify: `services/partner-order-service/src/test/java/com/samhanair/logis/partnerorder/service/PartnerOrderPriceCalculationServiceTest.java`
- Modify: `services/partner-order-service/src/test/java/com/samhanair/logis/partnerorder/client/ProductClientTest.java`
- Modify: `services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/client/ProductSummary.java`
- Modify: `services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/client/ProductClient.java`

- [ ] Write a failing service test with `fixedDiscountSource="NONE"`, a throwing compatibility helper, a successful dc-config result of 600,000원, and assertions that the result is available, final price is 600,000원, and the helper is never called.
- [ ] Write a failing client test asserting lookup parses `fixedDiscountSource` values.
- [ ] Run only these tests and record the expected RED failure before production changes.
- [ ] Add the source marker to `ProductSummary` with backward-compatible constructors and parse it from lookup responses.

### Task 2: Conditional legacy fallback

**Files:**
- Modify: `services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/service/PartnerOrderPriceCalculationService.java`
- Modify: `services/partner-order-service/src/test/java/com/samhanair/logis/partnerorder/service/PartnerOrderPriceCalculationServiceTest.java`

- [ ] Collect only lines whose marker is absent or not one of `NONE/PRODUCT/S/M/L`.
- [ ] Call the bulk helper once with only those product IDs; preserve resolved rates and resolved NONE.
- [ ] Add tests for resolved fixed rate, legacy success, legacy failure, and mixed current/legacy lines.
- [ ] Run the focused Gradle tests and then the partner-order test suite.

### Task 3: Verification and evidence

**Files:**
- Create/update: `docs/dev-reports/2026-08-11-order-40-rule-fix3.md`
- Create: `docs/qa/2026-08-11-order40-fix3/` Playwright screenshots
- Create: `clients/desktop/playwright/1166-order40-fix3-real-qa/1166-order40-fix3-real-qa.spec.ts`

- [ ] Inspect the full confirm/preview flow and record the auxiliary remote lookup O/X sweep.
- [ ] Run service tests, relevant Gradle verification, order-app tests, and Desktop Playwright from `clients/desktop` with hash-router URLs.
- [ ] Capture only after asserting a screen-specific element; stop any servers/containers started for QA.
- [ ] Recheck RED-A, RED-B, three-state behavior, mixed-version behavior, and required counts before reporting.

### Task 4: Desktop mock hard gate recovery

**Files:**
- Rename live QA specs/directories under `clients/desktop/playwright/` to the `*-real-qa` convention.
- Update every current documentation command/path that references the renamed specs.
- Do not broaden `clients/desktop/playwright.config.ts` `testIgnore`.

- [ ] RED: prove the root config collects the eight PR live tests that CI reported as unexpected (plus any in-progress fix3 live test).
- [ ] GREEN: run `npx playwright test --list` and prove no `1166-*` live QA spec is collected by the root mock suite.
- [ ] Run the full mock suite with `CI=1`, then `node scripts/assert-playwright-ran.mjs`; require `unexpected=0`.
- [ ] Run fix3 live QA explicitly with `npx playwright test --config=playwright/1166-order40-fix3-real-qa/playwright.config.ts`.

### Task 5: accounting+partner CI diagnosis and recovery

**Files:**
- Modify only if reproduced root cause requires it: `services/partner-service/src/test/java/com/samhanair/logis/partner/seed/PartnerMasterLoadIT.java`
- Inspect without speculative edits: partner-order CloudWatch integration test/configuration.

- [ ] Read the exact CI log and distinguish the first failing assertion from shutdown-hook follow-on errors.
- [ ] Reproduce `PartnerMasterLoadIT` locally against Testcontainers. If it fails, reconcile its canonical fixture contract; otherwise quote the unreproduced failure verbatim.
- [ ] Determine whether `CloudWatchAsyncClient.putMetricData()` returning null is caused by this PR and whether it changes the Gradle result.
- [ ] Re-run the CI-equivalent accounting/partner Gradle tasks and record exact test/result evidence.
