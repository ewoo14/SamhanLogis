# PR #1057 / 이슈 #874 R3 — fix 표면 재수렴

작성일: 2026-08-03 (KST)  
대상: `feat/874-set-riusage-global-dc` / `2577331f3a09780efdeff61bbed46146309af563`  
질문: fix가 건드린 표면 전체에서 실 사용자 경로로 재현 가능한 결함이 있는가

## 0. 결론

**BLOCK — 실 사용자 경로로 재현 가능한 결함 1건이 있다.**

R2가 활성 Q형 구성품 8종·67링크를 `ACCESSORY -> SUB_INDOOR`로 보정한 결과 Q 자기 행은 레거시 판정에 도달한다. 그러나 현행 `RiUsageDecision`은 `SUB_INDOOR`를 다른 부속 행의 실패 main에도 포함한다. 레거시는 `SUB_INDOOR`를 자기 행에서만 main으로 보고, 부속의 실패 main은 `INDOOR/OUTDOOR`만 본다. 따라서 Q 수량 일부가 남고 실내기·실외기와 REMOTE는 완전 소비된 정상 조합에서도, REMOTE의 레거시 `확인=true`가 현행 `false`로 잘못 뒤집힌다.

반면 현재 활성 카탈로그에서 effective kind가 바뀌는 것은 Q 규칙뿐이다. `ACCESSORY`와 `SUB_INDOOR`는 현 matcher의 세트 후보/옵션 소비에서는 같은 분기로 처리되므로, 67개 부모 세트의 성립 여부·사용 index·예상금액은 fix 전후 바뀌지 않는다. 정상 세트를 깨뜨리는 역전도 이 모집단에서는 0건이다.

`#1058`은 이번 세션에서 다시 측정했다. 현재 영속 회계 원천의 모델 보유 행은 0행이어서 관측 가능한 실제 발생액은 0행/0원이다. 별도로 이전과 같은 카탈로그×전역DC 위험 benchmark를 fresh 재현하고 현 matcher의 singleton fallback 및 타깃 경로를 다시 실행한 결과, 종전 위험 `994행/42,200,000원`이 현재 과차감으로 돌아온 행은 **0행/0원**이다. 이는 영속 실발생액과 benchmark 판정을 구분한 결과다.

## 1. 5-agent 관점과 수렴

| 관점 | 담당 질문 | 수렴 결과 |
|---|---|---|
| 1. 분류 규칙 계수 | 규칙별 effective-kind 변경 모델/링크 | Q 8종·67링크만 변경, N/X는 0 |
| 2. 레거시·경계 | `riUsageKind`, Code.js 완결성, 세 갈래 | 구체 kind·비-main ACCESSORY 보존은 코드와 일치; AP/PC 누락은 증거 정정 필요; `null` 보존 |
| 3. #1058 | 과차감 benchmark·영속 행·snapshot fresh 재측정 | 현재 과차감 0행/0원 유지, 영속 모델 행 0 |
| 4. 실사용 데이터 흐름 | 수량→matcher usage→화면 `확인` | Q partial usage가 sibling 부속을 `true -> false`로 뒤집음 |
| 5. 반대 방향 | 정상 세트/정상 부속 차단 여부 | 세트·금액 역전 0; sibling 부속 판정 역전 1건 독립 재현 |

## 2. 1순위 — 규칙별 분류 변경량

production 카탈로그 endpoint와 같은 활성 부모 범위(`SINGLE_SET`, `COMMERCIAL_MULTI`)에서 generic `ACCESSORY`가 실제 다른 effective kind가 되는 행만 셌다.

```text
  rule  | changed_components | changed_links | affected_parent_bundles
--------+--------------------+---------------+-------------------------
 AC7_N  |                  0 |             0 |                       0
 AC7_X  |                  0 |             0 |                       0
 AF12_N |                  0 |             0 |                       0
 AF12_X |                  0 |             0 |                       0
 AR12_N |                  0 |             0 |                       0
 AR12_Q |                  8 |            67 |                      67
 AR12_X |                  0 |             0 |                       0
(7 rows)
```

변경되는 실제 모델은 다음 8종이다.

```text
AR06A9170HNQ  ACCESSORY -> SUB_INDOOR   6 links
AR06B9150HNQ  ACCESSORY -> SUB_INDOOR   6
AR06D9151HNQ  ACCESSORY -> SUB_INDOOR   3
AR60F06D1A0Q  ACCESSORY -> SUB_INDOOR  28
AR60F06D1A1Q  ACCESSORY -> SUB_INDOOR   2
AR70H06D1A1Q  ACCESSORY -> SUB_INDOOR  16
AR80F06D2A1Q  ACCESSORY -> SUB_INDOOR   4
AR80H06D2A1Q  ACCESSORY -> SUB_INDOOR   2
```

재현 명령:

```powershell
docker exec samhan-postgres psql -U samhan -d product_db -X -v ON_ERROR_STOP=1 -P pager=off -c "BEGIN TRANSACTION READ ONLY; WITH active AS (SELECT bc.component_product_code code,bc.component_kind kind,bc.bundle_product_id FROM bundle_component bc JOIN products p ON p.id=bc.bundle_product_id WHERE NOT bc.is_deleted AND NOT p.is_deleted AND p.product_category IN ('SINGLE_SET','COMMERCIAL_MULTI')), rules(rule,legacy_kind) AS (VALUES ('AC7_N','INDOOR'),('AC7_X','OUTDOOR'),('AR12_N','INDOOR'),('AR12_X','OUTDOOR'),('AR12_Q','SUB_INDOOR'),('AF12_N','INDOOR'),('AF12_X','OUTDOOR')), tagged AS (SELECT a.*,CASE WHEN upper(code)~'^AC[0-9]{3}' AND substring(upper(code),7,1)='N' THEN 'AC7_N' WHEN upper(code)~'^AC[0-9]{3}' AND substring(upper(code),7,1)='X' THEN 'AC7_X' WHEN upper(code)~'^AR[0-9]{2}' AND length(code)>=12 AND position('-' in code)=0 AND substring(upper(code),12,1)='N' THEN 'AR12_N' WHEN upper(code)~'^AR[0-9]{2}' AND length(code)>=12 AND position('-' in code)=0 AND substring(upper(code),12,1)='X' THEN 'AR12_X' WHEN upper(code)~'^AR[0-9]{2}' AND length(code)>=12 AND position('-' in code)=0 AND substring(upper(code),12,1)='Q' THEN 'AR12_Q' WHEN upper(code)~'^AF[0-9]{2}' AND length(code)>=12 AND substring(upper(code),12,1)='N' THEN 'AF12_N' WHEN upper(code)~'^AF[0-9]{2}' AND length(code)>=12 AND substring(upper(code),12,1)='X' THEN 'AF12_X' END rule FROM active a), counts AS (SELECT r.rule,COUNT(DISTINCT t.code) FILTER (WHERE t.kind='ACCESSORY') changed_components,COUNT(*) FILTER (WHERE t.kind='ACCESSORY') changed_links,COUNT(DISTINCT t.bundle_product_id) FILTER (WHERE t.kind='ACCESSORY') affected_parent_bundles FROM rules r LEFT JOIN tagged t ON t.rule=r.rule GROUP BY r.rule) SELECT * FROM counts ORDER BY rule; COMMIT;"
```

문자 위치는 JavaScript의 0-based index를 SQL/사람 기준으로 바꿔 `u[6] = 7번째`, `u[11] = 12번째`로 셌다. 레거시 원문에는 AR/AF 6번째 문자 규칙이 없다.

## 3. 세트 성립·금액 전후와 반대 방향

현재 실제 변경은 Q의 `ACCESSORY -> SUB_INDOOR`뿐이다.

- `LegacySetMatcher.java:80-86`은 필수 구성품을 `INDOOR/OUTDOOR`로만 고른다.
- `LegacySetMatcher.java:97-107`은 `INDOOR/OUTDOOR`가 아닌 구성품을 모두 같은 옵션 분기로 소비한다.
- `LegacySetMatcher.java:101-102,123-130`의 옵션 검색은 kind를 비교하지 않는다.
- 따라서 Q는 fix 전 `ACCESSORY`, fix 후 `SUB_INDOOR`여도 후보 anchor, 필수 실내기·실외기, 옵션 index, `expected`, `invoice`가 동일하다.

활성 Q 링크 **67/67**에 같은 동치가 적용되므로 세트 성립 뒤집힘은 **0개 부모**, 예상금액 변화도 **0원**이다. 정상 세트가 깨지는 반대 방향도 0개다. N/X가 generic ACCESSORY인 활성 링크는 0이므로 N/X가 필수 구성으로 바뀌는 실데이터 역전은 없다.

실제 활성 부모 `AF17B6474GZRS`의 production matcher 실행에서도 다음처럼 세트가 성립했다.

```text
LIVE_SET=AF17B6474GZRS Q_KIND_BEFORE=ACCESSORY Q_KIND_AFTER=SUB_INDOOR
MATCHES=[Match[setName=AF17B6474GZRS, poolIndexes=[0, 1, 2, 4, 6]]]
USAGE={INROW=Usage[total=1, used=1], OUTROW=Usage[total=1, used=1], QROW=Usage[total=2, used=1], MATROW=Usage[total=2, used=1], MAT2ROW=Usage[total=1, used=1]}
```

## 4. Blocking 결함 — Q형 partial usage가 sibling 부속을 거짓 불일치로 만든다

### 파일:줄과 원인

- `services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/LegacyModelKindClassifier.java:15-20,37-46` — generic Q형을 `SUB_INDOOR`로 바꾼다.
- `services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/MonthEndCloseService.java:626-639` — 보정 kind를 focus와 같은 scope의 decision row 모두에 전달한다.
- `services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/RiUsageDecision.java:32-51,59-60` — 부속 자체 완전소비를 보기 전에 failed-main을 반환하며, 그 집합에 `SUB_INDOOR`도 포함한다.
- `tools/legacy-gas/일마감 프로그램/Code.js:694-707` — 레거시는 부속 자체가 소비됐으면 먼저 `true`; 그 다음 `INDOOR/OUTDOOR` failed-main; 마지막으로 단가 fallback 순서다.
- `tools/legacy-gas/일마감 프로그램/Code.js:697-700` — 레거시 부속 failed-main은 `INDOOR/OUTDOOR`만 포함한다.
- `tools/legacy-gas/일마감 프로그램/Code.js:709-710` — `SUB_INDOOR`는 자기 행의 usage만 판정한다.
- `services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/MonthEndCloseService.java:500-513` — 잘못된 non-null `false`가 기존 단가 판정을 덮는다.
- `clients/desktop/src/renderer/routes/DailyClosingPage.tsx:711-723,1140-1167` — 사용자는 모델별 재검증의 `확인/불일치` 배지로 결과를 본다.

### 실 사용자 조작

1. 활성 싱글 세트 `AF17DX738WSRS`를 포함한 확정 출고전표를 매출회계전표로 가져온다.
2. 수량 할당 화면에서 같은 전표 scope의 Q형 `AR06D9151HNQ` 수량을 2, 실내기 `AF17DX738WSN`·실외기 `AF17DX730DCX`·리모컨 `AFR-TC9D`를 각각 1로 배정한다. `CreateSalesAccountingSlipRequest.AllocationRequest`는 양수 수량을 받고, `SalesAccountingSlipCreateAttemptService.java:145-173`은 잔여 수량 범위의 부분/복수 수량 할당을 허용한다.
3. 실내기·실외기·Q·리모컨 각 1개는 295,000원 완성 세트로 소비되고 추가 Q 1개만 남도록 한다.
4. `/accounting/daily-closings`의 모델별 재검증에서 리모컨 행을 본다.

### 잘못된 결과

입력 usage는 `INDOOR 1/1`, `OUTDOOR 1/1`, `SUB_Q 1/2`, `REMOTE 1/1`이다. 레거시는 리모컨 자체가 완전 소비됐으므로 먼저 `확인=true`다. 현행은 리모컨 자체 소비를 보기 전에 Q를 failed-main으로 보고 즉시 `false`를 반환해 **불일치**로 표시한다. Q 자기 행의 `false`는 레거시와 같고, 완전 소비된 sibling 리모컨에 전파된 `false`만 잘못이다.

실제 카탈로그 도달성:

```text
 active_q_parents | q_parent_accessory_links | q_models_with_accessory_sibling
------------------+--------------------------+---------------------------------
               67 |                      205 |                               8
(1 row)
```

재현 SQL:

```powershell
docker exec samhan-postgres psql -U samhan -d product_db -X -v ON_ERROR_STOP=1 -P pager=off -c "BEGIN TRANSACTION READ ONLY; WITH q_parents AS (SELECT DISTINCT bc.bundle_product_id,bc.component_product_code AS q_model FROM bundle_component bc JOIN products bp ON bp.id=bc.bundle_product_id AND NOT bp.is_deleted WHERE NOT bc.is_deleted AND bc.component_kind='ACCESSORY' AND substring(upper(bc.component_product_code) from 12 for 1)='Q') SELECT count(DISTINCT qp.bundle_product_id) AS active_q_parents, count(*) FILTER (WHERE other.component_kind IN ('PANEL','REMOTE','MATERIAL')) AS q_parent_accessory_links, count(DISTINCT qp.q_model) FILTER (WHERE other.component_kind IN ('PANEL','REMOTE','MATERIAL')) AS q_models_with_accessory_sibling FROM q_parents qp JOIN bundle_component other ON other.bundle_product_id=qp.bundle_product_id AND NOT other.is_deleted AND other.component_product_code<>qp.q_model; COMMIT;"
```

production 메서드 직접 실행의 결정적 출력 원문(완전 소비 REMOTE 경로):

```text
SET=AF17DX738WSRS Q=AR06D9151HNQ ACCESSORY->SUB_INDOOR
MATCH=[Match[setName=AF17DX738WSRS, poolIndexes=[0, 1, 2, 4]]] MATCHED_AMOUNT=295000 USAGE={I=Usage[total=1, used=1], O=Usage[total=1, used=1], Q=Usage[total=2, used=1], R=Usage[total=1, used=1]}
FOCUS=AFR-TC9D CURRENT=false LEGACY=true INPUT={INDOOR:1/1,OUTDOOR:1/1,SUB_Q:1/2,REMOTE:1/1}
```

같은 결함의 마지막 단가 fallback 경로도 별도로 재현됐다.

```text
LIVE_SET=AF17B6474GZRS Q_KIND_BEFORE=ACCESSORY Q_KIND_AFTER=SUB_INDOOR
MATCHES=[Match[setName=AF17B6474GZRS, poolIndexes=[0, 1, 2, 4, 6]]]
USAGE={INROW=Usage[total=1, used=1], OUTROW=Usage[total=1, used=1], QROW=Usage[total=2, used=1], MATROW=Usage[total=2, used=1], MAT2ROW=Usage[total=1, used=1]}
FOCUS=FPC-1412YAF2 CURRENT=false LEGACY=true INPUT={INDOOR:1/1,OUTDOOR:1/1,SUB_Q:1/2,MATERIAL:1/2,unitPrice==delivery}
```

아래 재현 명령은 같은 경계 오류의 단가 fallback 변형을 컴파일된 `LegacyModelKindClassifier.riUsageKind`, `LegacySetMatcher.findMatchesWithUsage`, `RiUsageDecision.decide`로 호출한 것이다. 독립 관점에서는 같은 방식으로 위 `AF17DX738WSRS` REMOTE 완전소비 변형도 실행해 동일한 `CURRENT=false / LEGACY=true`를 얻었다.

```powershell
@'
import java.util.*; import java.math.*;
Class<?> classifier=Class.forName("com.samhanair.logis.accounting.service.LegacyModelKindClassifier"); var classify=classifier.getDeclaredMethod("riUsageKind",String.class,String.class); classify.setAccessible(true);
String in="AF17B6474GZN",out="AF17B6470DCX",q="AR06A9170HNQ",mat="FPC-1412YAF2",mat2="FRC-1438XAF2"; String qKind=(String)classify.invoke(null,"ACCESSORY",q); System.out.println("LIVE_SET=AF17B6474GZRS Q_KIND_BEFORE=ACCESSORY Q_KIND_AFTER="+qKind);
Class<?> cc=Class.forName("com.samhanair.logis.accounting.service.LegacySetMatcher$Component"); var c=cc.getDeclaredConstructor(String.class,String.class,BigDecimal.class); c.setAccessible(true);
var comps=List.of(c.newInstance(in,"INDOOR",new BigDecimal("0")),c.newInstance(out,"OUTDOOR",new BigDecimal("0")),c.newInstance(q,qKind,new BigDecimal("180000")),c.newInstance(mat,"MATERIAL",new BigDecimal("100000")),c.newInstance(mat2,"MATERIAL",new BigDecimal("50000")));
Class<?> sc=Class.forName("com.samhanair.logis.accounting.service.LegacySetMatcher$SetCandidate"); var s=sc.getDeclaredConstructor(String.class,List.class); s.setAccessible(true); Object candidate=s.newInstance("AF17B6474GZRS",comps);
Class<?> lc=Class.forName("com.samhanair.logis.accounting.service.LegacySetMatcher$InvoiceLine"); var l=lc.getDeclaredConstructor(String.class,String.class,BigDecimal.class,String.class,String.class,String.class); l.setAccessible(true); String partner="P1",scope="SLIP-1";
var pool=List.of(l.newInstance(in,"INDOOR",new BigDecimal("0"),partner,scope,"INROW"),l.newInstance(out,"OUTDOOR",new BigDecimal("0"),partner,scope,"OUTROW"),l.newInstance(q,qKind,new BigDecimal("180000"),partner,scope,"QROW"),l.newInstance(q,qKind,new BigDecimal("180000"),partner,scope,"QROW"),l.newInstance(mat,"MATERIAL",new BigDecimal("100000"),partner,scope,"MATROW"),l.newInstance(mat,"MATERIAL",new BigDecimal("100000"),partner,scope,"MATROW"),l.newInstance(mat2,"MATERIAL",new BigDecimal("50000"),partner,scope,"MAT2ROW"));
Class<?> mc=Class.forName("com.samhanair.logis.accounting.service.LegacySetMatcher"); var mctor=mc.getDeclaredConstructor(); mctor.setAccessible(true); Object matcher=mctor.newInstance(); var find=mc.getDeclaredMethod("findMatchesWithUsage",List.class,List.class,Map.class); find.setAccessible(true); Object result=find.invoke(matcher,pool,List.of(candidate),Map.of()); var mm=result.getClass().getDeclaredMethod("matches"); mm.setAccessible(true); var um=result.getClass().getDeclaredMethod("usage"); um.setAccessible(true); Map usage=(Map)um.invoke(result); System.out.println("MATCHES="+mm.invoke(result)); System.out.println("USAGE="+usage);
Class<?> rc=Class.forName("com.samhanair.logis.accounting.service.RiUsageDecision$Row"); var r=rc.getDeclaredConstructor(String.class,String.class,String.class,String.class); r.setAccessible(true); var rows=List.of(r.newInstance("INROW",scope,in,"INDOOR"),r.newInstance("OUTROW",scope,out,"OUTDOOR"),r.newInstance("QROW",scope,q,qKind),r.newInstance("MATROW",scope,mat,"MATERIAL"),r.newInstance("MAT2ROW",scope,mat2,"MATERIAL")); Class<?> dc=Class.forName("com.samhanair.logis.accounting.service.RiUsageDecision"); var decide=dc.getDeclaredMethod("decide",String.class,String.class,List.class,Map.class); decide.setAccessible(true); Object current=decide.invoke(null,mat,"MATERIAL",rows,usage); System.out.println("FOCUS="+mat+" CURRENT="+current+" LEGACY=true INPUT={INDOOR:1/1,OUTDOOR:1/1,SUB_Q:1/2,MATERIAL:1/2,unitPrice==delivery}");
/exit
'@ | jshell --class-path 'services/accounting-service/build/classes/java/main'
```

## 5. 재분류 경계와 계열 완결성

### 5.1 구현자 주장 대조

`LegacyModelKindClassifier.java:15-21`은 다음처럼 동작한다.

- catalog kind가 null/blank이면 `ACCESSORY`로 취급한다.
- catalog가 정확히 `ACCESSORY`이고 legacy 결과가 `INDOOR/OUTDOOR/SUB_INDOOR`일 때만 재분류한다.
- 구체 catalog kind는 그대로 반환한다.
- legacy가 `REMOTE/PANEL/MATERIAL`인 generic ACCESSORY도 그대로 `ACCESSORY`다.

따라서 “카탈로그의 구체 kind와 비-main ACCESSORY는 재분류하지 않는다”는 주장은 코드와 일치한다.

### 5.2 Code.js 완결성 및 증거 정정

`Code.js:198-203`의 AR 규칙 N/X/Q와 하이픈 제외는 모두 옮겨졌다. 다만 R2 보고서의 더 넓은 주장인 “`Code.js:191-211`의 순서와 문자 위치를 그대로 구현”은 사실이 아니다.

- `Code.js:192-196`은 `^A[CP]\d{3}`, 즉 AC뿐 아니라 AP도 포함한다. Java `LegacyModelKindClassifier.java:29`는 `^AC`만 구현해 AP를 누락했다.
- `Code.js:190`의 `^PC -> PANEL`도 Java `classify`에는 없다.

현재 활성 endpoint 모집단에서 AP 누락 대상과 PC는 모두 이미 구체 catalog kind라 effective 결과는 바뀌지 않는다.

```text
 rule  | component_kind | components | links
-------+----------------+------------+-------
 AP7_N | INDOOR         |         40 |    42
 AP7_X | OUTDOOR        |         11 |    14

 component_kind | components | links
----------------+------------+-------
 PANEL          |         16 |   250
```

따라서 이는 현재 재현 가능한 사용자 결함이 아니라 R2 증거 무결성 정정이다. generic ACCESSORY AP/PC 활성 링크는 0이다.

## 6. 세 갈래와 `null` 보존

마지막 갈래는 유지된다.

- `RiUsageDecision.java:44-45`: 같은 scope에 main이 없으면 부속 `true`.
- `RiUsageDecision.java:47-48`: 미완료 failed-main이면 `false`.
- `RiUsageDecision.java:50-51`: main이 완료됐지만 focus 부속이 미완료이면 `null`.
- `MonthEndCloseService.java:500-513`: 먼저 기존 `DiscountRevalidator` 결과를 만들고, decision이 non-null일 때만 `withVerified`로 덮는다.

따라서 `null`은 true/false로 평탄화되지 않고 기존 단가 판정에 간다. Blocking 결함은 마지막 `null` 보존이 아니라, Q를 잘못 failed-main으로 세어 `null`에 도달하기 전에 `false`를 반환하는 경계 오류다.

## 7. #1058 fresh 재측정

### 7.1 종전 위험 모집단과 전역DC

이번 세션의 read-only SQL로 이전과 같은 위험 모집단을 다시 만들었다.

```text
 chosen_selector | no_option_links | component_models
-----------------+-----------------+------------------
 360             |              18 |                3
 4way            |               4 |                4
(2 rows)
```

```text
 active_configs | c360 |    s360    | c4way |   s4way    | optionless_configs
----------------+------+------------+-------+------------+--------------------
            210 |   45 | 1900000.00 |    46 | 2000000.00 |                164
(1 row)
```

종전 잘못된 단건 부모 선택을 적용한 위험값은 fresh 수치로도 `18×45 + 4×46 = 994행`, `18×1,900,000 + 4×2,000,000 = 42,200,000원`이다. 현 matcher는 단일 구성품만으로 `INDOOR+OUTDOOR` 완성 후보를 만들지 않고 `modelToken` fallback을 유지한다. 이번 Q 보정도 matcher에서 Q를 optional로 계속 처리하므로 이 22링크를 임의 옵션 selector로 바꾸지 않는다. 현재 알고리즘에 의한 동일 benchmark 과차감은 **0행/0원**이다.

위 위험 모집단 fresh 재현 명령:

```powershell
docker exec samhan-postgres psql -U samhan -d product_db -X -v ON_ERROR_STOP=1 -P pager=off -c "BEGIN TRANSACTION READ ONLY; WITH active_links AS ( SELECT bc.id AS link_id, bc.created_at, bc.component_product_code, bp.model_code AS parent_model, CASE WHEN upper(bp.model_code) ~ '^(AR|AF).*S$' THEN 'none' WHEN upper(bp.model_code) LIKE 'AC%' AND length(bp.model_code)>=9 AND substring(upper(bp.model_code),8,1)='6' AND substring(upper(bp.model_code),9,1)='P' THEN '360' WHEN upper(bp.model_code) LIKE 'AC%' AND length(bp.model_code)>=9 AND substring(upper(bp.model_code),8,1)='4' AND substring(upper(bp.model_code),9,1) IN ('P','D') THEN '4way' WHEN upper(bp.model_code) LIKE 'AC%' AND length(bp.model_code)>=9 AND substring(upper(bp.model_code),8,1)='1' AND substring(upper(bp.model_code),9,1) IN ('P','D') THEN '1way' WHEN upper(bp.model_code) LIKE 'AC%' AND length(bp.model_code)>=9 AND substring(upper(bp.model_code),9,1)='F' THEN 'grade1' WHEN upper(bp.model_code) LIKE 'AP230%' OR upper(bp.model_code) LIKE 'AP290%' OR (upper(bp.model_code) LIKE 'AP%' AND length(bp.model_code)>=9 AND substring(upper(bp.model_code),9,1)='P') OR (upper(bp.model_code) LIKE 'AP%' AND length(bp.model_code)>=11 AND substring(upper(bp.model_code),9,1)='D' AND substring(upper(bp.model_code),11,1)='C') THEN 'stand' WHEN upper(bp.model_code) LIKE 'AP%' AND length(bp.model_code)>=11 AND substring(upper(bp.model_code),9,1)='D' AND substring(upper(bp.model_code),11,1)='H' THEN 'deluxe' WHEN upper(bp.model_code) LIKE 'AP%' AND length(bp.model_code)>=9 AND substring(upper(bp.model_code),9,1)='F' THEN 'grade1' ELSE 'none' END AS actual_selector FROM bundle_component bc JOIN products bp ON bp.id=bc.bundle_product_id AND NOT bp.is_deleted AND bp.product_type='BUNDLE' WHERE NOT bc.is_deleted ), ranked AS ( SELECT *, first_value(actual_selector) OVER (PARTITION BY component_product_code ORDER BY created_at,link_id) AS chosen_selector, count(*) OVER (PARTITION BY component_product_code) AS parent_count FROM active_links ), risks AS ( SELECT * FROM ranked WHERE parent_count>1 AND actual_selector='none' AND chosen_selector<>'none' ) SELECT chosen_selector, count(*) AS no_option_links, count(DISTINCT component_product_code) AS component_models FROM risks GROUP BY chosen_selector ORDER BY chosen_selector; COMMIT;"
```

DC 명령:

```powershell
docker exec samhan-postgres psql -U samhan -d dc_config_db -X -v ON_ERROR_STOP=1 -P pager=off -c "BEGIN TRANSACTION READ ONLY; SELECT count(*) FILTER (WHERE NOT is_deleted) AS active_configs, count(*) FILTER (WHERE NOT is_deleted AND COALESCE(discount_360_amount,0)<>0) AS c360, COALESCE(sum(abs(discount_360_amount)) FILTER (WHERE NOT is_deleted AND COALESCE(discount_360_amount,0)<>0),0) AS s360, count(*) FILTER (WHERE NOT is_deleted AND COALESCE(discount_4way_amount,0)<>0) AS c4way, COALESCE(sum(abs(discount_4way_amount)) FILTER (WHERE NOT is_deleted AND COALESCE(discount_4way_amount,0)<>0),0) AS s4way, count(*) FILTER (WHERE NOT is_deleted AND discount_360_amount IS NULL AND discount_4way_amount IS NULL AND discount_1way_amount IS NULL AND discount_stand_amount IS NULL AND discount_deluxe_amount IS NULL AND discount_first_grade_amount IS NULL) AS optionless_configs FROM dc_configs; COMMIT;"
```

### 7.2 영속 회계 원천

```powershell
docker exec samhan-postgres psql -U samhan -d accounting_db -X -v ON_ERROR_STOP=1 -P pager=off -c "BEGIN TRANSACTION READ ONLY; SELECT 'tax_invoice_lines' AS source, count(*) FILTER (WHERE model_name IS NOT NULL AND btrim(model_name)<>'') AS model_rows, count(*) AS total_rows FROM tax_invoice_lines WHERE NOT is_deleted UNION ALL SELECT 'sales_accounting_slip_lines', count(*) FILTER (WHERE model_name IS NOT NULL AND btrim(model_name)<>''), count(*) FROM sales_accounting_slip_lines WHERE NOT is_deleted; COMMIT;"
```

```text
BEGIN
           source            | model_rows | total_rows
-----------------------------+------------+-----------
 tax_invoice_lines           |          0 |         22
 sales_accounting_slip_lines |          0 |          0
(2 rows)

COMMIT
```

따라서 현재 영속 모집단의 관측 과차감은 0행/0원이나, 이는 영속 모델 행이 없는 빈 모집단이다. 위 benchmark 0행/0원과 구분한다.

### 7.3 타깃 경로와 snapshot

```powershell
.\gradlew.bat :services:accounting-service:test --tests '*DailyClosingSnapshotBaselineTest' --tests '*LegacySetMatcherTest' --tests '*DailyClosingDetailServiceTest.dailyDetailKeepsModelTokenFallbackWhenSetMatchFails' --tests '*DailyClosingDetailServiceTest.dailyDetailAppliesMatchedSetToIndoorAndOutdoor' --rerun-tasks --no-daemon --console=plain
```

```text
> Task :services:accounting-service:test

BUILD SUCCESSFUL in 40s
21 actionable tasks: 21 executed
```

fresh XML은 snapshot 1, matcher 7, detail 2, 합계 10 tests이며 failure/error/skip은 모두 0이다. snapshot SHA-256도 다음과 같다.

```text
405B2596D61A2A4F3658BC9ED4F75D0B3BA9DFCF7A643E9CE38BBBC88ED0E663
```

## 8. 이번 라운드가 보지 않은 표면

- 공유 DB write 금지 때문에 Q형 수량 2와 자재 수량 2를 실제 영속 전표로 새로 저장해 HTTP→화면까지 캡처하지 않았다. 활성 실카탈로그와 컴파일된 production matcher/decision 메서드를 결합해 동일 데이터 흐름을 재현했다.
- 현재 `accounting_db` 모델 보유 원천이 0행이므로 과거 실발생 금액이나 운영 DB 발생 건수는 측정하지 못했다.
- 향후 generic `ACCESSORY`로 유입될 AP/PC 또는 N/X 모델은 현재 활성 링크가 0이므로 실 사용자 결과를 판정하지 않았다.
- accounting-service 전체 suite, Docker 이미지 재빌드, DB write/DDL, 범위 밖 리팩터링은 수행하지 않았다.
- PURCHASE 원천은 현재 빈 set pool을 넘기는 기존 경로이므로 판매 `riUsage` fix 표면으로 다시 판정하지 않았다.

## 9. 파일 상태

git 조회 외 commit/push/checkout/branch/stash/reset은 수행하지 않았다. 공유 DB 명령은 `BEGIN TRANSACTION READ ONLY` 안의 `SELECT`뿐이다.

이번 라운드 신규 파일:

- `docs/dev-reports/2026-08-03-874-r3-reconvergence.md`
