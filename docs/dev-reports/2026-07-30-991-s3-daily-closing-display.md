# PR #991 슬3 — 일마감 카테고리 축 표시

- 작성일: 2026-07-30
- 브랜치: `fix/monthend-detail-price-variant`
- 기준 HEAD: `cb6664ebc` (슬2)
- 범위: 일마감 응답의 `categoryKey`를 데스크톱 일마감 상세 표에 표시
- 금지 준수: git 쓰기 없음, Docker 재배포 없음, 공유 DB write 없음, Journal/backfill 없음

## 1. 슬3 정의와 확정 전제

PR #991 코멘트의 슬3 정의를 적용했다.

> **집계 축** — `byModel` 을 모델명 단일 key 로 합치지 않고 최소 `(라인 식별자/원천, 모델, category)` 축 보존. 같은 모델이 여러 카테고리면 **별도 상세 라인**

개발책임자 A안과 PM A-2를 그대로 따른다.

- 정본은 `model_name` 보존축에서 추출한 모델 토큰과 `GasCategoryAxis`의 정식 schedule key 조합이다.
- `product_code`로 카테고리를 추정하지 않는다.
- 아는 라인은 `homemulti`, `singleSets`, `commercialMulti`, `oldProducts` 축으로 표시하고, 축을 모르는 라인은 `UNKNOWN`으로 별도 표시한다.
- 기존 전표에 대한 backfill은 하지 않는다.
- 고정DC·전역DC·기본 할인율의 계산 계약과 `DiscountRevalidator`의 슬4 범위는 변경하지 않는다. 저장소에 없는 용어인 “약정DC”도 사용하지 않았다.

슬2에서 회계 BE의 `DailyProductLine.categoryKey`와 축별 집계는 이미 연결되어 있었다. 이번 슬3에서는 데스크톱 API 타입과 실제 표 열이 그 값을 소비하도록 연결했다. BE 집계·금액·단가 재조회 로직은 변경하지 않았다.

## 2. RED-first

### 테스트

새 화면 테스트에 같은 모델의 `homemulti`, `singleSets` 두 행과 `UNKNOWN` 한 행을 넣고, 카테고리 열 및 각 행의 축 표시를 요구했다.

실행 명령:

```powershell
npm exec vitest -- run src/renderer/routes/DailyClosingPage.test.tsx --reporter=verbose
```

### RED 원문

```text
× src/renderer/routes/DailyClosingPage.test.tsx > DailyClosingPage 모델별 재검증 > 같은 모델의 GAS 카테고리 축을 별도 행으로 표시하고 UNKNOWN을 분리한다
  → Unable to find an accessible element with the role "columnheader" and name "카테고리"

Name "품명 모델 수량 공급가 출고가 납품가 기대율 할인율 확인 사유":
  <tr />

Test Files  1 failed (1)
Tests       1 failed
```

RED 당시 렌더된 행에는 `AJ040RXH4BC1`의 두 행과 `카테고리 미상` 행이 있었지만 카테고리 셀이 없었다. 즉 BE 응답에 축 데이터가 있어도 화면이 버리고 있던 결함을 재현했다.

## 3. 구현과 GREEN

변경 내용:

1. `closingApi.ts`의 `DailyProductLine`에 BE 응답 계약인 `categoryKey: string`을 추가했다.
2. `DailyClosingPage.tsx`의 모델별 재검증 표에 `카테고리` 열을 추가하고 canonical key를 그대로 표시한다.
3. `mock.ts`와 화면 fixture에 known key 및 `UNKNOWN`을 넣어 mock/테스트 계약을 맞췄다.
4. 카테고리 열은 금액 formatter나 단가 formatter를 통과하지 않으므로 기존 값 표시 규약과 단가 조회 기준을 변경하지 않는다.

화면 GREEN 원문:

```text
✓ 같은 모델의 GAS 카테고리 축을 별도 행으로 표시하고 UNKNOWN을 분리한다
✓ ... 기존 모델별 재검증 및 일마감 회귀 테스트 ...

Test Files  1 passed (1)
Tests       25 passed (25)
```

renderer typecheck:

```text
npm exec tsc -- -p tsconfig.web.json --noEmit
Exit code: 0
```

회계 모듈 강제 전체 테스트:

```powershell
$env:GRADLE_USER_HOME='D:\dev\Samhan-Public\.gradle-t23'
.\gradlew :services:accounting-service:test --rerun-tasks --no-build-cache
```

```text
BUILD SUCCESSFUL in 5m 18s
21 actionable tasks: 21 executed
```

초기 typecheck는 디자인 시스템 file dependency의 `dist`가 없는 환경에서 `@samhan/design-system` 해석 오류로 중단됐다. 검증을 위해 해당 의존성을 설치·빌드한 뒤 재실행했고, 그 결과 typecheck가 통과했다. 의존성 설치/빌드 산출물은 gitignore 대상이다.

## 4. 표시 값과 실제 전표 값 대조

### 단위 테스트의 실제 도메인 값

BE의 기존 카테고리 축 회귀 테스트는 `TaxInvoiceLine.create`로 생성되는 전표 라인 상태를 사용하고, FE 신규 fixture는 그 응답을 재현한다. 각 행의 원천 공급가와 일마감 응답 공급가를 대조했다.

| 원천 전표 라인 | 원천 수량 | 원천 단가 | 원천 공급가 | 응답 카테고리 | 응답 공급가 |
|---|---:|---:|---:|---|---:|
| `AJ040RXH4BC1 [홈멀티]` | 1 | 50,000 | 50,000 | `homemulti` | 50,000 |
| `AJ040RXH4BC1 [싱글]` | 1 | 60,000 | 60,000 | `singleSets` | 60,000 |
| `카테고리 미상` | 1 | 70,000 | 70,000 | `UNKNOWN` | 70,000 |

`MonthEndCloseService.accumulateProduct`는 축을 바꾸면서도 원천 라인의 `quantity`, `supplyAmount`, `vatAmount`를 그대로 해당 축의 accumulator에 더한다. 따라서 축 분리는 금액을 재계산하거나 다른 품목 단가로 치환하지 않는다.

기존 단가 기준 회귀도 accounting 전체 GREEN에 포함해 확인했다. known GAS 축은 해당 schedule key의 `default_pre_change` 기준 price history를 사용하고, `UNKNOWN`은 가격 조회를 생략해 `MISSING_REFERENT`로 닫힌다. 슬3에서는 이 경로를 수정하지 않았다.

### 공유 DB 읽기 전용 실측

실행한 SELECT:

```sql
SELECT COUNT(*) AS tax_invoice_lines,
       COUNT(*) FILTER (WHERE quantity * unit_price <> supply_amount) AS arithmetic_mismatch,
       SUM(supply_amount) AS stored_supply,
       SUM(quantity * unit_price) AS recomputed_supply
FROM tax_invoice_lines;
```

결과:

```text
tax_invoice_lines | arithmetic_mismatch | stored_supply | recomputed_supply
15                | 0                   | 20060000.00   | 20060000.0000
```

현재 공유 DB에는 `tax_invoice_lines.model_name/category_key` 컬럼이 아직 없으므로 기존 15행은 새 축을 알 수 없고 모두 `UNKNOWN`으로 측정된다. V67/V60 migration을 이 라운드에서 적용하거나 기존 행을 backfill하지 않았다.

참고로 별도 매출전표 원천은 저장된 `supply_amount`를 일마감에 전달하는 경로이며, 현재 DB의 10,290행 중 692행에서 `unit_price × qty`와 저장 공급가가 반올림 차이를 보였다. 최대 차이는 45원이었다. 이 기존 데이터 품질 관측을 임의 보정하지 않았고, 저장 전표의 정본 `supply_amount`를 unit price 곱으로 덮어쓰지도 않았다. 따라서 해당 692행에 대해 “산술 재계산값과 일치한다”고 주장하지 않으며, 일마감 표시값은 저장된 전표 공급가를 그대로 사용하는 계약으로 대조했다.

## 5. `UNKNOWN` 비율 실측

공유 `accounting_db.tax_invoice_lines`를 읽기 전용으로 측정했다.

| 범위 | 전체 | known | `UNKNOWN` | 비율 |
|---|---:|---:|---:|---:|
| 현재 세금계산서 라인 15행 | 15 | 0 | 15 | **100.00%** |

이 수치는 V67 migration이 아직 공유 DB에 적용되지 않은 상태의 기존 행 측정값이다. A-2에 따라 known으로 추정하거나 backfill하지 않았다. 화면 회귀 fixture는 known 2행과 `UNKNOWN` 1행을 분리해 1/3 = 33.33%를 재현했지만, 이는 운영 실측이 아니라 계약 fixture 수치다.

## 6. 7개 불변식 확인 결과

| 불변식 | 확인 방법 | 결과 |
|---|---|---|
| 1. 화면·응답이 카테고리 축으로 구분 | BE 기존 `dailyDetailKeepsKnownCategoryAxesSeparateFromUnknown` 및 FE 신규 `같은 모델의 GAS 카테고리 축을 별도 행으로 표시하고 UNKNOWN을 분리한다` | **통과**. 같은 모델의 `homemulti`/`singleSets`가 별도 행이고 `UNKNOWN`이 별도 행이다. |
| 2. `UNKNOWN`이 known 집계에 섞이지 않음 | 축별 응답 행과 각 행의 공급가를 각각 단언 | **통과**. known 두 행의 공급가에 미상 70,000이 합쳐지지 않는다. |
| 3. 표시값이 실제 전표 값과 일치 | fixture 원천 `quantity`/`unitPrice`/`supplyAmount`와 응답 `quantity`/`supplyAmount` 대조, 공유 DB 세금계산서 15행 산술 SELECT, 기존 price-history 기준 테스트 | **통과(기본 세금계산서 원천)**. 축 변경으로 실제 공급가를 재계산하지 않는다. 매출전표 692행의 기존 반올림 차이는 별도 관측으로 남겼다. |
| 4. 표시 규약 유지 | `DailyClosingPage`의 기존 `fmtKrw`, `fmtNullableKrw`, 음수율 스타일 및 0/null 회귀 테스트를 변경 없이 전체 실행 | **통과**. `—`, 음수 빨강, 코드 prefix 없는 category key를 유지한다. |
| 5. Journal/backfill 금지 | diff에 Journal 파일·repository·posting 경로와 UPDATE/backfill 없음; DB는 SELECT만 수행 | **통과**. migration도 이번 라운드에는 추가하지 않았다. |
| 6. 다른 회계 화면·보고서 보존 | 변경 범위를 `clients/desktop` 일마감 API 타입·화면·mock·회귀 테스트로 제한하고 accounting 전체 테스트 실행 | **통과**. 다른 회계 service/화면/보고서 코드는 변경하지 않았다. |
| 7. 멱등 | 표시 코드는 응답을 읽기만 하고 상태/DB를 변경하지 않으며, BE의 `LinkedHashMap<AxisKey,...>` 결정적 축 집계와 기존 회귀 테스트 확인 | **통과**. 같은 입력의 축·금액·행 순서가 반복 실행에서 달라질 수 있는 변환을 추가하지 않았다. |

## 7. 변경·신규 파일 목록

`git diff --numstat` 기준 변경 파일:

| 파일 | +N | −M |
|---|---:|---:|
| `clients/desktop/src/renderer/api/closingApi.ts` | +2 | −0 |
| `clients/desktop/src/renderer/api/mock.ts` | +2 | −0 |
| `clients/desktop/src/renderer/routes/DailyClosingPage.test.tsx` | +66 | −0 |
| `clients/desktop/src/renderer/routes/DailyClosingPage.tsx` | +6 | −0 |

신규 파일:

| 파일 | +N | −M |
|---|---:|---:|
| `docs/dev-reports/2026-07-30-991-s3-daily-closing-display.md` | +193 | −0 |

## 8. 남긴 파일 전체 목록

### 소스·테스트·보고서

- `clients/desktop/src/renderer/api/closingApi.ts`
- `clients/desktop/src/renderer/api/mock.ts`
- `clients/desktop/src/renderer/routes/DailyClosingPage.test.tsx`
- `clients/desktop/src/renderer/routes/DailyClosingPage.tsx`
- `docs/dev-reports/2026-07-30-991-s3-daily-closing-display.md`

### 검증 중 생성된 gitignore 대상

- `clients/desktop/node_modules/`
- `clients/web/design-system/node_modules/`
- `clients/web/design-system/dist/`

위 의존성/빌드 디렉터리는 검증을 위해 생성됐으며 `git status`에는 나타나지 않는다. git add/commit/push/checkout은 수행하지 않았다.

## 9. 범위 밖 및 미실행

- 슬4 싱글중대형 DC액 검증 신설, `DiscountRevalidator.OUT_OF_SCOPE`, `DailyClosingDetailResponse` DC액 필드는 건드리지 않았다.
- Journal과 다른 회계 화면·보고서는 수정하지 않았다.
- V67/V60 migration 번호를 새로 고르거나 적용하지 않았다. 이번 라운드에는 migration 필요성이 없었다.
- Docker 재배포/Testcontainers 별도 실행, 공유 실데이터 write, backfill, 계산서 발행/국세청 업로드는 하지 않았다.
