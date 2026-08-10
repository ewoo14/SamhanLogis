# HeaderAuthenticationFilterTest flaky 원인 조사

## 결론

원인 메커니즘은 확정했다. product-service의 두 standalone `MockMvc` 테스트가 `InternalTokenFilter`를 직접 필터 체인에 추가하고 유효한 내부 토큰 요청을 실행한다. 이 필터는 현재 스레드의 `SecurityContextHolder`에 `ROLE_INTERNAL` 인증을 기록하지만 두 테스트에는 종료 cleanup이 없다. 같은 Gradle test worker 스레드에서 이후 실행된 `HeaderAuthenticationFilterTest`는 시작 시 context를 비우지 않고, 제품 필터도 기존 authentication이 있으면 헤더 인증을 설치하지 않는다. 따라서 대상 assertion이 요청 헤더의 두 `GROUP_*`가 아니라 선행 테스트가 남긴 `ROLE_INTERNAL`을 읽는다.

오염원 클래스는 다음 둘이다.

- `services/product-service/src/test/java/com/samhanair/logis/product/web/ProductInternalControllerTest.java`
- `services/product-service/src/test/java/com/samhanair/logis/product/web/ProductInternalLookupByModelTest.java`

과거 실패 실행은 test-start 순서 로그를 남기지 않았으므로 두 클래스 중 **그 실행에서 마지막으로 context를 쓴 정확한 한 클래스/메서드**는 사후 복구하지 못했다. 그러나 실패 실제값의 유일한 no-clear 생성 경로, 대상이 그 값을 보존하는 분기, 같은 JVM 최소 재현은 모두 일치한다. 즉 원인 메커니즘과 오염원 집합은 확정했으며 역사적 실행의 단일 메서드만 미확정이다.

## (1) 재현률

### 전체 스위트 자연 실행

실행 원문(각 회 동일):

```powershell
.\gradlew.bat :services:product-service:test --rerun-tasks --no-daemon
```

각 실행에서 PowerShell의 `$LASTEXITCODE`를 Gradle 종료 직후 저장했고, 대상 XML의 `failures`/`errors`도 다음 실행 전에 읽었다. 파이프 뒤 종료코드를 사용하지 않았다.

| 실행 | Gradle 종료코드 | 대상 실패 |
|---:|---:|---:|
| 1 | 0 | 0/1 |
| 2 | 0 | 0/1 |
| 3 | 0 | 0/1 |
| 4 | 0 | 0/1 |
| 5 | 0 | 0/1 |

자연 재현률은 **5회 중 0회 실패(0%)**다. 따라서 자연 상태 flaky는 **이 환경에서 관측 불가**다. 5회 모두 `15 actionable tasks: 15 executed`, 약 2분 29초~2분 31초였으므로 `UP-TO-DATE` 결과가 아니다.

### 대상 클래스 단독 반복

실행 원문(5회 반복):

```powershell
.\gradlew.bat :services:product-service:test `
  --tests 'com.samhanair.logis.product.config.HeaderAuthenticationFilterTest' `
  --rerun-tasks --no-daemon
```

단독 재현률은 **5회 중 0회 실패(0%)**다. 5회 모두 종료코드 0, 대상 XML `failures=0`, `errors=0`, `15 actionable tasks: 15 executed`였다.

### 실행 순서 변형

Gradle `Test`에는 클래스의 앞뒤를 직접 지정하는 CLI 옵션이 없다. 다음 두 클래스를 함께 필터하고 JUnit random class order seed 1~5를 적용했다.

```powershell
$env:JAVA_TOOL_OPTIONS='-Djunit.jupiter.testclass.order.default=org.junit.jupiter.api.ClassOrderer$Random -Djunit.jupiter.execution.order.random.seed=<1..5>'
.\gradlew.bat :services:product-service:test `
  --tests 'com.samhanair.logis.product.web.ProductInternalControllerTest.lookup_withValidToken_returns200AndDelegatesToService' `
  --tests 'com.samhanair.logis.product.config.HeaderAuthenticationFilterTest' `
  --rerun-tasks --no-daemon --info
```

Gradle의 두-class 필터 실행은 5개 seed 모두 `HeaderAuthenticationFilterTest → ProductInternalControllerTest` 순서를 유지했다. 대상 실패는 **5회 중 0회**다. 필터 인자 순서도 실행 순서를 바꾸지 않았다.

전체 클래스 집합 random order seed 1도 실행했다.

```powershell
$env:JAVA_TOOL_OPTIONS='-Djunit.jupiter.testclass.order.default=org.junit.jupiter.api.ClassOrderer$Random -Djunit.jupiter.execution.order.random.seed=1'
.\gradlew.bat :services:product-service:test --rerun-tasks --no-daemon --info
```

대상은 **1회 중 0회 실패**였다. 전체는 `693 tests completed, 3 failed`였지만 세 실패는 `ProductLookupControllerIT`의 순서 의존 DB fixture 실패였고 대상 XML은 `failures=0 errors=0`이었다. 대상 flaky 재현으로 세지 않는다.

### 기존 관측 실패

현재 브랜치의 `docs/dev-reports/2026-08-09-978-r2-sol-reconv.md:185-219`가 보존한 이전 실행은 전체 1회 중 1회 실패다.

```text
692 tests completed, 1 failed
HeaderAuthenticationFilterTest.java:35

Expecting actual:
  ["ROLE_INTERNAL"]
to contain exactly:
  ["GROUP_11111111-1111-1111-1111-111111111111",
   "GROUP_22222222-2222-2222-2222-222222222222"]
```

## (2) 공유 자원 후보

| 후보 | 코드 확인 | 대상이 실제로 건드리는가 | 판정 |
|---|---|---|---|
| static 필드·싱글턴 | `HeaderAuthenticationFilter.java:26-27`의 static은 불변 헤더명 상수뿐이다. `HeaderAuthenticationFilterTest.java`에는 상태 static이 없다. | static mutable state는 건드리지 않는다. | 배제 |
| `SecurityContextHolder` | 대상은 `HeaderAuthenticationFilterTest.java:31`에서 읽고 `:14-17`의 `@AfterEach`에서만 clear한다. 제품 필터는 `HeaderAuthenticationFilter.java:35-47`에서 기존 authentication이 null일 때만 새 인증을 쓴다. | **예. 핵심 공유 자원이다. 시작 전 clear는 없다.** | 확정 |
| `MockMvc` / ApplicationContext 캐시 | 대상은 `HeaderAuthenticationFilterTest.java:21-29`에서 servlet mock 3개와 필터를 직접 생성한다. `@SpringBootTest`, `@WebMvcTest`, `MockMvc`, `@DirtiesContext`가 없다. | 아니오. 대상에는 Spring ApplicationContext 자체가 없다. | 배제 |
| 시스템 프로퍼티·환경변수 | 대상 및 `HeaderAuthenticationFilter.java:24-51`에 `System.setProperty`, `System.clearProperty`, 환경변수 조회가 없다. | 아니오. | 배제 |
| Mockito static mock / `MockedStatic` | 대상 파일에는 Mockito import·mock·`MockedStatic`이 없다. | 아니오. | 배제 |
| 시간·랜덤 | 대상과 제품 필터에는 clock, `now()`, random, UUID 생성이 없다. 입력 UUID도 문자열 상수다(`HeaderAuthenticationFilterTest.java:24-25`). | 아니오. | 배제 |
| 테스트 워커 스레드 재사용 | root `build.gradle:94-97`은 JUnit Platform과 encoding만 설정한다. product `build.gradle:80-82`에도 병렬 fork/`forkEvery` 지정이 없다. | Gradle 기본 단일 test worker가 클래스 사이에 스레드를 재사용할 수 있고 `MODE_THREADLOCAL` context가 남는다. | 원인 성립 조건 |

## (3) 오염원 지목과 재현 절차

### 오염원 1: ProductInternalControllerTest

- `ProductInternalControllerTest.java:59-64`: role을 `INTERNAL`로 구성한다.
- `ProductInternalControllerTest.java:66-71`: standalone `MockMvc`에 `new InternalTokenFilter(props)`를 직접 추가한다.
- 예를 들어 `ProductInternalControllerTest.java:153-168`은 유효 토큰으로 요청한다.
- 클래스에는 `@BeforeEach`만 있고(`:53-72`) `@AfterEach`/`SecurityContextHolder.clearContext()`가 없다.

### 오염원 2: ProductInternalLookupByModelTest

- `ProductInternalLookupByModelTest.java:64-69`: role을 `INTERNAL`로 구성한다.
- `ProductInternalLookupByModelTest.java:71-76`: 동일하게 standalone `MockMvc`에 내부 토큰 필터를 직접 추가한다.
- `ProductInternalLookupByModelTest.java:79-96`과 `:104-117`은 유효 토큰 요청이다.
- 이 클래스도 `@BeforeEach`만 있고(`:60-77`) cleanup이 없다.

두 클래스만 `new InternalTokenFilter`를 직접 생성한다(`rg -l "new InternalTokenFilter" services/product-service/src/test` 전수 결과 2파일). Spring Security의 전체 filter chain을 쓰는 통합 테스트와 달리 standalone `.addFilters(...)`는 요청 종료 시 SecurityContext를 지우는 Spring Security 필터를 자동으로 추가하지 않는다.

실제 쓰기 위치는 `shared/security/src/main/java/com/samhanair/logis/security/InternalTokenFilter.java:79-85`다.

```java
var authority = new SimpleGrantedAuthority("ROLE_" + role);
var auth = new UsernamePasswordAuthenticationToken(INTERNAL_PRINCIPAL, null, List.of(authority));
SecurityContextHolder.getContext().setAuthentication(auth);
```

대상 제품 필터는 기존 인증이 있으면 새 그룹 인증을 만들지 않는다(`HeaderAuthenticationFilter.java:35-47`).

### 같은 JVM 최소 재현

제품·테스트 소스 수정 없이 test runtime classpath에서 JShell로 다음 순서를 실행했다.

1. context clear
2. `role=INTERNAL`, 유효 토큰으로 실제 `InternalTokenFilter.doFilter(...)` 호출
3. 같은 JVM/스레드에서 실제 `HeaderAuthenticationFilterTest.ignoresUserRoleHeaderAndKeepsGroupAuthorities()`를 reflection으로 호출

관측 원문:

```text
AFTER_INTERNAL_FILTER=[ROLE_INTERNAL]
TARGET_CAUSE=java.lang.AssertionError
```

즉 선행 필터가 남긴 값, 과거 flaky의 실제값, 대상 assertion 실패를 같은 JVM에서 연결했다. sleep/wait는 사용하지 않았다.

### 직전 클래스 관측의 한계

과거 실패 실행은 `--info`/`testLogging started`를 남기지 않아 당시 직전 클래스는 복구할 수 없다. 이번 자연 green 실행 뒤 started 로깅을 추가한 실행에서는 대상 직전 클래스가 `ProductSheetSyncServiceIT`로 관측됐고 대상은 실패하지 않았다. 이 클래스는 위의 `InternalTokenFilter` 직접 생성 경로가 아니다.

started 로깅 실행 도중 작업트리에 외부의 미완성 변경이 들어와 전체가 134건 별도 실패했으므로 이 실행은 (1)의 재현률에서 제외했다. 조사자가 수정하거나 원복하지 않았다. ThreadLocal 오염은 반드시 바로 직전 클래스에서 생길 필요가 없고, 같은 스레드에서 이후 clear가 나오기 전까지 유지된다.

## (4) 실패 실제값의 출처

기대값 두 개는 요청의 `X-User-Groups` 문자열(`HeaderAuthenticationFilterTest.java:24-25`)을 제품 필터가 comma split/trim하고 `GROUP_` prefix를 붙인 값이다(`HeaderAuthenticationFilter.java:38-43`). assertion은 그 입력 순서까지 요구한다(`HeaderAuthenticationFilterTest.java:33-38`).

실제값 `ROLE_INTERNAL`은 카탈로그 fallback이나 `X-User-Role: MASTER`가 아니다. `ProductInternalControllerTest.java:63` 또는 `ProductInternalLookupByModelTest.java:68`의 `props.setRole("INTERNAL")`이 `InternalTokenFilter.java:83`의 `"ROLE_" + role`을 거쳐 만든 authority다. 이 인증이 이미 존재하므로 `HeaderAuthenticationFilter.java:35-36` 조건이 false가 되고, 대상 요청의 두 그룹은 아예 authentication으로 변환되지 않는다. assertion은 선행 context의 authority를 그대로 읽는다.

## (5) 결정적으로 고치는 방향 — 제안만

구현하지 않았다.

1. 원인 지점인 두 standalone `MockMvc` 테스트에 요청마다 또는 `@AfterEach`에서 `SecurityContextHolder.clearContext()`를 보장한다. 더 구조적인 선택은 Spring Security test 설정을 적용해 요청 종료 시 context를 지우는 정식 filter chain을 사용하게 하는 것이다.
2. 대상 테스트도 시작 시 context를 clear해 외부 순서와 무관한 독립 precondition을 만들 수 있다. 다만 이것만 하면 오염원 자체는 남으므로 두 polluter의 cleanup이 우선이다.
3. 회귀 검증은 `ProductInternalControllerTest`/`ProductInternalLookupByModelTest`의 유효 토큰 케이스 뒤 대상 테스트가 같은 worker에서 실행되는 순서 테스트와 전체 suite 반복으로 한다.

대기·sleep·retry 추가는 필요하지 않으며 제안하지 않는다.

## 조사 중 작업트리 간섭

첫 5회 전체 suite와 단독 반복이 끝난 뒤 다음 두 파일이 외부에서 수정된 상태가 관측됐다.

- `services/product-service/src/main/java/com/samhanair/logis/product/service/ProductSheetSyncService.java`
- `services/product-service/src/test/java/com/samhanair/logis/product/it/ProductSheetSyncServiceIT.java`

한 시점에는 `ExternalWriteTracker` 심볼 컴파일 오류가 났고 이후 외부 변경이 계속되어 컴파일 가능 상태로 바뀌었다. 본 조사에서는 두 파일을 수정·원복하지 않았으며, 그 이후 실패 실행은 재현률에서 제외했다.

## 신규 파일

- `docs/dev-reports/2026-08-09-header-auth-filter-flaky-rootcause.md`

제품 코드와 테스트는 수정하지 않았다. git commit/push, 실 DB 쓰기, Docker 재배포를 수행하지 않았다.
