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
    void webEstimateSnapshotRoutePreservesFullControllerPath() throws Exception {
        String source = Files.readString(
                Path.of("src/main/resources/application.yml"), StandardCharsets.UTF_8);

        assertThat(source).contains("id: slip-service-estimate-snapshots-v1");
        assertThat(source).contains("Path=/api/v1/estimates/web-snapshots,/api/v1/estimates/web-snapshots/**");
        assertThat(source).contains("uri: lb://slip-service");
    }
}
