# DevOps 리뷰 — confirm 경로 복구 (DC price-calc 정식 연동 + FE res.ok)
- **PR**: #330
- **브랜치**: fix/confirm-recovery-dc-price-calc
- **리뷰어**: Claude DevOps agent
- **날짜**: 2026-05-31
- **사이클**: 1

---

## 결론 (서두)

전체적으로 가용성 설계와 CI 커버리지가 양호하다. P0 결함 0건. P1 1건(fail-soft 경계 코드 누락), P2 2건(resilience4j 적용 범위 + order-app CI 경로). 머지 블로커 없음.

---

## 1. 서비스 의존/배포 안전성

### 1-1. fail-soft 구현 확인 (가용성 핵심)

`DcConfigClient.calculatePrices` 의 실제 구현을 확인하였다.

```java
// DcConfigClient.java:86
.onStatus(HttpStatusCode::isError, (req, res) -> { /* fail-soft — no throw */ })
```

`onStatus(isError, noThrow)` 로 4xx/5xx 를 모두 삼킨다. 그 뒤 `extractFinalPrices(null or empty envelope)` 는 `Map.of()` 를 반환한다. catch 블록도 `RuntimeException` 전체를 잡아 `Map.of()` 반환한다. `BusinessException` 만 재던진다(token 미설정 시).

`PartnerOrderConfirmService.confirm` 에서:

```java
// PartnerOrderConfirmService.java:162
BigDecimal priceVat = finalPrices.getOrDefault(String.valueOf(i), p.sellingPrice());
```

`finalPrices` 가 빈 Map 이면 `getOrDefault` 가 `sellingPrice`(listPrice) 를 반환한다. dc-config 다운 시에도 confirm 은 listPrice 로 정상 진행된다. 가용성 요건 충족.

### 1-2. rolling 배포 안전성

`ConfirmResponse` 외부 계약(`orderNo`, `status`, `slipNo`, `slipPublishStatus`)은 이번 슬라이스에서 변경 없다. `DcConfigClient` 는 신규 추가 컴포넌트(기존 `fetchDcConfig` 교체)이며 partner-order-service 내부에서만 사용된다. dc-config-service 는 이미 `POST /internal/price-calculations` 를 운영 중(`InternalDcConfigController.java:104`)이므로 partner-order-service 만 먼저 배포해도 dc-config 응답이 없는 구간은 fail-soft 로 흡수된다. rolling 배포 안전.

### 1-3. Eureka/lb 경로

`DcConfigClient` 생성자:

```java
// DcConfigClient.java:39-42
public DcConfigClient(@Qualifier("loadBalancedRestClientBuilder") RestClient.Builder builder, ...)
    this.restClient = builder.baseUrl(DC_CONFIG_SERVICE_BASE).build();
// DC_CONFIG_SERVICE_BASE = "http://dc-config-service"
```

`loadBalancedRestClientBuilder` 는 `RestClientConfig.java` 에서 `@LoadBalanced @Bean` 으로 선언되어 있다. `http://dc-config-service` → Spring Cloud LoadBalancer → Eureka registry 조회 → 실제 인스턴스 IP:PORT 로 라우팅된다. 기존 다른 클라이언트(Product/Inventory/Slip)와 동일 패턴이다.

`application.yml` 에 fallback 외부 URL도 정의되어 있다:

```yaml
external:
  dc-config-service: ${SAMHAN_DC_CONFIG_SERVICE_URL:http://${DC_CONFIG_HOST:dc-config-service}:8089}
```

단, `DcConfigClient` 는 `external.dc-config-service` 를 사용하지 않고 하드코딩된 `http://dc-config-service` 에 baseUrl 을 고정한다. Eureka 활성 환경(운영/CI Docker)에서는 문제없지만, Eureka 비활성 환경에서 `http://dc-config-service` 가 resolve 되지 않는다. 이 경우 `RuntimeException` catch → fail-soft 로 흡수되므로 동작은 깨지지 않는다.

---

## 2. 회로차단기/타임아웃

### 2-1. resilience4j 설정 존재 확인

`application.yml` 에 `dcConfigClient` 인스턴스가 명시되어 있다:

```yaml
resilience4j:
  circuitbreaker:
    instances:
      dcConfigClient:
        slidingWindowSize: 10
        failureRateThreshold: 70
        waitDurationInOpenState: 20s
  timelimiter:
    instances:
      dcConfigClient:
        timeoutDuration: 3s
```

### 2-2. 적용 여부 (P1 finding)

`resilience4j.circuitbreaker/timelimiter` 설정은 존재하지만 `DcConfigClient.calculatePrices` 는 `RestClient` 를 직접 호출하는 일반 메서드다. Spring Cloud Circuit Breaker + Resilience4j 의 자동 AOP 적용은 `@CircuitBreaker` annotation 또는 OpenFeign circuitbreaker 사용 시에만 동작한다. `RestClient` 직접 호출 + Qualifier 패턴에서는 `@CircuitBreaker(name="dcConfigClient")` annotation 이 없으면 CircuitBreaker 가 실제로 감싸지지 않는다.

현재 `DcConfigClient.calculatePrices` 에 `@CircuitBreaker` annotation 이 없다. 기존 다른 클라이언트(SlipServiceClient 등)도 같은 패턴이면 동일 상황일 가능성이 있으나, 슬라이스 스펙 상 fail-soft 가 1차 보호막이므로 CircuitBreaker 미동작은 **latency spike 보호 부재** 위험이다. dc-config 가 hung(연결은 되지만 응답 지연) 상태이면 timelimiter 가 작동하지 않아 confirm 1콜당 3s 이상 block 될 수 있다. `RestClient.Builder` 에 connection-timeout/read-timeout 이 설정되어 있지 않은 경우가 해당된다.

타임아웃이 누락되면 dc-config 응답 지연 시 confirm thread 가 block 되어 partner-order-service 전체 처리량에 영향을 준다.

**Finding P1-1**: `DcConfigClient.calculatePrices` 에 `RestClient` 레벨 타임아웃(connectTimeout/readTimeout) 또는 `@CircuitBreaker(name="dcConfigClient")` 중 하나가 필요하다. 현재 resilience4j 설정은 존재하나 실제 적용이 되지 않을 가능성이 있다.

---

## 3. CI matrix

### 3-1. accounting+partner 그룹 포함 확인

`ci.yml` matrix:

```yaml
- name: accounting+partner
  timeout: 30
  test-tasks: ':services:accounting-service:test :services:partner-service:test :services:partner-auth-service:test :services:partner-order-service:test :services:dc-config-service:test'
```

`partner-order-service:test` 가 포함되어 있다. `PartnerOrderConfirmServiceIT` 는 `partner-order-service` 의 `src/test/java/.../it/` 하위에 위치하므로 이 group 에서 실행된다.

### 3-2. IT 실행 조건 (Testcontainers skip 가드)

`AbstractPostgresIT.DockerAvailableCondition`:

```java
if (DockerClientFactory.instance().isDockerAvailable() && POSTGRES.isRunning()) {
    return enabled("Docker is available + container running");
}
return disabled("Docker daemon not reachable - skipping Testcontainers IT");
```

CI runner(`ubuntu-latest`)는 Docker daemon 을 제공하므로 `DockerClientFactory.isDockerAvailable()` 이 true 를 반환한다. CI workflow 에도 Docker 가용성을 확인하는 step 이 있다:

```yaml
- name: Docker 가용성 확인 (Testcontainers 용)
  run: |
    docker version
    docker ps
```

따라서 CI 에서 `PartnerOrderConfirmServiceIT` 전체 7종 테스트는 **skip 없이 실행**된다. `DcConfigClient` 는 `@MockBean` 으로 격리되어 있으며 신규 2종(`confirm_applies_dc_final_price_from_price_calc`, `confirm_failsoft_uses_list_price_when_price_calc_empty`)도 포함되어 있다.

### 3-3. order-app CI 경로 (P2 finding)

`deploy-order-app.yml` 은 `push.branches: [main]` + `paths: clients/web/order-app/**` 트리거다. PR CI(`ci.yml`) 에는 FE 별도 job 이 있다:

```yaml
frontend-ds: ...
frontend-desktop: ...
frontend-mobile-staff: ...
```

그러나 `frontend-order-app` job 이 `ci.yml` 에 존재하지 않는다. `clients/web/order-app/src/samhanApi.ts` 변경에 대해 PR CI 의 typecheck/lint 가 실행되지 않는다. `deploy-order-app.yml` 은 main 머지 후에만 typecheck + build 를 수행하므로, PR 단계에서 order-app TypeScript 타입 오류가 있어도 CI 가 통과된다.

이번 슬라이스의 `samhanApi.ts` 변경(`.then((r) => r.data)` → 객체 정규화)은 단순한 타입이므로 실질적 위험은 낮지만, 구조적으로 PR gate 가 없다.

**Finding P2-1**: `ci.yml` 에 `clients/web/order-app` typecheck/lint job 이 없다. order-app FE 변경은 main 머지 후 deploy workflow 에서만 타입 검사된다. PR CI gate 추가를 권고한다.

---

## 4. Flyway 변경 없음 확인

`services/partner-order-service/src/main/resources/db/migration/` 에 V8 까지 존재한다. 이번 PR 에 V9 이상 SQL 파일이 추가되지 않았다. 스펙 §7 "Flyway 불필요(스키마 변경 없음)"와 일치한다. 확인 완료.

---

## 5. internal-token 설정 확인

### 5-1. properties 경로

`DcConfigClient.requireToken()`:

```java
String token = internalAuthProperties.getToken();
```

`InternalAuthProperties` 는 `@ConfigurationProperties(prefix = "app.security.internal")` → `app.security.internal.token`.

`application.yml`:

```yaml
app:
  security:
    internal:
      token: ${SAMHAN_INTERNAL_TOKEN:${INTERNAL_TOKEN:dev-only-token-replace}}
```

`SAMHAN_INTERNAL_TOKEN` → `INTERNAL_TOKEN` → `dev-only-token-replace` 순서의 chained default 다.

### 5-2. IT 환경 설정

`AbstractPostgresIT.registerDatasource`:

```java
registry.add("samhan.internal-token", () -> "test-internal-token");
```

단, IT 에서 `DcConfigClient` 는 `@MockBean` 으로 대체되므로 `requireToken()` 이 실제로 호출되지 않는다. IT 에서 token 설정은 무관하다.

### 5-3. 기존 다른 internal client 와의 동일 properties 여부

`partner-auth-service` 의 `DcConfigClient`, `estimate-service` 등 다른 internal 호출자도 동일 `app.security.internal.token` → `InternalAuthProperties` 패턴을 사용한다. `samhan.internal-token` legacy 경로도 `application.yml` 에 동일 값으로 병행 설정되어 있다. 일관성 확인 완료.

### 5-4. token 미설정 시 동작 (P2 finding)

token 이 blank 이면 `BusinessException(INTERNAL_ERROR)` 를 던져 confirm 전체가 실패한다. 이 예외는 `catch (BusinessException ex) { throw ex; }` 에서 재던져진다. 스펙 §5 "internal-token 미설정 → INTERNAL_ERROR(운영 misconfig 지표)"와 일치한다.

그러나 `calculatePrices` 의 일반적인 fail-soft 예외 catch 순서상 `BusinessException` 이 `RuntimeException` 의 상위가 아닐 경우 먼저 잡힐 수 있다. 실제로:

```java
} catch (BusinessException ex) {
    throw ex; // token 미설정 등
} catch (RuntimeException ex) {
    log.warn("...");
    return Map.of();
}
```

`BusinessException` catch 가 `RuntimeException` catch 보다 먼저 있으므로 올바르게 재던진다. BusinessException 이 RuntimeException 을 상속한다면(공통 패턴) 순서가 중요하다. 순서 확인 완료, 정상.

**Finding P2-2**: token 미설정 시 confirm 전체 실패는 의도된 동작이나, `.env` 템플릿에 `SAMHAN_INTERNAL_TOKEN` 이 누락된 경우 운영 환경에서 confirm 이 완전히 막힌다. 이 설정값이 기존 internal client(partner-auth-service 등)에서 이미 사용 중이면 추가 env 템플릿 변경은 불필요하다. 실제 `.env.dev-seed` 또는 env 템플릿 파일에서 `SAMHAN_INTERNAL_TOKEN` 존재 여부를 확인하는 것을 권고한다.

---

## 6. 종합 Finding 목록

| ID | 심각도 | 항목 | 설명 | 블로커 여부 |
|---|---|---|---|---|
| P1-1 | P1 | resilience4j 미적용 | `calculatePrices` 는 `RestClient` 직접 호출이며 `@CircuitBreaker` annotation 부재. timelimiter 3s 설정이 존재하나 AOP 가 적용되지 않을 가능성. dc-config hung 시 confirm thread block. | 아니오 (fail-soft 1차 보호, latency 문제만) |
| P2-1 | P2 | order-app PR CI gate 없음 | `ci.yml` 에 `clients/web/order-app` typecheck job 없음. samhanApi.ts 변경은 main 머지 후 deploy 에서만 typecheck. | 아니오 |
| P2-2 | P2 | env 템플릿 `SAMHAN_INTERNAL_TOKEN` 존재 확인 권고 | token 미설정 시 confirm 전체 실패. 기존 internal client 와 공유 설정이면 추가 작업 불필요하나 확인 필요. | 아니오 |

P0 결함: 0건
P1 결함: 1건 (P1-1)
P2 결함: 2건 (P2-1, P2-2)

---

## 7. 가용성 + CI 명시 결론

**dc-config 다운 시 confirm 가용성**: 보장됨. `onStatus(isError, noThrow)` + `catch(RuntimeException → Map.of())` + `getOrDefault(listPrice)` 3중 fail-soft 로 dc-config 가 완전히 다운되어도 confirm 은 listPrice 로 진행된다.

**confirm IT 실제 실행 여부**: CI `accounting+partner` job 에서 `partner-order-service:test` 실행. Ubuntu-latest Docker daemon 가용 → `DockerAvailableCondition` passed → `PartnerOrderConfirmServiceIT` 전체 7종(D1 회귀 5종 + price-calc 신규 2종) skip 없이 실행. `DcConfigClient` 는 `@MockBean` 으로 격리되어 있어 실제 dc-config-service 인스턴스 없이 테스트된다.
