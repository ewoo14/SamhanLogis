package com.samhanair.logis.slip.client;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.security.InternalAuthProperties;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

/** 실 전표 모델코드 40건을 product-service 모델코드 계약으로 해소하는 RED-first 회귀 테스트. */
class ProductClientLookupByModelCodesTest {

    private MockRestServiceServer server;
    private ProductClient client;

    @BeforeEach
    void setUp() {
        RestClient.Builder builder = RestClient.builder();
        server = MockRestServiceServer.bindTo(builder).build();
        InternalAuthProperties props = new InternalAuthProperties();
        props.setToken("test-token-product");
        client = new ProductClient(builder, props, new ObjectMapper());
    }

    @Test
    void lookupByModelCodes_resolves_all_40_real_sales_model_codes() {
        List<String> modelCodes = java.util.stream.IntStream.rangeClosed(1, 40)
                .mapToObj(i -> "TEST-MODEL-%04d".formatted(i))
                .toList();
        String data = modelCodes.stream()
                .map(code -> "{\"id\":\"00000000-0000-0000-0000-000000000001\",\"name\":\"실상품\","
                        + "\"modelCode\":\"" + code + "\",\"categoryKey\":\"homemulti\"}")
                .collect(java.util.stream.Collectors.joining(","));
        String body = "{\"success\":true,\"data\":[" + data + "]}";

        server.expect(requestTo("http://product-service/products/internal/lookup-by-model-codes"))
                .andExpect(method(HttpMethod.POST))
                .andRespond(withSuccess(body, MediaType.APPLICATION_JSON));

        List<ProductSummary> result = client.lookupByModelCodes(modelCodes);

        assertThat(result).hasSize(40);
        assertThat(result).extracting(ProductSummary::modelCode).containsExactlyElementsOf(modelCodes);
        server.verify();
    }

    @Test
    void lookupByModelNames_sends_modelNames_to_modelName_endpoint() {
        List<String> modelNames = List.of("EC-ONLY-001");
        String body = "{\"success\":true,\"data\":["
                + "{\"id\":\"00000000-0000-0000-0000-000000000001\","
                + "\"name\":\"이카운트 품목\",\"modelName\":\"EC-ONLY-001\","
                + "\"modelCode\":null,\"categoryKey\":\"homemulti\"}]}";

        server.expect(requestTo("http://product-service/products/internal/lookup-by-model-names"))
                .andExpect(method(HttpMethod.POST))
                .andRespond(withSuccess(body, MediaType.APPLICATION_JSON));

        List<ProductSummary> result = client.lookupByModelNames(modelNames);

        assertThat(result).hasSize(1);
        assertThat(result.get(0).modelName()).isEqualTo("EC-ONLY-001");
        server.verify();
    }
}
