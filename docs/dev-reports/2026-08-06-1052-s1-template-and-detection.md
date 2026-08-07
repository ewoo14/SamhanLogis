# #1052 S1 — 템플릿 값 정합화와 창고 매핑 탐지 설계

- 기준일: 2026-08-06
- 브랜치: fix/1052-warehouse-uuid-existence
- 기준 HEAD: a23a70115
- 범위: 템플릿 값 처리, eCount 권위 alias 조회, 비동기 탐지, RED-first 회귀 고정
- 제외: 실 AWS/Terraform apply, Docker 재빌드·재배포, inventory DB 쓰기, 전체 테스트 스위트, commit/push

## 결론

운영 템플릿에서 개발 시드 UUID를 제거하고, 운영은 환경이 STRICT임을 명시한 뒤 기동 후 staging.ecount_warehouse_map을 읽어 검증하도록 바꾸었다. 로컬·dev는 환경이 DEV_SUBSTITUTE를 명시할 때만 대체값을 사용한다.

창고 검증은 ApplicationReadyEvent 이후 비동기 작업으로 시작한다. 외부 조회 결과는 VERIFIED, MISMATCH, NOT_FOUND, UNAVAILABLE, INVALID_CONFIGURATION으로 구분하고, 결과를 actuator endpoint와 readiness 상태에 반영한다. 따라서 발견은 기동을 막지 않으면서도 이후 전표 발행 경로를 제한하고 readiness에서 관찰할 수 있다.

## ① 템플릿 값 처리와 불변식 1

infrastructure/terraform/templates/user_data.sh의 다음 동작을 변경했다.

- WAREHOUSE_UUID_HQ, WAREHOUSE_UUID_HUBAL, WAREHOUSE_UUID_ANSEONG, WAREHOUSE_UUID_CHANGWON 개발 시드 주입을 제거했다.
- 슬롯명이 아니라 eCount 코드임을 드러내는 WAREHOUSE_UUID_ECOUNT_00003, WAREHOUSE_UUID_ECOUNT_2, WAREHOUSE_UUID_ECOUNT_14, WAREHOUSE_UUID_ECOUNT_1 명명으로 통일했다.
- 운영 user-data에는 WAREHOUSE_MAPPING_MODE=STRICT만 명시한다.
- 운영 UUID는 user-data에서 추정하거나 기본값으로 제시하지 않는다. 별도 운영 secret/config가 공급하는 경우에만 선택적으로 주입한다.
- STRICT 검증 시 실제 권위 값은 inventory service의 staging alias 조회 결과이며, 템플릿에 들어 있는 값은 검증 전 선택적 계약값일 뿐 권위 원본이 아니다.
- .env.example, local/dev seed, local compose는 DEV_SUBSTITUTE를 명시적으로 선언하고 개발 전용 값을 사용한다.
- application.yml의 기본 mode는 빈 값이다. 환경이 mode를 선언하지 않으면 유효한 운영 모드로 추론하지 않고 INVALID_CONFIGURATION/readiness 거부로 처리한다.

따라서 이 PC의 UUID나 어떤 단일 환경의 UUID를 운영 템플릿에 복사하지 않았다. 운영 DB와 환경별로 다른 값을 템플릿이 알고 있는 것처럼 보이게 하지 않는 방식으로 불변식 1을 만족한다.

## ② 사실과 다른 주석 grep 전수와 정합화 결과

실행한 active source/config 검색은 다음과 같다.

~~~
rg -n -i "inventory_db\.warehouses.*(실재|실제)|실재.*inventory_db\.warehouses|실재 행|실재 UUID|실재 fallback" infrastructure services --glob '!**/build/**' --glob '*.yml' --glob '*.yaml' --glob '*.sh' --glob '*.java' --glob '*.kt' --glob '*.properties' --glob '*.md'
~~~

종료 코드: 0. 활성 설정·소스에서 위의 사실과 다른 단정은 더 이상 출력되지 않았다.

정합화한 핵심 주석은 다음과 같다.

- services/slip-service/src/main/resources/application.yml: 정적 map은 consumer 입력이고, staging.ecount_warehouse_map이 권위 alias 원본이라는 설명으로 교체했다. 운영 UUID를 템플릿이 안다는 표현을 제거했다.
- infrastructure/terraform/templates/user_data.sh: dev seed를 운영 기본값처럼 설명하던 주석과 assignment를 제거하고 환경별 운영 주입 및 비동기 STRICT 검증을 설명한다.
- infrastructure/.env.example, infrastructure/docker-compose.local-all.yml, infrastructure/docker-compose.prod.yml, infrastructure/env-templates/.env.dev-seed, infrastructure/env-templates/slip-service.env: 슬롯 이름과 권위 UUID라는 인상을 제거하고 mode 및 eCount 코드 기반 변수로 정합화했다.

검색 결과에 남은 docs/dev-reports/의 과거 문구는 당시 조사 결과를 보존하는 역사적 보고서·인용문이다. 실행 설정이나 소스 주석이 아니므로 증적을 바꾸지 않았다. 확인된 과거 보고서는 다음과 같다.

~~~
docs/dev-reports/2026-08-01-1018-implementation.md
docs/dev-reports/2026-08-01-1035-recon.md
docs/dev-reports/2026-08-02-1035-impl.md
docs/dev-reports/2026-08-02-1035-r3-postfix-reconvergence.md
docs/dev-reports/2026-08-02-1035-r4-readme-env-fix.md
docs/dev-reports/2026-08-04-1055-r3-sol-review.md
docs/dev-reports/2026-08-04-1055-zero-stock-warehouse-diagnosis.md
docs/dev-reports/2026-08-06-1052-d2-recon.md
~~~

## ③ 탐지 설계 — 불변식 4~9

| 불변식 | 구현 | 결과 |
|---|---|---|
| 4. 기동을 막지 않음 | ApplicationReadyEvent가 applicationTaskExecutor에 검증 작업만 enqueue한다. 생성자·PostConstruct·readiness 초기화에서 외부 조회를 하지 않는다. | 외부 inventory가 늦거나 죽어도 Spring 기동 thread가 대기하지 않는다. 검증 전 readiness는 거부 상태로 두되 process 기동 자체는 완료한다. |
| 5. 장애·늦은 기동·미실재 구분 | bulk 조회 예외/timeout/5xx/404는 UNAVAILABLE; 성공 응답에서 코드가 빠진 경우만 NOT_FOUND; 다음 scheduled retry에서 다시 조회한다. | 일시 장애를 미실재로 확정하지 않는다. inventory가 늦게 기동한 뒤 성공하면 다음 검증에서 회복한다. |
| 6. 식별자 뒤바뀜 탐지 | 권위 row의 eCount code와 반환 warehouse UUID를 함께 비교한다. configured UUID가 같은 코드의 권위 UUID와 다르면 MISMATCH; 단순 UUID 행 존재만으로 통과시키지 않는다. | 00003/2 등의 UUID가 서로 뒤바뀐 설정은 발행 경로에 진입하지 못한다. |
| 7. 외부 조회 timeout | WarehouseInternalClient의 connect timeout 2초/read timeout 3초를 bulk staging alias 호출에 적용한다. | 느린 inventory 호출이 기동 또는 scheduler 호출을 block하지 않고 UNAVAILABLE로 전환된다. |
| 8. 발견 시 변화 | 결과별 상태를 WarehouseMappingEndpoint에 노출하고, 전체 VERIFIED일 때만 ACCEPTING_TRAFFIC, 그 외에는 REFUSING_TRAFFIC readiness event를 발행한다. STRICT에서 검증 전/실패 시 mapper는 실제 발행을 거부한다. | 로그만 남기지 않는다. /actuator/health/readiness와 /actuator/warehouse-mapping에서 상태를 관찰하고, 잘못된 매핑은 전표 경로에서 차단한다. 기본 liveness/일반 health는 process 생존과 분리해 재시작 폭주를 피한다. |
| 9. placeholder 환경 | STRICT/DEV_SUBSTITUTE를 환경이 명시적으로 선언한다. DEV_SUBSTITUTE는 외부 조회 없이 정상 처리하며, 미선언/미지원 mode는 INVALID_CONFIGURATION이다. | 로컬·dev는 상시 오경보 없이 동작하고, 운영이 mode를 빠뜨리면 조용히 substitute로 추론하지 않고 readiness 거부로 드러난다. |

권위 조회 API는 inventory service에 추가한 GET /internal/inventory/warehouses/by-ecount-codes이다. repository SQL은 staging.ecount_warehouse_map을 warehouses의 활성 row와 join하는 read-only SELECT이며 inventory DB에 쓰지 않는다. 기존 /by-code는 다른 warehouse code namespace의 기존 소비 계약으로 남겨 두고 eCount alias 검증의 권위로 사용하지 않는다.

## ④ #1035 일곱 실패 대조표

| #1035 실패 | 이번 변경의 차단 지점 |
|---|---|
| 라운드 2: 정상 창고 4개가 있어도 legacy 코드 조회 4/4 404 | legacy 역조회 대신 staging.ecount_warehouse_map bulk alias API를 사용한다. eCount code와 권위 UUID를 한 번에 읽는다. |
| 라운드 2: 일시 장애·늦은 기동·미실재를 구분하지 않아 context 영구 종료 | 외부 예외는 UNAVAILABLE, 성공했지만 row가 없을 때만 NOT_FOUND; fixed-delay retry로 늦은 inventory 기동을 재검증한다. |
| 라운드 4: 식별자가 뒤바뀌어도 FOUND 통과 | code+UUID 쌍을 비교해 MISMATCH로 분류하고 mapper의 resolve를 거부한다. |
| 라운드 4: UNAVAILABLE 매핑이 영구 미검증 | UNAVAILABLE을 별도 상태로 보존하고 다음 주기 재조회하며 readiness를 refusing으로 유지한다. |
| 라운드 4: 느린 서비스가 timeout 없이 기동 스레드 블록 | connect/read timeout과 executor 비동기 dispatch를 적용했다. scheduler 호출도 작업을 enqueue하고 반환한다. |
| 라운드 6: legacy 역조회 4/4 404 재발 | 소비 endpoint의 권위 계약을 eCount staging alias bulk endpoint로 고정하고 legacy /by-code 경로를 검증 알고리즘에서 제거했다. |
| 라운드 6: 불일치를 ERROR 로그만 남겨 health/readiness 무변화 | 상태 endpoint 및 readiness availability event를 갱신하고, VERIFIED 전에는 publish resolve를 차단한다. |

## ⑤ RED-A / RED-B 원문과 GREEN 원문

### RED 원문

구현 전에 다음 검증을 먼저 작성하고 실행했다.

~~~
./gradlew :services:slip-service:test --tests "*WarehouseCodeMapper*" --tests "*WarehouseBootPathConfiguration*" --tests "*WarehouseMappingValidationService*" --console=plain --no-daemon
~~~

종료 코드: 1.

~~~
> Task :services:slip-service:compileTestJava FAILED
error: cannot find symbol
    private WarehouseMappingValidationService service;
error: cannot find symbol
    mapper.setMappingMode("STRICT");
error: cannot find symbol
    method findEcountWarehouseAliases(Set<String>)
error: cannot find symbol
    variable WarehouseMappingStatus
...
FAILURE: Build failed with an exception.
~~~

이 RED는 아직 존재하지 않는 탐지 service/status/API를 테스트가 요구하는 compile-level RED였다. 테스트가 고정한 행위는 다음과 같다.

- RED-A: 권위 alias가 올바르게 주입되면 4개 eCount code가 각 창고로 VERIFIED되고, 명시한 DEV_SUBSTITUTE 환경은 외부 조회 없이 정상 publish 경로를 유지한다.
- RED-B: swapped UUID는 조용히 통과하지 않고, 외부 timeout/실패는 기동을 막지 않으며 UNAVAILABLE로 남고, 성공 응답에서 빠진 alias만 NOT_FOUND가 된다.

### GREEN 원문

구현 후 동일 계열의 targeted 검증이 다음처럼 종료되었다.

~~~
./gradlew :services:slip-service:test --tests "*WarehouseInternalClient*" --tests "*WarehouseMappingValidationService*" --tests "*WarehouseCodeMapper*" --tests "*WarehouseBootPathConfiguration*" --console=plain --no-daemon --rerun-tasks
~~~

~~~
BUILD SUCCESSFUL
~~~

종료 코드: 0.

세부 RED-B 고정 테스트에는 MISMATCH, NOT_FOUND, UNAVAILABLE, DEV_SUBSTITUTE, STRICT blank-config authority discovery, malformed placeholder, slow external worker의 non-blocking dispatch가 포함된다. 회귀 수정 후 기존 unmapped warehouse code의 HTTP 400 계약도 복원하여 RED-A의 기존 publish 경로와 함께 유지했다.

## ⑥ 새로 가능해진 조합과 결과

| 환경 조합 | 밟은 결과 |
|---|---|
| STRICT + 4개 configured UUID가 staging alias와 모두 일치 | 비동기 검증 후 전부 VERIFIED, readiness ACCEPTING_TRAFFIC, publish 허용 |
| STRICT + configured UUID 공란 + staging alias 4개 존재 | staging UUID를 runtime 권위값으로 발견, 전부 VERIFIED, 이후 publish 허용 |
| STRICT + configured UUID가 서로 뒤바뀜 | 해당 code MISMATCH, readiness 거부, 해당 resolve/publish 차단 |
| STRICT + staging bulk 성공이나 특정 eCount code row 없음 | 해당 code NOT_FOUND, readiness 거부, 다음 주기 재조회 |
| STRICT + inventory timeout/connection failure/5xx/endpoint 404 | 전부 UNAVAILABLE, NOT_FOUND로 오판하지 않음, 기동 완료 후 retry |
| STRICT + nonblank malformed placeholder | INVALID_CONFIGURATION, substitute로 묵살하지 않음, readiness 거부 |
| DEV_SUBSTITUTE + 명시한 dev 값 | 외부 호출 0회, DEV_SUBSTITUTE, readiness 수용, 기존 publish 경로 동작 |
| mode 미선언 또는 미지원 값 | mode 추론 없음, INVALID_CONFIGURATION, readiness 거부 |
| inventory가 늦게 기동 | 최초 UNAVAILABLE 후 다음 scheduled bulk 조회에서 성공하면 VERIFIED/readiness 수용으로 회복 |

## ⑦ 실행 명령과 종료 코드

아래는 이번 작업에서 실제 실행한 좁은 검증의 원문과 결과다.

~~~
./gradlew :services:slip-service:test --tests "*WarehouseCode*" --tests "*Publish*" --console=plain --no-daemon
~~~

종료 코드: 0

~~~
BUILD SUCCESSFUL in 1m 37s
18 actionable tasks: 3 executed, 15 up-to-date
~~~

~~~
./gradlew :services:inventory-service:test --tests "*Warehouse*" --console=plain --no-daemon --rerun-tasks
~~~

종료 코드: 0

~~~
BUILD SUCCESSFUL in 1m 29s
18 actionable tasks: 3 executed, 15 up-to-date
~~~

추가 targeted 검증:

~~~
./gradlew :services:slip-service:test --tests "*WarehouseInternalClient*" --tests "*WarehouseMappingValidationService*" --tests "*WarehouseCodeMapper*" --tests "*WarehouseBootPathConfiguration*" --console=plain --no-daemon --rerun-tasks
~~~

종료 코드: 0, BUILD SUCCESSFUL.

~~~
git diff --check
~~~

종료 코드: 0.

실 AWS/Terraform apply, Docker 재빌드·재배포, inventory DB 쓰기, 전체 테스트 스위트, commit, push는 실행하지 않았다.

## 신규 파일 목록

- services/inventory-service/src/main/java/com/samhanair/logis/inventory/repository/EcountWarehouseAliasRepository.java
- services/inventory-service/src/main/java/com/samhanair/logis/inventory/web/dto/EcountWarehouseAliasResponse.java
- services/inventory-service/src/test/java/com/samhanair/logis/inventory/web/InternalWarehouseControllerTest.java
- services/slip-service/src/main/java/com/samhanair/logis/slip/publish/WarehouseMappingEndpoint.java
- services/slip-service/src/main/java/com/samhanair/logis/slip/publish/WarehouseMappingMode.java
- services/slip-service/src/main/java/com/samhanair/logis/slip/publish/WarehouseMappingStatus.java
- services/slip-service/src/main/java/com/samhanair/logis/slip/publish/WarehouseMappingValidationService.java
- services/slip-service/src/test/java/com/samhanair/logis/slip/publish/WarehouseMappingValidationServiceTest.java

