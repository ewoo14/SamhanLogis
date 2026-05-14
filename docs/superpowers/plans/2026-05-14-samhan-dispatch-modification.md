# Samhan Public 배차 수정/취소 요청 (Phase C) — 구현 plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. 5-team 디스패치 패턴 ([[feedback_multi_agent_team_pattern]]).

**Goal:** Phase A (PR #188 머지) 후 DISPATCHED 상태의 DispatchTask 에 대해 수정/취소 요청 → 아로로지스 수락/거부 → 재 dispatch 또는 취소 흐름 구현.

**Architecture:** DispatchTaskStatus 6 신규 값 + slip-service 5 service (Modification/Cancellation 의 Request/Accepted/Rejected) + arologis 2 receive endpoint + ArologisDispatchClient 2 메서드 + SlipDispatchTaskClient 4 메서드 + FE 3 신규 컴포넌트. 아로로지스 측 = delete-recreate (D-DC-04).

**Tech Stack:** Spring Boot 3 / Java 17 / PostgreSQL Flyway / `@dnd-kit/core` (Phase A 재활용) / React 19 / RN Expo.

**참조 spec:** `docs/superpowers/specs/2026-05-14-samhan-dispatch-modification-design.md`

---

## 팀 디스패치 구조

| 팀 | scope | task |
|---|---|---|
| **BE** | slip-service 5 service + 2 controller endpoint + DispatchTaskStatus 6 추가 + Flyway V23. arologis ArologisInternalController 확장 (2) + SlipDispatchTaskClient 4 메서드 + ArologisDispatchClient 2 메서드. 단위 ~20 + IT ~10 | 8 task |
| **FE** | DispatchTaskDetailModal + ModificationRequestDialog + CancellationRequestDialog + 편집 모드 indicator (desktop + mobile-staff) | 4 task |
| **Designer** | 4 화면 mock (DispatchTask 상세 / 수정 요청 dialog / 취소 요청 dialog / MODIFICATION_ACCEPTED 편집 indicator) | 4 task |
| **QA** | 6 시나리오 + 회귀 + 4 단계 롤백 + Mock PNG 6장 (PowerShell System.Drawing + UTF-8 BOM) | 2 task |
| **DevOps** | 변경 0 (기존 환경변수 재활용) — skip | 0 |

합 18 + TM 5 + PM 2 = 25 task.

---

# Team 1: BE

## BE Task B1: DispatchTaskStatus 6 값 추가 + Flyway V23

**Files:**
- Modify: `services/slip-service/src/main/java/com/samhanair/logis/slip/domain/dispatch/DispatchTaskStatus.java`
- Create: `services/slip-service/src/main/resources/db/migration/V23__expand_dispatch_task_status.sql`

- [ ] **B1.1 — Enum 확장**

```java
public enum DispatchTaskStatus {
    DRAFT,
    DISPATCHING,
    DISPATCHED,
    FAILED,
    MODIFICATION_REQUESTED,
    MODIFICATION_ACCEPTED,
    MODIFICATION_REJECTED,
    CANCEL_REQUESTED,
    CANCEL_ACCEPTED,
    CANCEL_REJECTED,
    CANCELLED
}
```

- [ ] **B1.2 — Flyway V23**

```sql
-- V23__expand_dispatch_task_status.sql
ALTER TABLE dispatch_task DROP CONSTRAINT IF EXISTS dispatch_task_status_check;
ALTER TABLE dispatch_task ADD CONSTRAINT dispatch_task_status_check
  CHECK (status IN ('DRAFT','DISPATCHING','DISPATCHED','FAILED',
                    'MODIFICATION_REQUESTED','MODIFICATION_ACCEPTED','MODIFICATION_REJECTED',
                    'CANCEL_REQUESTED','CANCEL_ACCEPTED','CANCEL_REJECTED','CANCELLED'));

ALTER TABLE dispatch_task
  ADD COLUMN modification_reason       VARCHAR(500),
  ADD COLUMN rejection_reason          VARCHAR(500),
  ADD COLUMN modification_requested_at TIMESTAMP,
  ADD COLUMN modification_decided_at   TIMESTAMP;
```

- [ ] **B1.3 — DispatchTask entity 신규 4 column 매핑**

```java
@Column(name = "modification_reason", length = 500)
private String modificationReason;

@Column(name = "rejection_reason", length = 500)
private String rejectionReason;

@Column(name = "modification_requested_at")
private Instant modificationRequestedAt;

@Column(name = "modification_decided_at")
private Instant modificationDecidedAt;

// 전이 메서드
public void markModificationRequested(String reason) {
    if (this.status != DispatchTaskStatus.DISPATCHED) {
        throw new IllegalStateException("MODIFICATION_REQUESTED 는 DISPATCHED 에서만 가능");
    }
    this.status = DispatchTaskStatus.MODIFICATION_REQUESTED;
    this.modificationReason = reason;
    this.modificationRequestedAt = Instant.now();
}

public void markModificationAccepted() {
    this.status = DispatchTaskStatus.MODIFICATION_ACCEPTED;
    this.modificationDecidedAt = Instant.now();
}

public void markModificationRejected(String reason) {
    this.status = DispatchTaskStatus.MODIFICATION_REJECTED;
    this.rejectionReason = reason;
    this.modificationDecidedAt = Instant.now();
}

public void markCancelRequested(String reason) {
    if (this.status != DispatchTaskStatus.DISPATCHED) {
        throw new IllegalStateException("CANCEL_REQUESTED 는 DISPATCHED 에서만 가능");
    }
    this.status = DispatchTaskStatus.CANCEL_REQUESTED;
    this.modificationReason = reason;
    this.modificationRequestedAt = Instant.now();
}

public void markCancelAccepted() {
    this.status = DispatchTaskStatus.CANCEL_ACCEPTED;
    this.modificationDecidedAt = Instant.now();
}

public void markCancelRejected(String reason) {
    this.status = DispatchTaskStatus.CANCEL_REJECTED;
    this.rejectionReason = reason;
    this.modificationDecidedAt = Instant.now();
}

public void markCancelled() { this.status = DispatchTaskStatus.CANCELLED; }
```

- [ ] **B1.4 — commit**

```bash
git commit -m "feat(samhan-dispatch-modification): DispatchTaskStatus 6 값 추가 + Flyway V23 + 4 column"
```

---

## BE Task B2: ArologisDispatchClient — requestModification + requestCancellation

**Files:**
- Modify: `services/slip-service/src/main/java/com/samhanair/logis/slip/client/ArologisDispatchClient.java`
- Create: `services/slip-service/src/main/java/com/samhanair/logis/slip/dto/dispatch/ArologisModificationRequest.java`
- Create: `services/slip-service/src/main/java/com/samhanair/logis/slip/dto/dispatch/ArologisCancellationRequest.java`

- [ ] **B2.1 — DTO record 작성**

```java
public record ArologisModificationRequest(UUID samhanDispatchTaskId, String reason) {}
public record ArologisCancellationRequest(UUID samhanDispatchTaskId, String reason) {}
```

- [ ] **B2.2 — Client 2 메서드 추가**

```java
private static final String MODIFICATION_REQUEST_PATH = "/internal/arologis/dispatches/{id}/modification-request";
private static final String CANCELLATION_REQUEST_PATH = "/internal/arologis/dispatches/{id}/cancellation-request";

public void requestModification(UUID arologisDispatchId, ArologisModificationRequest request) {
    String token = internalAuthProperties.getToken();
    try {
        restClient.post()
            .uri(MODIFICATION_REQUEST_PATH, arologisDispatchId)
            .header(INTERNAL_TOKEN_HEADER, token)
            .contentType(MediaType.APPLICATION_JSON)
            .body(request)
            .retrieve()
            .toBodilessEntity();
    } catch (RestClientResponseException ex) {
        throw new BusinessException(ErrorCode.CONFLICT, "수정 요청 발송 실패 — status=" + ex.getStatusCode());
    }
}

public void requestCancellation(UUID arologisDispatchId, ArologisCancellationRequest request) {
    // 동일 패턴, CANCELLATION_REQUEST_PATH 활용
}
```

- [ ] **B2.3 — Test (~3 case)**

- [ ] **B2.4 — commit**

```bash
git commit -m "feat(samhan-dispatch-modification): ArologisDispatchClient — requestModification + requestCancellation"
```

---

## BE Task B3: DispatchTaskModificationRequestService

**Files:**
- Create: `services/slip-service/src/main/java/com/samhanair/logis/slip/service/dispatch/DispatchTaskModificationRequestService.java`
- Test: `services/slip-service/src/test/java/com/samhanair/logis/slip/service/dispatch/DispatchTaskModificationRequestServiceTest.java`

- [ ] **B3.1 — Service 구현**

```java
@Service @RequiredArgsConstructor @Transactional
public class DispatchTaskModificationRequestService {
    private final DispatchTaskRepository taskRepo;
    private final ArologisDispatchClient arologisClient;
    private final NotificationClient notificationClient;

    public DispatchTask request(UUID taskId, String reason, String actor) {
        DispatchTask task = taskRepo.findById(taskId).orElseThrow();
        task.markModificationRequested(reason);
        taskRepo.save(task);

        arologisClient.requestModification(task.getArologisDispatchId(),
            new ArologisModificationRequest(task.getId(), reason));

        notificationClient.sendModificationRequested(task.getTaskCode(), actor);
        return task;
    }
}
```

- [ ] **B3.2 — Test (~5 case) + commit**

```bash
git commit -m "feat(samhan-dispatch-modification): DispatchTaskModificationRequestService — DISPATCHED → MODIFICATION_REQUESTED"
```

---

## BE Task B4: DispatchTaskCancellationRequestService (B3 패턴 일관)

**Files:**
- Create: `services/slip-service/src/main/java/com/samhanair/logis/slip/service/dispatch/DispatchTaskCancellationRequestService.java`
- Test: `~5 case`

- [ ] **B4.1 — Service 구현 (B3 패턴, `requestCancellation()` 호출 + `markCancelRequested()`)**

- [ ] **B4.2 — commit**

```bash
git commit -m "feat(samhan-dispatch-modification): DispatchTaskCancellationRequestService — DISPATCHED → CANCEL_REQUESTED"
```

---

## BE Task B5: DispatchTask Accepted/Rejected Service (4 case 통합)

**Files:**
- Create: `services/slip-service/src/main/java/com/samhanair/logis/slip/service/dispatch/DispatchTaskModificationDecisionService.java`
- Create: `services/slip-service/src/main/java/com/samhanair/logis/slip/service/dispatch/DispatchTaskCancellationDecisionService.java`
- Test: ~8 case

- [ ] **B5.1 — DispatchTaskModificationDecisionService 구현**

```java
@Service @RequiredArgsConstructor @Transactional
public class DispatchTaskModificationDecisionService {
    private final DispatchTaskRepository taskRepo;
    private final NotificationClient notificationClient;

    public void accept(UUID taskId, String actor) {
        DispatchTask task = taskRepo.findById(taskId).orElseThrow();
        task.markModificationAccepted();
        taskRepo.save(task);
        notificationClient.sendModificationAccepted(task.getTaskCode(), actor);
    }

    public void reject(UUID taskId, String reason, String actor) {
        DispatchTask task = taskRepo.findById(taskId).orElseThrow();
        task.markModificationRejected(reason);
        taskRepo.save(task);
        notificationClient.sendModificationRejected(task.getTaskCode(), reason, actor);
    }
}
```

- [ ] **B5.2 — DispatchTaskCancellationDecisionService 구현** (accept → CANCELLED + slip UNDISPATCHED 복귀 + arologis Dispatch soft-delete 호출)

```java
public void accept(UUID taskId, String actor) {
    DispatchTask task = taskRepo.findById(taskId).orElseThrow();
    task.markCancelAccepted();
    taskRepo.save(task);

    // slip UNDISPATCHED 복귀 + arologis Dispatch soft-delete
    cascadeUndispatch(task);

    task.markCancelled();
    taskRepo.save(task);

    notificationClient.sendCancellationAccepted(task.getTaskCode(), actor);
}
```

- [ ] **B5.3 — commit**

```bash
git commit -m "feat(samhan-dispatch-modification): Accepted/Rejected Decision Service 2종 + cascade undispatch"
```

---

## BE Task B6: DispatchTaskAdminController + InternalController 확장

**Files:**
- Modify: `services/slip-service/src/main/java/com/samhanair/logis/slip/controller/DispatchTaskAdminController.java`
- Modify: `services/slip-service/src/main/java/com/samhanair/logis/slip/controller/DispatchTaskInternalController.java`

- [ ] **B6.1 — Admin endpoint 2 추가**

```java
@PostMapping("/{taskId}/modification-request")
public DispatchTaskResponse requestModification(@PathVariable UUID taskId,
                                                  @RequestBody @Valid ModificationRequestBody req,
                                                  @RequestHeader("X-User-Id") String actor) {
    return DispatchTaskResponse.from(modificationRequestService.request(taskId, req.reason(), actor));
}

@PostMapping("/{taskId}/cancellation-request")
public DispatchTaskResponse requestCancellation(@PathVariable UUID taskId,
                                                  @RequestBody @Valid CancellationRequestBody req,
                                                  @RequestHeader("X-User-Id") String actor) {
    return DispatchTaskResponse.from(cancellationRequestService.request(taskId, req.reason(), actor));
}

public record ModificationRequestBody(@NotBlank @Size(max = 500) String reason) {}
public record CancellationRequestBody(@NotBlank @Size(max = 500) String reason) {}
```

- [ ] **B6.2 — Internal endpoint 4 추가** (arologis 회신 receive)

```java
@PostMapping("/{taskId}/modification-accepted")
@ResponseStatus(HttpStatus.NO_CONTENT)
public void modificationAccepted(@PathVariable UUID taskId,
                                  @RequestBody @Valid DispatchTaskModificationAcceptedRequest req) {
    modificationDecisionService.accept(taskId, "arologis-service");
}

@PostMapping("/{taskId}/modification-rejected")
@ResponseStatus(HttpStatus.NO_CONTENT)
public void modificationRejected(@PathVariable UUID taskId,
                                   @RequestBody @Valid DispatchTaskModificationRejectedRequest req) {
    modificationDecisionService.reject(taskId, req.rejectionReason(), "arologis-service");
}

@PostMapping("/{taskId}/cancellation-accepted")
@ResponseStatus(HttpStatus.NO_CONTENT)
public void cancellationAccepted(@PathVariable UUID taskId,
                                   @RequestBody @Valid DispatchTaskCancellationAcceptedRequest req) {
    cancellationDecisionService.accept(taskId, "arologis-service");
}

@PostMapping("/{taskId}/cancellation-rejected")
@ResponseStatus(HttpStatus.NO_CONTENT)
public void cancellationRejected(@PathVariable UUID taskId,
                                   @RequestBody @Valid DispatchTaskCancellationRejectedRequest req) {
    cancellationDecisionService.reject(taskId, req.rejectionReason(), "arologis-service");
}
```

- [ ] **B6.3 — IT (~6 case) + commit**

```bash
git commit -m "feat(samhan-dispatch-modification): Admin 2 + Internal 4 endpoint 확장 + IT"
```

---

## BE Task B7: arologis ArologisInternalController + SlipDispatchTaskClient 확장

**Files:**
- Modify: `services/arologis-service/src/main/java/com/samhanair/logis/arologis/controller/ArologisInternalController.java`
- Modify: `services/arologis-service/src/main/java/com/samhanair/logis/arologis/client/SlipDispatchTaskClient.java`
- Create: `services/arologis-service/src/main/java/com/samhanair/logis/arologis/service/ModificationRequestReceiveService.java`

- [ ] **B7.1 — ArologisInternalController 에 2 receive endpoint 추가** (modification-request + cancellation-request)

```java
@PostMapping("/dispatches/{arologisDispatchId}/modification-request")
@ResponseStatus(HttpStatus.NO_CONTENT)
public void receiveModificationRequest(@PathVariable UUID arologisDispatchId,
                                        @RequestBody @Valid ArologisModificationRequest req) {
    modificationReceiveService.receiveModification(arologisDispatchId, req);
}

@PostMapping("/dispatches/{arologisDispatchId}/cancellation-request")
@ResponseStatus(HttpStatus.NO_CONTENT)
public void receiveCancellationRequest(@PathVariable UUID arologisDispatchId,
                                        @RequestBody @Valid ArologisCancellationRequest req) {
    modificationReceiveService.receiveCancellation(arologisDispatchId, req);
}
```

- [ ] **B7.2 — ModificationRequestReceiveService 구현** (Mock 자동 수락 — Phase A 패턴, 실 운영은 arologis 관리자 UI 별도)

```java
@Service @RequiredArgsConstructor @Transactional
public class ModificationRequestReceiveService {
    private final SlipDispatchTaskClient slipClient;

    public void receiveModification(UUID arologisDispatchId, ArologisModificationRequest req) {
        // Phase C Mock = 자동 수락 (5초 후 비동기 회신)
        CompletableFuture.runAsync(() -> {
            try { Thread.sleep(5000); } catch (InterruptedException e) { Thread.currentThread().interrupt(); }
            slipClient.modificationAccepted(req.samhanDispatchTaskId(), arologisDispatchId);
        });
    }

    public void receiveCancellation(UUID arologisDispatchId, ArologisCancellationRequest req) {
        CompletableFuture.runAsync(() -> {
            try { Thread.sleep(5000); } catch (InterruptedException e) { Thread.currentThread().interrupt(); }
            slipClient.cancellationAccepted(req.samhanDispatchTaskId(), arologisDispatchId);
        });
    }
}
```

- [ ] **B7.3 — SlipDispatchTaskClient 4 메서드 추가** (modificationAccepted / modificationRejected / cancellationAccepted / cancellationRejected, B2 패턴 일관)

- [ ] **B7.4 — IT (~3 case) + commit**

```bash
git commit -m "feat(samhan-dispatch-modification): arologis 2 receive endpoint + 4 회신 client + Mock 자동 수락"
```

---

## BE Task B8: e2e IT 통합

**Files:**
- Create: `services/slip-service/src/test/java/com/samhanair/logis/slip/it/dispatch/DispatchModificationEndToEndIT.java`

- [ ] **B8.1 — e2e 시나리오 ~3 case**

```java
@Test void dispatched_then_modification_request_accepted_marks_MODIFICATION_ACCEPTED() { /* ... */ }
@Test void dispatched_then_cancellation_request_accepted_marks_CANCELLED_and_undispatch_slips() { /* ... */ }
@Test void modification_rejected_keeps_status_DISPATCHED_with_rejection_reason() { /* ... */ }
```

- [ ] **B8.2 — commit**

```bash
git commit -m "test(samhan-dispatch-modification): DispatchModificationEndToEndIT — 3 e2e 시나리오"
```

---

# Team 2: FE

## FE Task F1: DispatchTaskDetailModal (DISPATCHED 상세 + 수정/취소 버튼)

**Files:**
- Modify: `clients/desktop/src/renderer/routes/dispatch-board/components/SlipDetailModal.tsx` (또는 신규 `DispatchTaskDetailModal.tsx`)

- [ ] **F1.1 — DispatchTask 상세 + [수정 요청] / [취소 요청] 버튼 추가**

```tsx
function DispatchTaskDetailModal({ taskId, status, ...rest }) {
  const showRequestButtons = status === 'DISPATCHED';
  return (
    <Modal>
      {/* ... DispatchTask 상세 ... */}
      {showRequestButtons && (
        <>
          <button onClick={openModificationDialog}>수정 요청</button>
          <button onClick={openCancellationDialog}>취소 요청</button>
        </>
      )}
    </Modal>
  );
}
```

- [ ] **F1.2 — commit**

```bash
git commit -m "feat(samhan-dispatch-modification): DispatchTaskDetailModal — DISPATCHED 의 수정/취소 버튼 활성"
```

---

## FE Task F2: ModificationRequestDialog + CancellationRequestDialog

**Files:**
- Create: `clients/desktop/src/renderer/routes/dispatch-board/components/ModificationRequestDialog.tsx`
- Create: `clients/desktop/src/renderer/routes/dispatch-board/components/CancellationRequestDialog.tsx`
- Modify: `clients/desktop/src/renderer/api/dispatchTask.ts` (2 신규 endpoint)

- [ ] **F2.1 — API client 확장**

```ts
export async function requestModification(taskId: string, reason: string): Promise<DispatchTaskResponse> {
  return api.post(`/admin/dispatch-tasks/${taskId}/modification-request`, { reason }).then(r => r.data);
}
export async function requestCancellation(taskId: string, reason: string): Promise<DispatchTaskResponse> {
  return api.post(`/admin/dispatch-tasks/${taskId}/cancellation-request`, { reason }).then(r => r.data);
}
```

- [ ] **F2.2 — Dialog 컴포넌트 2개 (사유 input + 발송 버튼 + spinner)**

```tsx
function ModificationRequestDialog({ taskId, onClose }) {
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const handleSubmit = async () => {
    setSubmitting(true);
    await requestModification(taskId, reason);
    setSubmitting(false);
    onClose();
  };
  return (
    <Dialog>
      <h2>수정 요청</h2>
      <textarea value={reason} onChange={e => setReason(e.target.value)} placeholder="사유 (선택)" />
      <button onClick={handleSubmit} disabled={submitting}>요청 발송</button>
      <button onClick={onClose}>취소</button>
    </Dialog>
  );
}
```

- [ ] **F2.3 — commit**

```bash
git commit -m "feat(samhan-dispatch-modification): Modification/Cancellation RequestDialog 2 + API client"
```

---

## FE Task F3: MODIFICATION_ACCEPTED 편집 모드 indicator

**Files:**
- Modify: `clients/desktop/src/renderer/routes/dispatch-board/components/VehicleGroupCard.tsx` (편집 모드 활성)
- Modify: `clients/desktop/src/renderer/routes/dispatch-board/DispatchBoardPage.tsx` (status 별 분기)

- [ ] **F3.1 — DispatchTask.status === MODIFICATION_ACCEPTED 시 drag-and-drop 활성 + [배차 완료] 버튼 재 노출**

```tsx
const canEdit = task.status === 'DRAFT' || task.status === 'MODIFICATION_ACCEPTED';
const showCompleteButton = canEdit;
```

- [ ] **F3.2 — 상태 배지 추가** (MODIFICATION_REQUESTED 보라색 / MODIFICATION_ACCEPTED 녹색 + 편집 가능 안내 / MODIFICATION_REJECTED 빨강 + 사유 / CANCEL_REQUESTED/ACCEPTED/REJECTED 동일 패턴)

- [ ] **F3.3 — commit**

```bash
git commit -m "feat(samhan-dispatch-modification): MODIFICATION_ACCEPTED 편집 모드 활성 + 6 신규 상태 배지"
```

---

## FE Task F4: mobile-staff DispatchBoardScreen 동일 흐름

**Files:**
- Modify: `clients/mobile-staff/src/screens/dispatch-board/DispatchBoardScreen.tsx`

- [ ] **F4.1 — DispatchTask 상세 sheet 의 [수정 요청] / [취소 요청] 버튼 + sub-sheet (사유 input)**

- [ ] **F4.2 — commit**

```bash
git commit -m "feat(samhan-dispatch-modification): mobile-staff 동일 흐름 — 수정/취소 sheet + 편집 모드"
```

---

# Team 3: Designer

## Designer Task D1~D4

**Files (4 NEW):**
- `docs/uiux/samhan-dispatch-modification/01-task-detail-with-actions.md`
- `docs/uiux/samhan-dispatch-modification/02-modification-request-dialog.md`
- `docs/uiux/samhan-dispatch-modification/03-cancellation-request-dialog.md`
- `docs/uiux/samhan-dispatch-modification/04-modification-accepted-edit-mode.md`

각 task = 1 mock md + ASCII layout + 색상 토큰 (Samhan Public design system + Phase A 일관) + a11y + data-testid.

- [ ] **D1~D4 commit (4 commit)**

```bash
git commit -m "docs(samhan-dispatch-modification): Designer D1~D4 — 4 화면 mock"
```

---

# Team 4: QA

## QA Task Q1: 6 시나리오 + 검증 SQL

**Files:**
- Create: `docs/qa/samhan-dispatch-modification/scenarios.md`

- [ ] **Q1.1 — 6 시나리오 작성** (spec § 7.4)

검증 SQL 예:
```sql
-- 시나리오 2: MODIFICATION_ACCEPTED 후 status 검증
SELECT task_code, status, modification_decided_at FROM dispatch_task
WHERE task_code = 'DT-20260514-001' AND is_deleted = FALSE;
-- Expected: status = MODIFICATION_ACCEPTED, modification_decided_at NOT NULL
```

- [ ] **Q1.2 — commit**

---

## QA Task Q2: Mock PNG 6장 + 회귀 + 롤백 runbook

**Files:**
- Create: `docs/qa/samhan-dispatch-modification/regression.md`
- Create: `docs/qa/samhan-dispatch-modification/rollback-dry-run.md`
- Create: `scripts/generate-samhan-dispatch-modification-screenshots.ps1` (PR #185/#187/#188 패턴 일관, UTF-8 BOM)
- Create: `docs/qa/samhan-dispatch-modification/screenshots/01~06.png`

- [ ] **Q2.1 — script 작성 + PNG 6장 생성 + commit**

```bash
git commit -m "docs(samhan-dispatch-modification): QA 6 시나리오 + 회귀/롤백 + Mock PNG 6장"
```

---

# Team 5: DevOps

**변경 0** — 기존 환경변수 (`SAMHAN_AROLOGIS_DISPATCH_URL` / `SAMHAN_SLIP_DISPATCH_TASK_URL`) 재활용. skip.

---

# Team 6: TM

- [ ] **T1: 5 worktree merge into baseline (BE → FE → Designer → QA, DevOps 0)**
- [ ] **T2: 컴파일 가드** (`gradlew :services:slip-service:assemble :services:arologis-service:assemble`)
- [ ] **T3: 회귀 가드 (기존 IT/단위)**
- [ ] **T4: 문서 동기화** (DECISIONS D-DC-00 + project_samhan_dispatch_modification.md 또는 기존 갱신 + ROADMAP)
- [ ] **T5: 통합 PR 발행 (한국어 + QA 6 스크린샷 인라인)**

---

# Team 7: PM

- [ ] **P1: `gh pr checks --watch`**
- [ ] **P2: green + 0결함 → 개발책임자 머지 요청**

---

# Self-review 결과

- [x] **Spec coverage**: spec § 4 (data) = B1 / § 5 (통신) = B2/B7 / § 6 (UI) = F1~F4 / § 7 (테스트) = B6/B8/Q1/Q2 / § 8 (5-team) = 본 plan 전체
- [x] **Placeholder scan**: D1~D4 / Q1~Q2 / F4 압축 — spec/scope 명확
- [x] **Type consistency**: DispatchTaskStatus 11 값 + 6 신규 transition method 일관
