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
import java.util.Map;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.converter.json.MappingJackson2HttpMessageConverter;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

/** UserInternalClient — user-service 직원명 조회 wire 계약 회귀 가드. */
class UserInternalClientTest {

    private static final String TOKEN = "test-token";
    private static final String BASE_URL = "http://user-service";
    private static final UUID USER_ID = UUID.fromString("30000000-0000-0000-0000-000000000001");

    private MockRestServiceServer server;
    private UserInternalClient client;

    @BeforeEach
    void setUp() {
        RestClient.Builder boundBuilder = jacksonRestClientBuilder().baseUrl(BASE_URL);
        server = MockRestServiceServer.bindTo(boundBuilder).build();

        InternalAuthProperties props = new InternalAuthProperties();
        props.setToken(TOKEN);
        client = new UserInternalClient(RestClient.builder(), props, new ObjectMapper());
        ReflectionTestUtils.setField(client, "restClient", boundBuilder.build());
    }

    @Test
    void resolveFullName_200은_internal_user_response_wrapper에서_fullName을_파싱한다() {
        server.expect(requestTo(BASE_URL + "/internal/users/" + USER_ID))
                .andExpect(method(HttpMethod.GET))
                .andExpect(header("X-Internal-Token", TOKEN))
                .andRespond(withSuccess("""
                        {
                          "success": true,
                          "data": {
                            "id": "30000000-0000-0000-0000-000000000001",
                            "loginId": "sales01",
                            "fullName": "김삼한",
                            "role": "SALES"
                          }
                        }
                        """, MediaType.APPLICATION_JSON));

        assertThat(client.resolveFullName(USER_ID)).contains("김삼한");
        server.verify();
    }

    @Test
    void resolveFullName_404는_empty로_fail_soft_처리한다() {
        server.expect(requestTo(BASE_URL + "/internal/users/" + USER_ID))
                .andExpect(method(HttpMethod.GET))
                .andExpect(header("X-Internal-Token", TOKEN))
                .andRespond(withStatus(HttpStatus.NOT_FOUND));

        assertThat(client.resolveFullName(USER_ID)).isEmpty();
        server.verify();
    }

    @Test
    void resolveFullName_token_blank는_HTTP를_호출하지_않고_empty를_반환한다() {
        InternalAuthProperties props = new InternalAuthProperties();
        props.setToken(" ");
        UserInternalClient noTokenClient =
                new UserInternalClient(RestClient.builder(), props, new ObjectMapper());

        assertThat(noTokenClient.resolveFullName(USER_ID)).isEmpty();
        server.verify();
    }

    @Test
    void resolveFullNames는_display_names_벌크_계약을_호출하고_UUID별_성명을_반환한다() {
        UUID secondUserId = UUID.fromString("30000000-0000-0000-0000-000000000002");
        server.expect(requestTo(BASE_URL + "/internal/users/display-names"))
                .andExpect(method(HttpMethod.POST))
                .andExpect(header("X-Internal-Token", TOKEN))
                .andRespond(withSuccess("""
                        {
                          "success": true,
                          "data": {
                            "%s": "김삼한",
                            "%s": "이삼한"
                          }
                        }
                        """.formatted(USER_ID, secondUserId), MediaType.APPLICATION_JSON));

        assertThat(client.resolveFullNames(List.of(USER_ID, secondUserId)))
                .containsExactlyInAnyOrderEntriesOf(Map.of(
                        USER_ID, "김삼한",
                        secondUserId, "이삼한"));
        server.verify();
    }

    @Test
    void resolveFullNames_5xx는_빈맵으로_fail_open한다() {
        server.expect(requestTo(BASE_URL + "/internal/users/display-names"))
                .andExpect(method(HttpMethod.POST))
                .andExpect(header("X-Internal-Token", TOKEN))
                .andRespond(withStatus(HttpStatus.INTERNAL_SERVER_ERROR));

        assertThat(client.resolveFullNames(List.of(USER_ID))).isEmpty();
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
