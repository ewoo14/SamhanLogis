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

/** 기존 전표 창고명 snapshot client의 최소 wire 계약만 확인한다. */
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
    void 창고명_조회_성공응답을_파싱한다() {
        server.expect(requestTo(BASE_URL + "/internal/inventory/warehouses/" + WAREHOUSE_ID))
                .andExpect(method(HttpMethod.GET))
                .andExpect(header("X-Internal-Token", TOKEN))
                .andRespond(withSuccess("{\"data\":{\"name\":\"본사창고\"}}", MediaType.APPLICATION_JSON));

        assertThat(client.findWarehouseName(WAREHOUSE_ID)).contains("본사창고");
        server.verify();
    }

    @Test
    void 창고명_조회_404는_empty다() {
        server.expect(requestTo(BASE_URL + "/internal/inventory/warehouses/" + WAREHOUSE_ID))
                .andRespond(withStatus(HttpStatus.NOT_FOUND));

        assertThat(client.findWarehouseName(WAREHOUSE_ID)).isEmpty();
        server.verify();
    }

    @Test
    void token이_없으면_외부_호출하지_않는다() {
        InternalAuthProperties props = new InternalAuthProperties();
        props.setToken(" ");
        WarehouseInternalClient noTokenClient =
                new WarehouseInternalClient(RestClient.builder(), props, new ObjectMapper());

        assertThat(noTokenClient.findWarehouseName(WAREHOUSE_ID)).isEmpty();
        server.verify();
    }

    private static RestClient.Builder jacksonRestClientBuilder() {
        ObjectMapper objectMapper = new ObjectMapper()
                .registerModule(new JavaTimeModule())
                .disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS);
        return RestClient.builder().messageConverters(converters -> {
            converters.removeIf(MappingJackson2HttpMessageConverter.class::isInstance);
            converters.add(new MappingJackson2HttpMessageConverter(objectMapper));
        });
    }
}
