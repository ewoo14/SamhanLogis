# #1032 재수렴 라운드 적대적 검증 보고서 (PR #1044)

## 검증 로그

### 1. 기준 문서 로드

- 확인 시각: 2026-08-02 KST
- 읽은 기준: `2026-08-02-1032-summary-fix.md`, `2026-08-01-1032-contract.md`, `2026-08-01-1032-review.md`.
- 본 라운드는 구현자 수치를 사실로 전제하지 않고 최신 diff, fresh 테스트, 읽기 전용 DB/API 결과로 각각 재측정한다.
- 금지사항 준수: 코드·Git·Docker·실 DB 쓰기 없음. 이 보고서만 append한다.

### 2. 검증 대상 SHA와 CI 상태

```text
> git branch --show-current
fix/1032-slip-amount-mismatch
> git rev-parse HEAD
5bd80d6807835e26616d6a2ef5e17128969c36da
> gh pr view 1044 --json statusCheckRollup (집계)
checks=42 success=42 nonSuccess=0
```

- PR #1044의 GitHub head SHA와 로컬 HEAD가 일치한다.
- 작업트리 변경은 이 검증 보고서 1개(`?? docs/dev-reports/2026-08-02-1032-reconvergence.md`)뿐이다.

### 3. 두 수정 라운드 이후 PR 변경 표면

- `git diff --name-status main...HEAD` 실측: 17개 파일. 금액 실행 코드는 desktop 5개, slip-service main 6개, 테스트 1개이며 나머지는 보고서 5개다.
- PR 기준 diff에는 accounting-service, 세금계산서, 재무제표, 원장, 미수·미지급·채권채무, 모바일, 인쇄 구현 파일이 0개다.
- 주의: 1차 검증 커밋 뒤 `origin/main` merge에는 다른 이슈의 accounting-service 변경이 포함되지만, 현 PR의 `main...HEAD` diff에는 포함되지 않는다. 따라서 #1032 변경 도달성은 PR 기준 diff와 현재 호출 경로로 판정한다.

### 4. 실 DB 저장 규약과 활성 전표 모집단 — 수치 불일치 발견

- ① 실 사용자 경로 재현 여부: 금액 불일치 자체는 현재 활성 전표 목록 모집단에서 재현된다. 다만 요청 기준 `활성 전표 2,345 · 불일치 2,344`는 **재현되지 않았다**.
- ② 재현 명령: `docker exec samhan-postgres psql -X -v ON_ERROR_STOP=1 -U samhan -d slip_db`에서 `BEGIN TRANSACTION READ ONLY` 후 활성 헤더·라인을 SELECT했다.
- ② 출력 원문:

```text
DOMAIN_COUNTS|2758|17|1|2776
STORED_NULLS|0|0|0|0|0
ACTIVE_MISMATCH|2335|2334|1
BASELINE|2026/05/20-1|2076816.00|2076816.00|207684.00|2284500.00|5
DOMAIN_DERIVATION|NULL|2758|3933565119.00|4326900658.00|0
DOMAIN_DERIVATION|SUPPLY|1|8181818.19|8999999.19|0
DOMAIN_DERIVATION|VAT_INCLUSIVE|17|26240450.00|28864500.00|0
```

- ③ 실 데이터 영향 건수: 현재 실측은 활성 전표 **2,335건**, 계약 합계와 표시 합계 불일치 **2,334건**, 동일 **1건**이다. 제시 수치보다 각각 10건 적다. 금액 계산 결함의 추가 사용자 도달 건수로 판정한 것은 아니지만, 요청된 숫자 재현 축의 불일치다.
- 저장 규약 수치 `legacy unit_price_domain NULL 2,758 · VAT_INCLUSIVE 17 · SUPPLY 1`은 재현됐다. 활성 2,776라인의 `supply_amount`, `vat_amount`, `line_total` NULL은 각각 0건이다.
- 위 psql 묶음의 마지막 표본 ORDER BY가 존재하지 않는 `line_no`를 참조해 exit 1이었지만, 앞선 SELECT 결과는 동일 READ ONLY 트랜잭션 snapshot에서 이미 출력됐다. 표본 쿼리는 아래에서 수정해 별도 재실행한다.

### 5. 활성 전표 모집단 재집계 — 직전 10건 차이는 검증 쿼리의 전표번호 중복 병합

- 직전 쿼리는 `GROUP BY slip_no`여서 서로 다른 활성 전표 중 같은 전표번호 10쌍을 합쳤다. 전표 PK별로 다시 집계하되 출력에는 UUID를 노출하지 않았다.
- ① 실 사용자 경로 재현 여부: 요청 수치가 재현됐다. 활성 전표 2,345건 중 계약 합계와 표시 합계가 다른 전표는 2,344건이다.
- ② 출력 원문:

```text
ACTIVE_BY_TYPE|INBOUND|42|42
ACTIVE_BY_TYPE|OUTBOUND|2303|2302
```

- ③ 실 데이터 영향 건수: 활성 2,345건, 불일치 2,344건, 동일 1건. 앞 절의 `2,335/2,334`는 구현 결함이 아니라 검증 쿼리의 `slip_no` 그룹 키 오류이므로 결함 판정에서 제외한다.

### 6. 세 저장 규약의 저장값 파생 및 단가×수량 차이

- ① 실 사용자 경로 재현 여부: `legacy NULL`, `VAT_INCLUSIVE`, `SUPPLY` 모두 활성 데이터에 존재하며 현재 소스 계산식인 저장 `supply_amount + vat_amount`로 표시값을 산출할 수 있다.
- ② 재현 명령: READ ONLY 트랜잭션에서 규약별 저장 합계와 `unit_price_with_vat × quantity` 후보를 비교했다.
- ② 출력 원문:

```text
DOMAIN_ROUTE|NULL|2758|13|4326900658.00|4326729840.00
DOMAIN_ROUTE|SUPPLY|1|1|8999999.19|9000000.00
DOMAIN_ROUTE|VAT_INCLUSIVE|17|1|28864500.00|28844500.00
```

- 열 순서: 규약 | 활성 라인 | 저장값과 단가×수량이 다른 라인 | 저장 S+V 합 | 단가×수량 후보 합.
- ③ 실 데이터 영향 건수: 단가×수량 재계산 시 실제 저장 표시값과 달라지는 라인은 legacy NULL 13건, VAT_INCLUSIVE 1건, SUPPLY 1건이다. 세 규약 모두 현재 구현은 단가×수량이 아니라 저장 S+V를 사용한다.

### 7. 기준 전표와 규약별 표본

```text
SAMPLE|2026/01/01-1|NULL|1|109000.00|109000.00|10900.00|119900.00
SAMPLE|2026/05/20-1|VAT_INCLUSIVE|1|401090.00|401090.00|40110.00|441200.00
SAMPLE|2026/05/20-1|VAT_INCLUSIVE|1|602363.00|602363.00|60237.00|662600.00
SAMPLE|2026/05/20-1|VAT_INCLUSIVE|1|77000.00|77000.00|7700.00|84700.00
SAMPLE|2026/05/20-1|VAT_INCLUSIVE|1|14545.00|14545.00|1455.00|16000.00
SAMPLE|2026/05/20-1|VAT_INCLUSIVE|1|981818.00|981818.00|98182.00|1080000.00
SAMPLE|2026/08/01-6|SUPPLY|3|8181818.19|8181818.19|818181.00|8999999.19
```

- 열 순서: 전표번호 | 규약 | 수량 | 계약 lineTotal | 저장 공급가액 | 저장 부가세 | 표시금액.
- 기준 전표 `2026/05/20-1` 5개 행의 표시금액 합은 **2,284,500**이며 계약 `totalAmount` 합은 **2,076,816**이다. 두 필드가 실제로 달라야 하는 표본에서 `2076816 != 2284500`이 재현됐다.
- 실 데이터 영향 건수: 기준 전표 1건, VAT_INCLUSIVE 활성 17라인, SUPPLY 활성 1라인, legacy NULL 활성 2,758라인.

### 8. 면세·영세율 실데이터

```text
PRODUCT_TAX_TYPE|TAXABLE|1220
```

- 활성 상품은 과세 1,220건뿐이다. 면세·영세율 상품 및 그에 연결된 실전표는 각각 0건으로 실 사용자 경로 재현 대상이 없다.
- slip 라인 자체에는 세율 유형 snapshot이 없어 저장 `vat_amount`를 사용하는 공통 계산기까지만 확인 가능하다. 면세·영세율 실전표 화면은 이 모집단에서는 미확인 축으로 남긴다.

### 9. 저장 공급가액 NULL fallback 실행 확인

- ① 실 사용자 경로 재현 여부: 활성 실 DB에는 `supply_amount IS NULL`이 0건이라 현재 실 사용자 도달은 0건이다. 다만 해당 분기는 단위 테스트에서 실제 실행됐다.
- `unit_price_domain IS NULL` 2,758건은 모두 저장 S/V/lineTotal이 존재하므로 첫 분기인 저장 `S+V`를 사용한다. 진짜 저장 공급가액 NULL이면 저장 `lineTotal + vatAmount`를 사용하고, 둘 다 NULL일 때만 `unitPriceWithVat × quantity`, 그것도 없으면 0으로 내려간다.
- ② 재현 명령·출력 원문:

```text
> .\gradlew.bat --no-daemon --rerun-tasks :services:slip-service:test --tests "com.samhanair.logis.slip.web.dto.SlipResponseTest"
BUILD SUCCESSFUL in 47s
18 actionable tasks: 18 executed
JUnit XML: tests=6 failures=0 errors=0 skipped=0
```

- `displayTotalAmount_legacy공급가액Null이면_단가乘수량을_재계산하지_않는다`는 저장 S=200을 NULL로 만든 뒤 저장 lineTotal=200, vat=20, 오염 후보 VAT포함단가=999를 주고 결과 220을 검증한다.
- `summary_2026년5월20일전표의_legacyNull라인은_저장lineTotal을_사용한다`는 S/V와 VAT포함단가 후보를 NULL/9,999,999로 조작하고 `SlipSummary.lineTotal=2,076,816`을 검증한다.
- ③ 실 데이터 영향 건수: 공급가액 NULL 0건, 공급가액과 lineTotal 동시 NULL 0건, 최종 단가×수량 fallback 도달 0건. 테스트 경로는 2개 케이스 모두 GREEN이다.

### 10. 각도 1 — 1차 라운드의 “안 바뀐 15곳” 재확인

- ① 실 사용자 경로 재현 여부: 15곳 모두 현재 소스에서 존재하는 사용자/업무 경로다. PR #1044의 새 계산기나 `displayTotalAmount`가 아래 15곳으로 전파되는 호출은 없었다.
- ② 재현 명령·출력 원문:

```text
> git diff --name-only main...HEAD (경로 분류)
ACCOUNTING_CHANGED=0
MOBILE_CHANGED=0
PRINT_CHANGED=0
EXPORT_CHANGED=0

> rg -n "displayTotalAmount" services clients
사용처: 판매조회, 구매조회, 결재 전표검색, SlipResponse/SlipSearchResult 및 해당 테스트뿐
```

- ③ 실 데이터 영향 건수: 아래 15개 검증 단위 모두 #1032로 값이 바뀌는 활성 실데이터 **0건**.

1. 매출 회계전표 장부 — 저장 `supplyAmount`, `vatAmount`, `lineTotal` 계약 유지.
2. 매입 회계전표 장부 — 같은 S/V/총액 분리 계약 유지.
3. 세금계산서 발행·상세·인쇄·홈택스 — accounting-service `TaxInvoice` 저장 S/V/total 경로 유지.
4. 부가세 신고서 — `ISSUED TaxInvoice`의 저장 `supply_amount`, `vat_amount` 집계 유지.
5. 합계잔액시산표 — POSTED/REVERSED `journal_lines` 차변·대변 집계 유지.
6. 손익계산서 — 같은 분개 저장값의 계정별 차변·대변 집계 유지.
7. 재무상태표 — 기준일까지 POSTED/REVERSED 분개 누적 잔액 유지.
8. 일반원장 — `journal_lines` 차변·대변·누적잔액 유지.
9. 거래처별 원장 — 저장 회계 전표/분개 projection 유지.
10. 미수금·미지급금·채권채무 — 분개 계정 잔액·받을어음·수금계획 경로 유지.
11. 전표 목록 XLSX — `SlipExcelExportService.COLUMNS`는 전표번호·일자·유형·상태·거래처명·배송태그·수락/완료/확정시각 9개뿐이며 금액 컬럼이 없다.
12. 거래명세표 인쇄 — `storedLineAmounts`가 저장 S/V를 읽고 합계 S+V를 사용한다.
13. 매출전표 인쇄 — 같은 저장 S/V 계산기를 사용한다.
14. 매입전표 인쇄 — 같은 저장 S/V 계산기를 사용한다.
15. 모바일 영업 대시보드 — `MobileSalesDashboardService.sumSlipAmount`가 저장 `supplyAmount + vatAmount`를 직접 합산한다.

- 회계 배분 source의 `SlipSummary.lineTotal`은 2차 수정에서 저장 S+V로 복원됐다. desktop `SlipLineAllocationEditor`는 이 필드만 `sourceAmount`로 사용하며 `unitPrice`는 사용자 계산에 쓰지 않는다. 따라서 회계 장부 생성의 원천 배분 금액은 VAT 포함 기존 계약으로 재수렴했다.

### 11. XLSX·CSV·인쇄 화면 정합성 실행

- `npm test -- ...`는 로컬 파생물 `out/main/index.js` 부재를 이유로 pretest에서 종료됐다. 코드 결함 판정에는 사용하지 않았다.
- 직접 Vitest runner로 관련 테스트를 fresh 실행했다.

```text
> npx vitest run src/renderer/print/printAmounts.test.ts src/renderer/print/StatementBatchView.test.ts src/renderer/api/excelExportApi.test.ts
✓ printAmounts.test.ts (10 tests)
✓ excelExportApi.test.ts (4 tests)
✓ StatementBatchView.test.ts (5 tests)
Test Files 3 passed (3)
Tests 19 passed (19)
```

- 전표 정리 CSV는 화면과 같은 `CleanupEntry.totalAmount` 응답을 직렬화한다. 이번 PR에서 `SlipCleanupService`는 저장 S/V 기반 `SlipDisplayAmount.vatInclusiveTotal`을 사용하므로 화면과 CSV가 갈라지는 별도 계산은 없다.
- 판매/구매 목록 XLSX에는 금액 컬럼이 없어 화면 금액과 다른 금액을 내보내는 도달 건수는 0건이다.
- 기준 전표의 인쇄 계산은 저장 `2,076,816 + 207,684 = 2,284,500`이다.

### 12. 결함 R-1 — 실행 중 실 목록 API는 아직 표시 필드를 제공하지 않는다

- ① 실 사용자 경로 재현 여부: **재현됨.** 판매/구매 조회가 호출하는 `/slips/query`를 실제 실행 중인 `samhan-slip-service`에 호출했다. 응답의 `displayTotalAmount`가 없으므로 현재 desktop은 fallback인 `totalAmount`를 표시한다.
- ② 재현 명령·출력 원문:

```text
> GET http://127.0.0.1:18086/slips/query?searchSlipNo=2026%2F05%2F20-1&dateFrom=2026-05-20&dateTo=2026-05-20
slipNo=2026/05/20-1|totalAmount=2076816.00|displayTotalAmount=|totalQuantity=5
```

- ③ 실 데이터 영향 건수: 현재 실행 환경에서는 활성 전표 2,345건 중 **2,344건**이 상세 저장 S+V와 다른 계약 금액으로 목록에 도달한다.
- 판정 범위: 소스 HEAD의 단위 테스트는 두 필드를 분리해 통과하지만, 공유 Docker 재빌드·재기동 금지 때문에 실행 중 컨테이너가 PR head를 로드했는지는 갱신할 수 없다. 따라서 **현 실행 사용자 경로의 도달 결함**으로 보고하며 PR head 배포 후 라이브 결과는 이 라운드 미확인 축이다.

### 13. 각도 3 — 합계·반올림·필드 분리

- 판매/구매 목록에는 금액 합계가 없고 `총 N건`만 있다. 따라서 페이지 행 금액 합과 비교할 별도 페이지 금액 총계는 사용자 경로에 존재하지 않는다.
- 저장값 기준 전표별 `sum(각 라인 S+V)`와 `sum(S)+sum(V)`를 비교했다.

```text
ROUNDING_BOUNDARY|0|0.00|2344|2345
```

- 열 순서: 행합≠열합 전표 | 최대 차이 | totalAmount≠displayTotalAmount 전표 | 활성 전표.
- 행 금액 합과 저장 총계가 갈라지는 반올림 경계는 0건, 최대 차이 0.00이다. 저장값을 덧셈만 하므로 현재 모집단에서는 중간 재반올림이 없다.
- `totalAmount`와 `displayTotalAmount`가 달라야 하는 전표는 2,344건이며, 기준 전표의 소스 HEAD 테스트 값은 각각 2,076,816과 2,284,500이다. 실행 중 컨테이너는 전 절처럼 표시 필드가 없어 실제 HTTP 두 필드 분리는 재현하지 못했다.

### 14. 전체 slip-service fresh suite — 1,517 수치는 재현되지 않음

- ① 실 사용자 경로 재현 여부: 전체 회귀 suite는 GREEN이라 추가 사용자 결함 도달은 확인되지 않았다. 다만 요청된 테스트 수 1,517은 재현되지 않았다.
- ② 재현 명령·출력 원문:

```text
> .\gradlew.bat --no-daemon --rerun-tasks :services:slip-service:test
BUILD SUCCESSFUL in 8m 39s
18 actionable tasks: 18 executed

> fresh JUnit XML 206개 testsuite 첫 줄 UTF-8 attribute 집계
suites=206 parsed=206 bad=0 tests=1540 failures=0 errors=0 skipped=0

> Gradle HTML report index.html
tests=1540 failures=0 ignored=0
```

- ③ 실 데이터 영향 건수: 실패·오류·skip 0이므로 이 수치 차이로 인한 사용자 도달 결함은 0건. 그러나 구현 보고의 `1,517`보다 **23 tests 많아 숫자 재현에는 실패**했다.
- 첫 PowerShell XML DOM 집계는 일부 한글 testcase 이름을 잘못 디코딩해 parse error를 내면서 이전 `$x`를 재사용했고 우연히 1,517을 출력했다. 그 값은 폐기했다. UTF-8 attribute 집계와 Gradle 자체 HTML이 독립적으로 1,540에 일치한다.
- 같은 fresh 실행의 `SlipListE2RealtimeRestoreIT` XML은 `tests=12 failures=0 errors=0 skipped=0`이며 수정 시각도 전체 실행 종료 시각과 일치한다.

### 15. CI 동일 `slip-it-core` 필터 fresh 실행

- ① 실 사용자 경로 재현 여부: 필터가 포함하는 핵심 통합 경로는 모두 GREEN이며 추가 사용자 결함 도달은 확인되지 않았다.
- ② 재현 명령: `.github/workflows/ci.yml`의 `slip-it-core`에 적힌 11개 `--tests` 토큰을 그대로 사용하고 `--no-daemon --rerun-tasks`를 추가했다.
- ② 출력 원문:

```text
BUILD SUCCESSFUL in 7m 22s
18 actionable tasks: 18 executed
suites=78 parsed=78 bad=0 tests=667 failures=0 errors=0 skipped=0
Gradle HTML: tests=667 failures=0 ignored=0
```

- ③ 실 데이터 영향 건수: 실패·오류·skip 0이므로 확인된 사용자 도달 결함 0건. 요청 수치 `667 / failures 0 / errors 0 / skipped 0`은 정확히 재현됐다.

### 16. 숫자 재현 종합

| 항목 | 요청 수치 | 실측 | 판정 |
|---|---:|---:|---|
| GitHub CI | 42 / 42 green | 42 success / 42 | 재현 |
| SlipListE2RealtimeRestoreIT | 12 / 12 | 12 / 12, F/E/S 0 | 재현 |
| slip-service 전체 | 1,517 | **1,540**, F/E/S 0 | 수치 불일치 |
| CI slip-it-core | 667 | 667, F/E/S 0 | 재현 |
| legacy NULL / VAT_INCLUSIVE / SUPPLY | 2,758 / 17 / 1 | 2,758 / 17 / 1 | 재현 |
| 활성 전표 / 불일치 | 2,345 / 2,344 | 2,345 / 2,344 | 재현 |

### 17. 결함 및 도달성 결론

1. **R-1 실행 중 목록 API 미수렴**: 기준 전표 `2026/05/20-1`의 실제 목록 HTTP는 `totalAmount=2,076,816`, `displayTotalAmount` 부재다. 현재 공유 실행 환경에서 사용자 도달 2,344건. PR head 배포 후에는 이 라운드가 확인하지 못했다.
2. **전체 suite 테스트 수 불일치**: 구현 보고 1,517과 달리 fresh HEAD는 1,540이다. 실패/오류/skip이 없어 실 사용자 도달은 0건이지만 요청된 숫자는 재현되지 않았다.

- 코드 HEAD 자체의 금액 파생에서 추가 도달 결함은 찾지 못했다. 저장 S+V 우선, 저장 lineTotal fallback, 마지막 단가×수량 fallback 순서가 테스트와 실데이터에서 확인됐다.
- “안 바뀐 15곳”은 15/15 모두 #1032 값 변경 도달 0건으로 유지됐다.

### 18. 이 라운드가 보지 않은 축

1. PR head를 실제 로드하도록 공유 Docker를 재빌드·재기동한 뒤의 목록 HTTP/실제 desktop 클릭 — 금지사항 때문에 미확인.
2. 실제 브라우저 인쇄 미리보기와 실제 내려받은 XLSX 바이너리의 육안 비교 — 소스·관련 Vitest·컬럼 계약까지만 확인.
3. 면세·영세율 실전표 화면 — 활성 상품/전표 표본이 0건이라 미확인.
4. 삭제 전표·삭제 라인 — 요청된 활성 모집단 집계에서 제외.
5. 실 DB에 저장 공급가액 또는 lineTotal이 NULL인 사용자 표본 — 각각 0건이라 단위 테스트로만 실행.

### 19. 최종 무결성 확인

```text
REPORT_EXISTS=True LINES=277 BYTES=18579
UUID_VALUE_MATCHES=0
git status --short:
?? docs/dev-reports/2026-08-02-1032-reconvergence.md
unstaged source diff (services/clients/.github): NONE
PR head=5bd80d6807835e26616d6a2ef5e17128969c36da checks=42 success=42 nonSuccess=0
```

- 보고서 외 코드·workflow 파일의 미커밋 변경은 없다.
- 실제 UUID 값은 보고서에 0개다. 전표 표본은 전표번호만 기록했다.
