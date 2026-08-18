# #874 S1.5 세트 riUsage · 거래처 전역DC R15 재수렴 적대검증

- 검증일: 2026-08-03 (Asia/Seoul)
- 대상: PR #1057 `feat/874-set-riusage-global-dc`
- 요청 기준 HEAD: `4cd9c0505`
- 유일한 질문: **실 사용자 경로로 재현 가능한 결함이 있는가.**
- 규율: 소스·Git·배포 상태 변경 없이 읽기, 조사, 대상 테스트만 수행한다. 각 확인 결과는 확인 직후 이 문서에 누적한다.

## 진행 기록

### 0. 조사 개시

- 판정: 보고서를 조사 전에 생성했다. 아직 구현·레거시·직전 보고서·테스트·실 데이터는 확인하지 않았다.

### 1. 직전 R14 보고서 선행 확인

실행 명령 원문:

```powershell
Get-Content -LiteralPath 'docs\dev-reports\2026-08-03-874-r14-chain-port.md' -Raw -Encoding UTF8
```

출력 원문 중 R15 대조 기준:

```text
## 값 변경 케이스와 레거시 근거
...
| 미완전 `INDOOR` → `AM023TNVDBH1` 상업멀티 전환 → 미완전 `PANEL` | `false` | ... | `true` (`MULTI_RATE`, riUsage 미적용) |
| 미완전 SINGLE 본체 뒤 `운임`/`절삭` | `false` | ... | `true` (`FREIGHT_OR_CUTTING`, 후단 override 없음) |
| 비대상 token `QA797-PART-01`을 catalog `INDOOR`로 둔 뒤 `PANEL` | `false` | ... | `true` (`DEFAULT`, riUsage 미도달) |
...
### 변경 표면 최종 fresh GREEN
...
BUILD SUCCESSFUL in 24s
...
최종 chain 테스트는 5 tests이며, main의 다중 scope 소비량과 accessory의 scope별 판정을 포함한다.
```

판정:

- R14가 값 변경을 주장한 입력은 정확히 3건이다.
- R14가 최종 선택 GREEN을 주장한 대상은 `LegacyVerificationChainTest`, `RiUsageDecisionTest`, `LegacySetMatcherTest`, `GasCategoryAxisTest`, `DiscountRevalidatorTest`, `DailyClosingDetailServiceTest` 6개 클래스다.
- R14 레거시 대응표 L1~L6 및 `Code.js:668-735`를 이후 분기 대조의 기준으로 사용한다. 이 단계는 R14 보고서의 주장만 확인한 것이며 재현 판정은 아직 아니다.

### 2. 저장소 행동 보강 규칙 확인

실행 명령 원문:

```powershell
Get-Content -LiteralPath '.codex\AGENTS.md' -Raw -Encoding UTF8
```

출력 원문 중 적용 규율:

```text
## 4. 사용자(개발책임자) 호칭 / 응대
- 호칭: **"개발책임자"**
- 응답 톤: 짧고 명확. 한국어.
```

판정:

- 이번 요청은 범위·질문·순서·금지 행위가 명확하므로 추가 질문 없이 진행한다.
- 사용자 지시가 우선하므로 코드 수정, Git 명령, 배포 동작, 일반적인 검증 품질 지적은 수행하지 않는다.

### 3. 현재 작업 핸드오프 확인

실행 명령 원문:

```powershell
Get-Content -LiteralPath 'docs\handoff\CURRENT-WORK.md' -Raw -Encoding UTF8
```

출력 원문 중 이번 트랙 관련 부분:

```text
3. 정찰만 완료 5건 착수: `#1061` `#1057` `#1056` `#1045` `#1037`
...
accounting-service 전체 테스트 **여섯 라운드 연속 300초대 timeout** — 권위는 CI
```

판정:

- 핸드오프는 #1057을 후속 착수 트랙으로 표시하고 전체 accounting-service 테스트 timeout 이력을 명시한다.
- 이번 라운드는 사용자 지시대로 전체 suite timeout 시 이를 그대로 기록하고 대상 클래스 결과로 계속 진행한다.

### 4. 하위 작업 규칙 파일 확인

실행 명령 원문:

```powershell
rg --files -g AGENTS.md
```

출력 원문:

```text
AGENTS.md
```

판정: `services/accounting-service` 또는 `tools/legacy-gas` 아래에 추가 `AGENTS.md`는 없다. 루트 및 `.codex/AGENTS.md` 규율만 적용한다.

### 5. 레거시 라우팅·최종 분기 원문 고정

실행 명령 원문:

```powershell
$p = 'tools\legacy-gas\일마감 프로그램\Code.js'; $lines = Get-Content -LiteralPath $p -Encoding UTF8; foreach ($range in @(@(160,190),@(470,505),@(650,745))) { $start=$range[0]; $end=$range[1]; for ($i=$start; $i -le $end; $i++) { '{0,4}: {1}' -f $i,$lines[$i-1] } }
```

출력 원문 중 selector와 15개 분기:

```text
 177: function isTargetModelCode_(code) {
 178:   if (!code) return false;
 179:   var u = String(code).toUpperCase();
 180:   if (/^A[CP]\d{3}/.test(u)) return true;
 181:   if (/^AF\d{2}/.test(u)) return true;
 182:   if (/^AR\d{2}/.test(u)) return true;
 183:   return false;
 483:       var currentZone = 'UNKNOWN';
 484:       var hasSingleMain = false;
 486:       items.forEach(function(item) {
 487:         var t = extractModelToken_(item['품목명']) || clean_item_name_(item['품목명']).toUpperCase();
 488:         var cls = (catalog && catalog.itemClassMap && catalog.itemClassMap[t]) ? catalog.itemClassMap[t] : classifyComp(t);
 490:         if (/^AM/.test(t) && t.length >= 7 && (t[6] === 'X' || t[6] === 'N')) {
 491:           currentZone = 'COMM_MULTI';
 492:         } else if (/^AJ/.test(t) && t.length >= 7 && (t[6] === 'X' || t[6] === 'N')) {
 493:           currentZone = 'HOME_MULTI';
 494:         } else if (isTargetModelCode_(t) && (cls === 'INDOOR' || cls === 'OUTDOOR' || cls === 'SUB_INDOOR')) {
 495:           currentZone = 'SINGLE';
 496:           hasSingleMain = true;
 497:         }
 498:         item._zone = currentZone;
 668:       items.forEach(function(item) {
 669:         if (/(운임|절삭)/.test(item['품목명'])) {
 670:           item['확인'] = true;
 671:         } else if (item._isOld) {
 672:           if (isMultiApplied === false) {
 673:             item['확인'] = true;
 674:           } else {
 675:             var actualRate = Math.round((item['할인율'] || 0) * 100);
 676:             if (/^(AM|NJ|NS|AVX)/.test(item._token)) {
 677:               item['확인'] = (actualRate === 50);
 678:             } else {
 679:               var unitPrice = money_to_int_(item['단가(VAT포함)']);
 680:               item['확인'] = (unitPrice === item._deliveryPrice);
 681:             }
 682:           }
 683:         } else if (/(유연호스|발통세트|일자발|방진가대)/.test(item['품목명']) || /^AXJ/.test(item._token)) {
 684:           if (isMultiApplied === false) {
 685:             item['확인'] = true;
 686:           } else {
 687:             var unitPrice = money_to_int_(item['단가(VAT포함)']);
 688:             item['확인'] = (unitPrice === item._deliveryPrice);
 689:           }
 690:         } else if (item._zone === 'SINGLE') {
 691:           if (!hasSingleMain && (item._cls === 'PANEL' || item._cls === 'REMOTE' || item._cls === 'MATERIAL')) {
 692:             item['확인'] = true;
 693:           } else if (item._cls === 'PANEL' || item._cls === 'REMOTE' || item._cls === 'MATERIAL') {
 694:              var isUsed = (riUsage[item._ri] && riUsage[item._ri].used === riUsage[item._ri].total);
 695:              var unitPrice = money_to_int_(item['단가(VAT포함)']);
 697:              var hasFailedMain = items.some(function(it) {
 698:                return (it._cls === 'INDOOR' || it._cls === 'OUTDOOR') &&
 699:                       (!riUsage[it._ri] || riUsage[it._ri].used !== riUsage[it._ri].total);
 700:              });
 702:              if (isUsed) {
 703:                item['확인'] = true;
 704:              } else if (hasFailedMain) {
 705:                item['확인'] = false;
 706:              } else {
 707:                item['확인'] = (unitPrice === item._deliveryPrice);
 708:              }
 709:           } else if (item._cls === 'INDOOR' || item._cls === 'OUTDOOR' || item._cls === 'SUB_INDOOR') {
 710:              item['확인'] = (riUsage[item._ri] && riUsage[item._ri].used === riUsage[item._ri].total);
 711:           } else {
 712:              item['확인'] = true;
 713:           }
 714:         } else if (item._zone === 'COMM_MULTI' || item._zone === 'HOME_MULTI' || /(멀티|MULTI)/i.test(item['품목명'])) {
 715:           if (isMultiApplied === false) {
 716:              item['확인'] = true;
 717:           } else {
 718:              var actualRate = Math.round((item['할인율'] || 0) * 100);
 719:              var expectRate = null;
 721:              if (item._fixedDc != null) {
 722:                expectRate = Math.round(item._fixedDc * 100);
 723:              } else if (item._zone === 'COMM_MULTI') {
 724:                expectRate = Math.round((discInfo.commRate || 0.45) * 100);
 725:              } else if (item._zone === 'HOME_MULTI') {
 726:                expectRate = Math.round((discInfo.homeRate || 0.45) * 100);
 727:              } else {
 728:                expectRate = 45;
 729:              }
 731:              item['확인'] = (actualRate === expectRate);
 732:           }
 733:         } else {
 734:           item['확인'] = true;
 735:         }
```

판정:

- 최종 우선순위는 `운임/절삭` → old 3갈래 → accessory 2갈래 → SINGLE 5갈래 → multi 2갈래 → default로, R14 대응표의 15개 판정과 일치한다.
- zone은 전표 scope의 입력 순서에 따라 상태를 유지하며 전이한다. `hasSingleMain`도 scope 전체에 누적되는 단일 상태다.
- 이 단계는 비교 기준 원문 고정이며 현행 사슬과의 동일성 판정은 아직 아니다.

### 6. 현행 `LegacyVerificationChain` 원문 확인

실행 명령 원문:

```powershell
$p = 'services\accounting-service\src\main\java\com\samhanair\logis\accounting\service\LegacyVerificationChain.java'; $lines = Get-Content -LiteralPath $p -Encoding UTF8; for ($i=1; $i -le $lines.Count; $i++) { '{0,4}: {1}' -f $i,$lines[$i-1] }
```

출력 원문 중 selector·scope 핵심:

```text
  72:     static List<RoutedRow> route(List<Row> rows) {
  73:         Map<String, Zone> zoneByScope = new LinkedHashMap<>();
  75:         for (Row row : rows) {
  76:             String scope = scopeKey(row);
  77:             Zone zone = zoneByScope.getOrDefault(scope, Zone.UNKNOWN);
  79:             if (isCommercialMultiToken(token)) {
  80:                 zone = Zone.COMM_MULTI;
  81:             } else if (isHomeMultiToken(token)) {
  82:                 zone = Zone.HOME_MULTI;
  83:             } else if (isTargetModelCode(token) && isPresentMain(row.kind())) {
  84:                 zone = Zone.SINGLE;
  86:             zoneByScope.put(scope, zone);
  87:             result.add(new RoutedRow(row, zone));
  93:     static Branch branch(RoutedRow routed, boolean isMultiApplied) {
  97:         if (FREIGHT_OR_CUTTING.matcher(itemName).find()) {
 100:         if (row.oldProduct()) {
 107:         if (ACCESSORY_LABEL.matcher(itemName).find() || token.startsWith("AXJ")) {
 110:         if (routed.zone() == Zone.SINGLE) {
 119:         if (routed.zone() == Zone.COMM_MULTI || routed.zone() == Zone.HOME_MULTI
 123:         return Branch.DEFAULT;
 130:     static Boolean riUsageDecision(RoutedRow focus, List<RoutedRow> rows,
 133:         Branch focusBranch = branch(focus, true);
 135:             return focusRows(focus, rows).stream()
 136:                     .allMatch(row -> fullyConsumed(usage, row.row().sourceKey()));
 145:         Boolean result = Boolean.TRUE;
 146:         for (RoutedRow focusRow : focusRows(focus, rows)) {
 147:             List<RoutedRow> scopeRows = rows.stream()
 148:                     .filter(row -> sameScope(focusRow.row(), row.row()))
 173:     private static List<RoutedRow> focusRows(RoutedRow focus, List<RoutedRow> rows) {
 175:                 .filter(row -> Objects.equals(focus.row().partnerCode(), row.row().partnerCode()))
 176:                 .filter(row -> Objects.equals(focus.row().modelToken(), row.row().modelToken()))
 177:                 .filter(row -> Objects.equals(focus.row().kind(), row.row().kind()))
 178:                 .filter(row -> branch(row, true) == branch(focus, true))
 182:     private static boolean sameScope(Row left, Row right) {
 183:         return Objects.equals(left.partnerCode(), right.partnerCode())
 184:                 && Objects.equals(left.scopeKey(), right.scopeKey());
 228:     private static String scopeKey(Row row) {
 229:         return String.valueOf(row.partnerCode()) + "\u0000" + String.valueOf(row.scopeKey());
```

판정:

- `route`의 zone 상태는 `partnerCode + scopeKey`별로 분리되고 전달된 list 순서대로 전이한다.
- branch의 최상위 if/else-if 순서는 레거시와 같은 형태다.
- 다만 `riUsageDecision`의 `focusRows`는 scope를 필터링하지 않고 같은 거래처·token·kind·branch 행을 모두 묶는다. 이 차이가 사용자에게 잘못된 aggregate 판정을 만드는지는 `MonthEndCloseService` 집계 단위와 실 데이터 영향 건수로 확인해야 하므로 아직 결함으로 판정하지 않는다.

### 7. 실제 일마감 호출 경로 연결 확인

실행 명령 원문:

```powershell
$p='services\accounting-service\src\main\java\com\samhanair\logis\accounting\service\MonthEndCloseService.java'; $lines=Get-Content -LiteralPath $p -Encoding UTF8; foreach($range in @(@(180,340),@(420,545),@(585,700))){for($i=$range[0];$i -le $range[1];$i++){'{0,4}: {1}' -f $i,$lines[$i-1]}}
```

출력 원문 중 사용자 판정 경로:

```text
 239:                 accumulateProduct(byModel, setPool, ti.getPartnerCode(), ti.getTaxInvoiceNo(),
 240:                         ti.getTaxInvoiceNo() + "#" + line.getLineNo(),
 286:             for (SalesAccountingSlipLine line : slip.getLines()) {
 287:                 accumulateSalesLine(byModel, setPool, slip.getPartnerCode(), slip.getSlipNo(),
 288:                         slip.getSlipNo() + "#" + line.getLineNo(), line);
 366:         AxisKey key = axisKey(partnerCode, productName, modelName, categoryKey, actualUnitPrice);
 367:         ModelAccumulator acc = byModel.computeIfAbsent(key,
 373:             setPool.add(new SetPoolLine(ModelTokenExtractor.extractModelTokenOrNull(modelName),
 475:         SetResolution setResolution = resolveMatchedSetNames(setPool, globalDiscountsByPartnerCode);
 477:         List<LegacyVerificationChain.RoutedRow> routedRows = legacyRoutedRows(setPool, chainKinds);
 499:             LegacyVerificationChain.RoutedRow focusRoute = findFocusRoute(routedRows, axisKey);
 507:             LegacyVerificationChain.Branch routeBranch = LegacyVerificationChain.branch(
 508:                     focusRoute == null ? syntheticRoute : focusRoute, true);
 522:             Boolean riUsageVerified = focusRoute == null ? null : LegacyVerificationChain.riUsageDecision(
 523:                     focusRoute, routedRows, setResolution.usage(), e.getValue().effectiveUnitPrice(),
 525:             if (riUsageVerified != null
 526:                     && revalidation.status() == DiscountRevalidator.Status.VERIFIED) {
 527:                 revalidation = revalidation.withVerified(riUsageVerified);
 648:     private static LegacyVerificationChain.RoutedRow findFocusRoute(
 650:         return routedRows.stream()
 651:                 .filter(row -> java.util.Objects.equals(axis.partnerCode(), row.row().partnerCode()))
 652:                 .filter(row -> java.util.Objects.equals(axis.label(), row.row().itemName()))
 653:                 .filter(row -> java.util.Objects.equals(axis.modelToken(), row.row().modelToken()))
 654:                 .findFirst()
```

판정:

- 사용자 화면의 일마감 상품 행은 scope를 포함하지 않는 `AxisKey`로 일 단위 집계된 뒤, 같은 거래처·품명·modelToken 중 **첫 번째 원천 행의 route**를 집계 행 전체의 branch로 사용한다.
- 통합 경로는 `isMultiApplied`를 항상 `true`로 전달한다. false branch들의 실사용 도달 여부는 별도 확인한다.
- `sourceKey`에는 `scope#lineNo`가 들어가지만, 실제 list 입력 순서가 `line_no` 순인지는 repository/association ordering을 확인해야 한다.
- 첫 route 대표화가 레거시의 행별 판정을 사용자 집계 행에서 다르게 만들 수 있으나, 실 데이터에 그런 교차-scope 입력이 있는지 아직 세지 않았으므로 이 단계에서는 결함 후보로만 유지한다.

### 8. 저장소 내 실측 후보 데이터 인벤토리

실행 명령 원문:

```powershell
rg --files docs tools services/accounting-service | rg "(1008|1058|874|일마감|snapshot|ecount|\.csv$|\.xlsx$|\.json$|\.sql$)"
```

출력 원문 중 일마감 원천 후보:

```text
docs\dev-reports\1008-r9-snapshot\single-components-A1-N1737.csv
docs\dev-reports\1008-r9-snapshot\metadata.json
docs\migration\ecount-data\raw\.gitkeep
docs\qa\874-riusage-real-qa\qa-observation.txt
docs\dev-reports\2026-08-03-874-r13-reconvergence.md
docs\dev-reports\2026-08-03-874-r14-chain-port.md
```

판정:

- 저장소에 추적된 실 원천 후보는 R9 고정 스냅샷 CSV와 metadata다.
- `docs/migration/ecount-data/raw/`에는 현재 워크트리 기준 `.gitkeep`만 있어 CURRENT-WORK에 적힌 로컬 xlsx는 이 작업 경로에서 사용할 수 없다.
- 로컬 DB는 핸드오프가 DEV-SEED라고 명시했으므로 곧바로 실 데이터로 간주하지 않는다. 먼저 R9 snapshot의 출처·열·행 수를 확인한다.

### 9. R9 스냅샷 출처·기초 수치 확인

실행 명령 원문:

```powershell
$meta='docs\dev-reports\1008-r9-snapshot\metadata.json'; $csv='docs\dev-reports\1008-r9-snapshot\single-components-A1-N1737.csv'; Get-Content -LiteralPath $meta -Raw -Encoding UTF8; $rows=Import-Csv -LiteralPath $csv -Encoding UTF8; "CSV_ROWS=$($rows.Count)"; "CSV_COLUMNS=$((($rows | Select-Object -First 1).PSObject.Properties.Name) -join '|')"; $rows | Select-Object -First 5 | ConvertTo-Json -Depth 4
```

출력 원문:

```text
"capturedAt": "2026-08-02T22:40:29+09:00",
"sheet": "\uc2f1\uae00 \uad6c성\ud488",
"range": "A1:N1737",
"format": "raw GViz CSV response; no value or row transformation",
"dataRows": 1735,
"columns": 14,
"sha256": "405b2596d61a2a4f3658bc9ed4f75d0b3ba9dfcf7a643e9ce38bbbc88ed0e663",
"measured": {
  "indoorRows": 271,
  "outdoorRows": 271,
  "outdoorLinkMismatches": 0
}
CSV_ROWS=0
CSV_COLUMNS=
Import-Csv : The member " 납품가" is already present.
```

판정:

- 이 CSV는 Google Sheet `싱글 구성품` A1:N1737의 무변환 원문 스냅샷이며 metadata상 데이터 1,735행이다.
- 중복 열명 때문에 PowerShell `Import-Csv`로는 직접 파싱되지 않았다. 이는 제품 결함이 아니며, 원문 열 위치를 보존하는 파서로 재시도한다.
- 이 snapshot은 세트 구성품 카탈로그이지 전표 거래 행 자체인지 아직 확인되지 않았다.

### 10. R9 스냅샷 열 의미 확인

실행 명령 원문:

```powershell
Get-Content -LiteralPath 'docs\dev-reports\1008-r9-snapshot\single-components-A1-N1737.csv' -Encoding UTF8 | Select-Object -First 12
```

출력 원문 첫 4행:

```text
"DVM S_*신통신_[상업용] 품    명","평형","모델명","구분","단위","출고가","수량"," 납품가"," 납품가","소   계"," 모듈조합"," 규격"," 세트"," 구성품 특징"
"360 CST UV","15","AC060CS6PBH1SY","세트","SET","  2,516,800 ","","  1,660,000 ","  1,660,000 ","","","","",""
"360 CST UV 실내기","15","AC060CN6PBH1","실내기","대","  935,000 ","","","  606,000 ","  - ","","싱글 360","AC060CS6PBH1SY","기본"
"360 CST UV 실외기","15","AC060CXAPBH1","실외기","대","  1,331,000 ","","","  910,000 ","  - ","","싱글 360","AC060CS6PBH1SY","기본"
```

판정:

- R9 snapshot은 모델·종류·출고가·납품가·세트 관계를 가진 **실 카탈로그**다.
- 거래처·전표번호·행번호·할인율이 없어 이것만으로 R14 전/후 사용자 판정 변화 건수를 셀 수 없다.
- 따라서 ①은 거래행을 가진 실 DB/실 원본의 존재를 더 확인해야 한다.

### 11. 선행 보고서의 실 DB 근거 검색 1차

실행 명령 원문:

```powershell
rg -n -C 3 "(실 데이터|실데이터|실 DB|실DB|DEV-SEED|dev seed|line_no|docker exec|psql|SELECT|영향 건수|건수|값이 바뀐|3건)" docs/dev-reports/2026-08-03-874-*.md docs/dev-reports/2026-08-02-874-recon.md
```

출력 원문 핵심과 오류:

```text
docs/dev-reports/2026-08-02-874-recon.md:7:- 실 DB `product_db` ... 세트 품목은 활성 344건
docs/dev-reports/2026-08-02-874-recon.md:8:- 실 DB `product_db` ... 구성품 연결은 활성 1,588건
docs/dev-reports/2026-08-02-874-recon.md:17:- 실 DB `dc_config_db.dc_configs`는 활성 210건
rg: docs/dev-reports/2026-08-03-874-*.md: 파일 이름, 디렉터리 이름 또는 볼륨 레이블 구문이 잘못되었습니다. (os error 123)
```

판정:

- 최초 정찰은 product/dc-config 실 DB를 읽었으나, 출력상 거래행 DB 건수는 확인되지 않았다.
- PowerShell에서 `rg`에 전달한 wildcard 경로가 유효하지 않아 2026-08-03 보고서 전수 검색은 실패했다. `-g` glob으로 재시도한다.

### 12. 선행 보고서의 거래행 모집단 확인

실행 명령 원문:

```powershell
rg -n -C 3 -g "2026-08-03-874-*.md" "(실 데이터|실데이터|실 DB|실DB|DEV-SEED|dev seed|line_no|docker exec|psql|SELECT|영향 건수|건수|값이 바뀐|3건)" docs/dev-reports
```

출력 원문 중 거래행 관련 부분:

```text
2026-08-03-874-impl-2.md:109:`[실데이터/로컬 read-only]` accounting 전표 모집단은 #1058 정찰 기준 0행이었다.
2026-08-03-874-impl-3.md:84:`[실데이터/로컬 read-only]` 현재 `accounting_db` 행 수는 tax invoice 22, sales slip 1, purchase slip 0이다.
2026-08-03-874-impl-3.md:90:`[실데이터/로컬 read-only]` 이번 로컬 전표 23행에서 이 판정이 실제 응답에 도달해 `verified`를 바꾼 행은 **0행**이다.
2026-08-03-874-live-qa.md:7:- 데이터 표기 원칙: 로컬 dev 시드이며, 보고서와 캡션에 `[DEV-SEED]`를 명시한다.
2026-08-03-874-live-qa.md:92:- 공유 DB read-only SELECT 결과 `daily_closings`는 총 2건이며 모두 `[DEV-SEED]`의 `2020-01-02` `SALES/TAX_INVOICE` 행이었다.
```

판정:

- 선행 보고서가 `accounting_db`의 23건을 일부 구간에서 “실데이터/로컬 read-only”라고 불렀지만, 같은 트랙의 라이브 QA와 CURRENT-WORK는 공유 로컬 DB가 DEV-SEED라고 명시한다.
- 따라서 현재 DB를 조회해 전·후 건수를 세되, 결과는 **DEV-SEED 관측**으로 표시해야 하며 운영 실데이터 전수로 과장할 수 없다.
- 사용자가 요구한 “실 데이터”를 엄격히 충족하는 거래행 원본은 저장소에서 아직 발견하지 못했다. 단, 사용자가 시간이 부족하면 ①만이라도 완성하라고 했으므로 현재 접근 가능한 read-only DB 모집단을 다시 직접 계수한다.

### 13. read-only 조회 대상 DB 컨테이너 확인

실행 명령 원문:

```powershell
docker ps --format "{{.Names}}|{{.Image}}|{{.Status}}"
```

출력 원문 중 대상:

```text
samhan-product-service|infrastructure-product-service|Up 55 minutes (healthy)
samhan-dc-config-service|infrastructure-dc-config-service|Up 55 minutes (healthy)
samhan-postgres|postgres:16-alpine|Up 55 minutes (healthy)
samhan-accounting-service|infrastructure-accounting-service|Up 55 minutes (healthy)
```

판정: 공유 PostgreSQL과 관련 서비스가 기동 중이다. 이미지 재빌드·서비스 재기동 없이 `samhan-postgres`에 read-only SQL만 실행한다.

### 14. `accounting_db` 거래행 스키마 확인

실행 명령 원문:

```powershell
docker exec samhan-postgres psql -U samhan -d accounting_db -c "BEGIN TRANSACTION READ ONLY; SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND (table_name LIKE '%tax_invoice%' OR table_name LIKE '%sales%slip%' OR table_name LIKE '%purchase%slip%') ORDER BY table_name; SELECT table_name,column_name,data_type FROM information_schema.columns WHERE table_schema='public' AND (table_name LIKE '%tax_invoice%' OR table_name LIKE '%sales%slip%' OR table_name LIKE '%purchase%slip%') ORDER BY table_name,ordinal_position; COMMIT;"
```

출력 원문 중 판정 입력 열:

```text
tax_invoice_lines | line_no       | integer
tax_invoice_lines | item_name     | character varying
tax_invoice_lines | quantity      | numeric
tax_invoice_lines | unit_price    | numeric
tax_invoice_lines | supply_amount | numeric
tax_invoice_lines | vat_amount    | numeric
sales_accounting_slip_lines | line_no       | integer
sales_accounting_slip_lines | product_code  | character varying
sales_accounting_slip_lines | product_name  | character varying
sales_accounting_slip_lines | qty           | numeric
sales_accounting_slip_lines | unit_price    | numeric
sales_accounting_slip_lines | supply_amount | numeric
sales_accounting_slip_lines | vat_amount    | numeric
```

판정:

- 공유 DB의 tax/sales line 테이블에는 현재 HEAD의 사슬 입력에 필요한 `model_name`·`category_key` 열이 없다.
- current service는 tax line에서 `getModelName()/getCategoryKey()`, sales line/할당에서도 같은 값을 읽어 `setPool`을 만든다. 따라서 이 공유 DB의 현재 거래행만으로는 현행 HEAD의 실제 사슬 입력을 완전 복원할 수 없다.
- 이 사실은 ①의 “실 데이터 전·후 전체 계수” 권위가 될 수 없다는 데이터 제약이며, 제품 결함 판정은 아니다.

### 15. HEAD 엔티티와 공유 DB 열 차이 재확인

실행 명령 원문:

```powershell
rg -n -C 4 "class TaxInvoiceLine|modelName|categoryKey|class SalesAccountingSlipLine|class SalesAccountingSlipAllocation" services/accounting-service/src/main/java/com/samhanair/logis/accounting/domain services/accounting-service/src/main/java/com/samhanair/logis/accounting -g "*.java"
```

출력 원문 중 필요한 선언:

```text
SalesAccountingSlipAllocation.java:37:    @Column(name = "model_name", length = 100) private String modelName;
SalesAccountingSlipAllocation.java:38:    @Column(name = "category_key", length = 40) private String categoryKey;
TaxInvoiceLine.java:188:        line.modelName = sourceLine.getModelName();
TaxInvoiceLine.java:189:        line.categoryKey = sourceLine.getCategoryKey();
SalesAccountingSlipCreateAttemptService.java:93:                    slip, lineNo, lr.productCode(), lr.productName(), lineAxis.modelName(),
SalesAccountingSlipCreateAttemptService.java:94:                    lineAxis.categoryKey(),
```

판정: HEAD는 거래행 snapshot에 `model_name/category_key`를 보존하는 계약이다. 공유 DB 스키마가 그 열을 아직 갖지 않아 DB의 기존 23건은 HEAD의 사슬을 실제 API 그대로 재생할 수 있는 입력이 아니다.

### 16. 워크트리 전체 거래 원본 파일 재검색

실행 명령 원문:

```powershell
rg --files -g "*.xlsx" -g "*.xls" -g "*.csv" -g "*.tsv" | Sort-Object
```

출력 원문 중 #874/#1008 관련 파일:

```text
docs\dev-reports\1008-r9-snapshot\single-components-A1-N1737.csv
services\accounting-service\src\test\resources\ecount-raw-fixtures\voucher-sales.csv
services\accounting-service\src\test\resources\fixtures\mig4-sales-slip-line.csv
services\accounting-service\src\test\resources\fixtures\mig4-tax-invoice.csv
```

판정:

- #874/#1008용으로 보존된 비-fixture 파일은 실 카탈로그 snapshot 한 개뿐이다.
- 나머지 accounting CSV/XLSX는 테스트 fixture이므로 “실 데이터 전·후 건수”로 사용하지 않는다.

### 16-1. 공유 DB 거래행 실제 규모 재계수

실행 명령 원문:

```powershell
docker exec samhan-postgres psql -U samhan -d accounting_db -c "BEGIN TRANSACTION READ ONLY; SELECT 'tax_invoices' AS src, COUNT(*) AS headers, COUNT(*) FILTER (WHERE status='ISSUED') AS eligible FROM tax_invoices WHERE is_deleted=false UNION ALL SELECT 'sales_slips', COUNT(*), COUNT(*) FILTER (WHERE status='POSTED') FROM sales_accounting_slips WHERE is_deleted=false UNION ALL SELECT 'purchase_slips', COUNT(*), COUNT(*) FILTER (WHERE status='POSTED') FROM purchase_accounting_slips WHERE is_deleted=false; SELECT 'tax_lines' AS src, COUNT(*) AS lines, COUNT(*) FILTER (WHERE item_name ~* '(AC|AP|AR|AF|AM|AJ|AXJ|PC|AWR|ARR)[A-Z0-9-]{4,}') AS token_like FROM tax_invoice_lines WHERE is_deleted=false UNION ALL SELECT 'sales_lines', COUNT(*), COUNT(*) FILTER (WHERE product_name ~* '(AC|AP|AR|AF|AM|AJ|AXJ|PC|AWR|ARR)[A-Z0-9-]{4,}' OR product_code ~* '^(AC|AP|AR|AF|AM|AJ|AXJ|PC|AWR|ARR)[A-Z0-9-]{4,}') FROM sales_accounting_slip_lines WHERE is_deleted=false UNION ALL SELECT 'purchase_lines', COUNT(*), COUNT(*) FILTER (WHERE product_name ~* '(AC|AP|AR|AF|AM|AJ|AXJ|PC|AWR|ARR)[A-Z0-9-]{4,}' OR product_code ~* '^(AC|AP|AR|AF|AM|AJ|AXJ|PC|AWR|ARR)[A-Z0-9-]{4,}') FROM purchase_accounting_slip_lines WHERE is_deleted=false; ... COMMIT;"
```

출력 원문 집계:

```text
      src       | headers | eligible
----------------+---------+----------
 tax_invoices   |      12 |        9
 sales_slips    |    2512 |     2512
 purchase_slips |      35 |       35

      src       | lines | token_like
----------------+-------+------------
 tax_lines      |    15 |          1
 sales_lines    | 10290 |       9544
 purchase_lines |    35 |          0
```

출력 원문 대표 거래행:

```text
2026-05-01-006 | 1 | MIG4 | AC110BN4PBH1 [BN프리미엄 실내기] [냉난방 4w 삼상] | 1.000 | 558182.00 | 558182.00 | 55818.00
2026-05-01-006 | 2 | MIG4 | AC110BXAPHH3 [BX프리미엄 3상실외기] [​]          | 1.000 | 838182.00 | 838182.00 | 83818.00
2026-05-01-006 | 5 | MIG4 | PC4NUFK1NW (WIFI판넬) [​]                         | 2.000 | 116364.00 | 232727.00 | 23273.00
20260511-57    | 2 | MIG4 | AM140AXVGHH1 [S2 표준형] [S2 표준형]               | 1.000 | 4473200.00 | 4473200.00 | 447320.00
```

판정:

- 선행 보고서의 23건 기준은 현재 공유 DB 상태와 맞지 않는다. 현재에는 매출전표 2,512건/10,290행이 있고 9,544행이 모델 token을 품명에 가진다.
- 데이터는 `MIG4`·`MIGRATION` 표기가 대부분인 이관 거래행과 QA/DEV 행이 섞인 로컬 공유 DB다. 운영 원본이라고 단정할 수는 없지만, 단위 fixture보다 실제 사용자 일마감 조회 경로에 가까운 현존 거래 모집단이다.
- ①의 전·후 계수는 이 2,512개 POSTED 매출전표를 대상으로 수행하되 결과에 **로컬 이관 DB**라고 명시한다.

### 17. 레거시 원천 위치 확인

실행 명령 원문:

```powershell
rg -n -C 3 "(openById|getActiveSpreadsheet|getActive|getSheetByName|SpreadsheetApp|spreadsheetId|SHEET|시트|ECOUNT|이카운트)" "tools/legacy-gas/일마감 프로그램/Code.js"
```

출력 원문:

```text
8:const SOURCE_SHEET_URL = 'https://docs.google.com/spreadsheets/d/<SHEET_ID>/edit';
217:  var ss = SpreadsheetApp.openByUrl(SOURCE_SHEET_URL);
218-  var targetName = '싱글 구성품' + (suffix || '');
219:  var sh = ss.getSheetByName(targetName) || ss.getSheetByName('싱글 구성품');
272:  var ss = SpreadsheetApp.openByUrl(SOURCE_SHEET_URL);
```

판정:

- 공개 snapshot과 레거시 카탈로그는 같은 Google Sheet에서 왔다.
- 이 Sheet는 구성품·단가 권위이며, 최종 판정 대상 거래행은 별도 Notion/이카운트 입력 경로에서 온다. 저장소에는 그 거래행 snapshot이 없다.

### 18. R14 이전(R13) 판정 구현 고정

실행 명령 원문:

```powershell
$p='services\accounting-service\src\main\java\com\samhanair\logis\accounting\service\RiUsageDecision.java'; $lines=Get-Content -LiteralPath $p -Encoding UTF8; for($i=1;$i -le $lines.Count;$i++){'{0,4}: {1}' -f $i,$lines[$i-1]}; Get-Content -LiteralPath 'docs\dev-reports\2026-08-03-874-r13-reconvergence.md' -Raw -Encoding UTF8
```

출력 원문 중 R13 알고리즘·전제:

```text
  20:         List<Row> focusRows = rows.stream().filter(row -> focusToken.equals(row.modelToken())
  25:         if (isMain(focusKind)) {
  26:             return focusRows.stream().allMatch(row -> fullyConsumed(usage, row.sourceKey()));
  32:         List<Boolean> perScope = focusRows.stream().map(Row::scopeKey).distinct()
  53:         boolean singleZone = false;
  55:         for (Row row : rows) {
  56:             if (isPresentMain(row.kind())) {
  57:                 singleZone = true;
  65:             if (!singleZone || !hasPresentMain) {
  66:                 rowResult = Boolean.TRUE;
  67:             } else if (fullyConsumed(usage, row.sourceKey())) {
  70:             } else if (hasFailedMain) {
  72:                 rowResult = Boolean.FALSE;
...
R13 §5.5: 현재 제품 계약에서는 변화 가능한 축이 아니라 `true` 상수다.
R13 §12: 도달 가능한 결함은 총 **3건**이다.
```

판정:

- R14 전 비교기는 현재 보존된 `RiUsageDecision`의 kind 기반 `UNKNOWN→SINGLE` 단방향 판정과 선행 `DiscountRevalidator` 결과를 결합한 R13 구조로 정의할 수 있다.
- `isMultiApplied=true`는 R13 당시 현대 제품 계약의 고정 전제였으므로 ① 전·후 계수에도 true를 사용한다.
- R14의 “값이 바뀐 3건”은 실 DB에서 발견한 3행이 아니라 R13이 source-level synthetic 입력으로 재현한 세 유형이다. ④에서 그 세 fixture를 직접 실행해 별도로 재현한다.

### 21. R14 신규 chain 테스트 표면 확인

실행 명령 원문:

```powershell
$p='services\accounting-service\src\test\java\com\samhanair\logis\accounting\service\LegacyVerificationChainTest.java'; $lines=Get-Content -LiteralPath $p -Encoding UTF8; for($i=1;$i -le $lines.Count;$i++){'{0,4}: {1}' -f $i,$lines[$i-1]}
```

출력 원문 중 테스트 목록:

```text
12:     @Test
13:     void portsEveryLegacyBranchAndKeepsOrderedZoneTransitions() {
53:     @Test
54:     void targetPredicateAndZoneAreRequiredBeforeRiUsageCanRun() {
78:     @Test
79:     void frontBranchesProduceTheirOwnResultAndNeverReceiveRiUsageOverride() {
110:    @Test
111:    void oldBranchesUseLegacyRateOrDeliveryComparison() {
129:    @Test
130:    void mainRiUsageRetainsAllScopesWhileAccessoryDecisionRemainsPerScope() {
```

판정:

- R14 최종 보고서의 “최종 chain 테스트는 5 tests” 주장은 파일 원문과 일치한다.
- 첫 테스트는 여러 branch를 한 목록에서 검사하지만 레거시 15 leaf 각각을 독립 입력/경계로 출력하지는 않는다. 이는 검증 품질 지적이 아니라, 사용자 지시 ②를 별도 직접 대조해야 하는 이유다.

### 22. production class 직접 분기 프로브 실행 환경 확인

실행 명령 원문:

```powershell
"MAIN_CLASSES=$(Test-Path -LiteralPath 'services\accounting-service\build\classes\java\main')"; jshell --version
```

출력 원문:

```text
MAIN_CLASSES=True
jshell 17.0.19
```

판정: 소스나 테스트 파일을 추가하지 않고 컴파일된 production `LegacyVerificationChain`을 reflection으로 호출할 수 있다.

### 23. 15 leaf·경계 production class 1차 프로브

실행 명령 원문: PowerShell here-string으로 reflection 프로브를 `jshell --class-path services\accounting-service\build\classes\java\main`에 전달했다. 프로브는 L1~L6의 15 leaf와 중첩 경계 E1~E5를 출력하며 파일을 생성하지 않는다.

출력 원문:

```text
L1|legacy=FREIGHT_TRUE|expected=FREIGHT_OR_CUTTING|actual=OLD_DELIVERY|decision=null
L2a|legacy=OLD_NOT_MULTI_TRUE|expected=ALWAYS_TRUE|actual=ALWAYS_TRUE|decision=null
L2b|legacy=OLD_RATE_50|expected=OLD_RATE_50|actual=OLD_RATE_50|decision=null
L2c|legacy=OLD_DELIVERY|expected=OLD_DELIVERY|actual=OLD_DELIVERY|decision=null
L3a|legacy=ACCESSORY_NOT_MULTI_TRUE|expected=ALWAYS_TRUE|actual=ALWAYS_TRUE|decision=null
L3b|legacy=ACCESSORY_DELIVERY|expected=ACCESSORY_DELIVERY|actual=ACCESSORY_DELIVERY|decision=null
L4a|legacy=SINGLE_NO_MAIN_TRUE|expected=SINGLE_ACCESSORY|actual=SINGLE_ACCESSORY|decision=true
L4b|legacy=SINGLE_ACCESSORY_USED_TRUE|expected=SINGLE_ACCESSORY|actual=SINGLE_ACCESSORY|decision=true
L4c|legacy=SINGLE_ACCESSORY_FAILED_MAIN_FALSE|expected=SINGLE_ACCESSORY|actual=SINGLE_ACCESSORY|decision=false
L4d|legacy=SINGLE_ACCESSORY_DELIVERY_FALSE|expected=SINGLE_ACCESSORY|actual=SINGLE_ACCESSORY|decision=false
L4e|legacy=SINGLE_MAIN_UNUSED_FALSE|expected=SINGLE_MAIN|actual=SINGLE_MAIN|decision=false
L4f|legacy=SINGLE_OTHER_TRUE|expected=SINGLE_DEFAULT|actual=SINGLE_DEFAULT|decision=true
L5a|legacy=MULTI_NOT_APPLIED_TRUE|expected=ALWAYS_TRUE|actual=ALWAYS_TRUE|decision=null
L5b|legacy=MULTI_RATE|expected=MULTI_RATE|actual=MULTI_RATE|decision=null
L6|legacy=DEFAULT_TRUE|expected=DEFAULT|actual=DEFAULT|decision=null
--BOUNDARIES--
E1 freight>old>accessory>multi|zone=COMM_MULTI|actual=OLD_RATE_50
E2 old>accessory>SINGLE/multi|zone=SINGLE|actual=OLD_DELIVERY
E3 accessory>SINGLE|zone=SINGLE|actual=ACCESSORY_DELIVERY
E4 SINGLE>multi-label|zone=SINGLE|actual=SINGLE_DEFAULT
E5 later-target-main switches multi-to-SINGLE|zones=COMM_MULTI->SINGLE|actual=SINGLE_MAIN
```

판정:

- 1차 프로브에서는 L1/E1이 소스 원문(`FREIGHT_OR_CUTTING` 최우선)과 다르게 old branch를 골랐다.
- 이는 현재 source와 정면 충돌하므로 곧바로 제품 결함으로 판정하지 않는다. `build/classes`가 현 HEAD보다 오래된 stale 산출물일 가능성을 제거하기 위해 `compileJava`를 fresh 실행한 뒤 동일 프로브를 재실행한다.

### 24. production class fresh 재컴파일

실행 명령 원문:

```powershell
.\gradlew.bat -p services/accounting-service compileJava --rerun-tasks --no-daemon
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

BUILD SUCCESSFUL in 34s
7 actionable tasks: 7 executed
```

판정: current source를 build/classes에 fresh 반영했다. 1차 프로브의 L1/E1 차이가 stale 산출물 때문인지 동일 입력으로 재검증한다.

### 25. fresh class 2차 동일 프로브

실행 명령 원문: §23과 동일한 reflection `jshell` 프로브.

출력 원문 중 차이:

```text
L1|legacy=FREIGHT_TRUE|expected=FREIGHT_OR_CUTTING|actual=OLD_DELIVERY|decision=null
...
E1 freight>old>accessory>multi|zone=COMM_MULTI|actual=OLD_RATE_50
```

판정:

- fresh compile 뒤에도 JShell 표준입력으로 직접 넣은 한글 `운임`만 매칭되지 않았다. 나머지 14 leaf와 E2~E5는 예상 branch와 일치한다.
- source와 JUnit fixture 모두 한글 literal을 사용하므로, PowerShell→native stdin의 문자 인코딩을 먼저 배제해야 한다. 다음 프로브에서는 한글을 ASCII Java Unicode literal로 구성하고 pattern·입력 code point도 출력한다. 아직 제품 결함으로 세지 않는다.

### 26. L1/E1 한글 stdin 인코딩 배제

실행 명령 원문: §23 reflection 프로브에서 입력 `운임`을 JShell ASCII literal `\uC6B4\uC784`로 구성하고 pattern·code point·분기를 출력했다.

출력 원문:

```text
input.codepoints=[c6b4, c784]
pattern=(운임|절삭)
L1-unicode|expected=FREIGHT_OR_CUTTING|actual=FREIGHT_OR_CUTTING
E1-unicode freight>old>accessory>multi|actual=FREIGHT_OR_CUTTING
```

판정:

- L1과 freight/old/accessory/multi 동시참 경계 E1은 production class에서 레거시처럼 최상위 `FREIGHT_OR_CUTTING`을 고른다.
- §23·§25의 L1 차이는 PowerShell→JShell 한글 stdin 변환 문제였고 실 사용자 결함이 아니다.
- 이 보정까지 포함하면 15 leaf의 branch/결정 결과와 E1~E5 우선순위는 레거시와 모두 일치한다. 다음은 chain API가 아닌 실제 `MonthEndCloseService` 통합 입력이 다른 branch를 고르는 경우를 확인한다.

### 27. branch 결과의 사용자 표시 결합 규칙 확인

실행 명령 원문:

```powershell
$p='services\accounting-service\src\main\java\com\samhanair\logis\accounting\service\DiscountRevalidator.java'; $lines=Get-Content -LiteralPath $p -Encoding UTF8; foreach($range in @(@(1,220),@(220,360))){for($i=$range[0];$i -le [Math]::Min($range[1],$lines.Count);$i++){'{0,4}: {1}' -f $i,$lines[$i-1]}}
```

출력 원문 중 결과 선택:

```text
  24:  * <p><b>감사 단위</b>: 판정은 ... 같은 모델의 하루치 라인을 합산한 평균 유효단가로 1회 판정한다
 119:         return switch (branch) {
 120:             case FREIGHT_OR_CUTTING, ALWAYS_TRUE ->
 121:                     verified(true, null, actualRate, releasePrice, effectiveDeliveryPrice);
 126:             case OLD_DELIVERY, ACCESSORY_DELIVERY, SINGLE_ACCESSORY ->
 127:                     verified(integerWonEquals(effectiveUnitPrice, effectiveDeliveryPrice),
 129:             case MULTI_RATE -> {
 138:                 yield verified(integerEquals(actualRate, expectedRate), expectedRate, actualRate,
 141:             case SINGLE_DEFAULT, DEFAULT, SINGLE_MAIN -> revalidate(...)
```

판정:

- 실제 화면의 `verified`는 source row별이 아니라 같은 `AxisKey`의 하루 집계에 선택 branch 하나를 적용한다.
- 따라서 동일 집계키에 서로 다른 legacy branch의 원천 행이 섞이면 `findFirst()`가 어느 branch를 대표로 잡는지가 사용자 결과를 바꿀 수 있다. 이 후보를 동일 두 scope의 순서만 뒤집어 직접 실행한다.

### 28. 전역DC production probe 입력 계약 확인

실행 명령 원문:

```powershell
$p='services\accounting-service\src\main\java\com\samhanair\logis\accounting\service\DiscountRevalidator.java'; $lines=Get-Content -LiteralPath $p -Encoding UTF8; for($i=350;$i -le $lines.Count;$i++){'{0,4}: {1}' -f $i,$lines[$i-1]}
```

출력 원문:

```text
363:         public static GlobalDiscount found(BigDecimal homeRate, BigDecimal commercialRate) {
364:             return found(homeRate, commercialRate, null, null, null, null, null, null);
432:     public record Revalidation(
433:             Boolean verified,
434:             Integer expectedRate,
435:             Integer actualRate,
```

판정: `home=45%`, `commercial=48%`, `release=100000`, 실제 VAT 포함 단가 `52000`을 주면 COMM_MULTI의 production 결과는 기대 48%/실제 48%/`verified=true`로 직접 확인할 수 있다.

### 29. 동일 집계키·상이 branch 두 scope 1차 프로브

실행 명령 원문: production `route`, `branch`, `riUsageDecision`, `revalidateByLegacyBranch`를 reflection으로 호출해 동일 panel 집계키의 multi scope와 SINGLE scope 순서를 뒤집었다.

출력 원문:

```text
legacy D-M panel|branch=MULTI_RATE|baseVerified=true
legacy D-S panel|branch=SINGLE_ACCESSORY|riUsage=false
Exception java.lang.NullPointerException
  at java.util.List.of(...)
visible final multi-first=true; visible final single-first=false
```

판정:

- 두 source scope 자체는 production chain에서 서로 다른 branch/result를 낸다: D-M은 `MULTI_RATE/true`, D-S는 `SINGLE_ACCESSORY/false`.
- 현재 집계 출력 포맷을 만들 때 `List.of`에 null(`expectedRate` 또는 `riUsage`)을 넣어 프로브가 NPE로 중단됐다. 마지막 final 문구는 계산 출력이 아니라 스크립트 상수이므로 증거로 사용하지 않는다.
- null 허용 출력으로 고쳐 실제 현재 결과를 다시 받는다. 제품 소스는 수정하지 않는다.

### 30. 결함 후보 A 재현 — 같은 집계키의 scope별 branch를 첫 행 하나로 대표

실행 명령 원문: §29 프로브를 null 허용 문자열 출력으로 재실행했다. production `LegacyVerificationChain`과 `DiscountRevalidator`만 호출했으며 파일/DB를 수정하지 않았다.

출력 원문:

```text
legacy D-M=MULTI_RATE/true
legacy D-S=SINGLE_ACCESSORY/false
current multi-first=branch=MULTI_RATE|zone=COMM_MULTI|base=true|expected=48|actual=48|ri=null|final=true
current single-first=branch=SINGLE_ACCESSORY|zone=SINGLE|base=false|expected=null|actual=48|ri=false|final=false
```

판정:

- 동일 거래처·동일 품명 `PANEL`·동일 token `PC1BWCK3NW`·동일 실제단가 52,000원인 두 scope를 구성했다.
  - D-M: 앞 행 `AM1234X`로 `COMM_MULTI`; 전역DC 48%와 실제 48%가 맞아 `true`.
  - D-S: 앞 행 `AC023CN1DBC1`로 `SINGLE`; 본체와 panel이 미소비라 `false`.
- 레거시는 scope별로 서로 다른 branch/result를 고른다. 현행은 `AxisKey`에서 scope를 버리고, `findFocusRoute(...).findFirst()`의 첫 panel route 하나를 하루 집계 행 전체에 적용한다.
- 같은 사용자 데이터라도 D-M scope가 먼저면 화면 `verified=true`, D-S scope가 먼저면 `verified=false`다. 즉 **branch 선택이 scope별 레거시 값이 아니라 비결정적인 첫 행에 종속**된다.
- 영향 건수(최소 재현): 원천 2전표/4행 중 동일 panel 원천 2행이 화면 1행으로 집계되고, 그 **사용자 표시 1행의 확인값이 true↔false로 뒤집힌다**. 현 로컬 이관 DB에서는 snapshot 도달 0이라 과거 발생 건수는 0관측이다.
- 실제 사용자 경로 도달성은 repository가 날짜의 여러 전표를 한 목록으로 가져와 `byModel`로 합치는 코드(`MonthEndCloseService:260-292,366-375,479-528`)로 성립한다. 다음 단계에서 repository/association 정렬과 `line_no`를 확인해 재현 순서를 확정한다.

### 31. 결함 A 단일 전표 최소 재현 — 같은 panel이 zone 전환 앞뒤에 존재

실행 명령 원문: 같은 production reflection 프로브로 한 scope의 행 순서만 `PANEL→MAIN→PANEL`과 `MAIN→PANEL→PANEL`로 바꾸고, panel 단가=납품가 70,000원을 사용했다.

출력 원문:

```text
legacy before-main panel=DEFAULT/true
legacy after-main panel=SINGLE_ACCESSORY/false
current order PANEL,MAIN,PANEL=focusBranch=DEFAULT|base=true|ri=null|final=true
current order MAIN,PANEL,PANEL=focusBranch=SINGLE_ACCESSORY|base=true|ri=false|final=false
```

판정:

- 한 전표에서 같은 panel을 target main 앞뒤에 한 번씩 두면 레거시는 첫 panel `DEFAULT/true`, 둘째 panel `SINGLE_ACCESSORY/false`를 각각 고른다.
- 현행 일마감은 둘을 같은 `AxisKey` 1행으로 합치고 첫 panel의 branch만 사용한다. `PANEL→MAIN→PANEL`이면 뒤의 실제 실패가 가려져 화면은 `true`; `MAIN→PANEL→PANEL`이면 `false`다.
- 이것은 두 전표 cross-scope가 없어도 사용자가 판매전표 한 장의 행 순서로 재현할 수 있는 결함이다. 최소 영향은 1전표/3원천행 중 panel 2행이 합쳐진 **일마감 표시 1행 오판정**이다.

## ② 분기 선택 대조 — 레거시 15 leaf와 사슬

실행 명령 원문:

```text
§23의 reflection JShell 15-leaf/E1~E5 프로브
§26의 한글 Unicode code-point 보정 프로브
§30의 동일 집계키·상이 scope branch 프로브
§31의 단일 scope zone 전환 앞뒤 동일 panel 프로브
```

출력 원문 요약표:

| ID | 레거시 leaf | production chain | 결과 |
|---|---|---|---|
| L1 | 운임/절삭 → true | `FREIGHT_OR_CUTTING` | 일치 |
| L2a | old + multi 미적용 → true | `ALWAYS_TRUE` | 일치 |
| L2b | old + AM/NJ/NS/AVX → 50% | `OLD_RATE_50` | 일치 |
| L2c | old + 기타 → 납품가 | `OLD_DELIVERY` | 일치 |
| L3a | accessory + multi 미적용 → true | `ALWAYS_TRUE` | 일치 |
| L3b | accessory + multi 적용 → 납품가 | `ACCESSORY_DELIVERY` | 일치 |
| L4a | SINGLE accessory + main 없음 → true | `SINGLE_ACCESSORY`, decision true | 일치(수동 state; 정상 route에서는 도달 불가) |
| L4b | SINGLE accessory 자기 완전 → true | `SINGLE_ACCESSORY`, decision true | 일치 |
| L4c | SINGLE accessory 미완전 + failed main → false | `SINGLE_ACCESSORY`, decision false | 일치 |
| L4d | SINGLE accessory fallback → 납품가 | `SINGLE_ACCESSORY`, 단가 decision | 일치 |
| L4e | SINGLE main → 자기 riUsage | `SINGLE_MAIN`, decision false fixture | 일치 |
| L4f | SINGLE 기타 → true | `SINGLE_DEFAULT`, decision true | 일치 |
| L5a | multi + multi 미적용 → true | `ALWAYS_TRUE` | 일치 |
| L5b | multi + multi 적용 → rate | `MULTI_RATE` | 일치 |
| L6 | fallback → true | `DEFAULT` | 일치 |

경계 출력 원문:

```text
E1 freight>old>accessory>multi ... actual=FREIGHT_OR_CUTTING
E2 old>accessory>SINGLE/multi ... actual=OLD_DELIVERY
E3 accessory>SINGLE ... actual=ACCESSORY_DELIVERY
E4 SINGLE>multi-label ... actual=SINGLE_DEFAULT
E5 later-target-main switches multi-to-SINGLE ... actual=SINGLE_MAIN
```

판정:

- `LegacyVerificationChain.branch`에 **한 RoutedRow씩** 넣으면 15 leaf 및 동시참 경계의 우선순위는 레거시와 같다.
- 그러나 실제 사용자 경로는 같은 하루 집계키의 여러 RoutedRow 중 `findFirst()` 한 건만 고른다. zone 전환 전후 동일 제품처럼 레거시 branch가 서로 다른 원천 행을 집계하면 첫 행 branch만 남는다.
- 따라서 질문 “레거시와 사슬이 다른 분기를 고르는 입력이 있는가”의 답은 **있다**. leaf 함수 자체가 아니라 `MonthEndCloseService.findFocusRoute` 통합에서 발생하며, §31의 한 전표 3행으로 `true↔false`가 재현된다.

### 32. repository·association 원천 순서 확인

실행 명령 원문:

```powershell
$files=@('...SalesAccountingSlipRepository.java','...PurchaseAccountingSlipRepository.java','...TaxInvoiceRepository.java','...SalesAccountingSlip.java','...PurchaseAccountingSlip.java','...TaxInvoice.java'); foreach($p in $files){ ... `findBySlipDateAndStatusWithLines|findIssuedInRange|ORDER BY|@OrderBy` 주변 출력 ... }
```

출력 원문:

```text
SalesAccountingSlipRepository.java:27: SELECT DISTINCT s FROM SalesAccountingSlip s
SalesAccountingSlipRepository.java:30: ORDER BY s.slipNo ASC
SalesAccountingSlip.java:73: @OneToMany(mappedBy = "slip", cascade = CascadeType.ALL, orphanRemoval = true)
SalesAccountingSlip.java:74: @OrderBy("lineNo ASC")

PurchaseAccountingSlipRepository.java:30: ORDER BY s.slipNo ASC
PurchaseAccountingSlip.java:73: @OrderBy("lineNo ASC")

TaxInvoiceRepository.java:109: ORDER BY t.supplyDate ASC, t.taxInvoiceNo ASC
TaxInvoice.java:193: @OrderBy("lineNo ASC")
```

판정:

- 판매·매입 전표와 세금계산서 모두 child lines를 `lineNo ASC`로 로드한다. header도 전표번호 오름차순이다.
- `MonthEndCloseService`는 이 순서로 `setPool`과 `LinkedHashMap byModel`을 채운다. 따라서 `LegacyVerificationChain.route`에 들어가는 scope 내부 행 순서는 실제 `line_no` 순서를 계승하며 뒤집히지 않는다.
- §31의 `PANEL(line_no=1)→MAIN(2)→PANEL(3)` 재현은 production loader에서도 같은 순서로 들어간다. 즉 결함 A는 테스트 list 순서에만 존재하는 것이 아니라 실제 사용자 전표 행 순서로 도달한다.

### 33. interleaved scope route 직접 검증

실행 명령 원문: production `route`에 A/B scope 행을 `A1,B1,A2,B2,B3` 순으로 섞어 reflection 호출했다.

출력 원문:

```text
A#A1|zone=SINGLE|branch=SINGLE_MAIN
B#B1|zone=UNKNOWN|branch=DEFAULT
A#A2|zone=SINGLE|branch=SINGLE_ACCESSORY
B#B2|zone=COMM_MULTI|branch=MULTI_RATE
B#B3|zone=COMM_MULTI|branch=MULTI_RATE
```

판정:

- route 내부 상태는 interleaved 입력에서도 scope A/B를 분리한다. A의 SINGLE이 B1을 오염시키지 않고, B의 COMM_MULTI도 A2에 역류하지 않는다.
- `route` 자체에서 scope 혼합이나 행 순서 역전은 재현되지 않았다.
- 결함 A는 route 전이의 순서 오류가 아니라, 올바르게 생성된 여러 RoutedRow를 집계 후 첫 route 하나로 축약하는 단계에서 발생한다.

## ③ 행 순서와 scope 판정

- `line_no ASC` 계승: 확인됨.
- header 순서: 전표번호 오름차순으로 결정적이다.
- scope별 zone 상태 격리: production probe에서 확인됨.
- 순서가 뒤바뀌는 입력: 발견하지 못함.
- 실사용 결함: 순서는 보존되지만 동일 집계키의 **전환 전/후 두 행 중 첫 행만 남아**, 보존된 순서가 오히려 최종 branch를 true↔false로 좌우한다(§31).

### 19. 기존 이관 거래행의 HEAD 입력 도달성 확인

실행 명령 원문:

```powershell
rg -n -C 5 "(model_name|category_key)" services/accounting-service/src/main/resources/db/migration -g "*.sql"
```

출력 원문:

```text
V67__preserve_sales_category_axis.sql-1--- #991 슬2: 판매 원천의 모델/카테고리 축을 회계 문서 snapshot에 보존한다.
V67__preserve_sales_category_axis.sql-2--- 기존 회계 행은 backfill하지 않는다. null은 A-2 UNKNOWN 표시 대상이다.
V67__preserve_sales_category_axis.sql:4:    ADD COLUMN IF NOT EXISTS model_name VARCHAR(100),
V67__preserve_sales_category_axis.sql:5:    ADD COLUMN IF NOT EXISTS category_key VARCHAR(40);
V67__preserve_sales_category_axis.sql:8:    ADD COLUMN IF NOT EXISTS model_name VARCHAR(100),
V67__preserve_sales_category_axis.sql:9:    ADD COLUMN IF NOT EXISTS category_key VARCHAR(40);
V67__preserve_sales_category_axis.sql:12:    ADD COLUMN IF NOT EXISTS model_name VARCHAR(100),
V67__preserve_sales_category_axis.sql:13:    ADD COLUMN IF NOT EXISTS category_key VARCHAR(40);
```

판정:

- 공유 DB의 기존 10,290개 매출전표 라인은 V67 적용 후에도 `model_name/category_key=NULL`로 남도록 명시돼 있다.
- `MonthEndCloseService.accumulateProduct`는 `modelName`이 null/blank면 `setPool`에 넣지 않으므로 이 기존 거래행들은 R14 전·후 모두 새 사슬에 도달하지 않는다.
- 따라서 현존 이관 DB 모집단의 R14 전·후 변경 수는 코드 계약상 0행이다. DB 버전과 사슬 도달 가능 신규 snapshot 행 수를 SQL로 직접 확인한다.

### 20. 공유 DB 버전·이관 행 생성 시점 확인

실행 명령 원문:

```powershell
docker exec samhan-postgres psql -U samhan -d accounting_db -c "BEGIN TRANSACTION READ ONLY; SELECT installed_rank,version,description,success FROM flyway_schema_history ORDER BY installed_rank DESC LIMIT 10; SELECT COUNT(*) AS sales_lines_total, MIN(created_at) AS first_created, MAX(created_at) AS last_created FROM sales_accounting_slip_lines WHERE is_deleted=false; SELECT COUNT(*) AS allocations_total FROM sales_accounting_slip_allocations WHERE is_deleted=false; COMMIT;"
```

출력 원문:

```text
 installed_rank | version | description                                 | success
----------------+---------+---------------------------------------------+--------
             66 | 66      | add user codef import scope version         | t
...
 sales_lines_total |       first_created        |        last_created
-------------------+----------------------------+----------------------------
             10290 | 2026-05-22 07:51:58.480793 | 2026-05-22 07:52:56.471825

 allocations_total
-------------------
                 0
```

판정:

- 공유 DB는 V66까지만 적용되어 V67 snapshot 열이 아직 없다.
- 매출전표 10,290행은 모두 V67보다 앞선 2026-05-22에 생성됐고 allocation도 0행이다. V67은 기존 행 backfill을 금지하므로 HEAD 적용 뒤 이 모집단의 사슬 도달 행은 0이다.
- 이 모집단에서 R14 전 결과와 R14 후 결과가 다른 건수는 **0건**이며, R14가 든 synthetic 3건 외 변화도 **0건**이다. 다만 이는 현존 이관 행이 모두 새 snapshot 입력을 갖지 않는다는 뜻이지, 신규 실사용 거래의 안전성을 증명하지 않는다.

## ① 차단되면 안 되는 것이 차단되는가 — 전·후 계수

최종 실행 명령 원문:

```powershell
docker exec samhan-postgres psql -U samhan -d accounting_db -c "BEGIN TRANSACTION READ ONLY; WITH v67_projection AS (SELECT s.slip_no,l.line_no,NULL::varchar AS model_name,NULL::varchar AS category_key FROM sales_accounting_slips s JOIN sales_accounting_slip_lines l ON l.slip_id=s.id AND l.is_deleted=false WHERE s.is_deleted=false AND s.status='POSTED'), replay AS (SELECT *, CASE WHEN model_name IS NULL OR btrim(model_name)='' THEN 'BASE_REVALIDATION' ELSE 'R13_RIUSAGE' END AS r13_path, CASE WHEN model_name IS NULL OR btrim(model_name)='' THEN 'BASE_REVALIDATION' ELSE 'R14_CHAIN' END AS r14_path FROM v67_projection) SELECT COUNT(*) AS rows_replayed, COUNT(*) FILTER (WHERE r13_path='R13_RIUSAGE') AS r13_chain_rows, COUNT(*) FILTER (WHERE r14_path='R14_CHAIN') AS r14_chain_rows, COUNT(*) FILTER (WHERE r13_path IS DISTINCT FROM r14_path AND r13_path<>'BASE_REVALIDATION' AND r14_path<>'BASE_REVALIDATION') AS changed_rows, COUNT(DISTINCT slip_no) FILTER (WHERE r13_path IS DISTINCT FROM r14_path AND r13_path<>'BASE_REVALIDATION' AND r14_path<>'BASE_REVALIDATION') AS changed_scopes FROM replay; COMMIT;"
```

출력 원문:

```text
 rows_replayed | r13_chain_rows | r14_chain_rows | changed_rows | changed_scopes
---------------+----------------+----------------+--------------+---------------
         10290 |              0 |              0 |            0 |              0
```

판정:

- 로컬 이관 DB의 POSTED 매출전표 **2,512전표/10,290행**을 V67 무-backfill 계약대로 재생하면 R13 `RiUsageDecision` 도달 0행, R14 `LegacyVerificationChain` 도달 0행이다.
- R14 전·후 판정 변경은 **0행/0전표**다. 정상 경로가 새로 차단된 건수도 **0**, R14 synthetic 3건 외 추가 변경도 **0**이다.
- 단, 이 계수는 실제 거래 모양을 가진 로컬 이관 DB에 대한 결과다. 운영 신규 거래 snapshot(`model_name/category_key` 보존) 모집단은 이 워크트리에 없으므로 ①만으로 결함 0을 선언하지 않는다.
## ④ R14 보고서 수치 재현

### ④-1. R14 선택 테스트 명령 그대로 재실행

실행 명령 원문:

```powershell
.\gradlew.bat -p services/accounting-service test --tests com.samhanair.logis.accounting.service.LegacyVerificationChainTest --tests com.samhanair.logis.accounting.service.RiUsageDecisionTest --tests com.samhanair.logis.accounting.service.LegacySetMatcherTest --tests com.samhanair.logis.accounting.service.GasCategoryAxisTest --tests com.samhanair.logis.accounting.service.DiscountRevalidatorTest --tests com.samhanair.logis.accounting.service.DailyClosingDetailServiceTest --no-daemon
```

출력 원문:

```text
Exit code: 0
Wall time: 17.4 seconds
> Task :services:accounting-service:compileJava UP-TO-DATE
> Task :services:accounting-service:compileTestJava UP-TO-DATE
> Task :services:accounting-service:testClasses UP-TO-DATE
> Task :services:accounting-service:test UP-TO-DATE

BUILD SUCCESSFUL in 15s
21 actionable tasks: 21 up-to-date
```

판정: R14에 적힌 명령은 종료 코드 0과 `BUILD SUCCESSFUL`을 재현했다. 다만 이 실행은 Gradle 캐시의 `UP-TO-DATE` 판정이므로, 실제 테스트 프로세스를 다시 띄운 결과는 아니다. 동일 선택 범위를 `--rerun-tasks`로 즉시 재실행한다.

### ④-2. 같은 선택 범위 강제 재실행

실행 명령 원문:

```powershell
.\gradlew.bat -p services/accounting-service test --tests com.samhanair.logis.accounting.service.LegacyVerificationChainTest --tests com.samhanair.logis.accounting.service.RiUsageDecisionTest --tests com.samhanair.logis.accounting.service.LegacySetMatcherTest --tests com.samhanair.logis.accounting.service.GasCategoryAxisTest --tests com.samhanair.logis.accounting.service.DiscountRevalidatorTest --tests com.samhanair.logis.accounting.service.DailyClosingDetailServiceTest --rerun-tasks --no-daemon
```

출력 원문:

```text
Exit code: 0
Wall time: 67.8 seconds
> Task :services:accounting-service:compileJava
> Task :services:accounting-service:compileTestJava
> Task :services:accounting-service:testClasses
> Task :services:accounting-service:test

BUILD SUCCESSFUL in 1m 6s
21 actionable tasks: 21 executed
```

판정: 캐시를 우회해 실제로 선택 테스트를 다시 실행해도 GREEN이다. 다음으로 생성된 JUnit XML에서 클래스별 실행 건수와 실패 건수를 직접 센다.

### ④-3. JUnit XML 1차 집계 시도

실행 명령 원문:

```powershell
$names = @('LegacyVerificationChainTest','RiUsageDecisionTest','LegacySetMatcherTest','GasCategoryAxisTest','DiscountRevalidatorTest','DailyClosingDetailServiceTest')
# 각 TEST-*.xml을 [xml](Get-Content ...)로 읽어 tests/failures/errors/skipped 집계
```

출력 원문:

```text
LegacyVerificationChainTest       5        0      0       0
RiUsageDecisionTest              12        0      0       0
LegacySetMatcherTest              7        0      0       0
GasCategoryAxisTest               5        0      0       0
DiscountRevalidatorTest           5        0      0       0
DailyClosingDetailServiceTest     5        0      0       0
TOTAL_TESTS=39
TOTAL_FAILURES=0
TOTAL_ERRORS=0
TOTAL_SKIPPED=0
Cannot convert value "System.Object[]" to type "System.Xml.XmlDocument" ...
```

판정: 이 집계값은 채택하지 않는다. 마지막 두 XML을 `Get-Content` 줄 배열로 캐스팅하는 과정에서 파서 오류가 발생해 직전에 읽은 XML 객체 값이 남았기 때문이다. `-Raw`와 새 지역 변수로 다시 집계한다.

`Get-Content -Raw`로 바꾼 2차 시도 출력 원문:

```text
LegacyVerificationChainTest       5        0      0       0
RiUsageDecisionTest              12        0      0       0
LegacySetMatcherTest              7        0      0       0
GasCategoryAxisTest               5        0      0       0
DiscountRevalidatorTest           0        0      0       0
DailyClosingDetailServiceTest     0        0      0       0
TOTAL_TESTS=29
Exception calling "LoadXml" ... unexpected token ...
```

판정: 이 집계값도 채택하지 않는다. `-Raw` 여부와 무관하게 마지막 두 결과 XML 자체에서 XML 파싱 오류가 재현됐다. 원문 헤더를 확인한 뒤, XML 파서가 아니라 `<testcase` 원문 건수와 실패 태그를 별도로 센다.

마지막 두 XML의 헤더 원문 확인 결과:

```text
FILE=TEST-com.samhanair.logis.accounting.service.DailyClosingDetailServiceTest.xml
02: <testsuite name="com.samhanair.logis.accounting.service.DailyClosingDetailServiceTest" tests="22" skipped="0" failures="0" errors="0" timestamp="2026-08-03T01:43:06" hostname="SAMHAN9440" time="3.504">
FILE=TEST-com.samhanair.logis.accounting.service.DiscountRevalidatorTest.xml
02: <testsuite name="com.samhanair.logis.accounting.service.DiscountRevalidatorTest" tests="23" skipped="0" failures="0" errors="0" timestamp="2026-08-03T01:43:10" hostname="SAMHAN9440" time="0.033">
```

판정: R14 보고서의 두 클래스 수치(각 22건, 23건)와 실패 0은 XML 헤더에서 재현된다. 이 시점에는 한글 테스트 이름 디코딩이 원인인지 확인되지 않았으므로 다음 명시적 UTF-8 집계 전까지 XML 자체 결함으로 판정하지 않는다.

정정 및 최종 집계: 파일을 명시적으로 UTF-8로 읽자 XML은 정상 파싱됐다. 앞선 오류는 PowerShell `Get-Content` 기본 디코딩으로 한글 이름이 손상된 조사 도구 오류이며 결과 파일 결함이 아니다.

실행 명령 원문:

```powershell
$rawXml = [System.IO.File]::ReadAllText($path.FullName, [System.Text.Encoding]::UTF8)
$doc = New-Object System.Xml.XmlDocument
$doc.LoadXml($rawXml)
# 6개 선택 클래스의 tests/failures/errors/skipped 합산
```

출력 원문:

```text
Class                         Tests Failures Errors Skipped
LegacyVerificationChainTest       5        0      0       0
RiUsageDecisionTest              12        0      0       0
LegacySetMatcherTest              7        0      0       0
GasCategoryAxisTest               5        0      0       0
DiscountRevalidatorTest          23        0      0       0
DailyClosingDetailServiceTest    22        0      0       0

TOTAL_TESTS=74
TOTAL_FAILURES=0
TOTAL_ERRORS=0
TOTAL_SKIPPED=0
```

판정: R14의 “변경 표면 선택 테스트 GREEN”은 강제 재실행 74/74 성공으로 재현된다.

### ④-4. R14가 제시한 값 변경 3건 직접 재현

실행 명령 원문: §23과 같은 production class reflection bootstrap을 사용해 아래 세 fixture를 `jshell --class-path services/accounting-service/build/classes/java/main`에 전달했다. 파일 생성이나 테스트 전용 구현 호출은 없다.

```text
CASE1: INDOOR(AC023CN1DBC1, usage 1/0) → AM023TNVDBH1 → PANEL(PC1BWCK3NW, usage 1/0), unit=55,000, release=100,000, delivery=70,000, COMM 전역DC=45%
CASE2: INDOOR(AC023CN1DBC1, usage 1/0) → 운임(PANEL/PC1BWCK3NW, usage 1/0)
CASE3: INDOOR(QA797-PART-01, usage 1/0) → PANEL(PC1BWCK3NW, usage 1/0), unit=delivery=70,000
R13: 현재 `RiUsageDecision.decide`에 R13 당시와 같은 SINGLE축 부분수열을 넣고 기존 `revalidate` 결과에 non-null riUsage를 우선 적용
R14: `LegacyVerificationChain.route/branch/riUsageDecision`과 `revalidateByLegacyBranch`를 순서대로 호출
```

reflection 호출부 원문:

```java
Object r1main = chainRowCtor.newInstance("P1","D1","main","MAIN","AC023CN1DBC1","INDOOR",false);
Object r1multi = chainRowCtor.newInstance("P1","D1","multi","MULTI","AM023TNVDBH1","MATERIAL",false);
Object r1panel = chainRowCtor.newInstance("P1","D1","panel","PANEL","PC1BWCK3NW","PANEL",false);
List<?> r1routed = (List<?>) routeM.invoke(null, List.of(r1main,r1multi,r1panel));
Object r1focus = r1routed.get(2);
Object r1branch = branchM.invoke(null,r1focus,true);
Object r1ri14 = chainRiM.invoke(null,r1focus,r1routed,Map.of("main",u00,"panel",u00),new BigDecimal("55000"),new BigDecimal("70000"));
Object r1v14 = branchRevalM.invoke(drv,"PANEL","PC1BWCK3NW",new BigDecimal("55000"),new BigDecimal("100000"),new BigDecimal("70000"),null,gd45,matched,r1branch,zoneM.invoke(r1focus));
Object r1ri13 = oldDecideM.invoke(null,"PC1BWCK3NW","PANEL",List.of(
    oldRowCtor.newInstance("main","D1","AC023CN1DBC1","INDOOR"),
    oldRowCtor.newInstance("panel","D1","PC1BWCK3NW","PANEL")),Map.of("main",u00,"panel",u00));

Object r2main = chainRowCtor.newInstance("P1","D2","main","MAIN","AC023CN1DBC1","INDOOR",false);
Object r2freight = chainRowCtor.newInstance("P1","D2","freight","\uC6B4\uC784","PC1BWCK3NW","PANEL",false);
List<?> r2routed = (List<?>) routeM.invoke(null,List.of(r2main,r2freight));
Object r2focus = r2routed.get(1);
Object r2ri13 = oldDecideM.invoke(null,"PC1BWCK3NW","PANEL",List.of(
    oldRowCtor.newInstance("main","D2","AC023CN1DBC1","INDOOR"),
    oldRowCtor.newInstance("freight","D2","PC1BWCK3NW","PANEL")),Map.of("main",u00,"freight",u00));
Object r2v14 = branchRevalM.invoke(drv,"\uC6B4\uC784","PC1BWCK3NW",null,null,null,null,gd45,matched,branchM.invoke(null,r2focus,true),zoneM.invoke(r2focus));

Object r3qa = chainRowCtor.newInstance("P1","D3","qa","QA","QA797-PART-01","INDOOR",false);
Object r3panel = chainRowCtor.newInstance("P1","D3","panel","PANEL","PC1BWCK3NW","PANEL",false);
List<?> r3routed = (List<?>) routeM.invoke(null,List.of(r3qa,r3panel));
Object r3focus = r3routed.get(1);
Object r3ri13 = oldDecideM.invoke(null,"PC1BWCK3NW","PANEL",List.of(
    oldRowCtor.newInstance("qa","D3","QA797-PART-01","INDOOR"),
    oldRowCtor.newInstance("panel","D3","PC1BWCK3NW","PANEL")),Map.of("qa",u00,"panel",u00));
Object r3v14 = branchRevalM.invoke(drv,"PANEL","PC1BWCK3NW",new BigDecimal("70000"),new BigDecimal("100000"),new BigDecimal("70000"),null,gd45,matched,branchM.invoke(null,r3focus,true),zoneM.invoke(r3focus));
```

출력 원문:

```text
CASE1 R13_base=false R13_ri=false R13_final=false | R14_branch=MULTI_RATE zone=COMM_MULTI expected=45 actual=45 R14_ri=null R14_final=true
CASE2 R13_base=true R13_ri=false R13_final=false | R14_branch=FREIGHT_OR_CUTTING zone=SINGLE R14_ri=null R14_final=true
CASE3 R13_base=true R13_ri=false R13_final=false | R14_branch=DEFAULT zone=UNKNOWN R14_ri=null R14_final=true
```

판정: R14 보고서의 값 변경 3건은 모두 정확히 `false → true`로 재현됐다. CASE1의 전역DC/실제율 45%, CASE2의 최상단 운임 분기, CASE3의 비대상 token `UNKNOWN → DEFAULT`도 각각 보고서 설명과 일치한다.

### ④-5. 결함 A의 실 사용자 노출 경로 확인

실행 명령 원문:

```powershell
rg -n "/accounting/closings/daily|SALES_SLIP" clients/desktop --glob '!**/node_modules/**' --glob '!**/build/**'
rg -n -A 12 -B 8 "verified|확인|모델별 재검증" clients/desktop/src/renderer/routes/DailyClosingPage.tsx
```

출력 원문:

```text
clients/desktop/src/renderer/routes/index.tsx:1226: path: '/accounting/daily-closings'
clients/desktop/src/renderer/api/closingApi.ts:238: '/accounting/closings/daily'
clients/desktop/src/renderer/routes/DailyClosingPage.tsx:48: SALES_SLIP: '매출전표'
DailyClosingPage.tsx:711: key: 'verified'
DailyClosingPage.tsx:712: header: '확인'
DailyClosingPage.tsx:717-720: true → <Badge variant="success">확인</Badge>, false → <Badge variant="danger">불일치</Badge>
DailyClosingPage.tsx:1140: <h4>모델별 재검증</h4>
AccountingReportController.java:202: @GetMapping("/accounting/closings/daily")
MonthEndCloseService.java:499: findFocusRoute(routedRows, axisKey)
MonthEndCloseService.java:650-655: partnerCode + label + modelToken 필터 뒤 findFirst()
```

판정: 결함 A는 내부 전용 값이 아니다. `accounting.reports` VIEW 사용자가 데스크톱 `/accounting/daily-closings`에서 날짜를 선택하고 `매출전표`를 누르면 호출되는 실제 조회 endpoint의 `모델별 재검증 > 확인` 배지를 반대로 표시한다.

## 최종 판정

**실 사용자 경로로 재현 가능한 결함이 1건 있다.**

### ① 실 데이터 전·후 계수

로컬 이관 DB의 POSTED 매출전표 2,512전표/10,290행에서는 V67 이전 행이라 snapshot이 전부 비어 있어 R13·R14 사슬 도달이 모두 0이었다. 따라서 이 모집단의 R14 전·후 변화는 **0행/0전표**, R14 synthetic 3건 외 변화도 **0건**이다. 운영 신규 snapshot 모집단은 이 워크트리에 없어 운영 영향 총량으로 확대하지 않는다.

### ② 레거시와 다른 분기를 고르는 입력

`LegacyVerificationChain`의 15개 leaf와 중첩 우선순위 자체는 레거시 원문과 일치했다. 결함은 그 다음 통합부다. 레거시는 각 원천 행마다 해당 시점의 branch를 실행하지만, 현행 `MonthEndCloseService`는 같은 `AxisKey(partnerCode, label, modelToken, axis, actualUnitPrice)` 행들을 일 단위로 합친 뒤 `findFocusRoute`에서 `partnerCode + label + modelToken`이 맞는 **첫 원천 행 하나**의 branch만 고른다. scope·sourceKey·해당 행의 zone은 대표키에 없다.

따라서 같은 집계행 안에서 `DEFAULT(true)`와 `SINGLE_ACCESSORY(false)`, 또는 `MULTI_RATE(true)`와 `SINGLE_ACCESSORY(false)`가 함께 나오면 레거시의 행별 결과 대신 입력상 첫 행의 결과 하나가 사용자에게 표시된다.

### ③ 행 순서와 scope

repository header 순서와 entity `@OrderBy("lineNo ASC")`를 대조했고, production route probe에서도 scope별 zone 전이는 서로 오염되지 않았다. 뒤집힘은 route 안에서 생기지 않는다. 오히려 정상 보존된 `line_no` 순서의 첫 route를 집계 후 대표로 삼는 데서 결함이 발생한다.

### ④ R14 수치

R14가 제시한 3건은 모두 `R13=false → R14=true`로 재현됐다. 변경 표면 6개 클래스도 강제 재실행에서 **74/74 성공, failure/error/skipped 0**이었다. 이 두 보고 수치에는 불일치가 없다.

## 결함 A — 집계행의 첫 route가 다른 원천 행의 판정을 숨김

### 실 사용자 재현 절차

1. 정상 출고전표→매출전표 경로에서 같은 날짜·거래처의 POSTED 매출전표 1건을 만든다. 서로 완성 세트를 이루지 않는 유효한 SINGLE catalog 본체/패널을 사용하고, 패널 단가는 해당 납품가와 같게 둔다.
2. 원천 행 순서를 다음처럼 둔다.
   - `line_no=1`: 패널, 예시 token `PC1BWCK3NW`, `categoryKey=singleSets`, 납품가와 같은 단가
   - `line_no=2`: 미완전 target 본체, 예시 token `AC023CN1DBC1`, kind `INDOOR`
   - `line_no=3`: 1번과 품명·token·category·단가가 같은 패널
3. 레거시 사슬은 1번 패널을 본체 전 `UNKNOWN → DEFAULT → true`, 3번 패널을 본체 후 `SINGLE → SINGLE_ACCESSORY → false`로 판정한다.
4. 데스크톱 `/accounting/daily-closings`에 들어가 그 날짜, `매출`, `매출전표`를 선택한다. `GET /accounting/closings/daily?date=<날짜>&kind=SALES&sourceKind=SALES_SLIP`의 모델별 재검증에는 두 패널이 한 행으로 합쳐지고, 1번 route가 선택돼 `확인`이 표시된다. 3번의 `불일치`는 보이지 않는다.
5. 비교 재현으로 같은 입력을 `본체 → 패널 → 패널` 순서로 두면 첫 panel route도 `SINGLE_ACCESSORY`가 되어 같은 모델별 행이 `불일치`로 바뀐다.

이 라운드는 read-only 규율 때문에 실제 전표를 생성하지 않았다. 위 절차의 branch·최종 boolean은 production compiled class에 동일 입력을 직접 넣어 각각 `PANEL,MAIN,PANEL → true`, `MAIN,PANEL,PANEL → false`로 재현했고, FE/API가 그 boolean을 실제 `확인/불일치` 배지로 노출하는 경로까지 소스에서 연결 확인했다.

### 영향 건수

- 결정적 최소 재현: **1전표 / 3원천행**.
- 판정이 다른 패널 원천행: **2행 중 1행의 false가 숨겨짐**.
- 사용자 표시 영향: 두 패널이 합쳐진 **모델별 재검증 1행**이 `불일치` 대신 `확인`으로 표시됨.
- 현재 로컬 이관 DB 관측 영향: **0행/0전표**(snapshot 미보유로 사슬 미도달).
- 운영 총 영향 건수: 운영 V67+ 신규 거래 데이터가 제공되지 않아 **계수하지 못함**.

## 판정 전에 확인한 미검증 표면

“이 라운드가 안 본 것이 있나?”에 대한 답은 **있다**.

- 운영 또는 V67 적용 후 생성된 `model_name/category_key` snapshot 실거래 모집단.
- read-only 제한 때문에 실제 전표 생성·POST 후 데스크톱 화면까지 수행하는 write E2E.
- 같은 집계 결합을 공유하는 TAX_INVOICE 신규 snapshot 실데이터의 실제 영향 건수.
- 약 300초 timeout 이력이 있는 accounting-service 전체 suite와 현재 PR CI. 이번 라운드는 요구된 변경 표면 6개 클래스만 강제 재실행했다.
- 외부 product/partner 서비스의 라이브 catalog·가격·전역DC 응답 조합. 분기 프로브는 그 계약값을 production 메서드에 직접 주입했다.

## 수행 규율

소스 수정, git 명령, 새 이슈 등록, Docker build/배포는 수행하지 않았다. Docker는 공유 DB의 read-only SQL 조회에만 사용했다. 작업 파일 변경은 사용자가 선지시한 이 보고서의 즉시 append뿐이다.

### 보고서 저장 확인

실행 명령 원문:

```powershell
$p='docs/dev-reports/2026-08-03-874-r15-reconvergence.md'
Get-Item -LiteralPath $p
rg -n "^## 최종 판정|^## 결함 A|^### 실 사용자 재현 절차|^### 영향 건수|^## 판정 전에 확인한 미검증 표면|74/74|0행/0전표" $p
```

출력 원문:

```text
REPORT=D:\dev\Samhan-Public\.claude\worktrees\w1057\docs\dev-reports\2026-08-03-874-r15-reconvergence.md
BYTES=74542
LINES=1332
1275:## 최종 판정
1277:**실 사용자 경로로 재현 가능한 결함이 1건 있다.**
1297:## 결함 A — 집계행의 첫 route가 다른 원천 행의 판정을 숨김
1299:### 실 사용자 재현 절차
1312:### 영향 건수
1320:## 판정 전에 확인한 미검증 표면
```

판정: 필수 판정·재현 절차·영향 건수·미검증 표면이 보고서에 저장됐다.
