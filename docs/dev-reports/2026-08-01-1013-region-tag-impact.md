# 1013 지방·야적 태그 전환 영향 조사

## 조사 범위와 제약

- 조사일: 2026-08-01
- 목적: `RegionalService`의 17개 시도 문자열 분류와 `delivery_tag = 'REGION'` 집합 간 이동 건수 및 영향 범위를 측정한다.
- 변경 범위: 이 보고서 파일 하나만 작성한다. 애플리케이션 코드는 수정하지 않는다.
- 금지 사항 준수: git 명령, Docker 재빌드·재기동, DB 쓰기, 빌드·테스트를 실행하지 않는다.
- 개인정보 표기 원칙: UUID·실제 주소·전화번호는 보고서에 기록하지 않고, 필요한 개별 식별은 전표번호만 사용한다.

## 개발책임자 제공 기준선

- `DeliveryTag.REGION`은 판매전표의 지방 여부를 나타내는 명시적 태그이며 주소 접두어 방식이 아니다.
- `DeliveryTag.STACK`은 판매전표의 야적 여부를 나타내는 명시적 태그이다.
- 제공된 운영 DB 집계: `(없음) 2261 | DAY 52 | REGION 12 | STACK 11 | RETURN_RENTAL 10` (`deleted_at IS NULL`). 이 수치는 아래에서 읽기 전용 SQL로 재확인한다.

## 코드 기준 분류 정의

### `RegionalService`의 현행 문자열 분류

- `services/arologis-service/src/main/java/com/samhanair/logis/arologis/service/RegionalService.java:57-59`에 17개 문자열이 고정되어 있다: 서울, 부산, 대구, 인천, 광주, 대전, 울산, 세종, 경기, 강원, 충북, 충남, 전북, 전남, 경북, 경남, 제주.
- 같은 파일 `102-112`에서 주소가 null/blank이면 미분류하고, 공백만 제거한 주소 전체에 대해 각 문자열을 `contains`로 검사하여 첫 일치 문자열을 반환한다. 즉 주소의 실제 행정구역 접두어 여부가 아니라 주소 문자열 어디에서든 17개 토큰 중 하나가 포함되면 분류된다.
- 같은 파일 `69-93`에서 해당 일자의 모든 출고전표를 가져와 주소가 17개 문자열 중 하나와 일치하면 `sidoGroups`, 아니면 `unmatched`에 넣는다.

### 태그 정의

- `services/slip-service/src/main/java/com/samhanair/logis/slip/domain/DeliveryTag.java:16-27`에서 `STACK("야적", OUTBOUND, true)`와 `REGION("지방", OUTBOUND, true)`은 모두 출고 전용 명시적 배송 태그이다.
- 같은 파일 `8-9`는 두 태그를 배송일정 구조화 대상으로 설명하며, 주소 문자열에서 자동 추론한다는 정의는 없다.

## 실데이터 조사 기준

- 실행 중이던 기존 `samhan-postgres` 컨테이너에 읽기 전용으로 접속했다. 컨테이너를 기동·재기동·재빌드하지 않았다.
- DB는 `slip_db`, 대상 테이블은 `public.slips`이다. 아래 스키마 확인도 `BEGIN READ ONLY`와 `ROLLBACK` 사이에서 수행했다.

```sql
BEGIN READ ONLY;
SELECT current_database();
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema='public'
  AND table_name='slips'
  AND column_name IN ('slip_no','slip_type','delivery_tag','delivery_address','deleted_at','is_deleted')
ORDER BY ordinal_position;
ROLLBACK;
```

출력 원문:

```text
BEGIN
 current_database
------------------
 slip_db
(1 row)

   column_name    |          data_type
------------------+-----------------------------
 slip_type        | character varying
 slip_no          | character varying
 delivery_tag     | character varying
 deleted_at       | timestamp without time zone
 is_deleted       | boolean
 delivery_address | character varying
(6 rows)

ROLLBACK
```

- `RegionalService`가 `SlipServiceClient.getOutboundSlips(date,date)`만 사용하므로 분류 영향의 주 모집단은 활성 출고전표(`slip_type='OUTBOUND' AND deleted_at IS NULL`)이다.
- 저장소의 `/internal/slips/outbound` 실제 제공 구현은 검색되지 않았다. `services/arologis-service/src/main/java/com/samhanair/logis/arologis/client/SlipServiceClient.java:29-32,88-107`에는 소비 계약만 있고, slip-service에는 `/internal/slips/outbound-lines`만 확인된다. 따라서 아래 수치는 요청에서 명시한 `slips.delivery_address`를 주소 입력으로 사용해 Java 알고리즘을 SQL로 동일 재현한 직접 DB 측정값이다. 실제 주소 payload는 제공 endpoint가 500이어서 **확인불가**이다.

### 현재 실행 경로 확인

- 기존 실행 중 컨테이너 설정은 `SAMHAN_AROLOGIS_CLIENT_SKELETON_MODE=false`였다.
- 내부 토큰 값은 출력하지 않고 동일 토큰으로 응답 상태와 길이만 확인했다. 컨테이너 재기동·변경은 하지 않았다.

출력 원문:

```text
/internal/slips/outbound?from=2026-06-24&to=2026-06-24 status=500
/internal/slips/outbound-lines?from=2026-06-24&to=2026-06-24 status=200 contentLength=1314
```

- 따라서 **현재 실행 경로 그대로라면** `SlipServiceClient.java:108-115`의 5xx→빈 리스트 처리 때문에 `RegionalService`가 실제로 분류하는 전표는 **0건**이다. 이는 17개 문자열 알고리즘의 데이터 판정 결과가 아니라 upstream endpoint 부재/오류로 입력이 0건인 결과다.
- 아래 SQL 측정은 이 실행 장애를 우회해 “17개 문자열 알고리즘을 저장 전표 데이터에 적용하면 얼마나 이동하는가”를 계산한 것이다.

## 핵심 집합 대조 — `delivery_address` 기준

실행 SQL:

```sql
BEGIN READ ONLY;

SELECT COALESCE(delivery_tag,'(없음)') AS delivery_tag, count(*) AS count
FROM slips
WHERE deleted_at IS NULL
GROUP BY 1
ORDER BY 1;

WITH active_outbound AS (
  SELECT slip_no,
         delivery_tag,
         delivery_address,
         EXISTS (
           SELECT 1
           FROM unnest(ARRAY[
             '서울','부산','대구','인천','광주','대전','울산','세종',
             '경기','강원','충북','충남','전북','전남','경북','경남','제주'
           ]) AS p(prefix)
           WHERE position(prefix in replace(delivery_address,' ','')) > 0
         ) AS sido_match
  FROM slips
  WHERE deleted_at IS NULL
    AND slip_type='OUTBOUND'
), counts AS (
  SELECT count(*) AS active_outbound,
         count(*) FILTER (
           WHERE delivery_address IS NOT NULL AND btrim(delivery_address) <> ''
         ) AS has_delivery_address,
         count(*) FILTER (WHERE sido_match) AS sido_region,
         count(*) FILTER (WHERE delivery_tag='REGION') AS tag_region,
         count(*) FILTER (WHERE sido_match AND delivery_tag='REGION') AS both_region,
         count(*) FILTER (
           WHERE sido_match AND delivery_tag IS DISTINCT FROM 'REGION'
         ) AS drops_from_region,
         count(*) FILTER (
           WHERE NOT sido_match AND delivery_tag='REGION'
         ) AS newly_region,
         count(*) FILTER (WHERE delivery_tag='STACK') AS tag_stack
  FROM active_outbound
)
SELECT * FROM counts;

ROLLBACK;
```

출력 원문:

```text
BEGIN
 delivery_tag  | count
---------------+-------
 (없음)        |  2261
 DAY           |    52
 REGION        |    12
 RETURN_RENTAL |    10
 STACK         |    11
(5 rows)

 active_outbound | has_delivery_address | sido_region | tag_region | both_region | drops_from_region | newly_region | tag_stack
-----------------+----------------------+-------------+------------+-------------+-------------------+--------------+-----------
            2304 |                    0 |           0 |         12 |           0 |                 0 |           12 |        11
(1 row)

ROLLBACK
```

직접 답변(요청에서 지정한 `delivery_address` 기준):

1. 17개 시도 문자열로 지방 판정되는 활성 출고전표는 **0건**이다.
2. `delivery_tag='REGION'`은 **12건**이며 교집합은 **0건**이다.
   - 문자열 지방이지만 REGION 태그가 아닌 건: **0건** — 태그 전환 시 지방에서 빠지는 건 0건.
   - REGION 태그지만 문자열 지방이 아닌 건: **12건** — 태그 전환 시 새로 지방이 되는 건 12건.
3. 활성 출고전표 **2,304건** 중 값이 있는 `delivery_address`는 **0건**이다. 따라서 `REGION` 12건이 실제 지방 배송량을 정확히 반영하는지 여부는 `delivery_address`와 비교해서 판단할 수 없다. 적어도 이 컬럼의 주소 기반 자동 검증·보완은 현재 데이터로 불가능하다.

전체 활성 전표까지 넓힌 `delivery_address` 확인 SQL:

```sql
BEGIN READ ONLY;
SELECT COALESCE(slip_type,'(없음)') AS slip_type,
       count(*) AS active_slips,
       count(*) FILTER (
         WHERE delivery_address IS NOT NULL AND btrim(delivery_address)<>''
       ) AS delivery_address_nonblank
FROM slips
WHERE deleted_at IS NULL
GROUP BY slip_type
ORDER BY slip_type;

SELECT count(*) AS active_slips_total,
       count(*) FILTER (
         WHERE delivery_address IS NOT NULL AND btrim(delivery_address)<>''
       ) AS delivery_address_nonblank_total
FROM slips
WHERE deleted_at IS NULL;
ROLLBACK;
```

출력 원문:

```text
BEGIN
 slip_type | active_slips | delivery_address_nonblank
-----------+--------------+---------------------------
 INBOUND   |           42 |                         0
 OUTBOUND  |         2304 |                         0
(2 rows)

 active_slips_total | delivery_address_nonblank_total
--------------------+---------------------------------
               2346 |                               0
(1 row)

ROLLBACK
```

- 요청한 “`delivery_address`가 있는 전표 수”는 활성 전체 **2,346건 중 0건**, 그중 활성 출고 **2,304건 중 0건**이다.

> 주의: 위 0/0/12 결과는 `delivery_address`를 입력 주소로 삼았을 때의 정확한 값이다. `RegionalService`의 소비 계약은 “거래처 주소 enriched 응답”이라고 쓰여 있으나 그 제공 endpoint 구현이 저장소에 없으므로, 실제로 의도했던 주소 원천을 아래에서 추가 추적한다.

### 주소 원천 교차 점검

실행 SQL:

```sql
BEGIN READ ONLY;
WITH a AS (
  SELECT delivery_tag, customer_address, shipping_address,
         inspection_address, delivery_address, supervision_address
  FROM slips
  WHERE deleted_at IS NULL AND slip_type='OUTBOUND'
), fields AS (
  SELECT delivery_tag, v.field_name, v.addr
  FROM a
  CROSS JOIN LATERAL (VALUES
    ('customer_address',customer_address),
    ('shipping_address',shipping_address),
    ('inspection_address',inspection_address),
    ('delivery_address',delivery_address),
    ('supervision_address',supervision_address)
  ) v(field_name,addr)
), flagged AS (
  SELECT *, EXISTS (
    SELECT 1
    FROM unnest(ARRAY[
      '서울','부산','대구','인천','광주','대전','울산','세종',
      '경기','강원','충북','충남','전북','전남','경북','경남','제주'
    ]) p(prefix)
    WHERE position(prefix in replace(addr,' ','')) > 0
  ) AS sido_match
  FROM fields
)
SELECT field_name,
       count(*) FILTER (WHERE addr IS NOT NULL AND btrim(addr)<>'') AS nonblank,
       count(*) FILTER (WHERE sido_match) AS sido_match,
       count(*) FILTER (WHERE sido_match AND delivery_tag='REGION') AS both_region,
       count(*) FILTER (
         WHERE sido_match AND delivery_tag IS DISTINCT FROM 'REGION'
       ) AS string_not_region_tag,
       count(*) FILTER (
         WHERE NOT sido_match AND delivery_tag='REGION'
       ) AS region_tag_not_string
FROM flagged
GROUP BY field_name
ORDER BY field_name;
ROLLBACK;
```

출력 원문:

```text
BEGIN
     field_name      | nonblank | sido_match | both_region | string_not_region_tag | region_tag_not_string
---------------------+----------+------------+-------------+-----------------------+-----------------------
 customer_address    |      161 |        161 |           0 |                   161 |                    12
 delivery_address    |        0 |          0 |           0 |                     0 |                    12
 inspection_address  |        0 |          0 |           0 |                     0 |                    12
 shipping_address    |        2 |          0 |           0 |                     0 |                    12
 supervision_address |        0 |          0 |           0 |                     0 |                    12
(5 rows)

ROLLBACK
```

- 만약 누락된 `/internal/slips/outbound` 구현이 `customer_address`를 그대로 `address`로 내려주려던 계약이었다면 결과는 문자열 지방 **161건**, 교집합 **0건**, 태그 전환 시 빠짐 **161건**, 새로 포함 **12건**이다.
- 그러나 현재 소스에는 그 매핑 구현이 없으므로 이 161/0/161/12를 “현행 `RegionalService` 실호출 결과”라고 확정할 수는 없다. 확정 가능한 주 결과는 요청에서 명시된 `delivery_address` 기준 0/0/0/12이며, 의도된 거래처 주소 기준 결과는 위 조건부 수치이다.

## `delivery_tag` 입력 주체와 시점

### 사용자가 선택하는 정상 수동 생성 경로

- `clients/desktop/src/renderer/routes/SlipFormPage.tsx:580`에서 태그 초기값은 `null`이다.
- 같은 파일 `1246-1257`에서 판매전표 화면은 `DeliveryTagSelector`를 표시하고, 사용자가 선택한 값을 `setTag(code)`로 저장한다. REGION/STACK이면 하차일을 함께 자동 계산하지만 태그 자체를 주소로 자동 선택하지는 않는다.
- 같은 파일 `1072-1082`에서 저장 시 판매전표에만 사용자가 고른 `tag`를 `deliveryTag`로 API에 보낸다. 선택하지 않으면 `undefined`로 생략한다.
- `services/slip-service/src/main/java/com/samhanair/logis/slip/web/dto/CreateSlipRequest.java:49-57`에서 `deliveryTag`는 nullable이며 `@NotNull`이 없다.
- `services/slip-service/src/main/java/com/samhanair/logis/slip/service/SlipService.java:255-264`는 요청의 `deliveryTag`를 그대로 `Slip.createOutbound`에 전달한다. null이면 마감 게이트도 opt-in 방식으로 통과한다.
- `services/slip-service/src/main/java/com/samhanair/logis/slip/domain/Slip.java:656-666`은 전달된 태그의 방향만 검증하고 그대로 생성자에 전달한다. 주소 기반 자동 판정은 없다.

### 생성 후 수정 경로

- `services/slip-service/src/main/java/com/samhanair/logis/slip/service/SlipService.java:361-379`의 헤더 수정과 `441-455`의 배치 수정은 요청에 태그가 있을 때만 태그 변경을 수행한다.
- `services/slip-service/src/main/java/com/samhanair/logis/slip/domain/Slip.java:880-889`에서 `deliveryTag != null`일 때만 기존 태그를 덮어쓴다. null은 “비움”이 아니라 “보존”이다.
- 따라서 정상 UI 기준으로 `REGION`/`STACK`은 **사용자가 판매전표 생성 시 선택하거나, 수정 가능한 DRAFT/SAVED 상태에서 명시적으로 변경할 때** 채워진다. 주소·메모로 자동 분류하여 태그를 채우는 로직은 확인되지 않았다.

### 태그가 채워지지 않는 생성 경로

다음 경로는 출고전표를 만들 때 코드로 `deliveryTag=null`을 명시한다. 이후 사용자가 DRAFT/SAVED 상태에서 헤더를 수정하지 않으면 태그는 계속 비어 있다.

- 견적 발행: `services/slip-service/src/main/java/com/samhanair/logis/slip/publish/SlipPublishService.java:143-151`.
- 거래처 주문 발행: 같은 파일 `223-230`.
- 거래처 주문 병합 발행: 같은 파일 `323-328`.
- 견적→전표 변환: `services/slip-service/src/main/java/com/samhanair/logis/slip/estimate/service/EstimateToSlipConverter.java:52-75`.
- 모바일 현장 주문 발행: `services/slip-service/src/main/java/com/samhanair/logis/slip/mobile/service/MobilePartnerOrderService.java:107-126`.

보존·예외 경로:

- 전표 복제는 원본 태그를 그대로 승계한다: `services/slip-service/src/main/java/com/samhanair/logis/slip/service/SlipDuplicateService.java:88-101`. 원본이 null이면 복사본도 null이고, REGION/STACK이면 그대로 복제된다.
- 개발 시더는 STACK 10건을 자동 생성하도록 명시한다: `services/slip-service/src/main/java/com/samhanair/logis/slip/seed/SlipSeeder.java:275-285,340-348`. 이는 업무상 주소 판정이 아니라 개발 seed 데이터 생성이다.

판단: 태그 누락 경로가 명확히 존재한다. 특히 주문·견적·모바일 발행은 주소가 전달되는 경우에도 태그를 자동 설정하지 않는다. 그러므로 REGION 12건만 보고 “실제 지방 배송이 12건뿐”이라고 결론 내릴 수 없다.

## REGION 12건·STACK 11건의 데이터 성격

실행 SQL:

```sql
BEGIN READ ONLY;
SELECT delivery_tag,
       count(*) AS total,
       count(*) FILTER (WHERE memo LIKE '[Stage 2 시드]%') AS stage2_seed,
       count(*) FILTER (WHERE source_type IS NULL) AS source_type_null,
       count(*) FILTER (
         WHERE customer_address IS NOT NULL AND btrim(customer_address)<>''
       ) AS customer_address_nonblank,
       count(*) FILTER (
         WHERE delivery_address IS NOT NULL AND btrim(delivery_address)<>''
       ) AS delivery_address_nonblank
FROM slips
WHERE deleted_at IS NULL AND delivery_tag IN ('REGION','STACK')
GROUP BY delivery_tag
ORDER BY delivery_tag;

SELECT slip_no, slip_date, status, delivery_tag,
       COALESCE(source_type,'(없음)') AS source_type,
       CASE WHEN memo LIKE '[Stage 2 시드]%' THEN 'Y' ELSE 'N' END AS stage2_seed,
       CASE WHEN customer_address IS NOT NULL AND btrim(customer_address)<>''
            THEN 'Y' ELSE 'N' END AS customer_address_present,
       CASE WHEN delivery_address IS NOT NULL AND btrim(delivery_address)<>''
            THEN 'Y' ELSE 'N' END AS delivery_address_present
FROM slips
WHERE deleted_at IS NULL AND delivery_tag IN ('REGION','STACK')
ORDER BY delivery_tag, slip_date, slip_no;
ROLLBACK;
```

출력 원문:

```text
BEGIN
 delivery_tag | total | stage2_seed | source_type_null | customer_address_nonblank | delivery_address_nonblank
--------------+-------+-------------+------------------+---------------------------+---------------------------
 REGION       |    12 |           0 |                0 |                         0 |                         0
 STACK        |    11 |           9 |                0 |                         0 |                         0
(2 rows)

   slip_no    | slip_date  |   status   | delivery_tag | source_type | stage2_seed | customer_address_present | delivery_address_present
--------------+------------+------------+--------------+-------------+-------------+--------------------------+--------------------------
 2026/06/24-1 | 2026-06-24 | DRAFT      | REGION       | MANUAL      | N           | N                        | N
 2026/06/24-2 | 2026-06-24 | DRAFT      | REGION       | MANUAL      | N           | N                        | N
 2026/06/24-3 | 2026-06-24 | DRAFT      | REGION       | MANUAL      | N           | N                        | N
 2026/06/24-4 | 2026-06-24 | DRAFT      | REGION       | MANUAL      | N           | N                        | N
 2026/06/24-5 | 2026-06-24 | DRAFT      | REGION       | MANUAL      | N           | N                        | N
 2026/06/24-6 | 2026-06-24 | DRAFT      | REGION       | MANUAL      | N           | N                        | N
 2026/06/24-7 | 2026-06-24 | DRAFT      | REGION       | MANUAL      | N           | N                        | N
 2026/06/25-1 | 2026-06-25 | DRAFT      | REGION       | MANUAL      | N           | N                        | N
 2026/06/25-2 | 2026-06-25 | DRAFT      | REGION       | MANUAL      | N           | N                        | N
 2026/06/25-3 | 2026-06-25 | DRAFT      | REGION       | MANUAL      | N           | N                        | N
 2026/06/27-1 | 2026-06-27 | DRAFT      | REGION       | MANUAL      | N           | N                        | N
 2026/06/27-3 | 2026-06-27 | DRAFT      | REGION       | MANUAL      | N           | N                        | N
 2026/02/20-1 | 2026-02-20 | DRAFT      | STACK        | MANUAL      | Y           | N                        | N
 2026/02/21-1 | 2026-02-21 | SAVED      | STACK        | MANUAL      | Y           | N                        | N
 2026/02/22-1 | 2026-02-22 | SAVED      | STACK        | MANUAL      | Y           | N                        | N
 2026/02/23-1 | 2026-02-23 | ACCEPTED   | STACK        | MANUAL      | Y           | N                        | N
 2026/02/24-1 | 2026-02-24 | PROCESSING | STACK        | MANUAL      | Y           | N                        | N
 2026/02/25-1 | 2026-02-25 | INSPECTING | STACK        | MANUAL      | Y           | N                        | N
 2026/02/26-1 | 2026-02-26 | COMPLETED  | STACK        | MANUAL      | Y           | N                        | N
 2026/02/27-1 | 2026-02-27 | DELIVERED  | STACK        | MANUAL      | Y           | N                        | N
 2026/02/28-1 | 2026-02-28 | DELIVERED  | STACK        | MANUAL      | Y           | N                        | N
 2026/03/01-1 | 2026-03-01 | REJECTED   | STACK        | MANUAL      | N           | N                        | N
 2026/06/27-2 | 2026-06-27 | DRAFT      | STACK        | MANUAL      | N           | N                        | N
(23 rows)

ROLLBACK
```

판단:

- REGION 12건은 모두 `MANUAL`, 모두 DRAFT, 2026-06-24~27에 집중되어 있고 주소 계열 두 핵심 컬럼이 모두 비어 있다. 이 표본만으로 실제 지방 배송량이 적다고 판단할 근거는 없다.
- STACK 11건 중 최소 **9건**은 메모의 `[Stage 2 시드]` 표식으로 개발 seed임이 직접 확인된다. 코드상 시더는 STACK 10건을 만들도록 되어 있으나, DB에서 표식으로 직접 확인되는 것은 9건이므로 나머지 2건의 생성 경위는 **확인불가**이다.
- 결론적으로 이 로컬 `slip_db`의 REGION/STACK 건수는 운영 배송 비율의 정상성 판단 표본으로 부적합하다. 확인 가능한 것은 “태그가 자동 주소 분류로 채워지지 않고, 여러 생성 경로에서 null로 남는다”는 구조적 사실이다. 태그 UI 사용률 또는 운영 원천 데이터가 없어서 실제 지방 배송이 적은지, 사용자가 태그를 빠뜨리는지의 비율 분리는 **확인불가**이다.

## STACK(야적) 문자열 판정 여부와 집합 대조

코드 전수 검색 결과:

- `RegionalService`에는 STACK/야적 분류가 전혀 없다. 17개 시도 문자열만 주소에서 찾는다.
- slip-service의 현행 배송일정 판정은 문자열이 아니라 enum 비교만 한다. `services/slip-service/src/main/java/com/samhanair/logis/slip/domain/schedule/DeliverySchedule.java:39-49,70-79,90-92`는 `tag == REGION || tag == STACK`을 기준으로 계산한다.
- 다만 별도 레거시 웹 견적 화면에는 주소 문자열 접두어 코드가 남아 있다. `clients/web/estimate-app/views/index.ejs:15335-15350`은 사용자가 `chkYard`를 체크하면 `addrBase` 앞에 `야적/`을 붙이고, `15375-15393`은 입력 중 그 접두어를 강제한다. 이것은 기존 문자열을 읽어 판매전표 `delivery_tag`를 자동 채우는 분류기는 아니며, 견적 화면 체크박스 상태를 주소 문자열로 표현하는 별도 경로다.

실행 SQL(레거시 `야적/` 주소 접두어와 STACK 태그의 현재 DB 대조):

```sql
BEGIN READ ONLY;
WITH a AS (
  SELECT delivery_tag, delivery_address, customer_address, shipping_address, memo
  FROM slips
  WHERE deleted_at IS NULL AND slip_type='OUTBOUND'
), flags AS (
  SELECT *,
         COALESCE(delivery_address LIKE '야적/%',false) AS delivery_prefix,
         COALESCE(customer_address LIKE '야적/%',false) AS customer_prefix,
         COALESCE(shipping_address LIKE '야적/%',false) AS shipping_prefix,
         COALESCE(memo LIKE '%야적%',false) AS memo_contains
  FROM a
)
SELECT count(*) FILTER (WHERE delivery_tag='STACK') AS tag_stack,
       count(*) FILTER (WHERE delivery_prefix) AS delivery_prefix_stack,
       count(*) FILTER (
         WHERE delivery_prefix AND delivery_tag='STACK'
       ) AS delivery_prefix_both,
       count(*) FILTER (WHERE customer_prefix) AS customer_prefix_stack,
       count(*) FILTER (WHERE shipping_prefix) AS shipping_prefix_stack,
       count(*) FILTER (WHERE memo_contains) AS memo_contains_stack_word,
       count(*) FILTER (
         WHERE memo_contains AND delivery_tag='STACK'
       ) AS memo_word_and_tag
FROM flags;
ROLLBACK;
```

출력 원문:

```text
BEGIN
 tag_stack | delivery_prefix_stack | delivery_prefix_both | customer_prefix_stack | shipping_prefix_stack | memo_contains_stack_word | memo_word_and_tag
-----------+-----------------------+----------------------+-----------------------+-----------------------+--------------------------+-------------------
        11 |                     0 |                    0 |                     0 |                     0 |                        1 |                 1
(1 row)

ROLLBACK
```

직접 답변:

- 활성 출고전표의 STACK 태그는 **11건**이다.
- `delivery_address`, `customer_address`, `shipping_address` 중 `야적/` 접두어가 있는 전표는 각각 **0건**, 교집합도 **0건**이다.
- 메모에 “야적” 문자열이 있는 전표는 **1건**이고 그 1건은 STACK 태그와 겹치지만, 이를 분류에 사용하는 현행 main 코드는 없다.
- 따라서 판매전표의 현행 야적 판정 집합은 STACK 태그 집합뿐이다. 태그 방식으로 “전환”할 별도의 야적 문자열 분류 결과는 없으며, estimate-app의 주소 접두어 표현과는 데이터 계약이 분리되어 있다.

## `RegionalService` 결과 소비처 전수 및 영향

### 백엔드 진입·응답 계약

- `services/arologis-service/src/main/java/com/samhanair/logis/arologis/controller/ArologisAdminController.java:377-384` — `GET /admin/arologis/dispatches/regional?date=...`가 `regionalService.classifyBySido(date)` 결과를 그대로 반환한다. 태그 전환 시 이 endpoint의 행 포함 여부와 그룹 결과가 바뀐다.
- `services/arologis-service/src/main/java/com/samhanair/logis/arologis/dto/RegionalDispatchResponse.java:20-45` — 응답은 `date`, `sidoGroups`, `unmatched`이며 각 행은 전표번호·거래처코드·거래처명·주소·시도를 가진다. 태그 기반은 “17개 시도 그룹”과 “문자열 미매칭”이라는 현재 DTO 의미를 그대로 유지할 수 없으므로 계약 의미가 영향받는다.

### Samhan Public 데스크톱

- `clients/desktop/src/renderer/api/arologisDispatchApi.ts:70-88,112-118` — 응답 타입과 `/dispatches/regional` 호출. 포함 행과 `sidoGroups/unmatched` 의미가 영향받는다.
- `clients/desktop/src/renderer/routes/ArologisPreClassifyPage.tsx:108-113` — 지방가배차 탭이 endpoint를 30초마다 조회한다.
- 같은 파일 `149-163` — 시도 그룹과 미매칭 행을 주소 포함 CSV로 내보낸다. 태그 전환 시 CSV 포함 전표, 시도 열, 미매칭 열이 바뀐다.
- 같은 파일 `176-182` — 그룹+미매칭 합계로 화면 총 건수를 계산한다. 측정 모집단 전체로 보면 `delivery_address` 기준 0건에서 REGION 12건으로 바뀔 수 있다.
- 같은 파일 `511-529` — 시도별 섹션과 미매칭 섹션을 렌더링한다. 태그만으로는 시도명을 만들 수 없으므로 화면 그룹 구조가 직접 영향받는다.
- `clients/desktop/src/renderer/routes/index.tsx:131,997` — 위 페이지의 실제 라우트 등록점.

### 독립 아로로지스 데스크톱

- `clients/arologis-desktop/src/renderer/api/arologisDispatch.ts:70-88,124-130` — 동일 응답 타입과 endpoint 호출.
- `clients/arologis-desktop/src/renderer/routes/dispatches/PreClassifyPage.tsx:122-128` — 지방가배차 탭이 30초마다 조회한다.
- 같은 파일 `130-183` — 결과를 `REGIONAL` 프로그램 유형으로 자동 저장하고 이전 저장 결과를 복원한다. 태그 전환 후 새 결과뿐 아니라 저장 이력의 payload 의미와 구 결과 복원 비교가 영향받는다.
- 같은 파일 `185-216` — 명명 수동 저장과 이력 복원도 동일 payload를 사용한다.
- 같은 파일 `252-266` — CSV 행/시도/미매칭 구성이 영향받는다.
- 같은 파일 `277-280,647-664,680-683` — 총 건수, 빈 화면, 시도별/미매칭 렌더링이 영향받는다.
- `clients/arologis-desktop/src/renderer/routes/index.tsx:44,156` — `/dispatches/pre-classify` 라우트 등록점.
- `clients/arologis-desktop/src/renderer/routes/dispatches/DispatchesLayout.tsx:5` — 메뉴 진입점.
- `clients/arologis-desktop/src/renderer/routes/dispatches/ManualDispatchPage.tsx:442` — 수동배차 화면에서 가배차 분류 화면으로 이동하는 진입점.

### 검증 코드(행동 계약 변경 시 함께 영향)

- `services/arologis-service/src/test/java/com/samhanair/logis/arologis/service/RegionalServiceTest.java:46-105` — 주소 문자열별 시도 그룹, 미매칭, 빈 결과, null 날짜를 검증한다.
- `services/arologis-service/src/test/java/com/samhanair/logis/arologis/it/ArologisAdminControllerIT.java:529-535` — endpoint가 부산 그룹을 반환한다고 검증한다.
- `services/arologis-service/src/test/java/com/samhanair/logis/arologis/it/ArologisPermissionControllerIT.java:351` — endpoint 권한 계약을 검증한다(분류 내용은 아니지만 경로 영향).
- `clients/desktop/playwright/sp-08-3-dispatch-parity/sp-08-3-dispatch-parity.spec.ts:46` — 해당 endpoint를 독립 아로로지스 이식 parity 원천으로 고정한다.

영향 요약: 태그 기반으로 바꾸면 단순히 포함 건수만 바뀌지 않는다. 양 데스크톱의 지방가배차 탭, 총 건수, 시도별 카드, 미매칭 영역, CSV, 아로로지스 저장 이력/복원 payload, 그리고 주소 그룹 계약을 고정한 테스트가 모두 영향을 받는다. 특히 `REGION` 태그 자체에는 시도 정보가 없으므로, “REGION 전표 선별”과 “선별된 전표의 시도별 그룹핑”을 분리하지 않으면 기존 UI 계약을 보존할 수 없다.

## 최종 답변 요약

1. **17개 시도 문자열 지방 판정 건수**
   - 현재 서비스 실호출: upstream `/internal/slips/outbound`가 500이고 client가 빈 목록으로 바꾸므로 **0건**.
   - 요청에서 지정한 활성 출고전표 `delivery_address`에 Java 알고리즘을 직접 적용: **0건**. 이유는 활성 출고 2,304건 모두 `delivery_address`가 비어 있기 때문이다.
   - 누락 endpoint가 `customer_address`를 쓸 의도였다고 가정한 조건부 값: **161건**. 실제 payload 매핑이 없어 이 값은 현행 실호출 결과로 확정 불가.
2. **REGION 12건과의 대조 (`delivery_address` 기준)**
   - 문자열 지방 ∩ REGION: **0건**.
   - 문자열 지방이지만 REGION 아님(빠짐): **0건**.
   - REGION이지만 문자열 지방 아님(새로 지방): **12건**.
   - 조건부 `customer_address` 기준이면 교집합 0건, 빠짐 161건, 새로 지방 12건.
3. **REGION 12건의 정상성**
   - 활성 전체 2,346건 중 `delivery_address` 보유 **0건**; 활성 출고 2,304건 중도 **0건**.
   - REGION 12건은 전부 MANUAL·DRAFT이며 2026-06-24~27에 집중되고 주소가 없다.
   - 여러 자동 발행 경로가 태그를 null로 생성한다. 따라서 “실제 지방 배송이 적다”는 판단은 불가하며, 태그 사용 누락 가능성은 구조적으로 존재한다. 운영 표본이 없어 둘의 비율은 **확인불가**.
4. **STACK**
   - STACK 태그 **11건**. 주소 3개 컬럼의 `야적/` 접두어는 모두 0건이고, 이를 판매전표 분류에 쓰는 main 코드는 없다.
   - 별도 estimate-app은 체크박스로 주소에 `야적/`을 붙이는 코드가 남아 있으나, 판매전표 `delivery_tag` 자동 판정 경로는 아니다.
5. **영향처**
   - `/admin/arologis/dispatches/regional` 응답, 두 데스크톱의 지방가배차 탭·합계·시도/미매칭 카드·CSV, 독립 아로로지스의 자동/수동 저장 이력과 복원, 관련 서비스/컨트롤러/권한/parity 검증이 영향받는다. 상세 `파일:행번호`는 직전 절에 전수 기재했다.
6. **태그 입력 경로**
   - 수동 판매전표 화면에서 사용자가 선택하고, 생성 또는 DRAFT/SAVED 헤더 수정 시 저장된다. 주소 기반 자동 선택은 없다.
   - 견적 발행, 주문 발행·병합, 견적 변환, 모바일 발행은 null로 생성한다. 복제는 원본 값을 승계하고 개발 시더는 STACK을 직접 넣는다.

## 조사 한계

- 이 보고서는 현재 워크트리 소스와 기존 실행 중 로컬 DB/컨테이너의 읽기 결과를 기준으로 한다. 운영 DB인지 여부는 확인할 근거가 없어 운영 배송량으로 일반화하지 않았다.
- 코드·DB는 수정하지 않았고, 빌드·테스트·Docker 재기동/재빌드·git 명령은 실행하지 않았다.
