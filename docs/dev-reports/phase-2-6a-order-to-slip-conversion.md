# dev-report — 주문(Partner-Order) → 출고전표(Slip) 부분전환 인프라 (Phase 2.6a)

> 슬라이스: `feat/phase-2-6-order-to-slip-conversion`
> spec: `docs/superpowers/specs/2026-05-30-order-to-slip-conversion-design.md`
> 사이클 N=2 완료(APPROVE, 차단 결함 0). 사이클 1 HEAD `0c79ef4d`, 사이클 2 HEAD `30b2c6d7`.
> 분리: **본 슬라이스 = 2.6a(부분전환 인프라)**. 2.6b(병합+confirm 자동발행 폐지) · 2.6c(재고·회계 정합+outbox) 는 후속 PR.

---

## 1. 개요 / 목적

거래처 주문서를 출고전표로 전환하는 현행 경로는 `PartnerOrderConfirmService.confirm` → slip-service 자동 1:1 발행 하나뿐이다. 이 경로는 주문 전체 라인을 한 번에 발행하며, 중간 부분 전환이 불가능했다.

본 슬라이스는:

- **라인별 전환수량 추적** (`converted_quantity` V8 migration): 주문 라인에 전환된 누적 수량 컬럼 추가. 잔여 = `quantity - converted_quantity`.
- **단일 주문 부분전환 API** (`POST /api/v1/partner-orders/{id}/convert-to-slip`): 선택 라인 + 수량을 지정하여 slip을 발행하고 converted_quantity를 누적한다.
- **SlipLine 역추적** (`source_order_line_id` V29 migration): slip-service 의 `slip_lines` 에 출처 주문 라인 UUID 를 기록하여 어느 주문 라인에서 온 전표 라인인지 역추적 가능.
- **CONVERTED 상태**: 모든 라인이 전량 전환되면 주문 status 를 `CONVERTED` 로 전환.
- **FE 부분전환 모달**: 전환 버튼 + 수량 입력 + 비가역 경고 + CONVERTED 별색 뱃지 + 전환됨/잔여 컬럼.
- **권한**: `sales.partner-order.convert` CREATE action (auth-service V41 시드).

기존 confirm 자동 1:1 발행(outbox 패턴)은 건드리지 않는다.

---

## 2. 전환 대상 (화이트리스트 설계)

전환 가능 주문 = `requireConvertible()` 화이트리스트를 통과한 주문.

| 조건 | 허용 여부 | 근거 |
|---|---|---|
| `status = DRAFT` + `slipNo = null` | 허용 | 견적 전환 주문이 주 대상. 출고전표 없음. |
| `status = ON_HOLD` + `slipNo = null` | 허용 | 보류 주문도 전환 가능(Phase 2.5 보류 가드 확대와 일관). |
| `status = CONFIRMED` | **차단(409)** | confirm 흐름에서 이미 slip 발행된 경우 또는 PENDING_RETRY(outbox 재발행 대기). 이중 출고전표 방지. |
| `status = CONFIRMED` + `slipNo = null` (PENDING_RETRY) | **차단(409)** | outbox 재발행 대기 중 → convert 이중발행 차단. |
| `status = CONVERTED` | **차단(409)** | 전량 전환 완료. 추가 전환 불가(화이트리스트에 없으므로 자동 차단). |
| `status = CONFIRMING` / `CANCELED` | **차단(409)** | 전환 대상 아님. |

CONFIRMED 및 PENDING_RETRY 주문을 전환 대상에서 제외하는 이유: confirm 경로의 outbox 재발행과 convert 경로가 동시에 동작하면 같은 주문에 출고전표가 2개 생성될 수 있다. 화이트리스트(DRAFT/ON_HOLD만 허용)가 이 경우를 원천 차단한다.

---

## 3. 데이터 모델 변경

### 3.1 partner-order-service V8 — `converted_quantity` (partner_order_lines)

```sql
-- V8__add_partner_order_line_converted_quantity.sql
ALTER TABLE partner_order_lines
    ADD COLUMN converted_quantity INT NOT NULL DEFAULT 0;

COMMENT ON COLUMN partner_order_lines.converted_quantity
    IS '출고전표로 전환된 누적 수량 (부분전환, Phase 2.6a)';

ALTER TABLE partner_order_lines
    ADD CONSTRAINT chk_converted_quantity_range
        CHECK (converted_quantity >= 0 AND converted_quantity <= quantity);
```

- `NOT NULL DEFAULT 0`: 기존 레거시 행 호환 — 마이그레이션 즉시 적용, null 없음.
- `CHECK (0 ≤ converted_quantity ≤ quantity)`: DB 레벨 이중 안전망. JPA 도메인 레벨 검증과 이중 보호.

### 3.2 slip-service V29 — `source_order_line_id` (slip_lines)

```sql
-- V29__add_slip_line_source_order_line.sql
ALTER TABLE slip_lines
    ADD COLUMN source_order_line_id UUID;

COMMENT ON COLUMN slip_lines.source_order_line_id
    IS '출처 주문 라인 ID (partner-order 부분전환 추적, nullable)';
```

- **nullable**: 기존 슬립 라인(비 부분전환 경로) 회귀 없음. 부분전환 경로에서만 채워진다.
- V29 번호: slip-service 기존 V28(estimate_revisions) 다음 순번. spec 초안의 "V10" 오기는 사이클 1 P0-2에서 수정됨.

### 3.3 PartnerOrderLine 도메인 메서드 (V8 추가 필드 연계)

| 메서드 | 역할 |
|---|---|
| `remainingQuantity()` | `quantity - convertedQuantity` 잔여 수량 반환 |
| `isFullyConverted()` | `convertedQuantity >= quantity` 전량 전환 여부 |
| `convert(int qty)` | 잔여 초과 또는 비양수 시 409. 발행 성공 후에만 호출(트랜잭션 정합 핵심) |

---

## 4. 전환 API + 도메인 설계

### 4.1 REST endpoint

| Method | Path | 권한 |
|---|---|---|
| `POST` | `/api/v1/partner-orders/{id}/convert-to-slip` | `sales.partner-order.convert` CREATE |

요청 본문:

```json
{
  "items": [
    { "orderLineId": "<UUID>", "quantity": 2 }
  ],
  "warehouseCode": "WH-001"
}
```

응답: `ApiResponse<ConvertResultResponse>` — `{ slipNo, status, fullyConverted }`.

### 4.2 `PartnerOrderConvertService.convert` — 처리 순서

1. **사전검증 단계** — `requireConvertible()` (DRAFT/ON_HOLD 화이트리스트) + 라인 UUID 매핑 + 잔여수량 검증. `convert()` 미호출 (converted 누적 없이 검증만).
2. **idempotencyKey 생성** — `PO-CONV-{orderId}-{SHA-256[:16]}`. SHA-256 입력: `orderId + 정렬된 "lineId:convertedBefore:qty"`. `convertedBefore` = 발행 직전 convertedQuantity 스냅샷.
3. **slip-service REST 발행** — 선택 라인 + 수량 + sourceOrderLineId 포함 페이로드 전송.
4. **발행 성공 후 `convert()` 호출** — 슬립 발행 성공(200 또는 409-duplicate)을 확인한 뒤에만 `PartnerOrderLine.convert(qty)` 호출. 트랜잭션 정합 핵심.
5. **`markConvertedIfComplete()`** — 모든 라인 `isFullyConverted()` 시 주문 status → CONVERTED.
6. **`saveAndFlush(order)`** — DB 영속화.

### 4.3 `requireConvertible()` 화이트리스트 가드

```java
// PartnerOrder.java
public void requireConvertible() {
    if (this.status != PartnerOrderStatus.DRAFT
            && this.status != PartnerOrderStatus.ON_HOLD) {
        throw new ResponseStatusException(
                HttpStatus.CONFLICT,
                "DRAFT 또는 ON_HOLD 주문만 출고전표로 전환할 수 있습니다. 현재 상태: " + this.status);
    }
}
```

화이트리스트 방식(CONFIRMED/PENDING_RETRY/CONVERTED/CONFIRMING/CANCELED 전부 차단)을 채택하여 이중발행을 원천 차단한다.

### 4.4 `markConvertedIfComplete()`

```java
public void markConvertedIfComplete() {
    boolean allConverted = this.lines.stream().allMatch(PartnerOrderLine::isFullyConverted);
    if (allConverted) {
        this.status = PartnerOrderStatus.CONVERTED;
    }
}
```

---

## 5. 트랜잭션 경계 설계 + 잔여 위험

### 5.1 설계 원칙

전환 흐름은 **사전검증 → 발행 → 발행성공 후 converted 누적 + save** 순서를 엄수한다.

```
@Transactional
convert(id, req) {
    // 1. 사전검증 (converted 미반영)
    order.requireConvertible();
    validatedItems = validateItems(req.items);   // 잔여수량 검증만, convert() 미호출

    // 2. idempotencyKey
    key = buildIdempotencyKey(order.getId(), validatedItems, lineMap);

    // 3. slip 발행 (외부 REST)
    result = slipServiceClient.publishFromPartnerOrder(payload, key);
    // 5xx → BusinessException → 트랜잭션 롤백 → converted 미반영 → 재시도 가능

    // 4. 발행 성공 후에만 converted 누적
    for item in validatedItems:
        lineMap[item.orderLineId].convert(item.quantity);

    // 5. 전환완료 판정 + save
    order.markConvertedIfComplete();
    orderRepository.saveAndFlush(order);
}
```

slip 발행(외부 REST)이 `@Transactional` 내부에 있지만, `convert()` 호출은 발행 성공 확인 후에 수행하므로:
- slip 5xx → `BusinessException` → 트랜잭션 롤백 → `converted_quantity` 미변경 → 정합.
- slip 200/409-dup → `convert()` 호출 → `saveAndFlush` → 정합.

### 5.2 잔여 위험 (운영 인지 필수)

**slip 발행 성공 후 `saveAndFlush` 실패 시 `converted_quantity` 롤백 발생.** 이 경우 슬립은 slip-service DB에 존재하지만 partner-order DB의 `converted_quantity` 는 0으로 남는다. 동일한 분산 트랜잭션 한계는 confirm 흐름(outbox 패턴)에서도 존재한다.

idempotencyKey 설계로 인해 동일 라인 동일 수량 재요청 시 `convertedBefore` 스냅샷이 0 으로 같아 slip-service 에서 409-duplicate 를 반환하므로 **slip 중복발행은 없다**. `converted_quantity` 보정만 수동으로 필요.

근본적 해결은 **2.6c 단계의 outbox 패턴 통합**에서 처리한다. 본 슬라이스에서는 운영 로그에 `orderId` + `slipNo` 를 남겨 수동 복구를 지원한다.

---

## 6. idempotencyKey 설계

키 형식: `PO-CONV-{orderId}-{SHA-256 hex 앞 16자}` (총 약 61자, 길이 80 이내).

SHA-256 입력 문자열: `{orderId}-{정렬된 lineId:convertedBefore:qty}` 콤마 결합.

`convertedBefore` (발행 직전 `convertedQuantity` 스냅샷) 를 포함함으로써:

| 시나리오 | 결과 |
|---|---|
| 같은 라인 같은 수량 1차 전환 후 2차 전환 | `convertedBefore` 가 달라져 다른 키 생성 → slip-service 신규 발행 → 정상 2차 부분전환 |
| 같은 요청 동일 트랜잭션 재시도(아직 converted 미반영) | `convertedBefore` 동일 → 동일 키 → slip-service 409-dup → 이중 slip 발행 차단 |
| 네트워크 오류로 클라이언트 재요청(saveAndFlush 실패 포함) | `convertedBefore` 동일 → 동일 키 → 409-dup → 안전 |

---

## 7. 프론트엔드 (Desktop — SalesPartnerOrderDetailPage.tsx)

### 7.1 전환 버튼 표시 조건 (화이트리스트 적용)

| 주문 status | 전환 버튼 | 근거 |
|---|---|---|
| DRAFT | 표시 | 주 전환 대상 |
| ON_HOLD | 표시 | 보류 주문도 전환 가능 |
| CONFIRMED / PENDING_RETRY | 미표시 | 이중발행 차단 (`linkedSlipNo !== null` 또는 status 검사) |
| CONVERTED | 미표시 (전환완료 배지 표시) | 전량 전환 완료 |
| CONFIRMING / CANCELED | 미표시 | |

`linkedSlipNo` 필드명: BE `PartnerOrderDetailResponse` 의 `linkedSlipNo` 필드를 사용. FE 필드명 불일치 시 모든 주문에 전환 버튼이 표시되는 버그가 발생하므로 필드명 일치를 사이클 1에서 확인 완료(버그 아님).

### 7.2 비가역 경고 모달

전환 버튼 클릭 시 모달 진입. 수량 입력 후 전환 시도 전에 경고 문구를 표시한다:

> "전환된 수량은 되돌릴 수 없습니다. 출고전표가 생성됩니다. 계속하시겠습니까?"

### 7.3 CONVERTED 별색 뱃지

`PartnerOrderStatus.CONVERTED` 는 CONFIRMED(완료, 녹색)와 구분되는 별색(청자색 계열)으로 표시한다. CONFIRMED 와 동일 색상 사용 시 전환완료와 출고전표 확정이 혼동된다 (사이클 1 Designer 지적).

### 7.4 전환됨/잔여 컬럼

주문 라인 목록에 `전환됨(converted_quantity)` / `잔여(remaining_quantity)` 컬럼을 추가하여 부분전환 진행 상황을 표시한다. 잔여 0 행은 opacity 낮춤 처리.

---

## 8. 권한

### 8.1 신규 PageCode

`sales.partner-order.convert` — CREATE action.

### 8.2 auth-service V41 시드

V41 SQL (`V41__seed_partner_order_convert_page.sql`): `account_page_permissions` 에 MASTER / MANAGER / SALES 역할에 대해 `sales.partner-order.convert` CREATE grant 삽입.

V41 은 V39 partial index(`ON CONFLICT`) 패턴을 따른다 — 기존 V39 / V40 과 동일한 upsert 방식으로 삽입하여 중복 실행 안전.

---

## 9. 배포 순서 (필수)

**3개 서비스 Flyway 마이그레이션 의존성이 있다. 배포 순서를 반드시 준수해야 한다.**

```
Step 1. auth-service 배포 (V41 — sales.partner-order.convert page 권한 시드)
        → UP 확인 + V41 seed row 존재 확인
Step 2. slip-service 배포 (V29 — slip_lines.source_order_line_id 컬럼 추가)
        → UP 확인 + V29 컬럼 존재 확인
Step 3. partner-order-service 배포 (V8 — converted_quantity 컬럼 + CHECK 제약 추가)
        → UP 확인 + convert endpoint 동작 확인
```

역순 배포 시 발생하는 문제:

| 잘못된 순서 | 증상 |
|---|---|
| partner-order-service 먼저 (V8) | convert endpoint 호출 시 slip-service 의 `source_order_line_id` 컬럼 없음 → slip-service 500 |
| slip-service 먼저 (V29), auth 없이 | convert endpoint 권한 체크 시 `sales.partner-order.convert` page 미존재 → 403 |
| auth 없이 partner-order 먼저 | 권한 없는 사용자가 convert endpoint 호출 가능(일시적) |

상세 절차: `docs/operational-validation/phase-2-6a-deploy-order.md` 참조.

---

## 10. 테스트

### 10.1 BE 단위 테스트 (4케이스)

| 케이스 | 검증 |
|---|---|
| UT-1 | `convert(qty)` — DRAFT 주문 잔여 내 수량 → `convertedQuantity` 누적 |
| UT-2 | `convert(qty)` — 잔여 초과 → 409 예외 |
| UT-3 | `isFullyConverted()` — 전량 전환 시 true |
| UT-4 | `requireConvertible()` — CONFIRMED 주문 → 409 예외 |

### 10.2 BE 통합 테스트 IT (10케이스, Testcontainers)

`PartnerOrderConvertIT` — 실 PostgreSQL + 실 Flyway. `@MockBean SlipServiceClient` + `@MockBean DynamicPermissionClient` 격리.

| 케이스 | 내용 |
|---|---|
| case1 | DRAFT 주문 전체 라인 전량 전환 → CONVERTED status + slipNo 반환 |
| case2 | DRAFT 주문 부분수량 전환 → converted_quantity 누적, status=DRAFT 유지 |
| case3 | 잔여 초과 수량 요청 → 409 |
| case4 | 존재하지 않는 orderLineId → 409 |
| case5 | CONFIRMED 주문 전환 시도 → 409 (requireConvertible 화이트리스트) |
| case6 | warehouseCode 미제공 → 409 |
| case7 | 1차 부분전환 후 동일 수량 2차 전환 → idempotencyKey 다름(convertedBefore 다름) isNotEqualTo 검증 |
| case8 | CONVERTED 주문 추가 전환 시도 → 409 (화이트리스트 자동 차단) |
| case9 | CONFIRMED 주문(PENDING_RETRY) 전환 시도 → 409 |
| case10 | slip-service 5xx 응답 시 converted_quantity 미반영 확인 (rollback 검증) |

---

## 11. 잔여 위험 — inventory 미차감

**부분전환으로 생성된 출고전표는 재고 차감이 일어나지 않는다.**

현행 inventory 차감은 confirm 흐름(`PartnerOrderConfirmService`) 에서 inventory-service 를 호출하는 경로에만 존재한다. `PartnerOrderConvertService` 에는 inventory 호출이 없다.

이는 **과다출고 위험**을 초래한다. 출고전표가 발행된 상품의 재고가 차감되지 않으면 재고 잔량이 실제보다 많이 표시된다.

**2.6c 단계에서 재고 차감 연동 + outbox 패턴 통합**을 구현할 때까지 본 슬라이스의 부분전환 기능은 **재고 관리를 별도로 수동 처리**해야 한다.

운영 시 주의사항: 부분전환으로 출고전표를 생성한 후 inventory-service 화면에서 수동 출고 처리를 진행할 것.

---

## 12. 후속 슬라이스 (2.6b / 2.6c)

| 슬라이스 | 내용 | 선행 조건 |
|---|---|---|
| **2.6b** 병합 + confirm 폐지 | 거래처 포털 confirm 을 "주문만 생성(slip 미발행)"으로 변경. 다중 주문 병합 API + `slip_source_orders` 테이블 + 헤더 충돌 '/' 병기 UI. | 2.6a 머지 |
| **2.6c** 재고·회계 정합 + outbox | inventory 차감 연동 + 매출 회계 분개 연동 + outbox 패턴(convert 실패 보상) + 전환완료 status + 회귀 전체. | 2.6a + 2.6b 머지 |

---

## 13. 관련 파일

| 파일 | 변경 유형 | 내용 |
|---|---|---|
| `services/partner-order-service/src/main/resources/db/migration/V8__add_partner_order_line_converted_quantity.sql` | 신규 | converted_quantity 컬럼 + CHECK 제약 |
| `services/slip-service/src/main/resources/db/migration/V29__add_slip_line_source_order_line.sql` | 신규 | source_order_line_id 컬럼 |
| `services/auth-service/src/main/resources/db/migration/V41__seed_partner_order_convert_page.sql` | 신규 | sales.partner-order.convert CREATE 권한 시드 |
| `domain/PartnerOrderLine.java` | 수정 | convertedQuantity 필드 + convert/remainingQuantity/isFullyConverted |
| `domain/PartnerOrder.java` | 수정 | CONVERTED status 추가 + requireConvertible() + markConvertedIfComplete() |
| `domain/PartnerOrderStatus.java` | 수정 | CONVERTED enum 추가 |
| `service/PartnerOrderConvertService.java` | 신규 | 부분전환 오케스트레이션 (사전검증→발행→누적→save) |
| `web/PartnerOrderConvertController.java` | 신규 | POST /{id}/convert-to-slip |
| `web/dto/ConvertToSlipRequest.java` | 신규 | 요청 DTO |
| `web/dto/ConvertResultResponse.java` | 신규 | 응답 DTO |
| `clients/desktop/...SalesPartnerOrderDetailPage.tsx` | 수정 | 전환 버튼 + 수량 모달 + CONVERTED 뱃지 + 전환됨/잔여 컬럼 |
| `test/.../PartnerOrderConvertIT.java` | 신규 | IT 10케이스 |

dev-report: `docs/dev-reports/phase-2-6a-order-to-slip-conversion.md` (본 파일)
