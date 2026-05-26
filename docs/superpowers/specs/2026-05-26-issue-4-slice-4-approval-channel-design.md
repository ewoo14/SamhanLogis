# Issue 4 Slice 4 — APPROVAL 채널 통합 설계

> Issue 4 통합 알림 센터 후속 슬라이스 (Slice 1~3 머지 완료 후 첫 채널 확장).
>
> 사용자 결정 (2026-05-26): **APPROVAL + FE 신설**. 회계 수정/삭제 요청 워크플로우 (`AccountingEditRequestService`) 의 3 이벤트를 NotificationCenter 채널화 + 권한자 (MANAGER/MASTER) 대시보드 FE 신규.

## 1. 목표

1. **BE 발송**: `AccountingEditRequestService.request/approve/reject` 3 method 가 `NotificationPublisher.publish` 호출 (Slice 3 `NotificationPublisherSupport.publishAfterCommit` 재사용).
2. **권한자 알림**: 요청 생성 시 `target_role=["MASTER","MANAGER"]` 대상 알림.
3. **요청자 결과 알림**: 수락/거절 시 `target_user_id=requesterId` 대상 알림.
4. **FE 신설**: `/admin/accounting-edit-requests` 권한자 대시보드 — `SlipEditRequestsPage` 패턴 1:1 미러.
5. **사이드바 메뉴**: "회계 관리자" 그룹 안 "회계 수정 요청" 메뉴 (MANAGER/MASTER 한정 동적 RBAC).
6. **UUID 비공개**: deeplink path 의 `{requestId}` 는 URL 만 노출 + 화면 텍스트는 `requesterName` / 한국어 라벨만.

## 2. Architecture

### 2.1 데이터 흐름

```
[accounting-service]                    [notification-service]              [FE desktop]
AccountingEditRequestService            ┌─────────────────────┐
  .request() ─────────┐                 │ notification_center │
                      │  publishAfterCommit                   │
  .approve() ─────────┼───►NotificationPublisher              │
                      │      → POST /internal/notifications   │
  .reject()  ─────────┘      → INSERT row                     │
                                                              │
                                                              ▼
                              GET /api/v1/notifications/my (60s polling)
                              POST /api/v1/notifications/{id}/acknowledge
                                                              │
                                       NotificationBellDropdown
                                       (Slice 2 산출)
                                          │
                                          ▼ click
                              /admin/accounting-edit-requests
                              (Slice 4 신규 page)
```

### 2.2 3 이벤트 매핑

| Method | channel | severity | title (사용자 노출) | body | target_role | target_user_id | deeplink |
|---|---|---|---|---|---|---|---|
| `request` | `APPROVAL` | `INFO` | "회계 수정 요청 — {requesterName}" | "{type 라벨} 요청: {reason 80자}" | `["MASTER","MANAGER"]` | `null` | `/admin/accounting-edit-requests` |
| `approve` | `APPROVAL` | `INFO` | "회계 수정 요청 수락 — {approverName}" | "{type 라벨} 요청이 수락되었습니다." | `null` | `requesterId` | `/admin/accounting-edit-requests` |
| `reject` | `APPROVAL` | `WARNING` | "회계 수정 요청 거절 — {approverName}" | "{type 라벨} 요청이 거절되었습니다: {decisionReason 80자}" | `null` | `requesterId` | `/admin/accounting-edit-requests` |

- `sourceService` = `accounting-service` (자동 set, NotificationPublisher).
- `sourceRefId` = `requestId.toString()` (notification 의 source_ref_id 컬럼, FE 내부 mutation key).
- `target_role` ↔ `target_user_id` XOR invariant (V5 CHECK 충족).

### 2.3 비즈니스 식별자 (UUID 비공개)

- `title` / `body` 에 entity UUID 노출 금지 → `requesterName` / `approverName` / `type 라벨` 만.
- `deeplink` path 는 `/admin/accounting-edit-requests` (목록, 사용자 시각 ID 없음).
- 후속 detail page 추가 시 deeplink 가 `/admin/accounting-edit-requests/{slipNo or journalNo}` 로 변경 가능 (본 슬라이스 범위 외).

## 3. Components

### 3.1 BE — accounting-service

- `services/accounting-service/build.gradle` — `:shared:notification-publisher` 의존 추가
- `services/accounting-service/src/main/java/com/samhanair/logis/accounting/editrequest/service/AccountingEditRequestService.java`:
  - `NotificationPublisher` field 주입 (`@RequiredArgsConstructor`)
  - `request/approve/reject` 끝에 `NotificationPublisherSupport.publishAfterCommit(notificationPublisher, request)` 호출
  - `EditRequestType` → 한국어 라벨 helper (`EDIT` → "수정", `DELETE` → "삭제")
- `services/accounting-service/src/test/java/com/samhanair/logis/accounting/editrequest/service/AccountingEditRequestServiceTest.java`:
  - `@Mock NotificationPublisher notificationPublisher` 추가
  - 3 method 각각 afterCommit 검증 테스트 (Slice 3 `SafetyStockServiceTest` 패턴 미러 — `TransactionSynchronizationManager.initSynchronization()` → method 호출 → `verify(publisher, never())` → `afterCommit()` 콜백 → `verify(publisher)`)

### 3.2 FE — clients/desktop

- `clients/desktop/src/renderer/api/accountingEditRequest.ts` 신규:
  - `AccountingEditRequest` interface (BE `AccountingEditRequestResponse` 1:1)
  - `listAccountingEditRequests`, `approveAccountingEditRequest`, `rejectAccountingEditRequest` 함수
  - `ACCOUNTING_EDIT_REQUEST_REVIEWER_ROLES = ['MANAGER', 'MASTER'] as const`
  - `ACCOUNTING_EDIT_REQUEST_TYPE_LABEL`, `STATUS_LABEL`
- `clients/desktop/src/renderer/routes/admin/AccountingEditRequestsPage.tsx` 신규:
  - `SlipEditRequestsPage` 1:1 패턴 (React Query 30s polling + approve/reject mutation + reject reason dialog)
  - `data-testid`: `admin-accounting-edit-requests-table`, `-row-{requestIdSlice}`, `-approve-{slice}`, `-reject-{slice}`, `-empty`, `-reject-dialog`
- `clients/desktop/src/renderer/routes/index.tsx`:
  - `/admin/accounting-edit-requests` 라우트 등록 + `RoleGuard` + `usePermissions().canAccess()`
- `clients/desktop/src/renderer/components/AppLayout.tsx`:
  - "회계 관리자" 그룹 안 "회계 수정 요청" 메뉴 (PageCode 신규 또는 기존 `accounting.edit-requests`)
- `clients/desktop/src/renderer/api/mock.ts`:
  - `APPROVAL` channel mock seed 1건 추가 (NotificationBellDropdown 시각 회귀)

### 3.3 auth-service PageCode (필요 시)

- `services/auth-service/src/main/resources/db/migration/V28__add_accounting_edit_requests_pagecode.sql` (예시 번호) — `accounting.edit-requests` PageCode + MASTER/MANAGER view+edit 권한 seed.
- **선결정**: 이미 `editrequest.*` PageCode 가 있는지 검증 필요 → Codex 가 grep 후 결정.

## 4. 권한 매트릭스

| Endpoint / Page | Role | 비고 |
|---|---|---|
| `GET /accounting/edit-requests` | MANAGER, MASTER | 기존 (변경 없음) |
| `POST /accounting/edit-requests/{id}/approve` | MANAGER, MASTER | 기존 |
| `POST /accounting/edit-requests/{id}/reject` | MANAGER, MASTER | 기존 |
| `POST /internal/notifications` | X-Internal-Token (service-to-service) | Slice 1 산출 |
| `/admin/accounting-edit-requests` page | MANAGER, MASTER | Slice 4 신규 (RoleGuard + 동적 RBAC) |
| NotificationBell 알림 표시 | MASTER/MANAGER (REQUESTED), 요청자 본인 (APPROVED/REJECTED) | target filtering |

## 5. Error handling

- `NotificationPublisher.publish` fail-soft (Slice 3 패턴) — accounting 트랜잭션 영향 0.
- `afterCommit` 콜백은 트랜잭션 commit 성공 후 실행 — rollback 시 알림 발송 안 됨 (의도된 동작).
- FE approve/reject mutation 실패 시 toast + cache rollback.

## 6. Testing

### 6.1 BE 단위 테스트 (Slice 3 패턴 미러)

- `AccountingEditRequestServiceTest`:
  - `request_publishesApprovalNotificationCenterEvent_afterCommit` (target_role=MASTER+MANAGER 검증)
  - `approve_publishesNotificationCenterEvent_toRequester_afterCommit` (target_user_id=requesterId 검증)
  - `reject_publishesNotificationCenterEvent_toRequester_afterCommit` (target_user_id=requesterId + WARNING 검증)
  - 모두 `TransactionSynchronizationManager.initSynchronization()` → method 호출 → `verify(publisher, never())` → `afterCommit()` → `verify(publisher)` 패턴

### 6.2 FE 테스트

- TypeScript typecheck PASS
- `npm run lint` PASS
- `npm run build` PASS
- (선택) Playwright e2e fixture — Slice 2 mock 패턴 재사용

## 7. 메모리 가드 준수

- `feedback_korean_commits`: 한국어 commit/PR
- `feedback_uuid_no_user_visibility`: 화면 텍스트는 requesterName/approverName/type 라벨만 (entity UUID 노출 X)
- `feedback_it_mockbean_external_clients`: BE IT 의 NotificationPublisher mock
- `feedback_dual_5agent_review`: 사이클 1 Claude 5-team + Codex 5-section + Claude verify
- `feedback_continuous_docs_sync`: spec + plan + dev-report (별도 docs PR 금지)

## 8. 잔존 결정 (Slice 5+ 검토)

- entity 별 detail page (slip/journal/period) 신설 시 deeplink 정밀화
- AGING / ECOUNT_IMPORT 채널 통합 (Slice 5 후보)
- consume approval 시점 알림 추가 여부 (수락 후 작성자가 실제 mutation 한 시점 vs 수락 시점)
