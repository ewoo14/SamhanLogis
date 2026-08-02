# Issue #874 R7 재수렴 검증 보고서

## 진행 기록

- 2026-08-03: 보고서를 조사 전에 제목만으로 생성했다.
- 적용 절차: `using-superpowers`, `systematic-debugging`. 수정은 하지 않고 레거시 원문 → R6 조합 표 → 실제 구현 → 테스트 순서로 근거를 추적한다.
- 범위 고정: R6 조합 표와 레거시의 일치 여부, 표와 실제 구현/테스트의 일치 여부, catalog 부재 fallback만 확인한다. `#1058` 무회귀 재측정, 세트 매칭, 전체 스위트, 리팩터링, 범위 밖 표면은 실행하지 않는다.
- 저장소 규칙 확인: git은 조회 명령만 사용하며 commit/push/checkout/branch/stash/reset을 하지 않는다. 공유 DB write/DDL, Docker 이미지 재빌드, `accounting-service` 전체 스위트도 실행하지 않는다.
- 작업 기준 확인: 브랜치 `feat/874-set-riusage-global-dc`, HEAD `4093427cc` (`[FIX] #874 hasSingleMain 과 hasFailedMain 을 두 집합으로 분리`)가 사용자 지정 기준과 일치한다. 조사 시작 시 기존 tracked 변경은 없고 이 보고서만 신규 미추적 파일이다.
- R6 보고서 확인: 조합 표는 14행이며 `INDOOR/OUTDOOR` 존재, `SUB_INDOOR` 단독, main 없음의 세 범주를 선언한다. `null`은 기존 단가 판정을 유지한다고 설명한다. 별도로 catalog가 비면 `AC023CN1DBC1`을 레거시 분류로 `INDOOR` 처리해야 한다고 기록했으나, 요청된 `AC/AP/AR/AF/PC` 전 토큰의 원문 대조는 R7에서 다시 수행한다.
- 레거시 지정 원문 확인: `Code.js:494-496`은 대상 모델의 `INDOOR | OUTDOOR | SUB_INDOOR`를 만나면 `hasSingleMain=true`로 둔다. `Code.js:691-692`는 main이 없고 대상이 `PANEL | REMOTE | MATERIAL`이면 usage와 무관하게 `true`; `:693-707`은 accessory가 완전 소비면 `true`, 아니고 `INDOOR | OUTDOOR` 중 하나라도 미완전이면 `false`, 그 밖은 `unitPrice === _deliveryPrice`; `:709-710`은 main 세 종류의 자기 usage 완전 여부; `:711-712`는 그 밖 kind를 `true`로 둔다. 특히 `hasFailedMain`은 `Code.js:697-700`상 `SUB_INDOOR`를 포함하지 않는다.

## 확정 결함 1 — catalog 부재 fallback이 레거시의 non-main 분류를 버린다

- 근거: 레거시 `tools/legacy-gas/일마감 프로그램/Code.js:187-190`의 `classifyComp()`는 `^PC`를 즉시 `PANEL`로 반환한다. 실제 fallback 호출도 `Code.js:488`에서 catalog map에 값이 없을 때 `classifyComp(t)`이다.
- 현행: `LegacyModelKindClassifier.java:24-27`의 내부 `classify()`도 `PC* -> PANEL`을 계산하지만, `:15-21`의 `riUsageKind()`는 generic `ACCESSORY`를 main(`INDOOR | OUTDOOR | SUB_INDOOR`)일 때만 교체한다. 따라서 `PC*`의 계산된 `PANEL`을 버리고 `ACCESSORY`를 반환한다. catalog 부재 호출부는 `MonthEndCloseService.java:630-631`, `:638-639`, `:660-664`에서 모두 generic `ACCESSORY`를 전달한다.
- 잘못된 테스트: `RiUsageDecisionTest.java:75-81`은 `riUsageKind("ACCESSORY", "PC1BWCK3NW") == "ACCESSORY"`를 기대해 구현의 오답을 그대로 정답으로 고정한다. 이는 표를 독립적으로 단정한 것이 아니라 이 fallback 칸에서 구현을 그대로 베낀 테스트다.
- 사용자 조작: catalog에 없는 `PC*` 패널이 포함된 싱글 일마감 상세을 조회한다.
- 잘못된 결과: 레거시는 `PANEL`이므로 `Code.js:691-707`의 accessory 분기(완전 소비 / failed-main / 단가 fallback)를 타야 하나, 현행은 `ACCESSORY`라 `RiUsageDecision.java:28-30`에서 무조건 `true`가 된다. 미소비 패널 + 실패 main이어도 잘못 통과할 수 있다.
- 재현 명령:

```powershell
$testLines = Get-Content -Encoding UTF8 'services/accounting-service/src/test/java/com/samhanair/logis/accounting/service/RiUsageDecisionTest.java'
foreach ($n in 75..81) { '{0}: {1}' -f $n, $testLines[$n-1] }
.\gradlew.bat :services:accounting-service:test --tests '*RiUsageDecisionTest.legacyClassifierIncludesApAndPcRulesWithoutOverridingConcreteCatalogKinds' --no-daemon --console=plain
```

- 출력 원문:

```text
75:     void legacyClassifierIncludesApAndPcRulesWithoutOverridingConcreteCatalogKinds() {
76:         assertThat(LegacyModelKindClassifier.riUsageKind("ACCESSORY", "AP052CNPFBH1PP"))
77:                 .isEqualTo("INDOOR");
78:         assertThat(LegacyModelKindClassifier.riUsageKind("ACCESSORY", "PC1BWCK3NW"))
79:                 .isEqualTo("ACCESSORY");
80:         assertThat(LegacyModelKindClassifier.riUsageKind("PANEL", "PC1BWCK3NW"))
81:                 .isEqualTo("PANEL");
> Task :services:accounting-service:test

BUILD SUCCESSFUL in 14s
21 actionable tasks: 1 executed, 20 up-to-date
```

이 GREEN은 레거시 parity의 증거가 아니라 `PC* -> ACCESSORY` 오답이 테스트에 고정됐다는 재현이다.

## 확정 결함 2 — 표가 서로 다른 scope 조합을 누락하고 구현이 두 `true`를 `false`로 합친다

- 빠진 조합: 동일 partner/model accessory가 둘 이상의 문서 scope에 있고, (A) main 없는 scope의 accessory는 미소비, (B) 실패한 `INDOOR | OUTDOOR` main이 있는 scope의 accessory는 완전 소비인 경우다.
- 레거시 원문 값:
  - scope A는 별도 invoice group이다(`Code.js:473-481`). `hasSingleMain`은 group마다 `false`로 초기화된다(`:483-484`). 따라서 미소비 accessory도 `:691-692`에서 `true`다.
  - scope B도 별도 invoice group이고 main 때문에 `hasSingleMain=true`다(`:494-496`). accessory 자기 usage가 완전하므로 failed main보다 우선하는 `:702-703`에서 `true`다.
  - 즉 레거시 결과는 A=`true`, B=`true`다.
- R6 표 누락: 표는 위 두 단일-scope 행을 각각 포함하지만 두 행이 같은 집계 model에 동시에 들어오는 조합은 없다.
- 현행 도달 경로: 일마감 집계 key `MonthEndCloseService.java:416-421`, `:868-874`는 partner/label/model/axis/unitPrice이고 document scope를 포함하지 않는다. 같은 집계 model의 모든 행을 `:618-622`에서 모으고, 그 scope 전부를 `:632-640`에서 한 번의 `RiUsageDecision.decide()`로 보낸다.
- 현행 오답 원인: `RiUsageDecision.java:32-34`는 focus row 전부가 완전할 때만 조기 `true`; 하나라도 미완전이면 `:35-49`에서 모든 scope의 `sawMain`/`failedMain`을 OR하고, scope B의 실패 main 하나 때문에 `:53-54`에서 집계 전체를 `false`로 반환한다. scope A의 `!hasSingleMain -> true`와 scope B의 `isUsed -> true` 우선순위가 소실된다.
- 사용자 조작: 같은 거래처·같은 `PC*` 패널·같은 단가의 판매가 두 문서에 있고, 한 문서는 main 없이 패널이 세트에 미사용, 다른 문서는 실패 main과 함께 있으나 패널 자체는 세트에 사용된 상태에서 일마감 상세을 조회한다.
- 잘못된 결과: 레거시는 두 문서의 패널을 모두 `확인=true`로 두지만 현행 집계 행은 `verified=false`가 된다.
- 재현 명령(조사용 임시 테스트를 추가해 실행한 뒤 즉시 제거):

```powershell
.\gradlew.bat :services:accounting-service:test --tests '*RiUsageDecisionTest.reconvergenceProbeTwoLegacyTrueScopesMustNotCollapseToFalse' --no-daemon --console=plain
```

- 출력 원문:

```text
> Task :services:accounting-service:test

RiUsageDecisionTest > reconvergenceProbeTwoLegacyTrueScopesMustNotCollapseToFalse() FAILED
    org.opentest4j.AssertionFailedError at RiUsageDecisionTest.java:146

> Task :services:accounting-service:test FAILED
21 actionable tasks: 2 executed, 19 up-to-date

1 test completed, 1 failed

FAILURE: Build failed with an exception.

BUILD FAILED in 19s
```

임시 테스트 입력은 `DOC-A: PC usage 0/1, main 없음`, `DOC-B: PC usage 1/1, OUTDOOR usage 0/1`이며 기대값은 위 레거시 두 분기 때문에 `true`다. 현행 반환은 `false`여서 RED가 재현됐다.

## R6 14행 표 단일-scope 전수 대조

| R6 행 | 레거시 원문 근거 | 레거시 값 | R6 값 | 판정 |
|---:|---|---:|---:|---|
| 1 | main 존재 `Code.js:494-496`; main 자기 usage `:709-710` | `true` | `true` | 일치 |
| 2 | `Code.js:494-496`, `:709-710` | `false` | `false` | 일치 |
| 3 | `SUB_INDOOR`도 존재 main `Code.js:494-496`; 자기 usage `:709-710` | `true` | `true` | 일치 |
| 4 | `Code.js:494-496`, `:709-710` | `false` | `false` | 일치 |
| 5 | accessory 분기 `Code.js:693-694`; `isUsed` 최우선 `:702-703` | `true` | `true` | 일치 |
| 6 | accessory 미완전 `Code.js:693-695`; failed I/O 없음 `:697-700`; 단가 `:706-707` | 단가 비교 | `null`→단가 비교 | 일치 |
| 7 | failed I/O 존재 `Code.js:697-700`; `:704-705` | `false` | `false` | 일치 |
| 8 | Q도 존재 main `Code.js:494-496`; 자기 usage `:709-710` | `true` | `true` | 일치 |
| 9 | `Code.js:494-496`, `:709-710` | `false` | `false` | 일치 |
| 10 | Q가 main 존재를 세움 `Code.js:494-496`; accessory `isUsed` 우선 `:693-703` | `true` | `true` | 일치 |
| 11 | Q는 failed-main에서 제외 `Code.js:697-700`; 단가 `:706-707` | 단가 비교 | `null`→단가 비교 | 일치 |
| 12 | 실제 main 없는 group은 `currentZone='UNKNOWN'`, `hasSingleMain=false`로 시작(`Code.js:483-484`)하고 `SINGLE` 진입 조건 `:494-496`도 충족하지 않으므로 최종 default `:733-734` | `true` | `true` | 값 일치, R6의 `:691-692` 인용은 도달 불가 분기 |
| 13 | 행 12와 동일: `Code.js:483-496`, `:733-734` | `true` | `true` | 값 일치, R6 근거 줄 부정확 |
| 14 | 실제 main 없는 group은 `Code.js:483-496`, 최종 default `:733-734` | `true` | `true` | 값 일치 |

단일 scope로 제한하면 14행의 **값**은 모두 레거시와 같다. 다만 `item._zone === 'SINGLE'`은 `Code.js:494-496`에서 `hasSingleMain=true`와 동시에만 만들어지므로 `Code.js:691-692`의 `!hasSingleMain` 분기는 원문 구조상 도달 불가다. R6 행 12~13의 값 `true`는 맞지만 실제 도달 근거는 `Code.js:733-734`다. 이 인용 오류 자체는 사용자 결과 차이가 없어 결함 수에 추가하지 않는다.

## catalog 부재 `AC/AP/AR/AF/PC` fallback 전수 대조

레거시 fallback 호출은 `Code.js:488`의 `classifyComp(t)`이고 분류 원문은 `:187-211`이다. 현행 catalog 부재 호출은 `MonthEndCloseService.java:630-631`, `:638-639`, `:660-664`이며 모두 `riUsageKind("ACCESSORY", token)`을 사용한다.

| family / 조건 | 레거시 (`Code.js`) | 현행 (`LegacyModelKindClassifier.java`) | 판정 |
|---|---|---|---|
| `AC\d{3}` / `AP\d{3}`, index 6=`N` | `:192-195` → `INDOOR` | `:32-35`, `:18-20` → `INDOOR` | 일치 |
| `AC\d{3}` / `AP\d{3}`, index 6=`X` | `:192-195` → `OUTDOOR` | `:32-37`, `:18-20` → `OUTDOOR` | 일치 |
| `AC/AP`이 위 main 조건 불충족 | `:192-197`, `:211` → `MATERIAL` | 내부 `:59`는 `MATERIAL`이나 `:18-21`이 generic `ACCESSORY` 유지 | **불일치(결함 1)** |
| `AR\d{2}`, 길이≥12, `-` 없음, index 11=`N/X/Q` | `:198-203` → `INDOOR/OUTDOOR/SUB_INDOOR` | `:40-49`, `:18-20` → 동일 | 일치 |
| `AR-...` | `:191` → `REMOTE` | 내부 `:29-30`은 `REMOTE`이나 `:18-21`이 `ACCESSORY` 유지 | **불일치(결함 1)** |
| 그 밖 `AR` | `:198-204`, `:211` → `MATERIAL` | 내부 `:59` 뒤 `:18-21`에서 `ACCESSORY` | **불일치(결함 1)** |
| `AF\d{2}`, 길이≥12, index 11=`N/X` | `:205-209` → `INDOOR/OUTDOOR` | `:51-57`, `:18-20` → 동일 | 일치 |
| 그 밖 `AF` | `:205-211` → `MATERIAL` | 내부 `:59` 뒤 `:18-21`에서 `ACCESSORY` | **불일치(결함 1)** |
| `PC*` | `:190` → `PANEL` | 내부 `:26-27`은 `PANEL`이나 `:18-21`이 `ACCESSORY` 유지 | **불일치(결함 1)** |

따라서 R6 fallback은 `AC/AP/AR/AF`의 **main 패턴만** 레거시와 맞고, `PC` 및 각 family의 non-main 결과(`PANEL`, `REMOTE`, `MATERIAL`)는 모두 generic `ACCESSORY`로 소실된다. 같은 `riUsageKind()`의 “main만 승격” 조건 하나에서 생긴 동일 원인이라 결함 1건으로 센다.

## 표와 테스트의 관계 확인

- `RiUsageDecisionTest.java:95-133`은 기대값을 `isTrue/isFalse/isNull` 리터럴로 적어 14행의 주요 단일-scope 결과를 직접 단정한다. 기대값 계산에 `isPresentMain()`/`isFailedMain()` 구현을 복제한 helper는 없으므로, 이 부분은 구현을 계산식으로 그대로 베낀 테스트는 아니다.
- 그러나 모든 matrix row가 scope `D1` 하나뿐이다(`:97-132`). 서로 다른 scope 두 개가 한 집계 model에 들어오는 결함 2 조합은 단정하지 않는다.
- catalog fallback은 반대다. `RiUsageDecisionTest.java:78-79`가 `PC* -> ACCESSORY`라는 현행 오답을 명시적으로 기대한다. 레거시 원문을 oracle로 삼지 않고 구현 의도를 그대로 고정했다.
- 테스트는 `null`까지만 단정하고 실제 `unitPrice === _deliveryPrice` 결과는 `RiUsageDecision` 바깥 기존 재검증에 위임한다. R7 범위에서는 R6 표의 `null→기존 단가` 계약만 확인했으며 `#1058` 무회귀 재측정은 하지 않는다.
- 현행 타깃 테스트 재실행:

```powershell
.\gradlew.bat :services:accounting-service:test --tests '*RiUsageDecisionTest' --no-daemon --console=plain
```

```text
> Task :services:accounting-service:test

BUILD SUCCESSFUL in 16s
21 actionable tasks: 2 executed, 19 up-to-date
```

이 GREEN은 단일-scope 14행 기대와 현행 구현이 일치함을 확인한다. 동시에 결함 1의 잘못된 `PC* -> ACCESSORY` 기대도 포함하고, 결함 2의 다중-scope 조합은 포함하지 않으므로 레거시 전체 parity 증거는 아니다.

## 결론

- **이 각도에서 도달 가능한 확정 결함 2건**이다.
  1. catalog 부재 fallback이 레거시의 non-main 분류(`PANEL`, `REMOTE`, `MATERIAL`)를 generic `ACCESSORY`로 버린다. `PC*`는 기존 테스트가 오답을 고정한다.
  2. R6 표가 다중-scope 조합을 빠뜨렸고, 실제 구현은 서로 다른 두 scope의 레거시 결과 `true + true`를 `false`로 합친다.
- R6의 14행 **단일-scope 값** 자체는 모두 레거시와 일치한다. 행 12~13은 값은 맞지만 `Code.js:691-692` 인용이 도달 불가이고 실제 근거는 `:733-734`다.
- 재현하지 못한 의심은 없으며 미판정 결함도 없다.

## 이번 라운드에서 보지 않은 표면

- `#1058` 무회귀 재측정
- 세트 매칭 및 금액/옵션 경로
- `accounting-service` 전체 suite와 전체 CI
- 리팩터링
- 공유 DB 실데이터 재측정 및 write/DDL
- Docker 이미지 재빌드
- R6 조합 표/riUsage 및 catalog fallback 밖의 모든 표면

## 신규 파일

- `docs/dev-reports/2026-08-03-874-r7-reconvergence.md` — 본 보고서

최종 `git status --short`는 위 신규 보고서 1개만 표시한다. 조사 중 재현용으로 잠시 추가한 테스트는 제거했으며 tracked 코드 diff는 없다. commit/push/checkout/branch/stash/reset은 하지 않았다.

## 최종 검증

완료 주장 직전 cache를 우회해 타깃 테스트만 fresh 재실행했다. 전체 suite는 실행하지 않았다.

```powershell
.\gradlew.bat :services:accounting-service:test --tests '*RiUsageDecisionTest' --rerun-tasks --no-daemon --console=plain
```

```text
> Task :services:accounting-service:test

BUILD SUCCESSFUL in 35s
21 actionable tasks: 21 executed
```
