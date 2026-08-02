# 2026-08-01 설정값 실재성 검증 구현 보고서

## 1. RED — placeholder 매핑 기동 검증 회귀 테스트

추가 테스트: `services/slip-service/src/test/java/com/samhanair/logis/slip/publish/WarehouseCodeMapperValidationTest.java`

실행 명령:

```text
.\gradlew.bat :services:slip-service:test --tests 'com.samhanair.logis.slip.publish.WarehouseCodeMapperValidationTest'
```

출력 원문:

```text
> Task :services:slip-service:test FAILED

WarehouseCodeMapperValidationTest > 실재하지_않는_매핑은_기동검증에서_실패한다() FAILED
    java.lang.AssertionError at WarehouseCodeMapperValidationTest.java:24
18 actionable tasks: 12 executed, 6 from cache
1 test completed, 1 failed

FAILURE: Build failed with an exception.
> There were failing tests.
BUILD FAILED in 23s
```

판정: 현재 `WarehouseCodeMapper`에는 설정 UUID의 DB 실재성 검증이 없어, placeholder 상태를 기동 실패로 막지 못하는 RED를 확인했다.

## 2. GREEN — 기동 검증 및 환경 공급 구현

- `WarehouseCodeMapper`의 `@PostConstruct`에서 `inventory_db.public.warehouses`의 활성 UUID와 설정 매핑을 대조한다.
- UUID 형식 오류 또는 실재하지 않는 UUID가 하나라도 있으면 `IllegalStateException`으로 기동을 중단한다.
- 조회만 수행하며 기존 `slips.source_warehouse_id` 값은 수정하거나 검증하지 않는다.
- 로컬 compose, 운영 compose, CI, env template에 `inventory_db`와 정찰에서 조회한 네 창고 UUID를 공급했다.
- Testcontainers IT는 테스트 DB에 동일한 창고 마스터를 준비하고 검증용 JDBC URL을 동적으로 주입한다.
- 요청된 7개 IT의 placeholder 및 `MERGE-WH` 가상 UUID를 실재 UUID로 교체했다.

GREEN 검증 명령:

```text
.\gradlew.bat :services:slip-service:test --tests 'com.samhanair.logis.slip.publish.WarehouseCodeMapperValidationTest'
```

출력 원문:

```text
> Task :services:slip-service:test
BUILD SUCCESSFUL in 16s
18 actionable tasks: 4 executed, 14 up-to-date

## 3. 대상 7개 IT 최초 실행 결과 및 보완

실행한 대상: `SlipPublishControllerIT`, `SlipPublishWarehouseIdIT`, `SlipPublishPartnerStrictOffIT`,
`SlipPublishPartnerStrictIT`, `SlipPublishMergeIT`, `Phase26cSlipImmutableIT`,
`InternalSlipPublishControllerIT`.

출력 원문 요약:

```text
> Task :services:slip-service:test FAILED
48 tests completed, 48 failed
Caused by: org.postgresql.util.PSQLException: ERROR: relation "slips" does not exist
Migration V2__add_slip_signature_and_inspecting.sql failed
BUILD FAILED
```

원인: Testcontainers 초기화 시 테스트용 `warehouses` 테이블을 먼저 만들면서
`baseline-on-migrate=true`가 빈 DB가 아니라고 판단해 V1을 baseline 처리했고, 이후 V2가
`slips`를 찾지 못했다.

추가 보완: Testcontainers에서 `inventory_db` 별도 DB를 만들던 초기 방식은 환경별 DB 초기화
순서가 불안정했다. 테스트 전용 Flyway migration `src/test/resources/db/migration/V999__test_warehouse_master.sql`로
창고 마스터를 테스트 DB에 준비하고, 검증 JDBC URL은 같은 테스트 DB를 가리키도록 단순화했다.

대상 7개 IT 재실행 결과:

```text
> Task :services:slip-service:test
BUILD SUCCESSFUL in 1m 2s
18 actionable tasks: 2 executed, 16 up-to-date
```

Testcontainers가 실제로 실행되었고, 대상 테스트 48건이 통과했다. 테스트 DB에만 Flyway가
테이블/fixture를 기록했으며 운영 DB에는 쓰지 않았다.

## 4. slip-service 전체 테스트

실행 명령:

```text
.\gradlew.bat :services:slip-service:test
```

출력 원문:

```text
> Task :services:slip-service:test
BUILD SUCCESSFUL in 4m 22s
18 actionable tasks: 1 executed, 17 up-to-date
```

생성된 JUnit 결과 파일 206개를 합산한 결과:

```text
reports=206 tests=1531 failures=0 errors=0 skipped=0
```

Testcontainers 통합테스트도 실행되었으며 skip은 0건이다.

## 5. 기존 placeholder 전표 조회 보존 확인

실 DB에는 쓰지 않고 다음 읽기 전용 조회만 실행했다.

```text
docker exec samhan-postgres psql -U samhan -d slip_db -P pager=off -F '|' -Atc "select count(*) filter (where source_warehouse_id in (...placeholder UUID 4개...)) as placeholder_rows, count(*) as total_rows from public.slips;"
```

출력 원문:

```text
5|2455
```

placeholder 전표 5건은 그대로 존재하며, 이번 변경은 전표 조회/저장 데이터나 Flyway 적용
마이그레이션을 수정하지 않았다. 따라서 기동 시 신규 설정 검증과 기존 placeholder 전표 조회를
분리해 불변식 C를 보존했다.

## 6. 환경 설정 최종 점검

실 UUID 공급 위치를 로컬 compose, 운영 compose, CI job env, 로컬 env template,
Terraform production `.env.production` 생성 스크립트, infrastructure env example에 반영했다.
설정 기본값도 placeholder가 아닌 `inventory_db.warehouses` 정찰 실측값으로 교체했다.

검증 명령 및 원문:

```text
docker compose -f infrastructure/docker-compose.yml -f infrastructure/docker-compose.local-all.yml config --quiet
Exit code: 0

bash -n infrastructure/terraform/templates/user_data.sh
Exit code: 0
```

Docker compose 재빌드/재기동은 수행하지 않았다.
