package com.samhanair.logis.slip.client;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.client.ExpectedCount.times;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.queryParam;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import com.samhanair.logis.security.InternalAuthProperties;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.converter.json.MappingJackson2HttpMessageConverter;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;
import org.springframework.web.util.UriComponentsBuilder;

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
        client = new WarehouseInternalClient(
                builder.baseUrl(BASE_URL).build(), props, new ObjectMapper());
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
    void 창고명_조회_404는_해당창고없음으로부분응답한다() {
        server.expect(requestTo(BASE_URL + "/internal/inventory/warehouses/" + WAREHOUSE_ID))
                .andRespond(withStatus(HttpStatus.NOT_FOUND));

        assertThat(client.findWarehouseName(WAREHOUSE_ID)).isEmpty();
        server.verify();
    }

    @Test
    void 정상_빈이름응답은_조회실패로전파한다() {
        server.expect(requestTo(BASE_URL + "/internal/inventory/warehouses/" + WAREHOUSE_ID))
                .andRespond(withSuccess("{\"data\":null}", MediaType.APPLICATION_JSON));

        org.assertj.core.api.Assertions.assertThatThrownBy(() -> client.findWarehouseName(WAREHOUSE_ID))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("창고 조회 실패")
                .hasNoCause();
        server.verify();
    }

    @Test
    void token이_없으면_조회실패로전파하고_외부호출하지_않는다() {
        InternalAuthProperties props = new InternalAuthProperties();
        props.setToken(" ");
        WarehouseInternalClient noTokenClient =
                new WarehouseInternalClient(RestClient.builder(), props, new ObjectMapper());

        org.assertj.core.api.Assertions.assertThatThrownBy(
                        () -> noTokenClient.findWarehouseName(WAREHOUSE_ID))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("internal token");
        server.verify();
    }

    @Test
    void eCount_alias_bulk_응답은_staging_계약으로_파싱하고_조회순서를_안정화한다() {
        List<String> requestedCodeQueries = new ArrayList<>();
        AtomicInteger responseCount = new AtomicInteger();
        server.expect(times(2), request -> {
                    requestedCodeQueries.add(UriComponentsBuilder.fromUri(request.getURI())
                            .build()
                            .getQueryParams()
                            .getFirst("codes"));
                    assertThat(request.getMethod()).isEqualTo(HttpMethod.GET);
                    assertThat(request.getHeaders().getFirst("X-Internal-Token"))
                            .isEqualTo(TOKEN);
                })
                .andRespond(request -> {
                    String body = responseCount.getAndIncrement() == 0
                            ? "{\"data\":["
                                    + "{\"ecountCode\":\"00003\",\"warehouseId\":\""
                                    + "50000000-0000-0000-0000-000000000001\"},"
                                    + "{\"ecountCode\":\"2\",\"warehouseId\":\""
                                    + "50000000-0000-0000-0000-000000000002\"}]}"
                            : "{\"data\":["
                                    + "{\"ecountCode\":\"2\",\"warehouseId\":\""
                                    + "50000000-0000-0000-0000-000000000002\"},"
                                    + "{\"ecountCode\":\"00003\",\"warehouseId\":\""
                                    + "50000000-0000-0000-0000-000000000001\"}]}";
                    return withSuccess(body, MediaType.APPLICATION_JSON).createResponse(request);
                });

        Map<String, WarehouseInternalClient.EcountWarehouseAlias> firstAliases =
                client.findEcountWarehouseAliases(new LinkedHashSet<>(List.of("00003", "2")));
        Map<String, WarehouseInternalClient.EcountWarehouseAlias> secondAliases =
                client.findEcountWarehouseAliases(new LinkedHashSet<>(List.of("2", "00003")));

        assertThat(requestedCodeQueries).hasSize(2);
        assertThat(requestedCodeQueries.get(1)).isEqualTo(requestedCodeQueries.get(0));
        assertThat(firstAliases).isEqualTo(secondAliases).containsKeys("00003", "2");
        assertThat(firstAliases.get("00003").warehouseId())
                .isEqualTo(UUID.fromString("50000000-0000-0000-0000-000000000001"));
        server.verify();
    }

    @Test
    void eCount_alias_코드는_공백과_중복을_정규화하고_빈_입력의_기존동작을_유지한다() {
        List<String> requestedCodeQueries = new ArrayList<>();
        server.expect(request -> requestedCodeQueries.add(UriComponentsBuilder.fromUri(request.getURI())
                        .build()
                        .getQueryParams()
                        .getFirst("codes")))
                .andRespond(withSuccess(
                        "{\"data\":[{\"ecountCode\":\"00003\",\"warehouseId\":\""
                                + "50000000-0000-0000-0000-000000000001\"}]}",
                        MediaType.APPLICATION_JSON));

        assertThat(client.findEcountWarehouseAliases(
                new LinkedHashSet<>(List.of(" 00003 ", "2", "00003", " "))))
                .containsKey("00003");
        assertThat(client.findEcountWarehouseAliases(Set.of())).isEmpty();
        assertThatThrownBy(() -> client.findEcountWarehouseAliases(List.of(" ", "\t")))
                .isInstanceOf(WarehouseInternalClient.WarehouseAliasUnavailableException.class)
                .hasMessageContaining("코드가 없습니다");

        assertThat(requestedCodeQueries).hasSize(1);
        assertThat(requestedCodeQueries.get(0).split(","))
                .containsExactlyInAnyOrder("00003", "2");
        server.verify();
    }

    @Test
    void eCount_alias_404와_503는_NOT_FOUND가_아닌_UNAVAILABLE이다() {
        server.expect(queryParam("codes", "00003"))
                .andRespond(withStatus(HttpStatus.SERVICE_UNAVAILABLE));

        org.assertj.core.api.Assertions.assertThatThrownBy(() ->
                        client.findEcountWarehouseAliases(java.util.Set.of("00003")))
                .isInstanceOf(WarehouseInternalClient.WarehouseAliasUnavailableException.class)
                .hasMessageContaining("HTTP 503");
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
