# 슬라이스 C — slip ↔ inventory 창고코드 정렬 (2.6c convert happy-path 잠금)

- **작성일**: 2026-05-31
- **상태**: 설계 확정 (개발책임자 승인 2026-05-31)
- **유형**: BE(slip + partner-order) + FE(desktop) 통합 슬라이스 (소규모)
- **선행**: Phase 2.6c 재고 예약(reserve) 정합 머지 (#327 `0299191b`)
- **관련 메모리**: [[project_seed_product_uuid_catalog]], [[feedback_uuid_no_user_visibility]], [[feedback_no_fake_data_ever]]

---

## 1. 배경 / 문제

Phase 2.6c 에서 주문→출고전표 **전환(convert)** 시 재고 예약(reserve) 정합이 머지됐으나,
실제 전환 happy-path(=slip 발행 성공)는 **창고코드 네임스페이스 단절** 때문에 막혀 있다.

### 근본 원인 — 2겹 차단

**① 창고코드 네임스페이스가 완전히 단절 (교집합 0)**

| 출처 | 코드 예 | UUID 예 | 비고 |
|---|---|---|---|
| **inventory** (`warehouses.code`) | `HQ-001` / `VH-001` / `CS-001` / `VR-001` | `…0001` ~ `…0004` (deterministic) | 단일 출처. partner-order 가 `resolveWarehouseIdByCode` 로 역조회하여 reserve 에 사용 |
| **slip** (`WarehouseCodeMapper`, 정적 yml) | `00003` / `2` / `14` / `1` (이카운트 레거시) | `…1111` / `…2222` / … (placeholder) | `app.publish.warehouse-code-map`. from-estimate / from-partner-order 발행 시 resolve |

convert 는 **같은 warehouseCode 문자열**을 inventory(reserve)와 slip(발행) 양쪽에 보낸다.
두 키 집합이 교집합 0 이므로:
- inventory 코드(`HQ-001`)를 보내면 → slip `resolve("HQ-001")` 매핑 누락 → **400 (INVALID_INPUT)**. ← 2.6c Docker 실 QA 가 실제로 본 실패.
- 레거시 코드(`00003`)를 보내면 → inventory `by-code` 미존재 → **404**. reserve 단계조차 통과 못 함.

**② FE 가 convert 에 warehouseCode 를 아예 안 보냄**

`SalesPartnerOrderDetailPage.tsx` 의 전환 mutation 이 `convertPartnerOrderToSlip(orderId, { items })` 로
호출 — warehouseCode 미포함. BE `PartnerOrderConvertService.convert` 의 2a 가드(`warehouseCode 필수`)가
**409** 를 던진다. 즉 현재 UI 로는 전환 시작 자체가 불가능.

### 설계상 중요한 전제

- **e-Count 완전 제거**(PR-G1 V16): slip 은 더 이상 e-Count API 를 호출하지 않는다. slip 의 `warehouseId` 는
  이제 **단순 스냅샷 컬럼**이며, 실제 재고 예약은 partner-order 가 inventory UUID 로 직접 수행한다.
- **estimate-app 은 레거시 코드를 지금도 실제로 전송**: `clients/web/estimate-app/lib/slip-bridge.js` 가
  `warehouseCode: head.WH_CD`(= `00003` 등 이카운트 코드)를 from-estimate 발행에 전달한다(테스트 `code.test.js`
  에서 `00003` 단언). → slip yml 맵을 무조건 제거하면 견적앱 발행이 깨진다.

---

## 2. 결정 (개발책임자 확정 2026-05-31)

| # | 결정 | 선택 근거 |
|---|---|---|
| D-WH-01 | **창고코드 단일 출처 = inventory DB** | e-Count 제거됨 + reserve 가 inventory UUID 로 일어나므로 inventory 가 자연스러운 진실원 |
| D-WH-02 | **convert 경로**: partner-order 가 inventory 로 해석한 `warehouseId` 를 slip 에 **직접 전달**(slip 은 convert 경로에서 yml resolve 미수행). **estimate 경로**: slip yml 맵 그대로 유지(레거시 격리) | happy-path 즉시 해결 + 견적앱 무영향 + 최소 리스크. (yml 맵은 convert 가 아닌 estimate 전용으로만 잔존) |
| D-WH-03 | **FE 전환 모달**: 창고 드롭다운(필수, 기본값 없음). 미선택 시 전환 버튼 비활성 | 오선택(재고 없는 창고) 방지 — 명시적 선택 강제 |

### 명시적 제외 (범위 밖)

- estimate-app from-estimate 경로 정렬 (yml 맵 유지로 무영향 — 후속 과제로 inventory `legacy_code` 별칭 도입 시 통합 가능)
- inventory `warehouses` 에 `legacy_code` 별칭 컬럼 추가 (후속)
- 전환 모달의 **창고별 재고 가용량 표시** (슬라이스 B — 2.6d 재고조회 모달)
- slip `WarehouseCodeMapper` 전면 폐기 (estimate 경로가 의존하므로 본 슬라이스에서 미폐기)

---

## 3. 변경 단위

### 3.1 slip-service (BE)

- **`PublishFromPartnerOrderRequest`**: `warehouseId`(UUID, **nullable**) 필드 추가. 기존 `warehouseCode`(NotBlank) 유지.
- **`SlipPublishService.publishFromPartnerOrder`**:
  - `req.warehouseId()` 가 non-null → **그대로 사용**(yml 미경유).
  - null → 기존 `warehouseCodeMapper.resolve(req.warehouseCode())` **폴백**(하위호환 — 기타 호출자/회귀 보호).
  - → convert 경로는 inventory UUID 직접 저장 → **400 제거**.
- **fingerprint**: 기존대로 `warehouseCode` 기준 유지(멱등 안정성 — warehouseId 는 fingerprint 에 미포함, 스냅샷 컬럼 저장에만).
- **무변경**: `WarehouseCodeMapper`, `publishFromEstimate`(estimate 경로), `app.publish.warehouse-code-map`.

### 3.2 partner-order-service (BE)

- **`PartnerOrderConvertService.convert`**: step4 에서 이미 확보한 `warehouseId`(=`inventoryClient.resolveWarehouseIdByCode(req.warehouseCode())`)를
  slip payload 에 **추가**: `payload.put("warehouseId", warehouseId.toString())`. 기존 `warehouseCode` 도 계속 전달.
- **`SlipServiceClient.publishFromPartnerOrder`**: payload → DTO 매핑에 `warehouseId` 포함.
- **무변경**: 2a 필수 가드(warehouseCode blank → 409), reserve/release 보상 로직, idempotencyKey/convertKey 생성.

### 3.3 FE (desktop — `SalesPartnerOrderDetailPage` 전환 모달)

- design-system **`WarehouseSelector`** 추가: `required`, `hideVirtual=true`(가상창고는 물리 출고 대상 아님), **기본값 없음**(`value=null`).
- 창고 목록 = `GET /inventory/warehouses` 쿼리(기존 hook 재사용 또는 신규 — SafetyStockAlertsPage 패턴 참조).
- 창고 미선택 → 전환 확정 버튼 **비활성**.
- onChange `(warehouseId, warehouse)` → `warehouse.code` 추출 → `convertPartnerOrderToSlip(orderId, { items, warehouseCode })`.
- **UUID 비공개 가드**([[feedback_uuid_no_user_visibility]]): 드롭다운 내부 value 는 창고 id 지만, **convert API 본문에는 `warehouseCode` 만** 전송. UUID 화면 미노출.
- 409(가용 부족 / 창고) 에러 UX 는 기존 `convertErrorMessage` 표시 재사용.

---

## 4. 정렬 후 데이터 흐름

```
FE 전환 모달
  └─ 창고 필수 선택 → warehouse.code = "HQ-001"
  └─ POST /api/v1/partner-orders/{orderNo}/convert-to-slip  { items, warehouseCode:"HQ-001" }
        │
        ▼  PartnerOrderConvertService.convert
  ① requireConvertible + warehouseCode 필수 가드(409 if blank) + 라인 잔여수량 검증
  ② warehouseId = inventoryClient.resolveWarehouseIdByCode("HQ-001")  →  …0001
  ③ 라인별 inventoryClient.reserve(productId, warehouseId=…0001, qty, PARTNER_ORDER_CONVERT, convertKey)
         └─ 가용 부족 → 409 사전차단(slip 미발행) + 이미 예약된 라인 release 보상
  ④ slipServiceClient.publishFromPartnerOrder({ ...payload, warehouseCode:"HQ-001", warehouseId:"…0001" }, idempotencyKey)
         │
         ▼  SlipPublishService.publishFromPartnerOrder
       warehouseId non-null → 그대로 사용(yml 미경유) → Slip.createOutbound(warehouseId=…0001)
       → DRAFT→SAVED→SENT 불변 전이(2.6c) → 발행 성공
         │
  ⑤ slip 발행 실패 시 → reserve release 보상 → 예외 전파
  ⑥ 발행 성공 → line.convert(qty) 누적 + markConvertedIfComplete + saveAndFlush
```

UUID `…0001` 은 reserve 와 slip 스냅샷 양쪽에서 **동일 창고**를 가리킨다(정렬 완료).

---

## 5. 에러 / 엣지

| 상황 | 동작 |
|---|---|
| 창고 미선택 | FE 전환 버튼 비활성 (요청 미발생) |
| warehouseCode blank (방어) | convert 2a 가드 409 (기존 유지) |
| warehouseCode 가 inventory 에 미존재 | inventory by-code 404 → convert 404. FE 가 inventory 목록에서만 고르므로 실제로는 미발생 |
| 가용 재고 부족 | reserve 409 → convert 409 사전차단(slip 미발행), 예약 라인 release 보상 (2.6c 유지) |
| slip 발행 실패(그 외 원인) | reserve release 보상 → 예외 전파 (2.6c 유지) |
| 멱등 재시도 | convertKey/idempotencyKey 결정적 → reserve no-op + slip replay (2.6c 유지) |
| estimate-app from-estimate 발행 | slip 이 warehouseId null → yml resolve 폴백 → **기존대로 동작**(무영향) |

---

## 6. 테스트 전략

- **slip IT** (Testcontainers, 실 Postgres):
  - `publishFromPartnerOrder` 가 `warehouseId` non-null 시 yml 미경유로 해당 UUID 저장.
  - `warehouseId` null 시 yml 폴백 회귀(estimate 경로 등).
- **partner-order IT** (Testcontainers, InventoryClient/SlipServiceClient @MockBean):
  - convert 시 slip payload 에 `warehouseId` 포함 검증.
  - happy-path: reserve → publish 성공 → `converted_quantity` 누적 + status 전이.
- **FE Playwright**: 전환 모달 창고 **필수 선택** → 전환 성공(미선택 시 버튼 비활성).
- **Docker 실 QA** ([[feedback_no_fake_data_ever]] — 실 캡처만, 합성/mock 화면 금지):
  - 실 gateway + 실 JWT + 실 partner_order_db/inventory_db/slip_db 연동.
  - convert → reserve(RESERVE) → **slip 발행 성공**(SENT) → `converted_quantity` psql 적중 + 실 desktop renderer 화면.
  - 재현 절차: 핸드오프 노트 "재고 실 QA 재현 절차" 참조(seed 토글 + influxd 포트 우회).

---

## 7. 배포 순서

1. **slip-service** (warehouseId 수용 — 폴백 호환이라 단독 배포 안전)
2. **partner-order-service** (warehouseId 전달)
3. **FE (desktop)** — 동시 또는 직후

---

## 8. 미해결 / 후속

- inventory `warehouses.legacy_code` 별칭 컬럼 도입 → slip yml 맵 완전 폐기 + estimate 경로도 inventory 단일 출처로 통합 (별도 슬라이스).
- 전환 모달 창고별 가용 재고 표시 → 슬라이스 B (2.6d 재고조회 모달).
- 다중주문 병합 전환 시 창고 정합 → 슬라이스 D (2.6b).
