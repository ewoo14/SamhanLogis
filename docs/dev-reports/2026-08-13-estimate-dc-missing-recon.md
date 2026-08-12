# 2026-08-13 견적 화면 거래처 정액 DC 누락 정찰 — CODEX SOL

## 0. 결론

- 현재 Desktop 견적 작성 화면은 품목 검색 시 `GET /api/products?q={검색어}&size=50&usageScope=ESTIMATE`를 보내고, 응답의 `sellingPrice`와 `fixedDiscountRate`만 가격 계산에 쓴다. 거래처 정액 DC 설정은 요청하지 않는다.
- 공유 `dc_config_db` 실측에서 활성 거래처 DC 설정 210건 중 옵션 정액 DC(360/4way/1way/스탠드/디럭스/1등급 중 하나 이상 양수)를 가진 거래처는 **46곳**이다. 그중 1way DC 보유 거래처는 **45곳**이다.
- 공유 `slip_db`에서 위 46곳의 사업자번호와 일치하는 활성 견적은 **5건**(16라인, 저장 합계 7,215,000원)이고, soft-delete 1건까지 포함하면 6건이다. 활성 5건 중 #1090 V42의 1way 정본 조건에 해당하는 라인이 든 견적은 **3건/6라인**이다.
- 활성 5건은 모두 `QUOTE_DRAFT`이며 `sent_at`과 `converted_at`이 모두 비어 있다. 옵션 DC 거래처에서 발행된 `source_type=ESTIMATE` 전표도 0건이다. 따라서 DB가 증명하는 발송/전환 건은 **0건**이다. 다만 견적서 PDF 다운로드·인쇄·수동 전달은 DB에 감사 흔적이 없어, **실제로 고객에게 나간 문서 수와 그중 DC 누락 수는 셀 수 없다.**
- 주문은 같은 결함이 아니다. 주문 미리보기와 확정은 서버가 `dc-config-service`의 `POST /internal/price-calculations`를 호출해 최종 단가를 받으며, 공유 DB 계산 로그에도 `partner-order-service` 7회가 남아 있다.
- 저장 견적을 전표로 변환할 때는 DC를 새로 계산하지 않고 저장된 견적 금액을 1:1 복사한다. 따라서 누락된 견적은 전표 변환만으로 보정되지 않는다.
- 현 Desktop 견적 폼에서는 DC 호출이 추가됐다가 제거된 이력이 없다. 이 폼이 legacy webview를 폐기하고 처음 들어온 2026-05-09 커밋부터 거래처 DC가 없었다. 반면 legacy estimate-app에는 거래처 DC 조회·적용 로직이 있으므로, 시스템 전체가 원래 그랬던 것이 아니라 **Desktop 대체 화면 이관 누락**으로 보는 근거가 강하다.

## 1. 조사 기준과 제한

- 코드 기준: 로컬 읽기 전용 ref `origin/main` = `668e4d0f5ee0f55c179dc982b35e7b8979346bb3`.
- 지시된 원문 두 파일은 이 로컬 `origin/main`에는 존재하지 않았다. 로컬 원격 추적 브랜치에 남은 커밋 `70fc4e319`(축 불일치 규명)과 `2192668ed`(라이브QA)에서 읽었다. 금지된 fetch/pull 등 git 변경 명령은 실행하지 않았다.
- DB: 실행 중인 공유 `samhan-postgres`의 `dc_config_db`, `product_db`, `slip_db`에 모든 질의를 `BEGIN TRANSACTION READ ONLY ... ROLLBACK`으로 실행했다. 쓰기 0건.
- Docker: 기존 컨테이너 목록과 공유 DB만 읽었다. 새 스택/컨테이너/네트워크를 만들거나 기존 스택을 중지·재기동하지 않았다.
- “옵션 DC 거래처”는 활성 `dc_configs`에서 `discount_360_amount`, `discount_4way_amount`, `discount_1way_amount`, `discount_stand_amount`, `discount_deluxe_amount`, `discount_first_grade_amount` 중 하나 이상이 0보다 큰 활성 거래처로 정의했다. 홈멀티/상업멀티 비율 DC만 가진 거래처는 이 46곳에 포함하지 않았다.

## 2. 견적 화면이 실제 보내는 단가 요청

### 2.1 거래처 선택

1. `EstimateFormPage`가 `searchPartners(q, 8)`을 호출한다: `clients/desktop/src/renderer/routes/EstimateFormPage.tsx:1128-1136`.
2. 실제 HTTP는 `GET /admin/partners/search?q={검색어}&page=0&size=8`이다: `clients/desktop/src/renderer/api/sales.ts:966-980`.
3. 선택 후 저장하는 값은 거래처 snapshot이며, 기존 라인은 `refreshAutoPricesForPartner(nextPartnerId)`로 최근 수동단가만 다시 조회한다: `EstimateFormPage.tsx:1118-1125`.

이 요청/응답에는 옵션 정액 DC 금액이 없다.

### 2.2 품목 선택과 단가 결정

주 경로는 다음과 같다.

1. `searchEstimateProducts()`가 `searchProducts(q, { usageScope: 'ESTIMATE', size: 50 })`를 호출한다: `EstimateFormPage.tsx:1144-1147`.
2. `searchProducts()`의 실제 요청은 `GET /api/products` + query params `q`, `size`, `usageScope`다: `clients/desktop/src/renderer/api/productApi.ts:66-80`.
3. 따라서 실제 요청은 다음 형태다.

```text
GET /api/products?q={검색어}&size=50&usageScope=ESTIMATE
```

4. 검색 후보가 있으면 즉시 반환한다. 후보가 0건일 때만 `GET /slips/lookup-product?modelName={모델명}` fallback을 쓴다: `EstimateFormPage.tsx:1147-1164`, `clients/desktop/src/renderer/api/slip.ts:871-877`.
5. 품목을 고르면 `resolveEstimateCatalogPrice(Number(result.sellingPrice), result.fixedDiscountRate)`만 실행한다: `EstimateFormPage.tsx:1513-1519`.
6. 이 계산기는 판매가에 품목 고정 할인율만 적용한다. 거래처 DC 인자가 없다: `clients/desktop/src/renderer/utils/estimatePrice.ts:2-14`.
7. 거래처가 이미 선택돼 있으면 `GET /slips/price-memory?partnerId=...&productId=...`로 최근 수동단가를 조회하고, hit면 그 단가가 catalog 가격보다 우선한다: `EstimateFormPage.tsx:1523-1541`, `clients/desktop/src/renderer/api/slip.ts:614-625`.
8. 거래처를 나중에 바꾸면 `POST /slips/price-memory/bulk`를 쓴다: `clients/desktop/src/renderer/api/slip.ts:641-658`. 이때 견적 후보에는 `productId/currentUnitPrice/catalogFallback`만 있고 할인 메타데이터가 없으며, `partnerReprice.run()`에도 DC 설정 인자를 넘기지 않는다: `EstimateFormPage.tsx:1340-1346`.

즉 견적 신규 품목 선택과 거래처 변경 재가격은 모두 **판매가/품목 고정 할인율/최근 수동단가** 축이고, 거래처 옵션 정액 DC 축은 연결돼 있지 않다.

### 2.3 #1090 실측 표본

공유 DB 저장값과 라이브QA 관측을 함께 대조했다.

| 거래처 | 공유 DB 1way DC | 품목/공유 DB 판매가 | 견적 GUI 실측 | `calculateSlipDiscount` 규칙 적용값 | 차이 |
|---|---:|---|---:|---:|---:|
| 환경시스템공조-김진혁대표님 | 50,000원 | AC023BN1DBC1 / 316,800원 | 316,800원 | 266,800원 | -50,000원 |
| (주)삼한공조시스템-테스트용 | 60,000원 | AC023BN1DBC1 / 316,800원 | 316,800원 | 256,800원 | -60,000원 |

- 50,000원 조합의 266,800원은 원문 규명에서 실제 Desktop 계산기 실행으로 확인된 값이다.
- 60,000원 조합의 256,800원은 공유 DB의 실제 판매가·DC를 `calculateSlipDiscount`의 옵션 분기(`Math.round(listPrice) - optionDiscount`)에 대입한 값이다: `clients/desktop/src/renderer/utils/slipDiscount.ts:60-70,83-87`.
- 표의 계산값은 “현재 이 견적이 DB에 그 금액으로 저장됐다”는 뜻이 아니라, 동일 실데이터에 전표 계산 계약을 적용했을 때의 비교값이다.

## 3. 거래처 DC API 위치와 호출처

### 3.1 외부 단건/목록 API

- Controller base: `GET/PATCH /api/v1/partner-dc-configs`: `services/dc-config-service/src/main/java/com/samhanair/logis/dcconfig/web/PartnerDcConfigsController.java:49-51`.
- 목록 GET: 같은 파일 `79-90`.
- 단건 GET: `GET /api/v1/partner-dc-configs/{partnerCode}`: 같은 파일 `97-103`.
- Desktop wrapper: `clients/desktop/src/renderer/api/sales.ts:1173-1209`.

호출처:

- `SalesPartnerDcConfigPage`: 목록 조회/수정용 관리자 화면.
- `SlipFormPage`: 거래처 선택 시 단건 GET을 시작하고(`clients/desktop/src/renderer/routes/SlipFormPage.tsx:1819-1828`), 품목 선택 시 설정을 받아 `calculateSlipDiscount()`를 실행한다(`SlipFormPage.tsx:1385-1399,1437-1449`).
- `EstimateFormPage`: **호출 0건**. wrapper import도 없고 `partnerReprice.run()`에 config도 넘기지 않는다.

주의: 외부 단건 GET은 현재 `sales.partner-dc-config VIEW` 권한을 요구한다(`PartnerDcConfigsController.java:97-102`). 견적 폼에 그대로 붙이는 최소 수정은 일반 견적 작성 사용자에게 이 관리자 권한이 있는지 별도 검토가 필요하다.

### 3.2 내부 조회/가격 계산 API

- `GET /internal/partner-dc-configs/{partnerCode}`: `services/dc-config-service/src/main/java/com/samhanair/logis/dcconfig/web/InternalDcConfigController.java:111-124`.
- `POST /internal/price-calculations`: 같은 파일 `126-139`. 정상가+카테고리+옵션을 받아 적용 단가를 계산하고 계산 로그를 남긴다.

확인된 호출처:

- `partner-order-service`: 가격 미리보기와 주문 확정. `DcConfigClient.java:175-194`, `PartnerOrderPriceCalculationService.java:119-169`.
- `slip-service`: 서버 가격 계산 client가 같은 internal POST를 호출한다. `services/slip-service/src/main/java/com/samhanair/logis/slip/service/DiscountPriceClient.java:45-79`.
- `accounting-service`: 단건 internal GET 호출. `services/accounting-service/src/main/java/com/samhanair/logis/accounting/client/PartnerDcConfigClient.java:70`.
- `partner-auth-service`: `/internal/partners/by-bizno/{bizNo}`를 통해 DC를 로그인 응답에 싣는다. `services/partner-auth-service/src/main/java/com/samhanair/logis/partnerauth/client/DcConfigClient.java:20,58`.
- legacy `estimate-app`: bulk `/internal/partner-dc-configs`를 읽어 거래처별 DC 맵을 만들고 1way 등 옵션 금액을 매핑한다. `clients/web/estimate-app/lib/code.js:1980-2021`; 단건 bizNo 경로도 `2135-2185`에서 적용한다.

공유 `price_calculation_logs` 실측은 총 9건이며 `partner-order-service` 7건, `slip-service` 2건이다. 견적 서비스/견적 Desktop 호출 로그는 0건이다.

## 4. 영향 범위 실측

### 4.1 옵션 DC 거래처

| 항목 | 실측 |
|---|---:|
| 활성 DC 설정 row | 210 |
| 옵션 정액 DC 보유 거래처 | **46** |
| 그중 1way DC 보유 | **45** |

1way 금액 분포:

| 1way DC | 거래처 수 |
|---:|---:|
| 20,000원 | 6 |
| 30,000원 | 12 |
| 40,000원 | 9 |
| 50,000원 | 17 |
| 60,000원 | 1 |

옵션 정액 DC는 “현재 활성 설정” 기준이다. 과거 시점 설정이 달랐는지는 모든 row에 변경 이력이 완전하게 남지 않아 전 기간을 재구성할 수 없다.

### 4.2 해당 거래처 견적

`dc_config_db.partners.partner_code`와 `slip_db.estimates.partner_business_no`를 사업자번호 축으로 대조했다. 두 DB의 partner UUID는 동일하지 않아 UUID join 결과는 0건이었고, 업무 식별자인 사업자번호 join에서 다음 5건이 확인됐다.

| 견적번호 | 거래처 | 상태 | 저장 총액 | 라인 | sent/converted |
|---|---|---|---:|---:|---|
| 2026/08/07-1 | (주)삼한공조시스템 | QUOTE_DRAFT | 3,233,000원 | 3 | 없음/없음 |
| 2026/08/07-2 | 주식회사 제이앤피공조 | QUOTE_DRAFT | 1,912,000원 | 1 | 없음/없음 |
| 2026/08/07-4 | 주식회사 제이앤피공조 | QUOTE_DRAFT | 690,000원 | 4 | 없음/없음 |
| 2026/08/07-5 | 주식회사 제이앤피공조 | QUOTE_DRAFT | 690,000원 | 4 | 없음/없음 |
| 2026/08/07-12 | 주식회사 제이앤피공조 | QUOTE_DRAFT | 690,000원 | 4 | 없음/없음 |

- 활성: **5건 / 16라인 / 저장 합계 7,215,000원**.
- soft-delete 포함: **6건**. 삭제된 1건도 `QUOTE_DRAFT`였다.
- V42 1way 정본 조건에 해당하는 `AC...1D/1P...` 라인이 있는 활성 견적: **3건 / 6라인**(2026/08/07-4, -5, -12).
- 세 건의 기존 저장 라인은 세트 전개/과거 가격/수동단가가 섞여 있고, 견적 DB에는 적용 DC source/snapshot이 없다. 현재 catalog 가격에서 현재 DC를 빼서 “당시 누락액”으로 역산할 수 없으므로 누락 총액은 **모름**으로 남긴다.

## 5. 주문 축 비교

주문은 브라우저 화면이 외부 DC 단건 API를 직접 조회하는 구조가 아니다.

1. 입력 중 `POST /partner-orders/price-preview` 호출: `clients/web/order-app/src/samhanApi.ts:404-413`.
2. Controller는 확정과 같은 계산 서비스를 호출하고 계산 불가 시 503으로 막는다: `services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/web/PartnerOrderPricePreviewController.java:30-51`.
3. 서비스는 product의 기준가·카테고리·옵션 플래그를 만든 뒤 `dcConfigClient.calculateDetailed()`를 호출한다: `PartnerOrderPriceCalculationService.java:119-169`.
4. client는 `POST /internal/price-calculations`를 보낸다: `DcConfigClient.java:185-196`.
5. 주문 확정도 동일 계산기를 다시 호출하고, request의 화면 가격을 무시한 서버 `finalPrice`를 저장한다: `PartnerOrderConfirmService.java:83-101,131-165`.

따라서 **주문은 DC를 싣는다.** #1090 라이브QA에서 대상 품목이 주문 화면에 안 나온 것은 `usageScope=ESTIMATE`라 주문 카탈로그에 없었던 별도 문제이며, 주문 가격 경로 자체는 DC 서버 계산 계약에 연결돼 있다.

## 6. 전표 축과 견적→전표 변환

### 6.1 수동 전표 작성

`SlipFormPage`는 거래처 DC 단건 GET을 실행하고 `calculateSlipDiscount()`로 화면 단가를 만든다: `SlipFormPage.tsx:1385-1399,1437-1449,1819-1828`.

전표 저장 서버는 화면에서 이미 확정된 단가를 다시 할인하지 않는다. 이중 DC를 막기 위해 request line 가격을 그대로 저장한다: `services/slip-service/src/main/java/com/samhanair/logis/slip/service/SlipService.java:296-318`.

### 6.2 저장 견적 → 전표

`EstimateService.convert()`는 `slipConverter.convert(estimate)`를 호출한다: `services/slip-service/src/main/java/com/samhanair/logis/slip/estimate/service/EstimateService.java:333-358`.

`EstimateToSlipConverter`는 다음 동작만 한다.

- 견적 partner snapshot을 전표로 복사: `EstimateToSlipConverter.java:80-92`.
- `estimate_lines`를 `slip_lines`로 1:1 복사하며 `unitPriceWithVat`, 공급가, VAT, 합계를 그대로 사용: 같은 파일 `100-130`.
- `sourceType=ESTIMATE`를 기록하고 저장: 같은 파일 `133-140`.

여기에는 `getPartnerDcConfig`, `DiscountPriceClient`, `calculateSlipDiscount` 호출이 없다. **견적에서 빠진 DC가 전표 전환 시 붙지 않는다.**

legacy estimate-app의 즉시 전표 발행 경로도 request가 보낸 `unitPriceVat/unitPriceExVat`를 그대로 전표 라인으로 만든다: `services/slip-service/src/main/java/com/samhanair/logis/slip/publish/SlipPublishService.java:124-195,774-802`. 이 경로는 legacy estimate-app이 앞단에서 DC를 적용한다는 전제다.

공유 `slips`에는 `source_type=ESTIMATE` 활성 전표가 5건 있으나, 5건 모두 옵션 DC 보유 거래처가 아니었다. 현재 영향 5견적의 `converted_at`도 모두 null이다.

## 7. 언제부터인가

읽기 전용 git 결과:

- Desktop `EstimateFormPage.tsx` 최초 추가: `e79e7f42d`, 2026-05-09, `feat(desktop): ... 견적서 UI (legacy webview 폐기...)`.
- 현재 부분 품목 검색 경로: `7f7f8501a`, 2026-08-07.
- `resolveEstimateCatalogPrice(sellingPrice, fixedDiscountRate)` 추가: `6b801a553`, 2026-08-11. 이 변경은 품목 고정 할인율만 추가했다.
- `git log -S getPartnerDcConfig -- EstimateFormPage.tsx` 결과는 0건이다. 즉 이 폼에서 거래처 DC 호출이 있었다가 빠진 commit은 찾지 못했다.
- 외부 거래처 DC controller 활성화는 `03e4cc111`, 2026-05-12이다.
- legacy estimate-app은 이와 별개로 거래처 DC를 읽고 옵션 금액을 적용한다. 내부 DB endpoint 치환은 2026-06-10 commit들에 있지만, 주석과 테스트는 그 이전 live/Notion 거래처별 DC 동작을 보존했다고 명시한다: `clients/web/estimate-app/lib/code.js:1980-2028,2135-2185`.

판정:

- **현재 Desktop 견적 화면만 놓고 보면 2026-05-09 도입 시점부터 거래처 DC가 없었다.** 이후 빠진 회귀 근거는 없다.
- **전체 견적 시스템은 원래부터 DC가 없었던 것이 아니다.** legacy 경로에는 DC가 있었으므로, Desktop 대체 화면에서 해당 계약이 이관되지 않은 결함이다.
- 2026-05-09 이전 실제 GAS/Notion 운영 이력 전체는 이 저장소 git만으로 완전 재구성할 수 없다.

## 8. 이미 나간 견적서 영향

실데이터로 증명할 수 있는 범위:

| 증거 | 건수 |
|---|---:|
| 옵션 DC 거래처의 활성 견적 | 5 |
| 그중 `sent_at` 존재 | **0** |
| 그중 `converted_at` 존재 | **0** |
| 옵션 DC 거래처의 `source_type=ESTIMATE` 전표 | **0** |

따라서 공유 DB 상태 기준으로는 시스템이 발송/전환했다고 표시한 영향 견적이 없다.

그러나 다음은 셀 수 없다.

- `QUOTE_DRAFT` 상태에서 사용자가 PDF를 내려받거나 인쇄해 수동 전달했는지.
- 외부 메일/메신저로 보낸 문서가 있는지.
- 저장된 5건의 당시 단가가 어느 가격 source(세트 배분, 최근 수동단가, 사용자 입력, 거래처 DC)에서 왔는지. estimate line/revision에는 DC snapshot이 없다.

따라서 질문 7의 업무적 의미인 **“실제로 고객에게 나간 견적서 중 DC가 빠진 건수”는 현재 데이터로 못 센다.** DB상 발송/전환 증거 건수는 0이지만, 이를 고객 전달 0건으로 확대 해석하면 안 된다.

## 9. 고칠 방향과 결과 — 결정하지 않음

### 선택지 A — Desktop 견적 폼을 현 수동 전표 계산과 대칭화

변경 요지:

- 거래처 선택 시 DC 설정을 읽고 캐시한다.
- product의 `discountOption`/분류 메타데이터와 거래처 config를 `calculateSlipDiscount()`에 전달한다.
- 신규 품목 선택과 거래처 변경 bulk 재가격 후보에 `discountInput`을 싣고 `partnerReprice.run(partnerId, candidates, config)`를 호출한다.
- 최근 수동단가와 DC 중 우선순위는 현재 `usePartnerPriceRefresh.ts:150-165` 계약과 정확히 맞춘다.

결과:

- 새 견적 화면과 수동 전표 화면의 금액이 맞아진다.
- 변경량은 가장 작다.
- 외부 단건 API가 관리자 `sales.partner-dc-config VIEW`를 요구하므로, 일반 견적 사용자용 read 계약/권한을 별도로 정리하지 않으면 403 또는 과권한 위험이 있다.
- client 계산이라 저장 시 서버가 동일 가격을 검증하지 않으면 변조/구버전 client 가격을 막지 못한다.

기존 견적 소급:

- 코드 배포만으로 DB row는 바뀌지 않는다.
- 기존 견적을 열기만 할 때 hydrate 재계산을 하지 않으면 그대로다.
- 기존 견적에서 거래처/품목을 다시 선택하거나 자동 재가격 후 저장하면 그 시점부터 금액이 바뀔 수 있는 **touch 소급**이 생긴다.

### 선택지 B — 견적용 서버 권위 가격 미리보기 + 저장 검증/스냅샷

변경 요지:

- 주문의 `/partner-orders/price-preview`처럼 견적용 price-preview를 slip-service 또는 전용 pricing 경계에 둔다.
- 서버가 product 정본+거래처 DC로 계산하고 화면은 결과를 표시한다.
- 저장 시 계산 결과와 적용 DC snapshot/source를 견적에 함께 보존하거나 검증한다.

결과:

- 주문과 같은 서버 권위 경계가 생기고, 가격 근거 감사와 향후 영향 집계가 가능하다.
- 권한·장애 시 fail 정책·가격기억/수동단가 우선순위 설계가 필요해 A보다 범위가 크다.
- 현재 `/internal/price-calculations`는 호출마다 `price_calculation_logs`를 쓰므로, 입력 중 미리보기 호출량과 로그 정책도 함께 결정해야 한다.

기존 견적 소급:

- “신규/가격 변경분만 서버 계산”이면 기존 DB는 자동 변경되지 않는다.
- “기존 견적 저장 시 항상 재검증·재계산”이면 다음 저장 때 금액이 바뀌는 **touch 소급**이다.
- 별도 backfill/migration으로 기존 5건을 재계산하면 **명시적 전면 소급**이며, 당시 가격 source가 없어 자동 계산 근거가 부족하다.

### 선택지 C — 견적은 두고 전표 변환 시에만 DC 재계산

변경 요지:

- `EstimateToSlipConverter`에서 현재 DC를 읽어 전표 가격만 다시 계산한다.

결과:

- 견적서에 표시·저장된 금액과 실제 전표 금액이 달라져 고객 제시가와 매출 전표가 불일치한다.
- 과거 견적도 향후 변환 순간의 현재 DC로 계산되어, 견적 DB를 바꾸지 않으면서 전표만 달라지는 **기능적 소급**이 발생한다.
- 이미 할인된 수동/세트 가격을 정가로 오인해 이중 할인할 위험이 있다. 현재 `SlipService.java:301-303`이 서버 재할인을 의도적으로 막는 이유와 충돌한다.

### 개발책임자 결정이 필요한 항목

본 보고서는 선택하지 않는다. 최소한 다음은 금액 정책 결정이다.

1. A(화면 대칭)와 B(서버 권위) 중 어느 경계를 정본으로 할지.
2. 기존 견적은 고정 snapshot으로 보존할지, 다음 편집/저장 때 재가격할지.
3. 이미 저장된 5건을 수동 검토할지, backfill할지, 그대로 둘지.
4. 최근 수동단가·세트 배분가·품목 고정DC·거래처 옵션 DC의 최종 우선순위.

## 10. 답변 요약

1. 실제 견적 단가 요청: `GET /api/products?q=...&size=50&usageScope=ESTIMATE`; `sellingPrice`+`fixedDiscountRate`, 이후 최근 수동단가 조회.
2. 거래처 DC API: dc-config-service 외부 GET/PATCH와 internal GET/price-calculations. 수동 전표·주문·legacy 견적 등은 부르지만 Desktop `EstimateFormPage`는 부르지 않는다.
3. 영향: 옵션 DC 거래처 46곳; 활성 견적 5건(soft-delete 포함 6), V42 1way 후보 3건/6라인.
4. 주문: 서버 가격 미리보기/확정에서 DC를 싣는다.
5. 전표: 수동 작성은 DC를 싣지만, 저장 견적→전표 변환은 저장 가격을 복사할 뿐 새 DC를 붙이지 않는다.
6. 시점: Desktop 폼 최초 도입(2026-05-09)부터 누락. legacy에는 DC가 있어 이관 누락으로 판단.
7. 이미 나간 문서: DB 발송/전환 증거 0건. PDF/인쇄/수동 전달은 로그가 없어 실제 고객 전달 및 누락 건수는 모름.
8. 수정: client 대칭, 서버 권위, 변환 시 재계산 3안. 결과와 소급 범위가 다르며 개발책임자 결정 필요.
9. 기존 금액: 배포만으로는 안 바뀐다. touch 재계산/backfill/변환 재계산을 넣는 순간 소급 효과가 생긴다.

## 11. 라운드 종료 점검

삭제된 추적 파일 0개; `tools/.s24-build-only/build/deep/tracked-writer.mjs`는 git tracked 상태이고 실제 파일도 존재한다; 이번 라운드가 만든 임시 프로세스·컨테이너·네트워크·파일은 없으며 공유 Docker 스택을 중지·재기동하지 않았다.
