package com.samhanair.logis.inventory.client;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.security.InternalAuthProperties;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

/** MIG-5 product-service 제품명 lookup RestClient 회귀 가드. */
class ProductLookupClientTest {

    private static final String TOKEN = "test-token-xyz";

    private MockRestServiceServer server;
    private ProductLookupClient client;

    @BeforeEach
    void setUp() {
        RestClient.Builder builder = RestClient.builder();
        server = MockRestServiceServer.bindTo(builder).build();

        InternalAuthProperties props = new InternalAuthProperties();
        props.setToken(TOKEN);
        client = new ProductLookupClient(builder, props, new ObjectMapper());
    }

    @Test
    void findByProductNameStrict_sendsInternalToken_andParsesEnvelope() {
        UUID id = UUID.randomUUID();
        UUID categoryId = UUID.randomUUID();
        String json = "{\"success\":true,\"code\":\"OK\",\"message\":\"성공\","
                + "\"data\":{"
                + "\"id\":\"" + id + "\","
                + "\"name\":\"품목A\","
                + "\"modelName\":\"MODEL-A\","
                + "\"categoryId\":\"" + categoryId + "\","
                + "\"sellingPrice\":1000.00,"
                + "\"status\":\"ACTIVE\""
                + "}}";

        server.expect(requestTo("http://product-service/products/internal/by-name?name=%ED%92%88%EB%AA%A9A"))
                .andExpect(method(HttpMethod.GET))
                .andExpect(header("X-Internal-Token", TOKEN))
                .andRespond(withSuccess(json, MediaType.APPLICATION_JSON));

        Optional<ProductSummary> result = client.findByProductNameStrict("품목A");

        assertThat(result).isPresent();
        assertThat(result.get().id()).isEqualTo(id);
        assertThat(result.get().name()).isEqualTo("품목A");
        server.verify();
    }

    @Test
    void findByProductNameStrict_404_returnsEmpty() {
        server.expect(requestTo("http://product-service/products/internal/by-name?name=%EB%AF%B8%EB%93%B1%EB%A1%9D"))
                .andRespond(withStatus(HttpStatus.NOT_FOUND));

        assertThat(client.findByProductNameStrict("미등록")).isEmpty();
        server.verify();
    }

    @Test
    void findByProductNameStrict_409_throwsLookupAmbiguous() {
        server.expect(requestTo("http://product-service/products/internal/by-name?name=%EC%A4%91%EB%B3%B5"))
                .andRespond(withStatus(HttpStatus.CONFLICT));

        assertThatThrownBy(() -> client.findByProductNameStrict("중복"))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.MIG5_LOOKUP_AMBIGUOUS));
        server.verify();
    }
}
