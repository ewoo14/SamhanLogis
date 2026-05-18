# SP-D5 BE Cycle 1 리뷰 — claude-be-cycle1

PR: `feat/sp-d5-permission-guard-unification-and-aop` (head: `ee793327`)
리뷰어: BE agent (Claude)
일자: 2026-05-19

---

## 1. 총평

`shared/security` 공통 AOP 인프라 설계 방향(AutoConfiguration + ObjectProvider lazy 주입 + Micrometer Counter)은 올바르고 코드 구조는 전반적으로 깔끔하다. 그러나 **P0 치명 결함 1건**이 존재한다. 각 service 의 `DynamicPermissionClientImpl` 이 `shared.security.permission.DynamicPermissionClient` (공통 인터페이스)가 아닌 서비스 로컬 `@Deprecated` 인터페이스를 `implements` 하고 있어, `PermissionAspect` 의 `ObjectProvider<shared.DynamicPermissionClient>.getIfAvailable()` 이 항상 `null` 을 반환한다. 결과적으로 `@RequirePermission` AOP 는 현재 모든 서비스에서 **무음 실패(silent no-op)** 상태다. 10개 report controller 에 붙인 `@RequirePermission` 어노테이션이 실제로 아무 검증도 수행하지 않는다.

P1 결함 2건(테스트 대리 로직 문제, IT 스텁 누락), P2 결함 2건(Javadoc 오류, 죽은 null 체크)도 함께 수정 필요.

---

## 2. 결함 목록

### P0 — `DynamicPermissionClient` 타입 불일치 (AOP 전면 무력화)

**위치**: 8개 서비스 모두
```
services/accounting-service/src/main/java/com/samhanair/logis/accounting/client/DynamicPermissionClientImpl.java:32
services/arologis-service/src/main/java/com/samhanair/logis/arologis/client/DynamicPermissionClientImpl.java:33
services/inventory-service/.../DynamicPermissionClientImpl.java:24
services/notification-service/.../DynamicPermissionClientImpl.java:33
services/partner-order-service/.../DynamicPermissionClientImpl.java:32
services/partner-service/.../DynamicPermissionClientImpl.java:22
services/product-service/.../DynamicPermissionClientImpl.java:22
services/slip-service/.../DynamicPermissionClientImpl.java:32
services/user-service/.../DynamicPermissionClientImpl.java:22
```

**현상**: 각 서비스의 `DynamicPermissionClientImpl` 선언부가 다음과 같다.

```java
// 예: accounting-service
public class DynamicPermissionClientImpl implements DynamicPermissionClient {
//                                                   ^^^^^^^^^^^^^^^^^^^^^^^^^^
//                 com.samhanair.logis.accounting.client.DynamicPermissionClient (LOCAL, @Deprecated)
```

`PermissionAspect` 는 `ObjectProvider<com.samhanair.logis.security.permission.DynamicPermissionClient>` 를 주입받는다. Spring 컨텍스트에는 `com.samhanair.logis.security.permission.DynamicPermissionClient` 타입 빈이 존재하지 않으므로 `getIfAvailable()` 이 `null` 을 반환한다.

```java
// PermissionAspect.java:95-99
DynamicPermissionClient client = clientProvider.getIfAvailable(); // <- 항상 null
if (client == null) {
    log.debug("[SP-D5] DynamicPermissionClient bean 없음 — 권한 검증 건너뜀 ...");
    return joinPoint.proceed(); // <- @RequirePermission 이 붙어 있어도 그냥 통과
}
```

**영향**: accounting-service 의 10개 report controller (`@RequirePermission(page="accounting.reports", action="VIEW")`), 그리고 SP-D6+ 에서 다른 서비스로 확장 예정인 모든 `@RequirePermission` 어노테이션이 실제로 권한 검증을 수행하지 않는다.

**권장 fix**: 8개 서비스의 `DynamicPermissionClientImpl` 선언을 공통 인터페이스로 교체한다.

```java
// 변경 전 (accounting-service 예시)
import com.samhanair.logis.accounting.client.DynamicPermissionClient;
public class DynamicPermissionClientImpl implements DynamicPermissionClient {

// 변경 후
import com.samhanair.logis.security.permission.DynamicPermissionClient;
public class DynamicPermissionClientImpl implements DynamicPermissionClient {
```

각 서비스의 `build.gradle` 에 `implementation project(':shared:security')` 가 이미 선언된 서비스(accounting, arologis 등)는 import 교체만으로 충분하다. 나머지 서비스는 의존성 추가도 필요하다. 로컬 `@Deprecated` 인터페이스 파일은 `implements` 가 모두 교체된 후 삭제할 수 있으며, 이는 SP-D6 에서 일괄 처리해도 무방하다. 단, 이번 PR 에서 `implements` 타입만은 반드시 교체해야 `@RequirePermission` 이 실제로 동작한다.

---

### P1-A — `PermissionAspectTest`: 실제 Aspect 코드 경로 미검증

**위치**: `shared/security/src/test/.../PermissionAspectTest.java`

**현상**: `PermissionAspectTestHelper` 는 `PermissionAspect` 의 내부 로직을 복사 재구현한 독립 클래스다. 테스트는 `aspect` 객체의 실제 `checkPermission()` 메서드를 호출하지 않고, 헬퍼 내부의 복사 로직을 검증한다.

```java
// PermissionAspectTestHelper.evaluateViewPermission — PermissionAspect.checkPermission 와 별개 구현
boolean evaluateViewPermission(DynamicPermissionClient client, String role, String page) {
    if (role == null || role.isBlank()) return false;
    return !client.canView(role, page);   // PermissionAspect 코드와 동치지만 별도 구현
}
```

`aspect` 필드는 오직 `evaluateAndThrowIfDenied` 에서 리플렉션으로 `metrics` 를 꺼내는 데만 사용된다. `PermissionAspect.checkPermission()` 에 실제 버그가 생겨도 현재 테스트는 통과한다.

**권장 fix**: `@SpringBootTest` + `@EnableAspectJAutoProxy` 컨텍스트에서 프록시된 컨트롤러나 서비스에 실제 AOP 를 적용한 상태로 `MockMvc` 또는 직접 메서드 호출로 검증한다. 또는 최소한 Spring AOP 를 사용하는 `PermissionAspect` 통합 슬라이스 테스트를 추가한다. `PermissionAspectTestHelper` 방식은 Javadoc 명세 검증용으로 유지하되, AOP 실제 동작을 검증하는 별도 테스트가 필요하다.

---

### P1-B — `SliceBValidationIT` / `SliceCValidationIT`: `canView=true` lenient 스텁 누락

**위치**:
```
services/accounting-service/src/test/.../SliceBValidationIT.java:70
services/accounting-service/src/test/.../SliceCValidationIT.java:70
```

**현상**: 두 IT 모두 `@MockBean DynamicPermissionClient dynamicPermissionClient` 를 선언하나, `@BeforeEach` 가 없고 `canView` 스텁이 없다. Mockito 기본값 `boolean` 은 `false` 이므로, P0 타입 불일치가 수정되어 AOP 가 실제로 동작하기 시작하면 `canView=false` → 403 → 기존 200 기대 테스트 전면 실패가 발생한다.

**권장 fix**: 두 IT 에 `@BeforeEach` 를 추가하고 `lenient` 스텁을 설정한다.

```java
@BeforeEach
void setupStubs() {
    lenient().when(dynamicPermissionClient.canView(anyString(), anyString())).thenReturn(true);
    lenient().when(dynamicPermissionClient.canEdit(anyString(), anyString())).thenReturn(true);
}
```

`AccountingDynamicPermissionIT` 에는 이미 올바르게 구현되어 있으며, 동일 패턴을 적용하면 된다.

---

### P2-A — `RequirePermission.action()` Javadoc 오류

**위치**: `shared/security/src/main/java/.../RequirePermission.java:63`

```java
/**
 * 미지원 값 입력 시 {@link PermissionAspect} 가 {@code EDIT} 으로 fallback.
 */
```

**현상**: 실제 `PermissionAspect` 동작은 미지원 action 값 입력 시 `EDIT` 으로 fallback 하지 않는다. `PermissionAspect.java:130-133` 에서 `log.warn` 후 **건너뜀(skip)** 처리한다.

**권장 fix**: Javadoc 을 `"미지원 값 입력 시 {@link PermissionAspect} 가 권한 검증을 건너뜀 (log.warn 발생)"` 으로 수정.

---

### P2-B — `PermissionAspect:91` 죽은 null 체크

**위치**: `shared/security/src/main/java/.../PermissionAspect.java:91`

```java
String action = annotation.action() == null || annotation.action().isBlank()
                ? "VIEW" : annotation.action().toUpperCase();
```

**현상**: Java 어노테이션 element 메서드는 `null` 을 반환할 수 없다. `@RequirePermission` 의 `action()` 은 `default "VIEW"` 가 선언되어 있으므로 항상 비어있지 않은 문자열을 반환한다. `annotation.action() == null` 체크는 도달 불가 코드다.

**권장 fix**: 죽은 null 체크 제거. `isBlank()` 체크는 `action=""` 방어를 위해 유지 가능.

```java
String action = annotation.action().isBlank() ? "VIEW" : annotation.action().toUpperCase();
```

---

### 참고 — `@Component` + AutoConfig `@Bean` 이중 선언 (위험도 낮음)

**위치**: `PermissionAspect.java:51`, `PermissionGuardMetrics.java:27`

두 클래스 모두 `@Component` 어노테이션과 함께 `PermissionSecurityAutoConfiguration` `@Bean` 으로도 등록된다. 소비자 서비스의 `@SpringBootApplication` 은 `com.samhanair.logis.<service>.*` 만 스캔하므로 현재 환경에서는 이중 등록이 발생하지 않는다. `@ConditionalOnMissingBean` 이 추가 보호막으로 작동한다.

그러나 공유 라이브러리 클래스에 `@Component` 를 붙이는 것은 스프링 공식 권장 패턴이 아니다(공유 라이브러리는 AutoConfig `@Bean` 으로만 등록). 미래에 소비자 서비스가 `scanBasePackages = "com.samhanair.logis"` 로 확장되면 잠재적 충돌이 생길 수 있다. SP-D6 에서 `@Component` 제거를 권장한다. 이번 PR 에서 즉시 수정 필요 수준은 아니다.

---

## 3. 긍정 사항

- `PermissionSecurityAutoConfiguration`: `@AutoConfiguration`, `@ConditionalOnClass`, `@ConditionalOnMissingBean`, `AutoConfiguration.imports` 등록 — Spring Boot 3 표준 완전 준수.
- `PermissionGuardMetrics`: Counter.builder 매 호출 lazy-register 패턴이 `MeterRegistry` 내부 캐시 기반으로 race-free 하게 동작함 — 올바른 Micrometer 사용.
- `PermissionAspect` deny → metrics.increment → throw 순서: 예외 throw 전에 Counter 를 증가시킴 — 올바른 순서.
- 10개 report controller: `reportPermissionGuard.checkView()` 직접 호출 및 `private final ReportPermissionGuard reportPermissionGuard` 필드가 모두 제거됨 — SP-D2 → SP-D5 전환 완료.
- `@Deprecated(since = "SP-D5", forRemoval = false)` 처리 및 Javadoc 통합 인터페이스 안내 — 8개 서비스 모두 일관.
- `@RequirePermission` 어노테이션: `page()` 필수, `action()` default "VIEW" — 사용 측 실수 방지 설계 적절.
- `ReportPermissionGuard.PAGE_CODE` 상수 재사용 (`"accounting.reports"`) — page 코드 일관성 보장.
- `PermissionGuardMetricsTest` 5케이스: SimpleMeterRegistry 기반 Counter 검증 — 올바른 단위 테스트.

---

## 4. 최종 판정

**FIX** (P0 + P1 존재)

P0 `DynamicPermissionClientImpl` 타입 불일치를 수정하지 않으면 `@RequirePermission` 기능 전체가 무음 실패 상태이므로 머지 불가. P1-B IT 스텁 누락은 P0 수정 시 즉시 연동 실패를 유발하므로 함께 수정 필요.

수정 후 재리뷰 요청 바람.
