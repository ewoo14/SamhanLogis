# 코-에디팅 S3-1 — 주문(partner-order) 메모 coedit 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 주문(partner-order) 상세 화면에 단일 협업 메모 필드(실시간 동시편집)를 slip 패턴 1:1로 추가한다.

**Architecture:** S3-0 공용화 토대(`shared/collab-core` `CollabCoeditService` 자동설정 빈 + FE `createCoeditProvider`/`makeCoeditApi`/`CollaborativeTextField`) 위에 slip 메모 coedit 를 이식한다. BE 는 기존 `PartnerOrderCollabController`(풀패스 `/api/v1/partner-orders/{orderId}/collab`)에 coedit 3엔드포인트 + DTO 3종만 additive 추가하고, FE 는 기존 `PartnerOrderCollaborationPanel` 에 `CollaborativeTextField` 메모 블록만 추가한다. coedit relay 는 in-memory(영속·Flyway·엔티티 변경 0)이며 `resolveOrderId(orderId)` UUID 키로 기존 SSE/presence/comment 채널과 정합한다.

**Tech Stack:** Spring Boot 3.3 / Java 17 / MockMvc + Testcontainers PostgreSQL IT (BE) · React 18 / TypeScript / Yjs / Vitest (FE) · Electron 데스크톱.

## Global Constraints

- **Flyway / 엔티티 / 리포지토리 변경 0** — coedit 은 노드-로컬 in-memory relay (`CollabCoeditService`). 신규 마이그레이션·테이블·컬럼 없음.
- **신규 `@Bean`/`@Configuration` 불요** — `CollabCoeditService` 는 `shared/collab-core` `CollabCoreAutoConfiguration` 자동설정 빈. partner-order build.gradle 가 `:shared:collab-core` 의존을 이미 보유. 생성자 주입만 추가.
- **orderId path 형 = 주문번호 하이픈형 또는 UUID** — basePath 에 `encodeURIComponent(orderId)` 필수(게이트웨이 %2F 차단 회피). BE `resolveOrderId(orderId)`(`PartnerOrderIdResolver`)가 실 UUID 로 변환 — coedit·comment·presence·stream 동일 키.
- **게이트웨이 prefix 비대칭** — partner-order 컨트롤러는 풀패스 `/api/v1/partner-orders/{orderId}/collab`(slip 의 StripPrefix 와 다름). FE `normalizeCoeditBasePath` 가 `/api/v1` prepend → coedit 3엔드포인트가 컨트롤러 매핑과 정합. slip 코드 복붙 시 `/api/v1` 누락/중복 금지.
- **page-code 정확 일치** — coedit GET/awareness = `READ_PAGE_CODE`(`sales.partner-order.list`, VIEW), coedit update = `WRITE_PAGE_CODE`(`sales.partner-order.edit`, UPDATE). FE `readOnly={!canWriteComments}`(=`canAccess('sales.partner-order.edit','update')`)와 정합.
- **UUID 비노출** — 화면/DTO wire payload 에 account/order UUID 노출 금지. coedit relay payload 는 opaque base64 update/awareness 만.
- **한국어 Javadoc/주석 + 한국어 커밋/PR.** `[FEAT]` 대괄호 prefix. Role 풀네임.
- **coedit 메모("협업 메모") ≠ persisted memo("요청사항")** — coedit 메모는 in-memory 비영속 실시간 스크래치 패드. editMode 폼의 commitEdit memo(요청사항)와 별개. 라벨 "협업 메모"로 구분.

---

### Task 1: BE — coedit DTO 3종 + `PartnerOrderCollabController` coedit 3엔드포인트 + IT

**Files:**
- Create: `services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/web/collab/dto/PartnerOrderCoeditUpdateRequest.java`
- Create: `services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/web/collab/dto/PartnerOrderCoeditAwarenessRequest.java`
- Create: `services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/web/collab/dto/PartnerOrderCoeditUpdatesResponse.java`
- Modify: `services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/web/collab/PartnerOrderCollabController.java` (생성자 주입 + coedit 3엔드포인트)
- Test: `services/partner-order-service/src/test/java/com/samhanair/logis/partnerorder/it/collab/PartnerOrderCollabIT.java` (coedit 케이스 추가)

**Interfaces:**
- Consumes: `com.samhanair.logis.collab.coedit.CollabCoeditService` — `void appendUpdate(UUID documentId, String update)`, `List<String> listUpdates(UUID documentId)`, `void publishAwareness(UUID documentId, String awareness)` (자동설정 빈). `resolveOrderId(String)` (컨트롤러 private, 기존).
- Produces: coedit 3엔드포인트 (`GET /api/v1/partner-orders/{orderId}/collab/coedit`, `POST .../coedit/update`, `POST .../coedit/awareness`) + DTO record 3종. FE `createCoeditProvider` default API 가 소비.

- [ ] **Step 1: coedit DTO record 3종 작성**

`PartnerOrderCoeditUpdateRequest.java`:
```java
package com.samhanair.logis.partnerorder.web.collab.dto;

/** 주문 협업 텍스트 Yjs update relay 요청. update 는 opaque base64 byte 문자열이다. */
public record PartnerOrderCoeditUpdateRequest(String update) {
}
```

`PartnerOrderCoeditAwarenessRequest.java`:
```java
package com.samhanair.logis.partnerorder.web.collab.dto;

/** 주문 협업 텍스트 awareness relay 요청. awareness 는 opaque base64 byte 문자열이다. */
public record PartnerOrderCoeditAwarenessRequest(String awareness) {
}
```

`PartnerOrderCoeditUpdatesResponse.java`:
```java
package com.samhanair.logis.partnerorder.web.collab.dto;

import java.util.List;

/** 신규 접속자가 Y.Doc 상태를 재구성하기 위한 누적 Yjs update 목록. */
public record PartnerOrderCoeditUpdatesResponse(List<String> updates) {
}
```

- [ ] **Step 2: 컨트롤러에 `CollabCoeditService` 주입 + coedit 3엔드포인트 추가**

`PartnerOrderCollabController.java` — import 추가(기존 import 블록):
```java
import com.samhanair.logis.collab.coedit.CollabCoeditService;
import com.samhanair.logis.partnerorder.web.collab.dto.PartnerOrderCoeditAwarenessRequest;
import com.samhanair.logis.partnerorder.web.collab.dto.PartnerOrderCoeditUpdateRequest;
import com.samhanair.logis.partnerorder.web.collab.dto.PartnerOrderCoeditUpdatesResponse;
```

필드 추가(`private final PresenceService presenceService;` 다음):
```java
    private final CollabCoeditService coeditService;
```

생성자 — 파라미터에 `CollabCoeditService coeditService` 추가(`PresenceService presenceService` 다음) + 본문 할당:
```java
    public PartnerOrderCollabController(CollabCommentService<PartnerOrderCollabComment> commentService,
                                        PartnerOrderCollabEditService editService,
                                        PartnerOrderCollabSuggestionRepository suggestionRepository,
                                        PartnerOrderDocumentCollaborationPort port,
                                        RealtimeBroker broker,
                                        PartnerOrderRepository partnerOrderRepository,
                                        PresenceService presenceService,
                                        CollabCoeditService coeditService) {
        this.commentService = commentService;
        this.editService = editService;
        this.suggestionRepository = suggestionRepository;
        this.port = port;
        this.broker = broker;
        this.partnerOrderRepository = partnerOrderRepository;
        this.presenceService = presenceService;
        this.coeditService = coeditService;
    }
```

coedit 3엔드포인트 — 기존 `stream(...)` 메서드 **앞**(SSE stream 위)에 추가:
```java
    /** 주문 협업 메모 Yjs update 누적 snapshot. 서버는 update 내용을 해석하지 않는다. */
    @Operation(summary = "주문 협업 메모 coedit update snapshot")
    @GetMapping("/coedit")
    @RequirePermission(page = READ_PAGE_CODE, action = PermissionAction.VIEW)
    public ApiResponse<PartnerOrderCoeditUpdatesResponse> listCoeditUpdates(@PathVariable String orderId) {
        UUID resolvedOrderId = resolveOrderId(orderId);
        return ApiResponse.ok(new PartnerOrderCoeditUpdatesResponse(coeditService.listUpdates(resolvedOrderId)));
    }

    /** 주문 협업 메모 Yjs update relay. 같은 collab SSE stream 으로 coedit:update 이벤트가 발행된다. */
    @Operation(summary = "주문 협업 메모 coedit update relay")
    @PostMapping("/coedit/update")
    @RequirePermission(page = WRITE_PAGE_CODE, action = PermissionAction.UPDATE)
    public ApiResponse<Void> appendCoeditUpdate(
            @PathVariable String orderId,
            @RequestBody(required = false) PartnerOrderCoeditUpdateRequest request) {
        UUID resolvedOrderId = resolveOrderId(orderId);
        coeditService.appendUpdate(resolvedOrderId, request == null ? null : request.update());
        return ApiResponse.ok(null);
    }

    /** 주문 협업 메모 cursor/selection relay. 저장하지 않는 ephemeral 이벤트다. */
    @Operation(summary = "주문 협업 메모 coedit awareness relay")
    @PostMapping("/coedit/awareness")
    @RequirePermission(page = READ_PAGE_CODE, action = PermissionAction.VIEW)
    public ApiResponse<Void> publishCoeditAwareness(
            @PathVariable String orderId,
            @RequestBody(required = false) PartnerOrderCoeditAwarenessRequest request) {
        UUID resolvedOrderId = resolveOrderId(orderId);
        coeditService.publishAwareness(resolvedOrderId, request == null ? null : request.awareness());
        return ApiResponse.ok(null);
    }
```

- [ ] **Step 3: coedit IT 케이스 작성(실패 확인)** — `PartnerOrderCollabIT.java` 에 추가. base64 = `dXBkYXRl`("update"), `YXdhcmU=`("aware").

```java
    /** coedit update relay 가 누적되고 GET snapshot 으로 재구성되며, hyphen orderNo path-id 로도 동작한다. */
    @Test
    void coedit_update_accumulates_andListSnapshot_andAcceptsHyphenPathId() throws Exception {
        PartnerOrder order = seedConfirmedOrder("2099/06/27-COED-" + SEQ.getAndIncrement());
        UUID orderId = order.getId();
        String pathId = order.getOrderNo().replace("/", "-");

        // 빈 snapshot
        mvc.perform(get("/api/v1/partner-orders/{orderId}/collab/coedit", orderId)
                        .header(USER_ID_HEADER, ACTOR_ID))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.updates.length()").value(0));

        // UUID 키로 update 1건
        mvc.perform(post("/api/v1/partner-orders/{orderId}/collab/coedit/update", orderId)
                        .header(USER_ID_HEADER, ACTOR_ID)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("update", "dXBkYXRl"))))
                .andExpect(status().isOk());

        // 하이픈형 path-id 로 update 1건 더 — 같은 주문(resolveOrderId) 채널에 누적
        mvc.perform(post("/api/v1/partner-orders/{orderId}/collab/coedit/update", pathId)
                        .header(USER_ID_HEADER, ACTOR_ID)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("update", "YXdhcmU="))))
                .andExpect(status().isOk());

        mvc.perform(get("/api/v1/partner-orders/{orderId}/collab/coedit", pathId)
                        .header(USER_ID_HEADER, ACTOR_ID))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.updates.length()").value(2))
                .andExpect(jsonPath("$.data.updates[0]").value("dXBkYXRl"))
                .andExpect(jsonPath("$.data.updates[1]").value("YXdhcmU="));
    }

    /** coedit update 의 잘못된 base64 는 400, awareness 는 저장하지 않고 200 으로 중계만 한다. */
    @Test
    void coedit_rejectsInvalidBase64Update_andAwarenessIsNotPersisted() throws Exception {
        UUID orderId = seedConfirmedOrder("2099/06/27-COEDV-" + SEQ.getAndIncrement()).getId();

        // 잘못된 base64 → 400
        mvc.perform(post("/api/v1/partner-orders/{orderId}/collab/coedit/update", orderId)
                        .header(USER_ID_HEADER, ACTOR_ID)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("update", "!!not-base64!!"))))
                .andExpect(status().isBadRequest());

        // awareness 는 200(중계만) — snapshot 에 누적되지 않음
        mvc.perform(post("/api/v1/partner-orders/{orderId}/collab/coedit/awareness", orderId)
                        .header(USER_ID_HEADER, ACTOR_ID)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("awareness", "YXdhcmU="))))
                .andExpect(status().isOk());

        mvc.perform(get("/api/v1/partner-orders/{orderId}/collab/coedit", orderId)
                        .header(USER_ID_HEADER, ACTOR_ID))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.updates.length()").value(0));
    }

    /** coedit update 는 WRITE(sales.partner-order.edit/UPDATE) 권한 deny 시 403 으로 거부된다. */
    @Test
    void coedit_update_deniedWithoutWritePermission_returns403() throws Exception {
        UUID orderId = seedConfirmedOrder("2099/06/27-COEDP-" + SEQ.getAndIncrement()).getId();
        String writePageCode = com.samhanair.logis.partnerorder.collab.PartnerOrderDocumentCollaborationPort
                .PARTNER_ORDER_COLLAB_WRITE_PAGE_CODE;
        when(dynamicPermissionClient.check(
                any(UUID.class), eq(writePageCode), eq(PermissionAction.UPDATE)))
                .thenReturn(false);
        when(dynamicPermissionClient.canEdit(any(), eq(writePageCode)))
                .thenReturn(false);

        mvc.perform(post("/api/v1/partner-orders/{orderId}/collab/coedit/update", orderId)
                        .header(USER_ID_HEADER, ACTOR_ID)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("update", "dXBkYXRl"))))
                .andExpect(status().isForbidden());
    }
```

- [ ] **Step 4: BE 빌드 + IT 실행(통과 확인)**

Run: `./gradlew :services:partner-order-service:compileJava :services:partner-order-service:test --tests "com.samhanair.logis.partnerorder.it.collab.PartnerOrderCollabIT"`
Expected: BUILD SUCCESSFUL, coedit 3 테스트 포함 전 케이스 PASS (Windows 한글경로 Testcontainers skip 가능 → fresh Postgres probe 또는 standalone 라이브 QA 는 Task 3).

- [ ] **Step 5: 커밋**

```bash
git add services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/web/collab/
git add services/partner-order-service/src/test/java/com/samhanair/logis/partnerorder/it/collab/PartnerOrderCollabIT.java
git commit -F <commit-msg-file>
```
커밋 메시지(Write→`git commit -F`): `[FEAT] 코-에디팅 S3-1 BE — 주문 메모 coedit 3엔드포인트 + DTO 3종 (#PR)`

---

### Task 2: FE — `PartnerOrderCollaborationPanel` 협업 메모 필드 + 배선 테스트

**Files:**
- Modify: `clients/desktop/src/renderer/components/collab/PartnerOrderCollaborationPanel.tsx` (메모 블록 + `collabBasePath` useMemo)
- Test: `clients/desktop/src/renderer/components/collab/PartnerOrderCollaborationPanel.coedit.test.tsx` (신규, 배선 단언)

**Interfaces:**
- Consumes: `CollaborativeTextField`(`./CollaborativeTextField`) props `{ documentId, basePath, fieldName, label, rows?, readOnly? }`. `canAccess('sales.partner-order.edit','update')`(기존 L164 `canWriteComments`).
- Produces: 상세 화면 협업 카드 상단 "협업 메모" 실시간 동시편집 필드. basePath=`/partner-orders/${encodeURIComponent(orderId)}`.

- [ ] **Step 1: FE 배선 테스트 작성(실패 확인)** — `PartnerOrderCollaborationPanel.coedit.test.tsx`:

```tsx
// @vitest-environment jsdom
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

// CollaborativeTextField 를 stub 으로 대체해 패널이 넘기는 props(배선)만 단언 — 실 provider/네트워크 회피.
vi.mock('./CollaborativeTextField', () => ({
  CollaborativeTextField: (props: {
    documentId: string
    basePath: string
    fieldName: string
    label: string
    readOnly?: boolean
  }) => (
    <div
      data-testid="memo-coedit-stub"
      data-document-id={props.documentId}
      data-base-path={props.basePath}
      data-field-name={props.fieldName}
      data-read-only={String(props.readOnly)}
    >
      {props.label}
    </div>
  ),
}))

vi.mock('../../hooks/usePresence', () => ({ usePresence: () => [] }))
const canAccessMock = vi.fn(() => true)
vi.mock('../../hooks/usePermissions', () => ({ usePermissions: () => ({ canAccess: canAccessMock }) }))
vi.mock('../../realtime/PartnerOrderCollabRealtimeClient', () => ({
  PartnerOrderCollabRealtimeClient: { subscribe: () => ({ abort: () => undefined }) },
}))
vi.mock('../../api/partnerOrderCollab', () => ({
  getPartnerOrderCollabComments: vi.fn(() => Promise.resolve([])),
  getPartnerOrderCollabEdits: vi.fn(() => Promise.resolve([])),
  addPartnerOrderCollabComment: vi.fn(),
  deletePartnerOrderCollabComment: vi.fn(),
  resolvePartnerOrderCollabComment: vi.fn(),
  commitPartnerOrderCollabEdit: vi.fn(),
}))

import { PartnerOrderCollaborationPanel } from './PartnerOrderCollaborationPanel'

function renderPanel(orderId: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <PartnerOrderCollaborationPanel
        orderId={orderId}
        currentValues={{ memo: null, dueDate: null, lines: [] }}
      />
    </QueryClientProvider>,
  )
}

afterEach(() => {
  cleanup()
  canAccessMock.mockReturnValue(true)
})

describe('PartnerOrderCollaborationPanel coedit 메모 배선', () => {
  it('협업 메모 필드를 documentId/basePath(encodeURIComponent)/fieldName=memo 로 배선한다', () => {
    renderPanel('2099/06/27-COED-1')
    const stub = screen.getByTestId('memo-coedit-stub')
    expect(stub.textContent).toBe('협업 메모')
    expect(stub.getAttribute('data-document-id')).toBe('2099/06/27-COED-1')
    expect(stub.getAttribute('data-base-path')).toBe('/partner-orders/2099%2F06%2F27-COED-1')
    expect(stub.getAttribute('data-field-name')).toBe('memo')
    expect(stub.getAttribute('data-read-only')).toBe('false')
  })

  it('편집 권한이 없으면 협업 메모를 readOnly 로 배선한다', () => {
    canAccessMock.mockReturnValue(false)
    renderPanel('2099/06/27-COED-2')
    expect(screen.getByTestId('memo-coedit-stub').getAttribute('data-read-only')).toBe('true')
  })
})
```

- [ ] **Step 2: 테스트 실행(실패 확인)**

Run: `cd clients/desktop && node_modules/.bin/vitest run src/renderer/components/collab/PartnerOrderCollaborationPanel.coedit.test.tsx`
Expected: FAIL — `memo-coedit-stub` 미존재(패널에 아직 메모 블록 없음).

- [ ] **Step 3: 패널에 메모 블록 + basePath 추가** — `PartnerOrderCollaborationPanel.tsx`:

import 추가(`import { PresenceIndicator } from './PresenceIndicator'` 다음):
```tsx
import { CollaborativeTextField } from './CollaborativeTextField'
```

`collabBasePath` useMemo 추가(`const orderQueryKey = useMemo(...)` 다음, L162 근방):
```tsx
  const collabBasePath = useMemo(
    () => `/partner-orders/${encodeURIComponent(orderId)}`,
    [orderId],
  )
```

메모 블록 추가 — 협업 헤더 div(`<PresenceIndicator .../></div>`) 와 `<div className="detail-grid" ...>` **사이**(slip L282-291 1:1):
```tsx
        <div style={{ marginBottom: 16 }}>
          <CollaborativeTextField
            documentId={orderId}
            basePath={collabBasePath}
            fieldName="memo"
            label="협업 메모"
            rows={4}
            readOnly={!canWriteComments}
          />
        </div>
```

- [ ] **Step 4: 테스트 + 타입체크(통과 확인)**

Run: `cd clients/desktop && node_modules/.bin/vitest run src/renderer/components/collab/PartnerOrderCollaborationPanel.coedit.test.tsx && npm run typecheck`
Expected: 2 passed · typecheck(tsconfig.node+web) 0 error.

- [ ] **Step 5: 커밋**

```bash
git add clients/desktop/src/renderer/components/collab/PartnerOrderCollaborationPanel.tsx
git add clients/desktop/src/renderer/components/collab/PartnerOrderCollaborationPanel.coedit.test.tsx
git commit -F <commit-msg-file>
```
커밋 메시지: `[FEAT] 코-에디팅 S3-1 FE — 주문 협업 메모 동시편집 필드 + 배선 테스트 (#PR)`

---

### Task 3: 라이브 QA(실 relay round-trip) + 문서 동기화

**Files:**
- Create: `docs/dev-reports/2026-06-30-coedit-s3-1-partner-order.md` (함수 단위 3-layer 문서)
- Create: `docs/qa/coedit-s3-1-partner-order/*.png` (단계별 실 캡처)
- Modify: `docs/handoff/CURRENT-WORK.md` · `docs/samhan-public-overview.html` (진행 동기화)
- Modify: `README.md` / `ROADMAP` / `DECISIONS` 관련 절(협업 S3-1 반영)

**Interfaces:** 없음(검증·문서 단계).

- [ ] **Step 1: 실 Docker 라이브 QA — 2세션 메모 동시 타이핑 또는 standalone relay round-trip**

방법 A(권장, 자격 무관): partner-order-service standalone 부팅(docker Postgres) → `POST /api/v1/partner-orders/{orderId}/collab/coedit/update`(base64 update) → 다른 클라이언트 `GET .../coedit` 누적 확인 + SSE `/collab/stream` 으로 `coedit:update` 수신 실증. CONFIRMED 주문 시드.
방법 B: 데스크톱 2세션(VITE_MOCK_MODE off, `VITE_API_BASE_URL=:8080`) 주문 상세 협업 메모에 동시 타이핑 → 원격 커서/실시간 텍스트 병합 단계별 캡처.
- 단계별 스샷(한 장 금지): 진입 → 세션1 입력 → 세션2 원격 반영 → 커서/병합 → 권한 없는 열람자 readOnly. `docs/qa/coedit-s3-1-partner-order/`.
- 🚫 가짜 캡처(PIL 합성/mock 화면) 금지. 실연동 불가 시 사유 정직 보고 + Linux CI 결과 첨부.

- [ ] **Step 2: dev-report + docs 동기화 작성**

`docs/dev-reports/2026-06-30-coedit-s3-1-partner-order.md`: 구현 범위(BE 3엔드포인트·DTO 3종·FE 메모 필드), resolveOrderId 키 정합, page-code 매핑, in-memory relay 한계(노드-로컬·재시작 소실), 라이브 QA 결과/캡처 링크, 후속(S3-1b 폼 셀 / S3-2 견적).
handoff·overview·README/ROADMAP/DECISIONS 협업 S3-1 진행 반영(별도 docs PR 금지 — 본 PR 에 포함).

- [ ] **Step 3: 커밋**

```bash
git add docs/
git commit -F <commit-msg-file>
```
커밋 메시지: `docs: 코-에디팅 S3-1 주문 메모 coedit — dev-report + 라이브 QA + 진행 동기화 (#PR)`

---

## Self-Review

**1. Spec coverage:** spec 의 BE 컴포넌트(coedit 3엔드포인트 + DTO 3종 + resolveOrderId 키 + Flyway 0) = Task 1 ✓. FE 컴포넌트(메모 `CollaborativeTextField` + basePath encodeURIComponent) = Task 2 ✓. Testing(BE `PartnerOrderCollabIT` coedit·FE 배선·라이브 QA round-trip) = Task 1 Step 3 + Task 2 Step 1 + Task 3 Step 1 ✓. Error/edge(orderId path형·게이트웨이 prefix·coedit≠도메인 memo·권한 가드·base64 검증) = Global Constraints + Task 1 IT 케이스 ✓.

**2. Placeholder scan:** "TBD"/"적절히"/"유사하게" 등 없음 — 전 step 실 코드/실 명령/기대출력 포함 ✓.

**3. Type consistency:** DTO record 명 = 컨트롤러 사용처 일치(`PartnerOrderCoeditUpdateRequest.update()`·`PartnerOrderCoeditAwarenessRequest.awareness()`·`PartnerOrderCoeditUpdatesResponse(List<String>)`) ✓. `CollabCoeditService` 메서드 시그니처(`appendUpdate`/`listUpdates`/`publishAwareness`) = shared 정의 일치 ✓. 컨트롤러 `READ_PAGE_CODE`/`WRITE_PAGE_CODE` = 기존 static 상수 재사용 ✓. FE `collabBasePath`/`canWriteComments` = 기존 식별자 일치 ✓.
