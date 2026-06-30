package com.samhanair.logis.partnerorder.client;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.client.ExpectedCount.once;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import com.samhanair.logis.security.InternalAuthProperties;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

/**
 * EstimateCatalogClient RestClient 계약 테스트.
 *
 * <p>product-service 내부 endpoint 는 ApiResponse envelope 의 {@code data} 를 반환한다.
 * partner-order-service 는 X-Internal-Token 을 붙이고 data 만 언랩해 BootstrapService 에 전달한다.
 */
class EstimateCatalogClientTest {

    private static final String TOKEN = "test-internal-token";

    private MockRestServiceServer server;
    private EstimateCatalogClient client;

    @BeforeEach
    void setUp() {
        RestClient.Builder builder = RestClient.builder();
        server = MockRestServiceServer.bindTo(builder).build();
        InternalAuthProperties props = new InternalAuthProperties();
        props.setToken(TOKEN);
        client = new EstimateCatalogClient(builder, props);
    }

    @Test
    void catalog_scope를_query_param으로_전달하고_data를_언랩한다() {
        server.expect(once(), requestTo("http://product-service/products/internal/estimate-catalog/products"
                        + "?category=HOME_MULTI&scope=PARTNER_ORDER"))
                .andExpect(method(HttpMethod.GET))
                .andExpect(header("X-Internal-Token", TOKEN))
                .andRespond(withSuccess("""
                        {"data":[{"name":"홈","modelCode":"HM-1","deliveryPrice":123000}]}
                        """, MediaType.APPLICATION_JSON));

        List<Map<String, Object>> rows = client.catalog(
                EstimateCategory.HOME_MULTI, UsageScope.PARTNER_ORDER);

        assertThat(rows).hasSize(1);
        assertThat(rows.get(0)).containsEntry("name", "홈")
                .containsEntry("modelCode", "HM-1")
                .containsEntry("deliveryPrice", 123000);
        server.verify();
    }

    @Test
    void components_materialPrices_priceBaseline_priceChangeSchedule_모두_data를_언랩한다() {
        server.expect(once(), requestTo("http://product-service/products/internal/estimate-catalog/components"
                        + "?category=SINGLE_SET"))
                .andExpect(method(HttpMethod.GET))
                .andExpect(header("X-Internal-Token", TOKEN))
                .andRespond(withSuccess("""
                        {"data":[{"setModelCode":"SS-1","componentModelCode":"PANEL-1"}]}
                        """, MediaType.APPLICATION_JSON));
        server.expect(once(), requestTo("http://product-service/products/internal/estimate-catalog/material-prices"))
                .andExpect(method(HttpMethod.GET))
                .andExpect(header("X-Internal-Token", TOKEN))
                .andRespond(withSuccess("""
                        {"data":[{"name":"D7","price":43000}]}
                        """, MediaType.APPLICATION_JSON));
        server.expect(once(), requestTo("http://product-service/products/internal/estimate-catalog/price-baseline"))
                .andExpect(method(HttpMethod.GET))
                .andExpect(header("X-Internal-Token", TOKEN))
                .andRespond(withSuccess("""
                        {"data":[{"modelCode":"HM-1","estimateCategory":"HOME_MULTI","releasePrice":470000}]}
                        """, MediaType.APPLICATION_JSON));
        server.expect(once(), requestTo("http://product-service/products/internal/price-change-schedule"))
                .andExpect(method(HttpMethod.GET))
                .andExpect(header("X-Internal-Token", TOKEN))
                .andRespond(withSuccess("""
                        {"data":{"homemulti":"2026-04-01","singleSets":"2026-05-01"}}
                        """, MediaType.APPLICATION_JSON));

        assertThat(client.components(EstimateCategory.SINGLE_SET).get(0))
                .containsEntry("componentModelCode", "PANEL-1");
        assertThat(client.materialPrices().get(0))
                .containsEntry("name", "D7");
        assertThat(client.priceBaseline().get(0))
                .containsEntry("modelCode", "HM-1")
                .containsEntry("releasePrice", 470000);
        assertThat(client.priceChangeSchedule())
                .isEqualTo(Map.of(
                        "homemulti", LocalDate.of(2026, 4, 1),
                        "singleSets", LocalDate.of(2026, 5, 1)));
        server.verify();
    }
}
