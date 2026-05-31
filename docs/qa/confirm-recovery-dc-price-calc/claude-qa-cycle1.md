# QA 리뷰 — confirm 경로 복구 (DC price-calculations 정식 연동)

- **슬라이스**: confirm-recovery-dc-price-calc (PR #330)
- **브랜치**: fix/confirm-recovery-dc-price-calc-dc-price-calc
- **리뷰어**: claude-qa
- **사이클**: 1
- **날짜**: 2026-05-31
- **근거 spec**: docs/superpowers/specs/2026-05-31-confirm-recovery-dc-price-calc-design.md

---

## 1. 총평

IT 2종(finalPrice/fail-soft) 추가, 기존 5종 mock 시그니처 일괄 갱신, FE res.ok 정규화, VendorOrderServiceTest 단언 수정이 일관성 있게 이루어졌다. 그러나 **P0 1건, P1 2건, P2 2건** 의 미비점이 존재하여 머지 전 P0·P1 수정을 권고한다.

---

## 2. 점검 1 — 테스트 커버리지

### 2.1 신규 IT 2종 (spec §6 의도 달성 여부)

| IT 메서드 | spec §6 대응 | 단언 품질 |
|---|---|---|
| `confirm_applies_dc_final_price_from_price_calc` | lineId "0" → finalPrice=800000 → price_vat DB 단언 | 적정 |
| `confirm_failsoft_uses_list_price_when_price_calc_empty` | 빈 Map → price_vat=listPrice(1500000) DB 단언 | 적정 |

spec §6 에 열거된 기본 2케이스는 커버됨. 단, 아래 3개 엣지가 **미커버**다.

#### [P1] 미커버 엣지 A — price-calc 부분 응답 (일부 라인 lineId 누락)

spec §5 에는 "부분 응답" 케이스가 명시되지 않으나, 서비스 코드 `ConfirmService` 는 `finalPrices.getOrDefault(String.valueOf(i), p.sellingPrice())` 로 누락 lineId 는 listPrice fallback 한다. **다중 라인 주문에서 일부 라인만 finalPrice 가 채워진 Map 반환 시** 나머지 라인이 listPrice 로 저장되는지 검증하는 IT 없음. 실 DC Config 에 category=OTHER 라인이 있는 경우 dc-config-service 가 finalPrice=listPrice(rate=0)로 응답하지만, 라인 index 가 맞지 않는 오류 등에서 누락 발생 가능.

#### [P2] 미커버 엣지 B — 멱등 재confirm 시 price-calc 재호출 여부

spec §5 "멱등 재confirm → 기존 유지" 에서 2회 호출 시 `calculatePrices` 가 **호출되지 않아야** 한다. 현재 `idempotent_reconfirm_returns_same_order_no_without_duplicate_rows` 는 이를 검증하지 않는다(verify not called 없음). 현재 서비스 코드는 `findByIdempotencyKey` hit 후 즉시 return 하므로 실제로는 재호출 없으나, 회귀 가드 단언이 없다.

#### [P2] 미커버 엣지 C — price-calc RuntimeException(네트워크 타임아웃) fail-soft

`calculatePrices` 가 `RuntimeException` 을 throw(연결 실패 시뮬레이션)했을 때 confirm 이 listPrice 로 진행되는지 검증하는 IT 없음. 현재 구현은 `catch(RuntimeException)` → `Map.of()` 로 처리하므로 코드 상 안전하나, 회귀 가드 없음.

### 2.2 category 매핑 단위 테스트

spec §6 에서 "category 매핑 단위테스트: homemulti→HOMEMULTI 등" 을 명시. **해당 단위 테스트가 diff에 존재하지 않는다.** `mapCategory` 는 private 메서드이므로 IT로도 간접 검증 가능하나 명시적 단위 테스트 부재.

### 2.3 FE sendOrderFromUi 정규화 단위 테스트

spec §6 "FE: sendOrderFromUi 정규화 단위(가능 시) — {ok:true} 반환 확인" — 미구현. 산출물에 Playwright spec 없음. 단, spec 이 "가능 시"로 조건부 기재하였으므로 P2 로 분류.

---

## 3. 점검 2 — 회귀

### 3.1 D1 IT 5종 유지 여부

| IT 메서드 | main 대비 변경 | 회귀 위험 |
|---|---|---|
| `confirm_creates_draft_order_without_slip_publish` | `fetchDcConfig` → `calculatePrices` mock 갱신. 단언 동일. | 없음 |
| `confirm_does_not_enqueue_outbox` | 동상 | 없음 |
| `idempotent_reconfirm_returns_same_order_no_without_duplicate_rows` | 동상 | 없음 |
| `confirm_creates_revision_with_no1_and_type_create` | 동상 | 없음 |
| `confirm_records_history_event_confirmed` | 동상 | 없음 |

D1 IT 5종 모두 mock 시그니처만 `calculatePrices(anyString, anyList)` 로 갱신되었고, 핵심 단언(`slipNo=null`, `status=DRAFT`, `outbox not enqueued`, `revision_no=1 CREATE`, `CONFIRMED history`) 은 변경 없다. 회귀 없음.

### 3.2 convert/from-estimate 무변경

`PartnerOrderConvertIT`, `HoldStatusFilterIT`, `Phase26cConvertReserveIT`, `PartnerOrderRevisionRestoreIT` 에서 `fetchDcConfig` → `calculatePrices` mock 갱신만 이루어졌다. 이들 IT 에서 confirm 경로를 직접 호출하지 않으므로 lenient stub 교체는 안전하다. 회귀 없음.

`PartnerOrderConvertIT` 의 convert 경로 자체(`PartnerOrderConvertService`)는 diff 에 포함되지 않는다 — 무변경 확인.

### 3.3 VendorOrderServiceTest 단언 수정 타당성

기존 단언:
- `dcRate=0.10`, `finalPrice=855000`, `subtotal=1710000` (fetchDcConfig 기반)

변경 후 단언:
- `dcRate=0`, `finalPrice=950000`, `subtotal=1900000` (preview 단계 dcRate=0, DC 적용은 confirm 단계)

VendorOrderService.upload 가 `dcRate = BigDecimal.ZERO` 로 고정된 것은 spec §3.1 주석("DC rate 조회 미리보기 용도 — price-calc 는 라인 기반이므로 preview 단계에서는 0 사용. 실 DC 적용은 confirm 단계의 PartnerOrderConfirmService.calculatePrices 에서 수행.") 과 일치한다. 수정 타당함.

`VendorOrderControllerIT` 도 `calculatePrices → Map.of()` lenient stub 으로 교체. upload IT 는 DC 율 0 기반이므로 단언에 영향 없다. 타당함.

---

## 4. 점검 3 — P0 발견 사항 (DcConfigClient onStatus 잠재 결함)

### [P0] onStatus no-op lambda 후 4xx body가 null로 올 때 NPE 위험

`DcConfigClient.calculatePrices` 의 fail-soft 처리:
```java
.onStatus(HttpStatusCode::isError, (req, res) -> { /* fail-soft — no throw */ })
.body(new ParameterizedTypeReference<Map<String, Object>>() {});
```

Spring `RestClient` 의 `onStatus` 에서 handler 가 예외를 던지지 않으면 에러 응답 body 를 그대로 역직렬화 시도한다. dc-config-service 가 404 를 반환할 때 응답 body 는 `ApiResponse`(JSON) 이므로 `Map<String,Object>` 로 역직렬화는 성공한다. 그러나 **해당 body 의 `data` 필드 는 null 이거나 응답 구조가 달라 `extractFinalPrices` 가 빈 Map 을 반환**하는 경로는 코드상 안전하다.

그러나 **5xx 의 경우 응답 body 가 없거나 non-JSON(HTML)** 일 수 있다. Spring RestClient 는 body 역직렬화 실패 시 `RestClientException`(RuntimeException 하위) 을 던지고, 이는 catch 블록에서 흡수되어 `Map.of()` 반환된다. 이 경로는 안전하다.

단, **docker 실 환경에서** dc-config-service 가 `Connection refused` 일 때 RestClient 는 `ResourceAccessException`(RuntimeException 하위) 을 던진다 — catch 블록에서 흡수. 이 경로도 안전하다.

재검토 결과: onStatus no-op 후 body=null 가능성. Spring RestClient 6.x 에서는 `onStatus` handler 가 예외를 던지지 않으면 body 파싱을 계속 시도하고, **4xx/5xx 응답에서 body 가 완전히 비어있으면** `.body(...)` 가 null 을 반환할 수 있다. `extractFinalPrices(null)` 은 `Map.of()` 를 반환하도록 null 체크가 있으므로 안전하다. NPE 없음.

**그러나** dc-config-service 의 `POST /internal/price-calculations` 가 `partnerCode` 로 Partner 미존재 시 404 를 반환하고, **이 404 는 "거래처 DC 미설정"이 아니라 "거래처 자체 미등록"** 임을 구분할 방법이 없다. 두 경우 모두 fail-soft(listPrice) 로 confirm 이 진행된다. spec §5 에 "404(DC 미설정) → fail-soft → listPrice" 로 기재되어 있으나, 실제로는 **partner 미등록 404도 동일 fail-soft** 처리된다. 이는 비즈니스 정합 문제(거래처 미등록 주문이 listPrice 로 통과)이나 spec 에서 명시적으로 구분하지 않았으므로 **현재 설계 의도 내**로 판단. P2 로 분류.

#### P0 실제 발견: extractFinalPrices 의 `finalPrice` 타입 변환 취약성

```java
Object finalPrice = ((Map<String, Object>) lineMap).get("finalPrice");
if (lineId != null && finalPrice != null) {
    result.put(lineId.toString(), new BigDecimal(finalPrice.toString()));
}
```

Jackson 이 JSON 숫자를 역직렬화할 때 `Map<String,Object>` 의 숫자 필드는 **`Integer`, `Long`, `Double`** 로 역직렬화된다. dc-config-service 의 `PriceCalculationResponse.Line.finalPrice` 는 `BigDecimal` 타입이지만, Jackson 기본 설정에서 `Map<String,Object>` 역직렬화 시 소수점 없는 정수는 `Integer`(크면 `Long`), 소수점 있으면 `Double` 로 역직렬화된다.

- `800000` → `Integer(800000)` → `new BigDecimal("800000")` 성공
- `850000.5` → `Double(850000.5)` → `new BigDecimal("850000.5")` 성공 (부동소수 오차 우려)
- `1200000` (int 범위 초과) → `Long` → `new BigDecimal("1200000")` 성공

단, `DeserializationFeature.USE_BIG_DECIMAL_FOR_FLOATS` 가 활성화된 경우 BigDecimal 으로 직접 반환. 활성화 여부에 따라 소수점 값에서 부동소수 오차가 `priceVat` 에 저장될 수 있다.

**실 dc-config-service 응답에서 반올림 후 정수값(원 단위)이 보장** 되면 Double 경유 BigDecimal 오차는 발생하지 않는다. 그러나 `unitRoundTo=0` 또는 소수 반올림 결과가 `.5` 가 남을 경우 부동소수 오차가 DB에 저장될 수 있다. 이는 P0 로 분류한다. IT mock 은 `Map.of("0", new BigDecimal("800000"))` 으로 이미 BigDecimal 을 직접 넣으므로 **IT 에서는 재현되지 않고 실 HTTP 환경에서만 발생**하는 잠재 결함.

권장 수정: `ParameterizedTypeReference<ApiResponse<PriceCalculationResponse>>` 로 타입 안전 역직렬화. 또는 Jackson ObjectMapper 에 `FAIL_ON_UNKNOWN_PROPERTIES=false` + `USE_BIG_DECIMAL_FOR_FLOATS=true` 설정.

---

## 5. 점검 4 — CI skipped=0 여부

diff 에 `@Disabled`, `@Ignore`, `assumeTrue`, `Assumptions.abort` 가 없다. `AbstractPostgresIT` 는 Docker 미가용 시 `assumeTrue` 로 skip 처리하나, 이는 기존 패턴이며 본 슬라이스 신규 추가 아님. CI 환경(Docker 가용) 에서 skipped=0 예상.

---

## 6. 점검 5 — Docker 실 QA 시나리오 설계

### 6.1 사전 확인 — dc-config-service 거래처 DcConfig 시드 여부

dc-config-service `V1__init_dc_config.sql` 에 `INSERT INTO partners` 또는 `INSERT INTO dc_configs` 데이터가 없다. **dc-config-service DB(dc_config_db)에 실 거래처 DcConfig 시드가 없으면 price-calc 는 404(partner 미등록) 로 응답하고 fail-soft(listPrice) 경로를 탄다.**

실 QA 전 아래 쿼리로 시드 존재 여부를 반드시 확인:

```sql
-- dc-config-service DB (dc_config_db) 접속
SELECT p.partner_code, dc.home_discount_rate, dc.commercial_discount_rate,
       dc.unit_round_to, dc.unit_round_mode, dc.source
FROM partners p
LEFT JOIN dc_configs dc ON dc.partner_id = p.id AND dc.is_deleted = FALSE
WHERE p.is_deleted = FALSE
ORDER BY p.partner_code;
```

- **결과 존재**: price-calc 200, DC 적용 단가 저장 경로.
- **결과 없음(빈 테이블)**: price-calc 404(partner 미등록) → fail-soft → listPrice 저장. 이 경우도 정직 기록 의무(spec §5).

### 6.2 전체 실 QA 절차 (Docker Compose 기동 후)

```bash
# 1. 필수 서비스 기동 (gateway, partner-order-service, dc-config-service, partner-auth-service)
docker compose up -d gateway partner-order-service dc-config-service partner-auth-service

# 2. 거래처 JWT 획득 (실 거래처 bizNo/password 사용)
TOKEN=$(curl -s -X POST http://localhost:8080/api/v1/auth/partner-login \
  -H "Content-Type: application/json" \
  -d '{"bizNo":"<실_사업자번호>","password":"<실_비밀번호>"}' \
  | jq -r '.data.token')
echo "TOKEN=$TOKEN"

# 3. 거래처 코드 확인 (토큰 페이로드에서)
PARTNER_CODE=$(echo $TOKEN | cut -d'.' -f2 | base64 -d 2>/dev/null | jq -r '.partnerCode')
echo "PARTNER_CODE=$PARTNER_CODE"

# 4. dc-config-service에 해당 거래처 존재 여부 사전확인
curl -s -X GET "http://localhost:8089/internal/partner-dc-configs/$PARTNER_CODE" \
  -H "X-Internal-Token: <internal_token>"
# 200: DC 설정 존재 (실 DC 적용 예상)
# 404: DC 설정 없음 (fail-soft → listPrice 예상)
```

### 6.3 confirm 호출 + 응답 검증

```bash
# 5. 주문 confirm (실 product UUID 필요)
RESP=$(curl -s -X POST "http://localhost:8080/api/v1/partner-orders/new/confirm" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "lines": [
      {
        "productId": "<실_product_UUID>",
        "categoryKey": "homemulti",
        "quantity": 1,
        "remark": null
      }
    ]
  }')
echo $RESP | jq '.'

# 6. 응답 검증
# 기대: {"success":true, "data":{"orderNo":"...", "status":"DRAFT", "slipNo":null, "slipPublishStatus":"NOT_REQUIRED"}}
echo "status=" $(echo $RESP | jq -r '.data.status')
echo "slipNo=" $(echo $RESP | jq -r '.data.slipNo')
ORDER_NO=$(echo $RESP | jq -r '.data.orderNo')
echo "orderNo=$ORDER_NO"
```

### 6.4 DB 검증 쿼리 (partner_order_db)

```sql
-- partner_order_db 접속
-- A. 주문 기본 상태 확인
SELECT po.order_no, po.status, po.slip_no, po.slip_publish_status,
       po.total_amount, po.idempotency_key,
       po.partner_code, po.confirmed_at
FROM partner_orders po
WHERE po.order_no = '<ORDER_NO>'
  AND po.is_deleted = FALSE;
-- 기대: status=DRAFT, slip_no=NULL, slip_publish_status=NOT_REQUIRED

-- B. 라인 price_vat 확인 (DC 적용값 vs 정상가 비교)
SELECT pol.model_name, pol.category_key, pol.quantity,
       pol.price_vat,           -- DC 적용 후 단가 (또는 listPrice if fail-soft)
       pol.subtotal
FROM partner_order_lines pol
JOIN partner_orders po ON po.id = pol.partner_order_id
WHERE po.order_no = '<ORDER_NO>'
  AND pol.is_deleted = FALSE;
-- DC 적용 시: price_vat != product.selling_price (할인 적용됨)
-- fail-soft 시: price_vat == product.selling_price

-- C. price_vat 가 DC 적용값인지 확인 (product 정상가와 비교)
-- product-service DB 또는 product_catalog 에서 sellingPrice 조회 후 비교
-- price_vat < sellingPrice 이면 DC 적용 성공
-- price_vat == sellingPrice 이면 fail-soft(listPrice)

-- D. revision_no=1 + type=CREATE 존재 확인
SELECT por.revision_no, por.revision_type, por.created_at
FROM partner_order_revisions por
JOIN partner_orders po ON po.id = por.partner_order_id
WHERE po.order_no = '<ORDER_NO>';
-- 기대: revision_no=1, revision_type=CREATE

-- E. history CONFIRMED 이벤트 존재 확인
SELECT poh.event_type, poh.occurred_at, poh.partner_code
FROM partner_order_history poh
JOIN partner_orders po ON po.id = poh.partner_order_id
WHERE po.order_no = '<ORDER_NO>';
-- 기대: event_type=CONFIRMED

-- F. slip_publish_outbox 0건 확인 (슬라이스 D1 — confirm 은 outbox 미사용)
SELECT COUNT(*) as outbox_count
FROM slip_publish_outbox
WHERE partner_order_id = (
  SELECT id FROM partner_orders WHERE order_no = '<ORDER_NO>' AND is_deleted = FALSE
);
-- 기대: 0
```

### 6.5 dc-config-service price_calculation_logs 확인

```sql
-- dc_config_db 접속
-- G. price-calc 감사 로그 확인
SELECT pcl.caller_service, pcl.total_list_amount, pcl.total_final_amount,
       pcl.total_discount_amount, pcl.created_at,
       pcl.request_payload, pcl.applied_config_snapshot
FROM price_calculation_logs pcl
JOIN partners p ON p.id = pcl.partner_id
WHERE p.partner_code = '<PARTNER_CODE>'
ORDER BY pcl.created_at DESC
LIMIT 3;
-- DC 적용 시: total_discount_amount > 0
-- fail-soft 경로 시: price_calculation_logs 에 row 없음
-- (fail-soft = dc-config-service 자체가 호출되지 않거나 404 반환)
```

### 6.6 order-app FE 실 화면 확인

1. `http://localhost:5173` (order-app dev) 또는 실 URL 접속
2. 거래처 로그인 후 주문 입력 → confirm 버튼 클릭
3. **"전송이 완료되었습니다"** 메시지 확인 (버그2 복구 — 기존에는 성공해도 "전송 실패" 표시)
4. 개발자 도구 Network 탭: `/confirm` 응답이 `{success:true}` 이고, samhanApi 정규화 결과 `{ok:true, orderNo:...}` 가 핸들러에 전달되는지 콘솔 확인

### 6.7 fail-soft 경로 기록 의무

dc-config-service 에 해당 거래처 DcConfig 시드가 없어 fail-soft(listPrice) 경로를 탄 경우:
- price_vat 가 product 정상가와 동일함을 SQL 로 확인
- warn 로그 발생 여부 확인: `docker compose logs partner-order-service | grep "DcConfigClient"`
- 결과를 정직하게 기록 (가짜 통과 금지)

---

## 7. Finding 목록

| # | 등급 | 위치 | 설명 |
|---|---|---|---|
| F-01 | P0 | `DcConfigClient.extractFinalPrices` | `Map<String,Object>` 역직렬화 시 `finalPrice` 가 `Double`로 파싱될 경우 부동소수 오차가 `price_vat` DB 값에 저장될 수 있음. IT는 mock BigDecimal 직접 주입으로 미재현. 실 HTTP 환경에서만 발생하는 잠재 결함. 타입 안전 역직렬화(`ParameterizedTypeReference<ApiResponse<PriceCalculationResponse>>`) 또는 `USE_BIG_DECIMAL_FOR_FLOATS` 설정 권고. |
| F-02 | P1 | `PartnerOrderConfirmServiceIT` | spec §6 미커버 엣지: 다중 라인 주문에서 price-calc 부분 응답(일부 lineId 누락) 시 해당 라인이 listPrice로 fallback 되는지 IT 단언 없음. |
| F-03 | P1 | `PartnerOrderConfirmServiceIT` | spec §6 category 매핑 단위 테스트 누락. `mapCategory` private 메서드의 "homemulti→HOMEMULTI", "commercialMulti→COMMERCIAL_MULTI", "기타→OTHER" 매핑을 IT로 간접 확인만 가능하며, 명시적 단위 테스트 부재. |
| F-04 | P2 | `idempotent_reconfirm_returns_same_order_no_without_duplicate_rows` | 멱등 2회 호출 시 `calculatePrices` 미호출 검증 없음(`Mockito.verify(dcConfigClient, Mockito.never()).calculatePrices(...)` 부재). 현재 코드 상 안전하나 회귀 가드 없음. |
| F-05 | P2 | `PartnerOrderConfirmServiceIT` | `calculatePrices`가 `RuntimeException` throw 시 fail-soft(listPrice) confirm 진행 검증 IT 없음. 네트워크 타임아웃 시나리오 미커버. |

---

## 8. 결론

- **P0 1건(F-01)**: 실 HTTP 환경에서 `finalPrice` Double 파싱 경유 부동소수 오차 잠재. 머지 전 수정 권고.
- **P1 2건(F-02, F-03)**: 엣지 커버리지 부족. 머지 전 IT 보강 권고.
- **P2 2건(F-04, F-05)**: 회귀 가드 부재. 후속 슬라이스에서 추가 가능.
- **회귀**: D1 IT 5종 무변경, convert/from-estimate 무변경, VendorOrder 단언 수정 타당.
- **Docker 실 QA**: spec §6 의도(D1 BLOCKED 해소) 실증 전 dc-config-service DcConfig 시드 사전 확인 필수. 시드 없으면 fail-soft(listPrice) 경로로 정직 기록.
- **CI skipped=0** 예상 (Docker 가용 환경 기준).

Finding 총 5건: P0=1, P1=2, P2=2.
