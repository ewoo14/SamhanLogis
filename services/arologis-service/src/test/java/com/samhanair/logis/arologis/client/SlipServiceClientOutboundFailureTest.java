package com.samhanair.logis.arologis.client;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.LocalDate;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

/** outbound endpoint HTTP 실패가 빈 목록으로 숨겨지지 않는지 검증한다. */
class SlipServiceClientOutboundFailureTest {

    @Test
    void deliveryAddress_contract_isMappedToRegionAddress() {
        RestClient.Builder builder = RestClient.builder();
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        server.expect(requestTo("http://slip.test/internal/slips/outbound?from=2026-06-08&to=2026-06-08"))
                .andRespond(withSuccess(
                        "{\"success\":true,\"data\":[{\"slipNo\":\"S-1\",\"partnerCode\":\"P-1\","
                                + "\"partnerName\":\"거래처\",\"deliveryAddress\":\"서울 주소\"}]}",
                        org.springframework.http.MediaType.APPLICATION_JSON));

        SlipServiceClient client = new SlipServiceClient(
                builder, new ObjectMapper(), "http://slip.test", "internal-token", false);

        assertThat(client.getOutboundSlips(
                LocalDate.of(2026, 6, 8), LocalDate.of(2026, 6, 8)))
                .singleElement()
                .extracting(SlipServiceClient.OutboundSlipSummary::address)
                .isEqualTo("서울 주소");
        server.verify();
    }

    @Test
    void notFound_isVisibleAsFailure() {
        RestClient.Builder builder = RestClient.builder();
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        server.expect(requestTo("http://slip.test/internal/slips/outbound?from=2026-06-08&to=2026-06-08"))
                .andRespond(withStatus(HttpStatus.NOT_FOUND));

        SlipServiceClient client = new SlipServiceClient(
                builder, new ObjectMapper(), "http://slip.test", "internal-token", false);

        assertThatThrownBy(() -> client.getOutboundSlips(
                LocalDate.of(2026, 6, 8), LocalDate.of(2026, 6, 8)))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("HTTP 404");
        server.verify();
    }
}
