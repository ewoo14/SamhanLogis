package com.samhanair.logis.notification.client;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsInAnyOrder;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.jsonPath;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import com.samhanair.logis.discovery.ServiceDiscoveryClient;
import com.samhanair.logis.discovery.ServiceInstance;
import com.samhanair.logis.notification.config.UserCacheProperties;
import com.samhanair.logis.userclient.UserVerifierProperties;
import io.micrometer.observation.ObservationRegistry;
import java.util.function.Consumer;
import java.util.function.Predicate;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.client.ClientHttpRequestFactory;
import org.springframework.http.client.ClientHttpRequestInitializer;
import org.springframework.http.client.ClientHttpRequestInterceptor;
import org.springframework.http.client.observation.ClientRequestObservationConvention;
import org.springframework.http.converter.HttpMessageConverter;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.ResponseErrorHandler;
import org.springframework.web.util.UriBuilderFactory;

/** UserClient — shared DefaultUserVerifier 위임 기반 user-service internal 계약 회귀 가드. */
class UserClientContractTest {

    private static final String BASE_URL = "http://user-service";
    private static final String INTERNAL_TOKEN = "test-internal-token";

    private MockRestServiceServer server;
    private UserClient client;

    @BeforeEach
    void setUp() {
        RestClient.Builder builder = new MockServerPreservingBuilder(RestClient.builder());
        server = MockRestServiceServer.bindTo(builder).build();

        UserCacheProperties cacheProperties = new UserCacheProperties();
        cacheProperties.setTtlSeconds(60L);
        cacheProperties.setMaxSize(1000L);
        client = new UserClient(builder, noopDiscovery(), BASE_URL,
                UserVerifierProperties.FailMode.OPEN, INTERNAL_TOKEN, cacheProperties);
    }

    @Test
    void verifyBulk_경로_토큰_요청userIds와_exists맵_파싱을_검증한다() {
        UUID activeUserId = UUID.fromString("00000000-0000-0000-0000-000000000601");
        UUID missingUserId = UUID.fromString("00000000-0000-0000-0000-000000000602");

        server.expect(requestTo(BASE_URL + "/internal/users/verify-bulk"))
                .andExpect(method(HttpMethod.POST))
                .andExpect(header("X-Internal-Token", INTERNAL_TOKEN))
                .andExpect(jsonPath("$.userIds[*]", containsInAnyOrder(
                        activeUserId.toString(), missingUserId.toString())))
                .andRespond(withSuccess("""
                        {"success":true,"data":{"exists":{
                          "00000000-0000-0000-0000-000000000601":true,
                          "00000000-0000-0000-0000-000000000602":false
                        }}}
                        """, MediaType.APPLICATION_JSON));

        Map<UUID, Boolean> result = client.verifyBulk(List.of(activeUserId, missingUserId));

        assertThat(result)
                .containsEntry(activeUserId, true)
                .containsEntry(missingUserId, false);
        server.verify();
    }

    @Test
    void exists_경로_토큰과_200_true를_검증한다() {
        UUID userId = UUID.fromString("00000000-0000-0000-0000-000000000603");

        server.expect(requestTo(BASE_URL + "/internal/users/" + userId))
                .andExpect(method(HttpMethod.GET))
                .andExpect(header("X-Internal-Token", INTERNAL_TOKEN))
                .andRespond(withSuccess());

        assertThat(client.exists(userId)).isTrue();
        server.verify();
    }

    @Test
    void exists_단건_404는_false() {
        UUID userId = UUID.fromString("00000000-0000-0000-0000-000000000604");

        server.expect(requestTo(BASE_URL + "/internal/users/" + userId))
                .andExpect(method(HttpMethod.GET))
                .andExpect(header("X-Internal-Token", INTERNAL_TOKEN))
                .andRespond(withStatus(HttpStatus.NOT_FOUND));

        assertThat(client.exists(userId)).isFalse();
        server.verify();
    }

    private static ServiceDiscoveryClient noopDiscovery() {
        return new ServiceDiscoveryClient() {
            @Override
            public void register(String serviceName, String host, int port) {
            }

            @Override
            public void deregister(String serviceName) {
            }

            @Override
            public List<ServiceInstance> lookup(String serviceName) {
                return List.of();
            }

            @Override
            public boolean healthcheck(String serviceName) {
                return false;
            }
        };
    }

    /**
     * DefaultUserVerifier 는 timeout 적용을 위해 호출 직전에 requestFactory 를 다시 설정한다.
     * MockRestServiceServer 가 주입한 requestFactory 만 보존해 테스트가 실제 네트워크로 빠지지 않게 한다.
     */
    private static final class MockServerPreservingBuilder implements RestClient.Builder {

        private final RestClient.Builder delegate;
        private boolean mockServerFactoryInstalled;

        private MockServerPreservingBuilder(RestClient.Builder delegate) {
            this.delegate = delegate;
        }

        @Override
        public RestClient.Builder baseUrl(String baseUrl) {
            delegate.baseUrl(baseUrl);
            return this;
        }

        @Override
        public RestClient.Builder defaultUriVariables(Map<String, ?> defaultUriVariables) {
            delegate.defaultUriVariables(defaultUriVariables);
            return this;
        }

        @Override
        public RestClient.Builder uriBuilderFactory(UriBuilderFactory uriBuilderFactory) {
            delegate.uriBuilderFactory(uriBuilderFactory);
            return this;
        }

        @Override
        public RestClient.Builder defaultHeader(String header, String... values) {
            delegate.defaultHeader(header, values);
            return this;
        }

        @Override
        public RestClient.Builder defaultHeaders(Consumer<HttpHeaders> headersConsumer) {
            delegate.defaultHeaders(headersConsumer);
            return this;
        }

        @Override
        public RestClient.Builder defaultRequest(Consumer<RestClient.RequestHeadersSpec<?>> defaultRequest) {
            delegate.defaultRequest(defaultRequest);
            return this;
        }

        @Override
        public RestClient.Builder defaultStatusHandler(Predicate<HttpStatusCode> statusPredicate,
                                                       RestClient.ResponseSpec.ErrorHandler errorHandler) {
            delegate.defaultStatusHandler(statusPredicate, errorHandler);
            return this;
        }

        @Override
        public RestClient.Builder defaultStatusHandler(ResponseErrorHandler errorHandler) {
            delegate.defaultStatusHandler(errorHandler);
            return this;
        }

        @Override
        public RestClient.Builder requestInterceptor(ClientHttpRequestInterceptor interceptor) {
            delegate.requestInterceptor(interceptor);
            return this;
        }

        @Override
        public RestClient.Builder requestInterceptors(
                Consumer<List<ClientHttpRequestInterceptor>> interceptorsConsumer) {
            delegate.requestInterceptors(interceptorsConsumer);
            return this;
        }

        @Override
        public RestClient.Builder requestInitializer(ClientHttpRequestInitializer initializer) {
            delegate.requestInitializer(initializer);
            return this;
        }

        @Override
        public RestClient.Builder requestInitializers(
                Consumer<List<ClientHttpRequestInitializer>> initializersConsumer) {
            delegate.requestInitializers(initializersConsumer);
            return this;
        }

        @Override
        public RestClient.Builder requestFactory(ClientHttpRequestFactory requestFactory) {
            boolean mockFactory = requestFactory.getClass().getName().contains("MockRestServiceServer");
            if (mockFactory || !mockServerFactoryInstalled) {
                delegate.requestFactory(requestFactory);
            }
            if (mockFactory) {
                mockServerFactoryInstalled = true;
            }
            return this;
        }

        @Override
        public RestClient.Builder messageConverters(Consumer<List<HttpMessageConverter<?>>> configurer) {
            delegate.messageConverters(configurer);
            return this;
        }

        @Override
        public RestClient.Builder observationRegistry(ObservationRegistry observationRegistry) {
            delegate.observationRegistry(observationRegistry);
            return this;
        }

        @Override
        public RestClient.Builder observationConvention(
                ClientRequestObservationConvention observationConvention) {
            delegate.observationConvention(observationConvention);
            return this;
        }

        @Override
        public RestClient.Builder apply(Consumer<RestClient.Builder> builderConsumer) {
            builderConsumer.accept(this);
            return this;
        }

        @Override
        public RestClient.Builder clone() {
            return new MockServerPreservingBuilder(delegate.clone());
        }

        @Override
        public RestClient build() {
            return delegate.build();
        }
    }
}
