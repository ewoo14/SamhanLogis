# 2026-08-11 머지 후 실서버 검증

## 1. 판정표

| PR | 검증 대상 | 판정 |
|---|---|---|
| #1126 | 수량동기화 칩 — 주품목 → 부자재 타겟, `품목명:수량` | **정상** |
| #1134 | 버전이력 모달 · 거래처 DC 감사 이력 | **정상** |
| #1132 | 기본 구성품만 세트 전개 · 분류 정액DC 우선순위 `S > M > L` | **정상** |
| #1167 | 전년 자료가 없는 입출고 예측의 `—` 표시 | **정상** |
| #1164 | 창고 이력의 UUID actor 비노출 | **정상** |

## 2. 검증 조건

- 검증 시각: 2026-08-11 13:30~13:43 KST.
- 저장소 기준: 사용자가 지정한 `main`, HEAD `0ced104f2`. git 명령은 실행하지 않았다.
- 화면: `clients/desktop`의 Chromium headless를 직접 실행했다. mock, `page.route`, 고정 fixture는 사용하지 않았다.
- API: gateway `http://127.0.0.1:8080`, product-service `http://127.0.0.1:8084`의 실 응답만 사용했다.
- 인증: `POST /api/v1/auth/login`, `dev_master` 실 토큰. 보고서에는 토큰을 기록하지 않았다.
- 최초 렌더러 기동 때 로컬 `clients/web/design-system/dist`가 낡아 `safeActorName` export가 없었다. 소스 수정 없이 현재 소스로 디자인시스템을 로컬 빌드한 뒤 Vite를 재기동했다. 코드·스키마·배포·`samhan-*` 컨테이너 lifecycle·git 조작은 하지 않았다.
- 캡처 상단의 `업데이트 실패` 배너는 Vite 브라우저 실행 중 나타났지만, 아래 실 API 호출과 대상 화면 렌더링은 계속 정상 동작했다. 이번 5건 판정에는 포함하지 않았다.

## 3. #1126 — 수량동기화 칩

### 실 API

`GET /api/v1/quantity-sync-rules?estimateCategory=HOME_MULTI` → HTTP 200:

```json
[{"ruleKey":"UI_HOME_MULTI_AM052BN6PBH1","estimateCategory":"HOME_MULTI","name":"수량 동기화 - AM052BN6PBH1","enabled":true,"aggregation":"SUM","inactiveBehavior":"ZERO","conflictPolicy":"REPLACE","priority":1000,"legacyRef":"UI:AM052BN6PBH1","sources":[{"productCode":"AM052BN6PBH1","productName":"실내기 360CST WIFI내장 13평형","factor":1,"multiplier":null,"roundingMode":null,"displayOrder":null}],"targets":[{"productCode":"PC6NUDK1NW","productName":"판넬 360CST 사각  WIFI","factor":null,"multiplier":1,"roundingMode":"NONE","displayOrder":1},{"productCode":"AWR-WE13N","productName":"유선리모컨(통합)","factor":null,"multiplier":1,"roundingMode":"NONE","displayOrder":2},{"productCode":"FH-LFHLN","productName":"유연호스 L형 4WAY","factor":null,"multiplier":1,"roundingMode":"NONE","displayOrder":3}],"when":{}}]
```

### 실 화면

`/#/products/estimate-items?category=HOME_MULTI`에서 `AM052BN6PBH1`을 검색했다. 한 주품목 행에서 다음 세 부자재 칩과 수량 입력값 `1`을 직접 확인했다.

```text
판넬 360CST 사각 WIFI: 1
유선리모컨(통합): 1
유연호스 L형 4WAY: 1
```

증거: [01-1126-quantity-sync-real-ui.png](../qa/2026-08-11-post-merge/01-1126-quantity-sync-real-ui.png)

판정: **정상**. 실 API의 source가 주품목이고 target 세 건이 부자재이며, 화면 칩도 `품목명:` 뒤에 실제 수량 입력값을 표시한다.

## 4. #1134 — 버전이력 모달 · DC 감사 이력

### 발화 데이터 확인과 실경로 생성

- `GET /api/v1/partner-dc-configs?page=0&size=500` → 210건.
- 210건 각각의 `GET /api/v1/partner-dc-configs/{partnerCode}/audit-logs` → 모두 HTTP 200, 모두 빈 배열이었다.
- 빈 상태를 정상으로 판정하지 않고 화면 `/#/sales/partner-dc-config`에서 거래처 `4563501301`의 특이사항을 `[S-PM-0811 실서버검증]`으로 저장했다.
- 저장 응답 HTTP 200 직후 감사 API가 revision #1을 반환했다. 확인 후 특이사항을 원래 값 `null`로 복구했고 revision #2가 생성됐다.

최종 감사 API 원문:

```json
{"success":true,"code":"OK","message":"성공","data":[{"id":"55e7aa84-c838-435a-820e-5f4a7897b2be","entityId":"489b5c05-bb35-4eac-acb2-46d42c91006a","revisionNo":2,"actorId":"a0000000-0000-0000-0000-000000000001","actorName":"[DEV-SEED] 개발마스터","actorColor":null,"fieldName":"remark","oldValue":"[S-PM-0811 실서버검증]","newValue":null,"changedAt":"2026-08-11T13:41:15.31643"},{"id":"6926f739-929e-4ed4-b7a9-90b896577016","entityId":"489b5c05-bb35-4eac-acb2-46d42c91006a","revisionNo":1,"actorId":"a0000000-0000-0000-0000-000000000001","actorName":"[DEV-SEED] 개발마스터","actorColor":null,"fieldName":"remark","oldValue":null,"newValue":"[S-PM-0811 실서버검증]","changedAt":"2026-08-11T13:41:14.748106"}],"timestamp":"2026-08-11T04:43:30.871266836Z"}
```

최종 업무 데이터:

```json
{"partnerCode":"4563501301","remark":null}
```

### 실 화면

거래처 행의 `보기` → `버전이력` 버튼으로 모달을 열었다. 모달에서 revision #2, 변경 전 `[S-PM-0811 실서버검증]`, 변경 후 `(없음)`, 변경자 `[DEV-SEED] 개발마스터`를 직접 확인했다.

증거: [05-1134-version-history-dc-audit-real-ui.png](../qa/2026-08-11-post-merge/05-1134-version-history-dc-audit-real-ui.png)

판정: **정상**. 발화 데이터가 없던 실 DB에서도 실 화면 write로 감사행을 만들 수 있었고, 실 API의 두 revision이 버전이력 모달에 표시됐다.

## 5. #1132 — 세트 기본 구성품 · 분류 정액DC

### 기본 구성품과 세트 전개

`GET /api/v1/products/AM220AXVHHR1SY/components` → HTTP 200:

```json
[{"componentProductCode":"AM100AXVHHR1","componentName":"DVM S2 동시냉난방 10HP","defaultQty":2.50,"qtyMode":"FOLLOW_SET","componentKind":"OUTDOOR","componentVariant":"S6-1111-MANUAL","isDefault":true,"specText":"S6-1111-MANUAL","displayOrder":1},{"componentProductCode":"AM120AXVHHR1","componentName":"DVM S2 동시냉난방 12HP","defaultQty":1.00,"qtyMode":"FOLLOW_SET","componentKind":"OUTDOOR","componentVariant":null,"isDefault":true,"specText":null,"displayOrder":2}]
```

`POST http://127.0.0.1:8084/products/internal/expand`, body `{"parentModelCode":"AM220AXVHHR1SY","setQty":1}` → HTTP 200:

```json
{"success":true,"code":"OK","message":"성공","data":[{"productId":"c8809e27-d69e-48ac-a348-e8b66dbc3d89","modelCode":"AM100AXVHHR1","modelName":"AM100AXVHHR1","name":"DVM S2 동시냉난방 10HP","quantity":2.50,"unitPrice":5016055,"componentKind":"OUTDOOR","setHead":true,"specification":"S6-1111-MANUAL"},{"productId":"faa93a31-82dd-40a5-9c56-10dcdb4fe44a","modelCode":"AM120AXVHHR1","modelName":"AM120AXVHHR1","name":"DVM S2 동시냉난방 12HP","quantity":1.00,"unitPrice":5808000,"componentKind":"OUTDOOR","setHead":false,"specification":null}],"timestamp":"2026-08-11T04:42:51.318753623Z"}
```

`/#/products/AM220AXVHHR1SY/edit`에서 구성품 2행과 `기본 구성품` 체크 2/2를 직접 확인했다.

증거: [02-1132-bundle-default-components-real-ui.png](../qa/2026-08-11-post-merge/02-1132-bundle-default-components-real-ui.png)

### 정액DC `S > M > L`

실 DB에는 분류축 정액DC 발화 데이터가 없었다. 관리자 API로 기존 품목 `AM040BXMDBH1`의 분류축에 라운드 식별값을 순차 설정하고, 매 단계 제품 조회 응답을 확인했다.

| 설정 직후 | 제품 API HTTP | `fixedDiscountRate` | `fixedDiscountSource` |
|---|---:|---:|---|
| L `실외기` = 8.11 | 200 | 8.11 | `L` |
| M `ECO 냉난방` = 8.12 | 200 | 8.12 | `M` |
| S `단상형` = 8.13 | 200 | 8.13 | `S` |

S 설정 중 `/#/products/classifications`의 상업멀티 → 실외기 → ECO 냉난방 → 단상형 상세 화면에서 `정액DC율(%) = 8.13`을 직접 확인했다.

증거: [03-1132-classification-s-m-l-real-ui.png](../qa/2026-08-11-post-merge/03-1132-classification-s-m-l-real-ui.png)

확인 후 S→M→L 순서로 모두 `null` 복구했다. 최종 제품 조회는 `fixedDiscountRate:null`, `fixedDiscountSource:"NONE"`이었다.

판정: **정상**. 기본 구성품만 2라인으로 전개됐고, 분류 정액DC는 실 API에서 L→M→S로 더 구체적인 축이 실제 우선했다.

## 6. #1167 — 전년 자료가 없는 예측 `—`

`GET /slips/query/inout-analysis?dateFrom=2025-01-01&dateTo=2026-12-31` → HTTP 200. 응답은 73개 모델이며 `monthly[].year`의 실측 집합은 `[2026]`뿐이었다. 즉 전년 2025 자료가 없는 발화 조건이다.

응답 표본:

```json
{"rowCount":73,"years":[2026],"first":{"modelCode":"AJ060MXHNBC1","productName":"실외기_6HP 단배관","categoryKey":"homemulti","inboundQuantity":1,"outboundQuantity":0,"purchaseAmount":909,"salesAmount":0,"profitAmount":null,"profitRate":null,"monthly":[{"year":2026,"month":8,"inboundQuantity":1,"outboundQuantity":0}]},"last":{"modelCode":"TEST-MODEL-0004","productName":"테스트제품-TEST-MODEL-0004","categoryKey":null,"inboundQuantity":0,"outboundQuantity":10,"purchaseAmount":null,"salesAmount":1390000,"profitAmount":null,"profitRate":null,"monthly":[{"year":2026,"month":1,"inboundQuantity":0,"outboundQuantity":10}]}}
```

`/#/inventory/inout-analysis` 수요예측 화면 원문:

```text
전년 2025 → 당년 2026 증감률 1.00배
9월  —
10월 —
11월 —
12월 —
```

증거: [04-1167-inout-forecast-dash-real-ui.png](../qa/2026-08-11-post-merge/04-1167-inout-forecast-dash-real-ui.png)

판정: **정상**. 전년 자료가 없는 실 DB 조건에서 미래 4개월 모두 숫자 `0`이 아니라 `—`로 표시됐다.

## 7. #1164 — 창고 이력 UUID actor 비노출

기존 창고 코드 `2`는 사용자가 명시한 이전 라운드 잔재이며, 생성시각도 2026-08-05다. 이를 신규 결함이나 이번 라운드 데이터로 세지 않고 화면 발화 표본으로만 사용했다.

`GET /inventory/warehouses/{id}/audit-logs` → HTTP 200 원문:

```json
{"success":true,"code":"OK","message":"성공","data":[{"id":"1a23129d-7a77-42ac-a015-fa8d077b64b7","entityId":"794fd5c0-cac6-4d3c-afad-1508aeb7e373","revisionNo":1,"actorId":"a0000000-0000-0000-0000-000000000001","actorName":"a0000000-0000-0000-0000-000000000001","actorColor":null,"fieldName":"name","oldValue":"???? S18","newValue":"상일창고 S18","changedAt":"2026-08-05T21:02:22.565224"}],"timestamp":"2026-08-11T04:42:12.812684965Z"}
```

실 API의 `actorName`은 UUID였지만 `/#/admin/warehouses` → 코드 `2` 편집 → 변경 이력 화면은 다음과 같이 표시했다.

```text
#1 · 변경자 미상 26. 08. 05. 오후 09:02
창고명: ???? S18 → 상일창고 S18
```

DOM 전체에서 원 UUID 문자열은 나타나지 않았다.

증거: [06-1164-warehouse-actor-uuid-hidden-real-ui.png](../qa/2026-08-11-post-merge/06-1164-warehouse-actor-uuid-hidden-real-ui.png)

판정: **정상**. 실 API에 남은 UUID actor가 실제 사용자 화면에서는 `변경자 미상`으로 대체됐다.

## 8. 공유 DB write와 복구 내역

1. 분류 정액DC 관리자 API: `AM040BXMDBH1`이 속한 L/M/S에 8.11/8.12/8.13을 설정하고 모두 `null`로 복구했다. 화면 locator 보정 때문에 동일 검증을 2회 수행했으며, 매 회 `finally`에서 복구했다. 최종 제품 상태는 `rate=null`, `source=NONE`이다.
2. 거래처 `4563501301`: 화면에서 remark `[S-PM-0811 실서버검증]` 저장 후 `null`로 복구했다. 업무 데이터는 원복됐고 감사 revision #1·#2 두 행만 식별자와 함께 남았다.
3. 거래처 `4348703365`: 첫 화면 locator 실패의 cleanup에서 원값 `remark:null`을 `null`로 한 번 PATCH했다. 최종 값은 `null`, 감사 API는 `[]`로 실제 변경행이 생기지 않았다.
4. 그 외 write는 없다.

## 9. QA 런타임 실패 원문

기능 판정 전에 발생한 로컬 QA 런타임/locator 오류이며, 최종 실 화면 검증에서는 해소됐다.

```text
Error: VITE_APP_VERSION ... 2026/08/11-post-merge-live
```

```text
The requested module '/@fs/C:/dev/Samhan-Public/clients/web/design-system/dist/index.js'
does not provide an export named 'safeActorName'
```

```text
locator.waitFor: Error: strict mode violation:
getByRole('heading', { name: '입출고 내역·분석', exact: true }) resolved to 2 elements
```

Chromium은 정상 설치·실행됐으며, 최종 6개 본증거 스크린샷은 모두 육안 검수했다. `00-diagnostic-first-route.png`는 낡은 디자인시스템 산출물 때문에 본문이 비었던 초기 진단 캡처다.
