# #874 S1.5 세트 riUsage · 거래처 전역DC — R17 재수렴 적대검증

- 대상 PR: #1057 (`feat/874-set-riusage-global-dc`)
- 기준 HEAD(개발책임자 제공): `87e1db9f5`
- 작성일: 2026-08-03
- 조사 규율: 읽기·조회·테스트만 수행하며 소스, Git 상태, 컨테이너, 실 DB를 변경하지 않는다.
- 유일한 질문: **실 사용자 경로로 재현 가능한 결함이 있는가.**
- 단일 각도: **R16의 `false` 우선 보수 결합이 과하여 확인이어야 할 집계행을 불일치로 바꾸는가.**
- 제외: 테스트 강도, 문서 표현, 가드 누락 등 검증 품질. 단, R16 보고서가 원문/실측으로 주장한 수치·출력의 재현 실패는 예외로 기록한다.

> 이 파일은 조사 시작 전에 생성했다. 아래에는 확인 한 건이 끝날 때마다 명령 원문, 출력 원문, 판정을 즉시 누적한다.

## 진행 기록

### 0. R16 fix·R15 적발 원문 선행 확인

실행 명령 원문:

```powershell
Get-Content -LiteralPath 'docs/dev-reports/2026-08-03-874-r16-fix.md' -Raw -Encoding UTF8
Get-Content -LiteralPath 'docs/dev-reports/2026-08-03-874-r15-reconvergence.md' -Raw -Encoding UTF8
rg -n "^#|76|0 실패|값 변경|false → true|false -> true|matching source route|LegacySetMatcher.findUnusedByToken|resolveMatchedSetNames|kindByToken|resolveProductSummaries|firstSalesSourceSlipNo|focusRows|2,512|10,290|도달 0|최종 판정" docs/dev-reports/2026-08-03-874-r16-fix.md docs/dev-reports/2026-08-03-874-r15-reconvergence.md
```

출력 원문(이번 라운드 기준 주장 발췌):

```text
R16:232:TOTAL tests=76 failures=0 errors=0 skipped=0
R16:235:기존 74개 변경 표면에 R16 순서 대조 1건과 all-true 반대급부 1건을 추가한 76개가 모두 GREEN이다.
R16:282:1전표 `패널 → 본체 → 패널` ... `확인(true)` → `불일치(false)` ... 뒤 route의 false를 숨기지 않도록 바뀐 유일한 값 변경이다
R16:283:같은 입력 `본체 → 패널 → 패널` ... `불일치(false)` → `불일치(false)` ... 값 변경 없음
R15:1057:로컬 이관 DB의 POSTED 매출전표 2,512전표/10,290행 ... R13 `RiUsageDecision` 도달 0행, R14 `LegacyVerificationChain` 도달 0행이다.
R15:1247:R14 보고서의 값 변경 3건은 모두 정확히 `false → true`로 재현됐다.
R15:1275:## 최종 판정
```

판정:

- R17이 독립 재현해야 할 수치 기준을 고정했다: 변경 표면 **76 tests / 실패·오류·skip 0**, R16 직접 값 변경 주장 **1집계행**, R15 로컬 이관 DB **2,512전표/10,290행·사슬 도달 0**, R14 값 변경 표 **3케이스 모두 false→true**.
- R16이 “아니오”로 제외한 6곳과 `matching source route` 경계는 보고서 문구가 아니라 production 경로와 실행 결과로 재검토한다.

### 0-1. 저장소 행동 규율·핸드오프 확인

실행 명령 원문:

```powershell
Get-Content -LiteralPath '.codex/AGENTS.md' -Raw -Encoding UTF8
Get-Content -LiteralPath 'docs/handoff/CURRENT-WORK.md' -Raw -Encoding UTF8
```

출력 원문(관련 대목):

```text
.codex/AGENTS.md: 사용자 호칭은 "개발책임자". 한국어로 짧고 명확하게 응대.
CURRENT-WORK.md: accounting-service 전체 테스트 ... 300초대 timeout — 권위는 CI
CURRENT-WORK.md: 증상 0 ≠ 규칙 정확 — 경계 행·전표·발화가 0건이라 안 보이는 것과 규칙이 맞는 것은 다르다.
```

판정: 이번 라운드는 선택 테스트의 fresh 실행과 실측 모집단을 분리해 기록한다. 전체 suite가 timeout이면 GREEN으로 포장하지 않는다.

## ① 실 데이터에서 판정이 바뀌는 건수

### ①-1. R16 전·후 계수에 사용할 production 판정 경계 고정

실행 명령 원문:

```powershell
rg -n -A 240 -B 60 "revalidateProductLines|matchingSourceRoutes|RouteEvaluation|AxisKey|combine|findFocusRoute" services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/MonthEndCloseService.java
$lines = Get-Content -LiteralPath 'services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/MonthEndCloseService.java' -Encoding UTF8
for ($i=475; $i -le 669; $i++) { '{0,4}: {1}' -f ($i+1), $lines[$i] }
```

출력 원문(핵심):

```text
500: List<LegacyVerificationChain.RoutedRow> focusRoutes = findFocusRoutes(routedRows, setPool, axisKey);
507: List<LegacyVerificationChain.RoutedRow> routesToEvaluate = focusRoutes.isEmpty()
508:         ? List.of(syntheticRoute) : focusRoutes;
509-516: routesToEvaluate.stream().map(route -> evaluateRoute(..., !focusRoutes.isEmpty())).toList();
517: DiscountRevalidator.Revalidation revalidation = aggregateRouteRevalidations(routeEvaluations);
644-655: findFocusRoutes는 setPool의 모든 인덱스를 순회해 sameAxis인 routedRows를 모두 반환한다.
658-663: sameAxis = partnerCode + itemName(label) + modelToken + axis + actualUnitPrice 일치.
708-735: aggregateRouteRevalidations = false가 있으면 false, 없고 null이 있으면 null, 그 외 true.
```

판정:

- R16 후 판정은 같은 `AxisKey(partnerCode,label,modelToken,axis,actualUnitPrice)`의 모든 원천 route를 결합한다.
- R16 전 판정은 R15/R16 RED 원문대로 같은 후보 중 첫 route 하나만 평가했다. 따라서 동일 실제 입력에 대해 `첫 route 결과`와 `전체 route false 우선 결과`를 산출하면 전·후 변경 건수를 셀 수 있다.
- `scopeKey`·`sourceKey`·route `zone`은 같은 축 조건에 없다. 이것이 ②에서 검증할 결합 경계다.

### ①-2. read-only 실 DB 조회 대상 확인

실행 명령 원문:

```powershell
docker ps --format "{{.Names}}|{{.Image}}|{{.Status}}"
```

출력 원문(관련 컨테이너):

```text
samhan-accounting-service|infrastructure-accounting-service|Up About an hour (healthy)
samhan-slip-service|infrastructure-slip-service|Up About an hour (healthy)
samhan-product-service|infrastructure-product-service|Up 3 hours (healthy)
samhan-postgres|postgres:16-alpine|Up 3 hours (healthy)
```

판정: 공유 서비스 컨테이너는 다른 PR 배포본이므로 호출하지 않는다. `samhan-postgres`에는 `BEGIN TRANSACTION READ ONLY` SQL만 실행하며 어떤 컨테이너도 재기동하지 않는다.

### ①-3. 사슬 입력 snapshot 보유 테이블 확인

실행 명령 원문:

```powershell
docker exec samhan-postgres psql -U samhan -d accounting_db -v ON_ERROR_STOP=1 -c "BEGIN TRANSACTION READ ONLY; SELECT table_name, string_agg(column_name, ',' ORDER BY ordinal_position) AS relevant_columns FROM information_schema.columns WHERE table_schema='public' AND column_name IN ('model_name','category_key','line_no','slip_id','tax_invoice_id','created_at','is_deleted') GROUP BY table_name HAVING bool_or(column_name='model_name') ORDER BY table_name; COMMIT;"
```

출력 원문:

```text
BEGIN
            table_name             |                           relevant_columns
-----------------------------------+----------------------------------------------------------------------
 sales_accounting_slip_allocations | created_at,is_deleted,model_name,category_key
 sales_accounting_slip_lines       | slip_id,line_no,created_at,is_deleted,model_name,category_key
 tax_invoice_lines                 | tax_invoice_id,line_no,created_at,is_deleted,model_name,category_key
(3 rows)
COMMIT
```

판정: 실제 사슬 발화 후보는 매출전표 line snapshot, allocation snapshot, 세금계산서 line snapshot 세 모집단이다. 각 모집단에서 비어 있지 않은 `model_name/category_key` 행을 직접 계수한다.

### ①-4. 공유 실 DB 사슬 발화 모집단 계수

실행 명령 원문:

```powershell
docker exec samhan-postgres psql -U samhan -d accounting_db -v ON_ERROR_STOP=1 -c "BEGIN TRANSACTION READ ONLY; SELECT 'sales_lines' AS source, COUNT(*) AS rows, COUNT(*) FILTER (WHERE NULLIF(btrim(model_name),'') IS NOT NULL) AS model_rows, COUNT(*) FILTER (WHERE NULLIF(btrim(category_key),'') IS NOT NULL) AS category_rows, COUNT(*) FILTER (WHERE NULLIF(btrim(model_name),'') IS NOT NULL AND NULLIF(btrim(category_key),'') IS NOT NULL) AS both_rows, MIN(created_at) AS min_created, MAX(created_at) AS max_created FROM sales_accounting_slip_lines WHERE is_deleted=false UNION ALL SELECT 'sales_allocations', COUNT(*), COUNT(*) FILTER (WHERE NULLIF(btrim(model_name),'') IS NOT NULL), COUNT(*) FILTER (WHERE NULLIF(btrim(category_key),'') IS NOT NULL), COUNT(*) FILTER (WHERE NULLIF(btrim(model_name),'') IS NOT NULL AND NULLIF(btrim(category_key),'') IS NOT NULL), MIN(created_at), MAX(created_at) FROM sales_accounting_slip_allocations WHERE is_deleted=false UNION ALL SELECT 'tax_invoice_lines', COUNT(*), COUNT(*) FILTER (WHERE NULLIF(btrim(model_name),'') IS NOT NULL), COUNT(*) FILTER (WHERE NULLIF(btrim(category_key),'') IS NOT NULL), COUNT(*) FILTER (WHERE NULLIF(btrim(model_name),'') IS NOT NULL AND NULLIF(btrim(category_key),'') IS NOT NULL), MIN(created_at), MAX(created_at) FROM tax_invoice_lines WHERE is_deleted=false; COMMIT;"
```

출력 원문:

```text
BEGIN
      source       | rows  | model_rows | category_rows | both_rows |        min_created         |        max_created
-------------------+-------+------------+---------------+-----------+----------------------------+----------------------------
 sales_lines       | 10290 |          0 |             0 |         0 | 2026-05-22 07:51:58.480793 | 2026-05-22 07:52:56.471825
 sales_allocations |     0 |          0 |             0 |         0 |                            |
 tax_invoice_lines |    15 |          0 |             0 |         0 | 2026-04-28 10:00:00        | 2026-07-27 16:15:36.147209
(3 rows)
COMMIT
```

판정:

- 현재 공유 실 DB에는 `model_name`이 채워진 거래 snapshot이 **0행**이다. 매출전표 10,290행, allocation 0행, 세금계산서 15행 모두 사슬 발화 모집단이 아니다.
- 따라서 이 DB에서는 R16 전 `확인` → R16 후 `불일치` 변경 집계행을 실행 계수할 수 없고, 관측 가능한 변경 건수는 **0건(사슬 도달 0)**이다. 이는 “정상 0건”이 아니라 “발화 모집단 0건”이다.
- repository에 별도 실제 거래 snapshot이 있는지 이어서 확인한다.

### ①-5. repository 실제 거래 snapshot 후보 확인

실행 명령 원문:

```powershell
$paths = Get-ChildItem -LiteralPath 'docs/dev-reports/1008-r9-snapshot','services/accounting-service/src/test/resources/fixtures' -File -Recurse
foreach ($f in $paths) { "FILE=$($f.FullName)|BYTES=$($f.Length)"; if ($f.Extension -in @('.csv','.json')) { Get-Content -LiteralPath $f.FullName -Encoding UTF8 -TotalCount 2 } }
Get-Content -LiteralPath 'docs/dev-reports/1008-r9-snapshot/metadata.json' -Raw -Encoding UTF8
rg -l -i "model_name|category_key" docs/dev-reports/1008-r9-snapshot services/accounting-service/src/test/resources -g '*.csv' -g '*.json' -g '*.sql'
```

출력 원문(핵심):

```text
1008-r9-snapshot/metadata.json:
  "sheet": "싱글 구성품",
  "range": "A1:N1737",
  "format": "raw GViz CSV response; no value or row transformation",
  "dataRows": 1735,
  "measured": { "indoorRows": 271, "outdoorRows": 271, "outdoorLinkMismatches": 0 }
single-components-A1-N1737.csv header:
  "... 품명","평형","모델명","구분","단위","출고가",...,"납품가",...,"세트","구성품 특징"
services/accounting-service/src/test/resources/fixtures/mig4-sales-slip-line.csv header:
  "일자-No.","거래처코드","거래처명","품목명[규격]","수량","단가","공급가액","부가세",...
NO_TEXT_TRANSACTION_SNAPSHOT_WITH_MODEL_CATEGORY
```

판정:

- R9 snapshot은 실 원본 **구성품·가격표**이며 거래의 `partnerCode/scope/sourceKey/line_no/category_key`를 가진 사슬 입력 snapshot이 아니다.
- accounting fixture는 작은 이관 테스트 입력이며 `model_name/category_key` 보존 거래 snapshot이 아니다.
- 이 워크트리와 공유 실 DB에서 사슬이 실제 발화하는 실거래 모집단은 **발견되지 않았다**. 따라서 ①의 실데이터 전·후 변경 계수는 **발화 모집단 0집계행 / 확인→불일치 0집계행**으로 끝내되, R16 synthetic 재현 1건을 실데이터 건수로 확대하지 않는다.

## ② 결합 경계가 맞는가

### ②-1. scope별 route 판정과 집계 단위 원문 대조

실행 명령 원문:

```powershell
Get-Content services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/LegacyVerificationChain.java -Encoding UTF8
Get-Content docs/dev-reports/2026-08-03-874-r15-reconvergence.md -Encoding UTF8 # lines 816-877
rg -n -A 140 -B 40 "dailyDetailDoesNotHideLaterAccessoryFailureBehindFirstRoute|모든 원천 route|allTrue|순서와 무관|보수" services/accounting-service/src/test/java/com/samhanair/logis/accounting/service/DailyClosingDetailServiceTest.java
```

출력 원문(핵심):

```text
LegacyVerificationChain.java:68-89: zone은 partnerCode+scopeKey별로 독립 초기화·전이.
LegacyVerificationChain.java:147-165: SINGLE_ACCESSORY는 각 focusRow의 sameScope 행만으로 hasSingleMain/hasFailedMain을 계산.
R15:843-846:
legacy D-M=MULTI_RATE/true
legacy D-S=SINGLE_ACCESSORY/false
current multi-first=...final=true
current single-first=...final=false
R15:851-856: 동일 거래처·품명·token·실제단가인 두 scope가 화면 1행으로 집계되며 원천 2전표/4행의 사용자 표시 1행이 true↔false였다.
MonthEndCloseService.java:207-248: 해당 날짜의 issued 세금계산서 전체를 순회해 하나의 byModel에 누적.
MonthEndCloseService.java:261-293: 해당 날짜의 POSTED 매출전표 전체를 순회해 하나의 byModel에 누적.
```

판정:

- **서로 다른 scope·전표의 행이 한 집계행으로 결합되는 입력은 존재한다.** R15가 이미 production chain으로 고정한 D-M/D-S 2전표 입력이며, 현재 `AxisKey`와 `sameAxis` 조건을 모두 만족한다.
- 다만 사용자에게 보이는 행 자체가 날짜·거래처·품명·token·카테고리·실제단가별 합계다. 두 원천 중 D-S가 실제 `SINGLE_ACCESSORY/false`이면 이 합계행을 `false`로 표시하는 것은 “다른 집계행의 false 유입”이 아니라 **그 합계행에 포함된 불일치 1건의 노출**이다.
- scope는 route의 zone/branch 계산에는 보존되고, 집계행 분리키에는 의도적으로 없다. 현재까지 `false` 우선 자체가 확인이어야 할 행을 불일치로 만드는 증거는 없다.

### ②-2. production compiled class 프로브 준비 상태

실행 명령 원문:

```powershell
Test-Path services/accounting-service/build/classes/java/main/com/samhanair/logis/accounting/service/LegacyVerificationChain.class
Test-Path services/accounting-service/build/classes/java/main/com/samhanair/logis/accounting/service/MonthEndCloseService.class
Test-Path services/accounting-service/build/classes/java/main/com/samhanair/logis/accounting/service/DiscountRevalidator.class
java -version
jshell --version
```

출력 원문:

```text
LegacyVerificationChain.class FOUND 13120 bytes UTC=2026-08-03T02:25:26.7127263Z
MonthEndCloseService.class FOUND 72432 bytes UTC=2026-08-03T02:25:26.6356944Z
DiscountRevalidator.class FOUND 11670 bytes UTC=2026-08-03T02:25:26.6633487Z
openjdk version "17.0.19" 2026-04-21
jshell 17.0.19
```

판정: 현재 production compiled class를 파일 수정 없이 reflection으로 직접 실행할 수 있다. 다음 확인에서 cross-scope 입력을 R16 후 결합까지 실행한다.

### ②-3. 서로 다른 두 전표 scope의 동일 집계행 production 실행

실행 명령 원문:

```powershell
# 파일 생성 없이 PowerShell here-string을 jshell stdin으로 전달.
# production compiled class의 LegacyVerificationChain.route/branch/riUsageDecision,
# DiscountRevalidator.revalidateByLegacyBranch,
# MonthEndCloseService.aggregateRouteRevalidations를 reflection 호출.
# 입력: P1 거래처의 D-M(COMM_MULTI) panel과 D-S(SINGLE) panel.
# 이 초기 실행은 명령 본문을 축약 기록했으므로 최종 판정 증거에서 제외했다.
# 같은 경계의 full-command 재실행은 보고서 말미 "원문 보충 A"와 ④ 결함의 "원문 보충 D" 참조.
```

프로브 입력 원문:

```text
D-M#1 멀티본체 AM1234X/MATERIAL → D-M#2 PANEL PC1BWCK3NW/PANEL
D-S#1 싱글본체 AC023CN1DBC1/INDOOR → D-S#2 PANEL PC1BWCK3NW/PANEL
partner=P1, panel itemName=PANEL, unit=52,000, release=100,000, delivery=70,000,
COMM 전역DC=48%, 네 source usage=total 1/used 0
```

출력 원문:

```text
D-M=MULTI_RATE/zone=COMM_MULTI/ri=null/final=true
D-S=SINGLE_ACCESSORY/zone=SINGLE/ri=false/final=false
R16 multi-first aggregate=false
R16 single-first aggregate=false
R16-before multi-first=true; single-first=false
```

판정:

- 서로 다른 scope·전표의 동일 축 route가 실제로 함께 결합된다. R16 후에는 순서와 무관하게 `false`다.
- 이 입력에서 `false`는 다른 scope 때문에 새로 만들어진 값이 아니다. D-S route 자체가 production chain에서 `SINGLE_ACCESSORY/false`이고, 합계행은 D-M과 D-S panel 수량·금액을 함께 표시한다. 그러므로 집계 `false`는 실제 포함 원천의 불일치를 보존한 값이다.
- 이 cross-scope 입력의 R16 전 `true → false` 변경은 **1집계행**이지만, R16의 “값 변경 1건” 표에 든 단일전표 입력과 같은 결함 구조를 두 전표로 표현한 synthetic 대조다. 실데이터 영향 건수에 더하지 않는다.
- ② 결론: matching 조건은 scope보다 넓지만 **표시 집계키와 정확히 같다**. 현재 각도에서 확인이어야 할 별도 집계행으로 `false`가 새어 들어가는 재현은 없다.

### ②-4. `sameAxis` 양·음 경계 production 실행

실행 명령 원문:

```powershell
# production compiled MonthEndCloseService.AxisKey/SetPoolLine/sameAxis를 reflection 호출.
# 이 초기 축약 기록은 보고서 말미 "원문 보충 A — ② sameAxis 결합 경계"의 full command로 대체했다.
```

출력 원문:

```text
same axis, different scope/source=true
different partner=false
different label=false
different token=false
different category axis=false
different actual unit price=false
```

판정: scope/source만 다르면 의도대로 한 표시 집계행에 포함된다. 거래처·품명·modelToken·category axis·실제 VAT 포함 단가 중 하나라도 다르면 결합되지 않는다. `false`가 별도 사용자 집계행으로 넘어가는 경계 누출은 재현되지 않았다.

## ③ 순서 무관성이 실제로 성립하는가

### ③-1. 세 번째 이상 순서·패널 3개 production 실행

실행 명령 원문:

```powershell
# 파일 생성 없이 production compiled class를 reflection 호출.
# 각 입력은 LegacyVerificationChain.route/branch/riUsageDecision 및 실제
# DiscountRevalidator.revalidateByLegacyBranch를 거친 뒤,
# MonthEndCloseService.aggregateRouteRevalidations에 정방향/역방향으로 전달했다.
# 이 초기 축약 기록은 보고서 말미 "원문 보충 B — ③ 세 번째 순서·패널 3개"의 full command로 대체했다.
```

출력 원문:

```text
P-M-P panel1=DEFAULT/zone=UNKNOWN/base=true/ri=null/final=true
P-M-P panel2=SINGLE_ACCESSORY/zone=SINGLE/base=true/ri=false/final=false
P-M-P aggregate forward=false reverse=false
M-P-P panel1=SINGLE_ACCESSORY/zone=SINGLE/base=true/ri=false/final=false
M-P-P panel2=SINGLE_ACCESSORY/zone=SINGLE/base=true/ri=false/final=false
M-P-P aggregate forward=false reverse=false
M-P-M panel1=SINGLE_ACCESSORY/zone=SINGLE/base=true/ri=false/final=false
M-P-M aggregate forward=false reverse=false
P-M-P-P panel1=DEFAULT/zone=UNKNOWN/base=true/ri=null/final=true
P-M-P-P panel2=SINGLE_ACCESSORY/zone=SINGLE/base=true/ri=false/final=false
P-M-P-P panel3=SINGLE_ACCESSORY/zone=SINGLE/base=true/ri=false/final=false
P-M-P-P aggregate forward=false reverse=false
P-P-M panel1=DEFAULT/zone=UNKNOWN/base=true/ri=null/final=true
P-P-M panel2=DEFAULT/zone=UNKNOWN/base=true/ri=null/final=true
P-P-M aggregate forward=true reverse=true
```

판정:

- 요청된 세 번째 조합 `본체→패널→본체(M-P-M)`은 `false`, 패널 3개가 포함된 `P-M-P-P`도 `false`이며, 평가 목록을 뒤집어도 동일했다.
- `P-P-M`은 `true`다. 이것은 결합 순서 의존이 아니다. 두 panel 모두 레거시 `line_no`상 본체보다 앞이어서 각각 `DEFAULT/true`이고, 결합할 false가 없다. 개발책임자 결정대로 원천 행 순서가 legacy zone을 결정한다.
- 정확한 결론은 **고정된 원천 `line_no`로 산출된 route 결과 집합의 결합은 순서와 무관하다**이다. 원천 line 순서를 바꿔 branch 자체가 달라지는 경우까지 결과가 같다는 뜻은 아니다.
- 확인이어야 할 all-true 집합(`P-P-M`)이 false 우선 때문에 불일치로 바뀌지 않았다. ③에서 실 사용자 결함은 재현되지 않았다.

## ④ R16이 “아니오”로 분류한 6곳 재검토

### ④-1a. `LegacySetMatcher.findUnusedByToken` 첫 reflection 시도 실패

실행 명령 원문:

```powershell
# LegacySetMatcher/InvoiceLine/SetCandidate를 reflection으로 생성해 중복 OUTDOOR 순서를 뒤집는 probe
# 이 실패 실행은 판정 증거에서 제외했다. 성공 재실행 full command는 보고서 말미 "원문 보충 C" 참조.
```

출력 원문:

```text
Exception java.lang.IllegalAccessException: ... cannot access a member of class LegacySetMatcher
Exception java.lang.IllegalArgumentException: wrong number of arguments
```

판정: package-private matcher 생성자의 `setAccessible(true)` 누락과 `InvoiceLine` 다중 생성자 중 잘못된 생성자 선택에 따른 조사 도구 실패다. 판정 증거로 사용하지 않고, 매개변수 개수로 생성자를 고정해 재실행한다.

### ④-1b. `LegacySetMatcher.findUnusedByToken` 순서 의존 재현·분류

실행 명령 원문:

```powershell
# 같은 scope에서 INDOOR 100, 같은 token OUTDOOR 200/300 순서를 뒤집고,
# 기대 구성 INDOOR 100 + OUTDOOR 200인 production matcher를 reflection 호출.
# 성공 재실행 full command는 보고서 말미 "원문 보충 C — ④ findUnusedByToken"에 기록했다.
$lines = Get-Content 'tools/legacy-gas/일마감 프로그램/Code.js' -Encoding UTF8
# lines 568-665 확인
```

출력 원문:

```text
I,O200,O300 matches=1 usage={S1#1=Usage[total=1, used=1], S1#2=Usage[total=1, used=1], S1#3=Usage[total=1, used=0]}
I,O300,O200 matches=0 usage={S1#1=Usage[total=1, used=0], S1#3=Usage[total=1, used=0], S1#2=Usage[total=1, used=0]}

legacy Code.js:597: pool.findIndex(... OUTDOOR && token === reqOut.token)
legacy Code.js:611: pool.findIndex(... !used && token === rc.token ...)
legacy Code.js:654-656: 첫 선택 조합의 invoice sum이 기대합과 같을 때만 used=true
```

판정:

- R16이 적은 대로 `findUnusedByToken`은 **실제로 순서 의존**한다. 중복 token의 첫 원천 단가가 다르면 소비 결과가 달라진다.
- 그러나 이것은 현대 코드가 새로 만든 대표화가 아니다. 레거시도 전표 group 안에서 원본 행 순서의 첫 미사용 token을 `findIndex`로 소비한다. 현대 코드는 같은 `scopeKey` 제약을 추가한 채 그 순서를 계승한다.
- 개발책임자 결정인 `line_no` 레거시 순서 계승과 일치하므로, 이 순서 의존만으로 “확인이 불일치로 바뀌는 R16 결함”으로 분류할 수 없다. R16의 **이번 결함 계열 아님** 분류는 옳다.
### ④-2a. 실제 구성품 카탈로그가 만드는 `setName`/token 중복 경계 확인

실행 명령 원문:

```powershell
rg -n -A 120 -B 35 '@GetMapping\("/components"|components\(' services/product-service/src/main/java/com/samhanair/logis/product/web/EstimateCatalogInternalController.java
```

출력 원문(핵심 부분):

```text
293-    @GetMapping("/components")
295:    public ApiResponse<List<ComponentRow>> components(@RequestParam("category") EstimateCategory category) {
296-        ProductCategory parentCategory = switch (category) {
297-            case SINGLE_SET -> ProductCategory.SINGLE_SET;
298-            case COMMERCIAL_MULTI -> ProductCategory.COMMERCIAL_MULTI;
302-        List<Product> parents = productRepository
303-                .findByProductCategoryAndIsDeletedFalse(parentCategory);
304-        Map<UUID, String> parentCodeById = parents.stream()
305-                .filter(p -> p.getModelCode() != null)
306-                .collect(Collectors.toMap(Product::getId, Product::getModelCode));
308-        List<BundleComponent> components = bundleComponentRepository
309-                .findByBundleProductIdIn(parentCodeById.keySet());
335-        List<ComponentRow> rows = components.stream()
338-                    return new ComponentRow(
339-                            parentCodeById.get(c.getBundleProductId()),
340-                            c.getComponentProductCode(),
345-                            c.getComponentKind() == null ? null : c.getComponentKind().name(),
```

판정: 런타임 구성품 목록의 부모명은 활성 `SINGLE_SET`/`COMMERCIAL_MULTI` 상품의 `modelCode`, 자식 token은 `bundle_component.component_product_code`이다. 따라서 다음 실 DB 조회는 서비스가 실제로 반환할 수 있는 부모-자식 중복을 같은 조건으로 재현해야 한다.

실행 명령 원문:

```powershell
docker exec samhan-postgres psql -U samhan -d product_db -v ON_ERROR_STOP=1 -c "BEGIN TRANSACTION READ ONLY; SELECT COUNT(*) AS active_parent_components FROM bundle_component bc JOIN products parent ON parent.id=bc.bundle_product_id WHERE COALESCE(bc.is_deleted,false)=false AND COALESCE(parent.is_deleted,false)=false AND parent.product_category IN ('SINGLE_SET','COMMERCIAL_MULTI'); COMMIT;"
```

출력 원문:

```text
BEGIN
 active_parent_components
--------------------------
                     1584
(1 row)
COMMIT
```

판정: 서비스 반환 조건에 대응하는 활성 부모-구성품 관계는 1,584건이다. 이 모집단에서 같은 구성품 token을 공유하는 서로 다른 부모 및 서로 다른 할인 selector가 실제로 존재하는지 계수한다.

실행 명령 원문:

```powershell
rg -n -A 90 -B 20 'resolveMatchedSetNames|kindByToken' services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/MonthEndCloseService.java
rg -n -A 90 -B 20 'record GlobalDiscount|optionDiscountFor' services/accounting-service/src/main/java
```

출력 원문(판정에 필요한 부분):

```text
498- String optionToken = setResolution.parentSetNames().getOrDefault(
499-         new ParentModelKey(axisKey.partnerCode(), modelToken), modelToken);
609- Map<ParentModelKey, String> result = new LinkedHashMap<>();
610- for (LegacySetMatcher.Match match : matching.matches()) {
611-     for (Integer index : match.poolIndexes()) {
612-         LegacySetMatcher.InvoiceLine line = pool.get(index);
613-         result.putIfAbsent(new ParentModelKey(line.partnerCode(), line.modelToken()), match.setName());
619- private static Map<String, String> kindByToken(List<EstimateComponent> catalog) {
620-     return catalog.stream().collect(java.util.stream.Collectors.toMap(
621-             EstimateComponent::componentModelCode,
623-             (left, right) -> left));

385- private BigDecimal optionDiscountFor(String modelToken) {
390-     if (code.startsWith("AC") && code.length() >= 9) {
391-         if (code.charAt(7) == '6' && code.charAt(8) == 'P') return discount360Amount;
392-         if (code.charAt(7) == '4' && (code.charAt(8) == 'P' || code.charAt(8) == 'D')) return discount4WayAmount;
395-         if (code.charAt(7) == '1' && (code.charAt(8) == 'P' || code.charAt(8) == 'D')) return discount1WayAmount;
398-         if (code.charAt(8) == 'F') return discountFirstGradeAmount;
400-     if (code.startsWith("AP")) {
404-         return discountStandAmount;
407-         return discountDeluxeAmount;
409-         if (code.length() >= 9 && code.charAt(8) == 'F') return discountFirstGradeAmount;
```

판정: `resolveMatchedSetNames`의 대표키는 `partnerCode + component modelToken`뿐이고 `putIfAbsent`라서, 한 거래처의 같은 구성품 token이 서로 다른 완성 세트에 들어가면 먼저 매치된 부모 세트명 하나가 모든 해당 집계행의 옵션 DC selector가 된다. 이는 실제 카탈로그에 서로 다른 selector 부모가 같은 token을 공유할 때만 사용자 결함으로 발화하므로 그 교집합을 다음 SQL로 직접 센다. `kindByToken`도 같은 token의 최초 kind를 고르므로 함께 실제 충돌 수를 센다.

실행 명령 원문(가독성을 위해 본문 SQL은 한 줄로 실행함):

```powershell
docker exec samhan-postgres psql -U samhan -d product_db -v ON_ERROR_STOP=1 -c "BEGIN TRANSACTION READ ONLY; WITH rel AS (SELECT bc.component_product_code AS token, bc.component_kind::text AS kind, parent.model_code AS parent_code, CASE WHEN upper(parent.model_code) ~ '^(AR|AF).*S$' THEN 'NONE' WHEN upper(parent.model_code) LIKE 'AC%' AND length(parent.model_code)>=9 AND substring(upper(parent.model_code) from 8 for 1)='6' AND substring(upper(parent.model_code) from 9 for 1)='P' THEN '360' WHEN upper(parent.model_code) LIKE 'AC%' AND length(parent.model_code)>=9 AND substring(upper(parent.model_code) from 8 for 1)='4' AND substring(upper(parent.model_code) from 9 for 1) IN ('P','D') THEN '4WAY' WHEN upper(parent.model_code) LIKE 'AC%' AND length(parent.model_code)>=9 AND substring(upper(parent.model_code) from 8 for 1)='1' AND substring(upper(parent.model_code) from 9 for 1) IN ('P','D') THEN '1WAY' WHEN upper(parent.model_code) LIKE 'AC%' AND length(parent.model_code)>=9 AND substring(upper(parent.model_code) from 9 for 1)='F' THEN 'FIRST' WHEN upper(parent.model_code) LIKE 'AP%' AND (upper(parent.model_code) LIKE 'AP230%' OR upper(parent.model_code) LIKE 'AP290%' OR length(parent.model_code)>=9 AND substring(upper(parent.model_code) from 9 for 1)='P' OR length(parent.model_code)>=11 AND substring(upper(parent.model_code) from 9 for 1)='D' AND substring(upper(parent.model_code) from 11 for 1)='C') THEN 'STAND' WHEN upper(parent.model_code) LIKE 'AP%' AND length(parent.model_code)>=11 AND substring(upper(parent.model_code) from 9 for 1)='D' AND substring(upper(parent.model_code) from 11 for 1)='H' THEN 'DELUXE' WHEN upper(parent.model_code) LIKE 'AP%' AND length(parent.model_code)>=9 AND substring(upper(parent.model_code) from 9 for 1)='F' THEN 'FIRST' ELSE 'NONE' END AS selector FROM bundle_component bc JOIN products parent ON parent.id=bc.bundle_product_id WHERE COALESCE(bc.is_deleted,false)=false AND COALESCE(parent.is_deleted,false)=false AND parent.product_category IN ('SINGLE_SET','COMMERCIAL_MULTI') AND parent.model_code IS NOT NULL AND bc.component_product_code IS NOT NULL), stats AS (SELECT token, count(DISTINCT parent_code) parents, count(DISTINCT selector) selectors, count(DISTINCT kind) kinds FROM rel GROUP BY token) SELECT count(*) AS tokens, count(*) FILTER (WHERE parents>1) AS multi_parent_tokens, count(*) FILTER (WHERE selectors>1) AS conflicting_selector_tokens, count(*) FILTER (WHERE kinds>1) AS conflicting_kind_tokens, max(parents) AS max_parents FROM stats; WITH rel AS (SELECT bc.component_product_code AS token, bc.component_kind::text AS kind, parent.model_code AS parent_code, CASE WHEN upper(parent.model_code) ~ '^(AR|AF).*S$' THEN 'NONE' WHEN upper(parent.model_code) LIKE 'AC%' AND length(parent.model_code)>=9 AND substring(upper(parent.model_code) from 8 for 1)='6' AND substring(upper(parent.model_code) from 9 for 1)='P' THEN '360' WHEN upper(parent.model_code) LIKE 'AC%' AND length(parent.model_code)>=9 AND substring(upper(parent.model_code) from 8 for 1)='4' AND substring(upper(parent.model_code) from 9 for 1) IN ('P','D') THEN '4WAY' WHEN upper(parent.model_code) LIKE 'AC%' AND length(parent.model_code)>=9 AND substring(upper(parent.model_code) from 8 for 1)='1' AND substring(upper(parent.model_code) from 9 for 1) IN ('P','D') THEN '1WAY' WHEN upper(parent.model_code) LIKE 'AC%' AND length(parent.model_code)>=9 AND substring(upper(parent.model_code) from 9 for 1)='F' THEN 'FIRST' WHEN upper(parent.model_code) LIKE 'AP%' AND (upper(parent.model_code) LIKE 'AP230%' OR upper(parent.model_code) LIKE 'AP290%' OR length(parent.model_code)>=9 AND substring(upper(parent.model_code) from 9 for 1)='P' OR length(parent.model_code)>=11 AND substring(upper(parent.model_code) from 9 for 1)='D' AND substring(upper(parent.model_code) from 11 for 1)='C') THEN 'STAND' WHEN upper(parent.model_code) LIKE 'AP%' AND length(parent.model_code)>=11 AND substring(upper(parent.model_code) from 9 for 1)='D' AND substring(upper(parent.model_code) from 11 for 1)='H' THEN 'DELUXE' WHEN upper(parent.model_code) LIKE 'AP%' AND length(parent.model_code)>=9 AND substring(upper(parent.model_code) from 9 for 1)='F' THEN 'FIRST' ELSE 'NONE' END AS selector FROM bundle_component bc JOIN products parent ON parent.id=bc.bundle_product_id WHERE COALESCE(bc.is_deleted,false)=false AND COALESCE(parent.is_deleted,false)=false AND parent.product_category IN ('SINGLE_SET','COMMERCIAL_MULTI') AND parent.model_code IS NOT NULL AND bc.component_product_code IS NOT NULL) SELECT token, string_agg(DISTINCT parent_code || ':' || selector, ', ' ORDER BY parent_code || ':' || selector) AS parents_selectors, string_agg(DISTINCT kind, ',' ORDER BY kind) AS kinds FROM rel GROUP BY token HAVING count(DISTINCT selector)>1 OR count(DISTINCT kind)>1 ORDER BY token LIMIT 20; COMMIT;"
```

실제 실행한 `CASE`는 `DiscountRevalidator.GlobalDiscount.optionDiscountFor`의 `AR/AF S`, `AC` 360·4WAY·1WAY·FIRST, `AP` STAND·DELUXE·FIRST 문자 위치 규칙을 그대로 SQL `substring`으로 옮겼다.

출력 원문:

```text
BEGIN
 tokens | multi_parent_tokens | conflicting_selector_tokens | conflicting_kind_tokens | max_parents
--------+---------------------+-----------------------------+-------------------------+-------------
    400 |                 202 |                          31 |                       0 |          84
(1 row)

    token     | parents_selectors                                                        | kinds
--------------+--------------------------------------------------------------------------+---------
 AC060BXAPBH3 | AC060BS4PBH7SY:4WAY, AP060BAPPBH2S:STAND                                 | OUTDOOR
 AC060CXAPBH1 | AC060CS4PBH2SY:4WAY, AC060CS6PBH1SY:360, AP060CAPPBH1S:STAND             | OUTDOOR
 AC072BXAPBH5 | AC072BS4PBH7SY:4WAY, AC072BSCPBH2SY:NONE, AP072BAPPBH2S:STAND            | OUTDOOR
 AC090CXAPBH1 | AC090CS4PBH2SY:4WAY, AC090CS6PBH1SY:360                                  | OUTDOOR
 AC145BXADHH1 | AC145CAMDHH1SY:NONE, AP145BAPDHH2S:DELUXE                                | OUTDOOR
 ... (20 rows returned)
(20 rows)
COMMIT
```

판정:

- 활성 구성품 token 400개 중 202개가 여러 부모에 속하고, **31개는 부모에 따라 옵션 DC selector가 다르다.** 따라서 `resolveMatchedSetNames`의 최초 부모 대표 선택은 실 카탈로그에서 발화 가능한 조건이다.
- 반면 동일 token의 `component_kind` 충돌은 **0개**다. 현재 실 카탈로그 기준 `kindByToken`의 최초값 선택은 값을 바꾸지 않는다.
- 아직 거래 snapshot 발화가 0이므로 31개는 영향받을 수 있는 카탈로그 token 수이지 실제 당일 오판 집계행 수가 아니다. 다음 단계에서 두 완성 세트가 같은 날 잡힐 때 최초 부모가 실제 `확인→불일치`를 만드는지 production 클래스 실행으로 확인한다.

실제 카탈로그 예시의 구성품을 확인한 명령 원문:

```powershell
docker exec samhan-postgres psql -U samhan -d product_db -v ON_ERROR_STOP=1 -c "BEGIN TRANSACTION READ ONLY; SELECT parent.model_code AS set_code, bc.display_order, bc.component_product_code AS component_code, bc.component_kind, cp.delivery_price, cp.release_price FROM bundle_component bc JOIN products parent ON parent.id=bc.bundle_product_id LEFT JOIN products cp ON cp.model_code=bc.component_product_code AND COALESCE(cp.is_deleted,false)=false WHERE COALESCE(bc.is_deleted,false)=false AND COALESCE(parent.is_deleted,false)=false AND parent.model_code IN ('AC060BS4PBH7SY','AP060BAPPBH2S') ORDER BY parent.model_code, bc.display_order, bc.component_product_code; COMMIT;"
```

출력 원문:

```text
BEGIN
    set_code    | component_code | component_kind | delivery_price | release_price
----------------+----------------+----------------+----------------+---------------
 AC060BS4PBH7SY | AC060BN4PBH1   | INDOOR         |           0.00 |     511500.00
 AC060BS4PBH7SY | AC060BXAPBH3   | OUTDOOR        |           0.00 |    1277100.00
 ...
 AP060BAPPBH2S  | AC060BXAPBH3   | OUTDOOR        |           0.00 |    1277100.00
 AP060BAPPBH2S  | AP060RNPPBH1   | INDOOR         |           0.00 |     726000.00
 AP060BAPPBH2S  | FPH-1412XS3    | MATERIAL       |      130000.00 |     169000.00
(12 rows)
COMMIT
```

판정: `AC060BXAPBH3`는 실제 활성 4WAY 세트와 STAND 세트가 공유하는 `OUTDOOR` token이다. 다음 프로브는 이 실 코드/실 출고가를 사용하고, selector 차이를 눈에 보이게 하는 서로 다른 정액(4WAY 20,000원, STAND 40,000원)을 production `DiscountRevalidator`와 production `riUsageDecision`에 넣는다.

실행 명령 원문:

```powershell
$probe = @'
import java.lang.reflect.*;
import java.math.*;
import java.util.*;
Class<?> drc=Class.forName("com.samhanair.logis.accounting.service.DiscountRevalidator");
Object dr=drc.getConstructor().newInstance();
Class<?> gdc=Class.forName("com.samhanair.logis.accounting.service.DiscountRevalidator$GlobalDiscount");
Method found=Arrays.stream(gdc.getDeclaredMethods()).filter(m->m.getName().equals("found")&&m.getParameterCount()==8).findFirst().orElseThrow();
Object gd=found.invoke(null,new BigDecimal("0.45"),new BigDecimal("0.45"),new BigDecimal("10000"),new BigDecimal("20000"),new BigDecimal("30000"),new BigDecimal("40000"),new BigDecimal("50000"),new BigDecimal("60000"));
Class<?> sc=Class.forName("com.samhanair.logis.accounting.client.ProductLabelMatch$Status");
Object matched=Enum.valueOf((Class)sc,"MATCHED");
Class<?> bc=Class.forName("com.samhanair.logis.accounting.service.LegacyVerificationChain$Branch");
Object main=Enum.valueOf((Class)bc,"SINGLE_MAIN");
Class<?> zc=Class.forName("com.samhanair.logis.accounting.service.LegacyVerificationChain$Zone");
Object single=Enum.valueOf((Class)zc,"SINGLE");
Method reval=Arrays.stream(drc.getDeclaredMethods()).filter(m->m.getName().equals("revalidateByLegacyBranch")&&m.getParameterCount()==10).findFirst().orElseThrow(); reval.setAccessible(true);
Object ok=reval.invoke(dr,"실외기","AP060BAPPBH2S",new BigDecimal("1237100"),new BigDecimal("1277100"),BigDecimal.ZERO,null,gd,matched,main,single);
Object bad=reval.invoke(dr,"실외기","AC060BS4PBH7SY",new BigDecimal("1237100"),new BigDecimal("1277100"),BigDecimal.ZERO,null,gd,matched,main,single);
Method verified=ok.getClass().getDeclaredMethod("verified");
Class<?> rc=Class.forName("com.samhanair.logis.accounting.service.LegacyVerificationChain$Row"); Constructor<?> rctor=rc.getDeclaredConstructors()[0]; rctor.setAccessible(true);
Object row1=rctor.newInstance("P","S1","O1","실외기","AC060BXAPBH3","OUTDOOR",false);
Object row2=rctor.newInstance("P","S2","O2","실외기","AC060BXAPBH3","OUTDOOR",false);
Class<?> rrc=Class.forName("com.samhanair.logis.accounting.service.LegacyVerificationChain$RoutedRow"); Constructor<?> rrctor=rrc.getDeclaredConstructors()[0]; rrctor.setAccessible(true);
Object rr1=rrctor.newInstance(row1,single); Object rr2=rrctor.newInstance(row2,single);
Class<?> uc=Class.forName("com.samhanair.logis.accounting.service.LegacySetMatcher$Usage"); Constructor<?> uctor=uc.getDeclaredConstructors()[0]; uctor.setAccessible(true);
Object full1=uctor.newInstance(1,1); Object full2=uctor.newInstance(1,1);
Class<?> lvc=Class.forName("com.samhanair.logis.accounting.service.LegacyVerificationChain"); Method ri=Arrays.stream(lvc.getDeclaredMethods()).filter(m->m.getName().equals("riUsageDecision")).findFirst().orElseThrow(); ri.setAccessible(true);
Object decision=ri.invoke(null,rr2,List.of(rr1,rr2),Map.of("O1",full1,"O2",full2),new BigDecimal("1237100"),new BigDecimal("1237100"));
Method withVerified=bad.getClass().getDeclaredMethod("withVerified",Boolean.class);
Object finalBad=withVerified.invoke(bad,decision);
System.out.println("correct parent AP/STAND base="+verified.invoke(ok));
System.out.println("wrong first parent AC/4WAY base="+verified.invoke(bad));
System.out.println("two completed matches riUsage="+decision);
System.out.println("production overwrite final="+verified.invoke(finalBad));
/exit
'@
$probe | jshell --class-path 'services/accounting-service/build/classes/java/main'
```

출력 원문(경고·JShell 프롬프트 제외 없이 판정 출력은 아래와 같음):

```text
ok ==> Revalidation[verified=true, ... deliveryPrice=1237100]
bad ==> Revalidation[verified=false, ... deliveryPrice=1257100]
decision ==> true
finalBad ==> Revalidation[verified=true, ... deliveryPrice=1257100]
correct parent AP/STAND base=true
wrong first parent AC/4WAY base=false
two completed matches riUsage=true
production overwrite final=true
```

판정:

- 최초 부모명은 base 가격 검증을 실제로 `true→false`로 바꿀 수 있다.
- 그러나 부모명이 생겼다는 것은 해당 구성품이 완성 세트에 소비됐다는 뜻이고, production `evaluateRoute`는 `VERIFIED` 상태에서 `riUsageDecision` 값을 `withVerified`로 최종 덮어쓴다. 두 완성 세트의 공유 본체는 모두 완전 소비되어 최종값이 다시 `true`가 된다.
- 따라서 이 대표 선택은 숫자 `deliveryPrice`에는 첫 부모 selector가 남을 수 있지만, 이번 유일 질문인 **사용자 확인 배지를 불일치로 바꾸지는 않는다.** `resolveMatchedSetNames`를 R15 branch 은폐/이번 false 결합 결함 계열에서 제외한 R16 분류는 최종 boolean에 관해서는 옳다.

### ④-3. `kindByToken` 재검토

앞의 실 DB 전수 결과가 곧 이 지점의 발화 검사다. 활성 런타임 구성품 token 400개의 `component_kind` 충돌은 **0개**였다. `toMap(..., (left,right)->left)`는 이 모집단에서 어느 token의 kind도 바꾸지 않으므로, 현재 실 사용자 경로에서 `확인→불일치`를 만들지 않는다. R16 제외 분류는 옳다.

### ④-4. `resolveProductSummaries` 재검토

실행 명령 원문:

```powershell
rg -n -A 90 -B 20 'resolveMatchedSetNames|kindByToken' services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/MonthEndCloseService.java
rg -n -A 75 -B 15 'ProductSummary lookupByModel|lookupByModel\(' services/accounting-service/src/main/java/com/samhanair/logis/accounting/client/ProductClient.java services/product-service/src/main/java/com/samhanair/logis/product
rg -n -A 45 -B 15 'lookupSummaryByModelName' services/product-service/src/main/java/com/samhanair/logis/product
docker exec samhan-postgres psql -U samhan -d product_db -v ON_ERROR_STOP=1 -c "BEGIN TRANSACTION READ ONLY; WITH dup AS (SELECT btrim(model_name) AS model_name, count(*) AS n FROM products WHERE COALESCE(is_deleted,false)=false AND NULLIF(btrim(model_name),'') IS NOT NULL GROUP BY btrim(model_name) HAVING count(*)>1) SELECT (SELECT count(*) FROM products WHERE COALESCE(is_deleted,false)=false AND NULLIF(btrim(model_name),'') IS NOT NULL) AS active_model_rows, count(*) AS duplicate_model_names, COALESCE(sum(n),0) AS rows_in_duplicates, COALESCE(max(n),0) AS max_duplicate FROM dup; COMMIT;"
```

출력 원문(핵심):

```text
562- private Map<String, ProductSummary> resolveProductSummaries(java.util.Set<AxisKey> axes) {
564-     axes.stream().map(AxisKey::modelToken).filter(java.util.Objects::nonNull).distinct()
566-             ProductSummary summary = productClient.lookupByModel(model);
568-                 result.put(model, summary);

138: public ProductSummary lookupByModel(String modelName) {
144-     .uri("/products/internal/lookup-by-model")
147-     .body(Map.of("modelName", modelName.trim()))

180: public ProductSummaryResponse lookupSummaryByModelName(String modelName) {
181-     Product product = findByModelNameOrThrow(modelName);

BEGIN
 active_model_rows | duplicate_model_names | rows_in_duplicates | max_duplicate
-------------------+-----------------------+--------------------+---------------
              3061 |                     0 |                  0 |             0
(1 row)
COMMIT
```

판정: 이 메서드는 여러 원천 route 중 하나를 고르지 않고, distinct model token마다 product-service 정확 일치 단건을 한 번 조회한다. 현재 실 DB의 활성 `model_name` 3,061행에는 중복이 0개다. 서로 다른 scope/전표가 같은 token을 쓰면 같은 product referent를 공유하는 것이므로 false가 다른 집계행에서 끌려오는 경로가 아니다. R16 제외 분류는 옳다.

### ④-5. `firstSalesSourceSlipNo` / `firstPurchaseSourceSlipNo` 재검토

실행 명령 원문:

```powershell
rg -n -A 22 -B 15 'private static String firstSalesSourceSlipNo|private static String firstPurchaseSourceSlipNo|firstSalesSourceSlipNo\(' services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/MonthEndCloseService.java
rg -n -A 25 -B 15 'sourceSlipNo|verified|DailyTaxInvoice' services/accounting-service/src/main/java/com/samhanair/logis/accounting/web/dto/DailyClosingDetailResponse.java clients/desktop/src/renderer/routes/DailyClosingPage.tsx
```

출력 원문(핵심):

```text
278- rows.add(new DailyTaxInvoice(
280-         slip.getSlipNo(),
281-         firstSalesSourceSlipNo(slip),
287- for (SalesAccountingSlipLine line : slip.getLines()) {
288-     accumulateSalesLine(byModel, setPool, slip.getPartnerCode(), slip.getSlipNo(), ...);

341: private static String firstSalesSourceSlipNo(SalesAccountingSlip slip) {
342-     return slip.getLines().stream()
343-             .flatMap(line -> line.getAllocations().stream())
344-             .map(SalesAccountingSlipAllocation::getSourceSlipNo)
346-             .findFirst()
350: private static String firstPurchaseSourceSlipNo(PurchaseAccountingSlip slip) {
351-     return slip.getLines().stream()
352-             .flatMap(line -> line.getAllocations().stream())
353-             .map(PurchaseAccountingSlipAllocation::getSourceSlipNo)
355-             .findFirst()

37: public record DailyTaxInvoice(
40:         String sourceSlipNo,
57: public record DailyProductLine(
82:         Boolean verified,

594: key: 'sourceSlipNo',
595- header: '원천전표',
597: render: (row) => row.sourceSlipNo || '-',
711: key: 'verified',
717: row.verified === true ? <Badge variant="success">확인</Badge>
719: row.verified === false ? <Badge variant="danger">불일치</Badge>
```

판정: 최초 원천전표번호는 `DailyTaxInvoice` 헤더 표의 `원천전표` 문자열 한 칸에만 들어간다. 모델 집계용 `byModel/setPool` 입력 및 `DailyProductLine.verified` 계산은 별도 loop/DTO다. 어느 번호를 먼저 표시해도 `확인→불일치`가 될 수 없으므로 R16 제외 분류는 옳다.

### ④-6a. chain 내부 `focusRows` — 1차 production probe

초기 실행 설명(최종 성공 명령 원문은 보고서 말미 `원문 보충 D`): production compiled class를 reflection으로 불러, 같은 거래처·같은 실 token `AC060BXAPBH3`이지만 서로 다른 전표 scope와 단가(1,257,100 / 1,200,000)를 가진 두 `SINGLE_MAIN` route를 만들었다. A 사용량은 `1/1`, B는 `0/1`로 두고 `riUsageDecision(A, [A])`와 `riUsageDecision(A, [A,B])`를 실행했다. 이어 `MonthEndCloseService.findFocusRoutes/evaluateRoute`까지 호출하려 했다.

출력 원문(성공·실패 모두):

```text
row1 ==> Row[partnerCode=P, scopeKey=SLIP-A, sourceKey=SLIP-A#1, ... modelToken=AC060BXAPBH3, kind=OUTDOOR]
row2 ==> Row[partnerCode=P, scopeKey=SLIP-B, sourceKey=SLIP-B#1, ... modelToken=AC060BXAPBH3, kind=OUTDOOR]
full ==> Usage[total=1, used=1]
unused ==> Usage[total=1, used=0]
isolatedRi ==> true
combinedRi ==> false
|  Exception java.lang.NoClassDefFoundError: com/samhanair/logis/common/exception/BusinessException
|  Exception java.lang.NullPointerException: ... svcC is null
axis A isolated riUsage=true
axis A with separate-price axis B riUsage=false
```

판정:

- production `LegacyVerificationChain` 자체에서는 A만 보면 `true`, 별도 scope B를 전체 rows에 추가하면 A가 `false`로 바뀌었다. `focusRows`가 scope·품명·단가·AxisKey를 보지 않는 데 따른 실제 boolean 변화다.
- 다만 이 1차 프로브는 공통 모듈 classpath 누락으로 `MonthEndCloseService`를 로드하지 못했다. 따라서 아직 “A와 B가 서로 다른 화면 집계행인데 current service가 A를 false로 낸다”까지의 통합 증거는 아니며, 도구 실패를 결함 증거로 쓰지 않는다. 공통 compiled class를 classpath에 더해 즉시 재실행한다.

### ④-6b. chain 내부 `focusRows` — 2차 경계 확인

초기 재시도 설명(최종 성공 명령 원문은 `원문 보충 D`): 1차 JShell에 `shared/common/build/classes/java/main`을 classpath로 추가해 같은 입력으로 재실행했다.

출력 원문(핵심):

```text
svcC ==> class com.samhanair.logis.accounting.service.MonthEndCloseService
|  Exception java.lang.NoClassDefFoundError: org/springframework/data/jpa/repository/JpaRepository
...
axisRoutes ==> [RoutedRow[row=Row[partnerCode=P, scopeKey=SLIP-A, ... sourceKey=SLIP-A#1 ...]]]
isolatedRi ==> true
combinedRi ==> false
```

판정:

- 이번에는 production `findFocusRoutes`가 정상 실행됐다. 단가 1,257,100인 Axis A의 matching route는 **A 한 개뿐**이고, 단가 1,200,000인 B는 같은 화면 집계행에 속하지 않는다.
- 그런데 그 A route를 chain에 평가할 때 서비스가 넘기는 전체 `routedRows=[A,B]`에서는 A의 `riUsage`가 `true→false`로 변한다.
- 서비스 생성자는 Spring Data classpath 누락으로 아직 호출하지 못했다. private `evaluateRoute`는 repository 의존성이 없는 순수 평가이므로, 생성자를 우회해 production 인스턴스에 `DiscountRevalidator`만 넣고 최종값을 한 번 더 실행한다.

### ④-6c. chain 내부 `focusRows` — 생성자 우회 시도

초기 재시도 설명(판정 증거에서 제외): `Unsafe.allocateInstance`로 service 생성자를 건너뛴 뒤 `discountRevalidator` field만 주입하여 private `evaluateRoute`를 호출했다.

출력 원문(핵심):

```text
svc ==> com.samhanair.logis.accounting.service.MonthEndCloseService@...
|  Exception java.lang.NoClassDefFoundError: org/springframework/data/jpa/repository/JpaRepository
|        at Class.getDeclaredField(...)
...
axisRoutes ==> [RoutedRow[..., sourceKey=SLIP-A#1, ...]]
|  Caused by: java.lang.NullPointerException: ... this.discountRevalidator is null
separate Axis B excluded from A focusRoutes=true
```

판정: 생성 자체는 됐지만 field reflection 시 JVM이 다른 repository field 타입까지 해소하면서 Spring Data class가 없어 주입이 실패했다. 이 시도 역시 도구 실패이고 결함 증거로 세지 않는다. 다만 compiled `findFocusRoutes`의 “B가 A 집계행에서 제외됨”은 재확인됐다. `evaluateRoute` 소스가 수행하는 두 production 호출(`revalidateByLegacyBranch` 후 `withVerified(riUsageDecision)`)을 같은 객체로 직접 이어 최종값을 확인한다.

### ④-6d. chain 내부 `focusRows` — 최종 boolean 재현

실행 명령 원문:

```powershell
$probe = @'
import java.lang.reflect.*;
import java.math.*;
import java.util.*;
// production DiscountRevalidator: 4WAY 20,000원, STAND 40,000원 등 전역DC
Class<?> drc=Class.forName("com.samhanair.logis.accounting.service.DiscountRevalidator");
Object dr=drc.getConstructor().newInstance();
// revalidateByLegacyBranch(... SINGLE_MAIN/SINGLE)로 실 token의 base 판정 생성
Object base=reval.invoke(dr,"실외기","AC060BS4PBH7SY",new BigDecimal("1257100"),
        new BigDecimal("1277100"),BigDecimal.ZERO,null,gd,matched,main,single);
// A: SLIP-A#1, AC060BXAPBH3 OUTDOOR, Usage 1/1
// B: SLIP-B#1, 같은 token/kind, Usage 0/1
Object isolatedRi=ri.invoke(null,rr1,List.of(rr1),Map.of("SLIP-A#1",full),
        new BigDecimal("1257100"),new BigDecimal("1257100"));
Object currentRi=ri.invoke(null,rr1,List.of(rr1,rr2),
        Map.of("SLIP-A#1",full,"SLIP-B#1",unused),
        new BigDecimal("1257100"),new BigDecimal("1257100"));
Object isolatedFinal=withVerified.invoke(base,isolatedRi);
Object currentFinal=withVerified.invoke(base,currentRi);
System.out.println("price base verified="+verified.invoke(base));
System.out.println("isolated Axis A riUsage/final="+isolatedRi+"/"+verified.invoke(isolatedFinal));
System.out.println("current all-routes riUsage/final="+currentRi+"/"+verified.invoke(currentFinal));
/exit
'@
$probe | jshell --class-path 'services/accounting-service/build/classes/java/main'
```

이 절의 축약 표기는 조사 중간 기록이다. 최종 판정에는 보고서 말미 `원문 보충 D`의 축약 없는 full command 재실행을 사용한다.

출력 원문:

```text
base ==> Revalidation[verified=true, ... deliveryPrice=1257100]
isolatedRi ==> true
currentRi ==> false
isolatedFinal ==> Revalidation[verified=true, ... deliveryPrice=1257100]
currentFinal ==> Revalidation[verified=false, ... deliveryPrice=1257100]
price base verified=true
isolated Axis A riUsage/final=true/true
current all-routes riUsage/final=false/false
```

판정 — **실 사용자 재현 가능한 결함 후보 확정**:

- A의 가격 판정은 `true`이고 A만의 완전 소비 상태도 `true`다. 따라서 A 집계행은 `확인`이어야 한다.
- B는 단가가 달라 compiled `findFocusRoutes` 기준 A와 다른 집계행이다. 그런데 chain `focusRows`는 단가/AxisKey/scope를 무시하고 같은 거래처·token·kind·branch인 B의 미소비 상태를 A에 넣어 A 최종값을 `false`로 만든다.
- 이는 R16의 새 false-first 결합 이전, 각 route 평가 안에서 이미 false가 만들어지는 과잉 경계다. R16이 chain `focusRows`를 “row별 branch와 scope별 상태를 계산하므로 대상 아님”으로 제외한 분류는 **틀렸다**. `SINGLE_MAIN`의 `allMatch`는 scope별 상태를 분리하지 않는다.
- 실제 matcher가 `A 완성 / B 미완성` 사용량을 만들 수 있는지 실제 카탈로그에서 가장 작은 구성으로 이어 확인한다.

실행 명령 원문:

```powershell
docker exec samhan-postgres psql -U samhan -d product_db -v ON_ERROR_STOP=1 -c "BEGIN TRANSACTION READ ONLY; WITH rel AS (SELECT parent.model_code AS parent_code, bc.component_product_code AS token, bc.component_kind::text AS kind, cp.delivery_price FROM bundle_component bc JOIN products parent ON parent.id=bc.bundle_product_id LEFT JOIN products cp ON cp.model_code=bc.component_product_code AND COALESCE(cp.is_deleted,false)=false WHERE COALESCE(bc.is_deleted,false)=false AND COALESCE(parent.is_deleted,false)=false AND parent.product_category='SINGLE_SET' AND parent.model_code IS NOT NULL AND bc.component_product_code IS NOT NULL), shared AS (SELECT token FROM rel WHERE kind IN ('INDOOR','OUTDOOR','SUB_INDOOR') GROUP BY token HAVING count(DISTINCT parent_code)>1), counts AS (SELECT parent_code, count(*) component_count FROM rel GROUP BY parent_code) SELECT r.parent_code, c.component_count, string_agg(r.token || ':' || r.kind || ':' || COALESCE(r.delivery_price::text,'null'), ', ' ORDER BY r.token) AS components FROM rel r JOIN counts c USING(parent_code) WHERE r.parent_code IN (SELECT DISTINCT r2.parent_code FROM rel r2 JOIN shared s USING(token)) GROUP BY r.parent_code,c.component_count ORDER BY c.component_count,r.parent_code LIMIT 20; COMMIT;"
```

출력 원문(첫 행):

```text
BEGIN
 parent_code  | component_count | components
--------------+-----------------+--------------------------------------------------------------------------------------
 AF17B6474GZS |               3 | AF17B6470DCX:OUTDOOR:0.00, AF17B6474GZN:INDOOR:0.00, FPC-1412YAF2:MATERIAL:100000.00
 ...
(20 rows)
COMMIT
```

판정: 실제 활성 `SINGLE_SET` 중 최소 3개 구성품인 세트가 있고, 본체 token을 다른 부모와 공유한다. 이 세트의 matcher 기대합계는 100,000원이다. 따라서 전표 A의 세 양수 단가를 20,000+30,000+50,000=100,000으로 두면 완성 매치가 되고, 전표 B에는 공유 실외기만 다른 단가 40,000원으로 두면 미완성으로 남는다. 모두 양수라 매출전표 입력/배분의 양수 계약에도 걸리지 않는다.

### ④-6e. production matcher의 `A 완성 / B 미완성` 도달 확인 — 1차

초기 실행 설명: production `LegacySetMatcher`에 위 실 카탈로그 3개 token/가격과 A(20,000/30,000/50,000), B(공유 실외기 40,000)를 reflection으로 그대로 넣어 `findMatchesWithUsage`를 호출했다. 성공 재실행의 full command는 바로 다음 `④-6f`에 기록했다.

출력 원문:

```text
cand ==> SetCandidate[setName=AF17B6474GZS, components=[
  Component[modelToken=AF17B6474GZN, kind=INDOOR, price=0],
  Component[modelToken=AF17B6470DCX, kind=OUTDOOR, price=0],
  Component[modelToken=FPC-1412YAF2, kind=MATERIAL, price=100000]]]
ai ==> InvoiceLine[..., unitPrice=20000, scopeKey=SLIP-A, sourceKey=SLIP-A#1]
ao ==> InvoiceLine[..., unitPrice=30000, scopeKey=SLIP-A, sourceKey=SLIP-A#2]
am ==> InvoiceLine[..., unitPrice=50000, scopeKey=SLIP-A, sourceKey=SLIP-A#3]
bo ==> InvoiceLine[..., unitPrice=40000, scopeKey=SLIP-B, sourceKey=SLIP-B#1]
result ==> MatchingResult[matches=[Match[setName=AF17B6474GZS, ...]], usage={..., SLIP-B#1=Usage[total=1, used=0]}]
|  Exception java.lang.IllegalAccessException: ... MatchingResult ...
```

판정: result 생성 자체에서 1개 match와 B `used=0`가 보였지만, package-private record의 public accessor에도 reflection 접근 허용이 필요해 명시 출력이 실패했다. 이 예외를 증거로 쓰지 않고 accessor에 `setAccessible(true)`를 적용해 재실행한다.

### ④-6f. production matcher의 `A 완성 / B 미완성` 도달 확인 — 성공

실행 명령 원문:

```powershell
$probe = @'
import java.lang.reflect.*;
import java.math.*;
import java.util.*;
Class<?> compC=Class.forName("com.samhanair.logis.accounting.service.LegacySetMatcher$Component");
Constructor<?> compCtor=compC.getDeclaredConstructors()[0]; compCtor.setAccessible(true);
Object ci=compCtor.newInstance("AF17B6474GZN","INDOOR",BigDecimal.ZERO);
Object co=compCtor.newInstance("AF17B6470DCX","OUTDOOR",BigDecimal.ZERO);
Object cm=compCtor.newInstance("FPC-1412YAF2","MATERIAL",new BigDecimal("100000"));
Class<?> candC=Class.forName("com.samhanair.logis.accounting.service.LegacySetMatcher$SetCandidate");
Constructor<?> candCtor=candC.getDeclaredConstructors()[0]; candCtor.setAccessible(true);
Object cand=candCtor.newInstance("AF17B6474GZS",List.of(ci,co,cm));
Class<?> lineC=Class.forName("com.samhanair.logis.accounting.service.LegacySetMatcher$InvoiceLine");
Constructor<?> lineCtor=Arrays.stream(lineC.getDeclaredConstructors()).filter(c->c.getParameterCount()==6).findFirst().orElseThrow(); lineCtor.setAccessible(true);
Object ai=lineCtor.newInstance("AF17B6474GZN","INDOOR",new BigDecimal("20000"),"P","SLIP-A","SLIP-A#1");
Object ao=lineCtor.newInstance("AF17B6470DCX","OUTDOOR",new BigDecimal("30000"),"P","SLIP-A","SLIP-A#2");
Object am=lineCtor.newInstance("FPC-1412YAF2","MATERIAL",new BigDecimal("50000"),"P","SLIP-A","SLIP-A#3");
Object bo=lineCtor.newInstance("AF17B6470DCX","OUTDOOR",new BigDecimal("40000"),"P","SLIP-B","SLIP-B#1");
Class<?> matcherC=Class.forName("com.samhanair.logis.accounting.service.LegacySetMatcher");
Constructor<?> matcherCtor=matcherC.getDeclaredConstructors()[0]; matcherCtor.setAccessible(true);
Object matcher=matcherCtor.newInstance();
Method run=Arrays.stream(matcherC.getDeclaredMethods()).filter(m->m.getName().equals("findMatchesWithUsage")).findFirst().orElseThrow(); run.setAccessible(true);
Object result=run.invoke(matcher,List.of(ai,ao,am,bo),List.of(cand),Map.of());
Method matches=result.getClass().getDeclaredMethod("matches"); matches.setAccessible(true);
Method usage=result.getClass().getDeclaredMethod("usage"); usage.setAccessible(true);
System.out.println("matches="+matches.invoke(result));
System.out.println("usage="+usage.invoke(result));
/exit
'@
$probe | jshell --class-path 'services/accounting-service/build/classes/java/main'
```

출력 원문:

```text
matches=[Match[setName=AF17B6474GZS, poolIndexes=[0, 1, 2]]]
usage={SLIP-A#1=Usage[total=1, used=1], SLIP-A#2=Usage[total=1, used=1], SLIP-A#3=Usage[total=1, used=1], SLIP-B#1=Usage[total=1, used=0]}
```

판정: synthetic `Usage` 주입에만 의존하지 않는다. 실 활성 세트/구성품을 production matcher에 넣어 **A 세 구성품은 전부 완전 소비, B 공유 실외기는 미소비** 상태가 실제로 생성됨을 재현했다. 따라서 ④-6d의 `true→false`는 실 사용자 입력으로 도달 가능하다.

### 결함 A — 다른 화면 집계행의 미완성 본체가 정상 완성행을 `불일치`로 바꿈

실 사용자 재현 절차:

1. 같은 날짜·같은 거래처의 정상 출고전표→POSTED 매출전표 경로에서 두 전표를 만든다. `line_no`는 그대로 계승하며 순서를 바꾸지 않는다.
2. 전표 A에는 활성 세트 `AF17B6474GZS`의 세 실 구성품을 둔다.
   - `AF17B6474GZN`(INDOOR): 20,000원
   - `AF17B6470DCX`(OUTDOOR): 30,000원
   - `FPC-1412YAF2`(MATERIAL): 50,000원
   - 합계 100,000원은 현 카탈로그의 세트 기대합계와 같아 production matcher가 세 행을 모두 `used=1/1`로 만든다.
3. 전표 B에는 같은 거래처·같은 품명·같은 `SINGLE` 축으로 공유 실외기 `AF17B6470DCX` 한 행만 40,000원에 둔다. 완성 세트가 아니므로 이 행은 `used=0/1`이다.
4. 데스크톱 `/accounting/daily-closings`에서 그 날짜의 `매출` / `매출전표` 상세를 조회한다.
5. 같은 token이지만 실제단가 30,000원과 40,000원이므로 `AxisKey`/`findFocusRoutes`는 A와 B를 **서로 다른 모델별 재검증 행**으로 만든다. 그럼에도 `LegacyVerificationChain.focusRows`가 B를 A 판정에 포함해 A의 완전 소비 `true`를 `false`로 바꾸므로, A 행이 `확인`이 아니라 `불일치`로 표시된다.

영향 건수:

- 결정적 최소 재현: **2전표 / 4원천행**.
- 사용자 표시: 공유 실외기의 서로 다른 단가 집계행 2개 중, 정상 완성 세트 A의 **1집계행이 추가로 `불일치`**가 된다(B의 불일치는 정상).
- 실 카탈로그 도달: 위 최소 구성과 같은 활성 세트가 존재하며 production matcher 사용량까지 재현했다.
- 현재 공유 실 거래 DB 관측 영향: **0건**. ①에서 확인한 것처럼 `model_name/category_key`가 채워진 발화 거래 snapshot이 0행이라 운영성 총 건수는 계수할 수 없다.
- 이 결함은 R16의 새 `aggregateRouteRevalidations(false-first)`에서 생긴 것이 아니라, R16이 제외한 chain 내부에서 각 route 평가 전에 이미 생긴다. 다만 현재 PR의 실제 사용자 판정 경로에 남아 있고, R16의 6곳 분류 재검토 요구에 직접 해당한다.

### ④ 종합 판정

| 제외 지점 | 재검토 판정 |
|---|---|
| `LegacySetMatcher.findUnusedByToken` | 순서 의존은 재현되지만 레거시 시트 행 순서 의미 그대로이며, 이번 과잉 false 결함은 아님 |
| `resolveMatchedSetNames` | 실 selector 충돌 token 31개가 있으나 완성 세트 riUsage가 최종 boolean을 덮어써 `확인→불일치`는 만들지 않음 |
| `kindByToken` | 실 활성 token kind 충돌 0개; 제외 타당 |
| `resolveProductSummaries` | token별 단건 정확 lookup, 활성 model_name 중복 0개; 제외 타당 |
| `firstSalesSourceSlipNo` / purchase | 헤더 문자열 표시 전용, `verified`와 분리; 제외 타당 |
| chain 내부 `focusRows` | **제외 부당 — 서로 다른 AxisKey의 미완성 본체가 정상 AxisKey에 false를 전파하는 결함 A 재현** |

## ⑤ R16 수치 재현

### ⑤-1. R16 원문 수치·명령 고정

실행 명령 원문:

```powershell
rg -n -A 150 -B 30 '76|값 변경|3케이스|rerun-tasks|no-build-cache|변경 표면' docs/dev-reports/2026-08-03-874-r16-fix.md
```

출력 원문(핵심):

```text
167: ./gradlew :services:accounting-service:test --tests '...LegacyVerificationChainTest' --tests '...RiUsageDecisionTest' --tests '...LegacySetMatcherTest' --tests '...GasCategoryAxisTest' --tests '...DiscountRevalidatorTest' --tests '...DailyClosingDetailServiceTest' --rerun-tasks --no-build-cache
226- LegacyVerificationChainTest    5
227- RiUsageDecisionTest           12
228- LegacySetMatcherTest           7
229- GasCategoryAxisTest            5
230- DiscountRevalidatorTest       23
231- DailyClosingDetailServiceTest 24
232: TOTAL tests=76 failures=0 errors=0 skipped=0

282: 패널 → 본체 → 패널: true → false
283: 본체 → 패널 → 패널: false → false
284: 패널만 있고 모든 원천 route 확인: true → true
```

판정: R16의 재현 대상은 위 6개 클래스 76개와 3케이스 표다. 같은 Gradle 명령에 `--rerun-tasks --no-build-cache`를 붙여 그대로 강제 실행하고, console 성공만이 아니라 XML 합계를 다시 센다.

### ⑤-2. 변경 표면 6개 캐시 배제 강제 실행

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

BUILD SUCCESSFUL in 42s
21 actionable tasks: 21 executed
```

판정: exit 0, `BUILD SUCCESSFUL`, actionable task **21/21 executed**다. 출력에 `UP-TO-DATE`와 `FROM-CACHE`가 없으므로 캐시 미실행을 성공으로 오인하지 않았다. 다음으로 생성된 JUnit XML을 직접 집계한다.

### ⑤-3. JUnit XML 실측 합계

실행 명령 원문:

```powershell
$names=@('LegacyVerificationChainTest','RiUsageDecisionTest','LegacySetMatcherTest','GasCategoryAxisTest','DiscountRevalidatorTest','DailyClosingDetailServiceTest')
$rows=foreach($name in $names){
  $f=Get-ChildItem -LiteralPath 'services/accounting-service/build/test-results/test' -Filter "TEST-*$name.xml"
  [xml]$x=Get-Content -LiteralPath $f.FullName -Raw -Encoding UTF8
  [pscustomobject]@{Class=$name;Tests=[int]$x.testsuite.tests;Failures=[int]$x.testsuite.failures;Errors=[int]$x.testsuite.errors;Skipped=[int]$x.testsuite.skipped;Timestamp=$x.testsuite.timestamp}
}
$rows | Format-Table -AutoSize
$tot=[pscustomobject]@{Class='TOTAL';Tests=($rows|Measure-Object Tests -Sum).Sum;Failures=($rows|Measure-Object Failures -Sum).Sum;Errors=($rows|Measure-Object Errors -Sum).Sum;Skipped=($rows|Measure-Object Skipped -Sum).Sum}
$tot | Format-Table -AutoSize
```

출력 원문:

```text
Class                         Tests Failures Errors Skipped Timestamp
-----                         ----- -------- ------ ------- ---------
LegacyVerificationChainTest       5        0      0       0 2026-08-03T04:25:48
RiUsageDecisionTest              12        0      0       0 2026-08-03T04:25:48
LegacySetMatcherTest              7        0      0       0 2026-08-03T04:25:48
GasCategoryAxisTest               5        0      0       0 2026-08-03T04:25:48
DiscountRevalidatorTest          23        0      0       0 2026-08-03T04:25:48
DailyClosingDetailServiceTest    24        0      0       0 2026-08-03T04:25:44

Class Tests Failures Errors Skipped
----- ----- -------- ------ -------
TOTAL    76        0      0       0
```

판정: R16의 **76 tests / failures·errors·skipped 0/0/0** 수치는 캐시 배제 신규 timestamp XML에서 그대로 재현됐다.

### ⑤-4a. 값 변경 3케이스 production probe — 1차 실패

실행 명령 원문: `LegacyVerificationChain.route/branch/riUsageDecision`, `DiscountRevalidator.revalidateByLegacyBranch`, `MonthEndCloseService.aggregateRouteRevalidations`를 한 함수로 연결해 `P-M-P`, `M-P-P`, panel-only를 실행했다.

출력 원문:

```text
created method runScenario(String,List<String>)
Exception java.lang.IllegalAccessException: ... LegacyVerificationChain$RoutedRow ...
  at runScenario (...)
```

판정: package-private `RoutedRow` record의 `zone()` accessor에 접근 허용을 주지 않은 조사 도구 실패다. 값 판정 증거로 사용하지 않으며 `zone.setAccessible(true)`로 즉시 재실행한다.

### ⑤-4b. 값 변경 3케이스 production probe — 성공

실행 명령 원문:

```powershell
$cp='services/accounting-service/build/classes/java/main;shared/common/build/classes/java/main'
$probe=@'
import java.lang.reflect.*;
import java.math.*;
import java.util.*;
String runScenario(String name, List<String> order) throws Exception {
  Class<?> chainC=Class.forName("com.samhanair.logis.accounting.service.LegacyVerificationChain");
  Class<?> rowC=Class.forName("com.samhanair.logis.accounting.service.LegacyVerificationChain$Row");
  Constructor<?> rowCtor=rowC.getDeclaredConstructors()[0]; rowCtor.setAccessible(true);
  List<Object> rows=new ArrayList<>();
  for(int i=0;i<order.size();i++){
    boolean panel=order.get(i).equals("P");
    rows.add(rowCtor.newInstance("P","S","S#"+(i+1),panel?"패널":"본체",
      panel?"PC1BWCK3NW":"AC023CN1DBC1",panel?"PANEL":"INDOOR",false));
  }
  Method route=Arrays.stream(chainC.getDeclaredMethods()).filter(m->m.getName().equals("route")).findFirst().orElseThrow(); route.setAccessible(true);
  List<?> routed=(List<?>)route.invoke(null,rows);
  Method branch=Arrays.stream(chainC.getDeclaredMethods()).filter(m->m.getName().equals("branch")).findFirst().orElseThrow(); branch.setAccessible(true);
  Method ri=Arrays.stream(chainC.getDeclaredMethods()).filter(m->m.getName().equals("riUsageDecision")).findFirst().orElseThrow(); ri.setAccessible(true);
  Class<?> drC=Class.forName("com.samhanair.logis.accounting.service.DiscountRevalidator"); Object dr=drC.getConstructor().newInstance();
  Method reval=Arrays.stream(drC.getDeclaredMethods()).filter(m->m.getName().equals("revalidateByLegacyBranch")&&m.getParameterCount()==10).findFirst().orElseThrow(); reval.setAccessible(true);
  Class<?> gdC=Class.forName("com.samhanair.logis.accounting.service.DiscountRevalidator$GlobalDiscount"); Object gd=gdC.getDeclaredMethod("notRequired").invoke(null);
  Class<?> statusC=Class.forName("com.samhanair.logis.accounting.client.ProductLabelMatch$Status"); Object matched=Enum.valueOf((Class)statusC,"MATCHED");
  Class<?> revC=Class.forName("com.samhanair.logis.accounting.service.DiscountRevalidator$Revalidation");
  Method delivery=revC.getDeclaredMethod("deliveryPrice"); Method verified=revC.getDeclaredMethod("verified"); Method withVerified=revC.getDeclaredMethod("withVerified",Boolean.class);
  Class<?> rrC=Class.forName("com.samhanair.logis.accounting.service.LegacyVerificationChain$RoutedRow"); Method zone=rrC.getDeclaredMethod("zone"); zone.setAccessible(true);
  Class<?> evalC=Class.forName("com.samhanair.logis.accounting.service.MonthEndCloseService$RouteEvaluation"); Constructor<?> evalCtor=evalC.getDeclaredConstructors()[0]; evalCtor.setAccessible(true);
  List<Object> evals=new ArrayList<>(); List<String> detail=new ArrayList<>();
  for(int i=0;i<order.size();i++) if(order.get(i).equals("P")) {
    Object rr=routed.get(i); Object br=branch.invoke(null,rr,true);
    Object base=reval.invoke(dr,"패널","PC1BWCK3NW",new BigDecimal("70000"),new BigDecimal("100000"),new BigDecimal("70000"),null,gd,matched,br,zone.invoke(rr));
    Object decision=ri.invoke(null,rr,routed,Map.of(),new BigDecimal("70000"),delivery.invoke(base));
    Object fin=decision==null?base:withVerified.invoke(base,decision);
    evals.add(evalCtor.newInstance(rr,fin));
    detail.add("#"+(i+1)+"="+br+"/"+zone.invoke(rr)+"/ri="+decision+"/final="+verified.invoke(fin));
  }
  Class<?> svcC=Class.forName("com.samhanair.logis.accounting.service.MonthEndCloseService");
  Method aggregate=Arrays.stream(svcC.getDeclaredMethods()).filter(m->m.getName().equals("aggregateRouteRevalidations")).findFirst().orElseThrow(); aggregate.setAccessible(true);
  Object post=aggregate.invoke(null,evals);
  Method revAccessor=evalC.getDeclaredMethod("revalidation"); revAccessor.setAccessible(true);
  Object firstRev=revAccessor.invoke(evals.get(0));
  return name+" routes="+detail+" R16-before="+verified.invoke(firstRev)+" R16-after="+verified.invoke(post);
}
System.out.println(runScenario("P-M-P",List.of("P","M","P")));
System.out.println(runScenario("M-P-P",List.of("M","P","P")));
System.out.println(runScenario("P-P all-true",List.of("P","P")));
/exit
'@
$probe | jshell --class-path $cp
```

출력 원문:

```text
P-M-P routes=[#1=DEFAULT/UNKNOWN/ri=null/final=true, #3=SINGLE_ACCESSORY/SINGLE/ri=false/final=false] R16-before=true R16-after=false
M-P-P routes=[#2=SINGLE_ACCESSORY/SINGLE/ri=false/final=false, #3=SINGLE_ACCESSORY/SINGLE/ri=false/final=false] R16-before=false R16-after=false
P-P all-true routes=[#1=DEFAULT/UNKNOWN/ri=null/final=true, #2=DEFAULT/UNKNOWN/ri=null/final=true] R16-before=true R16-after=true
```

판정: R16 3케이스 표가 모두 production compiled classes에서 재현됐다. 값이 바뀐 것은 `P-M-P`의 **1건(true→false)**뿐이고, `M-P-P`는 false 유지, all-true는 true 유지다. R16이 원문/실측으로 제시한 이 수치·출력에는 불일치가 없다.

### ⑤ 종합 판정

- 변경 표면: **76/76 성공**, failures/errors/skipped 0/0/0, 21 actionable tasks 모두 executed.
- 값 변경 표: **1건만 true→false**, 나머지 2케이스 값 유지 — R16 주장과 일치.
- 이 성공은 ④에서 찾은 서로 다른 AxisKey 간 `focusRows` false 전파를 포함하지 않는 기존 테스트 표면이다. 테스트 약함 자체는 이번 유일 질문 밖이므로 결함으로 보고하지 않고, production 재현된 결함 A만 판정에 반영한다.

## 실행 명령 원문 보충 재실행

초반 조사 중 보고서에 `<reflection probe>`로 축약해 적은 명령을 최종 판정 전에 발견했다. 아래는 같은 production compiled class에 대한 **full command 재실행**이며, 앞 절의 결과를 대체·보강한다.

### 원문 보충 A — ② `sameAxis` 결합 경계

실행 명령 원문:

```powershell
$cp='services/accounting-service/build/classes/java/main;shared/common/build/classes/java/main'
$probe=@'
import java.lang.reflect.*;
import java.math.*;
Class<?> svc=Class.forName("com.samhanair.logis.accounting.service.MonthEndCloseService");
Class<?> gas=Class.forName("com.samhanair.logis.accounting.service.GasCategoryAxis");
Object single=Enum.valueOf((Class)gas,"SINGLE"); Object old=Enum.valueOf((Class)gas,"OLD");
Class<?> axis=Class.forName("com.samhanair.logis.accounting.service.MonthEndCloseService$AxisKey");
Constructor<?> ac=axis.getDeclaredConstructors()[0]; ac.setAccessible(true);
Object a=ac.newInstance("P","품명","TOKEN",single,new BigDecimal("100"));
Class<?> pool=Class.forName("com.samhanair.logis.accounting.service.MonthEndCloseService$SetPoolLine");
Constructor<?> pc=pool.getDeclaredConstructors()[0]; pc.setAccessible(true);
Method same=Arrays.stream(svc.getDeclaredMethods()).filter(m->m.getName().equals("sameAxis")).findFirst().orElseThrow(); same.setAccessible(true);
Object scopeOnly=pc.newInstance("TOKEN",new BigDecimal("100.0"),BigDecimal.ONE,"P","SCOPE-2","SRC-2","품명",single);
Object partner=pc.newInstance("TOKEN",new BigDecimal("100"),BigDecimal.ONE,"Q","SCOPE-2","SRC-2","품명",single);
Object label=pc.newInstance("TOKEN",new BigDecimal("100"),BigDecimal.ONE,"P","SCOPE-2","SRC-2","다른품명",single);
Object token=pc.newInstance("OTHER",new BigDecimal("100"),BigDecimal.ONE,"P","SCOPE-2","SRC-2","품명",single);
Object category=pc.newInstance("TOKEN",new BigDecimal("100"),BigDecimal.ONE,"P","SCOPE-2","SRC-2","품명",old);
Object price=pc.newInstance("TOKEN",new BigDecimal("101"),BigDecimal.ONE,"P","SCOPE-2","SRC-2","품명",single);
System.out.println("same axis, different scope/source="+same.invoke(null,a,scopeOnly));
System.out.println("different partner="+same.invoke(null,a,partner));
System.out.println("different label="+same.invoke(null,a,label));
System.out.println("different token="+same.invoke(null,a,token));
System.out.println("different category axis="+same.invoke(null,a,category));
System.out.println("different actual unit price="+same.invoke(null,a,price));
/exit
'@
$probe | jshell --class-path $cp
```

출력 원문:

```text
same axis, different scope/source=true
different partner=false
different label=false
different token=false
different category axis=false
different actual unit price=false
```

판정: ② 판정과 동일하다. scope/source는 한 표시축 안에서 결합되지만 partner·label·token·category axis·실단가 중 하나라도 다르면 결합되지 않는다.

### 원문 보충 B — ③ 세 번째 순서·패널 3개

실행 명령 원문:

```powershell
$cp='services/accounting-service/build/classes/java/main;shared/common/build/classes/java/main'
$probe=@'
import java.lang.reflect.*;
import java.math.*;
import java.util.*;
String orderProbe(String name,List<String> order) throws Exception {
 Class<?> chain=Class.forName("com.samhanair.logis.accounting.service.LegacyVerificationChain");
 Class<?> row=Class.forName("com.samhanair.logis.accounting.service.LegacyVerificationChain$Row");
 Constructor<?> rc=row.getDeclaredConstructors()[0]; rc.setAccessible(true);
 List<Object> rows=new ArrayList<>();
 for(int i=0;i<order.size();i++){boolean p=order.get(i).equals("P"); rows.add(rc.newInstance("P","S","S#"+(i+1),p?"패널":"본체",p?"PC1BWCK3NW":"AC023CN1DBC1",p?"PANEL":"INDOOR",false));}
 Method route=Arrays.stream(chain.getDeclaredMethods()).filter(m->m.getName().equals("route")).findFirst().orElseThrow(); route.setAccessible(true);
 List<?> routed=(List<?>)route.invoke(null,rows);
 Method branch=Arrays.stream(chain.getDeclaredMethods()).filter(m->m.getName().equals("branch")).findFirst().orElseThrow(); branch.setAccessible(true);
 Method ri=Arrays.stream(chain.getDeclaredMethods()).filter(m->m.getName().equals("riUsageDecision")).findFirst().orElseThrow(); ri.setAccessible(true);
 Class<?> status=Class.forName("com.samhanair.logis.accounting.service.DiscountRevalidator$Status"); Object verifiedStatus=Enum.valueOf((Class)status,"VERIFIED");
 Class<?> rev=Class.forName("com.samhanair.logis.accounting.service.DiscountRevalidator$Revalidation"); Constructor<?> revc=rev.getConstructors()[0]; Method verified=rev.getDeclaredMethod("verified");
 Class<?> eval=Class.forName("com.samhanair.logis.accounting.service.MonthEndCloseService$RouteEvaluation"); Constructor<?> ec=eval.getDeclaredConstructors()[0]; ec.setAccessible(true);
 List<Object> evals=new ArrayList<>(); List<String> details=new ArrayList<>();
 for(int i=0;i<order.size();i++)if(order.get(i).equals("P")){
   Object rr=routed.get(i); Object decision=ri.invoke(null,rr,routed,Map.of(),new BigDecimal("70000"),new BigDecimal("70000"));
   Boolean fin=decision==null?Boolean.TRUE:(Boolean)decision;
   Object rv=revc.newInstance(fin,null,null,null,verifiedStatus,new BigDecimal("100000"),new BigDecimal("70000"));
   evals.add(ec.newInstance(rr,rv)); details.add("#"+(i+1)+"="+branch.invoke(null,rr,true)+"/ri="+decision+"/final="+fin);
 }
 Class<?> svc=Class.forName("com.samhanair.logis.accounting.service.MonthEndCloseService");
 Method agg=Arrays.stream(svc.getDeclaredMethods()).filter(m->m.getName().equals("aggregateRouteRevalidations")).findFirst().orElseThrow(); agg.setAccessible(true);
 Object f=agg.invoke(null,evals); List<Object> reversed=new ArrayList<>(evals); Collections.reverse(reversed); Object r=agg.invoke(null,reversed);
 return name+" "+details+" forward="+verified.invoke(f)+" reverse="+verified.invoke(r);
}
System.out.println(orderProbe("M-P-M",List.of("M","P","M")));
System.out.println(orderProbe("P-M-P-P",List.of("P","M","P","P")));
System.out.println(orderProbe("P-P-M",List.of("P","P","M")));
/exit
'@
$probe | jshell --class-path $cp
```

출력 원문:

```text
M-P-M [#2=SINGLE_ACCESSORY/ri=false/final=false] forward=false reverse=false
P-M-P-P [#1=DEFAULT/ri=null/final=true, #3=SINGLE_ACCESSORY/ri=false/final=false, #4=SINGLE_ACCESSORY/ri=false/final=false] forward=false reverse=false
P-P-M [#1=DEFAULT/ri=null/final=true, #2=DEFAULT/ri=null/final=true] forward=true reverse=true
```

판정: ③ 판정과 동일하다. 고정된 route 평가 집합의 정방향/역방향 결과는 모두 같고, all-true인 `P-P-M`은 false로 과잉 전환되지 않았다.

### 원문 보충 C — ④ `findUnusedByToken`

실행 명령 원문:

```powershell
$probe=@'
import java.lang.reflect.*;
import java.math.*;
import java.util.*;
String matchOrder(List<BigDecimal> outdoorPrices) throws Exception {
 Class<?> line=Class.forName("com.samhanair.logis.accounting.service.LegacySetMatcher$InvoiceLine");
 Constructor<?> lc=Arrays.stream(line.getDeclaredConstructors()).filter(c->c.getParameterCount()==6).findFirst().orElseThrow(); lc.setAccessible(true);
 List<Object> pool=new ArrayList<>();
 pool.add(lc.newInstance("I","INDOOR",new BigDecimal("100"),"P","S1","S1#1"));
 for(int i=0;i<outdoorPrices.size();i++) pool.add(lc.newInstance("O","OUTDOOR",outdoorPrices.get(i),"P","S1","S1#"+(i+2)));
 Class<?> comp=Class.forName("com.samhanair.logis.accounting.service.LegacySetMatcher$Component");
 Constructor<?> cc=comp.getDeclaredConstructors()[0]; cc.setAccessible(true);
 Object ci=cc.newInstance("I","INDOOR",new BigDecimal("100")); Object co=cc.newInstance("O","OUTDOOR",new BigDecimal("200"));
 Class<?> cand=Class.forName("com.samhanair.logis.accounting.service.LegacySetMatcher$SetCandidate");
 Constructor<?> cdc=cand.getDeclaredConstructors()[0]; cdc.setAccessible(true); Object set=cdc.newInstance("SET",List.of(ci,co));
 Class<?> matcher=Class.forName("com.samhanair.logis.accounting.service.LegacySetMatcher");
 Constructor<?> mc=matcher.getDeclaredConstructors()[0]; mc.setAccessible(true); Object m=mc.newInstance();
 Method run=Arrays.stream(matcher.getDeclaredMethods()).filter(x->x.getName().equals("findMatchesWithUsage")).findFirst().orElseThrow(); run.setAccessible(true);
 Object result=run.invoke(m,pool,List.of(set),Map.of());
 Method matches=result.getClass().getDeclaredMethod("matches"); matches.setAccessible(true);
 Method usage=result.getClass().getDeclaredMethod("usage"); usage.setAccessible(true);
 return "matches="+((List<?>)matches.invoke(result)).size()+" usage="+usage.invoke(result);
}
System.out.println("I,O200,O300 "+matchOrder(List.of(new BigDecimal("200"),new BigDecimal("300"))));
System.out.println("I,O300,O200 "+matchOrder(List.of(new BigDecimal("300"),new BigDecimal("200"))));
/exit
'@
$probe | jshell --class-path 'services/accounting-service/build/classes/java/main'
```

출력 원문:

```text
I,O200,O300 matches=1 usage={S1#1=Usage[total=1, used=1], S1#2=Usage[total=1, used=1], S1#3=Usage[total=1, used=0]}
I,O300,O200 matches=0 usage={S1#1=Usage[total=1, used=0], S1#2=Usage[total=1, used=0], S1#3=Usage[total=1, used=0]}
```

판정: ④-1b 결과를 full command로 재현했다. 순서 의존은 사실이지만 레거시 `findIndex`/`line_no` 의미와 같아 결함 A와는 별개다.

### 원문 보충 D — ④ chain `focusRows` 결함 핵심

실행 명령 원문:

```powershell
$cp='services/accounting-service/build/classes/java/main;shared/common/build/classes/java/main'
$probe=@'
import java.lang.reflect.*;
import java.math.*;
import java.util.*;
Class<?> svc=Class.forName("com.samhanair.logis.accounting.service.MonthEndCloseService");
Class<?> gas=Class.forName("com.samhanair.logis.accounting.service.GasCategoryAxis"); Object singleAxis=Enum.valueOf((Class)gas,"SINGLE");
Class<?> axis=Class.forName("com.samhanair.logis.accounting.service.MonthEndCloseService$AxisKey"); Constructor<?> ac=axis.getDeclaredConstructors()[0]; ac.setAccessible(true);
Object axisA=ac.newInstance("P","실외기","AF17B6470DCX",singleAxis,new BigDecimal("30000"));
Class<?> pool=Class.forName("com.samhanair.logis.accounting.service.MonthEndCloseService$SetPoolLine"); Constructor<?> pc=pool.getDeclaredConstructors()[0]; pc.setAccessible(true);
Object pa=pc.newInstance("AF17B6470DCX",new BigDecimal("30000"),BigDecimal.ONE,"P","SLIP-A","SLIP-A#2","실외기",singleAxis);
Object pb=pc.newInstance("AF17B6470DCX",new BigDecimal("40000"),BigDecimal.ONE,"P","SLIP-B","SLIP-B#1","실외기",singleAxis);
Class<?> row=Class.forName("com.samhanair.logis.accounting.service.LegacyVerificationChain$Row"); Constructor<?> rc=row.getDeclaredConstructors()[0]; rc.setAccessible(true);
Object ra=rc.newInstance("P","SLIP-A","SLIP-A#2","실외기","AF17B6470DCX","OUTDOOR",false);
Object rb=rc.newInstance("P","SLIP-B","SLIP-B#1","실외기","AF17B6470DCX","OUTDOOR",false);
Class<?> zone=Class.forName("com.samhanair.logis.accounting.service.LegacyVerificationChain$Zone"); Object singleZone=Enum.valueOf((Class)zone,"SINGLE");
Class<?> routed=Class.forName("com.samhanair.logis.accounting.service.LegacyVerificationChain$RoutedRow"); Constructor<?> rrc=routed.getDeclaredConstructors()[0]; rrc.setAccessible(true);
Object rra=rrc.newInstance(ra,singleZone); Object rrb=rrc.newInstance(rb,singleZone); List<Object> all=List.of(rra,rrb);
Method focus=Arrays.stream(svc.getDeclaredMethods()).filter(m->m.getName().equals("findFocusRoutes")).findFirst().orElseThrow(); focus.setAccessible(true);
List<?> matching=(List<?>)focus.invoke(null,all,List.of(pa,pb),axisA);
Class<?> usage=Class.forName("com.samhanair.logis.accounting.service.LegacySetMatcher$Usage"); Constructor<?> uc=usage.getDeclaredConstructors()[0]; uc.setAccessible(true);
Object full=uc.newInstance(1,1); Object unused=uc.newInstance(1,0);
Class<?> chain=Class.forName("com.samhanair.logis.accounting.service.LegacyVerificationChain"); Method ri=Arrays.stream(chain.getDeclaredMethods()).filter(m->m.getName().equals("riUsageDecision")).findFirst().orElseThrow(); ri.setAccessible(true);
Object isolated=ri.invoke(null,rra,List.of(rra),Map.of("SLIP-A#2",full),new BigDecimal("30000"),new BigDecimal("30000"));
Object current=ri.invoke(null,rra,all,Map.of("SLIP-A#2",full,"SLIP-B#1",unused),new BigDecimal("30000"),new BigDecimal("30000"));
System.out.println("Axis A focusRoutes="+matching.size());
System.out.println("Axis A isolated="+isolated);
System.out.println("Axis A with separate Axis B="+current);
/exit
'@
$probe | jshell --class-path $cp
```

출력 원문:

```text
Axis A focusRoutes=1
Axis A isolated=true
Axis A with separate Axis B=false
```

판정: 단가가 다른 B는 A의 `findFocusRoutes`에서 제외돼 별도 화면 집계행인데, 전체 rows를 받은 chain `focusRows`가 B를 다시 끌어와 A를 `true→false`로 바꾼다. 결함 A의 핵심을 축약 없는 명령으로 재확인했다.

## 판정 전 질문 — “이 라운드가 안 본 것이 있나?”

답: **있다.** 다음 표면은 보지 않았고, 이를 “결함 0”으로 적지 않는다.

1. V67 이후 `model_name/category_key`가 실제로 채워진 운영 거래 전수. 공유 DB의 발화 모집단이 0행이라 운영 영향 총 건수를 계수하지 못했다.
2. 실제 전표를 POST/ISSUE하여 데스크톱 배지까지 확인하는 write E2E. read-only/DB mutation 금지 때문에 production compiled class + 실 카탈로그로 재현했다.
3. 현재 다른 PR(#1061)로 배포된 accounting/slip/product 컨테이너의 HTTP 응답 및 라이브 화면. 이 PR의 증거로 사용하지 않았다.
4. accounting-service 전체 suite. R17은 요구된 6개 변경 표면 76개만 캐시 배제 실행했다. 전체 suite는 반복 300초 timeout 이력과 권위 CI 안내에 따라 이번 라운드에서 실행하지 않았다.
5. 결함 A의 PURCHASE_SLIP 및 TAX_INVOICE 변형별 운영 발생 건수. SALES_SLIP 실 사용자 경로 하나가 재현돼 결함 존재 판정에는 충분하지만, 다른 source kind의 총량은 세지 않았다.
6. R16 이전 commit을 checkout한 바이너리 실행. `git` 명령 금지를 지켜, R16 전 값은 R15 원문과 현재 production route 평가 중 첫 route 하나를 대표로 선택하는 동일 연산으로 대조했다. 실 데이터 쪽은 애초 발화 모집단 0이라 전후 모두 관측 0이다.

## R17 최종 판정

### 유일 질문에 대한 답

> **실 사용자 경로로 재현 가능한 결함이 있는가 — 있다. 1건.**

`LegacyVerificationChain.focusRows`가 화면 집계키보다 넓게 같은 거래처·token·kind·branch의 모든 route를 모은다. 이 때문에 실제단가가 달라 **별도 모델별 재검증 행**인 미완성 전표 B의 `used=0/1`이, 정상 완성 전표 A의 `used=1/1` 판정에 들어가 A를 `확인(true) → 불일치(false)`로 바꾼다.

- 최소 사용자 재현: **2전표 / 4원천행**.
- 추가 오판: 정상 완성 세트 A의 **1집계행**.
- 현재 공유 실 DB 관측: **0건(발화 거래 snapshot 0행)**.
- 운영 총 영향: **계수 불가**.
- 원인 위치: R16의 새 false-first aggregate가 아니라, R16이 “아니오”로 제외한 chain 내부 `focusRows`.

### 하위 각도 결론

1. 실 데이터 전후 건수: 발화 모집단 0행, 관측 변경 0건. 정상 0건 주장이 아니라 도달 0이다.
2. R16 `sameAxis` matching 경계: scope/source를 제외한 것이 표시 집계키와 일치해 그 자체의 과잉 결합 결함은 재현되지 않았다.
3. 순서 무관성: 고정 route 결과 집합에서는 정방향/역방향 동일. `M-P-M=false`, `P-M-P-P=false`, `P-P-M=true`.
4. 제외 6곳: 5곳 제외 타당, **`focusRows` 1곳 제외 부당이며 결함 A**.
5. R16 수치: **76 tests / 0 실패·오류·skip**, 값 변경 3케이스 표(1건만 true→false) 모두 재현.

## 수행 규율

- 소스 수정, `git` 명령, Docker 이미지 build/배포/restart, 실 DB mutation, 새 이슈 등록을 하지 않았다.
- Docker는 `samhan-postgres`의 `BEGIN TRANSACTION READ ONLY` 조회에만 사용했다. 서비스 컨테이너를 호출하지 않았다.
- 사용자가 지시한 이 보고서만 작성·append했다. Gradle은 `build/` 산출물만 재생성했다.

### 보고서 저장 확인

실행 명령 원문:

```powershell
$p='docs/dev-reports/2026-08-03-874-r17-reconvergence.md'
$i=Get-Item -LiteralPath $p
$h=Get-FileHash -LiteralPath $p -Algorithm SHA256
"PATH=$($i.FullName)"
"BYTES=$($i.Length)"
"SHA256=$($h.Hash)"
rg -n '^## ①|^## ②|^## ③|^## ④|^## ⑤|^## R17 최종 판정|실 사용자 경로로 재현 가능한 결함이 있는가 — 있다' $p
```

출력 원문(본 저장확인 절 append 직전 snapshot):

```text
PATH=D:\dev\Samhan-Public\.claude\worktrees\w1057\docs\dev-reports\2026-08-03-874-r17-reconvergence.md
BYTES=91511
SHA256=4AB60F64D94997634006CF2F6FABED8401741DA1B3E6658759CBE15701BAC111
61:## ① 실 데이터에서 판정이 바뀌는 건수
194:## ② 결합 경계가 맞는가
313:## ③ 순서 무관성이 실제로 성립하는가
354:## ④ R16이 “아니오”로 분류한 6곳 재검토
930:## ⑤ R16 수치 재현
1316:## R17 최종 판정
1320:> **실 사용자 경로로 재현 가능한 결함이 있는가 — 있다. 1건.**
```

판정: 필수 ①~⑤와 최종 판정이 UTF-8 보고서에 저장됐다.
