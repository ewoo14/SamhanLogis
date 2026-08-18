package com.samhanair.logis.accounting.client;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.content;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.security.InternalAuthProperties;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

class SlipServiceClientTest {

    private static final String TOKEN = "test-token";

    private MockRestServiceServer server;
    private SlipServiceClient client;

    @BeforeEach
    void setUp() {
        RestClient.Builder builder = RestClient.builder();
        server = MockRestServiceServer.bindTo(builder).build();
        InternalAuthProperties props = new InternalAuthProperties();
        props.setToken(TOKEN);
        client = new SlipServiceClient(builder, props, "http://slip-service");
    }

    @Test
    void lockByPeriod_내부경로_토큰_startDate_endDate_body로_호출하고_lockedCount를_파싱한다() {
        server.expect(requestTo("http://slip-service/internal/slips/lock-by-period"))
                .andExpect(method(HttpMethod.POST))
                .andExpect(header("X-Internal-Token", TOKEN))
                .andExpect(content().contentType(MediaType.APPLICATION_JSON))
                .andExpect(content().json("""
                        {
                          "startDate": "2026-05-01",
                          "endDate": "2026-05-31"
                        }
                        """, true))
                .andRespond(withSuccess("""
                        {
                          "success": true,
                          "data": {
                            "startDate": "2026-05-01",
                            "endDate": "2026-05-31",
                            "status": "CONFIRMED",
                            "lockedCount": 3
                          }
                        }
                        """, MediaType.APPLICATION_JSON));

        int lockedCount = client.lockByPeriod(LocalDate.of(2026, 5, 1), LocalDate.of(2026, 5, 31));

        assertThat(lockedCount).isEqualTo(3);
        server.verify();
    }

    @Test
    void lockByPeriod_4xx는_CONFLICT로_매핑한다() {
        server.expect(requestTo("http://slip-service/internal/slips/lock-by-period"))
                .andExpect(method(HttpMethod.POST))
                .andExpect(header("X-Internal-Token", TOKEN))
                .andRespond(withStatus(HttpStatus.FORBIDDEN));

        assertThatThrownBy(() -> client.lockByPeriod(LocalDate.of(2026, 5, 1), LocalDate.of(2026, 5, 31)))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.CONFLICT));
        server.verify();
    }

    @Test
    void lockByPeriod_5xx는_INTERNAL_ERROR로_매핑한다() {
        server.expect(requestTo("http://slip-service/internal/slips/lock-by-period"))
                .andExpect(method(HttpMethod.POST))
                .andExpect(header("X-Internal-Token", TOKEN))
                .andRespond(withStatus(HttpStatus.INTERNAL_SERVER_ERROR));

        assertThatThrownBy(() -> client.lockByPeriod(LocalDate.of(2026, 5, 1), LocalDate.of(2026, 5, 31)))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.INTERNAL_ERROR));
        server.verify();
    }

    @Test
    void getSlipLine_401_403은_FORBIDDEN으로_매핑() {
        UUID lineId = UUID.randomUUID();
        server.expect(requestTo("http://slip-service/internal/slips/lines/" + lineId))
                .andExpect(method(HttpMethod.GET))
                .andExpect(header("X-Internal-Token", TOKEN))
                .andRespond(withStatus(HttpStatus.FORBIDDEN));

        assertThatThrownBy(() -> client.getSlipLine(lineId))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.FORBIDDEN));
        server.verify();
    }

    @Test
    void getSlipLine_404는_SAS_SOURCE_SLIP_NOT_FOUND로_매핑() {
        UUID lineId = UUID.randomUUID();
        server.expect(requestTo("http://slip-service/internal/slips/lines/" + lineId))
                .andRespond(withStatus(HttpStatus.NOT_FOUND));

        assertThatThrownBy(() -> client.getSlipLine(lineId))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.SAS_SOURCE_SLIP_NOT_FOUND));
        server.verify();
    }

    @Test
    void getSlipLine_기타4xx는_INVALID_INPUT으로_매핑() {
        UUID lineId = UUID.randomUUID();
        server.expect(requestTo("http://slip-service/internal/slips/lines/" + lineId))
                .andRespond(withStatus(HttpStatus.BAD_REQUEST));

        assertThatThrownBy(() -> client.getSlipLine(lineId))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.INVALID_INPUT));
        server.verify();
    }

    @Test
    void getSlipLine_200은_partnerId까지_역직렬화() {
        UUID slipId = UUID.randomUUID();
        UUID lineId = UUID.randomUUID();
        UUID partnerId = UUID.randomUUID();
        server.expect(requestTo("http://slip-service/internal/slips/lines/" + lineId))
                .andExpect(method(HttpMethod.GET))
                .andExpect(header("X-Internal-Token", TOKEN))
                .andRespond(withSuccess("""
                        {
                          "slipId": "%s",
                          "slipNo": "OUT-2026-05-0042",
                          "lineId": "%s",
                          "partnerId": "%s",
                          "partnerCode": "P-SNAPSHOT-001",
                          "partnerName": "스냅샷 거래처",
                          "productName": "P",
                          "quantity": 10,
                          "unitPrice": 150000,
                          "lineTotal": 1500000,
                          "slipStatus": "CONFIRMED",
                          "slipType": "OUTBOUND"
                        }
                        """.formatted(slipId, lineId, partnerId), MediaType.APPLICATION_JSON));

        SlipLineSnapshot snapshot = client.getSlipLine(lineId);

        assertThat(snapshot.partnerId()).isEqualTo(partnerId);
        assertThat(snapshot.partnerCode()).isEqualTo("P-SNAPSHOT-001");
        assertThat(snapshot.partnerName()).isEqualTo("스냅샷 거래처");
        assertThat(snapshot.slipType()).isEqualTo("OUTBOUND");
        server.verify();
    }

    @Test
    void getSlipLine_legacy응답의_partnerCode_partnerName_누락은_null로_파싱한다() {
        UUID lineId = UUID.randomUUID();
        UUID partnerId = UUID.randomUUID();
        server.expect(requestTo("http://slip-service/internal/slips/lines/" + lineId))
                .andRespond(withSuccess("""
                        {
                          "slipId": "%s",
                          "slipNo": "OUT-2026-05-0042",
                          "lineId": "%s",
                          "partnerId": "%s",
                          "productName": "P",
                          "quantity": 10,
                          "unitPrice": 150000,
                          "lineTotal": 1500000,
                          "slipStatus": "CONFIRMED",
                          "slipType": "OUTBOUND"
                        }
                        """.formatted(UUID.randomUUID(), lineId, partnerId), MediaType.APPLICATION_JSON));

        SlipLineSnapshot snapshot = client.getSlipLine(lineId);

        assertThat(snapshot.partnerId()).isEqualTo(partnerId);
        assertThat(snapshot.partnerCode()).isNull();
        assertThat(snapshot.partnerName()).isNull();
        server.verify();
    }

    @Test
    void getSlipLine_producer추가필드는_무시하고_파싱한다() {
        UUID lineId = UUID.randomUUID();
        UUID partnerId = UUID.randomUUID();
        server.expect(requestTo("http://slip-service/internal/slips/lines/" + lineId))
                .andRespond(withSuccess("""
                        {
                          "slipId": "%s",
                          "slipNo": "OUT-2026-05-0042",
                          "lineId": "%s",
                          "partnerId": "%s",
                          "partnerCode": "P-UNKNOWN-FIELD",
                          "partnerName": "알 수 없는 필드 거래처",
                          "productName": "P",
                          "quantity": 10,
                          "unitPrice": 150000,
                          "lineTotal": 1500000,
                          "slipStatus": "CONFIRMED",
                          "slipType": "OUTBOUND",
                          "producerOnlyField": "rolling-safe"
                        }
                        """.formatted(UUID.randomUUID(), lineId, partnerId), MediaType.APPLICATION_JSON));

        assertThat(client.getSlipLine(lineId).partnerId()).isEqualTo(partnerId);
        server.verify();
    }

    @Test
    void getSlipLines_목록의_partnerId를_파싱한다() {
        UUID slipId = UUID.randomUUID();
        UUID lineId = UUID.randomUUID();
        UUID partnerId = UUID.randomUUID();
        server.expect(requestTo("http://slip-service/internal/slips/" + slipId + "/lines"))
                .andExpect(method(HttpMethod.GET))
                .andExpect(header("X-Internal-Token", TOKEN))
                .andRespond(withSuccess("""
                        [
                          {
                            "slipId": "%s",
                            "slipNo": "OUT-2026-05-0042",
                          "lineId": "%s",
                          "partnerId": "%s",
                          "partnerCode": "P-SNAPSHOT-LIST",
                          "partnerName": "목록 거래처",
                          "productName": "P",
                            "quantity": 10,
                            "unitPrice": 150000,
                            "lineTotal": 1500000,
                            "slipStatus": "CONFIRMED",
                            "slipType": "OUTBOUND"
                          }
                        ]
                        """.formatted(slipId, lineId, partnerId), MediaType.APPLICATION_JSON));

        List<SlipLineSnapshot> snapshots = client.getSlipLines(slipId);
        assertThat(snapshots)
                .singleElement()
                .extracting(SlipLineSnapshot::partnerId)
                .isEqualTo(partnerId);
        assertThat(snapshots)
                .singleElement()
                .extracting(SlipLineSnapshot::partnerCode, SlipLineSnapshot::partnerName)
                .containsExactly("P-SNAPSHOT-LIST", "목록 거래처");
        server.verify();
    }
}
