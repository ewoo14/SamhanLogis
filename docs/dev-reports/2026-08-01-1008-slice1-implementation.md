# 일마감 거래처별 전역DC 반영 구현 보고서

## 1. 원인과 설계

- `MonthEndCloseService`의 `byModel` 키가 거래처를 포함하지 않아 거래처별 전역DC를 전달할 경계가 없었다.
- `dc-config-service`의 `GET /internal/partner-dc-configs/{partnerCode}` 계약을 accounting-service 전용 client로 조회한다.
- 재검증 기대율은 고정DC → 거래처 전역DC → 기본 할인율 45% 순으로 선택한다. 전역DC 조회를 요청했는데 결과가 없으면 45%로 조용히 대체하지 않고 판정 불가 상태로 표시한다.
- 할인율 산식과 0%p 완전일치는 그대로 둔다.

## 2. RED — 거래처 전역DC 48% 재현

추가한 테스트: `DiscountRevalidatorTest.multiGlobalDiscountRateFortyEightPercentIsUsedWhenFixedRateIsAbsent`

실행 명령:

```text
./gradlew :services:accounting-service:test --tests '*DiscountRevalidatorTest.multiGlobalDiscountRateFortyEightPercentIsUsedWhenFixedRateIsAbsent' --no-daemon
```

RED 원문:

```text
> Task :services:accounting-service:compileTestJava FAILED
C:\dev\Samhan-Public\.claude\worktrees\t1008\services\accounting-service\src\test\java\com\samhanair\logis\accounting\service\DiscountRevalidatorTest.java:204: error: method revalidate in class DiscountRevalidator cannot be applied to given types;
        DiscountRevalidator.Revalidation result = revalidator.revalidate(
                                                             ^
  required: String,String,BigDecimal,BigDecimal,BigDecimal,BigDecimal,Status
  found:    String,String,BigDecimal,BigDecimal,BigDecimal,<null>,BigDecimal,Status
  reason: actual and formal argument lists differ in length
1 error

FAILURE: Build failed with an exception.
> Task :services:accounting-service:compileTestJava FAILED
BUILD FAILED in 29s
```

## 3. 구현 및 GREEN

- `PartnerDcConfigClient`를 accounting-service에 추가했다. `GET /internal/partner-dc-configs/{partnerCode}`의 조회 성공/404를 구분한다.
- `DiscountRevalidator`에 전역DC 입력을 추가했다. 고정DC가 있으면 고정DC를 선택하고, 없으면 홈/상업 멀티의 전역DC를 선택하며, 전역DC 미조회는 `MISSING_GLOBAL_DISCOUNT`로 노출한다.
- `MonthEndCloseService`의 집계 key에 거래처코드를 포함하고, 세금계산서·매출전표·매입전표 라인에서 거래처별로 분리해 전역DC를 전달한다.
- 기존 단위 테스트 fixture에는 45% 전역DC를 명시해 기존 정상 판정 계약을 유지했다.

핵심 GREEN 실행 원문:

```text
./gradlew :services:accounting-service:test --tests '*DiscountRevalidatorTest' --tests '*DailyClosingDetailServiceTest' --no-daemon

BUILD SUCCESSFUL in 20s
21 actionable tasks: 2 executed, 19 up-to-date
```

accounting-service 일반 테스트 전체 실행 원문(`*IT` 제외):

```text
./gradlew :services:accounting-service:test --tests '*Test' --no-daemon

> Task :services:accounting-service:test
BUILD SUCCESSFUL in 32s
21 actionable tasks: 1 executed, 20 up-to-date
```

전체 기본 test task도 시도했으나, Testcontainers `AbstractPostgresIT`의 static PostgreSQL 시작이 공유 Docker 조건과 충돌해 184초에서 timeout됐다. 재빌드·재기동은 하지 않았다.

```text
./gradlew :services:accounting-service:test --no-daemon
command timed out after 184036 milliseconds
```

## 4. 실 데이터 기준 D 측정

공유 PostgreSQL에 JDBC 읽기 전용 연결로 조회했다. 쓰기 쿼리와 Docker 재기동은 수행하지 않았다.

조회 결과:

- `accounting_db`: 활성 `ISSUED` 세금계산서 12건, 라인 13건.
- 13라인 중 멀티 판정에 필요한 `model_name`/`category_key`가 채워진 라인은 0건이다.
- 거래처코드가 있는 라인은 1건이나, 품목명 `삼성 윈드프리 9평형`에 대응하는 활성 product가 없어 멀티 판정 경로에 도달하지 않는다.
- `dc_config_db`: 활성 `dc_configs` 210건. 홈멀티는 0.45/104, 0.46/19, 0.47/28, 0.48/8, null/51; 상업멀티는 0.43/1, 0.45/13, 0.46/33, 0.47/61, 0.48/17, 0.49/3, null/82이다.

| 실 일마감 대상 | 변경 전 45% 상수 | 변경 후 거래처 전역DC | 판정 변화 |
|---|---:|---:|---:|
| 현재 활성 ISSUED 13라인 중 멀티 판정 도달 | 0 | 0 | 일치→불일치 0건, 불일치→일치 0건 |

현재 회계 DB의 13라인은 운임/일반 품목이거나 모델·카테고리 정보가 없어 G-A 비교 대상이 0건이다. 따라서 위 0건은 정상 판정을 막지 않았다는 실측값이지, `dc_configs`의 48% 거래처 25건(홈 8 + 상업 17)이 모두 일마감에 등장한다는 의미가 아니다. PM이 제공한 Notion 304건 분포의 비-45% 67건은 잠재 오판 규모로 별도 보존한다.

## 5. 최종 검증

stale 주석에서 45% 상수 폴백으로 표현된 부분을 전역DC 조회·미조회 상태 보존으로 정정했다. 정정 후 일반 테스트 전체를 재실행했다.

```text
./gradlew :services:accounting-service:test --tests '*Test' --no-daemon

> Task :services:accounting-service:test UP-TO-DATE
BUILD SUCCESSFUL in 12s
21 actionable tasks: 21 up-to-date
```

최종 fresh 재검증(`--rerun-tasks`) 원문:

```text
./gradlew :services:accounting-service:test --tests '*Test' --no-daemon --rerun-tasks
> Task :services:accounting-service:test
BUILD SUCCESSFUL in 1m
21 actionable tasks: 21 executed
```
