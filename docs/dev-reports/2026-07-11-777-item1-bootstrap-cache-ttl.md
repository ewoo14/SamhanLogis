# #777 item1 — partner-order bootstrap cache 유계 갱신

## 배경

`partner-order-service` 의 `BootstrapService.fetch()` 는 `@Cacheable("bootstrap")` 로 응답을 캐시한다.
Spring 기본 `ConcurrentMapCacheManager` 는 TTL 이 없어 관리자 변동일/단가 수정 후 재기동 전까지
stale 응답이 유지될 수 있었다.

초기 접근은 `CaffeineCacheManager` 로 `bootstrap` 캐시에 `expireAfterWrite` TTL 을 주는 방식이었다.
하지만 이 방식은 `@Cacheable` 외부 래퍼만 만료시킨다. 실제 `fetch()` 가 읽는 원천 중
`BootstrapService` 내부 `productCatalogCache` 와 `sheetCache` 는 부팅 `@PostConstruct prefetch()` 로
채워진 뒤 `evictAll()` 없이는 계속 유지된다. 따라서 외부 래퍼 TTL 만료 후에도 내부 캐시가 stale 이면
다음 `fetch()` 는 stale 내부 캐시에서 다시 응답을 만들게 된다.

## 해법

외부 CacheManager TTL 을 폐기하고 `BootstrapCacheRefreshScheduler` 를 추가했다.

스케줄러는 `app.bootstrap.cache-refresh-minutes`(기본 10분) 간격의 `fixedDelay` 로 실행된다.
`fixedDelay` 는 이전 실행이 끝난 뒤 다음 실행을 예약하므로 긴 prefetch 와 중첩되지 않는다.

실행 순서는 다음과 같다.

1. `bootstrapService.evictAll()`
2. `bootstrapService.prefetch()`

`evictAll()` 은 `@CacheEvict(value = "bootstrap", allEntries = true)` 로 Spring Cache 를 비우고,
내부 `sheetCache`/`productCatalogCache` 와 `GoogleSheetsClient` 캐시도 함께 비운다.
그 다음 `prefetch()` 가 product-service 카탈로그와 Google Sheets 매핑 범위를 다시 읽어 내부 캐시를
fresh 상태로 채운다. 이후 `fetch()` 는 갱신된 내부 캐시로 `@Cacheable("bootstrap")` 응답을 재구성한다.

## self-invocation 회피

스케줄러는 `BootstrapService` 내부 메서드가 아니라 별도 `@Component` 이다.
`BootstrapService` 자기 자신이 `evictAll()` 을 호출하면 Spring AOP 프록시가 우회되어 `@CacheEvict` 가
동작하지 않을 수 있다. 별도 빈이 주입받은 `BootstrapService` 를 호출하면 프록시 경유가 보장된다.

## 설정

```yaml
app:
  bootstrap:
    cache-refresh-minutes: ${BOOTSTRAP_CACHE_REFRESH_MINUTES:10}
```

## 검증

`BootstrapCacheRefreshSchedulerTest` 는 Mockito `InOrder` 로 `evictAll()` 호출 후 `prefetch()` 가
호출되는 순서를 검증한다. 이 테스트는 스케줄 타이밍이 아니라 refresh 로직 자체를 고정한다.
