# Issue 4 Slice 4 — APPROVAL 채널 통합 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Codex 디스패치 의무 (feedback_codex_implements_claude_reviews).

**Goal:** `AccountingEditRequestService.request/approve/reject` 3 method → NotificationPublisher.publishAfterCommit (Slice 3 패턴 재사용). FE `/admin/accounting-edit-requests` 신규 (`SlipEditRequestsPage` 1:1 미러).

**Spec:** [`docs/superpowers/specs/2026-05-26-issue-4-slice-4-approval-channel-design.md`](../specs/2026-05-26-issue-4-slice-4-approval-channel-design.md)

**Tech Stack:** Spring Boot 3.3.5, RestClient, React 18 + TanStack Query, Vite

---

## Task 1: BE accounting-service publish 통합

**Files:**
- Modify: `services/accounting-service/build.gradle`
- Modify: `services/accounting-service/src/main/java/com/samhanair/logis/accounting/editrequest/service/AccountingEditRequestService.java`
- Modify: `services/accounting-service/src/test/java/com/samhanair/logis/accounting/editrequest/service/AccountingEditRequestServiceTest.java`

### Step 1.1: build.gradle 의존 추가

`services/accounting-service/build.gradle` dependencies 블록:

```gradle
implementation project(':shared:notification-publisher')
```

### Step 1.2: AccountingEditRequestService field + publish 호출

- `NotificationPublisher` field 주입 (`private final`)
- `EditRequestType` → 한국어 라벨 private helper:

```java
private static String typeLabel(EditRequestType type) {
    return switch (type) {
        case EDIT -> "수정";
        case DELETE -> "삭제";
    };
}
```

- `request` 메서드 끝 (broker.publish 후, return saved 전):

```java
NotificationPublisherSupport.publishAfterCommit(notificationPublisher, new NotificationPublishRequest(
        "APPROVAL",
        NotificationSeverity.INFO,
        String.format("회계 수정 요청 — %s", requesterName),
        String.format("%s 요청: %s", typeLabel(requestType),
                reason == null ? "" : (reason.length() > 80 ? reason.substring(0, 80) : reason)),
        List.of("MASTER", "MANAGER"),
        null,
        null,
        saved.getId().toString(),
        "/admin/accounting-edit-requests"
));
```

- `approve` 메서드 끝:

```java
NotificationPublisherSupport.publishAfterCommit(notificationPublisher, new NotificationPublishRequest(
        "APPROVAL",
        NotificationSeverity.INFO,
        String.format("회계 수정 요청 수락 — %s", approverName),
        String.format("%s 요청이 수락되었습니다.", typeLabel(request.getRequestType())),
        null,
        request.getRequesterId(),
        null,
        request.getId().toString(),
        "/admin/accounting-edit-requests"
));
```

- `reject` 메서드 끝:

```java
NotificationPublisherSupport.publishAfterCommit(notificationPublisher, new NotificationPublishRequest(
        "APPROVAL",
        NotificationSeverity.WARNING,
        String.format("회계 수정 요청 거절 — %s", approverName),
        String.format("%s 요청이 거절되었습니다: %s",
                typeLabel(request.getRequestType()),
                decisionReason == null ? "" : (decisionReason.length() > 80
                        ? decisionReason.substring(0, 80) : decisionReason)),
        null,
        request.getRequesterId(),
        null,
        request.getId().toString(),
        "/admin/accounting-edit-requests"
));
```

### Step 1.3: 테스트 보강

`AccountingEditRequestServiceTest`:
- `@Mock NotificationPublisher notificationPublisher` 추가
- 3 method 각각 afterCommit 검증 테스트 (Slice 3 `SafetyStockServiceTest.defersNotificationCenterPublishUntilAfterCommit` 패턴 1:1):

```java
@Test
void request_publishesApprovalNotificationCenterEvent_afterCommit() {
    UUID entityId = UUID.randomUUID();
    UUID requesterId = UUID.randomUUID();
    when(requestRepository.save(any(AccountingEditRequest.class)))
            .thenAnswer(inv -> inv.getArgument(0));

    TransactionSynchronizationManager.initSynchronization();
    try {
        service.request(entityId, EditRequestType.EDIT, "사유", requesterId, "홍길동");
        verify(notificationPublisher, never()).publish(any());
        TransactionSynchronizationManager.getSynchronizations()
                .forEach(TransactionSynchronization::afterCommit);
    } finally {
        TransactionSynchronizationManager.clearSynchronization();
    }
    ArgumentCaptor<NotificationPublishRequest> captor =
            ArgumentCaptor.forClass(NotificationPublishRequest.class);
    verify(notificationPublisher).publish(captor.capture());
    NotificationPublishRequest req = captor.getValue();
    assertThat(req.channel()).isEqualTo("APPROVAL");
    assertThat(req.targetRole()).containsExactly("MASTER", "MANAGER");
    assertThat(req.targetUserId()).isNull();
    assertThat(req.deeplink()).isEqualTo("/admin/accounting-edit-requests");
}
```

- `approve_publishesNotificationCenterEvent_toRequester_afterCommit` (target_user_id = requesterId 검증)
- `reject_publishesNotificationCenterEvent_toRequester_afterCommit` (target_user_id = requesterId + WARNING 검증)

### Step 1.4: 컴파일 + test

```powershell
$env:GRADLE_USER_HOME='C:\dev\SamhanLogis\.gradle\codex-home'
.\gradlew.bat :services:accounting-service:test --tests 'com.samhanair.logis.accounting.editrequest.service.AccountingEditRequestServiceTest' --no-daemon
```

Expected: PASS (기존 + 신규 3 cases).

### Step 1.5: Commit

```
feat(notification-publisher): Slice 4 Task 1 — AccountingEditRequestService.request/approve/reject → NotificationPublisher afterCommit (APPROVAL channel)
```

---

## Task 2: FE accountingEditRequest.ts API client

**Files:**
- Create: `clients/desktop/src/renderer/api/accountingEditRequest.ts`

### Step 2.1: 인터페이스 + 함수

`slipEditRequest.ts` 1:1 미러:

```typescript
import { apiClient, type ApiEnvelope } from './client'

export type AccountingEditRequestType = 'EDIT' | 'DELETE'
export type AccountingEditRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED'

export interface AccountingEditRequest {
  id: string
  entityId: string
  requestType: AccountingEditRequestType
  status: AccountingEditRequestStatus
  reason: string | null
  requesterId: string
  requesterName: string
  targetRole: string
  decidedById: string | null
  decidedByName: string | null
  decisionReason: string | null
  requestedAt: string
  decidedAt: string | null
  expiresAt: string | null
}

export interface RejectAccountingEditRequestBody {
  reason: string
}

export interface ApproveAccountingEditRequestBody {
  note?: string
}

export async function listAccountingEditRequests(): Promise<AccountingEditRequest[]> {
  const res = await apiClient.get<ApiEnvelope<AccountingEditRequest[]>>(
    '/api/v1/accounting/edit-requests',
    { params: { targetRole: 'MANAGER' } },
  )
  return res.data.data
}

export async function approveAccountingEditRequest(
  requestId: string,
  body: ApproveAccountingEditRequestBody = {},
): Promise<AccountingEditRequest> {
  const res = await apiClient.post<ApiEnvelope<AccountingEditRequest>>(
    `/api/v1/accounting/edit-requests/${encodeURIComponent(requestId)}/approve`,
    body,
  )
  return res.data.data
}

export async function rejectAccountingEditRequest(
  requestId: string,
  body: RejectAccountingEditRequestBody,
): Promise<AccountingEditRequest> {
  const res = await apiClient.post<ApiEnvelope<AccountingEditRequest>>(
    `/api/v1/accounting/edit-requests/${encodeURIComponent(requestId)}/reject`,
    body,
  )
  return res.data.data
}

export const ACCOUNTING_EDIT_REQUEST_REVIEWER_ROLES = ['MANAGER', 'MASTER'] as const

export const ACCOUNTING_EDIT_REQUEST_TYPE_LABEL: Record<AccountingEditRequestType, string> = {
  EDIT: '수정',
  DELETE: '삭제',
}

export const ACCOUNTING_EDIT_REQUEST_STATUS_LABEL: Record<AccountingEditRequestStatus, string> = {
  PENDING: '처리 대기',
  APPROVED: '수락됨',
  REJECTED: '거절됨',
}
```

**중요**: gateway prefix `/api/v1` 확인 필요. BE controller 가 `/accounting` 만 매핑하므로 gateway `/api/v1/accounting/**` route 가 있어야 함 — `application.yml` 또는 gateway `RouteLocator` 검증. 기존 `partnerAging.ts` 등 accounting endpoint 호출 파일에서 prefix 패턴 확인.

### Step 2.2: Commit

```
feat(accounting-edit-requests): Slice 4 Task 2 — accountingEditRequest.ts API client (SlipEditRequest 패턴 미러)
```

---

## Task 3: FE AccountingEditRequestsPage 신규

**Files:**
- Create: `clients/desktop/src/renderer/routes/admin/AccountingEditRequestsPage.tsx`

### Step 3.1: 페이지 컴포넌트

`SlipEditRequestsPage.tsx` 1:1 미러. 변경점:
- `usePageTitle('회계 수정/삭제 요청')`
- API: `listAccountingEditRequests` / `approveAccountingEditRequest` / `rejectAccountingEditRequest`
- 표 columns: 요청자 / 요청 유형 / 사유 / 요청 시각 / 액션 (UUID 노출 금지 — `requesterName`, `requestType` label, `reason`, `requestedAt`)
- `data-testid`:
  - `admin-accounting-edit-requests-table`
  - `admin-accounting-edit-requests-row-{requestId.slice(0,8)}` (UUID 짧은 slice 만, 사용자 시각 노출 X)
  - `admin-accounting-edit-requests-approve-{slice}`
  - `admin-accounting-edit-requests-reject-{slice}`
  - `admin-accounting-edit-requests-empty`
  - `admin-accounting-edit-requests-reject-dialog`

### Step 3.2: Commit

```
feat(accounting-edit-requests): Slice 4 Task 3 — AccountingEditRequestsPage 신규 (SlipEditRequestsPage 패턴 미러)
```

---

## Task 4: 라우트 + 사이드바 메뉴 + RoleGuard

**Files:**
- Modify: `clients/desktop/src/renderer/routes/index.tsx`
- Modify: `clients/desktop/src/renderer/components/AppLayout.tsx`
- (조건부) `services/auth-service/src/main/resources/db/migration/V*__add_accounting_edit_requests_pagecode.sql`

### Step 4.1: 라우트 등록

`routes/index.tsx`:
```typescript
import { AccountingEditRequestsPage } from './admin/AccountingEditRequestsPage'
import { ACCOUNTING_EDIT_REQUEST_REVIEWER_ROLES } from '../api/accountingEditRequest'

// children 배열 안:
{
  path: '/admin/accounting-edit-requests',
  element: (
    <RoleGuard allowedRoles={ACCOUNTING_EDIT_REQUEST_REVIEWER_ROLES}>
      <AccountingEditRequestsPage />
    </RoleGuard>
  ),
},
```

### Step 4.2: 사이드바 메뉴

`AppLayout.tsx` "회계 관리자" 그룹 안:
```typescript
{
  pageCode: 'accounting.edit-requests',
  label: '회계 수정 요청',
  path: '/admin/accounting-edit-requests',
  roles: ['MASTER', 'MANAGER'],
}
```

### Step 4.3: PageCode seed (조건부)

grep `accounting.edit-requests` PageCode 가 V27 등에 이미 있는지 검증.
- 있으면 skip.
- 없으면 신규 Flyway V{next}_add_accounting_edit_requests_pagecode.sql 추가 (MASTER/MANAGER view+edit).

### Step 4.4: Commit

```
feat(accounting-edit-requests): Slice 4 Task 4 — /admin/accounting-edit-requests 라우트 + 사이드바 메뉴 + 동적 RBAC
```

---

## Task 5: NotificationBell mock seed 추가 (선택)

**Files:**
- Modify: `clients/desktop/src/renderer/api/mock.ts`

APPROVAL channel 알림 1건 시각 회귀용 mock seed 추가 (Slice 2 mock 패턴):

```typescript
{
  id: 'mock-approval-1',
  channel: 'APPROVAL',
  severity: 'INFO',
  title: '회계 수정 요청 — 홍길동',
  body: '수정 요청: 1월 마감 후 발견된 매입 누락 건 수정',
  // ...
  deeplink: '/admin/accounting-edit-requests',
}
```

### Step 5.1: Commit

```
feat(accounting-edit-requests): Slice 4 Task 5 — mock.ts APPROVAL seed (NotificationBell 시각 회귀)
```

---

## Task 6: PR 발행

### Step 6.1: 전체 검증

```powershell
$env:GRADLE_USER_HOME='C:\dev\SamhanLogis\.gradle\codex-home'
.\gradlew.bat :services:accounting-service:test :shared:notification-publisher:test --no-daemon

cd clients/desktop
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run build
```

### Step 6.2: Push + PR

```bash
git push -u origin feat/issue-4-slice-4-approval-channel

gh pr create --title "[FEAT] Issue 4 Slice 4 — APPROVAL 채널 통합 (회계 수정 요청 알림 + 권한자 대시보드)" --body "<see PR body template>"
```

---

## Self-Review

### Spec coverage
- [x] BE 3 method afterCommit publish (Task 1)
- [x] FE API client (Task 2)
- [x] FE page (Task 3)
- [x] 라우트 + 사이드바 + RBAC (Task 4)
- [x] mock seed (Task 5)
- [x] PR (Task 6)

### Placeholder scan
0건 (PageCode V{next} 만 grep 검증 후 결정)

### Type consistency
- BE `AccountingEditRequestResponse` ↔ FE `AccountingEditRequest` interface 컬럼 1:1 (요구 시 BE DTO 확인 commit)

### Scope
단일 Slice 4. AGING/ECOUNT_IMPORT 채널은 Slice 5 분리. accounting entity 별 detail page deeplink 정밀화는 후속.
