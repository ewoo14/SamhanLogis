# PR #991 적대검증(재수렴) 보고서

- 검증일: 2026-07-31
- 대상 브랜치: `fix/monthend-detail-price-variant`
- 대상 HEAD: `6b67e307b7772eed0c8fdafde0bf2dc317c141cb`
- 역할: 구현자가 아닌 적대검증 리뷰어
- 독립 조사축 5개: 실DB 금액, 프론트 표시 표면, SlipPublish 전체 발행 표면, 증거·CI·전체 테스트, 배포·라이브QA 게이트. 실행 환경의 동시 슬롯 상한 4 때문에 4개를 동시에 시작하고 빈 슬롯에 다섯째를 즉시 이어 실행했다.
- 제약 준수: git 쓰기, Docker 이미지 재빌드, 백엔드 재기동, 공유 DB 쓰기를 하지 않았다. SQL은 모두 `docker exec ... psql ... -c "SQL"` 형식의 읽기 전용 조회로 실행했다.

## 최종 판정: **BLOCK**

| 머지 게이트 | 판정 | 직접 관측 근거 |
|---|---:|---|
| ① 실 사용자 경로 재현 가능 결함 0 | **실패** | 이 fix가 새로 붙인 `전표 단가`는 개별 전표 단가가 아니라 같은 날짜·품목·모델·카테고리의 가중평균이다. 직전 실사용 경로의 두 전표 25,843,675원·28,043,675원은 화면 한 행에서 26,943,675원으로 보인다. 또한 견적 발행의 정상 정수 입력 110,005원에서 원천과 저장 전표의 공급가/VAT가 각각 1원 어긋난다. 선재 VAT 재가산 데이터도 비교 가능한 19건 모두 사용자 전표에 남아 있다. |
| ② CI green, exact SHA | **통과** | PR head와 로컬 HEAD가 모두 exact SHA이며, GitHub check run 42개가 `SUCCESS`, 미완료 0, 실패 0이었다. |
| ③ 라이브QA 실서버 실행 | **실패** | 실 accounting/slip 이미지가 후보 커밋보다 오래됐고, DB도 각각 V66/V59까지만 적용되어 후보 V67/V60이 없다. 실 OpenAPI에도 신규 필드가 없다. exact SHA 화면의 라이브QA는 실행되지 않았다. |

따라서 결함 판정과 별개로도 ③ 하나만으로 머지할 수 없다.

## 도달 가능 결함

### R-01 — 새 `전표 단가`가 개별 전표 단가가 아닌 평균을 보여준다

**이 fix와의 관계**

일평균 상쇄 자체는 선재 B-07이다. 그러나 이번 fix가 그 평균값을 `actualUnitPrice`로 새 응답하고 화면 열 이름을 **`전표 단가`**로 붙여, 기존 판정 문제를 금액 원천 표시 문제로도 악화시켰다. B-07의 다른 부분은 다시 조사하지 않았고, 이 교차 표면만 판정했다.

**실 사용자 경로**

중앙유통 DRAFT 주문 `2026/07/29-153`, `2026/07/29-373`의 같은 모델 `AM480AXVHJH1SY / commercialMulti`를 주문 상세에서 서로 다른 가격으로 수정 → 같은 날짜에 전환·확정 → 별도 매출전표로 전기 → 회계 > 일마감 > 상세의 `전표 단가`를 연다.

**재현 절차와 관측된 잘못된 결과**

1. 첫 전표의 실제 VAT 포함 단가는 **25,843,675원**이다.
2. 둘째 전표의 실제 VAT 포함 단가는 **28,043,675원**이다.
3. 일마감은 전표·라인 식별자가 없는 축으로 수량과 금액을 합친 뒤 `(25,843,675 + 28,043,675) ÷ 2`를 계산한다.
4. 새 화면은 **26,943,675원** 한 값을 `전표 단가`로 표시한다.

표시값은 어느 전표의 실제 단가도 아니며, 각 전표와의 차이는 **1,100,000원**이다. 실사용 재현 원문은 `docs/qa/991-category-axis/SOL-REVIEW.md:226-250`에 있다.

**파일:행 근거**

- 전표·라인 식별자 없이 축별 합산: `services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/MonthEndCloseService.java:346-355,377-383`
- 합계 금액을 합계 수량으로 나누는 평균: `services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/MonthEndCloseService.java:623-639`
- 그 평균을 응답에 전달: `services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/MonthEndCloseService.java:432-448`
- UI가 이를 `전표 단가`로 표시: `clients/desktop/src/renderer/routes/DailyClosingPage.tsx:673-678`

### R-02 — 견적 발행의 공급가/VAT가 원천 견적과 1원 어긋난다

**실 사용자 경로**

견적에서 수량 1, VAT 포함 단가 **110,005원**인 정상 정수 라인을 작성 → 공개 또는 내부 견적 발행으로 출고전표 생성 → 견적 금액과 전표 상세의 공급가·VAT를 비교한다.

**재현 절차와 관측된 잘못된 결과**

동일 입력을 실제 생산 코드의 두 산식으로 실행했다.

```text
입력: unitPriceVat=110005, quantity=1
견적 원천: 공급가 100005원, VAT 10000원
저장 전표: 공급가 100004원, VAT 10001원
오차: 공급가 -1원, VAT +1원
```

견적은 VAT 포함 금액을 1.1로 나눈 값을 `Math.round`하지만, 새 `createFromVatInclusive`는 공급가를 `RoundingMode.DOWN`으로 자른다. 총액 110,005원은 같아도 사용자가 원천과 전표를 대조하면 구성 금액이 각각 1원 다르다. 이번 `SlipPublishService` 변경은 Partner order만이 아니라 공개 견적, 내부 견적, 단일 주문, 병합 주문 모두 같은 `resolveLines`/`toEntityLines`로 통과시킨다.

**파일:행 근거**

- 견적 원천 분리 `Math.round`: `clients/web/estimate-app/lib/code.js:461-468,2354-2365`
- 새 VAT 포함 라인 생성·분리: `services/slip-service/src/main/java/com/samhanair/logis/slip/domain/SlipLine.java:264-285`
- 공급가 `DOWN`: `shared/common/src/main/java/com/samhanair/logis/common/financial/VatAmountCalculator.java:31-37`
- 공개 견적/단일 주문/병합 주문의 공통 진입: `services/slip-service/src/main/java/com/samhanair/logis/slip/publish/SlipPublishService.java:137-153,215-229,310-324,734-752,879-887`

### R-03 — 선재 VAT 재가산 전표는 남아 있으며, 보고된 9건이 아니라 최소 19건이다

**이 fix와의 관계**

이 데이터는 후보 커밋 이전에 생성된 것으로 **PR이 만든 결함은 아니다**. PR은 향후 발행 경로만 고쳤고 backfill하지 않았다. 다만 현재 사용자 전표 상세에서 도달 가능하므로 머지 게이트의 잔존 결함으로 분리 기록한다.

**실 사용자 경로**

Partner order에서 확정·발행된 출고전표를 전표 목록에서 열어 원 주문의 VAT 포함 납품가와 전표의 VAT 포함 단가를 비교한다.

**직접 관측 결과**

`source_order_line_id`로 slip DB와 partner-order DB를 읽기 전용 교차 대조했다.

```text
연결된 전표 라인                         22건
현재 원천 주문 라인과 대조 가능한 라인    19건
저장 공급단가 == 원천 price_vat           19건
저장 VAT포함단가 == 원천 price_vat × 1.1  19건
저장 VAT포함단가 - 원천 단가 합계          +2,835,000원
```

즉 대조 가능한 19건 모두 원천 VAT 포함 단가를 공급단가로 저장한 뒤 VAT를 다시 더했다. 3건은 현재 원천 DB에서 대응 라인을 찾을 수 없어 판정하지 않았다. 이 19건은 현재 accounting의 일마감 원천으로 전기된 행이 **0건**이므로 새 `actualUnitPrice` 화면에는 현재 나타나지 않는다. 향후 이 저장 전표가 회계 원천으로 전기되면 새 필드는 원 주문 가격이 아니라 이미 부풀려진 저장 전표 단가를 보여준다.

UUID 없이 사용자 전표번호로 확인한 대표값은 다음과 같다.

| 전표번호 | 수량 | 원 주문 VAT 포함 단가 | 저장 VAT 포함 단가 | 개당 차이 |
|---|---:|---:|---:|---:|
| `2026/05/31-1` | 2 | 3,000,000원 | 3,300,000원 | +300,000원 |
| `2026/05/31-6` | 5 | 2,400,000원 | 2,640,000원 | +240,000원 |
| `2026/05/31-7` | 1 | 2,400,000원 | 2,640,000원 | +240,000원 |

현재 Partner order 출처 슬립 16건에 대한 accounting 매출/매입 allocation과 POSTED line은 모두 0건이었다. 따라서 “새 일마감 단가에 현재 무엇이 보이는가”의 답은 **현재 0행**이고, 사용자는 전표 상세에서만 위 부풀려진 값을 볼 수 있다.

**파일:행 근거**

- 과거 오염을 고치지 않고 새 발행만 바꾸는 변경: `services/slip-service/src/main/java/com/samhanair/logis/slip/publish/SlipPublishService.java:734-752,879-887`
- VAT 포함 단가 저장 구조: `services/slip-service/src/main/java/com/samhanair/logis/slip/domain/SlipLine.java:264-287`
- 구현자 보고서의 잘못된 9건 판정 SQL: `docs/dev-reports/2026-07-31-991-r-price-origin-fix.md:120-158`

## 첫 번째 각도 — 보이던 금액과 정상 동작이 막혔는가

### 기존 금액 변화 0건·0원

구현자 보고서의 B-01 집계 SELECT를 그대로 재실행해 다음 값을 재현했다.

```text
22건 / nonzero 22건
공급가 16,082,727원
VAT 1,608,272원
VAT 포함 17,690,999원
actual_unit_sum 5,098,179.666666666667원
line_price_gap_sum 1,578,272원
```

후보 11파일에는 DB UPDATE, 마이그레이션 또는 기존 행 재작성 경로가 없다. 추가로 후보 커밋 시각 `2026-07-31 20:41:41 KST` 이후 `created_at/modified_at`이 움직인 활성 금액 라인을 직접 셌다.

```text
tax_invoice_lines: 변화 0건 / 변화 대상 금액 합계 0원
slip_lines:        변화 0건 / 변화 대상 금액 합계 0원
```

따라서 구현자 주장인 기존 금액 변화 **0건·0원**을 현재 실데이터에서 재현했다. 이는 후보 커밋 이후의 공유 DB 상태에 대한 판정이며, 그 이전 시점의 별도 역사 스냅샷 비교는 아니다.

### 수량 0·null·음수

현재 활성 세금계산서 22라인은 `0/null/음수 수량 = 0/0/0건`, null 공급가/VAT도 `0/0건`이었다. 현재 sales/purchase accounting slip header도 각각 0건이라 해당 두 원천의 실데이터 경계 행은 없었다.

- 합계 수량 0이면 백엔드는 `actualUnitPrice=null`: `MonthEndCloseService.java:634-638`
- null 수량·금액은 누적 전에 0으로 정규화: `MonthEndCloseService.java:346-355`
- 프론트는 null을 `—`로 표시: `clients/desktop/src/renderer/routes/DailyClosingPage.tsx:285-286,673-678`
- 발행 입력의 음수 가격은 DTO 검증, 0·음수 수량은 `parseQty`에서 차단된다.

실데이터 경계 표본은 없었지만 코드 실행 경로상 화면을 깨는 분기나 예외는 확인되지 않았다. 음수 누적값이 기존 DB에 강제로 존재하면 나눗셈 결과는 유한값이며, 이번 변경이 새 예외를 만들지는 않는다.

### `기준 납품가` 표기와 다른 화면·CSV·인쇄

문자열 변경은 `DailyClosingPage`의 상세 제품 표 한 곳뿐이다. 일마감 상세에는 별도 CSV/인쇄 동작이 없고, 다른 매출마감·월마감 CSV/인쇄는 기존 세금계산서 필드를 사용한다. 데스크톱 표는 가로 overflow를 허용하고 모바일은 카드 렌더 경로를 사용하므로 120px 열 추가로 도달 가능한 잘림·기능 차단은 확인되지 않았다.

### `categoryKey` 보존

VAT 포함 팩토리 오버로드가 전달받은 `categoryKey`를 기존 생성자와 같은 필드에 보존한다. 단일 주문뿐 아니라 견적·병합도 공통 경로를 쓰지만 분류 key, fingerprint, 내부 직렬화와 회계 분류의 기존 흐름은 바꾸지 않았다. 실 사용자 분류 회귀는 확인되지 않았다.

## 두 번째 각도 — B-01 해소 여부와 1,578,272원

### 현재 실데이터의 화면 도달 행

구현자 SELECT의 활성 22라인을 상태·종류로 다시 나눴다.

| 상태/종류 | 라인 | 공급가 | VAT | VAT 포함 | `line_price_gap` |
|---|---:|---:|---:|---:|---:|
| CANCELLED / SALES | 5 | 4,600,000 | 460,000 | 5,060,000 | 430,000 |
| DRAFT / SALES | 4 | 310,000 | 31,000 | 341,000 | 31,000 |
| ISSUED / PURCHASE | 2 | 1,800,000 | 180,000 | 1,980,000 | 180,000 |
| ISSUED / SALES | 11 | 9,372,727 | 937,272 | 10,309,999 | 937,272 |

실 endpoint는 `ISSUED`만 읽고 SALES/PURCHASE를 필터링한다(`MonthEndCloseService.java:202-207,320-325`). 따라서 실제 화면 도달은 SALES 11라인 또는 PURCHASE 2라인, 합계 **13라인**이다. 구현자 보고서의 “응답 영향 22건”은 **9건 과대계상**했다.

현재 13라인을 날짜·종류·품목 축으로 동일 집계해 개별 `(공급가+VAT)/수량`과 비교한 결과는 다음과 같다.

```text
visible_lines=13
displayed_rows=13
display_vs_line_mismatch=0
signed_gap=0원
```

즉 현재 DB처럼 같은 축의 중복 라인이 없는 표본에서는 B-01 값이 맞는다. 그러나 R-01의 정상 실사용 다중 전표 경로에서는 평균이 되므로 “표시 단가 = 그 전표 실제 단가”를 일반적으로 만족하지 않는다.

### `line_price_gap_sum=1,578,272원`

숫자 자체는 정확히 재현됐다. 다만 SQL은 VAT 포함 라인 합계에서 `unit_price × quantity`를 빼므로, `unit_price`가 공급가 단가이면 그 차이는 원칙적으로 VAT다. 실제 ISSUED 13라인의 gap **1,117,272원**은 VAT **1,117,272원**과 정확히 같다. 따라서 총 `1,578,272원`은 `unit_price`가 “공급가 기준으로 저장된 행이 섞였다”는 진술의 독립 증거가 아니라, 주로 공급가 단가와 VAT 포함 합계의 의미 차이를 다시 센 값이다. 새 VAT 포함 표시에서 해당 필드를 재사용하지 않은 구현 선택은 맞지만, 보고서의 숫자 해석은 부정확하다.

## 세 번째 각도 — 기존 불일치 9건 재판정

구현자 SQL을 같은 명령으로 실행하면 실제로 `23건 / 9건 / -26,884,000원`이 나온다. 그러나 비교식은 개당 `unit_price_with_vat`와 라인 전체 `supply_amount+vat_amount`를 비교한다.

수량을 반영해 다시 센 결과:

```text
전체 라인                                  23건
수량 > 1                                  9건
개당 단가 vs 라인 합계 불일치              9건
개당 단가×수량 vs 라인 합계 불일치          0건
수량 보정 후 부호 있는 차이 합계             0원
```

수량별로는 1개 14건/불일치 0, 2개 7건/기존식 불일치 7, 4개 1건/1, 5개 1건/1이었다. 즉 보고된 9건은 전부 수량이 여러 개인 정상 라인이며 새 `actualUnitPrice=(공급가+VAT)/수량`는 그 9건에서 저장 `unit_price_with_vat`와 정확히 같은 값을 계산한다. 현재 일마감에는 연결 행이 0건이라 화면 표시는 없다.

실제 선재 B-02 데이터는 이 잘못된 9건이 아니라 원천 주문과 교차 대조한 R-03의 최소 19건이다.

## 네 번째 각도 — 변경 11파일이 연 새 표면

`git show --numstat 6b67e307b` 결과는 11파일, `+383/-8`이다.

| 파일 | 열린 경로와 판정 |
|---|---|
| `clients/desktop/src/renderer/api/closingApi.ts` | 실 일마감 GET 응답 계약에 nullable `actualUnitPrice` 추가. |
| `clients/desktop/src/renderer/api/mock.ts` | mock 일마감 두 행에 값 추가. 실 API 영향 없음. |
| `clients/desktop/src/renderer/routes/DailyClosingPage.test.tsx` | 새 열 렌더 계약. 런타임 영향 없음. |
| `clients/desktop/src/renderer/routes/DailyClosingPage.tsx` | `기준 납품가` 이름 변경과 `전표 단가` 열 추가. R-01 도달. |
| `docs/dev-reports/2026-07-31-991-r-price-origin-fix.md` | 구현자 증거 보고서. 런타임 영향 없음; 숫자 해석 오류는 본 보고서에서 재판정. |
| `MonthEndCloseService.java` | 세금계산서·매출전표·매입전표의 공통 축 집계 평균을 신규 응답에 전달. R-01 도달. |
| `DailyClosingDetailResponse.java` | HTTP JSON/OpenAPI에 nullable 필드 추가; legacy 생성자는 null 유지. |
| `DailyClosingDetailServiceTest.java` | 응답 직렬화 검증. 런타임 영향 없음. |
| `SlipLine.java` | VAT 포함 단가를 공급가/VAT로 한 번 분리하고 `categoryKey` 보존. 견적 반올림 규칙과 R-02 충돌. |
| `SlipPublishService.java` | `unitPriceVat` 우선 선택과 VAT 포함 여부를 공개 견적, 내부 견적, 단일 주문, 병합 주문 전체에 전달. 수동·eCount migration 생성은 이 서비스를 통과하지 않는다. |
| `SlipPublishControllerIT.java` | Partner order 발행의 VAT 재가산·카테고리 계약 검증. 런타임 영향 없음. |

## 다섯 번째 각도 — 증거 무결성

| 구현자 주장 | 동일 명령/독립 대조 결과 | 판정 |
|---|---|---:|
| 22건, 16,082,727원, 1,608,272원, 17,690,999원 | 동일 값 재현 | 숫자 PASS |
| 응답 영향 22건 | ISSUED만 도달: SALES 11 + PURCHASE 2 = 13건 | **불일치** |
| `line_price_gap_sum=1,578,272원` | 동일 값 재현. 다만 대부분 VAT 자체를 센 값 | 숫자 PASS, 해석 불일치 |
| Partner order 23건/9건/−26,884,000원 | 동일 명령은 재현. 수량 보정 시 23건/0건/0원 | **진단 불일치** |
| 선재 B-02 영향 | 원천 교차 대조 가능한 19건 모두 1.1배, 차이 합계 +2,835,000원 | 구현자 범위 과소·오진 |
| 기존 금액 변화 0건/0원 | 후보 커밋 이후 `created_at/modified_at` 기준 tax invoice/slip 모두 0건·0원 | PASS |
| 프론트 185파일/1,673테스트 | fresh Vitest 결과 `files=185`, `tests=1673`, 실패 0 | PASS |
| exact SHA CI | 42 success, in-progress 0, failed 0 | PASS |

변경 서비스 검증 결과는 다음과 같다.

- frontend 전체: `npm exec -- vitest run` 종료 0, JSON/list 재집계 185파일·1,673테스트·실패 0; `npm run typecheck` 종료 0.
- accounting 전체: 구현자와 같은 `.\gradlew :services:accounting-service:test --rerun-tasks --no-build-cache` 종료 0, `BUILD SUCCESSFUL in 9m 19s`, JUnit 1,699테스트·failure 0·error 0.
- slip 발행 핵심 경로: 공통 VAT 계산 + 공개/내부 견적 + 단일/병합 주문 29테스트, 실패/오류/skip 0.
- slip 전체: `.\gradlew :services:slip-service:test --rerun-tasks --no-build-cache --no-daemon` 종료 0, `BUILD SUCCESSFUL in 6m 34s`, 18개 task 전부 실행, JUnit 1,507테스트·failure/error/skipped 0. `--no-daemon`만 동시 빌드 충돌 방지용으로 추가했다.

## 라이브QA 실서버 게이트

후보 커밋 시각은 2026-07-31 20:41 KST이나, 실 accounting 이미지/컨테이너는 2026-07-29, slip 이미지는 2026-07-27 생성본이다. 두 컨테이너에는 소스/JAR bind mount가 없다.

읽기 전용 Flyway 조회:

```text
accounting_db: 후보 V67 없음, 적용 최대 V66
slip_db:       후보 V60 없음, 적용 최대 V59
```

현재 accounting `/v3/api-docs`에도 `actualUnitPrice` 또는 후보 `categoryKey` 스키마가 0개다. 기존 `docs/qa/991-monthend-price-live/REPORT.md` 캡처도 헤더가 `출고가 | 납품가`라 이번 SHA의 `출고가 | 기준 납품가 | 전표 단가` 화면이 아니다. 구현자 보고서도 라이브QA·이미지 재빌드·재기동을 하지 않았다고 명시한다.

후보 프론트 dev server는 실 API를 바라보도록 기동했으나, 이 세션의 in-app Browser 목록이 비어 있어 실제 화면 조작·캡처가 불가능했다. 확인 뒤 해당 dev server만 종료했고 백엔드와 DB에는 쓰지 않았다. 더 근본적으로 실 백엔드가 후보 DTO와 마이그레이션을 싣지 않았으므로, 브라우저가 있더라도 exact SHA end-to-end 라이브QA가 될 수 없다.

## 이 라운드가 보지 않은 것

- B-03, B-04, B-05, B-06, B-08, B-09, B-10은 조사하지 않았다.
- B-07은 이번 fix가 평균값을 새 `전표 단가`로 노출해 악화한 교차점(R-01)만 봤고, B-07 전체를 재검증하지 않았다.
- 후보 V67/V60을 공유 DB에 적용하지 않았고, 과거 전표 backfill도 하지 않았다.
- Docker 이미지를 재빌드하거나 accounting/slip 백엔드를 재기동하지 않았다.
- exact SHA가 올라간 실서버 UI를 보지 못했다. 후보 화면 캡처도 만들지 않았다.
- 현재 DB에 없는 세금계산서 수량 0/null/음수 실표본과 sales/purchase accounting slip 실표본은 보지 못했다.
- Partner order 원천에서 이미 사라져 대응할 수 없는 3라인의 금액 정합은 판정하지 않았다.
- API 계약상 가능한 소수 VAT 단가 경계는 현재 활성 Partner order 2,052라인에서 표본 0건이라 실 사용자 결함으로 판정하지 않았다.
- `unitPriceExVat` 멱등 fingerprint의 선재 누락은 이번 fix가 만든·악화한 표면이 아니어서 보고 대상 결함에서 제외했다.
- 다른 B-03~B-10, 보안, 성능, 테스트 품질, unrelated 서비스는 보지 않았다.
