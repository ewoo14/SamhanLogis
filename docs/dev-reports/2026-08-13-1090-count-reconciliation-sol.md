# #1090 레거시 판별 수치 화해 보고서 (CODEX SOL)

> 조사일: 2026-08-13 KST  
> 범위: 코드와 공유 `product_db` 읽기 조사, 로컬 npm 의존성·빌드 재현  
> 변경: 이 보고서만 작성. 구현 코드와 공유 DB는 변경하지 않았다. DB 쿼리는 모두 `BEGIN TRANSACTION READ ONLY` 안에서 실행했다.

## 0. 확정 결론

- 이번 라운드에서 고정한 「레거시 판별」은 Desktop 계산기가 실제 호출하는 `clients/desktop/src/renderer/utils/slipDiscount.ts:103-132`의 `getModelFlags(modelCode)` 6종 OR 규칙이다.
- 이 규칙을 2026-08-13 공유 DB 활성 품목에 그대로 적용한 확정값은 **331건**이다.
- 331건 중 `cat_l_id/cat_m_id/cat_s_id` 중 하나라도 있는 행은 **218건**, 세 값이 모두 null인 행은 **113건**이다.
- 활성 품목은 **2,982건**, `discount_flags <> '000000'`은 **8건**, `legacy_discount_flag=true`는 **29건**이다. 세 집합의 쌍별 교집합과 삼중 교집합은 전부 **0건**이다.
- `DELUXE`·`GRADE1`·`STAND`가 함께 나타나는 분류 노드는 **L 단계 1개**(`SINGLE_SET / 냉난방 스탠드`)다. 한 품목이 세 플래그를 동시에 갖는 것은 0건이다. 이는 데이터 오염 증거가 아니라, 기존 분류가 L에서 “냉난방 스탠드”를 묶고 M에서 `프리미엄/디럭스`·`1등급` 등을 나누는 계층형 설계이기 때문에 생긴 집계다. 따라서 L 노드 하나에 옵션 타입 enum 하나를 기록하는 설계가 잘못된 것이다.
- 직전 복제본의 `251/187/64`는 이 보고서에서 고정한 규칙의 결과가 아니다. 다만 직전 복제본의 원본 SQL과 그 컨테이너가 남아 있지 않아, 당시 복제본 데이터가 공유 DB와 완전히 같았는지는 **모른다**. 공개된 64개 목록 자체가 정확한 규칙의 113개에서 49개를 누락하므로, 적어도 판별 규칙이 다르게 적용된 것은 확정할 수 있다.

## 1. 「레거시 판별」 코드 원문

### 1.1 이번 집계의 정본

`clients/desktop/src/renderer/utils/slipDiscount.ts:56-69`에서 계산기는 `input.modelCode`를 `getModelFlags`에 넘기고, 여섯 boolean을 각각 옵션 정액DC에 사용한다.

```ts
export function calculateSlipDiscount(
  input: SlipDiscountInput,
  config: SlipDiscountConfig | null,
): SlipDiscountResult {
  const modelFlags = getModelFlags(input.modelCode)
  const optionDiscount = input.category === 'OTHER'
    ? [
        modelFlags.is360 ? parseAmount(config?.threeSixty) : 0,
        modelFlags.is4way ? parseAmount(config?.fourWay) : 0,
        modelFlags.is1way ? parseAmount(config?.oneWay) : 0,
        modelFlags.isStand ? parseAmount(config?.stand) : 0,
        modelFlags.isDeluxe ? parseAmount(config?.deluxe) : 0,
        modelFlags.isGrade1 ? parseAmount(config?.firstGrade) : 0,
      ].reduce((sum, amount) => sum + amount, 0)
```

정확한 판별 원문은 `clients/desktop/src/renderer/utils/slipDiscount.ts:102-132`다.

```ts
/** 레거시 종합견적서 getModelFlags(model)의 분기·순서를 그대로 재현한다. */
function getModelFlags(model: string | null | undefined): ModelFlags {
  const m = String(model || '').toUpperCase()
  let is360 = false
  let is4way = false
  let is1way = false
  let isStand = false
  let isDeluxe = false
  let isGrade1 = false

  if (m.startsWith('AC') && m.length >= 9) {
    if (m[7] === '6' && m[8] === 'P') is360 = true
    if (m[7] === '4' && (m[8] === 'P' || m[8] === 'D')) is4way = true
    if (m[7] === '1' && (m[8] === 'P' || m[8] === 'D')) is1way = true
  }
  if (m.startsWith('AP') && m.length >= 9) {
    if (m.length >= 11 && m[10] === 'C') {
      if (m[8] === 'D') isStand = true
    } else if (m[8] === 'P') {
      isStand = true
    }
    if (m.length >= 11 && m[8] === 'D' && m[10] === 'H') isDeluxe = true
    if (m.startsWith('AP230') || m.startsWith('AP290')) {
      isStand = true
      isDeluxe = false
    }
  }
  if ((m.startsWith('AC') || m.startsWith('AP')) && m.length >= 9 && m[8] === 'F') {
    isGrade1 = true
  }
  return { is360, is4way, is1way, isStand, isDeluxe, isGrade1 }
}
```

JS는 zero-based이므로 SQL 대응은 `m[7] → substr(m,8,1)`, `m[8] → substr(m,9,1)`, `m[10] → substr(m,11,1)`이다. 정규식 한 개가 아니라 위 조건과 AP230/AP290 override까지 포함한 순서 있는 규칙이다.

### 1.2 소비처 간 기존 차이

종합견적서와 웹 견적/주문은 같은 기본 규칙을 가진다.

- `tools/legacy-gas/종합견적서/index.html:2200-2227`
- `clients/web/estimate-app/views/index.ejs:2373-2400`
- `clients/web/order-app/index.html:1473-1500`

반면 두 전용 주문서 인식기는 `isDeluxe`이면 `isStand=false`로 다시 덮는다.

- `tools/legacy-gas/제이시스템 전용 주문서 인식/Code.js:824-854`, 특히 `:846-849`
- `tools/legacy-gas/에어디자이너 전용 주문서 인식/Code.js:891-922`, 특히 `:913-916`

```js
// 예외처리
if (isDeluxe) {
  isStand = false;
}
```

이번 331 집계는 직전 정찰 보고서가 지목한 Desktop 원문을 기준으로 했으며, 이 전용 주문서 변형을 섞지 않았다.

## 2. 공유 DB 적용 SQL 원문과 결과

### 2.1 확정 집계 SQL

```sql
BEGIN TRANSACTION READ ONLY;

WITH active AS (
  SELECT p.*, upper(coalesce(p.model_code, '')) AS m
  FROM products p
  WHERE p.is_deleted = false
    AND p.status = 'ACTIVE'
), flags AS (
  SELECT a.*,
    (m LIKE 'AC%' AND length(m) >= 9
      AND substr(m,8,1)='6' AND substr(m,9,1)='P') AS is360,
    (m LIKE 'AC%' AND length(m) >= 9
      AND substr(m,8,1)='4' AND substr(m,9,1) IN ('P','D')) AS is4way,
    (m LIKE 'AC%' AND length(m) >= 9
      AND substr(m,8,1)='1' AND substr(m,9,1) IN ('P','D')) AS is1way,
    (m LIKE 'AP%' AND length(m) >= 9 AND (
       m LIKE 'AP230%' OR m LIKE 'AP290%' OR
       (length(m) >= 11 AND substr(m,11,1)='C' AND substr(m,9,1)='D') OR
       (NOT (length(m) >= 11 AND substr(m,11,1)='C') AND substr(m,9,1)='P')
    )) AS isstand,
    (m LIKE 'AP%' AND length(m) >= 11
      AND substr(m,9,1)='D' AND substr(m,11,1)='H'
      AND m NOT LIKE 'AP230%' AND m NOT LIKE 'AP290%') AS isdeluxe,
    ((m LIKE 'AC%' OR m LIKE 'AP%') AND length(m) >= 9
      AND substr(m,9,1)='F') AS isgrade1
  FROM active a
), marked AS (
  SELECT f.*,
    (is360 OR is4way OR is1way OR isstand OR isdeluxe OR isgrade1) AS legacy_rule,
    (cat_l_id IS NOT NULL OR cat_m_id IS NOT NULL OR cat_s_id IS NOT NULL) AS has_classification,
    (coalesce(discount_flags,'000000') <> '000000') AS stored_discount_flags,
    coalesce(legacy_discount_flag,false) AS stored_legacy_flag
  FROM flags f
)
SELECT metric, count(*) AS count
FROM marked
CROSS JOIN LATERAL (VALUES
  ('active', true),
  ('legacy_rule', legacy_rule),
  ('legacy_rule_has_classification', legacy_rule AND has_classification),
  ('legacy_rule_no_classification', legacy_rule AND NOT has_classification),
  ('discount_flags_nonzero', stored_discount_flags),
  ('legacy_discount_flag_true', stored_legacy_flag),
  ('rule_intersect_discount_flags', legacy_rule AND stored_discount_flags),
  ('rule_intersect_legacy_flag', legacy_rule AND stored_legacy_flag),
  ('discount_flags_intersect_legacy_flag', stored_discount_flags AND stored_legacy_flag),
  ('all_three', legacy_rule AND stored_discount_flags AND stored_legacy_flag)
) v(metric, hit)
WHERE hit
GROUP BY metric
ORDER BY metric;

ROLLBACK;
```

결과:

```text
active                         2982
discount_flags_nonzero           8
legacy_discount_flag_true       29
legacy_rule                    331
legacy_rule_has_classification 218
legacy_rule_no_classification  113
```

교집합 metric은 결과 행 자체가 없었다. 0건을 더 명확히 검증하기 위해 세 boolean 조합도 전부 그룹화했다.

```text
legacy_rule | discount_flags_nonzero | legacy_discount_flag_true | count
false       | false                  | false                     | 2614
false       | false                  | true                      |   29
false       | true                   | false                     |    8
true        | false                  | false                     |  331
```

따라서 다음 여덟 값이 모두 0이다.

- 규칙 331 ∩ `discount_flags` 8
- 규칙 331 ∩ `legacy_discount_flag` 29
- `discount_flags` 8 ∩ `legacy_discount_flag` 29
- 세 집합의 삼중 교집합

### 2.2 플래그별 세부 수치

같은 CTE에서 각 boolean을 별도로 센 결과다. 한 품목에서 두 플래그 이상이 켜진 행은 0건이어서 합계가 그대로 331이다.

```text
is360     27
is4way    67
is1way    54
isStand   91
isDeluxe   5
isGrade1  87
합계      331
```

## 3. 331 · 251 · 29 · 8이 각각 센 것

| 수치 | 센 것 | 이번 판정 |
|---:|---|---|
| 331 | 활성 품목의 `model_code`에 §1.1의 여섯 판별 중 하나 이상이 true인 행 | 확정 수치 |
| 251 | 직전 격리 복제본에서 사용한, 원문이 보존되지 않은 판별 결과 | 정본으로 사용 금지 |
| 29 | `products.legacy_discount_flag=true`인 활성 행 | 구형 시트 표식 컬럼; 331 규칙과 교집합 0 |
| 8 | `products.discount_flags <> '000000'`인 활성 행 | 저장 6-bit 컬럼; 331 규칙 및 29 boolean과 교집합 0 |

`legacy_discount_flag`의 정의는 `Product.java:154-156`과 `V3__migration_extension.sql:24`에 “구형 시트 row TRUE”로 적혀 있다.

```java
/** DOMAIN-EXTENSIONS §1 — 구형 시트 41 row TRUE. */
@Column(name = "legacy_discount_flag", nullable = false)
private Boolean legacyDiscountFlag = Boolean.FALSE;
```

현재 활성 실측은 29이며, 주석의 과거 41과도 다르다. 모델코드 옵션 판별 331과 같은 개념이 아니다.

`discount_flags`는 `Product.java:158-163` 및 `V3__migration_extension.sql:25`에서 여섯 bit의 저장 컬럼으로 정의된다.

```java
/**
 * DOMAIN-EXTENSIONS §1 + getModelFlags 7 prefix 정규식 — 6-bit bitset
 * (is360/is4way/is1way/isStand/isDeluxe/isGrade1). 0/1 char 6 자리 문자열.
 */
@Column(name = "discount_flags", nullable = false, length = 20)
private String discountFlags = "000000";
```

그러나 현재 8개 저장 행은 코드 규칙 331과 하나도 겹치지 않는다. 저장축이 현재 계산 규칙의 캐시라고 가정하면 안 된다.

## 4. 직전 복제본 `251/187/64`의 원인

### 확인된 사실

1. 공유 DB에 정확한 SQL을 적용하면 `331/218/113`이다.
2. 현재 접근 가능한 2026-08-12 생성 복제 컨테이너 `sol1176-pg`에도 같은 정확한 SQL을 적용하면 `331/218/113`이다.
3. 직전 보고서는 251을 만든 SQL 원문, dump 시각, 컨테이너 이름을 남기지 않았다. 그 컨테이너도 현재 존재하지 않는다. 따라서 그 복제본과 공유 DB의 행 단위 동일성은 확인할 수 없다.
4. 직전 보고서가 남긴 “미분류 64개”를 현재 정확한 113개와 비교하면 정확히 49개가 빠진다.
   - `AC...`의 `isGrade1` 45개
   - `m[10]=='C' && m[8]=='D'`인 `isStand` 4개: `AP083BNPDBC1`, `AP110BNPDBC1`, `AP145BNPDHC1`, `AP145BXPDHC1`
5. 이 49개는 §1.1 원문에서 각각 `(AC || AP) && m[8]=='F'` 분기와 AP의 `m[10]=='C'` 분기에 명시적으로 포함된다.

### 판정

직전 복제본 집계는 적어도 두 코드 분기를 완전하게 옮기지 않은 **다른 판별식**이었다. 데이터 스냅샷 차이가 추가로 있었는지는 원본 복제본 부재로 모른다. `251`을 현재 DB 변화의 증거로 해석하거나 확정 수치로 사용해서는 안 된다.

정직하게 남길 미확정점: 공개된 `64` 목록의 누락 49개는 정확히 설명할 수 있지만, 전체 `331→251` 차이 80개 중 나머지 31개 classified 행을 직전 SQL 없이 byte-for-byte 재구성할 수는 없다.

## 5. 분류 노드의 DELUXE / GRADE1 / STAND 혼재

### 읽기 SQL 요지

정확한 6개 flag를 `VALUES`로 행 전개한 뒤 각 품목의 `cat_l_id`, `cat_m_id`, `cat_s_id`를 노드로 펼쳐 다음 조건을 집계했다.

```sql
SELECT level, node_id, estimate_category, name,
       count(DISTINCT product_id) AS products,
       string_agg(DISTINCT flag, ',' ORDER BY flag) AS flags
FROM expanded_nodes
GROUP BY level, node_id, estimate_category, name
HAVING bool_or(flag='DELUXE')
   AND bool_or(flag='GRADE1')
   AND bool_or(flag='STAND');
```

결과:

```text
level L
node  96907197-2bca-43c0-96ae-8417cae3da35
estimate_category SINGLE_SET
name 냉난방 스탠드
products 59
flags DELUXE,GRADE1,STAND
```

- 세 타입이 모두 나타나는 노드: **1개**
- 개별 품목에서 세 타입 동시 true: **0개**
- 개별 품목에서 이 세 타입 중 둘 이상 true: **0개**

### 오염 여부

`Classification.java:22-26`은 분류를 L/M/S 3단계 트리로 정의한다.

```java
/**
 * 견적 품목 분류 마스터.
 *
 * <p>EstimateCategory 탭마다 독립된 L/M/S 3단계 트리를 가진다.
 */
```

실제 분류기 `clients/web/estimate-app/views/index.ejs:4290-4324`, 특히 `:4303-4306`은 “스탠드 + 냉난방”을 L=`냉난방 스탠드`로 묶고 M을 `프레스티지`, `프리미엄/디럭스`, `1등급`으로 나눈다.

```js
else if(/스탠드/.test(hay)){
  if(/비스포크/.test(hay)){ ... }
  else if(isHeatCool){
    L='냉난방 스탠드';
    if(/프레스티지/.test(hay)) M='프레스티지';
    else if(any(/프리미엄/,/디럭스/)) M='프리미엄/디럭스';
    else if(/1\s*등급/.test(hay)) M='1등급';
  }
```

DB에서도 이 L 아래의 M별 분포가 설계와 일치한다.

```text
M 1등급           / GRADE1 12
M 프레스티지      / STAND  18
M 프리미엄/디럭스 / DELUXE  5
M 프리미엄/디럭스 / STAND  24
```

따라서 “L 노드에 세 타입이 보인다”는 사실 자체는 오염이 아니라 기존 분류의 해상도 차이다. 특히 `프리미엄/디럭스` M도 두 레거시 타입을 함께 담도록 이름과 코드가 설계돼 있다. 분류 노드 하나에 단일 옵션 enum을 부여하면 정보가 소실된다.

## 6. 다음 구현 라운드가 사용할 확정 수치

```text
활성 품목                         2,982
레거시 코드 규칙 발화               331
  분류 있음                        218
  분류 없음                        113
discount_flags 비영                   8
legacy_discount_flag=true             29
세 집합의 모든 쌍별/삼중 교집합        0
DELUXE+GRADE1+STAND 혼재 분류 노드       1 (L: 냉난방 스탠드)
개별 품목 복수 플래그                    0
```

불변식에는 숫자만 넣지 말고 다음 모집단과 규칙을 함께 고정해야 한다.

```text
products WHERE is_deleted=false AND status='ACTIVE'
입력 컬럼: upper(coalesce(model_code,''))
판별: slipDiscount.ts:112-130의 전체 순서 및 AP230/AP290 override
분류 있음: cat_l_id/m_id/s_id 중 하나 이상 non-null
```

## 7. 환경 준비 실측과 정확한 순서

### 실측 결과

1. `clients/desktop`에서 `npm ci`
   - 1,017 packages 설치, `vitest`와 `@typescript-eslint/parser` 해소.
   - `npx vitest run src/renderer/utils/slipDiscount.classification-canon.test.ts`가 runner까지 도달해 3건 중 1 PASS / 2 기능 RED를 냈다.
2. 이 상태의 `npm run typecheck`
   - `../web/design-system/dist/index.d.ts` 부재로 중단.
3. `clients/web/design-system`에서 `npm ci`, 이어서 `npm run build`
   - 성공. `dist/index.js`, `dist/index.d.ts`, CSS 생성.
4. Desktop의 file dependency는 design-system 디렉터리를 가리키는 junction이므로 새 dist가 즉시 보였다.
5. Desktop `npm run typecheck`
   - 성공. 마지막 real-QA scope unit 51건도 PASS.
6. Desktop `npm run build`
   - 성공. pretest freshness guard가 요구하는 `out/main/index.js` 생성.
7. Desktop `npm test -- --run src/renderer/utils/slipDiscount.classification-canon.test.ts`
   - pretest mutation guard 5/5 PASS, freshness guard PASS, Vitest 실행 도달.
   - 기능 결과는 의도된 RED 2건 / PASS 1건. 환경 결함은 해소됨.

두 `npm ci`는 각각 audit 취약점을 보고했다(Desktop 34, design-system 15). 이번 조사는 lockfile 변경이나 `npm audit fix`를 하지 않았다.

### 다음 라운드 권장 명령 순서

```powershell
cd clients/web/design-system
npm ci
npm run build

cd ../../desktop
npm ci
npm run build
npm run typecheck
npm test -- --run src/renderer/utils/slipDiscount.classification-canon.test.ts
```

`npm ci`만으로 parser와 Vitest는 해결되지만, 전체 공식 테스트 경로에는 **design-system build와 Desktop build가 모두 필요**하다.

## 8. 라운드 종료 점검

- `git ls-files --deleted`: 빈 출력 — 삭제된 추적 파일 없음.
- `git ls-files --error-unmatch tools/.s24-build-only/build/deep/tracked-writer.mjs`: 경로 정상 반환, `Test-Path=True` — 추적 파일 존재, 삭제되지 않음.
- 이 라운드 종료 시 `w1090`을 command line에 포함한 `node/npm/npx/java/electron` 프로세스: 0개.
- pretest mutation 임시 경로와 `NewActor*` 임시 파일: 0개.
- `git status --short`: 이 보고서 1개만 untracked. 구현 코드와 lockfile의 추적 변경 없음.
