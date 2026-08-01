package com.samhanair.logis.slip.client;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import com.samhanair.logis.security.InternalAuthProperties;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.converter.json.MappingJackson2HttpMessageConverter;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

/** WarehouseInternalClient — inventory-service 창고 단건 조회 wire 계약 회귀 가드. */
class WarehouseInternalClientTest {

    private static final String TOKEN = "test-token";
    private static final String BASE_URL = "http://inventory-service";
    private static final UUID WAREHOUSE_ID = UUID.fromString("50000000-0000-0000-0000-000000000001");

    private MockRestServiceServer server;
    private WarehouseInternalClient client;

    @BeforeEach
    void setUp() {
        RestClient.Builder builder = jacksonRestClientBuilder();
        server = MockRestServiceServer.bindTo(builder).build();

        InternalAuthProperties props = new InternalAuthProperties();
        props.setToken(TOKEN);
        client = new WarehouseInternalClient(builder, props, new ObjectMapper());
    }

    @Test
    void findWarehouseName_200은_inventory_warehouse_response에서_name을_파싱한다() {
        server.expect(requestTo(BASE_URL + "/internal/inventory/warehouses/" + WAREHOUSE_ID))
                .andExpect(method(HttpMethod.GET))
                .andExpect(header("X-Internal-Token", TOKEN))
                .andRespond(withSuccess("""
                        {
                          "success": true,
                          "data": {
                            "warehouseId": "50000000-0000-0000-0000-000000000001",
                            "code": "WH-A",
                            "name": "본사창고",
                            "type": "MAIN",
                            "address": "서울"
                          }
                        }
                        """, MediaType.APPLICATION_JSON));

        assertThat(client.findWarehouseName(WAREHOUSE_ID)).contains("본사창고");
        server.verify();
    }

    @Test
    void findWarehouseName_404는_empty로_fail_soft_처리한다() {
        server.expect(requestTo(BASE_URL + "/internal/inventory/warehouses/" + WAREHOUSE_ID))
                .andExpect(method(HttpMethod.GET))
                .andExpect(header("X-Internal-Token", TOKEN))
                .andRespond(withStatus(HttpStatus.NOT_FOUND));

        assertThat(client.findWarehouseName(WAREHOUSE_ID)).isEmpty();
        server.verify();
    }

    @Test
    void findWarehouseName_token_blank는_HTTP를_호출하지_않고_empty를_반환한다() {
        InternalAuthProperties props = new InternalAuthProperties();
        props.setToken(" ");
        WarehouseInternalClient noTokenClient =
                new WarehouseInternalClient(RestClient.builder(), props, new ObjectMapper());

        assertThat(noTokenClient.findWarehouseName(WAREHOUSE_ID)).isEmpty();
        server.verify();
    }

    @Test
    void findWarehouseByCode_200은_창고_UUID와_코드를_파싱한다() {
        server.expect(requestTo(BASE_URL + "/internal/inventory/warehouses/by-code?code=00003"))
                .andExpect(method(HttpMethod.GET))
                .andExpect(header("X-Internal-Token", TOKEN))
                .andRespond(withSuccess("""
                        {
                          "success": true,
                          "data": {
                            "warehouseId": "50000000-0000-0000-0000-000000000001",
                            "code": "00003",
                            "name": "본사창고"
                          }
                        }
                        """, MediaType.APPLICATION_JSON));

        assertThat(client.findWarehouseByCode("00003"))
                .get()
                .satisfies(summary -> {
                    assertThat(summary.code()).isEqualTo("00003");
                    assertThat(summary.warehouseId()).isEqualTo(WAREHOUSE_ID);
                });
        server.verify();
    }

    @Test
    void findWarehouseById_200은_UUID_endpoint의_창고요약을_파싱한다() {
        server.expect(requestTo(BASE_URL + "/internal/inventory/warehouses/" + WAREHOUSE_ID))
                .andExpect(method(HttpMethod.GET))
                .andExpect(header("X-Internal-Token", TOKEN))
                .andRespond(withSuccess("""
                        {"success":true,"data":{"warehouseId":"50000000-0000-0000-0000-000000000001","code":"HQ-001","name":"본사창고"}}
                        """, MediaType.APPLICATION_JSON));

        WarehouseInternalClient.WarehouseLookup lookup = client.findWarehouseById(WAREHOUSE_ID);
        assertThat(lookup.status()).isEqualTo(WarehouseInternalClient.LookupStatus.FOUND);
        assertThat(lookup.summary().code()).isEqualTo("HQ-001");
    }

    @Test
    void findWarehouseById_404는_명백한_미실재로_구분한다() {
        server.expect(requestTo(BASE_URL + "/internal/inventory/warehouses/" + WAREHOUSE_ID))
                .andRespond(withStatus(HttpStatus.NOT_FOUND));

        assertThat(client.findWarehouseById(WAREHOUSE_ID).status())
                .isEqualTo(WarehouseInternalClient.LookupStatus.NOT_FOUND);
        server.verify();
    }

    @Test
    void findWarehouseById_5xx는_일시적인_조회_불가로_구분한다() {
        server.expect(requestTo(BASE_URL + "/internal/inventory/warehouses/" + WAREHOUSE_ID))
                .andRespond(withStatus(HttpStatus.SERVICE_UNAVAILABLE));

        assertThat(client.findWarehouseById(WAREHOUSE_ID).status())
                .isEqualTo(WarehouseInternalClient.LookupStatus.UNAVAILABLE);
        server.verify();
    }

    private static RestClient.Builder jacksonRestClientBuilder() {
        ObjectMapper objectMapper = new ObjectMapper()
                .registerModule(new JavaTimeModule())
                .disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS);
        return RestClient.builder()
                .messageConverters(converters -> {
                    converters.removeIf(MappingJackson2HttpMessageConverter.class::isInstance);
                    converters.add(new MappingJackson2HttpMessageConverter(objectMapper));
                });
    }
}
