# 주문(Partner-Order) 보류(ON_HOLD) 상태 + 리스트 상태 필터 — 설계 (Phase 2.5)

> grounding 완료(2026-05-30 자정), 개발책임자 결정 반영. **내일(2026-05-31) 재개 — spec 확정 후 plan → 구현.**
> ⚠️ Codex 토큰 소진 → 2026-06-01(월) 12:00 복구 전까지 구현+dual리뷰 모두 Claude 에이전트 대체.

## 1. 업무 규칙 (개발책임자 확정)
- 주문이 들어오면 자동 **진행중**(=DRAFT). 출고전표 전환 시 **완료**(=CONFIRMED).
- **보류**(=신규 ON_HOLD) = 진행중에서 멈춘 편집가능 상태.
- 주문 리스트 창: 기본 **진행중**만 표시 + 상태 선택 필터(진행중/완료/보류)로 전환 조회.

## 2. 결정 (2026-05-30 마우스 선택)
- **보류 전이 범위 = 진행중 ↔ 보류만** (DRAFT ↔ ON_HOLD 양방향). 완료(CONFIRMED)는 보류 불가(slip 정합성 보호). 보류 주문도 confirm(출고전표 전환) 가능.
- **보류/해제 권한 = 기존 `sales.partner-order.edit` UPDATE action 재사용** (신규 page 불필요).

## 3. 상태 모델 (확정)
| 업무 용어 | enum | 편집/복원 | 전이 |
|---|---|---|---|
| 진행중 | DRAFT | O | → ON_HOLD(보류) / → CONFIRMING→CONFIRMED(확정) |
| 보류 | **ON_HOLD**(신규) | O | → DRAFT(해제) / → CONFIRMING→CONFIRMED(확정) |
| 완료 | CONFIRMED | 복원만 | (slip 발행됨) |
| (전환중) | CONFIRMING | X | transient |
| 취소 | CANCELED | X | |

## 4. 설계 (grounding 기반)

### 4.1 BE 도메인 (`PartnerOrder.java` / `PartnerOrderStatus.java`)
- enum `ON_HOLD` 추가.
- `markOnHold()`: status==DRAFT 아니면 409 → ON_HOLD. `releaseHold()`: status==ON_HOLD 아니면 409 → DRAFT. (도메인 메서드 체인, 직접 set 금지)
- confirm 진입 가드: 현재 `markConfirming()` 가 DRAFT 전제 → **ON_HOLD 도 confirm 허용**하도록 가드 조정(DRAFT 또는 ON_HOLD).
- Phase 2.4 RESTORE 가드 `requireRestorable()`(CONFIRMING/CANCELED만 409) → ON_HOLD 는 이미 허용됨(제외목록 방식 덕분, 수정 불필요). 복원 대상에 ON_HOLD 자동 포함.

### 4.2 BE 전이 API
- `POST /api/v1/partner-orders/{id}/hold` (@RequirePermission edit/UPDATE) → markOnHold
- `POST /api/v1/partner-orders/{id}/release` (edit/UPDATE) → releaseHold
- (선택) 전이 시 Phase 2.4 STATUS revision 캡처 — hold/release 를 STATUS type 으로 기록(감사). Phase 2.4 에서 STATUS 는 死코드였으나 여기서 첫 실사용.

### 4.3 BE 리스트 status 필터 (**grounding 정정 — 인프라 이미 완성**)
- `PartnerOrderListController`(line 50) 에 `status` query param **이미 존재**. `PartnerOrderQueryService`(line 142-143) 가 `JpaSpecificationExecutor` 기반 status 필터 Specification **이미 구현**. `PartnerOrderRepository` 도 Specification 기반.
- → **ON_HOLD enum 추가만으로 status 필터 자동 동작.** BE 리스트 변경 거의 없음(기본값 DRAFT 확인만).
- Flyway: V1 `status VARCHAR(20) NOT NULL` + **CHECK 제약 없음** → enum 추가 마이그레이션 불필요. (V8 불필요. 선택: status 인덱스만.)

### 4.4 권한
- 기존 `sales.partner-order.edit` UPDATE 재사용. auth seed 변경 불필요.

### 4.5 FE (grounding 정정 — 필터 UI 이미 완성)
- `SalesPartnerOrderListPage.tsx`(line 122-135) **statusFilter state + Select 드롭다운 이미 구현**, queryKey(line 51) 에 statusFilter 포함 → ON_HOLD enum 값만 추가하면 즉시 작동.
- `clients/desktop/src/renderer/api/sales.ts`(line 332-337) `PARTNER_ORDER_STATUS_LABEL` 에 `ON_HOLD: '보류'` 추가 (현재 DRAFT='작성중'/CONFIRMING='확정 처리중'/CONFIRMED='확정'/CANCELED='취소' — **업무용어 통일도 검토: DRAFT='진행중', CONFIRMED='완료'**). PartnerOrderStatus FE 타입에 ON_HOLD 추가.
- 주문 상세에 **보류/해제 버튼**(status 따라 토글, edit 권한 게이트) — 신규.
- 복원 성공 invalidate 패턴(Phase 2.4) 일관.
- **라벨 정정 결정 필요**: 기존 라벨이 '작성중/확정'인데 개발책임자 업무용어는 '진행중/완료'. 통일할지 plan/구현 시 확정.

## 5. 테스트 + QA
- IT: hold/release 전이(DRAFT↔ON_HOLD) + 완료 보류 시도 409 + status 필터 조회(진행중/완료/보류 각각) + ON_HOLD 주문 confirm + ON_HOLD 복원(Phase 2.4 연계).
- Playwright: 리스트 상태 필터 전환 + 보류/해제 버튼.
- Docker 실 QA: 리스트 필터 + 보류 전이 실 적중.

## 6. 사이클/리뷰
- Claude 에이전트 구현(Codex 다운) → Claude 5-team 리뷰 사이클 N=2 → CI green(skipped=0) → Docker 실 QA → 머지.
- 메모리: [[project-partner-order-status-model]] / [[cycle-n2-mandatory]] / [[early-pr-docker-qa-screenshots]] / [[always-mouse-choices]]

## 7. 미정/구현 시 확인
- (선택) hold/release STATUS revision 캡처 여부 — 감사 가치 vs 단순성.
- 리스트 기본 필터 '진행중'일 때 보류 분리 여부(현재 설계: 분리).
- **라벨 통일**: 기존 DRAFT='작성중'/CONFIRMED='확정' ↔ 업무용어 '진행중'/'완료'. 통일 권장(개발책임자 업무용어 우선).

## 8. grounding 요약 (구현 범위 축소)
status 필터 BE(Controller/Service/Repository Specification) + FE(드롭다운/queryKey) **이미 완성**. **실제 신규 = ON_HOLD enum + hold/release 도메인메서드/API + confirm 가드 + FE 라벨/버튼 + 테스트.** 마이그레이션 불필요(CHECK 제약 없음).
