# Samhan Public 배차 메뉴 (Phase A) — QA 6 시나리오 + 검증 SQL

> **branch** — `feat/samhan-dispatch-board-spec` 기반 QA 슬라이스
> **작성일** — 2026-05-14
> **작성** — QA Team (5-team 통합 PR 패턴)
> **목적** — Phase A (배차 메뉴 + 아로로지스 발송 흐름) 의 통합 PR 본문 인라인 첨부용 6 시나리오. 각 시나리오 = 선행 조건 + step-by-step + 예상 결과 + 검증 SQL/명령.
> **연관 산출물** —
> - `docs/superpowers/specs/2026-05-14-samhan-dispatch-board-design.md` (§ 7.4 의 6 시나리오 base)
> - `docs/superpowers/plans/2026-05-14-samhan-dispatch-board.md` QA Task Q1~Q2
> - `docs/qa/samhan-dispatch-board/regression.md` (회귀 ~98 case)
> - `docs/qa/samhan-dispatch-board/rollback-dry-run.md` (5 단계 reversible 롤백 runbook)
> - `docs/qa/samhan-dispatch-board/screenshots/01~06.png` (Mock 캡처 6장)

---

## 0. 검증 정책

### 0.1 페르소나

| 페르소나 | ROLE | 도메인 | 본 슬라이스 검증 관점 |
|---|---|---|---|
| **배차 담당자 (Samhan Public)** | `ROLE_MANAGER` | desktop `/dispatch-board` | 미배차 출고전표 페이지네이션, 차량 그룹 drag-drop, 배차 완료 발송 |
| **창고 인수자/검수자 (Samhan Public)** | `ROLE_PICKER` / `ROLE_INSPECTOR` | slip lifecycle | PICKED → INSPECTED 의 dispatchStatus 가 `UNDISPATCHED` 인지 |
| **모바일 배차 담당자 (mobile-staff)** | `ROLE_MANAGER` | mobile-staff `/dispatch-board` | tab 전환, TouchSensor + long-press 드래그 |
| **아로로지스 매칭 시스템 (Mock)** | (system) | arologis-service | Mock matcher 의 확률 매칭 / `SAMHAN_AROLOGIS_MOCK_FAIL_RATE` 시뮬레이션 |
| **DevOps** | (system) | docker-compose / Eureka | service-to-service X-Internal-Token + retry/timeout |

### 0.2 측정 가능한 PASS/FAIL 기준

각 시나리오는 4 요소 명시:

1. **선행 조건** — Flyway slip V16/V17, arologis V10 적용 + 시드 데이터 + service up
2. **동작** — UI 클릭 / drag / API 호출의 구체 step
3. **기대 결과** — UI assertion + DB/HTTP assertion (psql SQL / `curl`)
4. **회귀 차단 effect** — fail 시 production 어떤 증상이 재현 가능한가

### 0.3 우선순위

- 🔴 **Critical** — fail 시 슬라이스 차단 (배차 발송/회신/회귀 불가)
- 🟠 **Major** — 작업은 진행되나 우회/재시도 필요
- 🟡 **Minor** — UX/표기/캡처 불일치

### 0.4 UUID 비공개 (`feedback_uuid_no_user_visibility.md`)

모든 case 의 UI assertion 은 비즈니스 식별자만 사용:

- 배차 작업 코드 `DT-20260514-001` (UUID 비공개)
- 슬립번호 `SL-001`, 거래처명 `대구공조`, `partnerCode` `P-1234`
- 차량 그룹 `1톤 #1`, `다마스 #2` (sequence 번호 노출 OK)
- 기사 코드 `D-001`, 기사명 `홍길동`, phoneNumber `010-1234-5678`

UUID (`dispatch_task.id`, `dispatch_vehicle_group.id`, `slip.id`, `arologis_dispatch_id`) 가 화면/JSON response payload 표시 영역에 노출되면 즉시 FAIL.

### 0.5 한국어/외부 호칭

- 내부 (코드/메뉴/도메인/주석) — **"아로로지스"** (`feedback_arologis_name`)
- 외부 (회사명) — **"Samhan Public"** (`feedback_samhan_public_name`)
- 브랜드 색상 — arologis-teal `#2A9D8F` (배차 상태 배지 + 1-tap 버튼)
- 시나리오 캡처 의무 6장: `docs/qa/samhan-dispatch-board/screenshots/0{1..6}-*.png`

### 0.6 환경변수 (DevOps DO1 산출)

| 변수 | 기본값 | 본 시나리오 영향 |
|---|---|---|
| `SAMHAN_AROLOGIS_DISPATCH_URL` | `http://arologis-service:8097` | 시나리오 5 (정상 매칭) / 6 (Mock 시뮬레이션) 모두 |
| `SAMHAN_SLIP_DISPATCH_TASK_URL` | `http://slip-service:8084` | 시나리오 5/6 회신 |
| `SAMHAN_AROLOGIS_MOCK_FAIL_RATE` | `0.0` (default 정상 매칭) | 시나리오 6 에서 `1.0` 로 설정 → 100% FAILED |
| `X_INTERNAL_TOKEN` | (shared secret) | service-to-service 인증 (모든 시나리오) |

---

## 시나리오 1 — 배차담당자 로그인 + 미배차 50개 페이지네이션 🔴 Critical

**캡처**: `docs/qa/samhan-dispatch-board/screenshots/01-desktop-board.png`

### 선행 조건

- `services:slip-service` 가 포트 8084 에서 동작 (`docker-compose up -d slip-service`)
- Flyway V16 (`dispatch_task`/`dispatch_vehicle_group`/`dispatch_vehicle_group_slip`) + V17 (`slip.dispatch_status`) 적용 완료
- `clients/desktop` Electron dev 모드 (`npm run dev`) 가동
- shared:fixture seed:
  - 배차담당자 `manager` / `manager1234` / `ROLE_MANAGER`
  - 미배차 출고전표 `SL-001 ~ SL-150` (150건), 모두 `dispatch_status='UNDISPATCHED'` + `inspection_state='INSPECTED'`
  - 거래처 `P-1234` (대구공조), `P-2345` (한진산업) ... 등

### Step-by-step

1. desktop `/login` 화면 진입 → `loginId=manager`, `password=manager1234` 입력 → **로그인** 클릭
2. 사이드바에서 **▶ 배차 메뉴** 클릭 → URL `/dispatch-board` 진입
3. 좌측 "미배차 출고전표" 패널 확인 — 50건 (페이지 1) 노출
4. 페이지네이션 `◀ 1 / 3 ▶ (50/회)` 노출 확인
5. ▶ 클릭 → 페이지 2 → 51 ~ 100 건 노출
6. 날짜 필터 `5/13 ~ 5/15` (today ±1일) default 확인
7. 상태 필터 `미배차` default 확인 — multi-select 으로 `DISPATCHING` 추가 후 0건 (정상)

### 기대 결과

| Layer | Assertion |
|---|---|
| UI | URL `/dispatch-board` 진입, 좌 미배차 / 우 차량 그룹 split layout |
| UI | 좌측 50건 slip 노출, 각 행 `☰ {slipNumber} {partnerName}` 표기 (UUID 비노출) |
| UI | 페이지네이션 `◀ 1 / 3 ▶ (50/회)` (총 150 / 50/page = 3 page) |
| UI | 날짜/상태 필터 default 가 today ±1일 + `UNDISPATCHED` |
| HTTP | `GET /admin/slips?dispatchStatus=UNDISPATCHED&from=2026-05-13&to=2026-05-15&page=1&size=50` → 200, content[0~49] |
| HTTP | response `totalElements: 150`, `totalPages: 3` |
| DB | `slip` 테이블의 `dispatch_status` 분포 — 150건 UNDISPATCHED |

### 검증 SQL

```sql
-- 1. 미배차 출고전표 수 (today ±1일)
SELECT COUNT(*) AS undispatched_count
FROM slip
WHERE dispatch_status = 'UNDISPATCHED'
  AND is_deleted = FALSE
  AND created_at::date BETWEEN '2026-05-13' AND '2026-05-15';
-- Expected: 150

-- 2. 페이지네이션 일관 — page 1 (size 50)
SELECT slip_number, partner_code
FROM slip
WHERE dispatch_status = 'UNDISPATCHED' AND is_deleted = FALSE
ORDER BY created_at DESC, slip_number
LIMIT 50 OFFSET 0;
-- Expected: 50 rows, SL-150 ~ SL-101 (최신순) — 실제 fixture 정렬 정책 확인

-- 3. dispatch_status check constraint 검증 (V17)
SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'slip'::regclass AND contype = 'c'
  AND conname LIKE '%dispatch_status%';
-- Expected: CHECK (dispatch_status IN ('UNDISPATCHED', 'DISPATCHING', 'DISPATCHED'))

-- 4. partial index 존재 확인
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'slip' AND indexname = 'idx_slip_dispatch_status_active';
-- Expected: 1 row, WHERE is_deleted = FALSE
```

### 회귀 차단 effect

- FAIL 시 운영 증상: 배차담당자가 미배차 출고전표 목록을 볼 수 없음 → 배차 작업 자체 차단
- 페이지네이션 break 시: 50건 초과의 배차 누락 → 출고 지연

---

## 시나리오 2 — [+ 차량 추가] → 1톤 그룹 #1 → drag SL-001 / SL-002 🔴 Critical

**캡처**: `docs/qa/samhan-dispatch-board/screenshots/03-add-vehicle-modal.png`

### 선행 조건

- 시나리오 1 의 미배차 50건 상태에서 진행
- `dispatch_task` 신규 row 자동 생성 (`DT-20260514-001`, status=`DRAFT`)
- 차량 그룹 추가 modal 의 9 종류 carousel 노출 (`MOTORCYCLE / DAMAS / TONNAGE_1 / 1_5 / 2_5 / 3 / 5 / 10 / 20`)

### Step-by-step

1. `/dispatch-board` 우측 패널 [+ 차량 추가] 버튼 클릭
2. 차량 추가 modal 의 9 종류 3×3 carousel 노출 — `1톤` 선택
3. **추가** 버튼 클릭 → modal 닫힘 → 우측에 `1톤 #1` 빈 그룹 카드 노출
4. 좌측 미배차에서 `SL-001` 행 마우스 클릭 + drag → `1톤 #1` 그룹 위로 drop
5. 그룹 안에 `① SL-001` 노출 확인
6. `SL-002` 도 동일 drag-drop → `② SL-002` 노출
7. 그룹 안 `① SL-001` 을 `② SL-002` 아래로 drag → 순서 swap → `① SL-002, ② SL-001`
8. `① SL-002` 행의 [×] 버튼 클릭 → 그룹에서 제거 → 좌측 미배차 list 복귀

### 기대 결과

| Layer | Assertion |
|---|---|
| UI | 차량 추가 modal 9 종류 carousel 3×3 grid 노출 (legacy 2 종류 제외) |
| UI | `1톤 #1` 그룹 카드 우측 노출 (arologis-teal `#2A9D8F` 헤더) |
| UI | drag 중 좌측 slip 행에 grab cursor + 그룹 카드 위 hover indicator |
| UI | 순서 변경 후 sequence 번호 (①/②) 갱신 |
| UI | [×] 제거 시 그룹에서 사라지고 좌측 list 에 즉시 노출 |
| HTTP | `POST /admin/dispatch-tasks/{taskCode}/vehicle-groups` body `{vehicleType:"TONNAGE_1"}` → 201 |
| HTTP | `POST /admin/dispatch-tasks/{taskCode}/vehicle-groups/{seq}/slips` body `{slipNumber:"SL-001", sequence:1}` → 201 |
| HTTP | drag 순서 변경 → `PATCH /admin/dispatch-tasks/{taskCode}/vehicle-groups/{seq}/slips/reorder` body `{slipNumbers:["SL-002","SL-001"]}` → 200 |
| HTTP | 제거 → `DELETE /admin/dispatch-tasks/{taskCode}/vehicle-groups/{seq}/slips/{slipNumber}` → 204 |
| DB | `dispatch_vehicle_group` 1행 (seq=1, vehicle_type='TONNAGE_1') |
| DB | `dispatch_vehicle_group_slip` 1행 (시나리오 8 step 후 SL-001 만 남음) |

### 검증 SQL

```sql
-- 1. DispatchTask DRAFT 생성 확인
SELECT task_code, status, dispatch_date
FROM dispatch_task
WHERE task_code = 'DT-20260514-001' AND is_deleted = FALSE;
-- Expected: 1 row, status='DRAFT', dispatch_date=2026-05-14

-- 2. vehicle_group 1행 (sequence=1, TONNAGE_1)
SELECT g.sequence, g.vehicle_type
FROM dispatch_vehicle_group g
JOIN dispatch_task t ON t.id = g.dispatch_task_id
WHERE t.task_code = 'DT-20260514-001'
  AND g.is_deleted = FALSE
ORDER BY g.sequence;
-- Expected: sequence=1, vehicle_type='TONNAGE_1'

-- 3. SL-001 만 그룹 안 남음 (SL-002 제거 후)
SELECT s.slip_number, gs.sequence
FROM dispatch_vehicle_group_slip gs
JOIN dispatch_vehicle_group g ON g.id = gs.vehicle_group_id
JOIN dispatch_task t ON t.id = g.dispatch_task_id
JOIN slip s ON s.id = gs.slip_id
WHERE t.task_code = 'DT-20260514-001'
  AND gs.is_deleted = FALSE
ORDER BY gs.sequence;
-- Expected: 1 row, slip_number='SL-001', sequence=1

-- 4. partial unique 가드 (slip 1건은 한 그룹에 1번만)
EXPLAIN SELECT * FROM dispatch_vehicle_group_slip
WHERE vehicle_group_id = (
  SELECT g.id FROM dispatch_vehicle_group g
  JOIN dispatch_task t ON t.id = g.dispatch_task_id
  WHERE t.task_code = 'DT-20260514-001' LIMIT 1
)
  AND is_deleted = FALSE;
-- Expected: Index Scan using uq_dispatch_vehicle_group_slip_active
```

### 회귀 차단 effect

- FAIL 시 운영 증상: 차량 그룹 추가/drag-drop 동작 안 함 → 배차 작업 불가능
- 순서 변경 실패: 정차 순서 (사용자 의도) 깨짐 → 기사 navigation 오류

---

## 시나리오 3 — mobile-staff tab 전환 + TouchSensor + long-press 드래그 🟠 Major

**캡처**: `docs/qa/samhan-dispatch-board/screenshots/02-mobile-board-tab.png`

### 선행 조건

- mobile-staff Expo dev (`npm run start` + Android 에뮬레이터 / 실 device)
- 배차담당자 phoneNumber 시드 `010-1234-5678` 로 로그인 (passwordless)
- 시나리오 1 의 미배차 50건 + 시나리오 2 의 `1톤 #1` 그룹 준비

### Step-by-step

1. mobile-staff `/dispatch-board` 진입
2. 상단 tab `[미배차 전표] [차량 그룹]` 노출 확인 — `미배차 전표` tab 활성 (default)
3. 미배차 list 노출, 스크롤 50건
4. `[차량 그룹]` tab 탭 → 차량 그룹 패널로 전환 — `1톤 #1` 그룹 노출
5. `[미배차 전표]` tab 으로 다시 전환 → `SL-003` 행 long-press 250ms → drag indicator 노출
6. tab 자동 전환 (or split view) → `1톤 #1` 그룹 위로 drag → drop
7. `1톤 #1` 그룹 안에 `③ SL-003` 노출 확인 (순서: ① SL-001, ② SL-002, ③ SL-003 — 시나리오 2 step 8 까지 진행 후 SL-001 만 남았다면 ② SL-003)

### 기대 결과

| Layer | Assertion |
|---|---|
| UI | tab 전환 시 좌우 swipe 또는 즉시 fade animation |
| UI | TouchSensor 의 long-press 250ms threshold (PointerSensor 와 동시 활성) |
| UI | drag 시작 시 drag indicator (외곽선 강조 + grab cursor) |
| UI | tab activeTab 의 색상 = arologis-teal `#2A9D8F` underline |
| HTTP | drop 시 `POST /admin/dispatch-tasks/{taskCode}/vehicle-groups/1/slips` → 201 (시나리오 2 와 동일 endpoint) |
| DB | `dispatch_vehicle_group_slip` 에 SL-003 row 추가 |

### 검증 SQL

```sql
-- mobile drag 후 SL-003 추가 확인
SELECT s.slip_number, gs.sequence
FROM dispatch_vehicle_group_slip gs
JOIN dispatch_vehicle_group g ON g.id = gs.vehicle_group_id
JOIN dispatch_task t ON t.id = g.dispatch_task_id
JOIN slip s ON s.id = gs.slip_id
WHERE t.task_code = 'DT-20260514-001'
  AND g.sequence = 1
  AND gs.is_deleted = FALSE
ORDER BY gs.sequence;
-- Expected: 시나리오 2 의 SL-001 1행 + 본 시나리오 SL-003 1행 추가
```

### 회귀 차단 effect

- FAIL 시 운영 증상: mobile-staff 사용자가 배차 메뉴 사용 불가 → desktop 전용 워크플로우 강제
- long-press 미작동 시: 일반 tap 으로 drag 트리거 → 스크롤과 충돌

---

## 시나리오 4 — 슬립 클릭 → 상세 modal (인수자 + 정차 순서) 🟡 Minor

**캡처**: `docs/qa/samhan-dispatch-board/screenshots/04-slip-detail-modal.png`

### 선행 조건

- 시나리오 1~3 의 `1톤 #1` 그룹에 SL-001 + SL-003 mapped 상태
- `SL-001` 의 인수자 정보: `대구공조 김인수 010-1234-5678` (dev dummy)
- `SL-001` 의 배송 주소: `인천 남동구 ...`, 요청사항 `9시까지 배송`

### Step-by-step

1. desktop `/dispatch-board` 좌측 미배차 list 의 `SL-001` 행 click (또는 mobile 의 tap)
2. 우측 side modal (desktop) 또는 full-screen dialog (mobile) 노출
3. modal 내용 확인:
   - 슬립번호 `SL-001`
   - 거래처 `P-1234` 대구공조 (사용자 노출은 partnerName)
   - 인수자 `김인수` + 마스킹된 phoneNumber (또는 dev dummy `010-1234-5678`)
   - 배송 주소 `인천 남동구 ...`
   - 요청사항 `9시까지 배송`
   - 그룹 안 정차 순서 표시 (`1톤 #1 그룹의 ① 정차`)
4. modal 의 [닫기] 버튼 클릭 → 닫힘 → list 로 복귀

### 기대 결과

| Layer | Assertion |
|---|---|
| UI | modal 헤더 = `SL-001 출고전표 상세` (slipNumber 비즈니스 식별자) |
| UI | UUID (slip.id) 절대 노출되지 않음 |
| UI | 정차 순서 표시 = `1톤 #1 그룹의 ① 정차` (그룹 명 + sequence) |
| UI | phoneNumber dev 환경에서 `010-1234-5678`, prod 마스킹 `010-1***-***8` |
| HTTP | `GET /admin/slips/{slipNumber}/detail` → 200, body `{slipNumber, partnerName, recipientName, recipientPhone(masked), address, notes, dispatchInfo: {groupSequence, slipSequenceInGroup}}` |
| HTTP | response 에 slip.id (UUID) 가 없음 (단, 내부 client 호출 시 별도 ID 필요 없음) |

### 검증 SQL

```sql
-- 1. slip 의 인수자 정보 확인
SELECT slip_number, partner_code, recipient_name, recipient_phone, address, notes
FROM slip
WHERE slip_number = 'SL-001' AND is_deleted = FALSE;
-- Expected: 1 row, recipient_name='김인수', recipient_phone='010-1234-5678' (dev)

-- 2. 그룹 안 정차 순서 검증
SELECT g.sequence AS group_seq, gs.sequence AS stop_seq, s.slip_number
FROM dispatch_vehicle_group_slip gs
JOIN dispatch_vehicle_group g ON g.id = gs.vehicle_group_id
JOIN slip s ON s.id = gs.slip_id
WHERE s.slip_number = 'SL-001'
  AND gs.is_deleted = FALSE;
-- Expected: group_seq=1, stop_seq=1
```

### 회귀 차단 effect

- FAIL 시 운영 증상: 배차담당자가 인수자 정보/배송 주소 확인 불가 → 배차 검토 단계 불가능
- UUID 노출 시: `feedback_uuid_no_user_visibility` 위반 — 사용자 보고 채널에서 즉시 회수 결정

---

## 시나리오 5 — [배차 완료] → arologis Mock matcher → DISPATCHED + 기사 정보 🔴 Critical

**캡처**: `docs/qa/samhan-dispatch-board/screenshots/05-dispatch-completed.png`

### 선행 조건

- 시나리오 1~4 의 `1톤 #1` 그룹에 SL-001 mapped 상태
- arologis-service 가 포트 8097 에서 동작
- `SAMHAN_AROLOGIS_MOCK_FAIL_RATE=0.0` (정상 매칭 100%)
- Mock Driver pool: `D-001` 홍길동 010-1234-5678 (TONNAGE_1 가용)
- X-Internal-Token shared secret 양 service 동일

### Step-by-step

1. `/dispatch-board` 우측 패널 [✓ 배차 완료] 버튼 클릭
2. 확인 dialog 노출 → `1톤 #1 (1건) 배차 발송하시겠습니까?` → **확인**
3. spinner 노출 → "배차 발송 중..." 메시지
4. 1~3초 후 Mock matcher 비동기 회신 → 자동 새로고침
5. `1톤 #1` 그룹 헤더에 `배차 완료` 녹색 배지 + 기사 정보 노출
   - 기사 `D-001 홍길동`
   - 폰번호 `010-1234-5678`
6. 좌측 미배차 list 에서 `SL-001` 사라짐 (`dispatchStatus=DISPATCHED`)
7. 상단 알림 toast `배차 완료 (1톤 #1)` (notification-service 트리거)

### 기대 결과

| Layer | Assertion |
|---|---|
| UI | `1톤 #1` 헤더 배지 색상 = 녹색 (`#22C55E` 또는 design token) |
| UI | 기사 정보 표시 = `D-001 홍길동 010-1234-5678` (driverCode + driverName + phone, UUID 비공개) |
| UI | 좌측 미배차 list 에서 SL-001 사라짐 (default UNDISPATCHED 필터) |
| HTTP | `POST /admin/dispatch-tasks/{taskCode}/dispatch` → 200, body `{status:"DISPATCHING", acknowledgedAt}` |
| HTTP | (내부) slip-service → arologis `POST /internal/arologis/dispatches` body 포함: samhanDispatchTaskId, vehicles[].slips |
| HTTP | (내부) arologis → slip-service `POST /internal/slip/dispatch-tasks/{taskCode}/confirm` body 포함: arologisDispatchId, matchedDrivers |
| HTTP | 두 internal endpoint 모두 X-Internal-Token 검증 필수 |
| DB (slip) | `dispatch_task.status` = `DISPATCHED`, `arologis_dispatch_id` NOT NULL |
| DB (slip) | `slip.dispatch_status` = `DISPATCHED` (SL-001) |
| DB (slip) | `matched_driver` row 1건 (driver_code='D-001', driver_name='홍길동', source='MOCK') |
| DB (arologis) | `dispatch` row 1건 (status='MATCHED'), `vehicle` row 1건 (tonnage='TONNAGE_1') |

### 검증 SQL

```sql
-- 1. DispatchTask DISPATCHED 확인
SELECT task_code, status, arologis_dispatch_id IS NOT NULL AS has_arologis_id
FROM dispatch_task
WHERE task_code = 'DT-20260514-001' AND is_deleted = FALSE;
-- Expected: status='DISPATCHED', has_arologis_id=true

-- 2. slip dispatch_status 변경 확인
SELECT slip_number, dispatch_status
FROM slip
WHERE slip_number = 'SL-001' AND is_deleted = FALSE;
-- Expected: dispatch_status='DISPATCHED'

-- 3. MatchedDriver 저장 확인
SELECT md.driver_code, md.driver_name, md.driver_phone_number, md.source, g.sequence AS vehicle_group_seq
FROM matched_driver md
JOIN dispatch_vehicle_group g ON g.id = md.vehicle_group_id
JOIN dispatch_task t ON t.id = g.dispatch_task_id
WHERE t.task_code = 'DT-20260514-001' AND md.is_deleted = FALSE;
-- Expected: 1 row, driver_code='D-001', driver_name='홍길동', source='MOCK'

-- 4. arologis 측 Dispatch 생성 확인 (arologis DB)
SELECT id, samhan_dispatch_task_id, status
FROM dispatch
WHERE samhan_dispatch_task_id = (SELECT id FROM dispatch_task WHERE task_code='DT-20260514-001');
-- Expected: 1 row, status='MATCHED'
```

### 검증 명령 (HTTP)

```bash
# slip-service health
curl -sf http://localhost:8084/actuator/health | jq '.status'
# Expected: "UP"

# X-Internal-Token 검증 (잘못된 토큰 → 401)
curl -X POST http://localhost:8084/internal/slip/dispatch-tasks/<taskId>/confirm \
  -H "X-Internal-Token: WRONG_TOKEN" -H "Content-Type: application/json" -d '{}'
# Expected: HTTP 401 Unauthorized
```

### 회귀 차단 effect

- FAIL 시 운영 증상: 배차 발송 후 기사 매칭 회신을 받지 못함 → 모든 출고전표가 `DISPATCHING` 상태에 갇힘
- X-Internal-Token 가드 break 시: 외부에서 임의로 confirm 호출 가능 — **보안 critical**

---

## 시나리오 6 — Mock 시뮬레이션 (`FAIL_RATE=1.0`) → FAILED + slip UNDISPATCHED 복귀 🔴 Critical

**캡처**: `docs/qa/samhan-dispatch-board/screenshots/06-dispatch-failed.png`

### 선행 조건

- 시나리오 5 의 정상 흐름 검증 후 `dispatch_task` reset (또는 new task `DT-20260514-002` 사용)
- 환경변수 `SAMHAN_AROLOGIS_MOCK_FAIL_RATE=1.0` (100% FAILED 시뮬레이션)
- arologis-service 재시작 (환경변수 reload)
- `SL-002` 만 매핑된 `1톤 #1` 그룹 (또는 새 그룹) 준비

### Step-by-step

1. arologis-service 재시작 후 `/dispatch-board` 진입
2. SL-002 만 매핑된 새 `1톤 #1` 그룹 (`DT-20260514-002`) 준비
3. [✓ 배차 완료] 클릭 → 확인 → spinner
4. Mock matcher 가 1초 후 `unavailable` 회신 (100% FAILED)
5. `1톤 #1` 그룹 헤더에 `배차 불가` 빨간 배지 노출
   - 사유 `1톤 차량 가용 기사 0명 (인성데이타 응답)` (Mock fixed 메시지)
   - [재배차] 버튼 노출
6. 좌측 미배차 list 에 `SL-002` 다시 노출 (`dispatchStatus=UNDISPATCHED` 복귀)
7. 상단 알림 toast `배차 불가 — 사유: 1톤 차량 가용 기사 0명`

### 기대 결과

| Layer | Assertion |
|---|---|
| UI | `1톤 #1` 헤더 배지 색상 = 빨강 (`#EF4444` 또는 design token) |
| UI | 사유 텍스트 `1톤 차량 가용 기사 0명 (인성데이타 응답)` |
| UI | [재배차] 버튼 활성 (클릭 시 dispatch_task 의 status 만 DRAFT 복귀 + slip 들은 그룹에 남음) |
| UI | 좌측 미배차 list 에 SL-002 노출 (기본 필터 = UNDISPATCHED) |
| HTTP | (내부) arologis → slip-service `POST /internal/slip/dispatch-tasks/{taskCode}/unavailable` body 포함: arologisDispatchId, reason, failedVehicleGroups |
| DB (slip) | `dispatch_task.status` = `FAILED`, `failure_reason` NOT NULL |
| DB (slip) | `slip.dispatch_status` = `UNDISPATCHED` (실패한 그룹의 slip 모두 복귀) |
| DB (arologis) | `dispatch.status` = `UNAVAILABLE` (또는 `MATCHING_FAILED`) |

### 검증 SQL

```sql
-- 1. DispatchTask FAILED 확인
SELECT task_code, status, failure_reason
FROM dispatch_task
WHERE task_code = 'DT-20260514-002' AND is_deleted = FALSE;
-- Expected: status='FAILED', failure_reason LIKE '%가용 기사 0명%'

-- 2. slip dispatch_status UNDISPATCHED 복귀 확인
SELECT slip_number, dispatch_status
FROM slip
WHERE slip_number = 'SL-002' AND is_deleted = FALSE;
-- Expected: dispatch_status='UNDISPATCHED'

-- 3. arologis 측 Dispatch UNAVAILABLE 확인
SELECT id, samhan_dispatch_task_id, status, failure_reason
FROM dispatch
WHERE samhan_dispatch_task_id = (SELECT id FROM dispatch_task WHERE task_code='DT-20260514-002');
-- Expected: status='UNAVAILABLE' (또는 MATCHING_FAILED), failure_reason NOT NULL

-- 4. MatchedDriver 미생성 확인 (FAILED 시 회신에 driver 없음)
SELECT COUNT(*)
FROM matched_driver md
JOIN dispatch_vehicle_group g ON g.id = md.vehicle_group_id
JOIN dispatch_task t ON t.id = g.dispatch_task_id
WHERE t.task_code = 'DT-20260514-002';
-- Expected: 0
```

### 검증 명령 (재배차 흐름)

```bash
# 재배차 버튼 클릭 후 task status reset 확인
curl -sf http://localhost:8084/admin/dispatch-tasks/DT-20260514-002 \
  -H "Authorization: Bearer <manager-jwt>" | jq '.status'
# Expected: "DRAFT" (재배차 후 다시 [배차 완료] 클릭 가능 상태)
```

### 회귀 차단 effect

- FAIL 시 운영 증상: 매칭 불가 회신을 못 받음 → slip 들이 영원히 `DISPATCHING` 상태 → 다른 차량 그룹에도 재배치 불가능
- UNDISPATCHED 복귀 break 시: 재배차 buttondisabled — 운영 가이드의 "재시도" 워크플로우 불가능

---

## 부록 A — 6 시나리오 매트릭스 요약

| # | 시나리오 | 우선순위 | 캡처 파일 | 핵심 검증 |
|---|---|---|---|---|
| 1 | 로그인 + 미배차 50개 페이지네이션 | 🔴 Critical | 01-desktop-board.png | `GET /admin/slips` + Flyway V17 schema |
| 2 | 차량 추가 + drag-drop | 🔴 Critical | 03-add-vehicle-modal.png | `dispatch_vehicle_group(_slip)` + partial unique |
| 3 | mobile-staff tab + TouchSensor | 🟠 Major | 02-mobile-board-tab.png | TouchSensor 250ms long-press |
| 4 | 슬립 상세 modal | 🟡 Minor | 04-slip-detail-modal.png | UUID 비공개 + 정차 순서 |
| 5 | 배차 완료 → Mock matcher → DISPATCHED | 🔴 Critical | 05-dispatch-completed.png | service-to-service 양방향 + X-Internal-Token |
| 6 | FAIL_RATE=1.0 시뮬레이션 → FAILED 복귀 | 🔴 Critical | 06-dispatch-failed.png | unavailable 회신 + slip UNDISPATCHED 복귀 |

## 부록 B — 검증 SQL 일괄 실행 script

```bash
# scripts/verify-dispatch-board.sh 형태로 추후 확장 가능 (본 슬라이스는 수동 SQL)
PGPASSWORD=devpass psql -h localhost -U devuser -d slip_service <<'SQL'
\echo '=== DispatchTask 상태 분포 ==='
SELECT status, COUNT(*) FROM dispatch_task WHERE is_deleted=FALSE GROUP BY status;

\echo '=== slip.dispatch_status 분포 ==='
SELECT dispatch_status, COUNT(*) FROM slip WHERE is_deleted=FALSE GROUP BY dispatch_status;

\echo '=== Flyway V16/V17 적용 ==='
SELECT version, description, success FROM flyway_schema_history WHERE version IN ('16','17');
SQL
```

## 부록 C — UI 캡처 의무 (`feedback_pr_qa_screenshots`)

본 6 시나리오는 통합 PR 본문에 **인라인 6장 모두 첨부** 의무. mock PNG 6장은 QA Task Q2 의 `scripts/generate-samhan-dispatch-board-screenshots.ps1` 로 자동 생성. 실제 운영 캡처는 통합 PR 머지 직전 desktop / mobile-staff 환경에서 사용자가 별도 첨부 가능 (선택 사항).

각 PNG 의 인라인 첨부 markdown:

```markdown
![01 desktop 배차 메뉴](docs/qa/samhan-dispatch-board/screenshots/01-desktop-board.png)
![02 mobile-staff tab 전환](docs/qa/samhan-dispatch-board/screenshots/02-mobile-board-tab.png)
![03 차량 추가 modal](docs/qa/samhan-dispatch-board/screenshots/03-add-vehicle-modal.png)
![04 슬립 상세 modal](docs/qa/samhan-dispatch-board/screenshots/04-slip-detail-modal.png)
![05 배차 완료 (DISPATCHED)](docs/qa/samhan-dispatch-board/screenshots/05-dispatch-completed.png)
![06 배차 불가 (FAILED)](docs/qa/samhan-dispatch-board/screenshots/06-dispatch-failed.png)
```
