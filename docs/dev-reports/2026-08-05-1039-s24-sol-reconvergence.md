# 2026-08-05 · #1039 S24 2차 적대검증 재수렴 보고서 (SOL)

- 대상: PR #1045 · 이슈 #1039 가배차
- 작업 디렉토리: `C:\dev\Samhan-Public\.claude\worktrees\t1039`
- 검증 기준: 사용자 제시 HEAD `c047e2f8f` (git 명령 금지로 독립 조회하지 않음)

## 1. 단 하나의 답

**실 사용자 경로로 재현 가능한 결함은 0건이다. 머지를 권고한다.**

S22의 `부산 해운대구 해운대해변로 300`은 fix 전 `대구광역시`, S23 코드에서는
`부산광역시`로 판정된다. 집 PC 공유 DB의 활성 OUTBOUND 2,317행 전체를 같은 실 규칙
20개로 fix 전후 비교한 결과, 변경은 이 1건뿐이었다.

```text
fix 전후 결과 변경                 1건
  대구광역시 -> 부산광역시         1건
분류 -> 미분류                     0건
미분류 -> 분류                     0건
```

S23 때문에 기존에 분류되던 실 활성 주소가 미분류로 떨어진 건수는 0이다.

## 2. S22 결함 폐쇄와 fix 전후 직접 계수

### 2-1. 사용한 실 DB 규칙

`arologis_db.region_dispatch_classifications`의 활성 규칙은 20개였다. 실제 서비스가
사용하는 순서와 같은 `sort_order, group_name` 순서로 읽었다.

```sql
SELECT count(*) AS active_rules
FROM region_dispatch_classifications
WHERE deleted_at IS NULL;

SELECT group_name, keywords, sort_order
FROM region_dispatch_classifications
WHERE deleted_at IS NULL
ORDER BY sort_order, group_name;
```

```text
active_rules = 20
sort_order = 1..20
```

주소는 가배차 실제 조회와 동일하게 활성 OUTBOUND를 대상으로 했다.
`JpaPreClassifySlipQuery`는 `is_deleted=false`, `slip_type=OUTBOUND`, 호출 기간을 적용한다.
전체 기간에서 2,317행이며 비공백 주소는 2건이었다.

```sql
SELECT
  count(*) FILTER (
    WHERE NOT is_deleted AND slip_type='OUTBOUND'
  ) AS active_outbound,
  count(*) FILTER (
    WHERE NOT is_deleted AND slip_type='OUTBOUND'
      AND delivery_address IS NOT NULL
      AND btrim(delivery_address)<>''
  ) AS active_outbound_nonblank
FROM slips;

SELECT slip_no, slip_type, status, is_deleted, deleted_at, delivery_address
FROM slips
WHERE delivery_address IS NOT NULL
  AND btrim(delivery_address) <> ''
ORDER BY slip_no;
```

```text
active_outbound          = 2317
active_outbound_nonblank = 2

활성  2026/08/05-7  OUTBOUND DRAFT  부산 해운대구 해운대해변로 300
활성  2026/08/05-8  OUTBOUND DRAFT  서울 중구 을지로 100
삭제  2026/06/03-1  OUTBOUND DRAFT  CODEX QA SALES delivery
삭제  2026/06/03-1  INBOUND  DRAFT  CODEX QA PURCHASES delivery
```

DB에서 위 두 조회를 탭 구분으로 읽고, `PreClassifyService.classifyRegion`의 세 단계
(시·도 우선 -> keywords fallback -> 시·도 fallback)를 그대로 복제했다. fix 전은 두
시·도 검사에 `contains`, fix 후는 `startsWith`를 적용했다. 입력 규칙은 두 경우 모두
실 API 순서인 `sort_order, group_name`이었다.

```text
2026/08/05-7  부산 해운대구 해운대해변로 300
  fix 전  대구광역시
  fix 후  부산광역시

2026/08/05-8  서울 중구 을지로 100
  fix 전  서울특별시
  fix 후  서울특별시
```

빈 주소 2,315건은 양쪽 모두 미분류다. 삭제행까지 포함한 전체 2,473행에서도 결과 변경은
동일한 부산 표본 1건뿐이었다.

## 3. `startsWith` 새 표면

### 3-1. 실 주소 선두 형태

분류 코드와 동일하게 ASCII 공백만 제거한 뒤 비공백 주소의 선두를 셌다.

```sql
WITH a AS (
  SELECT NOT is_deleted AS active,
         replace(delivery_address, ' ', '') AS compact
  FROM slips
  WHERE delivery_address IS NOT NULL
    AND btrim(delivery_address) <> ''
), c AS (
  SELECT active,
         CASE
           WHEN left(compact,2) = ANY (ARRAY[
             '서울','부산','대구','인천','광주','대전','울산','세종','경기',
             '강원','충북','충남','전북','전남','경북','경남','제주'
           ]) THEN 'SIDO_LEADING'
           WHEN left(compact,1) BETWEEN '0' AND '9' THEN 'NUMBER_LEADING'
           WHEN upper(left(compact,1)) BETWEEN 'A' AND 'Z' THEN 'LATIN_LEADING'
           WHEN left(compact,1) IN ('(', '[', '（') THEN 'BRACKET_LEADING'
           ELSE 'OTHER_LEADING'
         END AS leading_type
  FROM a
)
SELECT active, leading_type, count(*) AS n
FROM c
GROUP BY active, leading_type
ORDER BY active DESC, leading_type;
```

```text
활성  SIDO_LEADING   2
삭제  LATIN_LEADING  2
활성  NUMBER/LATIN/BRACKET/OTHER_LEADING  각각 0
```

따라서 집 PC 실 사용자 데이터에는 우편번호·건물명·영문·괄호가 시·도보다 먼저 오는 활성
주소가 없다. `경기도` 대신 `경기`처럼 축약된 표기도 `cityPrefix("경기도") = "경기"`와
같은 선두이므로 `startsWith`에서 배제되지 않는다. 현재 활성 표본에는 경기 주소 자체가 0건이다.

반대급부 자체는 존재한다. 실 규칙 20개에 `12345 부산광역시`, `CODEX 부산광역시`,
`(현장) 부산광역시`처럼 시·도명만 있고 구·군 keyword가 없는 선행 문자열을 넣으면 fix 전
부산, fix 후 미분류다. 그러나 실 활성 DB에서 이 형태는 0건이고 삭제된 영문 QA 주소 2건도
원래부터 양쪽 모두 미분류이므로, 이번 라운드의 실 사용자 도달 결함으로 판정하지 않는다.

### 3-2. keywords fallback

`PreClassifyService.java`의 시·도 선두 루프 뒤 전체 keyword 루프는 유지돼 있다. 실 활성
주소에는 fallback만으로 잡히는 표본이 0건이므로, 실 DB 규칙을 그대로 사용한 좁은 재현과
단위 테스트로 보완했다.

```text
경기 광주시 초월읍
  fix 전  광주광역시
  fix 후  경기동부 (keywords fallback)
```

`PreClassifyServiceTest.classify_preservesKeywordFallbackWhenSidoPrefixIsUnavailable`를 포함한
대상 테스트는 실패 0이었다.

### 3-3. 정렬과 동률

실 DB의 활성 규칙에는 같은 `sort_order`가 하나도 없다.

```sql
SELECT sort_order, count(*) AS n,
       string_agg(group_name, ' | ' ORDER BY group_name) AS groups
FROM region_dispatch_classifications
WHERE deleted_at IS NULL
GROUP BY sort_order
HAVING count(*) > 1
ORDER BY sort_order;
```

```text
0 rows
```

또한 실제 지원 API인 `findAllByOrderBySortOrderAscGroupNameAsc()`가 이미
`sortOrder + groupName`으로 반환한다. S23 comparator도 같은 순서이므로 동률이 생기더라도
실 API 입력과 결과 순서를 바꾸지 않는다.

## 4. 앞선 PASS 축 회귀

S23 수정 파일은 `PreClassifyService`와 그 테스트뿐이다. 그래도 기존 사용자 축을 좁혀서
다시 실행했다.

```powershell
.\gradlew.bat :services:slip-service:test `
  --tests 'com.samhanair.logis.slip.service.preclassify.PreClassifyServiceTest' `
  --tests 'com.samhanair.logis.slip.it.dispatchgroup.DispatchGroupLifecycleIT' `
  :services:arologis-service:test `
  --tests 'com.samhanair.logis.arologis.security.ArologisPageCodesTest' `
  --console=plain
```

```text
BUILD SUCCESSFUL in 30s
PreClassifyServiceTest       9 tests, failures 0, errors 0
DispatchGroupLifecycleIT    4 tests, failures 0, errors 0
ArologisPageCodesTest       6 tests, failures 0, errors 0
```

- 8모드 분리: `classify_returnsEightModeResults_fromSamhanService`의 8개 모드 단언 통과.
- 운송사 409 차단: `sent_carrier_cannot_be_changed_through_hr_master` 포함 lifecycle 4개 통과.
- 아로로지스 권한 page-code: `ArologisPageCodesTest` 6개 통과.

`dev_dispatch`의 배차 조회 허용과 HR 운송사 변경 차단 조합도 별도로 재실행했다.

```powershell
.\gradlew.bat :services:slip-service:test `
  --tests 'com.samhanair.logis.slip.it.dispatchgroup.CarrierPermissionAxisIT' `
  --console=plain
```

```text
BUILD SUCCESSFUL in 27s
CarrierPermissionAxisIT 6 tests, failures 0, errors 0
```

아로로지스 desktop의 비허용 page-code 차단도 좁혀 확인했다.

```powershell
cd clients/arologis-desktop
npm test -- --run src/renderer/components/PermissionGuard.test.tsx
```

```text
Test Files 1 passed (1)
Tests      2 passed (2)
```

## 5. 증거 무결성 정정

S23 보고서는 “최종 대상 테스트는 10개”라고 적었지만 fresh JUnit XML 원문은 다음과 같다.

```text
<testsuite name="com.samhanair.logis.slip.service.preclassify.PreClassifyServiceTest"
           tests="9" skipped="0" failures="0" errors="0" ...>
```

실제 테스트 메서드도 9개다. S23의 “10개”는 **9개**로 정정해야 한다. 테스트 실패나 사용자
결함은 아니지만, 허용된 예외인 증거 무결성 불일치이므로 숨기지 않는다.

## 6. 안 본 범위와 제한 준수

- Docker 재빌드·재배포·공유 컨테이너 중지, 마이그레이션 적용을 하지 않았다.
- 공유 DB에는 SELECT만 실행했고 INSERT/UPDATE/DELETE를 하지 않았다.
- git 명령을 실행하지 않았다. 따라서 사용자 제시 HEAD를 독립 확인하지 않았다.
- 전체 Gradle/Playwright/CI 게이트, Electron GUI 클릭, 배차 전송·DB 쓰기 경로는 보지 않았다.
- S23과 직접 무관한 회계·품목·재고·문자·외부 인성데이타 경로는 보지 않았다.
- 우편번호·건물명·영문·괄호 선행 주소의 활성 실 표본은 DB에 0건이므로 라이브 행 재현은
  하지 못했고, 실 규칙을 사용한 읽기 전용 계산으로 반대급부만 확인했다.

## 7. 신규 파일

- `docs/dev-reports/2026-08-05-1039-s24-sol-reconvergence.md`

## 8. 최종 판정

**도달 결함 0건. S22 오분류는 닫혔고, 실 데이터에서 분류 -> 미분류 하락은 0건이다.
S23 테스트 수를 10개가 아닌 9개로 정정하는 조건으로 머지를 권고한다.**
