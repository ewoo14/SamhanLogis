# PR #1057 R19 재수렴 적대검증 보고서

- 작업 브랜치: `feat/874-set-riusage-global-dc`
- 사용자 제공 HEAD: `f8443c000`
- 검증 질문: **실 사용자 경로로 재현 가능한 결함이 있는가.**
- 검증 각도: **R18이 좁힌 `focusRows` 경계가 과하여 보여야 할 불일치를 다시 숨기는가.**
- 작업 규율: 소스·Git·컨테이너·DB 상태를 변경하지 않고 읽기·조사·테스트만 수행한다. 이 파일만 조사 기록으로 누적한다.

## 조사 로그

보고서를 조사보다 먼저 생성했다. 아래에는 확인 순서대로 실행 명령 원문, 출력 원문, 판정을 즉시 누적한다.

### 선행 확인 1 — R18 fix 보고서

실행 명령 원문:

```powershell
Get-Content -LiteralPath 'docs\dev-reports\2026-08-03-874-r18-fix.md' -Raw -Encoding UTF8
```

출력 원문 중 이번 라운드의 검증 대상:

```text
- `LegacyVerificationChain.Row`에 `GasCategoryAxis axis`, `BigDecimal actualUnitPrice`를 보존한다.
- `MonthEndCloseService.legacyRoutedRows`가 `SetPoolLine`의 category axis·actual unit price를 Row에 전달하고, synthetic route도 현재 AxisKey를 전달한다.
- `focusRows`는 기존 partner·token·kind·branch 조건을 유지하면서 화면 행의 `itemName`, `axis`, `actualUnitPrice`도 일치시킨다.
- `scopeRows`의 같은 scope 전체 검사, `findFocusRoutes`의 모든 same-Axis route 수집, `aggregateRouteRevalidations`의 false 우선·안정 대표 선택은 변경하지 않았다.

TOTAL tests=78 failures=0 errors=0 skipped=0

| R17 전표 A의 `30000` OUTDOOR 화면 행 | `불일치(false)` | `확인(true)` |
| R17 전표 B의 `40000` OUTDOOR 화면 행 | `불일치(false)` | `불일치(false)` |
| `M-P-M`, `P-M-P-P`, `P-P-M` | `false`, `false`, `true` | 동일 |
```

판정: R18이 주장한 핵심은 (a) `focusRows`를 `itemName·axis·actualUnitPrice`까지 좁혔다는 것, (b) `scopeRows`와 `LegacySetMatcher` pool은 보존했다는 것, (c) 캐시 배제 선택 suite가 `78/0/0/0`이라는 것, (d) A `30000`만 `false→true`, B `40000` 및 세 sequence는 불변이라는 것이다. 이하에서는 이 네 주장을 보고서 인용이 아니라 현 소스·원문·실행 결과로 독립 재검증한다.

### 선행 확인 2 — R17 적발 보고서

실행 명령 원문:

```powershell
Get-Content -LiteralPath 'docs\dev-reports\2026-08-03-874-r17-reconvergence.md' -Raw -Encoding UTF8
```

출력 원문 중 R17 결함 핵심:

```text
Axis A focusRoutes=1
Axis A isolated=true
Axis A with separate Axis B=false

`LegacyVerificationChain.focusRows`가 화면 집계키보다 넓게 같은 거래처·token·kind·branch의 모든 route를 모은다. 이 때문에 실제단가가 달라 별도 모델별 재검증 행인 미완성 전표 B의 `used=0/1`이, 정상 완성 전표 A의 `used=1/1` 판정에 들어가 A를 `확인(true) → 불일치(false)`로 바꾼다.

- 최소 사용자 재현: **2전표 / 4원천행**.
- 추가 오판: 정상 완성 세트 A의 **1집계행**.
- 현재 공유 실 DB 관측: **0건(발화 거래 snapshot 0행)**.
- 운영 총 영향: **계수 불가**.
```

판정: R17은 단가가 다른 별도 `AxisKey` B가 A의 chain 내부로 다시 유입되는 과잉 불일치를 적발했다. R19는 그 반대 방향을 본다. 즉 R18이 단가를 chain 수집 축으로 삼으면서, 실제로는 함께 봐야 하는 원천행을 갈라 각 조각을 독립 `true`로 만들 수 있는지 검증해야 한다. R17의 공유 DB 관측은 사슬 발화 snapshot 0행이었으므로, 이번 실데이터 계수도 현재 DB 상태를 새로 읽어 확인하지 않는 한 과거 0을 그대로 재사용하지 않는다.

### 선행 확인 3 — R16 fix 보고서

실행 명령 원문:

```powershell
Get-Content -LiteralPath 'docs\dev-reports\2026-08-03-874-r16-fix.md' -Raw -Encoding UTF8
```

출력 원문 중 R15 결함과 R16 보존 계약:

```text
RED 판정: `패널 → 본체 → 패널`에서 현행 집계행은 첫 패널의 `DEFAULT` 결과 `verified=true`를 표시하고, 뒤 패널의 `SINGLE_ACCESSORY` 결과 `verified=false`를 숨긴다.

- `findFocusRoute(...).findFirst()`를 제거하고 `setPool`·`routedRows` 동일 인덱스에서 AxisKey가 정확히 일치하는 모든 route를 수집한다.
- 각 route마다 기존 chain의 `branch`, `riUsageDecision`, `revalidateByLegacyBranch`를 독립 실행한다.
- 집계 결합은 `false` 우선, 그 다음 `null`, 모든 route가 `true`일 때만 `true`다.

TOTAL tests=76 failures=0 errors=0 skipped=0
```

판정: R15의 본질은 한 화면 집계행에 포함된 여러 원천 route 중 뒤의 `false`가 첫 `true`에 가려진 것이다. R18의 새 `focusRows` 축이 `AxisKey`와 같다는 사실만으로 R15 재발이 배제되지는 않는다. 먼저 “현재 화면 행 생성 자체가 actualUnitPrice로 갈라지는 것이 사용자·레거시 의미에 맞는가”를 확인해야 한다. 같은 논리 품목·세트 소비 단위를 단가 차이로 여러 화면 행으로 나눈다면, 각 행 내부 false-first가 정상이어도 전체 세트 불완전성을 숨길 수 있다.

### 저장소 규율·핸드오프 확인

실행 명령 원문:

```powershell
Get-Content -LiteralPath '.codex\AGENTS.md' -Raw -Encoding UTF8
Get-Content -LiteralPath 'docs\handoff\CURRENT-WORK.md' -Raw -Encoding UTF8
rg -n -C 8 "#1057|874|R18|riUsage|actualUnitPrice|focusRows" docs/handoff/CURRENT-WORK.md
```

출력 원문 중 관련 대목:

```text
.codex/AGENTS.md: 호칭은 "개발책임자", 한국어로 짧고 명확하게 응대.
CURRENT-WORK.md: accounting-service 전체 테스트 300초대 timeout — 권위는 CI.
CURRENT-WORK.md: 증상 0 ≠ 규칙 정확 — 경계 행·전표·발화가 0건이라 안 보이는 것과 규칙이 맞는 것은 다르다.
CURRENT-WORK.md: 현재 일마감이 거래처·문서 경계 없이 품명을 합산한다.
```

판정: 선택 테스트는 반드시 fresh 실행으로 판정하고 전체 suite timeout은 성공으로 포장하지 않는다. 현재 거래 snapshot의 발화 0건이 나오더라도 논리 경계의 적합성을 별도로 검증한다. 행 순서는 `line_no` 계승으로 고정하며 변경 지적을 하지 않는다.

## ① R15 결함이 되살아났는가

### ①-1. 현 production 행 생성·판정 경계 대조

실행 명령 원문:

```powershell
$specs=@(
  @{P='services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/LegacyVerificationChain.java';A=55;B=195},
  @{P='services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/MonthEndCloseService.java';A=355;B=425},
  @{P='services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/MonthEndCloseService.java';A=475;B=525},
  @{P='services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/MonthEndCloseService.java';A=620;B=742})
foreach($s in $specs){
  "FILE=$($s.P) LINES=$($s.A)-$($s.B)"
  $l=Get-Content -LiteralPath $s.P -Encoding UTF8
  for($i=$s.A-1;$i -lt [Math]::Min($s.B,$l.Count);$i++){'{0,4}: {1}' -f ($i+1),$l[$i]}
}
```

출력 원문 중 판정 경계:

```text
MonthEndCloseService.java
366: BigDecimal actualUnitPrice = actualUnitPrice(quantity, supplyAmount, vatAmount);
367: AxisKey key = axisKey(partnerCode, productName, modelName, categoryKey, actualUnitPrice);
368: ModelAccumulator acc = byModel.computeIfAbsent(key,
422: return new AxisKey(partnerCode, label, modelToken, axis, actualUnitPrice);
500: List<LegacyVerificationChain.RoutedRow> focusRoutes = findFocusRoutes(routedRows, setPool, axisKey);
659: private static boolean sameAxis(AxisKey axis, SetPoolLine source) {
660:   return ... partnerCode
661:          && ... label/itemName
662:          && ... modelToken
663:          && axis.axis() == source.axis()
664:          && sameUnitPrice(axis.actualUnitPrice(), source.unitPrice());

LegacyVerificationChain.java
179: private static List<RoutedRow> focusRows(RoutedRow focus, List<RoutedRow> rows) {
181:   ... partnerCode
182:   ... itemName
183:   ... modelToken
184:   ... kind
185:   ... axis
186:   ... sameUnitPrice(actualUnitPrice)
187:   ... same branch
```

판정:

- 현 Java 화면의 기계적 행 경계는 `partnerCode·품명·modelToken·category axis·actualUnitPrice`다. `findFocusRoutes`는 그 행에 속한 모든 원천 route를 모으고, R16의 `aggregateRouteRevalidations`는 이 route들을 `false→null→true` 순으로 결합한다.
- R18 `focusRows`는 그 화면 축보다 더 좁게 `kind·branch`도 맞추지만, 다른 kind/branch route 자체는 `findFocusRoutes`에서 별도로 평가된 뒤 최종 false-first로 다시 합쳐진다. 따라서 **현재 Java가 이미 같은 화면 행이라고 정의한 AxisKey 내부**에서는 R15의 “뒤 false가 첫 true에 가림”이 이 소스 구조만으로 재발하지 않는다.
- 남은 핵심은 `actualUnitPrice`가 화면 행 축이어야 하느냐이다. 단가가 달라도 레거시·사용자 의미상 같은 표시 행이어야 한다면, Java가 행 생성 단계에서 먼저 갈라 R15 계열 은폐를 화면 바깥으로 옮긴 것이다. 이 판단은 ② 실데이터 계수와 ③ 레거시 표시 단위 대조 후 확정한다.

### 실 DB 조회 경계 확인

실행 명령 원문:

```powershell
docker ps --format "{{.Names}}|{{.Image}}|{{.Status}}"
```

출력 원문 중 관련 컨테이너:

```text
samhan-accounting-service|infrastructure-accounting-service|Up 19 minutes (healthy)
samhan-slip-service|infrastructure-slip-service|Up 3 hours (healthy)
samhan-postgres|postgres:16-alpine|Up 5 hours (healthy)
```

판정: accounting/slip 서비스 컨테이너는 다른 PR 배포본이므로 HTTP 응답·실행 jar를 이 PR 증거로 사용하지 않는다. 이후 Docker 사용은 `samhan-postgres`에 대한 `BEGIN TRANSACTION READ ONLY` SQL뿐이며 컨테이너 재기동·이미지 작업은 하지 않는다.

## ② `actualUnitPrice`가 축으로 적절한가 — 실 데이터 계수

### ②-1. 실제 production 입력 열과 token·axis 규칙 고정

실행 명령 원문:

```powershell
docker exec samhan-postgres psql -U samhan -d accounting_db -v ON_ERROR_STOP=1 -c "BEGIN TRANSACTION READ ONLY; SELECT table_name, string_agg(column_name, ',' ORDER BY ordinal_position) AS columns FROM information_schema.columns WHERE table_schema='public' AND table_name IN ('sales_accounting_slips','sales_accounting_slip_lines','sales_accounting_slip_allocations','purchase_accounting_slips','purchase_accounting_slip_lines','purchase_accounting_slip_allocations','tax_invoices','tax_invoice_lines') GROUP BY table_name ORDER BY table_name; COMMIT;"
Get-Content -LiteralPath 'services\accounting-service\src\main\java\com\samhanair\logis\accounting\service\ModelTokenExtractor.java' -Raw -Encoding UTF8
Get-Content -LiteralPath 'services\accounting-service\src\main\java\com\samhanair\logis\accounting\service\GasCategoryAxis.java' -Raw -Encoding UTF8
```

출력 원문 중 핵심:

```text
sales_accounting_slip_lines       | ... product_name,qty,unit_price,supply_amount,vat_amount,...,model_name,category_key
sales_accounting_slip_allocations | ... allocated_qty,allocated_amount,...,model_name,category_key
tax_invoice_lines                 | ... item_name,quantity,unit_price,supply_amount,vat_amount,...,model_name,category_key
purchase_accounting_slip_lines    | ... product_name,qty,unit_price,supply_amount,vat_amount ...

MODEL_TOKEN = \b(AC|AP|AR|AF|AM|AJ|AXJ|PC|AWR|ARR)[A-Z0-9\-]{4,}\b
GasCategoryAxis schedule keys = homemulti / singleSets / commercialMulti / oldProducts; 그 외 UNKNOWN
```

판정: 현 production에서 `setPool`에 도달하려면 `model_name`이 비어 있지 않아야 한다. 직접 sales/tax snapshot은 line의 `model_name·category_key`를 쓰고, legacy sales line은 allocation의 보존값을 쓸 수 있다. purchase snapshot 스키마에는 두 보존 열이 없어 현재 실데이터의 단가 분할 사슬 모집단이 될 수 없다. 계수는 화면 요청 단위와 같게 source 종류·업무일자·거래처·품명·token·axis를 고정하고, 그 안의 `actualUnitPrice=(공급가액+부가세)/수량` distinct 수가 2 이상인 그룹을 센다.

### ②-2. 현재 공유 DB의 사슬 도달 모집단

실행 명령 원문:

```powershell
docker exec samhan-postgres psql -U samhan -d accounting_db -v ON_ERROR_STOP=1 -c "BEGIN TRANSACTION READ ONLY; SELECT 'sales_lines' AS source, COUNT(*) AS displayed_rows, COUNT(*) FILTER (WHERE NULLIF(btrim(l.model_name),'') IS NOT NULL) AS model_rows, COUNT(*) FILTER (WHERE NULLIF(btrim(l.model_name),'') IS NOT NULL AND NULLIF(btrim(l.category_key),'') IS NOT NULL AND COALESCE(l.qty,0)<>0) AS eligible_rows FROM sales_accounting_slip_lines l JOIN sales_accounting_slips s ON s.id=l.slip_id WHERE COALESCE(l.is_deleted,false)=false AND COALESCE(s.is_deleted,false)=false AND s.status='POSTED' UNION ALL SELECT 'sales_allocations', COUNT(*), COUNT(*) FILTER (WHERE NULLIF(btrim(a.model_name),'') IS NOT NULL), COUNT(*) FILTER (WHERE NULLIF(btrim(a.model_name),'') IS NOT NULL AND NULLIF(btrim(a.category_key),'') IS NOT NULL AND COALESCE(a.allocated_qty,0)<>0) FROM sales_accounting_slip_allocations a JOIN sales_accounting_slip_lines l ON l.id=a.sales_slip_line_id JOIN sales_accounting_slips s ON s.id=l.slip_id WHERE COALESCE(a.is_deleted,false)=false AND COALESCE(l.is_deleted,false)=false AND COALESCE(s.is_deleted,false)=false AND s.status='POSTED' AND l.model_name IS NULL AND l.category_key IS NULL UNION ALL SELECT 'tax_invoice_lines', COUNT(*), COUNT(*) FILTER (WHERE NULLIF(btrim(l.model_name),'') IS NOT NULL), COUNT(*) FILTER (WHERE NULLIF(btrim(l.model_name),'') IS NOT NULL AND NULLIF(btrim(l.category_key),'') IS NOT NULL AND COALESCE(l.quantity,0)<>0) FROM tax_invoice_lines l JOIN tax_invoices t ON t.id=l.tax_invoice_id WHERE COALESCE(l.is_deleted,false)=false AND COALESCE(t.is_deleted,false)=false AND t.status='ISSUED'; COMMIT;"
```

출력 원문:

```text
BEGIN
      source       | displayed_rows | model_rows | eligible_rows
-------------------+----------------+------------+---------------
 sales_lines       |          10290 |          0 |             0
 sales_allocations |              0 |          0 |             0
 tax_invoice_lines |              8 |          0 |             0
(3 rows)
COMMIT
```

판정: 현재 공유 DB에서 production 사슬에 도달하는 실거래 행은 **0행**이다. 따라서 이 DB에서 “같은 거래처·품명·token·axis인데 단가만 다른” 화면 그룹은 최대 0이며, **관측 영향도 0건**이다. 이는 단가 축이 옳다는 0건이 아니라 발화 snapshot 자체가 없는 0건이다. 아래에서 SQL 그룹 계수를 그대로 실행해 요청 수치를 명시하고, 저장소의 실제 원본 거래 데이터에 보존 모델축이 있는지도 별도로 찾는다.

정정: 직전 `eligible_rows` 보조 계수는 `category_key`까지 nonblank로 제한했지만 production은 category가 비어도 `UNKNOWN` 축으로 처리한다. 요청한 “token” 비교에는 nonblank model_name 중 Java 정규식으로 실제 token이 추출되는 행과 수량 0이 아닌 행만 필요하다. 아래 정식 계수는 이 조건으로 다시 산출했다.

### ②-3. 같은 화면 요청에서 단가만 다른 실데이터 정식 계수

실행 명령 원문:

```powershell
docker exec samhan-postgres psql -U samhan -d accounting_db -v ON_ERROR_STOP=1 -c "BEGIN TRANSACTION READ ONLY; WITH candidate AS (SELECT 'SALES_SLIP'::text AS source, s.slip_date AS business_date, s.partner_code, l.product_name AS item_name, substring(upper(l.model_name) from '(AC|AP|AR|AF|AM|AJ|AXJ|PC|AWR|ARR)[A-Z0-9-]{4,}') AS token, COALESCE(NULLIF(btrim(l.category_key),''),'UNKNOWN') AS axis, round((COALESCE(l.supply_amount,0)+COALESCE(l.vat_amount,0))/NULLIF(l.qty,0),10) AS actual_unit_price FROM sales_accounting_slip_lines l JOIN sales_accounting_slips s ON s.id=l.slip_id WHERE COALESCE(l.is_deleted,false)=false AND COALESCE(s.is_deleted,false)=false AND s.status='POSTED' AND NULLIF(btrim(l.model_name),'') IS NOT NULL AND COALESCE(l.qty,0)<>0 UNION ALL SELECT 'TAX_INVOICE', t.supply_date, t.partner_code, l.item_name, substring(upper(l.model_name) from '(AC|AP|AR|AF|AM|AJ|AXJ|PC|AWR|ARR)[A-Z0-9-]{4,}'), COALESCE(NULLIF(btrim(l.category_key),''),'UNKNOWN'), round((COALESCE(l.supply_amount,0)+COALESCE(l.vat_amount,0))/NULLIF(l.quantity,0),10) FROM tax_invoice_lines l JOIN tax_invoices t ON t.id=l.tax_invoice_id WHERE COALESCE(l.is_deleted,false)=false AND COALESCE(t.is_deleted,false)=false AND t.status='ISSUED' AND NULLIF(btrim(l.model_name),'') IS NOT NULL AND COALESCE(l.quantity,0)<>0), grouped AS (SELECT source,business_date,partner_code,item_name,token,axis,COUNT(*) AS source_rows,COUNT(DISTINCT actual_unit_price) AS price_count FROM candidate WHERE token IS NOT NULL GROUP BY source,business_date,partner_code,item_name,token,axis HAVING COUNT(DISTINCT actual_unit_price)>1) SELECT (SELECT COUNT(*) FROM candidate WHERE token IS NOT NULL) AS token_rows, COUNT(*) AS differing_price_groups, COALESCE(SUM(source_rows),0) AS source_rows_in_groups, COALESCE(SUM(price_count),0) AS resulting_price_rows, COALESCE(MAX(price_count),0) AS max_prices_in_group FROM grouped; COMMIT;"
```

출력 원문:

```text
BEGIN
 token_rows | differing_price_groups | source_rows_in_groups | resulting_price_rows | max_prices_in_group
------------+------------------------+-----------------------+----------------------+---------------------
          0 |                      0 |                     0 |                    0 |                   0
(1 row)
COMMIT
```

판정: 현재 공유 DB 실측은 **token 도달 행 0, 단가만 다른 그룹 0, 그 그룹의 원천행 0, Java가 만들 가격별 화면행 0**이다. 실거래에서 단가 1원 차이 사례의 존재·영향은 이 DB로 확인할 수 없다. sales allocation은 별도 보조 계수에서도 0행이므로 위 합계에서 빠진 실 후보가 없다.

### ②-4a. 이관 실거래 `product_name` token 보조 계수 — 첫 SQL 실패

실행 명령 원문: POSTED sales 10,290행에서 `product_name`에 Java와 같은 모델 접두 정규식을 적용하고, 같은 날짜·거래처·품명·token의 distinct VAT 포함 단가를 집계한 뒤 같은 CTE를 두 번째 SELECT에서 재사용하려 했다.

출력 원문:

```text
BEGIN
 token_rows | same_day_groups | same_day_source_rows | same_day_price_rows | all_time_groups | all_time_source_rows
------------+-----------------+----------------------+---------------------+-----------------+---------------------
       9544 |             170 |                  415 |                 353 |             407 |                 1697
(1 row)

ERROR:  relation "same_day" does not exist
```

판정: PostgreSQL CTE 범위가 첫 SELECT에서 끝나 두 번째 SELECT가 실패했고 transaction은 commit되지 않았다. 첫 SELECT 숫자는 산출됐지만 실패 명령의 값으로 최종 계수하지 않는다. CTE를 각 SELECT에 반복해 즉시 재실행한다.

### ②-4b. 이관 실거래 `product_name` token 보조 계수 — token 캡처 오류 발견

재실행 출력 원문 중 핵심:

```text
 token_rows | same_day_groups | same_day_source_rows | same_day_price_rows | all_time_groups | all_time_source_rows
------------+-----------------+----------------------+---------------------+-----------------+---------------------
       9544 |             170 |                  415 |                 353 |             407 |                 1697

2026-05-06 | 8428102605 | AR-EH05 [무선냉난방] | AR | 2 | 2 | 13156... | 13409...
```

판정: SQL `substring` 정규식 안의 접두사 괄호가 첫 캡처 그룹이 되어 token 전체가 아니라 `AR`만 반환됐다. exact `product_name`도 함께 그룹키여서 이 출력의 그룹 수가 우연히 유지될 수는 있지만, 요청한 token 계수의 원문으로 인정하지 않는다. outer 캡처 + non-capturing prefix, 그리고 Java처럼 괄호 설명 제거를 적용해 다시 실행한다.

### ②-4c. 이관 실거래 `product_name` token 보조 계수 — 성공

실행 명령 원문:

```powershell
docker exec samhan-postgres psql -U samhan -d accounting_db -v ON_ERROR_STOP=1 -c "BEGIN TRANSACTION READ ONLY; WITH base AS (SELECT s.slip_date,s.partner_code,l.product_name,upper(btrim(regexp_replace(l.product_name,'\\[.*?\\]|\\(.*?\\)|\\{.*?\\}','','g'))) cleaned,round((COALESCE(l.supply_amount,0)+COALESCE(l.vat_amount,0))/NULLIF(l.qty,0),10) actual_unit_price FROM sales_accounting_slip_lines l JOIN sales_accounting_slips s ON s.id=l.slip_id WHERE COALESCE(l.is_deleted,false)=false AND COALESCE(s.is_deleted,false)=false AND s.status='POSTED' AND COALESCE(l.qty,0)<>0), candidate AS (SELECT *,substring(cleaned from '((?:AC|AP|AR|AF|AM|AJ|AXJ|PC|AWR|ARR)[A-Z0-9-]{4,})') token FROM base), same_day AS (SELECT slip_date,partner_code,product_name,token,COUNT(*) source_rows,COUNT(DISTINCT actual_unit_price) price_count,MIN(actual_unit_price) min_price,MAX(actual_unit_price) max_price FROM candidate WHERE token IS NOT NULL GROUP BY slip_date,partner_code,product_name,token HAVING COUNT(DISTINCT actual_unit_price)>1), all_time AS (SELECT partner_code,product_name,token,COUNT(*) source_rows,COUNT(DISTINCT actual_unit_price) price_count FROM candidate WHERE token IS NOT NULL GROUP BY partner_code,product_name,token HAVING COUNT(DISTINCT actual_unit_price)>1) SELECT (SELECT COUNT(*) FROM candidate WHERE token IS NOT NULL) token_rows,(SELECT COUNT(*) FROM same_day) same_day_groups,(SELECT COALESCE(SUM(source_rows),0) FROM same_day) same_day_source_rows,(SELECT COALESCE(SUM(price_count),0) FROM same_day) same_day_price_rows,(SELECT COUNT(*) FROM all_time) all_time_groups,(SELECT COALESCE(SUM(source_rows),0) FROM all_time) all_time_source_rows,(SELECT MIN(max_price-min_price) FROM same_day) min_nonzero_spread FROM same_day LIMIT 1; ... 같은 CTE로 spread 오름차순 20건 조회; COMMIT;"
```

출력 원문:

```text
 token_rows | same_day_groups | same_day_source_rows | same_day_price_rows | all_time_groups | all_time_source_rows | min_nonzero_spread
------------+-----------------+----------------------+---------------------+-----------------+----------------------+-------------------
       9544 |             170 |                  415 |                 353 |             407 |                 1697 |     253.0000000000

2026-05-06 | 8428102605 | AR-EH05 [무선냉난방]           | AR-EH05    | 2 | 2 | 13156 | 13409 | 253
2026-05-11 | 4058115046 | AR-EC05 [무선냉전]             | AR-EC05    | 2 | 2 | 13409 | 13662 | 253
2026-05-14 | 8428102605 | AR-EC05 [무선냉전]             | AR-EC05    | 5 | 4 | 13156 | 13915 | 759
2026-05-07 | 8428102605 | PC1NWSK3NW (WIFI판넬) [내장형] | PC1NWSK3NW | 2 | 2 | 81620 | 83160 | 1540
```

판정:

- 현재 production 보존축(`model_name/category_key`)으로는 0건이지만, 동일 DB의 이관 실거래 원문 `product_name`에서 Java token 규칙을 적용하면 **같은 날짜·거래처·정확 품명·token인데 VAT 포함 단가만 다른 그룹이 170개**, 그 안의 **원천행 415개**, 단가별로 갈라질 **화면행 353개**다.
- 전체 기간을 날짜 없이 묶으면 407그룹/1,697원천행이다. 화면은 일자별 조회이므로 사용자 영향 후보의 정식 보조 수치는 170그룹/415행/353가격행이다.
- 최소 실측 단가 차이는 253원이며 exact 1원 차이는 이번 snapshot에 없다. 그러나 `AxisKey`는 `BigDecimal.compareTo` exact 비교라 253원 차이도 전부 분리한다.
- 이 170그룹은 `model_name/category_key`가 비어 현재 사슬에는 **도달하지 않는다**. 따라서 현재 오판 건수로 확대하지 않는다. 다만 “실거래에서 같은 논리 품목의 단가 차이는 드물거나 이론적”이라는 전제는 반증한다. 보존축이 채워지는 신규 거래에서는 동일 현상이 즉시 발화할 수 있다.

### ②-5. 단가 차이 그룹의 전표 경계와 미세 차이

실행 명령 원문:

```powershell
docker exec samhan-postgres psql -U samhan -d accounting_db -v ON_ERROR_STOP=1 -c "BEGIN TRANSACTION READ ONLY; WITH base AS (... slip_no·slip_date·partner_code·product_name·actual_unit_price ...), candidate AS (... Java token 추출 ...), grouped AS (SELECT slip_date,partner_code,product_name,token,COUNT(*) source_rows,COUNT(DISTINCT slip_no) scope_count,COUNT(DISTINCT actual_unit_price) price_count,MIN(actual_unit_price) min_price,MAX(actual_unit_price) max_price ... HAVING COUNT(DISTINCT actual_unit_price)>1) SELECT COUNT(*) groups,COUNT(*) FILTER (WHERE scope_count=1) single_scope_groups,COUNT(*) FILTER (WHERE scope_count>1) cross_scope_groups,COALESCE(SUM(source_rows) FILTER (WHERE scope_count=1),0) single_scope_rows,COALESCE(SUM(source_rows) FILTER (WHERE scope_count>1),0) cross_scope_rows,COUNT(*) FILTER (WHERE max_price-min_price=1) exact_one_won_groups,COUNT(*) FILTER (WHERE max_price-min_price<=100) within_100_won_groups FROM grouped; COMMIT;"
```

출력 원문:

```text
 groups | single_scope_groups | cross_scope_groups | single_scope_rows | cross_scope_rows | exact_one_won_groups | within_100_won_groups
--------+---------------------+--------------------+-------------------+------------------+----------------------+----------------------
    170 |                  17 |                153 |                34 |              381 |                    0 |                     0
```

판정: 170그룹 중 **153그룹/381행은 서로 다른 전표를 가로지르고**, **17그룹/34행은 한 전표 안에서도 단가가 갈린다**. R17/R18의 cross-scope 논점만이 아니라 동일 전표 안 분할도 실데이터에 존재한다. exact 1원 또는 100원 이하 차이는 0이며 최소 차이는 앞 절의 253원이다.

## ③ 레거시 대조 — R18 근거와 표시 단위

### ③-1. `Code.js` 원문 직접 확인

실행 명령 원문:

```powershell
$p='tools/legacy-gas/일마감 프로그램/Code.js'
$l=Get-Content -LiteralPath $p -Encoding UTF8
foreach($r in @(@(450,485),@(560,670),@(668,735),@(735,790))){
  "FILE=$p LINES=$($r[0])-$($r[1])"
  for($i=$r[0]-1;$i -lt [Math]::Min($r[1],$l.Count);$i++){'{0,4}: {1}' -f ($i+1),$l[$i]}
}
```

출력 원문:

```text
458: var ecountDataMapped = ecountData.map(function(r, i) {
459:   var obj = { _ri: i };
473: var invoiceGroups = {};
475:   var key = row['일자'] + '_' + row['번호'];
477:   invoiceGroups[key].push(row);

568: var pool = [];
575:   ri: item._ri,
578:   unitPrice: money_to_int_(item['단가(VAT포함)']),

650: var finalExpectedPrice = expectedPriceSum - discount;
651: var invoicePriceSum = 0;
652: matchedPoolIdxs.forEach(function(idx) { invoicePriceSum += pool[idx].unitPrice; });
654: if (Math.abs(invoicePriceSum) === Math.abs(finalExpectedPrice)) {
655:   matchedPoolIdxs.forEach(function(idx) { pool[idx].used = true; });

661: var riUsage = {};
662: pool.forEach(function(p) {
663:   if (!riUsage[p.ri]) riUsage[p.ri] = { total: 0, used: 0 };
664:   riUsage[p.ri].total++;
665:   if (p.used) riUsage[p.ri].used++;

694: var isUsed = (riUsage[item._ri] && riUsage[item._ri].used === riUsage[item._ri].total);
697: var hasFailedMain = items.some(function(it) {
699:   (!riUsage[it._ri] || riUsage[it._ri].used !== riUsage[it._ri].total);
709: } else if (item._cls === 'INDOOR' || item._cls === 'OUTDOOR' || item._cls === 'SUB_INDOOR') {
710:   item['확인'] = (riUsage[item._ri] && riUsage[item._ri].used === riUsage[item._ri].total);

738: if (...) pre.push(item);
739: else main.push(item);
744: return { status: 'success', main: main, pre: pre, sum: main.concat(pre) };
```

판정:

- R18의 인용은 정확하다. `riUsage`는 `_ri`별 `total/used`이고, 실제단가는 세트 기대합과 선택된 전표행 합을 비교하는 산술값이다. `Code.js:650-655`, `:661-665` 주장은 원문과 일치한다.
- 레거시는 **단가로 화면 행을 그룹핑하지 않는다.** 더 정확히는 `ecountData` 원천행마다 `_ri`를 부여하고, 판정 후 같은 item 객체를 `main/pre`에 한 번씩 넣어 반환한다. 단가가 같아도 원천행이 둘이면 표시행 둘이고, 단가가 달라도 역시 표시행 둘이다.
- 따라서 현대 Java의 `actualUnitPrice` 축은 레거시 표시 단위의 직접 계승이 아니다. 현대 화면이 원천행을 날짜별 상품 요약으로 합치는 별도 설계 안에서, 서로 다른 원천행을 어느 범위까지 합칠지 정한 축이다. 다만 단가가 다른 원천행을 분리하는 결과 자체는 레거시의 “원천행별 표시·`_ri`별 판정”보다 더 좁지 않다. 오히려 단가가 같은 여러 원천행만 현대 화면이 추가로 합친다.

### ③-2. 레거시 브라우저가 반환 배열을 다시 합치는지 확인

실행 명령 원문:

```powershell
rg -n -A 180 -B 20 "function renderTable\(" 'tools/legacy-gas/일마감 프로그램/Index.html'
```

출력 원문:

```text
1020: function renderTable(tbodyId, tabKey) {
1021:   let dataList = storeData[tabKey];
1025:   let filteredData = dataList.filter(d => {
1099:   filteredData.forEach((d, i) => {
1100:     let rIdx = storeData[tabKey].indexOf(d);
1101:     html += `<tr data-idx="${rIdx}">`;
1126:     if (col === '단가(VAT포함)') {
1127:       html += `<td ... value="${formatNum(d[col])}" ...>`;
1128:     } else if (col === '확인') {
1129:       html += `<td ...><select ...>`;
1153:     html += `</tr>`;
```

판정: 프런트도 `filteredData` 객체 하나당 `<tr>` 하나를 만든다. `rowSpan`은 일자·번호·거래처 같은 헤더 셀만 합치며 품목/단가/확인 행 자체를 병합하지 않는다. 레거시의 표시·판정 단위는 확실히 원천 `_ri` 행이다.

### ①-2. R18 단가 경계 focused fresh 실행

실행 명령 원문:

```powershell
.\gradlew.bat :services:accounting-service:test --tests 'com.samhanair.logis.accounting.service.LegacyVerificationChainTest.riUsageDoesNotCrossScreenRowsWithDifferentActualUnitPrices' --rerun-tasks --no-build-cache --console=plain
```

출력 원문:

```text
> Task :services:accounting-service:compileJava
> Task :services:accounting-service:compileTestJava
> Task :services:accounting-service:test

BUILD SUCCESSFUL in 24s
21 actionable tasks: 21 executed
```

판정: 현 소스가 다시 컴파일된 상태에서 A `30000 used=1/1` 판정이 B `40000 used=0/1`에 오염되지 않는 R18 직접 회귀가 fresh GREEN이다. `UP-TO-DATE`/`FROM-CACHE`는 없고 21개 task가 모두 실행됐다. 다만 이 테스트는 A만 단언하므로 다음 production probe에서 B가 별도 `불일치`로 남아 “보여야 할 false가 완전히 사라지는지”를 확인한다.

### ①-3. 완성 A + 미완성 B의 모든 가격행 production compiled probe

실행 명령 원문:

```powershell
$cp='services/accounting-service/build/classes/java/main;shared/common/build/classes/java/main'
$probe=@'
// 현 compiled LegacyVerificationChain의 9-인자 Row/route/branch/riUsageDecision을 reflection 호출.
// SLIP-A: 20000 INDOOR used 1/1, 30000 OUTDOOR used 1/1, 50000 MATERIAL used 1/1
// SLIP-B: 같은 거래처·품명·OUTDOOR token의 40000 행 used 0/1
// 네 route 각각을 전체 routedRows와 usage map으로 판정해 sourceKey/price/branch/riUsage 출력.
'@
$probe | jshell --class-path $cp
```

### 원문 보충 D — ⑤-3b 값 변경 표

```powershell
$cp='services/accounting-service/build/classes/java/main;shared/common/build/classes/java/main'
$probe=@'
import java.lang.reflect.*;
import java.math.*;
import java.util.*;
Class<?> chain=Class.forName("com.samhanair.logis.accounting.service.LegacyVerificationChain"); Class<?> rowC=Class.forName("com.samhanair.logis.accounting.service.LegacyVerificationChain$Row"); Constructor<?> rc=Arrays.stream(rowC.getDeclaredConstructors()).filter(c->c.getParameterCount()==9).findFirst().orElseThrow(); rc.setAccessible(true); Class<?> axisC=Class.forName("com.samhanair.logis.accounting.service.GasCategoryAxis"); Object single=Enum.valueOf((Class)axisC,"SINGLE"); Method route=Arrays.stream(chain.getDeclaredMethods()).filter(m->m.getName().equals("route")).findFirst().orElseThrow(); route.setAccessible(true); Method ri=Arrays.stream(chain.getDeclaredMethods()).filter(m->m.getName().equals("riUsageDecision")).findFirst().orElseThrow(); ri.setAccessible(true); Class<?> usageC=Class.forName("com.samhanair.logis.accounting.service.LegacySetMatcher$Usage"); Constructor<?> uc=usageC.getDeclaredConstructors()[0]; uc.setAccessible(true);
String outdoor="AC060BXAPBH7SY"; List<Object> afterRows=List.of(rc.newInstance("P","A","A#2","실외기",outdoor,"OUTDOOR",false,single,new BigDecimal("30000")),rc.newInstance("P","B","B#1","실외기",outdoor,"OUTDOOR",false,single,new BigDecimal("40000"))); List<?> afterRouted=(List<?>)route.invoke(null,afterRows); Map<String,Object> abUsage=Map.of("A#2",uc.newInstance(1,1),"B#1",uc.newInstance(1,0)); Object aAfter=ri.invoke(null,afterRouted.get(0),afterRouted,abUsage,new BigDecimal("30000"),new BigDecimal("30000")); Object bAfter=ri.invoke(null,afterRouted.get(1),afterRouted,abUsage,new BigDecimal("40000"),new BigDecimal("40000"));
List<Object> preARows=List.of(rc.newInstance("P","A","A#2","실외기",outdoor,"OUTDOOR",false,single,new BigDecimal("30000")),rc.newInstance("P","B","B#1","실외기",outdoor,"OUTDOOR",false,single,new BigDecimal("30000"))); List<?> preARouted=(List<?>)route.invoke(null,preARows); Object aBefore=ri.invoke(null,preARouted.get(0),preARouted,abUsage,new BigDecimal("30000"),new BigDecimal("30000")); List<Object> preBRows=List.of(rc.newInstance("P","A","A#2","실외기",outdoor,"OUTDOOR",false,single,new BigDecimal("40000")),rc.newInstance("P","B","B#1","실외기",outdoor,"OUTDOOR",false,single,new BigDecimal("40000"))); List<?> preBRouted=(List<?>)route.invoke(null,preBRows); Object bBefore=ri.invoke(null,preBRouted.get(1),preBRouted,abUsage,new BigDecimal("40000"),new BigDecimal("40000")); System.out.println("A 30000 before-emulation="+aBefore+" after="+aAfter); System.out.println("B 40000 before-emulation="+bBefore+" after="+bAfter);
List<Boolean> seq(boolean allUsed,String... kinds) throws Exception { List<Object> rows=new ArrayList<>(); Map<String,Object> usage=new LinkedHashMap<>(); for(int i=0;i<kinds.length;i++){boolean m=kinds[i].equals("M"); String key=kinds[i]+"-"+i; rows.add(rc.newInstance("P","S",key,m?"본체":"패널",m?"AC023CN1DBC1":"PC1BWCK3NW",m?"INDOOR":"PANEL",false,single,BigDecimal.ONE)); usage.put(key,uc.newInstance(1,allUsed?1:0));} List<?> rr=(List<?>)route.invoke(null,rows); List<Boolean> out=new ArrayList<>(); for(Object x:rr){Object d=ri.invoke(null,x,rr,usage,BigDecimal.ONE,BigDecimal.ONE); out.add(d==null?true:(Boolean)d);} return out; }
List<Boolean> mpm=seq(false,"M","P","M"); List<Boolean> pmpp=seq(false,"P","M","P","P"); List<Boolean> ppm=seq(true,"P","P","M"); System.out.println("M-P-M routes="+mpm+" aggregate="+(!mpm.contains(false))); System.out.println("P-M-P-P routes="+pmpp+" aggregate="+(!pmpp.contains(false))); System.out.println("P-P-M routes="+ppm+" aggregate="+(!ppm.contains(false)));
/exit
'@
$probe | jshell --class-path $cp
```

### 원문 보충 B — ④-2 `scopeRows` 가격 횡단

```powershell
$cp='services/accounting-service/build/classes/java/main;shared/common/build/classes/java/main'
$probe=@'
import java.lang.reflect.*;
import java.math.*;
import java.util.*;
Class<?> chain=Class.forName("com.samhanair.logis.accounting.service.LegacyVerificationChain"); Class<?> rowC=Class.forName("com.samhanair.logis.accounting.service.LegacyVerificationChain$Row"); Constructor<?> rc=Arrays.stream(rowC.getDeclaredConstructors()).filter(c->c.getParameterCount()==9).findFirst().orElseThrow(); rc.setAccessible(true); Class<?> axisC=Class.forName("com.samhanair.logis.accounting.service.GasCategoryAxis"); Object single=Enum.valueOf((Class)axisC,"SINGLE");
List<Object> rows=List.of(rc.newInstance("P","S","M#1","본체","AC023CN1DBC1","INDOOR",false,single,new BigDecimal("100")),rc.newInstance("P","S","P#2","패널","PC1BWCK3NW","PANEL",false,single,new BigDecimal("200")));
Method route=Arrays.stream(chain.getDeclaredMethods()).filter(m->m.getName().equals("route")).findFirst().orElseThrow(); route.setAccessible(true); List<?> routed=(List<?>)route.invoke(null,rows); Method branch=Arrays.stream(chain.getDeclaredMethods()).filter(m->m.getName().equals("branch")).findFirst().orElseThrow(); branch.setAccessible(true); Method ri=Arrays.stream(chain.getDeclaredMethods()).filter(m->m.getName().equals("riUsageDecision")).findFirst().orElseThrow(); ri.setAccessible(true); Class<?> usageC=Class.forName("com.samhanair.logis.accounting.service.LegacySetMatcher$Usage"); Constructor<?> uc=usageC.getDeclaredConstructors()[0]; uc.setAccessible(true); Map<String,Object> usage=Map.of("M#1",uc.newInstance(1,0),"P#2",uc.newInstance(1,0)); Object panel=routed.get(1); System.out.println("main price=100, panel price=200"); System.out.println("panel branch="+branch.invoke(null,panel,true)); System.out.println("panel riUsage="+ri.invoke(null,panel,routed,usage,new BigDecimal("200"),new BigDecimal("200")));
/exit
'@
$probe | jshell --class-path $cp
```

### 원문 보충 C — ④-3 matcher 전체 pool

```powershell
$probe=@'
import java.lang.reflect.*;
import java.math.*;
import java.util.*;
Class<?> compC=Class.forName("com.samhanair.logis.accounting.service.LegacySetMatcher$Component"); Constructor<?> compCtor=compC.getDeclaredConstructors()[0]; compCtor.setAccessible(true); Object ci=compCtor.newInstance("I","INDOOR",BigDecimal.ZERO); Object co=compCtor.newInstance("O","OUTDOOR",BigDecimal.ZERO); Object cm=compCtor.newInstance("M","MATERIAL",new BigDecimal("100000"));
Class<?> candC=Class.forName("com.samhanair.logis.accounting.service.LegacySetMatcher$SetCandidate"); Constructor<?> candCtor=candC.getDeclaredConstructors()[0]; candCtor.setAccessible(true); Object cand=candCtor.newInstance("SET",List.of(ci,co,cm));
Class<?> lineC=Class.forName("com.samhanair.logis.accounting.service.LegacySetMatcher$InvoiceLine"); Constructor<?> lineCtor=Arrays.stream(lineC.getDeclaredConstructors()).filter(c->c.getParameterCount()==6).findFirst().orElseThrow(); lineCtor.setAccessible(true); Object ai=lineCtor.newInstance("I","INDOOR",new BigDecimal("20000"),"P","A","A#1"); Object ao=lineCtor.newInstance("O","OUTDOOR",new BigDecimal("30000"),"P","A","A#2"); Object am=lineCtor.newInstance("M","MATERIAL",new BigDecimal("50000"),"P","A","A#3"); Object bo=lineCtor.newInstance("O","OUTDOOR",new BigDecimal("40000"),"P","B","B#1");
Class<?> matcherC=Class.forName("com.samhanair.logis.accounting.service.LegacySetMatcher"); Constructor<?> matcherCtor=matcherC.getDeclaredConstructors()[0]; matcherCtor.setAccessible(true); Object matcher=matcherCtor.newInstance(); Method run=Arrays.stream(matcherC.getDeclaredMethods()).filter(m->m.getName().equals("findMatchesWithUsage")).findFirst().orElseThrow(); run.setAccessible(true); Object result=run.invoke(matcher,List.of(ai,ao,am,bo),List.of(cand),Map.of()); Method matches=result.getClass().getDeclaredMethod("matches"); matches.setAccessible(true); Method usage=result.getClass().getDeclaredMethod("usage"); usage.setAccessible(true); System.out.println("matches="+matches.invoke(result)); System.out.println("usage="+usage.invoke(result));
/exit
'@
$probe | jshell --class-path 'services/accounting-service/build/classes/java/main'
```

실제 full command는 `Class.forName`으로 `LegacyVerificationChain`, `Row`, `GasCategoryAxis`, `Usage`를 불러 9-인자 생성자와 `route`·`branch`·`riUsageDecision`을 호출했다. 파일은 만들지 않았다.

출력 원문:

```text
A#1 price=20000 branch=SINGLE_MAIN riUsage=true
A#2 price=30000 branch=SINGLE_MAIN riUsage=true
A#3 price=50000 branch=SINGLE_ACCESSORY riUsage=true
B#1 price=40000 branch=SINGLE_MAIN riUsage=false
```

판정:

- R18이 A와 B를 단가로 분리해도 미완성 B의 `false`는 B 가격행에 남는다. 이 최소 사용자 입력은 여러 A 구성품을 `확인`으로 보여 주지만 **미완성 세트의 B 원천행까지 전부 확인으로 만드는 입력은 아니다**.
- matcher가 모든 원천 `_ri`를 사용 완료로 만들었다면 레거시도 각 `_ri`를 모두 true로 표시한다. 반대로 하나라도 미사용 main 원천행이 있으면 그 원천행은 현 Java에서도 자기 가격행에서 false다. 단가 분할만으로 “보여야 할 불일치가 완전히 숨는” 경로는 재현되지 않았다.

### ① 종합 판정

**R15 결함은 되살아나지 않았다.** 현재 Java AxisKey 내부의 여러 route는 R16 false-first가 모두 결합하고, AxisKey 밖으로 갈린 단가행도 레거시 원문상 애초 서로 다른 `_ri` 표시행이었다. 완성 A/미완성 B의 production probe에서도 B false가 별도 행에 보존됐다. 단가 분할은 현대 요약행 수를 늘리는 계승 설계 차이지만, 이번 유일 질문인 “실 사용자 경로에서 불일치가 다시 숨는가”에 대한 재현은 없다.

### ①-4. 데스크톱이 가격별 DTO 행을 모두 표시하는지 확인

실행 명령 원문:

```powershell
$p='clients/desktop/src/renderer/routes/DailyClosingPage.tsx'
$l=Get-Content -LiteralPath $p -Encoding UTF8
foreach($r in @(@(620,720),@(1132,1167))){
  "FILE=$p LINES=$($r[0])-$($r[1])"
  for($i=$r[0]-1;$i -lt [Math]::Min($r[1],$l.Count);$i++){'{0,4}: {1}' -f ($i+1),$l[$i]}
}
```

출력 원문:

```text
622: const productRows = useMemo(
623:   () => (detailQuery.data?.productSummaries ?? []).map((row, index) => ({ ...row, rowIndex: index })),
675: key: 'actualUnitPrice',
676: header: '전표 단가',
711: key: 'verified',
717: row.verified === true ? <Badge variant="success">확인</Badge>
719: : row.verified === false ? <Badge variant="danger">불일치</Badge>
1162: <DataTable
1164:   rows={productRows}
1165:   rowKey={(row) => `${row.productName}-${row.rowIndex}`}
```

판정: FE는 동일 품명이라도 응답 배열 index를 row key에 포함해 모든 가격별 DTO를 별도 행으로 렌더한다. B false가 BE 응답에 남아도 FE dedup/key 충돌로 사라지는 경로는 없다. 전표 단가와 확인 배지가 같은 행에 노출되어 사용자가 가격별 mixed `확인/불일치`를 볼 수 있다.

## ④ R18이 “보존”한 경계가 실제로 보존됐는가

### ④-1. 현 source의 `scopeRows`와 matcher pool 원문

실행 명령 원문:

```powershell
$p='services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/LegacySetMatcher.java'
$l=Get-Content -LiteralPath $p -Encoding UTF8
for($i=1;$i -le [Math]::Min(180,$l.Count);$i++){'{0,4}: {1}' -f $i,$l[$i-1]}
$p2='services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/LegacyVerificationChain.java'
$l2=Get-Content -LiteralPath $p2 -Encoding UTF8
for($i=136;$i -le 200;$i++){'{0,4}: {1}' -f $i,$l2[$i-1]}
```

출력 원문 중 핵심:

```text
LegacySetMatcher.java
36: boolean[] used = new boolean[pool.size()];
38: for (int indoorIndex = 0; indoorIndex < pool.size(); indoorIndex++) {
44:   Optional<Match> match = tryMatch(pool, used, indoorIndex, indoor, candidate, ...);
53: Map<String, MutableUsage> usage = new LinkedHashMap<>();
54: for (int index = 0; index < pool.size(); index++) {
55:   String sourceKey = pool.get(index).sourceKey();
90: int outdoorIndex = findUnusedByToken(pool, used, requiredOutdoor.modelToken(), "OUTDOOR",
91:         indoor.scopeKey());
101: int optionIndex = findUnusedByToken(pool, used, option.modelToken(), null,
102:         indoor.scopeKey());
114: BigDecimal invoice = indexes.stream().map(index -> pool.get(index).unitPrice())
129: && Objects.equals(scopeKey, line.scopeKey()))

LegacyVerificationChain.java
152: for (RoutedRow focusRow : focusRows(focus, rows)) {
153:   List<RoutedRow> scopeRows = rows.stream()
154:       .filter(row -> sameScope(focusRow.row(), row.row()))
158:   boolean hasFailedMain = scopeRows.stream()
159:       .filter(row -> isFailedMain(row.row().kind()))
160:       .anyMatch(row -> !fullyConsumed(usage, row.row().sourceKey()));
195: private static boolean sameScope(Row left, Row right) {
196:   return Objects.equals(left.partnerCode(), right.partnerCode())
197:       && Objects.equals(left.scopeKey(), right.scopeKey());
```

판정:

- `scopeRows`는 좁아진 `focusRows` 결과 하나를 출발점으로 삼지만, 실제 검사 대상은 여전히 전체 `rows`에서 같은 `partnerCode+scopeKey`인 모든 kind·단가·axis 행이다. `hasFailedMain`의 전표 단위 경계는 소스상 보존됐다.
- `LegacySetMatcher`는 전달받은 전체 pool을 순서대로 순회하고, candidate 구성품을 같은 `scopeKey` 안에서 찾아 사용 표시한 뒤 전체 pool의 `sourceKey`별 usage를 만든다. actualUnitPrice는 여전히 선택 구성품 합계와 기대합 비교에만 쓰이며 pool 자체를 가격별로 분할하지 않는다.
- Git 명령 금지 때문에 R18 이전 commit과 byte diff는 하지 않았다. 대신 R16/R17 보고서의 동일 메서드 원문·행동 주장과 현 source를 대조했고, 다음 compiled probe로 두 경계를 실행 확인한다.

### ④-2. 서로 다른 단가의 같은 전표 main 실패를 accessory가 보는지 실행

실행 명령 원문:

```powershell
$cp='services/accounting-service/build/classes/java/main;shared/common/build/classes/java/main'
$probe=@'
// 같은 partner/scope S: INDOOR M#1 price=100 used=0/1,
// 그 뒤 PANEL P#2 price=200 used=0/1을 현 compiled chain으로 route.
// PANEL의 branch 및 riUsageDecision을 reflection 호출.
'@
$probe | jshell --class-path $cp
```

출력 원문:

```text
main price=100, panel price=200
panel branch=SINGLE_ACCESSORY
panel riUsage=false
```

판정: `focusRows`는 panel의 200원 축으로 좁혀졌지만, `scopeRows`가 같은 전표의 100원 main 실패를 찾아 panel을 false로 판정했다. R18 단가 축이 `hasFailedMain` 전표 경계를 잘라내지 않았음이 production compiled class에서 확인됐다.

### ④-3. matcher 전체 pool·scope 격리 실행

실행 명령 원문:

```powershell
$probe=@'
// candidate SET = I(0)+O(0)+M(100000)
// 전체 pool = A scope의 I20000/O30000/M50000 + B scope의 O40000
// 현 compiled LegacySetMatcher.findMatchesWithUsage를 reflection 호출.
'@
$probe | jshell --class-path 'services/accounting-service/build/classes/java/main'
```

출력 원문:

```text
matches=[Match[setName=SET, poolIndexes=[0, 1, 2]]]
usage={A#1=Usage[total=1, used=1], A#2=Usage[total=1, used=1], A#3=Usage[total=1, used=1], B#1=Usage[total=1, used=0]}
```

판정: matcher는 A/B를 포함한 전체 pool을 한 번에 받아 A의 3행만 같은 scope에서 매칭하고, B의 다른 단가/다른 scope 원천행도 pool에서 삭제하지 않은 채 `used=0/1`로 usage에 보존했다. R18이 matcher pool을 가격별로 잘라 버렸다는 재현은 없다.

### ④ 종합 판정

R18의 “`scopeRows`와 `LegacySetMatcher` pool을 건드리지 않았다”는 동작 주장은 현 source와 compiled 실행에서 재현됐다. `scopeRows`는 가격을 가로질러 같은 전표 main 실패를 보고, matcher는 전체 pool을 유지하되 구성품 선택만 scope로 격리한다.

## ⑤ R18 수치 재현

### ⑤-1. 변경 표면 6개 클래스 캐시 배제 실행

실행 명령 원문:

```powershell
.\gradlew.bat :services:accounting-service:test --tests 'com.samhanair.logis.accounting.service.LegacyVerificationChainTest' --tests 'com.samhanair.logis.accounting.service.RiUsageDecisionTest' --tests 'com.samhanair.logis.accounting.service.LegacySetMatcherTest' --tests 'com.samhanair.logis.accounting.service.GasCategoryAxisTest' --tests 'com.samhanair.logis.accounting.service.DiscountRevalidatorTest' --tests 'com.samhanair.logis.accounting.service.DailyClosingDetailServiceTest' --rerun-tasks --no-build-cache --console=plain
```

출력 원문:

```text
> Task :shared:notification-publisher:compileJava
> Task :shared:security:compileJava
> Task :shared:common:compileJava
> Task :shared:ecount-io:compileJava
> Task :shared:realtime-abstraction:compileJava
> Task :shared:collab-core:compileJava
> Task :services:accounting-service:compileJava
> Task :services:accounting-service:compileTestJava
> Task :services:accounting-service:testClasses
> Task :services:accounting-service:test

BUILD SUCCESSFUL in 26s
21 actionable tasks: 21 executed
```

판정: exit 0이며 캐시 배제 fresh 실행이다. 출력에 `UP-TO-DATE`/`FROM-CACHE`가 없고 21개 actionable task가 모두 executed다. console 성공만으로 78개 수치를 확정하지 않고 생성된 JUnit XML을 다음 절에서 합산한다.

### ⑤-2. JUnit XML 실측

실행 명령 원문:

```powershell
$names=@('LegacyVerificationChainTest','RiUsageDecisionTest','LegacySetMatcherTest','GasCategoryAxisTest','DiscountRevalidatorTest','DailyClosingDetailServiceTest')
$rows=foreach($name in $names){
  $f=Get-ChildItem -LiteralPath 'services/accounting-service/build/test-results/test' -Filter "TEST-*$name.xml"
  [xml]$x=Get-Content -LiteralPath $f.FullName -Raw -Encoding UTF8
  [pscustomobject]@{Class=$name;Tests=[int]$x.testsuite.tests;Failures=[int]$x.testsuite.failures;Errors=[int]$x.testsuite.errors;Skipped=[int]$x.testsuite.skipped;Timestamp=$x.testsuite.timestamp}
}
$rows | Format-Table -AutoSize
[pscustomobject]@{Class='TOTAL';Tests=($rows|Measure-Object Tests -Sum).Sum;Failures=($rows|Measure-Object Failures -Sum).Sum;Errors=($rows|Measure-Object Errors -Sum).Sum;Skipped=($rows|Measure-Object Skipped -Sum).Sum} | Format-Table -AutoSize
$cacheHits=rg -n "UP-TO-DATE|FROM-CACHE" services/accounting-service/build/test-results/test -g 'TEST-*.xml' -g '*.log' 2>$null
if($LASTEXITCODE -eq 1){'CACHE_MARKERS=0'} else {$cacheHits}
```

출력 원문:

```text
Class                         Tests Failures Errors Skipped Timestamp
-----                         ----- -------- ------ ------- ---------
LegacyVerificationChainTest       7        0      0       0 2026-08-03T05:17:36
RiUsageDecisionTest              12        0      0       0 2026-08-03T05:17:36
LegacySetMatcherTest              7        0      0       0 2026-08-03T05:17:36
GasCategoryAxisTest               5        0      0       0 2026-08-03T05:17:36
DiscountRevalidatorTest          23        0      0       0 2026-08-03T05:17:36
DailyClosingDetailServiceTest    24        0      0       0 2026-08-03T05:17:33

Class Tests Failures Errors Skipped
----- ----- -------- ------ -------
TOTAL    78        0      0       0

CACHE_MARKERS=0
```

판정: R18 보고서의 **78 tests / 0 failures / 0 errors / 0 skipped**가 fresh timestamp XML에서 정확히 재현됐다. 보고서가 원문/실측으로 제시한 수치 불일치는 없다.

### ⑤-3a. 값 변경 표 production probe — 첫 입력 실패

첫 실행 출력 원문:

```text
A 30000 before-emulation=null after=null
B 40000 before-emulation=null after=null
M-P-M routes=[true, true, true] aggregate=true
P-M-P-P routes=[true, true, true, true] aggregate=true
P-P-M routes=[true, true, true] aggregate=true
```

판정: probe가 modelToken을 축약 문자열 `O/M/P`로 넣어 `isTargetModelCode`를 통과하지 못했고 모든 row가 `UNKNOWN/DEFAULT`에 머물렀다. 이는 production 값 변경 증거가 아니라 조사 입력 실패다. R18 테스트와 같은 실제 형식 token(`AC023CN1DBC1`, `PC1BWCK3NW`, `AC060BXAPBH7SY`)으로 즉시 재실행한다.

### ⑤-3b. 값 변경 표 production probe — 성공

실행 명령 원문:

```powershell
$cp='services/accounting-service/build/classes/java/main;shared/common/build/classes/java/main'
$probe=@'
// 현 compiled Row/route/riUsageDecision을 reflection 호출한다.
// A/B after: 단가 30000/40000을 그대로 두고 각각 판정.
// before-emulation: R18 이전 focusRows처럼 가격 차이를 제외 조건으로 쓰지 않는 것과 같은 row 집합을 만들기 위해
// A 판정에서는 두 row 가격을 30000, B 판정에서는 두 row 가격을 40000으로 맞추되 usage/branch/다른 축은 유지.
// sequence는 실제 형식 token AC023CN1DBC1/PC1BWCK3NW로 M-P-M, P-M-P-P, P-P-M을 실행.
'@
$probe | jshell --class-path $cp
```

출력 원문:

```text
A 30000 before-emulation=false after=true
B 40000 before-emulation=false after=false
M-P-M routes=[false, false, false] aggregate=false
P-M-P-P routes=[true, false, false, false] aggregate=false
P-P-M routes=[true, true, true] aggregate=true
```

판정:

- A `30000`: `불일치(false) → 확인(true)` 재현.
- B `40000`: `불일치(false) → 불일치(false)` 불변.
- `M-P-M=false`, `P-M-P-P=false`, `P-P-M=true` 불변.
- R18 값 변경 표의 수치·출력은 현 production compiled class에서 모두 재현됐다. 보고서 실측 불일치는 없다.

### ⑤ 종합 판정

R18 선택 surface는 캐시 배제 **78/0/0/0**, 21/21 task executed로 재현됐고 값 변경 표 5개 단언도 모두 일치했다. 전체 accounting-service suite는 이번 요청의 ⑤ 필수 수치가 아니며, 반복 300초 timeout 이력과 CI 권위 안내에 따라 실행하지 않았다.

## reflection 실행 명령 원문 보충

앞 절에서 설명으로 축약한 JShell 명령의 실제 실행 원문을 아래에 보충한다.

### 원문 보충 A — ①-3 완성 A + 미완성 B 전 가격행

```powershell
$cp='services/accounting-service/build/classes/java/main;shared/common/build/classes/java/main'
$probe=@'
import java.lang.reflect.*;
import java.math.*;
import java.util.*;
Class<?> chain=Class.forName("com.samhanair.logis.accounting.service.LegacyVerificationChain");
Class<?> rowC=Class.forName("com.samhanair.logis.accounting.service.LegacyVerificationChain$Row");
Constructor<?> rc=Arrays.stream(rowC.getDeclaredConstructors()).filter(c->c.getParameterCount()==9).findFirst().orElseThrow(); rc.setAccessible(true);
Class<?> axisC=Class.forName("com.samhanair.logis.accounting.service.GasCategoryAxis"); Object single=Enum.valueOf((Class)axisC,"SINGLE");
List<Object> rows=List.of(
 rc.newInstance("P","SLIP-A","A#1","실내기","AC060BXAPBH7SY-IN","INDOOR",false,single,new BigDecimal("20000")),
 rc.newInstance("P","SLIP-A","A#2","실외기","AC060BXAPBH7SY","OUTDOOR",false,single,new BigDecimal("30000")),
 rc.newInstance("P","SLIP-A","A#3","자재","MATERIAL-A","MATERIAL",false,single,new BigDecimal("50000")),
 rc.newInstance("P","SLIP-B","B#1","실외기","AC060BXAPBH7SY","OUTDOOR",false,single,new BigDecimal("40000")));
Method route=Arrays.stream(chain.getDeclaredMethods()).filter(m->m.getName().equals("route")).findFirst().orElseThrow(); route.setAccessible(true);
List<?> routed=(List<?>)route.invoke(null,rows);
Method branch=Arrays.stream(chain.getDeclaredMethods()).filter(m->m.getName().equals("branch")).findFirst().orElseThrow(); branch.setAccessible(true);
Method ri=Arrays.stream(chain.getDeclaredMethods()).filter(m->m.getName().equals("riUsageDecision")).findFirst().orElseThrow(); ri.setAccessible(true);
Class<?> usageC=Class.forName("com.samhanair.logis.accounting.service.LegacySetMatcher$Usage"); Constructor<?> uc=usageC.getDeclaredConstructors()[0]; uc.setAccessible(true);
Map<String,Object> usage=new LinkedHashMap<>(); usage.put("A#1",uc.newInstance(1,1)); usage.put("A#2",uc.newInstance(1,1)); usage.put("A#3",uc.newInstance(1,1)); usage.put("B#1",uc.newInstance(1,0));
for(int i=0;i<routed.size();i++){Object rr=routed.get(i); Method rowM=rr.getClass().getDeclaredMethod("row"); rowM.setAccessible(true); Object row=rowM.invoke(rr); Method sourceM=rowC.getDeclaredMethod("sourceKey"); sourceM.setAccessible(true); Method priceM=rowC.getDeclaredMethod("actualUnitPrice"); priceM.setAccessible(true); Object d=ri.invoke(null,rr,routed,usage,priceM.invoke(row),priceM.invoke(row)); System.out.println(sourceM.invoke(row)+" price="+priceM.invoke(row)+" branch="+branch.invoke(null,rr,true)+" riUsage="+d);}
/exit
'@
$probe | jshell --class-path $cp
```

## 판정 전 질문 — “이 라운드가 안 본 것이 있나?”

답: **있다.** 아래 표면은 보지 않았으며 이를 “결함 0”의 근거로 사용하지 않는다.

1. `model_name/category_key`가 실제로 채워진 운영 거래 전수. 현재 공유 DB의 사슬 도달 행이 0이라 운영 오판 총량을 계수하지 못했다.
2. 실제 전표를 생성·POST/ISSUE하고 데스크톱 화면을 클릭하는 write E2E. DB mutation 금지 때문에 production compiled class, read-only DB, FE render source로 대체했다.
3. 다른 PR #1061 배포본인 accounting/slip 컨테이너의 HTTP 응답과 라이브 화면. 이 PR 증거로 사용하지 않았다.
4. accounting-service 전체 suite. R18 필수 선택 surface 78개는 fresh 실행했지만 전체 suite는 반복 300초 timeout 이력과 CI 권위 안내에 따라 실행하지 않았다.
5. PURCHASE_SLIP에서 보존 `model_name/category_key`가 생기는 미래 스키마/입력. 현재 purchase snapshot에는 그 열이 없어 이번 사슬 모집단이 아니다.
6. 실거래 exact 1원 차이 사례. 이관 snapshot의 최소 차이는 253원이었고 1원/100원 이하 그룹은 0이었다. 코드의 exact 비교는 확인했지만 실제 1원 사례는 없었다.
7. R18 이전 commit과 현 파일의 byte diff. Git 명령 금지 때문에 수행하지 않았고, “보존” 판정은 R16/R17 기록과 현 source/compiled 동작 대조에 한정한다.

## R19 최종 판정

### 유일 질문에 대한 답

> **실 사용자 경로로 재현 가능한 결함이 있는가 — 이번 단일 각도에서는 없다.**

- **① R15 재발:** 없음. 같은 현 AxisKey 내부 route는 false-first로 모두 결합된다. 다른 단가로 갈린 미완성 B는 자기 가격행에서 `불일치`로 남고 FE가 그 행을 삭제하지 않는다.
- **② 단가 실데이터:** 현재 사슬 도달 `token_rows=0`, 직접 영향 0건. 이관 실거래 원문에는 같은 날짜·거래처·정확 품명·token의 단가 차이 **170그룹/415원천행/353가격행**이 있어 분할 자체는 현실적이지만, 보존축 공백 때문에 현재 판정 경로에는 도달하지 않는다.
- **③ 레거시:** R18 인용 정확. `riUsage`는 `_ri`별이고 단가는 세트 합 산술값이다. 레거시 화면도 가격 그룹이 아니라 원천 `_ri` 한 행씩 표시하므로, 다른 단가 행을 분리하는 것만으로 보여야 할 false가 사라지는 계승 이탈은 아니다.
- **④ 보존 경계:** `scopeRows`는 가격을 가로질러 같은 전표의 실패 main을 보고, matcher는 전체 pool과 모든 source usage를 유지한다.
- **⑤ R18 실측:** 캐시 배제 `78 tests / 0 failures / 0 errors / 0 skipped`, `21 actionable tasks: 21 executed`. A `30000 false→true`, B `40000 false 유지`, `M-P-M=false`, `P-M-P-P=false`, `P-P-M=true` 모두 재현.

영향 건수: **재현 결함 0건, 현재 공유 DB 관측 영향 0건(사슬 도달 0행)**. 이관 원문의 170그룹은 잠재 분할 모집단이지 현재 결함 건수가 아니다.

상태: **DONE** — 요청한 ①→⑤를 완료했고, 소스·Git·컨테이너·DB 상태를 변경하지 않았다. 변경 파일은 이 보고서 하나이며 Gradle은 `build/` 산출물만 재생성했다.
