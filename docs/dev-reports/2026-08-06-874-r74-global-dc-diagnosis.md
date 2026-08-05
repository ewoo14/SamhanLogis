# R74 — #874 전역DC 진단 보고서

## 결론

이번 라운드에서는 수정하지 않았다. 화면 계산 경로에 서로 독립적인 차단점이 2개 확인되어 “한 곳만” 고치면 불변식을 보장할 수 없기 때문이다.

1. 품목 `AR09TXEAAWKNEU-04`의 실제 응답에서 `categoryKey`가 `null`이다. 화면은 이 값을 `OTHER`로 분류하여 홈/상업 전역DC를 선택하지 않는다.
2. 화면이 실제로 호출하는 전역DC 단건 조회가 HTTP `500`이다. FE `getPartnerDcConfig()`는 예외를 삼키고 `null`을 반환하므로, 전역DC가 존재해도 계산기에 전달되지 않는다.

따라서 현재 실패의 1차 계산 분기 누락은 `categoryKey: null`이고, 그 전에 전역DC 단건 조회 API 자체도 별도 차단점이다. 한 지점만 수정하는 것은 안전하지 않다.

## 실측 표

| 점검 항목 | 실측 원문/코드 | 판정 |
|---|---|---|
| 홈/상업 구분 | `SlipFormPage.tsx:778-782`가 상품 `categoryKey`가 `homemulti`면 `HOMEMULTI`, `commercialMulti`면 `COMMERCIAL_MULTI`, 그 외는 `OTHER`로 변환 | `categoryKey`가 판정 필드 |
| 대상 품목 분류 | `GET /api/products?q=AR09TXEAAWKNEU-04&size=20` 응답의 `categoryKey: null` | **비어 있음 — 홈/상업 판정 불가** |
| 전역DC 단건 요청 | `GET /api/v1/partner-dc-configs/4348703365` | 화면이 `getPartnerDcConfig()`에서 호출 |
| 전역DC 단건 응답 | HTTP `500`, `code: INTERNAL_ERROR`, `data: null` | FE가 `null` 폴백 |
| 전역DC 목록 대조 | `GET /api/v1/partner-dc-configs?page=0&size=250&keyword=4348703365` 응답에 `homeMultiDc: "48%"`, `commercialMultiDc: "49%"` | 행/값은 존재하며 목록 DTO 변환은 정상 |
| 비율 단위 | DB 실측 `0.4800`; 목록 API 외부 응답은 `"48%"`; `PartnerDcConfigResponse.formatPercent()`가 내부 0~1을 ×100하여 표시 문자열로 변환; FE 헬퍼는 `rate / 100` 계산 | **FE 계산기는 48 percent 공간을 기대**. `0.48`을 그대로 받으면 0.48%로 오해하는 경로가 됨 |
| 옵션 정액 6종 | 목록 API 응답에서 `threeSixty`, `fourWay`, `oneWay`, `stand`, `deluxe`, `firstGrade` 모두 `null` | 이 경로의 `calculateSlipDiscount()`는 옵션 정액을 읽지 않으므로 계산을 막지 않음 |
| 고정DC | 상품 응답 `fixedDiscountRate: null` | 고정DC 우선 분기에 들어가지 않음; R72의 `0` 예외와 무관 |

## 호출·계산 경로

```text
상품 검색 응답
  └─ categoryKey = null
       └─ SlipFormPage: OTHER
            └─ calculateSlipDiscount: raw = null
                 └─ 정가 1,080,000

거래처 선택
  └─ GET /api/v1/partner-dc-configs/4348703365 → 500
       └─ getPartnerDcConfig() catch → null
            └─ 전역DC 설정 미전달
```

## 원문

### 1. 상품 검색 응답

요청:

```text
GET http://localhost:8080/api/products?q=AR09TXEAAWKNEU-04&size=20
Authorization: Bearer <dev_master token>
```

응답 본문:

```json
{"success":true,"code":"OK","message":"성공","data":{"content":[{"id":"d7f488a5-6259-379c-8035-ed551e75a102","name":"삼성 윈드프리 9평형","modelName":"AR09TXEAAWKNEU-04","productCode":"AR09TXEAAWKNEU-04","categoryId":"00000000-0000-0000-0000-000000001004","sellingPrice":1080000.00,"status":"ACTIVE","serialManaged":true,"goods":true,"modelCode":"AR09TXEAAWKNEU-04","productType":"SINGLE","usageScope":"BOTH","estimateCategory":null,"usageScopeManual":false,"displayOrder":null,"categoryKey":null,"fixedDiscountRate":null,"discountFlags":"000000","releasePrice":1080000.00,"deliveryPrice":900000.00,"hasVariableDiscount":false,"parentSetModelCode":null,"specification":"9평형 / R32 / 인버터 / 윈드프리"}],"pageable":{"pageNumber":0,"pageSize":20,"sort":{"unsorted":true,"sorted":false,"empty":true},"offset":0,"paged":true,"unpaged":false},"totalPages":1,"totalElements":1,"last":true,"first":true,"numberOfElements":1,"size":20,"number":0,"sort":{"unsorted":true,"sorted":false,"empty":true},"empty":false},"timestamp":"2026-08-05T17:17:22.555252318Z"}
```

### 2. 화면의 전역DC 단건 조회 응답

요청:

```text
GET http://localhost:8080/api/v1/partner-dc-configs/4348703365
Authorization: Bearer <dev_master token>
```

응답 본문:

```json
{"success":false,"code":"INTERNAL_ERROR","message":"서버 내부 오류가 발생했습니다.","data":null,"timestamp":"2026-08-05T17:17:33.475322619Z"}
```

FE 구현은 `clients/desktop/src/renderer/api/sales.ts:1193-1201`에서 이 오류를 `null`로 변환한다.

### 3. 목록 API 대조 응답

요청:

```text
GET http://localhost:8080/api/v1/partner-dc-configs?page=0&size=250&keyword=4348703365
Authorization: Bearer <dev_master token>
```

응답의 대상 행:

```json
{"partnerCode":"4348703365","companyName":"주식회사 엠엠시스템에어(고영현)","homeMultiDc":"48%","commercialMultiDc":"49%","flexibleHoseTypeI":"Yes","threeSixty":null,"fourWay":null,"oneWay":null,"stand":null,"deluxe":null,"firstGrade":null,"unitProcess":"No","remark":null}
```

## 코드 근거

- `clients/desktop/src/renderer/routes/SlipFormPage.tsx:778-787`: `categoryKey`로 홈/상업 선택 후 할인 계산.
- `clients/desktop/src/renderer/utils/slipDiscount.ts:30-40`: `HOMEMULTI`/`COMMERCIAL_MULTI` 외에는 전역DC raw를 `null`로 만들고 정가 반환.
- `clients/desktop/src/renderer/utils/slipDiscount.ts:35,39`: 전역DC는 percent 공간으로 파싱하고 `rate / 100`으로 계산.
- `services/dc-config-service/src/main/java/com/samhanair/logis/dcconfig/dto/PartnerDcConfigResponse.java:41-46`: 내부 `0~1` 비율을 외부 `48%` 문자열로 변환.
- `services/dc-config-service/src/main/java/com/samhanair/logis/dcconfig/web/PartnerDcConfigsController.java:56-63`: 단건 조회는 `dcConfigService.getByPartnerCode()` 결과를 DTO로 변환.

## 불변식 영향

| 불변식 | 이번 진단에서의 상태 |
|---|---|
| 전역DC 품목 561,600 | 미충족: `categoryKey=null` 및 단건 조회 500 |
| 고정DC 970,200 | 기존 R73 PASS 유지 대상이며 코드 수정하지 않음 |
| 전역DC 없는 거래처 정가 | 코드 수정하지 않아 영향 없음 |
| 저장 HTTP 201 / `discountInfo` / UUID 비공개 | 코드 수정하지 않아 영향 없음 |
| 화면값=저장값 | 이번 라운드에서는 수정·재저장하지 않음 |

## 수정 여부

수정하지 않았다. `categoryKey` 보정만 해도 단건 전역DC API 500이 남고, 단건 API만 고쳐도 `categoryKey=null`이 남는다. 두 결함의 수정 범위와 회귀 검증을 분리해 다음 라운드에서 각각 처리해야 한다.

새 파일:

- `docs/dev-reports/2026-08-06-874-r74-global-dc-diagnosis.md`
