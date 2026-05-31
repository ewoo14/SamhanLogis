# 슬라이스 C — slip ↔ inventory 창고코드 정렬 (dev-report)

- **작성일**: 2026-05-31
- **브랜치**: `feat/slice-c-slip-inventory-warehouse-align`
- **spec**: `docs/superpowers/specs/2026-05-31-slip-inventory-warehouse-code-align-design.md`
- **plan**: `docs/superpowers/plans/2026-05-31-slip-inventory-warehouse-code-align.md`
- **선행**: Phase 2.6c 재고 예약(reserve) 정합 (#327 `0299191b`)

---

## 1. 목표 / 배경

Phase 2.6c 가 주문→출고전표 **전환(convert)** 시 재고 예약 정합까지 머지했으나, 실제 전환
happy-path(=slip 발행 성공)는 **창고코드 네임스페이스 단절** 때문에 막혀 있었다(2겹 차단):

1. **네임스페이스 단절(교집합 0)**: inventory 는 자체 코드(`HQ-001` 등, UUID `…0001~0004`)를,
   slip `WarehouseCodeMapper`(정적 yml)는 이카운트 레거시 코드(`00003/2/14/1`, placeholder UUID)를
   쓴다. convert 가 같은 warehouseCode 문자열을 양쪽에 보내므로 inventory 코드를 보내면
   slip 매핑 누락(400), 레거시 코드를 보내면 inventory by-code 미존재(404).
2. **FE 미전송**: 전환 모달이 warehouseCode 를 BE 로 전혀 보내지 않아 convert 2a 가드가 409.

e-Count 가 PR-G1 V16 에서 완전 제거되어 slip 의 `warehouseId` 는 단순 스냅샷 컬럼이고, 실제
재고 예약은 partner-order 가 inventory UUID 로 직접 수행한다는 점이 설계의 전제였다.

## 2. 결정 (DECISIONS D-WH-01~03)

- **D-WH-01**: 창고코드 단일 출처 = inventory DB.
- **D-WH-02**: convert 는 partner-order 가 inventory 로 해석한 `warehouseId` 를 slip 에 직접 전달
  (slip 은 yml 미경유). estimate-app from-estimate 경로는 yml 맵 그대로 유지(레거시 격리, 무영향).
- **D-WH-03**: FE 전환 모달은 창고 드롭다운 필수(기본값 없음). 미선택 시 전환 버튼 비활성.

## 3. 변경 요약 (커밋)

| 커밋 | 영역 | 내용 |
|---|---|---|
| `bcafe950` | slip-service | `PublishFromPartnerOrderRequest.warehouseId`(nullable) 추가 + `SlipPublishService.resolveWarehouseId(warehouseId, warehouseCode)` helper(warehouseId 우선, 없으면 yml 폴백) |
| `fd5f4378` | partner-order-service | `PartnerOrderConvertService.convert` 가 slip payload 에 `warehouseId`(inventory 해석 UUID) 추가 전달 |
| `44cbc420` | FE (desktop) | 전환 모달에 design-system `WarehouseSelector`(필수, hideVirtual) + 제출 게이트 + `warehouseCode` 전송 |

## 4. 함수 단위 문서

### `SlipPublishService.resolveWarehouseId(String warehouseId, String warehouseCode)`
- `warehouseId`(UUID 문자열)가 non-null/non-blank → `UUID.fromString` 으로 직접 사용(yml 미경유).
  UUID 형식 아니면 `BusinessException(INVALID_INPUT)`.
- null/blank → `warehouseCodeMapper.resolve(warehouseCode)` 폴백(estimate-app 등 레거시 하위호환).
- `publishFromPartnerOrder` 에서만 호출. **fingerprint 는 기존대로 `warehouseCode` 기준** 유지
  (멱등 안정성 — `warehouseId` 는 fingerprint 미포함, 스냅샷 저장에만).

### `PartnerOrderConvertService.convert(...)`
- 기존 step4 `warehouseId = inventoryClient.resolveWarehouseIdByCode(req.warehouseCode())` 로 확보한
  지역 변수를 slip payload 에 `payload.put("warehouseId", warehouseId.toString())` 로 추가 전달
  (`warehouseCode` 도 계속 전달 — fingerprint/표시용). reserve/release 보상·idempotency 로직 불변.

### FE `SalesPartnerOrderDetailPage` 전환 모달
- `convertWarehouse: Warehouse | null` state + `warehousesQuery`(`GET /inventory/warehouses`).
- `convertMutation` 시그니처 `{ items, warehouseCode }`. 제출 버튼 `disabled` 에 `!convertWarehouse` 추가.
- `WarehouseSelector` value 는 창고 id(내부), onChange 에서 `warehouse.code` 추출 → 요청 본문엔
  **warehouseCode 만** 전송. **UUID 비공개** 준수([[feedback_uuid_no_user_visibility]]).

## 5. 테스트

- **slip IT** `SlipPublishWarehouseIdIT`(2 케이스, 실 Testcontainers): warehouseId 직접 사용(yml 미경유)
  + warehouseId 없을 때 yml 폴백 회귀. → 2 PASS. `slip.publish.*` 전체 회귀 PASS.
- **partner-order IT** `PartnerOrderConvertIT.case6`: slip payload 에 `warehouseId`=inventory 해석 UUID
  + `warehouseCode` 포함 captor 단언. → case1~10 전체 PASS(skipped=0).
- **FE Playwright** `phase-2-6a-order-convert`: 신규 시나리오 11(창고 미선택 시 제출 비활성 →
  선택 후 전환 성공) + 기존 시나리오 2/3/9 창고 선택 단계 보완. → 11 passed. typecheck/lint 0 err.

## 6. 정렬 후 데이터 흐름

`FE(warehouseCode=HQ-001)` → partner-order convert → inventory by-code → `warehouseId(…0001)` →
① reserve(warehouseId) ② slip publish(warehouseCode + **warehouseId**) → slip 이 warehouseId 직접
저장(yml 미경유) → **발행 성공(SENT)** → converted 누적. reserve 와 slip 스냅샷이 동일 창고 UUID 정렬.

## 7. 배포 순서

1. **slip-service** (warehouseId 수용 — 폴백 호환이라 단독 배포 안전)
2. **partner-order-service** (warehouseId 전달)
3. **FE (desktop)** — 동시 또는 직후

## 8. QA

- **Docker 실 QA** ([[feedback_no_fake_data_ever]] — 실 캡처만): 실 gateway + 실 JWT + 실
  partner_order_db/inventory_db/slip_db 연동. convert → reserve(RESERVE) → **slip 발행 성공(SENT)**
  → `converted_quantity` psql 적중 + 실 desktop renderer 화면. (PR 통합 단계에서 수행.)

## 9. 미해결 / 후속

- inventory `warehouses.legacy_code` 별칭 컬럼 도입 → slip yml 맵 완전 폐기 + estimate 경로도
  inventory 단일 출처 통합 (별도 슬라이스).
- 전환 모달 창고별 가용 재고 표시 → 슬라이스 B (2.6d 재고조회 모달).
- 다중주문 병합 전환 시 창고 정합 → 슬라이스 D (2.6b).

## 10. 5-team 리뷰 (사이클 N=2, Codex 다운 → 전원 Claude 에이전트)

raw: `docs/qa/slice-c-warehouse-code-align/claude-{be,fe,designer,qa,devops}-cycle{1,2}.md`.

| 팀 | 사이클1 | 사이클2 |
|---|---|---|
| BE | APPROVE (P1×1 후속, P2×3) | — |
| FE | CHANGES_REQUESTED (P1×2) | **APPROVE** |
| Designer | CHANGES_REQUESTED (P1×2) | **APPROVE** |
| QA | APPROVE (P1×1 = Docker 게이트) | — |
| DevOps | APPROVE (결함 0) | — |

**사이클1 fix (`184da98f`)**: FE-F2 `ConvertToSlipRequest.warehouseCode` 필수화 / FE-F1 모달 open 시 창고 초기화 / Designer-F1 미선택 시 인라인 에러(`출고 창고를 선택하세요`) / Designer-F2 창고 목록 로딩·에러 상태(disabled + placeholder + 에러 문구) / mock `active` 필드. → 사이클2 FE·Designer APPROVE.

**비차단 후속 (P2)**:
- BE-P1: convert 재시도 2차 호출 slip payload warehouseId 포함 captor 단언 추가(현 fingerprint 는 warehouseCode 기준이라 실전 영향 없음). 
- Designer-P2: WarehouseSelector 옵션 코드 표시(`코드 · 창고명`) → 창고명 단독 / focus ring 색상 토큰화 — **공유 컴포넌트라 별도 슬라이스**(다른 사용처 영향).
- QA/FE-P2: warehouseId 형식오류 400 경로 IT, SENT 불변 전이 연동 단언, Playwright 시나리오 8 disabled 원인 분리·시나리오 11 토스트 문구 보강.

**QA-P1 (Docker 실 QA 게이트)**: reserve(inventory `warehouse_id`)와 slip 저장(`slips.source_warehouse_id`)이 **동일 창고 UUID** 임은 단위 IT(각 @MockBean 경계)로는 완전 증명 불가 → **머지 전 Docker 실 QA 에서 psql cross-check** 필수. 절차/쿼리: `docs/qa/slice-c-warehouse-code-align/claude-qa-cycle1.md` §3. ([[feedback_no_fake_data_ever]] 실 캡처 의무.)
