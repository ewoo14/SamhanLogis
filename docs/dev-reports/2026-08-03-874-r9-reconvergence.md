# PR #1057 이슈 #874 R9 재수렴 조사

## 조사 기록

- 저장소 내 적용 `AGENTS.md`는 루트의 `AGENTS.md` 하나뿐임을 `rg --files -g AGENTS.md -g '!**/node_modules/**'`로 확인했다.
- `git log -1 --format='%H%n%D%n%s'` 결과 HEAD는 `ef7012454c8734e4f8756428ea3b76744e13b560`, 브랜치는 `feat/874-set-riusage-global-dc`, 제목은 `[FIX] #874 scope 간 오염 제거 + catalog 부재 분류 교정`이었다.
- `git status --short` 결과 조사 시작 시 신규 보고서 `docs/dev-reports/2026-08-03-874-r9-reconvergence.md`만 untracked였고 다른 작업트리 변경은 없었다.
- R8 보고서의 기준 표를 원문으로 확인했다. 표가 명시한 축은 scope, scope 안 main 구성, 주 품목 소비, 대상 kind, 대상 자신의 소비, fallback 단가이며, R8은 `Code.js:483-496,688-712,733-734`에 그 밖의 판정 축이 없다고 결론냈다. catalog 부재 fallback 기준은 `Code.js:187-211`의 `PC* → PANEL`, `AR-* → REMOTE`, non-main `AC/AP/AF → MATERIAL`, main 패턴 `AC/AP/AR/AF → INDOOR/OUTDOOR/SUB_INDOOR`라고 기록돼 있다.
- 지정 원문 `Code.js:483-496`을 직접 확인했다. `:483-484`는 `currentZone='UNKNOWN'`, `hasSingleMain=false`로 시작하고, `:486-488`은 각 전표 행의 `품목명`에서 token을 뽑아 catalog 또는 `classifyComp(t)`로 class를 정한다. `:490-493`은 표에 기재되지 않은 `AM...`/`AJ...` 품목명 패턴과 7번째 문자 `X|N`을 보고 각각 `COMM_MULTI`/`HOME_MULTI` zone을 정하며, `:494-496`은 target model의 `INDOOR|OUTDOOR|SUB_INDOOR`일 때 `SINGLE`과 `hasSingleMain=true`를 정한다.
- 지정 원문 `Code.js:688-712`을 직접 확인했다. SINGLE 판정은 `item._zone`(`:690`), `hasSingleMain`(`:691`), `item._cls`(`:691,693,709`), 대상 및 main의 `riUsage.used/total`(`:694,697-700,710`), `단가(VAT포함)`과 `_deliveryPrice`(`:695,707`)를 읽는다. 수량 부호를 이 구간에서 직접 읽는 분기는 없다.
- 지정 원문 `Code.js:733-734`를 직접 확인했다. 앞 zone 분기에 걸리지 않은 행은 최종 `else`에서 무조건 `확인=true`다.
- `_zone` 생성부의 바로 다음 원문까지 추적했다. `Code.js:486`의 순차 `items.forEach` 안에서 앞 행이 `currentZone`을 바꾸고(`:490-496`), 각 행은 그 순간 값을 `_zone`으로 저장한다(`:498`). 따라서 **전표 행 순서/대상 행 앞에서 마지막으로 zone을 바꾼 품목 패턴**은 R8 조합 표에 없는 독립 판정 축이다. 같은 scope와 같은 최종 main 구성이라도 대상 부속이 main보다 앞이면 `_zone='UNKNOWN'`이라 `:733-734`의 `true`, 뒤이면 `_zone='SINGLE'`이라 `:690-707`의 소비/단가 판정을 받는다.
- `Code.js:490-493,498`에 의해 `AM...`/`AJ...`의 7번째 문자 `X|N`도 행 순서와 결합해 뒤따르는 행의 `_zone`을 `COMM_MULTI`/`HOME_MULTI`로 만든다. 이는 R8의 “I/O 존재·SUB만·main 없음” 구성 축만으로 표현되지 않는다.
- 최종 판정의 앞선 우선순위 분기도 확인했다. `Code.js:668-670`의 품목명 `운임|절삭`, `:671-682`의 `_isOld` 및 token `AM|NJ|NS|AVX`, `:683-689`의 품목명 `유연호스|발통세트|일자발|방진가대` 또는 token `AXJ`는 `_zone==='SINGLE'`보다 먼저 판정되어 R8 표의 RI 조합 분기에 도달하지 않는다. 따라서 표가 전체 레거시 `확인` 판정표를 자처한다면 이 입력 축/선행 분기가 누락돼 있다. 다만 현행 `RiUsageDecision` 호출 대상에서 이 선행 분기들이 이미 제외되는지는 구현 호출부와 대조해야 하므로 그 일치 여부는 아직 미판정이다.
- 구현/테스트 위치 검색으로 대조 대상을 `LegacyModelKindClassifier.java`, `RiUsageDecision.java`, `MonthEndCloseService.java:592,628-637` 및 `RiUsageDecisionTest.java`로 좁혔다. 광범위 `rg` 명령은 관련 결과를 찾았지만 `Select-Object -First 300` 파이프 종료 때문에 exit 1이었으므로 재현/검증 명령으로는 사용하지 않는다.
- `RiUsageDecision.java`와 호출부를 직접 대조했다. `Row`에는 `sourceKey/scopeKey/modelToken/kind`만 있고(`:83`), `_zone`, 행 순서, 원 품목명, `_isOld`, 할인율/멀티 적용 상태는 없다. accessory 판정은 같은 scope의 전체 rows에서 main 존재/실패만 계산한다(`:32-59`). 따라서 R8 표와 이 helper 구현은 서로 일치하지만, 둘 다 레거시의 행별 `_zone` 축은 표현할 수 없다.
- 호출부 `MonthEndCloseService.java:615-641`는 `GasCategoryAxis.SINGLE`인 같은 model/partner 행을 찾고, 그 행들의 scope에 속한 모든 SINGLE pool 행을 helper에 전달한다. 이 구간 역시 source 행 순서나 legacy `_zone`을 전달하지 않는다. 다만 `GasCategoryAxis.SINGLE` 산출 단계가 레거시의 순차 zone을 보존하는지는 추가 추적 전이므로 실제 사용자 결함 판정은 아직 미판정이다.
- `RiUsageDecisionTest.java:11-155`의 fixture도 `Row` 네 필드와 usage만 만들며 행별 `_zone`/순서 기대를 독립 축으로 고정하지 않는다. 특히 main 없음 기대(`:136-138`)와 I/O+부속 3갈래(`:113-124`)는 helper 구현 구조를 그대로 검증하고 있어, “부속이 main 앞이면 legacy default true”인 순서 조합을 재현하지 못한다.
- catalog fallback 원문 `Code.js:187-211`을 직접 확인했다. `PC* → PANEL`(`:190`), `AWR-|AR- → REMOTE`(`:191`), `AC/AP`의 7번째 `N/X → INDOOR/OUTDOOR`(`:192-197`), hyphen 없는 `ARdd`의 12번째 `N/X/Q → INDOOR/OUTDOOR/SUB_INDOOR`(`:198-204`), `AFdd`의 12번째 `N/X → INDOOR/OUTDOOR`(`:205-210`), 나머지 `MATERIAL`(`:211`)이다. Java `LegacyModelKindClassifier.java:29-64`는 이 순서와 값을 그대로 구현한다. 따라서 질문에 명시된 `PC → PANEL`, `AR- → REMOTE`, non-main `AC/AP/AF → MATERIAL` 값은 레거시와 같다.
- fallback의 main 패턴도 값 기준으로 보존돼 있다. Java `LegacyModelKindClassifier.java:37-63`은 원문 `Code.js:192-210`의 AC/AP·AR·AF `N/X/Q` 분기를 그대로 반환하며, `riUsageKind()`는 catalog가 generic `ACCESSORY`일 때 main 결과만 보정한다(`LegacyModelKindClassifier.java:15-21`). R8 변경이 이 코드를 새로 변형했는지는 commit diff로 별도 확인한다.
- 경계 차이 하나는 확인했다. 레거시 `classifyComp`는 빈 값이면 `UNKNOWN`(`Code.js:188`)이지만 Java `fallbackKind(null|"")`는 `MATERIAL`(`LegacyModelKindClassifier.java:29-30,64`)이다. 현재 호출부는 `modelToken == null`이면 RI 판정을 중단한다(`MonthEndCloseService.java:615-617`); 빈 문자열 token의 도달 가능성은 이 라운드에서 아직 미판정이며, 질문의 세 fallback 예시 값에는 영향을 주지 않는다.
- `git diff HEAD^ HEAD -- ...`로 R8 commit을 조회했다. classifier 변경은 기존 `classify(modelToken)`을 그대로 호출하는 `fallbackKind()` 5줄 추가뿐이고 기존 main 분류 본문은 변경하지 않았다. 호출부 세 곳만 generic `riUsageKind("ACCESSORY", token)`에서 `fallbackKind(token)`으로 바뀌었다. 따라서 R8은 main 패턴 구현을 건드리지 않았고, catalog 부재 non-main을 레거시 `MATERIAL/PANEL/REMOTE`로 통과시키는 경계만 바꿨다.
- `SetPoolLine` 생성/axis 검색 결과 `MonthEndCloseService.java:373-375,418-420`에서 axis는 source `categoryKey`를 `GasCategoryAxis.fromScheduleKey()`로 바꿔 저장한다. source 순서 기반 `_zone`을 생성하는 코드는 검색되지 않았다. 실제 값 전달을 다음 원문 조회로 확인한다.
- 실제 생성부를 확인했다. `MonthEndCloseService.java:358-375`는 호출 순서대로 `setPool`에 source 행을 추가하지만 각 행의 axis는 `categoryKey` 단독으로 정한다(`:373-375`). `GasCategoryAxis.java:8-10` 문서는 GAS가 원본 행 순서로 `currentZone`을 전환한다고 명시하지만, `fromScheduleKey()` 구현은 입력 schedule key만 enum에 매핑한다(`:58-65`). 즉 현행은 row order에서 legacy `_zone`을 재구성하지 않고 source categoryKey를 행별 zone 대용으로 신뢰한다.
- 따라서 R8 표/구현의 `_zone` 누락은 단순 문서 누락으로 끝나지 않는다. 같은 scope에서 `singleSets` categoryKey를 가진 부속과 I/O main이 있을 때 현행은 두 행의 순서와 무관하게 둘 다 SINGLE로 다루지만(`MonthEndCloseService.java:619,635`), 레거시는 각 행을 만난 시점의 zone을 저장한다(`Code.js:486,490-498`). 실제 결과 차이는 기존 타깃 테스트와 legacy oracle로 재현한다.

### 재현 1 — 부속 행이 main보다 앞인 순서

- 현행 fixture: `RiUsageDecisionTest.java:23-29`는 같은 scope의 `PANEL` 행을 먼저, 미소비 `INDOOR` 행을 나중에 두고 `false`를 기대한다. 타깃 실행 결과 원문:

```text
> Task :services:accounting-service:test

BUILD SUCCESSFUL in 13s
21 actionable tasks: 1 executed, 20 up-to-date
```

- 실행 명령: `./gradlew.bat :services:accounting-service:test --tests "com.samhanair.logis.accounting.service.RiUsageDecisionTest.accessoryIsFalseWhenMainInTheSameScopeIsIncomplete" --no-daemon --console=plain`
- 이 GREEN은 현행이 해당 순서에서 `false`를 반환한다는 증거다. 같은 순서의 legacy 결과는 다음 oracle 확인 전까지 미판정으로 둔다.
- 첫 Node oracle 시도는 PowerShell stdin 전달 과정에서 한글 경로 `일마감 프로그램`이 `??? ????`로 손상되어 `ENOENT`(exit 1)였다. 판정 결과를 얻지 못했으므로 증거에서 제외하고, `Resolve-Path` 값을 환경변수로 전달해 재시도한다.
- 재시도 oracle은 repo의 실제 `Code.js:177-212` 함수 원문을 읽어 실행하고 `:483-500,690-712,733-734` 판정을 같은 순서로 적용했다. 출력 원문:

```json
{
  "hasSingleMain": true,
  "items": [
    { "name": "PC1BWCK3NW", "cls": "PANEL", "zone": "UNKNOWN", "confirmed": true },
    { "name": "AC023AN", "cls": "INDOOR", "zone": "SINGLE", "confirmed": false }
  ]
}
```

- 레거시 PANEL 행 결과는 `true`, 현행 기존 테스트 결과는 `false`이므로 불일치가 재현됐다. 현행 `false`가 사용자 화면/응답의 어느 필드에 반영되는지는 적용부를 추적한 뒤 결함 항목을 확정한다.
- 적용부 `MonthEndCloseService.java:510-529`를 확인했다. non-null RI 결과는 `revalidation.withVerified(...)`로 기존 단가 판정을 덮고(`:510-514`), 최종 `DailyProductLine.verified`로 반환된다(`:515-529`). 따라서 위 차이는 내부 helper에 머물지 않고 일마감 품목 행의 검증 결과에 도달한다.
- 수량 부호를 추적했다. 레거시는 SINGLE pool에 `Math.abs(qty)`개를 넣고(`Code.js:568-583`), 현행도 `Math.abs(quantity.intValueExact())`개를 넣는다(`MonthEndCloseService.java:649-655`). 최종 분기는 양쪽 모두 그 pool에서 계산된 `used/total`만 읽는다(`Code.js:661-665,694,697-710`; `RiUsageDecision.java:49,56-64`). 따라서 수량 **부호 자체**는 소비 상태 축과 별개의 누락 축이 아니며, 수량 0은 양쪽 모두 1개로 취급한다(`Code.js:571`; `MonthEndCloseService.java:649-650`).

## R8 조합 표 값 대조

- I/O 또는 SUB target 자신의 완전/미완전: 해당 target 행 자체가 `SINGLE`을 설정하므로(`Code.js:494-498`) `:709-710`의 자기 usage `true/false`가 항상 적용된다. R8 표와 현행 `RiUsageDecision.java:25-26`이 같다.
- 부속 완전 소비: target이 main 전이면 default `true`(`Code.js:733-734`), main 후이면 SINGLE 자기 소비 우선 `true`(`:693-703`)라 순서와 무관하게 R8 표/현행 `RiUsageDecision.java:49-50`이 같다.
- I/O 완전 + 부속 미완전: 부속이 main **뒤**면 단가 fallback(`Code.js:693-707`)으로 R8 표/현행 null(`RiUsageDecision.java:52-59`)이 같지만, 부속이 main **앞**이면 `_zone=UNKNOWN`(`Code.js:483,486,494-498`) 후 default `true`(`:733-734`)다. R8 표와 현행이 이 순서 조합에서 다르다.
- I/O 실패 + 부속 미완전: 부속이 main **뒤**면 `false`(`Code.js:697-705`)로 R8 표/현행이 같지만, 부속이 main **앞**이면 default `true`(`:733-734`)다. 재현 1의 불일치다.
- SUB만 + 부속 미완전: 부속이 SUB **뒤**면 단가 fallback(`Code.js:694-700,706-707`)으로 R8 표/현행 null이 같지만, 부속이 SUB **앞**이면 default `true`(`:733-734`)다.
- main 없음: AM/AJ/MULTI 선행도 없는 실제 UNKNOWN이면 default `true`(`Code.js:483,733-734`)로 표/현행이 같다. 그러나 AM/AJ가 앞에 있으면 `COMM_MULTI/HOME_MULTI`(`:490-493,498`)이고 별도 할인율 판정(`:714-731`)이므로 “main 없음이면 항상 true”라는 표의 값은 전체 조합에는 성립하지 않는다.
- R8의 교차-scope 세 행도 각 scope 내부 부속/main 순서를 추가하면 값이 갈린다. 현행은 scope만 나눈 뒤 순서를 버리므로(`RiUsageDecision.java:32-59`) 표와 구현은 일치하지만, 위 legacy 순서 조합을 베낀 것이 아니라 누락한 상태다.
- 품목명/구형 선행 분기의 현행 대응을 검색했다. `DiscountRevalidator.java:33-35,99-126`에 운임·절삭, 구형 prefix, 액세서리 품목명/AXJ 분기가 존재한다. 그러나 그 결과 뒤에 `riUsageDecision`의 non-null 값을 덮어쓰는 구조(`MonthEndCloseService.java:500-514`)라, model token이 있고 SINGLE axis인 특수 품목에서는 RI helper가 선행 분기 결과를 다시 바꿀 가능성이 있다. 실제 조건/결과를 원문 조회 후 판정한다.
- 현행 선행 분기 본문을 확인했다. 운임/절삭은 즉시 true(`DiscountRevalidator.java:99-103`), 구형은 50%(`:116-124`), 액세서리 품목명/AXJ는 단가 일치(`:125-131`), 멀티는 할인율(`:133-144`)을 반환하지만 `withVerified()`는 그 status/참고값을 유지한 채 verified만 교체한다(`:360-373`). 그러나 실제로 RI override가 발생하려면 해당 행에 non-null 인식 model token과 SINGLE categoryKey가 함께 있어야 한다. 그 사용자 도달 fixture는 이번 타깃에서 재현하지 않았으므로 **품목명/구형 선행 분기 오염 의심은 미판정**으로 분류한다.

## 확정 결함 — 조합 표와 구현에 대상 행의 legacy `_zone`/순서 축 누락

### 파일:줄

- legacy zone 생성: `tools/legacy-gas/일마감 프로그램/Code.js:483-498`
- legacy SINGLE/default 결과: 같은 파일 `:690-712,733-734`
- 현행 순서 소실: `services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/RiUsageDecision.java:32-59,83`
- 현행 source categoryKey 기반 axis: `services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/MonthEndCloseService.java:358-375,615-641`
- 잘못된 기대를 고정한 기존 테스트: `services/accounting-service/src/test/java/com/samhanair/logis/accounting/service/RiUsageDecisionTest.java:23-29`

### 사용자 조작

같은 게시 판매전표(같은 slip scope)의 `singleSets` 행에서 미소비 PANEL/REMOTE/MATERIAL 부속을 먼저 놓고, 미소비 INDOOR 또는 OUTDOOR main을 뒤 행에 놓은 뒤 일마감 상세를 조회한다. 구체 재현 fixture는 1행 `PC1BWCK3NW`(PANEL), 2행 `AC023AN`(INDOOR), 둘 다 미소비다.

### 잘못된 결과

- legacy: 첫 PANEL을 읽을 때 아직 `currentZone='UNKNOWN'`이므로 `_zone='UNKNOWN'`(`Code.js:483,486,498`), 마지막 default에서 `확인=true`(`:733-734`). 뒤의 INDOOR만 자신의 행에서 SINGLE이 된다(`:494-498`).
- 현행: row별 `_zone`이 없고 같은 scope의 실패 main 존재만 보므로 `false`(`RiUsageDecision.java:52-59`). 이 값이 `DailyProductLine.verified`를 덮는다(`MonthEndCloseService.java:510-529`).
- 즉 사용자는 legacy에서 정상(`확인=true`)이던 선행 부속 행을 현행 일마감에서 불일치(`verified=false`)로 본다.

### 재현 명령과 출력 원문

현행:

```powershell
.\gradlew.bat :services:accounting-service:test --tests "com.samhanair.logis.accounting.service.RiUsageDecisionTest.accessoryIsFalseWhenMainInTheSameScopeIsIncomplete" --no-daemon --console=plain
```

```text
> Task :services:accounting-service:test

BUILD SUCCESSFUL in 13s
21 actionable tasks: 1 executed, 20 up-to-date
```

legacy oracle는 repo의 실제 `Code.js:177-212` 분류 함수를 읽어 실행하고, 지정 판정 구간 `:483-500,690-712,733-734`를 두 행 fixture에 적용했다. 실행 명령:

```powershell
$env:T874_CODEJS=(Resolve-Path -LiteralPath 'tools/legacy-gas/일마감 프로그램/Code.js').Path
@'
const fs=require('fs'),vm=require('vm');
const s=fs.readFileSync(process.env.T874_CODEJS,'utf8').split(/\r?\n/);
vm.runInThisContext(s.slice(176,212).join('\n'));
const items=[
  {name:'PC1BWCK3NW',ri:'P',unitPrice:100,deliveryPrice:200},
  {name:'AC023AN',ri:'I',unitPrice:100,deliveryPrice:100}
];
let currentZone='UNKNOWN',hasSingleMain=false;
for(const item of items){
  const t=item.name,cls=classifyComp(t);
  if(/^AM/.test(t)&&t.length>=7&&(t[6]==='X'||t[6]==='N')) currentZone='COMM_MULTI';
  else if(/^AJ/.test(t)&&t.length>=7&&(t[6]==='X'||t[6]==='N')) currentZone='HOME_MULTI';
  else if(isTargetModelCode_(t)&&['INDOOR','OUTDOOR','SUB_INDOOR'].includes(cls)){
    currentZone='SINGLE'; hasSingleMain=true;
  }
  item.zone=currentZone; item.cls=cls;
}
const riUsage={P:{used:0,total:1},I:{used:0,total:1}};
for(const item of items){
  if(item.zone==='SINGLE'){
    if(!hasSingleMain&&['PANEL','REMOTE','MATERIAL'].includes(item.cls)) item.confirmed=true;
    else if(['PANEL','REMOTE','MATERIAL'].includes(item.cls)){
      const isUsed=riUsage[item.ri]&&riUsage[item.ri].used===riUsage[item.ri].total;
      const hasFailedMain=items.some(it=>['INDOOR','OUTDOOR'].includes(it.cls)&&(!riUsage[it.ri]||riUsage[it.ri].used!==riUsage[it.ri].total));
      item.confirmed=isUsed?true:hasFailedMain?false:item.unitPrice===item.deliveryPrice;
    } else if(['INDOOR','OUTDOOR','SUB_INDOOR'].includes(item.cls))
      item.confirmed=riUsage[item.ri]&&riUsage[item.ri].used===riUsage[item.ri].total;
    else item.confirmed=true;
  } else item.confirmed=true;
}
console.log(JSON.stringify({hasSingleMain,items:items.map(({name,cls,zone,confirmed})=>({name,cls,zone,confirmed}))},null,2));
'@ | node -
```

결과 원문:

```json
{
  "hasSingleMain": true,
  "items": [
    {
      "name": "PC1BWCK3NW",
      "cls": "PANEL",
      "zone": "UNKNOWN",
      "confirmed": true
    },
    {
      "name": "AC023AN",
      "cls": "INDOOR",
      "zone": "SINGLE",
      "confirmed": false
    }
  ]
}
```

첫 시도의 한글 경로 손상 `ENOENT`는 위 조사 기록대로 증거에서 제외했다.

## 결론

**이 각도에서 도달 가능한 결함 1건.** R8 조합 표에 빠진 핵심 축은 **대상 행을 처리할 당시의 legacy `_zone`**, 동치 표현으로는 **전표 행 순서와 대상 행 앞의 마지막 zone 전환 패턴**이다. 기존 표의 scope/main 구성/소비/kind/단가 축만으로는 같은 최종 행 집합의 서로 다른 순서를 구분할 수 없다. 표와 현행 helper/test는 서로 일치하지만 legacy와는 위 조합에서 다르다.

추가로 확인한 legacy 입력 목록:

1. scope key `일자+번호`와 scope 내 원본 행 순서(`Code.js:473-480`).
2. 품목명에서 추출한 token 및 catalog/classifier kind(`:486-488`).
3. `AM/AJ` zone marker와 target main pattern(`:490-498`).
4. 행별 `_zone`, group 전체 `hasSingleMain`, 대상/main `riUsage.used/total`(`:690-710`).
5. 대상 kind와 단가(VAT포함)/납품가 일치(`:691-710`).
6. 수량의 절댓값 pool 확장과 0→1 처리(`:568-583`); 부호는 독립 축이 아님.
7. 앞선 운임·절삭, 구형, 특수 액세서리명/AXJ, 멀티 품목명 분기(`:668-731`). 이 중 특수 선행 분기의 현행 오염 가능성은 사용자 도달 fixture를 재현하지 않아 미판정.
8. catalog 부재 `PC/AR-/AC/AP/AF` fallback과 main `N/X/Q` 패턴(`:187-211`); R8 구현 값은 일치하고 main 분류 본문은 변경되지 않음.

이번 라운드가 보지 않은 표면: `#1058` 무회귀, 세트 매칭, accounting-service 전체 스위트, 리팩터링, 범위 밖 표면, 공유 DB 실데이터 재측정. 공유 DB write/DDL과 Docker 이미지 재빌드는 수행하지 않았다. Git은 `log/diff/status` 조회만 사용했고 commit/push/checkout/branch/stash/reset은 수행하지 않았다.

신규 파일:

- `docs/dev-reports/2026-08-03-874-r9-reconvergence.md` — 본 조사 보고서

## 최종 검증

- 최종 PowerShell checklist 결과 보고서는 192줄, trailing whitespace 0줄, 필수 섹션 존재 `True`, 확정 결함 문구 1건, 미판정 표기 존재 `True`, 예상 신규 파일만 존재 `True`였다.
- `git diff --check`는 출력 없이 exit 0이었다.
- `git status --short`는 `?? docs/dev-reports/2026-08-03-874-r9-reconvergence.md` 한 줄뿐이었다.
