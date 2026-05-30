# 주문(Partner-Order) 보류(ON_HOLD) 상태 + 리스트 상태 필터 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development (Codex 다운 6/1 12:00 전까지 Claude 에이전트 대체). Steps use checkbox.

**Goal:** 주문에 보류(ON_HOLD) 상태를 추가하고(진행중↔보류 전이), 주문 리스트가 상태별(진행중/완료/보류)로 정확히 조회되게 한다.

**Architecture:** PartnerOrderStatus enum 에 ON_HOLD 추가 + PartnerOrder 도메인 메서드(markOnHold/releaseHold) + hold/release REST(기존 edit 권한) + confirm 가드 ON_HOLD 허용 + list 정렬을 status 무관하게 보정(createdAt fallback) + FE 라벨/버튼. status 필터 인프라(Controller/Service Specification/FE 드롭다운)는 이미 존재 — enum 추가로 자동 동작.

**Tech Stack:** Spring Boot 3 / JPA Specification / PostgreSQL(status VARCHAR, CHECK 제약 없음 → 마이그레이션 불필요) / Testcontainers / React. 브랜치 `feat/phase-2-5-partner-order-hold-status-filter`. spec: `docs/superpowers/specs/2026-05-31-partner-order-hold-status-filter-design.md`.

**Grounding 확정 사실:**
- `PartnerOrderStatus`: DRAFT/CONFIRMING/CONFIRMED/CANCELED. ON_HOLD 신규.
- DRAFT PartnerOrder = `createFromEstimate` 경로로 생성(견적전환분). confirm 은 PartnerOrderDraft→PartnerOrder INSERT(CONFIRMING).
- `PartnerOrder` 도메인 메서드 패턴: `cancel()`/`markSlipPublished()` 등 (this.status 직접 변경, 가드는 throw). `requireRestorable()`(Phase 2.4, CONFIRMING/CANCELED만 409 — ON_HOLD 자동 허용).
- list: `PartnerOrderListController`(`/api/v1/partner-orders` GET, status param 존재) → `PartnerOrderQueryService.list`(Specification: statusEquals/confirmedAtGoe/Loe, **Sort.by confirmedAt DESC**).
- FE: `sales.ts` `PartnerOrderStatus` 타입 + `PARTNER_ORDER_STATUS_LABEL`(line 321/330). `SalesPartnerOrderListPage.tsx` statusFilter 드롭다운 + queryKey 존재.
- 권한: 전이 = `sales.partner-order.edit` UPDATE 재사용. 마이그레이션/auth seed 불필요.

---

## Task 1: PartnerOrderStatus.ON_HOLD enum 추가

**Files:** Modify `services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/domain/PartnerOrderStatus.java`

- [ ] **Step 1: enum 값 추가**
DRAFT 다음에 추가:
```java
    /** 임시저장 (PartnerOrderDraft 와는 별도, confirm 후의 history 표시용). */
    DRAFT,
    /** 보류 — 진행중(DRAFT)에서 멈춘 편집가능 상태 (Phase 2.5). DRAFT↔ON_HOLD 양방향. */
    ON_HOLD,
    /** confirm 진행 중 — advisory lock 보유. */
    CONFIRMING,
```
클래스 상단 `<pre>` 주석에 `DRAFT ↔ ON_HOLD (보류/해제)` 한 줄 추가.

- [ ] **Step 2: 컴파일 검증**
Run: `./gradlew :services:partner-order-service:compileJava`
Expected: BUILD SUCCESSFUL

- [ ] **Step 3: Commit** (Claude PM 대행)
```
feat(partner-order-hold): ON_HOLD 상태 enum 추가
```

## Task 2: PartnerOrder.markOnHold / releaseHold 도메인 메서드

**Files:** Modify `services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/domain/PartnerOrder.java` (cancel() 메서드 근처, line ~292)

- [ ] **Step 1: 단위 테스트 작성**
Create/modify `services/partner-order-service/src/test/java/com/samhanair/logis/partnerorder/domain/PartnerOrderHoldTest.java`:
```java
package com.samhanair.logis.partnerorder.domain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.server.ResponseStatusException;

class PartnerOrderHoldTest {

    private PartnerOrder draftOrder() {
        PartnerOrder o = PartnerOrder.createFromEstimate(
                "PT-001", "1234567890", "2026/05/31-1", "idem-1", java.math.BigDecimal.ZERO);
        return o; // status=DRAFT
    }

    @Test
    void markOnHold_fromDraft_setsOnHold() {
        PartnerOrder o = draftOrder();
        o.markOnHold();
        assertThat(o.getStatus()).isEqualTo(PartnerOrderStatus.ON_HOLD);
    }

    @Test
    void markOnHold_fromConfirmed_throws409() {
        PartnerOrder o = draftOrder();
        ReflectionTestUtils.setField(o, "status", PartnerOrderStatus.CONFIRMED);
        assertThatThrownBy(o::markOnHold)
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("409");
    }

    @Test
    void releaseHold_fromOnHold_setsDraft() {
        PartnerOrder o = draftOrder();
        o.markOnHold();
        o.releaseHold();
        assertThat(o.getStatus()).isEqualTo(PartnerOrderStatus.DRAFT);
    }

    @Test
    void releaseHold_fromDraft_throws409() {
        PartnerOrder o = draftOrder();
        assertThatThrownBy(o::releaseHold)
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("409");
    }
}
```
> 주의: `createFromEstimate` 의 실제 시그니처를 먼저 확인하여 인자 정합(grounding: `createFromEstimate(partnerCode, bizCode, orderNo, idempotencyKey, totalAmount)`). 다르면 맞출 것.

- [ ] **Step 2: 테스트 실패 확인**
Run: `./gradlew :services:partner-order-service:test --tests '*PartnerOrderHoldTest'`
Expected: FAIL (markOnHold/releaseHold 미정의)

- [ ] **Step 3: 도메인 메서드 구현** (cancel() 아래에 추가)
```java
    /**
     * 보류 처리 — 진행중(DRAFT) 주문을 보류(ON_HOLD)로 전이한다 (Phase 2.5).
     *
     * <p>DRAFT 가 아니면 409 CONFLICT. 완료(CONFIRMED)는 출고전표가 발행되어 보류 불가.
     *
     * @throws ResponseStatusException(409) DRAFT 가 아닌 상태에서 호출 시
     */
    public void markOnHold() {
        if (this.status != PartnerOrderStatus.DRAFT) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "진행중(DRAFT) 주문만 보류할 수 있습니다. 현재 상태: " + this.status);
        }
        this.status = PartnerOrderStatus.ON_HOLD;
    }

    /**
     * 보류 해제 — 보류(ON_HOLD) 주문을 진행중(DRAFT)으로 되돌린다 (Phase 2.5).
     *
     * @throws ResponseStatusException(409) ON_HOLD 가 아닌 상태에서 호출 시
     */
    public void releaseHold() {
        if (this.status != PartnerOrderStatus.ON_HOLD) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "보류(ON_HOLD) 주문만 해제할 수 있습니다. 현재 상태: " + this.status);
        }
        this.status = PartnerOrderStatus.DRAFT;
    }
```
(HttpStatus/ResponseStatusException import 이미 존재 — Phase 2.4 requireRestorable 에서 사용 중.)

- [ ] **Step 4: 테스트 통과 확인**
Run: `./gradlew :services:partner-order-service:test --tests '*PartnerOrderHoldTest'`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**
```
feat(partner-order-hold): markOnHold/releaseHold 도메인 메서드 + 단위테스트
```

## Task 3: hold / release REST API

**Files:**
- Create: `services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/web/PartnerOrderHoldController.java`
- Reference: `PartnerOrderEditController.java`(권한 헤더/IdResolver 패턴), `PartnerOrderDeleteController.java`

- [ ] **Step 1: 컨트롤러 구현**
기존 `PartnerOrderEditController` 를 read 하여 X-User-Id/X-User-Name 헤더 수신 + PartnerOrderIdResolver + 응답 DTO 패턴을 그대로 미러. 신규 서비스 `PartnerOrderHoldService.hold(id, actorId, actorName)` / `release(...)` 호출:
```java
@RestController
@RequestMapping("/api/v1/partner-orders")
@RequiredArgsConstructor
public class PartnerOrderHoldController {

    private final PartnerOrderHoldService holdService;

    /** 주문 보류 (진행중→보류). 기존 edit 권한 재사용. */
    @PostMapping("/{id}/hold")
    @RequirePermission(page = "sales.partner-order.edit", action = PermissionAction.UPDATE)
    public ApiResponse<PartnerOrderDetailResponse> hold(
            @PathVariable String id,
            @RequestHeader(value = "X-User-Id", required = false) String actorId,
            @RequestHeader(value = "X-User-Name", required = false) String actorName) {
        return ApiResponse.success(holdService.hold(id, actorId, actorName));
    }

    /** 주문 보류 해제 (보류→진행중). */
    @PostMapping("/{id}/release")
    @RequirePermission(page = "sales.partner-order.edit", action = PermissionAction.UPDATE)
    public ApiResponse<PartnerOrderDetailResponse> release(
            @PathVariable String id,
            @RequestHeader(value = "X-User-Id", required = false) String actorId,
            @RequestHeader(value = "X-User-Name", required = false) String actorName) {
        return ApiResponse.success(holdService.release(id, actorId, actorName));
    }
}
```
> 실제 응답 DTO 명(`PartnerOrderDetailResponse`)과 ApiResponse/PermissionAction import 경로는 EditController 에서 확인하여 정합.

- [ ] **Step 2: PartnerOrderHoldService 구현**
Create `services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/service/PartnerOrderHoldService.java`:
```java
@Service
@RequiredArgsConstructor
public class PartnerOrderHoldService {

    private final PartnerOrderRepository partnerOrderRepository;

    @Transactional
    public PartnerOrderDetailResponse hold(String id, String actorId, String actorName) {
        PartnerOrder order = PartnerOrderIdResolver.findByIdentifier(partnerOrderRepository, id)
                .orElseThrow(() -> new BusinessException(
                        ErrorCode.PARTNER_ORDER_NOT_FOUND,
                        ErrorCode.PARTNER_ORDER_NOT_FOUND.getDefaultMessage()));
        order.markOnHold();
        partnerOrderRepository.saveAndFlush(order);
        return PartnerOrderDetailResponse.from(order);
    }

    @Transactional
    public PartnerOrderDetailResponse release(String id, String actorId, String actorName) {
        PartnerOrder order = PartnerOrderIdResolver.findByIdentifier(partnerOrderRepository, id)
                .orElseThrow(() -> new BusinessException(
                        ErrorCode.PARTNER_ORDER_NOT_FOUND,
                        ErrorCode.PARTNER_ORDER_NOT_FOUND.getDefaultMessage()));
        order.releaseHold();
        partnerOrderRepository.saveAndFlush(order);
        return PartnerOrderDetailResponse.from(order);
    }
}
```
> `PartnerOrderDetailResponse.from`, `BusinessException`, `ErrorCode`, `PartnerOrderIdResolver` 는 DeleteService 에서 사용 중인 것 그대로. 실제 DetailResponse 생성 방법(from vs of)은 EditController 응답에서 확인.
> actorId/actorName 은 현재 미사용이나 향후 STagger revision 캡처 위해 시그니처 유지(미정 §7).

- [ ] **Step 3: 컴파일 검증**
Run: `./gradlew :services:partner-order-service:compileJava`
Expected: BUILD SUCCESSFUL

- [ ] **Step 4: Commit**
```
feat(partner-order-hold): hold/release REST API (기존 edit 권한 재사용)
```

## Task 4: confirm 가드 — ON_HOLD 도 confirm 허용

**Files:** Modify `services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/service/PartnerOrderConfirmService.java` (confirm 진입부)

- [ ] **Step 1: confirm 흐름 확인**
PartnerOrderConfirmService.confirm 을 read. confirm 이 PartnerOrderDraft→PartnerOrder INSERT 경로면 기존 DRAFT PartnerOrder(견적전환분/보류분)를 어떻게 다루는지 확인. **보류(ON_HOLD) PartnerOrder 가 confirm 대상이 되는 경로가 실제 존재하는지** 검증:
- 만약 confirm 이 오직 PartnerOrderDraft(별도 엔티티) 기반이고 DRAFT/ON_HOLD PartnerOrder 를 confirm 하는 경로가 없다면 → **본 Task 는 "변경 없음 + 문서화"로 축소**(spec §4.2 confirm 가드 조정 불필요). dev-report 에 명시.
- 만약 DRAFT PartnerOrder 를 confirm 하는 경로가 있다면 그 가드에 ON_HOLD 추가.

- [ ] **Step 2: (해당 시) 가드 수정 + 컴파일**
조정이 필요하면 status 검사에 `|| status == ON_HOLD` 추가. 불필요하면 skip.
Run: `./gradlew :services:partner-order-service:compileJava` → SUCCESS

- [ ] **Step 3: Commit** (변경 시)
```
feat(partner-order-hold): confirm 가드 ON_HOLD 허용 (또는: 문서화 — confirm 은 Draft 경로라 영향 없음)
```

## Task 5: list 정렬 보정 (DRAFT/ON_HOLD confirmedAt=null)

**Files:** Modify `services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/service/PartnerOrderQueryService.java` (list, line ~149)

- [ ] **Step 1: 문제 확인**
현재 `Sort.by(DESC, "confirmedAt")` + `from/to` 가 confirmedAt 기반. DRAFT/ON_HOLD 는 confirmedAt=null → 정렬 시 null 위치 불안정 + 기간필터 적용 시 전부 제외됨.

- [ ] **Step 2: 정렬/기간 필터 status 분기**
status 가 CONFIRMED 계열이 아니면(DRAFT/ON_HOLD) createdAt 기준으로 정렬·기간 필터하도록 분기. 예:
```java
boolean preConfirm = status == PartnerOrderStatus.DRAFT || status == PartnerOrderStatus.ON_HOLD;
String dateField = preConfirm ? "createdAt" : "confirmedAt";
// from/to 도 동일 field 기준 Specification 으로 (confirmedAtGoe/Loe → createdAt 변형 또는 공통 dateGoe(field, ...))
Page<PartnerOrder> result = partnerOrderRepository.findAll(
        finalSpec, PageRequest.of(page, size, Sort.by(Sort.Direction.DESC, dateField)));
```
> 기존 `confirmedAtGoe/Loe` Specification 을 `dateGoe(field, from)` 형태로 일반화하거나, preConfirm 분기에서 createdAt 기반 Specification 사용. 최소 변경 우선 — 정렬만 분기하고 기간필터는 status 가 DRAFT/ON_HOLD 일 때 createdAt 기준으로 적용.

- [ ] **Step 3: 컴파일 검증**
Run: `./gradlew :services:partner-order-service:compileJava` → SUCCESS

- [ ] **Step 4: Commit**
```
fix(partner-order-hold): 리스트 정렬/기간필터 DRAFT·ON_HOLD createdAt 기준 보정
```

## Task 6: BE 통합 테스트 (Testcontainers)

**Files:** Create `services/partner-order-service/src/test/java/com/samhanair/logis/partnerorder/HoldStatusFilterIT.java` (또는 기존 IT 패턴 따름)

- [ ] **Step 1: IT 작성**
기존 IT base(AbstractPostgresIT) + @MockBean(DynamicPermissionClient 7-action + 외부 client 전부) 패턴(Phase 2.4 PartnerOrderRevisionRestoreIT 참고). 케이스:
- hold: DRAFT 주문 `POST /{id}/hold` → 200, status=ON_HOLD (DB 단언)
- release: ON_HOLD `POST /{id}/release` → 200, status=DRAFT
- hold CONFIRMED → 409
- release DRAFT → 409
- list status=DRAFT / ON_HOLD / CONFIRMED 각각 해당 status 만 반환
- hold 권한 deny(edit UPDATE 없음 role) → 403 / MASTER bypass 200

- [ ] **Step 2: compileTestJava + (가능 시) IT 실행**
Run: `./gradlew :services:partner-order-service:compileTestJava`
Expected: BUILD SUCCESSFUL. Docker 가용 시 `:test --tests '*HoldStatusFilterIT'` (skipped=0). 한글경로 트랩 시 compileTestJava 보장.

- [ ] **Step 3: Commit**
```
test(partner-order-hold): hold/release/필터 Testcontainers IT
```

## Task 7: FE — 라벨 + 타입 + 보류/해제 버튼

**Files:**
- Modify `clients/desktop/src/renderer/api/sales.ts` (line 321 타입, 330 라벨)
- Modify `clients/desktop/src/renderer/routes/SalesPartnerOrderListPage.tsx` (필터 옵션) + 주문 상세 페이지(보류/해제 버튼)
- API 래퍼: `holdPartnerOrder`/`releasePartnerOrder` 추가

- [ ] **Step 1: 타입 + 라벨**
```typescript
export type PartnerOrderStatus = 'DRAFT' | 'ON_HOLD' | 'CONFIRMING' | 'CONFIRMED' | 'CANCELED'

export const PARTNER_ORDER_STATUS_LABEL: Record<PartnerOrderStatus, string> = {
  DRAFT: '진행중',
  ON_HOLD: '보류',
  CONFIRMING: '확정 처리중',
  CONFIRMED: '완료',
  CANCELED: '취소',
}
```
> 업무용어 통일: DRAFT '작성중'→'진행중', CONFIRMED '확정'→'완료' (개발책임자 업무용어 우선). 다른 화면에서 이 라벨을 쓰는 곳 영향 확인(grep PARTNER_ORDER_STATUS_LABEL).

- [ ] **Step 2: API 래퍼 + 보류/해제 버튼**
sales.ts(또는 partnerOrder API 파일)에 `holdPartnerOrder(id)`/`releasePartnerOrder(id)` (POST `/api/v1/partner-orders/{id}/hold`·`/release`, ApiResponse unwrap). 주문 상세 페이지에 status 따라 "보류"(DRAFT 시)/"보류 해제"(ON_HOLD 시) 버튼(design-system Button, edit 권한 게이트, 성공 시 invalidate `['partner-orders']`+상세키).

- [ ] **Step 3: 리스트 필터 옵션 + 기본값**
`SalesPartnerOrderListPage.tsx` statusFilter 드롭다운 옵션에 ON_HOLD('보류') 포함 + 기본값 DRAFT('진행중') 확인. (드롭다운 자체는 이미 존재 → 옵션/기본값만.)

- [ ] **Step 4: typecheck**
Run: `npm --prefix clients/desktop run typecheck`
Expected: 0 error

- [ ] **Step 5: Commit**
```
feat(partner-order-hold): FE 보류 라벨/타입 + 보류·해제 버튼 + 리스트 필터 옵션
```

## Task 8: Playwright + 문서 + Docker 실 QA

**Files:** `clients/desktop/playwright/phase-2-5-partner-order-hold/*.spec.ts`, `docs/dev-reports/phase-2-5-partner-order-hold-status-filter.md`, `migration/decisions/DECISIONS.md`(D-RST 계열 또는 신규 D-PO), `docs/samhan-public-overview.html`, `services/partner-order-service/README.md`, `docs/qa/phase-2-5-partner-order-hold/screenshots/`

- [ ] **Step 1: Playwright**
route() mock 으로 리스트 status 필터 전환(진행중/완료/보류) + 보류/해제 버튼 토글 + 401/409 피드백. testid 부여.

- [ ] **Step 2: dev-report + DECISIONS + overview + README**
dev-report 섹션(개요/상태모델/전이 API/list 보정/FE/테스트). DECISIONS 신규(보류 상태 추가, 진행중↔보류, edit 권한 재사용, 라벨 업무용어 통일). overview + README 동기화.

- [ ] **Step 3: Docker 실 QA**
partner-order-service 본 브랜치 재빌드 컨테이너 대상 보류/해제 전이 + 리스트 필터 실 적중 스크린샷([[early-pr-docker-qa-screenshots]] / [[project-local-stack-qa-gotchas]] influxd 포트 우회).

- [ ] **Step 4: Commit**
```
docs(partner-order-hold): dev-report + DECISIONS + overview + Playwright + Docker 실 QA
```

---

## Self-Review (spec 대조)
- spec §3 상태모델 → T1 / §4.1 도메인 → T2 / §4.2 전이 API → T3 / confirm 가드 → T4 / §4.3 list → T5(정렬 보정, 필터 인프라는 기존) / §4.5 FE → T7 / §5 테스트 → T6·T8.
- placeholder: createFromEstimate 시그니처/DetailResponse 생성법/confirm 경로는 각 Task 에서 실파일 확인 명시.
- type 일관: markOnHold/releaseHold/hold/release/holdPartnerOrder/releasePartnerOrder 시그니처 일치.
- 마이그레이션 불필요(status CHECK 제약 없음) 확인됨.

## 실행 메모
- 구현 = Claude 에이전트(Codex 6/1 12:00 복구 전, [[early-pr-docker-qa-screenshots]]).
- 리뷰 = Claude 5-team 사이클 N=2([[cycle-n2-mandatory]]) → CI green(skipped=0) → Docker 실 QA → 머지.
- 선택 필요 시 [[always-mouse-choices]] (AskUserQuestion).
