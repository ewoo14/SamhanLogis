package com.samhanair.logis.partnerorder.vendor.client;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.security.InternalAuthProperties;
import java.util.Optional;
import java.util.UUID;
import java.lang.reflect.Field;
import java.lang.reflect.Proxy;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient.Builder;
import org.springframework.web.client.RestClient;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.mockito.Mockito.verify;
import static org.mockito.ArgumentMatchers.any;
import org.springframework.http.client.ClientHttpRequestFactory;
import org.mockito.ArgumentCaptor;
import static org.mockito.Mockito.RETURNS_SELF;

/**
 * PartnerLookupClient (vendor) RestClient 계약테스트 — partner-service 실 수신 DTO
 * ({@code PartnerInternalResponse}: partnerId/partnerCode/name/bizNo/creditLimit/
 * outstandingBalance/status) 기준. {@code @MockBean} 우회 없이 실 JSON 파싱 경로를 검증한다.
 *
 * <p>PR #746(#22) 라운드1 fix — {@code businessNo}/{@code businessRegistrationNumber} 등
 * partner-service 응답에 실제로 존재하지 않는 별칭 키만으로 businessNo 를 찾던 구현은 항상 null
 * 을 반환했다. {@link com.samhanair.logis.partnerorder.service.TutorialStateService} 가
 * partnerCode → bizNo 해소에 본 client 를 그대로 사용하므로 직접 연쇄 영향을 받는다.
 */
class PartnerLookupClientTest {

    private static final String TOKEN = "test-internal-token";
    private static final String PARTNER_CODE = "P-2026-0001";
    private static final String LOOKUP_ENDPOINT =
            "http://partner-service/internal/partners/" + PARTNER_CODE;

    private MockRestServiceServer server;
    private PartnerLookupClient client;

    @BeforeEach
    void setUp() {
        RestClient.Builder delegate = RestClient.builder();
        server = MockRestServiceServer.bindTo(delegate).build();
        client = new PartnerLookupClient(mockBoundBuilder(delegate), props(TOKEN), new ObjectMapper());
    }

    @Test
    void findByPartnerCode_실_PartnerInternalResponse_bizNo_필드를_businessNo로_파싱한다() {
        server.expect(requestTo(LOOKUP_ENDPOINT))
                .andExpect(method(HttpMethod.GET))
                .andExpect(header("X-Internal-Token", TOKEN))
                .andRespond(withSuccess("""
                        {"success":true,"data":{
                            "partnerId":"%s",
                            "partnerCode":"%s",
                            "name":"(주)테스트거래처",
                            "bizNo":"111-22-33333",
                            "creditLimit":5000000,
                            "outstandingBalance":0,
                            "status":"ACTIVE"
                        }}
                        """.formatted(UUID.randomUUID(), PARTNER_CODE), MediaType.APPLICATION_JSON));

        Optional<PartnerSummary> result = client.findByPartnerCode(PARTNER_CODE);

        assertThat(result).isPresent();
        assertThat(result.get().partnerCode()).isEqualTo(PARTNER_CODE);
        assertThat(result.get().name()).isEqualTo("(주)테스트거래처");
        assertThat(result.get().businessNo()).isEqualTo("111-22-33333");
        server.verify();
    }

    @Test
    void findByPartnerCode_acceptsOpaquePartnerId() {
        server.expect(requestTo(LOOKUP_ENDPOINT))
                .andRespond(withSuccess("""
                        {"success":true,"data":{"partnerId":"AAAAAAAAAAAAAAAAAAAAAA",
                        "partnerCode":"P-2026-0001","name":"테스트","bizNo":"111-22-33333"}}
                        """, MediaType.APPLICATION_JSON));

        assertThat(client.findByPartnerCode(PARTNER_CODE)).get().satisfies(result ->
                assertThat(result.partnerId()).isEqualTo(UUID.fromString("00000000-0000-0000-0000-000000000000")));
        server.verify();
    }

    @Test
    void findByPartnerCode_404면_empty를_반환한다() {
        server.expect(requestTo(LOOKUP_ENDPOINT))
                .andExpect(method(HttpMethod.GET))
                .andRespond(withStatus(HttpStatus.NOT_FOUND));

        assertThat(client.findByPartnerCode(PARTNER_CODE)).isEmpty();
        server.verify();
    }

    @Test
    void findByPartnerCode_blank_토큰이면_HTTP_호출없이_empty를_반환한다() {
        RestClient.Builder builder = RestClient.builder();
        MockRestServiceServer blankServer = MockRestServiceServer.bindTo(builder).build();
        PartnerLookupClient blankClient = new PartnerLookupClient(mockBoundBuilder(builder), props(" "),
                new ObjectMapper());

        // 등록된 expectation 없음 — 본 client 는 fail-soft 이므로 blank token 이면 예외 없이 empty 만
        // 반환해야 하고, HTTP 호출은 실제 시도되지 않아야 한다(시도 시 MockRestServiceServer 가
        // AssertionError 로 노출).
        assertThat(blankClient.findByPartnerCode(PARTNER_CODE)).isEmpty();
        blankServer.verify();
    }

    @Test
    void identityClient_uses_bounded_connect_and_read_timeouts() throws Exception {
        Builder builder = mock(Builder.class, RETURNS_SELF);
        when(builder.clone()).thenReturn(builder);
        when(builder.build()).thenReturn(RestClient.builder().build());

        new PartnerLookupClient(builder, props(TOKEN), new ObjectMapper());

        ArgumentCaptor<ClientHttpRequestFactory> factoryCaptor =
                ArgumentCaptor.forClass(ClientHttpRequestFactory.class);
        verify(builder).requestFactory(factoryCaptor.capture());
        assertThat(factoryCaptor.getValue()).isInstanceOf(SimpleClientHttpRequestFactory.class);
        SimpleClientHttpRequestFactory factory = (SimpleClientHttpRequestFactory) factoryCaptor.getValue();
        assertThat(readTimeout(factory, "connectTimeout")).isEqualTo(2000);
        assertThat(readTimeout(factory, "readTimeout")).isEqualTo(5000);
    }

    private static int readTimeout(SimpleClientHttpRequestFactory factory, String fieldName)
            throws ReflectiveOperationException {
        Field field = SimpleClientHttpRequestFactory.class.getDeclaredField(fieldName);
        field.setAccessible(true);
        return field.getInt(factory);
    }

    /** MockRestServiceServer 바인딩을 보존하면서 실제 빌더의 timeout factory는 캡처한다. */
    private static RestClient.Builder mockBoundBuilder(RestClient.Builder delegate) {
        return (RestClient.Builder) Proxy.newProxyInstance(
                RestClient.Builder.class.getClassLoader(),
                new Class<?>[]{RestClient.Builder.class},
                (proxy, method, args) -> {
                    if ("clone".equals(method.getName()) && method.getParameterCount() == 0) {
                        return proxy;
                    }
                    if ("requestFactory".equals(method.getName()) && method.getParameterCount() == 1) {
                        return proxy;
                    }
                    Object result = method.invoke(delegate, args == null ? new Object[0] : args);
                    return result == delegate ? proxy : result;
                });
    }

    private static InternalAuthProperties props(String token) {
        InternalAuthProperties props = new InternalAuthProperties();
        props.setToken(token);
        return props;
    }
}
