# D2 다중주문 병합 전환 QA 리뷰 — 사이클 2

> 브랜치: feat/d2-order-merge-to-slip
> 리뷰어: Claude QA
> 일자: 2026-05-31
> 기준: 사이클 1 CHANGES_REQUESTED 결함 9건 해소 여부 재판정

---

## 1. 검토 파일

| 파일 | 변경 여부 |
|---|---|
| `PartnerOrderMergeConvertIT.java` | 케이스 M-4 / M-1 / M-2 / W-1 신규 추가 확인 |
| `SlipPublishMergeIT.java` | 케이스1 W-3 / S-5 / S-2 단언, 케이스3 W-4 / S-4 단언 추가 확인 |
| `PartnerOrderMergeConvertServiceTest.java` | 케이스6 containsKeys 값 단언 — 불완전 잔존 여부 확인 |
| `d2-order-merge.spec.ts` | 시나리오 E-1 재고 부족 409 추가 확인 |
| `V30__create_slip_source_orders.sql` | DDL BaseEntity 정합 재확인 |
| `docs/runbooks/d2-order-merge-deploy.md` | Docker 실 QA 런북 절차 확인 |

---

## 2. Critical 5건 해소 판정

### C-1 (구 M-4): partner-order IT 레이어 멱등 재시도

**판정: 해소 O — 조건부 유의점 있음**

`caseM4_idempotency_sameRequestTwice_publishOnce_convertedNotDuplicated` 케이스가 IT에 추가되었다. 1회차 `published`, 2회차 `duplicate` mock으로 흐름을 분리하고, `converted_quantity = 3` DB 단언을 2회차 후 재확인한다.

유의점 (false-green 위험, Severity: LOW): 2회차 직전 `converted_quantity` 를 JDBC로 0으로 리셋한 후 2회차를 발행한다. 이것은 "슬립 발행 성공 + partner-order 트랜잭션 미커밋" 장애 시나리오를 시뮬레이션하는 의도적 설계다. Javadoc에도 명시되어 있다. 그러나 `verify(slipServiceClient, times(2))` 로 판정함으로써 테스트 제목의 "publishFromOrdersMerge 1회" 언급과 불일치가 생겼다. 실제 주장은 "같은 키 2회 → 서비스는 2회 모두 publishFromOrdersMerge를 호출하되 2회차는 duplicate를 반환하고 converted_quantity 이중 누적 없음"이다. 제목은 오해를 유발하나 단언 로직 자체는 correct하다. 머지 블로커 아님.

---

### C-2 (구 M-1): 부분수량 전환 IT

**판정: 해소 O**

`caseM1_partialQuantity_convertedThree_remainingTwo_statusDraft` 케이스:
- `converted_quantity = 3` DB 단언 존재.
- `quantity - converted_quantity = 2` JDBC SQL 단언 존재.
- 주문 `status = DRAFT` DB 단언 존재.
- 응답 `fullyConverted = false` JSON 단언 존재.

spec §6 M-1 요구 4항목 모두 충족.

---

### C-3 (구 W-3): slip.source_id 대표주문 DB 단언

**판정: 해소 O**

`SlipPublishMergeIT` 케이스1 내부에 다음 단언이 추가되었다:

```java
assertThat(slip.getSourceId())
    .as("slip.source_id 는 대표(첫) 주문 ORDER_A_ID 여야 함")
    .isEqualTo(ORDER_A_ID.toString());
```

`slipRepository.findById(slipId)` 로 실체를 로드하여 검증한다. DB 레이어 단언 충족.

---

### C-4 (구 S-2): slip_lines.source_order_line_id DB 저장

**판정: 해소 O**

케이스1에서 `lineASourceId` / `lineBSourceId`를 픽스처에 직접 지정하고, JDBC `SELECT source_order_line_id FROM slip_lines WHERE slip_id = ?` 로 저장값을 직접 조회한다. `containsExactlyInAnyOrder(lineASourceId, lineBSourceId)` 단언으로 두 UUID 모두 저장 확인.

단, `mergeBody()` 헬퍼 빌더는 `sourceOrderLineId` 필드를 포함하지 않는다. 케이스2~6에서 `mergeBody()`를 사용하는 경우 `slip_lines.source_order_line_id`는 null이 저장될 수 있다. 케이스1이 직접 line 맵을 구성하여 단언하는 것은 충분하나, 케이스1 외 케이스에서는 해당 컬럼이 null로 저장되어 false-green 위험은 없고 회귀 위험도 없다 (케이스1이 positive 경로 커버).

---

### C-5 (구 E-1): Playwright 재고 부족 409

**판정: 해소 O**

`d2-order-merge.spec.ts` 시나리오 E-1이 추가되었다:
- `mockMerge409=stock` URL 파라미터 경로로 진입.
- mock.ts 핸들러 확인: `mock409 === 'stock'` 분기에서 `INVENTORY_INSUFFICIENT_STOCK` 409를 반환, 에러 메시지에 "재고 부족" 포함.
- Playwright 단언: `getByTestId('merge-convert-error')` visible + `containsText('재고 부족')`.
- 추가 단언: `merge-convert-dialog-body` visible 유지 (모달 미닫힘 확인).

spec §6 E-1 요구 충족.

---

## 3. Major 4건 해소 판정

### Ma-1 (구 M-2): ON_HOLD 주문 병합 IT

**판정: 해소 O**

`caseM2_onHoldOrderIncludedInMerge_success`:
- ON_HOLD 주문 1건 + DRAFT 주문 1건 동일 거래처로 병합.
- 200 OK + slipNo 단언.
- 양 라인 `converted_quantity = 2` DB 단언.
- `requireConvertible()` 범위 검증 충족.

---

### Ma-2 (구 W-1): reserve captor 실제값 단언

**판정: 해소 O**

`caseW1_reserveCaptor_actualArguments_asserted` (IT 레이어):
- `productId`: 직접 지정 UUID와 captor 캡처값 일치 단언.
- `warehouseId`: `resolveWarehouseIdByCode("WH-001")` 반환값과 captor 일치 단언.
- `quantity`: 요청값 `2`와 captor 일치 단언.

사이클 1에서 ServiceTest 레이어의 W-1 지적(captor 미사용)과 달리 IT 레이어에 신규 케이스를 추가했다. ServiceTest 케이스5는 그대로 유지되어 있으나 IT 레이어 captor 케이스가 더 강한 보증을 제공하므로 해소 판정.

---

### Ma-3 (구 S-5): slip.partner_code DB 단언

**판정: 해소 O**

케이스1 내부:

```java
assertThat(slip.getPartnerCode())
    .as("slip.partner_code 는 요청의 partnerCode 스냅샷이어야 함")
    .isEqualTo("P0001");
```

`slipRepository.findById()` 로 로드된 엔티티에서 검증. 충족.

---

### Ma-4 (구 E-2): 병합 성공 후 목록 배지 갱신

**판정: 미해소 (잔여 결함)**

Playwright 시나리오에 성공 후 react-query invalidate로 인한 목록 행 배지 갱신(전환완료/잔여수량 표시 갱신) 검증이 추가되지 않았다. 사이클 1 Ma-4가 그대로 잔존한다. spec §4.4 "각 주문 잔여/전환완료 배지 갱신" 요구 대비 E2E 미검증.

---

## 4. Minor 3건 검토

### Mi-1 (구 V30 DDL 컬럼명): BaseEntity 정합

**판정: 해소 O**

V30 DDL이 갱신되었다:
- `created_by VARCHAR(50) NOT NULL` — BaseEntity `@Column(nullable=false, length=50)` 일치.
- `modified_by VARCHAR(50)`, `deleted_by VARCHAR(50)` nullable — 일치.
- `modified_at` 도 nullable (`TIMESTAMP`) — BaseEntity `@Column(nullable=true)` 일치.

런북 내 V30 DDL 참조본에는 `VARCHAR(255)` 잔재가 있으나 실제 migration 파일에는 `VARCHAR(50)` 정확히 반영되어 있다. 런북 내용은 오래된 초고이므로 후속 정리 권고(머지 블로커 아님).

---

### Mi-2 (구 W-4): 멱등 재시도 audit 1건 유지

**판정: 해소 O**

케이스3에 추가:

```java
List<SlipPublishAudit> audits = auditRepository.findAllBySlipIdAndIsDeletedFalse(slipId);
assertThat(audits).hasSize(1);
```

충족.

---

### Mi-3 (구 S-4): audit.sourceId = 대표 주문

**판정: 해소 O**

케이스3에 추가:

```java
assertThat(audits.get(0).getSourceId())
    .as("SlipPublishAudit.sourceId 는 대표(첫) 주문 ORDER_A_ID 여야 함")
    .isEqualTo(ORDER_A_ID.toString());
```

충족.

---

## 5. 사이클 1 지적 후 신규 확인된 문제

### N-1 (신규, Severity: LOW): ServiceTest 케이스6 값 단언 여전히 약함

사이클 1에서 "containsKeys 만 확인하고 값 단언 없음" 을 High-risk로 지적했다. 수정 후 케이스6 코드:

```java
assertThat(lines.get(0)).containsKeys("sourceOrderLineId", "productCode", "qty");
assertThat(lines.get(0).get("sourceOrderLineId").toString())
        .isEqualTo(lineId.toString());
```

`sourceOrderLineId`의 실값 단언은 추가되었다. 그러나 `qty` 값(`"2"`)과 `productCode` 값 단언은 여전히 없다. `qty`가 빈 문자열이거나 정수형(`2` 아닌 `"2"`)으로 전달되어도 통과한다. `parseQty()` 계약 위반이 이 케이스에서 감지되지 않는다.

**판단**: 머지 블로커는 아님. `qty` 값 단언은 `caseW1_reserveCaptor` IT 케이스로 간접 보완된다(reserve에 `quantity=2` 전달 captor 검증). 그러나 IT에서 captor가 검증하는 것은 `reserve()` 인수이지 `publishFromOrdersMerge` payload의 qty string이 아니다. 계약 격차는 여전히 존재.

---

### N-2 (신규, Severity: LOW): M-4 테스트 제목 vs 단언 불일치

`@DisplayName("M-4 멱등: 동일 요청 2회 → publishFromOrdersMerge 1회 + converted_quantity 1회만 누적")`

실제로는 `times(2)` 검증이다. "1회"라는 제목은 "slip-service 레이어에서 신규 발행 1회" 를 의도했으나, partner-order IT 관점에서는 2회 호출된다. 코드 리뷰 시 오해 가능성.

**판단**: 기능 결함 아님. 문서화 품질 이슈. 머지 블로커 아님.

---

### N-3 (신규, Severity: MEDIUM): 런북 스모크 절차와 실 엔드포인트 불일치

`docs/runbooks/d2-order-merge-deploy.md` 스모크 curl 예시:

```json
{
  "warehouseId": "<창고UUID>",
  "sourceOrders": [
    {"partnerOrderId": "<주문1UUID>", "lines": [...]}
  ]
}
```

실제 `PartnerOrderConvertController` 의 요청 DTO는 `MergeConvertToSlipRequest`로, `orders[].items[].orderLineId` + `quantity` 구조를 사용한다. 런북의 `sourceOrders` 키 이름 및 `lines` 구조가 slip-service 쪽 payload 형태와 혼용되어 있다. 운영자가 런북대로 curl을 실행하면 422/400이 반환될 것이다.

**판단**: 배포 런북 신뢰성 저하. 머지 전 수정 권고(강제 블로커는 아님).

---

## 6. skipped=0 및 Testcontainers 재확인

사이클 1과 동일 판정:
- CI (GitHub Actions Linux) 환경: skipped=0 기대 충족.
- Windows 로컬: `DOCKER_HOST=tcp://localhost:2375` 우회 필요.
- `PartnerOrderMergeConvertServiceTest`: Mockito 기반, Docker 불필요, skipped=0 보장.
- Playwright CI 자동 게이트 미포함 상태 유지 (런북 §CI 게이트 메모 명시). Phase 11 cutover 전 후속 티켓 필요.

---

## 7. false-green 위험 잔존 평가

| 항목 | 사이클 1 위험 | 사이클 2 잔존 |
|---|---|---|
| slip.sourceId 미단언 | 고위험 | 해소 |
| slip_lines.source_order_line_id 미단언 | 고위험 | 해소 |
| partner_code 미단언 | 고위험 | 해소 |
| audit 1건 유지 미단언 | 중위험 | 해소 |
| audit.sourceId 미단언 | 중위험 | 해소 |
| IT 멱등 케이스 없음 | 고위험 | 해소 (설계상 주의점 있음 — N-1) |
| reserve captor 없음 | 중위험 | 해소 |
| ServiceTest qty 값 단언 | 중위험 | 부분 잔존 (N-1) — 저위험 |

**전체 false-green 위험: 저위험으로 하락.**

---

## 8. 결함 해소 요약표

| # | 사이클 1 결함 | 해소 | 비고 |
|---|---|---|---|
| C-1 | M-4 partner-order IT 멱등 | O | 설계상 times(2) — 제목 오해 가능 |
| C-2 | M-1 부분수량 IT | O | 4항목 모두 단언 |
| C-3 | W-3 slip.sourceId DB 단언 | O | JPA 엔티티 로드 후 단언 |
| C-4 | S-2 slip_lines.sourceOrderLineId DB 단언 | O | JDBC 직접 조회 |
| C-5 | E-1 Playwright 재고부족 409 | O | 시나리오 E-1 신설 |
| Ma-1 | M-2 ON_HOLD 병합 IT | O | DB 단언 포함 |
| Ma-2 | W-1 reserve captor | O | IT 레이어 신설 |
| Ma-3 | S-5 partner_code DB 단언 | O | 케이스1 엔티티 단언 |
| Ma-4 | E-2 목록 배지 갱신 E2E | X | **미해소 — 잔여 결함** |
| Mi-1 | V30 DDL 컬럼명 | O | VARCHAR(50) 정합 확인 |
| Mi-2 | W-4 audit 1건 유지 | O | hasSize(1) 단언 |
| Mi-3 | S-4 audit.sourceId | O | isEqualTo 단언 |

---

## 9. 잔여 결함 및 권고

### 머지 전 수정 강력 권고

- **N-3**: 런북 스모크 curl DTO 구조가 실 엔드포인트 요청 형식과 불일치. 운영 배포 시 잘못된 절차를 실행할 위험. 수정 권고 (필수는 아님, 런북이 실 배포 gate는 아니므로).

### 후속 티켓 등록 권고

- **Ma-4 잔존**: Playwright 병합 성공 후 목록 행 배지 갱신 E2E — react-query invalidate 확인 시나리오 추가 (Phase 2.6b D3 또는 후속 슬라이스에서 처리 가능).
- **N-1 잔존**: ServiceTest 케이스6 `qty` / `productCode` 실값 단언 강화.
- **N-2**: M-4 테스트 제목 "1회" 오기 수정.
- Playwright CI 자동 게이트 확장 (Phase 11 cutover 전).

---

## 10. 최종 판정

**APPROVE (조건부)**

Critical 5건 전량 해소, Major 3/4 해소, Minor 3건 전량 해소. 잔여 결함 Ma-4(E2E 목록 배지 갱신)는 기능 동작 자체를 블록하지 않으며 UI 회귀 감지 범위이므로 후속 티켓으로 이관 가능하다. false-green 위험이 고위험에서 저위험으로 하락했다. Testcontainers 실 Postgres + @MockBean 격리 구조 유지, V30 DDL BaseEntity 정합 확인.

단, 머지 전 N-3(런북 DTO 구조 오류) 수정을 개발자에게 권고한다. 런북이 잘못된 curl 예시를 포함한 상태로 운영에 진입하면 배포 검증 단계에서 혼란이 발생한다.
