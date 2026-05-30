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

### 4.3 BE 리스트 status 필터 (**최대 난점**)
- `PartnerOrderQueryController` 목록 endpoint(`GET /api/v1/partner-orders`)에 `status` query param 추가(기본 DRAFT).
- **현재 목록 쿼리가 `confirmedAt` 기반**(CONFIRMED 전제, `findAllByBizCodeAndConfirmedAtBetween...`)이라 DRAFT/ON_HOLD(confirmedAt=null) 조회 불가 → **JpaSpecificationExecutor 또는 신규 쿼리 메서드로 status 필터 재설계**. createdAt 기반 정렬/기간 필터로 전환 검토.
- (선택) Flyway V8 `(status, created_at DESC)` 인덱스.

### 4.4 권한
- 기존 `sales.partner-order.edit` UPDATE 재사용. auth seed 변경 불필요.

### 4.5 FE (`SalesPartnerOrderListPage.tsx`)
- queryKey 에 `statusFilter` 이미 존재 → **UI 드롭다운/탭(진행중/완료/보류) + API status param 전달 완성**. 기본값 DRAFT(진행중).
- status→한글 라벨 맵에 `ON_HOLD='보류'` 추가 (DRAFT=진행중/CONFIRMED=완료/CANCELED=취소/CONFIRMING=처리중).
- 주문 상세에 **보류/해제 버튼**(status 따라 토글, edit 권한 게이트).
- 복원 성공 invalidate 패턴(Phase 2.4) 일관.

## 5. 테스트 + QA
- IT: hold/release 전이(DRAFT↔ON_HOLD) + 완료 보류 시도 409 + status 필터 조회(진행중/완료/보류 각각) + ON_HOLD 주문 confirm + ON_HOLD 복원(Phase 2.4 연계).
- Playwright: 리스트 상태 필터 전환 + 보류/해제 버튼.
- Docker 실 QA: 리스트 필터 + 보류 전이 실 적중.

## 6. 사이클/리뷰
- Claude 에이전트 구현(Codex 다운) → Claude 5-team 리뷰 사이클 N=2 → CI green(skipped=0) → Docker 실 QA → 머지.
- 메모리: [[project-partner-order-status-model]] / [[cycle-n2-mandatory]] / [[early-pr-docker-qa-screenshots]] / [[always-mouse-choices]]

## 7. 미정/내일 확인
- (선택) hold/release STATUS revision 캡처 여부 — 감사 가치 vs 단순성. 구현 시 결정.
- 리스트 기본 필터가 '진행중'일 때 보류도 같이 보일지, 완전 분리할지(현재 설계: 분리, 진행중만).
