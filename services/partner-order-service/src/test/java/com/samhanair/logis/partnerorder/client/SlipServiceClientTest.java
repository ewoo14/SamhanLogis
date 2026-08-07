package com.samhanair.logis.partnerorder.client;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.hamcrest.Matchers.containsString;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.jsonPath;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.security.InternalAuthProperties;
import java.lang.reflect.Proxy;
import java.lang.reflect.Field;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.test.web.client.match.MockRestRequestMatchers;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.web.client.RestClient;

/**
 * SlipServiceClient — slip-service partner-order publish internal 계약 회귀 가드.
 *
 * <p>실 다운스트림 계약(SlipPublishController Javadoc L44-46): 신규=201 Created,
 * 멱등 재시도(같은 키+같은 본문)=200 OK + 기존 slipNo, 동일 키+다른 본문/race=409 Conflict
 * (GlobalExceptionHandler→ApiResponse.fail→data=null). 201/200 → published(slipNo),
 * 409 → CONFLICT, 401 → UNAUTHORIZED, 403 → FORBIDDEN, 그 외 4xx → INVALID_INPUT, 5xx → INTERNAL_ERROR.
 */
class SlipServiceClientTest {

    private static final String TOKEN = "test-token";
    private static final String INTERNAL_CALLER_ID = "00000000-0000-0000-0000-000000000000";
    private static final String SYSTEM_MASTER_HEADER = "X-Is-System-Master";
    private static final String FROM_PARTNER_ORDER =
            "http://slip-service/api/v1/slips/from-partner-order";
    private static final String FROM_ORDERS_MERGE =
            "http://slip-service/api/v1/slips/from-orders-merge";

    private MockRestServiceServer server;
    private SlipServiceClient client;
    private AtomicBoolean cloneCalled;
    private AtomicReference<SimpleClientHttpRequestFactory> capturedRequestFactory;

    @BeforeEach
    void setUp() {
        RestClient.Builder builder = RestClient.builder();
        server = MockRestServiceServer.bindTo(builder).build();

        InternalAuthProperties props = new InternalAuthProperties();
        props.setToken(TOKEN);
        cloneCalled = new AtomicBoolean();
        capturedRequestFactory = new AtomicReference<>();
        // MockRestServiceServer 바인딩은 보존하되 clone/requestFactory 호출 자체와 timeout 계약은
        // 별도 단언한다. no-op stub만 두면 builder.clone 계약이 사라져도 테스트가 녹색이 된다.
        client = new SlipServiceClient(mockBoundBuilder(builder), props);
    }

    @Test
    void constructor는_clone과_2초_connect_5초_read_timeout을_원본_builder_변이없이_적용한다()
            throws ReflectiveOperationException {
        assertThat(cloneCalled).isTrue();
        SimpleClientHttpRequestFactory requestFactory = capturedRequestFactory.get();
        assertThat(requestFactory).isNotNull();
        assertThat(readTimeout(requestFactory, "connectTimeout")).isEqualTo(2_000);
        assertThat(readTimeout(requestFactory, "readTimeout")).isEqualTo(5_000);
    }

    @Test
    void publishFromPartnerOrder_201_신규발행은_경로_헤더_바디를_검증하고_published를_반환한다() {
        server.expect(requestTo(FROM_PARTNER_ORDER))
                .andExpect(method(HttpMethod.POST))
                .andExpect(header("X-Internal-Token", TOKEN))
                .andExpect(header("X-User-Id", INTERNAL_CALLER_ID))
                .andExpect(header(SYSTEM_MASTER_HEADER, "true"))
                .andExpect(header("Idempotency-Key", "PO-CONF-P1-1"))
                .andExpect(jsonPath("$.partnerCode").value("P1"))
                .andExpect(jsonPath("$.lines[0].itemName").value("품목-1"))
                .andExpect(jsonPath("$.lines[0].quantity").value(2))
                .andRespond(withStatus(HttpStatus.CREATED)
                        .body("""
                                {"success":true,"data":{"slipNo":"SLIP-20260623-001"}}
                                """)
                        .contentType(MediaType.APPLICATION_JSON));

        SlipServiceClient.PublishResult result =
                client.publishFromPartnerOrder(payload(), "PO-CONF-P1-1");

        assertThat(result.slipNo()).isEqualTo("SLIP-20260623-001");
        assertThat(result.duplicate()).isFalse();
        server.verify();
    }

    @Test
    void publishFromPartnerOrder_200_멱등replay는_기존_slipNo로_published를_반환한다() {
        server.expect(requestTo(FROM_PARTNER_ORDER))
                .andExpect(method(HttpMethod.POST))
                .andExpect(header("X-Internal-Token", TOKEN))
                .andExpect(header("X-User-Id", INTERNAL_CALLER_ID))
                .andExpect(header(SYSTEM_MASTER_HEADER, "true"))
                .andExpect(header("Idempotency-Key", "PO-CONF-P1-1"))
                .andRespond(withSuccess("""
                        {"success":true,"data":{"slipNo":"SLIP-20260623-001"}}
                        """, MediaType.APPLICATION_JSON));

        SlipServiceClient.PublishResult result =
                client.publishFromPartnerOrder(payload(), "PO-CONF-P1-1");

        assertThat(result.slipNo()).isEqualTo("SLIP-20260623-001");
        assertThat(result.duplicate()).isFalse();
        server.verify();
    }

    @Test
    void publishFromPartnerOrder_409_충돌은_CONFLICT() {
        // 실 409 = 동일 키 다른 본문/race → ApiResponse.fail → data=null (slipNo는 message 텍스트만).
        server.expect(requestTo(FROM_PARTNER_ORDER))
                .andExpect(method(HttpMethod.POST))
                .andExpect(header("X-Internal-Token", TOKEN))
                .andExpect(header("X-User-Id", INTERNAL_CALLER_ID))
                .andExpect(header(SYSTEM_MASTER_HEADER, "true"))
                .andExpect(header("Idempotency-Key", "PO-CONF-P1-1"))
                .andRespond(withStatus(HttpStatus.CONFLICT)
                        .body("""
                                {"success":false,"code":"CONFLICT","message":"이미 다른 본문으로 발행됨(slipNo=SLIP-X)","data":null}
                                """)
                        .contentType(MediaType.APPLICATION_JSON));

        assertBusinessError(
                () -> client.publishFromPartnerOrder(payload(), "PO-CONF-P1-1"),
                ErrorCode.CONFLICT);
        server.verify();
    }

    @Test
    void publishFromPartnerOrder_401은_UNAUTHORIZED() {
        server.expect(requestTo(FROM_PARTNER_ORDER))
                .andExpect(method(HttpMethod.POST))
                .andExpect(header("X-Internal-Token", TOKEN))
                .andExpect(header("X-User-Id", INTERNAL_CALLER_ID))
                .andExpect(header(SYSTEM_MASTER_HEADER, "true"))
                .andRespond(withStatus(HttpStatus.UNAUTHORIZED));

        assertBusinessError(
                () -> client.publishFromPartnerOrder(payload(), "PO-CONF-P1-1"),
                ErrorCode.UNAUTHORIZED);
        server.verify();
    }

    @Test
    void publishFromPartnerOrder_403은_FORBIDDEN() {
        server.expect(requestTo(FROM_PARTNER_ORDER))
                .andExpect(method(HttpMethod.POST))
                .andExpect(header("X-Internal-Token", TOKEN))
                .andExpect(header("X-User-Id", INTERNAL_CALLER_ID))
                .andExpect(header(SYSTEM_MASTER_HEADER, "true"))
                .andRespond(withStatus(HttpStatus.FORBIDDEN));

        assertBusinessError(
                () -> client.publishFromPartnerOrder(payload(), "PO-CONF-P1-1"),
                ErrorCode.FORBIDDEN);
        server.verify();
    }

    @Test
    void publishFromPartnerOrder_5xx는_INTERNAL_ERROR() {
        server.expect(requestTo(FROM_PARTNER_ORDER))
                .andExpect(method(HttpMethod.POST))
                .andExpect(header("X-Internal-Token", TOKEN))
                .andExpect(header("X-User-Id", INTERNAL_CALLER_ID))
                .andExpect(header(SYSTEM_MASTER_HEADER, "true"))
                .andRespond(withStatus(HttpStatus.INTERNAL_SERVER_ERROR));

        assertBusinessError(
                () -> client.publishFromPartnerOrder(payload(), "PO-CONF-P1-1"),
                ErrorCode.INTERNAL_ERROR);
        server.verify();
    }

    @Test
    void publishFromPartnerOrder_409가_아닌_4xx는_INVALID_INPUT() {
        server.expect(requestTo(FROM_PARTNER_ORDER))
                .andExpect(method(HttpMethod.POST))
                .andExpect(header("X-Internal-Token", TOKEN))
                .andExpect(header("X-User-Id", INTERNAL_CALLER_ID))
                .andExpect(header(SYSTEM_MASTER_HEADER, "true"))
                .andRespond(withStatus(HttpStatus.BAD_REQUEST));

        assertBusinessError(
                () -> client.publishFromPartnerOrder(payload(), "PO-CONF-P1-1"),
                ErrorCode.INVALID_INPUT);
        server.verify();
    }

    @Test
    void publishFromPartnerOrder_400의_업무안내를_원문으로_보존한다() {
        String message = "세트 품목은 판매전표 라인으로 저장할 수 없습니다. 구성품으로 전개해 주세요.";
        server.expect(requestTo(FROM_PARTNER_ORDER))
                .andExpect(method(HttpMethod.POST))
                .andRespond(withStatus(HttpStatus.BAD_REQUEST)
                        .body("{\"message\":\"" + message + "\"}")
                        .contentType(MediaType.APPLICATION_JSON));

        assertThatThrownBy(() -> client.publishFromPartnerOrder(payload(), "PO-CONF-P1-1"))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining(message);
        server.verify();
    }

    @Test
    void publishFromOrdersMerge_400의_업무안내를_원문으로_보존한다() {
        String message = "세트 품목은 판매전표 라인으로 저장할 수 없습니다. 구성품으로 전개해 주세요.";
        server.expect(requestTo(FROM_ORDERS_MERGE))
                .andExpect(method(HttpMethod.POST))
                .andRespond(withStatus(HttpStatus.BAD_REQUEST)
                        .body("{\"message\":\"" + message + "\"}")
                        .contentType(MediaType.APPLICATION_JSON));

        assertThatThrownBy(() -> client.publishFromOrdersMerge(mergePayload(), "PO-MRG-20260623-1"))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining(message);
        server.verify();
    }

    @Test
    void publishFromPartnerOrder_408은_재시도_대상인_INTERNAL_ERROR() {
        // #854 R4 HIGH-B: spec D-854-06 은 408 을 transient(재시도)로 명시. 종전 매핑은 일괄 4xx 분기로
        // 흘려 INVALID_INPUT(outbox 에서 영구실패 분류)을 만들었다.
        server.expect(requestTo(FROM_PARTNER_ORDER))
                .andExpect(method(HttpMethod.POST))
                .andRespond(withStatus(HttpStatus.REQUEST_TIMEOUT));

        assertBusinessError(
                () -> client.publishFromPartnerOrder(payload(), "PO-CONF-P1-1"),
                ErrorCode.INTERNAL_ERROR);
        server.verify();
    }

    @Test
    void publishFromPartnerOrder_429는_재시도_대상인_INTERNAL_ERROR() {
        // #854 R4 HIGH-B: 레이트리밋/서킷은 복구 가능하므로 영구실패로 분류하면 안 된다.
        server.expect(requestTo(FROM_PARTNER_ORDER))
                .andExpect(method(HttpMethod.POST))
                .andRespond(withStatus(HttpStatus.TOO_MANY_REQUESTS));

        assertBusinessError(
                () -> client.publishFromPartnerOrder(payload(), "PO-CONF-P1-1"),
                ErrorCode.INTERNAL_ERROR);
        server.verify();
    }

    @Test
    void publishFromOrdersMerge_429도_동일하게_INTERNAL_ERROR로_분류된다() {
        // 동일 매핑이 두 메서드에 중복 존재 — 결함 계열 전수 sweep([[feedback_defect_family_sweep_fix]]).
        server.expect(requestTo(FROM_ORDERS_MERGE))
                .andExpect(method(HttpMethod.POST))
                .andRespond(withStatus(HttpStatus.TOO_MANY_REQUESTS));

        assertBusinessError(
                () -> client.publishFromOrdersMerge(mergePayload(), "PO-MRG-20260623-1"),
                ErrorCode.INTERNAL_ERROR);
        server.verify();
    }

    @Test
    void publishFromOrdersMerge_408도_동일하게_INTERNAL_ERROR로_분류된다() {
        // #854 R5 LOW — 계열 sweep 이 429 만 커버하고 408 은 병합 경로에서 누락돼 있었다
        // (publishFromPartnerOrder_408은_재시도_대상인_INTERNAL_ERROR 와 동일 매핑을 병합 경로에서도 확인).
        server.expect(requestTo(FROM_ORDERS_MERGE))
                .andExpect(method(HttpMethod.POST))
                .andRespond(withStatus(HttpStatus.REQUEST_TIMEOUT));

        assertBusinessError(
                () -> client.publishFromOrdersMerge(mergePayload(), "PO-MRG-20260623-1"),
                ErrorCode.INTERNAL_ERROR);
        server.verify();
    }

    @Test
    void publishFromPartnerOrder_성공인데_slipNo가_없으면_INTERNAL_ERROR() {
        server.expect(requestTo(FROM_PARTNER_ORDER))
                .andExpect(method(HttpMethod.POST))
                .andExpect(header("X-Internal-Token", TOKEN))
                .andExpect(header("X-User-Id", INTERNAL_CALLER_ID))
                .andExpect(header(SYSTEM_MASTER_HEADER, "true"))
                .andRespond(withStatus(HttpStatus.CREATED)
                        .body("""
                                {"success":true,"data":{}}
                                """)
                        .contentType(MediaType.APPLICATION_JSON));

        assertBusinessError(
                () -> client.publishFromPartnerOrder(payload(), "PO-CONF-P1-1"),
                ErrorCode.INTERNAL_ERROR);
        server.verify();
    }

    @Test
    void publishFromPartnerOrder_빈_payload는_INVALID_INPUT이고_HTTP를_호출하지_않는다() {
        assertBusinessError(
                () -> client.publishFromPartnerOrder(Map.of(), "PO-CONF-P1-1"),
                ErrorCode.INVALID_INPUT);
        server.verify();
    }

    @Test
    void publishFromPartnerOrder_blank_idempotencyKey는_INVALID_INPUT이고_HTTP를_호출하지_않는다() {
        assertBusinessError(
                () -> client.publishFromPartnerOrder(payload(), " "),
                ErrorCode.INVALID_INPUT);
        server.verify();
    }

    @Test
    void publishFromOrdersMerge_201_신규는_병합_경로에서_published를_반환한다() {
        server.expect(requestTo(FROM_ORDERS_MERGE))
                .andExpect(method(HttpMethod.POST))
                .andExpect(header("X-Internal-Token", TOKEN))
                .andExpect(header("X-User-Id", INTERNAL_CALLER_ID))
                .andExpect(header(SYSTEM_MASTER_HEADER, "true"))
                .andExpect(header("Idempotency-Key", "PO-MRG-20260623-1"))
                .andExpect(MockRestRequestMatchers.content().string(containsString("sourceOrders")))
                .andRespond(withStatus(HttpStatus.CREATED)
                        .body("""
                                {"success":true,"data":{"slipNo":"SLIP-MRG-20260623-001"}}
                                """)
                        .contentType(MediaType.APPLICATION_JSON));

        SlipServiceClient.PublishResult result =
                client.publishFromOrdersMerge(mergePayload(), "PO-MRG-20260623-1");

        assertThat(result.slipNo()).isEqualTo("SLIP-MRG-20260623-001");
        assertThat(result.duplicate()).isFalse();
        server.verify();
    }

    @Test
    void publishFromOrdersMerge_200_멱등replay는_병합_경로에서_published를_반환한다() {
        server.expect(requestTo(FROM_ORDERS_MERGE))
                .andExpect(method(HttpMethod.POST))
                .andExpect(header("X-Internal-Token", TOKEN))
                .andExpect(header("X-User-Id", INTERNAL_CALLER_ID))
                .andExpect(header(SYSTEM_MASTER_HEADER, "true"))
                .andExpect(header("Idempotency-Key", "PO-MRG-20260623-1"))
                .andRespond(withSuccess("""
                        {"success":true,"data":{"slipNo":"SLIP-MRG-20260623-001"}}
                        """, MediaType.APPLICATION_JSON));

        SlipServiceClient.PublishResult result =
                client.publishFromOrdersMerge(mergePayload(), "PO-MRG-20260623-1");

        assertThat(result.slipNo()).isEqualTo("SLIP-MRG-20260623-001");
        assertThat(result.duplicate()).isFalse();
        server.verify();
    }

    @Test
    void publishFromOrdersMerge_409_충돌은_병합_경로에서_CONFLICT() {
        server.expect(requestTo(FROM_ORDERS_MERGE))
                .andExpect(method(HttpMethod.POST))
                .andExpect(header("X-Internal-Token", TOKEN))
                .andExpect(header("X-User-Id", INTERNAL_CALLER_ID))
                .andExpect(header(SYSTEM_MASTER_HEADER, "true"))
                .andExpect(header("Idempotency-Key", "PO-MRG-20260623-1"))
                .andRespond(withStatus(HttpStatus.CONFLICT)
                        .body("""
                                {"success":false,"code":"CONFLICT","message":"병합 충돌","data":null}
                                """)
                        .contentType(MediaType.APPLICATION_JSON));

        assertBusinessError(
                () -> client.publishFromOrdersMerge(mergePayload(), "PO-MRG-20260623-1"),
                ErrorCode.CONFLICT);
        server.verify();
    }

    private static Map<String, Object> payload() {
        return Map.of(
                "partnerCode", "P1",
                "warehouseCode", "MAIN",
                "lines", List.of(Map.of(
                        "itemName", "품목-1",
                        "quantity", 2)));
    }

    private static Map<String, Object> mergePayload() {
        return Map.of(
                "sourceOrders", List.of("PO-1", "PO-2"),
                "warehouseCode", "MAIN",
                "lines", List.of(Map.of(
                        "itemName", "묶음품목",
                        "quantity", 3)));
    }

    private static void assertBusinessError(
            org.assertj.core.api.ThrowableAssert.ThrowingCallable callable,
            ErrorCode errorCode) {
        assertThatThrownBy(callable)
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(errorCode));
    }

    /**
     * MockRestServiceServer 바인딩을 보존하는 프록시 빌더.
     *
     * <p>SlipServiceClient 는 timeout 하드닝(#854)으로 {@code builder.clone().requestFactory(rf)} 를
     * 호출하는데, 이는 {@link MockRestServiceServer#bindTo}가 심어둔 mock 요청 팩토리를 실
     * {@code SimpleClientHttpRequestFactory}로 덮어써 mock 을 우회시킨다. clone/requestFactory 를
     * no-op(프록시 자신 반환)로 가로채 mock 팩토리를 유지한다(DcConfigClientTest 동일 패턴).
     */
    private RestClient.Builder mockBoundBuilder(RestClient.Builder delegate) {
        return (RestClient.Builder) Proxy.newProxyInstance(
                RestClient.Builder.class.getClassLoader(),
                new Class<?>[]{RestClient.Builder.class},
                (proxy, method, args) -> {
                    if ("clone".equals(method.getName()) && method.getParameterCount() == 0) {
                        cloneCalled.set(true);
                        return proxy;
                    }
                    if ("requestFactory".equals(method.getName()) && method.getParameterCount() == 1) {
                        capturedRequestFactory.set((SimpleClientHttpRequestFactory) args[0]);
                        return proxy;
                    }
                    Object result = method.invoke(delegate, args);
                    return result == delegate ? proxy : result;
                });
    }

    private static int readTimeout(SimpleClientHttpRequestFactory requestFactory, String fieldName)
            throws ReflectiveOperationException {
        Field field = SimpleClientHttpRequestFactory.class.getDeclaredField(fieldName);
        field.setAccessible(true);
        return field.getInt(requestFactory);
    }
}
