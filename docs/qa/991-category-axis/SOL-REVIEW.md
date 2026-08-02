# PR #991 일마감 카테고리 축 재설계 적대검증

- 검토 대상: `fix/monthend-detail-price-variant`
- 검토 HEAD: `5430ef9d772afd015441d0f98245ab3cbce0ab17`
- 검토일: 2026-07-30 KST
- 질문: **이 PR이 바꾼 표면 전체에서, 실 사용자 경로로 재현 가능한 결함이 있는가?**
- 최종 답: **있다. 머지 차단 결함이 복수 존재한다.**
- 머지 판정: **머지 불가**

이번 검토는 코드를 수정하지 않았고 git write, 공유 DB write, Docker 재배포·중단, V67/V60 적용을 하지 않았다. 현재 공유 DB의 실데이터를 읽기 전용으로 측정하고, 사용자에게 허용된 상태 전이와 코드의 결정적 산식을 투영했다. 현재 관련 주문은 DRAFT이고 category migration도 미적용이므로, 공유 데이터를 변경해야만 가능한 최종 POSTED/ISSUED 상태까지는 실제로 만들지 않았다. 아래에서 “관측”은 실데이터 SELECT와 그 상태 전이에 대한 결정적 코드 투영을 함께 뜻한다.

## 1. 각도별 판정

| 각도 | 판정 | 핵심 결과 |
|---|---|---|
| 원 결함 해소 | **실패** | 전표 실제 VAT 포함 단가가 응답·화면에 없고 price history 납품가만 표시된다. 실데이터 경로에서 97,000원 불일치가 난다. |
| DC액 오탐·미탐 | **실패** | 싱글 옵션 정액 50,000원, 멀티 전역DC 48%를 읽지 않는다. 정상 불일치와 DC 누락 통과가 모두 가능하다. 일평균 상쇄 미탐도 있다. |
| `categoryKey` 4단계 보존 | **실패** | 기본 단일·병합·부분·재전환은 보존되지만 전표 복사, revision 복원, 혼합 매출전표의 세금계산서 전환에서 유실된다. |
| `UNKNOWN` 분리 | **실패** | 직접 known/unknown 입력은 분리되지만 혼합 매출전표를 세금계산서로 바꾸면 known 공급가 27,913,674원 전체가 `UNKNOWN`으로 합쳐진다. |
| V67/V60 데이터·순서 | **통과** | 기존 금액 변화 0원. accounting V66→V67, slip V59→V60이며 열린 PR·live branch에서 하위/동일 번호 충돌이 없다. |
| 다른 회계 화면·보고서 | **통과** | 월마감·월계표·원장·거래명세서·홈택스 양식에서 이 PR로 인한 도달 가능한 금액 변화는 찾지 못했다. |
| 증거 무결성 | **실패** | 15/15·20,060,000원·산술 불일치 0건은 재현되지만, “표시 단가=전표 실제 단가”, “4단계 배선 재현”, “DC 정본 우선순위 보존” 증거는 해당 명제를 재현하지 않는다. |

## 2. 확정 결함

### B-01 — 원 결함 미해소: 전표 실제 단가 대신 price history 납품가를 표시

**실 사용자 경로**

실제 주문 `2026/07/29-496`의 유일 라인 `AR80F07D21WS / 냉전 무풍 벽걸이 공청 / singleSets`를 확인·전환 → 출고전표 확정 → 매출전표 100% 배분·전기 → 같은 날짜 일마감 `매출/매출전표` 상세를 연다. 같은 매출전표를 세금계산서로 전환한 뒤 기본 `매출/세금계산서` 상세를 열어도 실제단가 필드 부재는 같다.

**재현 절차**

1. 주문의 권위 VAT 포함 단가는 970,000원이다.
2. 현 전환 경로를 거친 전표 실제 VAT 포함 단가는 B-02의 이유로 1,067,000원이 된다.
3. 해당 제품의 활성 price history는 출고가 1,450,001원, 납품가 970,000원이며 품명 검색 후보는 1건이다.
4. 일마감은 실제 유효단가 1,067,000원을 검증 입력으로만 쓰고 응답에는 넣지 않는다.

**관측된 잘못된 결과**

- 전표 실제 VAT 포함 단가: **1,067,000원**
- 화면 `납품가`: **970,000원**
- 화면과 전표 actual 차이: **97,000원**
- 실제단가 열·DTO 필드: **없음**

화면은 공급가·출고가·납품가·DC액·율만 보여 주므로 사용자는 1,067,000원을 확인할 수 없다. 원 결함인 “표시 단가와 전표 실제 단가 불일치”가 그대로 남는다.

**파일:행 근거**

- 실제 유효단가는 검증 입력으로만 소비: `services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/MonthEndCloseService.java:386-454,622-638`
- 응답에는 `releasePrice`·`deliveryPrice`만 존재: `services/accounting-service/src/main/java/com/samhanair/logis/accounting/web/dto/DailyClosingDetailResponse.java:57-84`
- 화면은 이를 `출고가`·`납품가`로 렌더: `clients/desktop/src/renderer/routes/DailyClosingPage.tsx:653-680`

### B-02 — 주문→전표 전환에서 VAT 포함 권위단가에 VAT를 다시 더함

이 결함은 PR이 새로 연결한 category-aware 생성 경로에서도 기존 단가 도메인 불일치를 그대로 밟는다.

**실 사용자 경로**

주문 `2026/07/29-496`을 정상 확인·전환하고 생성된 출고전표 상세 또는 회계 배분 원천을 연다.

**재현 절차**

1. 주문 라인의 권위 금액은 공급가 881,818원 + VAT 88,182원 = VAT 포함 단가 970,000원이다.
2. 주문 전환은 이 970,000원을 이름 그대로 `unitPriceVat`에 넣는다.
3. slip publish는 `unitPriceVat`를 선택한 뒤 VAT 제외 공급단가를 받는 `SlipLine.create`에 전달한다.
4. `SlipLine`은 970,000원을 공급가로 저장하고 VAT 97,000원 및 `unitPriceWithVat=1,067,000원`을 다시 만든다.

**관측된 잘못된 결과**

- 주문 권위 합계: **970,000원**
- 전표 공급가: **970,000원**
- 전표 VAT: **97,000원**
- 전표 실제 VAT 포함 단가: **1,067,000원**
- 전환 중 증가한 금액: **97,000원**

**파일:행 근거**

- `priceVat`를 `unitPriceVat`로 송신: `services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/service/PartnerOrderConvertService.java:147-155`
- `unitPriceVat`를 공급단가 변수로 선택: `services/slip-service/src/main/java/com/samhanair/logis/slip/publish/SlipPublishService.java:738-754`
- category-aware 공급단가 팩토리 호출: `services/slip-service/src/main/java/com/samhanair/logis/slip/publish/SlipPublishService.java:878-883`
- 공급가에서 VAT·VAT포함단가 재파생: `services/slip-service/src/main/java/com/samhanair/logis/slip/domain/SlipLine.java:153-174,211-218,518-535`
- 회계 원천에 재파생된 VAT포함단가 노출: `services/slip-service/src/main/java/com/samhanair/logis/slip/web/SlipInternalController.java:397-418`

### B-03 — exact model snapshot이 있어도 품명만 검색하여 known 라인을 `AMBIGUOUS`로 버림

**실 사용자 경로**

실제 주문 `2026/07/29-15`의 `AC060CS4FBH2SY / 무풍 4way 냉난방 1등급 / singleSets`를 전환·확정·매출전표 전기 후 일마감 상세를 연다.

**재현 절차**

1. 주문 권위 VAT 포함 단가는 1,810,000원이고 정상 전환 후 현 전표 actual은 1,991,000원이다.
2. exact model `AC060CS4FBH2SY`와 category는 snapshot에 보존된다.
3. product DB에는 같은 품명으로 AC060·AC072·AC090·AC145 총 4개 제품이 있다.
4. 일마감은 exact model이 아니라 `AxisKey.label=productName`만 product-service에 보낸다.

**관측된 잘못된 결과**

- 제품 exact price history: 출고가 **3,121,800원**, 납품가 **1,840,000원**
- 전표 actual: **1,991,000원**
- 화면 출고가·납품가·DC액: 전부 **`—`**
- 판정: **`AMBIGUOUS` / 판정 불가**

known model과 category를 저장하고도 실제 제품을 해소하지 못한다.

**파일:행 근거**

- axis에는 model token을 보존하지만 제품 해소에는 label만 사용: `services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/MonthEndCloseService.java:377-390,415-440`
- product-service는 label token의 LIKE 후보 2건 이상을 `AMBIGUOUS`로 처리: `services/product-service/src/main/java/com/samhanair/logis/product/service/ProductService.java:311-330`
- null 가격을 `—`로 표시: `clients/desktop/src/renderer/routes/DailyClosingPage.tsx:285-286,660-680`

### B-04 — 혼합 매출전표에서 두 번째 축에 첫 번째 상품의 가격을 붙임

**실 사용자 경로**

같은 거래처의 실제 주문 두 건을 각각 전환·확정한 뒤 매출전표 작성 화면에서 두 원천을 함께 100% 배분한다.

- `2026/07/29-496`: `AR80F07D21WS`, `singleSets`, 회계 원천 합계 1,067,000원
- `2026/07/29-373`: `AM480AXVHJH1SY`, `commercialMulti`, 회계 원천 합계 29,638,042원

AR 라인이 첫 원천이 되게 선택한다.

**재현 절차**

1. 화면은 두 원천을 하나의 매출전표 라인으로 합친다.
2. 합계 30,705,042원, 수량 2, 단가 15,352,521원이어서 정상 저장된다.
3. 서로 다른 축이므로 line-level axis는 `UNKNOWN`, allocation에는 두 known 축이 남는다.
4. SALES_SLIP 일마감은 allocation별 축으로 다시 나누지만 두 allocation 모두 `line.getProductName()` 즉 첫 AR 품명을 사용한다.

**관측된 잘못된 결과**

AM480 `commercialMulti` 행의 원 단위 화면값:

- 전표 actual: 약 **29,638,042원**
- 잘못 붙은 AR 출고가: **1,450,001원**
- 잘못 붙은 AR 납품가: **970,000원**
- 실제 AM480 출고가: **48,988,500원**
- 실제 AM480 납품가: **26,943,675원**
- 출고가 오차: **47,538,499원**
- 납품가 오차: **25,973,675원**
- 표시 실제율: **-1,944% / 불일치**

카테고리 행은 분리되지만 가격·검증 참조 productId가 첫 상품으로 오염된다.

**파일:행 근거**

- 여러 원천을 한 line, 첫 품명·코드로 생성: `clients/desktop/src/renderer/routes/accounting/SalesAccountingSlipFormPage.tsx:54-79`
- mixed line은 header `UNKNOWN`, allocation은 source axis 보존: `services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/SalesAccountingSlipCreateAttemptService.java:88-109,229-255`
- allocation 분할 후에도 공통 `line.getProductName()` 사용: `services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/MonthEndCloseService.java:358-374`
- 그 label의 단일 productId 가격을 두 축에 사용: `services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/MonthEndCloseService.java:389-440`

### B-05 — 싱글중대형 옵션 정액 DC 50,000원을 읽지 않아 오탐·미탐

**실 사용자 경로**

중앙유통 주문 `2026/07/29-196`의 `AC023CS1DBC1SY / singleSets`를 주문 상세 “수정”에서 납품가만 바꾸고 전환·확정·전기한 뒤 일마감 상세를 연다. B-02의 재가산과 DC 엔진을 분리하기 위해, 아래 입력은 현 전환 후 목표 accounting actual이 되도록 역산한 값이다. 이 값은 정상 주문서 수정 UI와 scale 2 BigDecimal 계약으로 입력 가능하다.

실데이터 정본:

- product 출고가 1,204,500원
- price history 납품가 740,000원
- `fixed_discount_rate=NULL`
- 중앙유통 1way 옵션 정액 DC 50,000원
- 정상 최종가 690,000원

**재현 절차와 관측 결과**

정상 오탐:

1. 주문 납품가에 627,272.73원을 입력한다.
2. 현 전환·회계 배분 후 actual은 원 단위 **690,000원**이다.
3. 정상 DC액은 `(1,204,500 - 740,000) + 50,000 = 514,500원`이고 actual DC도 514,500원이다.
4. PR은 옵션 DC를 읽지 않아 기대 DC를 464,500원으로 계산한다.
5. 화면은 **`DC액 514,500원 / 불일치`**를 표시한다.

DC 누락 미탐:

1. 주문 납품가에 672,727.73원을 입력한다.
2. 회계 배분 원천의 원 단위 반올림 후 actual은 **740,000원**이다.
3. 정상 690,000원보다 50,000원 비싸므로 DC 50,000원이 누락됐다.
4. PR의 actual DC와 expected DC가 모두 464,500원이어서 화면은 **`확인`**으로 통과시킨다.

**파일:행 근거**

- 주문 수정 화면이 category와 임의 비음수 납품가를 전송: `clients/desktop/src/renderer/routes/SalesPartnerOrderDetailPage.tsx:1541-1557,1573-1584`
- BE가 category와 scale 2 가격을 보존: `services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/service/PartnerOrderUpdateService.java:326-358`
- 싱글 분기는 `release-actual`과 `release-delivery`만 비교: `services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/DiscountRevalidator.java:123-131`
- 일마감 호출에는 거래처·`dc_configs` 입력이 없음: `services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/MonthEndCloseService.java:386-440`
- 정액 옵션 계산 정본: `services/dc-config-service/src/main/java/com/samhanair/logis/dcconfig/service/PriceCalculationService.java:108-117`

### B-06 — 멀티에서 전역DC 48%를 읽지 않고 45% 상수로 오탐·미탐

**실 사용자 경로**

중앙유통 주문에서 `AJ012BN1PBC2 / homemulti`를 선택한 뒤 주문 상세에서 납품가를 수정 → 전환·확정·전기 → 일마감 상세를 연다.

실데이터 정본:

- selling price 495,000원
- `fixed_discount_rate=NULL`
- 중앙유통 home 전역DC 48%
- 정상 최종가 `495,000 × 52% = 257,400원`
- price history 출고가 524,700원, 납품가 288,585원

**재현 절차와 관측 결과**

정상 오탐:

1. 주문 납품가 234,000원을 입력하면 현 전환 후 accounting actual은 **257,400원**이다.
2. 실제 DC는 `524,700 - 257,400 = 267,300원`, 실제율은 원 단위 반올림 **51%**다.
3. PR은 전역DC를 읽지 않고 기대율 45%를 사용하여 **`51% / 기대45% / 불일치`**를 표시한다.

DC 누락 미탐:

1. 주문 납품가 262,350원을 입력하면 accounting actual은 **288,585원**이다.
2. 정상 257,400원보다 **31,185원** 비싸다.
3. 출고가 대비 정확히 45%이므로 PR은 DC 31,185원 누락을 **`확인`**으로 통과시킨다.

**파일:행 근거**

- 주문 confirm이 selling price와 category를 DC 계산으로 보냄: `services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/service/PartnerOrderConfirmService.java:142-155,166-174,248-272`
- 전역DC 계산: `services/dc-config-service/src/main/java/com/samhanair/logis/dcconfig/service/PriceCalculationService.java:52-66,97-105`
- fixed가 없으면 무조건 45 사용: `services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/DiscountRevalidator.java:114-121`

### B-07 — 같은 날 반대 오입력 두 건이 평균에서 상쇄되어 모두 통과

**실 사용자 경로**

실제 중앙유통 DRAFT 주문 `2026/07/29-153`, `2026/07/29-373`의 같은 모델 `AM480AXVHJH1SY / commercialMulti`를 주문 상세에서 각각 수정 → 같은 날짜에 전환·확정 → 별도 매출전표로 전기 → 일마감 상세를 연다.

**재현 절차**

1. 첫 주문 납품가를 23,494,250원으로 수정하면 회계 원천 actual은 **25,843,675원**이다.
2. 둘째 주문 납품가를 25,494,250원으로 수정하면 회계 원천 actual은 **28,043,675원**이다.
3. 제품의 고정DC 45% 정상 단가는 **26,943,675원**이다.
4. 각 라인은 정상보다 각각 **1,100,000원 낮고 높아** 둘 다 잘못됐다.

**관측된 잘못된 결과**

- 개별 오류: 과다DC **1,100,000원**, DC 누락 **1,100,000원**
- 일마감 집계 평균: `(25,843,675 + 28,043,675) ÷ 2 = 26,943,675원`
- 화면 판정: 기대 45% = 실제 45%, **`확인`**

전표 라인 단위 오류 두 건이 하루 평균 한 행에서 사라진다.

**파일:행 근거**

- 집계 key에 거래처·전표·라인 식별자가 없음: `services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/MonthEndCloseService.java:346-355,377-383,641-643`
- 합계/수량 평균으로 한 번만 판정: `services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/MonthEndCloseService.java:623-638`
- 평균 판정임을 구현도 명시: `services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/DiscountRevalidator.java:25-27`

### B-08 — 혼합 매출전표를 세금계산서로 바꾸면 known 금액 전체가 `UNKNOWN`으로 합류

**실 사용자 경로**

B-04의 혼합 매출전표를 전기 → “매출전표 묶음 발행” → 일마감 기본 원천 `세금계산서` 상세를 연다.

**재현 절차**

1. 매출전표 line-level model/category는 mixed라 null이고 allocation 두 개에는 `singleSets`, `commercialMulti`가 남는다.
2. 세금계산서 변환은 allocation을 읽지 않고 매출전표 line-level null만 복사한다.
3. 세금계산서 일마감은 allocation fallback이 없고 세금계산서 라인의 축만 사용한다.

**관측된 잘못된 결과**

- 세금계산서 수량: 2
- 공급가: **27,913,674원**
- VAT: **2,791,368원**
- 합계: **30,705,042원**
- `singleSets` known 공급가: **0원**
- `commercialMulti` known 공급가: **0원**
- `UNKNOWN` 공급가: **27,913,674원**
- 출고가·납품가·DC: **`—` / `MISSING_REFERENT`**

헤더 총액은 유지되지만 카테고리 소계와 DC 검증 대상이 오염된다.

**파일:행 근거**

- 세금계산서는 source line의 model/category만 복사: `services/accounting-service/src/main/java/com/samhanair/logis/accounting/domain/TaxInvoiceLine.java:171-190`, `services/accounting-service/src/main/java/com/samhanair/logis/accounting/domain/TaxInvoice.java:297-315`
- 묶음 발행 경로: `services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/TaxInvoiceBatchFromSalesSlipsService.java:91`
- 세금계산서 일마감은 line axis를 직접 집계: `services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/MonthEndCloseService.java:202-240,346-383`

### B-09 — “전표 복사”가 known `categoryKey`를 버림

**실 사용자 경로**

주문 `2026/07/29-496`에서 전환된 `singleSets` 출고전표 상세 → “전표 복사” → 복사본 완료·확정 → 매출전표 → 일마감.

**재현 절차**

1. 원본은 모델 `AR80F07D21WS`, category `singleSets`, 회계 원천 합계 1,067,000원이다.
2. 사용자에게 노출된 “전표 복사”를 실행한다.
3. `SlipLine.copyOf`가 모델·금액은 복사하지만 `categoryKey`를 전달하지 않는다.

**관측된 잘못된 결과**

- 원본 경로: `singleSets`, 공급가 **970,000원**, VAT **97,000원**
- 복사본 경로: `UNKNOWN`, 공급가 **970,000원**, VAT **97,000원**

엉뚱한 known 축으로 붙지는 않지만 known 금액이 미상으로 유실된다.

**파일:행 근거**

- 사용자 복사 액션: `clients/desktop/src/renderer/routes/SlipDetailPage.tsx:1636,2062,4316`
- 복사 서비스: `services/slip-service/src/main/java/com/samhanair/logis/slip/service/SlipDuplicateService.java:83,115`
- `copyOf`가 category 없는 생성자를 호출: `services/slip-service/src/main/java/com/samhanair/logis/slip/domain/SlipLine.java:146-150,402-418`

### B-10 — 협업 수정 이력 복원이 known `categoryKey`를 버림

**실 사용자 경로**

주문 전환 전표가 `SENT`인 상태에서 상세 “수정”으로 메모 등 overlay를 두 번 수정완료 → 버전이력의 과거 revision에서 “이 시점으로 복원” → 전표 확정 → 매출전표·일마감.

**재현 절차**

1. `slip.audit-overlay UPDATE` 권한 사용자는 SENT 전표를 수정하고 revision을 만들 수 있다.
2. 과거 revision에는 복원 버튼이 노출된다.
3. `SlipSnapshot.Line`에 `categoryKey`와 `sourceOrderLineId`가 없다.
4. 복원은 category 없는 `SlipLine.create`로 라인을 재생성한다.

**관측된 잘못된 결과**

- 복원 전: `singleSets`, 공급가 **970,000원**, VAT **97,000원**
- 복원 후: `UNKNOWN`, 공급가 **970,000원**, VAT **97,000원**
- `sourceOrderLineId`: 함께 null이 되어 주문 역추적도 소실

**파일:행 근거**

- SENT 수정·복원 도달성: `clients/desktop/src/renderer/routes/SlipDetailPage.tsx:1941,3169`, `services/slip-service/src/main/java/com/samhanair/logis/slip/service/SlipService.java:570,642,673-714`
- 과거 revision 복원 UI: `clients/desktop/src/renderer/components/audit/SlipVersionHistoryPanel.tsx:408-419`
- snapshot line에 category/source link 없음: `services/slip-service/src/main/java/com/samhanair/logis/slip/revision/domain/SlipSnapshot.java:150`, `services/slip-service/src/main/java/com/samhanair/logis/slip/domain/Slip.java:2029`
- category 없는 복원: `services/slip-service/src/main/java/com/samhanair/logis/slip/revision/service/SlipRevisionService.java:214`, `services/slip-service/src/main/java/com/samhanair/logis/slip/domain/Slip.java:2164`

## 3. `categoryKey` 보존·`UNKNOWN` 상세 판정

결함이 발견되지 않은 경로도 분리해 판정했다.

- 정상 단일 전환: 주문 category를 payload, slip, internal snapshot, 매출전표, 단일축 세금계산서까지 전달한다.
  - `PartnerOrderConvertService.java:153-154`
  - `SlipPublishService.java:878-883`
  - `SlipInternalController.java:403-416`
- 주문 병합 전환: 각 주문 라인을 별도 payload line으로 유지하고 category를 각각 전달한다.
  - `PartnerOrderMergeConvertService.java:162-172`
- 부분 전환·재전환: 매번 현재 주문 라인의 category를 다시 전달하고 converted quantity가 idempotency key에 반영된다.
  - `PartnerOrderConvertService.java:271`
  - `PartnerOrderMergeConvertService.java:314`
- 취소: `sourceType=PARTNER_ORDER` 원본 전표 취소가 명시적으로 차단되므로 취소 자체에서 축이 유실되는 경로는 찾지 못했다.
  - `Slip.java:1185`
- 단일 sales/tax line에 model/category가 이미 보존된 경우 `(label, modelToken, axis)` key로 known과 `UNKNOWN`은 별도 행이다.
  - `MonthEndCloseService.java:346-383`
- mixed SALES_SLIP도 allocation fallback 자체는 known 축별로 분리한다. B-04의 결함은 축 분리가 아니라 모든 allocation에 첫 품명을 재사용하는 가격 참조 오염이다.
- 전체 계약은 B-08, B-09, B-10 때문에 실패한다.

## 4. DC 정본·우선순위 판정

정본은 다음 이름으로만 판정했다.

1. 고정DC: `products.fixed_discount_rate`
2. 전역DC: 거래처별 활성 `dc_configs` 1행
3. 기본 할인율: `partners`

고정DC가 전역DC보다 우선이라는 순서를 반대로 적용한 실데이터 경로는 찾지 못했다. 실제 `AM480AXVHJH1SY`는 고정DC 45%, 중앙유통 전역DC 48%이며 멀티 분기는 고정DC 45%를 선택한다.

그러나 우선순위 체인은 완성돼 있지 않다.

- 멀티는 고정DC가 null이면 전역DC·기본 할인율을 조회하지 않고 상수 45%를 사용한다: B-06.
- 싱글은 전달된 고정DC도 직접 쓰지 않고 price history 납품가만 비교하며, 전역DC 옵션 정액과 기본 할인율도 입력받지 않는다: B-05.
- 일마감 집계 key에는 거래처가 없어 같은 상품을 거래처별 전역DC·기본 할인율로 판정할 구조가 없다.

따라서 “고정DC 우선은 일부 멀티에서 맞다”와 “전체 정본 우선순위가 구현됐다”는 전혀 다른 명제이며, 후자는 실패다.

## 5. 마이그레이션 번호·적용 순서 판정

**판정: 통과. 마이그레이션 자체의 데이터 손상·금액 변조·번호 충돌은 재현되지 않았다.**

### 실데이터 투영

- accounting DB Flyway 최종: V66
- slip DB Flyway 최종: V59
- 현재 대상 새 컬럼: 모두 미존재
- 전체/비삭제 행:
  - `sales_accounting_slip_lines`: 10,290 / 10,290
  - `sales_accounting_slip_allocations`: 0 / 0
  - `tax_invoice_lines`: 15 / 15
  - `slip_lines`: 383 / 224

V67은 세 회계 테이블에 nullable `model_name VARCHAR(100)`, `category_key VARCHAR(40)`만 추가한다. V60은 `slip_lines`에 nullable `category_key VARCHAR(40)`만 추가한다. UPDATE, default, NOT NULL, check, index가 없다.

- 기존 금액 변화: **0원**
- 기존 행 재작성: 없음
- 기존 회계·세금계산서 새 축: null
- 기존 slip 새 category: null
- A-2에 따라 모두 `UNKNOWN` 대상

근거:

- `services/accounting-service/src/main/resources/db/migration/V67__preserve_sales_category_axis.sql:1-13`
- `services/slip-service/src/main/resources/db/migration/V60__preserve_sales_category_axis.sql:1-4`

### 번호·순서

- accounting: V66 → V67
- slip: V59 → V60
- 서로 다른 DB·서비스라 V67과 V60 사이 전역 순서 의존은 없다.
- 두 서비스 모두 Flyway 기본 `outOfOrder=false`에서 연속 번호다.

2026-07-30 18:04 KST 기준 다음을 읽기 전용으로 대조했다.

- 열린 PR 4개: #984, #991, #993, #996
- GitHub live branch 21개
- 로컬 `refs/remotes/origin`

accounting/slip의 main 이후 신규 migration은 #991의 V67/V60뿐이다. #984의 V27/V28은 product-service이고 #993/#996 현 head에는 accounting/slip 신규 migration이 없다. 동일 번호 또는 미적용 하위 번호 충돌은 없다. PR #996에서 발견된 V29 대 V27/V28 유형의 충돌은 이 두 서비스에는 없다.

V67은 3개, V60은 1개 테이블에 적용 시 짧은 `AccessExclusive` lock이 필요하지만 점검 시 진행 중 transaction은 0개였고 현재 사용자 경로에서 lock 장애는 재현되지 않았다. 이번 검토에서는 migration을 적용하지 않았다.

## 6. 다른 회계 화면·보고서 판정

**판정: 이 PR로 인한 도달 가능한 금액 변화 없음.**

- 월마감: journal line 집계만 사용
  - `services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/MonthEndCloseService.java:114-127`
- 월계표: `JournalLineRepository` 집계만 사용
  - `services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/MonthlySummaryService.java:72-109`
- 원장: journal line만 조회
  - `services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/LedgerService.java:79-107`
- 거래명세서: 기존 세금계산서 `unitPrice`, `supplyAmount`, `vatAmount`만 사용
  - `services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/StatementBatchService.java:59-65,104-122`
- 홈택스 양식: 새 model/category를 읽지 않고 기존 금액만 사용
  - `services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/HometaxExportService.java:489-502`

위 서비스 파일은 PR diff에 없고 새 snapshot 필드도 읽지 않는다. 사용자 제외 범위에 따라 홈택스 파일 생성과 계산서 발행·국세청 업로드 엑셀은 실행·조사하지 않았다.

## 7. 증거 무결성 대조

### 재현된 수치

공유 DB read-only SELECT로 다음을 독립 재현했다.

- 활성 `tax_invoice_lines`: **15행**
- `quantity × unit_price`와 저장 공급가 산술 일치: **15/15**
- 산술 불일치: **0건**
- 저장 공급가 합계: **20,060,000원**
- 재계산 공급가 합계: **20,060,000원**
- 현재 `tax_invoice_lines.model_name/category_key` 컬럼: **0개**

V67이 nullable ADD만 하고 backfill하지 않으므로 기존 15행이 적용 후 전부 null→`UNKNOWN`이 된다는 **투영은 맞다**. 다만 migration 미적용 상태라 `15/15 UNKNOWN`은 저장된 새 컬럼을 직접 읽은 실측값이 아니다.

실제 기본 일마감 세금계산서 원천은 `ISSUED`만 읽는다.

- 현재 ISSUED line: **8행**
- 산술 일치: **8/8**
- 공급가 합계: **12,560,000원**

20,060,000원에는 DRAFT·CANCELLED line도 포함된다. 따라서 이 전체 합계는 실제 일마감 화면 경로의 금액 증거로 사용할 수 없다.

### 무결성이 깨진 주장

1. **슬3 “표시값이 실제 전표 값과 일치”**
   - 문서는 fixture의 단가를 적었지만 응답과 비교한 값은 수량·공급가뿐이다.
   - 실제단가는 내부 검증 입력일 뿐 DTO·화면에 없다.
   - B-01의 실데이터 경로에서 97,000원 불일치가 재현된다.
   - 근거: `docs/dev-reports/2026-07-30-991-s3-daily-closing-display.md:92-106,143-147`

2. **슬2 “신규 원천 snapshot 배선 known 2 + unknown 1”**
   - 해당 service test는 `TaxInvoiceLine.create` 후 private `modelName/categoryKey`를 reflection으로 직접 주입한다.
   - 주문→전표→매출전표→세금계산서 4단계 배선을 통과하지 않는다.
   - 수정 IT도 `SalesAccountingSlipLine`을 직접 생성한 known 1 + unknown 1이다.
   - 근거: `docs/dev-reports/2026-07-30-991-s2-source-wiring.md:129`, `services/accounting-service/src/test/java/com/samhanair/logis/accounting/service/DailyClosingDetailServiceTest.java:373,567`, `services/accounting-service/src/test/java/com/samhanair/logis/accounting/it/DailyClosingRevalidationIT.java:225`

3. **슬4 “고정DC가 전역 기본 45%보다 우선”**
   - 45%는 `dc_configs`를 읽은 전역DC가 아니라 코드 상수다.
   - 테스트는 `fixedDc=30`과 상수 45만 비교하고 거래처 전역DC·기본 할인율 입력이 없다.
   - B-05·B-06의 실제 정본 경로가 반증한다.
   - 근거: `docs/dev-reports/2026-07-30-991-s4-single-large-dc-validation.md:14-16,87,248`, `services/accounting-service/src/test/java/com/samhanair/logis/accounting/service/DiscountRevalidatorTest.java:176-199`

4. **슬4 세금계산서 header 수**
   - 문서의 CANCELLED 3 / DRAFT 4 / ISSUED 13 header는 현재 공유 DB에서 재현되지 않았다.
   - 현재 활성 header는 1 / 2 / 9이고 활성 line은 문서와 같은 3 / 4 / 8이다.
   - 공유 DB가 다른 트랙에서 변동할 수 있어 당시 수치를 허위라고 단정하지 않고, 현재 재현성은 **판정불가**로 둔다.

## 8. 머지 판정

**머지 불가.**

V67/V60의 데이터·번호 안전성은 통과했지만 다음이 모두 금액·회계 실사용 경로의 차단 사유다.

- 원 결함인 실제 전표 단가 불일치가 97,000원으로 재현된다.
- 주문→전표에서 VAT 97,000원을 재가산한다.
- exact model을 보존하고도 동명 품목을 판정하지 못한다.
- mixed line에서 다른 상품 가격을 붙이고, 세금계산서 전환 시 known 공급가 27,913,674원을 `UNKNOWN`으로 합친다.
- 싱글 옵션 DC 50,000원과 멀티 전역DC 48%를 읽지 않아 오탐·미탐이 모두 난다.
- 전표 복사와 revision 복원이 known category를 버린다.

## 9. 이 라운드가 보지 않은 것

- A-1 ingest 저장·backfill 방향 재검토 및 구현
- 계산서 발행·국세청 업로드 엑셀
- 홈택스 파일의 실제 생성·업로드
- 공유 DB write가 필요한 최종 POSTED/ISSUED live 상태 생성
- V67/V60 실제 적용
- Docker 재배포·중단
- PR 표면 밖의 일반 코드 품질, 테스트 품질, 보안, 성능
- 발견 결함의 수정안 구현

이 제외 범위는 위 결함의 도달성을 약화하지 않는다. 각 결함은 현재 실데이터 원천, 사용자에게 노출된 상태 전이, 결정적 금액 산식으로 재현된다.
