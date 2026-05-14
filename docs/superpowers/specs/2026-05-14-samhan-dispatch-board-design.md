# Samhan Public 배차 메뉴 (Phase A) — 설계서

> 작성일: 2026-05-14
> 작성자: PM (Claude Opus 4.7) + 개발책임자 (ewoo14)
> 상태: brainstorming 완료, plan 작성 대기
> Phase: 출고전표 → 배차 → 기사 매칭 → GPS → 서명 → 사본 흐름 6 Phase 중 **A 우선**

---

## 1. 배경 / 목적

Samhan Public 의 출고전표 (slip-service) → 배차담당자 → 아로로지스 발송 흐름의 **배차 메뉴 UI + service-to-service 발송** 을 구현. 본 Phase A 는 Mock matcher 활용 (Phase B 에서 InsungQuickDriverMatcher 실 활성).

**사용자 요구 (2026-05-14 메시지)**:
- 사무실 → 창고 → 배차담당자 흐름의 배차 메뉴 화면 (Samhan Public)
- 50개 페이지네이션 + 날짜 ±1일 + 미배차 default
- 차량 추가 (9 종류) + drag-and-drop (desktop mouse / mobile touch)
- 배차 완료 → 아로로지스 발송 + 매칭 회신 → Samhan Public Slip.dispatchStatus 변경

**비목표 (Phase B~F 위임)**:
- 인성데이타 API 실 활성 (Phase B)
- 수정/취소 요청 흐름 (Phase C)
- GPS 실시간 공유 (Phase D)
- 인수자 카톡/문자 발송 (Phase E)
- 전자서명 양쪽 저장 + 사본 1회 발송 (Phase F)

---

## 2. Phase A 핵심 결정 (개발책임자 확정 2026-05-14)

| # | 결정 | 결정값 |
|---|---|---|
| D-DB-01 | 배차 도메인 위치 | **slip-service 안 신규 도메인** (DispatchTask + DispatchVehicleGroup + DispatchVehicleGroupSlip) |
| D-DB-02 | drag-and-drop 라이브러리 | **`@dnd-kit/core` + `@dnd-kit/sortable`** (TouchSensor + PointerSensor, accessibility) |
| D-DB-03 | 차량 종류 enum | arologis `VehicleTonnage` 확장 (legacy 2 deprecated, 신규 9 active = MOTORCYCLE/DAMAS/TONNAGE_1/1_5/2_5/3/5/10/20) |
| D-DB-04 | Slip dispatchStatus 추적 | **slip 테이블에 column 추가** (UNDISPATCHED / DISPATCHING / DISPATCHED) |
| D-DB-05 | arologis 발송 endpoint | 신규 `POST /internal/arologis/dispatches` (X-Internal-Token + ROLE_MASTER) |
| D-DB-06 | UI 지원 범위 | **desktop + mobile-staff 양쪽** (touch sensor) |
| D-DB-07 | Phase A 매칭 구현 | **MockDriverMatcher** (Phase B 에서 InsungQuickDriverMatcher 실 활성) |
| D-DB-08 | 회신 endpoint (arologis → slip-service) | `POST /internal/slip/dispatch-tasks/{id}/confirm` + `/unavailable` |
| D-DB-09 | 알림 트리거 | notification-service Aligo 호출 (배차담당자, 회신 시점) |

---

## 3. 전체 아키텍처

```
┌──────────────────────── Samhan Public ─────────────────────────┐
│                                                                 │
│  [영업직원] → slip-service POST /sales/slips (출고전표 DRAFT)    │
│      ↓                                                          │
│  [창고 출고인 → 검수인] (기존 slip lifecycle: PICKED → INSPECTED)│
│      ↓                                                          │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ 배차 메뉴 (desktop + mobile-staff)                       │   │
│  │  - 미배차 출고전표 50개 페이지네이션                     │   │
│  │  - 날짜 default Asia/Seoul today ±1일                    │   │
│  │  - 상태 default UNDISPATCHED                             │   │
│  │  - 차량 추가 (9 종류)                                    │   │
│  │  - drag-and-drop (mouse + touch)                         │   │
│  │  - 출고전표 상세 modal                                   │   │
│  │  - [배차 완료] → arologis 발송                            │   │
│  └─────────────────────────────────────────────────────────┘   │
│           │                                                     │
│  ┌─ slip-service (BE) ─────────────────────────────────────┐   │
│  │  - DispatchTask (DRAFT/DISPATCHING/DISPATCHED/FAILED)   │   │
│  │  - DispatchVehicleGroup + DispatchVehicleGroupSlip       │   │
│  │  - Slip.dispatchStatus column 추가                       │   │
│  │  - ArologisDispatchClient (outbound)                     │   │
│  │  - DispatchTaskInternalController (inbound 회신)         │   │
│  └─────────────────────────────────────────────────────────┘   │
└────────────────────────┬────────────────────────────────────────┘
                         │ REST + X-Internal-Token (Eureka 공유)
                         ▼
┌──────────────────────── 아로로지스 ───────────────────────────────┐
│  ┌─ ArologisInternalController (확장) ───────────────────────┐  │
│  │  POST /internal/arologis/dispatches  ← Samhan Public 발송 │  │
│  │  → Dispatch + Vehicle 생성 (status=MATCHING)              │  │
│  │  → DriverMatcher (Phase A=Mock, Phase B=InsungQuick)      │  │
│  │  → Async 회신 호출 (SlipDispatchTaskClient)                │  │
│  └─────────────────────────────────────────────────────────────┘  │
│                                                                  │
│  ┌─ 회신 (Samhan Public 으로) ──────────────────────────────┐  │
│  │  매칭 완료: POST {samhan}/internal/slip/dispatch-tasks/  │  │
│  │             {id}/confirm                                  │  │
│  │  매칭 불가: POST {samhan}/internal/slip/dispatch-tasks/  │  │
│  │             {id}/unavailable                              │  │
│  │  → slip-service: DispatchTask + Slip.dispatchStatus 갱신 │  │
│  │  → notification-service 호출 (배차담당자 알림)            │  │
│  └─────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
```

---

## 4. 데이터 모델

### 4.1 slip-service 신규 entity

**`dispatch_task`**

| 컬럼 | 타입 | 비고 |
|---|---|---|
| id | UUID PK | 비공개 |
| task_code | VARCHAR(32) | 사용자 노출 (`DT-20260514-001` daily counter) |
| dispatch_date | DATE | 배차담당자 입력 |
| status | VARCHAR(32) | `DRAFT` / `DISPATCHING` / `DISPATCHED` / `FAILED` |
| arologis_dispatch_id | UUID NULL | 회신 시 채움 |
| failure_reason | VARCHAR(500) NULL | FAILED 시 사유 |
| BaseEntity 7 + Soft Delete | | |

partial unique: `(task_code) WHERE is_deleted=false`

**`dispatch_vehicle_group`**

| 컬럼 | 타입 | 비고 |
|---|---|---|
| id | UUID PK | 비공개 |
| dispatch_task_id | UUID FK | NOT NULL |
| sequence | INT | 1, 2, 3... 그룹 추가 순서 |
| vehicle_type | VARCHAR(32) | 9 enum 값 |
| BaseEntity 7 + Soft Delete | | |

partial unique: `(dispatch_task_id, sequence) WHERE is_deleted=false`

**`dispatch_vehicle_group_slip`**

| 컬럼 | 타입 | 비고 |
|---|---|---|
| id | UUID PK | |
| vehicle_group_id | UUID FK | NOT NULL |
| slip_id | UUID FK to slip | NOT NULL |
| sequence | INT | 그룹 안 drop 순서 (정차 순서) |
| BaseEntity 7 + Soft Delete | | |

partial unique: `(vehicle_group_id, slip_id) WHERE is_deleted=false`

### 4.2 slip-service 갱신 — `slip` 테이블

```sql
ALTER TABLE slip
  ADD COLUMN dispatch_status VARCHAR(32) NOT NULL DEFAULT 'UNDISPATCHED'
    CHECK (dispatch_status IN ('UNDISPATCHED', 'DISPATCHING', 'DISPATCHED'));
CREATE INDEX idx_slip_dispatch_status_active ON slip(dispatch_status) WHERE is_deleted = FALSE;
```

상태 흐름:
- `UNDISPATCHED` (default) — 배차 메뉴 "미배차" source
- `DISPATCHING` — 배차 완료 후 매칭 대기
- `DISPATCHED` — 매칭 완료 회신 후

### 4.3 arologis `VehicleTonnage` 확장 (11 값, legacy 2 deprecated)

```java
public enum VehicleTonnage {
    MOTORCYCLE,        // 오토바이 (NEW)
    DAMAS,             // 다마스 (NEW)
    TONNAGE_1,         // 1톤
    TONNAGE_1_4,       // @Deprecated 1.4톤 — 카톡 파싱 backward compat
    TONNAGE_1_5,       // 1.5톤 (NEW)
    TONNAGE_2_5,       // 2.5톤
    TONNAGE_3,         // 3톤 (NEW)
    TONNAGE_5,         // 5톤
    TONNAGE_10,        // 10톤 (NEW)
    TONNAGE_20,        // 20톤 (NEW)
    TONNAGE_BIG;       // @Deprecated 11/25톤 — 카톡 파싱 backward compat
}
```

배차 메뉴 UI 노출 = **9 active 값** (legacy 2 제외). 카톡 파싱 `fromRaw()` 는 legacy 유지 + 신규 매핑.

### 4.4 Flyway migration

| 서비스 | 버전 | 내용 |
|---|---|---|
| slip-service | V16 | `dispatch_task` + `dispatch_vehicle_group` + `dispatch_vehicle_group_slip` 테이블 + index |
| slip-service | V17 | `slip.dispatch_status` column + index |
| arologis-service | V10 | `vehicle` 테이블의 `tonnage` CHECK constraint 갱신 (11 값) |

---

## 5. UI 흐름 + Layout

### 5.1 Desktop (`/dispatch-board`)

```
┌─ 사이드바 ────────┬─ 배차 메뉴 ──────────────────────────────────┐
│ 견적             │                                              │
│ 주문             │  ┌─ 미배차 출고전표 ────┐ ┌─ 차량 그룹 ──────┐│
│ 창고             │  │ 날짜  5/13 ~ 5/15 ▾  │ │ [+ 차량 추가]    ││
│ ▶ 배차 메뉴     │  │ 상태  미배차 ▾       │ │                  ││
│ 회계             │  │ ─────────────────── │ │ ┌─ 1톤 #1 ────┐  ││
│ 거래처           │  │ ☰ SL-001 대구공조   │ │ │ ① SL-001    │  ││
│                  │  │ ☰ SL-002 한진산업   │ │ │ ② SL-005    │  ││
│                  │  │ ☰ SL-003 영진통상   │ │ │ ③ SL-009    │  ││
│                  │  │ ☰ SL-004 마트로닉   │ │ └─────────────┘  ││
│                  │  │ ☰ ...               │ │                  ││
│                  │  │ ─────────────────── │ │ ┌─ 다마스 #2 ─┐  ││
│                  │  │ ◀ 1 / 12 ▶ (50/회) │ │ │ ① SL-007    │  ││
│                  │  └────────────────────┘ │ └─────────────┘  ││
│                  │                          │                  ││
│                  │                          │ ┌─ 5톤 #3 ────┐  ││
│                  │                          │ │ ⬇ 여기로     │  ││
│                  │                          │ │   드래그     │  ││
│                  │                          │ └─────────────┘  ││
│                  │                          │                  ││
│                  │                          │ [✓ 배차 완료]    ││
│                  │                          └──────────────────┘│
└──────────────────┴────────────────────────────────────────────────┘
```

### 5.2 Mobile-staff (`/dispatch-board`)

- 좌우 split 대신 **tab 전환** (`[미배차 전표] [차량 그룹]`)
- TouchSensor + PointerSensor 동시 활성
- 차량 그룹 안 long-press 250ms → 드래그 시작

### 5.3 상호작용 매트릭스

| 액션 | desktop | mobile |
|---|---|---|
| 차량 추가 | 상단 [+ 차량 추가] → modal carousel 9 종류 | 동일 |
| drag 미배차 → 그룹 | mouse click + drag | long-press + touch drag |
| 그룹 안 slip 순서 변경 | drag 재정렬 | 동일 (long-press) |
| slip 제거 | 그룹 안 slip [×] 버튼 | 동일 (tap) |
| 빈 그룹 삭제 | 그룹 헤더 [×] | 동일 |
| 출고전표 클릭 | side modal — slip-service `/admin/slips/{id}` 상세 | full screen dialog |
| 배차 완료 | 확인 dialog → POST → spinner → list refresh | 동일 |

### 5.4 필터 default

| 필터 | default | 변경 가능 |
|---|---|---|
| dispatch_date 범위 | Asia/Seoul today ±1일 | 예 (date picker) |
| dispatchStatus | UNDISPATCHED only | 예 (multi-select: UNDISPATCHED/DISPATCHING/DISPATCHED) |
| 페이지 | 1 (50/회) | 예 |

### 5.5 상태 배지

| status | 배지 |
|---|---|
| DRAFT | "작성 중" (회색) |
| DISPATCHING | "발송 완료, 매칭 대기" (파랑) |
| DISPATCHED | "배차 완료" (녹색) + 기사 정보 (driverCode + phoneNumber) |
| FAILED | "배차 불가" (빨강) + 사유 + [재배차] 버튼 |

### 5.6 라이브러리

- `@dnd-kit/core` (PointerSensor + TouchSensor)
- `@dnd-kit/sortable` (그룹 안 순서 변경)
- 키보드 드래그 (스페이스 grab + 화살표) — accessibility 가드

---

## 6. Service-to-service 통신

### 6.1 Samhan Public → arologis (배차 발송)

```
POST http://arologis-service:8097/internal/arologis/dispatches
Headers: X-Internal-Token: <shared>
Body:
{
  "samhanDispatchTaskId": "<UUID>",
  "taskCode": "DT-20260514-001",
  "dispatchDate": "2026-05-14",
  "vehicles": [
    {
      "sequence": 1,
      "vehicleType": "TONNAGE_1",
      "slips": [
        {
          "sequence": 1,
          "slipId": "<UUID>",
          "slipNumber": "SL-001",
          "partnerCode": "P-1234",
          "partnerName": "대구공조",
          "address": "인천 남동구 ...",
          "recipientPhoneNumber": "010-1234-5678",
          "notes": "9시까지 배송"
        }
      ]
    }
  ]
}
Response 200:
{
  "arologisDispatchId": "<UUID>",
  "samhanDispatchTaskId": "<UUID>",
  "acknowledgedAt": "...",
  "matchingStartedAt": "..."
}
```

**arologis 처리**: Dispatch + Vehicle + VehicleStop 생성 → DriverMatcher (Phase A = Mock) → 비동기 회신.

### 6.2 arologis → Samhan Public (매칭 완료)

```
POST http://slip-service:8084/internal/slip/dispatch-tasks/{samhanDispatchTaskId}/confirm
Headers: X-Internal-Token: <shared>
Body:
{
  "arologisDispatchId": "<UUID>",
  "matchedDrivers": [
    {
      "vehicleGroupSequence": 1,
      "vehicleType": "TONNAGE_1",
      "driverCode": "D-001",
      "driverName": "홍길동",
      "driverPhoneNumber": "010-1234-5678",
      "source": "EXTERNAL_INSUNG_QUICK"
    }
  ],
  "confirmedAt": "..."
}
Response 204
```

**slip-service 처리**:
1. `DispatchTask.status` = `DISPATCHED` + `arologis_dispatch_id` 저장
2. 모든 매핑된 slip 의 `Slip.dispatchStatus` = `DISPATCHED`
3. `MatchedDriver` (slip-service 안 신규 entity) 저장
4. notification-service 호출 → 배차담당자 알림

### 6.3 arologis → Samhan Public (매칭 불가)

```
POST http://slip-service:8084/internal/slip/dispatch-tasks/{samhanDispatchTaskId}/unavailable
Body:
{
  "arologisDispatchId": "<UUID>",
  "reason": "1톤 차량 가용 기사 0명 (인성데이타 응답)",
  "failedVehicleGroups": [3, 5]
}
Response 204
```

**slip-service 처리**:
1. `DispatchTask.status` = `FAILED` + `failure_reason` 저장
2. 실패한 vehicle group 의 slip → `Slip.dispatchStatus` = `UNDISPATCHED` 복귀
3. notification-service 호출 → 배차담당자 알림 ("배차 불가 — 사유: ...")

### 6.4 Client 모듈

- slip-service: `ArologisDispatchClient` (WebClient + Eureka + X-Internal-Token, timeout 5s)
- arologis-service: `SlipDispatchTaskClient` (WebClient + Eureka + X-Internal-Token, async, retry 3x backoff 1/2/4s)

### 6.5 멱등성

- `samhanDispatchTaskId` UUID = 멱등 키
- arologis 가 중복 발송 받으면 기존 Dispatch status 확인 → 중복 방지
- 회신은 매번 같은 payload (slip-service 가 중복 confirm/unavailable 받아도 일관)

---

## 7. 테스트 + 롤백

### 7.1 신규 unit (~36 case)

| 영역 | 클래스 | 케이스 |
|---|---|---|
| slip domain | `DispatchTaskTest` | create / addVehicleGroup / removeVehicleGroup / dispatch / confirm / fail (~6) |
| slip domain | `DispatchVehicleGroupTest` | addSlip / reorderSlips / removeSlip / partial unique (~4) |
| slip service | `DispatchTaskServiceTest` | DRAFT lifecycle + DISPATCHING 전이 + 멱등성 (~6) |
| slip service | `DispatchConfirmServiceTest` | confirm 흐름 + dispatchStatus 변경 + notification trigger (~5) |
| slip service | `DispatchUnavailableServiceTest` | fail 흐름 + slip UNDISPATCHED 복귀 (~4) |
| slip client | `ArologisDispatchClientTest` | WebClient mock + X-Internal-Token + timeout (~3) |
| arologis service | `DispatchReceiveServiceTest` | receive + Vehicle 생성 + Mock matcher + 회신 (~5) |
| arologis client | `SlipDispatchTaskClientTest` | confirm/unavailable WebClient mock (~3) |

### 7.2 IT (Docker 가용, ~31 case)

| Case | 검증 |
|---|---|
| `DispatchTaskRepositoryIT` | partial unique 4건 (~4) |
| `DispatchBoardAdminControllerIT` | GET 페이지네이션 + 필터 (~6) |
| `DispatchTaskAdminControllerIT` | POST 생성 / 그룹 / slip 매핑 / dispatch (~8) |
| `DispatchTaskInternalControllerIT` | POST confirm / unavailable + X-Internal-Token (~5) |
| `ArologisDispatchReceiveIT` | POST receive + Mock matcher + 회신 호출 (~5) |
| `DispatchEndToEndIT` | Mock 매칭 e2e (~3) |

### 7.3 FE 컴포넌트 (~24 case)

| 컴포넌트 | 케이스 |
|---|---|
| `DispatchBoardPage` | 페이지네이션 + 필터 + drag-source (~5) |
| `VehicleGroupCard` | 빈/추가/순서/제거/삭제 (~5) |
| `AddVehicleModal` | 9 종류 + 추가 (~3) |
| `SlipDetailModal` | 상세 + 인수자 + 정차 (~3) |
| `DispatchCompleteDialog` | 확인 + POST + spinner + refresh (~4) |
| mobile `DispatchBoardScreen` | TouchSensor + long-press + tab (~4) |

### 7.4 QA 시나리오 (TM 통합 PR 본문 인라인 캡처 6장 의무)

1. 배차담당자 로그인 → 배차 메뉴 → 미배차 50개 페이지네이션
2. [+ 차량 추가] → 1톤 → 그룹 #1 → drag SL-001/SL-002
3. mobile-staff 의 tab 전환 + 터치 long-press 드래그
4. 슬립 클릭 → 상세 modal (인수자 + 정차 순서)
5. [배차 완료] → 확인 dialog → arologis Mock matcher → DISPATCHED + 기사 정보
6. Mock matcher 불가 시뮬레이션 (`SAMHAN_AROLOGIS_MOCK_FAIL_RATE=1.0`) → FAILED + slip UNDISPATCHED 복귀

### 7.5 롤백 (5 단계 reversible, ~110분)

| Step | 절차 | 시간 |
|---|---|---|
| 1. FE 회수 | `/dispatch-board` 라우트 + 사이드바 메뉴 제거 (revert) | 30분 |
| 2. arologis 회수 | `/internal/arologis/dispatches` endpoint + `SlipDispatchTaskClient` 제거 | 30분 |
| 3. slip-service 회수 | `dispatch_task` + `dispatch_vehicle_group` + `dispatch_vehicle_group_slip` 테이블 + `ArologisDispatchClient` 제거 | 30분 |
| 4. Slip.dispatchStatus 회수 | `ALTER TABLE slip DROP COLUMN dispatch_status` | 10분 |
| 5. VehicleTonnage 회수 | CHECK constraint 11→5 legacy 복원 | 10분 |

### 7.6 CI green 의무

- BE: `:services:slip-service:test` + `:services:arologis-service:test` PASS
- FE: `clients/desktop` typecheck/build + `clients/mobile-staff` typecheck/prebuild PASS
- 회귀 0 결함

---

## 8. 5-team 디스패치 단일 통합 PR

| Team | scope |
|---|---|
| **BE** | slip-service 신규 3 entity + Slip.dispatchStatus + DispatchTask / VehicleGroup / Slip 매핑 service + `ArologisDispatchClient` + `DispatchTaskInternalController` (confirm/unavailable receive) + arologis-service 의 `ArologisInternalController` 확장 (`POST /dispatches` receive) + `DispatchReceiveService` + `SlipDispatchTaskClient` (회신) + arologis VehicleTonnage 확장 + Flyway slip V16/V17 + arologis V10 + IT 신규 ~31 case + 단위 ~36 case |
| **FE** | desktop `/dispatch-board` 페이지 (3 컴포넌트: DispatchBoardPage / VehicleGroupCard / SlipDetailModal) + `@dnd-kit/core` 통합 + sidebar 메뉴 추가 + mobile-staff `/dispatch-board` 화면 (tab 전환 + TouchSensor) + 컴포넌트 test ~24 case |
| **Designer** | desktop 배차 메뉴 mock + mobile-staff mock + 차량 추가 modal + 9 종류 carousel + 출고전표 상세 modal + DISPATCHED/FAILED 상태 배지 + 5 mock 파일 (`docs/uiux/samhan-dispatch-board/01~05.md`) |
| **QA** | 6 시나리오 절차 + 검증 SQL + 회귀 ~98 case 절차 + 롤백 dry-run runbook (`docs/qa/samhan-dispatch-board/`) + **Mock 캡처 PNG 6장 자동 생성** (PowerShell System.Drawing, [feedback_pr_qa_screenshots] 가드) |
| **DevOps** | `SAMHAN_AROLOGIS_DISPATCH_CLIENT_URL` + `SAMHAN_SLIP_DISPATCH_TASK_CLIENT_URL` 환경변수 추가 + docker-compose 양쪽 service 통신 확인 + Eureka 등록 가드 |

**TM 통합** = 5 worktree merge + 컴파일 가드 + 회귀 + 문서 동기화 (README / ROADMAP / DECISIONS D-DB-01~09 / service README / CLAUDE.md) + PR 본문 6 스크린샷 인라인 첨부.

**PM** = `gh pr checks --watch` + green 후 개발책임자 머지 요청.

---

## 9. 메모리 + DECISIONS

- DECISIONS `D-DB-00 ~ D-DB-09` (10 결정) 통합 entry
- `.claude/memory/project_samhan_dispatch_board.md` (신규) — Phase A 의 9 결정 + 도메인 영향

---

## 10. 참조

- [[project_arologis_independent]] — 아로로지스 독립 분리 (Phase 10.5)
- [[feedback_integrated_pr_pattern]] — 통합 PR 의무
- [[feedback_multi_agent_team_pattern]] — 5-team 디스패치
- [[feedback_pr_qa_screenshots]] — 모든 PR 스크린샷 1+ 인라인 의무
- [[feedback_uuid_no_user_visibility]] — UUID 비공개
- 후속 Phase B~F: Phase A 머지 후 spec/plan 별도 작성
