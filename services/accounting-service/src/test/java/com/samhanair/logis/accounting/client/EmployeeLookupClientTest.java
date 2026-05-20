package com.samhanair.logis.accounting.client;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withServerError;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.security.InternalAuthProperties;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

class EmployeeLookupClientTest {

    private static final String TOKEN = "test-token";

    private MockRestServiceServer server;
    private EmployeeLookupClient client;

    @BeforeEach
    void setUp() {
        RestClient.Builder builder = RestClient.builder();
        server = MockRestServiceServer.bindTo(builder).build();
        InternalAuthProperties props = new InternalAuthProperties();
        props.setToken(TOKEN);
        client = new EmployeeLookupClient(builder, props, new ObjectMapper());
    }

    @Test
    void by_name_200_빈배열은_lookup_miss_판단용_empty() {
        server.expect(requestTo("http://user-service/internal/users/by-name?name=%EB%AF%B8%EB%93%B1%EB%A1%9D"))
                .andExpect(method(HttpMethod.GET))
                .andExpect(header("X-Internal-Token", TOKEN))
                .andRespond(withSuccess("{\"success\":true,\"data\":[]}", MediaType.APPLICATION_JSON));

        assertThat(client.findByFullName("미등록")).isEmpty();
        server.verify();
    }

    @Test
    void by_name_5xx는_MIG10_EMPLOYEE_LOOKUP_ERROR() {
        server.expect(requestTo("http://user-service/internal/users/by-name?name=%EA%B9%80%EB%8B%B4%EB%8B%B9"))
                .andExpect(method(HttpMethod.GET))
                .andExpect(header("X-Internal-Token", TOKEN))
                .andRespond(withServerError());

        assertThatThrownBy(() -> client.findByFullName("김담당"))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.MIG10_EMPLOYEE_LOOKUP_ERROR));
        server.verify();
    }
}
