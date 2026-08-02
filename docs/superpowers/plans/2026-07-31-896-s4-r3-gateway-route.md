# PR #996 게이트웨이 규칙 조회 라우트 수정 계획

> **For agentic workers:** 이 계획은 현재 세션에서 인라인으로 실행한다. 각 단계는 테스트와 보고서 증거를 남긴다.

**Goal:** order-app이 사용하는 `/api/v1/quantity-sync-rules` 호출이 게이트웨이의 `product-service` 규칙 조회로 라우팅되도록 계약을 고정한다.

**Architecture:** `QuantitySyncRuleController`가 `/api/v1` 풀패스를 보유하므로 전용 no-strip 라우트를 사용한다. `product-service-v1` generic 라우트보다 전용 라우트를 앞에 두고 JWT 인증을 유지한다. 대상 경로에 대해 전용 라우트 외 기존 라우트 매칭 수를 0건으로 단언한다.

**Tech Stack:** Spring Cloud Gateway, Spring Boot, JUnit 5, AssertJ, Gradle.

## Global Constraints

- 게이트웨이와 서비스는 재빌드·재기동하지 않고 코드·테스트만 수행한다.
- git 쓰기, 공유 DB write, 라이브 확인은 수행하지 않는다.
- 조회 범위 축소와 주문 수량 결정 경로는 변경하지 않는다.
- 모든 통과 보고에 명령과 종료코드를 기록한다.
- 신규 단정은 Linux CI(`ubuntu-latest`)에서도 동작하는 순수 JVM 테스트로 작성한다.

---

### Task 1: 게이트웨이 라우트 계약 RED 테스트

**Files:**
- Modify: `services/api-gateway/src/test/java/com/samhanair/logis/gateway/it/ApiGatewayContextLoadIT.java`

- [ ] **Step 1: 새 테스트를 작성한다.**
  - 전용 라우트의 URI, Path, no-strip, JWT, generic 선행을 검증한다.
  - `/api/v1/quantity-sync-rules`에 대해 전용 라우트를 제외한 기존 Path 라우트의 매칭 수가 0건인지 검증한다.
- [ ] **Step 2: 기존 설정에서 라우트를 잠시 제거한 상태로 테스트를 실행해 RED 원문을 기록한다.**
- [ ] **Step 3: 라우트를 복원하고 필요한 최소 설정만 유지한다.**
- [ ] **Step 4: 게이트웨이 테스트를 GREEN으로 실행한다.**

### Task 2: 상품 서비스 회귀 테스트

**Files:**
- Read/Test: `services/product-service/src/test/**`

- [ ] **Step 1: 기존 수량 동기화 조회 범위 테스트가 유지되는지 확인한다.**
- [ ] **Step 2: product-service 테스트를 실행하고 명령·종료코드를 보고서에 기록한다.**

### Task 3: 보고서 및 변경 목록 검증

**Files:**
- Modify: `docs/dev-reports/2026-07-31-896-s4-r3-gateway-route.md`

- [ ] **Step 1: RED 원문, 변경 요지, 영향 0건, 두 모듈 테스트 결과를 append한다.**
- [ ] **Step 2: `git status --porcelain` 원문과 신규 파일 목록을 append한다.**
- [ ] **Step 3: 라이브 확인 미실행을 명시하고 최종 검증 명령·종료코드를 기록한다.**
