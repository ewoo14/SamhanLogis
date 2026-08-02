# PR #991 fix 라운드 — 단가 원천 수정 보고서

- 작업일: 2026-07-31
- 범위: B-01 일마감 상세 단가 원천, B-02 VAT 포함 단가 재가산
- 작업 브랜치: `fix/monthend-detail-price-variant`
- 판정: B-01/B-02 코드 수정 및 변경 모듈 전체 테스트 완료
- 제외: 라이브QA, B-03~B-10, 공유 DB 쓰기, Docker 이미지 재빌드·서비스 재기동

## 1. 선택한 수정 방식

단가의 의미를 호출부에서 잃지 않도록 두 경로를 분리했다.

1. `unitPriceVat`는 요청 계약대로 VAT 포함 권위 단가로 취급하고 `SlipLine.createFromVatInclusive(...)`를 사용한다. 이 경로는 VAT를 공급가와 부가세로 한 번만 분리한다.
2. `SlipLine.createFromVatInclusive(...)`에 `categoryKey` 오버로드를 추가해 기존 축 보존도 함께 유지한다.
3. 일마감 상세 응답에 원천 전표의 VAT 포함 실제 단가인 `(공급가액 + 부가세) ÷ 수량`을 `actualUnitPrice`로 추가한다. 기존 `deliveryPrice`는 `기준 납품가`로 이름을 분명히 하고, 화면에는 별도 `전표 단가` 열을 표시한다.

이번 수정은 기존 DB 금액을 갱신하거나 마이그레이션하지 않는다. 따라서 이미 저장된 과거 전표의 금액 변화액은 0원이다.

## 2. 불변식 ① — 일마감 상세 단가 = 전표 실제 VAT 포함 단가

### RED 원문

먼저 다음 테스트를 추가하고 현재 코드에서 실행했다.

```text
.\gradlew :services:accounting-service:test --tests com.samhanair.logis.accounting.service.DailyClosingDetailServiceTest.dailyDetailExposesAuthoritativeVatInclusiveUnitPrice --rerun-tasks --no-build-cache
```

실패 요지 원문:

```text
Expecting actual JSON at /productSummaries/0/actualUnitPrice to contain 550000
but the actual productSummaries row contained
... "supplyAmount":500000.00,"releasePrice":null,"deliveryPrice":null, ...
```

즉 현재 응답에는 `actualUnitPrice`가 없었다. 화면이 참조할 전표 실제 단가 필드 자체가 계약에 없었던 것이 RED의 원인이다.

### 변경 요지

- `MonthEndCloseService`가 공통 `ModelAccumulator.effectiveUnitPrice()`를 `DailyProductLine.actualUnitPrice`로 전달한다.
- `DailyClosingDetailResponse.DailyProductLine`에 `actualUnitPrice`를 추가하고 기존 생성자 호환 경로에서는 null을 유지한다.
- 데스크톱 `DailyProductLine` 타입과 mock에 필드를 추가한다.
- `DailyClosingPage`에 `전표 단가` 열을 추가한다.
- 기존 `납품가` 표기는 `기준 납품가`로 바꾸어 price history 값과 원천 전표 값을 구별한다.

### 실 데이터 실측

실행 명령:

```text
docker exec samhan-postgres psql -U samhan -d accounting_db -c "SELECT COUNT(*) AS line_count, COUNT(*) FILTER (WHERE l.quantity <> 0) AS nonzero_quantity_count, COALESCE(SUM(l.supply_amount),0) AS supply_sum, COALESCE(SUM(l.vat_amount),0) AS vat_sum, COALESCE(SUM(l.supply_amount+l.vat_amount),0) AS vat_inclusive_sum, COALESCE(SUM(CASE WHEN l.quantity<>0 THEN (l.supply_amount+l.vat_amount)/l.quantity ELSE 0 END),0) AS actual_unit_sum, COALESCE(SUM((l.supply_amount+l.vat_amount)-COALESCE(l.unit_price*l.quantity,0)),0) AS line_price_gap_sum FROM tax_invoice_lines l JOIN tax_invoices i ON i.id=l.tax_invoice_id WHERE l.is_deleted=false AND i.is_deleted=false;"
```

실행 출력:

```text
 line_count | nonzero_quantity_count | supply_sum  |  vat_sum   | vat_inclusive_sum |     actual_unit_sum      | line_price_gap_sum
------------+------------------------+-------------+------------+-------------------+--------------------------+--------------------
         22 |                     22 | 16082727.00 | 1608272.00 |       17690999.00 | 5098179.6666666666670000 |       1578272.0000
```

- 실제 단가를 산출할 수 있는 활성 세금계산서 전표 라인: 22건
- 수량 0으로 null 처리되는 라인: 0건
- 응답에 추가되는 영향 건수: 22건
- 기존 공급가액·부가세·전표 저장 금액 변경 건수: 0건
- 기존 금액 변화액 합계: 0원

현재 DB의 판매·매입 회계 전표 라인은 각각 0건이었다. 이 수치는 해당 원천 종류가 없다는 뜻이며, 라이브QA를 대신하지 않는다.

`line_price_gap_sum=1,578,272원`은 기존 `tax_invoice_lines.unit_price`가 공급가 기준으로 저장된 행이 섞여 있음을 보여준다. 새 `actualUnitPrice`는 이 필드를 그대로 재사용하지 않고 공급가액과 부가세에서 계산한다.

검증 종료 후 같은 B-01 집계 SELECT를 다시 실행한 결과도 `22건 / 22건 / 공급가 16,082,727원 / VAT 1,608,272원 / VAT 포함 17,690,999원`으로 동일했다. 이 라운드에는 DB UPDATE/INSERT/DELETE를 실행하지 않았으므로 기존 금액 변화액 합계는 0원이다.

### GREEN 및 전체 테스트

```text
.\gradlew :services:accounting-service:test --tests com.samhanair.logis.accounting.service.DailyClosingDetailServiceTest.dailyDetailExposesAuthoritativeVatInclusiveUnitPrice --rerun-tasks --no-build-cache
BUILD SUCCESSFUL in 36s
21 actionable tasks: 21 executed
```

변경 모듈 전체 재실행:

```text
.\gradlew :services:accounting-service:test --rerun-tasks --no-build-cache
BUILD SUCCESSFUL in 7m 27s
21 actionable tasks: 21 executed
```

## 3. 불변식 ② — VAT 포함 금액에 VAT를 다시 더하지 않음

### RED 원문

현재 publish 경로가 VAT 포함 `unitPriceVat=970000`을 공급가 인자로 `SlipLine.create(...)`에 넘기는지 검증하는 테스트를 먼저 실행했다.

```text
.\gradlew :services:slip-service:test --tests com.samhanair.logis.slip.publish.SlipPublishControllerIT.publishFromPartnerOrder_doesNotAddVatToVatInclusiveUnitPrice --rerun-tasks --no-build-cache
```

실패 출력 원문:

```text
expected: 881818
but was: 970000.00
at SlipPublishControllerIT.java:201
```

이는 공급가 881,818원과 VAT 88,182원으로 분리되어야 할 VAT 포함 단가 970,000원이 공급가로 저장된 RED다. 그 결과 기존 경로는 VAT 97,000원을 다시 더했다.

### 변경 요지

- `SlipPublishService.resolveLines`가 `unitPriceVat` 선택 여부를 `vatInclusive` 플래그로 보존한다.
- `vatInclusive=true`이면 `SlipLine.createFromVatInclusive(...)`를 호출한다.
- VAT 미포함 `unitPriceExVat` 경로만 기존 `SlipLine.create(...)`를 사용한다.
- VAT 포함 생성 경로에도 `categoryKey`를 전달한다.

따라서 검증 입력 970,000원은 공급가 881,818원, VAT 88,182원, VAT 포함 합계 970,000원으로 한 번만 반영된다.

### 실 데이터 실측

확인 명령 1 — 현재 저장된 전표의 partner order 원천 집계:

```text
docker exec samhan-postgres psql -U samhan -d slip_db -c "SELECT COALESCE(l.unit_price_domain,'NULL') AS unit_price_domain, COUNT(*) AS line_count, COUNT(*) FILTER (WHERE ABS(COALESCE(l.unit_price_with_vat-(l.supply_amount+l.vat_amount),0))>0.01) AS mismatch_count, COALESCE(SUM(CASE WHEN ABS(COALESCE(l.unit_price_with_vat-(l.supply_amount+l.vat_amount),0))>0.01 THEN l.unit_price_with_vat-(l.supply_amount+l.vat_amount) ELSE 0 END),0) AS mismatch_signed_sum FROM slips s JOIN slip_lines l ON l.slip_id=s.id WHERE s.is_deleted=false AND l.is_deleted=false AND s.source_type='PARTNER_ORDER' GROUP BY COALESCE(l.unit_price_domain,'NULL') ORDER BY 1;"
```

실행 출력:

```text
 unit_price_domain | line_count | mismatch_count | mismatch_signed_sum
-------------------+------------+----------------+---------------------
 NULL              |         23 |              9 |        -26884000.00
```

확인 명령 2 — 현재 확정 partner order 원천 집계:

```text
docker exec samhan-postgres psql -U samhan -d partner_order_db -c "SELECT COUNT(*) AS line_count, COUNT(*) FILTER (WHERE pol.price_vat IS NOT NULL) AS vat_price_count, COALESCE(SUM(pol.price_vat),0) AS price_vat_sum, COALESCE(SUM(pol.supply_amount+pol.vat_amount),0) AS source_total_sum, COALESCE(SUM(CASE WHEN pol.supply_amount IS NOT NULL AND pol.vat_amount IS NOT NULL THEN pol.price_vat-(pol.supply_amount+pol.vat_amount) ELSE 0 END),0) AS gap_sum, COUNT(*) FILTER (WHERE pol.supply_amount IS NOT NULL AND pol.vat_amount IS NOT NULL AND ABS(pol.price_vat-(pol.supply_amount+pol.vat_amount))>0.01) AS gap_count FROM partner_order_lines pol JOIN partner_orders po ON po.id=pol.partner_order_id WHERE po.is_deleted=false AND pol.is_deleted=false AND po.status='CONFIRMED';"
```

실행 출력:

```text
 line_count | vat_price_count | price_vat_sum | source_total_sum | gap_sum | gap_count
------------+-----------------+---------------+------------------+---------+-----------
         51 |              51 |   88410000.00 |                0 |       0 |         0
```

해석 및 영향 범위:

- 현재 확정 원천 라인: 51건. 이 DB 스냅샷에서는 `supply_amount`/`vat_amount`가 null이라 원천 분해 합계는 실측할 수 없었다.
- 이미 저장된 partner order 전표 라인: 23건.
- 그중 VAT 포함 권위 단가와 저장 공급가+VAT가 불일치하는 과거 라인: 9건, 부호 있는 차이 합계 -26,884,000원.
- 이 라운드는 과거 9건을 backfill하지 않았다. 새 publish 코드만 고쳤으므로 기존 행의 변경 건수 0건, 기존 금액 변화액 합계 0원이다.
- 위 9건의 사후 정정은 이번 범위의 신규 DB 쓰기 없이 처리할 수 없으므로 미검증/후속 과제로 남겼다.

검증 종료 후 같은 B-02 집계 SELECT를 다시 실행한 결과도 `23건 / 불일치 9건 / 부호 있는 차이 -26,884,000원`으로 동일했다. 저장된 과거 행을 재작성하지 않았으므로 이 라운드의 기존 전표 금액 변화액 합계는 0원이다.

### GREEN 및 전체 테스트

```text
.\gradlew :services:slip-service:test --tests com.samhanair.logis.slip.publish.SlipPublishControllerIT.publishFromPartnerOrder_doesNotAddVatToVatInclusiveUnitPrice --rerun-tasks --no-build-cache
BUILD SUCCESSFUL in 1m
18 actionable tasks: 18 executed
```

변경 모듈 전체 재실행:

```text
.\gradlew :services:slip-service:test --rerun-tasks --no-build-cache
BUILD SUCCESSFUL in 5m 33s
18 actionable tasks: 18 executed
```

프론트엔드 계약 검증:

```text
npm exec -- vitest run src/renderer/routes/DailyClosingPage.test.tsx -t "일마감 상세의 전표 단가는" --reporter=verbose
Test Files 1 passed (1)
Tests 1 passed (1) | 25 skipped (26)
```

## 4. 전체 프론트엔드 검증

처음 전체 Vitest는 `out/main/index.js`가 없는 기존 산출물 가드에서 중단됐다. 실행 원문은 다음과 같다.

```text
npm exec -- vitest run --reporter=verbose
FAIL src/main/build-output-cjs-interop.test.ts
Error: out/main/index.js 가 없습니다... npm run build 를 먼저 실행하십시오.
```

가드가 요구한 빌드를 실행한 뒤 전체 테스트를 재실행했다.

```text
npm run build
Exit code: 0

npm exec -- vitest run --reporter=dot
Test Files 185 passed (185)
Tests 1673 passed (1673)
Duration 31.00s
```

타입 검사:

```text
npm run typecheck
Exit code: 0
tsc -p tsconfig.node.json --noEmit
tsc -p tsconfig.web.json --noEmit
real-QA 범위 단위 검사: tests 50, pass 50, fail 0
```

초기 타입 검사에서는 design-system `dist/index.d.ts`가 없는 로컬 파생물 가드가 먼저 중단되었다. lockfile을 변경하지 않는 `npm install --ignore-scripts --no-package-lock`을 design-system 디렉터리에서만 실행하고 `npm run build`로 해당 파생물을 만든 뒤 재실행했다. 이 과정은 Docker·공유 DB·소스 마이그레이션을 건드리지 않았다.

## 5. 이번에 안 본 것

- B-03
- B-04
- B-05
- B-06
- B-07
- B-08
- B-09
- B-10

추가 미검증 항목:

- 라이브QA 및 실서버 실행 검증
- 현재 DB에 이미 저장된 partner order 불일치 9건의 backfill
- price history의 업무적 정본성 및 B-01의 모든 과거 화면 사례
- 프론트엔드 광범위 개편과 다른 회계 화면

## 6. 변경 파일 목록

### 신규

- `docs/dev-reports/2026-07-31-991-r-price-origin-fix.md`

### 수정

- `services/slip-service/src/main/java/com/samhanair/logis/slip/domain/SlipLine.java`
- `services/slip-service/src/main/java/com/samhanair/logis/slip/publish/SlipPublishService.java`
- `services/slip-service/src/test/java/com/samhanair/logis/slip/publish/SlipPublishControllerIT.java`
- `services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/MonthEndCloseService.java`
- `services/accounting-service/src/main/java/com/samhanair/logis/accounting/web/dto/DailyClosingDetailResponse.java`
- `services/accounting-service/src/test/java/com/samhanair/logis/accounting/service/DailyClosingDetailServiceTest.java`
- `clients/desktop/src/renderer/api/closingApi.ts`
- `clients/desktop/src/renderer/api/mock.ts`
- `clients/desktop/src/renderer/routes/DailyClosingPage.tsx`
- `clients/desktop/src/renderer/routes/DailyClosingPage.test.tsx`

신규 Flyway 마이그레이션은 없다. 이미 적용된 마이그레이션은 수정하지 않았다.

### `git status --porcelain`

```text
미실행 — 사용자 지시("git 명령 금지")로 실행하지 않음
```

따라서 위 파일 목록은 이번 라운드에서 실제로 수정·생성한 소스 및 보고서 목록이며, 저장소 상태 원문을 실행했다고 주장하지 않는다.

## 7. 환경 제약 준수

- Docker 이미지 재빌드: 하지 않음
- 공유 서비스 재기동: 하지 않음
- 공유 DB 쓰기: 하지 않음
- 공유 DB 조회: `docker exec ... psql ... -c "SELECT ..."` 형식의 읽기 전용 SELECT만 실행
- 라이브QA: 하지 않음
- Gradle 전체 검증: `--rerun-tasks --no-build-cache`로 실행했으며 모두 `executed` task를 확인
