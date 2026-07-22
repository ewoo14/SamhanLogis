# #824 품목행 공급가액·부가가치세 정합성 구현 보고

작성일: 2026-07-22

## 범위

- #899: 전표·견적·세금계산서의 공급가액 기준 부가세 계산을 하나의 원 단위 정책으로 수렴.
- #900: 주문 `PartnerOrderLine`에 공급가액·부가세를 additive 확장하고 네 권위 경로와 항등식을 고정.
- 문서: README, ROADMAP, 결정 기록, slip-service README, 시스템 overview를 같은 PR 내용으로 동기화.

## #899 법령·국세청 근거와 한계

확인한 공식 자료는 다음과 같다.

1. [부가가치세법 제29조(과세표준)](https://www.law.go.kr/LSW/lsInfoR.do?lsiSeq=276117&efYd=20260102&chrClsCd=010202&ancYnChk=0): 과세표준은 공급가액의 합계이며 공급가액은 부가가치세를 제외한 공급의 대가이다.
2. [국세청 유권해석(2008.02.01)](https://taxlaw.nts.go.kr/qt/USEQTA002P.do?ntstDcmId=010000000000046365): “세금계산서의 부가가치세액은 공급가액의 10％를 기재하는 것이며, 단수조정에 따른 실제청구금액의 결정은 거래당사자간의 약정이나 합의에 따라 결정할 사항”이라고 설명한다.
3. [국세청 유권해석(2011.05.20)](https://taxlaw.nts.go.kr/qt/USEQTA002P.do?ntstDcmId=010000000000143024): 같은 공급가액 10% 및 단수조정 약정 원칙을 재확인한다.

공식 법령·국세청 자료에서 HALF_UP 또는 절사를 법정 단일 방식으로 강제하는 문구는 확인하지 못했다. 따라서 이번 구현은 “법이 HALF_UP/절사를 명령한다”고 주장하지 않는다. 개발책임자의 “부가가치세법에 따름” 결정에서 확인 가능한 부분(공급가액 10%)을 따르고, 단수조정은 국세청이 허용한 거래 약정 영역으로 보아 기존 세금계산서 화면의 절사 정책을 애플리케이션 계약으로 유지했다.

구현은 `shared/common`의 `VatAmountCalculator`와 desktop `vatRounding.ts`를 단일 계산 지점으로 삼아 공급가액의 10%를 0 방향 절사한다. 발행 완료 세금계산서와 기존 권위 금액 snapshot은 재계산하지 않는다.

## #899 behavioral RED → GREEN

RED를 먼저 작성했다. `100005`원 공급가액에서 기존 desktop 전표 계산은 `10001`원, 세금계산서 화면 절사는 `10000`원이어서 다음 실패를 확인했다.

```text
expected '10001' to be '10000' // Object.is equality
Expected: "10000"
Received: "10001"
src/renderer/utils/lineVat.test.ts:16
```

이후 공통 계산기를 연결하고 전표·견적·세금계산서 및 desktop fallback/인쇄 경로를 교체했다. GREEN 결과는 최종 검증 명령 출력에 갱신한다.

## #900 주문 의미 실측과 구현

코드 실측 결과:

- `PartnerOrderLine.priceVat`은 server-side DC 적용 후 VAT 포함 단가이다.
- `PartnerOrderLine.subtotal`은 생성자에서 `priceVat × quantity`로 계산되고 `PartnerOrder.totalAmount`가 이를 합산한다. 따라서 주문의 대응 `lineTotal`은 VAT 포함 T이다.
- 전표는 기존 `lineTotal=S`(VAT 미포함), 견적은 기존 `lineTotal=T`(VAT 포함)라서 세 도메인의 컬럼 의미를 바꾸지 않았다.

RED에서 기존 `PartnerOrderLine` 필드에 `supplyAmount`·`vatAmount`가 없음을 실제 AssertJ 실패로 확인했다.

```text
Expecting ListN:
  ["id", "partnerOrder", "productId", "modelName", "productName",
   "categoryKey", "quantity", "priceVat", "subtotal", "remark",
   "convertedQuantity"]
to contain:
  ["supplyAmount", "vatAmount"]
```

V12는 두 컬럼을 nullable로 추가하고 `S+V=subtotal` check를 둔다. 기존 행을 UPDATE하거나 backfill하지 않으므로 legacy 행은 두 값이 null인 채 조회된다. 신규 domain factory는 `PRICE/SUPPLY/VAT/TOTAL`을 지원하며 DC 결과 단가를 PRICE 권위로 계산한다. revision snapshot·견적 변환·상세 응답·인쇄 fallback도 이 의미를 보존한다.

## Flyway fresh Postgres probe

PostgreSQL 16 fresh container에서 partner-order의 V1~V12를 순서대로 적용했다. 신규 V12의 두 컬럼은 nullable이며, 유효한 주문에 레거시 행과 신규 행을 함께 삽입해 기존 행 보존과 신규 항등식을 확인했다.

```text
column_name  | is_nullable
-------------+------------
supply_amount | YES
vat_amount    | YES

product_name | supply_amount | vat_amount | subtotal  | identity
-------------+---------------+------------+-----------+----------
legacy       | NULL          | NULL       | 110005.00 | NULL
new          | 100004.00     | 10001.00   | 110005.00 | t
```

## 검증 결과

캐시를 사용하지 않는 최종 실행 결과는 다음과 같다.

- `cd clients/desktop; npm run typecheck; npm run lint; npm test`: typecheck 통과, lint `0 errors / 77 warnings`, 전체 test 재실행 통과 `136 files / 1,077 tests`.
- `./gradlew :services:slip-service:test --rerun-tasks --no-build-cache`: `BUILD SUCCESSFUL in 4m 21s`, `18 actionable tasks: 18 executed`.
- `./gradlew :services:partner-order-service:test --rerun-tasks --no-build-cache`: `BUILD SUCCESSFUL in 1m 58s`, `15 actionable tasks: 15 executed`.
- DC focused IT `confirm_applies_dc_final_price_from_price_calc`: `BUILD SUCCESSFUL in 39s`, `15 actionable tasks: 15 executed`; DC 결과 단가 `800000`에서 `S=727272`, `V=72728`, `T=800000`을 DB로 확인했다.
- 공통·주문 focused test: `BUILD SUCCESSFUL in 26s`, `17 actionable tasks: 17 executed`.
- accounting focused test: `BUILD SUCCESSFUL in 42s`, `21 actionable tasks: 21 executed`.
- desktop의 첫 전체 test 실행에서 기존 `CodefImportScopeForm.test.tsx` 1건이 일시적으로 실패했으나, 해당 파일 단독 실행 `20 tests passed` 후 전체 suite를 재실행해 위 결과로 통과했다. 이번 변경 파일의 실패는 재현되지 않았다.
- design-system: 이번 라운드 추가 수정 없음

## 보류

법령·국세청 자료에 절사/반올림 중 하나를 의무화한 공식 문구는 확인되지 않았다. 따라서 절사 방향은 법정 강행규정이라고 단정하지 않고, 기존 세금계산서와 거래 단수조정 약정에 기반한 제품 정책으로 기록했다. 법무·세무 담당자가 별도 약정 또는 다른 공식 해석을 제시하면 공통 계산기와 관련 테스트만 후속 결정으로 변경해야 하며, 기존 발행 자료 backfill은 하지 않는다.
