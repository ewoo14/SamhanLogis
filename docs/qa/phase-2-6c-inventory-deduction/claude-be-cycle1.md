# Phase 2.6c BE 코드 리뷰 — claude-be-cycle1

> 브랜치: `feat/phase-2-6c-inventory-deduction` (HEAD `c4f517e1`)
> 리뷰어: Claude BE agent (cycle 1)
> 기준 커밋: `origin/main`

---

## 종합 판정

**조건부 APPROVE** — P0(머지차단) 결함 없음. P1(릴리즈 전 필수) 2건, P2(권고) 3건 존재.

---

## 결함 목록

### P1 — 릴리즈 전 필수 수정

#### P1-1: reserve 멱등 no-op 시 보상 release 과대 발동 가능성

**파일**: `PartnerOrderConvertService.java` 155~162행

**현상**: `inventoryClient.reserve(...)` 가 멱등 no-op(이미 예약된 상태이므로 실제 재고 변동 없음)으로 성공하더라도, 그 다음 줄에서 `reservedLines.add(...)` 가 무조건 호출된다. 이후 루프 중 다른 라인에서 409(가용 부족)가 발생하면 `compensateReserved(reservedLines, ...)` 가 no-op 라인에 대해서도 `release(...)` 를 호출한다.

**결과**: inventory-service 의 `release()` 에는 멱등 가드가 없다. no-op 상태였던 라인(실제 `reservedQty` 를 증가시키지 않은 라인)에 대해 `release()` 가 실행되면 `reservedQty` 가 음수 방향으로 감소하여 **재고 불정합(reservedQty < 0 또는 availableQty 과대)** 이 발생할 수 있다.

**재현 시나리오**:
1. 라인 A, 라인 B가 있는 주문
2. 1차 전환 성공 → A, B 모두 reserve (movement 기록됨)
3. 동일 convertKey 로 재시도 → A reserve → no-op (movement 없음) → reservedLines 에 추가됨 → B reserve → 가용 부족 409 → compensateReserved 호출 → A 에 대해 release 발동 → **A 의 reservedQty 가 이미 0이거나 낮아져서 이상**

코드 주석 `"멱등 no-op 라인은 double-release 방지됨"` 은 사실과 다름. no-op 로 reserve 응답이 왔을 때 `reservedLines.add()` 를 하지 않아야 방지가 된다. 현재 코드는 성공 응답(200, no-op 포함)을 구분하지 않고 무조건 추가한다.

**권장**: inventory-service 가 멱등 no-op 응답 시 별도 플래그(예: `"alreadyReserved": true`)를 반환하거나, partner-order-service 가 no-op 여부를 판단하여 `reservedLines.add()` 를 skip 하는 로직 추가 필요. 단기 대안은 `ReservationResponse` 에 `idempotentNoop` 필드를 추가하고 `true` 이면 보상 대상에서 제외.

---

#### P1-2: SENT 전표 cancel() API 가 여전히 열려 있음 — PARTNER_ORDER 전표 불변 보호 불완전

**파일**: `SlipController.java` 464~472행 + `Slip.java` CANCELABLE_STATUSES

**현상**: `CANCELABLE_STATUSES = {DRAFT, SAVED, SENT}`. Phase 2.6c 에서 PARTNER_ORDER 전환 전표를 발행 즉시 `SENT` 로 올리지만, `POST /api/v1/slips/{id}/cancel` 엔드포인트는 SENT 상태 전표를 `CANCELED` 로 전이 허용한다. PARTNER_ORDER 전환 전표가 cancel 경로로 취소될 경우 inventory reserve 가 해제되지 않아 **재고가 영구 예약 상태로 잠긴다**.

현재 `Phase26cSlipImmutableIT.s3_partnerOrderSlip_deleteBlocked()` 는 `DELETE /api/v1/slips/sales/{id}` 만 검증하며, cancel API 에 대한 회귀는 없다.

**권장**: `Slip.cancel()` 내부에 `sourceType == PARTNER_ORDER` 시 CONFLICT 예외를 추가하거나, SlipController 의 cancel endpoint 에서 sourceType 가드를 추가. 또는 cancel 자체를 허용하되 inventory release 보상을 자동 연동하는 설계(현 슬라이스 범위 밖).

---

### P2 — 권고 (차단 아님)

#### P2-1: `findByCode` soft-delete 필터 누락 가능성 (낮은 위험도)

**파일**: `WarehouseRepository.java` 20행, `InternalWarehouseController.java` 56행

**현상**: `findByCode(String code)` 는 `@SQLRestriction("is_deleted = false")` 가 엔티티 레벨에 적용되어 있으므로 기술적으로 soft-delete 된 창고는 조회되지 않는다. 그러나 메서드 Javadoc 에 soft-delete 필터 적용 여부가 명시되지 않아 향후 `@SQLRestriction` 을 제거하거나 우회할 때 묵시적 의존이 깨질 수 있다.

**권장**: `findByCode` 메서드 Javadoc에 `@SQLRestriction("is_deleted = false") 엔티티 레벨 필터로 삭제된 창고는 제외됨` 명시. 또는 `findByCodeAndIsDeletedFalse` 명시적 메서드명 사용.

---

#### P2-2: `buildIdempotencyKey` 와 `buildConvertKeyUuid` 이중 SHA-256 계산 (성능 낭비)

**파일**: `PartnerOrderConvertService.java` 239~291행

**현상**: `buildIdempotencyKey` 와 `buildConvertKeyUuid` 는 동일한 입력(orderId + validatedItems + lineMap 의 convertedBefore 스냅샷)으로 `sha256hex()` 를 각각 독립적으로 호출한다. 동일한 `raw` 문자열을 만들고 SHA-256 을 두 번 계산한다. 운영 트래픽에서는 무시할 수준이나, 두 메서드가 다른 `contentHash` 로직을 가진다는 오해를 유발할 수 있다.

**권장**: `sha256hex(raw)` 를 한 번만 계산하여 `idempotencyKey` 와 `convertKeyUuid` 를 모두 도출하는 단일 헬퍼로 통합.

---

#### P2-3: `PartnerOrderConvertIT` stub 업데이트 후 주석 미갱신

**파일**: `PartnerOrderConvertIT.java` 116~129행

**현상**: 기존 `PartnerOrderConvertIT` 의 setUp()에 `inventoryClient.resolveWarehouseIdByCode`, `inventoryClient.reserve(5인자)`, `inventoryClient.release(5인자)` lenient stub 이 추가되었으나, 클래스 Javadoc `@제약:` 섹션에 `Phase 2.6c stub 추가됨` 갱신이 누락됨. 향후 InventoryClient 시그니처 변경 시 미러링이 안 될 수 있다.

**권장**: Javadoc `@검증 케이스` 목록에 `InventoryClient 5인자 stub Phase 2.6c` 추가.

---

## 체크리스트 세부 결과

### 1. reserve 멱등

| 항목 | 판정 | 근거 |
|---|---|---|
| convertKey SHA-256 결정성 | PASS | `buildConvertKeyUuid` 가 동일 입력에 동일 UUID 생성 (convertedBefore 스냅샷 포함) |
| DB partial unique index (`WHERE movement_type = 'RESERVE' AND reference_type IS NOT NULL AND reference_id IS NOT NULL`) | PASS | V14 SQL 문법 정확. `IF NOT EXISTS` 로 재실행 안전. |
| 서비스 guard 이중방어 | PASS | `StockService.reserve()` 내 `alreadyReserved` 체크 정확 |
| 이중 예약 0 보장 | PASS | DB index + 서비스 guard 이중 차단으로 동시성 포함 보장 |
| 멱등 no-op 시 reservedLines.add 처리 | **FAIL** | P1-1 참조 — no-op 를 구분하지 않고 보상 대상에 추가 |

### 2. convert 트랜잭션 순서/원자성

| 항목 | 판정 | 근거 |
|---|---|---|
| 라인별 reserve → slip 발행 순서 | PASS | try-catch 구조로 명확히 분리 |
| 일부 라인 reserve 성공 후 다른 라인 실패 시 기예약분 보상 | PASS | `compensateReserved(reservedLines, ...)` 가 성공 라인만 추적하여 보상 (단, P1-1 조건 주의) |
| slip 발행 후 converted 누적 전 예외 | PASS | slip 발행 성공(`result`) 확인 후에만 `line.convert()` 호출 |
| `@Transactional` 범위 내 외부 HTTP 호출 포함 | 주의 | `@Transactional` 메서드 안에서 inventory/slip REST 호출이 발생하므로 DB 트랜잭션이 HTTP 응답 대기 중 홀딩됨. 고부하 시 connection pool 소진 가능성. 현재 슬라이스 범위 내 이슈이며 향후 saga/outbox 패턴으로 전환 권장(P2 이하) |

### 3. release 보상 정확성

| 항목 | 판정 | 근거 |
|---|---|---|
| referenceId 기반 정확 해제 | PASS | `compensateReserved` 가 `convertKeyUuid` 를 release referenceId 로 전달 |
| 부분 reserve 후 보상 누락 | PASS | 실패 시점까지 성공한 라인만 `reservedLines` 에 있으므로 미발동 라인 보상 없음 |
| no-op 라인 double-release 위험 | **FAIL** | P1-1 참조 |
| release 실패 시 처리 | PASS | `compensateReserved` 내부 try-catch + error 로그 (운영자 수동 복구) 명확 |

### 4. confirm reserve 제거 부작용

| 항목 | 판정 | 근거 |
|---|---|---|
| `InventoryClient` 필드 제거 | PASS | `PartnerOrderConfirmService` 에서 `inventoryClient` 필드 제거. 빈 참조 없음. |
| confirm 흐름 자동 slip 발행 유지 | PASS | slip 발행 코드(step 5, 6, 7 이후)는 미변경 |
| 과도기 영향 | PASS | 기존 `reserve(3인자)` 오버로드 보존으로 legacy 호환 유지 |
| `PartnerOrderConfirmService` 컴파일 오류 | PASS | import 제거 정확. 필드 삭제 정확. |

### 5. slip SENT 불변 회귀

| 항목 | 판정 | 근거 |
|---|---|---|
| sourceType=PARTNER_ORDER 한정 | PASS | `SlipSourceType.PARTNER_ORDER.equals(saved.getSourceType())` 조건 |
| ESTIMATE 전표 영향 없음 | PASS | `Phase26cSlipImmutableIT.s4_estimateSlip_remainsDraft()` 검증 |
| `EDITABLE_STATUSES` 미변경 | PASS | `{DRAFT, SAVED}` 유지 확인 |
| PARTNER_ORDER 전표 삭제 차단 | PASS | `deleteForSales()` 가 `EDITABLE_STATUSES` 검사로 SENT 차단 |
| PARTNER_ORDER 전표 수정 차단 | PASS | `requireEditable()` 가 EDITABLE_STATUSES 검사로 SENT 차단 |
| PARTNER_ORDER 전표 cancel 차단 | **FAIL** | P1-2 참조 — `CANCELABLE_STATUSES` 에 SENT 포함 |

### 6. 도메인 메서드 / BaseEntity / Javadoc / 마이그레이션

| 항목 | 판정 | 근거 |
|---|---|---|
| 직접 setter 사용 금지 | PASS | `saved.save()`, `saved.send()` 도메인 메서드 사용 |
| 한국어 Javadoc | PASS | 모든 신규 클래스/메서드에 한국어 Javadoc 작성 |
| V14 SQL 문법 (partial index WHERE 절) | PASS | PostgreSQL 표준 문법 정확 |
| Flyway 순번 연속성 | PASS | V13 다음 V14 정상 |
| `WarehouseByCodeResponse` record | PASS | UUID 포함이나 internal token 전용 경로로 UUID 노출 가드 예외 적용 |

### 7. IT 커버리지

| 케이스 | 파일 | 판정 |
|---|---|---|
| warehouseCode 역조회 성공/404 | Phase26cReserveIT T1-1, T1-2 | PASS |
| reserve 정상 / 멱등 / 가용부족 / release | Phase26cReserveIT T2-1~T2-5 | PASS |
| 사전차단 (gaap 부족 → slip 미호출) | Phase26cConvertReserveIT R2 | PASS |
| slip 5xx → release 보상 | Phase26cConvertReserveIT R3 | PASS |
| 정상 전환 reserve 호출 captor | Phase26cConvertReserveIT R1 | PASS |
| confirm → reserve 미호출 | Phase26cConvertReserveIT R6 | PASS |
| PARTNER_ORDER 전표 SENT 불변 | Phase26cSlipImmutableIT S1~S4 | PASS |
| cancel API 에 대한 PARTNER_ORDER 불변 | 없음 | **MISS** (P1-2 관련) |
| no-op + 이후 라인 409 시 double-release | 없음 | **MISS** (P1-1 관련) |
| @MockBean lenient | PASS | 모든 외부 client lenient stub 적용 확인 |

---

## 요약

| 우선순위 | 건수 | 요약 |
|---|---|---|
| P0 (머지차단) | 0 | 없음 |
| P1 (릴리즈 전 필수) | 2 | no-op double-release(P1-1), SENT 전표 cancel 허용(P1-2) |
| P2 (권고) | 3 | findByCode Javadoc(P2-1), SHA-256 이중계산(P2-2), stub 주석(P2-3) |

P1-1 은 재고 불정합을 유발하는 잠재적 버그이나, 멱등 재시도 시나리오(동일 convertKey 로 2회 이상 호출)에서만 발생한다. 실운영에서 재시도 빈도가 낮으면 단기 무시 가능하나, **재고 정합 요구사항 상 조기 수정 권장**.

P1-2 는 PARTNER_ORDER 전표 불변 설계를 cancel API 가 우회할 수 있는 구멍이다. 보상 release 없이 재고가 잠기는 결과를 낳는다.
