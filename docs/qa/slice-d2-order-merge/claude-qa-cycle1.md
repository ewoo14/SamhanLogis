# D2 다중주문 병합 전환 QA 리뷰 — 사이클 1

> 브랜치: feat/d2-order-merge-to-slip  
> 리뷰어: Claude QA  
> 일자: 2026-05-31  
> 결론: **CHANGES_REQUESTED**

---

## 1. 리뷰 범위 및 기준

- `SlipPublishMergeIT` (slip-service 통합 테스트)
- `PartnerOrderMergeConvertIT` (partner-order-service 통합 테스트)
- `PartnerOrderMergeConvertServiceTest` (단위 테스트)
- `playwright/d2-order-merge/d2-order-merge.spec.ts` (E2E)
- `docs/superpowers/specs/2026-05-31-order-merge-to-slip-design.md §6` 테스트 매트릭스 대조

---

## 2. spec §6 테스트 매트릭스 커버리지 갭

### 2-A. 누락 케이스 (MISSING — 테스트 없음)

| # | spec §6 요구 케이스 | 해당 IT/UT | 상태 |
|---|---|---|---|
| M-1 | **부분수량 + 잔여추적** — 부분 전환 후 주문 상태가 DRAFT 유지 + `converted_quantity` 일부만 누적 확인 | PartnerOrderMergeConvertIT | 누락. 케이스1·2는 **전량 전환**만 검증. 부분 전환 후 `remainingQuantity > 0` + status=DRAFT 단언 없음. |
| M-2 | **ON_HOLD 주문 병합 가능** — `requireConvertible()` = DRAFT/ON_HOLD 명세인데 DRAFT만 사용 | 모든 IT | ON_HOLD 입력 케이스 0건. `requireConvertible` 허용 범위 검증 불완전. |
| M-3 | **잔여 초과 후 reserve=0 검증** — 잔여 초과 409 시 reserve 미호출 단언 | `PartnerOrderMergeConvertIT` 케이스6 | `verify(inventoryClient, never()).reserve(...)` 있으나 `converted_quantity` DB 단언 없음. |
| M-4 | **멱등 재시도 replay** (파트너-오더 레이어) — 같은 convertKey로 2회 호출 시 slip 1회만 발행 + converted_quantity 미중복 | PartnerOrderMergeConvertIT | **IT에 전혀 없음**. ServiceTest도 멱등 경로 검증 없음. SlipPublishMergeIT 케이스3은 slip-service 레이어만 검증. |
| M-5 | **3주문 이상 병합** — N=2 고정 픽스처만 사용, N>=3 케이스 0건 | 모든 IT | spec "N건" 요구 대비 커버리지 미흡. |

### 2-B. 약한 단언 (WEAK — false-green 위험)

| # | 위치 | 문제 |
|---|---|---|
| W-1 | `PartnerOrderMergeConvertServiceTest` 케이스5 | `reserve` 2회 호출 단언은 있으나 **captor 없음** — reserve에 전달된 productId/warehouseId/qty 실제값 미검증. 잘못된 인자로 reserve가 불려도 통과. |
| W-2 | `PartnerOrderMergeConvertServiceTest` 케이스6 | payload의 `sourceOrders[*].partnerOrderId`가 실제 DB UUID(order.getId())인지 확인 안 함. serviceTest는 mock 주입 객체이므로 orderId = `buildOrder()` 결과 UUID → payload에 담기는지 실제 단언 없음(containsKey만). |
| W-3 | `SlipPublishMergeIT` 케이스1 | `slip.sourceType == PARTNER_ORDER` 응답 단언은 있지만 **`slip.sourceId == ORDER_A_ID`(대표 주문)** DB 레벨 단언 없음. sourceId 매핑 오류가 false-green으로 통과 가능. |
| W-4 | `SlipPublishMergeIT` 케이스3 (멱등) | 재시도 후 `slip_source_orders` 행이 2건 유지(재삽입 없음) 단언은 있으나, **SlipPublishAudit 1건 유지** 단언 없음. audit이 2회 삽입되어도 통과. |
| W-5 | `PartnerOrderMergeConvertIT` 케이스4 | `release(productAId, ...)` 1회 호출 단언은 있으나 release에 전달된 `qty`가 실제 요청 qty(2)인지 captor 미검증. |
| W-6 | `PartnerOrderMergeConvertServiceTest` 전 케이스 | `service.convertMerge(req, null, null)` — actorId=null 로 테스트. 실 환경 actorId UUID를 전달할 때 동작 변경 여지(convertKey hash에 actorId 포함 시). 현재 구현은 hash에 actorId 미포함이므로 무관하나, 명시적 검증 없음. |

### 2-C. 구조적 미검증 (STRUCTURAL)

| # | 항목 | 세부 |
|---|---|---|
| S-1 | **slip 발행 실패 → 보상 후 converted_quantity 미변경** (IT 레이어) | `PartnerOrderMergeConvertIT` 케이스5에서 converted_quantity=0 DB 단언은 있으나, **release 호출에 전달된 qty** captor 단언 없음. qty가 0이거나 잘못 전달되어도 통과. |
| S-2 | **SlipLine.sourceOrderLineId 저장 검증** | `SlipPublishMergeIT`에서 `slip_lines` 테이블의 `source_order_line_id` 컬럼이 실제 저장됐는지 DB 단언 없음. spec §4.1 "라인 출처 기존 SlipLine.sourceOrderLineId(V29) 그대로 채움" 요구 대비 누락. |
| S-3 | **slip.sourceId == 대표 주문 UUID 저장 검증** | `SlipPublishMergeIT` 케이스1에서 `slip_source_orders` 2행은 검증하지만, `slips.source_id` 컬럼이 ORDER_A (대표)인지 DB/assert 확인 없음. |
| S-4 | **병합 전표의 SlipPublishAudit sourceId** | audit 행의 sourceId가 대표 주문 UUID인지 단언 없음. D2 spec §4.3 "primaryOrderId" 기준으로 audit 기록 명세 대비 누락. |
| S-5 | **partnerCode DB 스냅샷 저장** | `slips.partner_code` 컬럼에 병합 요청 partnerCode가 실제 저장됐는지 단언 없음(SlipPublishMergeIT 어디에도 없음). |

---

## 3. 단언 강도 (false-green 위험도)

### 3-A. 고위험: PartnerOrderMergeConvertServiceTest 케이스6 payload 단언

```java
// 현재: containsKeys("partnerOrderId", "orderNo") 만 검증
assertThat(sourceOrders.get(0)).containsKeys("partnerOrderId", "orderNo");

// 필요: 실제 값 단언 (orderId, orderNo 일치 확인)
assertThat(sourceOrders.get(0).get("partnerOrderId")).isEqualTo(orderId.toString());
assertThat(sourceOrders.get(0).get("orderNo")).isEqualTo(orderNo);
assertThat(lines.get(0).get("qty")).isEqualTo("2");  // 요청 qty 정확 전달 확인
```

키 존재만 확인하고 값이 빈 문자열이어도 통과함.

### 3-B. 고위험: SlipPublishMergeIT 케이스5 (findBySource)

ORDER_B로 조회 시 병합 전표가 포함되는지 slipNo 비교로 검증하지만, `by-source` 응답 구조가 `data.[]` 배열인지 `data.content.[]` 배열인지에 따라 루프 로직이 달라질 수 있음. 현재 코드는 `data.isArray()` → 직접 iterate이나, 실제 API 응답 envelope 구조를 확인할 필요 있음.

### 3-C. 중위험: PartnerOrderMergeConvertIT 케이스1 응답 단언 누락

```java
// 현재: convertedOrders[].orderNo 단언 없음
// 응답의 orderNo 필드가 UUID인지 주문번호인지 미검증 → UUID 비공개 원칙(feedback_uuid_no_user_visibility) 위반 가능
.andExpect(jsonPath("$.data.convertedOrders[0].orderNo").isNotEmpty())  // 없음
```

---

## 4. skipped=0 + Testcontainers 확인

- `SlipPublishMergeIT`: `AbstractPostgresIT` (slip-service 버전) 상속, `DockerAvailableCondition` extension 적용. Docker 미가용 시 **skip(disabled)** 처리 — skipped>0 가능.
- `PartnerOrderMergeConvertIT`: `AbstractPostgresIT` (partner-order-service 버전) 상속, 동일 skip 조건.
- CI (GitHub Actions Linux) 환경에서는 Docker 가용이므로 skipped=0 기대 가능. Windows 로컬에서는 skip 발생 시 `DOCKER_HOST=tcp://localhost:2375` 우회 필요 (feedback_testcontainers_windows_docker).
- `PartnerOrderMergeConvertServiceTest`: Mockito 기반, Docker 불필요, skipped=0 보장.
- 판정: **CI 환경 기준 skipped=0 충족 가능. 로컬 Windows에서는 IT skip 우회 조치 필요.**

---

## 5. cross-service 계약 테스트 충분성

### 5-A. 계약 단절 위험

`PartnerOrderMergeConvertIT`에서 `slipServiceClient.publishFromOrdersMerge`는 `@MockBean`으로 격리됨. 이는 정상이나, **slip-service가 수신하는 payload 형태와 partner-order-service가 전송하는 payload 형태의 계약(contract)이 단일 통합 테스트로 검증되지 않는다.**

구체적으로:
- partner-order-service가 전송하는 `payload.get("lines")[].qty`가 String 타입인지 확인 필요.
- `SlipPublishService.resolveLines()`의 `parseQty()`는 `Integer.parseInt(l.qty().trim())`를 호출 — qty가 Integer/Number 타입으로 전달되면 NPE 또는 ClassCastException 발생.
- `PartnerOrderMergeConvertService` 빌드 코드: `lp.put("qty", String.valueOf(item.quantity()))` — String으로 정확히 직렬화되나, `SlipPublishMergeIT`의 `mergeBody()`에서도 `"qty": "2"` String으로 전달 중. 일치 확인됨.
- **그러나** `ServiceTest` 케이스6 captor 단언에서 `lines.get(0).get("qty").toString()` 로 간접 확인만 함 — `isEqualTo("2")` 같은 구체적 값 단언 없음.

### 5-B. slip_source_orders 멱등 재삽입 방지

`SlipPublishMergeIT` 케이스3에서 멱등 재시도 시 `slip_source_orders` 행이 2건 유지를 assertThat으로 검증함 — 양호.
단, `SlipPublishService.publishFromOrdersMerge` 코드 흐름상 멱등 replay는 `existing.isPresent()` 분기에서 `assertReplayOrConflict()`로 즉시 반환하여 `sourceOrderRepository.save()` 루프에 도달하지 않으므로 재삽입 방지가 올바르게 구현됨. 검증 충분.

### 5-C. 병합 발행 후 단일주문 전환 경로 회귀

`PartnerOrderMergeConvertIT` 내에 단일주문 `PartnerOrderConvertService` 경로에 대한 회귀 테스트 없음. spec §2 D-MRG-02 "기존 단일주문 무변경" 요구가 IT 레이어에서 검증되지 않음.
(단, Playwright 시나리오7에서 단일전환 버튼 노출 회귀 검증 있음 — FE 레이어만)

---

## 6. Playwright E2E 검토

### 6-A. 정상 항목

- 시나리오2: 1건 선택 → 병합 버튼 비활성 (`toBeDisabled()`)
- 시나리오3: 혼합 거래처 → warn 노출 + 버튼 비활성
- 시나리오4: 창고 미선택 비활성 → 선택 후 활성
- 시나리오5: 성공 toast + slipNo + 모달 닫힘
- 시나리오6: 409 mock → 모달 내 에러 배너
- 시나리오7: 단일전환 버튼 회귀
- 시나리오8: 선택 해제 → 액션 바 사라짐

### 6-B. 미검증 E2E 케이스

| # | 누락 시나리오 | 근거 |
|---|---|---|
| E-1 | 409(재고 부족) mock → 모달 에러 배너 (`mockMerge409=stock`) | spec §6에 명시되었으나 시나리오6은 `mixed`만 구현. `stock` 케이스 spec 커버리지 미달. |
| E-2 | 병합 성공 후 **목록 행 배지(잔여/전환완료) 갱신** react-query invalidate 확인 | spec §4.4 "각 주문 잔여/전환완료 배지 갱신" 요구 대비 E2E 확인 없음. |
| E-3 | 헤더 '/' 병기 텍스트 입력 → 전송 확인 | spec §4.4 "헤더 충돌 필드 사용자가 값 선택 또는 '/' 병기 텍스트 입력 → 확정 헤더 전송" 검증 없음. |

### 6-C. mock.ts 구조 문제

```typescript
// mock.ts:3897-3898
convertedOrders: orders.map((o) => ({
  orderNo: o.partnerOrderId,  // mock: 요청의 partnerOrderId 값을 orderNo 로 그대로 반환
```

FE mock이 요청의 `partnerOrderId` 값을 응답 `orderNo`로 그대로 반환함. 실제 BE는 DB에서 조회한 `orderNo`(주문번호)를 반환. FE 테스트가 mock 동작을 검증하는 것에 그치며, 실제 BE 응답의 `orderNo` 필드가 UUID가 아닌 주문번호임을 FE가 올바르게 렌더링하는지 검증 안 됨.

---

## 7. V30 마이그레이션 DDL 검토

`V30__create_slip_source_orders.sql`:
- spec §4.1 정의와 DDL 일치 확인.
- `partner_order_id` 컬럼에 FK 없음 — cross-service 참조이므로 FK 생략은 의도적(정상).
- `modified_at`, `modified_by` 컬럼 사용 — spec에서는 `updated_at`, `updated_by`로 표기. DDL에서 실제 컬럼명은 `modified_at/by`. `BaseEntity` 7 audit 컨벤션(`project_build_conventions.md`)과 일치 여부 확인 필요.

---

## 8. Docker 실 QA 계획 점검

spec §6 Docker 실 QA 절차 대비:

| 항목 | 상태 |
|---|---|
| 실 게이트웨이+JWT | 계획됨(docs/qa 미작성) |
| 실 화면 캡처(feedback_no_fake_data_ever) | 미작성 — PIL 합성/mock 화면 금지 원칙 상 실 Docker 스택 기동 후 캡처 필요 |
| psql 실적중: `slip_source_orders` N행 | SQL 쿼리 미작성 |
| psql 실적중: 각 주문 `converted_quantity` | SQL 쿼리 미작성 |
| psql 실적중: `slip_lines.source_order_line_id` | SQL 쿼리 미작성 |
| 배포 순서: slip-service 먼저 | spec §7 명시, 실행 계획 미문서화 |

도메인 정합성 SQL(도출 필요):
```sql
-- (1) slip_source_orders N행 확인
SELECT slip_id, count(*) AS source_count
FROM slip_source_orders
WHERE is_deleted = FALSE
GROUP BY slip_id
HAVING count(*) >= 2
LIMIT 5;

-- (2) 병합 전표의 source_id = 대표 주문 일치 확인
SELECT s.id, s.source_id, sso.partner_order_id, sso.order_no
FROM slips s
JOIN slip_source_orders sso ON sso.slip_id = s.id
WHERE s.source_type = 'PARTNER_ORDER'
  AND s.is_deleted = FALSE
  AND sso.is_deleted = FALSE
ORDER BY s.created_at DESC LIMIT 10;

-- (3) converted_quantity 정합 확인 (각 주문 라인 누적값 >= 0, <= quantity)
SELECT id, quantity, converted_quantity,
       (quantity - converted_quantity) AS remaining
FROM partner_order_lines
WHERE converted_quantity > 0 AND is_deleted = FALSE
LIMIT 10;

-- (4) slip_lines.source_order_line_id 저장 확인
SELECT sl.id, sl.source_order_line_id
FROM slip_lines sl
JOIN slips s ON s.id = sl.slip_id
WHERE s.source_type = 'PARTNER_ORDER'
  AND sl.source_order_line_id IS NOT NULL
  AND sl.is_deleted = FALSE
LIMIT 10;
```

---

## 9. 필수 수정 사항 요약

### Critical (머지 전 필수)

1. **M-4: partner-order IT 레이어 멱등 재시도 케이스 추가** — 같은 convertKey 2회 호출 시 `slipServiceClient.publishFromOrdersMerge` 1회만 호출 + `converted_quantity` 이중 누적 없음 DB 단언 필요.
2. **M-1: 부분수량 전환 IT 케이스 추가** — 5개 중 3개 전환 후 `converted_quantity=3`, `status=DRAFT`, `remainingQuantity=2` DB 단언.
3. **W-3: SlipPublishMergeIT 케이스1에 `slips.source_id` DB 단언 추가** — `assertThat(slip.getSourceId()).isEqualTo(ORDER_A_ID.toString())`.
4. **S-2: SlipPublishMergeIT에 `slip_lines.source_order_line_id` DB 단언 추가** — JDBC로 `SELECT source_order_line_id FROM slip_lines WHERE slip_id=?` 결과 non-null 확인.
5. **E-1: Playwright 시나리오6에 `mockMerge409=stock` 케이스 추가** (또는 시나리오9 신설).

### Major (머지 전 강력 권고)

6. **M-2: ON_HOLD 주문 병합 IT 케이스 1건 추가** — `requireConvertible()` ON_HOLD 허용 검증.
7. **W-1: ServiceTest 케이스5 reserve captor 추가** — productId/warehouseId/qty 실제값 단언.
8. **S-5: SlipPublishMergeIT에 `slips.partner_code` DB 단언 추가** — `slip.getPartnerCode().isEqualTo("P0001")`.
9. **E-2: Playwright 시나리오 — 병합 성공 후 목록 배지 갱신 확인**.

### Minor

10. **V30 DDL 컬럼명 확인** — `modified_at/by` vs spec `updated_at/by` 불일치. `BaseEntity` 실제 컬럼명과 DDL 일치 여부 재확인.
11. **W-4: SlipPublishMergeIT 케이스3에 audit 1건 유지 단언** — `auditRepository.findAllBySlipIdAndIsDeletedFalse(slipId).size() == 1`.
12. **S-4: SlipPublishMergeIT에 audit.sourceId == ORDER_A 단언** — 병합 audit이 대표 주문 기준으로 기록됨 확인.

---

## 10. 판정

**CHANGES_REQUESTED**

필수(Critical) 5건 중 M-4(partner-order IT 멱등), M-1(부분수량 IT), S-2(sourceOrderLineId DB 단언)는 spec §6의 명시 요구 케이스임에도 현재 테스트에 존재하지 않아 false-green 위험이 실질적으로 있음. W-3(sourceId DB 단언)은 병합 N:1 추적의 핵심 불변식 검증이라 누락 시 회계 cross-check 정합성 보장 불가.

양성 측면: Testcontainers 실 Postgres 사용, @MockBean 외부 client 격리, release 보상 captor 단언 기본 구조, SlipPublishMergeIT 멱등 replay + 409 케이스 모두 양호. 기반 설계와 구현은 spec에 충실하며 수정 범위가 작다.
