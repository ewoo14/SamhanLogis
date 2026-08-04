package com.samhanair.logis.gateway.it;

import static org.assertj.core.api.Assertions.assertThat;

import com.samhanair.logis.gateway.ApiGatewayApplication;
import java.util.List;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.cloud.gateway.config.GatewayProperties;
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

    /** default-filters 계약 확인용 gateway 설정 객체. */
    @Autowired
    private GatewayProperties gatewayProperties;

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
     * PR #461 (RC9 후속) 신규 product-service 풀패스 라우트 계약 박제.
     *
     * <p>대상 라우트 — 모두 풀패스 컨트롤러(@RequestMapping("/api/v1...")) 라 StripPrefix 금지(no-strip):
     * <ul>
     *   <li>{@code product-components-v1} → {@code /api/v1/products/*&#47;components} (구성품 CRUD)</li>
     *   <li>{@code product-display-orders-v1} → {@code /api/v1/products/display-orders} (표시순서 일괄 갱신)</li>
     *   <li>{@code product-catalog-realtime-v1} → {@code /api/v1/products/catalog-realtime} (목록 SSE 구독)</li>
     *   <li>{@code product-fixed-discount-v1} → {@code /api/v1/products/*&#47;fixed-discount} (고정DC 인라인 자동저장)</li>
     *   <li>{@code product-classification-v1} → {@code /api/v1/products/*&#47;classification} (품목별 분류 저장)</li>
     *   <li>{@code product-classifications-v1} → {@code /api/v1/classifications/**} (분류 마스터 CRUD)</li>
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
    @DisplayName("RC9 product 라우트 — Path + no-strip + product-service-v1 선행 선언")
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
        assertRoutePath(routes, "product-fixed-discount-v1", "/api/v1/products/*/fixed-discount");
        assertRoutePath(routes, "product-classification-v1", "/api/v1/products/*/classification");
        assertRoutePath(routes, "product-classifications-v1",
                "/api/v1/classifications", "/api/v1/classifications/**");

        // (2) no-strip — 세 라우트 모두 StripPrefix 필터 미보유.
        assertNoStripPrefix(routes, "product-components-v1");
        assertNoStripPrefix(routes, "product-display-orders-v1");
        assertNoStripPrefix(routes, "product-catalog-realtime-v1");
        assertNoStripPrefix(routes, "product-fixed-discount-v1");
        assertNoStripPrefix(routes, "product-classification-v1");
        assertNoStripPrefix(routes, "product-classifications-v1");

        // (3) 선언 순서 — 세 라우트 모두 generic product-service-v1 보다 먼저 선언.
        int genericIndex = indexOfRoute(routes, "product-service-v1");
        assertThat(genericIndex)
                .as("generic product-service-v1 라우트가 선언돼 있어야 한다")
                .isGreaterThanOrEqualTo(0);
        for (String id : List.of(
                "product-components-v1", "product-display-orders-v1", "product-catalog-realtime-v1",
                "product-fixed-discount-v1", "product-classification-v1", "product-classifications-v1")) {
            assertThat(indexOfRoute(routes, id))
                    .as("%s 는 generic product-service-v1 보다 먼저 선언돼야 한다(선언 순서=우선순위)", id)
                    .isGreaterThanOrEqualTo(0)
                    .isLessThan(genericIndex);
        }

        // (4) #24 JwtAuthentication 필터 보유 — 필터 제거 = 인증 우회 회귀 가드.
        assertHasJwtAuthenticationFilter(routes, "product-components-v1");
        assertHasJwtAuthenticationFilter(routes, "product-display-orders-v1");
        assertHasJwtAuthenticationFilter(routes, "product-catalog-realtime-v1");
        assertHasJwtAuthenticationFilter(routes, "product-fixed-discount-v1");
        assertHasJwtAuthenticationFilter(routes, "product-classification-v1");
        assertHasJwtAuthenticationFilter(routes, "product-classifications-v1");
    }

    /**
     * #465 공개 라우트 identity header spoof 차단 계약.
     *
     * <p>JwtAuthentication 미적용 라우트는 JWT claim 재주입 근거가 없으므로
     * {@code StripInboundIdentityHeaders} 로 7개 identity header 를 제거해야 한다.
     * 전역 {@code default-filters} 에서는 제거하지 않는다. 보호 라우트의
     * JwtAuthentication claim 기반 재주입 순서와 충돌할 수 있기 때문이다.
     */
    @Test
    @DisplayName("#465 JwtAuthentication 미적용 라우트 전수 — StripInboundIdentityHeaders 보유")
    void publicRoutesWithoutJwtAuthentication_haveStripInboundIdentityHeaders() {
        List<RouteDefinition> routes = routeDefinitionLocator.getRouteDefinitions()
                .collectList()
                .block();

        assertThat(routes)
                .as("RouteDefinitionLocator 가 선언 라우트를 반환해야 한다")
                .isNotNull()
                .isNotEmpty();

        List<String> noJwtRouteIds = routes.stream()
                .filter(route -> !filterNames(route).contains("JwtAuthentication"))
                .map(RouteDefinition::getId)
                .toList();

        assertThat(noJwtRouteIds)
                .as("JwtAuthentication 미적용 공개 라우트 전수")
                .containsExactly(
                        "auth-service",
                        "user-service-employee-signatures-public",
                        "slip-service-public",
                        "partner-auth-public-v1",
                        "auth-service-v1",
                        "auth-service-legacy",
                        "dashboard-app-version-public",
                        "partner-order-public-v1",
                        "partner-auth-service-v1"
                );

        for (String id : noJwtRouteIds) {
            assertHasStripInboundIdentityHeadersFilter(routes, id);
        }

        assertHasStripInboundIdentityHeadersFilter(routes, "user-service-employee-signatures-public");
        assertThat(filterNames(findRoute(routes, "user-service-employee-signatures-public")))
                .as("user-service-employee-signatures-public 은 JwtAuthentication 없이 공개되어야 한다")
                .doesNotContain("JwtAuthentication");
        assertHasStripPrefix(routes, "user-service-employee-signatures-public", "1");
    }

    @Test
    @DisplayName("approval-line read routes are authenticated no-strip and precede auth catch-all")
    void approvalLineReadRoutes_areAuthenticatedNoStrip_andPrecedeLegacyCatchAll() {
        List<RouteDefinition> routes = routeDefinitionLocator.getRouteDefinitions()
                .collectList()
                .block();

        assertThat(routes)
                .as("RouteDefinitionLocator must return configured routes")
                .isNotNull()
                .isNotEmpty();

        assertRoutePath(routes, "auth-service-admin-authenticated",
                "/auth/admin/**",
                "/auth/password/change",
                "/auth/approval-line-configs/*/structure",
                "/auth/approval-line-configs/*/default-approvers");
        assertHasJwtAuthenticationFilter(routes, "auth-service-admin-authenticated");
        assertNoStripPrefix(routes, "auth-service-admin-authenticated");
        assertThat(indexOfRoute(routes, "auth-service-admin-authenticated"))
                .as("authenticated auth route must be declared before /auth/** legacy catch-all")
                .isGreaterThanOrEqualTo(0)
                .isLessThan(indexOfRoute(routes, "auth-service-legacy"));
    }

    @Test
    @DisplayName("groupware active templates route is covered by authenticated no-prefix route")
    void groupwareActiveTemplatesRoute_isCoveredByAuthenticatedNoPrefixRoute() {
        List<RouteDefinition> routes = routeDefinitionLocator.getRouteDefinitions()
                .collectList()
                .block();

        assertThat(routes)
                .as("RouteDefinitionLocator must return configured routes")
                .isNotNull()
                .isNotEmpty();

        assertRoutePath(routes, "groupware-service-noprefix",
                "/admin/groupware/**",
                "/groupware/**");
        assertHasJwtAuthenticationFilter(routes, "groupware-service-noprefix");
        assertNoStripPrefix(routes, "groupware-service-noprefix");
    }

    @Test
    @DisplayName("그룹웨어 관리자 v1 라우트는 기존 /admin/groupware 규약으로 전달")
    void groupwareAdminV1Route_usesExistingAdminGroupwareContract() {
        List<RouteDefinition> routes = routeDefinitionLocator.getRouteDefinitions()
                .collectList()
                .block();

        assertRoutePath(routes, "groupware-admin-v1", "/api/v1/admin/groupware/**");
        assertHasStripPrefix(routes, "groupware-admin-v1", "2");
        assertHasJwtAuthenticationFilter(routes, "groupware-admin-v1");
        assertThat(indexOfRoute(routes, "groupware-admin-v1"))
                .as("관리자 v1 라우트는 generic groupware v1 보다 먼저 선언돼야 한다")
                .isLessThan(indexOfRoute(routes, "groupware-service-v1"));
    }

    /** F6 주문서 bootstrap/gate/log 공개 라우트 — 인증 없이 접근하되 identity header spoof 는 제거. */
    @Test
    @DisplayName("partner-order 공개 라우트 — bootstrap/gate/log no-JWT + no-strip + 보호 route 선행")
    void partnerOrderPublicRoute_hasNoJwt_noStrip_andPrecedesProtectedPartnerOrderRoute() {
        List<RouteDefinition> routes = routeDefinitionLocator.getRouteDefinitions()
                .collectList()
                .block();

        assertThat(routes)
                .as("RouteDefinitionLocator 가 선언 라우트를 반환해야 한다")
                .isNotNull()
                .isNotEmpty();

        assertRoutePath(routes, "partner-order-public-v1",
                "/api/v1/partner-orders/bootstrap",
                "/api/v1/partner-orders/gate-images",
                "/api/v1/partner-orders/log");
        assertNoStripPrefix(routes, "partner-order-public-v1");
        assertHasStripInboundIdentityHeadersFilter(routes, "partner-order-public-v1");
        assertThat(filterNames(findRoute(routes, "partner-order-public-v1")))
                .as("partner-order-public-v1 은 JwtAuthentication 없이 공개되어야 한다")
                .doesNotContain("JwtAuthentication");
        assertThat(indexOfRoute(routes, "partner-order-public-v1"))
                .as("공개 partner-order route 는 보호 partner-order catch-all 보다 먼저 선언되어야 한다")
                .isGreaterThanOrEqualTo(0)
                .isLessThan(indexOfRoute(routes, "partner-order-service-v1"));
    }

    /** V1a 앱 버전 조회 공개 라우트 — 부팅 전 호출 가능 + identity header strip 전용. */
    @Test
    @DisplayName("app version 공개 라우트 — /app/version no-JWT + identity strip + 릴리스 admin 선행")
    void appVersionPublicRoute_hasNoJwt_stripIdentity_andPrecedesProtectedReleaseRoute() {
        List<RouteDefinition> routes = routeDefinitionLocator.getRouteDefinitions()
                .collectList()
                .block();

        assertThat(routes)
                .as("RouteDefinitionLocator 가 선언 라우트를 반환해야 한다")
                .isNotNull()
                .isNotEmpty();

        assertRoutePath(routes, "dashboard-app-version-public", "/app/version");
        assertNoStripPrefix(routes, "dashboard-app-version-public");
        assertHasStripInboundIdentityHeadersFilter(routes, "dashboard-app-version-public");
        assertThat(filterNames(findRoute(routes, "dashboard-app-version-public")))
                .as("dashboard-app-version-public 은 JwtAuthentication 없이 공개되어야 한다")
                .doesNotContain("JwtAuthentication");
        assertThat(indexOfRoute(routes, "dashboard-app-version-public"))
                .as("공개 /app/version 은 보호 /app/releases 라우트보다 먼저 선언되어야 한다")
                .isGreaterThanOrEqualTo(0)
                .isLessThan(indexOfRoute(routes, "dashboard-app-releases-authenticated"));

        assertRoutePath(routes, "dashboard-app-releases-authenticated", "/app/releases", "/app/releases/**");
        assertNoStripPrefix(routes, "dashboard-app-releases-authenticated");
        assertHasJwtAuthenticationFilter(routes, "dashboard-app-releases-authenticated");
    }

    /**
     * #729 게이트웨이 매출/매입 전표 + 세금계산서 admin 라우트 계약 박제.
     *
     * <p>SalesAccountingSlipController({@code /admin/sales-slips}), PurchaseAccountingSlipController
     * ({@code /admin/purchase-slips}), 세금계산서 배치/수신 컨트롤러({@code /admin/tax-invoices})는
     * 모두 풀패스 컨트롤러라 {@code accounting-admin-noprefix} 선례와 동일하게 StripPrefix 없이
     * JwtAuthentication 만 적용해야 한다. 라우트 누락 시 404, StripPrefix 오적용 시 컨트롤러 매핑 불일치.
     */
    @Test
    @DisplayName("#729 매출/매입 전표 + 세금계산서 admin no-prefix 라우트 — Path + JwtAuthentication + no-strip")
    void accountingSalesPurchaseSlipAndTaxInvoiceAdminRoutes_areAuthenticatedNoStrip() {
        List<RouteDefinition> routes = routeDefinitionLocator.getRouteDefinitions()
                .collectList()
                .block();

        assertThat(routes)
                .as("RouteDefinitionLocator 가 선언 라우트를 반환해야 한다")
                .isNotNull()
                .isNotEmpty();

        // [#729] 매출/매입 전표 admin — 4개 Path 패턴 전부 보유 + no-strip + JwtAuthentication.
        assertRoutePath(routes, "accounting-sales-purchase-slip-admin-noprefix",
                "/admin/sales-slips",
                "/admin/sales-slips/**",
                "/admin/purchase-slips",
                "/admin/purchase-slips/**");
        assertNoStripPrefix(routes, "accounting-sales-purchase-slip-admin-noprefix");
        assertHasJwtAuthenticationFilter(routes, "accounting-sales-purchase-slip-admin-noprefix");

        // [#729] 세금계산서 admin — 2개 Path 패턴 보유 + no-strip + JwtAuthentication.
        assertRoutePath(routes, "accounting-tax-invoice-admin-noprefix",
                "/admin/tax-invoices",
                "/admin/tax-invoices/**");
        assertNoStripPrefix(routes, "accounting-tax-invoice-admin-noprefix");
        assertHasJwtAuthenticationFilter(routes, "accounting-tax-invoice-admin-noprefix");
    }

    /** #1039 S8: S1~S4 신규 admin 경로가 동일한 slip-service 보호 라우트에 등록돼야 한다. */
    @Test
    @DisplayName("#1039 S8 배차 신규 admin 라우트 — 그룹/운송사/가배차 분류 + JwtAuthentication")
    void provisionalDispatchAdminRoutes_areAuthenticatedNoStripAndReachable() {
        List<RouteDefinition> routes = routeDefinitionLocator.getRouteDefinitions()
                .collectList()
                .block();

        assertRoutePath(routes, "slip-dispatch-admin-noprefix",
                "/admin/dispatch-tasks", "/admin/dispatch-tasks/**",
                "/admin/dispatch-board", "/admin/dispatch-board/**",
                "/admin/external-carriers", "/admin/external-carriers/**",
                "/admin/external-dispatches", "/admin/external-dispatches/**",
                "/admin/slip-cutoffs", "/admin/slip-cutoffs/**",
                "/admin/dispatch-groups", "/admin/dispatch-groups/**",
                "/admin/carriers", "/admin/carriers/**",
                "/admin/dispatches/pre-classify");
        assertNoStripPrefix(routes, "slip-dispatch-admin-noprefix");
        assertHasJwtAuthenticationFilter(routes, "slip-dispatch-admin-noprefix");

        // 새 조합은 기존 명시 라우트와 겹치지 않고, 기존 protected admin 라우트의 선행 순서도 유지한다.
        assertThat(indexOfRoute(routes, "slip-dispatch-admin-noprefix"))
                .isGreaterThan(indexOfRoute(routes, "slip-service-admin"));
    }

    /** #465: default-filters 에 identity strip 을 추가하지 않았는지 회귀 가드. */
    @Test
    @DisplayName("#465 default-filters 는 identity header strip 미보유")
    void defaultFilters_doNotStripIdentityHeaders() {
        assertThat(gatewayProperties.getDefaultFilters())
                .as("default-filters 는 보호 라우트 JwtAuthentication 재주입 순서와 충돌하지 않아야 한다")
                .extracting(FilterDefinition::getName)
                .doesNotContain("StripInboundIdentityHeaders", "RemoveRequestHeader");
    }

    /** 주어진 id 의 라우트가 존재하고 단일 Path predicate 가 기대 패턴들과 정확히 일치하는지 단언. */
    private static void assertRoutePath(List<RouteDefinition> routes, String id, String... expectedPaths) {
        RouteDefinition route = findRoute(routes, id);
        // Path predicate 1개 보유 — 콤마로 선언한 다중 경로는 Spring 이 _genkey_N args 로 분리 저장한다.
        assertThat(route.getPredicates())
                .as("%s 는 Path predicate 1개를 보유해야 한다", id)
                .hasSize(1);
        assertThat(route.getPredicates().get(0).getName())
                .as("%s predicate 는 Path 여야 한다", id)
                .isEqualTo("Path");
        assertThat(route.getPredicates().get(0).getArgs().values())
                .as("%s 의 Path 패턴은 %s 여야 한다", id, List.of(expectedPaths))
                .containsExactly(expectedPaths);
    }

    /** 주어진 id 의 라우트가 StripPrefix 필터를 보유하지 않는지(no-strip) 단언. */
    private static void assertNoStripPrefix(List<RouteDefinition> routes, String id) {
        RouteDefinition route = findRoute(routes, id);
        assertThat(route.getFilters())
                .as("%s 는 no-strip 이어야 한다 — StripPrefix 필터 미보유", id)
                .extracting(FilterDefinition::getName)
                .doesNotContain("StripPrefix");
    }

    /** 주어진 id 의 라우트가 기대 StripPrefix 값을 보유하는지 단언. */
    private static void assertHasStripPrefix(List<RouteDefinition> routes, String id, String parts) {
        RouteDefinition route = findRoute(routes, id);
        assertThat(route.getFilters())
                .as("%s 는 StripPrefix=%s 필터를 보유해야 한다", id, parts)
                .anySatisfy(filter -> {
                    assertThat(filter.getName()).isEqualTo("StripPrefix");
                    assertThat(filter.getArgs().values()).containsExactly(parts);
                });
    }

    /** 주어진 id 의 라우트가 {@code JwtAuthentication} 필터를 보유하는지(#24 인증 우회 회귀 가드) 단언. */
    private static void assertHasJwtAuthenticationFilter(List<RouteDefinition> routes, String id) {
        RouteDefinition route = findRoute(routes, id);
        assertThat(filterNames(route))
                .as("%s 는 JwtAuthentication 필터를 보유해야 한다 — 누락 시 인증 우회 회귀", id)
                .contains("JwtAuthentication");
    }

    /** 주어진 id 의 라우트가 공개 identity strip 필터를 보유하는지(#465) 단언. */
    private static void assertHasStripInboundIdentityHeadersFilter(List<RouteDefinition> routes, String id) {
        RouteDefinition route = findRoute(routes, id);
        assertThat(filterNames(route))
                .as("%s 는 StripInboundIdentityHeaders 필터를 보유해야 한다 — 누락 시 공개 라우트 spoof 위험", id)
                .contains("StripInboundIdentityHeaders");
    }

    /** RouteDefinition 의 필터명 목록. */
    private static List<String> filterNames(RouteDefinition route) {
        return route.getFilters().stream()
                .map(FilterDefinition::getName)
                .toList();
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
