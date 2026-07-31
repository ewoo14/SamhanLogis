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
import org.springframework.util.AntPathMatcher;

/** #996 fix: order-app 수량 동기화 규칙 조회의 게이트웨이 라우트 계약. */
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
class ApiGatewayQuantitySyncRouteTest {

    @Autowired
    private RouteDefinitionLocator routeDefinitionLocator;

    @Test
    @DisplayName("#996 quantity-sync 조회 라우트 — no-strip + JWT + 기존 라우트 영향 0건")
    void quantitySyncRuleRoute_isDedicatedNoStripJwtRoute_withoutLegacyRouteImpact() {
        List<RouteDefinition> routes = routeDefinitionLocator.getRouteDefinitions()
                .collectList()
                .block();
        String routeId = "product-quantity-sync-rules-v1";
        String requestPath = "/api/v1/quantity-sync-rules";

        assertRoutePath(routes, routeId,
                "/api/v1/quantity-sync-rules", "/api/v1/quantity-sync-rules/**");
        assertNoStripPrefix(routes, routeId);
        assertThat(filterNames(findRoute(routes, routeId)))
                .as("%s는 JWT 인증을 유지해야 한다", routeId)
                .contains("JwtAuthentication");

        int genericIndex = indexOfRoute(routes, "product-service-v1");
        assertThat(indexOfRoute(routes, routeId))
                .as("전용 quantity-sync 라우트는 generic product-service-v1보다 먼저 선언돼야 한다")
                .isLessThan(genericIndex);

        long existingRouteMatches = routes.stream()
                .filter(route -> !routeId.equals(route.getId()))
                .filter(route -> pathPredicateMatches(route, requestPath))
                .count();
        assertThat(existingRouteMatches)
                .as("%s에 대한 기존 라우트 영향 건수", requestPath)
                .isZero();

        assertThat(routes.stream()
                .filter(route -> pathPredicateMatches(route, requestPath))
                .map(RouteDefinition::getId)
                .toList())
                .as("%s는 전용 라우트 하나만 매칭해야 한다", requestPath)
                .containsExactly(routeId);
    }

    private static void assertRoutePath(List<RouteDefinition> routes, String id, String... expectedPaths) {
        RouteDefinition route = findRoute(routes, id);
        assertThat(route.getPredicates())
                .as("%s는 Path predicate 1개를 보유해야 한다", id)
                .hasSize(1);
        assertThat(route.getPredicates().get(0).getName())
                .as("%s predicate는 Path여야 한다", id)
                .isEqualTo("Path");
        assertThat(route.getPredicates().get(0).getArgs().values())
                .as("%s의 Path 패턴은 %s여야 한다", id, List.of(expectedPaths))
                .containsExactly(expectedPaths);
    }

    private static void assertNoStripPrefix(List<RouteDefinition> routes, String id) {
        assertThat(findRoute(routes, id).getFilters())
                .as("%s는 no-strip이어야 한다", id)
                .extracting(FilterDefinition::getName)
                .doesNotContain("StripPrefix");
    }

    private static boolean pathPredicateMatches(RouteDefinition route, String requestPath) {
        AntPathMatcher matcher = new AntPathMatcher();
        return route.getPredicates().stream()
                .filter(predicate -> "Path".equals(predicate.getName()))
                .flatMap(predicate -> predicate.getArgs().values().stream())
                .anyMatch(pattern -> matcher.match(pattern, requestPath));
    }

    private static List<String> filterNames(RouteDefinition route) {
        return route.getFilters().stream().map(FilterDefinition::getName).toList();
    }

    private static int indexOfRoute(List<RouteDefinition> routes, String id) {
        for (int i = 0; i < routes.size(); i++) {
            if (id.equals(routes.get(i).getId())) {
                return i;
            }
        }
        return -1;
    }

    private static RouteDefinition findRoute(List<RouteDefinition> routes, String id) {
        return routes.stream()
                .filter(route -> id.equals(route.getId()))
                .findFirst()
                .orElseThrow(() -> new AssertionError("라우트 미존재: " + id));
    }
}
