package com.samhanair.logis.gateway.it;

import static org.assertj.core.api.Assertions.assertThat;

import com.samhanair.logis.gateway.ApiGatewayApplication;
import java.util.List;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.cloud.gateway.filter.FilterDefinition;
import org.springframework.cloud.gateway.route.RouteDefinition;
import org.springframework.cloud.gateway.route.RouteDefinitionLocator;
import org.springframework.test.context.TestPropertySource;

/**
 * api-gateway Spring 컨텍스트 로드 통합 테스트 (audit-slice-3 P1-2).
 *
 * <p>Eureka 비활성 + JWT secret 주입 상태에서 WebFlux 기반 Gateway 의
 * ApplicationContext(+ JwtAuthenticationGatewayFilterFactory, JwtProperties)
 * 가 정상 기동하는지 검증한다.
 *
 * <p>api-gateway 는 reactive (Netty) 스택이므로
 * {@code WebEnvironment.MOCK} 을 사용해 실제 포트 바인딩 없이 컨텍스트만 로드한다.
 *
 * <p>외부 client 격리:
 * api-gateway 는 외부 RestClient / Feign 을 보유하지 않으므로
 * {@code @MockBean} 없이 컨텍스트 로드만으로 검증 가능.
 * Eureka + Cloud Gateway 에서 {@code spring.cloud.gateway.enabled=false} 또는
 * service-discovery 비활성 설정으로 downstream 연결 시도를 억제.
 */
@SpringBootTest(
        classes = ApiGatewayApplication.class,
        webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT
)
@TestPropertySource(properties = {
        "eureka.client.enabled=false",
        "eureka.client.register-with-eureka=false",
        "eureka.client.fetch-registry=false",
        "spring.cloud.discovery.enabled=false",
        "app.security.jwt.secret=test-secret-key-32-chars-min-aaaaaa",
        "app.security.jwt.ttl-seconds=3600"
})
class ApiGatewayContextLoadIT {

    /** 선언된 라우트 정의(application.yml 순서 보존) 를 주입 — 라우트 계약 단언용. */
    @Autowired
    private RouteDefinitionLocator routeDefinitionLocator;

    /**
     * ApplicationContext 가 예외 없이 기동되면 PASS.
     *
     * <p>JWT 필터 팩토리({@link com.samhanair.logis.gateway.filter.JwtAuthenticationGatewayFilterFactory})
     * 와 {@link com.samhanair.logis.gateway.config.JwtProperties} bean 이
     * 올바르게 주입되는지 함께 검증.
     */
    @Test
    @DisplayName("api-gateway Spring 컨텍스트 정상 로드 — JWT 필터 + Eureka 비활성")
    void contextLoads() {
        // ApplicationContext 기동 성공이 곧 PASS.
    }

    /**
     * PR #461 (RC9 후속) 신규 product-service 풀패스 라우트 3종 계약 박제.
     *
     * <p>대상 라우트 — 모두 풀패스 컨트롤러(@RequestMapping("/api/v1...")) 라 StripPrefix 금지(no-strip):
     * <ul>
     *   <li>{@code product-components-v1} → {@code /api/v1/products/*&#47;components} (구성품 CRUD)</li>
     *   <li>{@code product-display-orders-v1} → {@code /api/v1/products/display-orders} (표시순서 일괄 갱신)</li>
     *   <li>{@code product-catalog-realtime-v1} → {@code /api/v1/products/catalog-realtime} (목록 SSE 구독)</li>
     * </ul>
     *
     * <p>단언 4축:
     * <ol>
     *   <li><b>존재 + Path predicate</b> — 각 id 가 선언돼 있고 기대 Path 패턴을 정확히 보유.</li>
     *   <li><b>no-strip</b> — 세 라우트 모두 {@code StripPrefix} 필터 미보유(strip 시 컨트롤러 매핑 불일치 → 404).</li>
     *   <li><b>선언 순서</b> — 세 라우트 모두 generic {@code product-service-v1}(StripPrefix=2) 보다 먼저 선언
     *       (Spring Cloud Gateway 는 선언 순서 = 매칭 우선순위 — generic 이 먼저면 strip 라우트가 가로채 깨짐).</li>
     *   <li><b>JwtAuthentication 필터 보유</b> (#24) — 세 라우트 모두 {@code JwtAuthentication} 필터 보유.
     *       필터 누락 = 인증 우회 회귀(무인증 노출)이므로 계약으로 박제한다.</li>
     * </ol>
     *
     * <p>리액티브 {@link RouteDefinitionLocator} 의 {@code Flux} 는 {@code .collectList().block()} 으로
     * 동기 단언. {@code getRouteDefinitions()} 는 application.yml 선언 순서를 보존한다.
     */
    @Test
    @DisplayName("RC9 신규 product 라우트 3종 — Path + no-strip + product-service-v1 선행 선언")
    void productCatalogRoutes_haveExpectedPath_noStrip_andPrecedeGenericRoute() {
        List<RouteDefinition> routes = routeDefinitionLocator.getRouteDefinitions()
                .collectList()
                .block();

        assertThat(routes)
                .as("RouteDefinitionLocator 가 선언 라우트를 반환해야 한다")
                .isNotNull()
                .isNotEmpty();

        // (1) 존재 + 정확한 Path predicate.
        assertRoutePath(routes, "product-components-v1", "/api/v1/products/*/components");
        assertRoutePath(routes, "product-display-orders-v1", "/api/v1/products/display-orders");
        assertRoutePath(routes, "product-catalog-realtime-v1", "/api/v1/products/catalog-realtime");

        // (2) no-strip — 세 라우트 모두 StripPrefix 필터 미보유.
        assertNoStripPrefix(routes, "product-components-v1");
        assertNoStripPrefix(routes, "product-display-orders-v1");
        assertNoStripPrefix(routes, "product-catalog-realtime-v1");

        // (3) 선언 순서 — 세 라우트 모두 generic product-service-v1 보다 먼저 선언.
        int genericIndex = indexOfRoute(routes, "product-service-v1");
        assertThat(genericIndex)
                .as("generic product-service-v1 라우트가 선언돼 있어야 한다")
                .isGreaterThanOrEqualTo(0);
        for (String id : List.of(
                "product-components-v1", "product-display-orders-v1", "product-catalog-realtime-v1")) {
            assertThat(indexOfRoute(routes, id))
                    .as("%s 는 generic product-service-v1 보다 먼저 선언돼야 한다(선언 순서=우선순위)", id)
                    .isGreaterThanOrEqualTo(0)
                    .isLessThan(genericIndex);
        }

        // (4) #24 JwtAuthentication 필터 보유 — 필터 제거 = 인증 우회 회귀 가드.
        assertHasJwtAuthenticationFilter(routes, "product-components-v1");
        assertHasJwtAuthenticationFilter(routes, "product-display-orders-v1");
        assertHasJwtAuthenticationFilter(routes, "product-catalog-realtime-v1");
    }

    /** 주어진 id 의 라우트가 존재하고 단일 Path predicate 가 기대 패턴과 정확히 일치하는지 단언. */
    private static void assertRoutePath(List<RouteDefinition> routes, String id, String expectedPath) {
        RouteDefinition route = findRoute(routes, id);
        // Path predicate 1개 보유 — args 값(Spring 이 _genkey_0 키로 저장)이 기대 경로와 일치.
        assertThat(route.getPredicates())
                .as("%s 는 Path predicate 1개를 보유해야 한다", id)
                .hasSize(1);
        assertThat(route.getPredicates().get(0).getName())
                .as("%s predicate 는 Path 여야 한다", id)
                .isEqualTo("Path");
        assertThat(route.getPredicates().get(0).getArgs().values())
                .as("%s 의 Path 패턴은 %s 여야 한다", id, expectedPath)
                .containsExactly(expectedPath);
    }

    /** 주어진 id 의 라우트가 StripPrefix 필터를 보유하지 않는지(no-strip) 단언. */
    private static void assertNoStripPrefix(List<RouteDefinition> routes, String id) {
        RouteDefinition route = findRoute(routes, id);
        assertThat(route.getFilters())
                .as("%s 는 no-strip 이어야 한다 — StripPrefix 필터 미보유", id)
                .extracting(FilterDefinition::getName)
                .doesNotContain("StripPrefix");
    }

    /** 주어진 id 의 라우트가 {@code JwtAuthentication} 필터를 보유하는지(#24 인증 우회 회귀 가드) 단언. */
    private static void assertHasJwtAuthenticationFilter(List<RouteDefinition> routes, String id) {
        RouteDefinition route = findRoute(routes, id);
        assertThat(route.getFilters())
                .as("%s 는 JwtAuthentication 필터를 보유해야 한다 — 누락 시 인증 우회 회귀", id)
                .extracting(FilterDefinition::getName)
                .contains("JwtAuthentication");
    }

    /** 선언 라우트 목록에서 id 의 인덱스(선언 순서). 미존재 시 -1. */
    private static int indexOfRoute(List<RouteDefinition> routes, String id) {
        for (int i = 0; i < routes.size(); i++) {
            if (id.equals(routes.get(i).getId())) {
                return i;
            }
        }
        return -1;
    }

    /** 선언 라우트 목록에서 id 의 RouteDefinition 단건 조회(없으면 단언 실패). */
    private static RouteDefinition findRoute(List<RouteDefinition> routes, String id) {
        return routes.stream()
                .filter(r -> id.equals(r.getId()))
                .findFirst()
                .orElseThrow(() -> new AssertionError("라우트 미존재: " + id));
    }
}
