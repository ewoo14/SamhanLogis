# 2026-08-03 #874 R13 재수렴 — 순서 축 이후 누락 축 검증

## 1. 조사 기준 상태

- 조회 시점 HEAD: `3c15ebbf8 [FIX] #874 순서 축 계승 — 레거시 _zone 전파를 행 순서대로 재구성`.
- 기존 작업물 외 신규 상태는 이 보고서와 기존 untracked `clients/desktop/playwright/874-riusage-real-qa.spec.ts`뿐이다. 금지 지시대로 해당 Playwright 파일은 수정하지 않는다.
- R12 보고서가 선언한 현재 표의 축은 scope, main 구성/소비 상태, 행 kind, 자기 소비 상태, 단가 일치, 행 순서다. 이번 R13은 이 축 집합과 레거시 원문·현재 구현의 대응만 검증한다.

## 2. 지정 레거시 원문 직접 확인

- `Code.js:483-496`: `_zone` 상태는 `UNKNOWN`에서 시작하고 입력 행 순서대로 갱신된다. 품목명에서 추출/정규화한 토큰 `t`와 분류 `cls`를 사용하며, `AM...`의 7번째 문자가 `X/N`이면 `COMM_MULTI`, `AJ...`의 7번째 문자가 `X/N`이면 `HOME_MULTI`, target model이면서 `INDOOR/OUTDOOR/SUB_INDOOR`이면 `SINGLE`로 바뀐다. 이 원문만 보면 **품목명 토큰 패턴 및 target-model 판정도 `_zone` 전이 입력**이다(`Code.js:487-496`).
- `Code.js:688-712`: `_zone === 'SINGLE'`에서 accessory(`PANEL/REMOTE/MATERIAL`)는 자기 완전 소비면 `true`, 아니고 `INDOOR/OUTDOOR` 미완전 소비 main이 하나라도 있으면 `false`, 둘 다 아니면 단가 일치값을 쓴다(`Code.js:690-708`). main 3종은 자기 완전 소비 여부, 그 밖의 kind는 `true`다(`Code.js:709-712`).
- `Code.js:733-734`: 앞선 zone/선행 분기에 걸리지 않는 최종 fallback은 무조건 `true`다.
- 이 단계의 원문에는 수량 부호, `_isOld`, `isMultiApplied`를 직접 읽는 표현이 없다. 다만 이 값들이 `:688` 이전의 선행 분기 또는 `riUsage` 산출에 영향을 주는지는 주변 원문과 데이터 흐름을 별도로 추적해야 하므로 아직 판정하지 않는다.

## 3. 현대 구현의 데이터 흐름 위치

- 현재 판정 구현은 `RiUsageDecision.java`, 호출·입력 구성은 `MonthEndCloseService.java:510-513,592-641`, kind 정규화는 `LegacyModelKindClassifier.java`에 있다.
- `_isOld`는 `DiscountRevalidator.java:117`의 별도 멀티 분기 설명에 등장한다. 따라서 `_isOld`가 riUsage 자체의 누락 축인지 여부는 레거시 선행 분기와 현대 호출 게이트를 함께 비교해야 한다.
- 최초 검색 명령은 한글+공백 경로를 PowerShell 인수에서 잘못 분리해 레거시 파일 검색 부분만 실패했다. 위 §2의 직접 줄 조회는 성공했으며, 이후 레거시 조회는 파일 경로를 완전히 인용해 수행한다.

## 4. 레거시 입력 후보 전수 검색

`Code.js`의 관련 심볼을 전수 검색한 결과:

- 수량은 `Code.js:554`, `:571`에서 읽고, `_zone === 'SINGLE'` 행은 `:570-575`에서 riUsage 후보를 만든다.
- `riUsage`의 total/used는 `Code.js:661-665`에서 집계된다.
- 최종 `확인` 판정은 순서대로 품목명 `운임|절삭`(`:669`), `_isOld`(`:671`), 그 내부/후속의 `isMultiApplied`(`:672`, `:684`), `SINGLE`(`:690`), 멀티 zone 또는 품목명 `멀티|MULTI`(`:714`)를 본다.
- 따라서 현재 조합 표가 `SINGLE` 분기 내부만 표현한다면, 적어도 **선행 판정 라우팅**(품목명 패턴·`_isOld`·multi 적용 여부/zone)은 표 밖에서 최종값을 바꿀 수 있는 후보이다. 실제 현대 코드가 같은 라우팅을 보존하는지 확인 전이므로 이 시점에는 결함 확정이 아니다.

## 5. 레거시 전체 흐름과 R12 구현 대조

### 5.1 수량 부호

- 레거시는 `qty = money_to_int_(수량) || 1` 후 `Math.abs(qty)`만큼 pool 단위를 만든다(`Code.js:570-579`). 현대도 null/0이면 1, 그 외 `abs(intValueExact())`만큼 확장한다(`MonthEndCloseService.java:644-657`).
- 따라서 수량 부호 자체는 양쪽에서 제거되며, 표의 소비 상태(total/used)가 정해진 뒤 별도 판정축이 아니다. 이 입력은 누락 축이 아니다.

### 5.2 `_zone` 값 자체와 품목명/토큰 패턴

- 레거시는 scope 입력 순서에서 `AM...X/N → COMM_MULTI`, `AJ...X/N → HOME_MULTI`, target main → `SINGLE`로 `currentZone`을 매번 전환하고 각 행에 당시 값을 복사한다(`Code.js:483-498`). 즉 단지 “main을 처음 만났는가”가 아니라 **어떤 zone 전환 토큰을 마지막으로 만났는가**가 순서와 결합된 상태다.
- R12 구현은 row에 token/kind만 있고 zone 전환 종류가 없다(`RiUsageDecision.java:107`). scope 행을 돌며 main kind를 만나면 `singleZone=true`로 한 번 켤 뿐 다시 `COMM_MULTI/HOME_MULTI`로 끄거나 바꾸지 않는다(`RiUsageDecision.java:53-58`). 호출부는 애초 `axis == SINGLE`인 행만 남긴다(`MonthEndCloseService.java:618-640`).
- 그러므로 R12의 “scope 내 입력 순서로 `_zone` 재구성”은 레거시와 같은 규칙이 아니라 **SINGLE 행 부분수열에서 main 등장 여부만 누적하는 근사**다. 세 번째로 빠진 축은 `zone 전환 종류/값(UNKNOWN·SINGLE·COMM_MULTI·HOME_MULTI)`이며, 이는 품목명에서 얻는 `AM/AJ` 패턴 및 target-model 판정과 행 순서의 결합축이다.

### 5.3 선행 판정 라우팅

- 레거시 최종 판정 우선순위는 `운임|절삭` → `_isOld` → 특정 accessory/`AXJ` → `SINGLE` → multi → fallback이다(`Code.js:668-734`). `_isOld` 분기 안에서는 `isMultiApplied`와 토큰 prefix/단가를 보고(`:671-682`), accessory 및 multi 분기도 `isMultiApplied`를 본다(`:683-688`, `:714-731`).
- 현대는 먼저 `DiscountRevalidator`가 운임/절삭, 구형 근사, accessory, multi 등을 판정하지만(`DiscountRevalidator.java:99-145`), 그 뒤 `riUsageDecision`이 non-null이면 결과를 무조건 덮는다(`MonthEndCloseService.java:500-513`). 따라서 이 선행 라우팅 입력들은 단순히 표 밖의 무관 입력이라고 볼 수 없다. `SINGLE` gate까지 도달 가능한 라벨/토큰 조합에서 실제 값 차이를 만들 수 있는지 최소 재현이 필요하다.

### 5.4 실제 호출 입력에서 zone 전환 정보가 사라지는 지점

- 현대 `SetPoolLine`은 입력 행의 `categoryKey`를 `GasCategoryAxis.fromScheduleKey`로 개별 변환해 저장한다(`MonthEndCloseService.java:358-376`). `GasCategoryAxis`도 레거시 `currentZone`이 입력 순서로 전환된다는 계약을 명시한다(`GasCategoryAxis.java:5-16`).
- 그러나 riUsage 호출은 focus와 decision rows 모두 `axis == SINGLE`로 필터한다(`MonthEndCloseService.java:615-640`). 그러므로 같은 scope의 `COMM_MULTI/HOME_MULTI` 전환 행은 R12 반복문에 도착하지 않는다. 이는 이론상 누락이 아니라 현재 호출 경로에서 확정적으로 소실되는 입력이다.
- R12 커밋 diff도 `RiUsageDecision` 내부의 boolean `singleZone` 추가만 포함하고 호출부/row 계약은 바꾸지 않았다. 따라서 커밋 메시지의 “레거시 `_zone` 전파를 행 순서대로 재구성”은 `UNKNOWN → SINGLE` 한 방향에만 맞고, `SINGLE → COMM_MULTI/HOME_MULTI → SINGLE` 전이를 재구성하지 못한다.

### 5.5 `isMultiApplied`의 현대 계약

- production main/test에서 `isMultiApplied|multiApplied`를 검색했으나 현대 일마감 구현에는 해당 런타임 입력이 없다. 기존 정본 spec은 레거시 토글을 S2b에서 기본 `true`(항상 재검증)로 고정하고 토글 노출을 S4로 미뤘다(`docs/specs/773-daily-closing-price-variant-recalc-spec.md:225`).
- 따라서 `isMultiApplied`는 레거시 최종값에 영향을 주는 입력이 맞지만(`Code.js:672-685,715-716`), 현재 제품 계약에서는 변화 가능한 축이 아니라 `true` 상수다. 표에는 “고정 전제”로 명시돼야 하지만, 이 라운드의 새 조합축/현행 결함으로 세지는 않는다.

## 6. 결함 1 — multi 전환 뒤 SINGLE-category 부속을 다시 SINGLE로 오판정

### 근거와 사용자 조작

- 같은 일자·번호(scope)에 다음 순서로 행을 둔다: (1) 미완전 소비 싱글 `INDOOR`, (2) `AM...X/N` 상업멀티 전환 모델, (3) 미완전 소비 `PANEL`이며 현대 category는 `singleSets`.
- 레거시는 (1)에서 `SINGLE`, (2)에서 `COMM_MULTI`, (3)은 전환이 없으므로 `COMM_MULTI`를 물려받는다(`Code.js:483-498`). 따라서 (3)은 SINGLE riUsage가 아니라 multi 분기로 가며, 레거시 기본 UI인 `isMultiApplied=false`에서는 `true`다(`Code.js:714-716`; 기본값 근거 `tools/legacy-gas/일마감 프로그램/Index.html:232,968`).
- 현대는 (2)를 `axis == SINGLE` 필터에서 제거하고 (1),(3)만 `RiUsageDecision`에 전달한다(`MonthEndCloseService.java:615-640`). (1)에서 boolean `singleZone`을 켠 뒤 다시 끌 정보가 없어 (3)에 `hasFailedMain`을 적용해 `false`로 덮는다(`RiUsageDecision.java:49-75`, `MonthEndCloseService.java:510-513`).

### 잘못된 결과

- 레거시: focus PANEL `확인=true`.
- 현재 HEAD: focus PANEL `확인=false`.
- 잘못된 사용자 효과: 멀티 구간에 속한 정상 부속이 일마감에서 불일치로 표시된다.

### 최소 재현 명령과 출력 원문

아래 PowerShell은 위에 인용한 레거시 전이 조건과 현재 `SINGLE` 필터/boolean 전이를 그대로 대입한 source-level 재현이다(공유 DB/파일 write 없음).

```powershell
$legacyRows = @(
  @{token='AC023CN1DBC1'; kind='INDOOR'; axis='SINGLE'; consumed=$false},
  @{token='AM1234X'; kind='MATERIAL'; axis='COMM_MULTI'; consumed=$false},
  @{token='PC1BWCK3NW'; kind='PANEL'; axis='SINGLE'; consumed=$false}
)
$zone='UNKNOWN'
foreach ($row in $legacyRows) {
  $t=$row.token
  if ($t -match '^AM' -and $t.Length -ge 7 -and @('X','N') -contains [string]$t[6]) {$zone='COMM_MULTI'}
  elseif ($t -match '^AJ' -and $t.Length -ge 7 -and @('X','N') -contains [string]$t[6]) {$zone='HOME_MULTI'}
  elseif ($row.kind -in @('INDOOR','OUTDOOR','SUB_INDOOR')) {$zone='SINGLE'}
  $row.zone=$zone
}
$focus=$legacyRows[2]
$legacy = if ($focus.zone -eq 'COMM_MULTI') {$true} else {$null}
$modernRows = @($legacyRows | Where-Object axis -eq 'SINGLE')
$hasPresent = @($modernRows | Where-Object kind -in @('INDOOR','OUTDOOR','SUB_INDOOR')).Count -gt 0
$hasFailed = @($modernRows | Where-Object { $_.kind -in @('INDOOR','OUTDOOR') -and -not $_.consumed }).Count -gt 0
$singleZone=$false; $modern=$true
foreach ($row in $modernRows) {
  if ($row.kind -in @('INDOOR','OUTDOOR','SUB_INDOOR')) {$singleZone=$true}
  if ($row.token -eq $focus.token -and $row.kind -eq $focus.kind) {
    if (-not $singleZone -or -not $hasPresent) {$modern=$true}
    elseif ($row.consumed) {$modern=$true}
    elseif ($hasFailed) {$modern=$false}
    else {$modern=$null}
  }
}
'legacy zones=' + (($legacyRows | ForEach-Object zone) -join ' -> ')
'modern decision rows=' + (($modernRows | ForEach-Object { $_.token + ':' + $_.kind }) -join ', ')
'legacy focus 확인=' + $legacy
'modern focus 확인=' + $modern
```

실행 출력 원문:

```text
legacy zones=SINGLE -> COMM_MULTI -> COMM_MULTI
modern decision rows=AC023CN1DBC1:INDOOR, PC1BWCK3NW:PANEL
legacy focus 확인=True
modern focus 확인=False
```

## 7. 결함 2 — 레거시 선행 판정 라우팅을 riUsage가 뒤에서 덮음

### 근거와 사용자 조작

- 같은 scope에서 미완전 소비 `INDOOR` 뒤에, 품목명이 `운임` 또는 `절삭`을 포함하면서 model/category 입력이 있어 현대 `axis == SINGLE` 및 accessory kind로 해소되는 행을 둔다.
- 레거시는 품목명 정규식이 최상단이므로 zone·riUsage와 무관하게 `true`다(`Code.js:668-670`).
- 현대 `DiscountRevalidator`도 먼저 `true`를 만든다(`DiscountRevalidator.java:99-103`). 그러나 이어지는 riUsage가 non-null `false`이면 이를 무조건 덮는다(`MonthEndCloseService.java:510-513`). riUsage 입력 계약에는 원 품목명이나 “선행 분기에서 이미 종결됨” 표지가 없다(`RiUsageDecision.java:107`).
- 같은 덮어쓰기 구조는 레거시의 accessory 품명/`AXJ` 분기(`Code.js:683-688`)와 품목명 `멀티|MULTI` 분기(`Code.js:714-731`)에도 존재한다. 현대 revalidator가 먼저 해당 납품가/할인율 판정을 하더라도(`DiscountRevalidator.java:125-145`), category가 `singleSets`이면 뒤의 riUsage가 다시 값을 바꿀 수 있다(`MonthEndCloseService.java:510-513`). 따라서 누락 입력은 단일 정규식이 아니라 **선행 분기 선택/종결 여부**다.

### 잘못된 결과

- 레거시: 운임/절삭 행 `확인=true`.
- 현재 HEAD: 선행 revalidator 결과는 `true`이나 최종 `확인=false`.
- 잘못된 사용자 효과: 레거시에서 무조건 통과하던 운임/절삭 행이 싱글세트 미완전 본체 때문에 불일치로 표시될 수 있다.

### 최소 재현 출력 원문

위와 같은 source-level 명령에서 현대의 `revalidate → riUsage override` 순서를 대입한 출력:

```text
freight legacy 확인=True
freight modern before riUsage=True
freight modern after riUsage=False
```

이 결함의 재현 전제는 model/category가 함께 저장된 운임·절삭 행이다. `accumulateProduct`는 modelName이 비어 있지 않으면 해당 행을 setPool에 넣으므로 코드상 도달 가능하다(`MonthEndCloseService.java:358-376`).

`_isOld`도 같은 선행 라우팅 후보이나, 레거시는 외부 OLD 가격표 lookup 성공으로 값을 정하고(`Code.js:519-520`) 현대는 토큰 prefix로 근사한다(`DiscountRevalidator.java:116-123`). 이번 워크트리의 정적 자료만으로 특정 행이 양쪽에서 동시에 old로 판정되는 입력을 확정 재현하지 못했으므로 `_isOld` 단독 사례는 **미판정**으로 분류한다. 추측 결함 수에는 넣지 않는다.

### 구성요소 실제 테스트 확인

```text
.\gradlew.bat -p services/accounting-service test --tests com.samhanair.logis.accounting.service.RiUsageDecisionTest.accessoryAfterIncompleteMainUsesFailedMainDecision --tests com.samhanair.logis.accounting.service.DiscountRevalidatorTest.freightAndCuttingAreVerified --no-daemon

> Task :services:accounting-service:test
BUILD SUCCESSFUL in 12s
21 actionable tasks: 1 executed, 20 up-to-date
```

기존 테스트가 각각 현재 riUsage의 `false`와 운임/절삭 선행 판정의 `true`를 확인한다. 두 결과를 결합한 뒤 뒤쪽 riUsage로 덮는 코드는 `MonthEndCloseService.java:510-513`이다. 전체 accounting suite는 금지 지시대로 실행하지 않았다.

## 8. R2·R4·R6·R8 회귀 확인

- **R2 — Q 자기 `확인` 판정 유지.** 레거시는 `SUB_INDOOR`를 main 존재 집합에 포함하고(`Code.js:494-496`), main 행 자신의 값은 자기 riUsage 완전 소비 여부다(`Code.js:709-710`). 현대도 main 3종을 직접 자기 소비로 판정한다(`RiUsageDecision.java:25-26,103-104`). `legacyQTokenReachesSubIndoorRiUsageEvenWhenCatalogSaysAccessory`가 이를 확인한다.
- **R4 — 완전 소비 sibling 비차단 유지.** 레거시는 accessory 자기 소비 완료를 failed-main보다 먼저 `true`로 단락한다(`Code.js:694,702-705`). 현대도 같은 우선순서다(`RiUsageDecision.java:67-72`). `partiallyConsumedSubIndoorDoesNotFailACompletedSiblingRemote`가 통과했다.
- **R6 — 두 집합 분리 유지.** 레거시 main 존재 집합은 `INDOOR/OUTDOOR/SUB_INDOOR`(`Code.js:494-496`), failed-main 집합은 `INDOOR/OUTDOOR`만이다(`Code.js:697-700`). 현대도 `isPresentMain`과 `isFailedMain`을 같은 두 집합으로 분리한다(`RiUsageDecision.java:49-52,99-104`). `legacyMainPresenceAndFailedMainMatrixAreBothCovered`가 통과했다.
- **R8 — scope 간 비오염 유지.** 레거시는 `일자_번호`별 `items` 그룹 안에서만 상태·riUsage를 계산한다(`Code.js:473-481,568-668`). 현대도 focus scope별로 rows를 다시 제한한다(`RiUsageDecision.java:32-36`). `differentScopesDoNotCollapseTwoLegacyTrueResultsIntoFalse`가 통과했다.

타깃 실행 출력 원문:

```text
.\gradlew.bat -p services/accounting-service test --tests com.samhanair.logis.accounting.service.RiUsageDecisionTest.legacyQTokenReachesSubIndoorRiUsageEvenWhenCatalogSaysAccessory --tests com.samhanair.logis.accounting.service.RiUsageDecisionTest.partiallyConsumedSubIndoorDoesNotFailACompletedSiblingRemote --tests com.samhanair.logis.accounting.service.RiUsageDecisionTest.legacyMainPresenceAndFailedMainMatrixAreBothCovered --tests com.samhanair.logis.accounting.service.RiUsageDecisionTest.differentScopesDoNotCollapseTwoLegacyTrueResultsIntoFalse --no-daemon

> Task :services:accounting-service:test
BUILD SUCCESSFUL in 12s
21 actionable tasks: 1 executed, 20 up-to-date
```

결론: R12가 이 네 규칙을 직접 되돌리지는 않았다. 다만 §6의 zone 전환 입력 소실은 이 네 규칙과 별개의 새 결함이다.

## 9. 결함 3 — main kind만 보고 레거시 target-model 조건 없이 SINGLE 전환

### 근거와 사용자 조작

- 레거시는 `cls`가 main 3종인 것만으로는 부족하고, 토큰이 `isTargetModelCode_`를 통과할 때만 `SINGLE`로 전환한다(`Code.js:177-183,487-496`).
- 현대 R12는 token eligibility를 보지 않고 kind가 main 3종이면 곧바로 `singleZone=true`로 만든다(`RiUsageDecision.java:53-58,99-104`). 호출부의 kind는 카탈로그의 구체 kind를 그대로 신뢰한다(`MonthEndCloseService.java:626-639`, `LegacyModelKindClassifier.java:11-21`).
- 사용자 조작은 같은 scope에서 category `singleSets`인 비-target 토큰(예: `QA797-PART-01`)을 카탈로그 kind `INDOOR`로 둔 뒤, 미완전 PANEL을 뒤에 두는 것이다. 레거시는 zone이 계속 UNKNOWN이라 PANEL `true`이고(`Code.js:483-498,733-734`), 현대는 앞 행을 failed main으로 보아 PANEL `false`다(`RiUsageDecision.java:49-75`).

### 잘못된 결과

- 레거시: `확인=true`.
- 현재 HEAD: `확인=false`.
- 잘못된 사용자 효과: 레거시 target-model 형식이 아닌 카탈로그 행 하나가 뒤의 싱글 부속을 실패시키는 가짜 zone 전환을 만든다.

### 최소 재현 출력 원문

레거시 `isTargetModelCode_`와 현재 kind-driven 전이를 같은 두 행에 적용한 source-level 명령:

```powershell
$rows = @(
  @{token='QA797-PART-01'; kind='INDOOR'; consumed=$false},
  @{token='PC1BWCK3NW'; kind='PANEL'; consumed=$false}
)
$target = $rows[0].token -match '^A[CP]\d{3}|^AF\d{2}|^AR\d{2}'
$legacyZones = if ($target) {@('SINGLE','SINGLE')} else {@('UNKNOWN','UNKNOWN')}
$legacy=$true
$hasPresent=$true; $hasFailed=$true; $modernSingle=$false
foreach ($row in $rows) {
  if ($row.kind -in @('INDOOR','OUTDOOR','SUB_INDOOR')) {$modernSingle=$true}
  if ($row.kind -eq 'PANEL') {
    if (-not $modernSingle -or -not $hasPresent) {$modern=$true}
    elseif ($row.consumed) {$modern=$true}
    elseif ($hasFailed) {$modern=$false}
    else {$modern=$null}
  }
}
'legacy target predicate=' + $target
'legacy zones=' + ($legacyZones -join ' -> ')
'legacy focus 확인=' + $legacy
'modern kind-driven focus 확인=' + $modern
```

출력 원문:

```text
legacy target predicate=False
legacy zones=UNKNOWN -> UNKNOWN
legacy focus 확인=True
modern kind-driven focus 확인=False
```

이 사례는 표의 “main 구성” 축만으로는 구분되지 않는다. 같은 `INDOOR` 구성이라도 target-model predicate가 true/false인지에 따라 레거시 zone과 결과가 달라진다.

## 10. 기존 조합표 값 대조

아래는 **레거시 선행 분기를 타지 않고, 실제 `_zone=SINGLE`인 표준 싱글 행**이라는 전제가 충족된 경우다.

| 조합 | 레거시 값과 근거 | 현재 값과 근거 | 판정 |
|---|---|---|---|
| target main 자기 완전 소비 | `true` (`Code.js:709-710`) | `true` (`RiUsageDecision.java:25-26,86-88`) | 같음 |
| target main 자기 미완전 소비 | `false` (`Code.js:709-710`) | `false` (`RiUsageDecision.java:25-26,86-88`) | 같음 |
| accessory가 최초 target main보다 앞(UNKNOWN) | `true` (`Code.js:483-498,733-734`) | `true` (`RiUsageDecision.java:53-66`) | 같음 |
| accessory 자기 완전 소비 | `true` (`Code.js:694,702-703`) | `true` (`RiUsageDecision.java:67-69`) | 같음 |
| accessory 미완전 + INDOOR/OUTDOOR failed main 존재 | `false` (`Code.js:697-705`) | `false` (`RiUsageDecision.java:49-52,70-72`) | 같음 |
| accessory 미완전 + failed main 없음 | 단가==납품가 (`Code.js:695-707`) | `null`로 기존 revalidator 단가 판정 유지 (`RiUsageDecision.java:73-75`, `MonthEndCloseService.java:510-513`) | 표준 SINGLE 경로에서는 같음 |
| SINGLE의 기타 kind | `true` (`Code.js:711-712`) | `true` (`RiUsageDecision.java:28-30`) | 같음 |

즉 R12 표에 이미 적힌 boolean 조합값 자체는 표준 SINGLE 전제 안에서 맞다. 틀린 것은 그 표를 적용할 행을 고르는 입력 계약이다: §6의 zone 전환 상태, §7의 선행 분기 종결 여부, §9의 target-model predicate가 표에 없어서 다른 레거시 분기의 행이 같은 칸으로 들어온다.

## 11. 확인한 레거시 입력 전수 목록과 판정

| 입력 | 레거시 근거 | 현재 표/구현 판정 |
|---|---|---|
| scope(`일자_번호`) | `Code.js:473-481` | 표에 있음. 현대 scope 분리 유지. |
| 입력 행 순서 | `Code.js:486-498` | 표에 있음. 다만 R12 구현은 아래 zone 전환 이벤트를 잃어 근사임. |
| `_zone` 실제 값/직전 전환 종류 | `Code.js:483-498,690,714` | **표에 없음. 결함 1.** UNKNOWN/SINGLE/COMM_MULTI/HOME_MULTI 상태가 필요. |
| `AM...X/N`, `AJ...X/N` 토큰 패턴 | `Code.js:490-493` | **표에 없음. 결함 1의 전환 입력.** |
| `isTargetModelCode_(t)` | `Code.js:177-183,494-496` | **표에 없음. 결함 3.** main kind만으로 대체 불가. |
| main/accessory/기타 kind | `Code.js:488,691-712` | 표에 있음. main 존재/실패 집합도 분리 유지. |
| 자기 및 sibling 소비(total/used) | `Code.js:661-665,694,697-710` | 표에 있음. 현재 값 일치. |
| 수량 부호/0 | `Code.js:570-579` | 양쪽 모두 0→1, 그 외 절댓값 확장(`MonthEndCloseService.java:644-657`). 별도 축 아님. |
| 단가와 `_deliveryPrice` 일치 | `Code.js:695-707` | 표에 있음. 표준 SINGLE fallback 값 일치. |
| 품목명 `운임|절삭` | `Code.js:668-670` | **선행 라우팅이 표에 없음. 결함 2로 실제 override 가능.** |
| 품목명 `유연호스|발통세트|일자발|방진가대`, token `AXJ` | `Code.js:683-688` | **선행 라우팅이 표에 없음. 결함 2와 같은 override 구조.** |
| 품목명 `멀티|MULTI` | `Code.js:714-731` | **multi 라우팅이 표에 없음. 결함 2와 같은 override 구조.** |
| `_isOld` | `Code.js:519-520,671-682` | 표에 없음. 현대는 token 근사(`DiscountRevalidator.java:116-123`); 외부 OLD lookup 대응 fixture 부재로 단독 사례는 **미판정**. |
| `isMultiApplied` | `Code.js:672-685,715-716` | 레거시 입력이나 현대 정본은 항상 재검증(`true`)으로 고정. 변화축 아님; 표의 고정 전제로 명시 필요. |
| 할인율·`_fixedDc`·`discInfo` | `Code.js:675-680,718-731` | multi/old 선행 분기의 값 입력. 표준 SINGLE riUsage 내부 축은 아니나, branch selector 없이 riUsage가 override하면 영향받음. |

## 12. 최종 판정

- 질문 “순서 축까지 넣은 조합 표에 세 번째로 빠진 축이 있는가”의 답은 **있다**.
- 핵심 제3축은 단순 행 순서가 아니라 **행 순서에 따라 전파되는 zone 전환 상태/종류**다. R12는 `UNKNOWN → SINGLE`만 boolean으로 근사해 `COMM_MULTI/HOME_MULTI` 전환을 재구성하지 못한다.
- 별도로 표의 적용 전제인 **선행 판정 branch selector**와 **target-model predicate**도 입력 계약에서 빠졌다. 그 결과 이 각도에서 도달 가능한 결함은 총 **3건**이다(§6, §7, §9).
- R2(Q 자기 판정), R4(완전 소비 sibling 비차단), R6(두 집합 분리), R8(scope 비오염)은 타깃 테스트 및 원문 대조상 유지된다.
- 이 라운드에서는 지시대로 `#1058` 회귀, 세트 매칭, 전체 suite, 리팩터링, 라이브 QA를 수행하지 않았다.

## 13. 신규 파일

- `docs/dev-reports/2026-08-03-874-r13-reconvergence.md` (이 보고서) 1개.
- 기존 untracked `clients/desktop/playwright/874-riusage-real-qa.spec.ts`는 신규 작업물에 포함하지 않으며 수정하지 않았다.
