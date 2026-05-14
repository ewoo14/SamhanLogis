# Samhan Public 배차 수정/취소 요청 흐름 (Phase C) — QA 6 시나리오 + 검증 SQL

> **branch** — `feat/samhan-dispatch-modification-spec` 기반 QA 슬라이스
> **작성일** — 2026-05-14
> **작성** — QA Team (5-team 통합 PR 패턴)
> **목적** — Phase C (DispatchTask DISPATCHED 후 수정/취소 요청 → 아로로지스 수락/거부 → 재 dispatch 또는 취소) 의 통합 PR 본문 인라인 첨부용 6 시나리오. 각 시나리오 = 선행 조건 + step-by-step + 예상 결과 + 검증 SQL/명령.
> **연관 산출물** —
> - `docs/superpowers/specs/2026-05-14-samhan-dispatch-modification-design.md` (§ 7.4 의 6 시나리오 base)
> - `docs/superpowers/plans/2026-05-14-samhan-dispatch-modification.md` QA Task Q1~Q2
> - `docs/qa/samhan-dispatch-modification/regression.md` (회귀 ~95 case)
> - `docs/qa/samhan-dispatch-modification/rollback-dry-run.md` (4 단계 reversible 롤백 runbook)
> - `docs/qa/samhan-dispatch-modification/screenshots/01~06.png` (Mock 캡처 6장)
> - `docs/qa/samhan-dispatch-board/scenarios.md` (Phase A 기반)

---

## 0. 검증 정책

### 0.1 페르소나

| 페르소나 | ROLE | 도메인 | 본 슬라이스 검증 관점 |
|---|---|---|---|
| **배차 담당자 (Samhan Public)** | `ROLE_MANAGER` / `ROLE_MASTER` / `ROLE_DISPATCH` | desktop `/dispatch-board` | DISPATCHED 의 [수정 요청] / [취소 요청] 버튼 노출, dialog 발송, MODIFICATION_ACCEPTED 편집 모드 |
| **모바일 배차 담당자 (mobile-staff)** | `ROLE_MANAGER` | mobile-staff `/dispatch-board` | BottomSheet 의 동일 흐름 |
| **아로로지스 매칭 시스템 (Mock)** | (system) | arologis-service | Mock 자동 수락 (5초 비동기) / `SAMHAN_AROLOGIS_MOCK_AUTO_ACCEPT=false` 시 거부 시뮬레이션 |
| **DevOps** | (system) | docker-compose | service-to-service X-Internal-Token + retry (Phase A 재활용, 변경 0) |

### 0.2 측정 가능한 PASS/FAIL 기준

각 시나리오는 4 요소 명시:

1. **선행 조건** — Phase A 의 Flyway V16/V17 + Phase C 의 V23 적용 + 시드 데이터 + service up
2. **동작** — UI 클릭 / dialog 발송 / API 호출의 구체 step
3. **기대 결과** — UI assertion + DB/HTTP assertion (psql SQL / `curl`)
4. **회귀 차단 effect** — fail 시 production 어떤 증상이 재현 가능한가

### 0.3 우선순위

- 🔴 **Critical** — fail 시 슬라이스 차단 (수정/취소 요청 발송 불가, 회신 누락)
- 🟠 **Major** — 작업은 진행되나 우회/재시도 필요
- 🟡 **Minor** — UX/표기/캡처 불일치

### 0.4 UUID 비공개 (`feedback_uuid_no_user_visibility.md`)

모든 case 의 UI assertion 은 비즈니스 식별자만 사용:

- 배차 작업 코드 `DT-20260514-001` (UUID 비공개)
- 슬립번호 `SL-001`, 거래처명 `대구공조`, `partnerCode` `P-1234`
- 차량 그룹 `1톤 #1`, `다마스 #2` (sequence 번호 노출 OK)
- 기사 코드 `D-001`, 기사명 `홍길동`, phoneNumber `010-1234-5678`
- 사유 (modificationReason / rejectionReason) 는 자유 텍스트 (UUID 절대 비포함)

UUID (`dispatch_task.id`, `arologis_dispatch_id`) 가 화면/JSON response payload 표시 영역에 노출되면 즉시 FAIL.

### 0.5 한국어/외부 호칭

- 내부 (코드/메뉴/도메인/주석) — **"아로로지스"** (`feedback_arologis_name`)
- 외부 (회사명) — **"Samhan Public"** (`feedback_samhan_public_name`)
- 브랜드 색상 — arologis-teal `#2A9D8F` (수정 요청 1차 버튼) + 보라색 `#8B5CF6` (MODIFICATION_REQUESTED) + 녹색 `#22C55E` (MODIFICATION_ACCEPTED) + 빨강 `#EF4444` (REJECTED/CANCELLED)
- 시나리오 캡처 의무 6장: `docs/qa/samhan-dispatch-modification/screenshots/0{1..6}-*.png`

### 0.6 환경변수 (Phase A 의 변수 + Phase C Mock 토글)

| 변수 | 기본값 | 본 시나리오 영향 |
|---|---|---|
| `SAMHAN_AROLOGIS_DISPATCH_URL` | `http://arologis-service:8097` | 시나리오 1~5 의 modification-request / cancellation-request 발송 |
| `SAMHAN_SLIP_DISPATCH_TASK_URL` | `http://slip-service:8086` | 시나리오 2/4/5 의 회신 (accepted/rejected) |
| `SAMHAN_AROLOGIS_MOCK_AUTO_ACCEPT` | `true` (default 자동 수락) | 시나리오 4 에서 `false` 로 설정 → 거부 시뮬레이션 |
| `SAMHAN_AROLOGIS_MOCK_DELAY_MS` | `5000` (5초 비동기) | Mock 회신 지연 (Phase A 패턴 일관) |
| `X_INTERNAL_TOKEN` | (shared secret) | service-to-service 인증 (모든 시나리오) |

### 0.7 Phase C 신규 6 상태 + CANCELLED 매트릭스

```
DISPATCHED ─┬─ [수정 요청] ─→ MODIFICATION_REQUESTED ─┬─ accepted ─→ MODIFICATION_ACCEPTED ─→ (편집 → 재 [배차 완료]) ─→ DISPATCHING → DISPATCHED
            │                                          └─ rejected ─→ MODIFICATION_REJECTED  (DISPATCHED 유지 + 사유 표시)
            │
            └─ [취소 요청] ─→ CANCEL_REQUESTED ────────┬─ accepted ─→ CANCEL_ACCEPTED ─→ CANCELLED (slip UNDISPATCHED 복귀 + arologis Dispatch soft-delete)
                                                        └─ rejected ─→ CANCEL_REJECTED  (DISPATCHED 유지 + 사유 표시)
```

---

## 시나리오 1 — DispatchTask DISPATCHED → [수정 요청] dialog → 발송 (MODIFICATION_REQUESTED) 🔴 Critical

**캡처**: `docs/qa/samhan-dispatch-modification/screenshots/01-task-detail-with-actions.png` + `02-modification-request-dialog.png`

### 선행 조건

- Phase A 의 PR #188 머지 후 base 동기화 완료 (slip-service V16/V17, arologis V10 적용)
- 본 슬라이스 V23 적용: `dispatch_task.status` CHECK constraint 11 값 (DRAFT/DISPATCHING/DISPATCHED/FAILED + Phase C 의 6 + CANCELLED) + 4 column (`modification_reason`/`rejection_reason`/`modification_requested_at`/`modification_decided_at`)
- 시드 데이터: `DT-20260514-001` (status=`DISPATCHED`, `arologis_dispatch_id` NOT NULL, 기사 `D-001` 홍길동 매칭)
- 배차담당자 `manager` / `manager1234` / `ROLE_MANAGER` 로그인
- desktop dev (`npm run dev`) + slip-service:8086 + arologis-service:8097 up

### Step-by-step

1. desktop `/login` → `manager` / `manager1234` → 로그인
2. 사이드바 **▶ 배차 메뉴** 클릭 → `/dispatch-board` 진입
3. 우측 차량 그룹 패널의 `DT-20260514-001` (DISPATCHED 녹색 배지) 카드 클릭
4. `DispatchTaskDetailModal` (또는 side panel) 노출 — 상세 정보 확인:
   - 작업 코드 `DT-20260514-001`
   - 기사 `D-001 홍길동 010-1234-5678 (인성)`
   - 차량 그룹 `1톤 #1` + slip `① SL-001 대구공조 / ② SL-005 한솔 / ③ SL-009 영진`
   - **[✏ 수정 요청] [✗ 취소 요청]** 2 버튼 노출 (DISPATCHED 상태에서만 활성)
5. [✏ 수정 요청] 버튼 클릭 → `ModificationRequestDialog` 노출
6. dialog 의 사유 textarea 에 `슬립 SL-009 추가 + 정차 순서 조정 필요` 입력
7. [요청 발송] 버튼 클릭 → spinner → 1초 내 dialog 닫힘
8. 화면 새로고침 (또는 SSE) → `DT-20260514-001` 카드의 상태 배지 = `수정 요청` 보라색

### 기대 결과

| Layer | Assertion |
|---|---|
| UI | DispatchTaskDetailModal 헤더 = `DT-20260514-001 (DISPATCHED)` |
| UI | [수정 요청] / [취소 요청] 버튼 DISPATCHED 에서만 노출 (DRAFT/FAILED/CANCELLED 에서는 숨김) |
| UI | dialog 사유 textarea maxLength=500 + placeholder "사유 (선택)" |
| UI | dialog [요청 발송] 버튼 = arologis-teal `#2A9D8F` 1차 색상 + spinner |
| UI | 발송 후 카드 배지 = `수정 요청` 보라색 (`#8B5CF6` 또는 token) |
| UI | UUID (dispatch_task.id, arologis_dispatch_id) 절대 노출 X |
| HTTP | `POST /admin/dispatch-tasks/{taskCode}/modification-request` body `{"reason":"슬립 SL-009 추가 + 정차 순서 조정 필요"}` → 200 |
| HTTP | response `{"status":"MODIFICATION_REQUESTED","modificationReason":"...","modificationRequestedAt":"2026-05-14T..."}` |
| HTTP | (내부) slip-service → arologis `POST /internal/arologis/dispatches/{arologisDispatchId}/modification-request` body `{"samhanDispatchTaskId":"<UUID>","reason":"..."}` → 204 |
| HTTP | 두 internal endpoint 모두 X-Internal-Token 검증 필수 |
| DB (slip) | `dispatch_task.status` = `MODIFICATION_REQUESTED`, `modification_reason` NOT NULL, `modification_requested_at` NOT NULL |
| DB (slip) | `slip.dispatch_status` = `DISPATCHED` 유지 (수정 요청 단계는 slip 영향 X) |

### 검증 SQL

```sql
-- 1. DispatchTask MODIFICATION_REQUESTED 확인
SELECT task_code, status, modification_reason, modification_requested_at, modification_decided_at
FROM dispatch_task
WHERE task_code = 'DT-20260514-001' AND is_deleted = FALSE;
-- Expected: status='MODIFICATION_REQUESTED',
--           modification_reason LIKE '%SL-009%',
--           modification_requested_at NOT NULL,
--           modification_decided_at NULL

-- 2. status CHECK constraint 11 값 검증 (V23)
SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'dispatch_task'::regclass AND contype = 'c'
  AND conname LIKE '%status%';
-- Expected: CHECK (status IN ('DRAFT','DISPATCHING','DISPATCHED','FAILED',
--   'MODIFICATION_REQUESTED','MODIFICATION_ACCEPTED','MODIFICATION_REJECTED',
--   'CANCEL_REQUESTED','CANCEL_ACCEPTED','CANCEL_REJECTED','CANCELLED'))

-- 3. slip 영향 X 확인 (수정 요청 단계)
SELECT slip_number, dispatch_status
FROM slip
WHERE slip_number IN ('SL-001','SL-005','SL-009') AND is_deleted = FALSE;
-- Expected: 모두 dispatch_status='DISPATCHED' (수정 요청 단계는 slip 영향 X)

-- 4. arologis 측 Dispatch 상태 변경 X (요청 단계, 수락 후만 soft-delete)
SELECT id, samhan_dispatch_task_id, status, is_deleted
FROM dispatch
WHERE samhan_dispatch_task_id = (SELECT id FROM dispatch_task WHERE task_code='DT-20260514-001');
-- Expected: is_deleted=FALSE (요청 단계는 영향 X)
```

### 검증 명령 (HTTP)

```bash
# slip-service health
curl -sf http://localhost:8086/actuator/health | jq '.status'
# Expected: "UP"

# 수정 요청 endpoint 호출
curl -X POST "http://localhost:8086/admin/dispatch-tasks/<taskCode>/modification-request" \
  -H "Authorization: Bearer <manager-jwt>" \
  -H "Content-Type: application/json" \
  -d '{"reason":"슬립 SL-009 추가 + 정차 순서 조정 필요"}'
# Expected: 200 + body status=MODIFICATION_REQUESTED

# X-Internal-Token 가드 검증 (잘못된 토큰 → 401)
curl -X POST "http://localhost:8097/internal/arologis/dispatches/<arologisDispatchId>/modification-request" \
  -H "X-Internal-Token: WRONG_TOKEN" -H "Content-Type: application/json" -d '{}'
# Expected: HTTP 401 Unauthorized
```

### 회귀 차단 effect

- FAIL 시 운영 증상: 배차담당자가 배차 완료 후 수정 요청 불가능 → 잘못된 배차를 취소만 할 수 있음 (수정 우회로 = 취소 + 재 배차)
- X-Internal-Token 가드 break 시: 외부에서 임의로 modification-request 호출 가능 — **보안 critical**

---

## 시나리오 2 — arologis 자동 수락 (Mock 5초 비동기) → MODIFICATION_ACCEPTED + 편집 모드 🔴 Critical

**캡처**: `docs/qa/samhan-dispatch-modification/screenshots/03-modification-accepted-edit-mode.png`

### 선행 조건

- 시나리오 1 의 `DT-20260514-001` MODIFICATION_REQUESTED 상태
- `SAMHAN_AROLOGIS_MOCK_AUTO_ACCEPT=true` (default, 자동 수락)
- `SAMHAN_AROLOGIS_MOCK_DELAY_MS=5000` (5초 비동기)
- arologis-service 의 `ModificationRequestReceiveService` 가 `CompletableFuture.runAsync()` 으로 5초 후 회신

### Step-by-step

1. 시나리오 1 step 8 완료 시점 (status=MODIFICATION_REQUESTED) 에서 5초 대기
2. 화면 자동 새로고침 (또는 SSE) → `DT-20260514-001` 카드의 상태 배지 = `수정 가능` 녹색
3. 카드 클릭 → DispatchTaskDetailModal 노출 — 상태 = `MODIFICATION_ACCEPTED`
4. drag-and-drop 활성 확인 (편집 모드):
   - 좌측 미배차 list 에서 slip 을 우측 그룹으로 drag 가능
   - 그룹 안 slip 의 순서 변경 가능
   - 그룹 안 slip [×] 제거 가능
   - 차량 그룹 [+ 차량 추가] 버튼 재 노출
   - **[배차 완료]** 버튼 재 노출 (DISPATCHED 시점에는 숨김 → MODIFICATION_ACCEPTED 시점 재 활성)
5. 상태 배지 색상 변화 — 보라 (REQUESTED) → 녹색 (ACCEPTED)

### 기대 결과

| Layer | Assertion |
|---|---|
| UI | 5초 비동기 후 자동 갱신 (1초 주기 polling 또는 SSE) |
| UI | 상태 배지 색상 = 녹색 (`#22C55E`) + 텍스트 `수정 가능 (편집 모드)` |
| UI | drag-and-drop 활성 — 좌측 grab cursor, 우측 그룹 hover indicator |
| UI | [+ 차량 추가] 버튼 + [배차 완료] 버튼 재 노출 |
| UI | 사유 (modificationReason) 카드 하단에 표시 — `요청 사유: 슬립 SL-009 추가 + 정차 순서 조정 필요` |
| HTTP | (내부, 5초 후) arologis → slip-service `POST /internal/slip/dispatch-tasks/{taskId}/modification-accepted` body `{"arologisDispatchId":"<UUID>","decidedAt":"..."}` → 204 |
| HTTP | X-Internal-Token 검증 필수 |
| DB (slip) | `dispatch_task.status` = `MODIFICATION_ACCEPTED`, `modification_decided_at` NOT NULL |
| DB (slip) | `slip.dispatch_status` = `DISPATCHED` 유지 (편집 모드 진입만, 아직 재 배차 X) |
| DB (arologis) | `dispatch` 의 status 무영향 (수락 시점은 status 변경 X, slip-service 가 D-DC-04 의 delete-recreate 흐름 트리거 시점은 재 [배차 완료] 클릭 후) |

### 검증 SQL

```sql
-- 1. DispatchTask MODIFICATION_ACCEPTED 확인 (5초 후)
SELECT task_code, status, modification_reason, modification_requested_at, modification_decided_at,
       EXTRACT(EPOCH FROM (modification_decided_at - modification_requested_at)) AS delay_seconds
FROM dispatch_task
WHERE task_code = 'DT-20260514-001' AND is_deleted = FALSE;
-- Expected: status='MODIFICATION_ACCEPTED',
--           delay_seconds BETWEEN 4 AND 8 (Mock 5초 + jitter)

-- 2. slip 영향 X (편집 모드 진입만)
SELECT slip_number, dispatch_status FROM slip
WHERE slip_number IN ('SL-001','SL-005','SL-009') AND is_deleted = FALSE;
-- Expected: 모두 dispatch_status='DISPATCHED'

-- 3. notification 발송 기록 (notification-service Aligo, optional)
SELECT recipient_phone_number, message_type, content, created_at
FROM notification
WHERE message_type = 'DISPATCH_MODIFICATION_ACCEPTED'
  AND created_at >= NOW() - INTERVAL '1 minute';
-- Expected: 1 row, recipient = 배차담당자 phoneNumber
```

### 검증 명령 (HTTP)

```bash
# slip-service polling
for i in 1 2 3 4 5 6 7; do
  status=$(curl -sf "http://localhost:8086/admin/dispatch-tasks/DT-20260514-001" \
    -H "Authorization: Bearer <manager-jwt>" | jq -r '.status')
  echo "[t=${i}s] status=$status"
  sleep 1
done
# Expected (sequence):
# [t=1s] status=MODIFICATION_REQUESTED
# [t=2s] status=MODIFICATION_REQUESTED
# ...
# [t=5s|6s] status=MODIFICATION_ACCEPTED
```

### 회귀 차단 effect

- FAIL 시 운영 증상: 아로로지스 수락 후 5분 이상 status 가 MODIFICATION_REQUESTED 에 갇힘 → 배차담당자가 수정 작업 시작 못 함
- 편집 모드 진입 X 시: slip drag-and-drop 비활성 → 수정 의도 자체가 불가능
- delay_seconds 가 5초 미만 동기 호출이면 spec § 5.2 비동기 정책 위반 (timeout 위험)

---

## 시나리오 3 — 배차담당자 slip 추가 + 차량 종류 변경 + [배차 완료] 재 클릭 → DISPATCHING → DISPATCHED 재 🔴 Critical

**캡처**: 시나리오 5 의 캡처 + Phase A 의 `05-dispatch-completed.png` 재활용 가능 (본 슬라이스 신규 캡처는 시나리오 3 의 결과 일부 노출)

### 선행 조건

- 시나리오 2 의 `DT-20260514-001` MODIFICATION_ACCEPTED 상태
- 좌측 미배차 list 에 `SL-020` 추가됨 (가상 신규 slip)
- 가용 기사 pool: `D-002` 김기사 (TONNAGE_2_5 가용)

### Step-by-step

1. `/dispatch-board` 좌측 미배차 list 에서 `SL-020` 행 click + drag → 우측 `1톤 #1` 그룹으로 drop
2. 그룹 안 `④ SL-020 신규거래처` 노출 (sequence 갱신)
3. 그룹 안 `① SL-001` 을 `② SL-005` 와 swap → 순서 변경: `① SL-005 / ② SL-001 / ③ SL-009 / ④ SL-020`
4. 그룹 헤더의 차량 종류 dropdown 클릭 (또는 [차량 종류 변경] 버튼) → `2.5톤` 선택 → 차량 종류가 `1톤 #1` 에서 `2.5톤 #1` 으로 변경
5. **[✓ 배차 완료] 재 클릭** → 확인 dialog `2.5톤 #1 (4건) 재 배차 발송하시겠습니까?` → **확인**
6. spinner → "배차 발송 중..."
7. 1~3초 후 Mock matcher 회신 → 자동 새로고침
8. `2.5톤 #1` 그룹 헤더에 `배차 완료` 녹색 배지 + 기사 정보:
   - 기사 `D-002 김기사`
   - 폰번호 `010-2345-6789`
9. 기존 기사 `D-001 홍길동` 의 매칭 → arologis 측 soft-delete (D-DC-04 delete-recreate 정책)
10. 좌측 미배차 list 에서 `SL-020` 사라짐 (`dispatchStatus=DISPATCHED`)

### 기대 결과

| Layer | Assertion |
|---|---|
| UI | drag-and-drop 후 sequence 번호 즉시 갱신 (① → ④) |
| UI | 차량 종류 변경 시 그룹 헤더 텍스트 즉시 변경 (1톤 → 2.5톤) |
| UI | [배차 완료] 재 클릭 후 spinner → 1~3초 → 갱신 |
| UI | 새 기사 정보 표시 = `D-002 김기사 010-2345-6789` |
| UI | 기존 기사 D-001 홍길동 표시 제거 (delete-recreate) |
| HTTP | `PATCH /admin/dispatch-tasks/{taskCode}/vehicle-groups/{seq}` body `{"vehicleType":"TONNAGE_2_5"}` → 200 |
| HTTP | `POST /admin/dispatch-tasks/{taskCode}/vehicle-groups/{seq}/slips` body `{"slipNumber":"SL-020","sequence":4}` → 201 |
| HTTP | `POST /admin/dispatch-tasks/{taskCode}/dispatch` (재 발송) → 200, body `{"status":"DISPATCHING"}` |
| HTTP | (내부) slip-service → arologis 의 기존 Dispatch soft-delete (또는 새 Dispatch 생성으로 대체) → arologis 의 cascade |
| HTTP | (내부) arologis → slip-service `POST /internal/slip/dispatch-tasks/{taskCode}/confirm` body 의 `arologisDispatchId` 가 새 UUID (이전 UUID 무효) |
| DB (slip) | `dispatch_task.status` = `DISPATCHED` (재), `arologis_dispatch_id` 가 새 UUID |
| DB (slip) | `dispatch_vehicle_group.vehicle_type` = `TONNAGE_2_5` |
| DB (slip) | `slip.dispatch_status` (SL-001/005/009/020 모두) = `DISPATCHED` |
| DB (slip) | `matched_driver` 새 row (driver_code=`D-002`, source=`MOCK`) — 기존 D-001 row 는 soft-delete |
| DB (arologis) | 기존 `dispatch` row soft-delete + 새 row 생성 (D-DC-04 delete-recreate) |

### 검증 SQL

```sql
-- 1. 재 DISPATCHED 확인 + 새 arologis_dispatch_id
SELECT task_code, status, arologis_dispatch_id, modification_decided_at
FROM dispatch_task
WHERE task_code = 'DT-20260514-001' AND is_deleted = FALSE;
-- Expected: status='DISPATCHED', arologis_dispatch_id NOT NULL (새 UUID — 시나리오 1 의 UUID 와 다름)

-- 2. 차량 종류 변경 확인
SELECT g.sequence, g.vehicle_type
FROM dispatch_vehicle_group g
JOIN dispatch_task t ON t.id = g.dispatch_task_id
WHERE t.task_code = 'DT-20260514-001' AND g.is_deleted = FALSE
ORDER BY g.sequence;
-- Expected: sequence=1, vehicle_type='TONNAGE_2_5'

-- 3. 새 slip SL-020 추가 + 모든 slip DISPATCHED
SELECT s.slip_number, gs.sequence, s.dispatch_status
FROM dispatch_vehicle_group_slip gs
JOIN dispatch_vehicle_group g ON g.id = gs.vehicle_group_id
JOIN dispatch_task t ON t.id = g.dispatch_task_id
JOIN slip s ON s.id = gs.slip_id
WHERE t.task_code = 'DT-20260514-001' AND gs.is_deleted = FALSE
ORDER BY gs.sequence;
-- Expected: 4 rows (SL-005 seq=1, SL-001 seq=2, SL-009 seq=3, SL-020 seq=4),
--           모두 dispatch_status='DISPATCHED'

-- 4. MatchedDriver — 새 D-002 + 기존 D-001 soft-delete
SELECT md.driver_code, md.driver_name, md.is_deleted, md.deleted_at
FROM matched_driver md
JOIN dispatch_vehicle_group g ON g.id = md.vehicle_group_id
JOIN dispatch_task t ON t.id = g.dispatch_task_id
WHERE t.task_code = 'DT-20260514-001'
ORDER BY md.created_at DESC;
-- Expected: 2 rows — D-002 (is_deleted=FALSE 활성), D-001 (is_deleted=TRUE soft-delete)

-- 5. arologis 측 Dispatch — delete-recreate 확인
SELECT id, samhan_dispatch_task_id, status, is_deleted
FROM dispatch
WHERE samhan_dispatch_task_id = (SELECT id FROM dispatch_task WHERE task_code='DT-20260514-001')
ORDER BY created_at DESC;
-- Expected: 2 rows — 새 Dispatch (is_deleted=FALSE) + 기존 (is_deleted=TRUE)
```

### 회귀 차단 effect

- FAIL 시 운영 증상: 수정 수락 후 편집 작업이 DB 에 반영되지 않거나, 재 [배차 완료] 가 무반응 → 수정 흐름 자체가 막힘
- delete-recreate 미동작 시: 기존 D-001 매칭이 그대로 유지되어 사용자 혼란 — D-DC-04 정책 위반
- arologis 측 cascade 누락: 기존 Dispatch row 가 영구히 남아 race condition 발생 가능

---

## 시나리오 4 — arologis 거부 시뮬레이션 (`AUTO_ACCEPT=false`) → MODIFICATION_REJECTED + 사유 표시 🔴 Critical

**캡처**: `docs/qa/samhan-dispatch-modification/screenshots/04-modification-rejected.png`

### 선행 조건

- 시나리오 1~3 의 흐름 검증 후 `dispatch_task` 새 task 또는 reset
- 환경변수 `SAMHAN_AROLOGIS_MOCK_AUTO_ACCEPT=false` (거부 모드)
- arologis-service 재시작 (환경변수 reload)
- 새 task `DT-20260514-002` (status=DISPATCHED) 준비

### Step-by-step

1. arologis-service 재시작 후 `/dispatch-board` 진입
2. `DT-20260514-002` 카드 click → DispatchTaskDetailModal
3. [✏ 수정 요청] 클릭 → dialog → 사유 `정차 순서 재 조정` 입력 → [요청 발송]
4. 5초 대기 (Mock delay)
5. Mock 이 거부 회신 (`SAMHAN_AROLOGIS_MOCK_AUTO_ACCEPT=false` 시 자동 거부 + Mock 사유 `arologis 관리자 reject: 시뮬레이션 거부`)
6. 화면 자동 새로고침 → `DT-20260514-002` 카드의 상태 배지 = `수정 거부` 빨강
7. 카드 click → DispatchTaskDetailModal:
   - 상태 `MODIFICATION_REJECTED`
   - 사유 표시 `요청 사유: 정차 순서 재 조정`
   - **거부 사유** `arologis 관리자 reject: 시뮬레이션 거부` (red 배경 카드)
   - DispatchTask 는 여전히 DISPATCHED 흐름의 유효성 유지 (기사 D-001 매칭 유지)
   - [수정 요청] / [취소 요청] 버튼 다시 활성 (재 요청 가능)

### 기대 결과

| Layer | Assertion |
|---|---|
| UI | 상태 배지 색상 = 빨강 (`#EF4444`) + 텍스트 `수정 거부` |
| UI | rejectionReason 카드 = red 배경 + 사유 텍스트 |
| UI | DispatchTask 상세의 기사 정보 (D-001 홍길동) 유지 — DISPATCHED 흐름 자체는 무효화 X |
| UI | [수정 요청] / [취소 요청] 버튼 재 활성 (재시도 가능) |
| HTTP | (내부) arologis → slip-service `POST /internal/slip/dispatch-tasks/{taskId}/modification-rejected` body `{"arologisDispatchId":"<UUID>","rejectionReason":"arologis 관리자 reject: 시뮬레이션 거부"}` → 204 |
| HTTP | X-Internal-Token 검증 필수 |
| DB (slip) | `dispatch_task.status` = `MODIFICATION_REJECTED`, `rejection_reason` NOT NULL, `modification_decided_at` NOT NULL |
| DB (slip) | `slip.dispatch_status` = `DISPATCHED` 유지 (거부 시 slip 영향 X) |
| DB (slip) | `arologis_dispatch_id` 변경 X (기존 매칭 유지) |
| DB (arologis) | `dispatch.status` 변경 X (거부는 단순 회신만, cascade X) |

### 검증 SQL

```sql
-- 1. MODIFICATION_REJECTED 확인 + 사유 저장
SELECT task_code, status, modification_reason, rejection_reason, modification_decided_at
FROM dispatch_task
WHERE task_code = 'DT-20260514-002' AND is_deleted = FALSE;
-- Expected: status='MODIFICATION_REJECTED',
--           modification_reason='정차 순서 재 조정',
--           rejection_reason LIKE '%시뮬레이션 거부%',
--           modification_decided_at NOT NULL

-- 2. slip + arologis 영향 X 확인
SELECT slip_number, dispatch_status FROM slip
WHERE slip_number IN ('SL-002') AND is_deleted = FALSE;
-- Expected: dispatch_status='DISPATCHED' (거부 시 slip 영향 X)

-- 3. arologis Dispatch 변경 X
SELECT id, samhan_dispatch_task_id, status, is_deleted
FROM dispatch
WHERE samhan_dispatch_task_id = (SELECT id FROM dispatch_task WHERE task_code='DT-20260514-002');
-- Expected: 1 row, is_deleted=FALSE, status 변경 X

-- 4. 재 [수정 요청] 가능 검증 — status MODIFICATION_REJECTED 에서 다시 요청 발송 시
--    spec § 6 의 D-DC-02 lock policy 와 일관 — REJECTED 도 DISPATCHED 와 동일하게 재 요청 허용
-- 단위 테스트로 보강: DispatchTask.markModificationRequested() 가 REJECTED 에서도 가능
```

### 검증 명령 (HTTP)

```bash
# 거부 시뮬레이션 환경변수 재설정
docker-compose -f infrastructure/docker/docker-compose.yml exec arologis-service \
  /bin/sh -c "export SAMHAN_AROLOGIS_MOCK_AUTO_ACCEPT=false"
docker-compose restart arologis-service

# 거부 회신 확인 (slip-service polling)
for i in 1 2 3 4 5 6 7; do
  status=$(curl -sf "http://localhost:8086/admin/dispatch-tasks/DT-20260514-002" \
    -H "Authorization: Bearer <manager-jwt>" | jq -r '.status')
  echo "[t=${i}s] status=$status"
  sleep 1
done
# Expected sequence:
# [t=1~5s] MODIFICATION_REQUESTED → [t=5s|6s] MODIFICATION_REJECTED
```

### 회귀 차단 effect

- FAIL 시 운영 증상: 거부 회신 누락 시 status 가 MODIFICATION_REQUESTED 에 갇힘 → 배차담당자가 거부 사실을 모르고 무한 대기
- 사유 (rejectionReason) 미저장 시: 사용자가 거부 원인을 알 수 없음 → UX 결함
- DISPATCHED 흐름 무효화 (기사 매칭 cancel) 발생 시: 거부의 의미 위반 — D-DC-06 정책 위반

---

## 시나리오 5 — [취소 요청] → arologis 자동 수락 → CANCELLED + slip UNDISPATCHED 복귀 🔴 Critical

**캡처**: `docs/qa/samhan-dispatch-modification/screenshots/05-cancellation-accepted.png`

### 선행 조건

- 환경변수 `SAMHAN_AROLOGIS_MOCK_AUTO_ACCEPT=true` (default 복귀)
- arologis-service 재시작
- 새 task `DT-20260514-003` (status=DISPATCHED, slip `SL-030` / `SL-031` 매핑, 기사 `D-003` 박기사 매칭)

### Step-by-step

1. `/dispatch-board` 진입
2. `DT-20260514-003` 카드 click → DispatchTaskDetailModal
3. [✗ 취소 요청] 클릭 → `CancellationRequestDialog` 노출
4. 사유 textarea 에 `거래처 출고 일정 변경 요청` 입력
5. [요청 발송] 클릭 → spinner → dialog 닫힘
6. 화면 갱신 → 상태 배지 `취소 요청` 보라색
7. 5초 대기 (Mock auto-accept)
8. 자동 새로고침 → 상태 배지 `취소됨` 회색 (또는 darkred) + 카드 dimming
9. DispatchTaskDetailModal 의 [수정 요청] / [취소 요청] 버튼 비활성 (CANCELLED 최종 상태)
10. **사이드바 → 배차 메뉴** → 좌측 "미배차 출고전표" 패널 확인 → `SL-030` / `SL-031` 행 재 노출 (UNDISPATCHED 복귀)
11. 기존 `1톤 #3` 차량 그룹 카드 사라짐 (또는 CANCELLED dimmed)

### 기대 결과

| Layer | Assertion |
|---|---|
| UI | 5초 비동기 후 자동 갱신 (CANCEL_REQUESTED → CANCEL_ACCEPTED → CANCELLED) |
| UI | 최종 상태 배지 색상 = 회색 또는 darkred + 텍스트 `취소됨` |
| UI | DispatchTask 카드 dimmed (opacity 0.5) — 더 이상 수정/취소 가능 X |
| UI | 좌측 미배차 list 에 SL-030/031 다시 노출 (기본 필터 UNDISPATCHED) |
| UI | 1톤 #3 그룹 카드 사라짐 (또는 history 영역으로 이동) |
| HTTP | `POST /admin/dispatch-tasks/{taskCode}/cancellation-request` body `{"reason":"거래처 출고 일정 변경 요청"}` → 200, body status=`CANCEL_REQUESTED` |
| HTTP | (내부) slip-service → arologis `POST /internal/arologis/dispatches/{arologisDispatchId}/cancellation-request` → 204 |
| HTTP | (내부, 5초 후) arologis → slip-service `POST /internal/slip/dispatch-tasks/{taskId}/cancellation-accepted` → 204 |
| DB (slip) | `dispatch_task.status` = `CANCELLED` (CANCEL_ACCEPTED 직후 service 에서 markCancelled() 호출, plan B5.2) |
| DB (slip) | `slip.dispatch_status` = `UNDISPATCHED` (SL-030, SL-031 모두 복귀) |
| DB (slip) | `dispatch_vehicle_group_slip` rows soft-delete (또는 dispatch_task soft-delete cascade) |
| DB (arologis) | `dispatch.is_deleted` = TRUE (D-DC-05 의 arologis Dispatch soft-delete) |

### 검증 SQL

```sql
-- 1. DispatchTask CANCELLED 확인 (CANCEL_ACCEPTED → CANCELLED 정정)
SELECT task_code, status, modification_reason AS cancel_reason, modification_decided_at
FROM dispatch_task
WHERE task_code = 'DT-20260514-003' AND is_deleted = FALSE;
-- Expected: status='CANCELLED',
--           cancel_reason='거래처 출고 일정 변경 요청',
--           modification_decided_at NOT NULL

-- 2. slip UNDISPATCHED 복귀 확인 (D-DC-05)
SELECT slip_number, dispatch_status
FROM slip
WHERE slip_number IN ('SL-030','SL-031') AND is_deleted = FALSE;
-- Expected: 2 rows, 모두 dispatch_status='UNDISPATCHED'

-- 3. dispatch_vehicle_group_slip soft-delete 확인
SELECT s.slip_number, gs.is_deleted, gs.deleted_at
FROM dispatch_vehicle_group_slip gs
JOIN dispatch_vehicle_group g ON g.id = gs.vehicle_group_id
JOIN dispatch_task t ON t.id = g.dispatch_task_id
JOIN slip s ON s.id = gs.slip_id
WHERE t.task_code = 'DT-20260514-003'
ORDER BY gs.created_at;
-- Expected: 2 rows, 모두 is_deleted=TRUE

-- 4. arologis Dispatch soft-delete 확인
SELECT id, samhan_dispatch_task_id, status, is_deleted, deleted_at
FROM dispatch
WHERE samhan_dispatch_task_id = (SELECT id FROM dispatch_task WHERE task_code='DT-20260514-003');
-- Expected: 1 row, is_deleted=TRUE, deleted_at NOT NULL

-- 5. MatchedDriver soft-delete 확인
SELECT md.driver_code, md.is_deleted
FROM matched_driver md
JOIN dispatch_vehicle_group g ON g.id = md.vehicle_group_id
JOIN dispatch_task t ON t.id = g.dispatch_task_id
WHERE t.task_code = 'DT-20260514-003';
-- Expected: 1 row, driver_code='D-003', is_deleted=TRUE
```

### 검증 명령 (HTTP)

```bash
# 취소 요청 → 5초 후 CANCELLED 확인
curl -X POST "http://localhost:8086/admin/dispatch-tasks/<DT-003-taskCode>/cancellation-request" \
  -H "Authorization: Bearer <manager-jwt>" -H "Content-Type: application/json" \
  -d '{"reason":"거래처 출고 일정 변경 요청"}'
# Expected: 200 + status=CANCEL_REQUESTED

for i in 1 2 3 4 5 6 7; do
  status=$(curl -sf "http://localhost:8086/admin/dispatch-tasks/DT-20260514-003" \
    -H "Authorization: Bearer <manager-jwt>" | jq -r '.status')
  echo "[t=${i}s] status=$status"
  sleep 1
done
# Expected:
# [t=1~5s] CANCEL_REQUESTED → [t=5s|6s] CANCELLED

# 미배차 list 에 SL-030 복귀 확인
curl -sf "http://localhost:8086/admin/slips?dispatchStatus=UNDISPATCHED&slipNumber=SL-030" \
  -H "Authorization: Bearer <manager-jwt>" | jq '.content | length'
# Expected: 1
```

### 회귀 차단 effect

- FAIL 시 운영 증상: 취소 수락 후 slip 이 영원히 DISPATCHED 에 갇힘 → 재 배차 불가능 (다른 그룹/일자에 재 배치 불가)
- arologis Dispatch soft-delete 누락 시: arologis 측 데이터 leak — D-DC-05 정책 위반
- D-DC-04 의 delete-recreate 와 일관 — 취소도 동일하게 cascade

---

## 시나리오 6 — mobile-staff 의 동일 흐름 (BottomSheet 수정 요청) 🟠 Major

**캡처**: `docs/qa/samhan-dispatch-modification/screenshots/06-mobile-modification-flow.png`

### 선행 조건

- mobile-staff Expo dev (`npm run start` + Android 에뮬레이터 / 실 device)
- 배차담당자 phoneNumber 시드 `010-1234-5678` 로 로그인 (passwordless)
- `DT-20260514-004` (status=DISPATCHED, slip SL-040/041 매핑, 기사 D-004) 준비
- `SAMHAN_AROLOGIS_MOCK_AUTO_ACCEPT=true`

### Step-by-step

1. mobile-staff `/dispatch-board` 진입 → tab `[차량 그룹]` 활성
2. `DT-20260514-004` 카드 tap → BottomSheet (full screen) 노출 → DispatchTask 상세
3. BottomSheet 하단의 [✏ 수정 요청] (1차 색상 arologis-teal) + [✗ 취소 요청] (2차 색상 빨강) 버튼 노출
4. [✏ 수정 요청] tap → sub-BottomSheet (modal stack) 노출
5. 사유 textarea 의 placeholder = `사유 (선택)`, autoFocus 활성
6. `슬립 SL-041 정차 위치 변경` 입력 → 키보드 dismiss
7. [요청 발송] 버튼 (full-width) tap → spinner → 1초 내 sub-BottomSheet 닫힘
8. parent BottomSheet 의 상태 배지 갱신 → `수정 요청` 보라색
9. 5초 후 자동 갱신 → 배지 `수정 가능 (편집 모드)` 녹색 + slip drag-and-drop 활성 (TouchSensor + long-press 250ms)
10. tab `[미배차 전표]` 전환 → 미배차 list 에서 slip drag → 우측 `1톤 #1` 그룹으로 drop 가능

### 기대 결과

| Layer | Assertion |
|---|---|
| UI | BottomSheet handle bar 노출 (drag to dismiss) |
| UI | [수정 요청] 버튼 색상 = arologis-teal `#2A9D8F` (Phase A 일관) |
| UI | [취소 요청] 버튼 색상 = 빨강 `#EF4444` (secondary destructive) |
| UI | sub-BottomSheet 의 textarea autoFocus + 키보드 자동 노출 |
| UI | TouchSensor long-press 250ms (PointerSensor 와 동시 활성) — 편집 모드에서만 활성 |
| UI | tab 전환 fade animation + activeTab color = arologis-teal `#2A9D8F` |
| HTTP | `POST /admin/dispatch-tasks/{taskCode}/modification-request` body `{"reason":"슬립 SL-041 정차 위치 변경"}` → 200 |
| HTTP | 동일 endpoint (mobile/desktop 공통) — endpoint 분기 X |
| DB | 시나리오 1~2 와 동일 |

### 검증 SQL

```sql
-- 시나리오 1~2 의 검증 SQL 과 동일 (task_code='DT-20260514-004')
SELECT task_code, status, modification_reason, modification_decided_at
FROM dispatch_task
WHERE task_code = 'DT-20260514-004' AND is_deleted = FALSE;
-- Expected (5초 후): status='MODIFICATION_ACCEPTED'
```

### 회귀 차단 effect

- FAIL 시 운영 증상: mobile-staff 의 배차담당자가 출장 중 수정/취소 불가 → desktop 까지 복귀 필요
- BottomSheet handle bar 미작동: 사용자가 dialog 닫기 어려움 → UX 결함 (RN Expo 패턴 위반)
- TouchSensor 미작동: drag-and-drop 자체 불가능 → 편집 모드 활성 의미 X

---

## 부록 A — 6 시나리오 매트릭스 요약

| # | 시나리오 | 우선순위 | 캡처 파일 | 핵심 검증 |
|---|---|---|---|---|
| 1 | DISPATCHED → [수정 요청] dialog → MODIFICATION_REQUESTED | 🔴 Critical | 01-task-detail-with-actions.png + 02-modification-request-dialog.png | `POST /modification-request` + Flyway V23 + status 11 값 |
| 2 | arologis 자동 수락 (5초 비동기) → MODIFICATION_ACCEPTED + 편집 모드 | 🔴 Critical | 03-modification-accepted-edit-mode.png | service-to-service 양방향 + 비동기 회신 |
| 3 | slip 추가 + 차량 변경 + 재 [배차 완료] → 재 DISPATCHED | 🔴 Critical | (Phase A 05 재활용 + 시나리오 3 결과 부분) | D-DC-04 delete-recreate cascade |
| 4 | `AUTO_ACCEPT=false` → MODIFICATION_REJECTED + 사유 | 🔴 Critical | 04-modification-rejected.png | 거부 회신 + rejectionReason 저장 |
| 5 | [취소 요청] → CANCELLED + slip UNDISPATCHED 복귀 | 🔴 Critical | 05-cancellation-accepted.png | D-DC-05 cascade undispatch + arologis soft-delete |
| 6 | mobile-staff 의 BottomSheet 동일 흐름 | 🟠 Major | 06-mobile-modification-flow.png | endpoint 공통 + TouchSensor + BottomSheet handle |

## 부록 B — 검증 SQL 일괄 실행 script

```bash
# scripts/verify-dispatch-modification.sh (선택)
PGPASSWORD=devpass psql -h localhost -U devuser -d slip_service <<'SQL'
\echo '=== DispatchTask 11 상태 분포 ==='
SELECT status, COUNT(*) FROM dispatch_task WHERE is_deleted=FALSE GROUP BY status ORDER BY status;

\echo '=== Phase C 신규 column 존재 확인 ==='
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'dispatch_task'
  AND column_name IN ('modification_reason','rejection_reason','modification_requested_at','modification_decided_at');

\echo '=== status CHECK constraint 11 값 ==='
SELECT pg_get_constraintdef(oid) FROM pg_constraint
WHERE conrelid='dispatch_task'::regclass AND contype='c' AND conname LIKE '%status%';

\echo '=== Flyway V23 적용 ==='
SELECT version, description, success FROM flyway_schema_history WHERE version IN ('23');
SQL
```

## 부록 C — UI 캡처 의무 (`feedback_pr_qa_screenshots`)

본 6 시나리오는 통합 PR 본문에 **인라인 6장 모두 첨부** 의무. mock PNG 6장은 QA Task Q2 의 `scripts/generate-samhan-dispatch-modification-screenshots.ps1` 로 자동 생성. 실제 운영 캡처는 통합 PR 머지 직전 desktop / mobile-staff 환경에서 사용자가 별도 첨부 가능 (선택).

각 PNG 의 인라인 첨부 markdown:

```markdown
![01 DispatchTask 상세 + [수정 요청] / [취소 요청] 버튼](docs/qa/samhan-dispatch-modification/screenshots/01-task-detail-with-actions.png)
![02 수정 요청 dialog](docs/qa/samhan-dispatch-modification/screenshots/02-modification-request-dialog.png)
![03 MODIFICATION_ACCEPTED 편집 모드](docs/qa/samhan-dispatch-modification/screenshots/03-modification-accepted-edit-mode.png)
![04 MODIFICATION_REJECTED 사유 표시](docs/qa/samhan-dispatch-modification/screenshots/04-modification-rejected.png)
![05 CANCELLED + slip UNDISPATCHED 복귀](docs/qa/samhan-dispatch-modification/screenshots/05-cancellation-accepted.png)
![06 mobile-staff 수정 요청 sheet](docs/qa/samhan-dispatch-modification/screenshots/06-mobile-modification-flow.png)
```

---

## 부록 D — Phase C 신규 6 상태 + CANCELLED 한국어 표기

| status | 한국어 (UI) | 색상 | 비고 |
|---|---|---|---|
| MODIFICATION_REQUESTED | 수정 요청 | 보라 `#8B5CF6` | 배차담당자 요청 발송 후 |
| MODIFICATION_ACCEPTED | 수정 가능 (편집 모드) | 녹색 `#22C55E` | 편집 진입 가능 |
| MODIFICATION_REJECTED | 수정 거부 | 빨강 `#EF4444` | 사유 표시 |
| CANCEL_REQUESTED | 취소 요청 | 보라 `#8B5CF6` | (수정 요청과 동일 톤, 텍스트만 차이) |
| CANCEL_ACCEPTED | 취소 수락 | 회색 `#6B7280` | 즉시 CANCELLED 로 전이 (transient) |
| CANCEL_REJECTED | 취소 거부 | 빨강 `#EF4444` | 사유 표시 |
| CANCELLED | 취소됨 | 회색 dimmed | 최종 상태 |

UI 의 dialog/배지/메뉴 텍스트는 모두 위 한국어 표기 사용 의무 (`feedback_korean_commits` 연장).
