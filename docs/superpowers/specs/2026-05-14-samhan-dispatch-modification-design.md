# Samhan Public 배차 수정/취소 요청 흐름 (Phase C) — 설계서

> 작성일: 2026-05-14
> Phase A (배차 메뉴 + arologis 발송, PR #188 머지) 후속. Phase B (인성데이타) 는 API 링크 도착 후 별도.

---

## 1. 배경 / 목적

배차 완료 후 (DispatchTask = DISPATCHED) Samhan Public 배차담당자가 수정/취소 요청을 아로로지스로 발송 → 아로로지스 수락 시 배차담당자가 수정/취소 가능 → 아로로지스에 재 발송 (수정 시).

사용자 메시지 (2026-05-14): "배차완료된 경우 배차내역 수정 및 취소요청을 아로로지스로 발송 가능 (아로로지스에서 수락 시 배차담당자가 수정 또는 취소 가능)".

**비목표 (Phase D~F 위임)**: GPS / 카톡 / 서명+사본.

---

## 2. Phase C 9 핵심 결정 (D-DC-01~09)

| # | 결정 | 결정값 |
|---|---|---|
| D-DC-01 | 수정 범위 (사용자 확정 2026-05-14) | **전체 수정** — slip 추가/제거 + 차량 그룹 재배치 + 정차 순서 + 차량 종류 변경 모두 가능 |
| D-DC-02 | 수정 lock policy | **DISPATCHED 상태에서만 요청 가능** (DRAFT/DISPATCHING/FAILED 에서는 직접 수정, lock X) |
| D-DC-03 | DispatchTaskStatus 신규 상태 6개 추가 | MODIFICATION_REQUESTED / MODIFICATION_ACCEPTED / MODIFICATION_REJECTED / CANCEL_REQUESTED / CANCEL_ACCEPTED / CANCEL_REJECTED |
| D-DC-04 | 아로로지스 측 수정 처리 = **delete-recreate** | 수정 수락 시 기존 Dispatch + Vehicle + Stop soft-delete → 배차담당자가 [배차 완료] 재 클릭 → arologis 가 새 entity 생성. incremental 회피 (race condition 가드) |
| D-DC-05 | 취소 처리 | CANCEL_ACCEPTED → DispatchTask CANCELLED + 매핑된 slip.dispatchStatus UNDISPATCHED 복귀 + arologis Dispatch soft-delete |
| D-DC-06 | 거부 처리 | MODIFICATION_REJECTED / CANCEL_REJECTED + 사유 (rejectionReason) + 배차담당자 notification 알림 |
| D-DC-07 | 수정/취소 권한 | 배차담당자 (ROLE_MANAGER + ROLE_MASTER + ROLE_DISPATCH) — auth-service Role |
| D-DC-08 | 재 dispatch 흐름 | MODIFICATION_ACCEPTED 후 배차담당자가 수정 작업 (drag-and-drop / 차량 추가 등) → [배차 완료] 재 클릭 → arologis 가 기존 Dispatch soft-delete + 새 Dispatch 생성 (D-DC-04 일관) |
| D-DC-09 | 알림 | notification-service Aligo — 요청/수락/거부/취소 각 시점 배차담당자 + (선택) 인수자 |

---

## 3. 전체 아키텍처

```
[배차 완료 후 DISPATCHED 상태]
        │
        │ 배차담당자가 배차 메뉴에서 DispatchTask 선택
        │   → [수정 요청] 또는 [취소 요청] 버튼
        │
        ▼
┌─ slip-service ──────────────────────────────────┐
│  POST /admin/dispatch-tasks/{id}/modification    │
│    + body: { reason } (선택)                     │
│  → DispatchTask.status = MODIFICATION_REQUESTED  │
│  → arologis 발송 (POST /internal/arologis/dispatches/{id}/modification-request) │
└──────────────────────────────────────────────────┘
        │
        ▼
┌─ arologis-service ─────────────────────────────┐
│  ArologisInternalController 확장:                │
│  POST /internal/arologis/dispatches/{arologisDispatchId}/modification-request │
│    + body: { samhanDispatchTaskId, reason }     │
│  → ArologisDispatchAdminController.handle: │
│    아로로지스 관리자가 수락/거부 결정 (UI 또는 API)  │
│  → 수락: POST {samhan}/internal/slip/dispatch-tasks/{id}/modification-accepted │
│  → 거부: POST {samhan}/internal/slip/dispatch-tasks/{id}/modification-rejected │
└────────────────────────────────────────────────┘
        │
        ▼
┌─ slip-service (회신 receive) ───────────────────┐
│  DispatchTaskModificationAcceptedService:        │
│  → DispatchTask.status = MODIFICATION_ACCEPTED   │
│  → arologis Dispatch soft-delete 호출            │
│  → notification-service 호출 (배차담당자)         │
└──────────────────────────────────────────────────┘
        │
        ▼
[배차담당자가 배차 메뉴 에서 수정 작업]
  - slip 추가/제거 (drag-and-drop)
  - 차량 그룹 재배치
  - 정차 순서 변경
  - 차량 종류 변경 (AddVehicleModal 활용)
        │
        ▼
[배차 완료] 재 클릭 → arologis 재 발송
  - DispatchTask.status = DISPATCHING (재 트랜잭션)
  - arologis 가 새 Dispatch + Vehicle + Stop 생성
  - 매칭 → 회신 → DISPATCHED 또는 FAILED
```

**취소 흐름**:
```
[수정 요청 대신 취소 요청]
  POST /admin/dispatch-tasks/{id}/cancellation → CANCEL_REQUESTED
  → arologis 발송
  → arologis 수락: POST /internal/slip/dispatch-tasks/{id}/cancellation-accepted
  → DispatchTask.status = CANCELLED + slip UNDISPATCHED 복귀 + arologis Dispatch soft-delete
  → notification (배차담당자)
```

---

## 4. 데이터 모델

### 4.1 DispatchTaskStatus enum 확장

```java
public enum DispatchTaskStatus {
    DRAFT,
    DISPATCHING,
    DISPATCHED,
    FAILED,
    // Phase C 신규
    MODIFICATION_REQUESTED,
    MODIFICATION_ACCEPTED,
    MODIFICATION_REJECTED,
    CANCEL_REQUESTED,
    CANCEL_ACCEPTED,
    CANCEL_REJECTED,
    CANCELLED   // 최종 취소 완료 (CANCEL_ACCEPTED 후 정정)
}
```

### 4.2 DispatchTask entity 신규 column

| 컬럼 | 타입 | 비고 |
|---|---|---|
| modification_reason | VARCHAR(500) NULL | 요청 시 사유 |
| rejection_reason | VARCHAR(500) NULL | 거부 시 사유 |
| modification_requested_at | TIMESTAMPTZ NULL | |
| modification_decided_at | TIMESTAMPTZ NULL | 수락/거부 시점 |

### 4.3 Flyway migration

| 버전 | 내용 |
|---|---|
| slip-service V23 | `dispatch_task` 의 status CHECK constraint 갱신 (11 값) + 4 column 추가 |

---

## 5. Service-to-service 통신 (Phase A 패턴 일관)

### 5.1 Samhan Public → arologis (수정 요청 / 취소 요청)

```
POST http://arologis-service:8097/internal/arologis/dispatches/{arologisDispatchId}/modification-request
Body: { "samhanDispatchTaskId": "<UUID>", "reason": "..." }
Response 204
```

```
POST http://arologis-service:8097/internal/arologis/dispatches/{arologisDispatchId}/cancellation-request
Body: { "samhanDispatchTaskId": "<UUID>", "reason": "..." }
Response 204
```

### 5.2 arologis → Samhan Public (수락/거부 회신)

```
POST http://slip-service:8086/internal/slip/dispatch-tasks/{taskId}/modification-accepted
Body: { "arologisDispatchId": "<UUID>", "decidedAt": "..." }
Response 204

POST http://slip-service:8086/internal/slip/dispatch-tasks/{taskId}/modification-rejected
Body: { "arologisDispatchId": "<UUID>", "rejectionReason": "..." }
Response 204

POST http://slip-service:8086/internal/slip/dispatch-tasks/{taskId}/cancellation-accepted
Body: { "arologisDispatchId": "<UUID>" }
Response 204

POST http://slip-service:8086/internal/slip/dispatch-tasks/{taskId}/cancellation-rejected
Body: { "arologisDispatchId": "<UUID>", "rejectionReason": "..." }
Response 204
```

### 5.3 Client 확장

- `ArologisDispatchClient` (slip-service): `requestModification()` + `requestCancellation()` 메서드 추가
- `SlipDispatchTaskClient` (arologis): `modificationAccepted()` / `modificationRejected()` / `cancellationAccepted()` / `cancellationRejected()` 4 메서드 추가

---

## 6. UI 흐름 + Layout

### 6.1 DispatchTask 상세 화면 (DISPATCHED 상태)

배차 메뉴의 DispatchTask 카드 클릭 → 상세 modal/page:

```
┌─ DispatchTask: DT-20260514-001 (DISPATCHED) ────┐
│  배차일: 2026-05-14                              │
│  기사: D-001 홍길동 010-1234-5678 (인성)         │
│  ─────────────────────────────────────────────  │
│  1톤 #1 (3건)                                    │
│   ① SL-001 대구공조                              │
│   ② SL-005 한솔                                  │
│   ③ SL-009 영진                                  │
│  ...                                             │
│                                                  │
│  [✏ 수정 요청]  [✗ 취소 요청]                    │
└──────────────────────────────────────────────────┘
```

### 6.2 수정/취소 요청 dialog

```
┌─ 수정 요청 (또는 취소 요청) ─────────────────────┐
│  사유 (선택)                                      │
│  ┌──────────────────────────────────────────┐   │
│  │ 슬립 SL-009 추가 + 정차 순서 조정 필요   │   │
│  └──────────────────────────────────────────┘   │
│                                                  │
│  [요청 발송]   [취소]                            │
└──────────────────────────────────────────────────┘
```

### 6.3 수정 수락 후 화면

DispatchTask.status = MODIFICATION_ACCEPTED → 배차담당자 화면에서 알림 + DispatchTask 가 다시 편집 모드 (drag-and-drop 활성) + [배차 완료] 버튼 재 노출.

### 6.4 mobile-staff

동일 흐름. tab 전환 + 터치 long-press.

---

## 7. 테스트 + 롤백

### 7.1 단위 (~20 case)

| 영역 | 케이스 |
|---|---|
| `DispatchTaskModificationRequestService` | DISPATCHED → MODIFICATION_REQUESTED + arologis 발송 (~5) |
| `DispatchTaskCancellationRequestService` | DISPATCHED → CANCEL_REQUESTED (~5) |
| `DispatchTaskModificationAcceptedService` | MODIFICATION_ACCEPTED + arologis Dispatch soft-delete (~3) |
| `DispatchTaskCancellationAcceptedService` | CANCELLED + slip UNDISPATCHED 복귀 (~4) |
| `DispatchTaskRejectedService` | rejection_reason 저장 + notification (~3) |

### 7.2 IT (~10 case, Docker 가용)

- `DispatchTaskAdminController.requestModification` / `.requestCancellation` (~3)
- `DispatchTaskInternalController` 의 4 신규 endpoint (modification-accepted/rejected + cancellation-accepted/rejected) (~4)
- e2e: DISPATCHED → MODIFICATION_REQUESTED → MODIFICATION_ACCEPTED → 재 DISPATCHED (~3)

### 7.3 FE 컴포넌트 (~10 case)

- DispatchTaskDetailModal 의 [수정 요청] / [취소 요청] 버튼 (~3)
- ModificationRequestDialog (~3)
- CancellationRequestDialog (~2)
- MODIFICATION_ACCEPTED 상태 indicator (~2)

### 7.4 QA 시나리오 (6장 캡처, PR 본문 인라인 의무)

1. DispatchTask DISPATCHED → [수정 요청] dialog → 발송
2. arologis 수락 → DispatchTask MODIFICATION_ACCEPTED + 편집 모드
3. 배차담당자가 slip 추가 + 차량 종류 변경 + [배차 완료] 재
4. arologis 거부 → MODIFICATION_REJECTED + 사유 표시
5. [취소 요청] → arologis 수락 → CANCELLED + slip UNDISPATCHED 복귀
6. mobile-staff 의 동일 흐름

### 7.5 롤백 (4 단계 reversible)

| Step | 절차 | 시간 |
|---|---|---|
| 1. FE 회수 | 신규 dialog + 상태 indicator 제거 | 30분 |
| 2. slip-service 회수 | 4 service + 2 controller endpoint + 6 enum 값 제거 | 30분 |
| 3. arologis 회수 | modification/cancellation request receive endpoint + 4 client 메서드 제거 | 20분 |
| 4. Flyway 회수 | V23 DOWN (status CHECK 11→4 + 4 column DROP) | 10분 |

---

## 8. 5-team 디스패치 단일 통합 PR

| Team | scope |
|---|---|
| **BE** | slip-service 5 service + 2 controller endpoint + DispatchTaskStatus 6 추가 + Flyway V23 + arologis ArologisInternalController 확장 (2 receive endpoint) + ArologisDispatchClient 2 메서드 + SlipDispatchTaskClient 4 메서드 + 단위 ~20 + IT ~10 |
| **FE** | desktop dispatch-board 페이지의 DispatchTaskDetailModal + ModificationRequestDialog + CancellationRequestDialog + MODIFICATION_ACCEPTED 편집 모드 indicator + mobile-staff 동일 흐름 |
| **Designer** | 4 화면 mock (DispatchTaskDetailModal / Modification dialog / Cancellation dialog / MODIFICATION_ACCEPTED 편집 indicator) |
| **QA** | 6 시나리오 + 회귀 + 4단계 롤백 + Mock PNG 6장 (PR 인라인 의무) |
| **DevOps** | 신규 환경변수 없음 (기존 SAMHAN_AROLOGIS_DISPATCH_URL / SAMHAN_SLIP_DISPATCH_TASK_URL 재활용). 변경 0 또는 minor |

**TM 통합** = 5 worktree merge + 컴파일 가드 + 회귀 + 문서 동기화 (README/ROADMAP/DECISIONS D-DC-00/service README/CLAUDE/메모리) + PR 본문 6 스크린샷 인라인.

**PM** = `gh pr checks --watch` + green + 머지 요청.

---

## 9. 메모리 + 후속

- `.claude/memory/project_samhan_dispatch_modification.md` (신규 또는 기존 `project_samhan_dispatch_board.md` 갱신)
- DECISIONS `D-DC-00~09` (10 entry)

**후속 Phase**:
- Phase D — GPS 실시간 공유 (SSE)
- Phase E — 인수자 카톡/문자 발송
- Phase F — 전자서명 양쪽 저장 + 사본 1회 발송
- Phase B (인성데이타) — API 링크 도착 후 별도

---

## 10. 참조

- [[project_samhan_dispatch_board]] — Phase A (배차 메뉴 + arologis 발송)
- [[feedback_integrated_pr_pattern]] / [[feedback_multi_agent_team_pattern]] / [[feedback_pr_qa_screenshots]] / [[feedback_arologis_extract_autopilot]] (자율 진행)
