# #1035 재수렴 적대적 검증 보고서 (PR #1048)

## 확인 0 — 범위·선행 근거 고정

- 검증 범위는 조회 경로(B-01)와 실패 정책(B-02)의 도달성이다. 코드 수정, Git 쓰기, Docker 재빌드·재기동, 실 DB 쓰기를 하지 않는다.
- 직전 라운드의 BLOCK은 legacy 창고코드 exact 조회 4/4 실패와 모든 조회 실패를 동일한 기동 예외로 축약한 데 있었다.
- 수정 보고서는 UUID endpoint 전환, `FOUND / NOT_FOUND / UNAVAILABLE` 분리, 실제 Spring context 테스트 2건, 전체 1,545건 성공을 주장한다.
- 이번 라운드는 위 주장을 새 diff와 새 실행 결과로 독립 재검증하며, 보고서에는 창고 식별자 원문을 기록하지 않고 창고코드만 사용한다.

## 확인 1 — 재수렴 대상과 작업트리 상태

실행:

```text
git branch --show-current
git status --short
git log --oneline -5
git diff --stat main...HEAD
git diff --name-status main...HEAD
```

출력 원문:

```text
fix/1035-warehouse-uuid-boot
?? docs/dev-reports/2026-08-02-1035-reconvergence.md
c49e5cd86 [FIX] #1035 legacy 코드로 조회해 404 나던 것·일시 장애를 미실재로 오인하던 것
e2ac56a8a docs(review): #1035 1차 적대검증 — BLOCK 2건
12 files changed, 1181 insertions(+), 13 deletions(-)
```

- 현재 브랜치와 재수렴 fix 커밋을 확인했다.
- 작업트리 변경은 사용자 지시에 따라 생성한 본 보고서 하나뿐이다. Git 쓰기와 코드 수정은 수행하지 않았다.
- 재수렴 핵심 production 변경 파일은 `WarehouseInternalClient.java`와 `WarehouseCodeMapper.java`, 핵심 신규 검증은 Spring context 테스트 2개다.

## 확인 2 — 새 조회 경로와 실패 분류의 실제 코드

- mapper는 legacy 창고코드가 아니라 설정된 식별자를 파싱해 `GET /internal/inventory/warehouses/{warehouseId}`를 호출한다. B-01의 `/by-code(legacyCode)` 호출은 기동 검증 경로에서 제거됐다.
- client 분류 기준은 **HTTP 404를 던진 `RestClientResponseException`만 `NOT_FOUND`**, 그 밖의 HTTP 상태·연결 예외·token 누락·빈 body·파싱 실패는 `UNAVAILABLE`, 정상 body는 `FOUND`다.
- 따라서 inventory endpoint가 직접 반환한 404가 `UNAVAILABLE`로 오분류되는 경로는 없다. 반대로 라우팅/프록시 오류가 404로 표현되면 실제 미실재와 구분하지 못해 `NOT_FOUND`가 된다.
- mapper는 `UNAVAILABLE`이면 경고 한 줄만 남기고 계속 기동하며, `NOT_FOUND`·placeholder는 기동을 차단한다.

## 결함 B-03 — 서로 다른 정상 창고를 가리킨 오매핑을 기동 검증이 통과시킴

① 실 사용자 경로 재현 여부: **정적 production 경로와 기존 단위 테스트 구조에서 도달 확인.** 설정 식별자로 조회한 응답의 식별자가 요청값과 같은지만 검사하며, legacy 창고코드와 응답 창고코드의 관계는 검사하지 않는다.

② 재현 근거 원문:

```text
WarehouseLookup lookup = warehouseInternalClient.findWarehouseById(configuredId);
...
if (!configuredId.equals(lookup.summary().warehouseId())) {
    throw invalidStartupMapping(...);
}
```

신규 정상 테스트도 응답 코드를 고정 문자열 `inventory-code`로 반환하고 context 기동 성공만 확인한다. 즉 `00003/2/14/1` 어느 key에도 임의의 서로 다른 활성 창고 식별자를 배치하면 UUID endpoint는 그 창고 자체를 `FOUND`로 돌려주고 위 자기동일성 검사를 통과한다.

③ 영향 범위:

- 네 환경변수끼리 값이 뒤바뀌거나 다른 활성 창고 식별자가 오주입돼도 slip-service는 정상 기동한다.
- 이후 `resolve(legacyCode)`는 잘못 연결된 창고를 그대로 반환하므로 전표 발행의 목적 창고가 다른 정상 창고로 바뀐다.
- UUID endpoint는 “그 식별자의 창고가 존재한다”만 보장하며 “legacy 창고코드가 의도한 창고와 동일하다”는 보장하지 않는다.

## 결함 B-04 — `UNAVAILABLE` 통과 후 영구 미검증

① 실 사용자 경로 재현 여부: **production 제어 흐름에서 재현됨.** 기동 시 `UNAVAILABLE`이면 `continue`하고 이후 재검증 호출이 없다.

② 재현 명령·출력 원문:

```text
rg -n "WarehouseLookup|findWarehouseById|warehouse-validation|HealthIndicator|ApplicationReadyEvent|Scheduled" services/slip-service
```

핵심 출력:

```text
WarehouseCodeMapper.java:93: ... findWarehouseById(configuredId)
WarehouseCodeMapper.java:95: log.warn("창고 매핑 기동 검증을 보류합니다 ...")
```

- `findWarehouseById`의 production 호출자는 `@PostConstruct` 기동 검증 한 곳뿐이다.
- 이 매핑을 다시 검사하는 retry, scheduler, `ApplicationReadyEvent`, `HealthIndicator` 구현은 검색 결과 0건이다.
- 관측 수단은 기동 순간의 WARN 로그 한 줄뿐이며 health 상태·metric·지속 경보로 승격되지 않는다.

③ 영향 범위:

- 잘못된 형식의 placeholder는 원격 호출 전에 차단되지만, **형식만 유효한 잘못된 식별자**는 창고 서비스가 죽은 동안 `UNAVAILABLE`로 통과한다.
- 프로세스가 살아 있는 동안 창고 서비스가 회복해도 해당 매핑은 영원히 미검증이다.
- 이후 해당 legacy 창고코드가 사용되면 `resolve()`가 오주입 값을 그대로 반환하므로 원래 목적 E의 오주입 차단은 장애 시점 기동에 대해 무력화된다.

## 확인 3 — 실 DB 4개와 UUID endpoint 읽기 전용 재현

실행 방식: 실행 중 slip-service의 대상 환경변수 4개를 메모리에서만 읽고, `inventory_db.warehouses`를 `SELECT`한 결과와 대조했다. 같은 값으로 현재 inventory-service의 UUID endpoint를 호출하되 출력에는 창고코드·상태만 남겼다.

출력 원문:

```text
environment_variables_found=4 mappings_configured=4 active_db_warehouses_found=4
legacyCode=00003 dbCode=HQ-001 dbExists=True uuidEndpointStatus=200 returnedCode=HQ-001
legacyCode=2 dbCode=VH-001 dbExists=True uuidEndpointStatus=200 returnedCode=VH-001
legacyCode=14 dbCode=CS-001 dbExists=True uuidEndpointStatus=200 returnedCode=CS-001
legacyCode=1 dbCode=VR-001 dbExists=True uuidEndpointStatus=200 returnedCode=VR-001
```

- 요구 수치 환경변수 4개·매핑 4개·실 DB 활성 창고 4개를 재현했다.
- 새 UUID endpoint는 현재 정상 운영 값 4개 모두 `200`으로 해당 inventory 창고코드를 반환한다. B-01의 legacy exact 조회 4/4 404는 해소됐다.
- 다만 공유 slip-service는 PR image로 재빌드·재기동하지 않았으므로 **실 DB 4개를 사용한 PR 프로세스 end-to-end 기동 도달성은 0**이다. 아래 Spring context 테스트는 별도 외부 client mock 경로로 평가한다.

## 확인 4 — 신규 Spring context 테스트 2건 재실행

실행:

```text
.\gradlew.bat :services:slip-service:test \
  --tests com.samhanair.logis.slip.it.WarehouseValidationApplicationContextIT \
  --tests com.samhanair.logis.slip.it.WarehouseValidationUnavailableApplicationContextIT \
  --no-daemon --rerun-tasks
```

출력 원문:

```text
> Task :services:slip-service:test
BUILD SUCCESSFUL in 1m 20s
18 actionable tasks: 18 executed
```

XML·기동 로그 원문:

```text
WarehouseValidationApplicationContextIT tests="1" skipped="0" failures="0" errors="0"
warehouse-code-map 로드: 4 entries
Started WarehouseValidationApplicationContextIT in 24.413 seconds

WarehouseValidationUnavailableApplicationContextIT tests="1" skipped="0" failures="0" errors="0"
창고 매핑 기동 검증을 보류합니다 ... (창고코드=00003/1/2/14)
Started WarehouseValidationUnavailableApplicationContextIT in 6.841 seconds
```

- 두 테스트는 실제 `@SpringBootTest` context와 `@PostConstruct`를 띄운다. 단순 `new WarehouseCodeMapper()` 테스트가 아니다.
- 그러나 두 테스트 모두 `@Primary WarehouseInternalClient`를 Mockito mock bean으로 교체한다. 정상 테스트는 모든 식별자를 `FOUND`로, 장애 테스트는 모두 `UNAVAILABLE`로 지어내므로 실제 inventory HTTP·실 DB는 지나지 않는다.
- 따라서 “Spring lifecycle 기동”은 진짜지만 “실 DB 4개를 사용한 기동”은 아니다.

## 확인 5 — 404·5xx·NOT_FOUND·UNAVAILABLE 단위 경로 재실행

실행:

```text
.\gradlew.bat :services:slip-service:test \
  --tests com.samhanair.logis.slip.client.WarehouseInternalClientTest \
  --tests com.samhanair.logis.slip.publish.WarehouseCodeMapperStartupValidationTest \
  --no-daemon --rerun-tasks
```

출력 원문:

```text
BUILD SUCCESSFUL in 45s
18 actionable tasks: 18 executed
WarehouseInternalClientTest tests="7" skipped="0" failures="0" errors="0"
WarehouseCodeMapperStartupValidationTest tests="5" skipped="0" failures="0" errors="0"
```

실행된 핵심 case:

```text
findWarehouseById_404는_명백한_미실재로_구분한다
findWarehouseById_5xx는_일시적인_조회_불가로_구분한다
창고_서비스_일시_장애는_기동을_막지_않는다
UUID가_명백히_미실재하면_기동을_막는다
```

- 404 → `NOT_FOUND` → 기동 차단과 5xx → `UNAVAILABLE` → 기동 허용은 각각 재현됐다.
- 잘못된 식별자를 넣고 창고 서비스가 5xx/연결 실패 상태이면 식별자의 옳고 그름을 관찰할 수 없으므로 `UNAVAILABLE`로 기동 허용된다. B-04의 구멍이 실제 정책이다.

## 결함 B-05 — 느린 창고 서비스가 기동 스레드를 무기한 또는 외부 제한까지 대기시킴

① 실 사용자 경로 재현 여부: **동기 blocking 경로는 확정, 실제 지연 시간 실행은 도달성 0.** 공유 서비스에 지연을 주입하지 않았다.

② 재현 명령·출력 원문:

```text
Get-Content services/slip-service/src/main/java/com/samhanair/logis/slip/client/RestClientConfig.java
rg -n "ClientHttpRequestFactory|connect-timeout|read-timeout" services/slip-service/src/main/java services/slip-service/src/main/resources
```

출력 원문:

```text
@LoadBalanced
public RestClient.Builder loadBalancedRestClientBuilder() {
    return RestClient.builder();
}
```

- mapper의 `@PostConstruct`가 네 조회를 순차·동기 실행하고 warehouse client 전용 connect/read timeout을 설정하지 않는다.
- 완전 중단이 즉시 연결 예외로 끝나면 `UNAVAILABLE`로 기동한다. 5xx도 두 단위 경로의 합성으로 기동 허용이 재현됐다.
- 반면 TCP 연결 또는 HTTP 응답이 느리게 매달리면 예외가 생기기 전까지 `UNAVAILABLE` 판정 자체에 도달하지 못한다. 기동은 응답/transport 기본 timeout까지 멈추며 애플리케이션 내부 상한은 없다.

③ 영향 범위:

- 창고 서비스가 “죽어서 즉시 거절”하는 경우보다 “연결은 받지만 응답하지 않는” 경우가 더 위험하다.
- startup probe나 배포 제한시간보다 오래 대기하면 일시 장애 허용 정책과 무관하게 slip-service 기동 도달성이 없다.

## 확인 6 — 역방향 B-01 가드와 테스트 데이터 조작 여부

실행:

```text
git show e2ac56a8a:.../WarehouseCodeMapper.java
rg -n -g 'WarehouseValidation*IT.java' 'findWarehouseByCode|findWarehouseById|@Primary|mock(...)' ...
rg -n -i 'V999|create table warehouses|insert into warehouses' services/slip-service/src/test
```

출력 원문:

```text
context_test_mock_primary_hits=4
new_context_findByCode_stubs=0
new_context_findById_stubs=2
.findWarehouseByCode(warehouseCode)
.orElseThrow(() -> invalidStartupMapping(...))
V999_hits=0
create_warehouses_hits=0
insert_warehouses_hits=0
```

- 신규 context 테스트는 UUID 조회만 stub하고 legacy code 조회는 stub하지 않는다. 직전 구현으로 mapper만 되돌리면 Mockito의 미stub Optional이 empty가 되어 `orElseThrow`에서 context 생성이 실패하는 구조다.
- 다만 코드 수정 금지 때문에 실제 revert/mutation 실행은 하지 않았다. **역방향 실행 도달성은 0이며 정적 회귀 가드만 확인**했다.
- #1018의 `V999 warehouses`처럼 slip-service 테스트 DB에 창고 테이블을 만들거나 row를 insert해 통과시키는 source는 0건이다.
- 반면 정상 context 테스트가 외부 응답 자체를 mock으로 지어내는 것은 사실이며, 그 mock은 코드 관계를 검사하지 않아 B-03을 숨긴다.

## 확인 7 — 전체 suite 1차 시도는 실행 제한으로 도달성 0

실행:

```text
.\gradlew.bat :services:slip-service:test --no-daemon --rerun-tasks
```

출력 원문:

```text
Exit code: 124
command timed out after 124033 milliseconds
```

- 1차 시도는 테스트 판정 전에 실행 도구의 120초 제한으로 종료돼 숫자 재현 근거로 사용하지 않는다.
- 더 긴 실행 제한으로 같은 명령을 다시 수행한다.

## 확인 8 — 전체 suite 2차 시도는 공유 결과 파일 잠금으로 도달성 0

동일 명령을 900초 제한으로 다시 실행했다.

출력 원문:

```text
> Task :services:slip-service:test FAILED
java.io.IOException: Unable to delete directory '...build\test-results\test\binary'
Failed to delete some children ... output.bin
BUILD FAILED in 44s
```

- 1차 실행의 shell 제한 종료 뒤 Gradle test worker가 계속 살아 결과 파일을 보유하고 있었다. 동시에 같은 공유 build 경로를 쓰는 추가 Gradle test worker도 관측됐다.
- 이는 테스트 assertion 결과가 아니므로 1,545 수치 재현 근거로 사용하지 않는다.
- 실행 중 프로세스를 강제 종료하지 않고 자연 종료를 기다린다.

## 확인 9 — 전체 suite 단독 재실행 결과: 1,545건이나 실패 16건

파일 잠금 worker가 0개가 된 뒤 동일 명령을 단독 재실행했다.

출력 원문:

```text
DispatchCollabIT > ... FAILED
Caused by: org.postgresql.util.PSQLException
update or delete on table "dispatch_task" violates foreign key constraint
"dispatch_vehicle_group_dispatch_task_id_fkey"

1545 tests completed, 16 failed
BUILD FAILED in 8m 57s
```

생성 XML 집계:

```text
xml_files=209 tests=1545 failures=16 errors=0 skipped=0
DispatchCollabIT tests="16" skipped="0" failures="16" errors="0"
```

- 요구 숫자 중 총 1,545건·오류 0·skip 0은 재현됐지만 **실패 0은 재현되지 않았다**.
- 실패 16건은 모두 `DispatchCollabIT`의 `@BeforeEach` 정리에서, 다른 테이블이 참조 중인 배차 task 삭제가 FK로 거부돼 사용자 요청 테스트 본문에 도달하기 전에 발생했다.
- 이번 #1035 창고 조회 변경의 테스트에서 난 실패는 아니지만, 요청된 전체 suite green의 현재 도달성은 0이다.

## 각도 1·2 최종 도달성 요약

- **실 DB 정상 4개:** DB 실재 4/4와 UUID endpoint 200 4/4는 재현됐다. 공유 PR image 기동은 금지사항 때문에 실행하지 않아 end-to-end 도달성 0이다.
- **창고 서비스 완전 중단:** 연결 예외가 반환되면 `UNAVAILABLE`로 기동 허용된다. 실제 서비스 중단 조작은 하지 않아 end-to-end 도달성 0이다.
- **창고 서비스 5xx:** 실제 client 단위 테스트에서 `UNAVAILABLE`, 실제 Spring context 테스트에서 `UNAVAILABLE` 기동 허용이 각각 재현됐다.
- **창고 서비스 지연:** 동기 `@PostConstruct`가 응답/transport timeout까지 막힌다. 명시적 client timeout이 없어 제한시간 내 기동 보장이 없다.
- **잘못된 식별자 + 서비스 장애:** `UNAVAILABLE`로 통과하며 재시도·health·metric이 없어 영구 미검증이다.
- **404 분류:** inventory endpoint의 HTTP 404는 `NOT_FOUND`로 분류돼 차단된다. 다만 라우팅 계층의 404와 실제 row 미실재를 구분하지는 않는다.

## 최종 판정 — BLOCK

- B-01의 legacy exact 조회 4/4 404는 새 UUID endpoint에서 4/4 200으로 해소됐다.
- 그러나 **B-03**에서 서로 다른 정상 창고끼리 뒤바뀐 매핑이 `FOUND`로 통과하고, **B-04**에서 장애 중 형식상 유효한 오주입이 `UNAVAILABLE`로 통과한 뒤 영구 미검증이며, **B-05**에서 느린 응답은 기동 스레드를 제한 없이 붙든다.
- 원래 목적 E인 “오주입은 잡힌다”는 정상 서비스의 명백한 미실재와 placeholder에만 유지되며, 정상 창고 간 오매핑과 장애 중 오주입에는 유지되지 않는다.
- 전체 suite는 이번 fresh 실행에서 `1,545 tests / failures 16 / errors 0 / skipped 0`이므로 실패 0 주장도 재현되지 않았다.

## 이 라운드가 보지 않은 축

- PR image를 공유 Docker에 재빌드·재기동하지 않아 실제 PR container + 실 DB의 end-to-end boot는 실행하지 않았다.
- 공유 inventory-service를 의도적으로 중단·지연·5xx화하지 않았다. 완전 중단과 지연의 실제 시간 측정은 도달성 0이다.
- 코드 수정 금지로 fix revert/mutation 테스트를 실제 실행하지 않았다. B-01 역방향은 정적 가드만 확인했다.
- 실 DB 쓰기 금지로 잘못된 매핑 row를 만들거나 기존 row를 변경하지 않았다.
- GitHub CI job, AWS/운영 orchestrator의 startup probe·restart policy·경보 전달은 실행하지 않았다.
- 전표 발행 이후 downstream inventory 반영까지의 업무 결과는 실행하지 않았다. 이번 라운드는 기동·조회 도달성만 봤다.
