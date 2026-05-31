# 슬라이스 C — BE 코드 리뷰 (Claude, cycle 1)

- **리뷰어**: Claude BE agent
- **리뷰 일시**: 2026-05-31
- **브랜치**: `feat/slice-c-slip-inventory-warehouse-align`
- **diff 기준**: `git diff main...HEAD -- services/`
- **결론**: APPROVE (P0 결함 없음, P1 1건 조건부 수정 권고)

---

## 결함 요약

| 등급 | 건수 | 비고 |
|---|---|---|
| P0 (블로커) | 0 | - |
| P1 (주요, 머지 전 수정 권고) | 1 | IT 멱등 재시도 경로 미검증 |
| P2 (개선 제안) | 3 | IT 검증 강화 / UUID 노출 주석 보완 / @Size 표현력 |

---

## 항목별 분석

### 1. 정합성 — resolveWarehouseId 로직 (PASS)

**파일**: `slip-service/.../publish/SlipPublishService.java` (신규 helper, 라인 285–293)

`warehouseId != null && !warehouseId.isBlank()` 분기 후 `UUID.fromString(warehouseId.trim())` 로 파싱하고, 실패 시 `BusinessException(INVALID_INPUT)` 을 던진다. null/blank 이면 `warehouseCodeMapper.resolve(warehouseCode)` 로 폴백한다.

- null 처리: 정확. Java `null` 분기 선처리.
- blank("  ") 처리: 정확. `isBlank()` 가 공백만인 문자열도 잡는다.
- UUID 형식 오류(예: "not-a-uuid"): `IllegalArgumentException` catch → `INVALID_INPUT(400)` 적절.
- 폴백 경로: `warehouseCodeMapper.resolve` 가 이미 null/blank/매핑 누락에 대해 `INVALID_INPUT` 을 던지므로 이중 방어 완비.

**정합성 판정: OK**

---

### 2. 회귀 — fingerprint 에 warehouseId 미포함 (PASS, 설계 의도 확인)

**파일**: `SlipPublishService.java` 라인 553–566 (`computeFingerprint(PublishFromPartnerOrderRequest req)`)

fingerprint canonical 맵에 `warehouseCode` 는 포함되어 있고 `warehouseId` 는 미포함. 스펙 D-WH-02 "fingerprint 는 warehouseCode 기준 유지(warehouseId 미포함)가 의도" 와 일치한다.

**재시도 시나리오 분석**:
- idempotencyKey 는 partner-order-service 에서 SHA-256(orderId + lineId:convertedBefore:qty) 로 결정적 생성.
- 동일 주문/라인/수량 재시도 시 idempotencyKey 가 같고 fingerprint(warehouseCode 기반) 도 같으므로 slip-service 가 `assertReplayOrConflict` 에서 기존 slip 을 그대로 반환(200).
- 즉 "같은 idempotencyKey 재시도 시 warehouseId 만 달라질 수 있는가?" → **실제로는 불가능**. warehouseCode 가 동일하면 inventoryClient.resolveWarehouseIdByCode 가 동일 UUID 를 반환하므로, warehouseId 가 달라지는 경우는 inventory DB 창고 UUID 가 도중 교체된 극히 예외적 상황뿐. 그 경우에도 slip 은 이미 SENT(불변)이므로 재시도 replay 는 기존 slip 을 반환할 뿐 데이터 오염 없다.

**회귀 판정: OK (설계 의도대로 안전)**

---

### 3. UUID 비공개 (PASS)

`PublishSlipResponse` 는 `slipId(UUID)` 를 포함하지만 이는 호출자(partner-order-service 내부)가 후속 조회에 사용하는 값으로, 사용자 화면에 직접 노출되지 않는다. `SlipServiceClient.extractSlipNo` 가 `slipNo` 만 추출하여 `ConvertResultResponse` 에 담아 FE 로 반환하므로 warehouseId/slipId UUID 가 사용자 응답에 노출되지 않는다.

`SlipResponse` DTO 에 `sourceWarehouseId(UUID)` 필드가 존재하나, 주석에 "내부 API 전용" 으로 명시되어 있고 본 슬라이스가 해당 DTO 를 변경하지 않으므로 신규 노출 없다.

**UUID 비공개 판정: OK**

---

### 4. 경계/예외 — warehouseId 형식 오류 (PASS)

`resolveWarehouseId` 의 `INVALID_INPUT(400)` 경로는 적절하다. partner-order-service 는 항상 `warehouseId.toString()` (java.util.UUID) 을 전달하므로 실전에서 형식 오류는 발생하지 않는다. 방어적 구현으로서의 의미가 있다.

`@Size(max = 36)` 제약이 `PublishFromPartnerOrderRequest.warehouseId` 에 붙어 있어 Bean Validation 레이어에서도 초과 시 400 처리된다. UUID 표준 길이(36)로 정확한 상한이다.

**경계/예외 판정: OK**

---

### 5. 테스트 품질

#### SlipPublishWarehouseIdIT (2케이스)

**케이스 1 — warehouseId payload 존재 → yml 미경유 (PASS)**

- `INVENTORY_WAREHOUSE_ID = "11111111-1111-1111-1111-000000000001"` 과 yml 맵 값 `"11111111-1111-1111-1111-111111111111"` 이 **의도적으로 다르다** (상수 주석 확인). 두 값이 다르므로 yml 폴백이 개입했는지 여부를 DB 단언으로 명확히 구분할 수 있다.
- `slipRepository.findBySlipNo(slipNo)` → `saved.getSourceWarehouseId()` 단언: 실 Postgres row 를 직접 읽는 것으로 충분한 검증.

**케이스 2 — warehouseId 없음 → yml 폴백 (PASS)**

- `TestPropertySource` 로 `app.publish.warehouse-code-map.WH-001=11111111-1111-1111-1111-111111111111` 주입.
- payload 에 warehouseId 를 넣지 않고 DB 단언으로 `"11111111-1111-1111-1111-111111111111"` 확인. 정확히 폴백 경로를 검증한다.

**외부 client @MockBean 격리 (PASS)**

`ProductClient / InventoryClient / PartnerInternalClient / UserInternalClient / WarehouseInternalClient` 전부 `@MockBean` 선언, `lenient()` stub 제공. `feedback_it_mockbean_external_clients` 가드 준수.

**Docker skip (PASS)**

`AbstractPostgresIT.DockerAvailableCondition` 상속으로 Docker 미가용 시 자동 skip. skipped=0 이 아닌 "Docker 없으면 skip" 이며, 이는 기존 IT 패턴과 동일한 정책이다.

---

#### PartnerOrderConvertIT case6 captor 단언 (조건부 PASS)

**추가된 단언 (라인 446–448)**:
```java
assertThat(capturedPayload.get("warehouseId"))
        .isEqualTo("00000000-0000-0000-0000-000000000001");
assertThat(capturedPayload.get("warehouseCode")).isEqualTo("WH-001");
```

stub(`BeforeEach`) 에서 `inventoryClient.resolveWarehouseIdByCode(anyString())` 가 `UUID.fromString("00000000-0000-0000-0000-000000000001")` 을 반환하므로 단언값이 정확히 일치한다.

---

### [P1] PartnerOrderConvertIT — 멱등 재시도 경로에서 warehouseId 단언 미검증

**파일**: `partner-order-service/src/test/.../PartnerOrderConvertIT.java`

**문제**: case6 는 단일 convert 호출에 대한 payload captor 검증이다. 슬라이스 C 의 핵심 보장 중 하나는 "convertKey 결정적 + slip replay 시 기존 slip 반환"이지만, 동일 요청을 2회 전송했을 때 2차 호출의 `warehouseId` 가 payload 에 포함되어 전달되는지, 그리고 slip-service 가 idempotency replay 를 정상 처리하는지는 IT 에서 검증되지 않는다.

기존 case7 이 "2회 연속 부분전환 → idempotencyKey 상이" 를 검증하나, 이는 다른 수량(3+4)에 대한 케이스이고 "완전히 같은 본문 2회 재시도 → replay" 경로는 별도 케이스가 없다.

**위험 수준**: 이 경로는 `SlipServiceClient` 가 `@MockBean` 이므로 실 slip-service replay 동작을 검증하지 않는다. 단위 수준에서는 허용 가능하지만, warehouseId 가 2차 호출 payload 에 누락될 경우 실 slip-service 가 fingerprint 불일치(CONFLICT 409)를 던질 수 있다.

**제안**: case6 또는 별도 case 로 동일 본문 2회 호출 → `slipServiceClient.publishFromPartnerOrder` 가 2회 모두 동일 warehouseId 를 담아 호출되는지 captor 로 단언 추가. (단, SlipServiceClient @MockBean 환경에서 replay 자체는 mock 으로 stub 되므로 "payload 에 warehouseId 포함" 여부만 2차 호출에서 확인하면 충분.)

---

### [P2-1] SlipPublishWarehouseIdIT — blank warehouseId("  ") 입력 시 400 반환 케이스 미검증

**파일**: `SlipPublishWarehouseIdIT.java`

두 케이스(있음/없음)는 정상 경로만 검증한다. `warehouseId = "  "` (공백만) 를 전달했을 때 `resolveWarehouseId` 가 폴백 경로(isBlank → yml resolve)를 타는지, 즉 blank 와 null 이 동일하게 처리되는지를 검증하는 케이스가 없다. 구현은 올바르나 테스트로 못 잡힌 edge 이다.

**제안**: `warehouseId_blank_fallsBackToYml` 케이스 추가 (warehouseId = "  " 전달 → yml 값으로 sourceWarehouseId 단언).

---

### [P2-2] PublishSlipResponse.slipId — 내부 UUID 노출 주석 보완 필요

**파일**: `slip-service/.../publish/PublishSlipResponse.java` (기존 파일, 본 슬라이스 미수정)

`slipId(UUID)` 필드가 내부 호출자(partner-order-service SlipServiceClient) 에게 노출되나, `SlipServiceClient.extractSlipNo` 가 `slipNo` 만 추출하여 UUID 가 FE 로 전달되지 않는다. 그러나 이 DTO 자체에 "slipId 는 내부 전용, FE 미전달" 명시가 없다. `SlipResponse` 처럼 UUID 비공개 가드 주석을 추가하면 후임 개발자가 slipId 를 FE 응답에 잘못 포함하는 실수를 방지할 수 있다.

**제안**: `PublishSlipResponse` Javadoc 에 "slipId 는 서비스 간 내부 후속 조회용 — FE 직접 노출 금지" 주석 한 줄 추가. (본 슬라이스 변경 범위 외이므로 후속 PR 에서 처리 가능.)

---

### [P2-3] @Size(max = 36) vs @Pattern(uuid) — 표현력 약함

**파일**: `PublishFromPartnerOrderRequest.java` 라인 34

`@Size(max = 36) String warehouseId` 는 "최대 36자" 만 보장하고 UUID 형식을 강제하지 않는다. Bean Validation 단계에서 형식 오류를 잡으려면 `@Pattern(regexp = "^[0-9a-fA-F\\-]{36}$")` 또는 `@UUID` (hibernate-validator 6.2+) 를 추가하는 것이 더 명확하다. 단, 현재 구현에서 `resolveWarehouseId` 가 `UUID.fromString` 파싱 실패 시 `INVALID_INPUT` 을 던지므로 실질적 방어는 완비되어 있다.

**제안**: 후속 PR 에서 `@Pattern` 또는 `@UUID` 어노테이션으로 표현력 강화.

---

## 도메인 메서드 컨벤션 / 한국어 Javadoc

- `resolveWarehouseId` helper 에 한국어 Javadoc 완비 (@param / @return / @throws 포함). 컨벤션 준수.
- `PublishFromPartnerOrderRequest` Javadoc 에 `warehouseId` 필드 설명 추가됨. 적절.
- `PartnerOrderConvertService` 기존 Javadoc 에 step 4 설명(warehouseCode → warehouseId 역조회) 은 이미 반영되어 있었음. 신규 변경(payload.put) 은 inline 주석으로 설명. 허용.
- 도메인 메서드 직접 호출(reflection/setter) 없음. `line.convert()`, `order.markConvertedIfComplete()` 정상 도메인 메서드 경유. 컨벤션 준수.

---

## 종합 판정

**결론: APPROVE**

P0 결함 없음. 설계 스펙(D-WH-02) 과 구현이 정확히 일치하고, resolveWarehouseId 의 null/blank/형식오류 처리, fingerprint 안정성, UUID 비공개 모두 적절하다. SlipPublishWarehouseIdIT 의 2케이스가 두 경로를 DB 수준에서 구분 검증한다.

P1(1건) — PartnerOrderConvertIT 에 동일 본문 2차 재시도 warehouseId 포함 단언이 없다. 블로커는 아니나 재시도 경로의 payload 정합을 추가로 보장하는 케이스 보완을 권고한다.

P2(3건) — 테스트 edge case 보완, UUID 노출 주석, Bean Validation 표현력 개선. 모두 후속 PR 처리 가능.
