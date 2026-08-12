package com.samhanair.logis.gateway.config;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.jupiter.api.Test;

/** S27-1123 중앙 날짜 가드 공개 경로의 gateway 배선 계약을 고정한다. */
class S27SlipRouteContractTest {

    @Test
    void publishAndMobileRoutesPreserveControllerPaths() throws Exception {
        String source = Files.readString(
                Path.of("src/main/resources/application.yml"), StandardCharsets.UTF_8);

        assertThat(source).contains("id: slip-service-publish-v1-noprefix");
        assertThat(source).contains("Path=/api/v1/slips/from-estimate,/api/v1/slips/from-partner-order,/api/v1/slips/from-orders-merge");
        assertThat(source).contains("id: slip-service-mobile-sales-noprefix");
        assertThat(source).contains("Path=/mobile/sales/**");
    }

    @Test
    void partnerAuthPublicRoute_forwardsGatewayResolvedClientIpToAudit() throws Exception {
        String source = Files.readString(
                Path.of("src/main/resources/application.yml"), StandardCharsets.UTF_8);

        assertThat(routeBlock(source, "partner-auth-public-v1"))
                .contains("name: ForwardedClientIp");
    }

    @Test
    void partnerAuthPublicRoute_replacesExternalAuditClientIpHeader() throws Exception {
        String source = Files.readString(
                Path.of("src/main/resources/application.yml"), StandardCharsets.UTF_8);
        String route = routeBlock(source, "partner-auth-public-v1");

        assertThat(route).contains("- StripInboundIdentityHeaders");
        assertThat(route).contains("name: ForwardedClientIp");
        assertThat(route.indexOf("- StripInboundIdentityHeaders"))
                .isLessThan(route.indexOf("name: ForwardedClientIp"));
    }

    private static String routeBlock(String source, String routeId) {
        int routeStart = source.indexOf("- id: " + routeId);
        int nextRoute = source.indexOf("\n        - id: ", routeStart + 1);
        return source.substring(routeStart, nextRoute < 0 ? source.length() : nextRoute);
    }
}
