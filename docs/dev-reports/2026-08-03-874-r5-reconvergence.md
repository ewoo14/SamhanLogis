# PR #1057 / 이슈 #874 R5 — fix 표면 재수렴

작성일: 2026-08-03 (KST)  
대상: `feat/874-set-riusage-global-dc` / `dd0b79299d142d63fbcd68abeaf57bef97df8a19`  
질문: fix가 건드린 표면 전체에서 실 사용자 경로로 재현 가능한 결함이 있는가

## 0. 결론

**BLOCK — 실 사용자 경로로 재현 가능한 결함 1건이 있다.**

R4는 `SUB_INDOOR`를 부속의 failed-main 집합에서 제거하면서, 같은 집합의 존재 여부로 계산하던 `sawMain`에서도 함께 제거했다. 그 결과 같은 SINGLE 전표 scope에 Q형 `SUB_INDOOR`와 미소비 부속만 있고 `INDOOR/OUTDOOR`가 없으면, 레거시는 Q 때문에 single main이 존재한다고 보고 부속을 단가 fallback으로 보내지만 현행은 main이 전혀 없다고 오인해 부속을 무조건 `true`로 만든다. 활성 세트 `AF17B6474GZRS`의 Q `AR06A9170HNQ`와 자재 `FPC-1412YAF2`로 production matcher/decision에서 `false -> true`를 재현했다.

Q 자기 행의 미소비 `false`는 유지됐다. R4의 AP/PC 규칙은 활성 카탈로그 AP 51종·56링크, PC 16종·250링크에 걸리지만 모두 이미 구체 kind여서 effective kind와 `확인` 변화는 0종·0링크다. #1058과 세트 경로도 이번 라운드에 fresh 재측정했으며 과차감 0행/0원, 옵션 미보유 164곳 금액 변화 0원, snapshot mismatch 0, 세트 후보·구성 링크·납품가 변화 0이다.

## 1. 5-agent 관점과 수렴

| 관점 | 담당 표면 | 도달성 결론 |
|---|---|---|
| 1. 레거시/Q 양방향 | `Code.js:688-712`, Q 자기 판정, R4 반대 방향 | Q 자기 무회귀. Q-only main scope의 미소비 부속 `false -> true` BLOCK |
| 2. AP/PC 카탈로그 | 활성 모델·링크와 effective kind 전후 | AP 51종·56링크, PC 16종·250링크; 변경 0종·0링크 |
| 3. #1058·세트 | 과차감, 옵션 미보유, snapshot, matcher 금액 | 0행/0원, 164곳/0원, mismatch 0, 세트·금액 변화 0 |
| 4. 호출·평탄화 | `null` 보존과 `withVerified`, 화면 표시 | `null` 보존. 결함의 non-null `true`는 기존 단가 `false`를 덮음 |
| 5. 독립 반증 | 입력 생성·scope·화면까지 도달 방해 조건 | 확정 출고전표의 선택 할당으로 도달 가능; 차단 조건 없음 |

## 2. Blocking 결함 — Q가 유일한 main인 scope의 미소비 부속을 무조건 확인 처리

### 2.1 파일:줄과 원인

- `tools/legacy-gas/일마감 프로그램/Code.js:494-496` — `INDOOR/OUTDOOR/SUB_INDOOR` 중 하나가 있으면 `hasSingleMain=true`다.
- `Code.js:691-707` — single main이 있으면 PANEL/REMOTE/MATERIAL은 자기 소비 완료, `INDOOR/OUTDOOR` failed main, 마지막 단가 비교의 세 갈래로 간다.
- `Code.js:697-700` — `SUB_INDOOR`는 failed-main에는 포함되지 않는다.
- `Code.js:709-710` — Q `SUB_INDOOR` 자기 행은 자기 usage 완전 소비 여부로 판정한다.
- `services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/RiUsageDecision.java:32-48` — 현행은 자기 소비 완료를 먼저 보지만, 이후 `sawMain`을 `isFailedMain()` 목록의 존재로 계산한다.
- `RiUsageDecision.java:69-70` — R4에서 `isFailedMain()`이 `INDOOR/OUTDOOR`만 반환하므로 Q-only scope는 `sawMain=false`가 되고 47-48행에서 즉시 `true`가 된다.
- `services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/MonthEndCloseService.java:626-639` — 활성 카탈로그 kind와 같은 전표 scope를 decision row로 만들고 이 값을 호출한다.
- `MonthEndCloseService.java:500-513` — 기존 단가 재검증 뒤 non-null riUsage 결과를 `withVerified`로 덮는다.
- `clients/desktop/src/renderer/routes/DailyClosingPage.tsx:711-723` — 사용자는 최종 `true/false/null`을 `확인/불일치/판정불가` 배지로 본다.

즉 R4에서 분리해야 했던 것은 `hasSingleMain`과 `hasFailedMain`의 **두 집합**인데, 현행은 `hasFailedMain` 집합을 `sawMain`에도 재사용한다. Q를 failed-main에서 빼는 것은 맞지만 single-main 존재 판정에서도 빼면 안 된다.

### 2.2 실 사용자 조작

1. 활성 SINGLE 세트 `AF17B6474GZRS`의 Q형 `AR06A9170HNQ`와 자재 `FPC-1412YAF2`가 들어 있는 확정 출고전표를 준비한다.
2. 매출회계전표 작성에서 같은 거래처·같은 원천 전표 scope에 Q와 자재만 양수 수량/금액으로 할당하고 실내기·실외기는 할당하지 않는다. `CreateSalesAccountingSlipRequest.AllocationRequest`는 양수 할당을 받고, `SalesAccountingSlipCreateAttemptService.java:145-173`은 각 원천 행의 잔여 금액·수량 이내 선택 할당을 허용한다.
3. 자재 VAT 포함 단가를 납품가 100,000원과 다른 90,000원으로 둔다.
4. `/accounting/daily-closings`의 SALES 상세에서 자재 행 `확인` 배지를 본다.

### 2.3 잘못된 결과

세트에는 필수 실내기·실외기가 없으므로 성립하지 않고 Q와 자재 usage는 모두 미소비다.

- Q 자기 행: 레거시 `false`, 현행 `false` — 정상.
- 자재 행: 레거시는 Q로 `hasSingleMain=true`, Q는 failed-main이 아니므로 단가 fallback `90,000 != 100,000` → `false`.
- 현행 자재 행: `INDOOR/OUTDOOR`가 없어 `sawMain=false` → 단가와 무관하게 `true`; 화면에 잘못된 `확인` 표시.

활성 카탈로그에서 이 구조는 Q 부모 67개, Q 모델 8종, PANEL/REMOTE/MATERIAL sibling 205링크, 해당 sibling을 가진 부모 67개다.

Fresh read-only 명령과 출력:

```powershell
docker exec samhan-postgres psql -U samhan -d product_db -X -v ON_ERROR_STOP=1 -P pager=off -c "BEGIN TRANSACTION READ ONLY; WITH active AS (SELECT bc.bundle_product_id,bp.model_code parent_model,bc.component_product_code code,bc.component_kind kind FROM bundle_component bc JOIN products bp ON bp.id=bc.bundle_product_id WHERE NOT bc.is_deleted AND NOT bp.is_deleted AND bp.product_category IN ('SINGLE_SET','COMMERCIAL_MULTI')), qparents AS (SELECT DISTINCT bundle_product_id,parent_model,code q_model FROM active WHERE kind='ACCESSORY' AND upper(code)~'^AR[0-9]{2}' AND length(code)>=12 AND position('-' in code)=0 AND substring(upper(code),12,1)='Q') SELECT count(DISTINCT q.bundle_product_id) q_parents,count(DISTINCT q.q_model) q_models,count(*) FILTER(WHERE a.kind IN ('PANEL','REMOTE','MATERIAL')) accessory_sibling_links,count(DISTINCT q.bundle_product_id) FILTER(WHERE a.kind IN ('PANEL','REMOTE','MATERIAL')) parents_with_accessory_sibling FROM qparents q JOIN active a ON a.bundle_product_id=q.bundle_product_id AND a.code<>q.q_model; COMMIT;"
```

```text
BEGIN
 q_parents | q_models | accessory_sibling_links | parents_with_accessory_sibling
-----------+----------+-------------------------+--------------------------------
        67 |        8 |                     205 |                             67
(1 row)

COMMIT
```

### 2.4 production 메서드 재현 명령과 출력 원문

다음 명령은 컴파일된 `LegacyModelKindClassifier.riUsageKind`, `LegacySetMatcher.findMatchesWithUsage`, `RiUsageDecision.decide`를 직접 호출한다.

```powershell
@'
import java.util.*; import java.math.*;
Class<?> classifier=Class.forName("com.samhanair.logis.accounting.service.LegacyModelKindClassifier"); var classify=classifier.getDeclaredMethod("riUsageKind",String.class,String.class); classify.setAccessible(true);
String q="AR06A9170HNQ", material="FPC-1412YAF2", scope="SLIP-Q-ONLY"; String qKind=(String)classify.invoke(null,"ACCESSORY",q); String materialKind=(String)classify.invoke(null,"MATERIAL",material); System.out.println("CATALOG_PARENT=AF17B6474GZRS Q="+q+" ACCESSORY->"+qKind+" MATERIAL="+material+" KIND="+materialKind);
Class<?> cc=Class.forName("com.samhanair.logis.accounting.service.LegacySetMatcher$Component"); var c=cc.getDeclaredConstructor(String.class,String.class,BigDecimal.class); c.setAccessible(true); Class<?> sc=Class.forName("com.samhanair.logis.accounting.service.LegacySetMatcher$SetCandidate"); var s=sc.getDeclaredConstructor(String.class,List.class); s.setAccessible(true); Object candidate=s.newInstance("AF17B6474GZRS",List.of(c.newInstance("AF17B6474GZN","INDOOR",BigDecimal.ZERO),c.newInstance("AF17B6470DCX","OUTDOOR",BigDecimal.ZERO),c.newInstance(q,qKind,new BigDecimal("180000")),c.newInstance(material,materialKind,new BigDecimal("100000"))));
Class<?> lc=Class.forName("com.samhanair.logis.accounting.service.LegacySetMatcher$InvoiceLine"); var l=lc.getDeclaredConstructor(String.class,String.class,BigDecimal.class,String.class,String.class,String.class); l.setAccessible(true); var pool=List.of(l.newInstance(q,qKind,new BigDecimal("180000"),"P1",scope,"QROW"),l.newInstance(material,materialKind,new BigDecimal("90000"),"P1",scope,"MATROW")); Class<?> mc=Class.forName("com.samhanair.logis.accounting.service.LegacySetMatcher"); var mctor=mc.getDeclaredConstructor(); mctor.setAccessible(true); Object matcher=mctor.newInstance(); var find=mc.getDeclaredMethod("findMatchesWithUsage",List.class,List.class,Map.class); find.setAccessible(true); Object result=find.invoke(matcher,pool,List.of(candidate),Map.of()); var matches=result.getClass().getDeclaredMethod("matches"); matches.setAccessible(true); var usageMethod=result.getClass().getDeclaredMethod("usage"); usageMethod.setAccessible(true); Map usage=(Map)usageMethod.invoke(result); System.out.println("MATCHES="+matches.invoke(result)+" USAGE="+usage);
Class<?> rc=Class.forName("com.samhanair.logis.accounting.service.RiUsageDecision$Row"); var row=rc.getDeclaredConstructor(String.class,String.class,String.class,String.class); row.setAccessible(true); var rows=List.of(row.newInstance("QROW",scope,q,qKind),row.newInstance("MATROW",scope,material,materialKind)); Class<?> dc=Class.forName("com.samhanair.logis.accounting.service.RiUsageDecision"); var decide=dc.getDeclaredMethod("decide",String.class,String.class,List.class,Map.class); decide.setAccessible(true); Object qNow=decide.invoke(null,q,qKind,rows,usage); Object materialNow=decide.invoke(null,material,materialKind,rows,usage); boolean legacyMaterial=false; System.out.println("Q_CURRENT="+qNow+" Q_LEGACY=false MATERIAL_CURRENT="+materialNow+" MATERIAL_LEGACY="+legacyMaterial+" INPUT={Q:0/1,MATERIAL:0/1,unitPrice:90000,delivery:100000,INDOOR:none,OUTDOOR:none,hasSingleMain:true}");
/exit
'@ | jshell --class-path 'services/accounting-service/build/classes/java/main'
```

```text
CATALOG_PARENT=AF17B6474GZRS Q=AR06A9170HNQ ACCESSORY->SUB_INDOOR MATERIAL=FPC-1412YAF2 KIND=MATERIAL
MATCHES=[] USAGE={QROW=Usage[total=1, used=0], MATROW=Usage[total=1, used=0]}
Q_CURRENT=false Q_LEGACY=false MATERIAL_CURRENT=true MATERIAL_LEGACY=false INPUT={Q:0/1,MATERIAL:0/1,unitPrice:90000,delivery:100000,INDOOR:none,OUTDOOR:none,hasSingleMain:true}
```

## 3. 1순위 나머지 — Q 자기 무회귀와 AP/PC 반대 방향

### 3.1 Q 자기 `확인`

`RiUsageDecision.java:25-27,61-63`에서 `SUB_INDOOR`는 계속 자기 main 집합에 있다. production 직접 실행과 `RiUsageDecisionTest`에서 Q usage `0/1` 및 `1/2`는 `false`, `1/1` 및 `2/2`는 `true`다. R2가 연결한 미소비 Q의 `false`는 되돌아가지 않았다.

### 3.2 AP/PC 활성 카탈로그 fresh 계수

```powershell
docker exec samhan-postgres psql -U samhan -d product_db -X -v ON_ERROR_STOP=1 -P pager=off -c "BEGIN TRANSACTION READ ONLY; WITH active AS (SELECT bc.component_product_code AS code,bc.component_kind AS catalog_kind,bc.bundle_product_id FROM bundle_component bc JOIN products p ON p.id=bc.bundle_product_id WHERE NOT bc.is_deleted AND NOT p.is_deleted AND p.product_category IN ('SINGLE_SET','COMMERCIAL_MULTI')), tagged AS (SELECT *,CASE WHEN upper(code)~'^AP[0-9]{3}' AND length(code)>=7 AND substring(upper(code),7,1)='N' THEN 'AP7_N' WHEN upper(code)~'^AP[0-9]{3}' AND length(code)>=7 AND substring(upper(code),7,1)='X' THEN 'AP7_X' WHEN upper(code) LIKE 'PC%' THEN 'PC' END rule FROM active) SELECT rule,catalog_kind,count(DISTINCT code) models,count(*) links,count(DISTINCT bundle_product_id) parents FROM tagged WHERE rule IS NOT NULL GROUP BY rule,catalog_kind ORDER BY rule,catalog_kind; COMMIT;"
```

```text
BEGIN
 rule  | catalog_kind | models | links | parents
-------+--------------+--------+-------+--------
 AP7_N | INDOOR       |     40 |    42 |      42
 AP7_X | OUTDOOR      |     11 |    14 |      14
 PC    | PANEL        |     16 |   250 |      58
(3 rows)

COMMIT
```

`LegacyModelKindClassifier.java:15-21`은 catalog가 generic `ACCESSORY`이고 raw legacy kind가 riUsage main일 때만 덮는다. 활성 AP는 모두 이미 `INDOOR/OUTDOOR`, PC는 모두 `PANEL`이며 generic 링크는 0이다. Fresh 전후 대조 결과는 다음과 같다.

```text
 rule  | models | links | generic_links | changed_models | changed_links |   effective_transition
-------+--------+-------+---------------+----------------+---------------+--------------------------
 AP7_N |     40 |    42 |             0 |              0 |             0 | INDOOR:INDOOR->INDOOR
 AP7_X |     11 |    14 |             0 |              0 |             0 | OUTDOOR:OUTDOOR->OUTDOOR
 PC    |     16 |   250 |             0 |              0 |             0 | PANEL:PANEL->PANEL
```

따라서 R4 AP/PC 규칙으로 원래 잘 분류되던 활성 행의 effective kind, matcher 입력, `확인` 값이 바뀐 모델과 링크는 **0종·0링크**다.

## 4. #1058 fresh 재측정

이번 라운드에 직전 값을 인용하지 않고 같은 read-only 모집단을 다시 만들었다.

```text
 chosen_selector | no_option_links | component_models
-----------------+-----------------+------------------
 360             |              18 |                3
 4way            |               4 |                4
```

```text
 active_configs | c360 |    s360    | c4way |   s4way    | optionless_configs
----------------+------+------------+-------+------------+--------------------
            210 |   45 | 1900000.00 |    46 | 2000000.00 |                164
```

종전 잘못된 단건 부모 선택의 위험 benchmark는 fresh 값으로 `18×45 + 4×46 = 994행`, `18×1,900,000 + 4×2,000,000 = 42,200,000원`이다. 현 matcher는 `INDOOR+OUTDOOR`가 없는 단건으로 후보를 만들지 않고 실제 match만 `parentSetNames`에 반영한다. Fresh fallback/matcher 실행으로 이 benchmark에서 현재 과차감은 **0행/0원**이다.

옵션 미보유 거래처도 별도 fresh SELECT했다.

```powershell
docker exec samhan-postgres psql -U samhan -d dc_config_db -X -v ON_ERROR_STOP=1 -P pager=off -c "BEGIN TRANSACTION READ ONLY; SELECT count(*) AS optionless_partners,COALESCE(sum(COALESCE(discount_360_amount,0)+COALESCE(discount_4way_amount,0)+COALESCE(discount_1way_amount,0)+COALESCE(discount_stand_amount,0)+COALESCE(discount_deluxe_amount,0)+COALESCE(discount_first_grade_amount,0)),0) AS option_amount_change FROM dc_configs WHERE NOT is_deleted AND discount_360_amount IS NULL AND discount_4way_amount IS NULL AND discount_1way_amount IS NULL AND discount_stand_amount IS NULL AND discount_deluxe_amount IS NULL AND discount_first_grade_amount IS NULL; COMMIT;"
```

```text
BEGIN
 optionless_partners | option_amount_change
---------------------+---------------------
                 164 |                   0
(1 row)

COMMIT
```

영속 회계 원천의 fresh 모델 행은 tax invoice `0/22`, sales slip `0/0`이다. 따라서 영속 실발생 관측도 0행/0원이지만 빈 모델 모집단이며, 위 benchmark 0행/0원과 구분한다.

## 5. 세트 매칭·부속 세 갈래 무회귀

`MonthEndCloseService.java:588-600`은 classifier 결과를 `LegacySetMatcher.Component`와 pool에 전달한다. `LegacySetMatcher.java:80-107`은 `INDOOR/OUTDOOR`만 필수로 보고 나머지를 token 기반 옵션으로 소비하며, 114-120행에서 같은 납품가 합계를 비교한다.

활성 카탈로그와 R4 전후 effective kind를 fresh 대조한 결과:

```text
 set_candidates_changed | component_links_changed | component_models_changed | candidate_delivery_amount_changed
------------------------+-------------------------+--------------------------+-----------------------------------
                      0 |                       0 |                        0 |                                 0
```

R4에서 Q의 classifier 결과 자체는 바뀌지 않았고 `RiUsageDecision`의 교차 집합만 바뀌었다. 따라서 세트 성립, usage, 매칭 금액 변화는 0이다.

부속 세 갈래의 상위 전달도 유지된다.

- 자기 usage 완료: `RiUsageDecision.java:32-34` → `true`.
- 같은 scope의 미완료 `INDOOR/OUTDOOR`: 35-51행 → `false`.
- main이 완료됐지만 부속이 미완료: 53행 → `null`, `MonthEndCloseService.java:510-513`에서 기존 단가 판정을 덮지 않음.

상위에서 `null`을 참/거짓으로 평탄화하는 경로는 없다. Blocking 결함은 마지막 갈래가 평탄화된 것이 아니라, Q-only scope를 “main 없음”으로 오인해 47-48행의 별도 `true` 갈래로 빠지는 것이다.

## 6. Fresh 타깃 실행

전체 accounting suite는 실행하지 않았다. 이번 표면의 타깃만 `--rerun-tasks`로 실행했다.

```powershell
.\gradlew.bat :services:accounting-service:test --tests '*DailyClosingSnapshotBaselineTest' --tests '*LegacySetMatcherTest' --tests '*DailyClosingDetailServiceTest.dailyDetailKeepsModelTokenFallbackWhenSetMatchFails' --tests '*DailyClosingDetailServiceTest.dailyDetailAppliesMatchedSetToIndoorAndOutdoor' --tests '*RiUsageDecisionTest' --rerun-tasks --no-daemon --console=plain
```

```text
> Task :services:accounting-service:test

BUILD SUCCESSFUL in 45s
21 actionable tasks: 21 executed
```

Fresh XML은 snapshot 1, matcher 7, detail 2, riUsage 7, 합계 17 tests이며 failures/errors/skipped는 모두 0이다. snapshot SHA-256은 `405B2596D61A2A4F3658BC9ED4F75D0B3BA9DFCF7A643E9CE38BBBC88ED0E663`, 기준선 mismatch는 0이다.

## 7. 이번 라운드가 보지 않은 표면

- 공유 DB write 금지 때문에 Q-only main 전표를 실제 DB에 새로 저장하고 HTTP 응답과 데스크톱 화면을 캡처하지 않았다. 대신 request 제약·할당 서비스·월마감 호출 경계를 정적으로 추적하고, 활성 실카탈로그 모델과 컴파일된 production classifier/matcher/decision을 결합해 같은 데이터 흐름을 재현했다.
- 현재 `accounting_db`의 모델 보유 원천이 0행이어서 이 결함의 과거 실발생 건수·금액과 운영 DB 발생 건수는 측정하지 못했다.
- 레거시의 전표 행 순서에 따른 `_zone` 전파는 Q가 부속보다 먼저 오는 재현 가능한 순서만 확인했다. 부속이 Q보다 먼저 오는 순서와 여러 zone이 한 전표에서 교차하는 모든 순열은 보지 않았다.
- 향후 generic `ACCESSORY`로 새로 유입될 AP/PC 모델은 현재 활성 링크가 0이므로 사용자 결과를 판정하지 않았다. soft-delete 카탈로그와 accounting이 소비하지 않는 category도 보지 않았다.
- PURCHASE 원천, HOME/COMM multi의 별도 확인 분기, 범위 밖 서비스는 R4 fix 표면이 아니므로 다시 판정하지 않았다.
- 사용자 지시대로 accounting-service 전체 suite, Docker 이미지 재빌드, 공유 DB write/DDL, 리팩터링은 수행하지 않았다.
- 동시 카탈로그 갱신 중 endpoint snapshot, 외부 product/DC 서비스 장애 시 fallback은 이번 fix의 도달성 질문에서 제외했다.

## 8. 파일 상태

git은 조회만 사용했고 commit/push/checkout/branch/stash/reset을 수행하지 않았다. DB 명령은 `BEGIN TRANSACTION READ ONLY` 안의 `SELECT`뿐이다.

이번 라운드 신규 파일:

- `docs/dev-reports/2026-08-03-874-r5-reconvergence.md`
