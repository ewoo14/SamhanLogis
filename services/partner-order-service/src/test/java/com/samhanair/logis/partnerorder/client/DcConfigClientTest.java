package com.samhanair.logis.partnerorder.client;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.allOf;
import static org.hamcrest.Matchers.containsString;
import static org.springframework.test.web.client.ExpectedCount.once;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.content;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withException;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withServerError;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import com.samhanair.logis.partnerorder.client.DcConfigClient.PriceLine;
import com.samhanair.logis.security.InternalAuthProperties;
import java.io.IOException;
import java.math.BigDecimal;
import java.lang.reflect.Proxy;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

/** dc-config-service 가격 계산 internal client 실-HTTP 계약 테스트. */
class DcConfigClientTest {

    private static final String TOKEN = "test-internal-token";
    private static final String ENDPOINT = "http://dc-config-service/internal/price-calculations";

    private MockRestServiceServer server;
    private DcConfigClient client;

    @BeforeEach
    void setUp() {
        RestClient.Builder builder = RestClient.builder();
        server = MockRestServiceServer.bindTo(builder).build();
        InternalAuthProperties props = new InternalAuthProperties();
        props.setToken(TOKEN);
        client = new DcConfigClient(mockBoundBuilder(builder), props);
    }

    @Test
    void price_calculations는_경로_헤더_요청바디를_보내고_BigDecimal_finalPrice를_정확히_파싱한다() {
        server.expect(once(), requestTo(ENDPOINT))
                .andExpect(method(HttpMethod.POST))
                .andExpect(header("X-Internal-Token", TOKEN))
                .andExpect(content().contentType(MediaType.APPLICATION_JSON))
                .andExpect(content().string(allOf(
                        containsString("\"partnerCode\":\"P-DC-001\""),
                        containsString("\"callerService\":\"partner-order-service\""),
                        containsString("\"lineId\":\"L-1\""),
                        containsString("\"modelCode\":\"AJ040RXH4BC1\""),
                        containsString("\"listPrice\":123456.78901234567890"),
                        containsString("\"category\":\"HOMEMULTI\""),
                        containsString("\"quantity\":2"),
                        containsString("\"is360\":false"),
                        containsString("\"is4Way\":false"),
                        containsString("\"is1Way\":false"),
                        containsString("\"isStand\":false"),
                        containsString("\"isDeluxe\":false"),
                        containsString("\"isFirstGrade\":false"),
                        containsString("\"hasVariableDiscount\":null"))))
                .andRespond(withSuccess("""
                        {"success":true,"code":"OK","message":"성공","data":{
                          "lines":[
                            {"lineId":"L-1","finalPrice":111111.11111111111111},
                            {"lineId":"L-2","finalPrice":"222222.22222222222222"}
                          ]
                        }}""", MediaType.APPLICATION_JSON));

        Map<String, BigDecimal> prices = client.calculatePrices("P-DC-001", List.of(
                new PriceLine("L-1", "AJ040RXH4BC1",
                        new BigDecimal("123456.78901234567890"), "HOMEMULTI", 2),
                new PriceLine("L-2", "AR07B9350HZ",
                        new BigDecimal("333333.33333333333333"), "SINGLE_SET", 1)));

        assertThat(prices).hasSize(2);
        assertThat(prices.get("L-1")).isEqualByComparingTo("111111.11111111111111");
        assertThat(prices.get("L-2")).isEqualByComparingTo("222222.22222222222222");
        server.verify();
    }

    @Test
    void 실제_품목의_옵션과_고정DC를_계산서비스에_전달한다() {
        server.expect(once(), requestTo(ENDPOINT))
                .andExpect(method(HttpMethod.POST))
                .andExpect(content().string(allOf(
                        containsString("\"lineId\":\"AM360AXVHHR1SY\""),
                        containsString("\"is360\":true"),
                        containsString("\"is4Way\":false"),
                        containsString("\"is1Way\":false"),
                        containsString("\"isStand\":false"),
                        containsString("\"isDeluxe\":false"),
                        containsString("\"isFirstGrade\":false"),
                        containsString("\"fixedDiscountRate\":45.0"))))
                .andRespond(withSuccess("""
                        {"success":true,"code":"OK","message":"성공","data":{
                          "lines":[{"lineId":"AM360AXVHHR1SY","finalPrice":15979260}]
                        }}""", MediaType.APPLICATION_JSON));

        client.calculatePrices("1068689215", List.of(new PriceLine(
                "AM360AXVHHR1SY", "AM360AXVHHR1SY", new BigDecimal("29053200"),
                "HOMEMULTI", 1, true, false, false, false, false, false,
                new BigDecimal("45.0"))));

        server.verify();
    }

    @Test
    void physical_category_code를_가격계산서비스에_전달한다() {
        server.expect(once(), requestTo(ENDPOINT))
                .andExpect(content().string(containsString("\"physicalCategoryCode\":\"HVAC\"")))
                .andRespond(withSuccess("""
                        {"success":true,"data":{"lines":[{"lineId":"ERV","finalPrice":600000}]}}
                        """, MediaType.APPLICATION_JSON));

        client.calculatePrices("P-DC-ERV", List.of(new PriceLine(
                "ERV", "ERV-001", new BigDecimal("1000000"), "HOMEMULTI", 1,
                false, false, false, false, false, false, null, true, "HVAC")));

        server.verify();
    }

    @Test
    void detailed_result는_미리보기용_실제_적용율을_가격과_함께_반환한다() {
        server.expect(once(), requestTo(ENDPOINT))
                .andRespond(withSuccess("""
                        {"success":true,"data":{"lines":[
                          {"lineId":"ERV","finalPrice":600000,"appliedRate":0.40}
                        ]}}
                        """, MediaType.APPLICATION_JSON));

        DcConfigClient.CalculationResult result = client.calculateDetailed("P-DC-ERV", List.of(
                new PriceLine("ERV", "ERV-001", new BigDecimal("1000000"), "HOMEMULTI", 1,
                        false, false, false, false, false, false, null, true, "HVAC")));

        assertThat(result.available()).isTrue();
        assertThat(result.lines().get("ERV").finalPrice()).isEqualByComparingTo("600000");
        assertThat(result.lines().get("ERV").appliedRate()).isEqualByComparingTo("0.40");
        server.verify();
    }

    @Test
    void dc_config_응답은_가격을_보정하지_않고_그대로_반환한다() {
        server.expect(once(), requestTo(ENDPOINT))
                .andRespond(withSuccess("""
                        {"success":true,"code":"OK","message":"성공","data":{
                          "lines":[
                            {"lineId":"fixed","finalPrice":15037664,"appliedRate":0.4800,"appliedFixedAmount":70000.00},
                            {"lineId":"global","finalPrice":15037664,"appliedRate":0.4800,"appliedFixedAmount":70000.00}
                          ]
                        }}""", MediaType.APPLICATION_JSON));

        Map<String, BigDecimal> prices = client.calculatePrices("1068689215", List.of(
                new PriceLine("fixed", "AM360AXVHHR1SY", new BigDecimal("29053200"),
                        "COMMERCIAL_MULTI", 1, true, false, false, false, false, false,
                        new BigDecimal("45.00")),
                new PriceLine("global", "AM360AXVHHR1SY", new BigDecimal("29053200"),
                        "COMMERCIAL_MULTI", 1, true, false, false, false, false, false, null)));

        assertThat(prices.get("fixed")).isEqualByComparingTo("15037664");
        assertThat(prices.get("global")).isEqualByComparingTo("15037664");
        server.verify();
    }

    @Test
    void envelope_success_false는_오계산을_숨기지_않고_empty_fail_soft로_반환한다() {
        server.expect(once(), requestTo(ENDPOINT))
                .andExpect(method(HttpMethod.POST))
                .andExpect(header("X-Internal-Token", TOKEN))
                .andRespond(withSuccess("""
                        {"success":false,"code":"DC_CONFIG_NOT_FOUND","message":"미설정","data":null}
                        """, MediaType.APPLICATION_JSON));

        Map<String, BigDecimal> prices = client.calculatePrices("P-DC-001", lines());

        assertThat(prices).isEmpty();
        server.verify();
    }

    @Test
    void price_calculations_5xx는_empty_fail_soft로_반환한다() {
        server.expect(once(), requestTo(ENDPOINT))
                .andExpect(method(HttpMethod.POST))
                .andExpect(header("X-Internal-Token", TOKEN))
                .andRespond(withServerError());

        Map<String, BigDecimal> prices = client.calculatePrices("P-DC-001", lines());

        assertThat(prices).isEmpty();
        server.verify();
    }

    @Test
    void price_calculations_network_error도_empty_fail_soft로_반환한다() {
        server.expect(once(), requestTo(ENDPOINT))
                .andExpect(method(HttpMethod.POST))
                .andExpect(header("X-Internal-Token", TOKEN))
                .andRespond(withException(new IOException("dc-config 연결 실패")));

        Map<String, BigDecimal> prices = client.calculatePrices("P-DC-001", lines());

        assertThat(prices).isEmpty();
        server.verify();
    }

    private List<PriceLine> lines() {
        return List.of(new PriceLine("L-1", "AJ040RXH4BC1",
                new BigDecimal("123456.78901234567890"), "HOMEMULTI", 2));
    }

    private RestClient.Builder mockBoundBuilder(RestClient.Builder delegate) {
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
                    Object result = method.invoke(delegate, args);
                    return result == delegate ? proxy : result;
                });
    }
}
