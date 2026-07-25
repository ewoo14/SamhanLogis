package com.samhanair.logis.accounting.web;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.accounting.client.PartnerLookupClient;
import com.samhanair.logis.accounting.web.dto.JournalPartnerSearchResponse;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.security.InternalAuthProperties;
import java.util.List;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

/**
 * #831 R-4 — 분개 작성 폼 거래처 검색이 partner-service UNAVAILABLE 을 "200 + 빈 배열"로
 * 위장하지 않는지 검증한다.
 *
 * <p>라이브 실측: partner-service 장애 중 {@code GET /accounting/partners/search?q=한국} 이
 * HTTP 200 {@code {"success":true,"data":[]}} 를 반환했다(동시각 로그: directory 호출 실패).
 * 복구 후 동일 질의는 2건을 반환했다 — 사용자가 실존 거래처를 미등록으로 오인해 거래처 없는
 * 분개를 저장하게 되는 유일한 경로다. directory 소비처 4곳 중 이 컨트롤러만 legacy
 * {@code searchDirectory}(UNAVAILABLE→{@code List.of()} 로 삼킴)를 썼다.
 *
 * <p>{@link PartnerLookupClient} 는 Mockito mock 이 아니라 실 client 를
 * {@link MockRestServiceServer} 에 바인딩해 5xx 를 실제로 흘려보낸다 — client mock 은 UNAVAILABLE
 * 표현 자체를 우회해버리는 false-green 함정이 있다(같은 PR 의 다른 회귀 가드와 동일 원칙).
 */
class AccountingPartnerSearchControllerTest {

    private static PartnerLookupClient client(RestClient.Builder builder) {
        InternalAuthProperties props = new InternalAuthProperties();
        props.setToken("test-token");
        return new PartnerLookupClient(builder.baseUrl("http://partner-service").build(), props, new ObjectMapper());
    }

    @Test
    @DisplayName("search — partner-service 장애(UNAVAILABLE) 시 \"200 + 빈 배열\"로 위장하지 않고 "
            + "일시장애 오류(502)로 표면화한다 (#831 R-4)")
    void searchDoesNotDisguiseUnavailableAsEmptySuccess() {
        RestClient.Builder builder = RestClient.builder();
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        PartnerLookupClient client = client(builder);
        server.expect(requestTo(
                        "http://partner-service/internal/partners/list?q=%ED%95%9C%EA%B5%AD&limit=20&page=0"))
                .andExpect(method(HttpMethod.GET))
                .andRespond(withStatus(HttpStatus.SERVICE_UNAVAILABLE));

        AccountingPartnerSearchController controller = new AccountingPartnerSearchController(client);

        // 라이브 실측: 오늘 코드는 여기서 예외 없이 ApiResponse.ok(List.of()) 를 반환한다(RED).
        assertThatThrownBy(() -> controller.search("한국", 20))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.PARTNER_IDENTITY_LOOKUP_UNAVAILABLE));
        server.verify();
    }

    @Test
    @DisplayName("search — 정상 응답인데 매칭이 진짜 없으면(NOT_FOUND) 여전히 200 + 빈 배열이다 (#831 R-4 무회귀)")
    void searchStillReturnsEmptyListForGenuineNoMatch() {
        RestClient.Builder builder = RestClient.builder();
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        PartnerLookupClient client = client(builder);
        server.expect(requestTo(
                        "http://partner-service/internal/partners/list?q=%EC%97%86%EB%8A%94%EA%B1%B0%EB%9E%98%EC%B2%98&limit=20&page=0"))
                .andExpect(method(HttpMethod.GET))
                .andRespond(withSuccess("""
                        {"success":true,"data":[]}
                        """, MediaType.APPLICATION_JSON));

        AccountingPartnerSearchController controller = new AccountingPartnerSearchController(client);

        List<JournalPartnerSearchResponse> rows = controller.search("없는거래처", 20).getData();

        assertThat(rows).isEmpty();
        server.verify();
    }

    @Test
    @DisplayName("search — 정상 동작 무회귀: 실존 거래처는 여전히 결과를 반환한다")
    void searchStillReturnsMatchesWhenPartnerServiceIsHealthy() {
        RestClient.Builder builder = RestClient.builder();
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        PartnerLookupClient client = client(builder);
        server.expect(requestTo(
                        "http://partner-service/internal/partners/list?q=%ED%95%9C%EA%B5%AD&limit=20&page=0"))
                .andExpect(method(HttpMethod.GET))
                .andRespond(withSuccess("""
                        {"success":true,"data":[
                            {"partnerId":"11111111-1111-1111-1111-111111111111","partnerCode":"P-001",
                             "name":"한국공조시스템(주)","bizNo":"111-11-11111"},
                            {"partnerId":"22222222-2222-2222-2222-222222222222","partnerCode":"P-002",
                             "name":"(주)한국냉동물류","bizNo":"222-22-22222"}
                        ]}
                        """, MediaType.APPLICATION_JSON));

        AccountingPartnerSearchController controller = new AccountingPartnerSearchController(client);

        List<JournalPartnerSearchResponse> rows = controller.search("한국", 20).getData();

        assertThat(rows).hasSize(2);
        assertThat(rows).extracting(JournalPartnerSearchResponse::name)
                .containsExactlyInAnyOrder("한국공조시스템(주)", "(주)한국냉동물류");
        server.verify();
    }
}
