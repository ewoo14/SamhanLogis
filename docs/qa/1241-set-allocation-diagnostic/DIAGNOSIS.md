# 🔬 진단 — 세트 배분 비율의 정본은 무엇인가

## ① 환경 확인

요청받은 명령과 출력 원문이다. `git status --porcelain`의 두 경로는 진단 시작 전부터 존재한 미추적 QA 산출물이며 이번 진단에서 수정하지 않았다.

```text
cd C:\dev\Samhan-Public\.claude\worktrees\wgas1
git rev-parse HEAD
git status --porcelain
3c76f0eec771463496e197ff4377b7a97e2e9ee1
?? clients/desktop/playwright/1241-r16-adversarial-real-qa/
?? docs/qa/1241-r16-adversarial/
```

금지 사항을 지켰다. `git add`, `git commit`, `git push` 및 코드 수정은 실행하지 않았다. 이 파일은 요청받은 진단 보고서다.

## ② AC060CS6PBH1SY 분류 원문

### 판정

`AC060CS6PBH1SY`는 **가정용이 아니다. 정확한 분류는 비가정 `360 / CST UV` 싱글세트**다. 질문의 두 번째 선택지인 “비가정 4way”와 같은 4:6 배분 분기를 타지만, 품목명 자체는 4way가 아니라 360 CST UV다.

현재 `product_db`의 품목·분류 join 원문은 다음과 같다. UUID는 사용자 비공개 규칙에 따라 출력하지 않았다.

```text
model_code|product_category|catL|catM|delivery_price
AC060CS6PBH1SY|SINGLE_SET|360|CST UV|1660000.00
```

같은 DB의 기본 구성품 배분 계약 원문이다.

```text
component_product_code|component_kind|allocation_mode|allocation_weight|fixed_allocation_amount
PC6NUNK1NW|PANEL|FIXED||104060.00
AR-EH05|REMOTE|FIXED||13915.00
AC060CN6PBH1|INDOOR|AUTO|4|
AC060CXAPBH1|OUTDOOR|AUTO|6|
```

추적된 카탈로그 스냅샷 `docs/dev-reports/1008-r9-snapshot/single-components-A1-N1737.csv:1-5` 원문도 동일하다.

```csv
"DVM S_*신통신_[상업용] 품    명","평형","모델명","구분","단위","출고가","수량"," 납품가"," 납품가","소   계"," 모듈조합"," 규격"," 세트"," 구성품 특징"
"360 CST UV","15","AC060CS6PBH1SY","세트","SET","  2,516,800 ","","  1,660,000 ","  1,660,000 ","","","","",""
"360 CST UV 실내기","15","AC060CN6PBH1","실내기","대","  935,000 ","","","  606,000 ","  - ","","싱글 360","AC060CS6PBH1SY","기본"
"360 CST UV 실외기","15","AC060CXAPBH1","실외기","대","  1,331,000 ","","","  910,000 ","  - ","","싱글 360","AC060CS6PBH1SY","기본"
"판넬 (360CST / 원형 / WIFI)","","PC6NUNK1NW","판넬","EA","  189,200 ","0 ","  128,000 ","  128,000 ","  - ","","원형노출","AC060CS6PBH1SY","기본"
```

실 bootstrap 응답에서 옮긴 fixture도 `clients/web/order-app/src/__tests__/fixtures/singleSetsBootstrap.fixture.json:10`에서 다음과 같이 단정한다.

```json
{ "id": "360 CST UV0", "model": "AC060CS6PBH1SY", "name": "360 CST UV" }
```

## ③ 레거시 GAS 원문(파일:줄)

정본 대상은 거래처용 주문서웹이므로 `tools/legacy-gas/거래처 발송 주문서/index.html`을 확인했다.

### 분류 원문 — `:2376-2412`

```javascript
2376: function classifySingleSetFixed(s){
2377:   const hay=((s?.name||'')+' '+(s?.model||'')+' '+(s?.spec||'')).toLowerCase();
2378:   const mdl=(s?.model||'').trim();
2379:   if (/^ADP-F075SP$/i.test(mdl)) {return { catL: '부자재', catM: '' };}
2380:   const has=rx=>rx.test(hay);const any=(...r)=>r.some(has);
2381:   const is25=/25\s*년형/.test(hay),isCoolOnly=any(/냉방전용/,/냉전/),isHeatCool=/냉난방/.test(hay);
2382:   let L='기타',M='';
2383:   if(any(/발통/,/일자발/,/받침/)){L='실외기 받침';}
2384:   else if(any(/360/,/cst/)){L='360';if(any(/cst\s*uv/,/uv/)) M='CST UV';}
2385:   else if(any(/4\s*way/,/4way/)){if(isHeatCool)L='4way 냉난방';else if(isCoolOnly)L='4way 냉방전용';if(L==='4way 냉난방'){if(/프레스티지/.test(hay))M='프레스티지';else if(any(/프리미엄/,/디럭스/))M='프리미엄/디럭스';else if(/1\s*등급/.test(hay))M='1등급';}}
...
2396:   }else if(/가정용/.test(hay)){
...
2404:     L='가정용 에어컨';
...
2412:   return {catL:unifyCatL_(L),catM:M};
```

`360`/`cst` 검사가 `가정용` 검사보다 먼저다. 따라서 이름 `360 CST UV`는 `catL='360'`, `catM='CST UV'`이며 가정용이 아니다.

### 비율 결정 원문 — `:3160-3176`

```javascript
3160:   // 비율 결정
3161:   const fixedCls = classifySingleSetFixed(s);
3162:   const isHousehold =
3163:     /가정용\s*에어컨/.test(String(fixedCls?.catL||'')) ||
3164:     /가정용\s*에어컨/.test(String(s?.name||''));
3165:   const ratioIn = isHousehold ? 6 : 4;
3166:   const ratioOut = isHousehold ? 4 : 6;
3167:   // console.log('🧭 배분 기준', { isHousehold, ratioIn, ratioOut });
3168:
3169:   // 배분 적용
3170:   if (indoorParts.length && outdoorParts.length){
3171:     const { indoor, outdoor, remain } = splitIndoorOutdoorToK(setUnit, fixedSum, ratioIn, ratioOut);
3172:
3173:     // 단일 항목 처리
3174:     if (indoorParts.length === 1 && outdoorParts.length === 1){
3175:       indoorParts[0].price = indoor;
3176:       outdoorParts[0].price = outdoor;
```

### `splitIndoorOutdoorToK` 원문 — `:1655-1683`

```javascript
1655: // 잔액을 비율로 나눠 둘 다 천 단위로 맞춤
1656: function splitIndoorOutdoorToK(setUnit, fixedSum, ratioIn, ratioOut){
1657:   // 잔액 계산
1658:   const remain = Math.max(0, Math.round(Number(setUnit)||0) - Math.round(Number(fixedSum)||0));
1659:   // console.log('🎯 세트 단가 잔액', { setUnit, fixedSum, remain });
1660:
1661:   // 비율 배분 초깃값
1662:   const tot = ratioIn + ratioOut;
1663:   let indoor = Math.round(remain * ratioIn / tot);
1664:   let outdoor = remain - indoor;
1665:
1666:   // 실내기 천 단위
1667:   indoor = roundK(indoor);
1668:
1669:   // 실외기 보정
1670:   outdoor = remain - indoor;
1671:   const mod = ((outdoor % 1000) + 1000) % 1000;
1672:   if (mod !== 0){
1673:     // 실내기에서 이동해 실외기 천 단위 맞춤
1674:     if (outdoor > 0){ indoor -= mod; outdoor += mod; }
1675:     else { indoor += (1000 - mod); outdoor -= (1000 - mod); }
1676:   }
1677:
1678:   // 음수 방지
1679:   if (indoor < 0){ outdoor += indoor; indoor = 0; }
1680:   if (outdoor < 0){ indoor += outdoor; outdoor = 0; }
1681:
1682:   // console.log('⚖️ 배분 결과', { indoor, outdoor, sum: indoor + outdoor, remain });
1683:   return { indoor, outdoor, remain };
```

이 SKU에 실제 수치를 대입하면 다음과 같다.

```text
setUnit = 1,660,000
fixedSum = 패널 104,060 + 리모컨 13,915 = 117,975
remain = 1,542,025
isHousehold = false → ratioIn:ratioOut = 4:6
indoor 초기 = round(1,542,025 × 4/10) = 616,810
roundK(indoor) = 617,000
outdoor = 1,542,025 - 617,000 = 925,025
mod = 25
코드 :1674 적용 → indoor = 616,975 / outdoor = 925,050
```

따라서 **레거시 GAS 원문이 이 세트에 내는 값은 실내기 616,975원, 실외기 925,050원**이다. 주석에는 “둘 다 천 단위”라고 쓰였지만 실제 `:1674` 구현은 `mod`를 실내에서 빼고 실외에 더하므로 끝전 `975/050`을 낸다. 주석이 아니라 실행 코드가 정본이다.

## ④ BundleExpanderIT 원문과 이력

### `BundleExpanderIT.java:238-267`

```java
    @Test
    void 가정용_싱글세트_세트단가_실내6_실외4_재배분() {
        Category cat = categoryRepository.save(Category.create("GH-SET", "test", null, 10));
        Product parent = bundleSet("GH_SET", "가정용 에어컨 무풍", cat, new BigDecimal("1000000"));
        product("GH_IN", "실내기 4평", cat, ProductCategory.SINGLE_PART, new BigDecimal("300000"));
        product("GH_OUT", "실외기", cat, ProductCategory.SINGLE_PART, new BigDecimal("700000"));
        comp(parent, "GH_IN", BundleComponent.ComponentKind.INDOOR);
        comp(parent, "GH_OUT", BundleComponent.ComponentKind.OUTDOOR);
        flush();

        var lines = expander.expand("GH_SET", BigDecimal.ONE);
        assertThat(lines).hasSize(2);
        assertThat(unit(lines, "GH_IN")).isEqualByComparingTo("600000"); // 1,000,000 × 6/10
        assertThat(unit(lines, "GH_OUT")).isEqualByComparingTo("400000"); // 잔차 4/10
    }

    @Test
    void 비가정_4way_싱글세트_실내4_실외6_재배분() {
        Category cat = categoryRepository.save(Category.create("CW-SET", "test", null, 11));
        Product parent = bundleSet("CW_SET", "무풍 4way 냉난방 프리미엄", cat, new BigDecimal("1000000"));
        product("CW_IN", "실내기", cat, ProductCategory.SINGLE_PART, new BigDecimal("300000"));
        product("CW_OUT", "실외기", cat, ProductCategory.SINGLE_PART, new BigDecimal("700000"));
        comp(parent, "CW_IN", BundleComponent.ComponentKind.INDOOR);
        comp(parent, "CW_OUT", BundleComponent.ComponentKind.OUTDOOR);
        flush();

        var lines = expander.expand("CW_SET", BigDecimal.ONE);
        assertThat(unit(lines, "CW_IN")).isEqualByComparingTo("400000"); // 4way → 4:6
        assertThat(unit(lines, "CW_OUT")).isEqualByComparingTo("600000");
    }
```

### `BundleExpanderIT.java:565-585`

```java
    @Test
    void 다수_실내기_비례배분_마지막_잔차흡수() {
        Category cat = categoryRepository.save(Category.create("MULTI-IN", "test", null, 15));
        // 가정용 세트단가 1,000,000 → 실내 6/10=600,000(2 실내기 비례), 실외 4/10=400,000
        Product parent = bundleSet("MI_SET", "가정용 에어컨 무풍", cat, new BigDecimal("1000000"));
        product("MI_IN1", "실내기 대", cat, ProductCategory.SINGLE_PART, new BigDecimal("200000"));
        product("MI_IN2", "실내기 소", cat, ProductCategory.SINGLE_PART, new BigDecimal("100000"));
        product("MI_OUT", "실외기", cat, ProductCategory.SINGLE_PART, new BigDecimal("700000"));
        comp(parent, "MI_IN1", BundleComponent.ComponentKind.INDOOR);
        comp(parent, "MI_IN2", BundleComponent.ComponentKind.INDOOR);
        comp(parent, "MI_OUT", BundleComponent.ComponentKind.OUTDOOR);
        flush();

        var lines = expander.expand("MI_SET", BigDecimal.ONE);
        // 실내 600,000 비례: IN1 200/300→400,000(roundK), IN2 잔차=600,000-400,000=200,000
        assertThat(unit(lines, "MI_IN1")).isEqualByComparingTo("400000");
        assertThat(unit(lines, "MI_IN2")).isEqualByComparingTo("200000");
        assertThat(unit(lines, "MI_OUT")).isEqualByComparingTo("400000");
        // 합 = 세트단가 보존
        assertThat(unit(lines, "MI_IN1").add(unit(lines, "MI_IN2")).add(unit(lines, "MI_OUT")))
                .isEqualByComparingTo("1000000");
    }
```

`git blame` 결과 세 테스트와 단언은 모두 `d19f2aeca03832dc51589a3cd0f9bab98602e9eb`에서 2026-06-09에 들어왔다. 커밋 제목은 `[FEAT] 세트→전표 구성품 전개 PR-2 — 전개 엔진(6:4 재배분 + 옵션 선별) (#437)`이다. 커밋 본문은 근거를 다음과 같이 명시한다.

```text
개발책임자 "GAS대로". BundleExpander 를 legacy 종합견적서 explodeSetParts/splitIndoorOutdoorToK
완전 충실 재구현
싱글세트 6:4/4:6 재배분: ... 실내:실외 6:4(가정)/4:6(비가정) 배분 ...
가정용 판정=classifySingleSetFixed else-if 순서(발통/360/4way/1way/덕트/실링/스탠드/벽걸이 선행 → 가정용)
```

즉 테스트 이름만의 우연한 암시가 아니라, 레거시 함수와 분류 cascade를 이식한 계약 테스트다.

## ⑤ R16 기대값의 근거

### 결론

R16에서 “계약”이라고 쓴 `실내기 925,050 / 실외기 616,975`에는 레거시 GAS·DB 분류·DB 배분 계약·카탈로그 중 어느 것에도 근거가 없다. **근거 없이 잘못 단정한 값이며 증거 무결성 위반이다. 정정한다.**

확인된 전파 경로는 다음과 같다.

1. PR 코멘트 `#issuecomment-5305347077`은 이전 1,590,000원 세트에 `588,975 + 883,050`을 적었다. 이는 실내 4·실외 6 순서다.
2. `#issuecomment-5306877358`에서 별도 원문 인용 없이 처음 `실내 925,050 + 실외 616,975`가 “기대 배분”으로 나타났다.
3. `7b4c94fb4`가 `BundleExpanderR13Test`에 실제 카탈로그명과 반대인 부모명 `"가정용 세트"`를 만들고, 구성품 입력값도 `AC-IN=925050`, `AC-OUT=616975`로 수동 주입했다. 이 테스트는 원천을 검증한 것이 아니라 잘못된 기대값을 fixture로 되풀이했다.
4. R15 보고서는 이를 “요구값”, R16 보고서는 이를 “계약”으로 이어받았다. R16은 화면·HTTP·저장값 `616,975/925,050`은 실제로 측정했지만, 대조 기대값의 출처는 검증하지 않았다.
5. `3c76f0eec`는 그 잘못된 기대값을 맞추기 위해 해당 SKU의 실내·실외 가격을 강제로 swap했다.

따라서 “어디서 가져왔는가”에 대한 답은 **R15/R14 계열의 무근거 기대표와 이를 순환 참조한 단위 테스트**다. 외부 계약 원문은 없었다.

## ⑥ 직전 fix가 깨뜨린 경로

두 BundleExpander 변경을 구분해야 한다.

### A. `7b4c94fb4`의 합계 일치 조기 반환

```java
BigDecimal componentSum = picked.stream()
        .map(p -> round(p.price))
        .reduce(BigDecimal.ZERO, BigDecimal::add);
if (componentSum.compareTo(round(setUnit)) == 0) {
    return;
}
```

기존 IT의 세 fixture는 구성품 원가 합계를 의도적으로 세트가와 같게 만든다.

- 가정용: 300,000 + 700,000 = 1,000,000 → 조기 반환 → 실제 300,000/700,000, 기대 600,000/400,000 실패(`:250`).
- 비가정: 300,000 + 700,000 = 1,000,000 → 조기 반환 → 실제 300,000/700,000, 기대 400,000/600,000 실패(`:265`).
- 다수 실내: 200,000 + 100,000 + 700,000 = 1,000,000 → 조기 반환 → 실제 첫 실내 200,000, 기대 400,000 실패(`:580`).

즉 3건의 직접 원인은 SKU swap이 아니라 한 단계 앞선 **합계 일치 조기 반환**이다. 레거시는 합계가 같다는 이유로 배분을 생략하지 않는다.

### B. `3c76f0eec`의 SKU 전용 swap

```java
if ("AC060CS6PBH1SY".equals(parent.getModelCode())
        && indoor.size() == 1 && outdoor.size() == 1) {
    BigDecimal indoorPrice = indoor.get(0).price;
    indoor.get(0).price = outdoor.get(0).price;
    outdoor.get(0).price = indoorPrice;
    return;
}
```

이 분기는 합계 조기 반환보다 먼저 실행되어 실제로 정본인 `실내 616,975 / 실외 925,050`을 반대로 바꾼다. `BundleExpanderIT`의 generic 모델에는 SKU가 달라 3건 실패의 직접 원인은 아니지만, 실제 AC SKU에는 잘못된 청구 배분을 만든다.

## ⑦ 나머지 CI 실패 분류

최종 상태는 요청 내용과 동일하게 47개 중 통과 39·실패 8이다. 실패 check 8개는 아래처럼 분류된다.

| 실패 check | 원문 결과 | Bundle 변경과의 관계 |
|---|---|---|
| 빌드 + 테스트 (user+product+inventory+logging) | product-service 804건 중 68 실패 | 3건은 `componentSum` 조기 반환의 직접 회귀. 나머지 65건은 별도 시트 sync 변경의 회귀 |
| JUnit 테스트 결과 (user+product+inventory+logging) | 위 68건의 게시용 summary check | 독립 실패가 아니라 위 결과의 중복 표출 |
| 빌드 + 테스트 (product-quantity-sync-schema) | 143건 중 5 실패 | Bundle과 무관. `@Value("${google.sheets.sheet-id:...}")` 제거로 `sheetId=null`; 테스트 mock은 `test-sheet-id` 호출을 기다려 불일치 |
| JUnit 테스트 결과 (product-quantity-sync-schema) | 위 5건의 게시용 summary check | 독립 실패가 아니라 위 결과의 중복 표출 |
| 빌드 + 테스트 (accounting+partner) | `ProductClientTest.java:218`: `opaque(UUID)` 중복 정의로 `compileTestJava` 실패 | Bundle과 무관한 병합/통합 오류 |
| Desktop Playwright (mock 회귀 hard gate) | 669 기대 중 666 통과·3 실패 | Bundle과 무관. 1건은 폐기 UI에서 `admin-sheetsync-trigger-btn` 제거, 2건은 과거 Google Sheets 설정/seed 단언 |
| 문서 본문 단언 스펙 | 35 기대 중 2 실패 | Bundle과 무관. 폐기된 `homemulti:'홈멀티!A1:Z'` 및 `config 는 seed fallback + DC 9키 strip` 과거 단언 |
| GitGuardian Security Checks | 외부 상태 `FAILURE`; 공개 check/status API에 탐지 파일·줄·규칙 미제공 | **정확 원인 확정 불가.** Bundle 금액 변경 때문이라는 증거는 없으며 GitGuardian 대시보드 탐지 원문이 필요 |

`EcountSheetOrderConvergenceIT` 3건도 Bundle과 무관하다. 테스트는 `google.sheets.sheet-id=test-sheet-id`를 주입하고 `readSheetDisplay("test-sheet-id", ...)`를 stub한 뒤 `syncService.syncAll()`이 시트 정본명을 반영한다고 단정한다. `@Value` 제거로 실제 호출의 첫 인자가 null이 되어 stub이 맞지 않고, `EcountSheetOrderConvergenceIT.java:148`의 시트 정본명 단언이 3경로 모두 실패했다.

시트 계열 회귀의 공통 근원은 `7b4c94fb4`가 다음을 한꺼번에 바꾼 데 있다.

- `ProductSheetSyncService`와 `ProductLookupSheetSyncService`의 `sheetId @Value` 제거
- scheduler의 부팅/cron 실행을 로그-only로 변경
- admin `/sync`를 항상 410 `SHEET_SYNC_DISABLED`로 변경
- application 설정과 partner bootstrap 시트 계약 제거

운영 정책 변경 자체의 옳고 그름과 별개로, 기존 테스트·문서·UI 계약을 함께 수렴시키지 않아 다축 회귀가 발생했다.

## ⑧ 판정: 어느 쪽이 정본인가

**확정 판정:**

- 품목 분류 정본: `AC060CS6PBH1SY`는 **비가정 360 CST UV**다. 4way라는 명칭은 부정확하지만 가정용이 아닌 공통 4:6 분기를 탄다.
- 비율 정본: **실내 4 : 실외 6**.
- 이 세트의 금액 정본: **실내기 AC060CN6PBH1 = 616,975원 / 실외기 AC060CXAPBH1 = 925,050원 / 패널 104,060원 / 리모컨 13,915원 / 합계 1,660,000원**.
- R16의 `실내 925,050 / 실외 616,975`는 틀렸다.
- `BundleExpanderIT`의 가정 6:4·비가정 4:6 계약과 2026-06-09 도입 근거는 레거시 원문과 일치한다.

이 판정은 DB 분류, DB 배분 weight, 추적 카탈로그, 레거시 분류 함수, 레거시 비율 함수, 기존 IT 이력의 여섯 증거가 같은 방향을 가리켜 확정 가능하다.

## ⑨ 판정에 따라 무엇을 해야 하는가

이번 라운드에서는 실행하지 않고 후속 fix 범위만 특정한다.

1. `3c76f0eec`의 `AC060CS6PBH1SY` 전용 실내·실외 swap을 제거해야 한다.
2. `7b4c94fb4`의 “구성품 합계=세트가이면 재배분 생략” 조기 반환을 레거시 계약에 맞게 제거하거나 범위를 재설계해야 한다. 기존 IT 3건은 바꾸면 안 된다.
3. `BundleExpanderR13Test`의 가짜 부모명 `가정용 세트`와 수동 역전 fixture를 폐기하고, 실제 `360 CST UV` 분류·고정부품·4:6 계산으로 `616,975/925,050`을 단언해야 한다.
4. 시트 연동 폐기 정책은 Bundle fix와 분리해 처리해야 한다. 운영 경로 폐기를 유지한다면 내부 sync 엔진 테스트의 의존성 주입과 과거 UI/docs 계약을 명시적으로 수렴시켜야 한다.
5. `ProductClientTest` 중복 helper는 별도 통합 오류로 처리해야 한다.
6. GitGuardian은 대시보드 탐지 원문을 확인한 뒤 false positive 여부를 판정해야 한다. 공개 정보만으로 통과 처리하면 안 된다.

## ⑩ 프로세스 회수

이 진단은 새 서버, 브라우저, Gradle daemon, Testcontainers, 격리 DB/JAR 컨테이너를 기동하지 않았다. 조회에는 기존 `samhan-postgres`에 read-only SELECT와 GitHub CLI만 사용했다.

```text
이번 진단이 기동한 프로세스: 0
이번 진단이 기동한 격리 컨테이너: 0
회수 대상: 0
이번 진단 귀속 잔여 프로세스: 0
이번 진단 귀속 잔여 격리 컨테이너: 0
게시 직전 전체 실행 컨테이너: 26 (모두 선행 공유 작업 자산)
이름에 1241-r16/diagnostic/allocation이 남은 실행 컨테이너: 0
```

공유 환경에는 진단 시작 전부터 실행 중이던 컨테이너가 있으므로 타 작업 자산을 종료하지 않았다.
