# 제품구분 미분류 개명 구현 계획

> **For agentic workers:** 이 계획은 현재 세션에서 인라인으로 실행한다. Git commit/push/merge는 수행하지 않는다.

**Goal:** 제품구분 카테고리의 최종 코드 `UNCLASSIFIED`와 표시명 `미분류`를 모든 제품구분 실행 자산에 일관되게 반영하고 기존 분류 행위와 건수를 보존한다.

**Architecture:** 제품구분 전용 Java 분류기·V38 백필·시트 동기화가 공유하는 fallback 코드 상수를 `UNCLASSIFIED_CODE`로 유지·동기화한다. V38의 카테고리 seed와 감사 사유, 테스트 fixture, Desktop Playwright mock 및 제품구분 문서만 같은 명칭으로 동기화한다. 인증·거래처·구성품 미해소 등 타 도메인의 일반 상태 표현은 변경하지 않는다.

**Tech Stack:** Java 17/Spring Boot/Flyway, Gradle/JUnit/Testcontainers, React/Electron Desktop, Playwright/Chromium.

## Global Constraints

- 분류 규칙·우선순위·받침대 예외·구성품 역산·감사·rollback·목록 필터·동적 카운트는 변경하지 않는다.
- `classification_manual = true` 행, soft-delete 재등장, ECOUNT 복원 경로는 보존한다.
- S2 주문 40% 규칙은 변경하지 않는다.
- 공유 DB write, 배포, Git 조작을 수행하지 않는다.
- 기준 건수는 합계 3,084, 미분류 2,126, 실외기 212, 실내기 417이다.

---

### Task 1: 테스트 기대값을 새 명칭으로 먼저 고정

**Files:**
- Modify: `services/product-service/src/test/java/com/samhanair/logis/product/service/ProductNameCategoryClassifierTest.java`
- Modify: `services/product-service/src/test/java/db/migration/V38__ProductCategoryBackfillTest.java`
- Modify: `services/product-service/src/test/java/com/samhanair/logis/product/it/ProductSheetSyncServiceIT.java`
- Modify: `clients/desktop/playwright/1166-product-category-sol-review/1166-product-category-sol-review.spec.ts`

- [x] **Step 1: 테스트의 제품구분 전용 `UNCLASSIFIED`/`미분류` 기대값·fixture·테스트명을 `UNCLASSIFIED`/`미분류`로 바꾼다.** UUID와 수량 3,084/2,126은 그대로 둔다.
- [x] **Step 2: product-service 분류기·V38·시트 IT의 관련 테스트를 실행해 변경 전 구현이 새 기대값에서 실패하는지 확인한다.**

Run: `./gradlew :services:product-service:test --tests '*ProductNameCategoryClassifierTest' --tests '*V38__ProductCategoryBackfillTest' --tests '*ProductSheetSyncServiceIT'`

Expected: 제품구분 fallback이 변경 전 코드값을 반환하므로 새 `UNCLASSIFIED` 기대값에서 실패하며, 실패 원인은 명칭 불일치다.

---

### Task 2: 제품구분 runtime/V38 계약을 최소 변경

**Files:**
- Modify: `services/product-service/src/main/java/com/samhanair/logis/product/service/ProductNameCategoryClassifier.java`
- Modify: `services/product-service/src/main/java/com/samhanair/logis/product/service/ProductSheetSyncService.java`
- Modify: `services/product-service/src/main/java/db/migration/V38__ProductCategoryBackfill.java`

- [x] **Step 1: `UNCLASSIFIED_CODE` 상수와 모든 제품구분 runtime 참조를 `UNCLASSIFIED_CODE`/`UNCLASSIFIED`로 바꾼다.** 분류 rule 목록과 분기 순서는 건드리지 않는다.
- [x] **Step 2: V38의 seed SQL 코드·이름, category code 목록, fallback 감사 사유를 새 명칭으로 바꾼다.** UUID, migration key, audit column, SQL 조건, rollback CTE는 그대로 둔다.
- [x] **Step 3: Task 1의 지정 테스트를 다시 실행해 통과를 확인한다.**

Expected: 제품구분 테스트가 모두 통과하고 V38의 감사·rollback·재실행·수동분류 보존 검증이 유지된다.

---

### Task 3: 저장소 내 제품구분 문서·mock·Playwright 계약 동기화

**Files:**
- Modify: `docs/superpowers/specs/2026-08-11-product-category-backfill-design.md`
- Modify: `docs/superpowers/plans/2026-08-11-product-category-backfill.md`
- Modify: `docs/dev-reports/2026-08-11-product-category-backfill.md`
- Modify: `docs/dev-reports/2026-08-11-product-category-fix.md`
- Modify: `docs/dev-reports/2026-08-11-product-category-sol-review.md`
- Modify: `docs/dev-reports/2026-08-11-product-category-sol-review2.md`
- Modify: `docs/dev-reports/2026-08-11-product-category-sol-review3.md`
- Modify: `docs/dev-reports/2026-08-11-order-40-rule-implementation.md`
- Modify: `clients/desktop/playwright/1166-product-category-sol-review/1166-product-category-sol-review.spec.ts`

- [x] **Step 1: 제품구분 문서 code block/table/문장을 `UNCLASSIFIED`/`미분류`로 동기화한다.** 일반 타 도메인 표현과 과거 QA 실패 원문은 별도 보존 대상으로 분류한다.
- [x] **Step 2: Playwright mock의 category code/name, option label, filter/count assertion, screenshot 파일명을 새 명칭으로 동기화한다.** 카운트와 해제 흐름은 그대로 둔다.
- [x] **Step 3: runtime/test/doc 영역을 다시 grep해 제품구분 실행 자산에 변경 전 코드값이 잔존하지 않는지 확인한다.** 다른 도메인의 일반 상태 표현 좌표는 보존 목록으로 수집한다.

---

### Task 4: 회귀 검증·라이브 QA·보고서 작성

**Files:**
- Create: `docs/dev-reports/2026-08-11-product-category-rename2.md`
- Create/Update: `docs/qa/2026-08-11-category-rename2/screenshots/*.png`

- [x] **Step 1: product-service 전체 테스트를 실행해 781 passed 기준을 확인한다.**
- [x] **Step 2: `clients/desktop`에서 Chromium Playwright를 직접 실행해 등록 폼의 `미분류 (UNCLASSIFIED)` 노출·선택, 목록 전체 3,084 → 미분류 2,126 → 해제 후 3,084, 동적 카운트를 확인하고 캡처한다.**
- [x] **Step 3: `UNCLASSIFIED`/`미분류` 저장소 전수 grep 결과를 제품구분 변경 좌표와 타 도메인 보존 좌표로 나눈 표에 기록한다.** 보존 좌표에는 인증·거래처·구성품 미해소 등 도메인을 적는다.
- [x] **Step 4: 개명 전후 카테고리별 건수 대조표와 테스트 결과(781, Desktop 152 passed/1 skipped, Playwright 성공 또는 실패 원문)를 보고서에 기록한다.**
- [x] **Step 5: 최종 diff와 grep을 검토해 이름 외 변경과 금지 범위 변경이 없는지 확인한다.**
