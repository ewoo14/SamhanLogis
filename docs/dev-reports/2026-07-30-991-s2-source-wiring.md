# PR #991 슬2 — 일마감 카테고리 축 원천 배선

작성일: 2026-07-30
대상 브랜치: fix/monthend-detail-price-variant
기준 HEAD: 0e078815e (슬1 GasCategoryAxis 계약)

## 1. 슬2 정의와 범위

PR #991 코멘트의 슬2 정의를 적용했다.

> 주문의 categoryKey를 slip/accounting line query model까지 보존한다. sourceOrderLineId 역조회만으로 모든 라인을 복원할 수 있다고 가정하지 않는다.

개발책임자 정정에 따라 일마감의 검증 경로는 다음과 같다.

판매전표(DC율·DC액 입력) -> 일마감 검증 -> 매출전표(회계반영일자)
-> 일괄 계산서 발행 -> 국세청 업로드 엑셀

이번 슬라이스는 원천 snapshot 보존과 일마감 집계 연결까지만 다룬다. 계산서 발행, 국세청 엑셀, 회계 원장, backfill, 싱글중대형 DC액 검증은 변경하지 않았다.

정본 축은 modelName에서 정규화한 GAS 모델 토큰과 슬1의 정식 schedule key 조합이다. 숫자형 이카운트 productCode나 품목 마스터의 카테고리로 판매 축을 추정하지 않는다.

## 2. RED-first 원문

먼저 DailyClosingDetailServiceTest에 다음 실패 테스트를 추가하고, 아직 응답에 categoryKey가 없는 상태에서 실행했다.

실행 명령:

    $env:GRADLE_USER_HOME='D:\dev\Samhan-Public\.gradle-t23'
    .\gradlew :services:accounting-service:test --tests 'com.samhanair.logis.accounting.service.DailyClosingDetailServiceTest.dailyDetailKeepsKnownCategoryAxesSeparateFromUnknown' --rerun-tasks --no-build-cache

RED 원문:

    ...DailyClosingDetailServiceTest.java:390: error: invalid method reference
            DailyClosingDetailResponse.DailyProductLine::categoryKey
            cannot find symbol: method categoryKey()

    Execution failed for task ':services:accounting-service:compileTestJava'.

실패 테스트는 같은 모델 AJ040RXH4BC1에 대해 homemulti, singleSets, 미상 라인을 각각 넣고 결과가 세 축으로 분리되는지를 확인한다.

## 3. 구현과 GREEN

### 원천 배선

    partner-order line.categoryKey
      -> PartnerOrder*Convert payload
      -> slip PublishLineRequest
      -> slip_lines.category_key
      -> SlipLineSnapshot(modelName, categoryKey)
      -> SalesAccountingSlipLine / Allocation snapshot
      -> TaxInvoiceLine snapshot

- categoryKey는 수동·레거시 라인에서는 null을 유지한다.
- 원천 modelName은 slip snapshot에서 전달하고 회계 저장 시 GAS 모델 토큰으로 정규화한다.
- 유효한 category key가 없거나 모델 토큰이 없으면 UNKNOWN으로만 집계한다.
- productCode는 축 집계에 사용하지 않는다.
- 같은 품목명이라도 AxisKey(label, modelToken, GasCategoryAxis)가 다르면 같은 집계에 섞이지 않는다.
- 매입 화면은 기존 단가 재검증을 유지하기 위해서만 기존 품목 조회 fallback을 보존했다. 판매/세금계산서 경로에는 그 fallback을 사용하지 않는다.

### 스키마

- slip-service V60__preserve_sales_category_axis.sql: slip_lines.category_key 추가.
- accounting-service V67__preserve_sales_category_axis.sql: sales_accounting_slip_lines, sales_accounting_slip_allocations, tax_invoice_lines에 model_name, category_key 추가.
- 모든 migration은 ADD COLUMN IF NOT EXISTS만 사용하며 기존 행을 갱신하는 UPDATE/backfill이 없다.
- 원격 브랜치의 accounting migration 최대 번호를 git ls-tree로 확인한 뒤 V67을 선택했다.

### GREEN 원문

신규 집계 회귀 테스트:

    > Task :services:accounting-service:test

    BUILD SUCCESSFUL in 49s
    21 actionable tasks: 21 executed

같은 테스트 클래스 전체:

    13 tests completed
    BUILD SUCCESSFUL in 54s
    21 actionable tasks: 21 executed

원천 snapshot 보존 테스트(SalesAccountingSlipServiceTest)와 관련 비통합 서비스 테스트도 강제 실행했다.

    SalesAccountingSlipServiceTest: BUILD SUCCESSFUL
    DailyClosingServiceSourceKindTest: 6 tests, failures=0, errors=0
    TaxInvoiceBatchFromSalesSlipsServiceTest: 8 tests, failures=0, errors=0
    TaxInvoiceBatchServiceTest: 8 tests, failures=0, errors=0

수정된 통합 fixture는 raw SQL이 아니라 실제 도메인 경로인 TaxInvoice.createDraftFromSalesSlips와 snapshot이 포함된 SalesAccountingSlipLine.create를 사용하도록 바꿨다. 그 fixture의 전체 통합 테스트 재실행은 Testcontainers 실행 조건에 해당하므로 하지 않았다. 대신 compileTestJava는 다음 원문으로 통과했다.

    > Task :services:accounting-service:compileTestJava

    BUILD SUCCESSFUL in 49s
    9 actionable tasks: 9 executed

참고로 fixture 수정 전 회계 모듈 전체 강제 실행은 1692 tests completed, 2 failed, 10 skipped였다. 실패는 새 snapshot을 넣지 않은 기존 DailyClosingRevalidationIT fixture에서 modelName/단가를 기대한 건이었다. 그 fixture를 실제 생성 경로로 수정한 뒤 Testcontainers 전체 재실행은 금지 조건에 따라 보류했다.

## 4. UNKNOWN 비율 실측

### 슬1 기준

정찰·슬1 산출물의 기준 실측은 tax_invoice_lines 22/22 UNKNOWN = 100.00%였다.

### 현재 공유 DB

요구된 Docker read-only SELECT만 실행했다. Docker 재배포나 데이터 write는 하지 않았다.

    docker exec samhan-postgres psql -U samhan -d accounting_db -c "SELECT column_name FROM information_schema.columns WHERE table_name = 'tax_invoice_lines' AND column_name IN ('model_name','category_key') ORDER BY column_name;"

결과:

    column_name
    -------------
    (0 rows)

현재 DB에는 아직 새 migration 컬럼이 적용되지 않았다. 이어서 현재 행 수와 미상 비율을 읽었다.

    docker exec samhan-postgres psql -U samhan -d accounting_db -c "SELECT COUNT(*) AS total_lines, COUNT(*) AS unknown_lines, ROUND(100.0 * COUNT(*) / NULLIF(COUNT(*), 0), 2) AS unknown_pct FROM tax_invoice_lines;"

결과:

    total_lines | unknown_lines | unknown_pct
    -------------+---------------+-------------
              15 |            15 |      100.00
    (1 row)

따라서 현재 공유 DB의 사후 측정치는 15/15 = 100.00%다. 이는 A-2의 기존 행 backfill 금지와 Docker 재배포 금지를 지킨 결과이며, 기존 15행을 known으로 만들기 위한 write는 하지 않았다. 과반 트리거가 유지되므로 A-1 재검토 트리거를 PM에 남긴다.

반면 신규 원천 snapshot 경로의 회귀 fixture는 known 2행(homemulti, singleSets)과 unknown 1행을 분리해 unknown 1/3 = 33.33%를 재현했다. 배선 후 생성되는 known 경로와 기존 미배선 행의 차이를 테스트로 확인했으며, 공유 DB의 기존 행 수치를 성공으로 둔갑시키지 않았다.

## 5. 8개 불변식 확인 결과

| 불변식 | 확인 방법 | 결과 |
|---|---|---|
| 1. 아는 라인은 GAS와 같은 축으로 집계 | dailyDetailKeepsKnownCategoryAxesSeparateFromUnknown에서 같은 모델을 homemulti/singleSets로 각각 집계 | 코드 경로 통과. 공유 기존 DB는 15/15 미상으로 A-1 트리거 |
| 2. 모르는 라인은 UNKNOWN으로 분리 | category 없는 라인을 별도 입력하고 known 두 축과 결과 금액·모델을 각각 단언 | 통과 |
| 3. 미상 비율 실측 기록 | tax_invoice_lines read-only SELECT 및 본 문서 §4 | 15/15, 100.00%; A-1 트리거 |
| 4. 표시 값이 실제 전표 값과 일치 | item label은 전표 itemName/productName, model은 snapshot modelName 정규화, category는 snapshot schedule key만 사용 | 통과. 코드 prefix·productCode 대체 없음 |
| 5. Journal 불변 | 변경 파일·diff에 Journal entity/repository/service 및 원장 posting 경로 없음 | 통과 |
| 6. backfill 금지 | V60/V67은 nullable 컬럼 추가만 수행하고 UPDATE 없음 | 통과 |
| 7. 다른 회계 화면·보고서 보존 | 세금계산서/매출전표 경로만 source axis를 사용하고, 매입 단가 재검증 fallback은 유지. 계산서/국세청 export 미변경 | 관련 테스트 통과 |
| 8. 멱등 | read-only 집계는 입력을 변경하지 않고, publish fingerprint에 categoryKey를 포함해 축이 다른 재요청을 잘못 재사용하지 않음. migration은 IF NOT EXISTS | 통과 |

표시 규약은 기존 금액 필드와 직렬화 경로를 변경하지 않았다. 새 category 표시는 정식 schedule key 또는 UNKNOWN이며 코드 prefix를 붙이지 않는다. 음수·0 표시(-X 빨강, —)는 기존 표시 계층의 책임으로 유지했다.

## 6. 미실행·제약

- Docker stack 재배포는 하지 않았다.
- Testcontainers 기반 통합 테스트 재실행은 하지 않았다. 통합 fixture는 실제 도메인 생성 경로로 수정했고, 회계 테스트 컴파일은 통과했다.
- 공유 실데이터 write와 기존 행 backfill은 하지 않았다.
- git add/commit/push/checkout은 하지 않았다.
- docs/handoff/CURRENT-WORK.md는 수정하지 않았다.

현재 공유 DB의 UNKNOWN 100.00%는 후속 migration 적용 및 신규 원천 생성 이후 다시 read-only SELECT로 측정해야 한다. 그때도 과반이면 PM의 A-1 재검토가 필요하다.
