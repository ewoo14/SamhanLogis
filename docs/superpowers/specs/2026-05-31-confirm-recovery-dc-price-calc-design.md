# 슬라이스 — confirm 경로 복구 (DC 정식 연동 + FE res.ok)

- **작성일**: 2026-05-31
- **상태**: 설계 확정 (개발책임자 승인 2026-05-31)
- **유형**: BE(partner-order-service) + FE(order-app) 버그 복구 슬라이스
- **선행**: 슬라이스 D1(confirm 자동발행 폐지, #329 `8ff363f1`) 머지. 본 슬라이스는 D1 Docker 실 QA 가 BLOCKED 로 드러낸 **기존 버그 2건** 복구.
- **관련 메모리**: [[feedback_no_fake_data_ever]], [[feedback_uuid_no_user_visibility]]

---

## 1. 배경 / 문제 (D1 실 QA 가 드러낸 기존 버그)

D1 Docker 실 QA 에서 실 거래처 confirm 직접 호출이 **BLOCKED** 됐다. 근본 원인 = **D1 이전부터 누적된 기존 버그 2건**(D1 변경과 무관):

### 버그 1 — DcConfigClient 가 존재하지 않는 엔드포인트 호출 + 죽은 응답 스키마
- `DcConfigClient.fetchDcConfig` 가 `GET /api/v1/dc-configs/{partnerCode}` 호출 → dc-config-service 에 **그 경로 없음**(미매핑 `/api/v1/` → 403). 403 은 `onStatus(non-404 4xx)` 분기에서 `BusinessException` 으로 던져져 **confirm 전체 실패**(fail-soft 미작동).
- 게다가 `confirm.applyDc`/`mapCategoryToDcKey` 가 기대하는 map 키(`homeDiscount/commDiscount/singleDiscount/singlePartsDiscount/commPartsDiscount/oldDiscount/incDiscount/specDiscount`)는 **어떤 실제 엔드포인트 응답과도 불일치**. 실 internal 엔드포인트 `DcConfigResponse` 는 `homeDiscountRate/commercialDiscountRate` + 옵션 정액 + 반올림 필드. → confirm 의 DC 적용은 **죽은 스켈레톤**(M3 "schema 미확정" 주석), 404 시 fail-soft 로 sellingPrice 그대로 써온 것.

### 버그 2 — order-app confirm 성공 판정 res.ok 불일치
- `samhanApi.sendOrderFromUi` 가 `r.data`(= `ApiResponse {success, code, message, data, timestamp}`)를 그대로 반환.
- `index.html` 성공 핸들러는 레거시 GAS 계약(`{ok}`)을 기대해 `res.ok` 로 성공 판정 → ApiResponse 엔 `ok` 없음 → 항상 `undefined`(falsy) → **성공해도 "전송 실패" 표시**.

### 정식 경로 존재
dc-config-service 는 `POST /internal/price-calculations`(`PriceCalculationRequest` → `ApiResponse<PriceCalculationResponse>`)로 **DC 적용 단가를 서버계산**해 제공한다. 호출자(estimate/partner-order)가 라인별 정상가+카테고리+옵션을 보내면 finalPrice 를 응답. confirm 은 이 정식 경로를 써야 한다.

## 2. 결정 (개발책임자 확정 2026-05-31)

| # | 결정 | 근거 |
|---|---|---|
| D-CR-01 | **confirm DC 적용 = `/internal/price-calculations` 정식 연동.** 죽은 `fetchDcConfig`/`applyDc`/`mapCategoryToDcKey` 제거. | dc-config-service 가 DC 단가의 단일 소유자(아키텍처 정합). 실 DC 적용. |
| D-CR-02 | **fail-soft 보존**: price-calc 404/5xx/연결실패 → listPrice 사용(DC 미적용)으로 confirm 진행. | 기존 "dc-config 응답 비면 sellingPrice" 사상 + 가용성(회계 critical path 보호). |
| D-CR-03 | **FE order-app: `sendOrderFromUi` 응답 정규화** — ApiResponse → 레거시 핸들러 기대형 `{ok, orderNo, error}`. | 최소·국소 수정(거대 index.html 미변경), 성공 표시 복구. |

### 명시적 제외
- 옵션 정액 DC(360/4way/스탠드 등): `ConfirmLineRequest` 에 옵션 플래그 없음 → 옵션 false(rate DC 만). confirm 라인 모델에 옵션 추가는 후속.
- estimate 경로의 DC 연동(별도 — 본 슬라이스는 confirm 만).
- dc-config-service 자체 변경 없음(기존 엔드포인트 사용).

## 3. 변경 단위

### 3.1 partner-order-service (BE)

- **`DcConfigClient`**:
  - `fetchDcConfig(String)` 제거.
  - 신규 `calculatePrices(PriceCalculationRequest req) → Map<String,BigDecimal>`(lineId→finalPrice) 또는 `PriceCalculationResponse`:
    - `POST /internal/price-calculations`, `X-Internal-Token`, body=req.
    - `ApiResponse<PriceCalculationResponse>` 파싱 → lineId별 finalPrice 추출.
    - 404/4xx/5xx/RuntimeException → **fail-soft**(빈 결과 반환 → 호출자가 listPrice 사용). 로그 warn.
  - DTO: partner-order 측 `PriceCalculationRequest`/`Response` 미러 record 추가(또는 Map 빌드). callerService="partner-order-service".
- **`PartnerOrderConfirmService.confirm`**:
  - `dcConfigClient.fetchDcConfig` + `applyDc` + `mapCategoryToDcKey` 제거.
  - product 카탈로그 조회 후 라인별 PriceCalculationRequest.Line 빌드: `lineId`=주문 라인 임시 키(예: index 또는 productId), `listPrice`=product sellingPrice, `category`=mapCategory(categoryKey), `quantity`, 옵션 flags=false.
  - `calculatePrices` 호출 → lineId별 finalPrice 맵.
  - 라인 생성 시 `priceVat` = finalPrice(있으면) else listPrice(fail-soft).
  - 카테고리 매핑 helper `mapCategory(categoryKey)`: homemulti/homeDefaults→"HOMEMULTI", commercialMulti→"COMMERCIAL_MULTI", 그외→"OTHER".
  - D1 동작(DRAFT 생성, slip 미발행, createFromConfirm, revision/history) **유지**.

### 3.2 FE order-app

- **`clients/web/order-app/src/samhanApi.ts` `sendOrderFromUi`**: `.then((r) => r.data)` → `.then((r) => ({ ok: r.data?.success === true, orderNo: r.data?.data?.orderNo ?? null, error: r.data?.message ?? null }))`. (실패 시 axios reject 는 기존 http 에러 처리에 위임 — 핸들러 catch.) 레거시 핸들러(`res.ok`/`res.error`)와 정합.
- index.html 미변경(정규화로 흡수).

## 4. 흐름 (복구 후)

```
거래처 confirm → PartnerOrderConfirmService.confirm
  ① 멱등 가드
  ② product 카탈로그 listPrice + categoryKey
  ③ PriceCalculationRequest 빌드 → DcConfigClient.calculatePrices(POST /internal/price-calculations)
       └ 200 → lineId별 finalPrice / 404·5xx → fail-soft(빈 → listPrice)
  ④ createFromConfirm(DRAFT) + 라인 priceVat=finalPrice + recomputeTotal + save
  ⑤ history CONFIRMED + revision CREATE
  → ConfirmResponse{ orderNo, status=DRAFT, slipNo=null }

order-app: sendOrderFromUi → { ok:true, orderNo } → "전송이 완료되었습니다"
```

## 5. 에러 / 엣지

| 상황 | 동작 |
|---|---|
| price-calc 404 (DC 미설정) | fail-soft → listPrice (DC 미적용) confirm 진행 |
| price-calc 5xx / 연결실패 | fail-soft → listPrice + warn 로그 |
| internal-token 미설정 | 기존대로 INTERNAL_ERROR(운영 misconfig 지표) |
| 멱등 재confirm | 기존 유지(동일 주문 반환) |

## 6. 테스트 전략

- **confirm IT** (Testcontainers, `DcConfigClient` @MockBean):
  - `calculatePrices` stub(lineId→finalPrice) → 주문 라인 `price_vat=finalPrice` 단언.
  - `calculatePrices` 예외/빈 → `price_vat=listPrice`(fail-soft) 단언.
  - D1 IT 5종 회귀(DRAFT/slipNo null/멱등/revision/history) 유지.
- **category 매핑 단위테스트**: homemulti→HOMEMULTI 등.
- **FE**: `sendOrderFromUi` 정규화 단위(가능 시) — `{ok:true}` 반환 확인.
- **Docker 실 QA** ([[feedback_no_fake_data_ever]] 실 캡처만): 실 거래처 confirm → **이제 price-calc 정상 200** → partner_order_db `status=DRAFT` + `slip_no IS NULL` + DC 적용 단가(price_vat) psql 적중 + slip_db 신규 0건 → order-app "전송이 완료되었습니다" 실 화면. (D1 BLOCKED 였던 실 confirm happy-path 실증.)

## 7. 마이그레이션 / 배포

- Flyway 불필요(스키마 변경 없음). dc-config-service 변경 없음.
- partner-order-service + order-app 배포.

## 8. 미해결 / 후속

- confirm 라인 옵션 플래그(360/4way/스탠드 등) → 옵션 정액 DC 적용 (ConfirmLineRequest 확장 후속).
- estimate 경로 DC 연동 점검(동일 price-calc 사용 여부).
- DcConfigClient 의 레거시 죽은 코드 잔재 전수 점검.
